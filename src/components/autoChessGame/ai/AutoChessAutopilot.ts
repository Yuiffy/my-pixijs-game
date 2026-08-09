import {
  FINANCE_INTEREST_CAP,
  NORMAL_INTEREST_CAP,
  PLAYER_LEVELS,
  SHOP_UNITS,
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
  UnitLocation,
} from "../core/gameTypes";
import { EngineBridge, type GameAction } from "../phaser/EngineBridge";
import {
  informationModeForAutopilotStyle,
  canonicalAutopilotStyle,
  resolveAutopilotStylePolicy,
  type CanonicalAutopilotStyle,
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
  SEER2_PRINCIPAL_VARIATIONS,
  SEER2_TERMINAL_TARGET_IDS,
  SEER2_TERMINAL_TARGETS,
  seer2TargetDesiredCopies,
  seer2TargetPriority,
  selectSeer2PlanningTargets,
} from "./seer2Strategy";
import {
  planSeerEconomy,
  type SeerPlan,
  type SeerPlannerUnit,
  type SeerShopForecast,
  type SeerPlanStep,
} from "./seerPlanner";
import {
  AUTOPILOT_ROLLOUT_CACHE_SCHEMA,
  GO_ROLLOUT_CACHE_SCHEMA,
} from "./rolloutCacheSchema";
import { scorePreparedAutoChessCombat } from "./rolloutCombat";
import {
  scoreGoCombatCandidate,
  type GoCombatScorer,
} from "./goValueModel";
import {
  goCombatScenarioSeed,
  goCombatScenarioSignature,
} from "./goCombatScenario";
import {
  selectGoOpportunityTargets,
  type GoOpportunityTarget,
} from "./goStrategy";

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
  human_recorded: {
    rei: 23,
    units: {
      yua: [4],
      lian: [5],
      sui_bird: [9],
      yukisyo: [10],
      cinder_ram: [11],
      xuehui: [15],
      sui_flower: [16],
      grove_mender: [17],
      spark_mage: [22],
      rei: [23],
    },
    melee: [11, 17, 5, 10, 16, 4, 22, 9, 15, 3],
    ranged: [10, 16, 4, 22, 9, 15, 3, 21, 8, 14],
  },
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
  go_canonical: {
    rei: 23,
    melee: [11, 17, 10, 16, 5, 23, 9, 15, 4, 22],
    ranged: [10, 16, 9, 15, 4, 22, 3, 21, 8, 14],
  },
} as const;
type FormationProfile = keyof typeof FORMATION_PROFILES;
const STANDARD_FORMATION_PROFILE_IDS: FormationProfile[] = [
  "human_midline",
  "center_wedge",
  "split_flanks",
];
const SEER2_FORMATION_PROFILE_IDS: FormationProfile[] = [
  "human_recorded",
  ...STANDARD_FORMATION_PROFILE_IDS,
];
const GO_FORMATION_PROFILE_IDS: FormationProfile[] = ["go_canonical"];
const STAR_POWER = { 1: 1, 2: 2.6, 3: 7 } as const;
const PLANNER_UNIT_BASE_POWER = 36;
const TRANSITION_LINEUP_BONUS: Partial<Record<UnitId, number>> = {
  sui_blue: 22,
  seki_boar_king: 18,
  nightin: 14,
  sumi: 18,
  mitsuri: 14,
  cog_scribe: 18,
  pako: 10,
};
const unitCopyValue = (unit: OwnedUnit) => (unit.star === 3 ? 9 : unit.star === 2 ? 3 : 1);
const ROLLOUT_CANDIDATE_LIMIT = 3;
const SEER2_ROLLOUT_CANDIDATE_LIMIT = 6;
const SEER2_ROLLOUT_SURVIVOR_LIMIT = 3;
const GO_MODEL_PARENT_LIMIT = 8;
const GO_MODEL_SHORTLIST_LIMIT = 24;
const GO_MODEL_ROLLOUT_SURVIVOR_LIMIT = 12;
const GO_MODEL_ROBUST_LIMIT = 16;
const GO_RESCUE_MODEL_BEAM_WIDTH = 24;
const GO_RESCUE_MODEL_CANDIDATE_LIMIT = 24;
/**
 * Cheap rollouts can reject a real win in critical Go positions. Once the
 * normal shortlist is still unsafe, exact-check a bounded heuristic cover;
 * the model cover is a second pass because most positions are solved by the
 * cheaper first pass.
 */
const GO_CRITICAL_EXACT_HEURISTIC_INITIAL_LIMIT = 24;
const GO_CRITICAL_EXACT_HEURISTIC_EXPANDED_LIMIT = 48;
const GO_CRITICAL_EXACT_MODEL_LIMIT = 64;
const EVOLUTION_ELITE_LIMIT = 1;
const ROLLOUT_SEED_VARIANTS = 4;
const STARTER_ROLLOUT_BATTLES = 4;
const ECONOMY_ACTION_LIMIT = 72;
const FORMATION_ACTION_LIMIT = 88;
const PREPARATION_ACTION_LIMIT = 96;
const GO_PREPARATION_ACTION_LIMIT = 176;
const NORMAL_REPEATED_STATE_LIMIT = 8;
const REPLACEMENT_PREVIEW_LIMIT = 5;
const REPLACEMENT_ROLLOUT_MIN_GAIN = 12;
const RESCUE_HEURISTIC_CANDIDATE_LIMIT = 24;
const NORMAL_RESCUE_DIRECT_SHORTLIST_LIMIT = 24;
const GO_RESCUE_DIRECT_SWAP_SCREEN_LIMIT = 12;
const RESCUE_TWO_SWAP_CANDIDATE_LIMIT = 32;
const RESCUE_MIN_WIN_SCORE = 10000 - 26;
const ORACLE_MAX_ROUND = 60;
const ORACLE_EXTENDED_MAX_ROUND = 70;
const ORACLE_SHOP_LOOKAHEAD = 2048;
/**
 * Most abstract routes fail in the opening. Simulate only this prefix before
 * spending CPU on a complete exact 60-round validation. The chosen route is
 * still validated to the full horizon below.
 */
// The abstract beam already supplies route diversity. Exact replay only
// needs a small set of its best prefixes; replaying every alternative makes
// cold-start cost grow with horizon instead of with the useful branch count.
const SEER_ROUTE_PREFILTER_LIMIT = 8;
const SEER_ROUTE_PREFILTER_CANDIDATE_LIMIT = 4;
const SEER_ROUTE_VALIDATION_LIMIT = ORACLE_EXTENDED_MAX_ROUND;
const SEER_ENDGAME_TARGET_LOOKAHEAD = 48;
const SEER_ENDGAME_MAX_EXTRA_REROLLS = 48;
const GO_OPPORTUNITY_SHOP_LOOKAHEAD = 128;
const GO_OPPORTUNITY_MAX_REROLLS = 64;
const GO_FUTURE_THREAT_MIN_ROUND = 14;
// Keep a broad terminal project cover so a late reroll cannot sell a unit
// that is needed by a different future composition. Bench capacity and the
// exact combat planner still decide which projects are actually deployed.
const GO_OPPORTUNITY_TARGET_LIMIT = 8;
const STAR_FORGE_MIN_ROUND = 32;
const STAR_FORGE_MIN_SURPLUS = 200;
const SHARED_ROLLOUT_CACHE_LIMIT = 200000;
const EXACT_COMBAT_HZ = 60;
const DEFAULT_ROLLOUT_COMBAT_HZ = 30;
/** Browser planning uses a cheap CPU timestep; it is never the live battle timestep. */
export const LIVE_AUTOPILOT_ROLLOUT_HZ = 20;
/** Fast-forward and route validation must use the same precise timestep as combat audits. */
export const LIVE_AUTOPILOT_BATTLE_STEP_HZ = EXACT_COMBAT_HZ;
/** Compatibility alias for callers that used the old, ambiguous name. */
export const LIVE_AUTOPILOT_COMBAT_HZ = LIVE_AUTOPILOT_ROLLOUT_HZ;
const INTERACTIVE_SEER_LATE_ROUND = 48;
const INTERACTIVE_SEER_LATE_HORIZON = 6;
const INTERACTIVE_SEER_LATE_BEAM_WIDTH = 24;
const INTERACTIVE_SEER_RESCUE_DIRECT_BOARD_LIMIT = 24;
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

type SeerRouteValidationResume = {
  snapshot: ReturnType<AutoChessEngine["getSimulationSnapshot"]>;
  validatedSteps: SeerPlanStep[];
  trace: Array<Record<string, unknown>>;
  nextIndex: number;
};

const rosterShapeSignature = (roster: readonly OwnedEntry[]) => roster
  .map(({ unit }) => `${unit.id}:${unit.star}`)
  .sort()
  .join("|");

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
  const unitSlots = ("units" in profile ? profile.units : {}) as Partial<
    Record<UnitId, readonly number[]>
  >;
  const orderedLineup = profileId === "go_canonical"
    ? [...lineup].sort((left, right) => {
      const leftDefinition = UNIT_DEFS[left.unit.id];
      const rightDefinition = UNIT_DEFS[right.unit.id];
      const leftDurability = (leftDefinition.hp + leftDefinition.armor * 7)
        * STAR_POWER[left.unit.star];
      const rightDurability = (rightDefinition.hp + rightDefinition.armor * 7)
        * STAR_POWER[right.unit.star];
      return Number(rightDefinition.attackType === "melee")
        - Number(leftDefinition.attackType === "melee")
        || right.unit.star - left.unit.star
        || rightDurability - leftDurability
        || rightDefinition.range - leftDefinition.range
        || rightDefinition.attack - leftDefinition.attack
        || left.unit.id.localeCompare(right.unit.id);
    })
    : lineup;
  const frontline = orderedLineup.filter(({ unit }) => (
    unit.id === "rei" || UNIT_DEFS[unit.id].attackType === "melee"
  ));
  const ranged = orderedLineup.filter(({ unit }) => (
    unit.id !== "rei" && UNIT_DEFS[unit.id].attackType === "ranged"
  ));
  const used = new Set<number>();
  const placedUids = new Set<number>();
  const placements: Array<{ entry: OwnedEntry; slot: number }> = [];
  const place = (entry: OwnedEntry, preferredSlots: number[]) => {
    const slot = preferredSlots.find((candidate) => !used.has(candidate));
    if (slot === undefined) return false;
    used.add(slot);
    placements.push({ entry, slot });
    return true;
  };

  orderedLineup.forEach((entry) => {
    const preferredSlots = unitSlots[entry.unit.id];
    if (preferredSlots && place(entry, [...preferredSlots])) placedUids.add(entry.unit.uid);
  });

  frontline
    .filter(({ unit }) => unit.id === "rei" && !placedUids.has(unit.uid))
    .forEach((entry) => place(entry, [profile.rei, ...profile.melee]));
  frontline
    .filter(({ unit }) => unit.id !== "rei" && !placedUids.has(unit.uid))
    .forEach((entry) => place(entry, [...profile.melee]));
  ranged
    .filter(({ unit }) => !placedUids.has(unit.uid))
    .forEach((entry) => place(entry, [...profile.ranged]));
  return placements;
};

