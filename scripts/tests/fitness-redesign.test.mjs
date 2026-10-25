import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';

const e = await loadTypescriptModule('src/components/suiFitness/engine.ts');
const setup = (extra = {}) => {
  const s = e.createFitness(41);
  e.startFitness(s);
  s.spawnTimer = 10000; s.proteinTimer = 10000; s.pickups = [];
  s.weapons = { dumbbell: 0, water: 0, rope: 0, aura: 0 };
  s.foods = [{ id: s.nextId++, kind: 'dq', x: 625, y: 350, radius: 25,
    hp: 20, maxHp: 20, age: 0, charge: 3, telegraph: 0, rush: 0,
    vx: 0, vy: 0, ...extra }];
  return s;
};
const dash = s => e.advanceFitness(s, 250, { x: 1, y: 0, dash: true });

test('swept dash hits once across substeps and never repeats while held', () => {
  const s = setup(); dash(s);
  assert.equal(s.foods[0].hp, 18);
  assert.equal(s.dashDamage, 2); assert.equal(s.dashUses, 1);
  assert.equal(s.dashHitIds.length, 1);
  assert.ok(s.player.x > 690 && s.player.x < 710);
  assert.ok(s.stamina > 70 && s.stamina < 75);
  e.advanceFitness(s, 3000, { x: 0, y: 0, dash: true });
  assert.equal(s.dashUses, 1);
  e.stepFitness(s, 1 / 60, { x: -1, y: 0 });
  e.stepFitness(s, 1 / 60, { x: -1, y: 0, dash: true });
  assert.equal(s.dashUses, 2);
});

test('dash misses food outside its path, respects cooldown and stamina', () => {
  const away = setup({ y: 470 }); dash(away); assert.equal(away.dashDamage, 0);
  const tired = setup(); tired.stamina = 20; dash(tired); assert.equal(tired.dashUses, 0);
  const cooling = setup(); cooling.dashCooldown = 1; dash(cooling); assert.equal(cooling.dashUses, 0);
});

test('interception cancels telegraph and live rush with bonus damage', () => {
  for (const kind of ['jerky', 'tea']) {
    for (const timing of [{ telegraph: 0.7 }, { rush: 0.6, vx: -180 }]) {
      const s = setup({ kind, ...timing }); dash(s);
      assert.equal(s.dashDamage, 3.5); assert.equal(s.interceptions, 1);
      assert.equal(s.foods[0].telegraph, 0); assert.equal(s.foods[0].rush, 0);
      assert.ok(s.foods[0].charge > 2);
      assert.ok(s.effects.some(effect => effect.text === '截击 3.5'));
    }
  }
});

test('ordinary rush contact and hotpot telegraph do not falsely count interception', () => {
  const normal = setup({ kind: 'jerky' }); dash(normal);
  assert.equal(normal.dashDamage, 2); assert.equal(normal.interceptions, 0);
  const hotpot = setup({ kind: 'hotpot', telegraph: 0.9 }); dash(hotpot);
  assert.equal(hotpot.interceptions, 0); assert.equal(hotpot.dashDamage, 2);
  assert.ok(hotpot.foods[0].telegraph > 0);
});

test('dash defeat rewards once and actual damage never counts overkill', () => {
  const s = setup({ hp: 1, maxHp: 1 }); dash(s);
  assert.equal(s.dashDefeats, 1); assert.equal(s.defeats, 1); assert.equal(s.dashDamage, 1);
  assert.equal(s.foods.length, 0);
  assert.equal(s.pickups.length + s.totalXp / 5, 1);
  e.advanceFitness(s, 1000);
  assert.equal(s.defeats, 1); assert.equal(s.pickups.length + s.totalXp / 5, 1);
});

test('cake splits through existing defeat path, with no duplicated parent reward', () => {
  const s = setup({ kind: 'cake', hp: 1, maxHp: 1 });
  e.stepFitness(s, 0.05, { x: 1, y: 0, dash: true });
  assert.equal(s.defeats, 1);
  assert.equal(s.foods.filter(f => f.crumb).length, 2);
  assert.ok(s.foods.every(f => f.id !== s.dashHitIds[0]));
});

test('breakthrough widens path and multiplies damage with existing strong buff', () => {
  const miss = setup({ y: 428 }); dash(miss); assert.equal(miss.dashDamage, 0);
  const wide = setup({ y: 428 }); wide.upgrades = ['breakthrough', 'breakthrough', 'strong'];
  wide.buffs.attack = 3; dash(wide);
  assert.ok(Math.abs(wide.dashDamage - 3.6 * 1.2 * 1.35) < 1e-9);
});

test('paused and upgrade states freeze combat feedback; restart resets run counters', () => {
  const s = setup(); e.stepFitness(s, 0.1, { x: 1, y: 0, dash: true });
  for (const phase of ['paused', 'upgrade']) {
    s.phase = phase; const before = structuredClone(s);
    e.advanceFitness(s, 1000, { x: 1, y: 0, dash: true }); assert.deepEqual(s, before);
  }
  const fresh = e.createFitness(41);
  for (const key of ['dashUses', 'dashDamage', 'dashDefeats', 'interceptions', 'impactTime']) assert.equal(fresh[key], 0);
  assert.deepEqual(fresh.dashHitIds, []);
});

test('first-minute hint follows warning, training and completed first actions', () => {
  const s = setup(); assert.match(e.fitnessHint(s), /空格破围/);
  s.elapsed = 20; assert.match(e.fitnessHint(s), /按住 E/);
  s.motivation = 0; assert.match(e.fitnessHint(s), /星星/);
  s.foods[0].kind = 'tea'; s.foods[0].telegraph = 0.5;
  assert.match(e.fitnessHint(s), /截击/);
  s.elapsed = 61; assert.match(e.fitnessHint(s), /三站/);
});
