const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd(), path.join(os.homedir(), '.codex/skills/develop-web-game')] }));
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const base = process.env.RESET_BASE_URL || 'http://localhost:4002';
const output = path.resolve(process.env.RESET_SAVE_OUTPUT || 'tmp/reset-save-dev');
const KEY = 'reset-rush-v5', BACKUP = `${KEY}.previous`, PREFIX = `${KEY}.unread.`;
const report = { checks: [], screenshots: [], errors: [] };
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const stored = (page, key = KEY) => page.evaluate(key => localStorage.getItem(key), key);
async function loaded(page) {
  await page.waitForFunction(() => window.render_game_to_text && JSON.parse(window.render_game_to_text()).ready !== false);
}
async function capture(page, name, fullPage = true) {
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${name}: overflow`);
  const file = path.join(output, `${name}.png`);
  const pixels = inspectPng(await page.screenshot({ path: file, fullPage, animations: 'disabled' }));
  const current = await state(page);
  assert.equal(await page.locator('canvas').count(), 0, 'RESET is a DOM tabletop');
  assert.ok(await page.locator('main').isVisible());
  report.screenshots.push({ file, pixels, state: current });
}
async function seed(page, values) {
  await page.evaluate(values => {
    for (const key of Object.keys(localStorage)) if (/^reset-rush-v/.test(key)) localStorage.removeItem(key);
    for (const [key, value] of values) localStorage.setItem(key, value);
  }, values);
  await page.reload({ waitUntil: 'domcontentloaded' }); await loaded(page);
}
async function confirm(page) {
  await page.getByRole('button', { name: '确认使用并保存', exact: true }).click();
}
async function originals(page) {
  return page.evaluate(prefix => Object.keys(localStorage).filter(key => key.startsWith(prefix)).map(key => localStorage.getItem(key)), PREFIX);
}
async function run() {
  fs.mkdirSync(output, { recursive: true });
  assert.equal((await fetch(`${base}/game/reset-rush`)).status, 200, 'responsive server before browser launch');
  const E = await (await import('./tests/helpers/load-typescript-module.mjs')).loadTypescriptModule('src/components/resetRush/engine.ts');
  const browser = await chromium.launch({ channel: 'chrome', headless: process.env.HEADED !== '1', args: ['--mute-audio', '--disable-speech-api'] });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, locale: 'zh-CN', reducedMotion: 'reduce', acceptDownloads: true, hasTouch: true });
    await context.addInitScript(() => { if (window.speechSynthesis) window.speechSynthesis.speak = () => {}; });
    await context.route('**/api/record', route => route.fulfill({ json: { success: true } }));
    await context.route(/https:\/\/(pagead2\.googlesyndication\.com|hm\.baidu\.com)\//, route => route.fulfill({ body: '' }));
    const page = await context.newPage(); page.setDefaultNavigationTimeout(60000);
    page.on('pageerror', error => report.errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
    await page.goto(`${base}/game/reset-rush`, { waitUntil: 'domcontentloaded' }); await loaded(page);
    await page.locator('#reset-length').selectOption('21');
    await page.locator('#start-game').click();
    await page.getByRole('button', { name: '关闭弹窗', exact: true }).click();
    const first = await stored(page);
    await page.locator('#freelance').click();
    await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).minute === 60);
    const second = await stored(page);
    assert.notEqual(first, second); assert.equal(await stored(page, BACKUP), first);
    await page.reload({ waitUntil: 'domcontentloaded' }); await loaded(page);
    assert.equal((await state(page)).minute, 60);
    assert.equal(await stored(page), second); assert.equal(await stored(page, BACKUP), first);
    await capture(page, '01-normal-reload');
    report.checks.push('normal work and clock persist; refresh preserves the previous backup');

    const broken = '{"version":5,"day":12,"players":';
    await seed(page, [[KEY, broken], [BACKUP, second], ['reset-rush-v4', first]]);
    assert.equal((await state(page)).phase, 'intro'); assert.equal((await state(page)).storage.issue, 'damaged');
    assert.equal(await stored(page), broken);
    await capture(page, '02-damaged-save');
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: '下载原存档', exact: true }).click();
    const download = await downloadPromise, downloadPath = path.join(output, 'original.json');
    await download.saveAs(downloadPath); assert.equal(fs.readFileSync(downloadPath, 'utf8'), broken);
    await page.getByRole('button', { name: '恢复上一份可用存档', exact: true }).focus(); await page.keyboard.press('Enter');
    await page.keyboard.press('Escape'); assert.equal(await stored(page), broken);
    await page.getByRole('button', { name: '恢复上一份可用存档', exact: true }).click();
    // A failed preservation write must leave both the selected game and damaged text intact.
    await page.evaluate(prefix => {
      window.resetOriginalSet = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) { if (key.startsWith(prefix)) throw new DOMException('quota', 'QuotaExceededError'); return window.resetOriginalSet.call(this, key, value); };
    }, PREFIX);
    await confirm(page); await page.getByRole('dialog').getByRole('alert').waitFor();
    assert.equal((await state(page)).phase, 'intro'); assert.equal(await stored(page), broken);
    await capture(page, '03-recovery-write-failed', false);
    await page.evaluate(() => { Storage.prototype.setItem = window.resetOriginalSet; });
    await confirm(page);
    await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).storage.saved);
    assert.equal((await state(page)).minute, 60); assert.equal(await stored(page), second);
    assert.deepEqual(await originals(page), [broken]);
    await page.reload({ waitUntil: 'domcontentloaded' }); await loaded(page);
    assert.equal((await state(page)).minute, 60);
    report.checks.push('no silent fallback; exact download; keyboard cancel; failed recovery keeps original; retry resumes selected backup');

    const invalid = E.createGame(610, 21); invalid.players[0].energy = -1;
    const invalidRaw = JSON.stringify(invalid);
    await seed(page, [[KEY, invalidRaw], ['reset-rush-v4', '{also-broken']]);
    assert.equal(await page.getByRole('button', { name: '恢复上一份可用存档', exact: true }).count(), 0);
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await capture(page, `04-damaged-${width}`);
      for (const button of await page.getByTestId('save-notice').getByRole('button').all()) {
        const box = await button.boundingBox(); assert.ok(box && box.width > 0 && box.height >= 44 && box.x >= 0 && box.x + box.width <= width + 1);
      }
    }
    await page.locator('#reset-language').selectOption('en');
    const notice = await page.getByTestId('save-notice').innerText();
    assert.equal(/[\u3400-\u9fff]/.test(notice), false, 'English recovery translations including numbered download buttons');
    await page.getByRole('button', { name: 'Read saves again', exact: true }).click();
    assert.equal(await stored(page), invalidRaw);
    await page.locator('#start-game').click();
    await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
    await page.getByRole('button', { name: 'Replace save with current game', exact: true }).click();
    assert.equal(/[\u3400-\u9fff]/.test(await page.getByRole('dialog').innerText()), false);
    await capture(page, '05-english-replace-confirmation', false);
    await page.getByRole('button', { name: 'Keep the original for now', exact: true }).tap();
    assert.equal(await stored(page), invalidRaw);
    await page.getByRole('button', { name: 'Replace save with current game', exact: true }).click();
    await page.getByRole('button', { name: 'Use this game and save', exact: true }).click();
    await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).storage.saved);
    assert.ok((await originals(page)).includes(invalidRaw));
    assert.ok((await originals(page)).includes('{also-broken'));
    report.checks.push('invalid structured saves and multiple originals; 320/390px; bilingual notices/dialogs; cancelled and explicit current-game replacement');

    await page.locator('#reset-language').selectOption('zh'); await page.setViewportSize({ width: 1440, height: 960 });
    const old = await stored(page);
    await page.getByRole('button', { name: '重新开局', exact: true }).click();
    await page.getByRole('button', { name: '回到准备页', exact: true }).click();
    assert.equal(await stored(page), old);
    await page.reload({ waitUntil: 'domcontentloaded' }); await loaded(page);
    assert.equal(await stored(page), old); assert.equal((await state(page)).phase, 'plan');
    await page.evaluate(key => {
      window.resetOriginalSet = Storage.prototype.setItem;
      Storage.prototype.setItem = function(k, value) { if (k.startsWith(key)) throw new DOMException('quota', 'QuotaExceededError'); return window.resetOriginalSet.call(this, k, value); };
    }, KEY);
    await page.getByRole('button', { name: '重新开局', exact: true }).click();
    await page.getByRole('button', { name: '回到准备页', exact: true }).click();
    await page.locator('#reset-length').selectOption('21');
    await page.locator('#start-game').click(); await page.getByRole('button', { name: '关闭弹窗', exact: true }).click();
    await page.locator('#freelance').click();
    await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).minute === 60 && !JSON.parse(window.render_game_to_text()).storage.saved);
    assert.equal(await stored(page), old);
    const currentDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: '下载当前牌局', exact: true }).click();
    const currentFile = path.join(output, 'current.json'); await (await currentDownload).saveAs(currentFile);
    assert.equal(JSON.parse(fs.readFileSync(currentFile, 'utf8')).minute, 60);
    await capture(page, '06-new-game-write-denied');
    await page.evaluate(() => { Storage.prototype.setItem = window.resetOriginalSet; });
    await page.getByRole('button', { name: '重试保存', exact: true }).click();
    assert.equal((await state(page)).storage.saved, true);
    assert.equal(await stored(page, BACKUP), old);
    await page.reload({ waitUntil: 'domcontentloaded' }); await loaded(page);
    assert.equal((await state(page)).minute, 60);
    report.checks.push('restart staging keeps old game on reload; failed new-game autosave preserves it; playable progress download and retry');

    // Exercise actual public controls through an entire short season after recovery.
    for (let day = 1; day <= 21; day++) {
      await page.locator('#end-day').click(); await page.locator('#confirm-end-day').click();
      assert.equal((await state(page)).phase, 'reveal');
      await page.locator('#next-day').click();
    }
    assert.equal((await state(page)).phase, 'over');
    const completed = await stored(page);
    await page.reload({ waitUntil: 'domcontentloaded' }); await loaded(page);
    assert.equal((await state(page)).phase, 'over'); assert.equal(await stored(page), completed);
    await capture(page, '07-completed-season');
    report.checks.push('recovered play completes 21 days through public controls and restores final result');

    const denied = await context.newPage(); denied.on('pageerror', error => report.errors.push(error.message));
    await denied.addInitScript(() => {
      window.resetOriginalGet = Storage.prototype.getItem;
      Storage.prototype.getItem = function(key) { if (/^reset-rush-v/.test(key)) throw new DOMException('denied', 'SecurityError'); return window.resetOriginalGet.call(this, key); };
    });
    await denied.goto(`${base}/game/reset-rush`, { waitUntil: 'domcontentloaded' }); await loaded(denied);
    assert.equal((await state(denied)).storage.issue, 'unavailable');
    await denied.getByRole('button', { name: '重新读取存档', exact: true }).click();
    assert.equal((await state(denied)).storage.issue, 'unavailable');
    await denied.locator('#start-game').click(); await denied.getByRole('button', { name: '关闭弹窗', exact: true }).click();
    await denied.locator('#freelance').click(); assert.equal((await state(denied)).minute, 60);
    await capture(denied, '08-storage-unavailable');
    await denied.evaluate(() => { Storage.prototype.getItem = window.resetOriginalGet; });
    await denied.getByRole('button', { name: '重试保存', exact: true }).click();
    assert.equal((await state(denied)).storage.saved, true);
    await denied.close();
    report.checks.push('unavailable reads can retry; in-memory play survives and saves when access returns');
    assert.deepEqual(report.errors, []);
    console.log(JSON.stringify({ checks: report.checks, screenshots: report.screenshots.map(s => s.file), errors: report.errors }, null, 2));
  } finally {
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    await browser.close();
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
