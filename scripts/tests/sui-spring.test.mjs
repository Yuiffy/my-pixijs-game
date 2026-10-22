import test from 'node:test';
import assert from 'node:assert/strict';
import model from '../lib/sui-spring-model.cjs';
import runner from '../simulate-sui-spring.cjs';
import fs from 'node:fs';

const { LEVELS, ENEMIES, GROUND, PHYSICS, createGame, freshSave, readSave, startLevel, emptyInput, stepGame, respawn, platformPosition } = model;
const tick = (s, input = {}, frames = 1) => { for (let i = 0; i < frames; i++) stepGame(s, { ...emptyInput(), ...input }); };
const playing = (level = 0) => { const save = freshSave(); save.unlocked = 3; const s = createGame(save); startLevel(s, level); return s; };
test('short taps and held jumps have substantially different apices', () => {
  const tap = playing(); const held = playing(); let low = 412; let high = 412;
  for (let i = 0; i < 100; i++) { tick(tap, { jump: i < 7 }); tick(held, { jump: i < 65 }); low = Math.min(low, tap.player.y); high = Math.min(high, held.player.y); }
  assert.ok(high < low - 55, `${high} vs ${low}`); assert.ok(high > 265 && high < 290);
  assert.equal(tap.player.grounded, true); assert.equal(held.player.grounded, true);
});
test('running, inertia, friction, air steering, and fixed time steps', () => {
  const s = playing(); tick(s, { right: true }, 50); assert.equal(s.player.vx, PHYSICS.walk);
  tick(s, { right: true, run: true }, 30); assert.equal(s.player.vx, PHYSICS.run);
  tick(s, { right: true }); assert.ok(s.player.vx > PHYSICS.walk && s.player.vx < PHYSICS.run, 'releasing run eases speed down instead of snapping');
  tick(s); assert.ok(s.player.vx > 0 && s.player.vx < PHYSICS.run);
  tick(s, {}, 40); assert.equal(s.player.vx, 0);
  tick(s, { right: true, run: true, jump: true }, 20); assert.ok(s.player.vx > 0);
  tick(s, { left: true, run: true, jump: true }, 30); assert.ok(s.player.vx < 0); assert.equal(s.player.grounded, false);
});
test('coyote window permits leaving a ledge but does not permit a double jump', () => {
  const s = playing(); s.player.x = 1445; s.player.vx = 235;
  tick(s, { right: true }, 5); assert.equal(s.player.grounded, false);
  tick(s, { jump: true }); assert.ok(s.player.vy < -550);
  tick(s, {}, 10); const previous = s.player.vy; tick(s, { jump: true }); assert.ok(s.player.vy > previous);
});
test('landing buffer triggers immediately and holding jump does not auto bounce', () => {
  const s = playing(); s.player.y = 402; s.player.vy = 180; s.player.grounded = false; s.player.coyote = 0;
  tick(s, { jump: true }, 12); assert.ok(s.player.vy < -450);
  tick(s, { jump: true }, 160); assert.equal(s.player.grounded, true);
});
test('stomping a walker bounces; side collision hurts once during protection', () => {
  const s = playing(); const e = s.enemies[0]; s.player.x = e.x; s.player.y = e.y - 48; s.player.vy = 210; s.player.grounded = false; s.player.coyote = 0;
  tick(s, { jump: true }, 8); assert.equal(e.alive, false); assert.ok(s.player.vy < 0); assert.ok(s.save.discovered.includes('walker'));
  const t = playing(); t.player.x = t.enemies[0].x; tick(t); assert.equal(t.player.health, 2); tick(t, {}, 15); assert.equal(t.player.health, 2);
});
test('shell shrinks, can be kicked, stops on another stomp and kills other foes', () => {
  const s = playing(); const e = s.enemies.find(v => v.kind === 'shell');
  s.player.x = e.x; s.player.y = e.y - 48; s.player.vy = 220; s.player.grounded = false; s.player.coyote = 0;
  tick(s, {}, 8); assert.equal(e.shell, true); assert.equal(e.h, 24);
  e.stun = 0; s.player.x = e.x - 20; s.player.y = e.y; s.player.vy = 0; tick(s); assert.ok(e.vx > 300);
  const other = s.enemies.find(v => v.kind === 'walker'); other.x = e.x + 50; other.y = e.y - 16; other.left = e.x; other.right = e.x + 100;
  s.player.x = e.x - 80; tick(s, {}, 20); assert.equal(other.alive, false);
});
test('archer and mortar telegraph and produce different real projectiles', () => {
  for (const [level, kind, type] of [[1, 'archer', 'arrow'], [2, 'mortar', 'bomb']]) {
    const s = playing(level); const e = s.enemies.find(v => v.kind === kind); s.player.x = e.x - 260; e.timer = 0.5;
    tick(s, {}, 70); assert.ok(s.projectiles.some(v => v.type === type));
    assert.ok(s.save.discovered.includes(kind));
  }
});
test('checkpoints refill health; falling retries quickly without losing banked stars', () => {
  const s = playing(); s.player.x = 1802; s.player.health = 1; s.stars.push('star-0'); s.collected.push('star-0'); tick(s);
  assert.equal(s.checkpoint, 1800); assert.equal(s.player.health, 3);
  s.stars.push('star-1'); s.collected.push('star-1'); s.player.y = 650; tick(s); assert.equal(s.phase, 'dead');
  tick(s, {}, 85); assert.equal(s.phase, 'playing'); assert.deepEqual(s.stars, ['star-0']); assert.equal(s.deaths, 1); assert.ok(s.player.invincible > 0);
});
test('moving platforms carry riders and crumble platforms fall then restore', () => {
  const s = playing(1); const index = LEVELS[1].platforms.findIndex(v => v.kind === 'moving'); const p = platformPosition(LEVELS[1].platforms[index], 0);
  s.player.x = p.x + 40; s.player.y = p.y - 44; const before = s.player.x; tick(s, {}, 40); assert.ok(s.player.x > before + 5); assert.equal(s.player.grounded, true);
  const t = playing(2); const i = LEVELS[2].platforms.findIndex(v => v.kind === 'crumble'); const c = LEVELS[2].platforms[i]; t.player.x = c.x + 20; t.player.y = c.y - 44;
  tick(t, {}, 80); assert.equal(t.player.grounded, false); assert.ok(t.crumble[i] > 0.6);
  respawn(t); assert.deepEqual(t.crumble, {});
});
test('boss takes exactly three separated stomps and gates the finish', () => {
  const s = playing(3); const boss = s.enemies.find(v => v.kind === 'director');
  s.player.x = LEVELS[3].goal + 1; tick(s); assert.equal(s.phase, 'playing');
  for (let i = 0; i < 3; i++) { boss.stun = 0; boss.timer = 2; s.player.x = boss.x + 10; s.player.y = boss.y - 48; s.player.vy = 220; s.player.grounded = false; s.player.coyote = 0; s.player.jumpHeld = true; tick(s, { jump: true }, 8); assert.equal(boss.hp, 2 - i); }
  assert.equal(boss.alive, false); s.player.x = LEVELS[3].goal + 2; tick(s); assert.equal(s.phase, 'clear'); assert.equal(s.save.best[3].coins, 20);
});
test('pause and title freeze all simulation, locked levels cannot be started', () => {
  const s = createGame(); startLevel(s, 2); assert.equal(s.phase, 'title');
  startLevel(s, 0); tick(s, { right: true, jump: true }, 10); s.phase = 'paused'; const copy = structuredClone(s); tick(s, { right: true }, 300); assert.deepEqual(s, copy);
});
test('all authored levels have three unique stars, fair ground checkpoints, distinct threats, and real assets', () => {
  for (const e of Object.values(ENEMIES)) assert.ok(fs.existsSync(`public/images/autochess/portraits/minimal/${e.art}.png`));
  for (const l of LEVELS) {
    assert.equal(l.pickups.filter(p => p.kind === 'star').length, 3); assert.equal(new Set(l.pickups.map(p => p.id)).size, l.pickups.length);
    for (const x of l.checkpoints) assert.ok(l.platforms.some(p => p.kind === 'grass' && p.x <= x && p.x + p.w > x + 26 && p.y === GROUND));
    assert.ok(l.goal < l.width - 100); assert.ok(l.enemies.every(e => e.kind in ENEMIES));
  }
});
test('all four full levels can be cleared with all twelve stars by actual inputs and no state edits or invulnerability', () => {
  for (let i = 0; i < 4; i++) {
    const run = runner.simulate(i, 9000, true);
    assert.equal(run.phase, 'clear', `1-${i + 1} stopped at ${run.x}`);
    assert.equal(run.deaths, 0); assert.equal(run.stars.length, 3);
  }
});
test('save loading sanitizes invalid state and clear unlocks the next level', () => {
  for (const raw of [null, '{', 'null', '5', '[]']) assert.ok(readSave(raw).unlocked >= 0);
  assert.equal(readSave('{"unlocked":999,"discovered":["walker","walker","fake"],"best":[]}').unlocked, 3);
  assert.deepEqual(readSave('{"discovered":["walker","walker","fake"]}').discovered, ['walker']);
  const s = playing(); s.player.x = LEVELS[0].goal + 1; s.stars = ['star-1']; tick(s); assert.equal(s.phase, 'clear'); assert.ok(s.save.unlocked >= 1); assert.deepEqual(readSave(JSON.stringify(s.save)).best[0].stars, ['star-1']);
});
