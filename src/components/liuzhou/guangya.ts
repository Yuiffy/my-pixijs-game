import layout from "./guangya-layout.json";
import { terrainTriangleHeight } from "./terrainMesh";
import skyline from "./skyline-map.json";
import { terrainHeight } from "./terrain";

type P = { x: number; z: number };
type V = P & { y: number; crossfall?: number };
export const GUANGYA_WIDTH = layout.estimatedWidth;
export const GUANGYA_SIDEWALK_WIDTH = layout.estimatedSidewalkWidth;
export const GUANGYA_WALK_OFFSET = GUANGYA_WIDTH / 2 - GUANGYA_SIDEWALK_WIDTH / 2;
// Keep the estimated 2.2m arch ribs wholly inside the walking strip's inner
// edge; the previous skyline-only placement ran through its centre.
export const GUANGYA_ARCH_OFFSET = GUANGYA_WIDTH / 2 - GUANGYA_SIDEWALK_WIDTH - 1.2;
export const GUANGYA_ROAD_IDS = new Set(layout.sections.flatMap(s => s.sourceIds));
const distance = (a: P, b: P) => Math.hypot(a.x - b.x, a.z - b.z);
const axes = layout.sections.map(s => ({ ...s, points: s.axis.map(([x, z]) => ({ x, z })) }));
const endpoint = (side: "west" | "east") => {
  const axis = axes.find(s => s.name === side)!.points;
  const p = side === "west" ? axis[0] : axis[axis.length - 1];
  const q = side === "west" ? axis[1] : axis[axis.length - 2];
  const sign = side === "west" ? 1 : -1; const d = distance(p, q);
  const nx = ((q.z - p.z) / d) * sign; const nz = (-(q.x - p.x) / d) * sign;
  const height = (offset: number) => terrainTriangleHeight({ x: p.x + nx * offset, z: p.z + nz * offset });
  const crossfall = (height(GUANGYA_WIDTH / 2) - height(-GUANGYA_WIDTH / 2)) / 2;
  // Bury the terminal few centimetres below every sampled terrain point. This
  // joins the unchanged ground without a transverse kerb or invented flat pad.
  let y = Infinity;
  for (let across = -1; across <= 1.0001; across += 0.05) y = Math.min(y, height((across * GUANGYA_WIDTH) / 2) - across * crossfall - 0.08);
  return { ...p, y, crossfall };
};
export const GUANGYA_LANDINGS = { west: endpoint("west"), east: endpoint("east") };
const westLength = axes[0].length;
export const GUANGYA_LENGTH = axes.reduce((n, s) => n + s.length, 0);
// Require an estimated 4.5m clear opening below the 0.9m slab over the five
// archived lower roads. Solve for the level main deck, including ramp grade.
// This is a terrain-based reconstruction, not engineering elevation evidence.
export const GUANGYA_HEIGHT = Math.max(16, ...layout.crossings.map(c => {
  const side = c.chainage < westLength ? "west" : "east";
  const root = GUANGYA_LANDINGS[side];
  const fraction = side === "west" ? c.chainage / westLength : (GUANGYA_LENGTH - c.chainage) / axes[2].length;
  let ground = -Infinity;
  for (let offset = -GUANGYA_WIDTH / 2; offset <= GUANGYA_WIDTH / 2; offset += 1) ground = Math.max(ground, terrainTriangleHeight({ x: c.at[0], z: c.at[1] + offset }));
  return (ground + 5.4 - root.y * (1 - fraction)) / fraction;
}));
export const GUANGYA_SECTIONS = axes.flatMap(axis => {
  let travelled = 0;
  const at = (p: P, along: number): V => {
    if (axis.name === "main") return { ...p, y: GUANGYA_HEIGHT };
    const root = GUANGYA_LANDINGS[axis.name as "west" | "east"];
    const t = axis.name === "west" ? along / axis.length : 1 - along / axis.length;
    return { ...p, y: root.y + (GUANGYA_HEIGHT - root.y) * t, crossfall: root.crossfall * (1 - t) };
  };
  return axis.points.slice(1).map((b, i) => {
    const a = axis.points[i]; const start = travelled; travelled += distance(a, b);
    return { id: `guangya-${axis.name}`, a: at(a, start), b: at(b, travelled), width: GUANGYA_WIDTH, main: axis.name === "main" };
  });
});
export const GUANGYA_MAIN = { a: axes[1].points[0], b: axes[1].points[axes[1].points.length - 1] };
/** Identify only pre-reconstruction deck saves. Versioned new saves and flight
 * saves bypass this migration; an actor on a lower road keeps its lower y. */
