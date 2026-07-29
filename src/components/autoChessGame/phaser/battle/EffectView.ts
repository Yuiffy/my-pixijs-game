import Phaser from "phaser";
import type { BattleEffect } from "../../core/gameTypes";
import {
  drawHealingFieldEffect,
  drawHealingPulseEffect,
} from "../healingEffects";
import { DEPTH, FONT_FAMILY } from "../theme";

const BURST_GRADIENT_TEXTURE = "rift-burst-gradient";
const PROJECTILE_EMOJI_FONT = '"Segoe UI Emoji", "Apple Color Emoji", sans-serif';

type EffectViewParts = {
  graphics: Phaser.GameObjects.Graphics;
  burstGradient: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
};

interface EffectViewHost {
  scene: Phaser.Scene;
  text: (
    x: number,
    y: number,
    value: string,
    size?: number,
    color?: string,
    style?: Phaser.Types.GameObjects.Text.TextStyle,
  ) => Phaser.GameObjects.Text;
}

export class EffectViewRenderer {
  private effectViewPool: Phaser.GameObjects.Container[] = [];

  private readonly effectViewParts =
    new WeakMap<Phaser.GameObjects.Container, EffectViewParts>();

  constructor(private readonly host: EffectViewHost) {}

  public reset() {
    this.effectViewPool = [];
  }

  public recycle(view: Phaser.GameObjects.Container) {
    if (!this.effectViewParts.has(view) || this.effectViewPool.length >= 96) {
      view.destroy();
      return;
    }
    view.setActive(false).setVisible(false);
    this.effectViewPool.push(view);
  }

  private takePooledView() {
    let view = this.effectViewPool.pop();
    while (view && !this.effectViewParts.has(view)) {
      view.destroy();
      view = this.effectViewPool.pop();
    }
    return view;
  }

  public create(effect: BattleEffect) {
    const pooled = this.takePooledView();
    if (pooled) {
      this.resetEffectView(pooled);
      return pooled
        .setActive(true)
        .setVisible(true)
        .setAlpha(1)
        .setScale(1)
        .setRotation(0)
        .setPosition(effect.x, effect.y);
    }
    const container = this.host.scene.add.container(effect.x, effect.y);
    const graphics = this.host.scene.add.graphics().setName("shape").setVisible(false);
    const burstGradient = this.host.scene.add.image(0, 0, BURST_GRADIENT_TEXTURE).setOrigin(0.5).setName("burstGradient").setVisible(false);
    const label = this.host.text(0, 0, "", 14, "#ffffff", { fontStyle: "bold" }).setOrigin(0.5).setName("label").setVisible(false);
    container.add([graphics, burstGradient, label]);
    this.effectViewParts.set(container, {
      graphics,
      burstGradient,
      label,
    });
    return container;
  }

  private resetEffectView(view: Phaser.GameObjects.Container) {
    const {
      graphics,
      burstGradient,
      label,
    } = this.effectViewParts.get(view)!;
    graphics.clear().setVisible(false).setBlendMode(Phaser.BlendModes.NORMAL);
    burstGradient.setVisible(false).setBlendMode(Phaser.BlendModes.NORMAL).setAlpha(1).clearTint();
    label.setVisible(false).setAlpha(1).setRotation(0).setScale(1);
  }

