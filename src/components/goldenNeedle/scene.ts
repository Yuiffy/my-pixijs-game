import { advance, GameState, HEIGHT, WIDTH } from "./engine";
import { paint } from "./paint";

export default async function mountScene(
  host: HTMLDivElement,
  state: () => GameState,
  update: () => void,
) {
  const { default: Phaser } = await import("phaser");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let manual = false;
  let redraw: (() => void) | null = null;
  let lastHud = 0;
  const game = new Phaser.Game({
    type: Phaser.CANVAS,
    parent: host,
    width: WIDTH,
    height: HEIGHT,
    backgroundColor: "#24574c",
    audio: { noAudio: true },
    banner: false,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: {
      create() {
        const texture = this.textures.createCanvas(
          "needle-art",
          WIDTH * 2,
          HEIGHT * 2,
        );
        if (!texture) return;
        const context = texture.getContext();
        context.scale(2, 2);
        this.add
          .image(0, 0, "needle-art")
          .setOrigin(0)
          .setDisplaySize(WIDTH, HEIGHT);
        redraw = () => {
          paint(context, state(), reduced);
          texture.refresh();
        };
        redraw();
        this.game.canvas.setAttribute(
          "aria-label",
          "黄金微针操作台：按住拖动工具，微针在金色时机松开",
        );
        this.game.canvas.dataset.gameCanvas = "golden-needle";
      },
      update(_time: number, delta: number) {
        if (!manual) advance(state(), Math.min(delta / 1000, 0.05));
        redraw?.();
        lastHud += delta;
        if (lastHud >= 75) {
          update();
          lastHud = 0;
        }
      },
    },
  });
  return {
    game,
    advanceTime(ms: number) {
      manual = true;
      advance(state(), ms / 1000);
      redraw?.();
      update();
    },
    resumeClock() {
      manual = false;
    },
    destroy() {
      game.destroy(true);
    },
  };
}
