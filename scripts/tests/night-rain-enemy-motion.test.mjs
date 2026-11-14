import assert from 'node:assert/strict';
import test from 'node:test';
import { Euler, Matrix4, Vector3 } from 'three';
import { loadTypescriptModule as load } from './helpers/load-typescript-module.mjs';

const engine = await load('src/components/nightRain/engine.ts');
const combat = await load('src/components/nightRain/enemyCombat.ts');
const motion = await load('src/components/nightRain/enemyLocomotion.ts');
const enemies = engine.createGame().enemies;
const difference = (a, b) => Math.max(...Object.keys(a).map(key => Math.abs(a[key] - b[key])));
const actor = (kind, id = `motion-${kind}`) => ({ ...structuredClone(enemies.find(e => e.kind === kind)), id, action: 'chase', aggro: true, x: 0, y: 0, z: 0, spawn: { x: 0, y: 0, z: 0 } });
const sample = (e, time = 0, gait = motion.createEnemyGait(e, time)) => motion.sampleEnemyPose(e, time, gait);

test('sole lift exactly bounds the rendered boot corners and stays continuous through attacks', () => {
  const lowestSole = (pose, size, yaw) => {
    // Keep the independent oracle in Three's own Euler and corner transform path.
    const body = new Matrix4().makeRotationFromEuler(new Euler(pose.lean, yaw + pose.twist, pose.roll, 'YXZ'));
    body.scale(new Vector3(size, size, size)); body.setPosition(0, pose.crouch, 0);
    const ys = [];
    for (const side of [-1, 1]) {
      const leg = new Matrix4().makeRotationFromEuler(new Euler(side < 0 ? pose.legL : pose.legR, 0, side * pose.stance));
      leg.setPosition(side * 0.14, 0.8, 0);
      for (const x of [-0.1, 0.1]) for (const y of [-0.775, -0.525]) for (const z of [-0.125, 0.225]) {
        ys.push(new Vector3(x, y, z).applyMatrix4(leg).applyMatrix4(body).y);
      }
    }
    return Math.min(...ys);
  };
  for (const kind of ['guard', 'lancer', 'boss', 'captain', 'warden']) for (const phase of [1, 2]) for (let attackIndex = 0; attackIndex < 6; attackIndex++) {
    const e = { ...actor(kind), phase, attackIndex }; const spec = combat.enemyAttack(e);
    const stages = [['windup', spec.windup], ['attack', combat.ENEMY_STRIKE_TIME], ['recover', spec.recovery]];
    let previousBoundary = null;
    for (const [action, duration] of stages) {
      let previous = null;
      for (let elapsed = 0; elapsed < duration + 0.002; elapsed += 0.002) {
        const pose = sample({ ...e, action, timer: Math.max(0, duration - elapsed) }, 2.5);
        const lift = motion.enemyGroundLift(pose, 1.22);
        if (previous !== null) assert.ok(Math.abs(lift - previous) < 0.045, `${kind}: grounding must not snap`);
        else if (previousBoundary !== null) assert.ok(Math.abs(lift - previousBoundary) < 1e-8, `${kind}: clock boundary`);
        previous = lift;
      }
      previousBoundary = previous;
      for (let step = 0; step <= 80; step++) {
        const pose = sample({ ...e, action, timer: duration * (1 - step / 80) }, 2.5);
        const lift = motion.enemyGroundLift(pose, 1.22);
        assert.ok(Number.isFinite(lift) && lift >= 0 && lift < 0.75);
        for (const size of [0.8, 1.22]) for (const yaw of [0, 2.2]) {
          const low = lowestSole(pose, size, yaw); const corrected = low + motion.enemyGroundLift(pose, size);
          assert.ok(corrected >= -1e-10, `${kind}: boot penetrated the floor`);
          assert.ok(Math.abs(motion.enemyGroundLift(pose, size) - Math.max(0, -low)) < 1e-10, 'only the necessary lift is applied');
        }
      }
    }
  }
});

