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
  lateGameTargetPurchaseInterestTiersAtRisk: number;
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

export type AutopilotStyle = "survival" | "balanced" | "highroll" | "seer";
export type AutopilotInformationMode = "normal" | "oracle";

export const informationModeForAutopilotStyle = (
  style: AutopilotStyle,
): AutopilotInformationMode => (style === "seer" ? "oracle" : "normal");

export const DEFAULT_AUTOPILOT_POLICY: AutopilotPolicy = {
  reserveCap: 14,
  reserveFloor: 2,
  reserveRoundScale: 0.7,
  criticalHpThreshold: 8,
  criticalReserve: 2,
  woundedHpThreshold: 14,
  woundedReserve: 4,
  targetLevelRoundDivisor: 2,
  targetLevelRoundOffset: 2,
  safeWinRolloutScore: 10050,
  stabilizeRolloutScore: 10050,
  financeActivationRolloutScore: 9975,
  financeActivationMaxRolloutDeficit: 25,
  maximumExcessPaidRerolls: 55,
  maximumDryPaidRerolls: 12,
  upgradeChaseRerollInterestTiersAtRisk: 18,
  stabilizeRerollInterestTiersAtRisk: 20,
  bankPurchaseInterestTiersAtRisk: 0,
  upgradeChasePurchaseInterestTiersAtRisk: 0,
  stabilizePurchaseInterestTiersAtRisk: 14,
  financePurchaseInterestTiersAtRisk: 3,
  lateGameTargetPurchaseInterestTiersAtRisk: 1,
  goodPurchaseInterestTiersAtRisk: 18,
  mergePurchaseInterestTiersAtRisk: 20,
  levelInterestTiersAtRisk: 4,
  interestSaleMinimumBench: 1,
  speculativePurchaseMinimumEmptyBench: 2,
  upgradeProjectLimit: 3,
  minimumWinningLineupMaxPrunes: 6,
  maximumFinalReinvestments: 0,
  maxStarCleanupSales: 7,
  skipMaxStarDuplicatePurchases: 1,
};

export const AUTOPILOT_STYLE_POLICIES: Record<AutopilotStyle, Partial<AutopilotPolicy>> = {
  survival: {
    safeWinRolloutScore: 10050,
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
  seer: {
    safeWinRolloutScore: 9975,
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
    lateGameTargetPurchaseInterestTiersAtRisk: Math.max(
      0,
      Math.floor(policy.lateGameTargetPurchaseInterestTiersAtRisk),
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
