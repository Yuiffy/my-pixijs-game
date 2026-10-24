const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd(), path.join(require('node:os').homedir(), '.codex/skills/develop-web-game')] }));
const { quietContext } = require('./lib/liuzhou-test-browser.cjs');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const base = process.env.LIUZHOU_BASE_URL || 'http://127.0.0.1:4133';
const output = process.env.LIUZHOU_QA_DIR || '.tmp/liuzhou-streaming-dev';
const report = { passed: false, errors: [], checks: [], captures: [] };
(async () => {
  assert.equal((await fetch(`${base}/game/liuzhou`)).status, 200);
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--disable-speech-api'] });
  try {
    const context = await quietContext(browser, { viewport: { width: 1280, height: 800 } });
    await context.route(/https:\/\/(pagead2\.googlesyndication\.com|hm\.baidu\.com)\//, r => r.fulfill({ body: '' }));
    await context.addInitScript(() => {
      if (window.name.startsWith('liuzhou-fixture:')) localStorage.setItem('liuzhou-riverside-v1', window.name.slice(16));
      window.startupTimes = { longTasks: [] };
      new PerformanceObserver(list => list.getEntries().forEach(e => window.startupTimes.longTasks.push({ start: e.startTime, duration: e.duration }))).observe({ type: 'longtask', buffered: true });
    });
    const page = await context.newPage();
    page.on('pageerror', e => report.errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
    const state = () => page.evaluate(() => ({ game: JSON.parse(window.render_game_to_text()), scene: window.liuzhouTest.rig.streaming(), ms: performance.now() }));
    const enter = async () => {
      await page.waitForFunction(() => typeof window.render_game_to_text === 'function' && [...document.querySelectorAll('button')].some(b => b.textContent.includes('自由巡览 · 快速飞行') && !b.disabled), null, { timeout: 90000 });
      const initial = await state();
      assert.ok(initial.game.loading.nearbyReady); assert.equal(initial.game.loading.complete, false);
      assert.ok(initial.scene.roadTiles.length > 0);
      await page.getByRole('button', { name: '自由巡览 · 快速飞行 ↗' }).click();
      return initial;
    };
    const capture = async name => {
      const file = path.join(output, `${name}.png`); const sanity = inspectPng(await page.screenshot({ path: file, fullPage: true }));
      const snapshot = await state();
      const dom = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, canvas: [...document.querySelectorAll('canvas')].map(c => ({ width: c.width, height: c.height, calls: c.dataset.drawCalls })) }));
      assert.equal(dom.canvas.length, 1); assert.ok(Number(dom.canvas[0].calls) > 0); assert.ok(dom.scroll <= dom.width + 1);
      report.captures.push({ file, sanity, snapshot, dom });
    };
    await page.goto(`${base}/game/liuzhou?test=1`, { waitUntil: 'commit' });
    const initial = await enter();
    const before = await page.evaluate(() => ({ ...window.liuzhouTest.game.player }));
    await page.keyboard.down('w');
    await page.waitForFunction(() => window.liuzhouTest.game.time > 1.1);
    await page.keyboard.up('w');
    const after = await page.evaluate(() => ({ ...window.liuzhouTest.game.player }));
    assert.ok(Math.hypot(after.x - before.x, after.z - before.z) > 1);
    await capture('01-play-while-loading');
    await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).loading.complete, null, { timeout: 90000 });
    await page.waitForFunction(() => window.liuzhouTest.rig.streaming().bridges > 0);
    const complete = await state(); assert.equal(complete.scene.bridges, JSON.parse(fs.readFileSync('src/components/liuzhou/skyline-map.json')).bridges.length); assert.ok(complete.scene.roadTiles.length > initial.scene.roadTiles.length);
    report.checks.push({ name: 'enter and walk before whole-city visuals complete; all bridges and road tiles eventually load', initial, complete, before, after, timing: await page.evaluate(() => window.startupTimes) });
    await capture('02-whole-city-ready');
    // Restore a real remote-area save; its own nearby roads must load first.
    await page.evaluate(() => { window.name = 'liuzhou-fixture:' + JSON.stringify({ version: 1, terrainVersion: 2, exploration: true, stage: 1, player: { x: -3014.151, y: 25, z: 59.823, angle: 0 }, money: 60 }); });
    await page.reload({ waitUntil: 'commit' }); const remote = await enter();
    const p = await page.evaluate(() => ({ ...window.liuzhouTest.game.player }));
    assert.ok(p.x < -2900, JSON.stringify(p));
    const near = remote.scene.roadTiles.filter(id => {
      const [x, z] = id.split(':').map(Number);
      return Math.hypot((x + 0.5) * 256 - p.x, (z + 0.5) * 256 - p.z) < 450;
    });
    assert.ok(near.length > 0, JSON.stringify(remote));
    await page.setViewportSize({ width: 390, height: 844 });
    await capture('03-saved-remote-area-mobile');
    report.checks.push({ name: 'saved Eshan position loads its own surroundings first and fits a phone viewport', remote, near });
    // Flight continues while remaining tiles arrive, with C descending.
    await page.keyboard.press('f'); await page.keyboard.down('Space'); await page.keyboard.down('w');
    const start = await page.evaluate(() => window.liuzhouTest.game.time);
    await page.waitForFunction(t => window.liuzhouTest.game.time > t + 2, start);
    await page.keyboard.up('Space'); await page.keyboard.up('w');
    await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).loading.complete, null, { timeout: 90000 });
    await capture('04-remote-flight-complete');
    assert.deepEqual(report.errors, []); report.passed = true;
    console.log(JSON.stringify({ passed: true, initialMs: initial.ms, loadedAtEntry: initial.game.loading, completeMs: complete.ms, checks: report.checks.length, captures: report.captures.length }));
  } finally { await browser.close(); fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); }
})().catch(e => { console.error(e); process.exitCode = 1; });
