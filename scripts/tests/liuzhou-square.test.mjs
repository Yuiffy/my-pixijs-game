import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const old = require.extensions['.ts'];
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, file);
const square = require('../../src/components/liuzhou/square.ts');
const city = require('../../src/components/liuzhou/city.ts');
const world = require('../../src/components/liuzhou/world.ts');
const terrain = require('../../src/components/liuzhou/terrainMesh.ts');
const pedestrian = require('../../src/components/liuzhou/pedestrian.ts');
const sim = require('../../src/components/liuzhou/simulation.ts');
const camera = require('../../src/components/liuzhou/camera.ts');
const layout = require('../../src/components/liuzhou/square-layout.json');
if (old) require.extensions['.ts'] = old; else delete require.extensions['.ts'];
const idle = { forward: 0, turn: 0, sprint: false, brake: false, jump: false };

test('full archived square multipolygon and its fountain hole survive import without paving over the hole or source roads', () => {
  const result = spawnSync('python', ['scripts/tests/liuzhou-square-geometry.py'], { encoding: 'utf8' });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.equal(layout.sourceFountain.id, '205658310');
  assert.ok(layout.sourceSquarePublicArea > 50000);
  assert.ok(layout.sourceSquarePublicArea < layout.publicArea);
  assert.match(layout.sourceFountain.detailStatus, /estimated/);
  assert.ok(layout.sourceFountain.nozzles.length > 10);
});

test('public square paving avoids actual source buildings and carriageways, and explicitly identifies estimated geometry', () => {
  assert.deepEqual(fs.readFileSync('src/components/liuzhou/square-layout.json'), fs.readFileSync('public/games/liuzhou/square-layout.json'));
  assert.match(layout.note, /estimated/);
  assert.ok(layout.publicArea > 50000);
  let area = 0;
  for (const face of layout.surfaces) {
    const [a, b, c] = face.points;
    area += Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2;
    for (const weights of [[1 / 3, 1 / 3, 1 / 3], [0.8, 0.1, 0.1]]) {
      const p = { x: face.points.reduce((n, v, i) => n + v[0] * weights[i], 0), z: face.points.reduce((n, v, i) => n + v[1] * weights[i], 0) };
      assert.ok(!pedestrian.inCarriageway(p), JSON.stringify(p));
      assert.ok(!world.BUILDINGS.some(b => world.buildingContains(p, b) && terrain.terrainTriangleHeight(p) + 1.9 > world.buildingElevation(b) - world.buildingFoundationDepth(b)), JSON.stringify(p));
    }
  }
  assert.ok(Math.abs(area - layout.publicArea) < 0.05);
});

test('311-metre source-tagged tower is no longer discarded by the estimated-height fallback', () => {
  const tower = city.CITY_BUILDINGS.find(b => b.id === 'city-osm-899710004');
  assert.equal(tower.h, 311); assert.equal(tower.heightSource, undefined);
  const podium = city.CITY_BUILDINGS.find(b => b.id === 'city-osm-434067129');
  assert.equal(podium.h, 19.6); assert.equal(podium.heightSource, 'estimated');
  assert.deepEqual(podium.footprint.map(p => [p.x, p.z]), require('../../src/components/liuzhou/city-map.json').buildings.find(b => b.id === '434067129').points.slice(0, -1));
  assert.ok(square.SQUARE_FACADE_IDS.has(podium.id));
  assert.equal(square.SQUARE_LABELS.filter(s => s.text === '地王国际财富中心').length, 1);
  for (const id of ['205515113', '205658301', '205657499']) {
    const building = city.CITY_BUILDINGS.find(b => b.id === `city-osm-${id}`);
    assert.equal(building.heightSource, 'estimated');
    assert.ok(building.footprint.length >= 4);
  }
  assert.equal(square.SQUARE_LABELS.filter(s => s.flat).length, 81);
  assert.ok(square.SQUARE_LABELS.every(s => typeof s.text === 'string' && s.text.length > 0));
});

