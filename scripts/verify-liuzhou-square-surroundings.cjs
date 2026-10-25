// Source-frontage QA uses normal flight and Rapier walking in quiet system Chrome.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd(), path.join(require('node:os').homedir(), '.codex/skills/develop-web-game')] }));
const { quietContext } = require('./lib/liuzhou-test-browser.cjs');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const base = process.env.LIUZHOU_BASE_URL || 'http://127.0.0.1:4133';
const out = process.env.LIUZHOU_QA_DIR || '.tmp/liuzhou-square-surroundings';
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
    await page.goto(`${base}/game/liuzhou?test=1`);
    await page.waitForFunction(() => typeof window.render_game_to_text === 'function' && ![...document.querySelectorAll('button')].find(b => b.textContent.includes('自由巡览 · 快速飞行'))?.disabled, { timeout: 90000 });
    await page.evaluate(() => window.liuzhouTest.manual(true));
    await page.getByRole('button', { name: '自由巡览 · 快速飞行 ↗' }).click();
    await page.waitForFunction(() => { const s = JSON.parse(window.render_game_to_text()); return s.phase === 'playing' && s.loading.complete; }, { timeout: 120000 });
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
          const t = window.liuzhouTest; const p = t.game.player; const distance = Math.hypot(target.x - p.x, target.z - p.z);
          t.rig.yaw = Math.atan2(target.x - p.x, target.z - p.z); t.rig.dragged = performance.now();
          if (distance > (flying ? 4 : .13)) {
            const fast = flying && distance > 90; const pace = flying ? fast ? 160 : 55 : 4.4;
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
    await page.keyboard.press('f'); await page.evaluate(() => window.liuzhouTest.move({ jump: true, sprint: true }, 180));
    await go({ x: -480, z: -764 }, true); await page.evaluate(() => window.liuzhouTest.move({ descend: true }, 900)); await page.keyboard.press('f');
    await view(.35, .85, 115); await capture('01-east-square-context');
    for (const p of [{ x: -480, z: -722 }, { x: -480, z: -659 }, { x: -440, z: -659 }, { x: -440, z: -633 }, { x: -442, z: -633 }, { x: -442, z: -591 }, { x: -416, z: -591 }, { x: -416, z: -555 }]) await go(p);
    const walk = await page.evaluate(() => ({ ...window.liuzhouTest.game.player, grounded: window.liuzhouTest.game.locomotion.grounded })); assert.ok(walk.grounded); report.checks.push({ name: 'walked normally through public gaps beside all four source buildings', player: walk });
    await view(Math.PI, .17, 14); await capture('02-east-public-walkway');
    await page.keyboard.press('f'); await page.evaluate(() => window.liuzhouTest.move({ jump: true }, 160));
    await go({ x: -350, z: -561 }, true); await page.evaluate(() => window.liuzhouTest.move({ descend: true }, 650)); await page.keyboard.press('f');
    await view(-Math.PI / 2, .1, 14); await capture('03-zhongjiao-street-facade');
    await page.keyboard.press('f'); await page.evaluate(() => window.liuzhouTest.move({ jump: true }, 130));
    await go({ x: -353, z: -610 }, true); await page.evaluate(() => window.liuzhouTest.move({ descend: true }, 650)); await page.keyboard.press('f');
    await view(-Math.PI / 2, .12, 19); await capture('04-xindadi-street-facade');
    await page.keyboard.press('f'); await page.evaluate(() => window.liuzhouTest.move({ jump: true }, 130));
    await go({ x: -374, z: -690 }, true); await page.evaluate(() => window.liuzhouTest.move({ descend: true }, 650)); await page.keyboard.press('f');
    await view(-Math.PI / 2, .1, 19); await capture('05-huatian-street-facade');
    assert.deepEqual(report.errors, []); report.passed = true;
  } finally { await browser.close(); fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); }
})().catch(e => { console.error(e); process.exitCode = 1; });
