const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/yuiffy/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright');
const { installVirtualPointerLock } = require('./lib/night-rain-virtual-pointer.cjs');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const base = process.env.NIGHT_RAIN_BASE_URL || 'http://127.0.0.1:4127';
const out = process.env.NIGHT_RAIN_QA_DIR || 'tmp/night-stalls/before';

function observeFrames() {
  const data = { active: false, phase: '', started: 0, calls: [], longTasks: [], frames: [] };
  window.frameStallMetrics = data;
  for (const Type of [window.WebGLRenderingContext, window.WebGL2RenderingContext].filter(Boolean)) {
    for (const name of ['compileShader', 'linkProgram', 'getProgramParameter', 'getProgramInfoLog', 'getShaderParameter', 'shaderSource']) {
      const original = Type.prototype[name];
      Type.prototype[name] = function measure(...args) {
        const start = performance.now(); const result = original.apply(this, args);
        if (data.active) {
          const lights = name === 'shaderSource' ? args[1].match(/pointLights\[\s*(\d+)\s*\]/)?.[1] : undefined;
          data.calls.push({ phase: data.phase, name, start, ms: performance.now() - start, lights });
        }
        return result;
      };
    }
  }
  const setItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function measure(...args) {
    const start = performance.now(); const result = setItem.apply(this, args);
    if (data.active) data.calls.push({ phase: data.phase, name: 'storage:' + args[0], start, ms: performance.now() - start });
    return result;
  };
  new PerformanceObserver(list => {
    if (data.active) data.longTasks.push(...list.getEntries().map(e => ({ phase: data.phase, start: e.startTime, ms: e.duration })));
  }).observe({ entryTypes: ['longtask'] });
  let last = performance.now();
  function sample(now) {
    if (data.active && last >= data.started) data.frames.push({ phase: data.phase, at: now, ms: now - last });
    last = now; requestAnimationFrame(sample);
  }
  requestAnimationFrame(sample);
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  assert.equal((await fetch(base + '/game/night-rain')).status, 200);
  const { engine, riverCompleted, place } = await import('./tests/helpers/night-rain-sky.mjs');
  const initial = riverCompleted(); initial.skyGates = ['sky-entry'];
  // A legitimate save on the optional tower crosses the abbey scenery threshold.
  place(initial, { x: -150, y: 26, z: -627 });
  assert.ok(engine.loadGame(engine.saveGame(initial)));
  const report = { base, phases: [], errors: [], pointerLock: 'virtual document only' };
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--disable-speech-api'] });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    await context.addInitScript(installVirtualPointerLock);
    await context.addInitScript(observeFrames);
    await context.addInitScript(save => {
      localStorage.setItem('night-rain-v1-slot-1', save);
      localStorage.setItem('night-rain-v1-settings', JSON.stringify({ enabled: true, voice: false }));
      localStorage.setItem('night-rain-audio-v1', JSON.stringify({ muted: true }));
      if (window.speechSynthesis) window.speechSynthesis.speak = () => {};
    }, engine.saveGame(initial));
    await context.route(/https:\/\/(pagead2\.googlesyndication\.com|hm\.baidu\.com)\//, r => r.fulfill({ contentType: 'application/javascript', body: '' }));
    const page = await context.newPage();
    page.on('pageerror', e => report.errors.push(e.stack));
    page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
    await page.goto(base + '/game/night-rain', { waitUntil: 'networkidle' });
    const loadingStarted = performance.now();
    await page.getByRole('button', { name: '继续雨夜旅程 →', exact: true }).click();
    await page.waitForFunction(() => window.nightRainRender?.().calls > 0, null, { timeout: 60000 });
    await page.getByText('雨正在落下，旧城即将亮灯……', { exact: true }).waitFor({ state: 'hidden' });
    report.loadingMs = performance.now() - loadingStarted;
    await page.waitForTimeout(2000);
    const capture = async (name, target = page) => {
      const snapshot = await target.evaluate(() => ({ state: JSON.parse(window.render_game_to_text()), render: window.nightRainRender(), canvas: [...document.querySelectorAll('canvas')].map(c => [c.width, c.height]), dom: document.body.innerText }));
      assert.equal(snapshot.state.mode, 'playing'); assert.equal(snapshot.canvas.length, 1);
      assert.ok(snapshot.canvas[0][0] > 100);
      const file = path.join(out, name + '.png'); const pixels = inspectPng(await target.screenshot({ path: file, fullPage: true }));
      fs.writeFileSync(path.join(out, name + '.json'), JSON.stringify(snapshot, null, 2));
      return { file, pixels };
    };
    report.before = await capture('before');
    const cdp = await context.newCDPSession(page);
    await cdp.send('Profiler.enable'); await cdp.send('Profiler.start');
    for (const phase of ['rotate-before', 'north-1', 'south-1', 'north-2', 'south-2', 'rotate-after']) {
      const result = await page.evaluate(async phase => {
        const metrics = window.frameStallMetrics;
        const start = performance.now(); metrics.phase = phase; metrics.started = start; metrics.active = true;
        const from = window.nightRain.getState().player;
        const fromYaw = JSON.parse(window.render_game_to_text()).camera.yaw;
        const north = phase.startsWith('north'); const south = phase.startsWith('south');
        if (north || south) window.nightRain.input({ x: 0, z: north ? -1 : 1 });
        await new Promise(resolve => {
          let last = performance.now(); let rotationRemainder = 0;
          function run(now) {
            const p = window.nightRain.getState().player;
            if (!north && !south) {
              // MouseEvent rounds movementX to integer pixels; retain fractions
              // so high-refresh production frames still turn the camera.
              rotationRemainder += (now - last) * .12;
              const movementX = Math.floor(rotationRemainder); rotationRemainder -= movementX;
              if (movementX) document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, movementX, movementY: 0 }));
            }
            last = now;
            const reached = north ? p.z < -632 : south ? p.z > -627 : now - start > 3000;
            if (reached || now - start > 20000) { window.nightRain.input({ x: 0, z: 0 }); resolve(); }
            else requestAnimationFrame(run);
          }
          requestAnimationFrame(run);
        });
        await new Promise(resolve => setTimeout(resolve, 150));
        metrics.active = false;
        return { phase, wallMs: performance.now() - start, from, to: window.nightRain.getState().player, fromYaw, toYaw: JSON.parse(window.render_game_to_text()).camera.yaw };
      }, phase);
      report.phases.push(result); console.log(phase + ' ' + result.wallMs.toFixed(1) + 'ms z=' + result.to.z.toFixed(2));
      if (phase.startsWith('north')) assert.ok(result.to.z < -631, 'must physically cross scenery threshold');
      if (phase.startsWith('south')) assert.ok(result.to.z > -629, 'must physically cross back');
      if (phase.startsWith('rotate')) assert.ok(Math.abs(result.toYaw - result.fromYaw) > .2, 'camera must actually rotate');
    }
    for (const enabled of [false, true]) {
      const phase = enabled ? 'companion-on' : 'companion-off';
      await page.evaluate(phase => { window.frameStallMetrics.phase = phase; window.frameStallMetrics.started = performance.now(); window.frameStallMetrics.active = true; }, phase);
      const start = performance.now();
      await page.keyboard.press('c');
      await page.locator('#baby-mode').setChecked(enabled);
      await page.getByRole('button', { name: '关闭', exact: true }).click();
      await page.waitForTimeout(300);
      const state = await page.evaluate(() => {
        window.frameStallMetrics.active = false;
        return JSON.parse(window.render_game_to_text());
      });
      assert.equal(state.companion.enabled, enabled); assert.equal(state.paused, false);
      report.phases.push({ phase, wallMs: performance.now() - start });
    }
    const { profile } = await cdp.send('Profiler.stop');
    fs.writeFileSync(path.join(out, 'cpu-profile.json'), JSON.stringify(profile));
    const data = await page.evaluate(() => window.frameStallMetrics);
    fs.writeFileSync(path.join(out, 'frame-trace.json'), JSON.stringify(data, null, 2));
    report.metrics = report.phases.map(p => {
      const frames = data.frames.filter(f => f.phase === p.phase).map(f => f.ms).sort((a, b) => a - b);
      const calls = data.calls.filter(c => c.phase === p.phase);
      return { phase: p.phase, maxFrameMs: frames.at(-1), p95FrameMs: frames[Math.floor(frames.length * .95)], compileShaders: calls.filter(c => c.name === 'compileShader').length, lights: [...new Set(calls.flatMap(c => c.lights ? [c.lights] : []))], slowCalls: calls.filter(c => c.ms > 10), maxStorageMs: Math.max(0, ...calls.filter(c => c.name.startsWith('storage:')).map(c => c.ms)), longTasks: data.longTasks.filter(c => c.phase === p.phase) };
    });
    report.after = await capture('after');
    // Also inspect the original lighting where the two lights actually illuminate the abbey.
    const { skyCompleted } = await import('./tests/helpers/night-rain-bell.mjs');
    report.abbey = [];
    for (const [name, position] of [['abbey-nave', { x: -44, y: 34, z: -848 }], ['abbey-archive', { x: -106, y: 16, z: -813 }]]) {
      const s = skyCompleted(); s.bellGates = ['bell-entry', 'bell-door']; s.collected.push('bell-clapper');
      place(s, position); assert.ok(engine.loadGame(engine.saveGame(s)));
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      await ctx.addInitScript(installVirtualPointerLock);
      await ctx.addInitScript(save => {
        localStorage.setItem('night-rain-v1-slot-1', save);
        localStorage.setItem('night-rain-v1-settings', JSON.stringify({ enabled: false, voice: false }));
        localStorage.setItem('night-rain-audio-v1', JSON.stringify({ muted: true }));
        if (window.speechSynthesis) window.speechSynthesis.speak = () => {};
      }, engine.saveGame(s));
      await ctx.route(/https:\/\/(pagead2\.googlesyndication\.com|hm\.baidu\.com)\//, r => r.fulfill({ contentType: 'application/javascript', body: '' }));
      const target = await ctx.newPage();
      target.on('pageerror', e => report.errors.push(e.stack));
      target.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
      await target.goto(base + '/game/night-rain', { waitUntil: 'networkidle' });
      await target.getByRole('button', { name: '继续雨夜旅程 →', exact: true }).click();
      await target.waitForFunction(() => window.nightRainRender?.().calls > 0, null, { timeout: 60000 });
      await target.waitForTimeout(1500);
      report.abbey.push(await capture(name, target)); await ctx.close();
    }
    assert.deepEqual(report.errors, []);
    if (process.env.NIGHT_RAIN_ALLOW_SHADER_COMPILE !== '1') {
      assert.equal(report.metrics.reduce((n, m) => n + m.compileShaders, 0), 0, 'walking and rotating must not recompile the world');
      assert.ok(data.frames.every(f => f.ms < 1000), 'no frame may freeze for a second');
      assert.ok(data.longTasks.every(t => t.ms < 1000), 'no main-thread task may freeze for a second');
    }
    report.passed = true;
    console.log(JSON.stringify(report.metrics));
  } finally { fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
