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
const baseUrl = process.env.AUTOCHESS_BASE_URL || "http://127.0.0.1:3000";
const artifactDirectory = ".tmp/autochess/sprite-walk";
mkdirSync(artifactDirectory, { recursive: true });

const attachReactRefs = (page) => page.evaluate(() => {
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

const snapshotFighters = (page) => page.evaluate(() => {
  const scene = window.__codexAutoChessGame.scene.getScene("RiftLineScene");
  const battle = window.__codexAutoChessBridge.engine.state.battle;
  return battle.player
    .filter((fighter) => ["spark_mage", "clock_gunner", "biscuit_sui"].includes(fighter.unitId))
    .map((fighter) => {
      const view = scene.fighterViews.get(fighter.fid);
      const portrait = view?.getByName("portrait");
      const portraitImage = portrait?.getByName("portraitImage");
      const shadow = view?.getByName("shadow");
      return {
        fid: fighter.fid,
        unitId: fighter.unitId,
        fighterX: fighter.x,
        fighterY: fighter.y,
        portraitY: portrait?.y,
        angle: portrait?.angle,
        scaleX: portrait?.scaleX,
        scaleY: portrait?.scaleY,
        shadowScaleX: shadow?.scaleX,
        texture: portraitImage?.texture?.key,
      };
    });
});

const clockGunnerEarState = (page) => page.evaluate(() => {
  const scene = window.__codexAutoChessGame.scene.getScene("RiftLineScene");
  const battle = window.__codexAutoChessBridge.engine.state.battle;
  const fighter = battle.player.find((entry) => entry.unitId === "clock_gunner");
  const view = scene.fighterViews.get(fighter.fid);
  const portrait = view?.getByName("portrait");
  const rig = portrait?.getByName("clockGunnerEarRig");
  return {
    visible: rig?.visible ?? false,
    leftAttached: Boolean(rig?.getByName("clockGunnerLeftEar")),
    rightAttached: Boolean(rig?.getByName("clockGunnerRightEar")),
    petCount: battle.pets.filter((pet) => pet.ownerFid === fighter.fid).length,
  };
});

const capture = async (page, name, screenshots) => {
  const buffer = await page.screenshot({ path: `${artifactDirectory}/${name}.png`, fullPage: true });
  screenshots[name] = inspectPng(buffer);
};

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  const failedResponses = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400) failedResponses.push({ status: response.status(), url: response.url() });
  });

  const response = await page.goto(`${baseUrl}/game/autochess?seed=1`, { waitUntil: "domcontentloaded" });
  if (!response?.ok()) throw new Error(`Autochess URL returned ${response?.status()}`);
  await page.locator('[data-game-canvas="rift-line"]').waitFor();
  await page.waitForFunction(() => typeof window.render_game_to_text === "function");
  assert.equal(await attachReactRefs(page), true, "Unable to locate game and bridge through React fiber");

  const assetStatuses = await page.evaluate(async () => Object.fromEntries(await Promise.all([
    "/images/autochess/portraits/spark-mage.png",
    "/images/autochess/portraits/clock-gunner.png",
    "/images/autochess/portraits/biscuit_sui.png",
  ].map(async (url) => [url, (await fetch(url)).status]))));
  assert.deepEqual(assetStatuses, {
    "/images/autochess/portraits/spark-mage.png": 200,
    "/images/autochess/portraits/clock-gunner.png": 200,
    "/images/autochess/portraits/biscuit_sui.png": 200,
  });

  await page.evaluate(() => {
    const bridge = window.__codexAutoChessBridge;
    const engine = bridge.engine;
    engine.startRun(engine.state.starterChoices[0]);
    engine.state.playerLevel = 10;
    engine.state.board.fill(null);
    engine.state.bench.fill(null);
    engine.state.board[6] = { uid: 8801, id: "spark_mage", star: 1 };
    engine.state.board[7] = { uid: 8802, id: "clock_gunner", star: 1 };
    engine.state.board[8] = { uid: 8803, id: "biscuit_sui", star: 1 };
    bridge.dispatch({ type: "clearSelection" });
  });
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === "preparation");
  await page.waitForTimeout(500);
  const preparationText = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
  assert.ok(JSON.stringify(preparationText).includes("北欧魔法师"), "Preparation state is missing 北欧魔法师");
  assert.ok(JSON.stringify(preparationText).includes("老弥"), "Preparation state is missing 老弥");
  assert.ok(JSON.stringify(preparationText).includes("饼干岁"), "Preparation state is missing 饼干岁");
  const screenshots = {};
  await capture(page, "preparation-fullbody-sprites", screenshots);

  await page.evaluate(() => {
    const bridge = window.__codexAutoChessBridge;
    bridge.engine.startBattle();
    const battle = bridge.engine.state.battle;
    battle.limit = 30;
    battle.player.forEach((fighter, index) => {
      fighter.x = 120;
      fighter.y = 180 + index * 190;
      fighter.range = 20;
      fighter.moveSpeed = 68;
      fighter.maxHp *= 20;
      fighter.hp = fighter.maxHp;
    });
    battle.enemy.forEach((fighter, index) => {
      fighter.x = 1000;
      fighter.y = 250 + index * 120;
      fighter.range = 20;
      fighter.moveSpeed = 20;
      fighter.attack = 0;
      fighter.baseAttack = 0;
      fighter.maxHp *= 20;
      fighter.hp = fighter.maxHp;
    });
    bridge.dispatch({ type: "clearSelection" });
  });
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === "battle");
  await page.waitForFunction(() => {
    const scene = window.__codexAutoChessGame.scene.getScene("RiftLineScene");
    return scene.fighterViews?.size >= 3;
  });

  const earsAtRest = await clockGunnerEarState(page);
  assert.deepEqual(earsAtRest, {
    visible: true,
    leftAttached: true,
    rightAttached: true,
    petCount: 0,
  });
  await capture(page, "clock-gunner-ears-resting", screenshots);

  await page.evaluate(() => {
    const bridge = window.__codexAutoChessBridge;
    const battle = bridge.engine.state.battle;
    const fighter = battle.player.find((entry) => entry.unitId === "clock_gunner");
    bridge.engine.projectiles.summonClockGunnerRabbits(fighter);
  });
  await page.waitForFunction(() => {
    const scene = window.__codexAutoChessGame.scene.getScene("RiftLineScene");
    const battle = window.__codexAutoChessBridge.engine.state.battle;
    const fighter = battle.player.find((entry) => entry.unitId === "clock_gunner");
    const portrait = scene.fighterViews.get(fighter.fid)?.getByName("portrait");
    return battle.pets.filter((pet) => pet.ownerFid === fighter.fid).length === 2
      && portrait?.getByName("clockGunnerEarRig")?.visible === false;
  });
  const earsLaunched = await clockGunnerEarState(page);
  assert.equal(earsLaunched.visible, false);
  assert.equal(earsLaunched.petCount, 2);
  await capture(page, "clock-gunner-ears-launched", screenshots);

  await page.evaluate(() => {
    const bridge = window.__codexAutoChessBridge;
    const battle = bridge.engine.state.battle;
    const fighter = battle.player.find((entry) => entry.unitId === "clock_gunner");
    battle.pets
      .filter((pet) => pet.ownerFid === fighter.fid)
      .forEach((pet) => {
        pet.life = 0;
        pet.x = fighter.x;
        pet.y = fighter.y - fighter.radius - pet.radius;
      });
    bridge.engine.projectiles.updateMechanicalRabbitPets(battle, 0.05);
  });
  await page.waitForFunction(() => {
    const scene = window.__codexAutoChessGame.scene.getScene("RiftLineScene");
    const battle = window.__codexAutoChessBridge.engine.state.battle;
    const fighter = battle.player.find((entry) => entry.unitId === "clock_gunner");
    const portrait = scene.fighterViews.get(fighter.fid)?.getByName("portrait");
    return battle.pets.every((pet) => pet.ownerFid !== fighter.fid)
      && portrait?.getByName("clockGunnerEarRig")?.visible === true;
  });
  const earsRestored = await clockGunnerEarState(page);
  assert.equal(earsRestored.visible, true);
  assert.equal(earsRestored.petCount, 0);
  await capture(page, "clock-gunner-ears-restored", screenshots);

  const samples = [];
  for (let index = 0; index < 18; index += 1) {
    await page.waitForTimeout(45);
    samples.push(...await snapshotFighters(page));
    if (index === 5) await capture(page, "walking-phase-a", screenshots);
    if (index === 12) await capture(page, "walking-phase-b", screenshots);
  }

  const byUnit = Object.fromEntries(["spark_mage", "clock_gunner", "biscuit_sui"].map((unitId) => {
    const unitSamples = samples.filter((sample) => sample.unitId === unitId);
    assert.equal(unitSamples.length, 18, `${unitId} sample count`);
    const span = (field) => Math.max(...unitSamples.map((sample) => sample[field]))
      - Math.min(...unitSamples.map((sample) => sample[field]));
    const metrics = {
      distance: Math.hypot(
        unitSamples.at(-1).fighterX - unitSamples[0].fighterX,
        unitSamples.at(-1).fighterY - unitSamples[0].fighterY,
      ),
      portraitYSpan: span("portraitY"),
      angleSpan: span("angle"),
      scaleXSpan: span("scaleX"),
      scaleYSpan: span("scaleY"),
      shadowScaleXSpan: span("shadowScaleX"),
      textures: [...new Set(unitSamples.map((sample) => sample.texture))],
    };
    assert.ok(metrics.distance > 15, `${unitId} did not move: ${JSON.stringify(metrics)}`);
    assert.ok(metrics.portraitYSpan > 1, `${unitId} portrait did not bounce: ${JSON.stringify(metrics)}`);
    assert.ok(metrics.angleSpan > 2, `${unitId} portrait did not sway: ${JSON.stringify(metrics)}`);
    assert.ok(metrics.scaleXSpan > 0.02, `${unitId} portrait did not squash: ${JSON.stringify(metrics)}`);
    assert.ok(metrics.shadowScaleXSpan > 0.03, `${unitId} shadow did not breathe: ${JSON.stringify(metrics)}`);
    assert.deepEqual(metrics.textures, [`rift-unit:${unitId}`]);
    return [unitId, metrics];
  }));

  const textState = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
  const canvas = await page.locator('[data-game-canvas="rift-line"]').evaluate((element) => ({
    width: element.width,
    height: element.height,
    clientWidth: element.clientWidth,
    clientHeight: element.clientHeight,
  }));
  assert.equal(textState.phase, "battle");
  assert.ok(canvas.width > 0 && canvas.height > 0 && canvas.clientWidth > 0 && canvas.clientHeight > 0);
  assert.deepEqual(errors, []);
  assert.deepEqual(failedResponses, []);

  console.log(JSON.stringify({
    assetStatuses,
    earLifecycle: { earsAtRest, earsLaunched, earsRestored },
    byUnit,
    textState: { phase: textState.phase },
    canvas,
    screenshots,
    errors,
    failedResponses,
  }, null, 2));
  await context.close();
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
