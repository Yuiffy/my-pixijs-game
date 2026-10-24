import layout from "./central-layout.json";
import { terrainHeight } from "./terrain";
import { terrainTriangleHeight } from "./terrainMesh";
import type { Building } from "./world";

type P = { x: number; z: number };
export const CENTRAL_SOURCE_IDS = new Set(layout.sourceBuildings.map(b => b.id));
export const CENTRAL_PARCELS = layout.parcels;

function volume(id: string, points: number[][], h: number, color: string, real: boolean): Building {
  const footprint = points.map(([x, z]) => ({ x, z }));
  const xs = footprint.map(p => p.x); const zs = footprint.map(p => p.z);
  const x = (Math.min(...xs) + Math.max(...xs)) / 2; const z = (Math.min(...zs) + Math.max(...zs)) / 2;
  const baseY = terrainHeight({ x, z }); let foundationDepth = 0.6;
  footprint.forEach((a, i) => {
    const b = footprint[(i + 1) % footprint.length]; const count = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z)));
    for (let n = 0; n <= count; n++) foundationDepth = Math.max(foundationDepth, baseY - terrainTriangleHeight({ x: a.x + ((b.x - a.x) * n) / count, z: a.z + ((b.z - a.z) * n) / count }) + 0.6);
  });
  return { id, x, z, w: Math.max(...xs) - Math.min(...xs), d: Math.max(...zs) - Math.min(...zs), h, angle: 0, color, real, footprint, baseY, foundationDepth, heightSource: "estimated" };
}

export const CENTRAL_BUILDINGS: Building[] = [
  ...layout.sourceBuildings.map((b, i) => volume(`central-osm-${b.id}`, b.points.slice(0, -1), b.height, ["#bcae98", "#b6c1b9", "#c9bea5", "#b3b9ad"][i % 4], true)),
  ...layout.volumes.map((b, i) => volume(b.id, b.points, b.height, b.use === "school" ? "#d9c9a0" : ["#c7bea7", "#b8c2b4", "#cdc6b0", "#b9b9aa"][i % 4], false)),
  ...layout.walls.map(b => volume(b.id, b.points, b.height, "#9c9e8a", false)),
];

export function centralReserved(p: P, radius = 0) {
  return CENTRAL_PARCELS.some(parcel => {
    let inside = false;
    for (let i = 0, j = parcel.points.length - 1; i < parcel.points.length; j = i++) {
      const a = parcel.points[i]; const b = parcel.points[j];
      if ((a[1] > p.z) !== (b[1] > p.z) && p.x < ((b[0] - a[0]) * (p.z - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    if (inside) return true;
    return parcel.points.slice(1).some((b, i) => {
      const a = parcel.points[i]; const dx = b[0] - a[0]; const dz = b[1] - a[1];
      const t = Math.max(0, Math.min(1, ((p.x - a[0]) * dx + (p.z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
      return Math.hypot(p.x - a[0] - dx * t, p.z - a[1] - dz * t) < radius + 2;
    });
  });
}
