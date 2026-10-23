import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';

const gate = await loadTypescriptModule('src/components/liuzhou/dongmen.ts');
const world = await loadTypescriptModule('src/components/liuzhou/world.ts');
const camera = await loadTypescriptModule('src/components/liuzhou/camera.ts');
const sim = await loadTypescriptModule('src/components/liuzhou/simulation.ts');
const { terrainHeight } = await loadTypescriptModule('src/components/liuzhou/terrain.ts');
const at = (x, z, y = 1) => ({ ...gate.gatePoint(x, z), y: gate.GATE_GROUND + y });

test('Dongmen stands in its imported historic site with the documented five-bay hall span', () => {
  assert.equal(gate.DONGMEN.hallWidth, 16.44);
  assert.equal(gate.DONGMEN.hallDepth, 10.41);
  assert.ok(Math.hypot(gate.DONGMEN.x, gate.DONGMEN.z) < 5);
  assert.deepEqual(world.LANDMARKS.find(l => l.id === 'gate').x, gate.DONGMEN.x);
  for (const q of sim.QUESTS) assert.equal(gate.gateContains({ ...q, y: 1 }, 0.5), false, q.title);
  const g = sim.createGame();
  for (const p of [g.player, ...g.vehicles, ...g.npcs]) assert.equal(gate.gateContains({ ...p, y: 1 }, 0.5), false, p.id);
});

test('street-level tunnel is continuous and its walls and curved ceiling remain solid', () => {
  for (let z = -12; z <= 12; z += 0.2) for (const x of [-0.8, 0, 0.8]) {
    assert.equal(gate.gateContains(at(x, z, 1.3), 0.3), false, `${x},${z}`);
  }
  assert.equal(gate.gateContains(at(5, 0)), true);
  assert.equal(gate.gateContains(at(0, 0, 4.8)), true);
  const view = camera.resolveCamera(at(0, 0, 1.4), 0, 0.08, 8);
  assert.ok(view.distance > 6);
  assert.equal(gate.gateContains(view, 0.15), false);
  const up = camera.resolveCamera({ x: 31, z: 30, y: 1.4 }, Math.PI, -0.65, 10);
  assert.ok(up.y >= 0.4, 'upward look never puts the camera below the ground');
});

test('stair treads lead onto a real terrace opening without a wall across the landing', () => {
  const { stairs, terrace } = gate.DONGMEN;
  let previous = 0;
  for (const box of [...gate.GATE_STAIRS].reverse()) {
    assert.ok(Math.abs(box.size[1] - previous - stairs.rise) < 0.001);
    previous = box.size[1];
  }
  assert.equal(previous, terrace);
  for (let x = stairs.x; x < -10; x += 0.1) {
    assert.equal(gate.gateContains(at(x, -5.3, terrace + 1), 0.38), false, x);
    assert.equal(gate.gateFloor(at(x, -5.3)), gate.GATE_GROUND + terrace);
  }
  assert.equal(gate.gateContains(at(0, 9, terrace + 0.6)), true, 'front parapet');
});

test('terrace saves preserve supported elevation and legacy ground saves leave the new wall safely', () => {
  const terrace = at(-11.5, 7.3, gate.DONGMEN.terrace + 0.04);
  assert.equal(gate.restoreGatePosition(terrace).y, gate.GATE_GROUND + gate.DONGMEN.terrace);
  const old = at(8, 0, 0); const safe = gate.restoreGatePosition(old);
  assert.equal(safe.y, terrainHeight(safe)); assert.equal(gate.gateContains({ ...safe, y: safe.y + 1 }, 0.4), false);
  assert.deepEqual(gate.restoreGatePosition(at(0, 0, 0)), at(0, 0, 0), 'ground passage save stays in passage');
  assert.equal(gate.restoreGatePosition({ x: 31, z: -10, y: 9999 }).y, terrainHeight({ x: 31, z: -10 }));
  let data; globalThis.localStorage = { setItem: (_, value) => { data = value; }, getItem: () => data };
  try {
    const g = sim.createGame(); Object.assign(g.player, terrace); g.stage = 3; sim.saveGame(g);
    const restored = sim.createGame(); sim.loadGame(restored);
    assert.equal(restored.stage, 3); assert.equal(restored.player.y, gate.GATE_GROUND + gate.DONGMEN.terrace);
    assert.equal(sim.nearestInteraction(restored), null, 'ground actors cannot be used through the floor');
    const invalidHeight = JSON.parse(data); invalidHeight.player.y = 9999; data = JSON.stringify(invalidHeight);
    const grounded = sim.createGame(); sim.loadGame(grounded);
    assert.equal(grounded.player.y, terrainHeight(grounded.player), 'a non-bridge save cannot restore an arbitrary height');
  } finally { delete globalThis.localStorage; }
});
