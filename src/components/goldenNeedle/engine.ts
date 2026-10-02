export type Phase =
  | "welcome"
  | "clean"
  | "numb"
  | "wipe"
  | "needle"
  | "cool"
  | "result";
export type Tool = "swab" | "cream" | "probe" | "ice";
export type Difficulty = "gentle" | "normal" | "chaos";
export type Point = { x: number; y: number };
export type Spot = Point & {
  id: number;
  clean: number;
  cream: number;
  wiped: number;
  treated: boolean;
  quality: number;
  cooled: number;
  angle: number;
};
export type GameState = {
  phase: Phase;
  difficulty: Difficulty;
  tool: Tool;
  spots: Spot[];
  pointer: Point;
  hand: Point;
  angle: number;
  turning: number;
  down: boolean;
  pulse: { spot: number; time: number; drift: number } | null;
  time: number;
  phaseTime: number;
  pain: number;
  heat: number;
  risk: number;
  score: number;
  combo: number;
  bestCombo: number;
  lastSpot: number | null;
  mistakes: number;
  perfect: number;
  paused: boolean;
  reliefUsed: boolean;
  relief: number;
  curtain: number;
  message: string;
  reaction: string;
  event: number;
  flash: number;
  result: "success" | "stopped" | null;
};

export const WIDTH = 760;
export const HEIGHT = 660;
export const DIFFICULTIES = {
  gentle: {
    name: "初诊 · 稳稳来",
    hint: "12 个落点，宽松时机",
    window: [0.48, 1.08],
    pain: 0.8,
    shake: 0.6,
  },
  normal: {
    name: "进阶 · 手别抖",
    hint: "15 个落点，角度挑战",
    window: [0.55, 0.94],
    pain: 1,
    shake: 1,
  },
  chaos: {
    name: "整活 · 遭老罪",
    hint: "18 个落点，弹幕陪练",
    window: [0.6, 0.87],
    pain: 1.2,
    shake: 1.45,
  },
} as const;

export const PHASES: Phase[] = ["clean", "numb", "wipe", "needle", "cool"];
export const PHASE_NAMES: Record<Phase, string> = {
  welcome: "准备接诊",
  clean: "清洁面部",
  numb: "均匀敷麻",
  wipe: "擦除准备",
  needle: "黄金微针",
  cool: "舒缓收尾",
  result: "本次记录",
};
export const TOOL_NAMES: Record<Tool, string> = {
  swab: "清洁棉片",
  cream: "敷麻刷",
  probe: "微针探头",
  ice: "冷敷包",
};
export const INSTRUCTIONS: Record<Phase, string> = {
  welcome: "把美丽的愿望，交给一双稳稳的手。",
  clean: "拿棉片，按住并擦过脸上的每个圆点。",
  numb: "换敷麻刷，按住涂满每个圆点。",
  wipe: "换回棉片，把敷好的白色膏体擦干净。",
  needle: "探头对准圆点，按住蓄力，在金色区间松开。",
  cool: "换冷敷包，按住照顾每个做完的落点。",
  result: "手艺和体贴，都算在这张成绩单里。",
};
const BASE_SPOTS: Point[] = [
  { x: 325, y: 166 },
  { x: 380, y: 150 },
  { x: 435, y: 166 },
  { x: 264, y: 309 },
  { x: 313, y: 325 },
  { x: 285, y: 370 },
  { x: 496, y: 309 },
  { x: 447, y: 325 },
  { x: 475, y: 370 },
  { x: 335, y: 420 },
  { x: 380, y: 441 },
  { x: 425, y: 420 },
];
const clamp = (n: number, min = 0, max = 100) => Math.max(min, Math.min(max, n));

