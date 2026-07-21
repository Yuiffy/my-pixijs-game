export const WORLD_WIDTH = 1120;
export const WORLD_HEIGHT = 720;
export const TOOLBAR_HEIGHT = 42;

/** Prevent a fullscreen, high-DPI canvas from allocating an unbounded framebuffer. */
export const MAX_RENDER_PIXELS = 8_000_000;
export const MAX_DEVICE_PIXEL_RATIO = 2;
export const MAX_TEXT_RESOLUTION = 3;

export type RenderSize = {
  width: number;
  height: number;
  renderScale: number;
  devicePixelRatio: number;
};

export const renderSizeFor = (displayWidth: number, displayHeight: number, devicePixelRatio: number): RenderSize => {
  const requestedDensity = Math.max(1, Math.min(MAX_DEVICE_PIXEL_RATIO, devicePixelRatio || 1));
  const displayPixels = Math.max(1, displayWidth * displayHeight);
  const budgetDensity = Math.sqrt(MAX_RENDER_PIXELS / displayPixels);
  const density = Math.max(1, Math.min(requestedDensity, budgetDensity));
  const renderScale = Math.max(1, (displayWidth * density) / WORLD_WIDTH);

  return {
    width: Math.round(WORLD_WIDTH * renderScale),
    height: Math.round(WORLD_HEIGHT * renderScale),
    renderScale,
    devicePixelRatio: density,
  };
};

export type LayoutProfile = "wide" | "compact";

export const PREPARATION_BOARD_PANEL = { x: 26, y: 98, width: 752, height: 430 };
export const PREPARATION_SHOP_PANEL = { x: 794, y: 98, width: 300, height: 500 };
export const PREPARATION_BENCH_PANEL = { x: 26, y: 548, width: 752, height: 148 };
export const WIDE_TRAIT_STRIP = { x: 48, y: 194, width: 700, height: 25 };
export const COMPACT_TRAIT_STRIP = { x: 48, y: 160, width: 1028, height: 25 };

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
  y: 194 + Math.floor(index / 6) * 63,
  width: 156,
  height: 53,
});

export const compactBenchSlot = (index: number) => ({
  x: 42 + index * 130,
  y: 452,
  width: 116,
  height: 60,
});

export const profileFor = (width: number, height: number): LayoutProfile => {
  if (width < 720 || height > width * 1.15) return "compact";
  return "wide";
};
