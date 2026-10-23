const assert = require('node:assert/strict');
const model = require('./sui-delivery-model.cjs');
const { makePilot } = require('./sui-delivery-pilot.cjs');

function animationExercise() {
  const p = makePilot();
  const marks = [];
  const gait = { left: new Set(), right: new Set() };
  function mark(name) { marks.push({ name, frame: p.tape.length, state: structuredClone(model.deliveryPublicState(p.s)) }); }
  function until(value, predicate, limit = 240) {
    for (let i = 0; i < limit; i++) { p.tick(value); if (predicate()) return; }
    assert.fail('normal-input animation exercise timed out');
  }
  mark('idle');
  until({ right: true }, () => p.s.player.pose === 'start'); mark('start');
  until({ right: true }, () => {
    const a = model.deliveryPlayerFrame(p.s);
    if (a.state === 'run') gait.right.add(a.frame);
    return gait.right.size === 4;
  }); mark('run-right');
  p.tick(); mark('brake');
  p.tick({}, 60);
  until({ left: true }, () => {
    const a = model.deliveryPlayerFrame(p.s);
    if (a.state === 'run') gait.left.add(a.frame);
    return gait.left.size === 4;
  }); mark('run-left');
  p.tick({}, 60);
  for (const wanted of ['takeoff', 'rise', 'fall', 'land']) {
    until({ jump: wanted === 'takeoff' || wanted === 'rise' }, () => model.deliveryPlayerFrame(p.s).state === wanted);
    mark(wanted);
  }
  p.tick({}, 40); p.tick({ right: true }, 2); p.tick({}, 20);
  for (const wanted of ['tray-windup', 'tray-contact', 'tray-extend', 'tray-recover']) {
    until({ attack: true }, () => model.deliveryPlayerFrame(p.s).state === wanted);
    mark(wanted);
  }
  p.tick({}, 90); p.tick({ left: true }, 2); p.tick({}, 20);
  until({ attack: true }, () => model.deliveryPlayerFrame(p.s).state === 'tray-contact'); mark('tray-left');
  return { tape: p.tape, marks, gait: Object.fromEntries(Object.entries(gait).map(([key, frames]) => [key, [...frames].sort()])) };
}

function hurtExercise() {
  const p = makePilot();
  p.tick({ interact: true }); p.tick({}, 5); p.go(365); p.go(735, 240, true, 65); p.go(800, 120);
  for (let i = 0; i < 200 && p.s.player.health === 3; i++) p.tick({ right: true });
  assert.equal(p.s.player.health, 2); assert.equal(model.deliveryPlayerFrame(p.s).state, 'hurt');
  const mark = { name: 'hurt', frame: p.tape.length, state: structuredClone(model.deliveryPublicState(p.s)) };
  p.tick({}, 35);
  assert.ok(p.s.player.invincible > 0); assert.notEqual(model.deliveryPlayerFrame(p.s).state, 'hurt');
  return { tape: p.tape, marks: [mark, { name: 'protected-after-hit', frame: p.tape.length, state: structuredClone(model.deliveryPublicState(p.s)) }] };
}
module.exports = { animationExercise, hurtExercise };
