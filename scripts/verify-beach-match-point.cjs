const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd(), path.join(os.homedir(), '.codex/skills/develop-web-game')] }));
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const { instrumentAudio } = require('./verify-beach-audio.cjs');
const audioManifest = JSON.parse(fs.readFileSync('public/games/beach-volley/audio.json', 'utf8'));
const voiceSources = kind => Object.values(audioManifest.voices).flatMap(actor => {
  const pool = actor[kind]; return (Array.isArray(pool) ? pool : [pool]).map(clip => clip.src);
});
const pointSources = [...voiceSources('pointWin'), ...voiceSources('pointLose')];

const production = process.env.BEACH_MATCH_PRODUCTION === '1';
const url = process.env.BEACH_VOLLEY_URL || 'http://localhost:4021/game/beach-volley';
const output = path.resolve(process.env.BEACH_MATCH_OUTPUT || `tmp/beach-match-point/${production ? 'production' : 'dev'}`);
fs.mkdirSync(output, { recursive: true });
const report = { production, checks: [], matches: [], audio: [], screenshots: [], errors: [] };
const state = p => p.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = (p, ms) => p.evaluate(ms => window.advanceTime(ms), ms);

async function capture(p, name) {
  const metrics = inspectPng(await p.screenshot({ path: path.join(output, `${name}.png`), fullPage: true, animations: 'disabled' }));
  const canvas = await p.locator('canvas').evaluate(c => ({ width: c.width, height: c.height, display: [c.clientWidth, c.clientHeight] }));
  assert.equal(canvas.width, 1280); assert.equal(canvas.height, 720);
  assert.ok(canvas.display.every(v => v > 0));
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal overflow');
  report.screenshots.push({ name, metrics, canvas, state: await state(p), dom: await p.locator('main').innerText() });
}

async function setup(browser, { mode = 'local', cinema = 'all', target = 7, viewport = { width: 1440, height: 900 }, mobile = false } = {}) {
  const c = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile });
  await c.addInitScript(instrumentAudio);
  await c.addInitScript(() => {
    // Freeze the test scheduler only. Gameplay is driven through the public clock.
    window.requestAnimationFrame = () => 1;
    window.cancelAnimationFrame = () => {};
    Math.random = () => 0;
  });
  await c.route('**/api/record', r => r.fulfill({ json: { success: true } }));
  await c.route(/https:\/\/(pagead2\.googlesyndication\.com|hm\.baidu\.com)\//, r => r.fulfill({ body: '' }));
  const p = await c.newPage();
  p.on('pageerror', e => report.errors.push(e.message));
  p.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
  await p.goto(url, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.render_game_to_text && JSON.parse(window.render_game_to_text()).assetsReady, null, { polling: 100 });
  assert.equal(await p.evaluate(() => typeof window.beachVolley), production ? 'undefined' : 'object');
  await p.getByRole('button', { name: { local: '同机双人', solo: '单人挑战', practice: '自由练习' }[mode], exact: true }).click();
  await p.getByRole('button', { name: /岁己.*SUI/ }).click();
  await p.locator('#beach-opponent').selectOption('nagisa');
  if (mode !== 'practice') await p.locator('#beach-target').selectOption(String(target));
  await p.locator('#beach-cinema').selectOption(cinema);
  if (mode === 'solo') await p.locator('#beach-difficulty').selectOption('hard');
  await p.waitForFunction(() => JSON.parse(window.render_game_to_text()).audio.loaded >= 32, null, { polling: 100 });
  await p.locator('#beach-start').click();
  await skip(p);
  assert.equal((await state(p)).phase, 'serve');
  const box = await p.locator('canvas').boundingBox();
  await p.locator('canvas').click({ position: { x: box.width / 2, y: box.height * 0.65 } });
  return { c, p };
}

async function skip(p) {
  await p.evaluate(() => document.activeElement?.blur());
  await p.keyboard.press('Enter'); await advance(p, 9);
}

