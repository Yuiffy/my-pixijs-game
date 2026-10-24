import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const original = require.extensions['.ts'];
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, file);
const guangya = require('../../src/components/liuzhou/guangya.ts');
const bridges = require('../../src/components/liuzhou/bridges.ts');
const terrain = require('../../src/components/liuzhou/terrainMesh.ts');
const world = require('../../src/components/liuzhou/world.ts');
const sim = require('../../src/components/liuzhou/simulation.ts');
const layout = require('../../src/components/liuzhou/guangya-layout.json');
const citySource = require('../../src/components/liuzhou/city-map.json');
if (original) require.extensions['.ts'] = original; else delete require.extensions['.ts'];
const idle = { forward: 0, turn: 0, sprint: false, brake: false, jump: false };

test('bridge spatial queries match the full scan at all deck edges, joins, buckets and large margins', () => {
  const check = (p, margin) => {
    let expected;
    for (const s of bridges.BRIDGE_SECTIONS) {
      const hit = bridges.projectBridge(p, s);
      if (hit.distance <= s.width / 2 + margin && (!expected || hit.distance < expected.distance)) expected = { ...hit, section: s };
    }
    const actual = bridges.bridgeSurface(p, margin);
    assert.deepEqual(actual, expected, JSON.stringify({ p, margin }));
  };
  for (const s of bridges.BRIDGE_SECTIONS) {
    const d = world.distance(s.a, s.b); const nx = (s.b.z - s.a.z) / d; const nz = -(s.b.x - s.a.x) / d;
    for (const t of [0, 0.001, 0.25, 0.5, 0.999, 1]) for (const side of [-1, 0, 1]) for (const margin of [-0.65, 0, 5, 16, 25]) {
      const offset = side * (s.width / 2 + margin);
      check({ x: s.a.x + (s.b.x - s.a.x) * t + nx * offset, z: s.a.z + (s.b.z - s.a.z) * t + nz * offset }, margin);
    }
  }
  for (let x = -2700; x < 600; x += 64) for (let z = -1500; z < 1200; z += 64) for (const offset of [-0.001, 0, 0.001]) check({ x: x + offset, z: z + offset }, 5);
});

test('Guangya keeps both archived carriageways and the complete source approach lengths', () => {
  assert.deepEqual(fs.readFileSync('src/components/liuzhou/guangya-layout.json'), fs.readFileSync('public/games/liuzhou/guangya-layout.json'));
  assert.equal(layout.sourceRoads.length, 17);
  for (const road of layout.sourceRoads) assert.deepEqual(road, citySource.roads.find(r => r.id === road.id));
  assert.ok(layout.sections[0].length > 521 && layout.sections[0].length < 522);
  assert.ok(layout.sections[2].length > 93 && layout.sections[2].length < 94);
  assert.match(layout.heightStatus, /not surveyed/);
  assert.match(layout.axisStatus, /mean of paired/);
  for (let i = 1; i < guangya.GUANGYA_SECTIONS.length; i++) {
    const a = guangya.GUANGYA_SECTIONS[i - 1].b; const b = guangya.GUANGYA_SECTIONS[i].a;
    assert.ok(world.distance(a, b) < 1e-5);
    assert.ok(Math.abs(a.y - b.y) < 1e-6);
  }
  for (const s of guangya.GUANGYA_SECTIONS) {
    assert.ok(world.distance(s.a, s.b) > 0.0001);
    assert.ok(Number.isFinite(s.a.y) && Number.isFinite(s.b.y));
    assert.ok(Math.abs(s.a.y - s.b.y) / world.distance(s.a, s.b) < 0.08, 'estimated grade is walkable');
  }
});

