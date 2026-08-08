import {
  FINANCE_INTEREST_CAP,
  NORMAL_INTEREST_CAP,
  PLAYER_LEVELS,
  TRAITS,
  UNIT_DEFS,
  traitLevelForCount,
  type PlayerLevel,
  type StarterId,
  type TraitId,
  type UnitId,
} from "../core/gameData";
import { AutoChessEngine } from "../core/gameEngine";
import type {
  BattleState,
  GamePhase,
  OwnedUnit,
  RoundResult,
  UnitLocation,
} from "../core/gameTypes";
import { EngineBridge, type GameAction } from "../phaser/EngineBridge";
import {
  informationModeForAutopilotStyle,
  resolveAutopilotStylePolicy,
  type AutopilotInformationMode,
  type AutopilotPolicy,
  type AutopilotStyle,
} from "./autopilotPolicy";
import {
  AUTOPILOT_LATE_GAME_TARGET_IDS,
  AUTOPILOT_TERMINAL_TARGET_IDS,
  AUTOPILOT_TERMINAL_TARGETS,
  desiredLateGameLevelForRound,
  lateGameTargetDesiredCopies,
  lateGameTargetPriority,
} from "./lateGamePlan";
import {
  planSeerEconomy,
  type SeerPlan,
  type SeerPlannerUnit,
  type SeerShopForecast,
} from "./seerPlanner";

const STARTER_PREFERENCE: StarterId[] = [
  "ranger_start",
  "mature_start",
  "dance_start",
  "bastion",
  "traffic_start",
  "blaze",
];

const AUGMENT_PREFERENCE = [
  "vitality",
  "momentum",
  "tempered",
  "precision",
  "united_front",
  "triage",
  "second_wind",
  "overclock",
  "sharp_edge",
  "execution",
  "payday",
  "glass_cannon",
] as const;

const FORMATION_PROFILES = {
  human_midline: {
    rei: 23,
    melee: [11, 17, 5, 10, 16, 4, 22, 9, 15, 3],
    ranged: [10, 16, 4, 22, 9, 15, 3, 21, 8, 14],
  },
  center_wedge: {
    rei: 23,
    melee: [11, 17, 10, 16, 5, 23, 9, 15, 4, 22],
    ranged: [10, 16, 9, 15, 4, 22, 3, 21, 8, 14],
  },
  split_flanks: {
    rei: 23,
    melee: [5, 23, 11, 17, 4, 22, 10, 16, 3, 21],
    ranged: [4, 22, 10, 16, 3, 21, 9, 15, 2, 20],
  },
} as const;
type FormationProfile = keyof typeof FORMATION_PROFILES;
const FORMATION_PROFILE_IDS = Object.keys(FORMATION_PROFILES) as FormationProfile[];
const STAR_POWER = { 1: 1, 2: 2.6, 3: 7 } as const;
const unitCopyValue = (unit: OwnedUnit) => (unit.star === 3 ? 9 : unit.star === 2 ? 3 : 1);
const ROLLOUT_CANDIDATE_LIMIT = 3;
const EVOLUTION_ELITE_LIMIT = 1;
const ROLLOUT_SEED_VARIANTS = 4;
const STARTER_ROLLOUT_BATTLES = 4;
const ECONOMY_ACTION_LIMIT = 72;
const FORMATION_ACTION_LIMIT = 88;
const PREPARATION_ACTION_LIMIT = 96;
const REPLACEMENT_PREVIEW_LIMIT = 5;
const REPLACEMENT_ROLLOUT_MIN_GAIN = 12;
const RESCUE_HEURISTIC_CANDIDATE_LIMIT = 24;
const ORACLE_SHOP_LOOKAHEAD = 128;
const SHARED_ROLLOUT_CACHE_LIMIT = 50000;
const EXACT_COMBAT_HZ = 60;
const DEFAULT_ROLLOUT_COMBAT_HZ = 30;
const sharedRolloutScoreCache = new Map<string, number>();
const sharedRolloutCacheStats = { hits: 0, misses: 0 };

export const getAutopilotRolloutCacheStats = () => ({
  ...sharedRolloutCacheStats,
  entries: sharedRolloutScoreCache.size,
});

export const hydrateAutopilotRolloutCache = (entries: Array<[string, number]>) => {
  entries.slice(-SHARED_ROLLOUT_CACHE_LIMIT).forEach(([key, score]) => {
    if (typeof key === "string" && Number.isFinite(score)) {
      sharedRolloutScoreCache.set(key, score);
    }
  });
};

export const snapshotAutopilotRolloutCache = () => Array.from(sharedRolloutScoreCache.entries());

type OwnedEntry = {
  unit: OwnedUnit;
  location: UnitLocation;
};

type ShopCandidate = {
  index: number;
  id: UnitId;
  score: number;
  speculative: boolean;
  advancesFinance: boolean;
  targetDuplicate: boolean;
  completesMerge: boolean;
  completesTrait: boolean;
  clearUpgrade: boolean;
  lateGamePriority: number;
};

type ReplacementPlan = {
  candidate: ShopCandidate;
  sacrifice: OwnedEntry;
  roster: OwnedEntry[];
  heuristicScore: number;
  protectedProject: boolean;
};

type RerollMode = "bank" | "stabilize" | "upgrade_chase";
export type AutopilotPlanningMode = "evolution" | "heuristic" | "training";

const formationPlacements = (
  lineup: OwnedEntry[],
  profileId: FormationProfile = "human_midline",
) => {
  const profile = FORMATION_PROFILES[profileId];
  const frontline = lineup.filter(({ unit }) => (
    unit.id === "rei" || UNIT_DEFS[unit.id].attackType === "melee"
  ));
  const ranged = lineup.filter(({ unit }) => (
    unit.id !== "rei" && UNIT_DEFS[unit.id].attackType === "ranged"
  ));
  const used = new Set<number>();
  const placements: Array<{ entry: OwnedEntry; slot: number }> = [];
  const place = (entry: OwnedEntry, preferredSlots: number[]) => {
    const slot = preferredSlots.find((candidate) => !used.has(candidate));
    if (slot === undefined) return;
    used.add(slot);
    placements.push({ entry, slot });
  };

  frontline
    .filter(({ unit }) => unit.id === "rei")
    .forEach((entry) => place(entry, [profile.rei, ...profile.melee]));
  frontline
    .filter(({ unit }) => unit.id !== "rei")
    .forEach((entry) => place(entry, [...profile.melee]));
  ranged.forEach((entry) => place(entry, [...profile.ranged]));
  return placements;
};

const scenarioSeed = (signature: string) => {
  let hash = 5381;
  for (let index = 0; index < signature.length; index += 1) {
    hash = (hash * 33 + signature.charCodeAt(index)) % 2147483647;
  }
  return hash || 1;
};

const fighterBoardSignature = (fighters: BattleState["player"]) => fighters
  .map((fighter) => JSON.stringify({
    ...fighter,
    fid: undefined,
    cooldown: undefined,
    burnSourceFid: undefined,
    tauntedByFid: undefined,
    channelTargetFid: undefined,
    targetFid: undefined,
    sekiChargeHitFids: undefined,
    raccoonStunnedAttackers: undefined,
  }))
  .sort()
  .join(",");

export class AutoChessAutopilot {
  private enabled = false;

  private phase: GamePhase = "title";

  private nextActionAt = 0;

  private plannedRound = 0;

  private preparationActions = 0;

  private rerolls = 0;

  private paidRerolls = 0;

  private dryPaidRerolls = 0;

  private stabilizationBestScore = Number.NEGATIVE_INFINITY;

  private stabilizationRosterKey = "";

  private pendingPurchase: Pick<ShopCandidate, "index" | "id"> | null = null;

  private plannedLineupKey = "";

  private plannedLineupUids: number[] = [];

  private plannedLineupUnits = new Map<number, { id: UnitId; star: OwnedUnit["star"] }>();

  private plannedLineupScore = Number.NEGATIVE_INFINITY;

  private plannedFormation: FormationProfile = "human_midline";

  private lineageUnitIds: UnitId[] = [];

  private lineageFormation: FormationProfile = "human_midline";

  private rolloutScoreCache = new Map<string, number>();

  private rolloutVariantLimit = ROLLOUT_SEED_VARIANTS;

  private confidenceKey = "";

  private confidenceScore = Number.NEGATIVE_INFINITY;

  private lastBattlePredictionScore = Number.NEGATIVE_INFINITY;

  private interestSales = 0;

  private benchCleanupSales = 0;

  private speculativeUnitIds = new Set<UnitId>();

  private finalizingEconomy = false;

  private finalReinvestments = 0;

  private rescueSearchCompleted = false;

  private rerollMode: RerollMode = "bank";

  private soldUnitIds = new Set<UnitId>();

  private preparationStateVisits = new Map<string, number>();

  private preparationStartGold = 0;

  private stabilizationInterestTiersAtRisk = 0;

  private seerPlan: SeerPlan | null = null;

  private seerPurchaseOffsets: number[] = [];

  private seerSaleOffsets: number[] = [];

  private policy: AutopilotPolicy;

  private style: AutopilotStyle;

  private informationMode: AutopilotInformationMode;

  private rolloutCombatHz: number;

  private readonly policyOverrides: Partial<AutopilotPolicy>;

  constructor(
    private readonly bridge: EngineBridge,
    private readonly planningMode: AutopilotPlanningMode = "evolution",
    policy: Partial<AutopilotPolicy> = {},
    style: AutopilotStyle = "survival",
    informationMode: AutopilotInformationMode = informationModeForAutopilotStyle(style),
    rolloutCombatHz = DEFAULT_ROLLOUT_COMBAT_HZ,
  ) {
    if (planningMode === "training") this.rolloutVariantLimit = 1;
    this.policyOverrides = { ...policy };
    this.style = style;
    this.informationMode = informationMode;
    this.rolloutCombatHz = Math.max(20, Math.min(
      EXACT_COMBAT_HZ,
      Math.round(rolloutCombatHz),
    ));
    this.policy = resolveAutopilotStylePolicy(style, this.policyOverrides);
    this.bridge.setAutopilotStrategy(style, informationMode);
  }

  public get isEnabled() {
    return this.enabled;
  }

  public get strategyStyle() {
    return this.style;
  }

  public get strategyInformationMode() {
    return this.informationMode;
  }

  public setStrategy(
    style: AutopilotStyle,
    informationMode: AutopilotInformationMode = informationModeForAutopilotStyle(style),
  ) {
    this.style = style;
    this.informationMode = informationMode;
    this.policy = resolveAutopilotStylePolicy(style, this.policyOverrides);
    this.bridge.setAutopilotStrategy(style, informationMode);
    this.invalidateFinalLineup();
    this.plannedRound = 0;
    this.nextActionAt = 0;
  }

  public setEnabled(enabled: boolean) {
    this.enabled = enabled;
    this.bridge.setAutoplayEnabled(enabled);
    this.nextActionAt = 0;
  }

  public chooseStarter(choices = this.bridge.engine.state.starterChoices) {
    if (choices.length <= 1) return choices[0] || null;
    const preference = (id: StarterId) => {
      const index = STARTER_PREFERENCE.indexOf(id);
      return index < 0 ? STARTER_PREFERENCE.length : index;
    };
    return choices
      .map((id) => ({ id, score: this.starterRolloutScore(id), preference: preference(id) }))
      .sort((left, right) => right.score - left.score || left.preference - right.preference)[0]?.id
      || null;
  }

  private starterRolloutScore(starter: StarterId) {
    const simulationBridge = new EngineBridge(
      this.bridge.engine.state.seed,
      1,
      { simulation: true, battleStepHz: EXACT_COMBAT_HZ },
    );
    simulationBridge.setConsoleLogging(false);
    simulationBridge.engine.state.starterChoices = [starter];
    simulationBridge.dispatch({ type: "starter", id: starter });
    const simulationPilot = new AutoChessAutopilot(
      simulationBridge,
      "heuristic",
      this.policy,
      this.style,
      this.informationMode,
      this.rolloutCombatHz,
    );
    simulationPilot.setEnabled(true);
    let now = 1000;
    let battles = 0;
    let wins = 0;
    let safety = 0;
    while (
      battles < STARTER_ROLLOUT_BATTLES
      && simulationBridge.engine.state.phase !== "gameover"
      && safety < 1200
    ) {
      safety += 1;
      now += 1000;
      if (simulationBridge.engine.state.phase === "battle") {
        simulationBridge.skipBattle();
        battles += 1;
        if (simulationBridge.engine.state.result?.won) wins += 1;
      } else simulationPilot.tick(now);
    }
    return wins * 100 + battles;
  }

