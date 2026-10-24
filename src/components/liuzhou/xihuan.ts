import layout from "./xihuan-layout.json";
import { terrainHeight } from "./terrain";
import { terrainTriangleHeight } from "./terrainMesh";
import type { StreetBox } from "./street";

type P = { x: number; z: number };
export const XIHUAN_SOLIDS: StreetBox[] = [];
export const XIHUAN_DECOR: StreetBox[] = [];
export const XIHUAN_CROWNS: { at: [number, number, number]; scale: [number, number, number] }[] = [];
export const XIHUAN_LABELS: { text: string; at: [number, number, number]; angle: number; width: number; height: number; color: string }[] = [];
export const XIHUAN_ROAD_WIDTHS: Record<string, number> = layout.roadWidths;
export const inXihuanDetail = (p: P) => p.x > layout.bounds[0] && p.x < layout.bounds[2] && p.z > layout.bounds[1] && p.z < layout.bounds[3];
const add = (p: P, y: number, size: StreetBox["size"], color: string, angle = 0, solid = true) => {
  (solid ? XIHUAN_SOLIDS : XIHUAN_DECOR).push({ at: [p.x, terrainTriangleHeight(p) - terrainHeight(p) + y, p.z], size, color, angle });
};
const label = (p: P, text: string, y: number, width: number, height: number, angle = 0, color = "#44685d") => {
  XIHUAN_LABELS.push({ text, at: [p.x, terrainTriangleHeight(p) + y, p.z], width, height, angle, color });
};

for (const fence of layout.fences) {
  const [ax, az] = fence.a; const [bx, bz] = fence.b;
  const p = { x: (ax + bx) / 2, z: (az + bz) / 2 };
  const low = Math.min(terrainTriangleHeight({ x: ax, z: az }), terrainTriangleHeight({ x: bx, z: bz }), terrainTriangleHeight(p));
  const high = Math.max(terrainTriangleHeight({ x: ax, z: az }), terrainTriangleHeight({ x: bx, z: bz }), terrainTriangleHeight(p));
  const length = Math.hypot(bx - ax, bz - az); const angle = -Math.atan2(bz - az, bx - ax);
  // Embed the base and span both endpoint elevations. No floating wall panels.
  add(p, (high + fence.height + low - 0.4) / 2 - terrainTriangleHeight(p), [length + 0.08, high + fence.height - low + 0.4, 0.22], "#9eaa96", angle);
  add(p, high + fence.height - terrainTriangleHeight(p), [length + 0.13, 0.16, 0.36], "#667563", angle, false);
}
layout.trees.forEach((tree, i) => {
  const p = { x: tree[0], z: tree[1] };
  add(p, 0.16, [1.1, 0.32, 1.1], "#6c7967");
  add(p, 2.5, [0.3, 5, 0.3], "#7f7358");
  XIHUAN_CROWNS.push({ at: [p.x, terrainTriangleHeight(p) + 5.8, p.z], scale: [2.4 + (i % 2) * 0.4, 2.7, 2.4] });
});
for (const signal of layout.signals) {
  const p = { x: signal.pole[0], z: signal.pole[1] };
  const angle = Math.atan2(signal.tangent[0], signal.tangent[1]);
  add(p, 2.5, [0.16, 5, 0.16], "#596b61");
  add(p, 4.6, [0.52, 1.55, 0.28], "#283f38", angle, false);
  for (let row = 0; row < 3; row++) add({ x: p.x + Math.sin(angle) * 0.16, z: p.z + Math.cos(angle) * 0.16 }, 5.1 - row * 0.49, [0.3, 0.3, 0.08], ["#d78e72", "#736f49", "#56816a"][row], angle, false);
}

const { shelter } = layout.busStop;
export const XIHUAN_BUS = { x: shelter[0], z: shelter[1] };
const busAngle = -Math.atan2(-701.795 + 804.098, -3259.46 + 3416.487);
const atBus = (x: number, z: number) => ({ x: XIHUAN_BUS.x + Math.cos(busAngle) * x + Math.sin(busAngle) * z, z: XIHUAN_BUS.z - Math.sin(busAngle) * x + Math.cos(busAngle) * z });
for (const x of [-3.4, 3.4]) add(atBus(x, -0.7), 1.5, [0.14, 3, 0.14], "#586e63", busAngle);
add(atBus(0, -0.75), 2.82, [7.4, 0.22, 2.5], "#5f7d71", busAngle);
add(atBus(0, -1.15), 1.46, [6.7, 2.5, 0.13], "#91a89a", busAngle);
add(atBus(0, -0.7), 0.58, [3.8, 0.15, 0.6], "#987d58", busAngle);
add(atBus(0, -0.7), 0.27, [3.2, 0.54, 0.4], "#697563", busAngle);
label(atBus(0, -1.03), "西环路 · 公交候车", 2.2, 5.9, 0.53, busAngle);

// Source-labelled school and residential parcels; exact gate positions and
// sign dimensions were not supplied, so these are authored roadside signs.
for (const sign of layout.signs.filter(s => s.kind === "parcel")) {
  add(sign, 1.3, [3.6, 1.5, 0.22], "#8b9884", sign.angle);
  for (const side of [-1, 1]) add({ x: sign.x + side * 1.3 * Math.cos(sign.angle), z: sign.z - side * 1.3 * Math.sin(sign.angle) }, 0.35, [0.14, 0.7, 0.14], "#657560");
  label(sign, sign.text, 1.34, 3.35, 0.58, sign.angle);
}
for (const sign of layout.signs.filter(s => s.kind === "road")) {
  add(sign, 1.65, [0.12, 3.3, 0.12], "#586e63");
  label(sign, sign.text, 2.75, 2.8, 0.7, sign.angle);
}

export const XIHUAN_RESIDENTS = [
  { id: "xihuan-passenger", name: "候车的街坊", ...atBus(1.3, 0.8), line: "这是西环路和鹅山路一带，旁边几条路在这里接上。沿人行道走，前面有斑马线。" },
  { id: "xihuan-neighbour", name: "鹅山街坊", x: layout.neighbour[0], z: layout.neighbour[1], line: "这边是鹅山九区，沿鹅山路往东南走可以到鹅山公园。老街坊平时就在附近散步。" },
];
export const XIHUAN_APPEARANCES = Object.fromEntries(XIHUAN_RESIDENTS.map((n, i) => [n.id, { outfit: i ? "#a48f70" : "#6e8d96", trim: "#58685b", hair: i ? "#b9b5a5" : "#3f453d" }]));
