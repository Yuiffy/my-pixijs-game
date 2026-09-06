import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';

const { Sparring, MOVES, readProgress, freshProgress, DEFAULT_BINDINGS } = await loadTypescriptModule('src/components/oneMoreGame/core.ts');
const until = (game, predicate, limit = 30000) => {
  for (let ms = 0; !predicate(game.state) && ms < limit; ms += 10) game.advance(10);
  assert.ok(predicate(game.state), `Timed out: ${JSON.stringify(game.snapshot())}`);
};
const fight = () => { const game = new Sparring(); game.start(); return game; };
const impact = game => MOVES[game.state.boss.move].hits[game.state.boss.hitIndex];
const beforeImpact = (game, move, margin = 80) => until(game, s => s.boss.mode === 'windup' && s.boss.move === move && impact(game) - s.boss.clock <= margin);
const pilot = game => {
  for (let i = 0; i < 15000 && game.state.phase === 'fight'; i += 1) {
    const { boss: b, player: p, t } = game.state;
    const distance = b.x - p.x;
    const danger = b.mode === 'windup' && b.move === 'slam';
    const shouldParry = b.mode === 'windup' && !danger && impact(game) - b.clock < 100;
    game.input('guard', shouldParry);
    game.input('left', !danger && Math.abs(distance) > 190 && distance < 0);
    game.input('right', !danger && Math.abs(distance) > 190 && distance > 0);
    game.input('attack', b.mode === 'recover' && Math.abs(distance) < 225 && t - p.dashAt > 320);
    game.input('dodge', danger && impact(game) - b.clock < 170);
    game.advance(10);
  }
};

test('all three vows are achievable through the real input and update loop', () => {
  for (const vow of ['clear', 'combo', 'perfect']) {
    const game = new Sparring(); game.choose(vow); game.start(); pilot(game);
    assert.equal(game.state.phase, 'won');
    assert.equal(game.vowMet, true);
    assert.ok(game.progress.stamps.includes(`${vow}:standard`));
    assert.ok(game.state.stats.parries >= 3);
    assert.equal(game.state.stats.damage, 0);
    assert.equal(game.progress.wins, 1);
  }
});

test('holding guard blocks normal attacks, but cannot earn a perfect triple', () => {
  const game = fight();
  game.input('guard', true);
  until(game, s => s.boss.mode === 'recover' && s.boss.move === 'triple');
  assert.equal(game.state.player.hp, 5);
  assert.equal(game.state.stats.guards, 4);
  assert.equal(game.state.stats.parries, 0);
  assert.equal(game.state.stats.triple, false);
});

test('three separately timed presses count as one complete triple', () => {
  const game = fight();
  game.input('guard', true);
  until(game, s => s.boss.mode === 'windup' && s.boss.move === 'triple');
  game.input('guard', false);
  for (let hit = 0; hit < 3; hit += 1) {
    beforeImpact(game, 'triple'); game.input('guard', true); game.advance(120); game.input('guard', false);
  }
  assert.equal(game.state.stats.triple, true);
  assert.equal(game.state.stats.parries, 3);
});

test('slam defeats guard while a late dodge clears its locked area', () => {
  const guarded = fight(); guarded.input('guard', true); beforeImpact(guarded, 'slam');
  const target = guarded.state.boss.targetX;
  guarded.advance(180);
  assert.equal(guarded.state.player.hp, 4);
  assert.equal(guarded.state.boss.targetX, target);
  const dodged = fight(); dodged.input('guard', true); beforeImpact(dodged, 'slam', 160);
  dodged.input('guard', false); dodged.input('dodge', true); dodged.advance(220);
  assert.equal(dodged.state.player.hp, 5);
  assert.ok(dodged.state.stats.dodges >= 1);
});

test('pause freezes all combat, clears inputs, and resume does not catch up time', () => {
  const game = fight(); game.input('right', true); game.advance(300); game.pause('test');
  const snapshot = JSON.stringify(game.snapshot());
  game.advance(120000); game.input('attack', true);
  assert.equal(JSON.stringify(game.snapshot()), snapshot);
  assert.equal(game.held.size, 0);
  game.resume(); game.advance(100);
  assert.ok(game.state.t < 410);
});

