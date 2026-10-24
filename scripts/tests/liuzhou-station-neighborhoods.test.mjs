import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const old = require.extensions['.ts'];
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, f);
const neighborhood = require('../../src/components/liuzhou/stationNeighborhoods.ts');
const world = require('../../src/components/liuzhou/world.ts');
const city = require('../../src/components/liuzhou/city.ts');
const terrain = require('../../src/components/liuzhou/terrainMesh.ts');
const camera = require('../../src/components/liuzhou/camera.ts');
const sim = require('../../src/components/liuzhou/simulation.ts');
const layout = require('../../src/components/liuzhou/station-neighborhood-layout.json');
if (old) require.extensions['.ts'] = old; else delete require.extensions['.ts'];
const idle = { forward: 0, turn: 0, sprint: false, brake: false, jump: false };

test('six station parcels retain archived rings, public roads and station space, without duplicate shared walls', () => {
  const result = spawnSync('python', ['scripts/tests/liuzhou-station-neighborhood-geometry.py'], { encoding: 'utf8' });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  console.log(result.stdout.trim());
  for (const b of neighborhood.STATION_NEIGHBORHOOD_BUILDINGS) {
    assert.equal(world.BUILDINGS.filter(v => v.id === b.id).length, 1, b.id);
    assert.equal(b.real, false); assert.equal(b.heightSource, 'estimated');
    for (let i = 0; i < b.footprint.length; i++) {
      const a = b.footprint[i]; const c = b.footprint[(i + 1) % b.footprint.length]; const length = world.distance(a, c);
      for (let n = 0; n <= length; n += .4) {
        const p = { x: a.x + (c.x - a.x) * n / (length || 1), z: a.z + (c.z - a.z) * n / (length || 1) };
        assert.ok(world.buildingElevation(b) - world.buildingFoundationDepth(b) <= terrain.terrainTriangleHeight(p) - .5, b.id);
      }
    }
  }
  assert.ok(!city.CITY_BUILDINGS.some(b => b.id.startsWith('city-infill-') && neighborhood.stationNeighborhoodReserved(b, Math.hypot(b.w, b.d) / 2)));
});

test('all nine station-neighborhood street tours permit ordinary ground walking in both directions', async () => {
  const g = sim.createGame(); g.phase = 'playing';
  const physics = await sim.createPhysics(g);
  const go = ([x, z]) => {
    let still = 0;
    for (let chunk = 0; chunk < 100; chunk++) {
      const before = { ...g.player }; const gap = Math.hypot(x - before.x, z - before.z); if (gap < .18) return;
      const yaw = Math.atan2(x - before.x, z - before.z);
      const count = Math.max(1, Math.min(65, Math.floor((gap - .06) / 4.4 * 60)));
      for (let n = 0; n < count; n++) sim.step(g, { ...idle, forward: 1 }, 1 / 60, physics, yaw);
      still = world.distance(before, g.player) < .01 ? still + 1 : 0;
      assert.ok(still < 4, JSON.stringify({ target: [x, z], player: g.player }));
    }
    assert.fail(`did not reach ${x},${z}`);
  };
  try {
    for (const [name, route] of Object.entries(layout.walkRoutes)) {
      const start = { x: route.points[0][0], z: route.points[0][1] };
      Object.assign(g.player, start, { y: terrain.terrainTriangleHeight(start), speed: 0 }); physics.reset();
      for (const p of [...route.points, ...route.points.slice().reverse()]) go(p);
      assert.equal(g.flight.active, false); assert.ok(g.locomotion.grounded, name);
      assert.ok(Math.abs(g.player.y - terrain.terrainTriangleHeight(g.player)) < .3, name);
      console.log(`walked both directions: ${name}`);
    }
  } finally { physics.dispose(); }
});

test('new parcel walls block ground movement and cameras; stale saves recover outside the new solids', async () => {
  const label = layout.labels.find(l => l.parcelId === '775896077');
  const wall = world.BUILDINGS.find(b => b.id === label.wallId);
  const normal = { x: Math.sin(label.angle), z: Math.cos(label.angle) };
  const start = { x: label.at[0] + normal.x * 3, z: label.at[1] + normal.z * 3 };
  const target = { x: label.at[0] - normal.x * 3, z: label.at[1] - normal.z * 3 };
  assert.ok(!world.BUILDINGS.some(b => world.buildingContains(start, b, .7)));
  const g = sim.createGame(); g.phase = 'playing'; Object.assign(g.player, start, { y: terrain.terrainTriangleHeight(start) });
  const physics = await sim.createPhysics(g);
  try {
    const yaw = Math.atan2(target.x - start.x, target.z - start.z);
    for (let i = 0; i < 150; i++) sim.step(g, { ...idle, forward: 1 }, 1 / 60, physics, yaw);
    assert.ok(world.distance(g.player, start) > 1 && world.distance(g.player, target) > 3);
    assert.ok(!world.buildingContains(g.player, wall));
    const eye = { ...start, y: terrain.terrainTriangleHeight(start) + 1.1 };
    const clipped = camera.constrainCamera(eye, { ...target, y: eye.y });
    assert.ok(world.distance(eye, clipped) < 3.5); assert.ok(!camera.cameraBlocked(clipped, wall));
  } finally { physics.dispose(); }
  const previous = globalThis.localStorage; const store = new Map();
  globalThis.localStorage = { getItem: key => store.get(key) || null, setItem: (key, value) => store.set(key, value) };
  try {
    Object.assign(g.player, { x: wall.x, z: wall.z, y: terrain.terrainTriangleHeight(wall) }); sim.saveGame(g);
    const restored = sim.createGame(); sim.loadGame(restored);
    assert.ok(!world.BUILDINGS.some(b => world.buildingContains(restored.player, b, .55)));
    assert.ok(world.distance(restored.player, wall) > .7);
  } finally { if (previous === undefined) delete globalThis.localStorage; else globalThis.localStorage = previous; }
});
