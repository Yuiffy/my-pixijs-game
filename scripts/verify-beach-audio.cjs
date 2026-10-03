const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd(), path.join(os.homedir(), '.codex/skills/develop-web-game')] }));
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const manifest = JSON.parse(fs.readFileSync('public/games/beach-volley/audio.json', 'utf8'));
const url = process.env.BEACH_VOLLEY_URL || 'http://localhost:4014/game/beach-volley';
const output = path.resolve(process.env.BEACH_AUDIO_OUTPUT || 'tmp/beach-audio-dev');
fs.mkdirSync(output, { recursive: true });
const resumeTail = process.env.BEACH_AUDIO_RESUME === 'tail';
const report = resumeTail ? JSON.parse(fs.readFileSync(path.join(output, 'report.json'), 'utf8')) : { checks: [], voices: [], probes: [], screenshots: [], errors: [], expectedAudioFailures: [] };
if (resumeTail) {
  assert.equal(report.errors.length, 0, 'only resume completed suites without product errors');
  assert.ok(report.checks.slice(0, 3).every((s, i) => s.startsWith(['sui:', 'shiori:', 'nagisa:'][i])));
  report.checks = report.checks.slice(0, 3);
  report.probes = report.probes.filter(p => ['sui', 'shiori', 'nagisa'].includes(p.scenario));
  report.voices = report.voices.slice(0, 18);
  report.screenshots = report.screenshots.filter(p => p.name !== 'mobile-audio-settings');
}
const state = p => p.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = (p, ms) => p.evaluate(ms => window.advanceTime(ms), ms);
async function serve(p) { await p.keyboard.down('KeyJ'); await advance(p, 9); await p.keyboard.up('KeyJ'); }
const names = { sui: '岁己.*SUI', shiori: '栞栞.*SHIORI', nagisa: '米汀.*NAGISA' };

