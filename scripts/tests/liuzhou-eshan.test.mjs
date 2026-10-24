import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { spawnSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const previous = require.extensions['.ts'];
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, f);
const park = require('../../src/components/liuzhou/eshan.ts');
const surface = require('../../src/components/liuzhou/eshanSurface.ts');
const terrain = require('../../src/components/liuzhou/terrainMesh.ts');
const sim = require('../../src/components/liuzhou/simulation.ts');
const people = require('../../src/components/liuzhou/pedestrian.ts');
const street = require('../../src/components/liuzhou/street.ts');
const camera = require('../../src/components/liuzhou/camera.ts');
const world = require('../../src/components/liuzhou/world.ts');
if (previous) require.extensions['.ts'] = previous; else delete require.extensions['.ts'];
const layout = JSON.parse(fs.readFileSync('src/components/liuzhou/eshan-layout.json'));
const source = JSON.parse(fs.readFileSync('src/components/liuzhou/city-map.json'));
const pnt = p => ({ x: p[0], z: p[1] });
const idle = { forward: 0, turn: 0, jump: false, sprint: false, brake: false };

test('retaining faces close both actual meshes and split every physical and visible cut/fill crossing', () => {
  const check = spawnSync('python', ['scripts/tests/liuzhou-eshan-seams.py'], { encoding: 'utf8' });
  assert.equal(check.status, 0, `${check.stdout}\n${check.stderr}`);
  const report = JSON.parse(check.stdout.trim());
  assert.ok(report.samples > 30000);
  assert.equal(layout.wallSealing.heightChangeMeters, 0);
  console.log(check.stdout.trim());
});

test('drawn retaining edges reach the visible paving and soil while keeping collision vertices at their original heights', () => {
  const mesh = { positions: [], indices: [], kinds: [] };
  surface.appendEshanSurface(mesh, { minX: -3560, minZ: -450, maxX: -3000, maxZ: 340 });
  const start = layout.faces.length * 3;
  assert.equal(mesh.positions.length / 3 - start, layout.walls.length * 4);
  for (let i = 0; i < layout.walls.length; i++) {
    for (let end = 0; end < 4; end++) {
      const index = start + i * 4 + end;
      const p = layout.walls[i][end];
      assert.deepEqual(mesh.positions.slice(index * 3, index * 3 + 3), p);
      const expected = end < 2 ? terrain.terrainBaseTriangleHeight({ x: p[0], z: p[2] }) - 0.12
        : surface.eshanSurfaceHeight({ x: p[0], z: p[2] }) + surface.ESHAN_PAVING_OFFSET;
      assert.ok(Math.abs(terrain.terrainDrawHeight(p[1], mesh.kinds[index]) - expected) < 2e-5);
    }
  }
});

test('park uses exact archived boundary/path/shelter geometry and explicitly estimates narrow trail grades', () => {
  assert.deepEqual(layout.park, source.areas.find(a => a.id === '205515998'));
  assert.equal(layout.paths.length, 12);
  for (const p of layout.paths) assert.deepEqual(p.points, source.roads.find(r => r.id === p.sourceId).points);
  assert.deepEqual(layout.roughPath, source.roads.find(r => r.id === '1071650440'));
  assert.equal(park.ESHAN_PATH_IDS.has(layout.roughPath.id), false, 'ungraded cliff route still uses rough terrain rendering');
  assert.ok(layout.status.includes('estimated')); assert.ok(layout.maxNodeDemAdjustment < 6.3);
  assert.ok(layout.maxSurfaceGrade < 0.78);
  assert.equal(park.ESHAN_SHELTERS.length, 2); assert.ok(park.ESHAN_TREES.length > 250);
  assert.ok(!world.BUILDINGS.some(b => ['city-osm-1071650439', 'city-osm-1071650443'].includes(b.id)), 'small source park structures cannot become solid 30m residential towers');
  const district = require('../../src/components/liuzhou/city.ts').CITY_DISTRICTS.find(d => d.id === 'eshan-park');
  assert.ok(world.distance(district, park.ESHAN_ENTRANCE) < 0.01);
  assert.deepEqual(fs.readFileSync('src/components/liuzhou/eshan-layout.json'), fs.readFileSync('public/games/liuzhou/eshan-layout.json'));
});

