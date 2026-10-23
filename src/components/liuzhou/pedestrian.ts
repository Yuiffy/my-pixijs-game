import { BUILDINGS, ROAD_SEGMENTS, buildingContains, canTraverse, closestOnSegment, distance, type Point } from "./world";
import { gateContains } from "./dongmen";
import { streetContains } from "./street";
import { terrainHeight } from "./terrain";

// Residents stay on pavements and pedestrian streets. Vehicle carriageways are
// not valid idle/restoration positions, even when they have no traffic right now.
export function inCarriageway(p: Point, margin = 0) {
  return ROAD_SEGMENTS.some(s => !s.road.foot && distance(p, closestOnSegment(p, s.a, s.b)) < s.road.width / 2 + margin);
}

export function pedestrianClear(p: Point, margin = 0.62) {
  return canTraverse(p)
    && !inCarriageway(p, margin)
    && !BUILDINGS.some(b => buildingContains(p, b, margin))
    && !gateContains({ ...p, y: terrainHeight(p) + 1 }, margin)
    && !streetContains({ ...p, y: terrainHeight(p) + 1 }, margin);
}
