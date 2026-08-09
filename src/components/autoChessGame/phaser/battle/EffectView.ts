import Phaser from "phaser";
import type { BattleEffect } from "../../core/gameTypes";
import {
  MUMU_WHIP_CATCH_FRACTION,
  mumuWhipControlPoint,
  mumuWhipPullProgress,
  quadraticMotionPoint,
} from "../../core/motionPaths";
import {
  drawHealingFieldEffect,
  drawHealingPulseEffect,
} from "../healingEffects";
import { KOMICHI_SIGNPOST_TEXTURE_KEY } from "../assets";
import { DEPTH, FONT_FAMILY } from "../theme";

const BURST_GRADIENT_TEXTURE = "rift-burst-gradient";
const PROJECTILE_EMOJI_FONT = '"Segoe UI Emoji", "Apple Color Emoji", sans-serif';

type EffectViewParts = {
  graphics: Phaser.GameObjects.Graphics;
  burstGradient: Phaser.GameObjects.Image;
  komichiSignpost: Phaser.GameObjects.Image;
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
    const komichiSignpost = this.host.scene.add.image(0, 0, KOMICHI_SIGNPOST_TEXTURE_KEY).setOrigin(0.5).setName("komichiSignpost").setVisible(false);
    const label = this.host.text(0, 0, "", 14, "#ffffff", { fontStyle: "bold" }).setOrigin(0.5).setName("label").setVisible(false);
    container.add([graphics, burstGradient, komichiSignpost, label]);
    this.effectViewParts.set(container, {
      graphics,
      burstGradient,
      komichiSignpost,
      label,
    });
    return container;
  }

  private resetEffectView(view: Phaser.GameObjects.Container) {
    const {
      graphics,
      burstGradient,
      komichiSignpost,
      label,
    } = this.effectViewParts.get(view)!;
    graphics.clear().setVisible(false).setBlendMode(Phaser.BlendModes.NORMAL);
    burstGradient.setVisible(false).setBlendMode(Phaser.BlendModes.NORMAL).setAlpha(1).clearTint();
    komichiSignpost
      .setVisible(false)
      .setAlpha(1)
      .setPosition(0, 0)
      .setRotation(0)
      .setScale(1)
      .clearTint();
    label.setVisible(false).setAlpha(1).setRotation(0).setScale(1);
  }

  public update(view: Phaser.GameObjects.Container, effect: BattleEffect) {
    const progress = 1 - effect.life / effect.maxLife;
    const alpha = Math.max(0, effect.life / effect.maxLife);
    const {
      graphics,
      burstGradient,
      komichiSignpost,
      label,
    } = this.effectViewParts.get(view)!;
    const viewAlpha = effect.kind === "healing_field" ||
      effect.kind === "harei_pine" ||
      effect.kind === "fear_field"
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
    if (effect.kind === "komichi_sign") {
      const smash = effect.text === "smash";
      const arrival = 1 - (1 - Math.min(1, progress * 2.8)) ** 3;
      const size = effect.size || 118;
      const scale = smash
        ? 0.72 + Math.sin(Math.min(1, progress) * Math.PI) * 0.32
        : 0.48 + arrival * 0.52;
      komichiSignpost
        .setVisible(true)
        .setDisplaySize(size * scale, size * scale)
        .setPosition(
          0,
          smash
            ? -72 + arrival * 48
            : -30 - Math.sin(arrival * Math.PI) * 24,
        )
        .setRotation(
          smash
            ? -1.05 + arrival * 1.28
            : (1 - arrival) * -0.5 + Math.sin(progress * Math.PI * 2) * 0.04,
        );
      return;
    }
    const { color } = Phaser.Display.Color.HexStringToColor(effect.color);
    graphics.clear().setVisible(true);
    if (effect.kind === "mumu_whip") {
      const start = {
        x: (effect.x2 ?? effect.x) - effect.x,
        y: (effect.y2 ?? effect.y) - effect.y,
      };
      const landing = {
        x: (effect.x3 ?? effect.x) - effect.x,
        y: (effect.y3 ?? effect.y) - effect.y,
      };
      const control = mumuWhipControlPoint(
        start,
        landing,
        { x: 0, y: 0 },
        effect.size,
      );
      const catchProgress = Math.min(1, progress / MUMU_WHIP_CATCH_FRACTION);
      const pullProgress = mumuWhipPullProgress(progress);
      const caught = progress >= MUMU_WHIP_CATCH_FRACTION;
      const target = caught
        ? quadraticMotionPoint(start, control, landing, pullProgress)
        : start;
      const ropeEnd = caught ? target : quadraticMotionPoint(
        { x: 0, y: 0 },
        {
          x: start.x * 0.5,
          y: start.y * 0.5 - Math.min(84, Math.hypot(start.x, start.y) * 0.28),
        },
        start,
        1 - (1 - catchProgress) ** 2,
      );
      const ropeDistance = Math.hypot(ropeEnd.x, ropeEnd.y) || 1;
      const normalX = -ropeEnd.y / ropeDistance;
      const normalY = ropeEnd.x / ropeDistance;
      const slack = caught
        ? (1 - pullProgress) * 22
        : 42 * Math.sin(catchProgress * Math.PI);
      const ropeControl = {
        x: ropeEnd.x * 0.48 + normalX * slack,
        y: ropeEnd.y * 0.48 + normalY * slack,
      };
      const ropePoints = Array.from({ length: 13 }, (_, index) => quadraticMotionPoint(
        { x: 0, y: 0 },
        ropeControl,
        ropeEnd,
        index / 12,
      ));
      graphics
        .setBlendMode(Phaser.BlendModes.SCREEN)
        .lineStyle(12, color, 0.16)
        .beginPath()
        .moveTo(ropePoints[0].x, ropePoints[0].y);
      ropePoints.slice(1).forEach((point) => graphics.lineTo(point.x, point.y));
      graphics
        .strokePath()
        .lineStyle(5, color, 0.94)
        .beginPath()
        .moveTo(ropePoints[0].x, ropePoints[0].y);
      ropePoints.slice(1).forEach((point) => graphics.lineTo(point.x, point.y));
      graphics
        .strokePath()
        .lineStyle(1.5, 0xfff5ff, 0.96)
        .beginPath()
        .moveTo(ropePoints[0].x, ropePoints[0].y);
      ropePoints.slice(1).forEach((point) => graphics.lineTo(point.x, point.y));
      graphics
        .strokePath()
        .lineStyle(2.5, 0xfff5ff, 0.9)
        .strokeCircle(0, -5, 10 + Math.sin(progress * Math.PI * 4) * 2)
        .fillStyle(color, caught ? 0.24 : 0.1)
        .fillCircle(ropeEnd.x, ropeEnd.y, caught ? 19 : 10)
        .lineStyle(caught ? 4 : 2, 0xfff5ff, 0.96)
        .strokeCircle(ropeEnd.x, ropeEnd.y, caught ? 17 : 9)
        .lineStyle(2, color, 0.82)
        .strokeCircle(landing.x, landing.y, 18 + pullProgress * 12);
      if (caught) {
        const spark = 9 + Math.sin(pullProgress * Math.PI * 5) * 3;
        graphics
          .lineStyle(2, 0xfff5ff, 0.86)
          .lineBetween(target.x - spark, target.y, target.x + spark, target.y)
          .lineBetween(target.x, target.y - spark, target.x, target.y + spark);
      }
    } else if (effect.kind === "neural_link") {
      const targetX = (effect.x2 ?? effect.x) - effect.x;
      const targetY = (effect.y2 ?? effect.y) - effect.y;
      const distance = Math.hypot(targetX, targetY) || 1;
      const segments = Math.max(5, Math.ceil(distance / 24));
      const phase = Math.floor(progress * segments * 2);
      graphics.setBlendMode(Phaser.BlendModes.SCREEN);
      for (let index = 0; index < segments; index += 1) {
        if ((index + phase) % 3 === 2) continue;
        const start = index / segments;
        const end = Math.min(1, (index + 0.72) / segments);
        graphics
          .lineStyle((effect.size || 4) + 5, color, 0.12)
          .lineBetween(targetX * start, targetY * start, targetX * end, targetY * end)
          .lineStyle(effect.size || 4, index % 2 ? color : 0xf2ffff, 0.88)
          .lineBetween(targetX * start, targetY * start, targetX * end, targetY * end);
      }
      const pulse = 5 + Math.sin(progress * Math.PI * 8) * 2;
      graphics
        .fillStyle(color, 0.28)
        .fillCircle(0, 0, pulse + 5)
        .fillCircle(targetX, targetY, pulse + 5)
        .lineStyle(2, 0xf2ffff, 0.94)
        .strokeCircle(0, 0, pulse)
        .strokeCircle(targetX, targetY, pulse);
    } else if (effect.kind === "mind_control") {
      const radius = effect.size || 64;
      const arrival = 1 - (1 - Math.min(1, progress * 1.8)) ** 3;
      const pulse = 0.94 + Math.sin(progress * Math.PI * 7) * 0.06;
      const fieldRadius = radius * (0.48 + arrival * 0.52) * pulse;
      graphics
        .setBlendMode(Phaser.BlendModes.SCREEN)
        .fillStyle(color, 0.07 + (1 - progress) * 0.08)
        .fillCircle(0, 0, fieldRadius)
        .lineStyle(Math.max(2, 6 * (1 - progress)), color, 0.92)
        .strokeCircle(0, 0, fieldRadius)
        .lineStyle(1.5, 0xf2ffff, 0.76)
        .strokeCircle(0, 0, fieldRadius * 0.68);
      for (let index = 0; index < 8; index += 1) {
        const angle = progress * 2.4 + (Math.PI * 2 * index) / 8;
        const inner = fieldRadius * 0.7;
        const outer = fieldRadius * (index % 2 ? 0.88 : 1.04);
        graphics
          .lineStyle(index % 2 ? 1.5 : 2.5, index % 2 ? color : 0xf2ffff, 0.82)
          .lineBetween(
            Math.cos(angle) * inner,
            Math.sin(angle) * inner,
            Math.cos(angle) * outer,
            Math.sin(angle) * outer,
          )
          .fillStyle(index % 2 ? color : 0xf2ffff, 0.94)
          .fillCircle(Math.cos(angle) * outer, Math.sin(angle) * outer, index % 2 ? 2.5 : 3.5);
      }
      label
        .setText(effect.text || "🧠")
        .setFontFamily(effect.emoji ? PROJECTILE_EMOJI_FONT : FONT_FAMILY)
        .setFontSize(effect.emoji ? 30 : 11)
        .setColor(effect.emoji ? "#ffffff" : effect.color)
        .setPosition(0, -Math.min(62, radius * 0.58))
        .setScale(0.88 + Math.sin(progress * Math.PI) * 0.18)
        .setVisible(true);
    } else if (effect.kind === "switch_on") {
      const radius = effect.size || 42;
      const pulse = 0.9 + Math.sin(progress * Math.PI * 4) * 0.08;
      const knobX = -10 + Math.min(1, progress * 2.8) * 20;
      const switchY = -77;
      graphics
        .setBlendMode(Phaser.BlendModes.SCREEN)
        .fillStyle(color, 0.13)
        .fillCircle(0, 0, radius * pulse)
        .lineStyle(3.5 * (1 - progress) + 1.2, 0xe8c5ff, 0.9)
        .strokeCircle(0, 0, radius * (0.42 + progress * 0.72))
        .fillStyle(0x2b123d, 0.98)
        .fillRoundedRect(-24, switchY - 12, 48, 24, 12)
        .lineStyle(2, color, 1)
        .strokeRoundedRect(-24, switchY - 12, 48, 24, 12)
        .fillStyle(0xf2ddff, 1)
        .fillCircle(knobX, switchY, 8)
        .lineStyle(1.5, 0xffffff, 0.9)
        .strokeCircle(knobX, switchY, 8);
      label
        .setText(effect.text || "ON")
        .setFontFamily(FONT_FAMILY)
        .setFontSize(9)
        .setColor("#ffffff")
        .setPosition(-8, switchY)
        .setOrigin(0.5)
        .setScale(1 + Math.sin(progress * Math.PI) * 0.1)
        .setVisible(true);
    } else if (effect.kind === "switch_shock") {
      const targetX = (effect.x2 ?? effect.x) - effect.x;
      const targetY = (effect.y2 ?? effect.y) - effect.y;
      const length = Math.hypot(targetX, targetY) || 1;
      const normalX = -targetY / length;
      const normalY = targetX / length;
      const segments = 7;
      const points = Array.from({ length: segments + 1 }, (_, index) => {
        const ratio = index / segments;
        const zigzag = index === 0 || index === segments
          ? 0
          : (index % 2 === 0 ? -1 : 1) * (5 + Math.sin(index * 2.1) * 2);
        return {
          x: targetX * ratio + normalX * zigzag,
          y: targetY * ratio + normalY * zigzag,
        };
      });
      graphics
        .setBlendMode(Phaser.BlendModes.SCREEN)
        .lineStyle((effect.size || 4) + 6, color, 0.18)
        .beginPath()
        .moveTo(points[0].x, points[0].y);
      points.slice(1).forEach((point) => graphics.lineTo(point.x, point.y));
      graphics
        .strokePath()
        .lineStyle(effect.size || 4, 0xe9c8ff, 0.96)
        .beginPath()
        .moveTo(points[0].x, points[0].y);
      points.slice(1).forEach((point) => graphics.lineTo(point.x, point.y));
      graphics
        .strokePath()
        .fillStyle(color, 0.2 + (1 - progress) * 0.18)
        .fillCircle(targetX, targetY, 20 + progress * 8)
        .lineStyle(2.5, 0xf4e8ff, 0.92)
        .strokeCircle(targetX, targetY, 13 + progress * 18);
      label
        .setText("麻")
        .setFontFamily(FONT_FAMILY)
        .setFontSize(12)
        .setColor("#f5e8ff")
        .setPosition(targetX, targetY - 28 - progress * 8)
        .setScale(1)
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
    } else if (effect.kind === "fear_field") {
      const radius = effect.size || 118;
      const pulse = 0.96 + Math.sin(progress * Math.PI * 10) * 0.04;
      const puddleRadius = radius * pulse;
      graphics
        .fillStyle(0x5dcf9d, 0.22)
        .fillEllipse(0, 6, puddleRadius * 1.9, puddleRadius * 1.15)
        .fillStyle(0x8be7df, 0.18)
        .fillEllipse(-radius * 0.34, -radius * 0.08, radius * 0.88, radius * 0.55)
        .fillEllipse(radius * 0.38, radius * 0.12, radius * 0.72, radius * 0.48)
        .lineStyle(2.5, 0xb8fff0, 0.78)
        .strokeEllipse(0, 6, puddleRadius * 1.9, puddleRadius * 1.15);
      for (let index = 0; index < 5; index += 1) {
        const x = (index - 2) * radius * 0.22;
        const drift = Math.sin(progress * 8 + index * 1.7) * 7;
        graphics
          .lineStyle(index % 2 ? 1.5 : 2.2, index % 2 ? 0xc9fff4 : color, 0.7)
          .beginPath()
          .moveTo(x, -radius * 0.18)
          .lineTo(x + drift, -radius * 0.42)
          .lineTo(x - drift * 0.5, -radius * 0.66)
          .strokePath();
      }
      label
        .setText(effect.text || "🧪")
        .setFontFamily(PROJECTILE_EMOJI_FONT)
        .setFontSize(27)
        .setPosition(-radius * 0.55, -radius * 0.38)
        .setRotation(-0.42 + Math.sin(progress * 6) * 0.08)
        .setVisible(true);
    } else if (effect.kind === "harei_pine") {
      const radius = effect.size || 118;
      const direction = (effect.x2 ?? effect.x + 1) >= effect.x ? 1 : -1;
      const arrival = 1 - (1 - Math.min(1, progress * 2.6)) ** 3;
      const grow = 0.4 + arrival * 0.6;
      const branchColor = 0x704d32;
      const needleDark = 0x17663b;
      const needleMid = 0x2d9a55;
      const needleLight = 0x70d67d;
      graphics
        .fillStyle(needleMid, 0.1 + (1 - progress) * 0.08)
        .fillCircle(0, 0, radius)
        .lineStyle(Math.max(2, 6 * (1 - progress)), needleLight, 0.88)
        .strokeCircle(0, 0, radius * (0.7 + arrival * 0.3))
        .lineStyle(8 * grow, branchColor, 0.98)
        .beginPath()
        .moveTo(-direction * 5 * grow, 8)
        .lineTo(direction * 4 * grow, -20 * grow)
        .lineTo(direction * 18 * grow, -43 * grow)
        .lineTo(direction * 36 * grow, -54 * grow)
        .strokePath()
        .lineStyle(6 * grow, branchColor, 0.98)
        .lineBetween(
          direction * 10 * grow,
          -32 * grow,
          direction * 76 * grow,
          -47 * grow,
        )
        .lineStyle(3.5 * grow, branchColor, 0.94)
        .lineBetween(
          direction * 35 * grow,
          -47 * grow,
          direction * 48 * grow,
          -69 * grow,
        )
        .lineBetween(
          direction * 57 * grow,
          -44 * grow,
          direction * 70 * grow,
          -65 * grow,
        );
      [
        { x: -direction * 17, y: -45, width: 44, height: 23 },
        { x: direction * 13, y: -58, width: 54, height: 27 },
        { x: direction * 44, y: -63, width: 58, height: 28 },
        { x: direction * 72, y: -54, width: 48, height: 24 },
      ].forEach((cluster, index) => {
        const clusterX = cluster.x * grow;
        const clusterY = cluster.y * grow;
        graphics
          .fillStyle(index % 2 ? needleMid : needleDark, 0.98)
          .fillEllipse(
            clusterX,
            clusterY,
            cluster.width * grow,
            cluster.height * grow,
          )
          .fillStyle(needleLight, 0.72)
          .fillEllipse(
            clusterX + direction * 4 * grow,
            clusterY - 4 * grow,
            cluster.width * 0.66 * grow,
            cluster.height * 0.44 * grow,
          );
      });
      label
        .setText(effect.text || "欢迎光临")
        .setFontFamily(FONT_FAMILY)
        .setFontSize(12)
        .setColor("#d9ffe1")
        .setY(-86 * grow)
        .setScale(0.86 + arrival * 0.14)
        .setVisible(true);
    } else if (effect.kind === "harei_badge") {
      const radius = effect.size || 118;
      const impact = 1 - (1 - Math.min(1, progress * 2.8)) ** 3;
      const badgeRadius = 35 * (0.42 + impact * 0.58);
      const badgeY =
        -86 * (1 - impact) - Math.sin(impact * Math.PI) * 10;
      const shockwave = Math.max(0, progress - 0.22) / 0.78;
      graphics
        .fillStyle(0xff8fb8, 0.08 + (1 - progress) * 0.07)
        .fillCircle(0, 0, radius)
        .lineStyle(Math.max(2, 6 * (1 - progress)), 0xff9fc5, 0.88)
        .strokeCircle(0, 0, radius * (0.66 + shockwave * 0.34));
      if (shockwave > 0) {
        graphics
          .lineStyle(Math.max(1.5, 4 * (1 - shockwave)), 0x9ee8ff, 0.72)
          .strokeCircle(0, 0, 30 + shockwave * 72);
      }
      graphics
        .fillStyle(0xff8fb8, 1)
        .fillCircle(0, badgeY, badgeRadius)
        .lineStyle(3, 0xffd6e6, 0.98)
        .strokeCircle(0, badgeY, badgeRadius)
        .fillStyle(0x263044, 1)
        .fillCircle(0, badgeY, badgeRadius - 5)
        .lineStyle(1.5, 0x9ee8ff, 0.9)
        .strokeCircle(0, badgeY, badgeRadius - 9)
        .fillStyle(0x9ee8ff, 0.92)
        .fillCircle(-badgeRadius * 0.48, badgeY, 2.6)
        .fillCircle(badgeRadius * 0.48, badgeY, 2.6);
      view.setRotation((1 - impact) * -0.72);
      label
        .setText(effect.text || "75mm\n大吧唧")
        .setFontFamily(FONT_FAMILY)
        .setFontSize(11)
        .setColor("#ffffff")
        .setY(badgeY)
        .setScale(0.78 + impact * 0.22)
        .setVisible(true);
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
