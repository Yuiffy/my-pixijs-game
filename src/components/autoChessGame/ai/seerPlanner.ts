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
};

export type SeerTarget = {
  id: UnitId;
  priority: number;
  desiredCopies: number;
};

export type SeerShopForecast = Record<PlayerLevel, readonly Shop[]>;

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
  horizon?: number;
  beamWidth?: number;
};

export type SeerRoundAction = {
  targetLevel: PlayerLevel;
  rerolls: number;
  expectedGoldAfterPreparation: number;
  purchasesByShop?: readonly (readonly UnitId[])[];
  salesByShop?: readonly (readonly UnitId[])[];
};

export type SeerPlan = {
  firstStep: SeerRoundAction;
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
};

const DEFAULT_HORIZON = 50;
const DEFAULT_BEAM_WIDTH = 96;
const BENCH_CAPACITY = 8;
const STAR_POWER = [0, 1, 2.6, 7] as const;
const levelIndex = (level: PlayerLevel) => PLAYER_LEVELS.indexOf(level);
const waveThreatCache = new Map<string, number>();

const enemyThreatForRound = (round: number, seed: number) => {
  const key = `${seed}/${round}`;
  const cached = waveThreatCache.get(key);
  if (cached !== undefined) return cached;
  const wave = waveForRound(round, seed);
  const traitPressure = enemyTraitActivations(wave.units).reduce(
    (total, trait) => total + trait.level * 35 + trait.count * 4,
    0,
  );
  const tagPressure = wave.tag === "boss" ? 600 : wave.tag === "elite" ? 280 : 0;
  const threat = enemyBudgetForRound(round) * 12 + traitPressure + tagPressure;
  waveThreatCache.set(key, threat);
  return threat;
};

