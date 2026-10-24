import source from "./city-map.json";
import { terrainHeight } from "./terrain";
import { terrainTriangleHeight } from "./terrainMesh";
import type { StreetBox } from "./street";
import east from "./market-east-layout.json";
import { MARKET_EAST_BUILDINGS, MARKET_EAST_COURTS, MARKET_EAST_CROWNS, MARKET_EAST_DECOR, MARKET_EAST_SOLIDS, marketParcelReserved } from "./market-east";

type P = { x: number; z: number };
// OSM supplies the horizontal street axis. Building masses, furniture, shop
// names and dimensions below are an authored reconstruction of the old lane.
export const MARKET_SOURCE_ID = "835966474";
export const MARKET_AXIS = source.roads.find(r => r.id === MARKET_SOURCE_ID)!.points.map(p => ({ x: p[0], z: p[1] }));
const legs = MARKET_AXIS.slice(1).map((b, i) => {
  const a = MARKET_AXIS[i]; const length = Math.hypot(b.x - a.x, b.z - a.z);
  return { a, b, length, dx: (b.x - a.x) / length, dz: (b.z - a.z) / length };
});
export const MARKET_LENGTH = legs.reduce((sum, leg) => sum + leg.length, 0);
export { MARKET_EAST_COURTS } from "./market-east";
export function marketPoint(along: number, across = 0) {
  let remaining = Math.max(0, along);
  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i];
    if (remaining <= leg.length || i === legs.length - 1) return {
      x: leg.a.x + leg.dx * remaining - leg.dz * across,
      z: leg.a.z + leg.dz * remaining + leg.dx * across,
      angle: -Math.atan2(leg.dz, leg.dx),
    };
    remaining -= leg.length;
  }
  throw new Error("Missing market street axis");
}
export function marketProjection(p: P) {
  let start = 0; let closest = { along: 0, across: 0, distance: Infinity };
  for (const leg of legs) {
    const t = Math.max(0, Math.min(leg.length, (p.x - leg.a.x) * leg.dx + (p.z - leg.a.z) * leg.dz));
    const dx = p.x - leg.a.x - leg.dx * t; const dz = p.z - leg.a.z - leg.dz * t;
    const distance = Math.hypot(dx, dz);
    if (distance < closest.distance) closest = { along: start + t, across: -dx * leg.dz + dz * leg.dx, distance };
    start += leg.length;
  }
  return closest;
}
export function marketReserved(p: P, margin = 0) {
  if (marketParcelReserved(p, margin)) return true;
  if (p.x < -830 - margin || p.x > -180 + margin || p.z < -2110 - margin || p.z > -1940 + margin) return false;
  const q = marketProjection(p);
  return q.along >= 10 - margin && q.along <= MARKET_LENGTH + margin && q.distance < 38 + margin;
}
export function marketPavement(p: P, margin = 0) {
  if (!marketReserved(p)) return false;
  const q = marketProjection(p);
  return q.along >= 18 + margin && q.along <= MARKET_LENGTH - 25 - margin && Math.abs(q.across) >= 5.9 + margin && Math.abs(q.across) <= 9.3 - margin;
}

const buildingColors = ["#b9b4a2", "#c4b999", "#a7b7b0", "#c5c0ac"];
export const MARKET_BUILDINGS = [-1, 1].flatMap(side => Array.from({ length: 8 }, (_, i) => {
  if ((side === 1 && i === 4) || (side === -1 && i === 6)) return [];
  const along = 37 + i * 32; const d = 13 + (i % 3); const w = 28;
  const p = marketPoint(along, side * (9.6 + d / 2));
  const footprint = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([x, z]) => ({
    x: p.x + x * Math.cos(p.angle) + z * Math.sin(p.angle),
    z: p.z - x * Math.sin(p.angle) + z * Math.cos(p.angle),
  }));
  return [{ ...p, id: `market-block-${side}-${i}`, w, d, h: 16.2 + (i % 3) * 3.1, color: buildingColors[(i + (side > 0 ? 1 : 0)) % buildingColors.length], real: false, heightSource: "estimated" as const, footprint }];
})).flat();
MARKET_BUILDINGS.push(...MARKET_EAST_BUILDINGS);

