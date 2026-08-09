const { createRequire } = require("node:module");
const { existsSync, mkdirSync } = require("node:fs");
const { inflateSync } = require("node:zlib");

const localRequire = createRequire(__filename);
const candidates = [
  process.env.PLAYWRIGHT_MODULE,
  "playwright",
  "C:/Users/yuiffy/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright",
].filter(Boolean);

const loadPlaywright = () => {
  for (const candidate of candidates) {
    try {
      if ((candidate.includes("/") || candidate.includes("\\")) && !existsSync(candidate)) continue;
      return localRequire(candidate);
    } catch {
      // Try the next repository-known location.
    }
  }
  throw new Error("Unable to load Playwright");
};

const inspectPng = (buffer) => {
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
      channels = chunk[9] === 6 ? 4 : chunk[9] === 2 ? 3 : 0;
    }
    if (type === "IDAT") idat.push(chunk);
    if (type === "IEND") break;
    offset += length + 12;
  }
  if (!width || !height || !channels) throw new Error("Unsupported PNG screenshot");

  const rows = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  let rowOffset = 0;
  let previous = Buffer.alloc(stride);
  let nearBlack = 0;
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
    for (let x = 0; x < width; x += 1) {
      const pixel = x * channels;
      const red = row[pixel];
      const green = row[pixel + 1];
      const blue = row[pixel + 2];
      if (red <= 12 && green <= 12 && blue <= 12) nearBlack += 1;
      if (colors.size < 4096) colors.add(`${red},${green},${blue}`);
    }
    previous = row;
    rowOffset += stride + 1;
  }
  const metrics = { width, height, colors: colors.size, nearBlackRatio: nearBlack / (width * height) };
  if (metrics.colors <= 1 || metrics.nearBlackRatio >= 0.97) {
    throw new Error(`Invalid screenshot: ${JSON.stringify(metrics)}`);
  }
  return metrics;
};

const { chromium } = loadPlaywright();
const baseUrl = process.env.AUTOCHESS_BASE_URL || "http://127.0.0.1:3207";
const artifactDirectory = "tmp/autochess-art-fix/browser";
mkdirSync(artifactDirectory, { recursive: true });
let browser;

(async () => {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const results = [];
  for (const scenario of [
    {
      style: "minimal",
      button: "查看蛙梓详情",
      expectedPath: "/images/autochess/portraits/minimal/cinder_ram.png",
      screenshot: "azi-minimal.png",
    },
    {
      style: "classic",
      button: "查看轴轴的宝详情",
      expectedPath: "/images/autochess/portraits/classic/cog-scribe.png",
      screenshot: "joi-classic.png",
    },
  ]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.setDefaultTimeout(30000);
    const errors = [];
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript((style) => localStorage.setItem("rift-line-character-style", style), scenario.style);
    console.log(`${scenario.style}: navigate`);
    const response = await page.goto(`${baseUrl}/game/autochess?seed=1`, { waitUntil: "domcontentloaded" });
    if (!response?.ok()) throw new Error(`Autochess URL returned ${response?.status()}`);
    await page.locator('[data-game-canvas="rift-line"]').waitFor();
    console.log(`${scenario.style}: open codex`);
    await page.getByRole("button", { name: "图鉴 / 本局天赋" }).click();
    const dialog = page.getByRole("dialog", { name: "裂隙阵线图鉴" });
    console.log(`${scenario.style}: select ${scenario.button}`);
    await dialog.getByRole("button", { name: scenario.button }).click();
    const details = dialog.locator("[data-codex-unit-details]");
    const image = details.locator("img").first();
    await image.waitFor();
    await page.waitForFunction((expectedPath) => {
      const imageElement = document.querySelector("[data-codex-unit-details] img");
      return imageElement?.complete && imageElement.naturalWidth > 0 && new URL(imageElement.src).pathname === expectedPath;
    }, scenario.expectedPath);
    console.log(`${scenario.style}: asset loaded`);
    const imageSummary = await image.evaluate((element) => ({
      src: new URL(element.src).pathname,
      naturalWidth: element.naturalWidth,
      naturalHeight: element.naturalHeight,
      displayWidth: Math.round(element.getBoundingClientRect().width),
      displayHeight: Math.round(element.getBoundingClientRect().height),
    }));
    const screenshotPath = `${artifactDirectory}/${scenario.screenshot}`;
    const screenshotBuffer = await page.screenshot({ path: screenshotPath });
    results.push({
      style: scenario.style,
      screenshotPath,
      screenshot: inspectPng(screenshotBuffer),
      image: imageSummary,
      errors,
    });
    if (errors.length) throw new Error(JSON.stringify({ style: scenario.style, errors }, null, 2));
    await page.close();
  }
  await browser.close();
  console.log(JSON.stringify(results, null, 2));
})().catch((error) => {
  console.error(error);
  browser?.close().catch(() => {});
  process.exitCode = 1;
});
