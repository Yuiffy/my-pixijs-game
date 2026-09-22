import { BODY_RADIUS, moveBody, route, walkable } from "./navigation";

export type Point = { x: number; y: number };
export type Task = "charger" | "food" | "delta" | "hug" | "kiss";
export type Spot =
  | "sofa"
  | "shelf"
  | "entry"
  | "partner"
  | "desk"
  | "door"
  | "table";
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
export const SPOTS: Record<Spot, Point & { name: string }> = {
  sofa: { x: 220, y: 380, name: "沙发 · 回家收工" },
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
    subtitle: "门口的晚饭到了。把晚饭摆到直播桌上。TA还在讲话，动作轻一点。",
    tasks: ["food", "charger"],
    seconds: 210,
  },
  {
    title: "隔墙有耳",
    subtitle: "三角洲队友等你报点。关门，再开语音。",
    tasks: ["delta", "food"],
    seconds: 230,
  },
  {
    title: "再抱一会儿就好",
    subtitle: "TA伸出手，指了指麦克风。先用眼神暗号闭麦。",
    tasks: ["hug", "charger", "kiss"],
    seconds: 230,
  },
  {
    title: "不公开的纪念日",
    subtitle: "晚饭、队友和一个吻。把普通夜晚过成两人的秘密。",
    tasks: ["food", "delta", "charger", "kiss"],
    seconds: 300,
  },
];
export const TASK_NAMES: Record<Task, string> = {
  charger: "拿回充电器",
  food: "把晚饭摆到直播桌上",
  delta: "三角洲语音报点",
  hug: "偷偷抱一会儿",
  kiss: "交换一个晚安吻",
};
export type Save = {
  version: 1;
  unlocked: number;
  best: number[];
  stars: number[];
  endlessBest: number;
  player: "男友" | "女友";
  partner: "她" | "他";
};
export const freshSave = (): Save => ({
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
export function createGame(level = 0, seed = 1, unlocked = 0): Game {
  const safeLevel = Math.max(0, Math.min(5, Math.floor(level)));
  const safeSeed = Math.abs(Math.floor(seed)) % 4294967296 || 1;
  const tasks =
    safeLevel < 5
      ? [...LEVELS[safeLevel].tasks]
      : ((safeSeed % 2
          ? ["charger", "food", "delta", "hug"]
          : ["food", "delta", "charger", "kiss"]) as Task[]);
  return {
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
    limit: safeLevel < 5 ? LEVELS[safeLevel].seconds : 210 + (safeSeed % 51),
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
  return spot === "partner" && s.visit ? partnerPose(s) : SPOTS[spot];
}
export function partnerBehavior(s: Game) {
  const near = distance(s.player, partnerPose(s)) < 170;
  return {
    speaking: s.phase === "playing" && s.muted <= 0,
    peek:
      near &&
      (!!s.visit ||
        s.busy?.key === "food" ||
        (s.elapsed + (s.seed % 3)) % 6 < 1.3),
    mouth:
      s.phase === "playing" && s.muted <= 0
        ? 0.22 +
          0.78 * Math.abs(Math.sin(s.elapsed * 9) * Math.cos(s.elapsed * 3.1))
        : 0,
  };
}
export function nearest(s: Game): Spot | null {
  const spots = Object.keys(SPOTS) as Spot[];
  return (
    spots.find(
      (id) => distance(s.player, interactionPoint(s, id)) < (id === "door" ? 75 : 65),
    ) || null
  );
}
export function travel(s: Game, spot: Spot) {
  if (s.phase !== "playing" || s.busy || s.delta?.active) return;
  s.target = spot;
  const dest =
    spot === "partner" && s.visit
      ? { x: s.visit.x - 28, y: s.visit.y + 27 }
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
  if (s.phase !== "playing") return;
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
  const pending = (id: Task) => s.tasks.includes(id) && !s.done.includes(id);
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
  if (spot === "entry" && pending("food") && !s.carry) return { key: "pickup-food", label: "拿起外卖袋", seconds: 0.35, noise: 8 };
  if (spot === "sofa" && s.carry === "charger") return { key: "charger", label: "把充电器放好", seconds: 0.45, noise: 1 };
  if (spot === "table" && s.carry === "food") return {
      key: "food",
      label: "把饭盒和饮料摆到桌上",
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
  if (spot === "sofa" && s.tasks.every((t) => s.done.includes(t))) return { key: "finish", label: "收工，等TA下播", seconds: 0.25, noise: 0 };
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
    s.message = "外卖还是热的，放到直播桌左边的餐垫上吧。";
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
    if (key === "food" && s.seed % 3 !== 0) {
      s.visit = { x: 694, y: 329, remaining: 12 };
      s.message = "TA边讲话边起身，悄悄朝你张开手。要抱一下吗？也可以继续忙。";
    }
    if ((key === "hug" || key === "kiss") && s.visit) s.visit.remaining = 2;
  }
}
function heardNoise(s: Game, noise: number) {
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
  s.elapsed += dt;
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
