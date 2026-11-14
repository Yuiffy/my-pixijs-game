// This is a staged exploration envelope, not an administrative boundary.
// Overlap the original city by 20m so a nonzero character radius crosses it.
export const HEDONG_BOUNDS = { minX: 680, maxX: 1780, minZ: -1790, maxZ: -1000 };
export const inHedong = (p: { x: number; z: number }, margin = 0) => p.x > HEDONG_BOUNDS.minX + margin && p.x < HEDONG_BOUNDS.maxX - margin && p.z > HEDONG_BOUNDS.minZ + margin && p.z < HEDONG_BOUNDS.maxZ - margin;
