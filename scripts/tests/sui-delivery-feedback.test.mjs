import test from 'node:test';
import assert from 'node:assert/strict';
import model from '../lib/sui-delivery-model.cjs';
import pilot from '../lib/sui-delivery-pilot.cjs';
import campaignPilot from '../lib/sui-delivery-campaign-pilot.cjs';

function playing(id = model.ORDER) {
  const save = model.freshDeliverySave();
  save.delivered = model.LEVELS.slice(0, model.LEVELS.findIndex(v => v.id === id)).map(v => v.id);
  const s = model.createDelivery(save); model.startDelivery(s, 'story', undefined, id); return s;
}
function tick(s, count = 1) { for (let i = 0; i < count; i++) model.stepDelivery(s, model.deliveryInput()); }

test('normal-input first delivery signals distinct contacts, one departure and one arrival', () => {
  const run = pilot.makePilot().journey(); const s = playing(); const seen = [];
  for (const input of run.tape) {
    model.stepDelivery(s, input); seen.push(...s.events); s.events.length = 0;
  }
  for (const kind of ['dough', 'stomp', 'land-stone', 'land-wood', 'land-cloth', 'land-metal', 'cloth-tight', 'spring', 'cart-start', 'cart-stop', 'clear']) assert.ok(seen.some(e => e.kind === kind), kind);
  for (const kind of ['cart-start', 'cart-stop', 'clear']) assert.equal(seen.filter(e => e.kind === kind).length, 1, kind);
  assert.equal(seen.filter(e => e.kind === 'dough').length, 2);
  const dough = seen.find(e => e.kind === 'dough');
  assert.ok(dough.x > 800 && dough.x < 1000 && dough.y > 500, 'contact is at the dough, not at a fixed HUD point');
  assert.deepEqual(s.player, run.s.player); assert.deepEqual(s.save, run.s.save);
  assert.equal(s.deaths, 0); assert.equal(s.bounces, 2);
});

test('landing sound follows the actual collision surface and does not retrigger while standing', () => {
  for (const [id, kind] of [['street-west', 'land-stone'], ['door-high', 'land-wood'], ['sign-canopy', 'land-cloth'], ['food-cart', 'land-metal']]) {
    const s = playing(); const surface = model.deliverySurfaces(s).find(v => v.id === id);
    Object.assign(s.player, { x: surface.x + 30, y: surface.y - 48, vy: 250, grounded: false, coyote: 0 });
    tick(s, 4);
    const contacts = s.events.filter(e => e.kind.startsWith('land-'));
    assert.equal(contacts.length, 1, id); assert.equal(contacts[0].kind, kind, id);
    assert.ok(Math.abs(contacts[0].y - surface.y) < 3, id);
    s.events.length = 0; tick(s, 16);
    assert.ok(!s.events.some(e => e.kind.startsWith('land-')), id);
  }
});

test('feedback is transient, bounded, paused with the game and expires after handoff', () => {
  const s = playing(); const save = JSON.stringify(s.save);
  for (let i = 0; i < 300; i++) model.feedback(s, 'metal', i, 500);
  assert.equal(s.events.length, 48); assert.equal(s.feedback.length, 32);
  s.phase = 'paused'; const before = structuredClone(s.feedback); tick(s, 120);
  assert.deepEqual(s.feedback, before);
  s.phase = 'delivered'; const player = structuredClone(s.player); tick(s, 100);
  assert.equal(s.feedback.length, 0); assert.equal(s.events.length, 0);
  assert.deepEqual(s.player, player); assert.equal(JSON.stringify(s.save), save);
  s.phase = 'playing'; model.feedback(s, 'reflect'); model.retryDelivery(s);
  assert.deepEqual(s.feedback, []); assert.deepEqual(s.events, []);
});

test('rail-cart departure and docking each emit once, with separate cues for the second journey', () => {
  const s = playing('freight-lunch'); const c = s.cart; const config = model.deliveryLevel(s).cart;
  for (let stop = 0; stop < config.rail.length - 1; stop++) {
    const node = config.rail[stop]; if (node.gate) s.switches.push(node.gate);
    Object.assign(s.player, { x: c.x + 40, y: c.y - 44, grounded: true }); s.events = [];
    model.advanceCart(s, 1 / 120, () => {});
    assert.equal(s.events.filter(e => e.kind === 'cart-start').length, 1);
    for (let i = 0; i < 4000 && c.station === stop; i++) model.advanceCart(s, 1 / 120, () => {});
    assert.equal(c.station, stop + 1); assert.equal(s.events.filter(e => e.kind === 'cart-start').length, 1);
    assert.equal(s.events.filter(e => e.kind === 'cart-stop').length, 1);
  }
});

test('canopy, lift and crown warnings occur at transition, not on every frame', () => {
  const s = playing('rain-relay'); const canopy = model.deliveryLevel(s).rain.canopies.find(v => v.cycle);
  s.switches.push(canopy.hook); s.clock = canopy.cycle - 2.2 - 0.01;
  tick(s, 12); assert.equal(s.events.filter(e => e.kind === 'warning').length, 1);
  const t = playing('scenery-lifts'); const lift = model.deliveryLevel(t).theater.lifts[0]; t.switches.push(lift.hook); t.theater.time = 6.99;
  tick(t, 12); assert.equal(t.events.filter(e => e.kind === 'warning').length, 1);
  const b = playing('banquet-machine'); b.switches.push('banquet-heat', 'banquet-crank'); b.theater.time = 1.99;
  tick(b, 12); assert.equal(b.events.filter(e => e.kind === 'warning').length, 1);
});

