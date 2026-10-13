import type { Game, Point } from "./engine";
import { nightRoll } from "./nightRandom";
import { route, walkable } from "./navigation";
import { skinOf } from "./skins";

export type Outing = Point & { trip: boolean; stage: "arrival" | "to-desk" | "live"; yaw: number; path: Point[]; exitClock: number };
export const tripNight = (level: number, seed: number) => level === 5 && nightRoll(seed, 65) < 0.09;
export const beforeStream = (s: Game) => !!s.daily?.outing.trip && s.daily.outing.stage !== "live" && s.daily.stage === "home";
export function createOuting(s: Game): Outing {
  const trip = tripNight(s.level, s.seed);
  return { trip, stage: trip ? "arrival" : "live", x: 179, y: 565, yaw: Math.PI, path: [], exitClock: 0 };
}
export function stepOuting(s: Game, dt: number) {
  const d = s.daily;
  if (!d) return;
  const o = d.outing;
  if (o.trip && o.stage === "arrival") {
    o.y = d.arrival === "entering" || d.arrival === "inside" ? s.player.y - 20 : 565;
    if (d.arrival === "done") { o.stage = "to-desk"; o.x = 179; o.y = 490; }
  }
  if (o.stage === "to-desk") {
    if (s.doorClosed) {
      if (!walkable(s.player, false, 12)) return;
      s.doorClosed = false; o.path = [];
    }
    if (!o.path.length) o.path = route(o, { x: 744, y: 331 }, false);
    const target = o.path[0];
    if (target) {
      const dx = target.x - o.x; const dy = target.y - o.y; const 
distance = Math.hypot(dx, dy);
      const amount = Math.min(1, (dt * 82) / Math.max(0.001, distance));
      o.x += dx * amount; o.y += dy * amount; o.yaw = Math.atan2(dx, dy);
      if (distance < 3) o.path.shift();
    }
    if (Math.hypot(o.x - 744, o.y - 331) < 3) {
      o.stage = "live"; o.path = [];
      s.message = `${skinOf(s.skin).name}放好旅行小包，戴上耳机：“晚上好，旅行回来啦！”你把两只箱子留在玄关。`;
    }
  }
  if (d.stage === "outing") {
    o.exitClock = Math.min(4, o.exitClock + dt);
    if (o.exitClock >= 4) d.stage = "complete";
  }
}
