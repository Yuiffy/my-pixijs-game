import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';
import { chooseInput, NIGHT_ROUTE, playFirstLevel, walkTo } from './helpers/night-rain-pilot.mjs';

const engine = await loadTypescriptModule('src/components/nightRain/engine.ts');
const world = await loadTypescriptModule('src/components/nightRain/world.ts');
const { createGame, startGame, stepGame, interact, respawn, setPaused, maxHp, maxStamina, upgrade, saveGame, loadGame } = engine;
const neutral = { x: 0, z: 0 };
const fresh = () => { const s = createGame(); startGame(s); return s; };
const advance = (s, ms, input = neutral) => stepGame(s, ms, input);
const waitUntil = (s, predicate, limit = 15000) => {
  for (let ms = 0; ms < limit && !predicate(s) && s.mode === 'playing'; ms += 10) advance(s, 10);
  assert.ok(predicate(s), JSON.stringify({ player: s.player, enemies: s.enemies, mode: s.mode }));
};
// Isolated fixtures use documented world positions. The full-act tests below
// start from createGame and do not modify state, resources or coordinates.
const courtyardDuel = () => {
  const s = fresh(); Object.assign(s.player, { x: -4, y: 0, z: 3.75, facing: Math.PI });
  return { s, e: s.enemies[0] };
};
const beforeAttack = (s, e, margin = 0.12) => waitUntil(s, () => e.action === 'windup' && e.timer <= margin);
const reachLamp = s => { for (const target of NIGHT_ROUTE.slice(0, 7)) { walkTo(engine, s, target); if (target.interact) interact(s); } };

test('title, pause and invalid delta are inert; long steps are bounded and movement is normalized', () => {
  const s = createGame(); const before = saveGame(s);
  advance(s, 1000, { x: 1, z: 0 }); assert.equal(saveGame(s), before);
  startGame(s); setPaused(s, true); const paused = saveGame(s);
  advance(s, 1000, { x: 1, z: 0 }); assert.equal(saveGame(s), paused);
  setPaused(s, false); const time = s.time;
  advance(s, Number.NaN); advance(s, -1); assert.equal(s.time, time);
  advance(s, 100000); assert.ok(Math.abs(s.time - time - 5) < 0.00001);
  const a = fresh(); const b = fresh();
  advance(a, 500, { x: 1, z: 0 }); advance(b, 500, { x: 900, z: 0 });
  assert.ok(Math.abs(a.player.x - b.player.x) < 0.00001);
});

test('light and heavy hit only at impact in the forward arc and spend actual stamina', () => {
  const { s, e } = courtyardDuel(); const hp = e.hp;
  advance(s, 180, { ...neutral, light: true }); assert.equal(e.hp, hp); assert.equal(s.player.stamina, 83);
  advance(s, 70); assert.equal(e.hp, hp - 24);
  advance(s, 150); assert.equal(e.hp, hp - 24, 'one attack cannot hit repeatedly across substeps');
  const heavy = courtyardDuel(); advance(heavy.s, 450, { ...neutral, heavy: true }); assert.equal(heavy.e.hp, hp);
  advance(heavy.s, 60); assert.equal(heavy.e.hp, hp - 41); assert.equal(heavy.s.player.stamina, 69);
  const away = courtyardDuel(); away.s.player.facing = 0; advance(away.s, 550, { ...neutral, light: true }); assert.equal(away.e.hp, hp);
});

test('holding no attacks causes no contact damage until an actual telegraphed strike', () => {
  const { s, e } = courtyardDuel(); beforeAttack(s, e, 0.3);
  assert.equal(s.player.hp, 100); assert.equal(e.action, 'windup');
  advance(s, 550); assert.equal(s.player.hp, 81); assert.equal(e.action, 'recover');
  advance(s, 350); assert.equal(s.player.hp, 81);
});

