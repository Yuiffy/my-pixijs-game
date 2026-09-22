import { broadcast } from "./engine";
import { worldPoint } from "./navigation";
import type { Runtime3D } from "./runtime3d";

export class ApartmentSound {
  private context: AudioContext;
  private voice: PannerNode;
  private wall: BiquadFilterNode;
  private master: GainNode;
  private lastBeat = -1;
  private lastStep = -1;
  private done = 0;
  constructor() {
    this.context = new AudioContext();
    this.master = this.context.createGain();
    this.master.gain.value = 0.45;
    this.master.connect(this.context.destination);
    this.voice = this.context.createPanner();
    this.voice.panningModel = "HRTF";
    this.voice.distanceModel = "inverse";
    this.voice.refDistance = 1.5;
    this.voice.rolloffFactor = 0.5;
    this.voice.positionX.value = 3.77;
    this.voice.positionY.value = 1.31;
    this.voice.positionZ.value = -0.47;
    this.wall = this.context.createBiquadFilter();
    this.wall.type = "lowpass";
    this.wall.frequency.value = 5000;
    this.voice.connect(this.wall);
    this.wall.connect(this.master);
  }
  async resume() {
    await this.context.resume();
  }
  private tone(
    frequency: number,
    gain: number,
    duration: number,
    spatial: boolean,
    type: OscillatorType = "sine",
  ) {
    const ctx = this.context;
    const oscillator = ctx.createOscillator();
    const envelope = ctx.createGain();
    const now = ctx.currentTime;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(
      Math.max(40, frequency * 0.92),
      now + duration,
    );
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.exponentialRampToValueAtTime(gain, now + 0.018);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(envelope);
    envelope.connect(spatial ? this.voice : this.master);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.03);
    oscillator.onended = () => {
      oscillator.disconnect();
      envelope.disconnect();
    };
  }
  update(r: Runtime3D, enabled: boolean) {
    const s = r.game;
    const now = this.context.currentTime;
    this.master.gain.setTargetAtTime(
      enabled && s.phase === "playing" ? 0.45 : 0.0001,
      now,
      0.08,
    );
    if (!enabled || s.phase !== "playing") return;
    const [x, z] = worldPoint(s.player);
    const { listener } = this.context;
    listener.positionX.value = x;
    listener.positionY.value = 1.55;
    listener.positionZ.value = z;
    listener.forwardX.value = -Math.sin(r.yaw) * Math.cos(r.pitch);
    listener.forwardY.value = Math.sin(r.pitch);
    listener.forwardZ.value = -Math.cos(r.yaw) * Math.cos(r.pitch);
    listener.upX.value = 0;
    listener.upY.value = 1;
    listener.upZ.value = 0;
    this.wall.frequency.setTargetAtTime(
      s.player.x < 506 ? (s.doorClosed ? 450 : 1500) : 5200,
      now,
      0.15,
    );
    const beat = Math.floor(s.elapsed / 0.7);
    if (beat !== this.lastBeat) {
      this.lastBeat = beat;
      const { music } = broadcast(s);
      if (s.muted <= 0) this.tone(
          music
            ? [261.6, 329.6, 392, 440, 392, 329.6, 293.7, 329.6][beat % 8]
            : [174, 207, 196, 220][beat % 4],
          music ? 0.065 : 0.025,
          music ? 0.58 : 0.18,
          true,
          music ? "sine" : "triangle",
        );
    }
    const foot = Math.floor(s.elapsed / (s.quiet ? 0.55 : 0.32));
    const moving =
      s.path.length ||
      r.keys.has("w") ||
      r.keys.has("a") ||
      r.keys.has("s") ||
      r.keys.has("d") ||
      Math.abs(r.stick.x) + Math.abs(r.stick.y) > 0.1;
    if (foot !== this.lastStep && moving) {
      this.lastStep = foot;
      this.tone(
        s.quiet ? 90 : 75,
        s.quiet ? 0.012 : 0.035,
        0.1,
        false,
        "triangle",
      );
    }
    if (s.done.length > this.done) {
      this.done = s.done.length;
      this.tone(660, 0.07, 0.3, false);
    }
    if (s.done.length < this.done) this.done = s.done.length;
  }
  close() {
    this.context.close().catch(() => {});
  }
}
