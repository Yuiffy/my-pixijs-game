import {
  MAX_PLAYER_LEVEL,
  PLAYER_LEVEL_CONFIG,
  SHOP_UNITS,
  UNIT_DEFS,
  bookLevelForPlayerLevel,
  type PlayerLevel,
  type UnitId,
  tierOddsForLevel,
  upgradeCostForLevel,
} from "../gameData";
import type {
  GameState,
  OwnedUnit,
  ToastState,
  UnitLocation,
} from "../gameTypes";
import type { RandomSource } from "./random";
import { SHOP_SIZE } from "./state";

interface RosterHost {
  state: () => GameState;
  rng: () => RandomSource;
  nextUid: () => number;
  setToast: (text: string, tone?: ToastState["tone"]) => void;
}

export class RosterSystem {
  constructor(private readonly host: RosterHost) {}

  private get state() {
    return this.host.state();
  }

  private get rng() {
    return this.host.rng();
  }

  private setToast(text: string, tone: ToastState["tone"] = "info") {
    this.host.setToast(text, tone);
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

public generateShop(): UnitId[] {
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
    const nextCost = upgradeCostForLevel(this.state.playerLevel) || 0;
    const carriedDiscount = Math.min(nextCost, this.state.upgradeDiscountCarry);
    this.state.upgradeRemaining = nextCost - carriedDiscount;
    this.state.upgradeDiscountCarry = this.isMaxPlayerLevel
      ? 0
      : this.state.upgradeDiscountCarry - carriedDiscount;
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
    const freeReroll = this.state.freeRerollCharges > 0;
    if (!freeReroll && this.state.gold < 1) {
      this.setToast("金币不足，无法刷新商店。", "bad");
      return;
    }
    if (freeReroll) this.state.freeRerollCharges -= 1;
    else this.state.gold -= 1;
    this.state.shop = this.generateShop();
    this.state.shopLocked = false;
    this.state.selected = null;
    this.setToast(freeReroll ? "免费刷新已使用，商店已自动解锁。" : "商店已刷新并自动解锁。", "info");
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

    const owned: OwnedUnit = { uid: this.host.nextUid(), id, star: 1 };
    this.state.gold -= def.cost;
    this.state.shop[index] = null;
    if (boardSlot >= 0) this.state.board[boardSlot] = owned;
    else this.state.bench[benchSlot] = owned;
    this.state.score += def.cost * 5;
    const merged = this.checkMerges();
    if (!merged) this.setToast(
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

public clearSelection() {
    this.state.selected = null;
  }

public moveUnit(from: UnitLocation, zone: UnitLocation["zone"], index: number) {
    if (this.state.phase !== "preparation") return;
    const sourceUnit = this.getAt(from);
    if (!sourceUnit) return;
    this.state.selected = from;
    this.selectSlot(zone, index);
  }

public sellUnit(zone: UnitLocation["zone"], index: number) {
    if (this.state.phase !== "preparation") return;
    if (!this.getAt({ zone, index })) return;
    this.state.selected = { zone, index };
    this.sellSelected();
  }

public selectSlot(zone: UnitLocation["zone"], index: number) {
    if (this.state.phase !== "preparation") return;
    const targetLocation = { zone, index } as UnitLocation;
    const targetUnit = this.getAt(targetLocation);
    const { selected } = this.state;

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
    const refund = this.getUnitSellValue(unit);
    this.setAt(this.state.selected, null);
    this.state.selected = null;
    this.state.gold += refund;
    this.setToast(
      `已回收 ${UNIT_DEFS[unit.id].name}，返还 ${refund} 金币。`,
      "info",
    );
  }

public getUnitSellValue(unit: OwnedUnit) {
    const copies = unit.star === 1 ? 1 : unit.star === 2 ? 3 : 9;
    return UNIT_DEFS[unit.id].cost * copies;
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

public checkMerges() {
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
            ? matches.find((location) => this.sameLocation(location, currentPreferred))
            : null;
          const boardMatch = matches.find((location) => location.zone === "board");
          // A newly merged bench unit may trigger the next star tier, but an
          // existing board unit always owns the final placement.
          const keep = boardMatch || preferredMatch || matches[0];
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
}