test('shared park surface has upward winding, exact barycentric heights and clear continuous walking centres', () => {
  for (let i = 0; i < layout.faces.length; i += 7) {
    const [a, b, c] = layout.faces[i].map(j => layout.vertices[j]);
    assert.ok((b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]) > -1e-7);
    const p = { x: (a[0] + b[0] + c[0]) / 3, z: (a[2] + b[2] + c[2]) / 3 };
    assert.ok(Math.abs(surface.eshanSurfaceHeight(p) - (a[1] + b[1] + c[1]) / 3) < 1e-4);
    assert.equal(terrain.terrainTriangleHeight(p), surface.eshanSurfaceHeight(p));
  }
  for (const route of layout.paths) for (const index of route.nodes) {
    const p = pnt(layout.nodes[index]);
    assert.ok(surface.eshanSurfaceHeight(p) !== undefined);
    assert.ok(!street.streetContains({ ...p, y: terrain.terrainTriangleHeight(p) + 1 }, 0.38), `${route.sourceId}: ${JSON.stringify(p)}`);
  }
  for (const resident of park.ESHAN_RESIDENTS) assert.ok(people.pedestrianClear(resident), resident.id);
});

test('dense park furniture index is equivalent to scanning all actual solids, including broad margins and boundaries', () => {
  const rawTerrain = require('../../src/components/liuzhou/terrain.ts');
  for (let i = 0; i < street.STREET_SOLIDS.length; i += 7) {
    const b = street.STREET_SOLIDS[i];
    for (const margin of [0, 0.42, 8, 10]) for (const dx of [0, b.size[0] / 2 + margin, 32]) {
      const p = { x: b.at[0] + dx, z: b.at[2], y: b.at[1] + rawTerrain.terrainHeight({ x: b.at[0], z: b.at[2] }) };
      assert.equal(street.streetContains(p, margin), street.STREET_SOLIDS.some(box => street.streetBoxContains(p, box, margin)), JSON.stringify({ p, margin }));
    }
  }
});

test('real Rapier walks from the mapped east entry to the summit circuit and back without flying or teleporting', async () => {
  const g = sim.createGame(); g.phase = 'playing'; g.exploration = true;
  const approach = { x: park.ESHAN_ENTRANCE.x + 6, z: park.ESHAN_ENTRANCE.z };
  Object.assign(g.player, approach, { y: terrain.terrainTriangleHeight(approach) });
  const physics = await sim.createPhysics(g);
  const go = target => {
    for (let i = 0; i < 2000; i++) {
      const d = world.distance(g.player, target);
      if (d < 0.16) return;
      const yaw = Math.atan2(target.x - g.player.x, target.z - g.player.z);
      sim.step(g, { ...idle, forward: Math.min(1, d * 1.5) }, 1 / 60, physics, yaw);
    }
    assert.fail(`hike stuck: ${JSON.stringify({ target, player: g.player, blocked: g.blocked })}`);
  };
  const points = id => layout.paths.find(r => r.sourceId === id).points.map(pnt);
  const ascent = points('1071650447');
  const junction = ascent.findIndex(p => Math.abs(p.x + 3272.213) < 0.01);
  const hike = [...points('1071650451'), ...points('945999802').slice(1, 8), ...ascent.slice(1, junction + 1), ...points('1071650442').slice(1, 9)];
  try {
    for (const p of hike) go(p);
    assert.ok(g.player.y > 165); assert.equal(g.flight.active, false); assert.ok(g.locomotion.distance > 500);
    const upper = { ...g.player }; const clipped = camera.constrainCamera({ ...upper, y: upper.y + 1.7 }, { ...upper, x: upper.x + 0.5, y: upper.y + 2 });
    assert.ok(clipped.y > upper.y + 1, 'cut trail cannot be treated as underground soil by camera');
    for (const p of [...hike].reverse()) go(p);
    assert.ok(world.distance(g.player, park.ESHAN_ENTRANCE) < 0.2); assert.ok(g.player.y < 12);
    go(approach); assert.ok(world.distance(g.player, approach) < 0.2);
  } finally { physics.dispose(); }
});

