const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd(), path.join(os.homedir(), '.codex/skills/develop-web-game')] }));
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const { instrumentAudio } = require('./verify-beach-audio.cjs');
const audio = JSON.parse(fs.readFileSync('public/games/beach-volley/audio.json', 'utf8'));
const media = JSON.parse(fs.readFileSync('public/games/beach-volley/media.json', 'utf8'));
const records = JSON.parse(fs.readFileSync('docs/beach-volley-recording-delivery.json', 'utf8'));
const dubbing = JSON.parse(fs.readFileSync('docs/beach-volley-dubbing-delivery.json', 'utf8'));
const rejected = new Set(Object.values(records.rejectedItems).map(item => item.src));
for (const item of Object.values(dubbing.rejectedItems)) {
  rejected.add(item.src); rejected.add(item.lite.src);
}
const url = process.env.BEACH_VOLLEY_URL || 'http://127.0.0.1:4027/game/beach-volley';
const output = path.resolve(process.env.BEACH_VICTORY_OUTPUT || 'tmp/beach-victory-fix/production');
fs.mkdirSync(output, { recursive: true });
const report = { checks: [], audio: [], screenshots: [], errors: [] };
const state = p => p.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = (p, ms) => p.evaluate(ms => window.advanceTime(ms), ms);
const waitVoices = p => p.waitForFunction(() => { const a = JSON.parse(window.render_game_to_text()).audio; return !a.voice && !a.pendingVoices; }, null, { polling: 100, timeout: 20000 });

