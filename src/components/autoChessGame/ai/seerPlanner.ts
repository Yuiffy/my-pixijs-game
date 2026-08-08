import {
  FINANCE_INTEREST_CAP,
  MAX_PLAYER_LEVEL,
  NORMAL_INTEREST_CAP,
  PLAYER_LEVEL_CONFIG,
  PLAYER_LEVELS,
  UNIT_DEFS,
  enemyTraitActivations,
  enemyBudgetForRound,
  waveForRound,
  type PlayerLevel,
  type UnitId,
} from "../core/gameData";

type Shop = readonly (UnitId | null)[];

export type SeerPlannerUnit = {
  id: UnitId;
  star: 1 | 2 | 3;
  zone?: "board" | "bench";
};

export type SeerTarget = {
  id: UnitId;
  priority: number;
  desiredCopies: number;
};

export type SeerShopForecast = Record<PlayerLevel, readonly Shop[]>;

export type SeerWaveForecast = {
  round: number;
  tag: "normal" | "elite" | "boss";
  budget: number;
  threat: number;
  units: readonly {
    id: UnitId;
    star: 1 | 2 | 3;
  }[];
};

export type SeerPlannerRequest = {
  round: number;
  seed: number;
  hp: number;
  gold: number;
  playerLevel: PlayerLevel;
  upgradeRemaining: number;
  streak: number;
  incomeBonus: number;
  paydayDebtRounds: number;
  freeRerolls: number;
  financeActive: boolean;
  currentShop: Shop;
  currentCombatScore: number;
  currentBoardCount?: number;
  currentBoardStrength?: number;
  currentTransitionUnits?: readonly SeerPlannerUnit[];
  targetCopies: Partial<Record<UnitId, number>>;
  targets: readonly SeerTarget[];
  futureShops: SeerShopForecast;
  futureWaves?: readonly SeerWaveForecast[];
  horizon?: number;
  beamWidth?: number;
  /** Keep searching after the abstract damage model reaches zero HP. */
  continueAfterForecastDeath?: boolean;
};

export type SeerRoundAction = {
  targetLevel: PlayerLevel;
  rerolls: number;
  expectedGoldAfterPreparation: number;
  purchasesByShop?: readonly (readonly UnitId[])[];
  salesByShop?: readonly (readonly UnitId[])[];
};

export type SeerPlanStep = SeerRoundAction & {
  expectedGoldBeforePreparation?: number;
  expectedHp?: number;
  expectedPlayerLevel: PlayerLevel;
  expectedShop: readonly (UnitId | null)[];
  expectedWave?: SeerWaveForecast;
  expectedBattleMargin?: number;
  expectedBattleWon?: boolean;
  expectedTargetCopies: Partial<Record<UnitId, number>>;
  expectedTransitionUnits: readonly SeerPlannerUnit[];
  expectedBoardCount: number;
  expectedRosterCount: number;
};

export type SeerPlan = {
  firstStep: SeerRoundAction;
  startRound?: number;
  steps?: readonly SeerPlanStep[];
  planningHorizon?: number;
  complete: boolean;
  exactValidatedHorizon?: number;
  futureWaves?: readonly SeerWaveForecast[];
  projectedRound: number;
  projectedHp: number;
  projectedGold: number;
  projectedLevel: PlayerLevel;
  projectedTargetCopies: Partial<Record<UnitId, number>>;
  projectedBoardCount: number;
  projectedRosterCount: number;
  score: number;
  exploredStates: number;
  dominancePrunes: number;
};

type PlannerState = {
  depth: number;
  round: number;
  hp: number;
  gold: number;
  playerLevel: PlayerLevel;
  upgradeRemaining: number;
  streak: number;
  paydayDebtRounds: number;
  cursors: number[];
  currentShop: Shop;
  copies: number[];
  transitionUnits: SeerPlannerUnit[];
  boardCount: number;
  activeStrength: number;
  firstStep: SeerRoundAction | null;
  path: PlannerPathNode | null;
};

type PlannerPathNode = {
  previous: PlannerPathNode | null;
  step: SeerPlanStep;
};

const DEFAULT_HORIZON = 60;
const DEFAULT_BEAM_WIDTH = 96;
const BENCH_CAPACITY = 8;
const STAR_POWER = [0, 1, 2.6, 7] as const;
const UNIT_BASE_POWER = 36;
const ABSTRACT_POWER_SCORE_SCALE = 10;
const ABSTRACT_THREAT_SCALE = 0.1;
const levelIndex = (level: PlayerLevel) => PLAYER_LEVELS.indexOf(level);
const waveForecastCache = new Map<string, SeerWaveForecast>();

