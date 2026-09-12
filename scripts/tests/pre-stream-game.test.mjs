import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';

const engine = await loadTypescriptModule('src/components/preStreamGame/engine.ts');
const { TASK_IDS } = await loadTypescriptModule('src/components/preStreamGame/types.ts');
const { createGame, startGame, selectTask, stepGame, pressControl, releaseControl, setPointer, togglePause, goLive, getActivityView, getStars, formatTime, validateGame, emptyInput, LEVELS } = engine;
const held = (...keys) => Object.assign(emptyInput(), Object.fromEntries(keys.map(key => [key, true])));
const advance = (state, ms, input = emptyInput()) => {
  let result = state;
  for (let remaining = ms; remaining > 0; remaining -= Math.min(remaining, 20)) result = stepGame(result, Math.min(remaining, 20), input);
  return result;
};

// The pilot reads the same public view as the player and uses only legal controls.
function solveActivity(initial) {
  let state = initial;
  const id = state.activity.id;
  let steps = 0;
  while (state.phase === 'activity' && state.activity.id === id) {
    assert.ok(steps++ < 2500, `${id} should finish using visible controls`);
    assert.ok(validateGame(state), `${id}: every intermediate playable state can be saved`);
    const a = state.activity;
    const view = getActivityView(state);
    if (a.sequence.length && a.stage < a.sequence.length) {
      state = pressControl(state, a.sequence[a.stage]);
      state = advance(state, 100);
    } else if (id === 'water' && a.stage === 0 && a.progress >= 73) {
      state = releaseControl(state, 'primary');
    } else if (id === 'food') {
      if (a.cursor >= view.targetMin && a.cursor <= view.targetMax && a.holdMs === 0) state = pressControl(state, 'primary');
      state = advance(state, 20);
    } else if (id === 'obs') {
      state = pressControl(state, 'primary');
    } else if (['cat', 'vts', 'audio', 'catwalk'].includes(id)) {
      state = setPointer(state, a.target);
      state = advance(state, 20, held('primary'));
    } else {
      state = advance(state, 20, held('primary'));
    }
  }
  return state;
}

function solveNight(level, seed, tasks = TASK_IDS) {
  let state = startGame(createGame(level, seed));
  for (const id of tasks) {
    assert.equal(state.phase, 'room');
    state = advance(state, 250);
    state = selectTask(state, id);
    state = solveActivity(state);
    while (state.phase === 'activity') state = solveActivity(state);
  }
  const beforeCountdown = state.elapsedMs;
  state = goLive(state);
  assert.equal(state.phase, 'countdown');
  state = advance(state, 3200);
  assert.equal(state.phase, 'result');
  assert.equal(state.elapsedMs, beforeCountdown + 3000);
  return state;
}

test('all seven distinct preparations and seeded incidents are playable across all three nights', () => {
  const seen = new Set();
  for (let level = 1; level <= 3; level++) {
    for (const seed of [7, 81, 20260912, 4294967295]) {
      const state = solveNight(level, seed);
      assert.deepEqual(state.completed.map(item => item.id), [...TASK_IDS]);
      assert.equal(state.incidents.length, LEVELS[level - 1].incidentCount);
      state.incidents.forEach(id => seen.add(id));
      assert.equal(state.incidentQueue.length, 0);
      assert.ok(state.elapsedMs > 16000 && state.elapsedMs < 75000);
      assert.ok(state.completed.every(item => item.stars >= 1 && item.stars <= 3));
      assert.equal(getStars(state), 3);
      assert.ok(validateGame(state), 'legitimate completed nights must survive validation');
    }
  }
  assert.deepEqual([...seen].sort(), ['cable', 'catwalk', 'spill']);
});

test('identical seed and legal input produce identical nights; task order remains free', () => {
  assert.deepEqual(solveNight(3, 99), solveNight(3, 99));
  const reverse = [...TASK_IDS].reverse();
  const state = solveNight(2, 777, reverse);
  assert.deepEqual(state.completed.map(item => item.id), reverse);
  assert.notDeepEqual(createGame(3, 1).incidentQueue, createGame(3, 81).incidentQueue);
});

