import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const old = require.extensions['.ts'];
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, file);
const central = require('../../src/components/liuzhou/central.ts');
const world = require('../../src/components/liuzhou/world.ts');
const city = require('../../src/components/liuzhou/city.ts');
const terrain = require('../../src/components/liuzhou/terrainMesh.ts');
const camera = require('../../src/components/liuzhou/camera.ts');
const sim = require('../../src/components/liuzhou/simulation.ts');
const source = require('../../src/components/liuzhou/city-map.json');
const layout = require('../../src/components/liuzhou/central-layout.json');
if (old) require.extensions['.ts'] = old; else delete require.extensions['.ts'];
const idle = { forward: 0, turn: 0, sprint: false, brake: false, jump: false };
const sourceRoad = id => source.roads.find(r => r.id === id).points;

test('archived residential relation keeps its source school hole and separately estimated school court', () => {
  const result = spawnSync('python', ['scripts/tests/liuzhou-central-geometry.py'], { encoding: 'utf8' });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const school = layout.parcels.find(p => p.id === 'school-205663282');
  const housing = layout.parcels.find(p => p.id === 'relation-21296846');
  assert.deepEqual(housing.holes, [school.points]);
  assert.equal(school.tags.amenity, 'school');
  assert.ok(layout.volumes.some(v => v.parcelId === school.id && v.use === 'school'));
});

test('formerly missing boundary buildings keep their entire source rings exactly once and sealed foundations', () => {
  assert.deepEqual(fs.readFileSync('src/components/liuzhou/central-layout.json'), fs.readFileSync('public/games/liuzhou/central-layout.json'));
  assert.equal(layout.sourceSha256, createHash('sha256').update(fs.readFileSync('src/components/liuzhou/city-map.json')).digest('hex'));
  assert.deepEqual([...central.CENTRAL_SOURCE_IDS], ['205656857', '205657492', '1351248940', '1351248943']);
  for (const sourceId of central.CENTRAL_SOURCE_IDS) {
    const records = world.BUILDINGS.filter(b => b.id === sourceId || b.id.endsWith(`-${sourceId}`));
    assert.equal(records.length, 1, sourceId);
    const b = records[0];
    assert.equal(b.id, `central-osm-${sourceId}`); assert.equal(b.real, true); assert.equal(b.heightSource, 'estimated');
    assert.deepEqual(b.footprint.map(p => [p.x, p.z]), source.buildings.find(v => v.id === sourceId).points.slice(0, -1));
  }
  for (const b of central.CENTRAL_BUILDINGS) for (let i = 0; i < b.footprint.length; i++) {
    const a = b.footprint[i]; const c = b.footprint[(i + 1) % b.footprint.length]; const length = world.distance(a, c);
    for (let n = 0; n <= length; n += 0.4) {
      const p = { x: a.x + (c.x - a.x) * n / (length || 1), z: a.z + (c.z - a.z) * n / (length || 1) };
      assert.ok(world.buildingElevation(b) - world.buildingFoundationDepth(b) <= terrain.terrainTriangleHeight(p) - 0.5, b.id);
    }
  }
});

test('source parcel boundaries survive and estimated enclosures leave all mapped public road axes open', () => {
  assert.deepEqual(layout.parcels.map(p => p.id), ['205654200', '205659715', '1044328330', '1044328341', '1044328342', '1044328343', '1044328346', '1044328347', '1352351112', '1044328331', '1539716390', '1274445934', '1274445939', '1306511547', '1539716380', '1539716381', '1044328334', 'relation-21296846', 'school-205663282']);
  assert.ok(layout.volumes.length >= 10);
  for (const parcel of layout.parcels) {
    if (!parcel.sourceRelationId && !parcel.sourceWayId) assert.deepEqual(parcel.points, source.areas.find(a => a.id === parcel.id).points);
    const inferred = layout.volumes.some(v => v.parcelId === parcel.id);
    const mapped = parcel.existingBuildingIds.some(id => world.BUILDINGS.some(b => b.id === id || b.id.endsWith(`-${id}`)));
    assert.ok(inferred || mapped, `${parcel.name} must have a source or estimated building within its enclosure`);
  }
  for (const v of layout.volumes) {
    assert.equal(v.geometryStatus, 'inferred');
    const parcel = layout.parcels.find(p => p.id === v.parcelId);
    for (const [x, z] of v.points) assert.ok(city.polygonContains({ x, z }, parcel.points), v.id);
  }
  assert.ok(!city.CITY_BUILDINGS.some(b => b.id.startsWith('city-infill-') && central.centralReserved(b, Math.hypot(b.w, b.d) / 2)));
  const relevant = city.CITY_ROAD_SEGMENTS.filter(s => !s.road.bridge && central.CENTRAL_BUILDINGS.some(b => city.segmentDistance(b, s.a, s.b) < Math.hypot(b.w, b.d) / 2 + 12));
  assert.ok(relevant.length > 25);
  for (const s of relevant) {
    const length = world.distance(s.a, s.b);
    for (let n = 0; n <= length; n += 0.5) {
      const p = { x: s.a.x + (s.b.x - s.a.x) * n / length, z: s.a.z + (s.b.z - s.a.z) * n / length };
      assert.ok(!central.CENTRAL_BUILDINGS.some(b => world.buildingContains(p, b, 0.7)), `${s.road.sourceId}: ${JSON.stringify(p)}`);
    }
  }
});