const waveForecastForRound = (round: number, seed: number): SeerWaveForecast => {
  const key = `${seed}/${round}`;
  const cached = waveForecastCache.get(key);
  if (cached) return cached;
  const wave = waveForRound(round, seed);
  const units = wave.units.map((unit) => ({
    id: unit.id,
    star: (unit.star || 1) as 1 | 2 | 3,
  }));
  const traitPressure = enemyTraitActivations(wave.units).reduce(
    (total, trait) => total + trait.level * 35 + trait.count * 4,
    0,
  );
  const tagPressure = wave.tag === "boss" ? 600 : wave.tag === "elite" ? 280 : 0;
  const forecast = {
    round,
    tag: wave.tag,
    budget: enemyBudgetForRound(round),
    threat: enemyBudgetForRound(round) * 12 + traitPressure + tagPressure,
    units,
  } satisfies SeerWaveForecast;
  waveForecastCache.set(key, forecast);
  return forecast;
};

const enemyThreatForRound = (round: number, seed: number) => {
  return waveForecastForRound(round, seed).threat;
};

export const forecastSeerWaves = (
  round: number,
  seed: number,
  horizon: number,
) => Array.from(
  { length: Math.max(0, Math.floor(horizon)) },
  (_, index) => waveForecastForRound(round + index, seed),
);

const unitCombatStrength = (id: UnitId, star: 1 | 2 | 3) => (
  UNIT_BASE_POWER + UNIT_DEFS[id].cost * 12 * STAR_POWER[star]
);

const rolloutCombatMargin = (score: number) => (
  score >= 9000 ? (score - 10000) * 2 : score
);

const calibratedAbstractMargin = (
  activeStrength: number,
  threat: number,
  initialActiveStrength: number,
  initialEnemyThreat: number,
  initialCombatScore: number,
) => (
  (activeStrength - threat * ABSTRACT_THREAT_SCALE) * ABSTRACT_POWER_SCORE_SCALE
    + rolloutCombatMargin(initialCombatScore)
    - (initialActiveStrength - initialEnemyThreat * ABSTRACT_THREAT_SCALE)
      * ABSTRACT_POWER_SCORE_SCALE
);

const canonicalTargetUnits = (
  copies: readonly number[],
  targets: readonly SeerTarget[],
) => copies.flatMap((count, index) => {
  const target = targets[index];
  if (!target) return [];
  let remaining = Math.max(0, Math.floor(count));
  const units: SeerPlannerUnit[] = [];
  while (remaining >= 9) {
    units.push({ id: target.id, star: 3 });
    remaining -= 9;
  }
  while (remaining >= 3) {
    units.push({ id: target.id, star: 2 });
    remaining -= 3;
  }
  while (remaining > 0) {
    units.push({ id: target.id, star: 1 });
    remaining -= 1;
  }
  return units;
});

const targetPhysicalCount = (
  copies: readonly number[],
  targets: readonly SeerTarget[],
) => copies.reduce((total, count, index) => {
  if (!targets[index]) return total;
  const safeCopies = Math.max(0, Math.floor(count));
  return total
    + Math.floor(safeCopies / 9)
    + Math.floor((safeCopies % 9) / 3)
    + (safeCopies % 3);
}, 0);

const rosterUnits = (
  copies: readonly number[],
  targets: readonly SeerTarget[],
  transitionUnits: readonly SeerPlannerUnit[],
) => [
  ...canonicalTargetUnits(copies, targets),
  ...transitionUnits,
];

const financeMemberCount = (
  copies: readonly number[],
  targets: readonly SeerTarget[],
  transitionUnits: readonly SeerPlannerUnit[],
) => new Set(
  rosterUnits(copies, targets, transitionUnits)
    .filter((unit) => UNIT_DEFS[unit.id].traits.includes("finance"))
    .map((unit) => unit.id),
).size;

const activeRosterStrength = (
  copies: readonly number[],
  targets: readonly SeerTarget[],
  transitionUnits: readonly SeerPlannerUnit[],
  boardCap: number,
) => {
  const units = rosterUnits(copies, targets, transitionUnits)
    .sort((left, right) => unitCombatStrength(right.id, right.star)
      - unitCombatStrength(left.id, left.star));
  return {
    count: Math.min(Math.max(0, boardCap), units.length),
    strength: units
      .slice(0, Math.max(0, boardCap))
      .reduce((total, unit) => total + unitCombatStrength(unit.id, unit.star), 0),
  };
};

