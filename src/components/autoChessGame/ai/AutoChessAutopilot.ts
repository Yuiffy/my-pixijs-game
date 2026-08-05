import { UNIT_DEFS, type StarterId, type UnitId } from "../core/gameData";
import type { GamePhase, OwnedUnit, UnitLocation } from "../core/gameTypes";
import { EngineBridge, type GameAction } from "../phaser/EngineBridge";

const STARTER_PREFERENCE: StarterId[] = [
  "mature_start",
  "dance_start",
  "ranger_start",
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
    return STARTER_PREFERENCE.find((id) => choices.includes(id)) || choices[0] || null;
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

  private shopCandidates(roster: OwnedEntry[]) {
    const { engine } = this.bridge;
    const { state } = engine;
    const needsPopulation = roster.length < engine.boardCap;
    const reserve = this.goldReserve(needsPopulation);
    const ownedIds = new Set(roster.map(({ unit }) => unit.id));
    const ownedTraits = new Set(roster.flatMap(({ unit }) => UNIT_DEFS[unit.id].traits));
    const candidates = state.shop.flatMap((id, index) => {
      if (!id) return [];
      const definition = UNIT_DEFS[id];
      if (state.gold - definition.cost < reserve) return [];
      const duplicate = ownedIds.has(id);
      const traitPartners = definition.traits.filter((trait) => ownedTraits.has(trait)).length;
      const score = needsPopulation
        ? 100 - definition.cost * 4 + traitPartners * 5
        : definition.cost * 5 + (duplicate ? 30 : 0) + traitPartners * 12;
      if (!needsPopulation && !duplicate && !traitPartners && definition.cost < 3) return [];
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
    const desiredUids = new Set(this.targetLineup(roster).map(({ unit }) => unit.uid));
    const sellable = roster
      .filter(({ unit, location }) => location.zone === "bench" && !desiredUids.has(unit.uid) && unit.id !== candidate.id)
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

  private formationAction(roster: OwnedEntry[]): GameAction | null {
    const desired = this.targetLineup(roster);
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
      && state.gold - 1 >= this.goldReserve();
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
    if (engine.boardCount) return { type: "battle" };
    return null;
  }

  private augmentAction(): GameAction | null {
    const { augmentChoices } = this.bridge.engine.state;
    const preferred = AUGMENT_PREFERENCE.find((id) => augmentChoices.includes(id));
    const index = preferred ? augmentChoices.indexOf(preferred) : 0;
    return augmentChoices[index] ? { type: "augment", index } as GameAction : null;
  }
}