  public startFromTitle() {
    if (this.bridge.engine.state.phase !== "title") return false;
    this.lineageUnitIds = [];
    this.lineageFormation = "human_midline";
    const starter = this.chooseStarter();
    if (!starter) return false;
    this.setEnabled(true);
    this.bridge.dispatch({ type: "starter", id: starter });
    return true;
  }

  public tick(now = Date.now()) {
    if (!this.enabled || this.bridge.codexOpen) return null;
    const { state } = this.bridge.engine;
    if (state.phase !== this.phase) {
      this.phase = state.phase;
      this.nextActionAt = now + this.phaseDelay(state.phase);
      if (state.phase === "preparation") this.resetPreparation(state.round);
      return null;
    }
    if (now < this.nextActionAt) return null;

    let action: GameAction | null = null;
    if (state.phase === "preparation") action = this.nextPreparationAction();
    else if (state.phase === "augment") action = this.augmentAction();
    else if (state.phase === "result") action = { type: "resultContinue" };
    if (!action) return null;

    if (action.type === "battle") {
      this.lastBattlePredictionScore = this.rolloutConfidence(this.ownedEntries());
    }
    this.bridge.dispatch(action);
    this.nextActionAt = now + this.actionDelay(action);
    return action;
  }

  private phaseDelay(phase: typeof this.phase) {
    if (phase === "result") return 1400;
    if (phase === "augment") return 900;
    if (phase === "preparation") return 700;
    return 0;
  }

  public get battlePredictionScore() {
    return this.lastBattlePredictionScore;
  }

  private actionDelay(action: GameAction) {
    if (action.type === "battle") return 800;
    if (action.type === "move") return 260;
    if (action.type === "resultContinue") return 900;
    if (action.type === "reroll") return 90;
    if (action.type === "shop" || action.type === "sell") return 150;
    return 340;
  }

  private resetPreparation(round: number) {
    this.plannedRound = round;
    this.preparationStartGold = this.bridge.engine.state.gold;
    this.stabilizationInterestTiersAtRisk = 0;
    this.preparationActions = 0;
    this.rerolls = 0;
    this.paidRerolls = 0;
    this.dryPaidRerolls = 0;
    this.stabilizationBestScore = Number.NEGATIVE_INFINITY;
    this.stabilizationRosterKey = "";
    this.pendingPurchase = null;
    this.plannedLineupKey = "";
    this.plannedLineupUids = [];
    this.plannedLineupUnits.clear();
    this.plannedLineupScore = Number.NEGATIVE_INFINITY;
    this.plannedFormation = this.lineageFormation;
    this.rolloutScoreCache.clear();
    this.confidenceKey = "";
    this.confidenceScore = Number.NEGATIVE_INFINITY;
    this.lastBattlePredictionScore = Number.NEGATIVE_INFINITY;
    this.interestSales = 0;
    this.benchCleanupSales = 0;
    this.speculativeUnitIds.clear();
    this.finalizingEconomy = false;
    this.finalReinvestments = 0;
    this.rescueSearchCompleted = false;
    this.rerollMode = "bank";
    this.soldUnitIds.clear();
    this.preparationStateVisits.clear();
    this.seerPurchaseOffsets = [];
    this.seerSaleOffsets = [];
    this.seerPlan = this.createSeerPlan();
  }

  private createSeerPlan() {
    if (this.style !== "seer" || this.informationMode !== "oracle") return null;
    const { engine } = this.bridge;
    const { state } = engine;
    const roster = this.ownedEntries();
    const targetIds = new Set<UnitId>(AUTOPILOT_TERMINAL_TARGET_IDS);
    const targetCopies = roster.reduce<Partial<Record<UnitId, number>>>((copies, { unit }) => {
      if (lateGameTargetDesiredCopies(unit.id) <= 0) return copies;
      copies[unit.id] = (copies[unit.id] || 0) + unitCopyValue(unit);
      return copies;
    }, {});
    const currentTransitionUnits: SeerPlannerUnit[] = roster
      .filter(({ unit }) => !targetIds.has(unit.id))
      .map(({ unit }) => ({ id: unit.id, star: unit.star }));
    const currentBoardStrength = state.board.reduce((total, unit) => (
      unit
        ? total + UNIT_DEFS[unit.id].cost * 12 * STAR_POWER[unit.star]
        : total
    ), 0);
    const futureShops = {} as SeerShopForecast;
    PLAYER_LEVELS.forEach((level) => {
      futureShops[level] = engine.previewFutureShopsAtLevels(Array.from(
        { length: ORACLE_SHOP_LOOKAHEAD },
        () => level,
      ));
    });
    return planSeerEconomy({
      round: state.round,
      seed: state.seed,
      hp: state.hp,
      gold: state.gold,
      playerLevel: state.playerLevel,
      upgradeRemaining: state.upgradeRemaining,
      streak: state.streak,
      incomeBonus: state.incomeBonus,
      paydayDebtRounds: state.paydayDebtRounds,
      freeRerolls: state.freeRerollCharges,
      financeActive: this.financeInterestActive(),
      currentShop: state.shop,
      currentCombatScore: this.rolloutConfidence(roster),
      currentBoardCount: engine.boardCount,
      currentBoardStrength,
      currentTransitionUnits,
      targetCopies,
      targets: AUTOPILOT_TERMINAL_TARGETS.map(({ id, priority }) => ({
        id,
        priority,
        desiredCopies: lateGameTargetDesiredCopies(id),
      })),
      futureShops,
      horizon: this.planningMode === "training"
        ? Math.min(24, Math.max(1, 51 - state.round))
        : Math.max(1, Math.min(50, 51 - state.round)),
      beamWidth: this.planningMode === "training" ? 48 : 64,
    });
  }

  private goldReserve(needsPopulation = false, interestTiersAtRisk = 0) {
    const { gold, hp, round } = this.bridge.engine.state;
    if (needsPopulation) return 0;
    const regularReserve = hp <= this.policy.criticalHpThreshold
      ? this.policy.criticalReserve
      : hp <= this.policy.woundedHpThreshold
        ? this.policy.woundedReserve
        : Math.round(Math.min(
          this.policy.reserveCap,
          Math.max(this.policy.reserveFloor, round * this.policy.reserveRoundScale),
        ));
    const { step } = this.interestRule();
    const anchorGold = this.plannedRound === round
      ? Math.max(gold, this.preparationStartGold)
      : gold;
    const anchorInterest = this.interestAt(anchorGold);
    if (anchorInterest <= 0) return regularReserve;
    const interestFloor = anchorInterest * step;
    const protectedInterest = Math.max(
      0,
      anchorInterest - Math.max(0, Math.floor(interestTiersAtRisk)),
    );
    if (protectedInterest === anchorInterest) return interestFloor;
    return Math.max(regularReserve, protectedInterest * step);
  }

  private stabilizationGoldReserve(interestTiersAtRisk: number) {
    const { gold, hp, round } = this.bridge.engine.state;
    const { step } = this.interestRule();
    const anchorGold = this.plannedRound === round
      ? Math.max(gold, this.preparationStartGold)
      : gold;
    const protectedInterest = Math.max(
      0,
      this.interestAt(anchorGold) - Math.max(0, Math.floor(interestTiersAtRisk)),
    );
    const emergencyFloor = hp <= this.policy.criticalHpThreshold
      ? 0
      : hp <= this.policy.woundedHpThreshold
        ? 1
        : 2;
    return Math.max(emergencyFloor, protectedInterest * step);
  }

  private ownedEntries() {
    const { state } = this.bridge.engine;
    return [
      ...state.board.flatMap((unit, index) => {
        if (!unit) return [];
        return [{ unit, location: { zone: "board", index } as UnitLocation }];
      }),
      ...state.bench.flatMap((unit, index) => {
        if (!unit) return [];
        return [{ unit, location: { zone: "bench", index } as UnitLocation }];
      }),
    ];
  }

  private unitScore(unit: OwnedUnit, roster: OwnedEntry[]) {
    const definition = UNIT_DEFS[unit.id];
    const uniquePartners = new Set(
      roster
        .filter((entry) => entry.unit.uid !== unit.uid && entry.unit.id !== unit.id)
        .filter((entry) => UNIT_DEFS[entry.unit.id].traits.some((trait) => definition.traits.includes(trait)))
        .map((entry) => entry.unit.id),
    ).size;
    const duplicateCount = roster.filter((entry) => entry.unit.id === unit.id).length - 1;
    const lateGameWeight = Math.max(0, Math.min(1, (this.bridge.engine.state.round - 8) / 12));
    const lateGameStarWeight = unit.star === 3 ? 1 : unit.star === 2 ? 0.5 : 0.08;
    const lateGameScore = lateGameTargetPriority(unit.id) * lateGameWeight * lateGameStarWeight;
    return definition.cost * 12 * STAR_POWER[unit.star]
      + unit.star * 6
      + uniquePartners * 7
      + Math.max(0, duplicateCount) * 4
      + lateGameScore;
  }

  private targetLineup(roster: OwnedEntry[]) {
    const cap = this.bridge.engine.boardCap;
    const ranked = [...roster].sort(
      (left, right) => this.unitScore(right.unit, roster) - this.unitScore(left.unit, roster)
        || left.unit.uid - right.unit.uid,
    );
    const selected = ranked.slice(0, cap);
    if (
      selected.length > 1
      && !selected.some(({ unit }) => UNIT_DEFS[unit.id].attackType === "melee")
    ) {
      const melee = ranked.find(({ unit }) => UNIT_DEFS[unit.id].attackType === "melee");
      if (melee) selected[selected.length - 1] = melee;
    }
    return selected;
  }

  private lineupHeuristicScore(lineup: OwnedEntry[]) {
    const uniqueIds = new Set<UnitId>();
    const traitCounts = lineup.reduce<Partial<Record<TraitId, number>>>((counts, { unit }) => {
      if (uniqueIds.has(unit.id)) return counts;
      uniqueIds.add(unit.id);
      UNIT_DEFS[unit.id].traits.forEach((trait) => {
        counts[trait] = (counts[trait] || 0) + 1;
      });
      return counts;
    }, {});
    const traitScore = (Object.keys(traitCounts) as TraitId[]).reduce((score, trait) => {
      const count = traitCounts[trait] || 0;
      const level = traitLevelForCount(TRAITS[trait], count);
      return score + level * 24 + count * level * 3;
    }, 0);
    const melee = lineup.filter(({ unit }) => UNIT_DEFS[unit.id].attackType === "melee").length;
    const ranged = lineup.length - melee;
    const roleScore = melee > 0 && ranged > 0 ? 18 : melee === 0 ? -60 : -12;
    const duplicatePenalty = (lineup.length - uniqueIds.size) * 12;
    return lineup.reduce((score, { unit }) => score + this.unitScore(unit, lineup), 0)
      + traitScore
      + roleScore
      - duplicatePenalty;
  }

  private trainingLineupScore(lineup: OwnedEntry[]) {
    const wave = this.bridge.engine.currentWave;
    const enemy = wave.units.map((unit, index) => ({
      unit: {
        uid: -1000 - index,
        id: unit.id,
        star: unit.star || 1,
      },
      location: { zone: "board", index } as UnitLocation,
    }));
    const augmentMultiplier = 1 + this.bridge.engine.state.augments.length * 0.08;
    const playerPower = this.lineupHeuristicScore(lineup) * augmentMultiplier;
    const enemyPower = this.lineupHeuristicScore(enemy) * wave.modifier ** 2;
    const relativeMargin = (playerPower - enemyPower) / Math.max(1, enemyPower);
    return 10000 + Math.max(-4, Math.min(4, relativeMargin)) * 600;
  }

