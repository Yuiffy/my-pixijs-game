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
const artifactDirectory = ".tmp/autochess/shields";
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

  const baseUrl = process.env.AUTOCHESS_BASE_URL || "http://127.0.0.1:3001";
  const response = await page.goto(`${baseUrl}/game/autochess?seed=149`, { waitUntil: "domcontentloaded" });
  if (!response?.ok()) throw new Error(`Autochess URL returned ${response?.status()}`);

  const canvas = page.locator('[data-game-canvas="rift-line"]');
  await canvas.waitFor();
  await page.getByText("火热整活", { exact: true }).click();
  await page.evaluate(() => {
    for (const node of document.querySelectorAll("*")) {
      const key = Object.keys(node).find((name) => name.startsWith("__reactFiber$"));
      let fiber = key ? node[key] : null;
      while (fiber) {
        const props = fiber.memoizedProps;
        if (props?.engine?.state && typeof props.onAction === "function") {
          window.__autochessShieldTest = props;
          return;
        }
        fiber = fiber.return;
      }
    }
    throw new Error("Unable to locate the autochess engine");
  });

  const setupBattle = async () => page.evaluate(() => {
    const { engine, onAction } = window.__autochessShieldTest;
    engine.state.round = 2;
    engine.state.playerLevel = 4;
    engine.state.phase = "preparation";
    engine.state.battle = null;
    engine.state.board.fill(null);
    engine.state.board[0] = { uid: 9001, id: "mossback", star: 1 };
    engine.startBattle();
    onAction({ type: "clearSelection" });
    return {
      playerCount: engine.state.battle.player.length,
      enemyCount: engine.state.battle.enemy.length,
    };
  });

  const setup = await setupBattle();
  if (setup.playerCount !== 1 || setup.enemyCount !== 3) {
    throw new Error(`Unexpected pressure lineup: ${JSON.stringify(setup)}`);
  }

  const firstCast = await page.evaluate(() => {
    const { engine, onAction } = window.__autochessShieldTest;
    const battle = engine.state.battle;
    const mossback = battle.player[0];
    battle.enemy.forEach((fighter) => {
      fighter.attack = 0;
      fighter.baseAttack = 0;
      fighter.cooldown = 99;
    });
    mossback.energy = mossback.maxEnergy;
    engine.update(0.05);
    onAction({ type: "clearSelection" });
    return {
      energyPerSecond: mossback.energyPerSecond,
      energyOnAttack: mossback.energyOnAttack,
      energyOnHit: mossback.energyOnHit,
      shield: mossback.shield,
      shieldingDone: mossback.shieldingDone,
      phase: engine.state.phase,
    };
  });
  if (
    firstCast.energyPerSecond !== 8
    || firstCast.energyOnAttack !== 6
    || firstCast.energyOnHit !== 3
    || firstCast.shield <= 0
    || firstCast.phase !== "battle"
  ) {
    throw new Error(`Mossback shield profile did not apply: ${JSON.stringify(firstCast)}`);
  }
  await page.waitForTimeout(150);
  const screenshotBuffer = await page.screenshot({
    path: `${artifactDirectory}/mossback-first-shield.png`,
    fullPage: true,
  });
  const screenshot = inspectPng(screenshotBuffer);

  await setupBattle();
  const pressure = await page.evaluate(() => {
    const { engine, onAction } = window.__autochessShieldTest;
    const battle = engine.state.battle;
    const mossback = battle.player[0];
    battle.enemy.forEach((fighter) => {
      fighter.hp = 99_999;
      fighter.maxHp = 99_999;
    });
    let castCount = 0;
    const castAbility = engine.castAbility.bind(engine);
    engine.castAbility = (source, targets) => {
      if (source === mossback) castCount += 1;
      return castAbility(source, targets);
    };
    for (let tick = 0; tick < 480 && engine.state.phase === "battle"; tick += 1) {
      engine.update(0.05);
    }
    onAction({ type: "clearSelection" });
    return {
      castCount,
      alive: mossback.alive,
      shield: mossback.shield,
      phase: engine.state.phase,
      elapsed: battle.elapsed,
      energyPerSecond: mossback.energyPerSecond,
      energyOnAttack: mossback.energyOnAttack,
      energyOnHit: mossback.energyOnHit,
    };
  });
  if (
    pressure.castCount < 1
    || pressure.castCount > 2
    || pressure.alive
    || pressure.shield !== 0
    || pressure.phase !== "result"
  ) {
    throw new Error(`Mossback sustained incorrectly: ${JSON.stringify(pressure)}`);
  }

  const textState = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  const canvasState = await canvas.evaluate((element) => ({
    width: element.width,
    height: element.height,
    logicalWidth: element.dataset.logicalWidth,
    logicalHeight: element.dataset.logicalHeight,
  }));
  if (textState.phase !== "result") throw new Error(`Text state did not reach result: ${textState.phase}`);
  if (errors.length || failedResponses.length) {
    throw new Error(`Browser errors: ${JSON.stringify({ errors, failedResponses })}`);
  }

  console.log(JSON.stringify({
    firstCast,
    pressure,
    screenshot,
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