const activeFinanceMemberCount = (
  copies: readonly number[],
  targets: readonly SeerTarget[],
  transitionUnits: readonly SeerPlannerUnit[],
  boardCap: number,
) => new Set(
  rosterUnits(copies, targets, transitionUnits)
    .sort((left, right) => unitCombatStrength(right.id, right.star)
      - unitCombatStrength(left.id, left.star))
    .slice(0, Math.max(0, boardCap))
    .filter((unit) => UNIT_DEFS[unit.id].traits.includes("finance"))
    .map((unit) => unit.id),
).size;

const addTransitionUnit = (
  transitionUnits: readonly SeerPlannerUnit[],
  id: UnitId,
) => {
  const next = [...transitionUnits, { id, star: 1 as const, zone: "bench" as const }];
  for (const star of [1, 2] as const) {
    while (next.filter((unit) => unit.id === id && unit.star === star).length >= 3) {
      const matches = next
        .map((unit, index) => ({ unit, index }))
        .filter(({ unit }) => unit.id === id && unit.star === star)
        .slice(0, 3);
      if (matches.length < 3) break;
      const keep = matches[0];
      next[keep.index] = {
        id,
        star: (star + 1) as 2 | 3,
        zone: keep.unit.zone,
      };
      matches
        .slice(1)
        .sort((left, right) => right.index - left.index)
        .forEach(({ index }) => next.splice(index, 1));
    }
  }
  return next;
};

const transitionSaleIndex = (
  transitionUnits: readonly SeerPlannerUnit[],
  preserveFinance = false,
) => {
  let bestIndex = -1;
  let bestStrength = Number.POSITIVE_INFINITY;
  transitionUnits.forEach((unit, index) => {
    if (preserveFinance && UNIT_DEFS[unit.id].traits.includes("finance")) return;
    const strength = unitCombatStrength(unit.id, unit.star);
    if (strength < bestStrength) {
      bestIndex = index;
      bestStrength = strength;
    }
  });
  return bestIndex;
};

const transitionSellValue = (unit: SeerPlannerUnit) => (
  UNIT_DEFS[unit.id].cost * (unit.star === 3 ? 9 : unit.star === 2 ? 3 : 1)
);

const targetProgressScore = (copies: readonly number[], targets: readonly SeerTarget[]) => (
  copies.reduce((total, count, index) => {
    const target = targets[index];
    if (!target) return total;
    const capped = Math.min(target.desiredCopies, count);
    return total
      + capped * target.priority * 3
      + (capped >= 3 ? 320 : 0)
      + (capped >= 6 ? 420 : 0)
      + (capped >= 9 ? 3600 : 0);
  }, 0)
);

const purchaseMarginalValue = (before: number, target: SeerTarget) => {
  const after = Math.min(target.desiredCopies, before + 1);
  if (after <= before) return Number.NEGATIVE_INFINITY;
  return target.priority * 3
    + (before < 3 && after >= 3 ? 320 : 0)
    + (before < 6 && after >= 6 ? 420 : 0)
    + (before < 9 && after >= 9 ? 3600 : 0);
};

