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
      // Try the next local Playwright installation.
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
      channels = chunk[9] === 6 ? 4 : chunk[9] === 2 ? 3 : 0;
      if (chunk[8] !== 8 || chunk[12] !== 0 || !channels) {
        throw new Error("Unsupported PNG encoding");
      }
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
    for (let index = 0; index < stride; index += 1) {
      const left = index >= channels ? row[index - channels] : 0;
      const up = previous[index];
      const upperLeft = index >= channels ? previous[index - channels] : 0;
      if (filter === 1) row[index] = (row[index] + left) & 255;
      if (filter === 2) row[index] = (row[index] + up) & 255;
      if (filter === 3) row[index] = (row[index] + Math.floor((left + up) / 2)) & 255;
      if (filter === 4) {
        const prediction = left + up - upperLeft;
        const leftDistance = Math.abs(prediction - left);
        const upDistance = Math.abs(prediction - up);
        const upperLeftDistance = Math.abs(prediction - upperLeft);
        const nearest = leftDistance <= upDistance && leftDistance <= upperLeftDistance
          ? left
          : upDistance <= upperLeftDistance ? up : upperLeft;
        row[index] = (row[index] + nearest) & 255;
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
const artifactDirectory = ".tmp/autochess/mature-starter";
mkdirSync(artifactDirectory, { recursive: true });
let browser;

(async () => {
  browser = await chromium.launch({ channel: "chrome", headless: true });
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

  const baseUrl = process.env.AUTOCHESS_BASE_URL || "http://127.0.0.1:3100";
  const response = await page.goto(`${baseUrl}/game/autochess?seed=2`, { waitUntil: "domcontentloaded" });
  if (!response?.ok()) throw new Error(`Autochess URL returned ${response?.status()}`);

  const canvas = page.locator('[data-game-canvas="rift-line"]');
  await canvas.waitFor();
  const matureCard = page.getByText("成熟稳重", { exact: true });
  await matureCard.waitFor();
  const description = page.getByText(
    "携带浣熊店员开局；所有友军开战获得 8% 最大生命护盾，初始金币 +2。",
    { exact: true },
  );
  await description.waitFor();
  const descriptionText = await description.textContent();
  const titleBuffer = await page.screenshot({
    path: `${artifactDirectory}/mature-starter-choice.png`,
    fullPage: true,
  });
  const titleScreenshot = inspectPng(titleBuffer);
  await matureCard.click();

  await page.evaluate(() => {
    for (const node of document.querySelectorAll("*")) {
      const key = Object.keys(node).find((name) => name.startsWith("__reactFiber$"));
      let fiber = key ? node[key] : null;
      while (fiber) {
        const props = fiber.memoizedProps;
        if (props?.engine?.state && typeof props.onAction === "function") {
          window.__matureStarterTest = props;
          return;
        }
        fiber = fiber.return;
      }
    }
    throw new Error("Unable to locate the autochess engine");
  });

  const battleState = await page.evaluate(() => {
    const { engine, onAction } = window.__matureStarterTest;
    engine.state.playerLevel = 4;
    engine.state.phase = "preparation";
    engine.state.battle = null;
    engine.state.board.fill(null);
    engine.state.board[0] = { uid: 9001, id: "gale_archer", star: 1 };
    engine.state.board[1] = { uid: 9002, id: "ember_blade", star: 1 };
    engine.startBattle();
    onAction({ type: "clearSelection" });
    return engine.state.battle.player.map((fighter) => ({
      name: fighter.unitId,
      hp: fighter.maxHp,
      shield: fighter.shield,
      shieldRatio: fighter.shield / fighter.maxHp,
      matureMember: fighter.matureMember,
    }));
  });

  if (
    battleState.length !== 2
    || battleState.some((fighter) => Math.abs(fighter.shieldRatio - 0.08) > 1e-9)
    || battleState.filter((fighter) => fighter.matureMember).length !== 0
  ) {
    throw new Error(`Opening shield did not apply without an active mature trait: ${JSON.stringify(battleState)}`);
  }

  await page.waitForTimeout(150);
  const battleBuffer = await page.screenshot({
    path: `${artifactDirectory}/mature-starter-battle.png`,
    fullPage: true,
  });
  const battleScreenshot = inspectPng(battleBuffer);
  const textState = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  const canvasState = await canvas.evaluate((element) => ({
    width: element.width,
    height: element.height,
    logicalWidth: element.dataset.logicalWidth,
    logicalHeight: element.dataset.logicalHeight,
  }));
  if (textState.phase !== "battle" || textState.battle?.playerUnits?.length !== 2) {
    throw new Error(`Text state did not match battle setup: ${JSON.stringify(textState)}`);
  }
  if (errors.length || failedResponses.length) {
    throw new Error(`Browser errors: ${JSON.stringify({ errors, failedResponses })}`);
  }

  console.log(JSON.stringify({
    description: descriptionText,
    battleState,
    titleScreenshot,
    battleScreenshot,
    canvas: canvasState,
    textPhase: textState.phase,
    errors,
    failedResponses,
  }, null, 2));
  await browser.close();
})().catch(async (error) => {
  console.error(error);
  await browser?.close();
  process.exitCode = 1;
});
