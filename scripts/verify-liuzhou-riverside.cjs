const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, file);
const { terrainTriangleHeight } = require('../src/components/liuzhou/terrainMesh.ts');
const layout = require('../src/components/liuzhou/riverside-layout.json');
const { quietContext } = require('./lib/liuzhou-test-browser.cjs');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd(), path.join(require('node:os').homedir(), '.codex/skills/develop-web-game')] }));
const base = process.env.LIUZHOU_BASE_URL || 'http://127.0.0.1:4133';
const out = process.env.LIUZHOU_QA_DIR || '.tmp/liuzhou-riverside-dev';
const report = { passed: false, errors: [], checks: [], captures: [] };
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
    const ready = () => page.waitForFunction(() => typeof window.render_game_to_text === 'function' && ![...document.querySelectorAll('button')].find(b => b.textContent.includes('自由巡览 · 快速飞行'))?.disabled, { timeout: 120000 });
    await page.goto(`${base}/game/liuzhou?test=1`); await ready();
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
    const player = () => page.evaluate(() => ({ ...window.liuzhouTest.game.player }));
    const view = async (yaw, pitch, zoom) => page.evaluate(({ yaw, pitch, zoom }) => Object.assign(window.liuzhouTest.rig, { yaw, pitch, zoom, reset: true, dragged: performance.now() }), { yaw, pitch, zoom });
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
      const p = await player(); assert.ok(Math.abs(p.y - terrainTriangleHeight(p)) < .3, JSON.stringify(p)); return p;
    };
    await takeoff(); await go([-500, 650], true);
    await view(0, .7, 105); await capture('01-jiangbin-restored-boundary'); await land();
    for (const p of [[-500, 650], [-350, 625], [-100, 620], [50, 580], [160, 580]]) await go(p);
    await view(-Math.PI / 2, .12, 12); await capture('02-jiangbin-walk-below-bridge');
    report.checks.push({ name: 'ordinary grass exploration across restored source Jiangbin park, no invented path axis', player: await player() });
    await takeoff(); const liudi = layout.paths.find(p => p.sourceId === '1524324802').points.slice(3, 13);
    await go([-900, 260], true); await view(Math.PI / 2, .85, 95); await capture('03-liudi-restored-boundary');
    await go(liudi[0], true); await land();
    for (const p of liudi.slice(1)) await go(p);
    await view(-Math.PI / 2, .15, 13); await capture('04-liudi-source-promenade');
    for (const p of liudi.slice(0, -1).reverse()) await go(p);
    report.checks.push({ name: 'ordinary round trip along the archived Liudi riverbank footway segment', player: await player() });
    const end = await player(); await page.reload(); await ready();
    await page.evaluate(() => window.liuzhouTest.manual(true)); await page.getByRole('button', { name: '自由巡览 · 快速飞行 ↗' }).click();
    const restored = await player(); assert.ok(Math.hypot(restored.x - end.x, restored.z - end.z) < .3);
    await page.setViewportSize({ width: 390, height: 844 }); await capture('05-mobile-restored-riverside');
    report.checks.push({ name: 'ordinary save restoration and mobile layout', end, restored });
    assert.deepEqual(report.errors, []); report.passed = true;
  } finally { await browser.close(); fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
