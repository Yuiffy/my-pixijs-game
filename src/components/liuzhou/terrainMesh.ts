import shoreline from "./terrain-shoreline.json";
import { UNDERGROUND_CUTS } from "./underground";
import { appendEshanSurface, ESHAN_CUTS, ESHAN_PAVING_OFFSET, eshanSurfaceHeight } from "./eshanSurface";
import { ELEVATION_DATUM, groundElevation, HILL_PATCHES, inMappedRiver, terrainHeight, TERRAIN_GRID, WATER_LEVEL } from "./terrain";

type Point = { x: number; z: number };
type Cut = { land: number[][][][]; water: number[][][][]; banks: number[][][] };
const cuts: Record<string, Cut> = shoreline.cells;
export type TerrainMesh = { positions: number[]; indices: number[]; kinds: number[] };
export type TerrainTriangulator = (rings: number[][][]) => number[][];
/** Retaining tops meet the visible park paving; their base meets drawn soil.
 * Physics keeps the unshifted shared mesh. Kind 6 marks only the trail edge. */
export function terrainDrawHeight(y: number, kind: number) {
  return y + (kind === 6 ? ESHAN_PAVING_OFFSET : -0.12);
}

export function terrainChunks() {
  const chunks: { minX: number; minZ: number; maxX: number; maxZ: number; step: number }[] = [];
  for (let z = TERRAIN_GRID.minZ; z < TERRAIN_GRID.maxZ; z += 800) for (let x = TERRAIN_GRID.minX; x < TERRAIN_GRID.maxX; x += 800) {
    const nearest = Math.hypot(Math.max(0, Math.abs(x + 400) - 400), Math.max(0, Math.abs(z + 400) - 400));
    const hill = HILL_PATCHES.some(p => x < p.minX + (p.cols - 1) * p.sampleStepMeters && x + 800 > p.minX && z < p.minZ + (p.rows - 1) * p.sampleStepMeters && z + 800 > p.minZ);
    const core = x < 700 && x + 800 > -660 && z < 1200 && z + 800 > -560;
    chunks.push({ minX: x, minZ: z, maxX: Math.min(x + 800, TERRAIN_GRID.maxX), maxZ: Math.min(z + 800, TERRAIN_GRID.maxZ), step: core || hill ? 10 : nearest < 2100 ? 20 : nearest < 4300 ? 40 : nearest < 7200 ? 80 : 160 });
  }
  return chunks;
}

const chunks = terrainChunks();
// Every point inside a cell shares the same four fixed mesh vertices. Road
// draping used to repeat shoreline/DEM work for those vertices thousands of
// times. Cache only these finite grid samples, never moving actor positions.
const cellHeights = new Map<string, [number, number, number, number]>();
/** Height of the actual LOD triangle, rather than a new DEM sample between
 * mesh vertices. Used by draped city streets to avoid sinking/z-fighting. */
export function terrainTriangleHeight(p: Point) {
  return eshanSurfaceHeight(p) ?? terrainBaseTriangleHeight(p);
}
export function terrainBaseTriangleHeight(p: Point) {
  const chunk = chunks.find(c => p.x >= c.minX && p.x <= c.maxX && p.z >= c.minZ && p.z <= c.maxZ);
  if (!chunk) return terrainHeight(p);
  const { step } = chunk;
  const x = chunk.minX + Math.floor((p.x - chunk.minX) / step) * step;
  const z = chunk.minZ + Math.floor((p.z - chunk.minZ) / step) * step;
  if (cuts[`${step}:${x}:${z}`]) return terrainHeight(p);
  const right = Math.min(chunk.maxX, x + step); const bottom = Math.min(chunk.maxZ, z + step);
  const u = (p.x - x) / (right - x || 1); const v = (p.z - z) / (bottom - z || 1);
  const key = `${step}:${x}:${z}:${right}:${bottom}`;
  let heights = cellHeights.get(key);
  if (!heights) {
    heights = [terrainHeight({ x, z }), terrainHeight({ x: right, z }), terrainHeight({ x, z: bottom }), terrainHeight({ x: right, z: bottom })];
    cellHeights.set(key, heights);
  }
  const [a, b, c, d] = heights;
  return u + v <= 1 ? a + (b - a) * u + (c - a) * v : d + (c - d) * (1 - u) + (b - d) * (1 - v);
}

/** Split paving at the terrain's cell edges AND diagonals. Sampling only the
 * four corners of a wide road leaves it cutting through a curved hillside. */
