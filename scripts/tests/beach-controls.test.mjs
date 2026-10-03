import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';

const { createControls } = await loadTypescriptModule('src/components/beachVolley/controls.ts');
const { createGame, stepGame, STEP } = await loadTypescriptModule('src/components/beachVolley/engine.ts');

test('releasing one keyboard or pointer leaves every other physical hold intact', () => {
  for (const action of ['left', 'right', 'jump', 'hit', 'dive', 'special']) {
    const c = createControls();
    c.press('key:one', 0, action);
    c.press('key:two', 0, action);
    c.press('pointer:1', 0, action);
    c.press('pointer:2', 0, action);
    for (const source of ['key:two', 'pointer:1', 'key:one']) {
      c.release(source);
      assert.equal(c.inputs[0][action], true);
    }
    c.release('pointer:2');
    assert.equal(c.inputs[0][action], false);
  }
});

test('first binding owns a source, repeat and capture-loss releases are idempotent', () => {
  const c = createControls();
  c.press('pointer:1', 0, 'jump');
  c.press('pointer:1', 1, 'hit');
  assert.equal(c.inputs[1].hit, false);
  c.release('pointer:1');
  c.press('pointer:2', 0, 'jump');
  c.release('pointer:1');
  assert.equal(c.inputs[0].jump, true);
});

test('local players and opposite directions remain independent', () => {
  const c = createControls();
  c.press('key:A', 0, 'left');
  c.press('key:D', 0, 'right');
  c.press('key:Left', 1, 'left');
  c.release('key:A');
  assert.equal(c.inputs[0].left, false);
  assert.equal(c.inputs[0].right, true);
  assert.equal(c.inputs[1].left, true);
});

test('cancel clears holds and late releases cannot clear a new source', () => {
  const c = createControls();
  c.press('key:D', 0, 'right');
  c.press('pointer:1', 1, 'special');
  c.clear();
  assert.equal(c.inputs.flatMap(Object.values).some(Boolean), false);
  c.press('pointer:2', 0, 'right');
  c.release('key:D');
  assert.equal(c.inputs[0].right, true);
});

test('movement continues after an alias releases and stops after the last release', () => {
  const c = createControls();
  const g = createGame({ mode: 'local' });
  g.phase = 'rally';
  g.ball.y = 40;
  g.ball.vy = -100;
  const advance = n => { for (let i = 0; i < n; i++) stepGame(g, c.inputs, STEP); };
  c.press('key:D', 0, 'right');
  c.press('key:ArrowRight', 0, 'right');
  advance(10);
  const x = g.players[0].x;
  c.release('key:ArrowRight');
  advance(24);
  assert.ok(g.players[0].x > x + 50);
  c.release('key:D');
  advance(30);
  const stopped = g.players[0].x;
  advance(15);
  assert.ok(Math.abs(g.players[0].x - stopped) < 0.1);
});
