const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd(), path.join(os.homedir(), '.codex/skills/develop-web-game')] }));
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const url = process.env.BEACH_VOLLEY_URL || 'http://localhost:4019/game/beach-volley';
const output = path.resolve(process.env.BEACH_DIVE_OUTPUT || 'tmp/beach-dive/dev');
fs.mkdirSync(output, { recursive: true });
const screenshots = [], checks = [], errors = [];
const actors = ['sui', 'shiori', 'nagisa'];
const state = p => p.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = (p, ms) => p.evaluate(ms => window.advanceTime(ms), ms);
const keys = [['KeyA', 'KeyD', 'KeyK'], ['ArrowLeft', 'ArrowRight', 'Period']];
const noHolds = s => s.inputs.flatMap(Object.values).every(v => !v);

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
    try { localStorage.setItem('beach-volley-cinema', 'off'); } catch { /* about:blank has no storage */ }
  });
  await c.route('**/api/record', r => r.fulfill({ json: { success: true } }));
  await c.route(/https:\/\/(pagead2\.googlesyndication\.com|hm\.baidu\.com)\//, r => r.fulfill({ body: '' }));
  c.on('page', p => {
    p.on('pageerror', e => errors.push(e.message));
    p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  });
  return c;
}

async function load(p, character = 'sui', opponent = 'shiori') {
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.waitForFunction(() => window.beachVolley && JSON.parse(window.render_game_to_text()).assetsReady);
  await p.evaluate(() => window.beachVolley.manual(true));
  await p.getByRole('button', { name: '同机双人', exact: true }).click();
  await p.getByRole('button', { name: new RegExp({ sui: '岁己.*SUI', shiori: '栞栞.*SHIORI', nagisa: '米汀.*NAGISA' }[character]) }).click();
  await p.locator('#beach-opponent').selectOption(opponent);
  await p.locator('#beach-start').click();
  await p.keyboard.press('Enter');
  assert.equal((await state(p)).phase, 'serve');
  const canvas = await p.locator('canvas').boundingBox();
  await p.locator('canvas').click({ position: { x: canvas.width / 2, y: canvas.height * 0.65 } });
}

async function rig(p, backward = false) {
  await p.evaluate(backward => {
    const g = window.beachVolley.game();
    Object.assign(g, { phase: 'rally', phaseTime: 0, paused: false, freeze: 0, cutin: null, specialWindup: null,
      trail: [], effects: [], hits: [0, 0], score: [0, 0], event: null, lastContact: null });
    const idle = { left: false, right: false, jump: false, hit: false, dive: false, special: false, aimUp: false, aimDown: false };
    g.players.forEach((p, i) => Object.assign(p, { x: backward ? i ? 830 : 450 : i ? 1050 : 230,
      y: 606, vx: 0, vy: 0, dive: 0, cooldown: 0, swing: 0, special: 0, energy: 36, pose: 0, shotAim: null, lastInput: { ...idle } }));
    g.ball = { x: 1250, y: 60, vx: 0, vy: 0, spin: 0, lastHit: null, lock: 5, power: null };
  }, backward);
  // Let the normal simulation/UI sync observe rally before capturing any pose.
  await advance(p, 225);
}

async function launch(p, backward = false) {
  for (const side of [0, 1]) {
    await p.keyboard.down(keys[side][Number(side === 0 ? !backward : backward)]);
    await p.keyboard.down(keys[side][2]);
  }
  await advance(p, 120);
  for (const side of [0, 1]) await p.keyboard.up(keys[side][2]);
}

async function releaseDirections(p) {
  for (const [left, right] of keys) { await p.keyboard.up(left); await p.keyboard.up(right); }
}