export function terrainDrapedTriangles(points: Point[]): Point[][] {
  if (points.length < 3) return [];
  const minX = Math.min(...points.map(p => p.x)); const maxX = Math.max(...points.map(p => p.x));
  const minZ = Math.min(...points.map(p => p.z)); const maxZ = Math.max(...points.map(p => p.z));
  const result: Point[][] = [];
  const clip = (poly: Point[], a: Point, b: Point) => {
    const side = (p: Point) => (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x);
    const out: Point[] = [];
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i]; const q = poly[(i + 1) % poly.length]; const v = side(p); const w = side(q);
      if (v >= -1e-7) out.push(p);
      if ((v > 0) !== (w > 0) && Math.abs(v - w) > 1e-10) { const t = v / (v - w); out.push({ x: p.x + (q.x - p.x) * t, z: p.z + (q.z - p.z) * t }); }
    }
    return out;
  };
  for (const chunk of chunks) {
    if (minX >= chunk.maxX || maxX <= chunk.minX || minZ >= chunk.maxZ || maxZ <= chunk.minZ) continue;
    const { step } = chunk;
    const firstX = Math.max(chunk.minX, chunk.minX + Math.floor((minX - chunk.minX) / step) * step);
    const firstZ = Math.max(chunk.minZ, chunk.minZ + Math.floor((minZ - chunk.minZ) / step) * step);
    for (let z = firstZ; z < Math.min(maxZ, chunk.maxZ); z += step) for (let x = firstX; x < Math.min(maxX, chunk.maxX); x += step) {
      const right = Math.min(x + step, chunk.maxX); const bottom = Math.min(z + step, chunk.maxZ);
      const a = { x, z }; const b = { x: right, z }; const c = { x, z: bottom }; const d = { x: right, z: bottom };
      for (const face of [[a, b, c], [b, d, c]]) {
        let poly = points;
        for (let i = 0; i < 3 && poly.length >= 3; i++) poly = clip(poly, face[i], face[(i + 1) % 3]);
        for (let i = 1; i < poly.length - 1; i++) {
          const triangle = [poly[0], poly[i], poly[i + 1]];
          const area = (triangle[1].x - triangle[0].x) * (triangle[2].z - triangle[0].z) - (triangle[2].x - triangle[0].x) * (triangle[1].z - triangle[0].z);
          if (Math.abs(area) > 1e-8) result.push(triangle);
        }
      }
    }
  }
  return result;
}

/** Shared render / Rapier mesh. Shoreline vertices have separate dry and wet
 * elevations so a coarse triangle cannot cover the river or move its bank.
 * Bank faces close the existing estimated land-to-water gap, not surveyed walls.
 */
export function terrainSurface(bounds: { minX: number; minZ: number; maxX: number; maxZ: number }, step: number, triangulate: TerrainTriangulator): TerrainMesh {
  const mesh: TerrainMesh = { positions: [], indices: [], kinds: [] };
  const shared = new Map<string, number>();
  const elevation = (p: Point, kind: number) => {
    if (kind === 0 && p.x > -3560 && p.x < -3000 && p.z > -450 && p.z < 340) return terrainBaseTriangleHeight(p);
    const ground = groundElevation(p) - ELEVATION_DATUM;
    return kind === 1 ? Math.min(ground, WATER_LEVEL - 1.5) : Math.max(ground, WATER_LEVEL + 1);
  };
  const vertex = (x: number, z: number, kind: number) => {
    const key = `${kind}:${x}:${z}`;
    const cached = shared.get(key);
    if (cached !== undefined) return cached;
    const index = mesh.positions.length / 3;
    mesh.positions.push(x, elevation({ x, z }, kind), z);
    mesh.kinds.push(kind);
    shared.set(key, index);
    return index;
  };
  const polygon = (rings: number[][][], kind: number) => {
    const points = rings.flat();
    const ids = points.map(p => vertex(p[0], p[1], kind));
    for (const triangle of triangulate(rings)) {
      const [a, b, c] = triangle.map(i => ids[i]);
      // Geographic x/z is clockwise when viewed from above in Three.js.
      const ax = mesh.positions[a * 3]; const az = mesh.positions[a * 3 + 2];
      const cross = (mesh.positions[b * 3] - ax) * (mesh.positions[c * 3 + 2] - az) - (mesh.positions[b * 3 + 2] - az) * (mesh.positions[c * 3] - ax);
      mesh.indices.push(a, cross > 0 ? c : b, cross > 0 ? b : c);
    }
  };
  for (let z = bounds.minZ; z < bounds.maxZ; z += step) for (let x = bounds.minX; x < bounds.maxX; x += step) {
    const right = Math.min(bounds.maxX, x + step); const bottom = Math.min(bounds.maxZ, z + step);
    const entryCut = UNDERGROUND_CUTS[`${step}:${x}:${z}`] ?? ESHAN_CUTS[`${step}:${x}:${z}`];
    const cut = entryCut ? { land: entryCut, water: [], banks: [] } : cuts[`${step}:${x}:${z}`];
    if (cut) {
      cut.land.forEach(rings => polygon(rings, 0));
      cut.water.forEach(rings => polygon(rings, 1));
      for (const line of cut.banks) for (let i = 1; i < line.length; i++) {
        const [a, b] = [line[i - 1], line[i]];
        const start = mesh.positions.length / 3;
        mesh.positions.push(a[0], elevation({ x: a[0], z: a[1] }, 0), a[1], b[0], elevation({ x: b[0], z: b[1] }, 0), b[1], a[0], WATER_LEVEL - 1.5, a[1], b[0], WATER_LEVEL - 1.5, b[1]);
        mesh.kinds.push(2, 2, 3, 3);
        mesh.indices.push(start, start + 2, start + 1, start + 1, start + 2, start + 3);
      }
      continue;
    }
    const kind = inMappedRiver({ x: (x + right) / 2, z: (z + bottom) / 2 }) ? 1 : 0;
    const a = vertex(x, z, kind); const b = vertex(right, z, kind);
    const c = vertex(x, bottom, kind); const d = vertex(right, bottom, kind);
    mesh.indices.push(a, c, b, b, c, d);
  }
  appendEshanSurface(mesh, bounds);
  return mesh;
}
