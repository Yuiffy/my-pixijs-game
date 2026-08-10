import {
  TRAIT_IDS,
  UNIT_DEFS,
  type AbilityCastTiming,
  type UnitId,
} from "../core/gameData";

export const UNIT_COMBAT_ABILITY_TIMINGS = [
  "selfOnHit",
  "supportShield",
  "supportHeal",
  "supportRescue",
  "selfBuff",
  "engage",
  "offenseInRange",
  "offenseReady",
  "passive",
] as const satisfies readonly AbilityCastTiming[];

export const UNIT_COMBAT_FEATURE_NAMES = [
  "cost",
  "hp",
  "attack",
  "armor",
  "range",
  "abilityRange",
  "attackInterval",
  "moveSpeed",
  "ranged",
  "energyMax",
  "energyStart",
  "energyPerSecond",
  "energyOnAttack",
  "energyOnHit",
  "castRefund",
  ...TRAIT_IDS.map((id) => `trait:${id}`),
  ...UNIT_COMBAT_ABILITY_TIMINGS.map((id) => `cast:${id}`),
] as const;

/**
 * These normalized mechanics are deliberately derived from live game data.
 * A new unit can therefore use the learned unknown-ID embedding while still
 * retaining its actual stats, traits, range, and cast behavior.
 */
export const unitCombatFeatureVector = (id: string): number[] => {
  const definition = UNIT_DEFS[id as UnitId];
  if (!definition) return Array(UNIT_COMBAT_FEATURE_NAMES.length).fill(0);
  return [
    definition.cost / 5,
    definition.hp / 500,
    definition.attack / 60,
    definition.armor / 60,
    definition.range / 320,
    definition.abilityRange / 520,
    definition.attackInterval / 2,
    definition.moveSpeed / 120,
    definition.attackType === "ranged" ? 1 : 0,
    definition.energyProfile.max / 120,
    definition.energyProfile.start / 120,
    definition.energyProfile.perSecond / 20,
    definition.energyProfile.onAttack / 24,
    definition.energyProfile.onHit / 20,
    definition.energyProfile.castRefund / 20,
    ...TRAIT_IDS.map((trait) => (definition.traits.includes(trait) ? 1 : 0)),
    ...UNIT_COMBAT_ABILITY_TIMINGS.map((timing) => (
      definition.abilityCastTiming === timing ? 1 : 0
    )),
  ];
};

export const currentUnitCombatFeatures = () => Object.fromEntries(
  Object.keys(UNIT_DEFS).map((id) => [id, unitCombatFeatureVector(id)]),
);
