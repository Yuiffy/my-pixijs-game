import { terrainHeight } from "./terrain";
import type { Game } from "./simulation";
import { distance } from "./world";

export const SOUND_SPOTS = [
  { id: "street", name: "锅沿的节拍", place: "曙光东路 · 粉店外", x: -158, z: 126, line: "阿姨：锅盖一响，这条街就知道该吃饭了。" },
  { id: "bridge", name: "桥头的远行", place: "文惠桥 · 北侧空地", x: 74, z: 25, line: "七海：车过去以后，风会把剩下的半句话接上。" },
  { id: "river", name: "留给明天的水声", place: "金沙角 · 岸边", x: 247, z: -166, line: "栞栞：同一条江，每一次来听都不一样。" },
] as const;
export type SoundId = typeof SOUND_SPOTS[number]["id"];
export type Arrangement = "street" | "river";
export type Evening = {
  started: boolean;
  samples: SoundId[];
  arrangement: Arrangement | null;
  completed: boolean;
  elapsed: number;
  recording: { id: SoundId; progress: number } | null;
  watching: boolean;
};
export const RECORD_SECONDS = 6;
export const SHOW_SECONDS = 28;
export const SHOW_REWARD = 28;
export const SCREEN = { x: 28, z: -34 };
export const createEvening = (): Evening => ({ started: false, samples: [], arrangement: null, completed: false, elapsed: 0, recording: null, watching: false });
export function loadEvening(value: unknown): Evening {
  const e = createEvening();
  if (!value || typeof value !== "object") return e;
  const raw = value as Record<string, unknown>;
  if (raw.started !== true) return e;
  e.started = true;
  e.samples = SOUND_SPOTS.filter(s => Array.isArray(raw.samples) && raw.samples.includes(s.id)).map(s => s.id);
  if (e.samples.length === SOUND_SPOTS.length && (raw.arrangement === "street" || raw.arrangement === "river")) e.arrangement = raw.arrangement;
  e.completed = !!e.arrangement && raw.completed === true;
  e.elapsed = e.arrangement && typeof raw.elapsed === "number" && Number.isFinite(raw.elapsed)
    ? Math.max(0, Math.min(SHOW_SECONDS, raw.elapsed)) : 0;
  // Live microphone and camera ownership do not survive a page reload.
  return e;
}
export function eveningTarget(g: Game) {
  const e = g.evening;
  if (g.stage < 6) return null;
  if (!e.started) return { x: 28, z: -23, target: "shiori", title: "明天，也在这里", description: "找栞栞，商量第二章的江边放映" };
  const missing = SOUND_SPOTS.filter(s => !e.samples.includes(s.id));
  if (missing.length) {
    const nearest = [...missing].sort((a, b) => distance(g.player, a) - distance(g.player, b))[0];
    return { ...nearest, target: nearest.id, title: "把今天留给明天", description: `采样 ${e.samples.length}/3 · ${nearest.place}（顺序不限）` };
  }
  if (!e.arrangement) return { x: 23, z: -27, target: "nagisa", title: "谁先开口？", description: "回东门找米汀，选择声音明信片的编排" };
  if (!e.completed) return { x: 34, z: -27, target: "nana", title: "给这条街留一盏灯", description: "找东门的七海，开始江边放映" };
  return null;
}
export function recordingStatus(g: Game) {
  const r = g.evening.recording;
  if (!r) return "";
  if (g.vehicle) return "先下车，再把录音机拿稳";
  if (Math.abs(g.player.speed) > 0.45 || g.player.y - terrainHeight(g.player) > 0.12) return "停稳脚步 · 移动会重新采样";
  const noisy = [...g.traffic, ...g.vehicles].some(v => Math.abs(v.speed) > 1.8 && distance(v, g.player) < 12);
  return noisy ? "车声太近 · 等它过去，进度保留" : "正在收音 · 保持站稳";
}
export function eveningFrame(e: Evening) {
  const t = e.elapsed;
  const opening = e.arrangement === "river" ? "先听见江，再听见这条街。" : "锅沿轻轻一响，今天就开场了。";
  const cards = e.arrangement === "river" ? ["river", "bridge", "street"] : ["street", "bridge", "river"];
  if (t < 6) return { card: cards[0], speaker: "米汀", caption: opening, title: "把今天留给明天" };
  if (t < 13) return { card: cards[1], speaker: "七海", caption: "过桥的人都在赶路，我们替他们留一小段风。", title: "桥的这一边，也有人等你" };
  if (t < 21) return { card: cards[2], speaker: "岁己", caption: "原来不用去很远，今天就有好多值得记住的事。", title: "街坊、江水，还有我们" };
  return { card: "together", speaker: "栞栞", caption: "明天也来吧。不是为了录完什么，就是想再一起走走。", title: "明天，还在这里。" };
}
// Called by the fixed simulation after movement; UI and audio only read it.
export function stepEvening(g: Game, dt: number): "sample" | "cancel" | "complete" | null {
  const e = g.evening;
  const r = e.recording;
  if (r) {
    const spot = SOUND_SPOTS.find(s => s.id === r.id)!;
    if (g.vehicle || distance(g.player, spot) > 5) { e.recording = null; return "cancel"; }
    const status = recordingStatus(g);
    if (status.startsWith("停稳")) r.progress = 0;
    else if (status.startsWith("正在")) r.progress += dt;
    if (r.progress >= RECORD_SECONDS) {
      if (!e.samples.includes(r.id)) e.samples.push(r.id);
      e.recording = null;
      return "sample";
    }
  }
  if (e.watching && e.elapsed < SHOW_SECONDS) {
    e.elapsed = Math.min(SHOW_SECONDS, e.elapsed + dt);
    if (e.elapsed >= SHOW_SECONDS && !e.completed) {
      e.completed = true;
      g.money = Math.min(9999, g.money + SHOW_REWARD);
      return "complete";
    }
  }
  return null;
}
