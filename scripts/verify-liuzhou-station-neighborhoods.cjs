const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, f);
const layout = require('../src/components/liuzhou/station-neighborhood-layout.json');
const { terrainTriangleHeight } = require('../src/components/liuzhou/terrainMesh.ts');
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd(), path.join(require('node:os').homedir(), '.codex/skills/develop-web-game')] }));
const { quietContext } = require('./lib/liuzhou-test-browser.cjs');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const base = process.env.LIUZHOU_BASE_URL || 'http://127.0.0.1:4135';
const out = process.env.LIUZHOU_QA_DIR || '.tmp/liuzhou-station-neighborhood-dev';
const onlyRoute = process.env.LIUZHOU_TOUR;
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
      await page.waitForFunction(() => typeof window.render_game_to_text === 'function' && [...document.querySelectorAll('button')].some(b => b.textContent.includes('自由巡览 · 快速飞行') && !b.disabled), null, { timeout: 90000 });
      await page.evaluate(() => window.liuzhouTest.manual(true));
      await page.getByRole('button', { name: '自由巡览 · 快速飞行 ↗' }).click();
      await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).loading.complete, null, { timeout: 90000 });
    };
    const player = () => page.evaluate(() => ({ ...window.liuzhouTest.game.player }));
    const view = async (yaw, pitch = .12, zoom = 10) => page.evaluate(({ yaw, pitch, zoom }) => Object.assign(window.liuzhouTest.rig, { yaw, pitch, zoom, reset: true, dragged: performance.now() }), { yaw, pitch, zoom });
    const capture = async name => {
      await page.evaluate(() => window.liuzhouTest.move({}, 30));
      await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
      const file = path.join(out, `${name}.png`); const sanity = inspectPng(await page.screenshot({ path: file, fullPage: true }));
      const state = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
      const dom = await page.evaluate(() => ({ canvas: [...document.querySelectorAll('canvas')].map(c => ({ width: c.width, height: c.height, calls: c.dataset.drawCalls })), width: innerWidth, scroll: document.documentElement.scrollWidth }));
      assert.equal(dom.canvas.length, 1); assert.ok(Number(dom.canvas[0].calls) > 0); assert.ok(dom.scroll <= dom.width + 1);
      report.captures.push({ name, file, sanity, state, dom }); console.log(`captured ${name}`);
    };
    const go = async (point, flying = false) => {
      let previous = Infinity; let still = 0;
      for (let chunk = 0; chunk < 250; chunk++) {
        const gap = await page.evaluate(({ point, flying }) => {
          const t = window.liuzhouTest; const p = t.game.player; const gap = Math.hypot(point[0] - p.x, point[1] - p.z);
          t.rig.yaw = Math.atan2(point[0] - p.x, point[1] - p.z); t.rig.dragged = performance.now();
          if (gap > .22) {
            const sprint = flying && gap > 130; const precise = flying && gap < 60;
            const pace = flying ? sprint ? 160 : precise ? 6 : 55 : 4.4;
            t.move({ forward: 1, sprint, precise }, Math.max(1, Math.min(75, Math.floor((gap - .1) / pace * 60))));
          }
          return gap;
        }, { point, flying });
        if (gap < .25) return;
        still = Math.abs(previous - gap) < .015 ? still + 1 : 0; previous = gap;
        assert.ok(still < 5, JSON.stringify({ target: point, flying, player: await player(), state: await page.evaluate(() => JSON.parse(window.render_game_to_text())) }));
      }
      assert.fail(`did not reach ${point}`);
    };
    const takeoff = async () => {
      await page.keyboard.press('f'); assert.equal(await page.evaluate(() => window.liuzhouTest.game.flight.active), true);
      await page.evaluate(() => window.liuzhouTest.move({ jump: true }, 200));
    };
    const land = async () => {
      await page.evaluate(() => window.liuzhouTest.move({ descend: true }, 650));
      await page.keyboard.press('f'); await page.evaluate(() => window.liuzhouTest.move({}, 60));
      assert.equal(await page.evaluate(() => window.liuzhouTest.game.flight.active), false);
      const p = await player(); assert.ok(Math.abs(p.y - terrainTriangleHeight(p)) < .3, JSON.stringify(p)); return p;
    };
    await page.goto(`${base}/game/liuzhou?test=1`); await enter();
    // Normal flight and ground inputs only: no player coordinates or save
    // fixtures are written to reach the six newly enclosed source parcels.
    for (const [i, parcel] of (onlyRoute ? [] : layout.parcels).entries()) {
      const label = layout.labels.find(l => l.parcelId === parcel.id);
      const outside = [label.at[0] + Math.sin(label.angle) * 4, label.at[1] + Math.cos(label.angle) * 4];
      await takeoff(); await go(outside, true);
      if (i === 0 || i === 3) { await view(label.angle + Math.PI, 1.15, 50); await capture(`${i + 1}a-parcel-${parcel.id}-overview`); }
      const landed = await land();
      await view(label.angle + Math.PI, .12, 7); await capture(`${i + 1}b-parcel-${parcel.id}-street`);
      report.checks.push({ name: parcel.name || 'source commercial parcel', parcel: parcel.id, landed, inputTravel: true });
    }
    // Each entire source-road offset is walked in both directions; four
    // representative street-level views complement the six nameplate views.
    for (const [name, route] of Object.entries(layout.walkRoutes)) {
      if (onlyRoute && onlyRoute !== name) continue;
      await takeoff(); await go(route.points[0], true); await land();
      for (const point of route.points) await go(point);
      if (['egang-north', 'feie', 'nanzhan-south', 'south-blocks-east'].includes(name)) {
        await view(name === 'nanzhan-south' ? Math.PI / 2 : -Math.PI / 2, .15, 12);
        await capture(`07-walked-${name}`);
      }
      for (const point of route.points.slice().reverse()) await go(point);
      const end = await player(); assert.ok(Math.abs(end.y - terrainTriangleHeight(end)) < .3);
      assert.equal(await page.evaluate(() => window.liuzhouTest.game.flight.active), false);
      report.checks.push({ name: `ordinary round trip: ${name}`, sourceId: route.sourceId, end });
      console.log(`walked both directions: ${name}`);
    }
    const end = await player(); await page.reload(); await enter(); const restored = await player();
    assert.ok(Math.hypot(end.x - restored.x, end.z - restored.z) < .3); assert.ok(Math.abs(end.y - restored.y) < .3);
    await page.setViewportSize({ width: 390, height: 844 }); await view(Math.PI / 2, .12, 9); await capture('08-mobile-restored-station-neighborhood');
    report.checks.push({ name: 'ground save restores after neighborhood touring; phone viewport', end, restored });
    assert.deepEqual(report.errors, []); report.passed = true;
  } finally { await browser.close(); fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); }
})().catch(e => { console.error(e); process.exitCode = 1; });