test('square residents and both complete walking loops stay off roads, buildings and furniture', () => {
  for (const n of square.SQUARE_RESIDENTS) assert.ok(pedestrian.pedestrianClear(n), n.id);
  for (const [id, points] of Object.entries(square.SQUARE_WALKS)) for (let i = 0; i < points.length; i++) {
    const a = points[i]; const b = points[(i + 1) % points.length]; const length = world.distance(a, b);
    for (let n = 0; n < length; n += 0.2) assert.ok(pedestrian.pedestrianClear({ x: a.x + (b.x - a.x) * n / length, z: a.z + (b.z - a.z) * n / length }), `${id}/${i}/${n}`);
  }
});

test('east-side source buildings retain their pre-detail default heights and closed source footprints', () => {
  const source = require('../../src/components/liuzhou/city-map.json');
  const expected = { 205657493: 26, 205657490: 16.4, 205657494: 10, 205657496: 16.4, 566345463: 19.6 };
  assert.deepEqual([...square.SQUARE_FRONTAGE_IDS].sort(), Object.keys(expected).sort());
  for (const [id, height] of Object.entries(expected)) {
    const b = city.CITY_BUILDINGS.find(b => b.id === `city-osm-${id}`);
    const original = source.buildings.find(b => b.id === id);
    assert.equal(b.h, height); assert.equal(b.heightSource, 'estimated');
    assert.deepEqual(b.footprint.map(p => [p.x, p.z]), original.points.slice(0, -1));
    assert.ok(square.SQUARE_FACADE_IDS.has(b.id));
    assert.equal(square.SQUARE_LABELS.filter(label => label.text === original.name).length, 1);
    assert.ok(world.buildingContains(b, b));
  }
});

test('ordinary Rapier walking follows the public gap along all four east-frontage buildings', async () => {
  const g = sim.createGame(); g.phase = 'playing';
  Object.assign(g.player, { x: -480, z: -764, y: terrain.terrainTriangleHeight({ x: -480, z: -764 }) });
  const physics = await sim.createPhysics(g);
  const go = target => {
    let still = 0;
    for (let i = 0; i < 100; i++) {
      const before = { ...g.player }; const gap = world.distance(before, target); if (gap < .18) return;
      const yaw = Math.atan2(target.x - before.x, target.z - before.z);
      const frames = Math.max(1, Math.min(65, Math.floor((gap - .06) / 4.4 * 60)));
      for (let frame = 0; frame < frames; frame++) sim.step(g, { ...idle, forward: 1 }, 1 / 60, physics, yaw);
      still = world.distance(before, g.player) < .01 ? still + 1 : 0;
      assert.ok(still < 4, JSON.stringify({ target, player: g.player }));
      assert.ok(Math.abs(g.player.y - terrain.terrainTriangleHeight(g.player)) < .2);
    }
    assert.fail(`east-side route did not reach ${JSON.stringify(target)}`);
  };
  const route = [{ x: -480, z: -722 }, { x: -480, z: -659 }, { x: -440, z: -659 }, { x: -440, z: -633 }, { x: -442, z: -633 }, { x: -442, z: -591 }, { x: -416, z: -591 }, { x: -416, z: -555 }];
  try { for (const target of [...route, ...route.slice(0, -1).reverse(), { x: -480, z: -764 }]) go(target); }
  finally { physics.dispose(); }
});

test('culture building foundation reaches its lowest outline terrain and the camera sees the same lower wall', () => {
  for (const id of Object.keys(square.SQUARE_BUILDING_STYLES).map(id => `city-osm-${id}`)) {
    const b = world.BUILDINGS.find(b => b.id === id); const bottom = world.buildingElevation(b) - world.buildingFoundationDepth(b);
    for (let i = 0; i < b.footprint.length; i++) {
      const a = b.footprint[i]; const c = b.footprint[(i + 1) % b.footprint.length]; const length = world.distance(a, c);
      for (let n = 0; n < length; n++) assert.ok(bottom < terrain.terrainTriangleHeight({ x: a.x + (c.x - a.x) * n / length, z: a.z + (c.z - a.z) * n / length }) - 0.5);
    }
  }
  const b = world.BUILDINGS.find(b => b.id === 'city-osm-205658301');
  const p = { x: -700, z: -890 }; assert.ok(camera.cameraBlocked({ ...p, y: terrain.terrainTriangleHeight(p) + 1 }, b));
});

