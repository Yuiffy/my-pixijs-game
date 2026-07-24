import type { GameState, MechanicalRabbitPet, PineTreeTurret, Projectile } from "../core/gameEngine";
import { mechanicalRabbitMuzzle } from "../core/gameEngine";
import { ENABLE_CANVAS_SHADOWS } from "./layout";
import { text } from "./primitives";

/** 统一设置阴影；关闭时清零，避免残留上一次的 shadowBlur */
const setShadow = (
  ctx: CanvasRenderingContext2D,
  color: string,
  blur: number,
) => {
  if (!ENABLE_CANVAS_SHADOWS) {
    ctx.shadowBlur = 0;
    return;
  }
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
};

const drawMechanicalRabbitPet = (
  ctx: CanvasRenderingContext2D,
  pet: MechanicalRabbitPet,
  visualTime: number,
) => {
  const fade = Math.max(0.25, Math.min(1, pet.life / 0.7));
  const bob = Math.sin(visualTime * 8 + pet.x * 0.03) * 3;
  const aimAngle = Math.atan2(pet.aimY, pet.aimX);
  const muzzleDistance = Math.hypot(
    mechanicalRabbitMuzzle(pet).x - pet.x,
    mechanicalRabbitMuzzle(pet).y - pet.y,
  );
  ctx.save();
  ctx.globalAlpha = fade;
  ctx.fillStyle = "rgba(0, 0, 0, 0.26)";
  ctx.beginPath();
  ctx.ellipse(pet.x, pet.y + pet.radius * 0.88, pet.radius * 1.2, pet.radius * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.translate(pet.x, pet.y + bob);
  ctx.rotate(aimAngle);

  const podGradient = ctx.createLinearGradient(-pet.radius * 0.65, 0, pet.radius * 0.45, 0);
  podGradient.addColorStop(0, "#111a27");
  podGradient.addColorStop(0.55, "#3b4f60");
  podGradient.addColorStop(1, "#728998");
  ctx.fillStyle = podGradient;
  ctx.strokeStyle = "#b8ccd8";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-pet.radius * 0.62, 0);
  ctx.lineTo(-pet.radius * 0.22, -pet.radius * 0.31);
  ctx.lineTo(pet.radius * 0.38, -pet.radius * 0.2);
  ctx.lineTo(pet.radius * 0.5, 0);
  ctx.lineTo(pet.radius * 0.38, pet.radius * 0.2);
  ctx.lineTo(-pet.radius * 0.22, pet.radius * 0.31);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  const cannonTipX = muzzleDistance;
  ctx.fillStyle = "#1b2938";
  ctx.strokeStyle = "#dce6ec";
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.moveTo(-pet.radius * 0.08, -pet.radius * 0.23);
  ctx.lineTo(cannonTipX - pet.radius * 0.08, -pet.radius * 0.1);
  ctx.lineTo(cannonTipX, 0);
  ctx.lineTo(cannonTipX - pet.radius * 0.08, pet.radius * 0.1);
  ctx.lineTo(-pet.radius * 0.08, pet.radius * 0.23);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#f4f0f2";
  ctx.beginPath();
  ctx.moveTo(pet.radius * 0.04, -pet.radius * 0.11);
  ctx.lineTo(cannonTipX - pet.radius * 0.22, -pet.radius * 0.045);
  ctx.lineTo(cannonTipX - pet.radius * 0.08, 0);
  ctx.lineTo(cannonTipX - pet.radius * 0.22, pet.radius * 0.045);
  ctx.lineTo(pet.radius * 0.04, pet.radius * 0.11);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#efc8d1";
  ctx.fillRect(pet.radius * 0.16, -pet.radius * 0.17, pet.radius * 0.24, pet.radius * 0.34);
  ctx.strokeStyle = "#92d7ff";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(pet.radius * 0.4, 0);
  ctx.lineTo(cannonTipX - pet.radius * 0.25, 0);
  ctx.stroke();
  ctx.fillStyle = "#92d7ff";
  setShadow(ctx, "#92d7ff", 8);
  ctx.beginPath();
  ctx.arc(-pet.radius * 0.2, 0, 2.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  if (pet.attackPulse > 0) {
    const flash = 1 + (pet.attackPulse / 0.16) * 0.75;
    ctx.globalCompositeOperation = "screen";
    ctx.fillStyle = "rgba(218, 250, 255, 0.96)";
    ctx.beginPath();
    ctx.arc(cannonTipX, 0, 4.5 * flash, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
};

export const drawMechanicalRabbitPets = (ctx: CanvasRenderingContext2D, state: GameState) => {
  const { battle } = state;
  if (!battle) return;
  battle.pets.forEach((pet) => drawMechanicalRabbitPet(ctx, pet, state.visualTime));
};

const drawPineTreeTurret = (
  ctx: CanvasRenderingContext2D,
  tree: PineTreeTurret,
  visualTime: number,
) => {
  const fade = Math.max(0.35, Math.min(1, tree.life / 0.9));
  const sway = Math.sin(visualTime * 2.4 + tree.x * 0.02) * 1.5;
  ctx.save();
  ctx.globalAlpha = fade;
  ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
  ctx.beginPath();
  ctx.ellipse(tree.x, tree.y + tree.radius * 0.7, tree.radius * 0.95, tree.radius * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.translate(tree.x + sway, tree.y);
  ctx.font = `${Math.round(tree.radius * 2.2)}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("🌲", 0, -2);
  if (tree.attackPulse > 0) {
    const flash = tree.attackPulse / 0.18;
    ctx.globalAlpha = fade * flash * 0.85;
    ctx.fillStyle = "rgba(160, 230, 150, 0.9)";
    ctx.beginPath();
    ctx.arc(0, -tree.radius * 0.2, 8 + flash * 6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
};

export const drawPineTreeTurrets = (ctx: CanvasRenderingContext2D, state: GameState) => {
  const { battle } = state;
  if (!battle) return;
  battle.pineTrees.forEach((tree) => drawPineTreeTurret(ctx, tree, state.visualTime));
};

const projectileEmoji = (projectile: Projectile) => {
  if (projectile.emoji) return projectile.emoji;
  if (projectile.style === "shark") return "🦈";
  if (projectile.style === "carrot") return "🥕";
  if (projectile.style === "coin") return "🪙";
  if (projectile.style === "lollipop") return "🍭";
  return null;
};

export const drawProjectiles = (ctx: CanvasRenderingContext2D, state: GameState) => {
  const { battle } = state;
  if (!battle) return;
  battle.projectiles.forEach((projectile) => {
    const speed = Math.hypot(projectile.velocityX, projectile.velocityY) || 1;
    const angle = Math.atan2(projectile.velocityY, projectile.velocityX);
    const emoji = projectileEmoji(projectile);

    if (projectile.style === "pine_needle") {
      const trailLength = 16;
      const trailX = projectile.x - ((projectile.velocityX / speed) * trailLength);
      const trailY = projectile.y - ((projectile.velocityY / speed) * trailLength);
      ctx.save();
      ctx.strokeStyle = projectile.color;
      ctx.lineWidth = 2.2;
      ctx.lineCap = "round";
      setShadow(ctx, projectile.color, 8);
      ctx.beginPath();
      ctx.moveTo(trailX, trailY);
      ctx.lineTo(projectile.x, projectile.y);
      ctx.stroke();
      ctx.restore();
      return;
    }

    if (emoji) {
      const fontSize = projectile.style === "shark"
        ? Math.max(12, projectile.size)
        : Math.max(14, projectile.size);
      ctx.save();
      ctx.translate(projectile.x, projectile.y);
      ctx.rotate(angle);
      ctx.font = `${fontSize}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(emoji, 0, 0);
      ctx.restore();
      return;
    }

    const trailLength = 22;
    const trailX = projectile.x - ((projectile.velocityX / speed) * trailLength);
    const trailY = projectile.y - ((projectile.velocityY / speed) * trailLength);
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.strokeStyle = projectile.color;
    ctx.lineWidth = projectile.size + 3;
    ctx.lineCap = "round";
    setShadow(ctx, projectile.color, 16);
    ctx.beginPath();
    ctx.moveTo(trailX, trailY);
    ctx.lineTo(projectile.x, projectile.y);
    ctx.stroke();
    ctx.fillStyle = "rgba(248, 252, 255, 0.98)";
    ctx.beginPath();
    ctx.arc(projectile.x, projectile.y, projectile.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
};

export const drawEffects = (ctx: CanvasRenderingContext2D, state: GameState) => {
  const { battle } = state;
  if (!battle) return;

  // 持续绘制时停球（独立于瞬时特效列表）
  battle.chronospheres.forEach((zone) => {
    const lifeRatio = Math.max(0, zone.life / zone.maxLife);
    const pulse = 0.92 + Math.sin(state.visualTime * 6) * 0.04;
    ctx.save();
    ctx.globalAlpha = 0.22 + lifeRatio * 0.28;
    const fill = ctx.createRadialGradient(zone.x, zone.y, 8, zone.x, zone.y, zone.radius * pulse);
    fill.addColorStop(0, "rgba(90, 40, 140, 0.55)");
    fill.addColorStop(0.55, "rgba(120, 60, 180, 0.28)");
    fill.addColorStop(1, "rgba(40, 10, 70, 0)");
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(zone.x, zone.y, zone.radius * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = zone.color;
    ctx.lineWidth = 3;
    setShadow(ctx, zone.color, 18);
    ctx.beginPath();
    ctx.arc(zone.x, zone.y, zone.radius * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  });

  battle.effects.forEach((effect) => {
    const progress = 1 - effect.life / effect.maxLife;
    const alpha = Math.max(0, effect.life / effect.maxLife);
    ctx.save();
    ctx.globalAlpha = alpha;
    if (effect.kind === "cast") {
      const radius = (effect.size || 58) * (0.72 + progress * 0.28);
      const orbit = radius * 0.72;
      ctx.globalCompositeOperation = "screen";
      ctx.fillStyle = effect.color;
      ctx.globalAlpha = alpha * 0.1;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, radius * 0.78, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = effect.color;
      ctx.lineWidth = Math.max(2, 5 * (1 - progress));
      setShadow(ctx, effect.color, 16);
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "rgba(244, 251, 255, 0.8)";
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, radius * 0.58, 0, Math.PI * 2);
      ctx.stroke();
      for (let spark = 0; spark < 3; spark += 1) {
        const angle = progress * Math.PI * 2 + (spark * Math.PI * 2) / 3;
        ctx.fillStyle = spark === 0 ? "#f4fbff" : effect.color;
        ctx.beginPath();
        ctx.arc(
          effect.x + Math.cos(angle) * orbit,
          effect.y + Math.sin(angle) * orbit,
          spark === 0 ? 3.4 : 2.4,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    } else if (effect.kind === "line") {
      const targetX = effect.x2 || effect.x;
      const targetY = effect.y2 || effect.y;
      const width = effect.size || 3;
      const travel = Math.min(1, progress * 1.35);
      const tail = Math.max(0, travel - 0.2);
      const pulseX = effect.x + (targetX - effect.x) * travel;
      const pulseY = effect.y + (targetY - effect.y) * travel;
      ctx.globalCompositeOperation = "screen";
      ctx.beginPath();
      ctx.moveTo(effect.x, effect.y);
      ctx.lineTo(targetX, targetY);
      ctx.strokeStyle = effect.color;
      ctx.lineWidth = width + 4;
      ctx.globalAlpha = alpha * 0.3;
      setShadow(ctx, effect.color, 18);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(
        effect.x + (targetX - effect.x) * tail,
        effect.y + (targetY - effect.y) * tail,
      );
      ctx.lineTo(pulseX, pulseY);
      ctx.strokeStyle = "rgba(244, 251, 255, 0.96)";
      ctx.lineWidth = Math.max(1, width * 0.48);
      ctx.globalAlpha = alpha;
      setShadow(ctx, effect.color, 4);
      ctx.stroke();
      ctx.fillStyle = "#f4fbff";
      ctx.beginPath();
      ctx.arc(pulseX, pulseY, width + 2, 0, Math.PI * 2);
      ctx.fill();
    } else if (effect.kind === "ring") {
      const radius = effect.size || 80;
      const arrival = 1 - Math.pow(1 - progress, 3);
      const fieldRadius = Math.max(6, radius * (0.72 + arrival * 0.28));
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = alpha * 0.12;
      ctx.fillStyle = effect.color;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, fieldRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, fieldRadius, 0, Math.PI * 2);
      ctx.strokeStyle = effect.color;
      ctx.lineWidth = Math.max(2, 7 * (1 - progress));
      ctx.stroke();
      ctx.strokeStyle = "rgba(244, 251, 255, 0.66)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, Math.max(5, radius * arrival * 0.72), 0, Math.PI * 2);
      ctx.stroke();
    } else if (effect.kind === "burst") {
      const radius = (effect.size || 40) * (0.35 + progress * 0.65);
      const gradient = ctx.createRadialGradient(effect.x, effect.y, 0, effect.x, effect.y, radius);
      gradient.addColorStop(0, effect.color);
      gradient.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, radius, 0, Math.PI * 2);
      ctx.fill();
    } else if (effect.kind === "chronosphere") {
      const radius = (effect.size || 120) * (0.7 + progress * 0.35);
      const gradient = ctx.createRadialGradient(effect.x, effect.y, 0, effect.x, effect.y, radius);
      gradient.addColorStop(0, "rgba(180, 120, 255, 0.55)");
      gradient.addColorStop(0.6, "rgba(90, 40, 160, 0.25)");
      gradient.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = effect.color;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, radius * 0.92, 0, Math.PI * 2);
      ctx.stroke();
    } else if (effect.kind === "hotpot") {
      const radius = (effect.size || 130) * (0.45 + progress * 0.7);
      const pot = ctx.createRadialGradient(effect.x, effect.y, 4, effect.x, effect.y, radius);
      pot.addColorStop(0, "rgba(255, 220, 120, 0.85)");
      pot.addColorStop(0.35, "rgba(255, 90, 40, 0.55)");
      pot.addColorStop(0.7, "rgba(180, 20, 20, 0.28)");
      pot.addColorStop(1, "rgba(80, 0, 0, 0)");
      ctx.globalCompositeOperation = "screen";
      ctx.fillStyle = pot;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#ff6b2d";
      ctx.lineWidth = 5 * (1 - progress * 0.5);
      setShadow(ctx, "#ff3b1a", 22);
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, radius * 0.72, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, radius * 0.48, 0, Math.PI * 2);
      ctx.strokeStyle = "#ffd27a";
      ctx.lineWidth = 2.5;
      ctx.stroke();
    } else {
      text(ctx, effect.text || "", effect.x, effect.y - progress * 26, effect.size || 14, effect.color, "center", 800);
    }
    ctx.restore();
  });
};
