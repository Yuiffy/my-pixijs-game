const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd(), path.join(require('node:os').homedir(), '.codex/skills/develop-web-game')] }));
const { quietContext } = require('./lib/liuzhou-test-browser.cjs');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const base = process.env.LIUZHOU_BASE_URL || 'http://127.0.0.1:4133';
const out = process.env.LIUZHOU_QA_DIR || '.tmp/liuzhou-street-surfaces-dev';
const report = { passed: false, errors: [], captures: [] };
(async () => {
  assert.equal((await fetch(`${base}/game/liuzhou`, { signal: AbortSignal.timeout(90000) })).status, 200);
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
    const view = async (yaw, pitch, zoom) => page.evaluate(({ yaw, pitch, zoom }) => Object.assign(window.liuzhouTest.rig, { yaw, pitch, zoom, reset: true, dragged: performance.now() }), { yaw, pitch, zoom });
    const capture = async name => {
      await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
      const file = path.join(out, `${name}.png`);
      const sanity = inspectPng(await page.screenshot({ path: file, fullPage: true }));
      const state = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
      const dom = await page.evaluate(() => ({ canvas: [...document.querySelectorAll('canvas')].map(c => ({ width: c.width, height: c.height, calls: c.dataset.drawCalls })), width: innerWidth, scroll: document.documentElement.scrollWidth }));
      assert.equal(dom.canvas.length, 1); assert.ok(dom.canvas[0].width > 0); assert.ok(dom.scroll <= dom.width + 1);
      report.captures.push({ name, file, sanity, state, dom }); console.log(`captured ${name}`);
    };
    const flyTo = async target => {
      let last = Infinity; let still = 0;
      for (let i = 0; i < 90; i++) {
        const gap = await page.evaluate(target => {
          const t = window.liuzhouTest; const p = t.game.player; const gap = Math.hypot(target.x - p.x, target.z - p.z);
          t.rig.yaw = Math.atan2(target.x - p.x, target.z - p.z); t.rig.dragged = performance.now();
          if (gap > 0.2) {
            const fast = gap > 90; const precise = gap < 5; const pace = precise ? 6 : fast ? 160 : 55;
            t.move({ forward: 1, sprint: fast, precise }, Math.max(1, Math.min(75, Math.floor((gap - 0.08) / pace * 60))));
          }
          return gap;
        }, target);
        if (gap < 0.3) return;
        still = Math.abs(gap - last) < 0.015 ? still + 1 : 0; last = gap;
        assert.ok(still < 4, `flight stuck at ${JSON.stringify(target)}: ${gap}`);
      }
      assert.fail(`flight did not reach ${JSON.stringify(target)}`);
    };
    const lift = async () => {
      await page.keyboard.press('f');
      await page.evaluate(() => window.liuzhouTest.move({ jump: true }, 140));
    };
    const land = async () => {
      await page.evaluate(() => window.liuzhouTest.move({ descend: true }, 1000));
      await page.keyboard.press('f');
      await page.evaluate(() => window.liuzhouTest.move({}, 120));
      assert.ok(!await page.evaluate(() => window.liuzhouTest.game.flight.active));
    };
    await lift(); await flyTo({ x: -428.812, z: -409.799 }); await land();
    await view(1.5, 0.2, 14); await capture('01-jinhui-junction');
    await view(1.65, 0.24, 11); await capture('02-junction-second-angle');
    await lift(); await flyTo({ x: 315, z: -180 });
    await view(Math.PI / 2, 0.9, 90); await capture('03-waterfront-plaza-shoreline');
    await flyTo({ x: 375, z: -275 });
    await view(-Math.PI / 2, 0.8, 70); await capture('04-waterfront-north-shoreline');
    await flyTo({ x: 31, z: -10 }); await land();
    const landed = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
    assert.ok(landed.locomotion.grounded && landed.player.y < 15, 'return to the original street spawn on the ground');
    await view(-1.5, 0.18, 13); await capture('05-core-street-return');
    await page.setViewportSize({ width: 390, height: 844 });
    await view(-1.5, 0.18, 10); await capture('06-mobile-street');
    assert.deepEqual(report.errors, []); report.passed = true;
  } finally { await browser.close(); fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
