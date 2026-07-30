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
const artifactDirectory = ".tmp/autochess/sui-bird-dash";
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
    window.__suiBirdBridge = bridge;
    window.__suiBirdEngine = bridge.engine;
  });
};

const motionSnapshot = (motion, charges) => motion && ({
  key: `${charges}:${motion.fromX}:${motion.fromY}:${motion.toX}:${motion.toY}`,
  charges,
  from: { x: motion.fromX, y: motion.fromY },
  to: { x: motion.toX, y: motion.toY },
  distance: Math.hypot(motion.toX - motion.fromX, motion.toY - motion.fromY),
});

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
      const result = { path, bytes: buffer.length, metrics: inspectPng(buffer) };
      screenshots.push(result);
      return result;
    };

    const response = await page.request.get(`${baseUrl}/game/autochess?seed=401`);
    assert.ok(response.ok(), `Dev server did not respond: ${response.status()}`);
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

    const setup = await page.evaluate(() => {
      const engine = window.__suiBirdEngine;
      const bridge = window.__suiBirdBridge;
      engine.state.round = 6;
      engine.state.playerLevel = 4;
      engine.state.board.fill(null);
      engine.state.board[0] = { uid: 1, id: "sui_bird", star: 1 };
      engine.startBattle();
      const battle = engine.state.battle;
      const bird = battle.player[0];
      bird.x = 240;
      bird.y = 360;
      battle.enemy.forEach((fighter, index) => {
        fighter.x = 650 + index * 45;
        fighter.y = 330 + (index % 2) * 60;
        fighter.hp = fighter.maxHp = 99_999;
        fighter.armor = 0;
        fighter.attack = 0;
        fighter.cooldown = 99;
        fighter.energy = 0;
        fighter.dodgeChance = 0;
        fighter.moveSpeed = 0;
      });
      const target = battle.enemy[0];
      target.x = bird.x + 240 + target.radius + 5;
      target.y = bird.y;
      bird.energy = bird.maxEnergy;
      engine.update(0.05);
      const outOfRange = {
        energy: bird.energy,
        motion: bird.abilityMotion,
      };
      target.x = bird.x + 240;
      engine.update(0.05);
      bridge.dispatch({ type: "clearSelection" });
      return {
        outOfRange,
        firstMotion: bird.abilityMotion && {
          charges: bird.suiBirdChargesRemaining,
          from: { x: bird.abilityMotion.fromX, y: bird.abilityMotion.fromY },
          to: { x: bird.abilityMotion.toX, y: bird.abilityMotion.toY },
          distance: Math.hypot(
            bird.abilityMotion.toX - bird.abilityMotion.fromX,
            bird.abilityMotion.toY - bird.abilityMotion.fromY,
          ),
        },
        abilityRange: 240,
        targetFid: target.fid,
      };
    });

    assert.equal(setup.outOfRange.energy, 100);
    assert.equal(setup.outOfRange.motion, null);
    assert.ok(setup.firstMotion);
    assert.equal(setup.firstMotion.charges, 2);
    assert.ok(Math.abs(setup.firstMotion.distance - setup.abilityRange) < 0.001);

    const motions = [setup.firstMotion];
    const motionKeys = new Set([
      `2:${setup.firstMotion.from.x}:${setup.firstMotion.from.y}:${setup.firstMotion.to.x}:${setup.firstMotion.to.y}`,
    ]);
    await page.evaluate(() => window.advanceTime(100));
    const midState = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    const midBird = midState.battle.playerUnits.find((fighter) => fighter.unitId === "sui_bird");
    assert.equal(midBird.motion?.abilityId, "sui_bird");
    await capture("sui-bird-first-dash.png");

    let firstDashHit = false;
    for (let frame = 0; frame < 40; frame += 1) {
      await page.evaluate(() => window.advanceTime(40));
      const snapshot = await page.evaluate(() => {
        const engine = window.__suiBirdEngine;
        const battle = engine.state.battle;
        const bird = battle.player[0];
        const target = battle.enemy.find((fighter) => fighter.fid === window.__suiBirdTargetFid)
          || battle.enemy[0];
        return {
          charges: bird.suiBirdChargesRemaining,
          motion: bird.abilityMotion && {
            fromX: bird.abilityMotion.fromX,
            fromY: bird.abilityMotion.fromY,
            toX: bird.abilityMotion.toX,
            toY: bird.abilityMotion.toY,
          },
          targetDamage: target.damageTaken,
        };
      });
      if (snapshot.charges <= 1 && snapshot.targetDamage > 0) firstDashHit = true;
      const observed = motionSnapshot(snapshot.motion, snapshot.charges);
      if (observed && !motionKeys.has(observed.key)) {
        motionKeys.add(observed.key);
        motions.push(observed);
      }
      if (!snapshot.motion && snapshot.charges === 0) break;
    }

    const finished = await page.evaluate(() => {
      const engine = window.__suiBirdEngine;
      const battle = engine.state.battle;
      const bird = battle.player[0];
      return {
        charges: bird.suiBirdChargesRemaining,
        motion: bird.abilityMotion,
        damaged: battle.enemy.filter((fighter) => fighter.damageTaken > 0).length,
      };
    });
    const finalTextState = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    const canvasBox = await canvas.boundingBox();
    const canvasMeta = await canvas.evaluate((element) => ({
      width: element.width,
      height: element.height,
      logicalWidth: element.dataset.logicalWidth,
      logicalHeight: element.dataset.logicalHeight,
    }));

    assert.equal(firstDashHit, true);
    assert.equal(finished.charges, 0);
    assert.equal(finished.motion, null);
    assert.ok(finished.damaged >= 1);
    assert.equal(motions.length, 3);
    motions.forEach((motion) => {
      assert.ok(
        Math.abs(motion.distance - setup.abilityRange) < 0.001,
        `Expected fixed dash distance: ${JSON.stringify(motions)}`,
      );
    });
    assert.equal(finalTextState.phase, "battle");
    assert.equal(finalTextState.battle.playerUnits[0].elbowCharges, undefined);
    assert.ok(canvasBox && canvasBox.width > 1000 && canvasBox.height > 700);
    assert.ok(Number(canvasMeta.width) > 0 && Number(canvasMeta.height) > 0);
    assert.deepEqual(
      errors,
      [],
      `Browser errors: ${JSON.stringify({ errors, failedResponses })}`,
    );
    assert.deepEqual(failedResponses, []);
    await capture("sui-bird-three-dashes-finished.png");

    console.log(JSON.stringify({
      setup,
      motions,
      firstDashHit,
      finished,
      finalTextState: {
        phase: finalTextState.phase,
        elapsed: finalTextState.battle.elapsed,
        bird: finalTextState.battle.playerUnits[0],
      },
      canvasBox,
      canvasMeta,
      screenshots,
      errors,
      failedResponses,
    }, null, 2));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
