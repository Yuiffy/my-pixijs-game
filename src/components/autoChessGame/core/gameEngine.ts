/* eslint-disable prefer-destructuring, implicit-arrow-linebreak, nonblock-statement-body-position, function-paren-newline */

import {
  AUGMENTS,
  AugmentId,
  CAMPAIGN_ROUNDS,
  MAX_PLAYER_LEVEL,
  PASSIVE_UPGRADE_DISCOUNT,
  PLAYER_LEVEL_CONFIG,
  PlayerLevel,
  SHOP_TIER_COUNTS,
  SHOP_UNITS,
  STARTERS,
  STARTER_OFFER_SIZE,
  STARTING_PLAYER_LEVEL,
  StarterId,
  TRAITS,
  TraitId,
  UNIT_DEFS,
  UnitId,
  bookLevelForPlayerLevel,
  upgradeCostForLevel,
  waveForRound,
  tierOddsForLevel,
  traitLevelForCount,
} from "./gameData";

export type GamePhase =
  | "title"
  | "preparation"
  | "battle"
  | "result"
  | "augment"
  | "gameover";
export type Team = "player" | "enemy";

const CONTACT_ATTACK_BUFFER = 12;
const PLACEMENT_MARGIN = 8;
const TARGET_LOCK_DURATION = 0.45;
const TARGET_SWITCH_DISTANCE = 28;
const AVOID_LOOK_AHEAD = 78;
const AVOIDANCE_RADIUS = 118;
const STUCK_RECOVERY_DELAY = 0.65;
const STUCK_RECOVERY_DURATION = 0.42;
const SEPARATION_PASSES = 5;

export interface OwnedUnit {
  uid: number;
  id: UnitId;
  star: 1 | 2 | 3;
}

export interface UnitLocation {
  zone: "board" | "bench";
  index: number;
}

export interface BattleEffect {
  kind: "line" | "ring" | "burst" | "text" | "heal";
  x: number;
  y: number;
  x2?: number;
  y2?: number;
  color: string;
  text?: string;
  life: number;
  maxLife: number;
  size?: number;
}

export interface Fighter {
  fid: string;
  unitId: UnitId;
  team: Team;
  star: 1 | 2 | 3;
  x: number;
  y: number;
  radius: number;
  hp: number;
  maxHp: number;
  shield: number;
  attack: number;
  armor: number;
  range: number;
  attackInterval: number;
  moveSpeed: number;
  cooldown: number;
  energy: number;
  maxEnergy: number;
  energyPerSecond: number;
  energyOnAttack: number;
  energyOnHit: number;
  energyStyle: import("./gameData").EnergyProfileId;
  attackType: import("./gameData").AttackType;
  stun: number;
  burnTime: number;
  burnDps: number;
  burnSourceFid: string | null;
  lifesteal: number;
  burnOnHitPower: number;
  spiceBurnOnHitPower: number;
  dodgeChance: number;
  dwarfMember: boolean;
  gluttonyHolder: boolean;
  growthStacks: number;
  emberMember: boolean;
  emberAttackPerStack: number;
  emberAttackStacks: number;
  emberAttackStackCap: number;
  gen27Member: boolean;
  gen27Buffed: boolean;
  matureMember: boolean;
  matureMoveFloor: number;
  matureAttackSpeed: number;
  matureAttackSpeedCurrent: number;
  slowTime: number;
  weakenTime: number;
  weakenArmorPenalty: number;
  baseAttack: number;
  baseAttackInterval: number;
  baseMoveSpeed: number;
  yueGangMember: boolean;
  lowHealthBonus: number;
  critChance: number;
  critMultiplier: number;
  castRefund: number;
  secondWindUsed: boolean;
  enraged: boolean;
  attackPulse: number;
  facingX: -1 | 1;
  attackTargetX: number;
  attackTargetY: number;
  hitPulse: number;
  applePieShotsRemaining: number;
  applePieShotTimer: number;
  jumpPending: boolean;
  jumpDelay: number;
  jumpTime: number;
  jumpDuration: number;
  jumpFromX: number;
  jumpFromY: number;
  jumpToX: number;
  jumpToY: number;
  targetFid: string | null;
  targetLock: number;
  lastNavX: number;
  lastNavY: number;
  lastTargetDistance: number;
  stuckTime: number;
  avoidSide: -1 | 1;
  avoidTime: number;
  damageDealt: number;
  healingDone: number;
  shieldingDone: number;
  damageTaken: number;
  alive: boolean;
}

export type RankingMetric = "damage" | "support" | "taken";

export interface BattleState {
  elapsed: number;
  limit: number;
  player: Fighter[];
  enemy: Fighter[];
  effects: BattleEffect[];
  fieldMedicTimer: number;
  gluttonyTimer: number;
  emberTimer: number;
  yueGangTimer: number;
  matureTimer: number;
  banner: string;
  bannerTimer: number;
  rankingOpen: boolean;
  rankingMetric: RankingMetric;
}

export interface RoundResult {
  won: boolean;
  headline: string;
  detail: string;
  income: number;
  upgradeDiscount: number;
  damage: number;
}

export interface ToastState {
  text: string;
  tone: "info" | "good" | "bad";
  time: number;
}

export interface AugmentSelection {
  round: number;
  id: AugmentId;
}

export interface StarterSelection {
  id: StarterId;
}

export interface GameState {
  phase: GamePhase;
  seed: number;
  visualTime: number;
  round: number;
  maxRounds: number;
  endlessUnlocked: boolean;
  hp: number;
  maxHp: number;
  gold: number;
  playerLevel: PlayerLevel;
  upgradeRemaining: number;
  score: number;
  bestScore: number;
  streak: number;
  victories: number;
  starter: StarterId | null;
  starterChoices: StarterId[];
  starterHistory: StarterSelection[];
  board: Array<OwnedUnit | null>;
  bench: Array<OwnedUnit | null>;
  shop: Array<UnitId | null>;
  shopLocked: boolean;
  selected: UnitLocation | null;
  augments: AugmentId[];
  augmentHistory: AugmentSelection[];
  augmentChoices: AugmentId[];
  incomeBonus: number;
  paydayDebtRounds: number;
  battle: BattleState | null;
  result: RoundResult | null;
  finalWon: boolean;
  toast: ToastState | null;
}

const BOARD_SIZE = 24;
const BENCH_SIZE = 8;
const SHOP_SIZE = 5;
const STAR_SCALE = [0, 1, 1.68, 2.82];
const BATTLE_BOUNDS = { left: 52, right: 1068, top: 145, bottom: 625 };
const NORI_APPLE_PIE_SHOTS = 12;
const NORI_APPLE_PIE_INTERVAL = 0.1;
const NORI_APPLE_PIE_DAMAGE_MULTIPLIER = 0.38;

export const fighterVisualRadius = (unitId: UnitId, star: 1 | 2 | 3) => {
  if (unitId === "rift_tyrant") return 43;
  return 26 + (star - 1) * 3;
};

interface RandomSource {
  next: () => number;
  pick: <T>(items: T[]) => T;
}

const createSeededRandom = (seed: number): RandomSource => {
  let value = Math.abs(Math.trunc(seed)) % 4294967296 || 1831565813;
  const next = () => {
    value = (value * 1664525 + 1013904223) % 4294967296;
    return value / 4294967296;
  };
  return {
    next,
    pick: <T>(items: T[]) => items[Math.floor(next() * items.length)],
  };
};

const loadBestScore = () => {
  if (typeof window === "undefined") return 0;
  const value = Number(
    window.localStorage.getItem("rift-line-best-score") || 0,
  );
  return Number.isFinite(value) ? value : 0;
};

const freshSeed = () =>
  Math.floor((Date.now() + Math.random() * 2147483647) % 4294967296);

const emptySlots = <T>(size: number): Array<T | null> =>
  Array.from({ length: size }, () => null);

const starterEffects: Record<StarterId, {
  hpBonus?: number;
  goldBonus?: number;
  shieldMultiplier?: number;
  burnMultiplier?: number;
  firstWinGold?: number;
  trafficLifesteal?: number;
  matureShieldBonus?: number;
  startingEnergy?: number;
  danceAttackSpeed?: number;
  rangedAttackSpeed?: number;
  freeFirstReroll?: boolean;
}> = {
  mature_start: { goldBonus: 1, matureShieldBonus: 0.06 },
  blaze: { burnMultiplier: 1.4, firstWinGold: 2 },
  traffic_start: { goldBonus: 1, trafficLifesteal: 0.06 },
  bastion: { hpBonus: 4, shieldMultiplier: 1.3 },
  dance_start: { startingEnergy: 10, danceAttackSpeed: 0.08 },
  ranger_start: { rangedAttackSpeed: 0.1, freeFirstReroll: true },
};

export class AutoChessEngine {
  public state: GameState;

  private rng: RandomSource;

  private uid = 1;

  constructor(seed = freshSeed()) {
    this.rng = createSeededRandom(seed);
    this.state = this.createInitialState(seed, loadBestScore());
    this.state.starterChoices = this.rollStarterChoices();
  }

  private createInitialState(seed: number, bestScore: number): GameState {
    return {
      phase: "title",
      seed,
      visualTime: 0,
      round: 1,
      maxRounds: CAMPAIGN_ROUNDS,
      endlessUnlocked: false,
      hp: 20,
      maxHp: 20,
      gold: 8,
      playerLevel: STARTING_PLAYER_LEVEL,
      upgradeRemaining: upgradeCostForLevel(STARTING_PLAYER_LEVEL) || 0,
      score: 0,
      bestScore,
      streak: 0,
      victories: 0,
      starter: null,
      starterChoices: [],
      starterHistory: [],
      board: emptySlots<OwnedUnit>(BOARD_SIZE),
      bench: emptySlots<OwnedUnit>(BENCH_SIZE),
      shop: emptySlots<UnitId>(SHOP_SIZE),
      shopLocked: false,
      selected: null,
      augments: [],
      augmentHistory: [],
      augmentChoices: [],
      incomeBonus: 0,
      paydayDebtRounds: 0,
      battle: null,
      result: null,
      finalWon: false,
      toast: null,
    };
  }

  public resetToTitle() {
    const seed = freshSeed();
    const best = Math.max(this.state.bestScore, loadBestScore());
    this.rng = createSeededRandom(seed);
    this.uid = 1;
    this.state = this.createInitialState(seed, best);
    this.state.starterChoices = this.rollStarterChoices();
  }

  private isRanged(unitId: UnitId) {
    return UNIT_DEFS[unitId].attackType === "ranged";
  }

  private addEnergy(fighter: Fighter, amount: number) {
    fighter.energy = Math.max(0, Math.min(fighter.maxEnergy, fighter.energy + amount));
  }

  private rollStarterChoices() {
    const pool = STARTERS.map((starter) => starter.id);
    const choices: StarterId[] = [];
    while (choices.length < STARTER_OFFER_SIZE && pool.length) {
      choices.push(pool.splice(Math.floor(this.rng.next() * pool.length), 1)[0]);
    }
    return choices;
  }

  public startRun(starterId: StarterId) {
    const starter = STARTERS.find((item) => item.id === starterId);
    if (!starter || !this.state.starterChoices.includes(starterId)) return;

    const seed = this.state.seed;
    const best = this.state.bestScore;
    this.rng = createSeededRandom(seed);
    this.uid = 1;
    this.state = this.createInitialState(seed, best);
    this.state.phase = "preparation";
    this.state.starter = starterId;
    this.state.starterHistory.push({ id: starterId });
    this.state.starterChoices = [];
    const effects = starterEffects[starterId];
    this.state.hp = 20 + (effects.hpBonus || 0);
    this.state.maxHp = this.state.hp;
    this.state.gold = 8 + (effects.goldBonus || 0);

    const starterUnit: OwnedUnit = {
      uid: this.uid++,
      id: starter.unit,
      star: 1,
    };
    // 6x4 部署网格：远程默认站在第二行最后方，近战默认站在第二行最前方。
    const preferredSlot = this.isRanged(starter.unit) ? 6 : 11;
    this.state.board[preferredSlot] = starterUnit;
    this.state.shop = this.generateShop();
    this.setToast(
      `${starter.name}已接入。购买单位，调整站位，然后开始迎战。`,
      "good",
    );
  }

  public get boardCap() {
    return PLAYER_LEVEL_CONFIG[this.state.playerLevel].boardCap;
  }

  public get upgradeCost() {
    return this.isMaxPlayerLevel ? null : this.state.upgradeRemaining;
  }

  public get isMaxPlayerLevel() {
    return this.state.playerLevel === MAX_PLAYER_LEVEL;
  }

  public get boardCount() {
    return this.state.board.filter(Boolean).length;
  }

  public get currentWave() {
    return waveForRound(this.state.round);
  }

  public setRankingMetric(metric: RankingMetric) {
    const battle = this.state.battle;
    if (!battle) return;
    battle.rankingMetric = metric;
    battle.rankingOpen = true;
  }

