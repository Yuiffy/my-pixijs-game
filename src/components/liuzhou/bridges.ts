import map from "./map.json";
import type { Point } from "./world";
import { terrainHeight } from "./terrain";

// OSM supplies plan geometry. The approach lengths are from the 2013 project
// report; vertical alignment remains a reconstruction, not an as-built survey.
export const BRIDGE_HEIGHT = Math.max(terrainHeight({ x: 80, z: 60 }), terrainHeight({ x: 210, z: 650 })) + 6.5;
export const APPROACH_LENGTH = 136.956;
export const SOUTH_APPROACH_LENGTH = 351.584;
export type BridgePoint = Point & { y: number };
export type BridgeSection = { id: string; a: BridgePoint; b: BridgePoint; width: number; main: boolean };
const length = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);
const roadPoints = (id: string) => map.features.find(f => f.id === id)!.points.map(([x, z]) => ({ x, z }));
const decks = [
  { id: "195918702", north: "627315952", south: "370553228", reversed: false },
  { id: "583908579", north: "583908582", south: "195921844", reversed: true },
];
export const BRIDGE_SECTIONS: BridgeSection[] = [];
export const BRIDGE_AXES = decks.map(deck => {
  const points = roadPoints(deck.id); if (deck.reversed) points.reverse();
  const [north, south] = points;
  BRIDGE_SECTIONS.push({ id: deck.id, a: { ...north, y: BRIDGE_HEIGHT }, b: { ...south, y: BRIDGE_HEIGHT }, width: 10.4, main: true });
  for (const [id, end] of [[deck.north, north], [deck.south, south]] as const) {
    const approach = roadPoints(id);
    if (length(approach[0], end) > length(approach[approach.length - 1], end)) approach.reverse();
    const approachLength = id === deck.north ? APPROACH_LENGTH : SOUTH_APPROACH_LENGTH;
    let remaining = approachLength; let landing = approach[approach.length - 1];
    for (let i = 1; i < approach.length; i++) {
      const a = approach[i - 1]; const b = approach[i]; const segment = length(a, b);
      if (remaining <= segment) { landing = { x: a.x + (b.x - a.x) * (remaining / segment), z: a.z + (b.z - a.z) * (remaining / segment) }; break; }
      remaining -= segment;
    }
    const ground = terrainHeight(landing);
    let travelled = 0;
    for (let i = 1; i < approach.length && travelled < approachLength; i++) {
      const a = approach[i - 1]; const b = approach[i]; const segment = length(a, b);
      const use = Math.min(segment, approachLength - travelled);
      const t = use / segment;
      BRIDGE_SECTIONS.push({ id, a: { ...a, y: BRIDGE_HEIGHT + (ground - BRIDGE_HEIGHT) * (travelled / approachLength) }, b: { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, y: BRIDGE_HEIGHT + (ground - BRIDGE_HEIGHT) * ((travelled + use) / approachLength) }, width: 10.4, main: false });
      travelled += use;
    }
  }
  return { id: deck.id, north, south, length: length(north, south) };
});
export function projectBridge(p: Point, section: BridgeSection) {
  const dx = section.b.x - section.a.x; const dz = section.b.z - section.a.z;
  const t = Math.max(0, Math.min(1, ((p.x - section.a.x) * dx + (p.z - section.a.z) * dz) / (dx * dx + dz * dz)));
  const x = section.a.x + dx * t; const z = section.a.z + dz * t;
  return { x, z, y: section.a.y + (section.b.y - section.a.y) * t, distance: Math.hypot(p.x - x, p.z - z), t };
}
export function bridgeSurface(p: Point, margin = 0) {
  let best: (BridgePoint & { distance: number; section: BridgeSection }) | undefined;
  for (const section of BRIDGE_SECTIONS) {
    const hit = projectBridge(p, section);
    if (hit.distance <= section.width / 2 + margin && (!best || hit.distance < best.distance)) best = { ...hit, section };
  }
  return best;
}
export function roadDeckHeight(id: string, p: Point) {
  let best = Infinity; let y = 0;
  for (const section of BRIDGE_SECTIONS) if (section.id === id) {
    const hit = projectBridge(p, section);
    if (hit.distance < best && hit.distance < section.width / 2 + 0.1) { best = hit.distance; y = hit.y; }
  }
  return y;
}
export const treeClearsBridge = (p: Point) => !bridgeSurface(p, 5);
export function deckVertices(s: BridgeSection, thickness = 0.9) {
  const d = length(s.a, s.b); const nx = (s.b.z - s.a.z) / d; const nz = -(s.b.x - s.a.x) / d;
  return [s.a, s.b].flatMap(p => [-1, 1].flatMap(side => [0, -thickness].flatMap(dy => [p.x + nx * side * (s.width / 2), p.y + dy, p.z + nz * side * (s.width / 2)])));
}
export type BridgeRail = { at: [number, number, number]; size: [number, number, number]; yaw: number; pitch: number };
export const BRIDGE_RAILS: BridgeRail[] = BRIDGE_SECTIONS.flatMap(s => {
  const d = length(s.a, s.b); const yaw = Math.atan2(s.b.x - s.a.x, s.b.z - s.a.z);
  return [-1, 1].map(side => ({ at: [(s.a.x + s.b.x) / 2 + Math.cos(yaw) * side * (s.width / 2 - 0.12), (s.a.y + s.b.y) / 2 + 0.62, (s.a.z + s.b.z) / 2 - Math.sin(yaw) * side * (s.width / 2 - 0.12)] as [number, number, number], size: [0.24, 1.24, Math.hypot(d, s.b.y - s.a.y)] as [number, number, number], yaw, pitch: -Math.atan2(s.b.y - s.a.y, d) }));
});
export function bridgeSolid(p: BridgePoint, margin = 0.15) {
  const hit = bridgeSurface(p, margin);
  if (!hit) return false;
  if (p.y > hit.y - 0.9 - margin && p.y < hit.y + margin) return true;
  return hit.distance > hit.section.width / 2 - 0.4 - margin && p.y > hit.y && p.y < hit.y + 1.3 + margin;
}
// Preserve the selected surface. An actor under a high deck is never snapped
// onto it; old flat-map saves over the river are explicitly migrated on load.
export function restoreBridgePosition<T extends Point & { y?: number }>(p: T, legacy = false): T & { y: number } {
  const hit = bridgeSurface(p, -0.2);
  const y = Number.isFinite(p.y) ? p.y || 0 : terrainHeight(p);
  return { ...p, y: hit && (Math.abs(y - hit.y) < 2 || (legacy && hit.section.main)) ? hit.y : y };
}
