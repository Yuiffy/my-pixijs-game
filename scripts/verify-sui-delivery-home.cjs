const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd(), path.join(require('node:os').homedir(), '.codex/skills/develop-web-game')] }));
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const model = require('./lib/sui-delivery-model.cjs');
const pilot = require('./lib/sui-delivery-campaign-pilot.cjs');
const base = process.env.DELIVERY_BASE_URL || 'http://127.0.0.1:4138';
const out = process.env.DELIVERY_QA_DIR || '.tmp/sui-delivery/home';
const report = { errors: [], captures: [], checks: [] };
const portraits = new Set();
const state = p => p.evaluate(() => JSON.parse(window.render_game_to_text()));
async function prepare(ctx) {
  await ctx.addInitScript(() => { if (window.speechSynthesis) window.speechSynthesis.speak = () => {}; });
  await ctx.route(/https:\/\/(pagead2\.googlesyndication\.com|hm\.baidu\.com)\//, r => r.fulfill({ body: '' }));
  await ctx.route(/\/api\/(record|demos\/visits)(\?|$)/, r => r.fulfill({ json: { success: true, count: 0 } }));
  ctx.on('page', p => {
    p.on('pageerror', e => report.errors.push(e.message));
    p.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
    p.on('response', r => {
      if (r.url().includes('/portraits/minimal/')) portraits.add(r.url());
      if (r.status() >= 400 && r.url().startsWith(base)) report.errors.push(`HTTP ${r.status()} ${r.url()}`);
    });
  });
}
async function ready(p) {
  await p.waitForFunction(() => !!window.deliveryTest && !!document.querySelector('canvas') && Array.from(document.querySelectorAll('button')).some(b => !b.disabled && /接下第一单|继续这趟配送|接下一单|回到春日餐会/.test(b.textContent)));
  await p.evaluate(() => window.deliveryTest.manual(true));
}
async function boot(p) {
  await p.goto(`${base}/game/sui-spring?test=1`);
  await ready(p);
}
async function capture(p, name) {
  await p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  const dom = await p.evaluate(() => {
    const c = document.querySelector('canvas'); const b = c.getBoundingClientRect();
    return { width: c.width, height: c.height, box: b.toJSON(), count: document.querySelectorAll('canvas').length, innerWidth, innerHeight, scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight, text: document.body.innerText };
  });
  assert.equal(dom.count, 1); assert.ok(dom.box.width > 0 && dom.box.height > 0);
  assert.ok(Math.abs(dom.width / dom.height - dom.box.width / dom.box.height) < 0.015);
  assert.ok(dom.scrollWidth <= dom.innerWidth + 1 && dom.scrollHeight <= dom.innerHeight + 1);
  const file = path.join(out, `${name}.png`);
  const pixels = inspectPng(await p.screenshot({ path: file, fullPage: true, animations: 'disabled' }));
  report.captures.push({ name, file, pixels, dom, state: await state(p) });
}
async function replay(p, run, names = []) {
  let frame = 0;
  for (const mark of run.milestones) {
    await p.evaluate(tape => window.deliveryTest.replay(tape), run.tape.slice(frame, mark.frame)); frame = mark.frame;
    const actual = await state(p);
    assert.equal(actual.order, mark.state.order); assert.equal(actual.phase, mark.state.phase, mark.name);
    assert.ok(Math.abs(actual.player.x - mark.state.player.x) < 0.01, mark.name); assert.ok(Math.abs(actual.player.y - mark.state.player.y) < 0.01, mark.name);
    assert.equal(actual.player.health, 3, mark.name); assert.equal(actual.deaths, 0, mark.name);
    if (names.includes(mark.name)) await capture(p, `${actual.order}-${mark.name}`);
  }
}
async function home(p) {
  await p.getByRole('button', { name: '小馆', exact: true }).click();
  await p.getByRole('heading', { name: '小馆里，慢慢热闹起来', exact: true }).waitFor();
}
async function decorate(p, id, action) {
  const item = model.HOME_DECORATIONS.find(v => v.id === id);
  await p.getByRole('button', { name: action === 'buy' ? `${item.price} 零钱 · 添置${item.name}` : `${action}${item.name}`, exact: true }).click();
}
async function close(p) { await p.getByRole('button', { name: '关闭面板', exact: true }).click(); }
(async () => {
  assert.equal((await fetch(`${base}/game/sui-spring`, { signal: AbortSignal.timeout(60000) })).status, 200);
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: process.env.DELIVERY_HEADED !== '1', args: ['--mute-audio', '--disable-speech-api'] });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); await prepare(ctx);
    const p = await ctx.newPage(); await boot(p); await home(p);
    assert.equal(await p.locator('[data-decoration]').count(), 0);
    assert.equal(await p.locator('[data-keepsake]').count(), 0);
    for (const item of model.HOME_DECORATIONS) assert.equal(await p.getByRole('button', { name: `${item.price} 零钱 · 添置${item.name}`, exact: true }).isDisabled(), true);
    await capture(p, 'fresh-kitchen'); await p.keyboard.press('Escape'); assert.equal((await state(p)).phase, 'title');
    await p.getByRole('button', { name: /^接下第一单/ }).click();
    const started = await state(p); await home(p);
    await p.evaluate(() => { window.deliveryTest.input({ right: true, jump: true }); window.advanceTime(10000); });
    const paused = await state(p); assert.equal(paused.phase, 'paused');
    for (const key of ['player', 'elapsed', 'carrying', 'checkpoint']) assert.deepEqual(paused[key], started[key], key);
    await p.keyboard.press('Escape'); assert.equal((await state(p)).phase, 'playing');
    const runs = pilot.campaign(); let spent = 0;
    const purchases = { 0: 'red-cloth', 2: 'menu-board', 5: 'warm-lights', 7: 'herb-shelf' };
    for (let i = 0; i < runs.length; i++) {
      if (i) await p.getByRole('button', { name: `下一单 · ${model.LEVELS[i].title} →`, exact: true }).click();
      await replay(p, runs[i], i === 0 ? ['repairer-kindness'] : []);
      const expected = runs[i].milestones.at(-1).state.save;
      assert.deepEqual((await state(p)).save.delivered, expected.delivered);
      assert.equal((await state(p)).save.money, expected.money - spent);
      if (purchases[i]) {
        const id = purchases[i]; const price = model.HOME_DECORATIONS.find(v => v.id === id).price;
        await p.getByRole('button', { name: '回小馆看看', exact: true }).click(); await decorate(p, id, 'buy'); spent += price;
        assert.equal((await state(p)).save.money, expected.money - spent);
        assert.equal(await p.locator(`[data-decoration="${id}"]`).count(), 1);
        if (i === 0) {
          await p.getByRole('button', { name: '听小绿说话', exact: true }).click();
          assert.match(await p.locator('blockquote').innerText(), /花盆/); await capture(p, 'first-gift-and-cloth');
          await decorate(p, id, '收起'); assert.equal(await p.locator(`[data-decoration="${id}"]`).count(), 0);
          await decorate(p, id, '摆上'); assert.equal((await state(p)).save.money, expected.money - spent);
        }
        if (i === 2) await capture(p, 'photo-and-menu');
        if (i === 7) {
          await p.getByRole('button', { name: '听小绿说话', exact: true }).click();
          assert.match(await p.locator('blockquote').innerText(), /种子/); await capture(p, 'greenhouse-herbs');
        }
        await close(p); assert.equal((await state(p)).phase, 'delivered');
      }
    }
    report.checks.push('fresh twelve-order public-input campaign; four real UI purchases cost 180, retain the original movement, and remain deducted through every later order; actual story gifts and changing resident lines');
    await p.getByRole('button', { name: '回小馆看看', exact: true }).click();
    assert.equal(await p.locator('[data-decoration]').count(), 4);
    for (const v of ['flowers', 'photo', 'bowl', 'cat']) assert.equal(await p.locator(`[data-keepsake="${v}"]`).count(), 1);
    for (const name of ['小绿', '帕可', '栞栞', '露医生', '货运员', '又一']) {
      const b = p.getByRole('button', { name: `听${name}说话`, exact: true }); await b.click(); assert.equal(await b.getAttribute('aria-pressed'), 'true');
    }
    await capture(p, 'finished-home'); await decorate(p, 'warm-lights', '收起');
    const stored = structuredClone((await state(p)).save); await p.reload(); await ready(p);
    assert.equal((await state(p)).save.money, stored.money); assert.deepEqual((await state(p)).save.home, stored.home); await home(p);
    assert.equal(await p.locator('[data-decoration="warm-lights"]').count(), 0); await capture(p, 'stored-lights-reload');
    await decorate(p, 'warm-lights', '摆上'); const finalSave = structuredClone((await state(p)).save);
    assert.equal(finalSave.money, stored.money);
    const dialog = p.getByRole('dialog'); const focusables = dialog.locator('button:not([disabled]),a[href]');
    await focusables.last().focus(); await p.keyboard.press('Tab'); assert.equal(await focusables.first().evaluate(e => e === document.activeElement), true);
    await p.keyboard.press('Shift+Tab'); assert.equal(await focusables.last().evaluate(e => e === document.activeElement), true);
    await p.keyboard.press('Escape'); assert.equal(await p.getByRole('dialog').count(), 0);
    await p.getByRole('button', { name: '订单', exact: true }).click();
    await p.getByRole('button', { name: new RegExp(model.LEVELS[0].title) }).click(); await capture(p, 'decorated-playable-kitchen');
    const beforePause = await state(p); await home(p); await p.evaluate(() => window.advanceTime(10000)); const afterPause = await state(p);
    for (const key of ['player', 'elapsed', 'carrying', 'checkpoint']) assert.deepEqual(afterPause[key], beforePause[key], key);
    await close(p); await p.evaluate(() => window.advanceTime(16)); assert.ok(Math.abs((await state(p)).player.x - beforePause.player.x) < 0.01);
    await p.getByRole('button', { name: '订单', exact: true }).click(); await p.getByRole('button', { name: '回到春日餐会', exact: true }).click();
    assert.equal((await state(p)).theater.seated, true); assert.equal((await state(p)).save.money, finalSave.money); assert.equal((await state(p)).save.resume, null);
    await capture(p, 'paid-home-communal-meal');
    report.checks.push('free store/place; immediate save and reload preserve balance and furniture; all six actual met residents; title/receipt/playing panel entry, game clock/input freeze, Escape and focus wrap; purchased art appears at the playable first kitchen; completed meal revisits never refund spending');
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }); await prepare(phone);
    await phone.addInitScript(({ key, raw, origin }) => { if (location.origin === origin && !localStorage.getItem(key)) localStorage.setItem(key, raw); }, { key: model.SAVE_KEY, raw: JSON.stringify(finalSave), origin: base });
    const q = await phone.newPage(); await boot(q); await home(q); await capture(q, 'portrait-room');
    await decorate(q, 'red-cloth', '收起'); assert.equal((await state(q)).save.money, finalSave.money); await capture(q, 'portrait-shop');
    await q.getByRole('button', { name: '听露医生说话', exact: true }).tap(); await capture(q, 'portrait-neighbors');
    await q.setViewportSize({ width: 320, height: 740 }); await decorate(q, 'red-cloth', '摆上'); await capture(q, 'narrow-shop');
    await q.getByRole('button', { name: '听帕可说话', exact: true }).tap(); await capture(q, 'narrow-neighbors');
    await q.setViewportSize({ width: 844, height: 390 }); await q.getByRole('heading', { name: '小馆里，慢慢热闹起来', exact: true }).scrollIntoViewIfNeeded(); await capture(q, 'landscape-room');
    await decorate(q, 'menu-board', '收起'); await capture(q, 'landscape-shop');
    await close(q); await q.getByRole('button', { name: /^回到春日餐会/ }).tap(); assert.equal((await state(q)).theater.seated, true);
    assert.equal((await state(q)).save.money, finalSave.money); await phone.close();
    report.checks.push('390px and 320px portrait plus 844x390 landscape: room, scrollable shop, actual touch purchases/toggles and resident selection, close and rejoin meal, no page overflow');
    assert.ok([...portraits].some(url => url.includes('shiori.png')));
    assert.ok(![...portraits].some(url => url.includes('komichi')));
    report.checks.push('first encountered repairer is Shiori: actual first-order sidequest capture, later home portrait and photo, no Komichi portrait requested');
    assert.deepEqual(report.errors, []); report.passed = true;
  } finally { await browser.close(); fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); }
  console.log(JSON.stringify({ passed: report.passed, screenshots: report.captures.length, errors: report.errors, checks: report.checks, out }));
})().catch(e => { console.error(e); process.exitCode = 1; });
