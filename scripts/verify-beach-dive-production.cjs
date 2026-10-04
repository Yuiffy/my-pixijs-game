const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd(), path.join(os.homedir(), '.codex/skills/develop-web-game')] }));
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const url = process.env.BEACH_VOLLEY_URL || 'http://localhost:4020/game/beach-volley';
const output = path.resolve(process.env.BEACH_DIVE_OUTPUT || 'tmp/beach-dive/production');
fs.mkdirSync(output, { recursive: true });
const screenshots = [], checks = [], errors = [];
const state = p => p.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = (p, ms) => p.evaluate(ms => window.advanceTime(ms), ms);

async function context(browser, options = {}) {
  const c = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...options });
  await c.addInitScript(() => {
    if (window.speechSynthesis) window.speechSynthesis.speak = () => {};
    try { localStorage.setItem('beach-volley-cinema', 'off'); } catch { /* about:blank */ }
    // Use the existing public fixed-step clock; no game state/debug hook is exposed.
    // Freeze only the browser-test scheduler, preserving normal gameplay RAF.
    window.requestAnimationFrame = () => 1;
    window.cancelAnimationFrame = () => {};
  });
  await c.route('**/api/record', r => r.fulfill({ json: { success: true } }));
  await c.route(/https:\/\/(pagead2\.googlesyndication\.com|hm\.baidu\.com)\//, r => r.fulfill({ body: '' }));
  c.on('page', p => {
    p.on('pageerror', e => errors.push(e.message));
    p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  });
  return c;
}

async function capture(p, name) {
  const metrics = inspectPng(await p.screenshot({ path: path.join(output, `${name}.png`), fullPage: true, animations: 'disabled' }));
  const canvas = await p.locator('canvas').evaluate(c => ({ width: c.width, height: c.height, displayWidth: c.clientWidth, displayHeight: c.clientHeight }));
  assert.equal(canvas.width, 1280); assert.equal(canvas.height, 720);
  assert.ok(canvas.displayWidth > 0 && canvas.displayHeight > 0);
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  screenshots.push({ name, metrics, canvas, state: await state(p), dom: await p.locator('main').innerText() });
}

async function load(p, character = 'sui', opponent = 'shiori') {
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.waitForFunction(() => window.render_game_to_text && JSON.parse(window.render_game_to_text()).assetsReady);
  assert.equal(await p.evaluate(() => typeof window.beachVolley), 'undefined', 'production has no mutable debug hook');
  await p.getByRole('button', { name: '同机双人', exact: true }).click();
  await p.getByRole('button', { name: new RegExp({ sui: '岁己.*SUI', shiori: '栞栞.*SHIORI', nagisa: '米汀.*NAGISA' }[character]) }).click();
  await p.locator('#beach-opponent').selectOption(opponent);
  await p.locator('#beach-cinema').selectOption('off');
  await p.locator('#beach-start').click(); await p.keyboard.press('Enter');
  assert.equal((await state(p)).phase, 'serve');
  await advance(p, 225);
  const box = await p.locator('canvas').boundingBox();
  await p.locator('canvas').click({ position: { x: box.width / 2, y: box.height * 0.65 } });
  await p.keyboard.down('KeyJ'); await advance(p, 9); await p.keyboard.up('KeyJ');
  assert.equal((await state(p)).phase, 'rally');
}

