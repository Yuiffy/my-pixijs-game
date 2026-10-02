import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';
const { nearestPlayable, navigatePlayable } = await loadTypescriptModule('src/components/brickExcavation/controls.ts');
const { createGame, getCluster, strike, shuffleRemaining, canShuffleRemaining } = await loadTypescriptModule('src/components/brickExcavation/engine.ts');
const sizes = board => board.board.map((_, index) => getCluster(board.board, index, board.cols).length);

test('keyboard navigation crosses gaps, skips singles and reaches every legal tile', () => {
  const cells = [2, 0, 1, 2, 0, 0, 0, 0, 3, 0, 3, 3];
  assert.equal(navigatePlayable(cells, 4, 0, 'ArrowLeft'), 11);
  assert.equal(navigatePlayable(cells, 4, 3, 'ArrowRight'), 8);
  assert.equal(navigatePlayable(cells, 4, 3, 'ArrowDown'), 11);
  assert.equal(navigatePlayable(cells, 4, 10, 'ArrowUp'), 3);
  assert.equal(navigatePlayable(cells, 4, 8, 'Home'), 0);
  assert.equal(navigatePlayable(cells, 4, 0, 'End'), 11);
  assert.equal(navigatePlayable(cells, 4, 0, 'Enter'), null);
  assert.equal(nearestPlayable(cells, 4, 6), 10);
  assert.equal(nearestPlayable([0, 1, 0], 3, 0), null);
  assert.equal(navigatePlayable([0, 1, 0], 3, 0, 'Home'), null);
});

test('focus remains legal throughout generated maps, strikes and shuffles', () => {
  for (let seed = 0; seed < 40; seed++) {
    let game = createGame(seed), focus = 0;
    while (game.status === 'playing') {
      const available = sizes(game), legal = available.flatMap((size, i) => size >= 2 ? [i] : []);
      const selected = nearestPlayable(available, game.cols, focus);
      if (selected === null) {
        assert.equal(legal.length, 0);
        if (!canShuffleRemaining(game)) break;
        game = shuffleRemaining(game); continue;
      }
      assert.ok(legal.includes(selected));
      const visited = new Set([selected]); let cursor = selected;
      for (let step = 1; step < legal.length; step++) {
        cursor = navigatePlayable(available, game.cols, cursor, 'ArrowRight'); visited.add(cursor);
      }
      assert.equal(visited.size, legal.length, `Unreachable tile in seed ${seed}`);
      focus = selected;
      const next = strike(game, selected);
      assert.notEqual(next, game);
      game = next;
    }
  }
});
