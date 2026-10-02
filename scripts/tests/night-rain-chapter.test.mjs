import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';
import { walkTo, playFirstLevel } from './helpers/night-rain-pilot.mjs';
import { CHAPTER_ROUTE } from './helpers/night-rain-chapter-pilot.mjs';

const engine = await loadTypescriptModule('src/components/nightRain/engine.ts');
const world = await loadTypescriptModule('src/components/nightRain/world.ts');
const guide = await loadTypescriptModule('src/components/nightRain/companion.ts');
const chapter = await loadTypescriptModule('src/components/nightRain/chapter.ts');
const fresh = () => { const s = engine.createGame(); engine.startGame(s); return s; };
const place = (s, p) => Object.assign(s.player, p, { lastGround: { x: p.x, y: p.y, z: p.z }, fallPeak: p.y, jumpHeight: 0, jumpVelocity: 0 });
const atLandmark = (s, id) => place(s, world.interactionPoint(world.LANDMARKS.find(l => l.id === id)));
const step = (s, ms, input = {}) => engine.stepGame(s, ms, { x: 0, z: 0, ...input });

test('all new encounters and lamp exits agree with visible floors and body collision', () => {
  const s = fresh();
  for (const e of chapter.CHAPTER_ENEMIES) {
    assert.ok(Math.abs(world.supportAt(e.x, e.z, e.y + .1) - e.y) < .001, e.id);
    assert.equal(world.playerBlocked(e.x, e.z, e.y, s), false, e.id);
  }
  for (const l of chapter.CHAPTER_LANDMARKS) {
    const p = world.interactionPoint(l);
    assert.ok(world.canOccupy(p.x, p.z, p.y, s), l.id);
  }
});

test('version four saves add the northern city without healing, respawning or losing possessions', () => {
  const s = fresh(); s.player.hp = 38; s.player.flasks = 1;
  s.enemies[0].hp = 0; s.enemies[0].action = 'dead';
  const raw = JSON.parse(engine.saveGame(s)); raw.worldVersion = 4; raw.enemies = raw.enemies.slice(0, 13); delete raw.chapterGates; delete raw.chapterComplete;
  const loaded = engine.loadGame(JSON.stringify(raw)); assert.ok(loaded);
  assert.deepEqual(loaded.player, s.player); assert.deepEqual(loaded.enemies.slice(0, 13), raw.enemies);
  assert.equal(loaded.worldVersion,7); assert.equal(loaded.enemies.length, world.ENEMY_SPAWNS.length);
  for (const corrupt of [s => s.chapterGates.push('archive-door'), s => s.chapterComplete = true, s => s.chapterGates.push('missing')]) { const bad = fresh(); corrupt(bad); assert.equal(engine.loadGame(engine.saveGame(bad)), null); }
});

test('northern checkpoints record the exact lamp; travel requires an encountered lamp and preserves resources', () => {
  const s = fresh();
  assert.equal(engine.travelToLamp(s, 'royal-lamp'), false);
  for (const id of ['courtyard', 'lower-lamp', 'archive-lamp', 'royal-lamp']) {
    Object.assign(s.player, world.REST_POINTS[id]); s.player.lastGround = { ...world.REST_POINTS[id] };
    engine.interact(s); assert.equal(s.checkpoint, id);
    assert.ok(engine.loadGame(engine.saveGame(s)), id);
  }
  s.player.hp = 41; s.player.flasks = 1; const enemies = JSON.stringify(s.enemies);
  assert.equal(engine.travelToLamp(s, 'lower-lamp'), true);
  assert.equal(s.player.hp, 41); assert.equal(s.player.flasks, 1); assert.equal(JSON.stringify(s.enemies), enemies);
  assert.equal(s.player.x, world.REST_POINTS['lower-lamp'].x);
  s.player.z += 5; assert.equal(engine.travelToLamp(s, 'royal-lamp'), false);
});

test('all four new return gates materially shorten the same legal walking journey', () => {
  const length = route => route.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - route[i].x, p.y - route[i].y, p.z - route[i].z), 0);
  const cases = [
    ['weaver-gate', { x: -50, y: 0, z: -81 }, world.REST_POINTS['lower-lamp']],
    ['cistern-gate', { x: -110, y: 0, z: -69 }, world.REST_POINTS['lower-lamp']],
    ['archive-gate', world.REST_POINTS['archive-lamp'], { x: -57, y: 12, z: -128 }],
    ['royal-gate', { x: -116, y: 12, z: -202 }, world.REST_POINTS['archive-lamp']],
  ];
  for (const [id, from, to] of cases) {
    const s = fresh(); s.chapterGates.push('archive-door');
    const closed = guide.findPath(from, to, s); assert.ok(closed.length, `${id}: closed route`);
    s.chapterGates.push(id); const open = guide.findPath(from, to, s); assert.ok(open.length, `${id}: open route`);
    const before = length(closed), after = length(open);
    assert.ok(before > after * 1.5, `${id}: ${before.toFixed(1)}m -> ${after.toFixed(1)}m`);
    console.log(`shortcut ${id}: ${before.toFixed(1)}m -> ${after.toFixed(1)}m`);
  }
});

