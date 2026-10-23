const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/yuiffy/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const base = process.env.NIGHT_RAIN_BASE_URL || 'http://127.0.0.1:4127';
const launcher = base + '/games/night-rain/test-saves/index.html';
const out = process.env.NIGHT_RAIN_QA_DIR || 'tmp/night-test-saves';

(async () => {
  fs.mkdirSync(out, { recursive: true });
  for (const url of [launcher, base + '/game/night-rain']) assert.equal((await fetch(url)).status, 200);
  const { engine } = await import('./tests/helpers/night-rain-sky.mjs');
  const saves = await Promise.all(['after-two.json', 'after-three.json'].map(async name => {
    const response = await fetch(base + '/games/night-rain/test-saves/' + name);
    assert.equal(response.status, 200);
    const raw = await response.text();
    assert.ok(engine.loadGame(raw));
    return raw;
  }));
  const browser = await chromium.launch({ channel: 'chrome', headless: process.env.HEADED !== '1', args: ['--mute-audio', '--disable-speech-api'] });
  const report = { evidence: [], checks: [], errors: [] };
  const context = async () => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.route(/https:\/\/(pagead2\.googlesyndication\.com|hm\.baidu\.com)\//, r => r.fulfill({ contentType: 'application/javascript', body: '' }));
    await ctx.addInitScript(() => {
      localStorage.setItem('night-rain-v1-settings', JSON.stringify({ enabled: false, voice: false }));
      localStorage.setItem('night-rain-audio-v1', JSON.stringify({ muted: true }));
      if (window.speechSynthesis) window.speechSynthesis.speak = () => {};
    });
    return ctx;
  };
  const pageIn = async ctx => {
    const page = await ctx.newPage();
    page.on('pageerror', e => report.errors.push(e.stack));
    page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
    await page.goto(launcher, { waitUntil: 'networkidle' });
    return page;
  };
  const capture = async (page, name, game = false) => {
    const snapshot = await page.evaluate(game => ({
      state: game ? JSON.parse(window.render_game_to_text()) : null,
      canvas: [...document.querySelectorAll('canvas')].map(c => [c.width, c.height]),
      width: innerWidth, scroll: document.documentElement.scrollWidth, dom: document.body.innerText,
    }), game);
    assert.ok(snapshot.scroll <= snapshot.width);
    if (game) { assert.equal(snapshot.canvas.length, 1); assert.ok(snapshot.canvas[0][0] > 100); }
    const file = path.join(out, name + '.png');
    const pixels = inspectPng(await page.screenshot({ path: file, fullPage: true }));
    report.evidence.push({ file, pixels, ...snapshot });
  };
  try {
    for (let index = 0; index < saves.length; index += 1) {
      const ctx = await context();
      const page = await pageIn(ctx);
      const original = saves[1 - index];
      await page.evaluate(raw => {
        localStorage.setItem('night-rain-v1-slot-1', raw);
        localStorage.setItem('night-rain-v1-active-slot', '1');
      }, original);
      if (index === 0) {
        await capture(page, 'launcher-desktop');
        await page.setViewportSize({ width: 320, height: 780 });
        await capture(page, 'launcher-mobile');
        await page.setViewportSize({ width: 1440, height: 900 });
        const download = page.waitForEvent('download');
        await page.getByRole('link', { name: '下载 JSON', exact: true }).first().click();
        assert.equal((await download).suggestedFilename(), 'after-two.json');
      }
      await page.locator('[data-save]').nth(index).click();
      await page.waitForURL(base + '/game/night-rain');
      const preserved = await page.evaluate(() => ({ old: localStorage.getItem('night-rain-v1-slot-1'), active: localStorage.getItem('night-rain-v1-active-slot') }));
      assert.equal(preserved.old, original); assert.equal(preserved.active, '2');
      await page.getByRole('button', { name: '继续雨夜旅程 →', exact: true }).click();
      await page.waitForFunction(() => window.render_game_to_text && JSON.parse(window.render_game_to_text()).mode === 'playing');
      await page.evaluate(() => { window.advanceTime(0); window.__freeze = setInterval(() => window.advanceTime(0), 250); });
      await page.waitForTimeout(600);
      const state = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
      assert.equal(state.saveSlot, 2); assert.equal(state.chapterComplete, true); assert.equal(state.valleyComplete, true);
      assert.equal(state.skyComplete, index === 1); assert.equal(state.bellComplete, false); assert.deepEqual(state.bellGates, []);
      assert.equal(state.player.hp, engine.maxHp(state)); assert.equal(state.player.flasks, engine.maxFlasks(state));
      assert.equal(state.player.z, index === 0 ? -533 : -725);
      assert.equal(await page.locator('video').count(), 0);
      await capture(page, index === 0 ? 'third-chapter-start' : 'fourth-chapter-start', true);
      await page.reload({ waitUntil: 'networkidle' });
      await page.getByRole('button', { name: '继续雨夜旅程 →', exact: true }).click();
      await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'playing');
      assert.equal(await page.evaluate(() => JSON.parse(window.render_game_to_text()).skyComplete), index === 1);
      report.checks.push(index === 0 ? 'after-two install + continue + reload' : 'after-three install + continue + reload');
      await ctx.close();
    }
    {
      const ctx = await context(); const page = await pageIn(ctx);
      await page.evaluate(raw => { localStorage.setItem('night-rain-v1', raw); localStorage.setItem('night-rain-v1-active-slot', '1'); }, saves[1]);
      await page.locator('[data-save]').first().click(); await page.waitForURL(base + '/game/night-rain');
      await page.getByRole('button', { name: '继续雨夜旅程 →', exact: true }).waitFor();
      const storage = await page.evaluate(() => ({ legacy: localStorage.getItem('night-rain-v1'), first: localStorage.getItem('night-rain-v1-slot-1'), active: localStorage.getItem('night-rain-v1-active-slot') }));
      assert.equal(storage.legacy, saves[1]); assert.equal(storage.first, saves[1]); assert.equal(storage.active, '2');
      report.checks.push('legacy preserved and migrated to slot 1'); await ctx.close();
    }
    {
      const ctx = await context(); const page = await pageIn(ctx);
      const before = await page.evaluate(raw => {
        for (let n = 1; n <= 5; n += 1) localStorage.setItem(`night-rain-v1-slot-${n}`, raw);
        localStorage.setItem('night-rain-v1-active-slot', '3');
        return JSON.stringify(Object.fromEntries(Object.entries(localStorage).sort()));
      }, saves[0]);
      await page.locator('[data-save]').first().click();
      await page.getByRole('status').filter({ hasText: '五个旅人档位已满' }).waitFor();
      assert.equal(await page.evaluate(() => JSON.stringify(Object.fromEntries(Object.entries(localStorage).sort()))), before);
      assert.equal(page.url(), launcher); await capture(page, 'all-slots-full');
      report.checks.push('all slots full: no writes, no navigation'); await ctx.close();
    }
    assert.deepEqual(report.errors, []);
    console.log(JSON.stringify({ checks: report.checks, screenshots: report.evidence.length, errors: report.errors }));
  } finally { fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
