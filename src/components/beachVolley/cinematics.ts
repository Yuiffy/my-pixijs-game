import { CHARACTERS } from "./engine";
import type { Character, Game, Side } from "./engine";
import { VariantPicker } from "./variants";

export type CinemaMode = "all" | "key" | "off";
export type CinemaKind = "intro" | "special" | "point" | "result";
export type Outcome = "intro" | "special" | "win" | "lose";
export interface MediaClip {
  src: string;
  poster: string;
  duration: number;
  lite?: { src: string; bytes: number };
  dialogue?: { text: string; source: "native" | "recording" };
}
export type MediaPool = MediaClip | MediaClip[];
export const mediaVariants = (pool?: MediaPool): MediaClip[] => (pool ? (Array.isArray(pool) ? pool : [pool]) : []);
export interface CharacterMedia {
  intro?: MediaPool;
  special?: MediaPool;
  point?: { win?: MediaPool; lose?: MediaPool };
  result?: { win?: MediaPool; lose?: MediaPool };
}
export interface PairMedia {
  intro?: MediaClip;
  point?: Partial<Record<Character, MediaClip>>;
  result?: Partial<Record<Character, MediaClip>>;
}
export interface MediaManifest {
  version: number;
  characters: Partial<Record<Character, CharacterMedia>>;
  pairs?: Record<string, PairMedia>;
}
export interface CinemaSegment extends MediaClip {
  side: Side;
  character: Character;
  outcome: Outcome;
  title: string;
  line: string;
  paired: boolean;
}
export interface Cinematic extends CinemaSegment {
  id: string;
  sequenceId: string;
  kind: CinemaKind;
  clips: CinemaSegment[];
  index: number;
}
export const pairKey = (a: Character, b: Character) => [a, b].sort().join(":");

// Enumerate every eligible variant, without consuming playback randomness.
export function matchMediaClips(
  g: Game,
  media: MediaManifest | null,
  mode: CinemaMode,
  reduced: boolean,
): MediaClip[] {
  const clips = new Map<string, MediaClip>();
  if (!media || reduced || mode === "off") return [];
  const pair = media.pairs?.[pairKey(g.players[0].character, g.players[1].character)];
  const add = (pool?: MediaPool) => mediaVariants(pool).forEach((clip) => clips.set(clip.src, clip));
  for (const kind of ["intro", "special", "point", "result"] as CinemaKind[]) {
    if (kind === "point" && mode === "key") continue;
    if (kind === "intro") {
      add(pair?.intro);
      const personalIntro = g.players.some(({ character }) => mediaVariants(media.characters[character]?.intro).length > 1);
      if (pair?.intro && !personalIntro) continue;
    }
    for (const { character } of g.players) {
      const actor = media.characters[character];
      if (kind === "intro" || kind === "special") add(actor?.[kind]);
      else {
        add(pair?.[kind]?.[character]);
        add(actor?.[kind]?.win);
        add(actor?.[kind]?.lose);
      }
    }
  }
  return Array.from(clips.values());
}
export function nextCinematic(plan: Cinematic): Cinematic | null {
  const index = plan.index + 1;
  const segment = plan.clips[index];
  return segment
    ? {
        ...segment,
        kind: plan.kind,
        sequenceId: plan.sequenceId,
        clips: plan.clips,
        index,
        id: `${plan.sequenceId}:${index}`,
      }
    : null;
}
export function selectCinematic(
  g: Game,
  media: MediaManifest | null,
  mode: CinemaMode,
  reduced: boolean,
  kind: CinemaKind,
  side: Side = 0,
  picker = new VariantPicker(),
): Cinematic | null {
  if (
    !media ||
    reduced ||
    mode === "off" ||
    (mode === "key" && kind === "point")
  ) return null;
  const opponent: Side = side === 0 ? 1 : 0;
  const pair =
    media.pairs?.[pairKey(g.players[0].character, g.players[1].character)];
  const clips: CinemaSegment[] = [];
  const add = (
    pool: MediaPool | undefined,
    actor: Side,
    outcome: Outcome,
    paired = false,
  ) => {
    const clip = picker.pick(`${g.players[actor].character}:${kind}:${outcome}`, mediaVariants(pool), (item) => item.src);
    if (!clip?.src || !clip.poster || !(clip.duration > 0)) return;
    const { character } = g.players[actor];
    const info = CHARACTERS[character];
    clips.push({
      ...clip,
      side: actor,
      character,
      outcome,
      paired,
      title:
        kind === "intro"
          ? paired
            ? "晴海双打 · 双人出场"
            : `${info.name} · 向晴海出发`
          : kind === "special"
            ? `${info.name} · ${info.special}`
            : `${info.name} · ${outcome === "lose" ? (kind === "point" ? "下一球，再来！" : "下次，一起打到日落") : kind === "point" ? "好球！" : "赢下晴海！"}`,
      line:
        kind === "intro"
          ? "「海风正好。下一球，轮到你。」"
          : kind === "special"
            ? `「${info.line}」`
            : `${g.score[0]} : ${g.score[1]} · ${outcome === "lose" ? "调整呼吸，下一次再挑战。" : `${CHARACTERS[g.players[opponent].character].name}，${kind === "point" ? "下一球见。" : "再一起打到日落吧。"}`}`,
    });
  };
  // Retained paired movies share the pool with new personal reactions for this matchup.
  const personalVariety = g.players.some(({ character }) => {
    const actor = media.characters[character];
    return kind === "intro" || kind === "special"
      ? mediaVariants(actor?.[kind]).length > 1
      : mediaVariants(actor?.[kind]?.win).length > 1;
  });
  const usePair = !personalVariety || picker.pick(`${pairKey(g.players[0].character, g.players[1].character)}:${kind}:layout`, ["paired", "personal"], (item) => item) === "paired";
  if (kind === "intro") {
    if (pair?.intro && usePair) add(pair.intro, side, "intro", true);
    else ([0, 1] as Side[]).forEach((actor) => add(
          media.characters?.[g.players[actor].character]?.intro,
          actor,
          "intro",
        ),);
  } else if (kind === "special") add(
      media.characters?.[g.players[side].character]?.special,
      side,
      "special",
    );
  else {
    const paired = pair?.[kind]?.[g.players[side].character];
    if (paired && usePair) add(paired, side, "win", true);
    else {
      add(
        media.characters?.[g.players[side].character]?.[kind]?.win,
        side,
        "win",
      );
      add(
        media.characters?.[g.players[opponent].character]?.[kind]?.lose,
        opponent,
        "lose",
      );
    }
  }
  if (!clips.length) return null;
  const sequenceId = `${kind}:${g.eventId}:${side}`;
  return {
    ...clips[0],
    kind,
    clips,
    index: 0,
    sequenceId,
    id: `${sequenceId}:0`,
  };
}
