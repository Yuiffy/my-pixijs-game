'use client';

import { memo, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { createEarthTexture } from './earthTexture';

// The far banks stand across water, beyond jump reach. The actual streets and
// explorable slopes are defined in terrain.ts, not hidden in these silhouettes.
const RIDGES = [
  [-100, 22, 22, 35, 25], [88, -100, 25, 52, 34], [-175, -170, 25, 65, 39],
  [-199, -243, 30, 81, 47], [-340, -390, 31, 58, 54], [3, -430, 31, 68, 70],
  [-215, -620, 36, 79, 66], [46, -675, 36, 93, 60], [-176, -849, 36, 89, 60],
];

function TerrainBackdrop() {
  const rock = useMemo(createEarthTexture, []);
  const geometry = useMemo(() => {
    const positions: number[] = []; const colors: number[] = []; const uvs: number[] = [];
    const tint = new THREE.Color(); const steps = 22;
    RIDGES.forEach(([cx, cz, radius, peak, depth], ridge) => {
      const point = (i: number, j: number) => {
        const u = (i / steps) * 2 - 1; const v = (j / steps) * 2 - 1;
        const distance = Math.sqrt(u * u + v * v);
        const dome = Math.max(0, 1 - distance);
        const erosion = 0.76 + Math.sin(u * 17 + v * 7 + ridge) * 0.08 + Math.cos(v * 19 - u * 5) * 0.07;
        const crown = dome ** 0.64 * erosion;
        return [cx + u * radius, -7 + crown * peak, cz + v * depth];
      };
      for (let x = 0; x < steps; x++) for (let z = 0; z < steps; z++) {
        const corners = [point(x, z), point(x + 1, z), point(x + 1, z + 1), point(x, z + 1)];
        for (const index of [0, 2, 1, 0, 3, 2]) {
          const p = corners[index]; const altitude = (p[1] + 7) / peak;
          tint.set(altitude > 0.5 ? '#717c70' : '#3e5a50'); tint.multiplyScalar(0.8 + altitude * 0.2);
          positions.push(...p); colors.push(tint.r, tint.g, tint.b); uvs.push(p[0] / 6, (p[1] + p[2]) / 7);
        }
      }
    });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.computeVertexNormals(); return g;
  }, []);
  useEffect(() => () => { rock.dispose(); geometry.dispose(); }, [rock, geometry]);
  return <mesh name="far-bank-mountain-ridges" geometry={geometry} receiveShadow><meshStandardMaterial map={rock} bumpMap={rock} bumpScale={0.22} vertexColors roughness={1} /></mesh>;
}
export default memo(TerrainBackdrop);
