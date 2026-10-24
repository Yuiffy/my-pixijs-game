import layout from "./station-neighborhood-layout.json";
import { terrainHeight } from "./terrain";
import { terrainTriangleHeight } from "./terrainMesh";
import type { Building } from "./world";

type P = { x: number; z: number };
export const STATION_NEIGHBORHOOD_PARCELS = layout.parcels;

function volume(id: string, points: number[][], h: number, color: string): Building {
  const footprint = points.map(([x, z]) => ({ x, z }));
  const xs = footprint.map(p => p.x); const zs = footprint.map(p => p.z);
  const x = (Math.min(...xs) + Math.max(...xs)) / 2; const z = (Math.min(...zs) + Math.max(...zs)) / 2;
  const baseY = terrainHeight({ x, z }); let foundationDepth = 0.6;
  for (let i = 0; i < footprint.length; i++) {
    const a = footprint[i]; const b = footprint[(i + 1) % footprint.length];
    const count = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z)));
    for (let n = 0; n <= count; n++) foundationDepth = Math.max(foundationDepth, baseY - terrainTriangleHeight({ x: a.x + ((b.x - a.x) * n) / count, z: a.z + ((b.z - a.z) * n) / count }) + 0.6);
  }
  return { id, x, z, w: Math.max(...xs) - Math.min(...xs), d: Math.max(...zs) - Math.min(...zs), h, angle: 0, color, real: false, footprint, baseY, foundationDepth, heightSource: "estimated" };
}

export const STATION_NEIGHBORHOOD_BUILDINGS: Building[] = [
  ...layout.volumes.map((b, i) => volume(b.id, b.points, b.height, b.use === "commercial" ? "#c4b397" : ["#c4c3af", "#bdc8bb", "#cebea6", "#b9c2bb"][i % 4])),
  ...layout.walls.map(b => volume(b.id, b.points, b.height, "#9e9f8e")),
];

/** Reserve whole parcels before the older generic roadside infill runs. */
export function stationNeighborhoodReserved(p: P, radius = 0) {
  return layout.parcels.some(parcel => {
    let inside = false;
    for (let i = 0, j = parcel.points.length - 1; i < parcel.points.length; j = i++) {
      const a = parcel.points[j]; const b = parcel.points[i];
      if ((a[1] > p.z) !== (b[1] > p.z) && p.x < ((b[0] - a[0]) * (p.z - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
      const dx = b[0] - a[0]; const dz = b[1] - a[1];
      const t = Math.max(0, Math.min(1, ((p.x - a[0]) * dx + (p.z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
      if (Math.hypot(p.x - a[0] - dx * t, p.z - a[1] - dz * t) < radius + 2) return true;
    }
    return inside;
  });
}
