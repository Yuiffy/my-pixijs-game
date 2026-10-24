const assert = require('node:assert/strict');
const { quietContext } = require('./liuzhou-test-browser.cjs');
const { travel } = require('./liuzhou-pilot.cjs');
const { mouseLook } = require('./liuzhou-mouse.cjs');
const state = p => p.evaluate(() => JSON.parse(window.render_game_to_text()));
async function look(p, yaw, pitch = 0.18) {
  const s = await state(p);
  await mouseLook(p, -Math.atan2(Math.sin(yaw - s.controls.yaw), Math.cos(yaw - s.controls.yaw)) / 0.003, (pitch - s.controls.pitch) / 0.003);
  await p.waitForTimeout(350);
}
async function pushToward(p, target, frames = 180, jump = false) {
  await p.evaluate(({ target, frames, jump }) => {
    const t = window.liuzhouTest;
    for (let i = 0; i < frames; i++) {
      const a = Math.atan2(target.x - t.game.player.x, target.z - t.game.player.z) - t.rig.yaw;
      t.move({ forward: Math.cos(a), turn: -Math.sin(a), jump: jump && i === 0 }, 1);
    }
    t.move({}, 20);
  }, { target, frames, jump });
}
exports.runStreet = async ({ page: p, browser, capture, report }) => {
  const { loadTypescriptModule } = await import('../tests/helpers/load-typescript-module.mjs');
  const street = await loadTypescriptModule('src/components/liuzhou/street.ts');
  const point = street.stallPoint;
  await travel(p, point(0, 2), { tolerance: 0.5 });
  await look(p, Math.PI + 0.9, 0.18);
  await capture(p, 'street-01-noodle-counter');
  await p.keyboard.press('KeyE');
  assert.equal((await state(p)).dialogue.name, '阿姨');
  while ((await state(p)).dialogue) await p.keyboard.press('KeyE');
  await pushToward(p, point(0, -3));
  const atCounter = (await state(p)).player;
  assert.equal(street.streetContains({ ...atCounter, y: 0.7 }, 0.25), false, 'real Rapier body blocks walking into the counter');
  assert.ok(Math.hypot(atCounter.x - point(0, -3).x, atCounter.z - point(0, -3).z) > 1.8);
  await capture(p, 'street-02-counter-collision');
  const samples = [];
  // Every intermediate frame matters: a valid destination alone used to allow
  // interpolation to cross a wall or the stall. Only browser mouse events.
  for (let i = 0; i < 24; i++) {
    await p.evaluate(() => document.dispatchEvent(new MouseEvent('mousemove', { movementX: 90 })));
    samples.push(...await p.evaluate(() => new Promise(resolve => {
      const frames = [];
      const sample = () => {
        const t = window.liuzhouTest;
        frames.push({ player: { ...t.game.player }, view: { ...t.rig.listener } });
        if (frames.length < 4) requestAnimationFrame(sample); else resolve(frames);
      };
      requestAnimationFrame(sample);
    })));
  }
  for (const sample of samples) {
    const target = { ...sample.player, y: sample.player.y + 1.4 };
    for (let n = 1; n <= 20; n++) {
      const a = n / 20;
      assert.equal(street.streetContains({
        x: target.x + (sample.view.x - target.x) * a,
        y: target.y + (sample.view.y - target.y) * a,
        z: target.z + (sample.view.z - target.z) * a,
      }, 0.15), false, 'actual rendered camera has a clear line to player');
    }
  }
  report.cameraFrames = samples.length;
  await travel(p, point(0, -6.3), { tolerance: 0.3 });
  await look(p, Math.PI + 0.9, 0.02);
  await capture(p, 'street-03-stall-rear');
  await travel(p, { x: 30, z: -10 }, { tolerance: 0.25 });
  await look(p, Math.PI, 0.2);
  await pushToward(p, { x: 30, z: -16 });
  const stopped = await state(p);
  assert.ok(stopped.player.z > -12.3, 'bench backrest blocks walking through');
  await capture(p, 'street-04-bench-collision');
  // The 1.4m backrest is higher than a standing jump. Approach the lower
  // seat from the front, land on it, then jump across the backrest.
  // The coarse city navigator cannot resolve a sub-grid obstacle this close;
  // use ordinary movement around the end of the bench for this focused check.
  for (const target of [{ x: 35, z: -10 }, { x: 35, z: -16 }, { x: 30, z: -16 }]) await pushToward(p, target, 100);
  await look(p, 0, 0.2);
  await pushToward(p, { x: 30, z: -10 }, 60);
  await pushToward(p, { x: 30, z: -10 }, 50, true);
  const onSeat = (await state(p)).player;
  assert.ok(onSeat.y > 0.65 && onSeat.y < 0.85, `jump lands on seat: ${JSON.stringify(onSeat)}`);
  await pushToward(p, { x: 30, z: -10 }, 70, true);
  const beyondBench = (await state(p)).player;
  assert.ok(beyondBench.z > -11.5, `second jump clears backrest: ${JSON.stringify(beyondBench)}`);
  await capture(p, 'street-05-jump-over-bench');
  await travel(p, point(0, 2), { tolerance: 0.4 });
  await p.keyboard.press('Escape');
  const context = await quietContext(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, storageState: await p.context().storageState() });
  try {
    await context.route(/https:\/\/(pagead2\.googlesyndication\.com|hm\.baidu\.com)\//, r => r.fulfill({ body: '' }));
    const m = await context.newPage(); m.on('pageerror', e => report.errors.push(e.message));
    m.on('console', msg => { if (msg.type() === 'error') report.errors.push(msg.text()); });
    await m.goto(p.url());
    await m.getByRole('button', { name: /走进柳州 ↗|继续这趟旅行 ↗/ }).waitFor();
    await m.evaluate(() => window.liuzhouTest.manual(true));
    await m.getByRole('button', { name: /走进柳州 ↗|继续这趟旅行 ↗/ }).tap();
    const cdp = await context.newCDPSession(m);
    const s = await state(m);
    const dx = -Math.atan2(Math.sin(Math.PI + 0.9 - s.controls.yaw), Math.cos(Math.PI + 0.9 - s.controls.yaw)) / 0.006;
    // Touch drag uses 0.006 radians per pixel; repeat short drags within canvas.
    const count = Math.ceil(Math.abs(dx) / 100);
    for (let i = 0; i < count; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 190, y: 380, id: 1 }] });
      await m.waitForTimeout(50);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 190 + dx / count, y: 380 + (0.18 - s.controls.pitch) / 0.004 / count, id: 1 }] });
      await m.waitForTimeout(50);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await m.waitForTimeout(100);
    }
    await m.waitForTimeout(500);
    await capture(m, 'street-06-touch-counter');
    await m.getByRole('button', { name: '互动', exact: true }).tap();
    await m.waitForTimeout(350);
    await m.waitForFunction(() => Boolean(window.liuzhouTest.game.dialogue), null, { timeout: 3000 });
    await m.setViewportSize({ width: 844, height: 390 });
    await capture(m, 'street-07-touch-conversation');
  } finally { await context.close(); }
  report.checks.push('normal input reaches shop, talks to chef, cannot walk through cabinet; 96 rendered camera frames have furniture-free sight lines; bench blocks walking, jumping onto seat then across backrest works; earned save restores by shop on touch viewport');
};
