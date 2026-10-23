import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { loadTypescriptModule as load } from './helpers/load-typescript-module.mjs';
import { engine, world, riverCompleted, place, SKY_ROUTE } from './helpers/night-rain-sky.mjs';
import { walkTo } from './helpers/night-rain-pilot.mjs';
const sky = await load('src/components/nightRain/skyplain.ts');
const fields = await load('src/components/nightRain/bossFields.ts');
const guide = await load('src/components/nightRain/companion.ts');

test('new spawns, lamp landings and interactions occupy their real visible floors', () => {
  const s = riverCompleted(); assert.ok(engine.loadGame(engine.saveGame(s)));
  for (const e of sky.SKY_ENEMIES) {
    assert.ok(Math.abs(world.supportAt(e.x, e.z, e.y + .1) - e.y) < .01, e.id);
    assert.equal(world.playerBlocked(e.x, e.z, e.y, s), false, e.id);
  }
  for (const l of sky.SKY_LANDMARKS) { const p = world.interactionPoint(l); assert.ok(world.canOccupy(p.x, p.z, p.y, s), l.id); }
});
test('v11 migration appends only this region and preserves the full losing combat state', () => {
  const s = riverCompleted(); s.player.hp = 33; s.player.flasks = 1; s.deaths = 4;
  s.enemies[0].hp = 20; const old = structuredClone(s); old.worldVersion = 11;
  delete old.skyGates; delete old.skyComplete; old.enemies = old.enemies.filter(e => !e.id.startsWith('sky-') && !e.id.startsWith('bell-'));
  const restored = engine.loadGame(JSON.stringify(old)); assert.ok(restored);
  assert.deepEqual(restored.player, old.player); assert.equal(restored.deaths, 4);
  assert.deepEqual(restored.enemies.slice(0, old.enemies.length), old.enemies);
  assert.equal(restored.enemies.length - old.enemies.length, 15);
  assert.deepEqual(engine.loadGame(engine.saveGame(restored)), restored);
  for (const corrupt of [s => s.skyGates.push('bad'), s => s.skyGates.push('sky-door'), s => s.skyComplete = true, s => { s.skyGates.push('sky-entry'); s.valleyComplete = false; }]) {
    const bad = riverCompleted(); corrupt(bad); assert.equal(engine.loadGame(engine.saveGame(bad)), null);
  }
});
test('entry and prism gate enforce prior chapters and both mirrors; return gate opens only from the tower', () => {
  const s = engine.createGame(); engine.startGame(s); place(s, { x: -139, y: 8, z: -533 }); engine.interact(s); assert.deepEqual(s.skyGates, []);
  const ready = riverCompleted(); place(ready, { x: -139, y: 8, z: -533 }); engine.interact(ready); assert.ok(ready.skyGates.includes('sky-entry'));
  place(ready, { x: -40, y: 32, z: -655.5 }); engine.interact(ready); assert.equal(ready.skyGates.includes('sky-door'), false);
  place(ready, { x: -94, y: 18.4, z: -596.2 }); engine.interact(ready); assert.equal(ready.skyGates.includes('sky-return'), false);
  place(ready, { x: -94, y: 19.417, z: -600.2 }); engine.interact(ready); assert.ok(ready.skyGates.includes('sky-return'));
});
test('starfall snapshots a floor position and gives time to escape; cards fire exactly three delayed parryable shots', () => {
  const s = riverCompleted(); const boss = s.enemies.find(e => e.id === 'sky-astronomer');
  boss.aggro = true; place(s, { x: -40, y: 32, z: -675 });
  assert.ok(fields.castBossSkill(s, boss)); assert.equal(s.bossFields[0].z, -675);
  let hits = 0; const cb = { hit: () => hits++, move: () => {} };
  fields.updateBossFields(s, 1.4, cb); assert.equal(hits, 0);
  s.player.x += 4; fields.updateBossFields(s, .15, cb); assert.equal(hits, 0);
  s.bossFields = []; boss.attackIndex = 1; assert.ok(fields.castBossSkill(s, boss));
  for (let i = 0; i < 310; i++) fields.updateBossFields(s, .01, cb);
  assert.equal(s.projectiles.length, 3); assert.ok(s.projectiles.every(p => p.parryable && p.damage === 22));
});
test('the companion can lead to every main discovery and the boss from the preceding checkpoint', () => {
  const s = riverCompleted(); const c = guide.createCompanion(s);
  assert.equal(guide.mainTarget(s), 'sky-entry');
  assert.ok(guide.leadTo(c, s));
  s.skyGates.push('sky-entry'); place(s, { x: -108, y: 18, z: -570 });
  assert.equal(guide.mainTarget(s), 'sky-lamp'); assert.ok(guide.leadTo(c, s));
  s.litLamps.push('sky-lamp'); assert.equal(guide.mainTarget(s), 'sky-prism-rose'); assert.ok(guide.leadTo(c, s));
  s.collected.push('sky-prism-rose'); assert.equal(guide.mainTarget(s), 'sky-court-lamp'); assert.ok(guide.leadTo(c, s));
  place(s, { x: -18.8, y: 32, z: -635 }); s.litLamps.push('sky-court-lamp');
  assert.equal(guide.mainTarget(s), 'sky-prism-moon'); assert.ok(guide.leadTo(c, s));
  s.collected.push('sky-prism-moon'); assert.equal(guide.mainTarget(s), 'sky-door'); assert.ok(guide.leadTo(c, s));
  s.skyGates.push('sky-door'); assert.equal(guide.mainTarget(s), 'sky-astronomer'); assert.ok(guide.leadTo(c, s));
  place(s, { x: -132, y: 18, z: -572 }); assert.ok(guide.leadTo(c, s, 'sky-dew'));
});
test('complete third region is playable through ordinary movement and combat including the optional loop', () => {
  const s = riverCompleted(); let elapsed = 0;
  for (const [x, z, id] of SKY_ROUTE) {
    console.log(`route ${x},${z} ${id ?? ""}`);
    elapsed += walkTo(engine, s, { x, z, y: world.supportAt(x, z, 45) }, 120000);
    if (id) {
      engine.interact(s);
      if (id.endsWith('lamp')) engine.interact(s);
      assert.ok(s.collected.includes(id) || s.litLamps.includes(id) || s.skyGates.includes(id), `${id}: ${s.message}`);
      assert.ok(engine.loadGame(engine.saveGame(s)), `save at ${id}`);
    }
  }
  assert.equal(s.skyComplete, true); assert.ok(s.defeatedGuests.includes('sky-astronomer'));
  assert.equal(s.mode, 'interlude');
  const restored = engine.loadGame(engine.saveGame(s)); assert.equal(restored.mode, 'interlude');
  const frozen = restored.time; engine.stepGame(restored, 3000, { x: 1, z: 1 }); assert.equal(restored.time, frozen);
  engine.continueExploring(restored); assert.equal(engine.loadGame(engine.saveGame(restored)).mode, 'playing');
  assert.equal(engine.maxStamina(s), 160); assert.equal(s.deaths, 0);
  assert.ok(guide.findPath({ x: -94, y: 18, z: -590 }, { x: -142, y: 26, z: -631 }, s).length);
  const rice = s.rice; engine.continueExploring(s); engine.interact(s); assert.equal(s.rice, rice);
  fs.mkdirSync('tmp/night-sky', { recursive: true }); fs.writeFileSync('tmp/night-sky/completed.json', engine.saveGame(s));
  console.log(`Skyplain completed in ${(elapsed / 1000).toFixed(0)} simulated seconds, ${s.player.hp} HP, ${s.parries} parries`);
});
