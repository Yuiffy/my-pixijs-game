import type { UnitId } from "../core/gameData";
import type { LateGameTarget } from "./lateGamePlan";

export type GoTargetOwnership = {
  id: UnitId;
  copies: number;
  benchSlots?: number;
};

export type GoOpportunityCandidate = LateGameTarget & {
  learnedValue: number;
};

export type GoOpportunityTarget = GoOpportunityCandidate & {
  copies: number;
  benchSlots: number;
  currentShopHits: number;
  forecastHits: number;
  completionShopIndex: number | null;
  remainingAfterForecast: number;
  score: number;
};

type GoOpportunityTargetRequest = {
  candidates: readonly GoOpportunityCandidate[];
  ownedTargets: readonly GoTargetOwnership[];
  currentShop: readonly (UnitId | null)[];
  futureShops: readonly (readonly (UnitId | null)[])[];
  previousFocusIds?: ReadonlySet<UnitId>;
  limit?: number;
};

const COMPLETION_SHOP_VALUE = 20_000;
const CURRENT_SHOP_HIT_VALUE = 120_000;
const LEARNED_VALUE_WEIGHT = 75_000;

const projectStickinessShops = (copies: number) => (
  6 + copies * 2 + (copies >= 6 ? 6 : 0)
);

/**
 * Select projects by semantic ownership and deterministic shop availability.
 * learnedValue is the Go model's marginal value for completing the 3-star unit.
 */
export const selectGoOpportunityTargets = ({
  candidates,
  ownedTargets,
  currentShop,
  futureShops,
  previousFocusIds = new Set<UnitId>(),
  limit = 3,
}: GoOpportunityTargetRequest): GoOpportunityTarget[] => {
  const ownership = new Map(ownedTargets.map((target) => [target.id, target]));
  const shops = [currentShop, ...futureShops];

  return candidates.flatMap((target) => {
    const owned = ownership.get(target.id);
    const desiredCopies = target.desiredStar === 3 ? 9 : 3;
    const copies = Math.max(0, Math.min(desiredCopies, Math.floor(owned?.copies || 0)));
    if (copies >= desiredCopies) return [];

    const needed = desiredCopies - copies;
    let forecastHits = 0;
    let completionShopIndex: number | null = null;
    shops.forEach((shop, shopIndex) => {
      forecastHits += shop.filter((id) => id === target.id).length;
      if (completionShopIndex === null && forecastHits >= needed) {
        completionShopIndex = shopIndex;
      }
    });
    const currentShopHits = currentShop.filter((id) => id === target.id).length;
    const remainingAfterForecast = Math.max(0, needed - forecastHits);
    if (
      completionShopIndex === null
      && copies < Math.min(3, desiredCopies)
      && currentShopHits === 0
    ) return [];

    const progressTier = copies >= 6 ? 3 : copies >= 3 ? 2 : copies > 0 ? 1 : 0;
    const completionValue = completionShopIndex === null
      ? -remainingAfterForecast * 1_000_000
      : 4_000_000 - completionShopIndex * COMPLETION_SHOP_VALUE;
    const learnedValue = Math.max(-5, Math.min(5, target.learnedValue));
    const score = completionValue
      + currentShopHits * CURRENT_SHOP_HIT_VALUE
      + Math.min(forecastHits, needed) * 3_000
      + progressTier * 15_000
      + copies * 4_000
      + learnedValue * LEARNED_VALUE_WEIGHT
      + (previousFocusIds.has(target.id)
        ? projectStickinessShops(copies) * COMPLETION_SHOP_VALUE
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
      || right.learnedValue - left.learnedValue
      || right.priority - left.priority
      || left.id.localeCompare(right.id))
    .slice(0, Math.max(0, Math.floor(limit)));
};
