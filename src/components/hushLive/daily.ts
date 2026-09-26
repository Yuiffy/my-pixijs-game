import { createMini, cookKind, lockKind, miniInput, stepMini, Mini, MiniInput } from "./minigames";
import { skinOf } from "./skins";
import type { Game } from "./engine";
import { createHousehold, Household, nightRoll, onBreak, stepHousehold } from "./household";

export const MEALS = [
  {
    id: "tea",
    name: "果茶",
    note: "少冰，三分糖。吸管也帮你插好了。",
    color: "#df9b52",
  },
  {
    id: "dq",
    name: "DQ冰淇淋",
    note: "先吃一口再聊，要融化啦。",
    color: "#eee1cc",
  },
  {
    id: "bbq",
    name: "烧烤",
    note: "竹签留在盒里，别扎到手。",
    color: "#985233",
  },
  {
    id: "rice",
    name: "炒饭",
    note: "还热着，给你留了勺子。",
    color: "#dfb45e",
  },
  {
    id: "crayfish",
    name: "小龙虾",
    note: "手套放旁边了，慢慢剥。",
    color: "#c95339",
  },
  {
    id: "noodles",
    name: "桶装方便面",
    note: "盖着放一会儿，焖好了自己开吃。",
    color: "#d7b476",
  },
  {
    id: "plain",
    name: "米饭",
    note: "一碗热饭，配你最喜欢的小菜。",
    color: "#f1e6ca",
  },
  { id: "beef", name: "骰子牛", note: "六面都煎熟了，趁热吃。", color: "#895036" },
] as const;
export type Meal = (typeof MEALS)[number]["id"];
export type Daily = {
  arrival: "intro" | "locked" | "unlocked" | "open" | "entering" | "inside" | "done";
  arrivalTime: number;
  household: Household;
  mini: Mini;
  leisurePlace: "sofa" | "computer";
  meal: Meal;
  homemade: boolean;
  stage: "home" | "sleep" | "after" | "goodnight" | "complete";
  panel: "lock" | "cook" | "leisure" | "story" | null;
  clock: number;
  beats: number;
  mistakes: number;
  feedback: string;
  cooldown: number;
  volume: number;
  entertainment: "video" | "game";
  leisureTime: number;
  loudTime: number;
  replied: boolean;
  unread: boolean;
  messages: { from: "partner" | "我"; text: string }[];
  after: "rice" | "shower";
  memory: string;
};
export const mealOf = (s: Game) => MEALS.find((m) => m.id === s.daily?.meal) ?? MEALS[3];
export const offAir = (s: Game) => !!s.daily && s.daily.stage !== "home";
export const dailyModal = (s: Game) => !!s.daily && (s.daily.arrival !== "done" || !!s.daily.panel || s.daily.stage === "sleep");
export function beginDaily(s: Game) {
  const homemade = s.tasks.includes("cook");
  const meal = MEALS[s.level === 5 ? Math.floor(nightRoll(s.seed, 3) * MEALS.length) : (s.seed + s.level - 2) % MEALS.length].id;
  const household = createHousehold(s);
  const outside = household.arrival === "outside";
  s.player = outside ? { x: 139, y: 585 } : household.arrival === "sofa" ? { x: 220, y: 405 } : { x: 230, y: 220 };
  s.daily = {
    arrival: outside ? "intro" : "done",
    arrivalTime: 0,
    household,
    mini: createMini(lockKind(s.seed), s.seed),
    leisurePlace: "sofa",
    meal: homemade ? cookKind(s.seed) === "toss" ? "beef" : "rice" : meal,
    homemade,
    stage: "home",
    panel: null,
    clock: 0,
    beats: 0,
    mistakes: 0,
    feedback: "找到锁芯的卡点，轻轻转开门锁。",
    cooldown: 0,
    volume: 70,
    entertainment: "video",
    leisureTime: 0,
    loudTime: 0,
    replied: false,
    unread: false,
    messages: [
      {
        from: "partner",
        text: homemade
          ? cookKind(s.seed) === "toss" ? "今晚想吃你煎的骰子牛～记得把六个面都煎熟呀。" : "今天想吃你炒的蛋炒饭，可以嘛？鸡蛋和米饭在料理台。"
          : meal === "noodles" ? "超市送来的桶面放在门口啦。帮我烧壶水泡一下，好不好？" : `${outside ? "回来啦？" : "你在家真好。"}今晚想吃${MEALS.find((m) => m.id === meal)?.name}，放桌上就好～`,
      },
    ],
    after: s.level === 5 ? nightRoll(s.seed, 16) < 0.5 ? "rice" : "shower" : (s.seed + s.level) % 2 ? "rice" : "shower",
    memory: "",
  };
  s.message = outside ? `下班到家，门里传来${skinOf(s.skin).name}和观众聊天的声音。先轻轻开门。` : household.arrival === "sofa" ? `今晚一直在家。你从沙发上伸个懒腰，${skinOf(s.skin).name}还在隔壁直播，小猫在脚边打盹。` : `你刚结束一局游戏，摘下耳机。${skinOf(s.skin).name}在直播，先看看家里有什么需要帮忙的。`;
}
export function activityInput(s: Game, input: MiniInput, x = 0, y = 0) {
  const d = s.daily;
  if (input === "release" && d) { d.mini.held = false; return; }
  if (s.phase !== "playing" || !d || !["lock", "cook", "leisure"].includes(d.panel ?? "")) return;
  if (d.panel === "leisure" && d.entertainment !== "game") return;
  const before = d.mini.misses;
  miniInput(d.mini, input, x, y);
  syncActivity(s, before);
}
function syncActivity(s: Game, previousMisses: number) {
  const d = s.daily;
  if (!d) return;
  d.feedback = d.mini.feedback; d.beats = d.mini.score; d.mistakes = d.mini.misses;
  if (d.mini.misses > previousMisses) {
    s.suspicion = Math.min(85, s.suspicion + (d.panel === "lock" ? 6 : 4));
    s.peak = Math.max(s.peak, s.suspicion);
  }
  if (!d.mini.won || d.panel === "leisure") return;
  if (d.panel === "lock") {
    d.arrival = "unlocked";
    s.message = "咔哒，锁开了。你还站在门外，扶住门把轻轻推开。";
    s.love += d.mini.misses === 0 ? 12 : 5;
  } else if (d.panel === "cook" && !s.done.includes("cook")) {
    s.done.push("cook"); s.carry = "food"; s.love += 15;
    s.message = `${mealOf(s).name}装好了。把这份热乎的晚饭端到直播桌吧。`;
  }
  d.panel = null; s.requireRelease = true;
}
export function arrivalAction(s: Game) {
  const d = s.daily;
  if (!d || s.phase !== "playing") return;
  if (d.arrival === "intro") { d.arrival = "locked"; d.panel = "lock"; } else if (d.arrival === "unlocked") { d.arrival = "open"; s.message = "门开了一道缝。扶着门，悄悄走进去。"; } else if (d.arrival === "open") { d.arrival = "entering"; d.arrivalTime = 0; } else if (d.arrival === "inside") { d.arrival = "done"; s.requireRelease = true; s.message = `大门轻轻合上，终于到家了。${skinOf(s.skin).name}还在和观众说话。`; }
}
export function openDailyPanel(s: Game, panel: "cook" | "leisure", computer = false) {
  const d = s.daily;
  if (!d) return;
  d.panel = panel; d.clock = 0; d.beats = 0; d.mistakes = 0; d.cooldown = 0;
  d.mini = createMini(panel === "cook" ? cookKind(s.seed) : "recoil", s.seed);
  d.leisurePlace = computer ? "computer" : "sofa";
  d.entertainment = computer ? "game" : "video";
  d.feedback = ""; s.path = [];
}
export function restartPractice(s: Game) {
  if (s.phase === "playing" && s.daily?.panel === "leisure") s.daily.mini = createMini("recoil", s.seed);
}
export function replyQuietly(s: Game) {
  const d = s.daily;
  if (!d || s.phase !== "playing" || !d.unread) return;
  d.volume = 15;
  d.unread = false;
  d.replied = true;
  d.messages.push(
    { from: "我", text: "收到，戴耳机啦。你安心播。" },
    { from: "partner", text: "乖。等我下播，给你一个抱抱。" },
  );
  s.love += 10;
}
export function finishLeisure(s: Game) {
  const d = s.daily;
  if (s.phase !== "playing" || !d || d.panel !== "leisure") return;
  if (d.leisureTime >= 8 && s.tasks.includes("leisure") && !s.done.includes("leisure")) {
    s.done.push("leisure");
    s.love += d.replied || d.volume <= 25 ? 10 : 0;
    s.message = s.tasks.every(t => s.done.includes(t))
      ? `眼皮开始打架了。就在沙发上躺一会儿，等${skinOf(s.skin).name}下播。`
      : "休息一会儿舒服多了。先收起手机，继续把家里的小事做完。";
  }
  d.panel = null;
  s.requireRelease = true;
}
export function sleepDaily(s: Game) {
  if (!s.daily) return;
  if (s.phase !== "playing" || s.daily.stage !== "home" || !s.tasks.every(t => s.done.includes(t))) return;
  s.daily.household.rest.stage = "done";
  s.daily.household.rest.path = [];
  s.daily.stage = "sleep";
  s.daily.clock = 0;
  s.daily.panel = null;
  s.visit = null;
  s.path = [];
  s.doorClosed = false;
  s.message = "你裹着毯子在客厅沙发睡着了。隔壁最后一声晚安落下，直播间的灯终于暗下来。";
}
export function discoverDaily(s: Game) {
  if (!s.daily || s.daily.stage !== "after") return;
  s.daily.stage = "goodnight";
  s.daily.panel = "story";
}
export function chooseGoodnight(s: Game, choice: "together" | "care") {
  const d = s.daily;
  if (s.phase !== "playing" || !d || d.stage !== "goodnight") return;
  d.memory =
    d.after === "rice"
      ? choice === "together"
        ? `凌晨两点，一碗蛋炒饭，两把勺子。${skinOf(s.skin).name}把第一口递给你：“明天也一起吃饭吧。”`
        : `你接过锅铲，让${skinOf(s.skin).name}去坐着。背后忽然贴过来一个拥抱：“今天最开心的事，就是你在家。”`
      : choice === "together"
        ? `你把温水递过去，${skinOf(s.skin).name}靠在你肩上擦头发：“直播说了好多话，还是最想和你说晚安。”`
        : `你把干毛巾轻轻盖在${skinOf(s.skin).name}头上。${skinOf(s.skin).name}握住你的手：“头发擦干了，再抱着你睡。”`;
  d.panel = null;
  d.stage = "complete";
  s.love += 25;
  s.message = d.memory;
}
/** Returns true while an activity owns input. All activity clocks stop when the game is paused. */
export function stepDaily(s: Game, dt: number): boolean {
  const d = s.daily;
  if (!d) return false;
  d.clock += dt;
  if (d.arrival === "entering") {
    d.arrivalTime = Math.min(1.4, d.arrivalTime + dt);
    const t = d.arrivalTime / 1.4;
    s.player = { x: 139, y: 585 - 85 * (t * t * (3 - 2 * t)) };
    if (t >= 1) d.arrival = "inside";
  }
  if (d.arrival === "done") stepHousehold(s, dt);
  d.cooldown = Math.max(0, d.cooldown - dt);
  if (d.panel === "lock" || d.panel === "cook" || (d.panel === "leisure" && d.entertainment === "game")) {
    const { misses } = d.mini;
    stepMini(d.mini, dt);
    syncActivity(s, misses);
  }
  if (d.stage === "sleep" && d.clock >= 3) {
    d.stage = "after";
    d.clock = 0;
    s.message =
      d.after === "rice"
        ? `02:13 · 锅铲轻轻碰响。你醒了：${skinOf(s.skin).name}怎么还在给自己炒饭？去料理台看看。`
        : `02:13 · 浴室水声停了。${skinOf(s.skin).name}抱着毛巾走出来，看到你醒了：“吵醒你啦？”就在沙发旁，抬头看看TA。`;
  }
  if (d.panel === "leisure") {
    d.leisureTime += dt;
    if (d.volume > 35 && !onBreak(s)) {
      d.loudTime += dt;
      s.suspicion = Math.min(
        90,
        s.suspicion + dt * (d.volume / 90) * (s.doorClosed ? 0.3 : 1.4),
      );
      s.peak = Math.max(s.peak, s.suspicion);
      if (
        d.loudTime >= 2.5 &&
        !d.messages.some((m) => m.text.includes("听见"))
      ) {
        d.messages.push({
          from: "partner",
          text: `宝贝，${d.entertainment === "video" ? "视频" : "游戏"}的声音麦里都听见啦。帮我小声一点，好不好？`,
        });
        d.unread = true;
      }
    }
  }
  return dailyModal(s);
}
