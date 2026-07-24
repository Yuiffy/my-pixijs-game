import type { UnitId } from "./gameData";
import type { MechanicalRabbitPet } from "./gameTypes";

const CLOCK_GUNNER_RABBIT_MUZZLE_DISTANCE = 1.55;

export const BATTLE_BOUNDS = { left: 52, right: 1068, top: 145, bottom: 625 };

export const rayEndpointAtBattleBounds = (
  source: { x: number; y: number },
  target: { x: number; y: number },
) => {
  const deltaX = target.x - source.x;
  const deltaY = target.y - source.y;
  const length = Math.hypot(deltaX, deltaY);
  if (length <= Number.EPSILON) return { x: target.x, y: target.y };

  const directionX = deltaX / length;
  const directionY = deltaY / length;
  const distances = [
    directionX > 0
      ? (BATTLE_BOUNDS.right - source.x) / directionX
      : directionX < 0
        ? (BATTLE_BOUNDS.left - source.x) / directionX
        : Number.POSITIVE_INFINITY,
    directionY > 0
      ? (BATTLE_BOUNDS.bottom - source.y) / directionY
      : directionY < 0
        ? (BATTLE_BOUNDS.top - source.y) / directionY
        : Number.POSITIVE_INFINITY,
  ].filter((distance) => Number.isFinite(distance) && distance >= 0);
  const distance = Math.min(...distances);

  return {
    x: Math.min(BATTLE_BOUNDS.right, Math.max(BATTLE_BOUNDS.left, source.x + directionX * distance)),
    y: Math.min(BATTLE_BOUNDS.bottom, Math.max(BATTLE_BOUNDS.top, source.y + directionY * distance)),
  };
};

export const pointDistanceFromForwardRay = (
  source: { x: number; y: number },
  target: { x: number; y: number },
  point: { x: number; y: number },
) => {
  const deltaX = target.x - source.x;
  const deltaY = target.y - source.y;
  const length = Math.hypot(deltaX, deltaY);
  if (length <= Number.EPSILON) return Number.POSITIVE_INFINITY;

  const pointX = point.x - source.x;
  const pointY = point.y - source.y;
  const projection = (pointX * deltaX + pointY * deltaY) / length;
  if (projection < 0) return Number.POSITIVE_INFINITY;
  return Math.abs(pointX * deltaY - pointY * deltaX) / length;
};

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
