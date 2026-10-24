/** Shared city extent. Keep the original street reconstruction area separate:
 * expanding exploration must not regenerate the original fictional courtyards.
 */
export const CORE_BOUNDS = { minX: -440, maxX: 550, minZ: -400, maxZ: 1100 };
export const CITY_BOUNDS = { minX: -4400, maxX: 700, minZ: -3000, maxZ: 1600 };
export const inCity = (p: { x: number; z: number }, margin = 0) => p.x > CITY_BOUNDS.minX + margin && p.x < CITY_BOUNDS.maxX - margin && p.z > CITY_BOUNDS.minZ + margin && p.z < CITY_BOUNDS.maxZ - margin;
export const inCore = (p: { x: number; z: number }, margin = 0) => p.x > CORE_BOUNDS.minX - margin && p.x < CORE_BOUNDS.maxX + margin && p.z > CORE_BOUNDS.minZ - margin && p.z < CORE_BOUNDS.maxZ + margin;

export type Flight = { active: boolean; velocityY: number; travelled: number };
export const createFlight = (): Flight => ({ active: false, velocityY: 0, travelled: 0 });
export const FLIGHT_SPEED = 55;
export const FLIGHT_BOOST = 160;
export const FLIGHT_INSPECT_SPEED = 6;
export const FLIGHT_INSPECT_VERTICAL = 4;
export const FLIGHT_CEILING = 600;
