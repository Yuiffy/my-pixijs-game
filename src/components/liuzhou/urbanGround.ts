import { ShapeUtils, Vector2 } from "three";
import type { UrbanGround } from "./urban";
import { terrainChunks, terrainSurface } from "./terrainMesh";
import { pavingWithoutEntrances } from "./underground";

type P = { x: number; z: number };
type V = P & { y: number };
const chunks = terrainChunks();
const cells = new Map<string, V[][]>();
const triangulate = (rings: number[][][]) => ShapeUtils.triangulateShape(rings[0].map(p => new Vector2(...p)), rings.slice(1).map(ring => ring.map(p => new Vector2(...p))));
function dryFaces(x: number, z: number, maxX: number, maxZ: number, step: number) {
  const key = `${step}:${x}:${z}`;
  const cached = cells.get(key);
  if (cached) return cached;
  const mesh = terrainSurface({ minX: x, minZ: z, maxX, maxZ }, step, triangulate);
  const faces: V[][] = [];
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const ids = mesh.indices.slice(i, i + 3);
    if (ids.some(id => mesh.kinds[id] !== 0)) continue;
    faces.push(ids.map(id => ({ x: mesh.positions[id * 3], y: mesh.positions[id * 3 + 1], z: mesh.positions[id * 3 + 2] })));
  }
  cells.set(key, faces);
  return faces;
}
function clip(poly: P[], a: P, b: P) {
  const side = (p: P) => (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x);
  const result: P[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]; const q = poly[(i + 1) % poly.length]; const v = side(p); const w = side(q);
    if (v <= 1e-8) result.push(p);
    if ((v < 0) !== (w < 0) && Math.abs(v - w) > 1e-10) {
      const t = v / (v - w); result.push({ x: p.x + (q.x - p.x) * t, z: p.z + (q.z - p.z) * t });
    }
  }
  return result;
}

/** Use actual dry terrain faces, including shoreline cuts and stair holes.
 * Sampling DEM heights at arbitrary vertices can bridge over those boundaries.
 */
export function urbanGroundPositions(area: UrbanGround) {
  const { points } = area;
  const triangles = ShapeUtils.triangulateShape(points.map(p => new Vector2(p.x, p.z)), []);
  const vertices: number[] = [];
  const offset = area.id.startsWith("parcel-") ? 0.012 : 0.025;
  for (const triangle of triangles) {
    const ring = triangle.map(i => points[i]);
    for (const piece of pavingWithoutEntrances(ring)) {
      const minX = Math.min(...piece.map(p => p.x)); const maxX = Math.max(...piece.map(p => p.x));
      const minZ = Math.min(...piece.map(p => p.z)); const maxZ = Math.max(...piece.map(p => p.z));
      for (const chunk of chunks) {
        if (minX >= chunk.maxX || maxX <= chunk.minX || minZ >= chunk.maxZ || maxZ <= chunk.minZ) continue;
        const { step } = chunk;
        const firstX = Math.max(chunk.minX, chunk.minX + Math.floor((minX - chunk.minX) / step) * step);
        const firstZ = Math.max(chunk.minZ, chunk.minZ + Math.floor((minZ - chunk.minZ) / step) * step);
        for (let z = firstZ; z < Math.min(maxZ, chunk.maxZ); z += step) for (let x = firstX; x < Math.min(maxX, chunk.maxX); x += step) {
          for (const face of dryFaces(x, z, Math.min(x + step, chunk.maxX), Math.min(z + step, chunk.maxZ), step)) {
            let poly = piece;
            for (let i = 0; i < 3 && poly.length >= 3; i++) poly = clip(poly, face[i], face[(i + 1) % 3]);
            const [a, b, c] = face;
            const cross = (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
            if (Math.abs(cross) < 1e-8) continue;
            for (let i = 1; i < poly.length - 1; i++) {
              const [p, q, r] = [poly[0], poly[i], poly[i + 1]];
              const winding = (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x);
              if (Math.abs(winding) < 1e-8) continue;
              for (const v of winding > 0 ? [p, r, q] : [p, q, r]) {
                const u = ((v.x - a.x) * (c.z - a.z) - (v.z - a.z) * (c.x - a.x)) / cross;
                const w = ((b.x - a.x) * (v.z - a.z) - (b.z - a.z) * (v.x - a.x)) / cross;
                vertices.push(v.x, a.y + (b.y - a.y) * u + (c.y - a.y) * w + offset, v.z);
              }
            }
          }
        }
      }
    }
  }
  return vertices;
}
