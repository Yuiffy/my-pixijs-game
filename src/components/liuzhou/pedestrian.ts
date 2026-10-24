import { BUILDINGS, ROAD_SEGMENTS, buildingContains, canTraverse, closestOnSegment, distance, type Point } from "./world";
import { gateContains } from "./dongmen";
import { streetContains } from "./street";
import { terrainHeight, inMappedRiver } from "./terrain";
import { terrainTriangleHeight } from "./terrainMesh";
import { CITY_ROAD_SEGMENTS } from "./city";
import { inCity, inCore } from "./exploration";

// Residents stay on pavements and pedestrian streets. Vehicle carriageways are
// not valid idle/restoration positions, even when they have no traffic right now.
function carriagewayBuckets(segments: typeof ROAD_SEGMENTS) {
  const buckets = new Map<string, typeof ROAD_SEGMENTS>();
  for (const segment of segments) {
    if (segment.road.foot) continue;
    const pad = segment.road.width / 2 + 8;
    for (let z = Math.floor((Math.min(segment.a.z, segment.b.z) - pad) / 64); z <= Math.floor((Math.max(segment.a.z, segment.b.z) + pad) / 64); z++) for (let x = Math.floor((Math.min(segment.a.x, segment.b.x) - pad) / 64); x <= Math.floor((Math.max(segment.a.x, segment.b.x) + pad) / 64); x++) {
      const key = `${x}:${z}`; const list = buckets.get(key) || []; list.push(segment); buckets.set(key, list);
    }
  }
  return buckets;
}
const coreCarriageways = carriagewayBuckets(ROAD_SEGMENTS);
const cityCarriageways = carriagewayBuckets(CITY_ROAD_SEGMENTS);
export function inCarriageway(p: Point, margin = 0) {
  const core = canTraverse(p);
  const segments = margin > 8 ? core ? ROAD_SEGMENTS : CITY_ROAD_SEGMENTS : (core ? coreCarriageways : cityCarriageways).get(`${Math.floor(p.x / 64)}:${Math.floor(p.z / 64)}`) || [];
  return segments.some(s => !s.road.foot && distance(p, closestOnSegment(p, s.a, s.b)) < s.road.width / 2 + margin);
}
export const pedestrianHeight = (p: Point) => (inCore(p) ? terrainHeight(p) : terrainTriangleHeight(p));

export function pedestrianClear(p: Point, margin = 0.62) {
  return (canTraverse(p) || (inCity(p) && !inMappedRiver(p)))
    && !inCarriageway(p, margin)
    && !BUILDINGS.some(b => buildingContains(p, b, margin))
    && !gateContains({ ...p, y: terrainHeight(p) + 1 }, margin)
    && !streetContains({ ...p, y: pedestrianHeight(p) + 1 }, margin);
}
