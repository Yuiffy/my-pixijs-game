import type { Game } from "./types";

// Original, quiet synthesized ambience. There is no TTS or voice imitation.
export function createAudio() {
  let context: AudioContext | null = null;
  let gain: GainNode | null = null;
  let oscillator: OscillatorNode | null = null;
  let noise: AudioBufferSourceNode | null = null;
  let muted = false;
  const begin = () => {
    if (context) {
      context.resume().catch(() => {});
      return;
    }
    try {
      context = new AudioContext();
      gain = context.createGain();
      gain.gain.value = 0;
      gain.connect(context.destination);
      oscillator = context.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.value = 55;
      const tone = context.createGain();
      tone.gain.value = 0.035;
      oscillator.connect(tone);
      tone.connect(gain);
      oscillator.start();
      const buffer = context.createBuffer(
        1,
        context.sampleRate * 3,
        context.sampleRate,
      );
      const channel = buffer.getChannelData(0);
      let previous = 0;
      for (let i = 0; i < channel.length; i++) {
        previous = (previous + (Math.random() * 2 - 1) * 0.025) / 1.025;
        channel[i] = previous;
      }
      noise = context.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;
      const volume = context.createGain();
      volume.gain.value = 0.075;
      noise.connect(volume);
      volume.connect(gain);
      noise.start();
    } catch {
      context = null;
    }
  };
  const update = (g: Game) => {
    if (!context || !gain || !oscillator) return;
    const playing = g.mode === "playing" && g.panel === "none";
    gain.gain.setTargetAtTime(
      playing && !muted ? 0.5 : 0,
      context.currentTime,
      0.3,
    );
    oscillator.frequency.setTargetAtTime(
      g.stage === "chase" ? 46 : g.stage === "dawn" ? 110 : 55,
      context.currentTime,
      1,
    );
  };
  return {
    begin,
    update,
    mute: (value: boolean) => {
      muted = value;
    },
    dispose: () => {
      oscillator?.stop();
      noise?.stop();
      context?.close().catch(() => {});
      context = null;
    },
  };
}
