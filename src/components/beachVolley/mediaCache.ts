import type { MediaClip } from "./cinematics";

export interface MediaPlayback {
  src: string;
  quality: "standard" | "lite";
  cached: boolean;
}
interface Entry {
  src: string;
  quality: MediaPlayback["quality"];
  status: "queued" | "loading" | "ready" | "failed";
  url?: string;
  bytes: number;
  controller?: AbortController;
}

const MAX_BYTES = 32 * 1024 * 1024;

/** Fetch only this matchup, light clips first. Blob URLs guarantee replay needs no network. */
export class CinemaCache {
  private entries = new Map<string, Entry>();
  private wanted = new Set<string>();
  private running = new Set<Entry>();
  private active: MediaPlayback | null = null;
  private activeSource: string | null = null;
  private disposed = false;

  update(clips: MediaClip[], standard = true) {
    if (this.disposed) return;
    const sources: { src: string; quality: Entry["quality"] }[] = [];
    clips.forEach((clip) => sources.push({
      src: clip.lite?.src || clip.src,
      quality: clip.lite ? "lite" : "standard",
    }));
    if (standard) clips.filter((clip) => clip.lite).forEach((clip) => sources.push({ src: clip.src, quality: "standard" }));
    this.wanted = new Set(sources.map(({ src }) => src));
    this.prune();
    const ordered = new Map<string, Entry>();
    sources.forEach(({ src, quality }) => ordered.set(src, this.entries.get(src) || { src, quality, status: "queued", bytes: 0 }));
    if (this.activeSource && this.entries.has(this.activeSource)) ordered.set(this.activeSource, this.entries.get(this.activeSource)!);
    this.entries = ordered;
    if (sources.some(({ src, quality }) => quality === "lite" && this.entries.get(src)?.status !== "ready")) {
      this.running.forEach((entry) => { if (entry.quality === "standard") this.cancel(entry); });
    }
    this.pump();
  }

  play(clip: MediaClip): MediaPlayback {
    const standard = this.entries.get(clip.src);
    const lite = clip.lite && this.entries.get(clip.lite.src);
    const ready = standard?.status === "ready" ? standard : lite?.status === "ready" ? lite : undefined;
    this.activeSource = ready?.src || clip.lite?.src || clip.src;
    this.active = {
      src: ready?.url || this.activeSource,
      quality: ready?.quality || (clip.lite ? "lite" : "standard"),
      cached: !!ready,
    };
    // A cold movie streams directly. Give it the connection instead of competing preloads.
    this.running.forEach((entry) => {
      if (!this.active?.cached || entry.quality === "standard") this.cancel(entry);
    });
    this.pump();
    return this.active;
  }

  finish() {
    this.active = null;
    this.activeSource = null;
    this.prune();
    this.pump();
  }

  snapshot() {
    const entries = Array.from(this.entries.values());
    return {
      liteReady: entries.filter((entry) => entry.quality === "lite" && entry.status === "ready").length,
      standardReady: entries.filter((entry) => entry.quality === "standard" && entry.status === "ready").length,
      pending: this.running.size,
      bytes: entries.reduce((sum, entry) => sum + entry.bytes, 0),
    };
  }

  dispose() {
    this.disposed = true;
    this.active = null;
    this.activeSource = null;
    this.wanted.clear();
    this.prune();
  }

  private cancel(entry: Entry) {
    entry.controller?.abort();
    entry.controller = undefined;
    if (entry.status === "loading") entry.status = "queued";
  }

  private prune() {
    this.entries.forEach((entry, src) => {
      if (this.wanted.has(src) || src === this.activeSource) return;
      this.cancel(entry);
      if (entry.url) URL.revokeObjectURL(entry.url);
      this.entries.delete(src);
    });
  }

  private pump() {
    if (this.disposed || (this.active && !this.active.cached)) return;
    const entries = Array.from(this.entries.values());
    // Finish the entire light set before downloading any large version.
    const lightPending = entries.some((entry) => this.wanted.has(entry.src) && entry.quality === "lite" && (entry.status === "queued" || entry.status === "loading"));
    for (const entry of entries) {
      if (this.running.size >= 2) break;
      if (!this.wanted.has(entry.src) || entry.status !== "queued" || this.running.has(entry)) continue;
      if (entry.quality === "standard" && (lightPending || this.active)) continue;
      this.fetchEntry(entry);
    }
  }

  private fetchEntry(entry: Entry) {
    const controller = new AbortController();
    entry.controller = controller;
    entry.status = "loading";
    this.running.add(entry);
    const timeout = setTimeout(() => {
      entry.status = "failed";
      controller.abort();
    }, 45000);
    fetch(entry.src, { signal: controller.signal, cache: "force-cache" })
      .then((response) => {
        if (!response.ok) throw new Error(`Media HTTP ${response.status}`);
        return response.blob();
      })
      .then((blob) => {
        if (controller.signal.aborted || this.disposed || this.entries.get(entry.src) !== entry) return;
        if (!blob.size || this.snapshot().bytes + blob.size > MAX_BYTES) throw new Error("Media cache limit");
        entry.url = URL.createObjectURL(blob);
        entry.bytes = blob.size;
        entry.status = "ready";
      })
      .catch(() => {
        if (!controller.signal.aborted) entry.status = "failed";
      })
      .finally(() => {
        clearTimeout(timeout);
        if (entry.controller === controller) entry.controller = undefined;
        this.running.delete(entry);
        this.pump();
      });
  }
}
