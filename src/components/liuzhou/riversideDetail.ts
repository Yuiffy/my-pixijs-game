import layout from "./riverside-detail-layout.json";
import { ShapeUtils, Vector2 } from "three";
import { terrainHeight, WATER_LEVEL } from "./terrain";
import { terrainChunks, terrainSurface } from "./terrainMesh";
import type { StreetBox } from "./street";

type P = { x: number; z: number };
type V = P & { y: number };
const chunks = terrainChunks();
const dryCells = new Map<string, V[][]>();
const groundCache = new Map<string, number | undefined>();
// Shoreline cells contain clipped dry triangles. Sampling the DEM at an
// arbitrary point there can float a post above the actual rendered/physics mesh.
export function riversideGroundHeight(p: P): number | undefined {
  const pointKey = `${p.x}:${p.z}`;
  if (groundCache.has(pointKey)) return groundCache.get(pointKey);
  const chunk = chunks.find(c => p.x >= c.minX && p.x < c.maxX && p.z >= c.minZ && p.z < c.maxZ);
  if (!chunk) return undefined;
  const { step } = chunk;
  const x = chunk.minX + Math.floor((p.x - chunk.minX) / step) * step;
  const z = chunk.minZ + Math.floor((p.z - chunk.minZ) / step) * step;
  const key = `${step}:${x}:${z}`;
  let faces = dryCells.get(key);
  if (!faces) {
    const mesh = terrainSurface(
{ minX: x, minZ: z, maxX: Math.min(x + step, chunk.maxX), maxZ: Math.min(z + step, chunk.maxZ) },
step,
rings => ShapeUtils.triangulateShape(rings[0].map(v => new Vector2(...v)), rings.slice(1).map(ring => ring.map(v => new Vector2(...v))))
);
    faces = [];
    for (let i = 0; i < mesh.indices.length; i += 3) {
      const ids = mesh.indices.slice(i, i + 3);
      if (ids.some(id => mesh.kinds[id] !== 0)) continue;
      faces.push(ids.map(id => ({ x: mesh.positions[id * 3], y: mesh.positions[id * 3 + 1], z: mesh.positions[id * 3 + 2] })));
    }
    dryCells.set(key, faces);
  }
  for (const [a, b, c] of faces) {
    const cross = (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
    if (Math.abs(cross) < 1e-10) continue;
    const u = ((p.x - a.x) * (c.z - a.z) - (p.z - a.z) * (c.x - a.x)) / cross;
    const v = ((b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x)) / cross;
    if (u < -1e-7 || v < -1e-7 || u + v > 1 + 1e-7) continue;
    const y = a.y + (b.y - a.y) * u + (c.y - a.y) * v;
    groundCache.set(pointKey, y); return y;
  }
  groundCache.set(pointKey, undefined); return undefined;
}
export const RIVERSIDE_DETAIL_SOLIDS: StreetBox[] = [];
export const RIVERSIDE_DETAIL_DECOR: StreetBox[] = [];
export const RIVERSIDE_DETAIL_RAIL_IDS: string[] = [];
export const RIVERSIDE_DETAIL_BAY_IDS: string[] = [];
const add = (p: P, y: number, size: StreetBox["size"], color: string, angle = 0, solid = true) => {
  const ground = riversideGroundHeight(p);
  if (ground === undefined) return;
  const box = { at: [p.x, ground - terrainHeight(p) + y, p.z] as StreetBox["at"], size, color, angle };
  (solid ? RIVERSIDE_DETAIL_SOLIDS : RIVERSIDE_DETAIL_DECOR).push(box);
};

// The source contains no quay levels or current railing designs. Only short,
// dry, gently sloping sections receive this explicitly estimated furniture.
for (const rail of layout.rails) {
  const a = { x: rail.a[0], z: rail.a[1] }; const b = { x: rail.b[0], z: rail.b[1] };
  const p = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
  const samples = [a, b, p].map(riversideGroundHeight);
  if (samples.some(y => y === undefined)) continue;
  const heights = samples as number[];
  const low = Math.min(...heights); const high = Math.max(...heights);
  if (low < WATER_LEVEL + 0.25 || high - low > 0.52) continue;
  const length = Math.hypot(b.x - a.x, b.z - a.z); const angle = -Math.atan2(b.z - a.z, b.x - a.x);
  const ground = riversideGroundHeight(p)!;
  add(p, high + 0.99 - ground, [length + 0.06, 0.16, 0.18], "#687968", angle);
  add(p, high + 0.49 - ground, [length + 0.06, 0.12, 0.14], "#87947d", angle);
  for (const end of [a, b]) {
    const y = riversideGroundHeight(end)!;
    add(end, (high + 1.15 - y) / 2 - 0.06, [0.2, high + 1.15 - y + 0.12, 0.24], "#9fa58d", angle);
    add(end, high + 1.18 - y, [0.34, 0.12, 0.36], "#c3bc9a", angle, false);
  }
  RIVERSIDE_DETAIL_RAIL_IDS.push(rail.id);
}

for (const bay of layout.restBays) {
  const p = { x: bay.bench[0], z: bay.bench[1] };
  const across = bay.tangent; const outward = bay.riverDirection;
  const angle = -Math.atan2(across[1], across[0]);
  const supportPoints = [p, ...[-1.65, 1.65].flatMap(s => [-0.5, 0.5].map(d => ({ x: p.x + across[0] * s + outward[0] * d, z: p.z + across[1] * s + outward[1] * d }))),
    { x: p.x + across[0] * 2.55, z: p.z + across[1] * 2.55 }];
  const supports = supportPoints.map(riversideGroundHeight);
  if (supports.some(y => y === undefined)) continue;
  const benchEnds = supports as number[];
  const base = riversideGroundHeight(p)!;
  if (Math.min(base, ...benchEnds) < WATER_LEVEL + 0.3 || Math.max(...benchEnds) - Math.min(...benchEnds) > 0.5) continue;
  const seatBase = Math.max(...benchEnds);
  add(p, seatBase - base + 0.59, [3.3, 0.18, 0.78], "#a18c63", angle);
  for (const s of [-1.25, 1.25]) {
    const leg = { x: p.x + across[0] * s, z: p.z + across[1] * s };
    const length = seatBase + 0.5 - riversideGroundHeight(leg)! + 0.08;
    add(leg, length / 2 - 0.08, [0.25, length, 0.66], "#707d69", angle);
  }
  const back = { x: p.x - outward[0] * 0.35, z: p.z - outward[1] * 0.35 };
  add(back, seatBase - riversideGroundHeight(back)! + 0.99, [3.3, 0.66, 0.14], "#a18c63", angle);
  for (const s of [-1.6, 1.6]) {
    const arm = { x: p.x + across[0] * s, z: p.z + across[1] * s };
    add(arm, seatBase - riversideGroundHeight(arm)! + 0.78, [0.14, 0.2, 0.8], "#586f60", angle, false);
  }
  const bin = { x: p.x + across[0] * 2.55, z: p.z + across[1] * 2.55 };
  add(bin, 0.48, [0.65, 0.96, 0.65], "#75816b", angle);
  add(bin, 1.02, [0.74, 0.12, 0.74], "#b5ad8c", angle, false);
  RIVERSIDE_DETAIL_BAY_IDS.push(bay.id);
}
