import manifest from "../../../public/games/tidal-duel/cinematics.json";
import type { Game, GameEvent } from "./engine";

export interface DuelMovie {
  character: string;
  skin: string;
  title: string;
  src: string;
  poster: string;
  duration: number;
}
export const DUEL_MOVIES: readonly DuelMovie[] = manifest.clips;

export function movieForHit(game: Game, event: GameEvent): DuelMovie | null {
  if (event.type !== "hit" || event.moveKind !== "super") return null;
  const actor = game.fighters[event.side];
  return DUEL_MOVIES.find((clip) => clip.character === actor.character && clip.skin === actor.skin) ?? null;
}
export function matchMovies(game: Game): DuelMovie[] {
  return DUEL_MOVIES.filter((clip) => game.fighters.some((f) => clip.character === f.character && clip.skin === f.skin));
}

interface CachedMovie {
  controller: AbortController;
  promise: Promise<string | null>;
  url: string | null;
  bytes: number;
}
/** Only the current fighters are prefetched. Late responses can never recreate an evicted blob. */
export class DuelMovieCache {
  private entries = new Map<string, CachedMovie>();
  private disposed = false;
  private bytes = 0;
  static readonly MAX_BYTES = 12 * 1024 * 1024;
  prepare(clips: readonly DuelMovie[]) {
    const wanted = new Set(clips.map((clip) => clip.src));
    for (const [src, entry] of Array.from(this.entries)) if (!wanted.has(src)) this.remove(src, entry);
    for (const clip of clips) this.load(clip);
  }
  load(clip: DuelMovie): Promise<string | null> {
    if (this.disposed) return Promise.resolve(null);
    const existing = this.entries.get(clip.src);
    if (existing) return existing.promise;
    const entry: CachedMovie = { controller: new AbortController(), promise: Promise.resolve(null), url: null, bytes: 0 };
    this.entries.set(clip.src, entry);
    entry.promise = (async () => {
      try {
        const response = await fetch(clip.src, { signal: entry.controller.signal });
        if (!response.ok) throw new Error("Movie unavailable");
        const blob = await response.blob();
        if (this.disposed || entry.controller.signal.aborted || this.entries.get(clip.src) !== entry) return null;
        if (!blob.size || this.bytes + blob.size > DuelMovieCache.MAX_BYTES) throw new Error("Movie cache full");
        entry.url = URL.createObjectURL(blob);
        entry.bytes = blob.size;
        this.bytes += blob.size;
        return entry.url;
      } catch {
        if (this.entries.get(clip.src) === entry) this.remove(clip.src, entry);
        return null;
      }
    })();
    return entry.promise;
  }
  invalidate(src: string) {
    const entry = this.entries.get(src);
    if (entry) this.remove(src, entry);
  }
  private remove(src: string, entry: CachedMovie) {
    entry.controller.abort();
    if (entry.url) URL.revokeObjectURL(entry.url);
    this.bytes -= entry.bytes;
    this.entries.delete(src);
  }
  snapshot() {
    const entries = Array.from(this.entries.values());
    return { ready: entries.filter((entry) => entry.url).length, pending: entries.filter((entry) => !entry.url).length, bytes: this.bytes };
  }
  dispose() {
    this.disposed = true;
    for (const [src, entry] of Array.from(this.entries)) this.remove(src, entry);
  }
}