  public toggleRanking() {
    const battle = this.state.battle;
    if (!battle) return;
    battle.rankingOpen = !battle.rankingOpen;
  }

  public closeRanking() {
    if (this.state.battle) this.state.battle.rankingOpen = false;
  }

  public getBattleRanking(team: Team = "player") {
    const battle = this.state.battle;
    if (!battle) return [];
    const metric = battle.rankingMetric;
    const valueFor = (fighter: Fighter) => {
      if (metric === "damage") return fighter.damageDealt;
      if (metric === "support") return fighter.healingDone + fighter.shieldingDone;
      return fighter.damageTaken;
    };
    const fighters = team === "player" ? battle.player : battle.enemy;
    return [...fighters]
      .sort((left, right) =>
        valueFor(right) - valueFor(left) || left.fid.localeCompare(right.fid),
      )
      .map((fighter) => ({ fighter, value: valueFor(fighter) }));
  }

  public getBattleFighter(fid: string) {
    const battle = this.state.battle;
    return battle && [...battle.player, ...battle.enemy].find((fighter) => fighter.fid === fid);
  }

  private summarizeBattleFighter(fighter: Fighter, value?: number) {
    return {
      fid: fighter.fid,
      team: fighter.team,
      unitId: fighter.unitId,
      name: UNIT_DEFS[fighter.unitId].name,
      star: fighter.star,
      alive: fighter.alive,
      hp: Math.round(fighter.hp),
      maxHp: Math.round(fighter.maxHp),
      shield: Math.round(fighter.shield),
      attack: Math.round(fighter.attack),
      armor: Math.round(fighter.armor),
      range: Math.round(fighter.range),
      attackInterval: Number(fighter.attackInterval.toFixed(2)),
      moveSpeed: Math.round(fighter.moveSpeed),
      attackType: fighter.attackType,
      energy: Math.round(fighter.energy),
      maxEnergy: fighter.maxEnergy,
      energyPerSecond: fighter.energyPerSecond,
      energyOnAttack: fighter.energyOnAttack,
      energyOnHit: fighter.energyOnHit,
      energyStyle: fighter.energyStyle,
      damageDealt: Math.round(fighter.damageDealt),
      healingDone: Math.round(fighter.healingDone),
      shieldingDone: Math.round(fighter.shieldingDone),
      damageTaken: Math.round(fighter.damageTaken),
      ...(value === undefined ? {} : { value: Math.round(value) }),
    };
  }

  public getTraitCounts(): Record<TraitId, number> {
    const counts = Object.keys(TRAITS).reduce(
      (result, key) => {
        result[key as TraitId] = 0;
        return result;
      },
      {} as Record<TraitId, number>,
    );

    const countedUnits = new Set<UnitId>();
    this.state.board.forEach((owned) => {
      if (!owned) return;
      if (countedUnits.has(owned.id)) return;
      countedUnits.add(owned.id);
      UNIT_DEFS[owned.id].traits.forEach((trait) => {
        counts[trait] += 1;
      });
    });
    return counts;
  }

  public getActiveTraits() {
    return (Object.keys(TRAITS) as TraitId[])
      .map((trait) => {
        const definition = TRAITS[trait];
        const status = this.getTraitStatus(trait);
        return {
          ...definition,
          count: status.count,
          level: status.level,
          description:
            status.level > 0
              ? definition.bonuses[status.level - 1]
              : status.active
                ? definition.description
                : `${definition.description}（缺少搭档）`,
        };
      })
      .filter((trait) => trait.level > 0);
  }

  private setToast(text: string, tone: ToastState["tone"] = "info") {
    this.state.toast = { text, tone, time: 2.8 };
  }

  private rollTier() {
    const odds = tierOddsForLevel(this.state.playerLevel);
    const roll = this.rng.next() * 100;
    let total = 0;
    for (let index = 0; index < odds.length; index += 1) {
      total += odds[index];
      if (roll < total) return index + 1;
    }
    return 1;
  }

  private generateShop(): UnitId[] {
    return Array.from({ length: SHOP_SIZE }, () => {
      const tier = this.rollTier();
      const candidates = SHOP_UNITS.filter((id) => UNIT_DEFS[id].tier === tier);
      const fallback = SHOP_UNITS.filter(
        (id) => UNIT_DEFS[id].tier <= Math.max(1, tier),
      );
      return this.rng.pick(candidates.length ? candidates : fallback);
    });
  }

  private levelUp() {
    if (this.isMaxPlayerLevel) return false;
    this.state.playerLevel = (this.state.playerLevel + 1) as PlayerLevel;
    this.state.upgradeRemaining = upgradeCostForLevel(this.state.playerLevel) || 0;
    this.setToast(
      `升至 ${bookLevelForPlayerLevel(this.state.playerLevel)} 本，现在可上阵 ${this.boardCap} 名单位！`,
      "good",
    );
    return true;
  }

  public buyExperience() {
    if (this.state.phase !== "preparation") return;
    if (this.isMaxPlayerLevel) {
      this.setToast("已达到最高等级。", "info");
      return;
    }
    const cost = this.state.upgradeRemaining;
    if (this.state.gold < cost) {
      this.setToast(`还差 ${cost - this.state.gold} 金币，无法升本。`, "bad");
      return;
    }

    this.state.gold -= cost;
    this.levelUp();
  }

  public toggleShopLock() {
    if (this.state.phase !== "preparation") return;
    this.state.shopLocked = !this.state.shopLocked;
    this.setToast(
      this.state.shopLocked
        ? "商店已锁定，下回合保留当前货架。"
        : "商店已解锁，下回合将自动刷新。",
      "info",
    );
  }

  public rerollShop() {
    if (this.state.phase !== "preparation") return;
    const freeReroll = this.state.starter === "ranger_start" && this.state.round === 1;
    if (!freeReroll && this.state.gold < 1) {
      this.setToast("金币不足，无法刷新商店。", "bad");
      return;
    }
    if (!freeReroll) this.state.gold -= 1;
    this.state.shop = this.generateShop();
    this.state.shopLocked = false;
    this.state.selected = null;
    this.setToast("商店已刷新并自动解锁。", "info");
  }

  public buyShopUnit(index: number) {
    if (this.state.phase !== "preparation") return;
    const id = this.state.shop[index];
    if (!id) return;
    const def = UNIT_DEFS[id];
    if (this.state.gold < def.cost) {
      this.setToast(`还差 ${def.cost - this.state.gold} 金币。`, "bad");
      return;
    }

    const boardSlot =
      this.boardCount < this.boardCap
        ? this.state.board.findIndex((unit) => !unit)
        : -1;
    const benchSlot = this.state.bench.findIndex((unit) => !unit);
    if (boardSlot < 0 && benchSlot < 0) {
      this.setToast("备战席已满。出售或合成一个单位后再购买。", "bad");
      return;
    }

    const owned: OwnedUnit = { uid: this.uid++, id, star: 1 };
    this.state.gold -= def.cost;
    this.state.shop[index] = null;
    if (boardSlot >= 0) this.state.board[boardSlot] = owned;
    else this.state.bench[benchSlot] = owned;
    this.state.score += def.cost * 5;
    const merged = this.checkMerges();
    if (!merged)
      this.setToast(
        `${def.name}已加入${boardSlot >= 0 ? "阵地" : "备战席"}。`,
        "good",
      );
  }

  public getTraitStatus(trait: TraitId) {
    const count = this.getTraitCounts()[trait];
    const definition = TRAITS[trait];
    const level = traitLevelForCount(definition, count);
    const active = level > 0;
    return {
      count,
      level,
      active,
      maxThreshold: definition.thresholds[definition.thresholds.length - 1],
    };
  }

  private getAt(location: UnitLocation) {
    return location.zone === "board"
      ? this.state.board[location.index]
      : this.state.bench[location.index];
  }

  private setAt(location: UnitLocation, value: OwnedUnit | null) {
    if (location.zone === "board") this.state.board[location.index] = value;
    else this.state.bench[location.index] = value;
  }

  private sameLocation(a: UnitLocation, b: UnitLocation) {
    return a.zone === b.zone && a.index === b.index;
  }

  public selectSlot(zone: UnitLocation["zone"], index: number) {
    if (this.state.phase !== "preparation") return;
    const targetLocation = { zone, index } as UnitLocation;
    const targetUnit = this.getAt(targetLocation);
    const selected = this.state.selected;

    if (!selected) {
      if (targetUnit) this.state.selected = targetLocation;
      return;
    }

    if (this.sameLocation(selected, targetLocation)) {
      this.state.selected = null;
      return;
    }

    const selectedUnit = this.getAt(selected);
    if (!selectedUnit) {
      this.state.selected = targetUnit ? targetLocation : null;
      return;
    }

    if (
      zone === "board" &&
      selected.zone === "bench" &&
      !targetUnit &&
      this.boardCount >= this.boardCap
    ) {
      this.setToast(`当前只能上阵 ${this.boardCap} 名单位。`, "bad");
      return;
    }

    this.setAt(selected, targetUnit);
    this.setAt(targetLocation, selectedUnit);
    this.state.selected = null;
  }

  public sellSelected() {
    if (this.state.phase !== "preparation" || !this.state.selected) return;
    const unit = this.getAt(this.state.selected);
    if (!unit) return;
    const copies = unit.star === 1 ? 1 : unit.star === 2 ? 3 : 9;
    const refund = UNIT_DEFS[unit.id].cost * copies;
    this.setAt(this.state.selected, null);
    this.state.selected = null;
    this.state.gold += refund;
    this.setToast(
      `已回收 ${UNIT_DEFS[unit.id].name}，返还 ${refund} 金币。`,
      "info",
    );
  }

  private allLocations() {
    const locations: UnitLocation[] = [];
    this.state.board.forEach((unit, index) => {
      if (unit) locations.push({ zone: "board", index });
    });
    this.state.bench.forEach((unit, index) => {
      if (unit) locations.push({ zone: "bench", index });
    });
    return locations;
  }

  private checkMerges() {
    let didMerge = false;
    let preferred: UnitLocation | undefined;
    let found = true;
    while (found) {
      found = false;
      for (const id of SHOP_UNITS) {
        for (const star of [1, 2] as const) {
          const matches = this.allLocations().filter((location) => {
            const unit = this.getAt(location);
            return unit?.id === id && unit.star === star;
          });
          if (matches.length < 3) continue;

          const currentPreferred = preferred;
          const preferredMatch = currentPreferred
            ? matches.find((location) =>
              this.sameLocation(location, currentPreferred))
            : null;
          const boardMatch = matches.find((location) => location.zone === "board");
          const keep = preferredMatch || boardMatch || matches[0];
          const removals = matches
            .filter((location) => !this.sameLocation(location, keep))
            .slice(0, 2);
          const keptUnit = this.getAt(keep);
          if (!keptUnit || removals.length < 2) continue;
          keptUnit.star = (star + 1) as 2 | 3;
          removals.forEach((location) => this.setAt(location, null));
          preferred = keep;
          this.state.selected = null;
          this.state.score += 80 * star;
          this.setToast(
            `聚合完成：${UNIT_DEFS[id].name}升至 ${star + 1} 星，并保留原站位！`,
            "good",
          );
          didMerge = true;
          found = true;
          break;
        }
        if (found) break;
      }
    }
    return didMerge;
  }

  public startBattle() {
    if (this.state.phase !== "preparation") return;
    if (this.boardCount === 0) {
      this.setToast("至少部署一个单位才能开始战斗。", "bad");
      return;
    }
    if (this.boardCount > this.boardCap) {
      this.setToast(
        `当前上阵 ${this.boardCount}/${this.boardCap}，请移回备战席、出售或升本。`,
        "bad",
      );
      return;
    }
    this.state.selected = null;
    this.state.battle = this.createBattle();
    this.state.phase = "battle";
    this.state.toast = null;
  }

