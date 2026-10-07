const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd(), path.join(os.homedir(), '.codex/skills/develop-web-game')] }));
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const { instrumentAudio } = require('./verify-beach-audio.cjs');
const audio = JSON.parse(fs.readFileSync('public/games/beach-volley/audio.json', 'utf8'));
const delivery = JSON.parse(fs.readFileSync('docs/beach-volley-nagisa-recording-delivery.json', 'utf8'));
const media = JSON.parse(fs.readFileSync('public/games/beach-volley/media.json', 'utf8'));
const dubbing = JSON.parse(fs.readFileSync('docs/beach-volley-nagisa-dubbing-delivery.json', 'utf8'));
const retired = new Set([...delivery.retiredRvc, ...Object.values(delivery.rejectedItems), ...dubbing.retiredGeneratedVideos].map(c => c.src));
const url = process.env.BEACH_VOLLEY_URL || 'http://127.0.0.1:4028/game/beach-volley';
const output = path.resolve(process.env.BEACH_NAGISA_OUTPUT || 'tmp/beach-nagisa-bgm/production');
const report = { checks: [], starts: [], movies: [], requests: [], screenshots: [], errors: [] };
const state = p => p.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = (p, ms) => p.evaluate(ms => window.advanceTime(ms), ms);
const waitVoices = p => p.waitForFunction(() => { const a = JSON.parse(window.render_game_to_text()).audio; return !a.voice && !a.pendingVoices; }, null, { polling: 100, timeout: 20000 });

