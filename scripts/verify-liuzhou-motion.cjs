// Sample moving, mounted transforms on real animation frames. Fixed-step jumps
// followed by idle screenshots cannot expose a camera/body frame mismatch.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, file);
const { terrainTriangleHeight } = require('../src/components/liuzhou/terrainMesh.ts');
const { BRIDGE_HEIGHT } = require('../src/components/liuzhou/bridges.ts');
const { quietContext } = require('./lib/liuzhou-test-browser.cjs');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd(), path.join(require('node:os').homedir(), '.codex/skills/develop-web-game')] }));
const base = process.env.LIUZHOU_BASE_URL || 'http://127.0.0.1:4133';
const out = process.env.LIUZHOU_QA_DIR || '.tmp/liuzhou-motion-dev';
const baseline = process.env.LIUZHOU_MOTION_EXPECT_LAG === '1';
const report = { passed: false, baseline, errors: [], checks: [], captures: [] };
(async () => {
  assert.equal((await fetch(`${base}/game/liuzhou`, { signal: AbortSignal.timeout(90000) })).status, 200);
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--disable-speech-api'] });
  try {
    const context = await quietContext(browser, { viewport: { width: 1280, height: 800 } });
    await context.addInitScript(() => { if (window.name.startsWith('liuzhou-fixture:')) localStorage.setItem('liuzhou-riverside-v1', window.name.slice(16)); });
    await context.route(/https:\/\/(pagead2\.googlesyndication\.com|hm\.baidu\.com)\//, r => r.fulfill({ body: '' }));
    const page = await context.newPage();
    page.on('pageerror', error => report.errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
    await page.goto(`${base}/game/liuzhou?test=1`);
    const ready = () => page.waitForFunction(() => !!window.liuzhouTest?.rig.motion && ![...document.querySelectorAll('button')].find(b => b.textContent.includes('自由巡览 · 快速飞行'))?.disabled, { timeout: 90000 });
    await ready();
    const fixture = async (player, flight = false, vehicle) => {
      await page.evaluate(save => { window.name = 'liuzhou-fixture:' + JSON.stringify(save); }, {
        version: 1, terrainVersion: 2, bridgeVersion: 2, stage: 1, exploration: true,
        flight, player: { ...player, angle: 0, speed: 0 }, money: 60,
        vehicles: vehicle ? [vehicle] : undefined,
      });
      await page.reload(); await ready();
      await page.getByRole('button', { name: '自由巡览 · 快速飞行 ↗' }).click();
      await page.evaluate(() => Object.assign(window.liuzhouTest.rig, { yaw: 0, pitch: 0.12, zoom: 12, reset: true, dragged: performance.now() }));
      if (vehicle) {
        await page.keyboard.press('e');
        assert.equal(await page.evaluate(() => window.liuzhouTest.game.vehicle), vehicle.id);
      }
    };
    const trace = async (name, keys, frames = 24) => {
      for (const key of keys) await page.keyboard.down(key);
      const samples = await page.evaluate(frames => new Promise(resolve => {
        const values = [];
        const sample = () => {
          const t = window.liuzhouTest; const g = t.game; const actual = t.rig.motion();
          const expected = { ...g.player }; const vehicle = g.vehicles.find(v => v.id === g.vehicle);
          const horizontalError = Math.hypot(actual.player[0] - expected.x, actual.player[2] - expected.z);
          const vehicleError = vehicle ? Math.hypot(actual.vehicle.position[0] - vehicle.x, actual.vehicle.position[1] - vehicle.y, actual.vehicle.position[2] - vehicle.z) : 0;
          const yawError = Math.abs(Math.atan2(Math.sin(actual.playerYaw - expected.angle), Math.cos(actual.playerYaw - expected.angle)));
          values.push({ actual, expected, vehicle: vehicle ? { ...vehicle } : undefined, horizontalError, vehicleError, yawError });
          // Keep acceleration coverage independent of the production frame rate.
          if (values.length >= frames && actual.time - values[0].actual.time >= 1) resolve(values); else requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      }), frames);
      for (const key of keys.slice().reverse()) await page.keyboard.up(key);
      const maximum = key => Math.max(...samples.map(s => s[key]));
      const distance = Math.hypot(samples.at(-1).expected.x - samples[0].expected.x, samples.at(-1).expected.z - samples[0].expected.z);
      const check = { name, distance, maxHorizontalError: maximum('horizontalError'), maxVehicleError: maximum('vehicleError'), maxYawError: maximum('yawError'), samples };
      report.checks.push(check);
      console.log(JSON.stringify({ name, distance, maxHorizontalError: check.maxHorizontalError, maxVehicleError: check.maxVehicleError, maxYawError: check.maxYawError }));
      if (!baseline) {
        assert.ok(check.maxHorizontalError < 1e-6, `${name}: mounted body reads an older simulation step`);
        assert.ok(check.maxVehicleError < 1e-6, `${name}: vehicle reads an older simulation step`);
        assert.ok(check.maxYawError < 1e-6, `${name}: turn uses an older simulation step`);
      }
      return check;
    };
    const capture = async name => {
      await page.evaluate(() => window.liuzhouTest.manual(true));
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const file = path.join(out, `${name}.png`); const sanity = inspectPng(await page.screenshot({ path: file, fullPage: true }));
      const state = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
      const rider = await page.evaluate(() => {
        const t = window.liuzhouTest;
        return t.visual().find(avatar => avatar.id === `rider-${t.game.vehicle}` && avatar.visible);
      });
      if (state.vehicle?.startsWith('bike-')) {
        assert.ok(rider?.pedalErrors.every(error => error < .035), 'rider feet detach from moving pedals');
        assert.ok(rider?.gripErrors.every(error => error < .015), 'rider hands detach from the handlebar');
      }
      const dom = await page.evaluate(() => ({ canvas: [...document.querySelectorAll('canvas')].map(c => ({ width: c.width, height: c.height, calls: c.dataset.drawCalls })), width: innerWidth, scroll: document.documentElement.scrollWidth }));
      assert.equal(dom.canvas.length, 1); assert.ok(dom.canvas[0].width > 0); assert.ok(dom.scroll <= dom.width + 1);
      report.captures.push({ name, file, sanity, state, dom, rider });
      await page.evaluate(() => window.liuzhouTest.manual(false));
    };
    await fixture({ x: 0, z: 0, y: 180 }, true);
    assert.ok((await trace('flight-forward', ['w'])).distance > 5);
    await trace('flight-boost-climb', ['w', 'Shift', 'Space']);
    await trace('flight-slow-turn', ['w', 'q', 'd']);
    await trace('flight-descend', ['c']);
    await capture('01-flight');
    const car = { id: 'car-1', kind: 'car', x: 128, z: 290, y: BRIDGE_HEIGHT, angle: 0, speed: 0, color: '#ceb78a' };
    await fixture({ x: 125.5, z: 290, y: BRIDGE_HEIGHT }, false, car);
    assert.ok((await trace('car-accelerating', ['w'])).distance > 1);
    await trace('car-braking', ['Space']);
    if (!baseline) {
      await trace('car-reversing', ['s']);
      await trace('car-steering', ['w', 'd']);
    }
    await capture('02-car');
    if (!baseline) {
      const bike = { ...car, id: 'bike-1', kind: 'bike', color: '#76b7ad' };
      await fixture({ x: 126, z: 290, y: BRIDGE_HEIGHT }, false, bike);
      assert.ok((await trace('bicycle-accelerating', ['w'])).distance > .5);
      await capture('03-bicycle');
      await fixture({ x: -628, z: -650, y: terrainTriangleHeight({ x: -628, z: -650 }) });
      await page.evaluate(() => { window.liuzhouTest.rig.yaw = Math.PI; window.liuzhouTest.rig.dragged = performance.now(); });
      assert.ok((await trace('ordinary-walk', ['w'])).distance > .5);
      await trace('run-and-jump', ['w', 'Shift', 'Space']);
      await capture('04-walk-jump');
      await page.keyboard.press('Escape');
      const frozen = await page.evaluate(() => window.liuzhouTest.rig.motion());
      await page.evaluate(() => new Promise(resolve => { let n = 0; const next = () => ++n === 8 ? resolve() : requestAnimationFrame(next); requestAnimationFrame(next); }));
      assert.deepEqual(await page.evaluate(() => window.liuzhouTest.rig.motion()), frozen);
      await page.keyboard.press('Escape');
      await page.setViewportSize({ width: 390, height: 844 });
      await trace('portrait-walk', ['w']); await capture('05-portrait');
    } else {
      for (const name of ['flight-forward', 'car-accelerating']) {
        const check = report.checks.find(c => c.name === name);
        assert.ok(check.maxHorizontalError > .05, `${name}: expected to reproduce stale transforms`);
      }
    }
    assert.deepEqual(report.errors, []); report.passed = true;
  } finally { await browser.close(); fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
