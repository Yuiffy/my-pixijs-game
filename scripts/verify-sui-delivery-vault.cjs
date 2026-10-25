const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd(), path.join(require('node:os').homedir(), '.codex/skills/develop-web-game')] }));
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const { makeVaultPilot } = require('./lib/sui-delivery-vault-pilot.cjs');
const base = process.env.DELIVERY_BASE_URL || 'http://127.0.0.1:4160';
const out = process.env.DELIVERY_QA_DIR || '.tmp/sui-delivery-vault';
const report = { errors: [], captures: [], checks: [] };
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
async function prepare(context) {
  await context.addInitScript(() => {
    if (window.speechSynthesis) window.speechSynthesis.speak = () => {};
    Element.prototype.requestPointerLock = async () => {};
    document.exitPointerLock = () => {};
  });
  await context.route(/https:\/\/(pagead2\.googlesyndication\.com|hm\.baidu\.com)\//, r => r.fulfill({ body: '' }));
  await context.route(/\/api\/(record|demos\/visits)(\?|$)/, r => r.fulfill({ json: { success: true, count: 0 } }));
  context.on('page', page => {
    page.on('pageerror', e => report.errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
    page.on('response', r => { if (r.status() >= 400 && r.url().startsWith(base)) report.errors.push(`HTTP ${r.status()} ${r.url()}`); });
  });
}
async function loaded(page) {
  await page.goto(`${base}/game/sui-spring?test=1`);
  await page.getByRole('button', { name: /^接下第一单/ }).waitFor({ timeout: 60000 });
  await page.waitForFunction(() => !!window.deliveryTest && document.querySelector('canvas') && !Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('正在准备早餐')));
  await page.evaluate(() => window.deliveryTest.manual(true));
}
async function capture(page, name) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const dom = await page.evaluate(() => {
    const c = document.querySelector('canvas'); const b = c?.getBoundingClientRect();
    return { canvasCount: document.querySelectorAll('canvas').length, width: c?.width, height: c?.height, box: b?.toJSON(), viewport: { w: innerWidth, h: innerHeight }, scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight, text: document.body.innerText.slice(0, 2400) };
  });
  assert.equal(dom.canvasCount, 1); assert.ok(dom.width > 0 && dom.height > 0);
  assert.ok(dom.scrollWidth <= dom.viewport.w + 1); assert.ok(dom.scrollHeight <= dom.viewport.h + 1);
  const file = path.join(out, `${name}.png`);
  const pixels = inspectPng(await page.screenshot({ path: file, fullPage: true, animations: 'disabled' }));
  report.captures.push({ name, file, pixels, dom, state: await state(page) });
}
(async () => {
  assert.equal((await fetch(`${base}/game/sui-spring`, { signal: AbortSignal.timeout(60000) })).status, 200);
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: process.env.DELIVERY_HEADED !== '1', args: ['--mute-audio', '--disable-speech-api'] });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } }); await prepare(ctx);
    const p = await ctx.newPage(); await loaded(p); await capture(p, '01-title');
    await p.getByRole('button', { name: /^接下第一单/ }).click();
    const run = makeVaultPilot({ walkRoof: true }); let previous = 0;
    const pictured = new Set(['vault-approach', 'vault-jump', 'vault-contact', 'vault-rooftop', 'delivered']);
    for (const mark of run.milestones) {
      await p.evaluate(tape => window.deliveryTest.replay(tape), run.tape.slice(previous, mark.frame)); previous = mark.frame;
      const actual = await state(p);
      assert.equal(actual.phase, mark.state.phase, mark.name);
      assert.ok(Math.abs(actual.player.x - mark.state.player.x) < 0.01, `${mark.name} x`);
      assert.ok(Math.abs(actual.player.y - mark.state.player.y) < 0.01, `${mark.name} y`);
      assert.equal(actual.vaults, mark.state.vaults); assert.equal(actual.deaths, 0); assert.equal(actual.player.health, 3);
      if (pictured.has(mark.name)) await capture(p, `02-${mark.name}`);
    }
    assert.equal((await state(p)).save.kindness, true);
    report.checks.push('fresh save, ordinary button replay, jump then tray after 50ms, no-run walking-speed roof landing, old sign, kindness, canopy, cart and completed delivery');
    await ctx.close();

    const mobile = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 }); await prepare(mobile);
    const m = await mobile.newPage(); await loaded(m); await m.getByRole('button', { name: /^接下第一单/ }).tap();
    const approach = run.milestones.find(mark => mark.name === 'vault-approach');
    await m.evaluate(tape => window.deliveryTest.replay(tape), run.tape.slice(0, approach.frame));
    await capture(m, '03-touch-approach');
    const cdp = await mobile.newCDPSession(m);
    const point = async label => { const b = await m.getByRole('button', { name: label, exact: true }).boundingBox(); assert.ok(b && b.width >= 44 && b.height >= 44); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
    const right = await point('向右'); const jump = await point('跳跃'); const attack = await point('挑击');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...right, id: 1 }, { ...jump, id: 2 }, { ...attack, id: 3 }] });
    await m.evaluate(() => window.advanceTime(150));
    const boosted = await state(m); assert.equal(boosted.vaults, 1); assert.ok(boosted.player.vy < -600); assert.equal(boosted.player.health, 3);
    await capture(m, '04-touch-vault');
    await m.evaluate(() => window.advanceTime(1300));
    const roof = await state(m); assert.equal(roof.player.y + 44, 400); assert.equal(roof.player.grounded, true); assert.equal(roof.vaults, 1);
    await capture(m, '04b-touch-rooftop');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] }); await m.evaluate(() => window.advanceTime(10));
    assert.equal((await state(m)).player.attackHeld, false); assert.equal((await state(m)).player.jumpHeld, false);
    await m.getByRole('button', { name: '整备', exact: true }).tap();
    const paused = await state(m); await m.evaluate(() => window.advanceTime(1000)); assert.deepEqual(await state(m), paused);
    await m.setViewportSize({ width: 390, height: 844 }); await capture(m, '05-mobile-pause');
    report.checks.push('three simultaneous real touch controls trigger vault and land on roof without run, held tray does not repeat, cancel releases buttons, pause freezes, portrait panel fits');
    await mobile.close();
    assert.deepEqual(report.errors, []); report.passed = true;
  } finally { await browser.close(); fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); }
  console.log(JSON.stringify({ passed: report.passed, screenshots: report.captures.length, checks: report.checks, errors: report.errors, out }));
})().catch(e => { console.error(e); process.exitCode = 1; });
