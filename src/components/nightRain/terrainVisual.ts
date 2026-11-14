import * as THREE from 'three';
import type { Surface } from './types';
import { foundationCells, isSpanningDeck, surfaceHeight } from './terrain';

type Point = [number, number, number];
export type CliffVertex = { point: Point; inset: number; depth: number; shade: number; moss: number };

const wave = (x: number, z: number, y: number) => Math.sin(x * 1.17 + z * 0.91 + y * 2.3) * 0.5 + Math.cos(x * 2.71 - z * 1.89 + y * 0.83) * 0.25;

/** All relief retreats into the existing foundation. Exact rim/soffit/cell
 * boundaries keep the walkable outline and lower-route headroom unchanged. */
export function cliffVertex(a: Point, b: Point, bottomA: number, bottomB: number, u: number, v: number): CliffVertex {
  const x = a[0] + (b[0] - a[0]) * u; const z = a[2] + (b[2] - a[2]) * u;
  const top = a[1] + (b[1] - a[1]) * u; const bottom = bottomA + (bottomB - bottomA) * u;
  const y = top + (bottom - top) * v; const depth = top - y;
  const span = Math.hypot(b[0] - a[0], b[2] - a[2]);
  const edge = Math.min(1, u * span * 2, (1 - u) * span * 2, depth * 2, (y - bottom) * 2);
  const layer = Math.sin(y * 3.3 + Math.sin(x * 0.31 + z * 0.27) * 0.6);
  const fracture = Math.max(0, wave(x, z, Math.floor(y / 1.7)));
  // The shallow contact band stays within an eight-centimetre material relief.
  const inset = Math.max(0, edge) * (depth > 3 ? 0.22 : 0.08) * Math.min(1, 0.16 + fracture + Math.max(0, -layer) * 0.32);
  const point: Point = [x - ((b[2] - a[2]) / span) * inset, y, z + ((b[0] - a[0]) / span) * inset];
  const seam = Math.max(0, 1 - Math.abs(layer + 0.55) * 5);
  const moss = Math.max(0, wave(x * 0.34, z * 0.34, y * 0.18) + 0.1) * Math.min(1, depth);
  return { point, inset, depth, shade: 0.94 + layer * 0.08 + wave(x, z, y) * 0.08 - seam * 0.2, moss };
}

/** A static mesh: one material and no per-frame procedural work. Weathered
 * faces remain inside the same cells used by the real solid-earth collider. */
export function createTerrainGeometry(surfaces: Surface[]) {
  const positions: number[] = []; const uvs: number[] = []; const colors: number[] = []; const indices: number[] = [];
  const tint = new THREE.Color(); const rock = new THREE.Color('#a49b82'); const damp = new THREE.Color('#566458');
  const face = (a: Point, b: Point, bottomA: number, bottomB: number, detailed: boolean) => {
    const horizontal = Math.hypot(b[0] - a[0], b[2] - a[2]);
    const rows = Math.max(1, Math.ceil(Math.max(a[1] - bottomA, b[1] - bottomB) / (detailed ? 0.8 : 3)));
    const columns = Math.max(1, Math.ceil(horizontal / (detailed ? 1.2 : 4)));
    const offset = positions.length / 3;
    for (let x = 0; x <= columns; x++) for (let y = 0; y <= rows; y++) {
      const vertex = cliffVertex(a, b, bottomA, bottomB, x / columns, y / rows); const p = vertex.point;
      tint.copy(rock).lerp(damp, vertex.moss * 0.5).multiplyScalar(vertex.shade);
      positions.push(...p); colors.push(tint.r, tint.g, tint.b);
      uvs.push((Math.abs(b[0] - a[0]) > 0.1 ? p[0] : p[2]) / 5.5, p[1] / 4.5);
    }
    for (let x = 0; x < columns; x++) for (let y = 0; y < rows; y++) {
      const aIndex = offset + x * (rows + 1) + y; const bIndex = aIndex + rows + 1;
      indices.push(aIndex, bIndex, bIndex + 1, aIndex, bIndex + 1, aIndex + 1);
    }
  };
  surfaces.filter(s => s.y >= -10 && !isSpanningDeck(s)).forEach(s => {
    const detailed = s.z1 > -90 && s.x1 > -70 && s.x2 < 70;
    for (const c of foundationCells(s, surfaces)) {
      const ya = surfaceHeight(s, c.z1) - 0.08; const yb = surfaceHeight(s, c.z2) - 0.08;
      face([c.x1, ya, c.z1], [c.x2, ya, c.z1], c.bottom, c.bottom, detailed);
      face([c.x2, yb, c.z2], [c.x1, yb, c.z2], c.endBottom, c.endBottom, detailed);
      face([c.x1, yb, c.z2], [c.x1, ya, c.z1], c.endBottom, c.bottom, detailed);
      face([c.x2, ya, c.z1], [c.x2, yb, c.z2], c.bottom, c.endBottom, detailed);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(indices);
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals(); return geometry;
}