(async () => {
  assert.equal((await fetch(url)).status, 200, 'server responds before Chrome launches');
  const browser = await chromium.launch({ channel: 'chrome', headless: process.env.HEADED !== '1', args: ['--mute-audio', '--disable-speech-api'] });
  let failure;
  try {
    const c = await context(browser), p = await c.newPage();
    for (let i = 0; i < actors.length; i++) {
      const name = `${actors[i]}-${actors[(i + 1) % actors.length]}`;
      await load(p, actors[i], actors[(i + 1) % actors.length]);
      await rig(p); const origin = await state(p); await launch(p);
      let s = await state(p);
      assert.ok(s.players.every(a => a.dive.phase === 'flight' && a.dive.lift > 20));
      assert.ok(s.players[0].x > origin.players[0].x + 80 && s.players[1].x < origin.players[1].x - 80);
      await capture(p, `${name}-flight`);
      await releaseDirections(p);
      await p.keyboard.down('KeyA'); await p.keyboard.down('ArrowRight'); await p.keyboard.down('Space');
      await advance(p, 180); s = await state(p);
      assert.ok(s.players.every(a => a.dive.phase === 'slide' && a.y === 606));
      assert.equal(s.players[0].dive.direction, 1); assert.equal(s.players[1].dive.direction, -1);
      const sliding = s.players.map(a => a.x);
      await capture(p, `${name}-slide`);
      await advance(p, 200); s = await state(p);
      assert.ok(s.players.every(a => a.dive.phase === 'recover' && a.y === 606));
      assert.ok(s.players[0].x > sliding[0] && s.players[1].x < sliding[1], 'reversal cannot turn an active dive');
      await capture(p, `${name}-recover`);
      await advance(p, 150); s = await state(p);
      assert.ok(s.players.every(a => a.dive === null && a.diveCooldown > 0.3));
      await releaseDirections(p); await p.keyboard.up('Space');
      await rig(p, true); await launch(p, true); s = await state(p);
      assert.equal(s.players[0].dive.direction, -1); assert.equal(s.players[1].dive.direction, 1);
      await capture(p, `${name}-backward`); await releaseDirections(p);
    }
    checks.push('three actors on both sides: airborne reach, landing slide, recovery, reverse travel and locked input direction');

    await p.getByRole('button', { name: '暂停比赛', exact: true }).click();
    const paused = await state(p); await advance(p, 2000);
    assert.deepEqual((await state(p)).players, paused.players); assert.deepEqual((await state(p)).ball, paused.ball);
    await p.getByRole('button', { name: '继续比赛', exact: true }).last().click();
    await advance(p, 220); assert.equal((await state(p)).players[0].dive.phase, 'slide');
    checks.push('pausing preserves the flight and cooldown; resume continues the same dive');

    await rig(p); await p.evaluate(() => {
      const g = window.beachVolley.game();
      g.players[0].x = 320;
      Object.assign(g.ball, { x: 410, y: 576, vy: 200, lock: 0, lastHit: 1 });
    });
    await p.keyboard.down('KeyD'); await p.keyboard.down('KeyK'); await advance(p, 9);
    let s = await state(p); assert.equal(s.hits[0], 1); assert.equal(s.ball.lastHit, 0);
    assert.ok(s.ball.vy < -600); assert.deepEqual(s.score, [0, 0]);
    await capture(p, 'low-forward-save'); await p.keyboard.up('KeyK'); await p.keyboard.up('KeyD');
    checks.push('actual low front contact is saved in a rally without awarding a point');

    await load(p); await p.getByRole('button', { name: '玩法说明', exact: true }).click();
    assert.match(await p.locator('main').innerText(), /朝移动方向飞扑；落地后撑起恢复/);
    await p.getByRole('button', { name: '明白，去接球' }).click();
    checks.push('help and controls describe the new flying dive');
    await c.close();

    for (const [width, height] of [[320, 740], [390, 844], [844, 390]]) {
      const mc = await context(browser, { viewport: { width, height }, isMobile: true, hasTouch: true });
      const m = await mc.newPage(); await load(m); await rig(m);
      const cdp = await mc.newCDPSession(m);
      const points = [];
      for (const [side, action] of [[0, 'right'], [0, 'dive'], [1, 'left'], [1, 'dive']]) {
        const button = m.locator(`[data-control="${side}-${action}"]`), b = await button.boundingBox();
        assert.ok(b && b.x >= 0 && b.x + b.width <= width + 1 && b.y >= 0 && b.y + b.height <= height + 1);
        if (action === 'dive') assert.equal(await button.innerText(), '飞扑');
        points.push({ x: b.x + b.width / 2, y: b.y + b.height / 2, id: points.length + 1 });
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points });
      await advance(m, 120); s = await state(m);
      assert.equal(s.players[0].dive.direction, 1); assert.equal(s.players[1].dive.direction, -1);
      assert.ok(s.players.every(a => a.dive.phase === 'flight'));
      await capture(m, `touch-${width}`);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
      assert.ok(noHolds(await state(m))); await mc.close();
    }
    checks.push('320/390/844 layouts: real four-finger two-player dives, readable controls, cancellation without stuck keys');
    assert.deepEqual(errors, []);
  } catch (e) { failure = e.stack || String(e); }
  finally {
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ url, checks, screenshots, errors, failure }, null, 2));
    await browser.close();
  }
  if (failure) throw new Error(failure);
  console.log(JSON.stringify({ checks, screenshots: screenshots.length, errors, output }, null, 2));
})().catch(e => { console.error(e); process.exitCode = 1; });
