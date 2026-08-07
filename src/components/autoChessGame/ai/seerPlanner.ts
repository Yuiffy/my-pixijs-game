import {
  FINANCE_INTEREST_CAP,
  MAX_PLAYER_LEVEL,
  NORMAL_INTEREST_CAP,
  PLAYER_LEVEL_CONFIG,
  PLAYER_LEVELS,
  UNIT_DEFS,
  enemyBudgetForRound,
  waveForRound,
  type PlayerLevel,
  type UnitId,
} from "../core/gameData";

type Shop = readonly (UnitId | null)[];

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
};

export type SeerPlan = {
  firstStep: SeerRoundAction;
  projectedRound: number;
  projectedHp: number;
  projectedGold: number;
  projectedLevel: PlayerLevel;
  projectedTargetCopies: Partial<Record<UnitId, number>>;
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
  firstStep: SeerRoundAction | null;
};

const DEFAULT_HORIZON = 8;
const DEFAULT_BEAM_WIDTH = 96;
const STAR_POWER = [0, 1, 2.6, 7] as const;
const levelIndex = (level: PlayerLevel) => PLAYER_LEVELS.indexOf(level);

const targetStarForCopies = (copies: number) => (
  copies >= 9 ? 3 : copies >= 3 ? 2 : copies >= 1 ? 1 : 0
);

const targetCombatStrength = (copies: readonly number[], targets: readonly SeerTarget[]) => (
  copies.reduce((total, count, index) => {
    const target = targets[index];
    if (!target) return total;
    const star = targetStarForCopies(count);
    const partialTwoStarBonus = count >= 6 && count < 9 ? 0.6 : 0;
    return total + UNIT_DEFS[target.id].cost * 12 * (STAR_POWER[star] + partialTwoStarBonus);
  }, 0)
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

const buyTargetsFromShop = (
  shop: Shop,
  gold: number,
  copies: readonly number[],
  targets: readonly SeerTarget[],
) => {
  const nextCopies = [...copies];
  let nextGold = gold;
  const targetIndex = new Map(targets.map((target, index) => [target.id, index]));
  const available = shop.flatMap((id, shopIndex) => {
    if (!id) return [];
    const index = targetIndex.get(id);
    if (index === undefined || nextCopies[index] >= targets[index].desiredCopies) return [];
    return [{ id, index, shopIndex }];
  });

  while (available.length > 0) {
    available.sort((left, right) => (
      purchaseMarginalValue(nextCopies[right.index], targets[right.index])
        - purchaseMarginalValue(nextCopies[left.index], targets[left.index])
      || left.shopIndex - right.shopIndex
    ));
    let candidateIndex = -1;
    for (let index = 0; index < available.length; index += 1) {
      const candidate = available[index];
      if (
        nextCopies[candidate.index] < targets[candidate.index].desiredCopies
        && UNIT_DEFS[candidate.id].cost <= nextGold
      ) {
        candidateIndex = index;
        break;
      }
    }
    if (candidateIndex < 0) break;
    const [candidate] = available.splice(candidateIndex, 1);
    nextGold -= UNIT_DEFS[candidate.id].cost;
    nextCopies[candidate.index] += 1;
  }
  return { gold: nextGold, copies: nextCopies };
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
  initialStrength: number,
  initialEnemyBudget: number,
) => {
  const progress = targetProgressScore(state.copies, request.targets);
  const strengthGain = targetCombatStrength(state.copies, request.targets) - initialStrength;
  const threatGrowth = Math.max(0, enemyBudgetForRound(state.round) - initialEnemyBudget) * 12;
  const levelGain = (state.playerLevel - request.playerLevel) * 72;
  const readiness = strengthGain + levelGain - threatGrowth;
  return state.hp * 15000
    + progress
    + state.gold * 20
    + state.playerLevel * 480
    + Math.max(-1200, Math.min(1200, readiness)) * 2
    - state.cursors.reduce((total, cursor) => total + cursor, 0) * 2;
};

const dominanceKey = (state: PlannerState) => [
  state.depth,
  state.round,
  state.playerLevel,
  state.upgradeRemaining,
  state.cursors.join(","),
  Math.ceil(state.hp / 4),
  Math.min(2, state.streak),
  state.paydayDebtRounds,
  state.copies.join(","),
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
  initialStrength: number,
  initialEnemyBudget: number,
) => {
  const exactMargin = request.currentCombatScore >= 9000
    ? (request.currentCombatScore - 10000) * 2
    : -240;
  const strengthGain = targetCombatStrength(state.copies, request.targets) - initialStrength;
  const levelGain = (state.playerLevel - request.playerLevel) * 72;
  const threatGrowth = Math.max(0, enemyBudgetForRound(state.round) - initialEnemyBudget) * 12;
  return exactMargin + strengthGain + levelGain - threatGrowth >= -40;
};

const advanceState = (
  state: PlannerState,
  targetLevel: PlayerLevel,
  rerolls: number,
  request: SeerPlannerRequest,
  initialStrength: number,
  initialEnemyBudget: number,
): PlannerState | null => {
  const upgradeCost = upgradeCostToLevel(state, targetLevel);
  if (upgradeCost > state.gold) return null;
  let gold = state.gold - upgradeCost;
  let copies = [...state.copies];
  const cursors = [...state.cursors];
  const targetLevelIndex = levelIndex(targetLevel);
  ({ gold, copies } = buyTargetsFromShop(
    state.currentShop,
    gold,
    copies,
    request.targets,
  ));
  const freeRerolls = state.depth === 0 ? request.freeRerolls : 0;
  for (let refresh = 0; refresh < rerolls; refresh += 1) {
    const cursor = cursors[targetLevelIndex];
    if (cursor >= request.futureShops[targetLevel].length) return null;
    const paid = refresh >= freeRerolls;
    if (paid && gold < 1) return null;
    if (paid) gold -= 1;
    const shop = request.futureShops[targetLevel][cursor];
    cursors[targetLevelIndex] += 1;
    ({ gold, copies } = buyTargetsFromShop(shop, gold, copies, request.targets));
  }

  const action = {
    targetLevel,
    rerolls,
    expectedGoldAfterPreparation: gold,
  } satisfies SeerRoundAction;
  const preparationState: PlannerState = {
    ...state,
    gold,
    playerLevel: targetLevel,
    upgradeRemaining: nextUpgradeRemaining(targetLevel),
    cursors,
    copies,
    firstStep: state.firstStep || action,
  };
  const won = projectedBattleWin(
    preparationState,
    request,
    initialStrength,
    initialEnemyBudget,
  );
  const wave = waveForRound(state.round, request.seed);
  const bounty = wave.units.reduce((total, unit) => total + (unit.star || 1), 0);
  const interestStep = request.financeActive ? 4 : 5;
  const interestCap = request.financeActive ? FINANCE_INTEREST_CAP : NORMAL_INTEREST_CAP;
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
    : state.hp - Math.min(8, 4 + Math.floor((state.round - 1) / 3));
  if (hp <= 0) return null;

  let currentShop: Shop = [];
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
    copies,
    firstStep: state.firstStep || action,
  };
};

