import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';
const { clipCameraBoom, followCameraBoom } = await loadTypescriptModule('src/components/gameCamera/boom.ts');
const target = { x: 0, y: 1.3, z: 0 };

test('shared boom clips before a thin obstacle and never smooths through it', () => {
  const blocked = p => p.z > 1.95 && p.z < 2.25;
  const allowed = clipCameraBoom(target, { ...target, z: 8 }, blocked);
  const camera = followCameraBoom(target, allowed, 8, 1 / 60);
  assert.ok(camera.z < 1.95);
  for (let t = 0; t <= 1; t += 0.01) assert.equal(blocked({ ...target, z: camera.z * t }), false);
});

test('a fast half-turn extends on the new ray without passing across the player', () => {
  const previous = followCameraBoom(target, { ...target, z: 8 }, undefined, 1 / 60);
  const reversed = followCameraBoom(target, { ...target, z: -8 }, previous.distance, 1 / 60);
  assert.equal(reversed.z, -8);
  const retracted = followCameraBoom(target, { ...target, z: -0.4 }, reversed.distance, 1 / 60);
  const extension = followCameraBoom(target, { ...target, x: 8, z: 0 }, retracted.distance, 1 / 60);
  assert.equal(extension.z, 0); assert.ok(extension.x > 0.4 && extension.x < 8);
});

test('extension is frame-rate independent and reset snaps to the safe destination', () => {
  const desired = { ...target, z: 8 };
  const run = frames => { let d = 1; for (let i = 0; i < frames; i++) d = followCameraBoom(target, desired, d, 1 / frames).distance; return d; };
  assert.ok(Math.abs(run(30) - run(144)) < 1e-9);
  assert.equal(followCameraBoom(target, desired, 1, 0, true).distance, 8);
});

test('zero clearance and moving targets do not leave an old world-space camera behind', () => {
  const zero = followCameraBoom(target, target, 8, 1 / 60);
  assert.deepEqual(zero, { ...target, distance: 0 });
  const moved = { x: 100, y: 30, z: -500 };
  const recovered = followCameraBoom(moved, { ...moved, x: 105 }, zero.distance, 1 / 60);
  assert.equal(recovered.y, moved.y); assert.equal(recovered.z, moved.z);
  assert.ok(recovered.x > 100 && recovered.x < 105);
});
