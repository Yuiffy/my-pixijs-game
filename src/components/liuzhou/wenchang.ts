import layout from "./hedong-layout.json";
import { inMappedRiver, WATER_LEVEL } from "./terrain";
import { terrainTriangleHeight } from "./terrainMesh";

type P = { x: number; z: number };
type V = P & { y: number; crossfall: number };
export const WENCHANG_WIDTH = layout.bridge.widthEstimated;
export const WENCHANG_SIDEWALK_WIDTH = layout.bridge.sidewalkWidthEstimated;
export const WENCHANG_WALK_OFFSET = WENCHANG_WIDTH / 2 - WENCHANG_SIDEWALK_WIDTH / 2;
export const WENCHANG_THICKNESS = 2.2;
const [mainStart, mainEnd] = layout.bridge.mainChainageEstimated;
const original = layout.bridge.axisEstimated.map(([x, z]) => ({ x, z }));
const runs = [0];
for (let i = 1; i < original.length; i++) runs.push(runs[i - 1] + Math.hypot(original[i].x - original[i - 1].x, original[i].z - original[i - 1].z));
export const WENCHANG_LENGTH = runs[runs.length - 1];
function axisAt(along: number) {
  const found = runs.findIndex(n => n >= along);
  const i = found < 0 ? original.length - 1 : Math.max(1, found);
  const a = original[i - 1]; const b = original[i]; const d = runs[i] - runs[i - 1]; const t = Math.max(0, Math.min(1, (along - runs[i - 1]) / d));
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, nx: (b.z - a.z) / d, nz: -(b.x - a.x) / d };
}
function landing(along: number): V {
  const p = axisAt(along);
  const height = (offset: number) => terrainTriangleHeight({ x: p.x + p.nx * offset, z: p.z + p.nz * offset });
  const crossfall = (height(WENCHANG_WIDTH / 2) - height(-WENCHANG_WIDTH / 2)) / 2;
  let y = Infinity;
  for (let side = -1; side <= 1.0001; side += 0.025) y = Math.min(y, height((side * WENCHANG_WIDTH) / 2) - side * crossfall - 0.08);
  return { x: p.x, z: p.z, y, crossfall };
}
export const WENCHANG_LANDINGS = { west: landing(0), east: landing(WENCHANG_LENGTH) };
// The source only supplies layer=1, not a vertical survey. Solve an estimated
// profile against the actual terrain mesh, retaining 4.5m lower-road headroom
// including the full 2.2m box-girder slab. Never snap ground actors to the deck.
export const WENCHANG_HEIGHT = Math.max(18, ...layout.bridge.crossings.map(c => {
  const along = c.chainage; const p = axisAt(along);
  const fraction = Math.min(1, along / mainStart, (WENCHANG_LENGTH - along) / (WENCHANG_LENGTH - mainEnd));
  const root = along < mainStart ? WENCHANG_LANDINGS.west : WENCHANG_LANDINGS.east;
  let required = -Infinity;
  for (let offset = -WENCHANG_WIDTH / 2; offset <= WENCHANG_WIDTH / 2; offset += 0.5) {
    const q = { x: p.x + p.nx * offset, z: p.z + p.nz * offset };
    required = Math.max(required, (terrainTriangleHeight(q) + 4.6 + WENCHANG_THICKNESS - (1 - fraction) * (root.y + (root.crossfall * offset) / (WENCHANG_WIDTH / 2))) / fraction);
  }
  return required;
}));
export function wenchangPoint(along: number, across = 0): V {
  along = Math.max(0, Math.min(WENCHANG_LENGTH, along));
  const p = axisAt(along); const root = along < mainStart ? WENCHANG_LANDINGS.west : WENCHANG_LANDINGS.east;
  const t = Math.min(1, along / mainStart, (WENCHANG_LENGTH - along) / (WENCHANG_LENGTH - mainEnd));
  const crossfall = root.crossfall * (1 - t);
  return {
    x: p.x + p.nx * across,
    z: p.z + p.nz * across,
    y: root.y * (1 - t) + WENCHANG_HEIGHT * t + (crossfall * across) / (WENCHANG_WIDTH / 2),
    crossfall,
  };
}
const marks = Array.from(new Set([...runs, mainStart, mainEnd])).sort((a, b) => a - b);
export const WENCHANG_SECTIONS = marks.slice(1).map((along, i) => ({ id: "wenchang-deck", a: wenchangPoint(marks[i]), b: wenchangPoint(along), width: WENCHANG_WIDTH, thickness: WENCHANG_THICKNESS, main: marks[i] >= mainStart && along <= mainEnd }));
const distanceTo = (p: P, a: number[], b: number[]) => {
  const dx = b[0] - a[0]; const dz = b[1] - a[1]; const t = Math.max(0, Math.min(1, ((p.x - a[0]) * dx + (p.z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(p.x - a[0] - dx * t, p.z - a[1] - dz * t);
};
// Pier locations and sections are visual reconstruction estimates. Each is
// shared by render, Rapier, camera and flight collision, and avoids lower roads.
export const WENCHANG_SUPPORTS: { at: [number, number, number]; size: [number, number, number]; yaw: number }[] = [];
for (const along of [55, 115, mainStart, mainStart + 170, mainStart + 345, mainEnd, 970, 1030, 1090, 1150]) {
  const p = wenchangPoint(along); const next = wenchangPoint(along + 1);
  if (layout.bridge.crossings.some(c => c.source.points.slice(1).some((b, i) => distanceTo(p, c.source.points[i], b) < 16))) continue;
  const bottom = (inMappedRiver(p) ? Math.min(terrainTriangleHeight(p), WATER_LEVEL - 1.5) : terrainTriangleHeight(p)) - 0.6;
  const top = p.y - WENCHANG_THICKNESS;
  if (top - bottom < 1.2) continue;
  WENCHANG_SUPPORTS.push({ at: [p.x, (top + bottom) / 2, p.z], size: [18, top - bottom, 3.2], yaw: Math.atan2(next.x - p.x, next.z - p.z) });
}
