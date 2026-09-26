import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';

const { LEVELS, createGame, getCluster, strike, getGrade } = await loadTypescriptModule(
  'src/components/brickExcavation/engine.ts',
);

function smallState(overrides = {}) {
  return {
    ...createGame(0),
    cols: 3,
    rows: 3,
    colors: 3,
    board: [0, 0, 1, 0, 1, 1, 2, 1, 0],
    targetMask: [true, false, false, false, true, false, false, false, false],
    targetTotal: 2,
    remainingTargets: 2,
    movesLeft: 3,
    maxMoves: 3,
    ...overrides,
  };
}

test('levels have deterministic color boards and distinct streamer silhouettes', () => {
  assert.deepEqual(LEVELS.map(({ name }) => name), ['岁己', '栞栞', '悠亚']);
  for (const [index, level] of LEVELS.entries()) {
    assert.equal(level.mask.length, level.rows);
    assert.ok(level.mask.every((row) => row.length === level.cols && /^[.#]+$/.test(row)));
    assert.ok(level.mask.join('').split('#').length > 25);
    assert.match(level.portrait, new RegExp(`${level.id}\\.png$`));
    const game = createGame(index);
    assert.equal(game.board.length, 81);
    assert.equal(game.remainingTargets, game.targetTotal);
    assert.equal(game.board.every((color) => color >= 0 && color < game.colors), true);
    assert.deepEqual(game.board, createGame(index).board);
    assert.notDeepEqual(game.board, createGame(index, 1).board);
  }
  assert.equal(new Set(LEVELS.map((level) => level.mask.join(''))).size, LEVELS.length);
  assert.throws(() => createGame(-1), RangeError);
  assert.throws(() => createGame(0, -1), RangeError);
});

test('strike clears an orthogonal same-color cluster and shifts each surviving neighbor once', () => {
  const initial = smallState();
  assert.deepEqual(getCluster(initial.board, 0, 3), [0, 1, 3]);
  assert.deepEqual(getCluster(initial.board, 2, 3), [2, 4, 5, 7]);
  const next = strike(initial, 0);
  assert.deepEqual(next.board, [null, null, 2, null, 2, 1, 0, 1, 0]);
  assert.deepEqual(next.lastMove, {
    index: 0,
    cleared: [0, 1, 3],
    shifted: [2, 4, 6],
    refunded: false,
    hitTargets: 1,
  });
  assert.equal(next.remainingTargets, 1);
  assert.equal(next.movesLeft, 2);
  assert.equal(next.turns, 1);
  assert.deepEqual(initial.board, [0, 0, 1, 0, 1, 1, 2, 1, 0]);
});

test('six-tile cluster refunds the move; cleared and terminal tiles are inert', () => {
  const initial = smallState({
    board: [0, 0, 0, 0, 0, 0, 1, 1, 1],
    targetMask: [false, false, false, false, false, false, true, true, true],
    targetTotal: 3,
    remainingTargets: 3,
    movesLeft: 1,
    maxMoves: 1,
  });
  const next = strike(initial, 0);
  assert.equal(next.movesLeft, 1);
  assert.equal(next.status, 'playing');
  assert.equal(next.lastMove.refunded, true);
  assert.deepEqual(next.lastMove.shifted, [6, 7, 8]);
  assert.equal(strike(next, 0), next);
  assert.equal(strike(next, -1), next);
  assert.equal(strike(next, 99), next);
  const won = strike(next, 6);
  assert.equal(won.status, 'won');
  assert.equal(won.remainingTargets, 0);
  assert.equal(strike(won, 6), won);
});

test('last move can win at zero moves; otherwise the same limit loses', () => {
  const initial = smallState({ movesLeft: 1, maxMoves: 1 });
  const win = strike({ ...initial, targetMask: [true, false, false, false, false, false, false, false, false], targetTotal: 1, remainingTargets: 1 }, 0);
  assert.equal(win.movesLeft, 0);
  assert.equal(win.status, 'won');
  assert.equal(getGrade(win), 'C');
  const loss = strike(initial, 0);
  assert.equal(loss.status, 'lost');
  assert.equal(loss.remainingTargets, 1);
  assert.equal(getGrade(loss), null);
  assert.equal(strike(loss, 4), loss);
});

test('grade thresholds apply only after winning', () => {
  const state = smallState({ status: 'won', maxMoves: 20 });
  assert.equal(getGrade({ ...state, movesLeft: 12 }), 'S');
  assert.equal(getGrade({ ...state, movesLeft: 7 }), 'A');
  assert.equal(getGrade({ ...state, movesLeft: 3 }), 'B');
  assert.equal(getGrade({ ...state, movesLeft: 2 }), 'C');
  assert.equal(getGrade({ ...state, status: 'playing' }), null);
});

test('the opening boards have a playable route within their move budgets', () => {
  for (const levelIndex of LEVELS.keys()) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      let state = createGame(levelIndex, attempt);
      while (state.status === 'playing') {
        const visited = new Set();
        let bestIndex = -1;
        let bestScore = -Infinity;
        for (let index = 0; index < state.board.length; index += 1) {
          if (state.board[index] === null || visited.has(index)) continue;
          const cluster = getCluster(state.board, index, state.cols);
          cluster.forEach((cell) => visited.add(cell));
          const targets = cluster.filter((cell) => state.targetMask[cell]).length;
          const score = targets * 10 + cluster.length + (cluster.length >= 6 ? 8 : 0);
          if (score > bestScore) {
            bestScore = score;
            bestIndex = index;
          }
        }
        state = strike(state, bestIndex);
      }
      assert.equal(state.status, 'won', `${LEVELS[levelIndex].name} attempt ${attempt}`);
    }
  }
});