test('northwest parcels preserve mapped apartment groups and nameplates stay on their own walls', () => {
  for (const [parcelId, count] of [['1352351112', 10], ['1274445939', 11], ['1539716381', 7]]) {
    const parcel = layout.parcels.find(p => p.id === parcelId);
    assert.equal(parcel.infillPolicy, 'source buildings only');
    assert.equal(parcel.existingBuildingIds.length, count);
    assert.ok(!layout.volumes.some(v => v.parcelId === parcel.id), 'do not fill mapped apartment courts with extra bars');
    for (const id of parcel.existingBuildingIds) {
      const records = world.BUILDINGS.filter(b => b.id === id || b.id.endsWith(`-${id}`));
      assert.equal(records.length, 1, id); assert.equal(records[0].real, true);
      assert.deepEqual(records[0].footprint.map(p => [p.x, p.z]), source.buildings.find(b => b.id === id).points.slice(0, -1));
    }
  }
  assert.equal(layout.labels.length, layout.parcels.length);
  for (const label of layout.labels) {
    const parcel = layout.parcels.find(p => p.id === label.parcelId);
    const wall = central.CENTRAL_BUILDINGS.find(b => b.id === label.wallId);
    assert.ok(wall, label.wallId); assert.equal(label.text, parcel.name || '住宅院落');
    assert.ok(world.buildingContains({ x: label.at[0], z: label.at[1] }, wall, 0.05));
    assert.equal(label.geometryStatus, 'estimated nameplate on inferred wall');
  }
});

function walker(g, physics) {
  return ([x, z]) => {
    let still = 0;
    for (let i = 0; i < 100; i++) {
      const before = { ...g.player }; const gap = Math.hypot(x - before.x, z - before.z); if (gap < 0.18) return;
      const yaw = Math.atan2(x - before.x, z - before.z);
      const count = Math.max(1, Math.min(65, Math.floor((gap - 0.06) / 4.4 * 60)));
      for (let f = 0; f < count; f++) sim.step(g, { ...idle, forward: 1 }, 1 / 60, physics, yaw);
      still = world.distance(before, g.player) < 0.01 ? still + 1 : 0;
      assert.ok(still < 4, JSON.stringify({ target: [x, z], player: g.player }));
    }
    assert.fail(`walk did not reach ${x},${z}`);
  };
}

test('ordinary Rapier walking connects Wuxing rear street to the square and the residential road network', async () => {
  const g = sim.createGame(); g.phase = 'playing';
  const start = { x: -451.113, z: -190.324 }; Object.assign(g.player, start, { y: terrain.terrainTriangleHeight(start) });
  const physics = await sim.createPhysics(g); const go = walker(g, physics);
  const route = points => points.forEach(go);
  try {
    route(sourceRoad('196166794').slice(5));
    route(sourceRoad('627315955').slice().reverse());
    go([-398.233, -458.961]); route(sourceRoad('627315950'));
    route(sourceRoad('627315952').slice(0, 6).reverse());
    go([-489.819, -527.367]); route(sourceRoad('793237157').slice().reverse());
    go([-576, -527.3]); go([-576, -580]); go([-576, -700]);
    go([-576, -527.3]); go([-728.651, -527.69]);
    route(layout.walkRoutes.liantang.points.slice().reverse());
    go([-1016.274, -330.888]); route(sourceRoad('196166796').slice(4).reverse());
    route(sourceRoad('1044328335'));
    route(sourceRoad('205513970').slice(1, 4).reverse()); route(sourceRoad('1044328338'));
    route(sourceRoad('205639712').slice(10));
    route(sourceRoad('205639714').slice(0, 7));
    // The source centre also meets stair 1275168875. Walk around the south
    // side of its mapped top opening before reaching Longcheng Road.
    go([-632.469, -5]); go([-605.035, -8]);
    assert.ok(!g.flight.active);
    assert.ok(Math.abs(g.player.y - terrain.terrainTriangleHeight(g.player)) < 0.3);
  } finally { physics.dispose(); }
});

