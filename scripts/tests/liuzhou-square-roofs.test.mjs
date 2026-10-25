import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const old = require.extensions['.ts'];
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, file);
const square = require('../../src/components/liuzhou/square.ts');
const source = require('../../src/components/liuzhou/city-map.json');
const city = require('../../src/components/liuzhou/city.ts');
const world = require('../../src/components/liuzhou/world.ts');
const terrain = require('../../src/components/liuzhou/terrainMesh.ts');
const pedestrian = require('../../src/components/liuzhou/pedestrian.ts');
const camera = require('../../src/components/liuzhou/camera.ts');
const street = require('../../src/components/liuzhou/street.ts');
const sim = require('../../src/components/liuzhou/simulation.ts');
if (old) require.extensions['.ts'] = old; else delete require.extensions['.ts'];
const idle = { forward: 0, turn: 0, sprint: false, brake: false, jump: false };

test('source roof ways retain full source plans and are raised slabs instead of closed 26/10m buildings', () => {
  assert.deepEqual([...square.SQUARE_SOURCE_ROOF_IDS].sort(), ['899710007', '899710008']);
  for (const roof of square.SQUARE_ROOF_BUILDINGS) {
    const original = source.buildings.find(b => b.id === roof.sourceId);
    assert.equal(original.tags.building, 'roof');
    assert.equal(roof.heightSource, 'estimated');
    assert.deepEqual(roof.sourceTags, original.tags);
    assert.deepEqual(roof.footprint.map(p => [p.x, p.z]), original.points.slice(0, -1));
    assert.equal(roof.foundationDepth, 0); assert.equal(roof.h, .28);
    assert.equal(city.CITY_BUILDINGS.filter(b => b.id === roof.id).length, 1);
    assert.equal(world.BUILDINGS.filter(b => b.id === roof.id).length, 1);
    for (let i = 0; i < roof.footprint.length; i++) {
      const a = roof.footprint[i], b = roof.footprint[(i + 1) % roof.footprint.length];
      const length = world.distance(a, b);
      for (let n = 0; n <= length; n++) assert.ok(roof.baseY - terrain.terrainTriangleHeight({ x: a.x + (b.x - a.x) * n / length, z: a.z + (b.z - a.z) * n / length }) >= 4.79);
    }
    assert.ok(square.SQUARE_FACADE_IDS.has(roof.id), 'no generic facade windows on roof slab');
    assert.ok(!camera.cameraBlocked({ x: roof.x, z: roof.z, y: terrain.terrainTriangleHeight(roof) + 1.3 }, roof));
    assert.ok(camera.cameraBlocked({ x: roof.x, z: roof.z, y: roof.baseY + .14 }, roof));
    assert.ok(pedestrian.pedestrianClear(roof), 'roof projection must not block the public ground corridor');
  }
});

test('roof supports occupy only their actual raised columns and the camera observes the same obstruction', async () => {
  assert.ok(square.SQUARE_ROOF_COLUMNS.length >= 8);
  for (const column of square.SQUARE_ROOF_COLUMNS) {
    const p = { ...column.p, y: column.bottom + 1 };
    assert.ok(street.streetContains(p, .05));
    assert.ok(!pedestrian.pedestrianClear(column.p));
    assert.ok(!street.streetContains({ ...p, y: column.top + 1 }, .05));
    const target = { ...p, x: p.x - 2 }, desired = { ...p, x: p.x + 2 };
    const result = camera.constrainCamera(target, desired, []);
    assert.ok(result.x < p.x, JSON.stringify({ column, result }));
  }
  const column = square.SQUARE_ROOF_COLUMNS[0];
  const g = sim.createGame(); g.phase = 'playing';
  Object.assign(g.player, { x: column.p.x, z: column.p.z - 1.5, y: terrain.terrainTriangleHeight({ x: column.p.x, z: column.p.z - 1.5 }) });
  const physics = await sim.createPhysics(g);
  try {
    for (let i = 0; i < 50; i++) sim.step(g, { ...idle, forward: 1 }, 1 / 60, physics, 0);
    assert.ok(world.distance(g.player, column.p) > .43);
    assert.ok(g.player.z < column.p.z - .3, JSON.stringify({ column, player: g.player }));
  } finally { physics.dispose(); }
});

