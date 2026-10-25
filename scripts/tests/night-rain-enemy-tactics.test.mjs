import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';

const engine = await loadTypescriptModule('src/components/nightRain/engine.ts');
const tactics = await loadTypescriptModule('src/components/nightRain/enemyTactics.ts');
const combat = await loadTypescriptModule('src/components/nightRain/enemyCombat.ts');
const world = await loadTypescriptModule('src/components/nightRain/world.ts');
const gap = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const fresh = () => { const s = engine.createGame(); engine.startGame(s); return s; };
const place = (s, p) => Object.assign(s.player, p, { lastGround: { ...p }, fallPeak: p.y, jumpHeight: 0, jumpVelocity: 0, invulnerable: 100 });
const step = (s, ms) => engine.stepGame(s, ms, { x: 0, z: 0 });
const isolate = (id = 'courtyard-prowler') => {
  const s = fresh(); const e = s.enemies.find(enemy => enemy.id === id);
  s.enemies = [e]; s.litLamps = []; return { s, e };
};

test('front alert reaches beyond the old short radius while rear detection stays narrower', () => {
  const { s, e } = isolate(); e.facing = Math.PI / 2; place(s, { x: 8, y: 0, z: 0 });
  step(s, 20); assert.equal(e.aggro, true); assert.equal(e.action, 'chase'); assert.ok(e.x > e.spawn.x);
  const rear = isolate(); rear.e.facing = -Math.PI / 2; place(rear.s, { x: 8, y: 0, z: 0 });
  step(rear.s, 200); assert.equal(rear.e.aggro, false);
  const ranged = isolate('canal-guard'); place(ranged.s, { x: 12, y: 0, z: -36 });
  step(ranged.s, 200); assert.equal(ranged.e.aggro, true); assert.ok(gap(ranged.e, ranged.s.player) > 12);
});

test('last seen pursuit walks around a real crate without cutting through it', () => {
  const { s, e } = isolate(); Object.assign(e, { x: -5, z: 0, facing: Math.PI, aggro: true, action: 'chase', timer: 0 });
  const target = { x: -5, y: 0, z: -4 }; place(s, target);
  e.awareness = { lastSeen: target, lost: 0, route: [], repath: 0 };
  assert.equal(world.lineClear(e, target, s), false);
  step(s, 100); assert.equal(e.aggro, true); assert.ok(e.awareness.route.length > 0);
  for (let i = 0; i < 40; i++) {
    step(s, 100);
    assert.equal(world.canOccupy(e.x, e.z, e.y, s, 0.33), true);
    assert.equal(world.playerBlocked(e.x, e.z, e.y, s, 0.33), false);
  }
  assert.ok(gap(e, target) < 2.5, `enemy rounded cover: ${JSON.stringify(e)}`);
});

test('a brief loss of sight keeps aggro, then forgetting returns without resetting health', () => {
  const { s, e } = isolate(); place(s, { x: 12, y: 0, z: -12 });
  Object.assign(e, { x: -5, z: 0, facing: Math.PI, hp: 31, aggro: true, action: 'chase', timer: 0 });
  e.awareness = { lastSeen: { x: -5, y: 0, z: 0 }, lost: 0, route: [], repath: 0 };
  step(s, 1000); assert.equal(e.aggro, true); assert.ok(e.awareness.lost >= 0.99);
  step(s, 5000); step(s, 2000); assert.equal(e.aggro, false); assert.equal(e.hp, 31);
  assert.ok(gap(e, e.spawn) < 0.15); assert.equal(e.action, 'idle');
});

test('returning enemies do not repeatedly reacquire at the edge of their leash', () => {
  const { s, e } = isolate(); place(s, { x: -5, y: 0, z: 5 });
  Object.assign(e, { x: -5, z: 1, action: 'chase', aggro: false });
  e.awareness = { lastSeen: { ...e.spawn }, lost: 8, route: [], repath: 0, returning: true };
  step(s, 100); assert.equal(e.aggro, false); assert.equal(e.awareness.returning, true);
  for (let i = 0; i < 60 && e.awareness.returning; i++) { assert.equal(e.aggro, false); step(s, 50); }
  assert.ok(gap(e, e.spawn) < 0.2);
  step(s, 200); assert.equal(e.aggro, true);
});

