import { skinOf, SkinId } from "./skins";
import { beginDaily, Daily, dailyModal, discoverDaily, mealOf, offAir, openDailyPanel, sleepDaily, stepDaily } from "./daily";
import { BODY_RADIUS, moveBody, route, walkable } from "./navigation";
import { CAT_BOWL, CAT_LITTER, BATHROOM, encoreTasks, householdAction, noodlesWaiting, onBreak } from "./household";

export type Point = { x: number; y: number };
export type Task = "charger" | "food" | "delta" | "hug" | "kiss" | "cook" | "leisure" | "cat-food" | "cat-litter";
export type Spot =
  | "cat"
  | "cat-bowl"
  | "cat-litter"
  | "bathroom"
  | "charging"
  | "sofa"
  | "shelf"
  | "entry"
  | "partner"
  | "desk"
  | "door"
  | "table"
  | "kitchen"
  | "bed";
export type Input = {
  x: number;
  y: number;
  act: boolean;
  sprint: boolean;
  focus?: Spot | null;
};
export const emptyInput = (): Input => ({
  x: 0,
  y: 0,
  act: false,
  sprint: false,
});
export const CHARGER_TRAY = { x: 303, y: 319.4, height: 0.79 };
export const SPOTS: Record<Spot, Point & { name: string }> = {
  cat: { x: 180, y: 422, name: "小猫" },
  "cat-bowl": { x: CAT_BOWL.x, y: 435, name: "猫粮碗" },
  "cat-litter": { x: CAT_LITTER.x, y: 440, name: "猫砂盆" },
  bathroom: { ...BATHROOM, name: "洗手间" },
  charging: { x: 303, y: 380, name: "沙发扶手 · 充电托盘" },
  kitchen: { x: 416, y: 207, name: "料理台" },
  bed: { x: 666, y: 429, name: "床边" },
  sofa: { x: 220, y: 380, name: "沙发 · 休息" },
  shelf: { x: 826, y: 505, name: "充电器" },
  entry: { x: 127, y: 500, name: "门口 · 外卖" },
  partner: { x: 744, y: 339, name: "恋人" },
  table: { x: 665, y: 300, name: "直播桌 · 摆晚饭" },
  desk: { x: 230, y: 215, name: "电脑 · 三角洲" },
  door: { x: 516, y: 406, name: "隔音门" },
};
export const LEVELS: {
  title: string;
  subtitle: string;
  tasks: Task[];
  seconds: number;
}[] = [
  {
    title: "借过一下，宝贝",
    subtitle: "充电器落在直播间了。拿回来，再悄悄回到沙发。",
    tasks: ["charger"],
    seconds: 180,
  },
  {
    title: "外卖要趁热",
    subtitle: "下班轻轻开门，把晚饭放上餐垫。拿回充电器后，在沙发小睡，等TA下播。",
    tasks: ["food", "charger"],
    seconds: 330,
  },
  {
    title: "隔墙有耳",
    subtitle: "先送晚饭，再关门报点。回沙发看视频，别忘了留意恋人的微信。",
    tasks: ["food", "delta", "leisure"],
    seconds: 420,
  },
  {
    title: "想吃你做的饭",
    subtitle: "鸡蛋和米饭都备好了。炒一碗热饭，换一个偷偷的拥抱，然后回沙发等下播。",
    tasks: ["cook", "food", "hug", "leisure"],
    seconds: 420,
  },
  {
    title: "不公开的纪念日",
    subtitle: "晚饭、队友和一个吻。把普通夜晚过成两人的秘密。",
    tasks: ["food", "charger", "delta", "kiss", "leisure"],
    seconds: 480,
  },
];
export const TASK_NAMES: Record<Task, string> = {
  "cat-food": "给猫碗添一勺猫粮",
  "cat-litter": "把猫砂盆铲干净",
  cook: "给恋人炒一碗蛋炒饭",
  leisure: "在客厅放松一会儿",
  charger: "拿回充电器",
  food: "把晚饭摆到直播桌上",
  delta: "三角洲语音报点",
  hug: "偷偷抱一会儿",
  kiss: "交换一个晚安吻",
};
export type Save = {
  skin: SkinId;
  version: 1;
  unlocked: number;
  best: number[];
  stars: number[];
  endlessBest: number;
  player: "男友" | "女友";
  partner: "她" | "他";
};
export const freshSave = (): Save => ({
  skin: "host",
  version: 1,
  unlocked: 0,
  best: [0, 0, 0, 0, 0],
  stars: [0, 0, 0, 0, 0],
  endlessBest: 0,
  player: "男友",
  partner: "她",
});
export function parseSave(raw: string | null): Save {
  try {
    const s = JSON.parse(raw || "null");
    if (
      s?.version !== 1 ||
      !Number.isInteger(s.unlocked) ||
      s.unlocked < 0 ||
      s.unlocked > 5 ||
      !["男友", "女友"].includes(s.player) ||
      !["她", "他"].includes(s.partner)
    ) return freshSave();
    if (
      ![s.best, s.stars].every(
        (a) => Array.isArray(a) &&
          a.length === 5 &&
          a.every((n) => Number.isFinite(n) && n >= 0),
      ) ||
      s.stars.some((n: number) => n > 3) ||
      !Number.isFinite(s.endlessBest) ||
      s.endlessBest < 0
    ) return freshSave();
    return {
      skin: skinOf(s.skin).id,
      version: 1,
      unlocked: s.unlocked,
      best: s.best,
      stars: s.stars,
      endlessBest: s.endlessBest,
      player: s.player,
      partner: s.partner,
    };
  } catch {
    return freshSave();
  }
}
export type Busy = {
  key: string;
  elapsed: number;
  duration: number;
  noise: number;
};
export type Delta = {
  active: boolean;
  hits: number;
  misses: number;
  id: number;
  age: number;
  x: number;
  y: number;
  feedback: string;
};
export type Game = {
  skin: SkinId;
  daily: Daily | null;
  phase: "ready" | "playing" | "paused" | "result";
  level: number;
  seed: number;
  tasks: Task[];
  done: Task[];
  carry: "charger" | "food" | null;
  player: Point;
  path: Point[];
  target: Spot | null;
  quiet: boolean;
  doorClosed: boolean;
  elapsed: number;
  limit: number;
  suspicion: number;
  peak: number;
  love: number;
  noise: number;
  actionProgress: number;
  actionKey: string;
  muted: number;
  cooldown: number;
  slippers: boolean;
  seal: boolean;
  won: boolean;
  reason: string;
  message: string;
  chat: string;
  pulse: number;
  affection: number;
  bonus: boolean;
  totalScore: number;
  requireRelease: boolean;
  busy: Busy | null;
  delta: Delta | null;
  visit: { x: number; y: number; remaining: number } | null;
  noiseFlash: number;
};
export function createGame(level = 0, seed = 1, unlocked = 0, skin: SkinId = "host"): Game {
  const safeLevel = Math.max(0, Math.min(5, Math.floor(level)));
  const safeSeed = Math.abs(Math.floor(seed)) % 4294967296 || 1;
  const tasks =
    safeLevel < 5
      ? [...LEVELS[safeLevel].tasks]
      : encoreTasks(safeSeed);
  const game: Game = {
    skin: skinOf(skin).id,
    daily: null,
    phase: "ready",
    level: safeLevel,
    seed: safeSeed,
    tasks,
    done: [],
    carry: null,
    player: { x: 220, y: 430 },
    path: [],
    target: null,
    quiet: true,
    doorClosed: false,
    elapsed: 0,
    limit: safeLevel < 5 ? LEVELS[safeLevel].seconds : 480 + (safeSeed % 51),
    suspicion: 0,
    peak: 0,
    love: 0,
    noise: 0,
    actionProgress: 0,
    actionKey: "",
    muted: 0,
    cooldown: 0,
    slippers: unlocked >= 2,
    seal: unlocked >= 4,
    won: false,
    reason: "",
    message: "TA：回来了？给你留了沙发旁边的灯。",
    chat: "小耳朵：今晚的声音好温柔。",
    pulse: 0,
    affection: 0,
    bonus: false,
    totalScore: 0,
    requireRelease: false,
    busy: null,
    delta: null,
    visit: null,
    noiseFlash: 0,
  };
  if (safeLevel > 0) beginDaily(game);
  return game;
}
export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
export function broadcast(s: Game) {
  const phase = (s.elapsed + (s.level === 5 ? s.seed % 12 : 0)) % 22;
  return {
    music: phase >= 12 && phase < 19,
    remaining: phase < 12 ? 12 - phase : phase < 19 ? 19 - phase : 34 - phase,
    sensitive: phase >= 19,
    phase,
  };
}
export function partnerPose(s: Game) {
  if (offAir(s)) return s.daily?.after === "rice"
    ? { x: 447, y: 204, stand: 1 } : { x: 280, y: 395, stand: 1 };
  if (onBreak(s) && s.daily) return { x: s.daily.household.rest.x, y: s.daily.household.rest.y, stand: 1 };
  const v = s.visit;
  const amount = v
    ? Math.max(0, Math.min(1, (12 - v.remaining) / 1.4, v.remaining / 1.4))
    : 0;
  const eased = amount * amount * (3 - 2 * amount);
  return {
    x: 744 + ((v?.x ?? 744) - 744) * eased,
    y: 287 + ((v?.y ?? 287) - 287) * eased,
    stand: eased,
  };
}
export function interactionPoint(s: Game, spot: Spot): Point {
  if (spot === "cat" && s.daily) return s.daily.household.cat;
  if (spot === "cat-bowl") return CAT_BOWL;
  if (spot === "cat-litter") return CAT_LITTER;
  if (spot === "charging") return CHARGER_TRAY;
  return spot === "partner" && (s.visit || offAir(s) || onBreak(s)) ? partnerPose(s) : SPOTS[spot];
}
export function partnerBehavior(s: Game) {
  const speaking = s.phase === "playing" && !onBreak(s) && ((!offAir(s) && s.muted <= 0) || s.daily?.stage === "goodnight");
  const speechTime = offAir(s) ? s.daily?.clock ?? 0 : s.elapsed;
  const near = distance(s.player, partnerPose(s)) < 170;
  return {
    speaking,
    peek:
      near &&
      (!!s.visit ||
        s.busy?.key === "food" ||
        (s.elapsed + (s.seed % 3)) % 6 < 1.3),
    mouth:
      speaking
        ? 0.22 +
          0.78 * Math.abs(Math.sin(speechTime * 9) * Math.cos(speechTime * 3.1))
        : 0,
  };
}
export function nearest(s: Game): Spot | null {
  const spots = Object.keys(SPOTS) as Spot[];
  return (
    spots.filter(id => id !== "cat" && id !== "bathroom").find(
      (id) => distance(s.player, interactionPoint(s, id)) < (id === "door" ? 75 : 65),
    ) || null
  );
}
export function travel(s: Game, spot: Spot) {
  if (s.phase !== "playing" || s.busy || s.delta?.active || dailyModal(s)) return;
  s.target = spot;
  const dest =
    spot === "cat" && s.daily ? { x: s.daily.household.cat.x, y: s.daily.household.cat.y + (s.daily.household.cat.y > 460 ? -52 : 52) }
      : spot === "partner" && onBreak(s) ? { x: 220, y: 405 }
      : spot === "partner" && offAir(s)
      ? s.daily?.after === "rice" ? { x: 396, y: 238 } : { x: 242, y: 428 }
      : spot === "partner" && s.visit
      ? { x: s.visit.x + 26, y: s.visit.y + 9 }
      : spot === "door"
        ? { x: s.player.x < 520 ? 474 : 566, y: 410 }
        : SPOTS[spot];
  const blockedByDoor =
    spot !== "door" && s.doorClosed && s.player.x < 520 !== dest.x < 520;
  s.path = route(
    s.player,
    blockedByDoor ? { x: s.player.x < 520 ? 474 : 566, y: 410 } : dest,
    s.doorClosed,
  );
  if (blockedByDoor) s.message = "门关着。先轻轻打开它，再继续过去。";
  s.actionProgress = 0;
  if (
    spot === "partner" &&
    s.tasks.some((t) => (t === "hug" || t === "kiss") && !s.done.includes(t))
  ) s.message = "TA趁切换画面，偷偷向你张开手：过来，想抱你。";
}
export function signal(s: Game) {
  if (s.phase !== "playing" || offAir(s) || onBreak(s)) return;
  if (distance(s.player, interactionPoint(s, "partner")) >= 75) {
    s.message = "要走到TA身旁，才能交换眼神暗号。";
    return;
  }
  if (s.cooldown > 0) {
    s.message = "TA正在回答弹幕，暗号还没冷却。";
    return;
  }
  s.muted = 7;
  s.cooldown = 24;
  s.message = "TA按下闭麦键：七秒，够不够抱一下？";
}
function availableAction(
  s: Game,
  focus: Spot | null,
): {
  key: string;
  label: string;
  seconds: number;
  noise: number;
} {
  const spot =
    focus &&
    distance(s.player, interactionPoint(s, focus)) <
      (focus === "door" ? 75 : 70)
      ? focus
      : null;
  if (dailyModal(s)) return { key: "", label: "完成眼前的小事", seconds: 0, noise: 0 };
  if (s.daily?.stage === "after" && (spot === "partner" || spot === (s.daily.after === "rice" ? "kitchen" : "sofa"))) return { key: "discover", label: `轻声叫${skinOf(s.skin).name}`, seconds: 0.3, noise: 0 };
  const pending = (id: Task) => s.tasks.includes(id) && !s.done.includes(id);
  const h = s.daily?.household;
  if (spot === "cat" && h && !s.carry) return { key: "pet-cat", label: "蹲下摸摸小猫", seconds: 0.6, noise: 0 };
  if (spot === "cat-bowl" && pending("cat-food") && !s.carry) return { key: "cat-food", label: "量一勺猫粮，倒入碗里", seconds: 0.9, noise: 3 };
  if (spot === "cat-litter" && pending("cat-litter") && !s.carry) return { key: "cat-litter", label: `铲起一处结团 · ${h?.cat.scoops ?? 0}/3`, seconds: 0.7, noise: 2 };
  if (spot === "partner" && onBreak(s)) return { key: "", label: "TA暂时离席，等洗好手回来再亲近", seconds: 0, noise: 0 };
  if (spot === "kitchen" && h && s.daily?.meal === "noodles") {
    if (h.noodles === "sealed" && s.carry === "food") return { key: "boil-water", label: "放下桶面，加水烧一壶热水", seconds: 0.8, noise: 3 };
    if (h.noodles === "hot" && !s.carry) return { key: "pour-noodles", label: "撕盖放调料，倒热水泡面", seconds: 1.2, noise: 2 };
    if (h.noodles === "ready" && !s.carry) return { key: "take-noodles", label: "掀盖搅拌，拿起泡好的面", seconds: 0.5, noise: 1 };
  }
  if (spot === "kitchen" && pending("cook") && !s.carry) return { key: "cook", label: "开始炒蛋炒饭", seconds: 0.2, noise: 0 };
  if (spot === "sofa" && (pending("leisure") || noodlesWaiting(s) || onBreak(s)) && !s.carry) return { key: "leisure", label: "坐下看视频 / 玩游戏", seconds: 0.2, noise: 0 };
  if (spot === "sofa" && s.daily?.stage === "home" && s.tasks.every(t => s.done.includes(t))) return { key: "sleep", label: `在沙发上小睡，等${skinOf(s.skin).name}下播`, seconds: 0.3, noise: 0 };
  if (spot === "door") return {
      key: "door",
      label: s.doorClosed ? "轻轻开门" : "轻轻关门",
      seconds: 0.32,
      noise: 2,
    };
  if (spot === "shelf" && pending("charger") && !s.carry) return {
      key: "pickup-charger",
      label: "从抽屉里拿充电器",
      seconds: 0.4,
      noise: 13,
    };
  if (spot === "entry" && pending("food") && !s.carry && !s.daily?.homemade && (!h || s.daily?.meal !== "noodles" || h.noodles === "delivery")) return { key: "pickup-food", label: s.daily ? `拿起${mealOf(s).name}` : "拿起外卖袋", seconds: 0.35, noise: 8 };
  if (spot === "charging" && s.carry === "charger") return { key: "charger", label: "放到扶手充电托盘", seconds: 0.45, noise: 1 };
  if (spot === "table" && s.carry === "food" && (s.daily?.meal !== "noodles" || h?.noodles === "carrying")) return {
      key: "food",
      label: s.daily ? `把${s.daily.homemade ? "亲手炒的蛋炒饭" : mealOf(s).name}摆好` : "把饭盒和饮料摆到桌上",
      seconds: 1.0,
      noise: 19,
    };
  if (spot === "desk" && pending("delta")) return {
      key: "delta",
      label: "开始报点小游戏",
      seconds: 0,
      noise: s.quiet ? 16 : 48,
    };
  if (spot === "partner" && pending("hug")) return { key: "hug", label: "拥抱TA", seconds: 3, noise: 16 };
  if (spot === "partner" && pending("kiss")) return { key: "kiss", label: "轻轻吻一下", seconds: 1.4, noise: 22 };
  if (spot === "partner" && !s.bonus) return {
      key: "bonus",
      label: "额外的抱抱 · 甜蜜 +25",
      seconds: 3,
      noise: 16,
    };
  if (spot === "sofa" && !s.daily && s.tasks.every((t) => s.done.includes(t))) return { key: "finish", label: "收工，等TA下播", seconds: 0.25, noise: 0 };
  return {
    key: "",
    label: spot ? "这里暂时没有要做的事" : "点击地点走过去",
    seconds: 1,
    noise: 0,
  };
}
export function action(s: Game, focus: Spot | null = nearest(s)) {
  const a = availableAction(s, focus);
  const mode: "tap" | "hold" | "minigame" =
    a.key === "delta"
      ? "minigame"
      : ["hug", "kiss", "bonus"].includes(a.key)
        ? "hold"
        : "tap";
  return { ...a, mode };
}
function completeAction(s: Game, key: string) {
  if (householdAction(s, key)) return;
  if (key === "cook" || key === "leisure") { openDailyPanel(s, key); return; }
  if (key === "sleep") { sleepDaily(s); return; }
  if (key === "discover") { discoverDaily(s); return; }
  if (key === "door") {
    if (!walkable(s.player, !s.doorClosed, BODY_RADIUS + 2)) {
      s.message = s.doorClosed ? '你挡住门打开的位置了，往旁边退一点再开门。' : '你还站在门缝里。先走到门的一侧，再轻轻关门。';
      return;
    }
    s.doorClosed = !s.doorClosed;
    s.message = s.doorClosed
      ? "门轻轻合上了。隔墙报点更安全。"
      : "门打开了，放轻脚步。";
  } else if (key === "pickup-charger") {
    s.carry = "charger";
    s.message = "拿到了！把充电器带回沙发旁。";
  } else if (key === "pickup-food") {
    s.carry = "food";
    if (s.daily?.meal === "noodles") {
      s.daily.household.noodles = "sealed";
      s.message = "超市送来的是未开封桶面。先拿到料理台，烧壶热水。";
    } else s.message = "外卖到啦，放到直播桌左边的餐垫上吧。";
  } else if (key === "finish") end(s, true, "complete");
  else if (key === "bonus") {
    s.bonus = true;
    s.love += 25;
    s.affection = 3;
    s.message = "TA靠近你，小声说：这句喜欢，只说给你听。";
    if (s.visit) s.visit.remaining = 2;
  } else if (!s.done.includes(key as Task)) {
    s.done.push(key as Task);
    if (key === "charger" || key === "food") s.carry = null;
    s.love += key === "hug" || key === "kiss" ? 30 : 10;
    s.affection = 3;
    s.message =
      key === "delta"
        ? "队友：收到报点！配合得漂亮。"
        : key === "food"
          ? "TA继续和观众聊着，偷偷看了你一眼：晚饭好香。"
          : "TA偷偷捏了捏你的手：谢谢宝贝。";
    if (key === "food" && s.daily?.meal === "noodles") s.daily.household.noodles = "served";
    if (key === "food" && s.seed % 3 !== 0 && !onBreak(s)) {
      s.visit = { x: 694, y: 329, remaining: 12 };
      s.message = "TA边讲话边起身，悄悄朝你张开手。要抱一下吗？也可以继续忙。";
    }
    if (key === "food" && s.daily) s.message = onBreak(s)
      ? `你把${mealOf(s).name}和餐具摆到餐垫上。${skinOf(s.skin).name}还在离席，等TA回来就能吃。`
      : `你把${mealOf(s).name}摆好：${mealOf(s).note} ${skinOf(s.skin).name}笑着在桌下勾了勾你的手。`;
    if ((key === "hug" || key === "kiss") && s.visit) s.visit.remaining = 2;
  }
}
function heardNoise(s: Game, noise: number) {
  if (offAir(s) || onBreak(s)) return 0;
  const b = broadcast(s);
  const wall =
    s.player.x < 506 ? (s.doorClosed ? (s.seal ? 0.07 : 0.15) : 0.48) : 1;
  return s.muted > 0
    ? 0
    : noise * wall * (b.music ? 0.12 : b.sensitive ? 1.3 : 1);
}
function deltaTarget(s: Game) {
  const d = s.delta;
  if (!d) return;
  const n = (s.seed + d.id * 2654435761) % 2147483647;
  d.x = 0.16 + ((n % 997) / 997) * 0.68;
  d.y = 0.2 + ((Math.floor(n / 997) % 991) / 991) * 0.59;
  d.age = 0;
}
export function hitDelta(s: Game, id: number) {
  const d = s.delta;
  if (s.phase !== "playing" || !d?.active || d.id !== id) return;
  d.hits = Math.min(8, d.hits + (s.quiet ? 1 : 2));
  const noise = heardNoise(s, s.quiet ? 16 : 48);
  s.suspicion = Math.min(100, s.suspicion + noise * 0.45);
  s.peak = Math.max(s.peak, s.suspicion);
  s.noiseFlash = 0.35;
  d.feedback = s.quiet ? "报点命中 +1" : "大声报点 +2";
  if (s.suspicion >= 100) {
    end(s, false, "caught");
    return;
  }
  if (d.hits >= 8) {
    d.active = false;
    completeAction(s, "delta");
    return;
  }
  d.id++;
  deltaTarget(s);
}
export function missDelta(s: Game) {
  const d = s.delta;
  if (s.phase !== "playing" || !d?.active) return;
  d.misses++;
  d.feedback = "没点准，重新瞄准";
  const noise = heardNoise(s, 34);
  s.suspicion = Math.min(100, s.suspicion + noise * 0.4);
  s.peak = Math.max(s.peak, s.suspicion);
  s.noiseFlash = 0.35;
  if (s.suspicion >= 100) {
    end(s, false, "caught");
    return;
  }
  if (d.misses >= 3) {
    d.active = false;
    s.message = "队友：没听清！调整一下，轻按E重新报点。";
    return;
  }
  d.id++;
  deltaTarget(s);
}
export function leaveDelta(s: Game) {
  if (s.delta) s.delta.active = false;
  s.requireRelease = true;
}
export function deltaPosition(d: Delta) {
  return {
    x: d.x + Math.sin(d.age * 3 + d.id) * 0.045,
    y: d.y + Math.cos(d.age * 2.5 + d.id) * 0.035,
  };
}

