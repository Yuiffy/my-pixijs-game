import type { Game, Npc } from "./simulation";
import { closestOnSegment, distance, type Point } from "./world";
import { NEIGHBOR_ORDERS } from "./life";
import { CITIZEN_WALKS } from "./pedestrian-layout";
import { pedestrianClear } from "./pedestrian";
import { terrainHeight } from "./terrain";

export type CitizenAction = "walk" | "look" | "photo" | "stretch" | "shop";
type Stop = Point & { action?: CitizenAction; seconds?: number; angle?: number };
type Plan = { pace: number; outfit: string; trim: string; hair: string; prop: "camera" | "bag" | "cap" | "none"; stops: Stop[] };
export type CitizenRoutine = { target: number; remaining: number; action: CitizenAction; odometer: number; laps: number; waiting: "交谈" | "等餐" | "让车" | "让路" | null };
const stop = (id: string, index: number, action?: CitizenAction, seconds = 0, angle = 0): Stop => ({ ...CITIZEN_WALKS[id][index], action, seconds, angle });

// Short out-and-back walks stay on one pavement instead of cutting diagonally
// across blocks or crossing the road to close an arbitrary loop.
export const CITIZEN_PLANS: Record<string, Plan> = {
  uncle: {
    pace: 0.85,
    outfit: "#b99b70",
    trim: "#5e6457",
    hair: "#c4bca7",
    prop: "cap",
    stops: [
      stop("uncle", 0, "look", 9, 0.8), stop("uncle", 1, "stretch", 8, 1.2), stop("uncle", 2, "look", 10, 1.9),
    ],
  },
  "walker-1": {
    pace: 1.1,
    outfit: "#a9b9bb",
    trim: "#4f686f",
    hair: "#48413b",
    prop: "none",
    stops: [
      stop("walker-1", 0, "stretch", 7, -0.8), stop("walker-1", 1), stop("walker-1", 2), stop("walker-1", 3, "look", 8, 0.7), stop("walker-1", 4), stop("walker-1", 5),
    ],
  },
  "walker-2": {
    pace: 1.25,
    outfit: "#bd806c",
    trim: "#505b69",
    hair: "#393c3b",
    prop: "cap",
    stops: [
      stop("walker-2", 0, "stretch", 10, 2.2), stop("walker-2", 1), stop("walker-2", 2, "look", 6, -1.8), stop("walker-2", 3),
    ],
  },
  "walker-3": {
    pace: 0.95,
    outfit: "#d0b773",
    trim: "#6e6973",
    hair: "#59463a",
    prop: "camera",
    stops: [
      stop("walker-3", 0, "photo", 13, 1.3), stop("walker-3", 1, "photo", 11, 1.1), stop("walker-3", 2), stop("walker-3", 3, "look", 9, 1.6),
    ],
  },
  "walker-4": {
    pace: 1.05,
    outfit: "#819f84",
    trim: "#6b5d4e",
    hair: "#4e423b",
    prop: "bag",
    stops: [
      stop("walker-4", 0, "shop", 11, -1.7), stop("walker-4", 1, "shop", 12, 1.5),
    ],
  },
};
export const CITIZEN_ACTIONS: Record<CitizenAction, string> = { walk: "沿街走走", look: "停步看风景", photo: "取景拍照", stretch: "活动肩膀", shop: "看看沿街小店" };
export function createCitizenRoutine(id: string): CitizenRoutine | undefined {
  const plan = CITIZEN_PLANS[id];
  return plan ? { target: 0, remaining: plan.stops[0].seconds || 0, action: plan.stops[0].action || "look", odometer: 0, laps: 0, waiting: null } : undefined;
}
export function citizenStatus(n: Npc) {
  return n.routine?.waiting || (n.routine ? CITIZEN_ACTIONS[n.routine.action] : "街坊");
}
export function citizenLine(n: Npc) {
  const r = n.routine;
  if (!r) return n.line;
  if (n.id === "walker-3") return r.action === "photo" ? "等车过去再按快门，红桥的轮廓就干净了。你也别急，柳江不会跑。" : "我沿着这一小段换几个角度。桥、青山和江水，总能拍出不一样的样子。";
  if (n.id === "walker-4") return r.action === "shop" ? "买菜不光看新鲜，还得问问今天怎么做。再往前逛一小段就回去。" : "我先沿着这条街去看看，带着袋子慢慢逛。送粉的话，我会停下来等你。";
  if (n.id === "walker-2") return r.action === "stretch" ? "骑完车先下来活动肩膀，路口看看车再走。骑车也一样，别抢那几秒。" : "这段我下车后常来走走。桥上风大，转弯前先慢下来。";
  if (n.id === "walker-1") return r.action === "stretch" ? "走一段，松松肩膀。今天的路不赶时间，你也停一会儿？" : "沿着街巷绕一圈，再回来看看江。慢慢走，才容易碰见熟人。";
  return r.laps ? "又走回东门了。熟悉的路每天走，也能看见一点新东西。" : n.line;
}
export function citizenClear(p: Point, margin = 0.62) {
  return pedestrianClear(p, margin);
}
export function restoreCitizens(npcs: Npc[], value: unknown) {
  if (!Array.isArray(value)) return;
  for (const n of npcs) {
    const plan = CITIZEN_PLANS[n.id];
    const saved = value.find((item: unknown) => item && typeof item === "object" && "id" in item && item.id === n.id);
    if (!plan || !saved || typeof saved !== "object") continue;
    const p = saved as { x: number; z: number; angle: number; routine?: CitizenRoutine };
    const r = p.routine;
    if (!r || !Number.isFinite(p.x) || !Number.isFinite(p.z) || !Number.isFinite(p.angle) || !citizenClear(p)
      || !Number.isInteger(r.target) || r.target < 0 || r.target >= plan.stops.length
      || !Number.isFinite(r.remaining) || r.remaining < 0 || r.remaining > 15
      || !Number.isFinite(r.odometer) || r.odometer < 0 || !Number.isInteger(r.laps) || r.laps < 0
      || !Object.hasOwn(CITIZEN_ACTIONS, r.action)) continue;
    const target = plan.stops[r.target];
    const previous = plan.stops[(r.target + plan.stops.length - 1) % plan.stops.length];
    // A saved walker may be a few metres off a leg while passing a parked car.
    if (distance(p, closestOnSegment(p, previous, target)) > 5 || (r.remaining > 0 && distance(p, target) > 0.25)) continue;
    Object.assign(n, { x: p.x, z: p.z, y: terrainHeight(p), angle: p.angle, speed: 0, routine: { target: r.target, remaining: r.remaining, action: r.remaining > 0 ? target.action || "look" : "walk", odometer: Math.min(1e7, r.odometer), laps: Math.min(1e5, r.laps), waiting: null } });
  }
}
export function stepCitizens(g: Game, dt: number) {
  const recipient = g.life.delivery && NEIGHBOR_ORDERS[g.life.delivery.route].npc;
  for (const n of g.npcs) {
    const r = n.routine;
    if (!r) continue;
    const plan = CITIZEN_PLANS[n.id];
    n.speed = 0;
    r.waiting = null;
    if (distance(n, g.player) < (g.vehicle ? 5 : 4)) {
      r.waiting = "交谈";
      n.angle = Math.atan2(g.player.x - n.x, g.player.z - n.z);
      continue;
    }
    if (recipient === n.id) { r.waiting = "等餐"; continue; }
    if (r.remaining > 0) {
      r.remaining = Math.max(0, r.remaining - dt);
      n.angle = plan.stops[r.target].angle || 0;
      if (r.remaining === 0) { r.target = (r.target + 1) % plan.stops.length; r.action = "walk"; }
      continue;
    }
    const target = plan.stops[r.target];
    const gap = distance(n, target);
    if (gap <= 0.08) {
      r.remaining = target.seconds || 0;
      r.action = target.action || "walk";
      if (r.target === 0) r.laps++;
      if (!r.remaining) r.target = (r.target + 1) % plan.stops.length;
      continue;
    }
    const angle = Math.atan2(target.x - n.x, target.z - n.z);
    const stride = Math.min(gap, plan.pace * dt);
    // Wait before entering a moving car's short predicted path. A car already
    // yielding lets the pedestrian finish crossing instead of both waiting forever.
    const ahead = { x: n.x + Math.sin(angle) * 1.7, z: n.z + Math.cos(angle) * 1.7 };
    if (g.traffic.some(car => {
      if (car.speed < 0.4) return false;
      const future = { x: car.x + Math.sin(car.angle) * car.speed * 1.5, z: car.z + Math.cos(car.angle) * car.speed * 1.5 };
      return distance(ahead, closestOnSegment(ahead, car, future)) < 3 && distance(n, car) > 3;
    })) { r.waiting = "让车"; continue; }
    const clear = (p: Point) => citizenClear(p)
      && distance(p, g.player) >= (g.vehicle ? 2.8 : 0.85)
      && !g.traffic.some(car => distance(p, car) < 2.7)
      && !g.vehicles.some(v => distance(p, v) < (v.kind === "car" ? 2.45 : 1))
      && !g.npcs.some(other => other !== n && distance(p, other) < 0.85);
    const next = [0, 0.6, -0.6, 1.15, -1.15, 1.55, -1.55]
      .map(offset => ({ x: n.x + Math.sin(angle + offset) * stride, z: n.z + Math.cos(angle + offset) * stride }))
      .find(clear);
    if (next) {
      const moved = distance(n, next);
      n.angle = Math.atan2(next.x - n.x, next.z - n.z);
      Object.assign(n, next, { y: terrainHeight(next) });
      n.speed = moved / dt;
      r.odometer += moved;
      r.action = "walk";
    } else r.waiting = "让路";
  }
}
