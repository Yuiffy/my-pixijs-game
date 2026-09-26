import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';

const {
  createGame, getCluster, hasLegalMove, hasStrandedTreasure,
  canShuffleRemaining, shuffleRemaining, strike, getGrade,
} = await loadTypescriptModule(
  'src/components/brickExcavation/engine.ts',
);

function treasure(id, indices, points, x = 0, y = 0, width = 2, height = 2) {
  return {
    id,
    name: id,
    portrait: `/images/autochess/portraits/minimal/${id}.png`,
    x,
    y,
    width,
    height,
    mask: Array.from({ length: height }, () => '#'.repeat(width)),
    indices,
    points,
    revealed: 0,
    total: indices.length,
    found: false,
  };
}

function smallState(overrides = {}) {
  return {
    ...createGame(0),
    cols: 3,
    rows: 3,
    colors: 3,
    board: [0, 0, 1, 0, 1, 1, 2, 1, 0],
    treasures: [treasure('sui', [0, 1, 3, 4], 40)],
    movesLeft: 3,
    maxMoves: 3,
    ...overrides,
  };
}

test('seeded boards hide four or five nonoverlapping, connected silhouettes', () => {
  const silhouettes = new Set();
  for (let seed = 0; seed < 20; seed += 1) {
    const game = createGame(seed);
    assert.equal(game.cols, 10);
    assert.equal(game.rows, 10);
    assert.equal(game.colors, 4);
    assert.equal(game.board.length, 100);
    assert.equal(game.shufflesLeft, 2);
    assert.equal(game.maxShuffles, 2);
    assert.equal(game.treasures.length, 4 + (seed % 2));
    assert.equal(game.board.every((color) => color >= 0 && color < 4), true);
    assert.equal(game.treasures.every((item) => item.revealed === 0 && !item.found), true);
    const occupied = new Set();
    for (const item of game.treasures) {
      assert.ok(item.width >= 2 && item.width <= 4);
      assert.ok(item.height >= 2 && item.height <= 4);
      assert.ok(item.total >= 4 && item.total <= 12);
      assert.ok(item.total < item.width * item.height, `${item.id} is rectangular`);
      assert.equal(item.indices.length, item.total);
      assert.equal(item.mask.length, item.height);
      assert.ok(item.mask.every((row) => row.length === item.width && /^[.#]+$/.test(row)));
      silhouettes.add(item.mask.join('/'));
      assert.match(item.portrait, new RegExp(`${item.id}-excavation\\.png$`));
      const expected = [];
      for (let y = item.y; y < item.y + item.height; y += 1) {
        for (let x = item.x; x < item.x + item.width; x += 1) {
          const index = y * game.cols + x;
          assert.ok(!occupied.has(index), `overlapping footprint at ${index}`);
          occupied.add(index);
          if (item.mask[y - item.y][x - item.x] === '#') expected.push(index);
        }
      }
      assert.deepEqual(item.indices, expected);
      const connected = new Set([item.indices[0]]);
      for (const index of connected) {
        for (const next of [index - game.cols, index + game.cols, index - 1, index + 1]) {
          if (item.indices.includes(next) && Math.abs(index % game.cols - next % game.cols) <= 1) {
            connected.add(next);
          }
        }
      }
      assert.equal(connected.size, item.total, `${item.id} silhouette is disconnected`);
    }
    assert.equal(hasLegalMove(game.board, game.cols), true);
    assert.deepEqual(game, createGame(seed));
  }
  assert.ok(silhouettes.size >= 4);
  assert.notDeepEqual(createGame(0).board, createGame(1).board);
  assert.notDeepEqual(createGame(0).treasures, createGame(2).treasures);
  assert.throws(() => createGame(-1), RangeError);
});

test('a strike clears orthogonal clusters and advances each surviving neighbor once', () => {
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
    hitTargets: 3,
    discoveredIds: ['sui'],
    foundIds: [],
    scoreGained: 15,
  });
  assert.equal(next.treasures[0].revealed, 3);
  assert.equal(next.treasures[0].found, false);
  assert.equal(next.score, 15);
  assert.equal(next.movesLeft, 2);
  assert.deepEqual(initial.board, [0, 0, 1, 0, 1, 1, 2, 1, 0]);
  assert.equal(initial.treasures[0].revealed, 0);
});

test('finding two items in one refunded hit awards both bonuses exactly once', () => {
  const initial = smallState({
    cols: 4,
    rows: 5,
    board: [0, 0, 0, 0, 0, 0, 0, 0, null, null, null, null, 1, 1, 1, 1, 1, 1, 1, 1],
    treasures: [
      treasure('sui', [0, 1, 4, 5], 40),
      treasure('shiori', [2, 3, 6, 7], 60, 2),
      treasure('yua', [12, 13, 16, 17], 80, 0, 3),
    ],
    movesLeft: 1,
    maxMoves: 1,
    score: 25,
  });
  const next = strike(initial, 0);
  assert.equal(next.movesLeft, 1);
  assert.equal(next.status, 'playing');
  assert.equal(next.lastMove.refunded, true);
  assert.deepEqual(next.lastMove.foundIds, ['sui', 'shiori']);
  assert.equal(next.lastMove.scoreGained, 140);
  assert.equal(next.score, 165);
  assert.deepEqual(next.treasures.map((item) => item.found), [true, true, false]);
  const won = strike(next, 12);
  assert.equal(won.status, 'won');
  assert.equal(won.score, 285);
  assert.deepEqual(won.lastMove.foundIds, ['yua']);
  assert.equal(strike(won, 12), won);
});

test('last move can win at zero moves, or lose while retaining brick scores', () => {
  const initial = smallState({ movesLeft: 1, maxMoves: 1, score: 95 });
  const win = strike({
    ...initial,
    cols: 2,
    rows: 2,
    board: [0, 0, 0, 0],
    treasures: [treasure('sui', [0, 1, 2, 3], 40)],
  }, 0);
  assert.equal(win.movesLeft, 0);
  assert.equal(win.status, 'won');
  assert.equal(win.score, 155);
  assert.equal(getGrade(win), 'C');
  const loss = strike(initial, 0);
  assert.equal(loss.status, 'lost');
  assert.equal(loss.score, 110);
  assert.equal(loss.treasures[0].revealed, 3);
  assert.equal(strike(loss, 4), loss);
  assert.equal(getGrade(loss), null);
});

test('cleared cells and invalid indices are no-ops', () => {
  const first = strike(smallState(), 0);
  assert.equal(strike(first, 0), first);
  assert.equal(strike(first, -1), first);
  assert.equal(strike(first, 99), first);
  assert.deepEqual(getCluster(first.board, 0, 3), []);
});

test('a single isolated brick cannot be struck', () => {
  const state = smallState({
    cols: 2,
    rows: 2,
    board: [0, 0, 1, 2],
    treasures: [treasure('sui', [2, 3], 40)],
  });
  assert.deepEqual(getCluster(state.board, 2, state.cols), [2]);
  assert.equal(hasLegalMove(state.board, state.cols), true);
  assert.equal(strike(state, 2), state);
  assert.equal(state.turns, 0);
  assert.equal(state.lastMove, null);
});

test('a deadlocked color board stays playable until a limited shuffle restores a pair', () => {
  const state = smallState({
    cols: 2,
    rows: 2,
    board: [0, 0, 1, 2],
    treasures: [treasure('sui', [3], 40)],
  });
  const next = strike(state, 0);
  assert.deepEqual(next.board, [null, null, 2, 0]);
  assert.equal(hasLegalMove(next.board, next.cols), false);
  assert.equal(next.status, 'playing');
  assert.equal(next.movesLeft, 2);
  assert.equal(next.treasures[0].found, false);
  assert.equal(strike(next, 3), next);
  assert.equal(canShuffleRemaining(next), true);

  const refreshed = shuffleRemaining(next);
  assert.equal(refreshed.status, 'playing');
  assert.equal(refreshed.shufflesLeft, 1);
  assert.equal(refreshed.movesLeft, next.movesLeft);
  assert.equal(refreshed.turns, next.turns);
  assert.equal(refreshed.score, next.score);
  assert.equal(refreshed.lastMove, null);
  assert.deepEqual(refreshed.board.slice(0, 2), [null, null]);
  assert.deepEqual(getCluster(refreshed.board, 3, 2), [2, 3]);
  assert.equal(refreshed.treasures[0].revealed, 0);
  assert.deepEqual(next.board, [null, null, 2, 0]);
  assert.equal(strike(refreshed, 3).status, 'won');
});

test('shuffles are deterministic, undoable snapshots and cannot exceed their budget', () => {
  const state = createGame(42);
  const first = shuffleRemaining(state);
  assert.deepEqual(first, shuffleRemaining(state));
  assert.notDeepEqual(first.board, state.board);
  assert.deepEqual(first.treasures, state.treasures);
  assert.equal(first.shufflesLeft, 1);
  assert.equal(first.movesLeft, state.movesLeft);
  assert.equal(first.score, state.score);
  assert.equal(first.turns, state.turns);
  const second = shuffleRemaining(first);
  assert.equal(second.shufflesLeft, 0);
  assert.equal(canShuffleRemaining(second), false);
  assert.equal(shuffleRemaining(second), second);
  assert.equal(state.shufflesLeft, 2);
  assert.deepEqual(shuffleRemaining(state), first);
});

test('a deadlock with no shuffles left loses, and geometry-stranded treasure is unrescuable', () => {
  const exhausted = strike(smallState({
    cols: 2,
    rows: 2,
    board: [0, 0, 1, 2],
    treasures: [treasure('sui', [3], 40)],
    shufflesLeft: 0,
  }), 0);
  assert.equal(exhausted.status, 'lost');
  assert.equal(exhausted.movesLeft, 2);
  assert.equal(shuffleRemaining(exhausted), exhausted);

  const stranded = strike(smallState({
    board: [0, 0, 1, null, null, null, null, 2, 2],
    treasures: [treasure('sui', [2], 40)],
  }), 0);
  assert.equal(hasLegalMove(stranded.board, stranded.cols), true);
  assert.equal(hasStrandedTreasure(stranded), true);
  assert.equal(stranded.status, 'lost');
  assert.equal(canShuffleRemaining(stranded), false);
});

test('cutout cells do not count toward finding an irregular treasure', () => {
  const state = smallState({
    board: [0, 0, 2, 1, 0, 2, 2, 1, 1],
    treasures: [{ ...treasure('sui', [0, 1, 4], 40), mask: ['##', '.#'], total: 3 }],
  });
  const next = strike(state, 0);
  assert.equal(next.board[3], 2);
  assert.equal(next.treasures[0].revealed, 3);
  assert.equal(next.treasures[0].found, true);
  assert.deepEqual(next.lastMove.foundIds, ['sui']);
  assert.equal(next.lastMove.scoreGained, 55);
  assert.equal(next.status, 'won');
});

test('grade thresholds apply only to completed excavations', () => {
  const state = smallState({ status: 'won', maxMoves: 20 });
  assert.equal(getGrade({ ...state, movesLeft: 12 }), 'S');
  assert.equal(getGrade({ ...state, movesLeft: 7 }), 'A');
  assert.equal(getGrade({ ...state, movesLeft: 3 }), 'B');
  assert.equal(getGrade({ ...state, movesLeft: 2 }), 'C');
  assert.equal(getGrade({ ...state, status: 'playing' }), null);
});

test('many seeds have a legal largest-cluster route to every item', () => {
  for (let seed = 0; seed < 1000; seed += 1) {
    let state = createGame(seed);
    while (state.status === 'playing') {
      const visited = new Set();
      let bestIndex = -1;
      let bestSize = 1;
      for (let index = 0; index < state.board.length; index += 1) {
        if (state.board[index] === null || visited.has(index)) continue;
        const cluster = getCluster(state.board, index, state.cols);
        cluster.forEach((cell) => visited.add(cell));
        if (cluster.length > bestSize) {
          bestSize = cluster.length;
          bestIndex = index;
        }
      }
      assert.notEqual(bestIndex, -1, `seed ${seed} has no legal strike while playing`);
      state = strike(state, bestIndex);
    }
    assert.equal(state.status, 'won', `seed ${seed} should be completable`);
    assert.equal(state.treasures.every((item) => item.found), true);
    assert.ok(state.movesLeft >= 0);
  }
});
