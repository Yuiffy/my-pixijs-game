"use client";

import { memo, useEffect, useMemo } from "react";
import * as T from "three";
import layout from "./station-neighborhood-layout.json";
import { CitySign } from "./CityLabels";
import { STATION_NEIGHBORHOOD_BUILDINGS } from "./stationNeighborhoods";
import { terrainDrapedTriangles, terrainTriangleHeight } from "./terrainMesh";

function StationNeighborhoodsView() {
  const geometry = useMemo(() => {
    const positions: number[] = []; const colors: number[] = []; const color = new T.Color();
    for (const patch of layout.surfaces) {
      color.set(patch.color);
      for (const face of terrainDrapedTriangles(patch.points.map(([x, z]) => ({ x, z })))) for (const p of face) {
        positions.push(p.x, terrainTriangleHeight(p) + 0.06, p.z); colors.push(color.r, color.g, color.b);
      }
    }
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute(positions, 3)); g.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
    g.computeVertexNormals(); g.computeBoundingSphere(); return g;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <group name="柳州站周边源地块与估算院落">
      <mesh geometry={geometry} receiveShadow><meshStandardMaterial vertexColors side={T.DoubleSide} roughness={0.96} /></mesh>
      {layout.labels.map(label => {
        const wall = STATION_NEIGHBORHOOD_BUILDINGS.find(b => b.id === label.wallId)!;
        return <CitySign key={label.parcelId} text={label.text} at={[label.at[0], wall.baseY! + label.height, label.at[1]]} angle={label.angle} width={Math.min(5.6, label.text.length * 0.6 + 0.8)} height={0.65} />;
      })}
    </group>
  );
}

export default memo(StationNeighborhoodsView);