export function createGame(
  difficulty: Difficulty = "gentle",
  welcome = false,
): GameState {
  const points = [...BASE_SPOTS];
  if (difficulty !== "gentle") points.push({ x: 272, y: 265 }, { x: 488, y: 265 }, { x: 380, y: 194 });
  if (difficulty === "chaos") points.push({ x: 309, y: 208 }, { x: 451, y: 208 }, { x: 380, y: 391 });
  return {
    phase: welcome ? "welcome" : "clean",
    difficulty,
    tool: "swab",
    spots: points.map((p, id) => ({
      ...p,
      id,
      clean: 0,
      cream: 0,
      wiped: 0,
      treated: false,
      quality: 0,
      cooled: 0,
      angle: difficulty === "gentle" ? 0 : ((id % 3) - 1) * 15,
    })),
    pointer: { x: 592, y: 450 },
    hand: { x: 592, y: 450 },
    angle: 0,
    turning: 0,
    down: false,
    pulse: null,
    time: 0,
    phaseTime: 0,
    pain: 8,
    heat: 0,
    risk: 0,
    score: 0,
    combo: 0,
    bestCombo: 0,
    lastSpot: null,
    mistakes: 0,
    perfect: 0,
    paused: false,
    reliefUsed: false,
    relief: 0,
    curtain: 0,
    message: "先做准备，慢慢来。",
    reaction: "我有一点点紧张。",
    event: 0,
    flash: 0,
    result: null,
  };
}

export function feedback(s: GameState, message: string, reaction?: string) {
  s.message = message;
  if (reaction) s.reaction = reaction;
  s.event += 1;
  s.flash = 0.7;
}

export function nearestSpot(s: GameState, p: Point = s.hand, radius = 24) {
  return s.spots.find(
    (spot) => Math.hypot(spot.x - p.x, spot.y - p.y) < radius,
  );
}

function transition(s: GameState, phase: Phase) {
  s.phase = phase;
  s.phaseTime = 0;
  s.down = false;
  s.pulse = null;
  feedback(
    s,
    INSTRUCTIONS[phase],
    phase === "needle" ? "那个小方块……要来了！" : undefined,
  );
}

function stop(s: GameState) {
  s.result = "stopped";
  transition(s, "result");
  feedback(
    s,
    "本次提前收工。重来时少连扎，多冷敷。",
    "先暂停一下！饼干岁，救救！",
  );
}

function mistake(s: GameState, message: string, cost = 9) {
  s.mistakes += 1;
  s.combo = 0;
  s.pain = clamp(s.pain + cost * (s.relief > 0 ? 0.55 : 1));
  s.risk = clamp(s.risk + cost);
  feedback(
    s,
    message,
    ["等、等一下！", "脸不是打卡机！", "你也紧张了吗？"][s.mistakes % 3],
  );
  if (s.risk >= 100 || s.pain >= 100) stop(s);
}

export function selectTool(s: GameState, tool: Tool) {
  if (s.paused || s.phase === "result" || s.curtain > 0) return;
  if (s.down) {
    s.down = false;
    s.pulse = null;
  }
  s.tool = tool;
}

export function setPaused(s: GameState, paused: boolean) {
  s.paused = paused;
  s.down = false;
  s.pulse = null;
  s.turning = 0;
}

export function activateRelief(s: GameState) {
  if (
    s.paused ||
    s.reliefUsed ||
    !["clean", "numb", "wipe", "needle"].includes(s.phase)
  ) return false;
  s.reliefUsed = true;
  s.curtain = 2.2;
  s.down = false;
  s.pulse = null;
  feedback(s, "拉上帘子，给勇气一点时间。", "那个叫栓剂啦！");
  return true;
}

export function press(s: GameState) {
  if (s.paused || s.curtain > 0 || ["welcome", "result"].includes(s.phase)) return;
  s.down = true;
  if (s.phase !== "needle" || s.tool !== "probe") return;
  const spot = nearestSpot(s);
  if (!spot) {
    mistake(s, "偏离落点了：把探头中心移到圆圈里。", 5);
    return;
  }
  if (spot.treated) {
    mistake(s, "这里已经完成了，换一个空心圆。", 12);
    return;
  }
  if (s.heat >= 68) {
    feedback(s, "探头热了。松手等一等，或换冷敷包。");
    return;
  }
  if (Math.abs(s.angle - spot.angle) > 12) {
    feedback(s, "方向还没对齐。用 Q / E 或旁边的旋钮转一转。");
    return;
  }
  s.pulse = { spot: spot.id, time: 0, drift: 0 };
}

