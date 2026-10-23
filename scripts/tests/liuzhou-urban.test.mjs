import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';

const w = await loadTypescriptModule('src/components/liuzhou/world.ts');
const u = await loadTypescriptModule('src/components/liuzhou/urban.ts');
const layout = await loadTypescriptModule('src/components/liuzhou/pedestrian-layout.ts');
const original = w.BUILDINGS.filter(b => !b.id.startsWith('urban-'));
const paths = Object.values(layout.CITIZEN_WALKS).map(path => [...path, path[0]]);
const homes = Object.values(layout.NPC_HOMES);
const fabric = u.createUrbanFabric({ roads: w.ROADS, buildings: original, bounds: w.BOUNDS, canTraverse: w.canTraverse, protectedPaths: paths, protectedPoints: homes });
const solids = [...fabric.buildings, ...fabric.walls];
const interpolate = (a, b, spacing = 2) => {
  const count = Math.max(1, Math.ceil(w.distance(a, b) / spacing));
  return Array.from({ length: count + 1 }, (_, i) => ({ x: a.x + (b.x - a.x) * (i / count), z: a.z + (b.z - a.z) * (i / count) }));
};

test('urban data retains OSM land use and a distributable attributed copy', async () => {
  const local = await readFile('src/components/liuzhou/urban-landuse.json', 'utf8');
  assert.equal(local, await readFile('public/games/liuzhou/urban-landuse.json', 'utf8'));
  const source = JSON.parse(local);
  assert.equal(source.license, 'ODbL-1.0');
  assert.match(source.source, /api.openstreetmap.org/);
  assert.ok(u.URBAN_PARCELS.some(p => p.id === '836086516' && p.kind === 'residential'));
  assert.ok(u.URBAN_PARCELS.some(p => p.id === '1044328370' && p.kind === 'school'));
  assert.ok(u.URBAN_PARCELS.some(p => p.id === '205516002' && p.kind === 'park'));
});

test('missing blocks contain collidable houses and closed courtyard walls', () => {
  assert.ok(fabric.buildings.length >= 60);
  assert.ok(fabric.walls.length >= 100);
  assert.ok(fabric.planting.length >= 50);
  assert.equal(new Set(solids.map(b => b.id)).size, solids.length);
  for (const b of solids) {
    assert.equal(b.real, false, 'inferred buildings and wall heights are never labelled as surveyed footprints');
    for (const key of ['x', 'z', 'w', 'd', 'h', 'angle']) assert.ok(Number.isFinite(b[key]));
    assert.ok(w.buildingContains(b, b));
  }
  const enclosed = fabric.courtyards.filter(c => !c.id.startsWith('parcel-')).filter(c => fabric.walls.some(b => b.id === `urban-wall-${c.id.replace('-court', '')}-0`));
  assert.ok(enclosed.length > 30);
  for (const yard of enclosed) {
    for (let i = 0; i < yard.points.length; i++) {
      for (const p of interpolate(yard.points[i], yard.points[(i + 1) % yard.points.length], 1)) {
        assert.ok(fabric.walls.some(b => w.buildingContains(p, b, 0.05)), `${yard.id} has an open perimeter`);
      }
    }
  }
});

test('new fabric preserves every imported street corridor and full pedestrian routines', () => {
  for (const road of w.ROADS) {
    for (let i = 1; i < road.points.length; i++) {
      for (const p of interpolate(road.points[i - 1], road.points[i], 2)) {
        if (!w.canTraverse(p)) continue;
        assert.ok(!solids.some(b => w.buildingContains(p, b, road.width / 2 + 2)), `${road.name} at ${p.x},${p.z}`);
      }
    }
  }
  for (const path of paths) for (let i = 1; i < path.length; i++) {
    for (const p of interpolate(path[i - 1], path[i], 0.5)) assert.ok(!solids.some(b => w.buildingContains(p, b, 1.5)), 'NPC path remains clear');
  }
  for (const p of homes) assert.ok(!solids.some(b => w.buildingContains(p, b, 3)), 'NPC homes remain clear');
});

test('public parks and squares stay open and no canopy intrudes on a bridge', () => {
  for (const b of fabric.buildings) assert.equal(u.urbanPublicGround(b), false);
  for (const tree of fabric.planting) {
    assert.ok(w.canTraverse(tree));
    for (const road of w.ROADS.filter(r => r.bridge)) for (let i = 1; i < road.points.length; i++) {
      assert.ok(w.distance(tree, w.closestOnSegment(tree, road.points[i - 1], road.points[i])) > road.width / 2 + 5, 'tree canopy clears bridge');
    }
  }
});
