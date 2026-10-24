import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const old = require.extensions['.ts'];
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, file);
const sim = require('../../src/components/liuzhou/simulation.ts');
const city = require('../../src/components/liuzhou/city.ts');
const world = require('../../src/components/liuzhou/world.ts');
const { terrainHeight } = require('../../src/components/liuzhou/terrain.ts');
const { bridgeSurface } = require('../../src/components/liuzhou/bridges.ts');
const { FLIGHT_CEILING } = require('../../src/components/liuzhou/exploration.ts');
if (old) require.extensions['.ts'] = old; else delete require.extensions['.ts'];
const idle = { forward: 0, turn: 0, jump: false, brake: false, sprint: false };

test('inspection flight reaches a small landing target, limits horizontal and vertical speed even with boost, and releases back to cruise', async () => {
  const g = sim.createGame(); g.phase = 'playing'; g.exploration = true;
  Object.assign(g.player, { x: -1200, z: -1200, y: 200, angle: 0, speed: 0 }); g.flight.active = true;
  const physics = await sim.createPhysics(g);
  try {
    const start = { ...g.player };
    for (let i = 0; i < 120; i++) sim.step(g, { ...idle, forward: 1, jump: true, sprint: true, precise: true }, 1 / 60, physics, 0);
    assert.ok(g.player.speed <= 6.001 && g.player.speed > 5.9);
    assert.ok(g.player.y - start.y > 7 && g.player.y - start.y < 8.1);
    assert.ok(world.distance(start, g.player) > 10 && world.distance(start, g.player) < 12.1);
    const target = { x: g.player.x + 2.7, z: g.player.z - 1.8 };
    for (let frame = 0; frame < 900 && world.distance(g.player, target) > 0.16; frame++) {
      const d = world.distance(g.player, target);
      sim.step(g, { ...idle, precise: true, forward: Math.min(1, d * 1.5) }, 1 / 60, physics, Math.atan2(target.x - g.player.x, target.z - g.player.z));
    }
    assert.ok(world.distance(g.player, target) < 0.18, JSON.stringify({ target, player: g.player }));
    for (let i = 0; i < 60; i++) sim.step(g, { ...idle, forward: 1 }, 1 / 60, physics, 0);
    assert.ok(g.player.speed > 54 && g.player.speed <= 55);
    for (let i = 0; i < 60; i++) sim.step(g, { ...idle, forward: 1, sprint: true }, 1 / 60, physics, 0);
    assert.ok(g.player.speed > 159 && g.player.speed <= 160);
    g.phase = 'paused'; const paused = { ...g.player };
    sim.step(g, { ...idle, forward: 1, jump: true, precise: true }, 1 / 60, physics, 0);
    assert.deepEqual(g.player, paused);
  } finally { physics.dispose(); }
  // The non-Rapier fallback uses the same inspection ascent speed.
  const fallback = sim.createGame(); fallback.phase = 'playing'; fallback.flight.active = true;
  Object.assign(fallback.player, { x: -1200, z: -1200, y: 200 });
  sim.step(fallback, { ...idle, precise: true, jump: true, sprint: true }, 1 / 60);
  assert.ok(Math.abs(fallback.player.y - 200 - 4 / 60) < 1e-6);
});

test('offline city import retains actual station and park source geometry outside the old core', () => {
  const data = JSON.parse(fs.readFileSync('src/components/liuzhou/city-map.json'));
  assert.deepEqual(fs.readFileSync('src/components/liuzhou/city-map.json'), fs.readFileSync('public/games/liuzhou/city-map.json'));
  assert.ok(data.roads.length > 900 && data.sources.length === 10);
  const stationParts = city.CITY_BUILDINGS.filter(b => b.id.startsWith('city-osm-632407338-'));
  assert.equal(stationParts.length, 3);
  const area = points => Math.abs(points.reduce((sum, p, i) => { const q = points[(i + 1) % points.length]; return sum + p.x * q.z - q.x * p.z; }, 0)) / 2;
  const sourceStation = data.buildings.find(b => b.id === '632407338');
  assert.ok(Math.abs(area(sourceStation.points.map(p => ({ x: p[0], z: p[1] }))) - stationParts.reduce((sum, part) => sum + area(part.footprint), 0)) < 0.01);
  assert.ok(city.CITY_PARKS.some(p => p.id === '205515998'));
  assert.ok(data.underground.some(p => p.id === '1275168868'));
  assert.equal(city.CITY_DISTRICTS.find(p => p.id === 'xihuan-eshan').z, -664);
  assert.ok(stationParts.every(part => world.BUILDINGS.includes(part)));
});

