import type { Game } from "./simulation";
import { distance, RIVER } from "./world";
import { eveningFrame, SCREEN, SHOW_SECONDS } from "./evening";

export class StreetAudio {
  context: AudioContext;
  master: GainNode;
  river: GainNode;
  engine: OscillatorNode;
  engineVolume: GainNode;
  lastHorn = -1;
  lastFootstep = 0;
  stage: PannerNode;
  stageVolume: GainNode;
  lastShowBeat = -1;
  constructor() {
    this.context = new AudioContext();
    const c = this.context;
    this.master = c.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(c.destination);
    this.stage = c.createPanner();
    this.stage.panningModel = "HRTF";
    this.stage.distanceModel = "inverse";
    this.stage.refDistance = 22;
    this.stage.maxDistance = 150;
    this.stage.positionX.value = SCREEN.x;
    this.stage.positionY.value = 2;
    this.stage.positionZ.value = SCREEN.z;
    this.stageVolume = c.createGain();
    this.stageVolume.gain.value = 0;
    this.stage.connect(this.stageVolume);
    this.stageVolume.connect(this.master);
    const buffer = c.createBuffer(1, c.sampleRate * 3, c.sampleRate);
    const data = buffer.getChannelData(0);
    let previous = 0;
    for (let i = 0; i < data.length; i++) {
      previous = previous * 0.94 + (Math.random() * 2 - 1) * 0.06;
      data[i] = previous;
    }
    const source = c.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = c.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1800;
    this.river = c.createGain();
    this.river.gain.value = 0;
    source.connect(filter);
    filter.connect(this.river);
    this.river.connect(this.master);
    source.start();
    this.engine = c.createOscillator();
    this.engine.type = "triangle";
    this.engine.frequency.value = 42;
    this.engineVolume = c.createGain();
    this.engineVolume.gain.value = 0;
    this.engine.connect(this.engineVolume);
    this.engineVolume.connect(this.master);
    this.engine.start();
  }
  resume() {
    this.context.resume().catch(() => {});
  }
  tone(frequency: number, delay: number, duration: number, volume: number, output: AudioNode = this.master) {
    const c = this.context;
    const oscillator = c.createOscillator();
    const gain = c.createGain();
    const at = c.currentTime + delay;
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(volume, at + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    oscillator.connect(gain);
    gain.connect(output);
    oscillator.start(at);
    oscillator.stop(at + duration + 0.02);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }
  update(game: Game, muted: boolean, view?: { x: number; y: number; z: number; fx: number; fy: number; fz: number }) {
    const c = this.context;
    const active = game.phase === "playing" && !muted;
    this.master.gain.setTargetAtTime(active ? 0.55 : 0, c.currentTime, 0.08);
    if (view) {
      const { listener } = c;
      listener.positionX.value = view.x; listener.positionY.value = view.y; listener.positionZ.value = view.z;
      listener.forwardX.value = view.fx; listener.forwardY.value = view.fy; listener.forwardZ.value = view.fz;
      listener.upX.value = 0; listener.upY.value = 1; listener.upZ.value = 0;
    }
    const showing = game.evening.watching && game.evening.elapsed < SHOW_SECONDS;
    this.stageVolume.gain.setTargetAtTime(active && showing ? 1 : 0, c.currentTime, 0.04);
    const beat = Math.floor(game.evening.elapsed / 0.4);
    if (active && showing && beat !== this.lastShowBeat) {
      this.lastShowBeat = beat;
      const { card } = eveningFrame(game.evening);
      const notes = card === "river" ? [392, 440, 330, 294, 330, 392, 294, 262] : card === "bridge" ? [294, 392, 440, 392, 330, 294, 262, 294] : [262, 330, 392, 440, 392, 330, 294, 330];
      this.tone(notes[beat % notes.length], 0, 0.36, 0.055, this.stage);
      if (beat % 4 === 0) this.tone(notes[beat % notes.length] / 2, 0, 0.7, 0.05, this.stage);
      if (card === "street" && beat % 2 === 0) this.tone(1320, 0, 0.08, 0.018, this.stage);
    }
    if (!game.evening.watching) this.lastShowBeat = -1;
    const d = Math.min(...RIVER.map((p) => distance(game.player, p)));
    this.river.gain.setTargetAtTime(
      active ? Math.max(0.02, 0.4 - d / 1300) : 0,
      c.currentTime,
      0.4,
    );
    const car =
      game.vehicles.find((v) => v.id === game.vehicle)?.kind === "car";
    this.engine.frequency.setTargetAtTime(
      42 + Math.abs(game.player.speed) * 3.5,
      c.currentTime,
      0.1,
    );
    this.engineVolume.gain.setTargetAtTime(
      active && car ? 0.04 : 0,
      c.currentTime,
      0.12,
    );
    if (active && game.horn > this.lastHorn && game.horn > 0) {
      this.lastHorn = game.horn;
      this.tone(car ? 330 : 1047, 0, 0.5, 0.12);
      this.tone(car ? 415 : 1568, 0.08, 0.7, 0.07);
    }
    if (
      active &&
      !game.vehicle &&
      Math.abs(game.player.speed) > 1 &&
      game.time - this.lastFootstep > (game.player.speed > 6 ? 0.25 : 0.4)
    ) {
      this.lastFootstep = game.time;
      this.tone(95, 0, 0.07, 0.035);
    }
  }
  dispose() {
    this.context.close().catch(() => {});
  }
}
