import type { Game, Point, Task } from "./engine";
import { route, walkable } from "./navigation";
import { skinOf } from "./skins";

/** Independent streams prevent meal, arrival and chores from being coupled to seed parity. */
export function nightRoll(seed: number, stream: number) {
  /* eslint-disable no-bitwise -- Explicit uint32 avalanche for reproducible independent streams. */
  let x = (seed ^ Math.imul(stream, 0x9e3779b9)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x21f0aaad);
  x = Math.imul(x ^ (x >>> 15), 0x735a2d97);
  return ((x ^ (x >>> 15)) >>> 0) / 4294967296;
  /* eslint-enable no-bitwise */
}
export type Arrival = "outside" | "sofa" | "computer";
export type Noodles = "delivery" | "sealed" | "boiling" | "hot" | "steeping" | "ready" | "carrying" | "served";
export type Household = {
  arrival: Arrival;
  noodles: Noodles;
  timer: number;
  cat: Point & { mode: "walk" | "sleep" | "eat"; path: Point[]; clock: number; lap: number; yaw: number; petted: boolean; fed: boolean; scoops: number };
  rest: Point & { stage: "pending" | "out" | "inside" | "back" | "done"; due: number; clock: number; path: Point[]; yaw: number; restoreDoor: boolean; visits: number };
};
export const CAT_BOWL = { x: 352, y: 488 };
const CAT_EATING = { x: CAT_BOWL.x, y: CAT_BOWL.y - 24 };
export const CAT_LITTER = { x: 444, y: 493 };
export const BATHROOM = { x: 80, y: 221 };
export const REST_SEAT = { x: 744, y: 331 };
const CAT_PLACES = [{ x: 180, y: 422 }, { x: 320, y: 475 }, { x: 427, y: 437 }, { x: 325, y: 225 }];