  public update(view: Phaser.GameObjects.Container, effect: BattleEffect) {
    const progress = 1 - effect.life / effect.maxLife;
    const alpha = Math.max(0, effect.life / effect.maxLife);
    const {
      graphics,
      burstGradient,
      label,
    } = this.effectViewParts.get(view)!;
    const viewAlpha = effect.kind === "healing_field"
      ? Math.min(1, alpha * 5)
      : alpha ** 0.65;
    view
      .setPosition(effect.x, effect.y)
      .setAlpha(viewAlpha)
      .setRotation(0)
      .setDepth(DEPTH.effects + effect.y + 1);
    if (effect.kind === "emoji_burst") {
      const pickaxeBounce = effect.text === "⛏️";
      const bounce = pickaxeBounce ? Math.sin(progress * Math.PI) * 46 : 0;
      label
        .setText(effect.text || "😂")
        .setFontFamily(PROJECTILE_EMOJI_FONT)
        .setFontSize(effect.size || (pickaxeBounce ? 26 : 32))
        .setVisible(true);
      if (pickaxeBounce) {
        label
          .setY(-10 - bounce - progress * 8)
          .setScale(0.82 + Math.sin(progress * Math.PI) * 0.34)
          .setRotation(-0.72 + progress * 2.8);
      } else {
        label
          .setY(0)
          .setScale(0.62 + progress * 1.48)
          .setRotation(0);
      }
      return;
    }
    if (effect.kind === "text" || effect.kind === "heal") {
      label
        .setText(effect.text || "")
        .setFontFamily(effect.emoji ? PROJECTILE_EMOJI_FONT : FONT_FAMILY)
        .setFontSize(effect.size || 14)
        .setY(-progress * 26)
        .setScale(1)
        .setVisible(true);
      if (label.style.color !== effect.color) label.setColor(effect.color);
      return;
    }
    const { color } = Phaser.Display.Color.HexStringToColor(effect.color);
    graphics.clear().setVisible(true);
    if (effect.kind === "pk_overheat") {
      const radius = effect.size || 150;
      const pulse = 0.72 + Math.sin(progress * Math.PI * 3) * 0.08;
      const shockwave = radius * (0.28 + progress * 0.72);
      graphics
        .setBlendMode(Phaser.BlendModes.SCREEN)
        .fillStyle(0xff563d, 0.08 + (1 - progress) * 0.08)
        .fillCircle(0, 0, radius * pulse)
        .lineStyle(Math.max(2, 7 * (1 - progress)), 0xff765f, 0.92)
        .strokeCircle(0, 0, shockwave)
        .lineStyle(2, color, 0.72)
        .strokeCircle(0, 0, radius * pulse)
        .fillStyle(0x14252d, 0.96)
        .fillRoundedRect(-17, -25, 34, 50, 7)
        .lineStyle(3, 0xff765f, 0.96)
        .strokeRoundedRect(-17, -25, 34, 50, 7)
        .fillStyle(0xff765f, 0.88)
        .fillRoundedRect(-12, -18, 24, 32, 3)
        .fillStyle(0xffffff, 0.92)
        .fillCircle(0, 20, 2.3);
      for (let index = 0; index < 6; index += 1) {
        const angle = -0.9 + index * 0.36;
        const rayStart = 29 + index * 2;
        const rayEnd = rayStart + 13 + progress * 8;
        graphics
          .lineStyle(index % 2 ? 2 : 3, index % 2 ? color : 0xffb18e, 0.78)
          .lineBetween(
            Math.cos(angle) * rayStart,
            Math.sin(angle) * rayStart,
            Math.cos(angle) * rayEnd,
            Math.sin(angle) * rayEnd,
          );
      }
      label
        .setText("PK")
        .setFontFamily(FONT_FAMILY)
        .setFontSize(13)
        .setColor("#ffffff")
        .setY(-2)
        .setScale(1 + Math.sin(progress * Math.PI) * 0.12)
        .setVisible(true);
    } else if (effect.kind === "biscuit_share") {
      const targetX = (effect.x2 ?? effect.x) - effect.x;
      const targetY = (effect.y2 ?? effect.y) - effect.y;
      const travel = 1 - (1 - Math.min(1, progress * 1.2)) ** 2;
      const biscuitX = targetX * travel;
      const biscuitY = targetY * travel - Math.sin(travel * Math.PI) * 22;
      const isChoco = effect.text === "choco";
      graphics
        .setBlendMode(Phaser.BlendModes.SCREEN)
        .lineStyle(2, color, 0.3)
        .lineBetween(0, 0, targetX, targetY)
        .lineStyle(Math.max(1.5, 4 * (1 - progress)), color, 0.82)
        .strokeCircle(targetX, targetY, 12 + progress * 16);
      if (isChoco) {
        graphics
          .fillStyle(0xd59a58, 1)
          .fillCircle(biscuitX, biscuitY, 13)
          .lineStyle(2, 0xffd99a, 0.9)
          .strokeCircle(biscuitX, biscuitY, 13);
        [
          [-5, -4],
          [5, -5],
          [-2, 5],
          [6, 4],
        ].forEach(([chipX, chipY]) => {
          graphics.fillStyle(0x563528, 0.96).fillCircle(
            biscuitX + chipX,
            biscuitY + chipY,
            2.2,
          );
        });
      } else {
        graphics
          .fillStyle(0xf1d8a5, 1)
          .fillRoundedRect(biscuitX - 13, biscuitY - 11, 26, 22, 5)
          .lineStyle(2, 0xffedbf, 0.95)
          .strokeRoundedRect(biscuitX - 13, biscuitY - 11, 26, 22, 5);
        [
          [-6, -4],
          [6, -4],
          [-6, 4],
          [6, 4],
        ].forEach(([holeX, holeY]) => {
          graphics.fillStyle(0x8f6842, 0.92).fillCircle(
            biscuitX + holeX,
            biscuitY + holeY,
            1.9,
          );
        });
      }
    } else if (effect.kind === "line") {
      const targetX = (effect.x2 ?? effect.x) - effect.x;
      const targetY = (effect.y2 ?? effect.y) - effect.y;
      const width = effect.size || 3;
      const travel = Math.min(1, progress * 1.35);
      const tail = Math.max(0, travel - 0.2);
      const pulseX = targetX * travel;
      const pulseY = targetY * travel;
      graphics
        .setBlendMode(Phaser.BlendModes.SCREEN)
        .lineStyle(width + 4, color, 0.22)
        .lineBetween(0, 0, targetX, targetY)
        .lineStyle(width + 2, color, 0.88)
        .lineBetween(targetX * tail, targetY * tail, pulseX, pulseY)
        .lineStyle(Math.max(1, width * 0.45), 0xf4fbff, 0.96)
        .lineBetween(targetX * tail, targetY * tail, pulseX, pulseY)
        .fillStyle(color, 0.38)
        .fillCircle(pulseX, pulseY, width + 7)
        .fillStyle(0xf4fbff, 1)
        .fillCircle(pulseX, pulseY, width + 2);
      if (travel > 0.82) {
        graphics
          .lineStyle(Math.max(1.5, width * 0.7), color, 0.9)
          .strokeCircle(targetX, targetY, (travel - 0.82) * 54 + width * 2);
      }
    } else if (effect.kind === "ring") {
      const radius = effect.size || 80;
      const arrival = 1 - (1 - progress) ** 3;
      const fieldRadius = Math.max(6, radius * (0.72 + arrival * 0.28));
      graphics
        .setBlendMode(Phaser.BlendModes.SCREEN)
        .fillStyle(color, 0.1 + (1 - progress) * 0.08)
        .fillCircle(0, 0, fieldRadius)
        .lineStyle(Math.max(2, 7 * (1 - progress)), color, 0.95)
        .strokeCircle(0, 0, fieldRadius)
        .lineStyle(1.5, 0xf4fbff, 0.66)
        .strokeCircle(0, 0, Math.max(5, radius * arrival * 0.72));
    } else if (effect.kind === "finale") {
      const radius = effect.size || 150;
      const arrival = 1 - (1 - Math.min(1, progress * 1.5)) ** 3;
      const stageRadius = radius * (0.42 + arrival * 0.58);
      const rotation = progress * 0.72;
      graphics
        .setBlendMode(Phaser.BlendModes.SCREEN)
        .fillStyle(color, 0.08 + (1 - progress) * 0.1)
        .fillCircle(0, 0, stageRadius)
        .fillStyle(0xf7ddff, 0.08 + (1 - progress) * 0.12)
        .fillTriangle(-radius * 0.96, -radius * 0.88, -radius * 0.42, -radius * 0.96, 0, radius * 0.16)
        .fillTriangle(radius * 0.96, -radius * 0.88, radius * 0.42, -radius * 0.96, 0, radius * 0.16)
        .lineStyle(Math.max(2, 7 * (1 - progress)), color, 0.94)
        .strokeCircle(0, 0, stageRadius)
        .lineStyle(1.5, 0xffffff, 0.72)
        .strokeCircle(0, 0, stageRadius * 0.72);
      for (let index = 0; index < 12; index += 1) {
        const angle = rotation + (Math.PI * 2 * index) / 12;
        const inner = stageRadius * (index % 2 ? 0.64 : 0.54);
        const outer = stageRadius * (index % 2 ? 0.9 : 1);
        graphics
          .lineStyle(index % 2 ? 2 : 3.5, index % 2 ? color : 0xffffff, 0.72)
          .lineBetween(
            Math.cos(angle) * inner,
            Math.sin(angle) * inner,
            Math.cos(angle) * outer,
            Math.sin(angle) * outer,
          );
      }
      const starRadius = Math.max(8, radius * (0.24 + Math.sin(progress * Math.PI) * 0.11));
      const starPoints = Array.from({ length: 8 }, (_, index) => {
        const angle = -Math.PI / 2 + rotation * 1.8 + (Math.PI * index) / 4;
        const pointRadius = index % 2 === 0 ? starRadius : starRadius * 0.35;
        return new Phaser.Math.Vector2(Math.cos(angle) * pointRadius, Math.sin(angle) * pointRadius);
      });
      graphics.fillStyle(0xf7ddff, 0.78).fillPoints(starPoints, true);
      burstGradient
        .setTint(color)
        .setDisplaySize(stageRadius * 1.45, stageRadius * 1.45)
        .setBlendMode(Phaser.BlendModes.SCREEN)
        .setAlpha(0.3 + (1 - progress) * 0.34)
        .setVisible(true);
    } else if (effect.kind === "energy_pulse") {
      const radius = effect.size || 48;
      const arrival = 1 - (1 - progress) ** 2;
      const pulseRadius = radius * (0.35 + arrival * 0.65);
      graphics
        .setBlendMode(Phaser.BlendModes.SCREEN)
        .fillStyle(color, 0.08 + (1 - progress) * 0.12)
        .fillCircle(0, 0, pulseRadius)
        .lineStyle(Math.max(1.5, 4 * (1 - progress)), color, 0.92)
        .strokeCircle(0, 0, pulseRadius)
        .lineStyle(1.2, 0xffffff, 0.7)
        .strokeCircle(0, 0, pulseRadius * 0.68);
      for (let index = 0; index < 4; index += 1) {
        const angle = progress * 2.2 + index * (Math.PI / 2);
        graphics
          .fillStyle(index % 2 ? color : 0xffffff, 0.82)
          .fillCircle(Math.cos(angle) * pulseRadius * 0.82, Math.sin(angle) * pulseRadius * 0.82, 2.8);
      }
      label
        .setText(effect.text || "+15 能量")
        .setFontFamily(FONT_FAMILY)
        .setFontSize(11)
        .setY(-radius * 0.72 - progress * 10)
        .setScale(1)
        .setColor("#f7ddff")
        .setVisible(true);
    } else if (effect.kind === "healing_field") {
      drawHealingFieldEffect(graphics, burstGradient, color, progress, effect.size);
    } else if (effect.kind === "healing_pulse") {
      drawHealingPulseEffect(graphics, burstGradient, color, progress, effect.size);
    } else if (effect.kind === "burst") {
      const radius = (effect.size || 40) * (0.35 + progress * 0.65);
      burstGradient
        .setTint(color)
        .setDisplaySize(radius * 2, radius * 2)
        .setBlendMode(Phaser.BlendModes.SCREEN)
        .setVisible(true);
      graphics
        .setBlendMode(Phaser.BlendModes.SCREEN)
        .lineStyle(Math.max(1.5, 4 * (1 - progress)), color, 0.8)
        .strokeCircle(0, 0, radius * 0.72);
    } else if (effect.kind === "rebirth") {
      const radius = effect.size || 78;
      const outerRadius = radius * (0.28 + progress * 0.92);
      const innerRadius = radius * (1.08 - progress * 0.54);
      const flash = Math.max(0, 1 - progress * 1.5);
      graphics
        .setBlendMode(Phaser.BlendModes.SCREEN)
        .fillStyle(color, 0.12 + flash * 0.28)
        .fillCircle(0, 0, innerRadius)
        .lineStyle(Math.max(1.5, 5 * (1 - progress)), color, 0.96)
        .strokeCircle(0, 0, outerRadius)
        .lineStyle(1.5, 0xffffff, 0.82)
        .strokeCircle(0, 0, innerRadius);
      for (let index = 0; index < 8; index += 1) {
        const angle = index * (Math.PI / 4) + progress * 0.9;
        const rayStart = innerRadius * 0.48;
        const rayEnd = innerRadius * (0.86 + (index % 2) * 0.12);
        graphics.lineStyle(index % 2 ? 2 : 3, index % 2 ? color : 0xffffff, 0.72);
        graphics.lineBetween(
          Math.cos(angle) * rayStart,
          Math.sin(angle) * rayStart,
          Math.cos(angle) * rayEnd,
          Math.sin(angle) * rayEnd,
        );
      }
      burstGradient
        .setTint(color)
        .setDisplaySize(innerRadius * 1.35, innerRadius * 1.35)
        .setBlendMode(Phaser.BlendModes.SCREEN)
        .setAlpha(0.38 + flash * 0.42)
        .setVisible(true);
    } else if (effect.kind === "chronosphere" || effect.kind === "hotpot") {
      const radius = (effect.size || (effect.kind === "hotpot" ? 130 : 50)) * (effect.kind === "hotpot" ? 0.45 + progress * 0.7 : 0.35 + progress * 0.65);
      const fill = effect.kind === "hotpot" ? 0xff6b2d : color;
      graphics.fillStyle(fill, effect.kind === "hotpot" ? 0.3 : 0.24).fillCircle(0, 0, radius);
      graphics.lineStyle(effect.kind === "hotpot" ? 4 : 3, color, 0.9).strokeCircle(0, 0, radius * (effect.kind === "hotpot" ? 0.72 : 0.92));
      if (effect.kind === "hotpot") graphics.lineStyle(2, 0xffd27a, 0.9).strokeCircle(0, 0, radius * 0.48);
    }
  }

}