async function capture(p, name) {
  const metrics = inspectPng(await p.screenshot({ path: path.join(output, `${name}.png`), fullPage: true, animations: 'disabled' }));
  const canvas = await p.locator('canvas').evaluate(c => ({ width: c.width, height: c.height, displayWidth: c.clientWidth, displayHeight: c.clientHeight }));
  assert.equal(canvas.width, 1280); assert.equal(canvas.height, 720);
  assert.ok(canvas.displayWidth > 0 && canvas.displayHeight > 0);
  report.screenshots.push({ name, metrics, canvas, state: await state(p), dom: await p.locator('main').innerText() });
}
async function skip(p) {
  await p.evaluate(() => document.activeElement?.blur());
  await p.keyboard.press('Enter'); await advance(p, 9);
}
async function setup(browser, quality, cinema) {
  const c = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await c.addInitScript(instrumentAudio);
  await c.addInitScript(quality => {
    window.requestAnimationFrame = () => 1; window.cancelAnimationFrame = () => {};
    Math.random = () => .99;
    Object.defineProperty(navigator, 'connection', { configurable: true, value: { saveData: quality === 'lite', effectiveType: quality === 'lite' ? '2g' : '4g', addEventListener() {}, removeEventListener() {} } });
  }, quality);
  await c.route('**/api/record', r => r.fulfill({ json: { success: true } }));
  await c.route(/https:\/\/(pagead2\.googlesyndication\.com|hm\.baidu\.com)\//, r => r.fulfill({ body: '' }));
  const p = await c.newPage();
  p.on('pageerror', e => report.errors.push(e.message));
  p.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
  const requests = [];
  const completed = new Set();
  p.on('request', r => requests.push(new URL(r.url()).pathname));
  p.on('requestfinished', r => completed.add(new URL(r.url()).pathname));
  await p.goto(url, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.render_game_to_text && JSON.parse(window.render_game_to_text()).assetsReady, null, { polling: 100 });
  assert.equal(await p.evaluate(() => typeof window.beachVolley), 'undefined', 'public production controls only');
  await p.getByRole('button', { name: '同机双人', exact: true }).click();
  await p.getByRole('button', { name: /栞栞.*SHIORI/ }).click();
  await p.locator('#beach-opponent').selectOption('sui');
  await p.locator('#beach-target').selectOption('5');
  await p.locator('#beach-cinema').selectOption(cinema);
  await p.waitForFunction(() => JSON.parse(window.render_game_to_text()).audio.loaded >= 32, null, { polling: 100 });
  await p.locator('#beach-start').click(); await skip(p); await waitVoices(p);
  assert.equal((await state(p)).phase, 'serve');
  if (cinema !== 'off') {
    const winner = dubbing.items['shiori-victory'];
    const wanted = quality === 'lite' ? winner.lite.src : winner.src;
    const deadline = Date.now() + 20000;
    while (!completed.has(wanted) && Date.now() < deadline) await p.waitForTimeout(100);
    assert.ok(completed.has(wanted), `winner ${quality} resource downloaded`);
    await p.waitForTimeout(100);
  }
  const box = await p.locator('canvas').boundingBox();
  await p.locator('canvas').click({ position: { x: box.width / 2, y: box.height * .7 } });
  return { c, p, requests };
}
async function nextPoint(p) {
  return p.evaluate(() => {
    const held = new Set();
    const key = (code, down) => {
      if (held.has(code) === down) return;
      window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true }));
      if (down) held.add(code); else held.delete(code);
    };
    key('ArrowRight', true);
    for (let frame = 0; frame < 6000; frame++) {
      const s = JSON.parse(window.render_game_to_text());
      if (s.phase === 'point' || s.phase === 'result') {
        [...held].forEach(code => key(code, false)); return s;
      }
      key('KeyJ', s.phase === 'serve' && s.server === 0);
      key('Slash', s.phase === 'serve' && s.server === 1);
      window.advanceTime(25);
    }
    throw new Error('Public controls failed to reach a point');
  });
}
async function win(p) {
  for (let n = 0; n < 5; n++) {
    const s = await nextPoint(p);
    if (s.phase === 'result') {
      assert.deepEqual(s.score, [5, 0]); assert.equal(s.winner, 0);
      assert.equal(s.event.type, 'win'); return s;
    }
    assert.equal(s.event.type, 'point'); await waitVoices(p); await skip(p);
  }
  throw new Error('Match did not finish at five points');
}
function clean(requests) {
  assert.ok(requests.every(src => !rejected.has(src)), 'retired and rejected resources never enter the download/playback pool');
}
async function external(browser) {
  const { c, p, requests } = await setup(browser, 'standard', 'off');
  for (let match = 0; match < 2; match++) {
    await win(p); await waitVoices(p);
    await capture(p, `external-victory-${match + 1}`);
    if (!match) { await p.getByRole('button', { name: /再来一场/ }).click(); await skip(p); await waitVoices(p); }
  }
  const starts = await p.evaluate(() => window.audioProbe().starts);
  for (const expected of audio.voices.shiori.victory) {
    const clip = starts.find(c => c.src === expected.src);
    assert.ok(clip && clip.rms > .03 && clip.peak > .15 && clip.peak <= 1);
    assert.equal(clip.playbackRate, 1); report.audio.push(clip);
  }
  clean(requests); report.checks.push('two Shiori wins decode both new spoken external victory variants; no retired voice requests');
  await c.close();
}
async function embedded(browser, quality) {
  const { c, p, requests } = await setup(browser, quality, 'key');
  await p.evaluate(() => { window.victoryVoiceStart = window.audioProbe().starts.length; });
  const finished = await win(p);
  assert.equal(finished.cinematic.src, dubbing.items['shiori-victory'].src);
  assert.equal(finished.cinematic.kind, 'result'); assert.equal(finished.cinematic.outcome, 'win');
  await p.waitForFunction(() => { const v = document.querySelector('video'); return v?.readyState >= 2 && v.currentTime > .4 && v.webkitAudioDecodedByteCount > 0; }, null, { polling: 100 });
  const s = await state(p);
  assert.equal(s.cinematic.quality, quality); assert.equal(s.cinematic.dialogue, '我是天才！');
  assert.equal(s.audio.cinemaDialogue, true); assert.equal(s.audio.voice, null);
  const video = await p.locator('video').evaluate(v => ({ src: v.currentSrc, decodedAudioBytes: v.webkitAudioDecodedByteCount, muted: v.muted }));
  assert.equal(video.muted, false); assert.ok(video.decodedAudioBytes > 0);
  await capture(p, `embedded-victory-${quality}`);
  await p.waitForFunction(() => !JSON.parse(window.render_game_to_text()).cinematic, null, { polling: 100, timeout: 25000 });
  const starts = await p.evaluate(() => window.audioProbe().starts.slice(window.victoryVoiceStart));
  assert.ok(starts.every(clip => !audio.voices.shiori.victory.some(v => v.src === clip.src)), 'embedded dialogue has no duplicate external victory voice');
  assert.deepEqual((await state(p)).score, [5, 0]);
  await p.waitForTimeout(700);
  await capture(p, `embedded-result-${quality}`);
  clean(requests); report.audio.push({ quality, cinematic: s.cinematic, video });
  report.checks.push(`${quality} winner movie decodes spoken embedded track, finishes naturally, and queues no duplicate external victory voice`);
  await c.close();
}
(async () => {
  assert.equal((await fetch(url)).status, 200, 'responding server before Chrome');
  const browser = await chromium.launch({ channel: 'chrome', headless: process.env.HEADED !== '1', args: ['--mute-audio', '--disable-speech-api'] });
  try {
    const only = process.env.BEACH_VICTORY_SCENARIO;
    assert.ok(!only || ['external', 'standard', 'lite'].includes(only), 'valid focused scenario');
    if (!only || only === 'external') await external(browser);
    for (const quality of ['standard', 'lite']) if (!only || only === quality) await embedded(browser, quality);
    assert.deepEqual(report.errors, []);
    console.log(JSON.stringify({ checks: report.checks, screenshots: report.screenshots.length, errors: report.errors }));
  } finally {
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    await browser.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
