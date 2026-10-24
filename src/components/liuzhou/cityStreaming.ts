import type { RoadJob } from "./roadGeometry";

export type RoadChunk = { id: string; positions: Float32Array; colors: Float32Array };
export type SkylineData = { matrices: Float32Array; colors: Float32Array; buildings: number; bridgeCount: number };
export type StreamProgress = { loaded: number; total: number; nearbyReady: boolean; complete: boolean; error: boolean };
export type RoadTile = { id: string; x: number; z: number; jobs: RoadJob[] };
export const ROAD_TILE_SIZE = 256;
export function tileDistance(tile: { x: number; z: number }, point: { x: number; z: number }) {
  return Math.hypot(Math.max(0, Math.abs(tile.x - point.x) - ROAD_TILE_SIZE / 2), Math.max(0, Math.abs(tile.z - point.z) - ROAD_TILE_SIZE / 2));
}
/** Partition existing four-metre strips without moving endpoints or restarting
 * the source road's marking pattern at tile boundaries. */
export function roadTiles(segments: RoadJob["segment"][]) {
  const tiles = new Map<string, RoadTile>();
  for (const segment of segments) {
    const count = Math.ceil(Math.hypot(segment.b.x - segment.a.x, segment.b.z - segment.a.z) / 4);
    for (let first = 0; first < count;) {
      const key = (i: number) => {
        const t = (i + 0.5) / count;
        const x = Math.floor((segment.a.x + (segment.b.x - segment.a.x) * t) / ROAD_TILE_SIZE);
        const z = Math.floor((segment.a.z + (segment.b.z - segment.a.z) * t) / ROAD_TILE_SIZE);
        return { id: `${x}:${z}`, x: (x + 0.5) * ROAD_TILE_SIZE, z: (z + 0.5) * ROAD_TILE_SIZE };
      };
      const tile = key(first); let last = first + 1;
      while (last < count && key(last).id === tile.id) last++;
      if (!tiles.has(tile.id)) tiles.set(tile.id, { ...tile, jobs: [] });
      tiles.get(tile.id)!.jobs.push({ segment, first, last }); first = last;
    }
  }
  return Array.from(tiles.values());
}
