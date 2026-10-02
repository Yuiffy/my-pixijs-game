import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { loadTypescriptModule as load } from './helpers/load-typescript-module.mjs';
import { walkTo } from './helpers/night-rain-pilot.mjs';
import { VALLEY_ROUTE, VALLEY_ENTRY_ROUTE, VALLEY_WEST_ROUTE, VALLEY_EAST_ROUTE, VALLEY_FINISH_ROUTE } from './helpers/night-rain-valley-pilot.mjs';

const engine = await load('src/components/nightRain/engine.ts');
const world = await load('src/components/nightRain/world.ts');
const valley = await load('src/components/nightRain/valley.ts');
const guide = await load('src/components/nightRain/companion.ts');
const fixture = fs.readFileSync(new URL('./fixtures/night-rain-chapter-v5.json', import.meta.url), 'utf8');
const fresh = () => { const s = engine.loadGame(fixture); assert.ok(s); return s; };
const place = (s, p) => { Object.assign(s.player, p, { lastGround: { ...p }, fallPeak: p.y, jumpHeight: 0, jumpVelocity: 0, action: 'idle', attack: null }); };
const at = (s, id) => place(s, world.interactionPoint(world.LANDMARKS.find(l => l.id === id)));
const clear = (s, id) => { const e = s.enemies.find(e => e.id === id); Object.assign(e, { hp: 0, action: 'dead', aggro: false }); if (!s.defeatedGuests.includes(id)) s.defeatedGuests.push(id); };

test('all river spawns, shrines, mechanisms and ferry landings stand on connected visible ground', () => {
  const s = fresh();
  for (const p of [...valley.VALLEY_ENEMIES, ...valley.VALLEY_LANDMARKS.map(world.interactionPoint), ...Object.values(valley.FERRY_DESTINATIONS).map(d => d.position)]) {
    assert.ok(world.canOccupy(p.x, p.z, p.y, s), JSON.stringify(p));
    assert.ok(Math.abs(world.supportAt(p.x, p.z, p.y + .1) - p.y) < .01);
    assert.equal(world.deckBlocks(p.x, p.z, p.y), false);
  }
});

test('actual completed v5 save migrates without changing the player, inventory or any old enemy', () => {
  const old = JSON.parse(fixture); const s = fresh();
  assert.equal(s.worldVersion,7); assert.deepEqual(s.player, old.player);
  assert.deepEqual(s.enemies.slice(0, old.enemies.length), old.enemies);
  for (const key of ['rice', 'level', 'bankedRice', 'defeatedGuests', 'litLamps', 'collected', 'chapterGates', 'chapterComplete']) assert.deepEqual(s[key], old[key], key);
  assert.equal(s.enemies.length, world.ENEMY_SPAWNS.length);
  assert.deepEqual(s.valleyGates, []); assert.equal(s.valleyComplete, false);
  assert.ok(engine.loadGame(engine.saveGame(s)));
});

test('postern requires chapter one; both water wheels require their guardians and the final gate requires both wheels', () => {
  const s = engine.createGame(); engine.startGame(s); at(s, 'valley-entry'); engine.interact(s); assert.equal(s.valleyGates.length, 0);
  const v = fresh(); at(v, 'valley-entry'); engine.interact(v); assert.ok(v.valleyGates.includes('valley-entry'));
  for (const [id, boss] of [['mill-sluice', 'drowned-warden'], ['monastery-sluice', 'silent-abbot']]) {
    at(v, id); engine.interact(v); assert.equal(v.collected.includes(id), false);
    clear(v, boss); at(v, 'river-door'); engine.interact(v); assert.equal(v.valleyGates.includes('river-door'), false);
    at(v, id); engine.interact(v); assert.ok(v.collected.includes(id));
  }
  at(v, 'river-door'); engine.interact(v); assert.ok(v.valleyGates.includes('river-door'));
  assert.ok(engine.loadGame(engine.saveGame(v)));
  for (const corrupt of [s => s.collected.splice(s.collected.indexOf('mill-sluice'), 1), s => s.chapterComplete = false, s => s.valleyComplete = true]) {
    const bad = structuredClone(v); corrupt(bad); assert.equal(engine.loadGame(engine.saveGame(bad)), null);
  }
});