export function release(s: GameState) {
  s.down = false;
  const { pulse } = s;
  s.pulse = null;
  if (!pulse || s.paused || s.phase !== "needle") return;
  const spot = s.spots[pulse.spot];
  const [low, high] = DIFFICULTIES[s.difficulty].window;
  if (pulse.time < low) {
    feedback(s, "太快啦，等指针进入金色区间再松开。");
    s.combo = 0;
    return;
  }
  if (pulse.drift > 29 || Math.abs(s.angle - spot.angle) > 14) {
    mistake(s, "下针时手滑了。对准之后，先停稳再按。");
    return;
  }
  if (pulse.time > high) {
    mistake(s, "按得太久了。金色区间一到就松手！", 13);
    return;
  }
  const quality = clamp(
    100 - Math.abs(pulse.time - (low + high) / 2) * 65 - pulse.drift * 0.7,
    50,
    100,
  );
  spot.treated = true;
  s.lastSpot = spot.id;
  spot.quality = Math.round(quality);
  s.combo += 1;
  s.bestCombo = Math.max(s.bestCombo, s.combo);
  if (quality >= 88) s.perfect += 1;
  s.score += Math.round(quality + Math.min(s.combo, 5) * 8);
  const reliefFactor = s.relief > 0 ? 0.42 : 1;
  s.pain = clamp(
    s.pain +
      (11 + s.heat * 0.08) * DIFFICULTIES[s.difficulty].pain * reliefFactor,
  );
  s.heat = clamp(s.heat + 21);
  feedback(
    s,
    `${quality >= 88 ? "漂亮！" : "稳稳落针"} ${spot.id + 1} 号完成 · ${s.combo} 连稳`,
    s.relief > 0
      ? "好像……还可以撑一撑。"
      : ["我可真是遭老罪了。", "嘶——饼干岁看着呢！", "这是什么黄金树祷告？"][
          spot.id % 3
        ],
  );
  if (s.pain >= 100) {
    stop(s);
    return;
  }
  if (s.spots.every((p) => p.treated)) transition(s, "cool");
}

export function cancelPress(s: GameState) {
  s.down = false;
  s.pulse = null;
  s.turning = 0;
}

function step(s: GameState, dt: number) {
  if (s.paused || ["welcome", "result"].includes(s.phase)) return;
  s.time += dt;
  s.phaseTime += dt;
  s.flash = Math.max(0, s.flash - dt);
  if (s.curtain > 0) {
    s.curtain = Math.max(0, s.curtain - dt);
    if (s.curtain === 0) {
      s.relief = 90;
      s.pain = Math.max(0, s.pain - 30);
      feedback(s, "止痛道具生效了：疼痛增长暂时减慢。", "好了，重新启动勇气！");
    }
    return;
  }
  s.relief = Math.max(0, s.relief - dt);
  s.angle = clamp(s.angle + s.turning * dt * 55, -40, 40);
  const shake =
    Math.max(0, s.pain - 22) * 0.13 * DIFFICULTIES[s.difficulty].shake;
  const follow = 1 - Math.exp(-dt * 19);
  s.hand.x += (s.pointer.x + Math.sin(s.time * 17) * shake - s.hand.x) * follow;
  s.hand.y +=
    (s.pointer.y + Math.cos(s.time * 13) * shake * 0.65 - s.hand.y) * follow;
  s.heat = Math.max(0, s.heat - dt * 5.8);
  s.pain = Math.max(0, s.pain - dt * (s.relief > 0 ? 1.3 : 0.52));
  if (s.pulse) {
    s.pulse.time += dt;
    const spot = s.spots[s.pulse.spot];
    s.pulse.drift = Math.max(
      s.pulse.drift,
      Math.hypot(s.hand.x - spot.x, s.hand.y - spot.y),
    );
    if (s.pulse.time > 1.5) {
      s.pulse = null;
      s.down = false;
      mistake(s, "长按保护：探头已自动抬起。", 15);
    }
  }
  if (s.down && s.tool === "ice" && ["needle", "cool"].includes(s.phase)) {
    const onFace =
      ((s.hand.x - 380) / 144) ** 2 + ((s.hand.y - 295) / 186) ** 2 < 1;
    if (onFace) {
      s.pain = Math.max(0, s.pain - dt * 20);
      s.heat = Math.max(0, s.heat - dt * 30);
    }
  }
  if (s.down) {
    for (const spot of s.spots) {
      if (Math.hypot(s.hand.x - spot.x, s.hand.y - spot.y) > 33) continue;
      if (s.phase === "clean" && s.tool === "swab") spot.clean = Math.min(1, spot.clean + dt * 3.3);
      if (s.phase === "numb" && s.tool === "cream") spot.cream = Math.min(1, spot.cream + dt * 2.8);
      if (s.phase === "wipe" && s.tool === "swab") spot.wiped = Math.min(1, spot.wiped + dt * 3.3);
      if (s.phase === "cool" && s.tool === "ice") spot.cooled = Math.min(1, spot.cooled + dt * 1.8);
    }
  }
  if (s.phase === "clean" && s.spots.every((p) => p.clean >= 1)) transition(s, "numb");
  else if (s.phase === "numb" && s.spots.every((p) => p.cream >= 1)) transition(s, "wipe");
  else if (s.phase === "wipe" && s.spots.every((p) => p.wiped >= 1)) transition(s, "needle");
  else if (s.phase === "cool" && s.spots.every((p) => p.cooled >= 1)) {
    s.score += Math.round(250 + Math.max(0, 100 - s.risk) * 3);
    s.result = "success";
    transition(s, "result");
    s.reaction = "辛苦了。今天就先美到这里！";
  }
}

