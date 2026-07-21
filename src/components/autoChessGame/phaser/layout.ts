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
export const COMPACT_TRAIT_STRIP = { x: 48, y: 194, width: 1028, height: 25 };

export const occupiedSlotLayout = (
  rect: { x: number; y: number; width: number; height: number },
  isBench: boolean,
  compact: boolean,
) => {
  const showsTraits = !compact;
  const labelHeight = showsTraits ? 23 : 16;
  const label = {
    x: rect.x + 4,
    y: rect.y + rect.height - labelHeight - 3,
    width: rect.width - 8,
    height: labelHeight,
  };

  return {
    portraitRadius: compact ? 17 : isBench ? 21 : 17,
    portraitY: rect.y + (compact ? 22 : isBench ? 29 : 23),
    starBadge: {
      x: rect.x + rect.width - (compact ? 34 : 40),
      y: rect.y + 3,
      width: compact ? 30 : 36,
      height: compact ? 11 : 12,
    },
    label,
    traitY: label.y + 6,
    nameY: rect.y + rect.height - 4,
  };
};

export type ResultLayout = {
  panel: { x: number; y: number; width: number; height: number };
  kickerY: number;
  headlineY: number;
  detailY: number;
  rewardY: number;
  metricsY: number;
  rosterHeadingY: number;
  rosterY: number;
  rosterBottom: number;
  columnX: readonly [number, number];
  columnWidth: number;
  continueY: number;
  headlineSize: number;
  detailSize: number;
};

export const WIDE_RESULT_LAYOUT: ResultLayout = {
  panel: { x: 42, y: 96, width: 1036, height: 600 },
  kickerY: 116,
  headlineY: 141,
  detailY: 164,
  rewardY: 198,
  metricsY: 220,
  rosterHeadingY: 256,
  rosterY: 276,
  rosterBottom: 628,
  columnX: [64, 564],
  columnWidth: 476,
  continueY: 646,
  headlineSize: 24,
  detailSize: 10,
};

export const COMPACT_RESULT_LAYOUT: ResultLayout = {
  panel: { x: 26, y: 88, width: 1068, height: 612 },
  kickerY: 108,
  headlineY: 132,
  detailY: 154,
  rewardY: 190,
  metricsY: 212,
  rosterHeadingY: 248,
  rosterY: 268,
  rosterBottom: 626,
  columnX: [46, 566],
  columnWidth: 508,
  continueY: 648,
  headlineSize: 22,
  detailSize: 9,
};

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
  y: 238 + Math.floor(index / 6) * 63,
  width: 156,
  height: 53,
});

export const compactBenchSlot = (index: number) => ({
  x: 42 + index * 130,
  y: 488,
  width: 116,
  height: 60,
});

export const profileFor = (width: number, height: number): LayoutProfile => {
  if (width < 720 || height > width * 1.15) return "compact";
  return "wide";
};
