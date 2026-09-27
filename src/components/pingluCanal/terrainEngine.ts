/** Discrete earthworks over an attributed DEM/OSM regional map. */
import { basinAt, bedLevel, END, GEOGRAPHY, inside, isPort, lockCells, LOCKS, MAP_H, MAP_W, naturalRivers, Point, START, tileId, waterLevel, xy } from './geography';

export { bedLevel, GEOGRAPHY, isPort, lockCells, LOCKS, MAP_H, MAP_W, START, END, waterLevel, xy, tileId } from './geography';
export type { Point } from './geography';

export const TILE_METRES = 1600; // Approximate regional spacing; navigation width is exaggerated.
export const TARGET_BED = -3;
export const CHANNEL_WIDTH = 3;
export const TURN_RADIUS = 3;
export const MAX_CELLS = 16;
export const PILE_CAPACITY = 240;
export const AUTO_FILL_RADIUS = 4;
export const PLAYER_COLORS = ['#d57b3f', '#438eb3', '#9882bb', '#c4a24b'];

export type Tool = 'dig' | 'blast' | 'dredge' | 'haul';
export interface Soil { source: number; level: number; amount: number }
export interface Plot {
  initial: number; height: number; rock: boolean; farm: boolean; fillTarget?: number; naturalWater?: boolean;
  cuts: Record<string, number>; fill: { player: number; source: number; level: number }[];
}
export interface Contractor {
  id: number; name: string; ai: boolean; cash: number; spent: number;
  piles: Record<number, Soil[]>; style: 'river' | 'shortcut' | 'balanced';
  haulTarget?: number;
}
export interface TerrainAction { tool: Tool | 'fund' | 'dispose' | 'pass' | 'lock'; cells: number[]; source?: number; sources?: number[] }
export interface Delivery { source: number; target: number; units: number }
export interface WorkEvent {
  id: number; player: number; tool: TerrainAction['tool']; cells: number[]; from?: number;
  units: number; cost: number; message: string;
  deliveries?: Delivery[];
}
export interface TerrainGame {
  version: 3; locks: (number | null)[]; seed: number; round: number; turn: number; moves: number; limit: number;
  finishRound: number | null; finished: boolean; sandbox: boolean;
  plots: Plot[]; players: Contractor[]; events: WorkEvent[];
  order?: number[];
}
export interface Quote { cells: number[]; units: number; cost: number; error: string | null; depths: Record<number, number>; deliveries?: Delivery[] }
export interface Route { points: Point[]; cells: number[]; length: number; remaining: number; blocked: number[] }
export interface Survey { route: Route | null; proposal: Route; wet: boolean[] }
export const tileName = (id: number) => { const [x, z] = xy(id); return `R${z + 1}·C${x + 1}`; };
const DIRECTIONS: Point[] = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const HEADINGS: Point[] = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
export const reclamationLevel = (plot: Plot) => plot.fillTarget ?? 1;

export function createTerrain(humans = 1, ais = 0, seed = 1, sandbox = false): TerrainGame {
  const humanCount = Math.max(0, Math.min(4, Math.floor(humans)));
  const count = Math.max(1, humanCount + Math.max(0, Math.min(4 - humanCount, Math.floor(ais))));
  const elevations = GEOGRAPHY.elevation.map(e => Math.max(-3, Math.round(e / 5)));
  const plots = elevations.map((elevation, id): Plot => {
    const [x, z] = xy(id); const level = waterLevel(id); const river = naturalRivers[id];
    const naturalWater = river.distance < (river.name === '郁江' ? 1.05 : 0.62) || (z >= 58 && elevation <= 0) || isPort(id);
    let height = elevation;
    if (naturalWater) height = level - (isPort(id) ? 3 : 1 + (id % 3 === 0 ? 1 : 0));
    // Local dry depressions, derived from neighbouring DEM samples, are optional reclamation sites.
    const neighbours = DIRECTIONS.map(([dx, dz]) => (inside(x + dx * 2, z + dz * 2) ? elevations[tileId(x + dx * 2, z + dz * 2)] : elevation)).sort((a, b) => a - b);
    const fillTarget = Math.min(height + 3, neighbours[2]);
    const farm = !naturalWater && river.distance > 1.7 && height >= level && height < level + 10 && fillTarget > height && !LOCKS.some(l => Math.hypot(x - l.at[0], z - l.at[1]) < 4);
    return { initial: height, height, rock: height > level + 4, farm, fillTarget, naturalWater, cuts: {}, fill: [] };
  });
  const game: TerrainGame = {
    version: 3,
locks: LOCKS.map(() => null),
seed,
round: 1,
turn: 0,
order: groupedTurnOrder(1, count),
moves: 0,
limit: count === 1 ? 100 : 72,
    finishRound: null,
finished: false,
sandbox: sandbox && count === 1 && humanCount === 1,
plots,
    players: Array.from({ length: count }, (_, id) => ({
      id,
name: id < humanCount ? (humanCount === 1 ? '你的工程局' : `工程局 ${id + 1}`) : ['山海建设', '青岚工程', '江湾建设', '南岭工程'][id - humanCount],
      ai: id >= humanCount,
cash: 360,
spent: 0,
piles: {},
style: (['river', 'shortcut', 'balanced'] as const)[id % 3],
    })),
events: [],
  };
  // Retain one excavatable corridor even if all optional fields are reclaimed.
  // This reserves land from filling, without excavating it or prescribing the final route.
  findRoute(game, true)?.cells.forEach(id => { game.plots[id].farm = false; });
  return game;
}
function groupedTurnOrder(round: number, count: number) {
  return Array.from({ length: count }, (_, index) => (index + round - 1) % count).flatMap(id => [id, id, id]);
}
export const turnOrder = (game: TerrainGame) => game.order ?? groupedTurnOrder(game.round, game.players.length);
export const currentPlayer = (game: TerrainGame) => game.players[turnOrder(game)[game.turn] ?? 0];
export const pileSize = (player: Contractor, source?: number) => (source === undefined ? Object.values(player.piles).flat() : player.piles[source] ?? []).reduce((sum, s) => sum + s.amount, 0);

