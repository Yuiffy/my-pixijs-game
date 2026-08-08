import type {
  AugmentId,
  StarterId,
  UnitId,
  WaveDefinition,
} from "../core/gameData";

export type GoCombatScenarioPlacement = {
  slot: number;
  id: UnitId;
  star: 1 | 2 | 3;
};

export type GoCombatScenario = {
  enemySeed: number;
  round: number;
  starter: StarterId | null;
  augments: readonly AugmentId[];
  wave: WaveDefinition;
  placements: readonly GoCombatScenarioPlacement[];
};

export const goCombatScenarioSignature = (scenario: GoCombatScenario) => [
  `enemy:${scenario.enemySeed}`,
  `round:${scenario.round}`,
  scenario.starter,
  [...scenario.augments].sort().join(","),
  scenario.wave.tag,
  scenario.wave.modifier,
  scenario.wave.units.map((unit) => `${unit.id}:${unit.star || 1}`).join(","),
  scenario.placements
    .map(({ slot, id, star }) => `${slot}:${id}:${star}`)
    .sort()
    .join(","),
].join("/");

export const goCombatScenarioSeed = (signature: string, variant = 0) => {
  const branchSignature = `${signature}/rollout:${variant}`;
  let hash = 5381;
  for (let index = 0; index < branchSignature.length; index += 1) {
    hash = (hash * 33 + branchSignature.charCodeAt(index)) % 2147483647;
  }
  return hash || 1;
};
