"use client";

import { memo, useEffect, useMemo, useRef } from "react";
import * as T from "three";
import { CITY_PARKS, CITY_RAILS, CITY_ROAD_SEGMENTS, polygonContains, segmentDistance } from "./city";
import { inCore, inCity } from "./exploration";
import { terrainHeight, inMappedRiver } from "./terrain";
import { terrainDrapedTriangles, terrainTriangleHeight } from "./terrainMesh";
import { pavingWithoutEntrances } from "./underground";

type Box = { x: number; y: number; z: number; w: number; h: number; d: number; angle: number; color: string };
function CityPlaces() {
  const ref = useRef<T.InstancedMesh>(null);
  const crownsRef = useRef<T.InstancedMesh>(null);
  const { geometry: placeGeometry, boxes: placeBoxes, crowns } = useMemo(() => {
    const vertices: number[] = []; const colors: number[] = []; const boxes: Box[] = [];
    const treeCrowns: { x: number; z: number; y: number }[] = [];
    const triangle = (points: { x: number; z: number }[], color: string, offset = 0.07) => {
      const c = new T.Color(color);
      for (const piece of pavingWithoutEntrances(points)) for (const face of terrainDrapedTriangles(piece)) for (const p of face) { vertices.push(p.x, terrainTriangleHeight(p) + offset + 0.12, p.z); colors.push(c.r, c.g, c.b); }
    };
    const plaza = (ring: number[][], color: string, step = 8) => {
      const xs = ring.map(p => p[0]); const zs = ring.map(p => p[1]);
      for (let z = Math.min(...zs); z < Math.max(...zs); z += step) for (let x = Math.min(...xs); x < Math.max(...xs); x += step) {
        const p = { x: x + step / 2, z: z + step / 2 };
        if (!polygonContains(p, ring) || inCore(p, 8) || inMappedRiver(p) || CITY_ROAD_SEGMENTS.some(s => segmentDistance(p, s.a, s.b) < s.road.width / 2 + step / 2)) continue;
        const a = { x, z }; const b = { x: x + step, z }; const c = { x, z: z + step }; const d = { x: x + step, z: z + step };
        triangle([a, c, b], color); triangle([b, c, d], color);
      }
    };
    for (const p of CITY_PARKS.filter(parkArea => !["1290673537", "205515998"].includes(parkArea.id))) plaza(p.points, "#719377", 12);
    const add = (x: number, z: number, w: number, h: number, d: number, color: string, angle = 0, y = h / 2) => boxes.push({ x, z, y: terrainHeight({ x, z }) + y, w, h, d, color, angle });
    // Render mapped rails in short sections, excluding original core streets.
    for (const rail of CITY_RAILS) for (let i = 1; i < rail.points.length; i++) {
      const a = rail.points[i - 1]; const b = rail.points[i]; const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const angle = Math.atan2(b[0] - a[0], b[1] - a[1]);
      for (let n = 0; n < length; n += 10) {
        const use = Math.min(10, length - n); const t = (n + use / 2) / length;
        const x = a[0] + (b[0] - a[0]) * t; const z = a[1] + (b[1] - a[1]) * t;
        if (!inCity({ x, z }) || inCore({ x, z }, 20) || inMappedRiver({ x, z })) continue;
        add(x, z, 3.4, 0.06, use, "#858c7e", angle, 0.05);
        for (const side of [-1, 1]) add(x + Math.cos(angle) * side * 0.72, z - Math.sin(angle) * side * 0.72, 0.1, 0.08, use, "#556663", angle, 0.1);
      }
    }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute("position", new T.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute("color", new T.Float32BufferAttribute(colors, 3)); geometry.computeVertexNormals();
    return { geometry, boxes, crowns: treeCrowns };
  }, []);
  useEffect(() => () => placeGeometry.dispose(), [placeGeometry]);
  useEffect(() => {
    const mesh = ref.current; if (!mesh) return;
    const matrix = new T.Matrix4(); const color = new T.Color(); const q = new T.Quaternion();
    placeBoxes.forEach((b, i) => { q.setFromAxisAngle(new T.Vector3(0, 1, 0), b.angle); matrix.compose(new T.Vector3(b.x, b.y, b.z), q, new T.Vector3(b.w, b.h, b.d)); mesh.setMatrixAt(i, matrix); mesh.setColorAt(i, color.set(b.color)); });
    mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; mesh.computeBoundingSphere();
  }, [placeBoxes]);
  useEffect(() => {
    const mesh = crownsRef.current; if (!mesh) return;
    const matrix = new T.Matrix4();
    crowns.forEach((p, i) => { matrix.makeScale(4 + (i % 3), 5.5, 4.2); matrix.setPosition(p.x, p.y, p.z); mesh.setMatrixAt(i, matrix); });
    mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere();
  }, [crowns]);
  return (
    <group name="扩区公园广场与铁路">
      <mesh geometry={placeGeometry} receiveShadow><meshStandardMaterial vertexColors roughness={0.96} side={T.DoubleSide} /></mesh>
      <instancedMesh ref={ref} args={[undefined, undefined, placeBoxes.length]}><boxGeometry /><meshStandardMaterial roughness={0.94} /></instancedMesh>
      <instancedMesh ref={crownsRef} args={[undefined, undefined, crowns.length]}><icosahedronGeometry args={[1, 1]} /><meshStandardMaterial color="#4f7d60" roughness={0.96} /></instancedMesh>
    </group>
  );
}
export default memo(CityPlaces);
