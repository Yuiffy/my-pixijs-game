import dem from "./terrain-dem.json";
import hillDetail from "./terrain-hills.json";
import urbanGround from "./terrain-ground.json";
import geography from "./skyline-map.json";

type TerrainPoint = { x: number; z: number };
type Coordinate = number[];

/** Shared local vertical origin. It is a coordinate datum, not river level. */
export const ELEVATION_DATUM = 85;
/** A representative non-flood stage; not a current-day hydrological reading. */
export const WATER_ELEVATION = 77.5;
export const WATER_LEVEL = WATER_ELEVATION - ELEVATION_DATUM;
export const TERRAIN_GRID = {
  minX: dem.minX,
  minZ: dem.minZ,
  maxX: dem.minX + (dem.cols - 1) * dem.sampleStepMeters,
  maxZ: dem.minZ + (dem.rows - 1) * dem.sampleStepMeters,
  cols: dem.cols,
  rows: dem.rows,
  step: dem.sampleStepMeters,
};
export const RIVER_POLYGONS = geography.riverPolygons;

// Bucket polygon edges by latitude. Navigation tests thousands of points;
// scanning the entire several-kilometre shoreline for each one is unnecessary.
function prepareRing(points: Coordinate[]) {
  const stripes = new Map<number, [Coordinate, Coordinate][]>();
  const xs = points.map((p) => p[0]);
  const zs = points.map((p) => p[1]);
  points.forEach((a, i) => {
    const b = points[(i + 1) % points.length];
    if (a[1] === b[1]) return;
    for (let stripe = Math.floor(Math.min(a[1], b[1]) / 64); stripe <= Math.floor(Math.max(a[1], b[1]) / 64); stripe++) {
      const edges = stripes.get(stripe) || [];
      edges.push([a, b]);
      stripes.set(stripe, edges);
    }
  });
  return { stripes, minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
}
type PreparedRing = ReturnType<typeof prepareRing>;
const riverAreas = RIVER_POLYGONS.map((p) => ({ outer: prepareRing(p.outer), holes: p.holes.map(prepareRing) }));

function insideRing(p: TerrainPoint, ring: PreparedRing) {
  if (p.x < ring.minX || p.x > ring.maxX || p.z < ring.minZ || p.z > ring.maxZ) return false;
  let inside = false;
  for (const [a, b] of ring.stripes.get(Math.floor(p.z / 64)) || []) {
    if ((a[1] > p.z) !== (b[1] > p.z) && p.x < a[0] + ((p.z - a[1]) * (b[0] - a[0])) / (b[1] - a[1])) inside = !inside;
  }
  return inside;
}

/** OSM water polygons with islands retained, in the original metre projection. */
export function inMappedRiver(p: TerrainPoint) {
  return riverAreas.some((area) => insideRing(p, area.outer) && !area.holes.some((hole) => insideRing(p, hole)));
}

/** Absolute DEM elevation, using the same triangle split as the rendered grid. */
function gridElevation(p: TerrainPoint, grid: { minX: number; minZ: number; cols: number; rows: number; sampleStepMeters: number; heights: number[] }) {
  const gx = Math.max(0, Math.min(grid.cols - 1.000001, (p.x - grid.minX) / grid.sampleStepMeters));
  const gz = Math.max(0, Math.min(grid.rows - 1.000001, (p.z - grid.minZ) / grid.sampleStepMeters));
  const ix = Math.floor(gx); const iz = Math.floor(gz);
  const fx = gx - ix; const fz = gz - iz;
  const a = grid.heights[iz * grid.cols + ix];
  const b = grid.heights[iz * grid.cols + ix + 1];
  const c = grid.heights[(iz + 1) * grid.cols + ix];
  const d = grid.heights[(iz + 1) * grid.cols + ix + 1];
  return fx + fz <= 1 ? a + (b - a) * fx + (c - a) * fz : d + (c - d) * (1 - fx) + (b - d) * (1 - fz);
}

export const HILL_PATCHES = hillDetail.patches;
export function terrainElevation(p: TerrainPoint) {
  const broad = gridElevation(p, dem);
  for (const patch of HILL_PATCHES) {
    const margin = Math.min(p.x - patch.minX, p.z - patch.minZ, patch.minX + (patch.cols - 1) * patch.sampleStepMeters - p.x, patch.minZ + (patch.rows - 1) * patch.sampleStepMeters - p.z);
    if (margin <= 0) continue;
    const t = Math.min(1, margin / 80);
    return broad + (gridElevation(p, patch) - broad) * t * t * (3 - 2 * t);
  }
  return broad;
}

/** Local bare-ground estimate. Raw radar elevations remain available above.
 * Blend to the untouched DEM at the edge and around the mapped mountain feet.
 */
export function groundElevation(p: TerrainPoint) {
  const raw = terrainElevation(p);
  const x = (p.x - urbanGround.minX) / urbanGround.step;
  const z = (p.z - urbanGround.minZ) / urbanGround.step;
  if (x < 0 || z < 0 || x >= urbanGround.cols - 1 || z >= urbanGround.rows - 1) return raw;
  const ix = Math.floor(x); const iz = Math.floor(z);
  const fx = x - ix; const fz = z - iz;
  const a = urbanGround.heights[iz * urbanGround.cols + ix];
  const b = urbanGround.heights[iz * urbanGround.cols + ix + 1];
  const c = urbanGround.heights[(iz + 1) * urbanGround.cols + ix];
  const d = urbanGround.heights[(iz + 1) * urbanGround.cols + ix + 1];
  const filtered = fx + fz <= 1 ? a + (b - a) * fx + (c - a) * fz : d + (c - d) * (1 - fx) + (b - d) * (1 - fz);
  let blend = Math.min(1, (Math.min(x, z, urbanGround.cols - 1 - x, urbanGround.rows - 1 - z) * urbanGround.step) / urbanGround.featherMeters);
  // Preserve the actual karst feet; urban terrace heights cannot be applied to
  // hills simply because they lie near the town's rectangular playable area.
  for (const hill of geography.hills) {
    const protectedRadius = hill.name === "蟠龙山" ? 220 : hill.name === "马鞍山" ? 280 : hill.name === "鱼峰山" ? 120 : 360;
    blend = Math.min(blend, Math.max(0, Math.min(1, (Math.hypot(p.x - hill.x, p.z - hill.z) - protectedRadius) / 120)));
  }
  const t = blend * blend * (3 - 2 * blend);
  return raw + (filtered - raw) * t;
}

/** Render/physics terrain height in metres relative to ELEVATION_DATUM.
 * Riverbed carving corrects historic DEM water artefacts, never bridge decks.
 */
export function terrainHeight(p: TerrainPoint) {
  const height = groundElevation(p) - ELEVATION_DATUM;
  return inMappedRiver(p) ? Math.min(height, WATER_LEVEL - 1.5) : Math.max(height, WATER_LEVEL + 1);
}

export const TERRAIN_ATTRIBUTION = "地形：Mapzen / AWS Terrain Tiles · USGS / NASA SRTM（约30米源数据）";
