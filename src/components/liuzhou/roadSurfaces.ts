import { inCity, inCore } from "./exploration";
import type { Point, Road } from "./world";

type Segment = { a: Point; b: Point; road: Road };
const sourceId = (road: Road) => road.id.replace(/^city-road-/, "");

function distanceToSegment(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x; const dz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t);
}

/** The two imports round the same OSM nodes to centimetres/millimetres.
 * Keep the original core width once, while retaining every uncovered city span.
 * A shared source ID alone is insufficient: that road can extend much farther.
 */
export function selectRoadRenderSegments(core: Segment[], city: Segment[]) {
  const original = new Map<string, Segment[]>();
  for (const segment of core) {
    const id = sourceId(segment.road);
    const group = original.get(id) ?? [];
    group.push(segment); original.set(id, group);
  }
  return [...core, ...city.filter(segment => (!inCore(segment.a, 10) || !inCore(segment.b, 10)) && (inCity(segment.a) || inCity(segment.b))
    && !original.get(sourceId(segment.road))?.some(existing => distanceToSegment(segment.a, existing.a, existing.b) < 0.02
      && distanceToSegment(segment.b, existing.a, existing.b) < 0.02))];
}

// Footpaths meet vehicle-road shoulders at several real mapped junctions.
// Distinct depths prevent different pavement colours sharing a coplanar face.
export const ROAD_SURFACE_HEIGHTS = {
  footShoulder: 0.125,
  foot: 0.135,
  motorShoulder: 0.155,
  motor: 0.175,
  marking: 0.205,
};
