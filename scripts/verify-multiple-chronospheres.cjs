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

const attachEngine = async (page) => {
  await page.evaluate(() => {
    const canvas = document.querySelector('[data-game-canvas="rift-line"]');
    let node = canvas;
    let fiber = null;
    while (node && !fiber) {
      const fiberKey = Object.keys(node).find((key) => key.startsWith("__reactFiber$"));
      fiber = fiberKey ? node[fiberKey] : null;
      node = node.parentElement;
    }
    while (fiber && fiber.type?.name !== "AutoChessGame") fiber = fiber.return;
    let hook = fiber?.memoizedState;
    let bridge = null;
    while (hook) {
      if (hook.memoizedState?.current?.engine?.state) {
        bridge = hook.memoizedState.current;
        break;
      }
      hook = hook.next;
    }
    if (!bridge) throw new Error("Unable to locate the autochess engine bridge");
    window.__multipleChronosphereEngine = bridge.engine;
  });
};

const { chromium } = loadPlaywright();
const baseUrl = process.env.AUTOCHESS_BASE_URL || "http://127.0.0.1:3100";
const artifactDirectory = ".tmp/autochess/multiple-chronospheres";
mkdirSync(artifactDirectory, { recursive: true });

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  const failedResponses = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push({ text: message.text(), location: message.location() });
    }
  });
  page.on("pageerror", (error) => {
    errors.push({ text: error.message, location: null });
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      failedResponses.push({ status: response.status(), url: response.url() });
    }
  });

  await page.goto(`${baseUrl}/game/autochess?seed=206`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  const canvas = page.locator('[data-game-canvas="rift-line"]');
  await canvas.waitFor();
  await page.locator(".rift-dom-choice").first().click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === "preparation");
  await attachEngine(page);

  const setup = await page.evaluate(() => {
    const engine = window.__multipleChronosphereEngine;
    engine.state.round = 6;
    engine.state.playerLevel = 3;
    engine.state.board.fill(null);
    engine.state.board[0] = { uid: 1, id: "spark_mage", star: 1 };
    engine.startBattle();
    const battle = engine.state.battle;
    const playerSource = battle.player[0];
    const enemySource = battle.enemy[0];
    [...battle.player, ...battle.enemy].forEach((fighter) => {
      fighter.attack = 0;
      fighter.cooldown = 99;
      fighter.moveSpeed = 0;
      fighter.energy = 0;
      fighter.hp = fighter.maxHp = 99_999;
    });
    playerSource.energy = playerSource.maxEnergy;
    enemySource.energy = enemySource.maxEnergy;
    playerSource.x = 250;
    playerSource.y = 360;
    enemySource.x = 870;
    enemySource.y = 360;
    battle.chronospheres = [
      {
        sourceFid: playerSource.fid,
        x: 430,
        y: 285,
        radius: 112,
        life: 4,
        maxLife: 4,
        color: "#d98cff",
      },
      {
        sourceFid: enemySource.fid,
        x: 690,
        y: 430,
        radius: 92,
        life: 4,
        maxLife: 4,
        color: "#9c70ff",
      },
    ];
    return {
      playerSourceFid: playerSource.fid,
      enemySourceFid: enemySource.fid,
    };
  });
  await page.evaluate(() => window.advanceTime(16));

  const twoZoneState = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  if (twoZoneState.battle?.visualEffects.chronospheres.length !== 2) {
    throw new Error(`Expected two active chronospheres: ${JSON.stringify(twoZoneState.battle)}`);
  }
  const twoZonePath = `${artifactDirectory}/two-chronospheres.png`;
  const twoZoneBuffer = await page.screenshot({ path: twoZonePath, fullPage: true });
  const twoZoneMetrics = inspectPng(twoZoneBuffer);

  await page.evaluate((sourceFid) => {
    const engine = window.__multipleChronosphereEngine;
    const zone = engine.state.battle.chronospheres.find((entry) => entry.sourceFid === sourceFid);
    zone.life = 0.001;
  }, setup.playerSourceFid);
  await page.evaluate(() => window.advanceTime(50));

  const oneZoneState = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  const remainingZones = oneZoneState.battle?.visualEffects.chronospheres || [];
  if (
    remainingZones.length !== 1
    || Math.abs(remainingZones[0].x - 690) > 0.1
    || Math.abs(remainingZones[0].y - 430) > 0.1
  ) {
    throw new Error(`Expected the enemy chronosphere to remain: ${JSON.stringify(remainingZones)}`);
  }
  const oneZonePath = `${artifactDirectory}/one-chronosphere-remains.png`;
  const oneZoneBuffer = await page.screenshot({ path: oneZonePath, fullPage: true });
  const oneZoneMetrics = inspectPng(oneZoneBuffer);

  const canvasBox = await canvas.boundingBox();
  const canvasMeta = await canvas.evaluate((element) => ({
    width: element.width,
    height: element.height,
    logicalWidth: element.dataset.logicalWidth,
    logicalHeight: element.dataset.logicalHeight,
  }));
  const unexpectedErrors = errors.filter((error) => !error.text.includes("/api/record"));
  const unexpectedResponses = failedResponses.filter(
    (response) => !response.url.endsWith("/api/record"),
  );
  if (!canvasBox || canvasBox.width < 1000 || canvasBox.height < 500) {
    throw new Error(`Game canvas size is invalid: ${JSON.stringify(canvasBox)}`);
  }
  if (unexpectedErrors.length || unexpectedResponses.length) {
    throw new Error(`Chrome errors: ${JSON.stringify({ unexpectedErrors, unexpectedResponses })}`);
  }

  console.log(JSON.stringify({
    setup,
    twoZones: twoZoneState.battle.visualEffects.chronospheres,
    remainingZones,
    screenshots: [
      { path: twoZonePath, bytes: twoZoneBuffer.length, metrics: twoZoneMetrics },
      { path: oneZonePath, bytes: oneZoneBuffer.length, metrics: oneZoneMetrics },
    ],
    canvasBox,
    canvasMeta,
    errors: [],
    failedResponses: [],
  }, null, 2));
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
