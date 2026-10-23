import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';
const e = await loadTypescriptModule('src/components/liuzhou/simulation.ts');
const c = await loadTypescriptModule('src/components/liuzhou/citizens.ts');
const w = await loadTypescriptModule('src/components/liuzhou/world.ts');
const game = () => { const g = e.createGame(); g.phase = 'playing'; Object.assign(g.player, { x: 480, z: -330 }); return g; };
const advance = (g, seconds) => { for (let i = 0; i < seconds * 60; i++) e.step(g); };
afterEach(() => { delete globalThis.localStorage; });

test('all five citizen walks and stops have continuous usable land and building clearance', () => {
  assert.equal(Object.keys(c.CITIZEN_PLANS).length, 5);
  for (const [id, plan] of Object.entries(c.CITIZEN_PLANS)) {
    let length = 0;
    for (let i = 0; i < plan.stops.length; i++) {
      const a = plan.stops[i], b = plan.stops[(i + 1) % plan.stops.length], d = w.distance(a, b);
      length += d;
      for (let s = 0; s <= d; s += 0.25) assert.ok(c.citizenClear({ x: a.x + (b.x - a.x) * s / d, z: a.z + (b.z - a.z) * s / d }), `${id} leg ${i} at ${s}`);
    }
    assert.ok(length > 75, id);
  }
});

test('fifteen minutes of traffic and parked cars preserve continuous walking, actions and completed circuits', () => {
  const g = game(); const seen = new Set();
  for (let i = 0; i < 900 * 60; i++) {
    const before = g.npcs.map(n => ({ x: n.x, z: n.z }));
    e.step(g);
    g.npcs.forEach((n, j) => {
      if (!n.routine) return;
      seen.add(n.routine.action);
      assert.ok(w.distance(n, before[j]) <= c.CITIZEN_PLANS[n.id].pace / 60 + 0.001, `${n.id} teleport`);
      if (i % 60 === 0) {
        assert.ok(c.citizenClear(n), `${n.id} wall/water`);
        assert.ok(g.traffic.every(car => w.distance(car, n) > 2.5), `${n.id} car overlap`);
      }
    });
  }
  for (const n of g.npcs.filter(n => n.routine)) {
    assert.ok(n.routine.laps >= 2, `${n.id}: ${JSON.stringify(n.routine)}`);
    assert.ok(n.routine.odometer > 500, n.id);
  }
  assert.deepEqual([...seen].sort(), ['look', 'photo', 'shop', 'stretch', 'walk']);
});

test('pause and conversation freeze routines, nearby citizens face the player and continue after departure', () => {
  const g = game(); advance(g, 3);
  for (const mode of ['paused', 'dialogue']) {
    if (mode === 'paused') g.phase = 'paused';
    else { g.phase = 'playing'; g.dialogue = { name: '街坊', lines: ['你好'], index: 0, advance: false }; }
    const before = structuredClone(g.npcs); advance(g, 3); assert.deepEqual(g.npcs, before);
  }
  g.dialogue = null;
  const n = g.npcs.find(n => n.id === 'walker-3');
  Object.assign(g.player, { x: n.x + 2, z: n.z });
  const before = { ...n.routine }; advance(g, 2);
  assert.equal(n.routine.waiting, '交谈'); assert.equal(n.routine.remaining, before.remaining); assert.equal(n.speed, 0); assert.ok(Math.abs(n.angle - Math.PI / 2) < 0.01);
  Object.assign(g.player, { x: 480, z: -330 }); advance(g, 16); assert.ok(n.routine.odometer > before.odometer);
});