test('ordinary roles and the three hosts carry visibly different resting weight and weapon arms', () => {
  const roles = ['prowler', 'guard', 'duelist', 'lancer', 'reaver', 'monk', 'boss', 'captain', 'warden'].map(kind => actor(kind));
  const poses = roles.map(e => sample(e));
  assert.equal(new Set(poses.map(p => JSON.stringify(p))).size, roles.length);
  const guard = sample(actor('guard')); const pike = sample(actor('lancer'));
  assert.ok(guard.lx < -0.6 && guard.stance > 0.1, 'shield stays braced in front of the left shoulder');
  assert.ok(pike.ax < -0.5 && pike.lx < -0.5, 'long shaft is carried with both hands');
  const harei = sample(actor('boss')); const shiori = sample(actor('captain')); const nana = sample(actor('warden'));
  assert.ok(harei.lz > 0.1 && harei.leftElbow < -0.4, 'host keeps her open supporting hand');
  assert.ok(shiori.crouch < -0.04 && shiori.twist < -0.1, 'draw carrier stays low and turned');
  assert.ok(nana.stance > shiori.stance && nana.crouch < -0.04, 'pickaxe weight has a broad low base');
});

test('carriers of the same attack style have distinct loaded, contact and retrieval silhouettes', () => {
  const kinds = ['prowler', 'guard', 'duelist', 'lancer', 'reaver', 'monk', 'boss', 'captain', 'warden'];
  for (const stage of ['loaded', 'contact', 'recover']) {
    const poses = [];
    for (const kind of kinds) {
      const e = actor(kind); const spec = combat.enemyAttack(e); const timing = combat.enemyTiming(e);
      const pose = stage === 'loaded' ? combat.enemyMotion({ ...e, action: 'windup', timer: spec.windup - timing.raise })
        : stage === 'contact' ? combat.enemyMotion({ ...e, action: 'attack', timer: combat.ENEMY_STRIKE_TIME - combat.ENEMY_CONTACT_TIME })
          : combat.enemyMotion({ ...e, action: 'recover', timer: spec.recovery * 0.6 });
      poses.push(JSON.stringify(pose));
    }
    assert.equal(new Set(poses).size, kinds.length, stage);
  }
  const ordinary = actor('duelist'); const shiori = actor('captain');
  ordinary.attackIndex = 1; shiori.attackIndex = 0;
  assert.equal(combat.enemyStyle(ordinary), 'draw'); assert.equal(combat.enemyStyle(shiori), 'draw');
  const drawPose = e => combat.enemyMotion({ ...e, action: 'windup', timer: 0.5 });
  assert.ok(drawPose(shiori).crouch < drawPose(ordinary).crouch);
});

test('stance, cloth and attacks stay continuous at every clock boundary for all six boss beats', () => {
  for (const enemy of enemies) for (const phase of [1, 2]) for (const attackIndex of [0, 1, 2, 3, 4, 5]) {
    const e = { ...enemy, phase, attackIndex }; const spec = combat.enemyAttack(e);
    const gait = motion.createEnemyGait(e, 0); const time = 2.5;
    const visual = (action, timer) => motion.sampleEnemyPose({ ...e, action, timer }, time, gait);
    const cloth = (action, timer) => motion.sampleEnemyCloth({ ...e, action, timer }, time);
    for (const sampler of [visual, cloth]) {
      assert.ok(difference(sampler('idle', 0), sampler('windup', spec.windup)) < 1e-8, `${e.id} idle/raise`);
      assert.ok(difference(sampler('windup', 0), sampler('attack', combat.ENEMY_STRIKE_TIME)) < 1e-8, `${e.id} raise/strike`);
      assert.ok(difference(sampler('attack', 0), sampler('recover', spec.recovery)) < 1e-8, `${e.id} strike/recover`);
      assert.ok(difference(sampler('recover', 0), sampler('chase', 0)) < 1e-8, `${e.id} recover/chase`);
    }
    for (const [action, duration] of [['windup', spec.windup], ['attack', combat.ENEMY_STRIKE_TIME], ['recover', spec.recovery]]) {
      let previous = visual(action, duration);
      for (let elapsed = 0.002; elapsed < duration; elapsed += 0.002) {
        const now = visual(action, duration - elapsed);
        assert.ok(Object.values(now).every(Number.isFinite));
        assert.ok(difference(now, previous) < 0.14, `${e.id} phase ${phase} beat ${attackIndex} ${action} ${elapsed}`);
        previous = now;
      }
    }
  }
});

