import layout from "./eshan-layout.json";
import { terrainHeight } from "./terrain";
import { terrainBaseTriangleHeight, terrainTriangleHeight } from "./terrainMesh";
import { eshanSurfaceHeight } from "./eshanSurface";

type P = { x: number; z: number };
type Box = { at: [number, number, number]; size: [number, number, number]; angle: number; color: string };
export const ESHAN_PATH_IDS = new Set(layout.paths.map(r => r.sourceId));
export const ESHAN_SHELTER_IDS = new Set(layout.shelters.map(s => s.id));
export const ESHAN_ENTRANCE = { x: -3020.151, z: 59.823 };
export const ESHAN_SOLIDS: Box[] = [];
export const ESHAN_DECOR: Box[] = [];
export const ESHAN_HIDDEN = new Set<Box>();
export const ESHAN_SIGNS: { p: P; y: number; angle: number; width: number; text: string }[] = [];
export const ESHAN_TREES: { x: number; y: number; z: number; radius: number; height: number; color: string }[] = [];
const add = (p: P, y: number, size: Box["size"], color: string, angle = 0, solid = true) => {
  const box = { at: [p.x, y - terrainHeight(p), p.z] as Box["at"], size, color, angle };
  (solid ? ESHAN_SOLIDS : ESHAN_DECOR).push(box);
};
const inRing = (p: P, ring: number[][]) => {
  let result = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]; const b = ring[j];
    if ((a[1] > p.z) !== (b[1] > p.z) && p.x < ((b[0] - a[0]) * (p.z - a[1])) / (b[1] - a[1]) + a[0]) result = !result;
  }
  return result;
};
const segmentDistance = (p: P, a: number[], b: number[]) => {
  const dx = b[0] - a[0]; const dz = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p.x - a[0]) * dx + (p.z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(p.x - a[0] - t * dx, p.z - a[1] - t * dz);
};
const pathSegments = [...layout.paths, { points: layout.roughPath.points, width: 3 }].flatMap(r => r.points.slice(1).map((b, i) => ({ a: r.points[i], b, width: r.width })));
const sign = (p: P, text: string, angle: number, width = 5) => {
  const y = terrainTriangleHeight(p); ESHAN_SIGNS.push({ p, text, angle, width, y: y + 2.45 });
  for (const side of [-1, 1]) add({ x: p.x + Math.cos(angle) * side * width * 0.4, z: p.z - Math.sin(angle) * side * width * 0.4 }, y + 1.35, [0.13, 2.7, 0.13], "#526b58", angle);
};

// Grounded stone name wall beside the mapped east approach; an estimated
// entrance treatment, not a claimed survey of the actual gate architecture.
const gate = { x: -3034, z: 67 }; const gateY = terrainBaseTriangleHeight(gate);
add(gate, gateY + 1.6, [1.2, 3.2, 13], "#b5b29b");
ESHAN_SIGNS.push({ p: { x: gate.x + 0.63, z: gate.z }, y: gateY + 1.9, text: "鹅 山 公 园", angle: Math.PI / 2, width: 11 });
for (const z of [77, 86, 95]) {
  const p = { x: -3034, z }; const y = terrainBaseTriangleHeight(p);
  add(p, y + 0.65, [1.1, 1.3, 2.5], "#a6ad92");
  ESHAN_TREES.push({ ...p, y, height: 6.5, radius: 3, color: "#577d56" });
}
sign({ x: -3098, z: 44 }, "← 环山步道 · 登山道", 0.9, 6);
sign({ x: -3301, z: 128 }, "登山道 ↑ · 环山步道 →", 0.2, 6);
sign({ x: -3277, z: -91 }, "山顶休憩处 →", -Math.PI / 2, 5);
sign({ x: -3464, z: 117 }, "环山步道 · 东侧入口 →", -Math.PI / 2, 6);

// Reconstruct low, open shelters at the two actual unclassified OSM building
// footprints. Roofs, columns, use and heights are estimated; retain source IDs.
export const ESHAN_SHELTERS = layout.shelters.map(source => {
  const points = source.points.slice(0, -1); const centre = { x: points.reduce((s, p) => s + p[0], 0) / points.length, z: points.reduce((s, p) => s + p[1], 0) / points.length };
  const a = points[0]; const b = points[1]; const c = points[2];
  const width = Math.hypot(b[0] - a[0], b[1] - a[1]); const depth = Math.hypot(c[0] - b[0], c[1] - b[1]); const angle = -Math.atan2(b[1] - a[1], b[0] - a[0]);
  const top = Math.max(...points.map(p => terrainTriangleHeight({ x: p[0], z: p[1] }))) + 4.8;
  for (const p of points) {
    const position = { x: p[0], z: p[1] }; const ground = terrainTriangleHeight(position);
    add(position, (top + ground) / 2, [0.32, top - ground, 0.32], "#835b42");
  }
  add(centre, top, [width + 1.8, 0.38, depth + 1.8], "#4e6e65", angle);
  for (let tier = 1; tier <= 5; tier++) add(centre, top + tier * 0.25, [width + 1.8 - tier * 0.75, 0.28, depth + 1.8 - tier * 0.75], tier % 2 ? "#6d8472" : "#627d6d", angle);
  return { sourceId: source.id, ...centre, roofY: top + 1.39 };
});

