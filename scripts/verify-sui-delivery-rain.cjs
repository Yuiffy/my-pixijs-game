const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd(), path.join(require('node:os').homedir(), '.codex/skills/develop-web-game')] }));
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const model = require('./lib/sui-delivery-model.cjs');
const pilot = require('./lib/sui-delivery-campaign-pilot.cjs');
const rainPilot = require('./lib/sui-delivery-rain-pilot.cjs');
const base = process.env.DELIVERY_BASE_URL || 'http://127.0.0.1:4138';
const out = process.env.DELIVERY_QA_DIR || '.tmp/sui-delivery/rain';
const report = { errors: [], captures: [], checks: [] };
const state = p => p.evaluate(() => JSON.parse(window.render_game_to_text()));
async function prepare(ctx) {
  await ctx.addInitScript(() => { if (window.speechSynthesis) window.speechSynthesis.speak = () => {}; });
  await ctx.route(/https:\/\/(pagead2\.googlesyndication\.com|hm\.baidu\.com)\//, r => r.fulfill({ body: '' }));
  await ctx.route(/\/api\/(record|demos\/visits)(\?|$)/, r => r.fulfill({ json: { success: true, count: 0 } }));
  ctx.on('page', p => {
    p.on('pageerror', e => report.errors.push(e.message));
    p.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
    p.on('response', r => { if (r.status() >= 400 && r.url().startsWith(base)) report.errors.push(`HTTP ${r.status()} ${r.url()}`); });
  });
}
async function boot(p) {
  await p.goto(`${base}/game/sui-spring?test=1`);
  await p.waitForFunction(() => !!window.deliveryTest && !Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('正在准备早餐')));
  await p.evaluate(() => window.deliveryTest.manual(true));
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
async function saveContext(browser, raw, viewport = { width: 390, height: 844 }) {
  const ctx = await browser.newContext({ viewport, hasTouch: true, isMobile: true }); await prepare(ctx);
  await ctx.addInitScript(({ key, raw, origin }) => { if (location.origin === origin && !localStorage.getItem(key)) localStorage.setItem(key, raw); }, { key: model.SAVE_KEY, raw: JSON.stringify(raw), origin: base });
  const page = await ctx.newPage(); await boot(page); await page.getByRole('button', { name: /^继续这趟配送/ }).tap();
  return { ctx, page };
}
(async () => {
  assert.equal((await fetch(`${base}/game/sui-spring`, { signal: AbortSignal.timeout(60000) })).status, 200);
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: process.env.DELIVERY_HEADED !== '1', args: ['--mute-audio', '--disable-speech-api'] });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } }); await prepare(ctx);
    const p = await ctx.newPage(); await boot(p); await p.getByRole('button', { name: /^接下第一单/ }).click();
    const runs = pilot.campaign().slice(0, 9);
    const selected = {
      'rain-relay': ['safe-porch', 'canopy-open-1', 'first-awning', 'first-balcony', 'canopy-open-2', 'canopy-warning', 'canopy-folded', 'canopy-reopened', 'second-awning', 'steam-dash-3', 'last-roof', 'delivered'],
      'greenhouse-dinner': ['inlet-open', 'water-lift-rider', 'water-lift-high', 'flower-route-open', 'flower-bank', 'delivered'],
      'bird-supper': ['swoop-warning', 'bird-rest', 'steam-dash-1', 'third-roof', 'nest-roof', 'ribbon-returned', 'delivered'],
    };
    for (let i = 0; i < runs.length; i++) {
      if (i) await p.getByRole('button', { name: `下一单 · ${model.LEVELS[i].title} →`, exact: true }).click();
      await replay(p, runs[i], selected[model.LEVELS[i].id] || []);
      assert.deepEqual((await state(p)).save.delivered, model.LEVELS.slice(0, i + 1).map(v => v.id));
    }
    report.checks.push('nine connected fresh-save orders using public controls; rain hooks, steam dashes, water lift, flower beds and recovered ribbon');
    const saved = (await state(p)).save;
    await p.getByRole('button', { name: '再跑一次 · 趁热送达', exact: true }).click();
    assert.deepEqual((await state(p)).switches, []);
    await replay(p, rainPilot.bird(saved, 'hot')); assert.ok((await state(p)).save.records['bird-supper'].medal);
    assert.equal((await state(p)).save.money, saved.money); report.checks.push('bird hot replay requires the ribbon again and pays no duplicate money');
    await p.getByRole('button', { name: '订单', exact: true }).click(); await capture(p, 'nine-orders');
    for (const [name, order, mark] of [
      ['rain-resume', 6, 'canopy-open-2'], ['greenhouse-resume', 7, 'water-lift-rider'], ['bird-resume', 8, 'ribbon-returned'],
    ]) {
      const checkpointSave = runs[order].milestones.find(m => m.name === mark).state.save;
      const { ctx: phone, page: q } = await saveContext(browser, checkpointSave);
      await q.keyboard.press('KeyR'); await q.evaluate(() => window.advanceTime(16));
      const actual = await state(q); assert.equal(actual.carrying, true); assert.deepEqual(actual.switches, checkpointSave.resume.switches);
      await capture(q, name);
      if (name === 'rain-resume') {
        await q.setViewportSize({ width: 844, height: 390 });
        const cdp = await phone.newCDPSession(q);
        const point = async label => { const b = await q.getByRole('button', { name: label, exact: true }).boundingBox(); assert.ok(b && b.width >= 44 && b.height >= 44); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
        const right = await point('向右'); const jump = await point('跳跃'); const dash = await point('蒸汽冲刺');
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...right, id: 1 }, { ...jump, id: 2 }] }); await q.evaluate(() => window.advanceTime(200));
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...right, id: 1 }, { ...jump, id: 2 }, { ...dash, id: 3 }] }); await q.evaluate(() => window.advanceTime(50));
        assert.ok((await state(q)).player.dash > 0); await capture(q, 'touch-steam-dash');
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] }); await q.evaluate(() => window.advanceTime(25));
        assert.equal((await state(q)).player.dashHeld, false); assert.equal((await state(q)).player.jumpHeld, false);
        await q.setViewportSize({ width: 320, height: 760 }); await capture(q, 'narrow-seven-buttons');
        await q.getByRole('button', { name: '整备', exact: true }).tap(); await capture(q, 'steam-equipment');
      }
      await phone.close();
    }
    report.checks.push('actual checkpoint saves restore canopy hooks, reachable lift and recovered ribbon on portrait touch Chrome; retry preserves meal; three-touch dash and cancel; all seven buttons fit 320px');
    assert.deepEqual(report.errors, []); report.passed = true;
  } finally { await browser.close(); fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); }
  console.log(JSON.stringify({ passed: report.passed, screenshots: report.captures.length, errors: report.errors, checks: report.checks, out }));
})().catch(e => { console.error(e); process.exitCode = 1; });
