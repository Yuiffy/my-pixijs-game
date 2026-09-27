const assert = require('node:assert/strict');
const { mkdirSync } = require('node:fs');
const { join } = require('node:path');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');

const { chromium } = (() => {
  for (const candidate of [
    process.env.PLAYWRIGHT_MODULE,
    'playwright',
    'C:/Users/yuiffy/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright',
  ]) {
    if (!candidate) continue;
    try { return require(candidate); } catch { /* Try the next installed copy. */ }
  }
  throw new Error('Playwright is required to verify game sharing');
})();
const baseUrl = process.env.GAME_SHARE_BASE_URL || 'http://127.0.0.1:4319';
const artifactDirectory = '.tmp/game-share';
mkdirSync(artifactDirectory, { recursive: true });

async function capture(page, name) {
  let lastError;
  for (const fullPage of [false, true]) {
    const buffer = await page.screenshot({
      path: join(artifactDirectory, `${name}.png`),
      fullPage,
    });
    try {
      return inspectPng(buffer);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

function initBrowserMocks({ mobile = false } = {}) {
  Object.defineProperty(window.speechSynthesis, 'speak', { configurable: true, value: () => {} });
  window.__copyCalls = [];
  window.__shareCalls = [];
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: async (value) => { window.__copyCalls.push(value); } },
  });
  if (mobile) {
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (value) => { window.__shareCalls.push(value); },
    });
  }
}

