const assert = require("node:assert/strict");
const { existsSync, mkdirSync } = require("node:fs");
const { createRequire } = require("node:module");
const { inspectPng } = require("./lib/autochess-screenshot.cjs");

const localRequire = createRequire(__filename);
const playwrightCandidates = [
  process.env.PLAYWRIGHT_MODULE,
  "playwright",
  "C:/Users/yuiffy/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright",
].filter(Boolean);

const loadPlaywright = () => {
  for (const candidate of playwrightCandidates) {
    try {
      if ((candidate.includes("/") || candidate.includes("\\")) && !existsSync(candidate)) continue;
      return localRequire(candidate);
    } catch {
      // Try the next repository-known Playwright location.
    }
  }
  throw new Error("Unable to load Playwright");
};

const { chromium } = loadPlaywright();
const artifactDirectory = ".tmp/autochess";
mkdirSync(artifactDirectory, { recursive: true });

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: process.env.AUTOCHESS_HEADED !== "1", args: ["--mute-audio"] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, hasTouch: true });
  await page.addInitScript(() => {
    if (window.speechSynthesis) window.speechSynthesis.speak = () => {};
  });
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${process.env.AUTOCHESS_BASE_URL || "http://127.0.0.1:3100"}/game/autochess?seed=1`);
  await page.waitForFunction(() => typeof window.exportAutoChessLastRun === "function");

  const exportType = await page.evaluate(() => typeof window.exportAutoChessLastRun);
  await page.getByRole("button", { name: "游戏设置" }).click();
  const settings = page.getByRole("dialog", { name: "游戏设置" });
  await settings.waitFor({ state: "visible" });
  const strategyGroup = settings.getByRole("radiogroup", { name: "托管风格" });
  const levelGroup = settings.getByRole("radiogroup", { name: "托管 AI 等级" });
  const strategies = await strategyGroup.getByRole("radio").evaluateAll((buttons) => (
    buttons.map((button) => ({
      label: button.textContent?.trim(),
      value: button.getAttribute("aria-checked"),
      clientWidth: button.clientWidth,
      scrollWidth: button.scrollWidth,
    }))
  ));
  const strategyLayout = await strategyGroup.evaluate((group) => {
    const groupRect = group.getBoundingClientRect();
    const buttons = Array.from(group.querySelectorAll("button"));
    const buttonRects = buttons.map((button) => button.getBoundingClientRect());
    return {
      leadingInset: buttonRects[0].left - groupRect.left,
      trailingInset: groupRect.right - buttonRects.at(-1).right,
      buttonWidths: buttonRects.map(({ width }) => width),
    };
  });
  const levels = await levelGroup.getByRole("radio").allTextContents();
  const researchModeVisible = await settings
    .getByRole("radiogroup", { name: "研究模式" })
    .count() > 0;
  const goTestVisible = await settings.getByText("Go测试", { exact: true }).count() > 0;
  const screenshotPath = `${artifactDirectory}/autochess-settings.png`;
  const screenshot = inspectPng(await page.screenshot({ path: screenshotPath, fullPage: true }));
  const info = settings.getByRole("button", { name: "托管 AI 等级说明", exact: true });
  await info.hover();
  const tooltip = page.getByRole("tooltip");
  await tooltip.waitFor({ state: "visible" });
  assert.match(await tooltip.innerText(), /控制托管时替你买棋、布阵的决策能力，不影响敌人难度。/);
  const infoScreenshotPath = `${artifactDirectory}/autochess-settings-info.png`;
  inspectPng(await page.screenshot({ path: infoScreenshotPath, fullPage: true }));
  await page.mouse.move(0, 0);
  await tooltip.waitFor({ state: "hidden" });
  await info.focus();
  await tooltip.waitFor({ state: "visible" });
  await info.evaluate((element) => element.blur());
  await tooltip.waitFor({ state: "hidden" });
  const canvas = await page.locator("canvas").first().evaluate((element) => ({ width: element.width, height: element.height }));
  assert.ok(canvas.width > 0 && canvas.height > 0);
  const state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  assert.equal(exportType, "function");
  assert.equal(strategies.length, 3);
  assert.deepEqual(
    strategies.map(({ label }) => label),
    ["稳健", "平衡", "搏上限"],
  );
  assert.deepEqual(levels, ["新手", "老手", "长考", "看穿"]);
  assert.equal(researchModeVisible, false);
  assert.equal(goTestVisible, false);
  assert.ok(strategies.every(({ clientWidth, scrollWidth }) => scrollWidth <= clientWidth));
  assert.ok(strategyLayout.leadingInset <= 5);
  assert.ok(strategyLayout.trailingInset <= 5);
  assert.ok(Math.max(...strategyLayout.buttonWidths) - Math.min(...strategyLayout.buttonWidths) < 1);
  assert.equal(state.interface.autoplayPreferenceStyle, "balanced");
  assert.equal(state.interface.autoplayThinkingLevel, "veteran");
  assert.equal(state.interface.autoplayStyle, "balanced");
  for (const [label, value] of [["新手", "novice"], ["老手", "veteran"], ["长考", "deep"], ["看穿", "oracle"]]) {
    await levelGroup.getByRole("radio", { name: label, exact: true }).click();
    assert.equal(await levelGroup.getByRole("radio", { name: label, exact: true }).getAttribute("aria-checked"), "true");
    const current = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    assert.equal(current.interface.autoplayThinkingLevel, value);
  }
  await levelGroup.getByRole("radio", { name: "老手", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  const mobileScreenshotPath = `${artifactDirectory}/autochess-settings-mobile.png`;
  const mobileScreenshot = inspectPng(await page.screenshot({ path: mobileScreenshotPath, fullPage: true }));
  assert.ok(await levelGroup.isVisible());
  assert.ok(await settings.evaluate((element) => element.scrollWidth <= element.clientWidth));
  await info.tap();
  await tooltip.waitFor({ state: "visible" });
  const mobileInfoScreenshotPath = `${artifactDirectory}/autochess-settings-mobile-info.png`;
  inspectPng(await page.screenshot({ path: mobileInfoScreenshotPath, fullPage: true }));
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({
    exportType,
    strategies,
    levels,
    researchModeVisible,
    goTestVisible,
    strategyLayout,
    phase: state.phase,
    screenshotPath,
    screenshot,
    mobileScreenshotPath,
    mobileScreenshot,
    infoScreenshotPath,
    mobileInfoScreenshotPath,
    canvas,
    errors,
  }, null, 2));
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
