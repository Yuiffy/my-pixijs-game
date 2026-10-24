import layout from "./underground-layout.json";
import { terrainHeight } from "./terrain";

type P = { x: number; z: number };
type V = P & { y: number };
export type UndergroundBox = { at: [number, number, number]; size: [number, number, number]; angle: number; color: string };
export const UNDERGROUND_ENTRANCES = layout.entrances;
export const UNDERGROUND_WALKS = layout.walks;
export const UNDERGROUND_SHOPS = layout.shops;
export const UNDERGROUND_CUTS: Record<string, number[][][][]> = layout.terrainCuts;
const south = terrainHeight({ x: -598.105, z: -37.838 }) - 6.6;
const north = terrainHeight({ x: -574.689, z: -531.085 }) - 6.6;
const westProfile = Array.from({ length: 9 }, (_, i) => terrainHeight({ x: -820 + i * 20, z: -531.085 }));
export const undergroundLevel = (p: P) => {
  const grade = Math.max(0, Math.min(7.99999, (p.x + 820) / 20));
  const n = Math.floor(grade); const fraction = grade - n;
  const west = Math.max(0, westProfile[n] * (1 - fraction) + westProfile[n + 1] * fraction - westProfile[8]);
  return south + (north - south) * Math.max(0, Math.min(1, (-p.z - 37.838) / 493.247)) + (p.x < -660 ? west : 0);
};
export const UNDERGROUND_CLEARANCE = 4.4;
// The generated shell adds 0.22m around the opening and another 0.08m
// around its retaining wall. Treads extend into that shell to seal the edges.
const STAIR_EDGE = 0.3;

