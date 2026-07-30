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
    battle.enemy[0].targetFid = zeyin.fid;
    battle.enemy[0].targetLock = 2;
  });
  await advance(2500);
  const chargeState = await readState();
  const charging = chargeState.battle.playerUnits.find((unit) => unit.unitId === "zeyin");
  if (charging?.reborn || charging.energy < 49 || charging.energy > 51) {
    throw new Error(`涅槃积蓄进度异常: ${JSON.stringify(charging)}`);
  }
  await capture("zeyin-rebirth-charge");
  await page.evaluate(() => {
    const engine = window.__codexAutoChessBridge.engine;
    const battle = engine.state.battle;
    const zeyin = battle.player.find((fighter) => fighter.unitId === "zeyin");
    if (zeyin.reborn) throw new Error("能量专项设置前泽音已经涅槃");
    zeyin.energy = 98;
    zeyin.stun = 0.05;
    zeyin.slowTime = 1;
    zeyin.slowMultiplier = 0.6;
    zeyin.burnTime = 1;
    zeyin.burnDps = 5;
    zeyin.weakenTime = 1;
    zeyin.weakenArmorPenalty = 9;
    zeyin.armor -= 9;
  });
  await advance(150);
  const rebirthState = await readState();
  const reborn = rebirthState.battle.playerUnits.find((unit) => unit.unitId === "zeyin");
  const rebirthEffect = rebirthState.battle.visualEffects.effects.find((effect) => effect.kind === "rebirth");
  if (
    !reborn?.reborn ||
    reborn.maxHp !== 200 ||
    reborn.energy > 10 ||
    reborn.rebirthRecoilTime <= 3.4 ||
    reborn.stun > 0 ||
    reborn.slowTime > 0 ||
    reborn.burnTime > 0 ||
    reborn.weakenTime > 0 ||
    !rebirthEffect
  ) {
    throw new Error(`涅槃状态或特效缺失: ${JSON.stringify({ reborn, rebirthEffect })}`);
  }
  const normalHit = await page.evaluate(() => {
    const engine = window.__codexAutoChessBridge.engine;
    const battle = engine.state.battle;
    const zeyin = battle.player.find((fighter) => fighter.unitId === "zeyin");
    const attacker = battle.enemy[0];
    const hpBefore = zeyin.hp;
    const dealt = engine.damage(attacker, zeyin, 20);
    return {
      dealt,
      hpBefore,
      hpAfter: zeyin.hp,
      attackerTargetFid: attacker.targetFid,
    };
  });
  if (
    normalHit.dealt <= 0 ||
    normalHit.hpAfter >= normalHit.hpBefore ||
    normalHit.attackerTargetFid !== reborn.fid
  ) {
    throw new Error(`二阶段仍存在免伤或降仇恨: ${JSON.stringify(normalHit)}`);
  }
  await capture("zeyin-rebirth-effect");
  await advance(1200);

  const fireballSetup = await page.evaluate(() => {
    const engine = window.__codexAutoChessBridge.engine;
    const battle = engine.state.battle;
    const zeyin = battle.player.find((fighter) => fighter.unitId === "zeyin");
    const target = battle.enemy[0];
    zeyin.x = 280;
    zeyin.y = 360;
    zeyin.energy = 99;
    zeyin.cooldown = 99;
    zeyin.abilityMotion = null;
    target.x = 520;
    target.y = 360;
    target.hp = target.maxHp = 99_999;
    target.armor = 0;
    target.burnTime = 0;
    battle.enemy.slice(1).forEach((fighter, index) => {
      fighter.x = 850 + index * 80;
      fighter.y = 500;
    });
    return { zeyinFid: zeyin.fid, targetFid: target.fid, targetHp: target.hp };
  });
  await advance(100);
  const fireballFlight = await page.evaluate(({ zeyinFid }) => {
    const engine = window.__codexAutoChessBridge.engine;
    const battle = engine.state.battle;
    const projectile = battle.projectiles.find(
      (item) => item.sourceFid === zeyinFid && item.style === "fireball",
    );
    const zeyin = battle.player.find((fighter) => fighter.fid === zeyinFid);
    return {
      projectile: projectile ? {
        x: projectile.x,
        y: projectile.y,
        damage: projectile.damage,
        burnPower: projectile.burnPower,
        emoji: projectile.emoji,
        style: projectile.style,
      } : null,
      energy: zeyin.energy,
    };
  }, fireballSetup);
  const fireballTextState = await readState();
  if (
    !fireballFlight.projectile ||
    fireballFlight.projectile.emoji !== "🔥" ||
    fireballFlight.projectile.burnPower <= 0 ||
    fireballFlight.energy > 3 ||
    !fireballTextState.battle.visualEffects.projectiles.some(
      (projectile) => projectile.style === "fireball" && projectile.emoji === "🔥",
    )
  ) {
    throw new Error(`涅槃火球飞行状态异常: ${JSON.stringify({ fireballFlight, fireballTextState })}`);
  }
  await capture("zeyin-fireball-flight");
  await advance(500);
  const fireballImpact = await page.evaluate(({ targetFid, targetHp }) => {
    const engine = window.__codexAutoChessBridge.engine;
    const target = engine.state.battle.enemy.find((fighter) => fighter.fid === targetFid);
    return {
      hpBefore: targetHp,
      hpAfter: target.hp,
      burnTime: target.burnTime,
      burnDps: target.burnDps,
    };
  }, fireballSetup);
  if (
    fireballImpact.hpAfter >= fireballImpact.hpBefore ||
    fireballImpact.burnTime <= 2 ||
    fireballImpact.burnDps <= 0
  ) {
    throw new Error(`涅槃火球命中或灼烧异常: ${JSON.stringify(fireballImpact)}`);
  }
  await capture("zeyin-fireball-impact");
  await advance(500);

  const recoilOrigin = await page.evaluate(() => {
    const engine = window.__codexAutoChessBridge.engine;
    const battle = engine.state.battle;
    const zeyin = battle.player.find((fighter) => fighter.unitId === "zeyin");
    const target = battle.enemy[0];
    zeyin.x = 280;
    zeyin.y = 360;
    zeyin.cooldown = 0;
    zeyin.abilityMotion = null;
    zeyin.rebirthRecoilTime = 4;
    target.x = 400;
    target.y = 360;
    const blocker = {
      ...zeyin,
      fid: "browser-zeyin-recoil-blocker",
      unitId: "sun_guard",
      x: 252,
      y: 360,
      hp: zeyin.maxHp,
      cooldown: 99,
      stun: 99,
      rebirthRecoilTime: 0,
      abilityMotion: null,
      raccoonStunnedAttackers: [],
      sekiChargeHitFids: [],
    };
    battle.player.splice(0, battle.player.length, zeyin, blocker);
    engine.basicAttack(zeyin, target);
    return {
      x: zeyin.x,
      y: zeyin.y,
      targetX: target.x,
      targetY: target.y,
      blocker: { x: blocker.x, y: blocker.y },
    };
  });
  await advance(70);
  const recoilState = await readState();
  const recoiling = recoilState.battle.playerUnits.find((unit) => unit.unitId === "zeyin");
  const recoilBlocker = recoilState.battle.playerUnits.find(
    (unit) => unit.fid === "browser-zeyin-recoil-blocker",
  );
  if (recoiling?.motion?.kind !== "push" || recoiling.motion.abilityId !== null) {
    throw new Error(`后坐力运动状态缺失: ${JSON.stringify(recoiling)}`);
  }
  const currentDistance = Math.hypot(recoiling.x - recoilOrigin.targetX, recoiling.y - recoilOrigin.targetY);
  const originDistance = Math.hypot(recoilOrigin.x - recoilOrigin.targetX, recoilOrigin.y - recoilOrigin.targetY);
  const landingDistance = Math.hypot(
    recoiling.motion.to.x - recoilOrigin.targetX,
    recoiling.motion.to.y - recoilOrigin.targetY,
  );
  const blockerDistance = recoilBlocker
    ? Math.hypot(recoilBlocker.x - recoilOrigin.blocker.x, recoilBlocker.y - recoilOrigin.blocker.y)
    : 0;
  if (
    currentDistance <= originDistance ||
    landingDistance > recoiling.range - 3.9 ||
    blockerDistance <= 10
  ) {
    throw new Error(`后坐力方向、推挤或射程保护异常: ${JSON.stringify({
      recoilOrigin,
      recoiling,
      recoilBlocker,
      blockerDistance,
    })}`);
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
  const unexpectedResourceErrors = resourceErrors.filter(
    ({ url }) => !url.includes("/images/livers/") && !url.endsWith("/api/record"),
  );
  if (unexpectedResourceErrors.length) {
    throw new Error(`页面资源请求失败: ${JSON.stringify(unexpectedResourceErrors)}`);
  }

  console.log(JSON.stringify({
    rebirth: {
      charging,
      fighter: reborn,
      effect: rebirthEffect,
      normalHit,
    },
    fireball: {
      setup: fireballSetup,
      flight: fireballFlight,
      impact: fireballImpact,
    },
    recoil: {
      origin: recoilOrigin,
      fighter: recoiling,
      originDistance,
      currentDistance,
      landingDistance,
      blocker: recoilBlocker,
      blockerDistance,
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
