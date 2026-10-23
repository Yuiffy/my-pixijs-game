const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/yuiffy/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const { installVirtualPointerLock } = require('./lib/night-rain-virtual-pointer.cjs');
const base = process.env.NIGHT_RAIN_BASE_URL || 'http://127.0.0.1:4127';
const out = process.env.NIGHT_RAIN_QA_DIR || 'tmp/night-render-recovery';

function interruptFirstShaderWarmup() {
  const metrics = { scheduled: false, available: false, parallel: false, fired: false, lost: false, loadingAtLoss: false, renderCallsAtLoss: null, beforeLossPolls: 0, afterLossPolls: 0 };
  window.nightRainWarmupLoss = metrics;
  let interruptedContext = null; let completionStatus = null;
  for (const Type of [window.WebGLRenderingContext, window.WebGL2RenderingContext].filter(Boolean)) {
    const compileShader = Type.prototype.compileShader;
    Type.prototype.compileShader = function compileAndInterrupt(...args) {
      const result = compileShader.apply(this, args);
      if (!metrics.scheduled) {
        metrics.scheduled = true; interruptedContext = this;
        const loss = this.getExtension('WEBGL_lose_context');
        const parallel = this.getExtension('KHR_parallel_shader_compile');
        metrics.available = !!loss; metrics.parallel = !!parallel;
        completionStatus = parallel?.COMPLETION_STATUS_KHR ?? null;
        if (loss) {
          this.canvas.addEventListener('webglcontextlost', () => { metrics.lost = true; }, { once: true, capture: true });
          // compileAsync starts synchronously. Lose the real context as soon as
          // that work yields, while its asynchronous readiness check is pending.
          setTimeout(() => {
            metrics.loadingAtLoss = [...document.querySelectorAll('[role="status"]')].some(el => el.textContent.includes('雨正在落下，旧城即将亮灯'));
            metrics.renderCallsAtLoss = window.nightRainRender?.().calls ?? 0;
            metrics.fired = true; loss.loseContext();
          }, 0);
        }
      }
      return result;
    };
    const getProgramParameter = Type.prototype.getProgramParameter;
    Type.prototype.getProgramParameter = function gateInterruptedReadiness(...args) {
      if (this === interruptedContext && completionStatus !== null && args[1] === completionStatus) {
        // Hold only this initial context until loss. Then settle the obsolete
        // compile promise, exercising stale completion without endless GL polls.
        if (!metrics.lost) { metrics.beforeLossPolls += 1; return false; }
        metrics.afterLossPolls += 1; return true;
      }
      return getProgramParameter.apply(this, args);
    };
  }
}

