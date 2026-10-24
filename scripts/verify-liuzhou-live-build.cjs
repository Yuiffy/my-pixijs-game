const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd(), path.join(require('node:os').homedir(), '.codex/skills/develop-web-game')] }));
const { quietContext } = require('./lib/liuzhou-test-browser.cjs');
const base = process.env.LIUZHOU_BASE_URL || 'http://127.0.0.1:4132';
const build = process.env.LIUZHOU_BUILD_DIR || '.next-liuzhou-underground-build';
const output = process.env.LIUZHOU_LIVE_REPORT || '.tmp/liuzhou-underground-production/live-report.json';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
(async () => {
  assert.equal((await fetch(`${base}/game/liuzhou`, { signal: AbortSignal.timeout(60000) })).status, 200);
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--disable-speech-api'] });
  const report = { passed: false, url: `${base}/game/liuzhou`, build, buildId: fs.readFileSync(path.join(build, 'BUILD_ID'), 'utf8').trim(), errors: [], files: [] };
  try {
    const context = await quietContext(browser, { viewport: { width: 1440, height: 900 } });
    await context.route(/https:\/\/(pagead2\.googlesyndication\.com|hm\.baidu\.com)\//, r => r.fulfill({ body: '' }));
    const page = await context.newPage(); const pending = []; const seen = new Set();
    page.on('pageerror', e => report.errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
    page.on('response', resource => {
      const url = new URL(resource.url());
      if (url.origin !== base || !url.pathname.startsWith('/_next/static/') || seen.has(url.pathname)) return;
      seen.add(url.pathname);
      pending.push((async () => {
        assert.equal(resource.status(), 200, url.pathname);
        const bytes = await resource.body(); const disk = fs.readFileSync(path.join(build, url.pathname.replace('/_next/', '')));
        assert.equal(sha(bytes), sha(disk), url.pathname); report.files.push({ path: url.pathname, sha256: sha(bytes) });
      })());
    });
    await page.goto(`${base}/game/liuzhou?test=1`);
    await page.waitForFunction(() => ![...document.querySelectorAll('button')].find(b => b.textContent.includes('自由巡览 · 快速飞行'))?.disabled && typeof window.render_game_to_text === 'function', { timeout: 90000 });
    await page.evaluate(() => window.liuzhouTest.manual(true));
    await page.getByRole('button', { name: '自由巡览 · 快速飞行 ↗' }).click();
    await page.waitForFunction(() => Number(document.querySelector('canvas')?.dataset.drawCalls) > 0);
    report.state = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
    report.canvas = await page.locator('canvas').evaluate(c => ({ width: c.width, height: c.height, calls: c.dataset.drawCalls }));
    await Promise.all(pending); assert.ok(report.files.length >= 10); assert.equal(report.state.phase, 'playing'); assert.deepEqual(report.errors, []);
    report.passed = true;
    console.log(JSON.stringify({ passed: true, buildId: report.buildId, files: report.files.length, canvas: report.canvas }));
  } finally {
    await browser.close(); fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(report, null, 2));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