test('failure, retry, save recovery and assist cannot falsify a vow', () => {
  const game = new Sparring(); game.choose('perfect');
  let save;
  game.onSave = data => { save = JSON.stringify(data); };
  game.start(); game.advance(30000);
  assert.equal(game.state.phase, 'lost'); assert.equal(game.vowMet, false);
  assert.equal(game.progress.stamps.length, 0);
  const restored = new Sparring(readProgress(save));
  assert.equal(restored.state.phase, 'ready'); assert.equal(restored.progress.attempts, 1);
  restored.setAssist(true); restored.start(); restored.setAssist(false);
  assert.equal(restored.progress.assist, true);
  assert.equal(restored.state.player.hp, 5); assert.equal(restored.state.boss.spirit, 100);
  assert.equal(restored.state.stats.damage, 0); assert.equal(restored.progress.attempts, 2);
  pilot(restored);
  assert.equal(restored.state.phase, 'won');
  assert.deepEqual(restored.progress.stamps, ['perfect:assist']);
});

test('30 and 120 fps cannot change an unattended fight result', () => {
  const a = fight(); const b = fight();
  for (let i = 0; i < 1800; i += 1) a.advance(1000 / 30);
  for (let i = 0; i < 7200; i += 1) b.advance(1000 / 120);
  assert.equal(a.state.phase, 'lost');
  assert.deepEqual(a.state.stats, b.state.stats);
  assert.equal(a.state.t, b.state.t);
});

test('invalid storage and off-stage input remain recoverable', () => {
  assert.deepEqual(readProgress('{broken'), freshProgress());
  const value = readProgress('{"version":1,"attempts":-4,"volume":8,"vow":"other","stamps":[null,"perfect:standard"]}');
  assert.equal(value.attempts, 0); assert.equal(value.volume, 1); assert.equal(value.vow, 'clear');
  assert.deepEqual(value.stamps, ['perfect:standard']);
  const game = new Sparring(); game.input('attack', true); game.advance(5000);
  assert.equal(game.state.phase, 'ready'); assert.equal(game.held.size, 0);
  game.start(); game.input('left', true); game.advance(2000);
  assert.ok(game.state.player.x >= 120);
});

test('parry freezes combat briefly while its visual clock continues, without a normal hit cue', () => {
  const game = fight(); beforeImpact(game, 'sweep'); game.input('guard', true);
  until(game, s => s.stats.parries === 1);
  const t = game.state.t;
  const bossClock = game.state.boss.clock;
  const feedbackT = game.state.feedbackT;
  const parry = game.state.events.find(event => event.cue === 'parry');
  assert.ok(game.state.hitStopRemaining > 0);
  assert.equal(game.state.events.some(event => event.cue === 'hit' && event.t === parry.t), false);
  game.advance(50);
  assert.equal(game.state.t, t); assert.equal(game.state.boss.clock, bossClock);
  assert.ok(game.state.feedbackT > feedbackT);
  game.advance(100); assert.ok(game.state.t > t);
});

test('old saves get controls and rebinding swaps duplicates without losing progress', () => {
  const progress = readProgress('{"version":1,"attempts":5,"wins":2}');
  assert.deepEqual(progress.bindings, DEFAULT_BINDINGS);
  const game = new Sparring(progress);
  game.setBinding('guard', 'KeyL'); game.setBinding('dodge', 'KeyL');
  assert.equal(game.progress.bindings.guard, 'Space');
  assert.equal(game.progress.bindings.dodge, 'KeyL');
  assert.equal(new Set(Object.values(game.progress.bindings)).size, 6);
  const restored = readProgress(JSON.stringify(game.progress));
  assert.deepEqual(restored.bindings, game.progress.bindings); assert.equal(restored.wins, 2);
  game.setBinding('guard', 'Invalid'); assert.equal(game.progress.bindings.guard, 'Space');
});
