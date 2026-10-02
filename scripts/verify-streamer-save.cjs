const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd(), path.join(require('node:os').homedir(), '.codex/skills/develop-web-game')] }));
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const base = process.env.STREAMER_BASE_URL || 'http://localhost:3962';
const output = process.env.STREAMER_QA_DIR || 'tmp/streamer-save-dev';
const errors = [], screenshots = [], scenarios = [];
fs.mkdirSync(output, { recursive: true });
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const snapshot = page => page.evaluate(() => ['streamer-run-v1', 'streamer-run-backup-v1', 'streamer-career-v1'].map(key => localStorage.getItem(key)));
const open = async (page, query = '') => {
  await page.goto(`${base}/game/streamer${query}`, { waitUntil: 'networkidle' });
  await page.getByTestId('start-stream').waitFor();
  await page.waitForFunction(() => !document.querySelector('[data-testid="start-stream"]').disabled);
};
const upload = async (page, data) => {
  const chooser = page.waitForEvent('filechooser');
  const scope = await page.getByRole('dialog').count() ? page.getByRole('dialog') : page;
  await scope.getByTestId('import-save').click();
  await (await chooser).setFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(data) });
};
const capture = async (page, name) => {
  await page.evaluate(() => document.fonts.ready);
  const dom = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, text: document.querySelector('main').innerText, canvases: [...document.querySelectorAll('canvas')].map(c => [c.width, c.height]) }));
  assert.ok(dom.scrollWidth <= dom.width + 1);
  const file = path.join(output, `${name}.png`);
  const pixels = inspectPng(await page.screenshot({ path: file, fullPage: true, animations: 'disabled' }));
  screenshots.push({ file, pixels, dom, state: await state(page) });
};
(async () => {
  assert.equal((await fetch(`${base}/game/streamer`, { signal: AbortSignal.timeout(60000) })).status, 200);
  const browser = await chromium.launch({ channel: 'chrome', headless: !process.env.HEADED, args: ['--mute-audio', '--disable-speech-api'] });
  const context = async (options = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce', acceptDownloads: true, ...options });
    await ctx.addInitScript(() => { if (window.speechSynthesis) window.speechSynthesis.speak = () => {}; });
    await ctx.route('**/api/record', r => r.fulfill({ json: { success: true } }));
    await ctx.route(/https:\/\/(pagead2\.googlesyndication\.com|hm\.baidu\.com)\//, r => r.fulfill({ body: '' }));
    ctx.on('page', page => {
      page.on('pageerror', e => errors.push(e.message));
      page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    });
    return ctx;
  };
  let passed = false;
  try {
    const ctx = await context(), page = await ctx.newPage();
    await open(page, '?seed=321');
    await page.getByTestId('mode-cozy').click();
    await page.getByTestId('start-stream').click();
    await page.getByTestId(`topic-${(await state(page)).topicOptions[0]}`).click();
    const original = JSON.parse((await snapshot(page))[0]);
    await open(page);
    const before = await snapshot(page);
    await page.getByLabel('同局种子', { exact: true }).fill('654');
    await page.getByTestId('start-stream').click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    assert.equal(await page.evaluate(() => document.activeElement.dataset.testid), 'cancel-save-dialog');
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.testid), 'confirm-new-stream');
    await capture(page, '01-overwrite-confirmation');
    await page.keyboard.press('Escape');
    assert.deepEqual(await snapshot(page), before);
    await page.getByTestId('start-stream').click();
    await page.getByTestId('cancel-save-dialog').click();
    assert.deepEqual(await snapshot(page), before);
    await page.getByTestId('start-stream').click();
    await page.getByTestId('confirm-new-stream').click();
    assert.equal((await state(page)).seed, 654);
    scenarios.push('unfinished run: explicit overwrite, Escape/cancel leave exact storage bytes unchanged, focus trap');

    // Restore a known checkpoint and damage the latest save using the browser's real storage.
    await page.evaluate(run => { localStorage.setItem('streamer-run-backup-v1', JSON.stringify(run)); localStorage.setItem('streamer-run-v1', '{'); }, original);
    await open(page, '?seed=987');
    assert.equal(await page.getByLabel('同局种子', { exact: true }).inputValue(), '987');
    assert.match(await page.locator('main').innerText(), /已找回上一份有效进度/);
    await capture(page, '02-recovered-checkpoint');
    await page.getByTestId('resume-stream').click();
    assert.deepEqual(JSON.parse((await snapshot(page))[0]), original);
    await page.getByTestId('pause-stream').click();
    const downloaded = page.waitForEvent('download');
    await page.getByRole('dialog').getByTestId('export-save').click();
    const download = await downloaded;
    const file = path.join(output, download.suggestedFilename());
    await download.saveAs(file);
    const archiveText = fs.readFileSync(file, 'utf8');
    assert.deepEqual(JSON.parse(archiveText).run, original);
    scenarios.push('corrupt primary recovers prior state; query seed survives; real JSON download preserves full run');

    const phoneCtx = await context({ viewport: { width: 320, height: 740 }, isMobile: true, hasTouch: true });
    const phone = await phoneCtx.newPage();
    await open(phone, '?seed=999');
    await phone.getByTestId('start-stream').tap();
    await phone.getByTestId('pause-stream').tap();
    const frozen = await state(phone), phoneBytes = await snapshot(phone);
    await upload(phone, archiveText);
    await phone.getByRole('dialog').waitFor();
    await phone.evaluate(() => window.advanceTime(90000));
    assert.deepEqual(await state(phone), frozen);
    await capture(phone, '03-import-mobile-320');
    await phone.getByTestId('cancel-save-dialog').tap();
    assert.deepEqual(await snapshot(phone), phoneBytes);
    await upload(phone, archiveText);
    await phone.getByTestId('confirm-import-save').tap();
    assert.equal((await state(phone)).phase, 'lobby');
    await phone.getByTestId('resume-stream').tap();
    assert.deepEqual(JSON.parse((await snapshot(phone))[0]), original);
    await phone.getByTestId('pause-stream').tap();
    const stable = await snapshot(phone);
    await upload(phone, '{');
    await phone.getByRole('dialog').getByText('文件不是有效的 JSON 存档', { exact: true }).waitFor({ state: 'visible' });
    assert.deepEqual(await snapshot(phone), stable);
    await upload(phone, ' '.repeat(256 * 1024 + 1));
    await phone.getByRole('dialog').getByText('存档文件过大（最多 256 KB）', { exact: true }).waitFor({ state: 'visible' });
    assert.deepEqual(await snapshot(phone), stable);
    await capture(phone, '05-import-error-mobile-320');
    scenarios.push('320px touch: import review/cancel/confirm, timer freeze, exact cross-device resume, malformed and oversized rejection');

    await page.evaluate(() => { localStorage.setItem('streamer-run-v1', '{'); localStorage.setItem('streamer-run-backup-v1', '{'); });
    await open(page, '?seed=987');
    assert.equal(await page.getByLabel('同局种子', { exact: true }).inputValue(), '987');
    assert.match(await page.locator('main').innerText(), /本机存档已损坏/);
    assert.doesNotMatch(await page.locator('main').innerText(), /当前浏览器无法保存进度/);
    await page.getByTestId('start-stream').click();
    for (let i = 0; i < 30 && (await state(page)).phase !== 'ended'; i++) await page.evaluate(() => window.advanceTime(60000));
    assert.equal((await state(page)).phase, 'ended');
    await page.getByRole('button', { name: '回到开播准备', exact: true }).click();
    const endedDownload = page.waitForEvent('download');
    await page.getByTestId('export-save').click();
    const endedPath = path.join(output, 'ended-save.json');
    await (await endedDownload).saveAs(endedPath);
    const endedArchive = fs.readFileSync(endedPath, 'utf8');
    const count = JSON.parse((await snapshot(page))[2]).runs;
    for (let i = 0; i < 2; i++) {
      await upload(page, endedArchive);
      await page.getByTestId('confirm-import-save').click();
      await page.getByTestId('resume-stream').click();
      assert.equal(JSON.parse((await snapshot(page))[2]).runs, count);
      await page.getByRole('button', { name: '回到开播准备', exact: true }).click();
    }
    await open(page);
    await page.getByTestId('resume-stream').click();
    assert.equal(JSON.parse((await snapshot(page))[2]).runs, count);
    scenarios.push('both saves corrupt: truthful notice and seed parsing; repeated ended imports/reload never duplicate career');

    const deniedCtx = await context({ viewport: { width: 390, height: 844 } });
    await deniedCtx.addInitScript(() => {
      const get = Storage.prototype.getItem, set = Storage.prototype.setItem;
      Storage.prototype.getItem = function(key) { if (key.startsWith('streamer-')) throw new DOMException('QA denied', 'SecurityError'); return get.call(this, key); };
      Storage.prototype.setItem = function(key, value) { if (key.startsWith('streamer-')) throw new DOMException('QA denied', 'SecurityError'); return set.call(this, key, value); };
    });
    const denied = await deniedCtx.newPage();
    await open(denied, '?seed=555');
    assert.equal(await denied.getByLabel('同局种子', { exact: true }).inputValue(), '555');
    await upload(denied, archiveText);
    await denied.getByTestId('confirm-import-save').click();
    await denied.getByTestId('resume-stream').click();
    assert.equal((await state(denied)).activeTopic, original.state.activeTopic);
    assert.match(await denied.locator('main').innerText(), /当前浏览器无法保存进度/);
    await capture(denied, '04-storage-denied-mobile-390');
    scenarios.push('storage denied: imports remain playable in memory with an explicit backup notice');
    assert.deepEqual(errors, []);
    passed = true;
  } finally {
    fs.writeFileSync(path.join(output, 'save-report.json'), JSON.stringify({ passed, scenarios, screenshots, errors }, null, 2));
    await browser.close();
  }
  console.log(JSON.stringify({ passed, scenarios, screenshots: screenshots.map(s => s.file), errors }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
