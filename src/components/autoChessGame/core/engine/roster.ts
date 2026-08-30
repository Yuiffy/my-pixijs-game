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
import { canonicalFormationPlacements } from "../formation";
import type { RandomSource } from "./random";
import { SHOP_SIZE } from "./state";

export const STAR_FORGE_UNLOCK_COST = 40;

export const starForgeUpgradeCost = (unit: OwnedUnit) => {
  if (unit.star === 3) return null;
  const stageMultiplier = unit.star === 1 ? 4 : 12;
  return (UNIT_DEFS[unit.id].cost + 1) * stageMultiplier;
};

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

public get isStarForgeUnlocked() {
    return this.state.starForgeUnlocked;
  }

public get starForgeUnlockCost() {
    return STAR_FORGE_UNLOCK_COST;
  }

public get boardCount() {
    return this.state.board.filter(Boolean).length;
  }

public canStoreUnit(id: UnitId) {
    if (this.boardCount < this.boardCap) return true;
    if (this.state.bench.some((unit) => !unit)) return true;
    return this.allLocations().filter((location) => {
      const unit = this.getAt(location);
      return unit?.id === id && unit.star === 1;
    }).length >= 2;
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

public useStarForge(location?: UnitLocation) {
    if (this.state.phase !== "preparation") return false;
    if (!this.isMaxPlayerLevel) {
      this.setToast("升星工坊会在达到最高等级后开放。", "info");
      return false;
    }

    if (!this.isStarForgeUnlocked) {
      if (this.state.gold < STAR_FORGE_UNLOCK_COST) {
        this.setToast(
          `还差 ${STAR_FORGE_UNLOCK_COST - this.state.gold} 金币，无法解锁升星工坊。`,
          "bad",
        );
        return false;
      }
      this.state.gold -= STAR_FORGE_UNLOCK_COST;
      this.state.starForgeUnlocked = true;
      this.setToast("升星工坊已解锁。把一星或二星棋子拖到工坊即可直升。", "good");
      return true;
    }

    const targetLocation = location || this.state.selected;
    const unit = targetLocation ? this.getAt(targetLocation) : null;
    if (!targetLocation || !unit) {
      this.setToast("请先选择棋子，或把棋子拖到升星工坊。", "info");
      return false;
    }
    const cost = starForgeUpgradeCost(unit);
    if (cost === null) {
      this.setToast(`${UNIT_DEFS[unit.id].name}已经是三星。`, "info");
      return false;
    }
    if (this.state.gold < cost) {
      this.setToast(`还差 ${cost - this.state.gold} 金币，无法直升。`, "bad");
      return false;
    }

    const fromStar = unit.star;
    this.state.gold -= cost;
    unit.star = (fromStar + 1) as 2 | 3;
    this.state.selected = null;
    this.state.score += cost * 3;
    this.setToast(
      `工坊完成：${UNIT_DEFS[unit.id].name}直升 ${unit.star} 星，消耗 ${cost} 金币。`,
      "good",
    );
    this.checkMerges();
    return true;
  }

public getStarForgeUpgradeCost(unit: OwnedUnit) {
    return starForgeUpgradeCost(unit);
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
    const mergeAtCapacity = boardSlot < 0 && benchSlot < 0;
    if (mergeAtCapacity && !this.canStoreUnit(id)) {
      this.setToast("备战席已满。出售或合成一个单位后再购买。", "bad");
      return;
    }

    const owned: OwnedUnit = { uid: this.host.nextUid(), id, star: 1 };
    this.state.gold -= def.cost;
    this.state.shop[index] = null;
    if (boardSlot >= 0) this.state.board[boardSlot] = owned;
    else if (benchSlot >= 0) this.state.bench[benchSlot] = owned;
    this.state.score += def.cost * 5;
    const merged = mergeAtCapacity
      ? this.mergeOverflowPurchase(owned)
      : this.checkMerges();
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

public autoArrangeBoard() {
    if (this.state.phase !== "preparation") return false;
    const lineup = this.state.board.flatMap((unit, index) => {
      if (!unit) return [];
      return [{ unit, location: { zone: "board" as const, index } }];
    });
    if (lineup.length === 0) {
      this.setToast("场上没有可整理的单位。", "info");
      return false;
    }

    const selectedBoard = this.state.selected?.zone === "board"
      ? this.state.selected
      : null;
    const selectedBoardUid = selectedBoard
      ? this.state.board[selectedBoard.index]?.uid
      : null;
    const nextBoard = Array<OwnedUnit | null>(this.state.board.length).fill(null);
    canonicalFormationPlacements(lineup).forEach(({ entry, slot }) => {
      nextBoard[slot] = entry.unit;
    });
    const changed = this.state.board.some((unit, index) => (
      unit?.uid !== nextBoard[index]?.uid
    ));
    this.state.board = nextBoard;

    if (selectedBoard) {
      const selectedIndex = nextBoard.findIndex((unit) => unit?.uid === selectedBoardUid);
      this.state.selected = selectedIndex >= 0
        ? { zone: "board", index: selectedIndex }
        : null;
    }
    this.setToast(
      changed
        ? "推荐站位已完成：前排承伤，后排输出。"
        : "当前场上单位已经处于推荐站位。",
      changed ? "good" : "info",
    );
    return changed;
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

  private locationsByMergePriority(locations: UnitLocation[]) {
    return [...locations].sort((left, right) => {
      if (left.zone !== right.zone) return left.zone === "board" ? -1 : 1;
      const leftUnit = this.getAt(left);
      const rightUnit = this.getAt(right);
      return (leftUnit?.uid ?? Number.MAX_SAFE_INTEGER)
        - (rightUnit?.uid ?? Number.MAX_SAFE_INTEGER);
    });
  }

  private completeMerge(
    id: UnitId,
    star: 1 | 2,
    keep: UnitLocation,
    removals: UnitLocation[],
  ) {
    const keptUnit = this.getAt(keep);
    if (!keptUnit) return false;
    keptUnit.star = (star + 1) as 2 | 3;
    removals.forEach((location) => this.setAt(location, null));
    this.state.selected = null;
    this.state.score += 80 * star;
    this.setToast(
      `聚合完成：${UNIT_DEFS[id].name}升至 ${star + 1} 星，并优先保留场上棋子的站位！`,
      "good",
    );
    return true;
  }

  private mergeOverflowPurchase(owned: OwnedUnit) {
    const matches = this.locationsByMergePriority(
      this.allLocations().filter((location) => {
        const unit = this.getAt(location);
        return unit?.id === owned.id && unit.star === 1;
      }),
    );
    const [keep, removal] = matches;
    if (!keep || !removal) return false;
    if (!this.completeMerge(owned.id, 1, keep, [removal])) return false;
    this.checkMerges();
    return true;
  }

public checkMerges() {
    let didMerge = false;
    let found = true;
    while (found) {
      found = false;
      for (const id of SHOP_UNITS) {
        for (const star of [1, 2] as const) {
          const matches = this.locationsByMergePriority(
            this.allLocations().filter((location) => {
              const unit = this.getAt(location);
              return unit?.id === id && unit.star === star;
            }),
          );
          if (matches.length < 3) continue;

          const [keep, ...removals] = matches.slice(0, 3);
          if (!keep || !this.completeMerge(id, star, keep, removals)) continue;
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