async function capture(p, name) {
  const metrics = inspectPng(await p.screenshot({ path: path.join(output, `${name}.png`), fullPage: true, animations: 'disabled' }));
  const canvas = await p.locator('canvas').evaluate(c => ({ width: c.width, height: c.height, display: [c.clientWidth, c.clientHeight] }));
  assert.equal(canvas.width, 1280); assert.equal(canvas.height, 720);
  assert.ok(canvas.display.every(v => v > 0));
  report.screenshots.push({ name, metrics, canvas, state: await state(p), dom: await p.locator('main').innerText() });
}
async function skip(p) {
  await p.evaluate(() => document.activeElement?.blur());
  await p.keyboard.press('Enter'); await advance(p, 9);
}
async function setup(browser, mode = 'local', cinema = 'off', target = '5', quality = 'standard', random = 0) {
  const c = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await c.addInitScript(instrumentAudio);
  await c.addInitScript(({ quality, random }) => {
    window.requestAnimationFrame = () => 1; window.cancelAnimationFrame = () => {};
    Math.random = () => random;
    Object.defineProperty(navigator, 'connection', { configurable: true, value: { saveData: quality === 'lite', effectiveType: quality === 'lite' ? '2g' : '4g', addEventListener() {}, removeEventListener() {} } });
    if (window.speechSynthesis) window.speechSynthesis.speak = () => {};
  }, { quality, random });
  await c.route('**/api/record', r => r.fulfill({ json: { success: true } }));
  await c.route(/https:\/\/(pagead2\.googlesyndication\.com|hm\.baidu\.com)\//, r => r.fulfill({ body: '' }));
  const p = await c.newPage();
  p.on('pageerror', e => report.errors.push(e.message));
  p.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
  p.on('request', r => report.requests.push(new URL(r.url()).pathname));
  await p.goto(url, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.render_game_to_text && JSON.parse(window.render_game_to_text()).assetsReady, null, { polling: 100 });
  assert.equal(await p.evaluate(() => typeof window.beachVolley), 'undefined', 'production uses public controls');
  await p.getByRole('button', { name: mode === 'solo' ? '单人挑战' : '同机双人', exact: true }).click();
  await p.getByRole('button', { name: /米汀.*NAGISA/ }).click();
  await p.locator('#beach-opponent').selectOption(mode === 'solo' ? 'sui' : 'nagisa');
  await p.locator('#beach-target').selectOption(target);
  await p.locator('#beach-cinema').selectOption(cinema);
  if (mode === 'solo') await p.locator('#beach-difficulty').selectOption('hard');
  await p.waitForFunction(mode => JSON.parse(window.render_game_to_text()).audio.loaded >= (mode === 'solo' ? 32 : 18), mode, { polling: 100 });
  if (cinema !== 'off') await p.waitForFunction(quality => {
    const cache = JSON.parse(window.render_game_to_text()).mediaCache;
    return cache.liteReady === 11 && (quality === 'lite' || cache.standardReady === 11);
  }, quality, { polling: 100, timeout: 60000 });
  await p.locator('#beach-start').click();
  if (cinema === 'off') {
    await p.waitForFunction(() => window.audioProbe().starts.some(c => c.src?.includes('nagisa-intro-')), null, { polling: 100 });
    await waitVoices(p);
  }
  await skip(p);
  const box = await p.locator('canvas').boundingBox();
  await p.locator('canvas').click({ position: { x: box.width / 2, y: box.height * .7 } });
  return { c, p };
}
async function nextPoint(p, solo = false) {
  return p.evaluate(solo => {
    const held = new Set();
    const key = (code, down) => {
      if (held.has(code) === down) return;
      window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true }));
      if (down) held.add(code); else held.delete(code);
    };
    key(solo ? 'KeyA' : 'ArrowRight', true);
    for (let frame = 0; frame < 8000; frame++) {
      const s = JSON.parse(window.render_game_to_text());
      if (s.phase === 'point' || s.phase === 'result') {
        [...held].forEach(code => key(code, false)); return s;
      }
      key('KeyJ', s.phase === 'serve' && s.server === 0);
      if (!solo) key('Slash', s.phase === 'serve' && s.server === 1);
      window.advanceTime(25);
    }
    throw new Error('Public inputs failed to reach a point');
  }, solo);
}
async function match(p, solo = false) {
  for (let point = 0; point < 24; point++) {
    const s = await nextPoint(p, solo);
    await waitVoices(p);
    if (s.phase === 'result') {
      assert.equal(s.winner, solo ? 1 : 0);
      assert.equal(s.event.type, 'win'); return s;
    }
    await skip(p);
  }
  throw new Error('Match failed to finish');
}
async function collect(p) {
  report.starts.push(...await p.evaluate(() => window.audioProbe().starts));
}
async function seekSpecial(p, threshold) {
  return p.evaluate(threshold => {
    const held = new Set();
    const read = () => JSON.parse(window.render_game_to_text());
    const key = (code, down) => {
      if (held.has(code) === down) return;
      window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true }));
      if (down) held.add(code); else held.delete(code);
    };
    for (let frame = 0; frame < 24000; frame++) {
      const s = read();
      if (s.specials.reduce((sum, count) => sum + count, 0) >= threshold || s.specialWindup || s.cinematic?.kind === 'special') {
        [...held].forEach(code => key(code, false)); return s;
      }
      if (s.cinematic || s.phase === 'point') {
        [...held].forEach(code => key(code, false)); key('Enter', true); key('Enter', false);
      }
      if (s.phase === 'result') throw new Error('Match ended before the requested special');
      for (const side of [0, 1]) {
        const player = s.players[side], b = { ...s.ball };
        const [left, right, serve, special] = side ? ['ArrowLeft', 'ArrowRight', 'Slash', 'Comma'] : ['KeyA', 'KeyD', 'KeyJ', 'KeyL'];
        if (s.phase === 'serve') {
          key(left, false); key(right, false); key(special, false); key(serve, s.server === side); continue;
        }
        key(serve, false);
        const incoming = side === 0 ? b.vx < 0 : b.vx > 0;
        let target = side ? 920 : 360;
        if (incoming || (b.lastHit !== side && (side === 0 ? b.x < 640 : b.x > 640))) {
          const gravity = b.power ? { sui: [1, 1], shiori: [.7, 1.52], nagisa: [.9, 1.18] }[b.power] : [1, 1];
          for (let i = 0; i < 360 && b.y < 480; i++) {
            const crossed = b.lastHit === 0 ? b.x > 685 : b.x < 595;
            b.vy += 1270 * gravity[crossed ? 1 : 0] / 120; b.x += b.vx / 120; b.y += b.vy / 120;
            if (b.x < 18 || b.x > 1262) { b.x = Math.max(18, Math.min(1262, b.x)); b.vx *= -.83; }
            if (b.y < 30) { b.y = 30; b.vy = Math.abs(b.vy) * .7; }
          }
          target = Math.max(side ? 697 : 55, Math.min(side ? 1225 : 583, b.x));
        }
        const difference = target - player.x;
        key(left, difference < -8); key(right, difference > 8);
        const close = Math.abs(s.ball.x - player.x) < 90 && s.ball.y > player.y - 220 && s.ball.y < player.y - 30 && s.ball.lastHit !== side;
        key(special, player.energy >= 100 && close);
      }
      window.advanceTime(25);
    }
    throw new Error('Public rally inputs failed to charge a special');
  }, threshold);
}
async function watchMovie(p, kind, quality, name) {
  await p.waitForFunction(() => { const v = document.querySelector('video'); return v?.readyState >= 2 && v.currentTime > .15 && !v.paused; }, null, { polling: 100 });
  const s = await state(p), movie = s.cinematic;
  assert.equal(movie.kind, kind); assert.equal(movie.quality, quality);
  const scene = kind === 'special' ? 'special' : kind === 'point' ? movie.outcome === 'win' ? 'pointWin' : 'pointLose' : movie.outcome === 'win' ? 'victory' : 'defeat';
  const record = dubbing.items[`nagisa-${scene}`];
  const start = (await p.evaluate(() => window.audioProbe().starts)).length;
  if (movie.dialogue) {
    assert.equal(movie.src, record.src); assert.equal(movie.dialogue, record.text);
    assert.equal(movie.cached, true); assert.match(movie.playbackSrc, /^blob:/);
    assert.equal(s.audio.voice, null); assert.equal(s.audio.pendingVoices, 0); assert.equal(s.audio.cinemaDialogue, true);
    await p.waitForFunction(() => document.querySelector('video')?.webkitAudioDecodedByteCount > 0, null, { polling: 100 });
    const decoded = await p.locator('video').evaluate(async v => {
      const bytes = await (await fetch(v.currentSrc)).arrayBuffer();
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      const sha256 = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
      return { muted: v.muted, bytes: v.webkitAudioDecodedByteCount, duration: v.duration, sha256 };
    });
    assert.equal(decoded.muted, false); assert.ok(decoded.bytes > 0); assert.ok(decoded.duration > record.voiceEnd);
    assert.equal(decoded.sha256, quality === 'lite' ? record.lite.sha256 : record.sha256, 'actual cached movie bytes match the selected recording delivery');
    report.movies.push({ movie, decoded });
    await capture(p, name);
  } else if (kind === 'special') {
    await p.waitForFunction(() => JSON.parse(window.render_game_to_text()).audio.voicePlaying, null, { polling: 100 });
    const voice = (await state(p)).audio.voice;
    assert.ok(audio.voices.nagisa.special.some(c => c.src === voice.src));
    await capture(p, name);
  }
  if (kind === 'special') {
    const frozen = JSON.stringify({ score: s.score, ball: s.ball, players: s.players });
    await p.keyboard.press('Enter'); assert.equal((await state(p)).cinematic.id, movie.id);
    await advance(p, 160);
    const during = await state(p);
    assert.equal(JSON.stringify({ score: during.score, ball: during.ball, players: during.players }), frozen);
  }
  await p.waitForFunction(id => JSON.parse(window.render_game_to_text()).cinematic?.id !== id, movie.id, { polling: 100, timeout: 20000 });
  if (movie.dialogue) {
    const starts = await p.evaluate(start => window.audioProbe().starts.slice(start), start);
    assert.ok(starts.every(c => !audio.voices.nagisa[scene].some(v => v.src === c.src)), `no duplicate ${scene} external voice`);
  }
  return movie;
}
async function movies(p, quality) {
  for (let round = 0; round < 2; round++) {
    const s = await seekSpecial(p, round + 1);
    assert.equal(s.cinematic.kind, 'special');
    assert.ok(media.characters.nagisa.special.some(c => c.src === s.cinematic.src));
    await watchMovie(p, 'special', quality, `special-${quality}-${round + 1}`);
    assert.equal((await state(p)).specialWindup.remaining, .8);
    await advance(p, 810);
  }
}
async function reactions(p, quality) {
  const first = await nextPoint(p);
  assert.deepEqual(first.score, [1, 0]);
  for (const outcome of ['win', 'lose']) {
    const movie = await watchMovie(p, 'point', quality, `point-${outcome}-${quality}`);
    assert.equal(movie.outcome, outcome); assert.ok(movie.dialogue);
  }
  await skip(p);
  for (let point = 1; point < 5; point++) {
    const s = await nextPoint(p);
    if (point === 4) {
      assert.equal(s.phase, 'result'); assert.deepEqual(s.score, [5, 0]); assert.equal(s.event.type, 'win');
      assert.equal(s.cinematic.kind, 'result');
    } else {
      for (let n = 0; n < 3 && (await state(p)).cinematic; n++) await skip(p);
      await waitVoices(p); await skip(p);
    }
  }
  for (const outcome of ['win', 'lose']) {
    const movie = await watchMovie(p, 'result', quality, `result-${outcome}-${quality}`);
    assert.equal(movie.outcome, outcome); assert.ok(movie.dialogue);
  }
  assert.equal((await state(p)).cinematic, null);
  assert.deepEqual((await state(p)).score, [5, 0]);
  await advance(p, 500); await capture(p, `finished-${quality}`);
}
async function main() {
  fs.mkdirSync(output, { recursive: true });
  assert.equal((await fetch(url)).status, 200);
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--disable-speech-api'] });
  try {
    const only = process.env.BEACH_NAGISA_SUITE;
    assert.ok(!only || ['external', 'standard', 'lite'].includes(only));
    if (!only || only === 'external') {
      const { c, p } = await setup(browser);
      for (let n = 0; n < 2; n++) {
        await match(p); await capture(p, `mirror-match-${n + 1}`);
        if (!n) { await p.getByRole('button', { name: /再来一场/ }).click(); await waitVoices(p); await skip(p); }
      }
      await collect(p); await c.close();
      report.checks.push('two five-point mirror matches play both intro, point-win, victory and defeat variants');
    }
    if (!only || only === 'external') {
      const { c, p } = await setup(browser, 'solo');
      await match(p, true); await capture(p, 'solo-point-loss');
      await collect(p); await c.close();
      report.checks.push('solo losses play both point-loss recordings');
    }
    if (!only || only === 'external') {
      const { c, p } = await setup(browser, 'local', 'off', '11');
      await seekSpecial(p, 1);
      await p.waitForFunction(src => window.audioProbe().starts.some(s => s.src === src), audio.voices.nagisa.special[0].src, { polling: 100 });
      await waitVoices(p); await advance(p, 1600);
      const second = await seekSpecial(p, 2);
      assert.equal(second.specials.reduce((sum, count) => sum + count, 0), 2);
      await p.waitForFunction(src => window.audioProbe().starts.some(s => s.src === src), audio.voices.nagisa.special[1].src, { polling: 100 });
      await waitVoices(p); await capture(p, 'external-special');
      await collect(p); await c.close();
      report.checks.push('public rally inputs charge both external special voices and both short contact efforts');
    }
    for (const quality of ['standard', 'lite']) if (!only || only === quality) {
      {
        const { c, p } = await setup(browser, 'local', 'all', '11', quality);
        await movies(p, quality); await collect(p); await c.close();
      }
      {
        const { c, p } = await setup(browser, 'local', 'all', '5', quality, .99);
        await reactions(p, quality); await collect(p); await c.close();
      }
      const sources = new Set(report.movies.filter(m => m.movie.quality === quality).map(m => m.movie.src));
      assert.ok(Object.values(dubbing.items).every(item => sources.has(item.src)), `all five ${quality} recording soundtracks play in actual events`);
      report.checks.push(`${quality}: all five recording tracks decode without external overlap; natural movie endings, terminal score and full special defender window preserved`);
    }
    if (!only || only === 'external') for (const clip of [...Object.values(audio.voices.nagisa).flat(), ...audio.effort.nagisa]) {
      const starts = report.starts.filter(s => s.src === clip.src);
      assert.ok(starts.length, `actual event playback missing: ${clip.src}`);
      for (const s of starts) {
        assert.ok(s.rms > .03 && s.peak > .15 && s.peak <= 1);
        assert.equal(s.playbackRate, 1); assert.equal(s.loop, false);
      }
    }
    assert.ok(report.requests.every(src => !retired.has(src)), 'no retired RVC, BGM-contaminated voice or generated soundtrack download');
    assert.ok(report.starts.every(s => !retired.has(s.src)), 'no rejected external playback');
    assert.equal(report.errors.length, 0, JSON.stringify(report.errors));
    const externalVoiceSources = new Set(report.starts.filter(s => /\/nagisa-/.test(s.src || '')).map(s => s.src)).size;
    console.log(JSON.stringify({ checks: report.checks, externalVoiceSources, embeddedVideos: report.movies.length, screenshots: report.screenshots.length, errors: report.errors }));
  } finally {
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    await browser.close();
  }
}
module.exports = { main };
if (require.main === module) main().catch(e => { console.error(e); process.exitCode = 1; });
