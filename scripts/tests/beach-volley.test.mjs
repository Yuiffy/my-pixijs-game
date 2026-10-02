import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';
const { createGame, startGame, prepareServe, skipTransition, stepGame, emptyInput, aiInput,
  describeGame, STEP, FLOOR, NET_X, NET_TOP, BALL_RADIUS } = await loadTypescriptModule('src/components/beachVolley/engine.ts');
const idle = () => [emptyInput(), emptyInput()];
function advance(g, seconds, inputs = idle()) { for (let i = 0; i < Math.round(seconds / STEP); i++) stepGame(g, inputs, STEP); }
function rally(options = {}) { const g = createGame({ mode: 'local', ...options }); g.phase = 'rally'; g.ball.y = 60; g.ball.vy = -20; return g; }
function ground(g, side) { g.phase = 'rally'; g.ball.x = side === 0 ? 35 : 1245; g.ball.y = FLOOR - BALL_RADIUS - 1; g.ball.vy = 200; g.ball.vx = 0; stepGame(g, idle()); }

test('intro, skip, manual and timed serves have a complete state path', () => {
  const g = createGame(); assert.equal(g.phase, 'menu'); startGame(g); assert.equal(g.phase, 'intro');
  skipTransition(g); assert.equal(g.phase, 'serve');
  const inputs = idle(); inputs[0].hit = true; stepGame(g, inputs); assert.equal(g.phase, 'rally'); assert.ok(g.ball.vx > 0);
  g.server = 1; g.options.mode = 'local'; prepareServe(g); advance(g, 3.6); assert.equal(g.phase, 'rally'); assert.ok(g.ball.lastHit !== null);
});
test('movement stays on its half and a held jump never repeats in midair', () => {
  const g = rally(); const input = idle(); input[0].right = true; input[0].jump = true;
  advance(g, 0.3, input); assert.ok(g.players[0].y < FLOOR - 90); assert.ok(g.players[0].x > 330);
  g.ball.y = 50; g.ball.vy = -200; advance(g, 0.9, input);
  assert.ok(g.players[0].x <= NET_X - 57); assert.equal(g.players[0].y, FLOOR);
  g.phase = 'rally'; advance(g, 0.15, input); assert.equal(g.players[0].y, FLOOR);
});
test('dive travels farther and has a cooldown', () => {
  const g = rally(); const input = idle(); input[0].right = true; input[0].dive = true;
  advance(g, 0.15, input); assert.ok(g.players[0].x > 400); assert.ok(g.players[0].dive > 0);
  const cd = g.players[0].cooldown; input[0].dive = false; stepGame(g, input); input[0].dive = true; stepGame(g, input);
  assert.ok(g.players[0].cooldown < cd, 'repeat press cannot reset cooldown');
});
test('ordinary receiving returns the ball across the net and generates energy', () => {
  const g = rally(); g.players[0].x = 400; g.ball.x = 407; g.ball.y = 471; g.ball.vy = 100;
  stepGame(g, idle()); assert.equal(g.ball.lastHit, 0); assert.equal(g.hits[0], 1); assert.ok(g.players[0].energy > 36);
  let crossed = false;
  for (let i = 0; i < 240; i++) { stepGame(g, idle()); if (g.ball.x > NET_X && g.ball.y < NET_TOP) crossed = true; }
  assert.ok(crossed, 'receive arc clears net');
});
test('net side rebounds and net top bounces without tunnelling', () => {
  const g = rally(); g.ball.x = NET_X - 35; g.ball.y = 460; g.ball.vx = 980; g.ball.vy = 0;
  advance(g, 0.04); assert.ok(g.ball.x < NET_X); assert.ok(g.ball.vx < 0); assert.equal(g.event.type, 'net');
  g.ball.x = NET_X; g.ball.y = NET_TOP - BALL_RADIUS - 3; g.ball.vy = 700; g.ball.vx = 0;
  stepGame(g, idle()); assert.ok(g.ball.vy < 0); assert.ok(g.ball.y <= NET_TOP - BALL_RADIUS);
});
test('ball hitting each court awards exactly one point and transfers serve', () => {
  for (const side of [0, 1]) {
    const g = rally(); ground(g, side); assert.equal(g.phase, 'point'); assert.equal(g.score[1 - side], 1);
    assert.equal(g.server, 1 - side); advance(g, 1); assert.equal(g.score[1 - side], 1);
    skipTransition(g); assert.equal(g.phase, 'serve');
  }
});
test('win by two, sudden death cap, and practice without a match end', () => {
  const g = rally(); g.score = [6, 6]; ground(g, 1); skipTransition(g); assert.equal(g.phase, 'serve');
  ground(g, 1); skipTransition(g); assert.equal(g.phase, 'result'); assert.equal(g.winner, 0);
  const cap = rally(); cap.score = [10, 10]; ground(cap, 0); skipTransition(cap); assert.equal(cap.winner, 1);
  const practice = rally({ mode: 'practice' }); practice.score = [20, 0]; ground(practice, 1); skipTransition(practice); assert.equal(practice.phase, 'serve');
});
test('special only spends energy on contact; both characters have different trajectories', () => {
  const shots = [];
  for (const character of ['sui', 'shiori']) {
    const g = rally({ character }); const p = g.players[0]; p.energy = 100;
    const input = idle(); input[0].special = true; stepGame(g, input);
    assert.equal(p.energy, 100, 'arming is not spending');
    p.y = 430; g.ball.x = p.x; g.ball.y = 309; g.ball.vy = 100;
    stepGame(g, input); assert.equal(p.energy, 0); assert.equal(g.specials[0], 1); assert.equal(g.ball.power, character);
    assert.ok(g.freeze > 0); const frozenBall = { ...g.ball }; advance(g, 0.4); assert.deepEqual(g.ball, frozenBall);
    skipTransition(g); stepGame(g, idle()); shots.push(g.ball.vx);
  }
  assert.ok(shots[0] > shots[1] + 100);
});
test('paused state is completely frozen and resume continues the same rally', () => {
  const g = rally(); g.paused = true; const snapshot = JSON.stringify(g); advance(g, 3); assert.equal(JSON.stringify(g), snapshot);
  g.paused = false; advance(g, 0.2); assert.notEqual(g.ball.y, 60); assert.equal(g.phase, 'rally');
});
test('seeded stepping is deterministic and render state matches the engine', () => {
  const a = createGame({}, 733); const b = createGame({}, 733); startGame(a); startGame(b);
  for (let i = 0; i < 12000; i++) { stepGame(a, [aiInput(a, 0, STEP), emptyInput()]); stepGame(b, [aiInput(b, 0, STEP), emptyInput()]); }
  assert.deepEqual(describeGame(a), describeGame(b)); assert.deepEqual(describeGame(a).score, a.score);
});
test('all AI difficulties complete seeded matches with valid physical bounds', () => {
  const results = [];
  for (const difficulty of ['easy', 'normal', 'hard']) for (const seed of [173, 922, 6429, 12315]) {
    const g = createGame({ difficulty }, seed); startGame(g);
    for (let i = 0; i < 120 * 1200 && g.phase !== 'result'; i++) {
      stepGame(g, [aiInput(g, 0, STEP), emptyInput()]);
      assert.ok(Number.isFinite(g.ball.x + g.ball.y + g.ball.vx + g.ball.vy));
      assert.ok(g.players[0].x <= NET_X - 57 && g.players[1].x >= NET_X + 57);
      assert.ok(g.players.every(p => p.energy >= 0 && p.energy <= 100));
    }
    assert.equal(g.phase, 'result', `${difficulty}/${seed} should finish`);
    assert.ok(g.hits[0] + g.hits[1] > 10); results.push({ difficulty, seed, score: g.score, bestRally: g.bestRally, seconds: Math.round(g.time) });
  }
  console.log(JSON.stringify({ matches: results }));
});
