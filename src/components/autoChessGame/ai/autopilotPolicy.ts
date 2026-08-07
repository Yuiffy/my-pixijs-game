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
  terminalRollDownMinimumRound: number;
  terminalRollDownActivationGold: number;
  terminalRollDownReserveGold: number;
  terminalRollDownMaximumDryRerolls: number;
  terminalCompletionMinimumProjects: number;
  terminalCompletionActivationGold: number;
  terminalCompletionReserveGold: number;
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
  reserveCap: 13,
  reserveFloor: 4,
  reserveRoundScale: 0.4,
  criticalHpThreshold: 8,
  criticalReserve: 1,
  woundedHpThreshold: 16,
  woundedReserve: 5,
  targetLevelRoundDivisor: 3,
  targetLevelRoundOffset: 3,
  safeWinRolloutScore: 10050,
  stabilizeRolloutScore: 10000,
  financeActivationRolloutScore: 9800,
  financeActivationMaxRolloutDeficit: 0,
  maximumExcessPaidRerolls: 62,
  maximumDryPaidRerolls: 9,
  upgradeChaseRerollInterestTiersAtRisk: 20,
  stabilizeRerollInterestTiersAtRisk: 14,
  bankPurchaseInterestTiersAtRisk: 3,
  upgradeChasePurchaseInterestTiersAtRisk: 2,
  stabilizePurchaseInterestTiersAtRisk: 20,
  financePurchaseInterestTiersAtRisk: 4,
  lateGameTargetPurchaseInterestTiersAtRisk: 1,
  terminalRollDownMinimumRound: 14,
  terminalRollDownActivationGold: 132,
  terminalRollDownReserveGold: 36,
  terminalRollDownMaximumDryRerolls: 21,
  terminalCompletionMinimumProjects: 2,
  terminalCompletionActivationGold: 108,
  terminalCompletionReserveGold: 32,
  goodPurchaseInterestTiersAtRisk: 13,
  mergePurchaseInterestTiersAtRisk: 20,
  levelInterestTiersAtRisk: 5,
  interestSaleMinimumBench: 0,
  speculativePurchaseMinimumEmptyBench: 1,
  upgradeProjectLimit: 2,
  minimumWinningLineupMaxPrunes: 5,
  maximumFinalReinvestments: 1,
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
    terminalRollDownActivationGold: 120,
    terminalRollDownReserveGold: 44,
    terminalRollDownMaximumDryRerolls: 40,
    terminalCompletionActivationGold: 100,
    terminalCompletionReserveGold: 12,
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
    terminalRollDownMinimumRound: 16,
    terminalRollDownActivationGold: 108,
    terminalRollDownReserveGold: 32,
    terminalRollDownMaximumDryRerolls: 55,
    terminalCompletionMinimumProjects: 1,
    terminalCompletionActivationGold: 88,
    terminalCompletionReserveGold: 4,
  },
  seer: {
    safeWinRolloutScore: 10050,
    terminalRollDownMinimumRound: 16,
    terminalRollDownActivationGold: 112,
    terminalRollDownReserveGold: 40,
    terminalRollDownMaximumDryRerolls: 55,
    terminalCompletionMinimumProjects: 1,
    terminalCompletionActivationGold: 92,
    terminalCompletionReserveGold: 8,
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
    terminalRollDownMinimumRound: Math.max(
      1,
      Math.floor(policy.terminalRollDownMinimumRound),
    ),
    terminalRollDownActivationGold: Math.max(
      0,
      Math.floor(policy.terminalRollDownActivationGold),
    ),
    terminalRollDownReserveGold: Math.max(
      0,
      Math.min(
        Math.floor(policy.terminalRollDownActivationGold),
        Math.floor(policy.terminalRollDownReserveGold),
      ),
    ),
    terminalRollDownMaximumDryRerolls: Math.max(
      0,
      Math.floor(policy.terminalRollDownMaximumDryRerolls),
    ),
    terminalCompletionMinimumProjects: Math.max(
      1,
      Math.floor(policy.terminalCompletionMinimumProjects),
    ),
    terminalCompletionActivationGold: Math.max(
      0,
      Math.floor(policy.terminalCompletionActivationGold),
    ),
    terminalCompletionReserveGold: Math.max(
      0,
      Math.min(
        Math.floor(policy.terminalCompletionActivationGold),
        Math.floor(policy.terminalCompletionReserveGold),
      ),
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