  private rolloutLineupScore(
    lineup: OwnedEntry[],
    formation: FormationProfile = this.lineageFormation,
    stableOnly = false,
  ) {
    if (this.planningMode === "training") return this.trainingLineupScore(lineup);
    const sourceState = this.bridge.engine.state;
    const wave = this.bridge.engine.currentWave;
    const augments = [...sourceState.augments].sort().join(",");
    const placements = formationPlacements(lineup, formation)
      .map(({ entry, slot }) => `${slot}:${entry.unit.id}:${entry.unit.star}`)
      .sort()
      .join(",");
    const fixedScenario = [
      sourceState.starter,
      augments,
      wave.tag,
      wave.modifier,
      wave.units.map((unit) => `${unit.id}:${unit.star || 1}`).join(","),
      placements,
    ].join("/");
    const actualRandomState = this.bridge.engine.getRandomState();
    const combatHz = this.rolloutCombatHz;
    const stableVariantLimit = this.rolloutCombatHz >= EXACT_COMBAT_HZ
      ? this.rolloutVariantLimit
      : Math.min(2, this.rolloutVariantLimit);
    const scores = Array.from({
      length: stableOnly ? stableVariantLimit : 1,
    }, (_, variant) => {
      const exactBranch = variant === 0;
      const branch = exactBranch ? `actual:${actualRandomState}` : `rollout:${variant - 1}`;
      const simulation = new AutoChessEngine(
        scenarioSeed(`${fixedScenario}/${branch}`),
        { telemetry: false, visualEffects: false },
      );
      simulation.state = JSON.parse(JSON.stringify(sourceState));
      if (exactBranch) simulation.restoreRandomState(actualRandomState);
      simulation.state.phase = "preparation";
      simulation.state.board.fill(null);
      simulation.state.selected = null;
      simulation.state.battle = null;
      simulation.state.result = null;
      this.setSimulationLineup(simulation, lineup, formation, exactBranch);
      simulation.startBattle();
      const battle = simulation.state.battle as BattleState | null;
      if (!battle) return Number.NEGATIVE_INFINITY;
      const cacheKey = [
        `hz:${combatHz}`,
        sourceState.starter,
        augments,
        wave.modifier,
        branch,
        fighterBoardSignature(battle.player),
        fighterBoardSignature(battle.enemy),
      ].join("/");
      const cached = this.rolloutScoreCache.get(cacheKey);
      if (cached !== undefined) return cached;
      const shared = sharedRolloutScoreCache.get(cacheKey);
      if (shared !== undefined) {
        sharedRolloutCacheStats.hits += 1;
        sharedRolloutScoreCache.delete(cacheKey);
        sharedRolloutScoreCache.set(cacheKey, shared);
        this.rolloutScoreCache.set(cacheKey, shared);
        return shared;
      }
      sharedRolloutCacheStats.misses += 1;
      const score = this.preparedCombatScore(simulation, combatHz);
      this.rolloutScoreCache.set(cacheKey, score);
      sharedRolloutScoreCache.set(cacheKey, score);
      if (sharedRolloutScoreCache.size > SHARED_ROLLOUT_CACHE_LIMIT) {
        const oldest = sharedRolloutScoreCache.keys().next().value;
        if (oldest !== undefined) sharedRolloutScoreCache.delete(oldest);
      }
      return score;
    });
    if (!stableOnly) return scores[0];
    const robust = scores.slice(1).sort((left, right) => left - right);
    if (robust.length > 0) {
      if (this.style === "survival" || this.style === "seer") return robust[0];
      return robust[Math.floor(robust.length / 2)];
    }
    return scores[0];
  }

  private setSimulationLineup(
    simulation: AutoChessEngine,
    lineup: OwnedEntry[],
    formation: FormationProfile = "human_midline",
    preserveUids = false,
  ) {
    simulation.state.board.fill(null);
    formationPlacements(lineup, formation).forEach(({ entry, slot }) => {
      simulation.state.board[slot] = {
        ...entry.unit,
        uid: preserveUids ? entry.unit.uid : 1000 + slot,
      };
    });
  }

  private preparedCombatScore(simulation: AutoChessEngine, combatHz = EXACT_COMBAT_HZ) {
    if (simulation.state.phase === "preparation" && simulation.boardCount > 0) {
      simulation.startBattle();
    }
    if (simulation.state.phase !== "battle" || !simulation.state.battle) {
      return Number.NEGATIVE_INFINITY;
    }
    let steps = 0;
    const maximumSteps = Math.ceil(26 * combatHz);
    while ((simulation.state.phase as GamePhase) === "battle" && steps < maximumSteps) {
      simulation.update(1 / combatHz);
      steps += 1;
    }
    const battle = simulation.state.battle as BattleState | null;
    if (!battle) return Number.NEGATIVE_INFINITY;
    const healthRatio = (fighters: BattleState["player"]) => fighters.reduce(
      (sum, fighter) => sum + (fighter.alive ? fighter.hp / fighter.maxHp : 0),
      0,
    );
    const healthMargin = healthRatio(battle.player) - healthRatio(battle.enemy);
    const result = simulation.state.result as RoundResult | null;
    const won = result?.won === true;
    return (won ? 10000 : 0) + healthMargin * 100 - (won ? battle.elapsed : 0);
  }

  private augmentRolloutScore(index: number) {
    const sourceState = this.bridge.engine.state;
    const simulation = new AutoChessEngine(
      sourceState.seed + (sourceState.round + 1) * 1009,
      { telemetry: false, visualEffects: false },
    );
    simulation.state = JSON.parse(JSON.stringify(sourceState));
    simulation.chooseAugment(index);
    return this.preparedCombatScore(simulation);
  }

  private rolloutTargetLineup(roster: OwnedEntry[]) {
    const cap = this.bridge.engine.boardCap;
    const rosterKey = roster
      .map(({ unit }) => `${unit.uid}:${unit.id}:${unit.star}`)
      .sort()
      .join("|");
    const key = `${this.bridge.engine.state.round}/${cap}/${rosterKey}`;
    if (this.plannedLineupUids.length > 0 && key === this.plannedLineupKey) {
      const byUid = new Map(roster.map((entry) => [entry.unit.uid, entry]));
      const planned = this.plannedLineupUids.flatMap((uid) => byUid.get(uid) || []);
      const plannedUnchanged = planned.length === this.plannedLineupUids.length
        && planned.every(({ unit }) => {
          const previous = this.plannedLineupUnits.get(unit.uid);
          return previous?.id === unit.id && previous.star === unit.star;
        });
      if (plannedUnchanged) return planned;
    }

    const heuristic = this.targetLineup(roster);
    if (this.planningMode === "heuristic" || this.planningMode === "training") {
      this.plannedLineupKey = key;
      this.plannedLineupUids = heuristic.map(({ unit }) => unit.uid);
      this.plannedLineupUnits = new Map(heuristic.map(({ unit }) => [
        unit.uid,
        { id: unit.id, star: unit.star },
      ]));
      const heuristicFormation = this.bridge.engine.state.round >= 18
        ? "center_wedge"
        : "human_midline";
      this.plannedLineupScore = this.planningMode === "training" && heuristic.length > 0
        ? this.rolloutLineupScore(heuristic, heuristicFormation)
        : Number.NEGATIVE_INFINITY;
      this.plannedFormation = heuristicFormation;
      return heuristic;
    }
    const profileOrder = [
      this.lineageFormation,
      ...FORMATION_PROFILE_IDS.filter((profile) => profile !== this.lineageFormation),
    ];
    const scoreGenome = (
      lineup: OwnedEntry[],
      formation: FormationProfile,
      generation: number,
    ) => ({
      lineup,
      formation,
      generation,
      rollout: this.rolloutLineupScore(lineup, formation),
      heuristic: this.lineupHeuristicScore(lineup),
    });
    const compareGenome = (
      left: ReturnType<typeof scoreGenome>,
      right: ReturnType<typeof scoreGenome>,
    ) => right.rollout - left.rollout || right.heuristic - left.heuristic;
    const commitGenome = (genome: ReturnType<typeof scoreGenome>) => {
      this.plannedLineupKey = key;
      this.plannedLineupUids = genome.lineup.map(({ unit }) => unit.uid);
      this.plannedLineupUnits = new Map(genome.lineup.map(({ unit }) => [
        unit.uid,
        { id: unit.id, star: unit.star },
      ]));
      this.plannedLineupScore = genome.rollout;
      this.plannedFormation = genome.formation;
      this.lineageUnitIds = genome.lineup.map(({ unit }) => unit.id);
      this.lineageFormation = genome.formation;
      return genome.lineup;
    };
    const financeCount = (lineup: OwnedEntry[]) => new Set(
      lineup
        .filter(({ unit }) => UNIT_DEFS[unit.id].traits.includes("finance"))
        .map(({ unit }) => unit.id),
    ).size;
    const pruneWinningGenome = (genome: ReturnType<typeof scoreGenome>) => {
      if (genome.rollout < this.policy.safeWinRolloutScore) return genome;
      const preserveFinance = financeCount(genome.lineup) >= 4;
      let pruned = genome;
      let accepted = 0;
      const removalOrder = [...genome.lineup].sort(
        (left, right) => this.unitScore(left.unit, roster) - this.unitScore(right.unit, roster)
          || left.unit.uid - right.unit.uid,
      );
      for (const removed of removalOrder) {
        if (
          accepted >= this.policy.minimumWinningLineupMaxPrunes
          || pruned.lineup.length <= (preserveFinance ? 4 : 1)
        ) break;
        const candidate = pruned.lineup.filter(({ unit }) => unit.uid !== removed.unit.uid);
        if (preserveFinance && financeCount(candidate) < 4) continue;
        const scored = scoreGenome(candidate, pruned.formation, pruned.generation + 1);
        if (scored.rollout < this.policy.safeWinRolloutScore) continue;
        pruned = scored;
        accepted += 1;
      }
      return pruned;
    };

    if (roster.length <= cap) {
      const champion = profileOrder
        .map((formation) => scoreGenome(roster, formation, 0))
        .sort(compareGenome)[0];
      return commitGenome(pruneWinningGenome(champion));
    }

    const candidates = new Map<string, OwnedEntry[]>();
    const addCandidate = (lineup: OwnedEntry[]) => {
      if (lineup.length !== cap) return;
      const lineupKey = lineup.map(({ unit }) => unit.uid).sort((left, right) => left - right).join(",");
      candidates.set(lineupKey, lineup);
    };
    addCandidate(heuristic);
    addCandidate(roster.filter(({ location }) => location.zone === "board"));

    const remaining = [...roster];
    const inherited = this.lineageUnitIds.flatMap((id) => {
      const choices = remaining
        .map((entry, index) => ({ entry, index }))
        .filter(({ entry }) => entry.unit.id === id)
        .sort((left, right) => this.unitScore(right.entry.unit, roster) - this.unitScore(left.entry.unit, roster));
      const choice = choices[0];
      if (!choice) return [];
      remaining.splice(choice.index, 1);
      return [choice.entry];
    });
    const inheritedUids = new Set(inherited.map(({ unit }) => unit.uid));
    const inheritedFillers = heuristic
      .filter(({ unit }) => !inheritedUids.has(unit.uid));
    addCandidate([...inherited, ...inheritedFillers].slice(0, cap));

    const selectedUids = new Set(heuristic.map(({ unit }) => unit.uid));
    const reserves = roster.filter(({ unit }) => !selectedUids.has(unit.uid));
    reserves.forEach((reserve) => {
      heuristic.forEach((_, index) => {
        const candidate = [...heuristic];
        candidate[index] = reserve;
        addCandidate(candidate);
      });
    });

    (Object.keys(TRAITS) as TraitId[]).forEach((trait) => {
      const matchingById = new Map<UnitId, OwnedEntry>();
      roster
        .filter(({ unit }) => UNIT_DEFS[unit.id].traits.includes(trait))
        .sort((left, right) => this.unitScore(right.unit, roster) - this.unitScore(left.unit, roster))
        .forEach((entry) => {
          if (!matchingById.has(entry.unit.id)) matchingById.set(entry.unit.id, entry);
        });
      const matching = Array.from(matchingById.values());
      TRAITS[trait].thresholds.forEach((threshold) => {
        if (threshold > cap || matching.length < threshold) return;
        const focused = matching.slice(0, threshold);
        const focusedUids = new Set(focused.map(({ unit }) => unit.uid));
        const fillers = this.targetLineup(roster).filter(({ unit }) => !focusedUids.has(unit.uid));
        addCandidate([...focused, ...fillers].slice(0, cap));
      });
    });

    const finalists = Array.from(candidates.values())
      .sort((left, right) => this.lineupHeuristicScore(right) - this.lineupHeuristicScore(left))
      .slice(0, ROLLOUT_CANDIDATE_LIMIT);
    const current = candidates.get(
      roster.filter(({ location }) => location.zone === "board")
        .map(({ unit }) => unit.uid)
        .sort((left, right) => left - right)
        .join(","),
    );
    if (current && !finalists.includes(current)) finalists[finalists.length - 1] = current;
    const financeCandidate = Array.from(candidates.values())
      .filter((lineup) => financeCount(lineup) >= 4)
      .sort((left, right) => this.lineupHeuristicScore(right) - this.lineupHeuristicScore(left))[0];
    if (financeCandidate && !finalists.includes(financeCandidate)) {
      finalists[finalists.length - 1] = financeCandidate;
    }

    const parents = finalists
      .map((lineup) => scoreGenome(lineup, this.lineageFormation, 0))
      .sort(compareGenome);
    const elites = parents.slice(0, EVOLUTION_ELITE_LIMIT);
    const offspring = new Map<string, ReturnType<typeof scoreGenome>>();
    const addOffspring = (
      lineup: OwnedEntry[],
      formation: FormationProfile,
    ) => {
      const genomeKey = `${lineup.map(({ unit }) => unit.uid).sort((left, right) => left - right).join(",")}/${formation}`;
      if (offspring.has(genomeKey)) return;
      offspring.set(genomeKey, scoreGenome(lineup, formation, 1));
    };

    elites.forEach((elite) => {
      profileOrder
        .filter((formation) => formation !== elite.formation)
        .forEach((formation) => addOffspring(elite.lineup, formation));

      const eliteUids = new Set(elite.lineup.map(({ unit }) => unit.uid));
      const mutations = roster
        .filter(({ unit }) => !eliteUids.has(unit.uid))
        .flatMap((reserve) => elite.lineup.map((_, index) => {
          const lineup = [...elite.lineup];
          lineup[index] = reserve;
          return lineup;
        }))
        .sort((left, right) => this.lineupHeuristicScore(right) - this.lineupHeuristicScore(left));
      const mutation = mutations.find((lineup) => (
        lineup.some(({ unit }, index) => unit.uid !== elite.lineup[index]?.unit.uid)
      ));
      if (mutation) addOffspring(mutation, elite.formation);
    });

    const generation = [...parents, ...Array.from(offspring.values())].sort(compareGenome);
    const champion = generation[0] || scoreGenome(heuristic, "human_midline", 0);
    const financeActivationScore = this.bridge.engine.state.hp <= this.policy.woundedHpThreshold
      ? this.policy.safeWinRolloutScore
      : this.policy.financeActivationRolloutScore;
    const financeChampion = generation
      .filter((genome) => (
        financeCount(genome.lineup) >= 4
        && genome.rollout >= financeActivationScore
        && genome.rollout >= champion.rollout - this.policy.financeActivationMaxRolloutDeficit
      ))
      .sort(compareGenome)[0];
    return commitGenome(pruneWinningGenome(financeChampion || champion));
  }