test('separate decks and underground layers cannot acquire each other through floors', () => {
  const deck = isolate(); place(deck.s, { x: -5, y: 6, z: -22.5 });
  Object.assign(deck.e, { x: -5, y: 3, z: -14, facing: Math.PI });
  step(deck.s, 200); assert.equal(deck.e.aggro, false);
  const cave = isolate('cave-pike'); place(cave.s, { x: cave.e.x, y: 0, z: cave.e.z });
  step(cave.s, 100); assert.equal(cave.e.aggro, false); assert.equal(cave.e.y, cave.e.spawn.y);
});

test('door changes invalidate cached vision and a closed gate remains solid', () => {
  const { s, e } = isolate('canal-guard'); Object.assign(e, { x: 12, y: 0, z: -10.2, facing: 0 });
  place(s, { x: 12, y: 0, z: -6 }); s.shortcut = true;
  step(s, 10); assert.equal(e.aggro, true); assert.equal(e.awareness.lost, 0);
  s.shortcut = false; step(s, 10); assert.ok(e.awareness.lost > 0);
  Object.assign(e, { action: 'attack', timer: combat.ENEMY_STRIKE_TIME, attackIndex: 2, hitDone: false });
  step(s, 400); assert.ok(e.z < -8.35); assert.ok(s.player.hp > 0);
});

test('committed attacks finish before forgetting and delayed heavy windups stop turning before release', () => {
  const { s, e } = isolate(); place(s, { x: 12, y: 0, z: -12 });
  Object.assign(e, { aggro: true, action: 'windup', timer: 0.1, facing: 0 });
  e.awareness = { lastSeen: { ...e.spawn }, lost: 8, route: [], repath: 0 };
  step(s, 50); assert.equal(e.action, 'windup'); assert.equal(e.aggro, true); assert.equal(e.facing, 0);
  step(s, 200); assert.equal(e.action, 'attack'); assert.equal(e.aggro, true);
  step(s, 400); assert.equal(e.aggro, false);
});

test('circling reverses smoothly and turning enemies move along their body facing', () => {
  const { s, e } = isolate(); e.aggro = true; e.action = 'chase';
  for (let time = 0; time < 30; time += 0.01) {
    assert.ok(Math.abs(tactics.enemyFootwork(e, time + 0.01, 4) - tactics.enemyFootwork(e, time, 4)) < 0.01);
  }
  assert.ok(Math.abs(tactics.enemyFootwork(e, 1, 2.50001)) < 0.001);
  place(s, { x: 8, y: 0, z: 0 }); e.facing = 0;
  const x = e.x; const z = e.z; step(s, 10);
  assert.ok(Math.abs(e.x - x) < Math.abs(e.z - z), 'initial travel follows the turning body');
});

test('lunge travel is independent of tick size and accelerates into weapon contact', () => {
  const e = fresh().enemies.find(enemy => enemy.kind === 'captain'); e.attackIndex = 0;
  const integrate = dt => {
    let total = 0;
    for (let elapsed = 0; elapsed < combat.ENEMY_STRIKE_TIME - 1e-8; elapsed += dt) {
      e.timer = combat.ENEMY_STRIKE_TIME - elapsed;
      total += combat.enemyLungeStep(e, Math.min(dt, e.timer));
    }
    return total;
  };
  assert.ok(Math.abs(integrate(1 / 120) - integrate(0.04)) < 1e-10);
  assert.ok(Math.abs(integrate(0.04) - combat.enemyAttack(e).lunge * 0.6) < 1e-10);
  e.timer = combat.ENEMY_STRIKE_TIME; const start = combat.enemyLungeStep(e, 0.01);
  e.timer -= 0.07; assert.ok(combat.enemyLungeStep(e, 0.01) > start * 4);
  e.timer = 0.1; assert.equal(combat.enemyLungeStep(e, 0.01), 0);
});

