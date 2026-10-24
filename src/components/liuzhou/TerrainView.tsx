"use client";

import { memo, useEffect, useMemo } from "react";
import * as T from "three";
import { HILL_PATCHES, inMappedRiver, RIVER_POLYGONS, terrainElevation, terrainHeight, TERRAIN_GRID, WATER_LEVEL } from "./terrain";
import { terrainDrawHeight, terrainSurface } from "./terrainMesh";
import { eshanSurfaceHeight } from "./eshanSurface";

/** Static terrain LOD: fine around the playable streets and central hills,
 * coarser in the outer skyline. All heights come from the same unscaled DEM.
 */
function terrainGeometry() {
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const color = new T.Color();
  const chunk = 800;
  for (let z = TERRAIN_GRID.minZ; z < TERRAIN_GRID.maxZ; z += chunk) {
    for (let x = TERRAIN_GRID.minX; x < TERRAIN_GRID.maxX; x += chunk) {
      const nearest = Math.hypot(Math.max(0, Math.abs(x + chunk / 2) - chunk / 2), Math.max(0, Math.abs(z + chunk / 2) - chunk / 2));
      const hillDetail = HILL_PATCHES.some(p => x < p.minX + (p.cols - 1) * p.sampleStepMeters && x + chunk > p.minX && z < p.minZ + (p.rows - 1) * p.sampleStepMeters && z + chunk > p.minZ);
      const playable = x < 700 && x + chunk > -660 && z < 1200 && z + chunk > -560;
      const step = playable || hillDetail ? 10 : nearest < 2100 ? 20 : nearest < 4300 ? 40 : nearest < 7200 ? 80 : 160;
      const width = Math.min(chunk, TERRAIN_GRID.maxX - x);
      const depth = Math.min(chunk, TERRAIN_GRID.maxZ - z);
      const cols = Math.ceil(width / step) + 1;
      const rows = Math.ceil(depth / step) + 1;
      const start = positions.length / 3;
      const surface = terrainSurface({ minX: x, minZ: z, maxX: x + width, maxZ: z + depth }, step, rings => T.ShapeUtils.triangulateShape(rings[0].map(p => new T.Vector2(p[0], p[1])), rings.slice(1).map(ring => ring.map(p => new T.Vector2(p[0], p[1])))));
      for (let i = 0; i < surface.positions.length; i += 3) {
        const p = { x: surface.positions[i], z: surface.positions[i + 2] };
        const kind = surface.kinds[i / 3];
        positions.push(p.x, terrainDrawHeight(surface.positions[i + 1], kind), p.z);
        const elevation = terrainElevation(p);
        const slope = Math.hypot(terrainElevation({ x: p.x + 20, z: p.z }) - elevation, terrainElevation({ x: p.x, z: p.z + 20 }) - elevation) / 20;
        const green = elevation > 125 || slope > 0.38;
        color.set(kind === 4 ? "#b8baa6" : kind === 5 || kind === 6 ? "#929882" : kind === 1 ? "#597a70" : kind === 2 ? "#a3aa96" : kind === 3 ? "#717f72" : green ? "#668873" : "#abb49a");
        if (green && slope > 1.1) color.lerp(new T.Color("#a3a69b"), 0.38);
        colors.push(color.r, color.g, color.b);
      }
      for (const index of surface.indices) indices.push(start + index);
      // Vertical skirts hide cracks between terrain LODs without extra actors.
      for (const edge of [Array.from({ length: cols }, (_, i) => ({ x: x + Math.min(width, i * step), z })), Array.from({ length: cols }, (_, i) => ({ x: x + Math.min(width, i * step), z: z + depth })), Array.from({ length: rows }, (_, i) => ({ x, z: z + Math.min(depth, i * step) })), Array.from({ length: rows }, (_, i) => ({ x: x + width, z: z + Math.min(depth, i * step) }))]) {
        for (let i = 1; i < edge.length; i++) {
          const a = edge[i - 1]; const b = edge[i];
          if (eshanSurfaceHeight({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }) !== undefined || eshanSurfaceHeight(a) !== undefined || eshanSurfaceHeight(b) !== undefined) continue;
          const index = positions.length / 3;
          const ay = terrainHeight(a) - 0.12; const by = terrainHeight(b) - 0.12;
          positions.push(a.x, ay, a.z, b.x, by, b.z, a.x, ay - 8, a.z, b.x, by - 8, b.z);
          color.set(inMappedRiver(a) ? "#597a70" : "#8b9a81");
          for (let j = 0; j < 4; j++) colors.push(color.r, color.g, color.b);
          indices.push(index, index + 2, index + 1, index + 1, index + 2, index + 3);
        }
      }
    }
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

export const RiverSurface = memo(() => {
  const geometry = useMemo(() => {
    const shapes = RIVER_POLYGONS.map((area) => {
      const shape = new T.Shape(area.outer.map((p) => new T.Vector2(p[0], -p[1])));
      shape.holes = area.holes.map((hole) => new T.Path(hole.map((p) => new T.Vector2(p[0], -p[1]))));
      return shape;
    });
    return new T.ShapeGeometry(shapes);
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
<mesh name="柳江公开岸线水面" geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} position={[0, WATER_LEVEL, 0]}>
    <meshStandardMaterial color="#438d88" roughness={0.28} metalness={0.15} side={T.DoubleSide} />
  </mesh>
);
});

export default memo(() => {
  const geometry = useMemo(terrainGeometry, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
<>
    <mesh name="柳州公开DEM地形" geometry={geometry} receiveShadow>
      <meshStandardMaterial vertexColors roughness={0.96} side={T.DoubleSide} />
    </mesh>
    <RiverSurface />
  </>
);
});
