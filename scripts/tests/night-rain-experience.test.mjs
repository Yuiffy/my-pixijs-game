import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { loadTypescriptModule as load } from './helpers/load-typescript-module.mjs';
import { expectedLegacyEnemies } from './helpers/night-rain-experience.mjs';

const engine = await load('src/components/nightRain/engine.ts');
const world = await load('src/components/nightRain/world.ts');
const { WEAPONS, weaponAttack } = await load('src/components/nightRain/weapons.ts');
const { BOSS_ROSTER } = await load('src/components/nightRain/bossRoster.ts');
const fresh = () => { const s = engine.createGame(); engine.startGame(s); return s; };
const step = (s, ms, input = {}) => engine.stepGame(s, ms, { x: 0, z: 0, ...input });
const place = (s, p) => Object.assign(s.player, p, { lastGround: { ...p }, fallPeak: p.y, jumpHeight: 0, jumpVelocity: 0, action: 'idle', attack: null });
const lamp = s => { place(s, world.REST_POINTS.courtyard); step(s, 10); engine.interact(s); };

test('first lamp gives breathing room after ignition, rest, travel and death', () => {
  const s = fresh(); lamp(s); assert.equal(s.checkpoint, 'courtyard');
  assert.ok(Math.hypot(s.enemies[0].spawn.x + 1, s.enemies[0].spawn.z - 7) > 8);
  for (let i = 0; i < 6; i++) step(s, 5000);
  assert.equal(s.player.hp, 100); assert.ok(s.enemies.every(e => !e.aggro));
  engine.interact(s); for (let i = 0; i < 6; i++) step(s, 5000);
  assert.equal(s.restCount, 1); assert.equal(s.player.hp, 100);
  // Leaving the refuge restores a real encounter; this is not global invulnerability.
  place(s, { x: -6, y: 0, z: 2 }); step(s, 80); assert.ok(s.enemies[0].aggro);
  for (let i = 0; i < 15 && s.mode === 'playing'; i++) step(s, 5000);
  assert.equal(s.mode, 'dead'); engine.respawn(s);
  for (let i = 0; i < 6; i++) step(s, 5000);
  assert.equal(s.player.hp, 100); assert.ok(s.enemies.every(e => !e.aggro));
});

test('an empty base stamina bar refills in about 3.2s including delay; guarding still costs recovery', () => {
  const s = fresh(); s.player.stamina = 0; s.player.staminaDelay = 0.75;
  step(s, 700); assert.equal(s.player.stamina, 0);
  step(s, 2500); assert.equal(s.player.stamina, 100);
  const guard = fresh(); guard.player.stamina = 20; step(guard, 1000, { parry: true, guardHeld: true });
  assert.ok(guard.player.stamina <= 31); assert.equal(guard.player.action, 'guard');
});

test('both ambushers are on usable ground, blocked by real cover, and engage after the player peeks', () => {
  for (const [id, approach, peek] of [
    ['alley-ambusher', { x: -17, y: 0, z: 3.5 }, { x: -15.3, y: 0, z: -0.4 }],
    ['market-ambusher', { x: 11, y: 0, z: -41.5 }, { x: 12.7, y: 0, z: -45.5 }],
  ]) {
    const s = fresh(); const e = s.enemies.find(e => e.id === id);
    assert.ok(world.canOccupy(e.x, e.z, e.y, s), id);
    assert.equal(world.lineClear(approach, e, s), false, id);
    place(s, approach); step(s, 100); assert.equal(e.aggro, false, id);
    place(s, peek); assert.ok(world.lineClear(peek, e, s), id); step(s, 100);
    assert.equal(e.aggro, true, id); assert.equal(e.action, 'chase', id); step(s, 380); assert.equal(e.action, 'windup', id);
  }
});