test('timed frontal parry interrupts a strike; early or backwards parry takes damage', () => {
  const good = courtyardDuel(); beforeAttack(good.s, good.e); advance(good.s, 250, { ...neutral, parry: true });
  assert.equal(good.s.parries, 1); assert.equal(good.s.player.hp, 100); assert.ok(good.e.posture > 35); assert.equal(good.e.action, 'recover');
  const early = courtyardDuel(); beforeAttack(early.s, early.e, 0.85); advance(early.s, 1100, { ...neutral, parry: true });
  assert.equal(early.s.parries, 0); assert.ok(early.s.player.hp < 100);
  const backwards = courtyardDuel(); backwards.s.player.facing = 0; beforeAttack(backwards.s, backwards.e); advance(backwards.s, 300, { ...neutral, parry: true });
  assert.equal(backwards.s.parries, 0); assert.ok(backwards.s.player.hp < 100);
});

test('repeated legitimate parries break posture and allow exactly one execution reward', () => {
  const { s, e } = courtyardDuel();
  for (let ms = 0; ms < 20000 && e.action !== 'stagger'; ms += 40) advance(s, 40, chooseInput(s, e, { parryOnly: true }));
  assert.equal(e.action, 'stagger'); assert.ok(s.parries >= 2); const hp = e.hp; waitUntil(s, state => state.player.action === 'idle');
  advance(s, 40, { ...neutral, light: true });
  assert.equal(e.action, 'dead'); assert.ok(hp > 0); assert.equal(s.executions, 1); assert.equal(s.rice, 18);
  advance(s, 2000, { ...neutral, light: true }); interact(s);
  assert.equal(s.executions, 1); assert.equal(s.rice, 18);
});

test('dodge invulnerability works even against a wall, but late recovery is vulnerable', () => {
  const fixture = () => {
    const { s, e } = courtyardDuel(); Object.assign(s.player, { z: 9.6 }); Object.assign(e, { z: 8.6, action: 'windup', timer: 0.12, aggro: true }); return { s, e };
  };
  const good = fixture(); advance(good.s, 350, { ...neutral, dodge: true });
  assert.ok(good.s.player.z < 9.68); assert.equal(good.s.player.hp, 100); assert.equal(good.s.player.stamina, 75);
  const early = fixture(); early.e.timer = 0.56; advance(early.s, 850, { ...neutral, dodge: true });
  assert.ok(early.s.player.hp < 100, 'end of roll is not invincible');
});

test('guard absorbs frontal light blows but a heavy strike threatens both health and posture', () => {
  const fixture = () => {
    const s = fresh(); const e = s.enemies.find(x => x.kind === 'guard'); Object.assign(s.player, { x: e.x, y: 0, z: e.z + 1.8, facing: Math.PI }); e.facing = 0; return { s, e };
  };
  const light = fixture(); advance(light.s, 300, { ...neutral, light: true }); assert.ok(light.e.maxHp - light.e.hp < 12); assert.ok(light.e.posture > 19);
  const heavy = fixture(); advance(heavy.s, 550, { ...neutral, heavy: true }); assert.equal(heavy.e.maxHp - heavy.e.hp, 41); assert.ok(heavy.e.posture > 43);
});

test('stamina exhausts, recovers only after delay, and healing is finite and interruptible', () => {
  const s = fresh();
  for (let i = 0; i < 5; i += 1) advance(s, 520, { ...neutral, light: true });
  assert.equal(s.player.stamina, 11); const time = s.player.actionTime; advance(s, 20, { ...neutral, heavy: true });
  assert.equal(s.player.action, 'idle'); assert.equal(s.player.actionTime, time); advance(s, 3000); assert.ok(s.player.stamina > 80);
  const duel = courtyardDuel(); beforeAttack(duel.s, duel.e, 0.2); duel.s.player.hp = 60;
  advance(duel.s, 800, { ...neutral, heal: true }); assert.equal(duel.s.player.flasks, 2); assert.equal(duel.s.player.hp, 41);
  const safe = fresh(); safe.player.hp = 20; advance(safe, 1150, { ...neutral, heal: true }); assert.equal(safe.player.hp, 80); assert.equal(safe.player.flasks, 2);
});

