const { quietContext } = require('./liuzhou-test-browser.cjs');
const assert = require('node:assert/strict');
const { travel } = require('./liuzhou-pilot.cjs');
const { mouseLook } = require('./liuzhou-mouse.cjs');
const state = p => p.evaluate(() => JSON.parse(window.render_game_to_text()));
const point = (x, z) => ({ x: -2.8 + x, z: -2.2 + z });

// Deterministic ordinary walking. No position, height, camera or save writes.
async function walkTo(p, target, tolerance = 0.3) {
  for (let tick = 0; tick < 1800; tick += 6) {
    const s = await state(p);
    if (Math.hypot(s.player.x - target.x, s.player.z - target.z) < tolerance) {
      await p.evaluate(() => window.liuzhouTest.move({}, 24)); return;
    }
    await p.evaluate(target => {
      const t = window.liuzhouTest;
      for (let i = 0; i < 6; i++) {
        const desired = Math.atan2(target.x - t.game.player.x, target.z - t.game.player.z) - t.rig.yaw;
        t.move({ forward: Math.cos(desired), turn: -Math.sin(desired) }, 1);
      }
    }, target);
  }
  throw new Error(`Walk stalled ${JSON.stringify({ target, state: await state(p) })}`);
}
async function look(p, yaw, pitch = 0.2) {
  const before = await state(p);
  const dx = -Math.atan2(Math.sin(yaw - before.controls.yaw), Math.cos(yaw - before.controls.yaw)) / 0.003;
  const dy = (pitch - before.controls.pitch) / 0.003;
  await mouseLook(p, dx, dy);
  await p.waitForTimeout(300);
}
exports.runDongmen = async ({ page: p, browser, capture, report }) => {
  await travel(p, point(0, 35), { tolerance: 0.6 });
  await look(p, Math.PI, -0.15); await capture(p, 'dongmen-01-front');
  assert.ok((await state(p)).controls.pitch < 0, 'mouse can look up at the upper roof');
  await look(p, Math.PI, 0.16);
  await walkTo(p, point(0, 6)); await capture(p, 'dongmen-02-enter-arch');
  await walkTo(p, point(0, -13));
  assert.ok((await state(p)).player.z < -14, 'cross the entire real tunnel');
  await look(p, 0, 0.18); await capture(p, 'dongmen-03-north-exit');
  await travel(p, point(-16.4, 15.5), { tolerance: 0.5 });
  await look(p, Math.PI, 0.3); await capture(p, 'dongmen-04-stair-foot');
  await walkTo(p, point(-16.4, -5.3));
  assert.ok((await state(p)).player.y > 6.1, 'actual Rapier stairs raised the player');
  await walkTo(p, point(-11.5, -5.3));
  await walkTo(p, point(-11.5, 7.2));
  await look(p, 0.45, 0.22); await capture(p, 'dongmen-05-terrace');
  await p.keyboard.press('KeyP'); assert.ok((await state(p)).stamps.includes('gate'));
  const beforePause = await state(p); await p.keyboard.press('Escape');
  await p.evaluate(() => window.advanceTime(1500));
  assert.equal((await state(p)).player.y, beforePause.player.y);
  await p.getByRole('button', { name: '回到街上 ↗' }).click();
  await p.evaluate(() => window.liuzhouTest.move({ jump: true }, 1));
  await p.evaluate(() => window.liuzhouTest.move({}, 18));
  assert.ok((await state(p)).player.y > 6.8, 'jump works on elevated ground');
  await p.evaluate(() => window.liuzhouTest.move({}, 100));
  await p.keyboard.press('Escape');
  const earnedSave = await p.evaluate(() => localStorage.getItem('liuzhou-riverside-v1'));
  await p.reload(); await p.getByRole('button', { name: /继续这趟旅行 ↗|走进柳州 ↗/ }).waitFor();
  await p.evaluate(() => window.liuzhouTest.manual(true));
  await p.getByRole('button', { name: /继续这趟旅行 ↗|走进柳州 ↗/ }).click();
  await p.evaluate(() => window.liuzhouTest.move({}, 30));
  assert.ok((await state(p)).player.y > 6.1, 'refresh keeps supported terrace height');
  await look(p, Math.PI / 2, 0.2); await capture(p, 'dongmen-06-restored-terrace');
  await walkTo(p, point(-11.5, -5.3)); await walkTo(p, point(-16.4, -5.3));
  await walkTo(p, point(-16.4, 16));
  assert.ok((await state(p)).player.y < 0.1, 'walk back down without resetting coordinates');
  await look(p, 1.9, 0.2); await capture(p, 'dongmen-07-back-on-street');
  report.checks.push('Dongmen: normal-input tunnel crossing; actual 31-tread Rapier ascent, landing opening, terrace, elevated jump, pause, earned save refresh, full descent; no native system mouse capture');
  const ctx = await quietContext(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  try {
    await ctx.route(/https:\/\/(pagead2\.googlesyndication\.com|hm\.baidu\.com)\//, r => r.fulfill({ body: '' }));
    await ctx.addInitScript(save => {
      if (window.speechSynthesis) window.speechSynthesis.speak = () => {};
      localStorage.setItem('liuzhou-riverside-v1', save);
    }, earnedSave);
    const m = await ctx.newPage();
    m.on('pageerror', e => report.errors.push(e.message));
    m.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
    await m.goto(p.url());
    await m.getByRole('button', { name: /继续这趟旅行 ↗|走进柳州 ↗/ }).click();
    await m.evaluate(() => { window.liuzhouTest.manual(true); window.liuzhouTest.move({}, 30); });
    assert.ok((await state(m)).player.y > 6.1);
    await capture(m, 'dongmen-08-touch-terrace');
    const cdp = await ctx.newCDPSession(m);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 280, y: 400, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 280, y: 320, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert.ok((await state(m)).controls.pitch < 0, 'touch can look up too');
    const b = await m.getByRole('button', { name: '向前', exact: true }).boundingBox();
    const before = (await state(m)).player;
    await m.evaluate(() => window.liuzhouTest.manual(false));
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b.x + b.width / 2, y: b.y + b.height / 2, id: 2 }] });
    await m.waitForFunction(before => Math.hypot(window.liuzhouTest.game.player.x - before.x, window.liuzhouTest.game.player.z - before.z) > 0.6, before);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await m.evaluate(() => window.liuzhouTest.manual(true));
    assert.ok(Math.hypot((await state(m)).player.x - before.x, (await state(m)).player.z - before.z) > 0.5);
    await m.setViewportSize({ width: 844, height: 390 });
    await capture(m, 'dongmen-09-touch-landscape');
    await m.getByRole('button', { name: '地图', exact: true }).tap();
    await capture(m, 'dongmen-10-touch-map');
    report.checks.push('earned terrace save on touch device; portrait/landscape, upward drag look, actual touch-button walking and map');
  } finally { await ctx.close(); }
};
