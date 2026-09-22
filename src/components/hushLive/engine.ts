import { moveBody, route } from './navigation';

export type Point = { x: number; y: number };
export type Task = "charger" | "food" | "delta" | "hug" | "kiss";
export type Spot = "sofa" | "shelf" | "entry" | "partner" | "desk" | "door";
export type Input = { x: number; y: number; act: boolean; sprint: boolean; focus?: Spot | null };
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
    subtitle: "门口的晚饭到了。袋子沙沙响，等唱歌时再递过去。",
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
    title: "再抱五秒就好",
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
  food: "把热外卖递给TA",
  delta: "三角洲语音报点",
  hug: "偷偷抱满五秒",
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
export function nearest(s: Game): Spot | null {
  const spots = Object.keys(SPOTS) as Spot[];
  return (
    spots.find(
      (id) => distance(s.player, SPOTS[id]) < (id === "door" ? 75 : 65),
    ) || null
  );
}
export function travel(s: Game, spot: Spot) {
  if (s.phase !== "playing") return;
  s.target = spot;
  const dest =
    spot === "door" ? { x: s.player.x < 520 ? 474 : 566, y: 410 } : SPOTS[spot];
  const blockedByDoor = spot !== 'door' && s.doorClosed && (s.player.x < 520) !== (dest.x < 520);
  s.path = route(s.player, blockedByDoor ? { x: s.player.x < 520 ? 474 : 566, y: 410 } : dest, s.doorClosed);
  if (blockedByDoor) s.message = '门关着。先轻轻打开它，再继续过去。';
  s.actionProgress = 0;
  if (
    spot === "partner" &&
    s.tasks.some((t) => (t === "hug" || t === "kiss") && !s.done.includes(t))
  ) s.message = "TA趁切换画面，偷偷向你张开手：过来，想抱你。";
}
export function signal(s: Game) {
  if (s.phase !== "playing") return;
  if (nearest(s) !== "partner") {
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
export function action(s: Game, focus: Spot | null = nearest(s)): {
  key: string;
  label: string;
  seconds: number;
  noise: number;
} {
  const spot = focus && distance(s.player, SPOTS[focus]) < (focus === 'door' ? 75 : 70) ? focus : null;
  const pending = (id: Task) => s.tasks.includes(id) && !s.done.includes(id);
  if (spot === "door") return {
      key: "door",
      label: s.doorClosed ? "轻轻开门" : "轻轻关门",
      seconds: 0.6,
      noise: 2,
    };
  if (spot === "shelf" && pending("charger") && !s.carry) return {
      key: "pickup-charger",
      label: "从抽屉里拿充电器",
      seconds: 2,
      noise: 13,
    };
  if (spot === "entry" && pending("food") && !s.carry) return { key: "pickup-food", label: "提起外卖袋", seconds: 2, noise: 8 };
  if (spot === "sofa" && s.carry === "charger") return { key: "charger", label: "把充电器收好", seconds: 1, noise: 1 };
  if (spot === "partner" && s.carry === "food") return { key: "food", label: "拆开袋子，递上晚饭", seconds: 4, noise: 19 };
  if (spot === "desk" && pending("delta")) return {
      key: "delta",
      label: s.quiet ? "低声报点 · 队友仔细听" : "激情语音 · 那边有人！",
      seconds: s.quiet ? 12 : 6,
      noise: s.quiet ? 16 : 48,
    };
  if (spot === "partner" && pending("hug")) return { key: "hug", label: "拥抱TA", seconds: 5, noise: 16 };
  if (spot === "partner" && pending("kiss")) return { key: "kiss", label: "轻轻吻一下", seconds: 3, noise: 22 };
  if (spot === "partner" && !s.bonus) return {
      key: "bonus",
      label: "额外的抱抱 · 甜蜜 +25",
      seconds: 5,
      noise: 16,
    };
  if (spot === "sofa" && s.tasks.every((t) => s.done.includes(t))) return { key: "finish", label: "收工，等TA下播", seconds: 1, noise: 0 };
  return {
    key: "",
    label: spot ? "这里暂时没有要做的事" : "点击地点走过去",
    seconds: 1,
    noise: 0,
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
export const stars = (s: Game) => (!s.won ? 0 : s.peak < 25 && (s.level === 0 || s.love >= 25) ? 3 : s.peak < 65 ? 2 : 1);
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
  let dx = input.x;
  let dy = input.y;
  if (dx || dy) s.path = [];
  if (s.path.length && !input.act) {
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
  if (a.key !== s.actionKey) {
    s.actionKey = a.key;
    s.actionProgress = 0;
  }
  if (!input.act) s.requireRelease = false;
  if (input.act && a.key && !s.requireRelease) {
    s.path = [];
    s.actionProgress += dt / a.seconds;
    noise += a.noise;
    if (s.actionProgress >= 1) {
      s.actionProgress = 0;
      if (a.key === "door") {
        s.doorClosed = !s.doorClosed;
        s.message = s.doorClosed
          ? "门轻轻合上了。隔墙语音更安全。"
          : "门打开了，走慢一点。";
      } else if (a.key === "pickup-charger") {
        s.carry = "charger";
        s.message = "拿到了！带回沙发旁边。";
      } else if (a.key === "pickup-food") {
        s.carry = "food";
        s.message = "还是热的，去直播间找TA吧。";
      } else if (a.key === "finish") {
        end(s, true, "complete");
        return;
      } else if (a.key === "bonus") {
        s.bonus = true;
        s.love += 25;
        s.affection = 3;
        s.message = "TA：刚刚那句“最喜欢你”，不是在念弹幕。";
      } else {
        s.done.push(a.key as Task);
        if (a.key === "charger" || a.key === "food") s.carry = null;
        s.love += a.key === "hug" || a.key === "kiss" ? 30 : 10;
        s.affection = 3;
        s.message =
          a.key === "delta"
            ? "队友：好报点！你今天怎么这么温柔？"
            : "TA偷偷捏了捏你的手：谢谢宝贝。";
      }
      // Require a fresh press before starting any next action (including opening the door again).
      s.requireRelease = true;
    }
  }
  const b = broadcast(s);
  const wall =
    s.player.x < 506 ? (s.doorClosed ? (s.seal ? 0.07 : 0.15) : 0.48) : 1;
  s.noise =
    s.muted > 0 ? 0 : noise * wall * (b.music ? 0.12 : b.sensitive ? 1.3 : 1);
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
