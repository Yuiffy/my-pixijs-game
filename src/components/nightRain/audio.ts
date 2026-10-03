import voices from './voiceManifest.json';
import type { CompanionSkin } from './companion';
import type { GameState } from './types';
import { DUNGEONS, dungeonFoyer } from './dungeons';
import { weaponAttack } from './weapons';

export type AudioSettings = { music: number; effects: number; narration: number; muted: boolean };
type Track = 'exploration' | 'haven' | 'boss';
const ROOT = '/games/night-rain/audio/';
const VOICES: Record<string, string> = voices;
const DEFAULTS: AudioSettings = { music: 0.32, effects: 0.65, narration: 0.85, muted: false };
/** Streaming media stays off the simulation path. No runtime OS speech calls or synchronous decoding. */
export class NightAudio {
  settings = { ...DEFAULTS };
  unlocked = false;
  status = '';
  track: Track = 'exploration';
  voiceLine = '';
  events = 0;
  recent: string[] = [];
  private context: AudioContext | null = null;
  private decks: { audio: HTMLAudioElement; gain: GainNode; track: Track | null; pending: boolean }[] = [];
  private narration: HTMLAudioElement | null = null;
  private voiceGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private samples: Float32Array<ArrayBuffer> | null = null;
  private deck = 0;
  private lastFx = 0;
  private lastAction = '';
  private lastSwing = '';
  private lastMode = '';
  private stepAt = 0;
  private lastPosition: { x: number; z: number } | null = null;
  private lastProjectile = 0;
  private chainAt = -10;
  private windAt = -10;
  private quiet = false;
  private disposed = false;
  private voiceSerial = 0;
  private listeners: (() => void)[] = [];

