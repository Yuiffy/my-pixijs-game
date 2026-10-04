const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd(), path.join(os.homedir(), '.codex/skills/develop-web-game')] }));
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const url = process.env.TIDAL_DUEL_URL || 'http://localhost:4040/game/tidal-duel';
const output = path.resolve(process.env.TIDAL_DUEL_OUTPUT || 'tmp/tidal-modern/focused');
const actions = ['left', 'right', 'jump', 'crouch', 'light', 'medium', 'heavy', 'ability', 'assist', 'punch', 'kick', 'guard', 'hold', 'throw', 'sidestep', 'special', 'skill', 'rise', 'burst'];
const layouts = [
  { left: 'KeyA', right: 'KeyD', crouch: 'KeyS', light: 'KeyJ', medium: 'KeyK', heavy: 'KeyL', ability: 'KeyU', assist: 'KeyI' },
  { left: 'ArrowLeft', right: 'ArrowRight', crouch: 'ArrowDown', light: 'Digit1', medium: 'Digit2', heavy: 'Digit3', ability: 'Digit4', assist: 'Digit5' },
];
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = (page, ms) => page.evaluate(ms => window.advanceTime(ms), ms);
const button = (page, name) => page.getByRole('button', { name, exact: true });
class CaptureFailure extends Error {}
async function keys(page, codes, ms = 10) {
  for (const code of codes) await page.keyboard.down(code);
  await advance(page, ms);
  for (const code of [...codes].reverse()) await page.keyboard.up(code);
  await advance(page, 1000 / 120);
}
async function rig(page, options = {}) {
  await page.evaluate(({ actions, options }) => {
    const g = window.tidalDuel.game();
    Object.assign(g, { phase: 'fight', phaseTime: 0, paused: false, freeze: 0, super: null, events: [], projectiles: [], grabs: [], roundTimer: 60 });
    g.options.mode = 'local'; g.camera.shake = 0;
    const positions = options.positions || [565, 674];
    g.fighters.forEach((f, side) => {
      for (const action of actions) window.tidalDuel.input(side, action, false);
      Object.assign(f, { x: positions[side], y: 610, z: 0, vx: 0, vy: 0, facing: positions[side] < positions[1 - side] ? 1 : -1,
        state: 'idle', stateTime: 0, stateDuration: 0, hp: 300, meter: 100, move: null, moveTime: 0, moveHit: false, moveSerial: 0,
        stun: 0, critical: 0, invincible: 0, juggle: 0, combo: 0, comboTime: 0, comboDamage: 0, guardGauge: 100, guardDelay: 0,
        contact: 'none', burstReady: true, throwTech: 0, holdCooldown: 0, stepCooldown: 0,
        assisted: null, airAttacks: 0, airRank: 0, airLanding: 0, buffer: [], directions: [], history: [], previous: Object.fromEntries(actions.map(a => [a, false])) });
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
  assert.equal(s.assetsReady, true); assert.equal(s.title, '潮夜格斗 · 三人像素对战');
  assert.ok(dom.width <= dom.viewport + 1); assert.equal(dom.canvas.length, 1);
  assert.equal(dom.canvas[0].width, 1280); assert.equal(dom.canvas[0].height, 720); assert.ok(dom.canvas[0].rect.width > 0);
  report.screenshots.push({ name, file, pixels, state: s, dom });
}
async function decodedFrames(page, report) {
  report.atlases = await page.evaluate(async () => {
    const spec = await (await fetch('/games/tidal-duel/pixel/source-layout.json')).json();
    const result = [];
    for (const [character, skins] of Object.entries(spec.sources)) for (const skin of Object.keys(skins)) for (const sheet of ['motion', 'combat']) {
      const image = new Image(); image.src = `/games/tidal-duel/pixel/${character}-${skin}-${sheet}.webp`; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = spec.frameSize;
      const ctx = canvas.getContext('2d', { willReadFrequently: true }); const frames = [];
      for (let index = 0; index < (sheet === 'motion' ? 16 : 24); index++) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(image, index % 4 * spec.frameSize, Math.floor(index / 4) * spec.frameSize, spec.frameSize, spec.frameSize, 0, 0, spec.frameSize, spec.frameSize);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let left = canvas.width, right = -1, top = canvas.height, bottom = -1, opaque = 0, partial = 0;
        for (let i = 3; i < data.length; i += 4) if (data[i]) {
          const p = (i - 3) / 4, x = p % canvas.width, y = Math.floor(p / canvas.width);
          left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y); opaque++;
          if (data[i] !== 255) partial++;
        }
        frames.push({ index, bounds: [left, top, right + 1, bottom + 1], height: bottom - top + 1, opaque, partial });
      }
      result.push({ character, skin, sheet, width: image.naturalWidth, height: image.naturalHeight, spec, frames });
    }
    return result;
  });
  let total = 0;
  for (const a of report.atlases) {
    assert.equal(a.width, 1792); assert.equal(a.height, a.sheet === 'motion' ? 1792 : 2688);
    for (const f of a.frames) {
      total++; assert.ok(f.opaque > 1000 && f.opaque < 448 * 448 * 0.5); assert.equal(f.partial, 0);
      assert.ok(f.bounds[0] > 0 && f.bounds[1] > 0 && f.bounds[2] < 448); assert.equal(f.bounds[3], 440, 'common foot baseline, with transparent padding');
      if ((a.sheet === 'motion' && [...Array(8).keys(), 10, 11].includes(f.index)) || (a.sheet === 'combat' && f.index < 4)) {
        const tolerance = a.character === 'mizuki' && a.sheet === 'motion' && f.index >= 10 ? 0.06 : 0.04;
        assert.ok(Math.abs(f.height / 184 - 1) < tolerance, `${a.character}/${a.skin}/${a.sheet}/${f.index}: shared body scale; braced knees retain their natural height`);
      }
    }
  }
  assert.equal(total, 200);
  report.checks.push('All 200 actual browser-decoded ground frames have binary alpha, padding and common feet; standing references remain within 4% of 184px (Mizuki bent-knee brace within 6% at the same sheet scale)');
}
async function run(headless = true) {
  fs.mkdirSync(output, { recursive: true });
  const report = { status: 'running', url, browser: { channel: 'chrome', headless, muted: true }, checks: [], screenshots: [], errors: [] };
  let browser;
  try {
    assert.equal((await fetch(url, { signal: AbortSignal.timeout(20000) })).status, 200);
    browser = await chromium.launch({ channel: 'chrome', headless, args: ['--mute-audio', '--disable-speech-api'] });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, hasTouch: true });
    await context.addInitScript(() => { localStorage.setItem('tidal-duel-cinematics', 'off'); if (window.speechSynthesis) window.speechSynthesis.speak = () => {}; });
    const page = await context.newPage();
    page.on('pageerror', e => report.errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
    await page.goto(url); await page.waitForFunction(() => window.tidalDuel && JSON.parse(window.render_game_to_text()).assetsReady);
    await page.evaluate(() => window.tidalDuel.manual(true));
    assert.match(await page.title(), /潮夜格斗/); assert.ok((await state(page)).fighters.every(f => f.skin === 'original'));
    await decodedFrames(page, report);
    await button(page, '同机双人').click(); await page.locator('#tidal-start').click(); await page.keyboard.press('Enter'); await advance(page, 10);
    // Real relative-back inputs, both players and both sides; fixtures only set the starting range.
    for (const side of [0, 1]) for (const crossed of [false, true]) {
      await rig(page, crossed ? { positions: [674, 565] } : {});
      const positions = (await state(page)).fighters.map(f => f.x), defender = 1 - side;
      const back = layouts[defender][positions[defender] < positions[side] ? 'left' : 'right'];
      await page.keyboard.down(back); await keys(page, [layouts[side].light], 200);
      assert.equal((await state(page)).fighters[defender].hp, 300); assert.ok((await state(page)).events.some(e => e.type === 'block'));
      if (side === 0 && !crossed) await capture(page, report, '01-back-guard');
      await page.keyboard.up(back);
      await rig(page, crossed ? { positions: [674, 565] } : {});
      await page.keyboard.down(back); await page.keyboard.down(layouts[defender].crouch);
      await keys(page, [layouts[side].crouch, layouts[side].medium], 280);
      assert.equal((await state(page)).fighters[defender].hp, 300); assert.ok((await state(page)).events.some(e => e.type === 'block'));
      await page.keyboard.up(back); await page.keyboard.up(layouts[defender].crouch);
    }
    report.checks.push('Actual keyboard back/down-back blocks mids and sweeps for both players after switching sides');
    // Hold assist, then repeat a physical attack. Record the peak before later combo expiry.
    for (const side of [0, 1]) for (const strength of ['light', 'medium', 'heavy']) {
      await rig(page); await page.keyboard.down(layouts[side].assist);
      const seen = []; let serial = 0, maxCombo = 0;
      for (let i = 0; i < 190; i++) {
        if (i % 8 === 0) await page.keyboard.down(layouts[side][strength]);
        if (i % 8 === 1) await page.keyboard.up(layouts[side][strength]);
        await advance(page, 1000 / 120);
        const f = await page.evaluate(side => { const f = window.tidalDuel.game().fighters[side]; return { move: f.move, serial: f.moveSerial, combo: f.combo }; }, side);
        maxCombo = Math.max(maxCombo, f.combo);
        if (f.serial !== serial) { serial = f.serial; seen.push(f.move); }
        if (strength === 'heavy' && f.move === 'super' && side === 0 && !report.screenshots.some(s => s.name === '02-assisted-super')) await capture(page, report, '02-assisted-super');
      }
      await page.keyboard.up(layouts[side][strength]); await page.keyboard.up(layouts[side].assist);
      const expected = strength === 'light' ? ['punch', 'punch2', 'punch3'] : strength === 'medium' ? ['kick', 'kickPunch', 'signature'] : ['punch', 'punch2', 'launcher', 'super'];
      assert.deepEqual(seen.slice(0, expected.length), expected); assert.ok(maxCombo >= (strength === 'heavy' ? 4 : 3));
      assert.ok((await state(page)).fighters[1 - side].hp < 260);
      (report.combos ||= []).push({ side, strength, seen, maxCombo });
    }
    // Human press order for throw and super; no constituent normal after release.
    for (const [a, b, move] of [['light', 'medium', 'throw'], ['medium', 'light', 'throw'], ['heavy', 'ability', 'super'], ['ability', 'heavy', 'super']]) {
      await rig(page); await page.keyboard.down(layouts[0][a]); await advance(page, 45); await page.keyboard.down(layouts[0][b]); await advance(page, 10);
      assert.equal((await state(page)).fighters[0].move, move);
      if (move === 'super') assert.equal((await state(page)).fighters[0].meter, 0);
      await advance(page, 2000); await page.keyboard.up(layouts[0][b]); await advance(page, 900);
      assert.equal((await state(page)).fighters[0].move, null); await page.keyboard.up(layouts[0][a]);
    }
    report.checks.push('Three confirmed assist routes for both characters/players; 45ms chords tolerate both orders, spend one super, and never leave a stray normal');
    // Actual game animation: all four costumes, walk loop, neutral normal, crouch and jump.
    for (const skin of ['original', 'resort']) {
      await button(page, '返回选人').last().click();
      if (await page.getByRole('dialog').isVisible()) await page.getByRole('dialog').getByRole('button', { name: '返回选人', exact: true }).click();
      await page.locator('#duel-skin').selectOption(skin); await page.locator('#duel-opponent-skin').selectOption(skin);
      await page.locator('#tidal-start').click(); await page.keyboard.press('Enter'); await rig(page, { positions: [370, 920] });
      await page.keyboard.down('KeyD'); await page.keyboard.down('ArrowLeft');
      const frames = [new Set(), new Set()];
      for (let i = 0; i < 8; i++) { await advance(page, 50); (await state(page)).animation.forEach((f, side) => frames[side].add(f.index)); }
      assert.ok(frames.every(f => f.size === 4 && [...f].every(i => i >= 4 && i <= 7)));
      await capture(page, report, `03-${skin}-walking`); await page.keyboard.up('KeyD'); await page.keyboard.up('ArrowLeft');
      await rig(page, { positions: [370, 920] }); await keys(page, ['KeyJ', 'Digit1'], 90);
      assert.ok((await state(page)).animation.every(a => a.sheet === 'combat' && a.index < 4));
      await capture(page, report, `04-${skin}-punch`);
      await rig(page, { positions: [370, 920] }); await keys(page, ['KeyW', 'ArrowUp'], 180);
      assert.ok((await state(page)).fighters.every(f => f.y < 580));
      await capture(page, report, `05-${skin}-jump`);
    }
    report.checks.push('All four costumes animate in the real renderer: all walking frames, upright punches and bent jumps with common body scale');
    // Two simultaneous native touch pointers select super in the nine-key bank.
    const cdp = await context.newCDPSession(page);
    for (const width of [320, 390, 844]) {
      await page.setViewportSize({ width, height: width === 844 ? 390 : 844 }); await rig(page, { positions: [370, 920] });
      assert.equal(await page.locator('[data-control^="0-"]').count(), 9);
      const points = [];
      for (const [index, action] of ['heavy', 'ability'].entries()) {
        const box = await page.locator(`[data-control="0-${action}"]`).boundingBox(); assert.ok(box && box.width > 30);
        points.push({ id: index + 1, x: box.x + box.width / 2, y: box.y + box.height / 2 });
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points }); await advance(page, 10);
      assert.equal((await state(page)).fighters[0].move, 'super'); assert.equal((await state(page)).fighters[0].meter, 0);
      await capture(page, report, `06-touch-super-${width}`);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] }); await advance(page, 2000);
      assert.equal((await state(page)).fighters[0].move, null);
    }
    report.checks.push('Nine-button banks at 320/390/844px; native two-pointer heavy+special super spends once and pointercancel releases both');
    assert.deepEqual(report.errors, []); report.status = 'passed';
    console.log(JSON.stringify({ status: report.status, checks: report.checks, screenshots: report.screenshots.length }));
  } catch (error) { report.status = 'failed'; report.failure = { message: error.message, stack: error.stack }; throw error; }
  finally { fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); await browser?.close(); }
}
(async () => { try { await run(process.env.HEADED !== '1'); } catch (e) { if (!(e instanceof CaptureFailure)) throw e; await run(false); } })().catch(e => { console.error(e); process.exitCode = 1; });