export function advance(s: GameState, seconds: number) {
  let left = Math.max(0, Math.min(seconds, 300));
  while (left > 0.00001) {
    const dt = Math.min(left, 1 / 60);
    step(s, dt);
    left -= dt;
  }
}

export function completion(s: GameState) {
  const keys: Partial<
    Record<Phase, "clean" | "cream" | "wiped" | "treated" | "cooled">
  > = {
    clean: "clean",
    numb: "cream",
    wipe: "wiped",
    needle: "treated",
    cool: "cooled",
  };
  const key = keys[s.phase];
  return key
    ? s.spots.filter((p) => Number(p[key]) >= 1).length
    : s.spots.filter((p) => p.treated).length;
}

export function grade(s: GameState) {
  if (s.result !== "success") return { letter: "再来", title: "勇气先存档", stars: 0 };
  const quality =
    s.spots.reduce((sum, p) => sum + p.quality, 0) / s.spots.length;
  const stars =
    quality > 86 && s.mistakes <= 1
      ? 3
      : quality > 70 && s.mistakes < 5
        ? 2
        : 1;
  return {
    letter: stars === 3 ? "S" : stars === 2 ? "A" : "B",
    title: stars === 3 ? "黄金稳手" : stars === 2 ? "温柔操刀人" : "有惊无险",
    stars,
  };
}

export function snapshot(s: GameState) {
  return {
    coordinates: `canvas ${WIDTH}x${HEIGHT}; origin top-left; x right, y down`,
    phase: s.phase,
    difficulty: s.difficulty,
    tool: s.tool,
    paused: s.paused,
    hand: {
      x: +s.hand.x.toFixed(1),
      y: +s.hand.y.toFixed(1),
      angle: Math.round(s.angle),
    },
    pointer: s.pointer,
    down: s.down,
    pulse: s.pulse,
    timingWindow: DIFFICULTIES[s.difficulty].window,
    pain: +s.pain.toFixed(1),
    heat: +s.heat.toFixed(1),
    risk: +s.risk.toFixed(1),
    reliefUsed: s.reliefUsed,
    reliefSeconds: +s.relief.toFixed(1),
    curtain: s.curtain,
    score: s.score,
    combo: s.combo,
    bestCombo: s.bestCombo,
    lastSpot: s.lastSpot,
    mistakes: s.mistakes,
    perfect: s.perfect,
    time: +s.time.toFixed(1),
    progress: `${completion(s)}/${s.spots.length}`,
    spots: s.spots.map((p) => ({
      ...p,
      clean: +p.clean.toFixed(2),
      cream: +p.cream.toFixed(2),
      wiped: +p.wiped.toFixed(2),
      cooled: +p.cooled.toFixed(2),
    })),
    message: s.message,
    result: s.result,
    grade: s.result ? grade(s) : null,
  };
}