export function previousGuangyaDeck(p: P & { y: number }) {
  const old = skyline.bridges.find(b => b.name === "广雅大桥")!;
  const a = { x: old.a[0], z: old.a[1] }; const b = { x: old.b[0], z: old.b[1] };
  const length = distance(a, b); const dx = (b.x - a.x) / length; const dz = (b.z - a.z) / length;
  const along = (p.x - a.x) * dx + (p.z - a.z) * dz;
  if (along < -220 || along > length + 220 || Math.abs((p.x - a.x) * dz - (p.z - a.z) * dx) > old.width / 2 - 0.2) return false;
  const end = along < 0 ? a : b; const sign = along < 0 ? -1 : 1;
  const landing = { x: end.x + dx * sign * 220, z: end.z + dz * sign * 220 };
  const fraction = along < 0 ? -along / 220 : along > length ? (along - length) / 220 : 0;
  const level = 16 + (terrainHeight(landing) - 16) * fraction;
  return Math.abs(p.y - level) < 0.35 && level > terrainTriangleHeight(p) + 2.2;
}
/** Chainage west to east; across is positive toward the north railing. */
export function guangyaPoint(along: number, across = 0): V {
  let remaining = Math.max(0, Math.min(GUANGYA_LENGTH, along));
  for (let i = 0; i < GUANGYA_SECTIONS.length; i++) {
    const s = GUANGYA_SECTIONS[i]; const d = distance(s.a, s.b);
    if (remaining <= d || i === GUANGYA_SECTIONS.length - 1) {
      const t = Math.min(1, remaining / d); const crossfall = (s.a.crossfall || 0) * (1 - t) + (s.b.crossfall || 0) * t;
      return { x: s.a.x + (s.b.x - s.a.x) * t + ((s.b.z - s.a.z) / d) * across,
        z: s.a.z + (s.b.z - s.a.z) * t - ((s.b.x - s.a.x) / d) * across,
        y: s.a.y + (s.b.y - s.a.y) * t + (crossfall * across) / (s.width / 2) };
    }
    remaining -= d;
  }
  return { ...GUANGYA_LANDINGS.east };
}
const segmentDistance = (p: P, a: P, b: P) => {
  const dx = b.x - a.x; const dz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t);
};
export const GUANGYA_SUPPORTS: { at: [number, number, number]; size: [number, number, number]; yaw: number }[] = [];
for (let along = 60; along < GUANGYA_LENGTH - 25; along += 60) {
  if (along > westLength - 25 && along < westLength + axes[1].length + 15) continue;
  const p = guangyaPoint(along); const next = guangyaPoint(along + 1);
  if (layout.lowerRoads.some(r => {
    const { highway } = r.tags;
    const width = ["primary", "trunk"].includes(highway) ? 16 : highway === "secondary" ? 13 : highway === "tertiary" ? 10 : 6;
    return r.points.slice(1).some(([x, z], i) => segmentDistance(p, { x: r.points[i][0], z: r.points[i][1] }, { x, z }) < Math.hypot(6.8, 3.4) / 2 + width / 2 + 1.5);
  })) continue;
  const bottom = Math.min(...[-3.4, 0, 3.4].map(offset => terrainTriangleHeight(guangyaPoint(along, offset)))) - 0.5;
  const top = p.y - 0.9; if (top - bottom < 1.6) continue;
  GUANGYA_SUPPORTS.push({ at: [p.x, (bottom + top) / 2, p.z], size: [6.8, top - bottom, 3.4], yaw: Math.atan2(next.x - p.x, next.z - p.z) });
}
// These estimated ground strips are clipped against every nearby mapped
// carriageway before terrain draping; they must not paint over the slip roads.
export const GUANGYA_GROUND_PAVING = layout.groundWalkPaving.map(face => face.map(([x, z]) => ({ x, z })));
