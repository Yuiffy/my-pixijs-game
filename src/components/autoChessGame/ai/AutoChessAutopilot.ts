import {
  FINANCE_INTEREST_CAP,
  NORMAL_INTEREST_CAP,
  TRAITS,
  UNIT_DEFS,
  traitLevelForCount,
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
  resolveAutopilotPolicy,
  type AutopilotPolicy,
} from "./autopilotPolicy";

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
const ROLLOUT_CANDIDATE_LIMIT = 3;
const EVOLUTION_ELITE_LIMIT = 1;
const ROLLOUT_SEED_VARIANTS = 2;
const STARTER_ROLLOUT_BATTLES = 4;
const SHARED_ROLLOUT_CACHE_LIMIT = 50000;
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
  targetDuplicate: boolean;
  completesMerge: boolean;
  completesTrait: boolean;
  clearUpgrade: boolean;
};

type RerollMode = "bank" | "stabilize" | "upgrade_chase";

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

  private pendingPurchase: Pick<ShopCandidate, "index" | "id"> | null = null;

  private plannedLineupKey = "";

  private plannedLineupUids: number[] = [];

  private plannedLineupUnits = new Map<number, { id: UnitId; star: OwnedUnit["star"] }>();

  private plannedLineupScore = Number.NEGATIVE_INFINITY;

  private plannedFormation: FormationProfile = "human_midline";

  private lineageUnitIds: UnitId[] = [];

  private lineageFormation: FormationProfile = "human_midline";

  private rolloutScoreCache = new Map<string, number>();

  private confidenceKey = "";

  private confidenceScore = Number.NEGATIVE_INFINITY;

  private interestSales = 0;

  private benchCleanupSales = 0;

  private speculativeUnitIds = new Set<UnitId>();

  private finalizingEconomy = false;

  private finalReinvestments = 0;

  private rerollMode: RerollMode = "bank";

  private soldUnitIds = new Set<UnitId>();

  private preparationStateVisits = new Map<string, number>();

  private preparationStartGold = 0;

  private readonly policy: AutopilotPolicy;

  constructor(
    private readonly bridge: EngineBridge,
    private readonly planningMode: "evolution" | "heuristic" = "evolution",
    policy: Partial<AutopilotPolicy> = {},
  ) {
    this.policy = resolveAutopilotPolicy(policy);
  }

  public get isEnabled() {
    return this.enabled;
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
    const simulationBridge = new EngineBridge(this.bridge.engine.state.seed);
    simulationBridge.setConsoleLogging(false);
    simulationBridge.engine.state.starterChoices = [starter];
    simulationBridge.dispatch({ type: "starter", id: starter });
    const simulationPilot = new AutoChessAutopilot(simulationBridge, "heuristic", this.policy);
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

  private actionDelay(action: GameAction) {
    if (action.type === "battle") return 800;
    if (action.type === "move") return 260;
    if (action.type === "resultContinue") return 900;
    return 340;
  }

  private resetPreparation(round: number) {
    this.plannedRound = round;
    this.preparationStartGold = this.bridge.engine.state.gold;
    this.preparationActions = 0;
    this.rerolls = 0;
    this.paidRerolls = 0;
    this.pendingPurchase = null;
    this.plannedLineupKey = "";
    this.plannedLineupUids = [];
    this.plannedLineupUnits.clear();
    this.plannedLineupScore = Number.NEGATIVE_INFINITY;
    this.plannedFormation = this.lineageFormation;
    this.rolloutScoreCache.clear();
    this.confidenceKey = "";
    this.confidenceScore = Number.NEGATIVE_INFINITY;
    this.interestSales = 0;
    this.benchCleanupSales = 0;
    this.speculativeUnitIds.clear();
    this.finalizingEconomy = false;
    this.finalReinvestments = 0;
    this.rerollMode = "bank";
    this.soldUnitIds.clear();
    this.preparationStateVisits.clear();
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
    return definition.cost * 12 * STAR_POWER[unit.star]
      + unit.star * 6
      + uniquePartners * 7
      + Math.max(0, duplicateCount) * 4;
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
    const traitCounts = lineup.reduce<Partial<Record<TraitId, number>>>((counts, { unit }) => {
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
    return lineup.reduce((score, { unit }) => score + this.unitScore(unit, lineup), 0)
      + traitScore
      + roleScore;
  }

  private rolloutLineupScore(
    lineup: OwnedEntry[],
    formation: FormationProfile = this.lineageFormation,
  ) {
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
    const scores = Array.from({ length: ROLLOUT_SEED_VARIANTS }, (_, variant) => {
      const simulation = new AutoChessEngine(scenarioSeed(`${fixedScenario}/rollout:${variant}`));
      simulation.state = JSON.parse(JSON.stringify(sourceState));
      simulation.state.phase = "preparation";
      simulation.state.board.fill(null);
      simulation.state.selected = null;
      simulation.state.battle = null;
      simulation.state.result = null;
      this.setSimulationLineup(simulation, lineup, formation);
      simulation.startBattle();
      const battle = simulation.state.battle as BattleState | null;
      if (!battle) return Number.NEGATIVE_INFINITY;
      const cacheKey = [
        sourceState.starter,
        augments,
        wave.modifier,
        `rollout:${variant}`,
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
      const score = this.preparedCombatScore(simulation);
      this.rolloutScoreCache.set(cacheKey, score);
      sharedRolloutScoreCache.set(cacheKey, score);
      if (sharedRolloutScoreCache.size > SHARED_ROLLOUT_CACHE_LIMIT) {
        const oldest = sharedRolloutScoreCache.keys().next().value;
        if (oldest !== undefined) sharedRolloutScoreCache.delete(oldest);
      }
      return score;
    });
    return Math.min(...scores);
  }

  private setSimulationLineup(
    simulation: AutoChessEngine,
    lineup: OwnedEntry[],
    formation: FormationProfile = "human_midline",
  ) {
    simulation.state.board.fill(null);
    formationPlacements(lineup, formation).forEach(({ entry, slot }) => {
      simulation.state.board[slot] = { ...entry.unit, uid: 1000 + slot };
    });
  }

  private preparedCombatScore(simulation: AutoChessEngine) {
    if (simulation.state.phase === "preparation" && simulation.boardCount > 0) {
      simulation.startBattle();
    }
    if (simulation.state.phase !== "battle" || !simulation.state.battle) {
      return Number.NEGATIVE_INFINITY;
    }
    let steps = 0;
    while ((simulation.state.phase as GamePhase) === "battle" && steps < 1560) {
      simulation.update(1 / 60);
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
    const simulation = new AutoChessEngine(sourceState.seed + (sourceState.round + 1) * 1009);
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
    if (this.planningMode === "heuristic") {
      this.plannedLineupKey = key;
      this.plannedLineupUids = heuristic.map(({ unit }) => unit.uid);
      this.plannedLineupUnits = new Map(heuristic.map(({ unit }) => [
        unit.uid,
        { id: unit.id, star: unit.star },
      ]));
      this.plannedLineupScore = Number.NEGATIVE_INFINITY;
      this.plannedFormation = "human_midline";
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
    const financeChampion = generation
      .filter((genome) => (
        financeCount(genome.lineup) >= 4
        && genome.rollout >= this.policy.safeWinRolloutScore
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
    const key = `${this.bridge.engine.state.round}/${lineup
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

  private shopCandidates(roster: OwnedEntry[], needsPopulation = roster.length < this.bridge.engine.boardCap) {
    const { engine } = this.bridge;
    const { state } = engine;
    const lineup = this.targetLineup(roster);
    const lineupIds = new Set(lineup.map(({ unit }) => unit.id));
    const lineupTraitCounts = lineup.reduce<Record<string, number>>((counts, { unit }) => {
      UNIT_DEFS[unit.id].traits.forEach((trait) => {
        counts[trait] = (counts[trait] || 0) + 1;
      });
      return counts;
    }, {});
    const weakestLineupCost = Math.min(...lineup.map(({ unit }) => UNIT_DEFS[unit.id].cost), 5);
    const candidates = state.shop.flatMap((id, index) => {
      if (!id) return [];
      const definition = UNIT_DEFS[id];
      const sameUnits = roster.filter(({ unit }) => unit.id === id);
      const hasMaxStar = sameUnits.some(({ unit }) => unit.star === 3);
      const skipMaxStarDuplicate = this.policy.skipMaxStarDuplicatePurchases > 0 && hasMaxStar;
      if (skipMaxStarDuplicate && !needsPopulation) return [];
      const targetDuplicate = lineupIds.has(id) && !skipMaxStarDuplicate;
      const oneStarCopies = sameUnits.filter(({ unit }) => unit.star === 1).length;
      const completesMerge = !skipMaxStarDuplicate && oneStarCopies >= 2;
      const ownedCopies = sameUnits.reduce(
        (copies, { unit }) => copies + (unit.star === 1 ? 1 : unit.star === 2 ? 3 : 9),
        0,
      );
      const shopCopies = state.shop.filter((shopId) => shopId === id).length;
      const emptyBench = state.bench.filter((unit) => !unit).length;
      const canSpeculate = !needsPopulation
        && !skipMaxStarDuplicate
        && emptyBench >= this.policy.speculativePurchaseMinimumEmptyBench
        && (ownedCopies > 0 || shopCopies >= 2);
      const completesTrait = definition.traits.some((trait) => {
        const before = lineupTraitCounts[trait] || 0;
        return traitLevelForCount(TRAITS[trait], before + 1) > traitLevelForCount(TRAITS[trait], before);
      });
      const traitPartners = definition.traits.filter((trait) => (lineupTraitCounts[trait] || 0) > 0).length;
      const clearUpgrade = definition.cost >= weakestLineupCost + 2;
      const score = needsPopulation
        ? 100 - definition.cost * 4 + traitPartners * 5
        : definition.cost * 5
          + (targetDuplicate ? 45 : 0)
          + (completesMerge ? 90 : 0)
          + (completesTrait ? 42 : 0)
          + (canSpeculate ? 18 + Math.min(24, ownedCopies * 4) + (shopCopies - 1) * 8 : 0)
          + traitPartners * 6;
      if (
        !needsPopulation
        && !targetDuplicate
        && !completesMerge
        && !completesTrait
        && !clearUpgrade
        && !canSpeculate
      ) return [];
      const speculative = canSpeculate;
      const purchaseInterestRisk = completesMerge
        ? this.policy.mergePurchaseInterestTiersAtRisk
        : targetDuplicate || completesTrait || clearUpgrade
          ? this.policy.goodPurchaseInterestTiersAtRisk
          : 0;
      const reserve = this.goldReserve(needsPopulation, purchaseInterestRisk);
      if (state.gold < definition.cost) return [];
      if (state.gold - definition.cost < reserve && !canSpeculate && !completesMerge) return [];
      return [{
        index,
        id,
        score,
        speculative,
        targetDuplicate,
        completesMerge,
        completesTrait,
        clearUpgrade,
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

  private replacementAction(roster: OwnedEntry[]): GameAction | null {
    const { engine } = this.bridge;
    const { state } = engine;
    if (engine.boardCount < engine.boardCap || state.bench.some((unit) => !unit)) return null;

    const candidate = this.shopCandidates(roster)[0];
    if (!candidate) return null;
    const desiredUids = new Set(this.rolloutTargetLineup(roster).map(({ unit }) => unit.uid));
    const sellable = roster
      .filter(({ unit, location }) => location.zone === "bench"
        && !desiredUids.has(unit.uid)
        && unit.id !== candidate.id
        && unit.star === 1)
      .sort(
        (left, right) => this.unitScore(left.unit, roster) - this.unitScore(right.unit, roster)
          || left.unit.star - right.unit.star
          || left.unit.uid - right.unit.uid,
      );
    const sacrifice = sellable[0];
    if (!sacrifice) return null;

    const prospectiveUnit: OwnedUnit = { uid: -1, id: candidate.id, star: 1 };
    const prospectiveRoster = [
      ...roster,
      { unit: prospectiveUnit, location: { zone: "bench", index: -1 } as UnitLocation },
    ];
    if (this.unitScore(prospectiveUnit, prospectiveRoster) <= this.unitScore(sacrifice.unit, roster)) return null;

    this.pendingPurchase = { index: candidate.index, id: candidate.id };
    return { type: "sell", location: sacrifice.location };
  }

  private upgradeAction(): GameAction | null {
    const { engine } = this.bridge;
    const { state } = engine;
    const targetLevel = Math.min(10, 3 + Math.floor(
      (state.round + this.policy.targetLevelRoundOffset) / this.policy.targetLevelRoundDivisor,
    ));
    const cost = engine.upgradeCost;
    const reserve = this.goldReserve(false, this.policy.levelInterestTiersAtRisk);
    if (
      state.playerLevel < targetLevel
      && cost !== null
      && state.gold - cost >= reserve
    ) return { type: "buyXp" } as GameAction;
    return null;
  }

  private expendableInterestEntries(roster: OwnedEntry[], desired = this.rolloutTargetLineup(roster)) {
    const desiredUids = new Set(desired.map(({ unit }) => unit.uid));
    const weakestDesiredScore = Math.min(
      ...desired.map(({ unit }) => this.unitScore(unit, roster)),
      Number.POSITIVE_INFINITY,
    );
    const desiredIds = new Set(desired.map(({ unit }) => unit.id));
    return roster
      .filter(({ unit }) => {
        const relativeScore = this.unitScore(unit, roster) / Math.max(1, weakestDesiredScore);
        const futureReserve = desiredIds.has(unit.id)
          || (unit.star === 2 && relativeScore >= 0.65)
          || (unit.star === 3 && relativeScore >= 0.45);
        return (!futureReserve || this.speculativeUnitIds.has(unit.id))
        && !desiredUids.has(unit.uid)
        && this.unitScore(unit, roster) < weakestDesiredScore;
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
    const desiredUids = new Set(this.rolloutTargetLineup(roster).map(({ unit }) => unit.uid));
    const sale = roster
      .filter(({ unit, location }) => location.zone === "bench"
        && unit.star === 1
        && !desiredUids.has(unit.uid)
        && roster.some(({ unit: owned }) => owned.id === unit.id && owned.star === 3))
      .sort((left, right) => engine.getUnitSellValue(left.unit) - engine.getUnitSellValue(right.unit)
        || left.unit.uid - right.unit.uid)[0];
    if (!sale) return null;
    this.benchCleanupSales += 1;
    this.soldUnitIds.add(sale.unit.id);
    return { type: "sell", location: sale.location };
  }

  private interestSaleAction(roster: OwnedEntry[]): GameAction | null {
    const { engine } = this.bridge;
    const { state } = engine;
    const desired = this.rolloutTargetLineup(roster);
    if (
      state.hp <= 8
      || state.streak < 2
      || engine.boardCount < desired.length
      || Math.max(0, roster.length - desired.length) < this.policy.interestSaleMinimumBench
      || this.rolloutConfidence(roster) < this.policy.safeWinRolloutScore
    ) return null;
    const { step, cap } = this.interestRule();
    const currentInterest = this.interestAt(state.gold);
    if (currentInterest >= cap) return null;
    const expendable = this.expendableInterestEntries(roster, desired);
    const totalSaleValue = expendable.reduce(
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
    const plans = expendable.reduce<Map<number, InterestSalePlan>>((states, entry) => {
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
        || candidate.targetDuplicate
        || candidate.completesTrait
        || candidate.clearUpgrade
      ));
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
      if (!immediateUpgrade && !improvesCombat && losesInterest) continue;
      if (!immediateUpgrade && !improvesCombat && currentScore < this.policy.safeWinRolloutScore) continue;
      this.finalReinvestments += 1;
      if (candidate.speculative) this.speculativeUnitIds.add(candidate.id);
      this.invalidateFinalLineup();
      return { type: "shop", index: candidate.index };
    }
    return null;
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

  private nextPreparationAction(): GameAction | null {
    const { engine } = this.bridge;
    const { state } = engine;
    if (this.plannedRound !== state.round) this.resetPreparation(state.round);
    this.preparationActions += 1;

    const preparationSignature = JSON.stringify({
      finalizing: this.finalizingEconomy,
      gold: state.gold,
      shop: state.shop,
      board: state.board.map((unit) => (unit ? `${unit.id}:${unit.star}` : null)),
      bench: state.bench.map((unit) => (unit ? `${unit.id}:${unit.star}` : null)),
    });
    const visits = (this.preparationStateVisits.get(preparationSignature) || 0) + 1;
    this.preparationStateVisits.set(preparationSignature, visits);
    if ((this.preparationActions >= 48 || visits >= 3) && engine.boardCount > 0) {
      return { type: "battle" };
    }

    const roster = this.ownedEntries();
    const pendingPurchase = this.pendingPurchaseAction();
    if (pendingPurchase) return pendingPurchase;
    const needsPopulation = roster.length < engine.boardCap
      && this.rolloutConfidence(roster) < this.policy.safeWinRolloutScore;
    const fill = needsPopulation ? this.purchaseAction(roster, true) : null;
    if (fill) return fill;
    const replacement = this.preparationActions < 24 ? this.replacementAction(roster) : null;
    if (replacement) return replacement;
    const upgrade = this.upgradeAction();
    if (upgrade) return upgrade;
    const purchase = this.preparationActions < 24 ? this.purchaseAction(roster, false) : null;
    if (purchase) return purchase;
    const paidRerollLimit = state.hp <= this.policy.criticalHpThreshold
      ? this.policy.criticalPaidRerolls
      : state.hp <= this.policy.woundedHpThreshold
        ? this.policy.woundedPaidRerolls
        : this.policy.healthyPaidRerolls;
    const rerollStrategy = this.rerollStrategy(roster);
    const strategyPaidRerollLimit = rerollStrategy.mode === "upgrade_chase"
      ? paidRerollLimit + this.policy.upgradeChaseBonusRerolls
      : paidRerollLimit;
    const canUseFreeReroll = state.freeRerollCharges > 0 && this.rerolls < 6;
    const healthRiskBonus = state.hp <= this.policy.criticalHpThreshold
      ? 4
      : state.hp <= this.policy.woundedHpThreshold
        ? 2
        : 0;
    const interestTiersAtRisk = rerollStrategy.mode === "stabilize"
      ? this.policy.stabilizeRerollInterestTiersAtRisk + healthRiskBonus
      : rerollStrategy.mode === "upgrade_chase"
        ? this.policy.upgradeChaseRerollInterestTiersAtRisk
        : this.policy.bankRerollInterestTiersAtRisk;
    const canUsePaidReroll = this.paidRerolls < strategyPaidRerollLimit
      && state.gold - 1 >= this.goldReserve(false, interestTiersAtRisk);
    if (
      this.preparationActions < 24
      && (canUseFreeReroll || canUsePaidReroll)
      && state.shop.some(Boolean)
    ) {
      this.rerolls += 1;
      if (!canUseFreeReroll) this.paidRerolls += 1;
      return { type: "reroll" };
    }
    this.finalizingEconomy = true;
    const cleanup = this.benchCleanupAction(this.ownedEntries());
    if (cleanup) return cleanup;
    const interestSale = this.interestSaleAction(this.ownedEntries());
    if (interestSale) return interestSale;
    const reinvestment = this.preparationActions >= 24
      ? this.finalReinvestmentAction(this.ownedEntries())
      : null;
    if (reinvestment) return reinvestment;
    const formation = this.formationAction(this.ownedEntries());
    if (formation && this.preparationActions < 36) return formation;
    if (engine.boardCount) return { type: "battle" };
    return null;
  }

  private augmentAction(): GameAction | null {
    const { augmentChoices } = this.bridge.engine.state;
    const preferenceRank = (id: (typeof augmentChoices)[number]) => {
      const rank = AUGMENT_PREFERENCE.indexOf(id as (typeof AUGMENT_PREFERENCE)[number]);
      return rank < 0 ? AUGMENT_PREFERENCE.length : rank;
    };
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
