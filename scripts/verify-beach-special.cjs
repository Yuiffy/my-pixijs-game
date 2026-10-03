const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd(), path.join(os.homedir(), '.codex/skills/develop-web-game')] }));
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const url = process.env.BEACH_VOLLEY_URL || 'http://localhost:4010/game/beach-volley';
const output = path.resolve(process.env.BEACH_SPECIAL_OUTPUT || 'tmp/beach-special-dev');
fs.mkdirSync(output, { recursive: true });
const checks = [], screenshots = [], errors = [], launches = [];
const state = p => p.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = (p, ms) => p.evaluate(ms => window.advanceTime(ms), ms);
const held = s => ({ ball: s.ball, score: s.score, hits: s.hits, specials: s.specials, windup: s.specialWindup });
async function capture(p, name) {
  const metrics = inspectPng(await p.screenshot({ path: path.join(output, `${name}.png`), fullPage: true, animations: 'disabled' }));
  const canvas = await p.locator('canvas').evaluate(c => ({ width: c.width, height: c.height, displayWidth: c.clientWidth, displayHeight: c.clientHeight }));
  assert.equal(canvas.width, 1280); assert.equal(canvas.height, 720);
  assert.ok(canvas.displayWidth > 0 && canvas.displayHeight > 0);
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal overflow');
  screenshots.push({ name, metrics, canvas, state: await state(p), dom: await p.locator('main').innerText() });
}
async function context(browser, options = {}) {
  const c = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...options });
  await c.addInitScript(() => {
    if (window.speechSynthesis) window.speechSynthesis.speak = () => {};
    const schedule = window.setTimeout.bind(window);
    window.__specialTimeouts = [];
    window.setTimeout = (callback, delay, ...args) => {
      if (typeof callback === 'function' && delay === 16000) window.__specialTimeouts.push(callback);
      return schedule(callback, delay, ...args);
    };
  });
  await c.route('**/api/record', r => r.fulfill({ json: { success: true } }));
  await c.route(/https:\/\/(pagead2\.googlesyndication\.com|hm\.baidu\.com)\//, r => r.fulfill({ body: '' }));
  c.on('page', p => {
    p.on('pageerror', e => errors.push(e.message));
    p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  });
  return c;
}
async function load(p, character = 'sui', opponent = 'shiori', cinema = 'all') {
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.waitForFunction(() => window.beachVolley && JSON.parse(window.render_game_to_text()).assetsReady);
  await p.evaluate(() => window.beachVolley.manual(true));
  await p.getByRole('button', { name: '同机双人', exact: true }).click();
  await p.getByRole('button', { name: new RegExp({ sui: '岁己.*SUI', shiori: '栞栞.*SHIORI', nagisa: '米汀.*NAGISA' }[character]) }).click();
  await p.locator('#beach-opponent').selectOption(opponent);
  await p.locator('#beach-cinema').selectOption(cinema);
  await p.locator('#beach-start').click();
  await p.keyboard.press('Enter');
  assert.equal((await state(p)).phase, 'serve', 'entrance can still be skipped');
  await p.locator('canvas').click({ position: { x: 40, y: 40 } });
}
async function rig(p, side = 0) {
  await p.evaluate(side => {
    const g = window.beachVolley.game();
    Object.assign(g, { phase: 'rally', phaseTime: 0, paused: false, freeze: 0, cutin: null, specialWindup: null, score: [0, 0], trail: [], effects: [] });
    const idle = { left: false, right: false, jump: false, hit: false, dive: false, special: false, aimUp: false, aimDown: false };
    g.players.forEach((p, i) => Object.assign(p, { x: i ? 1110 : 170, y: 606, vx: 0, vy: 0, energy: 36, swing: 0, special: 0, dive: 0, cooldown: 0, shotAim: null, pose: 0, lastInput: { ...idle } }));
    Object.assign(g.players[side], { x: side ? 830 : 450, y: 378, energy: 100 });
    g.ball = { x: g.players[side].x, y: 260, vx: 0, vy: 100, spin: 0, lastHit: 1 - side, lock: 0, power: null };
  }, side);
  await advance(p, 0);
}
async function trigger(p, side = 0) {
  await p.keyboard.down(side ? 'ArrowDown' : 'KeyS');
  await p.keyboard.down(side ? 'Comma' : 'KeyL');
  await advance(p, 9);
  await p.keyboard.up(side ? 'Comma' : 'KeyL');
  await p.keyboard.up(side ? 'ArrowDown' : 'KeyS');
}
async function finishNaturally(p) {
  const id = (await state(p)).cinematic.id;
  await p.locator('video').evaluate(v => { v.playbackRate = 3; });
  await p.waitForFunction(id => JSON.parse(window.render_game_to_text()).cinematic?.id !== id, id, { timeout: 10000 });
  const s = await state(p);
  assert.equal(s.cinematic, null); assert.equal(s.freeze, 0); assert.equal(s.paused, false);
  assert.equal(s.specialWindup.remaining, 0.8); assert.equal(s.ball.vx, 0); assert.equal(s.ball.vy, 0);
}
async function releaseAndReceive(p, side, name) {
  const before = await state(p), defender = 1 - side, x = before.players[defender].x;
  const attackPosition = before.players[side];
  const defenseKey = defender ? 'ArrowLeft' : 'KeyD';
  const attackKey = side ? 'ArrowRight' : 'KeyA';
  await p.keyboard.down(defenseKey); await p.keyboard.down(attackKey);
  await advance(p, 350);
  let s = await state(p); assert.equal(s.ball.vx, 0); assert.equal(s.specialWindup.remaining, 0.45);
  assert.ok(Math.abs(s.players[defender].x - x) > 100);
  assert.equal(s.players[side].x, attackPosition.x); assert.equal(s.players[side].y, attackPosition.y);
  if (name) await capture(p, `${name}-anticipation`);
  await advance(p, 225); await p.keyboard.up(defenseKey); await p.keyboard.up(attackKey);
  await advance(p, 216.6667);
  s = await state(p); assert.ok(s.specialWindup); assert.equal(s.ball.vx, 0); assert.equal(s.players[side].pose, 5);
  await p.keyboard.press('Enter'); assert.ok((await state(p)).specialWindup, 'Enter cannot finish the court action');
  if (name) await capture(p, `${name}-strike`);
  await advance(p, 8.3333); s = await state(p);
  assert.equal(s.specialWindup, null); assert.ok(Math.abs(s.ball.vx) > 700); assert.equal(s.event.type, 'spike');
  assert.deepEqual(s.ball.shot, before.ball.shot); assert.deepEqual(s.specials, before.specials);
  assert.equal(s.players[side].energy, 0); assert.deepEqual(s.score, [0, 0]);
  const received = s.hits[defender];
  // Follow the different real arcs using ordinary defender keys after launch.
  const gravity = { sui: [1, 1], shiori: [0.7, 1.52], nagisa: [0.9, 1.18] }[s.ball.power];
  const future = { ...s.ball };
  for (let i = 0; i < 240 && future.y < 488; i++) {
    const crossed = side === 0 ? future.x > 685 : future.x < 595;
    future.vy += 1270 * gravity[crossed ? 1 : 0] / 120;
    future.x += future.vx / 120; future.y += future.vy / 120;
  }
  let activeKey = null;
  for (let i = 0; i < 40 && s.hits[defender] === received && s.phase === 'rally'; i++) {
    const difference = future.x - s.players[defender].x;
    const key = Math.abs(difference) < 8 ? null : difference > 0 ? (defender ? 'ArrowRight' : 'KeyD') : (defender ? 'ArrowLeft' : 'KeyA');
    if (activeKey !== key) {
      if (activeKey) await p.keyboard.up(activeKey);
      if (key) await p.keyboard.down(key);
      activeKey = key;
    }
    await advance(p, 25); s = await state(p);
  }
  if (activeKey) await p.keyboard.up(activeKey);
  assert.ok(s.hits[defender] > received, `${side}/${s.players[side].character}: normal automatic defense returns the actual shot`);
  assert.equal(s.ball.lastHit, defender); assert.equal(s.ball.power, null); assert.deepEqual(s.score, [0, 0]);
  launches.push({ side, character: s.players[side].character, shot: s.ball, hits: s.hits });
}

