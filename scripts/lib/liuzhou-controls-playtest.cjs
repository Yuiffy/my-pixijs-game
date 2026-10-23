const assert = require('node:assert/strict');
const { travel } = require('./liuzhou-pilot.cjs');
const state = p => p.evaluate(() => JSON.parse(window.render_game_to_text()));
async function locked(p, value) {
  await p.waitForFunction(v => (document.pointerLockElement !== null) === v, value);
  await p.waitForFunction(v => JSON.parse(window.render_game_to_text()).controls.pointerLocked === v, value);
}
async function runControls({ page: p, capture, report }) {
  await locked(p, true);
  // Position the browser's virtual pointer before measuring the next movement;
  // the move from the entry button also contributes movementX/Y to look.
  await p.mouse.move(720, 440);
  const beforeLook = await state(p);
  await p.mouse.move(820, 480, { steps: 10 });
  const looked = await state(p);
  assert.ok(looked.controls.yaw < beforeLook.controls.yaw - 0.15, 'unbuttoned right mouse movement looks right');
  assert.ok(looked.controls.pitch > beforeLook.controls.pitch + 0.05, 'down mouse looks down');
  await p.evaluate(() => window.liuzhouTest.manual(false));
  for (const [key, direction] of [['KeyD', 1], ['KeyA', -1]]) {
    const before = await state(p);
    await p.keyboard.down(key); await p.waitForTimeout(360); await p.keyboard.up(key);
    const after = await state(p), yaw = before.controls.yaw;
    const projected = (after.player.x - before.player.x) * -Math.cos(yaw) + (after.player.z - before.player.z) * Math.sin(yaw);
    assert.ok(projected * direction > 0.4, `${key} screen direction ${projected}`);
  }
  await capture(p, 'controls-01-mouse-look');
  await p.keyboard.press('Escape'); await locked(p, false);
  assert.equal((await state(p)).phase, 'paused');
  const frozen = (await state(p)).player; await p.waitForTimeout(200);
  assert.deepEqual((await state(p)).player, frozen);
  await capture(p, 'controls-02-escape');
  await p.getByRole('button', { name: '回到街上 ↗' }).click(); await locked(p, true);
  // Also cover browsers that deliver only pointerlockchange on native Escape.
  await p.evaluate(() => document.exitPointerLock()); await locked(p, false);
  assert.equal((await state(p)).phase, 'paused');
  await p.getByRole('button', { name: '回到街上 ↗' }).click(); await locked(p, true);
  await p.keyboard.down('Alt'); await locked(p, false);
  assert.equal((await state(p)).phase, 'playing');
  await p.getByRole('button', { name: '打开街区地图' }).click();
  await p.keyboard.up('Alt'); assert.equal((await state(p)).phase, 'paused');
  await capture(p, 'controls-03-map-cursor');
  await p.getByRole('button', { name: '回到街上 ↗' }).click(); await locked(p, true);
  await p.keyboard.press('KeyM'); await locked(p, false);
  await p.keyboard.press('KeyM'); await locked(p, true);
  await p.evaluate(() => window.liuzhouTest.manual(true));
  await travel(p, { x: 28, z: -23 });
  await p.keyboard.press('KeyE'); await locked(p, false);
  assert.ok((await state(p)).dialogue);
  await capture(p, 'controls-04-dialogue-cursor');
  for (let i = 0; (await state(p)).dialogue && i < 12; i++) await p.keyboard.press('KeyE');
  await locked(p, true);
  await travel(p, { x: 42, z: -8 }); await p.keyboard.press('KeyE');
  assert.equal((await state(p)).vehicle, 'bike-1');
  const bike = await state(p);
  await p.evaluate(() => window.liuzhouTest.manual(false));
  await p.keyboard.down('KeyW'); await p.keyboard.down('KeyD'); await p.waitForTimeout(650);
  await p.keyboard.up('KeyD'); await p.keyboard.up('KeyW');
  const turned = await state(p);
  assert.ok(Math.atan2(Math.sin(turned.player.angle - bike.player.angle), Math.cos(turned.player.angle - bike.player.angle)) < -0.03);
  await capture(p, 'controls-05-bike-right');
  await p.evaluate(() => window.dispatchEvent(new Event('blur'))); await locked(p, false);
  assert.equal((await state(p)).phase, 'paused');
  report.checks.push('browser-only virtual pointer-lock lifecycle on entry; unbuttoned mouse look; keyboard A/D projected screen direction; Escape and lockchange-only pause; click resume recaptures; Alt cursor and clickable map; keyboard map recaptures; dialogue releases/reacquires; actual bike right steering; blur releases and pauses; native system pointer capture disabled');
}
module.exports = { runControls };