test('touching the correct face opens the door with the same permission shown by the prompt', () => {
  for (const id of ['shortcut', 'temple-gate', 'weaver-gate', 'cistern-gate', 'names-gate', 'sky-return']) {
    const s = fresh(); const gate = engine.closedDoor(s, id);
    const axis = ['east', 'west'].includes(gate.side) ? 'x' : 'z';
    const sign = ['east', 'south'].includes(gate.side) ? 1 : -1;
    // 0.68m is a legal standing position just outside the 0.35m face plus
    // the 0.32m player radius; the old 0.7m side margin rejected it.
    const p = { x: gate.x, y: gate.y, z: gate.z, [axis]: gate[axis] + sign * 0.68 };
    assert.ok(world.canOccupy(p.x, p.z, p.y, s), id);
    place(s, p); step(s, 10); assert.equal(s.nearbyId, id);
    assert.doesNotMatch(s.prompt, /无法从这一侧打开/);
    engine.interact(s); assert.equal(engine.closedDoor(s, id), undefined, id);
  }
});

test('a reachable remote winch opens from its whole interaction area regardless of the distant door plane', () => {
  const s = fresh(); const id = 'royal-gate';
  // East of the physical gate plane, but on the upper floor beside its winch.
  const p = { x: -110.8, y: 24, z: -223.6 };
  assert.ok(world.canOccupy(p.x, p.z, p.y, s));
  place(s, p); step(s, 10); assert.equal(s.nearbyId, id);
  assert.equal(s.prompt, world.LANDMARKS.find(l => l.id === id).label);
  engine.interact(s); assert.equal(engine.closedDoor(s, id), undefined);
  const restored = engine.loadGame(engine.saveGame(s)); assert.ok(restored);
  assert.equal(engine.closedDoor(restored, id), undefined);
  engine.respawn(restored); assert.equal(engine.closedDoor(restored, id), undefined);
});

test('the remote winch exception requires actual range and the same floor', () => {
  for (const p of [
    { x: -110, y: 24, z: -223.6 }, // Out of range.
    { x: -110.8, y: 12, z: -223.6 }, // Wrong floor.
  ]) {
    const s = fresh(); place(s, p);
    const id = 'royal-gate';
    assert.ok(engine.wrongDoorSide(s, id));
    engine.interact(s); assert.ok(engine.closedDoor(s, id));
  }
});

test('every closed one-sided door advertises refusal on its wrong face and cannot open there', () => {
  for (const l of world.LANDMARKS.filter(l => l.kind === 'shortcut')) {
    const s = fresh(); const door = engine.closedDoor(s, l.id); assert.ok(door, l.id);
    const p = { x: door.x, y: door.y, z: door.z };
    if (door.side === 'north') p.z += door.d / 2 + 1;
    if (door.side === 'south') p.z -= door.d / 2 + 1;
    if (door.side === 'west') p.x += door.w / 2 + 1;
    if (door.side === 'east') p.x -= door.w / 2 + 1;
    assert.ok(world.canOccupy(p.x, p.z, p.y, s), l.id);
    place(s, p); step(s, 10); assert.equal(s.nearbyId, l.id, l.id);
    assert.match(s.prompt, /无法从这一侧打开/, l.id); engine.interact(s);
    assert.match(s.message, /无法从这一侧打开/, l.id); assert.ok(engine.closedDoor(s, l.id), l.id);
  }
});

test('forging is safe-lamp-only, spends once, unlocks in order and preserves each form through death and reload', () => {
  const s = fresh(); s.rice = 400; assert.equal(engine.forgeWeapon(s), false);
  lamp(s); s.player.hp = 41; s.player.flasks = 1;
  assert.ok(engine.forgeWeapon(s)); assert.equal(s.rice, 320); assert.equal(s.weapon, 'ironUmbrella');
  assert.equal(engine.forgeWeapon(s), false); assert.equal(s.rice, 320);
  const boss = s.enemies.find(e => e.kind === 'boss'); Object.assign(boss, { hp: 0, action: 'dead', aggro: false }); s.bossDefeated = true;
  assert.ok(engine.forgeWeapon(s)); assert.equal(s.rice, 160); assert.equal(s.weapon, 'katana');
  assert.equal(engine.forgeWeapon(s), false); assert.equal(s.rice, 160);
  assert.equal(s.player.hp, 41); assert.equal(s.player.flasks, 1);
  assert.ok(engine.equipWeapon(s, 'ironUmbrella')); assert.ok(engine.equipWeapon(s, 'katana'));
  const restored = engine.loadGame(engine.saveGame(s)); assert.ok(restored); assert.equal(restored.weapon, 'katana');
  place(s, { x: -6, y: 0, z: 2 }); for (let i = 0; i < 15 && s.mode === 'playing'; i++) step(s, 5000);
  assert.equal(s.mode, 'dead'); engine.respawn(s); assert.equal(s.weapon, 'katana'); assert.equal(s.weaponLevel, 2);
  assert.equal(engine.loadGame(engine.saveGame(s)).weaponLevel, 2);
});

