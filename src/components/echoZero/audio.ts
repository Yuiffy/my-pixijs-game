/** Tiny procedural WebAudio layer — no asset downloads, no autoplay before user gesture. */

export type Sfx =
  | 'swing' | 'heavy' | 'hit' | 'hurt' | 'deflect' | 'deathblow'
  | 'heal' | 'checkpoint' | 'boss' | 'dodge' | 'ui' | 'lock';

export function createAudio() {
  let ctx: AudioContext | null = null;
  let muted = false;
  let rainGain: GainNode | null = null;
  let rainSource: AudioBufferSourceNode | null = null;

  const ensure = () => {
    if (muted) return null;
    if (!ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      try { ctx = new Ctor(); } catch { return null; }
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => undefined);
    return ctx;
  };

  const tone = (ac: AudioContext, freq: number, duration: number, type: OscillatorType, gain: number, slideTo?: number) => {
    const osc = ac.createOscillator();
    const env = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ac.currentTime);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), ac.currentTime + duration);
    env.gain.setValueAtTime(0.0001, ac.currentTime);
    env.gain.exponentialRampToValueAtTime(gain, ac.currentTime + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + duration);
    osc.connect(env).connect(ac.destination);
    osc.start();
    osc.stop(ac.currentTime + duration + 0.02);
  };

  const noise = (ac: AudioContext, duration: number, gain: number, cutoff: number, sweep?: number) => {
    const frames = Math.floor(ac.sampleRate * duration);
    const buffer = ac.createBuffer(1, frames, ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    const source = ac.createBufferSource();
    source.buffer = buffer;
    const filter = ac.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(cutoff, ac.currentTime);
    if (sweep) filter.frequency.exponentialRampToValueAtTime(Math.max(80, sweep), ac.currentTime + duration);
    filter.Q.value = 0.8;
    const env = ac.createGain();
    env.gain.setValueAtTime(gain, ac.currentTime);
    env.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + duration);
    source.connect(filter).connect(env).connect(ac.destination);
    source.start();
    source.stop(ac.currentTime + duration + 0.02);
  };

  const startRain = () => {
    const ac = ensure();
    if (!ac || rainSource) return;
    const frames = Math.floor(ac.sampleRate * 2);
    const buffer = ac.createBuffer(1, frames, ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i += 1) data[i] = (Math.random() * 2 - 1) * 0.6;
    const source = ac.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = ac.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1600;
    const gain = ac.createGain();
    gain.gain.value = 0.022;
    source.connect(filter).connect(gain).connect(ac.destination);
    source.start();
    rainSource = source;
    rainGain = gain;
  };

  const play = (kind: Sfx) => {
    const ac = ensure();
    if (!ac) return;
    switch (kind) {
      case 'swing': noise(ac, 0.17, 0.16, 2600, 700); break;
      case 'heavy': noise(ac, 0.3, 0.22, 1700, 380); tone(ac, 120, 0.2, 'triangle', 0.07, 60); break;
      case 'hit': noise(ac, 0.13, 0.26, 900, 250); tone(ac, 165, 0.14, 'square', 0.06, 70); break;
      case 'hurt': tone(ac, 90, 0.32, 'sawtooth', 0.11, 45); noise(ac, 0.2, 0.14, 500); break;
      case 'deflect':
        tone(ac, 1240, 0.24, 'sine', 0.16, 1860);
        tone(ac, 2480, 0.17, 'sine', 0.07, 3100);
        noise(ac, 0.11, 0.14, 4800);
        break;
      case 'deathblow':
        tone(ac, 62, 0.85, 'sine', 0.22, 32);
        noise(ac, 0.5, 0.2, 2200, 160);
        tone(ac, 880, 0.7, 'sine', 0.06, 220);
        break;
      case 'heal': tone(ac, 520, 0.4, 'sine', 0.08, 780); tone(ac, 780, 0.35, 'sine', 0.05, 1040); break;
      case 'checkpoint':
        [392, 523, 659, 784].forEach((f, i) => window.setTimeout(() => {
          const inner = ensure();
          if (inner) tone(inner, f, 0.65, 'sine', 0.07);
        }, i * 110));
        break;
      case 'boss': tone(ac, 48, 1.3, 'sawtooth', 0.18, 30); noise(ac, 1.1, 0.14, 340); break;
      case 'dodge': noise(ac, 0.19, 0.1, 900, 1900); break;
      case 'lock': tone(ac, 760, 0.09, 'sine', 0.045); break;
      default: tone(ac, 440, 0.07, 'sine', 0.035);
    }
  };

  const setMuted = (value: boolean) => {
    muted = value;
    if (rainGain) rainGain.gain.value = value ? 0 : 0.022;
  };

  return { play, start: startRain, setMuted, get muted() { return muted; } };
}