/** Each impounded reach floods from its own natural rivers; lock boundaries retain the level. */
export function waterMask(plots: Plot[]): boolean[] {
  const wet = plots.map(() => false);
  const queue: number[] = [];
  plots.forEach((p, id) => { if (p.naturalWater && p.height < waterLevel(id)) { wet[id] = true; queue.push(id); } });
  for (let i = 0; i < queue.length; i++) {
    const [x, z] = xy(queue[i]);
    DIRECTIONS.forEach(([dx, dz]) => {
      const next = tileId(x + dx, z + dz);
      if (inside(x + dx, z + dz) && !wet[next] && basinAt(next) === basinAt(queue[i]) && plots[next].height < waterLevel(next)) { wet[next] = true; queue.push(next); }
    });
  }
  return wet;
}

/** Trucks use dry ground, charging for distance and climbs. Stock sits on the nearest bank. */
function truckNetwork(game: TerrainGame, source: number, wet: boolean[], destination?: number) {
  const [sx, sz] = xy(source);
  const banks = game.plots.map((p, id) => id).filter(id => !wet[id]);
  banks.sort((a, b) => Math.hypot(xy(a)[0] - sx, xy(a)[1] - sz) - Math.hypot(xy(b)[0] - sx, xy(b)[1] - sz));
  const start = wet[source] ? banks[0] : source;
  const cost = new Float64Array(game.plots.length).fill(Infinity);
  const parents = new Int32Array(game.plots.length).fill(-1);
  if (start === undefined || (destination !== undefined && wet[destination])) return { start, cost, parents };
  const queue = new MinHeap(); cost[start] = 0; queue.push(start, 0);
  while (queue.values.length) {
    const top = queue.pop(); if (top.cost > cost[top.key]) continue;
    if (top.key === destination) break;
    const [x, z] = xy(top.key);
    DIRECTIONS.forEach(([dx, dz]) => {
      if (!inside(x + dx, z + dz)) return;
      const next = tileId(x + dx, z + dz); if (wet[next]) return;
      const candidate = top.cost + 1 + Math.abs(game.plots[next].height - game.plots[top.key].height) * 0.4;
      if (candidate < cost[next]) { cost[next] = candidate; parents[next] = top.key; queue.push(next, candidate); }
    });
  }
  return { start, cost, parents };
}
export function truckRoute(game: TerrainGame, source: number, destination: number): number[] {
  const { start, cost, parents } = truckNetwork(game, source, waterMask(game.plots), destination);
  if (start === undefined || !Number.isFinite(cost[destination])) return [];
  const path = [destination]; let at = destination;
  while (at !== start) { at = parents[at]; path.push(at); }
  return path.reverse();
}