test('ordinary walking follows Guangya frontage and Bayi to the east-lane night market without flying', async () => {
  const g = sim.createGame(); g.phase = 'playing';
  const first = layout.walkRoutes.bayi.points[0];
  const start = { x: first[0], z: first[1] };
  Object.assign(g.player, start, { y: terrain.terrainTriangleHeight(start) });
  const physics = await sim.createPhysics(g); const go = walker(g, physics);
  try {
    for (const key of ['square', 'guangya']) for (const point of layout.walkRoutes[key].points) go(point);
    for (const key of ['guangya', 'square']) for (const point of layout.walkRoutes[key].points.slice().reverse()) go(point);
    for (const key of ['bayi', 'yuejin']) for (const point of layout.walkRoutes[key].points) {
      go(point);
      assert.ok(Math.abs(g.player.y - terrain.terrainTriangleHeight(g.player)) < 0.3, `${key}: ${JSON.stringify(g.player)}`);
      assert.ok(!world.BUILDINGS.some(b => world.buildingContains(g.player, b, 0.5)));
    }
    go([-735, -2020]);
    assert.ok(!g.flight.active);
    assert.ok(Math.abs(g.player.y - terrain.terrainTriangleHeight(g.player)) < 0.3);
  } finally { physics.dispose(); }
});

test('an estimated parcel fence blocks walking and camera rays, while a stale save is ejected from the new solid', async () => {
  const wall = central.CENTRAL_BUILDINGS.find(b => b.id === 'urban-wall-central-205654200-0');
  assert.ok(wall);
  const edge = wall.footprint.map((a, i) => ({ a, b: wall.footprint[(i + 1) % wall.footprint.length] })).sort((a, b) => world.distance(b.a, b.b) - world.distance(a.a, a.b))[0];
  const mid = { x: (edge.a.x + edge.b.x) / 2, z: (edge.a.z + edge.b.z) / 2 }; const dx = mid.x - wall.x; const dz = mid.z - wall.z; const length = Math.hypot(dx, dz);
  const start = { x: mid.x + dx / length * 3, z: mid.z + dz / length * 3 };
  const target = { x: mid.x - dx / length * 3, z: mid.z - dz / length * 3 };
  assert.ok(!world.BUILDINGS.some(b => world.buildingContains(start, b, 0.7)), 'fixture starts outside every solid');
  const g = sim.createGame(); g.phase = 'playing'; Object.assign(g.player, start, { y: terrain.terrainTriangleHeight(start) });
  const physics = await sim.createPhysics(g);
  try {
    const yaw = Math.atan2(target.x - start.x, target.z - start.z);
    for (let i = 0; i < 180; i++) sim.step(g, { ...idle, forward: 1 }, 1 / 60, physics, yaw);
    assert.ok(world.distance(g.player, start) > 1); assert.ok(world.distance(g.player, target) > 3);
    assert.ok(!world.buildingContains(g.player, wall));
    const eye = { ...start, y: terrain.terrainTriangleHeight(start) + 1.1 };
    const view = camera.constrainCamera(eye, { ...target, y: eye.y });
    assert.ok(world.distance(eye, view) < 3.5); assert.ok(!camera.cameraBlocked(view, wall));
  } finally { physics.dispose(); }
  const previous = globalThis.localStorage; const store = new Map();
  globalThis.localStorage = { getItem: key => store.get(key) || null, setItem: (key, value) => store.set(key, value) };
  try {
    Object.assign(g.player, { x: wall.x, z: wall.z, y: terrain.terrainTriangleHeight(wall) }); sim.saveGame(g);
    const restored = sim.createGame(); sim.loadGame(restored);
    assert.ok(!world.BUILDINGS.some(b => world.buildingContains(restored.player, b, 0.55)));
    assert.ok(world.distance(restored.player, wall) > 0.7);
  } finally { if (previous === undefined) delete globalThis.localStorage; else globalThis.localStorage = previous; }
});
