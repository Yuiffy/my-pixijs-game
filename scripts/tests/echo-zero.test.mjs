import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';

const engine = await loadTypescriptModule('src/components/echoZero/engine.ts');
const world = await loadTypescriptModule('src/components/echoZero/world.ts');
const types = await loadTypescriptModule('src/components/echoZero/types.ts');

const STEP = 20;

/** Advance a deterministic fixed-step simulation. `tap` fires only on the first step. */
function advance(s, ms, held = {}, tap = {}) {
  const steps = Math.ceil(ms / STEP);
  for (let i = 0; i < steps; i += 1) {
    engine.stepGame(s, STEP, {
      ...types.emptyInput(), ...held, ...(i === 0 ? tap : {}),
    });
  }
  return s;
}

function playState() {
  const s = engine.createGame();
  s.phase = 'play';
  s.stage = 0;
  s.fade = 1;
  return s;
}

/** A shambler one metre in front of the spawn point, mid-swing. */
function strikingEnemy(overrides = {}) {
  return {
    id: 99, kind: 'shambler', x: 0, z: 17.9, yaw: Math.PI,
    homeX: 0, homeZ: 17.9,
    hp: 96, maxHp: 96, posture: 0, maxPosture: 70,
    state: 'strike', timer: 0.12, attack: 'claw', attackHit: false,
    aggro: 12, staggerTime: 0, flash: 0, phase: 1,
    spawnAt: 0, dead: false, active: true,
    ...overrides,
  };
}

test('fresh save starts at the title with full vitals and no checkpoint', () => {
  const s = engine.createGame();
  assert.equal(s.phase, 'title');
  assert.equal(s.player.hp, types.PLAYER_MAX_HP);
  assert.equal(s.player.stamina, types.PLAYER_MAX_STAMINA);
  assert.equal(s.player.flasks, types.FLASK_MAX);
  assert.equal(s.checkpoint.lit, false);
  assert.equal(s.bossDefeated, false);
  const view = engine.snapshot(s);
  assert.equal(view.phase, 'title');
  assert.equal(view.area, '第七区 · 末班站台');
  assert.ok(Array.isArray(view.enemies) && view.enemies.length === 0);
});

test('opening cinematic plays radio lines and can be skipped into the first objective', () => {
  const s = engine.createGame();
  engine.startGame(s, false);
  assert.equal(s.phase, 'opening');
  advance(s, 900);
  assert.ok(s.notices.some(n => n.speaker === '栞栞'), 'radio subtitle appears');
  assert.equal(s.phase, 'opening');
  advance(s, 800, { skip: true });
  assert.equal(s.phase, 'play');
  assert.equal(s.stage, 1);
  assert.match(s.objective, /离开末班站台/);
  assert.ok(s.player.invuln > 0, 'spawn protection after the cinematic');
});

test('pause freezes movement and resume restores the simulation', () => {
  const s = playState();
  engine.togglePause(s);
  assert.equal(s.phase, 'paused');
  const before = { x: s.player.x, z: s.player.z };
  advance(s, 1000, { z: -1 });
  assert.deepEqual({ x: s.player.x, z: s.player.z }, before);
  engine.togglePause(s);
  assert.equal(s.phase, 'play');
  advance(s, 1000, { z: -1 });
  assert.ok(s.player.z < before.z - 1, 'walking moves north along -Z');
  assert.equal(s.hints.move, true);
  assert.equal(s.player.stamina, types.PLAYER_MAX_STAMINA, 'walking does not drain stamina');
});

test('light attacks chain into a three-hit combo and cost stamina', () => {
  const s = playState();
  advance(s, STEP, {}, { light: true });
  assert.equal(s.player.action, 'light1');
  assert.equal(s.player.combo, 1);
  assert.ok(s.player.stamina < types.PLAYER_MAX_STAMINA);
  advance(s, 260);
  advance(s, STEP, {}, { light: true });
  assert.equal(s.player.action, 'light2', 'second tap inside the cancel window chains');
  assert.equal(s.player.combo, 2);
  advance(s, 300);
  advance(s, STEP, {}, { light: true });
  assert.equal(s.player.action, 'light3');
  assert.equal(s.hints.attack, true);
  assert.ok(s.effects.some(e => e.kind === 'slash' || e.kind === 'heavySlash'), 'slash VFX emitted');
});

test('a well-timed deflect breaks enemy posture instead of dealing damage', () => {
  const s = playState();
  s.player.invuln = 0;
  s.enemies = [strikingEnemy()];
  const hp = s.player.hp;
  advance(s, STEP, {}, { deflect: true });
  assert.equal(s.stats.deflects, 1);
  assert.equal(s.player.hp, hp, 'no HP lost');
  assert.equal(s.stats.damageTaken, 0);
  assert.ok(s.enemies[0].posture >= 40, 'deflect builds posture damage');
  assert.equal(s.enemies[0].state, 'recover');
  assert.equal(s.hints.deflect, true);
});

test('the same strike without a deflect costs HP and posture', () => {
  const s = playState();
  s.player.invuln = 0;
  s.enemies = [strikingEnemy()];
  advance(s, STEP);
  assert.equal(s.stats.deflects, 0);
  assert.equal(s.player.hp, types.PLAYER_MAX_HP - types.ENEMY_STATS.shambler.damage);
  assert.equal(s.stats.damageTaken, types.ENEMY_STATS.shambler.damage);
  assert.equal(s.player.action, 'hit');
});

