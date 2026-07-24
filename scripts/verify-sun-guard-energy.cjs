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
      if ((candidate.includes("/") || candidate.includes("\\")) && !existsSync(candidate)) continue;
      return localRequire(candidate);
    } catch {
      // Try the next local Playwright installation.
    }
  }
  throw new Error("Unable to load Playwright");
};

const inspectPng = (buffer) => {
  if (buffer.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error("Screenshot is not a PNG");
  let offset = 8;
  let width = 0;
  let height = 0;
  let channels = 0;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const chunk = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = chunk.readUInt32BE(0);
      height = chunk.readUInt32BE(4);
      if (chunk[8] !== 8 || chunk[12] !== 0) throw new Error("Unsupported PNG encoding");
      channels = chunk[9] === 6 ? 4 : chunk[9] === 2 ? 3 : 0;
      if (!channels) throw new Error(`Unsupported PNG color type ${chunk[9]}`);
    }
    if (type === "IDAT") idat.push(chunk);
    if (type === "IEND") break;
    offset += length + 12;
  }

  const rows = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  let rowOffset = 0;
  let previous = Buffer.alloc(stride);
  let nearBlack = 0;
  let transparent = 0;
  const colors = new Set();
  for (let y = 0; y < height; y += 1) {
    const filter = rows[rowOffset];
    const row = Buffer.from(rows.subarray(rowOffset + 1, rowOffset + 1 + stride));
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? row[x - channels] : 0;
      const up = previous[x];
      const upperLeft = x >= channels ? previous[x - channels] : 0;
      if (filter === 1) row[x] = (row[x] + left) & 255;
      if (filter === 2) row[x] = (row[x] + up) & 255;
      if (filter === 3) row[x] = (row[x] + Math.floor((left + up) / 2)) & 255;
      if (filter === 4) {
        const prediction = left + up - upperLeft;
        const leftDistance = Math.abs(prediction - left);
        const upDistance = Math.abs(prediction - up);
        const upperLeftDistance = Math.abs(prediction - upperLeft);
        const nearest = leftDistance <= upDistance && leftDistance <= upperLeftDistance
          ? left
          : upDistance <= upperLeftDistance ? up : upperLeft;
        row[x] = (row[x] + nearest) & 255;
      }
    }
    if (filter > 4) throw new Error(`Unsupported PNG filter ${filter}`);
    for (let x = 0; x < width; x += 1) {
      const pixel = x * channels;
      const red = row[pixel];
      const green = row[pixel + 1];
      const blue = row[pixel + 2];
      const alpha = channels === 4 ? row[pixel + 3] : 255;
      if (red <= 12 && green <= 12 && blue <= 12) nearBlack += 1;
      if (alpha === 0) transparent += 1;
      if (colors.size < 2048) colors.add(`${red},${green},${blue},${alpha}`);
    }
    previous = row;
    rowOffset += stride + 1;
  }

  const pixels = width * height;
  const metrics = {
    width,
    height,
    colors: colors.size,
    nearBlackRatio: Number((nearBlack / pixels).toFixed(4)),
    transparentRatio: Number((transparent / pixels).toFixed(4)),
  };
  if (metrics.colors <= 1 || metrics.nearBlackRatio >= 0.97 || metrics.transparentRatio >= 0.97) {
    throw new Error(`Invalid screenshot: ${JSON.stringify(metrics)}`);
  }
  return metrics;
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
  const readState = async () => JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  const advance = async (milliseconds) => page.evaluate((value) => window.advanceTime(value), milliseconds);
  const screenshots = {};
  const capture = async (name) => {
    const buffer = await page.screenshot({ path: `${artifactDirectory}/${name}.png`, fullPage: true });
    screenshots[name] = inspectPng(buffer);
  };

  let seed = 0;
  for (let candidate = 1; candidate <= 40; candidate += 1) {
    const response = await page.goto(`${baseUrl}/game/autochess?seed=${candidate}`, { waitUntil: "domcontentloaded" });
    if (!response?.ok()) throw new Error(`Autocess URL returned ${response?.status()}`);
    await page.locator('[data-game-canvas="rift-line"]').waitFor();
    if (await page.locator(".rift-dom-choice").filter({ hasText: "持久抗压" }).count()) {
      seed = candidate;
      break;
    }
  }
  if (!seed) throw new Error("No starter offer contained 持久抗压");

  await page.locator(".rift-dom-choice").filter({ hasText: "持久抗压" }).click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === "preparation");

  await page.getByRole("button", { name: "图鉴 / 本局天赋" }).click();
  const dialog = page.getByRole("dialog", { name: "裂隙阵线图鉴" });
  await dialog.getByRole("button", { name: /果冻风纪/ }).click();
  const codexText = await dialog.innerText();
  const expectedRecovery = "能量 · 稳态回能：初始 0/100；自动回能（20 秒回满，每秒 +5）；受击回能（每下 +1）";
  if (!codexText.includes(expectedRecovery)) throw new Error(`Codex recovery text mismatch: ${codexText}`);
  if (!codexText.includes("主要随时间自动充能，受击仅小幅加速")) throw new Error("Codex ability description is stale");
  await capture("sun-guard-energy-codex");
  await dialog.getByRole("button", { name: "关闭 Esc" }).click();

  await page.locator("button.rift-start-button").click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === "battle");
  await page.getByRole("button", { name: "图鉴 / 本局天赋" }).click();
  const startState = await readState();
  const startGuard = startState.battle.playerUnits.find((unit) => unit.unitId === "sun_guard");
  if (!startGuard) throw new Error("Sun guard did not enter battle");
  await advance(1000);
  const automaticState = await readState();
  const automaticGuard = automaticState.battle.playerUnits.find((unit) => unit.unitId === "sun_guard");
  if (!automaticGuard || automaticGuard.energy - startGuard.energy !== 5) {
    throw new Error(`Automatic recovery mismatch: ${JSON.stringify({ startGuard, automaticGuard })}`);
  }
  if (automaticGuard.energyPerSecond !== 5 || automaticGuard.energyOnHit !== 1 || automaticGuard.energyOnAttack !== 0) {
    throw new Error(`Battle energy profile mismatch: ${JSON.stringify(automaticGuard)}`);
  }
  await page.keyboard.press("Escape");
  await capture("sun-guard-auto-energy");

  await page.getByRole("button", { name: "图鉴 / 本局天赋" }).click();
  let shieldState = null;
  for (let elapsed = 0; elapsed < 12000; elapsed += 100) {
    await advance(100);
    const current = await readState();
    const guard = current.battle?.playerUnits.find((unit) => unit.unitId === "sun_guard");
    if (guard?.shield > 0) {
      shieldState = { elapsed: current.battle.elapsed, guard };
      break;
    }
    if (current.phase !== "battle") break;
  }
  if (!shieldState) throw new Error("Green freeze armor did not trigger before battle ended");
  await page.keyboard.press("Escape");
  await capture("sun-guard-shield-active");

  if (errors.length) throw new Error(`Browser errors: ${JSON.stringify(errors)}`);
  console.log(JSON.stringify({
    seed,
    automaticRecovery: {
      before: startGuard.energy,
      afterOneSecond: automaticGuard.energy,
      perSecond: automaticGuard.energyPerSecond,
      onHit: automaticGuard.energyOnHit,
    },
    shieldState,
    screenshots,
    canvas: await page.locator('[data-game-canvas="rift-line"]').evaluate((canvas) => ({
      width: canvas.width,
      height: canvas.height,
      logicalWidth: canvas.dataset.logicalWidth,
      logicalHeight: canvas.dataset.logicalHeight,
    })),
    errors,
  }, null, 2));
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
