export type PlaceKind =
  | "post"
  | "bakery"
  | "clock"
  | "fountain"
  | "garden"
  | "tea"
  | "harbor"
  | "books"
  | "stairs";
export type Node = { id: number; x: number; z: number; floor: number };
export type Edge = { a: number; b: number; stair?: boolean; bridge?: boolean };
export type Place = {
  id: string;
  name: string;
  kind: PlaceKind;
  node: number;
  color: string;
  detail: string;
  symbol: string;
};
export type World = {
  seed: number;
  theme: "harbor" | "arcade" | "cave";
  nodes: Node[];
  edges: Edge[];
  places: Place[];
  start: number;
  size: number;
};
export const GAP = 18;
export const ROAD = 5.6;
export const roadWidth = (world: World) => (world.theme === "cave" ? 3.8 : ROAD);
export const FLOOR_HEIGHT = 7;
export const DIRECTIONS = [
  "北",
  "东北",
  "东",
  "东南",
  "南",
  "西南",
  "西",
  "西北",
];
export const wrap = (angle: number) => ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
export const direction = (angle: number) => DIRECTIONS[Math.round(wrap(angle) / (Math.PI / 4)) % 8];
export const bearing = (
  a: { x: number; z: number },
  b: { x: number; z: number },
) => wrap(Math.atan2(b.x - a.x, a.z - b.z));
export const edgeId = (a: number, b: number) => `${Math.min(a, b)}-${Math.max(a, b)}`;
export const distance = (
  a: { x: number; z: number },
  b: { x: number; z: number },
) => Math.hypot(a.x - b.x, a.z - b.z);
export function random(seed: number) {
  let s = Math.floor(seed) % 4294967296;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}