test('collision blocks crate strikes, unsafe ledge changes and damage between elevations', () => {
  const s = fresh(); Object.assign(s.player, { x: -5, y: 0, z: -0.9, facing: Math.PI });
  const e = s.enemies[0]; Object.assign(e, { x: -5, y: 0, z: -3.1, facing: 0 });
  advance(s, 550, { ...neutral, heavy: true }); assert.equal(e.hp, e.maxHp); assert.equal(world.lineClear(s.player, e), false);
  const upstairs = fresh(); Object.assign(upstairs.player, { x: 8.2, y: 3, z: 6 }); const px = upstairs.player.x;
  advance(upstairs, 1000, { x: -1, z: 0 }); assert.ok(upstairs.player.x >= 8); assert.ok(upstairs.player.x <= px);
  Object.assign(e, { x: -5, y: 6, z: -1.5 }); Object.assign(s.player, { x: -5, y: 0, z: 0.5 });
  advance(s, 600, { ...neutral, light: true }); assert.equal(e.hp, e.maxHp);
});

test('a legal route descends stairs and lights checkpoint; the shortcut cannot open from the courtyard side', () => {
  const s = fresh(); reachLamp(s); assert.equal(s.checkpoint, 'courtyard'); assert.equal(s.player.y, 0);
  walkTo(engine, s, { x: 7, z: 7 }); walkTo(engine, s, { x: 7, z: -1 }); walkTo(engine, s, { x: 11.3, z: -1 });
  advance(s, 3000, { x: 0, z: -1 }); const before = s.player.z; interact(s);
  assert.ok(before > -7.4); assert.equal(s.shortcut, false); advance(s, 500, { x: 0, z: -1 }); assert.ok(s.player.z >= before - 0.01);
});

test('all enemies, reward branches, shortcut loop, upgrade and dinner are completed with ordinary inputs only', () => {
  const run = playFirstLevel(engine); const s = run.state;
  assert.equal(s.mode, 'ending'); assert.equal(s.deaths, 0); assert.equal(s.kills, 6); assert.ok(s.parries > 10); assert.ok(s.executions >= 6);
  assert.equal(s.level, 1); assert.equal(s.bankedRice, 40); assert.equal(s.charm, true); assert.equal(s.shortcut, true); assert.equal(s.bossDefeated, true);
  assert.ok(s.visited.includes('金塔屋脊')); assert.ok(s.visited.includes('运河侧廊')); assert.ok(s.visited.includes('封街夜市'));
  assert.ok(run.stages.find(stage => stage.target.interact === 'shortcut').kills === 5, 'shortcut is opened before boss victory');
  assert.ok(s.enemies.find(e => e.kind === 'boss').phase === 2); assert.ok(s.time > 100 && s.time < 250);
  const saved = loadGame(saveGame(s)); assert.ok(saved); assert.equal(saved.mode, 'ending'); assert.equal(saved.rice, s.rice);
});

test('boss phase two offers a genuinely unparryable sweep and an intentionally delayed strike', () => {
  const s = fresh(); const boss = s.enemies.find(e => e.kind === 'boss'); boss.phase = 2;
  boss.attackIndex = 2; const sweep = engine.enemyAttack(boss); assert.equal(sweep.parryable, false); assert.ok(sweep.arc > 2);
  boss.attackIndex = 1; const delayed = engine.enemyAttack(boss); boss.attackIndex = 0;
  assert.ok(delayed.windup > engine.enemyAttack(boss).windup + 0.5);
  Object.assign(s.player, { x: 4, y: 0, z: -39.5, facing: Math.PI }); Object.assign(boss, { attackIndex: 2, hp: 150, action: 'windup', timer: 0.12, aggro: true });
  advance(s, 400, { ...neutral, parry: true }); assert.equal(s.parries, 0); assert.equal(s.player.hp, 64);
});

