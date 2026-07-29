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
const artifactDirectory = ".tmp/autochess/nightin-cigarettes";
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
    while (hook) {
      if (hook.memoizedState?.current?.engine?.state) {
        bridge = hook.memoizedState.current;
        break;
      }
      hook = hook.next;
    }
    if (!bridge) throw new Error("Unable to locate the autochess engine bridge");
    bridge.setHidden(true);
    window.__nightinBridge = bridge;
    window.__nightinEngine = bridge.engine;
  });
};

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

    await page.goto(`${baseUrl}/game/autochess?seed=263`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    const canvas = page.locator('[data-game-canvas="rift-line"]');
    await canvas.waitFor();
    await page.waitForFunction(() => typeof window.render_game_to_text === "function");
    await page.locator(".rift-dom-choice").first().click();
    await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === "preparation");
    await attachEngine(page);

    const setup = await page.evaluate(() => {
      const engine = window.__nightinEngine;
      const bridge = window.__nightinBridge;
      engine.state.round = 6;
      engine.state.playerLevel = 4;
      engine.state.board.fill(null);
      engine.state.board[0] = { uid: 1, id: "nightin", star: 1 };
      bridge.dispatch({ type: "battle" });
      const battle = engine.state.battle;
      const nightin = battle.player[0];
      nightin.x = 250;
      nightin.y = 400;
      battle.enemy.forEach((fighter, index) => {
        fighter.x = index < 3 ? 650 : 860;
        fighter.y = index < 3 ? 320 + index * 80 : 220 + index * 60;
        fighter.hp = fighter.maxHp = 99_999;
        fighter.armor = 0;
        fighter.attack = 0;
        fighter.cooldown = 99;
        fighter.dodgeChance = 0;
        fighter.stun = 0;
        fighter.burnTime = 0;
      });
      battle.effects = [];
      const hpBefore = battle.enemy.map((fighter) => fighter.hp);
      engine.castAbility(nightin, battle.enemy);
      engine.updateProjectileVolley(battle, 0.01);
      engine.updateProjectiles(battle, 0.16);
      engine.updateProjectileVolley(battle, 0.16);
      engine.updateProjectiles(battle, 0.16);
      engine.updateProjectileVolley(battle, 0.16);
      bridge.dispatch({ type: "clearSelection" });
      return {
        nightinFid: nightin.fid,
        hpBefore,
        projectiles: battle.projectiles
          .filter((projectile) => projectile.style === "cigarette")
          .map((projectile) => ({
            x: Number(projectile.x.toFixed(1)),
            y: Number(projectile.y.toFixed(1)),
            speed: Number(Math.hypot(projectile.velocityX, projectile.velocityY).toFixed(1)),
            emoji: projectile.emoji,
          })),
      };
    });
    assert.equal(setup.projectiles.length, 3);
    assert.ok(setup.projectiles.every((projectile) => projectile.speed === 260 && projectile.emoji === "🚬"));
    assert.equal(new Set(setup.projectiles.map((projectile) => projectile.x)).size, 3);
    await capture("nightin-cigarettes-flight.png");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(250);
    await capture("nightin-cigarettes-flight-mobile.png");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(250);

    const impact = await page.evaluate((hpBefore) => {
      const engine = window.__nightinEngine;
      const bridge = window.__nightinBridge;
      const battle = engine.state.battle;
      for (let tick = 0; tick < 80 && battle.projectiles.length; tick += 1) {
        engine.updateProjectiles(battle, 0.05);
      }
      bridge.dispatch({ type: "clearSelection" });
      return {
        projectileRemaining: battle.projectiles.filter((projectile) => projectile.style === "cigarette").length,
        enemies: battle.enemy.map((fighter, index) => ({
          fid: fighter.fid,
          damage: Number((hpBefore[index] - fighter.hp).toFixed(2)),
          burnTime: fighter.burnTime,
          burnDps: Number(fighter.burnDps.toFixed(2)),
          stun: fighter.stun,
        })),
        burnLabels: battle.effects.filter((effect) => effect.text === "灼烧").length,
      };
    }, setup.hpBefore);
    assert.equal(impact.projectileRemaining, 0);
    assert.ok(impact.enemies.filter((enemy) => enemy.damage > 0 && enemy.burnTime > 0 && enemy.burnDps > 0).length >= 2);
    assert.ok(impact.enemies.every((enemy) => enemy.stun === 0));
    assert.ok(impact.burnLabels >= 2);
    await capture("nightin-cigarettes-impact.png");

    const textState = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    assert.equal(textState.phase, "battle");
    const nightinState = textState.battle.playerUnits.find((fighter) => fighter.fid === setup.nightinFid);
    assert.ok(nightinState);
    const canvasState = await canvas.evaluate((element) => ({
      width: element.width,
      height: element.height,
      logicalWidth: element.dataset.logicalWidth,
      logicalHeight: element.dataset.logicalHeight,
    }));
    assert.ok(canvasState.width > 0 && canvasState.height > 0);
    if (errors.length || failedResponses.length) {
      console.error(JSON.stringify({ errors, failedResponses }, null, 2));
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(failedResponses, []);
    console.log(JSON.stringify({
      setup,
      impact,
      canvas: canvasState,
      screenshots,
      errors,
      failedResponses,
    }, null, 2));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
