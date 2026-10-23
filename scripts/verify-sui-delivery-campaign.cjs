const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd(), path.join(require('node:os').homedir(), '.codex/skills/develop-web-game')] }));
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const pilot = require('./lib/sui-delivery-campaign-pilot.cjs');
const model = require('./lib/sui-delivery-model.cjs');
const base = process.env.DELIVERY_BASE_URL || 'http://127.0.0.1:4138';
const out = process.env.DELIVERY_QA_DIR || '.tmp/sui-delivery/campaign';
const report = { errors: [], captures: [], checks: [] };
const selected = {
  'bakery-backdoor': ['take-meal', 'pan-rising', 'pan-rider', 'flour-shelf', 'cooling-awning', 'delivered'],
  'oven-crab': ['claw-warning', 'vent-warning', 'pan-raised-0', 'on-back-0', 'valve-0', 'pan-raised-1', 'pan-raised-2', 'valve-2', 'delivered'],
  'market-stalls': ['moving-stall-rider', 'reflected-heat', 'bell-open', 'delivered'],
  'freight-lunch': ['loading-dock', 'sloped-rail-rider', 'middle-stop', 'dispatch-reflection', 'dispatch-open', 'under-loading-beam', 'unloading-stop', 'delivered'],
  'serving-machine': ['arm-warning', 'reflected-0', 'belt-stopped-0', 'side-step-0', 'upper-belt-1', 'reflected-1', 'belt-stopped-1', 'upper-belt-2', 'reflected-2', 'serving-table-bridge', 'delivered'],
};
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
    const c = document.querySelector('canvas'); const box = c?.getBoundingClientRect(); const host = c?.parentElement.getBoundingClientRect();
    return { count: document.querySelectorAll('canvas').length, width: c?.width, height: c?.height, box: box?.toJSON(), host: host?.toJSON(), innerWidth, innerHeight, scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight, text: document.body.innerText.slice(0, 2400) };
  });
  assert.equal(dom.count, 1); assert.ok(dom.box.width > 0 && dom.box.height > 0);
  assert.ok(Math.abs(dom.box.width / dom.box.height - dom.width / dom.height) < 0.015);
  assert.ok(dom.scrollWidth <= dom.innerWidth + 1 && dom.scrollHeight <= dom.innerHeight + 1);
  const file = path.join(out, `${name}.png`); const pixels = inspectPng(await p.screenshot({ path: file, fullPage: true, animations: 'disabled' }));
  report.captures.push({ name, file, pixels, dom, state: await state(p) });
}
async function replay(p, run, selected) {
  let frame = 0;
  for (const mark of run.milestones) {
    await p.evaluate(tape => window.deliveryTest.replay(tape), run.tape.slice(frame, mark.frame)); frame = mark.frame;
    const actual = await state(p);
    assert.equal(actual.order, mark.state.order); assert.equal(actual.phase, mark.state.phase, mark.name);
    assert.ok(Math.abs(actual.player.x - mark.state.player.x) < 0.01, `${mark.name}: player x`);
    assert.ok(Math.abs(actual.player.y - mark.state.player.y) < 0.01, `${mark.name}: player y`);
    assert.equal(actual.player.health, 3, mark.name); assert.equal(actual.deaths, 0, mark.name);
    if (selected.has(mark.name)) await capture(p, `${actual.order}-${mark.name}`);
  }
}
(async () => {
  assert.equal((await fetch(`${base}/game/sui-spring`, { signal: AbortSignal.timeout(60000) })).status, 200);
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: process.env.DELIVERY_HEADED !== '1', args: ['--mute-audio', '--disable-speech-api'] });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } }); await prepare(ctx);
    const p = await ctx.newPage(); await boot(p);
    await p.getByRole('button', { name: '订单', exact: true }).click();
    assert.equal(await p.getByRole('button', { name: /02 · 面包房的后门/ }).isDisabled(), true); await capture(p, 'locked-orders');
    await p.getByRole('button', { name: /01 · 阁楼那碗热汤/ }).click();
    const runs = pilot.campaign().slice(0, 6); await replay(p, runs[0], new Set());
    for (let i = 1; i < runs.length; i++) {
      const level = model.LEVELS[i]; await p.getByRole('button', { name: `下一单 · ${level.title} →`, exact: true }).click();
      const before = await state(p); assert.equal(before.order, level.id); assert.equal(before.carrying, false);
      await replay(p, runs[i], new Set(selected[level.id]));
      assert.deepEqual((await state(p)).save.delivered, model.LEVELS.slice(0, i + 1).map(v => v.id));
    }
    report.checks.push('six connected orders completed from a fresh save using only normal input, including the sloped freight railway and all three serving-machine belts');
    const actualSave = await p.evaluate(key => localStorage.getItem(key), model.SAVE_KEY);
    await p.getByRole('button', { name: '再跑一次 · 趁热送达', exact: true }).click();
    assert.equal((await state(p)).switches.length, 0); assert.equal((await state(p)).machine.phase, 'sleep');
    const servingHot = pilot.serving(model.readDeliverySave(actualSave), 'hot'); await replay(p, servingHot, new Set());
    assert.ok((await state(p)).save.records['serving-machine'].medal);
    assert.equal((await state(p)).save.money, model.readDeliverySave(actualSave).money);
    await p.getByRole('button', { name: '看看街坊的变化', exact: true }).click(); await capture(p, 'market-shared-lunch');
    report.checks.push('serving-machine hot replay resets all three belts, has active emitters, earns a medal without duplicate pay, and the calm arms become a table');
    await p.getByRole('button', { name: '订单', exact: true }).click(); await capture(p, 'completed-orders');
    await p.getByRole('button', { name: /03 · 会走路的大烤炉/ }).click();
    const repeated = pilot.oven(model.readDeliverySave(actualSave)); await replay(p, repeated, new Set());
    assert.equal((await state(p)).save.money, model.readDeliverySave(actualSave).money);
    await p.getByRole('button', { name: '再跑一次 · 趁热送达', exact: true }).click();
    assert.equal((await state(p)).boss.phase, 'sleep');
    await p.evaluate(tape => window.deliveryTest.replay(tape), repeated.tape); assert.equal((await state(p)).phase, 'delivered');
    assert.ok((await state(p)).save.records['oven-crab'].medal); await capture(p, 'oven-hot-replay');
    report.checks.push('completed-order map, repeat pay prevention, hot replay starts the boss again and records a per-order medal');

    await p.getByRole('button', { name: '订单', exact: true }).click(); await p.getByRole('button', { name: /04 · 午市里的逆行餐盒/ }).click();
    await p.keyboard.down('KeyE'); await p.evaluate(() => window.advanceTime(100)); await p.keyboard.up('KeyE');
    await p.keyboard.press('KeyF'); await p.waitForFunction(() => !!document.fullscreenElement); await capture(p, 'fullscreen');
    await p.keyboard.press('KeyF'); await p.waitForFunction(() => !document.fullscreenElement);
    report.checks.push('F enters and leaves fullscreen with a proportionate canvas');

    const reload = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }); await prepare(reload);
    // This is a real save produced by the first run, never a position/health fixture.
    const firstBell = report.captures.find(v => v.name === 'market-stalls-bell-open').state.save;
    await reload.addInitScript(({ key, raw, origin }) => { if (location.origin === origin && !localStorage.getItem(key)) localStorage.setItem(key, raw); }, { key: model.SAVE_KEY, raw: JSON.stringify(firstBell), origin: base });
    const m = await reload.newPage(); await boot(m); await m.getByRole('button', { name: /^继续这趟配送/ }).tap();
    assert.equal((await state(m)).order, 'market-stalls'); assert.ok((await state(m)).switches.includes('market-bell-gate'));
    assert.equal((await state(m)).carrying, true); await capture(m, 'portrait-market-resume');
    await m.getByRole('button', { name: '订单', exact: true }).tap(); await m.getByRole('button', { name: /03 · 会走路的大烤炉/ }).tap();
    const mobileOven = pilot.oven(model.readDeliverySave(JSON.stringify(firstBell)));
    const stage2 = mobileOven.milestones.find(v => v.name === 'pan-raised-2');
    await m.evaluate(tape => window.deliveryTest.replay(tape), mobileOven.tape.slice(0, stage2.frame)); await capture(m, 'portrait-oven-final-phase');
    await m.getByRole('button', { name: '整备', exact: true }).tap(); await capture(m, 'portrait-insulated-kit');
    assert.ok((await state(m)).insulatedTray); await reload.close();
    report.checks.push('actual later-order checkpoint and gate restoration on portrait touch Chrome; final boss phase and equipment remain visible');
    for (const [name, captureName, order, checkpoint] of [
      ['portrait-freight-resume', 'freight-lunch-middle-stop', 'freight-lunch', 'freight-middle'],
      ['portrait-sorter-resume', 'serving-machine-belt-stopped-1', 'serving-machine', 'sorter-rest'],
    ]) {
      const checkpointSave = report.captures.find(v => v.name === captureName).state.save;
      const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }); await prepare(phone);
      await phone.addInitScript(({ key, raw, origin }) => { if (location.origin === origin && !localStorage.getItem(key)) localStorage.setItem(key, raw); }, { key: model.SAVE_KEY, raw: JSON.stringify(checkpointSave), origin: base });
      const q = await phone.newPage(); await boot(q); await q.getByRole('button', { name: /^继续这趟配送/ }).tap();
      let actual = await state(q); assert.equal(actual.order, order); assert.equal(actual.checkpoint, checkpoint); assert.equal(actual.carrying, true);
      await q.keyboard.press('KeyR'); await q.evaluate(() => window.advanceTime(16)); actual = await state(q);
      if (order === 'freight-lunch') { assert.equal(actual.cart.station, 1); assert.equal(actual.cart.y, 500); assert.equal(actual.switches.length, 0); }
      else { assert.equal(actual.machine.stage, 2); assert.equal(actual.switches.length, 2); }
      await capture(q, name); await phone.close();
    }
    report.checks.push('portrait Chrome restores and retries the actual freight middle station and the actual two-stopped-belt save without losing the meal or component progress');
    assert.deepEqual(report.errors, []); report.passed = true;
  } finally { await browser.close(); fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); }
  console.log(JSON.stringify({ passed: report.passed, screenshots: report.captures.length, checks: report.checks, errors: report.errors, out }));
})().catch(e => { console.error(e); process.exitCode = 1; });
