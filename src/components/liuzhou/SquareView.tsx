"use client";

import { memo, useEffect, useMemo, useRef } from "react";
import * as T from "three";
import layout from "./square-layout.json";
import { SQUARE_CROWNS, SQUARE_DECOR, SQUARE_LABELS, SQUARE_SOLIDS } from "./square";
import { terrainHeight } from "./terrain";
import { terrainDrapedTriangles, terrainTriangleHeight } from "./terrainMesh";
import { pavingWithoutEntrances } from "./underground";

function SquareView() {
  const ref = useRef<T.InstancedMesh>(null); const treesRef = useRef<T.InstancedMesh>(null); const nozzleRef = useRef<T.InstancedMesh>(null);
  const boxes = useMemo(() => [...SQUARE_SOLIDS, ...SQUARE_DECOR], []);
  const { ground, labels, atlas, stone } = useMemo(() => {
    const vertices: number[] = []; const colors: number[] = []; const groundUV: number[] = []; const color = new T.Color();
    for (const surface of [...layout.surfaces, ...layout.sourceFountain.surfaces.map(s => ({ ...s, kind: 'fountain' }))]) {
      color.set(surface.color);
      const ring = surface.points.map(([x, z]) => ({ x, z }));
      for (const piece of pavingWithoutEntrances(ring)) for (const face of terrainDrapedTriangles(piece)) for (const p of face) {
        vertices.push(p.x, terrainTriangleHeight(p) + 0.18, p.z); colors.push(color.r, color.g, color.b);
        groundUV.push(...(surface.kind === 'lawn' ? [0.25, 0.25] : [p.x / 1.2, p.z / 1.8]));
      }
    }
    const groundGeometry = new T.BufferGeometry(); groundGeometry.setAttribute("position", new T.Float32BufferAttribute(vertices, 3)); groundGeometry.setAttribute("color", new T.Float32BufferAttribute(colors, 3)); groundGeometry.setAttribute('uv', new T.Float32BufferAttribute(groundUV, 2)); groundGeometry.computeVertexNormals();
    // One repeated texture supplies metre-scale granite joints, without adding
    // a separate polygon for each slab. Lawn UVs sample the plain slab interior.
    const stoneCanvas = document.createElement('canvas'); stoneCanvas.width = 256; stoneCanvas.height = 256;
    const stoneCtx = stoneCanvas.getContext('2d')!;
    for (let row = 0; row < 2; row++) for (let col = 0; col < 2; col++) {
      stoneCtx.fillStyle = ['#f6f5f2', '#faf9f7', '#f8f8f4', '#f4f3ef'][row * 2 + col];
      stoneCtx.fillRect(col * 128, row * 128, 128, 128);
    }
    for (let i = 0; i < 1800; i++) {
      stoneCtx.fillStyle = i % 2 ? '#ffffff0b' : '#575d5a09';
      stoneCtx.fillRect((i * 73 + 17) % 256, (i * i * 29 + 31) % 256, 1, 1);
    }
    stoneCtx.fillStyle = '#c8c9c2';
    for (const v of [0, 128]) { stoneCtx.fillRect(v, 0, 1, 256); stoneCtx.fillRect(0, v, 256, 1); }
    const stoneTexture = new T.CanvasTexture(stoneCanvas); stoneTexture.colorSpace = T.SRGBColorSpace;
    stoneTexture.wrapS = T.RepeatWrapping; stoneTexture.wrapT = T.RepeatWrapping; stoneTexture.anisotropy = 8;
    const styles = Array.from(new Set(SQUARE_LABELS.map(s => `${s.text}|${s.color}`)));
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
    for (const sign of SQUARE_LABELS) {
      const i = styles.indexOf(`${sign.text}|${sign.color}`); const left = ((i % 4) * 512 + 2) / canvas.width; const right = (((i % 4) + 1) * 512 - 2) / canvas.width;
      const top = 1 - (Math.floor(i / 4) * 128 + 2) / canvas.height; const bottom = 1 - ((Math.floor(i / 4) + 1) * 128 - 2) / canvas.height;
      for (const [x, y, u, v] of [[-1, -1, left, bottom], [1, -1, right, bottom], [1, 1, right, top], [-1, -1, left, bottom], [1, 1, right, top], [-1, 1, left, top]]) {
        const across = (x * sign.width) / 2; const up = (y * sign.height) / 2;
        const px = sign.at[0] + across * Math.cos(sign.angle); const pz = sign.at[2] - across * Math.sin(sign.angle);
        labelVertices.push(px, sign.flat ? terrainTriangleHeight({ x: px, z: pz - up }) + 0.237 : sign.at[1] + up, sign.flat ? pz - up : pz); uv.push(u, v);
      }
    }
    const labelGeometry = new T.BufferGeometry(); labelGeometry.setAttribute("position", new T.Float32BufferAttribute(labelVertices, 3)); labelGeometry.setAttribute("uv", new T.Float32BufferAttribute(uv, 2)); labelGeometry.computeVertexNormals();
    return { ground: groundGeometry, labels: labelGeometry, atlas: labelTexture, stone: stoneTexture };
  }, []);
  useEffect(() => () => { ground.dispose(); labels.dispose(); atlas.dispose(); stone.dispose(); }, [ground, labels, atlas, stone]);
  useEffect(() => {
    const mesh = ref.current; const trees = treesRef.current; if (!mesh || !trees) return;
    const matrix = new T.Matrix4(); const q = new T.Quaternion(); const color = new T.Color();
    boxes.forEach((box, i) => {
      q.setFromAxisAngle(new T.Vector3(0, 1, 0), box.angle || 0);
      matrix.compose(new T.Vector3(box.at[0], terrainHeight({ x: box.at[0], z: box.at[2] }) + box.at[1], box.at[2]), q, new T.Vector3(...box.size));
      mesh.setMatrixAt(i, matrix); mesh.setColorAt(i, color.set(box.color));
    });
    mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; mesh.computeBoundingSphere();
    SQUARE_CROWNS.forEach((tree, i) => { matrix.makeScale(...tree.scale); matrix.setPosition(...tree.at); trees.setMatrixAt(i, matrix); });
    trees.instanceMatrix.needsUpdate = true; trees.computeBoundingSphere();
    const nozzles = nozzleRef.current;
    if (nozzles) {
      layout.sourceFountain.nozzles.forEach(([x, z], i) => { matrix.makeTranslation(x, terrainTriangleHeight({ x, z }) + 0.197, z); nozzles.setMatrixAt(i, matrix); });
      nozzles.instanceMatrix.needsUpdate = true; nozzles.computeBoundingSphere();
    }
  }, [boxes]);
  return (
    <group name="人民广场与文化建筑·估算重建">
      <mesh geometry={ground} receiveShadow><meshStandardMaterial map={stone} vertexColors roughness={0.96} side={T.DoubleSide} polygonOffset polygonOffsetFactor={-3} polygonOffsetUnits={-3} /></mesh>
      <instancedMesh ref={nozzleRef} args={[undefined, undefined, layout.sourceFountain.nozzles.length]}><cylinderGeometry args={[0.12, 0.12, 0.025, 12]} /><meshStandardMaterial color="#b7af87" roughness={0.4} metalness={0.55} /></instancedMesh>
      <instancedMesh ref={ref} args={[undefined, undefined, boxes.length]} castShadow receiveShadow><boxGeometry /><meshStandardMaterial roughness={0.82} /></instancedMesh>
      <instancedMesh ref={treesRef} args={[undefined, undefined, SQUARE_CROWNS.length]} castShadow><icosahedronGeometry args={[1, 2]} /><meshStandardMaterial color="#547751" roughness={0.95} /></instancedMesh>
      <mesh geometry={labels}><meshStandardMaterial map={atlas} roughness={0.87} /></mesh>
    </group>
  );
}
export default memo(SquareView);
