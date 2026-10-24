const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const ts = require('typescript');
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd(), path.join(os.homedir(), '.codex/skills/develop-web-game')] }));
const { quietContext } = require('./lib/liuzhou-test-browser.cjs');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, file);
const { terrainHeight } = require('../src/components/liuzhou/terrain.ts');
const { BRIDGE_HEIGHT } = require('../src/components/liuzhou/bridges.ts');
const base = process.env.LIUZHOU_BASE_URL || 'http://127.0.0.1:4130';
const output = process.env.LIUZHOU_QA_DIR || '.tmp/liuzhou-geography';
const report = { note: 'Regular terrain-version-2 saves seed inspection positions. Underpass traversal uses normal movement and shipped Rapier physics. Quiet installed Chrome; no native Pointer Lock.', errors: [], captures: [], checks: [] };

(async () => {
  assert.equal((await fetch(`${base}/game/liuzhou`, { signal: AbortSignal.timeout(90000) })).status, 200);
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--disable-speech-api'] });
  try {
    const context = await quietContext(browser, { viewport: { width: 1440, height: 900 } });
    // pagehide autosaves the previous page. Restore the next fixture only after
    // that handler has completed, before React reads localStorage on reload.
    await context.addInitScript(() => { if (window.name.startsWith('liuzhou-fixture:')) localStorage.setItem('liuzhou-riverside-v1', window.name.slice(16)); });
    await context.route(/https:\/\/(pagead2\.googlesyndication\.com|hm\.baidu\.com)\//, r => r.fulfill({ body: '' }));
    const page = await context.newPage();
    page.on('pageerror', e => report.errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
    await page.goto(`${base}/game/liuzhou?test=1`);
    await page.getByRole('button', { name: '走进柳州 ↗' }).waitFor({ timeout: 90000 });
    const load = async (p, yaw, pitch = 0.08) => {
      const y = p.y ?? terrainHeight(p);
      await page.evaluate(({ p, y }) => { window.name = 'liuzhou-fixture:' + JSON.stringify({ version: 1, terrainVersion: 2, stage: 1, player: { ...p, y, angle: 0 }, money: 60 }); }, { p, y });
      await page.reload();
      await page.getByRole('button', { name: '继续这趟旅行 ↗' }).waitFor({ timeout: 90000 });
      await page.evaluate(() => window.liuzhouTest.manual(true));
      await page.getByRole('button', { name: '继续这趟旅行 ↗' }).click();
      await page.evaluate(({ yaw, pitch }) => Object.assign(window.liuzhouTest.rig, { yaw, pitch, zoom: 12, reset: true, dragged: performance.now() }), { yaw, pitch });
    };
    const capture = async name => {
      // Startup is intentionally progressive. Landmark/streetscape evidence
      // must show the completed scene rather than an early worker snapshot.
      await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).loading.complete, null, { timeout: 90000 });
      await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
      const file = path.join(output, `${name}.png`);
      const sanity = inspectPng(await page.screenshot({ path: file, fullPage: true, animations: 'disabled' }));
      const state = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
      const dom = await page.evaluate(() => ({ canvas: [...document.querySelectorAll('canvas')].map(c => ({ width: c.width, height: c.height, drawCalls: c.dataset.drawCalls })), width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
      assert.equal(dom.canvas.length, 1); assert.ok(dom.canvas[0].width > 0); assert.ok(dom.scrollWidth <= dom.width + 1);
      report.captures.push({ name, file, sanity, dom, state });
    };
    await load({ x: 63.38, z: 72.96 }, 2.17, -0.08);
    await capture('01-north-underpass');
    const before = await page.evaluate(() => ({ ...window.liuzhouTest.game.player }));
    await page.evaluate(() => { window.liuzhouTest.rig.yaw = Math.atan2(107.75 - 63.38, 42.8 - 72.96); window.liuzhouTest.move({ forward: 1, sprint: true }, 390); });
    const after = await page.evaluate(() => ({ ...window.liuzhouTest.game.player }));
    assert.ok(after.x > before.x + 30, JSON.stringify(after));
    assert.ok(after.y < BRIDGE_HEIGHT - 5);
    assert.ok(Math.abs(after.y - terrainHeight(after)) < 0.3);
    report.checks.push({ name: 'walk below both decks without jumping onto their upper layer', before, after });
    await capture('02-underpass-crossed');
    await load({ x: 128, z: 290, y: BRIDGE_HEIGHT }, -0.4, -0.035);
    await capture('03-deck-toward-maanshan-yufeng');
    await load({ x: 128, z: 290, y: BRIDGE_HEIGHT }, -Math.PI / 2, -0.025);
    await capture('04-west-bridges-and-eshan');
    await load({ x: -153, z: -14 }, Math.PI / 2, 0.06);
    await capture('05-pavement-npc-and-closed-blocks');
    await load({ x: 240, z: 615 }, 0.05, -0.025);
    await capture('06-south-ground-neighbor');
    assert.deepEqual(report.errors, []);
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
