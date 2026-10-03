const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const base = process.env.NEEDLE_BASE_URL || 'http://localhost:3986';
const output = process.env.NEEDLE_QA_DIR || 'tmp/needle-keyboard-dev';
const errors = [], captures = [], runs = [];
const read = p => p.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = (p, ms) => p.evaluate(n => window.advanceTime(n), ms);
const board = p => p.getByRole('application');
async function capture(p, name) {
  await p.waitForTimeout(150);
  const layout = await p.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth,
    canvas: [...document.querySelectorAll('canvas')].map(c => ({ width: c.width, height: c.height })) }));
  assert.ok(layout.scroll <= layout.width + 1); assert.equal(layout.canvas.length, 1); assert.ok(layout.canvas[0].width > 0);
  const file = path.join(output, `${name}.png`);
  const pixels = inspectPng(await p.screenshot({ path: file, fullPage: true }));
  captures.push({ file, pixels, layout, state: await read(p) });
}
async function hold(p, ms, key = 'Space') {
  await p.keyboard.down(key); await advance(p, ms); await p.keyboard.up(key);
}
async function prepare(p) {
  for (const [key, phase] of [['1', 'numb'], ['2', 'wipe'], ['1', 'needle']]) {
    await p.keyboard.press(key); await p.keyboard.press('Home');
    const count = (await read(p)).spots.length;
    for (let i = 0; i < count; i++) { await hold(p, 650, i % 2 ? 'Enter' : 'Space'); if (i < count - 1) await p.keyboard.press('ArrowRight'); }
    assert.equal((await read(p)).phase, phase);
  }
}
async function rotate(p, angle) {
  const delta = angle - (await read(p)).hand.angle;
  if (Math.abs(delta) < 1) return;
  const key = delta > 0 ? 'e' : 'q'; await p.keyboard.down(key); await advance(p, Math.abs(delta) * 1000 / 55); await p.keyboard.up(key);
}
(async () => {
  fs.mkdirSync(output, { recursive: true });
  assert.equal((await fetch(`${base}/game/golden-needle`, { signal: AbortSignal.timeout(90000) })).status, 200);
  const browser = await chromium.launch({ channel: 'chrome', args: ['--mute-audio', '--disable-speech-api'] });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addInitScript(() => { if (window.speechSynthesis) window.speechSynthesis.speak = () => {}; });
    await context.route('**/api/record', r => r.fulfill({ json: { success: true } }));
    await context.route(/https:\/\/(pagead2\.googlesyndication\.com|hm\.baidu\.com)\//, r => r.fulfill({ body: '' }));
    const p = await context.newPage();
    p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    for (const [difficulty, label] of [['gentle', '初诊 · 稳稳来'], ['normal', '进阶 · 手别抖'], ['chaos', '整活 · 遭老罪']]) {
      await p.goto(`${base}/game/golden-needle`);
      await p.waitForFunction(() => !!window.advanceTime);
      await p.getByRole('button', { name: label }).focus(); await p.keyboard.press('Enter');
      await p.getByRole('button', { name: '戴上手套' }).focus(); await p.keyboard.press('Enter'); await advance(p, 0);
      assert.ok(await board(p).evaluate(e => e === document.activeElement));
      await p.keyboard.press('Home'); assert.equal((await read(p)).keyboardSpot, 0);
      await p.keyboard.press('ArrowLeft'); assert.equal((await read(p)).keyboardSpot, (await read(p)).spots.length - 1);
      await p.keyboard.press('ArrowRight'); assert.equal((await read(p)).keyboardSpot, 0);
      await p.keyboard.press('ArrowDown'); const lower = (await read(p)).pointer.y;
      await p.keyboard.press('ArrowUp'); assert.ok((await read(p)).pointer.y < lower);
      await p.keyboard.press('Home');
      if (difficulty === 'gentle') {
        await capture(p, '01-keyboard-target');
        await p.keyboard.down('Space'); await p.keyboard.down('Space');
        await p.keyboard.press('End'); assert.equal((await read(p)).keyboardSpot, 0);
        await p.keyboard.press('Enter'); assert.equal((await read(p)).down, true, 'Unowned Enter must not release Space');
        await p.keyboard.press('Tab'); assert.equal((await read(p)).down, false, 'Leaving board cancels keyboard hold');
        await p.keyboard.up('Space'); await p.keyboard.press('Shift+Tab');
        assert.ok(await board(p).evaluate(e => e === document.activeElement), 'Board is reachable by real Tab navigation');
      }
      await prepare(p); await p.keyboard.press('3'); await p.keyboard.press('Home');
      if (difficulty === 'gentle') {
        await p.keyboard.down('Space'); await advance(p, 600);
        await p.keyboard.press('p'); await p.keyboard.up('Space');
        assert.equal((await read(p)).spots[0].treated, false); assert.equal((await read(p)).pulse, null);
        const paused = await read(p); await advance(p, 500); assert.deepEqual(await read(p), paused);
        await capture(p, '02-keyboard-pause'); await p.keyboard.press('p');
        await board(p).focus(); await p.keyboard.down('Enter'); await advance(p, 600);
        await p.keyboard.press('Tab'); await p.keyboard.up('Enter');
        assert.equal((await read(p)).spots[0].treated, false); assert.equal((await read(p)).mistakes, 0);
        await p.keyboard.press('Shift+Tab');
        await p.keyboard.down('Space'); await advance(p, 200);
        await p.evaluate(() => window.dispatchEvent(new Event('blur'))); await p.keyboard.up('Space');
        assert.equal((await read(p)).pulse, null); assert.equal((await read(p)).mistakes, 0);
        await p.getByRole('button', { name: '怎么玩', exact: true }).focus(); await p.keyboard.press('Enter');
        await p.keyboard.press('ArrowRight'); assert.equal((await read(p)).paused, true);
        await p.keyboard.press('Escape'); await board(p).focus();
      }
      const count = (await read(p)).spots.length;
      for (let i = 0; i < count; i++) {
        await p.keyboard.press('Home'); for (let j = 0; j < i; j++) await p.keyboard.press('ArrowRight');
        let s = await read(p);
        if (s.pain > 30 || s.heat > 35) { await p.keyboard.press('4'); await hold(p, 2000); }
        await p.keyboard.press('3'); await rotate(p, s.spots[i].angle);
        s = await read(p); const timing = (s.timingWindow[0] + s.timingWindow[1]) * 500;
        if (difficulty === 'gentle' && i === 0) {
          await p.keyboard.down('Space');
          const rect = await board(p).boundingBox(); await p.mouse.move(rect.x + rect.width * .5, rect.y + rect.height * .5);
          await p.mouse.down(); await p.mouse.up(); assert.equal((await read(p)).down, true, 'Mouse must not release keyboard stroke');
          await advance(p, timing); await capture(p, '03-keyboard-timing'); await p.keyboard.up('Space');
        } else await hold(p, timing, i % 2 ? 'Enter' : 'Space');
        assert.equal((await read(p)).spots[i].treated, true, `${difficulty} target ${i}`);
      }
      assert.equal((await read(p)).phase, 'cool'); await p.keyboard.press('4'); await p.keyboard.press('Home');
      for (let i = 0; i < count; i++) { await hold(p, 750); if (i < count - 1) await p.keyboard.press('ArrowRight'); }
      const result = await read(p); assert.equal(result.result, 'success'); assert.equal(result.mistakes, 0);
      runs.push({ difficulty, score: result.score, grade: result.grade, spots: count });
      await capture(p, `04-result-${difficulty}`);
    }
    await p.getByRole('button', { name: '再来一局' }).click(); await advance(p, 0);
    await p.setViewportSize({ width: 320, height: 740 }); await board(p).focus(); await p.keyboard.press('Home');
    await hold(p, 650); assert.equal((await read(p)).spots[0].clean, 1); await capture(p, '05-small-keyboard');
    await p.setViewportSize({ width: 844, height: 390 }); await capture(p, '06-landscape');
    // Actual mobile pointer cancellation and pointer-first mixed input.
    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await mobile.addInitScript(() => { if (window.speechSynthesis) window.speechSynthesis.speak = () => {}; });
    await mobile.route('**/api/record', r => r.fulfill({ json: { success: true } }));
    await mobile.route(/https:\/\/(pagead2\.googlesyndication\.com|hm\.baidu\.com)\//, r => r.fulfill({ body: '' }));
    const t = await mobile.newPage(); t.on('pageerror', e => errors.push(e.message)); t.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await t.goto(`${base}/game/golden-needle`); await t.waitForFunction(() => !!window.advanceTime);
    await t.getByRole('button', { name: '戴上手套' }).click(); await advance(t, 0); await board(t).focus(); await prepare(t);
    await t.keyboard.press('3'); await board(t).scrollIntoViewIfNeeded();
    const cdp = await mobile.newCDPSession(t), rect = await t.locator('canvas').boundingBox();
    const target = (await read(t)).spots[0];
    const touch = { x: rect.x + target.x / 760 * rect.width, y: rect.y + target.y / 660 * rect.height, id: 1 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch] }); await advance(t, 600);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    assert.equal((await read(t)).pulse, null); assert.equal((await read(t)).spots[0].treated, false); assert.equal((await read(t)).mistakes, 0);
    await capture(t, '07-touch-cancel');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch] });
    await t.keyboard.press('Space'); assert.equal((await read(t)).down, true, 'Space must not release a touch stroke');
    await advance(t, 780); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert.equal((await read(t)).spots[0].treated, true); assert.equal((await read(t)).mistakes, 0);
    await capture(t, '08-touch-continued'); await mobile.close();
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ passed: true, runs, captures, errors }, null, 2));
    console.log(JSON.stringify({ passed: true, runs, screenshots: captures.length, errors }));
  } catch (e) {
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ passed: false, error: String(e.stack), runs, captures, errors }, null, 2)); throw e;
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
