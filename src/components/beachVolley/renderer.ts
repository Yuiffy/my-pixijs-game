import {
  BALL_RADIUS,
  CHARACTERS,
  CHARACTER_IDS,
  FLOOR,
  HEIGHT,
  NET_TOP,
  NET_X,
  SPECIAL_WINDUP_TIME,
  WIDTH,
  clamp,
  diveState,
  runState,
  shotVector,
} from "./engine";
import type { Character, Game, Player } from "./engine";
import { FRAMES } from "./frames";
import diveManifest from "../../../public/games/beach-volley/dive/manifest.json";
import runManifest from "../../../public/games/beach-volley/run-v1/manifest.json";

export interface Assets {
  beach: HTMLImageElement;
  atlases: Record<Character, HTMLImageElement>;
  dives: Record<Character, HTMLImageElement>;
  runs: Record<Character, HTMLImageElement>;
  victories: Partial<Record<Character, HTMLImageElement>>;
  heroes: Record<Character, HTMLImageElement>;
  specials: Record<Character, HTMLImageElement>;
}
export async function loadAssets(): Promise<Assets> {
  const load = (file: string) => new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`无法加载素材：${file}`));
      img.src = `/games/beach-volley/${file}`;
    });
  const [beach, characters] = await Promise.all([
    load("beach.webp"),
    Promise.all(
      CHARACTER_IDS.map(async (id) => {
        const victory = CHARACTERS[id].victoryImage;
        const [atlas, hero, special, celebration, dive, run] = await Promise.all([
          load(`${id}-atlas-v2.webp`),
          load(`${id}-hero-v2.webp`),
          load(`special-${id}-v2.webp`),
          victory ? load(victory) : null,
          load(diveManifest.characters[id].file),
          load(runManifest.characters[id].file),
        ]);
        return { id, atlas, hero, special, celebration, dive, run };
      }),
    ),
  ]);
  return {
    beach,
    atlases: Object.fromEntries(
      characters.map((c) => [c.id, c.atlas]),
    ) as Record<Character, HTMLImageElement>,
    dives: Object.fromEntries(characters.map((c) => [c.id, c.dive])) as Record<Character, HTMLImageElement>,
    runs: Object.fromEntries(characters.map((c) => [c.id, c.run])) as Record<Character, HTMLImageElement>,
    heroes: Object.fromEntries(characters.map((c) => [c.id, c.hero])) as Record<
      Character,
      HTMLImageElement
    >,
    specials: Object.fromEntries(
      characters.map((c) => [c.id, c.special]),
    ) as Record<Character, HTMLImageElement>,
    victories: Object.fromEntries(
      characters.filter((c) => c.celebration).map((c) => [c.id, c.celebration]),
    ),
  };
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
  reduced = false,
) {
  const dive = scale < 1.2 ? diveState(p) : null;
  if (dive) {
    const spec = diveManifest.characters[p.character];
    const frame = spec.frames[dive.frame];
    const size = spec.scale * scale;
    ctx.save();
    ctx.translate(x, y - dive.lift * scale);
    if (dive.direction < 0) ctx.scale(-1, 1);
    ctx.drawImage(
      assets.dives[p.character],
      frame[0],
      frame[1],
      frame[2],
      frame[3],
      -spec.anchor[0] * size,
      -spec.anchor[1] * size,
      frame[2] * size,
      frame[3] * size,
    );
    ctx.restore();
    return;
  }
  const movement = scale < 1.2 && pose <= 2 ? runState(p, reduced) : null;
  const run = movement?.active ? movement : null;
  const runOpacity = run ? clamp((run.blend - 0.015) / 0.97, 0, 1) : 0;
  const victory = pose === 6 ? assets.victories[p.character] : null;
  const frame = victory
    ? [0, 0, victory.width, victory.height]
    : FRAMES[p.character][run ? 0 : pose];
  const base = victory ? 265 / victory.height : 232 / FRAMES[p.character][0][3];
  const size = base * scale;
  const w = frame[2] * size;
  const h = frame[3] * size;
  const breathing = !run && pose === 0 ? Math.sin(time * 2.4) * 1.7 * scale : 0;
  ctx.save();
  ctx.translate(x, y + breathing - (run?.lift ?? 0) * scale);
  if (movement) ctx.rotate(movement.lean);
  if (pose === 7) {
    ctx.rotate(Math.sin(time * 1.45) * 0.018);
    ctx.scale(1, 1 + Math.sin(time * 2.1) * 0.008);
  }
  if (run ? run.direction < 0 : flip) ctx.scale(-1, 1);
  const opacity = ctx.globalAlpha;
  ctx.globalAlpha = opacity * (1 - runOpacity);
  ctx.drawImage(
    victory || assets.atlases[p.character],
    frame[0],
    frame[1],
    frame[2],
    frame[3],
    -w / 2,
    -h,
    w,
    h,
  );
  if (run && run.frame !== null) {
    const spec = runManifest.characters[p.character];
    const runFrame = spec.frames[run.frame];
    const runSize = spec.scale * scale;
    ctx.globalAlpha = opacity * runOpacity;
    ctx.drawImage(
      assets.runs[p.character],
      runFrame[0],
      runFrame[1],
      runFrame[2],
      runFrame[3],
      -spec.anchor[0] * runSize,
      -spec.anchor[1] * runSize,
      runFrame[2] * runSize,
      runFrame[3] * runSize,
    );
  }
  ctx.restore();
}
function drawHero(
  ctx: CanvasRenderingContext2D,
  assets: Assets,
  character: Character,
  x: number,
  y: number,
  scale: number,
  time: number,
  flip = false,
) {
  const image = assets.heroes[character];
  const height = 232 * scale;
  const width = (height * image.width) / image.height;
  ctx.save();
  ctx.translate(x, y + Math.sin(time * 2.2) * 2);
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(image, -width / 2, -height, width, height);
  ctx.restore();
}
function drawAim(ctx: CanvasRenderingContext2D, g: Game) {
  if (g.specialWindup) return;
  const side = g.phase === "serve" ? g.server : g.ball.lastHit;
  if (side === null || (side === 1 && g.options.mode !== "local")) return;
  const p = g.players[side];
  if (g.phase !== "serve" && (!p.shotAim || g.ball.lock <= 0)) return;
  const vector = g.phase === "serve" ? shotVector(g.ball, side, p.aim) : g.ball;
  ctx.save();
  ctx.setLineDash([6, 10]);
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = "rgba(255,249,212,.85)";
  ctx.beginPath();
  ctx.moveTo(g.ball.x, g.ball.y);
  let { x } = g.ball;
  let { y } = g.ball;
  let { vx } = vector;
  let { vy } = vector;
  for (let i = 0; i < 90; i++) {
    const crossed = side === 0 ? x > NET_X + 45 : x < NET_X - 45;
    const gravity = g.ball.power
      ? crossed
        ? CHARACTERS[g.ball.power].gravityAfter
        : CHARACTERS[g.ball.power].gravityBefore
      : 1;
    vy += 1270 * gravity * 0.025;
    x += vx * 0.025;
    y += vy * 0.025;
    if (x < BALL_RADIUS || x > WIDTH - BALL_RADIUS) {
      x = clamp(x, BALL_RADIUS, WIDTH - BALL_RADIUS);
      vx *= -0.83;
    }
    if (y < BALL_RADIUS + 12) {
      y = BALL_RADIUS + 12;
      vy = Math.abs(vy) * 0.7;
    }
    ctx.lineTo(x, Math.min(y, FLOOR - BALL_RADIUS));
    if (y >= FLOOR - BALL_RADIUS) break;
  }
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = CHARACTERS[p.character].color;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.ellipse(x, FLOOR, 23, 7, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}
function drawWindup(ctx: CanvasRenderingContext2D, g: Game) {
  if (!g.specialWindup || g.freeze > 0) return;
  const progress = 1 - g.specialWindup.remaining / SPECIAL_WINDUP_TIME;
  ctx.save();
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(255,251,238,.55)";
  ctx.beginPath();
  ctx.arc(g.ball.x, g.ball.y, BALL_RADIUS + 12, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = CHARACTERS[g.players[g.specialWindup.side].character].color;
  ctx.beginPath();
  ctx.arc(g.ball.x, g.ball.y, BALL_RADIUS + 12, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
  ctx.stroke();
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
    drawHero(
      ctx,
      assets,
      g.players[1].character,
      1100,
      646,
      2.2,
      t + 1.5,
      true,
    );
    drawHero(ctx, assets, g.players[0].character, 846, 670, 2.65, t);
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
      2.3,
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
    if (g.phase === "intro" || g.phase === "point") return;
    const h = FLOOR - p.y;
    const dive = diveState(p);
    ellipse(
      ctx,
      p.x + h * 0.07,
      FLOOR + 2,
      dive && dive.phase !== "recover" ? 115 : 40 - h * 0.045,
      8 - h * 0.008,
      `rgba(88,66,36,${clamp(0.25 - h * 0.0005, 0.1, 0.25)})`,
    );
    const { pose } = p;
    const windup = g.freeze <= 0 && g.specialWindup?.side === i ? g.specialWindup : null;
    const progress = windup ? 1 - windup.remaining / SPECIAL_WINDUP_TIME : 0;
    const lean = reduced || !windup ? 0 : Math.sin(progress * Math.PI) * 0.12 * (i === 0 ? -1 : 1);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(lean);
    drawCharacter(ctx, assets, p, 0, 0, 1, pose, i === 1, t, reduced);
    ctx.restore();
    ctx.font = 'bold 13px "Microsoft YaHei", sans-serif';
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(24,77,79,.75)";
    ctx.fillText(CHARACTERS[p.character].name, p.x, FLOOR + 27);
  });
  if (g.phase !== "intro" && g.phase !== "point") drawBall(ctx, g);
  drawWindup(ctx, g);
  if (g.phase === "serve" || g.phase === "rally") drawAim(ctx, g);
  if (g.options.mode === "practice" && g.phase === "rally" && !g.specialWindup) {
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
    caption(
      ctx,
      g.server === 0
        ? "方向 + J 发球 · 上高吊 / 下压球"
        : g.options.mode === "local"
          ? "2P · 方向 + / 或数字 1 发球"
          : "准备接球",
      258,
      15,
    );
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
    const side = g.pointWinner ?? 0;
    ctx.fillStyle = "rgba(8,42,51,.35)";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    drawCharacter(ctx, assets, g.players[side], 925, 682, 2.3, 6, false, t);
    drawCharacter(
      ctx,
      assets,
      g.players[side === 0 ? 1 : 0],
      1150,
      677,
      1.4,
      7,
      true,
      t,
    );
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
    ctx.drawImage(assets.specials[p.character], 0, 0, WIDTH, HEIGHT);
    const shade = ctx.createLinearGradient(0, 0, 900, 0);
    shade.addColorStop(0, "rgba(8,38,48,.92)");
    shade.addColorStop(1, "rgba(8,38,48,0)");
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = "#fffdf0";
    ctx.textAlign = "left";
    ctx.font = "700 17px sans-serif";
    ctx.fillText("SUMMER SPECIAL", 85, 321);
    ctx.font = '900 57px "Microsoft YaHei", sans-serif';
    ctx.fillText(info.special, 80, 401);
    ctx.font = '18px "Microsoft YaHei", sans-serif';
    ctx.fillText(info.line, 85, 450);
    ctx.restore();
  }
}
