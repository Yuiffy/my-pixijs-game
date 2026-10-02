import type { GameEvent } from "./engine";

/** Original synthetic percussion and melodies; no speech playback or voice imitation. */
export default class BeachAudio {
  private context: AudioContext | null = null;
  private enabled = true;
  private lastEvent = 0;
  setEnabled(value: boolean) {
    this.enabled = value;
  }
  unlock() {
    if (!this.context) this.context = new AudioContext();
    if (this.context.state === "suspended") this.context.resume().catch(() => {});
  }
  private tone(
    frequency: number,
    duration: number,
    volume: number,
    delay = 0,
    type: OscillatorType = "sine",
  ) {
    if (!this.context || !this.enabled) return;
    const ctx = this.context;
    const now = ctx.currentTime + delay;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(
      Math.max(60, frequency * 0.65),
      now + duration,
    );
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(now);
    oscillator.stop(now + duration);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
  }
  event(event: GameEvent | null) {
    if (!event || event.id === this.lastEvent) return;
    this.lastEvent = event.id;
    if (event.type === "hit" || event.type === "serve") {
      this.tone(220, 0.095, 0.16);
      this.tone(740, 0.055, 0.04);
    } else if (event.type === "spike") {
      this.tone(110, 0.16, 0.2, 0, "triangle");
      this.tone(830, 0.075, 0.08);
    } else if (event.type === "special") [330, 495, 660, 990].forEach((n, i) => this.tone(n, 0.28, 0.08, i * 0.07, "triangle"),);
    else if (event.type === "point" || event.type === "win") [523, 659, 784, 1047].forEach((n, i) => this.tone(n, 0.32, 0.06, i * 0.11),);
    else if (event.type === "jump") this.tone(370, 0.09, 0.022);
    else if (event.type === "net") this.tone(85, 0.08, 0.07, 0, "triangle");
  }
  dispose() {
    this.context?.close().catch(() => {});
    this.context = null;
  }
}
