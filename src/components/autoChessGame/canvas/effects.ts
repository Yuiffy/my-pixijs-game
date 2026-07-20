import type { GameState, MechanicalRabbitPet } from "../core/gameEngine";
import { mechanicalRabbitMuzzle } from "../core/gameEngine";
import { text } from "./primitives";

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
  ctx.shadowColor = "#92d7ff";
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.arc(-pet.radius * 0.2, 0, 2.4, 0, Math.PI * 2);
  ctx.fill();
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
  const battle = state.battle;
  if (!battle) return;
  battle.pets.forEach((pet) => drawMechanicalRabbitPet(ctx, pet, state.visualTime));
};

export const drawProjectiles = (ctx: CanvasRenderingContext2D, state: GameState) => {
  const battle = state.battle;
  if (!battle) return;
  battle.projectiles.forEach((projectile) => {
    const speed = Math.hypot(projectile.velocityX, projectile.velocityY) || 1;
    const trailLength = 22;
    const trailX = projectile.x - ((projectile.velocityX / speed) * trailLength);
    const trailY = projectile.y - ((projectile.velocityY / speed) * trailLength);
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.strokeStyle = projectile.color;
    ctx.lineWidth = projectile.size + 3;
    ctx.lineCap = "round";
    ctx.shadowColor = projectile.color;
    ctx.shadowBlur = 16;
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
  const battle = state.battle;
  if (!battle) return;
  battle.effects.forEach((effect) => {
    const progress = 1 - effect.life / effect.maxLife;
    const alpha = Math.max(0, effect.life / effect.maxLife);
    ctx.save();
    ctx.globalAlpha = alpha;
    if (effect.kind === "line") {
      const targetX = effect.x2 || effect.x;
      const targetY = effect.y2 || effect.y;
      const width = effect.size || 3;
      ctx.globalCompositeOperation = "screen";
      ctx.beginPath();
      ctx.moveTo(effect.x, effect.y);
      ctx.lineTo(targetX, targetY);
      ctx.strokeStyle = effect.color;
      ctx.lineWidth = width + 4;
      ctx.shadowColor = effect.color;
      ctx.shadowBlur = 18;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(effect.x, effect.y);
      ctx.lineTo(targetX, targetY);
      ctx.strokeStyle = "rgba(244, 251, 255, 0.96)";
      ctx.lineWidth = Math.max(1, width * 0.48);
      ctx.shadowBlur = 4;
      ctx.stroke();
    } else if (effect.kind === "ring") {
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, Math.max(6, (effect.size || 80) * progress), 0, Math.PI * 2);
      ctx.strokeStyle = effect.color;
      ctx.lineWidth = Math.max(2, 8 * (1 - progress));
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
    } else {
      text(ctx, effect.text || "", effect.x, effect.y - progress * 26, effect.size || 14, effect.color, "center", 800);
    }
    ctx.restore();
  });
};
