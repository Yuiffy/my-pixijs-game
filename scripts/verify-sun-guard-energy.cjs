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
      // Try the next local Playwright installation.
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
      if (colors.size < 2048) colors.add(`${red},${green},${blue},${alpha}`);
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
const artifactDirectory = ".tmp/autochess";
mkdirSync(artifactDirectory, { recursive: true });

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
    if (response.status() >= 400) failedResponses.push({ status: response.status(), url: response.url() });
  });

  const baseUrl = process.env.AUTOCHESS_BASE_URL || "http://127.0.0.1:3100";
  const readState = async () => JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  const advance = async (milliseconds) => page.evaluate((value) => window.advanceTime(value), milliseconds);
  const screenshots = {};
  const capture = async (name) => {
    const buffer = await page.screenshot({ path: `${artifactDirectory}/${name}.png`, fullPage: true });
    screenshots[name] = inspectPng(buffer);
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

  let seed = 0;
  for (let candidate = 1; candidate <= 40; candidate += 1) {
    const response = await page.goto(`${baseUrl}/game/autochess?seed=${candidate}`, { waitUntil: "domcontentloaded" });
    if (!response?.ok()) throw new Error(`Autocess URL returned ${response?.status()}`);
    await page.locator('[data-game-canvas="rift-line"]').waitFor();
    if (await page.locator(".rift-dom-choice").filter({ hasText: "持久抗压" }).count()) {
      seed = candidate;
      break;
    }
  }
  if (!seed) throw new Error("No starter offer contained 持久抗压");

  await page.locator(".rift-dom-choice").filter({ hasText: "持久抗压" }).click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === "preparation");

  await page.getByRole("button", { name: "图鉴 / 本局天赋" }).click();
  const dialog = page.getByRole("dialog", { name: "裂隙阵线图鉴" });
  await dialog.getByRole("button", { name: "棋子", exact: true }).click();
  await dialog.getByRole("button", { name: /果冻风纪/ }).click();
  const codexText = await dialog.innerText();
  const expectedRecovery = "能量 · 稳态回能：初始 25/100；自动回能（12.5 秒回满，每秒 +8）；攻击回能（每下 +6）；受击回能（每下 +3）";
  if (!codexText.includes(expectedRecovery)) throw new Error(`Codex recovery text mismatch: ${codexText}`);
  for (const expected of ["满区逃生", "停止攻击和回能", "锁定最安全方向逃跑", "20% 闪避", "总回复 25%"]) {
    if (!codexText.includes(expected)) {
      throw new Error(`Codex ability description is missing ${expected}: ${codexText}`);
    }
  }
  await capture("sun-guard-energy-codex");
  await dialog.getByRole("button", { name: "关闭 Esc" }).click();

  await page.locator("button.rift-start-button").click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === "battle");
  if (!await attachBridge()) throw new Error("Unable to locate the active EngineBridge through the React host");
  const startState = await readState();
  const startGuard = startState.battle.playerUnits.find((unit) => unit.unitId === "sun_guard");
  if (!startGuard) throw new Error("Sun guard did not enter battle");
  await advance(1000);
  const automaticState = await readState();
  const automaticGuard = automaticState.battle.playerUnits.find((unit) => unit.unitId === "sun_guard");
  const automaticGain = automaticGuard?.energy - startGuard.energy;
  if (!automaticGuard || automaticGain < 7 || automaticGain > 9) {
    throw new Error(`Automatic recovery mismatch: ${JSON.stringify({ startGuard, automaticGuard })}`);
  }
  if (automaticGuard.energyPerSecond !== 8 || automaticGuard.energyOnHit !== 3 || automaticGuard.energyOnAttack !== 6) {
    throw new Error(`Battle energy profile mismatch: ${JSON.stringify(automaticGuard)}`);
  }
  await capture("sun-guard-auto-energy");

  const beforeTransform = await page.evaluate(() => {
    const battle = window.__codexAutoChessBridge.engine.state.battle;
    const source = battle.player.find((fighter) => fighter.unitId === "sun_guard");
    source.x = 500;
    source.y = 360;
    source.hp = source.maxHp - 100;
    source.energy = source.maxEnergy;
    source.hitPulse = 0.2;
    source.cooldown = 0;
    source.manquTime = 0;
    source.manquEscapeX = 0;
    source.manquEscapeY = 0;
    battle.enemy.forEach((fighter, index) => {
      fighter.x = index === 0 ? 560 : 1000;
      fighter.y = index === 0 ? 360 : 600;
      fighter.attack = 0;
      fighter.cooldown = 99;
      fighter.baseMoveSpeed = 0;
      fighter.moveSpeed = 0;
      fighter.hp = fighter.maxHp = 99_999;
    });
    return {
      hp: source.hp,
      maxHp: source.maxHp,
      energy: source.energy,
      x: source.x,
      y: source.y,
      targetX: battle.enemy[0].x,
      targetY: battle.enemy[0].y,
    };
  });
  await advance(50);
  const castState = await readState();
  const castGuard = castState.battle.playerUnits.find((unit) => unit.unitId === "sun_guard");
  if (!castGuard || castGuard.manquTime < 1.2 || castGuard.energy !== 0 || castGuard.shield !== 0) {
    throw new Error(`Manqu cast state mismatch: ${JSON.stringify({ beforeTransform, castGuard })}`);
  }
  await capture("sun-guard-manqu-cast");

  await advance(500);
  const manquState = await readState();
  const manquGuard = manquState.battle.playerUnits.find((unit) => unit.unitId === "sun_guard");
  const manquRuntime = await page.evaluate(() => {
    const battle = window.__codexAutoChessBridge.engine.state.battle;
    const source = battle.player.find((fighter) => fighter.unitId === "sun_guard");
    const target = battle.enemy[0];
    return {
      manquTime: source.manquTime,
      hp: source.hp,
      energy: source.energy,
      x: source.x,
      y: source.y,
      distance: Math.hypot(source.x - target.x, source.y - target.y),
      moveSpeed: source.moveSpeed,
      shield: source.shield,
      projectiles: battle.projectiles.length,
      projectileVolley: battle.projectileVolley.length,
      effects: battle.effects.map((effect) => effect.text).filter(Boolean),
    };
  });
  const initialDistance = Math.hypot(
    beforeTransform.x - beforeTransform.targetX,
    beforeTransform.y - beforeTransform.targetY,
  );
  const minimumMidHp = beforeTransform.hp + beforeTransform.maxHp * 0.12;
  const maximumMidHp = beforeTransform.hp + beforeTransform.maxHp * 0.16;
  if (
    !manquGuard ||
    manquRuntime.manquTime <= 0 ||
    manquRuntime.distance <= initialDistance + 50 ||
    manquRuntime.hp < minimumMidHp ||
    manquRuntime.hp > maximumMidHp ||
    manquRuntime.energy !== 0 ||
    manquRuntime.moveSpeed !== 149 ||
    manquRuntime.shield !== 0 ||
    manquRuntime.projectiles !== 0 ||
    manquRuntime.projectileVolley !== 0
  ) {
    throw new Error(`Manqu active state mismatch: ${JSON.stringify({ beforeTransform, manquGuard, manquRuntime })}`);
  }
  await capture("sun-guard-manqu-active");

  await advance(750);
  const endedState = await readState();
  const endedGuard = endedState.battle.playerUnits.find((unit) => unit.unitId === "sun_guard");
  const expectedEndedHp = beforeTransform.hp + beforeTransform.maxHp * 0.25;
  if (
    !endedGuard ||
    endedGuard.manquTime !== 0 ||
    Math.abs(endedGuard.hp - expectedEndedHp) > 0.5
  ) {
    throw new Error(`Manqu did not end on schedule: ${JSON.stringify(endedGuard)}`);
  }
  await capture("sun-guard-manqu-ended");

  const surroundedStart = await page.evaluate(() => {
    const engine = window.__codexAutoChessBridge.engine;
    const battle = engine.state.battle;
    const source = battle.player.find((fighter) => fighter.unitId === "sun_guard");
    const template = battle.enemy[0];
    const left = { ...template, fid: "browser-manqu-left", x: 400, y: 360 };
    const right = { ...template, fid: "browser-manqu-right", x: 600, y: 360 };
    battle.enemy.splice(0, battle.enemy.length, left, right);
    battle.enemy.forEach((fighter) => {
      fighter.attack = 0;
      fighter.cooldown = 99;
      fighter.baseMoveSpeed = 0;
      fighter.moveSpeed = 0;
      fighter.stun = 99;
      fighter.hp = fighter.maxHp = 99_999;
    });
    const blocker = {
      ...source,
      fid: "browser-manqu-blocker",
      x: 900,
      y: 500,
      hp: source.maxHp,
      energy: 0,
      cooldown: 99,
      stun: 99,
      manquTime: 0,
      manquEscapeX: 0,
      manquEscapeY: 0,
      abilityMotion: null,
      raccoonStunnedAttackers: [],
      sekiChargeHitFids: [],
    };
    battle.player.splice(0, battle.player.length, source, blocker);
    source.x = 500;
    source.y = 360;
    source.hp = source.maxHp - 80;
    source.energy = source.maxEnergy;
    source.cooldown = 99;
    source.manquTime = 0;
    source.manquEscapeX = 0;
    source.manquEscapeY = 0;
    engine.castAbility(source, battle.enemy);
    return {
      source: { x: source.x, y: source.y },
      totalEnemyDistance: battle.enemy.reduce(
        (sum, enemy) => sum + Math.hypot(source.x - enemy.x, source.y - enemy.y),
        0,
      ),
    };
  });
  await advance(50);
  const surroundedLocked = await page.evaluate(() => {
    const battle = window.__codexAutoChessBridge.engine.state.battle;
    const source = battle.player.find((fighter) => fighter.fid !== "browser-manqu-blocker");
    const blocker = battle.player.find((fighter) => fighter.fid === "browser-manqu-blocker");
    const length = Math.hypot(source.manquEscapeX, source.manquEscapeY) || 1;
    blocker.x = source.x + (source.manquEscapeX / length) * 38;
    blocker.y = source.y + (source.manquEscapeY / length) * 38;
    return {
      direction: { x: source.manquEscapeX, y: source.manquEscapeY },
      blocker: { x: blocker.x, y: blocker.y },
    };
  });
  await capture("sun-guard-manqu-surrounded-start");
  await advance(450);
  const surroundedEnd = await page.evaluate(() => {
    const battle = window.__codexAutoChessBridge.engine.state.battle;
    const source = battle.player.find((fighter) => fighter.fid !== "browser-manqu-blocker");
    const blocker = battle.player.find((fighter) => fighter.fid === "browser-manqu-blocker");
    return {
      source: {
        x: source.x,
        y: source.y,
        direction: { x: source.manquEscapeX, y: source.manquEscapeY },
      },
      blocker: { x: blocker.x, y: blocker.y },
      totalEnemyDistance: battle.enemy.reduce(
        (sum, enemy) => sum + Math.hypot(source.x - enemy.x, source.y - enemy.y),
        0,
      ),
    };
  });
  const sourceTravel = Math.hypot(
    surroundedEnd.source.x - surroundedStart.source.x,
    surroundedEnd.source.y - surroundedStart.source.y,
  );
  const blockerTravel = Math.hypot(
    surroundedEnd.blocker.x - surroundedLocked.blocker.x,
    surroundedEnd.blocker.y - surroundedLocked.blocker.y,
  );
  if (
    Math.abs(surroundedLocked.direction.y) < 0.9 ||
    Math.abs(surroundedEnd.source.direction.x - surroundedLocked.direction.x) > 0.001 ||
    Math.abs(surroundedEnd.source.direction.y - surroundedLocked.direction.y) > 0.001 ||
    sourceTravel < 60 ||
    blockerTravel < 25 ||
    surroundedEnd.totalEnemyDistance <= surroundedStart.totalEnemyDistance + 35
  ) {
    throw new Error(`Surrounded Manqu escape mismatch: ${JSON.stringify({
      surroundedStart,
      surroundedLocked,
      surroundedEnd,
      sourceTravel,
      blockerTravel,
    })}`);
  }
  await capture("sun-guard-manqu-surrounded-end");

  if (errors.length) throw new Error(`Browser errors: ${JSON.stringify(errors)}`);
  if (failedResponses.length) throw new Error(`Failed responses: ${JSON.stringify(failedResponses)}`);
  console.log(JSON.stringify({
    seed,
    automaticRecovery: {
      before: startGuard.energy,
      afterOneSecond: automaticGuard.energy,
      perSecond: automaticGuard.energyPerSecond,
      onHit: automaticGuard.energyOnHit,
    },
    transform: {
      before: beforeTransform,
      cast: castGuard,
      active: manquRuntime,
      ended: endedGuard,
      surrounded: {
        start: surroundedStart,
        locked: surroundedLocked,
        end: surroundedEnd,
        sourceTravel,
        blockerTravel,
      },
    },
    screenshots,
    canvas: await page.locator('[data-game-canvas="rift-line"]').evaluate((canvas) => ({
      width: canvas.width,
      height: canvas.height,
      logicalWidth: canvas.dataset.logicalWidth,
      logicalHeight: canvas.dataset.logicalHeight,
    })),
    errors,
    failedResponses,
  }, null, 2));
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