export interface HaulPlan { action: TerrainAction | null; quote: Quote | null; reason: string }
/** Pool small piles into one crew action. Range is strict only for a player-pinned destination. */
export function* planAutoHaulSteps(game: TerrainGame): Generator<void, HaulPlan> {
  const player = currentPlayer(game);
  const none = (reason: string): HaulPlan => ({ action: null, quote: null, reason });
  if (game.finished) return none('工程已结算');
  if (!pileSize(player)) return none('没有待运土方，先开挖或爆破');
  const wet = waterMask(game.plots);
  const target = player.haulTarget;
  const separation = (a: number, b: number) => Math.hypot(xy(a)[0] - xy(b)[0], xy(a)[1] - xy(b)[1]);
  const eligible = game.plots.flatMap((p, id) => (p.farm && !Object.keys(p.cuts).length && !isPort(id) && !wet[id] && p.height < reclamationLevel(p)
    && (target === undefined || separation(id, target) <= AUTO_FILL_RADIUS) ? [id] : []));
  if (!eligible.length) return none(target === undefined ? '没有可回填洼地' : '指定点附近已填满或无可填洼地，请改选位置');
  const sources = Object.keys(player.piles).map(Number).filter(id => pileSize(player, id) > 0);
  const costs = new Map<number, number>();
  const regions = new Map<number, number>();
  const regionStock = new Map<number, number>();
  for (const source of sources) {
    yield;
    const network = truckNetwork(game, source, wet);
    const region = eligible.find(id => Number.isFinite(network.cost[id]));
    if (region === undefined) continue;
    regionStock.set(region, (regionStock.get(region) ?? 0) + pileSize(player, source));
    eligible.forEach(id => {
      if (!Number.isFinite(network.cost[id])) return;
      regions.set(id, region); costs.set(id, Math.min(costs.get(id) ?? Infinity, network.cost[id]));
    });
  }
  const reachable = eligible.filter(id => costs.has(id)).sort((a, b) => (target === undefined ? costs.get(a)! - costs.get(b)! : separation(a, target) - separation(b, target)) || a - b);
  if (!reachable.length) return none('运土陆路不通，请改选填土位置');
  // Expand beyond the nearest tiny pit until the crew has enough receiving capacity.
  const cells: number[] = []; let capacity = 0;
  const reserved = new Map<number, number>();
  for (const id of reachable) {
    const region = regions.get(id)!;
    const amount = Math.min(reclamationLevel(game.plots[id]) - game.plots[id].height, regionStock.get(region)! - (reserved.get(region) ?? 0));
    if (amount <= 0) continue;
    cells.push(id); capacity += amount; reserved.set(region, (reserved.get(region) ?? 0) + amount);
    if (capacity >= 24 || cells.length >= MAX_CELLS) break;
  }
  const action: TerrainAction = { tool: 'haul', cells, sources };
  const search = quoteTerrainSteps(game, action); let result = search.next();
  while (!result.done) { yield; result = search.next(); }
  const quote = result.value;
  const reason = quote.units < 24 ? `本次可运 ${quote.units} / 24 方：受可达库存、可填容量或 16 格施工上限限制` : '';
  return quote.error ? { action: null, quote, reason: quote.error } : { action, quote, reason };
}
export function planAutoHaul(game: TerrainGame): HaulPlan {
  return completeSteps(planAutoHaulSteps(game));
}

