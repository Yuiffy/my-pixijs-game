import map from "./map.json";
import mappedFootprints from "./building-footprints.json";
import { DONGMEN } from "./dongmen";
import { createUrbanFabric, pointInUrbanPolygon, urbanPublicGround } from "./urban";
import { CITIZEN_WALKS, NPC_HOMES, NPC_MEETING_POINTS } from "./pedestrian-layout";
import { terrainHeight, inMappedRiver } from "./terrain";
import { CITY_BUILDINGS, CITY_DISTRICTS, CITY_ROAD_SEGMENTS } from "./city";
import { WUXING_BUILDINGS, WUXING_SOURCE_IDS } from "./wuxing";
import { CENTRAL_BUILDINGS, CENTRAL_SOURCE_IDS } from "./central";
import { riversideReserved } from "./riverside";

export type Point = { x: number; z: number };
export type Road = {
  id: string;
  name: string;
  bridge: boolean;
  foot: boolean;
  width: number;
  points: Point[];
};
export type Building = Point & {
  id: string;
  w: number;
  d: number;
  h: number;
  angle: number;
  color: string;
  real: boolean;
  footprint?: Point[];
  heightSource?: "estimated";
  sourceId?: string;
  baseY?: number;
  foundationDepth?: number;
};
export const ORIGIN = map.origin;
export const BOUNDS = { minX: -440, maxX: 550, minZ: -400, maxZ: 1100 };
export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);
export function buildingContains(p: Point, b: Building, margin = 0) {
  // A conservative broad phase avoids walking every edge of distant city
  // footprints for each resident's small movement, camera ray and save check.
  const extent = (b.w + b.d) / 2 + Math.max(0, margin);
  if (Math.abs(p.x - b.x) > extent || Math.abs(p.z - b.z) > extent) return false;
  if (!b.footprint) {
    const dx = p.x - b.x; const dz = p.z - b.z;
    return Math.abs(dx * Math.cos(b.angle) - dz * Math.sin(b.angle)) < b.w / 2 + margin
      && Math.abs(dx * Math.sin(b.angle) + dz * Math.cos(b.angle)) < b.d / 2 + margin;
  }
  let inside = false;
  for (let i = 0, j = b.footprint.length - 1; i < b.footprint.length; j = i++) {
    const a = b.footprint[i]; const c = b.footprint[j];
    if (margin > 0 && distance(p, closestOnSegment(p, a, c)) < margin) return true;
    if ((a.z > p.z) !== (c.z > p.z) && p.x < ((c.x - a.x) * (p.z - a.z)) / (c.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}
export function closestOnSegment(p: Point, a: Point, b: Point): Point {
  const length = (b.x - a.x) ** 2 + (b.z - a.z) ** 2;
  const t = Math.max(
    0,
    Math.min(
      1,
      ((p.x - a.x) * (b.x - a.x) + (p.z - a.z) * (b.z - a.z)) / (length || 1),
    ),
  );
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
}
export const ROADS: Road[] = map.features
  .filter((f) => f.highway && !["steps", "platform"].includes(f.highway))
  .map((f) => ({
    id: f.id,
    name: f.name || "街巷",
    bridge: f.bridge === "yes",
    foot: ["footway", "pedestrian", "path"].includes(f.highway || ""),
    width:
      f.bridge === "yes"
        ? 10
        : f.highway === "secondary"
          ? 15
          : f.highway === "tertiary"
            ? 12
            : 5,
    points: f.points.map((p) => ({ x: p[0], z: p[1] })),
  }));
export const ROAD_SEGMENTS = ROADS.flatMap((r) => r.points.slice(1).map((b, i) => ({ a: r.points[i], b, road: r })),).filter(
  (s) => distance(s.a, s.b) > 1 &&
    Math.min(s.a.x, s.b.x) < 700 &&
    Math.max(s.a.x, s.b.x) > -650 &&
    Math.min(s.a.z, s.b.z) < 900 &&
    Math.max(s.a.z, s.b.z) > -550,
);
export function nearestRoad(p: Point) {
  let best = { distance: Infinity, point: p, name: "东门街区" };
  (canTraverse(p) ? ROAD_SEGMENTS : CITY_ROAD_SEGMENTS).forEach((s) => {
    const point = closestOnSegment(p, s.a, s.b);
    const d = distance(p, point);
    if (d < best.distance) best = { distance: d, point, name: s.road.name };
  });
  return best;
}
export const RIVER = map.features
  .find((f) => f.id === "678871694")!
  .points.map((p) => ({ x: p[0], z: p[1] }));
export function inRiver(p: Point) {
  return inMappedRiver(p);
}
export function onBridge(p: Point, margin = 0) {
  return ROAD_SEGMENTS.some(
    (s) => s.road.bridge &&
      distance(p, closestOnSegment(p, s.a, s.b)) < s.road.width / 2 + margin,
  );
}
export const canTraverse = (p: Point) => p.x > BOUNDS.minX &&
  p.x < BOUNDS.maxX &&
  p.z > BOUNDS.minZ &&
  p.z < BOUNDS.maxZ &&
  (!inRiver(p) || onBridge(p, -0.3));
export function constrainToBridge(
  from: Point,
  desired: Point,
  radius: number,
): Point {
  if (!inRiver(desired)) return desired;
  const bridge = ROAD_SEGMENTS.filter((s) => s.road.bridge).find(
    (s) => distance(from, closestOnSegment(from, s.a, s.b)) < s.road.width / 2 + 0.5,
  );
  if (!bridge) return desired;
  const center = closestOnSegment(desired, bridge.a, bridge.b);
  const offset = distance(desired, center);
  const width = bridge.road.width / 2 - radius;
  if (offset <= width) return desired;
  return {
    x: center.x + ((desired.x - center.x) * width) / offset,
    z: center.z + ((desired.z - center.z) * width) / offset,
  };
}
const PALETTE = [
  "#e3d2b5",
  "#c8b49a",
  "#c7c8bf",
  "#e1c9ad",
  "#bcc3be",
  "#d6d3c5",
];
const buildings: Building[] = [...WUXING_BUILDINGS, ...CENTRAL_BUILDINGS];
// Fit the imported footprint's orientation instead of its axis-aligned box,
// which can incorrectly cover the adjacent street for a diagonal building.
export function footprintBox(points: Point[]) {
  let best = { x: 0, z: 0, w: 0, d: 0, angle: 0, area: Infinity };
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]; const b = points[i];
    if (distance(a, b) < 0.1) continue;
    const angle = -Math.atan2(b.z - a.z, b.x - a.x);
    const cos = Math.cos(angle); const sin = Math.sin(angle);
    const xs = points.map((p) => p.x * cos - p.z * sin);
    const zs = points.map((p) => p.x * sin + p.z * cos);
    const minX = Math.min(...xs); const maxX = Math.max(...xs);
    const minZ = Math.min(...zs); const maxZ = Math.max(...zs);
    const w = maxX - minX; const d = maxZ - minZ;
    if (w * d < best.area) {
      const x = (maxX + minX) / 2; const z = (maxZ + minZ) / 2;
      best = { x: x * cos + z * sin, z: -x * sin + z * cos, w, d, angle, area: w * d };
    }
  }
  return best;
}
map.features
  .filter((f) => f.building && !WUXING_SOURCE_IDS.has(f.id) && !CENTRAL_SOURCE_IDS.has(f.id))
  .forEach((f, i) => {
    const { x, z, w, d, angle } = footprintBox(f.points.map((p) => ({ x: p[0], z: p[1] })));
    if (canTraverse({ x, z }) && w < 130 && d < 130) buildings.push({
        id: f.id,
        x,
        z,
        w,
        d,
        h: 14 + (i % 5) * 4,
        angle,
        color: PALETTE[i % PALETTE.length],
        real: true,
        footprint: f.points.slice(0, -1).map((p) => ({ x: p[0], z: p[1] })),
      });
  });
export const IMPORTED_BUILDING_STATS = { supplied: mappedFootprints.features.length, accepted: 0, rejected: { outside: 0, water: 0, corridor: 0, overlap: 0, publicSpace: 0 } };
const reservedPaths = Object.values(CITIZEN_WALKS).map(points => [...points, points[0]]);
const reservedPoints = [
  { ...DONGMEN, radius: 52 }, { x: 28, z: -34, radius: 17 },
  { x: -170, z: 117, radius: 16 }, { x: -158, z: 126, radius: 11 },
  { x: 74, z: 25, radius: 15 }, { x: 247, z: -166, radius: 12 },
  ...[...Object.values(NPC_HOMES), ...Object.values(NPC_MEETING_POINTS), { x: -207, z: 8 }, { x: 45, z: 5 }, { x: 249, z: -181 }, { x: 230, z: 622 }].map(p => ({ ...p, radius: 5 })),
];
// Keep the downloaded outline intact. Conflicting ML roofprints are rejected,
// never shifted into neighbouring streets or passed off as surveyed heights.
for (const feature of mappedFootprints.features) {
  const footprint = feature.points.map(p => ({ x: p[0], z: p[1] }));
  const box = footprintBox([...footprint, footprint[0]]);
  const probes = [...footprint, { x: box.x, z: box.z }];
  for (let i = 0; i < footprint.length; i++) {
    const a = footprint[i]; const b = footprint[(i + 1) % footprint.length]; const length = distance(a, b);
    for (let n = 1; n < length; n += 2) probes.push({ x: a.x + ((b.x - a.x) * n) / length, z: a.z + ((b.z - a.z) * n) / length });
  }
  const reject = (reason: keyof typeof IMPORTED_BUILDING_STATS.rejected) => { IMPORTED_BUILDING_STATS.rejected[reason]++; };
  if (box.w < 2 || box.d < 2 || box.w > 130 || box.d > 130 || !probes.every(p => p.x > BOUNDS.minX && p.x < BOUNDS.maxX && p.z > BOUNDS.minZ && p.z < BOUNDS.maxZ)) { reject("outside"); continue; }
  if (probes.some(inRiver)) { reject("water"); continue; }
  if (probes.some(p => urbanPublicGround(p) || reservedPoints.some(q => distance(p, q) < q.radius))) { reject("publicSpace"); continue; }
  if (probes.some(p => ROAD_SEGMENTS.some(s => distance(p, closestOnSegment(p, s.a, s.b)) < s.road.width / 2 + 2)
    || reservedPaths.some(path => path.slice(1).some((b, i) => distance(p, closestOnSegment(p, path[i], b)) < 3.5)))
    || ROAD_SEGMENTS.some(s => pointInUrbanPolygon(s.a, footprint) || pointInUrbanPolygon(s.b, footprint))) { reject("corridor"); continue; }
  if (buildings.some(b => probes.some(p => buildingContains(p, b, 1)) || b.footprint?.some(p => pointInUrbanPolygon(p, footprint)))) { reject("overlap"); continue; }
  const seed = feature.id.split("").reduce((hash, c) => (hash * 31 + c.charCodeAt(0)) % 4294967296, 0);
  buildings.push({
    ...box,
    id: `overture-${feature.id}`,
    sourceId: feature.id,
    h: Math.min(box.w, box.d) < 7 ? 6.2 : 9.3 + (seed % 5) * 3.1,
    footprint,
    color: PALETTE[seed % PALETTE.length],
    real: true,
    heightSource: "estimated",
  });
  IMPORTED_BUILDING_STATS.accepted++;
}
// Infill is explicitly fictional: OSM has sparse footprints in the old town.
ROAD_SEGMENTS.filter((s) => !s.road.bridge && !s.road.foot).forEach((s, si) => {
  const length = distance(s.a, s.b);
  const dx = (s.b.x - s.a.x) / length;
  const dz = (s.b.z - s.a.z) / length;
  for (let n = 15; n < length - 12; n += 22) for (const side of [-1, 1]) {
      const offset = s.road.width / 2 + 14;
      const x = s.a.x + dx * n - dz * offset * side;
      const z = s.a.z + dz * n + dx * offset * side;
      const p = { x, z };
      const w = 15 + (si % 3);
      const d = 15;
      if (
        !canTraverse(p) || urbanPublicGround(p) || riversideReserved(p, Math.hypot(w, d) / 2 + 0.5) ||
        distance(p, DONGMEN) < 75 ||
        nearestRoad(p).distance < 17
      ) continue;
      if (buildings.some((b) => distance(b, p) < Math.max(b.w, b.d) * 0.6 + 13)) continue;
      buildings.push({
        id: `infill-${si}-${n}-${side}`,
        x,
        z,
        w,
        d,
        h: 9 + ((si * 7 + n) % 4) * 3.2,
        angle: Math.atan2(dx, dz),
        color: PALETTE[si % PALETTE.length],
        real: false,
      });
    }
});
export const URBAN_FABRIC = createUrbanFabric({ roads: ROADS,
buildings,
bounds: BOUNDS,
canTraverse,
  protectedPaths: Object.values(CITIZEN_WALKS).map(points => [...points, points[0]]),
  protectedPoints: [...Object.values(NPC_HOMES), ...Object.values(NPC_MEETING_POINTS), { x: -207, z: 8 }, { x: 45, z: 5 }, { x: 249, z: -181 }],
});
export const BUILDINGS = [...buildings, ...URBAN_FABRIC.buildings, ...URBAN_FABRIC.walls, ...CITY_BUILDINGS];
export const buildingElevation = (b: Building) => b.baseY ?? terrainHeight(b);
export const buildingFoundationDepth = (b: Building) => b.foundationDepth ?? 3;
export const LANDMARKS = [
  ...CITY_DISTRICTS,
  {
    id: "gate",
    name: "东门城楼",
    x: DONGMEN.x,
    z: DONGMEN.z,
    detail: "五间面阔、重檐歇山顶与青砖台基。可穿过城门，从西侧石阶登台看江；位置和城台为近似重建。",
  },
  {
    id: "bridge",
    name: "文惠桥",
    x: 125,
    z: 290,
    detail: "沿 OSM 的两条桥梁轴线，表现并行双桥与红色拱肋。",
  },
  {
    id: "river",
    name: "柳江",
    x: 340,
    z: 105,
    detail: "河道采用 OSM 岸线多边形并保留江中岛屿；水位为代表性游戏水位。",
  },
  {
    id: "street",
    name: "曙光东路",
    x: -175,
    z: 125,
    detail: "道路转折来自 OSM，沿街店面是虚构的可玩填充。",
  },
  {
    id: "square",
    name: "金沙角",
    x: 270,
    z: -180,
    detail: "保留北岸沿江的相对位置，场景尺度使用米。",
  },
];
export const SAVE_KEY = "liuzhou-riverside-v1";
