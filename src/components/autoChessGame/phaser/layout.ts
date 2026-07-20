export const WORLD_WIDTH = 1120;
export const WORLD_HEIGHT = 720;
export const TOOLBAR_HEIGHT = 42;

export type LayoutProfile = "wide" | "compact";

export const boardSlot = (index: number) => ({
  x: 44 + (index % 6) * 116 + (Math.floor(index / 6) % 2) * 20,
  y: 232 + Math.floor(index / 6) * 68,
  width: 104,
  height: 58,
});

export const benchSlot = (index: number) => ({
  x: 48 + index * 88,
  y: 600,
  width: 80,
  height: 76,
});

export const compactBoardSlot = (index: number) => ({
  x: 30 + (index % 6) * 177,
  y: 170 + Math.floor(index / 6) * 63,
  width: 156,
  height: 53,
});

export const compactBenchSlot = (index: number) => ({
  x: 42 + index * 130,
  y: 470,
  width: 116,
  height: 60,
});

export const profileFor = (width: number, height: number): LayoutProfile => {
  if (width < 720 || height > width * 1.15) return "compact";
  return "wide";
};