  private financeInterestActive() {
    const activeLevel = this.bridge.engine.getActiveTraits()
      .find((trait) => trait.id === "finance")?.level || 0;
    if (activeLevel >= 2) return true;
    const planned = new Set(this.plannedLineupUids);
    const plannedFinanceIds = new Set(
      this.ownedEntries()
        .filter(({ unit }) => planned.has(unit.uid) && UNIT_DEFS[unit.id].traits.includes("finance"))
        .map(({ unit }) => unit.id),
    );
    return plannedFinanceIds.size >= 4;
  }

  private lateGamePurchaseWindowOpen() {
    const { state } = this.bridge.engine;
    return state.round >= this.policy.lateGamePurchaseStartRound
      || state.playerLevel >= this.policy.lateGamePurchaseStartLevel;
  }

  private interestRule() {
    return this.financeInterestActive()
      ? { step: 4, cap: FINANCE_INTEREST_CAP }
      : { step: 5, cap: NORMAL_INTEREST_CAP };
  }

  private interestAt(gold: number) {
    const { step, cap } = this.interestRule();
    return Math.min(cap, Math.floor(Math.max(0, gold) / step));
  }

  private rolloutConfidence(roster: OwnedEntry[]) {
    const lineup = this.rolloutTargetLineup(roster);
    const key = `${this.bridge.engine.state.round}/${this.bridge.engine.getRandomState()}/${lineup
      .map(({ unit }) => `${unit.uid}:${unit.id}:${unit.star}`)
      .sort()
      .join("|")}`;
    if (key === this.confidenceKey) return this.confidenceScore;
    const plannedMatches = roster.length > this.bridge.engine.boardCap
      && lineup.length === this.plannedLineupUids.length
      && lineup.every(({ unit }) => this.plannedLineupUids.includes(unit.uid));
    this.confidenceKey = key;
    this.confidenceScore = plannedMatches
      ? this.plannedLineupScore
      : this.rolloutLineupScore(lineup);
    return this.confidenceScore;
  }

  private oneCopyFromMergeIds(roster: OwnedEntry[]) {
    const copiesById = roster.reduce<Partial<Record<UnitId, number>>>((copies, { unit }) => {
      copies[unit.id] = (copies[unit.id] || 0) + (unit.star === 1 ? 1 : unit.star === 2 ? 3 : 9);
      return copies;
    }, {});
    return new Set((Object.entries(copiesById) as Array<[UnitId, number]>)
      .filter(([, copies]) => copies < 9 && copies % 3 === 2)
      .map(([id]) => id));
  }

  private financeProjectIds(roster: OwnedEntry[]) {
    if (
      this.bridge.engine.state.playerLevel >= 10
      && !this.lateGameDevelopmentIncomplete(roster)
    ) return new Set<UnitId>();
    const strongestById = new Map<UnitId, OwnedEntry>();
    roster
      .filter(({ unit }) => UNIT_DEFS[unit.id].traits.includes("finance"))
      .forEach((entry) => {
        const current = strongestById.get(entry.unit.id);
        if (!current || this.unitScore(entry.unit, roster) > this.unitScore(current.unit, roster)) {
          strongestById.set(entry.unit.id, entry);
        }
      });
    return new Set(
      Array.from(strongestById.values())
        .sort((left, right) => this.unitScore(right.unit, roster) - this.unitScore(left.unit, roster))
        .slice(0, 4)
        .map(({ unit }) => unit.id),
    );
  }

  private upgradeProjectIds(roster: OwnedEntry[], lineup = this.rolloutTargetLineup(roster)) {
    const lineupIds = new Set(lineup.map(({ unit }) => unit.id));
    const projects = new Map<UnitId, { copies: number; score: number }>();
    roster.forEach(({ unit }) => {
      const project = projects.get(unit.id) || { copies: 0, score: 0 };
      project.copies += unit.star === 1 ? 1 : unit.star === 2 ? 3 : 9;
      project.score = Math.max(project.score, this.unitScore(unit, roster));
      projects.set(unit.id, project);
    });
    return new Set(
      Array.from(projects.entries())
        .filter(([id, project]) => {
          const desiredCopies = lateGameTargetDesiredCopies(id);
          if (desiredCopies > 0) {
            return project.copies >= Math.min(3, desiredCopies)
              && project.copies < desiredCopies;
          }
          return project.copies < 9 && (
            project.copies >= 6
            || (lineupIds.has(id) && project.copies >= 3)
          );
        })
        .sort((left, right) => Number(lineupIds.has(right[0])) - Number(lineupIds.has(left[0]))
          || right[1].copies - left[1].copies
          || right[1].score - left[1].score
          || left[0].localeCompare(right[0]))
        .slice(0, this.policy.upgradeProjectLimit)
        .map(([id]) => id),
    );
  }

  private lateGameDevelopmentIncomplete(roster: OwnedEntry[]) {
    return AUTOPILOT_TERMINAL_TARGETS.some(({ id }) => {
      const copies = roster
        .filter(({ unit }) => unit.id === id)
        .reduce((sum, { unit }) => sum + unitCopyValue(unit), 0);
      return copies < lateGameTargetDesiredCopies(id);
    });
  }

  private terminalCompletionProjectCount(roster: OwnedEntry[]) {
    return AUTOPILOT_TERMINAL_TARGETS.filter(({ id }) => {
      const copies = roster
        .filter(({ unit }) => unit.id === id)
        .reduce((sum, { unit }) => sum + unitCopyValue(unit), 0);
      return copies >= 6 && copies < lateGameTargetDesiredCopies(id);
    }).length;
  }

  private terminalDevelopmentWindowOpen(roster: OwnedEntry[], rolloutScore: number) {
    const { state } = this.bridge.engine;
    return state.playerLevel >= 10
      && state.round >= this.policy.terminalRollDownMinimumRound
      && state.hp > this.policy.woundedHpThreshold
      && this.financeInterestActive()
      && rolloutScore >= this.policy.safeWinRolloutScore
      && this.lateGameDevelopmentIncomplete(roster);
  }

  private terminalCompletionPushActive(roster: OwnedEntry[], rolloutScore: number) {
    return this.terminalDevelopmentWindowOpen(roster, rolloutScore)
      && this.preparationStartGold >= this.policy.terminalCompletionActivationGold
      && this.terminalCompletionProjectCount(roster)
        >= this.policy.terminalCompletionMinimumProjects;
  }

  private terminalRollDownReserve(roster: OwnedEntry[], rolloutScore: number) {
    if (!this.terminalDevelopmentWindowOpen(roster, rolloutScore)) return null;
    if (this.terminalCompletionPushActive(roster, rolloutScore)) {
      return this.policy.terminalCompletionReserveGold;
    }
    return this.preparationStartGold >= this.policy.terminalRollDownActivationGold
      ? this.policy.terminalRollDownReserveGold
      : null;
  }

  private terminalRollDownActive(roster: OwnedEntry[], rolloutScore: number) {
    return this.terminalRollDownReserve(roster, rolloutScore) !== null;
  }

  private seerProjectFocusIds(roster: OwnedEntry[]) {
    if (this.style !== "seer") return new Set<UnitId>(AUTOPILOT_TERMINAL_TARGET_IDS);
    const { state } = this.bridge.engine;
    const rows = AUTOPILOT_TERMINAL_TARGETS.map(({ id, priority }) => {
      const units = roster.filter(({ unit }) => unit.id === id);
      const copies = units.reduce((sum, { unit }) => sum + unitCopyValue(unit), 0);
      const shopHits = state.shop.filter((shopId) => shopId === id).length;
      const projectedCopies = this.seerPlan?.projectedTargetCopies[id] || 0;
      const progressTier = copies >= 6 ? 4 : copies >= 3 ? 3 : copies > 0 ? 1 : 0;
      return {
        id,
        copies,
        shopHits,
        score: progressTier * 1000
          + Math.min(copies, 8) * 24
          + shopHits * 260
          + Math.max(0, projectedCopies - copies) * 8
          + priority / 10,
      };
    });
    const inProgress = rows.filter(({ copies }) => copies > 0);
    const candidates = (inProgress.length > 0
      ? inProgress
      : rows.filter(({ shopHits }) => shopHits > 0))
      .sort((left, right) => right.score - left.score || right.copies - left.copies);
    return new Set(candidates.slice(0, 3).map(({ id }) => id));
  }

  private lateGameReserveUids(roster: OwnedEntry[]) {
    const reserves = new Set<number>();
    const focusedIds = this.seerProjectFocusIds(roster);
    const lateGamePurchaseWindowOpen = this.lateGamePurchaseWindowOpen();
    AUTOPILOT_LATE_GAME_TARGET_IDS.forEach((id) => {
      let reservedCopies = 0;
      const desiredCopies = lateGameTargetDesiredCopies(id);
      const reserveGoal = this.style === "seer" && !focusedIds.has(id)
        ? Math.min(desiredCopies, 1)
        : lateGamePurchaseWindowOpen ? desiredCopies : Math.min(desiredCopies, 3);
      roster
        .filter(({ unit }) => unit.id === id)
        .sort((left, right) => right.unit.star - left.unit.star
          || this.unitScore(right.unit, roster) - this.unitScore(left.unit, roster)
          || left.unit.uid - right.unit.uid)
        .forEach(({ unit, location }) => {
          if (location.zone !== "board" && reservedCopies >= reserveGoal) return;
          reserves.add(unit.uid);
          reservedCopies += unitCopyValue(unit);
        });
    });
    return reserves;
  }

  private rerollStrategy(roster: OwnedEntry[]) {
    const rolloutScore = this.rolloutConfidence(roster);
    const upgradeChaseIds = this.oneCopyFromMergeIds(roster);
    if (rolloutScore < this.policy.stabilizeRolloutScore) {
      this.rerollMode = "stabilize";
    } else if (
      rolloutScore < this.policy.safeWinRolloutScore
      && upgradeChaseIds.size > 0
    ) {
      this.rerollMode = "upgrade_chase";
    } else {
      this.rerollMode = "bank";
    }
    return { mode: this.rerollMode, rolloutScore, upgradeChaseIds };
  }

  private observeStabilizationStrength(roster: OwnedEntry[]) {
    const rosterKey = `${this.bridge.engine.state.playerLevel}/${roster
      .map(({ unit }) => `${unit.uid}:${unit.id}:${unit.star}`)
      .sort()
      .join("|")}`;
    if (rosterKey === this.stabilizationRosterKey) return;
    const lineup = this.rolloutTargetLineup(roster);
    const score = this.rolloutLineupScore(lineup, this.plannedFormation, true);
    if (
      Number.isFinite(this.stabilizationBestScore)
      && score >= this.stabilizationBestScore + REPLACEMENT_ROLLOUT_MIN_GAIN
    ) {
      this.dryPaidRerolls = 0;
    }
    this.stabilizationBestScore = Math.max(this.stabilizationBestScore, score);
    this.stabilizationRosterKey = rosterKey;
  }

