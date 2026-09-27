const assert = require("node:assert/strict");
const fs = require("node:fs");
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE ||
    "C:/Users/yuiffy/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright",
);
const { inspectPng } = require("./lib/autochess-screenshot.cjs");
const base = process.env.AUTOCHESS_BASE_URL || "http://127.0.0.1:3891";
const out = process.env.AUTOCHESS_FLOW_OUTPUT || "tmp/autochess-round-flow";
const state = (p) => p.evaluate(() => JSON.parse(window.render_game_to_text()));
const stage = (p, value) =>
  p.waitForFunction(
    (v) =>
      window.render_game_to_text &&
      JSON.parse(window.render_game_to_text()).multiplayer?.stage === v,
    value,
    { timeout: 45000 },
  );
const surface = (p, value) =>
  p.waitForFunction(
    (v) =>
      window.render_game_to_text &&
      JSON.parse(window.render_game_to_text()).phase === v,
    value,
    { timeout: 45000 },
  );
(async () => {
  assert.equal(
    (
      await fetch(base + "/game/autochess", {
        signal: AbortSignal.timeout(20000),
      })
    ).status,
    200,
  );
  fs.mkdirSync(out, { recursive: true });
  const { loadTypescriptModule } =
    await import("./tests/helpers/load-typescript-module.mjs");
  const rooms = await loadTypescriptModule(
    "src/components/autoChessGame/multiplayer/room.ts",
  );
  const rules = await loadTypescriptModule(
    "src/components/autoChessGame/multiplayer/match.ts",
  );
  const browser = await chromium.launch({
    channel: "chrome",
    headless: process.env.AUTOCHESS_HEADED !== "1",
    args: ["--mute-audio", "--disable-speech-api"],
  });
  const errors = [],
    captures = [];
  async function page(
    room,
    width = 1440,
    url = "/game/autochess?mode=multiplayer",
  ) {
    const context = await browser.newContext({
      viewport: { width, height: width < 700 ? 844 : 1000 },
    });
    await context.addInitScript((v) => {
      if (window.speechSynthesis) window.speechSynthesis.speak = () => {};
      if (v && !sessionStorage.getItem("flow-fixture")) {
        localStorage.setItem("rift-multiplayer-local-v1", JSON.stringify(v));
        sessionStorage.setItem("flow-fixture", "1");
      }
    }, room);
    const p = await context.newPage();
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("console", (e) => {
      if (e.type() === "error") errors.push(e.text());
    });
    await p.goto(base + url);
    if (room)
      await p
        .getByRole("button", { name: "恢复上次本地对局", exact: true })
        .click();
    return p;
  }
  async function capture(p, name) {
    await p.waitForTimeout(350);
    await p.waitForFunction(() => [...document.images].filter(i => {
      const r = i.getBoundingClientRect();
      return r.width && r.height && r.top < innerHeight && r.bottom > 0;
    }).every(i => i.complete && i.naturalWidth > 0));
    const file = `${out}/${name}.png`;
    const metrics = inspectPng(
      await p.screenshot({ path: file, fullPage: true }),
    );
    assert.ok(
      metrics.colors > 20 &&
        metrics.nearBlackRatio < 0.95 &&
        metrics.transparentRatio === 0,
    );
    const layout = await p.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > innerWidth + 2,
      canvas: [...document.querySelectorAll("canvas")].map((c) => [
        c.width,
        c.height,
      ]),
      dropdowns: document.querySelectorAll(".rift-match-live-bar select")
        .length,
    }));
    assert.equal(layout.overflow, false);
    assert.equal(layout.dropdowns, 0);
    assert.ok(layout.canvas[0][0] > 0);
    const result = { name, metrics, layout, state: await state(p) };
    captures.push(result);
    fs.writeFileSync(`${out}/${name}.json`, JSON.stringify(result, null, 2));
    console.log(name, result.state.multiplayer.stage);
  }
  const fixture = (mode = "coop", seats = 2) =>
    rooms.applyCommand(
      rooms.createRoom("LOCAL", "local", "本地指挥官", {
        mode,
        seats,
        aiCount: seats - 1,
        prepSeconds: 120,
        isPublic: false,
      }),
      0,
      { kind: "start" },
      927,
    );
  try {
    const localRoom = fixture();
    localRoom.match.players[0].snapshot.state.board.fill(null);
    const board = localRoom.match.players[1].snapshot.state.board;
    board.fill(null);
    ["sui_cat", "biscuit_sui", "nori"].forEach((id, i) => {
      board[i] = { id, star: 3, uid: i + 10 };
    });
    const local = await page(localRoom);
    await stage(local, "preparation");
    await local
      .getByRole("button", { name: /准备好了/ })
      .first()
      .click();
    await stage(local, "battle");
    assert.equal(
      await local
        .getByRole("button", { name: "暂停战斗", exact: true })
        .count(),
      0,
    );
    assert.equal(
      await local
        .getByRole("button", { name: "确认战报，下一轮", exact: true })
        .count(),
      0,
    );
    await capture(local, "01-shared-start");
    if (process.env.AUTOCHESS_FLOW_START_ONLY === "1") return;
    await stage(local, "battle");
    await local.waitForFunction(
      () => JSON.parse(window.render_game_to_text()).multiplayer.replayComplete,
    );
    assert.match((await state(local)).multiplayer.status, /等待.*战线/);
    await capture(local, "02-waiting-for-team");
    await local
      .getByRole("button", { name: "观战 电脑 2", exact: true })
      .click();
    assert.ok(
      (await state(local)).battle.elapsed > 0,
      "spectating catches up immediately",
    );
    await stage(local, "rescue");
    await local.waitForFunction(() => JSON.parse(window.render_game_to_text()).multiplayer.battleIndex === 2);
    assert.equal((await state(local)).multiplayer.battleIndex, 2);
    await capture(local, "03-automatic-rescue");
    await stage(local, "settlement");
    assert.equal((await state(local)).player.hp, 20);
    await capture(local, "04-settlement");
    const restBefore = await state(local);
    await local.waitForTimeout(230);
    await capture(local, "04b-celebration");
    const restAfter = await state(local);
    assert.ok(restAfter.multiplayer.visualTime > restBefore.multiplayer.visualTime + 0.2);
    assert.ok(restAfter.multiplayer.aftermath.elapsed > restBefore.multiplayer.aftermath.elapsed);
    assert.equal(restAfter.battle.elapsed, restBefore.battle.elapsed);
    assert.deepEqual(restAfter.multiplayer.players, restBefore.multiplayer.players);
    assert.equal(await local.locator('.rift-match-live-status').getByText(/秒后同时开战|秒后残兵出发/).count(),0);
    await stage(local, "preparation");
    assert.equal((await state(local)).round, 2);
    await capture(local, "05-automatic-next-round");
    // Eight live portrait buttons remain directly accessible on narrow screens.
    const mobile = await page(fixture("versus", 8), 390);
    await stage(mobile, "preparation");
    await mobile
      .getByRole("button", { name: /准备好了/ })
      .first()
      .click();
    await stage(mobile, "battle");
    assert.equal(
      await mobile.locator(".rift-match-spectators button").count(),
      8,
    );
    await mobile
      .getByRole("button", { name: "观战 电脑 8", exact: true })
      .click();
    assert.equal((await state(mobile)).multiplayer.watchedSeat, 7);
    await capture(mobile, "06-mobile-eight-players");
    await mobile.setViewportSize({ width: 320, height: 844 });
    await mobile.evaluate(() => {
      const b = window.autoChessAI.bridge;
      b.dispatch({
        type: "inspectFighter",
        fid: b.engine.state.battle.player[0].fid,
      });
    });
    const detail = await mobile.locator(".rift-battle-inspector").boundingBox(),
      bar = await mobile.locator(".rift-match-live-bar").boundingBox();
    assert.ok(
      detail.y + detail.height < bar.y,
      "spectator bar does not cover unit details",
    );
    await capture(mobile, "07-mobile-inspector");
    // Real online room, two isolated browser contexts, no stubbed API or clock.
    const host = await page();
    await surface(host, "lobby");
    await host.getByRole("button", { name: /多人混战/ }).click();
    await host.getByRole("button", { name: "在线联机", exact: true }).click();
    await host.getByLabel("你的名字", { exact: true }).fill("同步房主");
    await host.getByLabel("总人数", { exact: true }).selectOption("3");
    await host.getByLabel("电脑人数", { exact: true }).selectOption("1");
    await host
      .getByRole("button", { name: "创建在线房间", exact: true })
      .click();
    await surface(host, "room");
    const code = (await state(host)).code;
    fs.writeFileSync(`${out}/room.json`, JSON.stringify({ code }));
    const guest = await page(null, 1440, `/game/autochess?room=${code}`);
    await surface(guest, "lobby");
    await guest.getByLabel("你的名字", { exact: true }).fill("同步队友");
    await guest.getByRole("button", { name: "加入", exact: true }).click();
    await surface(guest, "room");
    await host
      .getByRole("button", { name: "全员到齐，开始对局", exact: true })
      .click();
    await Promise.all([
      stage(host, "preparation"),
      stage(guest, "preparation"),
    ]);
    await Promise.all([
      host
        .getByRole("button", { name: /准备好了/ })
        .first()
        .click(),
      guest
        .getByRole("button", { name: /准备好了/ })
        .first()
        .click(),
    ]);
    await Promise.all([stage(host, "battle"), stage(guest, "battle")]);
    const a = (await state(host)).multiplayer,
      b = (await state(guest)).multiplayer;
    assert.deepEqual(a.timeline, b.timeline);
    assert.equal(a.pairings.filter((p) => p.ghost).length, 1);
    await guest
      .getByRole("button", { name: "观战 同步房主", exact: true })
      .click();
    const [h, g] = await Promise.all([state(host), state(guest)]);
    assert.ok(
      Math.abs(h.battle.elapsed - g.battle.elapsed) < 0.8,
      "clients follow the same battle clock",
    );
    await capture(host, "08-online-synchronized");
    await guest.reload();
    await surface(guest, "lobby");
    await guest
      .getByRole("button", { name: new RegExp(`恢复.*${code}`) })
      .click();
    await guest.waitForFunction(() => {
      if (!window.render_game_to_text) return false;
      const s = JSON.parse(window.render_game_to_text());
      return ["battle", "settlement", "preparation"].includes(s.multiplayer?.stage);
    });
    const reconnected = await state(guest);
    if (reconnected.multiplayer.stage === "preparation") {
      assert.equal(reconnected.round, 2, "short battles can finish during reload");
    } else {
      assert.deepEqual(reconnected.multiplayer.timeline, a.timeline);
      assert.ok(
        reconnected.battle.elapsed > 1,
        "reconnect does not restart the battle",
      );
    }
    await capture(guest, "09-online-reconnect");
    await Promise.all([
      stage(host, "preparation"),
      stage(guest, "preparation"),
    ]);
    assert.equal((await state(host)).round, 2);
    assert.equal((await state(guest)).round, 2);
    assert.deepEqual(
      (await state(host)).multiplayer.players.map((p) => p.hp),
      (await state(guest)).multiplayer.players.map((p) => p.hp),
    );
    // Ending uses the same countdown before displaying final standings.
    const finalRoom = fixture("coop", 1);
    finalRoom.match.round = 16;
    finalRoom.match.players[0].snapshot.state.round = 16;
    finalRoom.match.players[0].snapshot.state.board.fill(null);
    finalRoom.match.players[0].hp = 1;
    finalRoom.match.players[0].snapshot.state.hp = 1;
    const final = await page(finalRoom);
    await stage(final, "preparation");
    await final
      .getByRole("button", { name: /准备好了/ })
      .first()
      .click();
    await stage(final, "settlement");
    assert.equal(
      await final.getByRole("dialog", { name: "多人房间与战报" }).count(),
      0,
    );
    await stage(final, "finished");
    await final.getByRole("dialog", { name: "多人房间与战报" }).waitFor();
    await capture(final, "10-automatic-final-result");
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      `${out}/report.json`,
      JSON.stringify({ code, errors, captures }, null, 2),
    );
    console.log(
      "Shared start, spectator seek, rescue, automatic next/final, mobile and real online reconnect passed.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
