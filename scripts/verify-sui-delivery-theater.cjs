const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd(), path.join(require('node:os').homedir(), '.codex/skills/develop-web-game')] }));
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const model = require('./lib/sui-delivery-model.cjs');
const pilot = require('./lib/sui-delivery-campaign-pilot.cjs');
const theaterPilot = require('./lib/sui-delivery-theater-pilot.cjs');
const base = process.env.DELIVERY_BASE_URL || 'http://127.0.0.1:4138';
const out = process.env.DELIVERY_QA_DIR || '.tmp/sui-delivery/theater';
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
    const runs = pilot.campaign();
    const selected = {
      'greenhouse-dinner': ['water-lift-high'],
      'scenery-lifts': ['first-rope-open', 'stage-lift-1-rider', 'stage-lift-1-high', 'lift-descent-warning', 'lift-descending-rider', 'lift-returned-low', 'low-beam-gallery', 'stage-lift-2-rider', 'stage-lift-2-high', 'stage-bell-reflection', 'scenery-bridge', 'delivered'],
      'last-table': ['first-basket-served', 'curtain-bridge', 'spring-launch', 'steam-1', 'long-table-landing', 'delivered'],
      'banquet-machine': ['machine-observation', 'banquet-heat-reflection', 'banquet-lift-rider', 'banquet-lift-high', 'crank-stopped', 'steam-1', 'crown-deck', 'crown-warning', 'crown-open', 'crown-stopped', 'table-before-serving', 'banquet-served', 'reserved-seat', 'delivered'],
    };
    for (let i = 0; i < runs.length; i++) {
      if (i) await p.getByRole('button', { name: `下一单 · ${model.LEVELS[i].title} →`, exact: true }).click();
      await replay(p, runs[i], selected[model.LEVELS[i].id] || []);
      assert.deepEqual((await state(p)).save.delivered, model.LEVELS.slice(0, i + 1).map(v => v.id));
    }
    const saved = (await state(p)).save;
    assert.equal((await state(p)).theater.seated, true); assert.equal(saved.resume, null);
    await p.getByRole('button', { name: '留在餐桌旁', exact: true }).click(); await p.evaluate(() => window.advanceTime(30)); await capture(p, 'communal-meal');
    await p.keyboard.press('KeyE'); await p.evaluate(() => window.advanceTime(20));
    // Keyboard events are released before stepping in manual mode; use the public input hook for held frames.
    await p.evaluate(() => window.deliveryTest.input({ interact: true })); await p.evaluate(() => window.advanceTime(20));
    assert.equal((await state(p)).theater.seated, false);
    await p.evaluate(() => window.deliveryTest.input({})); await p.evaluate(() => window.advanceTime(20));
    await p.evaluate(() => window.deliveryTest.input({ interact: true })); await p.evaluate(() => window.advanceTime(20));
    assert.equal((await state(p)).theater.seated, true); assert.equal((await state(p)).save.money, saved.money);
    report.checks.push('twelve fresh-save public-input orders; real pulley riders, served basket/curtain, sequential heat/crank/crown, meal placed then seated ending; stand and sit without payment');
    await p.getByRole('button', { name: '订单', exact: true }).click(); await capture(p, 'twelve-orders');
    await p.getByRole('button', { name: '回到春日餐会', exact: true }).click(); assert.equal((await state(p)).theater.seated, true);
    const storage = await p.evaluate(key => JSON.parse(localStorage.getItem(key)), model.SAVE_KEY); assert.equal(storage.resume, null);
    await p.reload(); await p.waitForFunction(() => !!window.deliveryTest && !Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('正在准备早餐'))); await p.evaluate(() => window.deliveryTest.manual(true));
    await p.getByRole('button', { name: /^回到春日餐会/ }).click(); assert.equal((await state(p)).theater.seated, true); await capture(p, 'ending-reload');
    for (const [name, order, mark] of [
      ['scenery-resume', 9, 'second-rope-open'], ['table-resume', 10, 'first-basket-served'], ['crank-resume', 11, 'crank-stopped'], ['served-resume', 11, 'banquet-served'],
    ]) {
      const checkpointSave = runs[order].milestones.find(m => m.name === mark).state.save;
      const { ctx: phone, page: q } = await saveContext(browser, checkpointSave);
      await q.keyboard.press('KeyR'); await q.evaluate(() => window.advanceTime(16));
      const actual = await state(q); assert.equal(actual.carrying, true); assert.deepEqual([...actual.switches].sort(), [...checkpointSave.resume.switches].sort()); assert.equal(actual.theater.seated, false);
      if (name === 'scenery-resume') assert.equal(actual.theater.lifts['stage-lift-2'].y, 540);
      await capture(q, name); await phone.close();
    }
    const finalPhone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }); await prepare(finalPhone);
    await finalPhone.addInitScript(({ key, raw, origin }) => { if (location.origin === origin && !localStorage.getItem(key)) localStorage.setItem(key, raw); }, { key: model.SAVE_KEY, raw: JSON.stringify(saved), origin: base });
    const q = await finalPhone.newPage(); await boot(q); await q.getByRole('button', { name: /^回到春日餐会/ }).tap(); await capture(q, 'portrait-communal-meal');
    await q.setViewportSize({ width: 844, height: 390 }); await capture(q, 'landscape-communal-meal');
    await finalPhone.close();
    for (const [id, route] of [['scenery-lifts', theaterPilot.scenery], ['last-table', theaterPilot.lastTable], ['banquet-machine', theaterPilot.banquet]]) {
      await p.getByRole('button', { name: '订单', exact: true }).click(); await p.getByRole('button', { name: new RegExp(model.LEVELS.find(v => v.id === id).title) }).click();
      // Open practice from the equipment panel, then start the optional full route from its receipt.
      const storyRun = route(saved); await replay(p, storyRun);
      await p.getByRole('button', { name: '再跑一次 · 趁热送达', exact: true }).click(); assert.deepEqual((await state(p)).switches, []);
      await replay(p, route(saved, 'hot')); assert.ok((await state(p)).save.records[id].medal); assert.equal((await state(p)).save.money, saved.money);
      await capture(p, `${id}-hot`);
    }
    report.checks.push('actual theater checkpoint saves on portrait Chrome preserve ropes, served basket and partial machine; retry keeps reachable lift; completed ending reload and portrait/landscape meal; three hot replays reset mechanisms and award medals without duplicate pay');
    assert.deepEqual(report.errors, []); report.passed = true;
  } finally { await browser.close(); fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); }
  console.log(JSON.stringify({ passed: report.passed, screenshots: report.captures.length, errors: report.errors, checks: report.checks, out }));
})().catch(e => { console.error(e); process.exitCode = 1; });
