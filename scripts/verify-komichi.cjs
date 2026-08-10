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
  const plusVisible = [...(scene.effectViews?.values() || [])].some(
    (view) => view.getByName("label")?.visible && view.getByName("label")?.text === "+",
  );
  const sweepShapeVisible = [...(scene.effectViews?.values() || [])].some(
    (view) => view.getByName("shape")?.visible,
  );
  return {
    phase: engine.state.phase,
    elapsed: battle?.elapsed ?? null,
    signTime: komichi?.komichiSignTime ?? null,
    energy: komichi?.energy ?? null,
    maxEnergy: komichi?.maxEnergy ?? null,
    hp: komichi?.hp ?? null,
    range: komichi?.range ?? null,
    baseRange: komichi?.baseRange ?? null,
    moveSpeed: komichi?.moveSpeed ?? null,
    baseMoveSpeed: komichi?.baseMoveSpeed ?? null,
    moveBuffTime: komichi?.abilityMoveSpeedTime ?? null,
    x: komichi?.x ?? null,
    y: komichi?.y ?? null,
    motion: komichi?.abilityMotion
      ? {
        kind: komichi.abilityMotion.kind,
        targetFid: komichi.abilityMotion.targetFid,
        progress: komichi.abilityMotion.time / Math.max(komichi.abilityMotion.duration, 0.001),
      }
      : null,
    effects: battle?.effects.map((effect) => ({ kind: effect.kind, variant: effect.text })) ?? [],
    enemies: battle?.enemy.map((fighter) => ({
      fid: fighter.fid,
      x: fighter.x,
      y: fighter.y,
      hp: fighter.hp,
      stun: fighter.stun,
      motion: fighter.abilityMotion?.kind || null,
    })) ?? [],
    portraitTexture: portrait?.texture?.key ?? null,
    signpostVisible,
    plusVisible,
    sweepShapeVisible,
    textFighter: textFighter
      ? {
        unitId: textFighter.unitId,
        signTime: textFighter.komichiSignTime,
        range: textFighter.range,
        energy: textFighter.energy,
      }
      : null,
    textEffects: textState.battle?.visualEffects?.effects ?? [],
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
    await page.waitForTimeout(50);
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
    engine.state.round = 8;
    engine.state.playerLevel = 4;
    engine.state.board.fill(null);
    engine.state.board[0] = { uid: 40101, id: "komichi", star: 1 };
    engine.startBattle();
    const battle = engine.state.battle;
    const komichi = battle.player.find((fighter) => fighter.unitId === "komichi");
    komichi.x = 260;
    komichi.y = 360;
    komichi.energy = 0;
    komichi.cooldown = 99;
    komichi.armor = 0;
    komichi.shield = 0;
    komichi.hp = komichi.maxHp = 99_999;
    battle.enemy.forEach((fighter) => {
      fighter.x = 900;
      fighter.y = 540;
      fighter.attack = 0;
      fighter.armor = 0;
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

  const passiveBlockDamage = await page.evaluate(() => {
    const engine = window.__komichiEngine;
    const battle = engine.state.battle;
    const komichi = battle.player.find((fighter) => fighter.unitId === "komichi");
    const rangedAttacker = battle.enemy[2];
    rangedAttacker.x = komichi.x + 90;
    rangedAttacker.y = komichi.y;
    rangedAttacker.attackType = "ranged";
    rangedAttacker.attack = 100;
    rangedAttacker.range = 500;
    rangedAttacker.cooldown = 0;
    engine.rng.next = () => 0;
    const hpBefore = komichi.hp;
    engine.basicAttack(rangedAttacker, komichi);
    return hpBefore - komichi.hp;
  });
  assert.ok(Math.abs(passiveBlockDamage - 64) < 0.001);
  await page.evaluate(() => window.advanceTime(180));
  const passiveBlock = await komichiState(page);
  assert.equal(passiveBlock.signTime, 0);
  assert.ok(passiveBlock.energy > 20 && passiveBlock.energy < 21);
  assert.ok(passiveBlock.moveSpeed > passiveBlock.baseMoveSpeed);
  assert.ok(passiveBlock.moveBuffTime > 0.9);
  assert.ok(passiveBlock.effects.some((effect) => effect.kind === "komichi_sign" && effect.variant === "block"));
  assert.ok(passiveBlock.textEffects.some((effect) => effect.kind === "komichi_sign" && effect.variant === "block"));
  assert.equal(passiveBlock.portraitTexture, "rift-unit:minimal:komichi");
  assert.equal(passiveBlock.signpostVisible, true);
  assert.equal(passiveBlock.plusVisible, true);
  await capture("komichi-passive-block.png");

  await page.evaluate(() => {
    const engine = window.__komichiEngine;
    const battle = engine.state.battle;
    const komichi = battle.player.find((fighter) => fighter.unitId === "komichi");
    const target = battle.enemy[0];
    const pathTarget = battle.enemy[1];
    const rangedAttacker = battle.enemy[2];
    battle.effects.length = 0;
    komichi.x = 260;
    komichi.y = 360;
    komichi.targetFid = target.fid;
    komichi.targetLock = 99;
    komichi.energy = komichi.maxEnergy;
    komichi.cooldown = 0;
    target.x = 610;
    target.y = 360;
    target.stun = 0;
    target.abilityMotion = null;
    pathTarget.x = 450;
    pathTarget.y = 360;
    pathTarget.abilityMotion = null;
    rangedAttacker.x = 900;
    rangedAttacker.y = 540;
    rangedAttacker.attack = 0;
    rangedAttacker.cooldown = 99;
  });
  await page.evaluate(() => window.advanceTime(20));
  const cast = await komichiState(page);
  assert.ok(cast.signTime > 3.7 && cast.signTime < 3.9);
  assert.ok(cast.energy > 69 && cast.energy <= 70);
  assert.ok(cast.range >= cast.baseRange + 105);
  assert.equal(cast.motion?.kind, "dash");
  assert.equal(cast.motion?.targetFid, cast.enemies[0].fid);
  assert.ok(cast.effects.some((effect) => effect.kind === "komichi_sign" && effect.variant === "summon"));
  assert.equal(cast.portraitTexture, "rift-unit-ability:minimal:komichi");
  assert.equal(cast.signpostVisible, true);
  await capture("komichi-urban-legend-cast.png");

  const pathStart = cast.enemies[1];
  await page.evaluate(() => window.advanceTime(180));
  const dash = await komichiState(page);
  assert.equal(dash.motion?.kind, "dash");
  assert.ok(Math.hypot(dash.enemies[1].x - pathStart.x, dash.enemies[1].y - pathStart.y) > 10);
  assert.ok(dash.textEffects.some((effect) => effect.kind === "komichi_sign" && effect.variant === "smash"));
  assert.equal(dash.portraitTexture, "rift-unit-ability:minimal:komichi");
  assert.equal(dash.signpostVisible, true);
  await capture("komichi-debut-dash-path-hit.png");

  await page.evaluate(() => window.advanceTime(120));
  const impact = await komichiState(page);
  assert.equal(impact.motion, null);
  assert.ok(impact.enemies[0].hp < 99_999);
  assert.ok(impact.enemies[0].stun > 0.4);
  assert.ok(impact.textEffects.some((effect) => effect.kind === "komichi_sign" && effect.variant === "smash"));
  assert.equal(impact.portraitTexture, "rift-unit-ability:minimal:komichi");
  await capture("komichi-debut-target-impact.png");

  const sweepDamage = await page.evaluate(() => {
    const engine = window.__komichiEngine;
    const battle = engine.state.battle;
    const komichi = battle.player.find((fighter) => fighter.unitId === "komichi");
    const target = battle.enemy[0];
    const coneTarget = battle.enemy[1];
    const outsideTarget = battle.enemy[2];
    battle.effects.length = 0;
    target.x = komichi.x + 100;
    target.y = komichi.y;
    target.stun = 0;
    target.abilityMotion = null;
    coneTarget.x = komichi.x + 100;
    coneTarget.y = komichi.y + 50;
    coneTarget.abilityMotion = null;
    outsideTarget.x = komichi.x - 70;
    outsideTarget.y = komichi.y;
    outsideTarget.abilityMotion = null;
    const hpBefore = battle.enemy.map((fighter) => fighter.hp);
    komichi.energy = 95;
    komichi.cooldown = 0;
    engine.basicAttack(komichi, target);
    return battle.enemy.map((fighter, index) => hpBefore[index] - fighter.hp);
  });
  assert.ok(sweepDamage[0] > sweepDamage[1]);
  assert.ok(sweepDamage[1] > 0);
  assert.equal(sweepDamage[2], 0);
  await page.evaluate(() => window.advanceTime(200));
  const sweepAttack = await komichiState(page);
  assert.ok(sweepAttack.energy > 91 && sweepAttack.energy < 92);
  assert.equal(sweepAttack.motion, null);
  assert.equal(sweepAttack.enemies[0].stun, 0);
  assert.ok(sweepAttack.textEffects.some((effect) => effect.kind === "komichi_sign" && effect.variant === "sweep"));
  assert.equal(sweepAttack.signpostVisible, true);
  assert.equal(sweepAttack.plusVisible, true);
  assert.equal(sweepAttack.sweepShapeVisible, true);
  await capture("komichi-active-sign-sweep.png");

  const activeBlockDamage = await page.evaluate(() => {
    const engine = window.__komichiEngine;
    const battle = engine.state.battle;
    const komichi = battle.player.find((fighter) => fighter.unitId === "komichi");
    const rangedAttacker = battle.enemy[2];
    battle.effects.length = 0;
    rangedAttacker.x = komichi.x + 90;
    rangedAttacker.y = komichi.y;
    rangedAttacker.attackType = "ranged";
    rangedAttacker.attack = 100;
    rangedAttacker.range = 500;
    rangedAttacker.cooldown = 0;
    komichi.energy = 40;
    engine.rng.next = () => 0.6;
    const hpBefore = komichi.hp;
    engine.basicAttack(rangedAttacker, komichi);
    return hpBefore - komichi.hp;
  });
  assert.ok(Math.abs(activeBlockDamage - 64) < 0.001);
  await page.evaluate(() => window.advanceTime(180));
  const activeBlock = await komichiState(page);
  assert.ok(activeBlock.energy > 55 && activeBlock.energy < 56);
  assert.ok(activeBlock.moveSpeed > activeBlock.baseMoveSpeed);
  assert.ok(activeBlock.textEffects.some((effect) => effect.kind === "komichi_sign" && effect.variant === "block"));
  assert.equal(activeBlock.signpostVisible, true);
  assert.equal(activeBlock.plusVisible, true);
  await capture("komichi-active-block.png");

  const repeatTrigger = await page.evaluate(() => {
    const engine = window.__komichiEngine;
    const battle = engine.state.battle;
    const komichi = battle.player.find((fighter) => fighter.unitId === "komichi");
    const target = battle.enemy[0];
    const rangedAttacker = battle.enemy[2];
    battle.effects.length = 0;
    target.x = komichi.x + 320;
    target.y = komichi.y;
    target.abilityMotion = null;
    rangedAttacker.x = komichi.x + 90;
    rangedAttacker.y = komichi.y;
    rangedAttacker.attackType = "ranged";
    rangedAttacker.attack = 100;
    rangedAttacker.range = 500;
    rangedAttacker.cooldown = 0;
    komichi.targetFid = target.fid;
    komichi.targetLock = 99;
    komichi.energy = 81;
    komichi.cooldown = 0;
    engine.rng.next = () => 0.6;
    engine.basicAttack(rangedAttacker, komichi);
    return {
      energy: komichi.energy,
      motion: komichi.abilityMotion?.kind || null,
      targetFid: komichi.abilityMotion?.targetFid || null,
      expectedTargetFid: target.fid,
    };
  });
  assert.equal(repeatTrigger.energy, 70);
  assert.equal(repeatTrigger.motion, "dash");
  assert.equal(repeatTrigger.targetFid, repeatTrigger.expectedTargetFid);
  await page.evaluate(() => window.advanceTime(20));
  const repeatDash = await komichiState(page);
  assert.equal(repeatDash.motion?.kind, "dash");
  assert.ok(repeatDash.textEffects.some((effect) => effect.kind === "line"));
  assert.equal(repeatDash.portraitTexture, "rift-unit-ability:minimal:komichi");
  await capture("komichi-refill-repeat-dash.png");

  await page.evaluate(() => {
    const engine = window.__komichiEngine;
    const battle = engine.state.battle;
    const komichi = battle.player.find((fighter) => fighter.unitId === "komichi");
    komichi.abilityMotion = null;
    komichi.energy = 10;
    komichi.komichiSignTime = 0.55;
    komichi.energyPerSecond = 0;
    komichi.energyOnAttack = 0;
    komichi.energyOnHit = 0;
    komichi.cooldown = 99;
    battle.effects.length = 0;
    battle.enemy.forEach((fighter) => {
      fighter.x = 900;
      fighter.y = 540;
      fighter.attack = 0;
      fighter.cooldown = 99;
    });
  });
  await page.evaluate(() => window.advanceTime(700));
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
    passiveBlock,
    cast,
    dash,
    impact,
    sweepAttack,
    sweepDamage,
    activeBlock,
    repeatTrigger,
    repeatDash,
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
