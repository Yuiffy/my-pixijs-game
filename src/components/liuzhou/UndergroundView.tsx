"use client";

import { memo, useEffect, useMemo, useRef } from "react";
import * as T from "three";
import { CitySign } from "./CityLabels";
import UndergroundShops from "./UndergroundShops";
import { terrainHeight } from "./terrain";
import { UNDERGROUND_ENTRANCES, UNDERGROUND_SHOPS, UNDERGROUND_STEPS, UNDERGROUND_WALKS, undergroundLevel, undergroundSurface, type UndergroundBox } from "./underground";

function UndergroundView() {
  const ref = useRef<T.InstancedMesh>(null);
  const geometry = useMemo(() => {
    const data = undergroundSurface(rings => T.ShapeUtils.triangulateShape(rings[0].map(p => new T.Vector2(p[0], p[1])), rings.slice(1).map(ring => ring.map(p => new T.Vector2(p[0], p[1])))));
    const g = new T.BufferGeometry(); const color = new T.Color();
    g.setAttribute("position", new T.Float32BufferAttribute(data.positions, 3));
    g.setAttribute("color", new T.Float32BufferAttribute(data.kinds.flatMap(k => { color.set(k === 0 ? "#b9b3a3" : k === 1 ? "#aab3ad" : "#c9c9b8"); return [color.r, color.g, color.b]; }), 3));
    g.setIndex(data.indices); g.computeVertexNormals(); return g;
  }, []);
  const boxes = useMemo(() => {
    const result: UndergroundBox[] = [...UNDERGROUND_STEPS];
    const add = (x: number, y: number, z: number, w: number, h: number, d: number, color: string, angle = 0) => result.push({ at: [x, y, z], size: [w, h, d], color, angle });
    // Retail bays are inferred; no real tenant names or business claims.
    UNDERGROUND_SHOPS.forEach((s, i) => {
      const y = undergroundLevel(s); const nx = Math.cos(s.angle) * s.side; const nz = -Math.sin(s.angle) * s.side;
      const c = ["#6a9990", "#bc9370", "#888fad", "#af8980"][i % 4];
      add(s.x - nx * 0.14, y + 1.6, s.z - nz * 0.14, 0.12, 2.9, 6.4, "#457671", s.angle);
      add(s.x - nx * 0.3, y + 3.35, s.z - nz * 0.3, 0.18, 0.65, 6.8, c, s.angle);
      add(s.x - nx * 2.53, y + 3.35, s.z - nz * 2.53, 0.16, 0.65, 6.8, c, s.angle);
      for (const t of [-2.9, 0, 2.9]) add(s.x + Math.sin(s.angle) * t - nx * 0.35, y + 1.55, s.z + Math.cos(s.angle) * t - nz * 0.35, 0.2, 3, 0.12, "#d9d5bc", s.angle);
      add(s.x - nx * 0.4, y + 0.4, s.z - nz * 0.4, 0.2, 0.35, 6.2, "#d0c5aa", s.angle);
    });
    for (const w of UNDERGROUND_WALKS.filter(way => ["1275168868", "1275168884"].includes(way.id))) for (let i = 1; i < w.points.length; i++) {
      const a = w.points[i - 1]; const b = w.points[i]; const length = Math.hypot(b[0] - a[0], b[1] - a[1]); const angle = Math.atan2(b[0] - a[0], b[1] - a[1]);
      for (let n = 4; n < length; n += 9) {
        const x = a[0] + ((b[0] - a[0]) * n) / length; const z = a[1] + ((b[1] - a[1]) * n) / length;
        add(x, undergroundLevel({ x, z }) + 4.24, z, 1.1, 0.08, 3, "#f1e8c7", angle);
        for (const side of [-1, 1]) add(x + Math.cos(angle) * side * 3.7, undergroundLevel({ x, z }) + 0.012, z - Math.sin(angle) * side * 3.7, 0.05, 0.014, 8, "#8f9e96", angle);
      }
    }
    for (const e of UNDERGROUND_ENTRANCES) {
      const [x, z] = e.top; const y = terrainHeight({ x, z });
      const b = e.points[1]; const angle = Math.atan2(b[0] - x, b[1] - z);
      for (const side of [-1, 1]) add(x + Math.cos(angle) * side * 1.9, y + 1.35, z - Math.sin(angle) * side * 1.9, 0.12, 2.7, 0.12, "#38675f", angle);
      add(x, y + 2.7, z, 4, 0.12, 0.45, "#38675f", angle);
    }
    return result;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => {
    const mesh = ref.current; if (!mesh) return;
    const matrix = new T.Matrix4(); const color = new T.Color(); const q = new T.Quaternion();
    boxes.forEach((b, i) => { q.setFromAxisAngle(new T.Vector3(0, 1, 0), b.angle); matrix.compose(new T.Vector3(...b.at), q, new T.Vector3(...b.size)); mesh.setMatrixAt(i, matrix); mesh.setColorAt(i, color.set(b.color)); });
    mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; mesh.computeBoundingSphere();
  }, [boxes]);
  return (
<group name="龙城地下街 · 源通道与估算地下空间">
    <mesh geometry={geometry} receiveShadow><meshStandardMaterial vertexColors roughness={0.87} side={T.DoubleSide} /></mesh>
    <instancedMesh ref={ref} args={[undefined, undefined, boxes.length]}><boxGeometry /><meshStandardMaterial roughness={0.82} /></instancedMesh>
    <UndergroundShops />
    {UNDERGROUND_ENTRANCES.map(e => {
      const [x, z] = e.top; const b = e.points[1];
      return <CitySign key={e.id} text="地下街 ↓" at={[x, terrainHeight({ x, z }) + 2.28, z]} width={3.8} angle={Math.atan2(b[0] - x, b[1] - z)} />;
    })}
    <CitySign text="龙城地下街  ·  五星商圈 ↑" at={[-595, undergroundLevel({ x: -595, z: -118 }) + 3.8, -118]} width={7} height={0.55} />
    <CitySign text="人民广场 ↑     五星街 ↓" at={[-575, undergroundLevel({ x: -575, z: -506 }) + 3.8, -506]} width={7} height={0.55} />
  </group>
);
}
export default memo(UndergroundView);
