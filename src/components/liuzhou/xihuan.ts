import layout from "./xihuan-layout.json";
import { terrainHeight } from "./terrain";
import { terrainTriangleHeight } from "./terrainMesh";
import type { StreetBox } from "./street";

type P = { x: number; z: number };
export const XIHUAN_SOLIDS: StreetBox[] = [];
export const XIHUAN_DECOR: StreetBox[] = [];
export const XIHUAN_CROWNS: { at: [number, number, number]; scale: [number, number, number] }[] = [];
export const XIHUAN_LABELS: { text: string; at: [number, number, number]; angle: number; width: number; height: number; color: string }[] = [];
export const XIHUAN_FACADE_IDS = new Set(layout.frontages.map(b => `city-osm-${b.id}`));
export const XIHUAN_FACADES: { id: string; baseY: number; height: number; windows: number }[] = [];
export const XIHUAN_HOOPS: [number, number, number][] = [];
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
layout.yardTrees.forEach((tree, i) => {
  const p = { x: tree.point[0], z: tree.point[1] };
  add(p, 1.8, [0.21, 3.6, 0.21], "#7c725b");
  XIHUAN_CROWNS.push({ at: [p.x, terrainTriangleHeight(p) + 4.6, p.z], scale: [2.2, 2.3 + (i % 3) * 0.3, 2.2] });
});

// Source footprints and runtime shell heights are unchanged. The exterior is
// authored: no source image or measured facade/window/balcony data is available.
for (const building of layout.frontages) {
  const points = building.points.slice(0, -1);
  const center = { x: (Math.min(...points.map(p => p[0])) + Math.max(...points.map(p => p[0]))) / 2, z: (Math.min(...points.map(p => p[1])) + Math.max(...points.map(p => p[1]))) / 2 };
  const baseY = terrainHeight(center);
  const signedArea = points.reduce((n, p, i) => n + p[0] * points[(i + 1) % points.length][1] - points[(i + 1) % points.length][0] * p[1], 0);
  const school = building.kind === "school";
  const industrial = building.kind === "industrial";
  const floors = Math.max(2, Math.floor(building.height / 3.2));
  let windows = 0;
  const put = (p: P, y: number, size: StreetBox["size"], color: string, angle: number) => XIHUAN_DECOR.push({ at: [p.x, baseY + y - terrainHeight(p), p.z], size, color, angle });
  points.forEach(([ax, az], edge) => {
    const [bx, bz] = points[(edge + 1) % points.length];
    const length = Math.hypot(bx - ax, bz - az);
    if (length < 2) return;
    const dx = (bx - ax) / length; const dz = (bz - az) / length;
    const outward = signedArea > 0 ? 1 : -1;
    const normal = { x: dz * outward, z: -dx * outward };
    const angle = -Math.atan2(dz, dx);
    const at = (along: number, depth = 0.12) => ({ x: ax + dx * along + normal.x * depth, z: az + dz * along + normal.z * depth });
    const plaster = industrial ? "#aeb9b2" : school ? "#d6d2b6" : ["#c6bda4", "#c4c4b2", "#bbc3b3"][Number(building.id) % 3];
    put(at(length / 2, 0.02), building.height / 2, [length, building.height, 0.1], plaster, angle);
    put(at(length / 2), 0.45, [length + 0.12, 0.9, 0.16], school ? "#929e8a" : "#879889", angle);
    put(at(length / 2, 0.17), building.height - 0.16, [length + 0.24, 0.32, 0.28], "#76877c", angle);
    if (industrial) {
      const bays = Math.max(1, Math.floor(length / 6)); const span = length / bays;
      for (let bay = 0; bay < bays; bay++) {
        const along = (bay + 0.5) * span; const width = Math.min(4.6, span - 0.7);
        put(at(bay * span, 0.15), building.height / 2, [0.18, building.height - 0.6, 0.19], "#8a9c92", angle);
        put(at(along, 0.13), building.height - 3.1, [width + 0.16, 2.1, 0.14], "#d0d5c5", angle);
        put(at(along, 0.22), building.height - 3.1, [width, 1.89, 0.06], "#4b6968", angle);
        put(at(along, 0.26), building.height - 3.1, [0.09, 1.95, 0.05], "#c0cbbd", angle);
        windows++;
        if (length < 30 || bay % 3 !== 1) continue;
        put(at(along, 0.18), 2.1, [3.6, 4.2, 0.17], "#718e80", angle);
        for (let stripe = 1; stripe < 9; stripe++) put(at(along, 0.28), stripe * 0.43, [3.5, 0.06, 0.04], "#879f90", angle);
        put(at(along, 0.6), 4.32, [4, 0.14, 1.1], "#607a6c", angle);
      }
      return;
    }
    const bays = Math.max(1, Math.floor((length - 1) / (school ? 3.8 : 4.8)));
    const spacing = length / bays;
    for (let floor = 0; floor < floors; floor++) {
      const y = (floor + 0.55) * (building.height / floors);
      if (floor) put(at(length / 2, 0.09), (floor * building.height) / floors, [length, 0.14, 0.19], school ? "#a8b49d" : "#a1ad9c", angle);
      for (let bay = 0; bay < bays; bay++) {
        const along = (bay + 0.5) * spacing;
        const width = Math.min(school ? 2.65 : 1.8, spacing - 0.65);
        put(at(along, 0.115), y, [width + 0.21, 1.85, 0.14], "#e0dec6", angle);
        put(at(along, 0.2), y + 0.015, [width, 1.61, 0.055], (floor + bay + edge) % 7 === 0 ? "#9caa9c" : "#536e6c", angle);
        put(at(along, 0.24), y, [0.065, 1.67, 0.05], "#bac7b7", angle);
        windows++;
        if (school || length < 20 || bay % 3 !== 1 || !floor) continue;
        // Shallow balcony furniture stays decorative; the source shell owns collision.
        put(at(along, 0.61), y - 1.06, [width + 0.5, 0.15, 1.1], "#a6b19e", angle);
        put(at(along, 1.12), y - 0.55, [width + 0.45, 0.91, 0.11], "#718b7c", angle);
        for (const side of [-1, 1]) put(at(along + (side * (width + 0.38)) / 2, 0.63), y - 0.55, [0.1, 0.91, 1.03], "#849988", angle);
      }
    }
  });
  XIHUAN_FACADES.push({ id: `city-osm-${building.id}`, baseY, height: building.height, windows });
}

for (const court of layout.sports) {
  const [x, z] = court.center;
  if (court.name === "estimated-court") {
    for (const side of [-1, 1]) {
      const p = { x: x + side * (court.along / 2 - 1.1), z };
      add(p, 1.85, [0.16, 3.7, 0.16], "#677e70");
      add(p, 3.8, [0.15, 1.2, 1.8], "#d4d8c3", 0, false);
      const rim = { x: p.x - side * 0.65, z };
      add({ x: (p.x + rim.x) / 2, z }, 3.05, [0.75, 0.1, 0.1], "#ad7756", 0, false);
      XIHUAN_HOOPS.push([rim.x, terrainTriangleHeight(p) + 3.05, z]);
    }
  } else {
    for (const side of [-1, 1]) {
      const gx = x + side * (court.along / 2 - 1.1);
      for (const gz of [-2.2, 2.2]) add({ x: gx, z: z + gz }, 1.2, [0.12, 2.4, 0.12], "#d7d8c2");
      add({ x: gx, z }, 2.4, [0.12, 0.12, 4.5], "#d7d8c2", 0, false);
    }
  }
}
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
