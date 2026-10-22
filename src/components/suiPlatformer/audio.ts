/** Small original score. Everything starts behind a user gesture. */
export default class SpringAudio {
  context: AudioContext | null = null;
  enabled = true;
  nextNote = 0;
  beat = 0;
  unlock() {
    if (!this.context) this.context = new AudioContext();
    if (this.context.state === "suspended") this.context.resume().catch(() => {});
  }
  tone(
    frequency: number,
    duration: number,
    volume = 0.04,
    type: OscillatorType = "sine",
    delay = 0,
  ) {
    if (!this.context || !this.enabled || this.context.state !== "running") return;
    const ctx = this.context;
    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }
  effect(event: string) {
    const notes: Record<string, number[]> = {
      jump: [330, 490],
      coin: [880, 1175],
      star: [523, 659, 784, 1047],
      checkpoint: [392, 523, 659],
      stomp: [220, 330],
      spring: [294, 440, 660],
      heart: [659, 784],
      hurt: [180, 110],
      arrow: [1800],
      cannon: [90],
      boom: [65],
      clear: [523, 659, 784, 1047, 784, 1047],
    };
    (notes[event] || []).forEach((n, i) => this.tone(
        n,
        0.14,
        event === "coin" ? 0.035 : 0.045,
        event === "hurt" ? "triangle" : "sine",
        i * 0.07,
      ),);
  }
  update(playing: boolean) {
    if (!playing || !this.enabled || !this.context) return;
    if (this.context.currentTime < this.nextNote) return;
    this.nextNote = this.context.currentTime + 0.29;
    const melody = [
      659, 0, 784, 880, 784, 659, 587, 0, 523, 0, 659, 784, 659, 587, 523, 0,
      440, 0, 523, 659, 784, 0, 659, 587, 523, 0, 587, 659, 523, 0, 392, 0,
    ];
    const n = melody[this.beat % melody.length];
    if (n) this.tone(n, 0.25, 0.012, "triangle");
    if (this.beat % 4 === 0) this.tone(
        [131, 110, 147, 98][Math.floor(this.beat / 8) % 4],
        0.55,
        0.018,
      );
    this.beat++;
  }
  destroy() {
    this.context?.close().catch(() => {});
  }
}
