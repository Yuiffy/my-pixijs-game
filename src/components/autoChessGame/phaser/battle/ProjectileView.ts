import Phaser from "phaser";
import type { Projectile } from "../../core/gameTypes";
import type { EngineBridge } from "../EngineBridge";
import { SUMI_LITTLE_DRAGON_CIRCLE_TEXTURE_KEY } from "../assets";
import { DEPTH, FONT_FAMILY } from "../theme";

const PROJECTILE_EMOJI_FONT = '"Segoe UI Emoji", "Apple Color Emoji", sans-serif';

const projectileEmoji = (projectile: Projectile) => {
  if (projectile.emoji) return projectile.emoji;
  if (projectile.style === "shark") return "🦈";
  if (projectile.style === "carrot") return "🥕";
  if (projectile.style === "coin") return "🪙";
  if (projectile.style === "lollipop") return "🍭";
  if (projectile.style === "fireball") return "🔥";
  if (projectile.style === "laugh") return "😂";
  return "";
};

type ProjectileViewParts = {
  trail: Phaser.GameObjects.Graphics;
  core: Phaser.GameObjects.Arc;
  icon: Phaser.GameObjects.Text;
  dragon: Phaser.GameObjects.Image;
};

type ProjectileVisualState = {
  style: Projectile["style"];
  grounded: boolean;
  velocityX: number;
  velocityY: number;
  size: number;
  radius: number;
  color: string;
  emoji: string;
};

interface ProjectileViewHost {
  scene: Phaser.Scene;
  bridge: EngineBridge;
  text: (
    x: number,
    y: number,
    value: string,
    size?: number,
    color?: string,
    style?: Phaser.Types.GameObjects.Text.TextStyle,
  ) => Phaser.GameObjects.Text;
}

export class ProjectileViewRenderer {
  private projectileViewPool: Phaser.GameObjects.Container[] = [];

  private readonly projectileViewParts =
    new WeakMap<Phaser.GameObjects.Container, ProjectileViewParts>();

  private readonly projectileVisualStates =
    new WeakMap<Phaser.GameObjects.Container, ProjectileVisualState>();

  constructor(private readonly host: ProjectileViewHost) {}

  public reset() {
    this.projectileViewPool = [];
  }

  public recycle(view: Phaser.GameObjects.Container) {
    if (
      !this.projectileViewParts.has(view)
      || this.projectileViewPool.length >= 48
    ) {
      view.destroy();
      return;
    }
    view.setActive(false).setVisible(false);
    this.projectileViewPool.push(view);
  }

  private takePooledView() {
    let view = this.projectileViewPool.pop();
    while (view && !this.projectileViewParts.has(view)) {
      view.destroy();
      view = this.projectileViewPool.pop();
    }
    return view;
  }

  public create(projectile: Projectile) {
    const pooled = this.takePooledView();
    if (pooled) {
      this.projectileVisualStates.delete(pooled);
      return pooled
        .setActive(true)
        .setVisible(true)
        .setAlpha(1)
        .setScale(1)
        .setRotation(0)
        .setPosition(projectile.x, projectile.y);
    }
    const container = this.host.scene.add.container(projectile.x, projectile.y);
    const trail = this.host.scene.add.graphics().setName("trail");
    const core = this.host.scene.add.circle(0, 0, Math.max(2, projectile.size), 0xf8fcff).setName("core");
    const icon = this.host.text(0, 0, "", Math.max(12, projectile.size), "#ffffff", { fontFamily: PROJECTILE_EMOJI_FONT }).setOrigin(0.5).setName("icon");
    const dragon = this.host.scene.add.image(0, 0, SUMI_LITTLE_DRAGON_CIRCLE_TEXTURE_KEY).setName("dragon");
    container.add([trail, core, icon, dragon]);
    this.projectileViewParts.set(container, {
      trail,
      core,
      icon,
      dragon,
    });
    return container;
  }

  private drawProjectileTrail(graphics: Phaser.GameObjects.Graphics, tailX: number, tailY: number, width: number, color: number) {
    const capRadius = width / 2;
    graphics.lineStyle(width, color, 1).lineBetween(tailX, tailY, 0, 0);
    graphics.fillStyle(color, 1).fillCircle(tailX, tailY, capRadius).fillCircle(0, 0, capRadius);
  }

