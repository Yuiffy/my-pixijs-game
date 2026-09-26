export type Position = { x: number; y: number };
export type Obstacle = {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

// Simulation units are centimetre-like legacy units: 70 units = one world metre.
// These same footprints build the 3D furniture and constrain the player's body.
export const SCALE = 70;
export const BODY_RADIUS = 10;
export const FURNITURE: Obstacle[] = [
  { name: "kitchen", x: 365, y: 133, w: 110, h: 50 },
  { name: "sofa", x: 109, y: 270, w: 211, h: 82 },
  { name: "coffee", x: 335, y: 351, w: 63, h: 54 },
  { name: "desk", x: 108, y: 125, w: 195, h: 54 },
  { name: "studioDesk", x: 622, y: 175, w: 255, h: 82 },
  { name: "chair", x: 721, y: 270, w: 46, h: 39 },
  { name: "bed", x: 700, y: 380, w: 186, h: 80 },
  { name: "drawer", x: 800, y: 463, w: 56, h: 21 },
  { name: "entryTable", x: 75, y: 449, w: 42, h: 30 },
  { name: "plant", x: 435, y: 257, w: 34, h: 35 },
  { name: "studioPlant", x: 861, y: 319, w: 32, h: 32 },
];
export function obstacles(closed: boolean): Obstacle[] {
  return [
    ...FURNITURE,
    { name: "wall", x: 506, y: 115, w: 28, h: 260 },
    { name: "wall", x: 506, y: 448, w: 28, h: 84 },
    closed
      ? { name: "door", x: 509, y: 375, w: 18, h: 73 }
      : { name: "openDoor", x: 521, y: 366, w: 66, h: 10 },
  ];
}
export function walkable(
  p: Position,
  closed: boolean,
  padding = BODY_RADIUS,
): boolean {
  if (p.x < 64 || p.x > 895 || p.y < 125 || p.y > 516) return false;
  return !obstacles(closed).some(
    (o) => p.x > o.x - padding &&
      p.x < o.x + o.w + padding &&
      p.y > o.y - padding &&
      p.y < o.y + o.h + padding,
  );
}
export function clearSegment(
  a: Position,
  b: Position,
  closed: boolean,
  padding = BODY_RADIUS,
): boolean {
  const steps = Math.ceil(Math.hypot(a.x - b.x, a.y - b.y) / 4);
  for (let i = 1; i <= steps; i++) if (
      !walkable(
        {
          x: a.x + ((b.x - a.x) * i) / steps,
          y: a.y + ((b.y - a.y) * i) / steps,
        },
        closed,
        padding,
      )
    ) return false;
  return true;
}
export function moveBody(
  from: Position,
  to: Position,
  closed: boolean,
): Position {
  const allowed = (a: Position, b: Position) => clearSegment(a, b, closed) || escapesDoor(a, b, closed);
  if (allowed(from, to)) return to;
  const horizontal = { x: to.x, y: from.y };
  const moved = allowed(from, horizontal) ? horizontal : from;
  const vertical = { x: moved.x, y: to.y };
  return allowed(moved, vertical) ? vertical : moved;
}
/** Recover an existing overlap by walking out, never by crossing through a door or wall. */
function escapesDoor(from: Position, to: Position, closed: boolean): boolean {
  const depth = (p: Position, o: Obstacle) => Math.max(0, Math.min(p.x - o.x + BODY_RADIUS, o.x + o.w + BODY_RADIUS - p.x, p.y - o.y + BODY_RADIUS, o.y + o.h + BODY_RADIUS - p.y));
  const all = obstacles(closed);
  const initial = all.filter(o => depth(from, o) > 0);
  if (!initial.length || initial.some(o => o.name !== 'door' && o.name !== 'openDoor')) return false;
  let previous = initial.reduce((sum, o) => sum + depth(from, o), 0);
  const start = previous;
  const steps = Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 2);
  for (let i = 1; i <= steps; i++) {
    const p = { x: from.x + (to.x - from.x) * (i / steps), y: from.y + (to.y - from.y) * (i / steps) };
    if (p.x < 64 || p.x > 895 || p.y < 125 || p.y > 516) return false;
    if (all.some(o => !initial.includes(o) && depth(p, o) > 0)) return false;
    const next = initial.reduce((sum, o) => sum + depth(p, o), 0);
    if (next > previous + 0.000001) return false;
    previous = next;
  }
  return previous < start;
}
export function route(
  from: Position,
  to: Position,
  closed: boolean,
): Position[] {
  const clear = (a: Position, b: Position) => clearSegment(a, b, closed, BODY_RADIUS + 3);
  if (!walkable(to, closed, BODY_RADIUS + 3)) return [];
  if (clear(from, to)) return [{ ...to }];
  const cols = 84;
  const rows = 40;
  const cell = (id: number) => ({
    x: 64 + (id % cols) * 10,
    y: 125 + Math.floor(id / cols) * 10,
  });
  const index = (p: Position) => Math.max(0, Math.min(cols - 1, Math.round((p.x - 64) / 10))) +
    cols * Math.max(0, Math.min(rows - 1, Math.round((p.y - 125) / 10)));
  const nearestCell = (p: Position) => {
    const center = index(p);
    for (let radius = 0; radius < 8; radius++) for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
          const id = center + dy * cols + dx;
          if (
            id >= 0 &&
            id < cols * rows &&
            walkable(cell(id), closed, BODY_RADIUS + 3) &&
            clear(p, cell(id))
          ) return id;
        }
    return -1;
  };
  const start = nearestCell(from);
  const end = nearestCell(to);
  if (start < 0 || end < 0) return [];
  const open = new Set([start]);
  const visited = new Set<number>();
  const parent = new Map<number, number>();
  const g = new Map([[start, 0]]);
  const heuristic = (id: number) => Math.hypot(cell(id).x - to.x, cell(id).y - to.y);
  while (open.size) {
    let current = -1;
    let best = Infinity;
    for (const id of Array.from(open)) {
      const score = (g.get(id) || 0) + heuristic(id);
      if (score < best) {
        best = score;
        current = id;
      }
    }
    if (current === end) {
      const points: Position[] = [{ ...to }];
      for (let id = end; id !== start; id = parent.get(id) ?? start) points.unshift(cell(id));
      points.unshift(cell(start));
      const smooth: Position[] = [];
      let at = from;
      let i = 0;
      while (i < points.length) {
        let furthest = i;
        for (let j = i + 1; j < points.length; j++) {
          if (!clear(at, points[j])) break;
          furthest = j;
        }
        at = points[furthest];
        smooth.push(at);
        i = furthest + 1;
      }
      return smooth;
    }
    open.delete(current);
    visited.add(current);
    const cx = current % cols;
    const cy = Math.floor(current / cols);
    for (const [dx, dy] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ]) {
      if (cx + dx < 0 || cx + dx >= cols || cy + dy < 0 || cy + dy >= rows) continue;
      const next = current + dx + dy * cols;
      if (visited.has(next) || !clear(cell(current), cell(next))) continue;
      const cost = (g.get(current) || 0) + Math.hypot(dx, dy) * 10;
      if (cost < (g.get(next) ?? Infinity)) {
        g.set(next, cost);
        parent.set(next, current);
        open.add(next);
      }
    }
  }
  return [];
}
export const worldPoint = (p: Position): [number, number] => [
  (p.x - 480) / SCALE,
  (p.y - 320) / SCALE,
];
