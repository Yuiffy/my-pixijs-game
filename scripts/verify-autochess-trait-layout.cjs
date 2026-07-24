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
      // Try the next repository-known Playwright location.
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
      channels = chunk[9] === 6 ? 4 : chunk[9] === 2 ? 3 : 0;
      if (chunk[8] !== 8 || chunk[12] !== 0 || !channels) throw new Error("Unsupported PNG encoding");
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
      if (colors.size < 4096) colors.add(`${red},${green},${blue},${alpha}`);
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
const baseUrl = process.env.AUTOCHESS_BASE_URL || "http://127.0.0.1:3100";
const artifactDirectory = ".tmp/autochess/trait-layout";
mkdirSync(artifactDirectory, { recursive: true });

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 2048, height: 1104 } });
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  const response = await page.goto(`${baseUrl}/game/autochess?seed=31`, { waitUntil: "domcontentloaded" });
  if (!response?.ok()) throw new Error(`Autochess URL returned ${response?.status()}`);
  const canvas = page.locator('[data-game-canvas="rift-line"]');
  await canvas.waitFor();
  await page.waitForFunction(() => typeof window.render_game_to_text === "function");

  const attached = await page.evaluate(() => {
    const host = document.querySelector('[data-game-canvas="rift-line"]')?.parentElement;
    const fiberKey = host && Object.keys(host).find((key) => key.startsWith("__reactFiber$"));
    let fiber = fiberKey ? host[fiberKey] : null;
    while (fiber) {
      let hook = fiber.memoizedState;
      while (hook) {
        const current = hook.memoizedState?.current;
        if (current?.engine?.state && typeof current.dispatch === "function") window.__codexAutoChessBridge = current;
        if (current?.scene?.getScene) window.__codexAutoChessGame = current;
        hook = hook.next;
      }
      fiber = fiber.return;
    }
    return Boolean(window.__codexAutoChessBridge && window.__codexAutoChessGame);
  });
  if (!attached) throw new Error("Unable to locate the active game and bridge through the React host");

  await page.evaluate(() => {
    const bridge = window.__codexAutoChessBridge;
    const engine = bridge.engine;
    engine.startRun(engine.state.starterChoices[0]);
    engine.state.playerLevel = 10;
    engine.state.board.fill(null);
    [
      "sui_blue",
      "sui_cat",
      "sun_guard",
      "xuehui",
      "pako",
      "clock_gunner",
      "gale_archer",
      "sui_flower",
      "ember_blade",
    ].forEach((id, index) => {
      engine.state.board[index] = { uid: 700 + index, id, star: 1 };
    });
    bridge.dispatch({ type: "clearSelection" });
  });
  await page.waitForTimeout(250);

  const layout = await page.evaluate(() => {
    const scene = window.__codexAutoChessGame.scene.getScene("RiftLineScene");
    const zones = scene.traitContent.list
      .filter((child) => child.type === "Zone")
      .map((zone) => ({ x: zone.x - zone.width / 2, y: zone.y - zone.height / 2, width: zone.width, height: zone.height }));
    return {
      zones,
      rows: [...new Set(zones.map((zone) => zone.y))],
      canvas: {
        width: scene.game.canvas.width,
        height: scene.game.canvas.height,
        logicalWidth: scene.game.canvas.dataset.logicalWidth,
        logicalHeight: scene.game.canvas.dataset.logicalHeight,
      },
      state: JSON.parse(window.render_game_to_text()),
    };
  });

  if (layout.zones.length !== 18) throw new Error(`Expected all 18 traits, found ${layout.zones.length}`);
  if (layout.rows.length !== 3) throw new Error(`Expected three centered trait rows, found ${layout.rows.length}`);
  const outOfBounds = layout.zones.filter((zone) => (
    zone.x < 48 || zone.x + zone.width > 748 || zone.y < 184 || zone.y + zone.height > 260
  ));
  if (outOfBounds.length) throw new Error(`Trait chips escaped the board panel: ${JSON.stringify(outOfBounds)}`);
  if (errors.length) throw new Error(`Browser errors: ${JSON.stringify(errors)}`);

  const screenshotPath = `${artifactDirectory}/all-traits-desktop.png`;
  const buffer = await page.screenshot({ path: screenshotPath, fullPage: true });
  const screenshot = inspectPng(buffer);
  console.log(JSON.stringify({
    screenshotPath,
    screenshot,
    rows: layout.rows,
    bounds: {
      left: Math.min(...layout.zones.map((zone) => zone.x)),
      right: Math.max(...layout.zones.map((zone) => zone.x + zone.width)),
      top: Math.min(...layout.zones.map((zone) => zone.y)),
      bottom: Math.max(...layout.zones.map((zone) => zone.y + zone.height)),
    },
    canvas: layout.canvas,
    phase: layout.state.phase,
    boardCount: layout.state.player.boardCount,
    errors,
  }, null, 2));
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
