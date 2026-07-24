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
      if (candidate.includes("/") || candidate.includes("\\")) {
        if (!existsSync(candidate)) continue;
        return localRequire(candidate);
      }
      return localRequire(candidate);
    } catch {
      // 继续尝试下一个候选路径。
    }
  }
  throw new Error("无法加载 playwright，请安装依赖或设置 PLAYWRIGHT_MODULE");
};

const { chromium } = loadPlaywright();
const baseUrl = process.env.AUTOCHESS_BASE_URL || "http://127.0.0.1:3100";
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

  const readState = async () => JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  const advance = async (milliseconds) => page.evaluate((value) => window.advanceTime(value), milliseconds);
  let found = null;

  for (const seed of [8, 9, 10, 11, 12]) {
    if (found) break;
    errors.length = 0;
    await page.goto(`${baseUrl}/game/autochess?seed=${seed}`, { waitUntil: "domcontentloaded" });
    await page.locator('[data-game-canvas="rift-line"]').waitFor();
    const danceChoice = page.locator(".rift-dom-choice").filter({ hasText: "舞台梦" });
    if (await danceChoice.count()) await danceChoice.first().click();
    else await page.locator(".rift-dom-choice").first().click();
    await page.waitForTimeout(120);
    const preparation = await readState();
    if (preparation.phase !== "preparation" || !preparation.shop.includes("tiandou")) continue;

    const tiandouCard = page.locator('button[aria-label^="恬豆·甜点转圈"]');
    if (await tiandouCard.count() !== 1) continue;
    await tiandouCard.click();
    const afterBuy = await readState();
    if (!afterBuy.board.some((unit) => unit.id === "tiandou")) continue;

    await page.locator("button.rift-start-button").click();
    for (let step = 0; step < 240; step += 1) {
      const current = await readState();
      const lollipops = current.battle?.visualEffects?.projectiles?.filter((projectile) => projectile.style === "lollipop") || [];
      if (current.phase === "battle" && lollipops.some((projectile) => projectile.grounded)) {
        found = { seed, preparation, afterBuy, state: current };
        break;
      }
      if (current.phase !== "battle") break;
      await advance(100);
    }
  }

  if (!found) throw new Error("候选种子内未找到可观察到恬豆落地棒棒糖的战斗帧");

  const canvas = page.locator('[data-game-canvas="rift-line"]');
  const canvasBox = await canvas.boundingBox();
  const canvasMeta = await canvas.evaluate((element) => ({
    width: element.width,
    height: element.height,
    logicalWidth: element.dataset.logicalWidth,
    logicalHeight: element.dataset.logicalHeight,
    renderScale: element.dataset.renderScale,
  }));
  const screenshotPath = `${artifactDirectory}/tiandou-lollipop-grounded.png`;
  const screenshot = await page.screenshot({ path: screenshotPath, fullPage: true });
  if (screenshot.length < 20_000) throw new Error(`截图文件异常偏小: ${screenshot.length}`);
  if (!canvasBox || canvasBox.width < 1000 || canvasBox.height < 500) throw new Error(`游戏画布尺寸异常: ${JSON.stringify(canvasBox)}`);
  const lollipops = found.state.battle.visualEffects.projectiles.filter((projectile) => projectile.style === "lollipop");
  if (!lollipops.some((projectile) => projectile.grounded && projectile.remaining > 8)) {
    throw new Error(`没有观察到落地后仍有较长剩余时间的棒棒糖: ${JSON.stringify(lollipops)}`);
  }
  if (errors.length) throw new Error(`Chrome 控制台出现错误: ${JSON.stringify(errors)}`);

  console.log(JSON.stringify({
    seed: found.seed,
    phase: found.state.phase,
    elapsed: found.state.battle.elapsed,
    groundedLollipops: lollipops,
    canvasBox,
    canvasMeta,
    screenshotPath,
    screenshotBytes: screenshot.length,
    errors,
  }, null, 2));
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
