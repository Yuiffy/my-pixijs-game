import layout from "./station-layout.json";
import source from "./city-map.json";
import { terrainHeight } from "./terrain";
import { terrainTriangleHeight } from "./terrainMesh";
import type { StreetBox } from "./street";

type P = { x: number; z: number };
export const STATION_PREFIX = "city-osm-632407338-";
export const STATION_ANGLE = Math.atan2(-layout.along[1], layout.along[0]);
export function stationPoint(along: number, out: number): P {
  return { x: layout.origin[0] + layout.along[0] * along + layout.outward[0] * out, z: layout.origin[1] + layout.along[1] * along + layout.outward[1] * out };
}
export function stationLocal(p: P) {
  const x = p.x - layout.origin[0]; const z = p.z - layout.origin[1];
  return { along: x * layout.along[0] + z * layout.along[1], out: x * layout.outward[0] + z * layout.outward[1] };
}
export function stationPolygonContains(p: P, ring: number[][]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]; const b = ring[j];
    if ((a[1] > p.z) !== (b[1] > p.z) && p.x < ((b[0] - a[0]) * (p.z - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
export const STATION_BUILDINGS = layout.parts.map(part => {
  const footprint = part.footprint.map(p => ({ x: p[0], z: p[1] }));
  const xs = footprint.map(p => p.x); const zs = footprint.map(p => p.z);
  return { id: STATION_PREFIX + part.name,
x: (Math.min(...xs) + Math.max(...xs)) / 2,
z: (Math.min(...zs) + Math.max(...zs)) / 2,
    w: Math.max(...xs) - Math.min(...xs),
d: Math.max(...zs) - Math.min(...zs),
h: part.topY - part.baseY,
    baseY: part.baseY,
angle: 0,
color: part.name === "concourse" ? "#9eb4b2" : "#c9cdc7",
real: true,
footprint,
heightSource: "estimated" as const };
});

// Query the exact rendered roof triangles, including their cell diagonals.
const roofFaces = layout.parts.flatMap(part => part.roof.map(vertices => ({ part, vertices })));
const roofBuckets = new Map<string, number[]>();
roofFaces.forEach(({ vertices: face }, index) => {
  const xs = face.map(p => p[0]); const zs = face.map(p => p[1]);
  for (let x = Math.floor(Math.min(...xs) / 24); x <= Math.floor(Math.max(...xs) / 24); x++) for (let z = Math.floor(Math.min(...zs) / 24); z <= Math.floor(Math.max(...zs) / 24); z++) {
    const key = `${x}:${z}`; const bucket = roofBuckets.get(key) || []; bucket.push(index); roofBuckets.set(key, bucket);
  }
});
function roofHeight(p: P, part?: (typeof layout.parts)[number]) {
  let height: number | undefined;
  for (const index of roofBuckets.get(`${Math.floor(p.x / 24)}:${Math.floor(p.z / 24)}`) || []) {
    const face = roofFaces[index];
    if (part && face.part !== part) continue;
    const [a, b, c] = face.vertices;
    const det = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
    const u = ((b[1] - c[1]) * (p.x - c[0]) + (c[0] - b[0]) * (p.z - c[1])) / det;
    const v = ((c[1] - a[1]) * (p.x - c[0]) + (a[0] - c[0]) * (p.z - c[1])) / det;
    if (u >= -1e-6 && v >= -1e-6 && u + v <= 1 + 1e-6) height = Math.max(height ?? -Infinity, u * a[2] + v * b[2] + (1 - u - v) * c[2]);
  }
  return height;
}
export const stationRoofHeight = (p: P) => roofHeight(p);
export function stationRoofSolid(p: P & { y: number }, margin = 0.3) {
  return layout.parts.some(part => {
    if (p.y < part.topY - margin) return false;
    const height = roofHeight(p, part);
    return height !== undefined && p.y < height + margin;
  });
}
export function stationRoofSurface() {
  const positions: number[] = []; const indices: number[] = [];
  const face = (vertices: number[][]) => {
    const start = positions.length / 3;
    vertices.forEach(p => positions.push(p[0], p[2], p[1])); indices.push(start, start + 1, start + 2);
  };
  for (const part of layout.parts) {
    for (const f of part.roof) {
      const cross = (f[1][1] - f[0][1]) * (f[2][0] - f[0][0]) - (f[1][0] - f[0][0]) * (f[2][1] - f[0][1]);
      face(cross >= 0 ? f : [f[0], f[2], f[1]]);
    }
    part.footprint.forEach((a, i) => {
      const b = part.footprint[(i + 1) % part.footprint.length];
      // Subdivide fascias to match the faceted roof edge, closing the attic.
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      for (let s = 0; s < length; s += 2) {
        const t = s / length; const next = Math.min(length, s + 2) / length;
        const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
        const q = [a[0] + (b[0] - a[0]) * next, a[1] + (b[1] - a[1]) * next];
        const py = roofHeight({ x: p[0], z: p[1] }, part) ?? part.topY; const qy = roofHeight({ x: q[0], z: q[1] }, part) ?? part.topY;
        face([[...p, part.topY], [...q, part.topY], [...q, qy]]); face([[...p, part.topY], [...q, qy], [...p, py]]);
      }
    });
  }
  return { positions, indices };
}

export const STATION_SOLIDS: StreetBox[] = [];
export const STATION_DECOR: StreetBox[] = [];
export const STATION_TREES: { at: [number, number, number]; size: number }[] = [];
export const STATION_PLANTERS: { along: number; out: number; width: number; depth: number }[] = [];
function addBox(p: P, y: number, size: StreetBox["size"], color: string, angle = STATION_ANGLE, solid = true) {
  const box: StreetBox = { at: [p.x, y - terrainHeight(p), p.z], size, color, angle };
  (solid ? STATION_SOLIDS : STATION_DECOR).push(box);
}
const publicRoads = source.roads.filter(r => !["path", "footway", "pedestrian", "cycleway"].includes(r.tags.highway) && !r.tags.railway)
  .flatMap(r => r.points.slice(1).map((b, i) => ({ a: r.points[i], b, width: ["primary", "trunk"].includes(r.tags.highway) ? 16 : r.tags.highway === "secondary" ? 13 : r.tags.highway === "tertiary" ? 10 : 6 })))
  .filter(s => [s.a, s.b].some(p => p[0] > -3000 && p[0] < -2600 && p[1] > 380 && p[1] < 850));
export function stationCarriagewayClear(p: P, margin = 0) {
  return !publicRoads.some(s => {
    const x = s.b[0] - s.a[0]; const z = s.b[1] - s.a[1];
    const t = Math.max(0, Math.min(1, ((p.x - s.a[0]) * x + (p.z - s.a[1]) * z) / (x * x + z * z || 1)));
    return Math.hypot(p.x - s.a[0] - x * t, p.z - s.a[1] - z * t) < s.width / 2 + margin;
  });
}
export function stationPavement(p: P) { return stationPolygonContains(p, layout.eastPlaza) && stationCarriagewayClear(p, 0.8); }
export const STATION_WALKS = {
  "station-walker-arrival": [stationPoint(8, 210), stationPoint(8, 250), stationPoint(8, 285), stationPoint(8, 250)],
  "station-walker-plaza": [stationPoint(65, 200), stationPoint(65, 245), stationPoint(65, 285), stationPoint(65, 245)],
};
export const STATION_RESIDENTS = [
  { id: "station-greeter", name: "接站市民", ...stationPoint(-5, 180), line: "我在广场这边等人。进站的通道留宽一点，拉行李也好走。" },
  { id: "station-traveller", name: "歇脚旅客", ...stationPoint(40, 245), line: "先在广场缓一缓。抬头还能看见鹅山，出了站也不急着赶路。" },
  ...Object.entries(STATION_WALKS).map(([id, points], i) => ({ id, name: i ? "散步市民" : "出站旅客", ...points[0], line: "沿广场走一段，看看路牌，再往街上去。" })),
];
export const STATION_APPEARANCES: Record<string, { outfit: string; trim: string; hair: string }> = Object.fromEntries(STATION_RESIDENTS.map((p, i) => [p.id, { outfit: ["#a78165", "#7998a5", "#a88f75", "#849b7c"][i], trim: "#53616b", hair: i % 2 ? "#43423e" : "#89867e" }]));
for (const along of [20, 55, 90, 125]) for (const out of [188, 225, 275, 300]) {
  const p = stationPoint(along, out);
  if (!stationPavement(p) || !stationCarriagewayClear(p, 8)) continue;
  const y = terrainTriangleHeight(p);
  STATION_PLANTERS.push({ along, out, width: 12, depth: 4 });
  addBox(p, y + 0.38, [12, 0.76, 4], "#b2b5a4");
  addBox(p, y + 0.79, [11.4, 0.08, 3.4], "#6d8d6b", STATION_ANGLE, false);
  addBox(p, y + 3.2, [0.55, 6.4, 0.55], "#77725b"); STATION_TREES.push({ at: [p.x, y + 7.4, p.z], size: 3.8 });
  const seat = stationPoint(along, out + 4);
  addBox(seat, terrainTriangleHeight(seat) + 0.55, [6, 0.22, 0.8], "#8f8062");
  addBox(seat, terrainTriangleHeight(seat) + 0.25, [5.5, 0.5, 0.4], "#66716b");
}
// Freestanding wayfinding has real posts rather than floating text.
const plazaSign = stationPoint(110, 175);
const signGround = terrainTriangleHeight(plazaSign);
addBox(plazaSign, signGround + 3.7, [9.2, 1.85, 0.16], "#3d6668");
for (const along of [106, 114]) addBox(stationPoint(along, 175), signGround + 1.5, [0.16, 3, 0.16], "#677b75");
// Glass curtain wall and slim mullions follow every actual headhouse edge.
for (const part of layout.parts) part.footprint.forEach((a, i) => {
  const b = part.footprint[(i + 1) % part.footprint.length]; const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (d < 3) return;
  const dx = (b[0] - a[0]) / d; const dz = (b[1] - a[1]) / d;
  const middle = { x: (a[0] + b[0]) / 2, z: (a[1] + b[1]) / 2 };
  const sign = stationPolygonContains({ x: middle.x + dz * 0.5, z: middle.z - dx * 0.5 }, part.footprint) ? -1 : 1;
  const offset = 0.12 * sign; const angle = -Math.atan2(dz, dx);
  for (let n = 2.25; n < d - 1.5; n += 4.5) {
    const p = { x: a[0] + dx * n + dz * offset, z: a[1] + dz * n - dx * offset };
    const bottom = part.name === "concourse" ? part.baseY + 1 : Math.max(part.baseY + 1.4, terrainTriangleHeight(p) + 0.7);
    const top = part.topY - 1.3;
    if (bottom >= top) continue;
    addBox(p, (bottom + top) / 2, [4.1, top - bottom, 0.13], n % 3 ? "#567e82" : "#698f90", angle, false);
    addBox(p, (bottom + top) / 2, [0.16, top - bottom + 0.4, 0.3], "#c7d4d0", angle, false);
    for (let y = part.baseY + 3.4; y < top; y += 3.4) if (y > bottom) addBox(p, y, [4.45, 0.16, 0.3], "#aebfba", angle, false);
  }
});
// Estimated closed entrance banks sit on the source facade, beneath the canopy.
const east = layout.parts.find(part => part.name === "east")!;
for (const along of [-18, -9, 0, 9, 18]) {
  let front = -Infinity;
  east.footprint.forEach((a, i) => {
    const b = east.footprint[(i + 1) % east.footprint.length];
    const aa = stationLocal({ x: a[0], z: a[1] }); const bb = stationLocal({ x: b[0], z: b[1] });
    if (along < Math.min(aa.along, bb.along) || along > Math.max(aa.along, bb.along) || Math.abs(bb.along - aa.along) < 1e-6) return;
    front = Math.max(front, aa.out + ((bb.out - aa.out) * (along - aa.along)) / (bb.along - aa.along));
  });
  const p = stationPoint(along, front + 0.35); const y = terrainTriangleHeight(p);
  addBox(p, y + 2.3, [5.2, 4.6, 0.28], "#c3d1c9", STATION_ANGLE, false);
  addBox(stationPoint(along, front + 0.52), y + 2.2, [4.8, 4.2, 0.18], "#284e55", STATION_ANGLE, false);
  addBox(stationPoint(along, front + 0.65), y + 2.2, [0.12, 4.2, 0.13], "#bacdc5", STATION_ANGLE, false);
}
// East entrance weather canopy. Its posts and slab use the same collision data.
for (const along of [-25, -12.5, 0, 12.5, 25]) {
  const p = stationPoint(along, 157);
  addBox(p, 22.5, [12.5, 0.55, 10], "#c4cec9");
  const post = stationPoint(along, 160.6); const ground = terrainTriangleHeight(post);
  addBox(post, (ground + 22.2) / 2, [0.55, 22.2 - ground, 0.55], "#b2c4c0");
}
// Covered taxi waiting area from the archived covered platform axis.
const taxi = source.roads.find(r => r.id === "793233199")!;
const taxiA = taxi.points[0]; const taxiB = taxi.points[taxi.points.length - 1];
export const STATION_TAXI = { x: (taxiA[0] + taxiB[0]) / 2, z: (taxiA[1] + taxiB[1]) / 2, angle: -Math.atan2(taxiB[1] - taxiA[1], taxiB[0] - taxiA[0]), width: Math.hypot(taxiB[0] - taxiA[0], taxiB[1] - taxiA[1]) };
const taxiGround = terrainTriangleHeight(STATION_TAXI);
addBox(STATION_TAXI, taxiGround + 4, [STATION_TAXI.width + 3, 0.25, 5], "#8ba3a0", STATION_TAXI.angle);
for (const along of [-0.4, 0, 0.4]) for (const side of [-1, 1]) {
  const p = { x: STATION_TAXI.x + Math.cos(STATION_TAXI.angle) * STATION_TAXI.width * along + Math.sin(STATION_TAXI.angle) * side * 2,
    z: STATION_TAXI.z - Math.sin(STATION_TAXI.angle) * STATION_TAXI.width * along + Math.cos(STATION_TAXI.angle) * side * 2 };
  addBox(p, taxiGround + 1.95, [0.2, 3.9, 0.2], "#587977", STATION_TAXI.angle);
}

for (const platform of layout.platforms) {
  const a = [(platform.points[0][0] + platform.points[1][0]) / 2, (platform.points[0][1] + platform.points[1][1]) / 2];
  const b = [(platform.points[2][0] + platform.points[3][0]) / 2, (platform.points[2][1] + platform.points[3][1]) / 2];
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]); const dx = (b[0] - a[0]) / length; const dz = (b[1] - a[1]) / length;
  const width = Math.hypot(platform.points[1][0] - platform.points[0][0], platform.points[1][1] - platform.points[0][1]);
  const angle = -Math.atan2(dz, dx);
  for (let n = 18; n < length - 18; n += 24) {
    const p = { x: a[0] + dx * n, z: a[1] + dz * n };
    const y = terrainTriangleHeight(p);
    addBox(p, y + 6.5, [24.1, 0.35, width + 2.4], "#9dada9", angle);
    addBox(p, y + 3.1, [0.5, 6.2, 0.5], "#c6ceca", angle);
  }
}