export function route(
  world: World,
  from: number,
  to: number,
  blocked: string[] = [],
): number[] {
  const queue = [from];
  const costs = new Map<number, number>([[from, 0]]);
  const previous = new Map<number, number>();
  const visited = new Set<number>();
  while (queue.length) {
    queue.sort((a, b) => costs.get(a)! - costs.get(b)!);
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    if (current === to) {
      const result = [to];
      while (result[0] !== from) result.unshift(previous.get(result[0])!);
      return result;
    }
    for (const edge of world.edges) {
      if (blocked.includes(edgeId(edge.a, edge.b))) continue;
      const next =
        edge.a === current ? edge.b : edge.b === current ? edge.a : -1;
      if (next < 0 || visited.has(next)) continue;
      const cost =
        costs.get(current)! +
        (edge.stair
          ? FLOOR_HEIGHT
          : distance(world.nodes[current], world.nodes[next]));
      if (cost < (costs.get(next) ?? Infinity)) {
        costs.set(next, cost);
        previous.set(next, current);
        queue.push(next);
      }
    }
  }
  return [];
}
export function pathLength(world: World, path: number[]) {
  return path
    .slice(1)
    .reduce(
      (sum, n, i) => sum +
        distance(world.nodes[n], world.nodes[path[i]]) +
        (world.nodes[n].floor !== world.nodes[path[i]].floor
          ? FLOOR_HEIGHT
          : 0),
      0,
    );
}
export function nearestNode(
  world: World,
  p: { x: number; z: number; floor: number },
) {
  return world.nodes
    .filter((n) => n.floor === p.floor)
    .sort((a, b) => distance(a, p) - distance(b, p))[0];
}
export function segmentDistance(p: { x: number; z: number }, a: Node, b: Node) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const t = Math.max(
    0,
    Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz)),
  );
  return Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t);
}
export function walkable(
  world: World,
  x: number,
  z: number,
  floor: number,
  blocked: string[] = [],
) {
  if (![x, z, floor].every(Number.isFinite)) return false;
  const p = { x, z };
  const width = roadWidth(world);
  // Block a physical barrier at the middle of the closed road, not the entire road.
  for (const e of world.edges) {
    if (e.stair || !blocked.includes(edgeId(e.a, e.b))) continue;
    const a = world.nodes[e.a];
    const b = world.nodes[e.b];
    if (a.floor !== floor) continue;
    const mx = (a.x + b.x) / 2;
    const mz = (a.z + b.z) / 2;
    const length = distance(a, b);
    const along = ((x - mx) * (b.x - a.x) + (z - mz) * (b.z - a.z)) / length;
    const across = ((x - mx) * (b.z - a.z) - (z - mz) * (b.x - a.x)) / length;
    if (Math.abs(across) < width && Math.abs(along) < (e.bridge ? 2.5 : 0.8)) return false;
  }
  if (
    world.nodes.some(
      (n) => n.floor === floor && distance(n, p) < width / 2 - 0.25,
    )
  ) return true;
  return world.edges.some(
    (e) => !e.stair &&
      world.nodes[e.a].floor === floor &&
      segmentDistance(p, world.nodes[e.a], world.nodes[e.b]) < width / 2 - 0.25,
  );
}
const definitions: [string, string, PlaceKind, string, string, string][] = [
  [
    "post",
    "风邮局",
    "post",
    "#bd563d",
    "红屋顶、燕尾旗。每封信的出发点。",
    "✉",
  ],
  [
    "bakery",
    "麦穗面包房",
    "bakery",
    "#dba34c",
    "条纹遮阳棚，门口有一只巨大的可颂。",
    "◒",
  ],
  [
    "clock",
    "蓝顶钟楼",
    "clock",
    "#398391",
    "越过屋顶也能看到的蓝色尖塔。",
    "◷",
  ],
  ["fountain", "鲸鱼喷泉", "fountain", "#558eaf", "蓝色鲸尾，圆形水池。", "≈"],
  ["garden", "玻璃花房", "garden", "#648b63", "三角玻璃顶，成排的绿树。", "♧"],
  ["tea", "月亮茶铺", "tea", "#ae7065", "粉色门面，屋顶挂着一弯月亮。", "☾"],
  ["harbor", "白帆码头", "harbor", "#548b9d", "白色三角帆，蓝色木平台。", "△"],
  [
    "books",
    "山丘书店",
    "books",
    "#907251",
    "层叠的书脊，门口一把阅读椅。",
    "▤",
  ],
];
export function makeWorld(
  seed = 31013,
  theme: World["theme"] = "harbor",
  remix = false,
): World {
  if (theme === "cave") return makeCave(seed);
  const rng = random(seed);
  const size = theme === "arcade" ? 3 : 4;
  const floors = theme === "arcade" ? 2 : 1;
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  for (let f = 0; f < floors; f++) for (let row = 0; row < size; row++) for (let col = 0; col < size; col++) {
        nodes.push({
          id: nodes.length,
          x: (col - (size - 1) / 2) * GAP,
          z: (row - (size - 1) / 2) * GAP,
          floor: f,
        });
      }
  for (const n of nodes) {
    const cell = n.id % (size * size);
    const row = Math.floor(cell / size);
    const col = cell % size;
    if (col < size - 1) edges.push({ a: n.id, b: n.id + 1 });
    if (row < size - 1) edges.push({ a: n.id, b: n.id + size });
  }
  if (theme === "arcade") edges.push({ a: 0, b: 9, stair: true }, { a: 8, b: 17, stair: true });
  const world: World = {
    seed,
    theme,
    nodes,
    edges,
    places: [],
    start: theme === "arcade" ? 6 : 12,
    size,
  };
  // Remove only edges that leave the complete network connected. Distinct seeds
  // change both topology and destinations; a daily run is not a relabelled route.
  if (remix) {
    for (let i = edges.length - 1; i >= 0; i--) {
      if (edges[i].stair || rng() > 0.32) continue;
      const [candidate] = edges.splice(i, 1);
      if (nodes.some((n) => route(world, world.start, n.id).length === 0)) edges.splice(i, 0, candidate);
    }
  } else if (theme === "harbor") {
    world.edges = edges.filter(
      (e) => !["0-1", "6-7", "1-2"].includes(edgeId(e.a, e.b)),
    );
  }
  const defaults =
    theme === "arcade"
      ? [6, 7, 4, 1, 11, 16, 8, 12]
      : [12, 9, 5, 6, 2, 3, 15, 0];
  if (remix) {
    const available = nodes
      .filter((n) => n.id !== world.start)
      .map((n) => n.id);
    for (let i = available.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [available[i], available[j]] = [available[j], available[i]];
    }
    defaults.splice(1, 7, ...available.slice(0, 7));
  }
  world.places = definitions.map(
    ([id, name, kind, color, detail, symbol], i) => ({
      id,
      name,
      kind,
      color,
      detail,
      symbol,
      node: defaults[i],
    }),
  );
  if (theme === "harbor" && !remix) {
    const bridge = world.edges.find((e) => edgeId(e.a, e.b) === "2-6");
    if (bridge) bridge.bridge = true;
  }
  return world;
}
function makeCave(seed: number): World {
  // Authored winding passages: loops, occluded turns and meaningful dead ends.
  // The same graph drives the map, rock walls and collision.
  const points = [
    [0, 32],
    [2, 24],
    [-5, 19],
    [-12, 14],
    [-10, 5],
    [-20, -1],
    [-27, 3],
    [-30, -7],
    [-20, -13],
    [-12, -11],
    [-6, -3],
    [0, 2],
    [9, 4],
    [16, -1],
    [20, -9],
    [30, -13],
    [33, -22],
    [22, -28],
    [11, -25],
    [5, -17],
    [-2, -19],
    [-7, -28],
    [-18, -30],
    [-28, -24],
    [-34, -18],
    [26, 9],
    [31, 16],
    [17, 17],
    [10, 24],
    [-21, 15],
    [-27, 20],
    [-5, 10],
    [4, -8],
  ];
  const pairs = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 4],
    [4, 5],
    [5, 6],
    [6, 7],
    [7, 8],
    [8, 9],
    [9, 10],
    [10, 4],
    [10, 11],
    [11, 12],
    [12, 13],
    [13, 14],
    [14, 15],
    [15, 16],
    [16, 17],
    [17, 18],
    [18, 19],
    [19, 20],
    [20, 9],
    [20, 21],
    [21, 22],
    [22, 23],
    [23, 8],
    [23, 24],
    [13, 25],
    [25, 26],
    [26, 27],
    [27, 28],
    [28, 1],
    [3, 29],
    [29, 30],
    [4, 31],
    [31, 2],
    [19, 32],
    [32, 11],
  ];
  const nodes = points.map(([x, z], id) => ({ id, x, z, floor: 0 }));
  const places: Place[] = [
    {
      id: "post",
      name: "洞口驿站",
      kind: "post",
      node: 0,
      color: "#bd7851",
      detail: "洞口的橙色提灯，回家的起点。",
      symbol: "✉",
    },
    {
      id: "crystal",
      name: "蓝晶岔口",
      kind: "garden",
      node: 4,
      color: "#5caaaa",
      detail: "蓝色晶簇在三条路之间闪光。",
      symbol: "◇",
    },
    {
      id: "pool",
      name: "地下水潭",
      kind: "fountain",
      node: 8,
      color: "#608eaf",
      detail: "转弯后才看得到的小水潭。",
      symbol: "≈",
    },
    {
      id: "roots",
      name: "垂根石厅",
      kind: "garden",
      node: 13,
      color: "#809669",
      detail: "洞顶垂下的树根，不要把左右支路记反。",
      symbol: "♧",
    },
    {
      id: "archive",
      name: "旧灯档案室",
      kind: "books",
      node: 17,
      color: "#b99357",
      detail: "琥珀灯下的一叠旧探险手记。",
      symbol: "▤",
    },
    {
      id: "echo",
      name: "回声石门",
      kind: "clock",
      node: 24,
      color: "#a0799c",
      detail: "紫色石门在弯曲的尽头。",
      symbol: "◎",
    },
    {
      id: "camp",
      name: "废弃营地",
      kind: "tea",
      node: 30,
      color: "#b16d58",
      detail: "这条短支路到营地就结束了，回头时看看入口。",
      symbol: "△",
    },
    {
      id: "bells",
      name: "风铃石柱",
      kind: "harbor",
      node: 27,
      color: "#94a3a8",
      detail: "南侧环路的一根银灰石柱。",
      symbol: "♩",
    },
  ];
  return {
    seed,
    theme: "cave",
    nodes,
    edges: pairs.map(([a, b]) => ({ a, b })),
    places,
    start: 0,
    size: 6,
  };
}
export const placeNode = (world: World, id: string) => world.nodes[world.places.find((p) => p.id === id)!.node];
export const floorName = (floor: number) => `${floor + 1}F`;
