import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

// Exercise the shipped Rapier implementation, including its dynamic imports.
// Scope this TS hook to this test worker; production compilation is unaffected.
const require = createRequire(import.meta.url);
const previous = require.extensions['.ts'];
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }, fileName: file }).outputText, file);
const sim = require('../../src/components/liuzhou/simulation.ts');
const terrain = require('../../src/components/liuzhou/terrain.ts');
const bridges = require('../../src/components/liuzhou/bridges.ts');
if (previous) require.extensions['.ts'] = previous;
else delete require.extensions['.ts'];
const neutral = { forward: 0, turn: 0, sprint: false, brake: false, jump: false };
const gameAt = (p, y = terrain.terrainHeight(p)) => {
  const g = sim.createGame(); g.phase = 'playing'; g.npcs = []; g.traffic = []; g.vehicles = [];
  Object.assign(g.player, p, { y, speed: 0 }); return g;
};
const walk = (g, physics, target, limit = 2400) => {
  for (let i = 0; i < limit; i++) {
    if (Math.hypot(g.player.x - target.x, g.player.z - target.z) < 0.55) return;
    sim.step(g, { ...neutral, forward: 1, sprint: true }, 1 / 60, physics, Math.atan2(target.x - g.player.x, target.z - g.player.z));
  }
  assert.fail(`cannot walk to ${JSON.stringify(target)} from ${JSON.stringify(g.player)}`);
};

test('terrain retains attributed source grids, metres, distinct hill positions and distributable originals', () => {
  const geography = JSON.parse(fs.readFileSync('src/components/liuzhou/skyline-map.json'));
  assert.equal(geography.bridges.length, 18);
  assert.equal(geography.bridges.find(b => b.name === '鹧鸪江大桥').style, 'suspension');
  assert.equal(geography.bridges.find(b => b.name === '洛维大桥').style, 'beam');
  for (const name of ['马鞍山', '鱼峰山', '鹅山']) {
    const hill = geography.hills.find(h => h.name === name);
    assert.ok(terrain.terrainHeight(hill) > 20, name);
    assert.ok(terrain.HILL_PATCHES.some(p => p.name === name));
  }
  for (const filename of ['terrain-dem.json', 'terrain-ground.json', 'terrain-hills.json', 'skyline-map.json']) {
    assert.deepEqual(fs.readFileSync(path.join('src/components/liuzhou', filename)), fs.readFileSync(path.join('public/games/liuzhou', filename)));
  }
  assert.ok(bridges.BRIDGE_HEIGHT - terrain.terrainHeight({ x: 80, z: 60 }) > 6);
  assert.equal(bridges.treeClearsBridge({ x: 80, z: 60 }), false);
});

test('Rapier walks up the actual north approach, across the deck and down the south approach', async () => {
  const axis = bridges.BRIDGE_AXES[0];
  const north = bridges.BRIDGE_SECTIONS.filter(s => !s.main && s.a.z < axis.north.z + 1 && s.id === '627315952');
  const south = bridges.BRIDGE_SECTIONS.filter(s => s.id === '370553228');
  assert.ok(north.length && south.length);
  const landing = north.at(-1).b;
  const g = gameAt(landing); const physics = await sim.createPhysics(g);
  try {
    for (const s of [...north].reverse()) walk(g, physics, s.a);
    assert.ok(Math.abs(g.player.y - bridges.BRIDGE_HEIGHT) < 0.25, `north deck y ${g.player.y}`);
    walk(g, physics, axis.south, 5200);
    assert.ok(Math.abs(g.player.y - bridges.BRIDGE_HEIGHT) < 0.25);
    for (const s of south) walk(g, physics, s.b);
    assert.ok(Math.abs(g.player.y - terrain.terrainHeight(g.player)) < 0.3, `south ground ${JSON.stringify(g.player)}`);
  } finally { physics.dispose(); }
});

