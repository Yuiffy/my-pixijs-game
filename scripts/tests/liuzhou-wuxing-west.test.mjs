import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const old = require.extensions['.ts'];
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, f);
const sim = require('../../src/components/liuzhou/simulation.ts');
const world = require('../../src/components/liuzhou/world.ts');
const terrain = require('../../src/components/liuzhou/terrainMesh.ts');
const street = require('../../src/components/liuzhou/street.ts');
const camera = require('../../src/components/liuzhou/camera.ts');
const layout = require('../../src/components/liuzhou/wuxing-layout.json');
const wuxing = require('../../src/components/liuzhou/wuxing.ts');
if (old) require.extensions['.ts'] = old; else delete require.extensions['.ts'];
const idle = { forward: 0, turn: 0, sprint: false, brake: false, jump: false };

test('western source shells are represented once, estimates retain provenance, and archived geometry/road/stair clearance agree', () => {
  for (const part of [...wuxing.WUXING_DECOR, ...wuxing.WUXING_SOLIDS]) {
    assert.match(part.color, /^#[0-9a-f]{6}$/i);
    assert.ok([...part.at, ...part.size].every(Number.isFinite));
  }
  for (const label of wuxing.WUXING_LABELS) assert.match(label.color, /^#[0-9a-f]{6}$/i);
  for (const part of layout.renderParts) {
    const shell = world.BUILDINGS.find(b => b.id === `wuxing-osm-${part.id}`);
    for (const id of part.coveredBy) {
      const owner = world.BUILDINGS.find(b => b.id === `wuxing-osm-${id}`);
      assert.ok(world.buildingElevation(owner) + owner.h > world.buildingElevation(shell) + shell.h, `${part.id} exterior owner ${id}`);
      assert.ok(world.buildingElevation(owner) - world.buildingFoundationDepth(owner) < terrain.terrainTriangleHeight(shell), `${part.id} owner foundation`);
    }
  }
  const result = spawnSync('python', ['scripts/tests/liuzhou-wuxing-west-geometry.py'], { encoding: 'utf8' });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`); console.log(result.stdout.trim());
  for (const id of layout.westSourceIds) {
    assert.equal(world.BUILDINGS.filter(b => b.id === `wuxing-osm-${id}`).length, 1);
    assert.ok(!world.BUILDINGS.some(b => b.id === `city-osm-${id}` || b.id === id));
  }
  for (const b of layout.infillBuildings) {
    const actual = world.BUILDINGS.filter(v => v.id === b.id);
    assert.equal(actual.length, 1); assert.equal(actual[0].real, false); assert.equal(actual[0].heightSource, 'estimated');
    for (const p of actual[0].footprint) assert.ok(world.buildingElevation(actual[0]) - world.buildingFoundationDepth(actual[0]) < terrain.terrainTriangleHeight(p) - .5);
  }
  for (const route of Object.values(layout.westWalkRoutes)) for (let i = 1; i < route.points.length; i++) {
    const a = route.points[i - 1]; const b = route.points[i]; const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let n = 0; n <= d; n += .3) {
      const p = { x: a[0] + (b[0] - a[0]) * n / d, z: a[1] + (b[1] - a[1]) * n / d };
      assert.ok(!world.BUILDINGS.some(b => world.buildingContains(p, b, .5)), JSON.stringify(p));
      assert.ok(!street.streetContains({ ...p, y: terrain.terrainTriangleHeight(p) + 1 }, .5), `furniture ${JSON.stringify(p)}`);
    }
  }
});

test('western service-front and south passage permit full ordinary ground round trips', async () => {
  const g = sim.createGame(); g.phase = 'playing'; const physics = await sim.createPhysics(g);
  const go = ([x, z]) => {
    let still = 0;
    for (let chunk = 0; chunk < 120; chunk++) {
      const before = { ...g.player }; const gap = Math.hypot(x - before.x, z - before.z); if (gap < .18) return;
      const yaw = Math.atan2(x - before.x, z - before.z);
      for (let n = 0, count = Math.max(1, Math.min(65, Math.floor((gap - .06) / 4.4 * 60))); n < count; n++) sim.step(g, { ...idle, forward: 1 }, 1 / 60, physics, yaw);
      still = world.distance(before, g.player) < .01 ? still + 1 : 0;
      assert.ok(still < 4, JSON.stringify({ target: [x, z], player: g.player }));
    }
    assert.fail(`did not reach ${x},${z}`);
  };
  try {
    for (const [name, route] of Object.entries(layout.westWalkRoutes)) {
      const start = { x: route.points[0][0], z: route.points[0][1] };
      Object.assign(g.player, start, { y: terrain.terrainTriangleHeight(start), speed: 0 }); physics.reset();
      for (const p of [...route.points, ...route.points.slice().reverse()]) go(p);
      assert.ok(g.locomotion.grounded); assert.equal(g.flight.active, false);
      assert.ok(Math.abs(g.player.y - terrain.terrainTriangleHeight(g.player)) < .3, name);
      console.log(`ordinary round trip: ${name}`);
    }
    for (const approach of layout.shopApproaches) {
      const start = { x: approach.points[0][0], z: approach.points[0][1] };
      Object.assign(g.player, start, { y: terrain.terrainTriangleHeight(start), speed: 0 }); physics.reset();
      for (const point of [...approach.points, ...approach.points.slice().reverse()]) go(point);
      assert.ok(g.locomotion.grounded, approach.buildingId);
      console.log(`ordinary shop approach: ${approach.buildingId}`);
    }
  } finally { physics.dispose(); }
});

test('estimated shop shells block walking/cameras and old saves recover from their interior', async () => {
  const g = sim.createGame(); g.phase = 'playing'; const physics = await sim.createPhysics(g);
  try {
    for (const b of layout.infillBuildings) {
      const actual = world.BUILDINGS.find(v => v.id === b.id);
      const face = layout.facades.find(f => f.buildingId === b.id);
      const midpoint = { x: (face.a[0] + face.b[0]) / 2, z: (face.a[1] + face.b[1]) / 2 };
      const n = { x: face.outward[0], z: face.outward[1] };
      const start = { x: midpoint.x + n.x * 2.5, z: midpoint.z + n.z * 2.5 };
      const target = { x: midpoint.x - n.x * 2.5, z: midpoint.z - n.z * 2.5 };
      Object.assign(g.player, start, { y: terrain.terrainTriangleHeight(start), speed: 0 }); physics.reset();
      const yaw = Math.atan2(target.x - start.x, target.z - start.z);
      for (let i = 0; i < 120; i++) sim.step(g, { ...idle, forward: 1 }, 1 / 60, physics, yaw);
      assert.ok(world.distance(start, g.player) > 1 && world.distance(target, g.player) > 2.9, b.id);
      assert.ok(!world.buildingContains(g.player, actual));
      const eye = { ...start, y: world.buildingElevation(actual) + 1.5 };
      const clipped = camera.constrainCamera(eye, { ...target, y: eye.y });
      assert.ok(world.distance(eye, clipped) < 3.5, b.id);
    }
  } finally { physics.dispose(); }
  const previous = globalThis.localStorage; const store = new Map();
  globalThis.localStorage = { getItem: key => store.get(key) || null, setItem: (key, value) => store.set(key, value) };
  try {
    for (const b of layout.infillBuildings) {
      const actual = world.BUILDINGS.find(v => v.id === b.id);
      Object.assign(g.player, { x: actual.x, z: actual.z, y: terrain.terrainTriangleHeight(actual) }); sim.saveGame(g);
      const restored = sim.createGame(); sim.loadGame(restored);
      assert.ok(!world.BUILDINGS.some(v => world.buildingContains(restored.player, v, .55)), b.id);
    }
  } finally { if (previous === undefined) delete globalThis.localStorage; else globalThis.localStorage = previous; }
});
