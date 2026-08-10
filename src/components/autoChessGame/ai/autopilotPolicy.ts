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
  lateGamePurchaseStartRound: number;
  lateGamePurchaseStartLevel: number;
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
  benchPressureEmptySlots: number;
  skipMaxStarDuplicatePurchases: number;
}

export type CanonicalAutopilotStyle = "survival" | "balanced" | "highroll" | "fair" | "seer" | "go";
/** `seer2` is accepted only to migrate old settings and benchmark commands. */
export type AutopilotStyle = CanonicalAutopilotStyle | "seer2";
export type AutopilotPreferenceStyle = "survival" | "balanced" | "highroll";
export type AutopilotThinkingLevel = "novice" | "veteran" | "deep" | "oracle" | "go";
export type AutopilotInformationMode = "normal" | "oracle";

export type AutopilotThinkingBudget = {
  rank: number;
  modelEnabled: boolean;
  rolloutVariants: number;
  modelShortlistLimit: number;
  coarseRolloutCandidates: number;
  exactRolloutCandidates: number;
  rescueModelCandidates: number;
  rescueExactCandidates: number;
  futureShopLookahead: number;
  futureCombatHorizon: number;
};

export type OraclePlanningWindow = Pick<
  AutopilotThinkingBudget,
  "futureShopLookahead" | "futureCombatHorizon"
>;

/** Explicit capability budgets keep level and economic preference orthogonal. */
export const AUTOPILOT_THINKING_BUDGETS: Record<
  AutopilotThinkingLevel,
  AutopilotThinkingBudget
> = {
  novice: {
    rank: 0,
    modelEnabled: false,
    rolloutVariants: 0,
    modelShortlistLimit: 0,
    coarseRolloutCandidates: 0,
    exactRolloutCandidates: 0,
    rescueModelCandidates: 0,
    rescueExactCandidates: 0,
    futureShopLookahead: 0,
    futureCombatHorizon: 0,
  },
  veteran: {
    rank: 1,
    modelEnabled: true,
    rolloutVariants: 0,
    modelShortlistLimit: 4,
    coarseRolloutCandidates: 0,
    exactRolloutCandidates: 0,
    rescueModelCandidates: 0,
    rescueExactCandidates: 0,
    futureShopLookahead: 0,
    futureCombatHorizon: 0,
  },
  deep: {
    rank: 2,
    modelEnabled: true,
    rolloutVariants: 1,
    modelShortlistLimit: 8,
    coarseRolloutCandidates: 6,
    exactRolloutCandidates: 2,
    rescueModelCandidates: 8,
    rescueExactCandidates: 2,
    futureShopLookahead: 0,
    futureCombatHorizon: 0,
  },
  oracle: {
    rank: 3,
    modelEnabled: true,
    rolloutVariants: 1,
    modelShortlistLimit: 12,
    coarseRolloutCandidates: 8,
    exactRolloutCandidates: 4,
    rescueModelCandidates: 12,
    rescueExactCandidates: 4,
    futureShopLookahead: 128,
    futureCombatHorizon: 6,
  },
  go: {
    rank: 4,
    modelEnabled: true,
    rolloutVariants: 3,
    modelShortlistLimit: 24,
    coarseRolloutCandidates: 24,
    exactRolloutCandidates: 12,
    rescueModelCandidates: 24,
    rescueExactCandidates: 12,
    futureShopLookahead: 2048,
    futureCombatHorizon: 70,
  },
};

/**
 * Live oracle search grows with the run instead of rebuilding the full future
 * on every preparation. The current battle is always included in the combat
 * horizon; the remaining slots are future enemies.
 */
export const oraclePlanningWindowForRound = (
  round: number,
  maximum = AUTOPILOT_THINKING_BUDGETS.oracle,
): OraclePlanningWindow => {
  const normalizedRound = Math.max(1, Math.floor(round));
  const staged = normalizedRound <= 3
    ? { futureShopLookahead: 16, futureCombatHorizon: 1 }
    : normalizedRound <= 6
      ? { futureShopLookahead: 32, futureCombatHorizon: 2 }
      : normalizedRound <= 9
        ? { futureShopLookahead: 64, futureCombatHorizon: 3 }
        : normalizedRound <= 12
          ? { futureShopLookahead: 96, futureCombatHorizon: 4 }
          : { futureShopLookahead: 128, futureCombatHorizon: 6 };
  return {
    futureShopLookahead: Math.min(maximum.futureShopLookahead, staged.futureShopLookahead),
    futureCombatHorizon: Math.min(maximum.futureCombatHorizon, staged.futureCombatHorizon),
  };
};