interface Edge { to: number; points: Point[]; cells: number[]; length: number }
const graph = new Map<number, Edge[]>();
const node = (x: number, z: number, direction: number) => (tileId(x, z) * 8) + direction;
/** Conservative swept disc: every terrain square touched by the hull must be dredged. */
function footprint(points: Point[]): number[] | null {
  const cells = new Set<number>();
  const radius = CHANNEL_WIDTH / 2;
  for (const [x, z] of points) {
    for (let tx = Math.floor(x - radius); tx <= Math.ceil(x + radius); tx++) {
      for (let tz = Math.floor(z - radius); tz <= Math.ceil(z + radius); tz++) {
        const dx = Math.max(0, Math.abs(tx - x) - 0.5);
        const dz = Math.max(0, Math.abs(tz - z) - 0.5);
        if (dx * dx + dz * dz >= radius * radius - 0.00001) continue;
        if (!inside(tx, tz)) return null;
        cells.add(tileId(tx, tz));
      }
    }
  }
  return Array.from(cells);
}
function edges(key: number): Edge[] {
  const cached = graph.get(key);
  if (cached) return cached;
  const direction = key % 8;
  const [x, z] = xy(Math.floor(key / 8));
  const heading = HEADINGS[direction];
  const [fx, fz] = heading.map(n => n / Math.hypot(...heading));
  const result: Edge[] = [];
  for (const turn of [0, -1, 1, -2, 2]) {
    let points: Point[];
    let length: number;
    const nextDirection = (direction + turn + 8) % 8;
    if (!turn) {
      points = Array.from({ length: 9 }, (_, i): Point => [x + heading[0] * (i / 8), z + heading[1] * (i / 8)]);
      length = Math.hypot(...heading);
    } else if (direction % 2 === 0 && Math.abs(turn) === 2) {
      const [rx, rz] = HEADINGS[nextDirection];
      points = Array.from({ length: 25 }, (_, i): Point => {
        const a = (i / 24) * (Math.PI / 2);
        return [x + TURN_RADIUS * (fx * Math.sin(a) + rx * (1 - Math.cos(a))), z + TURN_RADIUS * (fz * Math.sin(a) + rz * (1 - Math.cos(a)))];
      });
      length = TURN_RADIUS * (Math.PI / 2);
    } else {
      // Smooth 45-degree transitions (including diagonal tangents). Reject a
      // primitive unless sampled analytic curvature meets the same radius rule.
      const nextHeading = HEADINGS[nextDirection];
      const [rx, rz] = nextHeading.map(n => n / Math.hypot(...nextHeading));
      let candidate: Point[] = [];
      for (const span of [3, 4, 5, 6]) {
        const end: Point = [Math.round((fx + rx) * span), Math.round((fz + rz) * span)];
        const handle = span * (Math.abs(turn) === 1 ? 0.67 : 0.55);
        const a: Point = [fx * handle, fz * handle]; const b: Point = [end[0] - rx * handle, end[1] - rz * handle];
        let fits = true; const samples: Point[] = [];
        for (let i = 0; i <= 48; i++) {
          const t = i / 48; const u = 1 - t;
          const dx = 3 * (u * u * a[0] + 2 * u * t * (b[0] - a[0]) + t * t * (end[0] - b[0]));
          const dz = 3 * (u * u * a[1] + 2 * u * t * (b[1] - a[1]) + t * t * (end[1] - b[1]));
          const ddx = 6 * (u * (b[0] - 2 * a[0]) + t * (end[0] - 2 * b[0] + a[0]));
          const ddz = 6 * (u * (b[1] - 2 * a[1]) + t * (end[1] - 2 * b[1] + a[1]));
          const curvature = Math.abs(dx * ddz - dz * ddx) / Math.max(0.00001, (dx * dx + dz * dz) ** 1.5);
          if (curvature > 1 / TURN_RADIUS + 0.00001) fits = false;
          samples.push([x + 3 * u * u * t * a[0] + 3 * u * t * t * b[0] + t * t * t * end[0], z + 3 * u * u * t * a[1] + 3 * u * t * t * b[1] + t * t * t * end[1]]);
        }
        if (fits) { candidate = samples; break; }
      }
      if (!candidate.length) continue;
      points = candidate;
      length = points.reduce((sum, p, i) => sum + (i ? Math.hypot(p[0] - points[i - 1][0], p[1] - points[i - 1][1]) : 0), 0);
    }
    const [ex, ez] = points[points.length - 1].map(Math.round);
    const cells = footprint(points);
    if (cells && inside(ex, ez)) result.push({ to: node(ex, ez, nextDirection), points, cells, length });
  }
  graph.set(key, result);
  return result;
}
class MinHeap {
  values: { key: number; cost: number }[] = [];
  push(key: number, cost: number) {
    const item = { key, cost }; this.values.push(item);
    let i = this.values.length - 1;
    while (i > 0) { const parent = Math.floor((i - 1) / 2); if (this.values[parent].cost <= cost) break; this.values[i] = this.values[parent]; i = parent; }
    this.values[i] = item;
  }
  pop() {
    const first = this.values[0]; const last = this.values.pop();
    if (this.values.length && last) {
      let i = 0;
      while (i * 2 + 1 < this.values.length) {
        let child = i * 2 + 1;
        if (child + 1 < this.values.length && this.values[child + 1].cost < this.values[child].cost) child++;
        if (this.values[child].cost >= last.cost) break;
        this.values[i] = this.values[child]; i = child;
      }
      this.values[i] = last;
    }
    return first;
  }
}