test('Rapier ground passage stays below the deck and cannot step up through it; rails hold the upper layer', async () => {
  const p = { x: 74.49, z: 61.29 };
  const surface = bridges.bridgeSurface(p);
  assert.ok(surface);
  const g = gameAt({ x: 63.38, z: 72.96 }); const physics = await sim.createPhysics(g);
  try {
    walk(g, physics, { x: 107.75, z: 42.8 }, 500);
    assert.ok(g.player.y < surface.y - 5, `underpass snapped to bridge: ${g.player.y}`);
    assert.ok(Math.abs(g.player.y - terrain.terrainHeight(g.player)) < 0.25);
    const center = bridges.BRIDGE_SECTIONS.find(s => s.main);
    const mid = { x: (center.a.x + center.b.x) / 2, z: (center.a.z + center.b.z) / 2 };
    Object.assign(g.player, mid, { y: bridges.BRIDGE_HEIGHT, speed: 0 });
    physics.velocityY = 0;
    const yaw = Math.atan2(center.b.x - center.a.x, center.b.z - center.a.z) + Math.PI / 2;
    for (let i = 0; i < 150; i++) sim.step(g, { ...neutral, forward: 1 }, 1 / 60, physics, yaw);
    const hit = bridges.bridgeSurface(g.player, 0.2);
    assert.ok(hit && hit.distance < center.width / 2, 'upper rail contains the player');
    assert.ok(Math.abs(g.player.y - bridges.BRIDGE_HEIGHT) < 0.25);
  } finally { physics.dispose(); }
});

test('the car collider climbs the graded approach and brakes on the deck without losing its elevation', async () => {
  const north = bridges.BRIDGE_SECTIONS.filter(s => s.id === '627315952');
  const g = gameAt(north.at(-1).b);
  const car = { ...g.player, id: 'car-test', kind: 'car', color: '#fff', angle: Math.atan2(north[0].a.x - g.player.x, north[0].a.z - g.player.z) };
  g.vehicles = [car]; g.vehicle = car.id;
  const physics = await sim.createPhysics(g);
  try {
    const main = bridges.BRIDGE_SECTIONS.find(s => s.main);
    const target = { x: (main.a.x + main.b.x) / 2, z: (main.a.z + main.b.z) / 2 };
    for (let i = 0; i < 2200 && Math.hypot(car.x - target.x, car.z - target.z) > 3; i++) {
      const desired = Math.atan2(target.x - car.x, target.z - car.z);
      const diff = Math.atan2(Math.sin(desired - car.angle), Math.cos(desired - car.angle));
      sim.step(g, { ...neutral, forward: 1, turn: Math.max(-1, Math.min(1, -diff * 2)) }, 1 / 60, physics);
    }
    assert.ok(Math.hypot(car.x - target.x, car.z - target.z) < 4, JSON.stringify(car));
    for (let i = 0; i < 120; i++) sim.step(g, { ...neutral, brake: true }, 1 / 60, physics);
    assert.equal(car.speed, 0);
    assert.ok(Math.abs(car.y - bridges.BRIDGE_HEIGHT) < 0.3);
    assert.equal(car.y, g.player.y);
  } finally { physics.dispose(); }
});

test('new saves preserve bridge versus underpass layers; old flat river saves migrate onto the deck', () => {
  let saved;
  globalThis.localStorage = { setItem: (_, value) => { saved = value; }, getItem: () => saved };
  try {
    for (const y of [terrain.terrainHeight({ x: 74.49, z: 61.29 }), bridges.BRIDGE_HEIGHT]) {
      const g = gameAt({ x: 74.49, z: 61.29 }, y); sim.saveGame(g);
      const restored = sim.createGame(); sim.loadGame(restored);
      assert.ok(Math.abs(restored.player.y - y) < 0.01, `${y} => ${restored.player.y}`);
    }
    const section = bridges.BRIDGE_SECTIONS.find(s => s.main);
    const p = { x: (section.a.x + section.b.x) / 2, z: (section.a.z + section.b.z) / 2, y: 0 };
    saved = JSON.stringify({ version: 1, stage: 3, player: { ...p, angle: 0 } });
    const restored = sim.createGame(); sim.loadGame(restored);
    assert.ok(Math.abs(restored.player.y - bridges.BRIDGE_HEIGHT) < 0.01);
  } finally { delete globalThis.localStorage; }
});
