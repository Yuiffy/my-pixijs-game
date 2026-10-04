const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd(), path.join(os.homedir(), '.codex/skills/develop-web-game')] }));
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const url = process.env.TIDAL_DUEL_URL || 'http://localhost:4042/game/tidal-duel';
const output = path.resolve(process.env.TIDAL_DUEL_OUTPUT || 'tmp/tidal-air/browser');
const publicOnly = process.env.TIDAL_DUEL_PUBLIC_MATCH === '1';
const frameMs = 1000 / 120;
const actions = ['left', 'right', 'jump', 'crouch', 'light', 'medium', 'heavy', 'ability', 'assist', 'punch', 'kick', 'guard', 'hold', 'throw', 'sidestep', 'special', 'skill', 'rise', 'burst'];
const layouts = [
  { left: 'KeyA', right: 'KeyD', jump: 'KeyW', crouch: 'KeyS', light: 'KeyJ', medium: 'KeyK', heavy: 'KeyL', ability: 'KeyU', assist: 'KeyI' },
  { left: 'ArrowLeft', right: 'ArrowRight', jump: 'ArrowUp', crouch: 'ArrowDown', light: 'Digit1', medium: 'Digit2', heavy: 'Digit3', ability: 'Digit4', assist: 'Digit5' },
];
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = (page, ms) => page.evaluate(ms => window.advanceTime(ms), ms);
const button = (page, name) => page.getByRole('button', { name, exact: true });
class CaptureFailure extends Error {}

