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
const artifactDirectory = ".tmp/autochess/character-reworks";
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
    window.__characterReworkBridge = bridge;
    window.__characterReworkEngine = bridge.engine;
  });
};

const enterPreparation = async (page, seed) => {
  await page.goto(`${baseUrl}/game/autochess?seed=${seed}`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.locator('[data-game-canvas="rift-line"]').waitFor();
  await page.waitForFunction(() => typeof window.render_game_to_text === "function");
  await page.locator(".rift-dom-choice").first().click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === "preparation");
  await attachEngine(page);
};

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
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
    const path = `${artifactDirectory}/${filename}`;
    const buffer = await page.screenshot({ path, fullPage: true });
    const result = { path, bytes: buffer.length, metrics: inspectPng(buffer) };
    screenshots.push(result);
    return result;
  };

  await page.goto(`${baseUrl}/game/autochess?seed=301`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.locator('[data-game-canvas="rift-line"]').waitFor();
  await page.getByRole("button", { name: "图鉴 / 本局天赋" }).click();
  const dialog = page.getByRole("dialog", { name: "裂隙阵线图鉴" });
  await dialog.waitFor();
  const codexUnits = await dialog.locator("section button").evaluateAll((buttons) =>
    buttons
      .filter((button) => button.querySelector("strong"))
      .map((button) => {
        const text = button.textContent || "";
        const cost = Number(text.match(/(\d) 费/)?.[1]);
        return { name: button.querySelector("strong")?.textContent?.trim(), cost };
      }),
  );
  assert.equal(codexUnits.length, 41);
  assert.deepEqual(
    codexUnits.map(({ cost }) => cost),
    [...codexUnits].map(({ cost }) => cost).sort((left, right) => left - right),
  );
  await dialog.getByRole("button").filter({ hasText: "七海大鲨鱼" }).click();
  const nanaDetails = await dialog.locator("aside").innerText();
  assert.match(nanaDetails, /5 费/);
  assert.match(nanaDetails, /技能距离 430/);
  assert.match(nanaDetails, /凿凿冲击/);
  assert.match(nanaDetails, /⛏️/);
  await capture("codex-cost-order-and-nana.png");

  await enterPreparation(page, 302);
  const nanaSetup = await page.evaluate(() => {
    const engine = window.__characterReworkEngine;
    engine.state.round = 17;
    engine.state.playerLevel = 5;
    engine.state.board.fill(null);
    engine.state.board[0] = { uid: 1, id: "grove_mender", star: 1 };
    engine.state.board[1] = { uid: 2, id: "biscuit_sui", star: 1 };
    engine.startBattle();
    const battle = engine.state.battle;
    const nana = battle.player.find((fighter) => fighter.unitId === "grove_mender");
    const biscuit = battle.player.find((fighter) => fighter.unitId === "biscuit_sui");
    nana.x = 250;
    nana.y = 360;
    biscuit.x = 120;
    biscuit.y = 560;
    [...battle.player, ...battle.enemy].forEach((fighter) => {
      fighter.attack = 0;
      fighter.cooldown = 99;
      fighter.energy = 0;
      fighter.hp = fighter.maxHp = 99_999;
      fighter.dodgeChance = 0;
    });
    battle.enemy.forEach((fighter, index) => {
      fighter.x = index === 0 ? 520 : index === 1 ? 640 : 860 + (index % 2) * 70;
      fighter.y = index < 2 ? 330 + index * 55 : 200 + (index % 4) * 110;
    });
    nana.cooldown = 0;
    nana.energy = nana.maxEnergy;
    engine.update(0.05);
    const target = battle.enemy.find((fighter) => fighter.fid === nana.abilityMotion?.targetFid);
    return {
      phase: engine.state.phase,
      abilityRange: 430,
      targetFid: target?.fid,
      targetDistance: target ? Math.hypot(target.x - 250, target.y - 360) : null,
      motion: nana.abilityMotion,
    };
  });
  assert.equal(nanaSetup.phase, "battle");
  assert.ok(nanaSetup.motion && nanaSetup.targetDistance <= nanaSetup.abilityRange + 30);
  await page.evaluate(() => window.advanceTime(260));
  await capture("nana-dash.png");
  await page.evaluate(() => window.advanceTime(520));
  const nanaCounter = await page.evaluate(() => {
    const engine = window.__characterReworkEngine;
    const battle = engine.state.battle;
    const nana = battle.player.find((fighter) => fighter.unitId === "grove_mender");
    const nearbyEnemies = battle.enemy
      .filter(
        (fighter) =>
          fighter.alive &&
          Math.hypot(fighter.x - nana.x, fighter.y - nana.y) <= 155 + fighter.radius,
      )
      .sort(
        (left, right) =>
          Math.hypot(left.x - nana.x, left.y - nana.y) -
          Math.hypot(right.x - nana.x, right.y - nana.y),
      )
      .slice(0, 2);
    const counterEnemy = nearbyEnemies[0];
    counterEnemy.x = nana.x + 140;
    counterEnemy.y = nana.y;
    battle.enemy
      .filter((enemy) => enemy !== counterEnemy)
      .forEach((enemy) => {
        enemy.y = 180;
      });
    engine.damage(counterEnemy, nana, 80);
    const pickaxe = battle.projectiles.find((projectile) => projectile.emoji === "⛏️");
    return {
      barrageActive: nana.barrageActive,
      energy: nana.energy,
      maxEnergy: nana.maxEnergy,
      armorBonus: nana.abilityArmorBonus,
      taunts: nearbyEnemies.map((enemy) => enemy.tauntedByFid),
      pickaxes: battle.projectiles.filter((projectile) => projectile.emoji === "⛏️").length,
      pickaxeSpeed: pickaxe ? Math.hypot(pickaxe.velocityX, pickaxe.velocityY) : null,
      baseRadius: nana.baseRadius,
      radius: nana.radius,
      attack: nana.attack,
    };
  });
  assert.equal(nanaCounter.barrageActive, true);
  assert.ok(nanaCounter.energy > 0 && nanaCounter.energy < nanaCounter.maxEnergy);
  assert.equal(nanaCounter.armorBonus, 42);
  assert.ok(nanaCounter.taunts.length >= 1 && nanaCounter.taunts.every((fid) => fid));
  assert.ok(nanaCounter.pickaxes >= 1);
  assert.equal(nanaCounter.pickaxeSpeed, 320);
  await page.evaluate(() => window.advanceTime(160));
  const pickaxeState = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  assert.ok(
    pickaxeState.battle.visualEffects.projectiles.some((projectile) => projectile.emoji === "⛏️"),
  );
  await capture("nana-pickaxe-counter.png");
  await page.evaluate(() => window.advanceTime(360));
  const pickaxeImpact = await page.evaluate(() => {
    const battle = window.__characterReworkEngine.state.battle;
    const effect = battle.effects.find(
      (candidate) => candidate.kind === "emoji_burst" && candidate.text === "⛏️",
    );
    return {
      remainingPickaxes: battle.projectiles.filter((projectile) => projectile.emoji === "⛏️").length,
      effect: effect
        ? { x: effect.x, y: effect.y, life: effect.life, maxLife: effect.maxLife }
        : null,
    };
  });
  assert.equal(pickaxeImpact.remainingPickaxes, 0);
  assert.ok(pickaxeImpact.effect && pickaxeImpact.effect.life < pickaxeImpact.effect.maxLife);
  await capture("nana-pickaxe-impact.png");

  const gluttonyGrowth = await page.evaluate(() => {
    const engine = window.__characterReworkEngine;
    const battle = engine.state.battle;
    const nana = battle.player.find((fighter) => fighter.unitId === "grove_mender");
    const before = { stacks: nana.growthStacks, radius: nana.radius, attack: nana.attack };
    battle.enemy
      .filter((fighter) => fighter.alive)
      .slice(2, 6)
      .forEach((fighter) => {
        fighter.armor = 0;
        fighter.hp = 1;
        engine.damage(nana, fighter, 99_999);
      });
    return {
      before,
      after: { stacks: nana.growthStacks, radius: nana.radius, attack: nana.attack },
    };
  });
  assert.ok(gluttonyGrowth.after.stacks > gluttonyGrowth.before.stacks);
  assert.ok(gluttonyGrowth.after.radius > gluttonyGrowth.before.radius);
  assert.ok(gluttonyGrowth.after.attack > gluttonyGrowth.before.attack);
  await capture("gluttony-kill-growth.png");

  await enterPreparation(page, 303);
  const reiRevival = await page.evaluate(() => {
    const engine = window.__characterReworkEngine;
    engine.state.round = 22;
    engine.state.playerLevel = 5;
    engine.state.board.fill(null);
    engine.state.board[0] = { uid: 1, id: "rei", star: 3 };
    engine.state.board[1] = { uid: 2, id: "sun_guard", star: 1 };
    engine.startBattle();
    const battle = engine.state.battle;
    const rei = battle.player.find((fighter) => fighter.unitId === "rei");
    const ally = battle.player.find((fighter) => fighter.unitId === "sun_guard");
    const startingEnergy = rei.energy;
    rei.x = 500;
    rei.y = 360;
    ally.x = 525;
    ally.y = 360;
    [...battle.player, ...battle.enemy].forEach((fighter) => {
      fighter.attack = 0;
      fighter.cooldown = 99;
      fighter.energy = 0;
    });
    engine.killFighter(ally);
    battle.enemy.slice(0, 9).forEach((fighter, index) => {
      fighter.x = 590 + (index % 5) * 16;
      fighter.y = 290 + Math.floor(index / 5) * 100 + (index % 2) * 14;
      engine.killFighter(fighter);
    });
    rei.cooldown = 0;
    rei.energy = rei.maxEnergy;
    engine.update(0.05);
    const ghosts = battle.player.filter((fighter) => fighter.reiRevival && fighter.alive);
    return {
      phase: engine.state.phase,
      banner: battle.banner,
      energyProfile: {
        start: startingEnergy,
        perSecond: rei.energyPerSecond,
        onAttack: rei.energyOnAttack,
        onHit: rei.energyOnHit,
      },
      ghosts: ghosts.map((fighter) => ({
        unitId: fighter.unitId,
        hp: fighter.hp,
        maxHp: fighter.maxHp,
        team: fighter.team,
      })),
      consumedCorpses: battle.corpses.filter((corpse) => corpse.consumed).length,
    };
  });
  assert.equal(reiRevival.phase, "battle");
  assert.deepEqual(reiRevival.energyProfile, {
    start: 25,
    perSecond: 5,
    onAttack: 0,
    onHit: 0,
  });
  assert.equal(reiRevival.ghosts.length, 5);
  assert.ok(reiRevival.ghosts.some((ghost) => ghost.unitId === "sun_guard"));
  assert.ok(reiRevival.ghosts.every((ghost) => ghost.team === "player"));
  assert.ok(reiRevival.ghosts.every((ghost) => ghost.hp === ghost.maxHp * 0.25));
  assert.equal(reiRevival.consumedCorpses, 5);
  assert.match(reiRevival.banner, /5 名幽灵加入我方/);
  const reiTextState = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  assert.equal(reiTextState.battle.playerUnits.length, 6);
  await capture("rei-five-ghost-revival.png");

  await enterPreparation(page, 304);
  const shioriSetup = await page.evaluate(() => {
    const engine = window.__characterReworkEngine;
    engine.state.round = 6;
    engine.state.playerLevel = 4;
    engine.state.board.fill(null);
    engine.state.board[0] = { uid: 1, id: "shiori", star: 1 };
    engine.startBattle();
    const battle = engine.state.battle;
    const shiori = battle.player[0];
    shiori.x = 260;
    shiori.y = 360;
    [...battle.player, ...battle.enemy].forEach((fighter) => {
      fighter.attack = 0;
      fighter.cooldown = 99;
      fighter.energy = 0;
      fighter.dodgeChance = 0;
      fighter.moveSpeed = 0;
      fighter.baseMoveSpeed = 0;
    });
    battle.enemy.forEach((fighter, index) => {
      const cluster = [
        { x: 455, y: 330 },
        { x: 455, y: 430 },
        { x: 540, y: 380 },
      ];
      fighter.x = index < cluster.length ? cluster[index].x : 880 + index * 18;
      fighter.y = index < cluster.length ? cluster[index].y : 190 + index * 70;
      fighter.hp = fighter.maxHp = 99_999;
      fighter.armor = 0;
    });
    shiori.cooldown = 0;
    shiori.energy = shiori.maxEnergy;
    engine.update(0.05);
    return {
      attackType: shiori.attackType,
      targetFid: shiori.abilityMotion?.targetFid,
      motion: shiori.abilityMotion,
      shield: shiori.shield,
    };
  });
  assert.equal(shioriSetup.attackType, "melee");
  assert.ok(shioriSetup.motion?.abilityId === "shiori");
  await page.evaluate(() => window.advanceTime(340));
  const shioriImpact = await page.evaluate(() => {
    const engine = window.__characterReworkEngine;
    const battle = engine.state.battle;
    const shiori = battle.player[0];
    return {
      shield: shiori.shield,
      damaged: battle.enemy.filter((fighter) => fighter.damageTaken > 0).length,
      stunned: battle.enemy.filter((fighter) => fighter.stun > 0).length,
      position: { x: shiori.x, y: shiori.y },
      enemies: battle.enemy.map((fighter) => ({
        fid: fighter.fid,
        x: fighter.x,
        y: fighter.y,
        distance: Math.hypot(fighter.x - shiori.x, fighter.y - shiori.y),
        damageTaken: fighter.damageTaken,
        stun: fighter.stun,
      })),
    };
  });
  assert.ok(shioriImpact.shield > shioriSetup.shield);
  assert.ok(shioriImpact.damaged >= 3, JSON.stringify(shioriImpact));
  assert.ok(shioriImpact.stunned >= 3, JSON.stringify(shioriImpact));
  await capture("shiori-sea-otter-impact.png");

  await enterPreparation(page, 305);
  const biscuitSetup = await page.evaluate(() => {
    const engine = window.__characterReworkEngine;
    engine.state.round = 6;
    engine.state.playerLevel = 4;
    engine.state.board.fill(null);
    engine.state.board[0] = { uid: 1, id: "biscuit_sui", star: 1 };
    engine.state.board[1] = { uid: 2, id: "sun_guard", star: 1 };
    engine.state.board[2] = { uid: 3, id: "mossback", star: 1 };
    engine.startBattle();
    const battle = engine.state.battle;
    const biscuit = battle.player.find((fighter) => fighter.unitId === "biscuit_sui");
    const weakest = battle.player.find((fighter) => fighter.unitId === "sun_guard");
    const healthy = battle.player.find((fighter) => fighter.unitId === "mossback");
    const pathEnemy = battle.enemy[0];
    const landingEnemy = battle.enemy[1];
    biscuit.x = 220;
    biscuit.y = 360;
    weakest.x = 540;
    weakest.y = 360;
    weakest.hp = weakest.maxHp * 0.25;
    weakest.shield = 0;
    healthy.x = 300;
    healthy.y = 500;
    healthy.hp = healthy.maxHp;
    pathEnemy.x = 380;
    pathEnemy.y = 360;
    landingEnemy.x = 500;
    landingEnemy.y = 420;
    [...battle.player, ...battle.enemy].forEach((fighter) => {
      fighter.attack = 0;
      fighter.cooldown = 99;
      fighter.energy = 0;
      fighter.dodgeChance = 0;
    });
    battle.enemy.forEach((fighter) => {
      fighter.hp = fighter.maxHp = 99_999;
    });
    biscuit.cooldown = 0;
    biscuit.energy = biscuit.maxEnergy;
    engine.update(0.05);
    return {
      targetFid: biscuit.abilityMotion?.targetFid,
      weakestFid: weakest.fid,
      weakestHp: weakest.hp,
      weakestShield: weakest.shield,
      castRefund: biscuit.castRefund,
      energy: biscuit.energy,
      motion: biscuit.abilityMotion,
      pathEnemy: { fid: pathEnemy.fid, x: pathEnemy.x, y: pathEnemy.y },
      landingEnemy: { fid: landingEnemy.fid, x: landingEnemy.x, y: landingEnemy.y },
    };
  });
  assert.equal(biscuitSetup.targetFid, biscuitSetup.weakestFid);
  assert.equal(biscuitSetup.energy, biscuitSetup.castRefund);
  await page.evaluate(() => window.advanceTime(170));
  const biscuitPathState = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  assert.ok(
    biscuitPathState.battle.playerUnits.some(
      (unit) => unit.unitId === "biscuit_sui" && unit.motion?.abilityId === "biscuit_sui",
    ),
    JSON.stringify(biscuitPathState.battle),
  );
  await capture("biscuit-warm-rescue-path.png");
  await page.evaluate(() => window.advanceTime(520));
  const biscuitImpact = await page.evaluate(({ pathFid, landingFid }) => {
    const engine = window.__characterReworkEngine;
    const battle = engine.state.battle;
    const biscuit = battle.player.find((fighter) => fighter.unitId === "biscuit_sui");
    const weakest = battle.player.find((fighter) => fighter.unitId === "sun_guard");
    const pathEnemy = battle.enemy.find((fighter) => fighter.fid === pathFid);
    const landingEnemy = battle.enemy.find((fighter) => fighter.fid === landingFid);
    return {
      biscuitEnergy: biscuit.energy,
      weakestHp: weakest.hp,
      weakestShield: weakest.shield,
      pathEnemy: { x: pathEnemy.x, y: pathEnemy.y, damageTaken: pathEnemy.damageTaken },
      landingEnemy: { x: landingEnemy.x, y: landingEnemy.y, damageTaken: landingEnemy.damageTaken },
    };
  }, { pathFid: biscuitSetup.pathEnemy.fid, landingFid: biscuitSetup.landingEnemy.fid });
  assert.ok(biscuitImpact.weakestHp > biscuitSetup.weakestHp);
  assert.ok(biscuitImpact.weakestShield > biscuitSetup.weakestShield);
  assert.ok(
    Math.hypot(
      biscuitImpact.pathEnemy.x - biscuitSetup.pathEnemy.x,
      biscuitImpact.pathEnemy.y - biscuitSetup.pathEnemy.y,
    ) > 10,
  );
  assert.ok(
    Math.hypot(
      biscuitImpact.landingEnemy.x - biscuitSetup.landingEnemy.x,
      biscuitImpact.landingEnemy.y - biscuitSetup.landingEnemy.y,
    ) > 10,
  );
  assert.equal(biscuitImpact.pathEnemy.damageTaken, 0);
  assert.equal(biscuitImpact.landingEnemy.damageTaken, 0);
  await capture("biscuit-warm-rescue-impact.png");

  await enterPreparation(page, 306);
  const birdSetup = await page.evaluate(() => {
    const engine = window.__characterReworkEngine;
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
      fighter.x = 430 + index * 65;
      fighter.y = 340 + (index % 2) * 40;
      fighter.hp = fighter.maxHp = 99_999;
      fighter.armor = 0;
      fighter.attack = 0;
      fighter.cooldown = 99;
      fighter.energy = 0;
      fighter.dodgeChance = 0;
    });
    bird.cooldown = 0;
    bird.energy = bird.maxEnergy;
    engine.update(0.05);
    return {
      attackType: bird.attackType,
      charges: bird.suiBirdChargesRemaining,
      motion: bird.abilityMotion,
      enemyStarts: battle.enemy.map((fighter) => ({ fid: fighter.fid, x: fighter.x, y: fighter.y })),
    };
  });
  assert.equal(birdSetup.attackType, "melee");
  assert.equal(birdSetup.charges, 2);
  assert.equal(birdSetup.motion?.abilityId, "sui_bird");
  await page.evaluate(() => window.advanceTime(390));
  const birdMidState = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  const birdMid = birdMidState.battle.playerUnits.find((unit) => unit.unitId === "sui_bird");
  assert.ok(birdMid?.motion?.abilityId === "sui_bird" || birdMid?.elbowCharges > 0);
  await capture("sui-bird-elbow-chain.png");
  await page.evaluate(() => window.advanceTime(1000));
  const birdImpact = await page.evaluate(() => {
    const engine = window.__characterReworkEngine;
    const battle = engine.state.battle;
    const bird = battle.player[0];
    return {
      charges: bird.suiBirdChargesRemaining,
      motion: bird.abilityMotion,
      damaged: battle.enemy.filter((fighter) => fighter.damageTaken > 0).length,
      pushed: battle.enemy.map((fighter) => ({ fid: fighter.fid, x: fighter.x, y: fighter.y })),
    };
  });
  assert.equal(birdImpact.charges, 0);
  assert.equal(birdImpact.motion, null);
  assert.ok(birdImpact.damaged >= 1);
  assert.ok(
    birdImpact.pushed.some((fighter) => {
      const start = birdSetup.enemyStarts.find((candidate) => candidate.fid === fighter.fid);
      return start && Math.hypot(fighter.x - start.x, fighter.y - start.y) > 10;
    }),
  );

  await enterPreparation(page, 307);
  const roundFiveWave = await page.evaluate(() => {
    const engine = window.__characterReworkEngine;
    engine.state.round = 5;
    engine.startBattle();
    return engine.state.battle.enemy.map((fighter) => fighter.unitId);
  });
  await page.evaluate(() => window.advanceTime(1));
  await page.waitForFunction(() => document.body.textContent?.includes("5/16 战"));
  assert.deepEqual(
    roundFiveWave,
    ["mossback", "mossback", "biscuit_sui", "rift_brawler", "ember_blade"],
  );
  const roundFiveTextState = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  assert.deepEqual(
    roundFiveTextState.battle.enemyUnits.map((fighter) => fighter.unitId),
    roundFiveWave,
  );
  assert.ok(!roundFiveWave.includes("grove_mender"));
  await capture("round-five-fixed-wave.png");

  const canvas = page.locator('[data-game-canvas="rift-line"]');
  const canvasBox = await canvas.boundingBox();
  const canvasMeta = await canvas.evaluate((element) => ({
    width: element.width,
    height: element.height,
    logicalWidth: element.dataset.logicalWidth,
    logicalHeight: element.dataset.logicalHeight,
  }));
  assert.ok(canvasBox && canvasBox.width >= 1000 && canvasBox.height >= 500);
  const unexpectedErrors = errors.filter((error) => !error.includes("/api/record"));
  const unexpectedResponses = failedResponses.filter(
    (response) => !response.url.endsWith("/api/record"),
  );
  assert.deepEqual(unexpectedResponses, [], JSON.stringify(unexpectedResponses));
  assert.deepEqual(unexpectedErrors, [], JSON.stringify(unexpectedErrors));

  console.log(JSON.stringify({
    codex: {
      first: codexUnits.slice(0, 5),
      last: codexUnits.slice(-5),
      nanaDetails,
    },
    nanaSetup,
    nanaCounter,
    gluttonyGrowth,
    reiRevival,
    shioriSetup,
    shioriImpact,
    biscuitSetup,
    biscuitImpact,
    birdSetup,
    birdImpact,
    roundFiveWave,
    screenshots,
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