  private createBattle(): BattleState {
    const traitCounts = this.getTraitCounts();
    const traitLevel = (trait: TraitId) =>
      traitLevelForCount(TRAITS[trait], traitCounts[trait]);
    const hasAugment = (id: AugmentId) => this.state.augments.includes(id);
    const globalTraitLevel = (trait: TraitId) => traitLevel(trait);
    const playerSpawn = (index: number) => {
      const col = index % 6;
      const row = Math.floor(index / 6);
      return {
        x: 72 + col * 88 + (row % 2) * 18,
        y: 175 + row * 135,
        row,
      };
    };

    const player = this.state.board.flatMap((owned, index) => {
      if (!owned) return [];
      const def = UNIT_DEFS[owned.id];
      const spawn = playerSpawn(index);
      const scale = STAR_SCALE[owned.star];
      let maxHp = def.hp * scale;
      let attack = def.attack * scale * 1.15;
      let armor = def.armor;
      let attackInterval = def.attackInterval;
      const starterEffect = this.state.starter ? starterEffects[this.state.starter] : {};
      const emberLevel = def.traits.includes("ember") ? traitLevel("ember") : 0;
      const wildLevel = def.traits.includes("wild") ? traitLevel("wild") : 0;
      const vanguardLevel = def.traits.includes("vanguard")
        ? traitLevel("vanguard")
        : 0;
      const rangerLevel = def.traits.includes("ranger")
        ? traitLevel("ranger")
        : 0;
      const mysticLevel = def.traits.includes("mystic")
        ? traitLevel("mystic")
        : 0;
      const assassinLevel = def.traits.includes("assassin")
        ? traitLevel("assassin")
        : 0;
      const chuanmeiLevel = def.traits.includes("chuanmei")
        ? traitLevel("chuanmei")
        : 0;
      const skeletonLevel = def.traits.includes("skeleton_soldier")
        ? traitLevel("skeleton_soldier")
        : 0;
      const gluttonyHolder = def.traits.includes("gluttony") && traitLevel("gluttony") > 0;
      const gen27Member = def.traits.includes("gen27") && traitLevel("gen27") > 0;
      const yueGangMember = def.traits.includes("yue_gang") && traitLevel("yue_gang") > 0;
      const isRanged = def.attackType === "ranged";
      const globalWildLevel = globalTraitLevel("wild");
      const globalVanguardLevel = globalTraitLevel("vanguard");
      const globalRangerLevel = globalTraitLevel("ranger");
      const globalMysticLevel = globalTraitLevel("mystic");
      const trafficLevel = def.traits.includes("traffic") ? traitLevel("traffic") : 0;
      const globalTrafficLevel = globalTraitLevel("traffic");
      const matureLevel = def.traits.includes("mature") ? traitLevel("mature") : 0;
      const danceLevel = def.traits.includes("dance") ? traitLevel("dance") : 0;
      const globalDanceLevel = globalTraitLevel("dance");
      const globalAssassinLevel = globalTraitLevel("assassin");
      const globalChuanmeiLevel = globalTraitLevel("chuanmei");
      const hostLevel = def.traits.includes("host") ? traitLevel("host") : 0;
      const globalHostLevel = globalTraitLevel("host");
      const dwarfLevel = def.traits.includes("dwarf") ? traitLevel("dwarf") : 0;
      const moveSpeed = def.moveSpeed + [0, 10, 22, 36][globalHostLevel] + (hostLevel ? [0, 18, 32, 50][hostLevel] : 0);

      if (vanguardLevel) {
        maxHp *= [1, 1.12, 1.25, 1.42][vanguardLevel];
        armor += [0, 8, 18, 32][vanguardLevel];
      }
      if (rangerLevel) attackInterval /= [1, 1.12, 1.26, 1.45][rangerLevel];
      if (skeletonLevel) {
        attack *= 1.35;
        armor -= 12;
      }
      if (wildLevel) {
        maxHp *= [1, 1.12, 1.25, 1.42][wildLevel];
        armor += [0, 8, 18, 32][wildLevel];
      }
      if (danceLevel) {
        attackInterval /= [1, 1.12, 1.26, 1.45][danceLevel];
      }
      if (!isRanged) {
        if (globalVanguardLevel >= 2) {
          maxHp *= globalVanguardLevel === 3 ? 1.16 : 1.08;
          armor += globalVanguardLevel === 3 ? 12 : 6;
        }
        if (globalWildLevel >= 2) {
          maxHp *= globalWildLevel === 3 ? 1.16 : 1.08;
          armor += globalWildLevel === 3 ? 12 : 6;
        }
      } else if (globalRangerLevel >= 2) {
        attackInterval /= globalRangerLevel === 3 ? 1.3 : 1.15;
      }
      if (isRanged && globalDanceLevel >= 2) {
        attackInterval /= globalDanceLevel === 3 ? 1.16 : 1.08;
      }
      const danceMoveSpeed = (danceLevel ? [0, 10, 20, 32][danceLevel] : 0) + (isRanged && globalDanceLevel >= 2 ? (globalDanceLevel === 3 ? 12 : 6) : 0);
      if (hasAugment("tempered")) armor += 16;
      if (hasAugment("second_wind")) {
        maxHp *= 1.12;
        armor += 10;
      }
      if (hasAugment("sharp_edge")) attack *= 1.15;
      if (hasAugment("momentum")) attackInterval /= 1.18;
      if (this.state.starter === "dance_start" && danceLevel) {
        attackInterval /= 1 + (starterEffect.danceAttackSpeed || 0);
      }
      const matureAttackSpeed = [0, 0.08, 0.16, 0.24][matureLevel];
      if (matureAttackSpeed) attackInterval /= 1 + matureAttackSpeed;

      const fighter: Fighter = {
        fid: `p-${owned.uid}`,
        unitId: owned.id,
        team: "player",
        star: owned.star,
        x: spawn.x,
        y: spawn.y,
        radius: fighterVisualRadius(owned.id, owned.star),
        hp: maxHp,
        maxHp,
        shield: 0,
        attack,
        armor,
        range: def.range,
        attackInterval,
        moveSpeed: moveSpeed + danceMoveSpeed,
        baseAttack: attack,
        baseAttackInterval: attackInterval,
        baseMoveSpeed: moveSpeed + danceMoveSpeed,
        cooldown: this.rng.next() * 0.25,
        maxEnergy: def.energyProfile.max,
        energyPerSecond: def.energyProfile.perSecond,
        energyOnAttack: def.energyProfile.onAttack,
        energyOnHit: def.energyProfile.onHit,
        energyStyle: def.energyProfile.id,
        attackType: def.attackType,
        energy: Math.min(
          def.energyProfile.max,
          def.energyProfile.start +
            [0, 20, 45, 70][mysticLevel] +
            [0, 0, 10, 22][globalMysticLevel] +
            [0, 0, 10, 22][globalTraitLevel("gen27")] * (gen27Member ? 1 : 0) +
            (starterEffect.startingEnergy || 0) +
            (hasAugment("overclock") ? 35 : 0),
        ),
        stun: 0,
        burnTime: 0,
        burnDps: 0,
        burnSourceFid: null,
        lifesteal:
          [0, 0.08, 0.15, 0.24][trafficLevel] +
          [0, 0, 0.05, 0.1][globalTrafficLevel] * (isRanged ? 1 : 0) +
          (trafficLevel && this.state.starter === "traffic_start" ? 0.06 : 0),
        burnOnHitPower: 0,
        spiceBurnOnHitPower: Math.max(
          [0, 0.45, 0.8][chuanmeiLevel],
          isRanged ? [0, 0, 0.22][globalChuanmeiLevel] : 0,
        ),
        dodgeChance: dwarfLevel ? [0, 0.12, 0.22][dwarfLevel] : 0,
        dwarfMember: dwarfLevel > 0,
        gluttonyHolder,
        growthStacks: 0,
        emberMember: emberLevel > 0,
        emberAttackPerStack: [0, 0.05, 0.08, 0.12][emberLevel],
        emberAttackStacks: 0,
        emberAttackStackCap: [0, 5, 5, 5][emberLevel],
        gen27Member,
        gen27Buffed: false,
        matureMember: matureLevel > 0,
        matureMoveFloor: matureLevel ? 0.7 : 1,
        matureAttackSpeed,
        matureAttackSpeedCurrent: matureAttackSpeed,
        slowTime: 0,
        weakenTime: 0,
        weakenArmorPenalty: 0,
        yueGangMember,
        lowHealthBonus: 0,
        critChance:
          [0, 0.15, 0.3, 0.5][assassinLevel] +
          (isRanged ? [0, 0, 0.12, 0.25][globalAssassinLevel] : 0),
        critMultiplier: 1.65,
        castRefund: Math.min(def.energyProfile.max, def.energyProfile.castRefund + [0, 0, 8, 15][mysticLevel]),
        secondWindUsed: false,
        enraged: false,
        jumpPending: assassinLevel > 0,
        jumpDelay: assassinLevel ? 3.4 + spawn.row * 0.12 : 0,
        jumpTime: 0,
        jumpDuration: assassinLevel ? 0.68 : 0,
        attackPulse: 0,
        facingX: 1,
        attackTargetX: spawn.x,
        attackTargetY: spawn.y,
        hitPulse: 0,
        applePieShotsRemaining: 0,
        applePieShotTimer: 0,
        jumpFromX: spawn.x,
        jumpFromY: spawn.y,
        jumpToX: spawn.x,
        jumpToY: spawn.y,
        targetFid: null,
        targetLock: 0,
        lastNavX: spawn.x,
        lastNavY: spawn.y,
        lastTargetDistance: Infinity,
        stuckTime: 0,
        avoidSide: owned.uid % 2 === 0 ? 1 : -1,
        avoidTime: 0,
        damageDealt: 0,
        healingDone: 0,
        shieldingDone: 0,
        damageTaken: 0,
        alive: true,
      };
      return [fighter];
    });

    const wave = this.currentWave;
    const enemy = wave.units.map((waveUnit, index) => {
      const def = UNIT_DEFS[waveUnit.id];
      const star = waveUnit.star || 1;
      const scale = STAR_SCALE[star] * wave.modifier;
      const row = index % 3;
      const rank = Math.floor(index / 3);
      const maxHp = def.hp * scale;
      return {
        fid: `e-${this.state.round}-${index}`,
        unitId: waveUnit.id,
        team: "enemy" as const,
        star,
        x: 990 - rank * 96,
        y: 180 + row * 165,
        radius: fighterVisualRadius(waveUnit.id, star),
        hp: maxHp,
        maxHp,
        shield: 0,
        attack: def.attack * scale * 1.15,
        armor: def.armor + Math.max(0, this.state.round - 4) * 2,
        range: def.range,
        attackInterval: def.attackInterval,
        moveSpeed: def.moveSpeed,
        baseAttack: def.attack * scale * 1.15,
        baseAttackInterval: def.attackInterval,
        baseMoveSpeed: def.moveSpeed,
        cooldown: this.rng.next() * 0.4,
        maxEnergy: def.energyProfile.max,
        energyPerSecond: def.energyProfile.perSecond,
        energyOnAttack: def.energyProfile.onAttack,
        energyOnHit: def.energyProfile.onHit,
        energyStyle: def.energyProfile.id,
        attackType: def.attackType,
        energy: Math.min(def.energyProfile.max, def.energyProfile.start + (wave.tag === "boss" ? 28 : 0)),
        stun: 0,
        burnTime: 0,
        burnDps: 0,
        burnSourceFid: null,
        lifesteal: 0,
        burnOnHitPower: 0,
        spiceBurnOnHitPower: 0,
        dodgeChance: 0,
        dwarfMember: false,
        gluttonyHolder: false,
        growthStacks: 0,
        emberMember: false,
        emberAttackPerStack: 0,
        emberAttackStacks: 0,
        emberAttackStackCap: 0,
        gen27Member: false,
        gen27Buffed: false,
        matureMember: false,
        matureMoveFloor: 1,
        matureAttackSpeed: 0,
        matureAttackSpeedCurrent: 0,
        slowTime: 0,
        weakenTime: 0,
        weakenArmorPenalty: 0,
        yueGangMember: false,
        lowHealthBonus: 0,
        critChance: 0,
        critMultiplier: 1.65,
        castRefund: 0,
        secondWindUsed: false,
        enraged: false,
        attackPulse: 0,
        facingX: -1,
        attackTargetX: 990 - rank * 96,
        attackTargetY: 180 + row * 165,
        hitPulse: 0,
        applePieShotsRemaining: 0,
        applePieShotTimer: 0,
        jumpPending: false,
        jumpDelay: 0,
        jumpTime: 0,
        jumpDuration: 0,
        jumpFromX: 990 - rank * 96,
        jumpFromY: 180 + row * 165,
        jumpToX: 990 - rank * 96,
        jumpToY: 180 + row * 165,
        targetFid: null,
        targetLock: 0,
        lastNavX: 990 - rank * 96,
        lastNavY: 180 + row * 165,
        lastTargetDistance: Infinity,
        stuckTime: 0,
        avoidSide: index % 2 === 0 ? -1 : 1,
        avoidTime: 0,
        damageDealt: 0,
        healingDone: 0,
        shieldingDone: 0,
        damageTaken: 0,
        alive: true,
      } satisfies Fighter;
    });

    const battle: BattleState = {
      elapsed: 0,
      limit: 24,
      player,
      enemy,
      effects: [],
      fieldMedicTimer: 2.5,
      gluttonyTimer: 3,
      emberTimer: 3,
      yueGangTimer: 0.45,
      matureTimer: 4,
      banner:
        wave.tag === "boss"
          ? "首领战 · 暴君降临"
          : wave.tag === "elite"
            ? "精英战 · 奖励提升"
            : `第 ${wave.round} 战`,
      bannerTimer: 2.2,
      rankingOpen: false,
      rankingMetric: "damage",
    };
    const matureLevel = globalTraitLevel("mature");
    if (matureLevel) {
      const memberShield = [0, 0.1, 0.18, 0.28][matureLevel] + (this.state.starter === "mature_start" ? 0.06 : 0);
      const allShield = [0, 0, 0.04, 0.08][matureLevel];
      battle.player.forEach((fighter) => {
        const ratio = (fighter.matureMember ? memberShield : 0) + allShield;
        if (ratio) this.grantShield(null, fighter, fighter.maxHp * ratio, 0.6, battle);
      });
    }
    return battle;
  }

