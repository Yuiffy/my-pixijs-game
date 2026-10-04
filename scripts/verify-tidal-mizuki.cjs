const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd(), path.join(os.homedir(), '.codex/skills/develop-web-game')] }));
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const url = process.env.TIDAL_DUEL_URL || 'http://127.0.0.1:4044/game/tidal-duel';
const output = path.resolve(process.env.TIDAL_DUEL_OUTPUT || 'tmp/tidal-mizuki/browser');
const publicOnly = process.env.TIDAL_DUEL_PUBLIC_MATCH === '1';
const step = 1000 / 120;
const keys = [
  { left: 'KeyA', right: 'KeyD', jump: 'KeyW', crouch: 'KeyS', light: 'KeyJ', medium: 'KeyK', heavy: 'KeyL', ability: 'KeyU', assist: 'KeyI' },
  { left: 'ArrowLeft', right: 'ArrowRight', jump: 'ArrowUp', crouch: 'ArrowDown', light: 'Digit1', medium: 'Digit2', heavy: 'Digit3', ability: 'Digit4', assist: 'Digit5' },
];
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = (page, ms) => page.evaluate(ms => window.advanceTime(ms), ms);
const button = (page, name) => page.getByRole('button', { name, exact: true });
class CaptureFailure extends Error {}
async function press(page, codes, ms = step) {
  for (const code of codes) await page.keyboard.down(code);
  await advance(page, ms);
  for (const code of [...codes].reverse()) await page.keyboard.up(code);
  await advance(page, step);
}
async function until(page, predicate, max = 300) {
  for (let i = 0; i < max; i++) {
    const s = await state(page);
    if (predicate(s)) return s;
    await advance(page, step);
  }
  assert.fail('Expected Mizuki gameplay transition did not occur; last state: ' + JSON.stringify(await state(page)));
}
async function menu(page) {
  if ((await state(page)).phase !== 'menu') {
    await button(page, '返回选人').last().click();
    if (await page.getByRole('dialog').isVisible()) await page.getByRole('dialog').getByRole('button', { name: '返回选人', exact: true }).click();
  }
  assert.equal((await state(page)).phase, 'menu');
}
async function choose(page, character, opponent) {
  await menu(page);
  await page.getByRole('button', { name: new RegExp(`${{ sui: '岁己', shiori: '栞栞', mizuki: '弥月' }[character]}.*${character.toUpperCase()}`) }).click();
  await page.locator('#duel-opponent').selectOption(opponent);
  await advance(page, 0);
}
async function start(page, mode = 'local') {
  await button(page, { local: '同机双人', training: '自由练习', solo: '单人挑战' }[mode]).click();
  await page.locator('#tidal-start').click();
  await page.keyboard.press('Enter'); await advance(page, 20);
  assert.equal((await state(page)).phase, 'fight');
}
async function reset(page, mode = 'local') { await menu(page); await start(page, mode); }
async function active(page, codes, predicate) {
  for (const code of codes) await page.keyboard.down(code);
  const s = await until(page, predicate);
  for (const code of [...codes].reverse()) await page.keyboard.up(code);
  await advance(page, 0);
  return s;
}
async function capture(page, report, name) {
  const s = await state(page);
  if (s.phase === 'menu') await page.locator('#tidal-start').waitFor({ state: 'visible' });
  else await page.locator('#tidal-start').waitFor({ state: 'detached' });
  const file = path.join(output, `${name}.png`);
  let pixels;
  try { pixels = inspectPng(await page.screenshot({ path: file, fullPage: true, animations: 'disabled' })); }
  catch (e) { throw new CaptureFailure(e.message); }
  const dom = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth,
    canvas: [...document.querySelectorAll('canvas')].map(c => ({ width: c.width, height: c.height, rect: c.getBoundingClientRect().toJSON() })),
    controls: [...document.querySelectorAll('[data-control]')].map(b => ({ id: b.dataset.control, rect: b.getBoundingClientRect().toJSON() })) }));
  assert.ok(pixels.colors > 8 && pixels.nearBlackRatio < 0.96 && pixels.transparentRatio < 0.98);
  assert.ok(dom.width <= dom.viewport + 1); assert.equal(dom.canvas.length, 1);
  assert.equal(dom.canvas[0].width, 1280); assert.equal(dom.canvas[0].height, 720); assert.ok(dom.canvas[0].rect.width > 0);
  assert.equal(s.assetsReady, true); assert.equal(s.roster.length, 3);
  report.screenshots.push({ name, file, pixels, state: s, dom });
  return s;
}
async function decode(page, report) {
  report.atlases = await page.evaluate(async () => {
    const ground = await (await fetch('/games/tidal-duel/pixel/compiled.json')).json();
    const air = await (await fetch('/games/tidal-duel/pixel/compiled-air.json')).json();
    const result = [];
    for (const metadata of [...ground, ...air].filter(d => d.file.startsWith('mizuki-'))) {
      const image = new Image(); image.src = `/games/tidal-duel/pixel/${metadata.file}`; await image.decode();
      const c = document.createElement('canvas'); c.width = c.height = metadata.frameSize;
      const ctx = c.getContext('2d', { willReadFrequently: true }); const frames = [];
      for (let n = 0; n < metadata.frames; n++) {
        ctx.clearRect(0, 0, c.width, c.height);
        ctx.drawImage(image, n % 4 * c.width, Math.floor(n / 4) * c.height, c.width, c.height, 0, 0, c.width, c.height);
        const rgba = ctx.getImageData(0, 0, c.width, c.height).data;
        let left = c.width, right = -1, top = c.height, bottom = -1, opaque = 0, partial = 0;
        for (let i = 3; i < rgba.length; i += 4) if (rgba[i]) {
          const p = (i - 3) / 4, x = p % c.width, y = Math.floor(p / c.width);
          left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
          opaque++; if (rgba[i] !== 255) partial++;
        }
        frames.push({ n, bounds: [left, top, right + 1, bottom + 1], opaque, partial });
      }
      result.push({ metadata, width: image.naturalWidth, height: image.naturalHeight, frames });
    }
    const seed = new Image(); seed.src = '/games/tidal-duel/pixel/mizuki-original-seed.webp'; await seed.decode();
    return { sheets: result, seed: { width: seed.naturalWidth, height: seed.naturalHeight } };
  });
  assert.deepEqual(report.atlases.seed, { width: 448, height: 448 });
  assert.equal(report.atlases.sheets.length, 3);
  let total = 0;
  for (const a of report.atlases.sheets) {
    assert.equal(a.width, 1792); assert.equal(a.height, a.metadata.frames / 4 * 448);
    for (const f of a.frames) {
      total++; assert.equal(f.partial, 0); assert.ok(f.opaque > 1000 && f.opaque < 448 * 448 / 2);
      assert.deepEqual(f.bounds, a.metadata.frameBounds[f.n]);
      assert.ok(f.bounds[0] > 0 && f.bounds[1] > 0 && f.bounds[2] < 448 && f.bounds[3] < 448);
      if (a.metadata.file.endsWith('-air.webp')) assert.deepEqual(a.metadata.frameRoots[f.n], [224, 340]);
      else assert.equal(f.bounds[3], 440);
    }
  }
  assert.equal(total, 56); report.checks.push('All 56 Mizuki frames and her seed actually decode; binary alpha, clear bounds, shared feet/pelvis and three separate complete atlases');
}
async function rig(page, poses = [{}, {}]) {
  assert.equal(publicOnly, false);
  await page.evaluate(poses => {
    const g = window.tidalDuel.game();
    Object.assign(g, { phase: 'fight', phaseTime: 0, paused: false, freeze: 0, super: null, projectiles: [], grabs: [], events: [], accumulator: 0 });
    g.camera.shake = 0;
    g.fighters.forEach((f, side) => {
      for (const a of Object.keys(f.previous)) window.tidalDuel.input(side, a, false);
      Object.assign(f, { x: side ? 1030 : 250, y: 610, vx: 0, vy: 0, facing: side ? -1 : 1, state: 'idle', stateTime: 0, stateDuration: 0,
        hp: 300, meter: 100, move: null, moveTime: 0, moveSerial: 0, moveHit: false, contact: 'none', stun: 0, critical: 0,
        invincible: 0, juggle: 0, combo: 0, comboTime: 0, comboDamage: 0, guardGauge: 100, guardDelay: 0, burstReady: true,
        airAttacks: 0, airRank: 0, airLanding: 0, assisted: null, buffer: [], directions: [], history: [],
        previous: Object.fromEntries(Object.keys(f.previous).map(a => [a, false])), ...poses[side] });
    });
  }, poses); await advance(page, 0);
}
async function development(page, report) {
  await choose(page, 'mizuki', 'mizuki'); await start(page);
  for (const [name, actions, row] of [['punch', ['light'], 0], ['kick', ['medium'], 4], ['sweep', ['crouch', 'medium'], 8], ['lunar', ['ability'], 12], ['rise', ['crouch', 'ability'], 16]]) {
    await rig(page);
    await active(page, keys.flatMap(k => actions.map(a => k[a])), s => s.animation.every(a => a.sheet === 'combat' && a.index === row + 1));
    if (name === 'rise') assert.ok((await state(page)).fighters.every(f => f.meter === 75));
    await capture(page, report, `02-ground-${name}`);
  }
  for (const [row, action] of ['light', 'medium', 'heavy', 'ability'].entries()) {
    await rig(page, [{ y: 450, vy: -100, state: 'jump' }, { y: 450, vy: -100, state: 'jump' }]);
    await active(page, keys.map(k => k[action]), s => s.animation.every(a => a.sheet === 'air' && a.index === row * 4 + 1));
    await capture(page, report, `03-air-${action}`);
  }
  await rig(page, [{ state: 'hit', stateTime: 0, stun: 0.3 }, { state: 'hit', stateTime: 0.1, stun: 0.3 }]);
  await capture(page, report, '04-hurt-phases');
  await rig(page, [{ state: 'victory' }, { state: 'defeat' }]);
  await capture(page, report, '05-victory-down');
  for (const side of [0, 1]) {
    await rig(page, [{ x: 520 }, { x: 730 }]);
    await active(page, [keys[side].ability], s => s.fighters[side].contact === 'hit');
    await advance(page, step);
    await press(page, [keys[side].ability], 100);
    await until(page, s => s.fighters[side].move === 'signature2' && s.fighters[side].contact === 'hit');
    assert.equal((await state(page)).fighters[1 - side].state, 'down');
    assert.equal((await state(page)).animation[side].index, 5);
    await capture(page, report, `05-two-kicks-${side + 1}P`);
  }
  report.checks.push('Development actual keyboard both slots: five ground active rows, four air active rows, 25-meter anti-air, distinct recoil/down/victory artwork');
}
async function publicGameplay(page, report) {
  assert.equal(await page.evaluate(() => typeof window.tidalDuel), 'undefined', 'production exposes no mutable developer hook');
  await choose(page, 'mizuki', 'mizuki'); await start(page);
  const separate = async () => {
    await page.keyboard.down(keys[0].left); await page.keyboard.down(keys[1].right);
    await until(page, s => s.fighters[1].x - s.fighters[0].x >= 780);
    await page.keyboard.up(keys[1].right); await page.keyboard.up(keys[0].left);
    await advance(page, step);
  };
  for (const [name, actions, row] of [['punch', ['light'], 0], ['kick', ['medium'], 4], ['sweep', ['crouch', 'medium'], 8], ['lunar', ['ability'], 12]]) {
    await reset(page); await separate();
    await active(page, keys.flatMap(k => actions.map(a => k[a])), s => s.animation.every(a => a.sheet === 'combat' && a.index === row + 1));
    if (name === 'lunar') await capture(page, report, '02-public-lunar');
  }
  for (const [row, action] of ['light', 'medium', 'heavy', 'ability'].entries()) {
    await reset(page); await separate(); await press(page, keys.map(k => k.jump), 200);
    await active(page, keys.map(k => k[action]), s => s.animation.every(a => a.sheet === 'air' && a.index === row * 4 + 1));
    if (['medium', 'ability'].includes(action)) await capture(page, report, `03-public-air-${action}`);
  }
  await reset(page, 'training');
  await active(page, [keys[0].crouch, keys[0].ability], s => s.fighters[0].move === 'reversal' && s.animation[0].index === 17);
  assert.equal((await state(page)).fighters[0].meter, 75); await capture(page, report, '04-public-reversal');
  await button(page, '重置站位').click(); await advance(page, 0);
  assert.equal((await state(page)).fighters[0].meter, 100);
  await active(page, [keys[0].heavy, keys[0].ability], s => s.fighters[0].move === 'super');
  assert.equal((await state(page)).fighters[0].meter, 0); await capture(page, report, '05-public-super');
  await button(page, '重置站位').click(); await advance(page, 0);
  await press(page, [keys[0].right], 700);
  await active(page, [keys[0].ability], s => s.fighters[0].contact === 'hit');
  await advance(page, step); await press(page, [keys[0].ability], 100);
  await until(page, s => s.fighters[0].move === 'signature2' && s.fighters[0].contact === 'hit');
  assert.equal((await state(page)).fighters[1].state, 'down');
  await capture(page, report, '05-public-two-kicks');
  await button(page, '重置站位').click(); await advance(page, 0);
  await press(page, [keys[0].right], 700);
  let hit = false; await page.keyboard.down(keys[0].assist);
  for (let i = 0; i < 14; i++) {
    await press(page, [keys[0].medium], 66); await advance(page, 8);
    const s = await state(page); hit ||= s.fighters[0].combo >= 3;
  }
  await page.keyboard.up(keys[0].assist);
  assert.ok(hit, 'real keyboard assisted kick/punch/lunar route lands three confirmed hits');
  await button(page, '重置站位').click(); await advance(page, 0);
  await press(page, [keys[0].jump], 150); await press(page, ['KeyP']);
  const paused = await state(page); assert.ok(paused.paused && paused.fighters[0].airborne);
  await advance(page, 1200); assert.deepEqual((await state(page)).fighters, paused.fighters);
  await press(page, ['KeyP']); await advance(page, 1200); assert.equal((await state(page)).fighters[0].y, 610);
  report.checks.push('Production public controls: both Mizuki slots with all ground/air normals, two-kick lunar/dive, paid reversal, super chord, training reset, real 3-hit assisted route and flight pause/resume');
}
async function finishSet(page, report, side) {
  await choose(page, side ? 'sui' : 'mizuki', side ? 'mizuki' : 'shiori'); await start(page);
  let rounds = 0;
  for (let i = 0; i < 100; i++) {
    let s = await state(page); if (s.phase === 'result') break;
    if (s.phase === 'intro' || s.phase === 'roundEnd') { rounds++; await advance(page, 4000); continue; }
    const f = s.fighters[side], target = s.fighters[1 - side], gap = Math.abs(f.x - target.x);
    if (gap > 130) {
      await press(page, [keys[side][f.x < target.x ? 'right' : 'left']], Math.min(1500, (gap - 109) / 286 * 1000));
      s = await state(page);
    }
    await press(page, s.fighters[side].meter >= 100 ? [keys[side].heavy, keys[side].ability] : [keys[side].medium], 850);
    await advance(page, 550);
  }
  const result = await capture(page, report, `06-complete-set-${side + 1}P`);
  assert.equal(result.phase, 'result'); assert.equal(result.winner, side); assert.equal(result.fighters[1 - side].hp, 0);
  assert.equal(result.wins[side], 2); assert.ok(rounds > 0); assert.equal(result.fighters[side].character, 'mizuki');
  assert.match(await page.getByLabel('对决结果', { exact: true }).innerText(), /弥月，胜出/);
  await button(page, '再战一场 ↗').click(); await advance(page, 1800);
  assert.deepEqual((await state(page)).wins, [0, 0]); await menu(page);
}
async function responsive(page, context, report) {
  for (const viewport of [{ width: 320, height: 740 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await choose(page, 'mizuki', 'mizuki'); await page.setViewportSize(viewport); await advance(page, 0);
    const roster = page.getByLabel('角色与对战设置').getByRole('button', { name: /SUI|SHIORI|MIZUKI/ });
    assert.equal(await roster.count(), 3);
    for (const b of await roster.all()) { const box = await b.boundingBox(); assert.ok(box.width >= 44 && box.height >= 44); }
    await capture(page, report, `07-menu-${viewport.width}`); await start(page, 'training');
    const points = [];
    for (const [i, action] of ['jump', 'medium'].entries()) {
      const el = page.locator(`[data-control="0-${action}"]`); await el.scrollIntoViewIfNeeded();
      const b = await el.boundingBox(); points.push({ id: i + 1, x: b.x + b.width / 2, y: b.y + b.height / 2, radiusX: 8, radiusY: 8, force: 1 });
    }
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points });
    await until(page, s => s.fighters[0].move === 'airKick' && s.animation[0].index === 5);
    const airborne = await state(page); assert.equal(airborne.fighters[0].character, 'mizuki'); assert.ok(airborne.fighters[0].airborne);
    await capture(page, report, `08-touch-air-${viewport.width}`);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] }); await advance(page, 1300); await cdp.detach();
    assert.equal((await state(page)).fighters[0].y, 610); await menu(page);
  }
  report.checks.push('320/390/844 layouts: three readable roster choices, black-stocking mirror, native two-finger jump+kick with cancel and landing, no horizontal overflow');
}
async function discovery(page, report) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await choose(page, 'sui', 'mizuki'); await start(page, 'solo');
  await until(page, s => s.fighters[0].hp < 300, 1800);
  await capture(page, report, '09-mizuki-cpu'); await menu(page);
  await button(page, '玩法').click(); assert.match(await page.getByRole('dialog').innerText(), /弥月 · 月弧踢/);
  await button(page, '明白了，去过招 →').click();
  // Restore real frames before leaving the deterministic game; the hall uses RAF for its entrance animation.
  await page.evaluate(() => window.__resumeTidalTestRaf());
  await page.getByRole('link', { name: /游戏大厅/ }).click(); await page.waitForURL('**/demos');
  // Framer Motion caches the RAF function at import time; reload the hall with native RAF.
  await page.reload();
  await page.getByRole('searchbox', { name: '搜索游戏' }).fill('弥月');
  await page.waitForURL(u => u.searchParams.get('q') === '弥月');
  const entry = page.locator('[data-game="/game/tidal-duel"]'); await entry.waitFor();
  await page.waitForFunction(() => {
    for (let el = document.querySelector('[data-game="/game/tidal-duel"]'); el; el = el.parentElement) {
      if (Number(getComputedStyle(el).opacity) < 0.99) return false;
    }
    return true;
  });
  assert.match(await entry.innerText(), /弥月/); assert.match(await entry.innerText(), /黑丝/);
  await entry.locator('img').evaluate(el => el.decode());
  const poster = await page.request.get(new URL('/games/tidal-duel/poster.webp', url).href); assert.equal(poster.status(), 200);
  const file = path.join(output, '10-hall-mizuki.png'); const pixels = inspectPng(await page.screenshot({ path: file, fullPage: true }));
  report.screenshots.push({ name: '10-hall-mizuki', file, pixels, entry: await entry.innerText() });
  await entry.getByRole('link', { name: '打开 潮夜格斗 · 三人像素对战', exact: true }).click();
  await page.waitForURL('**/game/tidal-duel'); await page.waitForFunction(() => window.render_game_to_text && JSON.parse(window.render_game_to_text()).assetsReady, null, { polling: 50 });
  assert.equal((await state(page)).roster.length, 3);
  report.checks.push('Playable Mizuki solo CPU, updated character guide, hall search by 弥月/black-stocking description and new poster, route returns to the three-fighter roster');
}
async function run(headless) {
  fs.mkdirSync(output, { recursive: true });
  const report = { status: 'running', url, publicOnly, browser: { channel: 'chrome', headless, muted: true }, checks: [], screenshots: [], errors: [] };
  let browser;
  try {
    assert.equal((await fetch(url, { signal: AbortSignal.timeout(20000) })).status, 200);
    browser = await chromium.launch({ channel: 'chrome', headless, args: ['--mute-audio', '--disable-speech-api'] });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, hasTouch: true });
    await context.route(/\/api\/record(?:\?|$)/, r => r.fulfill({ contentType: 'application/json', body: '{"success":true,"skipped":true}' }));
    await context.route(/https:\/\/(pagead2\.googlesyndication\.com|hm\.baidu\.com)\//, r => r.fulfill({ contentType: 'application/javascript', body: '' }));
    await context.addInitScript(() => {
      localStorage.setItem('tidal-duel-cinematics', 'off');
      if (window.speechSynthesis) window.speechSynthesis.speak = () => {};
      if (!/^\/game\/tidal-duel\/?$/.test(location.pathname)) return;
      const requestFrame = window.requestAnimationFrame.bind(window);
      const cancelFrame = window.cancelAnimationFrame.bind(window);
      let id = 0; const callbacks = new Map();
      window.requestAnimationFrame = fn => { callbacks.set(++id, fn); return id; };
      window.cancelAnimationFrame = value => callbacks.delete(value);
      window.__resumeTidalTestRaf = () => {
        window.requestAnimationFrame = requestFrame;
        window.cancelAnimationFrame = cancelFrame;
        for (const fn of callbacks.values()) requestFrame(fn);
        callbacks.clear();
      };
    });
    const page = await context.newPage();
    page.on('pageerror', e => report.errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
    await page.goto(url); await page.waitForFunction(() => window.render_game_to_text && JSON.parse(window.render_game_to_text()).assetsReady, null, { polling: 50 });
    if (!publicOnly) await page.evaluate(() => window.tidalDuel.manual(true));
    assert.equal(await page.locator('#duel-opponent option').count(), 3);
    await page.locator('#duel-skin').selectOption('resort'); await page.locator('#duel-opponent-skin').selectOption('resort');
    await choose(page, 'mizuki', 'mizuki');
    assert.equal(await page.locator('#duel-skin').inputValue(), 'original'); assert.equal(await page.locator('#duel-opponent-skin').inputValue(), 'original');
    assert.ok((await state(page)).fighters.every(f => f.character === 'mizuki' && f.skin === 'original'));
    await capture(page, report, '01-mizuki-selection'); await decode(page, report);
    if (publicOnly) await publicGameplay(page, report); else await development(page, report);
    await finishSet(page, report, 0); await finishSet(page, report, 1); await responsive(page, context, report); await discovery(page, report);
    assert.deepEqual(report.errors, []); report.status = 'passed';
    console.log(JSON.stringify({ status: report.status, checks: report.checks, screenshots: report.screenshots.map(s => s.name) }, null, 2));
  } catch (e) { report.status = 'failed'; report.failure = { message: e.message, stack: e.stack }; throw e; }
  finally { fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); await browser?.close(); }
}
(async () => { try { await run(process.env.HEADED !== '1'); } catch (e) { if (!(e instanceof CaptureFailure)) throw e; await run(false); } })().catch(e => { console.error(e); process.exitCode = 1; });