test('water underfill and overflow cost actual time and both recover', () => {
  let state = selectTask(startGame(createGame()), 'water');
  state = advance(state, 500, held('primary'));
  state = releaseControl(state, 'primary');
  assert.equal(state.activity.progress, 0);
  assert.equal(state.activity.misses, 1);
  assert.equal(state.elapsedMs, 500);
  state = advance(state, 4400, held('primary'));
  assert.equal(state.activity.misses, 2);
  assert.equal(state.elapsedMs, 4900);
  state = releaseControl(state, 'primary');
  state = solveActivity(state);
  assert.equal(state.completed.length, 1);
  assert.ok(state.completed[0].mistakes >= 2);
  assert.equal(state.completed[0].elapsedMs, state.elapsedMs);
});

test('wrong sequence retreats one step; toilet requires private held stage and OBS confirmation', () => {
  let state = selectTask(startGame(createGame(3, 6)), 'toilet');
  const first = state.activity.sequence[0];
  state = pressControl(state, first);
  assert.equal(state.activity.stage, 1);
  const wrong = ['left', 'right', 'up', 'down'].find(key => key !== state.activity.sequence[1]);
  state = pressControl(state, wrong);
  assert.equal(state.activity.stage, 0);
  assert.equal(state.activity.misses, 1);
  while (state.activity.stage < state.activity.sequence.length) state = pressControl(state, state.activity.sequence[state.activity.stage]);
  state = advance(state, 1000);
  assert.equal(state.activity.progress, 0, 'waiting alone cannot finish bathroom');
  state = solveActivity(state);
  state = selectTask(state, 'obs');
  while (state.activity.stage < state.activity.sequence.length) state = pressControl(state, state.activity.sequence[state.activity.stage]);
  state = advance(state, 1000, held('primary'));
  assert.equal(state.activity.id, 'obs', 'OBS explicitly needs a new confirmation press');
  state = pressControl(state, 'primary');
  assert.ok(state.completed.some(item => item.id === 'obs'));
});

test('food uses single timing taps, misses lose a serving and held primary never auto-fires', () => {
  let state = selectTask(startGame(createGame(1, 42)), 'food');
  state = advance(state, 1200, held('primary'));
  assert.equal(state.activity.hits, 0);
  while (state.activity.cursor >= getActivityView(state).targetMin && state.activity.cursor <= getActivityView(state).targetMax) state = advance(state, 20);
  state = pressControl(state, 'primary');
  assert.equal(state.activity.misses, 1);
  assert.equal(state.activity.hits, 0);
  const firstMiss = state.activity.misses;
  state = pressControl(state, 'primary');
  assert.equal(state.activity.misses, firstMiss, 'cooldown rejects duplicate press events');
  state = solveActivity(state);
  assert.equal(state.completed[0].id, 'food');
  assert.ok(state.completed[0].mistakes >= 1);
});

test('tracking and audio require correct aim plus held action and recover after misses', () => {
  for (const id of ['cat', 'audio', 'vts']) {
    let state = selectTask(startGame(createGame(3, 100)), id);
    state = setPointer(state, state.activity.target);
    state = advance(state, 100);
    assert.equal(state.activity.progress, 0, `${id}: aim alone cannot complete`);
    state = setPointer(state, 0);
    state = advance(state, 1400, held('primary'));
    assert.ok(state.activity.misses >= 2);
    assert.equal(state.activity.progress, 0);
    state = solveActivity(state);
    assert.equal(state.completed[0].id, id);
    assert.ok(state.completed[0].mistakes >= 2);
  }
});

test('keyboard adjustment, pointer clamps, and pause preserve fair elapsed time', () => {
  let state = selectTask(startGame(createGame()), 'audio');
  state = advance(state, 500, held('right'));
  assert.ok(Math.abs(state.activity.cursor - 32.5) < 1e-9);
  state = setPointer(state, 500);
  assert.equal(state.activity.cursor, 100);
  state = setPointer(state, -10);
  assert.equal(state.activity.cursor, 0);
  const elapsed = state.elapsedMs;
  state = togglePause(state);
  assert.equal(stepGame(state, 1000, held('primary')), state);
  assert.equal(pressControl(state, 'primary'), state);
  assert.equal(setPointer(state, 50), state);
  assert.equal(state.elapsedMs, elapsed);
  state = togglePause(state);
  state = advance(state, 500);
  assert.equal(state.elapsedMs, elapsed + 500);
});

