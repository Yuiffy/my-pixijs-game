'use client';

import { memo, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { SURFACES } from './world';
import { foundationCells, isSpanningDeck, surfaceHeight } from './terrain';
import { createEarthTexture } from './earthTexture';
import TerrainBackdrop from './TerrainBackdrop';
import GeometryBatch, { type StoneBox } from './GeometryBatch';
import StaticDistrict from './StaticDistrict';

/** One textured mesh per district, with real ramp-shaped foundations and cutouts
 * above lower paths. No per-frame work and no extra textures per street. */
function TerrainView() {
  const texture = useMemo(createEarthTexture, []);
  const geometry = useMemo(() => {
    const positions: number[] = []; const uvs: number[] = []; const colors: number[] = [];
    const tint = new THREE.Color();
    const face = (a: number[], b: number[], c: number[], d: number[], seed: number) => {
      const horizontal = Math.hypot(b[0] - a[0], b[2] - a[2]);
      const rows = Math.max(1, Math.ceil(Math.abs(a[1] - d[1]) / 1.4));
      const columns = Math.max(1, Math.ceil(horizontal / 2.4));
      const point = (u: number, v: number) => [a[0] + (b[0] - a[0]) * u, (a[1] + (b[1] - a[1]) * u) * (1 - v) + (d[1] + (c[1] - d[1]) * u) * v, a[2] + (b[2] - a[2]) * u];
      for (let x = 0; x < columns; x++) for (let y = 0; y < rows; y++) {
        const corners = [point(x / columns, y / rows), point((x + 1) / columns, y / rows), point((x + 1) / columns, (y + 1) / rows), point(x / columns, (y + 1) / rows)];
        const noise = Math.sin(seed * 31 + x * 17 + y * 43) * 0.5 + 0.5;
        tint.set('#868774');
        tint.multiplyScalar(0.82 + noise * 0.12);
        for (const index of [0, 1, 2, 0, 2, 3]) {
          const p = corners[index]; positions.push(...p); colors.push(tint.r, tint.g, tint.b);
          uvs.push((Math.abs(b[0] - a[0]) > 0.1 ? p[0] : p[2]) / 3, p[1] / 2);
        }
      }
    };
    SURFACES.filter(s => s.y >= -10 && !isSpanningDeck(s)).forEach((s, index) => {
      for (const c of foundationCells(s, SURFACES)) {
        const ya = surfaceHeight(s, c.z1) - 0.08; const yb = surfaceHeight(s, c.z2) - 0.08;
        const ba = c.bottom; const bb = c.endBottom;
        face([c.x1, ya, c.z1], [c.x2, ya, c.z1], [c.x2, ba, c.z1], [c.x1, ba, c.z1], index);
        face([c.x2, yb, c.z2], [c.x1, yb, c.z2], [c.x1, bb, c.z2], [c.x2, bb, c.z2], index + 1);
        face([c.x1, yb, c.z2], [c.x1, ya, c.z1], [c.x1, ba, c.z1], [c.x1, bb, c.z2], index + 2);
        face([c.x2, ya, c.z1], [c.x2, yb, c.z2], [c.x2, bb, c.z2], [c.x2, ba, c.z1], index + 3);
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); g.computeVertexNormals();
    return g;
  }, []);
  const arches = useMemo(() => {
    const boxes: StoneBox[] = [];
    for (const s of SURFACES.filter(q => /bridge/.test(q.id) && q.y >= 0 && q.endY === undefined)) {
      // Do not put an arch across a lower playable street.
      if (SURFACES.some(q => q !== s && q.y < s.y - 1 && q.x2 > s.x1 && q.x1 < s.x2 && q.z2 > s.z1 && q.z1 < s.z2)) continue;
      const alongX = s.x2 - s.x1 > s.z2 - s.z1;
      const span = alongX ? s.x2 - s.x1 : s.z2 - s.z1;
      const width = alongX ? s.z2 - s.z1 : s.x2 - s.x1;
      const count = Math.max(1, Math.ceil(span / 13)); const radius = span / count / 2;
      for (let n = 0; n < count; n++) {
        const cx = (s.x1 + s.x2) / 2; const cz = (s.z1 + s.z2) / 2;
        const offset = -span / 2 + radius + n * radius * 2;
        for (let i = 0; i < 15; i++) {
          const angle = ((i + 0.5) * Math.PI) / 15;
          const u = offset + Math.cos(angle) * radius; const y = s.y - radius - 0.55 + Math.sin(angle) * radius;
          boxes.push({ position: [cx + (alongX ? u : 0), y, cz + (alongX ? 0 : u)], size: [(Math.PI * radius) / 15 + 0.08, 0.6, width * 0.9], rotation: [0, alongX ? 0 : Math.PI / 2, angle - Math.PI / 2], color: i % 3 === 0 ? '#928772' : '#686f65' });
        }
      }
    }
    return boxes;
  }, []);
  useEffect(() => () => { texture.dispose(); geometry.dispose(); }, [texture, geometry]);
  return <StaticDistrict name="earth-and-arches"><mesh name="solid-terrain" geometry={geometry} receiveShadow castShadow><meshStandardMaterial map={texture} bumpMap={texture} bumpScale={0.16} vertexColors roughness={0.94} side={THREE.DoubleSide} /></mesh><GeometryBatch boxes={arches} /><TerrainBackdrop /></StaticDistrict>;
}
export default memo(TerrainView);
