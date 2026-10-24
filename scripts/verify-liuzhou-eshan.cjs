const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, f);
const { ESHAN_ENTRANCE } = require('../src/components/liuzhou/eshan.ts');
const { terrainTriangleHeight } = require('../src/components/liuzhou/terrainMesh.ts');
const layout = require('../src/components/liuzhou/eshan-layout.json');
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd(), path.join(require('node:os').homedir(), '.codex/skills/develop-web-game')] }));
const { quietContext } = require('./lib/liuzhou-test-browser.cjs');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const base = process.env.LIUZHOU_BASE_URL || 'http://127.0.0.1:4133';
const out = process.env.LIUZHOU_QA_DIR || '.tmp/liuzhou-eshan-dev';
const report = { passed: false, errors: [], checks: [], captures: [] };
(async () => {
  assert.equal((await fetch(`${base}/game/liuzhou`, { signal: AbortSignal.timeout(60000) })).status, 200);
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--disable-speech-api'] });
  try {
    const context = await quietContext(browser, { viewport: { width: 1440, height: 900 } });
    await context.route(/https:\/\/(pagead2\.googlesyndication\.com|hm\.baidu\.com)\//, r => r.fulfill({ body: '' }));
    const page = await context.newPage();
    page.on('pageerror', e => report.errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
    const enter = async () => {
      await page.waitForFunction(() => typeof window.render_game_to_text === 'function' && ![...document.querySelectorAll('button')].find(b => b.textContent.includes('自由巡览 · 快速飞行'))?.disabled, { timeout: 90000 });
      await page.evaluate(() => window.liuzhouTest.manual(true)); await page.getByRole('button', { name: '自由巡览 · 快速飞行 ↗' }).click();
    };
    const player = () => page.evaluate(() => ({ ...window.liuzhouTest.game.player }));
    const view = async (yaw, pitch = 0.1, zoom = 12) => page.evaluate(({ yaw, pitch, zoom }) => Object.assign(window.liuzhouTest.rig, { yaw, pitch, zoom, reset: true, dragged: performance.now() }), { yaw, pitch, zoom });
    const capture = async name => {
      await page.evaluate(() => window.liuzhouTest.move({}, 30)); await page.waitForTimeout(250);
      await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
      const file = path.join(out, `${name}.png`); const sanity = inspectPng(await page.screenshot({ path: file, fullPage: true }));
      const state = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
      const dom = await page.evaluate(() => ({ canvas: [...document.querySelectorAll('canvas')].map(c => ({ width: c.width, height: c.height, draws: c.dataset.drawCalls })), width: innerWidth, scroll: document.documentElement.scrollWidth }));
      assert.equal(dom.canvas.length, 1); assert.ok(dom.canvas[0].width > 0); assert.ok(dom.scroll <= dom.width + 1);
      report.captures.push({ name, file, sanity, state, dom }); console.log(`captured ${name}`);
    };
    const go = async (target, flying = false) => {
      let previous = Infinity; let still = 0;
      for (let chunk = 0; chunk < 130; chunk++) {
        const gap = await page.evaluate(({ target, flying }) => {
          const t = window.liuzhouTest; const p = t.game.player; const gap = Math.hypot(target.x - p.x, target.z - p.z);
          t.rig.yaw = Math.atan2(target.x - p.x, target.z - p.z); t.rig.dragged = performance.now();
          if (gap > (flying ? 4 : 0.16)) {
            const fast = flying && gap > 90; const pace = flying ? fast ? 160 : 55 : 4.4;
            t.move({ forward: flying ? 1 : Math.min(1, gap * 1.5), sprint: fast }, Math.max(1, Math.min(75, Math.floor((gap - (flying ? 3 : 0.07)) / pace * 60))));
          }
          return gap;
        }, { target, flying });
        if (gap < (flying ? 5 : 0.19)) return;
        still = Math.abs(previous - gap) < 0.012 ? still + 1 : 0; previous = gap;
        if (still >= 5) { await capture('failure-stuck'); assert.fail(`stuck toward ${JSON.stringify(target)} at ${JSON.stringify(await player())}`); }
      }
      assert.fail(`did not reach ${JSON.stringify(target)}`);
    };
    const points = id => layout.paths.find(r => r.sourceId === id).points.map(p => ({ x: p[0], z: p[1] }));
    await page.goto(`${base}/game/liuzhou?test=1`); await enter();
    await page.keyboard.press('f'); await page.evaluate(() => window.liuzhouTest.move({ jump: true, sprint: true }, 270));
    await go({ x: ESHAN_ENTRANCE.x + 6, z: ESHAN_ENTRANCE.z }, true); await view(-1.7, 0.3, 90); await capture('01-forest-and-source-park');
    await page.evaluate(() => window.liuzhouTest.move({ descend: true }, 950)); await page.keyboard.press('f'); await page.evaluate(() => window.liuzhouTest.move({}, 60));
    const landed = await player(); assert.ok(Math.abs(landed.y - terrainTriangleHeight(landed)) < 0.3); await view(-1.7, 0.02, 11); await capture('02-east-entrance');
    for (const p of points('1071650451')) await go(p);
    await view(-1.7, 0.1, 10); await capture('03-forest-promenade');
    for (const p of points('945999802').slice(1, 8)) await go(p);
    const climb = points('1071650447'); const junction = climb.findIndex(p => Math.abs(p.x + 3272.213) < 0.01);
    await view(-2.3, -0.1, 10); await capture('04-climbing-route-entry');
    for (let i = 1; i <= junction; i++) { await go(climb[i]); if (i === 19) { await view(2.1, 0.08, 10); await capture('05-hairpin-and-handrails'); } }
    for (const p of points('1071650442').slice(1, 9)) await go(p);
    const top = await player(); assert.ok(top.y > 165); assert.equal(await page.evaluate(() => window.liuzhouTest.game.flight.active), false);
    await view(0.5, 0.35, 18); await capture('06-summit-and-station-view');
    await page.reload(); await enter(); const restored = await player(); assert.ok(Math.hypot(top.x - restored.x, top.z - restored.z) < 0.25); assert.ok(Math.abs(top.y - restored.y) < 0.25);
    await view(-1.6, 0.1, 14); await capture('07-summit-shelter-restored');
    // Follow the mapped bends back from the summit before approaching the
    // resident. A straight shortcut leaves the trail above its retaining edge.
    for (const p of points('1071650442').slice(2, 8).reverse()) await go(p);
    await go({ x: -3250, z: -82.6 }); await page.keyboard.press('e'); assert.equal(await page.evaluate(() => window.liuzhouTest.game.dialogue?.name), '登山的游人');
    await capture('08-hillside-neighbour');
    for (let i = 0; i < 5 && await page.evaluate(() => !!window.liuzhouTest.game.dialogue); i++) await page.keyboard.press('e');
    await go(points('1071650442')[1]); await go(climb[junction]);
    for (const p of climb.slice(0, junction).reverse()) await go(p);
    const lower = points('1071650449').slice(11, 19);
    for (const p of lower) await go(p);
    await view(-0.4, 0.1, 12); await capture('09-lower-garden-shelter');
    await page.setViewportSize({ width: 390, height: 844 }); await view(-0.4, 0.03, 10); await capture('10-mobile-woodland');
    assert.equal((await page.evaluate(() => window.liuzhouTest.game.npcs.filter(n => n.id.startsWith('eshan-')).length)), 2);
    report.checks.push({ name: 'normal flight, on-foot ascent/descent, summit save reload, neighbour, lower garden and mobile', landed, top, restored, end: await player() });
    assert.deepEqual(report.errors, []); report.passed = true;
  } finally { await browser.close(); fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
