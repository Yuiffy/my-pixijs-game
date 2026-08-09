const assert = require("node:assert/strict");
const { existsSync, mkdirSync } = require("node:fs");
const { createRequire } = require("node:module");

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
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
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
  const screenshotPath = `${artifactDirectory}/autochess-settings.png`;
  await page.screenshot({ path: screenshotPath });
  const state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  assert.equal(exportType, "function");
  assert.equal(strategies.length, 4);
  assert.deepEqual(
    strategies.map(({ label }) => label),
    ["稳健", "搏上限", "看穿2", "Go测试"],
  );
  assert.ok(strategies.some(({ label }) => label === "看穿2"));
  assert.equal(strategies.some(({ label }) => label === "看穿"), false);
  assert.ok(strategies.some(({ label }) => label === "Go测试"));
  assert.ok(strategies.every(({ clientWidth, scrollWidth }) => scrollWidth <= clientWidth));
  assert.ok(strategyLayout.leadingInset <= 5);
  assert.ok(strategyLayout.trailingInset <= 5);
  assert.ok(Math.max(...strategyLayout.buttonWidths) - Math.min(...strategyLayout.buttonWidths) < 1);
  assert.equal(state.interface.autoplayStyle, "survival");
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ exportType, strategies, strategyLayout, phase: state.phase, screenshotPath, errors }, null, 2));
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