  private shouldSearchLongTermDevelopment(roster: OwnedEntry[]) {
    const { state } = this.bridge.engine;
    const financeIds = new Set(
      roster
        .filter(({ unit }) => UNIT_DEFS[unit.id].traits.includes("finance"))
        .map(({ unit }) => unit.id),
    );
    const lineup = this.rolloutTargetLineup(roster);
    const hasLateWeakSlot = this.bridge.engine.state.playerLevel >= 7
      && lineup.some(({ unit }) => unit.star === 1 || UNIT_DEFS[unit.id].cost <= 2);
    const lateGameSearchFloor = this.financeInterestActive()
      ? FINANCE_INTEREST_CAP * 4
      : this.goldReserve(false, 0) + 10;
    const canSearchLateGameTargets = state.playerLevel >= 8
      && state.gold > lateGameSearchFloor
      && this.lateGameDevelopmentIncomplete(roster);
    return (financeIds.size > 0 && financeIds.size < 4)
      || this.oneCopyFromMergeIds(roster).size > 0
      || this.upgradeProjectIds(roster, lineup).size > 0
      || hasLateWeakSlot
      || canSearchLateGameTargets
      || (this.financeInterestActive() && this.bridge.engine.state.gold > FINANCE_INTEREST_CAP * 4);
  }

  private oracleHasFutureCandidate(roster: OwnedEntry[]) {
    if (this.informationMode !== "oracle") return true;
    if (this.seerPlan) return this.rerolls < this.seerPlan.firstStep.rerolls;
    const { engine } = this.bridge;
    const currentShop = engine.state.shop;
    const futureShops = engine.previewFutureShops(ORACLE_SHOP_LOOKAHEAD);
    try {
      return futureShops.some((shop) => {
        engine.state.shop = shop;
        return this.shopCandidates(roster).some((candidate) => (
          candidate.completesMerge
          || candidate.targetDuplicate
          || candidate.advancesFinance
          || candidate.completesTrait
          || candidate.clearUpgrade
          || candidate.lateGamePriority > 0
        ));
      });
    } finally {
      engine.state.shop = currentShop;
    }
  }

  private shopCandidates(roster: OwnedEntry[], needsPopulation = roster.length < this.bridge.engine.boardCap) {
    const { engine } = this.bridge;
    const { state } = engine;
    const lineup = this.rolloutTargetLineup(roster);
    const lineupIds = new Set(lineup.map(({ unit }) => unit.id));
    const upgradeProjectIds = this.upgradeProjectIds(roster, lineup);
    const countedLineupIds = new Set<UnitId>();
    const lineupTraitCounts = lineup.reduce<Record<string, number>>((counts, { unit }) => {
      if (countedLineupIds.has(unit.id)) return counts;
      countedLineupIds.add(unit.id);
      UNIT_DEFS[unit.id].traits.forEach((trait) => {
        counts[trait] = (counts[trait] || 0) + 1;
      });
      return counts;
    }, {});
    const ownedFinanceIds = new Set(
      roster
        .filter(({ unit }) => UNIT_DEFS[unit.id].traits.includes("finance"))
        .map(({ unit }) => unit.id),
    );
    const financeProjectIds = this.financeProjectIds(roster);
    const seerFocusIds = this.seerProjectFocusIds(roster);
    const lateGamePurchaseWindowOpen = this.lateGamePurchaseWindowOpen();
    const weakestFinanceProject = roster
      .filter(({ unit }) => financeProjectIds.has(unit.id))
      .sort((left, right) => this.unitScore(left.unit, roster) - this.unitScore(right.unit, roster))[0];
    const rerollMode = this.rerollStrategy(roster).mode;
    const terminalReserve = this.terminalRollDownReserve(
      roster,
      this.rolloutConfidence(roster),
    );
    const terminalRollDown = terminalReserve !== null;
    const configuredPurchaseRisk = rerollMode === "stabilize"
      ? this.policy.stabilizePurchaseInterestTiersAtRisk
      : rerollMode === "upgrade_chase"
        ? this.policy.upgradeChasePurchaseInterestTiersAtRisk
        : this.policy.bankPurchaseInterestTiersAtRisk;
    const modePurchaseRisk = rerollMode === "bank"
      ? configuredPurchaseRisk
      : Math.min(configuredPurchaseRisk, this.stabilizationInterestTiersAtRisk);
    const weakestLineupCost = Math.min(...lineup.map(({ unit }) => UNIT_DEFS[unit.id].cost), 5);
    const candidates = state.shop.flatMap((id, index) => {
      if (!id) return [];
      const definition = UNIT_DEFS[id];
      const sameUnits = roster.filter(({ unit }) => unit.id === id);
      const hasMaxStar = sameUnits.some(({ unit }) => unit.star === 3);
      const skipMaxStarDuplicate = this.policy.skipMaxStarDuplicatePurchases > 0 && hasMaxStar;
      if (skipMaxStarDuplicate && !needsPopulation) return [];
      const oneStarCopies = sameUnits.filter(({ unit }) => unit.star === 1).length;
      const completesMerge = !skipMaxStarDuplicate && oneStarCopies >= 2;
      const ownedCopies = sameUnits.reduce(
        (copies, { unit }) => copies + unitCopyValue(unit),
        0,
      );
      const targetPlanPriority = lateGameTargetPriority(id);
      const targetDesiredCopies = lateGameTargetDesiredCopies(id);
      const shopCopies = state.shop.filter((shopId) => shopId === id).length;
      const canStartTerminalProject = targetDesiredCopies <= 0
        || lateGamePurchaseWindowOpen
        || sameUnits.length > 0
        || shopCopies >= 2
        || completesMerge
        || definition.cost >= weakestLineupCost + 2;
      const targetNeedsCopies = ownedCopies < targetDesiredCopies;
      const longTermPriority = targetNeedsCopies && canStartTerminalProject
        ? targetPlanPriority
        : 0;
      const targetDuplicate = (targetDesiredCopies > 0
        ? targetNeedsCopies
        : lineupIds.has(id) || upgradeProjectIds.has(id))
        && canStartTerminalProject
        && !skipMaxStarDuplicate;
      const emptyBench = state.bench.filter((unit) => !unit).length;
      const canSpeculate = !needsPopulation
        && !skipMaxStarDuplicate
        && emptyBench >= this.policy.speculativePurchaseMinimumEmptyBench
        && (ownedCopies > 0 || shopCopies >= 2);
      const completesTrait = definition.traits.some((trait) => {
        if (lineupIds.has(id)) return false;
        const before = lineupTraitCounts[trait] || 0;
        return traitLevelForCount(TRAITS[trait], before + 1) > traitLevelForCount(TRAITS[trait], before);
      });
      const prospectiveFinance: OwnedUnit = { uid: -1, id, star: 1 };
      const prospectiveFinanceEntry: OwnedEntry = {
        unit: prospectiveFinance,
        location: { zone: "bench", index: -1 },
      };
      const advancesFinance = definition.traits.includes("finance")
        && !ownedFinanceIds.has(id)
        && (
          ownedFinanceIds.size < 4
          || !weakestFinanceProject
          || this.unitScore(
            prospectiveFinance,
            [...roster, prospectiveFinanceEntry],
          ) > this.unitScore(weakestFinanceProject.unit, roster)
        );
      const traitPartners = definition.traits.filter((trait) => (lineupTraitCounts[trait] || 0) > 0).length;
      const clearUpgrade = definition.cost >= weakestLineupCost + 2;
      const score = needsPopulation
        ? 100 - definition.cost * 4 + traitPartners * 5
        : definition.cost * 5
          + (targetDuplicate ? 45 : 0)
          + (this.style === "seer" && seerFocusIds.has(id) ? 64 : 0)
          + (completesMerge ? 90 : 0)
          + (advancesFinance ? 64 : 0)
          + (completesTrait ? 42 : 0)
          + longTermPriority
          + (longTermPriority > 0
            ? Math.min(96, ownedCopies * 12)
              + (ownedCopies >= 6 ? 48 : ownedCopies >= 3 ? 18 : 0)
            : 0)
          + (canSpeculate ? 18 + Math.min(24, ownedCopies * 4) + (shopCopies - 1) * 8 : 0)
          + traitPartners * 6;
      if (
        !needsPopulation
        && !targetDuplicate
        && !completesMerge
        && !advancesFinance
        && !completesTrait
        && !clearUpgrade
        && longTermPriority === 0
        && !canSpeculate
      ) return [];
      const speculative = canSpeculate && longTermPriority === 0;
      const candidateInterestRisk = completesMerge
        ? this.policy.mergePurchaseInterestTiersAtRisk
        : targetDuplicate || completesTrait || clearUpgrade
          ? this.policy.goodPurchaseInterestTiersAtRisk
          : 0;
      const purchaseInterestRisk = longTermPriority > 0
        ? this.policy.lateGameTargetPurchaseInterestTiersAtRisk
        : advancesFinance
          ? this.policy.financePurchaseInterestTiersAtRisk
          : Math.min(candidateInterestRisk, modePurchaseRisk);
      let reserve = needsPopulation
        ? 0
        : terminalRollDown && longTermPriority > 0
          ? terminalReserve
        : rerollMode === "bank"
          ? this.goldReserve(false, purchaseInterestRisk)
          : this.stabilizationGoldReserve(purchaseInterestRisk);
      if (
        this.seerPlan
        && longTermPriority > 0
        && this.rolloutConfidence(roster) >= this.policy.safeWinRolloutScore
      ) {
        reserve = Math.min(
          reserve,
          this.seerPlan.firstStep.expectedGoldAfterPreparation,
        );
      }
      if (state.gold < definition.cost) return [];
      if (state.gold - definition.cost < reserve && !canSpeculate && !completesMerge) return [];
      if (
        this.soldUnitIds.has(id)
        && canSpeculate
        && !targetDuplicate
        && !completesMerge
        && !advancesFinance
        && !completesTrait
        && !clearUpgrade
      ) return [];
      return [{
        index,
        id,
        score,
        speculative,
        advancesFinance,
        targetDuplicate,
        completesMerge,
        completesTrait,
        clearUpgrade,
        lateGamePriority: longTermPriority,
      } satisfies ShopCandidate];
    }).sort((left, right) => right.score - left.score || left.index - right.index);
    return candidates;
  }

  private purchaseAction(roster: OwnedEntry[], needsPopulation?: boolean): GameAction | null {
    const { engine } = this.bridge;
    const { state } = engine;
    const hasCapacity = engine.boardCount < engine.boardCap || state.bench.some((unit) => !unit);
    if (!hasCapacity) return null;

    const candidates = this.shopCandidates(roster, needsPopulation);

    const candidate = candidates[0];
    if (!candidate) return null;
    if (candidate.speculative) this.speculativeUnitIds.add(candidate.id);
    return { type: "shop", index: candidate.index } as GameAction;
  }

  private pendingPurchaseAction(): GameAction | null {
    const pending = this.pendingPurchase;
    if (!pending) return null;
    const { engine } = this.bridge;
    const hasCapacity = engine.boardCount < engine.boardCap || engine.state.bench.some((unit) => !unit);
    if (
      !hasCapacity
      || engine.state.shop[pending.index] !== pending.id
      || engine.state.gold < UNIT_DEFS[pending.id].cost
    ) {
      this.pendingPurchase = null;
      return null;
    }
    this.pendingPurchase = null;
    return { type: "shop", index: pending.index };
  }

  private seerPlannedPurchaseAction(): GameAction | null {
    if (this.style !== "seer" || !this.seerPlan) return null;
    const purchasesByShop = this.seerPlan.firstStep.purchasesByShop;
    const plannedPurchases = purchasesByShop?.[this.rerolls];
    if (!plannedPurchases) return null;
    const offset = this.seerPurchaseOffsets[this.rerolls] || 0;
    const id = plannedPurchases[offset];
    if (!id) return null;
    const { engine } = this.bridge;
    const { state } = engine;
    const index = state.shop.findIndex((shopId) => shopId === id);
    const hasCapacity = engine.boardCount < engine.boardCap || state.bench.some((unit) => !unit);
    if (index < 0 || !hasCapacity || state.gold < UNIT_DEFS[id].cost) return null;
    this.seerPurchaseOffsets[this.rerolls] = offset + 1;
    return { type: "shop", index } as GameAction;
  }

  private seerPlannedSaleAction(): GameAction | null {
    if (this.style !== "seer" || !this.seerPlan) return null;
    const salesByShop = this.seerPlan.firstStep.salesByShop;
    const plannedSales = salesByShop?.[this.rerolls];
    if (!plannedSales) return null;
    const offset = this.seerSaleOffsets[this.rerolls] || 0;
    const id = plannedSales[offset];
    if (!id) return null;
    const index = this.bridge.engine.state.bench.findIndex((unit) => unit?.id === id);
    if (index < 0) return null;
    this.seerSaleOffsets[this.rerolls] = offset + 1;
    return { type: "sell", location: { zone: "bench", index } } as GameAction;
  }

