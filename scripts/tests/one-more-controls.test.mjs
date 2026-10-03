import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';
import { playFight } from './helpers/one-more-pilot.mjs';

const { Sparring } = await loadTypescriptModule('src/components/oneMoreGame/core.ts');
const fight = () => { const g = new Sparring(); g.start(); return g; };

test('releasing one of three physical sources keeps movement until the final release', () => {
  const g = fight();
  for (const source of ['keyboard:KeyD', 'keyboard:ArrowRight', 'pointer:7']) g.input('right', true, source);
  g.advance(80);
  g.releaseInput('keyboard:ArrowRight'); g.releaseInput('keyboard:ArrowRight');
  const x = g.state.player.x; g.advance(80); assert.ok(g.state.player.x > x);
  g.releaseInput('pointer:7'); assert.ok(g.held.has('right'));
  g.releaseInput('keyboard:KeyD'); const stopped = g.state.player.x;
  g.advance(80); assert.equal(g.state.player.x, stopped);
});

test('opposing directions cancel, releasing one preserves the other', () => {
  const g = fight(), x = g.state.player.x;
  g.input('left', true, 'left'); g.input('right', true, 'right');
  g.advance(80); assert.equal(g.state.player.x, x);
  g.releaseInput('left'); g.advance(80); assert.ok(g.state.player.x > x);
});

test('multiple guard sources do not reopen the parry window', () => {
  const g = fight(); g.input('guard', true, 'keyboard');
  const guardAt = g.state.player.guardAt;
  g.advance(300); g.input('guard', true, 'touch');
  assert.equal(g.state.player.guardAt, guardAt);
  g.releaseInput('keyboard'); assert.ok(g.snapshot().player.guarding);
  g.releaseInput('touch'); g.input('guard', true, 'fresh');
  assert.ok(g.state.player.guardAt > guardAt);
});

test('duplicate dodge presses and cancellation never spend stamina twice', () => {
  const g = fight(); g.input('dodge', true, 'keyboard');
  const stamina = g.state.player.stamina, dashAt = g.state.player.dashAt;
  g.input('dodge', true, 'keyboard'); g.input('dodge', true, 'touch');
  assert.equal(g.state.player.stamina, stamina);
  g.releaseInput('keyboard'); g.releaseInput('touch'); g.releaseInput('touch');
  assert.equal(g.state.player.dashAt, dashAt);
  g.advance(800); g.input('dodge', true, 'touch');
  assert.ok(g.state.player.dashAt > dashAt);
});

test('sources retain their original action and never depend on the release mapping', () => {
  const g = fight(); g.input('left', true, 'physical');
  g.input('right', true, 'physical'); assert.deepEqual([...g.held], ['left']);
  g.input('right', false, 'physical'); assert.equal(g.held.size, 0);
  g.input('attack', true); g.input('attack', false); assert.equal(g.held.size, 0);
});

test('pause, restore, ready and binding changes clear every source', () => {
  for (const reset of [g => { g.pause(); g.resume(); }, g => { g.ready(); g.start(); }, g => { g.restore(g.progress); g.start(); }, g => g.setBinding('left', 'KeyQ')]) {
    const g = fight(); g.input('right', true, 'keyboard'); g.input('guard', true, 'touch');
    reset(g); assert.equal(g.held.size, 0);
    g.releaseInput('touch'); g.input('right', true, 'keyboard');
    const x = g.state.player.x; g.advance(80); assert.ok(g.state.player.x > x);
    g.releaseInput('keyboard'); assert.equal(g.held.size, 0);
  }
});

test('full victory and defeat clear input ownership before the next attempt', () => {
  const win = fight(); playFight(win); assert.equal(win.state.phase, 'won');
  assert.equal(win.held.size, 0); win.nextBoss(); win.start();
  win.input('guard', true, 'direct:guard'); assert.ok(win.snapshot().player.guarding);
  const lose = fight(); lose.input('right', true, 'key'); lose.advance(120000);
  assert.equal(lose.state.phase, 'lost'); assert.equal(lose.held.size, 0);
  lose.start(); lose.input('right', true, 'key'); assert.ok(lose.held.has('right'));
});
