import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { loadTypescriptModule as load } from './helpers/load-typescript-module.mjs';
import { expectedLegacyEnemies } from './helpers/night-rain-experience.mjs';
import { walkTo } from './helpers/night-rain-pilot.mjs';
import { HAVEN_HUB_ROUTE, HAVEN_SCRIBE_ROUTE, HAVEN_BOATWRIGHT_ROUTE, HAVEN_PUZZLE_ROUTE, HAVEN_RETURN_ROUTE } from './helpers/night-rain-haven-pilot.mjs';

const engine = await load('src/components/nightRain/engine.ts');
const world = await load('src/components/nightRain/world.ts');
const haven = await load('src/components/nightRain/haven.ts');
const story = await load('src/components/nightRain/havenStory.ts');
const guide = await load('src/components/nightRain/companion.ts');
const fixture = fs.readFileSync(new URL('./fixtures/night-rain-valley-v6.json', import.meta.url), 'utf8');
const fresh = () => { const s = engine.loadGame(fixture); assert.ok(s); return s; };
const place = (s, p) => Object.assign(s.player, p, { lastGround: { ...p }, fallPeak: p.y, jumpHeight: 0, jumpVelocity: 0, action: 'idle', attack: null });
const at = (s, id) => place(s, world.interactionPoint(world.LANDMARKS.find(l => l.id === id)));
const close = s => { s.haven.talking = null; engine.setPaused(s, false); };
const ready = () => { const s = fresh(); s.collected.push('names-register', 'keel-rubbing'); s.haven.recruits.push('scribe', 'boatwright'); return s; };
const length = p => p.slice(1).reduce((sum, q, i) => sum + Math.hypot(q.x - p[i].x, q.y - p[i].y, q.z - p[i].z), 0);
const travel = (s, target) => {
  const l = target.id ? world.LANDMARKS.find(l => l.id === target.id) : null;
  const path = guide.findPath(s.player, l ? world.interactionPoint(l) : target, s);
  assert.ok(path.length, `route to ${JSON.stringify(target)}`);
  for (const p of path.slice(1)) walkTo(engine, s, p, 180000);
  if (l) { assert.equal(s.nearbyId, l.id, `${l.id}: ${s.message}`); engine.interact(s); }
  return l;
};
const route = (s, targets) => {
  for (const target of targets) {
    if (target.travel) { assert.ok(engine.travelToLamp(s, target.travel), target.travel); continue; }
    travel(s, target);
    if (target.choice) assert.ok(engine.chooseConversation(s, target.choice), `${target.choice}: ${s.message}`);
    close(s);
    if (target.rest) engine.interact(s);
    assert.ok(engine.loadGame(engine.saveGame(s)), `save after ${JSON.stringify(target)}`);
  }
};

test('authentic v6 save migrates with all previous progress and six new living enemies', () => {
  const before = JSON.parse(fixture); const s = fresh();
  assert.equal(s.worldVersion, 8); assert.deepEqual(s.player, before.player);
  assert.deepEqual(s.enemies.slice(0, before.enemies.length), expectedLegacyEnemies(before.enemies));
  for (const key of ['rice', 'bankedRice', 'level', 'litLamps', 'checkpoint', 'collected', 'chapterGates', 'valleyGates', 'valleyComplete', 'defeatedGuests', 'deaths']) assert.deepEqual(s[key], before[key], key);
  assert.equal(s.enemies.length - before.enemies.length, 8);
  assert.ok(s.enemies.slice(-6).every(e => e.hp === e.maxHp && !e.aggro));
  assert.deepEqual(s.haven, haven.freshHaven());
});

test('new branch spawns, interaction positions and ferry landings have usable ground', () => {
  const s = fresh();
  for (const p of [...haven.HAVEN_ENEMIES, ...haven.HAVEN_LANDMARKS.map(world.interactionPoint), ...Object.values(haven.HAVEN_FERRIES).map(f => f.position)]) {
    assert.ok(world.canOccupy(p.x, p.z, p.y, s), JSON.stringify(p));
    assert.ok(Math.abs(world.supportAt(p.x, p.z, p.y + .1) - p.y) < .01, JSON.stringify(p));
  }
  for (const id of ['well-testimony', 'well-choice', 'well-return']) assert.equal(guide.findPath(world.REST_POINTS['haven-lamp'], world.interactionPoint(world.LANDMARKS.find(l => l.id === id)), s).length, 0, id);
});