/** Survey each reach at its own level; every passage must use the three lock chambers. */
export function* findRouteSteps(game: TerrainGame, planning = false, style: Contractor['style'] = 'balanced'): Generator<void, Route | null> {
  if (!planning && game.locks.some(owner => owner === null)) return null;
  const deficits = game.plots.map((p, id) => Math.max(0, p.height - bedLevel(id)));
  const chosen: Edge[] = [];
  for (let section = 0; section < 4; section++) {
    const from: Point = section === 0 ? START : [LOCKS[section - 1].at[0], LOCKS[section - 1].at[1] + 2];
    const to: Point = section === 3 ? END : [LOCKS[section].at[0], LOCKS[section].at[1] - 2];
    const startKey = node(...from, 2); const endKey = node(...to, 2);
    const costs = new Float64Array(MAP_W * MAP_H * 8).fill(Infinity);
    const parents = new Map<number, { previous: number; edge: Edge }>();
    const heuristic = (key: number) => { const p = xy(Math.floor(key / 8)); return Math.hypot(p[0] - to[0], p[1] - to[1]); };
    const heap = new MinHeap(); costs[startKey] = 0; heap.push(startKey, heuristic(startKey));
    while (heap.values.length) {
      yield;
      const top = heap.pop(); if (top.cost > costs[top.key] + heuristic(top.key) + 0.000001) continue;
      if (top.key === endKey) break;
      for (const edge of edges(top.key)) {
        let penalty = 0; let passable = true;
        for (const id of edge.cells) {
          if (basinAt(id) !== section || game.plots[id].fill.length || (!planning && deficits[id] > 0)) { passable = false; break; }
          if (planning) penalty += deficits[id] * (style === 'shortcut' ? 0.2 : style === 'river' ? 1.6 : 0.8);
        }
        if (!passable) continue;
        const candidate = costs[top.key] + edge.length + (penalty / edge.cells.length) * edge.length;
        if (candidate + 0.000001 < costs[edge.to]) { costs[edge.to] = candidate; parents.set(edge.to, { previous: top.key, edge }); heap.push(edge.to, candidate + heuristic(edge.to)); }
      }
    }
    if (!Number.isFinite(costs[endKey])) return null;
    const segment: Edge[] = []; let at = endKey;
    while (at !== startKey) { const previous = parents.get(at)!; segment.push(previous.edge); at = previous.previous; }
    chosen.push(...segment.reverse());
    if (section < 3) {
      const [x, z] = LOCKS[section].at; const cells = lockCells(section);
      if (cells.some(id => game.plots[id].fill.length || (!planning && deficits[id] > 0))) return null;
      chosen.push({ to: 0, points: Array.from({ length: 17 }, (_, i): Point => [x, z - 2 + i / 4]), cells, length: 4 });
    }
  }
  const cells = Array.from(new Set(chosen.flatMap(e => e.cells)));
  return { points: chosen.flatMap((e, i) => (i ? e.points.slice(1) : e.points)),
cells,
    length: chosen.reduce((sum, e) => sum + e.length, 0) * TILE_METRES,
    remaining: cells.reduce((sum, id) => sum + deficits[id], 0),
blocked: cells.filter(id => deficits[id] > 0) };
}
function completeSteps<T>(steps: Generator<void, T>): T {
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
}
export function findRoute(game: TerrainGame, planning = false, style: Contractor['style'] = 'balanced'): Route | null {
  return completeSteps(findRouteSteps(game, planning, style));
}
export function surveyTerrain(game: TerrainGame): Survey {
  const route = findRoute(game);
  return { route, proposal: route ?? findRoute(game, true)!, wet: waterMask(game.plots) };
}

