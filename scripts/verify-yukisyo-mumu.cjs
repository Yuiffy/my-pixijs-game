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
  let dark = 0;
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
      if (red * 0.2126 + green * 0.7152 + blue * 0.0722 <= 28) dark += 1;
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
    darkRatio: Number((dark / pixels).toFixed(4)),
    transparentRatio: Number((transparent / pixels).toFixed(4)),
  };
  assert.ok(
    metrics.colors > 1 &&
      metrics.nearBlackRatio < 0.97 &&
      metrics.darkRatio < 0.9 &&
      metrics.transparentRatio < 0.97,
    `Invalid screenshot: ${JSON.stringify(metrics)}`,
  );
  return metrics;
};

const { chromium } = loadPlaywright();
const baseUrl = process.env.AUTOCHESS_BASE_URL || "http://127.0.0.1:3107";
const artifactDirectory = ".tmp/autochess/yukisyo-mumu";
mkdirSync(artifactDirectory, { recursive: true });
let activeBrowser = null;

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
    bridge.setHidden(true);
    window.__counterBridge = bridge;
    window.__counterEngine = bridge.engine;
  });
};

const enterPreparation = async (page, seed) => {
  await page.goto(`${baseUrl}/game/autochess?seed=${seed}`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.locator('[data-game-canvas="rift-line"]').waitFor();
  await page.waitForFunction(() => typeof window.render_game_to_text === "function");
  await page.locator(".rift-dom-choice").first().click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === "preparation");
  await attachEngine(page);
};

