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
      if (chunk[8] !== 8 || chunk[12] !== 0 || !channels) {
        throw new Error("Unsupported PNG encoding");
      }
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
const baseUrl = process.env.AUTOCHESS_BASE_URL || "http://127.0.0.1:3100";
const artifactDirectory = ".tmp/autochess/target-strategies";
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
    window.__targetStrategyEngine = bridge.engine;
  });
};

const enterPreparation = async (page, seed) => {
  await page.goto(`${baseUrl}/game/autochess?seed=${seed}`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.locator('[data-game-canvas="rift-line"]').waitFor();
  await page.locator(".rift-dom-choice").first().click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === "preparation");
  await attachEngine(page);
};

const capture = async (page, filename) => {
  const path = `${artifactDirectory}/${filename}`;
  const buffer = await page.screenshot({ path, fullPage: true });
  return { path, bytes: buffer.length, metrics: inspectPng(buffer) };
};

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  const failedResponses = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400) {
      failedResponses.push({ status: response.status(), url: response.url() });
    }
  });

  await enterPreparation(page, 206);
  const castSetup = await page.evaluate(() => {
    const engine = window.__targetStrategyEngine;
    engine.state.round = 6;
    engine.state.playerLevel = 4;
    engine.state.board.fill(null);
    engine.state.board[0] = { uid: 1, id: "spark_mage", star: 1 };
    engine.state.board[1] = { uid: 2, id: "biscuit_sui", star: 1 };
    engine.startBattle();
    const battle = engine.state.battle;
    const mage = battle.player.find((fighter) => fighter.unitId === "spark_mage");
    const biscuit = battle.player.find((fighter) => fighter.unitId === "biscuit_sui");
    mage.x = 240;
    mage.y = 260;
    biscuit.x = 240;
    biscuit.y = 460;
    [...battle.player, ...battle.enemy].forEach((fighter) => {
      fighter.cooldown = 99;
      fighter.attack = 0;
      fighter.energy = 0;
      fighter.hp = fighter.maxHp = 99_999;
    });
    battle.enemy.forEach((fighter, index) => {
      if (index < 3) {
        fighter.x = 650 + index * 24;
        fighter.y = 270 + index * 22;
      } else {
        fighter.x = 920;
        fighter.y = 540 - (index - 3) * 130;
      }
    });
    const farthest = [...battle.enemy].sort(
      (a, b) =>
        Math.hypot(b.x - biscuit.x, b.y - biscuit.y) -
        Math.hypot(a.x - biscuit.x, a.y - biscuit.y),
    )[0];
    engine.castAbility(mage, battle.enemy);
    engine.castAbility(biscuit, battle.enemy);
    const delivery = battle.projectiles.find(
      (projectile) => projectile.impactAbilityId === "spark_mage",
    );
    const velocity = Math.hypot(delivery.velocityX, delivery.velocityY);
    const duration = delivery.remainingRange / velocity;
    const mageTarget = {
      x: delivery.x + delivery.velocityX * duration,
      y: delivery.y + delivery.velocityY * duration,
    };
    return {
      phase: engine.state.phase,
      mageTarget,
      mageCoverage: battle.enemy.filter(
        (target) => Math.hypot(target.x - mageTarget.x, target.y - mageTarget.y) <= 108,
      ).length,
      biscuitTargetFid: biscuit.abilityMotion?.targetFid,
      farthestFid: farthest.fid,
    };
  });
  if (
    castSetup.phase !== "battle" ||
    castSetup.mageCoverage !== 3 ||
    castSetup.mageTarget.x >= 750 ||
    castSetup.biscuitTargetFid !== castSetup.farthestFid
  ) {
    throw new Error(`Unexpected cast targeting: ${JSON.stringify(castSetup)}`);
  }
  await page.evaluate(() => window.advanceTime(250));
  const castScreenshot = await capture(page, "crowd-and-farthest.png");
  await page.evaluate(() => window.advanceTime(450));
  const castTextState = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  const impactScreenshot = await capture(page, "crowd-and-farthest-impact.png");
  if (
    castTextState.phase !== "battle" ||
    !castTextState.battle.visualEffects.chronospheres.length
  ) {
    throw new Error(`North mage impact missing from text state: ${JSON.stringify(castTextState.battle)}`);
  }

  await enterPreparation(page, 207);
  const assassinSetup = await page.evaluate(() => {
    const engine = window.__targetStrategyEngine;
    engine.state.round = 6;
    engine.state.playerLevel = 4;
    engine.state.board.fill(null);
    engine.state.board[0] = { uid: 11, id: "rift_stalker", star: 1 };
    engine.state.board[1] = { uid: 12, id: "akirinco", star: 1 };
    engine.state.board[2] = { uid: 13, id: "ember_blade", star: 1 };
    engine.startBattle();
    const battle = engine.state.battle;
    const assassins = battle.player.filter((fighter) => fighter.jumpPending);
    assassins.forEach((fighter, index) => {
      fighter.x = 180;
      fighter.y = index === 0 ? 280 : 460;
      fighter.cooldown = 99;
      fighter.energy = 0;
    });
    battle.enemy.forEach((fighter, index) => {
      fighter.x = index < 2 ? 900 : 620;
      fighter.y = index === 0 ? 280 : index === 1 ? 460 : 220 + index * 55;
      fighter.attack = 0;
      fighter.cooldown = 99;
      fighter.moveSpeed = 0;
      fighter.energy = 0;
      fighter.hp = fighter.maxHp = 99_999;
    });
    battle.enemy[0].hp = 50_000;
    battle.enemy[1].hp = 75_000;
    const backlineFids = battle.enemy
      .filter((fighter) => fighter.x === 900)
      .map((fighter) => fighter.fid);
    const focusTargetFid = battle.enemy[0].fid;
    battle.engagedTeams.player = true;
    engine.update(0.05);
    return {
      phase: engine.state.phase,
      backlineFids,
      focusTargetFid,
      assassins: assassins.map((fighter) => ({
        fid: fighter.fid,
        targetFid: fighter.targetFid,
        jumpFromX: fighter.jumpFromX,
        jumpFromY: fighter.jumpFromY,
        jumpToX: fighter.jumpToX,
        jumpToY: fighter.jumpToY,
        jumpTime: fighter.jumpTime,
      })),
    };
  });
  const assassinTargets = assassinSetup.assassins.map((fighter) => fighter.targetFid);
  if (
    assassinSetup.phase !== "battle" ||
    assassinSetup.assassins.length !== 2 ||
    new Set(assassinTargets).size !== 1 ||
    !assassinTargets.every((targetFid) => targetFid === assassinSetup.focusTargetFid) ||
    !assassinTargets.every((targetFid) => assassinSetup.backlineFids.includes(targetFid))
  ) {
    throw new Error(`Unexpected assassin targeting: ${JSON.stringify(assassinSetup)}`);
  }
  await page.evaluate(() => window.advanceTime(260));
  const assassinTextState = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  const assassinScreenshot = await capture(page, "assassin-backline-focus.png");
  if (
    assassinTextState.phase !== "battle" ||
    assassinTextState.battle.playerUnits.filter((fighter) => fighter.jumping).length < 2
  ) {
    throw new Error(`Assassin jump missing from text state: ${JSON.stringify(assassinTextState.battle)}`);
  }

  const canvas = page.locator('[data-game-canvas="rift-line"]');
  const canvasBox = await canvas.boundingBox();
  const canvasMeta = await canvas.evaluate((element) => ({
    width: element.width,
    height: element.height,
    logicalWidth: element.dataset.logicalWidth,
    logicalHeight: element.dataset.logicalHeight,
  }));
  if (!canvasBox || canvasBox.width < 1000 || canvasBox.height < 500) {
    throw new Error(`Game canvas size is invalid: ${JSON.stringify(canvasBox)}`);
  }
  const unexpectedErrors = errors.filter((error) => !error.includes("/api/record"));
  const unexpectedResponses = failedResponses.filter(
    (response) => !response.url.endsWith("/api/record"),
  );
  if (unexpectedErrors.length || unexpectedResponses.length) {
    throw new Error(`Chrome errors: ${JSON.stringify({ unexpectedErrors, unexpectedResponses })}`);
  }

  console.log(JSON.stringify({
    castSetup,
    castText: {
      chronospheres: castTextState.battle.visualEffects.chronospheres,
      motions: castTextState.battle.playerUnits
        .filter((fighter) => fighter.motion)
        .map((fighter) => ({ unitId: fighter.unitId, motion: fighter.motion })),
    },
    assassinSetup,
    assassinText: assassinTextState.battle.playerUnits
      .filter((fighter) => fighter.jumping)
      .map((fighter) => ({
        unitId: fighter.unitId,
        x: fighter.x,
        y: fighter.y,
        jumpFromX: fighter.jumpFromX,
        jumpFromY: fighter.jumpFromY,
        jumpToX: fighter.jumpToX,
        jumpToY: fighter.jumpToY,
      })),
    screenshots: [castScreenshot, impactScreenshot, assassinScreenshot],
    canvasBox,
    canvasMeta,
    errors,
    failedResponses,
  }, null, 2));
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
