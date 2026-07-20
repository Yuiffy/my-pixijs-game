import type { UnitId } from "./gameData";
import type { MechanicalRabbitPet } from "./gameTypes";

const CLOCK_GUNNER_RABBIT_MUZZLE_DISTANCE = 1.55;

export const BATTLE_BOUNDS = { left: 52, right: 1068, top: 145, bottom: 625 };

export const fighterVisualRadius = (unitId: UnitId, star: 1 | 2 | 3) => {
  if (unitId === "rift_tyrant") return 43;
  return 26 + (star - 1) * 3;
};

export const mechanicalRabbitMuzzle = (
  pet: Pick<MechanicalRabbitPet, "x" | "y" | "radius" | "aimX" | "aimY">,
) => {
  const length = Math.hypot(pet.aimX, pet.aimY) || 1;
  return {
    x: pet.x + (pet.aimX / length) * pet.radius * CLOCK_GUNNER_RABBIT_MUZZLE_DISTANCE,
    y: pet.y + (pet.aimY / length) * pet.radius * CLOCK_GUNNER_RABBIT_MUZZLE_DISTANCE,
  };
};
