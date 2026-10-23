import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import model from '../lib/sui-delivery-model.cjs';
import exercises from '../lib/sui-delivery-animation-pilot.cjs';
import pilot from '../lib/sui-delivery-pilot.cjs';

function playing() { const s = model.createDelivery(); model.startDelivery(s); return s; }
function tick(s, input = {}, count = 1) { for (let i = 0; i < count; i++) model.stepDelivery(s, { ...model.deliveryInput(), ...input }); }

test('normal controls show the full grounded gait in both directions, braking and four air phases', () => {
  const run = exercises.animationExercise();
  assert.deepEqual(run.gait, { left: [0, 1, 2, 3], right: [0, 1, 2, 3] });
  for (const name of ['idle', 'start', 'brake', 'takeoff', 'rise', 'fall', 'land']) {
    const mark = run.marks.find(v => v.name === name);
    assert.equal(mark.state.playerAnimation.state, name);
    assert.equal(mark.state.player.health, 3); assert.equal(mark.state.deaths, 0);
  }
  assert.equal(run.marks.find(v => v.name === 'run-left').state.player.facing, -1);
});

test('four attack drawings cover the real startup/contact/recovery windows for both tray widths', () => {
  for (const tray of ['quick', 'wide']) {
    const s = playing(); s.save.tray = tray;
    const phases = new Set(); let attacks = 0;
    for (let i = 0; i < 120; i++) {
      tick(s, { attack: true });
      const before = JSON.stringify(s); const a = model.deliveryPlayerFrame(s); const item = model.deliveryTrayPose(s);
      assert.equal(JSON.stringify(s), before, 'presentation selection must not mutate simulation');
      if (s.player.attack > 0) {
        phases.add(a.state);
        assert.equal(item.active, s.player.attack >= 0.1 && s.player.attack <= 0.28);
        assert.equal(item.active, ['tray-contact', 'tray-extend'].includes(a.state));
      }
      attacks += s.events.filter(v => v.kind === 'swing' && v.age === 0).length;
    }
    assert.deepEqual([...phases], ['tray-windup', 'tray-contact', 'tray-extend', 'tray-recover']);
    assert.equal(attacks, 1, 'holding attack cannot loop the new animation or bypass recovery');
  }
});

test('checkpoint shield never depicts a hit, actual damage has a short recoil within its longer shield', () => {
  const s = playing(); model.retryDelivery(s); tick(s);
  assert.ok(s.player.invincible > 1.35); assert.notEqual(s.player.pose, 'hurt');
  assert.equal(model.deliveryPlayerFrame(s).state, 'idle');
  const run = exercises.hurtExercise();
  assert.equal(run.marks[0].state.playerAnimation.state, 'hurt');
  assert.notEqual(run.marks[1].state.playerAnimation.state, 'hurt');
  assert.equal(run.marks[1].state.player.health, 2);
  s.save.settings.assist = true; model.feedback(s, 'hurt'); s.player.invincible = 2.8;
  tick(s, {}, 40); assert.ok(s.player.invincible > 2); assert.notEqual(s.player.pose, 'hurt');
});

test('pausing freezes the exact frame, and reduced motion preserves the same input trajectory and meaningful poses', () => {
  const a = playing(); const b = playing(); b.save.settings.reducedMotion = true;
  for (const input of exercises.animationExercise().tape) {
    tick(a, input); tick(b, input);
    assert.deepEqual(a.player, b.player); assert.deepEqual(model.deliveryPlayerFrame(a), model.deliveryPlayerFrame(b));
  }
  const frame = model.deliveryPlayerFrame(a); const player = structuredClone(a.player); const clock = a.clock;
  a.phase = 'paused'; tick(a, { right: true, jump: true, attack: true }, 240);
  assert.deepEqual(model.deliveryPlayerFrame(a), frame); assert.deepEqual(a.player, player); assert.equal(a.clock, clock);
});

test('handoff and the actual seated ending take priority over stale combat states', () => {
  const s = playing(); s.player.attack = 0.3; model.feedback(s, 'hurt'); s.phase = 'delivered';
  assert.equal(model.deliveryPlayerFrame(s).state, 'deliver');
  s.theater.seated = true;
  const a = model.deliveryPlayerFrame(s); assert.equal(a.texture, 'delivery-reaction'); assert.equal(a.state, 'sit');
});

test('a normal delivery turns the offering pose toward the actual customer', () => {
  const run = pilot.makePilot().journey();
  const customer = model.deliveryLevel(run.s).destination.x + 40;
  assert.equal(run.s.player.facing, customer >= run.s.player.x + 13 ? 1 : -1);
  assert.equal(model.deliveryPlayerFrame(run.s).state, 'deliver');
});

test('shipped transparent atlases retain all distinct frames, shared head scale and consistent foot anchors', () => {
  const manifest = JSON.parse(fs.readFileSync('public/games/sui-spring/animations/manifest-v1.json', 'utf8'));
  const head = new Set();
  for (const [group, item] of Object.entries(manifest)) {
    const data = fs.readFileSync(`public/games/sui-spring/animations/${group}-v1.png`);
    assert.equal(data.readUInt32BE(16), item.frameSize * 4); assert.equal(data.readUInt32BE(20), item.frameSize);
    assert.equal(data[25], 6, 'PNG must contain real alpha');
    assert.equal(crypto.createHash('sha256').update(data).digest('hex'), item.sha256);
    head.add(Math.round(item.headSourceWidth * item.scale * 100));
    assert.equal(new Set([1, 2, 3, 4].map(i => crypto.createHash('sha256').update(fs.readFileSync(`public/games/sui-spring/animations/${group}-v1/0${i}.png`)).digest('hex'))).size, 4);
    for (const [left, top, right, bottom] of item.bounds) {
      assert.ok(left >= 0 && top >= 0 && right <= 96); assert.equal(bottom, 96);
    }
  }
  assert.equal(head.size, 1);
});
