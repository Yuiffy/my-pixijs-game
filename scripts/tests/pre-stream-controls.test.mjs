import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';

const { PrepHoldControls } = await loadTypescriptModule('src/components/preStreamGame/controls.ts');
const game = await loadTypescriptModule('src/components/preStreamGame/gameplay3d.ts');

function catGame() {
  const state = game.startPrepGame(game.createPrepGame(1, 2026));
  const cat = game.STATIONS.find(station => station.id === 'cat');
  return game.interactPrep({ ...state, player: { ...state.player, x: cat.x, z: cat.z } }, 'cat');
}

test('mixed keyboard and pointer holds finish exactly one pour on the final release', () => {
  const input = new PrepHoldControls();
  let state = catGame();
  input.press('key:Enter'); input.press('pointer:1'); input.press('key:Space');
  state = game.stepPrepGame(state, state.minigame.targetX * 1500, { x: 0, z: 0, primary: input.held });
  assert.equal(input.release('pointer:1'), false);
  assert.equal(input.release('key:Enter'), false);
  assert.equal(input.held, true);
  assert.equal(state.minigame.hits, 0);
  if (input.release('key:Space')) state = game.releaseCatPourPrep(state);
  assert.equal(state.minigame.hits, 1);
  assert.equal(input.release('key:Space'), false);
  assert.equal(input.release('pointer:1', true), false);
});

test('cancelled touch freezes its quantity without submitting a success or a miss', () => {
  const input = new PrepHoldControls(); let state = catGame();
  input.press('pointer:2');
  state = game.stepPrepGame(state, 180, { x: 0, z: 0, primary: input.held });
  const fill = state.minigame.fillLevel;
  assert.equal(input.release('pointer:2', true), false);
  state = game.stepPrepGame(state, 1000, { x: 0, z: 0, primary: input.held });
  assert.equal(state.minigame.fillLevel, fill);
  assert.equal(state.minigame.misses, 0); assert.equal(state.minigame.hits, 0);
  input.press('pointer:3');
  state = game.stepPrepGame(state, (state.minigame.targetX - fill) * 1500, { x: 0, z: 0, primary: input.held });
  if (input.release('pointer:3')) state = game.releaseCatPourPrep(state);
  assert.equal(state.minigame.hits, 1);
});

test('lost or unrelated releases cannot consume a different active hold', () => {
  const input = new PrepHoldControls();
  input.press('pointer:1'); input.press('pointer:2');
  assert.equal(input.release('key:Space'), false);
  assert.equal(input.release('pointer:1', true), false);
  assert.equal(input.held, true);
  assert.equal(input.release('pointer:2'), true);
});

test('pause cleanup rejects late releases and repeated keydown does not duplicate a hold', () => {
  const input = new PrepHoldControls();
  input.press('key:Enter'); input.press('key:Enter');
  assert.equal(input.release('key:Enter'), true);
  input.press('key:Space'); input.press('pointer:9'); input.clear();
  assert.equal(input.held, false);
  assert.equal(input.release('pointer:9'), false);
  assert.equal(input.release('key:Space'), false);
});
