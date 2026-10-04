const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd(), path.join(os.homedir(), '.codex/skills/develop-web-game')] }));
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const url = process.env.TIDAL_DUEL_URL || 'http://127.0.0.1:4044/game/tidal-duel';
const output = path.resolve(process.env.TIDAL_DUEL_OUTPUT || 'tmp/tidal-cinema/browser');
const publicOnly = process.env.TIDAL_DUEL_PUBLIC_MATCH === '1';
const step = 1000 / 120;
const names = { sui: '岁己', shiori: '栞栞', mizuki: '弥月' };
const titles = { sui: '月下猫步', shiori: '白昼潮汐', mizuki: '满月回旋' };
const keys = [
  { forward: 'KeyD', back: 'KeyA', punch: 'KeyJ', heavy: 'KeyL', ability: 'KeyU' },
  { forward: 'ArrowLeft', back: 'ArrowRight', punch: 'Digit1', heavy: 'Digit3', ability: 'Digit4' },
];
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = (page, ms) => page.evaluate(ms => window.advanceTime(ms), ms);
const button = (page, name) => page.getByRole('button', { name, exact: true });
class CaptureFailure extends Error {}
async function press(page, codes, ms = step) {
  for (const code of codes) await page.keyboard.down(code);
  await advance(page, ms);
  for (const code of [...codes].reverse()) await page.keyboard.up(code);
  await advance(page, 0);
}
async function until(page, predicate, max = 480) {
  for (let i = 0; i < max; i++) {
    const s = await state(page);
    if (predicate(s)) return s;
    await advance(page, step * 2);
  }
  assert.fail('Expected cinematic gameplay transition did not occur');
}
async function menu(page) {
  if ((await state(page)).phase === 'menu') return;
  await button(page, '返回选人').last().click();
  if (await page.getByRole('dialog').isVisible()) await page.getByRole('dialog').getByRole('button', { name: '返回选人', exact: true }).click();
  assert.equal((await state(page)).phase, 'menu');
}
async function begin(page, actor, { mode = 'training', side = 0, skin = 'original', dummy = 'idle' } = {}) {
  await menu(page);
  const p1 = side ? 'sui' : actor, p2 = side ? actor : actor;
  await page.getByRole('button', { name: new RegExp(`${names[p1]}.*${p1.toUpperCase()}`) }).click();
  await page.locator('#duel-opponent').selectOption(p2);
  await page.locator('#duel-skin').selectOption(side ? 'original' : skin);
  await page.locator('#duel-opponent-skin').selectOption(side ? skin : 'original');
  await button(page, mode === 'local' ? '同机双人' : '自由练习').click();
  if (mode === 'training') await page.locator('#duel-dummy').selectOption(dummy);
  await page.locator('#tidal-start').click();
  await page.keyboard.press('Enter'); await advance(page, 20);
  assert.equal((await state(page)).phase, 'fight');
}
async function approach(page, side = 0) {
  await until(page, s => ['idle', 'walk', 'crouch'].includes(s.fighters[side].state));
  await page.keyboard.down(keys[side].forward);
  await until(page, s => Math.abs(s.fighters[0].x - s.fighters[1].x) <= 114);
  await page.keyboard.up(keys[side].forward); await advance(page, step);
}
async function superHit(page, side = 0, touch = false) {
  await approach(page, side);
  let cdp;
  if (touch) {
    cdp = await page.context().newCDPSession(page);
    const points = [];
    for (const [id, action] of [[1, 'heavy'], [2, 'ability']]) {
      const rect = await page.locator(`[data-control="${side}-${action}"]`).boundingBox();
      assert.ok(rect && rect.height >= 32);
      points.push({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, id });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points });
  } else {
    await page.keyboard.down(keys[side].heavy); await page.keyboard.down(keys[side].ability);
  }
  const hit = await until(page, s => !!s.cinema);
  if (touch) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] }); await cdp.detach(); }
  else { await page.keyboard.up(keys[side].ability); await page.keyboard.up(keys[side].heavy); }
  assert.equal(hit.cinema.side, side);
  assert.equal(hit.cinema.character, hit.fighters[side].character);
  assert.equal(hit.cinema.title, titles[hit.fighters[side].character]);
  assert.ok(hit.events.some(e => e.type === 'hit' && e.move === 'super' && e.side === side));
  assert.ok(hit.fighters[1 - side].hp < 300); assert.equal(hit.fighters[side].meter, 0);
  return hit;
}
async function playing(page) {
  await page.waitForFunction(() => {
    const v = document.querySelector('video');
    return v && v.readyState >= 3 && !v.paused && v.currentTime > 0.2;
  }, null, { polling: 40, timeout: 7000 });
  assert.equal((await state(page)).cinema.phase, 'playing');
}
async function ended(page, actor, reason = 'ended') {
  await page.waitForFunction(() => !JSON.parse(window.render_game_to_text()).cinema, null, { polling: 40, timeout: 8500 });
  assert.deepEqual((await state(page)).lastCinema, { character: actor, reason });
  assert.equal(await page.locator('video').count(), 0);
}
async function capture(page, report, name) {
  const file = path.join(output, `${name}.png`);
  let pixels;
  try { pixels = inspectPng(await page.screenshot({ path: file, fullPage: true, animations: 'disabled' })); }
  catch (e) { throw new CaptureFailure(e.message); }
  const s = await state(page);
  const dom = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth,
    canvas: [...document.querySelectorAll('canvas')].map(c => ({ width: c.width, height: c.height, rect: c.getBoundingClientRect().toJSON() })),
    video: [...document.querySelectorAll('video')].map(v => ({ readyState: v.readyState, currentTime: v.currentTime, duration: v.duration,
      paused: v.paused, muted: v.muted, width: v.videoWidth, height: v.videoHeight, rect: v.getBoundingClientRect().toJSON() })),
    skip: [...document.querySelectorAll('button')].filter(b => b.textContent.includes('跳过演出')).map(b => b.getBoundingClientRect().toJSON()) }));
  assert.ok(dom.width <= dom.viewport + 1); assert.equal(dom.canvas.length, 1);
  assert.deepEqual([dom.canvas[0].width, dom.canvas[0].height], [1280, 720]); assert.ok(dom.canvas[0].rect.width > 0);
  assert.equal(s.assetsReady, true);
  if (s.cinema) {
    assert.equal(dom.video.length, 1); assert.equal(dom.skip.length, 1);
    assert.ok(dom.video[0].rect.width > 0 && dom.video[0].rect.height > 0);
    assert.ok(dom.skip[0].x >= 0 && dom.skip[0].right <= dom.viewport + 1);
    if (dom.viewport <= 700) assert.ok(dom.skip[0].height >= 44);
  }
  report.screenshots.push({ name, file, pixels, state: s, dom });
}
async function resetTraining(page) { await button(page, '重置站位').click(); await advance(page, 0); }
async function lifecycle(page, report) {
  await press(page, ['KeyP']);
  let before = await page.locator('video').evaluate(v => v.currentTime);
  await page.waitForTimeout(350);
  assert.ok(Math.abs(await page.locator('video').evaluate(v => v.currentTime) - before) < 0.1);
  assert.equal((await state(page)).cinema.phase, 'paused');
  await button(page, '继续对决 →').click({ trial: true });
  await capture(page, report, '02-paused');
  await press(page, ['KeyP']); await playing(page);
  await button(page, '玩法').click();
  await page.waitForFunction(() => document.querySelector('video')?.paused, null, { polling: 40 });
  before = await page.locator('video').evaluate(v => v.currentTime); await page.waitForTimeout(300);
  assert.ok(Math.abs(await page.locator('video').evaluate(v => v.currentTime) - before) < 0.1);
  await button(page, '明白了，去过招 →').click(); await press(page, ['KeyP']); await playing(page);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.waitForFunction(() => document.querySelector('video')?.paused, null, { polling: 40 });
  assert.equal((await state(page)).paused, true);
  await press(page, ['KeyP']); await playing(page);
  report.checks.push('Native video pauses and resumes at the same frame for P, help and simulated window blur; watchdog does not expire during pause');
}
async function main(page, report) {
  for (const actor of ['sui', 'shiori', 'mizuki']) {
    await begin(page, actor);
    await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).cinemaCache.ready >= 1, null, { polling: 50 });
    await approach(page);
    await press(page, [keys[0].ability]);
    await until(page, s => s.fighters[0].contact === 'hit');
    assert.equal((await state(page)).cinema, null);
    await capture(page, report, `01-${actor}-skill-impact`);
    await advance(page, 1300); await resetTraining(page);
    const hit = await superHit(page); await playing(page);
    const clock = hit.timeRemaining, frozen = hit.fighters;
    await advance(page, 2000);
    assert.deepEqual((await state(page)).fighters, frozen); assert.equal((await state(page)).timeRemaining, clock);
    const video = await page.locator('video').evaluate(v => ({ width: v.videoWidth, height: v.videoHeight, duration: v.duration, muted: v.muted, src: v.currentSrc, inline: v.playsInline }));
    assert.deepEqual([video.width, video.height], [960, 540]); assert.ok(video.duration > 5 && video.duration < 5.3);
    assert.ok(video.muted && video.inline && video.src.startsWith('blob:'));
    await page.keyboard.down(keys[0].punch);
    await capture(page, report, `03-${actor}-movie`);
    if (actor === 'sui') await lifecycle(page, report);
    await ended(page, actor); await advance(page, 1200);
    assert.equal((await state(page)).fighters[1].hp, hit.fighters[1].hp, 'movie never applies damage twice');
    assert.equal((await state(page)).fighters[0].move, null, 'held input during movie cannot leak into fight');
    await page.keyboard.up(keys[0].punch);
    await press(page, [keys[0].punch]); await until(page, s => s.fighters[0].move === 'punch');
    report.checks.push(`${actor}: actual U VFX and confirmed L+U movie, 960×540 native decode, frozen rules/health/clock, natural end, one damage and fresh keyboard recovery`);
  }
  await begin(page, 'mizuki'); await playingAfterHit(page);
  await button(page, '跳过演出 ↗').click(); await ended(page, 'mizuki', 'skip');
  await advance(page, 1000); await resetTraining(page);
  const count = report.requests.length;
  await playingAfterHit(page); await button(page, '跳过演出 ↗').click(); await ended(page, 'mizuki', 'skip');
  assert.equal(report.requests.length, count, 'warm replay makes zero new MP4 requests');
  report.checks.push('Warm replay uses the same prefetched blob and makes zero MP4 requests; skip releases the match');
  for (const viewport of [{ width: 320, height: 740 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport); await begin(page, 'mizuki');
    await superHit(page, 0, true); await playing(page);
    await capture(page, report, `04-touch-${viewport.width}`);
    await button(page, '跳过演出 ↗').click(); await ended(page, 'mizuki', 'skip');
  }
  report.checks.push('320/390/844: real CDP two-finger heavy+ability triggers the correct movie, visible skip target, no overflow, native touch cancel');
  await page.setViewportSize({ width: 1440, height: 900 });
}
async function playingAfterHit(page, side = 0) { await superHit(page, side); await playing(page); }
async function exclusions(page, report) {
  for (const dummy of ['guard', 'idle']) {
    await begin(page, 'mizuki', { dummy });
    if (dummy === 'guard') await approach(page);
    await press(page, [keys[0].heavy, keys[0].ability]); await advance(page, 1800);
    const s = await state(page); assert.equal(s.cinema, null); assert.equal(s.lastCinema, null);
    assert.equal(s.fighters[1].hp, dummy === 'guard' ? 292 : 300);
  }
  await begin(page, 'sui', { skin: 'resort' }); await approach(page);
  await press(page, [keys[0].heavy, keys[0].ability]); await advance(page, 1800);
  assert.ok((await state(page)).fighters[1].hp < 300); assert.equal((await state(page)).cinema, null);
  await button(page, '玩法').click(); await button(page, '关闭超杀演出').click();
  await button(page, '明白了，去过招 →').click(); await press(page, ['KeyP']);
  await begin(page, 'mizuki'); await approach(page);
  await press(page, [keys[0].heavy, keys[0].ability]); await advance(page, 1600);
  assert.equal((await state(page)).cinema, null); assert.equal((await state(page)).cinemaCache.bytes, 0);
  await button(page, '玩法').click(); await button(page, '开启超杀演出').click();
  await button(page, '明白了，去过招 →').click(); await press(page, ['KeyP']);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // Chrome emulation can update matches without dispatching a change event
  // while the test clock is frozen. Mount under the actual media preference.
  await open(page);
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).cinemaCache.bytes === 0, null, { polling: 50 });
  await begin(page, 'mizuki'); await approach(page);
  await press(page, [keys[0].heavy, keys[0].ability]); await advance(page, 1600);
  assert.equal((await state(page)).cinema, null); assert.equal((await state(page)).cinemaCache.bytes, 0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await open(page);
  report.checks.push('Blocked/whiff supers, ordinary U, resort skins, off preference and reduced motion leave battle uninterrupted; opt-out releases cached media');
}
async function ko(page, report) {
  await begin(page, 'mizuki', { mode: 'local', side: 1 });
  if (publicOnly) {
    for (let n = 0; n < 12 && (await state(page)).fighters[1].meter < 100; n++) {
      await approach(page, 1); await press(page, [keys[1].punch]); await advance(page, 900);
      assert.ok((await state(page)).fighters[0].hp > 0, 'charge leaves target alive for cinematic KO');
    }
    assert.equal((await state(page)).fighters[1].meter, 100);
    while ((await state(page)).fighters[0].hp > 60) {
      await approach(page, 1); await press(page, [keys[1].punch]); await advance(page, 900);
      assert.ok((await state(page)).fighters[0].hp > 0);
    }
  } else {
    await page.evaluate(() => { const g = window.tidalDuel.game(); g.fighters[1].meter = 100; g.fighters[0].hp = 1; });
  }
  const hit = await superHit(page, 1); await playing(page);
  assert.equal(hit.phase, 'roundEnd'); assert.equal(hit.fighters[0].hp, 0);
  await press(page, ['Enter']); await advance(page, 5000);
  assert.equal((await state(page)).round, 1); assert.equal(await button(page, '继续 ↗ Enter').count(), 0);
  await capture(page, report, '05-2P-cinematic-ko');
  await ended(page, 'mizuki'); await advance(page, 2600); await press(page, ['Enter']); await advance(page, 20);
  assert.equal((await state(page)).round, 2); assert.equal((await state(page)).phase, 'fight');
  assert.equal((await state(page)).fighters[0].hp, 300);
  if (!publicOnly) {
    await page.evaluate(() => { const g = window.tidalDuel.game(); g.fighters[1].meter = 100; g.fighters[0].hp = 1; });
    await playingAfterHit(page, 1); await button(page, '跳过演出 ↗').click(); await ended(page, 'mizuki', 'skip');
    await advance(page, 3000); assert.equal((await state(page)).phase, 'result');
    await button(page, '再战一场 ↗').click(); await page.keyboard.press('Enter'); await advance(page, 20);
    assert.equal((await state(page)).phase, 'fight'); assert.equal((await state(page)).lastCinema, null);
  }
  report.checks.push(`${publicOnly ? 'Public keyboard charged meter' : 'Development KO fixture'}: 2P correct movie and lethal hit, Enter/round skip blocked until movie ends, next round clean${publicOnly ? '' : ', result and rematch clean'}`);
}
async function failures(browser, report) {
  for (const scenario of ['missing', 'corrupt', 'stall', 'autoplay', 'saveData']) {
    const context = await environment(browser, scenario); const page = await context.newPage();
    errors(page, report, scenario); await open(page);
    await begin(page, 'mizuki');
    if (scenario === 'saveData') {
      assert.equal((await state(page)).cinemaCache.bytes, 0);
      assert.equal((await state(page)).cinemaCache.pending, 0);
    }
    const hit = await superHit(page);
    if (['missing', 'corrupt', 'stall'].includes(scenario)) {
      const start = Date.now(); await ended(page, 'mizuki', 'unavailable');
      assert.ok(Date.now() - start < 3600); await advance(page, 1200);
      assert.equal((await state(page)).fighters[1].hp, hit.fighters[1].hp);
      if (scenario === 'stall') await capture(page, report, '06-stall-fallback');
    } else {
      await playing(page);
      assert.equal(await page.locator('video').evaluate(v => v.muted), true);
      await button(page, '跳过演出 ↗').click(); await ended(page, 'mizuki', 'skip');
    }
    await context.close();
  }
  report.checks.push('404, invalid MP4 and cold stalled fetch release rules within 2.5-second watchdog; unmuted autoplay rejection retries muted; saveData fetches only on actual hit');
}
function errors(page, report, scenario = 'normal') {
  page.on('pageerror', e => report.errors.push({ scenario, text: e.message }));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    if (scenario === 'missing' && m.text().includes('404')) report.expectedErrors.push({ scenario, text: m.text() });
    else report.errors.push({ scenario, text: m.text() });
  });
}
async function environment(browser, scenario = 'normal') {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, hasTouch: true });
  await context.route(/\/api\/record(?:\?|$)/, r => r.fulfill({ contentType: 'application/json', body: '{"success":true,"skipped":true}' }));
  await context.route(/https:\/\/(pagead2\.googlesyndication\.com|hm\.baidu\.com)\//, r => r.fulfill({ contentType: 'application/javascript', body: '' }));
  if (scenario === 'missing') await context.route('**/cinematics/mizuki-original.mp4', r => r.fulfill({ status: 404, body: 'test missing' }));
  if (scenario === 'corrupt') await context.route('**/cinematics/mizuki-original.mp4', r => r.fulfill({ contentType: 'video/mp4', body: 'invalid test MP4' }));
  if (scenario === 'stall') await context.route('**/cinematics/mizuki-original.mp4', async r => { await new Promise(resolve => setTimeout(resolve, 4000)); await r.abort().catch(() => {}); });
  await context.addInitScript(scenario => {
    localStorage.setItem('tidal-duel-muted', scenario === 'autoplay' ? 'false' : 'true');
    localStorage.setItem('tidal-duel-cinematics', 'on');
    if (window.speechSynthesis) window.speechSynthesis.speak = () => {};
    let id = 0;
    window.requestAnimationFrame = () => ++id; window.cancelAnimationFrame = () => {};
    if (scenario === 'autoplay') {
      const play = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function () { return this.muted ? play.call(this) : Promise.reject(new DOMException('Test autoplay policy', 'NotAllowedError')); };
    }
    if (scenario === 'saveData') Object.defineProperty(navigator, 'connection', { value: { saveData: true }, configurable: true });
  }, scenario);
  return context;
}
async function open(page) {
  await page.goto(url); await page.waitForFunction(() => window.render_game_to_text && JSON.parse(window.render_game_to_text()).assetsReady, null, { polling: 50 });
  assert.equal(await page.evaluate(() => typeof window.tidalDuel), publicOnly ? 'undefined' : 'object');
  if (!publicOnly) await page.evaluate(() => window.tidalDuel.manual(true));
}
async function decodeAudio(page, report) {
  report.audio = await page.evaluate(async () => {
    const audio = new AudioContext(); const results = [];
    try {
      for (const actor of ['sui', 'shiori', 'mizuki']) {
        const response = await fetch(`/games/tidal-duel/cinematics/${actor}-original.mp4`);
        const buffer = await audio.decodeAudioData(await response.arrayBuffer());
        let sum = 0, peak = 0; const samples = buffer.getChannelData(0);
        for (const value of samples) { sum += value * value; peak = Math.max(peak, Math.abs(value)); }
        results.push({ actor, duration: buffer.duration, channels: buffer.numberOfChannels, rms: Math.sqrt(sum / samples.length), peak });
      }
      return results;
    } finally { await audio.close(); }
  });
  assert.equal(report.audio.length, 3);
  assert.ok(report.audio.every(a => a.channels === 2 && a.duration > 5 && a.rms > 0.001 && a.peak > 0.01));
  report.checks.push('All three shipped MP4 native AAC tracks decode to nonzero stereo PCM in Chrome, without playing test audio');
}
async function run(headless) {
  fs.mkdirSync(output, { recursive: true });
  const report = { status: 'running', url, publicOnly, browser: { channel: 'chrome', headless, muted: true }, checks: [], screenshots: [], requests: [], expectedErrors: [], errors: [] };
  let browser;
  try {
    assert.equal((await fetch(url, { signal: AbortSignal.timeout(20000) })).status, 200);
    browser = await chromium.launch({ channel: 'chrome', headless, args: ['--mute-audio', '--disable-speech-api'] });
    const context = await environment(browser); const page = await context.newPage(); errors(page, report);
    page.on('request', r => { if (/\/cinematics\/.*\.mp4$/.test(r.url())) report.requests.push(r.url()); });
    await open(page); await main(page, report); await exclusions(page, report); await ko(page, report); await decodeAudio(page, report);
    await context.close(); await failures(browser, report);
    assert.deepEqual(report.errors, []); report.status = 'passed';
    console.log(JSON.stringify({ status: report.status, checks: report.checks, screenshots: report.screenshots.map(s => s.name) }, null, 2));
  } catch (e) { report.status = 'failed'; report.failure = { message: e.message, stack: e.stack }; throw e; }
  finally { fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); await browser?.close(); }
}
(async () => { try { await run(process.env.HEADED !== '1'); } catch (e) { if (!(e instanceof CaptureFailure)) throw e; await run(false); } })().catch(e => { console.error(e); process.exitCode = 1; });
