import Phaser from "phaser";
import { UNIT_DEFS } from "../core/gameData";

export const textureKeyForUnit = (unitId: string) => `rift-unit:${unitId}`;

export const preloadUnitPortraits = (scene: Phaser.Scene) => {
  Object.values(UNIT_DEFS).forEach((unit) => {
    if (!unit.portrait) return;
    const key = textureKeyForUnit(unit.id);
    if (!scene.textures.exists(key)) scene.load.image(key, unit.portrait);
  });
};

export const createFallbackTextures = (scene: Phaser.Scene) => {
  if (scene.textures.exists("rift-fallback-unit")) return;
  const graphics = scene.make.graphics({ x: 0, y: 0 });
  graphics.fillStyle(0x263f54, 1);
  graphics.fillCircle(32, 32, 30);
  graphics.lineStyle(3, 0x8edfff, 1);
  graphics.strokeCircle(32, 32, 29);
  graphics.generateTexture("rift-fallback-unit", 64, 64);
  graphics.destroy();
};
