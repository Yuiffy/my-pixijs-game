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
  stun: number;
  burnTime: number;
  burnDps: number;
  burnSourceFid: string | null;
  lifesteal: number;
  burnOnHitPower: number;
  energyPerHit: number;
  lowHealthBonus: number;
  critChance: number;
  critMultiplier: number;
  castRefund: number;
  secondWindUsed: boolean;
  enraged: boolean;
  attackPulse: number;
  attackTargetX: number;
  attackTargetY: number;
  hitPulse: number;
  jumpPending: boolean;
  jumpDelay: number;
  jumpTime: number;
  jumpDuration: number;
  jumpFromX: number;
  jumpFromY: number;
  jumpToX: number;
  jumpToY: number;
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
  board: Array<OwnedUnit | null>;
  bench: Array<OwnedUnit | null>;
  shop: Array<UnitId | null>;
  shopLocked: boolean;
  selected: UnitLocation | null;
  augments: AugmentId[];
  augmentChoices: AugmentId[];
  incomeBonus: number;
  battle: BattleState | null;
  result: RoundResult | null;
  resultTimer: number;
  finalWon: boolean;
  toast: ToastState | null;
}

const BOARD_SIZE = 24;
const BENCH_SIZE = 8;
const SHOP_SIZE = 5;
const STAR_SCALE = [0, 1, 1.68, 2.82];
const BATTLE_BOUNDS = { left: 52, right: 1068, top: 145, bottom: 625 };

