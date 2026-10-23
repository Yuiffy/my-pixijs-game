const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/yuiffy/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const base = process.env.NIGHT_RAIN_BASE_URL || 'http://127.0.0.1:4127';
const out = process.env.NIGHT_RAIN_QA_DIR || 'tmp/night-title-playback';
(async () => {
  assert.equal((await fetch(base + '/game/night-rain')).status, 200);
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: process.env.HEADED !== '1', args: ['--mute-audio', '--disable-speech-api'] });
  const report = { samples: [], errors: [], screenshots: [] };
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.route(/https:\/\/(pagead2\.googlesyndication\.com|hm\.baidu\.com)\//, r => r.fulfill({ contentType: 'application/javascript', body: '' }));
    await ctx.addInitScript(() => {
      localStorage.setItem('night-rain-audio-v1', JSON.stringify({ muted: true }));
      localStorage.setItem('night-rain-v1-settings', JSON.stringify({ enabled: false, voice: false }));
      if (window.speechSynthesis) window.speechSynthesis.speak = () => {};
      window.__titleProbe = { tasks: [], events: [] };
      new PerformanceObserver(list => list.getEntries().forEach(e => window.__titleProbe.tasks.push({ start: e.startTime, duration: e.duration }))).observe({ type: 'longtask', buffered: true });
      for (const name of ['loadstart', 'playing', 'waiting', 'stalled', 'ended', 'error']) document.addEventListener(name, event => {
        if (event.target instanceof HTMLVideoElement) window.__titleProbe.events.push({ name, at: performance.now(), src: event.target.currentSrc, time: event.target.currentTime });
      }, true);
    });
    const page = await ctx.newPage();
    page.on('pageerror', e => report.errors.push(e.stack));
    page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
    await page.goto(base + '/game/night-rain', { waitUntil: 'domcontentloaded' });
    for (let i = 0; i < 19; i += 1) {
      await page.waitForTimeout(1000);
      const sample = await page.evaluate(() => ({ at: performance.now(), videos: [...document.querySelectorAll('video')].map(v => ({ src: v.currentSrc, time: v.currentTime, duration: v.duration, paused: v.paused, ended: v.ended, ready: v.readyState, buffered: v.buffered.length ? v.buffered.end(v.buffered.length - 1) : 0, quality: v.getVideoPlaybackQuality().toJSON?.() || { total: v.getVideoPlaybackQuality().totalVideoFrames, dropped: v.getVideoPlaybackQuality().droppedVideoFrames } })), canvas: document.querySelectorAll('canvas').length, state: window.render_game_to_text ? JSON.parse(window.render_game_to_text()).mode : null }));
      report.samples.push(sample);
    }
    report.probe = await page.evaluate(() => window.__titleProbe);
    report.mediaRequests = await page.evaluate(() => performance.getEntriesByType('resource').filter(e => e.name.includes('/cinema/')).map(e => ({ name: e.name, duration: e.duration, transferSize: e.transferSize })));
    const file = path.join(out, 'title-after-intro.png');
    report.screenshots.push({ file, pixels: inspectPng(await page.screenshot({ path: file, fullPage: true })) });
    if (process.env.EXPECT_LOOP === '1') {
      const loops = report.samples.filter(s => s.videos.some(v => v.src.endsWith('/title-loop.mp4') && !v.ended && !v.paused));
      assert.ok(loops.length >= 3, 'dedicated background continues after intro');
      assert.ok(loops.some((s, i) => i && s.videos.at(-1).time < loops[i - 1].videos.at(-1).time), 'loop wraps and keeps playing');
      assert.ok(report.samples.every(s => s.canvas === 0), 'no world construction during title playback');
      assert.ok(report.probe.events.filter(e => e.src.endsWith('/title-loop.mp4') && e.name === 'error').length === 0);
      await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
      assert.ok(await page.locator('video').evaluateAll(videos => videos.every(v => v.paused)), 'hidden title pauses both clips');
      await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
      await page.waitForFunction(() => !document.querySelector('video[loop]').paused);
      await page.getByRole('button', { name: '重播入场 · 启声' }).click();
      await page.getByRole('dialog', { name: '旅居之魂入场' }).waitFor();
      assert.equal(await page.locator('video').count(), 1, 'background clips unload during full replay');
      await page.getByRole('button', { name: '进入标题 →' }).click();
      assert.equal(await page.locator('video').count(), 2);
      assert.equal(await page.locator('canvas').count(), 0);
    }
    assert.deepEqual(report.errors, []);
    console.log(JSON.stringify({ tasks: report.probe.tasks, events: report.probe.events, last: report.samples.at(-1), errors: report.errors }));
  } finally { fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
