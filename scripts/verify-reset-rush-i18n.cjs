const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || require.resolve('playwright', { paths: [process.cwd(), path.join(os.homedir(), '.codex', 'skills', 'develop-web-game')] }));
const { inspectPng } = require('./lib/autochess-screenshot.cjs');

const base = process.env.RESET_BASE_URL || 'http://127.0.0.1:3891';
const output = path.resolve('tmp/reset-rush-i18n-verify');
fs.mkdirSync(output, { recursive: true });

async function untranslated(page) {
  return page.evaluate(() => {
    const results = [];
    const walker = document.createTreeWalker(document.querySelector('main'), NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.parentElement?.closest('[role="group"][aria-label="Language"]')) continue;
      const value = node.textContent.trim();
      if (/[\u3400-\u9fff]/.test(value)) results.push(value);
    }
    for (const element of document.querySelectorAll('main [title], main [aria-label]')) {
      for (const name of ['title', 'aria-label']) {
        const value = element.getAttribute(name);
        if (value && /[\u3400-\u9fff]/.test(value)) results.push(`${name}: ${value}`);
      }
    }
    return [...new Set(results)];
  });
}

async function capture(page, name, fullPage = true) {
  await page.evaluate(() => document.fonts.ready);
  const png = await page.screenshot({ path: path.join(output, `${name}.png`), fullPage, animations: 'disabled' });
  const result = {
    name,
    pixels: inspectPng(png),
    untranslated: await untranslated(page),
    overflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
  };
  assert.deepEqual(result.untranslated, [], `${name}: untranslated text`);
  assert.equal(result.overflow, false, `${name}: horizontal overflow`);
  return result;
}

async function assertMobileLayout(page) {
  const overlaps = await page.evaluate(() => {
    const intersects = (first, second) => first.left < second.right - 1 && first.right > second.left + 1
      && first.top < second.bottom - 1 && first.bottom > second.top + 1;
    const issues = [];
    const logo = document.querySelector('header [class*="logo"]');
    const actions = document.querySelector('header [class*="headerActions"]');
    if (intersects(logo.getBoundingClientRect(), actions.getBoundingClientRect())) issues.push('header logo/actions');
    for (const [index, card] of [...document.querySelectorAll('[class*="players"] > button')].entries()) {
      const name = card.querySelector('[class*="playerName"]');
      const numbers = card.querySelector('[class*="playerNumbers"]');
      if (intersects(name.getBoundingClientRect(), numbers.getBoundingClientRect())) issues.push(`player ${index} name/numbers`);
    }
    return issues;
  });
  assert.deepEqual(overlaps, [], `${page.viewportSize().width}px: overlapping controls`);
}

(async () => {
  assert.equal((await fetch(`${base}/game/reset-rush`)).status, 200);
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--disable-features=SpeechSynthesis'] });
  const errors = [];
  const screenshots = [];
  try {
    const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
    await context.addInitScript(() => { if (window.speechSynthesis) window.speechSynthesis.speak = () => {}; });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${base}/game/reset-rush`, { waitUntil: 'networkidle' });
    await page.locator('main[lang="en"]').waitFor();
    screenshots.push(await capture(page, 'desktop-intro-en'));
    await page.locator('header').getByRole('button', { name: /Rules/ }).click();
    screenshots.push(await capture(page, 'desktop-rules-en'));
    await page.locator('dialog button[aria-label="Close dialog"]').click();
    await page.locator('#start-game').click();
    await page.locator('dialog[open]').waitFor();
    screenshots.push(await capture(page, 'desktop-accounts-en'));
    await page.locator('dialog button[aria-label="Close dialog"]').click();
    screenshots.push(await capture(page, 'desktop-game-en'));
    await page.locator('#reset-project-settings summary').click();
    screenshots.push(await capture(page, 'desktop-project-settings-en'));
    await page.locator('#reset-project-settings summary').click();
    await page.locator('summary').filter({ hasText: 'Usage observations' }).click();
    screenshots.push(await capture(page, 'desktop-account-usage-en'));
    await page.locator('summary').filter({ hasText: 'Usage observations' }).click();
    await page.locator('#next-node').click();
    screenshots.push(await capture(page, 'desktop-progress-en'));
    await page.locator('summary').filter({ hasText: 'Development log' }).click();
    screenshots.push(await capture(page, 'desktop-log-en'));
    await page.locator('summary').filter({ hasText: 'Development log' }).click();
    await page.locator('#end-day').click();
    screenshots.push(await capture(page, 'desktop-finish-en'));
    await page.locator('#confirm-end-day').click();
    screenshots.push(await capture(page, 'desktop-reveal-en'));
    await page.locator('#next-day').click();
    await page.locator('main').getByRole('button', { name: /View You/ }).first().click();
    assert.equal(await page.locator('dialog h2').innerText(), 'Your portfolio');
    screenshots.push(await capture(page, 'desktop-portfolio-en'));
    await page.locator('dialog button[aria-label="Close dialog"]').click();
    await page.getByRole('button', { name: 'Share game' }).click();
    await page.locator('header [role="status"]').filter({ hasText: /Share text copied|Copy failed/ }).waitFor();
    const savedBeforeSwitch = await page.evaluate(() => localStorage.getItem('reset-rush-v5'));
    await page.getByRole('button', { name: '中', exact: true }).click();
    assert.equal(await page.locator('main').getAttribute('lang'), 'zh-CN');
    assert.equal(await page.locator('header [role="status"]').innerText(), '');
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.locator('main').getAttribute('lang'), 'zh-CN');
    assert.equal(await page.evaluate(() => localStorage.getItem('reset-rush-v5')), savedBeforeSwitch);
    await page.getByRole('button', { name: 'EN', exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    screenshots.push(await capture(page, 'mobile-game-en'));
    await assertMobileLayout(page);
    await page.setViewportSize({ width: 320, height: 720 });
    screenshots.push(await capture(page, 'small-mobile-game-en', false));
    await assertMobileLayout(page);
    await page.locator('[class*="players"]').evaluate((element) => window.scrollTo(0, element.getBoundingClientRect().top + scrollY - 160));
    screenshots.push(await capture(page, 'small-mobile-players-en', false));
    const chineseContext = await browser.newContext({ locale: 'zh-CN', viewport: { width: 390, height: 844 } });
    const chinesePage = await chineseContext.newPage();
    await chinesePage.goto(`${base}/game/reset-rush`, { waitUntil: 'networkidle' });
    await chinesePage.locator('main[lang="zh-CN"]').waitFor();
    assert.match(await chinesePage.locator('h1').first().innerText(), /还没用完/);
    console.log(JSON.stringify({ screenshots, errors }, null, 2));
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
