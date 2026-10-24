import layout from "./market-east-layout.json";
import { terrainHeight } from "./terrain";
import { terrainTriangleHeight } from "./terrainMesh";
import type { StreetBox } from "./street";
import { pointInUrbanPolygon } from "./urban";

type P = { x: number; z: number };
const point = (p: number[]): P => ({ x: p[0], z: p[1] });
export const MARKET_PARCEL = layout.sourceParcel.points.map(point);
export const MARKET_EAST_COURTS = layout.courtsEstimated.map(c => ({ side: c.side, points: c.points.map(point), walk: c.walk.map(point) }));
export function marketParcelReserved(p: P, margin: number) {
  if (p.x < -410 - margin || p.x > -200 + margin || p.z < -2155 - margin || p.z > -1935 + margin) return false;
  return pointInUrbanPolygon(p, MARKET_PARCEL) || MARKET_PARCEL.some((a, i) => {
    const b = MARKET_PARCEL[(i + 1) % MARKET_PARCEL.length]; const dx = b.x - a.x; const dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1)));
    return Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t) <= margin;
  });
}

export const MARKET_EAST_BUILDINGS = layout.buildingsEstimated.map((b, i) => {
  const footprint = b.points.map(point); const xs = footprint.map(p => p.x); const zs = footprint.map(p => p.z);
  const p = { x: (Math.min(...xs) + Math.max(...xs)) / 2, z: (Math.min(...zs) + Math.max(...zs)) / 2 };
  const baseY = terrainHeight(p); let foundationDepth = 3;
  for (let edge = 0; edge < footprint.length; edge++) {
    const a = footprint[edge]; const c = footprint[(edge + 1) % footprint.length]; const samples = Math.max(1, Math.ceil(Math.hypot(c.x - a.x, c.z - a.z)));
    for (let n = 0; n <= samples; n++) foundationDepth = Math.max(foundationDepth, baseY - terrainTriangleHeight({ x: a.x + ((c.x - a.x) * n) / samples, z: a.z + ((c.z - a.z) * n) / samples }) + 0.6);
  }
  return { ...p, id: b.id, w: Math.max(...xs) - Math.min(...xs), d: Math.max(...zs) - Math.min(...zs), h: b.h, angle: 0, color: ["#bfb59e", "#b7c0ae", "#c8bea5", "#a7b6ae"][i % 4], real: false, heightSource: "estimated" as const, footprint, baseY, foundationDepth };
});
export const MARKET_EAST_SOLIDS: StreetBox[] = [];
export const MARKET_EAST_DECOR: StreetBox[] = [];
export const MARKET_EAST_CROWNS: { at: [number, number, number]; scale: [number, number, number] }[] = [];
const add = (p: P, y: number, size: StreetBox["size"], color: string, angle = 0, solid = false, absolute = false) => {
  const value: StreetBox = { at: [p.x, y + (absolute ? 0 : terrainTriangleHeight(p)) - terrainHeight(p), p.z], size, color, angle };
  (solid ? MARKET_EAST_SOLIDS : MARKET_EAST_DECOR).push(value);
};

for (const edge of layout.walls) {
  const a = point(edge[0]); const b = point(edge[1]); const p = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
  const low = Math.min(terrainTriangleHeight(a), terrainTriangleHeight(b), terrainTriangleHeight(p)) - 0.35;
  const high = Math.max(terrainTriangleHeight(a), terrainTriangleHeight(b), terrainTriangleHeight(p)) + 1.8;
  const angle = -Math.atan2(b.z - a.z, b.x - a.x); const length = Math.hypot(b.x - a.x, b.z - a.z) + 0.025;
  add(p, (low + high) / 2, [length, high - low, 0.32], "#a29e89", angle, true, true);
  add(p, high + 0.06, [length, 0.12, 0.43], "#737d6c", angle, false, true);
}

// Windows and drainage follow the exact same estimated building rings as
// rendering and collision. No floating rectangular facade across cut corners.
for (const b of MARKET_EAST_BUILDINGS) {
  for (let i = 0; i < b.footprint.length; i++) {
    const a = b.footprint[i]; const c = b.footprint[(i + 1) % b.footprint.length];
    const length = Math.hypot(c.x - a.x, c.z - a.z); if (length < 2) continue;
    const angle = -Math.atan2(c.z - a.z, c.x - a.x); const dx = (c.x - a.x) / length; const dz = (c.z - a.z) / length;
    const centre = { x: (a.x + c.x) / 2, z: (a.z + c.z) / 2 };
    for (const y of [3.3, b.h - 0.45]) add(centre, b.baseY + y, [length + 0.12, 0.22, 0.25], "#ddd2b7", angle, false, true);
    for (let n = 2.6; n < length - 1.6; n += 5.1) {
      const p = { x: a.x + dx * n, z: a.z + dz * n };
      for (let y = 5.4; y < b.h - 1.7; y += 3.2) {
        add(p, b.baseY + y, [2.3, 1.7, 0.18], "#526b68", angle, false, true);
        add(p, b.baseY + y - 0.88, [2.6, 0.1, 0.43], "#d2c8b3", angle, false, true);
        add({ x: p.x + dx * 1.7, z: p.z + dz * 1.7 }, b.baseY + y - 0.2, [0.75, 0.52, 0.48], "#c0c3b4", angle, false, true);
      }
    }
  }
}
for (const tree of layout.trees) {
  const p = point(tree.point);
  add(p, 0.16, [1.25, 0.32, 1.25], "#7d8b70", 0, true);
  add(p, 2.4, [0.24, 4.8, 0.24], "#786c51", 0, true);
  MARKET_EAST_CROWNS.push({ at: [p.x, terrainTriangleHeight(p) + 6.4, p.z], scale: [3.1, 2.5, 2.8] });
}
