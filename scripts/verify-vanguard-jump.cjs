const { createRequire } = require("node:module");
const { existsSync, mkdirSync } = require("node:fs");

const localRequire = createRequire(__filename);
const playwrightCandidates = [
  process.env.PLAYWRIGHT_MODULE,
  "playwright",
  "C:/Users/apple/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright",
  "C:/Users/yuiffy/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright",
].filter(Boolean);

const loadPlaywright = () => {
  for (const candidate of playwrightCandidates) {
    try {
      if ((candidate.includes("/") || candidate.includes("\\")) && !existsSync(candidate)) continue;
      return localRequire(candidate);
    } catch {
      // Try the next known local Playwright installation.
    }
  }
  throw new Error("Unable to load Playwright");
};

const { chromium } = loadPlaywright();
const artifactDirectory = ".tmp/autochess";
mkdirSync(artifactDirectory, { recursive: true });

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  const baseUrl = process.env.AUTOCHESS_BASE_URL || "http://127.0.0.1:3100";
  const readState = async () => JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  const advance = async (milliseconds) => page.evaluate((value) => window.advanceTime(value), milliseconds);

  let scenario = null;
  for (let seed = 1; seed <= 40 && !scenario; seed += 1) {
    try {
      await page.goto(`${baseUrl}/game/autochess?seed=${seed}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    } catch (error) {
      if (!String(error?.message || error).includes("ERR_ABORTED")) throw error;
      await page.waitForTimeout(150);
      await page.goto(`${baseUrl}/game/autochess?seed=${seed}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    }
    await page.locator('[data-game-canvas="rift-line"]').waitFor();
    await page.waitForTimeout(100);
    const title = await readState();
    if (!title.starterChoices.some((choice) => choice.name === "持久抗压")) continue;
    await page.getByText("持久抗压", { exact: true }).click();
    await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === "preparation");
    let preparation = await readState();
    for (let refresh = 0; refresh < 6 && !preparation.shop.some((unit) => unit?.id === "mossback"); refresh += 1) {
      await page.getByRole("button", { name: /刷新/ }).first().click();
      await page.waitForTimeout(100);
      preparation = await readState();
    }
    if (!preparation.shop.some((unit) => unit?.id === "mossback")) continue;
    await page.locator('button[aria-label^="绒绒的狗"]').first().click();
    preparation = await readState();
    if (preparation.board.filter(Boolean).length < 2) continue;
    await page.locator("button.rift-start-button").click();
    await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === "battle");
    scenario = { seed, preparation, battleStart: await readState() };
  }
  if (!scenario) throw new Error("未找到持久抗压 + 绒绒的狗的可复现场景");

  const samples = [];
  let captured = null;
  for (let step = 0; step < 360; step += 1) {
    const state = await readState();
    if (state.phase !== "battle") break;
    const jumper = state.battle.playerUnits.find((unit) => unit.jumpAdvancing && unit.jumpProgress > 0.05);
    if (jumper) {
      const pathProgress = jumper.jumpProgress;
      const pathX = jumper.jumpFrom.x + (jumper.jumpTo.x - jumper.jumpFrom.x) * (0.5 - Math.cos(pathProgress * Math.PI) / 2);
      const sample = { elapsed: state.battle.elapsed, jumper, pathX: Number(pathX.toFixed(2)) };
      samples.push(sample);
      if (!captured) {
        captured = sample;
        await page.screenshot({ path: `${artifactDirectory}/vanguard-jump-advancing.png`, fullPage: true });
      }
    }
    if (captured && samples.length >= 3) break;
    await advance(50);
  }

  if (!captured) throw new Error("实战中未捕获怕死后跳保持接敌状态");
  if (captured.jumper.jumpProgress <= 0 || captured.jumper.jumpProgress >= 1) throw new Error(`后跳进度异常: ${JSON.stringify(captured)}`);
  const forwardStep = samples.some((sample, index) => index > 0
    && sample.jumper.facingX === 1
    && sample.jumper.x > samples[index - 1].jumper.x);
  if (!forwardStep) throw new Error(`后跳期间未观察到接敌位移叠加: ${JSON.stringify(samples)}`);
  if (errors.length) throw new Error(`Chrome 控制台出现错误: ${JSON.stringify(errors)}`);

  const canvas = page.locator('[data-game-canvas="rift-line"]');
  const canvasBox = await canvas.boundingBox();
  const canvasMeta = await canvas.evaluate((element) => ({
    width: element.width,
    height: element.height,
    logicalWidth: element.dataset.logicalWidth,
    logicalHeight: element.dataset.logicalHeight,
  }));
  if (!canvasBox || canvasBox.width < 1000 || canvasBox.height < 500) throw new Error(`游戏画布尺寸异常: ${JSON.stringify(canvasBox)}`);
  console.log(JSON.stringify({
    seed: scenario.seed,
    battleStart: scenario.battleStart,
    captured,
    samples,
    screenshot: `${artifactDirectory}/vanguard-jump-advancing.png`,
    canvasBox,
    canvasMeta,
    errors,
  }, null, 2));
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
