import type { Point } from "./world";
import { terrainHeight } from "./terrain";

// The origin lies inside OSM historic site 205661090. The previous scenery
// stood 65 m north of it. Position is still approximate, not a surveyed plan.
// Hall span/depth: 城中文史第十四辑《东门城楼的建筑艺术、古城与民俗》.
export const DONGMEN = {
  x: -2.8,
  z: -2.2,
  hallWidth: 16.44,
  hallDepth: 10.41,
  width: 28,
  depth: 18.4,
  terrace: 6.2,
  opening: 3.4,
  spring: 2,
  stairs: { x: -16.4, top: -4.4, tread: 0.6, rise: 0.2, count: 31, width: 3 },
};
export const GATE_GROUND = terrainHeight(DONGMEN);
export type GateBox = {
  at: [number, number, number];
  size: [number, number, number];
};
const { width, depth, terrace, opening, spring, stairs } = DONGMEN;
export const GATE_WINGS: GateBox[] = [-1, 1].map(side => ({
  at: [(side * (width + opening)) / 4, terrace / 2, 0],
  size: [(width - opening) / 2, terrace, depth],
}));
// Narrow strips approximate only the collision's curved soffit. The visible
// arch is continuous geometry. Test the full capsule, not just its centre.
export const GATE_ARCH: GateBox[] = Array.from({ length: 24 }, (_, i) => {
  const step = opening / 24;
  const x = -opening / 2 + (i + 0.5) * step;
  const edge = Math.max(Math.abs(x - step / 2), Math.abs(x + step / 2));
  const bottom = spring + Math.sqrt(Math.max(0, (opening / 2) ** 2 - edge ** 2));
  return { at: [x, (bottom + terrace) / 2, 0], size: [step, terrace - bottom, depth] };
});
export const GATE_STAIRS: GateBox[] = Array.from({ length: stairs.count }, (_, i) => {
  const h = terrace - i * stairs.rise;
  return {
    at: [stairs.x, h / 2, stairs.top + (i + 0.5) * stairs.tread],
    size: [stairs.width, h, stairs.tread],
  };
});
export const GATE_LANDING: GateBox = { at: [-15.6, terrace / 2, -5.3], size: [4.6, terrace, 1.8] };
export const GATE_STAIR_RAILS: GateBox[] = GATE_STAIRS.flatMap(b => [-1, 1].map(side => ({
  at: [stairs.x + side * (stairs.width / 2 + 0.15), (b.size[1] + 0.7) / 2, b.at[2]] as [number, number, number],
  size: [0.3, b.size[1] + 0.7, stairs.tread] as [number, number, number],
})));
export const GATE_PARAPETS: GateBox[] = [
  { at: [0, terrace + 0.55, depth / 2 - 0.22], size: [width, 1.1, 0.44] },
  { at: [0, terrace + 0.55, -depth / 2 + 0.22], size: [width, 1.1, 0.44] },
  { at: [width / 2 - 0.22, terrace + 0.55, 0], size: [0.44, 1.1, depth] },
  // Leave a real opening from the stair landing onto the western terrace.
  { at: [-width / 2 + 0.22, terrace + 0.55, 2.5], size: [0.44, 1.1, 12.8] },
  { at: [-width / 2 + 0.22, terrace + 0.55, -7.7], size: [0.44, 1.1, 3] },
];
export const GATE_HALL: GateBox = {
  at: [0, 10.2, -1], size: [DONGMEN.hallWidth, 8, DONGMEN.hallDepth - 3],
};
export const GATE_EAVES: GateBox[] = [
  { at: [0, 10.3, 0], size: [20.4, 0.4, 13.3] },
  { at: [0, 14.3, 0], size: [15.1, 0.4, 10.1] },
];
export const GATE_COLUMNS = [-DONGMEN.hallWidth / 2, -DONGMEN.hallWidth * 0.3, -DONGMEN.hallWidth * 0.1,
  DONGMEN.hallWidth * 0.1, DONGMEN.hallWidth * 0.3, DONGMEN.hallWidth / 2];
export const GATE_POSTS: GateBox[] = GATE_COLUMNS.map(x => ({ at: [x, 8.2, 4.65], size: [0.42, 4, 0.42] }));
export const GATE_SOLIDS = [...GATE_WINGS, ...GATE_ARCH, ...GATE_STAIRS, ...GATE_STAIR_RAILS, GATE_LANDING, ...GATE_PARAPETS, GATE_HALL, ...GATE_EAVES, ...GATE_POSTS];

export const gatePoint = (x: number, z: number): Point => ({ x: DONGMEN.x + x, z: DONGMEN.z + z });
export function gateContains(p: Point & { y: number }, margin = 0) {
  const x = p.x - DONGMEN.x; const z = p.z - DONGMEN.z;
  return GATE_SOLIDS.some(b => Math.abs(x - b.at[0]) < b.size[0] / 2 + margin
    && Math.abs(p.y - GATE_GROUND - b.at[1]) < b.size[1] / 2 + margin
    && Math.abs(z - b.at[2]) < b.size[2] / 2 + margin);
}
// Walking floor only. Never infer elevation from an arbitrary saved y value.
export function gateFloor(p: Point) {
  const x = p.x - DONGMEN.x; const z = p.z - DONGMEN.z;
  if (Math.abs(x) < width / 2 && Math.abs(z) < depth / 2) return GATE_GROUND + terrace;
  if (Math.abs(x - GATE_LANDING.at[0]) < GATE_LANDING.size[0] / 2
    && Math.abs(z - GATE_LANDING.at[2]) < GATE_LANDING.size[2] / 2) return GATE_GROUND + terrace;
  if (Math.abs(x - stairs.x) < stairs.width / 2 && z >= stairs.top && z < stairs.top + stairs.tread * stairs.count) {
    return GATE_GROUND + terrace - Math.floor((z - stairs.top) / stairs.tread) * stairs.rise;
  }
  return terrainHeight(p);
}
export function restoreGatePosition(p: Point & { y?: number }, vehicle = false) {
  const floor = gateFloor(p);
  const ground = terrainHeight(p);
  const savedY = Number.isFinite(p.y) ? p.y! : ground;
  if (!vehicle && floor > ground + 0.1 && Math.abs(savedY - floor) < 2.5 && !gateContains({ ...p, y: floor + 1 }, 0.4)) {
    return { x: p.x, z: p.z, y: floor };
  }
  // Old ground-level saves may now lie in the newly positioned wall, or on a
  // stair. Keep progress; move those actors to open ground beside the gate.
  if (gateContains({ ...p, y: ground + 1 }, vehicle ? 1.1 : 0.4)) {
    const out = { x: DONGMEN.x + width / 2 + 4, z: p.z };
    return { ...out, y: terrainHeight(out) };
  }
  return { x: p.x, z: p.z, y: ground };
}
