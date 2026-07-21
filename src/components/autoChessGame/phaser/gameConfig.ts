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
  render: {
    // Phaser 4 has no game-level resolution field. Textures and text use their
    // own high-density backing surfaces; keep the renderer smoothly filtered.
    antialias: true,
    antialiasGL: true,
    pixelArt: false,
    roundPixels: false,
  },
  input: {
    windowEvents: true,
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    parent,
  },
  scene: [new RiftLineScene(bridge)],
});
