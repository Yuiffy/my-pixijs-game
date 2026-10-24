const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd(), path.join(require('node:os').homedir(), '.codex/skills/develop-web-game')] }));
const { quietContext } = require('./lib/liuzhou-test-browser.cjs');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const base = process.env.LIUZHOU_BASE_URL || 'http://127.0.0.1:4134';
const output = process.env.LIUZHOU_QA_DIR || '.tmp/liuzhou-look-settings';
const report = { passed: false, errors: [], turns: [], captures: [] };

(async () => {
  assert.equal((await fetch(`${base}/game/liuzhou`, { signal: AbortSignal.timeout(90000) })).status, 200);
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--disable-speech-api'] });
  try {
    const prepare = async (options = {}) => {
      const context = await quietContext(browser, { viewport: { width: 1440, height: 900 }, ...options });
      await context.route(/https:\/\/(pagead2\.googlesyndication\.com|hm\.baidu\.com)\//, r => r.fulfill({ body: '' }));
      const page = await context.newPage();
      page.on('pageerror', e => report.errors.push(e.message));
      page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
      return { context, page };
    };
    const ready = async page => {
      await page.waitForFunction(() => typeof window.render_game_to_text === 'function' && ![...document.querySelectorAll('button')].find(b => b.textContent.includes('自由巡览 · 快速飞行'))?.disabled, { timeout: 90000 });
    };
    const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
    const capture = async (page, name) => {
      const file = path.join(output, `${name}.png`);
      const sanity = inspectPng(await page.screenshot({ path: file, fullPage: true }));
      const dom = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, canvas: [...document.querySelectorAll('canvas')].map(c => ({ width: c.width, height: c.height, calls: c.dataset.drawCalls })) }));
      assert.ok(dom.scroll <= dom.width + 1); assert.equal(dom.canvas.length, 1);
      assert.ok(dom.canvas[0].width > 0 && Number(dom.canvas[0].calls) > 0);
      if (await page.getByRole('slider').count()) {
        const bounds = await page.getByRole('slider').evaluate(el => {
          const panel = el.closest('section').getBoundingClientRect();
          return { left: panel.left, right: panel.right, viewport: innerWidth };
        });
        assert.ok(bounds.left >= 0 && bounds.right <= bounds.viewport, 'settings panel must fit in viewport');
      }
      report.captures.push({ name, file, sanity, dom, state: await state(page) });
    };
    const resume = async page => {
      await page.getByRole('button', { name: '回到街上 ↗', exact: true }).click();
      await page.waitForFunction(() => document.pointerLockElement !== null);
    };
    const settings = async page => {
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: '视角设置', exact: true }).click();
      assert.equal((await state(page)).phase, 'paused');
      assert.equal(await page.evaluate(() => document.pointerLockElement), null);
    };
    const select = async (page, value) => {
      const slider = page.getByRole('slider', { name: '鼠标视角灵敏度' });
      await slider.focus(); await page.keyboard.press('Home');
      for (let n = 20; n < value; n += 5) await page.keyboard.press('ArrowRight');
      assert.equal(await slider.inputValue(), String(value));
      assert.equal((await state(page)).controls.sensitivity, value / 100);
      assert.equal((await state(page)).phase, 'paused', 'slider keys must not resume gameplay');
    };
    const turn = async (page, sensitivity, name) => {
      const before = await state(page);
      await page.evaluate(() => document.dispatchEvent(new MouseEvent('mousemove', { movementX: 32, movementY: 12 })));
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const after = await state(page);
      assert.equal(after.controls.sensitivity, sensitivity);
      assert.ok(Math.abs(after.controls.yaw - before.controls.yaw + 32 * 0.003 * sensitivity) < 1e-9);
      assert.ok(Math.abs(after.controls.pitch - before.controls.pitch - 12 * 0.003 * sensitivity) < 1e-9);
      const heading = await page.evaluate(() => Math.atan2(window.liuzhouTest.rig.listener.fx, window.liuzhouTest.rig.listener.fz));
      assert.ok(Math.abs(Math.atan2(Math.sin(heading - after.controls.yaw), Math.cos(heading - after.controls.yaw))) < 1e-6);
      report.turns.push({ name, sensitivity, flight: after.flight.active, deltaYaw: after.controls.yaw - before.controls.yaw, deltaPitch: after.controls.pitch - before.controls.pitch });
    };
    const { page } = await prepare();
    await page.goto(`${base}/game/liuzhou?test=1`); await ready(page);
    assert.equal((await state(page)).controls.sensitivity, 0.6);
    await page.getByRole('button', { name: '自由巡览 · 快速飞行 ↗' }).click();
    await page.waitForFunction(() => document.pointerLockElement !== null);
    await turn(page, 0.6, 'ground-default');
    await page.keyboard.press('f'); await page.keyboard.down('Space');
    await page.waitForFunction(() => window.liuzhouTest.game.player.y > 60, { timeout: 30000 });
    await page.keyboard.up('Space');
    await turn(page, 0.6, 'flight-default');
    await settings(page); await select(page, 40);
    await capture(page, '01-desktop-settings');
    await resume(page); await turn(page, 0.4, 'flight-selected');
    await page.keyboard.press('Escape');
    await page.reload(); await ready(page);
    assert.equal((await state(page)).controls.sensitivity, 0.4);
    await page.getByRole('button', { name: '自由巡览 · 快速飞行 ↗' }).click();
    await page.waitForFunction(() => document.pointerLockElement !== null);
    await turn(page, 0.4, 'after-reload');
    await settings(page); await select(page, 200); await resume(page);
    await turn(page, 2, 'maximum');
    await settings(page); await select(page, 20); await resume(page);
    await turn(page, 0.2, 'minimum');
    await capture(page, '02-flight-slow');
    await settings(page); await page.getByRole('button', { name: '恢复默认 · 60%' }).click();
    assert.equal(await page.getByRole('slider').inputValue(), '60');
    assert.equal(await page.evaluate(() => localStorage.getItem('liuzhou-look-sensitivity')), '0.6');
    await page.getByRole('slider').focus(); await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.pointerLockElement !== null);
    await turn(page, 0.6, 'restored-default');

    // Small viewport and unavailable storage: the session still accepts changes.
    const small = await prepare({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await small.context.addInitScript(() => {
      const get = Storage.prototype.getItem; const set = Storage.prototype.setItem;
      Storage.prototype.getItem = function (key) { if (key === 'liuzhou-look-sensitivity') throw new DOMException('Blocked', 'SecurityError'); return get.call(this, key); };
      Storage.prototype.setItem = function (key, value) { if (key === 'liuzhou-look-sensitivity') throw new DOMException('Blocked', 'SecurityError'); return set.call(this, key, value); };
    });
    await small.page.goto(`${base}/game/liuzhou?test=1`); await ready(small.page);
    await small.page.getByRole('button', { name: '设置', exact: true }).click();
    await select(small.page, 40);
    assert.ok(await small.page.getByText('浏览器暂时无法保存，当前设置仍然有效。').isVisible());
    await capture(small.page, '03-mobile-storage-unavailable');
    assert.deepEqual(report.errors, []);
    report.passed = true;
    console.log(JSON.stringify({ passed: true, turns: report.turns.length, captures: report.captures.length }));
  } finally {
    await browser.close(); fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
