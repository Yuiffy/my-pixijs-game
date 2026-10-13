import { broadcast, type Game } from "./engine";
import { offAir } from "./daily";
import { onBreak } from "./household";
import { beforeStream } from "./outings";
import { repairMuted } from "./lifeEvents";
import { endingScene } from "./endings";

export type AudioMix = { voice: number; music: number; effects: number };
export const DEFAULT_MIX: AudioMix = { voice: 0.85, music: 0.32, effects: 0.65 };
export type AudioClip = { src: string; duration: number; text?: string; envelope?: number[]; envelopeRate?: number; sha256: string };
export type AudioManifest = { version: number; clips: Record<string, AudioClip> };
export type VoicePlan = { clip: string; key: string; offset: number; sync: boolean; mode: "talk" | "sing" | "whisper" | "private" };

export function parseAudioMix(value: unknown): AudioMix {
  const source = value && typeof value === "object" ? value as Partial<AudioMix> : {};
  const volume = (key: keyof AudioMix) => (typeof source[key] === "number" && Number.isFinite(source[key])
    ? Math.max(0, Math.min(1, source[key]!)) : DEFAULT_MIX[key]);
  return { voice: volume("voice"), music: volume("music"), effects: volume("effects") };
}

/** All live vocal offsets follow the same clock as the gameplay's safe windows. */
export function liveVoice(s: Game): VoicePlan | null {
  if (s.phase !== "playing" || beforeStream(s) || onBreak(s) || repairMuted(s) || offAir(s) || s.muted > 0) return null;
  const b = broadcast(s);
  const cycle = Math.floor((s.elapsed + (s.level === 5 ? s.seed % 12 : 0)) / 22);
  const variant = (cycle + s.seed) % 3;
  const mode = b.music ? "sing" : b.sensitive ? "whisper" : "talk";
  const clip = mode === "sing" ? `song-${variant % 2}` : mode === "whisper" ? `whisper-${variant % 2}` : `talk-${variant}`;
  return { clip: `voice/${clip}`, key: `${cycle}/${mode}`, offset: b.phase - (b.music ? 12 : b.sensitive ? 19 : 0), sync: true, mode };
}

export function musicFor(s: Game) {
  if (s.phase === "result") {
    if (!s.won) return "music/setback";
    const scene = endingScene(s)?.id;
    return scene === "night-walk" || scene === "supper-table" ? "music/night-walk"
      : scene === "warm-water" || scene === "dry-hair" ? "music/bedside" : "music/lamplight";
  }
  if (s.phase !== "playing") return null;
  if (offAir(s)) return s.daily?.after === "supper" ? "music/night-walk" : "music/lamplight";
  const vocal = liveVoice(s);
  if (vocal?.mode === "sing") return `music/${vocal.clip.split("/")[1]}`;
  return "music/apartment";
}

export type AudioSnapshot = {
  muted: boolean; stage: string; rest: string; repair: string; nap: number; done: string[]; won: boolean; bonus: boolean;
};
export const audioSnapshot = (s: Game): AudioSnapshot => ({
  muted: s.muted > 0,
stage: s.daily?.stage ?? "tutorial",
rest: s.daily?.household.rest.stage ?? "none",
  repair: s.daily?.events.repair.stage ?? "none",
nap: s.daily?.events.nap.reaction ?? 0,
done: [...s.done],
won: s.won,
  bonus: s.bonus,
});

/** Higher priority story beats replace incidental live chatter, once per transition. */
export function dialogueEvent(s: Game, previous: AudioSnapshot | null): string | null {
  if (!previous) return beforeStream(s) ? "trip" : s.won ? `ending-${endingScene(s)?.id}` : null;
  const next = audioSnapshot(s);
  if (s.won && !previous.won) return `ending-${endingScene(s)?.id}`;
  if (next.stage !== previous.stage) {
    if (next.stage === "sleep") return "off-air";
    if (next.stage === "after") return `after-${s.daily?.after}`;
  }
  if (next.muted && !previous.muted) return "private-mute";
  if (next.repair === "fixed" && previous.repair !== "fixed") return "repair";
  if (next.rest !== previous.rest) {
    if (next.rest === "out") return "break-out";
    if (next.rest === "done" && previous.rest === "back") return "break-back";
  }
  if (next.nap >= 2 && previous.nap < 2) return "nap";
  if (s.done.includes("food") && !previous.done.includes("food")) return "food";
  if ((s.bonus && !previous.bonus) || (["hug", "kiss"] as const).some(key => s.done.includes(key) && !previous.done.includes(key))) return "hug";
  return null;
}
