import layout from "./wuxing-layout.json";
import { terrainHeight } from "./terrain";
import { terrainTriangleHeight } from "./terrainMesh";
import type { Building } from "./world";
import type { StreetBox } from "./street";

type P = { x: number; z: number };
export const WUXING_PATH_IDS = new Set(layout.sourceRoads.map(r => r.id));
export const WUXING_SOURCE_IDS = new Set(layout.buildings.map(b => b.id));
// Drawing the exterior union avoids coplanar source mall/annex walls.
// Original complete rings remain shared by physics, camera and save recovery.
export const WUXING_RENDER_OVERRIDES = Object.fromEntries(layout.renderParts.map(b => [`wuxing-osm-${b.id}`, b]));
const shells = [...layout.buildings.map(b => ({ ...b, runtimeId: `wuxing-osm-${b.id}`, real: true })), ...layout.infillBuildings.map(b => ({ ...b, runtimeId: b.id, real: false }))];
export const WUXING_FACADE_IDS = new Set(layout.facades.map(f => (f.buildingId.startsWith("wuxing-west-infill-") ? f.buildingId : `wuxing-osm-${f.buildingId}`)));
export const WUXING_BUILDINGS: Building[] = shells.map(b => {
  const footprint = b.points.slice(0, -1).map(([x, z]) => ({ x, z }));
  const xs = footprint.map(p => p.x); const zs = footprint.map(p => p.z);
  const x = (Math.min(...xs) + Math.max(...xs)) / 2; const z = (Math.min(...zs) + Math.max(...zs)) / 2;
  const baseY = terrainHeight({ x, z }); let foundationDepth = 3;
  footprint.forEach((a, i) => {
    const c = footprint[(i + 1) % footprint.length]; const count = Math.max(1, Math.ceil(Math.hypot(c.x - a.x, c.z - a.z)));
    for (let n = 0; n <= count; n++) foundationDepth = Math.max(foundationDepth, baseY - terrainTriangleHeight({ x: a.x + ((c.x - a.x) * n) / count, z: a.z + ((c.z - a.z) * n) / count }) + 0.6);
  });
  return { id: b.runtimeId, x, z, w: Math.max(...xs) - Math.min(...xs), d: Math.max(...zs) - Math.min(...zs), h: b.height, angle: 0, color: b.color, real: b.real, heightSource: "estimated", footprint, baseY, foundationDepth };
});
export const WUXING_SOLIDS: StreetBox[] = [];
export const WUXING_DECOR: StreetBox[] = [];
export const WUXING_CROWNS: { at: [number, number, number]; scale: [number, number, number] }[] = [];
export const WUXING_LABELS: { text: string; at: [number, number, number]; angle: number; width: number; height: number; color: string }[] = [];
export const WUXING_SCULPTURE = { x: layout.sculpture.point[0], z: layout.sculpture.point[1] };
const add = (p: P, y: number, size: StreetBox["size"], color: string, angle = 0, solid = false, absolute = false) => {
  const at: StreetBox["at"] = [p.x, y + (absolute ? 0 : terrainTriangleHeight(p)) - terrainHeight(p), p.z];
  (solid ? WUXING_SOLIDS : WUXING_DECOR).push({ at, size, color, angle });
};
const labels = ["衣裳", "茶饮", "鞋履", "小食", "百货", "时光照相"];
const signs = ["#7a5144", "#526c5f", "#665e54", "#a58356", "#4c696d"];
for (const b of shells) {
  const signSeed = Number(b.id.startsWith("wuxing-west-infill-") ? b.id.slice("wuxing-west-infill-".length) : b.id);
  const building = WUXING_BUILDINGS.find(v => v.id === b.runtimeId)!;
  const fronts = layout.facades.filter(f => f.buildingId === b.id);
  const main = fronts.reduce<(typeof fronts)[number] | undefined>((best, f) => (!best || Math.hypot(f.b[0] - f.a[0], f.b[1] - f.a[1]) > Math.hypot(best.b[0] - best.a[0], best.b[1] - best.a[1]) ? f : best), undefined);
  for (const front of fronts) {
    const [ax, az] = front.a; const [bx, bz] = front.b; const length = Math.hypot(bx - ax, bz - az);
    const dx = (bx - ax) / length; const dz = (bz - az) / length; const angle = Math.atan2(front.outward[0], front.outward[1]);
    const at = (n: number, projection = 0.08) => ({ x: ax + dx * n + front.outward[0] * projection, z: az + dz * n + front.outward[1] * projection });
    const count = Math.max(1, Math.floor(length / 6)); const width = length / count;
    for (let i = 0; front.detailOwnerId === b.id && i < count; i++) {
      const p = at(width * (i + 0.5)); const base = building.baseY!;
      const ink = signs[(i + signSeed) % signs.length];
      add(p, base + 1.65, [width - 0.3, 3.05, 0.14], b.id === "641119437" ? "#35595d" : "#526e6d", angle, false, true);
      add(p, base + 3.65, [width - 0.18, 0.85, 0.28], ink, angle, false, true);
      add(at(width * i + 0.1), base + 1.8, [0.19, 3.6, 0.28], "#d7cbb5", angle, false, true);
      if (length > 7 && b.id !== "1351248938") WUXING_LABELS.push({ text: b.id === "641119437" ? "书 · 生活" : labels[i % labels.length], at: [p.x + front.outward[0] * 0.16, base + 3.65, p.z + front.outward[1] * 0.16], width: Math.min(width - 0.5, 5.5), height: 0.65, angle, color: ink });
      if (b.id === "641119437") {
        // Vertical pale fins follow the source shell; the designer's photos
        // inform the motif, while their dimensions remain authored estimates.
        add(p, base + b.height / 2 + 1.5, [width - 0.55, b.height - 9, 0.18], "#476469", angle, false, true);
        for (let col = -1; col <= 1; col++) add(at(width * (i + 0.5) + (col * width) / 3, 0.2), base + b.height / 2 + 1.5, [0.48, b.height - 7, 0.45], "#dfcfb8", angle, false, true);
      } else {
        for (let y = 6; y < b.height - 1; y += 3.5) {
          add(p, base + y, [width - 0.65, 2.15, 0.16], (i + Math.floor(y)) % 4 ? "#6f8582" : "#ada98d", angle, false, true);
          add(p, base + y - 1.3, [width - 0.08, 0.3, 0.28], "#dbd0bc", angle, false, true);
        }
      }
    }
    if (front.detailOwnerId === b.id) add(at(length / 2), building.baseY! + b.height - 0.1, [length, 0.45, 0.35], "#b8ab95", angle, false, true);
    const name = ({ 641119425: "五星商厦", 641119437: "新华书店", 205654195: "东都大厦", 1044328353: "五象百货", 205654183: "华侨大厦", 205654194: "聚宝大厦", 205654205: "工贸大厦", 1275168866: "柳州宾馆", 1275168894: "风晴港购物中心" } as Record<string, string>)[b.id];
    if (front === main && name) {
      const p = at(length / 2, 0.28);
      WUXING_LABELS.push({ text: name, at: [p.x, building.baseY! + b.height - 2.7, p.z], width: Math.min(16, length - 0.6), height: 1.9, angle, color: b.id === "641119437" ? "#8a493e" : "#53665d" });
    }
  }
}
add(WUXING_SCULPTURE, 0.28, [1.8, 0.56, 1.8], "#9e9785", 0, true);
add(WUXING_SCULPTURE, 0.94, [0.4, 1.3, 0.4], "#a78b5b", 0, true);
// Conservative upper sculpture bound; pedestrian clearance is provided around
// the plinth. The five-point silhouette is an estimate, not an engineering mesh.
export const WUXING_SCULPTURE_BOUND: StreetBox = { at: [WUXING_SCULPTURE.x, 3 + terrainTriangleHeight(WUXING_SCULPTURE) - terrainHeight(WUXING_SCULPTURE), WUXING_SCULPTURE.z], size: [3.5, 3.5, 0.5], color: "#b4925f" };
WUXING_SOLIDS.push(WUXING_SCULPTURE_BOUND);
for (const item of layout.furniture) {
  const [x, z] = item.point; const p = { x, z }; const { angle } = item;
  if (item.kind === "tree") {
    add(p, 0.17, [1.35, 0.34, 1.35], "#8d8871", 0, true);
    add(p, 2.1, [0.22, 4.2, 0.22], "#776c54", 0, true);
    WUXING_CROWNS.push({ at: [x, terrainTriangleHeight(p) + 5, z], scale: [2.3, 2.1, 2.3] });
  } else if (item.kind === "bench") {
    add(p, 0.57, [2.2, 0.18, 0.65], "#987b56", angle, true);
    add(p, 0.25, [1.8, 0.5, 0.35], "#637361", angle, true);
    const back = { x: x + Math.sin(angle) * 0.3, z: z + Math.cos(angle) * 0.3 };
    add(back, 0.98, [2.2, 0.65, 0.12], "#9c805b", angle, true);
  } else {
    add(p, 2.8, [0.13, 5.6, 0.13], "#495e53", 0, true);
    add(p, 5.55, [0.95, 0.14, 0.65], "#dfcf9c", angle);
    add(p, 4.3, [0.38, 1.05, 0.13], "#9b6955", angle);
  }
}
export const WUXING_RESIDENTS = [
  { id: "wuxing-shopper", name: "逛街的街坊", x: -433, z: -105, line: "这条是解放南路步行街。往北拐进五星街，顺着弧形店面就能走到中山东路。" },
  { id: "wuxing-reader", name: "买书的游客", x: -422, z: -39, line: "新华书店在前面，中山中路往西还有地下街入口。可以从地面逛过去，再下到地下。" },
];
export const WUXING_APPEARANCES = Object.fromEntries(WUXING_RESIDENTS.map((n, i) => [n.id, { outfit: i ? "#8d798e" : "#ae916f", trim: "#53685c", hair: i ? "#3f3937" : "#6c5c46" }]));
