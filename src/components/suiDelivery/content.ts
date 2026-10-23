import type { Checkpoint, Pickup, Surface } from "./types";

export const VIEW = { w: 960, h: 540 };
export const WORLD = { w: 3800, h: 1080, floor: 680 };
export const ORDER = "attic-soup";
export const SAVE_KEY = "sui-spring-delivery-v2";
export const LEGACY_KEY = "sui-spring-platformer-v1";
export const CHECKPOINTS: Checkpoint[] = [
  { id: "kitchen", x: 150, y: 636, name: "春芽小馆" },
  { id: "courtyard", x: 730, y: 636, name: "揉面后院" },
  { id: "awning", x: 1550, y: 636, name: "晒饼小巷" },
  { id: "cart", x: 2100, y: 636, name: "餐车站" },
  { id: "attic", x: 3000, y: 456, name: "阁楼门前" },
];
const surface = (
  id: string,
  x: number,
  y: number,
  w: number,
  kind: Surface["kind"] = "wood",
  h = 18,
  solid = false,
): Surface => ({ id, x, y, w, h, kind, solid });
export const SURFACES: Surface[] = [
  surface("street-west", 0, 680, 2230, "ground", 400, true),
  surface("street-east", 2820, 680, 980, "ground", 400, true),
  surface("door-low", 420, 562, 150, "brick", 36, true),
  surface("door-step", 410, 650, 120, "brick", 30, true),
  surface("door-high", 590, 588, 105, "wood"),
  surface("sign-canopy", 1040, 400, 280, "awning"),
  surface("sign-step", 1340, 515, 110, "wood"),
  surface("bread-alcove", 1425, 580, 100, "wood"),
  surface("trick-awning", 1770, 610, 190, "awning"),
  surface("balcony-west", 1910, 365, 210, "wood"),
  surface("cart-boarding", 2170, 592, 130, "wood"),
  surface("canal-stone-1", 2320, 742, 120, "brick"),
  surface("canal-stone-2", 2510, 710, 120, "brick"),
  surface("canal-stone-3", 2690, 650, 160, "brick"),
  surface("attic-step-1", 2800, 570, 155, "wood"),
  surface("attic-step-2", 2940, 500, 150, "wood"),
  surface("attic-balcony", 3090, 410, 510, "wood"),
];
export const PICKUPS: Pickup[] = [
  { id: "old-sign", x: 1160, y: 355, kind: "sign" },
  { id: "spare-bread", x: 1470, y: 548, kind: "bread" },
  ...[800, 850, 900].map((x, i) => ({
    id: `courtyard-coin-${i}`,
    x,
    y: 628,
    kind: "coin" as const,
  })),
  ...[1820, 1870, 1920].map((x, i) => ({
    id: `awning-coin-${i}`,
    x,
    y: 498 - i * 45,
    kind: "coin" as const,
  })),
  ...[2380, 2570, 2750].map((x, i) => ({
    id: `canal-coin-${i}`,
    x,
    y: 645 - i * 35,
    kind: "coin" as const,
  })),
];
export const DOUGH_HOMES = [
  { id: "first-dough", x: 865, y: 642 },
  { id: "sign-dough", x: 1030, y: 642 },
  { id: "cart-dough", x: 2000, y: 642 },
];
export const SIGNS = [
  { x: 180, y: 480, title: "春芽小馆", text: "第一单 · 给阁楼的花匠送热汤" },
  { x: 470, y: 540, title: "后院小门", text: "轻点跳跃穿过低门，按住跳得更高" },
  {
    x: 850,
    y: 520,
    title: "面团会记住形状",
    text: "J 挑起 → 跳上去 → 按住跳跃借力",
  },
  { x: 1170, y: 280, title: "旧招牌", text: "高路：带回它，可以改装托盘" },
  {
    x: 1660,
    y: 530,
    title: "修理师栞栞",
    text: "“我不饿。面包……放这里就好。”",
  },
  {
    x: 1830,
    y: 435,
    title: "松松的晒饼棚",
    text: "先下陷，再弹起 · 下方是安全地面",
  },
  {
    x: 2220,
    y: 450,
    title: "叮铃，餐车出发",
    text: "车顶能站 · 下方石墩也能走",
  },
  {
    x: 3350,
    y: 250,
    title: "花匠的阁楼",
    text: "“窗边的花还没浇，先吃饭吧。”",
  },
];
