import layout from "./hedong-layout.json";
import { terrainTriangleHeight } from "./terrainMesh";

type P = { x: number; z: number };
// Colors and untagged heights are reconstruction choices, not measured facts.
export const HEDONG_BUILDING_STYLES: Record<string, { h: number; color: string }> = {
  544112668: { h: 17, color: "#c7c1ab" },
  544112715: { h: 83.2, color: "#859c9c" }, // OSM 26 levels x estimated 3.2m.
  544112717: { h: 90, color: "#829b9c" },
  544112719: { h: 78, color: "#879c9a" },
  557075350: { h: 24, color: "#d2cdbd" },
  690984680: { h: 14, color: "#c0ad91" },
  690984681: { h: 14, color: "#bcab91" },
  690984682: { h: 14, color: "#b8aa96" },
  899710017: { h: 215.4, color: "#91a4a2" }, // Actual source height tag.
};
export const HEDONG_SOURCE_IDS = new Set(layout.buildings.map(b => b.id));
export const HEDONG_FACADE_IDS = new Set(layout.buildings.map(b => `city-osm-${b.id}`));
export const HEDONG_BUILDINGS = layout.buildings.map(b => {
  const footprint = b.points.slice(0, -1).map(([x, z]) => ({ x, z }));
  const xs = footprint.map(p => p.x); const zs = footprint.map(p => p.z);
  const x = (Math.min(...xs) + Math.max(...xs)) / 2; const z = (Math.min(...zs) + Math.max(...zs)) / 2;
  const t: Record<string, string | undefined> = b.tags;
  const measured = Number.parseFloat(t.height || "");
  const style = HEDONG_BUILDING_STYLES[b.id];
  const levels = Number.parseFloat(t["building:levels"] || "");
  const h = measured || (levels ? levels * 3.2 : style?.h ?? (t.building === "apartments" ? 30 : 18));
  // One horizontal floor/foundation per source building, sunk below the lowest
  // boundary sample. Radar terrain can vary across a roof; no floating walls.
  let low = Infinity; let high = -Infinity;
  for (let i = 0; i < footprint.length; i++) {
    const a = footprint[i]; const c = footprint[(i + 1) % footprint.length]; const samples = Math.max(1, Math.ceil(Math.hypot(c.x - a.x, c.z - a.z) / 2));
    for (let n = 0; n <= samples; n++) {
      const y = terrainTriangleHeight({ x: a.x + ((c.x - a.x) * n) / samples, z: a.z + ((c.z - a.z) * n) / samples });
      low = Math.min(low, y); high = Math.max(high, y);
    }
  }
  return {
    id: `city-osm-${b.id}`,
    sourceId: b.id,
    x,
    z,
    w: Math.max(...xs) - Math.min(...xs),
    d: Math.max(...zs) - Math.min(...zs),
    h,
    color: style?.color ?? "#c4c1b2",
    angle: 0,
    footprint,
    real: true,
    baseY: high,
    foundationDepth: high - low + 0.8,
    ...(!measured ? { heightSource: "estimated" as const } : {}),
  };
});
export type HedongBox = { at: [number, number, number]; size: [number, number, number]; color: string; angle?: number };
export const HEDONG_BENCHES: HedongBox[] = layout.benchesEstimated.map(([x, z]) => ({ at: [x, terrainTriangleHeight({ x, z }) + 0.36, z], size: [2.2, 0.72, 0.7], color: "#8d7861" }));
export const HEDONG_TREES: P[] = layout.treesEstimated.map(([x, z]) => ({ x, z }));
