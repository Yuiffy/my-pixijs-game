const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd(), path.join(require('node:os').homedir(), '.codex/skills/develop-web-game')] }));
const { quietContext } = require('./lib/liuzhou-test-browser.cjs');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const base = process.env.LIUZHOU_BASE_URL || 'http://127.0.0.1:4133';
const output = process.env.LIUZHOU_QA_DIR || '.tmp/liuzhou-flight-camera-dev';
const baseline = process.env.LIUZHOU_CAMERA_BASELINE === '1';
const report = { passed: false, baseline, errors: [], traces: [], captures: [], note: 'Disposable muted Chrome; virtual Pointer Lock only. Synthetic relative-mouse spikes reproduce the input path, not native Windows pointer behavior.' };
const difference = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

(async () => {
  assert.equal((await fetch(`${base}/game/liuzhou`, { signal: AbortSignal.timeout(90000) })).status, 200);
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--disable-speech-api'] });
  try {
    const context = await quietContext(browser, { viewport: { width: 1440, height: 900 } });
    // This regression uses the original 100% angle-per-pixel contract. The
    // settings playtest covers the slower default and user-selected values.
    await context.addInitScript(() => localStorage.setItem('liuzhou-look-sensitivity', '1'));
    await context.route(/https:\/\/(pagead2\.googlesyndication\.com|hm\.baidu\.com)\//, route => route.fulfill({ body: '' }));
    const page = await context.newPage();
    page.on('pageerror', error => report.errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
    await page.goto(`${base}/game/liuzhou?test=1`);
    await page.waitForFunction(() => typeof window.render_game_to_text === 'function' && ![...document.querySelectorAll('button')].find(b => b.textContent.includes('自由巡览 · 快速飞行'))?.disabled, { timeout: 90000 });
    await page.getByRole('button', { name: '自由巡览 · 快速飞行 ↗' }).click();
    await page.waitForFunction(() => document.pointerLockElement !== null);
    const frame = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const snapshot = async () => {
      await frame();
      return page.evaluate(() => {
        const t = window.liuzhouTest;
        return { state: JSON.parse(window.render_game_to_text()), listener: { ...t.rig.listener }, camera: t.rig.framing().position };
      });
    };
    const check = (sample, yaw, pitch) => {
      const { controls } = sample.state;
      assert.ok(difference(controls.yaw, yaw) < 1e-7, `input yaw ${controls.yaw} != ${yaw}`);
      assert.ok(Math.abs(controls.pitch - pitch) < 1e-7, `input pitch ${controls.pitch} != ${pitch}`);
      assert.ok(difference(Math.atan2(sample.listener.fx, sample.listener.fz), yaw) < 1e-6, 'rendered heading follows mouse input');
      assert.ok(sample.camera.every(Number.isFinite));
      report.traces.push({ yaw, pitch, renderedYaw: Math.atan2(sample.listener.fx, sample.listener.fz), speed: sample.state.player.speed });
    };
    const mouse = (x, y = 0) => page.evaluate(({ x, y }) => document.dispatchEvent(new MouseEvent('mousemove', { movementX: x, movementY: y })), { x, y });
    const capture = async name => {
      const sample = await snapshot();
      const file = path.join(output, `${name}.png`);
      const sanity = inspectPng(await page.screenshot({ path: file, fullPage: true }));
      const dom = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, canvas: [...document.querySelectorAll('canvas')].map(c => ({ width: c.width, height: c.height, calls: c.dataset.drawCalls })) }));
      assert.equal(dom.canvas.length, 1); assert.ok(dom.canvas[0].width > 0 && Number(dom.canvas[0].calls) > 0); assert.ok(dom.scroll <= dom.width + 1);
      report.captures.push({ name, file, sanity, sample, dom });
    };
    await page.keyboard.press('f');
    await page.keyboard.down('Space');
    await page.waitForFunction(() => window.liuzhouTest.game.player.y > 140, { timeout: 30000 });
    await page.keyboard.up('Space');
    await page.waitForTimeout(600);
    let { yaw, pitch } = (await snapshot()).state.controls;
    await mouse(8, 2); yaw -= 8 * 0.003; pitch += 2 * 0.003;
    check(await snapshot(), yaw, pitch);
    await capture('01-flight-before-spike');
    await mouse(1440, -900);
    const spike = await snapshot();
    report.spike = { expectedYaw: yaw, actualYaw: spike.state.controls.yaw, expectedPitch: pitch, actualPitch: spike.state.controls.pitch };
    if (baseline) {
      assert.ok(difference(spike.state.controls.yaw, yaw) > 1, 'old input path reproduces the sudden turn');
      await capture('02-reproduced-spike');
    } else {
      check(spike, yaw, pitch);
      await mouse(-1440, 900); check(await snapshot(), yaw, pitch);
      // Many valid samples must still permit fast, unrestricted turns; the
      // protection must not impose a per-frame or per-second rotation cap.
      for (const direction of [1, -1]) {
        for (let i = 0; i < 64; i++) {
          await mouse(direction * 40, i % 2 ? -2 : 2);
          yaw -= direction * 40 * 0.003; pitch += (i % 2 ? -2 : 2) * 0.003;
          check(await snapshot(), yaw, pitch);
          if (i % 16 === 8) { await mouse(direction * 960, -600); check(await snapshot(), yaw, pitch); }
        }
      }
      await capture('02-continuous-flight-turns');
      await page.keyboard.down('w'); await page.keyboard.down('Shift');
      for (let i = 0; i < 20; i++) { await mouse(12); yaw -= 0.036; check(await snapshot(), yaw, pitch); }
      await page.keyboard.up('Shift'); await page.keyboard.up('w');
      await page.keyboard.down('c');
      for (let i = 0; i < 10; i++) { await mouse(-12); yaw += 0.036; check(await snapshot(), yaw, pitch); }
      await page.keyboard.up('c');
      await page.waitForTimeout(2800); check(await snapshot(), yaw, pitch);
      await capture('03-boost-descent-and-hover');
      await page.keyboard.down('Alt');
      await page.waitForFunction(() => document.pointerLockElement === null);
      await mouse(60, 40); check(await snapshot(), yaw, pitch);
      await page.keyboard.up('Alt');
      await page.waitForFunction(() => document.pointerLockElement !== null);
      await mouse(-960, 600); check(await snapshot(), yaw, pitch);
      await mouse(-8, -2); yaw += 0.024; pitch -= 0.006; check(await snapshot(), yaw, pitch);
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === 'paused');
      await mouse(60, 40); check(await snapshot(), yaw, pitch);
      await page.getByRole('button', { name: '回到街上 ↗', exact: true }).click();
      await page.waitForFunction(() => document.pointerLockElement !== null);
      // A virtual button click can emit ordinary mouse motion before recapture.
      ({ yaw, pitch } = (await snapshot()).state.controls);
      await mouse(1440, -900); check(await snapshot(), yaw, pitch);
      await mouse(8, 2); yaw -= 0.024; pitch = Math.min(0.95, pitch + 0.006); check(await snapshot(), yaw, pitch);
      await capture('04-recaptured-flight');
    }
    assert.deepEqual(report.errors, []);
    report.passed = true;
    console.log(JSON.stringify({ passed: report.passed, baseline, traces: report.traces.length, captures: report.captures.length, spike: report.spike }));
  } finally {
    await browser.close(); fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