async function hint(p, expected) {
  const s = await state(p);
  assert.deepEqual(s.matchPoints, expected);
  const active = expected.some(Boolean);
  await p.locator('[data-match-point-side]').waitFor({ state: active ? 'visible' : 'hidden' });
  assert.equal(await p.locator('[data-match-point-side]').isVisible(), active);
  if (active) {
    const side = expected.every(Boolean) ? 'both' : expected[0] ? '0' : '1';
    assert.equal(await p.locator('[data-match-point-side]').getAttribute('data-match-point-side'), side);
    assert.equal(await p.locator('[data-match-point]').count(), expected.filter(Boolean).length);
    const text = await p.locator('[data-match-point-side]').innerText();
    assert.match(text, side === 'both' ? /双方赛点.*下一球决胜/ : /赛点.*再得 1 分获胜/);
    const badge = await p.locator('[data-match-point-side]').boundingBox();
    const court = await p.locator('canvas').boundingBox();
    assert.ok(badge.x >= court.x && badge.x + badge.width <= court.x + court.width + 1);
    assert.ok(badge.y >= court.y && badge.y + badge.height < court.y + court.height * 0.42, 'hint stays above the ball/net playfield');
  }
}

async function rig(p, score) {
  assert.equal(production, false, 'rigging is development-only');
  await p.evaluate(score => {
    const g = window.beachVolley.game();
    Object.assign(g, { score, phase: 'serve', phaseTime: 0, paused: false, freeze: 0, cutin: null, winner: null, pointWinner: null, event: null, lastContact: null, specialWindup: null });
  }, score);
  await advance(p, 9);
}

async function ground(p, losingSide) {
  await p.evaluate(losingSide => {
    window.matchPointAudioStart = window.audioProbe().starts.length;
    const g = window.beachVolley.game();
    g.phase = 'rally'; g.phaseTime = 0;
    Object.assign(g.ball, { x: losingSide ? 1245 : 35, y: 587, vx: 0, vy: 200, lock: 1, power: null });
  }, losingSide);
  await advance(p, 9);
  return state(p);
}