export const goCanonicalFormationPlacements = (lineup: OwnedEntry[]) => (
  formationPlacements(lineup, "go_canonical")
);

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

  /** 计划分数只对建立计划时的战斗 RNG 有效，刷新/买牌后必须重新精确复核。 */
  private plannedLineupRandomState: number | null = null;

  private previousLineupSnapshot: {
    rosterShapeKey: string;
    lineup: Array<{ id: UnitId; star: OwnedUnit["star"] }>;
    formation: FormationProfile;
    score: number;
    round: number;
    waveTag: "normal" | "elite" | "boss";
  } | null = null;

  private plannedFormation: FormationProfile = "human_midline";

  /** 临界波次允许保存一次按实际棋盘槽位搜索出的解，不强行套固定阵型。 */
  private plannedBoardSlots = new Map<number, number>();

  private rescueLineupLocked = false;

  /** 同一局面只做一次救援搜索；买卖、刷新或换位后允许重新搜索。 */
  private rescueSearchStateKey = "";

  private lineageUnitIds: UnitId[] = [];

  private lineageFormation: FormationProfile = "human_midline";

  private rolloutScoreCache = new Map<string, number>();

  private rolloutVariantLimit = ROLLOUT_SEED_VARIANTS;

  private confidenceKey = "";

  private confidenceScore = Number.NEGATIVE_INFINITY;

  private lastBattlePredictionScore = Number.NEGATIVE_INFINITY;

  private criticalExactConfidenceKey = "";

  private criticalExactConfidenceScore = Number.NEGATIVE_INFINITY;

  /** Live search is coarse, but the actual board gets one exact audit before
   * combat so a timestep change cannot hide a loss. */
  private exactBattleAuditKey = "";

  private exactBattleAuditScore = Number.NEGATIVE_INFINITY;

  private exactBattleAuditRejectedKey = "";

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

  /** 60 战路线被精确验证仍存活后，下一轮才把 oracle 目标延长到 70 战。 */
  private seerExtendedPlanningUnlocked = false;

  /** 完整验证从 16 战预筛的模拟快照继续，避免重复重放前缀。 */
  private seerRouteValidationResumes = new WeakMap<SeerPlan, SeerRouteValidationResume>();

  private seerValidationFailure = "";

  private seerValidationTrace: Array<Record<string, unknown>> = [];

  /** 完整路线与真实战力失配后，本局不重复计算同一条宏路线。 */
  private seerRouteAbandoned = false;

  private seer2FocusIds = new Set<UnitId>();

  private goOpportunityPriorities = new Map<UnitId, number>();

  private goOpportunityRerolls = 0;

  private goOpportunityInvestmentInProgress = false;

  private goOpportunitySafeInvestment: boolean | null = null;

  private seerPurchaseOffsets: number[] = [];

  private seerSaleOffsets: number[] = [];

  private seerExtraRerolls = 0;

  private seerFutureShopPreviewKey = "";

  private seerFutureShopPreview: readonly (readonly (UnitId | null)[])[] = [];

  private policy: AutopilotPolicy;

  private style: CanonicalAutopilotStyle;

  private informationMode: AutopilotInformationMode;

  private rolloutCombatHz: number;

  private readonly interactiveRuntime = typeof window !== "undefined";

  private readonly liveBattleAuditEnabled: boolean;

  private readonly policyOverrides: Partial<AutopilotPolicy>;

  constructor(
    private readonly bridge: EngineBridge,
    private readonly planningMode: AutopilotPlanningMode = "evolution",
    policy: Partial<AutopilotPolicy> = {},
    style: AutopilotStyle = "survival",
    informationMode: AutopilotInformationMode = informationModeForAutopilotStyle(style),
    rolloutCombatHz = typeof window === "undefined"
      ? DEFAULT_ROLLOUT_COMBAT_HZ
      : LIVE_AUTOPILOT_ROLLOUT_HZ,
    private readonly goCombatScorer: GoCombatScorer = scoreGoCombatCandidate,
    liveBattleAudit = typeof window !== "undefined",
  ) {
    if (planningMode === "training") this.rolloutVariantLimit = 1;
    this.policyOverrides = { ...policy };
    const canonicalStyle = canonicalAutopilotStyle(style);
    this.style = canonicalStyle;
    this.informationMode = informationModeForAutopilotStyle(canonicalStyle) === "normal"
      ? "normal"
      : informationMode;
    this.rolloutCombatHz = Math.max(20, Math.min(
      EXACT_COMBAT_HZ,
      Math.round(rolloutCombatHz),
    ));
    this.liveBattleAuditEnabled = liveBattleAudit;
    this.policy = resolveAutopilotStylePolicy(canonicalStyle, this.policyOverrides);
    this.bridge.setAutopilotStrategy(canonicalStyle, this.informationMode);
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
    const canonicalStyle = canonicalAutopilotStyle(style);
    this.style = canonicalStyle;
    this.informationMode = informationModeForAutopilotStyle(canonicalStyle) === "normal"
      ? "normal"
      : informationMode;
    this.policy = resolveAutopilotStylePolicy(canonicalStyle, this.policyOverrides);
    this.bridge.setAutopilotStrategy(canonicalStyle, this.informationMode);
    this.invalidateFinalLineup();
    this.seerRouteAbandoned = false;
    this.seerExtendedPlanningUnlocked = false;
    this.seer2FocusIds.clear();
    this.goOpportunityPriorities.clear();
    this.plannedRound = 0;
    this.nextActionAt = 0;
  }

  private usesSeer2Foundation() {
    return this.style === "seer";
  }

  private usesSeer2Economy() {
    return this.style === "seer" || this.style === "go";
  }

  private usesLearnedCombatPlanner() {
    return this.style === "survival"
      || this.style === "highroll"
      || this.style === "fair"
      || this.style === "go";
  }

  private usesBalancedEconomy() {
    return this.style === "fair" || this.style === "balanced";
  }

  private seerPlanningTargetRound() {
    return this.seerExtendedPlanningUnlocked
      ? ORACLE_EXTENDED_MAX_ROUND
      : ORACLE_MAX_ROUND;
  }

  private seerPlanningRegime() {
    return this.style === "seer" && !this.seer2EndgameOpen()
      ? "opening" as const
      : "terminal" as const;
  }

  private interactiveLateSeerPlan() {
    return this.interactiveRuntime
      && this.style === "seer"
      && this.bridge.engine.state.round >= INTERACTIVE_SEER_LATE_ROUND;
  }

  private seerPlanEndRound(plan: SeerPlan) {
    const startRound = plan.startRound ?? this.bridge.engine.state.round;
    const horizon = plan.planningHorizon ?? plan.steps?.length ?? 0;
    return startRound + Math.max(0, horizon) - 1;
  }

  private usesOraclePlanner() {
    return (this.style === "seer" || this.style === "go" || this.seer2EndgameOpen())
      && this.informationMode === "oracle";
  }

  private seer2EndgameOpen() {
    const { state } = this.bridge.engine;
    // 看穿从第 1 战就看完整未来，但前 17 战仍使用稳定过渡目标；看穿2
    // 的动态终局项目在第 18 战后接管，避免后期追星项目污染开局经济。
    return this.usesSeer2Economy() && state.playerLevel >= 10 && state.round >= 18;
  }

  private terminalTargets() {
    return this.seer2EndgameOpen() ? SEER2_TERMINAL_TARGETS : AUTOPILOT_TERMINAL_TARGETS;
  }

  private terminalTargetIds() {
    return this.seer2EndgameOpen() ? SEER2_TERMINAL_TARGET_IDS : AUTOPILOT_TERMINAL_TARGET_IDS;
  }

  private lateGameTargetIds() {
    if (this.style === "go" && this.seer2FocusIds.size > 0) {
      return Array.from(new Set([
        ...SEER2_TERMINAL_TARGET_IDS,
        ...Array.from(this.seer2FocusIds),
      ]));
    }
    return this.seer2EndgameOpen() ? SEER2_TERMINAL_TARGET_IDS : AUTOPILOT_LATE_GAME_TARGET_IDS;
  }

  private targetPriority(id: UnitId) {
    if (this.style === "go" && this.seer2FocusIds.has(id)) {
      return this.goOpportunityPriorities.get(id) || seer2TargetPriority(id) || 64;
    }
    return this.seer2EndgameOpen() ? seer2TargetPriority(id) : lateGameTargetPriority(id);
  }

  private targetDesiredCopies(id: UnitId) {
    if (this.style === "go" && this.seer2FocusIds.has(id)) return 9;
    return this.seer2EndgameOpen()
      ? seer2TargetDesiredCopies(id)
      : lateGameTargetDesiredCopies(id);
  }

  private formationProfileIds() {
    if (this.usesLearnedCombatPlanner()) return GO_FORMATION_PROFILE_IDS;
    // 真人记录站位是看穿2的终局资产；开局单位少、商店过渡频繁时，
    // 把它和三套稳定站位一起竞争只会放大单战随机差异。
    const useRecordedFormation = this.usesSeer2Foundation()
      && this.seer2EndgameOpen();
    return useRecordedFormation
      ? SEER2_FORMATION_PROFILE_IDS
      : STANDARD_FORMATION_PROFILE_IDS;
  }

  private formationBudgetAvailable() {
    return this.usesLearnedCombatPlanner()
      || this.preparationActions < FORMATION_ACTION_LIMIT;
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
    simulationBridge.setAutopilotStrategy(this.style, this.informationMode);
    simulationBridge.engine.state.starterChoices = [starter];
    simulationBridge.dispatch({ type: "starter", id: starter });
    const simulationPilot = new AutoChessAutopilot(
      simulationBridge,
      "heuristic",
      this.policy,
      this.style,
      this.informationMode,
      this.rolloutCombatHz,
      this.goCombatScorer,
      false,
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
    this.seerRouteAbandoned = false;
    this.seerExtendedPlanningUnlocked = false;
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
      const roster = this.ownedEntries();
      const coarseScore = this.battleConfidence(roster);
      this.lastBattlePredictionScore = coarseScore;
      const auditEligible = this.style === "seer" || coarseScore > 0;
      if (this.shouldAuditLiveBattle() && auditEligible) {
        const audit = this.exactBattleAudit(roster);
        this.lastBattlePredictionScore = audit.score;
        const expectsWin = this.style === "seer"
          ? this.seerPlan?.steps?.[0]?.expectedBattleWon !== false
          : coarseScore > 0;
        if (
          expectsWin
          && audit.score < 10000
          && this.exactBattleAuditRejectedKey !== audit.key
        ) {
          // Reopen the decision window once. If no legal improvement exists,
          // the next pass may still accept this unavoidable loss.
          this.exactBattleAuditRejectedKey = audit.key;
          this.invalidateFinalLineup();
          this.invalidateSeerPlan(false);
          this.nextActionAt = now;
          return null;
        }
      }
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
    this.plannedLineupRandomState = null;
    this.plannedFormation = this.lineageFormation;
    this.plannedBoardSlots.clear();
    this.rescueLineupLocked = false;
    this.rescueSearchStateKey = "";
    this.rolloutScoreCache.clear();
    this.confidenceKey = "";
    this.confidenceScore = Number.NEGATIVE_INFINITY;
    this.lastBattlePredictionScore = Number.NEGATIVE_INFINITY;
    this.criticalExactConfidenceKey = "";
    this.criticalExactConfidenceScore = Number.NEGATIVE_INFINITY;
    this.exactBattleAuditKey = "";
    this.exactBattleAuditScore = Number.NEGATIVE_INFINITY;
    this.exactBattleAuditRejectedKey = "";
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
    this.seerExtraRerolls = 0;
    this.goOpportunityRerolls = 0;
    this.goOpportunityInvestmentInProgress = false;
    this.goOpportunitySafeInvestment = null;
    this.seerFutureShopPreviewKey = "";
    this.seerFutureShopPreview = [];
    this.seerPlan = this.createSeerPlan();
  }

  private invalidateSeerPlan(abandonCompleteRoute = true) {
    if (
      abandonCompleteRoute
      && this.seerPlan?.complete
      && this.seerPlan.exactValidatedHorizon
    ) this.seerRouteAbandoned = true;
    this.seerPlan = null;
    this.seerPurchaseOffsets = [];
    this.seerSaleOffsets = [];
  }

  private seer2PlanningTargets(
    roster: OwnedEntry[],
    futureShops: readonly (readonly (UnitId | null)[])[],
  ) {
    if (this.style === "go" && this.goOpportunityWindowOpen(roster)) {
      return this.goPlanningTargets(roster, futureShops);
    }
    if (this.style === "go") this.goOpportunityPriorities.clear();
    const ownedTargets = SEER2_TERMINAL_TARGET_IDS.map((id) => ({
      id,
      copies: roster
        .filter(({ unit }) => unit.id === id)
        .reduce((sum, { unit }) => sum + unitCopyValue(unit), 0),
      benchSlots: roster.filter(({ unit, location }) => (
        unit.id === id && location.zone === "bench"
      )).length,
    }));
    const initialFocusIds = new Set(
      ownedTargets
        .filter(({ copies }) => copies < 9)
        .sort((left, right) => {
          const progressTier = (copies: number) => (
            copies >= 6 ? 3 : copies >= 3 ? 2 : copies > 0 ? 1 : 0
          );
          return progressTier(right.copies) - progressTier(left.copies)
            || right.copies - left.copies
            || seer2TargetPriority(right.id) - seer2TargetPriority(left.id);
        })
        .slice(0, 3)
        .map(({ id }) => id),
    );
    const targets = selectSeer2PlanningTargets({
      ownedTargets,
      currentShop: this.bridge.engine.state.shop,
      futureShops,
      previousFocusIds: this.seer2FocusIds.size > 0 ? this.seer2FocusIds : initialFocusIds,
    });
    this.seer2FocusIds = new Set(targets.map(({ id }) => id));
    return targets;
  }

  private goOpportunityWindowOpen(roster: OwnedEntry[]) {
    if (this.style !== "go" || !this.seer2EndgameOpen()) return false;
    const developedUnits = roster.filter(({ unit }) => unit.star >= 2).length;
    const completedUnits = roster.filter(({ unit }) => unit.star === 3).length;
    const { round } = this.bridge.engine.state;
    return round >= 20 && (
      developedUnits >= 6
      || completedUnits > 0
      || this.preparationStartGold >= 100
      || round >= 24
    );
  }

  private goUnitModelGain(roster: OwnedEntry[], id: UnitId, star: 2 | 3) {
    const cap = this.bridge.engine.boardCap;
    const baseLineup = this.targetLineup(roster);
    const baseScore = baseLineup.length > 0
      ? this.goModelScore(baseLineup, "go_canonical")
      : 0;
    const developed: OwnedEntry = {
      unit: { uid: -10_000 - SHOP_UNITS.findIndex((shopId) => shopId === id), id, star },
      location: { zone: "bench", index: -1 },
    };
    const existingIndex = baseLineup.findIndex(({ unit }) => unit.id === id);
    const variants: OwnedEntry[][] = [];
    if (existingIndex >= 0) {
      variants.push(baseLineup.map((entry, index) => (
        index === existingIndex ? developed : entry
      )));
    } else if (baseLineup.length < cap) {
      variants.push([...baseLineup, developed]);
    } else {
      baseLineup.forEach((_, index) => {
        variants.push(baseLineup.map((entry, entryIndex) => (
          entryIndex === index ? developed : entry
        )));
      });
    }
    const completedScore = variants.length > 0
      ? Math.max(...variants.map((lineup) => this.goModelScore(lineup, "go_canonical")))
      : baseScore;
    return Number.isFinite(completedScore - baseScore) ? completedScore - baseScore : 0;
  }

  private goCompletedUnitModelGain(roster: OwnedEntry[], id: UnitId) {
    return this.goUnitModelGain(roster, id, 3);
  }

  private goPlanningTargets(
    roster: OwnedEntry[],
    futureShops: readonly (readonly (UnitId | null)[])[],
  ): GoOpportunityTarget[] {
    const candidates = SHOP_UNITS.map((id) => {
      const learnedValue = this.goCompletedUnitModelGain(roster, id);
      return {
        id,
        priority: Math.round(
          64 + UNIT_DEFS[id].cost * 4 + Math.max(-4, Math.min(4, learnedValue)) * 12,
        ),
        desiredStar: 3 as const,
        role: "terminal" as const,
        learnedValue,
      };
    });
    const targets = selectGoOpportunityTargets({
      candidates,
      ownedTargets: SHOP_UNITS.map((id) => ({
        id,
        copies: roster
          .filter(({ unit }) => unit.id === id)
          .reduce((sum, { unit }) => sum + unitCopyValue(unit), 0),
        benchSlots: roster.filter(({ unit, location }) => (
          unit.id === id && location.zone === "bench"
        )).length,
      })),
      currentShop: this.bridge.engine.state.shop,
      futureShops: futureShops.slice(0, GO_OPPORTUNITY_SHOP_LOOKAHEAD),
      previousFocusIds: this.seer2FocusIds,
      limit: GO_OPPORTUNITY_TARGET_LIMIT,
    });
    this.seer2FocusIds = new Set(targets.map(({ id }) => id));
    this.goOpportunityPriorities = new Map(targets.map(({ id, priority }) => [id, priority]));
    return targets;
  }

  private simulationRosterEntries(simulation: EngineBridge) {
    const { state } = simulation.engine;
    return [
      ...state.board.flatMap((unit, index) => (
        unit ? [{ unit, location: { zone: "board", index } as UnitLocation }] : []
      )),
      ...state.bench.flatMap((unit, index) => (
        unit ? [{ unit, location: { zone: "bench", index } as UnitLocation }] : []
      )),
    ];
  }

  private simulationCopiesAndTransitions(
    simulation: EngineBridge,
    step: SeerPlanStep,
  ) {
    const targetIds = new Set<UnitId>(
      Object.keys(step.expectedTargetCopies) as UnitId[],
    );
    const copies = Object.fromEntries(Array.from(targetIds).map((id) => [
      id,
      this.simulationRosterEntries(simulation)
        .filter(({ unit }) => unit.id === id)
        .reduce((sum, { unit }) => sum + unitCopyValue(unit), 0),
    ])) as Partial<Record<UnitId, number>>;
    const transitionUnits = this.simulationRosterEntries(simulation)
      .filter(({ unit }) => !targetIds.has(unit.id))
      .map(({ unit, location }) => ({
        id: unit.id,
        star: unit.star,
        zone: location.zone,
      } satisfies SeerPlannerUnit));
    return { copies, transitionUnits };
  }

  private simulationStepSnapshot(
    simulation: EngineBridge,
    step: SeerPlanStep,
  ) {
    const { state } = simulation.engine;
    const { copies, transitionUnits } = this.simulationCopiesAndTransitions(simulation, step);
    return {
      expectedGoldBeforePreparation: state.gold,
      expectedHp: state.hp,
      expectedPlayerLevel: state.playerLevel,
      expectedShop: [...state.shop],
      expectedTargetCopies: copies,
      expectedTransitionUnits: transitionUnits,
      expectedBoardCount: simulation.engine.boardCount,
      expectedRosterCount: this.simulationRosterEntries(simulation).length,
    };
  }

  private simulationSale(simulation: EngineBridge, id: UnitId) {
    const { state } = simulation.engine;
    const location = state.bench
      .map((unit, index) => (
        unit?.id === id ? { zone: "bench" as const, index } : null
      ))
      .find(Boolean)
      || state.board
        .map((unit, index) => (
          unit?.id === id ? { zone: "board" as const, index } : null
        ))
        .find(Boolean);
    // A planned transition unit may already have merged or been sold by an
    // earlier exact action. Treat that sale as already satisfied.
    if (!location) return true;
    const beforeCount = this.simulationRosterEntries(simulation).length;
    simulation.dispatch({ type: "sell", location });
    return this.simulationRosterEntries(simulation).length === beforeCount - 1;
  }

  private simulationCapacitySale(simulation: EngineBridge) {
    const entries = this.simulationRosterEntries(simulation)
      .filter(({ location }) => location.zone === "bench")
      .sort((left, right) => (
        Number(left.unit.star === 3) - Number(right.unit.star === 3)
        || Number(left.unit.star > 1) - Number(right.unit.star > 1)
        || UNIT_DEFS[left.unit.id].cost - UNIT_DEFS[right.unit.id].cost
        || left.unit.uid - right.unit.uid
      ));
    const sale = entries[0];
    if (!sale) return false;
    simulation.dispatch({ type: "sell", location: sale.location });
    return !simulation.engine.state.bench[sale.location.index];
  }

  private simulationPurchase(simulation: EngineBridge, id: UnitId) {
    const { state } = simulation.engine;
    const index = state.shop.findIndex((shopId) => shopId === id);
    if (index < 0) return false;
    const hasCapacity = simulation.engine.boardCount < simulation.engine.boardCap
      || state.bench.some((unit) => !unit);
    if ((!hasCapacity || state.gold < UNIT_DEFS[id].cost) && !this.simulationCapacitySale(simulation)) {
      return false;
    }
    if (
      state.gold < UNIT_DEFS[id].cost
      || (simulation.engine.boardCount >= simulation.engine.boardCap
        && state.bench.every(Boolean))
    ) return false;
    const beforeGold = state.gold;
    simulation.dispatch({ type: "shop", index });
    return state.shop[index] === null && state.gold < beforeGold;
  }

  private simulationFormation(simulation: EngineBridge, pilot: AutoChessAutopilot) {
    for (let actionCount = 0; actionCount < FORMATION_ACTION_LIMIT; actionCount += 1) {
      const action = pilot.formationAction(pilot.ownedEntries());
      if (!action) return simulation.engine.boardCount > 0;
      if (action.type !== "move") return false;
      simulation.dispatch(action);
    }
    return false;
  }

  private simulationPopulation(simulation: EngineBridge, pilot: AutoChessAutopilot) {
    for (let actionCount = 0; actionCount < FORMATION_ACTION_LIMIT; actionCount += 1) {
      const action = pilot.populationAction(pilot.ownedEntries());
      if (!action) return true;
      if (action.type !== "move") return false;
      simulation.dispatch(action);
    }
    return false;
  }

  private simulationAugment(simulation: EngineBridge) {
    const { augmentChoices } = simulation.engine.state;
    const index = augmentChoices
      .map((id, choiceIndex) => ({
        choiceIndex,
        preference: AUGMENT_PREFERENCE.indexOf(id as (typeof AUGMENT_PREFERENCE)[number]),
      }))
      .sort((left, right) => left.preference - right.preference)[0]?.choiceIndex;
    if (index === undefined || !augmentChoices[index]) return false;
    simulation.engine.chooseAugment(index);
    return simulation.engine.state.phase === "preparation";
  }

  private applySimulationSeerStep(
    simulation: EngineBridge,
    pilot: AutoChessAutopilot,
    step: SeerPlanStep,
  ) {
    const salesByShop = step.salesByShop || [];
    const purchasesByShop = step.purchasesByShop || [];
    const initialSales = salesByShop[0] || [];
    for (const id of initialSales) {
      if (!this.simulationSale(simulation, id)) return false;
    }

    // The live controller fills an available board slot after planned sales
    // and before XP/shop actions. Keep exact route validation in the same
    // order so a validated route can be consumed without state drift.
    if (!this.simulationPopulation(simulation, pilot)) return false;

    while (simulation.engine.state.playerLevel < step.targetLevel) {
      const cost = simulation.engine.upgradeCost;
      if (cost === null || simulation.engine.state.gold < cost) return false;
      const previousLevel = simulation.engine.state.playerLevel;
      simulation.dispatch({ type: "buyXp" });
      if (simulation.engine.state.playerLevel <= previousLevel) return false;
    }

    for (const id of purchasesByShop[0] || []) {
      if (!this.simulationPurchase(simulation, id)) return false;
    }
    for (let reroll = 1; reroll <= step.rerolls; reroll += 1) {
      const beforeShop = [...simulation.engine.state.shop];
      const beforeShopSequence = simulation.engine.getShopRandomState();
      simulation.dispatch({ type: "reroll" });
      if (
        simulation.engine.getShopRandomState() === beforeShopSequence
        || simulation.engine.state.shop.every((id, index) => id === beforeShop[index])
      ) return false;
      for (const id of salesByShop[reroll] || []) {
        if (!this.simulationSale(simulation, id)) return false;
      }
      for (const id of purchasesByShop[reroll] || []) {
        if (!this.simulationPurchase(simulation, id)) return false;
      }
    }
    return true;
  }

  private validateSeerRoute(
    plan: SeerPlan,
    validationLimit = SEER_ROUTE_VALIDATION_LIMIT,
    requireComplete = true,
  ) {
    this.seerValidationFailure = "";
    this.seerValidationTrace = [];
    if (
      this.planningMode !== "evolution"
      || this.style !== "seer"
      || !plan.steps?.length
      || (requireComplete && !plan.complete)
    ) return plan;

    const cachedResume = requireComplete
      ? this.seerRouteValidationResumes.get(plan)
      : undefined;
    const simulation = new EngineBridge(
      this.bridge.engine.state.seed,
      1,
      { simulation: true, battleStepHz: this.bridge.simulationBattleStepHz },
    );
    simulation.setConsoleLogging(false);
    simulation.engine.restoreSimulationSnapshot(this.bridge.engine.getSimulationSnapshot());
    const exactFormationValidation = requireComplete
      && validationLimit >= (plan.steps?.length || 0);
    const formationPilot = new AutoChessAutopilot(
      simulation,
      exactFormationValidation ? "evolution" : "training",
      this.policy,
      exactFormationValidation ? "seer" : "survival",
      exactFormationValidation ? "oracle" : "normal",
      this.rolloutCombatHz,
      this.goCombatScorer,
      false,
    );
    formationPilot.lineageFormation = this.lineageFormation;
    const maximumSteps = Math.min(validationLimit, plan.steps.length);
    let startIndex = 0;
    let validatedSteps: SeerPlanStep[] = [];
    if (cachedResume && cachedResume.nextIndex < maximumSteps) {
      simulation.engine.restoreSimulationSnapshot(cachedResume.snapshot);
      startIndex = cachedResume.nextIndex;
      validatedSteps = cachedResume.validatedSteps.map((step) => ({ ...step }));
      this.seerValidationTrace = cachedResume.trace.map((entry) => ({ ...entry }));
    } else {
      simulation.engine.restoreSimulationSnapshot(this.bridge.engine.getSimulationSnapshot());
    }
    let routeDied = false;

    for (let index = startIndex; index < maximumSteps; index += 1) {
      const step = plan.steps[index];
      if (
        simulation.engine.state.phase !== "preparation"
        || simulation.engine.state.round !== (plan.startRound || this.bridge.engine.state.round) + index
      ) {
        this.seerValidationFailure = `step ${index}: phase/round`;
        break;
      }
      const expected = this.simulationStepSnapshot(simulation, step);
      if (!this.applySimulationSeerStep(simulation, formationPilot, step)) {
        this.seerValidationFailure = `step ${index}: macro`;
        break;
      }
      if (!this.simulationFormation(simulation, formationPilot)) {
        this.seerValidationFailure = `step ${index}: formation`;
        break;
      }
      const preparationGoldAfterActions = simulation.engine.state.gold;
      simulation.engine.startBattle();
      if ((simulation.engine.state.phase as GamePhase) !== "battle") {
        this.seerValidationFailure = `step ${index}: start battle`;
        break;
      }
      simulation.skipBattle();
      const { result, battle } = simulation.engine.state;
      if (!result) {
        this.seerValidationFailure = `step ${index}: result`;
        break;
      }
      const health = (fighters: BattleState["player"]) => fighters.reduce(
        (sum, fighter) => sum + (fighter.alive ? fighter.hp / fighter.maxHp : 0),
        0,
      );
      const battleMargin = battle ? health(battle.player) - health(battle.enemy) : 0;
      validatedSteps.push({
        ...step,
        ...expected,
        expectedGoldAfterPreparation: preparationGoldAfterActions,
        expectedBattleMargin: battleMargin,
        expectedBattleWon: result.won,
      });
      const {
        round,
        hp,
        gold,
        playerLevel,
        board,
        bench,
      } = simulation.engine.state;
      this.seerValidationTrace.push({
        round,
        won: result.won,
        hp,
        gold,
        level: playerLevel,
        board: board
          .filter(Boolean)
          .map((unit) => `${unit?.id}:${unit?.star}`),
        bench: bench
          .filter(Boolean)
          .map((unit) => `${unit?.id}:${unit?.star}`),
        margin: battleMargin,
      });
      if (simulation.engine.state.hp <= 0) {
        this.seerValidationFailure = `step ${index}: hp`;
        routeDied = true;
        break;
      }
      if (index + 1 >= maximumSteps) {
        if (maximumSteps < plan.steps.length) {
          simulation.engine.continueAfterResult();
          const nextPhase = simulation.engine.state.phase as GamePhase;
          if (nextPhase === "augment" && !this.simulationAugment(simulation)) {
            this.seerValidationFailure = `step ${index}: augment`;
            break;
          }
          if ((simulation.engine.state.phase as GamePhase) !== "preparation") {
            this.seerValidationFailure = `step ${index}: next phase`;
            break;
          }
        }
        break;
      }
      simulation.engine.continueAfterResult();
      const nextPhase = simulation.engine.state.phase as GamePhase;
      if (nextPhase === "augment" && !this.simulationAugment(simulation)) {
        this.seerValidationFailure = `step ${index}: augment`;
        break;
      }
      if ((simulation.engine.state.phase as GamePhase) !== "preparation") {
        this.seerValidationFailure = `step ${index}: next phase`;
        break;
      }
    }

    if (
      !requireComplete
      && !routeDied
      && !this.seerValidationFailure
      && validatedSteps.length === maximumSteps
      && maximumSteps < plan.steps.length
      && (simulation.engine.state.phase as GamePhase) === "preparation"
    ) {
      this.seerRouteValidationResumes.set(plan, {
        snapshot: simulation.engine.getSimulationSnapshot(),
        validatedSteps: validatedSteps.map((step) => ({ ...step })),
        trace: this.seerValidationTrace.map((entry) => ({ ...entry })),
        nextIndex: maximumSteps,
      });
    }

    const expectedSteps = requireComplete ? plan.steps.length : maximumSteps;
    if (routeDied || validatedSteps.length !== expectedSteps) {
      if (!requireComplete && validatedSteps.length > 0) {
        // A route can be useful even when its abstract tail is wrong. Never
        // expose a terminal battle that killed the simulation; the caller can
        // consume the safe prefix and replan from the resulting real state.
        const safeSteps = validatedSteps[validatedSteps.length - 1].expectedBattleWon === false
          && Number(this.seerValidationTrace.at(-1)?.hp) <= 0
          ? validatedSteps.slice(0, -1)
          : validatedSteps;
        if (safeSteps.length > 0) {
          return {
            ...plan,
            complete: false,
            firstStep: safeSteps[0],
            steps: safeSteps,
            projectedRound: (plan.startRound || this.bridge.engine.state.round)
              + safeSteps.length,
            exactValidatedHorizon: safeSteps.length,
          };
        }
      }
      if (!this.seerValidationFailure) {
        this.seerValidationFailure = `validated ${validatedSteps.length}`;
      }
      return null;
    }
    const partialRoute = !requireComplete && maximumSteps < plan.steps.length;
    const exactFinalHp = Number(this.seerValidationTrace.at(-1)?.hp);
    const validatedPlan = {
      ...plan,
      complete: partialRoute ? false : plan.complete,
      firstStep: validatedSteps[0],
      steps: validatedSteps,
      projectedRound: partialRoute
        ? (plan.startRound || this.bridge.engine.state.round) + validatedSteps.length
        : plan.projectedRound,
      projectedHp: Number.isFinite(exactFinalHp) ? exactFinalHp : plan.projectedHp,
      exactValidatedHorizon: validatedSteps.length,
    };
    if (
      requireComplete
      && plan.complete
      && this.seerPlanEndRound(plan) >= ORACLE_MAX_ROUND
      && Number.isFinite(exactFinalHp)
      && exactFinalHp > 0
    ) {
      this.seerExtendedPlanningUnlocked = true;
      this.seerRouteValidationResumes.delete(plan);
    }
    return validatedPlan;
  }

  private reusableSeerPlan(roster: OwnedEntry[]) {
    if (!this.usesOraclePlanner() || !this.seerPlan?.steps?.length) return null;
    const { state } = this.bridge.engine;
    const startRound = this.seerPlan.startRound ?? state.round;
    if (
      this.seerPlan.planningRegime
      && this.seerPlan.planningRegime !== this.seerPlanningRegime()
    ) return null;
    const routeEndRound = this.seerPlanEndRound(this.seerPlan);
    const interactiveLatePlan = this.interactiveLateSeerPlan();
    const canFinishValidatedBaseRoute = this.seerExtendedPlanningUnlocked
      && routeEndRound >= ORACLE_MAX_ROUND
      && state.round <= ORACLE_MAX_ROUND;
    if (
      this.seerPlan.planningHorizon !== undefined
      && routeEndRound < this.seerPlanningTargetRound()
      && !canFinishValidatedBaseRoute
      && !interactiveLatePlan
    ) return null;
    const offset = state.round - startRound;
    const { steps } = this.seerPlan;
    const step = steps[offset];
    if (offset <= 0 || !step) return null;
    const { expectedWave } = step;
    const actualWave = this.bridge.engine.currentWave;
    const waveMatches = !expectedWave || (
      expectedWave.round === state.round
      && expectedWave.tag === actualWave.tag
      && expectedWave.units.length === actualWave.units.length
      && expectedWave.units.every((unit, index) => (
        unit.id === actualWave.units[index]?.id
        && unit.star === (actualWave.units[index]?.star || 1)
      ))
    );
    if (
      !waveMatches
      || step.expectedPlayerLevel !== state.playerLevel
      || step.expectedBoardCount !== this.bridge.engine.boardCount
      || step.expectedRosterCount !== roster.length
      || step.expectedShop.length !== state.shop.length
      || step.expectedShop.some((id, index) => id !== state.shop[index])
      || (step.expectedGoldBeforePreparation !== undefined
        && state.gold < step.expectedGoldBeforePreparation)
      || (step.expectedHp !== undefined && state.hp < step.expectedHp)
    ) return null;

    const targetIds = new Set<UnitId>(
      Object.keys(step.expectedTargetCopies) as UnitId[],
    );
    const copies = new Map<UnitId, number>();
    roster.forEach(({ unit }) => {
      if (!targetIds.has(unit.id)) return;
      copies.set(unit.id, (copies.get(unit.id) || 0) + unitCopyValue(unit));
    });
    const expectedCopies = Object.entries(step.expectedTargetCopies)
      .filter(([id]) => targetIds.has(id as UnitId))
      .map(([id, count]) => `${id}:${count || 0}`)
      .sort();
    const actualCopies = Array.from(targetIds)
      .map((id) => `${id}:${copies.get(id) || 0}`)
      .sort();
    const expectedTransitionUnits = step.expectedTransitionUnits.map((unit) => ({
      id: unit.id,
      star: unit.star,
    }));
    const actualTransitionUnits = roster
      .filter(({ unit }) => !targetIds.has(unit.id))
      .map(({ unit }) => ({ id: unit.id, star: unit.star }));
    const transitionStrength = (units: readonly { id: UnitId; star: OwnedUnit["star"] }[]) => (
      units.reduce(
        (sum, unit) => sum + UNIT_DEFS[unit.id].cost * STAR_POWER[unit.star],
        0,
      )
    );
    const expectedFinanceIds = new Set(
      expectedTransitionUnits
        .filter(({ id }) => UNIT_DEFS[id].traits.includes("finance"))
        .map(({ id }) => id),
    );
    const actualFinanceIds = new Set(
      actualTransitionUnits
        .filter(({ id }) => UNIT_DEFS[id].traits.includes("finance"))
        .map(({ id }) => id),
    );
    if (
      expectedCopies.join("|") !== actualCopies.join("|")
      || transitionStrength(actualTransitionUnits) < transitionStrength(expectedTransitionUnits)
      || Array.from(expectedFinanceIds).some((id) => !actualFinanceIds.has(id))
    ) return null;

    const suffix = steps.slice(offset);
    return {
      ...this.seerPlan,
      startRound: state.round,
      steps: suffix,
      planningHorizon: suffix.length,
      firstStep: suffix[0],
    };
  }

  private createSeerPlan() {
    if (!this.usesOraclePlanner()) return null;
    if (this.style === "seer" && this.seerRouteAbandoned) return null;
    const { engine } = this.bridge;
    const { state } = engine;
    if (this.style === "go" && !this.seer2EndgameOpen()) return null;
    const planningRegime = this.seerPlanningRegime();
    const roster = this.ownedEntries();
    const reusable = this.reusableSeerPlan(roster);
    if (reusable) return reusable;
    if (
      this.style === "seer"
      && this.seerPlan?.complete
      && this.seerPlanEndRound(this.seerPlan) >= this.seerPlanningTargetRound()
    ) {
      this.seerRouteAbandoned = true;
      return null;
    }
    // Training uses a cheaper abstract planner, but it must see the same
    // 60-round prefix as the live oracle. A short horizon can select an
    // opening that looks good now and is already economically doomed later.
    const fullPlanningHorizon = Math.max(1, this.seerPlanningTargetRound() - state.round + 1);
    const interactiveLatePlan = this.interactiveLateSeerPlan();
    const planningHorizon = interactiveLatePlan
      ? Math.min(fullPlanningHorizon, INTERACTIVE_SEER_LATE_HORIZON)
      : fullPlanningHorizon;
    const shopLookahead = Math.min(
      ORACLE_SHOP_LOOKAHEAD,
      planningHorizon * 25 + 8,
    );
    const futureShops = {} as SeerShopForecast;
    PLAYER_LEVELS.forEach((level) => {
      futureShops[level] = engine.previewFutureShopsAtLevels(Array.from(
        { length: shopLookahead },
        () => level,
      ));
    });
    // 看穿2 的价值在于按真实来牌密度动态选少量追星项目。这个选择从第
    // 1 战就要进入 60 战路线；只在第 18 战后启用它会让开局少买关键过渡
    // 牌，后面的路线即使看到了未来也已经失去足够的血量余量。
    const planningTargets = this.usesSeer2Economy()
      ? this.seer2PlanningTargets(roster, futureShops[state.playerLevel])
      : this.terminalTargets();
    if (planningTargets.length === 0) return null;
    const targetIds = new Set<UnitId>(planningTargets.map(({ id }) => id));
    const targetCopies = roster.reduce<Partial<Record<UnitId, number>>>((copies, { unit }) => {
      if (this.targetDesiredCopies(unit.id) <= 0) return copies;
      copies[unit.id] = (copies[unit.id] || 0) + unitCopyValue(unit);
      return copies;
    }, {});
    const currentTransitionUnits: SeerPlannerUnit[] = roster
      .filter(({ unit }) => !targetIds.has(unit.id))
      .map(({ unit, location }) => ({ id: unit.id, star: unit.star, zone: location.zone }));
    const currentBoardStrength = state.board.reduce((total, unit) => (
      unit
        ? total + PLANNER_UNIT_BASE_POWER
          + UNIT_DEFS[unit.id].cost * 12 * STAR_POWER[unit.star]
        : total
    ), 0);
    const plan = planSeerEconomy({
      round: state.round,
      seed: this.style === "go" ? state.enemySeed : state.seed,
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
      targets: planningTargets.map(({ id, priority, desiredStar }) => ({
        id,
        priority,
        desiredCopies: desiredStar === 3 ? 9 : 3,
      })),
      futureShops,
      horizon: planningHorizon,
      beamWidth: this.planningMode === "training"
        ? 48
        : interactiveLatePlan ? INTERACTIVE_SEER_LATE_BEAM_WIDTH : 64,
      continueAfterForecastDeath: this.style === "seer",
    });
    const routeCandidates = [
      { ...plan, planningRegime },
      ...(plan.alternativeSteps || []).map((steps) => ({
        ...plan,
        planningRegime,
        firstStep: steps[0] || plan.firstStep,
        steps,
        alternativeSteps: [],
      })),
    ].slice(0, interactiveLatePlan ? 2 : SEER_ROUTE_PREFILTER_CANDIDATE_LIMIT);
    if (interactiveLatePlan) {
      // The live controller audits the real board at 60Hz immediately before
      // battle. Replaying several six-round routes here would block the main
      // thread while adding no information about the action being chosen now.
      return routeCandidates[0] || null;
    }
    if (this.planningMode !== "evolution") return routeCandidates[0];
    if (this.style === "seer" && planningRegime === "opening") {
      return this.validateSeerOpeningCandidates(routeCandidates);
    }
    const prefiltered = routeCandidates.flatMap((candidate) => {
      const prefix = this.validateSeerRoute(
        candidate,
        Math.min(
          interactiveLatePlan ? 4 : SEER_ROUTE_PREFILTER_LIMIT,
          candidate.steps?.length || 0,
        ),
        false,
      );
      if (!prefix) return [];
      const trace = this.seerValidationTrace.map((entry) => ({ ...entry }));
      const hpValues = trace
        .map((entry) => Number(entry.hp))
        .filter((value) => Number.isFinite(value));
      const losses = trace.filter((entry) => entry.won === false).length;
      const finalHp = hpValues.at(-1) ?? Number.NEGATIVE_INFINITY;
      const minimumHp = hpValues.length > 0 ? Math.min(...hpValues) : finalHp;
      const marginTotal = trace.reduce((total, entry) => (
        total + (Number(entry.margin) || 0)
      ), 0);
      return [{ candidate, prefix, losses, finalHp, minimumHp, marginTotal }];
    }).sort((left, right) => (
      right.minimumHp - left.minimumHp
      || right.finalHp - left.finalHp
      || left.losses - right.losses
      || right.marginTotal - left.marginTotal
    ));
    for (const { candidate } of prefiltered) {
      const validated = this.validateSeerRoute(candidate);
      if (validated) return validated;
    }
    const fallbackPrefix = [...prefiltered]
      .sort((left, right) => (
        (right.prefix.steps?.length || 0) - (left.prefix.steps?.length || 0)
        || right.minimumHp - left.minimumHp
        || right.finalHp - left.finalHp
        || left.losses - right.losses
      ))[0]?.prefix;
    return fallbackPrefix?.steps?.length ? fallbackPrefix : null;
  }

  private validateSeerOpeningCandidates(routeCandidates: readonly SeerPlan[]) {
    // The opening route is still abstractly planned, but its first macro
    // action is immediately executable. Validate only that one step at the
    // real battle timestep so an upgrade/buy/sell bundle that looks safe in
    // the abstract model cannot spend the current round's win by accident.
    // Keep the exact losing candidate as a fallback: an intentional sell line
    // is valid when every available opening route loses this wave.
    let bestOpeningPlan: SeerPlan | null = null;
    let bestOpeningWin = false;
    let bestOpeningMargin = Number.NEGATIVE_INFINITY;
    for (const candidate of routeCandidates) {
      const validated = this.validateSeerRoute(candidate, 1, false);
      const firstStep = validated?.steps?.[0];
      if (!validated || !firstStep) continue;
      const openingWin = firstStep.expectedBattleWon === true;
      const openingMargin = Number(firstStep.expectedBattleMargin);
      const comparableMargin = Number.isFinite(openingMargin)
        ? openingMargin
        : openingWin ? 0 : Number.NEGATIVE_INFINITY;
      if (
        !bestOpeningPlan
        || Number(openingWin) > Number(bestOpeningWin)
        || (
          openingWin === bestOpeningWin
          && comparableMargin > bestOpeningMargin
        )
      ) {
        bestOpeningPlan = validated;
        bestOpeningWin = openingWin;
        bestOpeningMargin = comparableMargin;
      }
      // The candidates are already ordered by the abstract planner. Once
      // its first choice also wins exact combat, further route replays add no
      // value to the current action.
      if (openingWin) return validated;
    }
    return bestOpeningPlan;
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

  /**
   * A cached combat score is only valid after the exact planned board has been
   * materialized. Keeping the lineup in the roster is not enough: a bench unit
   * cannot contribute to this round's battle.
   */
  private plannedLineupIsOnBoard(roster: OwnedEntry[]) {
    if (
      this.plannedLineupUids.length === 0
      || this.plannedBoardSlots.size !== this.plannedLineupUids.length
    ) return false;
    const byUid = new Map(roster.map((entry) => [entry.unit.uid, entry]));
    return this.plannedLineupUids.every((uid) => {
      const entry = byUid.get(uid);
      const slot = this.plannedBoardSlots.get(uid);
      return Boolean(
        entry
        && slot !== undefined
        && entry.location.zone === "board"
        && entry.location.index === slot
        && this.bridge.engine.state.board[slot]?.uid === uid,
      );
    });
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
    const lateGameScore = this.targetPriority(unit.id) * lateGameWeight * lateGameStarWeight;
    return definition.cost * 12 * STAR_POWER[unit.star]
      + unit.star * 6
      + uniquePartners * 7
      + Math.max(0, duplicateCount) * 4
      + (TRANSITION_LINEUP_BONUS[unit.id] || 0)
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

  private goModelScore(
    lineup: OwnedEntry[],
    formation: FormationProfile = "go_canonical",
  ) {
    const { state } = this.bridge.engine;
    const wave = this.bridge.engine.currentWave;
    return this.goCombatScorer({
      starter: state.starter,
      augments: state.augments,
      waveTag: wave.tag,
      modifier: wave.modifier,
      players: formationPlacements(lineup, formation).map(({ entry, slot }) => ({
        id: entry.unit.id,
        star: entry.unit.star,
        position: slot,
      })),
      enemies: wave.units.map((unit, index) => ({
        id: unit.id,
        star: unit.star || 1,
        position: index,
      })),
    });
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

  private rolloutPlacementsScore(
    placementsForLineup: Array<{ entry: OwnedEntry; slot: number }>,
    stableOnly = false,
    combatHz = this.rolloutCombatHz,
  ) {
    if (this.planningMode === "training") {
      return this.trainingLineupScore(placementsForLineup.map(({ entry }) => entry));
    }
    const sourceState = this.bridge.engine.state;
    const wave = this.bridge.engine.currentWave;
    const augments = [...sourceState.augments].sort().join(",");
    const placements = placementsForLineup
      .map(({ entry, slot }) => `${slot}:${entry.unit.id}:${entry.unit.star}`)
      .sort()
      .join(",");
    const combatScenario = [
      sourceState.starter,
      augments,
      wave.tag,
      wave.modifier,
      wave.units.map((unit) => `${unit.id}:${unit.star || 1}`).join(","),
      placements,
    ].join("/");
    const fixedScenario = this.style === "go"
      ? goCombatScenarioSignature({
        enemySeed: sourceState.enemySeed,
        round: sourceState.round,
        starter: sourceState.starter,
        augments: sourceState.augments,
        wave,
        placements: placementsForLineup.map(({ entry, slot }) => ({
          slot,
          id: entry.unit.id,
          star: entry.unit.star,
        })),
      })
      : combatScenario;
    const actualRandomState = this.bridge.engine.getRandomState();
    const requestedCombatHz = Math.max(20, Math.min(
      EXACT_COMBAT_HZ,
      Math.round(combatHz),
    ));
    const stableVariantLimit = requestedCombatHz >= EXACT_COMBAT_HZ
      ? this.rolloutVariantLimit
      : Math.min(2, this.rolloutVariantLimit);
    const cacheScenario = fixedScenario;
    const scoreVariantCount = stableOnly && this.style !== "go" ? stableVariantLimit : 1;
    const scores = Array.from({ length: scoreVariantCount }, (_, variant) => {
      const exactBranch = this.style !== "go" && variant === 0;
      const branch = this.style === "go"
        ? `rollout:${variant}`
        : exactBranch ? `actual:${actualRandomState}` : `rollout:${variant - 1}`;
      const cacheKey = [
        this.style === "go" ? GO_ROLLOUT_CACHE_SCHEMA : AUTOPILOT_ROLLOUT_CACHE_SCHEMA,
        `hz:${requestedCombatHz}`,
        cacheScenario,
        branch,
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
      const simulation = new AutoChessEngine(
        this.style === "go"
          ? goCombatScenarioSeed(fixedScenario, variant)
          : goCombatScenarioSeed(fixedScenario, variant - 1),
        { telemetry: false, visualEffects: false },
      );
      simulation.state = JSON.parse(JSON.stringify(sourceState));
      const simulationRandomState = this.style === "go"
        ? goCombatScenarioSeed(fixedScenario, variant)
        : exactBranch ? actualRandomState : null;
      if (simulationRandomState !== null) {
        // The live Go bridge restores this exact state before startBattle.
        // Passing it only to AutoChessEngine's constructor applies the seed
        // transformation twice and can make a planned win differ from the
        // battle that is actually opened.
        simulation.restoreRandomState(simulationRandomState);
      }
      simulation.state.phase = "preparation";
      simulation.state.board.fill(null);
      simulation.state.selected = null;
      simulation.state.battle = null;
      simulation.state.result = null;
      this.setSimulationPlacements(simulation, placementsForLineup, exactBranch);
      simulation.startBattle();
      const battle = simulation.state.battle as BattleState | null;
      if (!battle) return Number.NEGATIVE_INFINITY;
      sharedRolloutCacheStats.misses += 1;
      const score = scorePreparedAutoChessCombat(simulation, requestedCombatHz);
      this.rolloutScoreCache.set(cacheKey, score);
      sharedRolloutScoreCache.set(cacheKey, score);
      if (sharedRolloutScoreCache.size > SHARED_ROLLOUT_CACHE_LIMIT) {
        const oldest = sharedRolloutScoreCache.keys().next().value;
        if (oldest !== undefined) sharedRolloutScoreCache.delete(oldest);
      }
      return score;
    });
    if (!stableOnly) return scores[0];
    if (this.style === "go") return scores[0];
    if (this.usesSeer2Foundation()) return Math.min(...scores);
    const robust = scores.slice(1).sort((left, right) => left - right);
    if (robust.length > 0) {
      if (this.style === "survival" || this.style === "seer") {
        return robust[0];
      }
      return robust[Math.floor(robust.length / 2)];
    }
    return scores[0];
  }

  private rolloutLineupScore(
    lineup: OwnedEntry[],
    formation: FormationProfile = this.lineageFormation,
    stableOnly = false,
    combatHz = this.rolloutCombatHz,
  ) {
    return this.rolloutPlacementsScore(
      formationPlacements(lineup, formation),
      stableOnly,
      combatHz,
    );
  }

  private rolloutLineupScoreAtRound(
    lineup: OwnedEntry[],
    round: number,
    formation: FormationProfile = this.lineageFormation,
    combatHz = this.rolloutCombatHz,
  ) {
    const { state } = this.bridge.engine;
    const currentRound = state.round;
    state.round = Math.max(1, Math.floor(round));
    try {
      return this.rolloutLineupScore(lineup, formation, true, combatHz);
    } finally {
      state.round = currentRound;
    }
  }

  private rolloutBoardScore(
    board: Array<OwnedEntry | null>,
    stableOnly = false,
    combatHz = this.rolloutCombatHz,
  ) {
    return this.rolloutPlacementsScore(
      board.flatMap((entry, slot) => (entry ? [{ entry, slot }] : [])),
      stableOnly,
      combatHz,
    );
  }

  private setSimulationPlacements(
    simulation: AutoChessEngine,
    placements: Array<{ entry: OwnedEntry; slot: number }>,
    preserveUids = false,
  ) {
    simulation.state.board.fill(null);
    placements.forEach(({ entry, slot }) => {
      simulation.state.board[slot] = {
        ...entry.unit,
        uid: preserveUids ? entry.unit.uid : 1000 + slot,
      };
    });
  }

  private setSimulationLineup(
    simulation: AutoChessEngine,
    lineup: OwnedEntry[],
    formation: FormationProfile = "human_midline",
    preserveUids = false,
  ) {
    this.setSimulationPlacements(
      simulation,
      formationPlacements(lineup, formation),
      preserveUids,
    );
  }

  private augmentRolloutScore(index: number) {
    const sourceState = this.bridge.engine.state;
    const simulation = new AutoChessEngine(
      sourceState.seed + (sourceState.round + 1) * 1009,
      { telemetry: false, visualEffects: false },
    );
    simulation.state = JSON.parse(JSON.stringify(sourceState));
    simulation.chooseAugment(index);
    return scorePreparedAutoChessCombat(simulation, EXACT_COMBAT_HZ);
  }

  private seer2PrincipalLineups(roster: OwnedEntry[], cap: number) {
    if (!this.usesSeer2Foundation()) return [];
    const heuristic = this.targetLineup(roster);
    return SEER2_PRINCIPAL_VARIATIONS.flatMap((variation) => {
      const available = [...roster];
      const lineup: OwnedEntry[] = [];
      variation.forEach((id) => {
        const choice = available
          .filter(({ unit }) => unit.id === id)
          .sort((left, right) => this.unitScore(right.unit, roster)
            - this.unitScore(left.unit, roster)
            || left.unit.uid - right.unit.uid)[0];
        if (!choice) return;
        lineup.push(choice);
        available.splice(available.indexOf(choice), 1);
      });
      const selected = new Set(lineup.map(({ unit }) => unit.uid));
      [...heuristic, ...available]
        .filter(({ unit }) => !selected.has(unit.uid))
        .forEach((entry) => {
          if (lineup.length >= cap || selected.has(entry.unit.uid)) return;
          selected.add(entry.unit.uid);
          lineup.push(entry);
        });
      return lineup.length === cap ? [lineup] : [];
    });
  }

  private rolloutTargetLineup(roster: OwnedEntry[]) {
    const cap = this.bridge.engine.boardCap;
    const rosterShapeKey = rosterShapeSignature(roster);
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

    const previous = this.previousLineupSnapshot;
    const waveTag = this.bridge.engine.currentWave.tag;
    const expectedLineupLength = Math.min(cap, roster.length);
    if (
      this.style === "seer"
      && this.planningMode === "evolution"
      && this.informationMode === "oracle"
      && previous
      && previous.rosterShapeKey === rosterShapeKey
      && previous.waveTag === waveTag
      && previous.round === this.bridge.engine.state.round
      && previous.lineup.length === expectedLineupLength
      && this.bridge.engine.state.round >= 28
      && previous.lineup.every(({ star }) => star === 3)
      && this.bridge.engine.state.hp > this.policy.woundedHpThreshold
    ) {
      const available = [...roster];
      const reused = previous.lineup.flatMap((plannedUnit) => {
        const index = available.findIndex(({ unit }) => (
          unit.id === plannedUnit.id && unit.star === plannedUnit.star
        ));
        if (index < 0) return [];
        const [entry] = available.splice(index, 1);
        return entry ? [entry] : [];
      });
      if (reused.length === expectedLineupLength) {
        const score = this.rolloutLineupScore(reused, previous.formation);
        if (score >= this.policy.safeWinRolloutScore) {
          this.plannedLineupKey = key;
          this.plannedLineupUids = reused.map(({ unit }) => unit.uid);
          this.plannedLineupUnits = new Map(reused.map(({ unit }) => [
            unit.uid,
            { id: unit.id, star: unit.star },
          ]));
          this.plannedLineupScore = score;
          this.plannedLineupRandomState = this.bridge.engine.getRandomState();
          this.plannedFormation = previous.formation;
          this.plannedBoardSlots = new Map(
            formationPlacements(reused, previous.formation)
              .map(({ entry, slot }) => [entry.unit.uid, slot] as [number, number]),
          );
          this.lineageUnitIds = reused.map(({ unit }) => unit.id);
          this.lineageFormation = previous.formation;
          this.previousLineupSnapshot = {
            ...previous,
            lineup: reused.map(({ unit }) => ({ id: unit.id, star: unit.star })),
            score,
            round: this.bridge.engine.state.round,
            waveTag,
          };
          return reused;
        }
      }
    }

    const heuristic = this.targetLineup(roster);

    // Normal styles do not know future shops, but a safe late-game lineup is
    // still reusable after buying a weaker bench filler. Re-score that known
    // composition once for the current wave instead of enumerating every
    // formation and replacement again. A genuinely stronger new unit, a
    // wounded player, or an unsafe previous score still takes the full search.
    if (
      (
        this.style === "survival"
        || this.style === "balanced"
        || this.style === "highroll"
        || this.style === "fair"
      )
      && this.planningMode === "evolution"
      && previous
      && previous.score >= this.policy.safeWinRolloutScore
      && this.bridge.engine.state.hp > this.policy.woundedHpThreshold
      && this.bridge.engine.state.round >= 18
      && previous.lineup.length === expectedLineupLength
      && previous.waveTag === waveTag
      && previous.round <= this.bridge.engine.state.round
    ) {
      const available = [...roster];
      const reused = previous.lineup.flatMap((plannedUnit) => {
        const choices = available
          .map((entry, index) => ({ entry, index }))
          .filter(({ entry }) => (
            entry.unit.id === plannedUnit.id && entry.unit.star === plannedUnit.star
          ))
          .sort((left, right) => (
            Number(right.entry.location.zone === "board")
              - Number(left.entry.location.zone === "board")
            || this.unitScore(right.entry.unit, roster) - this.unitScore(left.entry.unit, roster)
            || left.entry.unit.uid - right.entry.unit.uid
          ));
        const choice = choices[0];
        if (!choice) return [];
        available.splice(choice.index, 1);
        return [choice.entry];
      });
      const weakestScore = Math.min(
        ...reused.map(({ unit }) => this.unitScore(unit, roster)),
      );
      const strongerReplacement = available.some(({ unit }) => (
        this.unitScore(unit, roster) >= weakestScore + 18
      ));
      const score = this.rolloutLineupScore(reused, previous.formation);
      const heuristicScore = previous.round < this.bridge.engine.state.round
        ? this.rolloutLineupScore(heuristic, previous.formation)
        : score;
      if (
        reused.length === expectedLineupLength
        && Number.isFinite(weakestScore)
        && !strongerReplacement
        && heuristicScore < score + REPLACEMENT_ROLLOUT_MIN_GAIN
      ) {
        if (score >= this.policy.safeWinRolloutScore) {
          this.plannedLineupKey = key;
          this.plannedLineupUids = reused.map(({ unit }) => unit.uid);
          this.plannedLineupUnits = new Map(reused.map(({ unit }) => [
            unit.uid,
            { id: unit.id, star: unit.star },
          ]));
          this.plannedLineupScore = score;
          this.plannedLineupRandomState = this.bridge.engine.getRandomState();
          this.plannedFormation = previous.formation;
          this.plannedBoardSlots = new Map(
            formationPlacements(reused, previous.formation)
              .map(({ entry, slot }) => [entry.unit.uid, slot] as [number, number]),
          );
          this.lineageUnitIds = reused.map(({ unit }) => unit.id);
          this.lineageFormation = previous.formation;
          this.previousLineupSnapshot = {
            ...previous,
            rosterShapeKey,
            lineup: reused.map(({ unit }) => ({ id: unit.id, star: unit.star })),
            score,
            round: this.bridge.engine.state.round,
            waveTag,
          };
          return reused;
        }
      }
    }

    if (this.planningMode === "heuristic" || this.planningMode === "training") {
      this.plannedLineupKey = key;
      this.plannedLineupUids = heuristic.map(({ unit }) => unit.uid);
      this.plannedLineupUnits = new Map(heuristic.map(({ unit }) => [
        unit.uid,
        { id: unit.id, star: unit.star },
      ]));
      const heuristicFormation = this.usesLearnedCombatPlanner()
        ? "go_canonical"
        : this.bridge.engine.state.round >= 18
          ? "center_wedge"
          : "human_midline";
      this.plannedLineupScore = this.planningMode === "training" && heuristic.length > 0
        ? this.rolloutLineupScore(heuristic, heuristicFormation)
        : Number.NEGATIVE_INFINITY;
      this.plannedLineupRandomState = this.plannedLineupScore === Number.NEGATIVE_INFINITY
        ? null
        : this.bridge.engine.getRandomState();
      this.plannedFormation = heuristicFormation;
      this.plannedBoardSlots = new Map(
        formationPlacements(heuristic, heuristicFormation)
          .map(({ entry, slot }) => [entry.unit.uid, slot] as [number, number]),
      );
      return heuristic;
    }
    const availableProfiles = this.formationProfileIds();
    const profileOrder = availableProfiles.includes(this.lineageFormation)
      ? [
        this.lineageFormation,
        ...availableProfiles.filter((profile) => profile !== this.lineageFormation),
      ]
      : availableProfiles;
    const exploratoryCombatHz = this.rolloutCombatHz >= EXACT_COMBAT_HZ
      ? DEFAULT_ROLLOUT_COMBAT_HZ
      : this.rolloutCombatHz;
    const scoreGenome = (
      lineup: OwnedEntry[],
      formation: FormationProfile,
      generation: number,
      stableOnly = false,
      combatHz = this.rolloutCombatHz,
    ) => ({
      lineup,
      formation,
      generation,
      rollout: this.rolloutLineupScore(lineup, formation, stableOnly, combatHz),
      heuristic: this.lineupHeuristicScore(lineup),
    });
    const scoreCommittedGenome = (
      lineup: OwnedEntry[],
      formation: FormationProfile,
      generation: number,
    ) => (this.usesLearnedCombatPlanner()
      ? scoreGenome(lineup, formation, generation, true, EXACT_COMBAT_HZ)
      : scoreGenome(lineup, formation, generation));
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
      this.plannedLineupRandomState = this.bridge.engine.getRandomState();
      this.plannedFormation = genome.formation;
      this.plannedBoardSlots = new Map(
        formationPlacements(genome.lineup, genome.formation)
          .map(({ entry, slot }) => [entry.unit.uid, slot] as [number, number]),
      );
      this.rescueLineupLocked = false;
      this.lineageUnitIds = genome.lineup.map(({ unit }) => unit.id);
      this.lineageFormation = genome.formation;
      this.previousLineupSnapshot = {
        rosterShapeKey,
        lineup: genome.lineup.map(({ unit }) => ({ id: unit.id, star: unit.star })),
        formation: genome.formation,
        score: genome.rollout,
        round: this.bridge.engine.state.round,
        waveTag,
      };
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
        const scored = scoreCommittedGenome(
          candidate,
          pruned.formation,
          pruned.generation + 1,
        );
        if (scored.rollout < this.policy.safeWinRolloutScore) continue;
        pruned = scored;
        accepted += 1;
      }
      return pruned;
    };

    if (roster.length <= cap) {
      const champion = profileOrder
        .map((formation) => scoreCommittedGenome(roster, formation, 0))
        .sort(compareGenome)[0];
      return commitGenome(pruneWinningGenome(champion));
    }

    const candidates = new Map<string, OwnedEntry[]>();
    const addCandidate = (lineup: OwnedEntry[]) => {
      if (lineup.length !== cap) return;
      const lineupKey = this.usesLearnedCombatPlanner()
        ? rosterShapeSignature(lineup)
        : lineup.map(({ unit }) => unit.uid).sort((left, right) => left - right).join(",");
      if (this.usesLearnedCombatPlanner() && candidates.has(lineupKey)) return;
      candidates.set(lineupKey, lineup);
    };
    const currentBoardLineup = roster.filter(({ location }) => location.zone === "board");
    if (this.usesLearnedCombatPlanner()) addCandidate(currentBoardLineup);
    addCandidate(heuristic);
    if (!this.usesLearnedCombatPlanner()) addCandidate(currentBoardLineup);

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

    const seer2PrincipalLineups = this.seer2PrincipalLineups(roster, cap);
    seer2PrincipalLineups.forEach(addCandidate);

    if (this.usesLearnedCombatPlanner()) {
      const modelGenomeKey = (lineup: OwnedEntry[], formation: FormationProfile) => (
        `${rosterShapeSignature(lineup)}/${formation}`
      );
      const modelScore = (lineup: OwnedEntry[], formation: FormationProfile) => ({
        lineup,
        formation,
        value: this.goModelScore(lineup, formation),
        heuristic: this.lineupHeuristicScore(lineup),
      });
      const compareModel = (
        left: ReturnType<typeof modelScore>,
        right: ReturnType<typeof modelScore>,
      ) => right.value - left.value || right.heuristic - left.heuristic;
      const seedGenomes = Array.from(candidates.values())
        .flatMap((lineup) => profileOrder.map((formation) => modelScore(lineup, formation)))
        .sort(compareModel);
      const parentLineups = new Map<string, OwnedEntry[]>();
      seedGenomes.forEach(({ lineup }) => {
        if (parentLineups.size >= GO_MODEL_PARENT_LIMIT) return;
        const lineupKey = rosterShapeSignature(lineup);
        if (!parentLineups.has(lineupKey)) parentLineups.set(lineupKey, lineup);
      });
      parentLineups.forEach((parent) => {
        const parentSelectedUids = new Set(parent.map(({ unit }) => unit.uid));
        roster
          .filter(({ unit }) => !parentSelectedUids.has(unit.uid))
          .forEach((reserve) => parent.forEach((_, index) => {
            const mutation = [...parent];
            mutation[index] = reserve;
            addCandidate(mutation);
          }));
      });

      const rankedByModel = Array.from(candidates.values())
        .flatMap((lineup) => profileOrder.map((formation) => modelScore(lineup, formation)))
        .sort(compareModel);
      const rankedByHeuristic = Array.from(candidates.values())
        .flatMap((lineup) => profileOrder.map((formation) => modelScore(lineup, formation)))
        .sort((left, right) => right.heuristic - left.heuristic || right.value - left.value);
      const shortlist = new Map<string, ReturnType<typeof modelScore>>();
      const addShortlist = (genome: ReturnType<typeof modelScore> | undefined) => {
        if (!genome || shortlist.size >= GO_MODEL_SHORTLIST_LIMIT) return;
        const genomeKey = modelGenomeKey(genome.lineup, genome.formation);
        if (!shortlist.has(genomeKey)) shortlist.set(genomeKey, genome);
      };
      const currentLineup = roster.filter(({ location }) => location.zone === "board");
      profileOrder.forEach((formation) => addShortlist(modelScore(currentLineup, formation)));
      profileOrder.forEach((formation) => addShortlist(modelScore(heuristic, formation)));
      const financeLineup = Array.from(candidates.values())
        .filter((lineup) => financeCount(lineup) >= 4)
        .sort((left, right) => this.lineupHeuristicScore(right)
          - this.lineupHeuristicScore(left))[0];
      if (financeLineup) addShortlist(modelScore(financeLineup, profileOrder[0]));
      rankedByModel.forEach(addShortlist);

      const exploratory = Array.from(shortlist.values())
        .map(({ lineup, formation }) => scoreGenome(
          lineup,
          formation,
          0,
          false,
          exploratoryCombatHz,
        ))
        .sort(compareGenome);
      const robustCandidates = new Map<string, ReturnType<typeof scoreGenome>>();
      const addRobustCandidate = (genome: ReturnType<typeof scoreGenome> | undefined) => {
        if (!genome) return;
        robustCandidates.set(modelGenomeKey(genome.lineup, genome.formation), genome);
      };
      exploratory
        .slice(0, GO_MODEL_ROLLOUT_SURVIVOR_LIMIT)
        .forEach(addRobustCandidate);
      Array.from(shortlist.values())
        .sort(compareModel)
        .slice(0, GO_MODEL_ROLLOUT_SURVIVOR_LIMIT)
        .forEach((modelGenome) => addRobustCandidate(
          exploratory.find((candidate) => (
            modelGenomeKey(candidate.lineup, candidate.formation)
              === modelGenomeKey(modelGenome.lineup, modelGenome.formation)
          )),
        ));
      const bestFinance = exploratory.find(({ lineup }) => financeCount(lineup) >= 4);
      addRobustCandidate(bestFinance);
      let robust = Array.from(robustCandidates.values())
        .sort(compareGenome)
        .slice(0, GO_MODEL_ROBUST_LIMIT)
        .map(({ lineup, formation, generation }) => scoreGenome(
          lineup,
          formation,
          generation + 1,
          true,
          EXACT_COMBAT_HZ,
        ))
        .sort(compareGenome);

      const { state } = this.bridge.engine;
      const criticalGoExactCoverage = this.rolloutCombatHz < EXACT_COMBAT_HZ
        && this.finalizingEconomy
        && state.round >= 28
        && state.hp <= this.policy.woundedHpThreshold
        && robust[0]?.rollout < this.policy.safeWinRolloutScore;
      if (criticalGoExactCoverage) {
        const exactCoverage = (
          ranked: ReturnType<typeof modelScore>[],
          start: number,
          limit: number,
        ) => {
          const exact: ReturnType<typeof scoreGenome>[] = [];
          for (const { lineup, formation } of ranked.slice(start, limit)) {
            const candidate = scoreCommittedGenome(lineup, formation, 1);
            exact.push(candidate);
            if (candidate.rollout >= this.policy.safeWinRolloutScore) break;
          }
          return exact;
        };
        robust = [...robust, ...exactCoverage(
          rankedByHeuristic,
          0,
          GO_CRITICAL_EXACT_HEURISTIC_INITIAL_LIMIT,
        )].sort(compareGenome);
        if (robust[0]?.rollout < this.policy.safeWinRolloutScore) {
          robust = [...robust, ...exactCoverage(
            rankedByHeuristic,
            GO_CRITICAL_EXACT_HEURISTIC_INITIAL_LIMIT,
            GO_CRITICAL_EXACT_HEURISTIC_EXPANDED_LIMIT,
          )].sort(compareGenome);
        }
        if (robust[0]?.rollout < this.policy.safeWinRolloutScore) {
          robust = [...robust, ...exactCoverage(
            rankedByModel,
            0,
            GO_CRITICAL_EXACT_MODEL_LIMIT,
          )].sort(compareGenome);
        }
      }
      const champion = robust[0]
        || exploratory[0]
        || scoreGenome(heuristic, profileOrder[0], 0);
      const financeActivationScore = this.bridge.engine.state.hp <= this.policy.woundedHpThreshold
        ? this.policy.safeWinRolloutScore
        : this.policy.financeActivationRolloutScore;
      const financeChampion = robust
        .filter((genome) => (
          financeCount(genome.lineup) >= 4
          && genome.rollout >= financeActivationScore
          && genome.rollout >= champion.rollout - this.policy.financeActivationMaxRolloutDeficit
        ))
        .sort(compareGenome)[0];
      return commitGenome(pruneWinningGenome(financeChampion || champion));
    }

    if (this.usesSeer2Foundation()) {
      const current = candidates.get(
        roster.filter(({ location }) => location.zone === "board")
          .map(({ unit }) => unit.uid)
          .sort((left, right) => left - right)
          .join(","),
      );
      const ranked = Array.from(candidates.values())
        .sort((left, right) => this.lineupHeuristicScore(right)
          - this.lineupHeuristicScore(left));
      const firstStage: OwnedEntry[][] = [];
      const addFirstStage = (lineup: OwnedEntry[] | undefined) => {
        if (!lineup || firstStage.length >= SEER2_ROLLOUT_CANDIDATE_LIMIT) return;
        const lineupKey = lineup.map(({ unit }) => unit.uid)
          .sort((left, right) => left - right)
          .join(",");
        if (firstStage.some((candidate) => candidate.map(({ unit }) => unit.uid)
          .sort((left, right) => left - right)
          .join(",") === lineupKey)) return;
        firstStage.push(lineup);
      };
      seer2PrincipalLineups.forEach(addFirstStage);
      addFirstStage(heuristic);
      addFirstStage(current);
      ranked.forEach(addFirstStage);

      const survivors = firstStage
        .map((lineup) => scoreGenome(
          lineup,
          this.lineageFormation,
          0,
          false,
          exploratoryCombatHz,
        ))
        .sort(compareGenome)
        .slice(0, SEER2_ROLLOUT_SURVIVOR_LIMIT);
      const finalists = survivors
        .flatMap(({ lineup }) => profileOrder.map((formation) => (
          scoreGenome(lineup, formation, 1, true)
        )))
        .sort(compareGenome);
      const champion = finalists[0]
        || survivors[0]
        || scoreGenome(heuristic, "human_midline", 0);
      return commitGenome(pruneWinningGenome(champion));
    }

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
      .map((lineup) => scoreGenome(
        lineup,
        this.lineageFormation,
        0,
        false,
        exploratoryCombatHz,
      ))
      .sort(compareGenome);
    const elites = parents.slice(0, EVOLUTION_ELITE_LIMIT);
    const offspring = new Map<string, ReturnType<typeof scoreGenome>>();
    const addOffspring = (
      lineup: OwnedEntry[],
      formation: FormationProfile,
    ) => {
      const genomeKey = `${lineup.map(({ unit }) => unit.uid).sort((left, right) => left - right).join(",")}/${formation}`;
      if (offspring.has(genomeKey)) return;
      offspring.set(genomeKey, scoreGenome(
        lineup,
        formation,
        1,
        false,
        exploratoryCombatHz,
      ));
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
    const exactCandidates = new Map<string, ReturnType<typeof scoreGenome>>();
    const addExactCandidate = (genome: ReturnType<typeof scoreGenome> | undefined) => {
      if (!genome) return;
      const genomeKey = `${genome.lineup.map(({ unit }) => unit.uid)
        .sort((left, right) => left - right).join(",")}/${genome.formation}`;
      if (exactCandidates.has(genomeKey)) return;
      exactCandidates.set(
        genomeKey,
        scoreGenome(genome.lineup, genome.formation, genome.generation),
      );
    };
    generation.slice(0, Math.max(ROLLOUT_CANDIDATE_LIMIT, 3)).forEach(addExactCandidate);
    if (this.style === "seer") {
      const currentLineup = roster.filter(({ location }) => location.zone === "board");
      const formationScoutLineups = [
        heuristic,
        currentLineup,
        ...generation.slice(0, 2).map(({ lineup }) => lineup),
      ];
      const seenLineups = new Set<string>();
      const formationScouts = formationScoutLineups.flatMap((lineup) => {
        const lineupKey = lineup.map(({ unit }) => unit.uid)
          .sort((left, right) => left - right).join(",");
        if (seenLineups.has(lineupKey)) return [];
        seenLineups.add(lineupKey);
        return profileOrder.map((formation) => scoreGenome(
          lineup,
          formation,
          1,
          false,
          exploratoryCombatHz,
        ));
      });
      formationScouts
        .sort(compareGenome)
        .slice(0, Math.max(profileOrder.length, ROLLOUT_CANDIDATE_LIMIT + 1))
        .forEach(addExactCandidate);
    }
    addExactCandidate({
      lineup: heuristic,
      formation: this.lineageFormation,
      generation: 0,
      rollout: Number.NEGATIVE_INFINITY,
      heuristic: this.lineupHeuristicScore(heuristic),
    });
    addExactCandidate(generation.find((genome) => financeCount(genome.lineup) >= 4));
    const boardUids = roster
      .filter(({ location }) => location.zone === "board")
      .map(({ unit }) => unit.uid)
      .sort((left, right) => left - right)
      .join(",");
    addExactCandidate(generation.find((genome) => (
      genome.lineup.map(({ unit }) => unit.uid)
        .sort((left, right) => left - right).join(",") === boardUids
    )));
    const exactGeneration = Array.from(exactCandidates.values()).sort(compareGenome);
    const champion = exactGeneration[0]
      || scoreGenome(heuristic, "human_midline", 0, false, this.rolloutCombatHz);
    const financeActivationScore = this.bridge.engine.state.hp <= this.policy.woundedHpThreshold
      ? this.policy.safeWinRolloutScore
      : this.policy.financeActivationRolloutScore;
    const financeChampion = exactGeneration
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
    if (this.interactiveLateSeerPlan() && this.plannedLineupUids.length === 0) {
      const board = this.bridge.engine.state.board.map((unit) => (
        unit ? roster.find(({ unit: owned }) => owned.uid === unit.uid) || null : null
      ));
      if (board.some(Boolean)) {
        const randomState = this.bridge.engine.getRandomState();
        const key = `${this.bridge.engine.state.round}/${randomState}/board/${board
          .map((entry) => (entry ? `${entry.unit.uid}:${entry.unit.id}:${entry.unit.star}` : "-"))
          .join(",")}`;
        if (key === this.confidenceKey) return this.confidenceScore;
        this.confidenceKey = key;
        this.confidenceScore = this.rolloutBoardScore(board);
        return this.confidenceScore;
      }
    }
    const lineup = this.rolloutTargetLineup(roster);
    const randomState = this.bridge.engine.getRandomState();
    const key = `${this.bridge.engine.state.round}/${randomState}/${lineup
      .map(({ unit }) => `${unit.uid}:${unit.id}:${unit.star}`)
      .sort()
      .join("|")}`;
    if (key === this.confidenceKey) return this.confidenceScore;
    const plannedMatches = roster.length > this.bridge.engine.boardCap
      && lineup.length === this.plannedLineupUids.length
      && lineup.every(({ unit }) => this.plannedLineupUids.includes(unit.uid))
      && lineup.every(({ unit }) => {
        const previous = this.plannedLineupUnits.get(unit.uid);
        return previous?.id === unit.id && previous.star === unit.star;
      });
    const plannedRandomStateMatches = this.plannedLineupRandomState === null
      || this.plannedLineupRandomState === randomState;
    this.confidenceKey = key;
    this.confidenceScore = plannedMatches
      && plannedRandomStateMatches
      ? this.plannedLineupScore
      : this.rolloutLineupScore(lineup);
    return this.confidenceScore;
  }

  private battleConfidence(roster: OwnedEntry[]) {
    if (this.plannedLineupIsOnBoard(roster)) return this.plannedLineupScore;
    const board = this.bridge.engine.state.board.map((unit) => (
      unit ? roster.find(({ unit: owned }) => owned.uid === unit.uid) || null : null
    ));
    return this.rolloutBoardScore(board);
  }

  private exactBattleAudit(roster: OwnedEntry[]) {
    const { state } = this.bridge.engine;
    const board = state.board.map((unit) => (
      unit ? roster.find(({ unit: owned }) => owned.uid === unit.uid) || null : null
    ));
    const key = `${state.round}/${this.bridge.engine.getRandomState()}/${board
      .map((entry) => (entry ? `${entry.unit.uid}:${entry.unit.id}:${entry.unit.star}` : "-"))
      .join(",")}`;
    if (key !== this.exactBattleAuditKey) {
      this.exactBattleAuditKey = key;
      // Search uses the cheap live timestep. This single formal combat branch
      // checks only the board that will really enter combat.
      this.exactBattleAuditScore = this.rolloutBoardScore(board, false, EXACT_COMBAT_HZ);
    }
    return {
      key,
      score: this.exactBattleAuditScore,
    };
  }

  private shouldAuditLiveBattle() {
    return this.liveBattleAuditEnabled
      && this.rolloutCombatHz < EXACT_COMBAT_HZ;
  }

  private criticalExactRolloutConfidence(roster: OwnedEntry[], score: number) {
    const { state } = this.bridge.engine;
    if (
      this.planningMode === "training"
      || this.informationMode !== "oracle"
      || this.rolloutCombatHz >= EXACT_COMBAT_HZ
      || state.hp > this.policy.criticalHpThreshold
    ) return score;

    const lineup = this.rolloutTargetLineup(roster);
    const lineupKey = lineup
      .map(({ unit }) => `${unit.uid}:${unit.id}:${unit.star}`)
      .sort()
      .join("|");
    const key = `${state.round}/${this.bridge.engine.getRandomState()}/${this.plannedFormation}/${lineupKey}`;
    if (key !== this.criticalExactConfidenceKey) {
      this.criticalExactConfidenceKey = key;
      this.criticalExactConfidenceScore = this.rolloutLineupScore(
        lineup,
        this.plannedFormation,
        true,
        EXACT_COMBAT_HZ,
      );
    }
    return Math.min(score, this.criticalExactConfidenceScore);
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
          const desiredCopies = this.targetDesiredCopies(id);
          if (desiredCopies > 0) {
            if (this.seer2EndgameOpen() && !this.seer2FocusIds.has(id)) return false;
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
    return this.terminalTargets().some(({ id }) => {
      const copies = roster
        .filter(({ unit }) => unit.id === id)
        .reduce((sum, { unit }) => sum + unitCopyValue(unit), 0);
      return copies < this.targetDesiredCopies(id);
    });
  }

  private terminalCompletionProjectCount(roster: OwnedEntry[]) {
    return this.terminalTargets().filter(({ id }) => {
      const copies = roster
        .filter(({ unit }) => unit.id === id)
        .reduce((sum, { unit }) => sum + unitCopyValue(unit), 0);
      return copies >= 6 && copies < this.targetDesiredCopies(id);
    }).length;
  }

  private terminalDevelopmentWindowOpen(roster: OwnedEntry[], rolloutScore: number) {
    const { state } = this.bridge.engine;
    const woundedDevelopmentAllowed = this.usesBalancedEconomy()
      || this.style === "highroll";
    const surplusWithoutFinance = this.informationMode === "normal"
      && (
        (this.usesBalancedEconomy()
          && this.preparationStartGold >= this.policy.terminalRollDownActivationGold + 40)
        || (this.style === "highroll"
          && this.preparationStartGold >= this.policy.terminalRollDownActivationGold + 16)
      );
    return state.playerLevel >= 10
      && state.round >= this.policy.terminalRollDownMinimumRound
      && state.hp > (woundedDevelopmentAllowed
        ? this.policy.criticalHpThreshold
        : this.policy.woundedHpThreshold)
      && (this.financeInterestActive() || surplusWithoutFinance)
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
    if (!this.usesOraclePlanner()) return new Set<UnitId>(this.terminalTargetIds());
    if (this.seer2EndgameOpen() && this.seer2FocusIds.size > 0) {
      return new Set(this.seer2FocusIds);
    }
    const { state } = this.bridge.engine;
    const rows = this.terminalTargets().map(({ id, priority }) => {
      const units = roster.filter(({ unit }) => unit.id === id);
      const copies = units.reduce((sum, { unit }) => sum + unitCopyValue(unit), 0);
      const shopHits = state.shop.filter((shopId) => shopId === id).length;
      const projectedCopies = this.seerPlan?.projectedTargetCopies[id] || 0;
      const desiredCopies = this.targetDesiredCopies(id);
      const progressTier = copies >= 6 ? 4 : copies >= 3 ? 3 : copies > 0 ? 1 : 0;
      return {
        id,
        copies,
        desiredCopies,
        shopHits,
        score: progressTier * 1000
          + Math.min(copies, 8) * 24
          + shopHits * 260
          + Math.max(0, projectedCopies - copies) * 8
          + priority / 10,
      };
    });
    const incomplete = rows.filter(({ copies, desiredCopies }) => copies < desiredCopies);
    const inProgress = incomplete.filter(({ copies }) => copies > 0);
    const candidates = (inProgress.length > 0
      ? inProgress
      : incomplete.filter(({ shopHits }) => shopHits > 0))
      .sort((left, right) => right.score - left.score || right.copies - left.copies);
    return new Set(candidates.slice(0, 3).map(({ id }) => id));
  }

  private lateGameReserveUids(roster: OwnedEntry[]) {
    const reserves = new Set<number>();
    const focusedIds = this.seerProjectFocusIds(roster);
    const lateGamePurchaseWindowOpen = this.lateGamePurchaseWindowOpen();
    this.lateGameTargetIds().forEach((id) => {
      let reservedCopies = 0;
      const desiredCopies = this.targetDesiredCopies(id);
      const reserveGoal = this.usesOraclePlanner() && !focusedIds.has(id)
        ? this.seer2EndgameOpen() ? 0 : Math.min(desiredCopies, 1)
        : lateGamePurchaseWindowOpen ? desiredCopies : Math.min(desiredCopies, 3);
      roster
        .filter(({ unit }) => unit.id === id)
        .sort((left, right) => right.unit.star - left.unit.star
          || this.unitScore(right.unit, roster) - this.unitScore(left.unit, roster)
          || left.unit.uid - right.unit.uid)
        .forEach(({ unit, location }) => {
          if (unit.star === 3) {
            reserves.add(unit.uid);
            return;
          }
          if (location.zone !== "board" && reservedCopies >= reserveGoal) return;
          reserves.add(unit.uid);
          reservedCopies += unitCopyValue(unit);
        });
    });
    return reserves;
  }

  private rerollStrategy(roster: OwnedEntry[], confirmCritical = false) {
    const currentRolloutScore = confirmCritical
      ? this.criticalExactRolloutConfidence(roster, this.rolloutConfidence(roster))
      : this.rolloutConfidence(roster);
    const rolloutScore = this.style === "go"
      && this.bridge.engine.state.round >= GO_FUTURE_THREAT_MIN_ROUND
      && currentRolloutScore >= this.policy.stabilizeRolloutScore
      ? Math.min(
        currentRolloutScore,
        this.rolloutLineupScoreAtRound(
          this.rolloutTargetLineup(roster),
          this.bridge.engine.state.round + 1,
          "go_canonical",
        ),
      )
      : currentRolloutScore;
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
      const targetPlanPriority = this.targetPriority(id);
      const targetDesiredCopies = this.targetDesiredCopies(id);
      const shopCopies = state.shop.filter((shopId) => shopId === id).length;
      const canStartTerminalProject = targetDesiredCopies <= 0
        || lateGamePurchaseWindowOpen
        || sameUnits.length > 0
        || shopCopies >= 2
        || completesMerge
        || definition.cost >= weakestLineupCost + 2;
      const targetNeedsCopies = ownedCopies < targetDesiredCopies;
      const goProjectAvailable = !this.seer2EndgameOpen()
        || seerFocusIds.has(id)
        || completesMerge;
      const longTermPriority = targetNeedsCopies && canStartTerminalProject && goProjectAvailable
        ? targetPlanPriority
        : 0;
      const targetDuplicate = (targetDesiredCopies > 0
        ? targetNeedsCopies && goProjectAvailable
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
          + (this.usesOraclePlanner() && seerFocusIds.has(id) ? 64 : 0)
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

  /**
   * At max level the forge is a deterministic substitute for a long reroll
   * chase. Use it only on an active board unit or a real late-game project,
   * and keep the same reserve used by ordinary economic actions.
   */
  private starForgeAction(roster: OwnedEntry[]): GameAction | null {
    const { engine } = this.bridge;
    const { state } = engine;
    if (!engine.isMaxPlayerLevel || state.round < STAR_FORGE_MIN_ROUND) return null;

    const desired = this.rolloutTargetLineup(roster);
    const desiredUids = new Set(desired.map(({ unit }) => unit.uid));
    const focusIds = this.seerProjectFocusIds(roster);
    const upgradeProjectIds = this.upgradeProjectIds(roster, desired);
    const copiesById = roster.reduce<Partial<Record<UnitId, number>>>((copies, { unit }) => {
      copies[unit.id] = (copies[unit.id] || 0) + unitCopyValue(unit);
      return copies;
    }, {});
    const reserve = this.goldReserve(false, 0);
    const immediateShopProject = state.shop.some((id) => {
      if (!id) return false;
      const copies = copiesById[id] || 0;
      const oneStarCopies = roster.filter(({ unit }) => (
        unit.id === id && unit.star === 1
      )).length;
      const isProject = (
        (this.targetDesiredCopies(id) > 0 && copies < this.targetDesiredCopies(id))
        || oneStarCopies >= 2
      );
      return isProject
        && state.gold >= UNIT_DEFS[id].cost
        && state.gold - UNIT_DEFS[id].cost >= reserve
        && engine.canStoreUnit(id);
    });
    if (immediateShopProject) return null;
    const candidates = roster.flatMap((entry) => {
      const { unit, location } = entry;
      const cost = engine.getStarForgeUpgradeCost(unit);
      if (cost === null) return [];
      const currentCopies = copiesById[unit.id] || 0;
      const nextStar = (unit.star + 1) as 2 | 3;
      const nextCopies = currentCopies - unitCopyValue(unit) + unitCopyValue({
        ...unit,
        star: nextStar,
      });
      const desiredCopies = this.targetDesiredCopies(unit.id);
      const targetProject = desiredCopies > 0 && currentCopies < desiredCopies;
      const focusedProject = focusIds.has(unit.id) || upgradeProjectIds.has(unit.id);
      const selectedForBattle = desiredUids.has(unit.uid) && unit.star >= 2;
      const onBoard = location.zone === "board";
      const developedBoard = onBoard && unit.star >= 2;
      if (!targetProject && !focusedProject && !selectedForBattle && !developedBoard) return [];

      const nextUnit = { ...unit, star: nextStar };
      const marginalStrength = this.unitScore(nextUnit, roster) - this.unitScore(unit, roster);
      const completesTarget = desiredCopies > 0 && nextCopies >= desiredCopies;
      const reachesTwoStar = currentCopies < 3 && nextCopies >= 3;
      const reachesThreeStar = currentCopies < 6 && nextCopies >= 9;
      const score = (completesTarget ? 1_000_000 : 0)
        + (reachesThreeStar ? 300_000 : 0)
        + (reachesTwoStar ? 80_000 : 0)
        + (focusedProject ? 20_000 : 0)
        + (selectedForBattle ? 8_000 : 0)
        + (developedBoard ? 4_000 : 0)
        + this.targetPriority(unit.id) * 100
        + marginalStrength * 20
        - cost;
      return [{ entry, cost, score }];
    }).sort((left, right) => (
      right.score - left.score
      || right.entry.unit.star - left.entry.unit.star
      || left.cost - right.cost
      || left.entry.unit.uid - right.entry.unit.uid
    ));
    const candidate = candidates[0];
    if (!candidate) return null;

    const unlockCost = engine.isStarForgeUnlocked ? 0 : engine.starForgeUnlockCost;
    if (
      state.gold < unlockCost + candidate.cost
      || state.gold - unlockCost - candidate.cost < reserve + STAR_FORGE_MIN_SURPLUS
    ) return null;

    // A forge changes star values without consuming a shop cursor. Cached
    // planner purchases and formation scores must therefore be rebuilt from
    // the new roster before the next action.
    this.invalidateFinalLineup();
    if (this.usesOraclePlanner()) this.invalidateSeerPlan(false);
    return { type: "starForge", location: candidate.entry.location };
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

  private seerShopMacroActionsComplete(shopIndex: number) {
    if (!this.seerPlan) return false;
    const purchases = this.seerPlan.firstStep.purchasesByShop?.[shopIndex] || [];
    const sales = this.seerPlan.firstStep.salesByShop?.[shopIndex] || [];
    return (
      (this.seerPurchaseOffsets[shopIndex] || 0) >= purchases.length
      && (this.seerSaleOffsets[shopIndex] || 0) >= sales.length
    );
  }

  private seerMacroActionsComplete() {
    if (!this.usesOraclePlanner() || !this.seerPlan) return false;
    const { firstStep } = this.seerPlan;
    if (
      this.bridge.engine.state.playerLevel < firstStep.targetLevel
      || this.rerolls < firstStep.rerolls
    ) return false;
    const shopCount = Math.max(
      firstStep.purchasesByShop?.length || 0,
      firstStep.salesByShop?.length || 0,
    );
    return Array.from({ length: shopCount }, (_, index) => index)
      .every((index) => this.seerShopMacroActionsComplete(index));
  }

  private seerPlanHasSafePrefix() {
    if (!this.seerPlan) return false;
    const startRound = this.seerPlan.startRound ?? this.bridge.engine.state.round;
    const plannedSpan = Math.max(0, this.seerPlan.projectedRound - startRound);
    const planningHorizon = this.seerPlan.planningHorizon || plannedSpan;
    return plannedSpan >= Math.min(8, Math.max(1, planningHorizon));
  }

  private seerPlannedRerollAction(): GameAction | null {
    if (!this.usesOraclePlanner() || !this.seerPlan) return null;
    const { firstStep } = this.seerPlan;
    if (
      this.bridge.engine.state.playerLevel < firstStep.targetLevel
      || this.rerolls >= firstStep.rerolls
      || !this.seerShopMacroActionsComplete(this.rerolls)
    ) return null;
    const { state } = this.bridge.engine;
    const free = state.freeRerollCharges > 0;
    if (!free && state.gold < 1) {
      this.invalidateSeerPlan();
      return null;
    }
    this.rerolls += 1;
    if (!free) {
      this.paidRerolls += 1;
      this.dryPaidRerolls += 1;
    }
    return { type: "reroll" };
  }

  private seerPlannedPurchaseAction(): GameAction | null {
    if (!this.usesOraclePlanner() || !this.seerPlan) return null;
    const { purchasesByShop } = this.seerPlan.firstStep;
    const plannedPurchases = purchasesByShop?.[this.rerolls];
    if (!plannedPurchases) return null;
    const offset = this.seerPurchaseOffsets[this.rerolls] || 0;
    const id = plannedPurchases[offset];
    if (!id) return null;
    const { engine } = this.bridge;
    const { state } = engine;
    const index = state.shop.findIndex((shopId) => shopId === id);
    const hasCapacity = engine.boardCount < engine.boardCap || state.bench.some((unit) => !unit);
    if (index < 0) {
      this.invalidateSeerPlan();
      return null;
    }
    if (!hasCapacity || state.gold < UNIT_DEFS[id].cost) {
      const roster = this.ownedEntries();
      const expectedTargetCopies = this.seerPlan.steps?.[0]?.expectedTargetCopies || {};
      const targetIds = new Set<UnitId>(
        Object.keys(expectedTargetCopies) as UnitId[],
      );
      const sale = roster
        .filter(({ location }) => location.zone === "bench")
        .sort((left, right) => (
          Number(targetIds.has(left.unit.id)) - Number(targetIds.has(right.unit.id))
          || Number(left.unit.star === 3) - Number(right.unit.star === 3)
          || Number(left.unit.star > 1) - Number(right.unit.star > 1)
          || this.unitScore(left.unit, roster) - this.unitScore(right.unit, roster)
          || left.unit.uid - right.unit.uid
        ))[0];
      if (sale) {
        this.benchCleanupSales += 1;
        this.soldUnitIds.add(sale.unit.id);
        return { type: "sell", location: sale.location };
      }
      this.invalidateSeerPlan();
      return null;
    }
    this.seerPurchaseOffsets[this.rerolls] = offset + 1;
    return { type: "shop", index } as GameAction;
  }

  private seerPlannedSaleAction(): GameAction | null {
    if (!this.usesOraclePlanner() || !this.seerPlan) return null;
    const { salesByShop } = this.seerPlan.firstStep;
    const plannedSales = salesByShop?.[this.rerolls];
    if (!plannedSales) return null;
    const offset = this.seerSaleOffsets[this.rerolls] || 0;
    const id = plannedSales[offset];
    if (!id) return null;
    const saleEntry = this.ownedEntries()
      .filter(({ unit }) => unit.id === id)
      .sort((left, right) => (
        left.unit.star - right.unit.star
        || Number(left.location.zone === "board") - Number(right.location.zone === "board")
        || left.unit.uid - right.unit.uid
      ))[0];
    if (!saleEntry) {
      this.seerSaleOffsets[this.rerolls] = offset + 1;
      return null;
    }
    // Macro sales describe a unit type, not a concrete owned piece. A low-star
    // copy may merge before execution, so resolve the cheapest semantic copy
    // now and never turn a stale macro sale into the loss of a completed unit.
    if (saleEntry.unit.star === 3) {
      this.invalidateSeerPlan(false);
      return null;
    }
    this.seerSaleOffsets[this.rerolls] = offset + 1;
    return {
      type: "sell",
      location: saleEntry.location,
    } as GameAction;
  }

  private seerEndgameTargetCopies(roster: OwnedEntry[], id: UnitId) {
    return roster
      .filter(({ unit }) => unit.id === id)
      .reduce((sum, { unit }) => sum + unitCopyValue(unit), 0);
  }

  private seerEndgameInvestmentOpen(roster: OwnedEntry[]) {
    const { state } = this.bridge.engine;
    return this.style === "seer"
      && this.informationMode === "oracle"
      && (state.round >= 18 || state.playerLevel >= 8)
      && this.lateGameDevelopmentIncomplete(roster);
  }

  private seerEndgameBenchSale(roster: OwnedEntry[]) {
    const reservedUids = this.lateGameReserveUids(roster);
    const targetIds = new Set(this.terminalTargetIds());
    return roster
      .filter(({ unit, location }) => location.zone === "bench" && unit.star < 3)
      .sort((left, right) => (
        Number(reservedUids.has(left.unit.uid)) - Number(reservedUids.has(right.unit.uid))
        || Number(targetIds.has(left.unit.id)) - Number(targetIds.has(right.unit.id))
        || left.unit.star - right.unit.star
        || this.unitScore(left.unit, roster) - this.unitScore(right.unit, roster)
        || this.bridge.engine.getUnitSellValue(left.unit)
          - this.bridge.engine.getUnitSellValue(right.unit)
        || left.unit.uid - right.unit.uid
      ))[0] || null;
  }

  private seerFutureShopForecast(lookahead = SEER_ENDGAME_TARGET_LOOKAHEAD) {
    const { engine } = this.bridge;
    const { state } = engine;
    const key = `${lookahead}/${state.playerLevel}/${engine.getShopRandomState()}/${state.shop.join(",")}`;
    if (key !== this.seerFutureShopPreviewKey) {
      this.seerFutureShopPreviewKey = key;
      this.seerFutureShopPreview = engine.previewFutureShops(lookahead);
    }
    return this.seerFutureShopPreview;
  }

  /**
   * A complete oracle macro still may choose to bank for a future shop. Once
   * the real run has a large late-game surplus, do the obvious terminal work
   * before opening combat: buy a known target, clear an expendable bench slot,
   * or refresh toward the next known target shop.
   */
  private seerEndgameInvestmentAction(roster: OwnedEntry[]): GameAction | null {
    if (
      !this.seerEndgameInvestmentOpen(roster)
      || (this.seerPlan && !this.seerMacroActionsComplete())
    ) return null;
    const { engine } = this.bridge;
    const { state } = engine;
    const reserve = this.goldReserve(false, 0);
    const focusIds = this.seerProjectFocusIds(roster);
    const targets = new Map(
      this.terminalTargets().map(({ id, priority }) => [id, { priority }]),
    );
    const currentCandidates = state.shop.flatMap((id, index) => {
      if (!id) return [];
      const target = targets.get(id);
      if (!target) return [];
      const copies = this.seerEndgameTargetCopies(roster, id);
      const desiredCopies = this.targetDesiredCopies(id);
      const definition = UNIT_DEFS[id];
      if (
        copies >= desiredCopies
        || state.gold < definition.cost
        || state.gold - definition.cost < reserve
      ) return [];
      const oneStarCopies = roster.filter(({ unit }) => unit.id === id && unit.star === 1).length;
      const shopCopies = state.shop.filter((shopId) => shopId === id).length;
      return [{
        id,
        index,
        score: (oneStarCopies >= 2 ? 100_000 : 0)
          + (copies >= 6 ? 5_000 : copies >= 3 ? 2_000 : 0)
          + (focusIds.has(id) ? 1_000 : 0)
          + target.priority * 100
          + shopCopies * 20,
      }];
    }).sort((left, right) => right.score - left.score || left.index - right.index);
    const currentTarget = currentCandidates[0];
    if (currentTarget) {
      const hasCapacity = engine.boardCount < engine.boardCap || state.bench.some((unit) => !unit);
      if (!hasCapacity) {
        const sale = this.seerEndgameBenchSale(roster);
        if (sale && this.benchCleanupSales < this.policy.maxStarCleanupSales) {
          this.invalidateSeerPlan(false);
          this.benchCleanupSales += 1;
          this.soldUnitIds.add(sale.unit.id);
          return { type: "sell", location: sale.location };
        }
        return null;
      }
      this.invalidateSeerPlan(false);
      return { type: "shop", index: currentTarget.index } as GameAction;
    }

    const futureShops = this.seerFutureShopForecast();
    const futureHit = futureShops.find((shop) => shop.some((id) => {
      const target = id ? targets.get(id) : undefined;
      return Boolean(target && this.seerEndgameTargetCopies(roster, id as UnitId)
        < this.targetDesiredCopies(id as UnitId));
    }));
    if (!futureHit || this.seerExtraRerolls >= SEER_ENDGAME_MAX_EXTRA_REROLLS) return null;
    const targetCost = Math.min(
      ...futureHit
        .filter((id): id is UnitId => Boolean(id && targets.has(id)))
        .filter((id) => this.seerEndgameTargetCopies(roster, id) < this.targetDesiredCopies(id))
        .map((id) => UNIT_DEFS[id].cost),
    );
    const free = state.freeRerollCharges > 0;
    if (
      !Number.isFinite(targetCost)
      || (!free && state.gold < 1)
      || state.gold - (free ? 0 : 1) - targetCost < reserve
    ) return null;
    const hasCapacity = engine.boardCount < engine.boardCap || state.bench.some((unit) => !unit);
    if (!hasCapacity) {
      const sale = this.seerEndgameBenchSale(roster);
      if (sale && this.benchCleanupSales < this.policy.maxStarCleanupSales) {
        this.invalidateSeerPlan(false);
        this.benchCleanupSales += 1;
        this.soldUnitIds.add(sale.unit.id);
        return { type: "sell", location: sale.location };
      }
      return null;
    }
    this.invalidateSeerPlan(false);
    this.seerExtraRerolls += 1;
    this.rerolls += 1;
    if (!free) {
      this.paidRerolls += 1;
      this.dryPaidRerolls += 1;
    }
    return { type: "reroll" };
  }

  private goOpportunityBenchSale(
    roster: OwnedEntry[],
    incomingId: UnitId,
  ) {
    const reservedUids = this.lateGameReserveUids(roster);
    const copiesById = roster.reduce<Partial<Record<UnitId, number>>>((copies, { unit }) => {
      copies[unit.id] = (copies[unit.id] || 0) + unitCopyValue(unit);
      return copies;
    }, {});
    const progressTier = (copies: number) => (
      copies >= 6 ? 3 : copies >= 3 ? 2 : copies > 0 ? 1 : 0
    );
    return roster
      .filter(({ unit, location }) => (
        location.zone === "bench"
        && unit.id !== incomingId
        && unit.star < 3
        && !reservedUids.has(unit.uid)
      ))
      .sort((left, right) => {
        const leftCopies = copiesById[left.unit.id] || 0;
        const rightCopies = copiesById[right.unit.id] || 0;
        return progressTier(leftCopies) - progressTier(rightCopies)
          || leftCopies - rightCopies
          || left.unit.star - right.unit.star
          || this.targetPriority(left.unit.id) - this.targetPriority(right.unit.id)
          || this.unitScore(left.unit, roster) - this.unitScore(right.unit, roster)
          || left.unit.uid - right.unit.uid;
      })[0] || null;
  }

  private goOpportunityStarForgeAction(
    roster: OwnedEntry[],
    targets: readonly GoOpportunityTarget[],
    reserve: number,
  ): GameAction | null {
    const { engine } = this.bridge;
    const { state } = engine;
    if (state.round < STAR_FORGE_MIN_ROUND) return null;
    const targetById = new Map(targets.map((target) => [target.id, target]));
    const hasImmediateTargetPurchase = state.shop.some((id) => {
      if (!id) return false;
      const target = targetById.get(id);
      const { cost } = UNIT_DEFS[id];
      if (
        !target
        || target.copies >= (target.desiredStar === 3 ? 9 : 3)
        || target.completionShopIndex === null
        || state.gold < cost
        || state.gold - cost < reserve
      ) return false;
      const hasCapacity = engine.boardCount < engine.boardCap
        || state.bench.some((unit) => !unit);
      return hasCapacity || Boolean(this.goOpportunityBenchSale(roster, id));
    });
    if (hasImmediateTargetPurchase) return null;
    const gainById = new Map<UnitId, number>();
    const gainFor = (id: UnitId) => {
      const target = targetById.get(id);
      if (target) return target.learnedValue;
      const cached = gainById.get(id);
      if (cached !== undefined) return cached;
      const gain = this.goCompletedUnitModelGain(roster, id);
      gainById.set(id, gain);
      return gain;
    };
    const unlockCost = engine.isStarForgeUnlocked ? 0 : engine.starForgeUnlockCost;
    const candidate = roster
      .filter(({ unit }) => unit.star < 3)
      .flatMap((entry) => {
        const upgradeCost = engine.getStarForgeUpgradeCost(entry.unit);
        const learnedGain = gainFor(entry.unit.id);
        if (
          upgradeCost === null
          || learnedGain <= 0
          || state.gold - unlockCost - upgradeCost
            < reserve + STAR_FORGE_MIN_SURPLUS
        ) return [];
        return [{
          entry,
          upgradeCost,
          learnedGain,
          target: targetById.get(entry.unit.id),
        }];
      })
      .sort((left, right) => (
        Number(Boolean(right.target)) - Number(Boolean(left.target))
        || right.entry.unit.star - left.entry.unit.star
        || (right.target?.copies || 0) - (left.target?.copies || 0)
        || right.learnedGain / right.upgradeCost - left.learnedGain / left.upgradeCost
        || right.learnedGain - left.learnedGain
        || Number(right.entry.location.zone === "board")
          - Number(left.entry.location.zone === "board")
        || left.entry.unit.uid - right.entry.unit.uid
      ))[0];
    if (!candidate) return null;
    this.invalidateSeerPlan(false);
    if (!engine.isStarForgeUnlocked) return { type: "starForge" };
    return { type: "starForge", location: candidate.entry.location };
  }

  /**
   * Go may finish its validated macro with a large surplus. Re-evaluate every
   * purchasable unit using the learned combat model, then convert deterministic
   * near-term shop availability into a 3-star project before opening combat.
   */
  private goOpportunityInvestmentAction(roster: OwnedEntry[]): GameAction | null {
    const { engine } = this.bridge;
    const { state } = engine;
    if (
      this.style !== "go"
      || this.informationMode !== "oracle"
      || state.round < 18
      || state.playerLevel < 10
      || !this.goOpportunityWindowOpen(roster)
      || (this.seerPlan && !this.seerMacroActionsComplete())
    ) return null;

    const futureShops = this.seerFutureShopForecast(GO_OPPORTUNITY_SHOP_LOOKAHEAD);
    const targets = this.goPlanningTargets(roster, futureShops);
    const reachableTargets = targets.filter(({ completionShopIndex }) => (
      completionShopIndex !== null
    ));

    const targetById = new Map(reachableTargets.map((target) => [target.id, target]));
    const wounded = state.hp <= this.policy.woundedHpThreshold;
    if (wounded) {
      this.goOpportunitySafeInvestment = false;
    } else if (this.goOpportunitySafeInvestment !== true) {
      const currentScore = this.rolloutConfidence(roster);
      this.goOpportunitySafeInvestment = currentScore >= this.policy.safeWinRolloutScore;
    }
    const reserve = this.goOpportunitySafeInvestment ? this.goldReserve(false, 0) : 0;
    const starForge = this.goOpportunityStarForgeAction(roster, targets, reserve);
    if (starForge) return starForge;
    if (reachableTargets.length === 0) return null;
    const currentTarget = state.shop.flatMap((id, index) => {
      if (!id) return [];
      const target = targetById.get(id);
      if (
        !target
        || target.copies >= (target.desiredStar === 3 ? 9 : 3)
        || state.gold < UNIT_DEFS[id].cost
        || state.gold - UNIT_DEFS[id].cost < reserve
      ) return [];
      const oneStarCopies = roster.filter(({ unit }) => (
        unit.id === id && unit.star === 1
      )).length;
      return [{ id, index, target, oneStarCopies }];
    }).sort((left, right) => (
      Number(right.oneStarCopies >= 2) - Number(left.oneStarCopies >= 2)
      || Number(right.target.copies >= 6) - Number(left.target.copies >= 6)
      || right.target.currentShopHits - left.target.currentShopHits
      || right.target.score - left.target.score
      || left.index - right.index
    ))[0];

    if (currentTarget) {
      const hasCapacity = engine.boardCount < engine.boardCap || state.bench.some((unit) => !unit);
      if (!hasCapacity) {
        const sale = this.goOpportunityBenchSale(roster, currentTarget.id);
        if (!sale) return null;
        this.pendingPurchase = { index: currentTarget.index, id: currentTarget.id };
        this.invalidateSeerPlan(false);
        this.benchCleanupSales += 1;
        this.soldUnitIds.add(sale.unit.id);
        return { type: "sell", location: sale.location };
      }
      this.invalidateSeerPlan(false);
      return { type: "shop", index: currentTarget.index };
    }

    if (this.goOpportunityRerolls >= GO_OPPORTUNITY_MAX_REROLLS) return null;
    const incompleteIds = new Set(reachableTargets
      .filter(({ copies, desiredStar }) => copies < (desiredStar === 3 ? 9 : 3))
      .map(({ id }) => id));
    const futureHit = futureShops.find((shop) => shop.some((id) => (
      Boolean(id && incompleteIds.has(id))
    )));
    if (!futureHit) return null;
    const targetCost = Math.min(...futureHit
      .filter((id): id is UnitId => Boolean(id && incompleteIds.has(id)))
      .map((id) => UNIT_DEFS[id].cost));
    const free = state.freeRerollCharges > 0;
    if (
      !Number.isFinite(targetCost)
      || (!free && state.gold < 1)
      || state.gold - (free ? 0 : 1) - targetCost < reserve
    ) return null;

    this.invalidateSeerPlan(false);
    this.goOpportunityRerolls += 1;
    this.rerolls += 1;
    if (!free) {
      this.paidRerolls += 1;
      this.dryPaidRerolls += 1;
    }
    return { type: "reroll" };
  }

  private continueGoOpportunityInvestment(roster: OwnedEntry[]) {
    const pendingPurchase = this.pendingPurchaseAction();
    if (pendingPurchase) {
      this.goOpportunityInvestmentInProgress = true;
      return pendingPurchase;
    }
    const investment = this.goOpportunityInvestmentAction(roster);
    this.goOpportunityInvestmentInProgress = Boolean(investment);
    if (!investment) this.goOpportunitySafeInvestment = null;
    return investment;
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
    optimizeLineup = true,
  ) {
    const requestedCombatHz = this.rolloutCombatHz;
    const planning = {
      plannedLineupKey: this.plannedLineupKey,
      plannedLineupUids: [...this.plannedLineupUids],
      plannedLineupUnits: new Map(this.plannedLineupUnits),
      plannedLineupScore: this.plannedLineupScore,
      plannedLineupRandomState: this.plannedLineupRandomState,
      plannedFormation: this.plannedFormation,
      plannedBoardSlots: new Map(this.plannedBoardSlots),
      rescueLineupLocked: this.rescueLineupLocked,
      lineageUnitIds: [...this.lineageUnitIds],
      lineageFormation: this.lineageFormation,
      rolloutVariantLimit: this.rolloutVariantLimit,
      rolloutCombatHz: this.rolloutCombatHz,
      previousLineupSnapshot: this.previousLineupSnapshot,
    };
    try {
      if (exactOnly) {
        this.rolloutVariantLimit = 1;
        this.rolloutCombatHz = requestedCombatHz >= EXACT_COMBAT_HZ
          ? EXACT_COMBAT_HZ
          : requestedCombatHz;
      } else this.rolloutCombatHz = Math.max(20, Math.min(
        EXACT_COMBAT_HZ,
        Math.round(combatHz),
      ));
      this.plannedLineupKey = "";
      this.plannedLineupUids = [];
      this.plannedLineupUnits.clear();
      this.plannedLineupScore = Number.NEGATIVE_INFINITY;
      this.plannedLineupRandomState = null;
      if (optimizeLineup) {
        this.rolloutTargetLineup(roster);
      } else {
        this.plannedLineupScore = this.rolloutLineupScore(
          this.targetLineup(roster),
          this.plannedFormation,
        );
        this.plannedLineupRandomState = this.bridge.engine.getRandomState();
      }
      return this.plannedLineupScore;
    } finally {
      this.plannedLineupKey = planning.plannedLineupKey;
      this.plannedLineupUids = planning.plannedLineupUids;
      this.plannedLineupUnits = planning.plannedLineupUnits;
      this.plannedLineupScore = planning.plannedLineupScore;
      this.plannedLineupRandomState = planning.plannedLineupRandomState;
      this.plannedFormation = planning.plannedFormation;
      this.plannedBoardSlots = planning.plannedBoardSlots;
      this.rescueLineupLocked = planning.rescueLineupLocked;
      this.lineageUnitIds = planning.lineageUnitIds;
      this.lineageFormation = planning.lineageFormation;
      this.rolloutVariantLimit = planning.rolloutVariantLimit;
      this.rolloutCombatHz = planning.rolloutCombatHz;
      this.previousLineupSnapshot = planning.previousLineupSnapshot;
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
        rolloutScore: this.previewRosterRollout(
          plan.roster,
          false,
          Math.min(30, this.rolloutCombatHz),
          !plan.candidate.completesMerge,
        ),
      }))
      .sort((left, right) => right.rolloutScore - left.rolloutScore
        || right.heuristicScore - left.heuristicScore);
    const finalists = screened
      .slice(0, this.planningMode === "training"
        ? 1
        : this.rolloutCombatHz >= EXACT_COMBAT_HZ ? 2 : 1)
      .map((plan) => ({
        ...plan,
        rolloutScore: this.previewRosterRollout(
          plan.roster,
          true,
          this.rolloutCombatHz,
          this.rolloutCombatHz >= EXACT_COMBAT_HZ || plan.candidate.completesMerge,
        ),
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
    if (
      this.style === "go"
      && state.round >= 18
      && state.playerLevel < 10
      && state.hp > this.policy.criticalHpThreshold
    ) {
      return { type: "buyXp" } as GameAction;
    }
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
      && !this.usesOraclePlanner()
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
      && roster.some(({ unit: owned }) => (
        owned.uid !== unit.uid && owned.id === unit.id && owned.star === 3
      ))
    ));
    const pressureSales = underBenchPressure
      ? this.expendableInterestEntries(roster, desired)
        .filter(({ location }) => location.zone === "bench")
      : [];
    const sale = Array.from(new Map(
      [...completedDuplicates, ...pressureSales, ...emergencyProjectSales]
        .map((entry) => [entry.unit.uid, entry]),
    ).values())
      .sort((left, right) => this.targetPriority(left.unit.id)
        - this.targetPriority(right.unit.id)
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
                levelScore = this.previewRosterRollout(
                  roster,
                  false,
                  Math.min(30, this.rolloutCombatHz),
                );
              } else levelScore = Number.NEGATIVE_INFINITY;
            } finally {
              state.playerLevel = currentLevel;
            }
          }
          upgradeScore = levelScore;
        }

        const candidate = this.shopCandidates(roster, false)[0] || null;
        let purchaseScore = Number.NEGATIVE_INFINITY;
        if (candidate && (candidate.id !== sale.unit.id || candidate.completesMerge)) {
          purchaseScore = this.previewRosterRollout(
            this.replacementRoster(roster, candidate, sale),
            false,
            Math.min(30, this.rolloutCombatHz),
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
    this.plannedLineupRandomState = null;
    this.plannedBoardSlots.clear();
    this.rescueLineupLocked = false;
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
    if (this.rescueLineupLocked) {
      const plannedMove = Array.from(this.plannedBoardSlots.entries()).map(([uid, slot]) => {
        const current = roster.find(({ unit }) => unit.uid === uid);
        if (!current || (current.location.zone === "board" && current.location.index === slot)) return null;
        if (
          current.location.zone === "bench"
          && !this.bridge.engine.state.board[slot]
          && this.bridge.engine.boardCount >= this.bridge.engine.boardCap
        ) {
          this.plannedBoardSlots.clear();
          this.rescueLineupLocked = false;
          return { current: null, slot };
        }
        return { current, slot };
      }).find(Boolean);
      if (plannedMove) {
        if (!plannedMove.current) {
          this.rescueLineupLocked = false;
          return null;
        }
        return {
          type: "move",
          from: plannedMove.current.location,
          to: { zone: "board", index: plannedMove.slot },
        } as GameAction;
      }
      this.rescueLineupLocked = false;
      return null;
    }
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

    if (this.plannedBoardSlots.size > 0) {
      const plannedMove = Array.from(this.plannedBoardSlots.entries()).map(([uid, slot]) => {
        const current = this.ownedEntries().find(({ unit }) => unit.uid === uid);
        if (!current || (current.location.zone === "board" && current.location.index === slot)) return null;
        return { current, slot };
      }).find(Boolean);
      if (plannedMove) {
        return {
          type: "move",
          from: plannedMove.current.location,
          to: { zone: "board", index: plannedMove.slot },
        } as GameAction;
      }
      return null;
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
    if (this.rescueLineupLocked) return false;
    const { engine } = this.bridge;
    const { state } = engine;
    const rescueStateKey = JSON.stringify({
      round: state.round,
      level: state.playerLevel,
      boardCap: engine.boardCap,
      randomState: engine.getRandomState(),
      roster: roster
        .map(({ unit, location }) => (
          `${location.zone}:${unit.uid}:${unit.id}:${unit.star}`
        ))
        .sort(),
    });
    if (this.rescueSearchStateKey === rescueStateKey) return false;
    this.rescueSearchStateKey = rescueStateKey;
    this.rescueSearchCompleted = false;
    const cap = this.bridge.engine.boardCap;
    if (
      this.planningMode !== "evolution"
      || roster.length <= cap
    ) {
      return false;
    }
    const lateRescueSearch = this.bridge.engine.state.round >= 48;
    const woundedGoRescueSearch = this.style === "go"
      && state.hp <= this.policy.woundedHpThreshold;
    const woundedRescueSearch = this.style !== "seer"
      && state.hp <= this.policy.woundedHpThreshold;
    const expandedRescueSearch = lateRescueSearch
      || woundedRescueSearch
      || woundedGoRescueSearch;
    // A wounded board is exactly where a 20Hz screen is most dangerous: a
    // coarse rollout can both bless a losing board and reject a one-swap win.
    // Use the battle timestep for this bounded rescue search; ordinary
    // planning remains on the cheaper rollout timestep.
    const exactRescueSearch = !this.usesLearnedCombatPlanner()
      && (lateRescueSearch || woundedRescueSearch);
    const boardForRescueCheck = this.bridge.engine.state.board.map((unit) => (
      unit ? roster.find(({ unit: owned }) => owned.uid === unit.uid) || null : null
    ));
    const currentBoardLineup = boardForRescueCheck.flatMap((entry) => (entry ? [entry] : []));
    const currentBoardScore = !expandedRescueSearch
      ? Number.POSITIVE_INFINITY
      : this.usesLearnedCombatPlanner()
        ? this.rolloutLineupScore(currentBoardLineup, "go_canonical")
        : this.rolloutBoardScore(
          boardForRescueCheck,
          false,
          exactRescueSearch ? EXACT_COMBAT_HZ : this.rolloutCombatHz,
        );
    const currentBoardUnsafe = expandedRescueSearch
      && boardForRescueCheck.filter(Boolean).length === cap
      && currentBoardScore < this.policy.safeWinRolloutScore;
    const lateStarRescuePotential = lateRescueSearch
        && state.hp <= this.policy.woundedHpThreshold
        && state.board.some((unit) => Boolean(unit && unit.star < 3))
        && state.bench.some((unit) => Boolean(unit && unit.star === 3));
    const rescueCombatHz = exactRescueSearch
      && (currentBoardUnsafe || lateStarRescuePotential)
      ? EXACT_COMBAT_HZ
      : this.rolloutCombatHz;
    if (
      !currentBoardUnsafe
      && !lateStarRescuePotential
      && (
        this.rolloutConfidence(roster) >= this.policy.safeWinRolloutScore
        || (exactRescueSearch && currentBoardScore >= this.policy.safeWinRolloutScore)
      )
    ) {
      return false;
    }

    const current = this.rolloutTargetLineup(roster);
    const currentUids = new Set(current.map(({ unit }) => unit.uid));
    const committedGoWin = this.usesLearnedCombatPlanner()
      && current.length === cap
      && this.plannedLineupScore >= RESCUE_MIN_WIN_SCORE
      && this.plannedLineupUids.length === cap
      && this.plannedLineupUids.every((uid) => currentUids.has(uid))
      && this.plannedBoardSlots.size === cap;
    if (committedGoWin) {
      // rolloutTargetLineup has already 60Hz-verified and committed this Go
      // genome. Do not make it survive a second, lower-fidelity 20Hz screen.
      this.rescueLineupLocked = true;
      this.rescueSearchCompleted = true;
      return true;
    }
    const lineupKey = (lineup: OwnedEntry[]) => (
      this.usesLearnedCombatPlanner()
        ? rosterShapeSignature(lineup)
        : lineup
          .map(({ unit }) => unit.uid)
          .sort((left, right) => left - right)
          .join(",")
    );
    const combinations = new Map<string, OwnedEntry[]>();
    const selected: OwnedEntry[] = [];
    const addCombination = () => {
      const lineup = [...selected];
      const key = lineupKey(lineup);
      if (!combinations.has(key)) combinations.set(key, lineup);
    };
    const collectByUid = (start: number) => {
      if (selected.length === cap) {
        addCombination();
        return;
      }
      const needed = cap - selected.length;
      for (let index = start; index <= roster.length - needed; index += 1) {
        selected.push(roster[index]);
        collectByUid(index + 1);
        selected.pop();
      }
    };
    let goGroupedRoster: OwnedEntry[][] = [];
    let goGroupedSuffixCounts: number[] = [];
    if (this.usesLearnedCombatPlanner()) {
      const groups = new Map<string, OwnedEntry[]>();
      roster.forEach((entry) => {
        const key = `${entry.unit.id}:${entry.unit.star}`;
        const group = groups.get(key) || [];
        group.push(entry);
        groups.set(key, group);
      });
      goGroupedRoster = Array.from(groups.values()).map((group) => group.sort(
        (left, right) => Number(left.location.zone === "bench")
          - Number(right.location.zone === "bench")
          || left.unit.uid - right.unit.uid,
      ));
      goGroupedSuffixCounts = Array(goGroupedRoster.length + 1).fill(0) as number[];
      for (let index = goGroupedRoster.length - 1; index >= 0; index -= 1) {
        goGroupedSuffixCounts[index] = goGroupedSuffixCounts[index + 1]
          + goGroupedRoster[index].length;
      }
      const collectByComposition = (groupIndex: number, needed: number) => {
        if (needed === 0) {
          addCombination();
          return;
        }
        if (
          groupIndex >= goGroupedRoster.length
          || goGroupedSuffixCounts[groupIndex] < needed
        ) return;
        const group = goGroupedRoster[groupIndex];
        const minimum = Math.max(0, needed - goGroupedSuffixCounts[groupIndex + 1]);
        const maximum = Math.min(group.length, needed);
        for (let count = minimum; count <= maximum; count += 1) {
          selected.push(...group.slice(0, count));
          collectByComposition(groupIndex + 1, needed - count);
          selected.splice(selected.length - count, count);
        }
      };
      collectByComposition(0, cap);
    } else {
      collectByUid(0);
    }

    const targeted = new Map<string, { lineup: OwnedEntry[]; heuristic: number }>();
    const directSwapKeys = new Set<string>();
    const addTargeted = (lineup: OwnedEntry[], directSwap = false) => {
      if (lineup.length !== cap) return;
      const key = lineupKey(lineup);
      if (directSwap) directSwapKeys.add(key);
      if (targeted.has(key)) return;
      targeted.set(key, {
        lineup,
        heuristic: this.lineupHeuristicScore(lineup),
      });
    };
    addTargeted(current);
    const reserves = roster.filter(({ unit }) => !currentUids.has(unit.uid));
    // A rescue search must test direct board/bench swaps even when the cheap
    // heuristic ranks the incoming unit below the current lineup. Late waves
    // often need exactly that swap (for example, a 3-star support replacing a
    // 2-star frontline holder), so dropping these candidates before combat
    // simulation makes the oracle blind to legal winning states.
    if (expandedRescueSearch && currentBoardUnsafe) {
      const directSwaps = new Map<string, OwnedEntry[]>();
      reserves.forEach((reserve) => {
        current.forEach((_, index) => {
          const candidate = [...current];
          candidate[index] = reserve;
          directSwaps.set(lineupKey(candidate), candidate);
        });
      });
      const directSwapCandidates = Array.from(directSwaps.values());
      if (lateRescueSearch || woundedRescueSearch) {
        directSwapCandidates.forEach((lineup) => addTargeted(lineup, true));
      } else {
        const screenedDirectSwaps = new Map<string, OwnedEntry[]>();
        const scoredDirectSwaps = directSwapCandidates.map((lineup) => ({
          lineup,
          heuristic: this.lineupHeuristicScore(lineup),
          model: this.goModelScore(lineup, "go_canonical"),
        }));
        [...scoredDirectSwaps]
          .sort((left, right) => right.heuristic - left.heuristic)
          .slice(0, GO_RESCUE_DIRECT_SWAP_SCREEN_LIMIT)
          .forEach(({ lineup }) => screenedDirectSwaps.set(lineupKey(lineup), lineup));
        [...scoredDirectSwaps]
          .sort((left, right) => right.model - left.model)
          .slice(0, GO_RESCUE_DIRECT_SWAP_SCREEN_LIMIT)
          .forEach(({ lineup }) => screenedDirectSwaps.set(lineupKey(lineup), lineup));
        screenedDirectSwaps.forEach((lineup) => addTargeted(lineup, true));
      }
    }

    if (expandedRescueSearch && currentBoardUnsafe && reserves.length >= 2) {
      const twoSwapCandidates = [] as OwnedEntry[][];
      for (let left = 0; left < reserves.length; left += 1) {
        for (let right = left + 1; right < reserves.length; right += 1) {
          for (let first = 0; first < current.length; first += 1) {
            for (let second = first + 1; second < current.length; second += 1) {
              const candidate = [...current];
              candidate[first] = reserves[left];
              candidate[second] = reserves[right];
              twoSwapCandidates.push(candidate);
            }
          }
        }
      }
      twoSwapCandidates
        .sort((left, right) => this.lineupHeuristicScore(right) - this.lineupHeuristicScore(left))
        .slice(0, RESCUE_TWO_SWAP_CANDIDATE_LIMIT)
        .forEach((lineup) => addTargeted(lineup));
    }

    const goModelFinalistKeys = new Set<string>();
    if (this.usesLearnedCombatPlanner()) {
      type ModelBeamNode = {
        lineup: OwnedEntry[];
        lastGroupIndex: number;
        lastGroupCount: number;
        model: number;
        heuristic: number;
      };
      let beam: ModelBeamNode[] = [{
        lineup: [],
        lastGroupIndex: -1,
        lastGroupCount: 0,
        model: Number.NEGATIVE_INFINITY,
        heuristic: Number.NEGATIVE_INFINITY,
      }];
      for (let depth = 0; depth < cap; depth += 1) {
        const expanded = new Map<string, ModelBeamNode>();
        beam.forEach((parent) => {
          const firstGroup = Math.max(0, parent.lastGroupIndex);
          for (let groupIndex = firstGroup; groupIndex < goGroupedRoster.length; groupIndex += 1) {
            const group = goGroupedRoster[groupIndex];
            const used = groupIndex === parent.lastGroupIndex ? parent.lastGroupCount : 0;
            if (used >= group.length) continue;
            const lineup = [...parent.lineup, group[used]];
            const remainingHere = group.length - used - 1;
            const remainingLater = goGroupedSuffixCounts[groupIndex + 1];
            if (lineup.length + remainingHere + remainingLater < cap) continue;
            const key = rosterShapeSignature(lineup);
            if (expanded.has(key)) continue;
            expanded.set(key, {
              lineup,
              lastGroupIndex: groupIndex,
              lastGroupCount: used + 1,
              model: this.goModelScore(lineup, "go_canonical"),
              heuristic: this.lineupHeuristicScore(lineup),
            });
          }
        });
        beam = Array.from(expanded.values())
          .sort((left, right) => right.model - left.model
            || right.heuristic - left.heuristic)
          .slice(0, GO_RESCUE_MODEL_BEAM_WIDTH);
        if (beam.length === 0) break;
      }
      beam.slice(0, GO_RESCUE_MODEL_CANDIDATE_LIMIT).forEach(({ lineup }) => {
        const key = lineupKey(lineup);
        goModelFinalistKeys.add(key);
        addTargeted(lineup);
      });
    }

    const heuristicFinalists = Array.from(combinations.values())
      .map((lineup) => ({ lineup, heuristic: this.lineupHeuristicScore(lineup) }))
      .sort((left, right) => right.heuristic - left.heuristic)
      .slice(0, RESCUE_HEURISTIC_CANDIDATE_LIMIT);
    heuristicFinalists.forEach(({ lineup, heuristic }) => {
      const key = lineupKey(lineup);
      if (!targeted.has(key)) targeted.set(key, { lineup, heuristic });
    });
    const finalists = Array.from(targeted.values());

    const entryByUid = new Map(roster.map((entry) => [entry.unit.uid, entry]));
    const currentBoard = this.bridge.engine.state.board.map((unit) => (
      unit ? entryByUid.get(unit.uid) || null : null
    ));
    const directBoards = new Map<string, Array<OwnedEntry | null>>();
    const directBoardKey = (board: Array<OwnedEntry | null>) => board
      .map((entry, slot) => (entry ? `${slot}:${entry.unit.uid}` : ""))
      .filter(Boolean)
      .join(",");
    const addDirectBoard = (board: Array<OwnedEntry | null>) => {
      if (board.filter(Boolean).length !== cap) return;
      const key = directBoardKey(board);
      if (!directBoards.has(key)) directBoards.set(key, board);
    };
    const benchEntries = roster.filter(({ location }) => location.zone === "bench");
    const occupiedSlots = currentBoard
      .map((entry, slot) => (entry ? slot : -1))
      .filter((slot) => slot >= 0);
    if (lateRescueSearch || woundedRescueSearch) {
      addDirectBoard(currentBoard);
      benchEntries.forEach((incoming) => {
        occupiedSlots.forEach((slot) => {
          const board = [...currentBoard];
          board[slot] = incoming;
          addDirectBoard(board);
        });
      });
    }

    if ((lateRescueSearch || woundedRescueSearch) && benchEntries.length >= 2) {
      const directTwoSwaps = [] as Array<{
        board: Array<OwnedEntry | null>;
        heuristic: number;
      }>;
      for (let left = 0; left < benchEntries.length; left += 1) {
        for (let right = left + 1; right < benchEntries.length; right += 1) {
          for (let first = 0; first < occupiedSlots.length; first += 1) {
            for (let second = first + 1; second < occupiedSlots.length; second += 1) {
              const board = [...currentBoard];
              board[occupiedSlots[first]] = benchEntries[left];
              board[occupiedSlots[second]] = benchEntries[right];
              directTwoSwaps.push({
                board,
                heuristic: this.lineupHeuristicScore(board.flatMap((entry) => (
                  entry ? [entry] : []
                ))),
              });
            }
          }
        }
      }
      directTwoSwaps
        .sort((left, right) => right.heuristic - left.heuristic)
        .slice(0, RESCUE_TWO_SWAP_CANDIDATE_LIMIT)
        .forEach(({ board }) => addDirectBoard(board));
    }

    const interactiveLateSeerRescue = this.interactiveRuntime
      && this.style === "seer"
      && lateRescueSearch;
    const directBoardCandidates = (() => {
      const boards = Array.from(directBoards.values());
      if (!interactiveLateSeerRescue || boards.length <= INTERACTIVE_SEER_RESCUE_DIRECT_BOARD_LIMIT) {
        return boards;
      }
      const currentKey = directBoardKey(currentBoard);
      const currentCandidate = directBoards.get(currentKey);
      const ranked = boards
        .filter((board) => directBoardKey(board) !== currentKey)
        .sort((left, right) => this.lineupHeuristicScore(right.flatMap((entry) => (
          entry ? [entry] : []
        ))) - this.lineupHeuristicScore(left.flatMap((entry) => (
          entry ? [entry] : []
        ))));
      return [
        ...(currentCandidate ? [currentCandidate] : []),
        ...ranked.slice(0, INTERACTIVE_SEER_RESCUE_DIRECT_BOARD_LIMIT - 1),
      ];
    })();
    const rescueDirectBoardCandidates = (() => {
      const fullExactCoverage = this.style === "survival"
        || state.hp <= this.policy.criticalHpThreshold;
      if (
        !exactRescueSearch
        || fullExactCoverage
        || directBoardCandidates.length <= NORMAL_RESCUE_DIRECT_SHORTLIST_LIMIT
      ) return directBoardCandidates;
      const currentKey = directBoardKey(currentBoard);
      const ranked = directBoardCandidates.map((board) => ({
        board,
        key: directBoardKey(board),
        heuristic: this.lineupHeuristicScore(board.flatMap((entry) => (
          entry ? [entry] : []
        ))),
        coarse: directBoardKey(board) === currentKey
          ? currentBoardScore
          : this.rolloutBoardScore(board, false, this.rolloutCombatHz),
      }));
      const shortlistedBoards = new Map<string, Array<OwnedEntry | null>>();
      const add = (board: Array<OwnedEntry | null>) => {
        const key = directBoardKey(board);
        if (!shortlistedBoards.has(key)) shortlistedBoards.set(key, board);
      };
      const coarseLimit = Math.floor((NORMAL_RESCUE_DIRECT_SHORTLIST_LIMIT - 1) / 2);
      const heuristicLimit = NORMAL_RESCUE_DIRECT_SHORTLIST_LIMIT - 1 - coarseLimit;
      add(currentBoard);
      [...ranked]
        .sort((left, right) => right.coarse - left.coarse || right.heuristic - left.heuristic)
        .slice(0, coarseLimit)
        .forEach(({ board }) => add(board));
      [...ranked]
        .sort((left, right) => right.heuristic - left.heuristic || right.coarse - left.coarse)
        .slice(0, heuristicLimit)
        .forEach(({ board }) => add(board));
      return Array.from(shortlistedBoards.values());
    })();

    const previousVariantLimit = this.rolloutVariantLimit;
    this.rolloutVariantLimit = 1;
    type RescueCandidate = {
      lineup: OwnedEntry[];
      formation: FormationProfile;
      rollout: number;
      heuristic: number;
      model: number;
      board: Array<OwnedEntry | null> | null;
    };
    let best: RescueCandidate | null = null;
    const goScreened: RescueCandidate[] = [];
    let exactRescueWinFound = false;
    const consider = (candidate: RescueCandidate) => {
      if (this.usesLearnedCombatPlanner()) goScreened.push(candidate);
      if (
        !best
        || candidate.rollout > best.rollout
        || (candidate.rollout === best.rollout && candidate.heuristic > best.heuristic)
      ) best = candidate;
    };
    try {
      if (!this.usesLearnedCombatPlanner()) for (const board of rescueDirectBoardCandidates) {
        const lineup = board.flatMap((entry) => (entry ? [entry] : []));
        const rollout = this.rolloutBoardScore(board, false, rescueCombatHz);
        const heuristic = this.lineupHeuristicScore(lineup);
        consider({
          lineup,
          formation: this.lineageFormation,
          rollout,
          heuristic,
          model: Number.NEGATIVE_INFINITY,
          board,
        });
        // Once a physically executable board is exactly verified as a win,
        // there is no reason to spend more time enumerating weaker rescues.
        if (rescueCombatHz === EXACT_COMBAT_HZ && rollout >= RESCUE_MIN_WIN_SCORE) {
          exactRescueWinFound = true;
          break;
        }
      }
      for (const { lineup, heuristic } of interactiveLateSeerRescue ? [] : finalists) {
        for (const formation of this.formationProfileIds()) {
          const placements = formationPlacements(lineup, formation);
          const executable = placements.every(({ entry, slot }) => (
            entry.location.zone !== "bench"
            || Boolean(this.bridge.engine.state.board[slot])
            || this.bridge.engine.boardCount < this.bridge.engine.boardCap
          ));
          if (expandedRescueSearch && !executable) continue;
          const rollout = this.rolloutLineupScore(
            lineup,
            formation,
            false,
            rescueCombatHz,
          );
          const model = this.usesLearnedCombatPlanner()
            ? this.goModelScore(lineup, formation)
            : Number.NEGATIVE_INFINITY;
          consider({ lineup, formation, rollout, heuristic, model, board: null });
          if (rescueCombatHz === EXACT_COMBAT_HZ && rollout >= RESCUE_MIN_WIN_SCORE) {
            exactRescueWinFound = true;
            break;
          }
        }
        if (exactRescueWinFound) break;
      }
    } finally {
      this.rolloutVariantLimit = previousVariantLimit;
    }
    if (this.usesLearnedCombatPlanner()) {
      const robustCandidates = new Map<string, RescueCandidate>();
      const addRobustCandidate = (candidate: RescueCandidate) => {
        robustCandidates.set(
          `${lineupKey(candidate.lineup)}/${candidate.formation}`,
          candidate,
        );
      };
      goScreened
        .sort((left, right) => right.rollout - left.rollout
          || right.heuristic - left.heuristic)
        .slice(0, GO_MODEL_ROLLOUT_SURVIVOR_LIMIT)
        .forEach(addRobustCandidate);
      goScreened
        .filter((candidate) => goModelFinalistKeys.has(lineupKey(candidate.lineup)))
        .sort((left, right) => right.model - left.model
          || right.rollout - left.rollout)
        .slice(0, GO_MODEL_ROLLOUT_SURVIVOR_LIMIT)
        .forEach(addRobustCandidate);
      goScreened
        .filter((candidate) => directSwapKeys.has(lineupKey(candidate.lineup)))
        .sort((left, right) => right.heuristic - left.heuristic
          || right.rollout - left.rollout)
        .slice(0, GO_MODEL_ROLLOUT_SURVIVOR_LIMIT)
        .forEach(addRobustCandidate);
      best = null;
      for (const candidate of Array.from(robustCandidates.values())) {
        const exactCandidate = {
          ...candidate,
          rollout: this.rolloutLineupScore(
            candidate.lineup,
            candidate.formation,
            true,
            EXACT_COMBAT_HZ,
          ),
        };
        if (
          !best
          || exactCandidate.rollout > best.rollout
          || (
            exactCandidate.rollout === best.rollout
            && exactCandidate.heuristic > best.heuristic
          )
        ) best = exactCandidate;
        if (exactCandidate.rollout >= RESCUE_MIN_WIN_SCORE) break;
      }
    }
    if (!best || best.rollout < RESCUE_MIN_WIN_SCORE) return false;

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
    const rescuePlacements = best.board
      ? best.board.flatMap((entry, slot) => (
        entry ? [{ entry, slot }] : []
      ))
      : formationPlacements(best.lineup, best.formation);
    this.plannedBoardSlots = new Map(
      rescuePlacements.map(({ entry, slot }) => [entry.unit.uid, slot] as [number, number]),
    );
    this.rescueLineupLocked = true;
    this.rescueSearchCompleted = true;
    this.lineageUnitIds = best.lineup.map(({ unit }) => unit.id);
    this.lineageFormation = best.formation;
    this.plannedLineupScore = best.board || this.usesLearnedCombatPlanner()
      ? best.rollout
      : this.rolloutLineupScore(best.lineup, best.formation);
    this.plannedLineupRandomState = this.bridge.engine.getRandomState();
    this.confidenceKey = "";
    return true;
  }

  private nextPreparationAction(): GameAction | null {
    const { engine } = this.bridge;
    const { state } = engine;
    if (this.plannedRound !== state.round) this.resetPreparation(state.round);
    this.preparationActions += 1;

    const roster = this.ownedEntries();
    let rescuePlanPreserved = false;
    if (this.rescueLineupLocked) {
      const rescueAction = this.formationAction(roster);
      if (rescueAction) return rescueAction;
      if (this.plannedLineupIsOnBoard(roster)) {
        if (this.style === "go") {
          const opportunityInvestment = this.continueGoOpportunityInvestment(roster);
          if (opportunityInvestment) {
            // Batch deterministic shop investment behind the already verified
            // lineup, then re-search and re-form only once when it is exhausted.
            this.rescueLineupLocked = true;
            return opportunityInvestment;
          }
          if (this.searchRescueLineup(roster)) {
            const finalFormation = this.formationAction(roster);
            if (finalFormation) return finalFormation;
          }
        }
        // A locked rescue lineup is already battle-ready, but it may still
        // contain a funded one-star/two-star project. Give the late-game
        // forge a chance before opening combat; the forge invalidates the
        // cached lineup so the next pass re-scores the upgraded roster.
        const lateForge = this.style === "go" ? null : this.starForgeAction(roster);
        if (lateForge) return lateForge;
        const rescueScore = this.rolloutConfidence(roster);
        const canContinueFundedDevelopment = (
          this.usesBalancedEconomy()
          || this.style === "highroll"
        )
          && this.terminalDevelopmentWindowOpen(roster, rescueScore);
        if (!canContinueFundedDevelopment) {
          return engine.boardCount > 0 ? { type: "battle" } : null;
        }
        // A wounded rescue board is a verified floor, not a reason to stop
        // investing. Balanced and highroll can keep the guaranteed board on
        // the field while spending only the late-game reserve on upgrades.
        this.rescueLineupLocked = false;
        rescuePlanPreserved = true;
      }
      if (!rescuePlanPreserved) this.invalidateFinalLineup();
      if (this.style === "seer") this.invalidateSeerPlan(false);
    }

    if (this.style === "go" && this.goOpportunityInvestmentInProgress) {
      const opportunityInvestment = this.continueGoOpportunityInvestment(roster);
      if (opportunityInvestment) return opportunityInvestment;
    }

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
    const preparationActionLimit = this.style === "go"
      ? GO_PREPARATION_ACTION_LIMIT
      : PREPARATION_ACTION_LIMIT;
    const lateDevelopmentPressure = (
      this.style === "survival"
      || this.style === "balanced"
      || this.style === "highroll"
      || this.style === "fair"
    )
      && state.playerLevel >= 10
      && state.round >= 18
      && state.gold > this.goldReserve(false, 0) + 10
      && this.lateGameDevelopmentIncomplete(roster);
    const repeatedStateLimit = this.style === "go"
      ? 3
      : NORMAL_REPEATED_STATE_LIMIT;
    const repeatedStateExhausted = visits >= repeatedStateLimit
      && (!lateDevelopmentPressure || this.preparationActions >= ECONOMY_ACTION_LIMIT);
    if ((this.preparationActions >= preparationActionLimit || repeatedStateExhausted) && engine.boardCount > 0) {
      // The action/visit guard is a last-resort battle fallback, but a funded
      // late-game forge is still a deterministic power increase. Spend that
      // one action before giving up, otherwise a long reroll session can make
      // the AI open combat with an unused upgrade already in its roster.
      const lateForge = this.style === "go" ? null : this.starForgeAction(roster);
      if (lateForge) return lateForge;
      const formation = this.formationAction(roster);
      if (formation) return formation;
      if (
        this.plannedLineupUids.length > 0
        && !this.plannedLineupIsOnBoard(roster)
      ) {
        // Never spend a cached positive score on a lineup that was not
        // physically deployed. Replan from the real board before opening.
        this.invalidateFinalLineup();
        if (this.style === "seer") this.invalidateSeerPlan(false);
        const fallbackFormation = this.formationAction(this.ownedEntries());
        if (fallbackFormation) return fallbackFormation;
      }
      return { type: "battle" };
    }

    this.observeStabilizationStrength(roster);
    // The oracle route may intentionally accept a forecast loss. When the route
    // expects a win, however, even a small negative current score is a known
    // failure and must trigger replanning immediately. The previous late-game
    // and -500 guards let early near-losses pass through as if they were an
    // intentional economy loss.
    const seerPlanExpectedWin = this.seerPlan?.steps?.[0]?.expectedBattleWon !== false;
    const seerPlanNeedsRescue = seerPlanExpectedWin
      || state.hp <= this.policy.woundedHpThreshold;
    const seerPlanFailureScore = seerPlanExpectedWin ? 0 : -500;
    const exactSeerPlanFailure = Boolean(
      this.style === "seer"
      && this.seerPlan
      && (
        seerPlanNeedsRescue
        && this.rolloutConfidence(roster) < seerPlanFailureScore
      ),
    );
    if (exactSeerPlanFailure) {
      // Keep the route eligible for a fresh future plan. A current-state
      // mismatch is not evidence that the whole 60/70-round route is doomed.
      this.invalidateSeerPlan(false);
    }
    const woundedRescueWindow = this.style !== "seer"
      && state.hp <= this.policy.woundedHpThreshold;
    const oracleRescueWindow = this.style === "seer" && state.round >= 48;
    if (
      engine.boardCount >= engine.boardCap
      && (woundedRescueWindow || oracleRescueWindow)
      && this.searchRescueLineup(roster)
    ) {
      this.invalidateSeerPlan();
      const rescueFormation = this.formationAction(roster);
      if (rescueFormation && this.preparationActions < FORMATION_ACTION_LIMIT) {
        return rescueFormation;
      }
    }
    const pendingPurchase = this.pendingPurchaseAction();
    if (pendingPurchase) return pendingPurchase;
    const plannedSale = this.seerPlannedSaleAction();
    if (plannedSale) return plannedSale;
    // A legal board slot is immediate combat power; fill it before any economic action.
    const population = this.populationAction(roster);
    if (population) return population;
    if (this.seerPlan && state.playerLevel < this.seerPlan.firstStep.targetLevel) {
      const plannedUpgrade = this.upgradeAction();
      if (plannedUpgrade) return plannedUpgrade;
    }
    const plannedPurchase = this.seerPlannedPurchaseAction();
    if (plannedPurchase) return plannedPurchase;
    const starForge = this.style === "go" ? null : this.starForgeAction(roster);
    if (starForge) return starForge;
    const goOpportunityInvestment = this.continueGoOpportunityInvestment(roster);
    if (goOpportunityInvestment) return goOpportunityInvestment;
    const seerEndgameInvestment = this.seerEndgameInvestmentAction(roster);
    if (seerEndgameInvestment) return seerEndgameInvestment;
    const seerPlanEmergency = this.seerPlan
      && (
        state.hp <= this.policy.criticalHpThreshold
        || this.rolloutConfidence(roster) < this.policy.safeWinRolloutScore
      );
    if (!seerPlanEmergency && this.seerPlanHasSafePrefix()) {
      const plannedReroll = this.seerPlannedRerollAction();
      if (plannedReroll) return plannedReroll;
      if (this.seerMacroActionsComplete()) {
        this.finalizingEconomy = true;
        const formation = this.formationAction(roster);
        if (formation && this.formationBudgetAvailable()) return formation;
        if (engine.boardCount) return { type: "battle" };
      }
    }
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
    const fill = needsPopulation ? this.purchaseAction(roster, true) : null;
    if (fill) return fill;
    const fundingSale = this.preparationActions < ECONOMY_ACTION_LIMIT
      ? this.fundingSaleAction(roster, rolloutScore)
      : null;
    if (fundingSale) return fundingSale;
    const upgrade = this.upgradeAction();
    if (upgrade) return upgrade;
    if (
      this.style === "go"
      && state.round >= 18
      && state.playerLevel < 10
      && state.hp > this.policy.criticalHpThreshold
    ) {
      this.finalizingEconomy = true;
      const formation = this.formationAction(roster);
      if (formation && this.formationBudgetAvailable()) return formation;
      if (engine.boardCount) return { type: "battle" };
    }
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
    const rerollStrategy = this.rerollStrategy(roster, true);
    const seerEmergencyStabilization = this.style === "seer"
      && Boolean(this.seerPlan)
      && state.hp <= this.policy.criticalHpThreshold
      && rerollStrategy.rolloutScore < this.policy.safeWinRolloutScore;
    const needsStabilization = (
      !this.seerPlan
      || this.seer2EndgameOpen()
      || seerEmergencyStabilization
    ) && rerollStrategy.rolloutScore < this.policy.safeWinRolloutScore;
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
    if (this.rescueLineupLocked && formation) return formation;
    if (formation && this.formationBudgetAvailable()) return formation;
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
