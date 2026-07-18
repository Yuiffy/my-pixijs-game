export type GameAudioEvent =
  | "click"
  | "buy"
  | "upgrade"
  | "reroll"
  | "lock"
  | "battle"
  | "win"
  | "loss"
  | "merge"
  | "augment";

export interface AudioPreferences {
  muted: boolean;
  musicVolume: number;
  effectsVolume: number;
}

const STORAGE_KEY = "rift-line-audio-v1";
export const DEFAULT_AUDIO_PREFERENCES: AudioPreferences = {
  muted: false,
  musicVolume: 0.24,
  effectsVolume: 0.52,
};

const clamp = (value: number) => Math.max(0, Math.min(1, value));

export const loadAudioPreferences = (): AudioPreferences => {
  if (typeof window === "undefined") return DEFAULT_AUDIO_PREFERENCES;
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}");
    return {
      muted: typeof value.muted === "boolean" ? value.muted : DEFAULT_AUDIO_PREFERENCES.muted,
      musicVolume: clamp(Number(value.musicVolume ?? DEFAULT_AUDIO_PREFERENCES.musicVolume)),
      effectsVolume: clamp(Number(value.effectsVolume ?? DEFAULT_AUDIO_PREFERENCES.effectsVolume)),
    };
  } catch {
    return DEFAULT_AUDIO_PREFERENCES;
  }
};

export const saveAudioPreferences = (preferences: AudioPreferences) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Storage can be unavailable in private browsing; audio still works for the session.
  }
};

export class AutoChessAudio {
  private context: AudioContext | null = null;

  private musicGain: GainNode | null = null;

  private effectsGain: GainNode | null = null;

  private musicTimer: number | null = null;

  private musicStep = 0;

  private preferences: AudioPreferences;

  constructor(preferences: AudioPreferences) {
    this.preferences = preferences;
  }

  public setPreferences(preferences: AudioPreferences) {
    this.preferences = preferences;
    saveAudioPreferences(preferences);
    this.applyVolumes();
    if (preferences.muted || preferences.musicVolume === 0) this.stopMusic();
    else if (this.context) this.startMusic();
  }

  public async unlock() {
    if (typeof window === "undefined") return;
    if (!this.context) {
      const AudioContextClass = window.AudioContext;
      if (!AudioContextClass) return;
      this.context = new AudioContextClass();
      this.musicGain = this.context.createGain();
      this.effectsGain = this.context.createGain();
      this.musicGain.connect(this.context.destination);
      this.effectsGain.connect(this.context.destination);
      this.applyVolumes();
    }
    if (this.context.state === "suspended") await this.context.resume();
    if (!this.preferences.muted && this.preferences.musicVolume > 0) {
      this.startMusic();
    }
  }

  private applyVolumes() {
    if (!this.context) return;
    const now = this.context.currentTime;
    this.musicGain?.gain.setTargetAtTime(
      this.preferences.muted ? 0 : this.preferences.musicVolume,
      now,
      0.03,
    );
    this.effectsGain?.gain.setTargetAtTime(
      this.preferences.muted ? 0 : this.preferences.effectsVolume,
      now,
      0.02,
    );
  }

  private tone(
    frequency: number,
    duration: number,
    type: OscillatorType = "sine",
    offset = 0,
    volume = 0.16,
    destination = this.effectsGain,
  ) {
    if (!this.context || !destination || this.preferences.muted) return;
    const start = this.context.currentTime + offset;
    const oscillator = this.context.createOscillator();
    const envelope = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(volume, start + 0.012);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(envelope);
    envelope.connect(destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.03);
  }

  public play(event: GameAudioEvent) {
    if (!this.context || this.preferences.muted) return;
    const notes: Record<GameAudioEvent, Array<[number, number, OscillatorType, number]>> = {
      click: [[420, 0.06, "sine", 0]],
      buy: [[520, 0.08, "triangle", 0], [680, 0.1, "triangle", 0.05]],
      upgrade: [[392, 0.12, "triangle", 0], [523, 0.14, "triangle", 0.08], [659, 0.18, "triangle", 0.16]],
      reroll: [[340, 0.08, "square", 0], [460, 0.08, "square", 0.06]],
      lock: [[260, 0.09, "triangle", 0], [260, 0.13, "sine", 0.08]],
      battle: [[196, 0.18, "sawtooth", 0], [294, 0.22, "triangle", 0.12]],
      win: [[392, 0.14, "triangle", 0], [523, 0.14, "triangle", 0.1], [784, 0.28, "sine", 0.2]],
      loss: [[330, 0.16, "triangle", 0], [247, 0.18, "triangle", 0.12], [196, 0.26, "sine", 0.24]],
      merge: [[440, 0.12, "sine", 0], [660, 0.16, "sine", 0.08], [880, 0.2, "sine", 0.16]],
      augment: [[349, 0.16, "triangle", 0], [523, 0.2, "triangle", 0.1], [698, 0.25, "sine", 0.2]],
    };
    notes[event].forEach(([frequency, duration, type, offset]) => {
      this.tone(frequency, duration, type, offset);
    });
  }

  private startMusic() {
    if (this.musicTimer !== null || !this.context || this.preferences.muted) return;
    const sequence = [146.83, 174.61, 220, 196, 146.83, 220, 261.63, 196];
    const tick = () => {
      const root = sequence[this.musicStep % sequence.length];
      this.tone(root, 0.58, "sine", 0, 0.055, this.musicGain);
      if (this.musicStep % 2 === 0) {
        this.tone(root * 1.5, 0.42, "triangle", 0.12, 0.025, this.musicGain);
      }
      this.musicStep += 1;
    };
    tick();
    this.musicTimer = window.setInterval(tick, 720);
  }

  private stopMusic() {
    if (this.musicTimer !== null) window.clearInterval(this.musicTimer);
    this.musicTimer = null;
  }

  public destroy() {
    this.stopMusic();
    this.context?.close();
    this.context = null;
  }
}
