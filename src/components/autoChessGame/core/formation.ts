import { UNIT_DEFS } from "./gameData";
import type { OwnedUnit, UnitLocation } from "./gameTypes";

export type FormationEntry = {
  unit: OwnedUnit;
  location: UnitLocation;
};

export type FormationPlacement<T extends FormationEntry = FormationEntry> = {
  entry: T;
  slot: number;
};

const CANONICAL_MELEE_SLOTS = [11, 17, 10, 16, 5, 23, 9, 15, 4, 22] as const;
const CANONICAL_RANGED_SLOTS = [10, 16, 9, 15, 4, 22, 3, 21, 8, 14] as const;
const REI_ANCHOR_SLOT = 23;
const STAR_POWER = { 1: 1, 2: 2.6, 3: 7 } as const;

const formationDurability = (unit: OwnedUnit) => {
  const definition = UNIT_DEFS[unit.id];
  return (definition.hp + definition.armor * 7) * STAR_POWER[unit.star];
};

/**
 * Stable default formation shared by player assistance and AI evaluation.
 * Frontliners are ordered by star and durability; ranged units fill inward
 * from the protected middle rows. UID is only a final duplicate tiebreaker.
 */
export const canonicalFormationPlacements = <T extends FormationEntry>(
  lineup: readonly T[],
): Array<FormationPlacement<T>> => {
  const ordered = [...lineup].sort((left, right) => {
    const leftDefinition = UNIT_DEFS[left.unit.id];
    const rightDefinition = UNIT_DEFS[right.unit.id];
    return Number(rightDefinition.attackType === "melee")
      - Number(leftDefinition.attackType === "melee")
      || right.unit.star - left.unit.star
      || formationDurability(right.unit) - formationDurability(left.unit)
      || rightDefinition.range - leftDefinition.range
      || rightDefinition.attack - leftDefinition.attack
      || left.unit.id.localeCompare(right.unit.id)
      || left.unit.uid - right.unit.uid;
  });
  const frontline = ordered.filter(({ unit }) => (
    unit.id === "rei" || UNIT_DEFS[unit.id].attackType === "melee"
  ));
  const ranged = ordered.filter(({ unit }) => (
    unit.id !== "rei" && UNIT_DEFS[unit.id].attackType === "ranged"
  ));
  const used = new Set<number>();
  const placements: Array<FormationPlacement<T>> = [];
  const place = (entry: T, preferredSlots: readonly number[]) => {
    const slot = preferredSlots.find((candidate) => !used.has(candidate));
    if (slot === undefined) return;
    used.add(slot);
    placements.push({ entry, slot });
  };

  frontline
    .filter(({ unit }) => unit.id === "rei")
    .forEach((entry) => place(entry, [REI_ANCHOR_SLOT, ...CANONICAL_MELEE_SLOTS]));
  frontline
    .filter(({ unit }) => unit.id !== "rei")
    .forEach((entry) => place(entry, CANONICAL_MELEE_SLOTS));
  ranged.forEach((entry) => place(entry, CANONICAL_RANGED_SLOTS));

  return placements;
};
