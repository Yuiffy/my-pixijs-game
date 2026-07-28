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
    metrics.colors > 1 &&
      metrics.nearBlackRatio < 0.97 &&
      metrics.transparentRatio < 0.97,
    `Invalid screenshot: ${JSON.stringify(metrics)}`,
  );
  return metrics;
};

const { chromium } = loadPlaywright();
const baseUrl = process.env.AUTOCHESS_BASE_URL || "http://127.0.0.1:3100";
const artifactDirectory = ".tmp/autochess/seki-charge";
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
    window.__sekiBridge = bridge;
    window.__sekiEngine = bridge.engine;
  });
};

(async () => {
  activeBrowser = await chromium.launch({ channel: "chrome", headless: true });
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
    await page.waitForTimeout(80);
    const path = `${artifactDirectory}/${filename}`;
    const buffer = await page.screenshot({ path, fullPage: true });
    const result = { path, bytes: buffer.length, metrics: inspectPng(buffer) };
    screenshots.push(result);
    return result;
  };

  await page.goto(`${baseUrl}/game/autochess?seed=401`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  const canvas = page.locator('[data-game-canvas="rift-line"]');
  await canvas.waitFor();
  await page.waitForFunction(() => typeof window.render_game_to_text === "function");
  await page.locator(".rift-dom-choice").first().click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === "preparation");
  await attachEngine(page);

  const impact = await page.evaluate(() => {
    const engine = window.__sekiEngine;
    const bridge = window.__sekiBridge;
    engine.state.round = 6;
    engine.state.playerLevel = 4;
    engine.state.board.fill(null);
    engine.state.board[0] = { uid: 1, id: "seki_boar_king", star: 1 };
    bridge.dispatch({ type: "battle" });
    const battle = engine.state.battle;
    const seki = battle.player[0];
    battle.enemy.forEach((fighter, index) => {
      fighter.x = index === 0 ? 360 : 820 + index * 34;
      fighter.y = index === 0 ? 360 : 180 + index * 86;
      fighter.moveSpeed = 0;
      fighter.attack = 0;
      fighter.cooldown = 99;
      fighter.armor = 0;
      fighter.dodgeChance = 0;
      fighter.hp = fighter.maxHp = 99_999;
    });
    seki.x = 240;
    seki.y = 360;
    engine.castAbility(seki, battle.enemy);
    for (let tick = 0; tick < 8; tick += 1) engine.update(0.05);
    return {
      seki: {
        x: seki.x,
        y: seki.y,
        energy: seki.energy,
        active: seki.sekiChargeActive,
        hitCount: seki.sekiChargeHitCount,
        attackPulse: seki.attackPulse,
      },
      target: {
        x: battle.enemy[0].x,
        stun: battle.enemy[0].stun,
        damageTaken: battle.enemy[0].damageTaken,
      },
    };
  });
  assert.equal(impact.seki.active, true);
  assert.ok(impact.seki.energy > 0 && impact.seki.energy < 100);
  assert.equal(impact.seki.hitCount, 1);
  assert.equal(impact.seki.attackPulse, 0);
  assert.ok(impact.target.x > 360);
  assert.ok(impact.target.stun > 0);
  assert.equal(impact.target.damageTaken, 0);
  const impactText = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  const impactSeki = impactText.battle.playerUnits.find((fighter) => fighter.unitId === "seki_boar_king");
  assert.ok(impactSeki?.boarCharge);
  assert.equal(impactSeki.boarCharge.hitCount, 1);
  await capture("seki-charge-impact.png");

  const bounce = await page.evaluate(() => {
    const engine = window.__sekiEngine;
    const battle = engine.state.battle;
    const seki = battle.player[0];
    const right = 1068 - seki.radius;
    seki.x = right - 1;
    seki.y = 500;
    seki.sekiChargeDirectionX = 1;
    seki.sekiChargeDirectionY = 0;
    battle.enemy.forEach((fighter, index) => {
      fighter.x = 120 + index * 30;
      fighter.y = 170 + index * 80;
    });
    engine.update(0.05);
    return {
      x: seki.x,
      right,
      directionX: seki.sekiChargeDirectionX,
      active: seki.sekiChargeActive,
      hasBounceEffect: battle.effects.some((effect) => effect.text === "反弹"),
    };
  });
  assert.equal(bounce.active, true);
  assert.ok(bounce.x < bounce.right);
  assert.ok(bounce.directionX < 0);
  assert.equal(bounce.hasBounceEffect, true);
  const bounceText = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  const bounceSeki = bounceText.battle.playerUnits.find((fighter) => fighter.unitId === "seki_boar_king");
  assert.ok(bounceSeki.boarCharge.direction.x < 0);
  await capture("seki-charge-bounce.png");

  const finish = await page.evaluate(() => {
    const engine = window.__sekiEngine;
    const seki = engine.state.battle.player[0];
    for (let tick = 0; tick < 120 && seki.sekiChargeActive; tick += 1) engine.update(0.05);
    return {
      active: seki.sekiChargeActive,
      energy: seki.energy,
      directionX: seki.sekiChargeDirectionX,
      directionY: seki.sekiChargeDirectionY,
    };
  });
  assert.deepEqual(finish, {
    active: false,
    energy: 0,
    directionX: 0,
    directionY: 0,
  });

  const canvasInfo = await canvas.evaluate((element) => ({
    count: document.querySelectorAll("canvas").length,
    width: element.width,
    height: element.height,
    logicalWidth: Number(element.dataset.logicalWidth),
    logicalHeight: Number(element.dataset.logicalHeight),
  }));
  assert.equal(canvasInfo.count, 1);
  assert.equal(canvasInfo.logicalWidth, 1120);
  assert.equal(canvasInfo.logicalHeight, 720);
  assert.ok(canvasInfo.width > 0 && canvasInfo.height > 0);
  assert.deepEqual(errors, []);
  assert.deepEqual(failedResponses, []);

  console.log(JSON.stringify({
    impact,
    bounce,
    finish,
    canvas: canvasInfo,
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
