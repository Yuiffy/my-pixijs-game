import type { Game, Point, Rect, Spot } from "./types";

export const BODY_RADIUS = 0.2;
export const SPOTS: Spot[] = [
  {
    id: "computer",
    label: "直播电脑",
    x: 4.5,
    z: -4.42,
    height: 1.3,
    reach: 1.65,
  },
  { id: "echo", label: "另一个岁己", x: 3.2, z: -2, height: 1.4, reach: 2 },
  { id: "fuse", label: "配电箱", x: -6.7, z: 3.3, height: 1.45 },
  { id: "fridge", label: "冰箱上的便签", x: -0.6, z: -4.94, height: 1.3 },
  {
    id: "tape-kitchen",
    label: "保温杯旁的录音",
    x: -2.3,
    z: -4.97,
    height: 1.12,
  },
  { id: "tape-shelf", label: "书架里的录音", x: -5.7, z: 4.53, height: 1.2 },
  { id: "tape-bedroom", label: "床头录音", x: 2.45, z: 4.49, height: 0.85 },
  {
    id: "notebook",
    label: "收工手记",
    x: -3.6,
    z: -0.6,
    height: 0.59,
    reach: 1.5,
  },
  { id: "mirror", label: "没有倒影的镜子", x: 6.62, z: 1.6, height: 1.4 },
  { id: "entry", label: "公寓门", x: -3, z: 5.78, height: 1.35, reach: 1.7 },
  { id: "clock", label: "时钟之门", x: -4.02, z: 8.1, height: 1.5 },
  { id: "portrait", label: "名字之门", x: -1.98, z: 11.7, height: 1.5 },
  { id: "radio", label: "声音之门", x: -4.02, z: 15.3, height: 1.5 },
  { id: "exit", label: "走廊尽头", x: -3, z: 17.75, height: 1.4 },
  { id: "hide", label: "躲在衣柜里", x: 2, z: 1.3, height: 1.3, reach: 1.4 },
];

export const OBSTACLES: Rect[] = [
  { id: "west-wall", x: -7, z: 0, w: 0.18, d: 12.2 },
  { id: "east-wall", x: 7, z: 0, w: 0.18, d: 12.2 },
  { id: "north-wall", x: 0, z: -6, w: 14.3, d: 0.18 },
  { id: "south-west", x: -5.55, z: 6, w: 2.9, d: 0.18 },
  { id: "south-east", x: 2.45, z: 6, w: 9.1, d: 0.18 },
  { id: "partition-north", x: 1, z: -4.8, w: 0.14, d: 2.4 },
  { id: "partition-mid", x: 1, z: -0.2, w: 0.14, d: 1.6 },
  { id: "partition-bed", x: 1, z: 1.45, w: 0.14, d: 1.1 },
  { id: "partition-south", x: 1, z: 4.8, w: 0.14, d: 2.4 },
  { id: "room-wall", x: 4, z: 0, w: 6, d: 0.15 },
  { id: "sofa", x: -5.5, z: -0.6, w: 1.35, d: 3.45 },
  { id: "coffee-table", x: -3.5, z: -0.6, w: 1.55, d: 1.05 },
  { id: "kitchen", x: -3.8, z: -5.4, w: 4.9, d: 1 },
  { id: "fridge", x: -0.4, z: -5.45, w: 1, d: 0.9 },
  { id: "shelf", x: -5.6, z: 4.8, w: 2.2, d: 0.45 },
  { id: "entry-chest", x: -0.6, z: 4.8, w: 1.4, d: 0.55 },
  { id: "desk", x: 4.4, z: -4.7, w: 3.6, d: 0.85 },
  { id: "chair", x: 4.5, z: -3.55, w: 0.63, d: 0.72 },
  { id: "bed", x: 4.6, z: 3.8, w: 3, d: 3.3 },
  { id: "bedside", x: 2.45, z: 4.8, w: 0.7, d: 0.65 },
  { id: "wardrobe", x: 2, z: 0.55, w: 1.3, d: 0.6 },
  { id: "lamp", x: -4.3, z: 1.7, w: 0.32, d: 0.32 },
  { id: "plant-living", x: -6, z: 2, w: 0.45, d: 0.45 },
  { id: "plant-studio", x: 6.3, z: -1.3, w: 0.45, d: 0.45 },
  { id: "hall-left", x: -4.2, z: 12, w: 0.18, d: 12 },
  { id: "hall-right", x: -1.8, z: 12, w: 0.18, d: 12 },
  { id: "hall-end", x: -3, z: 18, w: 2.42, d: 0.15 },
];

export const corridorOpen = (g: Game) => ["corridor", "chase", "choice", "dawn"].includes(g.stage);
export const rects = (g: Game): Rect[] => (corridorOpen(g)
    ? OBSTACLES
    : [...OBSTACLES, { id: "entry-door", x: -3, z: 6, w: 2.2, d: 0.12 }]);

export function walkable(p: Point, g: Game, radius = BODY_RADIUS) {
  const indoors =
    p.x > -6.9 + radius &&
    p.x < 6.9 - radius &&
    p.z > -5.9 + radius &&
    p.z < 5.9 - radius;
  const hall =
    corridorOpen(g) &&
    p.x > -4.1 + radius &&
    p.x < -1.9 - radius &&
    p.z >= 5.5 &&
    p.z < 17.9 - radius;
  if (!indoors && !hall) return false;
  return !rects(g).some(
    (r) => Math.abs(p.x - r.x) < r.w / 2 + radius &&
      Math.abs(p.z - r.z) < r.d / 2 + radius,
  );
}