test('terrain-cut trail saves and flying saves restore to the same support, and park furniture still blocks', () => {
  const previousStorage = globalThis.localStorage; let value;
  globalThis.localStorage = { getItem: () => value, setItem: (_, text) => { value = text; } };
  try {
    const route = layout.paths.find(r => r.sourceId === '1071650447');
    for (const index of [route.nodes[30], route.nodes[100], route.nodes[150]]) {
      const p = pnt(layout.nodes[index]); const y = terrain.terrainTriangleHeight(p);
      for (const flying of [false, true]) {
        const g = sim.createGame(); Object.assign(g.player, p, { y: y + (flying ? 0.2 : 0) }); g.exploration = true; g.flight.active = flying; sim.saveGame(g);
        const restored = sim.createGame(); sim.loadGame(restored); assert.ok(world.distance(restored.player, p) < 0.02); assert.ok(Math.abs(restored.player.y - g.player.y) < 0.05); assert.equal(restored.flight.active, flying);
      }
    }
    const bench = park.ESHAN_SOLIDS.find(b => b.size[0] === 3.4);
    const rawTerrain = require('../../src/components/liuzhou/terrain.ts');
    assert.ok(street.streetContains({ x: bench.at[0], z: bench.at[2], y: bench.at[1] + rawTerrain.terrainHeight({ x: bench.at[0], z: bench.at[2] }) }));
  } finally { globalThis.localStorage = previousStorage; }
});

test('the hillside resident is reachable from the mapped trail and conversation leaves the return route walkable', async () => {
  const upper = layout.paths.find(r => r.sourceId === '1071650442').points.map(pnt);
  const g = sim.createGame(); g.phase = 'playing'; g.exploration = true;
  Object.assign(g.player, upper[3], { y: terrain.terrainTriangleHeight(upper[3]) });
  const physics = await sim.createPhysics(g);
  const go = target => {
    let frame = 0;
    while (world.distance(g.player, target) > 0.18 && frame++ < 2000) {
      const d = world.distance(g.player, target);
      sim.step(g, { ...idle, forward: Math.min(1, d * 1.5) }, 1 / 60, physics, Math.atan2(target.x - g.player.x, target.z - g.player.z));
    }
    assert.ok(frame < 2000, `resident detour blocked: ${JSON.stringify({ target, player: g.player })}`);
    assert.equal(g.flight.active, false);
  };
  try {
    go(upper[2]); go({ x: -3250, z: -82.6 });
    sim.interact(g); assert.equal(g.dialogue?.name, '登山的游人');
    const before = { ...g.player };
    sim.step(g, { ...idle, forward: 1 }, 1 / 60, physics, 0);
    assert.deepEqual(g.player, before, 'conversation freezes movement');
    for (let i = 0; i < 5 && g.dialogue; i++) sim.interact(g);
    assert.equal(g.dialogue, null);
    go(upper[1]); go(upper[0]); go(upper[1]); go(upper[2]); go(upper[3]);
  } finally { physics.dispose(); }
});

test('each reconstructed park branch, ring path and west connection walks in both directions with real physics', async () => {
  const g = sim.createGame(); g.phase = 'playing'; g.exploration = true;
  const physics = await sim.createPhysics(g);
  try {
    for (const route of layout.paths) {
      const points = route.points.map(pnt);
      Object.assign(g.player, points[0], { y: terrain.terrainTriangleHeight(points[0]), speed: 0 }); physics.velocityY = 0; physics.reset();
      for (const p of [...points.slice(1), ...points.slice(0, -1).reverse()]) {
        let frame = 0;
        while (world.distance(g.player, p) > 0.18 && frame++ < 2200) {
          const d = world.distance(g.player, p); const yaw = Math.atan2(p.x - g.player.x, p.z - g.player.z);
          sim.step(g, { ...idle, forward: Math.min(1, d * 1.5), sprint: d > 8 }, 1 / 60, physics, yaw);
        }
        assert.ok(frame < 2200, `${route.sourceId}: ${JSON.stringify({ target: p, player: g.player })}`);
        assert.equal(g.flight.active, false);
      }
      assert.ok(world.distance(g.player, points[0]) < 0.2);
    }
  } finally { physics.dispose(); }
});