  private replacementRoster(
    roster: OwnedEntry[],
    candidate: ShopCandidate,
    sacrifice: OwnedEntry,
  ) {
    const next = roster
      .filter(({ unit }) => unit.uid !== sacrifice.unit.uid)
      .map(({ unit, location }) => ({
        unit: { ...unit },
        location: { ...location },
      }));
    next.push({
      unit: { uid: -1, id: candidate.id, star: 1 },
      location: { ...sacrifice.location },
    });

    const locationOrder = (entry: OwnedEntry) => (
      (entry.location.zone === "board" ? 0 : 100) + entry.location.index
    );
    let merged = true;
    while (merged) {
      merged = false;
      for (const star of [1, 2] as const) {
        const matches = next
          .filter(({ unit }) => unit.id === candidate.id && unit.star === star)
          .sort((left, right) => locationOrder(left) - locationOrder(right));
        if (matches.length < 3) continue;
        const keep = matches.find(({ location }) => location.zone === "board") || matches[0];
        const removedUids = new Set(matches.slice(0, 3)
          .filter(({ unit }) => unit.uid !== keep.unit.uid)
          .map(({ unit }) => unit.uid));
        keep.unit.star = (star + 1) as 2 | 3;
        for (let index = next.length - 1; index >= 0; index -= 1) {
          if (removedUids.has(next[index].unit.uid)) next.splice(index, 1);
        }
        merged = true;
        break;
      }
    }
    return next;
  }

  private previewRosterRollout(
    roster: OwnedEntry[],
    exactOnly = false,
    combatHz = this.rolloutCombatHz,
  ) {
    const planning = {
      plannedLineupKey: this.plannedLineupKey,
      plannedLineupUids: [...this.plannedLineupUids],
      plannedLineupUnits: new Map(this.plannedLineupUnits),
      plannedLineupScore: this.plannedLineupScore,
      plannedFormation: this.plannedFormation,
      lineageUnitIds: [...this.lineageUnitIds],
      lineageFormation: this.lineageFormation,
      rolloutVariantLimit: this.rolloutVariantLimit,
      rolloutCombatHz: this.rolloutCombatHz,
    };
    try {
      if (exactOnly) {
        this.rolloutVariantLimit = 1;
        this.rolloutCombatHz = EXACT_COMBAT_HZ;
      } else this.rolloutCombatHz = Math.max(20, Math.min(
        EXACT_COMBAT_HZ,
        Math.round(combatHz),
      ));
      this.plannedLineupKey = "";
      this.plannedLineupUids = [];
      this.plannedLineupUnits.clear();
      this.plannedLineupScore = Number.NEGATIVE_INFINITY;
      this.rolloutTargetLineup(roster);
      return this.plannedLineupScore;
    } finally {
      this.plannedLineupKey = planning.plannedLineupKey;
      this.plannedLineupUids = planning.plannedLineupUids;
      this.plannedLineupUnits = planning.plannedLineupUnits;
      this.plannedLineupScore = planning.plannedLineupScore;
      this.plannedFormation = planning.plannedFormation;
      this.lineageUnitIds = planning.lineageUnitIds;
      this.lineageFormation = planning.lineageFormation;
      this.rolloutVariantLimit = planning.rolloutVariantLimit;
      this.rolloutCombatHz = planning.rolloutCombatHz;
    }
  }

  private replacementAction(roster: OwnedEntry[]): GameAction | null {
    const { engine } = this.bridge;
    const { state } = engine;
    const emptyBench = state.bench.filter((unit) => !unit).length;
    if (
      engine.boardCount < engine.boardCap
      || emptyBench > this.policy.benchPressureEmptySlots
    ) return null;

    const candidates = this.shopCandidates(roster);
    if (candidates.length === 0) return null;
    const currentScore = this.rolloutConfidence(roster);
    const unsafe = currentScore < this.policy.safeWinRolloutScore;
    const desiredUids = new Set(this.rolloutTargetLineup(roster).map(({ unit }) => unit.uid));
    const financeProjectIds = this.financeProjectIds(roster);
    const upgradeProjectIds = this.upgradeProjectIds(roster);
    const lateGameReserveUids = this.lateGameReserveUids(roster);
    const plans = candidates.flatMap((candidate) => roster.flatMap((sacrifice) => {
      const { unit } = sacrifice;
      const protectedProject = financeProjectIds.has(unit.id)
        || upgradeProjectIds.has(unit.id)
        || lateGameReserveUids.has(unit.uid);
      if (unit.id === candidate.id) return [];
      if (!unsafe && (desiredUids.has(unit.uid) || protectedProject)) return [];
      if (!unsafe && unit.star !== 1 && candidate.lateGamePriority <= 0) return [];
      const prospectiveRoster = this.replacementRoster(roster, candidate, sacrifice);
      return [{
        candidate,
        sacrifice,
        roster: prospectiveRoster,
        heuristicScore: this.lineupHeuristicScore(this.targetLineup(prospectiveRoster)),
        protectedProject,
      } satisfies ReplacementPlan];
    }));
    if (plans.length === 0) return null;

    const currentHeuristic = this.lineupHeuristicScore(this.targetLineup(roster));
    const comparePlans = (left: ReplacementPlan, right: ReplacementPlan) => (
      Number(left.protectedProject) - Number(right.protectedProject)
      || Number(desiredUids.has(left.sacrifice.unit.uid))
        - Number(desiredUids.has(right.sacrifice.unit.uid))
      || right.heuristicScore - left.heuristicScore
      || this.unitScore(left.sacrifice.unit, roster) - this.unitScore(right.sacrifice.unit, roster)
    );
    const bestPlanByCandidate = [...plans]
      .sort(comparePlans)
      .reduce<Map<number, ReplacementPlan>>((best, candidatePlan) => {
        if (!best.has(candidatePlan.candidate.index)) {
          best.set(candidatePlan.candidate.index, candidatePlan);
        }
        return best;
      }, new Map());
    const screened = Array.from(bestPlanByCandidate.values())
      .sort((left, right) => right.heuristicScore - left.heuristicScore
        || right.candidate.score - left.candidate.score)
      .slice(0, this.planningMode === "training" ? 1 : REPLACEMENT_PREVIEW_LIMIT)
      .map((plan) => ({
        ...plan,
        rolloutScore: this.previewRosterRollout(plan.roster, false, 30),
      }))
      .sort((left, right) => right.rolloutScore - left.rolloutScore
        || right.heuristicScore - left.heuristicScore);
    const finalists = screened
      .slice(0, this.planningMode === "training"
        ? 1
        : this.rolloutCombatHz >= EXACT_COMBAT_HZ ? 2 : 1)
      .map((plan) => ({
        ...plan,
        rolloutScore: this.previewRosterRollout(plan.roster, true),
      }))
      .sort((left, right) => right.rolloutScore - left.rolloutScore
        || right.heuristicScore - left.heuristicScore);
    const plan = finalists.find(({ candidate, heuristicScore, rolloutScore }) => {
      const futureProject = candidate.advancesFinance
        || candidate.targetDuplicate
        || candidate.completesMerge
        || candidate.lateGamePriority > 0;
      const combatImproves = rolloutScore >= currentScore + REPLACEMENT_ROLLOUT_MIN_GAIN;
      if (unsafe) return combatImproves || (
        rolloutScore >= this.policy.safeWinRolloutScore
        && currentScore < this.policy.safeWinRolloutScore
      );
      return combatImproves || (
        futureProject
        && rolloutScore >= this.policy.safeWinRolloutScore
        && (
          candidate.lateGamePriority > 0
          || heuristicScore >= currentHeuristic
        )
      );
    });
    if (!plan) return null;

    this.pendingPurchase = { index: plan.candidate.index, id: plan.candidate.id };
    return { type: "sell", location: plan.sacrifice.location };
  }

  private upgradeAction(): GameAction | null {
    const { engine } = this.bridge;
    const { state } = engine;
    const roster = this.ownedEntries();
    const currentScore = this.rolloutConfidence(roster);
    if (this.seerPlan) {
      if (
        state.playerLevel < this.seerPlan.firstStep.targetLevel
        && engine.upgradeCost !== null
        && state.gold >= engine.upgradeCost
      ) return { type: "buyXp" } as GameAction;
      return null;
    }
    const scheduledTargetLevel = Math.min(10, 3 + Math.floor(
      (state.round + this.policy.targetLevelRoundOffset) / this.policy.targetLevelRoundDivisor,
    ));
    const cost = engine.upgradeCost;
    if (cost === null || state.gold < cost) return null;
    const developmentTargetLevel = currentScore >= this.policy.safeWinRolloutScore
      && state.hp > this.policy.woundedHpThreshold
      && this.lateGameDevelopmentIncomplete(roster)
      ? desiredLateGameLevelForRound(state.round)
      : 3;
    const targetLevel = Math.max(scheduledTargetLevel, developmentTargetLevel);
    if (state.playerLevel >= targetLevel) return null;
    let levelScore = currentScore;
    if (currentScore < this.policy.safeWinRolloutScore && roster.length > engine.boardCap) {
      const currentLevel = state.playerLevel;
      try {
        state.playerLevel = (currentLevel + 1) as PlayerLevel;
        levelScore = this.previewRosterRollout(roster, true);
      } finally {
        state.playerLevel = currentLevel;
      }
    }
    const survivalUpgrade = currentScore < this.policy.safeWinRolloutScore
      && levelScore >= currentScore + REPLACEMENT_ROLLOUT_MIN_GAIN;
    const financeBanking = state.playerLevel >= 7
      && state.hp > this.policy.woundedHpThreshold
      && this.financeInterestActive()
      && currentScore >= this.policy.safeWinRolloutScore;
    const reserve = survivalUpgrade
      ? this.stabilizationGoldReserve(this.policy.levelInterestTiersAtRisk)
      : financeBanking
      ? Math.max(FINANCE_INTEREST_CAP * 4, this.goldReserve(false, 0))
      : this.goldReserve(false, this.policy.levelInterestTiersAtRisk);
    if (state.gold - cost >= reserve) return { type: "buyXp" } as GameAction;
    return null;
  }

  private expendableInterestEntries(roster: OwnedEntry[], desired = this.rolloutTargetLineup(roster)) {
    const desiredUids = new Set(desired.map(({ unit }) => unit.uid));
    const financeProjectIds = this.financeProjectIds(roster);
    const upgradeProjectIds = this.upgradeProjectIds(roster, desired);
    const mergeProjectIds = this.oneCopyFromMergeIds(roster);
    const lateGameReserveUids = this.lateGameReserveUids(roster);
    return roster
      .filter(({ unit }) => {
        const futureReserve = financeProjectIds.has(unit.id)
          || upgradeProjectIds.has(unit.id)
          || mergeProjectIds.has(unit.id)
          || lateGameReserveUids.has(unit.uid);
        return (!futureReserve || this.speculativeUnitIds.has(unit.id))
          && !desiredUids.has(unit.uid);
      })
      .sort((left, right) => this.unitScore(left.unit, roster) - this.unitScore(right.unit, roster)
        || Number(left.location.zone === "board") - Number(right.location.zone === "board")
        || this.bridge.engine.getUnitSellValue(left.unit) - this.bridge.engine.getUnitSellValue(right.unit)
        || left.unit.uid - right.unit.uid);
  }

  private benchCleanupAction(roster: OwnedEntry[]): GameAction | null {
    const { engine } = this.bridge;
    if (
      this.benchCleanupSales >= this.policy.maxStarCleanupSales
      || engine.boardCount < engine.boardCap
    ) return null;
    const desired = this.rolloutTargetLineup(roster);
    const emptyBench = engine.state.bench.filter((unit) => !unit).length;
    const underBenchPressure = emptyBench <= this.policy.benchPressureEmptySlots;
    const emergencyProjectSales = underBenchPressure
      && this.style !== "seer"
      ? (() => {
        const mergeProjectIds = this.oneCopyFromMergeIds(roster);
        const desiredUids = new Set(desired.map(({ unit }) => unit.uid));
        const boardStars = new Map<UnitId, number>();
        engine.state.board.forEach((unit) => {
          if (!unit) return;
          boardStars.set(unit.id, Math.max(boardStars.get(unit.id) || 0, unit.star));
        });
        return roster.filter(({ unit, location }) => (
          location.zone === "bench"
          && !desiredUids.has(unit.uid)
          && unit.star === 1
          && !mergeProjectIds.has(unit.id)
          && (boardStars.get(unit.id) || 0) >= 2
        ));
      })()
      : [];
    const completedDuplicates = roster.filter(({ unit, location }) => (
      location.zone === "bench"
      && roster.some(({ unit: owned }) => owned.id === unit.id && owned.star === 3)
    ));
    const pressureSales = underBenchPressure
      ? this.expendableInterestEntries(roster, desired)
        .filter(({ location }) => location.zone === "bench")
      : [];
    const sale = Array.from(new Map(
      [...completedDuplicates, ...pressureSales, ...emergencyProjectSales]
        .map((entry) => [entry.unit.uid, entry]),
    ).values())
      .sort((left, right) => lateGameTargetPriority(left.unit.id)
        - lateGameTargetPriority(right.unit.id)
        || left.unit.star - right.unit.star
        || engine.getUnitSellValue(left.unit) - engine.getUnitSellValue(right.unit)
        || left.unit.uid - right.unit.uid)[0];
    if (!sale) return null;
    this.benchCleanupSales += 1;
    this.soldUnitIds.add(sale.unit.id);
    return { type: "sell", location: sale.location };
  }