test('a staggered enemy can be finished with a deathblow', () => {
  const s = playState();
  s.enemies = [strikingEnemy({ state: 'stagger', staggerTime: 2, timer: 0, z: 17.6 })];
  advance(s, STEP, {}, { interact: true });
  assert.equal(s.stats.deathblows, 1);
  assert.equal(s.player.action, 'deathblow');
  assert.equal(s.enemies[0].state, 'deathblow');
  assert.equal(s.enemies[0].dead, true);
  assert.equal(s.tutorialKills, 1);
});

test('lighting the signal tower restores resources and sets the respawn point', () => {
  const s = playState();
  s.player.x = world.LEVEL.checkpoint.x;
  s.player.z = world.LEVEL.checkpoint.z + 2.1;
  s.player.hp = 40;
  s.player.flasks = 0;
  advance(s, STEP, {}, { interact: true });
  assert.equal(s.checkpoint.lit, true);
  assert.equal(s.stage, 4);
  assert.equal(s.player.hp, types.PLAYER_MAX_HP);
  assert.equal(s.player.flasks, types.FLASK_MAX);
  assert.equal(s.hints.checkpoint, true);
  assert.match(s.objective, /穿过检疫封锁线/);
});

test('death returns the player to the lit checkpoint with the chapter intact', () => {
  const s = playState();
  s.checkpoint.lit = true;
  s.stage = 4;
  s.player.deaths = 2;
  s.stats.deaths = 2;
  s.player.hp = 0;
  s.phase = 'dead';
  engine.respawn(s);
  assert.equal(s.phase, 'play');
  assert.equal(s.player.hp, types.PLAYER_MAX_HP);
  assert.equal(s.player.flasks, types.FLASK_MAX);
  assert.equal(s.player.z, world.LEVEL.checkpoint.z + 3);
  assert.equal(s.checkpoint.lit, true);
  assert.equal(s.stage, 4);
  assert.equal(s.player.invuln, 1.2);
  assert.equal(s.player.deaths, 2, 'death counter survives respawn');
});

test('continue-from-checkpoint skips the opening cinematic', () => {
  const s = engine.createGame();
  s.checkpoint.lit = true;
  engine.startGame(s, true);
  assert.equal(s.phase, 'play');
  assert.equal(s.stage, 4);
  assert.equal(s.checkpoint.lit, true);
  assert.equal(s.player.z, world.LEVEL.checkpoint.z + 3);
  assert.equal(s.player.hp, types.PLAYER_MAX_HP);
  assert.ok(s.notices.some(n => n.speaker === '栞栞'));
});

test('the boss only spawns after the checkpoint stage and past the quarantine gate', () => {
  const early = playState();
  early.player.z = world.LEVEL.bossGate - 1;
  advance(early, STEP);
  assert.equal(early.enemies.some(e => e.kind === 'boss'), false, 'stage 0 blocks boss spawn');

  const late = playState();
  late.stage = 4;
  late.checkpoint.lit = true;
  late.player.z = world.LEVEL.bossGate - 1;
  advance(late, STEP);
  assert.ok(late.enemies.some(e => e.kind === 'boss'));
  assert.equal(late.bossActive, true);
});

test('corridor collision keeps every actor inside the authored level', () => {
  const outOfCar = world.resolvePosition(-4.1, 1.4);
  assert.ok(
    Math.abs(outOfCar.x + 4.1) >= 1.15 || Math.abs(outOfCar.z - 1.4) >= 2.35,
    'spawning inside an abandoned car pushes the actor out',
  );
  const clamped = world.resolvePosition(999, 999);
  assert.ok(Math.abs(clamped.x) <= world.halfWidthAt(clamped.z) + 0.001);
  assert.ok(clamped.z <= world.LEVEL.backZ);
  const deep = world.resolvePosition(0, -999);
  assert.ok(deep.z >= world.LEVEL.plazaEnd);
  assert.equal(world.areaName(world.LEVEL.startZ), '第七区 · 末班站台');
  assert.equal(world.areaName(world.LEVEL.bossSpawn.z), '第七区 · 检疫广场');
});

test('authored city generation is deterministic and combat tables stay bounded', () => {
  const a = world.rng(20261113);
  const b = world.rng(20261113);
  assert.deepEqual([a(), a(), a()], [b(), b(), b()]);
  assert.equal(world.buildFacades().length > 10, true);
  for (const [name, move] of Object.entries(types.MOVES)) {
    assert.ok(move.windup > 0 && move.active > 0 && move.recovery > 0, `${name} has full timing`);
    assert.ok(move.stamina > 0 && move.stamina < types.PLAYER_MAX_STAMINA, `${name} stamina is payable`);
    assert.ok(move.reach < 4 && move.arc <= Math.PI, `${name} has a sane hitbox`);
  }
  for (const [kind, stat] of Object.entries(types.ENEMY_STATS)) {
    assert.ok(stat.tell >= 0.4, `${kind} telegraph is readable`);
    assert.ok(stat.posture > 0 && stat.hp > 0);
  }
  assert.equal(world.SPAWNS.filter(sp => sp.kind === 'boss').length, 1);
  assert.equal(world.RADIO_LINES.every(line => line.at < 12.6), true, 'all radio lines fit the cinematic');
});
