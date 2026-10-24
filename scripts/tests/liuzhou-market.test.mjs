import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const original = require.extensions['.ts'];
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, file);
const market = require('../../src/components/liuzhou/market.ts');
const world = require('../../src/components/liuzhou/world.ts');
const pedestrian = require('../../src/components/liuzhou/pedestrian.ts');
const terrain = require('../../src/components/liuzhou/terrainMesh.ts');
const street = require('../../src/components/liuzhou/street.ts');
const sim = require('../../src/components/liuzhou/simulation.ts');
const city = require('../../src/components/liuzhou/city.ts');
const east = require('../../src/components/liuzhou/market-east.ts');
const eastLayout = require('../../src/components/liuzhou/market-east-layout.json');
const source = require('../../src/components/liuzhou/city-map.json');
if (original) require.extensions['.ts'] = original; else delete require.extensions['.ts'];
const idle = { forward: 0, turn: 0, sprint: false, brake: false, jump: false };

test('carriageway spatial lookup matches the full source scan at city and core street edges', () => {
  for (const segment of [...world.ROAD_SEGMENTS, ...city.CITY_ROAD_SEGMENTS.filter((_, i) => i % 13 === 0)]) {
    const length = world.distance(segment.a, segment.b); if (length < 0.01) continue;
    for (const offset of [0, segment.road.width / 2 - 0.1, segment.road.width / 2 + 0.7]) {
      const p = { x: (segment.a.x + segment.b.x) / 2 + (segment.b.z - segment.a.z) / length * offset, z: (segment.a.z + segment.b.z) / 2 - (segment.b.x - segment.a.x) / length * offset };
      const candidates = world.canTraverse(p) ? world.ROAD_SEGMENTS : city.CITY_ROAD_SEGMENTS;
      for (const margin of [0, 0.62, 9]) {
        const expected = candidates.some(s => !s.road.foot && world.distance(p, world.closestOnSegment(p, s.a, s.b)) < s.road.width / 2 + margin);
        assert.equal(pedestrian.inCarriageway(p, margin), expected, JSON.stringify({ p, margin }));
      }
    }
  }
});

test('market keeps the archived lane axis, a clear carriageway, and independent pedestrian strips', () => {
  assert.equal(market.MARKET_SOURCE_ID, '835966474');
  assert.deepEqual(market.MARKET_AXIS[0], { x: -781.43, z: -2023.942 });
  assert.ok(market.MARKET_STALLS.length >= 36);
  assert.ok(market.MARKET_BUILDINGS.every(b => !b.real && b.heightSource === 'estimated' && world.BUILDINGS.includes(b)));
  for (let along = 20; along <= 278; along += 0.5) for (const across of [0, -2.4, 2.4, -6.9, 6.9]) {
    const p = market.marketPoint(along, across); const y = terrain.terrainTriangleHeight(p);
    assert.ok(!world.BUILDINGS.some(b => world.buildingContains(p, b, 0.65)), `${along}/${across} building`);
    assert.ok(!street.streetContains({ ...p, y: y + 1 }, 0.45), `${along}/${across} furniture`);
    if (Math.abs(across) > 6) assert.ok(pedestrian.pedestrianClear(p), `${along}/${across} pavement`);
  }
  for (const n of market.MARKET_RESIDENTS) assert.ok(pedestrian.pedestrianClear(n), n.id);
});

test('paving triangles follow the actual terrain cells rather than bridging across slopes', () => {
  const triangles = terrain.terrainDrapedTriangles([{ x: -820, z: -2090 }, { x: -580, z: -2090 }, { x: -580, z: -1970 }, { x: -820, z: -1970 }]);
  let area = 0;
  for (const triangle of triangles) {
    const [a, b, c] = triangle;
    area += Math.abs((b.x - a.x) * (c.z - a.z) - (c.x - a.x) * (b.z - a.z)) / 2;
    const heights = triangle.map(terrain.terrainTriangleHeight);
    for (const weights of [[1 / 3, 1 / 3, 1 / 3], [0.2, 0.35, 0.45]]) {
      const p = { x: triangle.reduce((n, q, i) => n + q.x * weights[i], 0), z: triangle.reduce((n, q, i) => n + q.z * weights[i], 0) };
      const interpolated = heights.reduce((n, y, i) => n + y * weights[i], 0);
      assert.ok(Math.abs(terrain.terrainTriangleHeight(p) - interpolated) < 1e-5, JSON.stringify({ triangle, p, interpolated }));
    }
  }
  assert.ok(Math.abs(area - 240 * 120) < 1e-5, `paving area ${area}`);
});

