const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, file);
const { riversideGroundHeight, RIVERSIDE_DETAIL_BAY_IDS } = require('../src/components/liuzhou/riversideDetail.ts');
const layout = require('../src/components/liuzhou/riverside-detail-layout.json');
const { quietContext } = require('./lib/liuzhou-test-browser.cjs');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd(), path.join(require('node:os').homedir(), '.codex/skills/develop-web-game')] }));
const base = process.env.LIUZHOU_BASE_URL || 'http://127.0.0.1:4133';
const out = process.env.LIUZHOU_QA_DIR || '.tmp/liuzhou-riverside-detail-dev';
const report = { passed: false, errors: [], checks: [], captures: [] };
(async () => {
  assert.equal((await fetch(`${base}/game/liuzhou`, { signal: AbortSignal.timeout(120000) })).status, 200);
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: process.env.LIUZHOU_QA_HEADED !== '1', args: ['--mute-audio', '--disable-speech-api'] });
  try {
    const context = await quietContext(browser, { viewport: { width: 1440, height: 900 } });
    await context.route(/https:\/\/(pagead2\.googlesyndication\.com|hm\.baidu\.com)\//, r => r.fulfill({ body: '' }));
    const page = await context.newPage();
    page.on('pageerror', e => report.errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
    const ready = () => page.waitForFunction(() => typeof window.render_game_to_text === 'function' && ![...document.querySelectorAll('button')].find(b => b.textContent.includes('自由巡览 · 快速飞行'))?.disabled, null, { timeout: 120000 });
    await page.goto(`${base}/game/liuzhou?test=1`); await ready();
    await page.evaluate(() => window.liuzhouTest.manual(true));
    await page.getByRole('button', { name: '自由巡览 · 快速飞行 ↗' }).click();
    const player = () => page.evaluate(() => ({ ...window.liuzhouTest.game.player }));
    const view = async (yaw, pitch, zoom) => page.evaluate(({ yaw, pitch, zoom }) => Object.assign(window.liuzhouTest.rig, { yaw, pitch, zoom, reset: true, dragged: performance.now() }), { yaw, pitch, zoom });
    const capture = async name => {
      await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
      const file = path.join(out, `${name}.png`); const sanity = inspectPng(await page.screenshot({ path: file, fullPage: true }));
      assert.ok(sanity.nearBlackRatio < .9 && sanity.darkRatio < .95, JSON.stringify(sanity));
      const state = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
      const dom = await page.evaluate(() => ({ canvas: [...document.querySelectorAll('canvas')].map(c => ({ width: c.width, height: c.height, calls: c.dataset.drawCalls })), width: innerWidth, scroll: document.documentElement.scrollWidth }));
      assert.equal(dom.canvas.length, 1); assert.ok(dom.canvas[0].width > 0); assert.ok(dom.scroll <= dom.width + 1);
      report.captures.push({ name, file, sanity, state, dom }); console.log(`captured ${name}`);
    };
    const go = async (point, flying = false) => {
      let previous = Infinity; let still = 0;
      for (let chunk = 0; chunk < 180; chunk++) {
        const gap = await page.evaluate(({ point, flying }) => {
          const t = window.liuzhouTest; const p = t.game.player; const d = Math.hypot(point[0] - p.x, point[1] - p.z);
          t.rig.yaw = Math.atan2(point[0] - p.x, point[1] - p.z); t.rig.dragged = performance.now();
          if (d > .3) {
            const fast = flying && d > 130; const precise = flying && d < 60; const pace = flying ? fast ? 160 : precise ? 6 : 55 : 4.4;
            t.move({ forward: 1, sprint: fast, precise }, Math.max(1, Math.min(75, Math.floor((d - .12) / pace * 60))));
          }
          return d;
        }, { point, flying });
        if (gap < .3) return;
        still = Math.abs(previous - gap) < .015 ? still + 1 : 0; previous = gap;
        assert.ok(still < 6, `stuck ${JSON.stringify({ point, gap, player: await player() })}`);
      }
      assert.fail(`unreached ${JSON.stringify(point)}`);
    };
    const takeoff = async () => { await page.keyboard.press('f'); await page.evaluate(() => window.liuzhouTest.move({ jump: true }, 190)); };
    const land = async () => {
      await page.evaluate(() => window.liuzhouTest.move({ descend: true }, 700)); await page.keyboard.press('f');
      await page.evaluate(() => window.liuzhouTest.move({}, 40));
      const p = await player(); assert.ok(Math.abs(p.y - riversideGroundHeight(p)) < .3, JSON.stringify(p));
    };
    const bays = layout.restBays.filter(b => RIVERSIDE_DETAIL_BAY_IDS.includes(b.id));
    const first = bays.find(b => b.chainage === 540); assert.ok(first);
    await takeoff(); await go(first.route[0], true); await land(); await view(-.7, .65, 58); await capture('01-liudi-riverbank-rail-overview');
    await go(first.route[1]); await view(-.7, .18, 10); await capture('02-rest-bay-level-bench');
    await go(first.route[0]);
    let distance = 0;
    const sourcePoints = layout.sourcePath.points.map((point, i, arr) => {
      if (i) distance += Math.hypot(point[0] - arr[i - 1][0], point[1] - arr[i - 1][1]);
      return { point, distance };
    });
    let previous = first.chainage;
    for (const bay of bays.filter(b => b.chainage > first.chainage && b.chainage <= 750)) {
      for (const p of sourcePoints.filter(p => p.distance > previous && p.distance < bay.chainage)) await go(p.point);
      await go(bay.route[0]); await go(bay.route[1]); await go(bay.route[0]); previous = bay.chainage;
    }
    await view(-.5, .22, 17); await capture('03-ordinary-promenade-and-rest-approaches');
    report.checks.push({ name: 'ordinary source-footway walk and three rest-bay approaches, without teleportation', player: await player() });
    // Walk from the path towards a solid rail, then return along the same
    // approach. The rail must stop the player before its river-facing side.
    const rail = layout.rails.find(r => r.chainage === 748);
    if (rail) {
      const mid = [(rail.a[0] + rail.b[0]) / 2, (rail.a[1] + rail.b[1]) / 2];
      const start = await player(); const dx = mid[0] - start.x; const dz = mid[1] - start.z; const length = Math.hypot(dx, dz);
      await page.evaluate(({ dx, dz }) => { const t = window.liuzhouTest; t.rig.yaw = Math.atan2(dx, dz); t.move({ forward: 1 }, 160); }, { dx, dz });
      const stopped = await player();
      assert.ok(Math.hypot(stopped.x - mid[0], stopped.z - mid[1]) > .28);
      const tx = rail.b[0] - rail.a[0]; const tz = rail.b[1] - rail.a[1]; const span = Math.hypot(tx, tz);
      const side = p => ((p.x - mid[0]) * -tz + (p.z - mid[1]) * tx) / span;
      assert.ok(side(stopped) * Math.sign(side(start)) > .28, JSON.stringify({ start, stopped, mid, sideStart: side(start), sideStopped: side(stopped) }));
      await go([start.x, start.z]); report.checks.push({ name: 'rail blocks outward walking and permits ordinary return', start, stopped, mid });
    }
    const end = await player(); await page.reload(); await ready();
    await page.evaluate(() => window.liuzhouTest.manual(true)); await page.getByRole('button', { name: '自由巡览 · 快速飞行 ↗' }).click();
    const restored = await player(); assert.ok(Math.hypot(restored.x - end.x, restored.z - end.z) < .3);
    await page.setViewportSize({ width: 390, height: 844 }); await capture('04-mobile-riverside-restored');
    report.checks.push({ name: 'ordinary save restoration and mobile layout', end, restored });
    assert.deepEqual(report.errors, []); report.passed = true;
  } finally { await browser.close(); fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
