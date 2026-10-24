import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const old = require.extensions['.ts'];
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, file);
const wuxing = require('../../src/components/liuzhou/wuxing.ts');
const world = require('../../src/components/liuzhou/world.ts');
const city = require('../../src/components/liuzhou/city.ts');
const pedestrian = require('../../src/components/liuzhou/pedestrian.ts');
const terrain = require('../../src/components/liuzhou/terrainMesh.ts');
const street = require('../../src/components/liuzhou/street.ts');
const sim = require('../../src/components/liuzhou/simulation.ts');
const source = require('../../src/components/liuzhou/city-map.json');
const layout = require('../../src/components/liuzhou/wuxing-layout.json');
if (old) require.extensions['.ts'] = old; else delete require.extensions['.ts'];
const idle = { forward: 0, turn: 0, sprint: false, brake: false, jump: false };

test('complete source shopping footprints survive the former core boundary and size limits exactly once', () => {
  assert.deepEqual(fs.readFileSync('src/components/liuzhou/wuxing-layout.json'), fs.readFileSync('public/games/liuzhou/wuxing-layout.json'));
  for (const b of layout.buildings) {
    const actual = world.BUILDINGS.filter(v => v.id === `wuxing-osm-${b.id}`);
    assert.equal(actual.length, 1);
    assert.deepEqual(actual[0].footprint.map(p => [p.x, p.z]), source.buildings.find(v => v.id === b.id).points.slice(0, -1));
    assert.equal(actual[0].heightSource, 'estimated');
    assert.ok(!world.BUILDINGS.some(v => v.id === b.id || v.id === `city-osm-${b.id}`));
    assert.ok(!city.CITY_BUILDINGS.some(v => v.id === `city-osm-${b.id}`));
    for (const p of actual[0].footprint) assert.ok(actual[0].baseY - actual[0].foundationDepth < terrain.terrainTriangleHeight(p) - 0.5);
  }
  assert.ok(wuxing.WUXING_BUILDINGS.find(b => b.id === 'wuxing-osm-641119429').w > 130);
  assert.ok(wuxing.WUXING_BUILDINGS.find(b => b.id === 'wuxing-osm-641119425').x < -440);
});

test('source pedestrian axes, clipped paving, and roadside residents remain walkable around the real commercial shells', () => {
  for (const road of layout.sourceRoads) {
    assert.deepEqual(road.points, source.roads.find(r => r.id === road.id).points);
    for (let i = 1; i < road.points.length; i++) {
      const [a, b] = [road.points[i - 1], road.points[i]]; const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      for (let n = 0; n <= d; n += 0.5) {
        const p = { x: a[0] + (b[0] - a[0]) * n / d, z: a[1] + (b[1] - a[1]) * n / d };
        // Mapped pedestrian endpoints legitimately meet vehicle roads. Check
        // their physical clearance; the separate NPC check still rejects roads.
        assert.ok(!world.BUILDINGS.some(b => world.buildingContains(p, b, 0.45)), `${road.id} building ${JSON.stringify(p)}`);
        if (world.distance(p, wuxing.WUXING_SCULPTURE) > 2.3) assert.ok(!street.streetContains({ ...p, y: terrain.terrainTriangleHeight(p) + 1 }, 0.45), `${road.id} furniture ${JSON.stringify(p)}`);
      }
    }
  }
  for (const face of layout.surfaces) {
    const p = { x: face.points.reduce((n, a) => n + a[0] / 3, 0), z: face.points.reduce((n, a) => n + a[1] / 3, 0) };
    assert.ok(!wuxing.WUXING_BUILDINGS.some(b => world.buildingContains(p, b)), JSON.stringify(p));
  }
  for (const npc of wuxing.WUXING_RESIDENTS) {
    assert.ok(pedestrian.pedestrianClear(npc), npc.id);
    assert.ok(layout.surfaces.some(f => city.polygonContains(npc, f.points)), npc.id);
  }
  assert.ok(!world.URBAN_FABRIC.courtyards.some(p => p.id === 'parcel-1524324821'));
  assert.equal(layout.sculpture.id, '2065206730');
  assert.deepEqual(layout.sculpture.point, [-417.216, -41.867]);
});

test('ordinary Rapier walking links the main promenade, curved Wuxing Street and Zhongshan pedestrian street', async () => {
  const g = sim.createGame(); g.phase = 'playing';
  const start = { x: -373.619, z: 155.915 };
  Object.assign(g.player, start, { y: terrain.terrainTriangleHeight(start) });
  const physics = await sim.createPhysics(g);
  const go = ([x, z]) => {
    let still = 0;
    for (let i = 0; i < 100; i++) {
      const before = { ...g.player }; const gap = Math.hypot(x - before.x, z - before.z); if (gap < 0.18) return;
      const yaw = Math.atan2(x - before.x, z - before.z);
      const count = Math.max(1, Math.min(65, Math.floor((gap - 0.06) / 4.4 * 60)));
      for (let frame = 0; frame < count; frame++) sim.step(g, { ...idle, forward: 1 }, 1 / 60, physics, yaw);
      still = world.distance(before, g.player) < 0.01 ? still + 1 : 0;
      assert.ok(still < 4, JSON.stringify({ x, z, player: g.player }));
    }
    assert.fail(`walk did not reach ${x},${z}`);
  };
  try {
    for (const p of layout.walkRoutes['196166794']) go(p);
    for (const p of layout.walkRoutes['196166794'].slice(0, -1).reverse()) go(p);
    for (const p of layout.walkRoutes['196166794'].slice(0, 6)) go(p);
    for (const p of layout.walkRoutes['205513960']) go(p);
    for (const p of layout.walkRoutes['205513960'].slice().reverse()) go(p);
    for (const p of layout.walkRoutes['196166794'].slice(0, 6).reverse()) go(p);
    for (const p of layout.walkRoutes['196166794'].slice(0, 4)) go(p);
    for (const p of layout.walkRoutes['205639719']) go(p);
    assert.ok(!g.flight.active);
    assert.ok(Math.abs(g.player.y - terrain.terrainTriangleHeight(g.player)) < 0.3);
  } finally { physics.dispose(); }
});
