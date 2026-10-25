const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const base = process.env.PRE_STREAM_BASE_URL || 'http://127.0.0.1:4160';
const output = process.env.PRE_STREAM_QA_DIR || '.tmp/pre-stream-redesign-2026-10-25/focused';
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = (page, ms) => page.evaluate(value => window.advanceTime(value), ms);
const errors = [];
const screenshots = [];
const observations = [];

async function capture(page, name) {
  await page.waitForTimeout(100);
  const file = path.join(output, `${name}.png`);
  const pixels = inspectPng(await page.screenshot({ path: file, fullPage: true }));
  const layout = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth,
    canvas: [...document.querySelectorAll('canvas')].map(item => ({ width: item.width, height: item.height })) }));
  assert.ok(layout.scroll <= layout.width + 1);
  assert.ok(layout.canvas[0].width > 200 && layout.canvas[0].height > 200);
  screenshots.push({ file, pixels, layout, state: await state(page) });
}

(async () => {
  mkdirSync(output, { recursive: true });
  assert.equal((await fetch(`${base}/game/pre-stream`)).status, 200);
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--disable-speech-api'] });
  try {
    for (const width of [1440, 390, 320]) {
      const mobile = width < 500;
      const context = await browser.newContext({ viewport: { width, height: mobile ? 844 : 900 }, hasTouch: mobile, isMobile: mobile });
      await context.addInitScript(() => {
        if ('speechSynthesis' in window) window.speechSynthesis.speak = () => {};
        Element.prototype.requestPointerLock = () => Promise.resolve();
        document.exitPointerLock = () => {};
      });
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      await page.goto(`${base}/game/pre-stream`);
      await page.locator('#start-game').waitFor();
      await page.waitForFunction(() => !document.querySelector('#start-game').disabled);
      await page.locator('#start-game').click();
      await advance(page, 1);
      assert.equal((await state(page)).guideStation, 'thermos');
      await capture(page, `guided-room-${width}`);
      if (!mobile) {
        await page.keyboard.down('KeyS');
        const before = await state(page);
        await page.keyboard.down('KeyX');
        await advance(page, 100);
        assert.equal((await state(page)).movement.dashes, 1);
        assert.ok((await state(page)).player.z > before.player.z + 0.6);
        await capture(page, 'dash-desktop');
        await advance(page, 1500);
        assert.equal((await state(page)).movement.dashes, 1, 'held key cannot auto-repeat after recharge');
        await page.keyboard.up('KeyS');
        await page.keyboard.up('KeyX');
        await page.keyboard.press('KeyX');
        assert.equal((await state(page)).movement.dashes, 2);
        await page.keyboard.press('KeyP');
        assert.equal((await state(page)).movement.dashMs, 0);
        await page.keyboard.press('KeyP');
      } else {
        const joystick = await page.locator('[aria-label="移动摇杆"]').boundingBox();
        const dash = await page.getByRole('button', { name: '快步', exact: true }).boundingBox();
        assert.ok(dash && dash.width >= 48);
        const client = await context.newCDPSession(page);
        const first = { x: joystick.x + joystick.width * 0.75, y: joystick.y + joystick.height * 0.5, id: 1 };
        const second = { x: dash.x + dash.width / 2, y: dash.y + dash.height / 2, id: 2 };
        const before = await state(page);
        await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [first] });
        await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [first, second] });
        await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [first] });
        await advance(page, 100);
        assert.equal((await state(page)).movement.dashes, 1, 'second thumb activates dash while joystick stays held');
        assert.ok((await state(page)).player.x > before.player.x + 0.6);
        await capture(page, `touch-dash-${width}`);
        await client.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
      }
      await advance(page, 1300);
      if (mobile) {
        assert.equal(await page.locator('[data-objective-task="food"]').isVisible(), false, 'small-screen checklist starts folded');
        await page.getByRole('button', { name: '清单 0/7' }).tap();
        assert.equal(await page.locator('[data-objective-task="food"]').isVisible(), true);
        assert.ok((await page.locator('[data-objective-task="food"]').boundingBox()).height >= 32);
        await capture(page, `expanded-checklist-${width}`);
        await page.locator('[data-objective-task="food"]').tap();
        assert.equal(await page.locator('[data-objective-task="food"]').isVisible(), false, 'selecting a task returns space to the world');
      } else await page.locator('[data-station="food"]').click();
      assert.equal((await state(page)).guideStation, 'food');
      assert.equal((await state(page)).suggestedStation, 'thermos');
      for (let i = 0; i < 160 && (await state(page)).phase !== 'minigame'; i++) await advance(page, 96);
      assert.equal((await state(page)).minigame?.kind, 'food');
      const count = (await state(page)).movement.dashes;
      await page.keyboard.press('KeyX');
      assert.equal((await state(page)).movement.dashes, count, 'dash cannot interrupt a minigame');
      assert.equal((await state(page)).guideStation, null);
      observations.push({ width, dashes: count, phase: (await state(page)).phase, minigame: 'food' });
      await context.close();
    }
    assert.deepEqual(errors, []);
    writeFileSync(path.join(output, 'report.json'), JSON.stringify({ observations, screenshots, errors }, null, 2));
    console.log(JSON.stringify({ observations, screenshots: screenshots.length, errors }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