const buyFromShop = (
  shop: Shop,
  gold: number,
  copies: readonly number[],
  transitionUnits: readonly SeerPlannerUnit[],
  targetLevel: PlayerLevel,
  targets: readonly SeerTarget[],
  purchaseLog: UnitId[],
  saleLog: UnitId[],
) => {
  const nextCopies = [...copies];
  let nextTransitionUnits = [...transitionUnits];
  let nextGold = gold;
  const targetIndex = new Map(targets.map((target, index) => [target.id, index]));
  const usedShopIndexes = new Set<number>();
  const boardCap = PLAYER_LEVEL_CONFIG[targetLevel].boardCap;
  const maxRoster = boardCap + BENCH_CAPACITY;

  while (usedShopIndexes.size < shop.length) {
    const currentRosterCount = targetPhysicalCount(nextCopies, targets)
      + nextTransitionUnits.length;
    const needsPopulation = currentRosterCount < boardCap;
    const currentFinanceIds = new Set(
      rosterUnits(nextCopies, targets, nextTransitionUnits)
        .sort((left, right) => unitCombatStrength(right.id, right.star)
          - unitCombatStrength(left.id, left.star))
        .slice(0, Math.max(0, boardCap))
        .filter((unit) => UNIT_DEFS[unit.id].traits.includes("finance"))
        .map((unit) => unit.id),
    );
    const candidates = shop.flatMap((id, shopIndex) => {
      if (!id || usedShopIndexes.has(shopIndex)) return [];
      const definition = UNIT_DEFS[id];
      const index = targetIndex.get(id);
      const isTarget = index !== undefined;
      if (
        isTarget
        && nextCopies[index] >= targets[index].desiredCopies
      ) return [];
      if (!isTarget && !needsPopulation) return [];
      const nextCopiesForCandidate = [...nextCopies];
      let nextTransitionForCandidate = nextTransitionUnits;
      if (isTarget) nextCopiesForCandidate[index] += 1;
      else nextTransitionForCandidate = addTransitionUnit(nextTransitionUnits, id);
      const nextRosterCount = targetPhysicalCount(nextCopiesForCandidate, targets)
        + nextTransitionForCandidate.length;
      const overflow = nextRosterCount - maxRoster;
      if (overflow > 0 && transitionSaleIndex(nextTransitionForCandidate) < 0) return [];
      const targetValue = isTarget
        ? purchaseMarginalValue(nextCopies[index], targets[index])
        : 0;
      const transitionValue = unitCombatStrength(id, 1);
      const advancesFinance = definition.traits.includes("finance")
        && !currentFinanceIds.has(id);
      const score = needsPopulation
        ? 100 - definition.cost * 4 + (advancesFinance ? 5 : 0)
        : isTarget
          ? targetValue + transitionValue + (advancesFinance ? 64 : 0)
          : transitionValue * 3 + (advancesFinance ? 64 : 0);
      return [{ id, index, shopIndex, score }];
    }).sort((left, right) => right.score - left.score || left.shopIndex - right.shopIndex);
    const candidate = candidates.find(({ id }) => UNIT_DEFS[id].cost <= nextGold);
    if (!candidate) break;
    usedShopIndexes.add(candidate.shopIndex);
    const index = targetIndex.get(candidate.id);
    const nextCopiesForCandidate = [...nextCopies];
    let nextTransitionForCandidate = nextTransitionUnits;
    if (index !== undefined) nextCopiesForCandidate[index] += 1;
    else nextTransitionForCandidate = addTransitionUnit(nextTransitionUnits, candidate.id);
    const nextRosterCount = targetPhysicalCount(nextCopiesForCandidate, targets)
      + nextTransitionForCandidate.length;
    if (nextRosterCount > maxRoster) {
      const preserveFinance = financeMemberCount(
        nextCopiesForCandidate,
        targets,
        nextTransitionForCandidate,
      ) >= 4;
      let saleIndex = transitionSaleIndex(nextTransitionUnits, preserveFinance);
      if (saleIndex < 0) saleIndex = transitionSaleIndex(nextTransitionUnits);
      if (saleIndex < 0) break;
      const [sold] = nextTransitionUnits.splice(saleIndex, 1);
      nextGold += transitionSellValue(sold);
      saleLog.push(sold.id);
    }
    nextGold -= UNIT_DEFS[candidate.id].cost;
    if (index !== undefined) nextCopies[index] += 1;
    else nextTransitionUnits = addTransitionUnit(nextTransitionUnits, candidate.id);
    purchaseLog.push(candidate.id);
  }
  return { gold: nextGold, copies: nextCopies, transitionUnits: nextTransitionUnits };
};

const upgradeCostToLevel = (state: PlannerState, targetLevel: PlayerLevel) => {
  if (targetLevel <= state.playerLevel) return 0;
  let cost = state.upgradeRemaining;
  for (let level = state.playerLevel + 1; level < targetLevel; level += 1) {
    cost += PLAYER_LEVEL_CONFIG[level as PlayerLevel].upgradeCost || 0;
  }
  return cost;
};

const nextUpgradeRemaining = (level: PlayerLevel) => (
  level >= MAX_PLAYER_LEVEL ? 0 : PLAYER_LEVEL_CONFIG[level].upgradeCost || 0
);

const rerollChoices = (gold: number, freeRerolls: number, availableShops: number) => {
  const affordable = Math.max(0, Math.min(availableShops, gold + freeRerolls));
  const loose = Math.max(0, gold % 4);
  return Array.from(new Set([0, freeRerolls, loose, 2, 4, 8, 12, 24]
    .map((value) => Math.max(0, Math.min(affordable, Math.floor(value))))))
    .sort((left, right) => left - right);
};

const levelChoices = (state: PlannerState) => PLAYER_LEVELS.filter((level) => (
  level >= state.playerLevel && upgradeCostToLevel(state, level) <= state.gold
));

