import Phaser from "phaser";

const HEALING_HIGHLIGHT = 0xd9fff0;

export const drawHealingFieldEffect = (
  graphics: Phaser.GameObjects.Graphics,
  burstGradient: Phaser.GameObjects.Image,
  color: number,
  progress: number,
  size?: number,
) => {
  const radius = size || 145;
  const breath = 0.5 + Math.sin(progress * Math.PI * 8) * 0.5;
  const markerDistance = radius * 0.7;
  const markerHalfSize = 4.5;
  burstGradient
    .setTint(color)
    .setDisplaySize(Math.min(94, radius * 0.68), Math.min(94, radius * 0.68))
    .setAlpha(0.13 + breath * 0.035)
    .setBlendMode(Phaser.BlendModes.SCREEN)
    .setVisible(true);
  graphics
    .setBlendMode(Phaser.BlendModes.SCREEN)
    .fillStyle(color, 0.025)
    .fillCircle(0, 0, radius)
    .lineStyle(1.5, color, 0.3 + breath * 0.06)
    .strokeCircle(0, 0, radius)
    .lineStyle(1, color, 0.12)
    .strokeCircle(0, 0, radius * 0.84)
    .fillStyle(color, 0.13 + breath * 0.025)
    .fillCircle(0, 0, 25)
    .lineStyle(2, color, 0.48)
    .strokeCircle(0, 0, 27);
  for (let index = 0; index < 4; index += 1) {
    const angle = index * (Math.PI / 2);
    const markerX = Math.cos(angle) * markerDistance;
    const markerY = Math.sin(angle) * markerDistance;
    graphics
      .lineStyle(3, color, 0.7)
      .lineBetween(markerX - markerHalfSize, markerY, markerX + markerHalfSize, markerY)
      .lineBetween(markerX, markerY - markerHalfSize, markerX, markerY + markerHalfSize)
      .lineStyle(1.2, HEALING_HIGHLIGHT, 0.92)
      .lineBetween(markerX - markerHalfSize, markerY, markerX + markerHalfSize, markerY)
      .lineBetween(markerX, markerY - markerHalfSize, markerX, markerY + markerHalfSize);
  }
  graphics
    .lineStyle(6, color, 0.8)
    .lineBetween(-11, 0, 11, 0)
    .lineBetween(0, -11, 0, 11)
    .lineStyle(2, HEALING_HIGHLIGHT, 0.96)
    .lineBetween(-11, 0, 11, 0)
    .lineBetween(0, -11, 0, 11);
};

export const drawHealingPulseEffect = (
  graphics: Phaser.GameObjects.Graphics,
  burstGradient: Phaser.GameObjects.Image,
  color: number,
  progress: number,
  size?: number,
) => {
  const radius = (size || 64) * (0.34 + progress * 0.3);
  const crossY = -progress * 9;
  burstGradient
    .setTint(color)
    .setDisplaySize(radius * 2.35, radius * 2.35)
    .setAlpha(0.46)
    .setBlendMode(Phaser.BlendModes.SCREEN)
    .setVisible(true);
  graphics
    .setBlendMode(Phaser.BlendModes.SCREEN)
    .fillStyle(color, 0.16)
    .fillCircle(0, 0, radius)
    .lineStyle(Math.max(1, 2.5 * (1 - progress)), color, 0.48)
    .strokeCircle(0, 0, radius)
    .lineStyle(6, color, 0.9)
    .lineBetween(-11, crossY, 11, crossY)
    .lineBetween(0, crossY - 11, 0, crossY + 11)
    .lineStyle(2, HEALING_HIGHLIGHT, 1)
    .lineBetween(-11, crossY, 11, crossY)
    .lineBetween(0, crossY - 11, 0, crossY + 11);
  for (let index = 0; index < 3; index += 1) {
    const angle = -Math.PI * (0.16 + index * 0.34);
    const distance = 17 + progress * (10 + index * 3);
    const moteX = Math.cos(angle) * distance;
    const moteY = Math.sin(angle) * distance - progress * 8;
    graphics
      .fillStyle(index === 1 ? HEALING_HIGHLIGHT : color, 0.8 - progress * 0.35)
      .fillCircle(moteX, moteY, 2.5 - progress * 0.7);
  }
};
