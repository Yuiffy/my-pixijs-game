export const PRE_STREAM_TRACKS = [
  { id: 'waiting-op', title: 'おねんねたいむは、くまさんと', src: '/games/pre-stream/waiting-op.mp3' },
] as const;

const FADE_MS = 2000;
type Track = typeof PRE_STREAM_TRACKS[number];

export type PreStreamAudioState = Readonly<{
  trackId: Track['id'] | null;
  trackTitle: string | null;
  requested: boolean;
  playing: boolean;
  fading: boolean;
  muted: boolean;
  volume: number;
  effectiveVolume: number;
  currentTime: number;
  readyState: number;
  blocked: boolean;
  voiceActive: boolean;
  voiceScheduledCount: number;
  loop: boolean;
  disposed: boolean;
}>;

export type PreStreamAudio = {
  playWaiting: () => void;
  stopWaiting: () => void;
  setVolume: (value: number) => void;
  setMuted: (value: boolean) => void;
  speakLiveStart: () => void;
  getState: () => PreStreamAudioState;
  dispose: () => void;
};

export function createPreStreamAudio(options: { random?: () => number } = {}): PreStreamAudio {
  let media: HTMLAudioElement | null = null;
  let track: Track | null = null;
  let context: AudioContext | null = null;
  let voiceMaster: GainNode | null = null;
  let utterance: SpeechSynthesisUtterance | null = null;
  let requested = false;
  let muted = false;
  let disposed = false;
  let blocked = false;
  let fading = false;
  let volume = 0.38;
  let fadeFactor = 1;
  let fadeStarted = 0;
  let fadeTimer: ReturnType<typeof setInterval> | null = null;
  let voiceTimer: ReturnType<typeof setTimeout> | null = null;
  let voiceActive = false;
  let voiceScheduledCount = 0;
  let playGeneration = 0;
  let voiceGeneration = 0;
  const oscillators = new Set<OscillatorNode>();
  const random = options.random || Math.random;

  const unlockContext = () => {
    if (typeof window === 'undefined' || !window.AudioContext) return;
    try {
      if (!context) {
        context = new AudioContext();
        voiceMaster = context.createGain();
        voiceMaster.gain.value = muted ? 0 : volume;
        voiceMaster.connect(context.destination);
      }
      if (context.state === 'suspended') context.resume().catch(() => {});
    } catch { /* Music can still play when Web Audio is unavailable. */ }
  };

  const applyVolume = () => {
    if (media) media.volume = muted ? 0 : volume * fadeFactor;
    if (context && voiceMaster) voiceMaster.gain.value = muted ? 0 : volume;
    if (utterance) utterance.volume = muted ? 0 : volume;
  };

  const clearFade = () => {
    if (fadeTimer !== null) clearInterval(fadeTimer);
    fadeTimer = null;
    fading = false;
  };

  const cancelVoice = () => {
    voiceGeneration += 1;
    voiceActive = false;
    if (voiceTimer !== null) clearTimeout(voiceTimer);
    voiceTimer = null;
    if (utterance && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    utterance = null;
    oscillators.forEach(oscillator => {
      try { oscillator.stop(); } catch { /* The scheduled sound may have ended already. */ }
    });
    oscillators.clear();
    if (context && voiceMaster) voiceMaster.gain.setValueAtTime(0, context.currentTime);
  };

  const resumeMusic = () => {
    if (!media || muted || disposed || !requested) return;
    const generation = ++playGeneration;
    const element = media;
    applyVolume();
    const playback = element.play();
    if (playback) {
      playback.then(() => {
        if (muted || disposed || (!requested && !fading)) {
          element.pause();
          return;
        }
        if (generation === playGeneration) blocked = false;
      }).catch(() => {
        if (generation === playGeneration && requested && !muted && !disposed) blocked = true;
      });
    }
  };

  const playWaiting = () => {
    if (disposed || typeof window === 'undefined') return;
    unlockContext();
    if (!requested) {
      clearFade();
      cancelVoice();
      const value = random();
      const normalized = Number.isFinite(value) ? Math.max(0, Math.min(0.999999, value)) : 0;
      track = PRE_STREAM_TRACKS[Math.floor(normalized * PRE_STREAM_TRACKS.length)];
      if (!media) {
        media = new Audio();
        media.preload = 'auto';
        media.loop = true;
      }
      media.pause();
      media.src = track.src;
      media.currentTime = 0;
      requested = true;
      blocked = false;
      fadeFactor = 1;
    }
    if (media?.paused) resumeMusic();
  };

  const stopWaiting = () => {
    if (disposed || !requested) return;
    requested = false;
    playGeneration += 1;
    clearFade();
    if (!media || media.paused || muted) {
      media?.pause();
      fadeFactor = 0;
      applyVolume();
      return;
    }
    fadeStarted = performance.now();
    fading = true;
    fadeTimer = setInterval(() => {
      fadeFactor = Math.max(0, 1 - (performance.now() - fadeStarted) / FADE_MS);
      applyVolume();
      if (fadeFactor <= 0 || muted || disposed) {
        media?.pause();
        clearFade();
      }
    }, 25);
  };

  const setVolume = (value: number) => {
    if (disposed || !Number.isFinite(value)) return;
    volume = Math.max(0, Math.min(1, value));
    applyVolume();
    if (volume === 0) cancelVoice();
  };

  const setMuted = (value: boolean) => {
    if (disposed || value === muted) return;
    muted = value;
    if (muted) {
      playGeneration += 1;
      media?.pause();
      clearFade();
      if (!requested) fadeFactor = 0;
      cancelVoice();
    } else if (requested) {
      fadeFactor = 1;
      unlockContext();
      resumeMusic();
    }
    applyVolume();
  };

  const speakLiveStart = () => {
    if (disposed || muted || volume <= 0 || typeof window === 'undefined') return;
    cancelVoice();
    const generation = voiceGeneration;
    voiceActive = true;
    let scheduled = false;
    const recordSchedule = () => {
      if (!scheduled) voiceScheduledCount += 1;
      scheduled = true;
    };
    try {
      if (window.AudioContext) {
        unlockContext();
      }
      if (context && voiceMaster) {
        voiceMaster.gain.value = volume;
        const cueContext = context;
        const cueMaster = voiceMaster;
        const cue = () => {
          if (disposed || muted || generation !== voiceGeneration) return;
          recordSchedule();
          const now = cueContext.currentTime;
          [523.25, 783.99, 1046.5].forEach((frequency, index) => {
            const oscillator = cueContext.createOscillator();
            const envelope = cueContext.createGain();
            const start = now + index * 0.115;
            oscillator.type = 'square';
            oscillator.frequency.setValueAtTime(frequency, start);
            envelope.gain.setValueAtTime(0, start);
            envelope.gain.linearRampToValueAtTime(0.055, start + 0.008);
            envelope.gain.exponentialRampToValueAtTime(0.0001, start + 0.19);
            oscillator.connect(envelope);
            envelope.connect(cueMaster);
            oscillators.add(oscillator);
            oscillator.onended = () => {
              oscillators.delete(oscillator);
              oscillator.disconnect();
              envelope.disconnect();
            };
            oscillator.start(start);
            oscillator.stop(start + 0.21);
          });
        };
        if (cueContext.state === 'suspended') cueContext.resume().then(cue).catch(() => {});
        else cue();
      }
      if ('speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined') {
        const line = new SpeechSynthesisUtterance('开播啦！');
        line.lang = 'zh-CN';
        line.rate = 1.12;
        line.pitch = 1.13;
        line.volume = volume;
        const chineseVoice = window.speechSynthesis.getVoices().find(voice => voice.lang.toLowerCase().startsWith('zh'));
        if (chineseVoice) line.voice = chineseVoice;
        const finishVoice = () => {
          if (generation === voiceGeneration) {
            voiceActive = false;
            utterance = null;
          }
        };
        line.onend = finishVoice;
        line.onerror = finishVoice;
        utterance = line;
        window.speechSynthesis.speak(line);
        recordSchedule();
      }
    } catch { /* Audio is optional when browser policy or device access blocks it. */ }
    voiceTimer = setTimeout(() => {
      if (generation === voiceGeneration) {
        voiceActive = false;
        voiceTimer = null;
      }
    }, 4000);
  };

  const getState = (): PreStreamAudioState => Object.freeze({
    trackId: track?.id || null,
    trackTitle: track?.title || null,
    requested,
    playing: Boolean(media && !media.paused && !muted && !disposed && (requested || fading)),
    fading,
    muted,
    volume,
    effectiveVolume: media?.volume || 0,
    currentTime: media?.currentTime || 0,
    readyState: media?.readyState || 0,
    blocked,
    voiceActive,
    voiceScheduledCount,
    loop: media?.loop || false,
    disposed,
  });

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    requested = false;
    playGeneration += 1;
    clearFade();
    cancelVoice();
    if (media) {
      media.pause();
      media.removeAttribute('src');
      media.load();
      media = null;
    }
    if (context) context.close().catch(() => {});
    context = null;
    voiceMaster = null;
  };

  return { playWaiting, stopWaiting, setVolume, setMuted, speakLiveStart, getState, dispose };
}
