import layout from "./square-layout.json";
import source from "./city-map.json";
import { terrainHeight } from "./terrain";
import { terrainTriangleHeight } from "./terrainMesh";
import type { StreetBox } from "./street";

type P = { x: number; z: number };
// Source IDs identify actual footprints. Facades/heights without source tags
// are authored estimates; the 311 m tower height is retained from its OSM tag.
export const SQUARE_BUILDING_STYLES: Record<string, { h: number; color: string }> = {
  205515113: { h: 21.6, color: "#9d9784" },
  205658301: { h: 25.6, color: "#bfc9c5" },
  205657499: { h: 19.2, color: "#c6bfaa" },
  899710004: { h: 311, color: "#759197" },
  434067129: { h: 19.6, color: "#849b9b" },
};
export const SQUARE_FACADE_IDS = new Set(Object.keys(SQUARE_BUILDING_STYLES).map(id => `city-osm-${id}`));
export const SQUARE_RENDER_OVERRIDES: Record<string, { parts: { points: number[][]; holes: number[][][] }[]; facadeEdges: number[][][] }> = layout.buildingRenderOverrides;
export const SQUARE_SOLIDS: StreetBox[] = [];
export const SQUARE_DECOR: StreetBox[] = [];
export const SQUARE_CROWNS: { at: [number, number, number]; scale: [number, number, number] }[] = [];
export const SQUARE_LABELS: { text: string; at: [number, number, number]; angle: number; width: number; height: number; color: string; flat?: boolean }[] = [];
const add = (p: P, y: number, size: StreetBox["size"], color: string, angle = 0, solid = true, absolute = false) => {
  const at: StreetBox["at"] = [p.x, y + (absolute ? 0 : terrainTriangleHeight(p)) - terrainHeight(p), p.z];
  (solid ? SQUARE_SOLIDS : SQUARE_DECOR).push({ at, size, color, angle });
};
const label = (p: P, text: string, y: number, width: number, height: number, angle = 0, color = "#53695e", flat = false) => {
  SQUARE_LABELS.push({ text, at: [p.x, terrainTriangleHeight(p) + y, p.z], width, height, angle, color, flat });
};

for (const [x, z] of layout.benches) {
  const p = { x, z }; const angle = Math.PI / 2;
  add(p, 0.58, [2.2, 0.16, 0.7], "#947451", angle);
  for (const dz of [-0.8, 0.8]) add({ x, z: z + dz }, 0.27, [0.55, 0.54, 0.45], "#667263");
  add({ x: x + (x < -600 ? -0.37 : 0.37), z }, 0.98, [2.2, 0.65, 0.14], "#a1855c", angle);
}
for (const [x, z] of layout.trees) {
  const p = { x, z }; const y = terrainTriangleHeight(p);
  add(p, 0.12, [2.5, 0.24, 2.5], "#727861");
  add(p, 2.5, [0.28, 5, 0.28], "#776b4f");
  SQUARE_CROWNS.push({ at: [x, y + 6.3, z], scale: [3.4, 2.8, 3.4] });
}
for (const x of [-658, -499]) for (const z of [-830, -750, -670, -590]) {
  add({ x, z }, 3.8, [0.14, 7.6, 0.14], "#58675d");
  add({ x, z }, 7.64, [1.45, 0.12, 0.65], "#b4b6a1", 0, false);
  add({ x, z: z + 2 }, 0.5, [0.65, 1, 0.65], "#617868");
}

// Documented central low bronze surname installation, simplified to 81 panels.
// Exact position, names/order and dimensions are estimates, not a facsimile.
export const SURNAME_CENTRE = { x: layout.surnameCentre[0], z: layout.surnameCentre[1] };
const surnames = Array.from("赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜戚谢邹喻柏水窦章云苏潘葛奚范彭郎鲁韦昌马苗凤花方俞任袁柳酆鲍史唐费廉岑薛雷贺倪汤滕殷罗毕郝邬安常乐");
for (let row = 0; row < 9; row++) for (let col = 0; col < 9; col++) {
  const p = { x: SURNAME_CENTRE.x + (col - 4) * 0.46, z: SURNAME_CENTRE.z + (row - 4) * 0.46 };
  add(p, 0.115, [0.43, 0.23, 0.43], "#ab8e50");
  label(p, surnames[row * 9 + col], 0.237, 0.32, 0.32, 0, "#a78c55", true);
}
for (const x of [-611, -544]) {
  const p = { x, z: -566 };
  add(p, 1.15, [0.11, 2.3, 0.11], "#596f61");
  add(p, 2.05, [5.7, 1.6, 0.12], "#53695e", 0, false);
  label({ x, z: -565.92 }, "人民广场", 2.44, 4.9, 0.55);
  label({ x, z: -565.91 }, "文化艺术中心 · 博物馆", 1.8, 5.2, 0.36);
}

