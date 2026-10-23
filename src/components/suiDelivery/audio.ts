import type { DeliveryFeedback, FeedbackKind } from "./feedback";
import type { DeliveryGame, DeliveryLevel } from "./types";

type Voice = { source: OscillatorNode | AudioBufferSourceNode; gain: GainNode; music: boolean; finish: () => void };
type Theme = DeliveryLevel["theme"];

/** Original, gesture-unlocked material sounds. The archive keeps its own audio. */
export default class DeliveryAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private voices = new Set<Voice>();
  private recent = new Map<FeedbackKind, number>();
  private audible = true;
  private phase: DeliveryGame["phase"] = "title";
  private nextNote = 0;
  private beat = 0;
  private theme: Theme = "street";
  private played = 0;
  private peak = 0;

  get enabled() { return this.audible; }
  set enabled(value: boolean) {
    this.audible = value;
    if (!value) this.stop();
    if (this.master && this.context) this.master.gain.setValueAtTime(value ? 0.7 : 0, this.context.currentTime);
  }
  unlock() {
    if (!this.enabled) return;
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = 0.7;
      this.master.connect(this.context.destination);
      const frames = Math.floor(this.context.sampleRate * 0.4);
      this.noise = this.context.createBuffer(1, frames, this.context.sampleRate);
      const channel = this.noise.getChannelData(0);
      let seed = 13579;
      for (let i = 0; i < frames; i++) {
        seed = (seed * 16807) % 2147483647;
        channel[i] = (seed / 1073741824 - 1) * 0.65;
      }
    }
    if (this.context.state === "suspended") this.context.resume().catch(() => {});
  }
  setPhase(phase: DeliveryGame["phase"]) {
    if (phase === this.phase) return;
    this.phase = phase;
    if (phase === "paused" || phase === "title") this.stop();
    else if (phase !== "playing") this.stop(true);
    this.nextNote = 0;
  }
  private stop(musicOnly = false) {
    for (const voice of Array.from(this.voices)) {
      if (musicOnly && !voice.music) continue;
      try { voice.source.stop(); } catch { /* A node may have ended in this frame. */ }
      voice.finish();
    }
    if (!musicOnly) this.recent.clear();
  }
  private voice(frequency: number, end: number, duration: number, volume: number, type: OscillatorType | "noise" = "sine", delay = 0, music = false) {
    const ctx = this.context;
    if (!ctx || !this.master || !this.enabled || ctx.state !== "running" || this.phase === "paused" || this.phase === "title") return;
    if (this.voices.size >= 24) {
      const oldest = this.voices.values().next().value as Voice | undefined;
      if (oldest) { try { oldest.source.stop(); } catch { /* Already ended. */ } oldest.finish(); }
    }
    const start = ctx.currentTime + delay;
    const gain = ctx.createGain();
    const source = type === "noise" ? ctx.createBufferSource() : ctx.createOscillator();
    if (type === "noise") (source as AudioBufferSourceNode).buffer = this.noise;
    else {
      const osc = source as OscillatorNode;
      osc.type = type;
      osc.frequency.setValueAtTime(frequency, start);
      osc.frequency.exponentialRampToValueAtTime(Math.max(30, end), start + duration);
    }
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(gain);
    gain.connect(this.master);
    const voice: Voice = {
      source,
      gain,
      music,
      finish: () => {
      source.disconnect(); gain.disconnect(); source.onended = null; this.voices.delete(voice);
    } };
    source.onended = voice.finish;
    this.voices.add(voice);
    this.peak = Math.max(this.peak, this.voices.size);
    source.start(start);
    source.stop(start + duration + 0.02);
  }
  effect(cue: DeliveryFeedback, camera: DeliveryGame["camera"], viewport: DeliveryGame["viewport"]) {
    const ctx = this.context;
    if (!ctx || !this.enabled || ctx.state !== "running" || this.phase === "paused" || this.phase === "title") return;
    // Offscreen machines cannot drown out the action beside the player.
    const dx = Math.max(camera.x - cue.x, 0, cue.x - camera.x - viewport.w);
    const dy = Math.max(camera.y - cue.y, 0, cue.y - camera.y - viewport.h);
    if (dx > 180 || dy > 160) return;
    const last = this.recent.get(cue.kind);
    if (last !== undefined && ctx.currentTime - last < 0.055) return;
    this.recent.set(cue.kind, ctx.currentTime);
    this.played++;
    const v = cue.strength * (1 - Math.min(0.75, (dx + dy) / 500));
    const tone = (from: number, to: number, length: number, volume = 0.055, type: OscillatorType = "sine", delay = 0) => this.voice(from, to, length, volume * v, type, delay);
    const air = (length: number, volume = 0.025) => this.voice(0, 0, length, volume * v, "noise");
    const chime = (notes: number[]) => notes.forEach((n, i) => tone(n, n, 0.16, 0.035, "sine", i * 0.075));
    switch (cue.kind) {
      case "land-stone": tone(140, 65, 0.065, 0.055, "triangle"); air(0.045, 0.013); break;
      case "land-wood": tone(240, 130, 0.075, 0.045, "triangle"); tone(410, 300, 0.035, 0.014); break;
      case "land-metal": tone(600, 470, 0.12, 0.025); tone(1010, 860, 0.08, 0.012); break;
      case "land-cloth": air(0.08, 0.022); tone(120, 80, 0.09, 0.02); break;
      case "dough": tone(170, 420, 0.17, 0.07); tone(330, 190, 0.08, 0.025); break;
      case "stomp": tone(180, 560, 0.15, 0.065); break;
      case "metal": tone(760, 620, 0.17, 0.045); tone(1260, 1130, 0.13, 0.022); break;
      case "reflect": tone(1180, 1850, 0.12, 0.045); tone(760, 1300, 0.1, 0.025); break;
      case "blocked": tone(165, 100, 0.08, 0.035, "triangle"); break;
      case "cloth-tight": air(0.12, 0.018); tone(180, 260, 0.13, 0.025); break;
      case "spring": air(0.09, 0.025); tone(170, 670, 0.22, 0.055); break;
      case "dash": air(0.18, 0.04); tone(340, 130, 0.14, 0.035, "triangle"); break;
      case "steam": air(0.32, 0.038); tone(115, 190, 0.25, 0.025); break;
      case "shot": air(0.05, 0.025); tone(260, 140, 0.09, 0.03); break;
      case "cart-start": chime([1047, 784]); break;
      case "cart-stop": chime([784, 1047]); tone(140, 80, 0.09, 0.025, "triangle"); break;
      case "rope": air(0.1, 0.014); tone(220, 330, 0.12, 0.035, "triangle"); break;
      case "water": air(0.18, 0.02); tone(430, 220, 0.14, 0.025); break;
      case "bird": tone(1500, 2200, 0.085, 0.026); tone(2000, 1300, 0.1, 0.022, "sine", 0.1); break;
      case "warning": tone(440, 440, 0.07, 0.026, "triangle"); tone(440, 440, 0.07, 0.026, "triangle", 0.14); break;
      case "sweep": air(0.16, 0.028); tone(170, 75, 0.18, 0.025, "triangle"); break;
      case "mechanism": tone(520, 390, 0.12, 0.03, "triangle"); chime([784, 1047]); break;
      case "jump": tone(240, 390, 0.095, 0.028); break;
      case "swing": air(0.065, 0.018); break;
      case "hurt": tone(210, 80, 0.23, 0.055, "triangle"); break;
      case "coin": chime([880, 1175]); break;
      case "star": chime([523, 659, 784, 1047]); break;
      case "order": chime([392, 523]); tone(700, 520, 0.09, 0.018); break;
      case "checkpoint": chime([392, 523, 659]); break;
      case "kindness": chime([659, 784]); break;
      case "clear": chime([523, 659, 784, 1047, 784, 1047]); break;
      default: break;
    }
  }
  update(playing: boolean, theme: Theme) {
    const ctx = this.context;
    if (!playing || !this.enabled || !ctx || ctx.state !== "running") return;
    if (theme !== this.theme) { this.stop(true); this.theme = theme; this.beat = 0; this.nextNote = 0; }
    if (ctx.currentTime < this.nextNote) return;
    const rain = theme === "rain" || theme === "greenhouse" || theme === "bird";
    const theater = theme === "scenery" || theme === "last-table" || theme === "banquet";
    const market = theme === "market" || theme === "freight" || theme === "sorter";
    const melody = rain ? [659, 0, 587, 0, 523, 659, 0, 784] : theater ? [523, 659, 784, 0, 880, 784, 659, 0] : market ? [523, 0, 784, 659, 0, 880, 784, 0] : [659, 0, 784, 880, 784, 659, 587, 0];
    this.nextNote = ctx.currentTime + (rain ? 0.36 : market ? 0.27 : 0.31);
    const n = melody[this.beat % melody.length];
    if (n) this.voice(n, n, rain ? 0.28 : 0.2, 0.009, "triangle", 0, true);
    if (this.beat % 4 === 0) this.voice([131, 110, 147, 98][Math.floor(this.beat / 8) % 4], 131, 0.38, 0.012, "sine", 0, true);
    this.beat++;
  }
  diagnostics() {
    return { unlocked: !!this.context, state: this.context?.state || "locked", enabled: this.enabled, phase: this.phase, active: this.voices.size, music: Array.from(this.voices).filter(v => v.music).length, peak: this.peak, played: this.played };
  }
  destroy() {
    this.stop();
    this.master?.disconnect();
    this.context?.close().catch(() => {});
    this.context = null; this.master = null; this.noise = null;
  }
}
