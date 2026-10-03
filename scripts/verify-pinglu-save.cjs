const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd(), path.join(os.homedir(), '.codex/skills/develop-web-game')] }));
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const url = process.env.PINGLU_URL || 'http://localhost:3990/game/pinglu-canal';
const output = path.resolve(process.env.PINGLU_SAVE_OUTPUT || 'tmp/pinglu-save-dev');
fs.mkdirSync(output, { recursive: true });
const KEY = 'pinglu-geography-v3', BACKUP = `${KEY}-backup`, RAW = `${KEY}-unreadable`;
const state = p => p.evaluate(() => JSON.parse(window.render_game_to_text()));
const read = (p, key = KEY) => p.evaluate(k => localStorage.getItem(k), key);
const errors = [], shots = [], checks = [];
async function capture(p, name) {
  const metrics = inspectPng(await p.screenshot({ path: path.join(output, `${name}.png`), fullPage: true, animations: 'disabled' }));
  const canvas = await p.locator('canvas').evaluate(c => ({ width: c.width, height: c.height, display: [c.clientWidth, c.clientHeight] }));
  assert.ok(canvas.width > 0 && canvas.height > 0 && canvas.display.every(n => n > 0));
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal overflow');
  const s = await state(p); shots.push({ name, metrics, canvas, state: { ...s, plots: undefined } });
}
async function loaded(p) {
  await p.waitForFunction(() => window.render_game_to_text && JSON.parse(window.render_game_to_text()).save.loaded);
  await p.locator('canvas').waitFor();
}
async function choose(p, id) {
  if (!await p.locator('#terrain-row').isVisible()) await p.getByText('坐标选择与其他操作', { exact: true }).click();
  await p.locator('#terrain-row').selectOption(String(Math.floor(id / 48)));
  await p.locator('#terrain-column').fill(String(id % 48 + 1));
  await p.getByRole('button', { name: '选中', exact: true }).click();
}
async function work(p) { await p.getByRole('button', { name: '开始施工 →', exact: true }).click(); }
async function reloadWith(p, primary, backup = null) {
  await p.evaluate(({ primary, backup, KEY, BACKUP }) => {
    if (primary === null) localStorage.removeItem(KEY); else localStorage.setItem(KEY, primary);
    if (backup === null) localStorage.removeItem(BACKUP); else localStorage.setItem(BACKUP, backup);
  }, { primary, backup, KEY, BACKUP });
  await p.reload({ waitUntil: 'domcontentloaded' }); await loaded(p);
}
(async () => {
  assert.equal((await fetch(url)).status, 200);
  const browser = await chromium.launch({ channel: 'chrome', headless: process.env.HEADED !== '1', args: ['--mute-audio', '--disable-speech-api'] });
  try {
    const context = await browser.newContext({ viewport: { width: 1360, height: 900 }, reducedMotion: 'reduce', acceptDownloads: true });
    await context.addInitScript(() => { if (window.speechSynthesis) window.speechSynthesis.speak = () => {}; });
    await context.route('**/api/record', r => r.fulfill({ json: { success: true } }));
    await context.route(/https:\/\/(pagead2\.googlesyndication\.com|hm\.baidu\.com)\//, r => r.fulfill({ body: '' }));
    const p = await context.newPage(); p.setDefaultNavigationTimeout(60000);
    p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await p.goto(url, { waitUntil: 'domcontentloaded' }); await loaded(p);
    const initial = await state(p);
    let source, target;
    for (const plot of initial.plots.filter(plot => plot.farm && !plot.wet && plot.height < plot.fillTarget)) {
      const n = initial.plots.find(n => !n.wet && !n.farm && n.height >= n.waterLevel + 7 && Math.abs(n.id % 48 - plot.id % 48) + Math.abs(Math.floor(n.id / 48) - Math.floor(plot.id / 48)) === 1);
      if (n) { source = n.id; target = plot.id; break; }
    }
    assert.notEqual(source, undefined);
    await choose(p, source); await work(p); const first = await read(p);
    await work(p); const second = await read(p);
    assert.notEqual(first, second); assert.equal(await read(p, BACKUP), first);
    await p.reload({ waitUntil: 'domcontentloaded' }); await loaded(p);
    assert.equal(await read(p), second); assert.equal(await read(p, BACKUP), first, 'reload keeps older backup');
    assert.equal((await state(p)).moves, 2); await capture(p, '01-restored-work');
    checks.push('paid earthworks persist terrain, cash and soil; refresh does not rotate backup');

    await reloadWith(p, '{broken', first);
    await p.getByRole('dialog', { name: '工程存档恢复' }).waitFor();
    assert.equal((await state(p)).moves, 0); assert.equal(await read(p), '{broken');
    await capture(p, '02-recovery');
    const downloadWait = p.waitForEvent('download');
    await p.getByRole('button', { name: '下载原存档' }).click();
    const download = await downloadWait; const file = path.join(output, 'unreadable.json'); await download.saveAs(file);
    assert.equal(fs.readFileSync(file, 'utf8'), '{broken');
    await p.getByRole('button', { name: '另开新工程', exact: true }).click();
    await p.keyboard.press('Escape'); await p.getByRole('dialog', { name: '工程存档恢复' }).waitFor();
    assert.equal(await read(p), '{broken', 'cancel new game preserves primary');
    await p.getByRole('button', { name: '恢复上次有效工程 →', exact: true }).focus(); await p.keyboard.press('Enter');
    await p.waitForFunction(() => !JSON.parse(window.render_game_to_text()).save.recoveryPending);
    assert.equal((await state(p)).moves, 1); assert.equal(await read(p), first); assert.equal(await read(p, RAW), '{broken');
    await choose(p, source); await work(p); assert.equal((await state(p)).moves, 2);
    await capture(p, '03-resumed');
    checks.push('recovery suspends writes, downloads exact bytes, cancelled reset preserves state, keyboard recovery resumes construction');

    const invalid = JSON.parse(second); invalid.players[0].name = { broken: true };
    const invalidRaw = JSON.stringify(invalid);
    await reloadWith(p, invalidRaw);
    assert.equal((await state(p)).save.recoveryPending, true); assert.equal((await state(p)).save.backupAvailable, false);
    assert.equal(await read(p), invalidRaw);
    await p.reload({ waitUntil: 'domcontentloaded' }); await loaded(p); assert.equal(await read(p), invalidRaw);
    for (const [width, height] of [[320, 740], [390, 844], [844, 390]]) {
      await p.setViewportSize({ width, height });
      await capture(p, `04-invalid-${width}`);
      for (const button of await p.getByRole('dialog').getByRole('button').all()) {
        await button.scrollIntoViewIfNeeded(); const b = await button.boundingBox();
        assert.ok(b && b.x >= 0 && b.x + b.width <= width + 1 && b.y >= 0 && b.y + b.height <= height + 1);
      }
    }
    await p.getByRole('button', { name: '另开新工程', exact: true }).click();
    await p.getByRole('button', { name: '重置工程，进场 →', exact: true }).click();
    assert.equal((await state(p)).save.recoveryPending, false); assert.equal(await read(p, RAW), invalidRaw);
    checks.push('invalid structured save no longer crashes; repeated refresh preserves it; narrow recovery and explicit new game');

    await p.setViewportSize({ width: 1360, height: 900 });
    await reloadWith(p, null, second);
    assert.equal((await state(p)).save.backupAvailable, true);
    await p.getByRole('button', { name: '恢复上次有效工程 →', exact: true }).click();
    assert.equal((await state(p)).moves, 2);
    // Test write denial at the real browser Storage boundary, then retry it.
    await p.evaluate(() => {
      window.restoreStorageWrites = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) { if (key.startsWith('pinglu-geography-v3')) throw new DOMException('quota', 'QuotaExceededError'); return window.restoreStorageWrites.call(this, key, value); };
    });
    await choose(p, source); await work(p);
    assert.equal((await state(p)).moves, 3); assert.equal(await read(p), second);
    assert.ok((await state(p)).save.notice);
    await p.getByRole('button', { name: '重试保存' }).scrollIntoViewIfNeeded(); await capture(p, '05-write-denied');
    await p.evaluate(() => { Storage.prototype.setItem = window.restoreStorageWrites; });
    await p.getByRole('button', { name: '重试保存' }).click(); assert.equal((await state(p)).save.notice, '');
    await p.reload({ waitUntil: 'domcontentloaded' }); await loaded(p); assert.equal((await state(p)).moves, 3);
    checks.push('missing primary recovery, quota failure keeps old save and in-memory work, retry survives reload');

    // Continue actual soil transport after recovery, using public coordinates and controls.
    await choose(p, target); await p.getByRole('button', { name: /⇢\s*运土/ }).click();
    const beforeHaul = await state(p); assert.equal(beforeHaul.quote.error, null); await p.getByRole('button', { name: '发车，运土回填 →', exact: true }).click();
    const hauled = await state(p); assert.equal(hauled.last.tool, 'haul'); assert.ok(hauled.last.units > 0);
    assert.ok(hauled.plots[target].height > beforeHaul.plots[target].height);
    const haulRaw = await read(p); await p.reload({ waitUntil: 'domcontentloaded' }); await loaded(p);
    assert.equal(await read(p), haulRaw); assert.equal((await state(p)).last.tool, 'haul'); await capture(p, '06-haul-restored');
    checks.push('recovered soil can be hauled, raising real terrain; material provenance and paid haul restore');
    // Refusing browser storage must still allow an in-memory match.
    const denied = await context.newPage();
    denied.on('pageerror', e => errors.push(e.message));
    await denied.addInitScript(() => {
      const get = Storage.prototype.getItem, set = Storage.prototype.setItem;
      Storage.prototype.getItem = function (key) { if (key.startsWith('pinglu-')) throw new DOMException('denied', 'SecurityError'); return get.call(this, key); };
      Storage.prototype.setItem = function (key, value) { if (key.startsWith('pinglu-')) throw new DOMException('denied', 'SecurityError'); return set.call(this, key, value); };
    });
    await denied.goto(url, { waitUntil: 'domcontentloaded' }); await loaded(denied);
    assert.ok((await state(denied)).save.notice);
    await denied.getByRole('button', { name: /申请拨款/ }).click();
    assert.equal((await state(denied)).moves, 1);
    await denied.getByRole('button', { name: '重试保存' }).scrollIntoViewIfNeeded();
    await capture(denied, '07-storage-unavailable');
    await denied.close();
    checks.push('blocked browser storage still allows in-memory play with a persistent save warning');
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ checks, screenshots: shots.map(s => s.name), errors }, null, 2));
  } finally {
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ checks, screenshots: shots, errors }, null, 2));
    await browser.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
