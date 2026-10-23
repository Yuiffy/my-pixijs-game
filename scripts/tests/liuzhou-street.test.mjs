import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';

const street = await loadTypescriptModule('src/components/liuzhou/street.ts');
const camera = await loadTypescriptModule('src/components/liuzhou/camera.ts');
const sim = await loadTypescriptModule('src/components/liuzhou/simulation.ts');
const { terrainHeight } = await loadTypescriptModule('src/components/liuzhou/terrain.ts');
const point = (x, z, y = 1.4) => {
  const p = street.stallPoint(x, z);
  return { ...p, y: terrainHeight(p) + y };
};

test('the stall has a solid counter, a thin roof and sign, with open service space in front', () => {
  assert.equal(street.streetContains(point(0, -3, 0.7)), true);
  assert.equal(street.streetContains(point(0, -3, 1.8)), false, 'human-height view stays open above the counter');
  assert.equal(street.streetContains(point(0, -5, 3)), true);
  assert.equal(street.streetContains(point(0, -0.4, 3.5)), true);
  assert.equal(street.streetContains(point(0, 0)), false);
  assert.equal(street.streetContains(point(0, -5, 1.4)), false, 'space below the roof stays open');
  const g = sim.createGame();
  for (const p of [g.player, ...g.npcs, ...g.vehicles, ...sim.QUESTS]) {
    assert.equal(street.streetContains({ ...p, y: terrainHeight(p) + 1 }, 0.4), false, p.id || p.title);
  }
});

test('camera collision covers the stall and benches, including the interpolated segment', () => {
  const target = point(0, 0);
  for (let yaw = -Math.PI; yaw <= Math.PI; yaw += 0.1) {
    const v = camera.resolveCamera(target, yaw, 0.12, 10);
    assert.ok(v.distance > 2.4);
    assert.equal(street.streetContains(v, 0.18), false);
    for (let t = 0; t < 1; t += 0.05) assert.equal(street.streetContains({
      x: target.x + (v.x - target.x) * t, y: target.y + (v.y - target.y) * t, z: target.z + (v.z - target.z) * t,
    }, 0.18), false);
  }
  const lowTarget = point(0, 0, 0.8);
  const blocked = point(0, -8, 0.8);
  const clipped = camera.constrainCamera(lowTarget, blocked);
  assert.ok(Math.hypot(clipped.x - lowTarget.x, clipped.z - lowTarget.z) < 1.5);
  assert.equal(street.streetContains(clipped, 0.18), false);
  assert.notDeepEqual(clipped, blocked, 'smoothing cannot jump to the far side of a cabinet');
  const benchY = terrainHeight({ x: 30, z: -13 });
  const benchTarget = { x: 30, z: -11, y: benchY + 1.2 };
  const benchView = camera.constrainCamera(benchTarget, { x: 30, z: -17, y: benchY + 1.2 });
  assert.ok(benchView.z > -13);
});

test('legacy saves inside the new counter or benches leave the furniture without losing chapter progress', () => {
  let saved;
  globalThis.localStorage = { setItem: (_, value) => { saved = value; }, getItem: () => saved };
  try {
    const g = sim.createGame(); g.stage = 3; g.money = 73;
    Object.assign(g.player, point(0, -3, 0));
    Object.assign(g.vehicles[1], point(1, -3, 0));
    sim.saveGame(g);
    const restored = sim.createGame(); sim.loadGame(restored);
    assert.equal(restored.stage, 3); assert.equal(restored.money, 73);
    assert.equal(street.streetContains({ ...restored.player, y: restored.player.y + 1 }, 0.42), false);
    assert.equal(street.streetContains({ ...restored.vehicles[1], y: restored.vehicles[1].y + 1 }, 1.15), false);
    assert.ok(Math.hypot(restored.player.x - g.player.x, restored.player.z - g.player.z) < 4);
    const unchanged = point(0, 0, 0);
    assert.deepEqual(street.restoreStreetPosition(unchanged), unchanged);
    const bench = street.restoreStreetPosition({ x: 30, z: -13, y: terrainHeight({ x: 30, z: -13 }) });
    assert.equal(street.streetContains({ ...bench, y: bench.y + 1 }, 0.42), false);
  } finally { delete globalThis.localStorage; }
});
