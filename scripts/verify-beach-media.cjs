const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd(), path.join(os.homedir(), '.codex/skills/develop-web-game')] }));
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const url = process.env.BEACH_VOLLEY_URL || 'http://localhost:4010/game/beach-volley';
const output = path.resolve(process.env.BEACH_MEDIA_OUTPUT || 'tmp/beach-media-dev');
fs.mkdirSync(output, { recursive: true });
const report = { checks: [], screenshots: [], requests: [], errors: [], timings: {} };
const state = (p) => p.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = (p, ms) => p.evaluate((ms) => window.advanceTime(ms), ms);
const videoPattern = /\/games\/beach-volley\/.*\.mp4(?:\?|$)/;
const manifest = JSON.parse(fs.readFileSync('public/games/beach-volley/media.json', 'utf8'));
const varied = manifest.version >= 5;
async function capture(p, name) {
  const metrics = inspectPng(await p.screenshot({ path: path.join(output, `${name}.png`), fullPage: true, animations: 'disabled' }));
  const canvas = await p.locator('canvas').evaluate((c) => ({ width: c.width, height: c.height, displayWidth: c.clientWidth, displayHeight: c.clientHeight }));
  assert.equal(canvas.width, 1280); assert.equal(canvas.height, 720); assert.ok(canvas.displayWidth && canvas.displayHeight);
  report.screenshots.push({ name, metrics, canvas, state: await state(p), dom: await p.locator('main').innerText() });
}
async function context(browser, name, options = {}) {
  const c = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...options });
  await c.addInitScript(() => {
    if (window.speechSynthesis) window.speechSynthesis.speak = () => {};
    window.mediaUrls = { created: [], revoked: [] };
    const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (blob) => { const url = create(blob); window.mediaUrls.created.push(url); return url; };
    URL.revokeObjectURL = (url) => { window.mediaUrls.revoked.push(url); revoke(url); };
    window.mediaFirstFrames = [];
    window.mediaCompleted = [];
    const play = HTMLMediaElement.prototype.play, measured = new WeakSet();
    HTMLMediaElement.prototype.play = function () {
      if (this instanceof HTMLVideoElement && !measured.has(this)) {
        measured.add(this); const start = performance.now();
        this.requestVideoFrameCallback(() => window.mediaFirstFrames.push({ src: this.getAttribute('src'), ms: Math.round(performance.now() - start) }));
        this.addEventListener('ended', () => window.mediaCompleted.push({ src: this.getAttribute('src'), ms: Math.round(performance.now() - start) }), { once: true });
      }
      return play.call(this);
    };
  });
  if (varied) await c.addInitScript(nativeFirst => { Math.random = () => nativeFirst ? 0.99 : 0; }, name === 'cold-1Mbps');
  await c.route('**/api/record', (r) => r.fulfill({ json: { success: true } }));
  await c.route(/https:\/\/(pagead2\.googlesyndication\.com|hm\.baidu\.com)\//, (r) => r.fulfill({ body: '' }));
  c.on('request', (r) => { if (videoPattern.test(r.url())) report.requests.push({ scenario: name, url: r.url(), type: r.resourceType(), time: Date.now() }); });
  c.on('page', (p) => {
    p.on('pageerror', (e) => report.errors.push(e.message));
    p.on('console', (m) => { if (m.type() === 'error') report.errors.push(m.text()); });
  });
  return c;
}
async function load(p) {
  await p.goto(url, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.beachVolley && JSON.parse(window.render_game_to_text()).assetsReady);
  await p.evaluate(() => window.beachVolley.manual(true));
  await p.getByRole('button', { name: '同机双人', exact: true }).click();
}
async function rigSpecial(p, movie = true) {
  await p.evaluate(() => {
    const g = window.beachVolley.game();
    Object.assign(g, { phase: 'rally', phaseTime: 0, paused: false, freeze: 0, cutin: null, specialWindup: null });
    g.players.forEach((player, side) => Object.assign(player, { x: side ? 830 : 450, y: 378, vx: 0, vy: 0, swing: 0, special: 0, dive: 0, cooldown: 0, shotAim: null, lastInput: { left: false, right: false, jump: false, hit: false, dive: false, special: false, aimUp: false, aimDown: false } }));
    g.players[0].energy = 100;
    g.ball = { x: 450, y: 260, vx: 0, vy: 100, spin: 0, lastHit: 1, lock: 0, power: null };
  });
  await p.keyboard.down('KeyL'); await advance(p, 16); await p.keyboard.up('KeyL');
  if (movie) await p.waitForFunction(() => JSON.parse(window.render_game_to_text()).cinematic?.kind === 'special');
}
async function playing(p) {
  await p.waitForFunction(() => { const v = document.querySelector('video'); return v?.readyState >= 2 && v.currentTime > 0.1; }, null, { timeout: 30000 });
  return p.locator('video').evaluate((v) => ({ src: v.getAttribute('src'), width: v.videoWidth, height: v.videoHeight, currentTime: v.currentTime, duration: v.duration }));
}
async function natural(p, rate = 4) {
  const id = (await state(p)).cinematic.id;
  await p.locator('video').evaluate((v, rate) => { v.playbackRate = rate; }, rate);
  await p.waitForFunction((id) => JSON.parse(window.render_game_to_text()).cinematic?.id !== id, id, { timeout: 15000 });
}
async function reaction(p, label) {
  const s = await state(p);
  assert.equal(s.specialWindup.remaining, 0.8); assert.equal(s.ball.vx, 0);
  await p.keyboard.down('ArrowRight'); await advance(p, 300); await p.keyboard.up('ArrowRight');
  assert.ok((await state(p)).players[1].x > s.players[1].x); assert.equal((await state(p)).ball.vx, 0);
  await capture(p, label);
  await advance(p, 500); assert.equal((await state(p)).specialWindup, null); assert.notEqual((await state(p)).ball.vx, 0);
}
async function throttle(c, p) {
  const session = await c.newCDPSession(p);
  await session.send('Network.enable'); await session.send('Network.setCacheDisabled', { cacheDisabled: true });
  await session.send('Network.emulateNetworkConditions', { offline: false, latency: 120, downloadThroughput: 125000, uploadThroughput: 125000, connectionType: 'cellular3g' });
}

