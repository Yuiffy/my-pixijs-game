import Phaser from "phaser";
import {
  getCharacterStyle,
  resolveUnitPortrait,
  type CharacterStyle,
} from "../core/characterStyle";
import { UNIT_DEFS } from "../core/gameData";

export const textureKeyForUnit = (
  unitId: string,
  style: CharacterStyle = getCharacterStyle(),
) => `rift-unit:${style}:${unitId}`;
export const SUMI_LITTLE_DRAGON_TEXTURE_KEY = "rift-projectile:sumi-little-dragon";
export const SUMI_LITTLE_DRAGON_CIRCLE_TEXTURE_KEY = "rift-projectile:sumi-little-dragon-circle";
export const HAZEL_MANQU_TEXTURE_KEY = "rift-transform:hazel-manqu";

export const preloadUnitPortraits = (
  scene: Phaser.Scene,
  styles: readonly CharacterStyle[] = [getCharacterStyle()],
) => {
  let queued = 0;
  styles.forEach((style) => Object.values(UNIT_DEFS).forEach((unit) => {
    const portrait = resolveUnitPortrait(unit.id, style);
    if (!portrait.portrait) return;
    const key = textureKeyForUnit(unit.id, style);
    if (!scene.textures.exists(key)) {
      scene.load.image(key, portrait.portrait);
      queued += 1;
    }
  }));
  if (!scene.textures.exists(SUMI_LITTLE_DRAGON_TEXTURE_KEY)) {
    scene.load.image(SUMI_LITTLE_DRAGON_TEXTURE_KEY, "/images/livers/sumi-little-dragon.jpg");
    queued += 1;
  }
  if (!scene.textures.exists(HAZEL_MANQU_TEXTURE_KEY)) {
    scene.load.image(HAZEL_MANQU_TEXTURE_KEY, "/images/livers/hazel-manqu.png");
    queued += 1;
  }
  return queued;
};

export const circularTextureKeyForUnit = (
  unitId: string,
  style: CharacterStyle = getCharacterStyle(),
) => `rift-unit-circle:${style}:${unitId}`;

const CIRCULAR_PORTRAIT_SIZE = 256;

export const createCircularPortraitTextures = (
  scene: Phaser.Scene,
  style: CharacterStyle = getCharacterStyle(),
) => {
  Object.values(UNIT_DEFS).forEach((unit) => {
    const portrait = resolveUnitPortrait(unit.id, style);
    if (portrait.portraitStyle === "sprite") return;
    const sourceKey = textureKeyForUnit(unit.id, style);
    const targetKey = circularTextureKeyForUnit(unit.id, style);
    if (!scene.textures.exists(sourceKey) || scene.textures.exists(targetKey)) return;

    const source = scene.textures.get(sourceKey).getSourceImage();
    if (!(source instanceof HTMLImageElement || source instanceof HTMLCanvasElement)) return;
    const sourceWidth = source.width;
    const sourceHeight = source.height;
    const cropSize = Math.min(sourceWidth, sourceHeight);
    const cropX = Math.max(0, (sourceWidth - cropSize) / 2);
    const remainingY = Math.max(0, sourceHeight - cropSize);
    const cropY = portrait.portraitFocus === "top" ? remainingY * 0.16 : remainingY / 2;
    const texture = scene.textures.createCanvas(targetKey, CIRCULAR_PORTRAIT_SIZE, CIRCULAR_PORTRAIT_SIZE);
    if (!texture) return;

    const context = texture.getContext();
    const inset = 3;
    context.clearRect(0, 0, CIRCULAR_PORTRAIT_SIZE, CIRCULAR_PORTRAIT_SIZE);
    context.save();
    context.beginPath();
    context.arc(CIRCULAR_PORTRAIT_SIZE / 2, CIRCULAR_PORTRAIT_SIZE / 2, CIRCULAR_PORTRAIT_SIZE / 2 - inset, 0, Math.PI * 2);
    context.clip();
    context.drawImage(
      source,
      cropX,
      cropY,
      cropSize,
      cropSize,
      inset,
      inset,
      CIRCULAR_PORTRAIT_SIZE - inset * 2,
      CIRCULAR_PORTRAIT_SIZE - inset * 2,
    );
    context.restore();
    texture.refresh();
  });
};

export const createCircularProjectileTextures = (scene: Phaser.Scene) => {
  if (scene.textures.exists(SUMI_LITTLE_DRAGON_CIRCLE_TEXTURE_KEY)) return;
  if (!scene.textures.exists(SUMI_LITTLE_DRAGON_TEXTURE_KEY)) return;
  const source = scene.textures.get(SUMI_LITTLE_DRAGON_TEXTURE_KEY).getSourceImage();
  if (!(source instanceof HTMLImageElement || source instanceof HTMLCanvasElement)) return;
  const size = Math.min(source.width, source.height);
  const texture = scene.textures.createCanvas(SUMI_LITTLE_DRAGON_CIRCLE_TEXTURE_KEY, 256, 256);
  if (!texture) return;
  const context = texture.getContext();
  context.clearRect(0, 0, 256, 256);
  context.save();
  context.beginPath();
  context.arc(128, 128, 125, 0, Math.PI * 2);
  context.clip();
  context.drawImage(source, (source.width - size) / 2, (source.height - size) / 2, size, size, 3, 3, 250, 250);
  context.restore();
  texture.refresh();
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
