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
const artifactDirectory = ".tmp/autochess/lian-finale";
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
    window.__lianBridge = bridge;
    window.__lianEngine = bridge.engine;
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

    const response = await page.request.get(`${baseUrl}/game/autochess?seed=264`);
    assert.ok(response.ok(), `Dev server did not respond: ${response.status()}`);
    await page.goto(`${baseUrl}/game/autochess?seed=264`, {
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
      const engine = window.__lianEngine;
      const bridge = window.__lianBridge;
      engine.state.round = 6;
      engine.state.playerLevel = 4;
      engine.state.board.fill(null);
      engine.state.board[0] = { uid: 1, id: "lian", star: 1 };
      engine.state.board[1] = { uid: 2, id: "mossback", star: 1 };
      engine.state.board[2] = { uid: 3, id: "rutice", star: 1 };
      engine.state.board[3] = { uid: 4, id: "ember_blade", star: 1 };
      bridge.dispatch({ type: "battle" });
      const battle = engine.state.battle;
      const lian = battle.player.find((fighter) => fighter.unitId === "lian");
      const allies = battle.player.filter((fighter) => fighter !== lian);
      lian.x = 260;
      lian.y = 420;
      battle.enemy.forEach((fighter, index) => {
        fighter.x = 665 + (index % 3) * 48;
        fighter.y = 350 + Math.floor(index / 3) * 74 + (index % 2) * 28;
      });
      allies[0].x = 650;
      allies[0].y = 420;
      allies.slice(1).forEach((fighter, index) => {
        fighter.x = 210 + index * 88;
        fighter.y = 520 + (index % 2) * 58;
      });
      [...battle.player, ...battle.enemy].forEach((fighter) => {
        fighter.energy = 0;
        fighter.attack = fighter.team === "enemy" ? 0 : fighter.attack;
        fighter.cooldown = 99;
        fighter.dodgeChance = 0;
        fighter.moveSpeed = 0;
        fighter.energyPerSecond = 0;
        fighter.energyOnAttack = 0;
        fighter.energyOnHit = 0;
      });
      battle.effects = [];
      engine.castAbility(lian, battle.enemy);
      for (let frame = 0; frame < 4; frame += 1) engine.update(0.05);
      engine.update(0.02);
      bridge.dispatch({ type: "clearSelection" });
      const delivery = battle.projectiles.find((projectile) => projectile.impactAbilityId === "lian");
      return {
        lianFid: lian.fid,
        impactAllyFid: allies[0].fid,
        outsideAllyFids: allies.slice(1).map((fighter) => fighter.fid),
        delivery: delivery && {
          style: delivery.style,
          x: Number(delivery.x.toFixed(1)),
          y: Number(delivery.y.toFixed(1)),
          size: delivery.size,
        },
      };
    });
    assert.equal(setup.delivery?.style, "finale_star");
    assert.ok(setup.delivery.size >= 18);
    await capture("lian-finale-flight.png");

    const impact = await page.evaluate(() => {
      const engine = window.__lianEngine;
      const bridge = window.__lianBridge;
      const battle = engine.state.battle;
      let travelFrames = 0;
      while (
        battle.projectiles.some((projectile) => projectile.impactAbilityId === "lian") &&
        travelFrames < 20
      ) {
        engine.update(0.05);
        travelFrames += 1;
      }
      bridge.dispatch({ type: "clearSelection" });
      return {
        travelFrames,
        projectileRemaining: battle.projectiles.some((projectile) => projectile.impactAbilityId === "lian"),
        finaleCount: battle.effects.filter((effect) => effect.kind === "finale").length,
        energyPulseCount: battle.effects.filter((effect) => effect.kind === "energy_pulse").length,
        energyPulsePositions: battle.effects
          .filter((effect) => effect.kind === "energy_pulse")
          .map((effect) => ({ x: effect.x, y: effect.y, maxLife: effect.maxLife })),
        energyLabels: battle.effects
          .filter((effect) => effect.kind === "energy_pulse")
          .map((effect) => effect.text),
        energies: battle.player.map((fighter) => ({ fid: fighter.fid, energy: fighter.energy })),
      };
    });
    assert.equal(impact.projectileRemaining, false);
    assert.equal(impact.finaleCount, 1);
    assert.equal(impact.energyPulseCount, 1);
    assert.ok(impact.energyLabels.every((label) => label === "+15 能量"));
    assert.ok(impact.energyPulsePositions.every((effect) => effect.maxLife === 0.46));
    assert.equal(impact.energies.find((fighter) => fighter.fid === setup.impactAllyFid)?.energy, 15);
    assert.ok(setup.outsideAllyFids.every((fid) =>
      impact.energies.find((fighter) => fighter.fid === fid)?.energy === 0
    ));

    const textState = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    assert.equal(textState.phase, "battle");
    const lianState = textState.battle.playerUnits.find((fighter) => fighter.fid === setup.lianFid);
    assert.equal(lianState.energy, 0);
    await capture("lian-finale-impact.png");

    const desktopCanvas = await canvas.evaluate((element) => ({
      width: element.width,
      height: element.height,
      logicalWidth: element.dataset.logicalWidth,
      logicalHeight: element.dataset.logicalHeight,
    }));
    assert.ok(desktopCanvas.width > 0 && desktopCanvas.height > 0);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(250);
    await capture("lian-finale-impact-mobile.png");
    const mobileCanvas = await canvas.evaluate((element) => ({
      width: element.width,
      height: element.height,
      logicalWidth: element.dataset.logicalWidth,
      logicalHeight: element.dataset.logicalHeight,
    }));
    assert.ok(mobileCanvas.width > 0 && mobileCanvas.height > 0);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(250);

    const fading = await page.evaluate(() => {
      const engine = window.__lianEngine;
      const bridge = window.__lianBridge;
      const battle = engine.state.battle;
      for (let frame = 0; frame < 7; frame += 1) engine.update(0.05);
      bridge.dispatch({ type: "clearSelection" });
      return battle.effects.filter((effect) =>
        ["finale", "energy_pulse"].includes(effect.kind) ||
        (effect.kind === "line" && effect.maxLife === 0.36)
      ).map((effect) => ({ kind: effect.kind, life: effect.life, maxLife: effect.maxLife }));
    });
    assert.deepEqual(fading.map((effect) => effect.kind).sort(), ["energy_pulse", "finale", "line"]);
    await capture("lian-finale-impact-350ms.png");

    const settled = await page.evaluate(() => {
      const engine = window.__lianEngine;
      const bridge = window.__lianBridge;
      const battle = engine.state.battle;
      for (let frame = 0; frame < 7; frame += 1) engine.update(0.05);
      bridge.dispatch({ type: "clearSelection" });
      return battle.effects.filter((effect) =>
        ["finale", "energy_pulse"].includes(effect.kind) ||
        (effect.kind === "line" && effect.maxLife === 0.36)
      ).length;
    });
    assert.equal(settled, 0);
    await capture("lian-finale-settled.png");
    if (errors.length || failedResponses.length) {
      console.error(JSON.stringify({ errors, failedResponses }, null, 2));
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(failedResponses, []);
    console.log(JSON.stringify({
      setup,
      impact,
      desktopCanvas,
      mobileCanvas,
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
