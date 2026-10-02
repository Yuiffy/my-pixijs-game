import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';

const { SnackControls } = await loadTypescriptModule('src/components/miniGames/snackControls.ts');
const { createSnack, snackInput, advanceSnack } = await loadTypescriptModule('src/components/miniGames/snackEngine.ts');

test('releasing one finger or key preserves independently held controls', () => {
  const c = new SnackControls();
  c.press('key:KeyK', 'mute'); c.press('pointer:1', 'mute'); c.press('pointer:2', 'talk');
  c.release('pointer:1'); assert.equal(c.active('mute'), true);
  c.release('key:KeyK'); assert.equal(c.active('mute'), false);
  assert.equal(c.active('talk'), true);
  c.release('pointer:2'); assert.equal(c.active('talk'), false);
});

test('focused Enter and Space own separate holds and blur only releases button keys', () => {
  const c = new SnackControls();
  c.press('button:Enter', 'talk'); c.press('button:Space', 'talk');
  c.release('button:Enter'); assert.equal(c.active('talk'), true);
  c.press('key:Space', 'talk'); c.releaseButtons();
  assert.equal(c.active('talk'), true);
  c.release('key:Space'); assert.equal(c.active('talk'), false);
});

test('toggle ignores key repeat, remains on release, then switches off on fresh press', () => {
  const c = new SnackControls(); c.setMode('toggle');
  c.press('key:KeyK', 'mute'); c.press('key:KeyK', 'mute');
  assert.equal(c.active('mute'), true);
  c.release('key:KeyK'); assert.equal(c.active('mute'), true);
  c.press('key:KeyK', 'mute'); assert.equal(c.active('mute'), false);
});

test('pause/reset and changing mode clear every latched and held action', () => {
  const c = new SnackControls(); c.setMode('toggle');
  c.toggle('talk'); c.press('key:KeyK', 'mute'); c.press('pointer:1', 'eat');
  c.clear();
  for (const input of ['talk', 'eat', 'mute']) assert.equal(c.active(input), false);
  c.toggle('talk'); c.setMode('hold'); assert.equal(c.active('talk'), false);
});

test('eating stays one serving per fresh press in both control modes', () => {
  for (const mode of ['hold', 'toggle']) {
    const c = new SnackControls(); c.setMode(mode);
    const s = createSnack(); s.phase = 'playing';
    const apply = () => snackInput(s, 'eat', c.active('eat'));
    c.press('pointer:1', 'eat'); apply();
    advanceSnack(s, 1700); assert.equal(s.eaten, 1);
    c.press('pointer:1', 'eat'); apply(); advanceSnack(s, 1700);
    assert.equal(s.eaten, 1);
    c.release('pointer:1'); apply(); c.press('pointer:2', 'eat'); apply();
    advanceSnack(s, 1700); assert.equal(s.eaten, 2);
  }
});
