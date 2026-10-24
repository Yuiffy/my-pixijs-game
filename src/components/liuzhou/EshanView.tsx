"use client";

import { memo, useEffect, useMemo, useRef } from "react";
import * as T from "three";
import layout from "./eshan-layout.json";
import { ESHAN_DECOR, ESHAN_HIDDEN, ESHAN_RAILS, ESHAN_SIGNS, ESHAN_SOLIDS, ESHAN_TREES } from "./eshan";
import { terrainHeight } from "./terrain";
import { CitySign } from "./CityLabels";
import { cityTexture } from "./textures";
import { ESHAN_PAVING_OFFSET } from "./eshanSurface";

function EshanView() {
  const boxesRef = useRef<T.InstancedMesh>(null); const crownsRef = useRef<T.InstancedMesh>(null);
  const railsRef = useRef<T.InstancedMesh>(null);
  const boxes = useMemo(() => [...ESHAN_SOLIDS.filter(b => !ESHAN_HIDDEN.has(b)), ...ESHAN_DECOR], []);
  const texture = useMemo(() => cityTexture("stone"), []);
  const paving = useMemo(() => {
    const vertices: number[] = []; const uv: number[] = [];
    for (const face of layout.faces) for (const index of face) {
      const p = layout.vertices[index]; vertices.push(p[0], p[1] + ESHAN_PAVING_OFFSET, p[2]); uv.push(p[0] / 3, p[2] / 3);
    }
    const geometry = new T.BufferGeometry(); geometry.setAttribute("position", new T.Float32BufferAttribute(vertices, 3)); geometry.setAttribute("uv", new T.Float32BufferAttribute(uv, 2)); geometry.computeVertexNormals(); return geometry;
  }, []);
  useEffect(() => () => { texture.dispose(); paving.dispose(); }, [texture, paving]);
  useEffect(() => {
    const mesh = boxesRef.current; const trees = crownsRef.current; if (!mesh || !trees) return;
    const matrix = new T.Matrix4(); const q = new T.Quaternion(); const color = new T.Color(); const up = new T.Vector3(0, 1, 0);
    boxes.forEach((b, i) => { q.setFromAxisAngle(up, b.angle); matrix.compose(new T.Vector3(b.at[0], b.at[1] + terrainHeight({ x: b.at[0], z: b.at[2] }), b.at[2]), q, new T.Vector3(...b.size)); mesh.setMatrixAt(i, matrix); mesh.setColorAt(i, color.set(b.color)); });
    ESHAN_TREES.forEach((tree, i) => {
      for (let layer = 0; layer < 2; layer++) {
        const scale = layer ? 0.68 : 1;
        matrix.makeScale(tree.radius * scale, tree.height * (layer ? 0.28 : 0.39), tree.radius * scale);
        matrix.setPosition(tree.x + (layer ? tree.radius * 0.22 : 0), tree.y + tree.height * (layer ? 0.95 : 0.72), tree.z);
        trees.setMatrixAt(i * 2 + layer, matrix); trees.setColorAt(i * 2 + layer, color.set(tree.color));
      }
    });
    for (const batch of [mesh, trees]) { batch.instanceMatrix.needsUpdate = true; if (batch.instanceColor) batch.instanceColor.needsUpdate = true; batch.computeBoundingSphere(); }
    const rails = railsRef.current;
    if (rails) {
      ESHAN_RAILS.forEach((r, i) => { const a = new T.Vector3(...r.a); const b = new T.Vector3(...r.b); const delta = b.clone().sub(a); q.setFromUnitVectors(up, delta.clone().normalize()); matrix.compose(a.add(b).multiplyScalar(0.5), q, new T.Vector3(0.055, delta.length(), 0.055)); rails.setMatrixAt(i, matrix); });
      rails.instanceMatrix.needsUpdate = true; rails.computeBoundingSphere();
    }
  }, [boxes]);
  return (
    <group name="鹅山公园·源路径与估算登山设施">
      <mesh geometry={paving} receiveShadow><meshStandardMaterial map={texture} roughness={0.97} side={T.DoubleSide} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} /></mesh>
      <instancedMesh ref={boxesRef} args={[undefined, undefined, boxes.length]} castShadow receiveShadow><boxGeometry /><meshStandardMaterial roughness={0.9} /></instancedMesh>
      <instancedMesh ref={crownsRef} args={[undefined, undefined, ESHAN_TREES.length * 2]} castShadow><icosahedronGeometry args={[1, 1]} /><meshStandardMaterial roughness={0.96} /></instancedMesh>
      <instancedMesh ref={railsRef} args={[undefined, undefined, ESHAN_RAILS.length]}><cylinderGeometry args={[1, 1, 1, 6]} /><meshStandardMaterial color="#596c5b" roughness={0.8} /></instancedMesh>
      {ESHAN_SIGNS.map((s, i) => <CitySign key={i} text={s.text} at={[s.p.x, s.y, s.p.z]} width={s.width} angle={s.angle} />)}
    </group>
  );
}
export default memo(EshanView);