test('six-beat boss phases retain distinct silhouettes and continuous pose boundaries', () => {
  const delta = (a, b) => Math.max(...Object.keys(a).map(key => Math.abs(a[key] - b[key])));
  for (const kind of ['boss', 'captain', 'warden']) {
    const e = fresh().enemies.find(enemy => enemy.kind === kind); e.phase = 2;
    const names = [];
    for (let index = 0; index < 6; index++) {
      e.attackIndex = index; const spec = combat.enemyAttack(e); names.push(spec.name);
      const pose = (action, timer) => combat.enemyMotion({ ...e, action, timer });
      assert.ok(delta(pose('windup', 0), pose('attack', combat.ENEMY_STRIKE_TIME)) < 1e-8);
      assert.ok(delta(pose('attack', 0), pose('recover', spec.recovery)) < 1e-8);
      assert.ok(delta(pose('recover', 0), combat.ENEMY_NEUTRAL) < 1e-8);
      assert.ok(Object.values(pose('windup', spec.windup / 2)).every(Number.isFinite));
    }
    assert.equal(new Set(names).size, 6);
    e.phase = 1; e.attackIndex = 3;
    assert.equal(combat.enemyAttack(e).name, combat.enemyAttack({ ...e, attackIndex: 0 }).name);
  }
});

test('save validates and preserves pursuit state, and identical reloads replay deterministically', () => {
  const s = fresh(); const e = s.enemies.find(enemy => enemy.id === 'courtyard-prowler');
  place(s, { x: 12, y: 0, z: -12 }); Object.assign(e, { aggro: true, action: 'chase' });
  s.player.invulnerable = 0;
  e.awareness = { lastSeen: { x: -5, y: 0, z: -4 }, lost: 3.25, route: [{ x: 0, y: 0, z: 0 }], repath: 1, returning: false };
  const saved = engine.saveGame(s); const a = engine.loadGame(saved); const b = engine.loadGame(saved);
  assert.ok(a && b); const memory = a.enemies.find(enemy => enemy.id === e.id).awareness;
  assert.deepEqual(memory, e.awareness); assert.equal(memory.lost, 3.25);
  for (const ms of [40, 80, 120, 200]) { step(a, ms); step(b, ms); }
  assert.deepEqual(a, b);
  for (const badMemory of [{ ...e.awareness, lost: -1 }, { ...e.awareness, lost: Infinity }, { ...e.awareness, lastSeen: { x: 9999999, y: 0, z: 0 } }, { ...e.awareness, returning: 'yes' }]) {
    const bad = JSON.parse(saved); bad.enemies.find(enemy => enemy.id === e.id).awareness = badMemory;
    assert.equal(engine.loadGame(JSON.stringify(bad)), null);
  }
});

test('several blocked pursuers share a bounded route search schedule', () => {
  const { s, e } = isolate(); place(s, { x: -5, y: 0, z: -4 });
  s.enemies = Array.from({ length: 4 }, (_, index) => ({ ...structuredClone(e), id: `blocked-${index}`, x: -5 + index * 0.05, z: 0, aggro: true, action: 'chase', timer: 0,
    awareness: { lastSeen: { x: -5, y: 0, z: -4 }, lost: 0, route: [], repath: 0 } }));
  step(s, 10); assert.equal(s.enemies.filter(enemy => enemy.awareness.repath > 1).length, 1);
  step(s, 50); assert.equal(s.enemies.filter(enemy => enemy.awareness.repath > 1).length, 1);
  step(s, 100); assert.equal(s.enemies.filter(enemy => enemy.awareness.repath > 1).length, 2);
});
