import * as T from "three";
import type { Point } from "./world";
import { BRIDGE_SECTIONS, projectBridge } from "./bridges";
import { terrainDrapedTriangles, terrainTriangleHeight } from "./terrainMesh";
import { ROAD_SURFACE_HEIGHTS } from "./roadSurfaces";
import { pavingWithoutEntrances } from "./underground";
import { ESHAN_PATH_IDS } from "./eshan";
import { inXihuanDetail } from "./xihuan";
import { WUXING_PATH_IDS } from "./wuxing";
import { GUANGYA_GROUND_PAVING } from "./guangya";

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);
export type RoadJob = { segment: ReturnType<typeof import("./roadSurfaces").selectRoadRenderSegments>[number]; first: number; last: number };
export function buildRoadGeometry(jobs: RoadJob[], includePaving = false) {
    const vertices: number[] = []; const colors: number[] = [];
    const strip = (from: Point, to: Point, width: number, offset: number, color: string, sideOffset = 0) => {
      const length = distance(from, to); if (!length) return;
      const shift = { x: ((to.z - from.z) / length) * sideOffset, z: (-(to.x - from.x) / length) * sideOffset };
      const a = { x: from.x + shift.x, z: from.z + shift.z }; const b = { x: to.x + shift.x, z: to.z + shift.z };
      const d = distance(a, b); if (!d) return;
      const nx = ((b.z - a.z) / d) * (width / 2); const nz = (-(b.x - a.x) / d) * (width / 2);
      const points = [{ x: a.x - nx, z: a.z - nz }, { x: a.x + nx, z: a.z + nz }, { x: b.x - nx, z: b.z - nz }, { x: b.x + nx, z: b.z + nz }];
      const c = new T.Color(color);
      for (const triangle of [[points[0], points[2], points[1]], [points[1], points[2], points[3]]]) for (const piece of pavingWithoutEntrances(triangle)) for (const face of terrainDrapedTriangles(piece)) for (const p of face) {
        vertices.push(p.x, terrainTriangleHeight(p) + offset, p.z); colors.push(c.r, c.g, c.b);
      }
    };
    for (const { segment: s, first, last } of jobs) {
      if (s.road.id.startsWith("city-") && s.road.bridge) continue;
      if (ESHAN_PATH_IDS.has(s.road.id.replace("city-road-", ""))) continue;
      // WuxingView draws these paths clipped at vehicle roads and entrances.
      // Keeping the old full-width strips would paint over the crossings.
      if (WUXING_PATH_IDS.has(s.road.id.replace("city-road-", ""))) continue;
      if (s.road.bridge && s.road.name === "文惠桥") continue;
      const length = distance(s.a, s.b); const count = Math.ceil(length / 4);
      const interpolate = (t: number) => ({ x: s.a.x + (s.b.x - s.a.x) * t, z: s.a.z + (s.b.z - s.a.z) * t });
      for (let i = first; i < last; i++) {
        const a = interpolate(i / count); const b = interpolate((i + 1) / count); const p = interpolate((i + 0.5) / count);
        if (BRIDGE_SECTIONS.some(section => section.id === s.road.id && projectBridge(p, section).distance < 0.1)) continue;
        const shoulder = s.road.foot ? 0.35 : 2.5;
        // A mapped footpath can cross a vehicle road. Give asphalt priority
        // there instead of painting both surfaces at the same depth.
        for (const side of [-1, 1]) strip(a, b, shoulder, s.road.foot ? ROAD_SURFACE_HEIGHTS.footShoulder : ROAD_SURFACE_HEIGHTS.motorShoulder, "#bdbcae", side * (s.road.width / 2 + shoulder / 2));
        strip(a, b, s.road.width, s.road.foot ? ROAD_SURFACE_HEIGHTS.foot : ROAD_SURFACE_HEIGHTS.motor, s.road.foot ? "#b6b29d" : "#627370");
        if (!s.road.foot && i % 3 === 0 && !inXihuanDetail(p)) strip(a, b, 0.14, ROAD_SURFACE_HEIGHTS.marking, "#e5d5ac");
      }
    }
    const pavingColor = new T.Color("#bdbcae");
    for (const triangle of includePaving ? GUANGYA_GROUND_PAVING : []) for (const face of terrainDrapedTriangles(triangle)) for (const p of face) {
      vertices.push(p.x, terrainTriangleHeight(p) + 0.175, p.z); colors.push(pavingColor.r, pavingColor.g, pavingColor.b);
    }
    return { positions: new Float32Array(vertices), colors: new Float32Array(colors) };
}
