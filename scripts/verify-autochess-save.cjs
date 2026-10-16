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
const baseUrl = process.env.AUTOCHESS_BASE_URL || "http://127.0.0.1:4110";
const directory = process.env.AUTOCHESS_SAVE_ARTIFACTS || ".tmp/autochess/save";
mkdirSync(directory, { recursive: true });

(async () => {
  const response = await fetch(`${baseUrl}/game/autochess`);
  assert.ok(response.ok, `HTTP ${response.status}`);
  const browser = await chromium.launch({
    channel: "chrome", headless: process.env.AUTOCHESS_HEADED !== "1", args: ["--mute-audio"],
  });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addInitScript(() => {
      if (window.speechSynthesis) window.speechSynthesis.speak = () => {};
    });
    const page = await context.newPage();
    const errors = [];
    const failures = [];
    const screenshots = {};
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    page.on("response", res => { if (res.status() >= 400) failures.push(`${res.status()} ${res.url()}`); });
    const ready = () => page.waitForFunction(() => Boolean(
      window.autoChessAI?.bridge && window.render_game_to_text
      && document.querySelector('[data-game-canvas="rift-line"]')?.width,
    ), undefined, { timeout: 60_000 });
    const snapshot = () => page.evaluate(() => window.autoChessAI.bridge.engine.getSimulationSnapshot());
    const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
    const reload = async () => { await page.reload(); await ready(); };
    const resume = async () => {
      await page.getByRole("button", { name: "继续远征", exact: true }).click();
      await page.waitForFunction(() => window.autoChessAI.bridge.engine.state.phase !== "title");
    };
    const capture = async name => {
      await page.waitForTimeout(180);
      const path = `${directory}/${name}.png`;
      const metrics = inspectPng(await page.screenshot({ path, fullPage: true }));
      const layout = await page.evaluate(() => {
        const canvas = document.querySelector('[data-game-canvas="rift-line"]');
        const rect = canvas.getBoundingClientRect();
        return {
          count: document.querySelectorAll("canvas").length,
          width: canvas.width, height: canvas.height,
          displayWidth: rect.width, displayHeight: rect.height,
          overflow: document.documentElement.scrollWidth - innerWidth,
          resumeVisible: Boolean(document.querySelector(".rift-resume-run")),
        };
      });
      assert.equal(layout.count, 1);
      assert.ok(layout.width > 0 && layout.height > 0 && layout.displayWidth > 0 && layout.displayHeight > 0);
      assert.ok(layout.overflow <= 1, `${name}: horizontal overflow`);
      screenshots[name] = { path, metrics, layout, state: await state() };
    };
    await page.goto(`${baseUrl}/game/autochess?seed=90603`);
    await ready();
    await page.locator(".rift-save-help").waitFor();
    await page.locator(".rift-dom-choice").first().click();
    await page.locator("button.rift-dom-shop-card:not(:disabled)").first().click();
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press("l");
    const prep = await snapshot();
    await reload();
    assert.equal((await state()).interface.savedRun.phase, "preparation");
    await capture("desktop-continue");
    await resume();
    const restoredPrep = await snapshot();
    for (const key of ["gold", "board", "bench", "shop", "shopLocked", "seed", "enemySeed"]) assert.deepEqual(restoredPrep.state[key], prep.state[key], key);
    for (const key of ["uid", "randomState", "shopRandomState", "shopSequenceCounts"]) assert.deepEqual(restoredPrep[key], prep[key], key);
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press("Space");
    await page.getByRole("button", { name: "暂停战斗", exact: true }).click();
    const lockedSave = await page.evaluate(() => localStorage.getItem("rift-line-active-run"));
    await page.getByRole("button", { name: "快速结算当前战斗", exact: true }).click();
    const uninterrupted = await snapshot();
    assert.equal(uninterrupted.state.phase, "result");
    // Simulate an abrupt close during combat using the actual checkpoint from that battle.
    await page.evaluate(value => localStorage.setItem("rift-line-active-run", value), lockedSave);
    await page.setViewportSize({ width: 390, height: 844 });
    await reload();
    assert.equal((await state()).interface.savedRun.phase, "battle");
    await page.getByText("战斗已锁定", { exact: false }).waitFor();
    await capture("mobile-locked-battle");
    await resume();
    assert.equal((await snapshot()).state.battle.elapsed, 0);
    assert.equal((await state()).interface.battlePaused, true);
    assert.equal(await page.locator(".rift-dom-shop-card").count(), 0);
    await capture("mobile-resumed-battle");
    // Closing again must retain the locked battle checkpoint.
    await reload();
    assert.equal((await state()).interface.savedRun.phase, "battle");
    await resume();
    await page.getByRole("button", { name: "快速结算当前战斗", exact: true }).click();
    const replay = await snapshot();
    assert.deepEqual(replay.state.result, uninterrupted.state.result);
    assert.equal(replay.state.score, uninterrupted.state.score);
    assert.equal(replay.randomState, uninterrupted.randomState);
    await reload();
    assert.equal((await state()).interface.savedRun.phase, "result");
    await resume();
    assert.deepEqual((await snapshot()).state.result, replay.state.result);
    assert.equal((await snapshot()).state.gold, replay.state.gold);
    await page.getByRole("button", { name: "继续 · 进入整备", exact: true }).click();
    assert.equal((await state()).round, 2);
    await page.getByRole("button", { name: "开战 SPACE", exact: true }).click();
    await page.getByRole("button", { name: "快速结算当前战斗", exact: true }).click();
    await page.getByRole("button", { name: "继续 · 选择小天赋", exact: true }).click();
    assert.equal((await state()).phase, "augment");
    const augment = await snapshot();
    await reload();
    assert.equal((await state()).interface.savedRun.phase, "augment");
    await resume();
    assert.deepEqual((await snapshot()).state.augmentChoices, augment.state.augmentChoices);
    assert.equal((await snapshot()).state.gold, augment.state.gold);
    await capture("mobile-resumed-augment");
    await page.locator(".rift-mobile-augment-option").first().click();
    assert.equal((await state()).round, 3);
    await reload();
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => window.autoChessAI.bridge.engine.state.phase === "preparation");
    assert.equal((await state()).round, 3);
    await page.evaluate(() => window.autoChessAI.bridge.dispatch({ type: "restart" }));
    assert.equal(await page.evaluate(() => localStorage.getItem("rift-line-active-run")), null);
    assert.deepEqual(errors, []);
    assert.deepEqual(failures, []);
    const report = { screenshots, errors, failures, verified: ["preparation", "battle-lock", "repeated-reload", "deterministic-replay", "result-no-double-income", "augment", "next-round", "keyboard-resume", "restart-clears-save"] };
    writeFileSync(`${directory}/report.json`, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ screenshots: Object.keys(screenshots), errors, failures, verified: report.verified }));
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
