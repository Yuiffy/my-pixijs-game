const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, file);
const layout = require('../src/components/liuzhou/central-layout.json');
const { terrainTriangleHeight } = require('../src/components/liuzhou/terrainMesh.ts');
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd(), path.join(require('node:os').homedir(), '.codex/skills/develop-web-game')] }));
const { quietContext } = require('./lib/liuzhou-test-browser.cjs');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const base = process.env.LIUZHOU_BASE_URL || 'http://127.0.0.1:4133';
const out = process.env.LIUZHOU_QA_DIR || '.tmp/liuzhou-north-parcels-dev';
const yaruOnly = process.env.LIUZHOU_PARCEL_ROUTE === 'wangjia';
const inspectionParcels = yaruOnly ? layout.parcels.filter(p => ['relation-21296846', 'school-205663282'].includes(p.id)) : layout.parcels.slice(8);
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
    await page.goto(`${base}/game/liuzhou?test=1`);
    await page.waitForFunction(() => typeof window.render_game_to_text === 'function' && ![...document.querySelectorAll('button')].find(b => b.textContent.includes('自由巡览 · 快速飞行'))?.disabled, { timeout: 90000 });
    await page.evaluate(() => window.liuzhouTest.manual(true));
    await page.getByRole('button', { name: '自由巡览 · 快速飞行 ↗' }).click();
    const capture = async name => {
      await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
      const file = path.join(out, `${name}.png`); const sanity = inspectPng(await page.screenshot({ path: file, fullPage: true }));
      const state = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
      const dom = await page.evaluate(() => ({ canvas: [...document.querySelectorAll('canvas')].map(c => ({ width: c.width, height: c.height, calls: c.dataset.drawCalls })), width: innerWidth, scroll: document.documentElement.scrollWidth }));
      assert.equal(dom.canvas.length, 1); assert.ok(dom.canvas[0].width > 0); assert.ok(dom.scroll <= dom.width + 1);
      report.captures.push({ name, file, sanity, state, dom }); console.log(`captured ${name}`);
    };
    const view = async (yaw, pitch = 0.12, zoom = 12) => page.evaluate(({ yaw, pitch, zoom }) => Object.assign(window.liuzhouTest.rig, { yaw, pitch, zoom, reset: true, dragged: performance.now() }), { yaw, pitch, zoom });
    const player = () => page.evaluate(() => ({ ...window.liuzhouTest.game.player }));
    const go = async (point, flying = false) => {
      let previous = Infinity; let still = 0;
      for (let chunk = 0; chunk < 250; chunk++) {
        const gap = await page.evaluate(({ point, flying }) => {
          const t = window.liuzhouTest; const p = t.game.player; const d = Math.hypot(point[0] - p.x, point[1] - p.z);
          t.rig.yaw = Math.atan2(point[0] - p.x, point[1] - p.z); t.rig.dragged = performance.now();
          if (d > 0.3) {
            const fast = flying && d > 130; const precise = flying && d < 60;
            const pace = flying ? fast ? 160 : precise ? 6 : 55 : 4.4;
            t.move({ forward: 1, sprint: fast, precise }, Math.max(1, Math.min(75, Math.floor((d - 0.12) / pace * 60))));
          }
          return d;
        }, { point, flying });
        if (gap < 0.3) return;
        still = Math.abs(previous - gap) < 0.015 ? still + 1 : 0; previous = gap;
        assert.ok(still < 6, `movement stuck ${JSON.stringify({ point, gap, flying, player: await player() })}`);
      }
      assert.fail(`route did not reach ${JSON.stringify(point)}`);
    };
    const route = async points => { for (const point of points) await go(point); };
    const takeoff = async () => {
      await page.keyboard.press('f');
      assert.equal(await page.evaluate(() => window.liuzhouTest.game.flight.active), true);
      await page.evaluate(() => window.liuzhouTest.move({ jump: true }, 150));
    };
    const land = async () => {
      await page.evaluate(() => window.liuzhouTest.move({ descend: true }, 600)); await page.keyboard.press('f');
      assert.equal(await page.evaluate(() => window.liuzhouTest.game.flight.active), false);
      const p = await player();
      assert.ok(Math.abs(p.y - terrainTriangleHeight(p)) < 0.3, JSON.stringify(p));
      return p;
    };
    // Each new parcel is reached through normal flight inputs, then inspected
    // from outside its named fence. No player coordinate or save fixture writes.
    for (const [i, parcel] of inspectionParcels.entries()) {
      const label = layout.labels.find(l => l.parcelId === parcel.id);
      const normal = [Math.sin(label.angle), Math.cos(label.angle)];
      const outside = [label.at[0] + normal[0] * 4, label.at[1] + normal[1] * 4];
      await takeoff(); await go(outside, true);
      if (yaruOnly || i % 2 === 0) {
        await view(label.angle + Math.PI, 0.8, 55); await capture(`${String(i + 1).padStart(2, '0')}-parcel-${parcel.id}-overview`);
      }
      const landed = await land();
      await view(label.angle + Math.PI, 0.12, 7); await capture(`${String(i + 1).padStart(2, '0')}-parcel-${parcel.id}-nameplate`);
      report.checks.push({ parcel: parcel.id, name: parcel.name, label, landed, travelledByNormalInput: true });
    }
    if (yaruOnly) {
      await takeoff(); await go(layout.walkRoutes['wangjia-west'].points[0], true); await land();
      await route(layout.walkRoutes['wangjia-west'].points);
      await view(-Math.PI / 2, 0.15, 10); await capture('03-wangjia-school-frontage-walked');
      await route(layout.walkRoutes['wangjia-east'].points);
      await view(Math.PI, 0.15, 10); await capture('04-wangjia-housing-lane-walked');
      await route(layout.walkRoutes['wangjia-east'].points.slice().reverse());
      await route(layout.walkRoutes['wangjia-west'].points.slice().reverse());
      report.checks.push({ name: 'ordinary round trip along both archived Wangjia Lane axes, beside source school hole', end: await player() });
    } else {
      await takeoff(); await go(layout.walkRoutes.bayi.points[0], true); await land();
    await route(layout.walkRoutes.square.points);
    await route(layout.walkRoutes.guangya.points);
    await view(-1.5, 0.18, 12); await capture('09-guangya-west-frontage-walked');
    await route(layout.walkRoutes.guangya.points.slice().reverse());
    await route(layout.walkRoutes.square.points.slice().reverse());
    await route(layout.walkRoutes.bayi.points.slice(0, 4));
    await view(-1.6, 0.12, 12); await capture('10-bayi-apartment-frontage-walked');
    await route(layout.walkRoutes.bayi.points.slice(4)); await route(layout.walkRoutes.yuejin.points);
      await go([-735, -2020]); await view(Math.PI / 2, 0.15, 9); await capture('11-walked-into-east-lane-market');
    }
    const end = await player();
    assert.ok(Math.abs(end.y - terrainTriangleHeight(end)) < 0.3);
    assert.equal(await page.evaluate(() => window.liuzhouTest.game.flight.active), false);
    if (!yaruOnly) report.checks.push({ name: 'continuous ordinary walking: Guangya frontage round trip, Bayi, Yuejin and East Lane market', end });
    await page.reload();
    await page.waitForFunction(() => typeof window.render_game_to_text === 'function' && ![...document.querySelectorAll('button')].find(b => b.textContent.includes('自由巡览 · 快速飞行'))?.disabled, { timeout: 90000 });
    await page.evaluate(() => window.liuzhouTest.manual(true)); await page.getByRole('button', { name: '自由巡览 · 快速飞行 ↗' }).click();
    const restored = await player();
    assert.ok(Math.hypot(restored.x - end.x, restored.z - end.z) < 0.3); assert.ok(Math.abs(restored.y - end.y) < 0.3);
    await page.setViewportSize({ width: 390, height: 844 }); await view(Math.PI / 2, 0.15, 9); await capture(yaruOnly ? '05-mobile-restored-wangjia' : '12-mobile-restored-market');
    assert.equal(report.checks.filter(c => c.parcel).length, inspectionParcels.length);
    assert.deepEqual(report.errors, []); report.passed = true;
  } finally { await browser.close(); fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
