"use client";

import { memo, useEffect, useMemo, useRef } from "react";
import * as T from "three";
import layout from "./riverside-layout.json";
import { terrainTriangleHeight } from "./terrainMesh";
import { urbanGroundPositions } from "./urbanGround";
import { treeClearsBridge } from "./bridges";
import { BUILDINGS, buildingContains } from "./world";
import RiversideDetailView from "./RiversideDetailView";

function RiversideView() {
  const trunkRef = useRef<T.InstancedMesh>(null); const crownRef = useRef<T.InstancedMesh>(null);
  const geometry = useMemo(() => {
    const positions: number[] = [];
    for (const patch of layout.surfaces) positions.push(...urbanGroundPositions({ id: `riverside-${patch.parkId}`, points: patch.points.map(([x, z]) => ({ x, z })), color: "#8b9e79" }));
    const result = new T.BufferGeometry(); result.setAttribute("position", new T.Float32BufferAttribute(positions, 3)); result.computeVertexNormals(); result.computeBoundingSphere(); return result;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const trees = useMemo(() => layout.trees.map(t => ({ x: t.at[0], z: t.at[1] })).filter(p => treeClearsBridge(p) && !BUILDINGS.some(b => buildingContains(p, b, 4))), []);
  useEffect(() => {
    const matrix = new T.Matrix4(); const color = new T.Color();
    trees.forEach((p, i) => {
      const ground = terrainTriangleHeight(p); const height = 3.6 + (i % 3) * 0.3;
      matrix.makeScale(0.4, height, 0.4); matrix.setPosition(p.x, ground + height / 2, p.z); trunkRef.current!.setMatrixAt(i, matrix);
      matrix.makeScale(2.5 + (i % 2) * 0.3, 3.1, 2.6); matrix.setPosition(p.x, ground + height + 1.5, p.z); crownRef.current!.setMatrixAt(i, matrix);
      crownRef.current!.setColorAt(i, color.set(i % 3 ? "#7e9970" : "#96a77c"));
    });
    for (const mesh of [trunkRef.current, crownRef.current]) if (mesh) { mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; mesh.computeBoundingSphere(); }
  }, [trees]);
  return (
    <group name="江滨公园与柳堤游园来源边界内的估算绿化">
      <RiversideDetailView />
      <mesh geometry={geometry} receiveShadow><meshStandardMaterial color="#8b9e79" roughness={1} side={T.DoubleSide} /></mesh>
      <instancedMesh ref={trunkRef} args={[undefined, undefined, trees.length]} castShadow><boxGeometry /><meshStandardMaterial color="#71765e" roughness={1} /></instancedMesh>
      <instancedMesh ref={crownRef} args={[undefined, undefined, trees.length]} castShadow><icosahedronGeometry args={[1, 1]} /><meshStandardMaterial roughness={1} /></instancedMesh>
    </group>
  );
}
export default memo(RiversideView);
