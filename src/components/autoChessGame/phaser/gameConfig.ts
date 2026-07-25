import Phaser from "phaser";
import { WORLD_HEIGHT, WORLD_WIDTH } from "./layout";
import { RiftLineScene } from "./RiftLineScene";
import type { EngineBridge } from "./EngineBridge";

export const createGameConfig = (
  parent: HTMLElement,
  bridge: EngineBridge,
): Phaser.Types.Core.GameConfig => ({
  type: Phaser.AUTO,
  parent,
  width: WORLD_WIDTH,
  height: WORLD_HEIGHT,
  backgroundColor: "#07121d",
  fps: {
    // High-refresh phones otherwise run the full simulation and every dynamic
    // Text/Graphics sync at 90-120 Hz with no gameplay benefit.
    target: 60,
    limit: 60,
    smoothStep: true,
  },
  render: {
    // The host owns the high-density backing size. Keep vector edges and
    // texture downsampling smooth when the backing canvas is shown at CSS size.
    antialias: true,
    antialiasGL: true,
    pixelArt: false,
    roundPixels: false,
  },
  input: {
    windowEvents: true,
  },
  scale: {
    // The React host explicitly separates backing pixels from CSS dimensions.
    // NONE prevents the scale manager from replacing that high-DPI buffer with
    // the parent's CSS-pixel size on its own resize pass.
    mode: Phaser.Scale.NONE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    parent,
  },
  scene: [new RiftLineScene(bridge)],
});