(async () => {
  assert.equal((await fetch(url)).status, 200, 'server responds before Chrome launches');
  const browser = await chromium.launch({ channel: 'chrome', headless: process.env.HEADED !== '1', args: ['--mute-audio', '--disable-speech-api'] });
  try {
    const c = await context(browser), p = await c.newPage();
    for (const side of [0, 1]) for (const character of ['sui', 'shiori', 'nagisa']) {
      await load(p, side ? 'sui' : character, side ? character : 'shiori'); await rig(p, side); await trigger(p, side);
      let s = await state(p); assert.equal(s.cinematic.kind, 'special'); assert.equal(s.cinematic.character, character);
      assert.equal(await p.getByRole('button', { name: /跳过/ }).count(), 0, 'special exposes no skip button');
      const id = s.cinematic.id, frozen = held(s);
      await p.keyboard.press('Enter'); await advance(p, 3000);
      s = await state(p); assert.equal(s.cinematic.id, id); assert.deepEqual(held(s), frozen);
      await p.waitForFunction(() => document.querySelector('video')?.currentTime > 0.2);
      if (side === 0 && character === 'sui') {
        await p.keyboard.press('Escape'); const t = await p.locator('video').evaluate(v => v.currentTime);
        await p.waitForTimeout(200); assert.ok(Math.abs(await p.locator('video').evaluate(v => v.currentTime) - t) < 0.05);
        await p.keyboard.press('Enter'); assert.equal((await state(p)).cinematic.id, id); assert.equal((await state(p)).cinematic.paused, true);
        await capture(p, '01-mandatory-video-paused');
        await p.getByRole('button', { name: '玩法说明', exact: true }).click();
        await p.getByRole('button', { name: '明白，去接球' }).click(); assert.equal((await state(p)).cinematic.paused, true);
        await p.keyboard.press('KeyP'); await p.waitForTimeout(100);
        await p.getByRole('button', { name: '玩法说明', exact: true }).click();
        await p.getByRole('button', { name: '明白，去接球' }).click(); assert.equal((await state(p)).cinematic.paused, false);
        await p.evaluate(() => window.dispatchEvent(new Event('blur')));
        await p.keyboard.press('Enter'); assert.equal((await state(p)).cinematic.paused, true);
        await p.keyboard.press('KeyP');
      }
      await finishNaturally(p);
      await releaseAndReceive(p, side, side === 0 && character === 'sui' ? '02-court' : side === 1 && character === 'nagisa' ? '03-nagisa-2p' : null);
    }
    checks.push('all three characters on both sides: mandatory natural video, full court windup, attacker commitment, defender movement and real successful receive');
    checks.push('Enter immunity, Escape/P movie pause, help and blur protection, no skip controls');

    await load(p); await rig(p); await trigger(p);
    await p.locator('video').evaluate(v => v.dispatchEvent(new Event('error')));
    assert.equal((await state(p)).specialWindup.remaining, 0.8); await releaseAndReceive(p, 0);
    await rig(p); await trigger(p);
    await p.locator('video').evaluate(v => v.pause()); await p.evaluate(() => window.__specialTimeouts.at(-1)());
    assert.equal((await state(p)).cinematic, null); assert.equal((await state(p)).specialWindup.remaining, 0.8);
    const heldBeforeStale = held(await state(p));
    await p.evaluate(() => window.__specialTimeouts.at(-1)()); assert.deepEqual(held(await state(p)), heldBeforeStale);
    await releaseAndReceive(p, 0);
    checks.push('media error and stalled-video watchdog retain a full reaction window; stale callbacks cannot consume it');

    await rig(p); await trigger(p); await finishNaturally(p); await advance(p, 200);
    await p.keyboard.press('KeyP'); const paused = await state(p); await advance(p, 5000);
    assert.deepEqual(held(await state(p)), held(paused));
    await p.getByRole('button', { name: '玩法说明', exact: true }).click();
    await advance(p, 2000); assert.deepEqual(held(await state(p)), held(paused));
    await p.getByRole('button', { name: '明白，去接球' }).click(); await p.keyboard.press('KeyP');
    assert.equal((await state(p)).specialWindup.remaining, 0.6);
    await p.evaluate(() => window.dispatchEvent(new Event('blur'))); await advance(p, 1000);
    assert.equal((await state(p)).specialWindup.remaining, 0.6); await p.keyboard.press('KeyP');
    await p.keyboard.press('KeyP'); await p.getByRole('button', { name: '重新开局', exact: true }).click();
    assert.equal((await state(p)).specialWindup, null); assert.deepEqual((await state(p)).score, [0, 0]);
    checks.push('windup pause, help, blur and rematch keep or reset the pending attack correctly');

    for (const reducedMotion of ['no-preference', 'reduce']) {
      await p.emulateMedia({ reducedMotion }); await load(p, 'nagisa', 'shiori', reducedMotion === 'reduce' ? 'all' : 'off');
      await rig(p); await trigger(p); assert.equal((await state(p)).cinematic, null);
      await p.keyboard.press('Enter'); assert.ok((await state(p)).freeze > 0);
      assert.equal(await p.getByRole('button', { name: /跳过/ }).count(), 0);
      if (reducedMotion === 'no-preference') await capture(p, '04-static-unskippable');
      await advance(p, 760); assert.equal((await state(p)).specialWindup.remaining, 0.8);
      await releaseAndReceive(p, 0, reducedMotion === 'reduce' ? '05-reduced-motion' : null);
    }
    checks.push('videos off and reduced motion preserve mandatory static presentation and identical reaction time');

    const mc = await context(browser, { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
    const m = await mc.newPage(); await load(m, 'sui', 'nagisa');
    const cdp = await mc.newCDPSession(m);
    const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
    async function point(side, action, id) {
      const b = await m.locator(`[data-control="${side}-${action}"]`).boundingBox(); assert.ok(b);
      return { x: b.x + b.width / 2, y: b.y + b.height / 2, id };
    }
    for (const side of [0, 1]) for (const action of ['jump', 'dive']) {
      await rig(m, side); await trigger(m, side); await finishNaturally(m);
      const defender = 1 - side, before = await state(m);
      const points = [await point(defender, defender ? 'left' : 'right', 1), await point(defender, action, 2)];
      await touch('touchStart', points); await advance(m, 150);
      const s = await state(m); assert.equal(s.ball.vx, 0); assert.equal(s.specialWindup.remaining, 0.65);
      assert.ok(Math.abs(s.players[defender].x - before.players[defender].x) > 20);
      if (action === 'jump') assert.ok(s.players[defender].y < 520);
      else assert.equal(s.players[defender].diving, true);
      await capture(m, `06-touch-${defender}-${action}`); await touch('touchEnd', []);
      await advance(m, 650); assert.equal((await state(m)).specialWindup, null);
    }
    await m.setViewportSize({ width: 390, height: 844 }); await rig(m); await trigger(m); await finishNaturally(m);
    await capture(m, '07-portrait-windup');
    checks.push('real two-finger Chrome touch permits both defenders to move with jump/dive during the windup, landscape and portrait');
    assert.deepEqual(errors, [], 'no page or console errors');
    console.log(JSON.stringify({ checks, launches: launches.length, screenshots: screenshots.map(s => s.name), errors }, null, 2));
  } finally {
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ checks, launches, screenshots, errors }, null, 2));
    await browser.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
