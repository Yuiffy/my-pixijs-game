import type { UnitId } from "../core/gameData";
import type { LateGameTarget } from "./lateGamePlan";

export const SEER2_TERMINAL_TARGETS: readonly LateGameTarget[] = [
  { id: "grove_mender", priority: 100, desiredStar: 3, role: "terminal" },
  { id: "lian", priority: 96, desiredStar: 3, role: "terminal" },
  { id: "rei", priority: 92, desiredStar: 3, role: "terminal" },
  { id: "yua", priority: 88, desiredStar: 3, role: "terminal" },
  { id: "cinder_ram", priority: 84, desiredStar: 3, role: "terminal" },
  { id: "spark_mage", priority: 80, desiredStar: 3, role: "terminal" },
  { id: "sui_flower", priority: 76, desiredStar: 3, role: "terminal" },
  { id: "xuehui", priority: 72, desiredStar: 3, role: "terminal" },
  { id: "sui_bird", priority: 68, desiredStar: 3, role: "terminal" },
  { id: "cog_scribe", priority: 66, desiredStar: 3, role: "terminal" },
  { id: "rutice", priority: 65, desiredStar: 3, role: "terminal" },
  { id: "yukisyo", priority: 64, desiredStar: 3, role: "terminal" },
] as const;

export const SEER2_TERMINAL_TARGET_IDS = SEER2_TERMINAL_TARGETS.map(({ id }) => id);

export const SEER2_PRINCIPAL_VARIATIONS: readonly (readonly UnitId[])[] = [
  [
    "grove_mender",
    "lian",
    "rei",
    "yua",
    "cinder_ram",
    "spark_mage",
    "sui_flower",
    "xuehui",
    "sui_bird",
    "yukisyo",
  ],
  [
    "grove_mender",
    "lian",
    "rei",
    "yua",
    "cinder_ram",
    "spark_mage",
    "sui_flower",
    "xuehui",
    "sui_bird",
    "cog_scribe",
  ],
  [
    "grove_mender",
    "lian",
    "rei",
    "yua",
    "cinder_ram",
    "spark_mage",
    "sui_flower",
    "xuehui",
    "sui_bird",
    "rutice",
  ],
  [
    "grove_mender",
    "lian",
    "rei",
    "yua",
    "cinder_ram",
    "spark_mage",
    "sui_flower",
    "xuehui",
    "cog_scribe",
    "rutice",
  ],
] as const;

const SEER2_TARGET_PRIORITY = new Map(
  SEER2_TERMINAL_TARGETS.map(({ id, priority }) => [id, priority]),
);

export const seer2TargetPriority = (id: UnitId) => SEER2_TARGET_PRIORITY.get(id) || 0;

export const seer2TargetDesiredCopies = (id: UnitId) => (
  SEER2_TARGET_PRIORITY.has(id) ? 9 : 0
);

export type Seer2TargetOwnership = {
  id: UnitId;
  copies: number;
  benchSlots?: number;
};

export type Seer2PlanningTarget = LateGameTarget & {
  copies: number;
  benchSlots: number;
  currentShopHits: number;
  forecastHits: number;
  completionShopIndex: number | null;
  remainingAfterForecast: number;
  score: number;
};

type Seer2PlanningTargetRequest = {
  ownedTargets: readonly Seer2TargetOwnership[];
  currentShop: readonly (UnitId | null)[];
  futureShops: readonly (readonly (UnitId | null)[])[];
  previousFocusIds?: ReadonlySet<UnitId>;
  limit?: number;
};

const SEER2_COMPLETION_SHOP_VALUE = 20_000;
const seer2ProjectStickinessShops = (copies: number) => (
  8 + copies * 2 + (copies >= 6 ? 8 : 0)
);

export const selectSeer2PlanningTargets = ({
  ownedTargets,
  currentShop,
  futureShops,
  previousFocusIds = new Set<UnitId>(),
  limit = 3,
}: Seer2PlanningTargetRequest): Seer2PlanningTarget[] => {
  const ownership = new Map(ownedTargets.map((target) => [target.id, target]));
  const shops = [currentShop, ...futureShops];

  return SEER2_TERMINAL_TARGETS.flatMap((target) => {
    const owned = ownership.get(target.id);
    const copies = Math.max(0, Math.min(9, Math.floor(owned?.copies || 0)));
    if (copies >= 9) return [];

    const needed = 9 - copies;
    let forecastHits = 0;
    let completionShopIndex: number | null = null;
    shops.forEach((shop, shopIndex) => {
      const hits = shop.filter((id) => id === target.id).length;
      forecastHits += hits;
      if (completionShopIndex === null && forecastHits >= needed) {
        completionShopIndex = shopIndex;
      }
    });
    const currentShopHits = currentShop.filter((id) => id === target.id).length;
    const remainingAfterForecast = Math.max(0, needed - forecastHits);
    const completionValue = completionShopIndex === null
      ? -remainingAfterForecast * 1_000_000
      : 4_000_000 - completionShopIndex * SEER2_COMPLETION_SHOP_VALUE;
    const score = completionValue
      + currentShopHits * 80_000
      + Math.min(forecastHits, needed) * 2_000
      + copies * 1_000
      + (previousFocusIds.has(target.id)
        ? seer2ProjectStickinessShops(copies) * SEER2_COMPLETION_SHOP_VALUE
        : 0)
      - Math.max(0, owned?.benchSlots || 0) * 1_000
      + target.priority;

    return [{
      ...target,
      copies,
      benchSlots: Math.max(0, Math.floor(owned?.benchSlots || 0)),
      currentShopHits,
      forecastHits,
      completionShopIndex,
      remainingAfterForecast,
      score,
    }];
  })
    .sort((left, right) => right.score - left.score
      || (left.completionShopIndex ?? Number.POSITIVE_INFINITY)
        - (right.completionShopIndex ?? Number.POSITIVE_INFINITY)
      || right.copies - left.copies
      || right.priority - left.priority)
    .slice(0, Math.max(0, Math.floor(limit)));
};
