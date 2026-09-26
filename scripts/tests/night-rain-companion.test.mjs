import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';
import { chooseInput, walkTo } from './helpers/night-rain-pilot.mjs';

const engine = await loadTypescriptModule('src/components/nightRain/engine.ts');
const guide = await loadTypescriptModule('src/components/nightRain/companion.ts');
const world = await loadTypescriptModule('src/components/nightRain/world.ts');
const fresh = () => { const s = engine.createGame(); engine.startGame(s); return s; };
const gap = (a, b) => Math.hypot(a.x - b.x, a.z - b.z, a.y - b.y);
const pathLength = path => path.slice(1).reduce((sum, p, i) => sum + gap(p, path[i]), 0);

test('navigation reaches every discovery from spawn with gate shut and with gate open, using player radius', () => {
  for (const open of [false, true]) for (const landmark of world.LANDMARKS) {
    const path = guide.findPath(world.SPAWN, world.interactionPoint(landmark), open);
    assert.ok(path.length > 1, `${landmark.id}, gate ${open}`);
    for (let i = 1; i < path.length; i++) assert.ok(guide.walkSegment(path[i - 1], path[i], open), landmark.id);
  }
  const destination = world.LANDMARKS.find(l => l.id === 'shortcut');
  const closed = guide.findPath(world.CHECKPOINT, destination, false);
  const open = guide.findPath(world.CHECKPOINT, destination, true);
  assert.ok(pathLength(closed) > pathLength(open) * 2, 'Guide respects one-way locked shortcut');
});

test('optional cloister and lookout chests are collectible through real movement and persist once only', () => {
  const s = fresh();
  for (const id of ['cloister-cache', 'lookout-cache']) {
    const destination = world.LANDMARKS.find(l => l.id === id);
    const path = guide.findPath(s.player, destination, s.shortcut);
    for (const point of path) walkTo(engine, s, point, 90000);
    const before = s.rice; engine.interact(s); assert.ok(s.collected.includes(id)); assert.equal(s.rice, before + 35);
    engine.interact(s); assert.equal(s.rice, before + 35);
    const restored = engine.loadGame(engine.saveGame(s)); assert.ok(restored?.collected.includes(id));
  }
});

test('guide leads along a legal path, waits for player, and never changes player position', () => {
  const s = fresh(); const c = guide.createCompanion(s);
  assert.ok(guide.leadTo(c, s, 'courtyard'));
  const original = { ...s.player };
  for (let i = 0; i < 300; i++) { s.time += 0.04; guide.updateCompanion(c, s, 0.04); }
  assert.equal(c.status, 'waiting'); assert.deepEqual(s.player, original);
  assert.ok(gap(c.position, s.player) < 4.5);
  let count = 0;
  while (c.status !== 'arrived' && count++ < 12000 && s.mode === 'playing') {
    const input = chooseInput(s, c.position);
    engine.stepGame(s, 40, input); guide.updateCompanion(c, s, 0.04);
  }
  assert.equal(c.status, 'arrived'); assert.equal(s.mode, 'playing');
  assert.ok(gap(c.position, world.interactionPoint(world.LANDMARKS.find(l => l.id === 'courtyard'))) < 0.2);
});

test('exploration hints escalate from nearby to missed to warmer, without repeated chatter or collected hints', () => {
  const s = fresh(); const c = guide.createCompanion(s); const l = world.LANDMARKS.find(v => v.id === 'cloister-cache');
  // Isolated trigger fixtures; navigation and collection are independently tested above.
  Object.assign(s.player, { x: l.x - 7, y: l.y, z: l.z }); s.time = 6;
  guide.updateCompanion(c, s, 0.1); assert.match(c.subtitle, /岔路|铃声/);
  const serial = c.serial; s.time += 2; guide.updateCompanion(c, s, 0.1); assert.equal(c.serial, serial);
  Object.assign(s.player, { x: l.x + 3, z: l.z + 9 }); s.time += 16;
  guide.updateCompanion(c, s, 0.1); assert.match(c.subtitle, /错过/);
  Object.assign(s.player, { x: l.x, z: l.z + 1 }); s.time += 16;
  guide.updateCompanion(c, s, 0.1); assert.match(c.subtitle, /越来越近/);
  assert.equal(guide.recommendedTarget(c, s), l.id);
  s.collected.push(l.id); assert.ok(!guide.guideTargets(s).some(v => v.id === l.id));
  assert.notEqual(guide.recommendedTarget(c, s), l.id);
});

test('walking away even after the closest hint reminds about an unclaimed discovery once', () => {
  const s = fresh(); const c = guide.createCompanion(s); const l = world.LANDMARKS.find(v => v.id === 'cloister-cache');
  Object.assign(s.player, { x: l.x, y: l.y, z: l.z + 1 }); s.time = 6;
  guide.updateCompanion(c, s, 0.1); assert.match(c.subtitle, /越来越近/);
  Object.assign(s.player, { x: l.x + 3, z: l.z + 9 }); s.time += 16;
  guide.updateCompanion(c, s, 0.1); assert.match(c.subtitle, /错过/); assert.equal(c.seen[l.id].missed, true);
});

test('disabled, paused and dead guide is inert; combat pauses guidance and ending target is dinner', () => {
  const s = fresh(); const c = guide.createCompanion(s); guide.leadTo(c, s, 'courtyard');
  for (const mode of ['disabled', 'paused', 'dead']) {
    c.enabled = mode !== 'disabled'; s.paused = mode === 'paused'; s.mode = mode === 'dead' ? 'dead' : 'playing';
    const before = JSON.stringify(c); guide.updateCompanion(c, s, 1); assert.equal(JSON.stringify(c), before);
  }
  c.enabled = true; s.paused = false; s.mode = 'playing';
  Object.assign(s.enemies[0], { ...s.player, hp: 68, action: 'chase', aggro: true });
  guide.updateCompanion(c, s, 0.1); assert.equal(c.status, 'danger');
  s.bossDefeated = true; s.checkpoint = 'courtyard'; assert.equal(guide.mainTarget(s), 'food');
});
