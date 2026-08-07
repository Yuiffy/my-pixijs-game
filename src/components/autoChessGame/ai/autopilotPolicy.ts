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
  safeWinRolloutScore: number;
  stabilizeRolloutScore: number;
  financeActivationRolloutScore: number;
  financeActivationMaxRolloutDeficit: number;
  maximumExcessPaidRerolls: number;
  maximumDryPaidRerolls: number;
  upgradeChaseRerollInterestTiersAtRisk: number;
  stabilizeRerollInterestTiersAtRisk: number;
  bankPurchaseInterestTiersAtRisk: number;
  upgradeChasePurchaseInterestTiersAtRisk: number;
  stabilizePurchaseInterestTiersAtRisk: number;
  financePurchaseInterestTiersAtRisk: number;
  goodPurchaseInterestTiersAtRisk: number;
  mergePurchaseInterestTiersAtRisk: number;
  levelInterestTiersAtRisk: number;
  interestSaleMinimumBench: number;
  speculativePurchaseMinimumEmptyBench: number;
  upgradeProjectLimit: number;
  minimumWinningLineupMaxPrunes: number;
  maximumFinalReinvestments: number;
  maxStarCleanupSales: number;
  skipMaxStarDuplicatePurchases: number;
}

export type AutopilotStyle = "survival" | "balanced" | "highroll";
export type AutopilotInformationMode = "normal" | "oracle";

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
  safeWinRolloutScore: 10020,
  stabilizeRolloutScore: 10000,
  financeActivationRolloutScore: 10020,
  financeActivationMaxRolloutDeficit: 0,
  maximumExcessPaidRerolls: 64,
  maximumDryPaidRerolls: 8,
  upgradeChaseRerollInterestTiersAtRisk: 20,
  stabilizeRerollInterestTiersAtRisk: 20,
  bankPurchaseInterestTiersAtRisk: 0,
  upgradeChasePurchaseInterestTiersAtRisk: 2,
  stabilizePurchaseInterestTiersAtRisk: 20,
  financePurchaseInterestTiersAtRisk: 1,
  goodPurchaseInterestTiersAtRisk: 20,
  mergePurchaseInterestTiersAtRisk: 20,
  levelInterestTiersAtRisk: 20,
  interestSaleMinimumBench: 0,
  speculativePurchaseMinimumEmptyBench: 2,
  upgradeProjectLimit: 2,
  minimumWinningLineupMaxPrunes: 4,
  maximumFinalReinvestments: 2,
  maxStarCleanupSales: 3,
  skipMaxStarDuplicatePurchases: 1,
};

export const AUTOPILOT_STYLE_POLICIES: Record<AutopilotStyle, Partial<AutopilotPolicy>> = {
  survival: {
    safeWinRolloutScore: 9975,
  },
  balanced: {
    reserveCap: 10,
    reserveRoundScale: 0.85,
    safeWinRolloutScore: 10010,
    maximumDryPaidRerolls: 10,
    financeActivationMaxRolloutDeficit: 40,
  },
  highroll: {
    reserveCap: 7,
    reserveFloor: 2,
    reserveRoundScale: 0.6,
    safeWinRolloutScore: 10010,
    maximumDryPaidRerolls: 16,
    financeActivationMaxRolloutDeficit: 100,
    financePurchaseInterestTiersAtRisk: 2,
    upgradeProjectLimit: 3,
  },
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
    financeActivationRolloutScore: Math.min(
      policy.safeWinRolloutScore,
      policy.financeActivationRolloutScore,
    ),
    financeActivationMaxRolloutDeficit: Math.max(
      0,
      policy.financeActivationMaxRolloutDeficit,
    ),
    maximumExcessPaidRerolls: Math.max(0, Math.floor(policy.maximumExcessPaidRerolls)),
    maximumDryPaidRerolls: Math.max(0, Math.floor(policy.maximumDryPaidRerolls)),
    upgradeChaseRerollInterestTiersAtRisk: Math.max(
      0,
      Math.floor(policy.upgradeChaseRerollInterestTiersAtRisk),
    ),
    stabilizeRerollInterestTiersAtRisk: Math.max(
      0,
      Math.floor(policy.stabilizeRerollInterestTiersAtRisk),
    ),
    bankPurchaseInterestTiersAtRisk: Math.max(
      0,
      Math.floor(policy.bankPurchaseInterestTiersAtRisk),
    ),
    upgradeChasePurchaseInterestTiersAtRisk: Math.max(
      0,
      Math.floor(policy.upgradeChasePurchaseInterestTiersAtRisk),
    ),
    stabilizePurchaseInterestTiersAtRisk: Math.max(
      0,
      Math.floor(policy.stabilizePurchaseInterestTiersAtRisk),
    ),
    financePurchaseInterestTiersAtRisk: Math.max(
      0,
      Math.floor(policy.financePurchaseInterestTiersAtRisk),
    ),
    upgradeProjectLimit: Math.max(0, Math.floor(policy.upgradeProjectLimit)),
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

export const resolveAutopilotStylePolicy = (
  style: AutopilotStyle,
  overrides: Partial<AutopilotPolicy> = {},
) => resolveAutopilotPolicy({
  ...AUTOPILOT_STYLE_POLICIES[style],
  ...overrides,
});
