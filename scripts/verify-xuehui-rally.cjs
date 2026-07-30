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
    metrics.colors > 1
      && metrics.nearBlackRatio < 0.97
      && metrics.transparentRatio < 0.97,
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
      const fiberKey = Object.keys(node).find((key) => key.startsWith("__reactFiber$"));
      fiber = fiberKey ? node[fiberKey] : null;
      node = node.parentElement;
    }
    while (fiber && fiber.type?.name !== "AutoChessGame") fiber = fiber.return;
    let hook = fiber?.memoizedState;
    while (hook) {
      if (hook.memoizedState?.current?.engine?.state) {
        window.__xuehuiVerificationEngine = hook.memoizedState.current.engine;
        return;
      }
      hook = hook.next;
    }
    throw new Error("Unable to locate autochess engine");
  });
};

const { chromium } = loadPlaywright();
const baseUrl = process.env.AUTOCHESS_BASE_URL || "http://127.0.0.1:3100";
const artifactDirectory = ".tmp/autochess/xuehui-rally";
mkdirSync(artifactDirectory, { recursive: true });

(async () => {
  const browser = await chromium.launch({
    channel: "chrome",
    headless: process.env.AUTOCHESS_HEADED !== "1",
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  const failedResponses = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400) failedResponses.push({ status: response.status(), url: response.url() });
  });

  try {
    await page.goto(`${baseUrl}/game/autochess?seed=957`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    const canvas = page.locator('[data-game-canvas="rift-line"]');
    await canvas.waitFor();
    await page.waitForFunction(() => typeof window.render_game_to_text === "function");
    await page.locator(".rift-dom-choice").first().click();
    await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === "preparation");
    await attachEngine(page);

    await page.evaluate(() => {
      const engine = window.__xuehuiVerificationEngine;
      engine.state.round = 6;
      engine.state.playerLevel = 4;
      engine.state.board.fill(null);
      engine.state.board[0] = { uid: 1, id: "xuehui", star: 1 };
      engine.state.board[1] = { uid: 2, id: "mossback", star: 1 };
      engine.state.board[2] = { uid: 3, id: "grove_mender", star: 1 };
      engine.startBattle();
      const battle = engine.state.battle;
      [...battle.player, ...battle.enemy].forEach((fighter) => {
        fighter.attack = 0;
        fighter.cooldown = 99;
        fighter.energy = 0;
        fighter.dodgeChance = 0;
        fighter.moveSpeed = 0;
        fighter.baseMoveSpeed = 0;
      });
      battle.player.forEach((fighter, index) => {
        fighter.x = 300 + index * 150;
        fighter.y = 390;
      });
      battle.enemy.forEach((fighter, index) => {
        fighter.x = 900 + (index % 2) * 90;
        fighter.y = 250 + Math.floor(index / 2) * 130;
        fighter.hp = fighter.maxHp * 0.5;
      });
      engine.update(0.05);
    });
    await page.evaluate(() => window.advanceTime(16));

    const proudState = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    const proudXuehui = proudState.battle.playerUnits.find((fighter) => fighter.name === "雪绘");
    const proudAllies = proudState.battle.playerUnits.filter((fighter) => fighter.name !== "雪绘");
    assert.equal(proudXuehui.syncAvDirection, 1);
    assert.equal(proudXuehui.syncAvStrength, 1);
    assert.equal(proudXuehui.range, 45);
    assert.equal(proudXuehui.attackInterval, 1.1);
    assert.ok(proudAllies.every((fighter) => fighter.syncAvDirection === 0));

    const proudPath = `${artifactDirectory}/xuehui-proud.png`;
    const proudBuffer = await page.screenshot({ path: proudPath, fullPage: true });
    const proudMetrics = inspectPng(proudBuffer);
    await page.evaluate(() => window.advanceTime(800));

    await page.evaluate(() => {
      const engine = window.__xuehuiVerificationEngine;
      const battle = engine.state.battle;
      battle.player.forEach((fighter) => { fighter.hp = fighter.maxHp * 0.5; });
      battle.enemy.forEach((fighter) => { fighter.hp = fighter.maxHp; });
      engine.update(0.05);
    });
    await page.evaluate(() => window.advanceTime(16));

    const rallyState = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    const rallyXuehui = rallyState.battle.playerUnits.find((fighter) => fighter.name === "雪绘");
    const rallyAllies = rallyState.battle.playerUnits.filter((fighter) => fighter.name !== "雪绘");
    assert.equal(rallyXuehui.syncAvDirection, -1);
    assert.equal(rallyXuehui.syncAvStrength, 1);
    assert.equal(rallyXuehui.range, 84);
    assert.equal(rallyXuehui.attackInterval, 0.59);
    assert.ok(rallyAllies.every((fighter) => fighter.syncAvDirection === -1));
    assert.ok(rallyAllies.every((fighter) => fighter.syncAvStrength === 1));

    const rallyPath = `${artifactDirectory}/xuehui-team-rally.png`;
    const rallyBuffer = await page.screenshot({ path: rallyPath, fullPage: true });
    const rallyMetrics = inspectPng(rallyBuffer);
    const canvasMetrics = await canvas.evaluate((element) => ({
      width: element.width,
      height: element.height,
      clientWidth: element.clientWidth,
      clientHeight: element.clientHeight,
    }));
    assert.ok(canvasMetrics.width > 1000 && canvasMetrics.height > 500);

    const unexpectedErrors = errors.filter((error) => !error.includes("/api/record"));
    const unexpectedResponses = failedResponses.filter(
      (response) => !response.url.endsWith("/api/record"),
    );
    assert.deepEqual(unexpectedErrors, []);
    assert.deepEqual(unexpectedResponses, []);
    console.log(JSON.stringify({
      proud: {
        xuehui: proudXuehui,
        allies: proudAllies,
        screenshot: { path: proudPath, bytes: proudBuffer.length, metrics: proudMetrics },
      },
      rally: {
        xuehui: rallyXuehui,
        allies: rallyAllies,
        screenshot: { path: rallyPath, bytes: rallyBuffer.length, metrics: rallyMetrics },
      },
      canvas: canvasMetrics,
      errors: unexpectedErrors,
      failedResponses: unexpectedResponses,
    }, null, 2));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
