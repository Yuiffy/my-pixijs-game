'use client';

import { memo, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { SURFACES } from './world';
import { createTerrainGeometry } from './terrainVisual';
import { createEarthTexture } from './earthTexture';
import TerrainBackdrop from './TerrainBackdrop';
import GeometryBatch, { type StoneBox } from './GeometryBatch';
import StaticDistrict from './StaticDistrict';

/** One textured mesh per district, with real ramp-shaped foundations and cutouts
 * above lower paths. No per-frame work and no extra textures per street. */
function TerrainView() {
  const texture = useMemo(createEarthTexture, []);
  const geometry = useMemo(() => createTerrainGeometry(SURFACES), []);
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