test('moving cars hold pedestrians, and a parked car is passed without entering its footprint or a carriageway', () => {
  const g = game(); const n = g.npcs.find(n => n.id === 'walker-1');
  n.routine.remaining = 0; n.routine.target = 1;
  g.npcs = [n]; g.vehicles = [];
  const target = c.CITIZEN_PLANS[n.id].stops[1];
  const angle = Math.atan2(target.x - n.x, target.z - n.z);
  g.traffic = [{ x: n.x + Math.sin(angle) * 9, z: n.z + Math.cos(angle) * 9, speed: 7, angle: angle + Math.PI }];
  c.stepCitizens(g, 1 / 60); assert.equal(n.routine.waiting, '让车'); assert.equal(n.routine.odometer, 0);
  g.traffic = [];
  const origin = { x: n.x, z: n.z };
  const car = { id: 'parked', kind: 'car', x: n.x + Math.sin(angle) * 7, z: n.z + Math.cos(angle) * 7 }; g.vehicles = [car];
  let detour = 0;
  for (let i = 0; i < 80 * 60; i++) {
    c.stepCitizens(g, 1 / 60);
    assert.ok(w.distance(n, car) >= 2.45);
    assert.ok(c.citizenClear(n));
    detour = Math.max(detour, w.distance(n, w.closestOnSegment(n, origin, target)));
  }
  assert.ok(n.routine.odometer > 40, 'continues past parked car'); assert.ok(detour > 2, 'walks around it');
});

test('delivery recipients hold their current position, survive reload, settle normally and resume their walk', () => {
  const g = game(); g.stage = 2; advance(g, 25);
  let saved; globalThis.localStorage = { setItem: (_, value) => { saved = value; }, getItem: () => saved };
  Object.assign(g.player, g.npcs.find(n => n.id === 'chef')); e.interact(g);
  while (g.dialogue.index < g.dialogue.lines.length - 1) e.interact(g);
  e.chooseDialogue(g, 0); while (g.dialogue) e.interact(g);
  const n = g.npcs.find(n => n.id === 'uncle'); const before = { ...n, routine: { ...n.routine } };
  Object.assign(g.player, { x: 480, z: -330 }); advance(g, 40);
  assert.equal(n.x, before.x); assert.equal(n.z, before.z); assert.equal(n.routine.waiting, '等餐');
  e.saveGame(g); const loaded = game(); e.loadGame(loaded); loaded.phase = 'playing';
  const recipient = loaded.npcs.find(n => n.id === 'uncle');
  assert.equal(recipient.x, before.x); assert.equal(recipient.z, before.z); assert.equal(recipient.routine.odometer, before.routine.odometer);
  Object.assign(loaded.player, recipient); e.interact(loaded); assert.equal(loaded.dialogue.effect.kind, 'delivery');
  while (loaded.dialogue) e.interact(loaded);
  assert.equal(loaded.life.delivery, null); assert.equal(loaded.life.delivered, 1);
  Object.assign(loaded.player, { x: 480, z: -330 }); advance(loaded, 25); assert.ok(recipient.routine.odometer > before.routine.odometer + 5);
});

test('old saves and invalid routine fields cannot place a citizen in walls, off their walk, or skip story progress', () => {
  const original = game(); let saved;
  globalThis.localStorage = { setItem: (_, value) => { saved = value; }, getItem: () => saved };
  advance(original, 35); e.saveGame(original); const data = JSON.parse(saved);
  const restored = game(); e.loadGame(restored);
  for (const n of original.npcs.filter(n => n.routine)) {
    const r = restored.npcs.find(other => other.id === n.id);
    assert.equal(r.x, n.x); assert.equal(r.z, n.z); assert.equal(r.routine.remaining, n.routine.remaining); assert.equal(r.routine.odometer, n.routine.odometer);
  }
  for (const change of [{ x: 480, z: -330 }, { routine: { target: 99 } }, { routine: { remaining: -1 } }, { routine: { odometer: null } }, { routine: { action: '__proto__' } }, { routine: { laps: 1.5 } }]) {
    const bad = structuredClone(data); const one = bad.citizens[0];
    if (change.routine) Object.assign(one.routine, change.routine); else Object.assign(one, change);
    saved = JSON.stringify(bad); const g = game(); e.loadGame(g);
    const n = g.npcs.find(n => n.id === one.id); assert.equal(n.routine.odometer, 0); assert.deepEqual({ x: n.x, z: n.z }, n.home); assert.equal(g.stage, 0);
  }
  delete data.citizens; saved = JSON.stringify(data); const old = game(); e.loadGame(old);
  assert.equal(old.money, original.money); assert.equal(old.npcs.filter(n => n.routine).length, 5);
});
