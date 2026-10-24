import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const previousLoader = require.extensions['.ts'];
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, file);
const station = require('../../src/components/liuzhou/station.ts');
const sim = require('../../src/components/liuzhou/simulation.ts');
const terrain = require('../../src/components/liuzhou/terrainMesh.ts');
const pedestrian = require('../../src/components/liuzhou/pedestrian.ts');
const world = require('../../src/components/liuzhou/world.ts');
const street = require('../../src/components/liuzhou/street.ts');
const camera = require('../../src/components/liuzhou/camera.ts');
if (previousLoader) require.extensions['.ts'] = previousLoader; else delete require.extensions['.ts'];
const layout = JSON.parse(fs.readFileSync('src/components/liuzhou/station-layout.json'));
const source = JSON.parse(fs.readFileSync('src/components/liuzhou/city-map.json'));
const idle = { forward: 0, turn: 0, jump: false, brake: false, sprint: false };
const area = ring => Math.abs(ring.reduce((sum, p, i) => { const q = ring[(i + 1) % ring.length]; return sum + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
const pnt = (u, v) => station.stationPoint(u, v);

test('station partitions, east plaza and all six platforms retain archived horizontal geometry and explicit estimated elevations', () => {
  assert.deepEqual(fs.readFileSync('src/components/liuzhou/station-layout.json'), fs.readFileSync('public/games/liuzhou/station-layout.json'));
  assert.equal(layout.sourceWay, '632407338'); assert.equal(layout.sourceArea, '1290673537');
  const original = source.buildings.find(b => b.id === layout.sourceWay);
  assert.ok(Math.abs(area(original.points) - layout.parts.reduce((sum, part) => sum + area(part.footprint), 0)) < 0.01);
  assert.deepEqual(layout.eastPlaza, source.areas.find(a => a.id === layout.sourceArea).points);
  assert.equal(layout.platforms.length, 6);
  for (const platform of layout.platforms) assert.deepEqual(platform, source.roads.find(r => r.id === platform.id));
  assert.ok(layout.parts.every(part => part.estimatedVertical));
  assert.ok(station.STATION_BUILDINGS.every(b => b.real && b.heightSource === 'estimated' && world.BUILDINGS.includes(b)));
  assert.ok(layout.eastPaving.length > 0);
  for (const face of layout.eastPaving) for (const weights of [[1 / 3, 1 / 3, 1 / 3], [0.01, 0.49, 0.5]]) {
    const p = { x: face.reduce((s, q, i) => s + q[0] * weights[i], 0), z: face.reduce((s, q, i) => s + q[1] * weights[i], 0) };
    assert.ok(station.stationPolygonContains(p, layout.eastPlaza));
    assert.ok(!pedestrian.inCarriageway(p, 0.25), JSON.stringify(p));
  }
});

test('sloping roofs query their exact upward rendered triangles; both partition seams retain the upper roof', () => {
  const surface = station.stationRoofSurface();
  for (const part of layout.parts) for (const face of part.roof) {
    const p = { x: face.reduce((sum, q) => sum + q[0] / 3, 0), z: face.reduce((sum, q) => sum + q[1] / 3, 0) };
    const expected = face.reduce((sum, q) => sum + q[2] / 3, 0);
    assert.ok(Math.abs(station.stationRoofHeight(p) - expected) < 1e-5);
    assert.equal(station.stationRoofSolid({ ...p, y: expected - 0.01 }), true);
    assert.equal(station.stationRoofSolid({ ...p, y: expected + 1 }), false);
  }
  for (const out of [-75, 70]) {
    const left = station.stationRoofHeight(pnt(0, out - 0.001));
    const right = station.stationRoofHeight(pnt(0, out + 0.001));
    assert.ok(Math.abs(station.stationRoofHeight(pnt(0, out)) - Math.max(left, right)) < 0.001);
  }
  for (let i = 0; i < surface.indices.length; i += 3) {
    const [a, b, c] = surface.indices.slice(i, i + 3).map(index => surface.positions.slice(index * 3, index * 3 + 3));
    const up = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    assert.ok(up >= -1e-6, 'roof top cannot face below the player');
  }
});

test('station residents and their whole routes stay on the source plaza, off carriageways, furniture and facades', () => {
  assert.equal(station.STATION_RESIDENTS.length, 4);
  for (const n of station.STATION_RESIDENTS) assert.ok(pedestrian.pedestrianClear(n), n.id);
  for (const [id, stops] of Object.entries(station.STATION_WALKS)) for (let i = 0; i < stops.length; i++) {
    const a = stops[i]; const b = stops[(i + 1) % stops.length]; const length = world.distance(a, b);
    for (let m = 0; m <= length; m += 0.25) {
      const p = { x: a.x + (b.x - a.x) * m / length, z: a.z + (b.z - a.z) * m / length };
      assert.ok(station.stationPavement(p) && pedestrian.pedestrianClear(p), `${id}: ${JSON.stringify(p)}`);
    }
  }
});

test('Rapier keeps the track concourse elevated, lands on the sloped roof and canopy, and permits the east entrance approach', async () => {
  const g = sim.createGame(); g.phase = 'playing';
  Object.assign(g.player, pnt(0, 0), { y: terrain.terrainTriangleHeight(pnt(0, 0)) });
  const physics = await sim.createPhysics(g);
  const frames = (input, count, yaw = 0) => { for (let i = 0; i < count; i++) sim.step(g, { ...idle, ...input }, 1 / 60, physics, yaw); };
  try {
    frames({}, 120); assert.ok(g.player.y < 12 && g.locomotion.grounded, JSON.stringify(g.player));
    const floor = { ...g.player }; const desired = { ...pnt(0, 0), y: 28 };
    const clipped = camera.constrainCamera({ ...floor, y: floor.y + 1.7 }, desired);
    assert.ok(clipped.y < 18, JSON.stringify(clipped));
    const roof = pnt(0, 110); const roofY = station.stationRoofHeight(roof);
    Object.assign(g.player, roof, { y: roofY + 9, speed: 0 }); g.flight.active = true; g.flight.velocityY = 0; physics.reset();
    frames({ descend: true }, 180);
    assert.ok(Math.abs(g.player.y - roofY) < 0.15, JSON.stringify({ player: g.player, roofY }));
    assert.equal(sim.toggleFlight(g), true); frames({}, 60);
    assert.ok(g.locomotion.grounded && Math.abs(g.player.y - roofY) < 0.15);
    const canopy = pnt(0, 157); const canopyY = 22.775;
    Object.assign(g.player, canopy, { y: canopyY + 7, speed: 0 }); g.flight.active = true; g.flight.velocityY = 0; physics.reset(); frames({ descend: true }, 180);
    assert.ok(Math.abs(g.player.y - canopyY) < 0.15, JSON.stringify(g.player));
    assert.ok(Math.abs(street.streetSupportHeight({ ...g.player }) - canopyY) < 0.01);
    g.flight.active = false;
    Object.assign(g.player, pnt(0, 245), { y: terrain.terrainTriangleHeight(pnt(0, 245)), speed: 0 }); physics.reset();
    const yaw = Math.atan2(pnt(0, 168).x - g.player.x, pnt(0, 168).z - g.player.z);
    frames({ forward: 1 }, Math.round(77 / 4.4 * 60), yaw);
    assert.ok(station.stationLocal(g.player).out < 171, JSON.stringify(g.player));
    assert.ok(Math.abs(g.player.y - terrain.terrainTriangleHeight(g.player)) < 0.2);
  } finally { physics.dispose(); }
});

test('saves restore supported sloped roofs and canopy tops, preserve the open track level and reject unsupported suspension', () => {
  let value; const previous = globalThis.localStorage;
  globalThis.localStorage = { getItem: () => value, setItem: (_, text) => { value = text; } };
  const restored = (u, v, y, flying = false) => {
    const g = sim.createGame(); Object.assign(g.player, pnt(u, v), { y }); g.exploration = true; g.flight.active = flying; sim.saveGame(g);
    const loaded = sim.createGame(); sim.loadGame(loaded); return loaded;
  };
  try {
    const roofY = station.stationRoofHeight(pnt(0, 110));
    for (const flying of [false, true]) {
      const roof = restored(0, 110, roofY, flying);
      assert.ok(Math.abs(roof.player.y - roofY) < 0.15); assert.equal(roof.flight.active, flying);
      const under = restored(0, 0, terrain.terrainTriangleHeight(pnt(0, 0)), flying);
      assert.ok(under.player.y < 12); assert.ok(world.distance(under.player, pnt(0, 0)) < 0.1);
    }
    const canopy = restored(0, 157, 22.775); assert.ok(Math.abs(canopy.player.y - 22.775) < 0.01);
    const invalid = restored(0, 110, roofY + 80);
    assert.ok(invalid.player.y < roofY, JSON.stringify(invalid.player));
    const attic = restored(0, 110, roofY - 0.5, true);
    assert.ok(attic.player.y >= roofY);
  } finally { globalThis.localStorage = previous; }
});