const unitCombatStrength = (id: UnitId, star: 1 | 2 | 3) => (
  UNIT_DEFS[id].cost * 12 * STAR_POWER[star]
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

const addTransitionUnit = (
  transitionUnits: readonly SeerPlannerUnit[],
  id: UnitId,
) => {
  const next = [...transitionUnits, { id, star: 1 as const }];
  for (const star of [1, 2] as const) {
    while (next.filter((unit) => unit.id === id && unit.star === star).length >= 3) {
      const matches = next
        .map((unit, index) => ({ unit, index }))
        .filter(({ unit }) => unit.id === id && unit.star === star)
        .slice(0, 3);
      if (matches.length < 3) break;
      const keep = matches[0];
      next[keep.index] = { id, star: (star + 1) as 2 | 3 };
      matches
        .slice(1)
        .sort((left, right) => right.index - left.index)
        .forEach(({ index }) => next.splice(index, 1));
    }
  }
  return next;
};

const transitionSaleIndex = (transitionUnits: readonly SeerPlannerUnit[]) => {
  let bestIndex = -1;
  let bestStrength = Number.POSITIVE_INFINITY;
  transitionUnits.forEach((unit, index) => {
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
      const score = isTarget
        ? targetValue + transitionValue * (needsPopulation ? 2 : 1)
        : transitionValue * 3 + (definition.traits.includes("finance") ? 24 : 0);
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
      const saleIndex = transitionSaleIndex(nextTransitionUnits);
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
  const strengthGain = state.activeStrength - initialActiveStrength;
  const threatGrowth = Math.max(
    0,
    enemyThreatForRound(state.round, request.seed) - initialEnemyThreat,
  );
  const levelGain = (state.playerLevel - request.playerLevel) * 72;
  const readiness = strengthGain + levelGain - threatGrowth;
  const nextThreat = enemyThreatForRound(state.round + 1, request.seed);
  const nextMargin = readiness - Math.max(0, nextThreat - initialEnemyThreat);
  const firstStepLevel = state.firstStep?.targetLevel || request.playerLevel;
  const highTierTiming = firstStepLevel >= 8 ? firstStepLevel * 2_500 : 0;
  return state.hp * 100_000_000
    + (nextMargin >= -40 ? 1_000_000 : -1_000_000)
    + Math.max(-1200, Math.min(1200, nextMargin)) * 10_000
    + progress
    + state.gold * 20
    + state.playerLevel * 480
    + highTierTiming
    - state.cursors.reduce((total, cursor) => total + cursor, 0) * 2;
};

const dominanceKey = (state: PlannerState) => [
  state.depth,
  state.round,
  state.playerLevel,
  state.upgradeRemaining,
  state.cursors.join(","),
  state.hp,
  Math.min(2, state.streak),
  state.paydayDebtRounds,
  state.copies.join(","),
  state.transitionUnits.map((unit) => `${unit.id}:${unit.star}`).sort().join(","),
].join("/");

const pruneDominatedStates = (states: readonly PlannerState[]) => {
  const bestByKey = new Map<string, PlannerState>();
  let pruned = 0;
  states.forEach((state) => {
    const key = dominanceKey(state);
    const current = bestByKey.get(key);
    if (!current || state.gold > current.gold) {
      if (current) pruned += 1;
      bestByKey.set(key, state);
    } else {
      pruned += 1;
    }
  });
  return { states: Array.from(bestByKey.values()), pruned };
};

const projectedBattleWin = (
  state: PlannerState,
  request: SeerPlannerRequest,
  initialActiveStrength: number,
  initialEnemyThreat: number,
) => {
  const exactMargin = request.currentCombatScore >= 9000
    ? (request.currentCombatScore - 10000) * 2
    : -240;
  const strengthGain = state.activeStrength - initialActiveStrength;
  const levelGain = (state.playerLevel - request.playerLevel) * 72;
  const threatGrowth = Math.max(
    0,
    enemyThreatForRound(state.round, request.seed) - initialEnemyThreat,
  );
  return exactMargin + strengthGain + levelGain - threatGrowth;
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
  const addPrefix = (rerolls: number) => {
    prefixes.push({
      gold,
      cursors: [...cursors],
      copies: [...copies],
      transitionUnits: [...transitionUnits],
      purchasesByShop: purchasesByShop.map((shop) => [...shop]),
      salesByShop: salesByShop.map((shop) => [...shop]),
    });
  };
  addPrefix(0);

  const availableShops = request.futureShops[targetLevel].length
    - state.cursors[targetLevelIndex];
  const freeRerolls = state.depth === 0 ? request.freeRerolls : 0;
  const maximumRerolls = Math.min(
    24,
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
    addPrefix(refresh + 1);
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
  };
  const battleMargin = projectedBattleWin(
    preparationState,
    request,
    initialActiveStrength,
    initialEnemyThreat,
  );
  const won = battleMargin >= -40;
  const wave = waveForRound(state.round, request.seed);
  const bounty = wave.units.reduce((total, unit) => total + (unit.star || 1), 0);
  const interestStep = request.financeActive ? 4 : 5;
  const interestCap = request.financeActive ? FINANCE_INTEREST_CAP : NORMAL_INTEREST_CAP;
  let gold = prefix.gold;
  const interest = Math.min(interestCap, Math.floor(gold / interestStep));
  const streak = won ? state.streak + 1 : 0;
  const streakBonus = won ? Math.min(2, Math.max(0, streak - 1)) : 0;
  const debtPayment = state.paydayDebtRounds > 0 ? 1 : 0;
  gold += Math.max(
    0,
    bounty + interest + streakBonus + (request.financeActive ? 2 : 0)
      + request.incomeBonus - debtPayment,
  );
  const hp = won
    ? state.hp
    : state.hp - predictedDefeatDamage(state.round, battleMargin);
  if (hp <= 0) return null;

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
      const prefixes = buildLevelPrefixes(state, targetLevel, request);
      rerollChoices(state.gold - upgradeCost, depth === 0 ? request.freeRerolls : 0, availableShops)
        .forEach((rerolls) => {
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
  const beamWidth = Math.max(8, Math.floor(request.beamWidth || DEFAULT_BEAM_WIDTH));
  const initialCopies = request.targets.map((target) => Math.max(
    0,
    Math.min(target.desiredCopies, Math.floor(request.targetCopies[target.id] || 0)),
  ));
  const initialTransitionUnits = (request.currentTransitionUnits || []).map((unit) => ({
    id: unit.id,
    star: unit.star,
  }));
  const initialActiveStrength = request.currentBoardStrength || 0;
  const initialEnemyThreat = enemyThreatForRound(request.round, request.seed);
  const initialActive = activeRosterStrength(
    initialCopies,
    request.targets,
    initialTransitionUnits,
    request.currentBoardCount ?? PLAYER_LEVEL_CONFIG[request.playerLevel].boardCap,
  );
  let frontier: PlannerState[] = [{
    depth: 0,
    round: request.round,
    hp: request.hp,
    gold: request.gold,
    playerLevel: request.playerLevel,
    upgradeRemaining: request.upgradeRemaining,
    streak: request.streak,
    paydayDebtRounds: request.paydayDebtRounds,
    cursors: PLAYER_LEVELS.map(() => 0),
    currentShop: request.currentShop,
    copies: initialCopies,
    transitionUnits: initialTransitionUnits,
    boardCount: request.currentBoardCount ?? initialActive.count,
    activeStrength: initialActiveStrength,
    firstStep: null,
  }];
  let exploredStates = 0;
  let dominancePrunes = 0;

  for (let depth = 0; depth < horizon; depth += 1) {
    const expansion = expandFrontier(
      frontier,
      depth,
      request,
      initialActiveStrength,
      initialEnemyThreat,
    );
    exploredStates += expansion.explored;
    const expanded = expansion.states;
    if (expanded.length === 0) break;
    const dominated = pruneDominatedStates(expanded);
    dominancePrunes += dominated.pruned;
    frontier = dominated.states
      .sort((left, right) => (
        stateEvaluation(right, request, initialActiveStrength, initialEnemyThreat)
          - stateEvaluation(left, request, initialActiveStrength, initialEnemyThreat)
      ))
      .slice(0, beamWidth);
  }

  const best = [...frontier].sort((left, right) => (
    stateEvaluation(right, request, initialActiveStrength, initialEnemyThreat)
      - stateEvaluation(left, request, initialActiveStrength, initialEnemyThreat)
  ))[0];
  const fallback: SeerRoundAction = {
    targetLevel: request.playerLevel,
    rerolls: 0,
    expectedGoldAfterPreparation: request.gold,
    purchasesByShop: [],
    salesByShop: [],
  };
  const projectedTargetCopies = Object.fromEntries(request.targets.map((target, index) => [
    target.id,
    best?.copies[index] || initialCopies[index],
  ])) as Partial<Record<UnitId, number>>;
  return {
    firstStep: best?.firstStep || fallback,
    projectedRound: best?.round || request.round,
    projectedHp: best?.hp || request.hp,
    projectedGold: best?.gold || request.gold,
    projectedLevel: best?.playerLevel || request.playerLevel,
    projectedTargetCopies,
    projectedBoardCount: best?.boardCount || request.currentBoardCount || initialActive.count,
    projectedRosterCount: best
      ? targetPhysicalCount(best.copies, request.targets) + best.transitionUnits.length
      : targetPhysicalCount(initialCopies, request.targets) + initialTransitionUnits.length,
    score: best ? stateEvaluation(best, request, initialActiveStrength, initialEnemyThreat) : 0,
    exploredStates,
    dominancePrunes,
  };
};
