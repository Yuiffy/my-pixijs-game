import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const previous = require.extensions['.ts'];
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, file);
const bridge = require('../../src/components/liuzhou/wenchang.ts');
const bridges = require('../../src/components/liuzhou/bridges.ts');
const terrain = require('../../src/components/liuzhou/terrainMesh.ts');
const { inCity } = require('../../src/components/liuzhou/exploration.ts');
const city = require('../../src/components/liuzhou/city.ts');
const world = require('../../src/components/liuzhou/world.ts');
const sim = require('../../src/components/liuzhou/simulation.ts');
const layout = require('../../src/components/liuzhou/hedong-layout.json');
if (previous) require.extensions['.ts'] = previous; else delete require.extensions['.ts'];
const idle = { forward: 0, turn: 0, sprint: false, brake: false, jump: false };

test('Hedong is a connected staged district with source footprints and explicit height provenance', () => {
  assert.deepEqual(fs.readFileSync('src/components/liuzhou/hedong-layout.json'), fs.readFileSync('public/games/liuzhou/hedong-layout.json'));
  assert.equal(layout.sourceSquare.holes.length, 10);
  assert.equal(layout.buildings.length, 16);
  assert.ok(inCity({ x: 695, z: -1400 }, 2));
  assert.ok(inCity({ x: 705, z: -1400 }, 2));
  assert.ok(!inCity({ x: 1400, z: 0 }), 'other eastern areas stay outside exploration');
  const ids = new Set();
  for (const r of city.CITY_ROADS) { assert.ok(!ids.has(r.id), `duplicate road ${r.id}`); ids.add(r.id); }
  for (const b of layout.buildings) {
    const runtime = city.CITY_BUILDINGS.find(item => item.id === `city-osm-${b.id}`);
    assert.ok(runtime);
    assert.deepEqual(runtime.footprint, b.points.slice(0, -1).map(([x, z]) => ({ x, z })));
    if (!b.tags.height) assert.equal(runtime.heightSource, 'estimated');
    for (const p of runtime.footprint) assert.ok(runtime.baseY - runtime.foundationDepth < terrain.terrainTriangleHeight(p));
  }
});

test('Wenchang has continuous grades, grounded landings, and clearance above every lower source road', () => {
  console.log('Wenchang profile', { height: bridge.WENCHANG_HEIGHT, landings: bridge.WENCHANG_LANDINGS, length: bridge.WENCHANG_LENGTH });
  for (let i = 0; i < bridge.WENCHANG_SECTIONS.length; i++) {
    const s = bridge.WENCHANG_SECTIONS[i];
    assert.ok(world.distance(s.a, s.b) > .001);
    assert.ok(Math.abs(s.a.y - s.b.y) / world.distance(s.a, s.b) < .12, 'walkable estimated approach');
    if (i) { assert.ok(world.distance(bridge.WENCHANG_SECTIONS[i - 1].b, s.a) < 1e-7); assert.equal(bridge.WENCHANG_SECTIONS[i - 1].b.y, s.a.y); }
  }
  for (const along of [0, bridge.WENCHANG_LENGTH]) for (let across = -14.5; across <= 14.5; across += .5) {
    const p = bridge.wenchangPoint(along, across);
    assert.ok(p.y < terrain.terrainTriangleHeight(p) + .001, 'buried terminal');
    assert.ok(terrain.terrainTriangleHeight(p) - p.y < 1.5, JSON.stringify(p));
  }
  for (const c of layout.bridge.crossings) for (let across = -14.5; across <= 14.5; across += .5) {
    const p = bridge.wenchangPoint(c.chainage, across);
    assert.ok(p.y - bridge.WENCHANG_THICKNESS - terrain.terrainTriangleHeight(p) > 4.4, JSON.stringify({ c: c.roadId, across, p }));
  }
  for (let along = 0; along <= bridge.WENCHANG_LENGTH; along += 10) for (const across of [-bridge.WENCHANG_WALK_OFFSET, bridge.WENCHANG_WALK_OFFSET]) {
    const p = bridge.wenchangPoint(along, across);
    assert.ok(!world.BUILDINGS.some(b => world.buildingContains(p, b, .6)), `building obstructs deck ${JSON.stringify(p)}`);
    assert.ok(bridges.bridgeSurface(p));
  }
});

