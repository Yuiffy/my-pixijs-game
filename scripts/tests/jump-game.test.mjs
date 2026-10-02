import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const module = { exports: {} };
const source = fs.readFileSync(new URL('../../src/components/jumpGame/engine.ts', import.meta.url), 'utf8');
Function('module', 'exports', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(module, module.exports);
const { createJump, emptyInput, stepJump, pauseJump, heightScore, readRecord } = module.exports;
const tick = (state, input = {}, frames = 1) => { for (let i = 0; i < frames; i++) stepJump(state, { ...emptyInput(), ...input }, 1 / 120); };
const playing = seed => { const s = createJump(seed); s.phase = 'playing'; return s; };

test('seeded routes repeat exactly; different routes differ', () => {
  assert.deepEqual(createJump(541), createJump(541));
  assert.notDeepEqual(createJump(541).platforms, createJump(542).platforms);
});
test('ordinary jumps climb 120 platforms for 80 seeds, without dash or teleportation', () => {
  for (let seed = 0; seed < 80; seed++) {
    const s = playing(seed);
    for (let floor = 1; floor <= 120; floor++) {
      const target = s.platforms.find(p => p.id === floor);
      assert.ok(target);
      tick(s, { jump: true });
      for (let n = 0; n < 170 && !s.grounded; n++) tick(s, { left: s.x > target.x + 2, right: s.x < target.x - 2 });
      assert.equal(s.phase, 'playing', `seed ${seed}, floor ${floor}`);
      assert.equal(s.floor, floor, `seed ${seed}, floor ${floor}`);
      assert.ok(s.platforms.length < 16, 'platform recycling remains bounded');
    }
    assert.ok(heightScore(s) > 1200);
  }
});
test('jump input is edge triggered; holding jump never auto-bounces', () => {
  const s = playing(3);
  s.platforms = [s.platforms[0], ...s.platforms.slice(1).map(p => ({ ...p, x: 80 }))];
  tick(s, { jump: true }, 300);
  assert.equal(s.grounded, true);
  assert.equal(s.y, 550);
  tick(s); tick(s, { jump: true }); assert.ok(s.vy < 0);
});
test('buffered jump triggers just after landing', () => {
  const s = playing(1); s.y = 546; s.vy = 150; s.grounded = false; s.coyote = 0;
  tick(s, { jump: true }, 5);
  assert.ok(s.vy < 0); assert.ok(s.y < 550);
});
test('coyote jump works just after leaving a platform but not in midair', () => {
  const s = playing(1); s.x = 602;
  tick(s, { right: true }, 4); assert.equal(s.grounded, false);
  tick(s, { jump: true }); assert.ok(s.vy < 0);
  tick(s, {}, 25); const velocity = s.vy;
  tick(s, { jump: true }); assert.ok(s.vy > velocity);
});
test('dash follows direction, hits world boundary, and requires cooldown plus a new press', () => {
  const s = playing(1);
  s.platforms[0].width = 800;
  tick(s, { right: true, dash: true }, 10);
  assert.ok(s.x > 470); assert.ok(s.cooldown > 0);
  tick(s, { right: true, dash: true }, 120);
  assert.equal(s.x, 778); assert.equal(s.dashTime, 0);
  assert.equal(s.cooldown, 0);
});
test('pause freezes motion, cooldown, score and generation until resumed', () => {
  const s = playing(1); tick(s, { jump: true, dash: true }, 5); pauseJump(s);
  const snapshot = structuredClone(s); tick(s, { left: true }, 500);
  assert.deepEqual(s, snapshot);
  s.phase = 'playing'; tick(s); assert.notEqual(s.y, snapshot.y);
});
test('camera never moves down; falling below it ends the run and freezes score', () => {
  const s = playing(1); tick(s, { jump: true }, 60); const camera = s.camera;
  tick(s, { right: true }, 360);
  assert.ok(s.camera <= camera); assert.equal(s.phase, 'over');
  const snapshot = structuredClone(s); tick(s, { jump: true }, 20); assert.deepEqual(s, snapshot);
});
test('invalid records cannot poison the HUD', () => {
  for (const raw of [null, '{', '{}', 'null', '{"height":-1,"floor":1,"runs":2}', '{"height":1e100,"floor":1,"runs":2}']) assert.deepEqual(readRecord(raw), { height: 0, floor: 0, runs: 0 });
  assert.deepEqual(readRecord('{"height":82,"floor":6,"runs":3}'), { height: 82, floor: 6, runs: 3 });
});
