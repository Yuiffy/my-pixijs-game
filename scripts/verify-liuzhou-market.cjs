const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, file);
const { marketPoint, marketProjection, MARKET_RESIDENTS, MARKET_LENGTH, MARKET_EAST_COURTS } = require('../src/components/liuzhou/market.ts');
const { terrainTriangleHeight } = require('../src/components/liuzhou/terrainMesh.ts');
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd(), path.join(require('node:os').homedir(), '.codex/skills/develop-web-game')] }));
const { quietContext } = require('./lib/liuzhou-test-browser.cjs');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const base = process.env.LIUZHOU_BASE_URL || 'http://127.0.0.1:4133';
const out = process.env.LIUZHOU_QA_DIR || '.tmp/liuzhou-market-dev';
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
    await go(marketPoint(128, -35), true); await page.evaluate(() => { window.liuzhouTest.move({ descend: true }, 540); window.liuzhouTest.move({}, 50); });
    await view(0, 0.65, 70); await capture('01-market-overview');
    await go(marketPoint(20), true); await page.evaluate(() => window.liuzhouTest.move({ descend: true }, 1100)); await page.keyboard.press('f');
    const landed = await page.evaluate(() => ({ ...window.liuzhouTest.game.player }));
    assert.ok(Math.abs(landed.y - terrainTriangleHeight(landed)) < 0.2); report.checks.push({ name: 'flew from core and landed normally', player: landed });
    await go(marketPoint(31)); await view(Math.PI / 2 - 0.08, 0.12, 10); await capture('02-west-entrance');
    await go(marketPoint(79)); await view(Math.PI / 2, 0.14, 11); await capture('03-clear-main-lane');
    await go(marketPoint(79, -6.9)); await go(marketPoint(134, -6.9)); await go(marketPoint(144, -6.9)); await go(marketPoint(182, -6.9));
    await view(0, 0.08, 5.8); await capture('04-shop-frontages');
    const vendor = MARKET_RESIDENTS.find(n => n.id === 'market-vendor-3');
    await page.keyboard.press('e');
    assert.equal(await page.evaluate(() => window.liuzhouTest.game.dialogue?.name), vendor.name);
    await capture('05-neighbour-conversation');
    for (let i = 0; i < 5 && await page.evaluate(() => !!window.liuzhouTest.game.dialogue); i++) await page.keyboard.press('e');
    await go(marketPoint(229, -6.9)); await go(marketPoint(229, -11)); await view(-0.3, 0.25, 10); await capture('06-courtyard-seating');
    await go(marketPoint(229, -6.9)); await go(marketPoint(278, -6.9)); await view(Math.PI / 2, 0.12, 10);
    for (const along of [290, 292, 400, 431, 434, 445]) await go(marketPoint(along, -6.9));
    await view(Math.PI / 2 + 0.2, 0.16, 13); await capture('07-east-residential-bends');
    const northCourt = MARKET_EAST_COURTS.find(c => c.side < 0);
    await go(northCourt.walk[1]); await view(0.2, 0.25, 14); await capture('08-north-court-passage');
    for (const p of northCourt.walk.slice(2)) await go(p);
    for (const along of [490, 548]) await go(marketPoint(along, -6.9));
    await go(marketPoint(548)); await go(marketPoint(MARKET_LENGTH));
    await view(Math.PI / 2 + 0.2, 0.16, 17); await capture('09-sanzhong-junction');
    report.checks.push({ name: 'ordinary walk follows both mapped bends to source east junction', player: await page.evaluate(() => ({ ...window.liuzhouTest.game.player })) });
    await go(marketPoint(548)); await go(marketPoint(548, 6.9));
    for (const along of [490, 459]) await go(marketPoint(along, 6.9));
    const southCourt = MARKET_EAST_COURTS.find(c => c.side > 0);
    for (const p of southCourt.walk.slice().reverse().slice(1, 3)) await go(p);
    await view(Math.PI, 0.25, 14); await capture('10-south-court-passage');
    await go(marketPoint(445, 17)); await page.keyboard.press('e');
    assert.equal(await page.evaluate(() => window.liuzhouTest.game.dialogue?.name), '纳凉的居民');
    await capture('11-east-neighbour-conversation');
    for (let i = 0; i < 5 && await page.evaluate(() => !!window.liuzhouTest.game.dialogue); i++) await page.keyboard.press('e');
    await go(southCourt.walk[0]);
    for (const along of [434, 431, 400, 292, 290, 278]) await go(marketPoint(along, 6.9));
    for (const along of [290, 292, 400, 431, 434, 490, 548]) await go(marketPoint(along, 6.9));
    await view(-Math.PI / 2, 0.15, 12); await capture('12-east-pavement-return');
    const end = await page.evaluate(() => ({ ...window.liuzhouTest.game.player })); assert.ok(marketProjection(end).along > 277); report.checks.push({ name: 'ordinary walking along lane and north pavement', player: end });
    await page.reload(); await page.waitForFunction(() => typeof window.render_game_to_text === 'function' && ![...document.querySelectorAll('button')].find(b => b.textContent.includes('自由巡览 · 快速飞行'))?.disabled, { timeout: 90000 });
    await page.evaluate(() => window.liuzhouTest.manual(true)); await page.getByRole('button', { name: '自由巡览 · 快速飞行 ↗' }).click();
    const restored = await page.evaluate(() => ({ ...window.liuzhouTest.game.player })); assert.ok(Math.hypot(restored.x - end.x, restored.z - end.z) < 0.3); assert.ok(Math.abs(restored.y - end.y) < 0.3);
    await view(-Math.PI / 2, 0.15, 12); await capture('13-east-end-restored');
    await page.setViewportSize({ width: 390, height: 844 }); await capture('14-mobile-market');
    const residents = await page.evaluate(() => window.liuzhouTest.game.npcs.filter(n => n.id.startsWith('market-')));
    assert.equal(residents.length, MARKET_RESIDENTS.length); assert.ok(residents.filter(n => n.routine).every(n => n.routine.odometer > 30));
    report.checks.push({ name: 'market residents move and survive reload', residents });
    assert.deepEqual(report.errors, []); report.passed = true;
  } finally { await browser.close(); fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
