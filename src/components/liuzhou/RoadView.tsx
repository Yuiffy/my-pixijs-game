"use client";

import { memo, useEffect, useMemo } from "react";
import * as T from "three";
import { ROAD_SEGMENTS, distance, type Point } from "./world";
import { BRIDGE_SECTIONS, projectBridge } from "./bridges";
import { terrainHeight } from "./terrain";

function RoadView() {
  const geometry = useMemo(() => {
    const vertices: number[] = []; const colors: number[] = [];
    const strip = (a: Point, b: Point, width: number, offset: number, color: string) => {
      const d = distance(a, b); if (!d) return;
      const nx = ((b.z - a.z) / d) * (width / 2); const nz = (-(b.x - a.x) / d) * (width / 2);
      const points = [{ x: a.x - nx, z: a.z - nz }, { x: a.x + nx, z: a.z + nz }, { x: b.x - nx, z: b.z - nz }, { x: b.x + nx, z: b.z + nz }];
      const c = new T.Color(color);
      for (const i of [0, 2, 1, 1, 2, 3]) { const p = points[i]; vertices.push(p.x, terrainHeight(p) + offset, p.z); colors.push(c.r, c.g, c.b); }
    };
    for (const s of ROAD_SEGMENTS) {
      if (s.road.bridge && s.road.name === "文惠桥") continue;
      const length = distance(s.a, s.b); const count = Math.ceil(length / 4);
      const interpolate = (t: number) => ({ x: s.a.x + (s.b.x - s.a.x) * t, z: s.a.z + (s.b.z - s.a.z) * t });
      for (let i = 0; i < count; i++) {
        const a = interpolate(i / count); const b = interpolate((i + 1) / count); const p = interpolate((i + 0.5) / count);
        if (BRIDGE_SECTIONS.some(section => section.id === s.road.id && projectBridge(p, section).distance < 0.1)) continue;
        strip(a, b, s.road.width + (s.road.foot ? 0.7 : 5), 0.025, "#bdbcae");
        strip(a, b, s.road.width, 0.055, s.road.foot ? "#b6b29d" : "#627370");
        if (!s.road.foot && i % 3 === 0) strip(a, b, 0.14, 0.085, "#e5d5ac");
      }
    }
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute(vertices, 3));
    g.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
    g.computeVertexNormals(); return g;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} receiveShadow><meshStandardMaterial vertexColors roughness={0.95} side={T.DoubleSide} /></mesh>;
}
export default memo(RoadView);