type MarketSign = { text: string; at: [number, number, number]; angle: number; width: number; height: number; color: string };
export const MARKET_SOLIDS: StreetBox[] = [...MARKET_EAST_SOLIDS];
export const MARKET_DECOR: StreetBox[] = [...MARKET_EAST_DECOR];
export const MARKET_SIGNS: MarketSign[] = [];
export const MARKET_CROWNS: { at: [number, number, number]; scale: [number, number, number] }[] = [...MARKET_EAST_CROWNS];
export const MARKET_STALLS: { along: number; side: number }[] = [];
function box(along: number, across: number, y: number, size: StreetBox["size"], color: string, solid = false) {
  const p = marketPoint(along, across);
  const value: StreetBox = { at: [p.x, y + terrainTriangleHeight(p) - terrainHeight(p), p.z], size, angle: p.angle, color };
  (solid ? MARKET_SOLIDS : MARKET_DECOR).push(value);
}
function sign(text: string, along: number, across: number, y: number, width: number, height: number, color: string, endOn = false) {
  const p = marketPoint(along, across);
  MARKET_SIGNS.push({ text, at: [p.x, terrainTriangleHeight(p) + y, p.z], width, height, angle: p.angle + (endOn ? -Math.PI / 2 : across > 0 ? Math.PI : 0), color });
}
const foods = ["木薯糖水", "柳州螺蛳粉", "手工卷粉", "酸嘢", "鲜榨甘蔗汁", "烤豆腐", "炒田螺", "糯米饭"];
const canopies = ["#a95740", "#536f68", "#b99351", "#697f9a", "#ae7355"];
// Counters stay outside the six-metre source carriageway. A separate clear
// path runs behind them, between the carts and the residential storefronts.
for (const side of [-1, 1]) for (let i = 0; i < 24; i++) {
  if (i % 7 === 5) continue;
  const along = 26 + i * 10.5;
  MARKET_STALLS.push({ along, side });
  const color = canopies[(i + (side > 0 ? 2 : 0)) % canopies.length];
  box(along, side * 4.85, 0.61, [3.25, 1.05, 1.45], i % 2 ? "#b4bdb4" : "#a78360", true);
  box(along, side * 4.85, 1.18, [3.45, 0.12, 1.6], "#d4d0b7");
  box(along, side * 4.85, 3.03, [3.9, 0.16, 2.35], color, true);
  for (const edge of [-1, 1]) box(along + edge * 1.75, side * 5.8, 1.51, [0.09, 3.02, 0.09], "#68746b", true);
  box(along, side * 3.69, 2.76, [3.9, 0.45, 0.05], color);
  sign(foods[(i + (side > 0 ? 3 : 0)) % foods.length], along, side * 3.64, 2.76, 3.3, 0.38, color);
  for (let j = -1; j <= 1; j++) {
    box(along + j * 0.76, side * 4.85, 1.34, [0.58, 0.18, 0.52], j === 0 ? "#9b6346" : "#6f8d5d");
    box(along + j * 0.76, side * 4.85, 1.45, [0.43, 0.05, 0.36], ["#b8a86d", "#d4bc89", "#a1ad65"][j + 1]);
  }
  if (i % 4 === 1) box(along + 1.08, side * 4.85, 1.62, [0.52, 0.78, 0.5], "#c4cec4");
  for (const edge of [-1, 1]) box(along + edge * 1.14, side * 5.37, 0.18, [0.32, 0.32, 0.25], "#3b4742");
}
// Ground-floor frontage follows local terrain, rather than floating with a
// single apartment-block foundation across the coarse DEM's small slope.
for (const side of [-1, 1]) for (let i = 0; i < 8; i++) {
  if ((side === 1 && i === 4) || (side === -1 && i === 6)) continue;
  const center = 37 + i * 32;
  for (let bay = -1; bay <= 1; bay++) {
    const along = center + bay * 8.4;
    box(along, side * 9.55, 1.2, [8.1, 2.5, 0.18], "#566b62");
    box(along, side * 9.4, 1.35, [7.4, 2.4, 0.12], i % 3 === 0 ? "#a59f8e" : "#496a63");
    for (const edge of [-1, 1]) box(along + edge * 3.8, side * 9.24, 1.4, [0.2, 2.8, 0.32], "#d3c8ad");
    if (bay === 0) box(along, side * 9.18, 1.1, [1.1, 2.2, 0.1], "#293f3b");
    else for (let line = 0; line < 9; line++) box(along, side * 9.23, 0.3 + line * 0.24, [7.3, 0.025, 0.02], "#6a756b");
    const color = canopies[(i + bay + 5) % canopies.length];
    box(along, side * 8.9, 3.25, [8.1, 0.15, 1.5], color);
    sign(["便民小铺", "五金日杂", "糖水铺", "家常菜", "街坊粉店", "修理铺"][(i + bay + 7) % 6], along, side * 9.12, 2.9, 6.9, 0.55, color);
    // Small residential air-conditioning units and projecting sunshades.
    for (let floor = 1; floor <= 3; floor++) {
      box(along + 2.7, side * 9.23, 4.4 + floor * 3.1, [0.8, 0.55, 0.46], "#d0cbbc");
      box(along, side * 9.15, 6.3 + floor * 3.1, [2.4, 0.09, 0.75], "#8b9f91");
    }
  }
}
for (const [along, side] of [[165, 1], [229, -1]]) {
  box(along, side * 25.5, 1.25, [30, 2.5, 0.35], "#999e87", true);
  for (const shift of [-6, 6]) for (const offset of [13, 18]) {
    box(along + shift, side * offset, 0.74, [2.1, 0.14, 1.25], "#b18d62", true);
    box(along + shift, side * offset, 0.35, [0.6, 0.7, 0.6], "#627365", true);
    for (const edge of [-1, 1]) box(along + shift, side * (offset + edge * 1.15), 0.25, [1.9, 0.5, 0.55], "#9f7851", true);
  }
}
for (const side of [-1, 1]) for (const along of [40, 82, 124, 172, 218, 264]) {
  const p = marketPoint(along, side * 8.55);
  box(along, side * 8.55, 0.2, [1.2, 0.4, 1.2], "#7d8f74", true);
  box(along, side * 8.55, 2.4, [0.24, 4.8, 0.24], "#786f52", true);
  MARKET_CROWNS.push({ at: [p.x, terrainTriangleHeight(p) + 6.4, p.z], scale: [3, 2.5, 2.8] });
}
for (const along of [18, 142, 280]) {
  for (const side of [-1, 1]) box(along, side * 8.8, 3.2, [0.12, 6.4, 0.12], "#586b63", true);
  for (let i = 0; i < 13; i++) box(along, -8.4 + i * 1.4, 6.1 - Math.sin((i / 12) * Math.PI) * 0.8, [0.23, 0.18, 0.23], "#e9c87b");
}
sign("北站夜市", 18, -8.7, 4.1, 3.6, 0.8, "#39695b", true);
sign("跃进路东一巷", 18, -8.7, 3.2, 3.6, 0.65, "#39695b", true);