function instrumentAudio() {
  if (window.speechSynthesis) window.speechSynthesis.speak = () => {};
  const nativeFetch = window.fetch, nativeSlice = ArrayBuffer.prototype.slice;
  const bytesFrom = new WeakMap(), bufferFrom = new WeakMap();
  const contexts = [], analysers = [], masters = [], starts = [], oscillators = [];
  const NativeContext = window.AudioContext;
  window.fetch = async (...args) => {
    const response = await nativeFetch(...args), src = new URL(String(args[0]), location.href).pathname;
    if (src.includes('/games/beach-volley/audio-v1/')) {
      const read = response.arrayBuffer.bind(response);
      response.arrayBuffer = async () => { const bytes = await read(); bytesFrom.set(bytes, src); return bytes; };
    }
    return response;
  };
  ArrayBuffer.prototype.slice = function (...args) { const copied = nativeSlice.apply(this, args); if (bytesFrom.has(this)) bytesFrom.set(copied, bytesFrom.get(this)); return copied; };
  window.AudioContext = class extends NativeContext {
    constructor(options) {
      super(options); contexts.push(this);
      const decode = this.decodeAudioData.bind(this);
      this.decodeAudioData = async bytes => { const buffer = await decode(bytes); bufferFrom.set(buffer, bytesFrom.get(bytes)); return buffer; };
      const createGain = this.createGain.bind(this);
      this.createGain = () => {
        const node = createGain(), connect = node.connect.bind(node);
        node.connect = (...args) => {
          if (args[0] === this.destination) {
            const analyser = this.createAnalyser(); analyser.fftSize = 512;
            connect(analyser); analyser.connect(this.destination); analysers.push(analyser); masters.push(node.gain); return this.destination;
          }
          return connect(...args);
        };
        return node;
      };
      const create = this.createBufferSource.bind(this);
      this.createBufferSource = () => {
        const node = create(), start = node.start.bind(node), stop = node.stop.bind(node);
        let record;
        node.start = (...args) => {
          start(...args);
          const data = node.buffer.getChannelData(0); let square = 0, peak = 0, n = 0;
          for (let i = 0; i < data.length; i += 16) { square += data[i] * data[i]; peak = Math.max(peak, Math.abs(data[i])); n++; }
          record = { src: bufferFrom.get(node.buffer), duration: node.buffer.duration, rms: Math.sqrt(square / n), peak, loop: node.loop, playbackRate: node.playbackRate.value, at: this.currentTime, ended: false, stopped: false };
          starts.push(record);
        };
        node.stop = (...args) => { if (record) record.stopped = true; return stop(...args); };
        node.addEventListener('ended', () => { if (record) record.ended = true; });
        return node;
      };
      const createOscillator = this.createOscillator.bind(this);
      this.createOscillator = () => { const node = createOscillator(); const start = node.start.bind(node); node.start = (...args) => { oscillators.push({ at: this.currentTime }); return start(...args); }; return node; };
    }
  };
  window.audioProbe = () => ({
    starts, oscillators: oscillators.length, contexts: contexts.map(c => ({ state: c.state, time: c.currentTime, sampleRate: c.sampleRate })), masterGains: masters.map(g => g.value),
    rms: analysers.map(a => { const data = new Float32Array(a.fftSize); a.getFloatTimeDomainData(data); return Math.sqrt(data.reduce((sum, n) => sum + n * n, 0) / data.length); }),
  });
}
async function context(browser, options = {}, expectedFailure = '') {
  const c = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...options });
  await c.addInitScript(instrumentAudio);
  await c.route('**/api/record', r => r.fulfill({ json: { success: true } }));
  await c.route(/https:\/\/(pagead2\.googlesyndication\.com|hm\.baidu\.com)\//, r => r.fulfill({ body: '' }));
  c.on('page', p => {
    p.on('pageerror', e => report.errors.push(e.message));
    p.on('console', m => { if (m.type() === 'error') {
      if (expectedFailure && m.location().url.includes(expectedFailure)) report.expectedAudioFailures.push(m.text()); else report.errors.push(m.text());
    } });
  });
  return c;
}
async function load(p, actor = 'sui', opponent = 'nagisa', cinema = 'all', mode = 'local', waitAudio = true) {
  await p.goto(url, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.beachVolley && JSON.parse(window.render_game_to_text()).assetsReady);
  await p.bringToFront();
  await p.evaluate(() => window.beachVolley.manual(true));
  const before = await state(p); assert.equal(before.audio.unlocked, false);
  await p.getByRole('button', { name: mode === 'local' ? '同机双人' : '单人挑战', exact: true }).click();
  await p.getByRole('button', { name: new RegExp(names[actor]) }).click();
  await p.locator('#beach-opponent').selectOption(opponent);
  await p.locator('#beach-cinema').selectOption(cinema);
  if (waitAudio) await p.waitForFunction(() => { const a = JSON.parse(window.render_game_to_text()).audio; return a.loaded > 0 && !a.fetching && a.queued === 0; }, null, { timeout: 45000 });
  await p.waitForFunction(() => JSON.parse(window.render_game_to_text()).audio.context === 'running');
}
async function capture(p, name) {
  const metrics = inspectPng(await p.screenshot({ path: path.join(output, `${name}.png`), fullPage: true, animations: 'disabled' }));
  const canvas = await p.locator('canvas').evaluate(c => ({ width: c.width, height: c.height, displayWidth: c.clientWidth, displayHeight: c.clientHeight }));
  assert.equal(canvas.width, 1280); assert.equal(canvas.height, 720); assert.ok(canvas.displayWidth && canvas.displayHeight);
  report.screenshots.push({ name, metrics, canvas, state: await state(p), dom: await p.locator('main').innerText() });
}
async function voice(p, actor, kind) {
  await p.waitForFunction(({ actor, kind }) => { const v = JSON.parse(window.render_game_to_text()).audio.voice; return v?.character === actor && v.kind === kind; }, { actor, kind }, { timeout: 15000 });
  await p.waitForFunction(() => { const a = JSON.parse(window.render_game_to_text()).audio; return !a.music || a.musicGain < 0.2; });
  const s = await state(p), probe = await p.evaluate(() => window.audioProbe());
  const source = probe.starts.filter(r => r.src && !r.src.includes('music-')).at(-1); assert.equal(source.src, manifest.voices[actor][kind].src);
  assert.ok(source.rms > 0.03 && source.peak > 0.1 && source.peak <= 1); assert.equal(source.playbackRate, 1); assert.equal(source.loop, false);
  assert.equal(s.audio.voicePlaying, true); assert.ok(s.audio.musicGain < 0.2 || !s.audio.music);
  report.voices.push({ actor, kind, source, state: s.audio });
}
async function finishClip(p) {
  const movie = (await state(p)).cinematic; if (!movie) return;
  await p.waitForFunction(id => { const s = JSON.parse(window.render_game_to_text()); return s.cinematic?.id !== id || (!s.audio.voice && !s.audio.pendingVoices); }, movie.id, { timeout: 15000 });
  if ((await state(p)).cinematic?.id === movie.id) await p.locator('video').evaluate(v => v.dispatchEvent(new Event('ended')));
}
async function finishKind(p, kind) { for (let i = 0; i < 4 && (await state(p)).cinematic?.kind === kind; i++) await finishClip(p); }
async function reachActor(p, actor) {
  const movie = (await state(p)).cinematic;
  if (movie && movie.count > 1 && movie.character !== actor) await finishClip(p);
}
async function rig(p, winner, final = false) {
  await p.evaluate(({ winner, final }) => {
    const g = window.beachVolley.game(), idle = { left: false, right: false, jump: false, hit: false, dive: false, special: false, aimUp: false, aimDown: false };
    Object.assign(g, { phase: 'rally', phaseTime: 0, paused: false, freeze: 0, cutin: null, specialWindup: null, score: final ? winner ? [0, 6] : [6, 0] : [0, 0], winner: null, trail: [], effects: [] });
    g.players.forEach((p, i) => Object.assign(p, { x: i ? 985 : 295, y: 606, vx: 0, vy: 0, swing: 0, special: 0, dive: 0, cooldown: 0, shotAim: null, pose: 0, lastInput: { ...idle } }));
    g.ball = { x: winner ? 130 : 1150, y: 605, vx: 0, vy: 100, spin: 0, lastHit: winner, lock: 0, power: null };
  }, { winner, final });
  await advance(p, 9);
}
async function special(p, side = 0) {
  await p.evaluate(side => {
    const g = window.beachVolley.game();
    Object.assign(g, { phase: 'rally', phaseTime: 0, paused: false, freeze: 0, cutin: null, specialWindup: null, trail: [], effects: [] });
    const idle = { left: false, right: false, jump: false, hit: false, dive: false, special: false, aimUp: false, aimDown: false };
    g.players.forEach((p, i) => Object.assign(p, { x: i ? 1110 : 170, y: 606, vx: 0, vy: 0, swing: 0, special: 0, dive: 0, cooldown: 0, lastInput: { ...idle } }));
    Object.assign(g.players[side], { x: side ? 830 : 450, y: 378, energy: 100 });
    g.ball = { x: g.players[side].x, y: 260, vx: 0, vy: 100, spin: 0, lastHit: 1 - side, lock: 0, power: null };
  }, side);
  await p.keyboard.down(side ? 'Comma' : 'KeyL'); await advance(p, 9); await p.keyboard.up(side ? 'Comma' : 'KeyL');
}
async function verifyPause(p) {
  await p.keyboard.press('KeyP'); await p.waitForFunction(() => JSON.parse(window.render_game_to_text()).audio.context === 'suspended');
  const a = await p.evaluate(() => window.audioProbe());
  await p.waitForTimeout(180);
  const b = await p.evaluate(() => window.audioProbe());
  assert.equal(b.contexts[0].time, a.contexts[0].time); assert.ok(b.masterGains.every(g => g === 0));
  await p.keyboard.press('KeyP'); await p.waitForFunction(() => JSON.parse(window.render_game_to_text()).audio.context === 'running');
  const after = await p.evaluate(() => window.audioProbe());
  assert.equal(after.starts.filter(r => !r.src.includes('music-')).length, a.starts.filter(r => !r.src.includes('music-')).length, 'resume preserves the current voice');
}