test('ordinary Rapier walking passes under the 83m southern roof and old/current ground saves remain beneath it', async () => {
  const g = sim.createGame(); g.phase = 'playing';
  Object.assign(g.player, { x: -713, z: -985.6, y: terrain.terrainTriangleHeight({ x: -713, z: -985.6 }) });
  const physics = await sim.createPhysics(g);
  const store = new Map(); globalThis.localStorage = { setItem: (key, value) => store.set(key, value), getItem: key => store.get(key) ?? null };
  try {
    const target = { x: -639, z: -985.6 };
    for (let frame = 0; frame < 1200 && world.distance(g.player, target) > .15; frame++) {
      const yaw = Math.atan2(target.x - g.player.x, target.z - g.player.z);
      sim.step(g, { ...idle, forward: 1 }, 1 / 60, physics, yaw);
      assert.ok(Math.abs(g.player.y - terrain.terrainTriangleHeight(g.player)) < .2);
    }
    assert.ok(world.distance(g.player, target) < .15, JSON.stringify(g.player));
    for (let i = 0; i < 20; i++) sim.step(g, idle, 1 / 60, physics);
    sim.saveGame(g);
    const restored = sim.createGame(); sim.loadGame(restored);
    assert.ok(world.distance(restored.player, g.player) < .2); assert.ok(Math.abs(restored.player.y - g.player.y) < .2);
    const [key, value] = [...store.entries()][0]; const saved = JSON.parse(value); delete saved.terrainVersion; saved.player.y = 0; store.set(key, JSON.stringify(saved));
    const legacy = sim.createGame(); sim.loadGame(legacy);
    assert.ok(world.distance(legacy.player, g.player) < .2, 'legacy ground save moved outside the source roof');
    assert.ok(legacy.player.y < square.SQUARE_ROOF_BUILDINGS[0].baseY - 2);
  } finally { physics.dispose(); delete globalThis.localStorage; }
});

test('ordinary Rapier walks beneath the west roof without crossing its supporting columns', async () => {
  const g = sim.createGame(); g.phase = 'playing';
  Object.assign(g.player, { x: -750, z: -1013, y: terrain.terrainTriangleHeight({ x: -750, z: -1013 }) });
  const physics = await sim.createPhysics(g);
  try {
    for (let i = 0; i < 420; i++) sim.step(g, { ...idle, forward: 1 }, 1 / 60, physics, Math.PI);
    assert.ok(g.player.z < -1043 && g.player.z > -1046, JSON.stringify(g.player));
    assert.ok(Math.abs(g.player.y - terrain.terrainTriangleHeight(g.player)) < .2);
  } finally { physics.dispose(); }
});

test('both source roof slabs support flight landings, normal standing and current roof save reloads', async () => {
  const store = new Map(); globalThis.localStorage = { setItem: (key, value) => store.set(key, value), getItem: key => store.get(key) ?? null };
  try {
    for (const roof of square.SQUARE_ROOF_BUILDINGS) {
      const g = sim.createGame(); g.phase = 'playing'; Object.assign(g.player, { x: roof.x, z: roof.z, y: roof.baseY + roof.h + 8 });
      const physics = await sim.createPhysics(g);
      try {
        sim.toggleFlight(g); for (let i = 0; i < 160; i++) sim.step(g, { ...idle, descend: true }, 1 / 60, physics);
        assert.ok(Math.abs(g.player.y - roof.baseY - roof.h) < .2);
        sim.toggleFlight(g); for (let i = 0; i < 45; i++) sim.step(g, idle, 1 / 60, physics);
        assert.ok(g.locomotion.grounded); sim.saveGame(g);
        const restored = sim.createGame(); sim.loadGame(restored);
        assert.ok(world.distance(restored.player, g.player) < .2); assert.ok(Math.abs(restored.player.y - g.player.y) < .2);
      } finally { physics.dispose(); }
    }
  } finally { delete globalThis.localStorage; }
});
