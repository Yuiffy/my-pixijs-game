const { createRequire } = require('node:module');
const { existsSync } = require('node:fs');
const { mkdirSync } = require('node:fs');

const localRequire = createRequire(__filename);
const playwrightCandidates = [
  process.env.PLAYWRIGHT_MODULE,
  'playwright',
  'C:/Users/apple/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright',
  'C:/Users/yuiffy/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright',
].filter(Boolean);

const loadPlaywright = () => {
  for (const candidate of playwrightCandidates) {
    try {
      if (candidate.includes('/') || candidate.includes('\\')) {
        if (!existsSync(candidate)) continue;
        return localRequire(candidate);
      }
      return localRequire(candidate);
    } catch {
      // 继续尝试下一个候选路径
    }
  }
  throw new Error('无法加载 playwright，请安装依赖或设置 PLAYWRIGHT_MODULE');
};

const { chromium } = loadPlaywright();

const artifactDirectory = '.tmp/autochess';
mkdirSync(artifactDirectory, { recursive: true });

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${process.env.AUTOCHESS_BASE_URL || 'http://127.0.0.1:3100'}/game/autochess?seed=1`);
  const canvas = page.locator('[data-game-canvas="rift-line"]');
  await canvas.waitFor();

  const pointForLogical = async (x, y) => {
    const box = await canvas.boundingBox();
    return { x: box.x + (x / 1120) * box.width, y: box.y + (y / 720) * box.height };
  };
  const clickLogical = async (x, y) => {
    const point = await pointForLogical(x, y);
    await page.mouse.click(point.x, point.y);
  };
  const moveLogical = async (x, y) => {
    const point = await pointForLogical(x, y);
    await page.mouse.move(point.x, point.y);
  };
  const state = async () => JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  const advance = async (ms) => page.evaluate((value) => window.advanceTime(value), ms);
  const minClearance = (units) => {
    let minimum = Infinity;
    for (let i = 0; i < units.length; i += 1) for (let j = i + 1; j < units.length; j += 1) {
      const distance = Math.hypot(units[i].x - units[j].x, units[i].y - units[j].y);
      minimum = Math.min(minimum, distance - units[i].radius - units[j].radius);
    }
    return Number.isFinite(minimum) ? Math.round(minimum) : null;
  };

  await clickLogical(240, 440);
  let prep = await state();
  const initial = { level: prep.player.level, bookLevel: prep.player.bookLevel, upgradeRemaining: prep.player.upgradeRemaining, cap: prep.player.boardCap, gold: prep.player.gold, shopLocked: prep.shopLocked };
  await clickLogical(941, 541);
  const locked = await state();
  await clickLogical(851, 554);
  prep = await state();
  const afterUpgrade = { level: prep.player.level, bookLevel: prep.player.bookLevel, upgradeRemaining: prep.player.upgradeRemaining, cap: prep.player.boardCap, gold: prep.player.gold, odds: prep.roster.currentTierOdds, toast: prep.toast, shopLocked: prep.shopLocked };
  await page.screenshot({ path: `${artifactDirectory}/autochess-prep.png` });
  await moveLogical(80, 206);
  await page.screenshot({ path: `${artifactDirectory}/autochess-trait-tooltip.png` });

  await clickLogical(945, 175 + 3 * 74);
  await clickLogical(945, 175 + 4 * 74);
  prep = await state();
  await clickLogical(1035, 554);
  await advance(100);
  const battleStart = await state();
  await advance(1000);
  const battleEarly = await state();
  await advance(2000);
  const battleContact = await state();
  await page.screenshot({ path: `${artifactDirectory}/autochess-battle-early.png` });
  await advance(300);
  const battleActive = await state();
  const feedbackSamples = [];
  for (let index = 0; index < 30; index += 1) {
    await advance(50);
    feedbackSamples.push(await state());
  }
  await page.screenshot({ path: `${artifactDirectory}/autochess-battle-active.png` });

  const advanceUntilPhase = async (phase, maxMilliseconds = 30000) => {
    for (let elapsed = 0; elapsed < maxMilliseconds; elapsed += 500) {
      if ((await state()).phase === phase) return elapsed;
      await advance(500);
    }
    throw new Error(`Timed out waiting for phase ${phase}`);
  };
  const resultRound1Elapsed = await advanceUntilPhase('result');
  const resultRound1 = await state();
  await advance(150);
  await page.screenshot({ path: `${artifactDirectory}/autochess-result-round1.png` });
  await clickLogical(560, 659);
  const preparationRound2 = await state();
  if (preparationRound2.phase !== 'preparation' || preparationRound2.round !== 2) {
    throw new Error(`Result continue did not reach round-2 preparation: ${JSON.stringify(preparationRound2)}`);
  }
  await page.screenshot({ path: `${artifactDirectory}/autochess-preparation-round2.png` });
  await clickLogical(1035, 554);
  const resultRound2Elapsed = await advanceUntilPhase('result');
  const resultRound2 = await state();
  await advance(150);
  await page.screenshot({ path: `${artifactDirectory}/autochess-result-round2.png` });
  await clickLogical(560, 659);
  const augmentRound2 = await state();
  if (augmentRound2.phase !== 'augment' || augmentRound2.round !== 2) {
    throw new Error(`Round-2 continue did not reach augment selection: ${JSON.stringify(augmentRound2)}`);
  }
  await page.screenshot({ path: `${artifactDirectory}/autochess-augment-round2.png` });
  await clickLogical(235, 516);
  const preparationRound3 = await state();
  if (preparationRound3.phase !== 'preparation' || preparationRound3.round !== 3) {
    throw new Error(`Augment choice did not reach round-3 preparation: ${JSON.stringify(preparationRound3)}`);
  }
  await page.screenshot({ path: `${artifactDirectory}/autochess-preparation-round3.png` });

  const battleFrames = [battleStart, battleEarly, battleContact, battleActive, ...feedbackSamples].filter((entry) => entry.battle);
  const allUnits = battleFrames.flatMap((entry) => [...entry.battle.playerUnits, ...entry.battle.enemyUnits]);
  const feedbackSeen = {
    attack: allUnits.some((unit) => unit.attacking),
    hit: allUnits.some((unit) => unit.hit),
  };
  const assassinFrames = [battleStart, battleEarly, battleContact, battleActive]
    .filter((entry) => entry.battle)
    .map((entry) => ({
    elapsed: entry.battle.elapsed,
    units: entry.battle.playerUnits.filter((unit) => unit.jumpPending || unit.jumping || unit.name.includes('影') || unit.name.includes('锋') || unit.name.includes('舞') || unit.name.includes('牙') || unit.name.includes('终猎')),
  }));
  const clearances = [battleStart, battleEarly, battleContact, battleActive]
    .filter((entry) => entry.battle)
    .map((entry) => ({
    elapsed: entry.battle.elapsed,
    clearance: minClearance([...entry.battle.playerUnits, ...entry.battle.enemyUnits]),
  }));

  const beforeFullscreen = await canvas.boundingBox();
  await page.locator('button:has-text("全屏游玩")').click();
  await page.waitForTimeout(300);
  const fullscreen = await page.evaluate(() => Boolean(document.fullscreenElement));
  const afterFullscreen = await canvas.boundingBox();
  await page.screenshot({ path: `${artifactDirectory}/autochess-fullscreen.png` });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  const mobileBox = await canvas.boundingBox();
  const canvasResolution = await canvas.evaluate((element) => ({ width: element.width, height: element.height }));
  const displayAspect = mobileBox.width / mobileBox.height;
  await page.screenshot({ path: `${artifactDirectory}/autochess-mobile.png` });

  console.log(JSON.stringify({ initial, locked: { shopLocked: locked.shopLocked }, afterUpgrade, purchased: { board: prep.board.length, bench: prep.bench.length }, continuation: { resultRound1Elapsed, resultRound1: { round: resultRound1.round, won: resultRound1.result?.won }, preparationRound2: { round: preparationRound2.round, phase: preparationRound2.phase }, resultRound2Elapsed, resultRound2: { round: resultRound2.round, won: resultRound2.result?.won }, augmentRound2: { round: augmentRound2.round, choices: augmentRound2.augmentChoices?.length }, preparationRound3: { round: preparationRound3.round, augments: preparationRound3.augments?.length } }, assassinFrames, clearances, feedbackSeen, fullscreen, sizes: { beforeFullscreen, afterFullscreen, mobileBox, canvasResolution, displayAspect }, errors }, null, 2));
  await browser.close();
})().catch((error) => { console.error(error); process.exit(1); });
