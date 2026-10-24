import layout from "./riverside-layout.json";

type P = { x: number; z: number };
const inside = (p: P, ring: number[][]) => {
  let result = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]; const b = ring[j];
    if ((a[1] > p.z) !== (b[1] > p.z) && p.x < ((b[0] - a[0]) * (p.z - a[1])) / (b[1] - a[1]) + a[0]) result = !result;
  }
  return result;
};
const nearRing = (p: P, ring: number[][], radius: number) => ring.some((a, i) => {
  const b = ring[(i + 1) % ring.length]; const dx = b[0] - a[0]; const dz = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p.x - a[0]) * dx + (p.z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(p.x - a[0] - t * dx, p.z - a[1] - t * dz) <= radius;
});

export const RIVERSIDE_PARKS = layout.parks;
/** Protect source park land from estimated buildings, including edge overlap. */
export function riversideReserved(p: P, radius = 0) {
  return RIVERSIDE_PARKS.some(park => park.parts.some(part => (inside(p, part.points) && !part.holes.some(hole => inside(p, hole)))
    || (radius > 0 && (nearRing(p, part.points, radius) || part.holes.some(hole => nearRing(p, hole, radius))))));
}