const stateEvaluation = (
  state: PlannerState,
  request: SeerPlannerRequest,
  initialActiveStrength: number,
  initialEnemyThreat: number,
) => {
  const progress = targetProgressScore(state.copies, request.targets);
  const currentThreat = request.futureWaves?.[state.depth]?.threat
    ?? enemyThreatForRound(state.round, request.seed);
  const levelGain = (state.playerLevel - request.playerLevel) * 72;
  const nextThreat = request.futureWaves?.[state.depth + 1]?.threat
    ?? enemyThreatForRound(state.round + 1, request.seed);
  const currentMargin = calibratedAbstractMargin(
    state.activeStrength,
    currentThreat,
    initialActiveStrength,
    initialEnemyThreat,
    request.currentCombatScore,
  );
  const nextMargin = calibratedAbstractMargin(
    state.activeStrength,
    nextThreat,
    initialActiveStrength,
    initialEnemyThreat,
    request.currentCombatScore,
  ) + levelGain;
  const lookaheadThreat = (request.futureWaves || [])
    .slice(state.depth + 1, state.depth + 5)
    .reduce((maximum, wave) => Math.max(maximum, wave.threat), nextThreat);
  const futureRisk = Math.max(
    0,
    lookaheadThreat - nextThreat - Math.max(0, currentMargin),
  );
  const firstStepLevel = state.firstStep?.targetLevel || request.playerLevel;
  const highTierTiming = firstStepLevel >= 8 ? firstStepLevel * 2_500 : 0;
  return state.hp * 100_000_000
    + (nextMargin >= -40 ? 1_000_000 : -1_000_000)
    + Math.max(-1200, Math.min(1200, nextMargin)) * 10_000
    + progress
    + state.gold * 20
    + state.playerLevel * 480
    + highTierTiming
    - Math.min(1_200, futureRisk) * 120
    - state.cursors.reduce((total, cursor) => total + cursor, 0) * 2;
};

const dominanceKey = (state: PlannerState) => [
  state.depth,
  state.round,
  state.playerLevel,
  state.upgradeRemaining,
  state.cursors.join(","),
  state.currentShop.join(","),
  state.copies.join(","),
  state.transitionUnits.map((unit) => `${unit.id}:${unit.star}`).sort().join(","),
].join("/");

const pruneDominatedStates = (states: readonly PlannerState[]) => {
  const groups = new Map<string, PlannerState[]>();
  states.forEach((state) => {
    const key = dominanceKey(state);
    const group = groups.get(key) || [];
    group.push(state);
    groups.set(key, group);
  });
  let pruned = 0;
  const frontier: PlannerState[] = [];
  groups.forEach((group) => {
    const survivors: PlannerState[] = [];
    group
      .sort((left, right) => right.gold - left.gold || right.hp - left.hp)
      .forEach((state) => {
        const dominated = survivors.some((survivor) => (
          survivor.gold >= state.gold
          && survivor.hp >= state.hp
          && survivor.streak >= state.streak
          && survivor.paydayDebtRounds <= state.paydayDebtRounds
        ));
        if (dominated) {
          pruned += 1;
          return;
        }
        for (let index = survivors.length - 1; index >= 0; index -= 1) {
          const survivor = survivors[index];
          if (
            state.gold >= survivor.gold
            && state.hp >= survivor.hp
            && state.streak >= survivor.streak
            && state.paydayDebtRounds <= survivor.paydayDebtRounds
          ) survivors.splice(index, 1);
        }
        survivors.push(state);
      });
    frontier.push(...survivors);
  });
  return { states: frontier, pruned };
};

const projectedBattleWin = (
  state: PlannerState,
  request: SeerPlannerRequest,
  initialActiveStrength: number,
  initialEnemyThreat: number,
) => {
  const waveThreat = request.futureWaves?.[state.depth]?.threat
    ?? enemyThreatForRound(state.round, request.seed);
  const levelGain = (state.playerLevel - request.playerLevel) * 72;
  return calibratedAbstractMargin(
    state.activeStrength,
    waveThreat,
    initialActiveStrength,
    initialEnemyThreat,
    request.currentCombatScore,
  ) + levelGain;
};

const predictedDefeatDamage = (round: number, margin: number) => Math.min(
  8,
  2 + Math.floor((Math.max(1, round) - 1) / 3) + (margin < -200 ? 2 : 1),
);

type PreparedLevelPrefix = {
  gold: number;
  cursors: number[];
  copies: number[];
  transitionUnits: SeerPlannerUnit[];
  purchasesByShop: UnitId[][];
  salesByShop: UnitId[][];
};

