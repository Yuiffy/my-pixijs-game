import layout from "./square-layout.json";
import source from "./city-map.json";
import { terrainHeight } from "./terrain";
import { terrainDrapedTriangles, terrainTriangleHeight } from "./terrainMesh";
import type { StreetBox } from "./street";

type P = { x: number; z: number };
// Source IDs identify actual footprints. Facades/heights without source tags
// are authored estimates; the 311 m tower height is retained from its OSM tag.
export const SQUARE_BUILDING_STYLES: Record<string, { h: number; color: string }> = {
  205515113: { h: 21.6, color: "#a9a6a1" },
  205658301: { h: 25.6, color: "#bfc9c5" },
  205657499: { h: 19.2, color: "#c6bfaa" },
  899710004: { h: 311, color: "#759197" },
  434067129: { h: 19.6, color: "#849b9b" },
  // These retain the previous default heights. Source names and footprints are
  // archived OSM; facade materials, openings and signs are an exterior study.
  205657493: { h: 26, color: "#b9b39d" },
  205657490: { h: 16.4, color: "#c7bba3" },
  205657494: { h: 10, color: "#a9a18b" },
  205657496: { h: 16.4, color: "#a5b5b6" },
  566345463: { h: 19.6, color: "#b7b4a7" },
};
export const SQUARE_FRONTAGE_IDS = new Set(["205657493", "205657490", "205657494", "205657496", "566345463"]);
export const SQUARE_SOURCE_ROOF_IDS = new Set(["899710007", "899710008"]);
export const SQUARE_ROOF_BUILDINGS = source.buildings.filter(b => SQUARE_SOURCE_ROOF_IDS.has(b.id)).map(b => {
  const footprint = b.points.slice(0, -1).map(([x, z]) => ({ x, z }));
  const xs = footprint.map(p => p.x); const zs = footprint.map(p => p.z);
  // OSM only identifies the plan as an open roof. Use the highest drawn ground
  // under that complete source plan + estimated 4.8m clearance, with no solid
  // foundation down to the street. The same slab feeds rendering and Rapier.
  const baseY = Math.max(...terrainDrapedTriangles(footprint).flatMap(face => face.map(terrainTriangleHeight))) + 4.8;
  return { id: `city-osm-${b.id}`, sourceId: b.id, sourceTags: b.tags, x: (Math.min(...xs) + Math.max(...xs)) / 2, z: (Math.min(...zs) + Math.max(...zs)) / 2, w: Math.max(...xs) - Math.min(...xs), d: Math.max(...zs) - Math.min(...zs), h: 0.28, baseY, foundationDepth: 0, angle: 0, color: "#75857e", real: true, footprint, heightSource: "estimated" as const };
});
export const SQUARE_FACADE_IDS = new Set([...Object.keys(SQUARE_BUILDING_STYLES).map(id => `city-osm-${id}`), ...SQUARE_ROOF_BUILDINGS.map(b => b.id)]);
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

