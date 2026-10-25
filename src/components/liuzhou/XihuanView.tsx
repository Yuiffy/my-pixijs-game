"use client";

import { memo, useEffect, useMemo, useRef } from "react";
import * as T from "three";
import layout from "./xihuan-layout.json";
import { XIHUAN_CROWNS, XIHUAN_DECOR, XIHUAN_HOOPS, XIHUAN_LABELS, XIHUAN_SOLIDS } from "./xihuan";
import { terrainHeight } from "./terrain";
import { terrainDrapedTriangles, terrainTriangleHeight } from "./terrainMesh";
import { pavingWithoutEntrances } from "./underground";

function XihuanView() {
  const ref = useRef<T.InstancedMesh>(null); const treesRef = useRef<T.InstancedMesh>(null);
  const boxes = useMemo(() => [...XIHUAN_SOLIDS, ...XIHUAN_DECOR], []);
  const { ground, labels, atlas } = useMemo(() => {
    const vertices: number[] = []; const colors: number[] = []; const color = new T.Color();
    for (const surface of layout.surfaces) {
      color.set(surface.color);
      const ring = surface.points.map(([x, z]) => ({ x, z }));
      for (const piece of pavingWithoutEntrances(ring)) for (const face of terrainDrapedTriangles(piece)) for (const p of face) {
        vertices.push(p.x, terrainTriangleHeight(p) + surface.offset, p.z); colors.push(color.r, color.g, color.b);
      }
    }
    const groundGeometry = new T.BufferGeometry(); groundGeometry.setAttribute("position", new T.Float32BufferAttribute(vertices, 3)); groundGeometry.setAttribute("color", new T.Float32BufferAttribute(colors, 3)); groundGeometry.computeVertexNormals();
    const styles = Array.from(new Set(XIHUAN_LABELS.map(s => `${s.text}|${s.color}`)));
    const canvas = document.createElement("canvas"); canvas.width = 2048; canvas.height = Math.ceil(styles.length / 4) * 128;
    const ctx = canvas.getContext("2d")!;
    styles.forEach((style, i) => {
      const [text, ink] = style.split("|"); const x = (i % 4) * 512; const y = Math.floor(i / 4) * 128;
      ctx.fillStyle = ink; ctx.fillRect(x, y, 512, 128); ctx.fillStyle = text.length === 1 ? "#3b3425" : "#e6ddba";
      ctx.font = 'bold 78px "Microsoft YaHei", sans-serif'; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.save(); ctx.translate(x + 256, y + 67); ctx.scale(text.length === 1 ? 4 : 1, 1); ctx.fillText(text, 0, 0, text.length === 1 ? 120 : 490); ctx.restore();
    });
    const labelTexture = new T.CanvasTexture(canvas); labelTexture.colorSpace = T.SRGBColorSpace; labelTexture.anisotropy = 4;
    const labelVertices: number[] = []; const uv: number[] = [];
    for (const sign of XIHUAN_LABELS) {
      const i = styles.indexOf(`${sign.text}|${sign.color}`); const left = ((i % 4) * 512 + 2) / canvas.width; const right = (((i % 4) + 1) * 512 - 2) / canvas.width;
      const top = 1 - (Math.floor(i / 4) * 128 + 2) / canvas.height; const bottom = 1 - ((Math.floor(i / 4) + 1) * 128 - 2) / canvas.height;
      for (const [x, y, u, v] of [[-1, -1, left, bottom], [1, -1, right, bottom], [1, 1, right, top], [-1, -1, left, bottom], [1, 1, right, top], [-1, 1, left, top]]) {
        const across = (x * sign.width) / 2; const up = (y * sign.height) / 2;
        const px = sign.at[0] + across * Math.cos(sign.angle); const pz = sign.at[2] - across * Math.sin(sign.angle);
        labelVertices.push(px, sign.at[1] + up, pz); uv.push(u, v);
      }
    }
    const labelGeometry = new T.BufferGeometry(); labelGeometry.setAttribute("position", new T.Float32BufferAttribute(labelVertices, 3)); labelGeometry.setAttribute("uv", new T.Float32BufferAttribute(uv, 2)); labelGeometry.computeVertexNormals();
    return { ground: groundGeometry, labels: labelGeometry, atlas: labelTexture };
  }, []);
  useEffect(() => () => { ground.dispose(); labels.dispose(); atlas.dispose(); }, [ground, labels, atlas]);
  useEffect(() => {
    const mesh = ref.current; const trees = treesRef.current; if (!mesh || !trees) return;
    const matrix = new T.Matrix4(); const q = new T.Quaternion(); const color = new T.Color();
    boxes.forEach((box, i) => {
      q.setFromAxisAngle(new T.Vector3(0, 1, 0), box.angle || 0);
      matrix.compose(new T.Vector3(box.at[0], terrainHeight({ x: box.at[0], z: box.at[2] }) + box.at[1], box.at[2]), q, new T.Vector3(...box.size));
      mesh.setMatrixAt(i, matrix); mesh.setColorAt(i, color.set(box.color));
    });
    mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; mesh.computeBoundingSphere();
    XIHUAN_CROWNS.forEach((tree, i) => { matrix.makeScale(...tree.scale); matrix.setPosition(...tree.at); trees.setMatrixAt(i, matrix); });
    trees.instanceMatrix.needsUpdate = true; trees.computeBoundingSphere();
  }, [boxes]);
  return (
    <group name="西环路与鹅山路·来源路口与估算街景">
      <mesh geometry={ground} receiveShadow><meshStandardMaterial vertexColors roughness={0.96} side={T.DoubleSide} polygonOffset polygonOffsetFactor={-3} polygonOffsetUnits={-3} /></mesh>
      <instancedMesh ref={ref} args={[undefined, undefined, boxes.length]} castShadow receiveShadow><boxGeometry /><meshStandardMaterial roughness={0.82} /></instancedMesh>
      <instancedMesh ref={treesRef} args={[undefined, undefined, XIHUAN_CROWNS.length]} castShadow><icosahedronGeometry args={[1, 2]} /><meshStandardMaterial color="#547751" roughness={0.95} /></instancedMesh>
      {XIHUAN_HOOPS.map((at, i) => <mesh key={i} position={at} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.24, 0.035, 5, 12]} /><meshStandardMaterial color="#b17e57" roughness={0.8} /></mesh>)}
      <mesh geometry={labels}><meshStandardMaterial map={atlas} roughness={0.87} /></mesh>
    </group>
  );
}
export default memo(XihuanView);