const buildLevelPrefixes = (
  state: PlannerState,
  targetLevel: PlayerLevel,
  request: SeerPlannerRequest,
  maximumRequestedRerolls = 24,
) => {
  const upgradeCost = upgradeCostToLevel(state, targetLevel);
  if (upgradeCost > state.gold) return [];
  let gold = state.gold - upgradeCost;
  let copies = [...state.copies];
  let transitionUnits = [...state.transitionUnits];
  const cursors = [...state.cursors];
  const targetLevelIndex = levelIndex(targetLevel);
  const purchasesByShop: UnitId[][] = [];
  const salesByShop: UnitId[][] = [];
  const currentPurchases: UnitId[] = [];
  const currentSales: UnitId[] = [];
  ({ gold, copies, transitionUnits } = buyFromShop(
    state.currentShop,
    gold,
    copies,
    transitionUnits,
    targetLevel,
    request.targets,
    currentPurchases,
    currentSales,
  ));
  purchasesByShop.push(currentPurchases);
  salesByShop.push(currentSales);

  const prefixes: PreparedLevelPrefix[] = [];
  const addPrefix = () => {
    prefixes.push({
      gold,
      cursors: [...cursors],
      copies: [...copies],
      transitionUnits: [...transitionUnits],
      purchasesByShop: purchasesByShop.map((shop) => [...shop]),
      salesByShop: salesByShop.map((shop) => [...shop]),
    });
  };
  addPrefix();

  const availableShops = request.futureShops[targetLevel].length
    - state.cursors[targetLevelIndex];
  const freeRerolls = state.depth === 0 ? request.freeRerolls : 0;
  const maximumRerolls = Math.min(
    Math.max(0, Math.floor(maximumRequestedRerolls)),
    Math.max(0, availableShops),
    Math.max(0, Math.floor(gold + freeRerolls)),
  );
  for (let refresh = 0; refresh < maximumRerolls; refresh += 1) {
    const cursor = cursors[targetLevelIndex];
    if (cursor >= request.futureShops[targetLevel].length) break;
    const paid = refresh >= freeRerolls;
    if (paid && gold < 1) break;
    if (paid) gold -= 1;
    const shop = request.futureShops[targetLevel][cursor];
    cursors[targetLevelIndex] += 1;
    const purchases: UnitId[] = [];
    const sales: UnitId[] = [];
    ({ gold, copies, transitionUnits } = buyFromShop(
      shop,
      gold,
      copies,
      transitionUnits,
      targetLevel,
      request.targets,
      purchases,
      sales,
    ));
    purchasesByShop.push(purchases);
    salesByShop.push(sales);
    addPrefix();
  }
  return prefixes;
};

