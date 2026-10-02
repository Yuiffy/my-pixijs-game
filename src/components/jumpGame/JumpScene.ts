import Phaser from "phaser";
import {
  createJump,
  emptyInput,
  HEIGHT,
  heightScore,
  Input,
  JumpState,
  pauseJump,
  stepJump,
  WIDTH,
} from "./engine";

export interface JumpBridge {
  state: JumpState;
  input: Input;
  scene: JumpScene | null;
  onChange: () => void;
  loaded: boolean;
  failed: boolean;
}

export default class JumpScene extends Phaser.Scene {
  bridge: JumpBridge;
  art!: Phaser.GameObjects.Graphics;
  bird!: Phaser.GameObjects.Image;
  labels: Phaser.GameObjects.Text[] = [];
  manual = false;
  accumulator = 0;
  reduced = false;
  constructor(bridge: JumpBridge) {
    super("JumpScene");
    this.bridge = bridge;
  }
  preload() {
    this.load.image("jump-bird", "/images/sui-bird-jump.png");
    this.load.once("loaderror", () => {
      this.bridge.failed = true;
      this.bridge.onChange();
    });
  }
  create() {
    this.art = this.add.graphics();
    this.bird = this.add.image(400, 500, "jump-bird").setDisplaySize(82, 59);
    for (let i = 0; i < 12; i++) this.labels.push(
        this.add
          .text(0, 0, "", {
            fontFamily: "sans-serif",
            fontSize: "17px",
            color: "#41645c",
          })
          .setOrigin(0.5),
      );
    this.reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    this.bridge.scene = this;
    this.bridge.loaded = true;
    this.bridge.onChange();
    this.draw();
  }
  restart(seed: number) {
    this.bridge.state = createJump(seed);
    this.bridge.state.phase = "playing";
    this.bridge.input = emptyInput();
    this.accumulator = 0;
    this.bridge.onChange();
    this.draw();
  }
  pause() {
    pauseJump(this.bridge.state);
    this.bridge.input = emptyInput();
    this.accumulator = 0;
    this.bridge.onChange();
  }
  advance(ms: number) {
    if (!Number.isFinite(ms) || ms <= 0) return;
    this.accumulator += Math.min(ms, 60000) / 1000;
    while (this.accumulator >= 1 / 120) {
      stepJump(this.bridge.state, this.bridge.input, 1 / 120);
      this.accumulator -= 1 / 120;
    }
    this.draw();
    this.bridge.onChange();
  }
  update(_time: number, delta: number) {
    if (!this.manual) this.advance(Math.min(delta, 50));
  }
  draw() {
    const { state } = this.bridge;
    const g = this.art;
    if (!g) return;
    g.clear();
    g.fillGradientStyle(0xe6f0e9, 0xe6f0e9, 0xf8f3e6, 0xf8f3e6, 1);
    g.fillRect(0, 0, WIDTH, HEIGHT);
    g.fillStyle(0xf5d58c, 0.8);
    g.fillCircle(657, 116, 61);
    // Distant islands move slower than the platforms, keeping height readable.
    for (let i = 0; i < 6; i++) {
      const x = (i * 179 + 80) % WIDTH;
      const y = ((((i * 157 - state.camera * 0.16) % 740) + 740) % 740) - 70;
      g.fillStyle(0xffffff, 0.65);
      g.fillEllipse(x, y, 146, 21);
      g.fillEllipse(x - 20, y - 9, 74, 30);
      g.fillStyle(0xb4cfbf, 0.27);
      g.fillTriangle(x - 100, y + 190, x + 110, y + 190, x + 24, y + 70);
    }
    this.labels.forEach((label) => label.setVisible(false));
    state.platforms.forEach((platform, index) => {
      const y = platform.y - state.camera;
      if (y < -35 || y > HEIGHT + 30) return;
      const milestone = platform.id > 0 && platform.id % 10 === 0;
      g.fillStyle(0x648c7b, 0.12);
      g.fillRoundedRect(
        platform.x - platform.width / 2 + 4,
        y + 8,
        platform.width,
        25,
        10,
      );
      g.fillStyle(milestone ? 0xbd9651 : 0x689784);
      g.fillRoundedRect(
        platform.x - platform.width / 2,
        y,
        platform.width,
        22,
        8,
      );
      g.fillStyle(milestone ? 0xf1d997 : 0xd0e2bb);
      g.fillRoundedRect(
        platform.x - platform.width / 2,
        y,
        platform.width,
        6,
        3,
      );
      if (this.labels[index]) this.labels[index]
          .setPosition(platform.x, y + 39)
          .setText(platform.id === 0 ? "起点" : `${platform.id}`)
          .setVisible(true);
    });
    const birdY = state.y - state.camera - 29;
    if (state.dashTime > 0 && !this.reduced) {
      for (let i = 1; i <= 4; i++) {
        g.fillStyle(0xe8b65d, 0.5 / i);
        g.fillEllipse(
          state.x - state.facing * i * 24,
          birdY,
          70 - i * 8,
          30 - i * 4,
        );
      }
    }
    this.bird.setPosition(state.x, birdY).setFlipX(state.facing > 0);
    this.bird.setAngle(
      this.reduced
        ? 0
        : state.dashTime > 0
          ? state.facing * 12
          : Math.max(-8, Math.min(8, state.vy / 90)) * state.facing,
    );
    this.bird.setTint(state.dashTime > 0 ? 0xffdf80 : 0xffffff);
  }
}

export function describeJump(bridge: JumpBridge) {
  const s = bridge.state;
  return JSON.stringify({
    coordinates:
      "800x600; x right, y down; player y is feet; platform y is top; subtract camera for screen y",
    phase: s.phase,
    seed: s.seed,
    loaded: bridge.loaded,
    height: heightScore(s),
    floor: s.floor,
    elapsed: s.elapsed,
    camera: s.camera,
    player: {
      x: s.x,
      y: s.y,
      vx: s.vx,
      vy: s.vy,
      grounded: s.grounded,
      facing: s.facing,
      dashTime: s.dashTime,
      cooldown: s.cooldown,
    },
    platforms: s.platforms,
    input: bridge.input,
  });
}