test('weapon forms actually alter reach, damage, posture, stamina and guard rather than only appearance', () => {
  const s = fresh(); const base = weaponAttack(s, 'light1');
  s.weapon = 'ironUmbrella'; const iron = weaponAttack(s, 'light1');
  s.weapon = 'katana'; const blade = weaponAttack(s, 'light1');
  assert.ok(iron.posture > base.posture && iron.damage > base.damage && iron.cost > base.cost);
  assert.ok(blade.range > iron.range && blade.damage > iron.damage && blade.cost < base.cost);
  assert.ok(WEAPONS.ironUmbrella.guard < 1 && WEAPONS.katana.guard > 1);
  const strike = (weapon, range) => {
    const g = fresh(); g.weapon = weapon;
    place(g, { x: -6, y: 0, z: range, facing: Math.PI });
    const e = g.enemies[0]; Object.assign(e, { action: 'recover', timer: 4, aggro: true });
    step(g, 300, { light: true }); return { hp: e.hp, stamina: g.player.stamina };
  };
  assert.equal(strike('umbrella', 2.65).hp, 68);
  assert.ok(strike('katana', 2.65).hp < 68);
});

test('all bosses have unique identities and independently named attacks', () => {
  const s = fresh(); const characters = s.enemies.filter(e => BOSS_ROSTER[e.kind]);
  assert.equal(characters.length, 12); assert.equal(new Set(characters.map(e => e.name)).size, 12);
  assert.ok(characters.every(e => e.name === BOSS_ROSTER[e.kind].name));
  const signatures = characters.flatMap(e => [0,1,2].map(attackIndex => engine.enemyAttack({...e,attackIndex,phase:2}).name));
  assert.equal(new Set(signatures).size, 36);
  const gunner = characters.find(e => BOSS_ROSTER[e.kind].character === 'mizuki');
  assert.ok(engine.enemyAttack(gunner).projectile);
  assert.equal(engine.enemyAttack({...gunner,attackIndex:2}).skill,'drones');
});


test('authentic old saves retain combat and achievements, migrate named bosses, and add only two ambushers', () => {
  const raw = fs.readFileSync(new URL('./fixtures/night-rain-valley-v6.json', import.meta.url), 'utf8'); const old = JSON.parse(raw);
  const s = engine.loadGame(raw); assert.ok(s); assert.deepEqual(s.player, old.player);
  assert.deepEqual(s.enemies.slice(0, old.enemies.length), expectedLegacyEnemies(old.enemies));
  assert.equal(s.weaponLevel, 0); assert.equal(s.weapon, 'umbrella');
  assert.deepEqual(s.defeatedGuests, old.defeatedGuests); assert.equal(s.rice, old.rice);
  assert.ok(s.enemies.slice(-2).every(e => e.hp === e.maxHp && !e.aggro));
  assert.deepEqual(engine.loadGame(engine.saveGame(s)).enemies, s.enemies);
  for (const change of [s => s.weapon = 'missing', s => s.weaponLevel = 9, s => s.weapon = 'katana', s => s.enemies[5].name = 'unknown']) {
    const bad = fresh(); change(bad); assert.equal(engine.loadGame(engine.saveGame(bad)), null);
  }
});