const advanceState = (
  state: PlannerState,
  targetLevel: PlayerLevel,
  rerolls: number,
  request: SeerPlannerRequest,
  initialActiveStrength: number,
  initialEnemyThreat: number,
  prefix: PreparedLevelPrefix,
): PlannerState | null => {
  const active = activeRosterStrength(
    prefix.copies,
    request.targets,
    prefix.transitionUnits,
    PLAYER_LEVEL_CONFIG[targetLevel].boardCap,
  );
  const action = {
    targetLevel,
    rerolls,
    expectedGoldAfterPreparation: prefix.gold,
    purchasesByShop: prefix.purchasesByShop,
    salesByShop: prefix.salesByShop,
  } satisfies SeerRoundAction;
  const step: SeerPlanStep = {
    ...action,
    expectedGoldBeforePreparation: state.gold,
    expectedHp: state.hp,
    expectedPlayerLevel: state.playerLevel,
    expectedShop: [...state.currentShop],
    expectedTargetCopies: Object.fromEntries(request.targets.map((target, index) => [
      target.id,
      state.copies[index] || 0,
    ])) as Partial<Record<UnitId, number>>,
    expectedTransitionUnits: state.transitionUnits.map((unit) => ({ ...unit })),
    expectedBoardCount: state.boardCount,
    expectedRosterCount: targetPhysicalCount(
      state.copies,
      request.targets,
    ) + state.transitionUnits.length,
  };
  const preparationState: PlannerState = {
    ...state,
    gold: prefix.gold,
    playerLevel: targetLevel,
    upgradeRemaining: nextUpgradeRemaining(targetLevel),
    cursors: prefix.cursors,
    copies: prefix.copies,
    transitionUnits: prefix.transitionUnits,
    boardCount: active.count,
    activeStrength: active.strength,
    firstStep: state.firstStep || action,
    path: { previous: state.path, step },
  };
  const battleMargin = projectedBattleWin(
    preparationState,
    request,
    initialActiveStrength,
    initialEnemyThreat,
  );
  const won = battleMargin >= -40;
  const wave = request.futureWaves?.[state.depth]
    || waveForecastForRound(state.round, request.seed);
  step.expectedWave = wave;
  step.expectedBattleMargin = battleMargin;
  step.expectedBattleWon = won;
  const bounty = wave.units.reduce((total, unit) => total + unit.star, 0);
  const financeActive = request.financeActive || activeFinanceMemberCount(
    prefix.copies,
    request.targets,
    prefix.transitionUnits,
    PLAYER_LEVEL_CONFIG[targetLevel].boardCap,
  ) >= 4;
  const interestStep = financeActive ? 4 : 5;
  const interestCap = financeActive ? FINANCE_INTEREST_CAP : NORMAL_INTEREST_CAP;
  let gold = prefix.gold;
  const interest = Math.min(interestCap, Math.floor(gold / interestStep));
  const streak = won ? state.streak + 1 : 0;
  const streakBonus = won ? Math.min(2, Math.max(0, streak - 1)) : 0;
  const debtPayment = state.paydayDebtRounds > 0 ? 1 : 0;
  gold += Math.max(
    0,
    bounty + interest + streakBonus + (financeActive ? 2 : 0)
      + request.incomeBonus - debtPayment,
  );
  const projectedHp = won
    ? state.hp
    : state.hp - predictedDefeatDamage(state.round, battleMargin);
  if (projectedHp <= 0 && !request.continueAfterForecastDeath) return null;
  // The abstract threat model is deliberately conservative and can call an
  // otherwise playable line dead long before the real combat simulator does.
  // In oracle mode that is a risk signal, not a reason to stop constructing the
  // 60-round route. Preserve the negative forecast so the beam can still rank
  // later routes by how much damage they would have taken.
  const hp = projectedHp;

  let currentShop: Shop = [];
  const cursors = [...prefix.cursors];
  const targetLevelIndex = levelIndex(targetLevel);
  if (state.depth + 1 < (request.horizon || DEFAULT_HORIZON)) {
    const cursor = cursors[targetLevelIndex];
    currentShop = request.futureShops[targetLevel][cursor] || [];
    if (currentShop.length > 0) cursors[targetLevelIndex] += 1;
  }
  return {
    depth: state.depth + 1,
    round: state.round + 1,
    hp,
    gold,
    playerLevel: targetLevel,
    upgradeRemaining: Math.max(0, nextUpgradeRemaining(targetLevel) - 1),
    streak,
    paydayDebtRounds: Math.max(0, state.paydayDebtRounds - 1),
    cursors,
    currentShop,
    copies: prefix.copies,
    transitionUnits: prefix.transitionUnits,
    boardCount: active.count,
    activeStrength: active.strength,
    firstStep: state.firstStep || action,
    path: preparationState.path,
  };
};

const expandFrontier = (
  frontier: readonly PlannerState[],
  depth: number,
  request: SeerPlannerRequest,
  initialActiveStrength: number,
  initialEnemyThreat: number,
) => {
  const states: PlannerState[] = [];
  let explored = 0;
  frontier.forEach((state) => {
    levelChoices(state).forEach((targetLevel) => {
      const upgradeCost = upgradeCostToLevel(state, targetLevel);
      const availableShops = request.futureShops[targetLevel].length
        - state.cursors[levelIndex(targetLevel)];
      const choices = rerollChoices(
        state.gold - upgradeCost,
        depth === 0 ? request.freeRerolls : 0,
        availableShops,
      );
      const prefixes = buildLevelPrefixes(
        state,
        targetLevel,
        request,
        choices.at(-1) || 0,
      );
      choices.forEach((rerolls) => {
          const prefix = prefixes[rerolls];
          if (!prefix) return;
          const next = advanceState(
            state,
            targetLevel,
            rerolls,
            request,
            initialActiveStrength,
            initialEnemyThreat,
            prefix,
          );
          explored += 1;
          if (next) states.push(next);
        });
    });
  });
  return { states, explored };
};