export function lineSelection(from: number, to: number, wide: boolean): number[] {
  const [ax, az] = xy(from); const [bx, bz] = xy(to);
  const steps = Math.max(Math.abs(bx - ax), Math.abs(bz - az));
  const selected = new Set<number>();
  for (let i = 0; i <= steps; i++) {
    const x = Math.round(ax + (bx - ax) * (steps ? i / steps : 0));
    const z = Math.round(az + (bz - az) * (steps ? i / steps : 0));
    for (let dx = wide ? -1 : 0; dx <= (wide ? 1 : 0); dx++) {
      for (let dz = wide ? -1 : 0; dz <= (wide ? 1 : 0); dz++) if (inside(x + dx, z + dz)) selected.add(tileId(x + dx, z + dz));
    }
  }
  return Array.from(selected);
}
export function* quoteTerrainSteps(game: TerrainGame, action: TerrainAction): Generator<void, Quote> {
  const player = currentPlayer(game);
  const q: Quote = { cells: [], units: 0, cost: 0, error: null, depths: {} };
  if (game.finished) return { ...q, error: '工程已结算，可开新地图' };
  if (action.tool === 'fund') return { ...q, cost: -55 };
  if (action.tool === 'pass') return q;
  if (action.tool === 'lock') {
    const index = action.source;
    if (index === undefined || !LOCKS[index]) return { ...q, error: '先选择一座枢纽' };
    if (game.locks[index] !== null) return { ...q, error: '这座枢纽已经建成' };
    const cells = lockCells(index);
    if (cells.some(id => game.plots[id].height > bedLevel(id))) return { ...q, error: '先开挖、疏浚闸室的 15 格基坑至各自设计底层' };
    const cost = game.sandbox ? 0 : 30;
    return { ...q, cells, cost, error: player.cash < cost ? '船闸建设需要 ¥30，可先申请拨款' : null };
  }
  if (action.tool === 'dispose') {
    const cost = game.sandbox ? 0 : 8;
    return pileSize(player) ? { ...q, units: Math.min(64, pileSize(player)), cost, error: player.cash < cost ? '资金不足，先申请工程拨款' : null } : { ...q, error: '没有待外运土方' };
  }
  const selected = Array.from(new Set(action.cells)).filter(id => Number.isInteger(id) && id >= 0 && id < game.plots.length && !isPort(id));
  if (!selected.length) return { ...q, error: '点击地块，或选择线段的起点与终点' };
  if (selected.length > MAX_CELLS) return { ...q, error: `单队一次最多 ${MAX_CELLS} 格，请缩短施工线` };
  const wet = action.tool === 'haul' ? waterMask(game.plots) : null;
  if (action.tool === 'haul') {
    const sources = Array.from(new Set(action.sources ?? (action.source === undefined ? [] : [action.source])))
      .filter(id => Number.isInteger(id) && id >= 0 && id < game.plots.length && pileSize(player, id) > 0);
    if (!sources.length) return { ...q, error: '先选一个有土的堆土场，再选回填地块' };
    const stock = new Map(sources.map(id => [id, pileSize(player, id)]));
    const candidates = selected.filter(id => {
      const p = game.plots[id];
      return p.farm && p.height < reclamationLevel(p) && !wet![id] && (!action.sources || !Object.keys(p.cuts).length);
    }).map(id => ({ id, height: game.plots[id].height, target: reclamationLevel(game.plots[id]), routes: [] as { source: number; distance: number; cost: number }[] }));
    for (const source of sources) {
      yield;
      const network = truckNetwork(game, source, wet!);
      candidates.forEach(c => {
        if (!Number.isFinite(network.cost[c.id])) return;
        let distance = 1; let at = c.id;
        while (at !== network.start) { at = network.parents[at]; distance++; }
        c.routes.push({ source, distance, cost: network.cost[c.id] });
      });
    }
    candidates.forEach(c => c.routes.sort((a, b) => a.cost - b.cost || a.source - b.source));
    const distances = new Map<number, number>();
    q.deliveries = [];
    while (q.units < 24) {
      const lowest = candidates.filter(c => c.height < c.target && c.routes.some(r => stock.get(r.source)! > 0))
        .sort((a, b) => a.height - b.height || a.id - b.id)[0];
      if (!lowest) break;
      const route = lowest.routes.find(r => stock.get(r.source)! > 0)!;
      if (q.depths[lowest.id] === undefined) q.cells.push(lowest.id);
      lowest.height++; q.depths[lowest.id] = lowest.height; q.units++;
      stock.set(route.source, stock.get(route.source)! - 1);
      distances.set(route.source, Math.max(distances.get(route.source) ?? 0, route.distance));
      const delivery = q.deliveries.find(d => d.source === route.source && d.target === lowest.id);
      if (delivery) delivery.units++; else q.deliveries.push({ source: route.source, target: lowest.id, units: 1 });
    }
    if (!q.units) return { ...q, error: '选择有陆路相连的绿色洼地；隔河、淹没或已整平的地块不能回填' };
    q.cost = Math.ceil(2 + q.units * 0.12 + Array.from(distances.values()).reduce((sum, distance) => sum + distance * 0.2, 0));
  } else {
    selected.forEach(id => {
      const plot = game.plots[id];
      if (plot.height <= bedLevel(id) || plot.fill.length) return;
      if (action.tool === 'blast' && plot.height <= waterLevel(id)) return;
      if (action.tool === 'dredge' && plot.height > waterLevel(id)) return;
      const amount = Math.min(plot.height - bedLevel(id), action.tool === 'blast' ? 3 : action.tool === 'dredge' ? 2 : 1);
      q.cells.push(id); q.depths[id] = plot.height - amount; q.units += amount;
    });
    if (!q.units) return { ...q, error: action.tool === 'dredge' ? '疏浚只处理本河段水面以下的河床；岸边请先开挖' : action.tool === 'blast' ? '爆破处理本河段水面以上的山体与岸坡' : '已达到本河段设计底层，或是已复垦地块' };
    if (pileSize(player) + q.units > PILE_CAPACITY && !game.sandbox) return { ...q, error: '堆土场接近容量上限，先运土填沟或外运弃土' };
    q.cost = Math.ceil(2 + q.units * (action.tool === 'blast' ? 1.2 : action.tool === 'dredge' ? 0.6 : 0.8));
  }
  if (game.sandbox) q.cost = 0;
  if (player.cash < q.cost) q.error = `资金不足，还差 ¥${q.cost - player.cash}；可先申请工程拨款`;
  return q;
}
export function quoteTerrain(game: TerrainGame, action: TerrainAction): Quote {
  return completeSteps(quoteTerrainSteps(game, action));
}
function takeSoil(player: Contractor, source: number, count: number): Soil[] {
  const batches = player.piles[source] ?? []; const taken: Soil[] = []; let need = count;
  for (const batch of batches) {
    const amount = Math.min(batch.amount, need);
    if (amount) { taken.push({ ...batch, amount }); batch.amount -= amount; need -= amount; }
  }
  player.piles[source] = batches.filter(s => s.amount > 0);
  return taken;
}
export function* applyTerrainActionSteps(game: TerrainGame, action: TerrainAction): Generator<void, TerrainGame> {
  const quotation = quoteTerrainSteps(game, action); let quoted = quotation.next();
  while (!quoted.done) { yield; quoted = quotation.next(); }
  const quote = quoted.value;
  if (quote.error) return game;
  const next: TerrainGame = JSON.parse(JSON.stringify(game));
  const player = currentPlayer(next);
  player.cash -= quote.cost; player.spent += Math.max(0, quote.cost);
  if (['dig', 'blast', 'dredge'].includes(action.tool)) {
    quote.cells.forEach(id => {
      const plot = next.plots[id]; const batches = player.piles[id] ?? [];
      for (let level = plot.height; level > quote.depths[id]; level--) {
        plot.cuts[level] = player.id; batches.push({ source: id, level, amount: 1 });
      }
      player.piles[id] = batches; plot.height = quote.depths[id];
    });
  }
  if (action.tool === 'haul') {
    quote.deliveries?.forEach(delivery => {
      const plot = next.plots[delivery.target];
      const material = takeSoil(player, delivery.source, delivery.units).flatMap(s => Array.from({ length: s.amount }, () => ({ player: player.id, source: s.source, level: s.level })));
      plot.fill.push(...material); plot.height += material.length;
    });
  }
  if (action.tool === 'lock' && action.source !== undefined) next.locks[action.source] = player.id;
  if (action.tool === 'dispose') {
    let remaining = quote.units;
    Object.keys(player.piles).forEach(key => { const source = Number(key); const amount = Math.min(remaining, pileSize(player, source)); takeSoil(player, source, amount); remaining -= amount; });
  }
  const verbs = { dig: '开挖', blast: '爆破', dredge: '疏浚', haul: '运土复垦', fund: '申请拨款', dispose: '土方外运', pass: '等待施工', lock: '建设分级船闸' };
  const event: WorkEvent = { id: next.moves + 1, player: player.id, tool: action.tool, cells: quote.cells, from: quote.deliveries?.[0]?.source ?? action.source, deliveries: quote.deliveries, units: quote.units, cost: quote.cost, message: `${player.name} · ${verbs[action.tool]}${quote.units ? ` ${quote.units} 方` : ''}` };
  next.events = [...next.events.slice(-59), event]; next.moves++;
  if (!next.sandbox && !next.finishRound) {
    const search = findRouteSteps(next); let result = search.next();
    while (!result.done) { yield; result = search.next(); }
    if (result.value) next.finishRound = Math.min(next.limit, next.round + 2);
  }
  next.turn++;
  if (next.turn >= next.players.length * 3) {
    next.turn = 0;
    if (!next.sandbox && next.round >= (next.finishRound ?? next.limit)) next.finished = true;
    else { next.round++; next.order = groupedTurnOrder(next.round, next.players.length); next.players.forEach(p => { p.cash += 24; }); }
  }
  return next;
}
export function applyTerrainAction(game: TerrainGame, action: TerrainAction): TerrainGame {
  return completeSteps(applyTerrainActionSteps(game, action));
}
export function finishTerrain(game: TerrainGame): TerrainGame {
  return game.players.length === 1 && findRoute(game) ? { ...game, finished: true } : game;
}
export function scoreTerrain(game: TerrainGame, route: Route | null) {
  const adopted = new Set(route?.cells ?? []); const wet = waterMask(game.plots);
  return game.players.map(player => {
    let useful = 0; let wasted = 0; let reclaimed = 0;
    game.plots.forEach((plot, id) => {
      Object.entries(plot.cuts).forEach(([level, owner]) => {
        if (owner !== player.id) return;
        if (adopted.has(id) && Number(level) > bedLevel(id) && Number(level) > plot.height) useful++;
        else wasted++;
      });
      if (plot.farm && plot.height >= reclamationLevel(plot) && !wet[id]) reclaimed += plot.fill.filter(s => s.player === player.id && adopted.has(s.source) && s.level > bedLevel(s.source)).length;
    });
    const locks = route ? game.locks.filter(owner => owner === player.id).length : 0;
    return { id: player.id, useful, wasted, reclaimed, locks, total: useful * 3 + reclaimed * 2 + locks * 40, spent: player.spent };
  });
}
export function* aiTerrainActionSteps(game: TerrainGame): Generator<void, TerrainAction> {
  const player = currentPlayer(game);
  if (player.cash < 24) return { tool: 'fund', cells: [] };
  const readyLock = LOCKS.find(l => game.locks[l.index] === null && lockCells(l.index).every(id => game.plots[id].height <= bedLevel(id)));
  if (readyLock && player.cash >= 30) return { tool: 'lock', cells: [], source: readyLock.index };
  const search = findRouteSteps(game, true, player.style); let result = search.next();
  while (!result.done) { yield; result = search.next(); }
  const plan = result.value;
  if (!plan) return { tool: 'pass', cells: [] };
  const sources = Object.keys(player.piles).map(Number).filter(id => pileSize(player, id) > 0).sort((a, b) => pileSize(player, b) - pileSize(player, a));
  if (pileSize(player) > 110 || (!plan.blocked.length && sources.length)) {
    const haulSearch = planAutoHaulSteps(game); let haulResult = haulSearch.next();
    while (!haulResult.done) { yield; haulResult = haulSearch.next(); }
    if (haulResult.value.action) return haulResult.value.action;
    return { tool: 'dispose', cells: [] };
  }
  const targets = plan.blocked.filter(id => !isPort(id) && !game.plots[id].fill.length);
  if (!targets.length) return { tool: 'pass', cells: [] };
  targets.sort((a, b) => {
    const [ax] = xy(a); const [bx] = xy(b);
    return player.style === 'shortcut' ? Math.abs(ax - 15) - Math.abs(bx - 15) : player.style === 'river' ? game.plots[a].height - game.plots[b].height : bx - ax;
  });
  const anchor = targets[0]; const high = game.plots[anchor].height > waterLevel(anchor);
  const tool = high ? 'blast' : 'dredge'; const [ax, az] = xy(anchor);
  const cells = targets.filter(id => (game.plots[id].height > waterLevel(id)) === high).sort((a, b) => Math.hypot(xy(a)[0] - ax, xy(a)[1] - az) - Math.hypot(xy(b)[0] - ax, xy(b)[1] - az)).slice(0, MAX_CELLS);
  const action: TerrainAction = { tool, cells };
  const quote = quoteTerrain(game, action);
  if (quote.error) return { tool: pileSize(player) > 100 ? 'dispose' : 'fund', cells: [] };
  return action;
}
export function aiTerrainAction(game: TerrainGame): TerrainAction {
  return completeSteps(aiTerrainActionSteps(game));
}