  public update(view: Phaser.GameObjects.Container, projectile: Projectile) {
    const emoji = projectileEmoji(projectile);
    const grounded = Boolean(projectile.grounded);
    view.setPosition(projectile.x, projectile.y).setDepth(DEPTH.effects + projectile.y);
    const previous = this.projectileVisualStates.get(view);
    if (
      previous
      && projectile.style !== "finale_star"
      && projectile.style !== "cigarette"
      && previous.style === projectile.style
      && previous.grounded === grounded
      && previous.velocityX === projectile.velocityX
      && previous.velocityY === projectile.velocityY
      && previous.size === projectile.size
      && previous.radius === projectile.radius
      && previous.color === projectile.color
      && previous.emoji === emoji
    ) return;
    this.projectileVisualStates.set(view, {
      style: projectile.style,
      grounded,
      velocityX: projectile.velocityX,
      velocityY: projectile.velocityY,
      size: projectile.size,
      radius: projectile.radius,
      color: projectile.color,
      emoji,
    });
    const speed = Math.hypot(projectile.velocityX, projectile.velocityY) || 1;
    const angle = Math.atan2(projectile.velocityY, projectile.velocityX);
    const {
      trail,
      core,
      icon,
      dragon,
    } = this.projectileViewParts.get(view)!;
    const { color: projectileColor } = Phaser.Display.Color.HexStringToColor(projectile.color);
    trail.clear().setVisible(false).setBlendMode(Phaser.BlendModes.NORMAL);
    core.setVisible(false).setBlendMode(Phaser.BlendModes.NORMAL);
    icon.setVisible(false).setBlendMode(Phaser.BlendModes.NORMAL);
    dragon.setVisible(false).setBlendMode(Phaser.BlendModes.NORMAL);

    if (projectile.style === "sumi_dragon") {
      const frameColor = Phaser.Display.Color.HexStringToColor(projectile.color).color;
      trail
        .setVisible(true)
        .lineStyle(2.5, frameColor, 0.95)
        .strokeCircle(0, 0, projectile.radius + 5)
        .lineStyle(1, 0xffffff, 0.6)
        .strokeCircle(0, 0, projectile.radius + 8);
      dragon
        .setDisplaySize(projectile.size * 2.1, projectile.size * 2.1)
        .setRotation(angle)
        .setAlpha(0.98)
        .setVisible(true);
      return;
    }

    if (projectile.style === "syringe") {
      const directionX = projectile.velocityX / speed;
      const directionY = projectile.velocityY / speed;
      const tailX = -directionX * 34;
      const tailY = -directionY * 34;
      trail.setVisible(true).setBlendMode(Phaser.BlendModes.SCREEN);
      this.drawProjectileTrail(trail, tailX, tailY, 7, projectileColor);
      this.drawProjectileTrail(trail, tailX * 0.72, tailY * 0.72, 2.5, 0xffffff);
      [12, 23, 34].forEach((distance, index) => {
        trail
          .fillStyle(index % 2 ? 0xb9fff5 : projectileColor, 0.5 - index * 0.1)
          .fillCircle(-directionX * distance, -directionY * distance, 4 - index * 0.6);
      });
      icon
        .setText(emoji || "💉")
        .setFontFamily(PROJECTILE_EMOJI_FONT)
        .setFontSize(Math.max(22, projectile.size))
        .setRotation(angle + Math.PI * 0.75)
        .setVisible(true);
      return;
    }

    if (projectile.style === "lollipop" && projectile.grounded) {
      trail.setVisible(true);
      trail.lineStyle(2, projectileColor, 0.72).strokeCircle(0, 0, projectile.radius + 7);
      trail.lineStyle(1, 0xfff2f7, 0.35).strokeCircle(0, 0, projectile.radius + 12);
      icon.setText(emoji || "🍭").setFontSize(Math.max(14, projectile.size)).setRotation(0).setVisible(true);
      return;
    }

    if (projectile.style === "aoe_orb") {
      const tailX = -(projectile.velocityX / speed) * 18;
      const tailY = -(projectile.velocityY / speed) * 18;
      trail.setVisible(true).setBlendMode(Phaser.BlendModes.SCREEN);
      this.drawProjectileTrail(trail, tailX, tailY, 3, projectileColor);
      trail.fillStyle(projectileColor, 0.2).fillCircle(0, 0, 14);
      trail.lineStyle(2, projectileColor, 0.92).strokeCircle(0, 0, 11);
      trail.lineStyle(1, 0xffffff, 0.68).strokeCircle(0, 0, 6);
      if (emoji) icon.setText(emoji).setFontSize(11).setRotation(0).setVisible(true);
      else core.setRadius(4).setFillStyle(0xf8fcff, 0.98).setVisible(true).setBlendMode(Phaser.BlendModes.SCREEN);
      return;
    }

    if (projectile.style === "finale_star") {
      const tailX = -(projectile.velocityX / speed) * 46;
      const tailY = -(projectile.velocityY / speed) * 46;
      const pulse = 1 + Math.sin(this.host.bridge.engine.state.visualTime * 13) * 0.16;
      trail.setVisible(true).setBlendMode(Phaser.BlendModes.SCREEN);
      this.drawProjectileTrail(trail, tailX, tailY, 9, projectileColor);
      this.drawProjectileTrail(trail, tailX * 0.72, tailY * 0.72, 3, 0xffffff);
      trail
        .fillStyle(projectileColor, 0.24)
        .fillCircle(0, 0, projectile.radius + 9)
        .lineStyle(2.5, projectileColor, 0.94)
        .strokeCircle(0, 0, (projectile.radius + 6) * pulse)
        .lineStyle(1.2, 0xffffff, 0.82)
        .strokeCircle(0, 0, projectile.radius + 1);
      icon
        .setText(emoji || "✦")
        .setFontFamily(FONT_FAMILY)
        .setFontSize(Math.max(18, projectile.size))
        .setRotation(this.host.bridge.engine.state.visualTime * 3.8)
        .setScale(pulse)
        .setVisible(true)
        .setBlendMode(Phaser.BlendModes.SCREEN);
      return;
    }

    if (projectile.style === "cigarette") {
      const directionX = projectile.velocityX / speed;
      const directionY = projectile.velocityY / speed;
      const driftX = -directionY;
      const driftY = directionX;
      const smokePhase = this.host.bridge.engine.state.visualTime * 5;
      trail.setVisible(true).setBlendMode(Phaser.BlendModes.SCREEN);
      for (let index = 1; index <= 4; index += 1) {
        const distance = 10 + index * 9;
        const drift = Math.sin(smokePhase + index * 1.4) * (2 + index * 0.7);
        const alpha = 0.42 - index * 0.065;
        trail
          .fillStyle(index % 2 ? 0xe8e3ef : 0xb8b3c4, alpha)
          .fillCircle(
            -directionX * distance + driftX * drift,
            -directionY * distance + driftY * drift,
            5 + index * 1.7,
          );
      }
      trail
        .fillStyle(projectileColor, 0.3)
        .fillCircle(directionX * 7, directionY * 7, projectile.radius + 4);
      icon
        .setText(emoji || "🚬")
        .setFontFamily(PROJECTILE_EMOJI_FONT)
        .setFontSize(Math.max(19, projectile.size))
        .setRotation(angle)
        .setVisible(true);
      return;
    }

    if (emoji) {
      const fontSize = projectile.style === "shark" ? Math.max(12, projectile.size) : Math.max(14, projectile.size);
      icon.setText(emoji).setFontSize(fontSize).setRotation(angle).setVisible(true);
      return;
    }

    const tailX = -(projectile.velocityX / speed) * 22;
    const tailY = -(projectile.velocityY / speed) * 22;
    trail.setVisible(true).setBlendMode(Phaser.BlendModes.SCREEN);
    core.setRadius(Math.max(2, projectile.size)).setFillStyle(0xf8fcff, 0.98).setVisible(true).setBlendMode(Phaser.BlendModes.SCREEN);
    this.drawProjectileTrail(trail, tailX, tailY, projectile.size + 3, projectileColor);
  }

}
