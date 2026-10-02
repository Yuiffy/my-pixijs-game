import {
  BALL_RADIUS,
  CHARACTERS,
  FLOOR,
  HEIGHT,
  NET_TOP,
  NET_X,
  WIDTH,
  clamp,
} from "./engine";
import type { Character, Game, Player } from "./engine";

export interface Assets {
  beach: HTMLImageElement;
  sui: HTMLImageElement;
  shiori: HTMLImageElement;
  suiVictory: HTMLImageElement;
}
// Atlas frames follow their actual alpha bounds, rather than a guessed uniform grid.
const FRAMES: Record<Character, number[][]> = {
  sui: [
    [90, 2, 214, 540],
    [461, 5, 253, 521],
    [836, 5, 240, 523],
    [1183, 79, 303, 457],
    [50, 521, 292, 467],
    [438, 550, 325, 397],
    [846, 533, 246, 491],
    [1264, 590, 206, 427],
  ],
  shiori: [
    [87, 7, 196, 502],
    [472, 8, 234, 496],
    [838, 10, 234, 481],
    [1187, 74, 326, 433],
    [34, 492, 286, 522],
    [419, 546, 356, 407],
    [859, 514, 247, 510],
    [1253, 591, 214, 431],
  ],
};
export async function loadAssets(): Promise<Assets> {
  const load = (file: string) => new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`无法加载素材：${file}`));
      img.src = `/games/beach-volley/${file}`;
    });
  const [beach, sui, shiori, suiVictory] = await Promise.all([
    load("beach.webp"),
    load("sui-atlas.webp"),
    load("shiori-atlas.webp"),
    load("sui-victory.webp"),
  ]);
  return { beach, sui, shiori, suiVictory };
}
const ellipse = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  color: string,
) => {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
};
export function drawCharacter(
  ctx: CanvasRenderingContext2D,
  assets: Assets,
  p: Player,
  x: number,
  y: number,
  scale: number,
  pose: number,
  flip: boolean,
  time: number,
) {
  const victory = p.character === "sui" && pose === 6;
  const frame = victory ? [170, 9, 676, 1495] : FRAMES[p.character][pose];
  const base = victory ? 0.136 : p.character === "sui" ? 0.38 : 0.413;
  const size = base * scale;
  const w = frame[2] * size;
  const h = frame[3] * size;
  const breathing = pose === 0 ? Math.sin(time * 2.4) * 1.7 * scale : 0;
  ctx.save();
  ctx.translate(x, y + breathing);
  if (pose === 7) {
    ctx.rotate(Math.sin(time * 1.45) * 0.018);
    ctx.scale(1, 1 + Math.sin(time * 2.1) * 0.008);
  }
  if (flip) ctx.scale(-1, 1);
  if (p.dive > 0 && scale < 1.2) {
    ctx.translate(0, -27);
    ctx.rotate(0.53);
  }
  // A raised fingertip shares an atlas row with the preceding pose's feet.
  // Clip only that empty corner, preserving the jump hand and excluding its neighbour.
  if (pose === 4) {
    const margin = 24 * size;
    ctx.beginPath();
    ctx.moveTo(-w / 2, -h + margin);
    ctx.lineTo(w * 0.29, -h + margin);
    ctx.lineTo(w * 0.29, -h);
    ctx.lineTo(w / 2, -h);
    ctx.lineTo(w / 2, 0);
    ctx.lineTo(-w / 2, 0);
    ctx.closePath();
    ctx.clip();
  }
  ctx.drawImage(
    victory ? assets.suiVictory : assets[p.character],
    frame[0],
    frame[1],
    frame[2],
    frame[3],
    -w / 2,
    -h,
    w,
    h,
  );
  ctx.restore();
}
function drawBackground(
  ctx: CanvasRenderingContext2D,
  assets: Assets,
  t: number,
  reduced: boolean,
) {
  ctx.drawImage(assets.beach, 0, 0, WIDTH, HEIGHT);
  const motion = reduced ? 0 : t;
  ctx.save();
  // Gentle thin foam ribbons remain behind the playable sand court.
  for (let line = 0; line < 3; line++) {
    ctx.beginPath();
    ctx.strokeStyle = `rgba(255,255,244,${0.15 + line * 0.045})`;
    ctx.lineWidth = 1.4 + line;
    for (let x = 0; x <= WIDTH; x += 8) {
      const y =
        404 +
        line * 7 +
        Math.sin(x * 0.012 + motion * 0.6 + line) * 3 +
        Math.sin(motion * 0.8) * 4;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  for (let i = 0; i < 33; i++) {
    const x = (i * 83.7) % WIDTH;
    const y = 308 + ((i * 39) % 91);
    const a = (Math.sin(motion * 1.8 + i * 4.9) + 1) * 0.18;
    ctx.fillStyle = `rgba(255,255,240,${a})`;
    ctx.fillRect(x, y, 3 + (i % 4), 1.4);
  }
  // Small distant seabirds.
  ctx.strokeStyle = "rgba(43,80,91,.48)";
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 4; i++) {
    const x = 770 + i * 33 + Math.sin(motion * 0.12) * 56;
    const y = 185 + i * 9;
    ctx.beginPath();
    ctx.moveTo(x - 6, y);
    ctx.quadraticCurveTo(x - 3, y - 3 - Math.sin(motion * 2 + i) * 2, x, y);
    ctx.quadraticCurveTo(x + 3, y - 3 - Math.sin(motion * 2 + i) * 2, x + 6, y);
    ctx.stroke();
  }
  ctx.restore();
}
function drawCourt(ctx: CanvasRenderingContext2D) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(100, 486);
  ctx.lineTo(1175, 486);
  ctx.lineTo(1263, 654);
  ctx.lineTo(17, 654);
  ctx.closePath();
  ctx.fillStyle = "rgba(238,198,139,.13)";
  ctx.fill();
  ctx.strokeStyle = "rgba(37,123,133,.53)";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(102, 488);
  ctx.lineTo(1175, 488);
  ctx.strokeStyle = "rgba(255,254,234,.64)";
  ctx.lineWidth = 1;
  ctx.stroke();
  // The net lies across the depth of a side-on playing plane.
  ctx.beginPath();
  ctx.moveTo(600, 471);
  ctx.lineTo(707, 629);
  ctx.strokeStyle = "rgba(101,66,31,.17)";
  ctx.lineWidth = 11;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(610, NET_TOP - 37);
  ctx.lineTo(674, NET_TOP + 17);
  ctx.lineTo(674, 569);
  ctx.lineTo(610, 515);
  ctx.closePath();
  ctx.fillStyle = "rgba(255,255,245,.11)";
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = "rgba(68,81,72,.47)";
  ctx.lineWidth = 1;
  for (let x = 611; x <= 674; x += 8) {
    ctx.beginPath();
    ctx.moveTo(x, 320);
    ctx.lineTo(x, 580);
    ctx.stroke();
  }
  for (let y = 320; y <= 565; y += 12) {
    ctx.beginPath();
    ctx.moveTo(610, y);
    ctx.lineTo(674, y + 54);
    ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = "#fffcdf";
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(610, NET_TOP - 37);
  ctx.lineTo(674, NET_TOP + 17);
  ctx.stroke();
  ctx.strokeStyle = "#1f737e";
  ctx.lineWidth = 9;
  [
    [608, 324, 532],
    [676, 378, 607],
  ].forEach(([x, top, bottom]) => {
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.stroke();
  });
  ctx.strokeStyle = "#badcce";
  ctx.lineWidth = 2;
  [
    [606, 324, 532],
    [674, 378, 607],
  ].forEach(([x, top, bottom]) => {
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.stroke();
  });
  // Visible center stripe makes the collision plane unambiguous.
  ctx.setLineDash([5, 5]);
  ctx.strokeStyle = "rgba(255,255,233,.45)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(NET_X, 486);
  ctx.lineTo(NET_X, 654);
  ctx.stroke();
  ctx.restore();
}
function drawBall(ctx: CanvasRenderingContext2D, g: Game) {
  const b = g.ball;
  const height = FLOOR - b.y;
  ellipse(
    ctx,
    b.x + height * 0.035,
    FLOOR + 3,
    Math.max(9, 23 - height * 0.025),
    5,
    `rgba(89,67,42,${clamp(0.26 - height * 0.0004, 0.07, 0.26)})`,
  );
  g.trail.forEach((t, i) => {
    const alpha = (1 - i / g.trail.length) * (b.power ? 0.48 : 0.15);
    ctx.globalAlpha = alpha;
    ellipse(
      ctx,
      t.x,
      t.y,
      BALL_RADIUS * (1 - i / 19),
      BALL_RADIUS * (1 - i / 19),
      b.power ? CHARACTERS[b.power].color : "#ffffff",
    );
  });
  ctx.globalAlpha = 1;
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(b.spin);
  if (b.power) {
    ctx.shadowColor = CHARACTERS[b.power].color;
    ctx.shadowBlur = 22;
  }
  ellipse(ctx, 0, 0, BALL_RADIUS, BALL_RADIUS, "#fffbee");
  ctx.shadowBlur = 0;
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, BALL_RADIUS - 0.5, 0, Math.PI * 2);
  ctx.clip();
  for (let i = 0; i < 3; i++) {
    ctx.save();
    ctx.rotate((i * Math.PI * 2) / 3);
    ctx.fillStyle = i === 1 ? "#f2cc4c" : "#1a8aad";
    ctx.beginPath();
    ctx.moveTo(-4, -19);
    ctx.bezierCurveTo(14, -14, 15, 0, 8, 17);
    ctx.lineTo(17, 20);
    ctx.lineTo(23, -20);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  const light = ctx.createRadialGradient(-7, -8, 1, 4, 5, 25);
  light.addColorStop(0, "rgba(255,255,255,.52)");
  light.addColorStop(0.5, "rgba(255,255,255,0)");
  light.addColorStop(1, "rgba(22,58,74,.4)");
  ctx.fillStyle = light;
  ctx.fillRect(-22, -22, 44, 44);
  ctx.restore();
  ctx.strokeStyle = "rgba(36,75,74,.28)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, BALL_RADIUS, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}
function caption(
  ctx: CanvasRenderingContext2D,
  text: string,
  y: number,
  size: number,
  color = "#fffbed",
) {
  ctx.font = `800 ${size}px "Microsoft YaHei", sans-serif`;
  ctx.textAlign = "center";
  ctx.shadowColor = "rgba(10,51,67,.4)";
  ctx.shadowBlur = 15;
  ctx.fillStyle = color;
  ctx.fillText(text, WIDTH / 2, y);
  ctx.shadowBlur = 0;
}
export function renderGame(
  ctx: CanvasRenderingContext2D,
  assets: Assets,
  g: Game,
  reduced = false,
) {
  const t = reduced ? 0 : g.time;
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  drawBackground(ctx, assets, t, reduced);
  const menu = g.phase === "menu";
  if (menu) {
    const shade = ctx.createLinearGradient(0, 0, 940, 0);
    shade.addColorStop(0, "rgba(4,48,61,.62)");
    shade.addColorStop(0.53, "rgba(8,63,76,.22)");
    shade.addColorStop(1, "rgba(8,63,76,0)");
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ellipse(ctx, 859, 667, 92, 13, "rgba(66,48,29,.22)");
    ellipse(ctx, 1110, 649, 89, 12, "rgba(66,48,29,.18)");
    drawCharacter(ctx, assets, g.players[1], 1100, 646, 2.17, 0, true, t + 1.5);
    drawCharacter(ctx, assets, g.players[0], 846, 670, 2.5, 0, false, t);
    return;
  }
  drawCourt(ctx);
  if (g.phase === "result") {
    const win = g.winner ?? 0;
    const lose = win === 0 ? 1 : 0;
    const bounce = reduced ? 0 : Math.abs(Math.sin(g.phaseTime * 2.2)) * 13;
    ellipse(ctx, 880, 660, 85, 12, "rgba(66,48,29,.2)");
    drawCharacter(ctx, assets, g.players[lose], 1140, 652, 1.8, 7, true, t);
    drawCharacter(
      ctx,
      assets,
      g.players[win],
      866,
      660 - bounce,
      2.65,
      6,
      false,
      t,
    );
    for (let i = 0; i < 36; i++) {
      const x = 620 + ((i * 137 + Math.sin(t + i) * 20) % 640);
      const y = (i * 79 + t * 39) % 590;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(t + i);
      ctx.fillStyle =
        i % 2 ? "#ffe28f" : CHARACTERS[g.players[win].character].color;
      ctx.fillRect(-3, -2, 7, 4);
      ctx.restore();
    }
    return;
  }
  g.players.forEach((p, i) => {
    if (g.phase === "intro") return;
    const h = FLOOR - p.y;
    ellipse(
      ctx,
      p.x + h * 0.07,
      FLOOR + 2,
      40 - h * 0.045,
      8 - h * 0.008,
      `rgba(88,66,36,${clamp(0.25 - h * 0.0005, 0.1, 0.25)})`,
    );
    const { pose } = p;
    drawCharacter(ctx, assets, p, p.x, p.y, 1, pose, i === 1, t);
    ctx.font = 'bold 13px "Microsoft YaHei", sans-serif';
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(24,77,79,.75)";
    ctx.fillText(CHARACTERS[p.character].name, p.x, FLOOR + 27);
  });
  if (g.phase !== "intro") drawBall(ctx, g);
  if (g.options.mode === "practice" && g.phase === "rally") {
    const { ball } = g;
    const time =
      (-ball.vy +
        Math.sqrt(
          Math.max(0, ball.vy ** 2 + 2 * 1270 * (FLOOR - BALL_RADIUS - ball.y)),
        )) /
      1270;
    const x = clamp(ball.x + ball.vx * time, 25, WIDTH - 25);
    ctx.save();
    ctx.setLineDash([4, 6]);
    ctx.strokeStyle = "#fffbed";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(x, FLOOR, 25, 7, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  g.effects.forEach((p) => {
    ctx.globalAlpha = p.life / p.maxLife;
    ellipse(ctx, p.x, p.y, p.size, p.size, p.color);
  });
  ctx.globalAlpha = 1;
  if (g.phase === "serve") {
    caption(ctx, g.message, 225, 30);
    caption(ctx, g.server === 0 ? "按 J / 空格发球" : g.options.mode === "local" ? "2P · 按 / 或数字 1 发球" : "准备接球", 258, 15);
  }
  if (g.phase === "intro") {
    const a = clamp(g.phaseTime * 2, 0, 1);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = "rgba(7,53,66,.3)";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    drawCharacter(ctx, assets, g.players[0], 344, 662, 2.2, 0, false, t);
    drawCharacter(ctx, assets, g.players[1], 948, 662, 2.2, 0, true, t);
    caption(ctx, "这个夏天，来一场！", 230, 35);
    caption(ctx, "VS", 389, 72);
    ctx.restore();
  }
  if (g.phase === "point") {
    const rise = reduced ? 0 : Math.max(0, 15 - g.phaseTime * 75);
    caption(ctx, g.message, 232 + rise, 36);
    caption(ctx, `${g.score[0]}   :   ${g.score[1]}`, 292 + rise, 43);
  }
  if (g.cutin !== null) {
    const p = g.players[g.cutin];
    const info = CHARACTERS[p.character];
    ctx.save();
    ctx.fillStyle = "rgba(7,38,59,.72)";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    const band = ctx.createLinearGradient(0, 0, WIDTH, 0);
    band.addColorStop(0, "#18365e");
    band.addColorStop(0.8, info.color);
    band.addColorStop(1, "#fff2d4");
    ctx.fillStyle = band;
    ctx.beginPath();
    ctx.moveTo(0, 265);
    ctx.lineTo(WIDTH, 174);
    ctx.lineTo(WIDTH, 502);
    ctx.lineTo(0, 582);
    ctx.fill();
    drawCharacter(ctx, assets, p, 300, 728, 3.05, 5, false, t);
    ctx.fillStyle = "#fffdf0";
    ctx.textAlign = "left";
    ctx.font = "700 17px sans-serif";
    ctx.fillText("SUMMER SPECIAL", 640, 321);
    ctx.font = '900 57px "Microsoft YaHei", sans-serif';
    ctx.fillText(info.special, 632, 401);
    ctx.font = '18px "Microsoft YaHei", sans-serif';
    ctx.fillText(info.line, 640, 450);
    ctx.restore();
  }
}