export const planSeerEconomy = (request: SeerPlannerRequest): SeerPlan => {
  const horizon = Math.max(1, Math.floor(request.horizon || DEFAULT_HORIZON));
  const futureWaves = request.futureWaves?.length === horizon
    ? request.futureWaves
    : forecastSeerWaves(request.round, request.seed, horizon);
  const planningRequest: SeerPlannerRequest = {
    ...request,
    horizon,
    futureWaves,
  };
  const beamWidth = Math.max(8, Math.floor(request.beamWidth || DEFAULT_BEAM_WIDTH));
  const initialCopies = planningRequest.targets.map((target) => Math.max(
    0,
    Math.min(target.desiredCopies, Math.floor(request.targetCopies[target.id] || 0)),
  ));
  const initialTransitionUnits = (planningRequest.currentTransitionUnits || []).map((unit) => ({
    id: unit.id,
    star: unit.star,
  }));
  const initialActiveStrength = planningRequest.currentBoardStrength || 0;
  const initialEnemyThreat = futureWaves[0]?.threat
    ?? enemyThreatForRound(planningRequest.round, planningRequest.seed);
  const initialActive = activeRosterStrength(
    initialCopies,
    planningRequest.targets,
    initialTransitionUnits,
    planningRequest.currentBoardCount
      ?? PLAYER_LEVEL_CONFIG[planningRequest.playerLevel].boardCap,
  );
  let frontier: PlannerState[] = [{
    depth: 0,
    round: planningRequest.round,
    hp: planningRequest.hp,
    gold: planningRequest.gold,
    playerLevel: planningRequest.playerLevel,
    upgradeRemaining: planningRequest.upgradeRemaining,
    streak: planningRequest.streak,
    paydayDebtRounds: planningRequest.paydayDebtRounds,
    cursors: PLAYER_LEVELS.map(() => 0),
    currentShop: planningRequest.currentShop,
    copies: initialCopies,
    transitionUnits: initialTransitionUnits,
    boardCount: planningRequest.currentBoardCount ?? initialActive.count,
    activeStrength: initialActiveStrength,
    firstStep: null,
    path: null,
  }];
  let exploredStates = 0;
  let dominancePrunes = 0;
  let bestReachable = frontier[0];

  for (let depth = 0; depth < horizon; depth += 1) {
    const expansion = expandFrontier(
      frontier,
      depth,
      planningRequest,
      initialActiveStrength,
      initialEnemyThreat,
    );
    exploredStates += expansion.explored;
    const expanded = expansion.states;
    if (expanded.length === 0) break;
    const dominated = pruneDominatedStates(expanded);
    dominancePrunes += dominated.pruned;
    const deepest = dominated.states
      .sort((left, right) => (
        stateEvaluation(right, planningRequest, initialActiveStrength, initialEnemyThreat)
          - stateEvaluation(left, planningRequest, initialActiveStrength, initialEnemyThreat)
      ))[0];
    if (
      deepest
      && (
        !bestReachable
        || deepest.depth > bestReachable.depth
        || (
          deepest.depth === bestReachable.depth
          && stateEvaluation(deepest, planningRequest, initialActiveStrength, initialEnemyThreat)
            > stateEvaluation(bestReachable, planningRequest, initialActiveStrength, initialEnemyThreat)
        )
      )
    ) {
      bestReachable = deepest;
    }
    frontier = dominated.states
      .slice(0, beamWidth);
  }

  const best = bestReachable;
  const fallback: SeerRoundAction = {
    targetLevel: planningRequest.playerLevel,
    rerolls: 0,
    expectedGoldAfterPreparation: planningRequest.gold,
    purchasesByShop: [],
    salesByShop: [],
  };
  const steps: SeerPlanStep[] = [];
  let path = best?.path || null;
  while (path) {
    steps.push(path.step);
    path = path.previous;
  }
  steps.reverse();
  const projectedTargetCopies = Object.fromEntries(planningRequest.targets.map((target, index) => [
    target.id,
    best?.copies[index] || initialCopies[index],
  ])) as Partial<Record<UnitId, number>>;
  return {
    firstStep: steps[0] || best?.firstStep || fallback,
    startRound: planningRequest.round,
    steps,
    planningHorizon: horizon,
    complete: steps.length >= horizon,
    futureWaves,
    projectedRound: best?.round || planningRequest.round,
    projectedHp: best?.hp || planningRequest.hp,
    projectedGold: best?.gold || planningRequest.gold,
    projectedLevel: best?.playerLevel || planningRequest.playerLevel,
    projectedTargetCopies,
    projectedBoardCount: best?.boardCount
      || planningRequest.currentBoardCount
      || initialActive.count,
    projectedRosterCount: best
      ? targetPhysicalCount(best.copies, planningRequest.targets) + best.transitionUnits.length
      : targetPhysicalCount(initialCopies, planningRequest.targets) + initialTransitionUnits.length,
    score: best
      ? stateEvaluation(best, planningRequest, initialActiveStrength, initialEnemyThreat)
      : 0,
    exploredStates,
    dominancePrunes,
  };
};
