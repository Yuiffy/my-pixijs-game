"use client";

import { memo, useEffect, useMemo, useRef } from "react";
import * as T from "three";
import layout from "./riverside-detail-layout.json";
import { RIVERSIDE_DETAIL_BAY_IDS, RIVERSIDE_DETAIL_DECOR, RIVERSIDE_DETAIL_SOLIDS } from "./riversideDetail";
import { terrainHeight } from "./terrain";
import { urbanGroundPositions } from "./urbanGround";

function RiversideDetailView() {
  const ref = useRef<T.InstancedMesh>(null);
  const boxes = useMemo(() => [...RIVERSIDE_DETAIL_SOLIDS, ...RIVERSIDE_DETAIL_DECOR], []);
  const ground = useMemo(() => {
    const positions: number[] = [];
    const visible = new Set(RIVERSIDE_DETAIL_BAY_IDS);
    for (const bay of layout.restBays) {
      if (!visible.has(bay.id)) continue;
      const vertices = urbanGroundPositions({ id: bay.id, points: bay.points.map(([x, z]) => ({ x, z })), color: "#c4bc98" });
      for (let i = 1; i < vertices.length; i += 3) vertices[i] += 0.018;
      positions.push(...vertices);
    }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals(); geometry.computeBoundingSphere();
    return geometry;
  }, []);
  useEffect(() => () => ground.dispose(), [ground]);
  useEffect(() => {
    const mesh = ref.current; if (!mesh) return;
    const matrix = new T.Matrix4(); const q = new T.Quaternion(); const color = new T.Color();
    boxes.forEach((box, i) => {
      q.setFromAxisAngle(new T.Vector3(0, 1, 0), box.angle || 0);
      matrix.compose(new T.Vector3(box.at[0], terrainHeight({ x: box.at[0], z: box.at[2] }) + box.at[1], box.at[2]), q, new T.Vector3(...box.size));
      mesh.setMatrixAt(i, matrix); mesh.setColorAt(i, color.set(box.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [boxes]);
  return (
    <group name="柳堤来源步道旁的估算栏杆与休息点">
      <mesh geometry={ground} receiveShadow><meshStandardMaterial color="#c4bc98" roughness={0.95} side={T.DoubleSide} polygonOffset polygonOffsetFactor={-3} polygonOffsetUnits={-3} /></mesh>
      <instancedMesh ref={ref} args={[undefined, undefined, boxes.length]} castShadow receiveShadow><boxGeometry /><meshStandardMaterial roughness={0.88} /></instancedMesh>
    </group>
  );
}
export default memo(RiversideDetailView);
