import assert from 'node:assert/strict';
import test from 'node:test';
import { engine, world, place, riverCompleted } from './helpers/night-rain-sky.mjs';

const step = (s, ms, input = {}) => engine.stepGame(s, ms, { x: 0, z: 0, ...input });
const rampState = (z = -607) => {
  const s = riverCompleted(); s.skyGates = ['sky-entry'];
  place(s, { x: -146, y: world.supportAt(-146, z, 30), z });
  return s;
};

test('sprint jump uphill lands on the tower ramp instead of falling through', () => {
  const s = rampState(); const hp = s.player.hp;
  step(s, 200, { z: -1, dashHeld: true });
  step(s, 200, { z: -1, dashHeld: true });
  step(s, 10, { z: -1, dashHeld: true, jump: true });
  assert.ok(s.player.jumpVelocity > 0);
  let airborne = false;
  for (let i = 0; i < 150; i++) {
    step(s, 20, { z: -1, dashHeld: true });
    const p = s.player; const floor = world.supportAt(p.x, p.z, 30);
    airborne ||= engine.isAirborne(p);
    assert.ok(p.y + p.jumpHeight >= floor - .002, `feet ${p.y + p.jumpHeight}, ramp ${floor}, z ${p.z}`);
    assert.equal(s.mode, 'playing'); assert.equal(p.hp, hp);
  }
  assert.ok(airborne); assert.equal(s.player.jumpHeight, 0);
  assert.ok(s.player.z < -619);
});

test('running jumps land uphill, downhill, diagonally and across both tower ramp seams', () => {
  for (const z of [-599.4, -600.5, -607, -616, -623.4, -624.6]) {
    for (const direction of [-1, 1]) for (const frame of [16, 40, 80]) {
      const s = rampState(z); const hp = s.player.hp;
      const input = { x: .15, z: direction, sprint: true };
      step(s, 150, input);
      step(s, frame, { ...input, jump: true });
      let landed = false;
      for (let i = 0; i < Math.ceil(1300 / frame); i++) {
        step(s, frame, input);
        const p = s.player; const floor = world.supportAt(p.x, p.z, 30);
        assert.ok(p.y + p.jumpHeight >= floor - .002, JSON.stringify({ z, direction, frame, feet: p.y + p.jumpHeight, floor }));
        assert.equal(s.mode, 'playing');
        assert.ok(p.hp >= hp - (direction > 0 ? 14 : 0), JSON.stringify({ z, direction, frame, hp: p.hp }));
        landed ||= !engine.isAirborne(p);
      }
      assert.ok(landed, JSON.stringify({ z, direction, frame }));
    }
  }
});

test('ramp contact catches a relative crossing even when feet are still rising', () => {
  const z = -610; const y = world.supportAt(-146, z, 30);
  assert.ok(Math.abs(world.rampLandingAt({ x: -146, y: y + .005, z }, { x: -146, y: y + .01, z: z - .04 }) - world.supportAt(-146, z - .04, 30)) < 1e-9);
  assert.equal(world.rampLandingAt({ x: -146, y: y + .1, z }, { x: -146, y: y + .11, z: z - .04 }), null);
});

test('being below a ramp or its side never snaps the player onto it; real falls stay lethal', () => {
  assert.equal(world.rampLandingAt({ x: -146, y: 15, z: -610 }, { x: -146, y: 14.9, z: -610.04 }), null);
  assert.equal(world.rampLandingAt({ x: -150.02, y: 18, z: -610 }, { x: -149.98, y: 17.99, z: -610 }), null);
  const s = rampState(-610); s.player.jumpHeight = -2; s.player.jumpVelocity = -1;
  step(s, 3000); assert.equal(s.mode, 'dead');
  const drop = rampState(); place(drop, { x: -146, y: 26, z: -589 });
  drop.player.jumpVelocity = -1;
  step(drop, 2000); assert.equal(drop.mode, 'dead');
});
