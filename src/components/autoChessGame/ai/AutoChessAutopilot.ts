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

const MELEE_SLOTS = [5, 11, 17, 23, 4, 10, 16, 22, 3, 9];
const RANGED_SLOTS = [0, 6, 12, 18, 1, 7, 13, 19, 2, 8];
const STAR_POWER = { 1: 1, 2: 2.6, 3: 7 } as const;
const ROLLOUT_CANDIDATE_LIMIT = 4;
const SAFE_WIN_ROLLOUT_SCORE = 10300;
const STARTER_ROLLOUT_BATTLES = 3;

type OwnedEntry = {
  unit: OwnedUnit;
  location: UnitLocation;
};

type ShopCandidate = {
  index: number;
  id: UnitId;
  score: number;
};

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

  private plannedLineupScore = Number.NEGATIVE_INFINITY;

  private confidenceKey = "";

  private confidenceScore = Number.NEGATIVE_INFINITY;

  private interestSales = 0;

  constructor(private readonly bridge: EngineBridge) {}

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
    const simulationPilot = new AutoChessAutopilot(simulationBridge);
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
    this.preparationActions = 0;
    this.rerolls = 0;
    this.paidRerolls = 0;
    this.pendingPurchase = null;
    this.plannedLineupKey = "";
    this.plannedLineupUids = [];
    this.plannedLineupScore = Number.NEGATIVE_INFINITY;
    this.confidenceKey = "";
    this.confidenceScore = Number.NEGATIVE_INFINITY;
    this.interestSales = 0;
  }

  private goldReserve(needsPopulation = false) {
    const { hp, round } = this.bridge.engine.state;
    if (needsPopulation) return 0;
    if (hp <= 8) return 2;
    if (hp <= 12) return 4;
    return Math.min(12, Math.max(3, round));
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

  private rolloutLineupScore(lineup: OwnedEntry[]) {
    const sourceState = this.bridge.engine.state;
    const simulation = new AutoChessEngine(sourceState.seed + sourceState.round * 1009);
    simulation.state = JSON.parse(JSON.stringify(sourceState));
    simulation.state.phase = "preparation";
    simulation.state.board.fill(null);
    simulation.state.selected = null;
    simulation.state.battle = null;
    simulation.state.result = null;

    this.setSimulationLineup(simulation, lineup);

    return this.preparedCombatScore(simulation);
  }

  private setSimulationLineup(simulation: AutoChessEngine, lineup: OwnedEntry[]) {
    simulation.state.board.fill(null);
    const melee = lineup.filter(({ unit }) => UNIT_DEFS[unit.id].attackType === "melee");
    const ranged = lineup.filter(({ unit }) => UNIT_DEFS[unit.id].attackType === "ranged");
    [...melee.map((entry, index) => ({ entry, slot: MELEE_SLOTS[index] })),
      ...ranged.map((entry, index) => ({ entry, slot: RANGED_SLOTS[index] }))]
      .forEach(({ entry, slot }) => {
        simulation.state.board[slot] = { ...entry.unit };
      });
  }

  private preparedCombatScore(simulation: AutoChessEngine) {
    if (simulation.state.phase !== "preparation" || simulation.boardCount === 0) {
      return Number.NEGATIVE_INFINITY;
    }
    simulation.startBattle();
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
    if (roster.length <= cap) return roster;
    const rosterKey = roster
      .map(({ unit }) => `${unit.uid}:${unit.id}:${unit.star}`)
      .sort()
      .join("|");
    const key = `${this.bridge.engine.state.round}/${cap}/${rosterKey}`;
    if (key === this.plannedLineupKey) {
      const byUid = new Map(roster.map((entry) => [entry.unit.uid, entry]));
      const planned = this.plannedLineupUids.flatMap((uid) => byUid.get(uid) || []);
      if (planned.length === cap) return planned;
    }

    const heuristic = this.targetLineup(roster);
    const candidates = new Map<string, OwnedEntry[]>();
    const addCandidate = (lineup: OwnedEntry[]) => {
      if (lineup.length !== cap) return;
      const lineupKey = lineup.map(({ unit }) => unit.uid).sort((left, right) => left - right).join(",");
      candidates.set(lineupKey, lineup);
    };
    addCandidate(heuristic);
    addCandidate(roster.filter(({ location }) => location.zone === "board"));

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
      const matching = roster
        .filter(({ unit }) => UNIT_DEFS[unit.id].traits.includes(trait))
        .sort((left, right) => this.unitScore(right.unit, roster) - this.unitScore(left.unit, roster));
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

    const scored = finalists
      .map((lineup) => ({
        lineup,
        rollout: this.rolloutLineupScore(lineup),
        heuristic: this.lineupHeuristicScore(lineup),
      }))
      .sort((left, right) => right.rollout - left.rollout || right.heuristic - left.heuristic);
    const selected = scored[0]?.lineup || heuristic;
    this.plannedLineupKey = key;
    this.plannedLineupUids = selected.map(({ unit }) => unit.uid);
    this.plannedLineupScore = scored[0]?.rollout ?? Number.NEGATIVE_INFINITY;
    return selected;
  }

  private interestRule() {
    const financeLevel = this.bridge.engine.getActiveTraits()
      .find((trait) => trait.id === "finance")?.level || 0;
    return financeLevel >= 2
      ? { step: 4, cap: FINANCE_INTEREST_CAP }
      : { step: 5, cap: NORMAL_INTEREST_CAP };
  }

  private interestAt(gold: number) {
    const { step, cap } = this.interestRule();
    return Math.min(cap, Math.floor(Math.max(0, gold) / step));
  }

  private losesInterest(cost: number) {
    const { gold } = this.bridge.engine.state;
    return this.interestAt(gold - cost) < this.interestAt(gold);
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

  private shouldBankInterest(cost: number, roster: OwnedEntry[], urgent = false) {
    const { engine } = this.bridge;
    if (
      urgent
      || engine.state.hp <= 8
      || engine.state.streak < 2
      || engine.boardCount < engine.boardCap
      || !this.losesInterest(cost)
    ) return false;
    return this.rolloutConfidence(roster) >= SAFE_WIN_ROLLOUT_SCORE;
  }

  private shopCandidates(roster: OwnedEntry[]) {
    const { engine } = this.bridge;
    const { state } = engine;
    const needsPopulation = roster.length < engine.boardCap;
    const reserve = this.goldReserve(needsPopulation);
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
      if (state.gold - definition.cost < reserve) return [];
      const sameUnits = roster.filter(({ unit }) => unit.id === id);
      const targetDuplicate = lineupIds.has(id);
      const oneStarCopies = sameUnits.filter(({ unit }) => unit.star === 1).length;
      const completesMerge = oneStarCopies >= 2;
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
          + traitPartners * 6;
      if (!needsPopulation && !targetDuplicate && !completesMerge && !completesTrait && !clearUpgrade) return [];
      return [{ index, id, score } satisfies ShopCandidate];
    }).sort((left, right) => right.score - left.score || left.index - right.index);
    return candidates;
  }

  private purchaseAction(roster: OwnedEntry[]): GameAction | null {
    const { engine } = this.bridge;
    const { state } = engine;
    const hasCapacity = engine.boardCount < engine.boardCap || state.bench.some((unit) => !unit);
    if (!hasCapacity) return null;

    const candidates = this.shopCandidates(roster);

    return candidates[0] ? { type: "shop", index: candidates[0].index } as GameAction : null;
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
    const targetLevel = Math.min(10, 3 + Math.floor((state.round + 1) / 3));
    const cost = engine.upgradeCost;
    const reserve = this.goldReserve();
    if (
      state.playerLevel < targetLevel
      && cost !== null
      && state.gold - cost >= reserve
    ) return { type: "buyXp" } as GameAction;
    return null;
  }

  private interestSaleAction(roster: OwnedEntry[]): GameAction | null {
    const { engine } = this.bridge;
    const { state } = engine;
    if (
      this.interestSales >= 1
      || state.hp <= 8
      || state.streak < 2
      || engine.boardCount < engine.boardCap
      || !state.bench.every(Boolean)
      || this.rolloutConfidence(roster) < SAFE_WIN_ROLLOUT_SCORE
    ) return null;
    const { step, cap } = this.interestRule();
    const currentInterest = this.interestAt(state.gold);
    if (currentInterest >= cap) return null;
    const nextThreshold = (currentInterest + 1) * step;
    const desiredUids = new Set(this.rolloutTargetLineup(roster).map(({ unit }) => unit.uid));
    const idCounts = roster.reduce<Partial<Record<UnitId, number>>>((counts, { unit }) => {
      counts[unit.id] = (counts[unit.id] || 0) + 1;
      return counts;
    }, {});
    const sale = roster
      .filter(({ unit, location }) => location.zone === "bench"
        && unit.star === 1
        && !desiredUids.has(unit.uid)
        && idCounts[unit.id] === 1
        && engine.getUnitSellValue(unit) === nextThreshold - state.gold)
      .sort((left, right) => engine.getUnitSellValue(left.unit) - engine.getUnitSellValue(right.unit)
        || this.unitScore(left.unit, roster) - this.unitScore(right.unit, roster)
        || left.unit.uid - right.unit.uid)[0];
    if (!sale) return null;
    this.interestSales += 1;
    return { type: "sell", location: sale.location };
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

    const melee = desired.filter(({ unit }) => UNIT_DEFS[unit.id].attackType === "melee");
    const ranged = desired.filter(({ unit }) => UNIT_DEFS[unit.id].attackType === "ranged");
    const placements = [
      ...melee.map((entry, index) => ({ uid: entry.unit.uid, slot: MELEE_SLOTS[index] })),
      ...ranged.map((entry, index) => ({ uid: entry.unit.uid, slot: RANGED_SLOTS[index] })),
    ];
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

    const roster = this.ownedEntries();
    const pendingPurchase = this.pendingPurchaseAction();
    if (pendingPurchase) return pendingPurchase;
    const fill = roster.length < engine.boardCap ? this.purchaseAction(roster) : null;
    if (fill) return fill;
    const replacement = this.preparationActions < 24 ? this.replacementAction(roster) : null;
    if (replacement) return replacement;
    const upgrade = this.upgradeAction();
    if (upgrade) return upgrade;
    const purchase = this.preparationActions < 24 ? this.purchaseAction(roster) : null;
    if (purchase) return purchase;
    const paidRerollLimit = state.hp <= 8 ? 4 : state.hp <= 12 ? 2 : 1;
    const canUseFreeReroll = state.freeRerollCharges > 0 && this.rerolls < 6;
    const canUsePaidReroll = this.paidRerolls < paidRerollLimit
      && state.gold - 1 >= this.goldReserve()
      && !this.shouldBankInterest(1, roster);
    if (
      this.preparationActions < 24
      && (canUseFreeReroll || canUsePaidReroll)
      && state.shop.some(Boolean)
    ) {
      this.rerolls += 1;
      if (!canUseFreeReroll) this.paidRerolls += 1;
      return { type: "reroll" };
    }
    const formation = this.formationAction(this.ownedEntries());
    if (formation && this.preparationActions < 36) return formation;
    const interestSale = this.interestSaleAction(this.ownedEntries());
    if (interestSale) return interestSale;
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
