import type { StarterId } from "../gameData";

export interface StarterEffects {
  hpBonus?: number;
  goldBonus?: number;
  shieldMultiplier?: number;
  burnMultiplier?: number;
  firstWinGold?: number;
  trafficLifesteal?: number;
  openingShield?: number;
  startingEnergy?: number;
  danceAttackSpeed?: number;
  rangedAttackSpeed?: number;
  freeFirstReroll?: boolean;
}

export const STARTER_EFFECTS: Record<StarterId, StarterEffects> = {
  mature_start: { goldBonus: 2, openingShield: 0.08 },
  blaze: { burnMultiplier: 1.3, firstWinGold: 1 },
  traffic_start: { goldBonus: 1, trafficLifesteal: 0.06 },
  bastion: { hpBonus: 3, shieldMultiplier: 1.2 },
  dance_start: {
    goldBonus: 1,
    startingEnergy: 10,
    danceAttackSpeed: 0.08,
  },
  ranger_start: { rangedAttackSpeed: 0.1, freeFirstReroll: true },
};
