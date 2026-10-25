const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, file);
const { guangyaPoint, GUANGYA_HEIGHT, GUANGYA_WALK_OFFSET } = require('../src/components/liuzhou/guangya.ts');
const { BRIDGE_AXES, BRIDGE_HEIGHT } = require('../src/components/liuzhou/bridges.ts');
const layout = require('../src/components/liuzhou/guangya-layout.json');
const { quietContext } = require('./lib/liuzhou-test-browser.cjs');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd(), path.join(require('node:os').homedir(), '.codex/skills/develop-web-game')] }));
const base = process.env.LIUZHOU_BASE_URL || 'http://127.0.0.1:4133';
const out = process.env.LIUZHOU_QA_DIR || '.tmp/liuzhou-bridge-appearance-dev';
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
    const ready = async () => {
      await page.waitForFunction(() => typeof window.render_game_to_text === 'function' && ![...document.querySelectorAll('button')].find(b => b.textContent.includes('自由巡览 · 快速飞行'))?.disabled, null, { timeout: 120000 });
      await page.evaluate(() => window.liuzhouTest.manual(true));
      await page.getByRole('button', { name: '自由巡览 · 快速飞行 ↗' }).click();
    };
    await page.goto(`${base}/game/liuzhou?test=1`); await ready();
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
      fs.writeFileSync(path.join(out, 'checkpoint.json'), JSON.stringify(report, null, 2));
    };
    const go = async (target, flying = false) => {
      let previous = Infinity; let still = 0;
      for (let chunk = 0; chunk < 180; chunk++) {
        const gap = await page.evaluate(({ target, flying }) => {
          const t = window.liuzhouTest; const p = t.game.player; const d = Math.hypot(target.x - p.x, target.z - p.z);
          t.rig.yaw = Math.atan2(target.x - p.x, target.z - p.z); t.rig.dragged = performance.now();
          if (d > .3) {
            const fast = flying && d > 130; const precise = flying && d < 60; const pace = flying ? fast ? 160 : precise ? 6 : 55 : 4.4;
            t.move({ forward: 1, sprint: fast, precise }, Math.max(1, Math.min(75, Math.floor((d - .12) / pace * 60))));
          }
          return d;
        }, { target, flying });
        if (gap < .3) return;
        still = Math.abs(previous - gap) < .015 ? still + 1 : 0; previous = gap;
        assert.ok(still < 6, `stuck ${JSON.stringify({ target, gap, player: await player() })}`);
      }
      assert.fail(`unreached ${JSON.stringify(target)}`);
    };
    const westLength = layout.sections[0].length; const mainLength = layout.sections[1].length;
    const middle = guangyaPoint(westLength + mainLength / 2, GUANGYA_WALK_OFFSET);
    await page.keyboard.press('f');
    await page.evaluate(() => window.liuzhouTest.move({ jump: true, sprint: true }, 170));
    await go(middle, true);
    await page.evaluate(() => { window.liuzhouTest.move({ descend: true }, 900); window.liuzhouTest.move({}, 30); });
    await page.keyboard.press('f');
    await page.evaluate(() => window.liuzhouTest.move({}, 40));
    const landed = await player();
    assert.equal(await page.evaluate(() => window.liuzhouTest.game.flight.active), false);
    assert.ok(Math.abs(landed.y - GUANGYA_HEIGHT) < .2, JSON.stringify({ landed, expected: GUANGYA_HEIGHT }));
    await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).loading.complete, null, { timeout: 120000 });
    await view(0, .27, 460); await capture('01-white-double-arch-side-overview');
    await view(Math.PI / 2, .16, 20); await capture('02-white-arch-sidewalk');
    const start = await player();
    for (const delta of [20, 40, 60, 80]) await go(guangyaPoint(westLength + mainLength / 2 + delta, GUANGYA_WALK_OFFSET));
    const end = await player(); assert.ok(Math.abs(end.y - GUANGYA_HEIGHT) < .2);
    assert.ok(Math.hypot(end.x - start.x, end.z - start.z) > 79);
    await view(-Math.PI / 2, .2, 36); await capture('03-ordinary-sidewalk-arch-clearance');
    report.checks.push({ name: 'ordinary eighty-metre sidewalk walk under corrected white ribs, unchanged deck height', start, end, deck: GUANGYA_HEIGHT });
    await page.reload(); await ready();
    const restored = await player(); assert.ok(Math.hypot(restored.x - end.x, restored.z - end.z) < .3); assert.ok(Math.abs(restored.y - end.y) < .2);
    await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).loading.complete, null, { timeout: 120000 });
    await page.setViewportSize({ width: 390, height: 844 }); await view(-Math.PI / 2, .18, 22); await capture('04-mobile-white-arch-save-restored');
    report.checks.push({ name: 'deck save restored and mobile canvas fits', end, restored });
    if (process.env.LIUZHOU_QA_COMPARE_WENHUI === '1') {
      await page.setViewportSize({ width: 1440, height: 900 });
      const axis = BRIDGE_AXES[0];
      const midpoint = { x: (axis.north.x + axis.south.x) / 2, z: (axis.north.z + axis.south.z) / 2 };
      await page.keyboard.press('f');
      await page.evaluate(() => window.liuzhouTest.move({ jump: true, sprint: true }, 170));
      await go(midpoint, true);
      await page.evaluate(() => { window.liuzhouTest.move({ descend: true }, 900); window.liuzhouTest.move({}, 30); });
      await page.keyboard.press('f'); await page.evaluate(() => window.liuzhouTest.move({}, 40));
      const comparison = await player(); assert.ok(Math.abs(comparison.y - BRIDGE_HEIGHT) < .2);
      const bridgeYaw = Math.atan2(axis.south.x - axis.north.x, axis.south.z - axis.north.z);
      await view(bridgeYaw + Math.PI / 2, .27, axis.length * .85); await capture('05-red-wenhui-contrast-overview');
      report.checks.push({ name: 'separate Wenhui red-arch comparison, original bridge model and height retained', player: comparison, deck: BRIDGE_HEIGHT });
    }
    assert.deepEqual(report.errors, []); report.passed = true;
  } finally { await browser.close(); fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
