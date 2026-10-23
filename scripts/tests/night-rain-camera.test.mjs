import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';
const { constrainNightCamera, nightCameraBlocked } = await loadTypescriptModule('src/components/nightRain/camera.ts');
const { followCameraBoom } = await loadTypescriptModule('src/components/gameCamera/boom.ts');
const target = { x: 3.2, y: 1.3, z: -5.5 };
const access = { shortcut: false, templeGate: false, harborGate: false };

test('Night Rain shares radial occlusion handling at a real house without switching sides', () => {
  assert.equal(nightCameraBlocked(target, access), false);
  let previous;
  for (const direction of [-1, 1]) for (let lap = 0; lap < 2; lap++) for (let i = 0; i <= 180; i++) {
    const yaw = direction * (lap * 2 * Math.PI + i * Math.PI / 90);
    const desired = { x: target.x + Math.sin(yaw) * 6.5, y: target.y + 2, z: target.z + Math.cos(yaw) * 6.5 };
    const allowed = constrainNightCamera(target, desired, access);
    const actual = followCameraBoom(target, allowed, previous, 1 / 60);
    previous = actual.distance;
    const dx = actual.x - target.x, dz = actual.z - target.z;
    assert.ok(Math.abs(dx * Math.cos(yaw) - dz * Math.sin(yaw)) < 1e-8);
    assert.ok(dx * Math.sin(yaw) + dz * Math.cos(yaw) >= -1e-8);
    assert.equal(nightCameraBlocked(actual, access), false);
  }
  const wall = constrainNightCamera(target, { ...target, z: target.z - 6.5 }, access);
  assert.ok(Math.hypot(wall.x - target.x, wall.z - target.z) < 2);
});