  private frontlinesEngaged(battle: BattleState) {
    return battle.player.some(
      (player) =>
        player.alive &&
        !player.jumpPending &&
        battle.enemy.some(
          (enemy) =>
            enemy.alive &&
            Math.hypot(enemy.x - player.x, enemy.y - player.y) <=
              player.radius + enemy.radius + 78,
        ),
    );
  }

  private faceTowardX(fighter: Fighter, targetX: number) {
    const deltaX = targetX - fighter.x;
    if (Math.abs(deltaX) > 0.5) fighter.facingX = deltaX < 0 ? -1 : 1;
  }

  private clampFighterPosition(fighter: Fighter, point: { x: number; y: number }) {
    return {
      x: Math.max(BATTLE_BOUNDS.left + fighter.radius, Math.min(BATTLE_BOUNDS.right - fighter.radius, point.x)),
      y: Math.max(BATTLE_BOUNDS.top + fighter.radius, Math.min(BATTLE_BOUNDS.bottom - fighter.radius, point.y)),
    };
  }

  private occupiedPosition(fighter: Fighter) {
    return fighter.jumpTime > 0
      ? { x: fighter.jumpToX, y: fighter.jumpToY }
      : { x: fighter.x, y: fighter.y };
  }

  private findOpenPlacement(
    fighter: Fighter,
    preferred: { x: number; y: number },
    occupants: Fighter[],
    margin = PLACEMENT_MARGIN,
    preferredCandidates: Array<{ x: number; y: number }> = [],
  ) {
    const side = fighter.avoidSide;
    const candidates = [preferred, ...preferredCandidates];
    [42, 78, 118].forEach((radius) => {
      [0, side * Math.PI / 2, -side * Math.PI / 2, Math.PI].forEach((angle) => {
        candidates.push({ x: preferred.x + Math.cos(angle) * radius, y: preferred.y + Math.sin(angle) * radius });
      });
    });
    let best = this.clampFighterPosition(fighter, candidates[0]);
    let bestClearance = -Infinity;
    for (const candidate of candidates) {
      const clamped = this.clampFighterPosition(fighter, candidate);
      const clearance = occupants.reduce((minimum, other) => {
        if (!other.alive || other === fighter) return minimum;
        const position = this.occupiedPosition(other);
        return Math.min(minimum, Math.hypot(clamped.x - position.x, clamped.y - position.y) - fighter.radius - other.radius - margin);
      }, Infinity);
      if (clearance >= 0) return clamped;
      if (clearance > bestClearance) {
        best = clamped;
        bestClearance = clearance;
      }
    }
    return best;
  }

  private relocateFighter(source: Fighter, preferred: { x: number; y: number }) {
    const battle = this.state.battle;
    if (!battle) return;
    const occupants = [...battle.player, ...battle.enemy].filter((fighter) => fighter !== source);
    const landing = this.findOpenPlacement(source, preferred, occupants);
    source.x = landing.x;
    source.y = landing.y;
  }

  private resolveCombatTarget(source: Fighter, targets: Fighter[], dt: number) {
    const available = targets.filter((target) => target.alive && !target.jumpPending && target.jumpTime <= 0);
    const current = available.find((target) => target.fid === source.targetFid) || null;
    const nearest = this.nearestTarget(source, available);
    source.targetLock = Math.max(0, source.targetLock - dt);
    const shouldSwitch = !current || !nearest || source.targetLock <= 0 && (
      source.stuckTime >= STUCK_RECOVERY_DELAY ||
      Math.hypot(nearest.x - source.x, nearest.y - source.y) + TARGET_SWITCH_DISTANCE < Math.hypot(current.x - source.x, current.y - source.y)
    );
    const target = shouldSwitch ? nearest : current;
    if (target && target.fid !== source.targetFid) {
      source.targetFid = target.fid;
      source.targetLock = TARGET_LOCK_DURATION;
      source.stuckTime = 0;
      source.lastTargetDistance = Infinity;
    }
    return target;
  }

  private moveTowardCombatTarget(fighter: Fighter, target: Fighter, fighters: Fighter[], dt: number) {
    const targetDistance = Math.hypot(target.x - fighter.x, target.y - fighter.y);
    const preferredRange = Math.max(fighter.range, fighter.radius + target.radius + CONTACT_ATTACK_BUFFER);
    if (targetDistance <= preferredRange) {
      fighter.stuckTime = 0;
      fighter.lastTargetDistance = targetDistance;
      fighter.lastNavX = fighter.x;
      fighter.lastNavY = fighter.y;
      return false;
    }

    fighter.avoidTime = Math.max(0, fighter.avoidTime - dt);
    const towardX = (target.x - fighter.x) / targetDistance;
    const towardY = (target.y - fighter.y) / targetDistance;
    const directPoint = {
      x: target.x - towardX * preferredRange,
      y: target.y - towardY * preferredRange,
    };
    const blockedAhead = fighters.some((other) => {
      if (!other.alive || other === fighter || other === target || other.jumpTime > 0) return false;
      const relativeX = other.x - fighter.x;
      const relativeY = other.y - fighter.y;
      const forward = relativeX * towardX + relativeY * towardY;
      const lateral = Math.abs(relativeX * -towardY + relativeY * towardX);
      return forward > 0 && forward < AVOID_LOOK_AHEAD && lateral < fighter.radius + other.radius + 12;
    });
    const lateralOffset = fighter.avoidTime > 0 || blockedAhead ? fighter.avoidSide * 56 : 0;
    const desired = this.findOpenPlacement(
      fighter,
      { x: directPoint.x - towardY * lateralOffset, y: directPoint.y + towardX * lateralOffset },
      fighters.filter((other) => other !== target),
      2,
    );
    let moveX = desired.x - fighter.x;
    let moveY = desired.y - fighter.y;
    let moveDistance = Math.hypot(moveX, moveY);
    if (moveDistance < 0.01) {
      moveX = towardX;
      moveY = towardY;
      moveDistance = 1;
    }
    const travel = Math.min(moveDistance, fighter.moveSpeed * (fighter.slowTime > 0 ? 0.55 : 1) * dt);
    const previousX = fighter.x;
    const previousY = fighter.y;
    fighter.x += (moveX / moveDistance) * travel;
    fighter.y += (moveY / moveDistance) * travel;
    const clamped = this.clampFighterPosition(fighter, fighter);
    fighter.x = clamped.x;
    fighter.y = clamped.y;
    this.faceTowardX(fighter, target.x);

    const moved = Math.hypot(fighter.x - previousX, fighter.y - previousY);
    const newDistance = Math.hypot(target.x - fighter.x, target.y - fighter.y);
    if (moved < 0.5 && newDistance >= fighter.lastTargetDistance - 0.5) fighter.stuckTime += dt;
    else fighter.stuckTime = 0;
    if (fighter.stuckTime >= STUCK_RECOVERY_DELAY) {
      fighter.avoidSide = fighter.avoidSide === 1 ? -1 : 1;
      fighter.avoidTime = STUCK_RECOVERY_DURATION;
      fighter.stuckTime = 0;
    }
    fighter.lastNavX = fighter.x;
    fighter.lastNavY = fighter.y;
    fighter.lastTargetDistance = newDistance;
    return true;
  }

  private prepareAssassinJump(fighter: Fighter, battle: BattleState) {
    const backlineTargets = battle.enemy
      .filter((enemy) => enemy.alive)
      .sort((a, b) => b.x - a.x);
    const target = backlineTargets[0];
    if (!target) return false;

    const occupied = [...battle.player, ...battle.enemy]
      .filter((other) => other.alive && other !== fighter);
    const behindDirection = target.team === "enemy" ? 1 : -1;
    const baseDistance = target.radius + fighter.radius + 12;
    const candidates = [
      { x: target.x + behindDirection * baseDistance, y: target.y },
      { x: target.x + behindDirection * baseDistance, y: target.y - 62 },
      { x: target.x + behindDirection * baseDistance, y: target.y + 62 },
      { x: target.x, y: target.y - baseDistance },
      { x: target.x, y: target.y + baseDistance },
    ];
    const landing = this.findOpenPlacement(fighter, candidates[0], occupied, PLACEMENT_MARGIN, candidates.slice(1));

    fighter.jumpFromX = fighter.x;
    fighter.jumpFromY = fighter.y;
    fighter.jumpToX = landing.x;
    fighter.jumpToY = landing.y;
    this.faceTowardX(fighter, target.x);
    fighter.jumpPending = false;
    fighter.jumpTime = fighter.jumpDuration;
    this.addEffect({
      kind: "ring",
      x: fighter.jumpFromX,
      y: fighter.jumpFromY,
      color: UNIT_DEFS[fighter.unitId].accent,
      life: 0.42,
      size: fighter.radius * 1.8,
    });
    return true;
  }

  private resolveFighterSeparation(fighters: Fighter[]) {
    for (let pass = 0; pass < SEPARATION_PASSES; pass += 1) {
      let resolvedOverlap = false;
      for (let leftIndex = 0; leftIndex < fighters.length; leftIndex += 1) {
        const left = fighters[leftIndex];
        if (!left.alive || left.jumpTime > 0) continue;
        for (let rightIndex = leftIndex + 1; rightIndex < fighters.length; rightIndex += 1) {
          const right = fighters[rightIndex];
          if (!right.alive || right.jumpTime > 0) continue;
          let dx = right.x - left.x;
          let dy = right.y - left.y;
          let distance = Math.hypot(dx, dy);
          const minimum = left.radius + right.radius + 5;
          if (distance >= minimum) continue;
          resolvedOverlap = true;
          if (distance < 0.01) {
            dx = left.fid < right.fid ? 1 : -1;
            dy = 0;
            distance = 1;
          }
          const push = (minimum - distance) / 2;
          const unitX = dx / distance;
          const unitY = dy / distance;
          const leftPoint = this.clampFighterPosition(left, { x: left.x - unitX * push, y: left.y - unitY * push });
          const rightPoint = this.clampFighterPosition(right, { x: right.x + unitX * push, y: right.y + unitY * push });
          const leftMoved = Math.hypot(leftPoint.x - left.x, leftPoint.y - left.y);
          const rightMoved = Math.hypot(rightPoint.x - right.x, rightPoint.y - right.y);
          left.x = leftPoint.x;
          left.y = leftPoint.y;
          right.x = rightPoint.x;
          right.y = rightPoint.y;
          const remainder = Math.max(0, minimum - Math.hypot(right.x - left.x, right.y - left.y));
          if (remainder > 0.1 && leftMoved < push && rightMoved >= push - 0.1) {
            const point = this.clampFighterPosition(right, { x: right.x + unitX * remainder, y: right.y + unitY * remainder });
            right.x = point.x;
            right.y = point.y;
          } else if (remainder > 0.1 && rightMoved < push && leftMoved >= push - 0.1) {
            const point = this.clampFighterPosition(left, { x: left.x - unitX * remainder, y: left.y - unitY * remainder });
            left.x = point.x;
            left.y = point.y;
          }
        }
      }
      if (!resolvedOverlap) break;
    }
  }

  public update(deltaSeconds: number) {
    const dt = Math.min(Math.max(deltaSeconds, 0), 0.05);
    this.state.visualTime += dt;
    if (this.state.toast) {
      this.state.toast.time -= dt;
      if (this.state.toast.time <= 0) this.state.toast = null;
    }
    if (this.state.phase === "battle") this.updateBattle(dt);
  }

  private living(team: Team) {
    const battle = this.state.battle;
    if (!battle) return [];
    return (team === "player" ? battle.player : battle.enemy).filter(
      (fighter) => fighter.alive && fighter.hp > 0,
    );
  }

  private nearestTarget(source: Fighter, targets: Fighter[]) {
    const availableTargets = targets.filter(
      (target) => !target.jumpPending && target.jumpTime <= 0,
    );
    return availableTargets.reduce<Fighter | null>((best, target) => {
      if (!best) return target;
      const bestDistance = Math.hypot(best.x - source.x, best.y - source.y);
      const distance = Math.hypot(target.x - source.x, target.y - source.y);
      return distance < bestDistance ? target : best;
    }, null);
  }

  private addEffect(effect: Omit<BattleEffect, "maxLife">) {
    this.state.battle?.effects.push({ ...effect, maxLife: effect.life });
  }

