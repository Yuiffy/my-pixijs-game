const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd(), path.join(os.homedir(), '.codex/skills/develop-web-game')] }));
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const url = process.env.BEACH_VOLLEY_URL || 'http://localhost:4010/game/beach-volley';
const output = path.resolve(process.env.BEACH_V2_OUTPUT || 'tmp/beach-v2-dev');
fs.mkdirSync(output, { recursive: true });
const screenshots = [], checks = [], errors = [], clips = [];
const manifest = require('../public/games/beach-volley/media.json');
const clipDurations = {};
function collectMedia(value) {
  if (value?.src) clipDurations[value.src] = value.duration;
  else if (value && typeof value === 'object') Object.values(value).forEach(collectMedia);
}
collectMedia(manifest);
const state = p => p.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = (p, ms) => p.evaluate(ms => window.advanceTime(ms), ms);
const released = s => s.inputs.flatMap(Object.values).every(v => !v);
const stable = s => ({ ball: s.ball, players: s.players, score: s.score, hits: s.hits, specials: s.specials });
async function capture(p, name) {
  const metrics = inspectPng(await p.screenshot({ path: path.join(output, `${name}.png`), fullPage: true, animations: 'disabled' }));
  const canvas = await p.locator('canvas').evaluate(c => ({ width: c.width, height: c.height, display: { width: c.clientWidth, height: c.clientHeight } }));
  assert.equal(canvas.width, 1280); assert.equal(canvas.height, 720);
  assert.ok(canvas.display.width > 0 && canvas.display.height > 0);
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal overflow');
  screenshots.push({ name, metrics, canvas, state: await state(p), dom: await p.locator('main').innerText() });
}
async function context(browser, options = {}) {
  const c = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, ...options });
  await c.addInitScript(() => { if (window.speechSynthesis) window.speechSynthesis.speak = () => {}; });
  await c.route('**/api/record', r => r.fulfill({ json: { success: true } }));
  await c.route(/https:\/\/(pagead2\.googlesyndication\.com|hm\.baidu\.com)\//, r => r.fulfill({ body: '' }));
  c.on('page', p => {
    p.on('pageerror', e => errors.push(e.message));
    p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  });
  return c;
}
async function load(p, mode = '同机双人', cinema = 'all', character = 'sui', opponent) {
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.waitForFunction(() => window.beachVolley && JSON.parse(window.render_game_to_text()).assetsReady);
  await p.evaluate(() => window.beachVolley.manual(true));
  await p.locator('#beach-cinema').selectOption(cinema);
  await p.getByRole('button', { name: mode, exact: true }).click();
  await p.getByRole('button', { name: new RegExp({ sui: '岁己.*SUI', shiori: '栞栞.*SHIORI', nagisa: '米汀.*NAGISA' }[character]) }).click();
  if (opponent) await p.locator('#beach-opponent').selectOption(opponent);
}
async function begin(p) { await p.locator('#beach-start').click(); await p.evaluate(() => scrollTo(0, 0)); }
async function rig(p, kind, side = 0, score = [0, 0]) {
  await p.evaluate(({ kind, side, score }) => {
    const g = window.beachVolley.game();
    g.phase = kind === 'serve' ? 'serve' : 'rally'; g.phaseTime = 0;
    g.paused = false; g.freeze = 0; g.cutin = null; g.specialWindup = null; g.score = score;
    g.server = side; g.winner = null; g.pointWinner = null;
    const idle = { left: false, right: false, jump: false, hit: false, dive: false, special: false, aimUp: false, aimDown: false };
    g.players.forEach((p, i) => { Object.assign(p, { x: i ? 830 : 450, y: 378, vx: 0, vy: 0, swing: 0, special: 0, dive: 0, cooldown: 0, pose: 0, shotAim: null, lastInput: { ...idle } }); });
    if (kind === 'special') g.players[side].energy = 100;
    g.ball = { x: g.players[side].x, y: 260, vx: 0, vy: 100, spin: 0, lastHit: 1 - side, lock: 0, power: null };
    if (kind === 'point') g.ball = { ...g.ball, x: side === 0 ? 1245 : 35, y: 586, vx: 0, vy: 300 };
    if (kind === 'serve') {
      g.players.forEach((p, i) => { p.x = i ? 985 : 295; p.y = 606; });
      g.ball = { ...g.ball, x: g.players[side].x, y: 386, vy: 0, lastHit: null };
    }
    if (kind === 'buffer') { g.ball.x = 80; g.ball.y = 80; }
  }, { kind, side, score });
  await advance(p, 0);
}
async function key(p, code, ms = 18) { await p.keyboard.down(code); await advance(p, ms); await p.keyboard.up(code); }
async function movie(p, kind, character, screenshot, natural = true, outcome) {
  await p.waitForFunction(({ kind, character }) => {
    const s = JSON.parse(window.render_game_to_text()); return s.cinematic?.kind === kind && s.cinematic.character === character;
  }, { kind, character });
  await p.waitForFunction(() => { const v = document.querySelector('video'); return v && v.currentTime > 0.25 && v.readyState >= 2; });
  const s = await state(p); assert.equal(s.paused, true); assert.ok(released(s));
  if (outcome) assert.equal(s.cinematic.outcome, outcome);
  const before = stable(s); await advance(p, 2500); assert.deepEqual(stable(await state(p)), before, 'movie freezes physics, score and energy');
  const media = await p.locator('video').evaluate(v => ({ src: v.getAttribute('src'), duration: v.duration, currentTime: v.currentTime, width: v.videoWidth, height: v.videoHeight, error: v.error?.code ?? null }));
  assert.equal(media.width, 1280); assert.equal(media.height, 720); assert.equal(media.error, null);
  assert.ok(Math.abs(media.duration - clipDurations[media.src]) < 0.06, 'decoded duration matches manifest');
  if (screenshot) await capture(p, screenshot);
  clips.push({ kind, character, outcome: s.cinematic.outcome, side: s.cinematic.side, index: s.cinematic.index, count: s.cinematic.count, media, before });
  if (natural) {
    await p.locator('video').evaluate(v => { v.playbackRate = 3; });
    await p.waitForFunction(id => JSON.parse(window.render_game_to_text()).cinematic?.id !== id, s.cinematic.id, { timeout: 15000 });
  } else await p.keyboard.press('Enter');
}
async function controlBounds(p) {
  const size = p.viewportSize();
  for (const b of await p.locator('[data-control]').all()) {
    const box = await b.boundingBox();
    assert.ok(box && box.x >= 0 && box.x + box.width <= size.width + 1 && box.y >= 0 && box.y + box.height <= size.height + 1, 'touch control fits viewport');
  }
}

