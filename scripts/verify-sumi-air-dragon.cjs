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
const viewport = { width: 1440, height: 900 };
const requestedSeed = Number(process.env.AUTOCHESS_SEED);
const seedCandidates = Number.isFinite(requestedSeed) && requestedSeed > 0
  ? [Math.trunc(requestedSeed)]
  : Array.from({ length: 120 }, (_, index) => index + 1);

const readState = (page) => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = (page, milliseconds) => page.evaluate((value) => window.advanceTime(value), milliseconds);

const prepareSeed = async (page, candidate) => {
  await page.goto(baseUrl + "/game/autochess?seed=" + candidate, { waitUntil: "domcontentloaded" });
  await page.locator('[data-game-canvas="rift-line"]').waitFor({ state: "attached", timeout: 15000 });
  await page.waitForFunction(() => typeof window.render_game_to_text === "function", null, { timeout: 15000 });
  await page.getByText("火热整活", { exact: true }).click({ timeout: 10000 });
  await page.waitForTimeout(50);
  await page.getByRole("button", { name: /升本/ }).first().click({ timeout: 10000 });
  await page.waitForTimeout(50);
  return readState(page);
};

const findSumiSeed = async (browser) => {
  let cursor = 0;
  let found = null;
  const worker = async () => {
    while (!found) {
      const index = cursor;
      cursor += 1;
      if (index >= seedCandidates.length) return;
      const candidate = seedCandidates[index];
      const candidatePage = await browser.newPage({ viewport });
      try {
        const candidateState = await prepareSeed(candidatePage, candidate);
        if (candidateState.shop?.includes("sumi")) {
          found = { page: candidatePage, seed: candidate, state: candidateState };
          return;
        }
      } catch {
        // Continue probing other deterministic seeds; the final error stays focused.
      }
      await candidatePage.close();
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, seedCandidates.length) }, worker));
  return found;
};

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const match = await findSumiSeed(browser);
  if (!match) throw new Error("未在 " + seedCandidates.length + " 个确定性种子中找到礼墨商店卡");
  const { page, seed } = match;
  let state = match.state;
  const errors = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));

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
