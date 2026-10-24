const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, file);
const { SQUARE_RESIDENTS } = require('../src/components/liuzhou/square.ts');
const { CITY_BUILDINGS } = require('../src/components/liuzhou/city.ts');
const { buildingElevation } = require('../src/components/liuzhou/world.ts');
const { terrainTriangleHeight } = require('../src/components/liuzhou/terrainMesh.ts');
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd(), path.join(require('node:os').homedir(), '.codex/skills/develop-web-game')] }));
const { quietContext } = require('./lib/liuzhou-test-browser.cjs');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const base = process.env.LIUZHOU_BASE_URL || 'http://127.0.0.1:4133';
const out = process.env.LIUZHOU_QA_DIR || '.tmp/liuzhou-square-dev';
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
    await page.keyboard.press('f'); await page.evaluate(() => window.liuzhouTest.move({ jump: true, sprint: true }, 270));
    await go({ x: -576, z: -650 }, true);
    await page.evaluate(() => { window.liuzhouTest.move({ descend: true }, 540); window.liuzhouTest.move({}, 50); });
    await view(Math.PI, 0.7, 120); await capture('01-square-overview');
    await go({ x: -576, z: -560 }, true); await page.evaluate(() => window.liuzhouTest.move({ descend: true }, 1100)); await page.keyboard.press('f');
    const landed = await page.evaluate(() => ({ ...window.liuzhouTest.game.player }));
    assert.ok(Math.abs(landed.y - terrainTriangleHeight(landed)) < 0.2); report.checks.push({ name: 'flew from core and landed normally', player: landed });
    await go({ x: -576, z: -585 }); await view(Math.PI, 0.15, 14); await capture('02-south-approach');
    await go({ x: -586, z: -621 }); await view(Math.PI / 2, 0.62, 14); await capture('02b-source-fountain-footprint');
    await go({ x: -576, z: -621 }); await view(Math.PI, 0.55, 6); await capture('02c-inactive-fountain-outlets');
    const fountain = await page.evaluate(() => ({ ...window.liuzhouTest.game.player, grounded: window.liuzhouTest.game.locomotion.grounded }));
    assert.ok(fountain.grounded); assert.ok(Math.abs(fountain.y - terrainTriangleHeight(fountain)) < 0.2);
    report.checks.push({ name: 'ordinary walking over inactive flush fountain, following existing terrain', player: fountain });
    await go({ x: -576, z: -700 }); await view(Math.PI, 0.8, 6); await capture('03-surname-bronze-panels');
    await go({ x: -576, z: -730 }); await view(Math.PI, 0.08, 13); await capture('04-square-north-skyline');
    await go({ x: -530, z: -730 }); await go({ x: -530, z: -890 }); await go({ x: -685, z: -890 });
    await go({ x: -685, z: -842 }); await go({ x: -674, z: -842 });
    await view(-Math.PI / 2, 0.35, 22); await capture('05-culture-centre-facade');
    await go({ x: -685, z: -842 });
    await go({ x: -685, z: -765 }); await go({ x: -628, z: -765 }); await go({ x: -628, z: -580 });
    await view(Math.PI, 0.2, 11); await capture('06-shaded-promenade');
    await go({ x: -576, z: -580 }); await go({ x: -576, z: -690 });
    const neighbour = SQUARE_RESIDENTS.find(n => n.id === 'square-neighbour');
    await page.keyboard.press('e'); assert.equal(await page.evaluate(() => window.liuzhouTest.game.dialogue?.name), neighbour.name); await capture('07-square-conversation');
    for (let i = 0; i < 6 && await page.evaluate(() => !!window.liuzhouTest.game.dialogue); i++) await page.keyboard.press('e');
    await go({ x: -530, z: -690 }); await go({ x: -478, z: -764 });
    await view(Math.PI, 0.08, 12); await capture('08-museum-exterior');
    const end = await page.evaluate(() => ({ ...window.liuzhouTest.game.player }));
    await page.reload(); await page.waitForFunction(() => typeof window.render_game_to_text === 'function' && ![...document.querySelectorAll('button')].find(b => b.textContent.includes('自由巡览 · 快速飞行'))?.disabled, { timeout: 90000 });
    await page.evaluate(() => window.liuzhouTest.manual(true)); await page.getByRole('button', { name: '自由巡览 · 快速飞行 ↗' }).click();
    const restored = await page.evaluate(() => ({ ...window.liuzhouTest.game.player })); assert.ok(Math.hypot(restored.x - end.x, restored.z - end.z) < 0.3); assert.ok(Math.abs(restored.y - end.y) < 0.3);
    await page.setViewportSize({ width: 390, height: 844 }); await capture('09-mobile-restored'); await page.setViewportSize({ width: 1440, height: 900 });
    await page.keyboard.press('f'); await page.evaluate(() => window.liuzhouTest.move({ jump: true, sprint: true }, 480));
    const tower = CITY_BUILDINGS.find(b => b.id === 'city-osm-899710004');
    await go(tower, true); await page.evaluate(() => window.liuzhouTest.move({ descend: true }, 600)); await page.keyboard.press('f');
    const roof = await page.evaluate(() => ({ ...window.liuzhouTest.game.player })); assert.ok(Math.abs(roof.y - buildingElevation(tower) - 311) < 0.2); report.checks.push({ name: 'source height tower roof flight landing', player: roof });
    await view(0.1, 0.9, 28); await capture('10-tower-roof-view');
    await page.keyboard.press('f'); await page.evaluate(() => window.liuzhouTest.move({ jump: true }, 80));
    await go({ x: -527, z: -973 }, true); await page.evaluate(() => window.liuzhouTest.move({ descend: true }, 1000)); await page.keyboard.press('f');
    await view(Math.PI, 0.05, 10); await capture('11-tower-podium-south-seam');
    await page.keyboard.press('f'); await page.evaluate(() => window.liuzhouTest.move({ jump: true }, 180));
    await go({ x: -580, z: -973 }, true); await go({ x: -580, z: -1023 }, true);
    await page.evaluate(() => window.liuzhouTest.move({ descend: true }, 600)); await page.keyboard.press('f');
    await view(Math.PI / 2, 0.05, 10); await capture('12-tower-podium-west-seam');
    const residents = await page.evaluate(() => window.liuzhouTest.game.npcs.filter(n => n.id.startsWith('square-')));
    assert.equal(residents.length, 4); assert.ok(residents.filter(n => n.routine).every(n => n.routine.odometer > 30)); report.checks.push({ name: 'square residents advance and reload', residents });
    assert.deepEqual(report.errors, []); report.passed = true;
  } finally { await browser.close(); fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
