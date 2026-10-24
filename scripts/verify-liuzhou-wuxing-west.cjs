const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd(), path.join(require('node:os').homedir(), '.codex/skills/develop-web-game')] }));
const { quietContext } = require('./lib/liuzhou-test-browser.cjs');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const layout = require('../src/components/liuzhou/wuxing-layout.json');
const ts = require('typescript');
const previousLoader = require.extensions['.ts'];
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, f);
const { terrainTriangleHeight } = require('../src/components/liuzhou/terrainMesh.ts');
if (previousLoader) require.extensions['.ts'] = previousLoader; else delete require.extensions['.ts'];
const base = process.env.LIUZHOU_BASE_URL || 'http://127.0.0.1:4133';
const out = process.env.LIUZHOU_QA_DIR || '.tmp/liuzhou-wuxing-west-dev';
const frontagesOnly = process.env.LIUZHOU_FRONTAGES_ONLY === '1';
const report = { passed: false, scope: frontagesOnly ? 'hotel and mall exterior rendering only' : 'full west frontage and ordinary walking tour', errors: [], checks: [], captures: [] };
(async () => {
  assert.equal((await fetch(`${base}/game/liuzhou`, { signal: AbortSignal.timeout(120000) })).status, 200);
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--disable-speech-api'] });
  try {
    const context = await quietContext(browser, { viewport: { width: 1440, height: 900 } });
    await context.route(/https:\/\/(pagead2\.googlesyndication\.com|hm\.baidu\.com)\//, r => r.fulfill({ body: '' }));
    const page = await context.newPage();
    page.on('pageerror', e => report.errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
    const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
    const enter = async () => {
      await page.waitForFunction(() => typeof window.render_game_to_text === 'function' && [...document.querySelectorAll('button')].some(b => b.textContent.includes('自由巡览 · 快速飞行') && !b.disabled), null, { timeout: 120000 });
      await page.evaluate(() => window.liuzhouTest.manual(true));
      await page.getByRole('button', { name: '自由巡览 · 快速飞行 ↗' }).click();
      await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).loading.complete, null, { timeout: 120000 });
    };
    const view = async (yaw, pitch = .2, zoom = 12) => page.evaluate(v => Object.assign(window.liuzhouTest.rig, { ...v, reset: true, dragged: performance.now() }), { yaw, pitch, zoom });
    const capture = async name => {
      await page.evaluate(() => window.liuzhouTest.move({}, 45));
      await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
      const file = path.join(out, `${name}.png`);
      const sanity = inspectPng(await page.screenshot({ path: file, fullPage: true }));
      const dom = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, canvas: [...document.querySelectorAll('canvas')].map(c => ({ width: c.width, height: c.height, calls: c.dataset.drawCalls })) }));
      assert.equal(dom.canvas.length, 1); assert.ok(Number(dom.canvas[0].calls) > 0); assert.ok(dom.scroll <= dom.width + 1);
      report.captures.push({ name, file, sanity, dom, state: await state() }); console.log(`captured ${name}`);
    };
    const go = async ([x, z], flying = false) => {
      let previous = Infinity; let still = 0;
      for (let chunk = 0; chunk < 130; chunk++) {
        const gap = await page.evaluate(({ x, z, flying }) => {
          const t = window.liuzhouTest; const p = t.game.player; const gap = Math.hypot(x - p.x, z - p.z);
          t.rig.yaw = Math.atan2(x - p.x, z - p.z); t.rig.dragged = performance.now();
          const tolerance = flying ? 3 : .06;
          if (gap > tolerance) {
            const fast = flying && gap > 90; const pace = flying ? fast ? 160 : 55 : 4.4;
            t.move({ forward: 1, sprint: fast }, Math.max(1, Math.min(70, Math.floor((gap - tolerance) / pace * 60))));
          }
          return gap;
        }, { x, z, flying });
        if (gap < (flying ? 5 : .18)) return;
        still = Math.abs(previous - gap) < .015 ? still + 1 : 0; previous = gap;
        assert.ok(still < 4, `stuck ${JSON.stringify({ target: [x, z], gap, state: await state() })}`);
      }
      assert.fail(`did not reach ${x},${z}`);
    };
    const route = async points => { for (const point of points) await go(point); };
    const altitude = async y => {
      for (let i = 0; i < 35; i++) {
        const current = (await state()).player.y; const gap = y - current;
        if (Math.abs(gap) < .4) break;
        await page.evaluate(({ gap }) => window.liuzhouTest.move({ jump: gap > 0, descend: gap < 0, precise: true }, Math.max(1, Math.min(180, Math.floor(Math.abs(gap) / 4 * 60)))), { gap });
      }
      await page.evaluate(() => window.liuzhouTest.move({}, 90));
      assert.ok(Math.abs((await state()).player.y - y) < 1, `altitude ${y}`);
    };
    const fly = async point => {
      if (!(await state()).flight.active) await page.keyboard.press('f');
      await altitude(95);
      await go(point, true);
      await page.evaluate(() => window.liuzhouTest.move({}, 90));
    };
    const land = async point => {
      await fly(point);
      await page.evaluate(() => window.liuzhouTest.move({ descend: true }, 1400));
      await page.keyboard.press('f'); await go(point);
      await page.evaluate(() => window.liuzhouTest.move({}, 45));
      const s = await state(); assert.equal(s.flight.active, false); assert.ok(s.locomotion.grounded);
    };
    await page.goto(`${base}/game/liuzhou?test=1`, { waitUntil: 'commit' }); await enter();
    if (!frontagesOnly) { await fly([-525, -65]); await view(.2, .85, 95); await capture('01-west-overview'); }
    for (const [id, name] of [['205654183', 'huaqiao'], ['205654194', 'jubao'], ['205654205', 'gongmao'], ['1275168866', 'hotel'], ['1275168894', 'fengqinggang']]) {
      if (frontagesOnly && !['1275168866', '1275168894'].includes(id)) continue;
      const fronts = layout.facades.filter(f => f.buildingId === id).sort((a, b) => Math.hypot(b.b[0] - b.a[0], b.b[1] - b.a[1]) - Math.hypot(a.b[0] - a.a[0], a.b[1] - a.a[1]));
      assert.ok(fronts.length, id); const f = fronts[0];
      const point = [(f.a[0] + f.b[0]) / 2 + f.outward[0] * 18, (f.a[1] + f.b[1]) / 2 + f.outward[1] * 18];
      await fly(point); await altitude(terrainTriangleHeight({ x: point[0], z: point[1] }) + 9);
      await view(Math.atan2(-f.outward[0], -f.outward[1]), .1, 16); await capture(`source-${name}`);
      report.checks.push({ name: `source frontage ${id}`, position: (await state()).player });
    }
    if (frontagesOnly) { assert.deepEqual(report.errors, []); report.passed = true; return; }
    for (const [name, r] of Object.entries(layout.westWalkRoutes)) {
      await land(r.points[0]); await route(r.points); await route(r.points.slice().reverse());
      await view(Math.atan2(r.points[1][0] - r.points[0][0], r.points[1][1] - r.points[0][1]), .18, 10); await capture(`route-${name}`);
      report.checks.push({ name: `full ordinary round trip ${name}`, state: await state() });
    }
    for (const a of layout.shopApproaches) {
      await land(a.points[0]); await route(a.points);
      const f = layout.facades.find(f => f.id === a.facadeId);
      await view(Math.atan2(-f.outward[0], -f.outward[1]), .16, 8); await capture(a.buildingId);
      await route(a.points.slice().reverse()); report.checks.push({ name: `ordinary approach and return ${a.buildingId}`, state: await state() });
    }
    const end = (await state()).player;
    await page.reload({ waitUntil: 'commit' }); await enter();
    const restored = (await state()).player;
    assert.ok(Math.hypot(restored.x - end.x, restored.z - end.z) < .3); assert.ok(Math.abs(restored.y - end.y) < .3);
    await page.setViewportSize({ width: 390, height: 844 }); await capture('15-mobile-restored');
    assert.deepEqual(report.errors, []); report.passed = true;
  } finally { await browser.close(); fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); }
})().catch(e => { console.error(e); process.exitCode = 1; });
