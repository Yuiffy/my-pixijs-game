import { beforeStream } from "./outings";
import { entryKeyReady, offAir } from "./daily";
import { type Game } from "./engine";
import { endingScene } from "./endings";
import { audioSnapshot, dialogueEvent, liveVoice, musicFor, DEFAULT_MIX, type AudioClip, type AudioManifest, type AudioMix, type AudioSnapshot, type VoicePlan } from "./audioPlan";
import type { Runtime3D } from "./runtime3d";

type Slot = { key: string; clip: string; source: AudioBufferSourceNode | null; started: number; offset: number; ended: boolean; gain: GainNode };
export class ApartmentSound {
  private context: AudioContext;
  private master: GainNode;
  private voice: PannerNode;
  private wall: BiquadFilterNode;
  private voiceBus: GainNode;
  private musicBus: GainNode;
  private effectsBus: GainNode;
  private meter: AnalyserNode;
  private samples = new Float32Array(256);
  private manifest: AudioManifest | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private pending = new Map<string, Promise<void>>();
  private failures = new Set<string>();
  private voiceSlot: Slot | null = null;
  private musicSlot: Slot | null = null;
  private roomSlot: Slot | null = null;
  private game: Game | null = null;
  private snapshot: AudioSnapshot | null = null;
  private event: { clip: string; key: string; offset: number; waiting: number } | null = null;
  private oneShots = new Set<Slot>();
  private eventCounter = 0;
  private afterLine: string | null = null;
  private lastFoot = -1;
  private lastSfx = { door: false, done: 0, messages: 0, mini: null as unknown, hits: 0, misses: 0, shots: 0, key: false, noodles: "none", nap: -1, fault: "none", deltaHits: 0, deltaMisses: 0 };
  private closed = false;
  constructor() {
    this.context = new AudioContext();
    this.master = this.context.createGain(); this.master.gain.value = 0;
    const limiter = this.context.createDynamicsCompressor();
    limiter.threshold.value = -6; limiter.knee.value = 8; limiter.ratio.value = 8;
    this.master.connect(limiter); limiter.connect(this.context.destination);
    this.voiceBus = this.context.createGain(); this.musicBus = this.context.createGain(); this.effectsBus = this.context.createGain();
    this.voiceBus.connect(this.master); this.musicBus.connect(this.master); this.effectsBus.connect(this.master);
    this.voice = this.context.createPanner(); this.voice.panningModel = "HRTF";
    this.voice.distanceModel = "inverse"; this.voice.refDistance = 2.5; this.voice.rolloffFactor = 0.35;
    this.wall = this.context.createBiquadFilter(); this.wall.type = "lowpass";
    this.meter = this.context.createAnalyser(); this.meter.fftSize = 256;
    this.voice.connect(this.wall); this.wall.connect(this.meter); this.meter.connect(this.voiceBus);
    fetch("/games/hush-live/audio-v2/manifest.json").then(response => {
      if (!response.ok) throw new Error("Audio manifest unavailable");
      return response.json() as Promise<AudioManifest>;
    }).then(manifest => {
      if (this.closed) return;
      this.manifest = manifest;
      Object.keys(manifest.clips).forEach(id => { this.load(id); });
    }).catch(() => { this.failures.add("manifest"); });
  }
  async resume() { if (!this.closed) await this.context.resume(); }
  private load(id: string) {
    if (this.closed || this.buffers.has(id) || this.pending.has(id) || this.failures.has(id)) return;
    const item = this.manifest?.clips[id];
    if (!item) return;
    const task = fetch(item.src).then(response => {
      if (!response.ok) throw new Error("Audio clip unavailable");
      return response.arrayBuffer();
    }).then(bytes => this.context.decodeAudioData(bytes)).then(buffer => {
      if (!this.closed) this.buffers.set(id, buffer);
    })
.catch(() => { this.failures.add(id); })
.finally(() => this.pending.delete(id));
    this.pending.set(id, task);
  }
  private stop(slot: Slot | null) {
    if (!slot?.source) return;
    const node = slot.source; slot.source = null;
    slot.gain.gain.cancelScheduledValues(this.context.currentTime);
    slot.gain.gain.setTargetAtTime(0, this.context.currentTime, 0.008);
    try { node.stop(this.context.currentTime + 0.04); } catch { /* Source already ended. */ }
  }
  silence() {
    if (this.event && this.voiceSlot?.key === this.event.key && this.voiceSlot.ended) this.event = null;
    if (this.event && this.voiceSlot?.key === this.event.key && !this.voiceSlot.ended && this.voiceSlot.source) {
      this.event.offset = this.context.currentTime - this.voiceSlot.started + this.voiceSlot.offset;
    }
    this.master.gain.cancelScheduledValues(this.context.currentTime);
    this.master.gain.setValueAtTime(0, this.context.currentTime);
    this.stop(this.voiceSlot); this.stop(this.musicSlot); this.stop(this.roomSlot);
    this.oneShots.forEach(slot => this.stop(slot)); this.oneShots.clear();
    this.voiceSlot = null; this.musicSlot = null; this.roomSlot = null;
  }
  private slot(id: string, key: string, offset: number, loop: boolean, bus: AudioNode, gain = 1): Slot | null {
    this.load(id);
    const buffer = this.buffers.get(id);
    if (!buffer) return null;
    const source = this.context.createBufferSource(); source.buffer = buffer; source.loop = loop;
    const envelope = this.context.createGain(); envelope.gain.setValueAtTime(0, this.context.currentTime);
    envelope.gain.setTargetAtTime(gain, this.context.currentTime, 0.015);
    source.connect(envelope); envelope.connect(bus);
    const at = loop ? offset % buffer.duration : Math.max(0, Math.min(offset, buffer.duration));
    const value: Slot = { key, clip: id, source, started: this.context.currentTime, offset: at, ended: at >= buffer.duration, gain: envelope };
    source.onended = () => { value.ended = true; this.oneShots.delete(value); source.disconnect(); envelope.disconnect(); };
    if (at < buffer.duration) source.start(0, at);
    else { source.disconnect(); envelope.disconnect(); value.source = null; }
    return value;
  }
  private voicePlan(plan: VoicePlan | null) {
    if (!plan) { this.stop(this.voiceSlot); this.voiceSlot = null; return; }
    const current = this.voiceSlot;
    const drift = current ? Math.abs((this.context.currentTime - current.started + current.offset) - plan.offset) : 0;
    if (current?.key === plan.key && current.clip === plan.clip && (!plan.sync || drift < 0.3)) return;
    this.stop(current);
    this.voiceSlot = this.slot(plan.clip, plan.key, plan.offset, false, this.voice);
  }
  private effect(id: string, gain = 1) {
    const slot = this.slot(`sfx/${id}`, "effect", 0, false, this.effectsBus, gain);
    if (slot) this.oneShots.add(slot);
  }
  private effects(r: Runtime3D) {
    const s = r.game; const d = s.daily; const previous = this.lastSfx;
    if (s.doorClosed !== previous.door) this.effect("door", s.quiet ? 0.6 : 1);
    if (s.done.length > previous.done) this.effect(s.done.includes("food") && !this.snapshot?.done.includes("food") ? "dish" : "task");
    const messages = d?.messages.length ?? 0;
    if (messages > previous.messages && d?.unread) this.effect("phone");
    if (d) {
      if (d.household.noodles === "hot" && previous.noodles !== "hot") this.effect("kettle");
      const cue = d.panel === "lock" && entryKeyReady(d);
      if (cue && !previous.key) this.effect("key");
      if (d.mini !== previous.mini) { previous.mini = d.mini; previous.hits = 0; previous.misses = 0; previous.shots = 0; }
      if (d.mini.score > previous.hits && d.mini.kind !== "recoil") this.effect("hit");
      if (d.mini.misses > previous.misses) this.effect("miss");
      if (d.mini.shots > previous.shots) this.effect("shot", d.volume / 100);
      const snore = d.events.nap.active && d.events.nap.clock > 2 ? Math.floor(d.events.nap.clock / 1.8) : -1;
      if (snore >= 0 && snore !== previous.nap) this.effect("snore", 0.5);
      previous.nap = snore; previous.hits = d.mini.score; previous.misses = d.mini.misses; previous.shots = d.mini.shots; previous.key = cue;
      previous.noodles = d.household.noodles;
      const fault = d.events.repair.stage;
      if (fault === "fault" && previous.fault !== "fault") this.effect("fault");
      if (fault === "fixed" && previous.fault !== "fixed") this.effect("restore");
      previous.fault = fault;
    }
    if (s.delta) {
      if (s.delta.hits > previous.deltaHits) this.effect("hit");
      if (s.delta.misses > previous.deltaMisses) this.effect("miss");
      previous.deltaHits = s.delta.hits; previous.deltaMisses = s.delta.misses;
    }
    const foot = Math.floor(s.elapsed / (s.quiet ? 0.55 : 0.32));
    const moving = s.path.length || ["w", "a", "s", "d"].some(key => r.keys.has(key)) || Math.abs(r.stick.x) + Math.abs(r.stick.y) > 0.1;
    if (foot !== this.lastFoot && moving) this.effect(s.quiet ? "foot-soft" : "foot-normal");
    this.lastFoot = foot; previous.door = s.doorClosed; previous.done = s.done.length; previous.messages = messages;
  }
  update(r: Runtime3D, enabled: boolean, mix: AudioMix = DEFAULT_MIX, overlay = false) {
    if (this.closed) return;
    const s = r.game; const now = this.context.currentTime;
    const allowed = enabled && !overlay && (s.phase === "playing" || s.phase === "result") && !document.hidden;
    r.audio.enabled = enabled; r.audio.loaded = this.buffers.size; r.audio.pending = this.pending.size; r.audio.errors = Array.from(this.failures);
    r.audio.context = this.context.state;
    if (!allowed) {
      this.silence(); r.audio.mode = "silent"; r.audio.voice = null; r.audio.music = null; r.audio.mouth = 0; r.audio.rms = 0; r.audio.text = ""; r.audio.offset = 0;
      return;
    }
    if (this.game !== s) {
      this.silence(); this.game = s; this.snapshot = null; this.event = null; this.afterLine = null;
      this.lastSfx = { door: s.doorClosed, done: s.done.length, messages: s.daily?.messages.length ?? 0, mini: null, hits: 0, misses: 0, shots: 0, key: false, noodles: s.daily?.household.noodles ?? "none", nap: -1, fault: s.daily?.events.repair.stage ?? "none", deltaHits: 0, deltaMisses: 0 };
    }
    this.master.gain.setTargetAtTime(0.8, now, 0.025);
    this.voiceBus.gain.setTargetAtTime(mix.voice, now, 0.025); this.effectsBus.gain.setTargetAtTime(mix.effects * 0.55, now, 0.025);
    const nextEvent = dialogueEvent(s, this.snapshot);
    if (nextEvent) {
      if (nextEvent.startsWith("after-") && this.event?.clip.endsWith("/off-air")) this.afterLine = nextEvent;
      else {
        this.eventCounter += 1;
        this.event = { clip: `voice/${nextEvent}`, key: `event/${this.eventCounter}`, offset: 0, waiting: performance.now() };
        this.afterLine = null;
      }
    }
    if (this.event && ((this.voiceSlot?.key === this.event.key && this.voiceSlot.ended) || this.failures.has(this.event.clip) || (!this.buffers.has(this.event.clip) && performance.now() - this.event.waiting > 10000))) this.event = null;
    if (!this.event && this.afterLine) {
      this.eventCounter += 1;
      this.event = { clip: `voice/${this.afterLine}`, key: `event/${this.eventCounter}`, offset: 0, waiting: performance.now() };
      this.afterLine = null;
    }
    let vocal = liveVoice(s);
    if (this.event) vocal = { ...this.event, sync: false, mode: "private" };
    // Private event lines own the voice channel. No overlapping broadcast speech.
    this.voicePlan(vocal);
    const final = endingScene(s);
    const { emitter, listener: ear, forward, up } = r.audioSpatial;
    this.voice.positionX.setValueAtTime(emitter[0], now); this.voice.positionY.setValueAtTime(emitter[1], now); this.voice.positionZ.setValueAtTime(emitter[2], now);
    const { listener } = this.context;
    listener.positionX.setValueAtTime(ear[0], now); listener.positionY.setValueAtTime(ear[1], now); listener.positionZ.setValueAtTime(ear[2], now);
    listener.forwardX.setValueAtTime(forward[0], now); listener.forwardY.setValueAtTime(forward[1], now); listener.forwardZ.setValueAtTime(forward[2], now);
    listener.upX.setValueAtTime(up[0], now); listener.upY.setValueAtTime(up[1], now); listener.upZ.setValueAtTime(up[2], now);
    const cutoff = final || offAir(s) || beforeStream(s) ? 6500 : s.player.x < 506 ? s.doorClosed ? 550 : 2000 : 6500;
    this.wall.frequency.setTargetAtTime(cutoff, now, 0.06);
    const plannedMusic = musicFor(s);
    const singing = vocal?.mode === "sing" ? vocal : null;
    const music = !singing && plannedMusic?.startsWith("music/song-") ? "music/apartment" : plannedMusic;
    const musicKey = singing ? `${singing.key}/music` : music;
    const musicOffset = singing ? singing.offset : 0;
    const musicDrift = this.musicSlot ? Math.abs(now - this.musicSlot.started + this.musicSlot.offset - musicOffset) : 0;
    if (musicKey !== this.musicSlot?.key || (singing && musicDrift > 0.3)) {
      this.stop(this.musicSlot);
      this.musicSlot = music && musicKey ? this.slot(music, musicKey, musicOffset, !singing && music !== "music/setback", this.musicBus) : null;
    }
    this.musicBus.gain.setTargetAtTime(mix.music * (vocal ? 0.5 : 1), now, 0.15);
    const room = final && ["night-walk", "supper-table"].includes(final.id) ? "ambience/street" : "ambience/room";
    if (this.roomSlot?.clip !== room) { this.stop(this.roomSlot); this.roomSlot = this.slot(room, room, 0, true, this.effectsBus, 0.13); }
    if (s.phase === "playing") this.effects(r);
    this.snapshot = audioSnapshot(s);
    this.meter.getFloatTimeDomainData(this.samples);
    let energy = 0; this.samples.forEach(value => { energy += value * value; });
    const rms = Math.sqrt(energy / this.samples.length);
    const voice = this.voiceSlot;
    const item: AudioClip | undefined = voice ? this.manifest?.clips[voice.clip] : undefined;
    const offset = voice ? now - voice.started + voice.offset : 0;
    const envelope = voice && !voice.ended ? item?.envelope?.[Math.floor(offset * (item.envelopeRate ?? 25))] ?? 0 : 0;
    r.audio.mode = vocal?.mode ?? "ambient"; r.audio.voice = voice && !voice.ended ? voice.clip : null; r.audio.music = this.musicSlot?.clip ?? null;
    r.audio.offset = offset; r.audio.text = r.audio.voice ? item?.text ?? "" : ""; r.audio.mouth = mix.voice > 0 ? envelope : 0;
    r.audio.rms = mix.voice > 0 ? rms : 0; r.audio.wallHz = cutoff; r.audio.context = this.context.state;
  }
  close() { this.closed = true; this.silence(); this.context.close().catch(() => {}); }
}