test('Guangya sidewalks join unchanged terrain; all five lower road crossings keep headroom', () => {
  assert.ok(guangya.GUANGYA_ARCH_OFFSET + 1.1 < guangya.GUANGYA_WIDTH / 2 - guangya.GUANGYA_SIDEWALK_WIDTH, 'estimated arch ribs clear the whole walking strip');
  for (const along of [0, guangya.GUANGYA_LENGTH]) for (let across = -19; across < 20; across += 1) {
    const p = guangya.guangyaPoint(along, across);
    assert.ok(p.y <= terrain.terrainTriangleHeight(p) + 0.001, 'terminal slab has no vertical kerb');
    assert.ok(terrain.terrainTriangleHeight(p) - p.y < 0.6, JSON.stringify(p));
  }
  for (const crossing of layout.crossings) for (let across = -19; across <= 19; across += 1) {
    const p = guangya.guangyaPoint(crossing.chainage, across);
    assert.ok(p.y - 0.9 - terrain.terrainTriangleHeight(p) > 4.3, JSON.stringify({ crossing, across, p }));
  }
  for (let along = 3; along < guangya.GUANGYA_LENGTH - 3; along += 4) for (const across of [-guangya.GUANGYA_WALK_OFFSET, guangya.GUANGYA_WALK_OFFSET]) {
    const p = guangya.guangyaPoint(along, across); const hit = bridges.bridgeSurface(p);
    assert.ok(hit && Math.abs(hit.y - p.y) < 0.03, JSON.stringify({ p, hit }));
    assert.ok(!bridges.bridgeSolid({ ...p, y: p.y + 1.1 }), 'walkway is clear of rails');
    assert.ok(!world.BUILDINGS.some(b => world.buildingContains(p, b, 0.6)), 'no infill blocks the bridge');
  }
});

function walker(game, physics) {
  return target => {
    let still = 0;
    for (let chunk = 0; chunk < 240; chunk++) {
      const before = { ...game.player }; const gap = world.distance(before, target);
      if (gap < 0.2) return;
      const yaw = Math.atan2(target.x - before.x, target.z - before.z);
      const frames = Math.max(1, Math.min(60, Math.floor((gap - 0.06) / 4.4 * 60)));
      for (let frame = 0; frame < frames; frame++) sim.step(game, { ...idle, forward: 1 }, 1 / 60, physics, yaw);
      still = world.distance(before, game.player) < 0.01 ? still + 1 : 0;
      assert.ok(still < 4, JSON.stringify({ target, player: game.player }));
    }
    assert.fail(`did not reach ${JSON.stringify(target)} from ${JSON.stringify(game.player)}`);
  };
}

test('ordinary Rapier walking joins both banks and crosses the entire Guangya bridge on both sidewalks', async () => {
  const g = sim.createGame(); g.phase = 'playing';
  // Isolate stationary bridge physics from the unrelated original-core NPC and
  // traffic simulation; browser verification keeps the full live population.
  g.npcs = []; g.traffic = [];
  const physics = await sim.createPhysics(g); const go = walker(g, physics);
  try {
    for (const across of [-guangya.GUANGYA_WALK_OFFSET, guangya.GUANGYA_WALK_OFFSET]) {
      const bridgeStart = guangya.guangyaPoint(0, across);
      const groundStart = { x: bridgeStart.x - 30, z: bridgeStart.z };
      Object.assign(g.player, groundStart, { y: terrain.terrainTriangleHeight(groundStart), speed: 0 }); physics.reset();
      go(bridgeStart);
      console.log(`Guangya ordinary walk starts across=${across}`);
      for (let along = 20; along < guangya.GUANGYA_LENGTH; along += 20) {
        const target = guangya.guangyaPoint(along, across); go(target);
        assert.ok(Math.abs(g.player.y - Math.max(target.y, terrain.terrainTriangleHeight(g.player))) < 0.18, JSON.stringify(g.player));
      }
      const end = guangya.guangyaPoint(guangya.GUANGYA_LENGTH, across); go(end);
      go({ x: end.x + 30, z: end.z });
      console.log(`Guangya reached east bank across=${across}`);
      assert.ok(Math.abs(g.player.y - terrain.terrainTriangleHeight(g.player)) < 0.15, 'east ground landing');
      go(end);
      for (let along = guangya.GUANGYA_LENGTH - 20; along > 0; along -= 20) go(guangya.guangyaPoint(along, across));
      go(bridgeStart); go(groundStart);
      console.log(`Guangya returned west across=${across}`);
      assert.ok(Math.abs(g.player.y - terrain.terrainTriangleHeight(g.player)) < 0.15, 'west ground landing');
    }
  } finally { physics.dispose(); }
});

