const { chromium } = require('C:/Users/yuiffy/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright');
const { mkdirSync } = require('node:fs');

const artifactDirectory = '.tmp/autochess';
mkdirSync(artifactDirectory, { recursive: true });

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('http://127.0.0.1:3100/game/autochess?seed=1');
  const canvas = page.locator('[data-game-canvas="rift-line"]');
  await canvas.waitFor();

  const clickLogical = async (x, y) => {
    const box = await canvas.boundingBox();
    await page.mouse.click(box.x + (x / 1120) * box.width, box.y + (y / 720) * box.height);
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
  const initial = { level: prep.player.level, xp: prep.player.experience, cap: prep.player.boardCap, gold: prep.player.gold };
  await clickLogical(851, 554);
  prep = await state();
  const afterXp = { level: prep.player.level, xp: prep.player.experience, cap: prep.player.boardCap, gold: prep.player.gold, odds: prep.roster.currentTierOdds, toast: prep.toast };
  await page.screenshot({ path: `${artifactDirectory}/autochess-prep.png` });

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
  await page.screenshot({ path: `${artifactDirectory}/autochess-mobile.png` });

  console.log(JSON.stringify({ initial, afterXp, purchased: { board: prep.board.length, bench: prep.bench.length }, assassinFrames, clearances, feedbackSeen, fullscreen, sizes: { beforeFullscreen, afterFullscreen, mobileBox, canvasResolution }, errors }, null, 2));
  await browser.close();
})().catch((error) => { console.error(error); process.exit(1); });