  private fundingSaleAction(roster: OwnedEntry[], currentScore: number): GameAction | null {
    const { engine } = this.bridge;
    const { state } = engine;
    const desired = this.rolloutTargetLineup(roster);
    const desiredUids = new Set(desired.map(({ unit }) => unit.uid));
    const mergeProjectIds = this.oneCopyFromMergeIds(roster);
    const boardStars = new Map<UnitId, number>();
    state.board.forEach((unit) => {
      if (!unit) return;
      boardStars.set(unit.id, Math.max(boardStars.get(unit.id) || 0, unit.star));
    });
    const emergencySales = roster.filter(({ unit, location }) => (
      location.zone === "bench"
      && !desiredUids.has(unit.uid)
      && unit.star === 1
      && !mergeProjectIds.has(unit.id)
      && (boardStars.get(unit.id) || 0) >= 2
    ));
    const salePool = Array.from(new Map(
      [
        ...this.expendableInterestEntries(roster, desired),
        ...emergencySales,
      ]
        .filter(({ location }) => location.zone === "bench")
        .map((entry) => [entry.unit.uid, entry]),
    ).values())
      .sort((left, right) => this.unitScore(left.unit, roster) - this.unitScore(right.unit, roster)
        || engine.getUnitSellValue(left.unit) - engine.getUnitSellValue(right.unit)
        || left.unit.uid - right.unit.uid)
      .slice(0, 8);
    if (salePool.length === 0) return null;

    const originalGold = state.gold;
    let levelScore: number | null = null;
    let best: {
      sale: OwnedEntry;
      candidate: ShopCandidate | null;
      score: number;
      action: "upgrade" | "purchase";
    } | null = null;
    try {
      salePool.forEach((sale) => {
        state.gold = originalGold + engine.getUnitSellValue(sale.unit);
        const upgrade = this.upgradeAction();
        let upgradeScore = Number.NEGATIVE_INFINITY;
        if (upgrade?.type === "buyXp") {
          if (levelScore === null) {
            const currentLevel = state.playerLevel;
            try {
              if (currentLevel < 10) {
                state.playerLevel = (currentLevel + 1) as PlayerLevel;
                levelScore = this.previewRosterRollout(roster, false, 30);
              } else levelScore = Number.NEGATIVE_INFINITY;
            } finally {
              state.playerLevel = currentLevel;
            }
          }
          upgradeScore = levelScore;
        }

        const candidate = this.shopCandidates(roster, false)[0] || null;
        let purchaseScore = Number.NEGATIVE_INFINITY;
        if (candidate) {
          purchaseScore = this.previewRosterRollout(
            this.replacementRoster(roster, candidate, sale),
            false,
            30,
          );
        }
        const action = upgradeScore >= purchaseScore ? "upgrade" : "purchase";
        const score = Math.max(upgradeScore, purchaseScore);
        const meaningfulGain = score >= currentScore + REPLACEMENT_ROLLOUT_MIN_GAIN
          || (currentScore < this.policy.safeWinRolloutScore
            && score >= this.policy.safeWinRolloutScore);
        if (!meaningfulGain) return;
        if (
          !best
          || score > best.score
          || (score === best.score
            && engine.getUnitSellValue(sale.unit) < engine.getUnitSellValue(best.sale.unit))
        ) {
          best = { sale, candidate: action === "purchase" ? candidate : null, score, action };
        }
      });
    } finally {
      state.gold = originalGold;
    }
    const chosen = best as {
      sale: OwnedEntry;
      candidate: ShopCandidate | null;
      score: number;
      action: "upgrade" | "purchase";
    } | null;
    if (!chosen) return null;
    if (chosen.action === "purchase" && chosen.candidate) {
      this.pendingPurchase = { index: chosen.candidate.index, id: chosen.candidate.id };
      if (chosen.candidate.speculative) this.speculativeUnitIds.add(chosen.candidate.id);
    }
    this.soldUnitIds.add(chosen.sale.unit.id);
    return { type: "sell", location: chosen.sale.location };
  }

  private interestSaleAction(roster: OwnedEntry[]): GameAction | null {
    const { engine } = this.bridge;
    const { state } = engine;
    const desired = this.rolloutTargetLineup(roster);
    if (engine.boardCount < desired.length) return null;
    const expendable = this.expendableInterestEntries(roster, desired);
    const strategicSaleAllowed = state.hp > 8
      && state.streak >= 2
      && Math.max(0, roster.length - desired.length) >= this.policy.interestSaleMinimumBench
      && this.rolloutConfidence(roster) >= this.policy.safeWinRolloutScore;
    const speculative = expendable.filter(({ unit }) => this.speculativeUnitIds.has(unit.id));
    if (!strategicSaleAllowed && speculative.length === 0) return null;
    const salePool = strategicSaleAllowed ? expendable : speculative;
    const { step, cap } = this.interestRule();
    const currentInterest = this.interestAt(state.gold);
    if (currentInterest >= cap) return null;
    const totalSaleValue = salePool.reduce(
      (sum, { unit }) => sum + engine.getUnitSellValue(unit),
      0,
    );
    const targetInterest = this.interestAt(state.gold + totalSaleValue);
    if (targetInterest <= currentInterest) return null;
    const requiredGold = targetInterest * step - state.gold;
    type InterestSalePlan = {
      entries: OwnedEntry[];
      value: number;
      strategicCost: number;
    };
    const plans = salePool.reduce<Map<number, InterestSalePlan>>((states, entry) => {
      const value = engine.getUnitSellValue(entry.unit);
      const entryCost = this.unitScore(entry.unit, roster)
        + (entry.unit.star === 2 ? 500 : entry.unit.star === 3 ? 900 : 0)
        + (this.speculativeUnitIds.has(entry.unit.id) ? 0 : 120)
        + (entry.location.zone === "board" ? 20 : 0);
      const next = new Map(states);
      states.forEach((plan, total) => {
        const nextTotal = total + value;
        const candidate = {
          entries: [...plan.entries, entry],
          value: nextTotal,
          strategicCost: plan.strategicCost + entryCost,
        };
        const previous = next.get(nextTotal);
        if (!previous || candidate.strategicCost < previous.strategicCost) {
          next.set(nextTotal, candidate);
        }
      });
      return next;
    }, new Map<number, InterestSalePlan>([[0, { entries: [], value: 0, strategicCost: 0 }]]))
      .values();
    const rankedPlans = Array.from(plans).filter(({ value }) => value >= requiredGold)
      .sort((left, right) => left.strategicCost - right.strategicCost
        || left.value - right.value
        || left.entries.length - right.entries.length);
    const sale = rankedPlans[0]?.entries
      .sort((left, right) => this.unitScore(left.unit, roster) - this.unitScore(right.unit, roster)
        || engine.getUnitSellValue(left.unit) - engine.getUnitSellValue(right.unit)
        || left.unit.uid - right.unit.uid)[0];
    if (!sale) return null;
    this.interestSales += 1;
    this.soldUnitIds.add(sale.unit.id);
    return { type: "sell", location: sale.location };
  }

  private invalidateFinalLineup() {
    this.plannedLineupKey = "";
    this.plannedLineupUids = [];
    this.plannedLineupUnits.clear();
    this.plannedLineupScore = Number.NEGATIVE_INFINITY;
    this.confidenceKey = "";
    this.confidenceScore = Number.NEGATIVE_INFINITY;
  }

  private finalReinvestmentAction(roster: OwnedEntry[]): GameAction | null {
    const { engine } = this.bridge;
    if (
      this.finalReinvestments >= this.policy.maximumFinalReinvestments
      || (engine.boardCount >= engine.boardCap && engine.state.bench.every(Boolean))
    ) return null;
    const currentLineup = this.rolloutTargetLineup(roster);
    const currentScore = this.rolloutConfidence(roster);
    const currentInterest = this.interestAt(engine.state.gold);
    const candidates = this.shopCandidates(roster, false)
      .filter((candidate) => (
        candidate.completesMerge
        || candidate.advancesFinance
        || candidate.targetDuplicate
        || candidate.completesTrait
        || candidate.clearUpgrade
        || candidate.lateGamePriority > 0
      ))
      .slice(0, this.planningMode === "training" ? 1 : undefined);
    for (const candidate of candidates) {
      if (this.soldUnitIds.has(candidate.id) && !candidate.completesMerge) continue;
      const { cost } = UNIT_DEFS[candidate.id];
      const losesInterest = this.interestAt(engine.state.gold - cost) < currentInterest;
      const prospectiveUnit: OwnedUnit = { uid: -100 - candidate.index, id: candidate.id, star: 1 };
      const prospectiveEntry: OwnedEntry = {
        unit: prospectiveUnit,
        location: { zone: "bench", index: -1 },
      };
      const weakest = [...currentLineup].sort(
        (left, right) => this.unitScore(left.unit, roster) - this.unitScore(right.unit, roster),
      )[0];
      const prospectiveLineup = currentLineup.length < engine.boardCap
        ? [...currentLineup, prospectiveEntry]
        : currentLineup.map((entry) => (
          entry.unit.uid === weakest?.unit.uid ? prospectiveEntry : entry
        ));
      const prospectiveScore = this.rolloutLineupScore(prospectiveLineup, this.plannedFormation);
      const immediateUpgrade = candidate.completesMerge;
      const improvesCombat = prospectiveScore > currentScore + 25;
      const futureProject = candidate.advancesFinance
        || candidate.targetDuplicate
        || candidate.completesMerge
        || candidate.lateGamePriority > 0;
      if (
        losesInterest
        && currentScore >= this.policy.safeWinRolloutScore
        && !futureProject
      ) continue;
      if (!immediateUpgrade && !improvesCombat && losesInterest) continue;
      if (!immediateUpgrade && !improvesCombat && currentScore < this.policy.safeWinRolloutScore) continue;
      this.finalReinvestments += 1;
      if (candidate.speculative) this.speculativeUnitIds.add(candidate.id);
      this.invalidateFinalLineup();
      return { type: "shop", index: candidate.index };
    }
    return null;
  }

  private populationAction(roster: OwnedEntry[]): GameAction | null {
    const { engine } = this.bridge;
    if (engine.boardCount >= engine.boardCap) return null;
    const emptyBoard = engine.state.board.findIndex((unit) => !unit);
    if (emptyBoard < 0) return null;
    const desired = this.rolloutTargetLineup(roster);
    const desiredBench = desired.find(({ location }) => location.zone === "bench");
    const fallbackBench = roster
      .filter(({ location }) => location.zone === "bench")
      .sort((left, right) => this.unitScore(right.unit, roster) - this.unitScore(left.unit, roster)
        || left.unit.uid - right.unit.uid)[0];
    const source = desiredBench || fallbackBench;
    if (!source) return null;
    return {
      type: "move",
      from: source.location,
      to: { zone: "board", index: emptyBoard },
    } as GameAction;
  }

  private formationAction(roster: OwnedEntry[]): GameAction | null {
    const desired = this.rolloutTargetLineup(roster);
    const desiredIds = new Set(desired.map(({ unit }) => unit.uid));
    const emptyBench = this.bridge.engine.state.bench.findIndex((unit) => !unit);
    const surplusBoard = roster.find(
      ({ unit, location }) => location.zone === "board" && !desiredIds.has(unit.uid),
    );
    if (surplusBoard && emptyBench >= 0) {
      return {
        type: "move",
        from: surplusBoard.location,
        to: { zone: "bench", index: emptyBench },
      } as GameAction;
    }
    if (surplusBoard) {
      const desiredBench = desired.find(({ location }) => location.zone === "bench");
      if (desiredBench) {
        return {
          type: "move",
          from: desiredBench.location,
          to: surplusBoard.location,
        } as GameAction;
      }
    }

    const placements = formationPlacements(desired, this.plannedFormation).map(({ entry, slot }) => ({
      uid: entry.unit.uid,
      slot,
    }));
    for (const placement of placements) {
      const current = this.ownedEntries().find(({ unit }) => unit.uid === placement.uid);
      if (!current) continue;
      if (current.location.zone === "board" && current.location.index === placement.slot) continue;
      return {
        type: "move",
        from: current.location,
        to: { zone: "board", index: placement.slot },
      } as GameAction;
    }
    return null;
  }