const expandFrontier = (
  frontier: readonly PlannerState[],
  depth: number,
  request: SeerPlannerRequest,
  initialStrength: number,
  initialEnemyBudget: number,
) => {
  const states: PlannerState[] = [];
  let explored = 0;
  frontier.forEach((state) => {
    levelChoices(state).forEach((targetLevel) => {
      const upgradeCost = upgradeCostToLevel(state, targetLevel);
      const availableShops = request.futureShops[targetLevel].length
        - state.cursors[levelIndex(targetLevel)];
      rerollChoices(state.gold - upgradeCost, depth === 0 ? request.freeRerolls : 0, availableShops)
        .forEach((rerolls) => {
          const next = advanceState(
            state,
            targetLevel,
            rerolls,
            request,
            initialStrength,
            initialEnemyBudget,
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
  const initialStrength = targetCombatStrength(initialCopies, request.targets);
  const initialEnemyBudget = enemyBudgetForRound(request.round);
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
    firstStep: null,
  }];
  let exploredStates = 0;
  let dominancePrunes = 0;

  for (let depth = 0; depth < horizon; depth += 1) {
    const expansion = expandFrontier(
      frontier,
      depth,
      request,
      initialStrength,
      initialEnemyBudget,
    );
    exploredStates += expansion.explored;
    const expanded = expansion.states;
    if (expanded.length === 0) break;
    const dominated = pruneDominatedStates(expanded);
    dominancePrunes += dominated.pruned;
    frontier = dominated.states
      .sort((left, right) => (
        stateEvaluation(right, request, initialStrength, initialEnemyBudget)
          - stateEvaluation(left, request, initialStrength, initialEnemyBudget)
      ))
      .slice(0, beamWidth);
  }

  const best = [...frontier].sort((left, right) => (
    stateEvaluation(right, request, initialStrength, initialEnemyBudget)
      - stateEvaluation(left, request, initialStrength, initialEnemyBudget)
  ))[0];
  const fallback: SeerRoundAction = {
    targetLevel: request.playerLevel,
    rerolls: 0,
    expectedGoldAfterPreparation: request.gold,
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
    score: best ? stateEvaluation(best, request, initialStrength, initialEnemyBudget) : 0,
    exploredStates,
    dominancePrunes,
  };
};
