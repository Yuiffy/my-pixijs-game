export interface AutopilotPolicy {
  reserveCap: number;
  reserveFloor: number;
  reserveRoundScale: number;
  criticalHpThreshold: number;
  criticalReserve: number;
  woundedHpThreshold: number;
  woundedReserve: number;
  targetLevelRoundDivisor: number;
  targetLevelRoundOffset: number;
  healthyPaidRerolls: number;
  woundedPaidRerolls: number;
  criticalPaidRerolls: number;
  safeWinRolloutScore: number;
  stabilizeRolloutScore: number;
  upgradeChaseBonusRerolls: number;
  bankRerollInterestTiersAtRisk: number;
  upgradeChaseRerollInterestTiersAtRisk: number;
  stabilizeRerollInterestTiersAtRisk: number;
  goodPurchaseInterestTiersAtRisk: number;
  mergePurchaseInterestTiersAtRisk: number;
  levelInterestTiersAtRisk: number;
  interestSaleMinimumBench: number;
  speculativePurchaseMinimumEmptyBench: number;
  minimumWinningLineupMaxPrunes: number;
  maximumFinalReinvestments: number;
  maxStarCleanupSales: number;
  skipMaxStarDuplicatePurchases: number;
}

export const DEFAULT_AUTOPILOT_POLICY: AutopilotPolicy = {
  reserveCap: 12,
  reserveFloor: 3,
  reserveRoundScale: 1,
  criticalHpThreshold: 8,
  criticalReserve: 2,
  woundedHpThreshold: 12,
  woundedReserve: 4,
  targetLevelRoundDivisor: 3,
  targetLevelRoundOffset: 1,
  healthyPaidRerolls: 1,
  woundedPaidRerolls: 2,
  criticalPaidRerolls: 4,
  safeWinRolloutScore: 10300,
  stabilizeRolloutScore: 10300,
  upgradeChaseBonusRerolls: 1,
  bankRerollInterestTiersAtRisk: 0,
  upgradeChaseRerollInterestTiersAtRisk: 20,
  stabilizeRerollInterestTiersAtRisk: 20,
  goodPurchaseInterestTiersAtRisk: 20,
  mergePurchaseInterestTiersAtRisk: 20,
  levelInterestTiersAtRisk: 20,
  interestSaleMinimumBench: 0,
  speculativePurchaseMinimumEmptyBench: 2,
  minimumWinningLineupMaxPrunes: 4,
  maximumFinalReinvestments: 2,
  maxStarCleanupSales: 3,
  skipMaxStarDuplicatePurchases: 1,
};

export const resolveAutopilotPolicy = (
  overrides: Partial<AutopilotPolicy> = {},
): AutopilotPolicy => {
  const policy = {
    ...DEFAULT_AUTOPILOT_POLICY,
    ...overrides,
  };
  return {
    ...policy,
    stabilizeRolloutScore: Math.min(policy.safeWinRolloutScore, policy.stabilizeRolloutScore),
    bankRerollInterestTiersAtRisk: Math.max(0, Math.floor(policy.bankRerollInterestTiersAtRisk)),
    upgradeChaseRerollInterestTiersAtRisk: Math.max(
      0,
      Math.floor(policy.upgradeChaseRerollInterestTiersAtRisk),
    ),
    stabilizeRerollInterestTiersAtRisk: Math.max(
      0,
      Math.floor(policy.stabilizeRerollInterestTiersAtRisk),
    ),
    goodPurchaseInterestTiersAtRisk: Math.max(
      0,
      Math.floor(policy.goodPurchaseInterestTiersAtRisk),
    ),
    mergePurchaseInterestTiersAtRisk: Math.max(
      0,
      Math.floor(policy.mergePurchaseInterestTiersAtRisk),
    ),
    levelInterestTiersAtRisk: Math.max(0, Math.floor(policy.levelInterestTiersAtRisk)),
  };
};