test('stride follows travelled distance with stable results at 30, 60 and 120 render samples', () => {
  const run = (kind, hz, direction) => {
    const e = actor(kind); const gait = motion.createEnemyGait(e, 0);
    for (let tick = 1; tick <= hz * 2; tick++) {
      const time = tick / hz; e.x = direction[0] * time * 2.4; e.z = direction[1] * time * 2.4;
      motion.updateEnemyGait(gait, e, time);
    }
    return sample(e, 2, gait);
  };
  for (const kind of ['prowler', 'guard', 'duelist', 'lancer', 'boss', 'captain', 'warden']) for (const direction of [[0, 1], [0, -1], [1, 0]]) {
    const slow = run(kind, 30, direction); const fast = run(kind, 120, direction);
    assert.ok(difference(slow, fast) < 1e-8, `${kind} ${direction}: render rate altered gait`);
    assert.ok(difference(run(kind, 60, direction), fast) < 1e-8);
  }
});

test('blocked chase does not invent steps; attack lunges do not turn into a walking cycle', () => {
  const e = actor('captain'); const gait = motion.createEnemyGait(e, 0);
  for (let tick = 1; tick <= 120; tick++) motion.updateEnemyGait(gait, e, tick / 60);
  assert.equal(gait.phase, 0); assert.equal(gait.speed, 0);
  e.action = 'attack'; e.timer = combat.ENEMY_STRIKE_TIME;
  for (let tick = 121; tick <= 140; tick++) { e.z += 0.015; motion.updateEnemyGait(gait, e, tick / 60); }
  assert.equal(gait.phase, 0); assert.equal(gait.speed, 0);
});

test('pause and hitstop freeze observers and cloth while teleports reset without a sprint flash', () => {
  const e = actor('warden'); const gait = motion.createEnemyGait(e, 0);
  e.z += 0.04; motion.updateEnemyGait(gait, e, 1 / 60);
  const before = structuredClone(gait); const pose = sample(e, 1 / 60, gait); const cloth = motion.sampleEnemyCloth(e, 1 / 60);
  for (let frame = 0; frame < 100; frame++) {
    motion.updateEnemyGait(gait, e, 1 / 60);
    assert.deepEqual(gait, before); assert.deepEqual(sample(e, 1 / 60, gait), pose); assert.deepEqual(motion.sampleEnemyCloth(e, 1 / 60), cloth);
  }
  e.x += 30; motion.updateEnemyGait(gait, e, 2 / 60);
  assert.equal(gait.speed, 0); assert.equal(gait.phase, 0); assert.equal(gait.x, e.x);
});

test('the pure visual layer does not mutate enemy clocks, attack specs or serialized combat state', () => {
  const s = engine.createGame(); const before = engine.saveGame(s);
  for (const enemy of s.enemies) {
    const spec = combat.enemyAttack(enemy); const specBefore = structuredClone(spec); const gait = motion.createEnemyGait(enemy, s.time);
    for (let frame = 0; frame < 10; frame++) { motion.updateEnemyGait(gait, enemy, s.time); sample(enemy, s.time, gait); motion.sampleEnemyCloth(enemy, s.time); }
    assert.deepEqual(combat.enemyAttack(enemy), specBefore);
  }
  assert.equal(engine.saveGame(s), before);
});
