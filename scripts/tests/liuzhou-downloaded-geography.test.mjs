import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { ShapeUtils, Vector2 } from 'three';

const require = createRequire(import.meta.url);
const previous = require.extensions['.ts'];
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, file);
const { terrainSurface } = require('../../src/components/liuzhou/terrainMesh.ts');
const terrain = require('../../src/components/liuzhou/terrain.ts');
const world = require('../../src/components/liuzhou/world.ts');
const sim = require('../../src/components/liuzhou/simulation.ts');
if (previous) require.extensions['.ts'] = previous;
else delete require.extensions['.ts'];
const triangulate = rings => ShapeUtils.triangulateShape(rings[0].map(p => new Vector2(...p)), rings.slice(1).map(ring => ring.map(p => new Vector2(...p))));
const shoreline = JSON.parse(fs.readFileSync('src/components/liuzhou/terrain-shoreline.json'));

test('shoreline cell triangulation conserves area, including islands and narrow cuts, and never paints dry land over water', () => {
  let dryTriangles = 0; let banks = 0;
  for (const key of Object.keys(shoreline.cells)) {
    const [step, x, z] = key.split(':').map(Number);
    const bounds = { minX: x, minZ: z, maxX: Math.min(x + step, terrain.TERRAIN_GRID.maxX), maxZ: Math.min(z + step, terrain.TERRAIN_GRID.maxZ) };
    const mesh = terrainSurface(bounds, step, triangulate);
    let area = 0;
    for (let i = 0; i < mesh.indices.length; i += 3) {
      const ids = mesh.indices.slice(i, i + 3);
      const points = ids.map(id => ({ x: mesh.positions[id * 3], y: mesh.positions[id * 3 + 1], z: mesh.positions[id * 3 + 2] }));
      assert.ok(points.every(p => Number.isFinite(p.y)));
      const [a, b, c] = points;
      const cross = (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
      if (mesh.kinds[ids[0]] >= 2) { banks++; continue; }
      assert.ok(cross <= 1e-7, 'top faces wind upward');
      area += Math.abs(cross) / 2;
      const center = { x: (a.x + b.x + c.x) / 3, z: (a.z + b.z + c.z) / 3 };
      if (Math.abs(cross) < 1e-7) continue;
      if (mesh.kinds[ids[0]] === 0) {
        dryTriangles++;
        assert.equal(terrain.inMappedRiver(center), false, `dry triangle crosses shoreline in ${key}`);
      } else {
        assert.equal(terrain.inMappedRiver(center), true, `water triangle crosses land in ${key}`);
        assert.ok(points.every(p => p.y <= terrain.WATER_LEVEL - 1.49));
      }
    }
    assert.ok(Math.abs(area - (bounds.maxX - x) * (bounds.maxZ - z)) < 0.001, `missing/overlapping cell area in ${key}: ${area}`);
  }
  assert.ok(dryTriangles > 2000 && banks > 2000);
});

test('downloaded footprint coordinates, IDs and explicit unknown heights survive curation; source copies remain available', () => {
  const data = JSON.parse(fs.readFileSync('src/components/liuzhou/building-footprints.json'));
  const originals = JSON.parse(fs.readFileSync('public/games/liuzhou/overture-buildings-core.geojson'));
  for (const file of ['building-footprints.json', 'terrain-shoreline.json']) assert.deepEqual(fs.readFileSync(`src/components/liuzhou/${file}`), fs.readFileSync(`public/games/liuzhou/${file}`));
  assert.equal(data.license, 'ODbL-1.0');
  assert.match(data.heightStatus, /No height/);
  const accepted = world.BUILDINGS.filter(b => b.sourceId);
  assert.ok(accepted.length > 300, 'use downloaded coverage rather than only a few hand-picked houses');
  assert.equal(accepted.length + Object.values(world.IMPORTED_BUILDING_STATS.rejected).reduce((a, b) => a + b, 0), data.features.length);
  for (const b of accepted) {
    const source = originals.features.find(f => f.id === b.sourceId);
    assert.equal(b.heightSource, 'estimated');
    assert.equal(source.properties.height, undefined);
    assert.deepEqual(b.footprint.map(p => [p.x, p.z]), data.features.find(f => f.id === b.sourceId).points);
    source.geometry.coordinates[0].slice(0, -1).forEach((p, i) => {
      assert.ok(Math.abs(b.footprint[i].x - (p[0] - 109.41225) * 101458) < 0.001);
      assert.ok(Math.abs(b.footprint[i].z - (24.31415 - p[1]) * 111320) < 0.001);
    });
    for (let i = 0; i < b.footprint.length; i++) {
      const a = b.footprint[i]; const c = b.footprint[(i + 1) % b.footprint.length];
      const length = world.distance(a, c);
      for (let n = 0; n <= length; n += 0.5) {
        const t = n / (length || 1); const p = { x: a.x + (c.x - a.x) * t, z: a.z + (c.z - a.z) * t };
        assert.equal(terrain.inMappedRiver(p), false);
        assert.ok(!world.ROAD_SEGMENTS.some(s => world.distance(p, world.closestOnSegment(p, s.a, s.b)) < s.road.width / 2 + 1.5), `downloaded outline blocks ${b.id}`);
      }
    }
  }
});

test('a downloaded footprint has a real Rapier roof and blocks normal walking through its wall', async () => {
  let fixture;
  for (const b of world.BUILDINGS.filter(b => b.sourceId && b.footprint.length === 4 && world.buildingContains(b, b))) {
    for (let i = 0; i < b.footprint.length; i++) {
      const a = b.footprint[i]; const c = b.footprint[(i + 1) % b.footprint.length];
      const midpoint = { x: (a.x + c.x) / 2, z: (a.z + c.z) / 2 }; const length = world.distance(midpoint, b);
      const start = { x: midpoint.x + (midpoint.x - b.x) / length * 3, z: midpoint.z + (midpoint.z - b.z) / length * 3 };
      if (world.canTraverse(start) && !world.inRiver(start) && !world.BUILDINGS.some(q => world.buildingContains(start, q, 1))) { fixture = { b, start }; break; }
    }
    if (fixture) break;
  }
  assert.ok(fixture);
  const { b, start } = fixture;
  const g = sim.createGame(); g.phase = 'playing'; g.npcs = []; g.vehicles = []; g.traffic = [];
  Object.assign(g.player, start, { y: terrain.terrainHeight(start), speed: 0 });
  const physics = await sim.createPhysics(g);
  try {
    const { default: R } = await import('@dimforge/rapier3d-compat');
    const roof = world.buildingElevation(b) + b.h;
    physics.world.step();
    const ray = new R.Ray({ x: b.x, y: roof + 5, z: b.z }, { x: 0, y: -1, z: 0 });
    assert.ok(Math.abs(physics.world.castRay(ray, 10, true).toi - 5) < 0.01);
    const yaw = Math.atan2(b.x - start.x, b.z - start.z);
    for (let i = 0; i < 180; i++) sim.step(g, { forward: 1, turn: 0, sprint: false, brake: false, jump: false }, 1 / 60, physics, yaw);
    assert.ok(world.distance(start, g.player) > 1);
    assert.equal(world.buildingContains(g.player, b), false, 'wall cannot be walked through');
    assert.ok(Math.abs(g.player.y - terrain.terrainHeight(g.player)) < 0.3);
  } finally { physics.dispose(); }
});