(async () => {
  activeBrowser = await chromium.launch({
    channel: "chrome",
    headless: process.env.AUTOCHESS_HEADED !== "1",
  });
  const page = await activeBrowser.newPage({ viewport: { width: 1440, height: 900 } });
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
    await page.waitForTimeout(100);
    const path = `${artifactDirectory}/${filename}`;
    const buffer = await page.screenshot({ path, fullPage: true });
    const result = { path, bytes: buffer.length, metrics: inspectPng(buffer) };
    screenshots.push(result);
    return result;
  };

  await enterPreparation(page, 501);
  const shield = await page.evaluate(() => {
    const engine = window.__counterEngine;
    const bridge = window.__counterBridge;
    engine.state.round = 6;
    engine.state.playerLevel = 4;
    engine.state.starter = "blaze";
    engine.state.board.fill(null);
    engine.state.board[0] = { uid: 1, id: "yukisyo", star: 1 };
    engine.state.board[1] = { uid: 2, id: "nori", star: 1 };
    bridge.dispatch({ type: "battle" });
    const battle = engine.state.battle;
    const yukisyo = battle.player.find((fighter) => fighter.unitId === "yukisyo");
    const nori = battle.player.find((fighter) => fighter.unitId === "nori");
    yukisyo.x = 310;
    yukisyo.y = 360;
    nori.x = 430;
    nori.y = 360;
    battle.enemy.forEach((fighter, index) => {
      fighter.x = 820 + index * 40;
      fighter.y = 210 + index * 70;
      fighter.attack = 0;
      fighter.baseAttack = 0;
      fighter.hp = fighter.maxHp = 99_999;
      fighter.armor = 99_999;
      fighter.cooldown = 99;
    });
    yukisyo.energy = yukisyo.maxEnergy;
    engine.castAbility(yukisyo, battle.enemy, true);
    return {
      yukisyo: {
        energy: yukisyo.energy,
        maxHp: yukisyo.maxHp,
        shield: yukisyo.abilityShield,
        remaining: yukisyo.abilityShieldTime,
      },
      nori: {
        maxHp: nori.maxHp,
        shield: nori.abilityShield,
        remaining: nori.abilityShieldTime,
      },
    };
  });
  assert.equal(shield.yukisyo.energy, 0);
  assert.ok(Math.abs(shield.yukisyo.shield - (50 + shield.yukisyo.maxHp * 0.2)) < 0.001);
  assert.ok(Math.abs(shield.nori.shield - (50 + shield.nori.maxHp * 0.2)) < 0.001);
  assert.equal(shield.nori.remaining, 4);
  const shieldText = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  const shieldTextNori = shieldText.battle.playerUnits.find((fighter) => fighter.unitId === "nori");
  assert.ok(shieldTextNori.abilityShield > 0);
  assert.equal(shieldTextNori.abilityShieldTime, 4);
  await capture("yukisyo-ability-shield.png");

  await enterPreparation(page, 502);
  const rescueCast = await page.evaluate(() => {
    const engine = window.__counterEngine;
    const bridge = window.__counterBridge;
    engine.state.round = 6;
    engine.state.playerLevel = 4;
    engine.state.starter = "blaze";
    engine.state.board.fill(null);
    engine.state.board[0] = { uid: 1, id: "mumu", star: 1 };
    engine.state.board[1] = { uid: 2, id: "nori", star: 1 };
    engine.state.board[2] = { uid: 3, id: "gale_archer", star: 1 };
    bridge.dispatch({ type: "battle" });
    const battle = engine.state.battle;
    const mumu = battle.player.find((fighter) => fighter.unitId === "mumu");
    const trapped = battle.player.find((fighter) => fighter.unitId === "nori");
    const low = battle.player.find((fighter) => fighter.unitId === "gale_archer");
    const controller = battle.enemy[0];
    mumu.x = 360;
    mumu.y = 350;
    trapped.x = 620;
    trapped.y = 350;
    trapped.stun = 2;
    low.x = 430;
    low.y = 440;
    low.hp = low.maxHp * 0.2;
    mumu.energy = mumu.maxEnergy;
    battle.enemy.forEach((fighter, index) => {
      fighter.x = 820 + index * 40;
      fighter.y = 210 + index * 70;
      fighter.attack = 0;
      fighter.baseAttack = 0;
      fighter.hp = fighter.maxHp = 99_999;
      fighter.armor = 99_999;
      fighter.cooldown = 99;
      fighter.energy = fighter.maxEnergy;
    });
    controller.channelTargetFid = trapped.fid;
    controller.channelTime = 3;
    controller.channelPulseTimer = 0;
    battle.chronospheres.push({
      sourceFid: controller.fid,
      x: trapped.x,
      y: trapped.y,
      radius: 96,
      life: 3,
      maxLife: 3,
      color: "#c9a0ff",
    });
    engine.update(0.05);
    return {
      mumuEnergy: mumu.energy,
      trapped: {
        x: trapped.x,
        y: trapped.y,
        motion: trapped.abilityMotion && {
          kind: trapped.abilityMotion.kind,
          sourceFid: trapped.abilityMotion.sourceFid,
          toX: trapped.abilityMotion.toX,
          toY: trapped.abilityMotion.toY,
        },
      },
      lowMotion: low.abilityMotion?.kind || null,
      whip: battle.effects.find((effect) => effect.kind === "mumu_whip") || null,
    };
  });
  assert.equal(rescueCast.mumuEnergy, 0);
  assert.equal(rescueCast.trapped.motion.kind, "pull");
  assert.equal(rescueCast.trapped.x, 620);
  assert.equal(rescueCast.trapped.y, 350);
  assert.equal(rescueCast.lowMotion, null);
  assert.equal(rescueCast.whip.kind, "mumu_whip");
  assert.equal(rescueCast.whip.x, 360);
  assert.equal(rescueCast.whip.x2, 620);
  assert.equal(rescueCast.whip.x3, rescueCast.trapped.motion.toX);
  const rescueCastText = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  const rescueCastNori = rescueCastText.battle.playerUnits.find((fighter) => fighter.unitId === "nori");
  const rescueCastWhip = rescueCastText.battle.visualEffects.effects.find((effect) => effect.kind === "mumu_whip");
  assert.equal(rescueCastNori.motion.kind, "pull");
  assert.equal(rescueCastNori.motion.sourceFid, rescueCast.trapped.motion.sourceFid);
  assert.equal(rescueCastWhip.x3, Math.round(rescueCast.trapped.motion.toX));
  await capture("mumu-rescue-whip-outbound.png");

  const rescueSwing = await page.evaluate(() => {
    const engine = window.__counterEngine;
    const battle = engine.state.battle;
    const trapped = battle.player.find((fighter) => fighter.unitId === "nori");
    for (let tick = 0; tick < 3; tick += 1) engine.update(0.05);
    return {
      x: trapped.x,
      y: trapped.y,
      motion: trapped.abilityMotion && {
        kind: trapped.abilityMotion.kind,
        progress: trapped.abilityMotion.time / trapped.abilityMotion.duration,
        toX: trapped.abilityMotion.toX,
        toY: trapped.abilityMotion.toY,
      },
    };
  });
  assert.equal(rescueSwing.motion.kind, "pull");
  assert.ok(rescueSwing.x < 620 && rescueSwing.x > rescueSwing.motion.toX);
  assert.ok(rescueSwing.y < 350);
  assert.ok(rescueSwing.motion.progress > 0.24 && rescueSwing.motion.progress < 1);
  await capture("mumu-rescue-whip-swing.png");

  const rescueOverShoulder = await page.evaluate(() => {
    const engine = window.__counterEngine;
    const battle = engine.state.battle;
    const trapped = battle.player.find((fighter) => fighter.unitId === "nori");
    for (let tick = 0; tick < 3; tick += 1) engine.update(0.05);
    return {
      x: trapped.x,
      y: trapped.y,
      motion: trapped.abilityMotion && {
        kind: trapped.abilityMotion.kind,
        progress: trapped.abilityMotion.time / trapped.abilityMotion.duration,
        toX: trapped.abilityMotion.toX,
        toY: trapped.abilityMotion.toY,
      },
    };
  });
  assert.equal(rescueOverShoulder.motion.kind, "pull");
  assert.ok(rescueOverShoulder.x < 360 && rescueOverShoulder.x > rescueOverShoulder.motion.toX);
  assert.ok(rescueOverShoulder.y < 350);
  assert.ok(rescueOverShoulder.motion.progress > rescueSwing.motion.progress);
  await capture("mumu-rescue-whip-over-shoulder.png");

  const rescueLanded = await page.evaluate(() => {
    const engine = window.__counterEngine;
    const battle = engine.state.battle;
    const trapped = battle.player.find((fighter) => fighter.unitId === "nori");
    const controller = battle.enemy[0];
    for (let tick = 0; tick < 6; tick += 1) engine.update(0.05);
    return {
      x: trapped.x,
      y: trapped.y,
      hp: trapped.hp,
      shield: trapped.shield,
      stun: trapped.stun,
      motion: trapped.abilityMotion,
      channelTargetFid: controller.channelTargetFid,
      channelTime: controller.channelTime,
      outsideChronosphere: Math.hypot(trapped.x - 620, trapped.y - 350) > 96,
    };
  });
  assert.equal(rescueLanded.motion, null);
  assert.equal(rescueLanded.stun, 0);
  assert.equal(rescueLanded.channelTargetFid, null);
  assert.equal(rescueLanded.channelTime, 0);
  assert.equal(rescueLanded.outsideChronosphere, true);
  assert.ok(rescueLanded.shield > 0);
  await capture("mumu-rescue-landed.png");

  const canvas = await page.locator('[data-game-canvas="rift-line"]').evaluate((element) => ({
    count: document.querySelectorAll("canvas").length,
    width: element.width,
    height: element.height,
    logicalWidth: Number(element.dataset.logicalWidth),
    logicalHeight: Number(element.dataset.logicalHeight),
  }));
  assert.equal(canvas.count, 1);
  assert.equal(canvas.logicalWidth, 1120);
  assert.equal(canvas.logicalHeight, 720);
  assert.ok(canvas.width > 0 && canvas.height > 0);
  assert.deepEqual(errors, []);
  assert.deepEqual(failedResponses, []);

  console.log(JSON.stringify({
    shield,
    rescueCast,
    rescueSwing,
    rescueOverShoulder,
    rescueLanded,
    canvas,
    screenshots,
    errors,
    failedResponses,
  }, null, 2));
  await activeBrowser.close();
  activeBrowser = null;
})().catch(async (error) => {
  console.error(error);
  if (activeBrowser) await activeBrowser.close();
  process.exitCode = 1;
});
