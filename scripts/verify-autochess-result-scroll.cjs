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
const artifactDirectory = ".tmp/autochess/result-scroll";
mkdirSync(artifactDirectory, { recursive: true });

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  const failedResponses = [];
  const screenshots = {};
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400) failedResponses.push({ status: response.status(), url: response.url() });
  });

  const response = await page.goto(`${baseUrl}/game/autochess?seed=37`, { waitUntil: "domcontentloaded" });
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
  if (!attached) throw new Error("Unable to locate the AutoChess bridge and Phaser game");

  await page.evaluate(() => {
    const bridge = window.__codexAutoChessBridge;
    const engine = bridge.engine;
    bridge.dispatch({ type: "starter", id: engine.state.starterChoices[0] });
    bridge.dispatch({ type: "battle" });
    const battle = engine.state.battle;
    if (!battle?.player.length || !battle.enemy.length) throw new Error("Battle fighters were not initialized");
    const cloneTeam = (bases, count, team) => Array.from({ length: count }, (_, index) => {
      const fighter = bases[index % bases.length];
      const maximum = Math.round(fighter.maxHp + index * 37);
      return {
        ...fighter,
        fid: `result-scroll-${team}-${index}`,
        team,
        star: ((index % 3) + 1),
        hp: index % 4 === 3 ? 0 : Math.max(1, maximum - index * 29),
        maxHp: maximum,
        shield: index % 3 === 0 ? 45 + index * 6 : 0,
        damageDealt: (count - index) * 317,
        healingDone: index * 83,
        shieldingDone: index * 61,
        damageTaken: (index + 1) * 211,
        alive: index % 4 !== 3,
      };
    });
    battle.player = cloneTeam(battle.player, 10, "player");
    battle.enemy = cloneTeam(battle.enemy, 8, "enemy");
    battle.rankingMetric = "damage";
    battle.rankingOpen = false;
    engine.state.result = {
      won: true,
      headline: "Scrollable result verification",
      detail: "Fixed row height with complete ranking data",
      income: 180,
      bounty: 15,
      defeatedEnemies: 6,
      defeatedByStar: { 1: 3, 2: 2, 3: 1 },
      upgradeDiscount: 0,
      damage: 0,
    };
    engine.state.phase = "result";
    bridge.onEvent?.({ type: "state" });
  });
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === "result");
  await page.waitForTimeout(150);

  const pointForLogical = async (x, y) => {
    const box = await canvas.boundingBox();
    if (!box) throw new Error("Canvas is not visible");
    const logical = await canvas.evaluate((element) => ({
      width: Number(element.dataset.logicalWidth || 1120),
      height: Number(element.dataset.logicalHeight || 720),
    }));
    const scale = Math.min(box.width / logical.width, box.height / logical.height);
    return {
      x: box.x + (box.width - logical.width * scale) / 2 + x * scale,
      y: box.y + (box.height - logical.height * scale) / 2 + y * scale,
    };
  };
  const inspectScene = async () => page.evaluate(() => {
    const scene = window.__codexAutoChessGame.scene.getScene("RiftLineScene");
    const named = (name) => scene.overlayLayer.list.find((item) => item.name === name);
    return {
      offsets: { ...scene.resultScrollOffsets },
      playerRange: named("resultRange-player")?.text,
      enemyRange: named("resultRange-enemy")?.text,
      rowNames: scene.overlayLayer.list
        .map((item) => item.name)
        .filter((name) => name?.startsWith("resultRow-")),
      playerScrollbar: Boolean(named("resultScrollbar-player")),
      enemyScrollbar: Boolean(named("resultScrollbar-enemy")),
      tooltipObjects: scene.tooltipLayer.list.length,
    };
  });
  const capture = async (name) => {
    const path = `${artifactDirectory}/${name}.png`;
    const buffer = await page.screenshot({ path, fullPage: true });
    screenshots[name] = { path, bytes: buffer.length, ...inspectPng(buffer) };
  };

  const state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  if (state.battle.ranking.playerRows.length !== 10 || state.battle.ranking.enemyRows.length !== 8) {
    throw new Error(`Text ranking lost rows: ${JSON.stringify(state.battle.ranking)}`);
  }
  const initial = await inspectScene();
  if (initial.playerRange !== "1\u20136 / 10" || initial.enemyRange !== "1\u20136 / 8") {
    throw new Error(`Initial ranges are wrong: ${JSON.stringify(initial)}`);
  }
  if (initial.rowNames.length !== 12 || !initial.playerScrollbar || !initial.enemyScrollbar) {
    throw new Error(`Initial viewport is wrong: ${JSON.stringify(initial)}`);
  }

  const playerRow = await pointForLogical(260, 300);
  await page.mouse.move(playerRow.x, playerRow.y);
  await page.waitForTimeout(100);
  const hoverInitial = await inspectScene();
  if (!hoverInitial.tooltipObjects) throw new Error("Visible result row did not open its unit tooltip");
  await capture("result-top-hover");

  const playerList = await pointForLogical(300, 430);
  await page.mouse.move(playerList.x, playerList.y);
  await page.mouse.wheel(0, 500);
  await page.waitForTimeout(120);
  const afterWheel = await inspectScene();
  if (afterWheel.offsets.player !== 1 || afterWheel.offsets.enemy !== 0) {
    throw new Error(`Player wheel scroll was not independent: ${JSON.stringify(afterWheel)}`);
  }
  if (afterWheel.playerRange !== "2\u20137 / 10" || !afterWheel.rowNames.includes("resultRow-player-7")) {
    throw new Error(`Player visible range did not advance: ${JSON.stringify(afterWheel)}`);
  }
  await capture("result-player-scrolled");

  const enemyThumb = await pointForLogical(1041, 393);
  const enemyThumbBottom = await pointForLogical(1041, 471);
  await page.mouse.move(enemyThumb.x, enemyThumb.y);
  await page.mouse.down();
  await page.mouse.move(enemyThumbBottom.x, enemyThumbBottom.y, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(120);
  const afterDrag = await inspectScene();
  if (afterDrag.offsets.player !== 1 || afterDrag.offsets.enemy !== 2) {
    throw new Error(`Enemy thumb drag was not independent: ${JSON.stringify(afterDrag)}`);
  }
  if (afterDrag.enemyRange !== "3\u20138 / 8" || !afterDrag.rowNames.includes("resultRow-enemy-8")) {
    throw new Error(`Enemy visible range did not reach the final row: ${JSON.stringify(afterDrag)}`);
  }

  const enemyRow = await pointForLogical(760, 300);
  await page.mouse.move(enemyRow.x, enemyRow.y);
  await page.waitForTimeout(100);
  const hoverScrolled = await inspectScene();
  if (!hoverScrolled.tooltipObjects) throw new Error("Scrolled result row lost its unit tooltip");
  await capture("result-both-scrolled-hover");

  const supportTab = await pointForLogical(560, 232);
  await page.mouse.click(supportTab.x, supportTab.y);
  await page.waitForTimeout(120);
  const afterMetric = await inspectScene();
  const metricState = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  if (metricState.battle.ranking.metric !== "support") throw new Error("Metric switch did not reach the engine");
  if (afterMetric.offsets.player !== 1 || afterMetric.offsets.enemy !== 2) {
    throw new Error(`Metric switch reset scroll positions: ${JSON.stringify(afterMetric)}`);
  }
  await capture("result-support-preserves-scroll");

  const canvasState = await canvas.evaluate((element) => ({
    width: element.width,
    height: element.height,
    logicalWidth: element.dataset.logicalWidth,
    logicalHeight: element.dataset.logicalHeight,
    profile: element.dataset.layoutProfile,
  }));
  if (errors.length || failedResponses.length) {
    throw new Error(`Browser errors: ${JSON.stringify({ errors, failedResponses })}`);
  }

  console.log(JSON.stringify({
    initial,
    afterWheel,
    afterDrag,
    afterMetric,
    rankingCounts: {
      player: state.battle.ranking.playerRows.length,
      enemy: state.battle.ranking.enemyRows.length,
    },
    canvas: canvasState,
    screenshots,
    errors,
  }, null, 2));
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