test('ordinary Rapier walking crosses the square, loops, visits both culture buildings, and returns after conversation', async () => {
  const g = sim.createGame(); g.phase = 'playing';
  Object.assign(g.player, { x: -576, z: -560, y: terrain.terrainTriangleHeight({ x: -576, z: -560 }) });
  const physics = await sim.createPhysics(g);
  const go = target => {
    let still = 0;
    for (let i = 0; i < 100; i++) {
      const before = { ...g.player }; const gap = world.distance(before, target); if (gap < 0.18) return;
      const yaw = Math.atan2(target.x - before.x, target.z - before.z);
      const frames = Math.max(1, Math.min(65, Math.floor((gap - 0.06) / 4.4 * 60)));
      for (let frame = 0; frame < frames; frame++) sim.step(g, { ...idle, forward: 1 }, 1 / 60, physics, yaw);
      still = world.distance(before, g.player) < 0.01 ? still + 1 : 0;
      assert.ok(still < 4, JSON.stringify({ target, player: g.player }));
    }
    assert.fail(`did not reach ${JSON.stringify(target)}`);
  };
  try {
    for (const target of [{ x: -576, z: -690 }, { x: -576, z: -704 }, { x: -576, z: -730 }, { x: -530, z: -730 }, { x: -530, z: -890 }, { x: -685, z: -890 }, { x: -685, z: -765 }, { x: -628, z: -765 }, { x: -628, z: -560 }, { x: -576, z: -560 }, { x: -576, z: -690 }]) go(target);
    const npc = g.npcs.find(n => n.id === 'square-neighbour');
    assert.ok(world.distance(g.player, npc) < 3.6);
    sim.interact(g); assert.equal(g.dialogue?.name, npc.name);
    const before = { ...g.player }; sim.step(g, { ...idle, forward: 1 }, 1 / 60, physics); assert.equal(world.distance(before, g.player), 0);
    for (let i = 0; i < 6 && g.dialogue; i++) sim.interact(g);
    go({ x: -530, z: -690 }); go({ x: -478, z: -764 });
    assert.ok(Math.abs(g.player.y - terrain.terrainTriangleHeight(g.player)) < 0.15);
    sim.saveGame(g);
    Object.assign(g.player, { x: -685, z: -890, y: terrain.terrainTriangleHeight({ x: -685, z: -890 }), speed: 0 }); physics.reset();
    for (let frame = 0; frame < 220; frame++) sim.step(g, { ...idle, forward: 1 }, 1 / 60, physics, -Math.PI / 2);
    const centre = world.BUILDINGS.find(b => b.id === 'city-osm-205658301');
    const a = centre.footprint[2]; const c = centre.footprint[3];
    const wallX = a.x + (c.x - a.x) * (g.player.z - a.z) / (c.z - a.z);
    assert.ok(g.player.x > wallX + 0.25 && g.player.x < wallX + 0.8, JSON.stringify({ wallX, player: g.player }));
    assert.ok(Math.abs(g.player.y - terrain.terrainTriangleHeight(g.player)) < 0.15);
  } finally { physics.dispose(); }
});

test('Rapier flight lands on the tall tower roof and reload preserves that shared rendered support', async () => {
  const b = city.CITY_BUILDINGS.find(b => b.id === 'city-osm-899710004');
  const g = sim.createGame(); g.phase = 'playing'; Object.assign(g.player, { x: b.x, z: b.z, y: world.buildingElevation(b) + b.h + 8 });
  const physics = await sim.createPhysics(g);
  try {
    sim.toggleFlight(g);
    for (let i = 0; i < 220; i++) sim.step(g, { ...idle, descend: true }, 1 / 60, physics);
    assert.ok(Math.abs(g.player.y - world.buildingElevation(b) - b.h) < 0.15);
    sim.toggleFlight(g);
    for (let i = 0; i < 60; i++) sim.step(g, idle, 1 / 60, physics);
    assert.ok(g.locomotion.grounded);
    const store = new Map(); globalThis.localStorage = { setItem: (key, value) => store.set(key, value), getItem: key => store.get(key) ?? null };
    sim.saveGame(g); const restored = sim.createGame(); sim.loadGame(restored);
    assert.ok(Math.abs(restored.player.y - g.player.y) < 0.15);
    assert.ok(world.distance(restored.player, g.player) < 0.15);
  } finally { physics.dispose(); delete globalThis.localStorage; }
});
