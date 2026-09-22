const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { state, advance, follow, hold, solve, capture, images } = require('./verify-hush-3d.cjs');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const base = process.env.HUSH_BASE_URL || 'http://127.0.0.1:3877';
const out = process.env.HUSH_QA_DIR || 'tmp/hush-3d';
const errors = []; const checks = [];
async function open(page) {
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(base + '/game/hush-live', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.render_game_to_text && JSON.parse(window.render_game_to_text()).webglReady);
  await advance(page, 0);
}
async function choose(page, name) {
  const phase = (await state(page)).phase;
  if (phase === 'playing') await page.keyboard.press('p');
  if ((await state(page)).phase === 'paused') await page.getByRole('button', { name: '放弃本晚，返回准备' }).click();
  else if (phase === 'result') await page.getByRole('button', { name: '重玩本晚' }).click();
  const summary = page.getByText('选择夜晚与角色', { exact: true });
  if (!await page.getByLabel('玩家身份', { exact: true }).isVisible()) await summary.click();
  await page.getByRole('button', { name: new RegExp(name) }).click();
}
async function main() {
  fs.mkdirSync(out, { recursive: true }); assert.equal((await fetch(base + '/game/hush-live')).status, 200);
  const browser = await chromium.launch({ channel: 'chrome', headless: process.env.HEADED !== '1' });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const page = await context.newPage(); await open(page); await page.locator('#hush-start').click();
    let s = await state(page); const from = s.world;
    await page.keyboard.down('w'); await advance(page, 450); await page.keyboard.up('w');
    s = await state(page); assert.ok(s.world.x > from.x + .2 && s.world.z < from.z, 'W must follow the camera, not screen coordinates');
    const yaw = s.camera.yaw; await page.keyboard.down('ArrowLeft'); await advance(page, 350); await page.keyboard.up('ArrowLeft'); assert.ok((await state(page)).camera.yaw > yaw + .3);
    await page.keyboard.press('q'); assert.equal((await state(page)).quiet, false); await page.keyboard.press('q');
    const canvas = await page.locator('canvas').boundingBox(); const cx = canvas.x + canvas.width / 2; const cy = canvas.y + canvas.height / 2;
    const beforeDrag = (await state(page)).camera.yaw; await page.mouse.move(cx, cy); await page.mouse.down({ button: 'right' }); await page.mouse.move(cx + 90, cy + 25, { steps: 6 }); await page.mouse.up({ button: 'right' }); await advance(page, 0); assert.ok((await state(page)).camera.yaw < beforeDrag - .1);
    await page.mouse.click(cx, cy); await page.waitForFunction(() => !!document.pointerLockElement);
    const lockedYaw = (await state(page)).camera.yaw; await page.mouse.move(cx + 150, cy); await advance(page, 0); assert.notEqual((await state(page)).camera.yaw, lockedYaw);
    await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.pointerLockElement); assert.equal((await state(page)).phase, 'paused');
    const frozen = (await state(page)).elapsed; await advance(page, 5000); assert.equal((await state(page)).elapsed, frozen); await capture(page, 'paused-3d');
    await page.getByRole('button', { name: '继续今晚 →' }).click();
    await follow(page); assert.equal((await state(page)).focus, 'shelf');
    await page.keyboard.down('ArrowRight'); await advance(page, 1300); await page.keyboard.up('ArrowRight'); await advance(page, 0);
    assert.equal((await state(page)).focus, null); await page.keyboard.down('e'); await advance(page, 2500); await page.keyboard.up('e'); assert.equal((await state(page)).carry, null, 'looking away cannot pick up the nearby charger');
    await follow(page); assert.equal((await state(page)).focus, 'shelf'); await solve(page);
    checks.push('camera-relative WASD, keyboard turning, mouse drag, pointer lock, pause and gaze-gated interactions');
    // Unlock through actual play, then verify profile and seeded challenge sharing.
    for (let level = 1; level < 5; level++) { await page.getByRole('button', { name: '下一个夜晚 →' }).click(); await page.locator('#hush-start').click(); await solve(page); }
    await page.getByRole('button', { name: '再开一个加班夜 →' }).click(); await page.locator('#hush-start').click(); await solve(page);
    await page.getByRole('button', { name: '复制成绩分享' }).click();
    assert.match(await page.getByLabel('成绩分享文案').inputValue(), /3D.*加班夜/s);
    const shared = await page.evaluate(() => navigator.clipboard.readText()); assert.match(shared, /seed=/);
    const sharedSeed = (await state(page)).seed;
    await page.goto(`${base}/game/hush-live?seed=${sharedSeed}`, { waitUntil: 'networkidle' }); await advance(page, 0);
    assert.equal((await state(page)).level, 5); assert.equal((await state(page)).seed, sharedSeed);
    await choose(page, '再抱一会儿就好');
    if (!await page.getByLabel('玩家身份', { exact: true }).isVisible()) await page.getByText('选择夜晚与角色', { exact: true }).click();
    await page.getByLabel('玩家身份', { exact: true }).selectOption('女友'); await page.getByLabel('恋人称呼', { exact: true }).selectOption('他');
    await page.locator('#hush-start').click(); await follow(page); await page.keyboard.press('m'); await advance(page, 700); await capture(page, 'male-partner');
    await hold(page, 'male-hug'); await solve(page); await capture(page, 'male-ending');
    const saved = await page.evaluate(() => localStorage.getItem('hush-live-v1'));
    await page.reload({ waitUntil: 'networkidle' }); await advance(page, 0); assert.equal((await state(page)).progression.partner, '他'); assert.equal((await state(page)).progression.player, '女友'); assert.equal((await state(page)).progression.unlocked, 5);
    checks.push('all five nights, random night, shared seed, copied score, male partner and saved progression');
    // Context loss pauses before recovering the scene without clearing completed nights.
    await page.locator('#hush-start').click();
    await page.evaluate(() => document.querySelector('canvas').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());
    await page.getByRole('button', { name: '重新载入3D画面 →' }).waitFor(); assert.equal((await state(page)).phase, 'paused');
    await page.getByRole('button', { name: '重新载入3D画面 →' }).click(); await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).webglReady); await page.getByRole('button', { name: '继续今晚 →' }).click();
    assert.equal((await state(page)).progression.unlocked, 5);
    await page.keyboard.press('f'); await page.waitForFunction(() => !!document.fullscreenElement); await page.keyboard.press('f'); await page.waitForFunction(() => !document.fullscreenElement);
    await page.evaluate(() => window.dispatchEvent(new Event('blur'))); assert.equal((await state(page)).phase, 'paused');
    checks.push('WebGL context-loss recovery, fullscreen, blur pause');
    // Real simultaneous touch input, then a full first-night touch playthrough.
    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await mobile.addInitScript(value => localStorage.setItem('hush-live-v1', value), saved);
    const phone = await mobile.newPage(); await open(phone); await choose(phone, '借过一下'); await phone.locator('#hush-start').tap();
    await capture(phone, 'mobile-first-person');
    const joy = await phone.getByRole('button', { name: '移动摇杆' }).boundingBox();
    const cdp = await mobile.newCDPSession(phone);
    const p1 = { id: 1, x: joy.x + joy.width / 2, y: joy.y + joy.height / 2 }; const p2 = { id: 2, x: 275, y: 405 };
    const beforeTouch = await state(phone);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p1, p2] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...p1, y: p1.y - 32 }, { ...p2, x: p2.x + 70, y: p2.y + 20 }] }); await advance(phone, 600);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await advance(phone, 50);
    const afterTouch = await state(phone); assert.notEqual(afterTouch.world.x, beforeTouch.world.x); assert.notEqual(afterTouch.camera.yaw, beforeTouch.camera.yaw);
    const stopped = afterTouch.world; await advance(phone, 500); assert.equal((await state(phone)).world.x, stopped.x);
    for (let i = 0; i < 12 && (await state(phone)).phase === 'playing'; i++) {
      let s = await state(phone); if (!s.action.key || s.action.key !== s.objective.key) await follow(phone);
      s = await state(phone); assert.ok(s.action.key);
      const button = await phone.locator('[data-act="hold"]').boundingBox();
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: button.x + button.width / 2, y: button.y + button.height / 2 }] }); await advance(phone, (s.action.seconds + .1) * 1000);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await advance(phone, 60);
    }
    assert.equal((await state(phone)).won, true); await capture(phone, 'mobile-result');
    await phone.setViewportSize({ width: 320, height: 740 }); await choose(phone, '再抱一会儿就好'); await phone.locator('#hush-start').tap(); await follow(phone); await capture(phone, 'mobile-320-partner');
    await mobile.close(); checks.push('simultaneous mobile joystick and look, touch release, touch interaction, 390/320 layout');
    // Explicit fail/retry and unavailable storage.
    await choose(page, '隔墙有耳'); await page.locator('#hush-start').click();
    await advance(page, (await state(page)).limit * 1000 + 100); assert.equal((await state(page)).reason, 'timeout'); await page.getByRole('button', { name: '再试一次 →' }).click(); assert.equal((await state(page)).phase, 'playing');
    // Make genuine loud footsteps at the microphone until the audience notices.
    await choose(page, '再抱一会儿就好'); await page.locator('#hush-start').click(); await follow(page); await page.keyboard.down('Shift'); await page.keyboard.down('w'); await advance(page, 25000); await page.keyboard.up('w'); await page.keyboard.up('Shift'); assert.equal((await state(page)).reason, 'caught'); await capture(page, 'caught-3d');
    const blocked = await browser.newContext(); await blocked.addInitScript(() => { Storage.prototype.getItem = () => { throw Error('blocked'); }; Storage.prototype.setItem = () => { throw Error('blocked'); }; });
    const blockedPage = await blocked.newPage(); await open(blockedPage); await blockedPage.locator('#hush-start').click(); await solve(blockedPage); assert.equal((await state(blockedPage)).won, true); await blocked.close();
    checks.push('timeout, exposure, retry, storage-unavailable full playthrough');
    // Save an actual full-page WebGL photograph for the game catalogue.
    await choose(page, '再抱一会儿就好');
    if (!await page.getByLabel('恋人称呼', { exact: true }).isVisible()) await page.getByText('选择夜晚与角色', { exact: true }).click();
    await page.getByLabel('恋人称呼', { exact: true }).selectOption('她'); await page.locator('#hush-start').click(); await follow(page); await advance(page, 700);
    const style = await page.addStyleTag({ content: 'main > :not([data-world3d]) { visibility: hidden !important; }' });
    inspectPng(await page.screenshot({ path: 'public/games/hush-live/preview.png', fullPage: true })); await style.evaluate(el => el.remove());
    assert.deepEqual(errors, []);
    fs.writeFileSync(`${out}/controls-report.json`, JSON.stringify({ checks, images, errors }, null, 2)); console.log(JSON.stringify({ checks, screenshots: images.map(i => i.file), errors }, null, 2));
  } finally { await browser.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
