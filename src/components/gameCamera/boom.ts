/** Engine-independent camera boom rules shared by both Three.js games. */
export type CameraPoint = { x: number; y: number; z: number };

export function clipCameraBoom(target: CameraPoint, desired: CameraPoint, blocked: (point: CameraPoint) => boolean) {
  const dx = desired.x - target.x; const dy = desired.y - target.y; const dz = desired.z - target.z;
  const length = Math.hypot(dx, dy, dz);
  for (let t = 0.1; t <= length + 0.1; t += 0.1) {
    const fraction = Math.min(t / (length || 1), 1);
    const point = { x: target.x + dx * fraction, y: target.y + dy * fraction, z: target.z + dz * fraction };
    if (blocked(point)) {
      const safe = Math.max(0, t - 0.2) / (length || 1);
      return { x: target.x + dx * safe, y: target.y + dy * safe, z: target.z + dz * safe };
    }
  }
  return desired;
}

/** Retract immediately; ease extension on today's ray, never across the orbit. */
export function followCameraBoom(target: CameraPoint, allowed: CameraPoint, previousDistance: number | undefined, delta: number, reset = false) {
  const dx = allowed.x - target.x; const dy = allowed.y - target.y; const dz = allowed.z - target.z;
  const limit = Math.hypot(dx, dy, dz);
  const distance = reset || previousDistance === undefined || previousDistance > limit ? limit
    : previousDistance + (limit - previousDistance) * (1 - Math.exp(-Math.max(0, delta) * 9));
  const ratio = limit > 0 ? distance / limit : 0;
  return { x: target.x + dx * ratio, y: target.y + dy * ratio, z: target.z + dz * ratio, distance };
}
