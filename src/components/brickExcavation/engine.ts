export type GameStatus = 'playing' | 'won' | 'lost';
export type Grade = 'S' | 'A' | 'B' | 'C';

interface TreasureTemplate {
  id: string;
  name: string;
  portrait: string;
  mask: readonly string[];
  points: number;
}

export interface Treasure extends TreasureTemplate {
  x: number;
  y: number;
  width: number;
  height: number;
  indices: number[];
  revealed: number;
  total: number;
  found: boolean;
}

export interface LastMove {
  index: number;
  cleared: number[];
  shifted: number[];
  refunded: boolean;
  hitTargets: number;
  discoveredIds: string[];
  foundIds: string[];
  scoreGained: number;
}

export interface GameState {
  seed: number;
  cols: number;
  rows: number;
  colors: number;
  board: (number | null)[];
  treasures: Treasure[];
  movesLeft: number;
  maxMoves: number;
  shufflesLeft: number;
  maxShuffles: number;
  turns: number;
  score: number;
  status: GameStatus;
  lastMove: LastMove | null;
}

const SIZE = 10;
const COLOR_COUNT = 4;
const MOVE_BUDGET = 22;
const SHUFFLE_BUDGET = 2;
const REFUND_SIZE = 6;
const BRICK_POINTS = 5;

const TREASURE_TEMPLATES: readonly TreasureTemplate[] = [
  {
    id: 'sui',
    name: '岁己',
    portrait: '/games/brick-excavation/sui-excavation.png',
    mask: ['.##.', '####', '####', '.##.'],
    points: 180,
  },
  {
    id: 'shiori',
    name: '栞栞',
    portrait: '/games/brick-excavation/shiori-excavation.png',
    mask: ['###', '.##', '.##'],
    points: 150,
  },
  {
    id: 'yua',
    name: '悠亚',
    portrait: '/games/brick-excavation/yua-excavation.png',
    mask: ['###', '##.', '##.'],
    points: 150,
  },
  {
    id: 'nagisa',
    name: '米米',
    portrait: '/games/brick-excavation/nagisa-excavation.png',
    mask: ['.#.', '###', '###', '.#.'],
    points: 120,
  },
  {
    id: 'biscuit_sui',
    name: '饼干岁',
    portrait: '/games/brick-excavation/biscuit_sui-excavation.png',
    mask: ['###', '###', '##.'],
    points: 180,
  },
];

