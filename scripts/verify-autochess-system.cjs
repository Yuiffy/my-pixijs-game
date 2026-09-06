const assert = require("node:assert/strict");
const { existsSync, mkdirSync, writeFileSync } = require("node:fs");
const { createRequire } = require("node:module");
const { inspectPng } = require("./lib/autochess-screenshot.cjs");

const localRequire = createRequire(__filename);
const candidates = [
  process.env.PLAYWRIGHT_MODULE,
  "playwright",
  "C:/Users/yuiffy/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright",
  "C:/Users/apple/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright",
].filter(Boolean);
const loadPlaywright = () => {
  for (const candidate of candidates) {
    try {
      if (candidate.includes("/") && !existsSync(candidate)) continue;
      return localRequire(candidate);
    } catch { /* Try the next installed runtime. */ }
  }
  throw new Error("Playwright unavailable; set PLAYWRIGHT_MODULE");
};
const { chromium } = loadPlaywright();
const baseUrl = process.env.AUTOCHESS_BASE_URL || "http://127.0.0.1:3810";
const directory = ".tmp/autochess/system";
mkdirSync(directory, { recursive: true });

(async () => {
  const readyResponse = await fetch(`${baseUrl}/game/autochess`);
  assert.ok(readyResponse.ok, `HTTP ${readyResponse.status}`);
  const browser = await chromium.launch({ channel: "chrome", headless: process.env.AUTOCHESS_HEADED !== "1" });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, hasTouch: true });
    const errors = [];
    const failures = [];
    const screenshots = {};
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    page.on("response", response => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
    const ready = () => page.waitForFunction(() => Boolean(window.autoChessAI?.bridge && document.querySelector("canvas")?.width));
    const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
    const engineSnapshot = () => page.evaluate(() => window.autoChessAI.bridge.engine.getSimulationSnapshot());
    const blur = () => page.evaluate(() => document.activeElement?.blur());
    const capture = async name => {
      await page.waitForTimeout(180);
      const path = `${directory}/${name}.png`;
      screenshots[name] = { path, ...inspectPng(await page.screenshot({ path, fullPage: true })) };
      const layout = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth - innerWidth,
        canvasCount: document.querySelectorAll("canvas").length,
        width: document.querySelector("canvas")?.width,
        height: document.querySelector("canvas")?.height,
      }));
      assert.ok(layout.overflow <= 1, `${name}: horizontal overflow`);
      assert.equal(layout.canvasCount, 1);
      assert.ok(layout.width > 0 && layout.height > 0);
    };
    const reload = async () => { await page.reload(); await ready(); };
    const resume = async () => {
      await page.getByRole("button", { name: "继续远征", exact: true }).click();
      await page.waitForFunction(() => window.autoChessAI.bridge.engine.state.phase !== "title");
    };
    await page.goto(`${baseUrl}/game/autochess?seed=90616`);
    await ready();
    await page.locator(".rift-dom-choice").first().click();
    await page.locator("button.rift-dom-shop-card:not(:disabled)").first().click();
    await blur();
    await page.keyboard.press("l");
    const before = await engineSnapshot();
    await reload();
    assert.equal((await state()).interface.savedRun.phase, "preparation");
    await capture("desktop-resume");
    await resume();
    const after = await engineSnapshot();
    for (const key of ["gold", "board", "bench", "shop", "shopLocked", "seed", "enemySeed", "score"]) assert.deepEqual(after.state[key], before.state[key], key);
    for (const key of ["uid", "randomState", "shopRandomState", "shopSequenceCounts"]) assert.deepEqual(after[key], before[key], key);

    await page.getByRole("button", { name: "阵容羁绊", exact: true }).click();
    await page.getByLabel("全部羁绊", { exact: true }).check();
    const mystic = page.locator(".rift-trait-planner details").filter({ has: page.locator("summary strong", { hasText: "杂谈" }) });
    await mystic.locator("summary").click();
    assert.equal(await mystic.locator("li").count(), 16);
    await capture("desktop-trait-planner");
    await page.getByRole("button", { name: "关闭面板", exact: true }).click();

    await page.setViewportSize({ width: 390, height: 844 });
    await reload();
    await capture("mobile-resume");
    await resume();
    await capture("mobile-restored-preparation");
    await page.getByRole("button", { name: "查看羁绊" }).click();
    await page.locator(".rift-trait-planner summary").first().click();
    await capture("mobile-trait-planner");
    await page.getByRole("button", { name: "关闭面板", exact: true }).click();

    await page.evaluate(() => {
      const bridge = window.autoChessAI.bridge;
      bridge.engine.state.round = 2;
      bridge.engine.state.board.find(Boolean).star = 3;
      bridge.dispatch({ type: "clearSelection" });
    });
    await page.getByRole("button", { name: "开战 SPACE", exact: true }).click();
    await page.getByRole("button", { name: "暂停战斗", exact: true }).click();
    await capture("mobile-battle");
    const point = await page.evaluate(() => {
      const host = document.querySelector("canvas").parentElement;
      let fiber = host[Object.keys(host).find(key => key.startsWith("__reactFiber$"))];
      let game;
      while (fiber && !game) {
        for (let hook = fiber.memoizedState; hook; hook = hook.next) {
          if (hook.memoizedState?.current?.scene?.getScene) game = hook.memoizedState.current;
        }
        fiber = fiber.return;
      }
      const scene = game.scene.getScene("RiftLineScene");
      const fid = window.autoChessAI.bridge.engine.state.battle.player[0].fid;
      const view = scene.fighterViews.get(fid);
      const world = view.getWorldTransformMatrix().transformPoint(0, 0);
      const camera = scene.cameras.main;
      const screen = camera.matrix.transformPoint(world.x, world.y);
      const rect = game.canvas.getBoundingClientRect();
      return { fid, x: rect.left + screen.x * rect.width / game.canvas.width, y: rect.top + screen.y * rect.height / game.canvas.height };
    });
    await page.touchscreen.tap(point.x, point.y);
    await page.locator(".rift-battle-inspector").waitFor();
    assert.equal(await page.locator(".rift-battle-inspector").getAttribute("data-fighter-id"), point.fid);
    await page.locator(".rift-battle-inspector summary").click();
    await capture("mobile-battle-inspector");
    await page.setViewportSize({ width: 768, height: 1024 });
    await capture("tablet-battle-inspector");
    await page.keyboard.press("Escape");
    assert.equal(await page.locator(".rift-battle-inspector").count(), 0);

    await page.setViewportSize({ width: 390, height: 844 });
    await reload();
    assert.equal((await state()).interface.savedRun.phase, "battle");
    await resume();
    assert.equal((await engineSnapshot()).state.battle.elapsed, 0);
    assert.equal((await state()).interface.battlePaused, true);
    await page.getByRole("button", { name: "快速结算当前战斗", exact: true }).click();
    const result = await engineSnapshot();
    assert.equal(result.state.phase, "result");
    await reload();
    await resume();
    assert.deepEqual((await engineSnapshot()).state.result, result.state.result);
    assert.equal((await engineSnapshot()).state.gold, result.state.gold);
    await capture("mobile-restored-result");
    await blur();
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => window.autoChessAI.bridge.engine.state.phase === "augment");
    const choices = (await engineSnapshot()).state.augmentChoices;
    await reload();
    await resume();
    assert.deepEqual((await engineSnapshot()).state.augmentChoices, choices);
    await page.locator(".rift-mobile-augment-option").first().waitFor({ state: "visible" });
    assert.equal(await page.locator(".rift-mobile-augment-option:visible").count(), choices.length);
    await capture("mobile-restored-augment");
    await page.locator(".rift-mobile-augment-option").first().click();
    assert.equal((await state()).round, 3);
    assert.equal((await state()).phase, "preparation");

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(() => window.autoChessAI.bridge.dispatch({ type: "restart" }));
    await page.locator(".rift-dom-choice").first().click();
    await page.evaluate(() => {
      const bridge = window.autoChessAI.bridge;
      bridge.engine.state.round = 16;
      bridge.engine.state.hp = 20;
      bridge.dispatch({ type: "battle" });
      bridge.dispatch({ type: "skipBattle" });
    });
    assert.equal((await state()).result.won, false);
    assert.ok((await state()).player.hp > 0);
    await capture("desktop-boss-loss");
    await blur();
    await page.keyboard.press("Enter");
    assert.equal((await state()).phase, "gameover");
    assert.equal((await state()).round, 16);
    assert.equal((await state()).campaignCleared, false);
    await capture("desktop-campaign-failed");
    assert.equal(await page.evaluate(() => localStorage.getItem("rift-line-active-run")), null);
    await reload();
    assert.equal((await state()).interface.savedRun, null);
    await page.evaluate(() => localStorage.setItem("rift-line-active-run", "{broken"));
    await reload();
    assert.equal((await state()).interface.saveIssue, "invalid");
    await page.locator(".rift-dom-choice").first().click();
    assert.equal((await state()).phase, "preparation");
    assert.equal((await state()).interface.saveIssue, null);
    assert.deepEqual(errors, []);
    assert.deepEqual(failures, []);
    const report = { screenshots, errors, failures, stages: ["preparation-save", "battle-restart", "result-save", "augment-save", "boss-loss", "invalid-save", "trait-planner", "fighter-inspection"] };
    writeFileSync(`${directory}/report.json`, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
