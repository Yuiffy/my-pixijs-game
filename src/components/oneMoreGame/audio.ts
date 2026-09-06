import type { Cue } from "./core";

const NOTES: Record<Cue, [number, number, OscillatorType]> = {
  start: [523, 0.16, "sine"],
  swing: [210, 0.12, "triangle"],
  triple: [330, 0.1, "triangle"],
  danger: [135, 0.28, "sawtooth"],
  attack: [450, 0.07, "triangle"],
  whiff: [170, 0.05, "sine"],
  hit: [110, 0.09, "triangle"],
  guard: [290, 0.07, "square"],
  parry: [1100, 0.17, "sine"],
  dodge: [640, 0.1, "sine"],
  hurt: [95, 0.14, "sawtooth"],
  win: [784, 0.6, "sine"],
  lose: [196, 0.3, "triangle"],
};

export class SparringAudio {
  private context: AudioContext | null = null;
  private nodes = new Set<OscillatorNode>();
  private lastCue: Cue | null = null;
  muted = true;
  volume = 0.35;
  get status() {
    return { muted: this.muted, volume: this.volume, context: this.context?.state ?? 'not-started', activeVoices: this.nodes.size, lastCue: this.lastCue };
  }
  async unlock() {
    if (this.muted) return;
    try {
      this.context ??= new AudioContext();
      await this.context.resume();
    } catch {
      /* Audio is optional when a browser or output device rejects it. */
    }
  }
  play(cue: Cue) {
    if (this.muted || !this.context || this.context.state !== "running") return;
    const { context } = this;
    this.lastCue = cue;
    if (cue === 'parry') {
      // Inharmonic overtones give the parry its own metal strike and ringing tail.
      this.tone(context, 1480, 1410, 0.42, 0.19, 'sine');
      this.tone(context, 2317, 2240, 0.25, 0.1, 'sine');
      this.tone(context, 3670, 3400, 0.11, 0.055, 'triangle');
      this.tone(context, 780, 310, 0.045, 0.085, 'square');
      return;
    }
    const [frequency, duration, type] = NOTES[cue];
    this.tone(context, frequency, cue === 'win' ? 1175 : Math.max(45, frequency * 0.55), duration, 0.09, type);
  }
  private tone(context: AudioContext, frequency: number, end: number, duration: number, peak: number, type: OscillatorType) {
    if (this.nodes.size >= 12) {
      const oldest = this.nodes.values().next().value;
      if (oldest) { oldest.stop(); this.nodes.delete(oldest); }
    }
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(
      end,
      context.currentTime + duration,
    );
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      Math.max(0.0001, this.volume * peak),
      context.currentTime + 0.004,
    );
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      context.currentTime + duration,
    );
    oscillator.connect(gain);
    gain.connect(context.destination);
    this.nodes.add(oscillator);
    oscillator.onended = () => {
      this.nodes.delete(oscillator);
      oscillator.disconnect();
      gain.disconnect();
    };
    oscillator.start();
    oscillator.stop(context.currentTime + duration + 0.02);
  }
  stop() {
    this.nodes.forEach((node) => {
      try {
        node.stop();
      } catch {
        /* Already ended. */
      }
    });
    this.nodes.clear();
  }
  destroy() {
    this.stop();
    this.context?.close().catch(() => {});
    this.context = null;
  }
}