module.exports = { instrumentAudio };
if (require.main === module) (async () => {
  const response = await fetch(url); assert.equal(response.status, 200, `Target server must respond at ${url}`);
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--disable-speech-api'] });
  try {
    for (const [actor, opponent] of (resumeTail ? [] : [['sui', 'nagisa'], ['shiori', 'sui'], ['nagisa', 'shiori']])) {
      const c = await context(browser), p = await c.newPage(); await load(p, actor, opponent);
      await p.waitForTimeout(130);
      const menu = await p.evaluate(() => window.audioProbe()); assert.ok(menu.rms.some(r => r > 0.001));
      assert.ok(menu.starts.some(r => r.src === manifest.music.menu.src && r.loop && r.rms > 0.03));
      if (actor === 'sui') await capture(p, 'menu');
      await p.locator('#beach-start').click(); await voice(p, actor, 'intro');
      if (actor === 'sui') { await verifyPause(p); await capture(p, 'intro-voice'); }
      await finishKind(p, 'intro'); assert.equal((await state(p)).phase, 'serve');
      const count = (await p.evaluate(() => window.audioProbe())).oscillators;
      await serve(p); assert.ok((await p.evaluate(() => window.audioProbe())).oscillators > count);
      await special(p); await voice(p, actor, 'special'); await capture(p, `special-${actor}`);
      const id = (await state(p)).cinematic.id; await p.keyboard.press('Enter'); assert.equal((await state(p)).cinematic.id, id);
      if (actor === 'sui') await verifyPause(p);
      await finishKind(p, 'special'); assert.equal((await state(p)).specialWindup.remaining, 0.8);
      await advance(p, 800); assert.equal((await state(p)).specialWindup, null);
      for (const winner of [0, 1]) {
        await rig(p, winner); await reachActor(p, actor); await voice(p, actor, winner ? 'pointLose' : 'pointWin'); await finishKind(p, 'point');
      }
      for (const winner of [0, 1]) {
        await rig(p, winner, true); await finishKind(p, 'point');
        assert.equal((await state(p)).phase, 'result');
        await reachActor(p, actor); await voice(p, actor, winner ? 'defeat' : 'victory');
        // Local play celebrates the champion regardless of side.
        assert.equal((await state(p)).audio.scene, 'victory');
        await finishKind(p, 'result');
        if (actor === 'sui') await capture(p, winner ? 'loss-result' : 'win-result');
        await p.getByRole('button', { name: '再来一场' }).click(); await p.keyboard.press('Enter');
        assert.equal((await state(p)).audio.voice, null);
        const prior = (await p.evaluate(() => window.audioProbe())).oscillators;
        await serve(p); assert.ok((await p.evaluate(() => window.audioProbe())).oscillators > prior, 'rematch event id 1 plays again');
      }
      report.probes.push({ scenario: actor, probe: await p.evaluate(() => window.audioProbe()) });
      report.checks.push(`${actor}: six exact voice assets decoded and played, music and rematch`);
      await c.close();
    }
    {
      const c = await context(browser), p = await c.newPage(); await load(p, 'sui', 'shiori', 'off', 'solo');
      await p.locator('#beach-start').click(); await p.keyboard.press('Enter');
      await rig(p, 1, true); await advance(p, 2400); await voice(p, 'shiori', 'victory');
      await p.waitForFunction(() => JSON.parse(window.render_game_to_text()).audio.scene === 'defeat');
      await voice(p, 'sui', 'defeat');
      const probe = await p.evaluate(() => window.audioProbe()); assert.ok(probe.starts.some(r => r.src === manifest.music.defeat.src && !r.loop && r.rms > 0.03));
      await p.getByRole('button', { name: '玩法说明', exact: true }).click(); assert.equal((await state(p)).audio.paused, true);
      await p.getByLabel('背景音乐', { exact: true }).uncheck(); await p.getByLabel('角色语音', { exact: true }).uncheck();
      await p.getByRole('button', { name: '关闭玩法说明' }).click();
      assert.equal((await state(p)).audio.paused, false, 'result audio resumes after closing help');
      await p.getByRole('button', { name: '返回沙滩', exact: true }).click();
      await p.getByRole('button', { name: '关闭声音', exact: true }).click(); assert.equal((await state(p)).audio.enabled, false);
      await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForFunction(() => window.render_game_to_text && JSON.parse(window.render_game_to_text()).assetsReady);
      assert.equal((await state(p)).audio.unlocked, false); assert.equal((await state(p)).audio.music, false); assert.equal((await state(p)).audio.voices, false);
      await p.getByRole('button', { name: '开启声音', exact: true }).click(); await p.waitForFunction(() => JSON.parse(window.render_game_to_text()).audio.context === 'running');
      assert.equal((await state(p)).audio.musicPlaying, false);
      await p.getByRole('button', { name: '玩法说明', exact: true }).click(); await p.getByLabel('背景音乐', { exact: true }).check(); await p.getByLabel('角色语音', { exact: true }).check();
      await p.getByRole('button', { name: '关闭玩法说明' }).click(); await p.waitForFunction(() => JSON.parse(window.render_game_to_text()).audio.musicPlaying);
      report.probes.push({ scenario: 'solo-defeat-settings', probe: await p.evaluate(() => window.audioProbe()) });
      report.checks.push('static solo defeat music/voices, independent settings persist and muted reload unlocks on one click'); await c.close();
    }
    {
      const c = await context(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' }), p = await c.newPage();
      await load(p, 'nagisa', 'sui'); await p.locator('#beach-start').tap(); await p.keyboard.press('Enter');
      await special(p); await voice(p, 'nagisa', 'special'); assert.equal((await state(p)).cinematic, null);
      const staticVoice = (await state(p)).audio.voice;
      await p.keyboard.press('Enter'); assert.deepEqual((await state(p)).audio.voice, staticVoice, 'static special voice cannot be skipped');
      await advance(p, 760); assert.equal((await state(p)).specialWindup.remaining, 0.8);
      await p.getByRole('button', { name: '玩法说明', exact: true }).tap(); await capture(p, 'mobile-audio-settings');
      assert.equal((await state(p)).audio.context, 'suspended');
      await p.getByRole('button', { name: '关闭玩法说明' }).tap();
      await p.getByRole('button', { name: '继续比赛', exact: true }).tap();
      await p.evaluate(() => window.dispatchEvent(new Event('blur'))); assert.equal((await state(p)).audio.paused, true);
      // Headless Chrome keeps background tabs visible; simulate the platform lifecycle in this test only.
      await p.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
      await p.waitForFunction(() => JSON.parse(window.render_game_to_text()).audio.context === 'suspended');
      assert.equal((await state(p)).audio.paused, true);
      await p.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
      await p.getByRole('button', { name: '继续比赛', exact: true }).tap(); await advance(p, 800);
      assert.equal((await state(p)).specialWindup, null);
      report.checks.push('touch/reduced-motion unskippable special voice, unchanged windup, help/blur/simulated page-hide pause sound'); await c.close();
    }
    {
      const c = await context(browser), p = await c.newPage(); let held;
      await c.route('**/audio-v1/sui-intro.mp3', r => { held = r; });
      await load(p, 'sui', 'nagisa', 'all', 'local', false);
      await p.locator('#beach-start').click(); await p.keyboard.press('Enter');
      assert.equal((await state(p)).phase, 'serve');
      await serve(p); await advance(p, 600); assert.equal((await state(p)).phase, 'rally');
      await p.waitForFunction(() => JSON.parse(window.render_game_to_text()).audio.fetching?.endsWith('sui-intro.mp3'));
      assert.ok(held); await held.fulfill({ body: fs.readFileSync(`public${manifest.voices.sui.intro.src}`), contentType: 'audio/mpeg' });
      await p.waitForTimeout(250); assert.equal((await state(p)).audio.voice, null);
      assert.ok(!(await p.evaluate(() => window.audioProbe())).starts.some(r => r.src === manifest.voices.sui.intro.src));
      report.checks.push('slow voice never blocks play or starts after the intro was skipped'); await c.close();
    }
    {
      const c = await context(browser, {}, 'sui-special.mp3'), p = await c.newPage();
      await c.route('**/audio-v1/sui-special.mp3', r => r.fulfill({ status: 404, body: 'missing' }));
      await load(p, 'sui', 'nagisa', 'off'); await p.locator('#beach-start').click(); await p.keyboard.press('Enter');
      await special(p); await p.waitForTimeout(100);
      assert.ok((await state(p)).audio.failures.some(src => src.endsWith('sui-special.mp3')));
      assert.equal((await state(p)).audio.voice, null); await advance(p, 2400); assert.equal((await state(p)).specialWindup, null);
      report.checks.push('missing voice is silent and gameplay still releases the same special'); await c.close();
    }
    assert.equal(report.voices.length, 21);
    assert.equal(report.errors.length, 0, JSON.stringify(report.errors));
    fs.writeFileSync(path.join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify({ checks: report.checks, voices: report.voices.length, screenshots: report.screenshots.length, errors: report.errors }));
  } finally { fs.writeFileSync(path.join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`); await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