test('room decisions and countdown count toward stars, results and title never advance', () => {
  const title = createGame();
  assert.equal(stepGame(title, 1000), title);
  let state = startGame(title);
  assert.equal(goLive(state), state, 'cannot go live without preparations');
  state = advance(state, 130000);
  assert.equal(getStars(state), 1);
  for (const id of TASK_IDS) {
    state = solveActivity(selectTask(state, id));
    while (state.phase === 'activity') state = solveActivity(state);
  }
  state = goLive(state);
  state = advance(state, 1000);
  assert.equal(state.countdownMs, 2000);
  state = togglePause(state);
  state = advance(state, 5000);
  assert.equal(state.countdownMs, 2000);
  state = togglePause(state);
  state = advance(state, 3000);
  assert.equal(state.phase, 'result');
  assert.equal(getStars(state), 1);
  assert.equal(stepGame(state, 1000), state);
});

test('valid saves resume paused in every activity; corrupt and contradictory saves are rejected', () => {
  let state = startGame(createGame(3, 31));
  assert.equal(validateGame(state).paused, true);
  for (const id of TASK_IDS) {
    state = selectTask(state, id);
    state = advance(state, 200);
    const restored = validateGame(JSON.parse(JSON.stringify(state)));
    assert.ok(restored, id);
    assert.equal(restored.paused, true);
    assert.equal(restored.activity.id, id);
    state = solveActivity(togglePause(restored));
    while (state.phase === 'activity') {
      assert.ok(validateGame(state), state.activity.id);
      state = solveActivity(state);
    }
  }
  state = goLive(state);
  assert.equal(validateGame(state).paused, true);
  state = advance(state, 3000);
  assert.equal(validateGame(state).paused, false);
  for (const invalid of [null, {}, [], { ...state, elapsedMs: Infinity }, { ...state, level: 0 }, { ...state, completed: [] }, { ...state, incidents: [] }, { ...state, phase: 'activity' }, { ...state, countdownMs: 99 }, { ...state, completed: [...state.completed, state.completed[0]] }]) assert.equal(validateGame(invalid), null);
  assert.equal(validateGame({ ...state, elapsedMs: 3000, completed: state.completed.map(item => ({ ...item, elapsedMs: 0, stars: 3 })) }), null, 'a fabricated instant completion is impossible');
  const corruptActivity = selectTask(startGame(createGame()), 'cat');
  corruptActivity.activity.cursor = NaN;
  assert.equal(validateGame(corruptActivity), null);
  const duplicateTask = { ...state, completed: state.completed.map((item, index) => ({ ...item, id: index === 1 ? state.completed[0].id : item.id })) };
  assert.equal(validateGame(duplicateTask), null);
});

test('finite input guards, bounded stepping, immutable previous state, and Chinese time format', () => {
  assert.equal(formatTime(301000), '5分钟01秒');
  assert.equal(formatTime(59999), '0分钟59秒');
  assert.equal(formatTime(-2), '0分钟00秒');
  assert.equal(formatTime(Infinity), '0分钟00秒');
  assert.equal(createGame(Infinity, NaN).level, 1);
  const room = startGame(createGame());
  assert.equal(stepGame(room, NaN), room);
  assert.equal(stepGame(room, -10), room);
  assert.equal(stepGame(room, 1000000).elapsedMs, 1000);
  assert.equal(selectTask(room, 'not-a-task'), room);
  const state = selectTask(room, 'water');
  const original = structuredClone(state);
  const next = advance(state, 1000, held('primary'));
  assert.deepEqual(state, original);
  assert.notEqual(next.activity.progress, state.activity.progress);
  assert.equal(pressControl(state, 'invalid'), state);
  assert.equal(setPointer(state, NaN), state);
  assert.equal(stepGame(room, 50, null).elapsedMs, 50);
});