export function move(p: Point, dx: number, dz: number, g: Game) {
  if (walkable({ x: p.x + dx, z: p.z }, g)) p.x += dx;
  if (walkable({ x: p.x, z: p.z + dz }, g)) p.z += dz;
}

export function clearLine(
  a: Point,
  b: Point,
  g: Game,
  radius = 0,
  wallsOnly = false,
) {
  const distance = Math.hypot(b.x - a.x, b.z - a.z);
  for (let i = 1; i < Math.ceil(distance / 0.09); i++) {
    const t = i / Math.ceil(distance / 0.09);
    const p = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
    if (
      rects(g).some(
        (r) => (!wallsOnly || /wall|partition|south-|entry-door/.test(r.id)) &&
          Math.abs(p.x - r.x) < r.w / 2 + radius &&
          Math.abs(p.z - r.z) < r.d / 2 + radius,
      )
    ) return false;
  }
  return true;
}

// The echo uses the same footprint and doors as the player. A* runs only
// when the target changes, never by walking directly through room partitions.
export function findPath(a: Point, b: Point, g: Game): Point[] {
  const unit = 0.4;
  const key = (p: Point) => `${Math.round(p.x / unit)},${Math.round(p.z / unit)}`;
  const origin = {
    x: Math.round(a.x / unit) * unit,
    z: Math.round(a.z / unit) * unit,
  };
  const target = {
    x: Math.round(b.x / unit) * unit,
    z: Math.round(b.z / unit) * unit,
  };
  if (clearLine(a, b, g, BODY_RADIUS)) return [b];
  const open = [{ p: origin, score: 0 }];
  const parent = new Map<string, Point>();
  const costs = new Map<string, number>([[key(origin), 0]]);
  const closed = new Set<string>();
  for (let count = 0; open.length && count < 1800; count++) {
    open.sort((v, w) => v.score - w.score);
    const current = open.shift()!.p;
    const id = key(current);
    if (closed.has(id)) continue;
    closed.add(id);
    if (Math.hypot(current.x - target.x, current.z - target.z) < 0.5) {
      const path = [current];
      let previous = parent.get(id);
      while (previous && path.length < 1800) {
        path.unshift(previous);
        previous = parent.get(key(previous));
      }
      path.shift();
      if (clearLine(path[path.length - 1] || a, b, g, BODY_RADIUS)) path.push(b);
      return path;
    }
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ]) {
      const next = { x: current.x + dx * unit, z: current.z + dz * unit };
      if (!walkable(next, g) || !clearLine(current, next, g, BODY_RADIUS)) continue;
      const nextId = key(next);
      const cost = (costs.get(id) || 0) + Math.hypot(dx, dz);
      if (cost >= (costs.get(nextId) ?? Infinity)) continue;
      costs.set(nextId, cost);
      parent.set(nextId, current);
      open.push({
        p: next,
        score: cost + Math.hypot(next.x - target.x, next.z - target.z) / unit,
      });
    }
  }
  return [];
}

export function activeSpots(g: Game) {
  return SPOTS.filter((s) => {
    if (s.id === "echo") return ["home", "memories", "choice"].includes(g.stage);
    if (s.id === "hide") return g.stage === "chase";
    if (["clock", "portrait", "radio", "exit"].includes(s.id)) return g.stage === "corridor";
    if (s.id.startsWith("tape-")) return g.stage === "memories" && !g.tapes.includes(s.id);
    if (s.id === "mirror") return g.stage === "chase" && !g.sources.includes("mirror");
    if (s.id === "fuse") return (
        g.stage === "power" ||
        (g.stage === "chase" && !g.sources.includes("fuse"))
      );
    if (s.id === "computer") return (
        ["home", "memories", "choice"].includes(g.stage) ||
        (g.stage === "chase" && !g.sources.includes("computer"))
      );
    if (s.id === "fridge") return !g.notes.includes("power-note");
    if (s.id === "notebook") return !g.notes.includes("diary");
    return s.id === "entry";
  }).map((s) => (s.id === "echo" ? { ...s, x: g.echo.x, z: g.echo.z } : s));
}

export function focusedSpot(g: Game) {
  if (g.hidden || g.mode !== "playing" || g.panel !== "none") return null;
  const forward = { x: -Math.sin(g.player.yaw), z: -Math.cos(g.player.yaw) };
  let best: Spot | null = null;
  let score = -Infinity;
  for (const s of activeSpots(g)) {
    const dx = s.x - g.player.x;
    const dz = s.z - g.player.z;
    const distance = Math.hypot(dx, dz);
    const alignment =
      (dx * forward.x + dz * forward.z) / Math.max(0.01, distance);
    // A generous vertical tolerance keeps desk-height items usable without
    // requiring precision aiming on a phone. Facing and wall visibility count.
    if (
      distance > (s.reach || 1.3) ||
      alignment < 0.68 ||
      !clearLine(g.player, s, g, 0, true)
    ) continue;
    if (alignment - distance * 0.06 > score) {
      best = s;
      score = alignment - distance * 0.06;
    }
  }
  return best;
}
