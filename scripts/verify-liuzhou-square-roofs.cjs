const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, file);
const { SQUARE_ROOF_BUILDINGS } = require('../src/components/liuzhou/square.ts');
const { terrainTriangleHeight } = require('../src/components/liuzhou/terrainMesh.ts');
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd(), path.join(require('node:os').homedir(), '.codex/skills/develop-web-game')] }));
const { quietContext } = require('./lib/liuzhou-test-browser.cjs');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const base = process.env.LIUZHOU_BASE_URL || 'http://127.0.0.1:4133';
const out = process.env.LIUZHOU_QA_DIR || '.tmp/liuzhou-square-roofs';
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
      await page.waitForFunction(() => { const s = JSON.parse(window.render_game_to_text()); return s.phase === 'playing' && s.loading.complete; }, { timeout: 120000 });
    };
    await page.goto(`${base}/game/liuzhou?test=1`); await enter();
    const capture = async name => {
      await page.waitForFunction(() => { const s = JSON.parse(window.render_game_to_text()); return s.phase === 'playing' && s.loading.complete; }, { timeout: 120000 });
      await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
      const file = path.join(out, `${name}.png`); const sanity = inspectPng(await page.screenshot({ path: file, fullPage: true }));
      const state = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
      const dom = await page.evaluate(() => ({ canvas: [...document.querySelectorAll('canvas')].map(c => ({ width: c.width, height: c.height, calls: c.dataset.drawCalls })), width: innerWidth, scroll: document.documentElement.scrollWidth }));
      assert.equal(dom.canvas.length, 1); assert.ok(dom.canvas[0].width > 0); assert.ok(dom.scroll <= dom.width + 1); assert.ok(state.loading.complete);
      report.captures.push({ name, file, sanity, state, dom }); console.log(`captured ${name}`);
    };
    const view = async (yaw, pitch = .12, zoom = 12) => page.evaluate(({ yaw, pitch, zoom }) => Object.assign(window.liuzhouTest.rig, { yaw, pitch, zoom, reset: true, dragged: performance.now() }), { yaw, pitch, zoom });
    const go = async (target, flying = false) => {
      let previous = Infinity; let still = 0;
      for (let chunk = 0; chunk < 100; chunk++) {
        const gap = await page.evaluate(({ target, flying }) => {
          const t = window.liuzhouTest, p = t.game.player, distance = Math.hypot(target.x - p.x, target.z - p.z);
          t.rig.yaw = Math.atan2(target.x - p.x, target.z - p.z); t.rig.dragged = performance.now();
          if (distance > (flying ? 4 : .13)) {
            const fast = flying && distance > 90, pace = flying ? fast ? 160 : 55 : 4.4;
            t.move({ forward: 1, sprint: fast }, Math.max(1, Math.min(75, Math.floor((distance - (flying ? 3 : .06)) / pace * 60))));
          }
          return distance;
        }, { target, flying });
        if (gap < (flying ? 5 : .18)) return;
        still = Math.abs(previous - gap) < .015 ? still + 1 : 0; previous = gap;
        assert.ok(still < 4, `movement stuck toward ${JSON.stringify(target)} at gap ${gap}`);
      }
      assert.fail(`route did not reach ${JSON.stringify(target)}`);
    };
    const ground = async name => {
      await page.evaluate(() => window.liuzhouTest.move({}, 30));
      const p = await page.evaluate(() => ({ ...window.liuzhouTest.game.player, grounded: window.liuzhouTest.game.locomotion.grounded }));
      assert.ok(p.grounded); assert.ok(Math.abs(p.y - terrainTriangleHeight(p)) < .2);
      report.checks.push({ name, player: p }); return p;
    };
    await page.keyboard.press('f'); await page.evaluate(() => window.liuzhouTest.move({ jump: true, sprint: true }, 180));
    await go({ x: -709, z: -972 }, true); await page.evaluate(() => window.liuzhouTest.move({ descend: true }, 900)); await page.keyboard.press('f'); await ground('landed normally at north retail forecourt');
    await view(Math.PI, .7, 65); await capture('01-mall-source-frontage-context');
    await go({ x: -709, z: -985.6 }); await go({ x: -639, z: -985.6 }); const before = await ground('walked underneath the southern source roof');
    await view(-Math.PI / 2, .08, 11); await capture('02-south-roof-public-walkway');
    await page.reload(); await enter(); const restored = await ground('current ground save reload stays under the roof');
    assert.ok(Math.hypot(restored.x - before.x, restored.z - before.z) < .2);
    await page.setViewportSize({ width: 390, height: 844 }); await view(-Math.PI / 2, .08, 8); await capture('03-mobile-under-roof-restored'); await page.setViewportSize({ width: 1440, height: 900 });
    await go({ x: -639, z: -973 }); await page.keyboard.press('f'); await page.evaluate(() => window.liuzhouTest.move({ jump: true }, 130));
    await go({ x: -762, z: -1006 }, true); await page.evaluate(() => window.liuzhouTest.move({ descend: true }, 650)); await page.keyboard.press('f'); await ground('landed outside west source roof');
    await go({ x: -750, z: -1006 }); await go({ x: -750, z: -1043 }); await ground('walked underneath the west source roof');
    await view(Math.PI, .08, 10); await capture('04-west-roof-public-walkway');
    await go({ x: -762, z: -1043 }); await page.keyboard.press('f'); await page.evaluate(() => window.liuzhouTest.move({ jump: true }, 140));
    const roof = SQUARE_ROOF_BUILDINGS.find(b => b.sourceId === '899710008');
    await go(roof, true); await page.evaluate(() => window.liuzhouTest.move({ descend: true }, 650)); await page.keyboard.press('f'); await page.evaluate(() => window.liuzhouTest.move({}, 45));
    const top = await page.evaluate(() => ({ ...window.liuzhouTest.game.player, grounded: window.liuzhouTest.game.locomotion.grounded })); assert.ok(top.grounded); assert.ok(Math.abs(top.y - roof.baseY - roof.h) < .2);
    report.checks.push({ name: 'west source roof supports normal flight landing', player: top });
    await view(.5, .6, 22); await capture('05-west-roof-solid-top');
    assert.deepEqual(report.errors, []); report.passed = true;
  } finally { await browser.close(); fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); }
})().catch(e => { console.error(e); process.exitCode = 1; });