async function result(p, winner, name, natural = false) {
  const s = await state(p);
  assert.equal(s.phase, 'result'); assert.equal(s.winner, winner); assert.equal(s.event.type, 'win');
  assert.ok(!s.audio.voice || ['victory', 'defeat'].includes(s.audio.voice.kind));
  assert.deepEqual(s.matchPoints, [false, false]);
  await p.locator('[data-match-point-side]').waitFor({ state: 'detached' });
  assert.equal(await p.locator('[data-match-point-side]').count(), 0);
  if (s.cinemaMode !== 'off') {
    assert.equal(s.cinematic.kind, 'result'); assert.equal(s.cinematic.side, winner);
    assert.equal(s.cinematic.outcome, 'win'); assert.equal(s.cinematic.index, 0);
    assert.equal(s.cinematic.count, 2); assert.equal(s.cinematic.paired, false);
    await p.locator('[data-cinematic="result"]').waitFor({ state: 'visible' });
    assert.equal(await p.locator('[data-cinematic="point"]').count(), 0);
    await p.waitForFunction(() => { const v = document.querySelector('video'); return v && v.readyState >= 2 && v.currentTime > 0.15; }, null, { polling: 100 });
    await capture(p, `${name}-winner`);
    if (natural) {
      await p.waitForFunction(() => JSON.parse(window.render_game_to_text()).cinematic?.index === 1, null, { polling: 100, timeout: 15000 });
      const loser = await state(p);
      assert.equal(loser.cinematic.kind, 'result'); assert.equal(loser.cinematic.side, 1 - winner);
      assert.equal(loser.cinematic.outcome, 'lose'); assert.equal(loser.cinematic.character, s.players[1 - winner].character);
      await p.waitForFunction(() => { const v = document.querySelector('video'); return v && v.readyState >= 2 && v.currentTime > 0.15; }, null, { polling: 100 });
      await capture(p, `${name}-loser`);
      await p.waitForFunction(() => !JSON.parse(window.render_game_to_text()).cinematic, null, { polling: 100, timeout: 15000 });
    } else await skip(p);
  } else {
    assert.equal(s.cinematic, null);
    await p.waitForFunction(() => JSON.parse(window.render_game_to_text()).audio.voice?.kind === 'victory', null, { polling: 100 });
    await p.waitForFunction(() => JSON.parse(window.render_game_to_text()).audio.voice?.kind === 'defeat', null, { polling: 100 });
  }
  const starts = await p.evaluate(() => window.audioProbe().starts.slice(window.matchPointAudioStart));
  assert.ok(starts.every(clip => !pointSources.includes(clip.src)), 'the terminal event never queues a point win/loss voice');
  if (natural || s.cinemaMode === 'off') {
    for (const kind of ['victory', 'defeat']) {
      assert.ok(starts.some(clip => voiceSources(kind).includes(clip.src) && clip.rms > 0.03), `decoded ${kind} voice`);
    }
  }
  report.audio.push({ name, starts });
  const finished = await state(p), event = finished.event;
  assert.equal(finished.audio.scene, winner === 0 || finished.mode === 'local' ? 'victory' : 'defeat');
  await advance(p, 5000); await skip(p);
  assert.deepEqual((await state(p)).score, s.score); assert.deepEqual((await state(p)).event, event);
  await capture(p, `${name}-result`);
  await p.getByRole('button', { name: /再来一场/ }).click(); await skip(p);
  const fresh = await state(p);
  assert.equal(fresh.phase, 'serve'); assert.deepEqual(fresh.score, [0, 0]); assert.equal(fresh.winner, null);
  assert.deepEqual(fresh.matchPoints, [false, false]); assert.equal(fresh.cinematic, null);
  report.checks.push(`${name}: direct match winner/loser presentation, stable terminal score/event and clean rematch`);
}

async function nextPoint(p, mode) {
  return p.evaluate(mode => {
    window.matchPointAudioStart = window.audioProbe().starts.length;
    const held = new Set();
    const key = (code, down) => {
      if (held.has(code) === down) return;
      window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true }));
      if (down) held.add(code); else held.delete(code);
    };
    const read = () => JSON.parse(window.render_game_to_text());
    key(mode === 'local' ? 'ArrowRight' : 'KeyA', true);
    for (let frame = 0; frame < 6000; frame++) {
      const s = read();
      if (s.phase === 'point' || s.phase === 'result') {
        [...held].forEach(code => key(code, false));
        return s;
      }
      key('KeyJ', s.phase === 'serve' && s.server === 0);
      if (mode === 'local') key('Slash', s.phase === 'serve' && s.server === 1);
      window.advanceTime(25);
    }
    throw new Error('Public inputs did not reach a point');
  }, mode);
}

async function publicMatch(browser, mode, cinema) {
  const { c, p } = await setup(browser, { mode, cinema });
  const winner = mode === 'local' ? 0 : 1, points = [];
  for (let n = 0; n < 20; n++) {
    const s = await nextPoint(p, mode);
    points.push({ score: s.score, event: s.event, cinematic: s.cinematic?.kind || null });
    if (s.phase === 'result') {
      assert.equal(s.event.type, 'win');
      assert.equal(s.cinematic?.kind || null, cinema === 'off' ? null : 'result');
      assert.equal(s.winner, winner); break;
    }
    assert.equal(s.event.type, 'point');
    assert.equal(s.cinematic?.kind || null, cinema === 'all' ? 'point' : null);
    if (n === 0 && cinema === 'all') await capture(p, `${mode}-ordinary-point`);
    await skip(p);
    if (s.score[winner] === 6) {
      await hint(p, winner === 0 ? [true, false] : [false, true]);
      await capture(p, `${mode}-${cinema}-match-point`);
    }
  }
  const terminal = await state(p);
  assert.equal(terminal.phase, 'result');
  report.matches.push({ mode, cinema, points, score: terminal.score, winner: terminal.winner });
  await result(p, winner, `${mode}-${cinema}`, mode === 'local' && cinema === 'all');
  await c.close();
}

