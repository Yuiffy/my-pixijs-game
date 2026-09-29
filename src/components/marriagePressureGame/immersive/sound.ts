// 沉浸版的提示音：全部用 WebAudio 合成，不加载音频文件，不使用语音合成
export type Cue = "message" | "send" | "tap" | "step" | "notify" | "cheer";

const CUES: Record<Cue, Array<[number, number]>> = {
  message: [[880, 0.06], [1320, 0.08]],
  send: [[660, 0.05]],
  tap: [[520, 0.03]],
  step: [[392, 0.08], [523, 0.1]],
  notify: [[740, 0.07], [988, 0.07], [1175, 0.1]],
  cheer: [[523, 0.08], [659, 0.08], [784, 0.14]],
};

let context: AudioContext | null = null;

export function playCue(cue: Cue, muted: boolean) {
  if (muted || typeof window === "undefined") return;
  try {
    context ??= new AudioContext();
    if (context.state === "suspended") context.resume().catch(() => undefined);
    let at = context.currentTime;
    for (const [frequency, duration] of CUES[cue]) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, at);
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.08, at + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(at);
      oscillator.stop(at + duration + 0.02);
      at += duration * 0.9;
    }
  } catch {
    // 浏览器不支持或禁止音频时静默忽略
  }
}
