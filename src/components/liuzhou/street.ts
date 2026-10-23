import type { Point } from "./world";
import { terrainHeight } from "./terrain";

export type StreetBox = {
  at: [number, number, number];
  size: [number, number, number];
  color: string;
  angle?: number;
};
// Fictional street furniture; these are gameplay dimensions, not survey data.
export const NOODLE_STALL = { x: -170, z: 117, angle: 0.9 };
export function stallPoint(x: number, z: number): Point {
  const { angle } = NOODLE_STALL;
  return { x: NOODLE_STALL.x + x * Math.cos(angle) + z * Math.sin(angle), z: NOODLE_STALL.z - x * Math.sin(angle) + z * Math.cos(angle) };
}
const stallBox = (at: StreetBox["at"], size: StreetBox["size"], color: string): StreetBox => {
  const p = stallPoint(at[0], at[2]);
  return { at: [p.x, at[1], p.z], size, color, angle: NOODLE_STALL.angle };
};
export const STALL_BOXES = [
  stallBox([0, 0.55, -3], [7, 1.1, 3], "#bb9b72"),
  stallBox([0, 1.15, -3], [7.3, 0.1, 3.2], "#c4c8b9"),
  stallBox([0, 3, -3], [8, 0.2, 5], "#648273"),
  ...[-3.7, 3.7].flatMap(x => [-5.1, -0.8].map(z => stallBox([x, 1.5, z], [0.12, 3, 0.12], "#485d52"))),
];
export const STALL_SIGN = stallBox([0, 3.5, -0.4], [7, 1.75, 0.08], "#e4d7af");
export const BENCH_BOXES: StreetBox[] = [];
for (const x of [-34, 34]) for (const z of [-43, -18, 7]) {
  const bx = x + (x < 0 ? 4 : -4);
  BENCH_BOXES.push(
    { at: [bx, 0.6, z + 5], size: [3, 0.18, 0.7], color: "#9b8966" },
    { at: [bx, 1.1, z + 5.3], size: [3, 0.6, 0.13], color: "#99866a" },
    { at: [bx, 0.25, z + 5], size: [2.7, 0.5, 0.35], color: "#617363" },
  );
}
export const STREET_SOLIDS = [...STALL_BOXES, STALL_SIGN, ...BENCH_BOXES];
export function streetBoxContains(p: Point & { y: number }, box: StreetBox, margin = 0) {
  const dx = p.x - box.at[0]; const dz = p.z - box.at[2]; const angle = box.angle || 0;
  return Math.abs(dx * Math.cos(angle) - dz * Math.sin(angle)) < box.size[0] / 2 + margin
    && Math.abs(dx * Math.sin(angle) + dz * Math.cos(angle)) < box.size[2] / 2 + margin
    && Math.abs(p.y - terrainHeight({ x: box.at[0], z: box.at[2] }) - box.at[1]) < box.size[1] / 2 + margin;
}
export const streetContains = (p: Point & { y: number }, margin = 0) => STREET_SOLIDS.some(b => streetBoxContains(p, b, margin));
export function restoreStreetPosition<T extends Point & { y: number }>(p: T, radius = 0.42): T {
  let result = { ...p };
  for (const box of STREET_SOLIDS) {
    if (!streetBoxContains({ ...result, y: result.y + 0.95 }, box, radius)) continue;
    const angle = box.angle || 0; const dx = result.x - box.at[0]; const dz = result.z - box.at[2];
    let x = dx * Math.cos(angle) - dz * Math.sin(angle);
    let z = dx * Math.sin(angle) + dz * Math.cos(angle);
    const ex = box.size[0] / 2 + radius + 0.15; const ez = box.size[2] / 2 + radius + 0.15;
    if (ex - Math.abs(x) < ez - Math.abs(z)) x = (x < 0 ? -1 : 1) * ex;
    else z = (z < 0 ? -1 : 1) * ez;
    result = { ...result, x: box.at[0] + x * Math.cos(angle) + z * Math.sin(angle), z: box.at[2] - x * Math.sin(angle) + z * Math.cos(angle) };
  }
  return result;
}
