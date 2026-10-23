import type { Point } from "./world";

// The street axes come from the shipped OSM extract. Positions are authored
// gameplay spaces on the pavement, not real residents or surveyed entrances.
// Kept separate from world.ts so urban infill can reserve these public spaces.
export const CITIZEN_WALKS: Record<string, Point[]> = {
  uncle: [{ x: 78, z: -42 }, { x: 70.63, z: -75 }, { x: 85.14, z: -10 }],
  "walker-1": [{ x: 30, z: 4.55 }, { x: 18, z: 12.06 }, { x: 16.74, z: 31.7 }, { x: 1, z: 43 }, { x: 16.74, z: 31.7 }, { x: 18, z: 12.06 }],
  "walker-2": [{ x: -17, z: 48.2 }, { x: -41, z: 60.94 }, { x: -65, z: 73.67 }, { x: -41, z: 60.94 }],
  "walker-3": [{ x: 268.7, z: -153.8 }, { x: 276.1, z: -193.1 }, { x: 268.7, z: -153.8 }, { x: 263.8, z: -119.3 }],
  "walker-4": [{ x: -160.7, z: -51.8 }, { x: -150.4, z: 2.7 }],
};

export const NPC_HOMES: Record<string, Point> = {
  shiori: { x: 28, z: -23 },
  nagisa: { x: -153, z: -20 },
  nana: { x: 235, z: 622 },
  chef: { x: -170, z: 117 },
  ...Object.fromEntries(Object.entries(CITIZEN_WALKS).map(([id, points]) => [id, points[0]])),
};

export const NPC_MEETING_POINTS = {
  nagisa: { x: 23, z: -27 },
  nana: { x: 34, z: -27 },
};
