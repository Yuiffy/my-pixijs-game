import { clamp, round } from "./core";

export const SNACKS = [
  {
    name: "棉花糖",
    icon: "marshmallow",
    time: 1.4,
    noise: 4,
    text: "安静、好入口。适合普通聊天间隙。",
  },
  {
    name: "小饼干",
    icon: "cookie",
    time: 2,
    noise: 13,
    text: "咔嚓脆响。等音乐响起再吃。",
  },
  {
    name: "薯片",
    icon: "chips",
    time: 2.6,
    noise: 21,
    text: "声音很大。静音，或抓紧音乐掩护。",
  },
  {
    name: "大福",
    icon: "mochi",
    time: 3.6,
    noise: 6,
    text: "需要嚼很久。先把直播气氛聊热。",
  },
] as const;
export const SNACK_LEVELS = [
  {
    name: "深夜杂谈",
    subtitle: "先从一口软软的甜开始。",
    counts: [3, 2, 0, 0],
    limit: 65,
    drain: 7,
    cover: 5,
  },
  {
    name: "联动前的空档",
    subtitle: "饼干的声音，比想象中清楚。",
    counts: [1, 3, 2, 0],
    limit: 70,
    drain: 8,
    cover: 4.5,
  },
  {
    name: "游戏读条中",
    subtitle: "大福不能急；薯片不能响。",
    counts: [0, 2, 2, 2],
    limit: 80,
    drain: 9,
    cover: 4,
  },
  {
    name: "电台点歌夜",
    subtitle: "观众听得很认真，别一直静音。",
    counts: [2, 2, 3, 1],
    limit: 85,
    drain: 10,
    cover: 3.5,
  },
  {
    name: "十万关注纪念回",
    subtitle: "最后一桌零食，全场都在看着你。",
    counts: [2, 3, 3, 2],
    limit: 95,
    drain: 11,
    cover: 3,
  },
] as const;
export type SnackPhase =
  | "ready"
  | "playing"
  | "paused"
  | "won"
  | "lost"
  | "ending";