async function keys(page, codes, ms = frameMs) {
  for (const code of codes) await page.keyboard.down(code);
  await advance(page, ms);
  for (const code of [...codes].reverse()) await page.keyboard.up(code);
  await advance(page, frameMs);
}
async function until(page, predicate, limit = 240) {
  for (let n = 0; n < limit; n++) {
    const s = await state(page);
    if (predicate(s)) return s;
    await advance(page, frameMs);
  }
  assert.fail('Expected air-combat transition did not occur in two seconds');
}
async function menu(page) {
  await button(page, '返回选人').last().click();
  if (await page.getByRole('dialog').isVisible()) await page.getByRole('dialog').getByRole('button', { name: '返回选人', exact: true }).click();
}
async function start(page, mode = 'local') {
  await button(page, mode === 'local' ? '同机双人' : '自由练习').click();
  await page.locator('#tidal-start').click();
  await page.keyboard.press('Enter'); await advance(page, 20);
  assert.equal((await state(page)).phase, 'fight');
}
async function rig(page, options = {}) {
  assert.equal(publicOnly, false, 'Production acceptance must use public controls');
  await page.evaluate(({ actions, options }) => {
    const g = window.tidalDuel.game();
    Object.assign(g, { phase: 'fight', phaseTime: 0, paused: false, accumulator: 0, freeze: 0, super: null, events: [], projectiles: [], grabs: [], roundTimer: 60 });
    g.options.mode = 'local'; g.camera.shake = 0;
    const positions = options.positions || [550, 680];
    g.fighters.forEach((f, side) => {
      for (const action of actions) window.tidalDuel.input(side, action, false);
      Object.assign(f, { x: positions[side], y: 610, z: 0, vx: 0, vy: 0, facing: positions[side] < positions[1 - side] ? 1 : -1,
        state: 'idle', stateTime: 0, stateDuration: 0, hp: 300, meter: 0, move: null, moveTime: 0, moveHit: false, moveSerial: 0,
        stun: 0, critical: 0, invincible: 0, juggle: 0, combo: 0, comboTime: 0, comboDamage: 0, guardGauge: 100, guardDelay: 0,
        contact: 'none', burstReady: true, throwTech: 0, holdCooldown: 0, stepCooldown: 0,
        assisted: null, airAttacks: 0, airRank: 0, airLanding: 0, buffer: [], directions: [], history: [],
        previous: Object.fromEntries(actions.map(a => [a, false])), ...options.fighters?.[side] });
    });
  }, { actions, options });
  await advance(page, 0);
}
async function capture(page, report, name) {
  const file = path.join(output, `${name}.png`);
  let pixels;
  try { pixels = inspectPng(await page.screenshot({ path: file, fullPage: true, animations: 'disabled' })); }
  catch (error) { throw new CaptureFailure(error.message); }
  const s = await state(page);
  const dom = await page.evaluate(() => ({ viewport: innerWidth, width: document.documentElement.scrollWidth,
    canvas: [...document.querySelectorAll('canvas')].map(c => ({ width: c.width, height: c.height, rect: c.getBoundingClientRect().toJSON() })),
    controls: [...document.querySelectorAll('[data-control]')].map(c => ({ action: c.dataset.control, rect: c.getBoundingClientRect().toJSON() })) }));
  assert.ok(pixels.colors > 8 && pixels.transparentRatio < 0.98 && pixels.nearBlackRatio < 0.96);
  assert.equal(s.assetsReady, true); assert.equal(s.title, '潮夜格斗 · 岁己 vs 栞栞');
  assert.ok(dom.width <= dom.viewport + 1); assert.equal(dom.canvas.length, 1);
  assert.equal(dom.canvas[0].width, 1280); assert.equal(dom.canvas[0].height, 720); assert.ok(dom.canvas[0].rect.width > 0);
  report.screenshots.push({ name, file, pixels, state: s, dom });
}
async function atlases(page, report) {
  report.atlases = await page.evaluate(async () => {
    const compiled = await (await fetch('/games/tidal-duel/pixel/compiled-air.json')).json();
    const result = [];
    for (const metadata of compiled) {
      const image = new Image(); image.src = `/games/tidal-duel/pixel/${metadata.file}`; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = metadata.frameSize;
      const ctx = canvas.getContext('2d', { willReadFrequently: true }); const frames = [];
      for (let index = 0; index < 16; index++) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(image, index % 4 * 448, Math.floor(index / 4) * 448, 448, 448, 0, 0, 448, 448);
        const data = ctx.getImageData(0, 0, 448, 448).data;
        let left = 448, right = -1, top = 448, bottom = -1, opaque = 0, partial = 0;
        for (let i = 3; i < data.length; i += 4) if (data[i]) {
          const p = (i - 3) / 4, x = p % 448, y = Math.floor(p / 448);
          left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y); opaque++;
          if (data[i] !== 255) partial++;
        }
        frames.push({ index, bounds: [left, top, right + 1, bottom + 1], opaque, partial });
      }
      result.push({ width: image.naturalWidth, height: image.naturalHeight, metadata, frames });
    }
    return result;
  });
  assert.equal(report.atlases.length, 4);
  for (const a of report.atlases) {
    assert.equal(a.width, 1792); assert.equal(a.height, 1792);
    assert.deepEqual(a.metadata.anchor, [224, 440]);
    for (const f of a.frames) {
      assert.ok(f.opaque > 1000 && f.opaque < 448 * 448 / 2); assert.equal(f.partial, 0);
      assert.ok(f.bounds[0] > 0 && f.bounds[1] > 0 && f.bounds[2] < 448 && f.bounds[3] < 448);
      assert.deepEqual(f.bounds, a.metadata.frameBounds[f.index]);
      assert.deepEqual(a.metadata.frameRoots[f.index], [224, 340]);
    }
  }
  report.checks.push('All 64 shipped aerial WebP frames decode with binary alpha, clear padding, recorded bounds and a stable pelvis anchor');
}
async function development(page, report) {
  await start(page);
  for (const side of [0, 1]) for (const [action, move] of [['light', 'airPunch'], ['medium', 'airKick'], ['heavy', 'airHeavy']]) {
    for (const order of ['together', 'jump-first', 'attack-first']) {
      await rig(page, { positions: [350, 920] });
      const layout = layouts[side], codes = order === 'attack-first' ? [layout[action], layout.jump] : [layout.jump, layout[action]];
      await page.keyboard.down(codes[0]); if (order !== 'together') await advance(page, 33);
      await page.keyboard.down(codes[1]); await advance(page, 33);
      const f = (await state(page)).fighters[side];
      assert.equal(f.move, move, `${side}/${action}/${order}`); assert.equal(f.airAttacks, 1); assert.ok(f.airborne);
      for (const code of codes) await page.keyboard.up(code); await advance(page, frameMs);
    }
  }
  report.checks.push('Actual keyboard jump+light/medium/heavy in both player slots, simultaneous and 33ms apart in either order');
  for (const skin of ['original', 'resort']) {
    await menu(page); await page.locator('#duel-skin').selectOption(skin); await page.locator('#duel-opponent-skin').selectOption(skin); await start(page);
    for (const [row, action] of ['light', 'medium', 'heavy', 'ability'].entries()) {
      await rig(page, { positions: [360, 920], fighters: [{ y: 450, vy: -100, state: 'jump' }, { y: 450, vy: -100, state: 'jump' }] });
      await keys(page, [layouts[0][action], layouts[1][action]], [92, 142, 192, 175][row]);
      assert.ok((await state(page)).animation.every(a => a.sheet === 'air' && a.index === row * 4 + 1));
      await capture(page, report, `01-${skin}-${action}`);
    }
  }
  report.checks.push('Both characters in all four costumes visibly use four separate active aerial rows, including their distinct diving specials');
  await rig(page, { positions: [350, 920] });
  await keys(page, ['KeyW', 'KeyD'], 200);
  const drifting = (await state(page)).fighters[0]; await keys(page, ['KeyK'], 150);
  const attack = (await state(page)).fighters[0];
  assert.equal(attack.vx, drifting.vx); assert.ok(attack.x > drifting.x + 35);
  await capture(page, report, '02-forward-drift');
  await rig(page, { fighters: [{ y: 450, vy: -160, state: 'jump' }, { y: 450, vy: -160, state: 'jump' }] });
  for (const [action, move] of [['light', 'airPunch'], ['medium', 'airKick'], ['heavy', 'airHeavy']]) {
    await keys(page, [layouts[0][action]]);
    await until(page, s => s.fighters[0].move === move && s.fighters[0].contact === 'hit');
  }
  let s = await state(page); assert.equal(s.fighters[0].airAttacks, 3); assert.ok(s.fighters[0].combo >= 3); assert.equal(s.fighters[1].state, 'launch');
  await capture(page, report, '03-air-chain');
  const serial = await page.evaluate(() => window.tidalDuel.game().fighters[0].moveSerial);
  await keys(page, ['KeyU']); await advance(page, 80);
  assert.equal(await page.evaluate(() => window.tidalDuel.game().fighters[0].moveSerial), serial);
  await until(page, s => s.fighters[1].state === 'down');
  assert.ok(await page.evaluate(() => window.tidalDuel.game().fighters[1].invincible > 0));
  report.checks.push('Momentum survives attacks; actual light-medium-heavy air-to-air hits form a capped combo and the victim lands with protected knockdown');
  for (const crouch of [false, true]) {
    await rig(page, { positions: [550, 659], fighters: [{ y: 540, state: 'jump' }] });
    await page.keyboard.down('ArrowRight'); if (crouch) await page.keyboard.down('ArrowDown');
    await keys(page, ['KeyL'], 300); s = await state(page);
    assert.equal(s.fighters[1].hp < 300, crouch);
    if (!crouch) assert.ok(s.events.some(e => e.type === 'block'));
    await page.keyboard.up('ArrowRight'); await page.keyboard.up('ArrowDown');
  }
  for (const block of [false, true]) {
    await rig(page, { positions: block ? [550, 680] : [350, 920], fighters: [{ y: 525, vy: 120, state: 'jump' }] });
    if (block) await page.keyboard.down('ArrowRight');
    await keys(page, ['KeyJ']);
    if (block) { await until(page, s => s.fighters[0].contact === 'block'); await capture(page, report, '04-standing-air-guard'); }
    else await advance(page, 120);
    await keys(page, ['KeyK']); await advance(page, 500);
    assert.equal(await page.evaluate(() => window.tidalDuel.game().fighters[0].moveSerial), 1);
    assert.equal((await state(page)).fighters[1].hp, 300); await page.keyboard.up('ArrowRight');
  }
  await rig(page, { positions: [550, 660], fighters: [{ y: 525, vy: 210, state: 'jump' }] });
  await keys(page, ['KeyK']); await until(page, s => s.fighters[0].contact === 'hit');
  await until(page, s => s.fighters[0].state === 'landing'); await keys(page, ['KeyJ']);
  await until(page, s => s.fighters[0].move === 'punch' && s.fighters[0].contact === 'hit');
  assert.ok((await state(page)).fighters[0].combo >= 2); await capture(page, report, '05-landing-confirm');
  report.checks.push('Downward heavy is defended standing and beats crouch-back; blocked/whiffed attacks cannot chain; a late jump-in confirms into a fresh ground punch');
  await rig(page, { positions: [350, 920] }); await keys(page, ['KeyW', 'KeyD', 'KeyJ'], 65); await keys(page, ['KeyK']);
  assert.ok(await page.evaluate(() => window.tidalDuel.game().fighters[0].buffer.length > 0));
  await button(page, '暂停').click(); const paused = (await state(page)).fighters;
  assert.equal(await page.evaluate(() => window.tidalDuel.game().fighters[0].buffer.length), 0);
  await keys(page, ['KeyW', 'KeyL'], 500); assert.deepEqual((await state(page)).fighters, paused);
  await button(page, '继续对决').click(); await advance(page, 1500);
  assert.equal(await page.evaluate(() => window.tidalDuel.game().fighters[0].moveSerial), 1);
  assert.equal((await state(page)).fighters[0].airAttacks, 0);
  await gamepads(page, report);
  await touch(page, report, false);
}
async function gamepads(page, report) {
  await page.evaluate(() => { window.__qaPads = []; Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => window.__qaPads }); });
  for (const buttons of [[0, 2], [3, 3], [1, 1]]) {
    await rig(page, { positions: [350, 920], fighters: buttons[0] === 1 ? [{ y: 450, state: 'jump' }, { y: 450, state: 'jump' }] : [] });
    await page.evaluate(buttons => {
      window.__qaPads = buttons.map((button, index) => ({ id: `QA pad ${index}`, index, connected: true, mapping: 'standard', axes: buttons[0] === 1 ? [0, 0] : [index ? -1 : 1, -1],
        buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: i === button, value: i === button ? 1 : 0 })) }));
      window.tidalDuel.manual(false); window.__qaFrame(25);
    }, buttons);
    const s = await state(page), expected = buttons[0] === 0 ? ['airPunch', 'airKick'] : buttons[0] === 3 ? ['airHeavy', 'airHeavy'] : ['airSignature', 'airSignature'];
    assert.deepEqual(s.fighters.map(f => f.move), expected);
    await page.evaluate(() => { window.__qaPads = []; window.__qaFrame(25); window.tidalDuel.manual(true); });
  }
  await page.evaluate(() => { delete navigator.getGamepads; delete window.__qaPads; });
  report.checks.push('Browser getGamepads polling routes two standard pads to distinct air normals and both character dives; API simulation, no physical hardware claim');
}
async function touch(page, report, publicControls) {
  const cdp = await page.context().newCDPSession(page);
  if (publicControls) { await menu(page); await start(page, 'training'); }
  for (const width of [320, 390, 844]) {
    await page.setViewportSize({ width, height: width === 844 ? 390 : 844 });
    if (publicControls) { await button(page, '重置站位').click(); await advance(page, 0); }
    else await rig(page, { positions: [350, 920] });
    assert.equal(await page.locator('[data-control^="0-"]').count(), 9);
    const points = [];
    for (const [index, action] of ['right', 'jump', 'medium'].entries()) {
      const box = await page.locator(`[data-control="0-${action}"]`).boundingBox(); assert.ok(box && box.width >= 30);
      points.push({ id: index + 1, x: box.x + box.width / 2, y: box.y + box.height / 2 });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points }); await advance(page, 150);
    const s = await state(page); assert.equal(s.fighters[0].move, 'airKick'); assert.ok(s.fighters[0].vx > 200 && s.fighters[0].airborne);
    await capture(page, report, `06-touch-air-${width}`);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] }); await advance(page, 1500);
    const x = (await state(page)).fighters[0].x; await advance(page, 300);
    assert.equal((await state(page)).fighters[0].x, x); assert.equal((await state(page)).fighters[0].airborne, false);
  }
  report.checks.push('320/390/844px native three-finger direction+jump+medium, positive air momentum, nine-button bank and pointercancel without sticky movement or attacks');
}
async function production(page, report) {
  assert.equal(await page.evaluate(() => typeof window.tidalDuel), 'undefined');
  await start(page);
  for (const side of [0, 1]) for (const [action, move] of [['light', 'airPunch'], ['medium', 'airKick'], ['heavy', 'airHeavy']]) {
    await keys(page, [layouts[side].jump, layouts[side][action]], 45);
    assert.equal((await state(page)).fighters[side].move, move); await advance(page, 1500);
  }
  for (const skin of ['original', 'resort']) {
    await menu(page); await page.locator('#duel-skin').selectOption(skin); await page.locator('#duel-opponent-skin').selectOption(skin); await start(page);
    await keys(page, ['KeyW', 'ArrowUp'], 300); await keys(page, ['KeyL', 'Digit3'], 192);
    assert.ok((await state(page)).animation.every(a => a.sheet === 'air' && a.index === 9));
    await capture(page, report, `01-${skin}-public-heavy`); await advance(page, 1500);
    await keys(page, ['KeyW', 'ArrowUp'], 300); await keys(page, ['KeyU', 'Digit4'], 175);
    assert.ok((await state(page)).animation.every(a => a.sheet === 'air' && a.index === 13));
    await capture(page, report, `02-${skin}-public-dive`); await advance(page, 1500);
  }
  await menu(page); await page.locator('#duel-skin').selectOption('original'); await page.locator('#duel-opponent-skin').selectOption('original'); await start(page, 'training');
  let s = await state(page); const gap = s.fighters[1].x - s.fighters[0].x;
  await keys(page, ['KeyD'], Math.max(0, (gap - 110) / 294 * 1000));
  await keys(page, ['KeyW'], 600); await keys(page, ['KeyL']);
  await until(page, s => s.fighters[0].contact === 'hit');
  await until(page, s => s.fighters[0].state === 'landing'); await keys(page, ['KeyJ']);
  await until(page, s => s.fighters[0].move === 'punch' && s.fighters[0].contact === 'hit');
  assert.ok((await state(page)).fighters[0].combo >= 2); await capture(page, report, '03-public-jump-in-confirm');
  await button(page, '重置站位').click(); await advance(page, 0);
  assert.ok((await state(page)).fighters.every(f => f.airAttacks === 0 && f.y === 610 && f.hp === 300));
  await keys(page, ['KeyW', 'KeyD', 'KeyK'], 150);
  await button(page, '暂停').click(); const paused = (await state(page)).fighters;
  await advance(page, 500); assert.deepEqual((await state(page)).fighters, paused);
  await button(page, '继续对决').click(); await advance(page, 1500);
  assert.equal((await state(page)).fighters[0].airborne, false);
  report.checks.push('Production with public keyboard/DOM and fixed test clock only: both players, all four skins, downward heavy and dives, real jump-in→ground confirm, training reset and flight pause/resume; no mutable developer hook');
  await touch(page, report, true);
}
async function run(headless) {
  fs.mkdirSync(output, { recursive: true });
  const report = { status: 'running', url, mode: publicOnly ? 'production-public' : 'development-focused', browser: { channel: 'chrome', headless, muted: true }, checks: [], screenshots: [], errors: [] };
  let browser;
  try {
    assert.equal((await fetch(url, { signal: AbortSignal.timeout(20000) })).status, 200);
    browser = await chromium.launch({ channel: 'chrome', headless, args: ['--mute-audio', '--disable-speech-api'] });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, hasTouch: true });
    await context.route(/\/api\/record(?:\?|$)/, route => route.fulfill({ contentType: 'application/json', body: '{"success":true,"skipped":true}' }));
    await context.route(/https:\/\/(pagead2\.googlesyndication\.com|hm\.baidu\.com)\//, route => route.fulfill({ contentType: 'application/javascript', body: '' }));
    await context.addInitScript(() => {
      if (window.speechSynthesis) window.speechSynthesis.speak = () => {};
      // Freeze only the test environment's RAF. Public advanceTime still calls the real engine and renderer.
      let id = 0, now = performance.now(); const frames = new Map();
      window.requestAnimationFrame = callback => { frames.set(++id, callback); return id; };
      window.cancelAnimationFrame = value => frames.delete(value);
      window.__qaFrame = ms => { now = Math.max(now, performance.now()) + ms; const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback(now)); };
    });
    const page = await context.newPage();
    page.on('pageerror', e => report.errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
    await page.goto(url); await page.waitForFunction(() => typeof window.render_game_to_text === 'function' && JSON.parse(window.render_game_to_text()).assetsReady, null, { polling: 50 });
    if (!publicOnly) await page.evaluate(() => window.tidalDuel.manual(true));
    await atlases(page, report);
    if (publicOnly) await production(page, report); else await development(page, report);
    assert.deepEqual(report.errors, []); report.status = 'passed';
    console.log(JSON.stringify({ status: report.status, checks: report.checks, screenshots: report.screenshots.map(s => s.name) }, null, 2));
  } catch (error) { report.status = 'failed'; report.failure = { message: error.message, stack: error.stack }; throw error; }
  finally { fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); await browser?.close(); }
}
(async () => { try { await run(process.env.HEADED !== '1'); } catch (e) { if (!(e instanceof CaptureFailure)) throw e; await run(false); } })().catch(e => { console.error(e); process.exitCode = 1; });