test('real Rapier flight crosses the old boundary, respects expanded roofs and walls, pauses, lands and caps altitude', async () => {
  const g = sim.createGame(); g.phase = 'playing';
  Object.assign(g.player, { x: -1100, z: -1200, y: 250, angle: -Math.PI / 2 });
  const p = await sim.createPhysics(g);
  try {
    assert.equal(sim.toggleFlight(g), true);
    for (let i = 0; i < 240; i++) sim.step(g, { ...idle, forward: 1, sprint: true }, 1 / 60, p, -Math.PI / 2);
    assert.ok(g.player.x < -1700, JSON.stringify(g.player));
    assert.ok(g.flight.travelled > 600 && g.player.speed > 150);
    const before = { ...g.player }; g.phase = 'paused'; sim.step(g, { ...idle, jump: true }, 1 / 60, p); assert.deepEqual(g.player, before); g.phase = 'playing';
    Object.assign(g.player, { x: -1000, z: -1200, y: FLIGHT_CEILING - 0.1 }); p.reset();
    for (let i = 0; i < 120; i++) sim.step(g, { ...idle, jump: true, sprint: true }, 1 / 60, p);
    assert.ok(g.player.y <= FLIGHT_CEILING + 0.001);
    const b = city.CITY_BUILDINGS.find(b => !b.footprint && b.w > 20);
    assert.ok(b);
    Object.assign(g.player, { x: b.x, z: b.z, y: world.buildingElevation(b) + b.h + 8, speed: 0 }); g.flight.velocityY = 0; p.reset();
    for (let i = 0; i < 180; i++) sim.step(g, { ...idle, descend: true }, 1 / 60, p);
    assert.ok(Math.abs(g.player.y - world.buildingElevation(b) - b.h) < 0.15, JSON.stringify({ b, player: g.player }));
    assert.equal(sim.toggleFlight(g), true);
    for (let i = 0; i < 120; i++) sim.step(g, idle, 1 / 60, p);
    assert.ok(g.locomotion.grounded);
    assert.ok(Math.abs(g.player.y - world.buildingElevation(b) - b.h) < 0.15);
    // A high-speed sweep through a building must stop at its physical wall.
    assert.equal(sim.toggleFlight(g), true);
    Object.assign(g.player, { x: b.x, z: b.z - b.d / 2 - 12, y: world.buildingElevation(b) + 2, angle: 0, speed: 160 }); g.flight.velocityY = 0; p.reset();
    // Use world-aligned source footprints for this wall test rather than a
    // rotated inferred facade, so the expected stopping face is unambiguous.
    const rect = city.CITY_BUILDINGS.find(q => q.angle === 0 && q.footprint && q.w < 35 && q.d < 35);
    assert.ok(rect);
    Object.assign(g.player, { x: rect.x, z: rect.z - rect.d / 2 - 8, y: world.buildingElevation(rect) + 2, angle: 0, speed: 160 }); p.reset();
    for (let i = 0; i < 35; i++) sim.step(g, { ...idle, forward: 1, sprint: true }, 1 / 60, p, 0);
    assert.ok(g.player.z < rect.z + rect.d / 2, JSON.stringify({ rect, player: g.player }));
  } finally { p.dispose(); }
});

test('Guangya deck is physical at the mapped axis, and river flight cannot be disabled into deep water', async () => {
  const at = { x: -1755, z: -1261 };
  const deck = bridgeSurface(at); assert.ok(deck);
  const g = sim.createGame(); g.phase = 'playing'; Object.assign(g.player, { ...at, y: deck.y + 4 }); g.flight.active = true;
  const p = await sim.createPhysics(g);
  try {
    for (let i = 0; i < 120; i++) sim.step(g, { ...idle, descend: true }, 1 / 60, p);
    assert.ok(Math.abs(g.player.y - deck.y) < 0.1, JSON.stringify(g.player));
    assert.equal(sim.toggleFlight(g), true);
    Object.assign(g.player, { x: 340, z: 105, y: 150 }); g.flight.active = true;
    assert.equal(sim.toggleFlight(g), false);
    assert.equal(g.flight.active, true);
  } finally { p.dispose(); }
});

test('flight saves restore outside the core; grounded rooftop saves keep their real support', () => {
  let save;
  const original = globalThis.localStorage;
  globalThis.localStorage = { getItem: () => save, setItem: (_, v) => { save = v; } };
  try {
    const g = sim.createGame(); g.exploration = true; g.flight.active = true;
    Object.assign(g.player, { x: -2600, z: -1100, y: 200 }); sim.saveGame(g);
    const loaded = sim.createGame(); sim.loadGame(loaded);
    assert.equal(loaded.player.x, -2600); assert.equal(loaded.player.y, 200); assert.equal(loaded.flight.active, true); assert.equal(loaded.exploration, true);
    const b = city.CITY_BUILDINGS.find(q => !q.footprint);
    Object.assign(g.player, { x: b.x, z: b.z, y: world.buildingElevation(b) + b.h }); g.flight.active = false; sim.saveGame(g);
    const landed = sim.createGame(); sim.loadGame(landed);
    assert.ok(Math.abs(landed.player.y - world.buildingElevation(b) - b.h) < 0.01);
    assert.ok(terrainHeight(landed.player) < landed.player.y - 5);
  } finally { globalThis.localStorage = original; }
});
