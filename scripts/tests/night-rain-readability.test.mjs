import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypescriptModule as load } from './helpers/load-typescript-module.mjs';

const engine = await load('src/components/nightRain/engine.ts');
const motion = await load('src/components/nightRain/enemyCombat.ts');
const { PARRY_WINDOW } = await load('src/components/nightRain/combat.ts');
const fresh = () => { const s = engine.createGame(); engine.startGame(s); return s; };
const step = (s, ms, input = {}) => engine.stepGame(s, ms, { x: 0, z: 0, ...input });

test('all enemy styles raise quickly into distinct loaded silhouettes, then settle continuously', () => {
  const styles = new Map();
  for (const enemy of fresh().enemies) for (const phase of [1, 2]) for (const attackIndex of [0, 1, 2]) {
    const e = { ...enemy, phase, attackIndex, action: 'windup' };
    const spec = motion.enemyAttack(e); const timing = motion.enemyTiming(e);
    const start = motion.enemyMotion({ ...e, timer: spec.windup });
    assert.deepEqual(start, motion.ENEMY_NEUTRAL);
    const loaded = motion.enemyMotion({ ...e, timer: spec.windup - timing.raise });
    assert.ok(Math.abs(loaded.ax) + Math.abs(loaded.ay) + Math.abs(loaded.az) > 1);
    assert.ok(loaded.stance >= .13); assert.ok(Math.abs(loaded.elbow) >= .25);
    styles.set(motion.enemyStyle(e), loaded);
    for (const action of ['windup', 'attack', 'recover']) {
      const total = action === 'windup' ? spec.windup : action === 'attack' ? motion.ENEMY_STRIKE_TIME : spec.recovery;
      for (let t = 0; t <= total; t += .015) assert.ok(Object.values(motion.enemyMotion({ ...e, action, timer: t })).every(Number.isFinite));
    }
    assert.deepEqual(motion.enemyMotion({ ...e, timer: 0 }), motion.enemyMotion({ ...e, action: 'attack', timer: motion.ENEMY_STRIKE_TIME }));
    for (const [joint, value] of Object.entries(motion.enemyMotion({ ...e, action: 'recover', timer: 0 }))) assert.ok(Math.abs(value - motion.ENEMY_NEUTRAL[joint]) < 1e-8);
  }
  assert.equal(styles.size, 5); assert.equal(new Set([...styles.values()].map(p => JSON.stringify(p))).size, 5);
  assert.ok(styles.get('overhead').ax < -2.4); assert.ok(styles.get('draw').ax > -.5);
  assert.ok(styles.get('sweep').twist < -.8); assert.ok(styles.get('shot').weaponPitch > 3);
});

test('delayed attacks hold their silhouette and never suggest parrying during the long hold', () => {
  const e = { ...fresh().enemies.find(e => e.kind === 'boss'), phase: 2, attackIndex: 1, action: 'windup', hitDone: false };
  const spec = motion.enemyAttack(e); const timing = motion.enemyTiming(e);
  assert.ok(spec.windup - timing.raise - timing.commit > 1);
  for (const timer of [1.4, .7, .35]) {
    const tell = motion.enemyTell({ ...e, timer });
    assert.equal(tell.stage, 'hold'); assert.equal(tell.parryNow, false); assert.equal(tell.committed, false);
    assert.ok(motion.enemyMotion({ ...e, timer }).ax > -.5);
  }
  const imminent = motion.enemyTell({ ...e, timer: .12 });
  assert.equal(imminent.stage, 'release'); assert.equal(imminent.parryNow, true);
  assert.ok(imminent.toImpact < PARRY_WINDOW);
  const sweep = { ...e, attackIndex: 2, timer: .08 };
  assert.equal(motion.enemyTell(sweep).dangerous, true); assert.equal(motion.enemyTell(sweep).parryNow, false);
});

test('the bright cue predicts real damage and a successful parry; direction stays planted during release', () => {
  const prepare = timer => {
    const s = fresh(); const e = s.enemies[0];
    Object.assign(s.player, { x: e.x, y: e.y, z: e.z + 1.5, facing: Math.PI });
    Object.assign(e, { action: 'windup', aggro: true, timer, facing: 0, hitDone: false });
    return { s, e };
  };
  const hit = prepare(.12); const eta = motion.enemyTell(hit.e).toImpact;
  step(hit.s, (eta - .02) * 1000); assert.equal(hit.s.player.hp, 100);
  step(hit.s, 35); assert.equal(hit.s.player.hp, 100 - engine.enemyAttack(hit.e).damage);
  const parry = prepare(.12); step(parry.s, (eta + .025) * 1000, { parry: true });
  assert.equal(parry.s.parries, 1); assert.equal(parry.s.player.hp, 100);
  const tracking = prepare(.6); tracking.s.player.x += 1;
  step(tracking.s, 30); assert.ok(tracking.e.facing > 0 && tracking.e.facing <= .082);
  tracking.e.timer = .18; const planted = tracking.e.facing;
  step(tracking.s, 100, { x: -1 }); assert.equal(tracking.e.facing, planted);
});

test('pause and save preserve every tell and a phase change cannot replace an already announced attack', () => {
  const s = fresh(); const e = s.enemies.find(e => e.kind === 'boss');
  Object.assign(s.player, { x: e.x, y: e.y, z: e.z + 2, facing: Math.PI });
  Object.assign(e, { hp: e.maxHp * .49, aggro: true, action: 'windup', attackIndex: 1, timer: .5, facing: 0 });
  const pose = motion.enemyMotion(e); const tell = motion.enemyTell(e);
  engine.setPaused(s, true); step(s, 1000); assert.deepEqual(motion.enemyMotion(e), pose); assert.deepEqual(motion.enemyTell(e), tell);
  const restored = engine.loadGame(engine.saveGame(s)); assert.ok(restored);
  assert.deepEqual(motion.enemyTell(restored.enemies.find(actor => actor.id === e.id)), tell);
  engine.setPaused(s, false); step(s, 300); assert.equal(e.phase, 1); assert.equal(e.action, 'windup');
  step(s, 700); assert.equal(e.phase, 2); assert.equal(e.action, 'recover');
});

test('an old save mid-strike retains its remaining time to contact and migrates only once', () => {
  const old = fresh(); const e = old.enemies[0];
  Object.assign(old.player, { x: e.x, y: e.y, z: e.z + 1.5, facing: Math.PI });
  Object.assign(e, { action: 'attack', timer: .2, hitDone: false, aggro: true, facing: 0 });
  delete old.motionVersion;
  const s = engine.loadGame(JSON.stringify(old)); assert.ok(s); assert.equal(s.motionVersion, 1);
  assert.ok(Math.abs(s.enemies[0].timer - .32) < 1e-8);
  assert.deepEqual(engine.loadGame(engine.saveGame(s)).enemies, s.enemies);
  step(s, 20); assert.equal(s.player.hp, 100);
  step(s, 30); assert.equal(s.player.hp, 100 - engine.enemyAttack(e).damage);
  const future = fresh(); future.motionVersion = 2; assert.equal(engine.loadGame(JSON.stringify(future)), null);
});