function inRing(p: P, ring: number[][]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]; const b = ring[j];
    if ((a[1] > p.z) !== (b[1] > p.z) && p.x < ((b[0] - a[0]) * (p.z - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
const inPolygons = (p: P, polygons: number[][][][]) => polygons.some(rings => inRing(p, rings[0]) && !rings.slice(1).some(r => inRing(p, r)));
export const undergroundOpening = (p: P) => p.x > -800 && p.x < -325 && p.z > -585 && p.z < 0 && inPolygons(p, layout.openings);
export const undergroundPlan = (p: P) => p.x > -800 && p.x < -325 && p.z > -585 && p.z < 0 && inPolygons(p, layout.floor);
export const undergroundLocation = (p: V) => (undergroundOpening(p) && p.y < terrainHeight(p) + 0.4 ? "entrance" : undergroundPlan(p) && p.y < undergroundLevel(p) + UNDERGROUND_CLEARANCE ? "concourse" : null);
/** The lower fallback floor must never raise the capsule through a stair tread
 * or through the ground above a tunnel. Actual treads are Rapier geometry. */
export function undergroundFloor(p: V) {
  return undergroundOpening(p) || undergroundLocation(p) === "concourse" ? undergroundLevel(p) : undefined;
}
export function undergroundFree(p: V) {
  return undergroundPlan(p) && p.y > (undergroundOpening(p) ? undergroundStairSupport(p) ?? undergroundLevel(p) : undergroundLevel(p)) + 0.1 && (undergroundOpening(p) ? p.y < terrainHeight(p) + 4 : p.y < undergroundLevel(p) + UNDERGROUND_CLEARANCE - 0.2);
}
function project(p: P, a: number[], b: number[]) {
  const dx = b[0] - a[0]; const dz = b[1] - a[1];
  const length = Math.hypot(dx, dz);
  const t = Math.max(0, Math.min(1, ((p.x - a[0]) * dx + (p.z - a[1]) * dz) / (length * length || 1)));
  return { distance: Math.hypot(p.x - a[0] - dx * t, p.z - a[1] - dz * t), t, length };
}
const stairSegments = UNDERGROUND_ENTRANCES.flatMap(e => {
  let walked = 0;
  const total = e.points.slice(1).reduce((sum, b, i) => sum + Math.hypot(b[0] - e.points[i][0], b[1] - e.points[i][1]), 0);
  return e.points.slice(1).map((b, i) => {
    const a = e.points[i]; const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const segment = { e, a, b, length, start: walked, total }; walked += length; return segment;
  });
});
function stairY(segment: typeof stairSegments[number], distance: number) {
  const turn = Math.hypot(segment.e.points[1][0] - segment.e.top[0], segment.e.points[1][1] - segment.e.top[1]);
  // The full-width turn needs a landing extending beyond the half-width of
  // both flights. A one-metre landing leaves a tall overlapping tread side.
  const landing = 2.1;
  const progress = Math.max(0, Math.min(1, (distance < turn - landing ? distance : distance < turn + landing ? turn - landing : distance - landing * 2) / (segment.total - landing * 2)));
  return terrainHeight({ x: segment.e.top[0], z: segment.e.top[1] }) * (1 - progress) + undergroundLevel({ x: segment.e.bottom[0], z: segment.e.bottom[1] }) * progress;
}
export function undergroundStairSupport(p: P) {
  const near = stairSegments.map(s => ({ s, ...project(p, s.a, s.b) })).filter(s => s.distance <= s.s.e.width / 2 + STAIR_EDGE).sort((a, b) => a.distance - b.distance)[0];
  return near ? stairY(near.s, near.s.start + near.t * near.s.length) : undefined;
}
export const UNDERGROUND_STEPS: UndergroundBox[] = stairSegments.flatMap(s => {
  const count = Math.max(Math.ceil(s.length / 0.32), Math.ceil(Math.abs(stairY(s, s.start) - stairY(s, s.start + s.length)) / 0.15));
  const result: UndergroundBox[] = [];
  for (let i = 0; i < count; i++) {
    let end = i + 1;
    const top = stairY(s, s.start + (end / count) * s.length);
    // A landing is one slab per flight. Alternating overlapping treads on
    // the same plane produced stripes and flicker at the stair turn.
    while (end < count && Math.abs(stairY(s, s.start + ((end + 1) / count) * s.length) - top) < 1e-9) end++;
    const t = (i + end) / (2 * count);
    const x = s.a[0] + (s.b[0] - s.a[0]) * t; const z = s.a[1] + (s.b[1] - s.a[1]) * t;
    const bottom = Math.min(undergroundLevel({ x, z }) - 0.2, top - 0.15);
    result.push({ at: [x, (top + bottom) / 2, z], size: [s.e.width + STAIR_EDGE * 2, top - bottom, ((end - i) * s.length) / count + 0.035], angle: Math.atan2(s.b[0] - s.a[0], s.b[1] - s.a[1]), color: end - i > 1 ? "#b8b8aa" : i % 2 ? "#bab9aa" : "#b4b4a7" });
    i = end - 1;
  }
  return result;
});

// Convex rectangles around the raw stair segments let paving triangles be
// clipped at the same openings as the terrain, without deleting whole roads.
const convexOpenings = stairSegments.map(s => {
  const nx = ((s.b[1] - s.a[1]) / s.length) * (s.e.width / 2 + 0.23);
  const nz = (-(s.b[0] - s.a[0]) / s.length) * (s.e.width / 2 + 0.23);
  return [{ x: s.a[0] - nx, z: s.a[1] - nz }, { x: s.b[0] - nx, z: s.b[1] - nz }, { x: s.b[0] + nx, z: s.b[1] + nz }, { x: s.a[0] + nx, z: s.a[1] + nz }];
});
function halfPlane(poly: P[], a: P, b: P, sign: number) {
  const side = (p: P) => sign * ((b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x));
  const result: P[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]; const q = poly[(i + 1) % poly.length]; const v = side(p); const w = side(q);
    if (v >= 0) result.push(p);
    if ((v >= 0) !== (w >= 0)) { const t = v / (v - w); result.push({ x: p.x + (q.x - p.x) * t, z: p.z + (q.z - p.z) * t }); }
  }
  return result;
}
export function pavingWithoutEntrances(points: P[]) {
  if (points.every(p => p.x < -800) || points.every(p => p.x > -325) || points.every(p => p.z < -585) || points.every(p => p.z > 0)) return [points];
  let pieces = [points];
  for (const opening of convexOpenings) {
    const next: P[][] = [];
    for (const piece of pieces) {
      if (piece.every(p => p.x < Math.min(...opening.map(q => q.x))) || piece.every(p => p.x > Math.max(...opening.map(q => q.x))) || piece.every(p => p.z < Math.min(...opening.map(q => q.z))) || piece.every(p => p.z > Math.max(...opening.map(q => q.z)))) { next.push(piece); continue; }
      let remainder = piece;
      for (let i = 0; i < opening.length && remainder.length >= 3; i++) {
        const a = opening[i]; const b = opening[(i + 1) % opening.length];
        const outside = halfPlane(remainder, a, b, 1); if (outside.length >= 3) next.push(outside);
        remainder = halfPlane(remainder, a, b, -1);
      }
    }
    pieces = next;
  }
  return pieces;
}

/** One mesh definition for render, collision and camera boundaries. */
export function undergroundSurface(triangulate: (rings: number[][][]) => number[][]) {
  const positions: number[] = []; const indices: number[] = []; const kinds: number[] = [];
  const surface = (polygons: number[][][][], offset: number, kind: number) => {
    for (const rings of polygons) {
      const start = positions.length / 3;
      for (const p of rings.flat()) { positions.push(p[0], undergroundLevel({ x: p[0], z: p[1] }) + offset, p[1]); kinds.push(kind); }
      for (const triangle of triangulate(rings)) {
        const [a, b, c] = triangle.map(i => start + i);
        const cross = (positions[b * 3] - positions[a * 3]) * (positions[c * 3 + 2] - positions[a * 3 + 2]) - (positions[c * 3] - positions[a * 3]) * (positions[b * 3 + 2] - positions[a * 3 + 2]);
        const flip = kind === 0 ? cross > 0 : cross < 0;
        indices.push(a, flip ? c : b, flip ? b : c);
      }
    }
  };
  surface(layout.floorPatches, 0, 0); surface(layout.roofPatches, UNDERGROUND_CLEARANCE, 1);
  for (const rings of layout.floor) for (const ring of rings) for (let i = 0; i < ring.length; i++) {
    const a = ring[i]; const b = ring[(i + 1) % ring.length]; const p = { x: (a[0] + b[0]) / 2, z: (a[1] + b[1]) / 2 };
    // Open only the street-height part of the sill. Dropping its entire wall
    // also exposed the concourse below beside nearby shop bays. Keeping the
    // lower retaining face seals that view without blocking street entry.
    const entrance = UNDERGROUND_ENTRANCES.find(e => Math.hypot(p.x - e.top[0], p.z - e.top[1]) < e.width / 2 + 0.3);
    const well = stairSegments.some(s => project(p, s.a, s.b).distance < s.e.width / 2 + 0.4);
    const top = (q: P) => (entrance ? terrainHeight({ x: entrance.top[0], z: entrance.top[1] }) - 0.3 : well ? terrainHeight(q) + 0.85 : undergroundLevel(q) + UNDERGROUND_CLEARANCE);
    // Floor/roof patches split at these grade changes. The wall needs the
    // same vertices or its straight top can leave a gap below the ceiling.
    const cuts = [0, 1];
    for (const x of westProfile.map((_, n) => -820 + n * 20)) if (b[0] !== a[0]) {
      const t = (x - a[0]) / (b[0] - a[0]); if (t > 0 && t < 1) cuts.push(t);
    }
    for (const z of [-531.085, -37.838]) if (b[1] !== a[1]) {
      const t = (z - a[1]) / (b[1] - a[1]); if (t > 0 && t < 1) cuts.push(t);
    }
    if (well) {
      const count = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 1.5);
      for (let n = 1; n < count; n++) cuts.push(n / count);
    }
    cuts.sort((left, right) => left - right);
    for (let n = 1; n < cuts.length; n++) {
      if (cuts[n] - cuts[n - 1] < 1e-9) continue;
      const point = (t: number) => ({ x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t });
      const from = point(cuts[n - 1]); const to = point(cuts[n]); const start = positions.length / 3;
      positions.push(from.x, undergroundLevel(from) - 0.15, from.z, to.x, undergroundLevel(to) - 0.15, to.z, from.x, top(from), from.z, to.x, top(to), to.z);
      kinds.push(2, 2, 2, 2); indices.push(start, start + 1, start + 2, start + 1, start + 3, start + 2);
    }
  }
  return { positions, indices, kinds };
}