test('return doors resist wrong-side interaction and jumps, and shorten genuine walking routes', () => {
  const length = p => p.slice(1).reduce((n, q, i) => n + Math.hypot(q.x - p[i].x, q.y - p[i].y, q.z - p[i].z), 0);
  for (const id of ['cliff-gate', 'reed-gate']) {
    const s = fresh(); s.valleyGates.push('valley-entry');
    const g = valley.VALLEY_GATES.find(g => g.id === id);
    place(s, { x: g.x, y: g.y, z: g.z + 1.1 }); engine.interact(s); assert.equal(s.valleyGates.includes(id), false);
    engine.stepGame(s, 400, { x: 0, z: -1, jump: true }); engine.stepGame(s, 800, { x: 0, z: -1 }); assert.ok(s.player.z > g.z);
    const origin = world.interactionPoint(world.LANDMARKS.find(l => l.id === id));
    const before = guide.findPath(origin, world.REST_POINTS['village-lamp'], s); assert.ok(before.length, id);
    at(s, id); engine.interact(s); assert.ok(s.valleyGates.includes(id));
    const after = guide.findPath(origin, world.REST_POINTS['village-lamp'], s); assert.ok(after.length);
    assert.ok(length(before) > length(after) * 2, `${id}: ${length(before)} -> ${length(after)}`);
    console.log(`${id}: ${length(before).toFixed(1)}m -> ${length(after).toFixed(1)}m`);
  }
});

test('ferries require repaired cable, reject combat, retain resources, enemies, checkpoint and reload at the landing', () => {
  const s = fresh(); s.valleyGates.push('valley-entry'); at(s, 'ferry-mill');
  const before = { x: s.player.x, z: s.player.z }; engine.interact(s); assert.equal(s.player.x, before.x);
  at(s, 'ferry-winch'); engine.interact(s); assert.equal(s.collected.includes('ferry-winch'), false);
  clear(s, 'drowned-warden'); engine.interact(s); assert.ok(s.collected.includes('ferry-winch'));
  s.player.hp = 67; s.player.flasks = 1;
  for (const id of ['ferry-mill', 'ferry-village-city', 'ferry-city', 'ferry-village-mill']) {
    at(s, id); const enemies = JSON.stringify(s.enemies); const checkpoint = s.checkpoint;
    engine.interact(s); assert.deepEqual({ x: s.player.x, y: s.player.y, z: s.player.z }, valley.FERRY_DESTINATIONS[id].position);
    assert.equal(s.player.hp, 67); assert.equal(s.player.flasks, 1); assert.equal(s.checkpoint, checkpoint); assert.equal(JSON.stringify(s.enemies), enemies);
    assert.ok(engine.loadGame(engine.saveGame(s)), id);
  }
  at(s, 'ferry-mill'); const e = s.enemies.find(e => e.id === 'mill-lancer'); Object.assign(e, { x: s.player.x - 2, y: s.player.y, z: s.player.z, aggro: true });
  const x = s.player.x; engine.interact(s); assert.equal(s.player.x, x); assert.match(s.message, /追兵/);
});

test('three new checkpoints survive combat death and preserve opened mechanisms and dead guardians', () => {
  for (const id of Object.keys(valley.VALLEY_REST_POINTS)) {
    const s = fresh(); s.valleyGates.push('valley-entry', 'cliff-gate', 'reed-gate'); clear(s, 'drowned-warden'); s.collected.push('mill-sluice', 'ferry-winch');
    at(s, id); engine.interact(s); assert.equal(s.checkpoint, id);
    const e = s.enemies.find(e => e.id === 'river-reaver'); place(s, { x: e.x, y: e.y, z: e.z + 1.5 });
    s.player.hp = 1; s.rice = 97; Object.assign(e, { action: 'windup', timer: .05, aggro: true, facing: 0 });
    engine.stepGame(s, 500); assert.equal(s.mode, 'dead'); const reload = engine.loadGame(engine.saveGame(s)); assert.ok(reload, id);
    engine.respawn(reload); assert.equal(reload.checkpoint, id); assert.equal(reload.player.hp, engine.maxHp(s)); assert.equal(reload.bloodstain.rice, 97);
    assert.deepEqual(reload.valleyGates, s.valleyGates); assert.equal(reload.enemies.find(e => e.id === 'drowned-warden').hp, 0);
  }
});