export function restoreTerrain(raw: string): TerrainGame | null {
  try {
    const game = JSON.parse(raw) as TerrainGame;
    if (game.version !== 3 || !Number.isInteger(game.seed) || !Array.isArray(game.plots) || game.plots.length !== MAP_W * MAP_H || !Array.isArray(game.players) || game.players.length < 1 || game.players.length > 4) return null;
    if (!Number.isInteger(game.round) || game.round < 1 || !Number.isInteger(game.turn) || game.turn < 0 || game.turn >= game.players.length * 3 || !Array.isArray(game.events)) return null;
    if (game.plots.some(p => !Number.isInteger(p.height) || p.height < TARGET_BED || p.height > 120 || !p.cuts || !Array.isArray(p.fill))) return null;
    if (game.plots.some(p => p.fillTarget !== undefined && (!Number.isInteger(p.fillTarget) || p.fillTarget < -3 || p.fillTarget > 120))) return null;
    if (game.players.some((p, i) => p.id !== i || !Number.isFinite(p.cash) || !Number.isFinite(p.spent) || !p.piles || Object.values(p.piles).some(b => !Array.isArray(b) || b.some(s => !Number.isInteger(s.amount) || s.amount < 0)))) return null;
    if (game.players.some(p => p.haulTarget !== undefined && (!Number.isInteger(p.haulTarget) || p.haulTarget < 0 || p.haulTarget >= game.plots.length))) return null;
    if (!Array.isArray(game.locks) || game.locks.length !== 3 || game.locks.some(owner => owner !== null && (!Number.isInteger(owner) || owner < 0 || owner >= game.players.length))) return null;
    if (game.order !== undefined && (!Array.isArray(game.order) || game.order.length !== game.players.length * 3 || game.order.some(id => !Number.isInteger(id) || id < 0 || id >= game.players.length) || game.players.some(p => game.order!.filter(id => id === p.id).length !== 3))) return null;
    // Finish a legacy round without reassigning already-used crews; group turns from the next round.
    if (!game.order) {
      const seats = game.players.map(p => p.id);
      if (game.round % 2 === 0) seats.reverse();
      game.order = game.moves ? [...seats, ...[...seats].reverse(), ...seats] : groupedTurnOrder(game.round, seats.length);
    }
    return game;
  } catch { return null; }
}