(async () => {
  assert.equal((await fetch(url)).status, 200, 'server responds before Chrome launches');
  const browser = await chromium.launch({ channel: 'chrome', headless: process.env.HEADED !== '1', args: ['--mute-audio', '--disable-speech-api'] });
  try {
    const c = await context(browser), p = await c.newPage();
    await load(p); await capture(p, '01-menu'); await begin(p);
    await movie(p, 'intro', 'sui', '02-intro'); assert.equal((await state(p)).phase, 'serve');
    await advance(p, 0); assert.equal((await state(p)).cinematic, null, 'intro does not replay');
    checks.push('8-second entrance decodes and naturally returns directly to serve');

    await p.keyboard.down('KeyD'); await p.keyboard.down('KeyI'); await advance(p, 15);
    assert.deepEqual((await state(p)).players[0].aim, { lift: 'lob', depth: 'deep' });
    await capture(p, '03-aim-serve');
    await key(p, 'KeyJ'); await p.keyboard.up('KeyI'); await p.keyboard.up('KeyD');
    assert.deepEqual((await state(p)).ball.shot, { lift: 'lob', depth: 'deep' });
    await rig(p, 'hit'); await p.keyboard.down('KeyD'); await p.keyboard.down('KeyS'); await key(p, 'KeyJ');
    await p.keyboard.up('KeyS'); await p.keyboard.up('KeyD');
    assert.deepEqual((await state(p)).ball.shot, { lift: 'down', depth: 'deep' });
    await capture(p, '04-down-contact');
    await rig(p, 'buffer'); await p.keyboard.down('KeyA'); await p.keyboard.down('KeyI'); await key(p, 'KeyJ');
    await p.keyboard.up('KeyI'); await p.keyboard.up('KeyA');
    await p.evaluate(() => { const g = window.beachVolley.game(); g.ball.x = g.players[0].x; g.ball.y = g.players[0].y - 118; g.ball.vy = 100; });
    await advance(p, 15); assert.deepEqual((await state(p)).ball.shot, { lift: 'lob', depth: 'near' });
    await rig(p, 'hit', 1); await p.keyboard.down('ArrowLeft'); await p.keyboard.down('ArrowDown'); await key(p, 'Slash');
    await p.keyboard.up('ArrowDown'); await p.keyboard.up('ArrowLeft');
    assert.deepEqual((await state(p)).ball.shot, { lift: 'down', depth: 'deep' });
    await rig(p, 'hit', 1); await p.keyboard.down('ArrowRight'); await p.keyboard.down('Numpad8'); await key(p, 'Numpad1');
    await p.keyboard.up('Numpad8'); await p.keyboard.up('ArrowRight');
    assert.deepEqual((await state(p)).ball.shot, { lift: 'lob', depth: 'near' });
    checks.push('actual directional serve/contact, buffered release, and mirrored 2P keys with independent up/down');

    for (const side of [0, 1]) {
      const character = side ? 'shiori' : 'sui';
      await rig(p, 'special', side); await key(p, side ? 'Numpad3' : 'KeyL');
      const count = (await state(p)).specials[side];
      await movie(p, 'special', character, `05-special-${character}`);
      assert.equal((await state(p)).freeze, 0); assert.equal((await state(p)).paused, false);
      assert.equal((await state(p)).specialWindup.remaining, 0.8);
      await advance(p, 100); assert.equal((await state(p)).ball.vx, 0);
      await advance(p, 700); assert.equal((await state(p)).specialWindup, null);
      assert.equal((await state(p)).specials[side], count); assert.equal((await state(p)).cinematic, null);
    }
    for (const side of [0, 1]) {
      await rig(p, 'point', side); await advance(p, 30);
      await movie(p, 'point', side ? 'shiori' : 'sui', `06-point-${side}`);
      assert.equal((await state(p)).phase, 'serve'); assert.equal((await state(p)).server, side);
    }
    for (const side of [0, 1]) {
      await rig(p, 'point', side, side ? [2, 6] : [6, 2]); await advance(p, 30);
      assert.equal((await state(p)).cinematic.kind, 'point'); await p.keyboard.press('Escape');
      await advance(p, 15);
      await movie(p, 'result', side ? 'shiori' : 'sui', `07-result-video-${side}`);
      assert.equal((await state(p)).phase, 'result'); assert.equal((await state(p)).winner, side);
      assert.equal((await state(p)).score[side], 7); await advance(p, 1000); assert.equal((await state(p)).cinematic, null);
      await capture(p, `08-result-panel-${side}`);
      await p.getByRole('button', { name: '再来一场' }).click();
      assert.deepEqual((await state(p)).score, [0, 0]); assert.equal((await state(p)).cinematic, null);
    }
    checks.push('both specials, both point reactions, and both 12-second finales decode, advance, end once, preserve scoring and support rematch');

    for (const opponent of ['sui', 'shiori']) {
      await load(p, '同机双人', 'all', 'nagisa', opponent);
      assert.deepEqual((await state(p)).players.map(p => p.character), ['nagisa', opponent]);
      if (opponent === 'sui') await capture(p, '14-nagisa-menu');
      await begin(p);
      await movie(p, 'intro', 'nagisa', opponent === 'sui' ? '15-nagisa-intro' : null);
      assert.equal((await state(p)).cinematic.side, 1);
      await movie(p, 'intro', opponent);
      assert.equal((await state(p)).phase, 'serve');
      if (opponent === 'sui') {
        await rig(p, 'special'); await key(p, 'KeyL');
        assert.equal((await state(p)).ball.power, 'nagisa');
        await movie(p, 'special', 'nagisa', '16-nagisa-special');
      }
      for (const side of [0, 1]) {
        const winner = side ? opponent : 'nagisa', loser = side ? 'nagisa' : opponent;
        await rig(p, 'point', side); await advance(p, 30);
        await movie(p, 'point', winner, opponent === 'sui' && !side ? '17-nagisa-point-win' : null, true, 'win');
        assert.equal((await state(p)).cinematic.side, 1 - side);
        await movie(p, 'point', loser, opponent === 'sui' && side ? '18-nagisa-point-lose' : null, true, 'lose');
        assert.equal((await state(p)).phase, 'serve'); assert.equal((await state(p)).server, side);
        await rig(p, 'point', side, side ? [2, 6] : [6, 2]); await advance(p, 30);
        await p.keyboard.press('Escape');
        assert.equal((await state(p)).cinematic.kind, 'result', 'skipping point sequence starts final sequence');
        await movie(p, 'result', winner, opponent === 'sui' && !side ? '19-nagisa-result-win' : null, true, 'win');
        await movie(p, 'result', loser, opponent === 'sui' && side ? '20-nagisa-result-lose' : null, true, 'lose');
        assert.equal((await state(p)).phase, 'result'); assert.equal((await state(p)).winner, side);
        if (opponent === 'sui' && !side) await capture(p, '21-nagisa-result-panel');
      }
    }
    await load(p, '同机双人', 'all', 'sui', 'nagisa'); await begin(p);
    await p.keyboard.press('Enter'); assert.equal((await state(p)).cinematic, null, 'skip bypasses entire two-clip intro');
    await rig(p, 'special', 1); await key(p, 'Numpad3');
    assert.equal((await state(p)).ball.power, 'nagisa'); assert.equal((await state(p)).cinematic.character, 'nagisa');
    await p.keyboard.press('Enter'); assert.equal((await state(p)).cinematic.kind, 'special');
    await movie(p, 'special', 'nagisa');
    await load(p, '同机双人', 'all', 'nagisa', 'nagisa'); await begin(p);
    const firstMirror = (await state(p)).cinematic;
    await p.keyboard.press('KeyP');
    await p.locator('video').evaluate(v => v.dispatchEvent(new Event('error')));
    let mirror = (await state(p)).cinematic;
    assert.equal(mirror.index, 1); assert.equal(mirror.side, 1); assert.equal(mirror.paused, true);
    assert.notEqual(mirror.id, firstMirror.id);
    await p.keyboard.press('KeyP'); await movie(p, 'intro', 'nagisa');
    assert.equal((await state(p)).phase, 'serve');
    checks.push('all single-character clips naturally decode; actual winner then loser, both opponents, 2P Nagisa and mirror queues preserve identity, pause and whole-sequence skips');

    const staleContext = await context(browser);
    await staleContext.addInitScript(() => {
      const play = HTMLMediaElement.prototype.play;
      window.__delayOnePlay = true;
      HTMLMediaElement.prototype.play = function (...args) {
        const real = play.apply(this, args);
        if (!window.__delayOnePlay) return real;
        window.__delayOnePlay = false; real.catch(() => {});
        return new Promise((resolve, reject) => { window.__rejectOldPlay = reject; });
      };
      const schedule = window.setTimeout.bind(window);
      window.__movieTimeouts = [];
      window.setTimeout = (callback, delay, ...args) => {
        if (typeof callback === 'function' && delay >= 13600 && delay <= 24000) window.__movieTimeouts.push({ callback, delay });
        return schedule(callback, delay, ...args);
      };
    });
    const stale = await staleContext.newPage(); await load(stale, '同机双人', 'all', 'nagisa', 'nagisa'); await begin(stale);
    const staleId = (await state(stale)).cinematic.id;
    await stale.keyboard.press('Enter'); await stale.keyboard.press('KeyP');
    await stale.getByRole('button', { name: '返回沙滩', exact: true }).click(); await begin(stale);
    const currentId = (await state(stale)).cinematic.id; assert.notEqual(currentId, staleId);
    await stale.evaluate(() => window.__rejectOldPlay(new Error('late playback failure')));
    await stale.waitForTimeout(100); assert.equal((await state(stale)).cinematic.id, currentId, 'old game play failure cannot finish new entrance');
    await stale.locator('video').evaluate(v => v.pause());
    await stale.evaluate(() => window.__movieTimeouts.at(-1).callback());
    assert.equal((await state(stale)).cinematic.index, 1, 'watchdog advances stalled clip');
    const afterWatchdog = (await state(stale)).cinematic.id;
    await stale.evaluate(() => window.__movieTimeouts.at(-2).callback());
    assert.equal((await state(stale)).cinematic.id, afterWatchdog, 'old watchdog cannot skip next clip');
    await stale.keyboard.press('Escape'); await staleContext.close();
    checks.push('late play rejection across rematches and stale watchdog callbacks cannot close a current clip; stalled media advances safely');

    await load(p); await begin(p); await p.keyboard.press('Enter');
    await rig(p, 'special'); await key(p, 'KeyL');
    await p.waitForFunction(() => document.querySelector('video')?.currentTime > 0.2);
    await p.keyboard.press('KeyP'); let t = await p.locator('video').evaluate(v => v.currentTime);
    await p.waitForTimeout(250); assert.ok(Math.abs(await p.locator('video').evaluate(v => v.currentTime) - t) < 0.05);
    await p.getByRole('button', { name: '玩法说明', exact: true }).click(); await capture(p, '09-help');
    await p.getByRole('button', { name: '明白，去接球' }).click();
    assert.equal((await state(p)).cinematic.paused, true, 'help preserves manual movie pause');
    await p.keyboard.press('KeyP'); await p.waitForTimeout(200);
    await p.getByRole('button', { name: '玩法说明', exact: true }).click(); t = await p.locator('video').evaluate(v => v.currentTime);
    await p.waitForTimeout(250); assert.ok(Math.abs(await p.locator('video').evaluate(v => v.currentTime) - t) < 0.05);
    await p.getByRole('button', { name: '明白，去接球' }).click();
    await p.evaluate(() => window.dispatchEvent(new Event('blur'))); assert.equal((await state(p)).cinematic.paused, true);
    await p.keyboard.press('Enter'); assert.equal((await state(p)).cinematic.paused, true, 'Enter cannot skip a paused special');
    await p.keyboard.press('KeyP'); assert.equal((await state(p)).cinematic.paused, false);
    await movie(p, 'special', 'sui'); assert.equal((await state(p)).paused, false);
    await rig(p, 'special'); await key(p, 'KeyL');
    await p.locator('video').evaluate(v => v.dispatchEvent(new Event('error')));
    assert.equal((await state(p)).cinematic, null); assert.equal((await state(p)).paused, false);
    assert.equal((await state(p)).specialWindup.remaining, 0.8); assert.equal((await state(p)).ball.vx, 0);
    checks.push('movie pause/help/blur protection, mandatory specials and video-error fallback preserve full windup');

    await load(p, '同机双人', 'key', 'shiori'); await begin(p); await p.keyboard.press('Enter');
    await rig(p, 'point', 0); await advance(p, 50); assert.equal((await state(p)).cinematic, null);
    await rig(p, 'special'); await key(p, 'KeyL');
    assert.equal((await state(p)).cinematic.character, 'shiori'); await p.keyboard.press('Enter');
    assert.equal((await state(p)).cinematic.kind, 'special'); await movie(p, 'special', 'shiori');
    await load(p, '同机双人', 'off'); await begin(p); assert.equal(await p.locator('video').count(), 0);
    await p.keyboard.press('Enter'); await rig(p, 'special'); await key(p, 'KeyL'); assert.equal((await state(p)).cinematic, null);
    await capture(p, '10-special-fallback');
    await p.reload({ waitUntil: 'networkidle' }); await p.waitForFunction(() => window.beachVolley && JSON.parse(window.render_game_to_text()).assetsReady);
    assert.equal(await p.locator('#beach-cinema').inputValue(), 'off');
    checks.push('key/off modes, persisted choice and character-swapped special select the correct clip');

    const mobileContext = await context(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const m = await mobileContext.newPage(); await load(m, '同机双人', 'off', 'nagisa', 'sui'); await capture(m, '11-mobile-menu');
    await begin(m); await m.keyboard.press('Enter');
    const cdp = await mobileContext.newCDPSession(m);
    const touch = (type, touchPoints) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
    async function point(action, id, side = 0) {
      const b = await m.locator(`[data-control="${side}-${action}"]`).boundingBox(); assert.ok(b);
      return { x: b.x + b.width / 2, y: b.y + b.height / 2, id };
    }
    for (const [side, aim, horizontal, lift, depth] of [[0, 'aimUp', 'right', 'lob', 'deep'], [1, 'aimDown', 'right', 'down', 'near']]) {
      await rig(m, 'serve', side);
      const points = [await point(aim, 1, side), await point(horizontal, 2, side), await point('hit', 3, side)];
      await touch('touchStart', points); await advance(m, 25); await touch('touchEnd', []);
      assert.deepEqual((await state(m)).ball.shot, { lift, depth }); assert.ok(released(await state(m)));
    }
    await touch('touchStart', [await point('aimDown', 7)]); assert.equal((await state(m)).inputs[0].aimDown, true);
    await touch('touchCancel', []); assert.ok(released(await state(m)));
    for (const [width, height] of [[320, 740], [390, 844], [844, 390]]) {
      await m.setViewportSize({ width, height }); await controlBounds(m); await capture(m, `12-touch-${width}`);
    }
    for (const [width, height] of [[320, 740], [390, 844], [844, 390]]) {
      await m.setViewportSize({ width, height }); await load(m, '单人挑战', 'off', 'nagisa', 'shiori');
      const main = await m.locator('main').boundingBox(), start = await m.locator('#beach-start').boundingBox();
      assert.ok(start && start.y >= main.y && start.y + start.height <= main.y + main.height + 1, 'menu start fits inside stage');
      await capture(m, `22-roster-menu-${width}`);
    }
    checks.push('real three-finger directional touch serves for both players, aim cancellation and 320/390/844 layouts');

    const reducedContext = await context(browser, { reducedMotion: 'reduce' }); const r = await reducedContext.newPage();
    await load(r); await begin(r); assert.equal(await r.locator('video').count(), 0); await r.keyboard.press('Enter');
    await rig(r, 'point', 0); await advance(r, 30); assert.equal((await state(r)).cinematic, null); await capture(r, '13-point-fallback');
    checks.push('reduced motion bypasses movies and preserves readable static close-ups');
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ checks, clips: clips.map(c => ({ kind: c.kind, character: c.character, duration: c.media.duration })), screenshots: screenshots.map(s => s.name), errors }, null, 2));
  } finally {
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ checks, clips, screenshots, errors }, null, 2));
    await browser.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
