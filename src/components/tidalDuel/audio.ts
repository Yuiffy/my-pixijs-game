import type { GameEvent } from "./engine";

/** Short original synthesized impacts; all nodes are released after playback. */
export default class DuelAudio {
  private context: AudioContext | null = null;
  private enabled = true;
  private last = 0;
  reset() {
    this.last = 0;
  }
  setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }
  unlock() {
    if (!this.context) this.context = new AudioContext();
    this.context.resume().catch(() => {});
  }
  private tone(
    frequency: number,
    duration: number,
    volume: number,
    delay = 0,
    type: OscillatorType = "triangle",
  ) {
    if (!this.enabled || !this.context || this.context.state !== "running") return;
    const ctx = this.context;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    const time = ctx.currentTime + delay;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, time);
    oscillator.frequency.exponentialRampToValueAtTime(
      Math.max(35, frequency * 0.25),
      time + duration,
    );
    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(time);
    oscillator.stop(time + duration);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
  }
  events(events: GameEvent[]) {
    const fresh = events.filter((event) => event.id > this.last);
    fresh.forEach((event) => {
      this.last = Math.max(this.last, event.id);
      if (["hit", "critical", "launch", "throw"].includes(event.type)) {
        this.tone(event.type === "throw" ? 100 : 180, 0.13, 0.13);
        this.tone(750, 0.06, 0.022, 0, "square");
      } else if (event.type === "block") this.tone(340, 0.075, 0.045);
      else if (event.type === "hold") {
        this.tone(600, 0.18, 0.09);
        this.tone(220, 0.15, 0.1, 0.09);
      } else if (event.type === "super") [220, 330, 440, 660].forEach((note, i) => this.tone(note, 0.3, 0.04, i * 0.06),);
      else if (event.type === "ko") [392, 494, 587].forEach((note, i) => this.tone(note, 0.4, 0.03, i * 0.12, "sine"),);
      else if (event.type === "sidestep") this.tone(560, 0.075, 0.015, 0, "sine");
      else if (event.type === "projectile") [660, 440, 220].forEach((note, i) => this.tone(note, 0.09, 0.025, i * 0.035, "sine"),);
      else if (event.type === "tech") {
        this.tone(880, 0.1, 0.04);
        this.tone(660, 0.1, 0.04, 0.06);
      } else if (event.type === "cancel") this.tone(990, 0.17, 0.045, 0, "sine");
      else if (event.type === "burst" || event.type === "guardBreak") {
        this.tone(110, 0.22, 0.1);
        this.tone(440, 0.14, 0.045);
      }
    });
  }
  dispose() {
    this.context?.close().catch(() => {});
    this.context = null;
  }
}
