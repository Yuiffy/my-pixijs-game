const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, file);
const { XIHUAN_BUS, XIHUAN_RESIDENTS } = require('../src/components/liuzhou/xihuan.ts');
const layout = require('../src/components/liuzhou/xihuan-layout.json');
const { terrainTriangleHeight } = require('../src/components/liuzhou/terrainMesh.ts');
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd(), path.join(require('node:os').homedir(), '.codex/skills/develop-web-game')] }));
const { quietContext } = require('./lib/liuzhou-test-browser.cjs');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const base = process.env.LIUZHOU_BASE_URL || 'http://127.0.0.1:4133';
const out = process.env.LIUZHOU_QA_DIR || '.tmp/liuzhou-xihuan-dev';
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
    await page.waitForFunction(() => typeof window.render_game_to_text === 'function' && [...document.querySelectorAll('button')].some(b => b.textContent.includes('自由巡览 · 快速飞行') && !b.disabled), null, { timeout: 120000 });
    await page.evaluate(() => window.liuzhouTest.manual(true));
    await page.getByRole('button', { name: '自由巡览 · 快速飞行 ↗' }).click();
    await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).loading.complete, null, { timeout: 120000 });
    const capture = async name => {
      await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
      const file = path.join(out, `${name}.png`); const sanity = inspectPng(await page.screenshot({ path: file, fullPage: true }));
      const state = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
      const dom = await page.evaluate(() => ({ canvas: [...document.querySelectorAll('canvas')].map(c => ({ width: c.width, height: c.height, calls: c.dataset.drawCalls })), width: innerWidth, scroll: document.documentElement.scrollWidth }));
      assert.equal(dom.canvas.length, 1); assert.ok(dom.canvas[0].width > 0); assert.ok(dom.scroll <= dom.width + 1);
      assert.ok(state.loading.complete, 'Scene remounted or was not completely loaded at capture');
      assert.ok(dom.canvas[0].width >= dom.width, 'Canvas remounted to its 300px default size');
      report.captures.push({ name, file, sanity, state, dom }); console.log(`captured ${name}`);
    };
    const view = async (yaw, pitch = 0.12, zoom = 12) => page.evaluate(({ yaw, pitch, zoom }) => Object.assign(window.liuzhouTest.rig, { yaw, pitch, zoom, reset: true, dragged: performance.now() }), { yaw, pitch, zoom });
    const go = async (target, flying = false) => {
      let previous = Infinity; let still = 0;
      for (let chunk = 0; chunk < 100; chunk++) {
        const gap = await page.evaluate(({ target, flying }) => {
          const t = window.liuzhouTest; const p = t.game.player; const distance = Math.hypot(target.x - p.x, target.z - p.z);
          t.rig.yaw = Math.atan2(target.x - p.x, target.z - p.z); t.rig.dragged = performance.now();
          if (distance > (flying ? 4 : 0.13)) {
            const fast = flying && distance > 90; const pace = flying ? fast ? 160 : 55 : 4.4;
            t.move({ forward: 1, sprint: fast }, Math.max(1, Math.min(75, Math.floor((distance - (flying ? 3 : 0.06)) / pace * 60))));
          }
          return distance;
        }, { target, flying });
        if (gap < (flying ? 5 : 0.18)) return;
        still = Math.abs(previous - gap) < 0.015 ? still + 1 : 0; previous = gap;
        assert.ok(still < 4, `movement stuck toward ${JSON.stringify(target)} at gap ${gap}`);
      }
      assert.fail(`route did not reach ${JSON.stringify(target)}`);
    };
    if (process.env.LIUZHOU_XIHUAN_FACADES_ONLY === '1') {
      await page.keyboard.press('f'); await page.evaluate(() => window.liuzhouTest.move({ jump: true, sprint: true }, 270));
      await go({ x: -3442, z: -473 }, true);
      await page.evaluate(() => window.liuzhouTest.move({ descend: true }, 1000));
      await view(0, 0.3, 55); await capture('10-industrial-source-frontage');
      await page.evaluate(() => window.liuzhouTest.move({ jump: true }, 160));
      await go({ x: -3380, z: -395 }, true);
      await page.evaluate(() => window.liuzhouTest.move({ descend: true }, 1000));
      await view(-1.2, 0.25, 50); await capture('11-industrial-source-row');
      report.checks.push({ name: 'source industrial facade scenery', sourceIds: layout.frontages.filter(b => b.kind === 'industrial').map(b => b.id) });
      assert.deepEqual(report.errors, []); report.passed = true;
      return;
    }
    const busFront = { x: XIHUAN_BUS.x - 0.5, z: XIHUAN_BUS.z + 1.4 };
    await page.keyboard.press('f'); await page.evaluate(() => window.liuzhouTest.move({ jump: true, sprint: true }, 270));
    await go(busFront, true);
    await page.evaluate(() => { window.liuzhouTest.move({}, 120); window.liuzhouTest.move({ descend: true }, 500); });
    await view(2.6, 0.9, 130); await capture('01-junction-overview');
    await page.evaluate(() => window.liuzhouTest.move({ descend: true }, 1100)); await page.keyboard.press('f');
    const landed = await page.evaluate(() => ({ ...window.liuzhouTest.game.player }));
    assert.ok(Math.abs(landed.y - terrainTriangleHeight(landed)) < 0.25);
    await go({ x: XIHUAN_RESIDENTS[0].x - 2, z: XIHUAN_RESIDENTS[0].z + 1.5 });
    await view(-0.55, 0.12, 9); await capture('02-bus-pavement');
    await page.keyboard.press('e');
    assert.equal(await page.evaluate(() => window.liuzhouTest.game.dialogue?.name), XIHUAN_RESIDENTS[0].name);
    await capture('03-waiting-neighbour');
    for (let i = 0; i < 6 && await page.evaluate(() => !!window.liuzhouTest.game.dialogue); i++) await page.keyboard.press('e');
    const route = async points => { for (const [x, z] of points) await go({ x, z }); };
    await route([[-3364, -775.7], [-3260, -708], [-3234, -694]]);
    await view(0.7, 0.35, 16); await capture('04-west-crosswalk');
    await route([[-3238.783, -687.1], [-3245.875, -676.959], [-3250, -670], [-3280, -632]]);
    await view(-1.5, 0.13, 12); await capture('05-school-boundary');
    await route([[-3254, -657], [-3247.194, -649.853], [-3240.173, -639.611], [-3234, -633], [-3218, -635], [-3210, -628]]);
    const neighbour = XIHUAN_RESIDENTS[1];
    await go({ x: neighbour.x - 0.3, z: neighbour.z - 2.3 });
    await view(-0.4, 0.2, 10); await capture('06-residential-pavement');
    await page.keyboard.press('e'); assert.equal(await page.evaluate(() => window.liuzhouTest.game.dialogue?.name), neighbour.name);
    for (let i = 0; i < 6 && await page.evaluate(() => !!window.liuzhouTest.game.dialogue); i++) await page.keyboard.press('e');
    await route([[-3210, -628], [-3218, -635], [-3210.588, -640.769], [-3199.843, -647.07], [-3194, -650], [-3189, -661], [-3186, -674], [-3193.989, -677.694], [-3202.086, -685.141], [-3208, -690]]);
    await view(-1.4, 0.2, 16); await capture('07-four-road-junction');
    const end = await page.evaluate(() => ({ ...window.liuzhouTest.game.player }));
    assert.ok(!await page.evaluate(() => window.liuzhouTest.game.flight.active));
    const visited = new Set(['2061501700', '4747427531', '12364604169', '12364604170', '4747427530', '4747426608', '8154491246', '8154491236']);
    report.checks.push({ name: 'ordinary walking across all four source crossing arms, roadside conversations', landed, end, visitedCrossingIds: layout.crossings.filter(c => visited.has(c.id)).map(c => c.id) });
    await page.reload(); await page.waitForFunction(() => typeof window.render_game_to_text === 'function' && [...document.querySelectorAll('button')].some(b => b.textContent.includes('自由巡览 · 快速飞行') && !b.disabled), null, { timeout: 120000 });
    await page.evaluate(() => window.liuzhouTest.manual(true)); await page.getByRole('button', { name: '自由巡览 · 快速飞行 ↗' }).click();
    await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).loading.complete, null, { timeout: 120000 });
    const restored = await page.evaluate(() => ({ ...window.liuzhouTest.game.player }));
    assert.ok(Math.hypot(restored.x - end.x, restored.z - end.z) < 0.3); assert.ok(Math.abs(restored.y - end.y) < 0.3);
    await page.setViewportSize({ width: 390, height: 844 }); await capture('08-mobile-restored');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.keyboard.press('f'); await page.evaluate(() => window.liuzhouTest.move({ jump: true }, 180));
    await go({ x: -3460, z: -655 }, true);
    await page.evaluate(() => window.liuzhouTest.move({ descend: true }, 300));
    await view(-0.4, 0.95, 120); await capture('09-estimated-campus-courts');
    assert.deepEqual(report.errors, []); report.passed = true;
  } finally { await browser.close(); fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
