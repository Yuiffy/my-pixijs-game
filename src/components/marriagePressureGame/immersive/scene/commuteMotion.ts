// Visual travel is independent of the week's decisions: chatting never advances a turn.
export interface CommuteMotion {
  distance: number;
  elapsed: number;
  moving: boolean;
}

export const STREET_LENGTH = 12;
export const STREET_SEGMENTS = 5;
export const WALK_SPEED = 0.95;

export function stepCommute(motion: CommuteMotion, delta: number) {
  if (!motion.moving || !Number.isFinite(delta) || delta <= 0) return;
  // Returning from a hidden tab must not teleport the street past the player.
  const seconds = Math.min(delta, 0.1);
  motion.elapsed += seconds;
  motion.distance += seconds * WALK_SPEED;
}

export function streetPosition(index: number, distance: number) {
  const length = STREET_LENGTH * STREET_SEGMENTS;
  // Recycle only behind the camera; the far end is concealed by fog.
  return 18 - ((((index * STREET_LENGTH - distance + length) % length) + length) % length);
}