test('pedestals are solid but remain usable from a clear approach', () => {
  const s = ready();
  for (const id of ['haven-bell', 'haven-water', 'haven-name', 'well-choice']) {
    const l = world.LANDMARKS.find(l => l.id === id);
    assert.equal(world.canOccupy(l.x, l.z, l.y, s), false);
    at(s, id); engine.interact(s); assert.equal(s.nearbyId, id);
  }
});

test('a new character can physically reach the hub, light it and meet the keeper', () => {
  const s = engine.createGame(); engine.startGame(s);
  route(s, [{ id: 'courtyard' }, { id: 'haven-sign' }, { id: 'haven-lamp' }, { id: 'haven-keeper' }]);
  assert.equal(s.chapterComplete, false); assert.equal(s.valleyComplete, false);
  assert.equal(s.checkpoint, 'haven-lamp'); assert.equal(s.haven.recruits.length, 0);
});

test('banking conserves money, rejects wrong choices and location, and survives genuine death and reload', () => {
  const s = fresh(); at(s, 'haven-lamp'); engine.interact(s); at(s, 'haven-keeper'); engine.interact(s);
  const rice = s.rice, spent = s.bankedRice;
  assert.equal(s.paused, true); assert.ok(engine.chooseConversation(s, 'deposit'));
  assert.equal(s.rice, 0); assert.equal(s.haven.savings, rice); assert.equal(s.bankedRice, spent);
  assert.equal(engine.chooseConversation(s, 'deposit'), false);
  assert.equal(engine.chooseConversation(s, 'invite-scribe'), false);
  const reload = engine.loadGame(engine.saveGame(s)); assert.ok(reload); assert.equal(reload.haven.talking, null); assert.equal(reload.paused, false);
  s.player.x += 10; assert.equal(engine.chooseConversation(s, 'withdraw'), false); close(s);
  const enemy = s.enemies.find(e => e.id === 'boatyard-watch'); place(s, { x: enemy.x, y: enemy.y, z: enemy.z + 1.5 });
  for (let i = 0; i < 300 && s.mode === 'playing'; i++) engine.stepGame(s, 500);
  assert.equal(s.mode, 'dead'); assert.equal(s.haven.savings, rice);
  const dead = engine.loadGame(engine.saveGame(s)); assert.ok(dead); engine.respawn(dead);
  assert.equal(dead.checkpoint, 'haven-lamp'); assert.equal(dead.haven.savings, rice);
  at(dead, 'haven-keeper'); engine.interact(dead); assert.ok(engine.chooseConversation(dead, 'withdraw'));
  assert.equal(dead.rice, rice); assert.equal(dead.haven.savings, 0); assert.equal(dead.bankedRice, spent);
  dead.rice = 1000000; dead.haven.savings = 999999; assert.ok(engine.chooseConversation(dead, 'deposit'));
  assert.equal(dead.rice + dead.haven.savings, 1999999); assert.equal(dead.haven.savings, 1000000);
  assert.ok(engine.chooseConversation(dead, 'withdraw')); assert.equal(dead.rice, 1000000); assert.equal(dead.haven.savings, 999999);
});

test('NPC recruitment requires each clue, cable repair and a safe conversation; field and home appearances swap once', () => {
  for (const [field, home, clue, recruit] of [['scribe-field', 'haven-scribe', 'names-register', 'scribe'], ['boatwright-field', 'haven-boatwright', 'keel-rubbing', 'boatwright']]) {
    const s = fresh(); at(s, field); engine.interact(s);
    assert.equal(engine.chooseConversation(s, `invite-${recruit}`), false); s.collected.push(clue);
    if (recruit === 'boatwright') {
      s.collected.splice(s.collected.indexOf('ferry-winch'), 1);
      assert.equal(engine.chooseConversation(s, 'invite-boatwright'), false); s.collected.push('ferry-winch');
    }
    const foe = s.enemies.find(e => e.id === 'names-watch'); const previous = structuredClone(foe);
    Object.assign(foe, { x: s.player.x + 2, y: s.player.y, z: s.player.z, aggro: true });
    assert.equal(engine.chooseConversation(s, `invite-${recruit}`), false); Object.assign(foe, previous);
    assert.ok(engine.chooseConversation(s, `invite-${recruit}`)); assert.equal(s.haven.recruits.length, 1);
    assert.equal(haven.havenAvailable(s, field), false); assert.equal(haven.havenAvailable(s, home), true);
    assert.equal(engine.chooseConversation(s, `invite-${recruit}`), false); assert.equal(s.paused, false);
    assert.ok(engine.loadGame(engine.saveGame(s)));
  }
});

