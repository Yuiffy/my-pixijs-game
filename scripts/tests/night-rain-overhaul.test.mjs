import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypescriptModule as load } from './helpers/load-typescript-module.mjs';
const { createGame } = await load('src/components/nightRain/engine.ts');
const { createWarningBuffers, writeGroundWarning, WARNING_CLEARANCE } = await load('src/components/nightRain/groundWarning.ts');
const { supportAt, canOccupy, SURFACES } = await load('src/components/nightRain/world.ts');

function warning(position, facing = 0, kind = 'guard', attackIndex = 0) {
  const state = createGame();
  const enemy = { ...state.enemies.find(e => e.kind === kind), ...position, facing, attackIndex, phase: 2 };
  const buffers = createWarningBuffers(enemy);
  const count = writeGroundWarning(buffers, enemy, state);
  assert.ok(count > 0, 'reachable floor produces triangles');
  assert.ok(count * 3 <= buffers.positions.length);
  const vertices = Array.from({ length: count }, (_, i) => ({ x: buffers.positions[i * 3] + enemy.x, y: buffers.positions[i * 3 + 1] + enemy.y, z: buffers.positions[i * 3 + 2] + enemy.z }));
  return { vertices, count, enemy };
}

function visibleFloor(x, z, ceiling) {
  let top = supportAt(x, z, ceiling);
  for (const s of SURFACES) {
    if (s.endY === undefined || s.endY === s.y || x < s.x1 || x > s.x2 || z < s.z1 || z > s.z2) continue;
    const steps = Math.round(Math.abs(s.endY - s.y) / .22);
    const tread = Math.min(steps - 1, Math.floor(((z - s.z1) / (s.z2 - s.z1)) * steps));
    const height = s.y + (s.endY - s.y) * ((tread + .5) / steps);
    if (height <= ceiling) top = Math.max(top ?? -Infinity, height);
  }
  return top;
}

test('warnings follow uphill/downhill ramps and clear the actual rendered stair treads', () => {
  for (const z of [-19, -13, -7]) for (const facing of [0, Math.PI, Math.PI / 2]) {
    const y = supportAt(-15.5, z, 7);
    const { vertices } = warning({ x: -15.5, y, z }, facing);
    assert.ok(Math.max(...vertices.map(v => v.y)) - Math.min(...vertices.map(v => v.y)) > .15);
    for (let i = 0; i < vertices.length; i += 3) {
      const triangle = vertices.slice(i, i + 3);
      for (const weights of [[1/3, 1/3, 1/3], [.1,.45,.45], [.45,.1,.45], [.45,.45,.1]]) {
        const v = { x: 0, y: 0, z: 0 };
        for (let j = 0; j < 3; j++) for (const axis of ['x','y','z']) v[axis] += triangle[j][axis] * weights[j];
        const floor = visibleFloor(v.x, v.z, v.y + .1);
        assert.notEqual(floor, null);
        assert.ok(v.y > floor + .01, `warning below a tread at ${JSON.stringify(v)}, floor ${floor}`);
      }
    }
  }
});

test('warning stays below the ferry canopy instead of choosing the highest surface', () => {
  const { vertices } = warning({ x: 17, y: 0, z: -30 }, Math.PI / 2);
  for (const v of vertices) assert.ok(Math.abs(v.y - WARNING_CLEARANCE) < .00001);
});

test('warning clips at voids and does not pour from an upper roof onto the quay', () => {
  const { vertices } = warning({ x: 32, y: 4, z: -25 }, Math.PI, 'boss', 2);
  for (const v of vertices) {
    assert.ok(Math.abs(v.y - (4 + WARNING_CLEARANCE)) < .00001);
    assert.notEqual(supportAt(v.x, v.z, 4.01), null);
    assert.ok(v.z >= -26.001);
  }
});

test('all attack phases fit preallocated buffers and repeated projection has no stale triangles', () => {
  const state = createGame();
  for (const enemy of state.enemies) {
    const buffers = createWarningBuffers(enemy);
    for (const phase of [1,2]) for (const attackIndex of [0,1,2]) {
      const count = writeGroundWarning(buffers, { ...enemy, phase, attackIndex }, state);
      assert.ok(count * 3 <= buffers.positions.length);
      assert.ok(buffers.positions.subarray(0, count * 3).every(Number.isFinite));
    }
    assert.equal(writeGroundWarning(buffers, { ...enemy, x: 500, z: 500 }, state), 0);
  }
});

test('danger warnings clear visible treads across every reachable authored ramp', () => {
  const access = createGame(); let checked = 0;
  for (const surface of SURFACES.filter(s => s.endY !== undefined && s.endY !== s.y)) {
    const x = (surface.x1 + surface.x2) / 2;
    const z = (surface.z1 + surface.z2) / 2;
    const y = supportAt(x, z, (surface.y + surface.endY) / 2 + .1);
    if (y === null || !canOccupy(x, z, y, access)) continue;
    const { vertices } = warning({ x, y, z }, 0, 'boss', 2);
    for (let i = 0; i < vertices.length; i += 3) {
      const v = { x: 0, y: 0, z: 0 };
      for (let j = 0; j < 3; j++) for (const axis of ['x','y','z']) v[axis] += vertices[i + j][axis] / 3;
      const floor = visibleFloor(v.x, v.z, v.y + .1);
      assert.ok(floor !== null && v.y > floor + .01, surface.id + ' warning is buried');
    }
    checked++;
  }
  assert.ok(checked >= 25, 'covers the old city, chapter, valley and underground slopes');
});
