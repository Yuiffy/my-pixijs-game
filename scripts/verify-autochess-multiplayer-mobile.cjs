const fs = require("node:fs");
const assert = require("node:assert/strict");
const {
  chromium,
} = require("C:/Users/yuiffy/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright");
const { inspectPng } = require("./lib/autochess-screenshot.cjs");
(async () => {
  const base =
    (process.env.AUTOCHESS_BASE_URL || "http://127.0.0.1:3891") +
    "/game/autochess";
  assert.equal((await fetch(base)).status, 200);
  const { loadTypescriptModule } =
    await import("./tests/helpers/load-typescript-module.mjs");
  const r = await loadTypescriptModule(
    "src/components/autoChessGame/multiplayer/room.ts",
  );
  const m = await loadTypescriptModule(
    "src/components/autoChessGame/multiplayer/match.ts",
  );
  let room = r.createRoom("LOCAL", "local", "手机验证", {
    mode: "coop",
    seats: 2,
    aiCount: 1,
    prepSeconds: 120,
    isPublic: false,
  });
  room = r.applyCommand(room, 0, { kind: "start" }, 927);
  room.match = m.nextRound(m.settleRound(room.match));
  const browser = await chromium.launch({
    channel: "chrome",
    headless: true,
    args: ["--mute-audio", "--disable-speech-api"],
  });
  const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (e) => {
    if (e.type() === "error") errors.push(e.text());
  });
  await p.addInitScript((v) => {
    if (window.speechSynthesis) window.speechSynthesis.speak = () => {};
    localStorage.setItem("rift-multiplayer-local-v1", JSON.stringify(v));
  }, room);
  async function cap(name) {
    await p.waitForTimeout(350);
    const v = await p.evaluate(() => ({
      state: JSON.parse(window.render_game_to_text()),
      canvas: [...document.querySelectorAll("canvas")].map((c) => [
        c.width,
        c.height,
      ]),
      overflow: document.documentElement.scrollWidth > innerWidth + 2,
    }));
    assert.equal(v.overflow, false);
    assert.ok(v.canvas[0][0] > 0);
    v.metrics = inspectPng(
      await p.screenshot({
        path: "tmp/autochess-native/" + name + ".png",
        fullPage: true,
      }),
    );
    assert.ok(
      v.metrics.colors > 20 &&
        v.metrics.nearBlackRatio < 0.95 &&
        v.metrics.transparentRatio === 0,
    );
    fs.writeFileSync(
      "tmp/autochess-native/" + name + ".json",
      JSON.stringify(v, null, 2),
    );
  }
  try {
    fs.mkdirSync("tmp/autochess-native", { recursive: true });
    await p.goto(base);
    await p.getByRole("link", { name: "多人模式beta", exact: true }).waitFor();
    await cap("18a-mobile-classic-entry");
    await p.getByRole("link", { name: "多人模式beta", exact: true }).click();
    await p
      .getByRole("button", { name: "恢复上次本地对局", exact: true })
      .click();
    await p.getByRole("button", { name: "房间 / 战报", exact: true }).click();
    assert.equal(await p.locator(".rift-match-battles").count(), 0);
    await cap("18-mobile-prep-report");
    await p.getByRole("button", { name: "关闭房间面板", exact: true }).click();
    await p
      .getByRole("button", { name: "准备好了 SPACE", exact: true })
      .click();
    await p.getByRole("navigation", { name: "点击玩家头像观战" }).waitFor();
    assert.equal(await p.getByRole("button", { name: "暂停战斗", exact: true }).count(), 0);
    await cap("19-mobile-battle");
    await p.evaluate(() => {
      const b = window.autoChessAI.bridge;
      b.dispatch({
        type: "inspectFighter",
        fid: b.engine.state.battle.player[0].fid,
      });
    });
    await cap("20-mobile-inspector");
    const details = await p.locator(".rift-battle-inspector").boundingBox(),
      bar = await p.locator(".rift-match-live-bar").boundingBox();
    assert.ok(
      details.y + details.height < bar.y,
      "replay controls must not obscure fighter details",
    );
    await p.getByRole("button", { name: "关闭角色战况", exact: true }).click();
    await p.setViewportSize({ width: 320, height: 844 });
    await p.getByRole("button", { name: "查看统计", exact: true }).click();
    await cap("21-mobile-statistics");
    assert.deepEqual(errors, []);
    console.log(
      "Mobile classic beta entry, preparation, replay and detail controls verified.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
