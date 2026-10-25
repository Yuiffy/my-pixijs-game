const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { chromium } = require(require.resolve('playwright', {
  paths: [process.cwd(), path.join(os.homedir(), '.codex/skills/develop-web-game')],
}));
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const base = process.env.FITNESS_BASE_URL || 'http://127.0.0.1:4160';
const output = process.env.FITNESS_QA_DIR || 'tmp/fitness-redesign-2026-10-25/browser';

(async () => {
  assert.ok((await fetch(`${base}/game/sui-fitness`)).ok);
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: !process.env.FITNESS_HEADED, args: ['--mute-audio'] });
  const errors = [], shots = [], checks = [];
  const report = { passed: false, errors, shots, checks };
  const pageFor = async (width, height) => {
    const page = await browser.newPage({ viewport: { width, height }, hasTouch: width < 600, isMobile: width < 600 });
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.route('**/api/visit**', route => route.fulfill({ body: '' }));
    await page.addInitScript(() => {
      if (window.speechSynthesis) window.speechSynthesis.speak = () => {};
      Element.prototype.requestPointerLock = () => Promise.resolve();
      document.exitPointerLock = () => {};
    });
    await page.goto(`${base}/game/sui-fitness?seed=41&talent=strength`);
    await page.waitForFunction(() => !!window.render_game_to_text);
    await page.evaluate(() => window.advanceTime(0));
    return page;
  };
  const read = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
  const shot = async (page, name) => {
    await page.waitForTimeout(250);
    const state = await read(page);
    const file = path.join(output, `${name}.png`);
    const pixels = inspectPng(await page.screenshot({ path: file, fullPage: true }));
    assert.ok(pixels.colors > 30 && pixels.nearBlackRatio < 0.8 && pixels.transparentRatio < 0.8);
    const canvas = await page.locator('canvas').evaluate(c => ({ width: c.width, height: c.height, rect: c.getBoundingClientRect().toJSON() }));
    assert.equal(canvas.width, 1100); assert.equal(canvas.height, 700);
    assert.equal(state.combatRevision, 4);
    assert.ok((await page.locator('body').innerText()).includes('动力'));
    shots.push({ file, pixels, canvas, state });
  };
  try {
    const page = await pageFor(1440, 1000);
    await page.waitForTimeout(400);
    await shot(page, 'desktop-intro');
    await page.locator('#start-fitness').click();
    await page.evaluate(() => window.advanceTime(100));
    await shot(page, 'desktop-first-action');
    const found = new Set();
    for (let turn = 0; turn < 150 && found.size < 2; turn++) {
      const result = await page.evaluate(captured => {
        const state = () => JSON.parse(window.render_game_to_text());
        const held = new Set();
        const keys = { KeyA: 'a', KeyD: 'd', KeyW: 'w', KeyS: 's', Space: ' ' };
        const set = (code, down) => {
          if (held.has(code) === down) return;
          down ? held.add(code) : held.delete(code);
          window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: keys[code], bubbles: true }));
        };
        let reason = null;
        try {
          for (let frame = 0; frame < 90; frame++) {
            const s = state(); if (s.phase !== 'playing') break;
            const distance = food => Math.hypot(food.x - s.player.x, food.y - s.player.y);
            const warning = s.foods.filter(f => (f.kind === 'jerky' || f.kind === 'tea') && f.telegraph > 0 && distance(f) < 220).sort((a, b) => distance(a) - distance(b))[0];
            const target = warning || [...s.foods].sort((a, b) => distance(a) - distance(b))[0];
            const dx = target ? target.x - s.player.x : 0, dy = target ? target.y - s.player.y : 0;
            set('KeyA', dx < -5); set('KeyD', dx > 5); set('KeyW', dy < -5); set('KeyS', dy > 5);
            const first = !captured.includes('breakthrough');
            set('Space', !!target && s.dashCooldown === 0 && s.stamina >= 30 && (warning ? distance(target) < 200 : first && distance(target) < 170));
            window.advanceTime(1000 / 60);
            const after = state();
            if (!captured.includes('interception') && after.interceptions > 0 && after.effects.some(e => e.text?.startsWith('截击'))) reason = 'interception';
            else if (!captured.includes('breakthrough') && after.dashDamage > 0 && after.effects.some(e => e.text)) reason = 'breakthrough';
            if (reason) break;
          }
        } finally { [...held].forEach(code => set(code, false)); }
        return { reason, state: state() };
      }, [...found]);
      if (result.reason) { await shot(page, `desktop-${result.reason}`); found.add(result.reason); }
      if (result.state.phase === 'upgrade') {
        if (!shots.some(s => s.file.endsWith('desktop-upgrade.png'))) await shot(page, 'desktop-upgrade');
        const preferred = ['breakthrough', 'breath', 'guard', 'magnet'].find(id => result.state.choices.includes(id)) || result.state.choices[0];
        await page.locator(`[data-upgrade="${preferred}"]`).click();
      } else if (result.state.phase !== 'playing') break;
    }
    assert.deepEqual([...found].sort(), ['breakthrough', 'interception']);
    checks.push('real public keyboard dash hit and interception');
    await page.getByRole('button', { name: '暂停', exact: true }).click();
    const paused = await read(page);
    await page.evaluate(() => window.advanceTime(2000));
    assert.deepEqual(await read(page), paused);
    await shot(page, 'desktop-paused');
    await page.getByRole('button', { name: '继续挑战', exact: true }).last().click();
    await page.keyboard.press('p');
    await page.getByRole('button', { name: '重新挑战', exact: true }).click();
    const reset = await read(page);
    assert.equal(reset.dashDamage, 0); assert.equal(reset.interceptions, 0); assert.equal(reset.dashUses, 0);
    checks.push('pause freeze, resume and restart counters');
    await page.close();
    for (const width of [390, 320]) {
      const mobile = await pageFor(width, 844);
      await mobile.locator('#start-fitness').click();
      await mobile.evaluate(() => window.advanceTime(100));
      const summary = mobile.getByRole('button', { name: /身体详情/ });
      assert.equal(await summary.getAttribute('aria-expanded'), 'false');
      assert.ok(await mobile.locator('[aria-label="挑战状态"]').evaluate(el => el.getBoundingClientRect().height < 150));
      assert.ok(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await shot(mobile, `mobile-${width}-playing`);
      await summary.tap(); assert.equal(await summary.getAttribute('aria-expanded'), 'true');
      assert.ok(await mobile.getByText('体脂率', { exact: true }).isVisible());
      await shot(mobile, `mobile-${width}-details`);
      await summary.tap();
      const cdp = await mobile.context().newCDPSession(mobile);
      const joystick = await mobile.getByTestId('fitness-joystick').boundingBox();
      const dashButton = await mobile.getByRole('button', { name: '冲刺 Space', exact: true }).boundingBox();
      const stickPoint = { id: 1, x: joystick.x + joystick.width / 2 + 24, y: joystick.y + joystick.height / 2 };
      const dashPoint = { id: 2, x: dashButton.x + dashButton.width / 2, y: dashButton.y + dashButton.height / 2 };
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [stickPoint] });
      await mobile.evaluate(() => window.advanceTime(1000 / 60));
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [stickPoint, dashPoint] });
      await mobile.evaluate(() => window.advanceTime(100));
      const dashed = await read(mobile);
      assert.equal(dashed.dashUses, 1); assert.ok(dashed.stamina > 70 && dashed.stamina < 75);
      assert.ok(dashed.player.x > 600, JSON.stringify({ player: dashed.player, direction: dashed.dashDirection, inputs: dashed.inputs })); assert.ok(dashed.dashDirection.x > 0.9);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
      assert.equal((await read(mobile)).inputs.pointer, -1);
      assert.equal((await read(mobile)).inputs.x, 0);
      await shot(mobile, `mobile-${width}-dash`);
      // Reach the nearest training circle with ordinary public keys, then hold the actual touch button.
      await mobile.evaluate(() => {
        const held = new Set();
        const set = (code, down) => {
          if (held.has(code) === down) return;
          down ? held.add(code) : held.delete(code);
          window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true }));
        };
        try {
          for (let frame = 0; frame < 180; frame++) {
            const s = JSON.parse(window.render_game_to_text());
            const zone = s.zones.find(z => z.kind === 'home');
            if (s.dashTime <= 0 && Math.hypot(s.player.x - zone.x, s.player.y - zone.y) < zone.radius - 20) break;
            set('KeyA', s.player.x > zone.x + 8); set('KeyD', s.player.x < zone.x - 8);
            set('KeyW', s.player.y > zone.y + 8); set('KeyS', s.player.y < zone.y - 8);
            window.advanceTime(100);
          }
        } finally { [...held].forEach(code => set(code, false)); }
      });
      const workout = await mobile.getByRole('button', { name: '锻炼 E', exact: true }).boundingBox();
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 3, x: workout.x + workout.width / 2, y: workout.y + workout.height / 2 }] });
      await mobile.evaluate(() => window.advanceTime(2500));
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      const trained = await read(mobile);
      assert.equal(trained.phase, 'upgrade'); assert.ok(Object.values(trained.workouts).some(n => n > 0));
      const choice = mobile.getByTestId('fitness-upgrade').first();
      const choiceRect = await choice.boundingBox(); assert.ok(choiceRect.y >= 0 && choiceRect.y + choiceRect.height <= 844);
      await shot(mobile, `mobile-${width}-upgrade`); await choice.tap();
      assert.equal((await read(mobile)).phase, 'playing');
      checks.push(`${width}px collapsed body HUD, expand, no overflow, two-touch dash, touch training/upgrade`);
      await mobile.close();
    }
    for (const activation of ['mouse', 'Enter', 'Space']) {
      const controls = await pageFor(390, 844);
      await controls.locator('#start-fitness').tap();
      const dashControl = controls.getByRole('button', { name: '冲刺 Space', exact: true });
      if (activation === 'mouse') await dashControl.click();
      else { await dashControl.focus(); await controls.keyboard.press(activation); }
      await controls.evaluate(() => window.advanceTime(100));
      assert.equal((await read(controls)).dashUses, 1, activation);
      await controls.evaluate(() => window.advanceTime(3000));
      assert.equal((await read(controls)).dashUses, 1, `${activation} must not repeat`);
      await controls.close();
    }
    checks.push('mouse and native Enter/Space button activation once, touch cancellation clears joystick');
    const realtime = await pageFor(1100, 850);
    // New document restores the normal RAF clock, without advanceTime.
    await realtime.reload(); await realtime.waitForFunction(() => !!window.render_game_to_text);
    await realtime.locator('#start-fitness').click();
    const before = await read(realtime);
    await realtime.keyboard.down('d'); await realtime.waitForTimeout(600); await realtime.keyboard.up('d');
    const after = await read(realtime);
    assert.ok(after.player.x > before.player.x + 50 && after.elapsed > before.elapsed + 0.3);
    await shot(realtime, 'desktop-realtime'); await realtime.close();
    checks.push('normal RAF movement');
    assert.deepEqual(errors, []); report.passed = true;
    console.log(JSON.stringify({ passed: true, screenshots: shots.length, checks, errors }));
  } finally {
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
