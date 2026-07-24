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
      if (chunk[8] !== 8 || chunk[12] !== 0) throw new Error("Unsupported PNG encoding");
      channels = chunk[9] === 6 ? 4 : chunk[9] === 2 ? 3 : 0;
      if (!channels) throw new Error(`Unsupported PNG color type ${chunk[9]}`);
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
const artifactDirectory = ".tmp/autochess/pako-joi-heals";
mkdirSync(artifactDirectory, { recursive: true });

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  const screenshots = {};
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  const readState = async () => JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  const advance = async (milliseconds) => page.evaluate((value) => window.advanceTime(value), milliseconds);
  const capture = async (name) => {
    const path = `${artifactDirectory}/${name}.png`;
    const buffer = await page.screenshot({ path, fullPage: true });
    screenshots[name] = { path, bytes: buffer.length, ...inspectPng(buffer) };
  };
  const attachBridge = async () => page.evaluate(() => {
    const canvas = document.querySelector('[data-game-canvas="rift-line"]');
    const host = canvas?.parentElement;
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
  const loadGame = async (seed) => {
    const response = await page.goto(`${baseUrl}/game/autochess?seed=${seed}`, { waitUntil: "domcontentloaded" });
    if (!response?.ok()) throw new Error(`Autochess URL returned ${response?.status()}`);
    await page.locator('[data-game-canvas="rift-line"]').waitFor();
    await page.waitForFunction(() => typeof window.render_game_to_text === "function");
    if (!await attachBridge()) throw new Error("Unable to locate the active EngineBridge through the React host");
  };

  await loadGame(201);
  const pakoBefore = await page.evaluate(() => {
    const engine = window.__codexAutoChessBridge.engine;
    engine.startRun(engine.state.starterChoices[0]);
    engine.state.playerLevel = 4;
    engine.state.board.fill(null);
    engine.state.board[0] = { uid: 901, id: "pako", star: 1 };
    engine.state.board[1] = { uid: 902, id: "cog_scribe", star: 1 };
    engine.state.board[2] = { uid: 903, id: "mossback", star: 1 };
    engine.startBattle();
    const battle = engine.state.battle;
    const pako = battle.player.find((fighter) => fighter.unitId === "pako");
    const joi = battle.player.find((fighter) => fighter.unitId === "cog_scribe");
    const mossback = battle.player.find((fighter) => fighter.unitId === "mossback");
    pako.x = 300;
    pako.y = 350;
    joi.x = 650;
    joi.y = 340;
    mossback.x = 710;
    mossback.y = 370;
    joi.hp = joi.maxHp * 0.35;
    mossback.hp = mossback.maxHp * 0.5;
    battle.enemy.forEach((fighter) => {
      fighter.attack = 0;
      fighter.cooldown = 99;
      fighter.hp = fighter.maxHp = 99_999;
    });
    const before = {
      joiHp: joi.hp,
      mossbackHp: mossback.hp,
      enemyHp: battle.enemy.map((fighter) => fighter.hp),
    };
    engine.castAbility(pako, battle.enemy);
    return before;
  });
  await advance(120);
  const pakoFlight = await readState();
  if (!pakoFlight.battle.visualEffects.projectiles.some((projectile) => projectile.ability === "pako")) {
    throw new Error(`帕可治疗弹飞行帧缺失: ${JSON.stringify(pakoFlight.battle.visualEffects.projectiles)}`);
  }
  await capture("pako-angel-fish-flight");

  await advance(520);
  const pakoImpact = await readState();
  const pakoUnit = pakoImpact.battle.playerUnits.find((unit) => unit.unitId === "pako");
  const joiAfterPako = pakoImpact.battle.playerUnits.find((unit) => unit.unitId === "cog_scribe");
  const mossbackAfterPako = pakoImpact.battle.playerUnits.find((unit) => unit.unitId === "mossback");
  if (
    joiAfterPako.hp <= pakoBefore.joiHp
    || mossbackAfterPako.hp <= pakoBefore.mossbackHp
    || pakoUnit.healingDone <= 0
  ) throw new Error(`帕可范围治疗未结算: ${JSON.stringify({ pakoBefore, pakoUnit, joiAfterPako, mossbackAfterPako })}`);
  if (!pakoImpact.battle.visualEffects.effects.some((effect) => effect.kind === "ring" && effect.size === 159)) {
    throw new Error(`帕可范围治疗落地圈缺失: ${JSON.stringify(pakoImpact.battle.visualEffects.effects)}`);
  }
  if (!pakoImpact.battle.visualEffects.healingZones.some((zone) => zone.radius === 145)) {
    throw new Error(`帕可持续治疗区缺失: ${JSON.stringify(pakoImpact.battle.visualEffects.healingZones)}`);
  }
  if (JSON.stringify(pakoImpact.battle.enemyUnits.map((unit) => unit.hp)) !== JSON.stringify(pakoBefore.enemyHp)) {
    throw new Error("帕可治疗技能不应伤害敌人");
  }
  await capture("pako-angel-fish-impact");

  await advance(1250);
  const pakoSustain = await readState();
  const pakoSustainUnit = pakoSustain.battle.playerUnits.find((unit) => unit.unitId === "pako");
  if (
    pakoSustainUnit.healingDone <= pakoUnit.healingDone
    || !pakoSustain.battle.visualEffects.healingZones.some((zone) => zone.remaining > 0)
  ) {
    throw new Error(`帕可治疗区未持续脉冲: ${JSON.stringify({
      impactHealing: pakoUnit.healingDone,
      sustainUnit: pakoSustainUnit,
      zones: pakoSustain.battle.visualEffects.healingZones,
    })}`);
  }
  await capture("pako-angel-fish-sustain");

  await loadGame(202);
  await page.evaluate(() => {
    const engine = window.__codexAutoChessBridge.engine;
    engine.startRun(engine.state.starterChoices[0]);
    engine.state.playerLevel = 4;
    engine.state.board.fill(null);
    engine.state.board[0] = { uid: 911, id: "cog_scribe", star: 1 };
    engine.state.board[1] = { uid: 912, id: "mossback", star: 1 };
    engine.state.board[2] = { uid: 913, id: "pako", star: 1 };
    engine.startBattle();
    const battle = engine.state.battle;
    const joi = battle.player.find((fighter) => fighter.unitId === "cog_scribe");
    const mossback = battle.player.find((fighter) => fighter.unitId === "mossback");
    const pako = battle.player.find((fighter) => fighter.unitId === "pako");
    joi.x = 300;
    joi.y = 350;
    mossback.x = 650;
    mossback.y = 340;
    pako.x = 710;
    pako.y = 370;
    mossback.maxHp = 1_000;
    mossback.hp = 100;
    pako.hp = pako.maxHp;
    battle.enemy.forEach((fighter) => {
      fighter.attack = 0;
      fighter.cooldown = 99;
      fighter.hp = fighter.maxHp = 99_999;
    });
    engine.castAbility(joi, battle.enemy);
  });
  await advance(300);
  const joiVolley = await readState();
  const orangeProjectiles = joiVolley.battle.visualEffects.projectiles.filter(
    (projectile) => projectile.ability === "cog_scribe",
  );
  if (orangeProjectiles.length < 2) {
    throw new Error(`轴伊连投帧未同时显示多颗橘子: ${JSON.stringify(orangeProjectiles)}`);
  }
  await capture("joi-orange-volley");

  await advance(1250);
  const joiImpact = await readState();
  const joiUnit = joiImpact.battle.playerUnits.find((unit) => unit.unitId === "cog_scribe");
  const mossbackAfterJoi = joiImpact.battle.playerUnits.find((unit) => unit.unitId === "mossback");
  if (joiUnit.healingDone <= 0 || mossbackAfterJoi.hp <= 100) {
    throw new Error(`轴伊橘子治疗未结算: ${JSON.stringify({ joiUnit, mossbackAfterJoi })}`);
  }
  if (joiImpact.battle.visualEffects.projectiles.some((projectile) => projectile.ability === "cog_scribe")) {
    throw new Error("轴伊五颗橘子应已全部抵达");
  }
  await capture("joi-orange-impact");

  const canvas = page.locator('[data-game-canvas="rift-line"]');
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

  console.log(JSON.stringify({
    pako: {
      before: pakoBefore,
      flightElapsed: pakoFlight.battle.elapsed,
      flightProjectiles: pakoFlight.battle.visualEffects.projectiles,
      impactElapsed: pakoImpact.battle.elapsed,
      impactHealingDone: pakoUnit.healingDone,
      sustainElapsed: pakoSustain.battle.elapsed,
      sustainHealingDone: pakoSustainUnit.healingDone,
      healingZones: pakoSustain.battle.visualEffects.healingZones,
      joiHpAfter: joiAfterPako.hp,
      mossbackHpAfter: mossbackAfterPako.hp,
    },
    joi: {
      volleyElapsed: joiVolley.battle.elapsed,
      volleyProjectiles: orangeProjectiles,
      impactElapsed: joiImpact.battle.elapsed,
      healingDone: joiUnit.healingDone,
      mossbackHpAfter: mossbackAfterJoi.hp,
    },
    screenshots,
    canvasBox,
    canvasMeta,
    errors,
  }, null, 2));
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
