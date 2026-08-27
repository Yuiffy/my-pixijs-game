const { createRequire } = require('node:module');
const { existsSync } = require('node:fs');
const { mkdirSync } = require('node:fs');
const { inspectPng } = require('./scripts/lib/autochess-screenshot.cjs');

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
  const failedResponses = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400) failedResponses.push({ status: response.status(), url: response.url() });
  });
  await page.goto(`${process.env.AUTOCHESS_BASE_URL || 'http://127.0.0.1:3100'}/game/autochess?seed=1`);
  const canvas = page.locator('[data-game-canvas="rift-line"]');
  await canvas.waitFor();
  const pageLayout = await page.evaluate(() => {
    const root = document.querySelector('[data-game-canvas="rift-line"]')?.parentElement?.parentElement?.getBoundingClientRect();
    const toolbar = document.querySelector('.rift-toolbar')?.getBoundingClientRect();
    const host = document.querySelector('[data-game-canvas="rift-line"]')?.parentElement?.getBoundingClientRect();
    return { root, toolbar, host, viewport: { width: window.innerWidth, height: window.innerHeight } };
  });
  if (!pageLayout.root || !pageLayout.toolbar || !pageLayout.host) throw new Error('网页全视口布局未初始化');
  if (Math.abs(pageLayout.root.width - pageLayout.viewport.width) > 1 || Math.abs(pageLayout.root.height - pageLayout.viewport.height) > 1) throw new Error('普通网页模式未填满视口');
  if (pageLayout.host.y < pageLayout.toolbar.y + pageLayout.toolbar.height - 1 || pageLayout.host.height < pageLayout.viewport.height - pageLayout.toolbar.height - 1) throw new Error('游戏宿主未填满工具栏下方空间');

  const pointForLogical = async (x, y) => {
    const box = await canvas.boundingBox();
    const logical = await canvas.evaluate((element) => ({
      width: Number(element.dataset.logicalWidth || 1120),
      height: Number(element.dataset.logicalHeight || 720),
    }));
    const fitScale = Math.min(box.width / logical.width, box.height / logical.height);
    return {
      x: box.x + (box.width - logical.width * fitScale) / 2 + x * fitScale,
      y: box.y + (box.height - logical.height * fitScale) / 2 + y * fitScale,
    };
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
  const screenshots = {};
  const capture = async (name) => {
    const buffer = await page.screenshot({ path: `${artifactDirectory}/${name}.png` });
    screenshots[name] = inspectPng(buffer);
  };

  await page.waitForFunction(() => {
    const portraits = [...document.querySelectorAll('.rift-dom-choice img')];
    return portraits.length === 3 && portraits.every((image) => image.complete && image.naturalWidth > 0);
  });
  await capture('autochess-title');
  await page.locator('.rift-dom-choice').first().hover();
  await capture('autochess-title-hover');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  const titleMobileBox = await canvas.boundingBox();
  if (!titleMobileBox || titleMobileBox.width < 380 || titleMobileBox.height < 500) throw new Error(`标题移动端画布未填满竖屏游戏宿主: ${JSON.stringify(titleMobileBox)}`);
  await capture('autochess-title-mobile');
  await page.getByText('火热整活', { exact: true }).click();
  let prep = await state();
  if (prep.phase !== 'preparation') throw new Error(`紧凑标题协议选择未进入备战: ${JSON.stringify(prep)}`);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(300);
  const initial = { level: prep.player.level, bookLevel: prep.player.bookLevel, upgradeRemaining: prep.player.upgradeRemaining, cap: prep.player.boardCap, gold: prep.player.gold, shopLocked: prep.shopLocked };
  await page.getByRole('button', { name: '锁定商店' }).click();
  const locked = await state();
  if (!locked.shopLocked) throw new Error(`锁店按钮未锁定商店: ${JSON.stringify(locked)}`);
  await page.getByRole('button', { name: /已锁定/ }).click();
  const unlocked = await state();
  if (unlocked.shopLocked) throw new Error(`锁店按钮未解锁商店: ${JSON.stringify(unlocked)}`);

  const purchasedCards = [];
  const unitCopies = (snapshot) => [...snapshot.board, ...snapshot.bench]
    .reduce((total, unit) => total + (unit.star === 1 ? 1 : unit.star === 2 ? 3 : 9), 0);
  for (let index = 0; index < 2; index += 1) {
    const beforePurchase = await state();
    const affordable = page.locator('.rift-dom-shop-desktop button.rift-dom-shop-card:not(:disabled)');
    if (!await affordable.count()) throw new Error(`第 ${index + 1} 次购买前没有可购买棋子`);
    const card = affordable.first();
    const cardName = await card.evaluate((element) => (
      element.getAttribute('aria-label') || element.textContent?.replace(/\s+/g, ' ').trim() || '未知棋子'
    ));
    await card.click();
    const afterPurchase = await state();
    if (unitCopies(afterPurchase) !== unitCopies(beforePurchase) + 1) {
      throw new Error(`第 ${index + 1} 次购买未增加一份棋子: ${JSON.stringify({ cardName, beforePurchase, afterPurchase })}`);
    }
    purchasedCards.push(cardName);
  }
  const beforeUpgrade = await state();
  await page.getByRole('button', { name: /^升本/ }).click();
  prep = await state();
  if (prep.player.bookLevel !== initial.bookLevel + 1) {
    throw new Error(`升本按钮未提升等级: ${JSON.stringify({ initial, beforeUpgrade, after: prep.player })}`);
  }
  const afterUpgrade = { level: prep.player.level, bookLevel: prep.player.bookLevel, upgradeRemaining: prep.player.upgradeRemaining, cap: prep.player.boardCap, gold: prep.player.gold, odds: prep.roster.currentTierOdds, toast: prep.toast, shopLocked: prep.shopLocked };
  await capture('autochess-prep');
  await moveLogical(220, 202);
  await page.waitForTimeout(80);
  await capture('autochess-trait-tooltip');

  const dragSource = { x: 44 + 52, y: 232 + 29 };
  const dragTarget = { x: 44 + 116 + 52, y: 232 + 29 };
  const dragStart = await pointForLogical(dragSource.x, dragSource.y);
  const dragEnd = await pointForLogical(dragTarget.x, dragTarget.y);
  await page.mouse.move(dragStart.x, dragStart.y);
  await page.mouse.down();
  await page.mouse.move(dragEnd.x, dragEnd.y, { steps: 6 });
  await capture('autochess-drag-ghost');
  await page.mouse.up();
  const afterDrag = await state();
  await page.getByRole('button', { name: /开始战斗/ }).click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === 'battle');
  const pauseBefore = await state();
  await page.getByRole('button', { name: '暂停战斗' }).click();
  const paused = await state();
  if (!paused.interface?.battlePaused) throw new Error(`暂停按钮未冻结战斗: ${JSON.stringify(paused.interface)}`);
  await page.waitForTimeout(350);
  const pausedAfterWait = await state();
  if (pausedAfterWait.battle.elapsed !== paused.battle.elapsed) {
    throw new Error(`暂停后战斗时间仍在推进: ${paused.battle.elapsed} -> ${pausedAfterWait.battle.elapsed}`);
  }
  await capture('autochess-battle-paused');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  const pausedMobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  if (pausedMobileOverflow > 1) throw new Error(`移动暂停界面横向溢出 ${pausedMobileOverflow}px`);
  await capture('autochess-battle-paused-mobile');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: '继续战斗' }).click();
  const resumed = await state();
  if (resumed.interface?.battlePaused) throw new Error(`继续按钮未恢复战斗: ${JSON.stringify(resumed.interface)}`);
  await page.mouse.click(20, 200);
  await page.keyboard.press('p');
  if (!(await state()).interface?.battlePaused) throw new Error('P 快捷键未暂停战斗');
  await page.keyboard.press('p');
  if ((await state()).interface?.battlePaused) throw new Error('P 快捷键未继续战斗');
  await advance(100);
  const battleStart = await state();
  await advance(1000);
  const battleEarly = await state();
  await advance(2000);
  const battleContact = await state();
  await capture('autochess-battle-early');
  await advance(300);
  const battleActive = await state();
  const feedbackSamples = [];
  for (let index = 0; index < 30; index += 1) {
    await advance(50);
    feedbackSamples.push(await state());
  }
  await capture('autochess-battle-active');

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
  await capture('autochess-result-round1');
  await clickLogical(560, 232);
  await page.waitForTimeout(100);
  const resultRound1Support = await state();
  if (resultRound1Support.battle?.ranking?.metric !== 'support') throw new Error(`结算指标切换未生效: ${JSON.stringify(resultRound1Support.battle?.ranking?.metric)}`);
  await capture('autochess-result-round1-support');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  const resultMobileBox = await canvas.boundingBox();
  if (!resultMobileBox || resultMobileBox.width < 380 || resultMobileBox.height < 700) throw new Error('结算移动端画布未填满竖屏游戏宿主');
  await capture('autochess-result-mobile');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(300);
  await clickLogical(560, 665);
  const preparationRound2 = await state();
  if (preparationRound2.phase !== 'preparation' || preparationRound2.round !== 2) {
    throw new Error(`Result continue did not reach round-2 preparation: ${JSON.stringify(preparationRound2)}`);
  }
  await capture('autochess-preparation-round2');
  await page.getByRole('button', { name: /开始战斗/ }).click();
  const resultRound2Elapsed = await advanceUntilPhase('result');
  const resultRound2 = await state();
  await advance(150);
  await capture('autochess-result-round2');
  await clickLogical(560, 665);
  const augmentRound2 = await state();
  if (augmentRound2.phase !== 'augment' || augmentRound2.round !== 2) {
    throw new Error(`Round-2 continue did not reach augment selection: ${JSON.stringify(augmentRound2)}`);
  }
  await capture('autochess-augment-round2');
  await clickLogical(245, 525);
  const preparationRound3 = await state();
  if (preparationRound3.phase !== 'preparation' || preparationRound3.round !== 3) {
    throw new Error(`Augment choice did not reach round-3 preparation: ${JSON.stringify(preparationRound3)}`);
  }
  await capture('autochess-preparation-round3');

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

  await page.setViewportSize({ width: 2560, height: 1440 });
  await page.waitForTimeout(300);
  const beforeFullscreen = await canvas.boundingBox();
  await page.locator('button:has-text("全屏游玩")').click();
  await page.waitForTimeout(500);
  const fullscreen = await page.evaluate(() => Boolean(document.fullscreenElement));
  const afterFullscreen = await canvas.boundingBox();
  const fullscreenResolution = await canvas.evaluate((element) => ({ width: element.width, height: element.height, renderScale: element.dataset.renderScale, devicePixelRatio: element.dataset.devicePixelRatio, layoutProfile: element.dataset.layoutProfile }));
  const gameHost = await canvas.evaluate((element) => {
    const host = element.parentElement?.getBoundingClientRect();
    return host && { x: host.x, y: host.y, width: host.width, height: host.height };
  });
  if (!fullscreen || !afterFullscreen || !gameHost) throw new Error('全屏或游戏宿主未正确初始化');
  if (afterFullscreen.x < gameHost.x - 1 || afterFullscreen.y < gameHost.y - 1 || afterFullscreen.x + afterFullscreen.width > gameHost.x + gameHost.width + 1 || afterFullscreen.y + afterFullscreen.height > gameHost.y + gameHost.height + 1) {
    throw new Error('全屏画布超出了工具栏后的游戏宿主');
  }
  if (fullscreenResolution.layoutProfile !== 'wide') throw new Error(`全屏未保留 wide 桌面布局: ${JSON.stringify(fullscreenResolution)}`);
  if (fullscreenResolution.width < afterFullscreen.width || fullscreenResolution.height < afterFullscreen.height) throw new Error('全屏 backing canvas 未随显示尺寸同步');
  if (fullscreenResolution.width <= 1120 || fullscreenResolution.height <= 720) throw new Error('2K 全屏 backing canvas 未提升物理分辨率');
  if (fullscreenResolution.width * fullscreenResolution.height > 8_000_000) throw new Error('全屏 backing canvas 超过像素预算');
  await capture('autochess-fullscreen');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  const mobileBox = await canvas.boundingBox();
  const canvasResolution = await canvas.evaluate((element) => ({
    width: element.width,
    height: element.height,
    renderScale: element.dataset.renderScale,
    devicePixelRatio: element.dataset.devicePixelRatio,
    layoutProfile: element.dataset.layoutProfile,
    logicalWidth: element.dataset.logicalWidth,
    logicalHeight: element.dataset.logicalHeight,
  }));
  if (!mobileBox || mobileBox.width < 380 || mobileBox.height < 700) throw new Error('移动端画布未填满工具栏下方宿主');
  const displayAspect = mobileBox.width / mobileBox.height;
  if (canvasResolution.layoutProfile !== 'compact' || canvasResolution.logicalWidth !== '1120' || canvasResolution.logicalHeight !== '720') throw new Error(`移动端未进入固定世界紧凑布局: ${JSON.stringify(canvasResolution)}`);
  await capture('autochess-mobile');

  if (errors.length) throw new Error(`浏览器控制台存在错误: ${JSON.stringify(errors)}`);
  if (failedResponses.length) throw new Error(`页面请求失败: ${JSON.stringify(failedResponses)}`);
  console.log(JSON.stringify({ initial, locked: { locked: locked.shopLocked, unlocked: unlocked.shopLocked }, purchasedCards, afterUpgrade, purchased: { board: prep.board.length, bench: prep.bench.length }, drag: { before: prep.board, after: afterDrag.board }, pause: { before: pauseBefore.battle.elapsed, paused: paused.battle.elapsed, afterWait: pausedAfterWait.battle.elapsed, resumed: resumed.interface?.battlePaused, mobileOverflow: pausedMobileOverflow }, continuation: { resultRound1Elapsed, resultRound1: { round: resultRound1.round, won: resultRound1.result?.won }, resultRound1SupportMetric: resultRound1Support.battle?.ranking?.metric, preparationRound2: { round: preparationRound2.round, phase: preparationRound2.phase }, resultRound2Elapsed, resultRound2: { round: resultRound2.round, won: resultRound2.result?.won }, augmentRound2: { round: augmentRound2.round, choices: augmentRound2.augmentChoices?.length }, preparationRound3: { round: preparationRound3.round, augments: preparationRound3.augments?.length } }, assassinFrames, clearances, feedbackSeen, fullscreen, sizes: { titleMobileBox, resultMobileBox, beforeFullscreen, afterFullscreen, fullscreenResolution, mobileBox, canvasResolution, displayAspect }, screenshots, errors, failedResponses }, null, 2));
  await browser.close();
})().catch((error) => { console.error(error); process.exit(1); });