test('three-echo puzzle requires both companions and chapter two; wrong order resets without consuming clues', () => {
  const s = fresh(); at(s, 'haven-bell'); engine.interact(s); assert.equal(s.haven.echoes, 0);
  const r = ready(); r.valleyComplete = false; at(r, 'haven-bell'); engine.interact(r); assert.equal(r.haven.echoes, 0); r.valleyComplete = true;
  at(r, 'well-door'); engine.interact(r); assert.equal(r.haven.gates.length, 0);
  at(r, 'haven-bell'); engine.interact(r); assert.equal(r.haven.echoes, 1);
  at(r, 'haven-name'); const inventory = [...r.collected]; engine.interact(r); assert.equal(r.haven.echoes, 0); assert.deepEqual(r.collected, inventory);
  for (const [i, id] of ['haven-bell', 'haven-water', 'haven-name'].entries()) { at(r, id); engine.interact(r); assert.equal(r.haven.echoes, i + 1); assert.ok(engine.loadGame(engine.saveGame(r))); }
  at(r, 'haven-bell'); engine.interact(r); assert.equal(r.haven.echoes, 3);
  at(r, 'well-door'); engine.interact(r); assert.ok(r.haven.gates.includes('well-door'));
  assert.ok(guide.findPath(world.REST_POINTS['haven-lamp'], world.interactionPoint(world.LANDMARKS.find(l => l.id === 'well-choice')), r).length);
});

test('return doors block wrong-side interaction and jumping; opening them shortens walking routes', () => {
  for (const id of ['names-gate', 'well-return']) {
    const s = ready(); s.haven.echoes = 3; s.haven.gates.push('well-door');
    const g = haven.HAVEN_GATES.find(g => g.id === id); const xAxis = g.side === 'west';
    place(s, { x: g.x + (xAxis ? 1.1 : 0), y: g.y, z: g.z + (xAxis ? 0 : -1.1) });
    engine.interact(s); assert.equal(s.haven.gates.includes(id), false);
    engine.stepGame(s, 400, { x: xAxis ? -1 : 0, z: xAxis ? 0 : 1, jump: true });
    engine.stepGame(s, 800, { x: xAxis ? -1 : 0, z: xAxis ? 0 : 1 });
    assert.ok(xAxis ? s.player.x > g.x : s.player.z < g.z);
    const inside = world.interactionPoint(world.LANDMARKS.find(l => l.id === id));
    const destination = xAxis ? world.REST_POINTS.courtyard : world.REST_POINTS['haven-lamp'];
    const before = guide.findPath(inside, destination, s); assert.ok(before.length);
    at(s, id); engine.interact(s); assert.ok(s.haven.gates.includes(id));
    const after = guide.findPath(inside, destination, s); assert.ok(after.length);
    assert.ok(length(before) > length(after) * 2, `${id}: ${length(before)} -> ${length(after)}`);
    console.log(`${id}: ${length(before).toFixed(1)}m -> ${length(after).toFixed(1)}m`);
  }
});

test('haven ferry unlocks after recruitment and lighting, preserves resources and checkpoint, rejects combat', () => {
  const s = ready(); at(s, 'haven-ferry'); const initial = s.player.x; engine.interact(s); assert.equal(s.player.x, initial);
  at(s, 'haven-lamp'); engine.interact(s); s.player.hp = 69; s.player.flasks = 1;
  for (const id of ['haven-ferry', 'boatyard-ferry']) {
    at(s, id); const enemies = JSON.stringify(s.enemies); const checkpoint = s.checkpoint;
    engine.interact(s); assert.deepEqual({ x: s.player.x, y: s.player.y, z: s.player.z }, haven.HAVEN_FERRIES[id].position);
    assert.equal(s.player.hp, 69); assert.equal(s.player.flasks, 1); assert.equal(s.checkpoint, checkpoint); assert.equal(JSON.stringify(s.enemies), enemies);
    assert.ok(engine.loadGame(engine.saveGame(s)), id);
  }
  at(s, 'haven-ferry'); Object.assign(s.enemies.find(e => e.id === 'boatyard-watch'), { x: s.player.x + 2, y: s.player.y, z: s.player.z, aggro: true });
  const x = s.player.x; engine.interact(s); assert.equal(s.player.x, x); assert.match(s.message, /追兵/);
});