(async () => {
  assert.equal((await fetch(base + '/game/night-rain')).status, 200);
  fs.mkdirSync(out, { recursive: true });
  const { engine } = await import('./tests/helpers/night-rain-bell.mjs');
  const initial = engine.createGame(); engine.startGame(initial);
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--disable-speech-api'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const report = { cycles: [], errors: [] };
  try {
    await ctx.addInitScript(installVirtualPointerLock);
    await ctx.addInitScript(interruptFirstShaderWarmup);
    await ctx.route(/https:\/\/(pagead2\.googlesyndication\.com|hm\.baidu\.com)\//, r => r.fulfill({ contentType: 'application/javascript', body: '' }));
    await ctx.addInitScript(save => {
      localStorage.setItem('night-rain-v1-slot-1', save);
      localStorage.setItem('night-rain-audio-v1', JSON.stringify({ muted: true }));
      localStorage.setItem('night-rain-v1-settings', JSON.stringify({ enabled: false, voice: false }));
      if (window.speechSynthesis) window.speechSynthesis.speak = () => {};
    }, engine.saveGame(initial));
    const page = await ctx.newPage();
    page.on('pageerror', e => report.errors.push(e.stack));
    page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
    await page.goto(base + '/game/night-rain', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: '继续雨夜旅程 →', exact: true }).click();
    await page.waitForFunction(() => window.nightRainWarmupLoss?.lost, null, { timeout: 60000 });
    const recovery = page.getByRole('alertdialog', { name: '恢复游戏画面' });
    await recovery.waitFor({ timeout: 60000 });
    report.warmupLoss = await page.evaluate(() => ({ ...window.nightRainWarmupLoss, state: JSON.parse(window.render_game_to_text()) }));
    assert.equal(report.warmupLoss.available, true, 'Chrome must support real context loss');
    assert.equal(report.warmupLoss.fired, true);
    assert.equal(report.warmupLoss.loadingAtLoss, true, 'loss must interrupt the loading screen');
    assert.equal(report.warmupLoss.renderCallsAtLoss, 0, 'no game frame may render before warmup finishes');
    assert.equal(report.warmupLoss.state.paused, true);
    assert.equal(report.warmupLoss.state.time, initial.time, 'simulation must stay frozen during interrupted warmup');
    if (report.warmupLoss.parallel) {
      await page.waitForFunction(() => window.nightRainWarmupLoss.afterLossPolls > 0, null, { timeout: 60000 });
    }
    // Let the obsolete compileAsync continuation run before creating a new scene.
    await page.waitForTimeout(250);
    assert.equal(await recovery.isVisible(), true, 'stale warmup completion must preserve the recovery dialog');
    // A stale onReady could silently reopen the simulation while the error
    // dialog remains visible. Remove the independent pause gate to detect it.
    await page.keyboard.press('p');
    assert.equal(await page.evaluate(() => window.nightRain.getState().paused), false);
    await page.waitForTimeout(250);
    const staleProbe = await page.evaluate(() => window.nightRain.getState());
    assert.equal(staleProbe.time, initial.time, 'obsolete warmup must never mark the lost scene ready');
    assert.equal(await recovery.isVisible(), true);
    await page.keyboard.press('p');
    assert.equal(await page.evaluate(() => window.nightRain.getState().paused), true);
    report.warmupLoss.staleReadyProbe = { time: staleProbe.time, paused: staleProbe.paused };
    const interruptedFile = path.join(out, 'warmup-interrupted.png');
    report.warmupLoss.afterStaleCompletion = await page.evaluate(() => ({ metrics: { ...window.nightRainWarmupLoss }, state: JSON.parse(window.render_game_to_text()), canvas: [...document.querySelectorAll('canvas')].map(c => [c.width, c.height]), dom: document.body.innerText }));
    assert.equal(report.warmupLoss.afterStaleCompletion.state.paused, true);
    assert.equal(report.warmupLoss.afterStaleCompletion.state.time, initial.time);
    report.warmupLoss.evidence = { file: interruptedFile, pixels: inspectPng(await page.screenshot({ path: interruptedFile, fullPage: true })) };
    await page.getByRole('button', { name: '重新载入 3D 画面' }).click();
    await recovery.waitFor({ state: 'detached' });
    await page.keyboard.press('p');
    const cdp = await ctx.newCDPSession(page); await cdp.send('Performance.enable');
    const sample = async () => {
      await page.waitForFunction(() => window.nightRainRender?.().calls > 100, null, { timeout: 60000 });
      await page.waitForTimeout(1500); await cdp.send('HeapProfiler.collectGarbage');
      const metrics = await cdp.send('Performance.getMetrics');
      return { render: await page.evaluate(() => window.nightRainRender()), heapBytes: metrics.metrics.find(m => m.name === 'JSHeapUsedSize').value };
    };
    report.initial = await sample();
    await page.getByText('雨正在落下，旧城即将亮灯……', { exact: true }).waitFor({ state: 'hidden', timeout: 60000 });
    assert.equal(await page.locator('canvas').count(), 1);
    const resumed = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
    assert.equal(resumed.mode, 'playing'); assert.equal(resumed.paused, false);
    assert.ok(resumed.time > initial.time, 'reloading after interrupted warmup must resume simulation');
    assert.ok(Math.abs(resumed.player.x - initial.player.x) < .01 && Math.abs(resumed.player.z - initial.player.z) < .01);
    report.warmupLoss.recovered = { render: report.initial.render, time: resumed.time, position: resumed.player };
    const position = await page.evaluate(() => JSON.parse(window.render_game_to_text()).player);
    for (let i = 0; i < 3; i++) {
      assert.equal(await page.evaluate(() => {
        const canvas = document.querySelector('canvas');
        const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
        const extension = gl?.getExtension('WEBGL_lose_context');
        if (!extension) return false;
        extension.loseContext(); return true;
      }), true);
      await page.getByRole('alertdialog', { name: '恢复游戏画面' }).waitFor();
      await page.getByRole('button', { name: '重新载入 3D 画面' }).click();
      await page.getByRole('alertdialog', { name: '恢复游戏画面' }).waitFor({ state: 'detached' });
      await page.keyboard.press('p');
      const current = await sample(); report.cycles.push(current);
      assert.equal(await page.locator('canvas').count(), 1);
      assert.equal(await page.locator('video').count(), 0);
      const state = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
      assert.equal(state.mode, 'playing');
      assert.ok(Math.abs(state.player.x - position.x) < .01 && Math.abs(state.player.z - position.z) < .01);
      assert.ok(current.render.geometries <= report.initial.render.geometries + 25);
      assert.ok(current.render.textures <= report.initial.render.textures + 2);
      assert.ok(current.heapBytes < report.initial.heapBytes * 1.5 + 16 * 1024 * 1024);
    }
    const file = path.join(out, 'recovered.png');
    report.snapshot = await page.evaluate(() => ({ state: JSON.parse(window.render_game_to_text()), canvas: [...document.querySelectorAll('canvas')].map(c => [c.width, c.height]), dom: document.body.innerText }));
    report.evidence = { file, pixels: inspectPng(await page.screenshot({ path: file, fullPage: true })) };
    assert.deepEqual(report.errors, []);
    report.passed = true;
  } finally { fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
