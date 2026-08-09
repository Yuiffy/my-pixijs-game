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
const artifactDirectory = ".tmp/autochess/mimi-rutice-effects";
mkdirSync(artifactDirectory, { recursive: true });

const attachEngine = async (page) => page.evaluate(() => {
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
  window.__supportFxEngine = bridge.engine;
  window.__supportFxGame = game;
});

const state = async (page) => page.evaluate(() => {
  const engine = window.__supportFxEngine;
  const battle = engine.state.battle;
  const textState = JSON.parse(window.render_game_to_text());
  const scene = window.__supportFxGame.scene.getScene("RiftLineScene");
  const labels = [...(scene.effectViews?.values() || [])]
    .map((view) => view.getByName("label"))
    .filter((label) => label?.visible)
    .map((label) => label.text);
  const projectileIcons = [...(scene.projectileViews?.values() || [])]
    .map((view) => view.getByName("icon"))
    .filter((icon) => icon?.visible)
    .map((icon) => icon.text);
  return {
    phase: engine.state.phase,
    effects: battle?.effects.map(({ kind, text }) => ({ kind, text })) ?? [],
    projectiles: battle?.projectiles.map(({ style, emoji, impactAbilityId, impactTargetFid }) => ({
      style,
      emoji,
      ability: impactAbilityId,
      target: impactTargetFid,
    })) ?? [],
    labels,
    projectileIcons,
    textEffects: textState.battle?.visualEffects.effects ?? [],
    textProjectiles: textState.battle?.visualEffects.projectiles ?? [],
    playerUnits: textState.battle?.playerUnits ?? [],
  };
});

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  const failedResponses = [];
  const screenshots = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400) failedResponses.push({ status: response.status(), url: response.url() });
  });

  const capture = async (filename) => {
    const path = `${artifactDirectory}/${filename}`;
    const buffer = await page.screenshot({ path, fullPage: true });
    const result = { path, bytes: buffer.length, metrics: inspectPng(buffer) };
    screenshots.push(result);
    return result;
  };

  const response = await page.goto(`${baseUrl}/game/autochess?seed=511`, {
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
    const engine = window.__supportFxEngine;
    engine.state.playerLevel = 5;
    engine.state.board.fill(null);
    engine.state.board[0] = { uid: 51101, id: "nagisa", star: 1 };
    engine.state.board[1] = { uid: 51102, id: "rutice", star: 1 };
    engine.state.board[2] = { uid: 51103, id: "sun_guard", star: 1 };
    engine.state.board[3] = { uid: 51104, id: "mossback", star: 1 };
    engine.state.board[4] = { uid: 51105, id: "sui", star: 1 };
    engine.startBattle();
    const battle = engine.state.battle;
    const nagisa = battle.player.find((fighter) => fighter.unitId === "nagisa");
    const rutice = battle.player.find((fighter) => fighter.unitId === "rutice");
    const sunGuard = battle.player.find((fighter) => fighter.unitId === "sun_guard");
    const mossback = battle.player.find((fighter) => fighter.unitId === "mossback");
    const sui = battle.player.find((fighter) => fighter.unitId === "sui");
    Object.assign(nagisa, { x: 330, y: 270 });
    Object.assign(rutice, { x: 330, y: 470 });
    Object.assign(sunGuard, { x: 530, y: 250 });
    Object.assign(mossback, { x: 570, y: 390 });
    Object.assign(sui, { x: 530, y: 535 });
    [...battle.player, ...battle.enemy].forEach((fighter) => {
      fighter.attack = 0;
      fighter.cooldown = 99;
      fighter.energy = 0;
      fighter.energyPerSecond = 0;
      fighter.energyOnAttack = 0;
      fighter.energyOnHit = 0;
      fighter.hp = fighter.maxHp;
      fighter.stun = 999;
    });
    battle.enemy.forEach((fighter, index) => {
      fighter.x = index === 0 ? 430 : 880 + (index % 2) * 90;
      fighter.y = index === 0 ? 270 : 220 + (index % 4) * 100;
      fighter.hp = fighter.maxHp = 99_999;
    });
    engine.castAbility(nagisa, battle.enemy);
  });
  await page.evaluate(() => window.advanceTime(80));
  const mimi = await state(page);
  assert.equal(mimi.phase, "battle");
  assert.ok(mimi.textEffects.some(({ kind }) => kind === "mind_control"));
  assert.ok(mimi.textEffects.some(({ kind }) => kind === "neural_link"));
  assert.ok(mimi.labels.includes("🧠") && mimi.labels.includes("失控"));
  await capture("mimi-mind-control.png");

  await page.evaluate(() => {
    window.advanceTime(1100);
    const engine = window.__supportFxEngine;
    const battle = engine.state.battle;
    const rutice = battle.player.find((fighter) => fighter.unitId === "rutice");
    const targets = ["nagisa", "sun_guard", "mossback"]
      .map((unitId) => battle.player.find((fighter) => fighter.unitId === unitId));
    targets.forEach((target, index) => {
      target.hp = target.maxHp * (0.28 + index * 0.1);
      target.shield = 0;
      target.stun = 999;
    });
    battle.player.find((fighter) => fighter.unitId === "sui").hp *= 0.9;
    const rolls = [
      0.1, 0.5, 0.9,
      0.9, 0.5, 0.9,
      0.1, 1, 0.01,
    ];
    engine.rng = { next: () => rolls.shift() ?? 0.9 };
    engine.castAbility(rutice, battle.enemy, true);
    engine.updateProjectiles(battle, 0.18);
    window.advanceTime(1);
  });
  const syringes = await state(page);
  assert.equal(syringes.projectiles.filter(({ style }) => style === "syringe").length, 3);
  assert.equal(syringes.textProjectiles.filter(({ style }) => style === "syringe").length, 3);
  assert.equal(syringes.projectileIcons.filter((icon) => icon === "💉").length, 3);
  await capture("rutice-syringes-in-flight.png");

  await page.evaluate(() => {
    const engine = window.__supportFxEngine;
    engine.updateProjectiles(engine.state.battle, 0.5);
    window.advanceTime(120);
  });
  const impacts = await state(page);
  assert.equal(impacts.projectiles.filter(({ style }) => style === "syringe").length, 0);
  assert.ok(impacts.effects.some(({ text }) => text === "治疗针"));
  assert.ok(impacts.effects.some(({ text }) => text === "护盾针"));
  assert.ok(impacts.effects.some(({ text }) => text === "治疗 · 大力针！"));
  assert.ok(impacts.playerUnits.some(({ motion }) => motion?.kind === "push"));
  await capture("rutice-random-impacts.png");

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

  console.log(JSON.stringify({
    mimi,
    syringes,
    impacts,
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