test('all twelve normal-input routes still deliver with full health and contact feedback', () => {
  const runs = campaignPilot.campaign(); const seen = new Set();
  for (const run of runs) {
    assert.equal(run.s.phase, 'delivered'); assert.equal(run.s.deaths, 0); assert.equal(run.s.player.health, 3);
    for (const mark of run.milestones) for (const cue of mark.state.feedback) seen.add(cue.kind);
  }
  for (const kind of ['reflect', 'mechanism', 'water', 'rope', 'dash']) assert.ok(seen.has(kind), kind);
});

class Param {
  value = 0;
  setValueAtTime(v) { this.value = v; }
  linearRampToValueAtTime(v) { this.value = v; }
  exponentialRampToValueAtTime(v) { this.value = v; }
}
class Node {
  gain = new Param(); frequency = new Param(); disconnected = false; stopped = false; onended = null;
  connect() {}
  disconnect() { this.disconnected = true; }
  start() {}
  stop() { this.stopped = true; }
}
class AudioContextStub {
  static instances = [];
  currentTime = 0; sampleRate = 48000; state = 'suspended'; destination = {}; nodes = [];
  constructor() { AudioContextStub.instances.push(this); }
  createGain() { const n = new Node(); this.nodes.push(n); return n; }
  createOscillator() { const n = new Node(); this.nodes.push(n); return n; }
  createBufferSource() { return this.createOscillator(); }
  createBuffer(c, frames) { return { getChannelData: () => new Float32Array(frames) }; }
  resume() { this.state = 'running'; return Promise.resolve(); }
  close() { this.state = 'closed'; return Promise.resolve(); }
}
const cue = kind => ({ kind, x: 100, y: 100, strength: 1, time: 0, age: 0 });
const camera = { x: 0, y: 0 }; const viewport = { w: 855, h: 540 };

test('audio waits for a gesture, frees ended nodes, bounds polyphony and silences immediately', () => {
  const previous = globalThis.AudioContext; globalThis.AudioContext = AudioContextStub;
  try {
    const audio = new model.DeliveryAudio(); audio.setPhase('playing'); audio.effect(cue('metal'), camera, viewport);
    assert.equal(audio.diagnostics().unlocked, false);
    audio.enabled = false; audio.unlock(); assert.equal(audio.diagnostics().unlocked, false);
    audio.enabled = true; audio.unlock(); const ctx = AudioContextStub.instances.at(-1);
    audio.effect(cue('metal'), camera, viewport); assert.equal(audio.diagnostics().active, 2);
    for (const n of ctx.nodes) n.onended?.(); assert.equal(audio.diagnostics().active, 0);
    for (let i = 0; i < 50; i++) { ctx.currentTime += 0.1; audio.effect(cue('clear'), camera, viewport); }
    assert.equal(audio.diagnostics().peak, 24); assert.equal(audio.diagnostics().active, 24);
    audio.setPhase('paused'); assert.equal(audio.diagnostics().active, 0);
    assert.ok(ctx.nodes.slice(1).every(n => n.disconnected));
    const created = ctx.nodes.length; audio.effect(cue('metal'), camera, viewport); audio.update(true, 'rain'); assert.equal(ctx.nodes.length, created);
    audio.setPhase('playing'); audio.effect(cue('dash'), camera, viewport); audio.enabled = false;
    assert.equal(audio.diagnostics().active, 0); const muted = ctx.nodes.length;
    audio.effect(cue('clear'), camera, viewport); assert.equal(ctx.nodes.length, muted);
    audio.enabled = true; audio.update(true, 'street'); assert.ok(audio.diagnostics().music > 0);
    audio.setPhase('delivered'); assert.equal(audio.diagnostics().music, 0);
    audio.effect(cue('clear'), camera, viewport); assert.ok(audio.diagnostics().active > 0, 'handoff chime can finish after gameplay stops');
    audio.destroy(); assert.equal(audio.diagnostics().active, 0); assert.equal(ctx.state, 'closed'); assert.ok(ctx.nodes.every(n => n.disconnected));
  } finally { globalThis.AudioContext = previous; }
});

test('distant machines and repeated same-frame effects cannot flood the sound mix', () => {
  const previous = globalThis.AudioContext; globalThis.AudioContext = AudioContextStub;
  try {
    const audio = new model.DeliveryAudio(); audio.setPhase('playing'); audio.unlock();
    audio.effect({ ...cue('warning'), x: 2000 }, camera, viewport); assert.equal(audio.diagnostics().played, 0);
    for (let i = 0; i < 12; i++) audio.effect(cue('metal'), camera, viewport);
    assert.equal(audio.diagnostics().played, 1); assert.equal(audio.diagnostics().active, 2);
    audio.destroy();
  } finally { globalThis.AudioContext = previous; }
});
