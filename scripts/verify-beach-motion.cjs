const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd(), path.join(os.homedir(), '.codex/skills/develop-web-game')] }));
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const { instrumentAudio } = require('./verify-beach-audio.cjs');
const url = process.env.BEACH_VOLLEY_URL || 'http://127.0.0.1:4028/game/beach-volley';
const production = process.env.BEACH_MOTION_PRODUCTION === '1';
const output = path.resolve(process.env.BEACH_MOTION_OUTPUT || 'tmp/beach-motion-dev');
fs.mkdirSync(output, { recursive: true });
const report = { production, checks: [], screenshots: [], audio: [], errors: [] };
const actors = ['sui', 'shiori', 'nagisa'];
const names = { sui: '岁己.*SUI', shiori: '栞栞.*SHIORI', nagisa: '米汀.*NAGISA' };
const state = p => p.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = (p, ms) => p.evaluate(ms => window.advanceTime(ms), ms);
const wait = (p, fn, arg = null, timeout = 20000) => p.waitForFunction(fn, arg, { polling: 100, timeout });
async function capture(p, name) {
  const metrics = inspectPng(await p.screenshot({ path: path.join(output, `${name}.png`), fullPage: true, animations: 'disabled' }));
  const canvas = await p.locator('canvas').evaluate(c => ({ width: c.width, height: c.height, display: [c.clientWidth, c.clientHeight] }));
  assert.equal(canvas.width, 1280); assert.equal(canvas.height, 720);
  assert.ok(canvas.display.every(v => v > 0));
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  report.screenshots.push({ name, metrics, canvas, state: await state(p), dom: await p.locator('main').innerText() });
}
async function context(browser, options = {}) {
  const c = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...options });
  await c.addInitScript(instrumentAudio);
  await c.addInitScript(() => {
    window.requestAnimationFrame = () => 1;
    window.cancelAnimationFrame = () => {};
    Math.random = () => .99;
    try { localStorage.setItem('beach-volley-cinema', 'off'); } catch { /* no origin yet */ }
  });
  await c.route('**/api/record', r => r.fulfill({ json: { success: true } }));
  await c.route(/https:\/\/(pagead2\.googlesyndication\.com|hm\.baidu\.com)\//, r => r.fulfill({ body: '' }));
  c.on('page', p => {
    p.on('pageerror', e => report.errors.push(e.message));
    p.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
  });
  return c;
}
async function load(p, actor = 'sui', opponent = 'shiori', cinema = 'off') {
  await p.goto(url, { waitUntil: 'domcontentloaded' });
  await wait(p, () => window.render_game_to_text && JSON.parse(window.render_game_to_text()).assetsReady);
  assert.equal(await p.evaluate(() => typeof window.beachVolley), production ? 'undefined' : 'object');
  await p.getByRole('button', { name: '同机双人', exact: true }).click();
  await p.getByRole('button', { name: new RegExp(names[actor]) }).click();
  await p.locator('#beach-opponent').selectOption(opponent);
  await p.locator('#beach-cinema').selectOption(cinema);
  await wait(p, () => { const a = JSON.parse(window.render_game_to_text()).audio; return a.loaded > 0 && !a.fetching && !a.queued; }, null, 60000);
  await p.locator('#beach-start').click();
  await p.evaluate(() => document.activeElement?.blur());
  await p.keyboard.press('Enter'); await advance(p, 9);
  assert.equal((await state(p)).phase, 'serve');
  await p.keyboard.down('KeyJ'); await advance(p, 9); await p.keyboard.up('KeyJ');
  await advance(p, 300);
  assert.equal((await state(p)).phase, 'rally');
}
async function rig(p, point = false, final = false) {
  assert.equal(production, false);
  await p.evaluate(({ point, final }) => {
    const g = window.beachVolley.game();
    Object.assign(g, { phase: 'rally', phaseTime: 0, paused: false, freeze: 0, cutin: null, specialWindup: null, winner: null, score: final ? [6, 0] : [0, 0], trail: [], effects: [] });
    const idle = { left: false, right: false, jump: false, hit: false, dive: false, special: false, aimUp: false, aimDown: false };
    g.players.forEach((p, i) => Object.assign(p, { x: i ? 1120 : 160, y: 606, vx: 0, vy: 0, dive: 0, swing: 0, special: 0, cooldown: 0, pose: 0, runDistance: 0, runBlend: 0, runLean: 0, groundSpeed: 0, runDirection: i ? -1 : 1, lastInput: { ...idle } }));
    g.ball = { x: 1245, y: point ? 587 : 40, vx: 0, vy: point ? 200 : 0, spin: 0, lock: 10, power: null, lastHit: null };
  }, { point, final });
  await advance(p, 9);
}
async function move(p, inward) {
  for (const code of ['KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight']) await p.keyboard.up(code);
  if (inward !== null) {
    await p.keyboard.down(inward ? 'KeyD' : 'KeyA');
    await p.keyboard.down(inward ? 'ArrowLeft' : 'ArrowRight');
  }
}
async function waitAudioDone(p) {
  await wait(p, () => { const a = JSON.parse(window.render_game_to_text()).audio; return !a.voice && !a.pendingVoices; });
}
async function expectVoice(p, src, since = 0) {
  await wait(p, ({ src, since }) => window.audioProbe().starts.slice(since).some(s => s.src === src), { src, since });
  const started = await p.evaluate(({ src, since }) => window.audioProbe().starts.slice(since).filter(s => s.src === src).at(-1), { src, since });
  assert.ok(started.rms > .03 && started.peak > .15 && started.peak <= 1);
  assert.equal(started.playbackRate, 1);
  report.audio.push(started);
}
async function voices(browser) {
  if (process.env.BEACH_MOTION_SUITE !== 'embedded') {
  const c = await context(browser), p = await c.newPage();
  await load(p, 'shiori', 'sui'); await waitAudioDone(p);
  await rig(p, true); await expectVoice(p, '/games/beach-volley/audio-v4/shiori-pointWin-2.mp3');
  await capture(p, 'shiori-button-point-win'); await waitAudioDone(p);
  for (let i = 0; i < 2; i++) { await rig(p, true, true); await waitAudioDone(p); }
  await expectVoice(p, '/games/beach-volley/audio-v4/shiori-victory-1.mp3');
  await capture(p, 'shiori-button-match-win');
  const starts = await p.evaluate(() => window.audioProbe().starts);
  assert.ok(starts.every(s => !/audio-v3\/shiori-(pointWin-2|victory-1|effort-2)\.mp3$/.test(s.src || '')));
  await waitAudioDone(p);
  const since = await p.evaluate(() => window.audioProbe().starts.length);
  for (let i = 0; i < 2; i++) {
    await rig(p);
    await p.evaluate(() => {
      const g = window.beachVolley.game();
      Object.assign(g.ball, { x: g.players[0].x, y: 466, lock: 0, lastHit: 1 });
    });
    await advance(p, 9); await p.waitForTimeout(550);
  }
  await expectVoice(p, '/games/beach-volley/audio-v4/shiori-effort-2.mp3', since);
  assert.equal((await state(p)).lastContact.type, 'hit');
  report.checks.push('all three replacement MP3s actually decode and play in their gameplay events; rejected MP3s never start');
  await c.close();
  }
  for (const quality of process.env.BEACH_MOTION_QUALITY ? [process.env.BEACH_MOTION_QUALITY] : ['standard', 'lite']) {
    const mc = await context(browser);
    if (quality === 'lite') await mc.addInitScript(() => { try { Object.defineProperty(navigator, 'connection', { value: { saveData: true, effectiveType: '2g', addEventListener() {}, removeEventListener() {} } }); } catch { /* optional platform API */ } });
    const m = await mc.newPage(); await load(m, 'shiori', 'sui', 'all');
    await wait(m, () => !JSON.parse(window.render_game_to_text()).cinematic);
    try { await wait(m, quality => {
      const cache = JSON.parse(window.render_game_to_text()).mediaCache;
      return cache[quality === 'standard' ? 'standardReady' : 'liteReady'] >= (quality === 'standard' ? 11 : 1);
    }, quality, 60000); } catch (e) {
      report.failureState = await state(m);
      console.error('media preparation state', JSON.stringify(report.failureState.mediaCache));
      throw e;
    }
    await waitAudioDone(m); await rig(m, true);
    await wait(m, () => { const s = JSON.parse(window.render_game_to_text()); const v = document.querySelector('video'); return s.cinematic?.src.includes('dubbed-v8/') && v && v.readyState >= 2 && v.currentTime > .3; });
    const s = await state(m);
    assert.equal(s.cinematic.dialogue, '我是天才！');
    assert.equal(s.audio.cinemaDialogue, true); assert.equal(s.audio.voice, null);
    const video = await m.locator('video').evaluate(v => ({ src: v.currentSrc, audioBytes: v.webkitAudioDecodedByteCount, muted: v.muted }));
    assert.equal(video.muted, false); assert.ok(video.audioBytes > 0);
    assert.equal(s.cinematic.quality, quality);
    await capture(m, `shiori-embedded-button-${quality}`);
    report.audio.push({ quality, video, cinematic: s.cinematic, cache: s.mediaCache });
    await mc.close();
  }
  report.checks.push('new point-win voice survives both standard and light embedded playback with no duplicate external line');
}
async function main() {
  assert.equal((await fetch(url)).status, 200, 'server responds before launching Chrome');
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--disable-speech-api'] });
  try {
    if (['voices', 'embedded'].includes(process.env.BEACH_MOTION_SUITE)) {
      await voices(browser); assert.deepEqual(report.errors, []);
      return;
    }
    const c = await context(browser), p = await c.newPage();
    for (let i = 0; i < actors.length; i++) {
      const name = `${actors[i]}-${actors[(i + 1) % actors.length]}`;
      await load(p, actors[i], actors[(i + 1) % actors.length]);
      if (!production) await rig(p);
      await move(p, true);
      const frames = new Set();
      for (let j = 0; j < 4; j++) {
        await advance(p, 120); const s = await state(p);
        assert.equal(s.phase, 'rally'); assert.ok(s.players.every(a => a.movement.active));
        frames.add(s.players[0].movement.frame);
        assert.equal(s.players[0].movement.direction, 1); assert.equal(s.players[1].movement.direction, -1);
        await capture(p, `${name}-run-${j}`);
      }
      assert.equal(frames.size, 4);
      await move(p, false); await advance(p, 140);
      assert.equal((await state(p)).players[0].movement.direction, -1);
      assert.equal((await state(p)).players[1].movement.direction, 1);
      await capture(p, `${name}-reverse`);
      await move(p, null); await advance(p, 400);
      assert.ok((await state(p)).players.every(a => !a.movement.active));
      await capture(p, `${name}-rest`);
    }
    report.checks.push('all three actors on both sides: four live frames, facing actual travel, reversal and settling to idle');
    if (!production) {
      await rig(p); await move(p, true); await advance(p, 180);
      await p.keyboard.press('KeyP'); const frozen = await state(p); await advance(p, 1400);
      assert.deepEqual((await state(p)).players, frozen.players);
      await capture(p, 'paused-running'); await p.keyboard.press('KeyP'); await move(p, null);
      await rig(p); await move(p, true); await p.keyboard.down('Space'); await advance(p, 140); await p.keyboard.up('Space');
      assert.equal((await state(p)).players[0].movement.active, false); await capture(p, 'jump-priority');
      await move(p, null); await rig(p); await move(p, true); await p.keyboard.down('KeyK'); await advance(p, 140); await p.keyboard.up('KeyK');
      assert.equal((await state(p)).players[0].dive.phase, 'flight'); assert.equal((await state(p)).players[0].movement.active, false);
      await capture(p, 'dive-priority'); await move(p, null);
      await rig(p); await move(p, true);
      for (let i = 0; i < 13; i++) {
        await p.evaluate(() => Object.assign(window.beachVolley.game().ball, { y: 40, vy: 0 }));
        await advance(p, 100);
      }
      assert.equal((await state(p)).phase, 'rally');
      const wall = (await state(p)).players.map(a => a.movement.distance); await advance(p, 300);
      assert.deepEqual((await state(p)).players.map(a => a.movement.distance), wall);
      assert.ok((await state(p)).players.every(a => !a.movement.active));
      await capture(p, 'wall-idle'); await move(p, null);
      await rig(p); await p.emulateMedia({ reducedMotion: 'reduce' }); await move(p, true); await advance(p, 180);
      assert.ok((await state(p)).players.every(a => a.movement.active)); await capture(p, 'reduced-running'); await move(p, null);
      report.checks.push('pause freezes gait; walls stop it; jump/dive retain their priority; reduced motion retains leg poses');
    }
    await c.close();
    for (const width of [320, 390]) {
      const mc = await context(browser, { viewport: { width, height: 844 }, isMobile: true, hasTouch: true });
      const m = await mc.newPage(); await load(m, 'shiori', 'nagisa'); if (!production) await rig(m);
      const cdp = await mc.newCDPSession(m), points = [];
      for (const key of ['0-right', '1-left']) {
        const b = await m.locator(`[data-control="${key}"]`).boundingBox(); assert.ok(b);
        points.push({ x: b.x+b.width/2, y: b.y+b.height/2, id: points.length+1 });
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points });
      await advance(m, 180); assert.ok((await state(m)).players.every(a => a.movement.active));
      await capture(m, `touch-running-${width}`);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] }); await advance(m, 400);
      assert.ok((await state(m)).players.every(a => !a.movement.active));
      await mc.close();
    }
    report.checks.push('320/390px simultaneous two-player touch runs and settles after cancellation');
    if (!production) await voices(browser);
    assert.deepEqual(report.errors, []);
  } finally { fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); await browser.close(); }
  console.log(JSON.stringify({ checks: report.checks, screenshots: report.screenshots.length, audio: report.audio.length, errors: report.errors }, null, 2));
}
module.exports = { main };
if (require.main === module) main().catch(e => { console.error(e); process.exitCode = 1; });
