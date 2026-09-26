const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/yuiffy/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const { installVirtualPointerLock } = require('./lib/night-rain-virtual-pointer.cjs');
const base = process.env.NIGHT_RAIN_BASE_URL || 'http://127.0.0.1:3870';
const output = process.env.NIGHT_RAIN_QA_DIR || 'tmp/night-rain-devices';
const errors = []; const checks = {}; const evidence = [];
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const waitIdle = page => page.waitForFunction(() => window.nightRain.getState().player.action === 'idle');
async function capture(page, name) {
  const file = path.join(output, `${name}.png`);
  const snapshot = await state(page);
  const layout = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, canvas: Array.from(document.querySelectorAll('canvas')).map(c => [c.width, c.height]), dom: document.body.innerText }));
  assert.equal(layout.canvas.length, 1); assert.ok(layout.canvas[0][0] > 0); assert.ok(layout.scroll <= layout.width);
  const pixels = inspectPng(await page.screenshot({ path: file, fullPage: true, animations: 'disabled' }));
  fs.writeFileSync(path.join(output, `${name}.json`), JSON.stringify({ snapshot, layout, pixels }, null, 2)); evidence.push({ file, pixels });
}
async function open(browser, virtual = false) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(installVirtualPointerLock);
  if (virtual) await ctx.addInitScript(() => {
    // Only the physical device boundary is emulated; production poll/edge/menu/game logic runs unchanged.
    window.virtualPad = { index: 0, id: 'QA standard device', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
    window.padPresent = true;
    Object.defineProperty(navigator, 'getGamepads', { value: () => window.padPresent ? [window.virtualPad] : [] });
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${base}/game/night-rain`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.nightRain && document.querySelector('canvas')?.width > 0);
  return { ctx, page };
}
async function axes(page, values) { await page.evaluate(values => { window.virtualPad.axes = values; }, values); }
async function button(page, index, duration = 100) {
  await page.evaluate(index => { window.virtualPad.buttons[index] = { pressed: true, value: 1 }; }, index);
  await page.waitForTimeout(duration);
  const held = await state(page);
  await page.evaluate(index => { window.virtualPad.buttons[index] = { pressed: false, value: 0 }; }, index);
  await page.waitForTimeout(40); return held;
}
async function main() {
  fs.mkdirSync(output, { recursive: true });
  assert.equal((await fetch(`${base}/game/night-rain`)).status, 200);
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    {
      const { ctx, page } = await open(browser);
      await page.getByRole('button', { name: '出门找夜宵', exact: true }).click();
      await page.waitForFunction(() => !!document.pointerLockElement);
      const initial = await state(page);
      await page.mouse.move(850, 430); await page.mouse.move(950, 450); await page.waitForTimeout(80);
      const looked = await state(page); assert.ok(Math.abs(looked.camera.yaw - initial.camera.yaw) > 0.05);
      checks.mouseWithoutHolding = true;
      await page.mouse.down({ button: 'left' }); await page.waitForTimeout(100); assert.equal((await state(page)).player.action, 'light');
      await page.waitForTimeout(850); assert.equal((await state(page)).player.action, 'idle'); await page.mouse.up();
      checks.mouseHoldDoesNotRepeat = true;
      await page.mouse.down({ button: 'right' }); await page.waitForTimeout(100); assert.equal((await state(page)).player.action, 'heavy'); await page.mouse.up({ button: 'right' }); await waitIdle(page);
      await page.keyboard.press('f'); await page.waitForTimeout(50); assert.equal((await state(page)).player.action, 'parry'); await waitIdle(page);
      const simultaneous = await state(page); await page.keyboard.down('w'); await page.mouse.move(1000, 460); await page.mouse.click(1000, 460); await page.waitForTimeout(130); await page.keyboard.up('w');
      const attacking = await state(page); assert.equal(attacking.player.action, 'light'); assert.notEqual(attacking.camera.yaw, simultaneous.camera.yaw); assert.ok(Math.hypot(attacking.player.x - simultaneous.player.x, attacking.player.z - simultaneous.player.z) > 0);
      await waitIdle(page); checks.simultaneousMoveLookAttack = true;
      const zoom = (await state(page)).camera.distance; await page.mouse.wheel(0, 150); await page.waitForTimeout(50); assert.ok((await state(page)).camera.distance > zoom);
      await page.keyboard.down('Alt'); await page.waitForFunction(() => !document.pointerLockElement);
      const unlocked = await state(page); await page.mouse.move(800, 200); await page.waitForTimeout(100); assert.equal((await state(page)).camera.yaw, unlocked.camera.yaw);
      assert.equal(unlocked.paused, false);
      await page.getByRole('button', { name: '地图 M', exact: true }).click(); await page.keyboard.up('Alt');
      assert.equal((await state(page)).panel, 'map'); assert.equal(await page.evaluate(() => !!document.pointerLockElement), false);
      await page.keyboard.press('m'); await page.waitForFunction(() => !!document.pointerLockElement);
      await page.keyboard.down('Alt'); await page.waitForFunction(() => !document.pointerLockElement); await page.keyboard.up('Alt'); await page.waitForFunction(() => !!document.pointerLockElement);
      checks.altAndMenus = true;
      await capture(page, '01-mouse-captured');
      await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.pointerLockElement && window.nightRain.getState().paused);
      const paused = await state(page); await page.waitForTimeout(150); assert.equal((await state(page)).time, paused.time);
      await page.getByText('镜头设置', { exact: true }).click();
      await page.getByLabel('鼠标视角速度', { exact: true }).selectOption('1.5');
      await page.getByLabel('反转上下视角', { exact: true }).check();
      await capture(page, '02-input-settings');
      await page.getByRole('button', { name: '继续旅程', exact: true }).click();
      // Chrome may require a fresh gesture after Escape; the on-screen prompt provides one.
      if (!await page.evaluate(() => !!document.pointerLockElement)) { await page.waitForTimeout(1300); await page.mouse.click(950, 400); }
      await page.waitForFunction(() => !!document.pointerLockElement);
      const invert = (await state(page)).camera.pitch; await page.mouse.move(960, 410); await page.waitForTimeout(60); assert.ok((await state(page)).camera.pitch < invert);
      await page.keyboard.down('w'); await page.evaluate(() => window.dispatchEvent(new Event('blur'))); await page.keyboard.up('w');
      await page.waitForFunction(() => !document.pointerLockElement); const blurred = await state(page); assert.ok(blurred.paused); await page.waitForTimeout(150); assert.equal((await state(page)).time, blurred.time);
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await page.reload({ waitUntil: 'networkidle' });
      assert.deepEqual((await state(page)).controls.look, { mouse: 1.5, gamepad: 1, invertY: true });
      checks.blurEscapePersistence = true;
      await ctx.close();
    }
    {
      const { ctx, page } = await open(browser, true);
      await button(page, 0); assert.equal((await state(page)).mode, 'playing');
      assert.equal(await page.evaluate(() => !!document.pointerLockElement), false);
      await button(page, 0); assert.ok((await state(page)).collected.includes('laptop'));
      const fullHealth = await button(page, 2); assert.equal(fullHealth.player.hp, 100); assert.equal(fullHealth.player.flasks, 3);
      const idle = await state(page); await axes(page, [0.1, -0.1, 0.1, -0.1]); await page.waitForTimeout(250);
      const deadzone = await state(page); assert.deepEqual(deadzone.player, idle.player); assert.equal(deadzone.camera.yaw, idle.camera.yaw);
      await axes(page, [0.65, 0, 0.5, 0.25]); await page.waitForTimeout(280); const moved = await state(page);
      assert.ok(Math.hypot(moved.player.x - idle.player.x, moved.player.z - idle.player.z) > 0.2); assert.notEqual(moved.camera.yaw, idle.camera.yaw);
      await axes(page, [0, 0, 0, 0]); checks.sticksAndDeadzone = true;
      for (const [index, action] of [[5, 'light'], [7, 'heavy'], [4, 'parry'], [1, 'dodge']]) {
        await waitIdle(page); const pressed = await button(page, index); assert.equal(pressed.player.action, action);
      }
      await waitIdle(page);
      const held = await button(page, 5, 1000); assert.equal(held.player.action, 'idle'); checks.gamepadActionsAndEdges = true;
      await button(page, 3); assert.equal((await state(page)).panel, 'companion');
      await button(page, 13); assert.equal(await page.evaluate(() => document.activeElement.id), 'baby-mode');
      await button(page, 0); assert.equal((await state(page)).companion.enabled, false);
      await button(page, 0); assert.equal((await state(page)).companion.enabled, true);
      await button(page, 13); await button(page, 13); await button(page, 0); assert.equal((await state(page)).companion.skin, 'otter');
      await capture(page, '03-gamepad-menu');
      await button(page, 1); assert.equal((await state(page)).panel, null);
      await button(page, 8); assert.equal((await state(page)).panel, 'map'); await button(page, 1); assert.equal((await state(page)).panel, null);
      await button(page, 9); assert.equal((await state(page)).panel, 'pause');
      // Navigate all menu controls without mouse, including camera setting selects.
      for (let i = 0; i < 18 && await page.evaluate(() => document.activeElement.textContent) !== '镜头设置'; i++) await button(page, 13);
      assert.equal(await page.evaluate(() => document.activeElement.textContent), '镜头设置'); await button(page, 0); await button(page, 13);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'mouse-look-speed'); await button(page, 15);
      assert.equal((await state(page)).controls.look.mouse, 1.5);
      await button(page, 13); assert.equal(await page.evaluate(() => document.activeElement.id), 'pad-look-speed'); await button(page, 15); assert.equal((await state(page)).controls.look.gamepad, 1.5);
      await button(page, 9); assert.equal((await state(page)).panel, null);
      await axes(page, [1, 0, 0, 0]); await page.waitForTimeout(100); await button(page, 10); await axes(page, [0, 0, 0, 0]);
      await page.evaluate(() => { window.padPresent = false; }); await page.waitForTimeout(100); assert.equal((await state(page)).panel, 'pause');
      await page.evaluate(() => { window.virtualPad.buttons[5] = { pressed: true, value: 1 }; window.padPresent = true; }); await page.waitForTimeout(150);
      await button(page, 9); assert.equal((await state(page)).panel, null); await page.waitForTimeout(150); assert.equal((await state(page)).player.action, 'idle');
      await page.evaluate(() => { window.virtualPad.buttons[5] = { pressed: false, value: 0 }; }); await page.waitForTimeout(50);
      const resumed = await button(page, 5); assert.equal(resumed.player.action, 'light'); await waitIdle(page);
      checks.menuSettingsDisconnect = true;
      await capture(page, '04-gamepad-gameplay');
      // Walk using legal movement inputs to a live enemy, then test lock and heal on the device path.
      await page.evaluate(() => {
        for (const target of [{ x: 10, z: 15 }, { x: 10, z: -1 }, { x: 7, z: -1 }, { x: 1, z: 2 }]) {
          for (let i = 0; i < 1800; i++) {
            const s = window.nightRain.getState(); const dx = target.x - s.player.x; const dz = target.z - s.player.z; const d = Math.hypot(dx, dz);
            if (d < 0.25) break;
            window.nightRain.input({ x: dx / d, z: dz / d }); window.advanceTime(40);
          }
        }
      });
      // Allow RAF to resume after the explicit stepping hook's short isolation window.
      await page.waitForTimeout(1250);
      const locked = await button(page, 11); assert.ok(locked.lockedId, 'R3 locks a live target');
      const released = await button(page, 11); assert.equal(released.lockedId, null);
      await page.waitForFunction(() => window.nightRain.getState().player.hp < 100);
      await waitIdle(page); const healing = await button(page, 2); assert.equal(healing.player.action, 'heal');
      checks.gamepadInteractionLockHeal = true;
      await ctx.close();
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ base, checks, evidence, errors, inputEvidence: 'Virtual Pointer Lock API and standard Gamepad API devices in hidden Chrome. No OS pointer capture or physical controller. Application handlers, polling, menus, movement and combat run unchanged.' }, null, 2));
    console.log(JSON.stringify({ checks, errors }));
  } finally { await browser.close(); }
}
main().catch(e => { fs.writeFileSync(path.join(output, 'failure.json'), JSON.stringify({ error: e.stack, checks, errors, evidence }, null, 2)); console.error(e); process.exitCode = 1; });