async function main() {
  const response = await fetch(`${baseUrl}/game/autochess`);
  assert.equal(response.status, 200, 'target server must respond before Chrome starts');

  const browser = await chromium.launch({
    channel: 'chrome',
    headless: process.env.GAME_SHARE_HEADED !== '1',
    args: ['--mute-audio'],
  });
  const errors = [];
  const recordFailure = (response) => {
    if (response.status() >= 400 && !response.url().includes('/api/record')) {
      errors.push(`${response.status()} ${response.url()}`);
    }
  };
  const recordConsoleError = (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) {
      errors.push(message.text());
    }
  };
  try {
    const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await desktop.addInitScript(initBrowserMocks);
    const page = await desktop.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('response', recordFailure);
    page.on('console', recordConsoleError);

    await page.goto(`${baseUrl}/game/autochess?seed=1`);
    const shareButton = page.getByRole('button', { name: '分享游戏' });
    await shareButton.waitFor();
    await page.locator('[data-game-canvas="rift-line"]').waitFor();
    await page.waitForFunction(() => Boolean(window.render_game_to_text));
    await page.waitForFunction(() => {
      const portraits = [...document.querySelectorAll('.rift-dom-choice img')];
      return portraits.length === 3 && portraits.every((portrait) => portrait.complete && portrait.naturalWidth > 0);
    });
    const gameState = await page.evaluate(() => ({
      text: window.render_game_to_text?.(),
      canvas: (() => {
        const canvas = document.querySelector('[data-game-canvas="rift-line"]');
        return canvas ? { width: canvas.width, height: canvas.height } : null;
      })(),
    }));
    assert.ok(gameState.text, 'autochess text state should be available');
    assert.ok(gameState.canvas?.width > 0 && gameState.canvas.height > 0, 'autochess canvas should be sized');
    const autochessDesktop = await capture(page, 'autochess-desktop');
    await shareButton.click();
    const desktopCopy = await page.evaluate(() => window.__copyCalls.at(-1));
    assert.equal(desktopCopy, `【维阿自走棋：裂隙阵线】购买 VR 和 PSP 成员棋子，组建队伍、凑齐羁绊、安排站位，挑战一轮比一轮更强的敌人！ ${baseUrl}/game/autochess?seed=1`);
    assert.equal(await page.getByRole('status').textContent(), '分享文案已复制');

    await page.getByRole('button', { name: '全屏游玩' }).click();
    await page.waitForFunction(() => Boolean(document.fullscreenElement));
    assert.equal(await page.evaluate(() => document.fullscreenElement.contains(document.querySelector('button[aria-label="分享游戏"]'))), true);
    await shareButton.click();
    assert.equal(await page.evaluate(() => window.__copyCalls.length), 2);
    await page.evaluate(() => document.exitFullscreen());

    await page.setViewportSize({ width: 390, height: 844 });
    const autochessMobile = await capture(page, 'autochess-mobile');
    const buttonBounds = await shareButton.boundingBox();
    assert.ok(buttonBounds && buttonBounds.x >= 0 && buttonBounds.y >= 0);
    assert.ok(buttonBounds.x + buttonBounds.width <= 390 && buttonBounds.y + buttonBounds.height <= 844);
    const autochessHeaderBounds = await page.locator('.rift-dom-header').boundingBox();
    assert.ok(autochessHeaderBounds && buttonBounds.y >= autochessHeaderBounds.y && buttonBounds.y + buttonBounds.height <= autochessHeaderBounds.y + autochessHeaderBounds.height);

    await page.goto(`${baseUrl}/game/pinglu-canal`);
    await shareButton.waitFor();
    await page.waitForFunction(() => Boolean(window.render_game_to_text));
    await page.waitForFunction(() => {
      const canvas = document.querySelector('canvas');
      return canvas && canvas.width > 0 && canvas.height > 0;
    });
    const pingluState = await page.evaluate(() => window.render_game_to_text?.());
    assert.ok(pingluState, 'pinglu game text state should be available');
    const pingluMobile = await capture(page, 'pinglu-mobile');
    const pingluHeader = await page.locator('header').first().boundingBox();
    const pingluButton = await shareButton.boundingBox();
    assert.ok(pingluHeader && pingluButton && pingluButton.y + pingluButton.height <= pingluHeader.y + pingluHeader.height);
    await shareButton.click();
    const pingluCopy = await page.evaluate(() => window.__copyCalls.at(-1));
    assert.match(pingluCopy, /^【平陆运河：造山移海】逐格炸山、拓河、疏浚/);

    const mobile = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
    });
    await mobile.addInitScript(initBrowserMocks, { mobile: true });
    const mobilePage = await mobile.newPage();
    mobilePage.on('pageerror', (error) => errors.push(error.message));
    mobilePage.on('response', recordFailure);
    mobilePage.on('console', recordConsoleError);
    await mobilePage.goto(`${baseUrl}/game/snack?from=share-test`);
    const mobileButton = mobilePage.getByRole('button', { name: '分享游戏' });
    await mobileButton.waitFor();
    const snackMobile = await capture(mobilePage, 'snack-mobile');
    const snackHeader = await mobilePage.locator('header').first().boundingBox();
    const snackButton = await mobileButton.boundingBox();
    assert.ok(snackHeader && snackButton && snackButton.y + snackButton.height <= snackHeader.y + snackHeader.height);
    await mobileButton.click();
    const sharePayload = await mobilePage.evaluate(() => window.__shareCalls.at(-1));
    assert.deepEqual(sharePayload, {
      title: '主播，别嚼了！',
      text: '【主播，别嚼了！】一边聊天一边偷偷吃零食，别让麦克风和观众发现。',
      url: `${baseUrl}/game/snack?from=share-test`,
    });
    assert.equal(await mobilePage.evaluate(() => window.__copyCalls.length), 0);

    await mobilePage.evaluate(() => {
      Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    });
    await mobileButton.click();
    const fallbackCopy = await mobilePage.evaluate(() => window.__copyCalls.at(-1));
    assert.equal(fallbackCopy, `${sharePayload.text} ${sharePayload.url}`);

    await mobilePage.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async () => { throw new Error('clipboard unavailable'); } },
      });
    });
    await mobileButton.click();
    const fallbackText = await mobilePage.getByRole('textbox', { name: /分享文案/ }).inputValue();
    assert.equal(fallbackText, fallbackCopy);
    const fallbackMobile = await capture(mobilePage, 'snack-fallback-mobile');

    const routes = [
      'agi', 'brick-excavation', 'button', 'fab', 'family-pressure', 'flick-chess',
      'hush-live', 'hype-harbor', 'jumpone', 'night-rain', 'one-more', 'pre-stream',
      'reset-rush', 'rpg', 'streamer', 'wuxia',
    ];
    const routeScreenshots = {};
    for (const route of routes) {
      await page.goto(`${baseUrl}/game/${route}`, { waitUntil: 'domcontentloaded' });
      const button = page.getByRole('button', { name: '分享游戏' });
      await button.waitFor({ timeout: 30000 });
      assert.equal(await button.count(), 1, `${route} share button count`);
      const bounds = await button.boundingBox();
      assert.ok(bounds && bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= 390, `${route} share button in viewport`);
      assert.equal(await page.evaluate(({ x, y, width, height }) => {
        const target = document.elementFromPoint(x + width / 2, y + height / 2);
        return Boolean(target?.closest('button[aria-label="分享游戏"]'));
      }, bounds), true, `${route} share button receives input`);
      if (['family-pressure', 'flick-chess', 'hype-harbor', 'night-rain', 'wuxia'].includes(route)) {
        await page.waitForTimeout(350);
        routeScreenshots[route] = await capture(page, `${route}-mobile`);
      }
    }

    await page.setViewportSize({ width: 360, height: 800 });
    const narrowScreenshots = {};
    for (const route of routes) {
      await page.goto(`${baseUrl}/game/${route}`, { waitUntil: 'domcontentloaded' });
      const button = page.getByRole('button', { name: '分享游戏' });
      await button.waitFor({ timeout: 30000 });
      const bounds = await button.boundingBox();
      assert.ok(bounds && bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= 360, `${route} narrow share button in viewport`);
      assert.equal(await page.evaluate(({ x, y, width, height }) => {
        const target = document.elementFromPoint(x + width / 2, y + height / 2);
        return Boolean(target?.closest('button[aria-label="分享游戏"]'));
      }, bounds), true, `${route} narrow share button receives input`);
      if (['flick-chess', 'hype-harbor'].includes(route)) {
        narrowScreenshots[route] = await capture(page, `${route}-narrow`);
      }
    }

    assert.deepEqual(errors, [], `browser errors: ${errors.join('; ')}`);
    console.log(JSON.stringify({
      gameState: JSON.parse(gameState.text).phase,
      screenshots: { autochessDesktop, autochessMobile, pingluMobile, snackMobile, fallbackMobile },
      clipboard: 'passed',
      mobileShare: 'passed',
      fallback: 'passed',
      routeCoverage: routes.length + 3,
      routeScreenshots,
      narrowScreenshots,
    }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
