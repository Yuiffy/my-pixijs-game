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
const artifactDirectory = ".tmp/autochess/tower-hack";
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
    window.__towerHackBridge = bridge;
    window.__towerHackEngine = bridge.engine;
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

    await page.goto(`${baseUrl}/game/autochess?seed=429`, {
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
      const engine = window.__towerHackEngine;
      const bridge = window.__towerHackBridge;
      engine.state.round = 6;
      engine.state.playerLevel = 4;
      engine.state.board.fill(null);
      engine.state.board[0] = { uid: 1, id: "tower_god", star: 1 };
      engine.state.board[1] = { uid: 2, id: "mossback", star: 1 };
      engine.state.board[2] = { uid: 3, id: "ember_blade", star: 1 };
      bridge.dispatch({ type: "battle" });
      const battle = engine.state.battle;
      const tower = battle.player.find((fighter) => fighter.unitId === "tower_god");
      const target = battle.player.find((fighter) => fighter.unitId === "mossback");
      const farAlly = battle.player.find((fighter) => fighter.unitId === "ember_blade");
      tower.x = 350;
      tower.y = 360;
      target.x = 425;
      target.y = 360;
      farAlly.x = 100;
      farAlly.y = 590;
      [...battle.player, ...battle.enemy].forEach((fighter) => {
        fighter.cooldown = 99;
        fighter.dodgeChance = 0;
      });
      battle.enemy.forEach((fighter, index) => {
        fighter.x = 720 + index * 42;
        fighter.y = 180 + index * 88;
        fighter.attack = 0;
        fighter.hp = fighter.maxHp = 99_999;
      });
      const before = {
        attack: target.attack,
        armor: target.armor,
        attackInterval: target.attackInterval,
        moveSpeed: target.moveSpeed,
      };
      tower.energy = tower.maxEnergy;
      engine.castAbility(tower, battle.enemy);
      bridge.dispatch({ type: "clearSelection" });
      return {
        before,
        towerFid: tower.fid,
        targetFid: target.fid,
        farAllyFid: farAlly.fid,
      };
    });

    const armedText = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    const armedTower = armedText.battle.playerUnits.find((fighter) => fighter.fid === setup.towerFid);
    const armedTarget = armedText.battle.playerUnits.find((fighter) => fighter.fid === setup.targetFid);
    assert.equal(armedTower.towerHackArmed, true);
    assert.equal(armedTarget.towerHackBuffed, false);
    await capture("tower-hack-armed.png");

    const transferred = await page.evaluate(({ towerFid, targetFid, farAllyFid }) => {
      const engine = window.__towerHackEngine;
      const bridge = window.__towerHackBridge;
      const battle = engine.state.battle;
      const tower = battle.player.find((fighter) => fighter.fid === towerFid);
      const target = battle.player.find((fighter) => fighter.fid === targetFid);
      const farAlly = battle.player.find((fighter) => fighter.fid === farAllyFid);
      engine.damage(battle.enemy[0], tower, tower.maxHp * 20);
      bridge.dispatch({ type: "clearSelection" });
      return {
        banner: battle.banner,
        towerAlive: tower.alive,
        target: {
          buffed: target.towerHackBuffed,
          attack: target.attack,
          armor: target.armor,
          attackInterval: target.attackInterval,
          moveSpeed: target.moveSpeed,
        },
        farAllyBuffed: farAlly.towerHackBuffed,
      };
    }, setup);
    assert.equal(transferred.towerAlive, false);
    assert.equal(transferred.target.buffed, true);
    assert.equal(transferred.farAllyBuffed, false);
    assert.match(transferred.banner, /哈哈哈我开挂了.*这游戏怎么这么简单啊/);
    assert.ok(Math.abs(transferred.target.attack - setup.before.attack * 1.45) < 0.001);
    assert.equal(transferred.target.armor, setup.before.armor + 25);
    assert.ok(Math.abs(transferred.target.attackInterval - setup.before.attackInterval / 1.45) < 0.001);
    assert.equal(transferred.target.moveSpeed, setup.before.moveSpeed + 45);

    const transferredText = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    const buffedTarget = transferredText.battle.playerUnits.find((fighter) => fighter.fid === setup.targetFid);
    assert.equal(buffedTarget.towerHackBuffed, true);
    assert.equal(buffedTarget.towerHackAttackBonus, 0.45);
    assert.equal(buffedTarget.towerHackArmorBonus, 25);
    assert.equal(buffedTarget.towerHackAttackSpeed, 0.45);
    assert.equal(buffedTarget.towerHackMoveSpeed, 45);
    await capture("tower-hack-transferred.png");

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
      transferred,
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
