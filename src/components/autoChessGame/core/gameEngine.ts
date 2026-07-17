/* eslint-disable prefer-destructuring, implicit-arrow-linebreak, nonblock-statement-body-position, function-paren-newline */

import {
  AUGMENTS,
  AugmentId,
  BOARD_CAP_BY_ROUND,
  SHOP_TIER_COUNTS,
  SHOP_UNITS,
  STARTERS,
  StarterId,
  TRAITS,
  TraitId,
  UNIT_DEFS,
  UnitId,
  WAVES,
  traitLevelForCount,
  tierOddsForRound,
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
  lifesteal: number;
  burnOnHitPower: number;
  energyPerHit: number;
  lowHealthBonus: number;
  critChance: number;
  critMultiplier: number;
  castRefund: number;
  secondWindUsed: boolean;
  enraged: boolean;
  alive: boolean;
}

export interface BattleState {
  elapsed: number;
  limit: number;
  player: Fighter[];
  enemy: Fighter[];
  effects: BattleEffect[];
  fieldMedicTimer: number;
  banner: string;
  bannerTimer: number;
}

export interface RoundResult {
  won: boolean;
  headline: string;
  detail: string;
  income: number;
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
  hp: number;
  maxHp: number;
  gold: number;
  score: number;
  bestScore: number;
  streak: number;
  victories: number;
  starter: StarterId | null;
  board: Array<OwnedUnit | null>;
  bench: Array<OwnedUnit | null>;
  shop: Array<UnitId | null>;
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
      maxRounds: WAVES.length,
      hp: 20,
      maxHp: 20,
      gold: 8,
      score: 0,
      bestScore,
      streak: 0,
      victories: 0,
      starter: null,
      board: emptySlots<OwnedUnit>(BOARD_SIZE),
      bench: emptySlots<OwnedUnit>(BENCH_SIZE),
      shop: emptySlots<UnitId>(SHOP_SIZE),
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
    return BOARD_CAP_BY_ROUND[
      Math.min(this.state.round - 1, BOARD_CAP_BY_ROUND.length - 1)
    ];
  }

  public get boardCount() {
    return this.state.board.filter(Boolean).length;
  }

  public get currentWave() {
    return WAVES[Math.min(this.state.round - 1, WAVES.length - 1)];
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
    const odds = tierOddsForRound(this.state.round);
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

  public rerollShop() {
    if (this.state.phase !== "preparation") return;
    if (this.state.gold < 1) {
      this.setToast("金币不足，无法刷新商店。", "bad");
      return;
    }
    this.state.gold -= 1;
    this.state.shop = this.generateShop();
    this.state.selected = null;
    this.setToast("商店已刷新。", "info");
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

          const [keep, removeA, removeB] = matches;
          const keptUnit = this.getAt(keep);
          if (!keptUnit) continue;
          keptUnit.star = (star + 1) as 2 | 3;
          this.setAt(removeA, null);
          this.setAt(removeB, null);
          this.state.selected = null;
          this.state.score += 80 * star;
          this.setToast(
            `聚合完成：${UNIT_DEFS[id].name}升至 ${star + 1} 星！`,
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

    const player = this.state.board.flatMap((owned, index) => {
      if (!owned) return [];
      const def = UNIT_DEFS[owned.id];
      const col = index % 6;
      const row = Math.floor(index / 6);
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
      if (hasAugment("tempered")) armor += 16;
      if (hasAugment("sharp_edge")) attack *= 1.15;
      if (hasAugment("momentum")) attackInterval /= 1.18;

      const fighter: Fighter = {
        fid: `p-${owned.uid}`,
        unitId: owned.id,
        team: "player",
        star: owned.star,
        // 备战网格坐标直接映射到战场左半区，站位不是开战后重新排队。
        x: assassinLevel ? 755 + col * 5 : 72 + col * 88 + (row % 2) * 18,
        y: 175 + row * 135,
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
          [0, 20, 45, 70][mysticLevel] + (hasAugment("overclock") ? 35 : 0),
        stun: 0,
        burnTime: 0,
        burnDps: 0,
        lifesteal:
          [0, 0.08, 0.15, 0.24][wildLevel] +
          (wildLevel && this.state.starter === "echo" ? 0.06 : 0),
        burnOnHitPower: [0, 0.35, 0.65, 1.05][emberLevel],
        energyPerHit: [0, 4, 8, 14][clockworkLevel],
        lowHealthBonus: [0, 0.15, 0.32, 0.55][riftLevel],
        critChance: [0, 0.15, 0.3, 0.5][assassinLevel],
        critMultiplier: 1.65,
        castRefund: [0, 0, 8, 15][mysticLevel],
        secondWindUsed: false,
        enraged: false,
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
        lifesteal: 0,
        burnOnHitPower: 0,
        energyPerHit: 0,
        lowHealthBonus: 0,
        critChance: 0,
        critMultiplier: 1.65,
        castRefund: 0,
        secondWindUsed: false,
        enraged: false,
        alive: true,
      } satisfies Fighter;
    });

    return {
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
    };
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
    return targets.reduce<Fighter | null>((best, target) => {
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
          this.heal(fighter, fighter.maxHp * 0.03),
        );
      }
    }

    [...battle.player, ...battle.enemy].forEach((fighter) => {
      if (!fighter.alive) return;
      fighter.cooldown -= dt;
      fighter.stun = Math.max(0, fighter.stun - dt);
      if (fighter.burnTime > 0) {
        fighter.burnTime -= dt;
        fighter.hp -= fighter.burnDps * dt;
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
      if (distance > fighter.range) {
        const travel = Math.min(
          distance - fighter.range,
          fighter.moveSpeed * dt,
        );
        fighter.x += ((target.x - fighter.x) / distance) * travel;
        fighter.y += ((target.y - fighter.y) / distance) * travel;
      } else if (fighter.cooldown <= 0) {
        this.basicAttack(fighter, target);
      }
    });

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
      this.addDamageText(target, dealt);
      return dealt;
    };
    const addShield = (target: Fighter, amount: number, capRatio = 0.55) => {
      const starterMultiplier =
        target.team === "player" && this.state.starter === "bastion" ? 1.3 : 1;
      target.shield = Math.min(
        target.maxHp * capRatio * starterMultiplier,
        target.shield + amount * starterMultiplier,
      );
    };

    switch (source.unitId) {
      case "sun_guard": {
        const shieldMultiplier =
          source.team === "player" && this.state.starter === "bastion"
            ? 1.3
            : 1;
        source.shield = Math.min(
          source.maxHp * 0.48 * shieldMultiplier,
          source.shield + source.maxHp * 0.32 * shieldMultiplier,
        );
        const target = this.nearestTarget(source, targets);
        if (target) {
          const dealt = this.damage(source, target, source.attack * 0.75);
          target.stun = Math.max(target.stun, 0.45);
          this.addDamageText(target, dealt);
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
          this.addDamageText(target, dealt);
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
        this.heal(source, source.maxHp * 0.13);
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
      case "rift_brawler": {
        const target = [...targets].sort(
          (a, b) => a.hp / a.maxHp - b.hp / b.maxHp,
        )[0];
        if (!target) break;
        source.x = target.x + (source.team === "player" ? -42 : 42);
        source.y = target.y;
        const multiplier = target.hp / target.maxHp < 0.4 ? 2.6 : 1.75;
        const dealt = this.damage(source, target, source.attack * multiplier);
        this.addDamageText(target, dealt);
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
            this.addDamageText(target, dealt);
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
            this.heal(target, target.maxHp * 0.18 + source.attack);
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
            this.addDamageText(target, dealt);
          });
        source.shield = Math.min(
          source.maxHp * 0.42,
          source.shield + source.maxHp * 0.22,
        );
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
        this.heal(source, source.maxHp * 0.065 * Math.max(1, nearby.length));
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
      case "sun_phoenix": {
        targets.forEach((target) => {
          const dealt = this.damage(source, target, source.attack * 1.16);
          this.applyBurn(source, target, source.attack * 0.9);
          this.addDamageText(target, dealt);
        });
        this.heal(source, source.maxHp * 0.18);
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
          this.heal(target, target.maxHp * 0.09 + source.attack * 0.7);
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
        this.heal(source, total * 0.28);
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
      case "rift_tyrant": {
        targets.forEach((target) => {
          const dealt = this.damage(source, target, source.attack * 1.05);
          target.stun = Math.max(target.stun, 0.55);
          this.addDamageText(target, dealt);
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
    if (target.shield > 0) {
      const absorbed = Math.min(target.shield, remaining);
      target.shield -= absorbed;
      remaining -= absorbed;
    }
    target.hp -= remaining;
    if (source.lifesteal > 0)
      this.heal(source, amount * source.lifesteal, false);

    if (
      target.team === "player" &&
      this.state.augments.includes("second_wind") &&
      !target.secondWindUsed &&
      target.hp > 0 &&
      target.hp / target.maxHp < 0.3
    ) {
      target.secondWindUsed = true;
      this.heal(target, target.maxHp * 0.24);
    }

    if (target.hp <= 0) {
      this.killFighter(target);
      if (source.team === "player") this.state.score += 12;
    }
    return amount;
  }

  private applyBurn(source: Fighter, target: Fighter, totalDamage: number) {
    if (!target.alive) return;
    const starterMultiplier =
      source.team === "player" && this.state.starter === "blaze" ? 1.4 : 1;
    target.burnDps = Math.max(
      target.burnDps,
      (totalDamage * starterMultiplier) / 3,
    );
    target.burnTime = 3;
  }

  private heal(target: Fighter, amount: number, showEffect = true) {
    if (!target.alive || amount <= 0) return;
    const before = target.hp;
    target.hp = Math.min(target.maxHp, target.hp + amount);
    const healed = target.hp - before;
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
        damage,
      };
    }

    this.state.phase = "result";
    this.state.resultTimer = 2.4;
  }

  private advanceAfterResult() {
    const result = this.state.result;
    if (!result) return;
    if (this.state.hp <= 0 || this.state.round >= this.state.maxRounds) {
      this.endGame(this.state.round === this.state.maxRounds && result.won);
      return;
    }
    if (this.state.round === 2 || this.state.round === 5) {
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
    this.state.shop = this.generateShop();
  }

  private endGame(won: boolean) {
    this.state.finalWon = won;
    if (won)
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
        score: this.state.score,
        streak: this.state.streak,
        boardCap: this.boardCap,
      },
      roster: {
        purchasableUnits: SHOP_UNITS.length,
        tierCounts: SHOP_TIER_COUNTS,
        currentTierOdds: tierOddsForRound(this.state.round),
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
          })),
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
          })),
      },
      result: this.state.result,
      availableActions:
        this.state.phase === "preparation"
          ? [
              "点击商店购买",
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
                : ["自动战斗中", "F 全屏"],
      toast: this.state.toast?.text || null,
    });
  }
}
