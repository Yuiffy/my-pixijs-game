const assert = require('node:assert/strict');
const { travel } = require('./liuzhou-pilot.cjs');
const difference = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
const state = p => p.evaluate(() => JSON.parse(window.render_game_to_text()));
async function snapshot(p) {
  return p.evaluate(() => {
    const t = window.liuzhouTest;
    return { yaw: t.rig.yaw, pitch: t.rig.pitch, listener: { ...t.rig.listener }, position: t.rig.framing().position, player: { ...t.game.player } };
  });
}
async function aim(p, yaw, pitch = 0.12) {
  const before = await state(p);
  await p.evaluate(({ dx, dy }) => document.dispatchEvent(new MouseEvent('mousemove', { movementX: dx, movementY: dy })), { dx: (before.controls.yaw - yaw) / 0.003, dy: (pitch - before.controls.pitch) / 0.003 });
  await p.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
function check(frame, yaw, pitch) {
  // MouseEvent movementX/Y are integer browser fields (0.003 rad per pixel).
  assert.ok(difference(frame.yaw, yaw) < 0.00301, `obstacle changed input heading ${yaw} -> ${frame.yaw}`);
  assert.ok(Math.abs(frame.pitch - pitch) < 0.00301);
  const direction = Math.atan2(frame.listener.fx, frame.listener.fz);
  assert.ok(difference(direction, frame.yaw) < 1e-6, `rendered camera reversed ${frame.yaw} -> ${direction}`);
  assert.ok(frame.position.every(Number.isFinite));
  const dx = frame.player.x - frame.position[0], dz = frame.player.z - frame.position[2];
  if (Math.hypot(dx, dz) > 0.01) assert.ok(difference(Math.atan2(dx, dz), frame.yaw) < 1e-6, 'camera must remain on the requested ray during extension');
}
async function runCamera({ page: p, capture, report }) {
  await p.waitForFunction(() => document.pointerLockElement !== null);
  await travel(p, { x: 13, z: -2 }, { tolerance: 0.35 });
  await aim(p, Math.PI / 2);
  report.camera = { first: await snapshot(p), traces: [] };
  await capture(p, 'camera-01-first-wall');
  if (process.env.LIUZHOU_CAMERA_BASELINE === '1') {
    report.camera.reproduced = difference(report.camera.first.yaw, Math.PI / 2) > 0.1;
    assert.ok(report.camera.reproduced, 'baseline should reproduce the automatic heading takeover');
    return;
  }
  check(report.camera.first, Math.PI / 2, 0.12);
  for (const direction of [1, -1]) {
    for (let lap = 0; lap < 2; lap++) {
      for (let i = 0; i <= 96; i++) {
        const yaw = Math.PI / 2 + direction * (lap * 2 * Math.PI + i * Math.PI / 48);
        await aim(p, yaw);
        const frame = await snapshot(p);
        check(frame, yaw, 0.12);
        report.camera.traces.push({ yaw, renderedYaw: Math.atan2(frame.listener.fx, frame.listener.fz), distance: Math.hypot(frame.player.x - frame.position[0], frame.player.z - frame.position[2]) });
      }
    }
    await capture(p, direction > 0 ? 'camera-02-repeat-clockwise' : 'camera-03-repeat-counterclockwise');
  }
  // Fast half-turns used to interpolate the camera across the player. Check
  // actual rendered direction and position, including the first extension frame.
  for (const yaw of [-Math.PI / 2, Math.PI / 2, -Math.PI / 2]) { await aim(p, yaw); check(await snapshot(p), yaw, 0.12); }
  await p.waitForTimeout(600);
  report.camera.open = await snapshot(p);
  assert.ok(Math.hypot(report.camera.open.player.x - report.camera.open.position[0], report.camera.open.player.z - report.camera.open.position[2]) > 6);
  await capture(p, 'camera-04-clear-side');
  for (const pitch of [-0.65, 0.95]) { await aim(p, Math.PI / 2, pitch); check(await snapshot(p), Math.PI / 2, pitch); }
  await aim(p, Math.PI / 2);
  await p.keyboard.press('Escape');
  await p.getByRole('button', { name: '回到街上 ↗' }).click();
  await p.waitForFunction(() => document.pointerLockElement !== null);
  // Clicking the resume button emits browser-only movement, so aim after it.
  await aim(p, Math.PI / 2); check(await snapshot(p), Math.PI / 2, 0.12);
  await p.setViewportSize({ width: 390, height: 844 });
  await aim(p, Math.PI / 2); check(await snapshot(p), Math.PI / 2, 0.12);
  await capture(p, 'camera-05-portrait-wall');
  report.checks.push('first and repeated gate-wall occlusion; two full clockwise and counterclockwise orbits; every sampled rendered heading and camera ray follows mouse input; fast half-turns; ground/roof pitch limits; extension recovery; pause/resume and portrait; virtual Pointer Lock only');
}
module.exports = { runCamera };
