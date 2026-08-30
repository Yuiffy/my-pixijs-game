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
const artifactDirectory = ".tmp/autochess/youyi-v0.5.1";
const canvasTimeout = Number(process.env.AUTOCHESS_CANVAS_TIMEOUT || 60_000);
mkdirSync(artifactDirectory, { recursive: true });

const expectations = [
  { star: 1, damageMultiplier: 0.78, stunDuration: 0.45 },
  { star: 2, damageMultiplier: 0.96, stunDuration: 0.7 },
  { star: 3, damageMultiplier: 1.16, stunDuration: 1 },
];

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
  browserProfile = mkdtempSync(join(tmpdir(), "autochess-youyi-"));
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

  const response = await page.goto(`${baseUrl}/game/autochess?seed=7401`, { waitUntil: "domcontentloaded" });
  if (!response?.ok()) throw new Error(`Autochess URL returned ${response?.status()}`);
  const canvas = page.locator('[data-game-canvas="rift-line"]');
  try {
    await canvas.waitFor({ state: "attached", timeout: canvasTimeout });
    await page.waitForFunction(() => {
      const element = document.querySelector('[data-game-canvas="rift-line"]');
      const rect = element?.getBoundingClientRect();
      return Boolean(element && rect && rect.width > 0 && rect.height > 0 && element.width > 0 && element.height > 0);
    }, { timeout: canvasTimeout });
  } catch (error) {
    const diagnosticPath = `${artifactDirectory}/mount-timeout.png`;
    const diagnosticBuffer = await page.screenshot({ path: diagnosticPath, fullPage: true });
    const diagnostic = await page.evaluate(() => ({
      title: document.title,
      url: location.href,
      bodyText: document.body.innerText.slice(0, 2_000),
      bodyHtml: document.body.innerHTML.slice(0, 2_000),
    }));
    console.error(JSON.stringify({ diagnostic, screenshot: inspectPng(diagnosticBuffer), errors, failedResponses }, null, 2));
    throw error;
  }
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

  const scenarios = [];
  for (const expectation of expectations) {
    const setup = await page.evaluate(({ star }) => {
      const bridge = window.autoChessAI.bridge;
      const engine = bridge.engine;
      engine.resetToTitle();
      engine.startRun(engine.state.starterChoices[0]);
      engine.state.round = 6;
      engine.state.board.fill(null);
      engine.state.bench.fill(null);
      engine.state.board[0] = { uid: 7400 + star, id: "youyi", star };
      engine.startBattle();
      const battle = engine.state.battle;
      const source = battle.player[0];
      const target = battle.enemy[0];
      battle.enemy.splice(1);
      battle.limit = 90;

      source.x = 220;
      source.y = 360;
      source.energy = source.maxEnergy;
      source.cooldown = 0;
      source.critChance = 0;
      source.lowHealthBonus = 0;
      source.jumpPending = false;
      source.jumpTime = 0;

      target.x = 500;
      target.y = 360;
      target.attack = 0;
      target.baseAttack = 0;
      target.armor = 0;
      target.dodgeChance = 0;
      target.moveSpeed = 0;
      target.baseMoveSpeed = 0;
      target.cooldown = 99;
      target.energy = 0;
      target.energyPerSecond = 0;
      target.energyOnAttack = 0;
      target.energyOnHit = 0;
      target.hp = 99_999;
      target.maxHp = 99_999;
      target.shield = 0;
      target.abilityShield = 0;
      target.manquTime = 0;
      target.stun = 0;

      bridge.setBattlePaused(true);
      window.advanceTime(1);
      return {
        sourceFid: source.fid,
        targetFid: target.fid,
        sourceAttack: source.attack,
        targetStartHp: target.hp,
        motion: source.abilityMotion && {
          abilityId: source.abilityMotion.abilityId,
          duration: source.abilityMotion.duration,
          time: source.abilityMotion.time,
        },
      };
    }, expectation);

    assert.equal(setup.motion?.abilityId, "youyi");
    assert.equal(setup.motion?.duration, 0.52);
    assert.equal(setup.motion?.time, 0);

    const airborne = await page.evaluate(({ sourceFid, targetFid }) => {
      window.advanceTime(200);
      const bridge = window.autoChessAI.bridge;
      const battle = bridge.engine.state.battle;
      const source = battle.player.find((fighter) => fighter.fid === sourceFid);
      const target = battle.enemy.find((fighter) => fighter.fid === targetFid);
      return {
        phase: bridge.engine.state.phase,
        star: source.star,
        source: { x: source.x, y: source.y },
        targetHp: target.hp,
        motion: source.abilityMotion && {
          abilityId: source.abilityMotion.abilityId,
          duration: source.abilityMotion.duration,
          time: source.abilityMotion.time,
        },
        textState: JSON.parse(window.render_game_to_text()),
      };
    }, setup);
    assert.equal(airborne.phase, "battle");
    assert.equal(airborne.star, expectation.star);
    assert.equal(airborne.motion?.abilityId, "youyi");
    assert.ok(airborne.motion.time > 0 && airborne.motion.time < airborne.motion.duration);
    assert.equal(airborne.targetHp, setup.targetStartHp);
    assert.equal(airborne.textState.interface.battlePaused, true);
    assert.ok(JSON.stringify(airborne.textState).includes("又一"));
    await capture(`youyi-${expectation.star}-star-airborne`);

    const landed = await page.evaluate(({ sourceFid, targetFid }) => {
      window.advanceTime(320);
      const bridge = window.autoChessAI.bridge;
      const battle = bridge.engine.state.battle;
      const source = battle.player.find((fighter) => fighter.fid === sourceFid);
      const target = battle.enemy.find((fighter) => fighter.fid === targetFid);
      return {
        phase: bridge.engine.state.phase,
        star: source.star,
        source: { x: source.x, y: source.y, attack: source.attack },
        target: { hp: target.hp, stun: target.stun },
        motion: source.abilityMotion,
        textState: JSON.parse(window.render_game_to_text()),
      };
    }, setup);
    assert.equal(landed.phase, "battle");
    assert.equal(landed.motion, null);
    const actualDamage = setup.targetStartHp - landed.target.hp;
    const expectedDamage = setup.sourceAttack * expectation.damageMultiplier * 2;
    assert.ok(Math.abs(actualDamage - expectedDamage) < 1e-8);
    assert.ok(landed.target.stun > expectation.stunDuration - 0.05);
    assert.ok(landed.target.stun <= expectation.stunDuration);
    assert.equal(landed.textState.interface.battlePaused, true);
    await capture(`youyi-${expectation.star}-star-landing`);

    scenarios.push({
      star: expectation.star,
      motionDuration: setup.motion.duration,
      damage: Number(actualDamage.toFixed(2)),
      stunRemaining: Number(landed.target.stun.toFixed(3)),
    });
  }

  assert.deepEqual(errors, []);
  assert.deepEqual(failedResponses, []);
  console.log(JSON.stringify({ canvas: canvasMetrics, scenarios, screenshots, errors, failedResponses }, null, 2));
  await closeBrowser();
})().catch(async (error) => {
  console.error(error);
  await closeBrowser();
  process.exitCode = 1;
});
