const { createRequire } = require("node:module");
const { existsSync, mkdirSync } = require("node:fs");
const { inflateSync } = require("node:zlib");

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

const inspectPng = (buffer) => {
  if (buffer.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    throw new Error("Screenshot is not a PNG");
  }
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
        const distances = [
          Math.abs(prediction - left),
          Math.abs(prediction - up),
          Math.abs(prediction - upperLeft),
        ];
        const nearest = distances[0] <= distances[1] && distances[0] <= distances[2]
          ? left
          : distances[1] <= distances[2] ? up : upperLeft;
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
const baseUrl = process.env.AUTOCHESS_BASE_URL || "http://127.0.0.1:3001";
const artifactDirectory = ".tmp/autochess/talent-strip";
mkdirSync(artifactDirectory, { recursive: true });

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  const failedResponses = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400) failedResponses.push({ status: response.status(), url: response.url() });
  });

  const response = await page.goto(`${baseUrl}/game/autochess?seed=11`, { waitUntil: "domcontentloaded" });
  if (!response?.ok()) throw new Error(`Autochess URL returned ${response?.status()}`);
  await page.locator('[data-game-canvas="rift-line"]').waitFor();
  await page.waitForFunction(() => typeof window.render_game_to_text === "function");
  const attached = await page.evaluate(() => {
    const canvas = document.querySelector('[data-game-canvas="rift-line"]');
    const host = canvas?.parentElement;
    const fiberKey = host && Object.keys(host).find((key) => key.startsWith("__reactFiber$"));
    let fiber = fiberKey ? host[fiberKey] : null;
    while (fiber) {
      let hook = fiber.memoizedState;
      while (hook) {
        const current = hook.memoizedState?.current;
        if (current?.engine?.state && typeof current.dispatch === "function") {
          window.__codexAutoChessBridge = current;
        }
        if (current?.scene?.getScene) window.__codexAutoChessGame = current;
        hook = hook.next;
      }
      fiber = fiber.return;
    }
    return Boolean(window.__codexAutoChessBridge && window.__codexAutoChessGame);
  });
  if (!attached) throw new Error("Unable to locate game and engine bridge through React");

  await page.evaluate(() => {
    const bridge = window.__codexAutoChessBridge;
    bridge.dispatch({ type: "starter", id: bridge.engine.state.starterChoices[0] });
    bridge.engine.state.round = 11;
    bridge.engine.state.phase = "preparation";
    bridge.engine.state.augments = ["tempered", "second_wind", "momentum", "tempered"];
    bridge.engine.state.augmentHistory = [
      { round: 2, id: "tempered" },
      { round: 4, id: "second_wind" },
      { round: 8, id: "momentum" },
      { round: 10, id: "tempered" },
    ];
    bridge.dispatch({ type: "clearSelection" });
  });
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).augmentHistory.length === 4);

  const sceneState = await page.evaluate(() => {
    const scene = window.__codexAutoChessGame.scene.getScene("RiftLineScene");
    const flatten = (items) => items.flatMap((item) => [
      item,
      ...(Array.isArray(item.list) ? flatten(item.list) : []),
    ]);
    const objects = flatten(scene.children.list);
    const boundsFor = (prefix) => objects
      .filter((item) => item.name?.startsWith(prefix))
      .map((item) => {
        const bounds = item.getBounds();
        return {
          name: item.name,
          x: bounds.x,
          y: bounds.y,
          right: bounds.right,
          bottom: bounds.bottom,
        };
      });
    return {
      augments: boundsFor("augment-history-"),
      enemies: boundsFor("enemy-preview-"),
    };
  });
  if (sceneState.augments.length !== 3) throw new Error(`Expected three grouped talent icons: ${JSON.stringify(sceneState)}`);
  if (!sceneState.enemies.length) throw new Error(`Enemy preview zones are missing: ${JSON.stringify(sceneState)}`);
  const augmentRight = Math.max(...sceneState.augments.map((bounds) => bounds.right));
  const enemyLeft = Math.min(...sceneState.enemies.map((bounds) => bounds.x));
  if (augmentRight >= enemyLeft) {
    throw new Error(`Talent strip overlaps enemy preview: ${JSON.stringify({ augmentRight, enemyLeft, sceneState })}`);
  }

  const capture = async (name) => {
    const path = `${artifactDirectory}/${name}.png`;
    const buffer = await page.screenshot({ path, fullPage: true });
    return { path, bytes: buffer.length, ...inspectPng(buffer) };
  };
  const defaultScreenshot = await capture("talent-strip-default");

  const canvas = page.locator('[data-game-canvas="rift-line"]');
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Canvas is not visible");
  const logical = await canvas.evaluate((element) => ({
    width: Number(element.dataset.logicalWidth || 1120),
    height: Number(element.dataset.logicalHeight || 720),
    physicalWidth: element.width,
    physicalHeight: element.height,
    profile: element.dataset.layoutProfile,
  }));
  const scale = Math.min(box.width / logical.width, box.height / logical.height);
  const point = {
    x: box.x + (box.width - logical.width * scale) / 2 + 202 * scale,
    y: box.y + (box.height - logical.height * scale) / 2 + 123 * scale,
  };
  await page.mouse.move(point.x, point.y);
  await page.waitForTimeout(160);

  const tooltipText = await page.evaluate(() => {
    const scene = window.__codexAutoChessGame.scene.getScene("RiftLineScene");
    const tooltip = scene.tooltipLayer.list.find((item) => item.name === "tooltip");
    const flatten = (items) => items.flatMap((item) => [
      item,
      ...(Array.isArray(item.list) ? flatten(item.list) : []),
    ]);
    return tooltip
      ? flatten(tooltip.list).filter((item) => typeof item.text === "string").map((item) => item.text).join("\n")
      : "";
  });
  for (const expected of ["果冻风纪", "所有友军获得 10 护甲", "第 2、10 战获得", "已叠加 2 次"]) {
    if (!tooltipText.includes(expected)) throw new Error(`Talent tooltip is missing ${expected}: ${tooltipText}`);
  }
  const hoverScreenshot = await capture("talent-strip-hover");

  const textState = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  if (textState.phase !== "preparation" || textState.round !== 11 || textState.augmentHistory.length !== 4) {
    throw new Error(`Text state disagrees with the tested scene: ${JSON.stringify(textState)}`);
  }
  if (errors.length) throw new Error(`Browser errors: ${JSON.stringify(errors)}`);
  if (failedResponses.length) throw new Error(`Failed responses: ${JSON.stringify(failedResponses)}`);

  console.log(JSON.stringify({
    layout: { logical, box },
    separation: { augmentRight, enemyLeft, gap: enemyLeft - augmentRight },
    tooltipText,
    textState: {
      phase: textState.phase,
      round: textState.round,
      augmentHistory: textState.augmentHistory,
    },
    screenshots: {
      default: defaultScreenshot,
      hover: hoverScreenshot,
    },
    errors,
  }, null, 2));
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
