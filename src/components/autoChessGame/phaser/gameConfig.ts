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
    antialias: true,
    pixelArt: false,
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    parent,
  },
  scene: [new RiftLineScene(bridge)],
});
