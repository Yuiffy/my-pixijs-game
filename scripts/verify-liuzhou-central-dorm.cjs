const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, file);
const source = require('../src/components/liuzhou/city-map.json');
const { terrainTriangleHeight } = require('../src/components/liuzhou/terrainMesh.ts');
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd(), path.join(require('node:os').homedir(), '.codex/skills/develop-web-game')] }));
const { quietContext } = require('./lib/liuzhou-test-browser.cjs');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const base = process.env.LIUZHOU_BASE_URL || 'http://127.0.0.1:4133';
const out = process.env.LIUZHOU_QA_DIR || '.tmp/liuzhou-central-dorm-dev';
const report = { passed: false, errors: [], checks: [], captures: [] };
(async () => {
  assert.equal((await fetch(`${base}/game/liuzhou`, { signal: AbortSignal.timeout(60000) })).status, 200);
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--disable-speech-api'] });
  try {
    const context = await quietContext(browser, { viewport: { width: 1440, height: 900 } });
    await context.route(/https:\/\/(pagead2\.googlesyndication\.com|hm\.baidu\.com)\//, r => r.fulfill({ body: '' }));
    const page = await context.newPage();
    page.on('pageerror', e => report.errors.push(e.message));
    page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
    const enter = async () => {
      await page.waitForFunction(() => typeof window.render_game_to_text === 'function' && ![...document.querySelectorAll('button')].find(b => b.textContent.includes('自由巡览 · 快速飞行'))?.disabled, { timeout: 120000 });
      await page.evaluate(() => window.liuzhouTest.manual(true));
      await page.getByRole('button', { name: '自由巡览 · 快速飞行 ↗' }).click();
      await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).loading.complete, null, { timeout: 120000 });
    };
    await page.goto(`${base}/game/liuzhou?test=1`); await enter();
    const view = (yaw, pitch, zoom) => page.evaluate(v => Object.assign(window.liuzhouTest.rig, { ...v, reset: true, dragged: performance.now() }), { yaw, pitch, zoom });
    const capture = async name => {
      await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
      const file = path.join(out, `${name}.png`); const sanity = inspectPng(await page.screenshot({ path: file, fullPage: true }));
      const state = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
      const dom = await page.evaluate(() => ({ canvas: [...document.querySelectorAll('canvas')].map(c => ({ width: c.width, height: c.height })), width: innerWidth, scroll: document.documentElement.scrollWidth }));
      assert.equal(dom.canvas.length, 1); assert.ok(dom.canvas[0].width >= dom.width); assert.ok(dom.scroll <= dom.width + 1); assert.ok(state.loading.complete);
      report.captures.push({ name, file, sanity, state, dom }); console.log(`captured ${name}`);
    };
    const go = async ([x, z], flying = false) => {
      let previous = Infinity; let still = 0;
      for (let chunk = 0; chunk < 100; chunk++) {
        const result = await page.evaluate(({ x, z, flying }) => {
          const t = window.liuzhouTest; const p = t.game.player; const distance = Math.hypot(x - p.x, z - p.z);
          t.rig.yaw = Math.atan2(x - p.x, z - p.z); t.rig.dragged = performance.now();
          if (distance > (flying ? 4 : .13)) {
            const fast = flying && distance > 90; const pace = flying ? fast ? 160 : 55 : 4.4;
            t.move({ forward: 1, sprint: fast }, Math.max(1, Math.min(75, Math.floor((distance - (flying ? 3 : .06)) / pace * 60))));
          }
          return { distance, player: { ...t.game.player }, flight: t.game.flight.active, grounded: t.game.locomotion.grounded };
        }, { x, z, flying });
        if (!flying) {
          assert.equal(result.flight, false);
          assert.ok(Math.abs(result.player.y - terrainTriangleHeight(result.player)) < .4, JSON.stringify(result));
        }
        if (result.distance < (flying ? 5 : .18)) return;
        still = Math.abs(previous - result.distance) < .015 ? still + 1 : 0; previous = result.distance;
        assert.ok(still < 4, `stuck toward ${x},${z}: ${JSON.stringify(result)}`);
      }
      assert.fail(`route did not reach ${x},${z}`);
    };
    const lane = source.roads.find(r => r.id === '205519389').points;
    const riverRoad = source.roads.find(r => r.id === '205519383').points.slice(4, 7);
    await page.keyboard.press('f'); await page.evaluate(() => window.liuzhouTest.move({ jump: true }, 170));
    await go([-1280, -320], true); await view(-.35, .85, 60); await capture('01-source-dorm-overview');
    await go(lane[0], true); await page.evaluate(() => window.liuzhouTest.move({ descend: true }, 1000)); await page.keyboard.press('f'); await go(lane[0]);
    for (const p of lane) await go(p);
    for (const p of lane.slice().reverse()) await go(p);
    report.checks.push({ name: 'complete Linjiang source lane ordinary walking roundtrip', sourceId: '205519389', points: lane });
    await go(lane[1]); await view(-.35, .13, 14); await capture('02-linjiang-frontage'); await go(lane[0]);
    for (const p of riverRoad) await go(p);
    await view(1.3, .15, 16); await capture('03-binjiang-frontage');
    for (const p of riverRoad.slice().reverse()) await go(p);
    await go(lane[0]); report.checks.push({ name: 'Binjiang frontage three source vertices ordinary walking roundtrip', sourceId: '205519383', points: riverRoad });
    const end = await page.evaluate(() => ({ ...window.liuzhouTest.game.player }));
    await page.reload(); await enter();
    const restored = await page.evaluate(() => ({ ...window.liuzhouTest.game.player }));
    assert.ok(Math.hypot(restored.x - end.x, restored.z - end.z) < .3); assert.ok(Math.abs(restored.y - end.y) < .3);
    await page.setViewportSize({ width: 390, height: 844 }); await view(1.05, .18, 11); await capture('04-mobile-restored');
    assert.deepEqual(report.errors, []); report.passed = true;
  } finally { await browser.close(); fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
