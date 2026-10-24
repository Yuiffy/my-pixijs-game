const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, file);
const { stationPoint, stationLocal, stationRoofHeight } = require('../src/components/liuzhou/station.ts');
const { terrainTriangleHeight } = require('../src/components/liuzhou/terrainMesh.ts');
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd(), path.join(require('node:os').homedir(), '.codex/skills/develop-web-game')] }));
const { quietContext } = require('./lib/liuzhou-test-browser.cjs');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const base = process.env.LIUZHOU_BASE_URL || 'http://127.0.0.1:4133';
const out = process.env.LIUZHOU_QA_DIR || '.tmp/liuzhou-station-dev';
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
    page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
    const enter = async () => {
      await page.waitForFunction(() => typeof window.render_game_to_text === 'function' && ![...document.querySelectorAll('button')].find(b => b.textContent.includes('自由巡览 · 快速飞行'))?.disabled, { timeout: 90000 });
      await page.evaluate(() => window.liuzhouTest.manual(true));
      await page.getByRole('button', { name: '自由巡览 · 快速飞行 ↗' }).click();
    };
    const player = () => page.evaluate(() => ({ ...window.liuzhouTest.game.player }));
    const capture = async name => {
      await page.evaluate(() => window.liuzhouTest.move({}, 30));
      await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
      const file = path.join(out, `${name}.png`); const sanity = inspectPng(await page.screenshot({ path: file, fullPage: true }));
      const state = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
      const dom = await page.evaluate(() => ({ canvas: [...document.querySelectorAll('canvas')].map(c => ({ width: c.width, height: c.height })), width: innerWidth, scroll: document.documentElement.scrollWidth }));
      assert.equal(dom.canvas.length, 1); assert.ok(dom.canvas[0].width > 0); assert.ok(dom.scroll <= dom.width + 1);
      report.captures.push({ name, file, sanity, state, dom }); console.log(`captured ${name}`);
    };
    const eastYaw = Math.atan2(-0.8429608032, -0.5379749847);
    const view = async (yaw = eastYaw, pitch = 0.12, zoom = 12) => page.evaluate(({ yaw, pitch, zoom }) => Object.assign(window.liuzhouTest.rig, { yaw, pitch, zoom, reset: true, dragged: performance.now() }), { yaw, pitch, zoom });
    const go = async (target, flying = false) => {
      let previous = Infinity; let still = 0;
      for (let chunk = 0; chunk < 130; chunk++) {
        const gap = await page.evaluate(({ target, flying }) => {
          const t = window.liuzhouTest; const p = t.game.player; const gap = Math.hypot(target.x - p.x, target.z - p.z);
          t.rig.yaw = Math.atan2(target.x - p.x, target.z - p.z); t.rig.dragged = performance.now();
          if (gap > (flying ? 4 : 0.13)) {
            const fast = flying && gap > 90; const pace = flying ? fast ? 160 : 55 : 4.4;
            t.move({ forward: 1, sprint: fast }, Math.max(1, Math.min(75, Math.floor((gap - (flying ? 3 : 0.06)) / pace * 60))));
          }
          return gap;
        }, { target, flying });
        if (gap < (flying ? 5 : 0.18)) return;
        still = Math.abs(previous - gap) < 0.015 ? still + 1 : 0; previous = gap;
        assert.ok(still < 4, `movement stuck toward ${JSON.stringify(target)}, at ${JSON.stringify(await player())}`);
      }
      assert.fail(`route did not reach ${JSON.stringify(target)}`);
    };
    await page.goto(`${base}/game/liuzhou?test=1`); await enter();
    await page.keyboard.press('f'); await page.evaluate(() => window.liuzhouTest.move({ jump: true, sprint: true }, 270));
    await go(stationPoint(0, 340), true);
    await page.evaluate(() => window.liuzhouTest.move({ descend: true }, 285));
    await view(eastYaw, 0.32, 110); await capture('01-station-east-overview');
    await go(stationPoint(50, 245), true); await page.evaluate(() => window.liuzhouTest.move({ descend: true }, 1100)); await page.keyboard.press('f');
    await page.evaluate(() => window.liuzhouTest.move({}, 60));
    const landed = await player(); assert.ok(Math.abs(landed.y - terrainTriangleHeight(landed)) < 0.25, JSON.stringify(landed));
    report.checks.push({ name: 'normal flight from core to east plaza', player: landed });
    await view(eastYaw, 0.1, 11); await capture('02-east-plaza-ground');
    await go(stationPoint(40, 242)); await page.keyboard.press('e');
    assert.equal(await page.evaluate(() => window.liuzhouTest.game.dialogue?.name), '歇脚旅客');
    await capture('02a-plaza-neighbour');
    for (let i = 0; i < 5 && await page.evaluate(() => !!window.liuzhouTest.game.dialogue); i++) await page.keyboard.press('e');
    await go(stationPoint(0, 245)); await go(stationPoint(0, 168));
    await view(eastYaw, -0.12, 22); await capture('03-east-entrance-canopy');
    await go(stationPoint(65, 168)); await view(eastYaw, 0.18, 14); await capture('04-east-wing-frontage');
    await go(stationPoint(65, 245)); await go(stationPoint(100, 245));
    await view(eastYaw + 0.45, 0.16, 12); await capture('05-plaza-benches');
    const end = await player(); assert.ok(stationLocal(end).along > 99);
    await page.reload(); await enter(); const restored = await player();
    assert.ok(Math.hypot(end.x - restored.x, end.z - restored.z) < 0.3); assert.ok(Math.abs(end.y - restored.y) < 0.3);
    report.checks.push({ name: 'east plaza ordinary walking and reload', player: restored });
    await page.keyboard.press('f'); await page.evaluate(() => window.liuzhouTest.move({ jump: true }, 230));
    await go(stationPoint(0, 0), true); await view(eastYaw + Math.PI / 2, 0.4, 90); await capture('06-cross-track-concourse-platforms');
    await go(stationPoint(0, -240), true); await view(eastYaw + Math.PI, 0.3, 85); await capture('07-west-station');
    await page.setViewportSize({ width: 390, height: 844 }); await view(eastYaw + Math.PI, 0.22, 35); await capture('08-mobile-west-station');
    await page.setViewportSize({ width: 1440, height: 900 });
    await go(stationPoint(0, 110), true); await page.evaluate(() => window.liuzhouTest.move({ descend: true }, 500));
    await page.keyboard.press('f'); await page.evaluate(() => window.liuzhouTest.move({}, 60));
    const rooftop = await player(); assert.ok(Math.abs(rooftop.y - stationRoofHeight(rooftop)) < 0.2);
    await page.reload(); await enter(); const roofRestored = await player();
    assert.ok(Math.hypot(rooftop.x - roofRestored.x, rooftop.z - roofRestored.z) < 0.3); assert.ok(Math.abs(rooftop.y - roofRestored.y) < 0.3);
    await view(eastYaw + Math.PI / 2, 0.2, 28); await capture('09-sloping-roof-restored');
    const residents = await page.evaluate(() => window.liuzhouTest.game.npcs.filter(n => n.id.startsWith('station-')));
    assert.equal(residents.length, 4); assert.ok(residents.filter(n => n.routine).every(n => n.routine.odometer > 30));
    report.checks.push({ name: 'real sloping rooftop landing and reload; plaza residents persisted', rooftop, roofRestored, residents });
    assert.deepEqual(report.errors, []); report.passed = true;
  } finally { await browser.close(); fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
