"use client";

import { memo, useEffect, useMemo } from "react";
import * as T from "three";
import { HILL_PATCHES, inMappedRiver, RIVER_POLYGONS, terrainElevation, terrainHeight, TERRAIN_GRID, WATER_LEVEL } from "./terrain";

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
      const step = hillDetail ? 10 : nearest < 2100 ? 20 : nearest < 4300 ? 40 : nearest < 7200 ? 80 : 160;
      const width = Math.min(chunk, TERRAIN_GRID.maxX - x);
      const depth = Math.min(chunk, TERRAIN_GRID.maxZ - z);
      const cols = Math.ceil(width / step) + 1;
      const rows = Math.ceil(depth / step) + 1;
      const start = positions.length / 3;
      for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
        const p = { x: x + Math.min(width, col * step), z: z + Math.min(depth, row * step) };
        const height = terrainHeight(p);
        positions.push(p.x, height - 0.12, p.z);
        const elevation = terrainElevation(p);
        const slope = Math.hypot(terrainElevation({ x: p.x + 20, z: p.z }) - elevation, terrainElevation({ x: p.x, z: p.z + 20 }) - elevation) / 20;
        const green = elevation > 125 || slope > 0.38;
        color.set(inMappedRiver(p) ? "#597a70" : green ? "#668873" : "#abb49a");
        if (green && slope > 1.1) color.lerp(new T.Color("#a3a69b"), 0.38);
        colors.push(color.r, color.g, color.b);
      }
      for (let row = 0; row < rows - 1; row++) for (let col = 0; col < cols - 1; col++) {
        const a = start + row * cols + col;
        indices.push(a, a + cols, a + 1, a + 1, a + cols, a + cols + 1);
      }
      // Vertical skirts hide cracks between terrain LODs without extra actors.
      for (const edge of [Array.from({ length: cols }, (_, i) => start + i), Array.from({ length: cols }, (_, i) => start + (rows - 1) * cols + i), Array.from({ length: rows }, (_, i) => start + i * cols), Array.from({ length: rows }, (_, i) => start + i * cols + cols - 1)]) {
        for (let i = 1; i < edge.length; i++) {
          const a = edge[i - 1]; const b = edge[i];
          const index = positions.length / 3;
          positions.push(positions[a * 3], positions[a * 3 + 1] - 8, positions[a * 3 + 2], positions[b * 3], positions[b * 3 + 1] - 8, positions[b * 3 + 2]);
          colors.push(colors[a * 3], colors[a * 3 + 1], colors[a * 3 + 2], colors[b * 3], colors[b * 3 + 1], colors[b * 3 + 2]);
          indices.push(a, index, b, b, index, index + 1);
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
