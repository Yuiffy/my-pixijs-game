const { createRequire } = require("node:module");
const { existsSync, mkdirSync } = require("node:fs");
const { inflateSync } = require("node:zlib");

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
      // 继续尝试仓库已知的 Playwright 路径。
    }
  }
  throw new Error("无法加载 playwright，请安装依赖或设置 PLAYWRIGHT_MODULE");
};

const { chromium } = loadPlaywright();
const baseUrl = process.env.AUTOCHESS_BASE_URL || "http://127.0.0.1:3100";
const artifactDirectory = ".tmp/autochess";
mkdirSync(artifactDirectory, { recursive: true });

const inspectScreenshot = (buffer, label) => {
  if (buffer.length < 20_000) throw new Error(`${label} 截图文件异常偏小: ${buffer.length}`);
  if (buffer.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error(`${label} 不是 PNG`);
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const chunk = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = chunk.readUInt32BE(0);
      height = chunk.readUInt32BE(4);
      colorType = chunk[9];
    }
    if (type === "IDAT") idat.push(chunk);
    if (type === "IEND") break;
    offset += length + 12;
  }
  if (colorType !== 2 && colorType !== 6) throw new Error(`${label} 不是 RGB/RGBA PNG: colorType=${colorType}`);
  const rows = inflateSync(Buffer.concat(idat));
  const bytesPerPixel = colorType === 6 ? 4 : 3;
  const stride = width * bytesPerPixel;
  let rowOffset = 0;
  let previous = Buffer.alloc(stride);
  let nearBlack = 0;
  let transparent = 0;
  let pixels = 0;
  const colors = new Set();
  for (let y = 0; y < height; y += 1) {
    const filter = rows[rowOffset];
    const row = Buffer.from(rows.subarray(rowOffset + 1, rowOffset + 1 + stride));
    for (let x = 0; x < stride; x += bytesPerPixel) {
      for (let channel = 0; channel < bytesPerPixel; channel += 1) {
        const index = x + channel;
        const left = x >= bytesPerPixel ? row[index - bytesPerPixel] : 0;
        const up = previous[index];
        const upLeft = x >= bytesPerPixel ? previous[index - bytesPerPixel] : 0;
        const predict = (leftValue, upValue, upLeftValue) => {
          const estimate = leftValue + upValue - upLeftValue;
          const distances = [Math.abs(estimate - leftValue), Math.abs(estimate - upValue), Math.abs(estimate - upLeftValue)];
          return distances[0] <= distances[1] && distances[0] <= distances[2]
            ? leftValue
            : distances[1] <= distances[2] ? upValue : upLeftValue;
        };
        if (filter === 1) row[index] = (row[index] + left) & 255;
        else if (filter === 2) row[index] = (row[index] + up) & 255;
        else if (filter === 3) row[index] = (row[index] + Math.floor((left + up) / 2)) & 255;
        else if (filter === 4) row[index] = (row[index] + predict(left, up, upLeft)) & 255;
        else if (filter !== 0) throw new Error(`${label} 使用了不支持的 PNG filter ${filter}`);
      }
      const alpha = bytesPerPixel === 4 ? row[x + 3] : 255;
      if (alpha === 0) transparent += 1;
      if (alpha > 0 && row[x] < 12 && row[x + 1] < 12 && row[x + 2] < 12) nearBlack += 1;
      if (colors.size < 5000) colors.add(`${row[x]},${row[x + 1]},${row[x + 2]},${alpha}`);
      pixels += 1;
    }
    previous = row;
    rowOffset += stride + 1;
  }
  const stats = {
    width,
    height,
    bytes: buffer.length,
    nearBlackRatio: Number((nearBlack / pixels).toFixed(4)),
    transparentRatio: Number((transparent / pixels).toFixed(4)),
    sampledColors: colors.size,
  };
  if (stats.transparentRatio > 0.02 || stats.nearBlackRatio > 0.92 || stats.sampledColors < 20) {
    throw new Error(`${label} 疑似空白/黑色截图: ${JSON.stringify(stats)}`);
  }
  return stats;
};

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
  const screenshot = async (filename, label) => {
    const path = `${artifactDirectory}/${filename}`;
    const buffer = await page.screenshot({ path, fullPage: true });
    return { path, stats: inspectScreenshot(buffer, label) };
  };

  let found = null;
  const seeds = [27];
  for (const seed of seeds) {
    errors.length = 0;
    await page.goto(`${baseUrl}/game/autochess?seed=${seed}`, { waitUntil: "domcontentloaded" });
    await page.locator('[data-game-canvas="rift-line"]').waitFor();
    const goldChoice = page.locator(".rift-dom-choice").filter({ hasText: /成熟稳重|热点追踪|舞台梦/ }).first();
    if (await goldChoice.count() !== 1) continue;
    await goldChoice.click();
    await page.waitForTimeout(120);
    let preparation = await readState();
    if (preparation.phase !== "preparation") continue;
    await page.getByRole("button", { name: /升本/ }).first().click();
    await page.waitForTimeout(80);
    preparation = await readState();
    if (preparation.player.level < 4 || preparation.player.gold < 4) continue;
    if (!preparation.shop.some((unit) => unit?.id === "guangyi")) {
      await page.getByRole("button", { name: /刷新/ }).first().click();
      await page.waitForTimeout(80);
      preparation = await readState();
    }
    if (!preparation.shop.some((unit) => unit?.id === "guangyi")) continue;
    await page.locator('button[aria-label^="中单光一"]').click();
    const purchased = await readState();
    if (![...purchased.board, ...purchased.bench].some((unit) => unit.id === "guangyi")) continue;
    await page.locator("button.rift-start-button").click();
    const battleStart = await readState();
    if (battleStart.phase !== "battle") continue;

    const samples = [];
    let mid = null;
    let impact = null;
    for (let step = 0; step < 360; step += 1) {
      const state = await readState();
      if (state.phase !== "battle") break;
      const source = state.battle.playerUnits.find((unit) => unit.unitId === "guangyi");
      if (source?.motion?.abilityId === "guangyi") {
        const progress = source.motion.progress;
        const distance = Math.hypot(source.x - source.motion.from.x, source.y - source.motion.from.y);
        samples.push({ progress, distance, x: source.x, y: source.y });
        if (!mid && progress > 0.18 && progress < 0.55) {
          mid = { state, screenshot: await screenshot("guangyi-slide-mid.png", "滑跪中段") };
        }
        const stunned = state.battle.enemyUnits.filter((unit) => unit.stun > 0);
        if (!impact && stunned.length) {
          impact = { state, stunned, screenshot: await screenshot("guangyi-slide-impact.png", "滑跪碰撞") };
        }
      }
      if (mid && impact) break;
      await advance(50);
    }
    if (mid && impact && samples.length >= 3) {
      found = { seed, preparation, purchased, battleStart, mid, impact, samples, errors: [...errors] };
      break;
    }
  }

  if (!found) throw new Error(`候选种子内未捕获中单光一滑跪中段与碰撞眩晕帧: ${seeds.join(", ")}`);
  if (found.errors.length) throw new Error(`Chrome 控制台出现错误: ${JSON.stringify(found.errors)}`);
  const sourceSamples = found.samples;
  const midSource = found.mid.state.battle.playerUnits.find((unit) => unit.unitId === "guangyi");
  const midProgress = midSource.motion.progress;
  const midTravel = Math.hypot(midSource.x - midSource.motion.from.x, midSource.y - midSource.motion.from.y);
  const totalTravel = Math.hypot(midSource.motion.to.x - midSource.motion.from.x, midSource.motion.to.y - midSource.motion.from.y);
  const midTravelRatio = midTravel / Math.max(totalTravel, 1);
  if (!(midTravelRatio > midProgress + 0.1)) throw new Error(`滑跪未体现前快后慢: ${JSON.stringify({ midProgress, midTravelRatio, sourceSamples })}`);
  if (!found.impact.stunned.some((unit) => unit.stun > 0 && unit.stun <= 0.45)) throw new Error(`碰撞眩晕时长异常: ${JSON.stringify(found.impact.stunned)}`);

  const canvas = page.locator('[data-game-canvas="rift-line"]');
  const canvasBox = await canvas.boundingBox();
  const canvasMeta = await canvas.evaluate((element) => ({
    width: element.width,
    height: element.height,
    logicalWidth: element.dataset.logicalWidth,
    logicalHeight: element.dataset.logicalHeight,
    renderScale: element.dataset.renderScale,
  }));
  if (!canvasBox || canvasBox.width < 1000 || canvasBox.height < 500) throw new Error(`游戏画布尺寸异常: ${JSON.stringify(canvasBox)}`);

  console.log(JSON.stringify({
    seed: found.seed,
    motion: midSource.motion,
    curveCheck: { midProgress, midTravelRatio },
    stunned: found.impact.stunned,
    samples: sourceSamples,
    screenshots: [found.mid.screenshot, found.impact.screenshot],
    canvasBox,
    canvasMeta,
    errors: found.errors,
  }, null, 2));
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