function seedFrom(label: string, seed: number): number {
  let hash = 5381;
  const key = `${label}:${seed}`;
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

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

function makeBoard(seed: number, attempt: number): number[] {
  const random = randomGenerator(seedFrom(attempt === 0 ? 'board' : `board-${attempt}`, seed));
  const patches = Array.from({ length: 25 }, () => Math.floor(random() * COLOR_COUNT));
  return Array.from({ length: SIZE * SIZE }, (_, index) => {
    const row = Math.floor(index / SIZE);
    const col = index % SIZE;
    const patchColor = patches[Math.floor(row / 2) * 5 + Math.floor(col / 2)];
    return random() < 0.14 ? Math.floor(random() * COLOR_COUNT) : patchColor;
  });
}

function makeTreasures(seed: number, clearable: ReadonlySet<number>): Treasure[] | null {
  const random = randomGenerator(seedFrom('treasures', seed));
  const templates = shuffle(TREASURE_TEMPLATES, random).slice(0, 4 + (seed % 2))
    .sort((a, b) => b.mask.length * b.mask[0].length - a.mask.length * a.mask[0].length);
  const occupied = new Set<number>();
  const placed: Treasure[] = [];

  function place(templateIndex: number): boolean {
    if (templateIndex === templates.length) return true;
    const template = templates[templateIndex];
    const width = template.mask[0].length;
    const height = template.mask.length;
    const positions = Array.from({ length: (SIZE - width + 1) * (SIZE - height + 1) }, (_, index) => ({
      x: index % (SIZE - width + 1),
      y: Math.floor(index / (SIZE - width + 1)),
    }));

    for (const { x, y } of shuffle(positions, random)) {
      const footprint = Array.from({ length: width * height }, (_, index) => {
        return (y + Math.floor(index / width)) * SIZE + x + (index % width);
      });
      if (footprint.some((index) => occupied.has(index))) continue;
      const indices = template.mask.flatMap((row, rowIndex) => {
        return row.split('').flatMap((cell, colIndex) => (cell === '#' ? [(y + rowIndex) * SIZE + x + colIndex] : []));
      });
      if (indices.some((index) => !clearable.has(index))) continue;
      footprint.forEach((index) => occupied.add(index));
      placed.push({
        ...template,
        x,
        y,
        width,
        height,
        indices,
        revealed: 0,
        total: indices.length,
        found: false,
      });
      if (place(templateIndex + 1)) return true;
      placed.pop();
      footprint.forEach((index) => occupied.delete(index));
    }
    return false;
  }

  return place(0) ? placed : null;
}

export function createGame(seed = 0): GameState {
  if (!Number.isSafeInteger(seed) || seed < 0) throw new RangeError('Invalid excavation seed');
  let board: number[] | null = null;
  let treasures: Treasure[] | null = null;
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const candidate = makeBoard(seed, attempt);
    const placement = makeTreasures(seed, traceClearableCells(candidate));
    if (!placement) continue;
    board = candidate;
    treasures = placement;
    break;
  }
  if (!board || !treasures) throw new Error('Unable to build a playable excavation map');
  return {
    seed,
    cols: SIZE,
    rows: SIZE,
    colors: COLOR_COUNT,
    board,
    treasures,
    movesLeft: MOVE_BUDGET,
    maxMoves: MOVE_BUDGET,
    shufflesLeft: SHUFFLE_BUDGET,
    maxShuffles: SHUFFLE_BUDGET,
    turns: 0,
    score: 0,
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

export function hasLegalMove(board: readonly (number | null)[], cols: number): boolean {
  if (!Number.isInteger(cols) || cols <= 0) return false;
  for (let index = 0; index < board.length; index += 1) {
    const color = board[index];
    if (color === null) continue;
    if (index % cols < cols - 1 && board[index + 1] === color) return true;
    if (index + cols < board.length && board[index + cols] === color) return true;
  }
  return false;
}

export function hasStrandedTreasure(state: GameState): boolean {
  return state.treasures.some((treasure) => !treasure.found && treasure.indices.some((index) => {
    return state.board[index] !== null
      && neighbors(index, state.cols, state.board.length).every((neighbor) => state.board[neighbor] === null);
  }));
}

export function canShuffleRemaining(state: GameState): boolean {
  return state.status === 'playing' && state.shufflesLeft > 0
    && state.movesLeft > 0 && !hasStrandedTreasure(state)
    && state.board.some((color) => color !== null);
}

export function shuffleRemaining(state: GameState): GameState {
  if (!canShuffleRemaining(state)) return state;
  const board = state.board.slice();
  const random = randomGenerator(seedFrom(
    `shuffle-${state.turns}-${state.maxShuffles - state.shufflesLeft}-${board.join(',')}`,
    state.seed,
  ));
  for (let index = 0; index < board.length; index += 1) {
    const color = board[index];
    if (color !== null) board[index] = (color + 1 + Math.floor(random() * (state.colors - 1))) % state.colors;
  }

  // Recolor a target only when it is currently isolated by color. Such a cell
  // cannot be supporting an existing pair, so this cannot strand another target.
  for (const treasure of state.treasures) {
    if (treasure.found) continue;
    for (const index of treasure.indices) {
      if (board[index] === null || getCluster(board, index, state.cols).length >= 2) continue;
      const adjacent = neighbors(index, state.cols, board.length)
        .filter((neighbor) => board[neighbor] !== null);
      const neighbor = adjacent[Math.floor(random() * adjacent.length)];
      board[index] = board[neighbor];
    }
  }

  const shufflesLeft = state.shufflesLeft - 1;
  return {
    ...state,
    board,
    shufflesLeft,
    status: hasLegalMove(board, state.cols) ? 'playing' : 'lost',
    lastMove: null,
  };
}

function clearCluster(board: (number | null)[], cleared: readonly number[], cols: number, colors: number): number[] {
  const clearedSet = new Set(cleared);
  const shiftedSet = new Set<number>();
  for (const cell of cleared) {
    for (const neighbor of neighbors(cell, cols, board.length)) {
      if (!clearedSet.has(neighbor) && board[neighbor] !== null) shiftedSet.add(neighbor);
    }
  }
  for (const cell of cleared) board[cell] = null;
  const shifted = Array.from(shiftedSet).sort((a, b) => a - b);
  for (const cell of shifted) board[cell] = ((board[cell] as number) + 1) % colors;
  return shifted;
}

function traceClearableCells(board: readonly number[]): ReadonlySet<number> {
  // Reserve treasure placements for cells reachable by one legal, budgeted route.
  const working: (number | null)[] = board.slice();
  const cleared = new Set<number>();
  let movesLeft = MOVE_BUDGET;
  while (movesLeft > 0) {
    let largest: number[] = [];
    const visited = new Uint8Array(working.length);
    for (let index = 0; index < working.length; index += 1) {
      if (working[index] === null || visited[index]) continue;
      const cluster = getCluster(working, index, SIZE);
      for (const cell of cluster) visited[cell] = 1;
      if (cluster.length > largest.length) largest = cluster;
    }
    if (largest.length < 2) break;
    for (const cell of largest) cleared.add(cell);
    clearCluster(working, largest, SIZE, COLOR_COUNT);
    if (largest.length < REFUND_SIZE) movesLeft -= 1;
  }
  return cleared;
}

export function strike(state: GameState, index: number): GameState {
  if (state.status !== 'playing') return state;
  const cleared = getCluster(state.board, index, state.cols);
  if (cleared.length < 2) return state;

  const board = state.board.slice();
  const shifted = clearCluster(board, cleared, state.cols, state.colors);
  const clearedSet = new Set(cleared);

  const discoveredIds: string[] = [];
  const foundIds: string[] = [];
  let hitTargets = 0;
  let scoreGained = cleared.length * BRICK_POINTS;
  const treasures = state.treasures.map((treasure) => {
    if (treasure.found) return treasure;
    const hits = treasure.indices.filter((cell) => clearedSet.has(cell)).length;
    if (hits === 0) return treasure;
    hitTargets += hits;
    const revealed = treasure.revealed + hits;
    const found = revealed === treasure.total;
    if (treasure.revealed === 0) discoveredIds.push(treasure.id);
    if (found) {
      foundIds.push(treasure.id);
      scoreGained += treasure.points;
    }
    return { ...treasure, revealed, found };
  });

  const refunded = cleared.length >= REFUND_SIZE;
  const movesLeft = state.movesLeft - (refunded ? 0 : 1);
  return {
    ...state,
    board,
    treasures,
    movesLeft,
    turns: state.turns + 1,
    score: state.score + scoreGained,
    status: treasures.every((treasure) => treasure.found)
      ? 'won'
      : movesLeft === 0 || hasStrandedTreasure({ ...state, board, treasures })
        || (!hasLegalMove(board, state.cols) && state.shufflesLeft === 0) ? 'lost' : 'playing',
    lastMove: { index, cleared, shifted, refunded, hitTargets, discoveredIds, foundIds, scoreGained },
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
