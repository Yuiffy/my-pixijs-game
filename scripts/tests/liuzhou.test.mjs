import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';

const w = await loadTypescriptModule('src/components/liuzhou/world.ts');
const e = await loadTypescriptModule('src/components/liuzhou/simulation.ts');
const { terrainHeight } = await loadTypescriptModule('src/components/liuzhou/terrain.ts');
const neutral = { forward: 0, turn: 0, sprint: false, brake: false, jump: false };
const closeDialogue = g => { while (g.dialogue) e.interact(g); };

test('shipped geography retains OSM road topology and separate twin bridges', () => {
  const bridges = w.ROADS.filter(r => r.bridge && r.name === '文惠桥'); assert.equal(bridges.length, 2);
  assert.ok(w.distance(bridges[0].points[0], bridges[0].points[1]) > 570);
  assert.ok(w.ROADS.some(r => r.name === '曙光东路'));
  for (const quest of e.QUESTS) assert.ok(w.canTraverse(quest), quest.title);
  assert.equal(w.canTraverse({ x: 290, z: 200 }), false, 'river is blocked away from bridges');
});

test('bridge margins slide forward without allowing entry to river from an unrelated bank', () => {
  const bridge = w.ROAD_SEGMENTS.find(s => s.road.bridge); const a = bridge.a; const b = bridge.b;
  const length = w.distance(a, b); const dx = (b.x - a.x) / length; const dz = (b.z - a.z) / length;
  const from = { x: a.x + dx * 260 - dz * 3.7, z: a.z + dz * 260 + dx * 3.7 };
  const desired = { x: from.x + dx * 0.3 - dz * 0.4, z: from.z + dz * 0.3 + dx * 0.4 };
  const result = w.constrainToBridge(from, desired, 1.15);
  assert.ok(w.canTraverse(result)); assert.ok((result.x - from.x) * dx + (result.z - from.z) * dz > 0.25);
  assert.deepEqual(w.constrainToBridge({ x: -170, z: 117 }, { x: 300, z: 200 }, 1), { x: 300, z: 200 });
});

test('progression requires both actual bicycle travel and actual car travel', () => {
  const g = e.createGame(); g.phase = 'playing'; Object.assign(g.player, e.QUESTS[0]);
  e.interact(g); assert.ok(g.dialogue); closeDialogue(g); assert.equal(g.stage, 1);
  Object.assign(g.player, e.QUESTS[1]); e.interact(g); closeDialogue(g); assert.equal(g.stage, 1);
  g.bikeDistance = 46; e.interact(g); closeDialogue(g); assert.equal(g.stage, 2); assert.equal(g.money, 36);
  Object.assign(g.player, e.QUESTS[2]); e.interact(g); closeDialogue(g); assert.equal(g.stage, 3);
  Object.assign(g.player, e.QUESTS[3], { y: terrainHeight(e.QUESTS[3]) }); e.interact(g); closeDialogue(g); assert.equal(g.stage, 3);
  g.carDistance = 181; e.interact(g); closeDialogue(g); assert.equal(g.stage, 4);
  Object.assign(g.player, e.QUESTS[4], { y: terrainHeight(e.QUESTS[4]) }); e.interact(g); closeDialogue(g); assert.equal(g.stage, 5);
  Object.assign(g.player, e.QUESTS[5], { y: terrainHeight(e.QUESTS[5]) }); e.interact(g); closeDialogue(g); assert.equal(g.stage, 6); assert.equal(g.money, 76);
});

test('dialogue and pause freeze motion and vehicle entry does not bypass stopping before exit', () => {
  const g = e.createGame(); g.phase = 'playing'; const bike = g.vehicles[0]; Object.assign(g.player, { x: bike.x, z: bike.z });
  e.interact(g); assert.equal(g.vehicle, bike.id);
  bike.speed = 7; e.interact(g); assert.equal(g.vehicle, bike.id);
  bike.speed = 0; e.interact(g); assert.equal(g.vehicle, null);
  const before = structuredClone(g); g.phase = 'paused'; e.step(g, { ...neutral, forward: 1 }); assert.deepEqual(g.player, before.player);
  g.phase = 'playing'; g.dialogue = { name: '居民', lines: ['你好'], index: 0, advance: false }; e.step(g, { ...neutral, forward: 1 }); assert.deepEqual(g.player, before.player);
});

test('arcade car accelerates, brakes without bouncing into reverse, and reverses intentionally', () => {
  const g = e.createGame(); g.phase = 'playing'; const car = g.vehicles[1]; Object.assign(car, { x: 30, z: -10, angle: 0 }); Object.assign(g.player, car); g.vehicle = car.id;
  for (let i = 0; i < 45; i++) e.step(g, { ...neutral, forward: 1 });
  assert.ok(car.speed > 5); assert.ok(g.carDistance > 1);
  for (let i = 0; i < 90; i++) e.step(g, { ...neutral, brake: true }); assert.equal(car.speed, 0);
  for (let i = 0; i < 30; i++) e.step(g, { ...neutral, forward: -1 }); assert.ok(car.speed < -2);
});

test('save data preserves chapter and parking, rejects invalid schema and non-finite transforms', () => {
  const data = new Map(); globalThis.localStorage = { setItem: (key, value) => data.set(key, value), getItem: key => data.get(key) ?? null };
  const g = e.createGame(); g.stage = 4; g.character = 'nagisa'; g.stamps = ['gate']; g.carDistance = 855; e.saveGame(g);
  const restored = e.createGame(); e.loadGame(restored); assert.equal(restored.stage, 4); assert.equal(restored.character, 'nagisa'); assert.equal(restored.carDistance, 855); assert.deepEqual(restored.stamps, ['gate']);
  data.set(w.SAVE_KEY, '{broken'); assert.doesNotThrow(() => e.loadGame(e.createGame()));
  data.set(w.SAVE_KEY, JSON.stringify({ version: 1, stage: 999 })); const invalid = e.createGame(); e.loadGame(invalid); assert.equal(invalid.stage, 0);
  data.set(w.SAVE_KEY, JSON.stringify({ version: 1, stage: 2, player: { x: 50, z: -20, angle: 'bad' }, vehicles: [{ id: 'car-1', kind: 'bike', x: 30, z: -20, angle: 1 }] }));
  const malformed = e.createGame(); e.loadGame(malformed); assert.equal(malformed.player.x, 31); assert.equal(malformed.vehicles[1].kind, 'car'); assert.equal(malformed.vehicles[1].x, 30);
  delete globalThis.localStorage;
});
