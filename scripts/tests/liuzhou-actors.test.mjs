import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';

const a = await loadTypescriptModule('src/components/liuzhou/actorMotion.ts');
const s = await loadTypescriptModule('src/components/liuzhou/simulation.ts');
const neutral = { forward: 0, turn: 0, sprint: false, brake: false, jump: false };
const near = (x, y, tolerance = 1e-5) => assert.ok(Math.abs(x - y) < tolerance, `${x} != ${y}`);

test('animation advances by actual travel; stationary obstacles do not create walking cycles', () => {
  const g = s.createGame(); g.phase = 'playing';
  let travelled = 0;
  for (let n = 0; n < 30; n++) {
    const before = { ...g.player };
    s.step(g, { ...neutral, forward: 1 });
    travelled += Math.hypot(g.player.x - before.x, g.player.z - before.z);
  }
  near(g.locomotion.distance, travelled);
  const phase = g.locomotion.phase;
  a.advanceLocomotion(g.locomotion, 0, 1 / 60, g.time);
  assert.equal(g.locomotion.phase, phase);
  assert.equal(a.actorPose({ ...g.locomotion, time: g.time }).mode, 'idle');
  const full = a.createLocomotion(), half = a.createLocomotion();
  for (let n = 0; n < 60; n++) a.advanceLocomotion(full, 4 / 60, 1 / 60, n / 60);
  for (let n = 0; n < 120; n++) a.advanceLocomotion(half, 4 / 120, 1 / 120, n / 120);
  near(full.phase, half.phase);
});

test('walk and run joints keep the support foot on the ground throughout a full stride', () => {
  for (const speed of [0, 0.5, 2, 4.4, 8.2]) for (let n = 0; n < 120; n++) {
    const p = a.actorPose({ time: 1, phase: n * Math.PI / 60, speed });
    const soles = [p.leftLeg, p.rightLeg].map(j => a.HIP + p.bob + a.limbEnd(j.upper, j.lower, a.LEG).y - 0.1);
    assert.ok(Math.min(...soles) >= -0.0002, `${speed}: under ground ${soles}`);
    assert.ok(Math.min(...soles) < 0.035, `${speed}: floating support ${soles}`);
    assert.ok(Math.max(...soles) < 0.3);
  }
});

test('riding ankles follow both physical pedals and wrists reach the handlebar', () => {
  for (let n = 0; n < 360; n++) {
    const phase = n * Math.PI / 180;
    const p = a.actorPose({ time: 0, phase, speed: 5, riding: true });
    for (const [leg, offset] of [[p.leftLeg, 0], [p.rightLeg, Math.PI]]) {
      const end = a.limbEnd(leg.upper, leg.lower, a.LEG), pedal = a.pedalPoint(phase + offset);
      near(a.RIDER_Y + a.HIP + end.y - 0.1, pedal.y);
      near(a.RIDER_Z + end.z, pedal.z);
    }
    const hand = a.limbEnd(p.leftArm.upper, p.leftArm.lower, a.ARM);
    const y = 0.5 + hand.y, z = hand.z;
    near(a.RIDER_Y + a.HIP + y * Math.cos(p.lean) - z * Math.sin(p.lean), 1.4);
    near(a.RIDER_Z + y * Math.sin(p.lean) + z * Math.cos(p.lean), 0.46);
  }
});

test('real airborne contacts drive jump, fall and brief landing compression', () => {
  const m = a.createLocomotion();
  a.advanceLocomotion(m, 0.1, 1 / 60, 1, false, 5);
  assert.equal(a.actorPose({ ...m, time: 1 }).mode, 'rise');
  a.advanceLocomotion(m, 0.1, 1 / 60, 1.3, false, -4);
  assert.equal(a.actorPose({ ...m, time: 1.3 }).mode, 'fall');
  a.advanceLocomotion(m, 0, 1 / 60, 1.5, true, 0);
  const landed = a.actorPose({ ...m, time: 1.5 });
  assert.equal(landed.mode, 'land'); assert.ok(landed.bob < -0.08);
  assert.equal(a.actorPose({ ...m, time: 1.8 }).mode, 'idle');
  const step = a.createLocomotion();
  a.advanceLocomotion(step, 0.01, 1 / 60, 2, false, -0.3);
  a.advanceLocomotion(step, 0.01, 1 / 60, 2.02, true, 0);
  assert.equal(step.landedAt, -10, 'small contact changes on stairs do not trigger jump landings');
});

test('pause, map and dialogue stop locomotion and keep all procedural poses frozen', () => {
  for (const phase of ['paused', 'playing']) {
    const g = s.createGame(); g.phase = phase;
    if (phase === 'playing') g.dialogue = { name: '街坊', lines: ['你好'], index: 0, advance: false };
    const before = structuredClone(g.locomotion), time = g.time;
    for (let n = 0; n < 60; n++) s.step(g, { ...neutral, forward: 1, jump: true });
    assert.deepEqual(g.locomotion, before); assert.equal(g.time, time);
    assert.deepEqual(a.actorPose({ ...g.locomotion, time: g.time }), a.actorPose({ ...before, time }));
  }
});

test('citizen activities and watching retain their specific gestures', () => {
  for (const action of ['photo', 'stretch', 'shop']) {
    const p = a.actorPose({ time: 2, phase: 0, speed: 0, action });
    assert.equal(p.mode, action);
    assert.ok(Math.abs(p.rightArm.upper) + Math.abs(p.rightArm.side) > 0.2);
  }
  assert.equal(a.actorPose({ time: 2, phase: 0, speed: 0, watching: true }).mode, 'watch');
});