export const fighterVisualRadius = (unitId: UnitId, star: 1 | 2 | 3) => {
  if (unitId === "rift_tyrant") return 43;
  const largeUnit = [
    "brass_colossus",
    "rift_warden",
    "siege_walker",
    "solar_champion",
    "chrono_titan",
  ].includes(unitId);
  return (largeUnit ? 31 : 26) + (star - 1) * 3;
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

export class AutoChessEngine {
  public state: GameState;

  private rng: RandomSource;

  private uid = 1;

  constructor(seed = freshSeed()) {
    this.rng = createSeededRandom(seed);
    this.state = this.createInitialState(seed, loadBestScore());
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
      board: emptySlots<OwnedUnit>(BOARD_SIZE),
      bench: emptySlots<OwnedUnit>(BENCH_SIZE),
      shop: emptySlots<UnitId>(SHOP_SIZE),
      shopLocked: false,
      selected: null,
      augments: [],
      augmentChoices: [],
      incomeBonus: 0,
      battle: null,
      result: null,
      resultTimer: 0,
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
  }

  public startRun(starterId: StarterId) {
    const starter = STARTERS.find((item) => item.id === starterId);
    if (!starter) return;

    const seed = this.state.seed;
    const best = this.state.bestScore;
    this.rng = createSeededRandom(seed);
    this.uid = 1;
    this.state = this.createInitialState(seed, best);
    this.state.phase = "preparation";
    this.state.starter = starterId;
    this.state.hp = starterId === "bastion" ? 24 : 20;
    this.state.maxHp = this.state.hp;
    this.state.gold = starterId === "echo" ? 9 : 8;

    const starterUnit: OwnedUnit = {
      uid: this.uid++,
      id: starter.unit,
      star: 1,
    };
    // 6x4 部署网格：远程默认站在第二行最后方，近战默认站在第二行最前方。
    const preferredSlot = UNIT_DEFS[starter.unit].range > 100 ? 6 : 11;
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

  public getBattleRanking() {
    const battle = this.state.battle;
    if (!battle) return [];
    const metric = battle.rankingMetric;
    const valueFor = (fighter: Fighter) => {
      if (metric === "damage") return fighter.damageDealt;
      if (metric === "support") return fighter.healingDone + fighter.shieldingDone;
      return fighter.damageTaken;
    };
    return [...battle.player]
      .sort((left, right) =>
        valueFor(right) - valueFor(left) || left.fid.localeCompare(right.fid),
      )
      .map((fighter) => ({ fighter, value: valueFor(fighter) }));
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
    const counts = this.getTraitCounts();
    return (Object.keys(TRAITS) as TraitId[])
      .map((trait) => {
        const definition = TRAITS[trait];
        const level = traitLevelForCount(definition, counts[trait]);
        return {
          ...definition,
          count: counts[trait],
          level,
          description:
            level > 0 ? definition.bonuses[level - 1] : definition.description,
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
    if (this.state.gold < 1) {
      this.setToast("金币不足，无法刷新商店。", "bad");
      return;
    }
    this.state.gold -= 1;
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
      const aegisLevel = def.traits.includes("aegis") ? traitLevel("aegis") : 0;
      const emberLevel = def.traits.includes("ember") ? traitLevel("ember") : 0;
      const wildLevel = def.traits.includes("wild") ? traitLevel("wild") : 0;
      const riftLevel = def.traits.includes("rift") ? traitLevel("rift") : 0;
      const clockworkLevel = def.traits.includes("clockwork")
        ? traitLevel("clockwork")
        : 0;
      const vanguardLevel = def.traits.includes("vanguard")
        ? traitLevel("vanguard")
        : 0;
      const rangerLevel = def.traits.includes("ranger")
        ? traitLevel("ranger")
        : 0;
      const mysticLevel = def.traits.includes("mystic")
        ? traitLevel("mystic")
        : 0;
      const brawlerLevel = def.traits.includes("brawler")
        ? traitLevel("brawler")
        : 0;
      const assassinLevel = def.traits.includes("assassin")
        ? traitLevel("assassin")
        : 0;
      const suiFormsLevel = def.traits.includes("sui_forms")
        ? traitLevel("sui_forms")
        : 0;
      const isRanged = def.range >= 160;
      const globalEmberLevel = globalTraitLevel("ember");
      const globalWildLevel = globalTraitLevel("wild");
      const globalRiftLevel = globalTraitLevel("rift");
      const globalClockworkLevel = globalTraitLevel("clockwork");
      const globalVanguardLevel = globalTraitLevel("vanguard");
      const globalRangerLevel = globalTraitLevel("ranger");
      const globalMysticLevel = globalTraitLevel("mystic");
      const globalBrawlerLevel = globalTraitLevel("brawler");
      const globalAssassinLevel = globalTraitLevel("assassin");
      const globalSuiFormsLevel = globalTraitLevel("sui_forms");

      if (aegisLevel) {
        maxHp *= [1, 1.07, 1.14, 1.23][aegisLevel];
        armor += [0, 12, 25, 42][aegisLevel];
      }
      if (vanguardLevel) {
        maxHp *= [1, 1.12, 1.25, 1.42][vanguardLevel];
        armor += [0, 8, 18, 32][vanguardLevel];
      }
      if (rangerLevel) attackInterval /= [1, 1.12, 1.26, 1.45][rangerLevel];
      if (clockworkLevel)
        attackInterval /= [1, 1.1, 1.22, 1.38][clockworkLevel];
      if (brawlerLevel) attack *= [1, 1.12, 1.26, 1.45][brawlerLevel];
      if (!isRanged) {
        if (globalVanguardLevel >= 2) {
          maxHp *= globalVanguardLevel === 3 ? 1.16 : 1.08;
          armor += globalVanguardLevel === 3 ? 12 : 6;
        }
        if (globalWildLevel >= 2) {
          // Applied below through the fighter lifesteal field.
        }
        if (globalBrawlerLevel >= 2)
          attack *= globalBrawlerLevel === 3 ? 1.2 : 1.1;
      } else {
        if (globalRangerLevel >= 2)
          attackInterval /= globalRangerLevel === 3 ? 1.3 : 1.15;
        if (globalClockworkLevel >= 2)
          attackInterval /= globalClockworkLevel === 3 ? 1.22 : 1.1;
      }
      if (hasAugment("tempered")) armor += 16;
      if (hasAugment("sharp_edge")) attack *= 1.15;
      if (hasAugment("momentum")) attackInterval /= 1.18;

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
        moveSpeed: def.moveSpeed,
        cooldown: this.rng.next() * 0.25,
        energy:
          [0, 20, 45, 70][mysticLevel] +
          [0, 0, 10, 22][globalMysticLevel] +
          [0, 10, 22, 35][suiFormsLevel] +
          [0, 0, 8, 18][globalSuiFormsLevel] +
          (hasAugment("overclock") ? 35 : 0),
        stun: 0,
        burnTime: 0,
        burnDps: 0,
        burnSourceFid: null,
        lifesteal:
          [0, 0.08, 0.15, 0.24][wildLevel] +
          [0, 0, 0.06, 0.12][globalWildLevel] * (isRanged ? 0 : 1) +
          [0, 0.08, 0.15, 0.24][suiFormsLevel] +
          (wildLevel && this.state.starter === "echo" ? 0.06 : 0),
        burnOnHitPower: Math.max(
          [0, 0.35, 0.65, 1.05][emberLevel],
          isRanged ? [0, 0, 0.25, 0.5][globalEmberLevel] : 0,
        ),
        energyPerHit:
          [0, 4, 8, 14][clockworkLevel] +
          (isRanged && globalClockworkLevel === 3 ? 4 : 0),
        lowHealthBonus: Math.max(
          [0, 0.15, 0.32, 0.55][riftLevel],
          [0, 0, 0.1, 0.2][globalRiftLevel],
        ),
        critChance:
          [0, 0.15, 0.3, 0.5][assassinLevel] +
          (isRanged ? [0, 0, 0.12, 0.25][globalAssassinLevel] : 0),
        critMultiplier: 1.65,
        castRefund: [0, 0, 8, 15][mysticLevel],
        secondWindUsed: false,
        enraged: false,
        jumpPending: assassinLevel > 0,
        jumpDelay: assassinLevel ? 3.4 + spawn.row * 0.12 : 0,
        jumpTime: 0,
        jumpDuration: assassinLevel ? 0.68 : 0,
        attackPulse: 0,
        attackTargetX: spawn.x,
        attackTargetY: spawn.y,
        hitPulse: 0,
        jumpFromX: spawn.x,
        jumpFromY: spawn.y,
        jumpToX: spawn.x,
        jumpToY: spawn.y,
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
        cooldown: this.rng.next() * 0.4,
        energy: wave.tag === "boss" ? 28 : 0,
        stun: 0,
        burnTime: 0,
        burnDps: 0,
        burnSourceFid: null,
        lifesteal: 0,
        burnOnHitPower: 0,
        energyPerHit: 0,
        lowHealthBonus: 0,
        critChance: 0,
        critMultiplier: 1.65,
        castRefund: 0,
        secondWindUsed: false,
        enraged: false,
        attackPulse: 0,
        attackTargetX: 990 - rank * 96,
        attackTargetY: 180 + row * 165,
        hitPulse: 0,
        jumpPending: false,
        jumpDelay: 0,
        jumpTime: 0,
        jumpDuration: 0,
        jumpFromX: 990 - rank * 96,
        jumpFromY: 180 + row * 165,
        jumpToX: 990 - rank * 96,
        jumpToY: 180 + row * 165,
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
    const aegisLevel = globalTraitLevel("aegis");
    if (aegisLevel >= 2) {
      battle.player.forEach((fighter) =>
        this.grantShield(null, fighter, fighter.maxHp * (aegisLevel === 3 ? 0.16 : 0.08), 0.55, battle),
      );
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

  private prepareAssassinJump(fighter: Fighter, battle: BattleState) {
    const backlineTargets = battle.enemy
      .filter((enemy) => enemy.alive)
      .sort((a, b) => b.x - a.x);
    const target = backlineTargets[0];
    if (!target) return false;

    const occupied = [...battle.player, ...battle.enemy]
      .filter((other) => other.alive && other !== fighter)
      .map((other) => ({
        x: other.jumpTime > 0 ? other.jumpToX : other.x,
        y: other.jumpTime > 0 ? other.jumpToY : other.y,
        radius: other.radius,
      }));
    const behindDirection = target.team === "enemy" ? 1 : -1;
    const baseDistance = target.radius + fighter.radius + 12;
    const candidates = [
      { x: target.x + behindDirection * baseDistance, y: target.y },
      { x: target.x + behindDirection * baseDistance, y: target.y - 62 },
      { x: target.x + behindDirection * baseDistance, y: target.y + 62 },
      { x: target.x, y: target.y - baseDistance },
      { x: target.x, y: target.y + baseDistance },
    ].map((candidate) => ({
      x: Math.max(
        BATTLE_BOUNDS.left + fighter.radius,
        Math.min(BATTLE_BOUNDS.right - fighter.radius, candidate.x),
      ),
      y: Math.max(
        BATTLE_BOUNDS.top + fighter.radius,
        Math.min(BATTLE_BOUNDS.bottom - fighter.radius, candidate.y),
      ),
    }));
    const landing =
      candidates.find((candidate) =>
        occupied.every(
          (other) =>
            Math.hypot(candidate.x - other.x, candidate.y - other.y) >=
            fighter.radius + other.radius + 8,
        ),
      ) || candidates[0];

    fighter.jumpFromX = fighter.x;
    fighter.jumpFromY = fighter.y;
    fighter.jumpToX = landing.x;
    fighter.jumpToY = landing.y;
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
    for (let pass = 0; pass < 2; pass += 1) {
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
          if (distance < 0.01) {
            dx = left.fid < right.fid ? 1 : -1;
            dy = 0;
            distance = 1;
          }
          const push = (minimum - distance) / 2;
          left.x -= (dx / distance) * push;
          left.y -= (dy / distance) * push;
          right.x += (dx / distance) * push;
          right.y += (dy / distance) * push;
        }
      }
      fighters.forEach((fighter) => {
        fighter.x = Math.max(
          BATTLE_BOUNDS.left + fighter.radius,
          Math.min(BATTLE_BOUNDS.right - fighter.radius, fighter.x),
        );
        fighter.y = Math.max(
          BATTLE_BOUNDS.top + fighter.radius,
          Math.min(BATTLE_BOUNDS.bottom - fighter.radius, fighter.y),
        );
      });
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
    if (this.state.phase === "result") {
      this.state.resultTimer -= dt;
      if (this.state.resultTimer <= 0) this.advanceAfterResult();
    }
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

  private updateBattle(dt: number) {
    const battle = this.state.battle;
    if (!battle) return;
    battle.elapsed += dt;
    battle.bannerTimer = Math.max(0, battle.bannerTimer - dt);

    battle.effects.forEach((effect) => {
      effect.life -= dt;
    });
    battle.effects = battle.effects.filter((effect) => effect.life > 0);

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

      if (fighter.energy >= 100) {
        this.castAbility(fighter, targets);
        return;
      }

      const target = this.nearestTarget(fighter, targets);
      if (!target) return;
      const distance = Math.hypot(target.x - fighter.x, target.y - fighter.y);
      const preferredRange = Math.max(
        fighter.range,
        fighter.radius + target.radius + 7,
      );
      if (distance > preferredRange) {
        const travel = Math.min(
          distance - preferredRange,
          fighter.moveSpeed * dt,
        );
        fighter.x += ((target.x - fighter.x) / distance) * travel;
        fighter.y += ((target.y - fighter.y) / distance) * travel;
      } else if (fighter.cooldown <= 0) {
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

  private basicAttack(source: Fighter, target: Fighter) {
    source.cooldown = source.attackInterval;
    source.attackPulse = 0.22;
    source.attackTargetX = target.x;
    source.attackTargetY = target.y;
    source.energy = Math.min(100, source.energy + 24 + source.energyPerHit);
    target.energy = Math.min(100, target.energy + 5);
    const dealt = this.damage(source, target, source.attack);
    if (source.burnOnHitPower > 0 && target.alive) {
      this.applyBurn(source, target, source.attack * source.burnOnHitPower);
    }
    const def = UNIT_DEFS[source.unitId];
    this.addEffect({
      kind: def.range > 100 ? "line" : "burst",
      x: source.x,
      y: source.y,
      x2: target.x,
      y2: target.y,
      color: def.accent,
      life: def.range > 100 ? 0.16 : 0.24,
      size: def.range > 100 ? 3 : 22,
    });
    if (dealt > 0) this.addDamageText(target, dealt);
  }

  private castAbility(source: Fighter, targets: Fighter[]) {
    source.energy = source.castRefund;
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
        targets
          .filter(
            (candidate) =>
              Math.hypot(candidate.x - target.x, candidate.y - target.y) < 95,
          )
          .forEach((candidate) => {
            const dealt = this.damage(source, candidate, source.attack * 1.35);
            this.applyBurn(source, candidate, source.attack * 0.8);
            this.addDamageText(candidate, dealt);
          });
        this.addEffect({
          kind: "ring",
          x: target.x,
          y: target.y,
          color: def.accent,
          life: 0.5,
          size: 100,
        });
        break;
      }
      case "gale_archer": {
        const ordered = [...targets].sort(
          (a, b) => a.hp / a.maxHp - b.hp / b.maxHp,
        );
        for (let shot = 0; shot < 3; shot += 1) {
          const target = ordered[shot % ordered.length];
          if (!target?.alive) continue;
          const dealt = this.damage(source, target, source.attack * 0.72);
          if (dealt > 0) this.addDamageText(target, dealt);
          this.addEffect({
            kind: "line",
            x: source.x,
            y: source.y,
            x2: target.x,
            y2: target.y,
            color: def.accent,
            life: 0.28 + shot * 0.06,
            size: 3,
          });
        }
        break;
      }
      case "rift_stalker": {
        const target = weakest(targets);
        if (!target) break;
        source.x = target.x + (source.team === "player" ? -36 : 36);
        source.y = target.y;
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
        [...targets]
          .sort((a, b) => b.energy - a.energy)
          .slice(0, 2)
          .forEach((target) => {
            deal(target, 0.9);
            target.energy = Math.max(0, target.energy - 24);
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
        const target = [...targets].sort(
          (a, b) => a.hp / a.maxHp - b.hp / b.maxHp,
        )[0];
        if (!target) break;
        source.x = target.x + (source.team === "player" ? -42 : 42);
        source.y = target.y;
        const multiplier = target.hp / target.maxHp < 0.4 ? 2.6 : 1.75;
        const dealt = this.damage(source, target, source.attack * multiplier);
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
            this.applyBurn(source, target, source.attack * 0.65);
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
        source.x = target.x + (source.team === "player" ? -38 : 38);
        source.y = target.y;
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
        [...allies]
          .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)
          .slice(0, 2)
          .forEach((target) => {
            this.heal(source, target, target.maxHp * 0.18 + source.attack);
            this.addEffect({
              kind: "line",
              x: source.x,
              y: source.y,
              x2: target.x,
              y2: target.y,
              color: def.accent,
              life: 0.7,
              size: 5,
            });
          });
        break;
      }
      case "cinder_ram": {
        const center = densest(targets);
        if (!center) break;
        source.x = center.x + (source.team === "player" ? -45 : 45);
        source.y = center.y;
        targets
          .filter(
            (target) =>
              Math.hypot(target.x - center.x, target.y - center.y) < 115,
          )
          .forEach((target) => {
            deal(target, 1.12);
            target.stun = Math.max(target.stun, 0.72);
            this.applyBurn(source, target, source.attack * 0.6);
          });
        this.addEffect({
          kind: "ring",
          x: center.x,
          y: center.y,
          color: def.accent,
          life: 0.65,
          size: 120,
        });
        break;
      }
      case "brass_colossus": {
        targets
          .filter(
            (target) =>
              Math.hypot(target.x - source.x, target.y - source.y) < 145,
          )
          .forEach((target) => {
            const dealt = this.damage(source, target, source.attack * 0.92);
            target.stun = Math.max(target.stun, 1.2);
            if (dealt > 0) this.addDamageText(target, dealt);
          });
        this.grantShield(source, source, source.maxHp * 0.22, 0.42);
        this.addEffect({
          kind: "ring",
          x: source.x,
          y: source.y,
          color: def.accent,
          life: 0.9,
          size: 150,
        });
        break;
      }
      case "ash_dancer": {
        const ordered = [...targets]
          .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)
          .slice(0, 3);
        ordered.forEach((target, index) => {
          source.x = target.x + (source.team === "player" ? -34 : 34);
          source.y = target.y;
          deal(target, 0.92);
          this.applyBurn(source, target, source.attack * 0.75);
          this.addEffect({
            kind: "burst",
            x: target.x,
            y: target.y,
            color: def.accent,
            life: 0.38 + index * 0.07,
            size: 36,
          });
        });
        break;
      }
      case "thorn_brute": {
        const nearby = targets.filter(
          (target) =>
            Math.hypot(target.x - source.x, target.y - source.y) < 145,
        );
        nearby.forEach((target) => deal(target, 1.22));
        this.heal(source, source, source.maxHp * 0.065 * Math.max(1, nearby.length));
        this.addEffect({
          kind: "ring",
          x: source.x,
          y: source.y,
          color: def.accent,
          life: 0.7,
          size: 150,
        });
        break;
      }
      case "void_oracle": {
        const target = [...targets].sort((a, b) => b.maxHp - a.maxHp)[0];
        if (!target) break;
        deal(target, 1.35, Math.min(target.maxHp * 0.09, source.attack * 2.2));
        target.stun = Math.max(target.stun, 0.5);
        this.addEffect({
          kind: "ring",
          x: target.x,
          y: target.y,
          color: def.accent,
          life: 0.7,
          size: 78,
        });
        break;
      }
      case "gear_sniper": {
        const target = farthest(targets);
        if (!target) break;
        deal(target, 2.5);
        this.addEffect({
          kind: "line",
          x: source.x,
          y: source.y,
          x2: target.x,
          y2: target.y,
          color: def.accent,
          life: 0.58,
          size: 7,
        });
        break;
      }
      case "shade_reaver": {
        const target = weakest(targets);
        if (!target) break;
        source.x = target.x + (source.team === "player" ? -32 : 32);
        source.y = target.y;
        deal(target, 2.15);
        if (!target.alive) source.energy = Math.max(source.energy, 72);
        this.addEffect({
          kind: "burst",
          x: target.x,
          y: target.y,
          color: def.accent,
          life: 0.6,
          size: 48,
        });
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
        source.x = target.x + (source.team === "player" ? -52 : 52);
        source.y = target.y - 20;
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
          this.applyBurn(source, target, source.attack * 0.6);
          this.addEffect({ kind: "line", x: source.x, y: source.y, x2: target.x, y2: target.y, color: def.accent, life: 0.28 + shot * 0.06, size: 3 });
        }
        break;
      }
      case "sun_phoenix": {
        targets.forEach((target) => {
          const dealt = this.damage(source, target, source.attack * 1.16);
          this.applyBurn(source, target, source.attack * 0.9);
          if (dealt > 0) this.addDamageText(target, dealt);
        });
        this.heal(source, source, source.maxHp * 0.18);
        this.addEffect({
          kind: "ring",
          x: 560,
          y: 360,
          color: def.accent,
          life: 1,
          size: 520,
        });
        break;
      }
      case "prism_sage": {
        allies.forEach((target) => {
          this.heal(source, target, target.maxHp * 0.09 + source.attack * 0.7);
          addShield(target, target.maxHp * 0.12, 0.42);
          target.energy = Math.min(100, target.energy + 15);
        });
        this.addEffect({
          kind: "ring",
          x: source.x,
          y: source.y,
          color: def.accent,
          life: 0.95,
          size: 320,
        });
        break;
      }
      case "moonfang": {
        const target = farthest(targets);
        if (!target) break;
        source.x = target.x + (source.team === "player" ? -34 : 34);
        source.y = target.y;
        let total = 0;
        for (let strike = 0; strike < 4 && target.alive; strike += 1)
          total += deal(target, 0.68);
        this.heal(source, source, total * 0.28);
        this.addEffect({
          kind: "burst",
          x: target.x,
          y: target.y,
          color: def.accent,
          life: 0.72,
          size: 66,
        });
        break;
      }
      case "rift_warden": {
        allies.forEach((target) =>
          addShield(target, target.maxHp * 0.11, 0.42),
        );
        targets
          .filter(
            (target) =>
              Math.hypot(target.x - source.x, target.y - source.y) < 155,
          )
          .forEach((target) => {
            deal(target, 0.82);
            target.stun = Math.max(target.stun, 1.05);
          });
        this.addEffect({
          kind: "ring",
          x: source.x,
          y: source.y,
          color: def.accent,
          life: 0.9,
          size: 170,
        });
        break;
      }
      case "iron_dervish": {
        targets
          .filter(
            (target) =>
              Math.hypot(target.x - source.x, target.y - source.y) < 155,
          )
          .forEach((target) => deal(target, 1.58));
        source.cooldown = 0;
        this.addEffect({
          kind: "ring",
          x: source.x,
          y: source.y,
          color: def.accent,
          life: 0.78,
          size: 165,
        });
        break;
      }
      case "siege_walker": {
        const center = densest(targets);
        if (!center) break;
        targets
          .filter(
            (target) =>
              Math.hypot(target.x - center.x, target.y - center.y) < 135,
          )
          .forEach((target) => {
            deal(target, 1.82);
            target.stun = Math.max(target.stun, 1.05);
          });
        this.addEffect({
          kind: "ring",
          x: center.x,
          y: center.y,
          color: def.accent,
          life: 0.95,
          size: 145,
        });
        break;
      }
      case "sui_cat": {
        const target = farthest(targets);
        if (!target) break;
        source.x = target.x + (source.team === "player" ? -34 : 34);
        source.y = target.y;
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
      case "dawn_sovereign": {
        [...targets]
          .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)
          .forEach((target, index) => {
            deal(target, Math.max(0.72, 1.55 - index * 0.14));
            this.addEffect({
              kind: "line",
              x: source.x,
              y: source.y,
              x2: target.x,
              y2: target.y,
              color: def.accent,
              life: 0.48 + index * 0.04,
              size: 5,
            });
          });
        allies.forEach((target) => addShield(target, target.maxHp * 0.07, 0.3));
        break;
      }
      case "solar_champion": {
        const center = densest(targets);
        if (!center) break;
        source.x = center.x + (source.team === "player" ? -42 : 42);
        source.y = center.y;
        targets
          .filter(
            (target) =>
              Math.hypot(target.x - center.x, target.y - center.y) < 145,
          )
          .forEach((target) => {
            deal(target, 2.05);
            target.stun = Math.max(target.stun, 0.85);
          });
        addShield(source, source.maxHp * 0.24, 0.6);
        this.addEffect({
          kind: "ring",
          x: center.x,
          y: center.y,
          color: def.accent,
          life: 0.95,
          size: 155,
        });
        break;
      }
      case "inferno_witch": {
        targets.forEach((target) => {
          deal(target, 1.28);
          this.applyBurn(source, target, source.attack * 1.45);
          this.addEffect({
            kind: "burst",
            x: target.x,
            y: target.y,
            color: def.accent,
            life: 0.7,
            size: 58,
          });
        });
        this.addEffect({
          kind: "ring",
          x: 560,
          y: 360,
          color: def.accent,
          life: 1.05,
          size: 540,
        });
        break;
      }
      case "sky_drake": {
        const ordered = [...targets].sort(
          (a, b) => a.hp / a.maxHp - b.hp / b.maxHp,
        );
        for (let shot = 0; shot < 6; shot += 1) {
          const target =
            ordered.find((candidate) => candidate.alive) ||
            weakest(targets.filter((candidate) => candidate.alive));
          if (!target) break;
          deal(target, target.hp / target.maxHp < 0.3 ? 1.12 : 0.82);
          this.addEffect({
            kind: "line",
            x: source.x,
            y: source.y,
            x2: target.x,
            y2: target.y,
            color: def.accent,
            life: 0.24 + shot * 0.04,
            size: 3,
          });
        }
        break;
      }
      case "void_reaper": {
        let kills = 0;
        const ordered = [...targets]
          .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)
          .slice(0, 3);
        ordered.forEach((target, index) => {
          if (!target.alive) return;
          source.x = target.x + (source.team === "player" ? -30 : 30);
          source.y = target.y;
          deal(target, 1.38);
          if (!target.alive) kills += 1;
          this.addEffect({
            kind: "burst",
            x: target.x,
            y: target.y,
            color: def.accent,
            life: 0.45 + index * 0.08,
            size: 46,
          });
        });
        source.energy = Math.min(100, source.energy + kills * 34);
        break;
      }
      case "chrono_titan": {
        targets.forEach((target) => {
          deal(target, 1.16);
          target.stun = Math.max(target.stun, 1.55);
        });
        this.addEffect({
          kind: "ring",
          x: source.x,
          y: source.y,
          color: def.accent,
          life: 1.1,
          size: 470,
        });
        break;
      }
      case "biscuit_sui": {
        const center = densest(targets);
        if (!center) break;
        source.x = center.x + (source.team === "player" ? -42 : 42);
        source.y = center.y;
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
    if (!source.alive || !target.alive) return 0;
    let amount = rawAmount;
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
      this.heal(target, target, target.maxHp * 0.24);
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
      source.team === "player" && this.state.starter === "blaze" ? 1.4 : 1;
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
      target.team === "player" && this.state.starter === "bastion" ? 1.3 : 1;
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

    if (won) {
      this.state.streak += 1;
      this.state.victories += 1;
      const streakBonus = Math.min(2, Math.max(0, this.state.streak - 1));
      const eliteBonus = wave.tag === "elite" ? 2 : 0;
      const blazeBonus =
        this.state.starter === "blaze" && this.state.victories === 1 ? 2 : 0;
      income =
        5 +
        interest +
        streakBonus +
        eliteBonus +
        blazeBonus +
        this.state.incomeBonus;
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
        detail: `基础 5 + 利息 ${interest} + 连胜 ${streakBonus}${eliteBonus ? ` + 精英 ${eliteBonus}` : ""}${blazeBonus ? " + 余烬首胜 2" : ""}`,
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
        4 + interest + this.state.incomeBonus + (this.state.hp > 0 ? 1 : 0);
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
    this.state.resultTimer = 2.4;
  }

  private advanceAfterResult() {
    const result = this.state.result;
    if (!result) return;
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
    if (id === "payday") {
      this.state.gold += 6;
      this.state.incomeBonus += 1;
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
            name: UNIT_DEFS[unit.unitId].name,
            hp: Math.round(unit.hp),
            maxHp: Math.round(unit.maxHp),
            shield: Math.round(unit.shield),
            energy: Math.round(unit.energy),
            x: Math.round(unit.x),
            y: Math.round(unit.y),
            radius: unit.radius,
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
          playerRows: this.getBattleRanking().map(({ fighter, value }) => ({
            fid: fighter.fid,
            unitId: fighter.unitId,
            name: UNIT_DEFS[fighter.unitId].name,
            star: fighter.star,
            alive: fighter.alive,
            damageDealt: Math.round(fighter.damageDealt),
            healingDone: Math.round(fighter.healingDone),
            shieldingDone: Math.round(fighter.shieldingDone),
            damageTaken: Math.round(fighter.damageTaken),
            value: Math.round(value),
          })),
        },
        enemyUnits: battle.enemy
          .filter((unit) => unit.alive)
          .map((unit) => ({
            name: UNIT_DEFS[unit.unitId].name,
            hp: Math.round(unit.hp),
            maxHp: Math.round(unit.maxHp),
            shield: Math.round(unit.shield),
            energy: Math.round(unit.energy),
            x: Math.round(unit.x),
            y: Math.round(unit.y),
            radius: unit.radius,
            attacking: unit.attackPulse > 0,
            hit: unit.hitPulse > 0,
            jumpPending: unit.jumpPending,
            jumping: unit.jumpTime > 0,
            jumpFrom: { x: Math.round(unit.jumpFromX), y: Math.round(unit.jumpFromY) },
            jumpTo: { x: Math.round(unit.jumpToX), y: Math.round(unit.jumpToY) },
          })),
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
                  : ["自动结算中", "F 全屏"],
      toast: this.state.toast?.text || null,
    });
  }
}
