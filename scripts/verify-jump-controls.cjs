const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(require.resolve('playwright', {
  paths: [process.cwd(), path.join(require('node:os').homedir(), '.codex/skills/develop-web-game')],
}));
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const base = process.env.JUMP_BASE_URL || 'http://localhost:4000';
const out = process.env.JUMP_QA_DIR || 'tmp/jump-controls-dev';
const errors = [], checks = [], captures = [];
const state = p => p.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = (p, ms) => p.evaluate(ms => window.advanceTime(ms), ms);
const button = (p, name) => p.getByRole('button', { name, exact: !['开始攀登', '继续攀登'].includes(name) });
const empty = async p => assert.ok(Object.values((await state(p)).input).every(v => !v));
async function capture(p, name) {
  await p.waitForFunction(() => {
    const height = [...document.querySelectorAll('span')].find(e => e.textContent === '攀登高度')?.parentElement?.querySelector('strong');
    return height && parseInt(height.textContent, 10) === JSON.parse(window.render_game_to_text()).height;
  });
  await p.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const layout = await p.evaluate(() => ({
    width: innerWidth, scroll: document.documentElement.scrollWidth,
    canvas: [...document.querySelectorAll('canvas')].map(c => ({ width: c.width, height: c.height })),
  }));
  assert.equal(layout.canvas.length, 1);
  assert.ok(layout.canvas.every(c => c.width > 0 && c.height > 0));
  assert.ok(layout.scroll <= layout.width + 1);
  const file = path.join(out, name + '.png');
  captures.push({ name, layout, pixels: inspectPng(await p.screenshot({ path: file, fullPage: true })), state: await state(p) });
}
async function point(p, name, offset = 0) {
  const el = button(p, name); await el.scrollIntoViewIfNeeded();
  const b = await el.boundingBox(); return { x: b.x + b.width / 2 + offset, y: b.y + b.height / 2 };
}
(async () => {
  assert.equal((await fetch(base + '/game/jumpone', { signal: AbortSignal.timeout(60000) })).status, 200);
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: process.env.JUMP_HEADED !== '1', args: ['--mute-audio', '--disable-speech-api'] });
  async function page(options = {}, manual = true) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 960 }, hasTouch: true, ...options });
    await ctx.addInitScript(() => { if (window.speechSynthesis) window.speechSynthesis.speak = () => {}; });
    await ctx.route('**/api/record', r => r.fulfill({ json: { success: true } }));
    await ctx.route(/https:\/\/(pagead2\.googlesyndication\.com|hm\.baidu\.com)\//, r => r.fulfill({ body: '' }));
    const p = await ctx.newPage();
    p.on('pageerror', e => errors.push(e.message));
    p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await p.goto(base + '/game/jumpone?seed=41');
    await p.waitForFunction(() => window.render_game_to_text && JSON.parse(window.render_game_to_text()).loaded);
    if (manual) await advance(p, 0);
    await button(p, '开始攀登').focus(); await p.keyboard.press('Enter');
    assert.equal((await state(p)).phase, 'playing');
    return { p, ctx };
  }
  let passed = false;
  try {
    const { p, ctx } = await page();
    await button(p, '向右移动').focus();
    await p.keyboard.down('Enter'); await p.keyboard.down('Space'); await advance(p, 80);
    const both = await state(p);
    await p.keyboard.up('Space'); await advance(p, 80);
    assert.ok((await state(p)).input.right); assert.ok((await state(p)).player.x > both.player.x + 15);
    await capture(p, '01-two-keys');
    await p.keyboard.up('Enter'); await empty(p);
    await p.keyboard.down('Space'); await p.keyboard.down('Enter'); await p.keyboard.up('Enter');
    assert.ok((await state(p)).input.right); await p.keyboard.up('Space'); await empty(p);
    await p.getByRole('application').focus(); await p.keyboard.down('d'); await p.keyboard.down('ArrowRight');
    await p.keyboard.up('ArrowRight'); assert.ok((await state(p)).input.right); await p.keyboard.up('d'); await empty(p);
    checks.push('Enter/Space and D/ArrowRight each retain independent ownership until their own release');

    await button(p, '向右移动').focus(); await p.keyboard.down('Enter'); await p.keyboard.press('Tab');
    await empty(p); await p.keyboard.down('Enter'); await empty(p); await p.keyboard.up('Enter');
    await button(p, '向右移动').focus(); await p.keyboard.down('Enter');
    const pos = await point(p, '向右移动'); await p.mouse.move(pos.x, pos.y); await p.mouse.down();
    await p.keyboard.up('Enter'); assert.ok((await state(p)).input.right);
    await p.mouse.up(); await empty(p);
    const cdp = await ctx.newCDPSession(p);
    await button(p, '向右移动').focus(); await p.keyboard.down('Enter');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...pos, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    assert.ok((await state(p)).input.right); await p.keyboard.up('Enter'); await empty(p);
    await p.mouse.click(pos.x, pos.y, { button: 'right' }); await empty(p); await p.keyboard.press('Escape');
    if ((await state(p)).phase === 'paused') await button(p, '继续攀登').click();
    checks.push('Tab cancels button keys; repeats cannot activate newly focused control; pointer release/cancel preserves independent keyboard hold; secondary mouse ignored');

    await p.getByRole('application').focus(); await p.keyboard.down('ArrowLeft'); await p.keyboard.press('p');
    await empty(p); const paused = await state(p); await advance(p, 2000); assert.deepEqual(await state(p), paused);
    await button(p, '继续攀登').focus(); await p.keyboard.press('Enter'); await p.keyboard.down('ArrowLeft'); await empty(p);
    await p.keyboard.up('ArrowLeft'); await p.keyboard.down('ArrowLeft'); assert.ok((await state(p)).input.left); await p.keyboard.up('ArrowLeft');
    const held = await point(p, '向右移动'); await p.mouse.move(held.x, held.y); await p.mouse.down(); await p.keyboard.press('p');
    await empty(p); assert.equal(await button(p, '向右移动').evaluate(el => el.hasPointerCapture(1)), false);
    await capture(p, '02-paused-cleared'); await p.mouse.up(); await button(p, '继续攀登').click(); await empty(p);
    for (const method of ['blur', 'hidden']) {
      await p.keyboard.down('ArrowRight');
      await p.evaluate(method => {
        if (method === 'blur') window.dispatchEvent(new Event('blur'));
        else { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); delete document.hidden; }
      }, method);
      assert.equal((await state(p)).phase, 'paused'); await empty(p); await p.keyboard.up('ArrowRight'); await button(p, '继续攀登').click(); await empty(p);
    }
    checks.push('pause/blur/hidden clear input and capture; simulation freezes; resume ignores held-key repeats until a fresh press');

    // Hold both activation keys beyond the dash cooldown: releasing one must not re-arm it.
    await p.keyboard.press('p'); await p.keyboard.press('r');
    await button(p, '冲刺').focus(); await p.keyboard.down('Enter'); await p.keyboard.down('Space'); await advance(p, 40);
    assert.ok((await state(p)).player.dashTime > 0); await advance(p, 1010);
    assert.equal((await state(p)).phase, 'playing'); assert.equal((await state(p)).player.cooldown, 0);
    await p.keyboard.up('Space'); await advance(p, 10); await p.keyboard.down('Space'); await advance(p, 10);
    assert.equal((await state(p)).player.cooldown, 0, 'second key must not cause another dash while first is held');
    await p.keyboard.up('Enter'); await p.keyboard.up('Space'); await advance(p, 10);
    await p.keyboard.down('Enter'); await advance(p, 10); assert.ok((await state(p)).player.cooldown > 0.9); await p.keyboard.up('Enter');
    await capture(p, '03-dash-fresh-press');
    checks.push('dual activation keys keep dash edge-triggered across cooldown; all released then pressed starts a new dash');
    await ctx.close();

    for (const width of [390, 320]) {
      const { p: m, ctx: mobile } = await page({ viewport: { width, height: 844 }, isMobile: true });
      const session = await mobile.newCDPSession(m);
      await m.evaluate(() => { window.__pointerTrace = []; for (const type of ['pointerdown','pointerup','pointercancel','lostpointercapture']) window.addEventListener(type, e => window.__pointerTrace.push({type,id:e.pointerId,target:e.target.getAttribute?.('aria-label')}), true); });
      const right = await point(m, '向右移动'); const jump = await point(m, '跳跃');
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...right, id: 1 }, { ...jump, id: 2 }] });
      await advance(m, 80); assert.ok((await state(m)).input.right && (await state(m)).input.jump);
      // CDP ends the listed contact; an empty list ends all active contacts.
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ ...jump, id: 2 }] });
      assert.ok((await state(m)).input.right, JSON.stringify(await m.evaluate(() => window.__pointerTrace))); assert.equal((await state(m)).input.jump, false);
      await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] }); await empty(m);
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...right, id: 3 }] });
      await advance(m, 40); assert.ok((await state(m)).input.right);
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await empty(m);
      await capture(m, `04-touch-${width}`); await mobile.close();
    }
    checks.push('320/390px real multitouch partial release, cancellation and fresh retry preserve independent directions/jump');

    const real = await page({}, false);
    await real.p.keyboard.down('ArrowRight');
    await real.p.waitForFunction(() => JSON.parse(window.render_game_to_text()).player.x > 430);
    await real.p.keyboard.up('ArrowRight'); await real.p.keyboard.press('p');
    const frozen = await state(real.p); await real.p.waitForTimeout(250); assert.deepEqual(await state(real.p), frozen);
    await real.ctx.close(); checks.push('real animation frames move the bird and remain frozen during pause without advanceTime');
    assert.deepEqual(errors, []); passed = true;
  } finally {
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ passed, checks, captures, errors }, null, 2));
    await browser.close();
  }
  console.log(JSON.stringify({ passed, checks, screenshots: captures.length, errors }, null, 2));
})().catch(e => { console.error(e); process.exitCode = 1; });