export const canonicalAutopilotStyle = (
  style: AutopilotStyle,
): CanonicalAutopilotStyle => (
  style === "seer2" ? "seer" : style
);

export const informationModeForAutopilotStyle = (
  style: AutopilotStyle,
): AutopilotInformationMode => (
  style === "seer" || style === "seer2" || style === "go" ? "oracle" : "normal"
);

export const preferenceStyleForAutopilotStyle = (
  style: AutopilotStyle,
): AutopilotPreferenceStyle => {
  const canonicalStyle = canonicalAutopilotStyle(style);
  if (canonicalStyle === "survival" || canonicalStyle === "highroll") return canonicalStyle;
  return "balanced";
};

export const legacyThinkingLevelForAutopilotStyle = (
  style: AutopilotStyle,
): AutopilotThinkingLevel => {
  const canonicalStyle = canonicalAutopilotStyle(style);
  if (canonicalStyle === "seer") return "oracle";
  if (canonicalStyle === "go") return "go";
  return "deep";
};

export const effectiveStyleForAutopilotConfiguration = (
  style: AutopilotPreferenceStyle,
  level: AutopilotThinkingLevel,
): CanonicalAutopilotStyle => {
  if (level === "go") return "go";
  return style;
};

export const informationModeForAutopilotThinkingLevel = (
  level: AutopilotThinkingLevel,
): AutopilotInformationMode => (
  level === "oracle" || level === "go" ? "oracle" : "normal"
);

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
  lateGamePurchaseStartRound: 10,
  lateGamePurchaseStartLevel: 7,
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
  benchPressureEmptySlots: 2,
  skipMaxStarDuplicatePurchases: 1,
};

export const AUTOPILOT_STYLE_POLICIES: Record<CanonicalAutopilotStyle, Partial<AutopilotPolicy>> = {
  survival: {
    safeWinRolloutScore: 10050,
    lateGamePurchaseStartRound: 12,
    lateGamePurchaseStartLevel: 7,
    minimumWinningLineupMaxPrunes: 0,
    benchPressureEmptySlots: 2,
  },
  balanced: {
    reserveCap: 10,
    reserveRoundScale: 0.85,
    safeWinRolloutScore: 10010,
    lateGamePurchaseStartRound: 10,
    lateGamePurchaseStartLevel: 7,
    minimumWinningLineupMaxPrunes: 0,
    benchPressureEmptySlots: 2,
    maximumDryPaidRerolls: 10,
    financeActivationMaxRolloutDeficit: 40,
    terminalRollDownActivationGold: 120,
    terminalRollDownReserveGold: 44,
    terminalRollDownMaximumDryRerolls: 40,
    terminalCompletionActivationGold: 100,
    terminalCompletionReserveGold: 12,
  },
  fair: {
    reserveCap: 10,
    reserveRoundScale: 0.85,
    safeWinRolloutScore: 10010,
    lateGamePurchaseStartRound: 10,
    lateGamePurchaseStartLevel: 7,
    minimumWinningLineupMaxPrunes: 0,
    benchPressureEmptySlots: 2,
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
    lateGamePurchaseStartRound: 8,
    lateGamePurchaseStartLevel: 6,
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
    woundedHpThreshold: 10,
    minimumWinningLineupMaxPrunes: 0,
    benchPressureEmptySlots: 1,
  },
  seer: {
    safeWinRolloutScore: 10050,
    lateGamePurchaseStartRound: 12,
    lateGamePurchaseStartLevel: 7,
    terminalRollDownMinimumRound: 16,
    terminalRollDownActivationGold: 132,
    terminalRollDownReserveGold: 36,
    terminalRollDownMaximumDryRerolls: 21,
    terminalCompletionMinimumProjects: 2,
    terminalCompletionActivationGold: 108,
    terminalCompletionReserveGold: 32,
    minimumWinningLineupMaxPrunes: 0,
    benchPressureEmptySlots: 2,
  },
  go: {
    safeWinRolloutScore: 10050,
    lateGamePurchaseStartRound: 12,
    lateGamePurchaseStartLevel: 7,
    minimumWinningLineupMaxPrunes: 0,
    benchPressureEmptySlots: 2,
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
    lateGamePurchaseStartRound: Math.max(1, Math.floor(policy.lateGamePurchaseStartRound)),
    lateGamePurchaseStartLevel: Math.max(3, Math.min(10, Math.floor(policy.lateGamePurchaseStartLevel))),
    benchPressureEmptySlots: Math.max(0, Math.min(8, Math.floor(policy.benchPressureEmptySlots))),
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
  ...AUTOPILOT_STYLE_POLICIES[canonicalAutopilotStyle(style)],
  ...overrides,
});
