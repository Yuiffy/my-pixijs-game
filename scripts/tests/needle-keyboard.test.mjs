import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';

const e = await loadTypescriptModule('src/components/goldenNeedle/engine.ts');
for (const difficulty of ['gentle', 'normal', 'chaos']) {
  test(`${difficulty}: keyboard reaches every spot without granting progress or angle assistance`, () => {
    const s = e.createGame(difficulty), visited = new Set();
    e.selectKeyboardSpot(s, 'Home');
    for (let i = 0; i < s.spots.length; i++) {
      visited.add(s.keyboardSpot);
      assert.deepEqual(s.pointer, { x: s.spots[i].x, y: s.spots[i].y });
      assert.equal(s.angle, 0);
      e.selectKeyboardSpot(s, 'ArrowRight');
    }
    assert.equal(visited.size, s.spots.length);
    assert.equal(s.keyboardSpot, 0);
    assert.equal(e.completion(s), 0);
    assert.equal(s.score, 0);
    e.selectKeyboardSpot(s, 'ArrowLeft'); assert.equal(s.keyboardSpot, s.spots.length - 1);
    e.selectKeyboardSpot(s, 'Home');
    e.selectKeyboardSpot(s, 'ArrowDown'); assert.ok(s.pointer.y > s.spots[0].y);
    const lower = s.pointer.y;
    e.selectKeyboardSpot(s, 'ArrowUp'); assert.ok(s.pointer.y < lower);
  });
}

test('targeting cannot move an active stroke or bypass pause and relief curtain', () => {
  const s = e.createGame(); e.selectKeyboardSpot(s, 'Home');
  e.press(s); e.selectKeyboardSpot(s, 'End'); assert.equal(s.keyboardSpot, 0);
  e.advance(s, .65); e.release(s); assert.equal(s.spots[0].clean, 1);
  e.setPaused(s, true); e.selectKeyboardSpot(s, 'End'); assert.equal(s.keyboardSpot, 0);
  e.setPaused(s, false); e.activateRelief(s); e.selectKeyboardSpot(s, 'End'); assert.equal(s.keyboardSpot, 0);
  e.advance(s, 2.3); e.selectKeyboardSpot(s, 'End'); assert.equal(s.keyboardSpot, s.spots.length - 1);
});
