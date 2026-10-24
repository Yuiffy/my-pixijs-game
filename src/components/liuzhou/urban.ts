import landuse from "./urban-landuse.json";
import type { Building, Point, Road } from "./world";
import { riversideReserved } from "./riverside";

export type UrbanParcel = {
  id: string;
  name: string;
  kind: "residential" | "school" | "hospital" | "parking" | "market" | "park" | "square" | "religious" | "retail";
  points: Point[];
};
export type UrbanGround = { id: string; points: Point[]; color: string };
export type UrbanFabric = {
  buildings: Building[];
  walls: Building[];
  courtyards: UrbanGround[];
  planting: Point[];
  parcels: UrbanParcel[];
};
type UrbanContext = {
  roads: Road[];
  buildings: Building[];
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  canTraverse: (point: Point) => boolean;
  protectedPaths?: Point[][];
  protectedPoints?: Point[];
};
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);
const COLORS = ["#c7bea7", "#cbc9bb", "#d7c8b3", "#b9c4bd", "#d5d1c0"];
const PUBLIC = new Set<UrbanParcel["kind"]>(["park", "square", "religious", "retail"]);

export function pointInUrbanPolygon(p: Point, points: Point[]) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i]; const b = points[j];
    if ((a.z > p.z) !== (b.z > p.z) && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}
function segmentDistance(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x; const dz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(p.x - a.x - t * dx, p.z - a.z - t * dz);
}
function polygonNear(p: Point, points: Point[], radius: number) {
  return pointInUrbanPolygon(p, points) || points.some((a, i) => segmentDistance(p, a, points[(i + 1) % points.length]) < radius);
}
function boxPoints(b: Pick<Building, "x" | "z" | "w" | "d" | "angle">, inset = 0): Point[] {
  const c = Math.cos(b.angle); const s = Math.sin(b.angle);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => {
    const x = sx * (b.w / 2 - inset); const z = sz * (b.d / 2 - inset);
    return { x: b.x + x * c + z * s, z: b.z - x * s + z * c };
  });
}
function samples(points: Point[], spacing = 3) {
  const result: Point[] = [];
  points.forEach((a, i) => {
    const b = points[(i + 1) % points.length]; const n = Math.max(1, Math.ceil(distance(a, b) / spacing));
    for (let j = 0; j < n; j++) result.push({ x: a.x + (b.x - a.x) * (j / n), z: a.z + (b.z - a.z) * (j / n) });
  });
  return result;
}
export const URBAN_PARCELS: UrbanParcel[] = landuse.features.flatMap(f => {
  const kind: UrbanParcel["kind"] | null = f.landuse === "residential" ? "residential"
    : f.landuse === "religious" ? "religious" : f.landuse === "retail" ? "retail"
      : f.leisure === "park" || f.leisure === "pitch" ? "park"
        : f.amenity === "school" ? "school" : f.amenity === "hospital" ? "hospital"
          : f.amenity === "parking" ? "parking" : f.amenity === "marketplace" ? "market"
            : f.place === "square" ? "square" : null;
  return kind ? [{ id: f.id, name: f.name || "街区院落", kind, points: f.points.slice(0, -1).map(p => ({ x: p[0], z: p[1] })) }] : [];
});
export const urbanPublicGround = (p: Point) => riversideReserved(p) || URBAN_PARCELS.some(parcel => ["park", "square", "religious"].includes(parcel.kind) && pointInUrbanPolygon(p, parcel.points));

/**
 * OSM supplies the parcel uses and boundaries. Unmapped building volumes and
 * small courtyard infill are deliberately inferred, never labelled as surveyed
 * footprints. Every new solid clears complete street corridors and gameplay
 * access paths. This factory has no runtime import of world.ts.
 */
