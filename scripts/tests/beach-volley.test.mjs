import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';
const { createGame, startGame, prepareServe, skipTransition, finishSpecialCinematic, stepGame, emptyInput, aiInput,
  describeGame, CHARACTER_IDS, SPECIAL_WINDUP_TIME, STEP, FLOOR, NET_X, NET_TOP, BALL_RADIUS } = await loadTypescriptModule('src/components/beachVolley/engine.ts');
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
    const freeze = g.freeze; skipTransition(g); assert.equal(g.freeze, freeze, 'special presentation cannot be skipped');
    finishSpecialCinematic(g); advance(g, SPECIAL_WINDUP_TIME); shots.push(g.ball.vx);
  }
  assert.ok(shots[0] > shots[1] + 100);
});

function charged(side = 0, character = 'sui', options = {}) {
  const g = rally({ character: side === 0 ? character : 'sui', opponent: side === 1 ? character : 'shiori', ...options });
  const p = g.players[side];
  p.x = side === 0 ? 450 : 830; p.y = 378; p.energy = 100;
  g.ball = { x: p.x, y: 260, vx: 0, vy: 100, spin: 0, lastHit: 1 - side, lock: 0, power: null };
  const input = idle(); input[side] = { ...emptyInput(), special: true, aimDown: true };
  stepGame(g, input);
  assert.equal(g.specials[side], 1);
  return g;
}

test('all characters on either side must finish the presentation and full windup before launching once', () => {
  for (const side of [0, 1]) for (const character of CHARACTER_IDS) {
    const g = charged(side, character), held = { ...g.ball }, pending = { ...g.specialWindup };
    const position = { x: g.players[side].x, y: g.players[side].y };
    skipTransition(g); assert.equal(g.freeze, 0.75); assert.equal(g.cutin, side);
    advance(g, 0.4); assert.deepEqual(g.ball, held);
    assert.equal(g.specialWindup.remaining, SPECIAL_WINDUP_TIME, 'presentation does not consume reaction time');
    finishSpecialCinematic(g); skipTransition(g);
    const input = idle(); input[side] = { ...emptyInput(), left: true, jump: true, special: true, aimUp: true };
    advance(g, SPECIAL_WINDUP_TIME - STEP, input);
    assert.ok(g.specialWindup); assert.deepEqual(g.ball, held);
    assert.deepEqual({ x: g.players[side].x, y: g.players[side].y }, position);
    assert.equal(g.players[side].pose, 5, 'windup visibly transitions to the strike pose');
    stepGame(g, input); assert.equal(g.specialWindup, null);
    assert.equal(g.ball.vx, pending.vx); assert.equal(g.ball.vy, pending.vy);
    assert.deepEqual(g.ball.shot, { lift: 'down', depth: 'middle' }, 'committed aim cannot change');
    assert.equal(g.players[side].energy, 0); assert.equal(g.hits[side], 1); assert.equal(g.specials[side], 1);
    assert.equal(g.event.type, 'spike'); const launchEvent = g.event.id;
    stepGame(g, idle()); assert.notEqual(g.ball.x, held.x); assert.equal(g.event.id, launchEvent);
    assert.equal(g.specials[side], 1);
  }
});

test('defenders can move, jump or dive while the special ball and attacker stay held', () => {
  for (const side of [0, 1]) for (const action of ['move', 'jump', 'dive']) {
    const g = charged(side), defender = 1 - side, p = g.players[defender], x = p.x;
    finishSpecialCinematic(g); const ball = { ...g.ball };
    const input = idle(); input[defender][defender === 0 ? 'right' : 'left'] = true;
    if (action !== 'move') input[defender][action] = true;
    advance(g, 0.15, input);
    assert.ok(Math.abs(p.x - x) > 20, `${side}/${action} defender repositions`);
    if (action === 'jump') assert.ok(p.y < FLOOR - 80);
    if (action === 'dive') assert.ok(p.dive > 0 && p.cooldown > 0);
    assert.deepEqual(g.ball, ball); assert.ok(g.specialWindup.remaining > 0.6);
    assert.deepEqual(g.score, [0, 0]);
  }
});