// Rest areas are beside the routes. Their exact positions and furniture are
// authored estimates, unlike the source path network and shelter footprints.
export const ESHAN_REST_POINTS = [{ x: -3069, z: 45 }, { x: -3286, z: 133 }, { x: -3348, z: 244 }];
for (const p of ESHAN_REST_POINTS) {
  const y = terrainBaseTriangleHeight(p);
  add(p, y + 0.58, [3.4, 0.18, 0.8], "#aa926a"); add({ ...p, z: p.z + 0.36 }, y + 1.02, [3.4, 0.72, 0.12], "#9b865f");
  for (const dx of [-1.25, 1.25]) add({ x: p.x + dx, z: p.z }, y + 0.27, [0.22, 0.54, 0.65], "#65745d");
}

// Retain forest on the entire mapped hill rather than only its western half.
// Avoid every source path and shelter, including the ungraded cliff route.
const hash = (x: number, z: number) => { const n = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return n - Math.floor(n); };
for (let z = -430; z < 330; z += 18) for (let x = -3510; x < -3060; x += 18) {
  const p = { x: x + hash(x, z) * 13, z: z + hash(z, x) * 13 };
  if (!inRing(p, layout.park.points) || pathSegments.some(s => segmentDistance(p, s.a, s.b) < s.width / 2 + 6.2) || layout.shelters.some(s => inRing(p, s.points) || s.points.some(q => Math.hypot(p.x - q[0], p.z - q[1]) < 9))) continue;
  const y = terrainBaseTriangleHeight(p); const h = 6.5 + hash(x + 2, z) * 6;
  if (Math.abs(terrainBaseTriangleHeight({ x: p.x + 2, z: p.z }) - y) > 5 || Math.abs(terrainBaseTriangleHeight({ x: p.x, z: p.z + 2 }) - y) > 5) continue;
  add(p, y + h * 0.45, [0.6, h * 0.9, 0.6], "#72705a");
  ESHAN_TREES.push({ ...p, y, height: h, radius: 4.8 + hash(z + 3, x) * 3.5, color: ["#4b7658", "#527c55", "#60845a", "#426f57"][Math.floor(hash(x + 5, z) * 4)] });
}

// Metal handrails follow the reconstructed climbing route; keep the whole
// junction clear where a transverse branch meets it.
export const ESHAN_RAILS: { a: [number, number, number]; b: [number, number, number] }[] = [];
const climb = layout.paths.find(r => r.sourceId === "1071650447")!;
for (let i = 1; i < climb.nodes.length; i += 3) {
  const a = layout.nodes[climb.nodes[i - 1]]; const b = layout.nodes[climb.nodes[Math.min(i + 2, climb.nodes.length - 1)]];
  const d = Math.hypot(b[0] - a[0], b[1] - a[1]); if (!d) continue;
  const nx = (b[1] - a[1]) / d; const nz = -(b[0] - a[0]) / d;
  for (const side of [-1, 1]) {
    const pa = { x: a[0] + nx * side * 1.8, z: a[1] + nz * side * 1.8 }; const pb = { x: b[0] + nx * side * 1.8, z: b[1] + nz * side * 1.8 };
    if (eshanSurfaceHeight(pa) !== undefined || eshanSurfaceHeight(pb) !== undefined) continue;
    const ay = terrainTriangleHeight({ x: a[0], z: a[1] }); const by = terrainTriangleHeight({ x: b[0], z: b[1] });
    add(pa, ay + 0.55, [0.1, 1.1, 0.1], "#596c5b");
    ESHAN_RAILS.push({ a: [pa.x, ay + 1.05, pa.z], b: [pb.x, by + 1.05, pb.z] });
    const count = Math.ceil(d / 0.4);
    for (let n = 0; n < count; n++) {
      const t = (n + 0.5) / count; const p = { x: pa.x + (pb.x - pa.x) * t, z: pa.z + (pb.z - pa.z) * t };
      add(p, ay + (by - ay) * t + 1.05, [0.1, Math.abs(by - ay) / count + 0.1, d / count + 0.015], "#596c5b", Math.atan2(pb.x - pa.x, pb.z - pa.z));
      ESHAN_HIDDEN.add(ESHAN_SOLIDS[ESHAN_SOLIDS.length - 1]);
    }
  }
}

export const ESHAN_RESIDENTS = [
  { id: "eshan-neighbour", name: "晨练的街坊", x: -3072, z: 57, line: "先沿环山路走走也好。登山慢慢来，累了就歇一歇。" },
  { id: "eshan-hiker", name: "登山的游人", x: -3250, z: -81, line: "从这儿看过去就是柳州站。沿着原路下山，转弯处别走太急。" },
];
export const ESHAN_APPEARANCES: Record<string, { outfit: string; trim: string; hair: string }> = {
  "eshan-neighbour": { outfit: "#92a88b", trim: "#65755d", hair: "#b8b1a0" },
  "eshan-hiker": { outfit: "#bd9272", trim: "#726e62", hair: "#4e463b" },
};