// Use the source building's same foundation as its collision volume. The
// details stay on the solid shell and do not claim an explorable interior.
for (const id of Object.keys(SQUARE_BUILDING_STYLES)) {
  const building = source.buildings.find(b => b.id === id)!;
  const points = building.points.slice(0, -1);
  const xs = points.map(p => p[0]); const zs = points.map(p => p[1]);
  const x = (Math.min(...xs) + Math.max(...xs)) / 2; const z = (Math.min(...zs) + Math.max(...zs)) / 2;
  const base = terrainHeight({ x, z }); const height = SQUARE_BUILDING_STYLES[id].h;
  const edges = SQUARE_RENDER_OVERRIDES[`city-osm-${id}`]?.facadeEdges ?? points.map((a, i) => [a, points[(i + 1) % points.length]]);
  for (const [a, b] of edges) {
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]); const angle = -Math.atan2(b[1] - a[1], b[0] - a[0]);
    const dx = (b[0] - a[0]) / length; const dz = (b[1] - a[1]) / length;
    for (let n = 1.6; n < length - 1; n += id === "899710004" ? 5.4 : 5.2) {
      const p = { x: a[0] + dx * n, z: a[1] + dz * n };
      if (id === "434067129") {
        add(p, base + height / 2, [0.18, height - 1, 0.22], "#b3c6c4", angle, false, true);
      } else if (id === "899710004") {
        add(p, base + height / 2, [0.22, height, 0.3], "#b3c6c4", angle, false, true);
      } else if (id === "205515113") {
        add(p, base + 12.5, [4.9, 14.5, 0.3], "#756344", angle, false, true);
        for (let row = 0; row < 5; row++) {
          const motif = { x: p.x + dx * (row % 2 ? 0.75 : -0.75), z: p.z + dz * (row % 2 ? 0.75 : -0.75) };
          add(motif, base + 6.7 + row * 2.5, [3.5, 0.38, 0.5], "#99824d", angle, false, true);
        }
      } else {
        for (let y = 4; y < height - 2; y += 4.2) add(p, base + y, [4.6, 2.7, 0.2], "#526f70", angle, false, true);
        add(p, base + height / 2, [0.35, height - 1, 0.35], "#d6d4c3", angle, false, true);
      }
    }
    for (const y of id === "899710004" ? Array.from({ length: 73 }, (_, i) => 4.1 + i * 4.1) : [3.1, height - 0.8]) {
      add({ x: (a[0] + b[0]) / 2, z: (a[1] + b[1]) / 2 }, base + y, [length, 0.3, 0.32], id === "205515113" ? "#5b5044" : "#b6c4bd", angle, false, true);
    }
  }
  if (id === "434067129") continue;
  const name = id === "205515113" ? "柳 州 博 物 馆" : id === "205658301" ? "柳州文化艺术中心" : id === "205657499" ? "青少年与儿童活动中心" : "地王国际财富中心";
  const westFacing = id === "205515113";
  const p = westFacing ? { x: Math.min(...xs) - 0.2, z } : { x, z: Math.max(...zs) + 0.2 };
  SQUARE_LABELS.push({ text: name, at: [p.x, base + (id === "899710004" ? 24 : height - 3.3), p.z], width: westFacing ? 18 : id === "899710004" ? 32 : 35, height: 2.3, angle: westFacing ? -Math.PI / 2 : 0, color: id === "205515113" ? "#665442" : "#526f70" });
  if (id === "205515113") {
    // The official museum introduction describes 21-metre bronze-like pillars;
    // these are a simplified exterior motif, not copied relief artwork.
    for (let n = -2; n <= 2; n++) {
      const column = { x: p.x - 0.22, z: z + n * 4.6 };
      add(column, base + 10.5, [0.6, 21, 0.6], "#69593f", 0, false, true);
    }
  }
}

export const SQUARE_WALKS: Record<string, P[]> = Object.fromEntries(Object.entries(layout.walks).map(([id, points]) => [id, points.map(([x, z]) => ({ x, z }))]));
export const SQUARE_RESIDENTS = [
  { id: "square-neighbour", name: "广场街坊", x: -579, z: -691, line: "这片广场常有人散步。中央的百家姓地雕，低头看看就能找到不少熟悉的姓。" },
  { id: "square-visitor", name: "看展的游客", x: -478, z: -764, line: "旁边就是柳州博物馆，广场另一侧是文化艺术中心。今天先在外面走一圈。" },
  ...Object.entries(SQUARE_WALKS).map(([id, points]) => ({ id, name: "散步的居民", ...points[0], line: "沿树荫走走，累了就在旁边坐一会儿。" })),
];
export const SQUARE_APPEARANCES = Object.fromEntries(SQUARE_RESIDENTS.map((n, i) => [n.id, { outfit: ["#9d8271", "#6f9394", "#b0a16f", "#839477"][i], trim: "#546257", hair: i % 2 ? "#3b403c" : "#a7a28d" }]));