test('pausing preserves the whole windup, while serve and restart discard pending attacks', () => {
  const g = charged(); finishSpecialCinematic(g); advance(g, 0.2);
  g.paused = true; const snapshot = JSON.stringify(g); advance(g, 4);
  assert.equal(JSON.stringify(g), snapshot);
  g.paused = false; advance(g, 0.2); assert.ok(g.specialWindup.remaining < 0.41);
  prepareServe(g); assert.equal(g.specialWindup, null); assert.equal(g.ball.power, null);
  advance(g, 0.8); assert.equal(g.phase, 'serve'); assert.equal(g.ball.vx, 0);
  const restarted = charged(); startGame(restarted);
  assert.equal(restarted.specialWindup, null); assert.equal(restarted.freeze, 0); assert.equal(restarted.cutin, null);
});

test('static special presentation expires naturally and leaves the same full reaction window', () => {
  const g = charged();
  for (let i = 0; i < 100 && g.freeze > 0; i++) { skipTransition(g); stepGame(g, idle()); }
  assert.equal(g.freeze, 0); assert.equal(g.cutin, null);
  assert.equal(g.specialWindup.remaining, SPECIAL_WINDUP_TIME); assert.equal(g.ball.vx, 0);
  advance(g, SPECIAL_WINDUP_TIME - STEP); assert.ok(g.specialWindup); stepGame(g, idle());
  assert.equal(g.specialWindup, null); assert.ok(g.ball.vx > 0);
});

test('AI repositions using the pending shot during preparation instead of waiting for launch', () => {
  const g = charged(0, 'sui', { mode: 'solo', difficulty: 'hard' });
  finishSpecialCinematic(g); const p = g.players[1], x = p.x;
  advance(g, 0.4);
  assert.ok(Math.abs(p.x - x) > 30); assert.ok(p.aiTarget > NET_X);
  assert.ok(g.specialWindup); assert.equal(g.ball.vx, 0);
});

test('a last-moment diving special receive holds the ball before the ground scoring check', () => {
  const g = rally(); const p = g.players[0]; p.energy = 100; p.x = 400;
  g.ball = { x: 402, y: FLOOR - BALL_RADIUS - 0.5, vx: 0, vy: 300, spin: 0, lastHit: 1, lock: 0, power: null };
  const input = idle(); input[0].dive = true; input[0].special = true;
  stepGame(g, input);
  assert.equal(g.specials[0], 1); assert.equal(g.phase, 'rally'); assert.deepEqual(g.score, [0, 0]);
  assert.ok(g.specialWindup); assert.equal(g.ball.vx, 0);
  finishSpecialCinematic(g); advance(g, SPECIAL_WINDUP_TIME + STEP);
  assert.equal(g.phase, 'rally'); assert.ok(g.ball.y < FLOOR - BALL_RADIUS);
});

test('reaction time allows the defender to reach and actually return a charged shot', () => {
  for (const side of [0, 1]) for (const character of CHARACTER_IDS) {
    const g = charged(side, character), defender = 1 - side, p = g.players[defender];
    p.x = defender === 0 ? 170 : 1110;
    finishSpecialCinematic(g); const x = p.x;
    for (let i = 0; i < SPECIAL_WINDUP_TIME / STEP; i++) {
      const input = idle(); const target = defender === 0 ? 370 : 910;
      input[defender][target > p.x ? 'right' : 'left'] = Math.abs(target - p.x) > 8;
      stepGame(g, input);
    }
    assert.ok(Math.abs(p.x - x) > 150); assert.equal(g.specialWindup, null);
    for (let i = 0; i < 360 && g.phase === 'rally' && g.hits[defender] === 0; i++) {
      stepGame(g, [aiInput(g, 0, STEP), aiInput(g, 1, STEP)]);
    }
    assert.ok(g.hits[defender] > 0, `${side}/${character}: defender receives the real launched ball`);
    assert.equal(g.ball.lastHit, defender); assert.equal(g.ball.power, null); assert.deepEqual(g.score, [0, 0]);
  }
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
