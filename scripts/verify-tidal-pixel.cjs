const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd(), path.join(os.homedir(), '.codex/skills/develop-web-game')] }));
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const url = process.env.TIDAL_DUEL_URL || 'http://localhost:4037/game/tidal-duel';
const output = path.resolve(process.env.TIDAL_DUEL_OUTPUT || 'tmp/tidal-pixel-v2-dev');
const actions = ['left', 'right', 'jump', 'crouch', 'light', 'medium', 'heavy', 'ability', 'assist', 'punch', 'kick', 'guard', 'hold', 'throw', 'sidestep', 'special', 'skill', 'rise', 'burst'];
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = (page, ms) => page.evaluate(ms => window.advanceTime(ms), ms);
const button = (page, name) => page.getByRole('button', { name, exact: true });
class CaptureFailure extends Error {}
async function keys(page, codes, ms) {
  for (const code of codes) await page.keyboard.down(code);
  await advance(page, ms);
  for (const code of [...codes].reverse()) await page.keyboard.up(code);
  await advance(page, 10);
}
async function capture(page, report, name) {
  const file = path.join(output, name + '.png');
  const pixels = inspectPng(await page.screenshot({ path: file, fullPage: true, animations: 'disabled' }));
  if (pixels.colors < 8 || pixels.transparentRatio > 0.98 || pixels.nearBlackRatio > 0.96) throw new CaptureFailure(name);
  const s = await state(page);
  const dom = await page.evaluate(() => ({ viewport: innerWidth, width: document.documentElement.scrollWidth, canvas: [...document.querySelectorAll('canvas')].map(c => ({ w: c.width, h: c.height, display: c.getBoundingClientRect().toJSON() })) }));
  assert.equal(s.art, 'tidal-pixel-v2'); assert.equal(s.assetsReady, true);
  assert.ok(dom.width <= dom.viewport + 1); assert.equal(dom.canvas.length, 1);
  assert.ok(dom.canvas[0].w === 1280 && dom.canvas[0].h === 720 && dom.canvas[0].display.width > 0);
  report.screenshots.push({ name, file, pixels, state: s, dom });
}
async function start(page, mode = 'local') {
  await button(page, { local: '同机双人', training: '自由练习', solo: '单人挑战' }[mode]).click();
  await page.locator('#tidal-start').click(); await page.keyboard.press('Enter'); await advance(page, 20);
  assert.equal((await state(page)).phase, 'fight');
}
async function menu(page) {
  await button(page, '返回选人').last().click();
  if (await page.getByRole('dialog').isVisible()) await page.getByRole('dialog').getByRole('button', { name: '返回选人', exact: true }).click();
}
async function rig(page, options = {}) {
  await page.evaluate(({ options, actions }) => {
    const g = window.tidalDuel.game(); g.phase = 'fight'; g.paused = false; g.freeze = 0; g.super = null; g.events = []; g.projectiles = []; g.grabs = [];
    g.training.lastContact = undefined; g.camera.shake = 0;
    g.fighters.forEach((f, side) => {
      for (const action of actions) window.tidalDuel.input(side, action, false);
      Object.assign(f, { x: (options.positions || [565, 674])[side], y: 610, z: 0, vx: 0, vy: 0, facing: side ? -1 : 1,
        state: 'idle', stateTime: 0, stateDuration: 0, hp: 300, meter: 100, stun: 0, critical: 0, move: null, moveTime: 0, moveHit: false,
        contact: 'none', guardGauge: 100, guardDelay: 0, burstReady: true, throwTech: 0, invincible: 0, juggle: 0, combo: 0, comboTime: 0,
        buffer: [], directions: [], history: [], assisted: null, holdCooldown: 0, stepCooldown: 0, previous: Object.fromEntries(actions.map(a => [a, false])) });
    });
  }, { options, actions }); await advance(page, 0);
}
async function until(page, predicate, max = 120) {
  for (let i = 0; i < max; i++) { if (predicate(await state(page))) return; await advance(page, 10); }
  assert.ok(predicate(await state(page)), 'bounded public state condition');
}
async function directions(page, side, sequence, attack) {
  for (const d of sequence) await keys(page, d === 2 ? [side ? 'ArrowDown' : 'KeyS'] : d === 3 ? [side ? 'ArrowDown' : 'KeyS', side ? 'ArrowLeft' : 'KeyD'] : [side ? 'ArrowLeft' : 'KeyD'], 25);
  await keys(page, [attack], 20);
}
async function run(headless = true) {
  const report = { status: 'running', browser: { channel: 'chrome', headless, muted: true }, url, checks: [], screenshots: [], errors: [] };
  fs.mkdirSync(output, { recursive: true }); let browser;
  try {
    assert.equal((await fetch(url, { signal: AbortSignal.timeout(20000) })).status, 200);
    browser = await chromium.launch({ channel: 'chrome', headless, args: ['--mute-audio', '--disable-speech-api'] });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, hasTouch: true });
    await context.addInitScript(() => { localStorage.setItem('tidal-duel-cinematics', 'off'); if (window.speechSynthesis) window.speechSynthesis.speak = () => {}; });
    const page = await context.newPage();
    page.on('pageerror', e => report.errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
    await page.goto(url); await page.waitForFunction(() => window.tidalDuel && JSON.parse(window.render_game_to_text()).assetsReady);
    await page.evaluate(() => window.tidalDuel.manual(true));
    assert.ok((await state(page)).fighters.every(f => f.skin === 'original'));
    await capture(page, report, '01-original-selection');
    await page.locator('#duel-skin').selectOption('resort'); await page.locator('#duel-opponent-skin').selectOption('resort');
    await capture(page, report, '02-resort-selection');
    await start(page); await rig(page); await keys(page, ['KeyK'], 190);
    assert.equal((await state(page)).animation[0].index, 5); await capture(page, report, '03-resort-kick');
    await menu(page); await page.locator('#duel-skin').selectOption('original'); await page.locator('#duel-opponent-skin').selectOption('original'); await start(page);
    await rig(page); await keys(page, ['KeyU'], 220);
    await capture(page, report, '04-cat-contact');
    assert.ok((await state(page)).fighters[1].hp < 300);
    await keys(page, ['KeyU'], 200); await keys(page, ['KeyU'], 200);
    await until(page, s => s.fighters[0].move === 'signature3');
    await capture(page, report, '05-cat-three-stage');
    await rig(page, { positions: [350, 930] }); await directions(page, 0, [2, 3, 6], 'KeyJ');
    assert.equal((await state(page)).fighters[0].move, 'signature');
    await rig(page, { positions: [350, 930] }); await directions(page, 1, [2, 3, 6], 'Digit1');
    assert.equal((await state(page)).fighters[1].move, 'signature');
    await advance(page, 360); assert.ok((await state(page)).projectiles.length); await capture(page, report, '06-shiori-wave');
    await rig(page); await page.keyboard.down('KeyW'); await advance(page, 170); await page.keyboard.up('KeyW');
    await keys(page, ['ArrowDown', 'Digit4'], 170);
    assert.equal((await state(page)).fighters[1].move, 'reversal'); await capture(page, report, '07-shiori-antiair');
    await rig(page); await keys(page, ['KeyJ', 'KeyK'], 120);
    assert.ok((await state(page)).grabs.length);
    await keys(page, ['Digit1', 'Digit2'], 20); assert.ok((await state(page)).events.some(e => e.type === 'tech'));
    await capture(page, report, '08-throw-tech');
    await rig(page); await keys(page, ['Digit2'], 210);
    await keys(page, ['KeyI', 'KeyU'], 20); await until(page, s => s.events.some(e => e.type === 'burst'));
    assert.equal((await state(page)).fighters[0].burstReady, false); await capture(page, report, '09-break');
    await rig(page); await keys(page, ['KeyJ'], 150); await keys(page, ['KeyK', 'KeyL'], 30);
    await until(page, s => s.events.some(e => e.type === 'cancel')); await capture(page, report, '10-drive-cancel');
    await rig(page, { positions: [350, 950] }); await directions(page, 0, [6, 2, 3], 'KeyK'); assert.equal((await state(page)).fighters[0].move, 'reversal');
    await rig(page, { positions: [350, 950] }); await directions(page, 1, [6, 2, 3], 'Digit2'); assert.equal((await state(page)).fighters[1].move, 'reversal');
    report.checks.push('Both costumes render, active combat frames, cat rekka, both-facing 236P/623K, live wave, anti-air, tech, burst and drive cancel through actual keyboard controls');
    // Pausing must erase a partially entered motion and require held controls to be released.
    await rig(page, { positions: [350, 950] }); await keys(page, ['KeyS'], 20); await keys(page, ['KeyS', 'KeyD'], 20);
    await button(page, '暂停').click();
    assert.equal(await page.evaluate(() => window.tidalDuel.game().fighters[0].directions.length), 0);
    await button(page, '继续对决').click(); await keys(page, ['KeyD', 'KeyJ'], 20); assert.equal((await state(page)).fighters[0].move, 'punch');
    await page.keyboard.up('KeyD'); await page.keyboard.up('KeyJ');
    await rig(page, { positions: [350, 950] }); await page.keyboard.down('KeyD'); await advance(page, 20);
    await button(page, '暂停').click(); await button(page, '继续对决').click();
    const x = (await state(page)).fighters[0].x; await advance(page, 250); assert.equal((await state(page)).fighters[0].x, x);
    await page.keyboard.up('KeyD');
    report.checks.push('Pause removes motion history, clears chords and held keyboard movement; resumed command requires fresh release/press');
    await page.evaluate(() => {
      window.__pixelPads = []; navigator.getGamepads = () => window.__pixelPads;
    });
    const pads = async buttons => {
      await page.evaluate(buttons => { window.__pixelPads = buttons.map(indices => ({ axes: [0, 0], buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: indices.includes(i), value: indices.includes(i) ? 1 : 0 })) })); }, buttons);
    };
    for (const [indices, move] of [[[1], 'signature'], [[13, 1], 'reversal']]) {
      await rig(page, { positions: [350, 950] }); await page.evaluate(() => window.tidalDuel.manual(false)); await pads([indices, indices]);
      await page.waitForFunction(move => JSON.parse(window.render_game_to_text()).fighters.every(f => f.move === move), move);
      await pads([[], []]); await page.waitForTimeout(60); await page.evaluate(() => window.tidalDuel.manual(true));
    }
    await rig(page); await page.evaluate(() => { const f = window.tidalDuel.game().fighters[0]; f.state = 'hit'; f.stun = 1; window.tidalDuel.manual(false); });
    await pads([[7, 1], []]); await page.waitForFunction(() => !JSON.parse(window.render_game_to_text()).fighters[0].burstReady);
    await pads([[], []]); await page.waitForTimeout(60); await page.evaluate(() => window.tidalDuel.manual(true));
    await rig(page, { positions: [350, 950] }); await page.evaluate(() => window.tidalDuel.manual(false)); await pads([[1], []]);
    await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).fighters[0].move === 'signature');
    await button(page, '暂停').click(); await button(page, '继续对决').click(); await page.waitForTimeout(900);
    assert.equal((await state(page)).fighters[0].move, null, 'held B cannot restart special after pause');
    await pads([[], []]); await page.waitForTimeout(60); await page.evaluate(() => window.tidalDuel.manual(true));
    report.checks.push('Modern gamepad B and down+B trigger both signatures/reversals, RT+B burst works, held button cannot retrigger on resume');
    await menu(page); await page.getByRole('button', { name: /栞栞.*SHIORI/ }).click(); await page.locator('#duel-opponent').selectOption('shiori'); await page.locator('#duel-opponent-skin').selectOption('resort');
    await start(page); await rig(page); await keys(page, ['KeyK', 'ArrowDown', 'Digit2'], 250); await capture(page, report, '11-shiori-mirror-skins');
    await menu(page); await page.locator('#duel-opponent').selectOption('sui'); await start(page, 'training'); await button(page, '判定框 关').click();
    await rig(page); await keys(page, ['KeyK'], 190); await capture(page, report, '12-training-boxes');
    assert.ok((await state(page)).fighters[0].boxes.attack);
    await button(page, '重置站位').click(); assert.equal((await state(page)).training.showBoxes, true);
    for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 740 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(viewport); await capture(page, report, '13-training-' + viewport.width);
    }
    // Real CDP touch exercises the new shortcut in the compact layout.
    await page.setViewportSize({ width: 390, height: 844 }); await rig(page, { positions: [350, 930] });
    const cdp = await context.newCDPSession(page); const box = await page.locator('[data-control="0-ability"]').boundingBox();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x: box.x + box.width / 2, y: box.y + box.height / 2 }] });
    await advance(page, 290); assert.equal((await state(page)).fighters[0].move, 'signature');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await capture(page, report, '14-touch-wave');
    report.checks.push('Shiori original/resort mirror, training real boxes/contact/frame feedback, box persistence after reset, 320/390/landscape and native touch role skill');
    assert.deepEqual(report.errors, []); report.status = 'passed';
    console.log(JSON.stringify({ status: report.status, checks: report.checks, screenshots: report.screenshots.length }));
  } catch (error) { report.status = 'failed'; report.failure = { message: error.message, stack: error.stack }; throw error; }
  finally { fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); await browser?.close(); }
}
(async () => { try { await run(process.env.HEADED !== '1'); } catch (e) { if (!(e instanceof CaptureFailure)) throw e; await run(false); } })().catch(e => { console.error(e); process.exitCode = 1; });
