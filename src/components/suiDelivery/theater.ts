import { overlaps } from "../suiPlatformer/engine";
import { deliveryLevel } from "./levels";
import { feedback } from "./feedback";
import type { DeliveryGame, Surface } from "./types";

type Box = { x: number; y: number; w: number; h: number };
export function resetTheater(s: DeliveryGame) {
  s.theater = { time: 0, lifts: Object.fromEntries((deliveryLevel(s).theater?.lifts || []).map(lift => [lift.id, lift.y])), seated: false };
}
/** Each trip has a safe boarding stop and a full second of warning before descent. */
export function liftPhase(s: DeliveryGame, hook: string) {
  if (!s.switches.includes(hook)) return "idle";
  const t = s.theater.time % 12;
  return t < 2 ? "boarding" : t < 5 ? "rising" : t < 7 ? "high" : t < 8 ? "warning" : t < 11 ? "descending" : "boarding";
}
export function crownPhase(s: DeliveryGame) {
  if (s.switches.includes("banquet-crown")) return "off";
  const t = s.theater.time % 7;
  return t < 2 ? "closed" : t < 3 ? "warning" : "open";
}
export function banquetReady(s: DeliveryGame) {
  return ["banquet-heat", "banquet-crank", "banquet-crown"].every(id => s.switches.includes(id));
}
export function theaterSurfaces(s: DeliveryGame): Surface[] {
  const { theater } = deliveryLevel(s);
  if (!theater) return [];
  const surfaces: Surface[] = theater.lifts.map(lift => ({ id: lift.id, x: lift.x, y: s.theater.lifts[lift.id] ?? lift.y, w: lift.w, h: 20, kind: "pan" }));
  if (s.switches.includes("stage-bell")) surfaces.push({ id: "stage-scenery-bridge", x: 2230, y: 330, w: 300, h: 18, kind: "ladder" });
  if (s.levelId === "last-table" && s.switches.includes("table-served")) surfaces.push({ id: "table-curtain-bridge", x: 1410, y: 450, w: 410, h: 18, kind: "ladder" });
  if (theater.banquet) {
    if (!banquetReady(s)) surfaces.push({ id: "banquet-curtain", x: 2760, y: 0, w: 28, h: 1080, kind: "brick", solid: true });
    if (s.switches.includes("banquet-crank")) surfaces.push({ id: "banquet-side-step", x: 2200, y: 390, w: 100, h: 18, kind: "ladder" });
    if (banquetReady(s)) {
      surfaces.push({ id: "banquet-settled-bridge", x: 2680, y: 410, w: 180, h: 18, kind: "ladder" });
      surfaces.push({ id: "banquet-return-step", x: 2700, y: 590, w: 120, h: 18, kind: "ladder" });
    }
  }
  return surfaces;
}
export function advanceTheater(s: DeliveryGame, dt: number) {
  const { theater } = deliveryLevel(s);
  if (!theater) return;
  const previousPhases = theater.lifts.map(lift => liftPhase(s, lift.hook));
  const previousCrown = crownPhase(s);
  s.theater.time += dt;
  const t = s.theater.time % 12;
  const progress = t < 2 ? 0 : t < 5 ? (t - 2) / 3 : t < 8 ? 1 : t < 11 ? 1 - (t - 8) / 3 : 0;
  for (const [i, lift] of theater.lifts.map((item, index) => [index, item] as const)) {
    const previous = s.theater.lifts[lift.id] ?? lift.y;
    const target = s.switches.includes(lift.hook) ? lift.y + (lift.high - lift.y) * progress : lift.y;
    // Hooks may be opened mid-cycle. Limit speed instead of teleporting the platform.
    const y = previous + Math.max(-80 * dt, Math.min(80 * dt, target - previous));
    s.theater.lifts[lift.id] = y;
    const phase = liftPhase(s, lift.hook);
    if (phase !== previousPhases[i]) {
      if (phase === "warning") feedback(s, "warning", lift.x + lift.w / 2, y - 18);
      else if (phase === "rising" || phase === "descending") feedback(s, "rope", lift.x + lift.w / 2, y);
    }
    if (previous !== y && (y === lift.high || y === lift.y)) feedback(s, "metal", lift.x + lift.w / 2, y);
    const p = s.player;
    if (p.grounded && Math.abs(p.y + p.h - previous) < 3 && p.x + p.w > lift.x && p.x < lift.x + lift.w) p.y += y - previous;
  }
  if (theater.banquet && s.switches.includes("banquet-crank") && previousCrown !== crownPhase(s)) {
    const crown = theater.hooks.find(hook => hook.id === "banquet-crown");
    if (crown && crownPhase(s) === "warning") feedback(s, "warning", crown.x, crown.y - 30);
    else if (crown && crownPhase(s) === "open") feedback(s, "mechanism", crown.x, crown.y);
  }
}
export function attackTheater(s: DeliveryGame, box: Box, tell: (text: string) => void) {
  const { theater } = deliveryLevel(s);
  if (!theater) return;
  for (const hook of theater.hooks) {
    if (s.switches.includes(hook.id) || (hook.requires && !s.switches.includes(hook.requires)) || !overlaps(box, { x: hook.x - 18, y: hook.y - 22, w: 36, h: 44 })) continue;
    if (hook.id === "banquet-crown" && crownPhase(s) !== "open") {
      if (!s.player.hit.includes(hook.id)) {
        tell("冠轮的外壳还没张开。先看它闪动，再等四片外壳展开。");
        feedback(s, "blocked", hook.x, hook.y);
      }
      s.player.hit.push(hook.id);
      continue;
    }
    s.switches.push(hook.id);
    feedback(s, hook.id.startsWith("banquet-") ? "mechanism" : "rope", hook.x, hook.y);
    tell(hook.id === "banquet-crank" ? "绞盘停稳了，侧踏板放下！最后去高处，把张开的冠轮挑停。" : hook.id === "banquet-crown" ? "三个部件都停稳了。机械臂放下餐桥，大家在长桌等你。" : "绳扣松开了！吊台会往返，上行后会停一会，下行前有箭头预告。");
  }
}
export function theaterInteraction(s: DeliveryGame, pressed: boolean, tell: (text: string) => void) {
  const level = deliveryLevel(s);
  const table = level.theater?.table;
  if (!table || Math.abs(s.player.x + 13 - table.x) > 70 || Math.abs(s.player.y + 44 - table.y) > 55) return false;
  const id = level.theater?.banquet ? "banquet-served" : "table-served";
  s.prompt = s.switches.includes(id) ? (id === "banquet-served" ? "红椅子在右边，走过去 E 坐下" : "第一篮已经摆好，另一篮送到长桌") : id === "banquet-served" ? "E · 把春日合菜摆上长桌" : "E · 放下第一篮饭，收起幕布";
  if (pressed && s.carrying && !s.switches.includes(id) && (!level.theater?.banquet || banquetReady(s))) {
    s.switches.push(id);
    feedback(s, "kindness", table.x, table.y - 20);
    tell(id === "banquet-served" ? "合菜摆上桌了。露医生指了指右边的红椅子：岁己，你也坐下来吃吧。" : "第一篮饭摆上桌，后台的人坐下了。幕布缓缓收起，另一篮饭还好好装在餐箱里。");
  }
  return true;
}
