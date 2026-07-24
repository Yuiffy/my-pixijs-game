const { createRequire } = require("node:module");
const { existsSync, mkdirSync } = require("node:fs");
const { inflateSync } = require("node:zlib");

const localRequire = createRequire(__filename);
const playwrightCandidates = [
  process.env.PLAYWRIGHT_MODULE,
  "playwright",
  "C:/Users/apple/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright",
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
  if (buffer.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error("Screenshot is not a PNG");
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
      if (chunk[8] !== 8 || chunk[12] !== 0 || !channels) throw new Error("Unsupported PNG encoding");
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
    for (let index = 0; index < stride; index += 1) {
      const left = index >= channels ? row[index - channels] : 0;
      const up = previous[index];
      const upperLeft = index >= channels ? previous[index - channels] : 0;
      if (filter === 1) row[index] = (row[index] + left) & 255;
      else if (filter === 2) row[index] = (row[index] + up) & 255;
      else if (filter === 3) row[index] = (row[index] + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) {
        const prediction = left + up - upperLeft;
        const leftDistance = Math.abs(prediction - left);
        const upDistance = Math.abs(prediction - up);
        const upperLeftDistance = Math.abs(prediction - upperLeft);
        const nearest = leftDistance <= upDistance && leftDistance <= upperLeftDistance
          ? left
          : upDistance <= upperLeftDistance ? up : upperLeft;
        row[index] = (row[index] + nearest) & 255;
      } else if (filter !== 0) throw new Error(`Unsupported PNG filter ${filter}`);
    }
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
const artifactDirectory = ".tmp/autochess";
mkdirSync(artifactDirectory, { recursive: true });

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  const resourceErrors = [];
  const screenshots = {};
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().startsWith("Failed to load resource:")) {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (resourceResponse) => {
    if (resourceResponse.status() >= 400) {
      resourceErrors.push({ status: resourceResponse.status(), url: resourceResponse.url() });
    }
  });

  const readState = async () => JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  const advance = async (milliseconds) => page.evaluate((value) => window.advanceTime(value), milliseconds);
  const capture = async (name) => {
    const path = `${artifactDirectory}/${name}.png`;
    const buffer = await page.screenshot({ path, fullPage: true });
    screenshots[name] = { path, bytes: buffer.length, ...inspectPng(buffer) };
  };

  const response = await page.goto(`${baseUrl}/game/autochess?seed=97`, { waitUntil: "domcontentloaded" });
  if (!response?.ok()) throw new Error(`Autochess URL returned ${response?.status()}`);
  const canvas = page.locator('[data-game-canvas="rift-line"]');
  await canvas.waitFor();
  await page.waitForFunction(() => typeof window.render_game_to_text === "function");
  const attached = await page.evaluate(() => {
    const gameCanvas = document.querySelector('[data-game-canvas="rift-line"]');
    const host = gameCanvas?.parentElement;
    const fiberKey = host && Object.keys(host).find((key) => key.startsWith("__reactFiber$"));
    let fiber = fiberKey ? host[fiberKey] : null;
    while (fiber) {
      let hook = fiber.memoizedState;
      while (hook) {
        const current = hook.memoizedState?.current;
        if (current?.engine?.state && typeof current.dispatch === "function") {
          window.__codexAutoChessBridge = current;
          return true;
        }
        hook = hook.next;
      }
      fiber = fiber.return;
    }
    return false;
  });
  if (!attached) throw new Error("Unable to locate the active EngineBridge");

  await page.evaluate(() => {
    const engine = window.__codexAutoChessBridge.engine;
    engine.startRun(engine.state.starterChoices[0]);
    engine.state.playerLevel = 4;
    engine.state.board.fill(null);
    engine.state.board[0] = { uid: 971, id: "zeyin", star: 1 };
    engine.startBattle();
    const battle = engine.state.battle;
    const zeyin = battle.player.find((fighter) => fighter.unitId === "zeyin");
    battle.enemy.forEach((fighter, index) => {
      fighter.hp = fighter.maxHp = 99_999;
      fighter.attack = 0;
      fighter.armor = 0;
      fighter.moveSpeed = 0;
      fighter.cooldown = 99;
      fighter.stun = 999;
      fighter.x = 400 + index * 90;
      fighter.y = 360 + index * 55;
    });
    zeyin.x = 280;
    zeyin.y = 360;
    zeyin.cooldown = 99;
    engine.damage(battle.enemy[0], zeyin, 99_999);
  });
  await advance(180);
  const rebirthState = await readState();
  const reborn = rebirthState.battle.playerUnits.find((unit) => unit.unitId === "zeyin");
  const rebirthEffect = rebirthState.battle.visualEffects.effects.find((effect) => effect.kind === "rebirth");
  if (!reborn?.reborn || reborn.rebirthRecoilTime <= 3.7 || !rebirthEffect) {
    throw new Error(`涅槃状态或特效缺失: ${JSON.stringify({ reborn, rebirthEffect })}`);
  }
  await capture("zeyin-rebirth-effect");
  await advance(1000);

  const recoilOrigin = await page.evaluate(() => {
    const engine = window.__codexAutoChessBridge.engine;
    const battle = engine.state.battle;
    const zeyin = battle.player.find((fighter) => fighter.unitId === "zeyin");
    const target = battle.enemy[0];
    zeyin.x = 280;
    zeyin.y = 360;
    zeyin.cooldown = 0;
    zeyin.abilityMotion = null;
    target.x = 400;
    target.y = 360;
    engine.basicAttack(zeyin, target);
    return { x: zeyin.x, y: zeyin.y, targetX: target.x, targetY: target.y };
  });
  await advance(70);
  const recoilState = await readState();
  const recoiling = recoilState.battle.playerUnits.find((unit) => unit.unitId === "zeyin");
  if (recoiling?.motion?.kind !== "push" || recoiling.motion.abilityId !== null) {
    throw new Error(`后坐力运动状态缺失: ${JSON.stringify(recoiling)}`);
  }
  const currentDistance = Math.hypot(recoiling.x - recoilOrigin.targetX, recoiling.y - recoilOrigin.targetY);
  const originDistance = Math.hypot(recoilOrigin.x - recoilOrigin.targetX, recoilOrigin.y - recoilOrigin.targetY);
  const landingDistance = Math.hypot(
    recoiling.motion.to.x - recoilOrigin.targetX,
    recoiling.motion.to.y - recoilOrigin.targetY,
  );
  if (currentDistance <= originDistance || landingDistance > recoiling.range - 3.9) {
    throw new Error(`后坐力方向或射程保护异常: ${JSON.stringify({ recoilOrigin, recoiling })}`);
  }
  await capture("zeyin-rebirth-recoil");

  await advance(200);
  const edgeMotion = await page.evaluate(() => {
    const engine = window.__codexAutoChessBridge.engine;
    const battle = engine.state.battle;
    const zeyin = battle.player.find((fighter) => fighter.unitId === "zeyin");
    const target = battle.enemy[0];
    zeyin.x = 300;
    zeyin.y = 360;
    zeyin.cooldown = 0;
    zeyin.abilityMotion = null;
    zeyin.rebirthRecoilTime = 4;
    target.x = 543;
    target.y = 360;
    engine.basicAttack(zeyin, target);
    return zeyin.abilityMotion;
  });
  if (edgeMotion !== null) throw new Error(`射程边缘仍触发了后坐力: ${JSON.stringify(edgeMotion)}`);

  const expiredMotion = await page.evaluate(() => {
    const engine = window.__codexAutoChessBridge.engine;
    const battle = engine.state.battle;
    const zeyin = battle.player.find((fighter) => fighter.unitId === "zeyin");
    const target = battle.enemy[0];
    zeyin.x = 300;
    target.x = 400;
    zeyin.cooldown = 0;
    zeyin.abilityMotion = null;
    zeyin.rebirthRecoilTime = 0;
    engine.basicAttack(zeyin, target);
    return zeyin.abilityMotion;
  });
  if (expiredMotion !== null) throw new Error(`撤离窗口结束后仍触发了后坐力: ${JSON.stringify(expiredMotion)}`);

  const canvasBox = await canvas.boundingBox();
  const canvasMeta = await canvas.evaluate((element) => ({
    width: element.width,
    height: element.height,
    logicalWidth: element.dataset.logicalWidth,
    logicalHeight: element.dataset.logicalHeight,
    renderScale: element.dataset.renderScale,
  }));
  if (!canvasBox || canvasBox.width < 1000 || canvasBox.height < 500) {
    throw new Error(`游戏画布尺寸异常: ${JSON.stringify(canvasBox)}`);
  }
  if (errors.length) throw new Error(`浏览器控制台出现错误: ${JSON.stringify(errors)}`);
  const unexpectedResourceErrors = resourceErrors.filter(({ url }) => !url.includes("/images/livers/"));
  if (unexpectedResourceErrors.length) {
    throw new Error(`页面资源请求失败: ${JSON.stringify(unexpectedResourceErrors)}`);
  }

  console.log(JSON.stringify({
    rebirth: {
      fighter: reborn,
      effect: rebirthEffect,
    },
    recoil: {
      origin: recoilOrigin,
      fighter: recoiling,
      originDistance,
      currentDistance,
      landingDistance,
    },
    rangeEdgeMotion: edgeMotion,
    expiredMotion,
    screenshots,
    canvasBox,
    canvasMeta,
    errors,
    resourceErrors,
  }, null, 2));
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
