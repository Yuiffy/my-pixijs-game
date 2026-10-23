const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/yuiffy/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const { installVirtualPointerLock } = require('./lib/night-rain-virtual-pointer.cjs');
const base = process.env.NIGHT_RAIN_BASE_URL || 'http://127.0.0.1:4126';
const out = process.env.NIGHT_RAIN_QA_DIR || 'tmp/night-cinema-visual';
(async () => {
  fs.mkdirSync(out, { recursive: true }); assert.equal((await fetch(base + '/game/night-rain')).status, 200);
  const browser = await chromium.launch({ channel: 'chrome', headless: process.env.HEADED !== '1', args: ['--mute-audio', '--disable-speech-api'] });
  const report = { scenarios: [], errors: [] };
  try {
    for (const mode of ['desktop', 'mobile', 'reduced', 'media-failure', 'sound-enabled']) {
      const ctx = await browser.newContext({ viewport: mode === 'mobile' ? { width: 320, height: 844 } : { width: 1440, height: 900 }, reducedMotion: mode === 'reduced' ? 'reduce' : 'no-preference' });
      await ctx.route(/https:\/\/(pagead2\.googlesyndication\.com|hm\.baidu\.com)\//, r => r.fulfill({ contentType: 'application/javascript', body: '' }));
      if (mode === 'media-failure') await ctx.route('**/cinema/*.mp4', r => r.fulfill({ status: 200, contentType: 'video/mp4', body: 'invalid movie' }));
      await ctx.addInitScript(installVirtualPointerLock);
      await ctx.addInitScript(mode => { localStorage.setItem('night-rain-audio-v1', JSON.stringify({ muted: mode !== 'sound-enabled' })); localStorage.setItem('night-rain-v1-settings', JSON.stringify({ enabled: false, voice: false })); if (window.speechSynthesis) window.speechSynthesis.speak = () => {}; }, mode);
      const page = await ctx.newPage(); page.on('pageerror', e => report.errors.push(e.stack)); page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
      await page.goto(base + '/game/night-rain', { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: '出门找夜宵', exact: true }).waitFor();
      const capture = async name => {
        const snapshot = await page.evaluate(() => ({ state: JSON.parse(window.render_game_to_text()), videos: [...document.querySelectorAll('video')].map(v => ({ time: v.currentTime, paused: v.paused, muted: v.muted, volume: v.volume, source: v.getAttribute('src'), ready: v.readyState })), width: innerWidth, scroll: document.documentElement.scrollWidth, canvas: [...document.querySelectorAll('canvas')].map(c => [c.width, c.height]), dom: document.body.innerText }));
        assert.ok(snapshot.scroll <= snapshot.width); assert.equal(snapshot.canvas.length, snapshot.state.mode === 'title' ? 0 : 1);
        const file = path.join(out, `${mode}-${name}.png`); const pixels = inspectPng(await page.screenshot({ path: file, fullPage: true })); report.scenarios.push({ mode, name, file, pixels, snapshot });
      };
      if (mode === 'desktop') { await page.waitForTimeout(600); await capture('title'); await page.getByRole('button', { name: '重播入场 · 启声' }).click(); await page.waitForFunction(() => document.querySelector('[role="dialog"] video')?.currentTime > .1); await capture('title-entrance'); await page.keyboard.press('Escape'); }
      await page.getByRole('button', { name: '出门找夜宵', exact: true }).click();
      const movie = page.getByRole('dialog', { name: '旅居之魂序章' }); await movie.waitFor();
      if (mode === 'reduced') { await page.getByRole('button', { name: '播放影像' }).waitFor(); assert.ok(await movie.locator('video').evaluate(v => v.paused)); }
      else if (mode === 'media-failure') await page.getByRole('status').filter({ hasText: '影像暂不可用' }).waitFor();
      else await page.waitForFunction(() => document.querySelector('[role="dialog"] video')?.currentTime > .1);
      assert.equal(await page.evaluate(() => localStorage.getItem('night-rain-v1-slot-1')), null, 'no new save before OP finishes');
      if (mode === 'sound-enabled') { assert.equal(await movie.locator('video').evaluate(v => v.muted), false); assert.equal(await movie.locator('video').evaluate(v => v.volume), .65); assert.equal(await page.evaluate(() => JSON.parse(window.render_game_to_text()).audio.cinematic), true); }
      await capture('opening');
      if (mode === 'desktop') {
        await page.evaluate(() => window.dispatchEvent(new Event('blur'))); await page.getByRole('button', { name: '播放影像' }).waitFor(); assert.ok(await movie.locator('video').evaluate(v => v.paused));
        await page.getByRole('button', { name: '播放影像' }).click(); await movie.locator('video').evaluate(v => { v.currentTime = v.duration - .2; });
        await movie.waitFor({ state: 'detached' });
      } else await page.getByRole('button', { name: '跳过序章，开始旅途 →' }).click();
      await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'playing');
      await page.waitForFunction(() => window.nightRainRender && document.querySelector('canvas')?.width > 100);
      assert.equal(await page.locator('video').count(), 0); assert.ok(await page.evaluate(() => localStorage.getItem('night-rain-v1-slot-1')));
      await capture('gameplay');
      await page.reload({ waitUntil: 'networkidle' }); await page.getByRole('button', { name: '继续雨夜旅程 →', exact: true }).click(); assert.equal(await page.getByRole('dialog', { name: '旅居之魂序章' }).count(), 0); assert.equal(await page.locator('video').count(), 0);
      await ctx.close(); console.log(mode);
    }
    assert.deepEqual(report.errors, []);
  } finally { fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
