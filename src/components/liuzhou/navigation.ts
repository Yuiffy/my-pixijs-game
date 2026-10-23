import { BOUNDS, BUILDINGS, ROAD_SEGMENTS, buildingContains, canTraverse, closestOnSegment, distance, inRiver, type Building, type Point } from "./world";
import { DONGMEN, GATE_SOLIDS } from "./dongmen";
import { STREET_SOLIDS } from "./street";
import { BRIDGE_SECTIONS, bridgeSurface } from "./bridges";
import { terrainHeight } from "./terrain";

export type TravelMode = "walk" | "bike" | "car";
export type NavigationPoint = Point & { y?: number };
export type Destination = NavigationPoint & { id: string; name: string; kind: "story" | "delivery" | "landmark" };
export type Route = { destination: Destination; mode: TravelMode; points: NavigationPoint[]; metres: number; status: "route" | "arrived" | "unavailable" | "planning" };
export type RouteRequest = { version: number; from: NavigationPoint; destination: Destination; mode: TravelMode };
const CELL = 3;
const WIDTH = Math.ceil((BOUNDS.maxX - BOUNDS.minX) / CELL);
const HEIGHT = Math.ceil((BOUNDS.maxZ - BOUNDS.minZ) / CELL);
const PLANE = WIDTH * HEIGHT;
const BUCKET = 24;
const key = (x: number, z: number) => `${x},${z}`;
type Layer = 0 | 1;
const index = (p: Point, layer: Layer) => layer * PLANE + Math.round((p.z - BOUNDS.minZ) / CELL) * WIDTH + Math.round((p.x - BOUNDS.minX) / CELL);
const point = (i: number): NavigationPoint => {
  const local = i % PLANE;
  const p = { x: BOUNDS.minX + (local % WIDTH) * CELL, z: BOUNDS.minZ + Math.floor(local / WIDTH) * CELL };
  return { ...p, y: i >= PLANE ? bridgeSurface(p)?.y : terrainHeight(p) };
};
const spatialDistance = (a: NavigationPoint, b: NavigationPoint) => Math.hypot(a.x - b.x, a.z - b.z, (a.y ?? terrainHeight(a)) - (b.y ?? terrainHeight(b)));
const neighbours = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
const solids: Building[] = [...BUILDINGS, ...GATE_SOLIDS.filter(b => b.at[1] - b.size[1] / 2 < 1.9).map((b, i) => ({
  id: `gate-${i}`, x: DONGMEN.x + b.at[0], z: DONGMEN.z + b.at[2], w: b.size[0], d: b.size[2], h: 2, angle: 0, color: "", real: false,
})), ...STREET_SOLIDS.filter(b => b.at[1] - b.size[1] / 2 < 1.9).map((b, i) => ({
  id: `street-${i}`, x: b.at[0], z: b.at[2], w: b.size[0], d: b.size[2], h: 2, angle: b.angle || 0, color: "", real: false,
}))];
const solidBuckets = new Map<string, Building[]>();
const roadBuckets = new Map<string, typeof ROAD_SEGMENTS>();
function insert<T>(buckets: Map<string, T[]>, item: T, minX: number, minZ: number, maxX: number, maxZ: number) {
  for (let x = Math.floor(minX / BUCKET); x <= Math.floor(maxX / BUCKET); x++) for (let z = Math.floor(minZ / BUCKET); z <= Math.floor(maxZ / BUCKET); z++) {
    const k = key(x, z);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k)!.push(item);
  }
}
solids.forEach(b => {
  const r = Math.hypot(b.w, b.d) / 2 + 2;
  insert(solidBuckets, b, b.x - r, b.z - r, b.x + r, b.z + r);
});
ROAD_SEGMENTS.forEach(s => {
  const r = s.road.width / 2 + 8;
  insert(roadBuckets, s, Math.min(s.a.x, s.b.x) - r, Math.min(s.a.z, s.b.z) - r, Math.max(s.a.x, s.b.x) + r, Math.max(s.a.z, s.b.z) + r);
});
function nearby<T>(buckets: Map<string, T[]>, p: Point) { return buckets.get(key(Math.floor(p.x / BUCKET), Math.floor(p.z / BUCKET))) || []; }
function layerAt(p: NavigationPoint): Layer | undefined {
  const ground = terrainHeight(p); const deck = bridgeSurface(p);
  if (p.y === undefined) return inRiver(p) && deck ? 1 : 0;
  if (!Number.isFinite(p.y)) return undefined;
  // Near a grounded approach both surfaces meet; tiny DEM interpolation errors
  // must not turn an adjacent ground point into an out-of-bounds deck point.
  if (deck && Math.abs(p.y - deck.y) < 1.1 && (inRiver(p) || Math.abs(p.y - ground) > 0.65)) return 1;
  return Math.abs(p.y - ground) < 1.1 ? 0 : undefined;
}
function onLayer(p: Point, layer: Layer): NavigationPoint {
  return { x: p.x, z: p.z, y: layer === 1 ? bridgeSurface(p)?.y : terrainHeight(p) };
}
function layerClear(p: Point, mode: TravelMode, layer: Layer) {
  const radius = mode === "car" ? 1.55 : 0.65;
  if (p.x <= BOUNDS.minX || p.x >= BOUNDS.maxX || p.z <= BOUNDS.minZ || p.z >= BOUNDS.maxZ) return false;
  const deck = bridgeSurface(p, -radius);
  if (layer === 1 && !deck) return false;
  if (layer === 0) {
    if (!canTraverse(p) || inRiver(p)) return false;
    const overhead = bridgeSurface(p, radius);
    const clearance = overhead ? overhead.y - terrainHeight(p) : Infinity;
    // A low approach is solid overhead; a high deck has a usable underpass.
    if (clearance > 0.65 && clearance < 2.9) return false;
  }
  return !nearby(solidBuckets, p).some(b => buildingContains(p, b, radius)
    && (layer === 0 || (deck?.y ?? 0) < terrainHeight(b) + b.h + 0.3));
}
export function navigationClear(p: NavigationPoint, mode: TravelMode = "walk") {
  const layer = layerAt(p);
  return layer !== undefined && layerClear(p, mode, layer);
}
function portal(p: Point) {
  const hit = bridgeSurface(p);
  if (!hit || hit.section.main || Math.abs(hit.y - terrainHeight(p)) > 0.65) return false;
  return BRIDGE_SECTIONS.some(s => !s.main && [s.a, s.b].some(end => distance(p, end) <= CELL * 1.75 && Math.abs(end.y - terrainHeight(end)) < 0.75));
}
function segmentClear(a: NavigationPoint, b: NavigationPoint, mode: TravelMode) {
  const first = layerAt(a); const last = layerAt(b);
  if (first === undefined || last === undefined) return false;
  if (first !== last) {
    if (distance(a, b) > CELL * 1.5 || !(portal(a) || portal(b))) return false;
    const ground = first === 0 ? a : b;
    if (!layerClear(ground, mode, 0)) return false;
  }
  const n = Math.ceil(distance(a, b) / 0.65);
  for (let i = 0; i <= n; i++) {
    const t = i / (n || 1);
    if (!layerClear({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }, mode, first !== last ? 1 : first)) return false;
  }
  return true;
}
// Street preference uses the shipped OSM road geometry. It is gameplay guidance,
// not real-world road access, directions, or a claim about current traffic rules.
function streetCost(p: Point, mode: TravelMode) {
  const roads = nearby(roadBuckets, p);
  let cost = mode === "car" ? 3.5 : mode === "walk" ? 1.65 : 1.4;
  let carriageway = false;
  for (const s of roads) {
    const d = distance(p, closestOnSegment(p, s.a, s.b));
    if (d > s.road.width / 2 + 2) continue;
    if (mode === "walk" && !s.road.foot && d < s.road.width / 2 - 0.3) { carriageway = true; continue; }
    cost = Math.min(cost, mode === "car" && s.road.foot ? 3 : 1);
  }
  return mode === "walk" && carriageway && cost > 1 ? 3.2 : cost;
}
function createHeap() {
  const items: { id: number; cost: number; score: number }[] = [];
  const push = (item: typeof items[number]) => {
    const a = items; a.push(item); let i = a.length - 1;
    while (i > 0) { const parent = Math.floor((i - 1) / 2); if (a[parent].score <= item.score) break; a[i] = a[parent]; i = parent; }
    a[i] = item;
  };
  const pop = () => {
    const a = items; const first = a[0]; const last = a.pop()!;
    if (a.length) {
      let i = 0;
      while (i * 2 + 1 < a.length) {
        let child = i * 2 + 1;
        if (child + 1 < a.length && a[child + 1].score < a[child].score) child++;
        if (last.score <= a[child].score) break;
        a[i] = a[child]; i = child;
      }
      a[i] = last;
    }
    return first;
  };
  return { items, push, pop };
}
function createGrid(mode: TravelMode) {
  const pass = new Uint8Array(PLANE * 2);
  const weights = new Float32Array(PLANE * 2);
  const valid = (id: number) => {
    if (id < 0 || id >= pass.length) return false;
    if (!pass[id]) pass[id] = layerClear(point(id), mode, id >= PLANE ? 1 : 0) ? 1 : 2;
    return pass[id] === 1;
  };
  const weight = (id: number) => { if (!weights[id]) weights[id] = streetCost(point(id), mode); return weights[id]; };
  const anchor = (p: NavigationPoint) => {
    const layer = layerAt(p);
    if (layer === undefined) return undefined;
    const center = point(index(p, layer)); const candidates: number[] = [];
    for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) {
      const id = index({ x: center.x + x * CELL, z: center.z + z * CELL }, layer);
      if (valid(id) && distance(p, point(id)) < 10 && segmentClear(p, point(id), mode)) candidates.push(id);
    }
    candidates.sort((a, b) => distance(p, point(a)) - distance(p, point(b)));
    return candidates[0];
  };
  const plan = (from: NavigationPoint, to: NavigationPoint): NavigationPoint[] => {
    if (!navigationClear(from, mode) || !navigationClear(to, mode)) return [];
    if (distance(from, to) < 15 && segmentClear(from, to, mode)) return [onLayer(from, layerAt(from)!), onLayer(to, layerAt(to)!)];
    const start = anchor(from); const goal = anchor(to);
    if (start === undefined || goal === undefined) return [];
    const open = createHeap(); const parents = new Int32Array(PLANE * 2).fill(-1);
    const costs = new Float32Array(PLANE * 2).fill(Infinity); const closed = new Uint8Array(PLANE * 2);
    costs[start] = 0; open.push({ id: start, cost: 0, score: distance(point(start), point(goal)) });
    while (open.items.length) {
      const c = open.pop(); if (closed[c.id]) continue; closed[c.id] = 1;
      if (c.id === goal) {
        const path = [onLayer(to, layerAt(to)!), point(goal)]; let id = goal;
        while (parents[id] !== -1) { id = parents[id]; path.push(point(id)); }
        path.push(onLayer(from, layerAt(from)!)); path.reverse();
        // Remove collinear grid points, without shortcutting across buildings,
        // water, or the preferred street corridor.
        return path.filter((p, i) => {
          if (!i || i === path.length - 1) return true;
          const a = path[i - 1]; const b = path[i + 1];
          const length = distance(a, b);
          const expectedY = (a.y ?? 0) + ((b.y ?? 0) - (a.y ?? 0)) * (distance(a, p) / (length || 1));
          return Math.abs((p.x - a.x) * (b.z - p.z) - (p.z - a.z) * (b.x - p.x)) > 0.01
            || Math.abs((p.y ?? 0) - expectedY) > 0.025 || layerAt(a) !== layerAt(b);
        });
      }
      const layer: Layer = c.id >= PLANE ? 1 : 0;
      const local = c.id % PLANE;
      // The only vertical graph edges are the low, grounded approach ends.
      // A projected intersection beneath a high bridge cannot join its deck.
      const other = local + (layer === 0 ? PLANE : 0);
      if (!closed[other] && valid(other) && portal(point(c.id))) {
        const cost = costs[c.id] + 0.2;
        if (cost < costs[other]) {
          costs[other] = cost; parents[other] = c.id;
          open.push({ id: other, cost, score: cost + distance(point(other), point(goal)) });
        }
      }
      for (const [dx, dz] of neighbours) {
        const x = (local % WIDTH) + dx; const z = Math.floor(local / WIDTH) + dz; const id = layer * PLANE + z * WIDTH + x;
        if (x < 0 || x >= WIDTH || z < 0 || z >= HEIGHT || closed[id] || !valid(id)) continue;
        if (dx && dz && (!valid(c.id + dx) || !valid(c.id + dz * WIDTH))) continue;
        // Corner checks alone miss thin furniture between two grid centres.
        if (!segmentClear(point(c.id), point(id), mode)) continue;
        const cost = costs[c.id] + (spatialDistance(point(c.id), point(id)) * (weight(c.id) + weight(id))) / 2;
        if (cost >= costs[id]) continue;
        costs[id] = cost; parents[id] = c.id;
        open.push({ id, cost, score: cost + distance(point(id), point(goal)) });
      }
    }
    return [];
  };
  return { plan };
}
const grids = new Map<TravelMode, ReturnType<typeof createGrid>>();
export function planRoute(from: NavigationPoint, to: NavigationPoint, mode: TravelMode = "walk") {
  if (!Number.isFinite(from.x + from.z + to.x + to.z)) return [];
  if (!grids.has(mode)) grids.set(mode, createGrid(mode));
  let arrival = to;
  if (!navigationClear(to, mode)) {
    const candidates: NavigationPoint[] = [];
    for (const radius of [1.5, 3.5]) for (let i = 0; i < 16; i++) {
      const p = { x: to.x + Math.sin((i * Math.PI) / 8) * radius, z: to.z + Math.cos((i * Math.PI) / 8) * radius, ...(to.y === undefined ? {} : { y: to.y }) };
      if (navigationClear(p, mode)) candidates.push(p);
    }
    candidates.sort((a, b) => distance(from, a) - distance(from, b));
    if (!candidates.length) return [];
    [arrival] = candidates;
  }
  return grids.get(mode)!.plan(from, arrival);
}
export const routeMetres = (points: NavigationPoint[]) => points.slice(1).reduce((sum, p, i) => sum + spatialDistance(points[i], p), 0);

