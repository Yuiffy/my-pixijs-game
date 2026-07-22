export const FONT_FAMILY = '"Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif';

export const COLORS = {
  background: 0x07121d,
  panel: 0x0d1d2a,
  panelStrong: 0x102938,
  border: 0x31556b,
  text: "#edf7ff",
  muted: "#8ca8bb",
  player: 0x67d9ff,
  enemy: 0xff7898,
  gold: "#ffd166",
  success: 0x61dda3,
  slotLabelFill: 0x06111b,
  slotLabelBorder: 0x5d8ba3,
  slotTextStroke: "#02080d",
  resultReward: "#ffd166",
  resultMetricIdle: 0x1c3343,
  resultMetricIdleHover: 0x294b60,
  resultMetricIdleBorder: 0x47687b,
  resultMetricIdleText: "#abc2cf",
  resultMetricDamage: 0xff9b79,
  resultMetricSupport: 0x75e6b0,
  resultMetricTaken: 0xc69bff,
};

export type ButtonTone = "neutral" | "confirm" | "economic" | "lock" | "danger" | "metricDamage" | "metricSupport" | "metricTaken";

type ButtonColors = {
  fill: number;
  hover: number;
  border: number;
  text: string;
  hoverText: string;
};

export const BUTTONS: Record<ButtonTone | "disabled", ButtonColors> = {
  neutral: { fill: 0x24546e, hover: 0x3c7898, border: 0x8edfff, text: "#eaf7ff", hoverText: "#ffffff" },
  confirm: { fill: 0x47bd8a, hover: 0x71e0b0, border: 0xa5f2d0, text: "#071b15", hoverText: "#04140e" },
  economic: { fill: 0xb9872d, hover: 0xe0b552, border: 0xffdf8b, text: "#241806", hoverText: "#130d02" },
  lock: { fill: 0x485d6b, hover: 0x6d8291, border: 0xa2bfce, text: "#eaf5fb", hoverText: "#ffffff" },
  danger: { fill: 0x983f55, hover: 0xc95b76, border: 0xffa4b8, text: "#fff4f6", hoverText: "#ffffff" },
  metricDamage: { fill: 0x7d453c, hover: 0xa65c4d, border: 0xffaa91, text: "#fff2ee", hoverText: "#ffffff" },
  metricSupport: { fill: 0x27694f, hover: 0x3f9973, border: 0x8af0bd, text: "#effff7", hoverText: "#ffffff" },
  metricTaken: { fill: 0x544277, hover: 0x765ca5, border: 0xd4b1ff, text: "#f7f1ff", hoverText: "#ffffff" },
  disabled: { fill: 0x253746, hover: 0x253746, border: 0x405767, text: "#708896", hoverText: "#708896" },
};

export const TITLE = {
  cardTop: 0x182b39,
  cardBottom: 0x09131f,
  cardHoverOverlay: 0.18,
  cardBorderAlpha: 0.82,
  eyebrow: "#aac2d2",
  summary: "#6fb4d8",
  prompt: "#829cad",
  description: "#aac0cc",
  seed: "#66869a",
  controls: "#5d7c91",
  starCyan: 0x78d9ff,
  starLilac: 0xb797ff,
  glow: 0x536dff,
  ctaText: "#eaf7ff",
  ctaHoverText: "#07131d",
};

export const DEPTH = {
  backdrop: 0,
  board: 10,
  entities: 40,
  effects: 80,
  ui: 120,
  overlay: 180,
  tooltip: 240,
};
