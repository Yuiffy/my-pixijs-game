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
      // Try the next known local Playwright installation.
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
      if (chunk[8] !== 8 || ![2, 6].includes(chunk[9])) throw new Error("Unsupported PNG encoding");
      channels = chunk[9] === 6 ? 4 : 3;
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
        const nearest = Math.abs(prediction - left) <= Math.abs(prediction - up)
          && Math.abs(prediction - left) <= Math.abs(prediction - upperLeft)
          ? left
          : Math.abs(prediction - up) <= Math.abs(prediction - upperLeft) ? up : upperLeft;
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
  const metrics = {
    width,
    height,
    colors: colors.size,
    nearBlackRatio: Number((nearBlack / (width * height)).toFixed(4)),
    transparentRatio: Number((transparent / (width * height)).toFixed(4)),
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
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  const baseUrl = process.env.AUTOCHESS_BASE_URL || "http://127.0.0.1:3100";
  const results = [];

  const attachBridge = async () => page.evaluate(() => {
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
          return true;
        }
        hook = hook.next;
      }
      fiber = fiber.return;
    }
    return false;
  });

  const setup = async (unitId) => {
    await page.goto(`${baseUrl}/game/autochess?seed=1`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.locator('[data-game-canvas="rift-line"]').waitFor();
    await page.getByText("火热整活", { exact: true }).click();
    await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === "preparation");
    if (!await attachBridge()) throw new Error("Unable to locate the active EngineBridge through the React host");
    await page.waitForFunction(() => Boolean(window.__codexAutoChessBridge?.engine));
    await page.evaluate((id) => {
      const bridge = window.__codexAutoChessBridge;
      const engine = bridge.engine;
      engine.state.playerLevel = 4;
      engine.state.board.fill(null);
      engine.state.board[0] = { uid: 1, id, star: 1 };
      engine.startBattle();
      const battle = engine.state.battle;
      const source = battle.player[0];
      source.x = 180;
      source.y = 360;
      source.cooldown = 0;
      source.hitPulse = 0;
      source.energy = source.maxEnergy;
      if (id !== "sui") source.moveSpeed = 0;
      battle.enemy.forEach((fighter, index) => {
        fighter.x = index === 0 ? 900 : 980;
        fighter.y = 360;
        fighter.attack = 0;
        fighter.cooldown = 99;
        fighter.armor = 99_999;
        fighter.hp = fighter.maxHp = 99_999;
      });
      bridge.dispatch({ type: "clearSelection" });
    }, unitId);
    await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === "battle");
  };

  const readState = async () => JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  const advance = async (milliseconds) => page.evaluate((value) => window.advanceTime(value), milliseconds);
  const capture = async (name) => {
    const buffer = await page.screenshot({ path: `${artifactDirectory}/${name}.png`, fullPage: true });
    return inspectPng(buffer);
  };

  await setup("sui");
  await advance(50);
  let state = await readState();
  const sui = state.battle.playerUnits.find((unit) => unit.unitId === "sui");
  const suiRuntime = await page.evaluate(() => {
    const battle = window.__codexAutoChessBridge.engine.state.battle;
    return { barrageActive: battle.player[0].barrageActive, effects: battle.effects.map((effect) => effect.text).filter(Boolean) };
  });
  if (!suiRuntime.barrageActive) throw new Error(`小红帽未在满能量时攻击释放: ${JSON.stringify({ state: sui, runtime: suiRuntime })}`);
  results.push({ unitId: "sui", phase: state.phase, energy: sui.energy, ...suiRuntime, screenshot: await capture("skill-cast-sui") });

  for (const unitId of ["rift_brawler", "meme"]) {
    await setup(unitId);
    await advance(50);
    state = await readState();
    let source = state.battle.playerUnits.find((unit) => unit.unitId === unitId);
    let runtime = await page.evaluate(() => {
      const battle = window.__codexAutoChessBridge.engine.state.battle;
      return { energy: battle.player[0].energy, effects: battle.effects.map((effect) => effect.text).filter(Boolean) };
    });
    if (runtime.energy < source.maxEnergy || runtime.effects.includes(source.name)) {
      throw new Error(`${unitId} 在攻击距离外提前释放: ${JSON.stringify({ state: source, runtime })}`);
    }
    await page.evaluate(() => {
      const battle = window.__codexAutoChessBridge.engine.state.battle;
      const source = battle.player[0];
      battle.enemy[0].x = source.x + source.range - 1;
      battle.enemy[0].y = source.y;
    });
    await advance(50);
    state = await readState();
    source = state.battle.playerUnits.find((unit) => unit.unitId === unitId);
    runtime = await page.evaluate(() => {
      const battle = window.__codexAutoChessBridge.engine.state.battle;
      return { energy: battle.player[0].energy, effects: battle.effects.map((effect) => effect.text).filter(Boolean) };
    });
    if (!runtime.effects.length) {
      throw new Error(`${unitId} 进入攻击距离后未释放: ${JSON.stringify({ state: source, runtime })}`);
    }
    results.push({ unitId, phase: state.phase, energy: source.energy, ...runtime, screenshot: await capture(`skill-cast-${unitId}`) });
  }

  const canvas = page.locator('[data-game-canvas="rift-line"]');
  const canvasMeta = await canvas.evaluate((element) => ({
    width: element.width,
    height: element.height,
    logicalWidth: element.dataset.logicalWidth,
    logicalHeight: element.dataset.logicalHeight,
  }));
  if (errors.length) throw new Error(`Chrome errors: ${JSON.stringify(errors)}`);
  console.log(JSON.stringify({ results, canvas: canvasMeta, errors }, null, 2));
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
