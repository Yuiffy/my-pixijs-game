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

    if (projectile.style === "lollipop" && projectile.grounded) {
      ctx.save();
      ctx.strokeStyle = projectile.color;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.72;
      setShadow(ctx, projectile.color, 8);
      ctx.beginPath();
      ctx.arc(projectile.x, projectile.y, projectile.radius + 7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(projectile.x, projectile.y, projectile.radius + 12, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      ctx.save();
      ctx.translate(projectile.x, projectile.y);
      ctx.font = `${Math.max(14, projectile.size)}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(emoji || "🍭", 0, 0);
      ctx.restore();
      return;
    }

    if (projectile.style === "aoe_orb") {
      const tailX = projectile.x - ((projectile.velocityX / speed) * 18);
      const tailY = projectile.y - ((projectile.velocityY / speed) * 18);
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.strokeStyle = projectile.color;
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      setShadow(ctx, projectile.color, 14);
      ctx.beginPath();
      ctx.moveTo(tailX, tailY);
      ctx.lineTo(projectile.x, projectile.y);
      ctx.stroke();
      ctx.globalAlpha = 0.2;
      ctx.fillStyle = projectile.color;
      ctx.beginPath();
      ctx.arc(projectile.x, projectile.y, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.92;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(projectile.x, projectile.y, 11, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = "#ffffff";
      ctx.globalAlpha = 0.68;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(projectile.x, projectile.y, 6, 0, Math.PI * 2);
      ctx.stroke();
      if (emoji) {
        ctx.globalAlpha = 1;
        ctx.font = '11px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(emoji, projectile.x, projectile.y);
      }
      ctx.restore();
      return;
    }

    if (projectile.style === "finale_star") {
      const tailX = projectile.x - ((projectile.velocityX / speed) * 46);
      const tailY = projectile.y - ((projectile.velocityY / speed) * 46);
      const pulse = 1 + Math.sin(state.visualTime * 13) * 0.16;
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.lineCap = "round";
      setShadow(ctx, projectile.color, 18);
      ctx.strokeStyle = projectile.color;
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.moveTo(tailX, tailY);
      ctx.lineTo(projectile.x, projectile.y);
      ctx.stroke();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(projectile.x + (tailX - projectile.x) * 0.72, projectile.y + (tailY - projectile.y) * 0.72);
      ctx.lineTo(projectile.x, projectile.y);
      ctx.stroke();
      ctx.fillStyle = `${projectile.color}3d`;
      ctx.beginPath();
      ctx.arc(projectile.x, projectile.y, projectile.radius + 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = projectile.color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(projectile.x, projectile.y, (projectile.radius + 6) * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.translate(projectile.x, projectile.y);
      ctx.rotate(state.visualTime * 3.8);
      ctx.scale(pulse, pulse);
      ctx.fillStyle = "#ffffff";
      ctx.font = `800 ${Math.max(18, projectile.size)}px "Microsoft YaHei", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(emoji || "✦", 0, 0);
      ctx.restore();
      return;
    }

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
    if (effect.kind === "emoji_burst") {
      const pickaxeBounce = effect.text === "⛏️";
      const bounce = pickaxeBounce ? Math.sin(progress * Math.PI) * 46 : 0;
      ctx.globalAlpha = alpha ** 0.65;
      ctx.translate(
        effect.x,
        effect.y + (pickaxeBounce ? -10 - bounce - progress * 8 : 0),
      );
      if (pickaxeBounce) ctx.rotate(-0.72 + progress * 2.8);
      const scale = pickaxeBounce
        ? 0.82 + Math.sin(progress * Math.PI) * 0.34
        : 0.62 + progress * 1.48;
      ctx.font = `${(effect.size || (pickaxeBounce ? 26 : 32)) * scale}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(effect.text || "😂", 0, 0);
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
    } else if (effect.kind === "finale") {
      const radius = effect.size || 150;
      const arrival = 1 - (1 - Math.min(1, progress * 1.5)) ** 3;
      const stageRadius = radius * (0.42 + arrival * 0.58);
      ctx.globalCompositeOperation = "screen";
      ctx.fillStyle = `${effect.color}26`;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, stageRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = effect.color;
      ctx.lineWidth = Math.max(2, 7 * (1 - progress));
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.72)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, stageRadius * 0.72, 0, Math.PI * 2);
      ctx.stroke();
      for (let index = 0; index < 12; index += 1) {
        const angle = progress * 0.72 + (Math.PI * 2 * index) / 12;
        const inner = stageRadius * (index % 2 ? 0.64 : 0.54);
        const outer = stageRadius * (index % 2 ? 0.9 : 1);
        ctx.beginPath();
        ctx.moveTo(effect.x + Math.cos(angle) * inner, effect.y + Math.sin(angle) * inner);
        ctx.lineTo(effect.x + Math.cos(angle) * outer, effect.y + Math.sin(angle) * outer);
        ctx.stroke();
      }
    } else if (effect.kind === "energy_pulse") {
      const radius = (effect.size || 48) * (0.35 + (1 - (1 - progress) ** 2) * 0.65);
      ctx.globalCompositeOperation = "screen";
      ctx.fillStyle = `${effect.color}24`;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = effect.color;
      ctx.lineWidth = Math.max(1.5, 4 * (1 - progress));
      ctx.stroke();
      text(ctx, effect.text || "+15 能量", effect.x, effect.y - radius * 0.72 - progress * 10, 11, "#f7ddff", "center", 800);
    } else if (effect.kind === "ring") {
      const radius = effect.size || 80;
      const arrival = 1 - (1 - progress) ** 3;
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
    } else if (effect.kind === "healing_field") {
      const radius = effect.size || 145;
      const fieldAlpha = Math.min(1, alpha * 5);
      const breath = 0.5 + Math.sin(progress * Math.PI * 8) * 0.5;
      const markerDistance = radius * 0.7;
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = fieldAlpha * 0.025;
      ctx.fillStyle = effect.color;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = fieldAlpha * (0.3 + breath * 0.06);
      ctx.strokeStyle = effect.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = fieldAlpha * 0.12;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, radius * 0.84, 0, Math.PI * 2);
      ctx.stroke();
      const centerGlow = ctx.createRadialGradient(
        effect.x,
        effect.y,
        0,
        effect.x,
        effect.y,
        48,
      );
      centerGlow.addColorStop(0, "rgba(217,255,240,0.44)");
      centerGlow.addColorStop(0.42, effect.color);
      centerGlow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.globalAlpha = fieldAlpha * (0.18 + breath * 0.035);
      ctx.fillStyle = centerGlow;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, 48, 0, Math.PI * 2);
      ctx.fill();
      for (let index = 0; index < 4; index += 1) {
        const angle = index * (Math.PI / 2);
        const markerX = effect.x + Math.cos(angle) * markerDistance;
        const markerY = effect.y + Math.sin(angle) * markerDistance;
        ctx.globalAlpha = fieldAlpha * 0.78;
        ctx.strokeStyle = "#d9fff0";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(markerX - 4.5, markerY);
        ctx.lineTo(markerX + 4.5, markerY);
        ctx.moveTo(markerX, markerY - 4.5);
        ctx.lineTo(markerX, markerY + 4.5);
        ctx.stroke();
      }
      ctx.globalAlpha = fieldAlpha * 0.92;
      ctx.strokeStyle = "#d9fff0";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(effect.x - 11, effect.y);
      ctx.lineTo(effect.x + 11, effect.y);
      ctx.moveTo(effect.x, effect.y - 11);
      ctx.lineTo(effect.x, effect.y + 11);
      ctx.stroke();
    } else if (effect.kind === "healing_pulse") {
      const radius = (effect.size || 64) * (0.34 + progress * 0.3);
      const crossY = effect.y - progress * 9;
      const pulse = ctx.createRadialGradient(
        effect.x,
        effect.y,
        0,
        effect.x,
        effect.y,
        radius * 1.18,
      );
      pulse.addColorStop(0, "rgba(217,255,240,0.92)");
      pulse.addColorStop(0.38, effect.color);
      pulse.addColorStop(1, "rgba(0,0,0,0)");
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = alpha * 0.5;
      ctx.fillStyle = pulse;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, radius * 1.18, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = alpha * 0.48;
      ctx.strokeStyle = effect.color;
      ctx.lineWidth = Math.max(1, 2.5 * (1 - progress));
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = "#d9fff0";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(effect.x - 11, crossY);
      ctx.lineTo(effect.x + 11, crossY);
      ctx.moveTo(effect.x, crossY - 11);
      ctx.lineTo(effect.x, crossY + 11);
      ctx.stroke();
      for (let index = 0; index < 3; index += 1) {
        const angle = -Math.PI * (0.16 + index * 0.34);
        const distance = 17 + progress * (10 + index * 3);
        ctx.globalAlpha = alpha * (0.8 - progress * 0.35);
        ctx.fillStyle = index === 1 ? "#d9fff0" : effect.color;
        ctx.beginPath();
        ctx.arc(
          effect.x + Math.cos(angle) * distance,
          effect.y + Math.sin(angle) * distance - progress * 8,
          2.5 - progress * 0.7,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    } else if (effect.kind === "burst") {
      const radius = (effect.size || 40) * (0.35 + progress * 0.65);
      const gradient = ctx.createRadialGradient(effect.x, effect.y, 0, effect.x, effect.y, radius);
      gradient.addColorStop(0, effect.color);
      gradient.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, radius, 0, Math.PI * 2);
      ctx.fill();
    } else if (effect.kind === "rebirth") {
      const radius = effect.size || 78;
      const outerRadius = radius * (0.28 + progress * 0.92);
      const innerRadius = radius * (1.08 - progress * 0.54);
      const flash = Math.max(0, 1 - progress * 1.5);
      const glow = ctx.createRadialGradient(
        effect.x,
        effect.y,
        0,
        effect.x,
        effect.y,
        innerRadius,
      );
      glow.addColorStop(0, `rgba(255,255,255,${0.46 + flash * 0.3})`);
      glow.addColorStop(0.38, effect.color);
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = alpha * (0.42 + flash * 0.36);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, innerRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = effect.color;
      ctx.lineWidth = Math.max(1.5, 5 * (1 - progress));
      setShadow(ctx, effect.color, 18);
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, outerRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.82)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, innerRadius, 0, Math.PI * 2);
      ctx.stroke();
      for (let index = 0; index < 8; index += 1) {
        const angle = index * (Math.PI / 4) + progress * 0.9;
        const rayStart = innerRadius * 0.48;
        const rayEnd = innerRadius * (0.86 + (index % 2) * 0.12);
        ctx.strokeStyle = index % 2 ? effect.color : "rgba(255,255,255,0.9)";
        ctx.lineWidth = index % 2 ? 2 : 3;
        ctx.beginPath();
        ctx.moveTo(
          effect.x + Math.cos(angle) * rayStart,
          effect.y + Math.sin(angle) * rayStart,
        );
        ctx.lineTo(
          effect.x + Math.cos(angle) * rayEnd,
          effect.y + Math.sin(angle) * rayEnd,
        );
        ctx.stroke();
      }
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
