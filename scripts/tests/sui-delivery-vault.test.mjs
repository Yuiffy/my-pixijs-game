import test from 'node:test';
import assert from 'node:assert/strict';
import model from '../lib/sui-delivery-model.cjs';
import vaultPilot from '../lib/sui-delivery-vault-pilot.cjs';
import pilot from '../lib/sui-delivery-pilot.cjs';

function tick(s, value = {}, frames = 1) {
  for (let i = 0; i < frames; i++) model.stepDelivery(s, { ...model.deliveryInput(), ...value });
}
function playing() { const s = model.createDelivery(); model.startDelivery(s); return s; }

test('a first-time courier can jump, scoop the dough and land on the sign roof through ordinary inputs', () => {
  for (const approach of [780, 800, 820]) {
    for (const delay of [0, 3, 6, 9, 12]) {
      const p = vaultPilot.makeVaultPilot({ approach, delay, complete: false });
      const contact = p.milestones.find(m => m.name === 'vault-contact').state;
      const roof = p.milestones.find(m => m.name === 'vault-rooftop').state;
      assert.equal(contact.vaults, 1, `approach ${approach}, jump-to-tray ${delay} frames`);
      assert.ok(contact.player.vy < -600);
      assert.equal(roof.player.grounded, true); assert.equal(roof.player.y + 44, 400);
      assert.ok(p.s.save.found.includes('old-sign'));
      assert.equal(p.s.player.health, 3); assert.equal(p.s.deaths, 0);
      assert.ok(roof.time < 8, 'the first useful high route arrives early');
    }
  }
});

test('the new high route continues through the whole delivery without skipping its destination or side quest', () => {
  const p = vaultPilot.makeVaultPilot();
  assert.equal(p.s.phase, 'delivered'); assert.equal(p.s.deaths, 0); assert.equal(p.s.player.health, 3);
  assert.equal(p.s.vaults, 1); assert.equal(p.s.save.kindness, true);
  assert.deepEqual(p.s.save.delivered, [model.ORDER]);
  assert.ok(p.s.save.found.includes('old-sign')); assert.equal(p.s.cart.docked, true);
});

test('the first roof also works at ordinary walking speed without holding run', () => {
  for (const approach of [780, 800, 820]) {
    for (const delay of [0, 3, 6, 9, 12]) {
      const p = vaultPilot.makeVaultPilot({ approach, delay, complete: false, walkRoof: true });
      const roof = p.milestones.find(m => m.name === 'vault-rooftop');
      const from = p.milestones.find(m => m.name === 'vault-approach').frame;
      assert.ok(p.tape.slice(from, roof.frame).every(input => !input.run));
      assert.equal(roof.state.player.y + 44, 400); assert.equal(roof.state.player.grounded, true);
      assert.equal(p.s.vaults, 1); assert.equal(p.s.deaths, 0); assert.equal(p.s.player.health, 3);
    }
  }
});

test('a missed tray swing never grants an extra jump and holding attack never repeats a contact', () => {
  const s = playing(); tick(s, { jump: true, attack: true }, 30);
  assert.equal(s.vaults, 0); assert.equal(s.events.some(e => e.kind === 'vault'), false);
  const p = vaultPilot.makeVaultPilot({ complete: false });
  p.tick({ jump: true, attack: true }, 90);
  assert.equal(p.s.vaults, 1);
  assert.equal(p.s.lifts, 0); assert.equal(p.s.bounces, 0);
});

test('missing the scoop leaves a nearby safe retry with the meal and a fresh target', () => {
  const p = vaultPilot.makeVaultPilot({ delay: 15, complete: false });
  assert.equal(p.s.vaults, 0); assert.equal(p.s.deaths, 0); assert.equal(p.s.player.health, 3);
  assert.equal(p.s.checkpoint, 'courtyard'); assert.equal(p.s.carrying, true);
  model.retryDelivery(p.s); assert.equal(p.s.player.x, 730);
  p.go(800, 120); p.tick({ right: true }, 3);
  p.tick({ right: true, run: true, jump: true, attack: true }, 16);
  p.go(1100, 190, true, 190);
  assert.equal(p.s.vaults, 1); assert.equal(p.s.player.y + 44, 400); assert.equal(p.s.player.grounded, true);
  assert.equal(p.s.player.health, 3); assert.equal(p.s.carrying, true);
});

test('a deliberate tap in the last 120ms of recovery starts once; an early tap and a held button do not repeat', () => {
  for (const wide of [false, true]) {
    const s = playing(); if (wide) s.save.tray = 'wide';
    tick(s, { attack: true }); tick(s, {}, wide ? 64 : 39);
    assert.ok(s.player.cooldown > 0 && s.player.cooldown < 0.12);
    tick(s, { attack: true }); assert.ok(s.player.attackBuffer > 0);
    tick(s, {}, 12); assert.ok(s.player.attack > 0.2);
    const cooldown = s.player.cooldown; tick(s, {}, 6); assert.ok(s.player.cooldown < cooldown);
    tick(s, { attack: true }, 100); assert.equal(s.player.attack, 0, 'a long hold cannot auto-repeat');
  }
  const s = playing(); tick(s, { attack: true }); tick(s, {}, 5); tick(s, { attack: true });
  tick(s, {}, 100); assert.equal(s.player.attack, 0, 'a tap far before recovery is ignored');
});

test('retry clears queued attacks and preserves the same save; pausing keeps the input window frozen', () => {
  const s = playing(); tick(s, { attack: true }); tick(s, {}, 40); tick(s, { attack: true });
  assert.ok(s.player.attackBuffer > 0); s.phase = 'paused';
  const before = structuredClone(s); tick(s, {}, 120); assert.deepEqual(s, before);
  const save = structuredClone(s.save); model.retryDelivery(s);
  assert.equal(s.player.attackBuffer, 0); assert.equal(s.player.attack, 0); assert.deepEqual(s.save, save);
});

test('waiting for different dough hop phases still allows a healthy walking-speed scoop and roof landing', () => {
  for (const approach of [780, 800, 820]) {
    for (let wait = 0; wait < 240; wait += 12) {
      const p = pilot.makePilot();
      p.tick({ interact: true }); p.tick({}, 5); p.go(365); p.go(735, 240, true, 65); p.go(approach, 120);
      p.tick({}, wait); assert.equal(p.s.player.health, 3);
      p.tick({ right: true }, 3); p.tick({ right: true, jump: true }, 6);
      p.tick({ right: true, jump: true, attack: true }, 16);
      for (let i = 0; i < 180; i++) {
        p.tick({ right: true, jump: true });
        if (p.s.player.grounded && p.s.player.y === 356) break;
      }
      assert.equal(p.s.vaults, 1, `${approach}/${wait}: contact`);
      assert.equal(p.s.player.health, 3, `${approach}/${wait}: health`);
      assert.equal(p.s.player.y + 44, 400); assert.equal(p.s.player.grounded, true); assert.equal(p.s.deaths, 0);
    }
  }
});

test('takeoff grace does not shield standing contact, contact behind the player or an expired window', () => {
  for (const kind of ['standing', 'behind', 'expired']) {
    const s = playing(); const e = s.dough[0];
    s.player.x = e.x + (kind === 'behind' ? 10 : -20);
    s.player.doughGrace = kind === 'expired' ? 0 : 0.18;
    s.player.jumpHeld = kind !== 'standing';
    if (kind !== 'standing') { s.player.y = 620; s.player.vy = -100; s.player.grounded = false; s.player.coyote = 0; }
    tick(s, { jump: kind !== 'standing' });
    assert.equal(s.player.health, 2, kind);
  }
});