(async () => {
  assert.equal((await fetch(url)).status, 200, 'server responds before launching Chrome');
  const browser = await chromium.launch({ channel: 'chrome', headless: process.env.HEADED !== '1', args: ['--mute-audio', '--disable-speech-api'] });
  try {
    const warm = await context(browser, 'warm'), p = await warm.newPage(); await load(p);
    await p.waitForFunction(varied => {
      const c = JSON.parse(window.render_game_to_text()).mediaCache;
      return c.liteReady === (varied ? 25 : 7) && c.standardReady > 0 && !c.pending;
    }, varied);
    assert.ok((await state(p)).mediaCache.bytes <= 32 * 1024 * 1024);
    assert.ok(report.requests.filter((r) => r.scenario === 'warm').every((r) => !r.url.includes('nagisa')));
    await capture(p, '01-warm-menu'); const downloads = report.requests.length;
    await p.locator('#beach-start').click(); const intro = await playing(p);
    assert.equal(intro.width, 1280); assert.ok(intro.src.startsWith('blob:'));
    await capture(p, '02-cached-standard-intro'); await natural(p);
    await rigSpecial(p); const special = await playing(p);
    assert.equal(special.width, 1280); const frozen = await state(p);
    await p.keyboard.press('Enter'); assert.equal((await state(p)).cinematic.id, frozen.cinematic.id);
    await capture(p, '03-cached-standard-special'); await natural(p); await reaction(p, '04-warm-defense');
    assert.equal(report.requests.length, downloads, 'warm intro and special cause no additional video network request');
    if (varied) {
      await rigSpecial(p); await playing(p);
      assert.ok((await state(p)).cinematic.dialogue);
      assert.equal((await state(p)).cinematic.cached, true);
      await capture(p, '04b-cached-native-variant'); await natural(p); await advance(p, 800);
    }
    await rigSpecial(p); await playing(p); assert.equal((await state(p)).cinematic.playbackSrc, frozen.cinematic.playbackSrc);
    await natural(p); await advance(p, 800);
    await p.getByRole('link', { name: '游戏大厅' }).click();
    await p.waitForFunction(() => window.mediaUrls.created.every((url) => window.mediaUrls.revoked.includes(url)));
    report.checks.push('menu preloads only the selected pair; cached 720p intro/special/replay use zero network; Enter cannot skip; full defense window; unmount revokes blobs');
    await warm.close();

    const cold = await context(browser, 'cold-1Mbps'), pc = await cold.newPage();
    let releaseCold; const coldGate = new Promise((resolve) => { releaseCold = resolve; });
    await cold.route(videoPattern, async (r) => {
      if (r.request().resourceType() !== 'media') await coldGate;
      try { await r.continue(); } catch { /* Canceled preloads may already be gone. */ }
    });
    await load(pc); await throttle(cold, pc);
    await pc.locator('#beach-start').click(); await pc.keyboard.press('Enter');
    await rigSpecial(pc); const low = await playing(pc);
    report.timings.liteFirstFrameMs = await pc.evaluate(() => window.mediaFirstFrames.at(-1).ms);
    assert.equal(low.width, 640); assert.equal((await state(pc)).cinematic.cached, false);
    assert.ok((await state(pc)).cinematic.playbackSrc.includes(varied ? '/lite-v5/' : '/lite-v4/'));
    if (varied) assert.ok((await state(pc)).cinematic.dialogue);
    const selected = (await state(pc)).cinematic;
    await capture(pc, '05-cold-light-special');
    await pc.keyboard.press('Enter'); assert.equal((await state(pc)).cinematic.id, selected.id);
    await pc.waitForTimeout(150);
    assert.equal((await state(pc)).cinematic.playbackSrc, selected.playbackSrc, 'chosen source stays fixed');
    await natural(pc, 1);
    report.timings.liteWallPlaybackMs = await pc.evaluate(() => window.mediaCompleted.at(-1).ms);
    await reaction(pc, '06-cold-defense');
    releaseCold();
    report.checks.push('cold special streams 360p under 1 Mbps / 120ms latency; competing preloads yield; mandatory playback and defense remain intact');
    await cold.close();

    const baseline = await context(browser, 'original-1Mbps'), pb = await baseline.newPage();
    await baseline.addInitScript(() => { try { localStorage.setItem('beach-volley-cinema', 'off'); } catch { /* Opaque third-party frames have no storage. */ } });
    await load(pb); await throttle(baseline, pb);
    const originalTiming = await pb.evaluate(async varied => {
      const video = document.createElement('video'); video.muted = true; video.playsInline = true;
      const start = performance.now();
      video.src = varied ? '/games/beach-volley/variety-v5/video-sui-special-2.mp4' : '/games/beach-volley/special-sui-v2.mp4'; document.body.append(video);
      const elapsed = new Promise((resolve) => video.requestVideoFrameCallback(() => resolve(performance.now() - start)));
      const ended = new Promise((resolve) => video.addEventListener('ended', () => resolve(performance.now() - start), { once: true }));
      await video.play(); const first = await elapsed; const full = await ended; video.remove();
      return { first: Math.round(first), full: Math.round(full) };
    }, varied);
    report.timings.originalFirstFrameMs = originalTiming.first;
    report.timings.originalWallPlaybackMs = originalTiming.full;
    if (varied) {
      const native = manifest.characters.sui.special.find(clip => clip.dialogue);
      assert.ok(native.lite.bytes < fs.statSync(`public${native.src}`).size * 0.35);
      report.checks.push('native light movie retains dialogue at under 35% of standard bytes; timings are measured without a first-frame speed guarantee');
    } else assert.ok(report.timings.liteWallPlaybackMs < report.timings.originalWallPlaybackMs * 0.6, 'light clip completes with less buffering under identical throttling');
    await baseline.close();

    const data = await context(browser, 'save-data'), pd = await data.newPage();
    await data.addInitScript(() => {
      Object.defineProperty(navigator, 'connection', { configurable: true, value: Object.assign(new EventTarget(), { saveData: true, effectiveType: '4g', downlink: 10 }) });
      try { localStorage.setItem('beach-volley-cinema', 'key'); } catch { /* Opaque frame. */ }
    });
    await load(pd); await pd.getByRole('button', { name: /米汀.*NAGISA/ }).click();
    await pd.locator('#beach-opponent').selectOption('shiori');
    await pd.waitForFunction(varied => JSON.parse(window.render_game_to_text()).mediaCache.liteReady === (varied ? 14 : 8), varied);
    assert.equal((await state(pd)).mediaCache.standardReady, 0);
    assert.ok(report.requests.filter((r) => r.scenario === 'save-data').every((r) => /\/lite-v[45]\//.test(r.url) && !/point(?:-|Win|Lose)/i.test(r.url)));
    await pd.locator('#beach-start').click(); await playing(pd); await capture(pd, '07-cached-light-nagisa');
    await natural(pd); const next = await playing(pd); assert.equal(next.width, 640); assert.equal((await state(pd)).cinematic.character, 'shiori');
    assert.equal((await state(pd)).cinematic.cached, true); await capture(pd, '08-cached-light-next-actor');
    await natural(pd); await data.close();
    report.checks.push('Save-Data downloads only 360p; key mode excludes point clips; changing roster cancels obsolete clips; both solo queue segments play from cache');

    for (const mode of ['off', 'reduced']) {
      const c = await context(browser, mode, mode === 'reduced' ? { reducedMotion: 'reduce' } : {});
      if (mode === 'off') await c.addInitScript(() => { try { localStorage.setItem('beach-volley-cinema', 'off'); } catch { /* Opaque frame. */ } });
      const pm = await c.newPage(); await load(pm); await pm.waitForTimeout(400);
      assert.equal(report.requests.filter((r) => r.scenario === mode).length, 0);
      await pm.locator('#beach-start').click(); await advance(pm, 2300); await rigSpecial(pm, false);
      await c.close();
    }
    report.checks.push('off and reduced-motion modes request no video files');
    assert.deepEqual(report.errors, []);
  } finally {
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    await browser.close();
  }
  console.log(JSON.stringify({ checks: report.checks, screenshots: report.screenshots.length, timings: report.timings, errors: report.errors }));
})().catch((e) => { console.error(e); process.exitCode = 1; });