function walker(game, physics) {
  return target => {
    let still = 0;
    for (let chunk = 0; chunk < 250; chunk++) {
      const before = { ...game.player }; const gap = world.distance(before, target);
      if (gap < .18) return;
      const yaw = Math.atan2(target.x - before.x, target.z - before.z);
      const frames = Math.max(1, Math.min(60, Math.floor((gap - .06) / 4.4 * 60)));
      for (let n = 0; n < frames; n++) sim.step(game, { ...idle, forward: 1 }, 1 / 60, physics, yaw);
      still = world.distance(before, game.player) < .01 ? still + 1 : 0;
      assert.ok(still < 4, JSON.stringify({ target, player: game.player }));
    }
    assert.fail(`did not reach ${JSON.stringify(target)}`);
  };
}

test('ordinary Rapier walking crosses Wenchang both ways, then enters the plaza and Utopia frontage', async () => {
  const g = sim.createGame(); g.phase = 'playing'; g.npcs = []; g.traffic = []; g.vehicles = [];
  const physics = await sim.createPhysics(g); const go = walker(g, physics);
  try {
    for (const across of [bridge.WENCHANG_WALK_OFFSET, -bridge.WENCHANG_WALK_OFFSET]) {
      const start = bridge.wenchangPoint(0, across); const from = { x: start.x - 25, z: start.z };
      Object.assign(g.player, from, { y: terrain.terrainTriangleHeight(from), speed: 0 }); physics.reset();
      go(start);
      for (let along = 15; along < bridge.WENCHANG_LENGTH; along += 15) go(bridge.wenchangPoint(along, across));
      const end = bridge.wenchangPoint(bridge.WENCHANG_LENGTH, across); go(end); go({ x: end.x + 25, z: end.z });
      console.log('Wenchang east landing', g.player);
      assert.ok(Math.abs(g.player.y - terrain.terrainTriangleHeight(g.player)) < .2);
      go(end);
      for (let along = bridge.WENCHANG_LENGTH - 15; along > 0; along -= 15) go(bridge.wenchangPoint(along, across));
      go(start); go(from);
    }
    // Independent ground route into the plaza from the bridge's east landing.
    const end = bridge.wenchangPoint(bridge.WENCHANG_LENGTH, bridge.WENCHANG_WALK_OFFSET);
    Object.assign(g.player, end, { speed: 0 }); physics.reset();
    for (const p of [{ x: 1380, z: end.z }, { x: 1380, z: -1300 }, { x: 1430, z: -1405 }, { x: 1440, z: -1515 }, { x: 1580, z: -1515 }]) go(p);
    assert.ok(g.player.x > 1579);
    assert.ok(Math.abs(g.player.y - terrain.terrainTriangleHeight(g.player)) < .2);
  } finally { physics.dispose(); }
});

test('ordinary lower-road walking and save/restore keep the chosen bridge level', async () => {
  const g = sim.createGame(); g.phase = 'playing'; g.npcs = []; g.traffic = []; g.vehicles = [];
  const physics = await sim.createPhysics(g); const go = walker(g, physics);
  const previousStorage = globalThis.localStorage; let saved;
  globalThis.localStorage = { getItem: () => saved, setItem: (_, value) => { saved = value; } };
  try {
    for (const c of layout.bridge.crossings.filter(c => ['143833786', '680336489', '1502734095'].includes(c.roadId))) {
      const points = c.source.points.map(([x, z]) => ({ x, z })); const p = { x: c.at[0], z: c.at[1] };
      const i = points.slice(1).findIndex((b, n) => world.distance(p, world.closestOnSegment(p, points[n], b)) < .01);
      const a = points[i]; const b = points[i + 1]; const d = world.distance(a, b);
      const at = n => ({ x: p.x + (b.x - a.x) / d * n, z: p.z + (b.z - a.z) / d * n });
      const from = at(-25); Object.assign(g.player, from, { y: terrain.terrainTriangleHeight(from), speed: 0 }); physics.reset();
      go(p); sim.saveGame(g); const restored = sim.createGame(); sim.loadGame(restored);
      assert.ok(Math.abs(restored.player.y - g.player.y) < .1, 'underpass save retains lower level');
      go(at(25)); go(from);
      assert.ok(Math.abs(g.player.y - terrain.terrainTriangleHeight(g.player)) < .2);
    }
    const p = bridge.wenchangPoint(600, bridge.WENCHANG_WALK_OFFSET); Object.assign(g.player, p); sim.saveGame(g);
    const restored = sim.createGame(); sim.loadGame(restored);
    assert.ok(Math.abs(restored.player.y - p.y) < .1);
  } finally { globalThis.localStorage = previousStorage; physics.dispose(); }
});
