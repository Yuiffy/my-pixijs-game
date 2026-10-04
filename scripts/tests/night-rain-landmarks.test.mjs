import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { loadTypescriptModule as load } from './helpers/load-typescript-module.mjs';

const engine = await load('src/components/nightRain/engine.ts');
const world = await load('src/components/nightRain/world.ts');
const ferry = await load('src/components/nightRain/ferries.ts');
const discovery = await load('src/components/nightRain/landmarkPresentation.ts');
const fixture = fs.readFileSync(new URL('./fixtures/night-rain-valley-v6.json', import.meta.url), 'utf8');
const fresh = () => { const s = engine.loadGame(fixture); assert.ok(s); return s; };
const place = (s, p) => Object.assign(s.player, p, { lastGround: { ...p }, fallPeak: p.y, jumpHeight: 0, jumpVelocity: 0, action: 'idle', attack: null });
const at = (s, id) => place(s, world.interactionPoint(world.LANDMARKS.find(l => l.id === id)));
const ready = s => {
  s.collected.push('keel-rubbing', 'names-register');
  s.haven.recruits.push('boatwright', 'scribe');
};

test('a locked boatyard node responds with the next requirement instead of silently disappearing', () => {
  const s = fresh();
  for (const id of ['boatyard-ferry', 'haven-ferry']) {
    at(s, id);
    const point = structuredClone(s.player);
    const money = s.rice, checkpoint = s.checkpoint, inventory = [...s.collected];
    engine.interact(s);
    assert.equal(s.nearbyId, id);
    assert.match(s.prompt, /航线未开通/);
    assert.match(s.message, /龙骨拓片/);
    assert.match(s.interpretation, /龙骨拓片/);
    assert.deepEqual(s.player, point);
    assert.equal(s.rice, money); assert.equal(s.checkpoint, checkpoint); assert.deepEqual(s.collected, inventory);
  }
  s.collected.push('keel-rubbing');
  at(s, 'boatyard-ferry'); engine.interact(s);
  assert.match(s.interpretation, /邀请/); assert.match(s.message, /邀请/);
  s.collected = s.collected.filter(id => id !== 'ferry-winch');
  engine.interact(s); assert.match(s.interpretation, /修好系缆/); assert.match(s.message, /系缆绞盘/);
  s.collected.push('ferry-winch');
  at(s, 'boatwright-field'); engine.interact(s);
  assert.ok(engine.chooseConversation(s, 'invite-boatwright'));
  at(s, 'boatyard-ferry'); engine.interact(s);
  assert.match(s.prompt, /等待庭灯/); assert.match(s.interpretation, /点亮庭中/); assert.match(s.message, /点亮归灯庭/);
  assert.equal(ferry.ferryStatus(s, 'boatyard-ferry').ready, false);
  at(s, 'haven-lamp'); engine.interact(s);
  at(s, 'boatyard-ferry'); engine.interact(s);
  assert.deepEqual({ x: s.player.x, y: s.player.y, z: s.player.z }, ferry.FERRY_ROUTES['boatyard-ferry'].position);
  assert.equal(ferry.ferryStatus(engine.loadGame(engine.saveGame(s)), 'haven-ferry').ready, true);
});

test('all six ferry routes preserve resources and enemies, and remain usable after loading at their landing', () => {
  const s = fresh(); ready(s); at(s, 'haven-lamp'); engine.interact(s);
  s.player.hp = 73; s.player.flasks = 1; s.player.stamina = 41; s.player.staminaDelay = 0.4;
  for (const [id, route] of Object.entries(ferry.FERRY_ROUTES)) {
    at(s, id);
    const before = { rice: s.rice, checkpoint: s.checkpoint, enemies: structuredClone(s.enemies) };
    engine.interact(s);
    assert.deepEqual({ x: s.player.x, y: s.player.y, z: s.player.z }, route.position);
    assert.equal(s.player.hp, 73); assert.equal(s.player.flasks, 1); assert.equal(s.player.stamina, 41); assert.equal(s.player.staminaDelay, 0.4);
    assert.equal(s.rice, before.rice); assert.equal(s.checkpoint, before.checkpoint); assert.deepEqual(s.enemies, before.enemies);
    assert.ok(world.canOccupy(s.player.x, s.player.z, s.player.y, s));
    assert.ok(engine.loadGame(engine.saveGame(s)));
  }
});

