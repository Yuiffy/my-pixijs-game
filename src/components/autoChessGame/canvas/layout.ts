import type { Rect } from "./types";

export const WIDTH = 1120;
export const HEIGHT = 720;
export const TOOLBAR_HEIGHT = 38;
/** 限制物理像素，避免大屏 DPR=2 时单帧绘制数百万像素拖垮主线程 */
export const MAX_CANVAS_PIXELS = 3_000_000;
/** 再压一档 DPR，清晰度略降但大幅减轻 Canvas 2D 压力 */
export const MAX_DEVICE_PIXEL_RATIO = 1.5;
/**
 * Canvas 2D 的 shadowBlur 成本极高（每次 fill/stroke 都触发模糊），
 * 默认关闭以避免鼠标移动/战斗时拖死同浏览器其它标签页的音视频。
 */
export const ENABLE_CANVAS_SHADOWS = false;

export const TRAIT_STRIP: Rect = { x: 48, y: 194, w: 700, h: 25 };
export const TRAIT_PILL_GAP = 6;
export const TRAIT_DRAG_THRESHOLD = 8;

export const boardRect = (index: number): Rect => ({
  x: 44 + (index % 6) * 116 + (Math.floor(index / 6) % 2) * 20,
  y: 232 + Math.floor(index / 6) * 68,
  w: 104,
  h: 58,
});

export const benchRect = (index: number): Rect => ({
  x: 48 + index * 88,
  y: 600,
  w: 80,
  h: 76,
});

export const shopRect = (index: number): Rect => ({ x: 810, y: 143 + index * 74, w: 270, h: 70 });
export const starterRect = (index: number): Rect => ({ x: 90 + index * 320, y: 318, w: 300, h: 260 });
export const augmentRect = (index: number): Rect => ({ x: 75 + index * 350, y: 255, w: 320, h: 300 });
export const buyXpRect: Rect = { x: 810, y: 530, w: 82, h: 48 };
export const lockRect: Rect = { x: 900, y: 530, w: 82, h: 22 };
export const rerollRect: Rect = { x: 900, y: 556, w: 82, h: 22 };
export const battleRect: Rect = { x: 990, y: 530, w: 90, h: 48 };
export const sellRect: Rect = { x: 636, y: 553, w: 112, h: 34 };
export const restartRect: Rect = { x: 420, y: 548, w: 280, h: 62 };
export const rankingToggleRect: Rect = { x: 892, y: 100, w: 180, h: 34 };
export const rankingPanelRect: Rect = { x: 802, y: 142, w: 270, h: 344 };
export const rankingMetricRects: Array<{ metric: "damage" | "support" | "taken"; rect: Rect }> = [
  { metric: "damage", rect: { x: 814, y: 178, w: 76, h: 24 } },
  { metric: "support", rect: { x: 896, y: 178, w: 88, h: 24 } },
  { metric: "taken", rect: { x: 990, y: 178, w: 70, h: 24 } },
];
export const resultContinueRect: Rect = { x: 410, y: 638, w: 300, h: 42 };
export const resultMetricRects: Array<{ metric: "damage" | "support" | "taken"; rect: Rect }> = [
  { metric: "damage", rect: { x: 434, y: 214, w: 78, h: 24 } },
  { metric: "support", rect: { x: 521, y: 214, w: 96, h: 24 } },
  { metric: "taken", rect: { x: 626, y: 214, w: 76, h: 24 } },
];

export const inRect = (x: number, y: number, rect: Rect) => (
  x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h
);