  constructor(private root: HTMLElement) {
    try {
      const saved = JSON.parse(localStorage.getItem('night-rain-audio-v1') ?? '{}');
      for (const key of ['music', 'effects', 'narration'] as const) if (typeof saved[key] === 'number' && Number.isFinite(saved[key])) this.settings[key] = Math.max(0, Math.min(1, saved[key]));
      this.settings.muted = saved.muted === true;
    } catch { /* Audio remains usable without storage. */ }
    const unlock = (e: Event) => { if (e.isTrusted) this.unlock(); };
    root.addEventListener('pointerdown', unlock); window.addEventListener('keydown', unlock);
    const visibility = () => { if (document.hidden) this.suspend(); };
    document.addEventListener('visibilitychange', visibility);
    this.listeners.push(() => { root.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); document.removeEventListener('visibilitychange', visibility); });
  }
  unlock() {
    if (this.disposed) return;
    if (!this.context) {
      try {
        this.context = new AudioContext({ latencyHint: 'interactive' });
        this.analyser = this.context.createAnalyser(); this.analyser.fftSize = 256;
        this.samples = new Float32Array(new ArrayBuffer(256 * 4));
        this.analyser.connect(this.context.destination);
        this.decks = [0, 1].map(() => {
          const audio = new Audio(); audio.loop = true; audio.preload = 'none';
          const gain = this.context!.createGain(); gain.gain.value = 0;
          this.context!.createMediaElementSource(audio).connect(gain); gain.connect(this.analyser!);
          audio.onerror = () => { this.status = '音乐暂不可用，可以继续探索'; };
          return { audio, gain, track: null, pending: false };
        });
        this.narration = new Audio(); this.narration.preload = 'none';
        this.voiceGain = this.context.createGain();
        this.context.createMediaElementSource(this.narration).connect(this.voiceGain); this.voiceGain.connect(this.analyser);
        this.narration.onended = () => { this.voiceLine = ''; this.volumes(); };
        this.narration.onerror = () => { this.voiceLine = ''; this.status = '这句旁白暂不可用，字幕仍然保留'; this.volumes(); };
      } catch { this.status = '音频暂不可用，字幕仍然保留'; return; }
    }
    this.context.resume().then(() => {
      if (this.disposed) return;
      this.unlocked = this.context?.state === 'running';
      if (this.unlocked) { this.status = ''; this.volumes(); }
    }).catch(() => { this.status = '点击画面或按键启用声音'; });
  }
  setSettings(settings: Partial<AudioSettings>) {
    this.settings = { ...this.settings, ...settings };
    try { localStorage.setItem('night-rain-audio-v1', JSON.stringify(this.settings)); } catch { /* Keep session values. */ }
    if (this.settings.muted || this.settings.narration === 0) this.cancelVoice();
    this.volumes();
  }
  private volumes() {
    if (!this.context) return;
    const now = this.context.currentTime; const muted = this.settings.muted || document.hidden;
    this.decks.forEach((deck, i) => deck.gain.gain.setTargetAtTime(muted || i !== this.deck ? 0 : this.settings.music * (this.quiet ? 0.28 : 1) * (this.voiceLine ? 0.4 : 1), now, 0.3));
    this.voiceGain?.gain.setTargetAtTime(muted ? 0 : this.settings.narration, now, 0.02);
  }
  private music(next: Track) {
    this.track = next;
    if (!this.unlocked || !this.decks.length || document.hidden) return;
    if (this.decks[this.deck].track !== next) {
      this.deck = 1 - this.deck;
      const deck = this.decks[this.deck]; deck.audio.pause(); deck.audio.src = `${ROOT}${next}.mp3`; deck.track = next;
      this.playDeck(deck);
      this.volumes();
    } else if (this.decks[this.deck].audio.paused && !this.settings.muted) this.playDeck(this.decks[this.deck]);
    // The other deck fades to zero, then remains paused without another task/timer.
    const old = this.decks[1 - this.deck];
    if (old.gain.gain.value < 0.001) old.audio.pause();
  }
  private playDeck(deck: (typeof this.decks)[number]) {
    if (deck.pending || deck.audio.error) return;
    deck.pending = true;
    deck.audio.play().catch(() => { this.status = '点击画面或按键启用声音'; }).finally(() => { deck.pending = false; });
  }
  say(text: string, skin: CompanionSkin) {
    this.cancelVoice();
    if (!this.unlocked || this.settings.muted || !this.settings.narration || !this.narration || document.hidden) return;
    const id = VOICES[text];
    if (!id) { this.status = '这句以字幕显示'; return; }
    const serial = ++this.voiceSerial;
    this.voiceLine = text; this.narration.src = `${ROOT}voice/${id}.mp3`;
    this.narration.playbackRate = skin === 'otter' ? 1.02 : 1.12;
    this.volumes(); this.event('voice');
    this.narration.play().catch(() => { if (serial === this.voiceSerial) { this.voiceLine = ''; this.status = '点击画面或按键启用旁白'; this.volumes(); } });
  }
  cancelVoice() { this.voiceSerial += 1; this.narration?.pause(); this.voiceLine = ''; this.volumes(); }
  private event(name: string) { this.events += 1; this.recent.push(name); if (this.recent.length > 12) this.recent.shift(); }
  sound(name: string) {
    if (!this.context || !this.unlocked || this.quiet || document.hidden || this.settings.muted || !this.settings.effects) return;
    const pitches: Record<string, [number, number, number]> = { light: [480, 100, 0.1], heavy: [240, 45, 0.22], hit: [160, 60, 0.1], parry: [1800, 640, 0.3], block: [720, 260, 0.16], dodge: [280, 100, 0.12], jump: [190, 350, 0.13], heal: [380, 900, 0.45], pickup: [880, 1320, 0.38], lamp: [440, 880, 0.7], death: [160, 35, 0.8], step: [90, 50, 0.035], menu: [600, 750, 0.07], shot: [1100, 200, 0.16] };
    const [from, to, duration] = name === 'chain' ? [960, 370, 0.12] : name === 'wind' ? [145, 210, 1.5] : pitches[name] ?? pitches.hit; const now = this.context.currentTime;
    const osc = this.context.createOscillator(); const gain = this.context.createGain();
    osc.type = name === 'parry' || name === 'block' ? 'triangle' : 'sine'; osc.frequency.setValueAtTime(from, now); osc.frequency.exponentialRampToValueAtTime(to, now + duration);
    gain.gain.setValueAtTime(0.0001, now); gain.gain.exponentialRampToValueAtTime(this.settings.effects * (name === 'step' || name === 'wind' ? 0.04 : name === 'chain' ? 0.075 : 0.15), now + (name === 'wind' ? 0.5 : 0.005)); gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain); gain.connect(this.analyser!); osc.start(); osc.stop(now + duration + 0.01);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); }; this.event(name);
  }
  observe(s: GameState) {
    const quiet = s.paused || s.mode === 'title' || s.mode === 'dead';
    if (this.quiet !== quiet) { this.quiet = quiet; this.volumes(); if (quiet) this.cancelVoice(); }
    const combat = s.enemies.some(e => e.hp > 0 && e.aggro && ['boss', 'nana', 'azi', 'captain', 'regent', 'warden', 'abbot', 'serpent', 'elegist', 'colossus', 'sentinel'].includes(e.kind));
    this.music(combat ? 'boss' : s.mode === 'interlude' || s.region.includes('归灯庭') ? 'haven' : 'exploration');
    const { action } = s.player;
    if (action !== this.lastAction && ['dodge', 'heal'].includes(action)) this.sound(action);
    if (s.player.attack && ['light', 'heavy'].includes(action)) {
      const spec = weaponAttack(s, s.player.attack); const token = `${s.player.attack}:${s.player.comboUntil}`;
      if (token !== this.lastSwing && s.player.actionTime >= spec.impact - Math.min(0.12, spec.impact * 0.35)) { this.sound(action); this.lastSwing = token; }
    }
    if (s.mode === 'dead' && this.lastMode !== 'dead') { const quietBefore = this.quiet; this.quiet = false; this.sound('death'); this.quiet = quietBefore; }
    this.lastAction = action; this.lastMode = s.mode;
    if (s.liftRide && s.time - this.chainAt > 0.65) { this.sound('chain'); this.chainAt = s.time; }
    const mouth = DUNGEONS.cave.upper;
    if (!s.liftRide && s.time - this.windAt > 2.4 && Math.abs(s.player.y - mouth.y) < 2 && (dungeonFoyer(s.player) === 'cave' || Math.hypot(s.player.x - mouth.x, s.player.z - mouth.z) < 11)) { this.sound('wind'); this.windAt = s.time; }
    for (const fx of s.effects) if (fx.id > this.lastFx) {
      this.lastFx = fx.id;
      this.sound(fx.kind === 'reward' ? fx.text ? 'pickup' : 'lamp' : fx.kind === 'parry' && !fx.text ? 'heavy' : fx.kind);
    }
    for (const shot of s.projectiles) if (shot.id > this.lastProjectile) { this.lastProjectile = shot.id; this.sound('shot'); }
    const moved = this.lastPosition && Math.hypot(s.player.x - this.lastPosition.x, s.player.z - this.lastPosition.z) > 0.002;
    if (action === 'idle' && moved && s.player.jumpHeight === 0 && s.time - this.stepAt > 0.32) { this.sound('step'); this.stepAt = s.time; }
    this.lastPosition = { x: s.player.x, z: s.player.z };
  }
  snapshot() {
    let rms = 0;
    if (this.analyser && this.samples) { this.analyser.getFloatTimeDomainData(this.samples); rms = Math.sqrt(this.samples.reduce((sum, v) => sum + v * v, 0) / this.samples.length); }
    return { unlocked: this.unlocked, context: this.context?.state ?? 'locked', track: this.track, voiceLine: this.voiceLine, settings: this.settings, events: this.events, recent: this.recent, rms, status: this.status };
  }
  suspend() { this.decks.forEach(d => d.audio.pause()); this.cancelVoice(); }
  reset() { this.lastFx = 0; this.lastProjectile = 0; this.chainAt = -10; this.windAt = -10; this.lastPosition = null; this.lastAction = ''; this.lastSwing = ''; this.lastMode = ''; this.cancelVoice(); }
  dispose() { this.disposed = true; this.listeners.forEach(fn => fn()); this.suspend(); this.decks.forEach(d => { d.audio.removeAttribute('src'); d.audio.load(); }); this.narration?.removeAttribute('src'); this.context?.close().catch(() => {}); }
}
