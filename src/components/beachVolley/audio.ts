import manifest from "../../../public/games/beach-volley/audio.json";
import type { Character, GameEvent } from "./engine";
import type { MusicKind, VoiceCue, VoiceKind } from "./audioCues";
import { VariantPicker } from "./variants";

interface AudioClip {
  src: string;
  bytes: number;
  duration: number;
  loop?: boolean;
  text?: string;
}
interface AudioManifest {
  music: Record<MusicKind, AudioClip>;
  voices: Record<Character, Record<VoiceKind, AudioClip | AudioClip[]>>;
  effort?: Record<Character, AudioClip[]>;
}
export const AUDIO = manifest as AudioManifest;
export const audioVariants = (pool: AudioClip | AudioClip[]) => (Array.isArray(pool) ? pool : [pool]);
export interface AudioSettings {
  enabled: boolean;
  music: boolean;
  voices: boolean;
}
export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  enabled: true,
  music: true,
  voices: true,
};
interface Download {
  clip: AudioClip;
  urgent: boolean;
  resolve: () => void;
}
interface PlayingMusic {
  kind: MusicKind;
  source: AudioBufferSourceNode;
  gain: GainNode;
  ended: boolean;
}

/** One gesture-unlocked mixer for music, generated voice clips and court effects. */
export default class BeachAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private voiceBus: GainNode | null = null;
  private settings = { ...DEFAULT_AUDIO_SETTINGS };
  private paused = false;
  private backgroundPaused = false;
  private disposed = false;
  private lastEvent = 0;
  private lastContact = 0;
  private scene: MusicKind = "menu";
  private music: PlayingMusic | null = null;
  private voice: { cue: VoiceCue; clip: AudioClip; source: AudioBufferSourceNode } | null = null;
  private voiceQueue: { cue: VoiceCue; clip: AudioClip }[] = [];
  private variants: VariantPicker;
  private cinemaDialogue = false;
  private effort = new Set<AudioBufferSourceNode>();
  private effortSerial = 0;
  private effortPlayed = 0;
  private lastEffort: { character: Character; src: string; eventId: number } | null = null;
  private voiceTag = "";
  private voiceSerial = 0;
  private pendingVoice: VoiceCue | null = null;
  private voiceDeadline = 0;
  private loadingMusic = "";
  private effects = new Set<OscillatorNode>();
  private desired = new Set<string>();
  private encoded = new Map<string, ArrayBuffer>();
  private decoded = new Map<string, AudioBuffer>();
  private decoding = new Map<string, Promise<AudioBuffer | null>>();
  private failures = new Set<string>();
  private downloads = new Map<string, Promise<void>>();
  private queue: Download[] = [];
  private active: { task: Download; controller: AbortController } | null = null;

  constructor(random = Math.random) {
    this.variants = new VariantPicker(random);
  }

  configure(settings: AudioSettings) {
    this.settings = { ...settings };
    if (!settings.enabled || !settings.voices) {
      this.clearVoices();
      this.clearEffort();
    }
    if (!settings.enabled) {
      this.clearEffects();
      this.active?.controller.abort();
    }
    if (!settings.music) this.stopMusic();
    this.duck(!!this.voice || this.cinemaDialogue);
    this.reconcileContext();
    this.pump();
    this.playMusic();
  }
  unlock() {
    if (this.disposed || !this.settings.enabled) return;
    if (!this.context) {
      try {
        const ctx = new AudioContext({ sampleRate: 32000 });
        this.context = ctx;
        this.master = ctx.createGain();
        this.musicBus = ctx.createGain();
        this.voiceBus = ctx.createGain();
        this.master.connect(ctx.destination);
        this.musicBus.connect(this.master);
        this.voiceBus.connect(this.master);
        this.musicBus.gain.value = 0.38;
        this.voiceBus.gain.value = 0.85;
      } catch {
        return;
      }
    }
    this.reconcileContext();
    this.playMusic();
    this.playNextVoice();
    for (const pool of Object.values(AUDIO.effort || {})) for (const clip of pool) if (this.desired.has(clip.src) && this.encoded.has(clip.src)) this.buffer(clip).catch(() => {});
  }
  private reconcileContext() {
    const ctx = this.context;
    if (!ctx || this.disposed) return;
    const audible = this.settings.enabled && !this.paused;
    this.master!.gain.cancelScheduledValues(ctx.currentTime);
    this.master!.gain.value = audible ? 1 : 0;
    if (audible && ctx.state !== "running" && ctx.state !== "closed") ctx
        .resume()
        .then(() => {
          if (this.disposed) return;
          if (this.paused || !this.settings.enabled) this.reconcileContext();
          else {
            this.playMusic();
            this.playNextVoice();
          }
        })
        .catch(() => {});
    else if (!audible && ctx.state === "running") ctx.suspend().catch(() => {});
  }
  setPaused(paused: boolean) {
    if (this.paused === paused) return;
    this.paused = paused;
    this.reconcileContext();
    if (!paused) {
      this.playMusic();
      this.playNextVoice();
    }
  }
  setBackgroundPaused(paused: boolean) {
    if (this.backgroundPaused === paused) return;
    this.backgroundPaused = paused;
    if (paused && this.active && !this.active.task.clip.text) this.active.controller.abort();
    if (!paused) this.pump();
  }
  setScene(scene: MusicKind) {
    if (this.scene !== scene) {
      this.scene = scene;
      this.stopMusic();
    }
    this.playMusic();
  }
  setCinemaDialogue(active: boolean) {
    this.cinemaDialogue = active;
    this.duck(active || !!this.voice);
  }
  prepare(characters: Character[]) {
    const clips = [AUDIO.music.menu];
    const actors = Array.from(new Set(characters));
    for (const actor of actors) clips.push(...(AUDIO.effort?.[actor] || []), ...audioVariants(AUDIO.voices[actor].intro), ...audioVariants(AUDIO.voices[actor].special));
    clips.push(AUDIO.music.match, AUDIO.music.victory, AUDIO.music.defeat);
    for (const actor of actors) for (const kind of [
        "pointWin",
        "pointLose",
        "victory",
        "defeat",
      ] as VoiceKind[]) clips.push(...audioVariants(AUDIO.voices[actor][kind]));
    this.desired = new Set(
      clips.filter((c) => this.allowed(c)).map((c) => c.src),
    );
    for (const key of Array.from(this.encoded.keys())) if (!this.desired.has(key)) this.encoded.delete(key);
    for (const key of Array.from(this.decoded.keys())) if (!this.desired.has(key)) this.decoded.delete(key);
    this.queue = this.queue.filter((t) => {
      if (this.desired.has(t.clip.src)) return true;
      t.resolve();
      this.downloads.delete(t.clip.src);
      return false;
    });
    if (this.active && !this.desired.has(this.active.task.clip.src)) this.active.controller.abort();
    for (const clip of clips) if (this.allowed(clip)) this.download(clip);
  }
  private allowed(clip: AudioClip) {
    return (
      this.settings.enabled &&
      (clip.text ? this.settings.voices : this.settings.music)
    );
  }
  private download(clip: AudioClip, urgent = false): Promise<void> {
    if (
      this.disposed ||
      !this.allowed(clip) ||
      this.encoded.has(clip.src) ||
      this.failures.has(clip.src)
    ) return Promise.resolve();
    const existing = this.downloads.get(clip.src);
    if (existing) {
      if (urgent) {
        const task = this.queue.find((t) => t.clip.src === clip.src);
        if (task) {
          task.urgent = true;
          this.queue = [task, ...this.queue.filter((t) => t !== task)];
        }
        if (this.active?.task.clip.src === clip.src) this.active.task.urgent = true;
        else if (clip.text && this.active && !this.active.task.clip.text) this.active.controller.abort();
        this.pump();
      }
      return existing;
    }
    let complete!: () => void;
    const pending = new Promise<void>((resolve) => {
      complete = resolve;
    });
    this.downloads.set(clip.src, pending);
    const task = { clip, urgent, resolve: complete };
    if (urgent) this.queue.unshift(task);
    else this.queue.push(task);
    if (urgent && clip.text && this.active && !this.active.task.clip.text) this.active.controller.abort();
    this.pump();
    return pending;
  }
  private pump() {
    if (this.disposed || this.active || !this.settings.enabled) return;
    const available = (t: Download) => this.allowed(t.clip) &&
      (!this.backgroundPaused || (t.urgent && !!t.clip.text));
    let index = this.queue.findIndex(
      (t) => available(t) && t.urgent && t.clip.text,
    );
    if (index < 0) index = this.queue.findIndex((t) => available(t) && t.urgent);
    if (index < 0) index = this.queue.findIndex(available);
    if (index < 0) return;
    const [task] = this.queue.splice(index, 1);
    const controller = new AbortController();
    this.active = { task, controller };
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 15000);
    fetch(task.clip.src, { signal: controller.signal, cache: "force-cache" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Audio HTTP ${response.status}`);
        const bytes = await response.arrayBuffer();
        if (!bytes.byteLength || bytes.byteLength > 2 * 1024 * 1024) throw new Error("Invalid audio size");
        if (
          !this.disposed &&
          !controller.signal.aborted &&
          this.desired.has(task.clip.src)
        ) this.encoded.set(task.clip.src, bytes);
        // Effort sounds need to be decoded before the hit, with no later speech queue.
        if (this.context && Object.values(AUDIO.effort || {}).some((pool) => pool.some((clip) => clip.src === task.clip.src))) this.buffer(task.clip).catch(() => {});
      })
      .catch(() => {
        if (timedOut || !controller.signal.aborted) this.failures.add(task.clip.src);
      })
      .finally(() => {
        clearTimeout(timeout);
        if (this.active?.task === task) this.active = null;
        this.downloads.delete(task.clip.src);
        task.resolve();
        if (
          controller.signal.aborted &&
          !timedOut &&
          !this.disposed &&
          this.allowed(task.clip) &&
          this.desired.has(task.clip.src)
        ) this.download(task.clip, task.urgent);
        this.pump();
      });
  }
  private async buffer(clip: AudioClip): Promise<AudioBuffer | null> {
    if (!this.context || this.disposed || !this.allowed(clip)) return null;
    await this.download(clip, true);
    if (!this.context || this.disposed || !this.allowed(clip)) return null;
    const existing = this.decoded.get(clip.src);
    if (existing) return existing;
    const decoding = this.decoding.get(clip.src);
    if (decoding) return decoding;
    const bytes = this.encoded.get(clip.src);
    if (!bytes) return null;
    const pending = this.context
      .decodeAudioData(bytes.slice(0))
      .then((buffer) => {
        if (this.disposed || !this.desired.has(clip.src)) return null;
        this.decoded.set(clip.src, buffer);
        return buffer;
      })
      .catch(() => {
        this.failures.add(clip.src);
        return null;
      })
      .finally(() => {
        this.decoding.delete(clip.src);
      });
    this.decoding.set(clip.src, pending);
    return pending;
  }
  private playMusic() {
    if (
      !this.context ||
      this.disposed ||
      this.paused ||
      !this.settings.enabled ||
      !this.settings.music ||
      this.music?.kind === this.scene ||
      this.loadingMusic === this.scene
    ) return;
    const kind = this.scene;
    const clip = AUDIO.music[kind];
    if (this.failures.has(clip.src) || !this.desired.has(clip.src)) return;
    this.loadingMusic = kind;
    this.buffer(clip).then((buffer) => {
      if (this.loadingMusic === kind) this.loadingMusic = "";
      if (
        !buffer ||
        !this.context ||
        this.disposed ||
        this.paused ||
        !this.settings.enabled ||
        !this.settings.music ||
        this.scene !== kind ||
        this.music?.kind === kind
      ) return;
      const source = this.context.createBufferSource();
      const gain = this.context.createGain();
      source.buffer = buffer;
      source.loop = !!clip.loop;
      source.connect(gain);
      gain.connect(this.musicBus!);
      const track = { kind, source, gain, ended: false };
      this.music = track;
      gain.gain.setValueAtTime(0, this.context.currentTime);
      gain.gain.linearRampToValueAtTime(1, this.context.currentTime + 0.3);
      source.onended = () => {
        track.ended = true;
        source.disconnect();
        gain.disconnect();
      };
      source.start();
    });
  }
  private stopMusic() {
    this.loadingMusic = "";
    const track = this.music;
    this.music = null;
    if (!track || track.ended || !this.context) return;
    const now = this.context.currentTime;
    track.gain.gain.cancelScheduledValues(now);
    track.gain.gain.setValueAtTime(track.gain.gain.value, now);
    track.gain.gain.linearRampToValueAtTime(0, now + 0.12);
    track.source.stop(now + 0.13);
  }
  queueVoices(cues: VoiceCue[], tag: string) {
    if (tag === this.voiceTag) return;
    this.clearVoices();
    this.voiceTag = tag;
    if (!this.settings.enabled || !this.settings.voices) return;
    this.voiceQueue = cues.flatMap((cue) => {
      const clip = this.variants.pick(`${cue.character}:${cue.kind}`, audioVariants(AUDIO.voices[cue.character][cue.kind]), (item) => item.src);
      return clip ? [{ cue, clip }] : [];
    });
    this.playNextVoice();
  }
  private playNextVoice() {
    if (
      !this.context ||
      this.disposed ||
      this.paused ||
      !this.settings.enabled ||
      !this.settings.voices ||
      this.voice ||
      this.pendingVoice
    ) return;
    const selected = this.voiceQueue.shift();
    if (!selected) {
      this.duck(this.cinemaDialogue);
      return;
    }
    const { cue, clip } = selected;
    const serial = this.voiceSerial;
    this.pendingVoice = cue;
    this.voiceDeadline = performance.now() + 3000;
    this.buffer(clip).then((buffer) => {
      if (this.disposed || serial !== this.voiceSerial) return;
      this.pendingVoice = null;
      if (this.paused) {
        this.voiceQueue.unshift(selected);
        return;
      }
      if (
        !buffer ||
        !this.context ||
        !this.settings.enabled ||
        !this.settings.voices ||
        performance.now() > this.voiceDeadline
      ) {
        this.playNextVoice();
        return;
      }
      const source = this.context.createBufferSource();
      source.buffer = buffer;
      source.connect(this.voiceBus!);
      this.voice = { cue, clip, source };
      this.duck(true);
      source.onended = () => {
        source.disconnect();
        if (serial !== this.voiceSerial) return;
        this.voice = null;
        this.playNextVoice();
      };
      source.start();
    });
  }
  private duck(voice: boolean) {
    if (!this.musicBus || !this.context) return;
    const now = this.context.currentTime;
    this.musicBus.gain.cancelScheduledValues(now);
    const level = this.settings.music ? (voice && this.settings.voices ? 0.1 : 0.38) : 0;
    this.musicBus.gain.setTargetAtTime(level, now, voice ? 0.06 : 0.2);
  }
  clearVoices() {
    this.voiceSerial++;
    this.voiceQueue = [];
    this.pendingVoice = null;
    this.voiceTag = "";
    for (const task of this.queue) if (task.clip.text) task.urgent = false;
    if (this.active?.task.clip.text && this.active.task.urgent) {
      this.active.task.urgent = false;
      if (this.backgroundPaused) this.active.controller.abort();
    }
    if (this.voice) {
      this.voice.source.onended = null;
      this.voice.source.stop();
      this.voice.source.disconnect();
      this.voice = null;
    }
    this.duck(this.cinemaDialogue);
  }
  resetMatch() {
    this.lastEvent = 0;
    this.lastContact = 0;
    this.clearVoices();
    this.clearEffects();
  }
  private playEffort(character: Character, eventId: number) {
    if (!this.context || this.paused || !this.settings.enabled || !this.settings.voices) return;
    const clip = this.variants.pick(`${character}:effort`, AUDIO.effort?.[character] || [], (item) => item.src);
    if (!clip) return;
    const serial = this.effortSerial;
    const deadline = performance.now() + 120;
    const start = (buffer: AudioBuffer | null) => {
      if (!buffer || !this.context || this.disposed || this.paused || !this.settings.enabled || !this.settings.voices || serial !== this.effortSerial || performance.now() > deadline) return;
      const source = this.context.createBufferSource();
      const gain = this.context.createGain();
      source.buffer = buffer;
      gain.gain.value = this.voice || this.cinemaDialogue ? 0.28 : 0.65;
      source.connect(gain);
      gain.connect(this.voiceBus!);
      this.effort.add(source);
      this.effortPlayed++;
      this.lastEffort = { character, src: clip.src, eventId };
      source.onended = () => {
        this.effort.delete(source);
        source.disconnect();
        gain.disconnect();
      };
      source.start();
    };
    const ready = this.decoded.get(clip.src);
    if (ready) start(ready);
    else this.buffer(clip).then(start).catch(() => {});
  }
  private tone(
    frequency: number,
    duration: number,
    volume: number,
    delay = 0,
    type: OscillatorType = "sine",
  ) {
    if (
      !this.context ||
      this.disposed ||
      !this.settings.enabled ||
      this.paused ||
      this.context.state !== "running"
    ) return;
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
    gain.connect(this.master!);
    oscillator.start(now);
    oscillator.stop(now + duration);
    this.effects.add(oscillator);
    oscillator.onended = () => {
      this.effects.delete(oscillator);
      oscillator.disconnect();
      gain.disconnect();
    };
  }
  private clearEffects() {
    for (const effect of Array.from(this.effects)) effect.stop();
    this.effects.clear();
    this.clearEffort();
  }
  private clearEffort() {
    this.effortSerial++;
    for (const source of Array.from(this.effort)) source.stop();
    this.effort.clear();
  }
  event(event: GameEvent | null, characters: Character[] = [], contact = event) {
    if (contact && contact.id !== this.lastContact && ["hit", "serve", "spike"].includes(contact.type) && characters[contact.side]) {
      this.lastContact = contact.id;
      this.playEffort(characters[contact.side], contact.id);
    }
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
  snapshot() {
    const voice = this.voice?.cue;
    return {
      ...this.settings,
      unlocked: !!this.context,
      context: this.context?.state || "locked",
      paused: this.paused,
      scene: this.scene,
      musicPlaying:
        !!this.music &&
        !this.music.ended &&
        this.settings.enabled &&
        this.settings.music &&
        !this.paused && this.context?.state === "running",
      musicGain: this.musicBus?.gain.value || 0,
      voice: voice
        ? { ...voice, text: this.voice!.clip.text, src: this.voice!.clip.src }
        : null,
      voicePlaying:
        !!voice &&
        this.settings.enabled &&
        this.settings.voices &&
        !this.paused && this.context?.state === "running",
      pendingVoices: this.voiceQueue.length + (this.pendingVoice ? 1 : 0),
      cinemaDialogue: this.cinemaDialogue,
      effortPlayed: this.effortPlayed,
      lastEffort: this.lastEffort,
      loaded: this.encoded.size,
      decoded: this.decoded.size,
      queued: this.queue.length,
      fetching: this.active?.task.clip.src || null,
      bytes: Array.from(this.encoded.values()).reduce(
        (sum, bytes) => sum + bytes.byteLength,
        0,
      ),
      failures: Array.from(this.failures),
    };
  }
  dispose() {
    this.disposed = true;
    this.active?.controller.abort();
    for (const task of this.queue) task.resolve();
    this.queue = [];
    this.clearVoices();
    this.clearEffects();
    this.stopMusic();
    this.encoded.clear();
    this.decoded.clear();
    this.context?.close().catch(() => {});
    this.context = null;
  }
}