  private updateNoriApplePie(source: Fighter, dt: number) {
    if (source.applePieShotsRemaining <= 0) return false;

    source.applePieShotTimer = Math.max(0, source.applePieShotTimer - dt);
    if (source.applePieShotTimer > 0) return true;

    const targetTeam: Team = source.team === "player" ? "enemy" : "player";
    const target = this.nearestTarget(source, this.living(targetTeam));
    if (!target) {
      source.applePieShotsRemaining = 0;
      source.applePieShotTimer = 0;
      return false;
    }

    const finalShot = source.applePieShotsRemaining === 1;
    this.faceTowardX(source, target.x);
    source.attackPulse = 0.22;
    source.attackTargetX = target.x;
    source.attackTargetY = target.y;
    const dealt = this.damage(source, target, source.attack * NORI_APPLE_PIE_DAMAGE_MULTIPLIER);
    if (dealt > 0) this.addDamageText(target, dealt);

    const def = UNIT_DEFS[source.unitId];
    this.addEffect({
      kind: "line",
      x: source.x,
      y: source.y,
      x2: target.x,
      y2: target.y,
      color: def.accent,
      life: finalShot ? 0.2 : 0.14,
      size: finalShot ? 5 : 3,
    });
    this.addEffect({
      kind: "burst",
      x: target.x,
      y: target.y,
      color: def.accent,
      life: finalShot ? 0.34 : 0.2,
      size: finalShot ? 44 : 24,
    });
    source.applePieShotsRemaining -= 1;
    source.applePieShotTimer = NORI_APPLE_PIE_INTERVAL;
    return true;
  }

  private refresh27Buffs(battle: BattleState) {
    const level = this.getActiveTraits().find((trait) => trait.id === "gen27")?.level || 0;
    const multiplier = [1, 1.12, 1.2, 1.3][level];
    battle.player.forEach((fighter) => {
      if (!fighter.alive) return;
      const matureSteps = Math.min(6, Math.floor(battle.elapsed / 4));
      const maturePenalty = fighter.matureMember
        ? Math.max(fighter.matureMoveFloor, 1 - matureSteps * 0.05)
        : 1;
      const matureAttackSpeed = fighter.matureMember
        ? Math.max(0, fighter.matureAttackSpeed * (1 - Math.min(4, matureSteps) / 4))
        : 0;
      if (matureAttackSpeed !== fighter.matureAttackSpeedCurrent) {
        fighter.attackInterval *= (1 + fighter.matureAttackSpeedCurrent) / (1 + matureAttackSpeed);
        fighter.matureAttackSpeedCurrent = matureAttackSpeed;
      }
      if (!fighter.gen27Member) {
        fighter.moveSpeed = fighter.baseMoveSpeed * maturePenalty;
        return;
      }
      const hasNearbyPartner = battle.player.some(
        (other) => other !== fighter && other.alive && other.gen27Member &&
          Math.hypot(other.x - fighter.x, other.y - fighter.y) <= 165,
      );
      fighter.gen27Buffed = hasNearbyPartner;
      fighter.attack = fighter.baseAttack;
      fighter.attackInterval = (fighter.baseAttackInterval * (1 + fighter.matureAttackSpeed)) /
        ((hasNearbyPartner ? multiplier : 1) * (1 + fighter.matureAttackSpeedCurrent));
      fighter.moveSpeed = fighter.baseMoveSpeed * (hasNearbyPartner ? multiplier : 1) * maturePenalty;
    });
  }

  private updateBattle(dt: number) {
    const battle = this.state.battle;
    if (!battle) return;
    battle.elapsed += dt;
    battle.yueGangTimer = Math.max(0, battle.yueGangTimer - dt);
    battle.matureTimer -= dt;
    if (battle.matureTimer <= 0) {
      battle.matureTimer += 4;
      this.living("player").filter((fighter) => fighter.matureMember).forEach((fighter) =>
        this.addEffect({ kind: "text", x: fighter.x, y: fighter.y - 42, color: "#b9a274", text: "慢一点", life: 0.65, size: 10 }),
      );
    }
    this.refresh27Buffs(battle);
    battle.bannerTimer = Math.max(0, battle.bannerTimer - dt);

    battle.effects.forEach((effect) => {
      effect.life -= dt;
    });
    battle.effects = battle.effects.filter((effect) => effect.life > 0);

    const emberLevel = this.getActiveTraits().find((trait) => trait.id === "ember")?.level || 0;
    if (emberLevel) {
      battle.emberTimer -= dt;
      if (battle.emberTimer <= 0) {
        battle.emberTimer += 3;
        const rangedCapRatio = [0, 0, 0.12, 0.25][emberLevel];
        this.living("player").forEach((fighter) => {
          if (fighter.emberMember && fighter.emberAttackStacks < fighter.emberAttackStackCap) {
            fighter.emberAttackStacks += 1;
            fighter.attack = fighter.baseAttack * (1 + fighter.emberAttackPerStack * fighter.emberAttackStacks);
            this.addEffect({ kind: "text", x: fighter.x, y: fighter.y - 42, color: "#ff7657", text: `夜 ${fighter.emberAttackStacks}/5`, life: 0.65, size: 10 });
          } else if (!fighter.emberMember && fighter.attackType === "ranged" && rangedCapRatio > 0 && fighter.emberAttackStacks < 5) {
            fighter.emberAttackStacks += 1;
            fighter.attack = fighter.baseAttack * (1 + (rangedCapRatio / 5) * fighter.emberAttackStacks);
          }
        });
      }
    }

    const gluttonyLevel = this.getActiveTraits().find((trait) => trait.id === "gluttony")?.level || 0;
    if (gluttonyLevel) {
      battle.gluttonyTimer -= dt;
      if (battle.gluttonyTimer <= 0) {
        battle.gluttonyTimer += 3;
        const allHealRatio = gluttonyLevel >= 2 ? 0.015 : 0;
        this.living("player").forEach((fighter) => {
          const holderHealRatio = fighter.gluttonyHolder ? (gluttonyLevel >= 2 ? 0.04 : 0.03) : allHealRatio;
          if (holderHealRatio > 0) this.heal(null, fighter, fighter.maxHp * holderHealRatio);
          if (fighter.gluttonyHolder) {
            fighter.growthStacks = Math.min(5, fighter.growthStacks + 1);
            this.addEffect({ kind: "text", x: fighter.x, y: fighter.y - 42, color: "#93d86b", text: `饱 ${fighter.growthStacks}/5`, life: 0.65, size: 10 });
          }
        });
      }
    }

    if (this.state.augments.includes("triage")) {
      battle.fieldMedicTimer -= dt;
      if (battle.fieldMedicTimer <= 0) {
        battle.fieldMedicTimer += 2.5;
        this.living("player").forEach((fighter) =>
          this.heal(null, fighter, fighter.maxHp * 0.03),
        );
      }
    }

    [...battle.player, ...battle.enemy].forEach((fighter) => {
      if (!fighter.alive) return;
      fighter.cooldown -= dt;
      fighter.stun = Math.max(0, fighter.stun - dt);
      fighter.slowTime = Math.max(0, fighter.slowTime - dt);
      const wasWeakened = fighter.weakenTime > 0;
      fighter.weakenTime = Math.max(0, fighter.weakenTime - dt);
      if (wasWeakened && fighter.weakenTime === 0 && fighter.weakenArmorPenalty > 0) {
        fighter.armor += fighter.weakenArmorPenalty;
        fighter.weakenArmorPenalty = 0;
      }
      fighter.attackPulse = Math.max(0, fighter.attackPulse - dt);
      fighter.hitPulse = Math.max(0, fighter.hitPulse - dt);
      if (fighter.jumpPending) {
        fighter.jumpDelay = Math.max(0, fighter.jumpDelay - dt);
        if (!this.frontlinesEngaged(battle) && fighter.jumpDelay > 0) return;
        if (this.prepareAssassinJump(fighter, battle)) return;
        fighter.jumpPending = false;
      }
      if (fighter.jumpTime > 0) {
        fighter.jumpTime = Math.max(0, fighter.jumpTime - dt);
        if (fighter.jumpTime <= 0) {
          fighter.x = fighter.jumpToX;
          fighter.y = fighter.jumpToY;
          this.addEffect({
            kind: "burst",
            x: fighter.x,
            y: fighter.y,
            color: UNIT_DEFS[fighter.unitId].accent,
            life: 0.45,
            size: fighter.radius * 1.8,
          });
        }
        return;
      }
      if (fighter.burnTime > 0) {
        fighter.burnTime -= dt;
        const burnDamage = Math.min(fighter.hp, fighter.burnDps * dt);
        fighter.hp -= burnDamage;
        const source = [...battle.player, ...battle.enemy].find(
          (candidate) => candidate.fid === fighter.burnSourceFid,
        );
        if (source) {
          source.damageDealt += burnDamage;
          fighter.damageTaken += burnDamage;
        }
        if (this.rng.next() < dt * 3) {
          this.addEffect({
            kind: "text",
            x: fighter.x,
            y: fighter.y - 30,
            color: "#ff8a5c",
            text: "灼烧",
            life: 0.45,
            size: 12,
          });
        }
        if (fighter.hp <= 0) this.killFighter(fighter);
      }
      if (!fighter.alive || fighter.stun > 0) return;
      if (fighter.energyPerSecond > 0) this.addEnergy(fighter, fighter.energyPerSecond * dt);
      if (this.updateNoriApplePie(fighter, dt)) return;

      if (
        fighter.unitId === "rift_tyrant" &&
        fighter.hp < fighter.maxHp * 0.5 &&
        !fighter.enraged
      ) {
        fighter.enraged = true;
        fighter.attack *= 1.22;
        fighter.attackInterval /= 1.35;
        battle.banner = "暴君狂暴 · 攻速与伤害提升";
        battle.bannerTimer = 1.8;
        this.addEffect({
          kind: "ring",
          x: fighter.x,
          y: fighter.y,
          color: "#ff4f9a",
          life: 1.1,
          size: 120,
        });
      }

      const targetTeam: Team = fighter.team === "player" ? "enemy" : "player";
      const targets = this.living(targetTeam);
      if (!targets.length) return;

      if (fighter.energy >= fighter.maxEnergy) {
        this.castAbility(fighter, targets);
        return;
      }

      const target = this.resolveCombatTarget(fighter, targets, dt);
      if (!target) return;
      const distance = Math.hypot(target.x - fighter.x, target.y - fighter.y);
      const preferredRange = Math.max(
        fighter.range,
        fighter.radius + target.radius + CONTACT_ATTACK_BUFFER,
      );
      if (distance > preferredRange) {
        this.moveTowardCombatTarget(fighter, target, [...battle.player, ...battle.enemy], dt);
      } else if (fighter.cooldown <= 0) {
        fighter.stuckTime = 0;
        this.basicAttack(fighter, target);
      }
    });

    this.resolveFighterSeparation([...battle.player, ...battle.enemy]);

    const playersAlive = this.living("player");
    const enemiesAlive = this.living("enemy");
    if (!enemiesAlive.length) this.finishBattle(true);
    else if (!playersAlive.length) this.finishBattle(false);
    else if (battle.elapsed >= battle.limit) {
      const playerRatio = playersAlive.reduce(
        (sum, fighter) => sum + fighter.hp / fighter.maxHp,
        0,
      );
      const enemyRatio = enemiesAlive.reduce(
        (sum, fighter) => sum + fighter.hp / fighter.maxHp,
        0,
      );
      battle.banner = "时限到 · 按剩余战力判定";
      this.finishBattle(playerRatio >= enemyRatio);
    }
  }

  private triggerYueGangSupport(source: Fighter, target: Fighter) {
    const battle = this.state.battle;
    const level = this.getActiveTraits().find((trait) => trait.id === "yue_gang")?.level || 0;
    if (!battle || !level || battle.yueGangTimer > 0 || source.team !== "player" || !source.yueGangMember) return;
    const liveTarget = target.alive ? target : this.nearestTarget(source, battle.enemy);
    if (!liveTarget) return;
    const supporters = battle.player
      .filter((fighter) => fighter !== source && fighter.alive && fighter.yueGangMember && fighter.jumpTime <= 0 && !fighter.jumpPending && fighter.stun <= 0)
      .filter((fighter) => Math.hypot(fighter.x - liveTarget.x, fighter.y - liveTarget.y) > fighter.range + liveTarget.radius + 12)
      .sort((left, right) => Math.hypot(left.x - liveTarget.x, left.y - liveTarget.y) - Math.hypot(right.x - liveTarget.x, right.y - liveTarget.y))
      .slice(0, level >= 2 ? 2 : 1);
    if (!supporters.length) return;
    battle.yueGangTimer = level >= 2 ? 3.5 : 5;
    supporters.forEach((fighter, index) => {
      const distance = Math.max(fighter.radius + liveTarget.radius + 14, fighter.range * 0.7) + index * 12;
      fighter.jumpFromX = fighter.x;
      fighter.jumpFromY = fighter.y;
      const landing = this.findOpenPlacement(
        fighter,
        { x: liveTarget.x - distance, y: liveTarget.y + (index ? 52 : -52) },
        [...battle.player, ...battle.enemy].filter((other) => other !== fighter),
      );
      fighter.jumpToX = landing.x;
      fighter.jumpToY = landing.y;
      this.faceTowardX(fighter, liveTarget.x);
      fighter.jumpDuration = 0.38;
      fighter.jumpTime = fighter.jumpDuration;
      this.addEffect({ kind: "ring", x: fighter.x, y: fighter.y, color: TRAITS.yue_gang.color, life: 0.35, size: fighter.radius * 1.5 });
    });
  }