function closestOnRoute(p: NavigationPoint, a: NavigationPoint, b: NavigationPoint): NavigationPoint {
  const closest = closestOnSegment(p, a, b);
  const t = distance(a, closest) / (distance(a, b) || 1);
  return { ...closest, y: (a.y ?? terrainHeight(a)) + ((b.y ?? terrainHeight(b)) - (a.y ?? terrainHeight(a))) * t };
}

export class StreetNavigation {
  route: Route | null = null;
  replans = 0;
  private attempt = -Infinity;
  private origin: NavigationPoint = { x: Infinity, z: Infinity };
  private version = 0;
  private path: NavigationPoint[] = [];
  constructor(private request?: (request: RouteRequest) => void) {}
  accept(version: number, points: NavigationPoint[]) {
    if (version !== this.version || !this.route || this.route.status !== "planning") return;
    this.path = points;
    this.route = { ...this.route, points, metres: routeMetres(points), status: points.length ? "route" : "unavailable" };
  }
  update(from: NavigationPoint, destination: Destination | null, mode: TravelMode, now: number): Route | null {
    if (!destination) { if (this.route) this.version++; this.path = []; this.route = null; return null; }
    const changed = !this.route || this.route.destination.id !== destination.id || this.route.mode !== mode || distance(this.route.destination, destination) > 1;
    if (layerAt(from) === undefined) {
      if (this.route?.status === "planning") this.version++;
      this.path = [];
      this.route = { destination, mode, points: [], metres: 0, status: "unavailable" }; return this.route;
    }
    const arrivalLayer = layerAt(destination);
    const arrivalPoint = arrivalLayer === undefined ? destination : onLayer(destination, arrivalLayer);
    if (spatialDistance(from, arrivalPoint) < 4 && Math.abs((from.y ?? terrainHeight(from)) - (arrivalPoint.y ?? terrainHeight(arrivalPoint))) < 1.5) {
      if (this.route?.status === "planning") this.version++;
      this.path = [];
      this.route = { destination, mode, points: [], metres: 0, status: "arrived" }; return this.route;
    }
    if (!changed && this.route?.status === "planning") return this.route;
    let closest = from; let segment = 0; let off = Infinity;
    // Project onto the computed route, never onto the displayed connector from
    // the moving player. Reusing that connector grows a backwards breadcrumb
    // trail on every update, even when the player follows the street correctly.
    const previous = this.path;
    for (let i = 1; i < previous.length; i++) {
      const p = closestOnRoute(from, previous[i - 1], previous[i]); const d = spatialDistance(from, p);
      if (d <= off) { closest = p; segment = i; off = d; }
    }
    const needsRoute = changed || this.route?.status !== "route" || off > 6 || !segmentClear(from, closest, mode);
    if (changed || (needsRoute && (now - this.attempt >= 750 || distance(from, this.origin) > 6))) {
      this.attempt = now; this.origin = { ...from }; this.replans++;
      this.version++;
      const points = this.request ? [] : planRoute(from, destination, mode);
      this.path = points;
      this.route = { destination, mode, points, metres: routeMetres(points), status: this.request ? "planning" : points.length ? "route" : "unavailable" };
      if (this.request) this.request({ version: this.version, from: { x: from.x, z: from.z, y: from.y }, destination, mode });
    } else if (!needsRoute && this.route) {
      const arrival = previous[previous.length - 1];
      const remaining = distance(from, arrival) < 20 && segmentClear(from, arrival, mode) ? [arrival] : [closest, ...previous.slice(segment)];
      const points = [{ x: from.x, z: from.z, y: from.y ?? terrainHeight(from) }, ...remaining].filter((p, i, all) => !i || spatialDistance(p, all[i - 1]) > 0.01);
      this.route = { ...this.route, points, metres: routeMetres(points) };
    }
    return this.route;
  }
}
