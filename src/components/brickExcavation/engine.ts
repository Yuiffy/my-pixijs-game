export type GameStatus = 'playing' | 'won' | 'lost';
export type Grade = 'S' | 'A' | 'B' | 'C';

export interface LevelDefinition {
  id: string;
  name: string;
  portrait: string;
  cols: 9;
  rows: 9;
  colors: 3 | 4;
  moves: number;
  mask: readonly string[];
}

export interface LastMove {
  index: number;
  cleared: number[];
  shifted: number[];
  refunded: boolean;
  hitTargets: number;
}

export interface GameState {
  levelIndex: number;
  attempt: number;
  cols: number;
  rows: number;
  colors: number;
  board: (number | null)[];
  targetMask: boolean[];
  targetTotal: number;
  remainingTargets: number;
  movesLeft: number;
  maxMoves: number;
  turns: number;
  status: GameStatus;
  lastMove: LastMove | null;
}

const SIZE = 9;
const REFUND_SIZE = 6;

export const LEVELS: readonly LevelDefinition[] = [
  {
    id: 'sui',
    name: '岁己',
    portrait: '/images/autochess/portraits/minimal/sui.png',
    cols: SIZE,
    rows: SIZE,
    colors: 3,
    moves: 15,
    mask: [
      '.........',
      '.######..',
      '.#######.',
      '.#######.',
      '..######.',
      '..######.',
      '..#####..',
      '...####..',
      '.........',
    ],
  },
  {
    id: 'shiori',
    name: '栞栞',
    portrait: '/images/autochess/portraits/minimal/shiori.png',
    cols: SIZE,
    rows: SIZE,
    colors: 4,
    moves: 18,
    mask: [
      '.........',
      '..#####..',
      '.#######.',
      '.#######.',
      '.######..',
      '.######..',
      '.#####...',
      '.#####...',
      '.........',
    ],
  },
  {
    id: 'yua',
    name: '悠亚',
    portrait: '/images/autochess/portraits/minimal/yua.png',
    cols: SIZE,
    rows: SIZE,
    colors: 4,
    moves: 13,
    mask: [
      '.........',
      '...###...',
      '...####..',
      '.######..',
      '.#######.',
      '.######..',
      '..####...',
      '..####...',
      '.........',
    ],
  },
];

function seedFrom(id: string, attempt: number): number {
  let hash = 5381;
  const key = `${id}:${attempt}`;
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 33 + key.charCodeAt(index)) % 4294967296;
  }
  return hash;
}

function randomGenerator(seed: number): () => number {
  let value = seed || 1;
  return () => {
    value = (value * 1664525 + 1013904223) % 4294967296;
    return value / 4294967296;
  };
}

function makeBoard(level: LevelDefinition, attempt: number): number[] {
  const random = randomGenerator(seedFrom(level.id, attempt));
  const patches = Array.from({ length: 25 }, () => Math.floor(random() * level.colors));
  return Array.from({ length: level.rows * level.cols }, (_, index) => {
    const row = Math.floor(index / level.cols);
    const col = index % level.cols;
    const patchColor = patches[Math.floor(row / 2) * 5 + Math.floor(col / 2)];
    return random() < 0.14 ? Math.floor(random() * level.colors) : patchColor;
  });
}

export function createGame(levelIndex: number, attempt = 0): GameState {
  const level = LEVELS[levelIndex];
  if (!level || !Number.isInteger(levelIndex)) throw new RangeError('Unknown excavation level');
  if (!Number.isSafeInteger(attempt) || attempt < 0) throw new RangeError('Invalid attempt');

  const targetMask = level.mask.flatMap((row) => Array.from(row, (cell) => cell === '#'));
  const targetTotal = targetMask.filter(Boolean).length;
  return {
    levelIndex,
    attempt,
    cols: level.cols,
    rows: level.rows,
    colors: level.colors,
    board: makeBoard(level, attempt),
    targetMask,
    targetTotal,
    remainingTargets: targetTotal,
    movesLeft: level.moves,
    maxMoves: level.moves,
    turns: 0,
    status: 'playing',
    lastMove: null,
  };
}

function neighbors(index: number, cols: number, length: number): number[] {
  const result: number[] = [];
  if (index >= cols) result.push(index - cols);
  if (index + cols < length) result.push(index + cols);
  if (index % cols > 0) result.push(index - 1);
  if (index % cols < cols - 1 && index + 1 < length) result.push(index + 1);
  return result;
}

export function getCluster(board: readonly (number | null)[], index: number, cols: number): number[] {
  if (!Number.isInteger(index) || index < 0 || index >= board.length
    || !Number.isInteger(cols) || cols <= 0 || board[index] === null) return [];
  const color = board[index];
  const visited = new Uint8Array(board.length);
  const cluster: number[] = [index];
  visited[index] = 1;
  for (let cursor = 0; cursor < cluster.length; cursor += 1) {
    for (const neighbor of neighbors(cluster[cursor], cols, board.length)) {
      if (!visited[neighbor] && board[neighbor] === color) {
        visited[neighbor] = 1;
        cluster.push(neighbor);
      }
    }
  }
  return cluster.sort((a, b) => a - b);
}

export function strike(state: GameState, index: number): GameState {
  if (state.status !== 'playing') return state;
  const cleared = getCluster(state.board, index, state.cols);
  if (cleared.length === 0) return state;

  const clearedSet = new Set(cleared);
  const shiftedSet = new Set<number>();
  let hitTargets = 0;
  for (const cell of cleared) {
    if (state.targetMask[cell]) hitTargets += 1;
    for (const neighbor of neighbors(cell, state.cols, state.board.length)) {
      if (!clearedSet.has(neighbor) && state.board[neighbor] !== null) shiftedSet.add(neighbor);
    }
  }

  const board = state.board.slice();
  for (const cell of cleared) board[cell] = null;
  const shifted = Array.from(shiftedSet).sort((a, b) => a - b);
  for (const cell of shifted) board[cell] = ((board[cell] as number) + 1) % state.colors;

  const refunded = cleared.length >= REFUND_SIZE;
  const movesLeft = state.movesLeft - (refunded ? 0 : 1);
  const remainingTargets = state.remainingTargets - hitTargets;
  return {
    ...state,
    board,
    remainingTargets,
    movesLeft,
    turns: state.turns + 1,
    status: remainingTargets === 0 ? 'won' : movesLeft === 0 ? 'lost' : 'playing',
    lastMove: { index, cleared, shifted, refunded, hitTargets },
  };
}

export function getGrade(state: GameState): Grade | null {
  if (state.status !== 'won') return null;
  const ratio = state.movesLeft / state.maxMoves;
  if (ratio >= 0.6) return 'S';
  if (ratio >= 0.35) return 'A';
  if (ratio >= 0.15) return 'B';
  return 'C';
}