export type SnackInput = "talk" | "eat" | "mute";
export type SnackState = {
  version: 1;
  kind: "snack";
  seed: number;
  level: number;
  phase: SnackPhase;
  time: number;
  energy: number;
  suspicion: number;
  peak: number;
  selected: number;
  remaining: number[];
  chewing: number;
  cooldown: number;
  eaten: number;
  combo: number;
  bestCombo: number;
  score: number;
  best: number[];
  inputs: Record<SnackInput, boolean>;
  message: string;
  messageUntil: number;
};
export function createSnack(
  seed = 2026,
  level = 0,
  best: number[] = [0, 0, 0, 0, 0],
): SnackState {
  return {
    version: 1,
    kind: "snack",
    seed,
    level,
    phase: "ready",
    time: 0,
    energy: 85,
    suspicion: 0,
    peak: 0,
    selected: SNACK_LEVELS[level].counts.findIndex((n) => n > 0),
    remaining: [...SNACK_LEVELS[level].counts],
    chewing: 0,
    cooldown: 0,
    eaten: 0,
    combo: 0,
    bestCombo: 0,
    score: 0,
    best: [...best],
    inputs: { talk: false, eat: false, mute: false },
    message: "先聊两句，再偷偷吃一口。",
    messageUntil: 4,
  };
}
export function snackCover(s: SnackState) {
  const beat = (s.time + (s.seed % 4)) % 12;
  const duration = SNACK_LEVELS[s.level].cover;
  return {
    active: beat >= 12 - duration,
    next: round(beat >= 12 - duration ? 12 - beat : 12 - duration - beat),
  };
}
export function snackMessage(s: SnackState, text: string) {
  s.message = text;
  s.messageUntil = s.time + 2.5;
}
export function selectSnack(s: SnackState, index: number) {
  if (s.phase !== "playing" || s.chewing > 0 || !s.remaining[index]) return;
  s.selected = index;
}
export function snackInput(s: SnackState, input: SnackInput, down: boolean) {
  s.inputs[input] = s.phase === "playing" && down;
}
export function clearSnackInput(s: SnackState) {
  s.inputs = { talk: false, eat: false, mute: false };
}
export function pauseSnack(s: SnackState) {
  if (s.phase === "playing") {
    s.phase = "paused";
    clearSnackInput(s);
  } else if (s.phase === "paused") {
    s.phase = "playing";
    clearSnackInput(s);
  }
}
export function tickSnack(s: SnackState, dt: number) {
  if (s.phase !== "playing") return;
  const level = SNACK_LEVELS[s.level];
  const snack = SNACKS[s.selected];
  s.time += dt;
  s.cooldown = Math.max(0, s.cooldown - dt);
  const eating = s.inputs.eat && s.remaining[s.selected] > 0 && s.cooldown <= 0;
  const talking = s.inputs.talk && !s.inputs.mute;
  const cover = snackCover(s).active;
  if (eating) {
    s.chewing += dt;
    if (talking) {
      s.suspicion += dt * 31;
      s.combo = 0;
      snackMessage(s, "弹幕：你怎么含含糊糊的……嘴里有东西？");
    } else {
      const noise = s.inputs.mute ? 0 : snack.noise * (cover ? 0.12 : 1);
      s.suspicion += dt * noise;
    }
    if (s.chewing >= snack.time) {
      s.remaining[s.selected]--;
      s.chewing = 0;
      s.eaten++;
      s.combo++;
      s.cooldown = 0.28;
      s.bestCombo = Math.max(s.bestCombo, s.combo);
      snackMessage(
        s,
        `偷偷吃完一份${snack.name}！${cover ? "音乐掩护成功。" : ""}`,
      );
      if (!s.remaining[s.selected]) {
        const next = s.remaining.findIndex((n) => n > 0);
        if (next >= 0) s.selected = next;
      }
    }
  } else if (s.chewing > 0) {
    // Releasing a bite does not erase mouth occupancy; swallowing needs the eat control.
    if (talking) {
      s.suspicion += dt * 24;
      snackMessage(s, "先嚼完这一口！说话会露馅。");
    }
  } else if (talking) {
    s.energy += dt * 26;
    s.suspicion -= dt * 9;
  } else s.suspicion -= dt * (cover ? 3 : 1.5);
  if (!talking || eating || s.chewing > 0) s.energy -= dt * level.drain * (s.inputs.mute ? 1.2 : 1);
  s.energy = clamp(s.energy);
  s.suspicion = clamp(s.suspicion);
  s.peak = Math.max(s.peak, s.suspicion);
  if (s.suspicion >= 100 || s.energy <= 0 || s.time >= level.limit) {
    s.phase = "lost";
    s.message =
      s.suspicion >= 100
        ? "被发现啦！观众听到了你的偷吃声。"
        : s.energy <= 0
          ? "冷场太久，观众发现你没在认真直播。"
          : "下播时间到了，桌上还有没吃完的零食。";
    clearSnackInput(s);
  } else if (s.remaining.every((n) => n === 0)) {
    s.score = Math.round(
      1000 +
        (level.limit - s.time) * 15 +
        (100 - s.peak) * 10 +
        s.bestCombo * 40,
    );
    s.best[s.level] = Math.max(s.best[s.level] || 0, s.score);
    s.phase = s.level === SNACK_LEVELS.length - 1 ? "ending" : "won";
    s.message =
      s.peak < 25
        ? "完美潜吃！大家以为你只是在认真聊天。"
        : "清空零食桌！可疑，但没有被抓到。";
    clearSnackInput(s);
  }
}
export function advanceSnack(s: SnackState, ms: number) {
  let remaining = Math.min(120000, Math.max(0, ms)) / 1000;
  while (remaining > 0.000001 && s.phase === "playing") {
    const dt = Math.min(1 / 60, remaining);
    tickSnack(s, dt);
    remaining -= dt;
  }
}
