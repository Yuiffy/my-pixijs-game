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
      // Try the next local Playwright installation.
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

  const baseUrl = process.env.AUTOCHESS_BASE_URL || "http://127.0.0.1:3100";
  await page.goto(`${baseUrl}/game/autochess?seed=1`, { waitUntil: "domcontentloaded" });
  const canvas = page.locator('[data-game-canvas="rift-line"]');
  await canvas.waitFor();
  await page.getByText("火热整活", { exact: true }).click();

  const readState = async () => JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  const pointForLogical = async (x, y) => {
    const box = await canvas.boundingBox();
    if (!box) throw new Error("Canvas is not visible");
    const logical = await canvas.evaluate((element) => ({
      width: Number(element.dataset.logicalWidth || 1120),
      height: Number(element.dataset.logicalHeight || 720),
    }));
    const fitScale = Math.min(box.width / logical.width, box.height / logical.height);
    return {
      x: box.x + (box.width - logical.width * fitScale) / 2 + x * fitScale,
      y: box.y + (box.height - logical.height * fitScale) / 2 + y * fitScale,
    };
  };

  let state = await readState();
  if (state.phase !== "preparation" || !state.board.length) {
    throw new Error(`Preparation did not initialize: ${JSON.stringify(state)}`);
  }

  const boardIndex = state.board[0].index;
  const boardSource = await pointForLogical(
    44 + (boardIndex % 6) * 116 + (Math.floor(boardIndex / 6) % 2) * 20 + 52,
    278 + Math.floor(boardIndex / 6) * 58 + 26,
  );
  const benchTarget = await pointForLogical(88, 638);
  await page.mouse.move(boardSource.x, boardSource.y);
  await page.mouse.down();
  await page.mouse.move(benchTarget.x, benchTarget.y, { steps: 8 });
  await page.mouse.up();
  state = await readState();
  if (!state.bench.length) throw new Error(`Unit did not move to bench: ${JSON.stringify(state)}`);

  const headerText = await page.locator(".rift-dom-header").innerText();
  if (headerText.includes("金币")) throw new Error(`Header still contains duplicated gold: ${headerText}`);

  const interest = page.locator(".rift-dom-shop-desktop .rift-interest-info");
  await interest.hover();
  const interestTooltip = interest.locator('[role="tooltip"]');
  const interestText = await interestTooltip.innerText();
  const interestDisplay = await interestTooltip.evaluate((element) => getComputedStyle(element).display);
  if (interestDisplay === "none" || !interestText.includes("每 5 金币提供 1 利息")) {
    throw new Error(`Interest tooltip is not readable: ${interestDisplay} ${interestText}`);
  }
  await page.screenshot({ path: `${artifactDirectory}/economy-interest-desktop.png`, fullPage: true });

  await page.mouse.move(benchTarget.x, benchTarget.y);
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${artifactDirectory}/economy-bench-tooltip-desktop.png`, fullPage: true });

  const desktop = {
    headerText,
    shopGold: await page.locator(".rift-shop-economy > span").first().innerText(),
    interestText,
    bench: state.bench,
    canvas: await canvas.evaluate((element) => ({
      width: element.width,
      height: element.height,
      logicalWidth: element.dataset.logicalWidth,
      logicalHeight: element.dataset.logicalHeight,
    })),
  };

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  await page.locator(".rift-dom-mobile-actions button").nth(0).click();
  const mobileInterest = page.locator(".rift-interest-info.is-compact");
  await mobileInterest.locator("button").click();
  const mobileInterestDisplay = await mobileInterest.locator('[role="tooltip"]').evaluate((element) => getComputedStyle(element).display);
  if (mobileInterestDisplay === "none") throw new Error("Mobile interest explanation did not open");
  await page.screenshot({ path: `${artifactDirectory}/economy-interest-mobile.png`, fullPage: true });
  await page.getByRole("button", { name: "关闭面板" }).evaluate((button) => button.click());
  await page.locator(".rift-dom-sheet-backdrop").waitFor({ state: "detached" });

  await page.locator(".rift-dom-mobile-actions button").nth(1).click();
  const mobileValues = await page.locator(".rift-bench-value").allInnerTexts();
  if (!mobileValues.length) throw new Error("Mobile bench does not show unit value");
  await page.screenshot({ path: `${artifactDirectory}/economy-bench-mobile.png`, fullPage: true });

  console.log(JSON.stringify({
    desktop,
    mobile: {
      interestDisplay: mobileInterestDisplay,
      values: mobileValues,
    },
    errors,
  }, null, 2));
  if (errors.length) throw new Error(`Browser errors: ${JSON.stringify(errors)}`);
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