test('east lane preserves its complete source bends and parcel; estimated courts and buildings keep continuous pedestrian access', () => {
  assert.deepEqual(eastLayout.sourceRoad.points, source.roads.find(r => r.id === market.MARKET_SOURCE_ID).points);
  assert.deepEqual(eastLayout.sourceParcel, source.areas.find(a => a.id === '1539716392'));
  assert.ok(market.MARKET_LENGTH > 574 && market.MARKET_LENGTH < 576);
  assert.equal(eastLayout.sourceRoad.length.toFixed(4), market.MARKET_LENGTH.toFixed(4));
  assert.ok(east.MARKET_EAST_BUILDINGS.length >= 16);
  for (const b of east.MARKET_EAST_BUILDINGS) {
    assert.ok(!b.real && b.heightSource === 'estimated');
    assert.ok(world.BUILDINGS.includes(b));
    for (const a of b.footprint) assert.ok(b.baseY - b.foundationDepth <= terrain.terrainTriangleHeight(a) - 0.5, b.id);
  }
  for (let along = 280; along <= 548; along += 0.5) for (const across of [0, -2.4, 2.4, -6.9, 6.9]) {
    const p = market.marketPoint(along, across);
    assert.ok(!world.BUILDINGS.some(b => world.buildingContains(p, b, 0.65)), `${along}/${across} east building`);
    assert.ok(!street.streetContains({ ...p, y: terrain.terrainTriangleHeight(p) + 1 }, 0.45), `${along}/${across} east furniture`);
    if (Math.abs(across) > 6) assert.ok(pedestrian.pedestrianClear(p), `${along}/${across} east pavement`);
  }
  for (const court of market.MARKET_EAST_COURTS) for (let i = 1; i < court.walk.length; i++) {
    const a = court.walk[i - 1]; const b = court.walk[i]; const length = world.distance(a, b);
    for (let n = 0; n <= length; n += 0.25) {
      const p = { x: a.x + (b.x - a.x) * (n / length), z: a.z + (b.z - a.z) * (n / length) };
      assert.ok(pedestrian.pedestrianClear(p), JSON.stringify({ side: court.side, p }));
      assert.ok(market.marketReserved(p, 10), 'inferred infill must not intrude on court access');
    }
  }
  assert.ok(east.MARKET_EAST_SOLIDS.length > 175, 'source parcel has a physical boundary');
  assert.equal(source.roads.filter(r => r.id === market.MARKET_SOURCE_ID).length, 1, 'no invented side-alley axes');
});

test('ordinary Rapier walking crosses both market pavements and the centre lane; carts block at their physical counter', async () => {
  const g = sim.createGame(); g.phase = 'playing';
  const start = market.marketPoint(20); Object.assign(g.player, start, { y: terrain.terrainTriangleHeight(start) });
  const physics = await sim.createPhysics(g);
  const go = target => {
    let still = 0;
    for (let i = 0; i < 90; i++) {
      const before = { ...g.player }; const gap = world.distance(before, target); if (gap < 0.18) return;
      const yaw = Math.atan2(target.x - before.x, target.z - before.z);
      const frames = Math.max(1, Math.min(45, Math.floor((gap - 0.05) / 4.4 * 60)));
      for (let frame = 0; frame < frames; frame++) sim.step(g, { ...idle, forward: 1 }, 1 / 60, physics, yaw);
      still = world.distance(before, g.player) < 0.01 ? still + 1 : 0;
      assert.ok(still < 4, JSON.stringify({ target, player: g.player }));
    }
    assert.fail(`did not reach ${JSON.stringify(target)}`);
  };
  try {
    for (const across of [0, -6.9, 6.9]) {
      const start = market.marketPoint(20, across); Object.assign(g.player, start, { y: terrain.terrainTriangleHeight(start), speed: 0 }); physics.reset();
      go(market.marketPoint(140, across)); go(market.marketPoint(278, across));
      assert.ok(Math.abs(g.player.y - terrain.terrainTriangleHeight(g.player)) < 0.15);
    }
    for (const across of [0, -6.9, 6.9]) {
      const start = market.marketPoint(278, across); Object.assign(g.player, start, { y: terrain.terrainTriangleHeight(start), speed: 0 }); physics.reset();
      for (const along of [290, 292, 400, 431, 434, 490, 548]) go(market.marketPoint(along, across));
      assert.ok(Math.abs(g.player.y - terrain.terrainTriangleHeight(g.player)) < 0.15);
      for (const along of [490, 434, 431, 400, 292, 290, 278]) go(market.marketPoint(along, across));
    }
    for (const court of market.MARKET_EAST_COURTS) {
      const start = court.walk[0]; Object.assign(g.player, start, { y: terrain.terrainTriangleHeight(start), speed: 0 }); physics.reset();
      for (const p of court.walk.slice(1)) go(p);
      for (const p of court.walk.slice().reverse().slice(1)) go(p);
    }
    const stall = market.MARKET_STALLS.find(s => s.side === 1);
    const p = market.marketPoint(stall.along, 0); Object.assign(g.player, p, { y: terrain.terrainTriangleHeight(p), speed: 0 }); physics.reset();
    const target = market.marketPoint(stall.along, 4.85);
    const yaw = Math.atan2(target.x - p.x, target.z - p.z);
    for (let i = 0; i < 180; i++) sim.step(g, { ...idle, forward: 1 }, 1 / 60, physics, yaw);
    assert.ok(market.marketProjection(g.player).across < 4.1, JSON.stringify(g.player));
    assert.ok(world.distance(p, g.player) > 2.5);
  } finally { physics.dispose(); }
});

test('the residential parcel wall physically stops an ordinary walker while its lane opening stays usable', async () => {
  const g = sim.createGame(); g.phase = 'playing';
  const start = { x: -390, z: -1948 };
  Object.assign(g.player, start, { y: terrain.terrainTriangleHeight(start) });
  const physics = await sim.createPhysics(g);
  try {
    for (let i = 0; i < 180; i++) sim.step(g, { ...idle, forward: 1 }, 1 / 60, physics, 0);
    assert.ok(g.player.z > -1946, 'walks toward the boundary');
    assert.ok(g.player.z < -1942.6, JSON.stringify(g.player));
    assert.ok(Math.abs(g.player.y - terrain.terrainTriangleHeight(g.player)) < 0.15);
    const opening = market.marketPoint(400);
    assert.ok(!street.streetContains({ ...opening, y: terrain.terrainTriangleHeight(opening) + 1 }, 0.65));
  } finally { physics.dispose(); }
});
