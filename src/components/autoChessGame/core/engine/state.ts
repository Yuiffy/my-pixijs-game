import {
  CAMPAIGN_ROUNDS,
  STARTING_PLAYER_LEVEL,
  type UnitId,
  upgradeCostForLevel,
} from "../gameData";
import type { GameState, OwnedUnit } from "../gameTypes";

export const BOARD_SIZE = 24;
export const BENCH_SIZE = 8;
export const SHOP_SIZE = 5;
export const SCORE_VERSION = 2;
export const BEST_SCORE_KEY = `rift-line-best-score-v${SCORE_VERSION}`;

const emptySlots = <T>(size: number): Array<T | null> => Array.from({ length: size }, () => null);

export const loadBestScore = () => {
  try {
    if (!("localStorage" in globalThis)) return 0;
    const value = Number(
      globalThis.localStorage.getItem(BEST_SCORE_KEY) || 0,
    );
    return Number.isFinite(value) && value >= 0 ? value : 0;
  } catch {
    return 0;
  }
};

export const createInitialState = (
  seed: number,
  bestScore: number,
): GameState => ({
  phase: "title",
  seed,
  enemySeed: seed,
  visualTime: 0,
  round: 1,
  maxRounds: CAMPAIGN_ROUNDS,
  endlessUnlocked: false,
  hp: 20,
  maxHp: 20,
  gold: 8,
  playerLevel: STARTING_PLAYER_LEVEL,
  upgradeRemaining: upgradeCostForLevel(STARTING_PLAYER_LEVEL) || 0,
  upgradeDiscountCarry: 0,
  starForgeUnlocked: false,
  score: 0,
  bestScore,
  streak: 0,
  victories: 0,
  starter: null,
  starterChoices: [],
  starterHistory: [],
  board: emptySlots<OwnedUnit>(BOARD_SIZE),
  bench: emptySlots<OwnedUnit>(BENCH_SIZE),
  shop: emptySlots<UnitId>(SHOP_SIZE),
  shopLocked: false,
  freeRerollCharges: 0,
  selected: null,
  augments: [],
  augmentHistory: [],
  augmentChoices: [],
  runStats: {},
  incomeBonus: 0,
  paydayDebtRounds: 0,
  battle: null,
  result: null,
  finalWon: false,
  toast: null,
});