export function togglePause(s: Game) {
  if (s.phase === "playing") {
    s.phase = "paused";
    s.path = [];
  } else if (s.phase === "paused") s.phase = "playing";
}
export function end(s: Game, won: boolean, reason: string) {
  s.phase = "result";
  s.won = won;
  s.reason = reason;
  s.path = [];
  s.noise = 0;
  s.busy = null;
  if (s.delta) s.delta.active = false;
  s.totalScore = won
    ? Math.round(
        800 +
          s.done.length * 250 +
          s.love * 12 +
          (s.limit - s.elapsed) * 8 +
          (100 - s.peak) * 10,
      )
    : Math.round(s.done.length * 150 + s.love * 5);
}
export const stars = (s: Game) => (!s.won
    ? 0
    : s.peak < 25 && (s.level === 0 || s.love >= 25)
      ? 3
      : s.peak < 65
        ? 2
        : 1);
export const ending = (s: Game) => (!s.won
    ? s.reason === "timeout"
      ? "再等我一下"
      : "麦里怎么有两个人"
    : s.love >= 50
      ? "未公开的热恋"
      : s.peak >= 65
        ? "全弹幕都在磕"
        : "只属于我们的晚安");
export function record(save: Save, s: Game): Save {
  if (!s.won) return save;
  const next = { ...save, best: [...save.best], stars: [...save.stars] };
  if (s.level === 5) next.endlessBest = Math.max(next.endlessBest, s.totalScore);
  else {
    next.unlocked = Math.max(next.unlocked, s.level + 1);
    next.best[s.level] = Math.max(next.best[s.level], s.totalScore);
    next.stars[s.level] = Math.max(next.stars[s.level], stars(s));
  }
  return next;
}
export function step(s: Game, dt: number, input: Input) {
  if (s.phase !== "playing" || !Number.isFinite(dt) || dt <= 0) return;
  // Split long foreground frames; controls, noise and deadlines use the same clock.
  if (dt > 0.05) {
    for (let left = dt; left > 0.00001 && s.phase === "playing"; left -= 0.05) step(s, Math.min(left, 0.05), input);
    return;
  }
  if (s.daily?.stage === "complete") { end(s, true, "daily"); return; }
  if (!offAir(s)) s.elapsed += dt;
  const modal = stepDaily(s, dt);
  if (s.elapsed >= s.limit && !offAir(s)) { end(s, false, "timeout"); return; }
  if (modal) return;
  s.muted = Math.max(0, s.muted - dt);
  s.cooldown = Math.max(0, s.cooldown - dt);
  s.affection = Math.max(0, s.affection - dt);
  s.noiseFlash = Math.max(0, s.noiseFlash - dt);
  if (s.visit) {
    s.visit.remaining -= dt;
    if (s.visit.remaining <= 0) s.visit = null;
  }
  if (s.delta?.active) {
    s.delta.age += dt;
    if (s.delta.age >= 2.1) missDelta(s);
  }
  if (s.phase !== "playing") return;
  const blocked = !!s.busy || !!s.delta?.active;
  let dx = blocked ? 0 : input.x;
  let dy = blocked ? 0 : input.y;
  if (dx || dy) s.path = [];
  if (s.path.length && !input.act && !blocked) {
    const dest = s.path[0];
    dx = dest.x - s.player.x;
    dy = dest.y - s.player.y;
    if (Math.hypot(dx, dy) < 0.5) {
      s.path.shift();
      dx = 0;
      dy = 0;
    }
  }
  const moving = (dx !== 0 || dy !== 0) && !input.act;
  let noise = 0;
  if (moving) {
    const length = Math.hypot(dx, dy);
    const speed = input.sprint ? 220 : s.quiet ? 100 : 155;
    const movement = s.path.length ? Math.min(length, speed * dt) : speed * dt;
    const x = Math.max(
      64,
      Math.min(895, s.player.x + (dx / length) * movement),
    );
    const y = Math.max(
      125,
      Math.min(516, s.player.y + (dy / length) * movement),
    );
    const moved = moveBody(s.player, { x, y }, s.doorClosed);
    s.player = moved;
    noise = input.sprint ? 18 : s.quiet ? (s.slippers ? 0.8 : 2) : 8;
    if (s.player.x > 575 && s.player.x < 640 && s.player.y > 375) noise *= 2.2;
  }
  const a = action(s, input.focus === undefined ? nearest(s) : input.focus);
  if (!input.act) s.requireRelease = false;
  if (s.busy) {
    s.busy.elapsed += dt;
    s.actionKey = s.busy.key;
    s.actionProgress = Math.min(1, s.busy.elapsed / s.busy.duration);
    noise += s.busy.noise;
    if (s.busy.elapsed >= s.busy.duration) {
      const { key } = s.busy;
      s.busy = null;
      s.actionProgress = 0;
      completeAction(s, key);
      if (s.phase !== "playing") return;
    }
  } else if (!s.delta?.active) {
    if (a.key !== s.actionKey) {
      s.actionKey = a.key;
      s.actionProgress = 0;
    }
    if (input.act && a.key && !s.requireRelease) {
      s.path = [];
      if (a.mode === "tap") {
        s.busy = {
          key: a.key,
          elapsed: 0,
          duration: a.seconds,
          noise: a.noise,
        };
        s.requireRelease = true;
      } else if (a.mode === "minigame") {
        s.delta = {
          active: true,
          hits: 0,
          misses: 0,
          id: (s.delta?.id ?? 0) + 1,
          age: 0,
          x: 0.5,
          y: 0.5,
          feedback: "点击亮起的小球完成报点",
        };
        deltaTarget(s);
        s.requireRelease = true;
      } else {
        if (s.visit) s.visit.remaining = Math.max(4, s.visit.remaining);
        s.actionProgress += dt / a.seconds;
        noise += a.noise;
        if (s.actionProgress >= 1) {
          s.actionProgress = 0;
          completeAction(s, a.key);
          s.requireRelease = true;
        }
      }
    }
  }
  const b = broadcast(s);
  s.noise = heardNoise(s, noise);
  s.suspicion = Math.max(0, Math.min(100, s.suspicion + (s.noise - 1.4) * dt));
  s.peak = Math.max(s.peak, s.suspicion);
  s.pulse += dt * (moving ? 9 : 2);
  s.chat =
    s.suspicion >= 65
      ? "耳机党：等一下，刚才是不是有人叫宝贝？！"
      : s.suspicion >= 30
        ? "小雷达：怎么有塑料袋的声音……"
        : b.music
          ? "晚安电台：这首好好听！再唱一遍！"
          : "棉花糖：今天主播笑得好甜。";
  if (s.suspicion >= 100) end(s, false, "caught");
  else if (s.elapsed >= s.limit) end(s, false, "timeout");
}