(async () => {
  assert.equal((await fetch(url)).status, 200, 'confirm production URL before Chrome');
  const browser = await chromium.launch({ channel: 'chrome', headless: process.env.HEADED !== '1', args: ['--mute-audio', '--disable-speech-api'] });
  let failure;
  try {
    const c = await context(browser), p = await c.newPage();
    for (const [character, opponent, backward] of [['sui', 'shiori', false], ['shiori', 'nagisa', true], ['nagisa', 'sui', false]]) {
      await load(p, character, opponent);
      const origin = (await state(p)).players.map(a => a.x);
      const directions = backward ? ['KeyA', 'ArrowRight'] : ['KeyD', 'ArrowLeft'];
      for (const key of [...directions, 'KeyK', 'Period']) await p.keyboard.down(key);
      await advance(p, 120); let s = await state(p);
      assert.ok(s.players.every(a => a.dive.phase === 'flight' && a.dive.lift > 20));
      assert.equal(s.players[0].dive.direction, backward ? -1 : 1);
      assert.equal(s.players[1].dive.direction, backward ? 1 : -1);
      assert.ok(Math.abs(s.players[0].x - origin[0]) > 80 && Math.abs(s.players[1].x - origin[1]) > 80);
      await capture(p, `${character}-${opponent}-${backward ? 'backward' : 'flight'}`);
      for (const key of [...directions, 'KeyK', 'Period']) await p.keyboard.up(key);
      if (character === 'sui') {
        await p.keyboard.press('KeyP'); const paused = await state(p); await advance(p, 2000);
        assert.deepEqual((await state(p)).players, paused.players); assert.deepEqual((await state(p)).ball, paused.ball);
        await p.keyboard.press('KeyP');
        await p.keyboard.down('KeyA'); await p.keyboard.down('ArrowRight'); await p.keyboard.down('Space');
      }
      await advance(p, 180); s = await state(p);
      assert.ok(s.players.every(a => a.dive.phase === 'slide' && a.y === 606));
      if (character === 'sui') await capture(p, 'sui-shiori-slide');
      await advance(p, 200); s = await state(p);
      assert.ok(s.players.every(a => a.dive.phase === 'recover' && a.y === 606));
      assert.equal(s.players[0].dive.direction, backward ? -1 : 1);
      assert.equal(s.players[1].dive.direction, backward ? 1 : -1);
      if (character === 'sui') {
        await capture(p, 'sui-shiori-recover');
        await p.keyboard.up('KeyA'); await p.keyboard.up('ArrowRight'); await p.keyboard.up('Space');
      }
      await advance(p, 150); s = await state(p);
      assert.ok(s.players.every(a => a.dive === null && a.diveCooldown > 0.3));
      await p.keyboard.down('KeyK'); await advance(p, 9); await p.keyboard.up('KeyK');
      assert.equal((await state(p)).players[0].dive, null, 'cooldown applies to a fresh production keypress');
    }
    checks.push('public production keyboard: all actors on both sides, forward/backward travel, flight/slide/recovery, pause, locked direction, blocked jump and cooldown');
    await c.close();

    for (const [width, height] of [[320, 740], [390, 844], [844, 390]]) {
      const mc = await context(browser, { viewport: { width, height }, isMobile: true, hasTouch: true });
      const m = await mc.newPage(); await load(m);
      const cdp = await mc.newCDPSession(m), points = [];
      for (const [side, action] of [[0, 'right'], [0, 'dive'], [1, 'left'], [1, 'dive']]) {
        const b = await m.locator(`[data-control="${side}-${action}"]`).boundingBox();
        assert.ok(b && b.x >= 0 && b.x + b.width <= width + 1 && b.y >= 0 && b.y + b.height <= height + 1);
        points.push({ id: points.length + 1, x: b.x + b.width / 2, y: b.y + b.height / 2 });
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points });
      await advance(m, 120); const s = await state(m);
      assert.equal(s.players[0].dive.direction, 1); assert.equal(s.players[1].dive.direction, -1);
      assert.ok(s.players.every(a => a.dive.phase === 'flight'));
      await capture(m, `touch-${width}`);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
      assert.ok((await state(m)).inputs.flatMap(Object.values).every(v => !v));
      await mc.close();
    }
    checks.push('production 320/390/844 real multi-touch two-player flight and touchcancel');
    assert.deepEqual(errors, []);
  } catch (e) { failure = e.stack || String(e); }
  finally {
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ url, checks, screenshots, errors, failure }, null, 2));
    await browser.close();
  }
  if (failure) throw new Error(failure);
  console.log(JSON.stringify({ checks, screenshots: screenshots.length, errors, output }, null, 2));
})().catch(e => { console.error(e); process.exitCode = 1; });
