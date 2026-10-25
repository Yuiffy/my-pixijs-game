import source from "./city-map.json";
import { inCity, inCore } from "./exploration";
import { inMappedRiver, terrainHeight } from "./terrain";
import { MARKET_BUILDINGS, MARKET_SOURCE_ID, marketReserved } from "./market";
import { STATION_BUILDINGS } from "./station";
import { STATION_NEIGHBORHOOD_BUILDINGS, stationNeighborhoodReserved } from "./stationNeighborhoods";
import { ESHAN_ENTRANCE, ESHAN_SHELTER_IDS } from "./eshan";
import { SQUARE_BUILDING_STYLES, SQUARE_ROOF_BUILDINGS, SQUARE_SOURCE_ROOF_IDS } from "./square";
import { terrainTriangleHeight } from "./terrainMesh";
import xihuanLayout from "./xihuan-layout.json";
import { WUXING_SOURCE_IDS } from "./wuxing";
import { CENTRAL_BUILDINGS, CENTRAL_SOURCE_IDS, centralReserved } from "./central";
import { riversideReserved } from "./riverside";

const xihuanWidths: Record<string, number> = xihuanLayout.roadWidths;

type P = { x: number; z: number };
export type CityBuilding = P & { id: string; w: number; d: number; h: number; angle: number; color: string; real: boolean; footprint?: P[]; heightSource?: "estimated"; baseY?: number; foundationDepth?: number };
export const CITY_ROADS = source.roads.filter(r => r.tags.railway !== "platform").map(r => ({
  id: `city-road-${r.id}`,
sourceId: r.id,
name: r.id === MARKET_SOURCE_ID ? "跃进路东一巷" : r.name || "街巷",
bridge: r.tags.bridge === "yes",
  foot: ["pedestrian", "footway", "path", "cycleway"].includes(r.tags.highway),
  width: xihuanWidths[r.id] ?? (["primary", "trunk"].includes(r.tags.highway) ? 16 : r.tags.highway === "secondary" ? 13 : r.tags.highway === "tertiary" ? 10 : ["pedestrian", "footway", "path"].includes(r.tags.highway) ? 4 : 6),
  points: r.points.map(p => ({ x: p[0], z: p[1] })),
}));
export const CITY_ROAD_SEGMENTS = CITY_ROADS.flatMap(road => road.points.slice(1).map((b, i) => ({ a: road.points[i], b, road })));
export function polygonContains(p: P, ring: number[][]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]; const b = ring[j];
    if ((a[1] > p.z) !== (b[1] > p.z) && p.x < ((b[0] - a[0]) * (p.z - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
export function segmentDistance(p: P, a: P, b: P) {
  const dx = b.x - a.x; const dz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t);
}
export const CITY_PARKS = source.areas.filter(a => a.tags.leisure === "park" || a.tags.leisure === "garden");
const protectedAreas = source.areas.filter(a => a.tags.leisure === "park" || a.name.includes("五星步行街") || a.tags.landuse === "railway");
export const CITY_DISTRICTS = [
  { id: "wuxing", name: "五星街", x: -433, z: -105, detail: "沿解放南路、弧形五星街、中山中路和西侧商业街景游览商厦与书店外观；来源楼体与道路来自 OSM，六处补充商铺、楼高、立面、铺装与设施为估算重建。" },
  { id: "underground", name: "龙城地下街", x: -594, z: -99, detail: "沿 OSM 主通道、横向分支及 16 处楼梯入口制作，可步行进入地下层；宽度、深度与店铺为估算重建。" },
  { id: "people-square", name: "人民广场", x: -576, z: -730, detail: "可步行经过百家姓地雕、树荫座椅，眺望博物馆、文化艺术中心与地王大厦；周边道路和建筑轮廓来自 OSM，铺装、地雕位置、绿化和立面为估算重建。" },
  { id: "railway-station", name: "柳州火车站", x: -2720, z: 500, detail: "沿源轮廓游览东西站房、架空候车厅与东广场，可沿南站路、飞鹅路及鹅岗路看周边六块住宅和商业街区；地块边界来自 OSM，内部楼栋、围墙、楼高和设施为估算重建。" },
  { id: "guangya", name: "广雅大桥", x: -1755, z: -1261, detail: "沿来源引桥及两侧人行道步行连接两岸广雅路，西堤路、滨江西路与雅儒路从桥下通过。双拱、桥面标高、纵坡及设施为现有地形上的估算重建。" },
  { id: "xihuan-eshan", name: "西环路 × 鹅山路", x: -3214, z: -664, detail: "道路轴线、斑马线与信号节点、公交站和学校/住宅边界来自 OSM；人行道、车道宽度、围墙、候车亭和绿化为估算重建。" },
  { id: "beizhan-market", name: "北站夜市 · 跃进路东一巷", x: -735, z: -2020, detail: "沿 OSM 巷道与 2023 年官方照片重建老夜市街景，可沿街逛摊；楼体、摊位和店名为示意，不代表当前经营布局。" },
  { id: "eshan-park", name: "鹅山公园", ...ESHAN_ENTRANCE, detail: "沿 OSM 东侧入口、环山路和登山道游览；山体来自约30米源高程，局部步道坡度、休憩棚与设施为估算重建。陡峭岩壁侧路尚未精细复原。" },
];
const palette = ["#c4bfaa", "#b8c4bb", "#d2c8b3", "#b7bcb6", "#c8c3b4"];
const occupied = CENTRAL_BUILDINGS.filter(b => !b.id.startsWith("urban-wall-")).map(b => ({ x: b.x, z: b.z, r: Math.hypot(b.w, b.d) / 2 }));
const buildings: CityBuilding[] = [];
const coreClear = (p: P, radius: number) => !inCore(p, radius + 15);
for (const b of source.buildings) {
  if (WUXING_SOURCE_IDS.has(b.id) || CENTRAL_SOURCE_IDS.has(b.id) || SQUARE_SOURCE_ROOF_IDS.has(b.id)) continue;
  if (b.id === "632407338") continue;
  if (ESHAN_SHELTER_IDS.has(b.id)) continue;
  const footprint = b.points.slice(0, -1).map(p => ({ x: p[0], z: p[1] }));
  const xs = footprint.map(p => p.x); const zs = footprint.map(p => p.z);
  const w = Math.max(...xs) - Math.min(...xs); const d = Math.max(...zs) - Math.min(...zs);
  const p = { x: (Math.max(...xs) + Math.min(...xs)) / 2, z: (Math.max(...zs) + Math.min(...zs)) / 2 };
  if (w < 2 || d < 2 || w > 450 || d > 450 || !footprint.every(q => inCity(q) && coreClear(q, 4) && !inMappedRiver(q))) continue;
  const { tags } = b;
  const tagged = Number.parseFloat(tags.height || "") || Number.parseFloat(tags["building:levels"] || "") * 3.2;
  const knownHeight = Number.isFinite(tagged) && tagged >= 2 && tagged <= 500;
  const style = SQUARE_BUILDING_STYLES[b.id];
  const h = knownHeight ? tagged : style?.h ?? (tags.building === "train_station" ? 24 : 10 + (Number(b.id) % 6) * 3.2);
  let foundationDepth = 3;
  if (style) for (let i = 0; i < footprint.length; i++) {
    const a = footprint[i]; const c = footprint[(i + 1) % footprint.length]; const length = Math.hypot(c.x - a.x, c.z - a.z);
    const samples = Math.max(1, Math.ceil(length));
    for (let n = 0; n <= samples; n++) foundationDepth = Math.max(foundationDepth, terrainHeight(p) - terrainTriangleHeight({ x: a.x + ((c.x - a.x) * n) / samples, z: a.z + ((c.z - a.z) * n) / samples }) + 0.6);
  }
  buildings.push({ ...p, id: `city-osm-${b.id}`, w, d, h, angle: 0, color: style?.color ?? palette[Number(b.id) % palette.length], real: true, footprint, ...(style ? { foundationDepth } : {}), ...(!knownHeight ? { heightSource: "estimated" as const } : {}) });
  occupied.push({ ...p, r: Math.hypot(w, d) / 2 });
}
for (const b of [...MARKET_BUILDINGS, ...STATION_BUILDINGS, ...STATION_NEIGHBORHOOD_BUILDINGS, ...SQUARE_ROOF_BUILDINGS]) {
  buildings.push(b); occupied.push({ x: b.x, z: b.z, r: Math.hypot(b.w, b.d) / 2 });
}
for (let index = 0; index < CITY_ROAD_SEGMENTS.length; index++) {
  const { a, b, road } = CITY_ROAD_SEGMENTS[index];
  if (road.bridge || road.foot) continue;
  const length = Math.hypot(b.x - a.x, b.z - a.z); if (length < 30) continue;
  const dx = (b.x - a.x) / length; const dz = (b.z - a.z) / length;
  for (let n = 25; n < length; n += 58) for (const side of [-1, 1]) {
    const offset = side * (road.width / 2 + 26);
    const p = { x: a.x + dx * n + dz * offset, z: a.z + dz * n - dx * offset };
    const seed = index * 31 + Math.floor(n) + side + 1;
    const w = 17 + (seed % 10); const d = 15 + (seed % 9); const radius = Math.hypot(w, d) / 2;
    if (marketReserved(p, radius)) continue;
    if (centralReserved(p, radius)) continue;
    if (stationNeighborhoodReserved(p, radius)) continue;
    if (riversideReserved(p, radius)) continue;
    if (!inCity(p, radius) || !coreClear(p, radius) || inMappedRiver(p) || terrainHeight(p) > 48) continue;
    if (p.x > -780 && p.x < -340 && p.z > -920 && p.z < -545) continue;
    if (protectedAreas.some(area => polygonContains(p, area.points))) continue;
    if (xihuanLayout.parcels.some(area => polygonContains(p, area.points))) continue;
    if (occupied.some(q => Math.hypot(q.x - p.x, q.z - p.z) < q.r + radius + 4)) continue;
    if (CITY_ROAD_SEGMENTS.some(s => segmentDistance(p, s.a, s.b) < s.road.width / 2 + radius + 2)) continue;
    if ([-1, 1].some(s => inMappedRiver({ x: p.x + s * radius, z: p.z }) || inMappedRiver({ x: p.x, z: p.z + s * radius }))) continue;
    if (Math.abs(terrainHeight({ x: p.x + radius, z: p.z }) - terrainHeight(p)) > 3 || Math.abs(terrainHeight({ x: p.x, z: p.z + radius }) - terrainHeight(p)) > 3) continue;
    buildings.push({ ...p, id: `city-infill-${index}-${n}-${side}`, w, d, h: 10 + (seed % 7) * 3.2, angle: Math.atan2(dx, dz), color: palette[seed % palette.length], real: false, heightSource: "estimated" });
    occupied.push({ ...p, r: radius });
  }
}
export const CITY_BUILDINGS = buildings;
export const CITY_RAILS = source.rails;
