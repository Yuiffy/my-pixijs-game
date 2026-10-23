const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/yuiffy/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const base = process.env.NIGHT_RAIN_BASE_URL || 'http://127.0.0.1:4126';
const out = process.env.NIGHT_RAIN_QA_DIR || 'tmp/night-performance-before';
(async () => {
  fs.mkdirSync(out, { recursive: true });
  assert.equal((await fetch(`${base}/game/night-rain`)).status, 200);
  const { engine, riverCompleted, place } = await import('./tests/helpers/night-rain-sky.mjs');
  const { skyCompleted } = await import('./tests/helpers/night-rain-bell.mjs');
  const browser = await chromium.launch({ channel: 'chrome', headless: process.env.HEADED !== '1', args: ['--mute-audio', '--disable-speech-api'] });
  const report = { scenarios: [], errors: [] };
  try {
    for (const name of ['old-city', 'skyplain', 'skyplain-mobile', 'abbey', 'abbey-boss', 'abbey-mobile']) {
      const s = name === 'old-city' ? engine.createGame() : name.startsWith('abbey') ? skyCompleted() : riverCompleted();
      if (name.startsWith('skyplain')) { s.skyGates = ['sky-entry']; place(s, { x: -104, y: 18, z: -575 }); }
      if (name.startsWith('abbey')) { s.bellGates = ['bell-entry', 'bell-door']; s.collected.push('bell-clapper'); place(s, { x: -44, y: 34, z: name === 'abbey-boss' ? -858 : -848 }); if (name === 'abbey-boss') Object.assign(s.enemies.find(e => e.id === 'bell-keeper'), { aggro: true, phase: 2, hp: 650 }); }
      engine.startGame(s);
      const ctx = await browser.newContext({ viewport: name.endsWith('mobile') ? { width: 390, height: 844 } : { width: 1440, height: 900 }, deviceScaleFactor: 1 });
      await ctx.route(/https:\/\/(pagead2\.googlesyndication\.com|hm\.baidu\.com)\//, r => r.fulfill({ contentType: 'application/javascript', body: '' }));
      await ctx.addInitScript(save => {
        localStorage.setItem('night-rain-v1-slot-1', save);
        localStorage.setItem('night-rain-v1-settings', JSON.stringify({ enabled: false, voice: false }));
        localStorage.setItem('night-rain-audio-v1', JSON.stringify({ muted: true }));
        if (window.speechSynthesis) window.speechSynthesis.speak = () => {};
      }, engine.saveGame(s));
      const page = await ctx.newPage();
      page.on('pageerror', e => report.errors.push(e.message));
      page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
      await page.goto(`${base}/game/night-rain`, { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: '继续雨夜旅程 →', exact: true }).click();
      await page.waitForFunction(() => window.nightRainRender);
      await page.waitForTimeout(2500);
      if (name === 'abbey' || name === 'abbey-mobile') await page.evaluate(() => window.nightRain.input({ x: .12, z: 0 }));
      if (name === 'abbey-boss') await page.evaluate(() => window.nightRain.input({ x: 0, z: 0, guardHeld: true }));
      const session = await ctx.newCDPSession(page); await session.send('Performance.enable');
      const before = await session.send('Performance.getMetrics');
      const samples = await page.evaluate(() => new Promise(resolve => {
        const frames = []; const renders = []; let last = performance.now(); const end = last + 5000;
        function sample(now) { frames.push(now - last); last = now; renders.push(window.nightRainRender()); if (now < end) requestAnimationFrame(sample); else resolve({ frames, renders }); }
        requestAnimationFrame(sample);
      }));
      const after = await session.send('Performance.getMetrics');
      const ordered = samples.frames.slice(1).sort((a, b) => a - b);
      const percentile = p => ordered[Math.min(ordered.length - 1, Math.floor(ordered.length * p))];
      const metrics = Object.fromEntries(after.metrics.filter(m => ['TaskDuration', 'ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration'].includes(m.name)).map(m => [m.name, m.value - before.metrics.find(b => b.name === m.name).value]));
      const snapshot = await page.evaluate(() => ({ state: JSON.parse(window.render_game_to_text()), canvas: [...document.querySelectorAll('canvas')].map(c => [c.width, c.height]), width: innerWidth, scrollWidth: document.documentElement.scrollWidth, dom: document.body.innerText }));
      assert.equal(snapshot.state.mode, 'playing'); assert.ok(snapshot.canvas[0][0] > 100); assert.ok(snapshot.scrollWidth <= snapshot.width);
      const file = path.join(out, `${name}.png`); const pixels = inspectPng(await page.screenshot({ path: file, fullPage: true }));
      const summary = { name, fps: 1000 / (ordered.reduce((a, b) => a + b, 0) / ordered.length), medianMs: percentile(.5), p95Ms: percentile(.95), over33Ms: ordered.filter(n => n > 33.5).length / ordered.length, calls: Math.max(...samples.renders.map(r => r.calls)), triangles: Math.max(...samples.renders.map(r => r.triangles)), geometries: samples.renders.at(-1).geometries, metrics, file, pixels };
      report.scenarios.push(summary); fs.writeFileSync(path.join(out, `${name}.json`), JSON.stringify({ summary, snapshot, samples }, null, 2));
      console.log(JSON.stringify(summary)); await ctx.close();
    }
    assert.deepEqual(report.errors, []);
  } finally { fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
