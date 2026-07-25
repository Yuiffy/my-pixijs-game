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
      // Try the next repository-known Playwright location.
    }
  }
  throw new Error("Unable to load Playwright");
};

const { chromium } = loadPlaywright();
const baseUrl = process.env.AUTOCHESS_BASE_URL || "http://127.0.0.1:3100";
const artifactDirectory = ".tmp/autochess/sumi-air-dragon";
mkdirSync(artifactDirectory, { recursive: true });

const readState = (page) => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = (page, milliseconds) => page.evaluate((value) => window.advanceTime(value), milliseconds);

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  let page = null;
  let seed = null;
  let state = null;
  const errors = [];

  for (let candidate = 1; candidate <= 240; candidate += 1) {
    const nextPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    nextPage.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    nextPage.on("pageerror", (error) => errors.push(error.message));
    await nextPage.goto(`${baseUrl}/game/autochess?seed=${candidate}`, { waitUntil: "domcontentloaded" });
    await nextPage.locator('[data-game-canvas="rift-line"]').waitFor({ state: "attached", timeout: 60000 });
    await nextPage.waitForTimeout(600);
    await nextPage.getByText("火热整活", { exact: true }).click();
    await nextPage.waitForTimeout(80);
    const nextState = await readState(nextPage);
    if (nextState.shop?.includes("sumi")) {
      page = nextPage;
      seed = candidate;
      state = nextState;
      break;
    }
    await nextPage.close();
  }

  if (!page || !state) throw new Error("未在 240 个确定性种子中找到礼墨商店卡");
  await page.screenshot({ path: `${artifactDirectory}/sumi-shop.png`, fullPage: true });
  await page.getByRole("button", { name: /礼墨Sumi/ }).first().click();
  await page.waitForTimeout(100);
  state = await readState(page);
  if (!state.board?.some((unit) => unit?.id === "sumi") && !state.bench?.some((unit) => unit?.id === "sumi")) {
    throw new Error(`礼墨购买后未进入阵容: ${JSON.stringify(state)}`);
  }
  await page.screenshot({ path: `${artifactDirectory}/sumi-preparation.png`, fullPage: true });

  await page.getByRole("button", { name: /开始战斗/ }).last().click();
  await page.waitForTimeout(100);
  state = await readState(page);
  if (state.phase !== "battle") throw new Error(`未进入礼墨战斗场景: ${JSON.stringify(state)}`);

  let stealthFrame = null;
  let dragonFrame = null;
  for (let elapsed = 0; elapsed < 24000; elapsed += 100) {
    await advance(page, 100);
    const frame = await readState(page);
    const sumi = frame.battle?.playerUnits?.find((unit) => unit.unitId === "sumi");
    if (!stealthFrame && sumi?.stealthTime > 0) {
      stealthFrame = frame;
      await page.screenshot({ path: `${artifactDirectory}/sumi-air-dragon-stealth.png`, fullPage: true });
    }
    if (!dragonFrame && frame.battle?.visualEffects?.projectiles?.some((projectile) => projectile.style === "sumi_dragon")) {
      dragonFrame = frame;
      await page.screenshot({ path: `${artifactDirectory}/sumi-little-dragon-projectile.png`, fullPage: true });
      break;
    }
    if (frame.phase !== "battle") break;
  }

  if (!stealthFrame) throw new Error("浏览器战斗中未捕获空气龙隐身状态");
  if (!dragonFrame) throw new Error("浏览器战斗中未捕获礼小龙图片投射物");
  if (errors.length) throw new Error(`浏览器控制台错误: ${JSON.stringify(errors)}`);
  console.log(JSON.stringify({ seed, stealth: stealthFrame.battle.playerUnits.find((unit) => unit.unitId === "sumi"), dragonProjectile: dragonFrame.battle.visualEffects.projectiles.find((projectile) => projectile.style === "sumi_dragon"), errors }, null, 2));
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
