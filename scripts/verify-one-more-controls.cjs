const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
let playwright;
for (const location of [process.env.PLAYWRIGHT_MODULE, 'playwright', 'C:/Users/yuiffy/.codex/skills/develop-web-game/node_modules/playwright'].filter(Boolean)) {
  try { playwright = require(location); break; } catch { /* Try installed runtime. */ }
}
const base = process.env.ONE_MORE_URL || 'http://localhost:3992';
const directory = process.env.ONE_MORE_CONTROLS_OUTPUT || 'tmp/one-more-controls-dev';
mkdirSync(directory, { recursive: true });
(async () => {
  assert.equal((await fetch(`${base}/game/one-more`)).status, 200);
  const { pilotInputs } = await import('./tests/helpers/one-more-pilot.mjs');
  const browser = await playwright.chromium.launch({ channel: 'chrome', headless: process.env.ONE_MORE_HEADED !== '1', args: ['--mute-audio', '--disable-speech-api'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, hasTouch: true });
  await context.addInitScript(({ decision }) => {
    if (window.speechSynthesis) window.speechSynthesis.speak = () => {};
    window.__decision = (0, eval)(`(${decision})`);
  }, { decision: pilotInputs.toString() });
  await context.route('**/api/record', r => r.fulfill({ json: { success: true } }));
  await context.route(/https:\/\/(pagead2\.googlesyndication\.com|hm\.baidu\.com)\//, r => r.fulfill({ body: '' }));
  const page = await context.newPage(), errors = [], captures = [], checks = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
  const step = ms => page.evaluate(ms => window.advanceTime(ms), ms);
  const button = name => (name === '继续过招' ? page.getByRole('dialog') : page).getByRole('button', { name, exact: ['设置', '关闭设置', '向左移动', '向右移动', '格挡', '闪避', '挥剑'].includes(name) });
  const focusGame = () => page.getByRole('main', { name: '岁岁过招' }).focus();
  const start = async () => { await button('请赐教').click(); await step(0); };
  const fresh = async () => {
    await page.goto(`${base}/game/one-more`, { waitUntil: 'domcontentloaded' });
    await button('请赐教').waitFor({ timeout: 60000 }); await start();
  };
  const check = name => { checks.push(name); console.log(`PASS ${name}`); };
  const shot = async name => {
    await page.waitForTimeout(400);
    const pixels = inspectPng(await page.screenshot({ path: join(directory, name + '.png'), fullPage: true }));
    const geometry = await page.evaluate(() => {
      const canvas = document.querySelector('canvas'), r = canvas.getBoundingClientRect();
      const header = document.querySelector('header').getBoundingClientRect();
      const health = document.querySelector('[class*="health"]').getBoundingClientRect();
      const controls = [...document.querySelectorAll('[aria-label="战斗操作"] button')].map(b => {
        const r = b.getBoundingClientRect(); return { name: b.getAttribute('aria-label'), x: r.x, y: r.y, right: r.right, bottom: r.bottom };
      });
      return { canvas: { width: r.width, height: r.height, backingWidth: canvas.width, backingHeight: canvas.height }, controls,
        headerBottom: header.bottom, healthTop: health.top,
        width: innerWidth, height: innerHeight, overflow: document.documentElement.scrollWidth > innerWidth };
    });
    assert.ok(geometry.canvas.width > 0 && geometry.canvas.backingWidth > 0);
    assert.equal(geometry.overflow, false);
    assert.ok(geometry.headerBottom <= geometry.healthTop, 'Title/tools must not overlap health');
    for (const b of geometry.controls) assert.ok(b.x >= 0 && b.y >= 0 && b.right <= geometry.width + 1 && b.bottom <= geometry.height + 1, JSON.stringify(b));
    captures.push({ name, pixels, geometry, state: await state() });
  };
  const press = async (name, id, offset = 0) => {
    const box = await button(name).boundingBox(); return { id, x: box.x + box.width / 2 + offset, y: box.y + box.height / 2 };
  };
  const pilot = () => page.evaluate(() => {
    const held = new Map();
    for (let i = 0; i < 18000; i++) {
      const s = window.suiSparring.snapshot(); if (s.phase !== 'fight') break;
      for (const [action, down] of Object.entries(window.__decision(s))) {
        if (held.has(action) === down) continue;
        const code = s.bindings[action]; if (down) held.set(action, code); else held.delete(action);
        window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true }));
      }
      window.advanceTime(10);
    }
    for (const code of held.values()) window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
    return window.suiSparring.snapshot();
  });
  try {
    await fresh();
    await page.keyboard.down('d'); await page.keyboard.down('ArrowRight'); await step(80);
    await page.keyboard.up('ArrowRight'); const before = (await state()).player.x;
    await step(80); assert.ok((await state()).player.x > before);
    await page.keyboard.up('d'); assert.deepEqual((await state()).held, []);
    await page.keyboard.down('a'); await button('设置').focus(); await page.keyboard.up('a');
    assert.deepEqual((await state()).held, []); await focusGame();
    check('alias keys and keyup after focus change');
    await page.keyboard.down('k'); const guardAt = (await state()).player.guardAt; await step(300);
    const guard = await button('格挡').boundingBox(); await page.mouse.move(guard.x + guard.width / 2, guard.y + guard.height / 2);
    await page.mouse.down(); assert.equal((await state()).player.guardAt, guardAt);
    await page.mouse.up(); assert.ok((await state()).player.guarding);
    await shot('01-mixed-guard'); await page.keyboard.up('k');
    assert.equal((await state()).player.guarding, false); check('mouse cancellation preserves keyboard guard and original parry time');

    await fresh(); const right = button('向右移动'); await right.focus();
    await page.keyboard.down('Enter'); await page.keyboard.down('Space'); await step(80);
    await page.keyboard.up('Enter'); const x = (await state()).player.x; await step(80);
    assert.ok((await state()).player.x > x); assert.equal((await state()).player.dodging, false);
    await page.keyboard.press('Tab'); assert.deepEqual((await state()).held, []);
    await page.keyboard.down('Space'); assert.deepEqual((await state()).held, []); await page.keyboard.up('Space');
    await button('格挡').focus(); await page.keyboard.down('Enter'); await step(80); assert.ok((await state()).player.guarding);
    await page.keyboard.up('Enter'); await button('闪避').focus(); const stamina = (await state()).player.stamina;
    await page.keyboard.down('Space'); await step(10); assert.ok((await state()).player.stamina < stamina); assert.ok((await state()).player.dodging);
    await page.keyboard.up('Space'); await step(800); await button('挥剑').focus();
    const attackAt = (await state()).player.attackAt; await page.keyboard.down('Enter'); await step(100);
    assert.ok((await state()).player.attackAt > attackAt); await page.keyboard.up('Enter');
    await shot('02-keyboard-actions'); check('focused controls hold Enter/Space, Tab cancels, repeats cannot restart');

    await fresh(); await page.keyboard.down('d'); await step(50); await page.keyboard.press('Escape');
    assert.equal((await state()).phase, 'paused'); assert.deepEqual((await state()).held, []);
    const frozen = (await state()).t; await step(1000); assert.equal((await state()).t, frozen);
    await button('继续过招').focus(); await page.keyboard.press('Enter'); assert.equal((await state()).phase, 'fight');
    await page.keyboard.down('d'); await step(80); assert.deepEqual((await state()).held, []); await page.keyboard.up('d');
    await page.keyboard.down('d'); await step(80); assert.ok((await state()).held.includes('right')); await page.keyboard.up('d');
    await page.keyboard.down('k'); await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    assert.equal((await state()).phase, 'paused'); assert.deepEqual((await state()).held, []);
    await page.keyboard.up('k'); await button('继续过招').click();
    await button('设置').click(); await page.getByLabel('暂停', { exact: true }).selectOption('Enter');
    await button('关闭设置').click(); await button('继续过招').focus(); await page.keyboard.press('Enter');
    assert.equal((await state()).phase, 'fight'); assert.deepEqual((await state()).held, []);
    await page.keyboard.press('Enter'); assert.equal((await state()).phase, 'paused');
    await button('继续过招').focus(); await page.keyboard.press('Space'); assert.equal((await state()).phase, 'fight');
    await button('向左移动').focus(); await page.keyboard.down('Enter'); await step(80);
    assert.equal((await state()).phase, 'fight'); assert.ok((await state()).held.includes('left')); await page.keyboard.up('Enter');
    await button('设置').click(); await button('恢复默认按键').click(); await button('关闭设置').click(); await button('继续过招').click();
    await page.keyboard.down('k'); await button('设置').click(); assert.deepEqual((await state()).held, []);
    await page.getByLabel('格挡 / 弹反', { exact: true }).selectOption('KeyL');
    await page.keyboard.up('k'); await button('关闭设置').click(); await button('继续过招').click();
    await page.keyboard.down('l'); assert.ok((await state()).player.guarding); await page.keyboard.up('l');
    await button('设置').click(); await button('恢复默认按键').click(); await button('关闭设置').click(); await button('继续过招').click();
    check('pause, blur, settings, rebinding and native resume keys');

    const touch = await context.newCDPSession(page);
    for (const size of [{ width: 390, height: 844 }, { width: 320, height: 568 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(size); await fresh();
      const a = await press('向右移动', 1, -7), b = await press('向右移动', 2, 7);
      await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [a] });
      await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [a, b] }); await step(60);
      await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [a] });
      const moving = (await state()).player.x; await step(60); assert.ok((await state()).player.x > moving);
      await focusGame(); await page.keyboard.down('d');
      await touch.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
      assert.ok((await state()).held.includes('right')); await page.keyboard.up('d'); assert.deepEqual((await state()).held, []);
      const left = await press('向左移动', 3), block = await press('格挡', 4);
      await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [left, block] }); await step(60);
      assert.ok((await state()).held.includes('left') && (await state()).held.includes('guard'));
      await shot(`03-touch-${size.width}`);
      await touch.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] }); assert.deepEqual((await state()).held, []);
      check(`real multitouch and cancellation at ${size.width}x${size.height}`);
    }

    await page.setViewportSize({ width: 1440, height: 900 }); await fresh();
    await page.evaluate(() => window.suiSparring.live()); const liveX = (await state()).player.x;
    await page.keyboard.down('a'); await page.waitForTimeout(160); await page.keyboard.up('a');
    assert.ok((await state()).player.x < liveX); await page.keyboard.press('Escape');
    const t = (await state()).t; await page.waitForTimeout(180); assert.equal((await state()).t, t);
    await button('继续过招').click(); await step(0); check('real animation frames move and pause without time hook');
    await fresh();
    for (let i = 0; i < 3; i++) {
      const result = await pilot(); assert.equal(result.phase, i === 2 ? 'ending' : 'won');
      assert.equal(result.campaign.cleared.length, i + 1); assert.ok(result.stats.parries > 0 && result.stats.counters > 0);
      assert.deepEqual(result.held, []); await shot(`04-victory-${i + 1}`);
      if (i < 2) {
        const next = i === 0 ? '去钟台' : '去终庭'; await button(next).focus(); await page.keyboard.press('Enter');
        assert.equal((await state()).phase, 'ready'); await start();
      }
    }
    await page.reload(); await button('再过三庭').waitFor(); assert.equal((await state()).chapterWins, 1);
    await button('再过三庭').focus(); await page.keyboard.press('Enter'); assert.equal((await state()).phase, 'ready');
    await start(); await step(120000); assert.equal((await state()).phase, 'lost'); assert.deepEqual((await state()).held, []);
    await shot('05-defeat'); await focusGame(); await page.keyboard.press('r'); assert.equal((await state()).phase, 'fight');
    check('three natural victories, keyboard next/replay, refresh, defeat and retry');
    assert.deepEqual(errors, []);
    writeFileSync(join(directory, 'report.json'), JSON.stringify({ base, checks, captures, errors }, null, 2));
    console.log(JSON.stringify({ checks: checks.length, screenshots: captures.length, errors }));
  } catch (error) {
    writeFileSync(join(directory, 'failure.json'), JSON.stringify({ message: error.message, stack: error.stack, checks, errors, state: await state().catch(() => null) }, null, 2));
    await page.screenshot({ path: join(directory, 'failure.png'), fullPage: true }).catch(() => {}); throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
