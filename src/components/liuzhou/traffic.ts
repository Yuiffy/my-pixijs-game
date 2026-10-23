import { bridgeSurface } from "./bridges";
import { terrainHeight } from "./terrain";
import { canTraverse, distance, ROADS, type Point } from "./world";

type Pose = Point & { angle: number; y: number };
export type TrafficRoute = {
  id: string;
  name: string;
  points: Point[];
  lengths: number[];
  length: number;
};
export type TrafficCar = Pose & {
  id: string;
  kind: "car";
  y: number;
  color: string;
  route: string;
  progress: number;
  speed: number;
  cruise: number;
  odometer: number;
  braking: boolean;
  steering: number;
  waiting: "行人" | "前车" | "路口让行" | null;
};
export type RoadObstacle = Point & { radius: number; person?: boolean; y?: number };

// These are fictional circulation routes over imported OSM geometry. They do
// not describe current traffic regulations or measured traffic in Liuzhou.
function way(id: string, reverse = false, from?: Point, to?: Point): Point[] {
  const points = [...ROADS.find((r) => r.id === id)!.points];
  if (reverse) points.reverse();
  const start = from ? points.findIndex((p) => distance(p, from) < 0.1) : 0;
  const end = to ? points.findIndex((p) => distance(p, to) < 0.1) + 1 : points.length;
  if (start < 0 || end <= start) throw new Error(`Invalid traffic way ${id}`);
  return points.slice(start, end);
}
function makeRoute(id: string, name: string, parts: Point[][], reverse = false): TrafficRoute {
  let center = parts.flat().filter((p, i, all) => !i || distance(p, all[i - 1]) > 0.1);
  if (distance(center[0], center[center.length - 1]) < 0.1) center.pop();
  if (reverse) center = center.reverse();
  // Offset each circulation direction into its own lane; clamp mitres at bends.
  const lane = center.map((p, i) => {
    const a = center[(i + center.length - 1) % center.length];
    const b = center[(i + 1) % center.length];
    const before = distance(a, p); const after = distance(p, b);
    const nx = -(p.z - a.z) / before - (b.z - p.z) / after;
    const nz = (p.x - a.x) / before + (b.x - p.x) / after;
    const scale = 2.15 / Math.max(0.75, Math.hypot(nx, nz));
    return { x: p.x + nx * scale, z: p.z + nz * scale };
  });
  // Small quadratic fillets keep steering continuous through street corners.
  const points: Point[] = [];
  lane.forEach((p, i) => {
    const a = lane[(i + lane.length - 1) % lane.length];
    const b = lane[(i + 1) % lane.length];
    const radius = Math.min(4, distance(a, p) * 0.25, distance(p, b) * 0.25);
    const before = radius / distance(a, p); const after = radius / distance(b, p);
    const enter = { x: p.x + (a.x - p.x) * before, z: p.z + (a.z - p.z) * before };
    const exit = { x: p.x + (b.x - p.x) * after, z: p.z + (b.z - p.z) * after };
    for (let k = 0; k <= 5; k++) {
      const t = k / 5; const u = 1 - t;
      points.push({ x: u * u * enter.x + 2 * u * t * p.x + t * t * exit.x, z: u * u * enter.z + 2 * u * t * p.z + t * t * exit.z });
    }
  });
  const lengths = points.map((p, i) => distance(p, points[(i + 1) % points.length]));
  return { id, name, points, lengths, length: lengths.reduce((sum, n) => sum + n, 0) };
}
const oldTown = [way("196166774"), way("205513954"), way("205650886"), way("205650894")];
const bridge = [
  way("195918702"), way("370553228", false, undefined, { x: 289.7, z: 938.29 }),
  [{ x: 300.5, z: 958 }, { x: 312.29, z: 952.79 }],
  way("195921844", false, { x: 312.29, z: 952.79 }),
  way("583908579"), way("583908582", false, undefined, { x: 50.85, z: -120.5 }),
  way("205650897", true, undefined, { x: 36.72, z: -118.88 }),
  way("627315952", false, { x: 36.72, z: -118.88 }),
];
export const TRAFFIC_ROUTES = [
  makeRoute("old-town-clockwise", "罗池路—曙光东路", oldTown),
  makeRoute("old-town-return", "曙光东路—罗池路", oldTown, true),
  makeRoute("bridge-circuit", "文惠双桥—南岸", bridge),
];
export function trafficPose(route: TrafficRoute, progress: number): Pose {
  let s = ((progress % route.length) + route.length) % route.length;
  for (let i = 0; i < route.points.length; i++) {
    if (s <= route.lengths[i] || i === route.points.length - 1) {
      const a = route.points[i]; const b = route.points[(i + 1) % route.points.length];
      const t = s / (route.lengths[i] || 1);
      const p = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
      const surface = route.id === "bridge-circuit" ? bridgeSurface(p) : undefined;
      return { ...p, y: surface?.y ?? terrainHeight(p), angle: Math.atan2(b.x - a.x, b.z - a.z) };
    }
    s -= route.lengths[i];
  }
  throw new Error("Traffic route has no points");
}
export function createTraffic(obstacles: RoadObstacle[] = []): TrafficCar[] {
  return TRAFFIC_ROUTES.flatMap((route, ri) => Array.from({ length: ri === 2 ? 3 : 2 }, (_, i) => {
    let progress = route.length * ((i + 0.27) / (ri === 2 ? 3 : 2));
    let pose = trafficPose(route, progress);
    // Ambient cars start away from the restored player and parked vehicles.
    // This adjustment only runs at creation/load, never during active play.
    for (let attempt = 0; attempt < 100; attempt++) {
      const candidate = pose;
      if (!obstacles.some((o) => distance(candidate, o) < o.radius + 5)) break;
      progress = (progress + 12) % route.length;
      pose = trafficPose(route, progress);
    }
    return {
      ...pose,
      id: `city-car-${ri}-${i}`,
      kind: "car" as const,
      color: ["#b8d1c4", "#cf9a75", "#ddd6bd", "#8babb8"][(ri + i) % 4],
      route: route.id,
      progress,
      speed: 0,
      cruise: ri === 2 ? 9 : 6.5,
      odometer: 0,
      braking: false,
      steering: 0,
      waiting: null,
    };
  }));
}
function obstacleGap(route: TrafficRoute, progress: number, range: number, obstacle: RoadObstacle) {
  // A swept look-ahead follows bends, rather than projecting through buildings.
  for (let s = 0; s <= range; s += 0.7) {
    const p = trafficPose(route, progress + s);
    if (Math.abs(p.y - (obstacle.y ?? terrainHeight(obstacle))) < 2.2 && distance(p, obstacle) < obstacle.radius + 1.25) return s;
  }
  return Infinity;
}
export function stepTraffic(cars: TrafficCar[], obstacles: RoadObstacle[], dt: number) {
  const snapshot = cars.map((c) => ({ ...c }));
  for (const car of cars) {
    const route = TRAFFIC_ROUTES.find((r) => r.id === car.route)!;
    const ahead = trafficPose(route, car.progress + 5);
    const bend = Math.atan2(Math.sin(ahead.angle - car.angle), Math.cos(ahead.angle - car.angle));
    car.steering = Math.max(-1, Math.min(1, bend));
    let wanted = car.cruise * Math.max(0.45, Math.cos(bend)); car.waiting = null;
    const look = (car.speed * car.speed) / 8 + 10;
    for (const obstacle of [...obstacles, ...snapshot.filter((c) => c.id !== car.id).map((c) => ({ ...c, radius: 1.45 }))]) {
      if (distance(car, obstacle) > look + obstacle.radius + 2) continue;
      const gap = obstacleGap(route, car.progress, look, obstacle);
      const safe = Math.sqrt(Math.max(0, (gap - 2.5) * 7));
      if (safe < wanted) { wanted = safe; car.waiting = "person" in obstacle && obstacle.person ? "行人" : "前车"; }
    }
    // Stable ID priority resolves crossing approaches before either occupies the
    // conflict point. Queues still follow the actual position of the front car.
    for (const other of snapshot) {
      if (other.id >= car.id || distance(other, car) > 30) continue;
      const otherRoute = TRAFFIC_ROUTES.find((r) => r.id === other.route)!;
      for (const t of [0.5, 1, 1.5, 2]) {
        const p = trafficPose(route, car.progress + Math.max(2, car.speed) * t);
        const q = trafficPose(otherRoute, other.progress + Math.max(2, other.speed) * t);
        if (Math.abs(p.y - q.y) < 2.2 && distance(p, q) < 3.3 && Math.cos(p.angle - q.angle) < 0.6) {
          wanted = 0; car.waiting = "路口让行"; break;
        }
      }
    }
    const acceleration = wanted < car.speed ? 5.5 : 2;
    const nextSpeed = car.speed + Math.max(-acceleration * dt, Math.min(acceleration * dt, wanted - car.speed));
    car.braking = wanted < car.speed - 0.1 || wanted < 0.1;
    const moved = nextSpeed * dt;
    const pose = trafficPose(route, car.progress + moved);
    const clear = canTraverse(pose) && !obstacles.some((o) => Math.abs(pose.y - (o.y ?? terrainHeight(o))) < 2.2 && distance(pose, o) < o.radius + 1.15)
      && !cars.some((o) => o.id !== car.id && Math.abs(pose.y - o.y) < 2.2 && distance(pose, o) < 2.55);
    car.speed = clear ? nextSpeed : 0;
    if (clear) {
      car.progress = (car.progress + moved) % route.length;
      car.odometer += moved;
      Object.assign(car, pose);
    } else { car.braking = true; }
  }
}