  private basicAttack(source: Fighter, target: Fighter) {
    this.faceTowardX(source, target.x);
    source.cooldown = source.attackInterval;
    source.attackPulse = 0.22;
    source.attackTargetX = target.x;
    source.attackTargetY = target.y;
    const dealt = this.damage(source, target, source.attack);
    if (dealt >= 0) {
      this.addEnergy(source, source.energyOnAttack);
      this.addEnergy(target, target.energyOnHit);
    }
    if (source.burnOnHitPower > 0 && target.alive) {
      this.applyBurn(source, target, source.attack * source.burnOnHitPower);
    }
    if (source.spiceBurnOnHitPower > 0 && target.alive) {
      this.applyBurn(source, target, source.attack * source.spiceBurnOnHitPower);
    }
    this.triggerYueGangSupport(source, target);
    const def = UNIT_DEFS[source.unitId];
    this.addEffect({
      kind: source.attackType === "ranged" ? "line" : "burst",
      x: source.x,
      y: source.y,
      x2: target.x,
      y2: target.y,
      color: def.accent,
      life: source.attackType === "ranged" ? 0.16 : 0.24,
      size: source.attackType === "ranged" ? 3 : 22,
    });
    if (dealt > 0) this.addDamageText(target, dealt);
  }

  private castAbility(source: Fighter, targets: Fighter[]) {
    source.energy = Math.min(source.maxEnergy, source.castRefund);
    source.cooldown = Math.max(source.cooldown, 0.35);
    const def = UNIT_DEFS[source.unitId];
    const allies = this.living(source.team);
    const weakest = (units: Fighter[]) =>
      [...units].sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
    const farthest = (units: Fighter[]) =>
      [...units].sort(
        (a, b) =>
          Math.hypot(b.x - source.x, b.y - source.y) -
          Math.hypot(a.x - source.x, a.y - source.y),
      )[0];
    const densest = (units: Fighter[]) =>
      units.reduce(
        (best, candidate) => {
          const nearby = units.filter(
            (other) =>
              Math.hypot(candidate.x - other.x, candidate.y - other.y) < 125,
          ).length;
          return nearby > best.nearby ? { target: candidate, nearby } : best;
        },
        { target: units[0], nearby: 0 },
      ).target;
    const deal = (target: Fighter, multiplier: number, bonus = 0) => {
      const dealt = this.damage(
        source,
        target,
        source.attack * multiplier + bonus,
      );
      if (dealt > 0) this.addDamageText(target, dealt);
      return dealt;
    };
    const addShield = (target: Fighter, amount: number, capRatio = 0.55) =>
      this.grantShield(source, target, amount, capRatio);

    switch (source.unitId) {
      case "sui": {
        addShield(source, source.maxHp * 0.32, 0.48);
        const target = this.nearestTarget(source, targets);
        if (target) {
          deal(target, 0.75);
          target.stun = Math.max(target.stun, 0.45);
        }
        this.addEffect({ kind: "ring", x: source.x, y: source.y, color: def.accent, life: 0.7, size: 62 });
        break;
      }
      case "sun_guard": {
        this.grantShield(source, source, source.maxHp * 0.32, 0.48);
        const target = this.nearestTarget(source, targets);
        if (target) {
          const dealt = this.damage(source, target, source.attack * 0.75);
          target.stun = Math.max(target.stun, 0.45);
          if (dealt > 0) this.addDamageText(target, dealt);
        }
        this.addEffect({
          kind: "ring",
          x: source.x,
          y: source.y,
          color: def.accent,
          life: 0.7,
          size: 62,
        });
        break;
      }
      case "ember_blade": {
        const target = this.nearestTarget(source, targets);
        if (!target) break;
        for (let shot = 0; shot < 3; shot += 1) {
          const shotTarget = this.nearestTarget(source, targets);
          if (!shotTarget) break;
          if (shot === 2) {
            targets.filter((candidate) => Math.hypot(candidate.x - shotTarget.x, candidate.y - shotTarget.y) < 72).forEach((candidate) => {
              const dealt = this.damage(source, candidate, source.attack * (candidate === shotTarget ? 0.72 : 0.42));
              this.addDamageText(candidate, dealt);
            });
          } else {
            const dealt = this.damage(source, shotTarget, source.attack * 0.72);
            this.addDamageText(shotTarget, dealt);
          }
          this.addEffect({ kind: "line", x: source.x, y: source.y, x2: shotTarget.x, y2: shotTarget.y, color: def.accent, life: 0.2 + shot * 0.05, size: 3 });
        }
        break;
      }
      case "gale_archer": {
        const target = weakest(allies);
        if (!target) break;
        this.heal(source, target, target.maxHp * 0.2 + source.attack);
        this.addEffect({
          kind: "line",
          x: source.x,
          y: source.y,
          x2: target.x,
          y2: target.y,
          color: def.accent,
          life: 0.5,
          size: 4,
        });
        break;
      }
      case "rift_stalker": {
        const target = farthest(targets);
        if (!target) break;
        this.relocateFighter(source, { x: target.x + (source.team === "player" ? -36 : 36), y: target.y });
        deal(target, 1.4);
        addShield(source, source.maxHp * 0.12, 0.32);
        this.addEffect({
          kind: "burst",
          x: target.x,
          y: target.y,
          color: def.accent,
          life: 0.5,
          size: 42,
        });
        break;
      }
      case "cog_scribe": {
        [...allies]
          .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)
          .slice(0, 2)
          .forEach((target) => {
            this.heal(source, target, target.maxHp * 0.14 + source.attack * 0.8);
            this.addEffect({
              kind: "line",
              x: source.x,
              y: source.y,
              x2: target.x,
              y2: target.y,
              color: def.accent,
              life: 0.38,
              size: 3,
            });
          });
        break;
      }
      case "mossback": {
        this.heal(source, source, source.maxHp * 0.13);
        [...allies]
          .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)
          .slice(0, 2)
          .forEach((target) => {
            addShield(target, target.maxHp * 0.13, 0.36);
            this.addEffect({
              kind: "line",
              x: source.x,
              y: source.y,
              x2: target.x,
              y2: target.y,
              color: def.accent,
              life: 0.55,
              size: 4,
            });
          });
        break;
      }
      case "zeyin": {
        for (let shot = 0; shot < 2; shot += 1) {
          const target = this.nearestTarget(source, targets);
          if (!target) break;
          deal(target, 0.75);
          this.addEffect({ kind: "line", x: source.x, y: source.y, x2: target.x, y2: target.y, color: def.accent, life: 0.28, size: 3 });
        }
        source.attackInterval = Math.max(source.baseAttackInterval * 0.7, source.attackInterval * 0.85);
        break;
      }
      case "sui_blue": {
        const ordered = [...targets].sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp);
        for (let shot = 0; shot < 3; shot += 1) {
          const target = ordered[shot % ordered.length];
          if (!target?.alive) continue;
          deal(target, 0.72);
          this.addEffect({ kind: "line", x: source.x, y: source.y, x2: target.x, y2: target.y, color: def.accent, life: 0.28 + shot * 0.06, size: 3 });
        }
        break;
      }
      case "shiori": {
        [...allies]
          .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)
          .slice(0, 2)
          .forEach((target) => {
            addShield(target, target.maxHp * 0.17, 0.4);
            this.addEffect({ kind: "line", x: source.x, y: source.y, x2: target.x, y2: target.y, color: def.accent, life: 0.55, size: 4 });
          });
        break;
      }
      case "rift_brawler": {
        const target = this.nearestTarget(source, targets);
        if (!target) break;
        this.relocateFighter(source, { x: target.x + (source.team === "player" ? -42 : 42), y: target.y });
        const dealt = this.damage(source, target, source.attack * 1.7);
        this.applyBurn(source, target, source.attack * 1.1);
        if (dealt > 0) this.addDamageText(target, dealt);
        this.addEffect({
          kind: "burst",
          x: target.x,
          y: target.y,
          color: def.accent,
          life: 0.55,
          size: 48,
        });
        break;
      }
      case "spark_mage": {
        const center = targets.reduce(
          (best, candidate) => {
            const nearby = targets.filter(
              (other) =>
                Math.hypot(candidate.x - other.x, candidate.y - other.y) < 125,
            ).length;
            return nearby > best.nearby ? { target: candidate, nearby } : best;
          },
          { target: targets[0], nearby: 0 },
        ).target;
        targets
          .filter(
            (target) =>
              Math.hypot(target.x - center.x, target.y - center.y) < 125,
          )
          .forEach((target) => {
            const dealt = this.damage(source, target, source.attack * 1.65);
            target.stun = Math.max(target.stun, 0.45);
            if (dealt > 0) this.addDamageText(target, dealt);
          });
        this.addEffect({
          kind: "ring",
          x: center.x,
          y: center.y,
          color: def.accent,
          life: 0.8,
          size: 132,
        });
        break;
      }
      case "clock_gunner": {
        const target = this.nearestTarget(source, targets);
        if (!target) break;
        targets
          .filter((candidate) => Math.abs(candidate.y - target.y) < 72)
          .forEach((candidate) => {
            const dealt = this.damage(source, candidate, source.attack * 1.08);
            this.addDamageText(candidate, dealt);
          });
        this.addEffect({
          kind: "line",
          x: source.x,
          y: source.y,
          x2: source.team === "player" ? 1100 : 20,
          y2: target.y,
          color: def.accent,
          life: 0.48,
          size: 8,
        });
        break;
      }
      case "dawn_duelist": {
        const target = farthest(targets);
        if (!target) break;
        this.relocateFighter(source, { x: target.x + (source.team === "player" ? -38 : 38), y: target.y });
        deal(target, 1.6);
        target.stun = Math.max(target.stun, 0.75);
        this.addEffect({
          kind: "line",
          x: source.x,
          y: source.y,
          x2: target.x,
          y2: target.y,
          color: def.accent,
          life: 0.42,
          size: 6,
        });
        break;
      }
      case "grove_mender": {
        const center = densest(targets);
        if (!center) break;
        targets
          .filter((target) => Math.hypot(target.x - center.x, target.y - center.y) < 125)
          .forEach((target) => {
            deal(target, 1.3);
            target.stun = Math.max(target.stun, 0.65);
          });
        this.addEffect({ kind: "ring", x: center.x, y: center.y, color: def.accent, life: 0.75, size: 132 });
        break;
      }
      case "cinder_ram": {
        allies.forEach((ally) => this.heal(source, ally, ally.maxHp * 0.16 + source.attack * 0.65));
        targets.forEach((target) => {
          target.slowTime = Math.max(target.slowTime, 2.6);
          this.addEffect({ kind: "text", x: target.x, y: target.y - 38, color: def.accent, text: "减速", life: 0.6, size: 11 });
        });
        this.addEffect({ kind: "ring", x: source.x, y: source.y, color: def.accent, life: 0.75, size: 190 });
        break;
      }
      case "sui_bird": {
        const target = weakest(allies);
        if (!target) break;
        this.heal(source, target, target.maxHp * 0.18 + source.attack * 1.15);
        addShield(target, target.maxHp * 0.08, 0.32);
        targets
          .filter(
            (enemy) => Math.hypot(enemy.x - target.x, enemy.y - target.y) < 135,
          )
          .forEach((enemy) => deal(enemy, 0.9));
        this.relocateFighter(source, { x: target.x + (source.team === "player" ? -52 : 52), y: target.y - 20 });
        this.addEffect({
          kind: "ring",
          x: target.x,
          y: target.y,
          color: def.accent,
          life: 0.8,
          size: 140,
        });
        break;
      }
      case "sui_flower": {
        const center = densest(targets);
        if (!center) break;
        targets
          .filter((target) => Math.hypot(target.x - center.x, target.y - center.y) < 125)
          .forEach((target) => {
            deal(target, 1.45);
            target.stun = Math.max(target.stun, 0.7);
          });
        this.addEffect({ kind: "ring", x: center.x, y: center.y, color: def.accent, life: 0.8, size: 132 });
        break;
      }
      case "yua": {
        const ordered = [...targets].sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp);
        for (let shot = 0; shot < 3; shot += 1) {
          const target = ordered[shot % ordered.length];
          if (!target?.alive) continue;
          deal(target, 0.92);
          this.addEffect({ kind: "line", x: source.x, y: source.y, x2: target.x, y2: target.y, color: def.accent, life: 0.28 + shot * 0.06, size: 3 });
        }
        break;
      }
      case "mitsuri": {
        const target = this.nearestTarget(source, targets);
        if (target) {
          deal(target, 1.05);
          this.addEffect({ kind: "line", x: source.x, y: source.y, x2: target.x, y2: target.y, color: def.accent, life: 0.36, size: 3 });
        }
        const recipient = [...allies].sort((left, right) => left.energy - right.energy)[0];
        if (recipient) this.addEnergy(recipient, 18);
        break;
      }
      case "guangyi": {
        const target = farthest(targets);
        if (!target) break;
        const startX = source.x;
        const startY = source.y;
        this.relocateFighter(source, { x: target.x + (source.team === "player" ? -46 : 46), y: target.y });
        targets
          .filter((candidate) => {
            const distance = Math.hypot(candidate.x - startX, candidate.y - startY);
            const endpointDistance = Math.hypot(candidate.x - source.x, candidate.y - source.y);
            return distance + endpointDistance <= Math.hypot(source.x - startX, source.y - startY) + 42;
          })
          .forEach((candidate) => {
            deal(candidate, 1.1);
            candidate.stun = Math.max(candidate.stun, 0.6);
          });
        addShield(source, source.maxHp * 0.2, 0.45);
        this.addEffect({ kind: "line", x: startX, y: startY, x2: source.x, y2: source.y, color: def.accent, life: 0.5, size: 8 });
        break;
      }
      case "sui_cat": {
        const target = farthest(targets);
        if (!target) break;
        this.relocateFighter(source, { x: target.x + (source.team === "player" ? -34 : 34), y: target.y });
        let total = 0;
        for (let strike = 0; strike < 3 && target.alive; strike += 1)
          total += deal(target, 0.8);
        this.heal(source, source, total * 0.25);
        this.addEffect({ kind: "burst", x: target.x, y: target.y, color: def.accent, life: 0.72, size: 66 });
        break;
      }
      case "nagisa": {
        allies.forEach((target) => addShield(target, target.maxHp * 0.1, 0.42));
        targets
          .filter((target) => Math.hypot(target.x - source.x, target.y - source.y) < 150)
          .forEach((target) => {
            deal(target, 0.8);
            target.stun = Math.max(target.stun, 0.85);
          });
        this.addEffect({ kind: "ring", x: source.x, y: source.y, color: def.accent, life: 0.9, size: 165 });
        break;
      }
      case "biscuit_sui": {
        const center = densest(targets);
        if (!center) break;
        this.relocateFighter(source, { x: center.x + (source.team === "player" ? -42 : 42), y: center.y });
        targets
          .filter((target) => Math.hypot(target.x - center.x, target.y - center.y) < 145)
          .forEach((target) => {
            deal(target, 1.85);
            target.stun = Math.max(target.stun, 0.85);
          });
        addShield(source, source.maxHp * 0.22, 0.55);
        this.addEffect({ kind: "ring", x: center.x, y: center.y, color: def.accent, life: 0.95, size: 155 });
        break;
      }
      case "nori": {
        source.applePieShotsRemaining = NORI_APPLE_PIE_SHOTS;
        source.applePieShotTimer = 0;
        this.addEffect({ kind: "ring", x: source.x, y: source.y, color: def.accent, life: 0.44, size: 74 });
        this.addEffect({ kind: "burst", x: source.x, y: source.y, color: def.accent, life: 0.22, size: 30 });
        break;
      }
      case "meme": {
        let total = 0;
        targets.filter((target) => Math.hypot(target.x - source.x, target.y - source.y) < 115).forEach((target) => {
          target.stun = Math.max(target.stun, 0.55);
          total += deal(target, 0.9);
        });
        this.heal(source, source, total * 0.35);
        this.addEffect({ kind: "ring", x: source.x, y: source.y, color: def.accent, life: 0.65, size: 118 });
        break;
      }
      case "kioi": {
        const target = this.nearestTarget(source, targets);
        if (!target) break;
        deal(target, 1.25);
        target.weakenTime = Math.max(target.weakenTime, 3);
        if (target.weakenArmorPenalty === 0) {
          target.weakenArmorPenalty = 10;
          target.armor -= target.weakenArmorPenalty;
        }
        this.addEffect({ kind: "text", x: target.x, y: target.y - 38, color: def.accent, text: "讨厌你", life: 0.65, size: 12 });
        this.addEffect({ kind: "line", x: source.x, y: source.y, x2: target.x, y2: target.y, color: def.accent, life: 0.5, size: 5 });
        break;
      }
      case "nightin": {
        const center = densest(targets);
        if (!center) break;
        targets.filter((target) => Math.hypot(target.x - center.x, target.y - center.y) < 125).forEach((target) => { deal(target, 1.3); this.applyBurn(source, target, source.attack * 0.6); target.stun = Math.max(target.stun, 0.5); });
        this.addEffect({ kind: "ring", x: center.x, y: center.y, color: def.accent, life: 0.7, size: 135 });
        break;
      }
      case "tiandou": {
        [...allies].sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp).slice(0, 2).forEach((target) => {
          this.heal(source, target, target.maxHp * 0.14 + source.attack * 0.7);
          target.moveSpeed += 10;
        });
        this.addEffect({ kind: "ring", x: source.x, y: source.y, color: def.accent, life: 0.65, size: 110 });
        break;
      }
      case "youyi": {
        const target = farthest(targets);
        if (!target) break;
        this.relocateFighter(source, { x: target.x + (source.team === "player" ? -36 : 36), y: target.y });
        deal(target, 0.78);
        deal(target, 0.78);
        target.stun = Math.max(target.stun, 0.45);
        this.addEffect({ kind: "burst", x: target.x, y: target.y, color: def.accent, life: 0.55, size: 56 });
        break;
      }
      case "akirinco": {
        const target = weakest(targets);
        if (!target) break;
        this.relocateFighter(source, { x: target.x + (source.team === "player" ? -34 : 34), y: target.y });
        let total = 0;
        for (let strike = 0; strike < 3 && target.alive; strike += 1) total += deal(target, 0.82);
        if (!target.alive) this.heal(source, source, total * 0.3);
        this.addEffect({ kind: "burst", x: target.x, y: target.y, color: def.accent, life: 0.68, size: 68 });
        break;
      }
      case "lovely": {
        const center = densest(targets);
        if (!center) break;
        this.relocateFighter(source, { x: center.x + (source.team === "player" ? -42 : 42), y: center.y });
        let hits = 0;
        targets.filter((target) => Math.hypot(target.x - center.x, target.y - center.y) < 135).forEach((target) => { deal(target, 1.22); hits += 1; });
        source.attackInterval /= 1 + Math.min(0.3, hits * 0.06);
        source.baseAttackInterval = source.attackInterval;
        this.addEffect({ kind: "ring", x: center.x, y: center.y, color: def.accent, life: 0.72, size: 142 });
        break;
      }
      case "mumu": {
        const center = densest(targets);
        if (!center) break;
        this.relocateFighter(source, { x: center.x + (source.team === "player" ? -44 : 44), y: center.y });
        targets.filter((target) => Math.hypot(target.x - center.x, target.y - center.y) < 125).forEach((target) => deal(target, 1.15));
        allies.filter((ally) => Math.hypot(ally.x - source.x, ally.y - source.y) < 150).forEach((ally) => addShield(ally, ally.maxHp * 0.12, 0.38));
        this.addEffect({ kind: "ring", x: center.x, y: center.y, color: def.accent, life: 0.75, size: 136 });
        break;
      }
      case "rei": {
        const center = densest(targets);
        if (!center) break;
        targets.filter((target) => Math.hypot(target.x - center.x, target.y - center.y) < 145).forEach((target) => { deal(target, 1.85); this.applyBurn(source, target, source.attack * 0.8); target.stun = Math.max(target.stun, 0.72); });
        this.addEffect({ kind: "ring", x: center.x, y: center.y, color: def.accent, life: 0.9, size: 152 });
        break;
      }
      case "lian": {
        const center = densest(targets);
        if (!center) break;
        targets.filter((target) => Math.hypot(target.x - center.x, target.y - center.y) < 140).forEach((target) => deal(target, 1.55));
        allies.forEach((ally) => { this.addEnergy(ally, 15); });
        this.addEffect({ kind: "ring", x: center.x, y: center.y, color: def.accent, life: 0.85, size: 150 });
        break;
      }
      case "rutice": {
        allies.forEach((target) => addShield(target, target.maxHp * 0.16, 0.5));
        this.heal(source, source, source.maxHp * 0.2);
        targets.filter((target) => Math.hypot(target.x - source.x, target.y - source.y) < 160).forEach((target) => { deal(target, 0.9); target.stun = Math.max(target.stun, 0.8); });
        this.addEffect({ kind: "ring", x: source.x, y: source.y, color: def.accent, life: 0.9, size: 172 });
        break;
      }
      case "rift_tyrant": {
        targets.forEach((target) => {
          const dealt = this.damage(source, target, source.attack * 1.05);
          target.stun = Math.max(target.stun, 0.55);
          if (dealt > 0) this.addDamageText(target, dealt);
        });
        this.addEffect({
          kind: "ring",
          x: source.x,
          y: source.y,
          color: def.accent,
          life: 1,
          size: 430,
        });
        break;
      }
      default: {
        const exhaustiveUnit: never = source.unitId;
        return exhaustiveUnit;
      }
    }

    this.addEffect({
      kind: "text",
      x: source.x,
      y: source.y - 48,
      color: def.accent,
      text: def.abilityName,
      life: 0.85,
      size: 14,
    });
  }

  private damage(source: Fighter, target: Fighter, rawAmount: number) {
    const dodged = target.dodgeChance > 0 && this.rng.next() < target.dodgeChance;
    if (dodged) {
      this.addEffect({ kind: "text", x: target.x, y: target.y - 38, color: "#d9e6f4", text: "闪避", life: 0.55, size: 12 });
      return -1;
    }
    if (!source.alive || !target.alive) return 0;
    let amount = rawAmount * (source.weakenTime > 0 ? 0.72 : 1);
    if (
      source.team === "player" &&
      source.lowHealthBonus > 0 &&
      target.hp / target.maxHp < 0.5
    ) {
      amount *= 1 + source.lowHealthBonus;
    }
    if (
      source.team === "player" &&
      this.state.augments.includes("execution") &&
      target.hp / target.maxHp < 0.4
    )
      amount *= 1.28;
    if (
      source.team === "player" &&
      source.critChance > 0 &&
      this.rng.next() < source.critChance
    ) {
      amount *= source.critMultiplier;
      this.addEffect({
        kind: "text",
        x: target.x,
        y: target.y - 45,
        color: "#ffd86b",
        text: "暴击",
        life: 0.48,
        size: 11,
      });
    }
    amount *= 100 / (100 + Math.max(-50, target.armor));
    let remaining = amount;
    let absorbed = 0;
    if (target.shield > 0) {
      absorbed = Math.min(target.shield, remaining);
      target.shield -= absorbed;
      remaining -= absorbed;
    }
    const hpLoss = Math.min(target.hp, remaining);
    target.hp -= hpLoss;
    const effectiveApplied = absorbed + hpLoss;
    source.damageDealt += effectiveApplied;
    target.damageTaken += effectiveApplied;
    if (hpLoss > 0) target.hitPulse = 0.2;
    if (source.lifesteal > 0)
      this.heal(source, source, hpLoss * source.lifesteal, false);

    if (
      target.team === "player" &&
      this.state.augments.includes("second_wind") &&
      !target.secondWindUsed &&
      target.hp > 0 &&
      target.hp / target.maxHp < 0.3
    ) {
      target.secondWindUsed = true;
      this.heal(target, target, target.maxHp * 0.18);
    }

    if (target.hp <= 0) {
      this.killFighter(target);
      if (source.team === "player") this.state.score += 12;
    }
    return effectiveApplied;
  }

  private applyBurn(source: Fighter, target: Fighter, totalDamage: number) {
    if (!target.alive) return;
    const starterMultiplier =
      source.team === "player" ? starterEffects[this.state.starter || "bastion"].burnMultiplier || 1 : 1;
    const dps = (totalDamage * starterMultiplier) / 3;
    if (dps >= target.burnDps) {
      target.burnDps = dps;
      target.burnSourceFid = source.fid;
    }
    target.burnTime = 3;
  }

  private grantShield(
    source: Fighter | null,
    target: Fighter,
    amount: number,
    capRatio = 0.55,
    battle = this.state.battle,
  ) {
    if (!target.alive || amount <= 0) return 0;
    const starterMultiplier =
      target.team === "player" ? starterEffects[this.state.starter || "bastion"].shieldMultiplier || 1 : 1;
    const before = target.shield;
    target.shield = Math.min(
      target.maxHp * capRatio * starterMultiplier,
      target.shield + amount * starterMultiplier,
    );
    const granted = target.shield - before;
    if (source && battle) source.shieldingDone += granted;
    return granted;
  }

  private heal(
    source: Fighter | null,
    target: Fighter,
    amount: number,
    showEffect = true,
  ) {
    if (!target.alive || amount <= 0) return 0;
    const before = target.hp;
    target.hp = Math.min(target.maxHp, target.hp + amount);
    const healed = target.hp - before;
    if (source) source.healingDone += healed;
    if (showEffect && healed > 1) {
      this.addEffect({
        kind: "heal",
        x: target.x,
        y: target.y,
        color: "#74f0ac",
        text: `+${Math.round(healed)}`,
        life: 0.75,
        size: 15,
      });
    }
    return healed;
  }

  private addDamageText(target: Fighter, amount: number) {
    this.addEffect({
      kind: "text",
      x: target.x,
      y: target.y - 28,
      color: "#ffffff",
      text: `${Math.max(1, Math.round(amount))}`,
      life: 0.55,
      size: 14,
    });
  }

  private killFighter(target: Fighter) {
    if (!target.alive) return;
    target.alive = false;
    target.hp = 0;
    this.addEffect({
      kind: "burst",
      x: target.x,
      y: target.y,
      color: UNIT_DEFS[target.unitId].accent,
      life: 0.7,
      size: 58,
    });
  }

  private finishBattle(won: boolean) {
    if (this.state.phase !== "battle" || !this.state.battle) return;
    const wave = this.currentWave;
    const interest = Math.min(2, Math.floor(this.state.gold / 10));
    let income = 0;
    let damage = 0;
    const debtPayment = this.state.paydayDebtRounds > 0 ? 1 : 0;
    if (debtPayment) this.state.paydayDebtRounds -= 1;

    if (won) {
      this.state.streak += 1;
      this.state.victories += 1;
      const streakBonus = Math.min(2, Math.max(0, this.state.streak - 1));
      const eliteBonus = wave.tag === "elite" ? 2 : 0;
      const blazeBonus =
        this.state.victories === 1 ? starterEffects[this.state.starter || "bastion"].firstWinGold || 0 : 0;
      income =
        5 +
        interest +
        streakBonus +
        eliteBonus +
        blazeBonus +
        this.state.incomeBonus -
        debtPayment;
      this.state.gold += income;
      const healthRatio = this.living("player").reduce(
        (sum, fighter) => sum + fighter.hp / fighter.maxHp,
        0,
      );
      this.state.score += Math.round(
        this.state.round * 120 + healthRatio * 32 + this.state.streak * 15,
      );
      this.state.result = {
        won: true,
        headline: wave.tag === "boss" ? "裂隙封闭" : "战线守住了",
        detail: `基础 5 + 利息 ${interest} + 连胜 ${streakBonus}${eliteBonus ? ` + 精英 ${eliteBonus}` : ""}${blazeBonus ? ` + 首胜 ${blazeBonus}` : ""}${debtPayment ? " - 花呗还款 1" : ""}`,
        income,
        upgradeDiscount:
          this.state.round < Number.MAX_SAFE_INTEGER && !this.isMaxPlayerLevel
            ? PASSIVE_UPGRADE_DISCOUNT
            : 0,
        damage: 0,
      };
    } else {
      const enemySurvivors = this.living("enemy").length;
      this.state.streak = 0;
      damage = Math.min(
        8,
        2 +
          Math.floor((this.state.round - 1) / 3) +
          Math.min(3, enemySurvivors),
      );
      this.state.hp = Math.max(0, this.state.hp - damage);
      income =
        4 + interest + this.state.incomeBonus + (this.state.hp > 0 ? 1 : 0) - debtPayment;
      this.state.gold += income;
      this.state.score += this.state.round * 35;
      this.state.result = {
        won: false,
        headline: this.state.hp > 0 ? "防线后撤" : "核心失守",
        detail:
          this.state.hp > 0
            ? "获得 1 金币整备补偿。调整前后排仍有机会。"
            : "本次阵容止步于此。",
        income,
        upgradeDiscount:
          this.state.hp > 0 && !this.isMaxPlayerLevel
            ? PASSIVE_UPGRADE_DISCOUNT
            : 0,
        damage,
      };
    }

    this.state.phase = "result";
  }

  public continueAfterResult() {
    const result = this.state.result;
    if (this.state.phase !== "result" || !result) return;
    if (this.state.hp <= 0) {
      this.endGame(false);
      return;
    }
    if (result.upgradeDiscount > 0 && !this.isMaxPlayerLevel) {
      this.state.upgradeRemaining = Math.max(
        1,
        this.state.upgradeRemaining - result.upgradeDiscount,
      );
    }
    if (this.state.round === CAMPAIGN_ROUNDS && result.won) {
      this.state.endlessUnlocked = true;
      this.state.score += this.state.hp * 45 + 500;
      this.setToast("八战通关！无限裂隙已开启，挑战将持续升级。", "good");
    }
    if (
      this.state.round === 2 ||
      this.state.round === 5 ||
      (this.state.round > CAMPAIGN_ROUNDS &&
        (this.state.round - CAMPAIGN_ROUNDS) % 6 === 0 &&
        this.state.augments.length < AUGMENTS.length)
    ) {
      this.state.augmentChoices = this.rollAugmentChoices();
      this.state.phase = "augment";
      this.state.battle = null;
      this.state.result = null;
      return;
    }
    this.prepareNextRound();
  }

  private rollAugmentChoices() {
    const pool = AUGMENTS.map((augment) => augment.id).filter(
      (id) => !this.state.augments.includes(id),
    );
    const choices: AugmentId[] = [];
    while (choices.length < 3 && pool.length) {
      const index = Math.floor(this.rng.next() * pool.length);
      choices.push(pool.splice(index, 1)[0]);
    }
    return choices;
  }

  public chooseAugment(index: number) {
    if (this.state.phase !== "augment") return;
    const id = this.state.augmentChoices[index];
    if (!id) return;
    this.state.augments.push(id);
    this.state.augmentHistory.push({ round: this.state.round, id });
    if (id === "payday") {
      this.state.gold += 10;
      this.state.paydayDebtRounds = 4;
    }
    this.state.score += 75;
    this.setToast(
      `已装配战术契印：${AUGMENTS.find((augment) => augment.id === id)?.name}`,
      "good",
    );
    this.prepareNextRound();
  }

  private prepareNextRound() {
    this.state.round += 1;
    this.state.phase = "preparation";
    this.state.battle = null;
    this.state.result = null;
    this.state.selected = null;
    this.state.augmentChoices = [];
    if (!this.state.shopLocked) this.state.shop = this.generateShop();
  }

  private endGame(won: boolean) {
    this.state.finalWon = won;
    if (won && !this.state.endlessUnlocked)
      this.state.score += this.state.hp * 45 + this.state.gold * 10 + 500;
    this.state.bestScore = Math.max(this.state.bestScore, this.state.score);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        "rift-line-best-score",
        String(this.state.bestScore),
      );
    }
    this.state.phase = "gameover";
    this.state.battle = null;
    this.state.result = null;
  }

  public renderTextState() {
    const phaseLabels: Record<GamePhase, string> = {
      title: "选择开局协议",
      preparation: "购买与布阵",
      battle: "自动战斗",
      result: "回合结算",
      augment: "选择战术契印",
      gameover: "本局结束",
    };
    const unitSummary = (unit: OwnedUnit | null, index: number) =>
      unit && {
        index,
        grid: { column: index % 6, row: Math.floor(index / 6) },
        id: unit.id,
        name: UNIT_DEFS[unit.id].name,
        star: unit.star,
      };
    const battle = this.state.battle;
    return JSON.stringify({
      coordinateSystem: "画布 1120x720；原点在左上，x 向右、y 向下。",
      phase: this.state.phase,
      phaseLabel: phaseLabels[this.state.phase],
      round: this.state.round,
      maxRounds: this.state.maxRounds,
      campaignCleared: this.state.endlessUnlocked,
      endlessRound: Math.max(0, this.state.round - CAMPAIGN_ROUNDS),
      wave: this.currentWave
        ? {
            name: this.currentWave.name,
            tag: this.currentWave.tag,
            description: this.currentWave.description,
          }
        : null,
      player: {
        hp: this.state.hp,
        maxHp: this.state.maxHp,
        gold: this.state.gold,
        level: this.state.playerLevel,
        bookLevel: bookLevelForPlayerLevel(this.state.playerLevel),
        upgradeRemaining: this.upgradeCost,
        nextLevelInitialCost: this.isMaxPlayerLevel
          ? null
          : upgradeCostForLevel(this.state.playerLevel),
        maxLevel: this.isMaxPlayerLevel,
        score: this.state.score,
        streak: this.state.streak,
        boardCount: this.boardCount,
        boardCap: this.boardCap,
      },
      roster: {
        purchasableUnits: SHOP_UNITS.length,
        tierCounts: SHOP_TIER_COUNTS,
        currentTierOdds: tierOddsForLevel(this.state.playerLevel),
      },
      board: this.state.board.map(unitSummary).filter(Boolean),
      bench: this.state.bench.map(unitSummary).filter(Boolean),
      shop: this.state.shop
        .map(
          (id, index) =>
            id && {
              index,
              id,
              name: UNIT_DEFS[id].name,
              cost: UNIT_DEFS[id].cost,
            },
        )
        .filter(Boolean),
      shopLocked: this.state.shopLocked,
      activeTraits: this.getActiveTraits().map((trait) => ({
        name: trait.name,
        family: trait.family,
        count: trait.count,
        level: trait.level,
        description: trait.description,
      })),
      augments: this.state.augments.map(
        (id) => AUGMENTS.find((augment) => augment.id === id)?.name,
      ),
      starterHistory: this.state.starterHistory.map(({ id }) => {
        const starter = STARTERS.find((item) => item.id === id);
        return { name: starter?.name, description: starter?.description };
      }),
      augmentHistory: this.state.augmentHistory.map(({ round, id }) => ({
        round,
        name: AUGMENTS.find((augment) => augment.id === id)?.name,
        description: AUGMENTS.find((augment) => augment.id === id)?.description,
      })),
      starterChoices: this.state.starterChoices.map((id, index) => {
        const starter = STARTERS.find((item) => item.id === id);
        return { index, id, name: starter?.name, description: starter?.description };
      }),
      augmentChoices: this.state.augmentChoices.map((id, index) => ({
        index,
        name: AUGMENTS.find((augment) => augment.id === id)?.name,
      })),
      selected: this.state.selected,
      battle: battle && {
        elapsed: Number(battle.elapsed.toFixed(1)),
        timeRemaining: Number(
          Math.max(0, battle.limit - battle.elapsed).toFixed(1),
        ),
        playerUnits: battle.player
          .filter((unit) => unit.alive)
          .map((unit) => ({
            ...this.summarizeBattleFighter(unit),
            energy: Math.round(unit.energy),
            x: Math.round(unit.x),
            y: Math.round(unit.y),
            radius: unit.radius,
            facingX: unit.facingX,
            attacking: unit.attackPulse > 0,
            hit: unit.hitPulse > 0,
            jumpPending: unit.jumpPending,
            jumping: unit.jumpTime > 0,
            jumpFrom: { x: Math.round(unit.jumpFromX), y: Math.round(unit.jumpFromY) },
            jumpTo: { x: Math.round(unit.jumpToX), y: Math.round(unit.jumpToY) },
          })),
        ranking: {
          open: battle.rankingOpen,
          metric: battle.rankingMetric,
          playerRows: this.getBattleRanking("player").map(({ fighter, value }) =>
            this.summarizeBattleFighter(fighter, value),
          ),
          enemyRows: this.getBattleRanking("enemy").map(({ fighter, value }) =>
            this.summarizeBattleFighter(fighter, value),
          ),
        },
        enemyUnits: battle.enemy
          .filter((unit) => unit.alive)
          .map((unit) => ({
            ...this.summarizeBattleFighter(unit),
            energy: Math.round(unit.energy),
            x: Math.round(unit.x),
            y: Math.round(unit.y),
            radius: unit.radius,
            facingX: unit.facingX,
            attacking: unit.attackPulse > 0,
            hit: unit.hitPulse > 0,
            jumpPending: unit.jumpPending,
            jumping: unit.jumpTime > 0,
            jumpFrom: { x: Math.round(unit.jumpFromX), y: Math.round(unit.jumpFromY) },
            jumpTo: { x: Math.round(unit.jumpToX), y: Math.round(unit.jumpToY) },
          })),
        allPlayerUnits: battle.player.map((unit) => this.summarizeBattleFighter(unit)),
        allEnemyUnits: battle.enemy.map((unit) => this.summarizeBattleFighter(unit)),
      },
      result: this.state.result,
      availableActions:
        this.state.phase === "preparation"
          ? [
              "点击商店购买",
              `点击升本：一次支付 ${this.upgradeCost ?? 0} 金币升至下一本`,
              "点击锁定/解锁保留下回合商店",
              "点击单位再点击格子移动/交换",
              "点击回收出售选中单位",
              "R 刷新商店",
              "Space 开始战斗",
              "F 全屏",
            ]
          : this.state.phase === "augment"
            ? ["点击一个战术契印"]
            : this.state.phase === "title"
              ? ["点击一个开局协议"]
              : this.state.phase === "gameover"
                ? ["点击再来一局"]
                : this.state.phase === "battle"
                  ? ["自动战斗中", "点击战斗统计或按 D 展开/收起", "F 全屏"]
                  : ["查看双方战斗统计", "点击继续进入下一阶段", "F 全屏"],
      toast: this.state.toast?.text || null,
    });
  }
}