export function encoreTasks(seed: number): Task[] {
  const homemade = nightRoll(seed, 2) < 0.2;
  const tasks: Task[] = homemade ? ["cook", "food"] : ["food"];
  if (nightRoll(seed, 4) < 0.7) tasks.push("cat-food");
  if (nightRoll(seed, 5) < 0.55) tasks.push("cat-litter");
  if (nightRoll(seed, 6) < 0.6) tasks.push("charger");
  if (nightRoll(seed, 7) < 0.55) tasks.push("delta");
  if (nightRoll(seed, 8) < 0.7) tasks.push(nightRoll(seed, 9) < 0.5 ? "hug" : "kiss");
  // Some nights start with chores; meal preparation remains in order.
  const chores: Task[] = tasks.filter(t => t === "cat-food" || t === "cat-litter" || t === "charger");
  const ordered = nightRoll(seed, 10) < 0.5 ? [...chores, ...tasks.filter(t => !chores.includes(t))] : tasks;
  if (nightRoll(seed, 11) < 0.65) ordered.push("leisure");
  return ordered;
}
export function createHousehold(s: Game): Household {
  const arrival: Arrival = s.level === 5 ? (["outside", "sofa", "computer"] as const)[Math.floor(nightRoll(s.seed, 1) * 3)] : "outside";
  return {
    arrival,
noodles: "delivery",
timer: 0,
    cat: { ...CAT_PLACES[0], mode: nightRoll(s.seed, 13) < 0.5 ? "sleep" : "walk", path: [], clock: 0, lap: Math.floor(nightRoll(s.seed, 14) * 4), yaw: 0, petted: false, fed: false, scoops: 0 },
    rest: { ...REST_SEAT, stage: s.level === 5 ? "pending" : "done", due: 30 + nightRoll(s.seed, 12) * 22, clock: 0, path: [], yaw: Math.PI, restoreDoor: false, visits: 0 },
  };
}
export const onBreak = (s: Game) => s.daily?.stage === "home" && ["out", "inside", "back"].includes(s.daily.household.rest.stage);
export const noodlesWaiting = (s: Game) => s.daily?.meal === "noodles" && ["boiling", "steeping"].includes(s.daily.household.noodles);
export function householdStatus(s: Game) {
  const h = s.daily?.household;
  if (!h) return "";
  const parts: string[] = [];
  if (noodlesWaiting(s)) parts.push(`${h.noodles === "boiling" ? "水壶烧水" : "泡面焖熟"} · ${Math.ceil(h.timer)}秒，可以先忙别的`);
  if (h.noodles === "hot") parts.push("水开了，去料理台冲泡");
  if (h.noodles === "ready") parts.push("泡面好了，去料理台端起来");
  if (onBreak(s)) parts.push(h.rest.stage === "inside" ? (h.rest.clock > 8 ? "TA在洗手，很快回来" : "洗手间有人 · TA暂时闭麦") : h.rest.stage === "out" ? "TA去洗手间了，留一点过道" : "TA回直播桌了");
  return parts.join(" · ");
}
export function householdAction(s: Game, key: string): boolean {
  const h = s.daily?.household;
  if (!h) return false;
  if (key === "boil-water") {
    s.carry = null; h.noodles = "boiling"; h.timer = 12;
    s.message = "桶面放到台面，水壶已加水开启。去喂猫或做别的事吧，水开会提醒你。";
  } else if (key === "pour-noodles") {
    h.noodles = "steeping"; h.timer = 10;
    s.message = "撕开封膜、放入调料，热水加到刻度线，盖上盖子。焖熟还要一小会儿。";
  } else if (key === "take-noodles") {
    h.noodles = "carrying"; s.carry = "food";
    s.message = "掀开盖子，面香冒出来了。拿好叉子，端到直播桌上的餐垫。";
  } else if (key === "cat-food") {
    h.cat.fed = true; h.cat.mode = "walk"; h.cat.path = route(h.cat, CAT_EATING, false); h.cat.clock = 0;
    if (!s.done.includes("cat-food")) { s.done.push("cat-food"); s.love += 8; }
    s.message = "量好一小勺猫粮倒进碗里，小猫听见声音跑过来吃饭。";
  } else if (key === "cat-litter") {
    h.cat.scoops = Math.min(3, h.cat.scoops + 1);
    if (h.cat.scoops === 3 && !s.done.includes("cat-litter")) { s.done.push("cat-litter"); s.love += 10; }
    s.message = h.cat.scoops < 3 ? `筛掉干净的砂，把结团装进小袋（${h.cat.scoops}/3）。` : "三处结团清理好，扎紧小袋。猫砂盆又干净了。";
  } else if (key === "pet-cat") {
    if (!h.cat.petted) { h.cat.petted = true; s.love += 4; }
    h.cat.mode = "sleep"; h.cat.path = []; h.cat.clock = 0;
    s.message = "小猫蹭蹭你的手，眯起眼睛发出呼噜声。";
  } else return false;
  return true;
}
function moveAlong(body: Point & { path: Point[]; yaw: number }, dt: number, speed: number) {
  const target = body.path[0];
  if (!target) return;
  const dx = target.x - body.x;
  const dy = target.y - body.y;
  const length = Math.hypot(dx, dy);
  body.yaw = Math.atan2(dx, dy);
  const amount = Math.min(1, (dt * speed) / Math.max(0.001, length));
  body.x += dx * amount; body.y += dy * amount;
  if (amount === 1) body.path.shift();
}
export function stepHousehold(s: Game, dt: number) {
  const d = s.daily;
  if (!d || d.panel === "lock" || d.stage !== "home") return;
  const h = d.household;
  if (noodlesWaiting(s)) {
    h.timer = Math.max(0, h.timer - dt);
    if (h.timer === 0) {
      h.noodles = h.noodles === "boiling" ? "hot" : "ready";
      s.message = h.noodles === "hot" ? "咔嗒，水壶自动跳停了。去料理台给桶面加热水吧。" : "泡面焖好了！趁热端给TA，叉子也别忘了。";
    }
  }
  const c = h.cat;
  c.clock += dt;
  if (c.mode === "walk") {
    if (!c.path.length) {
      if (c.fed && Math.hypot(c.x - CAT_EATING.x, c.y - CAT_EATING.y) < 4) { c.mode = "eat"; c.clock = 0; c.yaw = 0; } else { c.mode = "sleep"; c.clock = 0; }
    } else moveAlong(c, dt, 48);
  } else if (c.clock > (c.mode === "eat" ? 6 : 8 + nightRoll(s.seed, 15 + c.lap) * 9)) {
    c.lap++; c.mode = "walk"; c.clock = 0;
    c.path = route(c, CAT_PLACES[c.lap % CAT_PLACES.length], false);
  }
  const b = h.rest;
  if (b.stage === "done") return;
  if (b.stage === "pending") {
    // Do not interrupt an embrace, a modal interaction, or an invitation already in progress.
    if (s.elapsed < b.due || d.panel || s.busy || s.visit || s.actionProgress > 0) return;
    b.stage = "out"; b.restoreDoor = s.doorClosed; b.clock = 0;
    s.message = `${skinOf(s.skin).name}对观众说“离开一下，马上回来”，闭麦摘下耳机，起身去洗手间。`;
    d.messages.push({ from: "partner", text: "我去一下洗手间，帮我留条过道～" });
  }
  if (b.stage === "inside") {
    b.clock += dt;
    if (b.clock >= 12) { b.stage = "back"; b.path = []; s.message = "洗手间的水声停了。TA擦干手，准备回去接着播。"; }
    return;
  }
  if (s.doorClosed) {
    // Never swing the door into the player. Wait until the doorway is clear.
    if (!walkable(s.player, false, 12)) return;
    s.doorClosed = false; b.path = [];
  }
  if (!b.path.length) {
    const target = b.stage === "out" ? BATHROOM : REST_SEAT;
    if (Math.hypot(b.x - target.x, b.y - target.y) < 2) {
      if (b.stage === "out") { b.stage = "inside"; b.clock = 0; b.visits++; } else {
        b.stage = "done";
        if (b.restoreDoor && walkable(s.player, true, 12)) s.doorClosed = true;
        s.message = `${skinOf(s.skin).name}回到椅子上，戴好耳机：“回来啦，刚才聊到哪了？”`;
      }
      return;
    }
    b.path = route(b, target, false);
  }
  moveAlong(b, dt, 75);
}