export function createUrbanFabric(context: UrbanContext): UrbanFabric {
  const { bounds } = context;
  const result: UrbanFabric = { buildings: [], walls: [], courtyards: [], planting: [], parcels: URBAN_PARCELS };
  const segments = context.roads.flatMap(road => road.points.slice(1).map((b, i) => ({ a: road.points[i], b, road })));
  const protectedPoints = [
    { x: -2.8, z: -2.2, radius: 52 }, { x: 28, z: -34, radius: 17 },
    { x: -170, z: 117, radius: 16 }, { x: -158, z: 126, radius: 11 },
    { x: 74, z: 25, radius: 15 }, { x: 247, z: -166, radius: 12 },
    { x: 230, z: 622, radius: 13 },
    ...(context.protectedPoints || []).map(p => ({ ...p, radius: 5 })),
  ];
  const protectedSegments = (context.protectedPaths || []).flatMap(path => path.slice(1).map((b, i) => ({ a: path[i], b })));
  const basePolygons = context.buildings.map(b => b.footprint || boxPoints(b));
  const plotPolygons: Point[][] = [];
  const publicParcels = URBAN_PARCELS.filter(p => PUBLIC.has(p.kind));
  const inBounds = (p: Point, margin = 0) => p.x > bounds.minX + margin && p.x < bounds.maxX - margin && p.z > bounds.minZ + margin && p.z < bounds.maxZ - margin;
  const protectedAt = (p: Point, margin = 0) => protectedPoints.some(q => distance(p, q) < q.radius + margin)
    || protectedSegments.some(s => segmentDistance(p, s.a, s.b) < 3.5 + margin);
  const roadAt = (p: Point, margin = 0) => segments.some(s => segmentDistance(p, s.a, s.b) < s.road.width / 2 + (s.road.bridge ? 7 : s.road.foot ? 4 : 6) + margin);
  const groundClear = (p: Point, margin = 0) => inBounds(p, margin) && context.canTraverse(p) && !roadAt(p, margin) && !protectedAt(p, margin) && !riversideReserved(p, margin);
  const parcelAt = (p: Point) => URBAN_PARCELS.find(parcel => pointInUrbanPolygon(p, parcel.points));
  const nearestStreet = (p: Point) => segments.filter(s => !s.road.bridge).reduce((best, s) => {
    const d = segmentDistance(p, s.a, s.b);
    return d < best.distance ? { distance: d, angle: -Math.atan2(s.b.z - s.a.z, s.b.x - s.a.x) } : best;
  }, { distance: Infinity, angle: 0 });
  const building = (id: string, x: number, z: number, w: number, d: number, h: number, angle: number, color: string): Building => ({ id, x, z, w, d, h, angle, color, real: false });
  const wall = (id: string, a: Point, b: Point, h = 2.5) => {
    result.walls.push(building(id, (a.x + b.x) / 2, (a.z + b.z) / 2, distance(a, b), 0.48, h, -Math.atan2(b.z - a.z, b.x - a.x), "#a6aa98"));
  };

  // Actual park, plaza, campus and residential parcel geometry gives the ground
  // a land use before inferred architecture is placed on it.
  for (const parcel of URBAN_PARCELS) {
    if (!parcel.points.some(p => inBounds(p))) continue;
    const color = parcel.kind === "park" ? "#8eaa82" : parcel.kind === "residential" ? "#a7ad94"
      : parcel.kind === "school" ? "#b9baa7" : parcel.kind === "square" ? "#c5bfa9"
        : parcel.kind === "parking" ? "#929a8d" : "#b8b5a2";
    // Retail boundaries describe occupied commercial land, not an empty plaza.
    // The dedicated source-clipped street surface covers the Wuxing passages.
    if (parcel.id !== "1524324821") result.courtyards.push({ id: `parcel-${parcel.id}`, points: parcel.points, color });
    if (PUBLIC.has(parcel.kind) || parcel.kind === "parking" || parcel.kind === "market") continue;
    parcel.points.forEach((a, i) => {
      const b = parcel.points[(i + 1) % parcel.points.length]; const n = Math.max(1, Math.ceil(distance(a, b) / 12));
      for (let j = 0; j < n; j++) {
        const start = { x: a.x + (b.x - a.x) * (j / n), z: a.z + (b.z - a.z) * (j / n) };
        const end = { x: a.x + (b.x - a.x) * ((j + 1) / n), z: a.z + (b.z - a.z) * ((j + 1) / n) };
        if (!samples([start, end], 1).every(p => groundClear(p, 0.6) && !basePolygons.some(poly => polygonNear(p, poly, 0.7)))) continue;
        wall(`urban-wall-parcel-${parcel.id}-${i}-${j}`, start, end);
      }
    });
  }

  // Fill the missing rear blocks as closed residential courtyards. A full
  // perimeter is validated rather than just the centre of a candidate house.
  for (const size of [42, 30, 22]) {
    const stride = size + 12;
    for (let z = bounds.minZ + size / 2 + 7; z < bounds.maxZ - size / 2; z += stride) {
      for (let x = bounds.minX + size / 2 + 7; x < bounds.maxX - size / 2; x += stride) {
        const p = { x, z }; const parcel = parcelAt(p);
        if (!groundClear(p) || publicParcels.some(q => polygonNear(p, q.points, size / 2)) || parcel?.kind === "parking") continue;
        const street = nearestStreet(p);
        const plot = building("", x, z, size, size * 0.84, 0, street.angle, "");
        const polygon = boxPoints(plot);
        const probes = [p, ...samples(polygon, 2)];
        if (!probes.every(q => groundClear(q, 1.2)
          && (!parcel || pointInUrbanPolygon(q, parcel.points))
          && !publicParcels.some(r => polygonNear(q, r.points, 2))
          && !basePolygons.some(poly => polygonNear(q, poly, 3))
          && !plotPolygons.some(poly => polygonNear(q, poly, 5)))) continue;
        // A small imported footprint can sit wholly inside a proposed plot;
        // boundary checks alone would miss this containment case.
        if (basePolygons.some(poly => poly.some(q => polygonNear(q, polygon, 3))) || plotPolygons.some(poly => poly.some(q => polygonNear(q, polygon, 5)))) continue;
        const id = `urban-${result.buildings.length}`;
        plotPolygons.push(polygon);
        result.courtyards.push({ id: `${id}-court`, points: polygon, color: parcel?.kind === "school" ? "#b8b8a3" : "#a8ad96" });
        const { angle } = plot; const c = Math.cos(angle); const s = Math.sin(angle);
        const local = (dx: number, dz: number) => ({ x: x + dx * c + dz * s, z: z - dx * s + dz * c });
        const center = local(0, -size * 0.15);
        const h = parcel?.kind === "residential" ? 28 + (result.buildings.length % 4) * 8
          : parcel?.kind === "school" ? 11.5 : parcel?.kind === "hospital" ? 20
            : size === 22 ? 10 + (result.buildings.length % 3) * 3 : 15 + (result.buildings.length % 4) * 3;
        result.buildings.push(building(`${id}-house`, center.x, center.z, size * 0.67, size * 0.42, h, angle, COLORS[result.buildings.length % COLORS.length]));
        if (!parcel || !["residential", "school", "hospital"].includes(parcel.kind)) polygon.forEach((a, i) => wall(`urban-wall-${id}-${i}`, a, polygon[(i + 1) % polygon.length]));
        for (const side of [-1, 1]) result.planting.push(local(size * 0.31 * side, size * 0.28));
      }
    }
  }

  // Public parks and the riverside squares remain open. Small groves and beds
  // use only safe ground, keeping canopies away from every bridge corridor.
  for (const parcel of URBAN_PARCELS.filter(p => p.kind === "park" || p.kind === "square")) {
    const xs = parcel.points.map(p => p.x); const zs = parcel.points.map(p => p.z);
    for (let z = Math.max(bounds.minZ + 8, Math.min(...zs)); z < Math.min(bounds.maxZ - 8, Math.max(...zs)); z += 18) {
      for (let x = Math.max(bounds.minX + 8, Math.min(...xs)); x < Math.min(bounds.maxX - 8, Math.max(...xs)); x += 19) {
        const p = { x: x + Math.sin(z) * 2.5, z };
        if (pointInUrbanPolygon(p, parcel.points) && groundClear(p, 4) && !basePolygons.some(poly => polygonNear(p, poly, 5))) result.planting.push(p);
      }
    }
  }
  return result;
}