test('death requires explicit respawn; a legal return retrieves the last bloodstain', () => {
  const s = fresh(); reachLamp(s); walkTo(engine, s, { x: -3, z: 4 }); assert.equal(s.rice, 18);
  walkTo(engine, s, { x: -8, z: 2 });
  advance(s, 800, { x: -0.7, z: -0.7 });
  for (let i = 0; i < 30 && s.mode === 'playing'; i += 1) advance(s, 1000);
  assert.equal(s.mode, 'dead'); assert.equal(s.rice, 0); assert.equal(s.bloodstain.rice, 18); const dead = saveGame(s);
  advance(s, 5000); assert.equal(saveGame(s), dead); const loaded = loadGame(dead); assert.equal(loaded.mode, 'dead');
  const stain = { ...s.bloodstain }; respawn(s); assert.equal(s.mode, 'playing'); assert.equal(s.player.hp, 100); assert.equal(s.player.flasks, 3);
  assert.equal(s.enemies[0].hp, s.enemies[0].maxHp); assert.equal(s.bloodstain.rice, 18);
  walkTo(engine, s, { x: -4, z: 4 }); walkTo(engine, s, { x: -8, z: 2 }); walkTo(engine, s, stain); const carried = s.rice;
  interact(s); assert.equal(s.bloodstain, null); assert.equal(s.rice, carried + 18);
});

test('rest respawns ordinary foes, preserves cleared boss and exploration, and replenishes finite flasks', () => {
  const s = fresh(); startGame(s);
  for (const target of NIGHT_ROUTE) {
    if (target.interact === 'food') break;
    walkTo(engine, s, target, 90000); if (target.interact) interact(s); if (target.upgrade) upgrade(s);
  }
  assert.equal(s.bossDefeated, true);
  for (const target of [{ x: 12, z: -38 }, { x: 12, z: -11 }, { x: 11.3, z: -6.5 }, { x: 11.3, z: -1 }, { x: 7, z: -1 }, { x: 7, z: 7 }, { x: 0, z: 8 }]) walkTo(engine, s, target);
  s.player.hp = 20; s.player.flasks = 0; interact(s);
  assert.equal(s.player.hp, maxHp(s)); assert.equal(s.player.stamina, maxStamina(s)); assert.equal(s.player.flasks, 3);
  assert.equal(s.enemies.filter(e => e.hp > 0).length, world.ENEMY_SPAWNS.filter(e => e.kind !== 'boss').length); assert.equal(s.enemies.find(e => e.kind === 'boss').action, 'dead');
  assert.equal(s.charm, true); assert.equal(s.shortcut, true); assert.equal(s.level, 1);
});

test('save restores exact combat and kills, rejects malformed data and cannot create refresh rewards', () => {
  const s = fresh(); reachLamp(s); walkTo(engine, s, { x: -3, z: 4 });
  walkTo(engine, s, { x: -8, z: 2 }); advance(s, 300, { x: -1, z: -1 });
  const raw = saveGame(s); const restored = loadGame(raw); assert.ok(restored);
  assert.deepEqual(restored.player, s.player); assert.deepEqual(restored.enemies, s.enemies); assert.equal(restored.rice, 18);
  assert.equal(restored.enemies[0].action, 'dead'); advance(restored, 40); assert.equal(restored.rice, 18);
  const invalid = [null, '', '{}', 'null', '{']; for (const value of invalid) assert.equal(loadGame(value), null);
  const corruptions = [
    x => { x.player.x = 900; }, x => { x.player.hp = 5000; }, x => { x.player.action = 'godmode'; },
    x => { x.rice = -10; }, x => { x.level = 15; }, x => { x.player.flasks = 20; },
    x => { x.enemies = []; }, x => { x.enemies[0].hp = 68; }, x => { x.bossDefeated = true; },
    x => { x.shortcut = 'true'; }, x => { x.collected = ['not-real']; }, x => { x.bloodstain = { x: 0, y: 999, z: 0, rice: 99 }; },
  ];
  for (const corrupt of corruptions) { const value = JSON.parse(raw); corrupt(value); assert.equal(loadGame(JSON.stringify(value)), null); }
});
