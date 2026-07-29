import { SHOP_UNITS, UNIT_DEFS } from "./units";

export const PLAYER_LEVELS = [3, 4, 5, 6, 7, 8, 9, 10] as const;
export type PlayerLevel = (typeof PLAYER_LEVELS)[number];
export type ShopTierOdds = readonly [number, number, number, number, number];

interface PlayerLevelConfig {
  boardCap: number;
  upgradeCost: number | null;
  tierOdds: ShopTierOdds;
}

export const STARTING_PLAYER_LEVEL: PlayerLevel = 3;
export const MAX_PLAYER_LEVEL: PlayerLevel = 10;
export const bookLevelForPlayerLevel = (level: PlayerLevel) => level;
export const PASSIVE_UPGRADE_DISCOUNT = 1;

export const PLAYER_LEVEL_CONFIG: Record<PlayerLevel, PlayerLevelConfig> = {
  3: { boardCap: 3, upgradeCost: 5, tierOdds: [75, 25, 0, 0, 0] },
  4: { boardCap: 4, upgradeCost: 9, tierOdds: [50, 38, 11, 1, 0] },
  5: { boardCap: 5, upgradeCost: 14, tierOdds: [35, 35, 24, 5, 1] },
  6: { boardCap: 6, upgradeCost: 20, tierOdds: [25, 30, 30, 13, 2] },
  7: { boardCap: 7, upgradeCost: 27, tierOdds: [15, 25, 32, 23, 5] },
  8: { boardCap: 8, upgradeCost: 36, tierOdds: [10, 20, 30, 30, 10] },
  9: { boardCap: 9, upgradeCost: 46, tierOdds: [7, 15, 25, 35, 18] },
  10: { boardCap: 10, upgradeCost: null, tierOdds: [5, 10, 20, 40, 25] },
};

export const tierOddsForLevel = (level: PlayerLevel) => PLAYER_LEVEL_CONFIG[level].tierOdds;

export const upgradeCostForLevel = (level: PlayerLevel) => PLAYER_LEVEL_CONFIG[level].upgradeCost;

export const SHOP_TIER_COUNTS = [1, 2, 3, 4, 5].map(
  (tier) => SHOP_UNITS.filter((id) => UNIT_DEFS[id].tier === tier).length,
);