  private searchRescueLineup(roster: OwnedEntry[]) {
    if (this.rescueSearchCompleted) return false;
    this.rescueSearchCompleted = true;
    const cap = this.bridge.engine.boardCap;
    if (
      this.planningMode !== "evolution"
      || roster.length <= cap
      || this.rolloutConfidence(roster) >= this.policy.safeWinRolloutScore
    ) {
      return false;
    }

    const current = this.rolloutTargetLineup(roster);
    const combinations: OwnedEntry[][] = [];
    const selected: OwnedEntry[] = [];
    const collect = (start: number) => {
      if (selected.length === cap) {
        combinations.push([...selected]);
        return;
      }
      const needed = cap - selected.length;
      for (let index = start; index <= roster.length - needed; index += 1) {
        selected.push(roster[index]);
        collect(index + 1);
        selected.pop();
      }
    };
    collect(0);

    const currentKey = current.map(({ unit }) => unit.uid).sort((left, right) => left - right).join(",");
    const finalists = combinations
      .map((lineup) => ({ lineup, heuristic: this.lineupHeuristicScore(lineup) }))
      .sort((left, right) => right.heuristic - left.heuristic)
      .slice(0, RESCUE_HEURISTIC_CANDIDATE_LIMIT);
    if (!finalists.some(({ lineup }) => (
      lineup.map(({ unit }) => unit.uid).sort((left, right) => left - right).join(",") === currentKey
    ))) {
      finalists[finalists.length - 1] = {
        lineup: current,
        heuristic: this.lineupHeuristicScore(current),
      };
    }

    const previousVariantLimit = this.rolloutVariantLimit;
    this.rolloutVariantLimit = 1;
    let best: {
      lineup: OwnedEntry[];
      formation: FormationProfile;
      rollout: number;
      heuristic: number;
    } | null = null;
    try {
      for (const { lineup, heuristic } of finalists) {
        for (const formation of FORMATION_PROFILE_IDS) {
          const rollout = this.rolloutLineupScore(lineup, formation);
          if (
            !best
            || rollout > best.rollout
            || (rollout === best.rollout && heuristic > best.heuristic)
          ) {
            best = { lineup, formation, rollout, heuristic };
          }
        }
      }
    } finally {
      this.rolloutVariantLimit = previousVariantLimit;
    }
    if (!best) return false;

    const rosterKey = roster
      .map(({ unit }) => `${unit.uid}:${unit.id}:${unit.star}`)
      .sort()
      .join("|");
    this.plannedLineupKey = `${this.bridge.engine.state.round}/${cap}/${rosterKey}`;
    this.plannedLineupUids = best.lineup.map(({ unit }) => unit.uid);
    this.plannedLineupUnits = new Map(best.lineup.map(({ unit }) => [
      unit.uid,
      { id: unit.id, star: unit.star },
    ]));
    this.plannedFormation = best.formation;
    this.lineageUnitIds = best.lineup.map(({ unit }) => unit.id);
    this.lineageFormation = best.formation;
    this.plannedLineupScore = this.rolloutLineupScore(best.lineup, best.formation);
    this.confidenceKey = "";
    return true;
  }

  private nextPreparationAction(): GameAction | null {
    const { engine } = this.bridge;
    const { state } = engine;
    if (this.plannedRound !== state.round) this.resetPreparation(state.round);
    this.preparationActions += 1;

    const preparationSignature = JSON.stringify({
      finalizing: this.finalizingEconomy,
      stabilizationInterestTiersAtRisk: this.stabilizationInterestTiersAtRisk,
      gold: state.gold,
      shop: state.shop,
      board: state.board.map((unit) => (unit ? `${unit.id}:${unit.star}` : null)),
      bench: state.bench.map((unit) => (unit ? `${unit.id}:${unit.star}` : null)),
    });
    const visits = (this.preparationStateVisits.get(preparationSignature) || 0) + 1;
    this.preparationStateVisits.set(preparationSignature, visits);
    if ((this.preparationActions >= PREPARATION_ACTION_LIMIT || visits >= 3) && engine.boardCount > 0) {
      return { type: "battle" };
    }

    const roster = this.ownedEntries();
    this.observeStabilizationStrength(roster);
    const pendingPurchase = this.pendingPurchaseAction();
    if (pendingPurchase) return pendingPurchase;
    const plannedSale = this.seerPlannedSaleAction();
    if (plannedSale) return plannedSale;
    // A legal board slot is immediate combat power; fill it before any economic action.
    const population = this.populationAction(roster);
    if (population) return population;
    const needsPopulation = roster.length < engine.boardCap;
    const benchUnderPressure = engine.boardCount >= engine.boardCap
      && engine.state.bench.filter((unit) => !unit).length <= this.policy.benchPressureEmptySlots;
    const rolloutScore = this.rolloutConfidence(roster);
    if (benchUnderPressure && rolloutScore < this.policy.safeWinRolloutScore) {
      const replacement = this.preparationActions < ECONOMY_ACTION_LIMIT
        ? this.replacementAction(roster)
        : null;
      if (replacement) return replacement;
      const pressureCleanup = this.benchCleanupAction(this.ownedEntries());
      if (pressureCleanup) return pressureCleanup;
    }
    if (this.seerPlan && state.playerLevel < this.seerPlan.firstStep.targetLevel) {
      const plannedUpgrade = this.upgradeAction();
      if (plannedUpgrade) return plannedUpgrade;
    }
    const plannedPurchase = this.seerPlannedPurchaseAction();
    if (plannedPurchase) return plannedPurchase;
    const fill = needsPopulation ? this.purchaseAction(roster, true) : null;
    if (fill) return fill;
    const fundingSale = this.preparationActions < ECONOMY_ACTION_LIMIT
      ? this.fundingSaleAction(roster, rolloutScore)
      : null;
    if (fundingSale) return fundingSale;
    const upgrade = this.upgradeAction();
    if (upgrade) return upgrade;
    const replacement = this.preparationActions < ECONOMY_ACTION_LIMIT
      ? this.replacementAction(roster)
      : null;
    if (replacement) return replacement;
    const pressureCleanup = this.benchCleanupAction(this.ownedEntries());
    if (pressureCleanup) return pressureCleanup;
    const purchase = this.preparationActions < ECONOMY_ACTION_LIMIT
      ? this.purchaseAction(roster, false)
      : null;
    if (purchase) return purchase;
    const cleanup = this.benchCleanupAction(this.ownedEntries());
    if (cleanup) return cleanup;
    const interestSale = this.interestSaleAction(this.ownedEntries());
    if (interestSale) return interestSale;
    const rerollStrategy = this.rerollStrategy(roster);
    const needsStabilization = !this.seerPlan
      && rerollStrategy.rolloutScore < this.policy.safeWinRolloutScore;
    const seerRerollLimit = this.seerPlan?.firstStep.rerolls ?? Number.POSITIVE_INFINITY;
    const canUseFreeReroll = state.freeRerollCharges > 0
      && this.rerolls < (needsStabilization ? 6 : Math.min(6, seerRerollLimit));
    const terminalReserve = needsStabilization
      ? null
      : this.terminalRollDownReserve(roster, rerollStrategy.rolloutScore);
    const terminalRollDown = terminalReserve !== null;
    const maximumInterestTiersAtRisk = rerollStrategy.mode === "upgrade_chase"
      ? this.policy.upgradeChaseRerollInterestTiersAtRisk
      : this.policy.stabilizeRerollInterestTiersAtRisk;
    const interestTiersAtRisk = needsStabilization
      ? this.stabilizationInterestTiersAtRisk
      : 0;
    const rerollReserve = needsStabilization
      ? this.stabilizationGoldReserve(interestTiersAtRisk)
      : terminalRollDown
        ? terminalReserve + 5
        : this.goldReserve(false, 0);
    const developmentRerollLimit = Math.min(
      this.policy.maximumExcessPaidRerolls,
      Math.max(0, this.preparationStartGold - rerollReserve),
    );
    const canSearchDevelopment = !needsStabilization
      && (terminalRollDown || this.shouldSearchLongTermDevelopment(roster));
    const stabilizationDryRerollLimit = state.hp <= this.policy.criticalHpThreshold
      ? ECONOMY_ACTION_LIMIT
      : state.hp <= this.policy.woundedHpThreshold
        ? Math.min(ECONOMY_ACTION_LIMIT, this.policy.maximumDryPaidRerolls * 2)
        : this.policy.maximumDryPaidRerolls;
    const seerCanUsePaidReroll = Boolean(
      this.seerPlan
      && state.playerLevel >= this.seerPlan.firstStep.targetLevel
      && this.rerolls < this.seerPlan.firstStep.rerolls
      && state.gold >= 1,
    );
    const canUsePaidReroll = this.seerPlan && !needsStabilization
      ? seerCanUsePaidReroll
      : state.gold - 1 >= rerollReserve
      && (
        needsStabilization
          ? this.paidRerolls < ECONOMY_ACTION_LIMIT
            && this.dryPaidRerolls < stabilizationDryRerollLimit
          : canSearchDevelopment
            && this.paidRerolls < developmentRerollLimit
            && this.dryPaidRerolls < (terminalRollDown
              ? this.policy.terminalRollDownMaximumDryRerolls
              : this.policy.maximumDryPaidRerolls)
      )
      && (needsStabilization || this.oracleHasFutureCandidate(roster));
    if (
      this.preparationActions < ECONOMY_ACTION_LIMIT
      && (canUseFreeReroll || canUsePaidReroll)
    ) {
      this.rerolls += 1;
      if (!canUseFreeReroll) {
        this.paidRerolls += 1;
        this.dryPaidRerolls += 1;
      }
      return { type: "reroll" };
    }
    if (
      this.preparationActions < ECONOMY_ACTION_LIMIT
      && !canUseFreeReroll
      && needsStabilization
      && this.stabilizationInterestTiersAtRisk < maximumInterestTiersAtRisk
      && state.gold - 1 >= this.stabilizationGoldReserve(maximumInterestTiersAtRisk)
      && (
        state.gold < rerollReserve
        || state.gold - 1 >= this.stabilizationGoldReserve(
          this.stabilizationInterestTiersAtRisk + 1,
        )
      )
    ) {
      this.stabilizationInterestTiersAtRisk += 1;
      return null;
    }
    this.finalizingEconomy = true;
    const finalCleanup = this.benchCleanupAction(this.ownedEntries());
    if (finalCleanup) return finalCleanup;
    const finalInterestSale = this.interestSaleAction(this.ownedEntries());
    if (finalInterestSale) return finalInterestSale;
    const reinvestment = this.preparationActions >= ECONOMY_ACTION_LIMIT
      ? this.finalReinvestmentAction(this.ownedEntries())
      : null;
    if (reinvestment) return reinvestment;
    this.searchRescueLineup(this.ownedEntries());
    const formation = this.formationAction(this.ownedEntries());
    if (formation && this.preparationActions < FORMATION_ACTION_LIMIT) return formation;
    if (engine.boardCount) return { type: "battle" };
    return null;
  }

  private augmentAction(): GameAction | null {
    const { augmentChoices } = this.bridge.engine.state;
    const preferenceRank = (id: (typeof augmentChoices)[number]) => {
      const rank = AUGMENT_PREFERENCE.indexOf(id as (typeof AUGMENT_PREFERENCE)[number]);
      return rank < 0 ? AUGMENT_PREFERENCE.length : rank;
    };
    if (this.planningMode === "training") {
      const index = augmentChoices
        .map((id, choiceIndex) => ({ choiceIndex, preference: preferenceRank(id) }))
        .sort((left, right) => left.preference - right.preference)[0]?.choiceIndex ?? 0;
      return augmentChoices[index] ? { type: "augment", index } as GameAction : null;
    }
    const index = augmentChoices
      .map((id, choiceIndex) => ({
        choiceIndex,
        rollout: this.augmentRolloutScore(choiceIndex),
        preference: preferenceRank(id),
      }))
      .sort((left, right) => right.rollout - left.rollout || left.preference - right.preference)[0]?.choiceIndex
      ?? 0;
    return augmentChoices[index] ? { type: "augment", index } as GameAction : null;
  }
}