test('both flask branches stack in either order, survive reload, and rest refills five without duplicate pickups', () => {
  for (const order of [['temple-flask', 'cistern-flask'], ['cistern-flask', 'temple-flask']]) {
    const s = fresh(); s.player.flasks = 0;
    for (const id of order) { atLandmark(s, id); engine.interact(s); }
    assert.equal(engine.maxFlasks(s), 5); assert.equal(s.player.flasks, 2);
    assert.match(s.interpretation, /5/);
    for (const id of order) { atLandmark(s, id); engine.interact(s); }
    assert.equal(s.player.flasks, 2); assert.equal(engine.maxFlasks(s), 5);
    const loaded = engine.loadGame(engine.saveGame(s)); assert.ok(loaded); assert.equal(engine.maxFlasks(loaded), 5);
    atLandmark(loaded, 'lower-lamp'); engine.interact(loaded); engine.interact(loaded);
    assert.equal(loaded.player.flasks, 5);
  }
});

test('return gates resist wrong-side walking and jumping; the archive requires the captain seal', () => {
  for (const gate of chapter.CHAPTER_GATES) {
    const s = fresh(); const l = world.LANDMARKS.find(l => l.id === gate.id);
    const axis = ['east', 'west'].includes(gate.side) ? 'x' : 'z';
    const allowed = ['east', 'south'].includes(gate.side) ? 1 : -1;
    place(s, { x: l.x, y: gate.y, z: l.z, [axis]: gate[axis] - allowed * 1.1 });
    engine.interact(s); assert.equal(s.chapterGates.includes(gate.id), false, gate.id);
    step(s, 400, { [axis]: allowed, jump: true }); step(s, 800, { [axis]: allowed });
    assert.ok((s.player[axis] - gate[axis]) * allowed < 0, `${gate.id}: crossed closed gate`);
    atLandmark(s, gate.id); engine.interact(s);
    if (gate.id === 'archive-door') {
      assert.equal(s.chapterGates.includes(gate.id), false); assert.match(s.interpretation, /象纹铜印/);
      s.defeatedGuests.push('gate-captain'); engine.interact(s);
    }
    assert.ok(s.chapterGates.includes(gate.id), `${gate.id}: allowed side`);
  }
});

test('each new lamp survives an actual combat death and respawns without closing gates or reviving cleared bosses', () => {
  for (const id of ['lower-lamp', 'archive-lamp', 'royal-lamp']) {
    const s = fresh(); atLandmark(s, id); engine.interact(s);
    s.chapterGates = chapter.CHAPTER_GATES.map(g => g.id);
    s.defeatedGuests = ['gate-captain', 'rain-regent'];
    for (const e of s.enemies.filter(e => s.defeatedGuests.includes(e.id))) { e.hp = 0; e.action = 'dead'; }
    s.rice = 81; s.player.hp = 1;
    const enemy = s.enemies.find(e => e.id === 'archive-lancer');
    place(s, { x: enemy.x, y: enemy.y, z: enemy.z + 2 });
    Object.assign(enemy, { action: 'windup', timer: .05, aggro: true, facing: 0 });
    step(s, 500); assert.equal(s.mode, 'dead', id); assert.equal(s.bloodstain.rice, 81);
    const loaded = engine.loadGame(engine.saveGame(s)); assert.ok(loaded, id);
    engine.respawn(loaded); assert.equal(loaded.mode, 'playing');
    assert.deepEqual({ x: loaded.player.x, y: loaded.player.y, z: loaded.player.z }, world.REST_POINTS[id]);
    assert.equal(loaded.chapterGates.length, 5); assert.equal(loaded.enemies.find(e => e.id === 'rain-regent').hp, 0);
    assert.equal(loaded.enemies.find(e => e.id === 'gate-captain').hp, 0);
    assert.equal(loaded.player.hp, engine.maxHp(loaded)); assert.equal(loaded.bloodstain.rice, 81);
  }
});

test('the rain regent enters phase two and its sweep punishes parry but permits a timed jump', () => {
  const setup = () => {
    const s = fresh(); const e = s.enemies.find(e => e.id === 'rain-regent');
    place(s, { x: e.x, y: e.y, z: e.z + 2 }); s.player.facing = Math.PI;
    Object.assign(e, { hp: e.maxHp / 2 - 1, action: 'recover', timer: 2, aggro: true, facing: 0 });
    step(s, 20); assert.equal(e.phase, 2);
    Object.assign(e, { action: 'windup', attackIndex: 2, timer: .12, hitDone: false }); return { s, e };
  };
  const parry = setup(); step(parry.s, 400, { parry: true }); assert.equal(parry.s.parries, 0); assert.ok(parry.s.player.hp < engine.maxHp(parry.s));
  const jump = setup(); step(jump.s, 400, { jump: true }); assert.equal(jump.s.player.hp, engine.maxHp(jump.s));
  jump.e.attackIndex = 1; const delayed = engine.enemyAttack(jump.e); jump.e.attackIndex = 0;
  assert.ok(delayed.windup > engine.enemyAttack(jump.e).windup + .8);
});

