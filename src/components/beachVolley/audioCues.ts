import type { Character, Game, GameEvent, Side } from "./engine";
import type { Cinematic } from "./cinematics";

export type VoiceKind =
  | "intro"
  | "special"
  | "pointWin"
  | "pointLose"
  | "victory"
  | "defeat";
export type MusicKind = "menu" | "match" | "victory" | "defeat";
export interface VoiceCue {
  character: Character;
  side: Side;
  kind: VoiceKind;
}
const other = (side: Side): Side => (side === 0 ? 1 : 0);
const cue = (g: Game, side: Side, kind: VoiceKind): VoiceCue => ({
  character: g.players[side].character,
  side,
  kind,
});

export function musicForGame(g: Game, movie: Cinematic | null): MusicKind {
  if (g.phase === "menu") return "menu";
  if (g.phase === "result" || movie?.kind === "result") return g.options.mode === "local" || g.winner === 0 ? "victory" : "defeat";
  return "match";
}
export function voicesForCinema(g: Game, movie: Cinematic): VoiceCue[] {
  const { side, kind, outcome } = movie;
  if (kind === "special") return [cue(g, side, "special")];
  if (kind === "intro") return movie.clips.length === 1
      ? [cue(g, 0, "intro"), cue(g, 1, "intro")]
      : [cue(g, side, "intro")];
  const win: VoiceKind = kind === "point" ? "pointWin" : "victory";
  const lose: VoiceKind = kind === "point" ? "pointLose" : "defeat";
  // Retained paired footage includes both actors in one clip.
  return movie.clips.length === 1
    ? [cue(g, side, win), cue(g, other(side), lose)]
    : [cue(g, side, outcome === "win" ? win : lose)];
}
export function voicesForEvent(g: Game, event: GameEvent): VoiceCue[] {
  if (event.type === "special") return [cue(g, event.side, "special")];
  if (event.type === "win") return [cue(g, event.side, "victory"), cue(g, other(event.side), "defeat")];
  // Short point transitions keep one reaction; solo play follows the player's outcome.
  if (event.type === "point") {
    const side = g.options.mode === "local" ? event.side : 0;
    return [cue(g, side, side === event.side ? "pointWin" : "pointLose")];
  }
  return [];
}
export function introVoices(g: Game): VoiceCue[] {
  return [cue(g, 0, "intro"), cue(g, 1, "intro")];
}
