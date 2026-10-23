import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { loadTypescriptModule as load } from './helpers/load-typescript-module.mjs';
import { engine, world, place, skyCompleted, BELL_ROUTE } from './helpers/night-rain-bell.mjs';
import { walkTo } from './helpers/night-rain-pilot.mjs';
const bell = await load('src/components/nightRain/bellAbbey.ts');
const fields = await load('src/components/nightRain/bossFields.ts');
const guide = await load('src/components/nightRain/companion.ts');

test('fourth chapter spawns and interactions stand on real floors', () => {
  const s = skyCompleted(); assert.ok(engine.loadGame(engine.saveGame(s)));
  for (const e of bell.BELL_ENEMIES) {
    assert.ok(Math.abs(world.supportAt(e.x, e.z, e.y + .1) - e.y) < .01, e.id);
    assert.equal(world.playerBlocked(e.x, e.z, e.y, s), false, e.id);
  }
  for (const l of bell.BELL_LANDMARKS) { const p = world.interactionPoint(l); assert.ok(world.canOccupy(p.x, p.z, p.y, s), l.id); }
});
test('v12 migration preserves losing state and appends exactly the seven new enemies', () => {
  const s = skyCompleted(); s.worldVersion = 12; delete s.bellGates; delete s.bellComplete;
  s.enemies = s.enemies.filter(e => !e.id.startsWith('bell-')); s.player.hp = 19; s.player.flasks = 0; s.deaths = 3;
  const restored = engine.loadGame(JSON.stringify(s)); assert.ok(restored);
  assert.deepEqual(restored.player, s.player); assert.equal(restored.deaths, 3);
  assert.deepEqual(restored.enemies.slice(0, s.enemies.length), s.enemies);
  assert.equal(restored.enemies.length - s.enemies.length, 7);
  assert.deepEqual(engine.loadGame(engine.saveGame(restored)), restored);
});
test('entry, mechanism and one sided return enforce progress and save invariants', () => {
  const s = engine.createGame(); engine.startGame(s); place(s, { x: -44, y: 38.8, z: -732.4 }); engine.interact(s); assert.deepEqual(s.bellGates, []);
  const ready = skyCompleted(); place(ready, { x: -44, y: 38.8, z: -732.4 }); engine.interact(ready); assert.ok(ready.bellGates.includes('bell-entry'));
  place(ready, { x: -44, y: 34, z: -840.4 }); engine.interact(ready); assert.equal(ready.bellGates.includes('bell-door'), false);
  place(ready, { x: -20, y: 34, z: -790.4 }); engine.interact(ready); assert.equal(ready.bellGates.includes('bell-return'), false);
  place(ready, { x: -20, y: 34, z: -793.6 }); engine.interact(ready); assert.ok(ready.bellGates.includes('bell-return'));
  place(ready, { x: -85, y: 16, z: -819 }); engine.interact(ready);
  place(ready, { x: -44, y: 34, z: -840.4 }); engine.interact(ready); assert.ok(ready.bellGates.includes('bell-door'));
  assert.ok(engine.loadGame(engine.saveGame(ready)));
  for (const change of [s => s.bellGates.push('bad'), s => s.bellGates.push('bell-door'), s => s.bellComplete = true]) {
    const bad = skyCompleted(); change(bad); assert.equal(engine.loadGame(engine.saveGame(bad)), null);
  }
});
test('resonance has two or three distinct jumpable pulses, with optional silence removing only the third', () => {
  for (const [phase, silence, count] of [[1, false, 2], [2, false, 3], [2, true, 2]]) {
    const s = skyCompleted(); s.bellGates = ['bell-entry', 'bell-door']; s.collected.push('bell-clapper');
    if (silence) s.collected.push('bell-silence');
    const boss = s.enemies.find(e => e.id === 'bell-keeper'); Object.assign(boss, { phase, attackIndex: 2, aggro: true });
    place(s, { x: -44, y: 34, z: -859 });
    assert.ok(fields.castBossSkill(s, boss)); assert.equal(s.bossFields.length, count);
    assert.equal(new Set(s.bossFields.map(f => f.id)).size, count);
    assert.ok(engine.loadGame(engine.saveGame(s)), 'mid pulse save');
    const hits = [];
    for (let i = 0; i < 500; i++) fields.updateBossFields(s, .01, { hit: (_, f, jumpable) => hits.push([f.age, jumpable]), move: () => {} });
    assert.equal(hits.length, count); assert.ok(hits.every(h => h[1])); assert.equal(s.bossFields.length, 0);
  }
});
test('ordinary movement and combat complete both loops and the fourth ending without teleports', () => {
  const s = skyCompleted(); let elapsed = 0;
  for (const [x, z, id] of BELL_ROUTE) {
    console.log(`abbey ${x},${z} ${id ?? ''}`);
    elapsed += walkTo(engine, s, { x, z, y: world.supportAt(x, z, 45) }, 140000);
    if (id) {
      engine.interact(s); if (id.endsWith('lamp')) engine.interact(s);
      assert.ok(s.collected.includes(id) || s.litLamps.includes(id) || s.bellGates.includes(id), `${id}: ${s.message}`);
      assert.ok(engine.loadGame(engine.saveGame(s)), `save ${id}`);
    }
  }
  assert.equal(s.bellComplete, true); assert.equal(s.mode, 'interlude'); assert.equal(s.deaths, 0);
  const restored = engine.loadGame(engine.saveGame(s)); assert.equal(restored.mode, 'interlude');
  engine.continueExploring(restored); assert.equal(restored.mode, 'playing');
  const rice = restored.rice; engine.interact(restored); assert.equal(restored.rice, rice);
  walkTo(engine, restored, { x: -54.8, y: 34, z: -892 });
  assert.ok(engine.travelToLamp(restored, 'bell-porch-lamp')); assert.equal(restored.checkpoint, 'bell-porch-lamp');
  assert.ok(guide.findPath({ x: -20, y: 34, z: -810 }, { x: -44, y: 28, z: -765 }, restored).length);
  fs.mkdirSync('tmp/night-bell', { recursive: true }); fs.writeFileSync('tmp/night-bell/completed.json', engine.saveGame(s));
  console.log(`Abbey completed ${elapsed / 1000}s, HP ${s.player.hp}, parries ${s.parries}`);
});

test('ordinary jumps clear all three resonance collisions while grounded listening takes damage', () => {
  for (const jumping of [false, true]) {
    const s = skyCompleted(); s.bellGates = ['bell-entry', 'bell-door']; s.collected.push('bell-clapper');
    const boss = s.enemies.find(e => e.id === 'bell-keeper');
    Object.assign(boss, { phase: 2, hp: 650, attackIndex: 2, aggro: true, action: 'recover', timer: 5.4 });
    place(s, { x: -44, y: 34, z: -859 }); fields.castBossSkill(s, boss);
    const hp = s.player.hp; let jumps = 0;
    for (let ms = 0; ms < 4600; ms += 40) {
      const imminent = s.bossFields.some(f => !f.hit && f.delay + (3 / f.radius) * f.duration - f.age < .28 && f.delay + (3 / f.radius) * f.duration - f.age > -.1);
      const jump = jumping && imminent && s.player.jumpHeight === 0;
      if (jump) jumps++;
      engine.stepGame(s, 40, { x: 0, z: 0, jump });
    }
    assert.equal(s.bossFields.length, 0);
    if (jumping) { assert.equal(jumps, 3); assert.equal(s.player.hp, hp); }
    else assert.ok(s.player.hp < hp);
  }
});
