import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';

const camera = await loadTypescriptModule('src/components/liuzhou/camera.ts');
const { terrainHeight } = await loadTypescriptModule('src/components/liuzhou/terrain.ts');
const target = { x: 1000, y: terrainHeight({ x: 1000, z: 6 }) + 1.4, z: 6 };
const wall = [{ id: 'camera-fixture', x: 1000, z: 0, w: 20, d: 10, h: 100, angle: 0 }];
const heading = (p, center) => Math.atan2(center.x - p.x, center.z - p.z);
const angleError = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

test('first wall encounter shortens the camera without taking over the requested heading', () => {
  let yaw = 0;
  for (let frame = 0; frame < 120; frame++) {
    const view = camera.resolveCamera(target, yaw, 0.12, 10, wall);
    assert.ok(view.distance < 1, 'camera retracts in front of nearby wall');
    assert.equal(view.yaw, 0, 'collision must not become permanent mouse input');
    assert.ok(angleError(heading(view, target), 0) < 1e-9);
    assert.equal(camera.cameraBlocked(view, wall[0]), false);
    yaw = view.yaw;
  }
});

test('repeated clockwise and counterclockwise orbits retain heading on either side of a wall', () => {
  for (const direction of [-1, 1]) for (let orbit = 0; orbit < 2; orbit++) {
    for (let i = 0; i <= 360; i++) {
      const yaw = direction * (orbit * 2 * Math.PI + i * Math.PI / 180);
      const view = camera.resolveCamera(target, yaw, 0.12, 10, wall);
      assert.equal(view.yaw, yaw);
      assert.ok(angleError(heading(view, target), yaw) < 1e-8);
      assert.equal(camera.cameraBlocked(view, wall[0]), false);
    }
  }
});