// East residential frontages are deliberately quieter than the historical
// western market. No evidence places a second continuous row of food carts.
for (const b of east.buildingsEstimated.filter(building => building.frontage)) {
  for (const shift of [-7, 0, 7]) {
    const along = b.along + shift; const { side } = b;
    // Clipped corner buildings must not acquire a shop front outside their ring.
    if (b.along > 525 || (b.along === 409 && side < 0)) continue;
    box(along, side * 9.48, 1.35, [6.6, 2.7, 0.18], "#63766b");
    for (let line = 0; line < 9; line++) box(along, side * 9.36, 0.36 + line * 0.24, [6.4, 0.035, 0.04], "#8e9685");
    box(along, side * 9.04, 3.2, [6.8, 0.13, 1.1], "#728578");
    sign(["便民修理", "日杂小铺", "街坊粉店"][shift === 0 ? 0 : shift < 0 ? 1 : 2], along, side * 9.26, 2.87, 6, 0.48, "#617366");
  }
}
for (const { side } of MARKET_EAST_COURTS) {
  for (const along of [431, 462]) {
    box(along, side * 23, 0.5, [3.5, 0.18, 0.75], "#a38a61", true);
    for (const shift of [-1.2, 1.2]) box(along + shift, side * 23, 0.22, [0.4, 0.44, 0.55], "#697264", true);
    box(along, side * 23.4, 0.9, [3.5, 0.65, 0.12], "#a38a61", true);
  }
  box(431, side * 34, 0.24, [3.4, 0.48, 2.5], "#7b8e6d", true);
  box(431, side * 34, 2.4, [0.26, 4.8, 0.26], "#7c6c52", true);
  const p = marketPoint(431, side * 34);
  MARKET_CROWNS.push({ at: [p.x, terrainTriangleHeight(p) + 6.4, p.z], scale: [3.4, 2.7, 3] });
  box(439, side * 10.4, 1.5, [0.12, 3, 0.12], "#596d60", true);
  sign("柳建大院", 439, side * 10.4, 2.4, 3.6, 0.65, "#596f61");
}
sign("跃进路东一巷", 543, 8.7, 3.1, 3.6, 0.65, "#39695b", true);
box(543, 8.7, 1.8, [0.12, 3.6, 0.12], "#596d60", true);

