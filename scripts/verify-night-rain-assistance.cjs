const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/yuiffy/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const { installVirtualPointerLock } = require('./lib/night-rain-virtual-pointer.cjs');
const base = process.env.NIGHT_RAIN_BASE_URL || 'http://127.0.0.1:3870';
const output = process.env.NIGHT_RAIN_QA_DIR || 'tmp/night-rain-assistance';
fs.mkdirSync(output, { recursive: true });
const evidence = []; const errors = []; const checks = {};
const state = p => p.evaluate(() => JSON.parse(window.render_game_to_text()));
async function capture(p, name) {
  await p.waitForTimeout(400);
  await p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  const s = await state(p); const file = path.join(output, `${name}.png`);
  const pixels = inspectPng(await p.screenshot({ path: file, fullPage: true, animations: 'disabled' }));
  evidence.push({ name, file, pixels }); fs.writeFileSync(path.join(output, `${name}.json`), JSON.stringify(s, null, 2));
}
async function open(browser, options = {}, init) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, ...options });
  await ctx.addInitScript(installVirtualPointerLock);
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${base}/game/night-rain`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.nightRain && document.querySelector('canvas')?.width > 0);
  return { ctx, page };
}
async function press(p, key) { await p.keyboard.press(key); await p.evaluate(() => window.advanceTime(40)); }
async function main() {
  assert.equal((await fetch(`${base}/game/night-rain`)).status, 200);
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const { ctx, page } = await open(browser, {}, () => {
      window.speechEvidence = [];
      if (window.speechSynthesis) {
        const speak = speechSynthesis.speak.bind(speechSynthesis);
        speechSynthesis.speak = u => {
          const log = { text: u.text, lang: u.lang, pitch: u.pitch, events: [] }; window.speechEvidence.push(log);
          for (const event of ['start', 'end', 'error']) u.addEventListener(event, e => log.events.push({ event, error: e.error }));
          speak(u);
        };
      }
    });
    await capture(page, '01-final-title');
    await page.getByLabel('精灵语音', { exact: false }).check();
    await page.getByRole('button', { name: '出门找夜宵', exact: true }).click();
    // Real RAF time and real keyboard; no advance hook here.
    const before = await state(page); await page.keyboard.down('d'); await page.waitForTimeout(450); await page.keyboard.up('d');
    const after = await state(page); assert.ok(after.time > before.time + 0.2); assert.ok(after.player.x > before.player.x + 0.5);
    checks.realTime = { elapsed: after.time - before.time, movement: after.player.x - before.player.x };
    await page.waitForTimeout(700);
    checks.tts = await page.evaluate(() => ({ available: !!window.speechSynthesis, voices: window.speechSynthesis?.getVoices().filter(v => v.lang.startsWith('zh')).map(v => ({ name: v.name, lang: v.lang })), calls: window.speechEvidence }));
    assert.ok(checks.tts.calls.some(c => c.text.includes('下播')));
    await press(page, 'c'); await page.getByRole('button', { name: '🦦 獭獭栞', exact: true }).click();
    await page.getByRole('button', { name: '再说一遍', exact: true }).click(); await page.waitForTimeout(250);
    assert.equal((await state(page)).companion.skin, 'otter');
    await capture(page, '02-otter-and-voice');
    await press(page, 'c'); await page.getByLabel('宝宝模式', { exact: false }).uncheck(); await press(page, 'Escape');
    assert.equal((await state(page)).companion.enabled, false); await capture(page, '03-unassisted');
    await page.evaluate(() => window.nightRain.save()); await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('button', { name: '继续雨夜旅程 →', exact: true }).click();
    assert.equal((await state(page)).companion.enabled, false); assert.equal((await state(page)).companion.skin, 'otter');
    await page.keyboard.down('w'); await page.evaluate(() => window.dispatchEvent(new Event('blur'))); await page.keyboard.up('w');
    const paused = await state(page); await page.evaluate(() => window.advanceTime(2000)); assert.equal((await state(page)).time, paused.time);
    await press(page, 'Escape'); const resumed = await state(page); await page.evaluate(() => window.advanceTime(500));
    assert.deepEqual((await state(page)).player, resumed.player); checks.blurClearsInput = true;
    await press(page, 'p'); await page.getByRole('button', { name: '重新开始', exact: true }).click();
    await press(page, 'p'); assert.ok(await page.getByRole('alertdialog').isVisible()); assert.ok((await state(page)).paused);
    await press(page, 'Escape'); assert.equal(await page.getByRole('alertdialog').count(), 0); assert.ok((await state(page)).paused);
    // Tab stays within modal even when cycling all controls.
    for (let i = 0; i < 16; i++) { await page.keyboard.press('Tab'); assert.ok(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))); }
    checks.modal = true;
    await press(page, 'Escape'); await press(page, 'F10'); assert.ok(await page.evaluate(() => !!document.fullscreenElement)); await press(page, 'F10');
    checks.fullscreen = true;
    // Loss/recovery must retain the actual game state.
    const lostBefore = await state(page);
    await page.evaluate(() => document.querySelector('canvas').dispatchEvent(new Event('webglcontextlost', { cancelable: true })));
    await page.getByRole('button', { name: '重新载入 3D 画面', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('canvas')?.width > 0);
    assert.equal((await state(page)).time, lostBefore.time); checks.contextRecovery = true;
    await ctx.close();

    const mobile = await open(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await mobile.page.getByRole('button', { name: '出门找夜宵', exact: true }).tap();
    const p = mobile.page; const cdp = await mobile.ctx.newCDPSession(p);
    const move = await p.getByRole('button', { name: '向右', exact: true }).boundingBox();
    const action = await p.getByRole('button', { name: '轻击', exact: true }).boundingBox();
    const t1 = { id: 1, x: move.x + move.width / 2, y: move.y + move.height / 2 };
    const m0 = await state(p);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [t1] }); await p.evaluate(() => window.advanceTime(160));
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [t1, { id: 2, x: 285, y: 360 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [t1, { id: 2, x: 335, y: 400 }] });
    await p.evaluate(() => window.advanceTime(160));
    const m1 = await state(p); assert.notEqual(m1.camera.yaw, m0.camera.yaw); assert.ok(m1.player.x > m0.player.x + 0.4);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await p.getByRole('button', { name: '轻击', exact: true }).tap(); await p.evaluate(() => window.advanceTime(40)); assert.equal((await state(p)).player.action, 'light', JSON.stringify(await state(p)));
    checks.multiTouch = { move: m1.player.x - m0.player.x, yaw: m1.camera.yaw - m0.camera.yaw };
    await p.getByRole('button', { name: /饼干岁 C/ }).tap(); await p.getByRole('button', { name: '🦦 獭獭栞', exact: true }).tap();
    await capture(p, '04-mobile-guide-dialog');
    await p.getByRole('button', { name: /直接带我去/ }).tap(); await p.evaluate(() => window.advanceTime(1000));
    await capture(p, '05-mobile-leading'); await mobile.ctx.close();

    for (const blocked of [false, true]) {
      const bad = await open(browser, {}, blocked ? () => { Storage.prototype.setItem = () => { throw new DOMException('disabled', 'SecurityError'); }; Storage.prototype.getItem = () => { throw new DOMException('disabled', 'SecurityError'); }; } : () => localStorage.setItem('night-rain-v1', '{broken'));
      await bad.page.getByRole('button', { name: '出门找夜宵', exact: true }).click(); await press(bad.page, 'e');
      assert.ok((await state(bad.page)).collected.includes('laptop')); await bad.ctx.close();
    }
    checks.storageFallback = true;
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ checks, evidence, errors }, null, 2));
    console.log('Assistance, actual TTS invocation, RAF, multi-touch, persistence, focus, fullscreen and renderer recovery passed.');
  } finally { await browser.close(); }
}
main().catch(e => { fs.writeFileSync(path.join(output, 'failure.json'), JSON.stringify({ error: e.stack, checks, evidence, errors }, null, 2)); console.error(e); process.exitCode = 1; });