test('the final bell needs both the defeated regent and dinner, completes once, and preserves free exploration', () => {
  const s = fresh(); atLandmark(s, 'chapter-bell'); engine.interact(s); assert.equal(s.chapterComplete, false);
  const regent = s.enemies.find(e => e.id === 'rain-regent'); regent.hp = 0; regent.action = 'dead'; s.defeatedGuests.push(regent.id);
  engine.interact(s); assert.equal(s.chapterComplete, false); assert.match(s.interpretation, /夜市吃饭/);
  s.bossDefeated = true; const boss = s.enemies.find(e => e.kind === 'boss'); boss.hp = 0; boss.action = 'dead'; s.collected.push('food');
  engine.interact(s); assert.equal(s.chapterComplete, true); assert.equal(s.mode, 'ending');
  const loaded = engine.loadGame(engine.saveGame(s)); assert.ok(loaded);
  engine.continueExploring(loaded); engine.interact(loaded);
  assert.equal(loaded.mode, 'playing'); assert.equal(loaded.collected.filter(id => id === 'chapter-bell').length, 1);
});

test('the companion follows chapter milestones with reachable destinations instead of collected notes or locked doors', () => {
  const s = fresh(); s.collected = ['laptop', 'food']; s.checkpoint = 'courtyard'; s.litLamps = ['courtyard'];
  const check = (from, expected) => {
    place(s, from); assert.equal(guide.mainTarget(s), expected);
    const c = guide.createCompanion(s); assert.ok(guide.leadTo(c, s), expected); assert.equal(c.targetId, expected);
    assert.ok(c.path.length > 0, expected);
  };
  check({ x: -2.5, y: 0, z: -47 }, 'lower-lamp');
  s.litLamps.push('lower-lamp'); check(world.REST_POINTS['lower-lamp'], 'weaver-note');
  s.collected.push('weaver-note'); check({ x: -73, y: 6, z: -100 }, 'gate-captain');
  s.defeatedGuests.push('gate-captain'); check({ x: -57, y: 12, z: -128 }, 'archive-door');
  s.chapterGates.push('archive-door'); check({ x: -52, y: 12, z: -185.5 }, 'archive-lamp');
  s.litLamps.push('archive-lamp'); check(world.REST_POINTS['archive-lamp'], 'royal-lamp');
  s.litLamps.push('royal-lamp'); check(world.REST_POINTS['royal-lamp'], 'royal-note');
  s.collected.push('royal-note'); check({ x: -120, y: 24, z: -226 }, 'rain-regent');
  s.defeatedGuests.push('rain-regent'); check({ x: -133, y: 24, z: -248 }, 'chapter-bell');
});

test('whole first chapter completes using legal movement and combat, every new loop opens, and reload preserves the ending', () => {
  const s = fresh(); const { stages } = playFirstLevel(engine, s);
  engine.continueExploring(s); let walked = 0; const evidence = [];
  for (const target of CHAPTER_ROUTE) {
    const l = target.id ? world.LANDMARKS.find(l => l.id === target.id) : null;
    const p = l ? world.interactionPoint(l) : target;
    const path = guide.findPath(s.player, p, s);
    assert.ok(path.length, `No route to ${JSON.stringify(target)} from ${JSON.stringify(s.player)}`);
    for (const point of path.slice(1)) { const before = { ...s.player }; walkTo(engine, s, point, 180000); walked += Math.hypot(before.x - s.player.x, before.z - s.player.z); }
    if (l) engine.interact(s);
    if (target.rest) engine.interact(s);
    if (target.upgrade) while (engine.upgrade(s)) { /* spend legitimately earned money */ }
    assert.notEqual(s.mode, 'dead', target.id);
    assert.ok(engine.loadGame(engine.saveGame(s)), `Invalid save at ${JSON.stringify(target)}`);
    const row = { target: target.id ?? p, time: s.time, hp: s.player.hp, level: s.level, killed: s.kills };
    evidence.push(row); console.log(JSON.stringify(row));
  }
  assert.equal(s.chapterComplete, true); assert.equal(s.mode, 'ending');
  assert.equal(s.chapterGates.length, 5); assert.ok(s.defeatedGuests.includes('gate-captain')); assert.ok(s.defeatedGuests.includes('rain-regent'));
  assert.equal(engine.maxFlasks(s), 4); assert.equal(s.litLamps.length, 4);
  const restored = engine.loadGame(engine.saveGame(s)); assert.ok(restored.chapterComplete);
  engine.continueExploring(restored); engine.escapeStuck(restored); engine.interact(restored);
  assert.equal(restored.enemies.find(e => e.id === 'rain-regent').hp, 0);
  fs.mkdirSync('tmp/night-rain-chapter-rules', { recursive: true });
  fs.writeFileSync('tmp/night-rain-chapter-rules/report.json', JSON.stringify({ walked, time: s.time, stages, evidence, state: s }, null, 2));
});
