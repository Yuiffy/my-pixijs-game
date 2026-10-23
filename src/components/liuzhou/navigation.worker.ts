import { planRoute, type RouteRequest } from "./navigation";

// Search stays off the render/input thread; mode-specific grid caches survive
// repeated requests. Results carry a version so late replies cannot replace a
// newly selected destination or a route cancelled on arrival.
globalThis.onmessage = (event: MessageEvent<RouteRequest>) => {
  const { version, from, destination, mode } = event.data;
  globalThis.postMessage({ version, points: planRoute(from, destination, mode) });
};
