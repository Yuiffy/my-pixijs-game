const assert = require("node:assert/strict");
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
  assert.equal(buffer.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
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
      assert.equal(chunk[8], 8);
      assert.equal(chunk[12], 0);
      assert.ok(channels);
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
    assert.ok(filter <= 4, `Unsupported PNG filter ${filter}`);
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
  assert.ok(
    metrics.colors > 1 && metrics.nearBlackRatio < 0.97 && metrics.transparentRatio < 0.97,
    `Invalid screenshot: ${JSON.stringify(metrics)}`,
  );
  return metrics;
};

const { chromium } = loadPlaywright();
const baseUrl = process.env.AUTOCHESS_BASE_URL || "http://127.0.0.1:3100";
const artifactDirectory = ".tmp/autochess/komichi";
mkdirSync(artifactDirectory, { recursive: true });

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
    let game = null;
    while (hook) {
      const current = hook.memoizedState?.current;
      if (current?.engine?.state) bridge = current;
      if (current?.scene?.getScene && current?.canvas) game = current;
      hook = hook.next;
    }
    if (!bridge || !game) throw new Error("Unable to locate the autochess engine and Phaser game");
    bridge.setHidden(true);
    window.__komichiBridge = bridge;
    window.__komichiEngine = bridge.engine;
    window.__komichiGame = game;
  });
};