test('ordinary ferries only require their cable and combat still blocks both kinds of ferry', () => {
  const s = fresh(); assert.equal(ferry.ferryStatus(s, 'ferry-city').ready, true);
  s.collected = s.collected.filter(id => id !== 'ferry-winch');
  at(s, 'ferry-city'); const x = s.player.x; engine.interact(s);
  assert.equal(s.player.x, x); assert.match(s.message, /系缆/);
  assert.equal(ferry.ferryStatus(s, 'crypt-entrance'), null);
  ready(s); s.collected.push('ferry-winch'); at(s, 'haven-lamp'); engine.interact(s);
  for (const id of ['ferry-city', 'boatyard-ferry']) {
    at(s, id); const point = { x: s.player.x, y: s.player.y, z: s.player.z };
    const foe = s.enemies.find(e => e.id === 'boatyard-watch');
    Object.assign(foe, { x: point.x + 1, y: point.y, z: point.z, aggro: true });
    engine.interact(s); assert.match(s.message, /追兵/);
    assert.deepEqual({ x: s.player.x, y: s.player.y, z: s.player.z }, point);
  }
});

test('every existing note has an explicit model matching its role, including gates, clocks and books', () => {
  const notes = world.LANDMARKS.filter(l => l.kind === 'note');
  assert.deepEqual(notes.map(l => l.id).sort(), Object.keys(discovery.NOTE_PRESENTATIONS).sort());
  for (const l of notes) {
    const p = discovery.notePresentation(l);
    assert.ok(p);
    if (/^(转动|修复|敲响|叩响|放出|轻叩|倾听|呼唤)/.test(l.label)) {
      assert.equal(p.role, 'mechanism', l.id);
      assert.notEqual(p.model, 'paper', l.id);
      assert.ok(p.height >= 3, l.id);
    }
  }
  assert.equal(discovery.notePresentation(world.LANDMARKS.find(l => l.id === 'river-heart')).model, 'lantern');
  assert.equal(discovery.NOTE_PRESENTATIONS['keel-rubbing'].role, 'clue');
  assert.equal(discovery.NOTE_PRESENTATIONS['names-register'].model, 'book');
  assert.equal(discovery.NOTE_PRESENTATIONS['crypt-note'].model, 'stele');
  assert.equal(discovery.notePresentation(world.LANDMARKS.find(l => l.id === 'courtyard')), null);
});

test('a tall lamp marker never grants remote interaction; release changes the model state and does not complete twice', () => {
  const s = fresh(); s.valleyComplete = false; s.collected = s.collected.filter(id => id !== 'river-heart');
  const l = world.LANDMARKS.find(l => l.id === 'river-heart');
  place(s, { x: l.x, y: l.y, z: -510 });
  engine.interact(s); assert.equal(s.valleyComplete, false); assert.notEqual(s.nearbyId, l.id);
  assert.equal(discovery.nearbyDiscoveries(s, world.LANDMARKS).find(p => p.id === l.id).phase, 'ready');
  at(s, l.id); engine.interact(s);
  assert.equal(s.mode, 'interlude'); assert.equal(s.valleyComplete, true);
  assert.equal(discovery.discoveryPhase(s, l.id), 'complete');
  engine.continueExploring(s);
  const inventory = [...s.collected]; at(s, l.id); engine.interact(s);
  assert.match(s.prompt, /已归水/); assert.match(s.message, /已归水/);
  assert.equal(s.mode, 'playing'); assert.deepEqual(s.collected, inventory);
  assert.equal(discovery.discoveryPhase(engine.loadGame(engine.saveGame(s)), l.id), 'complete');
});

test('quest and ordinary texts remain readable after being read and across saves', () => {
  const s = fresh();
  for (const id of ['rooftop-note', 'haven-sign', 'river-note', 'names-register', 'keel-rubbing']) {
    at(s, id); engine.interact(s);
    assert.equal(s.nearbyId, id); assert.ok(s.collected.includes(id));
    const message = s.message, inventory = [...s.collected];
    const reloaded = engine.loadGame(engine.saveGame(s)); assert.ok(reloaded);
    engine.interact(reloaded);
    assert.equal(reloaded.nearbyId, id); assert.equal(reloaded.message, message); assert.deepEqual(reloaded.collected, inventory);
    assert.equal(discovery.discoveryPhase(reloaded, id), 'complete');
  }
});

test('the echo models track correct order and reset without stale completed markers', () => {
  const s = fresh();
  assert.equal(discovery.discoveryPhase(s, 'haven-bell'), 'sealed');
  ready(s);
  for (const [i, id] of ['haven-bell', 'haven-water', 'haven-name'].entries()) {
    assert.equal(discovery.discoveryPhase(s, id), 'ready');
    at(s, id); engine.interact(s); assert.equal(s.haven.echoes, i + 1);
    assert.equal(discovery.discoveryPhase(s, id), 'complete');
  }
  const reset = fresh(); ready(reset);
  at(reset, 'haven-bell'); engine.interact(reset);
  at(reset, 'haven-name'); engine.interact(reset);
  assert.equal(reset.haven.echoes, 0);
  for (const id of ['haven-bell', 'haven-water', 'haven-name']) assert.equal(discovery.discoveryPhase(reset, id), 'ready');
});
