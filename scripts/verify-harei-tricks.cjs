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
      if (
        (candidate.includes("/") || candidate.includes("\\")) &&
        !existsSync(candidate)
      ) {
        continue;
      }
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
    const row = Buffer.from(
      rows.subarray(rowOffset + 1, rowOffset + 1 + stride),
    );
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? row[x - channels] : 0;
      const up = previous[x];
      const upperLeft = x >= channels ? previous[x - channels] : 0;
      if (filter === 1) row[x] = (row[x] + left) & 255;
      if (filter === 2) row[x] = (row[x] + up) & 255;
      if (filter === 3) {
        row[x] = (row[x] + Math.floor((left + up) / 2)) & 255;
      }
      if (filter === 4) {
        const prediction = left + up - upperLeft;
        const leftDistance = Math.abs(prediction - left);
        const upDistance = Math.abs(prediction - up);
        const upperLeftDistance = Math.abs(prediction - upperLeft);
        const nearest =
          leftDistance <= upDistance && leftDistance <= upperLeftDistance
            ? left
            : upDistance <= upperLeftDistance
              ? up
              : upperLeft;
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
      if (colors.size < 4096) {
        colors.add(`${red},${green},${blue},${alpha}`);
      }
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

const attachEngine = async (page) => {
  await page.evaluate(() => {
    const canvas = document.querySelector('[data-game-canvas="rift-line"]');
    let node = canvas;
    let fiber = null;
    while (node && !fiber) {
      const fiberKey = Object.keys(node).find((key) =>
        key.startsWith("__reactFiber$"),
      );
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
    window.__hareiBridge = bridge;
    window.__hareiEngine = bridge.engine;
  });
};

const { chromium } = loadPlaywright();
const baseUrl = process.env.AUTOCHESS_BASE_URL || "http://127.0.0.1:3200";
const artifactDirectory = ".tmp/autochess/harei-tricks";
mkdirSync(artifactDirectory, { recursive: true });

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    const failedResponses = [];
    const screenshots = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("response", (response) => {
      if (response.status() >= 400) {
        failedResponses.push({ status: response.status(), url: response.url() });
      }
    });

    const capture = async (filename) => {
      await page.waitForTimeout(100);
      const path = `${artifactDirectory}/${filename}`;
      const buffer = await page.screenshot({ path, fullPage: true });
      const result = {
        path,
        bytes: buffer.length,
        metrics: inspectPng(buffer),
      };
      screenshots.push(result);
      return result;
    };

    const response = await page.goto(`${baseUrl}/game/autochess?seed=733`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    assert.ok(response?.ok(), `Autochess URL returned ${response?.status()}`);
    const canvas = page.locator('[data-game-canvas="rift-line"]');
    await canvas.waitFor();
    await page.waitForFunction(
      () => typeof window.render_game_to_text === "function",
    );
    await page.locator(".rift-dom-choice").first().click();
    await page.waitForFunction(
      () => JSON.parse(window.render_game_to_text()).phase === "preparation",
    );
    await attachEngine(page);

    const setup = await page.evaluate(() => {
      const engine = window.__hareiEngine;
      const bridge = window.__hareiBridge;
      engine.state.starter = "blaze";
      engine.state.round = 2;
      engine.state.playerLevel = 4;
      engine.state.board.fill(null);
      engine.state.board[0] = { uid: 1, id: "dawn_duelist", star: 1 };
      engine.startBattle();
      const battle = engine.state.battle;
      const harei = battle.player.find(
        (fighter) => fighter.unitId === "dawn_duelist",
      );
      harei.x = 470;
      harei.y = 430;
      harei.facingX = 1;
      battle.enemy.forEach((fighter, index) => {
        fighter.x = index === 0 ? 590 : 780 + index * 40;
        fighter.y = index === 0 ? 430 : 560;
        fighter.attack = 0;
        fighter.hp = fighter.maxHp = 99_999;
        fighter.armor = 0;
        fighter.dodgeChance = 0;
      });
      [...battle.player, ...battle.enemy].forEach((fighter) => {
        fighter.cooldown = 99;
        fighter.energy = 0;
        fighter.moveSpeed = 0;
        fighter.baseMoveSpeed = 0;
      });
      battle.effects = [];
      engine.rng.next = () => 0.25;
      engine.castAbility(harei, battle.enemy);
      engine.updateControlZones(battle, 0.05);
      bridge.dispatch({ type: "clearSelection" });
      return {
        hareiFid: harei.fid,
        nearFid: battle.enemy[0].fid,
        farFid: battle.enemy[1].fid,
      };
    });
    const pineText = JSON.parse(
      await page.evaluate(() => window.render_game_to_text()),
    );
    assert.ok(
      pineText.battle.visualEffects.effects.some(
        (effect) => effect.kind === "harei_pine",
      ),
    );
    const slowZone = pineText.battle.visualEffects.controlZones.find(
      (zone) => zone.kind === "slow",
    );
    assert.equal(slowZone.radius, 82);
    assert.equal(slowZone.slowMultiplier, 0.82);
    const pineNear = pineText.battle.enemyUnits.find(
      (fighter) => fighter.fid === setup.nearFid,
    );
    assert.equal(pineNear.tauntTime, 0);
    assert.equal(pineNear.slowMultiplier, 0.82);
    const pineHarei = pineText.battle.playerUnits.find(
      (fighter) => fighter.fid === setup.hareiFid,
    );
    assert.equal(pineHarei.shield, 0);
    const pineFar = pineText.battle.enemyUnits.find(
      (fighter) => fighter.fid === setup.farFid,
    );
    assert.equal(pineFar.tauntTime, 0);
    assert.equal(pineFar.slowTime, 0);
    await capture("harei-welcome-pine.png");

    const badgeFlight = await page.evaluate(({ hareiFid, nearFid, farFid }) => {
      const engine = window.__hareiEngine;
      const bridge = window.__hareiBridge;
      const battle = engine.state.battle;
      const harei = battle.player.find((fighter) => fighter.fid === hareiFid);
      battle.effects = [];
      battle.projectiles = [];
      battle.controlZones = [];
      battle.enemy.forEach((fighter) => {
        fighter.stun = 0;
        fighter.tauntTime = 0;
        fighter.tauntedByFid = null;
        fighter.slowTime = 0;
        fighter.slowMultiplier = 1;
      });
      const hpBefore = Object.fromEntries(
        battle.enemy.map((fighter) => [fighter.fid, fighter.hp]),
      );
      engine.rng.next = () => 0.75;
      engine.castAbility(harei, battle.enemy);
      engine.updateProjectiles(battle, 0.1);
      const projectile = battle.projectiles.find(
        (candidate) => candidate.style === "badge",
      );
      bridge.dispatch({ type: "clearSelection" });
      return {
        style: projectile.style,
        emoji: projectile.emoji,
        knockbackDistance: projectile.knockbackDistance,
        nearHpBefore: hpBefore[nearFid],
        farHpBefore: hpBefore[farFid],
      };
    }, setup);
    assert.deepEqual(badgeFlight, {
      style: "badge",
      emoji: "🔘",
      knockbackDistance: 48,
      nearHpBefore: badgeFlight.nearHpBefore,
      farHpBefore: badgeFlight.farHpBefore,
    });
    const badgeFlightText = JSON.parse(
      await page.evaluate(() => window.render_game_to_text()),
    );
    assert.ok(
      badgeFlightText.battle.visualEffects.projectiles.some(
        (projectile) => projectile.style === "badge" &&
          projectile.knockbackDistance === 48,
      ),
    );
    await capture("harei-75mm-badge-flight.png");

    const badgeImpact = await page.evaluate(({ nearFid, farFid, nearHpBefore, farHpBefore }) => {
      const engine = window.__hareiEngine;
      const battle = engine.state.battle;
      for (let tick = 0; tick < 12 && battle.projectiles.length; tick += 1) {
        engine.updateProjectiles(battle, 0.05);
      }
      const near = battle.enemy.find((fighter) => fighter.fid === nearFid);
      const far = battle.enemy.find((fighter) => fighter.fid === farFid);
      return {
        nearDamage: nearHpBefore - near.hp,
        nearStun: near.stun,
        nearMotion: near.abilityMotion?.kind,
        nearPush: near.abilityMotion ? near.abilityMotion.toX - near.x : 0,
        farDamage: farHpBefore - far.hp,
      };
    }, { ...setup, ...badgeFlight });
    assert.ok(badgeImpact.nearDamage > 0);
    assert.equal(badgeImpact.nearStun, 0);
    assert.equal(badgeImpact.nearMotion, "push");
    assert.ok(badgeImpact.nearPush > 40);
    assert.equal(badgeImpact.farDamage, 0);
    const badgeImpactText = JSON.parse(
      await page.evaluate(() => window.render_game_to_text()),
    );
    assert.ok(
      badgeImpactText.battle.visualEffects.effects.some(
        (effect) => effect.kind === "harei_badge",
      ),
    );
    await capture("harei-75mm-badge-impact.png");

    const testTubeFlight = await page.evaluate(() => {
      const engine = window.__hareiEngine;
      const bridge = window.__hareiBridge;
      engine.state.phase = "preparation";
      engine.state.board.fill(null);
      engine.state.board[0] = { uid: 2, id: "mitsuri", star: 1 };
      engine.startBattle();
      const battle = engine.state.battle;
      const mitsuri = battle.player.find(
        (fighter) => fighter.unitId === "mitsuri",
      );
      mitsuri.x = 350;
      mitsuri.y = 430;
      battle.enemy.forEach((fighter, index) => {
        fighter.x = index === 0 ? 555 : 820 + index * 30;
        fighter.y = index === 0 ? 430 : 560;
        fighter.attack = 0;
        fighter.hp = fighter.maxHp = 99_999;
        fighter.baseMoveSpeed = 0;
        fighter.moveSpeed = 0;
      });
      mitsuri.cooldown = 99;
      mitsuri.energy = 0;
      mitsuri.baseMoveSpeed = 0;
      mitsuri.moveSpeed = 0;
      battle.effects = [];
      engine.castAbility(mitsuri, battle.enemy);
      engine.updateProjectiles(battle, 0.1);
      const projectile = battle.projectiles.find(
        (candidate) => candidate.style === "test_tube",
      );
      bridge.dispatch({ type: "clearSelection" });
      return {
        mitsuriFid: mitsuri.fid,
        targetFid: battle.enemy[0].fid,
        style: projectile.style,
        emoji: projectile.emoji,
      };
    });
    assert.equal(testTubeFlight.style, "test_tube");
    assert.equal(testTubeFlight.emoji, "🧪");
    const tubeText = JSON.parse(
      await page.evaluate(() => window.render_game_to_text()),
    );
    assert.ok(
      tubeText.battle.visualEffects.projectiles.some(
        (projectile) => projectile.style === "test_tube" &&
          projectile.emoji === "🧪",
      ),
    );
    await capture("mitsuri-test-tube-flight.png");

    const fearResult = await page.evaluate(({ targetFid }) => {
      const engine = window.__hareiEngine;
      const battle = engine.state.battle;
      for (let tick = 0; tick < 12 && battle.projectiles.length; tick += 1) {
        engine.updateProjectiles(battle, 0.05);
      }
      const zone = battle.controlZones.find((candidate) => candidate.kind === "fear");
      const target = battle.enemy.find((fighter) => fighter.fid === targetFid);
      target.x = zone.x + 8;
      target.y = zone.y;
      target.baseMoveSpeed = 58;
      target.moveSpeed = 58;
      const distanceBefore = Math.hypot(target.x - zone.x, target.y - zone.y);
      engine.update(0.05);
      return {
        radius: zone.radius,
        duration: zone.maxLife,
        fearTime: target.fearTime,
        distanceBefore,
        distanceAfter: Math.hypot(target.x - zone.x, target.y - zone.y),
      };
    }, testTubeFlight);
    assert.equal(fearResult.radius, 118);
    assert.equal(fearResult.duration, 4.2);
    assert.ok(fearResult.fearTime > 0);
    assert.ok(fearResult.distanceAfter > fearResult.distanceBefore);
    const fearText = JSON.parse(
      await page.evaluate(() => window.render_game_to_text()),
    );
    assert.ok(
      fearText.battle.visualEffects.controlZones.some(
        (zone) => zone.kind === "fear" && zone.radius === 118,
      ),
    );
    assert.ok(
      fearText.battle.visualEffects.effects.some(
        (effect) => effect.kind === "fear_field",
      ),
    );
    await capture("mitsuri-fear-field.png");

    await page.setViewportSize({ width: 390, height: 844 });
    await capture("mitsuri-fear-field-mobile.png");

    const canvasState = await canvas.evaluate((element) => ({
      width: element.width,
      height: element.height,
      logicalWidth: element.dataset.logicalWidth,
      logicalHeight: element.dataset.logicalHeight,
    }));
    assert.ok(canvasState.width > 0 && canvasState.height > 0);
    assert.deepEqual(errors, []);
    assert.deepEqual(failedResponses, []);
    console.log(
      JSON.stringify(
        {
          setup,
          badgeFlight,
          badgeImpact,
          testTubeFlight,
          fearResult,
          canvas: canvasState,
          screenshots,
          errors,
          failedResponses,
        },
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