export const SQUARE_ROOF_COLUMNS: { sourceId: string; p: P; bottom: number; top: number }[] = [];
for (const roof of SQUARE_ROOF_BUILDINGS) {
  // In each source ring edge 1→2 is the free outer edge. Estimated supports sit
  // 45cm inside that edge, leaving the middle of the covered walkway clear.
  const [a, b] = roof.footprint.slice(1, 3); const length = Math.hypot(b.x - a.x, b.z - a.z);
  const dx = (b.x - a.x) / length; const dz = (b.z - a.z) / length;
  const mx = (a.x + b.x) / 2; const mz = (a.z + b.z) / 2;
  const inward = Math.hypot(roof.x - mx, roof.z - mz);
  const point = (n: number) => ({ x: a.x + dx * n + ((roof.x - mx) / inward) * 0.45, z: a.z + dz * n + ((roof.z - mz) / inward) * 0.45 });
  for (let n = 3; n < length - 2; n += 12.5) {
    const p = point(n); const bottom = terrainTriangleHeight(p); const height = roof.baseY - bottom;
    SQUARE_ROOF_COLUMNS.push({ sourceId: roof.sourceId, p, bottom, top: roof.baseY });
    add(p, height / 2, [0.32, height, 0.32], "#b1b5aa");
    add(p, 0.09, [0.6, 0.18, 0.6], "#8b948b");
  }
  add(point(length / 2), roof.baseY - 0.13, [length - 0.8, 0.26, 0.34], "#aab2aa", -Math.atan2(dz, dx), true, true);
}

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
  if (SQUARE_FRONTAGE_IDS.has(id)) {
    // All bands follow actual source edges. Offset toward the exterior keeps
    // the facade on the physical shell even on the irregular Zhongjiao plan.
    const area = points.reduce((sum, a, i) => { const b = points[(i + 1) % points.length]; return sum + a[0] * b[1] - b[0] * a[1]; }, 0);
    let sign: { p: P; angle: number; length: number; score: number } | undefined;
    for (const [a, b] of edges) {
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]); if (length < 1) continue;
      const dx = (b[0] - a[0]) / length; const dz = (b[1] - a[1]) / length; const angle = -Math.atan2(dz, dx);
      const nx = dz * Math.sign(area); const nz = -dx * Math.sign(area);
      const at = (n: number, out = 0.17) => ({ x: a[0] + dx * n + nx * out, z: a[1] + dz * n + nz * out });
      const ink = id === "205657494" ? "#69594a" : id === "205657496" ? "#d3dad3" : "#e0d4b9";
      for (const y of [3.8, height - 0.45]) add(at(length / 2), base + y, [length, 0.32, 0.4], ink, angle, false, true);
      const bays = Math.max(1, Math.floor(length / 4.6)); const step = length / bays;
      for (let n = step / 2; n < length; n += step) {
        const p = at(n); const width = Math.min(3.4, step - 0.55);
        // The low, recessed-looking dark shop fronts remain closed solids.
        add(p, base + 1.8, [width, 2.65, 0.32], id === "205657494" ? "#4c5b51" : "#46646a", angle, false, true);
        add(at(n, 0.34), base + 3.25, [Math.min(step - 0.2, 4.5), 0.5, 0.55], id === "205657493" ? "#5f7163" : id === "205657490" ? "#657a75" : "#817864", angle, false, true);
        for (let y = 5.6; y < height - 1.5; y += 3.5) {
          add(p, base + y, [id === "205657496" ? width : width * 0.72, 2.1, 0.3], id === "205657493" ? "#516b6d" : "#5b777b", angle, false, true);
          add(at(n, 0.22), base + y - 1.13, [width + 0.2, 0.15, 0.45], ink, angle, false, true);
        }
        if (id === "205657496") add(at(n - step / 2 + 0.1, 0.22), base + height / 2, [0.24, height - 0.6, 0.4], "#d2dad6", angle, false, true);
      }
      // The frontage toward 解放北路 is on the east of these four buildings.
      // Keep the source name off the silhouette and use one legible sign only.
      const front = id === "566345463" ? nz : nx;
      const score = front > 0.5 ? length * front : -Infinity;
      if (!sign || score > sign.score) sign = { p: at(length / 2, 0.43), angle: angle + (area > 0 ? Math.PI : 0), length, score };
    }
    if (sign && Number.isFinite(sign.score)) SQUARE_LABELS.push({ text: building.name, at: [sign.p.x, base + Math.min(height - 1.2, 5.1), sign.p.z], width: Math.min(sign.length - 2, building.name.length * 2.35), height: 1.4, angle: sign.angle, color: id === "205657493" ? "#5b594d" : "#526d6b" });
    continue;
  }
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
        add(p, base + 12.5, [4.9, 14.5, 0.3], "#777874", angle, false, true);
        for (let row = 0; row < 5; row++) {
          const motif = { x: p.x + dx * (row % 2 ? 0.75 : -0.75), z: p.z + dz * (row % 2 ? 0.75 : -0.75) };
          add(motif, base + 6.7 + row * 2.5, [3.5, 0.38, 0.5], "#b8b7ae", angle, false, true);
        }
      } else {
        for (let y = 4; y < height - 2; y += 4.2) add(p, base + y, [4.6, 2.7, 0.2], "#526f70", angle, false, true);
        add(p, base + height / 2, [0.35, height - 1, 0.35], "#d6d4c3", angle, false, true);
      }
    }
    for (const y of id === "899710004" ? Array.from({ length: 73 }, (_, i) => 4.1 + i * 4.1) : [3.1, height - 0.8]) {
      add({ x: (a[0] + b[0]) / 2, z: (a[1] + b[1]) / 2 }, base + y, [length, 0.3, 0.32], id === "205515113" ? "#777874" : "#b6c4bd", angle, false, true);
    }
  }
  if (id === "434067129") continue;
  const name = id === "205515113" ? "柳 州 博 物 馆" : id === "205658301" ? "柳州文化艺术中心" : id === "205657499" ? "青少年与儿童活动中心" : "地王国际财富中心";
  const westFacing = id === "205515113";
  const p = westFacing ? { x: Math.min(...xs) - 0.2, z } : { x, z: Math.max(...zs) + 0.2 };
  SQUARE_LABELS.push({ text: name, at: [p.x, base + (id === "899710004" ? 24 : height - 3.3), p.z], width: westFacing ? 18 : id === "899710004" ? 32 : 35, height: 2.3, angle: westFacing ? -Math.PI / 2 : 0, color: id === "205515113" ? "#665442" : "#526f70" });
  if (id === "205515113") {
    // Simplified entrance columns, with estimated dimensions. The museum text
    // describes 21 relief panels, not measured 21-metre columns.
    for (let n = -2; n <= 2; n++) {
      const column = { x: p.x - 0.22, z: z + n * 4.6 };
      add(column, base + 5.5, [0.6, 11, 0.6], "#70716b", 0, false, true);
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
