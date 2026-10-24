import { BUILDINGS, buildingContains, buildingElevation, buildingFoundationDepth, distance, type Building, type Point } from "./world";
import { terrainHeight } from "./terrain";
import { undergroundFree } from "./underground";
import { bridgeSolid } from "./bridges";
import { gateContains } from "./dongmen";
import { streetContains } from "./street";
import { stationRoofSolid } from "./station";
import { terrainTriangleHeight } from "./terrainMesh";
import { eshanSurfaceHeight } from "./eshanSurface";
import { clipCameraBoom } from "../gameCamera/boom";

// Camera collision matches the wall, roof and the thin shop awnings in Scene.
// Treating an awning's entire ground projection as a wall traps the camera
// inside the player when resuming next to a storefront.
export function cameraBlocked(p: Point & { y: number }, b: Building) {
  const y = p.y - buildingElevation(b);
  if (y < -buildingFoundationDepth(b) - 0.2) return false;
  if (y < b.h + 0.8 && buildingContains(p, b, 0.4)) return true;
  if (b.footprint || b.id.startsWith("urban-wall-") || Math.abs(y - 2.9) > 0.38) return false;
  const dx = p.x - b.x; const dz = p.z - b.z;
  const x = dx * Math.cos(b.angle) - dz * Math.sin(b.angle);
  const z = dx * Math.sin(b.angle) + dz * Math.cos(b.angle);
  return Math.abs(x) < (b.w - 0.7) / 2 + 0.25 && Math.abs(Math.abs(z) - (b.d / 2 + 1.2)) < 1.6;
}
export function constrainCamera(target: Point & { y: number }, desired: Point & { y: number }, buildings = BUILDINGS) {
  const dx = desired.x - target.x; const dy = desired.y - target.y; const dz = desired.z - target.z;
  const length = Math.hypot(dx, dy, dz);
  const nearby = buildings.filter(b => distance(b, target) < length + Math.max(b.w, b.d));
  return clipCameraBoom(target, desired, p => (!undergroundFree(p) && p.y < (eshanSurfaceHeight(p) === undefined ? terrainHeight(p) : terrainTriangleHeight(p)) + 0.4) || bridgeSolid(p) || gateContains(p, 0.18) || stationRoofSolid(p) || streetContains(p, 0.25) || nearby.some(b => cameraBlocked(p, b)));
}
export function resolveCamera(target: Point & { y: number }, yaw: number, pitch: number, zoom: number, buildings = BUILDINGS) {
  const slope = Math.sin(pitch) + 1 / zoom;
  // A wall may shorten the boom, but must never take over the player's yaw.
  // Searching for an open side and feeding it back into input caused the first
  // obstruction to rotate the camera by up to 180 degrees permanently.
  const position = constrainCamera(target, {
    x: target.x - Math.sin(yaw) * zoom,
    y: target.y + slope * zoom,
    z: target.z - Math.cos(yaw) * zoom,
  }, buildings);
  return { ...position, yaw, distance: Math.hypot(position.x - target.x, position.z - target.z) };
}