test('the last guardian has a delayed strike and an unparryable jumpable sweep in phase two', () => {
  const setup = () => {
    const s = ready(); s.haven.echoes = 3; s.haven.gates.push('well-door'); const e = s.enemies.find(e => e.id === 'last-lamplighter');
    place(s, { x: e.x, y: e.y, z: e.z + 2 }); s.player.facing = Math.PI;
    Object.assign(e, { hp: e.maxHp / 2 - 1, action: 'recover', timer: 2, aggro: true, facing: 0 });
    engine.stepGame(s, 20); assert.equal(e.phase, 2); Object.assign(e, { action: 'windup', timer: .12, attackIndex: 2 }); return { s, e };
  };
  const a = setup(); const hp = a.s.player.hp; engine.stepGame(a.s, 400, { x: 0, z: 0, parry: true }); assert.ok(a.s.player.hp < hp);
  const b = setup(); engine.stepGame(b.s, 400, { x: 0, z: 0, jump: true }); assert.equal(b.s.player.hp, hp);
  b.e.attackIndex = 1; const delay = engine.enemyAttack(b.e); b.e.attackIndex = 0;
  assert.ok(delay.windup > engine.enemyAttack(b.e).windup + .8);
});

test('malformed haven progress cannot fabricate invitations, clues, keys, endings or funds', () => {
  for (const change of [
    s => s.haven.savings = -1, s => s.haven.savings = .5, s => s.haven.savings = 1000001,
    s => s.haven.recruits.push('scribe'), s => s.haven.recruits.push('unknown'), s => s.haven.echoes = 3,
    s => s.haven.gates.push('well-door'), s => s.haven.gates.push('well-return'), s => s.haven.ending = 'remember',
    s => s.haven.talking = 'food', s => s.collected.push('well-testimony'),
  ]) { const s = fresh(); change(s); assert.equal(engine.loadGame(engine.saveGame(s)), null); }
  const s = ready(); s.haven.recruits.push('scribe'); assert.equal(engine.loadGame(engine.saveGame(s)), null);
  const empty = engine.createGame(); engine.startGame(empty);
  for (const id of ['well-choice', 'well-testimony', 'well-return', 'keel-rubbing', 'boatwright-field']) assert.equal(guide.guideTargets(empty).some(l => l.id === id), false);
});

for (const [ending, reversed] of [['remember', false], ['release', true]]) test(`ordinary inputs complete ${reversed ? 'boatwright-first' : 'scribe-first'} route, ${ending} ending and return loop`, () => {
  const s = fresh(); route(s, HAVEN_HUB_ROUTE);
  if (reversed) {
    route(s, [{ id: 'haven-lamp' }, ...HAVEN_BOATWRIGHT_ROUTE, ...HAVEN_SCRIBE_ROUTE, { travel: 'haven-lamp' }]);
  } else route(s, [...HAVEN_SCRIBE_ROUTE, ...HAVEN_BOATWRIGHT_ROUTE]);
  assert.equal(s.haven.recruits.length, 2); route(s, HAVEN_PUZZLE_ROUTE);
  assert.ok(s.defeatedGuests.includes('last-lamplighter')); assert.equal(s.mode, 'playing');
  const stamina = engine.maxStamina(s), heal = engine.healAmount(s);
  engine.interact(s); assert.equal(s.haven.talking, 'well-choice'); assert.ok(engine.chooseConversation(s, ending));
  assert.equal(s.mode, 'ending'); assert.equal(s.haven.ending, ending);
  assert.equal(engine.maxStamina(s), stamina + (ending === 'remember' ? 15 : 0));
  assert.equal(engine.healAmount(s), heal + (ending === 'release' ? 15 : 0));
  const restored = engine.loadGame(engine.saveGame(s)); assert.ok(restored); engine.continueExploring(restored);
  engine.interact(restored); assert.equal(engine.chooseConversation(restored, ending), false); close(restored);
  route(restored, HAVEN_RETURN_ROUTE); assert.ok(restored.haven.gates.includes('well-return'));
  engine.interact(restored); assert.equal(restored.enemies.find(e => e.id === 'last-lamplighter').hp, 0);
  assert.equal(story.havenJournal(restored).every(q => q.done), true); assert.ok(engine.loadGame(engine.saveGame(restored)));
  assert.equal(restored.deaths, JSON.parse(fixture).deaths);
  console.log(`${ending}: ${restored.parries - JSON.parse(fixture).parries} parries; ${restored.kills - JSON.parse(fixture).kills} kills; walked return gate`);
});
