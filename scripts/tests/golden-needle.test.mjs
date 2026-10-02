import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';

const e = await loadTypescriptModule('src/components/goldenNeedle/engine.ts');
function at(s, p) { s.pointer = { x: p.x, y: p.y }; s.hand = { ...s.pointer }; }
function stroke(s, tool, seconds = 0.65) {
  e.selectTool(s, tool);
  for (const p of s.spots) { at(s, p); e.press(s); e.advance(s, seconds); e.release(s); }
}
function prepared(difficulty = 'gentle') {
  const s = e.createGame(difficulty);
  stroke(s, 'swab'); assert.equal(s.phase, 'numb');
  stroke(s, 'cream'); assert.equal(s.phase, 'wipe');
  stroke(s, 'swab'); assert.equal(s.phase, 'needle');
  return s;
}
function stamp(s, p, seconds) {
  e.selectTool(s, 'probe'); at(s, p); s.angle = p.angle;
  e.press(s); e.advance(s, seconds ?? (e.DIFFICULTIES[s.difficulty].window.reduce((a, b) => a + b) / 2)); e.release(s);
}
function chill(s, seconds = 2) { e.selectTool(s, 'ice'); at(s, { x: 380, y: 335 }); e.press(s); e.advance(s, seconds); e.release(s); }

for (const difficulty of ['gentle', 'normal', 'chaos']) {
  for (const relief of [false, true]) {
    test(`${difficulty}: real five-stage flow completes ${relief ? 'with' : 'without'} optional suppository`, () => {
      const s = prepared(difficulty);
      if (relief) { assert.equal(e.activateRelief(s), true); e.advance(s, 2.3); }
      for (const p of s.spots) {
        if (s.pain > 35 || s.heat > 40) chill(s);
        stamp(s, p);
        assert.equal(p.treated, true, `spot ${p.id}: ${s.message}`);
      }
      assert.equal(s.phase, 'cool');
      stroke(s, 'ice', 0.8);
      assert.equal(s.result, 'success');
      assert.equal(s.phase, 'result');
      assert.equal(s.reliefUsed, relief);
      assert.equal(s.mistakes, 0);
      assert.ok(s.score > 1600);
      assert.ok(e.grade(s).stars >= 2);
    });
  }
}

test('incorrect tool and hover alone cannot advance preparation', () => {
  const s = e.createGame(); at(s, s.spots[0]);
  e.advance(s, 10); assert.equal(e.completion(s), 0);
  stroke(s, 'probe'); assert.equal(s.phase, 'clean'); assert.equal(e.completion(s), 0);
});
test('early release is recoverable; late release adds pain and risk without coverage', () => {
  const s = prepared(); const p = s.spots[0];
  stamp(s, p, 0.2); assert.equal(p.treated, false); assert.equal(s.risk, 0);
  stamp(s, p, 1.2); assert.equal(p.treated, false); assert.ok(s.risk > 0); assert.equal(s.mistakes, 1);
  stamp(s, p); assert.equal(p.treated, true);
});
test('a treated point cannot score twice and repeated misuse reaches a stopped ending', () => {
  const s = prepared(); stamp(s, s.spots[0]); const earned = s.score;
  for (let i = 0; i < 12; i++) stamp(s, s.spots[0]);
  assert.equal(s.score, earned); assert.equal(s.result, 'stopped'); assert.equal(s.spots.filter(p => p.treated).length, 1);
  const stable = JSON.stringify(e.snapshot(s)); e.advance(s, 20); assert.equal(JSON.stringify(e.snapshot(s)), stable);
});
test('holding too long auto-lifts, moving away during pulse fails, wrong angle never starts pulse', () => {
  const s = prepared('normal'); const p = s.spots[0]; e.selectTool(s, 'probe'); at(s, p); s.angle = 35;
  e.press(s); assert.equal(s.pulse, null); e.release(s);
  s.angle = p.angle; e.press(s); s.pointer = { x: 600, y: 510 }; e.advance(s, 0.7); e.release(s);
  assert.equal(p.treated, false); assert.equal(s.mistakes, 1);
  at(s, p); e.press(s); e.advance(s, 2); assert.equal(s.pulse, null); assert.equal(s.down, false); assert.equal(s.mistakes, 2);
});
test('pause freezes everything, cancels an in-flight pulse, and resumes without firing', () => {
  const s = prepared(); e.selectTool(s, 'probe'); at(s, s.spots[0]); e.press(s); e.advance(s, 0.5);
  e.setPaused(s, true); const before = JSON.stringify(e.snapshot(s)); e.advance(s, 10); e.release(s);
  assert.equal(JSON.stringify(e.snapshot(s)), before); e.setPaused(s, false); e.advance(s, 1);
  assert.equal(s.spots[0].treated, false); assert.equal(s.mistakes, 0);
});
test('cooling works on the face only and hot probe refuses another pulse', () => {
  const s = prepared(); s.heat = 75; s.pain = 65; e.selectTool(s, 'probe'); at(s, s.spots[0]); e.press(s);
  assert.equal(s.pulse, null); e.release(s);
  e.selectTool(s, 'ice'); at(s, { x: 50, y: 50 }); e.press(s); e.advance(s, 1); e.release(s); assert.ok(s.pain > 60);
  chill(s); assert.ok(s.pain < 25); assert.equal(s.heat, 0);
});
test('suppository is optional, single-use, delayed, and actually reduces identical pulse pain', () => {
  const plain = prepared(); const relieved = prepared();
  assert.equal(e.activateRelief(relieved), true); assert.equal(e.activateRelief(relieved), false);
  e.selectTool(relieved, 'probe'); e.press(relieved); assert.equal(relieved.down, false);
  e.advance(relieved, 2.3); e.advance(plain, 2.3); plain.pain = 0; relieved.pain = 0;
  stamp(plain, plain.spots[0]); stamp(relieved, relieved.spots[0]);
  assert.ok(relieved.pain < plain.pain * 0.6); assert.ok(relieved.relief > 80);
  const fresh = e.createGame(); assert.equal(fresh.reliefUsed, false); assert.equal(fresh.relief, 0);
  fresh.phase = 'cool'; assert.equal(e.activateRelief(fresh), false);
});
test('pointer cancellation and changing tools safely abandon a pulse', () => {
  const s = prepared(); e.selectTool(s, 'probe'); at(s, s.spots[0]); e.press(s); e.advance(s, 0.5);
  e.cancelPress(s); e.advance(s, 2); assert.equal(s.pulse, null); assert.equal(s.spots[0].treated, false);
  e.press(s); e.advance(s, 0.6); e.selectTool(s, 'ice'); e.release(s); assert.equal(s.spots[0].treated, false); assert.equal(s.mistakes, 0);
});

test('free-order stamping sends feedback to the most recently treated point', () => {
  const s = prepared(); stamp(s, s.spots[11]); stamp(s, s.spots[0]);
  assert.equal(s.lastSpot, 0); assert.equal(s.combo, 2);
  assert.equal(s.spots.filter(p => p.treated).length, 2);
});
