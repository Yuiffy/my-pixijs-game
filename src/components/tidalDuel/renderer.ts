import { FLOOR, HEIGHT, WIDTH, fighterBoxes, clamp } from "./engine";
import type { Fighter, Game } from "./engine";
import { FIGHTERS, getFighter, getSkin } from "./roster";
import layout from "../../../public/games/tidal-duel/pixel/source-layout.json";

interface SkinAssets {
  seed: HTMLImageElement;
  motion: HTMLImageElement;
  combat: HTMLImageElement;
}
export interface Assets {
  stage: HTMLImageElement;
  characters: Record<string, Record<string, SkinAssets>>;
}
export interface PixelFrame {
  sheet: "motion" | "combat";
  index: number;
}
export const SPRITE_LAYOUT = {
  tile: layout.frameSize,
  anchor: layout.anchor,
  bodyHeight: layout.bodyHeight,
};
const TILE = SPRITE_LAYOUT.tile;
const r = (n: number) => Math.round(n / 2) * 2;
function loadImage(path: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`无法加载游戏素材：${path}`));
    image.src = path;
  });
}
export async function loadAssets(): Promise<Assets> {
  const [stage, characters] = await Promise.all([
    loadImage("/games/tidal-duel/pixel/boardwalk.webp"),
    Promise.all(
      FIGHTERS.map(
        async (f) => [
            f.id,
            Object.fromEntries(
              await Promise.all(
                (f.skins ?? []).map(async (skin) => {
                  const [seed, motion, combat] = await Promise.all([
                    loadImage(skin.seed),
                    loadImage(skin.motion),
                    loadImage(skin.combat),
                  ]);
                  return [skin.id, { seed, motion, combat }] as const;
                }),
              ),
            ),
          ] as const,
      ),
    ).then((entries) => Object.fromEntries(entries)),
  ]);
  return { stage, characters };
}
function skinAssets(assets: Assets, f: Fighter) {
  const info = getFighter(f.character);
  return assets.characters[info.id][getSkin(info, f.skin)?.id ?? "original"];
}
/** Startup, active and recovery use the move clock; hitstop freezes the pose. */
export function pixelFrame(f: Fighter, reduced = false): PixelFrame {
  const motion = (index: number): PixelFrame => ({ sheet: "motion", index });
  const combat = (index: number): PixelFrame => ({ sheet: "combat", index });
  if (f.state === "attack" && f.move) {
    const m = getFighter(f.character).moves[f.move];
    const animation =
      m.animation ??
      (m.height === "low"
        ? "low"
        : f.move.toLowerCase().includes("kick")
          ? "kick"
          : m.launcher
            ? "rise"
            : m.kind === "super" || m.kind === "throw"
              ? "skill"
              : "punch");
    const rows: Record<string, number> = {
      punch: 0,
      kick: 4,
      low: 8,
      skill: 12,
      rise: 16,
    };
    const row = rows[animation] ?? 0;
    const phase =
      f.moveTime < m.startup
        ? 0
        : f.moveTime < m.startup + m.active
          ? 1
          : f.moveTime < m.startup + m.active + m.recovery * 0.6
            ? 2
            : 3;
    return combat(row + phase);
  }
  if (f.state === "walk") return motion(4 + (Math.floor(f.stateTime * 10) % 4));
  if (f.state === "jump") return motion(
      f.stateTime < 0.065 ? 12 : f.vy < -140 ? 13 : f.vy < 230 ? 14 : 15,
    );
  if (f.state === "crouch") return motion(f.stateTime < 0.065 ? 8 : 9);
  if (f.state === "guard") return motion(
      f.previous.crouch ? 9 : 10 + (Math.floor(f.stateTime * 6) % 2),
    );
  if (f.state === "hold") return motion(f.holdHeight === "low" ? 8 : 11);
  if (["hit", "critical", "grabbed", "launch"].includes(f.state)) return combat(
      f.state === "critical" || f.state === "launch" || f.stateTime > 0.08
        ? 21
        : 20,
    );
  if (["down", "defeat"].includes(f.state)) return combat(22);
  if (f.state === "wake") return f.stateTime < 0.12 ? combat(22) : motion(8);
  if (f.state === "victory") return combat(23);
  return motion(reduced ? 0 : Math.floor(f.stateTime * 5) % 4);
}
function text(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  size: number,
  color = "#fff0d3",
  align: CanvasTextAlign = "left",
  weight = 700,
) {
  ctx.font = `${weight} ${size}px "Microsoft YaHei", "PingFang SC", sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(value, r(x), r(y));
}
function rect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
) {
  ctx.fillStyle = color;
  ctx.fillRect(r(x), r(y), r(w), r(h));
}
function sprite(
  ctx: CanvasRenderingContext2D,
  assets: Assets,
  f: Fighter,
  x: number,
  y: number,
  scale = 2,
  reduced = false,
  frame = pixelFrame(f, reduced),
) {
  const image = skinAssets(assets, f)[frame.sheet];
  ctx.save();
  ctx.translate(r(x), r(y));
  ctx.scale(f.facing, 1);
  ctx.drawImage(
    image,
    (frame.index % 4) * TILE,
    Math.floor(frame.index / 4) * TILE,
    TILE,
    TILE,
    -SPRITE_LAYOUT.anchor[0] * scale,
    -SPRITE_LAYOUT.anchor[1] * scale,
    TILE * scale,
    TILE * scale,
  );
  ctx.restore();
}
function drawStage(
  ctx: CanvasRenderingContext2D,
  assets: Assets,
  game: Game,
  center: number,
  reduced: boolean,
) {
  ctx.drawImage(assets.stage, 0, 0, WIDTH, HEIGHT);
  const drift = r((center - WIDTH / 2) * -0.065);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, WIDTH, 466);
  ctx.clip();
  ctx.drawImage(assets.stage, drift, 0, WIDTH, HEIGHT);
  ctx.restore();
  const time = reduced ? 0 : game.time;
  for (let i = 0; i < 35; i++) rect(
      ctx,
      220 + ((i * 173 + drift) % 850),
      322 + ((i * 17) % 100),
      2 + (i % 3) * 2,
      2,
      `rgba(255,228,172,${0.08 + (Math.sin(time * 1.6 + i * 3.3) + 1) * 0.12})`,
    );
  const shade = ctx.createLinearGradient(0, 0, 0, 150);
  shade.addColorStop(0, "#271e3dd9");
  shade.addColorStop(1, "#271e3d00");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, WIDTH, 150);
  rect(ctx, 0, 644, WIDTH, 76, "#241e3985");
}
function screen(f: Fighter, center: number) {
  return { x: r(WIDTH / 2 + f.x - center), y: r(f.y + f.z * 18) };
}
function drawFighter(
  ctx: CanvasRenderingContext2D,
  assets: Assets,
  f: Fighter,
  game: Game,
  center: number,
  reduced: boolean,
) {
  const p = screen(f, center);
  const info = getFighter(f.character);
  rect(ctx, p.x - 62, FLOOR + f.z * 18 + 2, 124, 8, "#241e3960");
  rect(ctx, p.x - 44, FLOOR + f.z * 18, 88, 6, "#211b3d70");
  const frame = pixelFrame(f, reduced);
  const move = f.move ? info.moves[f.move] : null;
  if (
    !reduced &&
    (f.state === "sidestep" ||
      (f.state === "attack" && (move?.advance || move?.kind === "super")))
  ) {
    for (let i = 3; i > 0; i--) {
      ctx.save();
      ctx.globalAlpha = 0.13 - i * 0.025;
      sprite(
        ctx,
        assets,
        f,
        p.x - f.facing * i * 28,
        p.y + i * 2,
        2,
        reduced,
        frame,
      );
      ctx.restore();
    }
  }
  if (f.invincible > 0 && Math.floor(game.time * 15) % 2) ctx.globalAlpha = 0.68;
  sprite(ctx, assets, f, p.x, p.y, 2, reduced, frame);
  ctx.globalAlpha = 1;
  if (f.state === "sidestep" || f.state === "hold") {
    rect(ctx, p.x - 42, FLOOR + f.z * 18 + 10, 84, 2, info.color);
    if (f.state === "hold") text(
        ctx,
        { high: "上段反击", mid: "中段反击", low: "下段反击" }[f.holdHeight],
        p.x,
        p.y - 392,
        12,
        info.color,
        "center",
      );
  }
  if (
    move &&
    f.state === "attack" &&
    f.moveTime >= move.startup &&
    f.moveTime < move.startup + move.active &&
    !move.projectile &&
    !reduced
  ) {
    const box = fighterBoxes(f).attack;
    if (box) for (let i = 0; i < 4; i++) rect(
          ctx,
          p.x + f.facing * (move.reach - 20 - i * 24),
          box.y + box.h / 2 + f.z * 18 + i * 4,
          20 - i * 2,
          2,
          i ? `${info.color}80` : "#fff3cf",
        );
  }
}
function effects(
  ctx: CanvasRenderingContext2D,
  game: Game,
  center: number,
  reduced: boolean,
) {
  for (const p of game.projectiles) {
    const x = r(p.x - center + WIDTH / 2);
    const y = r(p.y);
    const dir = Math.sign(p.velocity);
    const pulse = reduced ? 0 : Math.floor(game.time * 12) % 3;
    for (let i = 6; i >= 0; i--) {
      const size = 10 + (6 - i) * 4;
      rect(
        ctx,
        x - dir * i * 10 - size / 2,
        y - size / 2 + (i % 2 ? pulse * 2 : 0),
        size,
        size,
        i > 3 ? "#7de5e350" : i ? "#7de5e3b0" : "#fff8db",
      );
    }
  }
  for (const e of game.events) {
    if (
      ["round", "ko", "whiff", "projectile", "super", "sidestep"].includes(
        e.type,
      )
    ) continue;
    const age = clamp((0.82 - e.ttl) / 0.32, 0, 1);
    if (age >= 1) continue;
    const info = getFighter(game.fighters[e.side].character);
    const burst = ["burst", "cancel", "tech", "guardBreak"].includes(e.type);
    const blocked = e.type === "block" || e.type === "hold";
    const x = r(e.x - center + WIDTH / 2);
    const y = r(e.y + e.z * 18 - 30);
    ctx.save();
    ctx.globalAlpha = 1 - age;
    const radius = (burst ? 80 : blocked ? 32 : 44) + age * 62;
    const count = reduced ? 4 : 10;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + e.id * 0.7;
      const distance = radius * (0.45 + age * 0.7);
      const size = Math.max(2, r((blocked ? 5 : 10) * (1 - age)));
      rect(
        ctx,
        x + Math.cos(angle) * distance,
        y + Math.sin(angle) * distance,
        size + (i % 2 ? 8 : 0),
        size,
        i % 3 ? (blocked ? "#b8fff0" : "#ffe5a2") : info.color,
      );
    }
    if (!blocked) {
      rect(ctx, x - 4, y - 16, 8, 32, "#fff8e1");
      rect(ctx, x - 16, y - 4, 32, 8, "#fff8e1");
    }
    ctx.restore();
  }
}
function portrait(
  ctx: CanvasRenderingContext2D,
  assets: Assets,
  f: Fighter,
  x: number,
  y: number,
) {
  rect(ctx, x, y, 60, 60, "#342943");
  ctx.drawImage(
    skinAssets(assets, f).motion,
    SPRITE_LAYOUT.anchor[0] - 25,
    SPRITE_LAYOUT.anchor[1] - SPRITE_LAYOUT.bodyHeight - 1,
    60,
    60,
    x,
    y,
    60,
    60,
  );
}
function hud(ctx: CanvasRenderingContext2D, assets: Assets, game: Game) {
  game.fighters.forEach((f, side) => {
    const right = side === 1;
    const dir = right ? -1 : 1;
    const align = right ? "right" : "left";
    const info = getFighter(f.character);
    const x = right ? 1156 : 124;
    portrait(ctx, assets, f, right ? 1180 : 40, 28);
    text(ctx, info.name, x, 50, 22, "#fff1d8", align);
    text(
      ctx,
      side === 0 ? "1P" : game.options.mode === "local" ? "2P" : "CPU",
      x + dir * 90,
      48,
      11,
      info.color,
      align,
    );
    const w = 422;
    const start = right ? x - w : x;
    rect(ctx, start - 2, 60, w + 4, 22, "#1d192fd9");
    rect(ctx, start, 62, w, 18, "#6b4261");
    const recent = Math.max(
      0,
      ...game.events
        .filter(
          (e) => e.target === f.side && ["hit", "throw", "hold"].includes(e.type),
        )
        .map((e) => e.ttl),
    );
    const ghost = (Math.min(300, f.hp + f.lastDamage * recent * 1.8) / 300) * w;
    rect(ctx, right ? x - ghost : x, 62, ghost, 18, "#f2a16e");
    const health = (f.hp / 300) * w;
    rect(ctx, right ? x - health : x, 62, health, 18, "#fff0ca");
    rect(ctx, right ? x - health : x, 62, health, 4, "#fff9e9");
    rect(ctx, start, 88, w, 4, "#473344");
    const guard = (f.guardGauge / 100) * w;
    rect(
      ctx,
      right ? x - guard : x,
      88,
      guard,
      4,
      f.guardGauge < 25 ? "#f7988a" : info.color,
    );
    text(ctx, info.role ?? info.subtitle, x, 113, 10, "#ffdfc8b0", align, 400);
    for (let i = 0; i < 2; i++) rect(
        ctx,
        x + dir * (w - 16 - i * 20) - (right ? 8 : 0),
        100,
        8,
        8,
        game.wins[side] > i ? "#ffe2a0" : "#ffe2a033",
      );
    const mx = right ? 1240 : 40;
    const mw = 282;
    rect(ctx, right ? mx - mw : mx, 668, mw, 12, "#241d3f");
    const filled = (f.meter / 100) * mw;
    rect(ctx, right ? mx - filled : mx, 670, filled, 8, info.color);
    rect(ctx, mx + dir * mw * 0.5, 668, 2, 12, "#fff0ce");
    text(
      ctx,
      f.meter >= 100 ? "超杀 READY" : `潮能 ${Math.floor(f.meter)}`,
      mx,
      658,
      13,
      "#fff0d3",
      align,
    );
    text(
      ctx,
      f.burstReady ? "◆ BREAK · 50" : "◇ BREAK USED",
      mx,
      703,
      10,
      f.burstReady ? info.color : "#b7a0b3",
      align,
    );
    if (f.combo > 1 && f.comboTime > 0) {
      const cx = right ? 1236 : 44;
      text(ctx, String(f.combo), cx, 220, 52, "#fff0ce", align, 900);
      text(
        ctx,
        `HITS / ${f.comboDamage} DAMAGE`,
        cx,
        244,
        12,
        info.color,
        align,
      );
    }
  });
  text(ctx, "潮夜", WIDTH / 2, 30, 12, "#ffe0c1", "center");
  text(
    ctx,
    game.options.mode === "training"
      ? "∞"
      : String(Math.ceil(game.roundTimer)).padStart(2, "0"),
    WIDTH / 2,
    83,
    48,
    "#fff1cc",
    "center",
    500,
  );
  text(
    ctx,
    game.options.mode === "training" ? "TRAINING" : `ROUND ${game.round}`,
    WIDTH / 2,
    112,
    10,
    "#ffdec9",
    "center",
    400,
  );
  const e = [...game.events]
    .reverse()
    .find(
      (event) => event.ttl > 0.22 &&
        !["round", "ko", "whiff", "hit", "sidestep", "projectile"].includes(
          event.type,
        ),
    );
  if (e && game.phase === "fight") text(
      ctx,
      e.type === "block" ? "GUARD" : e.text,
      e.side === 0 ? 44 : 1236,
      162,
      16,
      getFighter(game.fighters[e.side].character).secondary,
      e.side === 0 ? "left" : "right",
    );
  text(
    ctx,
    "STRIKE  ›  THROW  ›  HOLD",
    WIDTH / 2,
    691,
    11,
    "#ffdebea0",
    "center",
    400,
  );
  if (game.options.mode === "training") game.fighters.forEach((f) => text(
        ctx,
        f.history
          .slice(-5)
          .map((h) => h.command)
          .join("  ·  "),
        f.side === 1 ? 1236 : 44,
        632,
        13,
        "#fff0d1",
        f.side === 1 ? "right" : "left",
        400,
      ),);
}
function boxes(ctx: CanvasRenderingContext2D, game: Game, center: number) {
  if (!game.training.showBoxes) return;
  for (const f of game.fighters) {
    const b = fighterBoxes(f);
    for (const [list, color] of [
      [b.hurt, "#74e5a5"],
      [[b.push], "#fff3b6"],
      [b.attack ? [b.attack] : [], "#ff7587"],
    ] as const) for (const box of list) {
        ctx.fillStyle = `${color}30`;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        const x = r(box.x - center + WIDTH / 2);
        const y = r(box.y + f.z * 18);
        ctx.fillRect(x, y, r(box.w), r(box.h));
        ctx.strokeRect(x, y, r(box.w), r(box.h));
      }
  }
}
function superCut(
  ctx: CanvasRenderingContext2D,
  assets: Assets,
  game: Game,
  reduced: boolean,
) {
  if (!game.super || game.super.timer < 0.15) return;
  const f = game.fighters[game.super.side];
  const info = getFighter(f.character);
  const elapsed = 1.05 - game.super.timer;
  ctx.save();
  ctx.globalAlpha = Math.min(1, elapsed / 0.08, game.super.timer / 0.18);
  rect(ctx, 0, 0, WIDTH, HEIGHT, "#231a3870");
  rect(ctx, 0, 238, WIDTH, 244, "#291e46f5");
  rect(ctx, 0, 238, WIDTH, 4, info.color);
  rect(ctx, 0, 478, WIDTH, 4, info.color);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 242, 580, 236);
  ctx.clip();
  ctx.drawImage(
    skinAssets(assets, f).motion,
    SPRITE_LAYOUT.anchor[0] - 65,
    SPRITE_LAYOUT.anchor[1] - SPRITE_LAYOUT.bodyHeight,
    140,
    100,
    reduced ? 40 : r(40 + elapsed * 18),
    238,
    560,
    400,
  );
  ctx.restore();
  for (let i = 0; i < 16; i++) rect(
      ctx,
      (i * 97 + (reduced ? 0 : elapsed * 420)) % WIDTH,
      254 + i * 13,
      38 + (i % 3) * 20,
      2,
      `${info.color}20`,
    );
  text(ctx, "TIDAL BREAK", 640, 293, 13, info.color);
  text(ctx, game.super.name, 630, 380, 58, "#fff0d3", "left", 900);
  text(ctx, info.name, 640, 427, 18, "#ffddc5");
  ctx.restore();
}
function transition(
  ctx: CanvasRenderingContext2D,
  game: Game,
  reduced: boolean,
) {
  if (!["intro", "roundEnd"].includes(game.phase)) return;
  const intro = game.phase === "intro";
  const t = game.phaseTime;
  ctx.save();
  ctx.globalAlpha = reduced
    ? 1
    : Math.max(0, Math.min(1, t / 0.09, intro ? (1.45 - t) / 0.16 : 1));
  rect(ctx, 0, 279, WIDTH, 120, "#2a1c4280");
  text(
    ctx,
    intro
      ? t < 0.85
        ? `ROUND ${game.round}`
        : "FIGHT"
      : game.roundTimer <= 0
        ? "TIME UP"
        : "K.O.",
    WIDTH / 2,
    361,
    intro ? 62 : 80,
    "#fff1c8",
    "center",
    900,
  );
  if (!intro) text(
      ctx,
      game.winner === null
        ? "DRAW · 再战"
        : `${getFighter(game.fighters[game.winner].character).name} · 本回合胜利`,
      WIDTH / 2,
      396,
      17,
      "#ffdbc5",
      "center",
    );
  ctx.restore();
}
function menu(
  ctx: CanvasRenderingContext2D,
  assets: Assets,
  game: Game,
  reduced: boolean,
) {
  drawStage(ctx, assets, game, WIDTH / 2, reduced);
  const shade = ctx.createLinearGradient(0, 0, WIDTH, 0);
  shade.addColorStop(0, "#241c39f5");
  shade.addColorStop(0.42, "#241c39eb");
  shade.addColorStop(0.68, "#241c3920");
  shade.addColorStop(1, "#241c3900");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  rect(ctx, 704, 668, 438, 10, "#22193880");
  sprite(
    ctx,
    assets,
    { ...game.fighters[1], facing: -1, stateTime: game.time + 1 },
    1100,
    660,
    2,
    reduced,
  );
  sprite(
    ctx,
    assets,
    { ...game.fighters[0], facing: 1, stateTime: game.time },
    840,
    690,
    3,
    reduced,
  );
  text(ctx, "潮夜格斗", 1192, 166, 54, "#ffd7ba", "right", 900);
  text(ctx, "AFTER THE TIDE", 1188, 191, 11, "#ffe8d1a0", "right", 400);
}
export function renderGame(
  ctx: CanvasRenderingContext2D,
  assets: Assets,
  game: Game,
  reduced = false,
  compact = false,
) {
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  if (game.phase === "menu") {
    menu(ctx, assets, game, reduced);
    ctx.restore();
    return;
  }
  const center = clamp((game.fighters[0].x + game.fighters[1].x) / 2, 610, 670);
  drawStage(ctx, assets, game, center, reduced);
  if (game.phase === "result") {
    rect(ctx, 0, 0, 640, HEIGHT, "#241b3bd9");
    if (game.winner !== null) sprite(
        ctx,
        assets,
        { ...game.fighters[game.winner], facing: -1, state: "victory" },
        952,
        704,
        3,
        reduced,
      );
    ctx.restore();
    return;
  }
  ctx.save();
  if (!reduced) ctx.translate(
      r(Math.sin(game.time * 133) * game.camera.shake * 0.5),
      r(Math.cos(game.time * 157) * game.camera.shake * 0.3),
    );
  [...game.fighters]
    .sort(
      (a, b) => a.z - b.z ||
        Number(a.state === "attack") - Number(b.state === "attack"),
    )
    .forEach((f) => drawFighter(ctx, assets, f, game, center, reduced));
  effects(ctx, game, center, reduced);
  boxes(ctx, game, center);
  ctx.restore();
  if (!compact) hud(ctx, assets, game);
  transition(ctx, game, reduced);
  superCut(ctx, assets, game, reduced);
  ctx.restore();
}
