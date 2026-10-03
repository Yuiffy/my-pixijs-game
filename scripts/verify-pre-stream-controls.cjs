const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const base = process.env.PRE_STREAM_BASE_URL || 'http://localhost:3984';
const output = process.env.PRE_STREAM_QA_DIR || 'tmp/prep-controls-dev';
const errors = [], screenshots = [], observations = [];
const state = p => p.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = (p, ms) => p.evaluate(n => window.advanceTime(n), ms);
const mini = async p => (await state(p)).minigame;
async function prepare(c) {
  await c.addInitScript(() => { if (window.speechSynthesis) window.speechSynthesis.speak = () => {}; });
  await c.route('**/api/record', r => r.fulfill({ json: { success: true } }));
  await c.route(/https:\/\/(pagead2\.googlesyndication\.com|hm\.baidu\.com)\//, r => r.fulfill({ body: '' }));
  c.on('page', p => {
    p.on('pageerror', e => errors.push(e.message));
    p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  });
}
async function open(p) {
  await p.goto(`${base}/game/pre-stream`);
  await p.waitForFunction(() => !!window.advanceTime && !!document.querySelector('#start-game:not(:disabled)'));
  await p.locator('#start-game').click(); await advance(p, 0);
}
async function visit(p, id) {
  await p.locator(`[data-station="${id}"]`).click();
  for (let i = 0; i < 200; i++) {
    if ((await mini(p))?.kind === id) return;
    await advance(p, 100);
  }
  throw Error(`Cannot visit ${id}`);
}
async function capture(p, name) {
  await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(150);
  const layout = await p.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth,
    canvases: Array.from(document.querySelectorAll('canvas'), c => ({ width: c.width, height: c.height })) }));
  assert.ok(layout.scroll <= layout.width + 1); assert.ok(layout.canvases[0]?.width > 200);
  const file = path.join(output, `${name}.png`);
  const pixels = inspectPng(await p.screenshot({ path: file, fullPage: true, animations: 'disabled' }));
  screenshots.push({ file, pixels, layout, state: await state(p) });
}
async function fillRemaining(p) {
  const m = await mini(p); await advance(p, Math.max(0, (m.targetX - m.fillLevel) * 1500));
}
(async () => {
  fs.mkdirSync(output, { recursive: true });
  assert.equal((await fetch(`${base}/game/pre-stream`, { signal: AbortSignal.timeout(90000) })).status, 200);
  const browser = await chromium.launch({ channel: 'chrome', headless: !process.env.HEADED, args: ['--mute-audio', '--disable-speech-api'] });
  try {
    const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } }); await prepare(desktop);
    const p = await desktop.newPage(); await open(p); await visit(p, 'cat');
    const button = p.locator('[data-cat-pour]'); await button.focus();
    await p.keyboard.down('Enter'); await advance(p, 120);
    const box = await button.boundingBox(); await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await p.mouse.down(); await advance(p, 100); await p.mouse.up();
    const afterPointer = await mini(p); assert.equal(afterPointer.misses, 0); assert.ok(afterPointer.fillLevel > 0);
    await advance(p, 100); assert.ok((await mini(p)).fillLevel > afterPointer.fillLevel, 'Enter must survive mouse release');
    await capture(p, '01-mixed-hold'); await fillRemaining(p); await p.keyboard.up('Enter');
    assert.equal((await mini(p)).hits, 1); assert.equal((await mini(p)).misses, 0);
    // Both native button keys work, and unrelated keyups cannot stop a pour.
    await button.focus(); await p.keyboard.down('Enter'); await p.keyboard.down('Space');
    await advance(p, 100); await p.keyboard.up('Enter'); const beforeSpace = (await mini(p)).fillLevel;
    await advance(p, 100); assert.ok((await mini(p)).fillLevel > beforeSpace);
    await p.keyboard.press('KeyX'); await fillRemaining(p); await p.keyboard.up('Space');
    assert.ok((await state(p)).completed.includes('cat')); await capture(p, '02-keyboard-cat-complete');
    observations.push('Mouse release preserves Enter; Enter/Space owners finish two scoops without misses.');
    // Phase transition clears movement even if a key is still physically down.
    await visit(p, 'toilet'); await p.locator('[data-minigame-action]').focus(); await p.keyboard.down('Enter');
    await advance(p, 100); await p.keyboard.press('KeyP'); assert.ok((await state(p)).paused);
    await p.keyboard.up('Enter'); const paused = await state(p); await advance(p, 1000);
    assert.equal((await state(p)).elapsedMs, paused.elapsedMs); await capture(p, '03-paused-hold');
    await p.locator('#resume-game').click(); await advance(p, 200);
    assert.equal(await p.locator('[data-minigame-action]').getAttribute('data-held'), 'false');
    await p.keyboard.press('Escape'); assert.equal((await state(p)).phase, 'explore');
    await p.locator('[data-station="cat"]').focus(); await p.keyboard.down('KeyD'); await advance(p, 100);
    await p.evaluate(() => window.dispatchEvent(new Event('blur'))); await p.keyboard.up('KeyD');
    assert.ok((await state(p)).paused); await p.locator('#resume-game').click();
    const pos = (await state(p)).player; await advance(p, 300); assert.deepEqual((await state(p)).player, pos);
    observations.push('Pause, Escape, and injected window blur clean up held inputs.');
    await desktop.close();

    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); await prepare(mobile);
    const t = await mobile.newPage(); await open(t); const cdp = await mobile.newCDPSession(t);
    const send = (type, touchPoints) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
    const stick = await t.getByRole('application', { name: '移动摇杆' }).boundingBox(); assert.ok(stick);
    const a = { x: stick.x + stick.width * .75, y: stick.y + stick.height * .5, id: 1 };
    const b = { x: stick.x + stick.width * .25, y: stick.y + stick.height * .5, id: 2 };
    await send('touchStart', [a]); const startX = (await state(t)).player.x;
    await send('touchStart', [a, b]); await advance(t, 100); assert.ok((await state(t)).player.x > startX);
    await send('touchEnd', [b]); const heldX = (await state(t)).player.x;
    await advance(t, 100); assert.ok((await state(t)).player.x > heldX, 'Second finger release must not stop joystick owner');
    await send('touchCancel', []); const stopped = (await state(t)).player;
    await advance(t, 250); assert.deepEqual((await state(t)).player, stopped); await capture(t, '04-joystick-owner');
    await visit(t, 'cat'); const pour = t.locator('[data-cat-pour]'); const rect = await pour.boundingBox();
    const one = { x: rect.x + rect.width * .35, y: rect.y + rect.height * .5, id: 3 };
    const two = { x: rect.x + rect.width * .65, y: rect.y + rect.height * .5, id: 4 };
    await send('touchStart', [one]); await send('touchStart', [one, two]); await advance(t, 120);
    await send('touchEnd', [one]); const amount = (await mini(t)).fillLevel;
    await advance(t, 100); assert.ok((await mini(t)).fillLevel > amount); assert.equal((await mini(t)).misses, 0);
    await fillRemaining(t); await send('touchEnd', []); assert.equal((await mini(t)).hits, 1);
    await send('touchStart', [one]); await advance(t, 150); const partial = await mini(t);
    await send('touchCancel', []); await advance(t, 200); const cancelled = await mini(t);
    assert.equal(cancelled.fillLevel, partial.fillLevel, 'Cancelled gesture must stop pouring');
    assert.equal(cancelled.hits, 1); assert.equal(cancelled.misses, 0); await capture(t, '05-cancelled-pour');
    // Saving a partly filled scoop must not reinterpret resume as a release.
    await t.getByRole('button', { name: '暂停', exact: true }).click();
    await t.reload(); await t.waitForFunction(() => !!window.advanceTime);
    await advance(t, 0); assert.ok((await state(t)).paused);
    await t.locator('#resume-game').click(); await advance(t, 200);
    assert.equal((await mini(t)).fillLevel, partial.fillLevel);
    assert.equal((await mini(t)).misses, 0);
    await send('touchStart', [two]); await fillRemaining(t); await send('touchEnd', []);
    assert.ok((await state(t)).completed.includes('cat'));
    await visit(t, 'toilet'); await t.setViewportSize({ width: 320, height: 740 }); await capture(t, '06-toilet-320');
    await t.setViewportSize({ width: 844, height: 390 });
    const landscapePanel = await t.getByRole('region', { name: '水花靶心小游戏' }).boundingBox();
    const landscapeAim = await t.locator('[data-aim-area]').boundingBox();
    assert.ok(landscapePanel.y >= 60 && landscapePanel.y + landscapePanel.height <= 390, 'Landscape panel stays below the toolbar');
    assert.ok(landscapeAim.y >= 60 && landscapeAim.y + landscapeAim.height <= 390, 'Whole aim surface stays visible');
    const landscapeAction = await t.locator('[data-minigame-action]').boundingBox();
    assert.ok(landscapeAction.y >= 0 && landscapeAction.y + landscapeAction.height <= 390, 'Landscape hold action is visible with its aim surface');
    await capture(t, '07-toilet-landscape');
    observations.push('Real CDP multitouch ownership, joystick cancel, cancelled pour without a miss, fresh touch continuation, 320/390px and landscape.');
    await mobile.close(); assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ passed: true, observations, screenshots, errors }, null, 2));
    console.log(JSON.stringify({ passed: true, screenshots: screenshots.map(x => x.file), errors }));
  } catch (error) {
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ passed: false, failure: String(error.stack), observations, screenshots, errors }, null, 2)); throw error;
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
