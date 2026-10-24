"use client";

import { memo, useEffect, useMemo, useRef } from "react";
import * as T from "three";
import { MARKET_CROWNS, MARKET_DECOR, MARKET_SIGNS, MARKET_SOLIDS, marketPoint } from "./market";
import { terrainHeight } from "./terrain";
import { terrainDrapedTriangles, terrainTriangleHeight } from "./terrainMesh";
import east from "./market-east-layout.json";

function MarketView() {
  const boxesRef = useRef<T.InstancedMesh>(null);
  const crownsRef = useRef<T.InstancedMesh>(null);
  const boxes = useMemo(() => [...MARKET_SOLIDS, ...MARKET_DECOR], []);
  const { paving, signGeometry, atlas } = useMemo(() => {
    const pavingVertices: number[] = []; const pavingColors: number[] = [];
    const color = new T.Color();
    const pave = (points: { x: number; z: number }[], ink: string) => {
      color.set(ink);
      for (const face of terrainDrapedTriangles(points)) for (const p of face) {
        pavingVertices.push(p.x, terrainTriangleHeight(p) + 0.2, p.z); pavingColors.push(color.r, color.g, color.b);
      }
    };
    for (let n = 18; n < 280; n += 2) for (const side of [-1, 1]) {
      pave([marketPoint(n, side * 3.05), marketPoint(n, side * 9.6), marketPoint(n + 2, side * 9.6), marketPoint(n + 2, side * 3.05)], Math.floor(n / 2) % 6 === 0 ? "#b9b39d" : "#cbc0a4");
    }
    for (const [along, side] of [[165, 1], [229, -1]]) for (let n = along - 14; n < along + 14; n += 2) {
      pave([marketPoint(n, side * 9.6), marketPoint(n, side * 25.3), marketPoint(n + 2, side * 25.3), marketPoint(n + 2, side * 9.6)], "#b4ae92");
    }
    for (const surface of east.surfaces) pave(surface.points.map(p => ({ x: p[0], z: p[1] })), surface.color);
    const groundGeometry = new T.BufferGeometry();
    groundGeometry.setAttribute("position", new T.Float32BufferAttribute(pavingVertices, 3)); groundGeometry.setAttribute("color", new T.Float32BufferAttribute(pavingColors, 3)); groundGeometry.computeVertexNormals();

    // All cart and shop labels share one atlas and one draw call.
    const styles = Array.from(new Set(MARKET_SIGNS.map(s => `${s.text}|${s.color}`)));
    const rows = Math.ceil(styles.length / 4); const canvas = document.createElement("canvas"); canvas.width = 2048; canvas.height = rows * 128;
    const ctx = canvas.getContext("2d")!;
    styles.forEach((style, i) => {
      const [text, ink] = style.split("|"); const x = (i % 4) * 512; const y = Math.floor(i / 4) * 128;
      ctx.fillStyle = ink; ctx.fillRect(x, y, 512, 128); ctx.strokeStyle = "#e4d9b5"; ctx.lineWidth = 2; ctx.strokeRect(x + 6, y + 6, 500, 116);
      ctx.fillStyle = "#f2e3bb"; ctx.font = 'bold 68px "Microsoft YaHei", sans-serif'; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(text, x + 256, y + 66, 480);
    });
    const labelTexture = new T.CanvasTexture(canvas); labelTexture.colorSpace = T.SRGBColorSpace; labelTexture.anisotropy = 4;
    const signVertices: number[] = []; const uv: number[] = [];
    for (const sign of MARKET_SIGNS) {
      const index = styles.indexOf(`${sign.text}|${sign.color}`); const left = ((index % 4) * 512 + 2) / canvas.width; const right = (((index % 4) + 1) * 512 - 2) / canvas.width;
      const top = 1 - (Math.floor(index / 4) * 128 + 2) / canvas.height; const bottom = 1 - ((Math.floor(index / 4) + 1) * 128 - 2) / canvas.height;
      for (const [x, y, u, v] of [[-1, -1, left, bottom], [1, -1, right, bottom], [1, 1, right, top], [-1, -1, left, bottom], [1, 1, right, top], [-1, 1, left, top]]) {
        const horizontal = (x * sign.width) / 2;
        signVertices.push(sign.at[0] + horizontal * Math.cos(sign.angle), sign.at[1] + (y * sign.height) / 2, sign.at[2] - horizontal * Math.sin(sign.angle)); uv.push(u, v);
      }
    }
    const labelGeometry = new T.BufferGeometry(); labelGeometry.setAttribute("position", new T.Float32BufferAttribute(signVertices, 3)); labelGeometry.setAttribute("uv", new T.Float32BufferAttribute(uv, 2)); labelGeometry.computeVertexNormals();
    return { paving: groundGeometry, signGeometry: labelGeometry, atlas: labelTexture };
  }, []);
  useEffect(() => () => { paving.dispose(); signGeometry.dispose(); atlas.dispose(); }, [paving, signGeometry, atlas]);
  useEffect(() => {
    const mesh = boxesRef.current; if (!mesh) return;
    const matrix = new T.Matrix4(); const q = new T.Quaternion(); const color = new T.Color();
    boxes.forEach((box, i) => {
      q.setFromAxisAngle(new T.Vector3(0, 1, 0), box.angle || 0);
      matrix.compose(new T.Vector3(box.at[0], box.at[1] + terrainHeight({ x: box.at[0], z: box.at[2] }), box.at[2]), q, new T.Vector3(...box.size));
      mesh.setMatrixAt(i, matrix); mesh.setColorAt(i, color.set(box.color));
    });
    mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; mesh.computeBoundingSphere();
    const crowns = crownsRef.current;
    if (crowns) {
      MARKET_CROWNS.forEach((c, i) => { matrix.makeScale(...c.scale); matrix.setPosition(...c.at); crowns.setMatrixAt(i, matrix); });
      crowns.instanceMatrix.needsUpdate = true; crowns.computeBoundingSphere();
    }
  }, [boxes]);
  return (
    <group name="北站夜市·东一巷示意重建">
      <mesh geometry={paving} receiveShadow><meshStandardMaterial vertexColors roughness={0.97} side={T.DoubleSide} polygonOffset polygonOffsetFactor={-3} polygonOffsetUnits={-3} /></mesh>
      <instancedMesh ref={boxesRef} args={[undefined, undefined, boxes.length]} castShadow receiveShadow><boxGeometry /><meshStandardMaterial roughness={0.88} /></instancedMesh>
      <instancedMesh ref={crownsRef} args={[undefined, undefined, MARKET_CROWNS.length]} castShadow><icosahedronGeometry args={[1, 1]} /><meshStandardMaterial color="#587e5b" roughness={0.95} /></instancedMesh>
      <mesh geometry={signGeometry}><meshStandardMaterial map={atlas} roughness={0.9} /></mesh>
    </group>
  );
}
export default memo(MarketView);
