const assert = require("node:assert/strict");
const { existsSync, mkdirSync, mkdtempSync, rmSync } = require("node:fs");
const { createRequire } = require("node:module");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { inspectPng } = require("./lib/autochess-screenshot.cjs");

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
      // Try the next known installation.
    }
  }
  throw new Error("Unable to load playwright; install it or set PLAYWRIGHT_MODULE");
};

const { chromium } = loadPlaywright();
const baseUrl = process.env.AUTOCHESS_BASE_URL || "http://127.0.0.1:3100";
const artifactDirectory = ".tmp/autochess/tiandou-v0.5.2";
const canvasTimeout = Number(process.env.AUTOCHESS_CANVAS_TIMEOUT || 60_000);
mkdirSync(artifactDirectory, { recursive: true });

let browserContext = null;
let browserProfile = null;

const closeBrowser = async () => {
  if (browserContext) {
    await browserContext.close().catch(() => {});
    browserContext = null;
  }
  if (browserProfile) {
    try {
      rmSync(browserProfile, { recursive: true, force: true });
    } catch {
      // Chrome can briefly retain a profile lock after shutdown.
    }
    browserProfile = null;
  }
};

(async () => {
  browserProfile = mkdtempSync(join(tmpdir(), "autochess-tiandou-"));
  browserContext = await chromium.launchPersistentContext(browserProfile, {
    channel: "chrome",
    headless: process.env.AUTOCHESS_HEADED !== "1",
    viewport: { width: 1440, height: 900 },
  });
  const page = browserContext.pages()[0] || await browserContext.newPage();
  const errors = [];
  const failedResponses = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400) failedResponses.push({ status: response.status(), url: response.url() });
  });

  const response = await page.goto(`${baseUrl}/game/autochess?seed=7520`, { waitUntil: "domcontentloaded" });
  if (!response?.ok()) throw new Error(`Autochess URL returned ${response?.status()}`);
  const canvas = page.locator('[data-game-canvas="rift-line"]');
  await canvas.waitFor({ state: "attached", timeout: canvasTimeout });
  await page.waitForFunction(() => {
    const element = document.querySelector('[data-game-canvas="rift-line"]');
    const rect = element?.getBoundingClientRect();
    return Boolean(element && rect && rect.width > 0 && rect.height > 0 && element.width > 0 && element.height > 0);
  }, { timeout: canvasTimeout });
  await page.waitForFunction(() => Boolean(
    window.autoChessAI?.bridge
      && typeof window.render_game_to_text === "function"
      && typeof window.advanceTime === "function",
  ));

  const canvasMetrics = await canvas.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      cssWidth: rect.width,
      cssHeight: rect.height,
      width: element.width,
      height: element.height,
      logicalWidth: Number(element.dataset.logicalWidth),
      logicalHeight: Number(element.dataset.logicalHeight),
    };
  });
  assert.ok(canvasMetrics.cssWidth > 0 && canvasMetrics.cssHeight > 0);
  assert.ok(canvasMetrics.width > 0 && canvasMetrics.height > 0);

  const screenshots = {};
  const capture = async (name) => {
    const path = `${artifactDirectory}/${name}.png`;
    const buffer = await page.screenshot({ path, fullPage: true });
    screenshots[name] = inspectPng(buffer);
  };

  const setup = await page.evaluate(() => {
    const bridge = window.autoChessAI.bridge;
    const engine = bridge.engine;
    engine.resetToTitle();
    engine.startRun(engine.state.starterChoices[0]);
    engine.state.round = 4;
    engine.state.playerLevel = 4;
    engine.state.board.fill(null);
    engine.state.bench.fill(null);
    engine.state.board[0] = { uid: 7521, id: "tiandou", star: 1 };
    engine.state.board[5] = { uid: 7522, id: "sui", star: 1 };
    engine.startBattle();
    const battle = engine.state.battle;
    const source = battle.player.find((fighter) => fighter.unitId === "tiandou");
    const ally = battle.player.find((fighter) => fighter.unitId === "sui");
    const target = battle.enemy[0];
    battle.enemy.splice(1);
    battle.limit = 90;

    source.x = 260;
    source.y = 360;
    ally.x = 260;
    ally.y = 560;
    target.x = 520;
    target.y = 360;
    for (const fighter of [source, ally, target]) {
      fighter.attack = 0;
      fighter.baseAttack = 0;
      fighter.cooldown = 99;
      fighter.moveSpeed = 0;
      fighter.baseMoveSpeed = 0;
      fighter.energy = 0;
      fighter.energyPerSecond = 0;
      fighter.energyOnAttack = 0;
      fighter.energyOnHit = 0;
      fighter.stun = 0;
    }
    target.hp = 99_999;
    target.maxHp = 99_999;
    ally.hp = ally.maxHp * 0.5;

    bridge.setBattlePaused(true);
    engine.castAbility(source, [target]);
    return {
      sourceFid: source.fid,
      allyFid: ally.fid,
      targetFid: target.fid,
      launched: battle.projectiles.filter((projectile) => projectile.style === "lollipop").length,
      textState: JSON.parse(window.render_game_to_text()),
    };
  });

  assert.equal(setup.launched, 5);
  assert.equal(setup.textState.version, "0.5.2");
  assert.equal(setup.textState.interface.battlePaused, true);

  const airborne = await page.evaluate(() => {
    window.advanceTime(120);
    const state = JSON.parse(window.render_game_to_text());
    const candies = state.battle.visualEffects.projectiles.filter(
      (projectile) => projectile.style === "lollipop",
    );
    return {
      count: candies.length,
      grounded: candies.filter((projectile) => projectile.grounded).length,
      textState: state,
    };
  });
  assert.equal(airborne.count, 5);
  assert.equal(airborne.grounded, 0);
  assert.ok(JSON.stringify(airborne.textState).includes("恬豆"));
  await capture("tiandou-lollipops-airborne");

  const grounded = await page.evaluate(() => {
    window.advanceTime(220);
    const bridge = window.autoChessAI.bridge;
    const battle = bridge.engine.state.battle;
    const candies = battle.projectiles.filter((projectile) => projectile.style === "lollipop");
    return {
      count: candies.length,
      grounded: candies.filter((projectile) => projectile.grounded).length,
      positions: candies.map((projectile) => ({ x: projectile.x, y: projectile.y })),
      textState: JSON.parse(window.render_game_to_text()),
    };
  });
  assert.equal(grounded.count, 5);
  assert.equal(grounded.grounded, 5);
  assert.equal(grounded.textState.battle.visualEffects.projectiles.filter(
    (projectile) => projectile.style === "lollipop" && projectile.grounded,
  ).length, 5);
  await capture("tiandou-lollipops-grounded");

  const pickup = await page.evaluate(({ allyFid }) => {
    const bridge = window.autoChessAI.bridge;
    const battle = bridge.engine.state.battle;
    const ally = battle.player.find((fighter) => fighter.fid === allyFid);
    const candies = battle.projectiles
      .filter((projectile) => projectile.style === "lollipop" && projectile.grounded)
      .sort((left, right) => right.x - left.x || left.y - right.y);
    const candy = candies[0];
    battle.enemy.forEach((fighter) => {
      fighter.x = 720;
      fighter.y = 560;
    });
    ally.x = candy.x + ally.radius + candy.radius + 20;
    ally.y = candy.y;
    ally.hp = ally.maxHp * 0.5;
    const hpBefore = ally.hp;
    const healingBefore = battle.player.find((fighter) => fighter.unitId === "tiandou").healingDone;
    const candyCountBefore = candies.length;
    const physicalGap = Math.hypot(ally.x - candy.x, ally.y - candy.y) - ally.radius - candy.radius;
    window.advanceTime(20);
    const source = battle.player.find((fighter) => fighter.unitId === "tiandou");
    const candyCountAfter = battle.projectiles.filter(
      (projectile) => projectile.style === "lollipop" && projectile.grounded,
    ).length;
    return {
      physicalGap,
      hpBefore,
      hpAfter: ally.hp,
      healingBefore,
      healingAfter: source.healingDone,
      candyCountBefore,
      candyCountAfter,
      moveSpeedBonus: ally.abilityMoveSpeed,
      moveSpeedTime: ally.abilityMoveSpeedTime,
      textState: JSON.parse(window.render_game_to_text()),
    };
  }, setup);

  assert.ok(pickup.physicalGap > 19 && pickup.physicalGap < 21);
  assert.ok(pickup.hpAfter > pickup.hpBefore);
  assert.ok(pickup.healingAfter > pickup.healingBefore);
  assert.ok(pickup.candyCountAfter < pickup.candyCountBefore);
  assert.ok(pickup.moveSpeedBonus >= 16);
  assert.ok(pickup.moveSpeedTime > 2.9);
  assert.equal(pickup.textState.interface.battlePaused, true);
  await capture("tiandou-near-pickup");

  assert.deepEqual(errors, []);
  assert.deepEqual(failedResponses, []);
  console.log(JSON.stringify({
    canvas: canvasMetrics,
    setup,
    airborne: { count: airborne.count, grounded: airborne.grounded },
    grounded: { count: grounded.count, grounded: grounded.grounded },
    pickup: {
      physicalGap: Number(pickup.physicalGap.toFixed(2)),
      healing: Number((pickup.healingAfter - pickup.healingBefore).toFixed(2)),
      candyCount: `${pickup.candyCountBefore} -> ${pickup.candyCountAfter}`,
      moveSpeedBonus: pickup.moveSpeedBonus,
    },
    screenshots,
    errors,
    failedResponses,
  }, null, 2));
  await closeBrowser();
})().catch(async (error) => {
  console.error(error);
  await closeBrowser();
  process.exitCode = 1;
});
