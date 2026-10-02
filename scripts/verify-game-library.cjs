const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd(), path.join(os.homedir(), '.codex/skills/develop-web-game')] }));
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const url = process.env.LIBRARY_URL || 'http://localhost:3955/demos';
const output = path.resolve(process.env.LIBRARY_OUTPUT || 'tmp/game-library-qa');
fs.mkdirSync(output, { recursive: true });
const errors = []; const checks = []; const screenshots = []; const networkFailures = [];
const games = page => page.locator('[data-game]');
const paths = page => games(page).evaluateAll(items => items.map(item => item.dataset.game));
async function waitFor(page, callback) { await page.waitForFunction(callback); }
async function capture(page, name) {
  await page.locator('#games').scrollIntoViewIfNeeded();
  await page.evaluate(() => (innerWidth < 760 ? document.querySelector('#game-search').closest('label') : document.querySelector('#games')).scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(700);
  const image = await page.screenshot({ path: path.join(output, `${name}.png`), animations: 'disabled' });
  screenshots.push({ name, metrics: inspectPng(image), games: await paths(page) });
}
function observe(page) {
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(`${message.text()} @ ${message.location().url}`); });
  page.on('response', response => { if (response.status() >= 400) networkFailures.push({ url: response.url(), status: response.status() }); });
}
async function quietExternalScripts(context) {
  // Production ads and third-party analytics are outside this local UI check.
  // Fulfill rather than abort so their network lifetime cannot hold networkidle open.
  await context.route(/https:\/\/(pagead2\.googlesyndication\.com|hm\.baidu\.com)\//, route => route.fulfill({ contentType: 'application/javascript', body: '' }));
}
(async () => {
  assert.equal((await fetch(url)).status, 200, 'server responds before browser launch');
  const browser = await chromium.launch({ channel: 'chrome', headless: process.env.HEADED !== '1', args: ['--mute-audio', '--disable-speech-api'] });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await quietExternalScripts(context);
    await context.addInitScript(() => { if (window.speechSynthesis) window.speechSynthesis.speak = () => {}; });
    const page = await context.newPage(); observe(page);
    let reports = 0;
    page.on('request', request => { if (request.url().endsWith('/api/record')) reports++; });
    await page.goto(url, { waitUntil: 'networkidle' });
    const total = await games(page).count(); assert.ok(total >= 22);
    await capture(page, '01-desktop-library');
    const baselineReports = reports;
    await page.getByRole('searchbox', { name: '搜索游戏' }).fill('  ｒｅｓｅｔ ');
    assert.deepEqual(await paths(page), ['/game/reset-rush']);
    await page.getByRole('searchbox').fill('排球 栞栞');
    assert.deepEqual(await paths(page), ['/game/beach-volley']);
    await page.getByRole('button', { name: '经营与策略', exact: true }).click();
    assert.equal(await games(page).count(), 0);
    await capture(page, '02-empty-search');
    await page.getByRole('button', { name: '重置筛选', exact: true }).click();
    assert.equal(await games(page).count(), total);
    await page.getByRole('button', { name: '收藏 晴海双打 · 岁己 × 栞栞', exact: true }).click();
    assert.equal(new URL(page.url()).pathname, '/demos', 'favorite is separate from the game link');
    await page.getByRole('button', { name: /^我的收藏/ }).click();
    assert.deepEqual(await paths(page), ['/game/beach-volley']);
    await capture(page, '03-favorite');
    await page.waitForTimeout(300);
    assert.equal(reports, baselineReports, 'filter changes do not count as page visits');
    await page.reload({ waitUntil: 'networkidle' });
    await waitFor(page, () => document.querySelectorAll('[data-game]').length === 1);
    assert.equal(await page.getByRole('button', { name: /^我的收藏/ }).getAttribute('aria-pressed'), 'true');
    assert.equal(await page.getByRole('button', { name: /^取消收藏 晴海/ }).getAttribute('aria-pressed'), 'true');
    const other = await context.newPage(); observe(other);
    await other.goto(url, { waitUntil: 'networkidle' });
    await other.getByRole('button', { name: '收藏 维阿发掘局', exact: true }).click();
    await waitFor(page, () => document.querySelectorAll('[data-game]').length === 2);
    await other.close();
    await page.getByRole('button', { name: '取消收藏 晴海双打 · 岁己 × 栞栞', exact: true }).click();
    assert.deepEqual(await paths(page), ['/game/brick-excavation']);
    checks.push('search normalization and multiword intersection; category/empty/reset; favorite persistence and cross-tab sync; analytics not inflated');

    await page.getByRole('link', { name: '打开 维阿发掘局', exact: true }).click();
    await page.waitForURL('**/game/brick-excavation');
    await waitFor(page, () => JSON.parse(localStorage.getItem('sui-game-library-v1')).recent[0]?.href === '/game/brick-excavation');
    await page.goBack({ waitUntil: 'networkidle' });
    await waitFor(page, () => document.querySelector('button[aria-label="取消收藏 维阿发掘局"]'));
    await page.getByRole('button', { name: /^最近打开/ }).click();
    assert.deepEqual(await paths(page), ['/game/brick-excavation']);
    await capture(page, '04-recent');
    await page.getByRole('button', { name: '清空打开记录', exact: true }).click();
    assert.equal(await games(page).count(), 0);
    await page.getByRole('button', { name: /^我的收藏/ }).click();
    assert.deepEqual(await paths(page), ['/game/brick-excavation'], 'clearing recents preserves favorites');
    await page.getByRole('button', { name: '重置筛选', exact: true }).click();
    await page.getByLabel('排序', { exact: true }).selectOption('updated');
    assert.ok(['/game/beach-volley', '/game/golden-needle'].includes((await paths(page))[0]));
    await page.getByRole('searchbox').fill('排球');
    await page.waitForURL(current => current.searchParams.get('q') === '排球');
    const sharedUrl = page.url();
    await page.goto(`${url}?q=自走棋#games`, { waitUntil: 'networkidle' });
    await waitFor(page, () => document.querySelector('#game-search').value === '自走棋');
    assert.deepEqual(await paths(page), ['/game/autochess']);
    await page.goBack({ waitUntil: 'networkidle' });
    assert.equal(page.url(), sharedUrl);
    assert.equal(await page.getByRole('searchbox').inputValue(), '排球');
    assert.deepEqual(await paths(page), ['/game/beach-volley']);
    checks.push('actual game navigation recorded; back restores filters; clear history preserves favorites; sort and shareable links');

    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await page.getByRole('button', { name: '重置筛选', exact: true }).click();
      await page.getByRole('searchbox').fill('排球');
      assert.deepEqual(await paths(page), ['/game/beach-volley']);
      await page.getByRole('button', { name: /^收藏 晴海/ }).click();
      await page.getByRole('button', { name: /^取消收藏 晴海/ }).click();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}px does not overflow`);
      await capture(page, `05-mobile-${width}`);
    }
    await page.getByRole('searchbox').focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'game-sort');
    await page.keyboard.press('Tab');
    assert.match(await page.evaluate(() => document.activeElement.textContent), /全部游戏/);
    checks.push('390/320px search, touch-sized favorite controls, no overflow, keyboard focus order');

    const blocked = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', isMobile: true, hasTouch: true });
    await quietExternalScripts(blocked);
    await blocked.addInitScript(() => {
      if (window.speechSynthesis) window.speechSynthesis.speak = () => {};
      Storage.prototype.getItem = () => { throw new DOMException('Disabled', 'SecurityError'); };
      Storage.prototype.setItem = () => { throw new DOMException('Disabled', 'SecurityError'); };
    });
    const privatePage = await blocked.newPage(); observe(privatePage);
    await privatePage.goto(`${url}?q=排球#games`, { waitUntil: 'networkidle' });
    await privatePage.getByRole('button', { name: /^收藏 晴海/ }).tap();
    assert.equal(await privatePage.getByRole('button', { name: /^取消收藏 晴海/ }).getAttribute('aria-pressed'), 'true');
    assert.ok(await privatePage.getByText('浏览器未允许保存，收藏仅在本次页面中保留。', { exact: true }).isVisible());
    await capture(privatePage, '06-storage-disabled');
    await privatePage.getByRole('button', { name: /^取消收藏 晴海/ }).tap();
    await blocked.close();
    checks.push('denied browser storage remains usable with honest persistence notice; reduced motion');
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.route('**/knight', route => route.fulfill({ contentType: 'text/html', body: '<p>Independent game boundary</p>' }));
    await page.getByRole('link', { name: '打开 Knight：空洞搜打撤', exact: true }).click();
    await page.waitForURL('**/knight');
    await page.goto(`${url}?shelf=recent#games`, { waitUntil: 'networkidle' });
    await waitFor(page, () => document.querySelector('[data-game="/knight"]'));
    assert.deepEqual(await paths(page), ['/knight']);
    checks.push('independently hosted game launch recorded at the catalog link boundary (destination stubbed)');
    assert.deepEqual(errors, [], 'no page/console errors');
    console.log(JSON.stringify({ checks, total, screenshots: screenshots.map(item => item.name), errors }, null, 2));
  } finally {
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ checks, screenshots, errors, networkFailures }, null, 2));
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