(async () => {
  assert.equal((await fetch(url)).status, 200, 'server responds before launching Chrome');
  const browser = await chromium.launch({ channel: 'chrome', headless: process.env.HEADED !== '1', args: ['--mute-audio', '--disable-speech-api'] });
  try {
    if (production) {
      await publicMatch(browser, 'local', 'all');
      await publicMatch(browser, 'solo', 'key');
      await publicMatch(browser, 'local', 'off');
    } else {
      const { c, p } = await setup(browser);
      await rig(p, [5, 2]); let s = await ground(p, 1);
      assert.equal(s.phase, 'point'); assert.equal(s.cinematic.kind, 'point');
      await capture(p, 'ordinary-point'); await skip(p); await hint(p, [true, false]);
      await capture(p, 'left-match-point');
      await p.keyboard.press('KeyP'); const paused = await state(p); await advance(p, 3000);
      assert.deepEqual((await state(p)).score, paused.score); assert.deepEqual((await state(p)).matchPoints, paused.matchPoints);
      await p.keyboard.press('KeyP'); await advance(p, 9);
      s = await ground(p, 1); assert.equal(s.cinematic.kind, 'result');
      await result(p, 0, 'local-all', true);
      await rig(p, [6, 5]); await ground(p, 0); await skip(p); await hint(p, [false, false]);
      await capture(p, 'saved-match-point-deuce');
      await rig(p, [10, 10]); await hint(p, [true, true]); await capture(p, 'dual-cap-match-point');
      s = await ground(p, 0); assert.equal(s.phase, 'result'); assert.equal(s.cinematic.kind, 'result');
      await skip(p); await c.close();
      const solo = await setup(browser, { mode: 'solo', cinema: 'key', target: 11 });
      await rig(solo.p, [9, 10]); await hint(solo.p, [false, true]);
      await ground(solo.p, 0); await result(solo.p, 1, 'solo-key');
      await solo.c.close();
      const off = await setup(browser, { cinema: 'off' });
      await rig(off.p, [6, 0]); await ground(off.p, 1); await result(off.p, 0, 'local-off');
      await off.c.close();
      const practice = await setup(browser, { mode: 'practice', cinema: 'off' });
      await rig(practice.p, [20, 0]); await hint(practice.p, [false, false]); s = await ground(practice.p, 1);
      assert.equal(s.phase, 'point'); assert.equal(s.event.type, 'point'); assert.equal(s.winner, null);
      await advance(practice.p, 2400); assert.equal((await state(practice.p)).phase, 'serve');
      await capture(practice.p, 'practice-no-match-point'); await practice.c.close();
      for (const [width, height] of [[320, 740], [390, 844], [844, 390]]) {
        const mobile = await setup(browser, { cinema: 'off', viewport: { width, height }, mobile: true });
        await rig(mobile.p, width === 390 ? [10, 10] : [5, 6]);
        await hint(mobile.p, width === 390 ? [true, true] : [false, true]);
        await capture(mobile.p, `mobile-${width}-match-point`);
        await mobile.c.close();
      }
      report.checks.push('ordinary reactions retained; saved match point clears at deuce; both cap match points; target 11; pause; practice; 320/390/844 hint layout');
    }
    assert.deepEqual(report.errors, []);
    console.log(JSON.stringify({ checks: report.checks, matches: report.matches.map(m => ({ mode: m.mode, cinema: m.cinema, score: m.score })), screenshots: report.screenshots.length, errors: report.errors }));
  } finally {
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    await browser.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
