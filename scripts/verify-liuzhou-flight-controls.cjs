const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd(), path.join(require('node:os').homedir(), '.codex/skills/develop-web-game')] }));
const { quietContext } = require('./lib/liuzhou-test-browser.cjs');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const base = process.env.LIUZHOU_BASE_URL || 'http://127.0.0.1:4133';
const output = process.env.LIUZHOU_QA_DIR || '.tmp/liuzhou-flight-controls-dev';
const report = { passed: false, errors: [], checks: [], captures: [], note: 'Actual keyboard and Chrome multi-touch events drive the normal frame loop. Quiet disposable contexts simulate Pointer Lock; no system cursor or test sound.' };

(async () => {
  assert.equal((await fetch(`${base}/game/liuzhou`, { signal: AbortSignal.timeout(90000) })).status, 200);
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--disable-speech-api'] });
  try {
    const setup = async mobile => {
      const context = await quietContext(browser, { viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }, hasTouch: mobile, isMobile: mobile });
      await context.route(/https:\/\/(pagead2\.googlesyndication\.com|hm\.baidu\.com)\//, route => route.fulfill({ body: '' }));
      const page = await context.newPage();
      page.on('pageerror', error => report.errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
      const enter = async () => {
        await page.goto(`${base}/game/liuzhou?test=1`);
        await page.waitForFunction(() => typeof window.render_game_to_text === 'function' && ![...document.querySelectorAll('button')].find(b => b.textContent.includes('自由巡览 · 快速飞行'))?.disabled, { timeout: 90000 });
        await page.evaluate(() => window.liuzhouTest.manual(true));
        await page.getByRole('button', { name: '自由巡览 · 快速飞行 ↗' }).click();
      };
      await enter();
      await page.keyboard.press('f');
      await page.evaluate(() => window.liuzhouTest.move({ jump: true }, 420));
      assert.ok(await page.evaluate(() => window.liuzhouTest.game.player.y > 140));
      // Let takeoff inertia settle before measuring the held inspection input.
      await page.evaluate(() => window.liuzhouTest.move({}, 120));
      return { context, page, enter };
    };
    const state = page => page.evaluate(() => ({ ...window.liuzhouTest.game.player }));
    const run = async (page, seconds) => {
      const start = await page.evaluate(() => { window.liuzhouTest.manual(false); return window.liuzhouTest.game.time; });
      await page.waitForFunction(({ start, seconds }) => window.liuzhouTest.game.time >= start + seconds, { start, seconds }, { timeout: 30000 });
      await page.evaluate(() => window.liuzhouTest.manual(true));
    };
    const capture = async (page, name) => {
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const file = path.join(output, `${name}.png`); const sanity = inspectPng(await page.screenshot({ path: file, fullPage: true }));
      const game = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
      const dom = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, canvas: [...document.querySelectorAll('canvas')].map(c => ({ width: c.width, height: c.height, calls: c.dataset.drawCalls })) }));
      assert.equal(dom.canvas.length, 1); assert.ok(dom.canvas[0].width > 0); assert.ok(Number(dom.canvas[0].calls) > 0); assert.ok(dom.scroll <= dom.width + 1);
      report.captures.push({ name, file, sanity, game, dom });
    };
    const { context: desktop, page } = await setup(false);
    const before = await state(page);
    for (const key of ['q', 'w', 'Shift', 'Space']) await page.keyboard.down(key);
    await run(page, 2);
    for (const key of ['q', 'w', 'Shift', 'Space']) await page.keyboard.up(key);
    const inspecting = await state(page);
    assert.ok(inspecting.speed > 5.9 && inspecting.speed < 6.01, JSON.stringify(inspecting));
    assert.ok(inspecting.y - before.y > 6.9 && inspecting.y - before.y < 9, JSON.stringify({ before, inspecting }));
    report.checks.push({ name: 'held Q slows horizontal and vertical travel and overrides Shift through actual keyboard events', before, inspecting });
    await capture(page, '01-keyboard-inspection');
    await page.evaluate(() => window.liuzhouTest.move({}, 120));
    await page.evaluate(() => { window.liuzhouTest.rig.pitch = 0.33; });
    const descentPitch = await page.evaluate(() => window.liuzhouTest.rig.pitch);
    const beforeDescent = await state(page);
    for (const key of ['q', 'w', 'c']) await page.keyboard.down(key);
    await run(page, 2);
    for (const key of ['q', 'w', 'c']) await page.keyboard.up(key);
    const descending = await state(page);
    assert.equal(await page.evaluate(() => window.liuzhouTest.rig.pitch), descentPitch, 'C descends without recentering the flight camera');
    assert.ok(beforeDescent.y - descending.y > 6.9 && beforeDescent.y - descending.y < 9, JSON.stringify({ beforeDescent, descending }));
    assert.ok(descending.speed > 5.9 && descending.speed < 6.01);
    assert.ok(Math.hypot(descending.x - beforeDescent.x, descending.z - beforeDescent.z) > 10);
    await capture(page, '01b-keyboard-descent-c');
    await page.evaluate(() => window.liuzhouTest.move({}, 120));
    const hover = await state(page);
    for (const key of ['ControlLeft', 'ControlRight']) {
      await page.keyboard.down(key); await run(page, 0.5); await page.keyboard.up(key);
      assert.ok(Math.abs((await state(page)).y - hover.y) < 0.02, 'Control no longer lowers flight altitude');
    }
    report.checks.push({ name: 'C+W descends while advancing; releasing C hovers, neither Control key descends', beforeDescent, descending, hover });
    await page.keyboard.down('w'); await run(page, 1); await page.keyboard.up('w');
    assert.ok((await state(page)).speed > 54, 'release Q returns to cruise');
    await page.keyboard.down('q'); await page.keyboard.down('w');
    await page.keyboard.press('m');
    const paused = await state(page);
    await page.evaluate(() => window.advanceTime(1000));
    assert.deepEqual(await state(page), paused);
    await page.getByRole('button', { name: '回到街上 ↗', exact: true }).click();
    await page.keyboard.up('q'); await page.keyboard.up('w');
    await page.keyboard.down('w'); await run(page, 1); await page.keyboard.up('w');
    assert.ok((await state(page)).speed > 54, 'menu/resume clears the held inspection key');
    const saved = await state(page); await page.reload(); await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(() => typeof window.render_game_to_text === 'function' && ![...document.querySelectorAll('button')].find(b => b.textContent.includes('自由巡览 · 快速飞行'))?.disabled, { timeout: 90000 });
    await page.evaluate(() => window.liuzhouTest.manual(true)); await page.getByRole('button', { name: '自由巡览 · 快速飞行 ↗' }).click();
    const restored = await state(page);
    assert.ok(Math.hypot(restored.x - saved.x, restored.z - saved.z, restored.y - saved.y) < 0.3);
    assert.equal(await page.evaluate(() => window.liuzhouTest.game.flight.active), true);
    await capture(page, '02-restored-flight');
    report.checks.push({ name: 'keyboard release, pause/menu clearing and flight save/reload', saved, restored });
    await desktop.close();

    const { context: mobile, page: phone } = await setup(true);
    const cdp = await mobile.newCDPSession(phone);
    const points = async names => Promise.all(names.map(async (name, id) => {
      const rect = await phone.getByRole('button', { name, exact: true }).boundingBox();
      const viewport = phone.viewportSize();
      assert.ok(rect && rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= viewport.width && rect.y + rect.height <= viewport.height, name);
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, id, radiusX: 2, radiusY: 2, force: 1 };
    }));
    await points(['向前', '向左', '向右', '飞行降低', '飞行加速', '飞行慢速', '刹车或跳跃']);
    const phoneBefore = await state(phone);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: await points(['向前', '飞行慢速', '刹车或跳跃']) });
    await run(phone, 2);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    const phoneInspecting = await state(phone);
    assert.ok(phoneInspecting.speed > 5.9 && phoneInspecting.speed < 6.01, JSON.stringify(phoneInspecting));
    assert.ok(phoneInspecting.y - phoneBefore.y > 6.9 && phoneInspecting.y - phoneBefore.y < 9, JSON.stringify({ phoneBefore, phoneInspecting }));
    await capture(phone, '03-mobile-inspection');
    await phone.evaluate(() => window.liuzhouTest.move({}, 120));
    const phoneBeforeDescent = await state(phone);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: await points(['向前', '飞行慢速', '飞行降低']) });
    await run(phone, 2);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    const phoneDescending = await state(phone);
    assert.ok(phoneBeforeDescent.y - phoneDescending.y > 6.9 && phoneBeforeDescent.y - phoneDescending.y < 9);
    assert.ok(phoneDescending.speed > 5.9 && phoneDescending.speed < 6.01);
    await capture(phone, '03b-mobile-descent');
    report.checks.push({ name: 'three-finger mobile forward/slow/descent retains the lower button', phoneBeforeDescent, phoneDescending });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: await points(['向前']) });
    await run(phone, 1);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert.ok((await state(phone)).speed > 54, 'touch cancel releases slow mode and ascent');
    const cruisingY = (await state(phone)).y;
    await phone.evaluate(() => window.liuzhouTest.move({}, 120));
    assert.ok(Math.abs((await state(phone)).y - cruisingY) < 0.8, 'released ascent settles into a hover');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: await points(['向前', '飞行慢速']) });
    await phone.getByRole('button', { name: '地图', exact: true }).click();
    const phonePaused = await state(phone); await phone.evaluate(() => window.advanceTime(1000)); assert.deepEqual(await state(phone), phonePaused);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await phone.getByRole('button', { name: '回到街上 ↗', exact: true }).click();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: await points(['向前', '飞行加速']) });
    await run(phone, 1.5);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const boosted = await state(phone);
    assert.ok(boosted.speed > 159, 'touch menu/resume clears slow mode; two-finger boost still works');
    await capture(phone, '04-mobile-boost-after-menu');
    report.checks.push({ name: 'three-finger inspection/ascent, touchCancel, hover, menu/resume and two-finger boost', phoneBefore, phoneInspecting, boosted });
    await phone.setViewportSize({ width: 320, height: 740 });
    const controls = ['向前', '向左', '向右', '飞行降低', '飞行加速', '飞行慢速', '刹车或跳跃'];
    await points(controls);
    const rectangles = await Promise.all(controls.map(name => phone.getByRole('button', { name, exact: true }).boundingBox()));
    for (let a = 0; a < rectangles.length; a++) for (let b = a + 1; b < rectangles.length; b++) {
      const x = rectangles[a]; const y = rectangles[b];
      assert.ok(x.x + x.width <= y.x || y.x + y.width <= x.x || x.y + x.height <= y.y || y.y + y.height <= x.y, `${controls[a]} overlaps ${controls[b]} at 320px`);
    }
    const status = await phone.getByText('km/h', { exact: true }).locator('..').locator('..').boundingBox();
    assert.ok(status && status.y + status.height <= Math.min(...rectangles.map(rect => rect.y)), 'speed display must remain above the narrow touch controls');
    await capture(phone, '05-narrow-mobile-controls');
    await mobile.close();
    assert.deepEqual(report.errors, []); report.passed = true;
    console.log(JSON.stringify({ passed: true, captures: report.captures.length, checks: report.checks.length }));
  } finally {
    await browser.close(); fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