const komichiState = async (page) => page.evaluate(() => {
  const engine = window.__komichiEngine;
  const battle = engine.state.battle;
  const komichi = battle?.player.find((fighter) => fighter.unitId === "komichi");
  const textState = JSON.parse(window.render_game_to_text());
  const textFighter = textState.battle?.playerUnits.find((fighter) => fighter.unitId === "komichi");
  const scene = window.__komichiGame.scene.getScene("RiftLineScene");
  const fighterView = scene.fighterViews?.get(komichi?.fid);
  const portrait = fighterView?.getByName("portrait")?.getByName("portraitImage");
  const signpostVisible = [...(scene.effectViews?.values() || [])].some(
    (view) => view.getByName("komichiSignpost")?.visible,
  );
  return {
    phase: engine.state.phase,
    elapsed: battle?.elapsed ?? null,
    signTime: komichi?.komichiSignTime ?? null,
    range: komichi?.range ?? null,
    baseRange: komichi?.baseRange ?? null,
    x: komichi?.x ?? null,
    y: komichi?.y ?? null,
    effects: battle?.effects.map((effect) => effect.kind) ?? [],
    portraitTexture: portrait?.texture?.key ?? null,
    signpostVisible,
    textFighter: textFighter
      ? {
        unitId: textFighter.unitId,
        signTime: textFighter.komichiSignTime,
        range: textFighter.range,
      }
      : null,
  };
});

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  const failedResponses = [];
  const requestedAssets = new Set();
  const screenshots = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    const url = response.url();
    if (url.includes("/images/autochess/") && url.includes("komichi")) requestedAssets.add(url);
    if (response.status() >= 400) failedResponses.push({ status: response.status(), url });
  });

  const capture = async (filename) => {
    const path = `${artifactDirectory}/${filename}`;
    const buffer = await page.screenshot({ path, fullPage: true });
    const result = { path, bytes: buffer.length, metrics: inspectPng(buffer) };
    screenshots.push(result);
    return result;
  };

  const response = await page.goto(`${baseUrl}/game/autochess?seed=401`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  assert.ok(response?.ok(), `Autochess URL returned ${response?.status()}`);
  const canvas = page.locator('[data-game-canvas="rift-line"]');
  await canvas.waitFor();
  await page.waitForFunction(() => typeof window.render_game_to_text === "function");
  await page.locator(".rift-dom-choice").first().click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === "preparation");
  await attachEngine(page);

  await page.evaluate(() => {
    const engine = window.__komichiEngine;
    engine.state.round = 1;
    engine.state.playerLevel = 3;
    engine.state.board.fill(null);
    engine.state.board[0] = { uid: 40101, id: "komichi", star: 1 };
    engine.startBattle();
    const battle = engine.state.battle;
    const komichi = battle.player.find((fighter) => fighter.unitId === "komichi");
    komichi.x = 430;
    komichi.y = 360;
    komichi.energy = 0;
    komichi.cooldown = 99;
    komichi.hp = komichi.maxHp = 99_999;
    battle.enemy.splice(1);
    battle.enemy.forEach((fighter, index) => {
      fighter.x = 540 + index * 90;
      fighter.y = 360 + (index % 2) * 100;
      fighter.attack = 0;
      fighter.cooldown = 99;
      fighter.energy = 0;
      fighter.maxEnergy = 99_999;
      fighter.energyPerSecond = 0;
      fighter.energyOnAttack = 0;
      fighter.energyOnHit = 0;
      fighter.hp = fighter.maxHp = 99_999;
      fighter.dodgeChance = 0;
    });
  });
  await page.evaluate(() => window.advanceTime(1));
  const idle = await komichiState(page);
  assert.equal(idle.phase, "battle");
  assert.equal(idle.signTime, 0);
  assert.equal(idle.range, idle.baseRange);
  assert.equal(idle.portraitTexture, "rift-unit:minimal:komichi");
  assert.equal(idle.signpostVisible, false);
  await capture("komichi-idle-empty-handed.png");

  await page.evaluate(() => {
    const engine = window.__komichiEngine;
    const battle = engine.state.battle;
    const komichi = battle.player.find((fighter) => fighter.unitId === "komichi");
    const target = battle.enemy.find((fighter) => fighter.alive);
    target.x = komichi.x + 45;
    target.y = komichi.y;
    komichi.cooldown = 0;
    komichi.energy = komichi.maxEnergy;
  });
  await page.evaluate(() => window.advanceTime(20));
  const cast = await komichiState(page);
  assert.ok(cast.signTime > 5.4 && cast.signTime <= 5.5);
  assert.ok(cast.range >= cast.baseRange + 105);
  assert.ok(cast.effects.includes("komichi_sign"));
  assert.equal(cast.portraitTexture, "rift-unit-ability:minimal:komichi");
  assert.equal(cast.signpostVisible, true);
  await capture("komichi-cast-signpost-effect.png");

  await page.evaluate(() => window.advanceTime(760));
  const active = await komichiState(page);
  assert.ok(active.signTime > 4.5);
  assert.ok(active.range >= active.baseRange + 105);
  assert.ok(!active.effects.includes("komichi_sign"));
  assert.ok(active.textFighter?.signTime > 0);
  assert.equal(active.portraitTexture, "rift-unit-ability:minimal:komichi");
  assert.equal(active.signpostVisible, false);
  await capture("komichi-active-holding-sign.png");

  await page.evaluate(() => window.advanceTime(5000));
  const ended = await komichiState(page);
  assert.equal(ended.signTime, 0);
  assert.equal(ended.range, ended.baseRange);
  assert.equal(ended.textFighter?.signTime, 0);
  assert.equal(ended.portraitTexture, "rift-unit:minimal:komichi");
  assert.equal(ended.signpostVisible, false);
  await capture("komichi-ended-empty-handed.png");

  const canvasState = await canvas.evaluate((element) => ({
    width: element.width,
    height: element.height,
    logicalWidth: element.dataset.logicalWidth,
    logicalHeight: element.dataset.logicalHeight,
    layoutProfile: element.dataset.layoutProfile,
  }));
  assert.equal(canvasState.logicalWidth, "1120");
  assert.equal(canvasState.logicalHeight, "720");
  assert.deepEqual(errors, []);
  assert.deepEqual(failedResponses, []);
  assert.ok([...requestedAssets].some((url) => url.endsWith("/portraits/minimal/komichi.png")));
  assert.ok([...requestedAssets].some((url) => url.endsWith("/portraits/minimal/komichi-sign.png")));
  assert.ok([...requestedAssets].some((url) => url.endsWith("/effects/komichi-signpost.png")));

  console.log(JSON.stringify({
    idle,
    cast,
    active,
    ended,
    requestedAssets: [...requestedAssets],
    canvas: canvasState,
    screenshots,
    errors,
    failedResponses,
  }, null, 2));
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
