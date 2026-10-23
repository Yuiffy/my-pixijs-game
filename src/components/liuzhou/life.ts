import type { Point } from "./world";

// Fictional neighborhood orders; destinations use the existing street residents.
export const NEIGHBOR_ORDERS = [
  { npc: "uncle", name: "散步的叔叔", meal: "少辣汤粉", thanks: "刚好走累了。坐在江边吃一碗，今天就圆满了。" },
  { npc: "walker-3", name: "拍照的游客", meal: "干捞粉", thanks: "谢谢！等这口热乎的吃完，我再去拍桥上的晚霞。" },
  { npc: "walker-4", name: "买菜的居民", meal: "清汤粉", thanks: "菜买好了，晚饭也到了。下次路过，还来坐坐呀。" },
] as const;
export const BASKET_PRICE = 32;
export const DELIVERY_PAY = 12;
export const WARM_TIP = 6;
export type Delivery = { id: number; route: number; elapsed: number };
export type Receipt = { order: number; name: string; amount: number; warm: boolean };
export type StreetLife = {
  version: 1;
  delivered: number;
  nextOrder: number;
  insulated: boolean;
  delivery: Delivery | null;
  receipt: Receipt | null;
};
export function createStreetLife(): StreetLife {
  return { version: 1, delivered: 0, nextOrder: 1, insulated: false, delivery: null, receipt: null };
}
export const warmSeconds = (life: StreetLife) => (life.insulated ? 150 : 90);
export const deliveryWarm = (life: StreetLife) => !!life.delivery && life.delivery.elapsed <= warmSeconds(life);
export function deliveryTarget(life: StreetLife, npcs: (Point & { id: string })[]) {
  const order = life.delivery && NEIGHBOR_ORDERS[life.delivery.route];
  return order ? npcs.find((n) => n.id === order.npc) || null : null;
}
export function finiteCounter(value: unknown, maximum = 1e9): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(maximum, value)) : 0;
}
export function loadStreetLife(value: unknown): StreetLife {
  const fresh = createStreetLife();
  if (!value || typeof value !== "object" || !("version" in value) || value.version !== 1) return fresh;
  const s = value as Partial<StreetLife>;
  fresh.delivered = Math.floor(finiteCounter(s.delivered, 999999));
  fresh.nextOrder = Math.max(fresh.delivered + 1, Math.floor(finiteCounter(s.nextOrder, 1e9)), 1);
  fresh.insulated = s.insulated === true;
  const d = s.delivery;
  if (d && Number.isSafeInteger(d.id) && d.id > 0 && d.id < 1e9 && Number.isInteger(d.route) && d.route >= 0 && d.route < NEIGHBOR_ORDERS.length && typeof d.elapsed === "number" && Number.isFinite(d.elapsed) && d.elapsed >= 0) {
    fresh.delivery = { id: d.id, route: d.route, elapsed: finiteCounter(d.elapsed, 86400) };
    fresh.nextOrder = Math.max(fresh.nextOrder, d.id + 1);
  }
  const r = s.receipt;
  if (r && Number.isSafeInteger(r.order) && r.order > 0 && r.order < fresh.nextOrder && NEIGHBOR_ORDERS.some((o) => o.name === r.name) && typeof r.warm === "boolean" && r.amount === DELIVERY_PAY + (r.warm ? WARM_TIP : 0)) {
    fresh.receipt = { order: r.order, name: r.name, amount: r.amount, warm: r.warm };
    // A saved receipt is the authoritative settlement for that order.
    if (fresh.delivery?.id === r.order) fresh.delivery = null;
  }
  return fresh;
}
