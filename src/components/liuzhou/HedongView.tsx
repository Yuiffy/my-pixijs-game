"use client";

import { memo, useEffect, useMemo, useRef } from "react";
import * as T from "three";
import layout from "./hedong-layout.json";
import { HEDONG_BENCHES, HEDONG_BUILDINGS, HEDONG_TREES, type HedongBox } from "./hedong";
import { terrainDrapedTriangles, terrainTriangleHeight } from "./terrainMesh";
import { CitySign } from "./CityLabels";

function HedongView() {
  const boxesRef = useRef<T.InstancedMesh>(null); const crownsRef = useRef<T.InstancedMesh>(null);
  const model = useMemo(() => {
    const positions: number[] = []; const colors: number[] = []; const uv: number[] = [];
    const color = new T.Color();
    for (const surface of layout.surfaces) {
      color.set(surface.color);
      for (const triangle of terrainDrapedTriangles(surface.points.map(([x, z]) => ({ x, z })))) for (const p of triangle) {
        positions.push(p.x, terrainTriangleHeight(p) + 0.19, p.z); colors.push(color.r, color.g, color.b);
        uv.push(...(surface.kind === "garden" ? [0.25, 0.25] : [p.x / 1.8, p.z / 1.2]));
      }
    }
    const ground = new T.BufferGeometry(); ground.setAttribute("position", new T.Float32BufferAttribute(positions, 3)); ground.setAttribute("color", new T.Float32BufferAttribute(colors, 3)); ground.setAttribute("uv", new T.Float32BufferAttribute(uv, 2)); ground.computeVertexNormals();
    const canvas = document.createElement("canvas"); canvas.width = 128; canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#faf9f5"; ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = "#c3c2b8"; ctx.fillRect(0, 0, 1, 128); ctx.fillRect(0, 0, 128, 1);
    const stone = new T.CanvasTexture(canvas); stone.wrapS = T.RepeatWrapping; stone.wrapT = T.RepeatWrapping; stone.colorSpace = T.SRGBColorSpace; stone.anisotropy = 8;
    const boxes: HedongBox[] = [...HEDONG_BENCHES];
    for (const tree of HEDONG_TREES) boxes.push({ at: [tree.x, terrainTriangleHeight(tree) + 2, tree.z], size: [0.32, 4, 0.32], color: "#80775c" });
    for (const b of HEDONG_BUILDINGS) {
      for (let i = 0; i < b.footprint.length; i++) {
        const a = b.footprint[i]; const c = b.footprint[(i + 1) % b.footprint.length];
        const run = Math.hypot(c.x - a.x, c.z - a.z); if (run < 1) continue;
        const angle = -Math.atan2(c.z - a.z, c.x - a.x);
        const tower = b.h > 55;
        // Thin opaque glazing ribbons are an estimated facade treatment. They
        // straddle the source exterior by 8cm to avoid coplanar flickering.
        for (let y = 4.5; y < b.h - 2; y += tower ? 3.5 : 4) {
          if (tower) boxes.push({ at: [(a.x + c.x) / 2, b.baseY + y, (a.z + c.z) / 2], size: [run, 1.7, 0.16], color: "#5c7b7d", angle });
          else for (let n = 2; n < run - 1; n += 4) boxes.push({ at: [a.x + ((c.x - a.x) * n) / run, b.baseY + y, a.z + ((c.z - a.z) * n) / run], size: [1.8, 2.1, 0.16], color: "#668183", angle });
        }
        boxes.push({ at: [(a.x + c.x) / 2, b.baseY + b.h - 0.3, (a.z + c.z) / 2], size: [run, 0.6, 0.22], color: "#c3c8be", angle });
      }
    }
    return { ground, stone, boxes };
  }, []);
  useEffect(() => () => { model.ground.dispose(); model.stone.dispose(); }, [model]);
  useEffect(() => {
    const mesh = boxesRef.current; const crowns = crownsRef.current; if (!mesh || !crowns) return;
    const matrix = new T.Matrix4(); const q = new T.Quaternion(); const color = new T.Color();
    model.boxes.forEach((b, i) => { q.setFromAxisAngle(new T.Vector3(0, 1, 0), b.angle || 0); matrix.compose(new T.Vector3(...b.at), q, new T.Vector3(...b.size)); mesh.setMatrixAt(i, matrix); mesh.setColorAt(i, color.set(b.color)); });
    mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; mesh.computeBoundingSphere();
    HEDONG_TREES.forEach((p, i) => { matrix.makeScale(2.3, 3.2, 2.3); matrix.setPosition(p.x, terrainTriangleHeight(p) + 5.2, p.z); crowns.setMatrixAt(i, matrix); });
    crowns.instanceMatrix.needsUpdate = true; crowns.computeBoundingSphere();
  }, [model]);
  const utopia = HEDONG_BUILDINGS.find(b => b.sourceId === "690984681")!;
  const government = HEDONG_BUILDINGS.find(b => b.sourceId === "557075350")!;
  return (
    <group name="市民广场·文昌桥东·阳光100（细节估算）">
      <mesh geometry={model.ground} receiveShadow><meshStandardMaterial vertexColors map={model.stone} roughness={0.94} side={T.DoubleSide} polygonOffset polygonOffsetFactor={-3} polygonOffsetUnits={-3} /></mesh>
      <instancedMesh ref={boxesRef} args={[undefined, undefined, model.boxes.length]} castShadow receiveShadow><boxGeometry /><meshStandardMaterial roughness={0.83} /></instancedMesh>
      <instancedMesh ref={crownsRef} args={[undefined, undefined, HEDONG_TREES.length]} castShadow><icosahedronGeometry args={[1, 2]} /><meshStandardMaterial color="#547e58" roughness={0.95} /></instancedMesh>
      <CitySign text="市 民 广 场" at={[1435, terrainTriangleHeight({ x: 1435, z: -1405 }) + 2.3, -1405]} width={8} angle={Math.PI / 2} />
      <CitySign text="乌 托 邦 音 乐 城" at={[utopia.x, utopia.baseY + 11.5, -1544.65]} width={27} />
      <CitySign text="柳 州 市 人 民 政 府" at={[government.x, government.baseY + 19, -1597]} width={30} />
    </group>
  );
}
export default memo(HedongView);
