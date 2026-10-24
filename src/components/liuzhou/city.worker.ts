import { buildRoadGeometry } from "./roadGeometry";
import { buildSkylineGeometry } from "./skylineGeometry";
import { roadTiles, tileDistance } from "./cityStreaming";
import type { RoadJob } from "./roadGeometry";
import type { Road } from "./world";

let center = { x: 0, z: 0 };
let started = false;
globalThis.addEventListener("message", async (event: MessageEvent<{
  type: "start" | "focus";
  center: { x: number; z: number };
  segments: RoadJob["segment"][];
  roads: Road[];
  bounds: { minX: number; minZ: number; maxX: number; maxZ: number };
}>) => {
  center = event.data.center;
  if (event.data.type !== "start" || started) return;
  started = true;
  try {
    const pending = roadTiles(event.data.segments);
    const nearby = new Set(pending.filter(tile => tileDistance(tile, center) < 220).map(tile => tile.id));
    const total = pending.length + 2; let loaded = 0;
    const progress = () => postMessage({ type: "progress", loaded, total, nearbyReady: nearby.size === 0, complete: loaded === total, error: false });
    progress();
    while (pending.length) {
      const focus = { ...center };
      pending.sort((a, b) => Number(nearby.has(b.id)) - Number(nearby.has(a.id)) || tileDistance(a, focus) - tileDistance(b, focus));
      const tile = pending.shift()!;
      const data = buildRoadGeometry(tile.jobs);
      postMessage({ type: "road", id: tile.id, ...data }, { transfer: [data.positions.buffer, data.colors.buffer] });
      nearby.delete(tile.id); loaded++; progress();
      // Yield the worker event loop so a flight to a new area changes priority.
      // Sequential generation lets focus messages reorder pending work.
      // eslint-disable-next-line no-await-in-loop
      await new Promise(resolve => { setTimeout(resolve, 0); });
    }
    const paving = buildRoadGeometry([], true);
    postMessage({ type: "road", id: "guangya-paving", ...paving }, { transfer: [paving.positions.buffer, paving.colors.buffer] });
    loaded++; progress();
    const skyline = buildSkylineGeometry(event.data.roads, event.data.bounds);
    postMessage({ type: "skyline", ...skyline }, { transfer: [skyline.matrices.buffer, skyline.colors.buffer] });
    loaded++; progress();
  } catch (error) {
    postMessage({ type: "error", message: error instanceof Error ? error.message : String(error) });
  }
});
