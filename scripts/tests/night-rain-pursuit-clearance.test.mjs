import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypescriptModule as load } from './helpers/load-typescript-module.mjs';

const engine = await load('src/components/nightRain/engine.ts');
const world = await load('src/components/nightRain/world.ts');
const routes = await load('src/components/nightRain/companion.ts');
const tactics = await load('src/components/nightRain/enemyTactics.ts');
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

function cryptStart() {
  const initial = engine.createGame(); engine.startGame(initial);
  const lamp = world.REST_POINTS['crypt-lamp'];
  Object.assign(initial.player, lamp, { lastGround: { ...lamp }, fallPeak: lamp.y });
  const state = engine.loadGame(engine.saveGame(initial)); assert.ok(state);
  engine.stepGame(state, 40, { x: 0, z: 0, interact: true });
  assert.ok(state.litLamps.includes('crypt-lamp'));
  return state;
}

function walk(state, target, frames, sprint = false) {
  for (let i = 0; i < frames && state.mode === 'playing'; i += 1) {
    const gap = distance(state.player, target);
    engine.stepGame(state, 40, { x: gap > 0.05 ? (target.x - state.player.x) / gap : 0, z: gap > 0.05 ? (target.z - state.player.z) / gap : 0, sprint });
  }
}

test('a normally reached wall edge remains attackable without repeated exhausted pursuit searches; refuge returns the pursuer to its exact post', () => {
  const state = cryptStart();
  const blade = state.enemies.find(enemy => enemy.id === 'crypt-blade');
  const original = routes.findPath; const searches = [];
  routes.findPath = (from, target, access, budget) => {
    const path = original(from, target, access, budget);
    searches.push({ id: from.id, budget, points: path.length });
    return path;
  };
  try {
    walk(state, { x: -47.5, y: -24, z: -17.7 }, 250);
    assert.equal(state.mode, 'playing');
    assert.equal(world.playerBlocked(state.player.x, state.player.z, state.player.y, state, 0.24), false);
    assert.equal(world.canOccupy(state.player.x, state.player.z, state.player.y, state, 0.36), false);
    assert.ok(engine.loadGame(engine.saveGame(state)), 'wall position is accepted by production save validation');
    assert.ok(blade.aggro && world.lineClear(blade, state.player, state));
    assert.ok(distance(blade, state.player) < 1.5, 'pursuit reaches real attack approach distance');
    assert.ok(state.player.hp < 100, 'the normal enemy can complete attacks at this legal wall position');
    assert.ok(searches.filter(search => search.id === blade.id && search.points === 0).length < 2, 'the same impossible exact endpoint does not exhaust 320 nodes repeatedly');
    assert.ok(searches.every(search => search.budget === 320), 'enemy navigation retains its existing search budget');
    walk(state, world.REST_POINTS['crypt-lamp'], 160, true);
    assert.equal(state.mode, 'playing');
    assert.ok(distance(state.player, world.REST_POINTS['crypt-lamp']) < 0.2);
    for (let i = 0; i < 400; i += 1) engine.stepGame(state, 40, { x: 0, z: 0 });
    assert.equal(blade.aggro, false);
    assert.ok(distance(blade, blade.spawn) < 0.15, 'returning routes still finish at the actual post');
    assert.equal(blade.awareness.returning, false);
  } finally { routes.findPath = original; }
});

test('an attack approach endpoint cannot cut the closed shortcut door or its final collision segment', () => {
  const state = engine.createGame(); engine.startGame(state);
  const door = engine.closedDoor(state, 'shortcut');
  const target = { x: door.x, y: door.y, z: door.z + door.d / 2 + 0.25 };
  const pursuer = { x: door.x, y: door.y, z: door.z - 1.4 };
  assert.ok(world.canOccupy(target.x, target.z, target.y, state, 0.24));
  assert.equal(world.canOccupy(target.x, target.z, target.y, state, 0.36), false);
  const endpoint = tactics.enemyPursuitTarget(pursuer, target, state, 1);
  assert.ok(endpoint.z > target.z, 'the valid endpoint stays on the target side of the door');
  assert.ok(distance(endpoint, target) <= 1.00001);
  assert.ok(routes.walkSegment(endpoint, target, state, 0.25, 0.24));
  assert.equal(routes.walkSegment(pursuer, endpoint, state), false);
  assert.equal(world.lineClear(pursuer, target, state), false);
  state.shortcut = true;
  assert.deepEqual(tactics.enemyPursuitTarget(pursuer, target, state, 1), target, 'opening the door restores the exact reachable endpoint');
  assert.ok(routes.walkSegment(pursuer, target, state));
});