test('new bosses change phase and distinguish parryable delays from jumpable dangerous sweeps', () => {
  for (const id of valley.VALLEY_BOSSES) {
    const setup = () => {
      const s = fresh(); const e = s.enemies.find(e => e.id === id); place(s, { x: e.x, y: e.y, z: e.z + 2 }); s.player.facing = Math.PI;
      Object.assign(e, { hp: e.maxHp / 2 - 1, action: 'recover', timer: 2, aggro: true, facing: 0 });
      engine.stepGame(s, 20); assert.equal(e.phase, 2); Object.assign(e, { action: 'windup', timer: .12, attackIndex: 2 }); return { s, e };
    };
    const parry = setup(); const hp = parry.s.player.hp; engine.stepGame(parry.s, 400, { x: 0, z: 0, parry: true }); assert.ok(parry.s.player.hp < hp, id);
    const jump = setup(); engine.stepGame(jump.s, 400, { x: 0, z: 0, jump: true }); assert.equal(jump.s.player.hp, hp, id);
    jump.e.attackIndex = 1; const delay = engine.enemyAttack(jump.e); jump.e.attackIndex = 0; assert.ok(delay.windup > engine.enemyAttack(jump.e).windup + .8);
  }
});

test('river rewards stack with old upgrades once, and completion requires the final guardian', () => {
  const s = fresh(); s.valleyGates.push('valley-entry');
  for (const id of ['temple-flask', 'valley-flask', 'bamboo-dew']) { at(s, id); engine.interact(s); }
  assert.equal(engine.maxFlasks(s), 6); assert.equal(engine.healAmount(s), 110);
  const inventory = [...s.collected]; at(s, 'bamboo-dew'); engine.interact(s); assert.deepEqual(s.collected, inventory);
  at(s, 'river-heart'); engine.interact(s); assert.equal(s.valleyComplete, false);
  for (const id of valley.VALLEY_BOSSES) clear(s, id);
  s.collected.push('mill-sluice', 'monastery-sluice'); s.valleyGates.push('river-door');
  engine.interact(s); assert.equal(s.valleyComplete, true); assert.equal(s.mode, 'ending');
  const loaded = engine.loadGame(engine.saveGame(s)); assert.ok(loaded); engine.continueExploring(loaded); engine.interact(loaded);
  assert.equal(loaded.mode, 'playing'); assert.equal(loaded.collected.filter(id => id === 'river-heart').length, 1);
});

test('guidance follows reachable entry, either bank, living guardians, both mechanisms and the final lantern', () => {
  const s = fresh();
  const check = (id, origin) => {
    if (origin) place(s, origin);
    assert.equal(guide.mainTarget(s), id);
    const c = guide.createCompanion(s); assert.equal(guide.leadTo(c, s, id), true, id); assert.ok(c.path.length, id);
  };
  check('valley-entry', world.REST_POINTS['royal-lamp']);
  s.valleyGates.push('valley-entry'); check('village-lamp', { x: -118, y: 24, z: -268 });
  s.litLamps.push('village-lamp'); check('drowned-warden', world.REST_POINTS['village-lamp']);
  clear(s, 'drowned-warden'); check('mill-sluice', { x: -202, y: 2, z: -401 });
  s.collected.push('mill-sluice'); check('monastery-lamp', { x: -202, y: 8, z: -444 });
  s.litLamps.push('monastery-lamp'); check('silent-abbot', world.REST_POINTS['monastery-lamp']);
  clear(s, 'silent-abbot'); check('monastery-sluice');
  s.collected.push('monastery-sluice'); check('confluence-lamp');
  s.litLamps.push('confluence-lamp'); check('river-door', world.REST_POINTS['confluence-lamp']);
  s.valleyGates.push('river-door'); check('river-serpent');
  clear(s, 'river-serpent'); check('river-heart', { x: -150, y: 8, z: -508 });
  assert.equal(guide.guideTargets(engine.createGame()).some(l => valley.VALLEY_LANDMARKS.some(v => v.id === l.id)), false);
});

