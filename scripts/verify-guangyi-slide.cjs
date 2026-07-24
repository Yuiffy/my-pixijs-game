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
  if (colorType !== 6) throw new Error(`${label} 不是 RGBA PNG: colorType=${colorType}`);
  const rows = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  let rowOffset = 0;
  let previous = Buffer.alloc(stride);
  let nearBlack = 0;
  let transparent = 0;
  let pixels = 0;
  const colors = new Set();
  for (let y = 0; y < height; y += 1) {
    const filter = rows[rowOffset];
    const row = Buffer.from(rows.subarray(rowOffset + 1, rowOffset + 1 + stride));
    for (let x = 0; x < stride; x += 4) {
      const leftR = x >= 4 ? row[x - 4] : 0;
      const leftG = x >= 4 ? row[x - 3] : 0;
      const leftB = x >= 4 ? row[x - 2] : 0;
      const upR = previous[x];
      const upG = previous[x + 1];
      const upB = previous[x + 2];
      const upLeftR = x >= 4 ? previous[x - 4] : 0;
      const upLeftG = x >= 4 ? previous[x - 3] : 0;
      const upLeftB = x >= 4 ? previous[x - 2] : 0;
      if (filter === 1) {
        row[x] = (row[x] + leftR) & 255;
        row[x + 1] = (row[x + 1] + leftG) & 255;
        row[x + 2] = (row[x + 2] + leftB) & 255;
      } else if (filter === 2) {
        row[x] = (row[x] + upR) & 255;
        row[x + 1] = (row[x + 1] + upG) & 255;
        row[x + 2] = (row[x + 2] + upB) & 255;
      } else if (filter === 3) {
        row[x] = (row[x] + Math.floor((leftR + upR) / 2)) & 255;
        row[x + 1] = (row[x + 1] + Math.floor((leftG + upG) / 2)) & 255;
        row[x + 2] = (row[x + 2] + Math.floor((leftB + upB) / 2)) & 255;
      } else if (filter === 4) {
        const predict = (left, up, upLeft) => {
          const estimate = left + up - upLeft;
          const distances = [Math.abs(estimate - left), Math.abs(estimate - up), Math.abs(estimate - upLeft)];
          return distances[0] <= distances[1] && distances[0] <= distances[2]
            ? left
            : distances[1] <= distances[2] ? up : upLeft;
        };
        row[x] = (row[x] + predict(leftR, upR, upLeftR)) & 255;
        row[x + 1] = (row[x + 1] + predict(leftG, upG, upLeftG)) & 255;
        row[x + 2] = (row[x + 2] + predict(leftB, upB, upLeftB)) & 255;
      } else if (filter !== 0) {
        throw new Error(`${label} 使用了不支持的 PNG filter ${filter}`);
      }
      const alpha = row[x + 3];
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
  const seeds = [73, 1, 15, 19, 27, 30, 48, 87, 101, 110, 122];
  for (const seed of seeds) {
    errors.length = 0;
    await page.goto(`${baseUrl}/game/autochess?seed=${seed}`, { waitUntil: "domcontentloaded" });
    await page.locator('[data-game-canvas="rift-line"]').waitFor();
    await page.locator(".rift-dom-choice").first().click();
    await page.waitForTimeout(120);
    const preparation = await readState();
    console.log(`seed ${seed}: ${preparation.phase} shop=${preparation.shop.map((unit) => unit?.id).join(",")}`);
    if (preparation.phase !== "preparation" || !preparation.shop.some((unit) => unit?.id === "guangyi")) continue;
    await page.locator('button[aria-label^="中单光一"]').click();
    const purchased = await readState();
    if (![...purchased.board, ...purchased.bench].some((unit) => unit.id === "guangyi")) continue;
    await page.locator("button.rift-start-button").click();
    const battleStart = await readState();
    console.log(`seed ${seed}: battle=${battleStart.phase} player=${battleStart.battle?.playerUnits.map((unit) => unit.unitId).join(",")}`);
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
    if (mid && impact && samples.length >= 5) {
      found = { seed, preparation, purchased, battleStart, mid, impact, samples, errors: [...errors] };
      break;
    }
  }

  if (!found) throw new Error(`候选种子内未捕获中单光一滑跪中段与碰撞眩晕帧: ${seeds.join(", ")}`);
  if (found.errors.length) throw new Error(`Chrome 控制台出现错误: ${JSON.stringify(found.errors)}`);
  const sourceSamples = found.samples;
  const earlyStep = sourceSamples[1].distance - sourceSamples[0].distance;
  const lateStep = sourceSamples[Math.min(4, sourceSamples.length - 1)].distance - sourceSamples[Math.min(3, sourceSamples.length - 1)].distance;
  if (!(earlyStep > lateStep * 1.1)) throw new Error(`滑跪未体现减速: ${JSON.stringify({ earlyStep, lateStep, sourceSamples })}`);
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
    motion: found.mid.state.battle.playerUnits.find((unit) => unit.unitId === "guangyi")?.motion,
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
