"use client";

import { memo, useEffect, useMemo, useRef } from "react";
import * as T from "three";
import layout from "./station-layout.json";
import { STATION_ANGLE, STATION_DECOR, STATION_SOLIDS, STATION_TAXI, STATION_TREES, stationPoint, stationRoofSurface } from "./station";
import { terrainHeight } from "./terrain";
import { terrainDrapedTriangles, terrainTriangleHeight } from "./terrainMesh";

function StationName({ out, height, reverse = false }: { out: number; height: number; reverse?: boolean }) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas"); canvas.width = 1024; canvas.height = 256;
    const ctx = canvas.getContext("2d")!; ctx.clearRect(0, 0, 1024, 256);
    ctx.fillStyle = "#b43d32"; ctx.font = 'bold 210px "Microsoft YaHei", sans-serif'; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("柳 州 站", 512, 127, 980);
    const map = new T.CanvasTexture(canvas); map.colorSpace = T.SRGBColorSpace; return map;
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);
  const p = stationPoint(0, out);
  return <mesh position={[p.x, height, p.z]} rotation={[0, STATION_ANGLE + (reverse ? 0 : Math.PI), 0]}><planeGeometry args={[20, 5]} /><meshStandardMaterial map={texture} transparent alphaTest={0.25} side={T.DoubleSide} roughness={0.8} /></mesh>;
}
function StationView() {
  const boxesRef = useRef<T.InstancedMesh>(null); const treesRef = useRef<T.InstancedMesh>(null);
  const boxes = useMemo(() => [...STATION_SOLIDS, ...STATION_DECOR], []);
  const { paving, roof } = useMemo(() => {
    const positions: number[] = []; const colors: number[] = []; const color = new T.Color();
    const pave = (ring: number[][], platform = false) => {
      const points = ring.slice(0, -1).map(p => new T.Vector2(p[0], p[1]));
      for (const tri of T.ShapeUtils.triangulateShape(points, [])) {
        const piece = tri.map(i => ({ x: points[i].x, z: points[i].y }));
        for (const face of terrainDrapedTriangles(piece)) {
          color.set(platform ? "#c5c6b7" : "#c6ccbf");
          for (const p of face) { positions.push(p.x, terrainTriangleHeight(p) + (platform ? 0.23 : 0.2), p.z); colors.push(color.r, color.g, color.b); }
        }
      }
    };
    layout.eastPaving.forEach(face => pave([...face, face[0]])); layout.platforms.forEach(p => pave(p.points, true));
    const pavingGeometry = new T.BufferGeometry(); pavingGeometry.setAttribute("position", new T.Float32BufferAttribute(positions, 3)); pavingGeometry.setAttribute("color", new T.Float32BufferAttribute(colors, 3)); pavingGeometry.computeVertexNormals();
    const surface = stationRoofSurface(); const roofGeometry = new T.BufferGeometry(); roofGeometry.setAttribute("position", new T.Float32BufferAttribute(surface.positions, 3)); roofGeometry.setIndex(surface.indices); roofGeometry.computeVertexNormals();
    return { paving: pavingGeometry, roof: roofGeometry };
  }, []);
  useEffect(() => () => { paving.dispose(); roof.dispose(); }, [paving, roof]);
  useEffect(() => {
    const mesh = boxesRef.current; const trees = treesRef.current; if (!mesh || !trees) return;
    const m = new T.Matrix4(); const q = new T.Quaternion(); const color = new T.Color();
    boxes.forEach((b, i) => { q.setFromAxisAngle(new T.Vector3(0, 1, 0), b.angle || 0); m.compose(new T.Vector3(b.at[0], b.at[1] + terrainHeight({ x: b.at[0], z: b.at[2] }), b.at[2]), q, new T.Vector3(...b.size)); mesh.setMatrixAt(i, m); mesh.setColorAt(i, color.set(b.color)); });
    mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; mesh.computeBoundingSphere();
    STATION_TREES.forEach((tree, i) => { m.makeScale(tree.size, tree.size * 1.15, tree.size); m.setPosition(...tree.at); trees.setMatrixAt(i, m); });
    trees.instanceMatrix.needsUpdate = true; trees.computeBoundingSphere();
  }, [boxes]);
  const taxi = STATION_TAXI;
  return (
    <group name="柳州站·东西站房与东广场估算重建">
      <mesh geometry={paving} receiveShadow><meshStandardMaterial vertexColors side={T.DoubleSide} roughness={0.96} polygonOffset polygonOffsetFactor={-3} polygonOffsetUnits={-3} /></mesh>
      <mesh geometry={roof} castShadow receiveShadow><meshStandardMaterial color="#839c9b" roughness={0.6} metalness={0.25} side={T.DoubleSide} /></mesh>
      <instancedMesh ref={boxesRef} args={[undefined, undefined, boxes.length]} castShadow receiveShadow><boxGeometry /><meshStandardMaterial roughness={0.8} /></instancedMesh>
      <instancedMesh ref={treesRef} args={[undefined, undefined, STATION_TREES.length]} castShadow><icosahedronGeometry args={[1, 1]} /><meshStandardMaterial color="#547d63" roughness={0.9} /></instancedMesh>
      <StationName out={151} height={29} /><StationName out={-167} height={29} reverse />
      <StationWayfinding p={stationPoint(0, 163)} text="东进站口" angle={STATION_ANGLE} y={21} />
      <StationWayfinding p={stationPoint(110, 175)} text="东广场 · 交通换乘 →" angle={STATION_ANGLE} />
      <StationWayfinding p={taxi} text="出租车候车区" angle={taxi.angle} />
    </group>
  );
}
function StationWayfinding({ p, text, angle, y }: { p: { x: number; z: number }; text: string; angle: number; y?: number }) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas"); canvas.width = 1024; canvas.height = 192; const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#3d6668"; ctx.fillRect(0, 0, 1024, 192); ctx.fillStyle = "#eeeada"; ctx.font = 'bold 110px "Microsoft YaHei", sans-serif'; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(text, 512, 97, 980);
    const map = new T.CanvasTexture(canvas); map.colorSpace = T.SRGBColorSpace; return map;
  }, [text]);
  useEffect(() => () => texture.dispose(), [texture]);
  return <mesh position={[p.x + Math.cos(angle + Math.PI / 2) * 0.11, y ?? terrainTriangleHeight(p) + 3.7, p.z - Math.sin(angle + Math.PI / 2) * 0.11]} rotation={[0, angle + Math.PI, 0]}><planeGeometry args={[9, 1.7]} /><meshStandardMaterial map={texture} side={T.DoubleSide} roughness={0.9} /></mesh>;
}
export default memo(StationView);