test('equipment can reach level fifteen and a capped upgrade never charges again', () => {
  const s = fresh(); s.rice = 10000;
  while (engine.upgrade(s)) { /* ordinary upgrade transaction */ }
  assert.equal(s.level, 15); const rice = s.rice; assert.equal(engine.upgrade(s), false); assert.equal(s.rice, rice);
  assert.ok(engine.loadGame(engine.saveGame(s)));
});

async function journey(route, name) {
  const s = fresh(); assert.equal(engine.travelToLamp(s, 'royal-lamp'), true);
  const stages = []; let distance = 0;
  for (const target of route) {
    const l = target.id ? world.LANDMARKS.find(l => l.id === target.id) : null;
    const dest = l ? world.interactionPoint(l) : target; const path = guide.findPath(s.player, dest, s);
    assert.ok(path.length, `${name}: missing route to ${JSON.stringify(target)}`);
    for (const [i, p] of path.slice(1).entries()) { distance += Math.hypot(p.x - path[i].x, p.y - path[i].y, p.z - path[i].z); walkTo(engine, s, p, 180000); }
    if (l) { engine.interact(s); assert.ok(s.collected.includes(l.id) || s.litLamps.includes(l.id) || s.valleyGates.includes(l.id) || l.kind === 'ferry', `${l.id}: ${s.message}`); }
    if (target.rest) engine.interact(s);
    if (target.upgrade) while (engine.upgrade(s)) { /* spend only earned money */ }
    assert.ok(engine.loadGame(engine.saveGame(s)), `${name}: save at ${target.id ?? target.capture}`);
    stages.push({ target: target.id ?? target.capture, position: { x: s.player.x, y: s.player.y, z: s.player.z }, hp: s.player.hp, time: s.time });
    console.log(`${name}: ${target.id ?? target.capture} ${Math.round(s.time)}s`);
  }
  assert.equal(s.valleyComplete, true); assert.equal(s.mode, 'ending');
  assert.ok(valley.VALLEY_BOSSES.every(id => s.defeatedGuests.includes(id)));
  fs.mkdirSync('tmp/night-rain-valley-rules', { recursive: true });
  fs.writeFileSync(`tmp/night-rain-valley-rules/${name}.json`, JSON.stringify({ stages, distance, state: s }, null, 2));
  return s;
}

test('west-first full chapter uses normal movement and combat, visits both old-city ferry directions and every new return', async () => {
  const s = await journey(VALLEY_ROUTE, 'west-first');
  assert.equal(s.valleyGates.length, 4); assert.equal(s.litLamps.length, 7); assert.ok(s.collected.includes('ferry-winch'));
  engine.continueExploring(s);
  const path = guide.findPath(s.player, world.LANDMARKS.find(l => l.id === 'chapter-bell'), s);
  assert.ok(path.length, 'walk back across the chapter boundary');
  for (const p of path.slice(1)) walkTo(engine, s, p, 180000);
  assert.equal(s.region, '长夜尽处'); assert.equal(s.valleyComplete, true); assert.ok(engine.loadGame(engine.saveGame(s)));
});

test('east-first route also completes both banks, with no progression order lock', async () => {
  await journey([...VALLEY_ENTRY_ROUTE, ...VALLEY_EAST_ROUTE, ...VALLEY_WEST_ROUTE, ...VALLEY_FINISH_ROUTE], 'east-first');
});