export const MARKET_WALKS: Record<string, P[]> = {
  "market-walker-north": [marketPoint(54, -6.9), marketPoint(95, -6.9), marketPoint(134, -6.9), marketPoint(95, -6.9)],
  "market-walker-south": [marketPoint(158, 6.9), marketPoint(208, 6.9), marketPoint(262, 6.9), marketPoint(208, 6.9)],
};
export const MARKET_RESIDENTS = [
  { id: "market-vendor-1", name: "糖水摊主", ...marketPoint(50, -8), line: "木薯糖水先放一放，热着喝也香。逛巷子慢慢来。" },
  { id: "market-vendor-2", name: "卷粉摊主", ...marketPoint(102, 8), line: "刚出锅的卷粉，配点酸辣汁。通道留着，大家都好走。" },
  { id: "market-vendor-3", name: "粉店街坊", ...marketPoint(184, -8), line: "白天是住家的巷子，傍晚搬出桌椅，街上就热闹了。" },
  { id: "market-vendor-4", name: "小吃摊主", ...marketPoint(246, 8), line: "前面还有几家摊，先逛一圈再回来也行。" },
  { id: "market-east-neighbour-north", name: "院边街坊", ...marketPoint(442, -15), line: "沿东一巷往前就到三中路，回头走是跃进路。" },
  { id: "market-east-neighbour-south", name: "纳凉的居民", ...marketPoint(442, 15), line: "院边留着条步行的路，慢慢走，坐会儿也行。" },
  ...Object.entries(MARKET_WALKS).map(([id, points]) => ({ id, name: id.endsWith("north") ? "逛夜市的街坊" : "买宵夜的居民", ...points[0], line: "沿着两边慢慢逛，给中间的通道留点空。" })),
];
export const MARKET_APPEARANCES: Record<string, { outfit: string; trim: string; hair: string }> = Object.fromEntries(MARKET_RESIDENTS.map((p, i) => [p.id, { outfit: ["#b88e65", "#73938b", "#7f8ea3", "#b97e6b"][i % 4], trim: "#4c6057", hair: i % 3 ? "#48443b" : "#a09d88" }]));