test('bridge saves preserve the chosen level and migrate only old Guangya deck saves', () => {
  let saved; const previous = globalThis.localStorage;
  globalThis.localStorage = { getItem: () => saved, setItem: (_, value) => { saved = value; } };
  try {
    const g = sim.createGame(); g.exploration = true;
    const deck = guangya.guangyaPoint(750, guangya.GUANGYA_WALK_OFFSET);
    Object.assign(g.player, deck); sim.saveGame(g);
    assert.equal(JSON.parse(saved).bridgeVersion, 2);
    let loaded = sim.createGame(); sim.loadGame(loaded);
    assert.ok(world.distance(loaded.player, deck) < 0.01 && Math.abs(loaded.player.y - deck.y) < 0.01);
    const data = JSON.parse(saved); delete data.bridgeVersion; data.player.y = 16; saved = JSON.stringify(data);
    loaded = sim.createGame(); sim.loadGame(loaded);
    assert.ok(Math.abs(loaded.player.y - deck.y) < 0.01, 'migrates previous level deck');
    for (const c of layout.crossings) {
      const p = { x: c.at[0], z: c.at[1] }; Object.assign(g.player, p, { y: terrain.terrainTriangleHeight(p) });
      sim.saveGame(g); const old = JSON.parse(saved); delete old.bridgeVersion; saved = JSON.stringify(old);
      loaded = sim.createGame(); sim.loadGame(loaded);
      assert.ok(Math.abs(loaded.player.y - g.player.y) < 0.01, 'old lower-road saves stay below bridge');
    }
    Object.assign(g.player, deck, { y: 16 }); g.flight.active = true; sim.saveGame(g);
    const flying = JSON.parse(saved); delete flying.bridgeVersion; saved = JSON.stringify(flying);
    loaded = sim.createGame(); sim.loadGame(loaded);
    assert.equal(loaded.player.y, 16); assert.equal(loaded.flight.active, true);
    assert.ok(guangya.GUANGYA_SUPPORTS.length >= 3);
    const support = guangya.GUANGYA_SUPPORTS[0];
    assert.ok(bridges.bridgeSupportSolid({ x: support.at[0], y: support.at[1], z: support.at[2] }));
    Object.assign(g.player, { x: support.at[0], y: terrain.terrainTriangleHeight({ x: support.at[0], z: support.at[2] }), z: support.at[2] });
    g.flight.active = false; sim.saveGame(g); loaded = sim.createGame(); sim.loadGame(loaded);
    assert.ok(!bridges.bridgeSupportSolid({ ...loaded.player, y: loaded.player.y + 1 }, 0.6), 'new support clears old ground saves');
  } finally { globalThis.localStorage = previous; }
});

test('ordinary Rapier walkers stay on each lower road below Guangya and cannot step through its rails', async () => {
  const g = sim.createGame(); g.phase = 'playing'; g.npcs = []; g.traffic = [];
  const physics = await sim.createPhysics(g); const go = walker(g, physics);
  try {
    for (const crossing of layout.crossings) {
      const road = layout.sourceRoads.find(r => r.id === crossing.roadId);
      const points = road.points.map(([x, z]) => ({ x, z }));
      const p = { x: crossing.at[0], z: crossing.at[1] };
      const i = points.slice(1).findIndex((b, n) => world.distance(p, world.closestOnSegment(p, points[n], b)) < 0.01);
      assert.ok(i >= 0); const a = points[i]; const b = points[i + 1]; const d = world.distance(a, b);
      const at = offset => ({ x: p.x + (b.x - a.x) / d * offset, z: p.z + (b.z - a.z) / d * offset });
      const from = at(-30); Object.assign(g.player, from, { y: terrain.terrainTriangleHeight(from), speed: 0 }); physics.reset();
      go(at(30)); go(from);
      assert.ok(Math.abs(g.player.y - terrain.terrainTriangleHeight(g.player)) < 0.15, road.name);
    }
    const start = guangya.guangyaPoint(750, guangya.GUANGYA_WALK_OFFSET);
    Object.assign(g.player, start, { speed: 0 }); physics.reset();
    for (let i = 0; i < 180; i++) sim.step(g, { ...idle, forward: 1 }, 1 / 60, physics, Math.PI);
    assert.ok(g.player.z > start.z - 1.9, JSON.stringify(g.player));
    assert.ok(Math.abs(g.player.y - start.y) < 0.15);
  } finally { physics.dispose(); }
});
