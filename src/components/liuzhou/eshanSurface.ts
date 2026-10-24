import layout from "./eshan-layout.json";

type P = { x: number; z: number };
export const ESHAN_PAVING_OFFSET = 0.015;
export const ESHAN_CUTS: Record<string, number[][][][]> = layout.terrainCuts;
const buckets = new Map<string, number[]>();
layout.faces.forEach((face, index) => {
  const points = face.map(i => layout.vertices[i]);
  for (let x = Math.floor(Math.min(...points.map(p => p[0])) / 8); x <= Math.floor(Math.max(...points.map(p => p[0])) / 8); x++) for (let z = Math.floor(Math.min(...points.map(p => p[2])) / 8); z <= Math.floor(Math.max(...points.map(p => p[2])) / 8); z++) {
    const key = `${x}:${z}`; const list = buckets.get(key) || []; list.push(index); buckets.set(key, list);
  }
});
/** Exact barycentric query of the same narrow park mesh used by Rapier. */
export function eshanSurfaceHeight(p: P) {
  for (const index of buckets.get(`${Math.floor(p.x / 8)}:${Math.floor(p.z / 8)}`) || []) {
    const [a, b, c] = layout.faces[index].map(i => layout.vertices[i]);
    const denominator = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
    if (Math.abs(denominator) < 1e-10) continue;
    const u = ((b[2] - c[2]) * (p.x - c[0]) + (c[0] - b[0]) * (p.z - c[2])) / denominator;
    const v = ((c[2] - a[2]) * (p.x - c[0]) + (a[0] - c[0]) * (p.z - c[2])) / denominator;
    if (u >= -1e-7 && v >= -1e-7 && u + v <= 1 + 1e-7) return a[1] * u + b[1] * v + c[1] * (1 - u - v);
  }
  return undefined;
}

export function appendEshanSurface(mesh: { positions: number[]; indices: number[]; kinds: number[] }, bounds: { minX: number; minZ: number; maxX: number; maxZ: number }) {
  if (bounds.maxX < -3560 || bounds.minX > -3000 || bounds.maxZ < -450 || bounds.minZ > 340) return;
  const inside = (points: number[][]) => {
    const x = points.reduce((s, p) => s + p[0], 0) / points.length; const z = points.reduce((s, p) => s + p[2], 0) / points.length;
    return x >= bounds.minX && x < bounds.maxX && z >= bounds.minZ && z < bounds.maxZ;
  };
  for (const face of layout.faces) {
    const points = face.map(i => layout.vertices[i]); if (!inside(points)) continue;
    const n = mesh.positions.length / 3; points.forEach(p => { mesh.positions.push(...p); mesh.kinds.push(4); }); mesh.indices.push(n, n + 1, n + 2);
  }
  for (const points of layout.walls) {
    if (!inside(points)) continue;
    const n = mesh.positions.length / 3;
    points.forEach((p, i) => { mesh.positions.push(...p); mesh.kinds.push(i < 2 ? 5 : 6); });
    mesh.indices.push(n, n + 2, n + 1, n, n + 3, n + 2);
  }
}
