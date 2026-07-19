/* eslint-disable prefer-destructuring, implicit-arrow-linebreak, nonblock-statement-body-position, function-paren-newline */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AudioPreferences,
  AutoChessAudio,
  DEFAULT_AUDIO_PREFERENCES,
  GameAudioEvent,
  loadAudioPreferences,
} from "./audio";
import Codex from "./Codex";
import {
  AutoChessEngine,
  Fighter,
  GameState,
  MechanicalRabbitPet,
  mechanicalRabbitMuzzle,
  OwnedUnit,
  fighterVisualRadius,
} from "./core/gameEngine";
import {
  AUGMENTS,
  CAMPAIGN_ROUNDS,
  SHOP_UNITS,
  STARTERS,
  TRAIT_IDS,
  TRAITS,
  TraitId,
  StarterId,
  ENERGY_PROFILES,
  describeEnergyRecovery,
  UNIT_DEFS,
  UnitId,
  bookLevelForPlayerLevel,
  tierOddsForLevel,
} from "./core/gameData";

declare global {
  interface Window {
    render_game_to_text?: () => string;
    advanceTime?: (milliseconds: number) => void;
  }
}

const WIDTH = 1120;
const HEIGHT = 720;
const TOOLBAR_HEIGHT = 38;
const MAX_CANVAS_PIXELS = 8_000_000;
const FONT = '"Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

type HitTarget =
  | { kind: "starter"; id: StarterId }
  | { kind: "shop"; index: number; unitId: UnitId | null }
  | { kind: "board"; index: number; unitId: UnitId | null; star?: number }
  | { kind: "bench"; index: number; unitId: UnitId | null; star?: number }
  | { kind: "reroll" | "buyXp" | "lock" | "battle" | "sell" | "restart" }
  | { kind: "enemyPreview"; unitId: UnitId; star: number }
  | { kind: "augment"; index: number }
  | { kind: "fighter"; fid: string; unitId: UnitId; star: number }
  | { kind: "trait"; traitId: TraitId }
  | { kind: "rankingToggle" | "rankingPanel" | "resultContinue" }
  | { kind: "rankingMetric" | "resultMetric"; metric: "damage" | "support" | "taken" }
  | null;

interface HoverState {
  target: HitTarget;
  x: number;
  y: number;
}

interface DragState {
  origin: { zone: "board" | "bench"; index: number };
  startX: number;
  startY: number;
  moved: boolean;
}

interface TraitDragState {
  startX: number;
  startScrollX: number;
  moved: boolean;
}

interface TraitPillLayout {
  items: Array<{ id: TraitId; rect: Rect; label: string }>;
  maxScrollX: number;
}

const TRAIT_STRIP: Rect = { x: 48, y: 194, w: 700, h: 25 };
const TRAIT_PILL_GAP = 6;
const TRAIT_DRAG_THRESHOLD = 8;

const boardRect = (index: number): Rect => ({
  x: 44 + (index % 6) * 116 + (Math.floor(index / 6) % 2) * 20,
  y: 232 + Math.floor(index / 6) * 68,
  w: 104,
  h: 58,
});

const benchRect = (index: number): Rect => ({
  x: 48 + index * 88,
  y: 600,
  w: 80,
  h: 76,
});
const shopRect = (index: number): Rect => ({
  x: 810,
  y: 143 + index * 74,
  w: 270,
  h: 70,
});
const starterRect = (index: number): Rect => ({
  x: 90 + index * 320,
  y: 318,
  w: 300,
  h: 260,
});
const augmentRect = (index: number): Rect => ({
  x: 75 + index * 350,
  y: 255,
  w: 320,
  h: 300,
});
const buyXpRect: Rect = { x: 810, y: 530, w: 82, h: 48 };
const lockRect: Rect = { x: 900, y: 530, w: 82, h: 22 };
const rerollRect: Rect = { x: 900, y: 556, w: 82, h: 22 };
const battleRect: Rect = { x: 990, y: 530, w: 90, h: 48 };
const sellRect: Rect = { x: 636, y: 553, w: 112, h: 34 };
const restartRect: Rect = { x: 420, y: 548, w: 280, h: 62 };
const rankingToggleRect: Rect = { x: 892, y: 100, w: 180, h: 34 };
const rankingPanelRect: Rect = { x: 802, y: 142, w: 270, h: 344 };
const rankingMetricRects: Array<{ metric: "damage" | "support" | "taken"; rect: Rect }> = [
  { metric: "damage", rect: { x: 814, y: 178, w: 76, h: 24 } },
  { metric: "support", rect: { x: 896, y: 178, w: 88, h: 24 } },
  { metric: "taken", rect: { x: 990, y: 178, w: 70, h: 24 } },
];
const resultContinueRect: Rect = { x: 410, y: 638, w: 300, h: 42 };
const resultMetricRects: Array<{ metric: "damage" | "support" | "taken"; rect: Rect }> = [
  { metric: "damage", rect: { x: 434, y: 214, w: 78, h: 24 } },
  { metric: "support", rect: { x: 521, y: 214, w: 96, h: 24 } },
  { metric: "taken", rect: { x: 626, y: 214, w: 76, h: 24 } },
];

const inRect = (x: number, y: number, rect: Rect) =>
  x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;

const roundedPath = (
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  radius: number,
) => {
  const r = Math.min(radius, rect.w / 2, rect.h / 2);
  ctx.beginPath();
  ctx.moveTo(rect.x + r, rect.y);
  ctx.arcTo(rect.x + rect.w, rect.y, rect.x + rect.w, rect.y + rect.h, r);
  ctx.arcTo(rect.x + rect.w, rect.y + rect.h, rect.x, rect.y + rect.h, r);
  ctx.arcTo(rect.x, rect.y + rect.h, rect.x, rect.y, r);
  ctx.arcTo(rect.x, rect.y, rect.x + rect.w, rect.y, r);
  ctx.closePath();
};

const fillRounded = (
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  radius: number,
  fill: string | CanvasGradient | CanvasPattern,
) => {
  roundedPath(ctx, rect, radius);
  ctx.fillStyle = fill;
  ctx.fill();
};

const strokeRounded = (
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  radius: number,
  stroke: string,
  width = 1,
) => {
  roundedPath(ctx, rect, radius);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = width;
  ctx.stroke();
};

const setTextFont = (ctx: CanvasRenderingContext2D, size: number, weight = 500) => {
  ctx.font = `${weight} ${size}px ${FONT}`;
};

const text = (
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  size: number,
  color = "#eef6ff",
  align: CanvasTextAlign = "left",
  weight = 500,
) => {
  setTextFont(ctx, size, weight);
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillText(value, x, y);
};

const truncateText = (
  ctx: CanvasRenderingContext2D,
  value: string,
  maxWidth: number,
) => {
  if (ctx.measureText(value).width <= maxWidth) return value;
  const ellipsis = "…";
  let truncated = "";
  for (const character of value) {
    if (ctx.measureText(`${truncated}${character}${ellipsis}`).width > maxWidth)
      break;
    truncated += character;
  }
  return truncated ? `${truncated}${ellipsis}` : ellipsis;
};

const wrapText = (
  ctx: CanvasRenderingContext2D,
  value: string,
  maxWidth: number,
) => {
  const lines: string[] = [];
  value.split(/\r?\n/).forEach((paragraph) => {
    let current = "";
    for (const character of paragraph) {
      const next = current + character;
      if (current && ctx.measureText(next).width > maxWidth) {
        lines.push(current.trimEnd());
        current = character.trimStart();
      } else current = next;
    }
    if (current) lines.push(current.trimEnd());
  });
  return lines.length ? lines : [""];
};

const boundedTextLines = (
  ctx: CanvasRenderingContext2D,
  value: string,
  maxWidth: number,
  maxLines: number,
) => {
  const lines = wrapText(ctx, value, maxWidth);
  if (lines.length <= maxLines) return lines;
  return [
    ...lines.slice(0, maxLines - 1),
    truncateText(ctx, lines.slice(maxLines - 1).join(""), maxWidth),
  ];
};

const drawBoundedText = (
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  centerY: number,
  size: number,
  color: string,
  align: CanvasTextAlign,
  weight: number,
  maxWidth: number,
  maxLines: number,
  lineHeight: number,
) => {
  setTextFont(ctx, size, weight);
  const lines = boundedTextLines(ctx, value, maxWidth, maxLines);
  const startY = centerY - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, index) =>
    text(ctx, line, x, startY + index * lineHeight, size, color, align, weight),
  );
  return lines;
};

const drawBackdrop = (ctx: CanvasRenderingContext2D, state: GameState) => {
  const gradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  gradient.addColorStop(0, "#07121d");
  gradient.addColorStop(0.52, "#0b1825");
  gradient.addColorStop(1, "#160f20");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.save();
  for (let index = 0; index < 44; index += 1) {
    const x = (index * 193 + 47) % WIDTH;
    const y = (index * 83 + 29) % HEIGHT;
    const pulse = 0.18 + 0.18 * Math.sin(state.visualTime * 0.8 + index);
    ctx.globalAlpha = pulse;
    ctx.fillStyle = index % 3 === 0 ? "#78d9ff" : "#b797ff";
    ctx.fillRect(x, y, index % 5 === 0 ? 2 : 1, index % 5 === 0 ? 2 : 1);
  }
  ctx.restore();

  const glow = ctx.createRadialGradient(570, 360, 20, 570, 360, 420);
  glow.addColorStop(0, "rgba(91, 93, 255, 0.08)");
  glow.addColorStop(1, "rgba(91, 93, 255, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
};

const drawHeader = (ctx: CanvasRenderingContext2D, engine: AutoChessEngine) => {
  const state = engine.state;
  ctx.fillStyle = "rgba(5, 12, 20, 0.9)";
  ctx.fillRect(0, 0, WIDTH, 78);
  ctx.strokeStyle = "rgba(117, 205, 255, 0.18)";
  ctx.beginPath();
  ctx.moveTo(0, 77.5);
  ctx.lineTo(WIDTH, 77.5);
  ctx.stroke();

  text(ctx, "裂隙阵线", 30, 28, 23, "#f1f8ff", "left", 800);
  text(
    ctx,
    state.endlessUnlocked ? "RIFT LINE · 无限裂隙" : "RIFT LINE · 八战远征",
    30,
    53,
    10,
    state.endlessUnlocked ? "#d3a2ff" : "#6f92ab",
    "left",
    700,
  );

  if (state.phase !== "title") {
    const nodeStart = 300;
    if (state.round <= CAMPAIGN_ROUNDS) {
      for (let index = 0; index < CAMPAIGN_ROUNDS; index += 1) {
      const x = nodeStart + index * 48;
      const complete = index + 1 < state.round;
      const current = index + 1 === state.round;
      ctx.beginPath();
      ctx.arc(x, 33, current ? 11 : 8, 0, Math.PI * 2);
      ctx.fillStyle = complete ? "#56d89a" : current ? "#7bdcff" : "#1c3040";
      ctx.fill();
      if (current) {
        ctx.strokeStyle = "rgba(123, 220, 255, 0.5)";
        ctx.lineWidth = 4;
        ctx.stroke();
      }
      text(
        ctx,
        String(index + 1),
        x,
        33,
        10,
        complete || current ? "#06111a" : "#648096",
        "center",
        800,
      );
        if (index < CAMPAIGN_ROUNDS - 1) {
          ctx.fillStyle = complete ? "#3f9c78" : "#203647";
          ctx.fillRect(x + 11, 31, 25, 3);
        }
      }
    } else {
      fillRounded(ctx, { x: 300, y: 20, w: 360, h: 30 }, 15, "rgba(111, 77, 163, 0.28)");
      strokeRounded(ctx, { x: 300, y: 20, w: 360, h: 30 }, 15, "#a77be8");
      text(
        ctx,
        `∞ 无限裂隙 · 第 ${state.round - CAMPAIGN_ROUNDS} 层`,
        480,
        35,
        13,
        "#e6d3ff",
        "center",
        900,
      );
    }
    text(
      ctx,
      state.round > CAMPAIGN_ROUNDS
        ? `总第 ${state.round} 战`
        : state.round === CAMPAIGN_ROUNDS
          ? "首领战"
          : `第 ${state.round} 战`,
      468,
      60,
      11,
      "#8aa4b8",
      "center",
      700,
    );

    const hpRatio = state.hp / state.maxHp;
    text(ctx, "核心", 768, 23, 10, "#7892a5", "left", 700);
    fillRounded(ctx, { x: 768, y: 36, w: 122, h: 12 }, 6, "#182938");
    const hpGradient = ctx.createLinearGradient(768, 0, 890, 0);
    hpGradient.addColorStop(0, "#ff5d75");
    hpGradient.addColorStop(1, "#ffb15d");
    fillRounded(ctx, { x: 768, y: 36, w: 122 * hpRatio, h: 12 }, 6, hpGradient);
    text(ctx, `${state.hp}/${state.maxHp}`, 829, 42, 9, "#fff", "center", 800);

    text(ctx, "金币", 925, 23, 10, "#7892a5", "left", 700);
    text(ctx, String(state.gold), 925, 45, 23, "#ffd96a", "left", 800);
    text(ctx, "积分", 1005, 23, 10, "#7892a5", "left", 700);
    text(
      ctx,
      state.score.toLocaleString(),
      1005,
      45,
      19,
      "#dcecff",
      "left",
      800,
    );
  } else {
    text(
      ctx,
      `最高纪录 ${state.bestScore.toLocaleString()}`,
      1088,
      38,
      14,
      "#91aabd",
      "right",
      700,
    );
  }
};

const drawStars = (
  ctx: CanvasRenderingContext2D,
  star: number,
  x: number,
  y: number,
  align: CanvasTextAlign = "center",
) => {
  text(
    ctx,
    "★".repeat(star),
    x,
    y,
    11,
    star >= 3 ? "#ffdc68" : star === 2 ? "#8ee9ff" : "#8ba1b2",
    align,
    800,
  );
};

const shopRole = (unitId: UnitId) => {
  const title = UNIT_DEFS[unitId].title;
  return title.includes(" · ") ? title.split(" · ").at(-1)! : title;
};

const traitActivationAfterPurchase = (
  engine: AutoChessEngine,
  unitId: UnitId,
  trait: TraitId,
) => {
  const status = engine.getTraitStatus(trait);
  if (status.level > 0 || engine.boardCount >= engine.boardCap) return false;
  const threshold = TRAITS[trait].thresholds[status.level];
  return status.count + 1 >= threshold && !engine.state.board.some((unit) => unit?.id === unitId);
};

const drawShopTraitTags = (
  ctx: CanvasRenderingContext2D,
  engine: AutoChessEngine,
  unitId: UnitId,
  rect: Rect,
  affordable: boolean,
) => {
  const traits = UNIT_DEFS[unitId].traits;
  let x = rect.x + 64;
  const y = rect.y + 46;
  ctx.font = `700 8px ${FONT}`;
  traits.forEach((traitId) => {
    const trait = TRAITS[traitId];
    const status = engine.getTraitStatus(traitId);
    const active = status.level > 0;
    const completes = traitActivationAfterPurchase(engine, unitId, traitId);
    const width = Math.ceil(ctx.measureText(trait.name).width) + 14;
    if (x + width > rect.x + rect.w - 42) return;
    if (completes && affordable) {
      ctx.save();
      ctx.shadowColor = trait.color;
      ctx.shadowBlur = 10;
      fillRounded(ctx, { x, y: y - 9, w: width, h: 17 }, 8, `${trait.color}5c`);
      ctx.restore();
    } else {
      fillRounded(
        ctx,
        { x, y: y - 9, w: width, h: 17 },
        8,
        active ? `${trait.color}30` : "rgba(20, 37, 50, 0.8)",
      );
    }
    strokeRounded(
      ctx,
      { x, y: y - 9, w: width, h: 17 },
      8,
      completes && affordable ? trait.color : active ? `${trait.color}b8` : "#395467",
      completes && affordable ? 1.5 : 1,
    );
    text(
      ctx,
      trait.name,
      x + width / 2,
      y,
      8,
      completes && affordable ? "#ffffff" : active ? "#e9f8ff" : "#71899a",
      "center",
      700,
    );
    x += width + 4;
  });
};

const drawTraitDots = (
  ctx: CanvasRenderingContext2D,
  unitId: UnitId,
  x: number,
  y: number,
) => {
  const traits = UNIT_DEFS[unitId].traits;
  const startX = x - ((traits.length - 1) * 12) / 2;
  traits.forEach((trait, index) => {
    ctx.beginPath();
    ctx.arc(startX + index * 12, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = TRAITS[trait].color;
    ctx.fill();
  });
};

const unitImages = new Map<string, HTMLImageElement>();
const requestUnitImage = (portrait: string, redraw?: () => void) => {
  if (unitImages.has(portrait)) return unitImages.get(portrait) || null;
  const image = new Image();
  if (redraw) image.onload = redraw;
  image.src = portrait;
  unitImages.set(portrait, image);
  return image;
};

const drawImagePortrait = (
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  radius: number,
  focus: "top" | "center" = "center",
  style: "round" | "sprite" = "round",
  mirrorSpriteX = false,
) => {
  const sourceRatio = image.naturalWidth / image.naturalHeight;
  const sourceWidth = sourceRatio > 1 ? image.naturalHeight : image.naturalWidth;
  const sourceHeight = sourceRatio > 1 ? image.naturalHeight : image.naturalWidth;
  const sourceX = Math.max(0, (image.naturalWidth - sourceWidth) / 2);
  const sourceY = Math.max(
    0,
    focus === "top" ? (image.naturalHeight - sourceHeight) * 0.16 : (image.naturalHeight - sourceHeight) / 2,
  );
  ctx.save();
  if (style === "round") {
    ctx.beginPath();
    ctx.arc(x, y, radius - 2, 0, Math.PI * 2);
    ctx.clip();
  } else {
    ctx.imageSmoothingEnabled = false;
  }
  if (style === "sprite" && mirrorSpriteX) {
    ctx.translate(x * 2, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    x - radius,
    y - radius,
    radius * 2,
    radius * 2,
  );
  ctx.restore();
};

const drawUnitPortrait = (
  ctx: CanvasRenderingContext2D,
  unitId: UnitId,
  x: number,
  y: number,
  radius: number,
  team: "player" | "enemy" = "player",
  alpha = 1,
  mirrorSpriteX = false,
) => {
  const def = UNIT_DEFS[unitId];
  const portraitStyle = def.portraitStyle || "round";
  const portrait = def.portrait ? requestUnitImage(def.portrait) : null;
  const hasPortrait = Boolean(portrait?.complete && portrait.naturalWidth > 0);
  const borderColor = team === "player" ? def.accent : "#ff688e";
  ctx.save();
  ctx.globalAlpha = alpha;

  if (portraitStyle === "sprite") {
    if (hasPortrait) {
      drawImagePortrait(ctx, portrait!, x, y, radius, def.portraitFocus, "sprite", mirrorSpriteX);
    } else {
      ctx.fillStyle = def.color;
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
  } else {
    ctx.shadowColor = def.accent;
    ctx.shadowBlur = radius * 0.5;
    const gradient = ctx.createRadialGradient(
      x - radius * 0.25,
      y - radius * 0.3,
      2,
      x,
      y,
      radius,
    );
    gradient.addColorStop(0, def.accent);
    gradient.addColorStop(0.4, def.color);
    gradient.addColorStop(1, "#09131d");
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();
    if (hasPortrait) drawImagePortrait(ctx, portrait!, x, y, radius, def.portraitFocus);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = Math.max(2, radius * 0.08);
    ctx.stroke();
  }

  text(
    ctx,
    hasPortrait ? "" : def.glyph,
    x,
    y + 1,
    Math.max(13, radius * 0.72),
    "#f7fbff",
    "center",
    800,
  );
  ctx.restore();
};

const drawOwnedUnit = (
  ctx: CanvasRenderingContext2D,
  unit: OwnedUnit,
  rect: Rect,
  selected: boolean,
  compact = false,
) => {
  const def = UNIT_DEFS[unit.id];
  if (selected) {
    ctx.save();
    ctx.shadowColor = def.accent;
    ctx.shadowBlur = 18;
    strokeRounded(
      ctx,
      { x: rect.x + 2, y: rect.y + 2, w: rect.w - 4, h: rect.h - 4 },
      12,
      def.accent,
      2.5,
    );
    ctx.restore();
  }
  const radius = compact ? 18 : 30;
  drawUnitPortrait(
    ctx,
    unit.id,
    rect.x + rect.w / 2,
    rect.y + (compact ? 27 : 43),
    radius,
  );
  drawStars(ctx, unit.star, rect.x + rect.w / 2, rect.y + (compact ? 5 : 10));
  text(
    ctx,
    def.name,
    rect.x + rect.w / 2,
    rect.y + rect.h - (compact ? 7 : 17),
    compact ? 9 : 12,
    "#dfeeff",
    "center",
    700,
  );
  if (!compact)
    drawTraitDots(ctx, unit.id, rect.x + rect.w / 2 - 6, rect.y + rect.h - 36);
};

const traitPillLayout = (
  ctx: CanvasRenderingContext2D,
  engine: AutoChessEngine,
  scrollX: number,
): TraitPillLayout => {
  const counts = engine.getTraitCounts();
  let contentX = 0;
  ctx.font = `700 10px ${FONT}`;
  const items = (Object.keys(TRAITS) as TraitId[])
    .filter((id) => counts[id] > 0)
    .map((id) => {
      const trait = TRAITS[id];
      const status = engine.getTraitStatus(id);
      const nextThreshold =
        trait.thresholds[Math.min(status.level, trait.thresholds.length - 1)];
      const label = `${trait.name} ${counts[id]}/${nextThreshold}${status.active ? "" : " !"}`;
      const width = Math.max(72, Math.ceil(ctx.measureText(label).width) + 34);
      const entry = {
        id,
        label,
        rect: {
          x: TRAIT_STRIP.x + contentX - scrollX,
          y: TRAIT_STRIP.y,
          w: width,
          h: TRAIT_STRIP.h,
        },
      };
      contentX += width + TRAIT_PILL_GAP;
      return entry;
    });
  const contentWidth = Math.max(0, contentX - TRAIT_PILL_GAP);
  return { items, maxScrollX: Math.max(0, contentWidth - TRAIT_STRIP.w) };
};

const drawTraitPills = (
  ctx: CanvasRenderingContext2D,
  engine: AutoChessEngine,
  scrollX: number,
) => {
  const layout = traitPillLayout(ctx, engine, scrollX);
  ctx.save();
  ctx.beginPath();
  ctx.rect(TRAIT_STRIP.x, TRAIT_STRIP.y, TRAIT_STRIP.w, TRAIT_STRIP.h);
  ctx.clip();
  layout.items.forEach(({ id, rect, label }) => {
    if (rect.x + rect.w < TRAIT_STRIP.x || rect.x > TRAIT_STRIP.x + TRAIT_STRIP.w)
      return;
    const trait = TRAITS[id];
    const status = engine.getTraitStatus(id);
    const active = status.level > 0;
    fillRounded(
      ctx,
      rect,
      12,
      active ? `${trait.color}24` : "rgba(20, 37, 50, 0.85)",
    );
    strokeRounded(ctx, rect, 12, active ? trait.color : "#2e4658", 1);
    ctx.beginPath();
    ctx.arc(rect.x + 13, rect.y + rect.h / 2, 4, 0, Math.PI * 2);
    ctx.fillStyle = trait.color;
    ctx.fill();
    text(
      ctx,
      label,
      rect.x + 23,
      rect.y + rect.h / 2,
      10,
      active ? "#ecf8ff" : "#6f8799",
      "left",
      700,
    );
  });
  ctx.restore();

  if (layout.maxScrollX > 0) {
    const fadeWidth = 18;
    if (scrollX > 0) {
      const leftFade = ctx.createLinearGradient(
        TRAIT_STRIP.x,
        0,
        TRAIT_STRIP.x + fadeWidth,
        0,
      );
      leftFade.addColorStop(0, "rgba(16, 29, 43, 0.94)");
      leftFade.addColorStop(1, "rgba(16, 29, 43, 0)");
      ctx.fillStyle = leftFade;
      ctx.fillRect(TRAIT_STRIP.x, TRAIT_STRIP.y, fadeWidth, TRAIT_STRIP.h);
    }
    if (scrollX < layout.maxScrollX) {
      const rightFade = ctx.createLinearGradient(
        TRAIT_STRIP.x + TRAIT_STRIP.w - fadeWidth,
        0,
        TRAIT_STRIP.x + TRAIT_STRIP.w,
        0,
      );
      rightFade.addColorStop(0, "rgba(16, 29, 43, 0)");
      rightFade.addColorStop(1, "rgba(16, 29, 43, 0.94)");
      ctx.fillStyle = rightFade;
      ctx.fillRect(
        TRAIT_STRIP.x + TRAIT_STRIP.w - fadeWidth,
        TRAIT_STRIP.y,
        fadeWidth,
        TRAIT_STRIP.h,
      );
    }
  }

  return layout.maxScrollX;
};

const drawTitle = (
  ctx: CanvasRenderingContext2D,
  engine: AutoChessEngine,
  hover: HoverState,
) => {
  const state = engine.state;
  text(
    ctx,
    "守住八次远征冲击，然后向无限裂隙挑战极限。",
    WIDTH / 2,
    142,
    16,
    "#9db7c9",
    "center",
    500,
  );
  text(ctx, "裂 隙 阵 线", WIDTH / 2, 205, 48, "#f4f9ff", "center", 900);
  text(
    ctx,
    `${SHOP_UNITS.length} 棋子 · ${TRAIT_IDS.length} 羁绊 · 八战远征 + 无限挑战`,
    WIDTH / 2,
    250,
    14,
    "#6faac8",
    "center",
    700,
  );
  text(ctx, "本局随机三选一开局协议", WIDTH / 2, 292, 12, "#7994a8", "center", 700);

  state.starterChoices.forEach((id, index) => {
    const starter = STARTERS.find((item) => item.id === id);
    if (!starter) return;
    const rect = starterRect(index);
    const hovered =
      hover.target?.kind === "starter" && hover.target.id === starter.id;
    const lift = hovered ? -5 : 0;
    const lifted = { ...rect, y: rect.y + lift };
    const gradient = ctx.createLinearGradient(
      lifted.x,
      lifted.y,
      lifted.x,
      lifted.y + lifted.h,
    );
    gradient.addColorStop(
      0,
      hovered ? `${starter.color}2e` : "rgba(18, 34, 48, 0.95)",
    );
    gradient.addColorStop(1, "rgba(7, 15, 24, 0.98)");
    fillRounded(ctx, lifted, 20, gradient);
    strokeRounded(
      ctx,
      lifted,
      20,
      hovered ? starter.color : "#284153",
      hovered ? 2 : 1,
    );
    drawUnitPortrait(
      ctx,
      starter.unit,
      lifted.x + lifted.w / 2,
      lifted.y + 62,
      35,
    );
    text(
      ctx,
      starter.subtitle,
      lifted.x + lifted.w / 2,
      lifted.y + 115,
      11,
      starter.color,
      "center",
      800,
    );
    text(
      ctx,
      starter.name,
      lifted.x + lifted.w / 2,
      lifted.y + 145,
      21,
      "#f3f8ff",
      "center",
      800,
    );

    drawBoundedText(
      ctx,
      starter.description,
      lifted.x + lifted.w / 2,
      lifted.y + 192,
      12,
      "#9cb1c0",
      "center",
      500,
      lifted.w - 40,
      2,
      20,
    );
    fillRounded(
      ctx,
      { x: lifted.x + 62, y: lifted.y + 222, w: 176, h: 28 },
      14,
      hovered ? starter.color : "#193042",
    );
    text(
      ctx,
      hovered ? "点击接入并开始" : "选择协议",
      lifted.x + lifted.w / 2,
      lifted.y + 236,
      11,
      hovered ? "#07131d" : "#b8cad6",
      "center",
      800,
    );
  });

  text(
    ctx,
    `本局战术种子 · ${String(state.seed % 100000).padStart(5, "0")}`,
    WIDTH / 2,
    626,
    11,
    "#4e697d",
    "center",
    700,
  );
  text(
    ctx,
    "操作：购买与布阵 · 升本提升商店和人口 · R 刷新 · Space 开战 · F 全屏",
    WIDTH / 2,
    670,
    11,
    "#688397",
    "center",
    500,
  );
};

const drawPreparation = (
  ctx: CanvasRenderingContext2D,
  engine: AutoChessEngine,
  hover: HoverState,
  traitScrollX: number,
) => {
  const state = engine.state;
  const wave = engine.currentWave;
  const boardPanel: Rect = { x: 26, y: 98, w: 752, h: 430 };
  const boardGradient = ctx.createLinearGradient(26, 98, 778, 528);
  boardGradient.addColorStop(0, "rgba(19, 39, 54, 0.94)");
  boardGradient.addColorStop(1, "rgba(16, 25, 41, 0.94)");
  fillRounded(ctx, boardPanel, 18, boardGradient);
  strokeRounded(ctx, boardPanel, 18, "rgba(102, 182, 224, 0.17)");

  const tagColor =
    wave.tag === "boss"
      ? "#ff5d9d"
      : wave.tag === "elite"
        ? "#ffc35b"
        : "#72d8ff";
  text(
    ctx,
    wave.tag === "boss"
      ? "BOSS"
      : wave.tag === "elite"
        ? "ELITE"
        : `WAVE ${wave.round}`,
    48,
    122,
    10,
    tagColor,
    "left",
    900,
  );
  setTextFont(ctx, 21, 800);
  text(ctx, truncateText(ctx, wave.name, 470), 48, 149, 21, "#f1f7ff", "left", 800);
  drawBoundedText(
    ctx,
    wave.description,
    48,
    174,
    11,
    "#8ba4b6",
    "left",
    500,
    470,
    2,
    15,
  );
  const augmentHistory = state.augmentHistory
    .map(({ round, id }) => {
      const augment = AUGMENTS.find((item) => item.id === id);
      return augment ? `${round}战·${augment.name}` : null;
    })
    .filter(Boolean)
    .join("  ·  ");
  setTextFont(ctx, 8, 700);
  text(
    ctx,
    truncateText(
      ctx,
      augmentHistory ? `已选天赋：${augmentHistory}` : "第 2 战后可选择首个天赋",
      700,
    ),
    48,
    190,
    8,
    augmentHistory ? "#d4b5ff" : "#627d90",
    "left",
    700,
  );

  text(ctx, "敌情预览", 742, 120, 10, "#70899b", "right", 700);
  wave.units.slice(0, 8).forEach((enemy, index) => {
    const x = 735 - index * 35;
    const hovered =
      hover.target?.kind === "enemyPreview" &&
      hover.target.unitId === enemy.id &&
      hover.x >= x - 18 &&
      hover.x <= x + 18;
    if (hovered) {
      ctx.beginPath();
      ctx.arc(x, 153, 22, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255, 104, 142, 0.2)";
      ctx.fill();
    }
    drawUnitPortrait(
      ctx,
      enemy.id,
      x,
      153,
      enemy.id === "rift_tyrant" ? 20 : 15,
      "enemy",
      0.9,
    );
  });
  text(ctx, "悬浮查看技能", 742, 183, 8, "#536f82", "right", 600);

  drawTraitPills(ctx, engine, traitScrollX);
  text(ctx, "后方 · 远程与辅助", 48, 221, 9, "#5f798c", "left", 700);
  text(ctx, "6 × 4 自由部署区 · 满级 8 人口", 390, 221, 9, "#67869b", "center", 700);
  text(ctx, "前线 · 优先接敌 →", 756, 221, 9, "#86a5ba", "right", 700);

  state.board.forEach((unit, index) => {
    const rect = boardRect(index);
    const hovered =
      hover.target?.kind === "board" && hover.target.index === index;
    const selected =
      state.selected?.zone === "board" && state.selected.index === index;
    fillRounded(
      ctx,
      rect,
      13,
      hovered ? "rgba(80, 137, 171, 0.2)" : "rgba(7, 18, 28, 0.48)",
    );
    strokeRounded(
      ctx,
      rect,
      13,
      selected ? "#7de2ff" : hovered ? "#47738e" : "#223d50",
      selected ? 2 : 1,
    );
    ctx.fillStyle = "rgba(100, 180, 225, 0.08)";
    ctx.fillRect(rect.x + 15, rect.y + rect.h / 2, rect.w - 30, 1);
    if (unit) drawOwnedUnit(ctx, unit, rect, selected, true);
    else {
      ctx.beginPath();
      ctx.arc(rect.x + rect.w / 2, rect.y + rect.h / 2, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = "#29465a";
      ctx.fill();
    }
  });

  const shopPanel: Rect = { x: 794, y: 98, w: 300, h: 500 };
  fillRounded(ctx, shopPanel, 18, "rgba(8, 18, 28, 0.96)");
  strokeRounded(ctx, shopPanel, 18, "rgba(111, 191, 235, 0.2)");
  text(
    ctx,
    `战术商店 · ${bookLevelForPlayerLevel(state.playerLevel)} 本`,
    812,
    119,
    16,
    "#edf7ff",
    "left",
    800,
  );
  text(
    ctx,
    engine.isMaxPlayerLevel
      ? "已满级"
      : `距 ${bookLevelForPlayerLevel(state.playerLevel) + 1} 本还需 ${engine.upgradeCost} 金币`,
    1078,
    120,
    10,
    engine.isMaxPlayerLevel ? "#ffd166" : "#7bdcff",
    "right",
    700,
  );
  const odds = tierOddsForLevel(state.playerLevel);
  text(
    ctx,
    odds
      .map((chance, index) => (chance > 0 ? `${index + 1}费${chance}%` : ""))
      .filter(Boolean)
      .join(" · "),
    812,
    136,
    8,
    "#526f82",
    "left",
    600,
  );

  state.shop.forEach((unitId, index) => {
    const rect = shopRect(index);
    const hovered =
      hover.target?.kind === "shop" && hover.target.index === index;
    if (!unitId) {
      fillRounded(ctx, rect, 12, "rgba(10, 22, 32, 0.8)");
      strokeRounded(ctx, rect, 12, "#203748");
      text(
        ctx,
        "已征募",
        rect.x + rect.w / 2,
        rect.y + rect.h / 2,
        12,
        "#3e5b70",
        "center",
        700,
      );
      return;
    }
    const def = UNIT_DEFS[unitId];
    const affordable = state.gold >= def.cost;
    fillRounded(
      ctx,
      rect,
      12,
      hovered ? `${def.accent}20` : "rgba(17, 34, 47, 0.92)",
    );
    strokeRounded(
      ctx,
      rect,
      12,
      hovered ? def.accent : "#294658",
      hovered ? 2 : 1,
    );
    drawUnitPortrait(
      ctx,
      unitId,
      rect.x + 33,
      rect.y + 35,
      20,
      "player",
      affordable ? 1 : 0.55,
    );
    setTextFont(ctx, 13, 800);
    text(
      ctx,
      truncateText(ctx, def.name, 136),
      rect.x + 64,
      rect.y + 15,
      13,
      affordable ? "#ecf7ff" : "#617888",
      "left",
      800,
    );
    setTextFont(ctx, 8, 700);
    text(
      ctx,
      truncateText(ctx, shopRole(unitId), 136),
      rect.x + 64,
      rect.y + 29,
      8,
      affordable ? "#8daabd" : "#526b7b",
      "left",
      700,
    );
    drawShopTraitTags(ctx, engine, unitId, rect, affordable);
    text(
      ctx,
      `${def.cost}`,
      rect.x + rect.w - 23,
      rect.y + 32,
      22,
      affordable ? "#ffd166" : "#5e5260",
      "center",
      900,
    );
  });

  const hoveredBuyXp = hover.target?.kind === "buyXp";
  const upgradeCost = engine.upgradeCost || 0;
  const canBuyXp = !engine.isMaxPlayerLevel && state.gold >= upgradeCost;
  fillRounded(
    ctx,
    buyXpRect,
    12,
    hoveredBuyXp && canBuyXp
      ? "#4a9fd0"
      : canBuyXp
        ? "#286d94"
        : "#253746",
  );
  text(
    ctx,
    engine.isMaxPlayerLevel ? "已满级" : `升本 · ${upgradeCost}`,
    buyXpRect.x + buyXpRect.w / 2,
    buyXpRect.y + 18,
    10,
    canBuyXp ? "#eef9ff" : "#607787",
    "center",
    800,
  );
  text(
    ctx,
    engine.isMaxPlayerLevel ? "MAX" : "一次付清",
    buyXpRect.x + buyXpRect.w / 2,
    buyXpRect.y + 35,
    8,
    canBuyXp ? "#bdeaff" : "#4b6374",
    "center",
    800,
  );
  const hoveredLock = hover.target?.kind === "lock";
  fillRounded(
    ctx,
    lockRect,
    9,
    state.shopLocked
      ? hoveredLock
        ? "#b78cff"
        : "#6d4f96"
      : hoveredLock
        ? "#46677d"
        : "#293e4d",
  );
  text(
    ctx,
    state.shopLocked ? "🔒 已锁定" : "锁定商店",
    lockRect.x + lockRect.w / 2,
    lockRect.y + lockRect.h / 2,
    9,
    state.shopLocked ? "#f4eaff" : "#d6e6f0",
    "center",
    800,
  );
  const hoveredReroll = hover.target?.kind === "reroll";
  const canReroll = state.gold >= 1;
  fillRounded(
    ctx,
    rerollRect,
    9,
    hoveredReroll && canReroll ? "#d7a93d" : canReroll ? "#4c4030" : "#253746",
  );
  text(
    ctx,
    "刷新 · 1（R）",
    rerollRect.x + rerollRect.w / 2,
    rerollRect.y + rerollRect.h / 2,
    9,
    canReroll ? "#f4e4b6" : "#607787",
    "center",
    800,
  );
  const hoveredBattle = hover.target?.kind === "battle";
  const canBattle = engine.boardCount > 0;
  fillRounded(
    ctx,
    battleRect,
    12,
    hoveredBattle && canBattle ? "#71e0b0" : canBattle ? "#47bd8a" : "#263744",
  );
  text(
    ctx,
    "开战",
    battleRect.x + battleRect.w / 2,
    battleRect.y + 19,
    12,
    canBattle ? "#061710" : "#607787",
    "center",
    900,
  );
  text(
    ctx,
    "SPACE",
    battleRect.x + battleRect.w / 2,
    battleRect.y + 35,
    8,
    canBattle ? "#164a35" : "#4b6374",
    "center",
    800,
  );

  fillRounded(
    ctx,
    { x: 26, y: 548, w: 752, h: 148 },
    18,
    "rgba(8, 18, 28, 0.95)",
  );
  strokeRounded(
    ctx,
    { x: 26, y: 548, w: 752, h: 148 },
    18,
    "rgba(111, 191, 235, 0.16)",
  );
  text(
    ctx,
    `备战席  ${state.bench.filter(Boolean).length}/8`,
    48,
    570,
    12,
    "#9cb3c3",
    "left",
    800,
  );
  text(
    ctx,
    `${bookLevelForPlayerLevel(state.playerLevel)} 本 · 上阵 ${engine.boardCount}/${engine.boardCap}`,
    612,
    570,
    11,
    engine.boardCount === engine.boardCap ? "#ffd166" : "#72d8ff",
    "right",
    800,
  );

  const selectedUnit =
    state.selected &&
    (state.selected.zone === "board"
      ? state.board[state.selected.index]
      : state.bench[state.selected.index]);
  fillRounded(
    ctx,
    sellRect,
    10,
    selectedUnit ? "rgba(255, 104, 122, 0.15)" : "rgba(28, 42, 52, 0.7)",
  );
  strokeRounded(ctx, sellRect, 10, selectedUnit ? "#ff687a" : "#2d4556");
  text(
    ctx,
    selectedUnit
      ? `回收 +${UNIT_DEFS[selectedUnit.id].cost * (selectedUnit.star === 1 ? 1 : selectedUnit.star === 2 ? 3 : 9)}`
      : "选择单位",
    sellRect.x + sellRect.w / 2,
    sellRect.y + 17,
    10,
    selectedUnit ? "#ff9cac" : "#526d80",
    "center",
    800,
  );

  state.bench.forEach((unit, index) => {
    const rect = benchRect(index);
    const hovered =
      hover.target?.kind === "bench" && hover.target.index === index;
    const selected =
      state.selected?.zone === "bench" && state.selected.index === index;
    fillRounded(
      ctx,
      rect,
      12,
      hovered ? "rgba(75, 131, 165, 0.2)" : "rgba(12, 27, 39, 0.75)",
    );
    strokeRounded(
      ctx,
      rect,
      12,
      selected ? "#7de2ff" : hovered ? "#466f88" : "#223d4f",
      selected ? 2 : 1,
    );
    if (unit) drawOwnedUnit(ctx, unit, rect, selected, true);
    else
      text(
        ctx,
        "空",
        rect.x + rect.w / 2,
        rect.y + rect.h / 2,
        10,
        "#314d60",
        "center",
        700,
      );
  });

  text(
    ctx,
    `${SHOP_UNITS.length} 个兵种 · 同名三合一 · 羁绊同名只计一次`,
    807,
    622,
    10,
    "#607d91",
    "left",
    500,
  );
  const activeNames = engine
    .getActiveTraits()
    .map((trait) => `${trait.name}${["", "Ⅰ", "Ⅱ", "Ⅲ"][trait.level]}`)
    .join(" · ");
  setTextFont(ctx, 10, 700);
  text(
    ctx,
    truncateText(
      ctx,
      activeNames ? `已激活：${activeNames}` : "常规羁绊按 2/4/6；关系羁绊按图标说明",
      270,
    ),
    807,
    647,
    10,
    activeNames ? "#7de2ff" : "#526d80",
    "left",
    700,
  );
  setTextFont(ctx, 10, 500);
  text(
    ctx,
    truncateText(ctx, `连胜 ${state.streak} · 10 金币提供 1 利息（最多 2）`, 270),
    807,
    672,
    10,
    "#7d94a4",
    "left",
    500,
  );
  if (state.augmentHistory.length) {
    const latest = state.augmentHistory[state.augmentHistory.length - 1];
    const augment = AUGMENTS.find((item) => item.id === latest.id);
    setTextFont(ctx, 9, 700);
    text(
      ctx,
      truncateText(
        ctx,
        `最新天赋（共 ${state.augmentHistory.length} 项）：第 ${latest.round} 战 · ${augment?.name || ""}`,
        270,
      ),
      807,
      692,
      9,
      "#c9b1ee",
      "left",
      700,
    );
  }
};

const drawBattlefield = (ctx: CanvasRenderingContext2D) => {
  const field: Rect = { x: 24, y: 94, w: 1072, h: 596 };
  const gradient = ctx.createLinearGradient(
    field.x,
    field.y,
    field.x + field.w,
    field.y,
  );
  gradient.addColorStop(0, "rgba(15, 51, 66, 0.92)");
  gradient.addColorStop(0.48, "rgba(20, 34, 53, 0.96)");
  gradient.addColorStop(0.52, "rgba(38, 27, 51, 0.96)");
  gradient.addColorStop(1, "rgba(61, 23, 47, 0.92)");
  fillRounded(ctx, field, 20, gradient);
  strokeRounded(ctx, field, 20, "rgba(118, 189, 229, 0.2)");

  ctx.save();
  roundedPath(ctx, field, 20);
  ctx.clip();
  ctx.strokeStyle = "rgba(127, 186, 220, 0.08)";
  ctx.lineWidth = 1;
  for (let x = 52; x < 1090; x += 54) {
    ctx.beginPath();
    ctx.moveTo(x, 112);
    ctx.lineTo(x, 676);
    ctx.stroke();
  }
  for (let y = 122; y < 690; y += 54) {
    ctx.beginPath();
    ctx.moveTo(36, y);
    ctx.lineTo(1084, y);
    ctx.stroke();
  }

  const rift = ctx.createLinearGradient(545, 0, 575, 0);
  rift.addColorStop(0, "rgba(114, 216, 255, 0)");
  rift.addColorStop(0.5, "rgba(188, 111, 255, 0.32)");
  rift.addColorStop(1, "rgba(255, 105, 159, 0)");
  ctx.fillStyle = rift;
  ctx.fillRect(530, 94, 60, 596);
  ctx.restore();

  text(ctx, "守备方", 48, 118, 10, "#72d8ff", "left", 800);
  text(ctx, "裂隙军团", 1072, 118, 10, "#ff6d9a", "right", 800);
};

const fighterRadius = (fighter: Fighter) =>
  fighter.radius || fighterVisualRadius(fighter.unitId, fighter.star);

const drawFighter = (
  ctx: CanvasRenderingContext2D,
  fighter: Fighter,
  visualTime: number,
) => {
  if (!fighter.alive) return;
  const def = UNIT_DEFS[fighter.unitId];
  const radius = fighterRadius(fighter);
  const jumping = fighter.jumpTime > 0 && fighter.jumpDuration > 0;
  const jumpProgress = jumping
    ? 1 - fighter.jumpTime / fighter.jumpDuration
    : 0;
  const jumpEase = 0.5 - Math.cos(jumpProgress * Math.PI) / 2;
  const renderX = jumping
    ? fighter.jumpFromX + (fighter.jumpToX - fighter.jumpFromX) * jumpEase
    : fighter.x;
  const renderY = jumping
    ? fighter.jumpFromY +
      (fighter.jumpToY - fighter.jumpFromY) * jumpEase -
      Math.sin(jumpProgress * Math.PI) * 92
    : fighter.y;
  const attackProgress = fighter.attackPulse > 0 ? fighter.attackPulse / 0.22 : 0;
  const lunge = Math.sin((1 - attackProgress) * Math.PI) * 10;
  const attackDistance = Math.hypot(
    fighter.attackTargetX - renderX,
    fighter.attackTargetY - renderY,
  );
  const attackOffsetX =
    attackDistance > 0 ? ((fighter.attackTargetX - renderX) / attackDistance) * lunge : 0;
  const attackOffsetY =
    attackDistance > 0 ? ((fighter.attackTargetY - renderY) / attackDistance) * lunge : 0;
  const drawX = renderX + attackOffsetX;
  const drawY = renderY + attackOffsetY;
  const hitProgress = fighter.hitPulse > 0 ? fighter.hitPulse / 0.2 : 0;
  ctx.save();
  ctx.translate(drawX, drawY);
  if (fighter.growthStacks > 0) {
    const growth = 1 + fighter.growthStacks * 0.015 + Math.sin(visualTime * 8) * 0.008;
    ctx.scale(growth, growth);
  }
  if (fighter.attackPulse > 0)
    ctx.scale(1 + lunge / 70, 1 - lunge / 130);
  if (fighter.hitPulse > 0)
    ctx.scale(1 - 0.08 * hitProgress, 1 + 0.08 * hitProgress);
  ctx.translate(-drawX, -drawY);
  ctx.globalAlpha = fighter.stun > 0 ? 0.72 : 1;
  ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
  ctx.beginPath();
  ctx.ellipse(
    renderX,
    jumping ? fighter.jumpFromY + radius * 0.8 : drawY + radius * 0.8,
    radius * 0.95,
    radius * 0.33,
    0,
    0,
    Math.PI * 2,
  );
  ctx.fill();

  if (fighter.shield > 0) {
    ctx.beginPath();
    ctx.arc(
      drawX,
      drawY,
      radius + 7 + Math.sin(visualTime * 6) * 2,
      0,
      Math.PI * 2,
    );
    ctx.strokeStyle = "rgba(110, 222, 255, 0.8)";
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  drawUnitPortrait(
    ctx,
    fighter.unitId,
    drawX,
    drawY,
    radius,
    fighter.team,
    1,
    fighter.facingX < 0,
  );
  if (fighter.hitPulse > 0) {
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = 0.75 * hitProgress;
    ctx.fillStyle = "#ff526f";
    ctx.beginPath();
    ctx.arc(drawX, drawY, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = fighter.stun > 0 ? 0.72 : 1;
  }
  drawStars(ctx, fighter.star, drawX, drawY - radius - 13);

  const barWidth = radius * 2.25;
  fillRounded(
    ctx,
    {
      x: drawX - barWidth / 2,
      y: drawY + radius + 9,
      w: barWidth,
      h: 7,
    },
    4,
    "#152430",
  );
  const hpRatio = Math.max(0, fighter.hp / fighter.maxHp);
  const hpColor = fighter.team === "player" ? "#52de9b" : "#ff668a";
  fillRounded(
    ctx,
    {
      x: drawX - barWidth / 2,
      y: drawY + radius + 9,
      w: barWidth * hpRatio,
      h: 7,
    },
    4,
    hpColor,
  );
  fillRounded(
    ctx,
    {
      x: drawX - barWidth / 2,
      y: drawY + radius + 19,
      w: barWidth,
      h: 4,
    },
    2,
    "#14222d",
  );
  const energyRatio = Math.max(0, Math.min(1, fighter.energy / fighter.maxEnergy));
  const energyColor = ENERGY_PROFILES[fighter.energyStyle].color;
  fillRounded(
    ctx,
    {
      x: drawX - barWidth / 2,
      y: drawY + radius + 19,
      w: barWidth * energyRatio,
      h: 4,
    },
    2,
    energyColor,
  );
  if (energyRatio >= 1) {
    strokeRounded(ctx, { x: drawX - barWidth / 2, y: drawY + radius + 19, w: barWidth, h: 4 }, 2, "#f4fbff", 1);
  }

  if (fighter.stun > 0)
    text(
      ctx,
      "✦",
      drawX,
      drawY - radius - 27,
      15,
      "#ffd95e",
      "center",
      800,
    );
  if (fighter.burnTime > 0) {
    ctx.beginPath();
    ctx.arc(
      drawX + radius * 0.7,
      drawY - radius * 0.55,
      5 + Math.sin(visualTime * 10) * 2,
      0,
      Math.PI * 2,
    );
    ctx.fillStyle = "#ff7a50";
    ctx.fill();
  }
  if (fighter.gen27Buffed) {
    ctx.beginPath();
    ctx.arc(drawX, drawY, radius + 9, 0, Math.PI * 2);
    ctx.strokeStyle = "#bd9bff";
    ctx.lineWidth = 2;
    ctx.stroke();
    text(ctx, "27", drawX, drawY - radius - 27, 9, "#dfccff", "center", 800);
  }
  if (fighter.enraged) {
    ctx.beginPath();
    ctx.arc(drawX, drawY, radius + 12, 0, Math.PI * 2);
    ctx.strokeStyle = "#ff4f9a";
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  text(
    ctx,
    `${def.name}${fighter.growthStacks ? ` · 饱${fighter.growthStacks}` : ""}`,
    drawX,
    drawY + radius + 35,
    9,
    fighter.team === "player" ? "#a9c8dc" : "#d9a0b5",
    "center",
    600,
  );
  ctx.restore();
};

const drawMechanicalRabbitPet = (
  ctx: CanvasRenderingContext2D,
  pet: MechanicalRabbitPet,
  visualTime: number,
) => {
  const fade = Math.max(0.25, Math.min(1, pet.life / 0.7));
  const bob = Math.sin(visualTime * 8 + pet.x * 0.03) * 3;
  const muzzle = mechanicalRabbitMuzzle(pet);
  const localMuzzleX = (muzzle.x - pet.x) * pet.facingX;
  const localMuzzleY = muzzle.y - pet.y;
  ctx.save();
  ctx.globalAlpha = fade;
  ctx.fillStyle = "rgba(0, 0, 0, 0.26)";
  ctx.beginPath();
  ctx.ellipse(pet.x, pet.y + pet.radius * 0.88, pet.radius * 1.2, pet.radius * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.translate(pet.x, pet.y + bob);
  ctx.scale(pet.facingX, 1);

  const baseGradient = ctx.createLinearGradient(-pet.radius, -pet.radius, pet.radius, pet.radius);
  baseGradient.addColorStop(0, "#607384");
  baseGradient.addColorStop(0.48, "#263845");
  baseGradient.addColorStop(1, "#111b27");
  ctx.fillStyle = baseGradient;
  ctx.strokeStyle = "#afc6d5";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-pet.radius, -4);
  ctx.lineTo(-pet.radius * 0.55, -pet.radius * 0.8);
  ctx.lineTo(pet.radius * 0.66, -pet.radius * 0.7);
  ctx.lineTo(pet.radius * 1.03, 0);
  ctx.lineTo(pet.radius * 0.46, pet.radius * 0.72);
  ctx.lineTo(-pet.radius * 0.65, pet.radius * 0.56);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  [-1, 1].forEach((side) => {
    const rearX = side * pet.radius * 0.43;
    const tipX = pet.radius * 1.14;
    const rootY = side * pet.radius * 0.28 - pet.radius * 0.48;
    const tipY = side * pet.radius * 0.18 - pet.radius * 1.16;
    ctx.fillStyle = "#1c2937";
    ctx.strokeStyle = "#dbe4eb";
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(rearX - pet.radius * 0.23, rootY + pet.radius * 0.35);
    ctx.lineTo(rearX + pet.radius * 0.18, rootY - pet.radius * 0.24);
    ctx.lineTo(tipX, tipY);
    ctx.lineTo(rearX + pet.radius * 0.48, rootY + pet.radius * 0.43);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#f6f2f3";
    ctx.beginPath();
    ctx.moveTo(rearX + pet.radius * 0.02, rootY + pet.radius * 0.22);
    ctx.lineTo(rearX + pet.radius * 0.22, rootY - pet.radius * 0.04);
    ctx.lineTo(tipX - pet.radius * 0.22, tipY + pet.radius * 0.18);
    ctx.lineTo(rearX + pet.radius * 0.31, rootY + pet.radius * 0.33);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#f2c9d0";
    ctx.fillRect(rearX + pet.radius * 0.17, rootY + pet.radius * 0.27, pet.radius * 0.32, 3);
  });

  ctx.fillStyle = "#92d7ff";
  ctx.shadowColor = "#92d7ff";
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.arc(pet.radius * 0.32, -2, 3, 0, Math.PI * 2);
  ctx.fill();
  if (pet.attackPulse > 0) {
    const flash = 1 + (pet.attackPulse / 0.16) * 0.75;
    ctx.globalCompositeOperation = "screen";
    ctx.fillStyle = "rgba(218, 250, 255, 0.96)";
    ctx.beginPath();
    ctx.arc(localMuzzleX, localMuzzleY, 4.5 * flash, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
};

const drawMechanicalRabbitPets = (ctx: CanvasRenderingContext2D, state: GameState) => {
  const battle = state.battle;
  if (!battle) return;
  battle.pets.forEach((pet) => drawMechanicalRabbitPet(ctx, pet, state.visualTime));
};

const drawProjectiles = (ctx: CanvasRenderingContext2D, state: GameState) => {
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

const drawEffects = (ctx: CanvasRenderingContext2D, state: GameState) => {
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
      ctx.arc(
        effect.x,
        effect.y,
        Math.max(6, (effect.size || 80) * progress),
        0,
        Math.PI * 2,
      );
      ctx.strokeStyle = effect.color;
      ctx.lineWidth = Math.max(2, 8 * (1 - progress));
      ctx.stroke();
    } else if (effect.kind === "burst") {
      const radius = (effect.size || 40) * (0.35 + progress * 0.65);
      const gradient = ctx.createRadialGradient(
        effect.x,
        effect.y,
        0,
        effect.x,
        effect.y,
        radius,
      );
      gradient.addColorStop(0, effect.color);
      gradient.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, radius, 0, Math.PI * 2);
      ctx.fill();
    } else {
      text(
        ctx,
        effect.text || "",
        effect.x,
        effect.y - progress * 26,
        effect.size || 14,
        effect.color,
        "center",
        800,
      );
    }
    ctx.restore();
  });
};

const formatCombatValue = (value: number) => {
  if (value < 1000) return `${Math.round(value)}`;
  return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
};

const drawBattleRanking = (
  ctx: CanvasRenderingContext2D,
  engine: AutoChessEngine,
  hover: HoverState,
) => {
  const battle = engine.state.battle;
  if (!battle) return;
  const isToggleHovered = hover.target?.kind === "rankingToggle";
  fillRounded(
    ctx,
    rankingToggleRect,
    17,
    isToggleHovered ? "rgba(42, 78, 101, 0.96)" : "rgba(7, 18, 29, 0.9)",
  );
  strokeRounded(ctx, rankingToggleRect, 17, battle.rankingOpen ? "#7fdcff" : "#36586e");
  text(ctx, `战斗统计 · D · ${battle.rankingOpen ? "⌃" : "▸"}`, 982, 117, 11, "#dcefff", "center", 700);
  if (!battle.rankingOpen) return;

  fillRounded(ctx, rankingPanelRect, 14, "rgba(5, 15, 24, 0.9)");
  strokeRounded(ctx, rankingPanelRect, 14, "#41647b");
  text(ctx, "本场战斗", 816, 160, 12, "#eef7ff", "left", 800);
  const labels: Array<{ metric: "damage" | "support" | "taken"; label: string; color: string }> = [
    { metric: "damage", label: "输出", color: "#ff9b79" },
    { metric: "support", label: "治疗/护盾", color: "#75e6b0" },
    { metric: "taken", label: "承伤", color: "#c69bff" },
  ];
  labels.forEach(({ metric, label, color }) => {
    const rect = rankingMetricRects.find((item) => item.metric === metric)?.rect;
    if (!rect) return;
    const selected = battle.rankingMetric === metric;
    fillRounded(ctx, rect, 9, selected ? `${color}33` : "rgba(32, 53, 68, 0.72)");
    strokeRounded(ctx, rect, 9, selected ? color : "#304f63");
    text(ctx, label, rect.x + rect.w / 2, rect.y + 12, 9, selected ? color : "#a7bdca", "center", 700);
  });
  const ranking = engine.getBattleRanking();
  const maxValue = Math.max(1, ...ranking.map((row) => row.value));
  ranking.slice(0, 8).forEach(({ fighter, value }, index) => {
    const y = 217 + index * 32;
    const definition = UNIT_DEFS[fighter.unitId];
    ctx.save();
    ctx.globalAlpha = fighter.alive ? 1 : 0.42;
    fillRounded(ctx, { x: 812, y: y - 13, w: 248, h: 27 }, 8, "rgba(18, 36, 49, 0.78)");
    ctx.fillStyle = `${battle.rankingMetric === "damage" ? "#ff9b79" : battle.rankingMetric === "support" ? "#75e6b0" : "#c69bff"}33`;
    ctx.fillRect(848, y - 8, 142 * (value / maxValue), 16);
    text(ctx, `${index + 1}`, 822, y, 10, "#8ba4b6", "center", 700);
    drawUnitPortrait(ctx, fighter.unitId, 842, y, 11, "player");
    setTextFont(ctx, 10, 700);
    text(
      ctx,
      truncateText(ctx, `${definition.name}${"★".repeat(fighter.star)}`, 118),
      859,
      y,
      10,
      definition.accent,
      "left",
      700,
    );
    const detail = battle.rankingMetric === "support"
      ? `治 ${formatCombatValue(fighter.healingDone)} · 盾 ${formatCombatValue(fighter.shieldingDone)}`
      : formatCombatValue(value);
    text(ctx, detail, 1052, y, 10, "#eef7ff", "right", 700);
    ctx.restore();
  });
};

const drawBattle = (
  ctx: CanvasRenderingContext2D,
  engine: AutoChessEngine,
  hover: HoverState,
) => {
  const state = engine.state;
  const battle = state.battle;
  if (!battle) return;
  drawBattlefield(ctx);
  const remaining = Math.max(0, battle.limit - battle.elapsed);
  fillRounded(
    ctx,
    { x: 485, y: 98, w: 150, h: 40 },
    20,
    "rgba(7, 15, 24, 0.9)",
  );
  text(
    ctx,
    `⏱ ${remaining.toFixed(1)}s`,
    560,
    118,
    14,
    remaining < 6 ? "#ff718e" : "#dcefff",
    "center",
    800,
  );

  [...battle.player, ...battle.enemy]
    .filter((fighter) => fighter.alive)
    .sort((a, b) => a.y - b.y)
    .forEach((fighter) => drawFighter(ctx, fighter, state.visualTime));
  drawMechanicalRabbitPets(ctx, state);
  drawProjectiles(ctx, state);
  drawEffects(ctx, state);

  if (battle.bannerTimer > 0) {
    const alpha = Math.min(1, battle.bannerTimer * 1.4);
    setTextFont(ctx, 15, 800);
    const bannerLines = boundedTextLines(ctx, battle.banner, 310, 2);
    const bannerHeight = bannerLines.length === 2 ? 66 : 48;
    const bannerY = 154;
    ctx.save();
    ctx.globalAlpha = alpha;
    fillRounded(
      ctx,
      { x: 385, y: bannerY, w: 350, h: bannerHeight },
      24,
      "rgba(5, 12, 20, 0.82)",
    );
    strokeRounded(
      ctx,
      { x: 385, y: bannerY, w: 350, h: bannerHeight },
      24,
      "#6b85a8",
    );
    drawBoundedText(
      ctx,
      battle.banner,
      560,
      bannerY + bannerHeight / 2,
      15,
      "#f0f7ff",
      "center",
      800,
      310,
      2,
      18,
    );
    ctx.restore();
  }

  const active = engine.getActiveTraits();
  if (active.length) {
    setTextFont(ctx, 10, 700);
    text(
      ctx,
      truncateText(
        ctx,
        `羁绊：${active.map((trait) => `${trait.name}${["", "Ⅰ", "Ⅱ", "Ⅲ"][trait.level]}`).join(" · ")}`,
        440,
      ),
      48,
      665,
      10,
      "#7fdcff",
      "left",
      700,
    );
  }
  if (state.augments.length) {
    const augmentNames = state.augments
      .map((id) => AUGMENTS.find((item) => item.id === id)?.name)
      .filter(Boolean)
      .join(" · ");
    setTextFont(ctx, 10, 700);
    text(
      ctx,
      truncateText(ctx, `契印：${augmentNames}`, 440),
      1072,
      665,
      10,
      "#cba0ff",
      "right",
      700,
    );
  }

  drawBattleRanking(ctx, engine, hover);
  if (hover.target?.kind === "fighter") {
    const fighter = engine.getBattleFighter(hover.target.fid);
    drawTooltip(ctx, hover.target.unitId, hover.target.star, hover.x, hover.y, fighter || undefined);
  }
};

const resultContinueLabel = (engine: AutoChessEngine) => {
  const { state } = engine;
  if (state.hp <= 0) return "继续 · 查看结局";
  const isAugmentRound =
    state.round === 2 ||
    state.round === 5 ||
    (state.round > CAMPAIGN_ROUNDS &&
      (state.round - CAMPAIGN_ROUNDS) % 6 === 0 &&
      state.augments.length < AUGMENTS.length);
  return isAugmentRound ? "继续 · 选择契印" : "继续 · 进入整备";
};

const drawResultRow = (
  ctx: CanvasRenderingContext2D,
  fighter: Fighter,
  value: number,
  index: number,
  x: number,
  y: number,
  w: number,
  metric: "damage" | "support" | "taken",
) => {
  const def = UNIT_DEFS[fighter.unitId];
  const accent = fighter.team === "player" ? "#66d7ff" : "#ff7894";
  ctx.save();
  ctx.globalAlpha = fighter.alive ? 1 : 0.45;
  fillRounded(ctx, { x, y, w, h: 49 }, 9, "rgba(13, 30, 42, 0.9)");
  drawUnitPortrait(ctx, fighter.unitId, x + 21, y + 24, 14, fighter.team);
  setTextFont(ctx, 10, 800);
  text(
    ctx,
    truncateText(ctx, `${index + 1}. ${def.name}${"★".repeat(fighter.star)}`, w - 132),
    x + 42,
    y + 15,
    10,
    def.accent,
    "left",
    800,
  );
  text(ctx, fighter.alive ? "存活" : "已击败", x + w - 10, y + 15, 9, fighter.alive ? "#71e1aa" : "#8397a5", "right", 700);
  text(ctx, `血 ${Math.round(fighter.hp)}/${Math.round(fighter.maxHp)}${fighter.shield > 0 ? ` · 盾 ${Math.round(fighter.shield)}` : ""}`, x + 42, y + 32, 9, "#9ab2c1", "left", 600);
  text(ctx, `攻 ${Math.round(fighter.attack)} · 甲 ${Math.round(fighter.armor)}`, x + 42, y + 44, 9, accent, "left", 700);
  const detail = metric === "support"
    ? `治 ${formatCombatValue(fighter.healingDone)} · 盾 ${formatCombatValue(fighter.shieldingDone)}`
    : formatCombatValue(value);
  text(ctx, detail, x + w - 10, y + 39, 10, "#edf8ff", "right", 800);
  ctx.restore();
};

const drawResult = (
  ctx: CanvasRenderingContext2D,
  engine: AutoChessEngine,
  hover: HoverState,
) => {
  const { state } = engine;
  const battle = state.battle;
  const result = state.result;
  if (!battle || !result) return;
  ctx.fillStyle = "rgba(3, 8, 14, 0.72)";
  ctx.fillRect(0, 78, WIDTH, HEIGHT - 78);
  const rect: Rect = { x: 42, y: 103, w: 1036, h: 595 };
  fillRounded(ctx, rect, 20, "rgba(7, 19, 30, 0.98)");
  strokeRounded(ctx, rect, 20, result.won ? "#5ee0a3" : "#ff6a85", 2);
  const resultColor = result.won ? "#62e3a6" : "#ff718a";
  text(ctx, result.won ? "战斗结算 · 胜利" : "战斗结算 · 失利", 560, 134, 13, resultColor, "center", 900);
  setTextFont(ctx, 24, 900);
  text(
    ctx,
    truncateText(ctx, result.headline, 920),
    560,
    164,
    24,
    "#f2f8ff",
    "center",
    900,
  );
  drawBoundedText(
    ctx,
    result.detail,
    560,
    185,
    10,
    "#91a9b9",
    "center",
    500,
    920,
    2,
    14,
  );
  const experienceText = result.upgradeDiscount ? ` · 升本费用 -${result.upgradeDiscount}` : "";
  const reward = result.won
    ? `+ ${result.income} 金币${experienceText}`
    : `核心 -${result.damage} · +${result.income} 金币${experienceText}`;
  text(ctx, reward, 560, 205, 13, result.won ? "#ffd166" : "#ff9ba9", "center", 800);

  const labels: Array<{ metric: "damage" | "support" | "taken"; label: string; color: string }> = [
    { metric: "damage", label: "输出", color: "#ff9b79" },
    { metric: "support", label: "治疗/护盾", color: "#75e6b0" },
    { metric: "taken", label: "承伤", color: "#c69bff" },
  ];
  labels.forEach(({ metric, label, color }) => {
    const rectForMetric = resultMetricRects.find((item) => item.metric === metric)?.rect;
    if (!rectForMetric) return;
    const selected = battle.rankingMetric === metric;
    fillRounded(ctx, rectForMetric, 9, selected ? `${color}33` : "rgba(32, 53, 68, 0.72)");
    strokeRounded(ctx, rectForMetric, 9, selected ? color : "#304f63");
    text(ctx, label, rectForMetric.x + rectForMetric.w / 2, rectForMetric.y + 15, 9, selected ? color : "#a7bdca", "center", 700);
  });

  text(ctx, "我方阵容", 76, 258, 13, "#7fdcff", "left", 800);
  text(ctx, "敌方阵容", 576, 258, 13, "#ff91a9", "left", 800);
  const playerRows = engine.getBattleRanking("player");
  const enemyRows = engine.getBattleRanking("enemy");
  const rows = Math.max(playerRows.length, enemyRows.length);
  for (let index = 0; index < rows; index += 1) {
    const y = 270 + index * 55;
    const player = playerRows[index];
    const enemy = enemyRows[index];
    if (player) drawResultRow(ctx, player.fighter, player.value, index, 64, y, 476, battle.rankingMetric);
    if (enemy) drawResultRow(ctx, enemy.fighter, enemy.value, index, 564, y, 476, battle.rankingMetric);
  }

  const hovered = hover.target?.kind === "resultContinue";
  fillRounded(ctx, resultContinueRect, 18, hovered ? "#244c62" : "#17384b");
  strokeRounded(ctx, resultContinueRect, 18, resultColor, 1.5);
  text(ctx, resultContinueLabel(engine), 560, 664, 13, "#f3fbff", "center", 800);
};

const drawAugments = (
  ctx: CanvasRenderingContext2D,
  engine: AutoChessEngine,
  hover: HoverState,
) => {
  const state = engine.state;
  text(ctx, "战术契印", WIDTH / 2, 148, 36, "#f3f8ff", "center", 900);
  text(
    ctx,
    "选择一项永久天赋；历次选择会记录在备战、结算与文本状态中。",
    WIDTH / 2,
    188,
    13,
    "#8aa4b7",
    "center",
    500,
  );
  state.augmentChoices.forEach((id, index) => {
    const augment = AUGMENTS.find((item) => item.id === id);
    if (!augment) return;
    const rect = augmentRect(index);
    const hovered =
      hover.target?.kind === "augment" && hover.target.index === index;
    const lifted = { ...rect, y: rect.y + (hovered ? -6 : 0) };
    const gradient = ctx.createLinearGradient(
      lifted.x,
      lifted.y,
      lifted.x,
      lifted.y + lifted.h,
    );
    gradient.addColorStop(
      0,
      hovered ? `${augment.color}30` : "rgba(19, 34, 49, 0.97)",
    );
    gradient.addColorStop(1, "rgba(7, 15, 24, 0.98)");
    fillRounded(ctx, lifted, 20, gradient);
    strokeRounded(
      ctx,
      lifted,
      20,
      hovered ? augment.color : "#2d4659",
      hovered ? 2 : 1,
    );

    ctx.beginPath();
    ctx.arc(lifted.x + lifted.w / 2, lifted.y + 62, 31, 0, Math.PI * 2);
    ctx.fillStyle = `${augment.color}28`;
    ctx.fill();
    ctx.strokeStyle = augment.color;
    ctx.lineWidth = 2;
    ctx.stroke();
    text(
      ctx,
      "◇",
      lifted.x + lifted.w / 2,
      lifted.y + 62,
      28,
      augment.color,
      "center",
      700,
    );
    text(
      ctx,
      augment.kicker.toUpperCase(),
      lifted.x + lifted.w / 2,
      lifted.y + 118,
      10,
      augment.color,
      "center",
      900,
    );
    text(
      ctx,
      augment.name,
      lifted.x + lifted.w / 2,
      lifted.y + 155,
      22,
      "#eef6ff",
      "center",
      800,
    );
    drawBoundedText(
      ctx,
      augment.description,
      lifted.x + lifted.w / 2,
      lifted.y + 202,
      13,
      "#9db2c1",
      "center",
      500,
      lifted.w - 40,
      2,
      19,
    );
    fillRounded(
      ctx,
      { x: lifted.x + 70, y: lifted.y + 248, w: 180, h: 34 },
      17,
      hovered ? augment.color : "#203748",
    );
    text(
      ctx,
      hovered ? "装 配" : "选 择",
      lifted.x + lifted.w / 2,
      lifted.y + 265,
      11,
      hovered ? "#09131b" : "#b1c4d0",
      "center",
      900,
    );
  });
  const selectionHistory = state.augmentHistory
    .map(({ round, id }) => {
      const augment = AUGMENTS.find((item) => item.id === id);
      return augment ? `第 ${round} 战：${augment.name}（${augment.description}）` : null;
    })
    .filter(Boolean)
    .join("  ·  ");
  drawBoundedText(
    ctx,
    selectionHistory ? `历次选择：${selectionHistory}` : "已持有：无",
    WIDTH / 2,
    625,
    10,
    "#b8a6d8",
    "center",
    600,
    860,
    2,
    15,
  );
};

const drawGameOver = (
  ctx: CanvasRenderingContext2D,
  state: GameState,
  hover: HoverState,
) => {
  const won = state.finalWon;
  const glow = ctx.createRadialGradient(560, 310, 20, 560, 310, 320);
  glow.addColorStop(
    0,
    won ? "rgba(76, 231, 164, 0.16)" : "rgba(255, 81, 130, 0.13)",
  );
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(180, 70, 760, 560);
  text(
    ctx,
    won ? "裂 隙 已 封 闭" : "战 线 已 失 守",
    WIDTH / 2,
    188,
    12,
    won ? "#65e4a9" : "#ff718e",
    "center",
    900,
  );
  text(
    ctx,
    won ? "守望成功" : `止步第 ${state.round} 战`,
    WIDTH / 2,
    252,
    44,
    "#f3f8ff",
    "center",
    900,
  );
  drawBoundedText(
    ctx,
    won
      ? "这套阵容活着穿过了整条裂隙。"
      : "差一点的站位、一次不同的契印，也许就是下一局的答案。",
    WIDTH / 2,
    305,
    14,
    "#8ea7b9",
    "center",
    500,
    620,
    2,
    19,
  );

  fillRounded(
    ctx,
    { x: 325, y: 355, w: 470, h: 126 },
    18,
    "rgba(10, 22, 33, 0.9)",
  );
  text(ctx, "本局积分", 405, 385, 11, "#6f899c", "center", 700);
  text(
    ctx,
    state.score.toLocaleString(),
    405,
    428,
    30,
    "#ffd166",
    "center",
    900,
  );
  text(ctx, "最高纪录", 560, 385, 11, "#6f899c", "center", 700);
  text(
    ctx,
    state.bestScore.toLocaleString(),
    560,
    428,
    30,
    "#d8ebf8",
    "center",
    900,
  );
  text(ctx, "剩余核心", 715, 385, 11, "#6f899c", "center", 700);
  text(
    ctx,
    `${state.hp}/${state.maxHp}`,
    715,
    428,
    30,
    won ? "#65e4a9" : "#ff7b92",
    "center",
    900,
  );

  const history = state.augmentHistory
    .map(({ round, id }) => {
      const augment = AUGMENTS.find((item) => item.id === id);
      return augment ? `第${round}战 ${augment.name}` : null;
    })
    .filter(Boolean)
    .join(" · ");
  drawBoundedText(
    ctx,
    history ? `本局天赋记录：${history}` : "本局未获得天赋",
    WIDTH / 2,
    510,
    10,
    "#c8b3e2",
    "center",
    600,
    620,
    2,
    15,
  );

  const hovered = hover.target?.kind === "restart";
  fillRounded(ctx, restartRect, 18, hovered ? "#78dcff" : "#2a5770");
  text(
    ctx,
    "再开一局 · 新战术种子",
    restartRect.x + restartRect.w / 2,
    restartRect.y + 31,
    14,
    hovered ? "#07121a" : "#e7f5ff",
    "center",
    900,
  );
  text(
    ctx,
    "每局商店与天赋组合都会变化",
    WIDTH / 2,
    635,
    10,
    "#536f82",
    "center",
    500,
  );
};

const drawTooltip = (
  ctx: CanvasRenderingContext2D,
  unitId: UnitId,
  star: number,
  pointerX: number,
  pointerY: number,
  fighter?: Fighter,
) => {
  const def = UNIT_DEFS[unitId];
  const w = 330;
  const textWidth = w - 40;
  const energyLineHeight = 14;
  const abilityLineHeight = 17;
  const hp = fighter ? `${Math.round(fighter.hp)}/${Math.round(fighter.maxHp)}` : `${Math.round(def.hp * (star === 1 ? 1 : star === 2 ? 1.68 : 2.82))}`;
  const attack = fighter ? Math.round(fighter.attack) : Math.round(def.attack * (star === 1 ? 1 : star === 2 ? 1.68 : 2.82));
  const armor = fighter ? Math.round(fighter.armor) : def.armor;
  const range = fighter ? fighter.range : def.range;
  const attackInterval = fighter ? fighter.attackInterval : def.attackInterval;
  const moveSpeed = fighter ? fighter.moveSpeed : def.moveSpeed;
  const attackType = fighter?.attackType || def.attackType;
  const profile = fighter ? ENERGY_PROFILES[fighter.energyStyle] : def.energyProfile;
  const energy = fighter ? `${Math.round(fighter.energy)}/${fighter.maxEnergy}` : `${profile.start}/${profile.max}`;
  const energyText = `能量 ${energy} · ${profile.name} · ${describeEnergyRecovery(profile)}`;
  setTextFont(ctx, 8.5, 600);
  const energyLines = wrapText(ctx, energyText, textWidth);
  setTextFont(ctx, 10, 500);
  const abilityLines = wrapText(ctx, def.abilityDescription, textWidth).slice(0, 2);
  const energyY = 120;
  const combatY = energyY + energyLines.length * energyLineHeight + 4;
  const abilityTitleY = fighter ? combatY + 23 : combatY + 5;
  const abilityDescriptionY = abilityTitleY + 21;
  const traitY = abilityDescriptionY + abilityLines.length * abilityLineHeight + 19;
  const h = Math.max(fighter ? 252 : 222, traitY + 34);
  const x = Math.max(12, Math.min(WIDTH - w - 12, pointerX + 18));
  const y = Math.max(88, Math.min(HEIGHT - h - 12, pointerY + 18));
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = 24;
  fillRounded(ctx, { x, y, w, h }, 15, "rgba(5, 14, 23, 0.98)");
  ctx.restore();
  strokeRounded(ctx, { x, y, w, h }, 15, def.accent, 1.5);
  drawUnitPortrait(ctx, unitId, x + 42, y + 43, 25);
  setTextFont(ctx, 16, 800);
  text(ctx, truncateText(ctx, def.name, w - 108), x + 78, y + 28, 16, "#f0f7ff", "left", 800);
  text(
    ctx,
    `${"★".repeat(star)} · ${def.cost} 费`,
    x + 78,
    y + 52,
    10,
    def.accent,
    "left",
    800,
  );
  text(ctx, `生命 ${hp}${fighter?.shield ? ` · 盾 ${Math.round(fighter.shield)}` : ""}`, x + 20, y + 83, 10, "#8da7b9", "left", 600);
  text(ctx, `攻击 ${attack}`, x + 145, y + 83, 10, "#8da7b9", "left", 600);
  text(ctx, `护甲 ${armor}`, x + 225, y + 83, 10, "#8da7b9", "left", 600);
  setTextFont(ctx, 9, 600);
  text(
    ctx,
    truncateText(
      ctx,
      `${attackType === "ranged" ? "远程" : "近战"} · 射程 ${range} · 攻击间隔 ${attackInterval.toFixed(2)}s · 移速 ${Math.round(moveSpeed)}`,
      textWidth,
    ),
    x + 20,
    y + 101,
    9,
    "#68869a",
    "left",
    600,
  );
  energyLines.forEach((line, index) => {
    text(
      ctx,
      line,
      x + 20,
      y + energyY + index * energyLineHeight,
      8.5,
      profile.color,
      "left",
      600,
    );
  });
  if (fighter) {
    setTextFont(ctx, 9, 600);
    text(
      ctx,
      truncateText(
        ctx,
        `输出 ${formatCombatValue(fighter.damageDealt)} · 治疗 ${formatCombatValue(fighter.healingDone)} · 护盾 ${formatCombatValue(fighter.shieldingDone)} · 承伤 ${formatCombatValue(fighter.damageTaken)}`,
        textWidth,
      ),
      x + 20,
      y + combatY,
      9,
      "#9cc5d8",
      "left",
      600,
    );
  }
  text(ctx, def.abilityName, x + 20, y + abilityTitleY, 12, def.accent, "left", 800);
  abilityLines.forEach((line, index) => {
    text(
      ctx,
      line,
      x + 20,
      y + abilityDescriptionY + index * abilityLineHeight,
      10,
      "#a6bac7",
      "left",
      500,
    );
  });
  const traitNames = def.traits.map((trait) => TRAITS[trait].name).join(" · ");
  setTextFont(ctx, 10, 700);
  text(
    ctx,
    truncateText(ctx, traitNames, textWidth),
    x + w - 20,
    y + traitY,
    10,
    "#718da0",
    "right",
    700,
  );
};

const drawTraitTooltip = (
  ctx: CanvasRenderingContext2D,
  engine: AutoChessEngine,
  traitId: TraitId,
  pointerX: number,
  pointerY: number,
) => {
  const trait = TRAITS[traitId];
  const status = engine.getTraitStatus(traitId);
  const count = status.count;
  const level = status.level;
  const maxThreshold = status.maxThreshold;
  const w = 340;
  const lineHeight = 15;
  ctx.font = `500 10px ${FONT}`;
  const descriptionLines = wrapText(ctx, trait.description, w - 40);
  let contentY = 72 + descriptionLines.length * lineHeight + 11;
  const bonusRows = trait.thresholds.map((threshold, index) => {
    const reached = count >= threshold;
    const weight = reached ? 700 : 500;
    ctx.font = `${weight} 10px ${FONT}`;
    const lines = wrapText(ctx, `${threshold} 名：${trait.bonuses[index]}`, w - 62);
    const row = { reached, lines, y: contentY };
    contentY += lines.length * lineHeight + 7;
    return row;
  });
  const h = Math.max(174, contentY + 10);
  const x = Math.max(12, Math.min(WIDTH - w - 12, pointerX + 18));
  const y = Math.max(88, Math.min(HEIGHT - h - 12, pointerY + 18));
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = 24;
  fillRounded(ctx, { x, y, w, h }, 15, "rgba(5, 14, 23, 0.98)");
  ctx.restore();
  strokeRounded(ctx, { x, y, w, h }, 15, trait.color, 1.5);
  ctx.beginPath();
  ctx.arc(x + 32, y + 31, 12, 0, Math.PI * 2);
  ctx.fillStyle = `${trait.color}30`;
  ctx.fill();
  ctx.strokeStyle = trait.color;
  ctx.stroke();
  text(ctx, trait.name, x + 56, y + 25, 17, "#f0f7ff", "left", 800);
  text(
    ctx,
    `${trait.family} · 当前 ${count}/${maxThreshold} · ${level ? `${level} 阶已激活` : "尚未激活"}`,
    x + 56,
    y + 46,
    10,
    trait.color,
    "left",
    700,
  );
  descriptionLines.forEach((line, index) => {
    text(ctx, line, x + 20, y + 72 + index * lineHeight, 10, "#9bb2c2", "left", 500);
  });
  bonusRows.forEach((row) => {
    text(
      ctx,
      row.reached ? "◆" : "◇",
      x + 22,
      y + row.y,
      11,
      row.reached ? trait.color : "#455d70",
      "left",
      800,
    );
    row.lines.forEach((line, index) => {
      text(
        ctx,
        line,
        x + 42,
        y + row.y + index * lineHeight,
        10,
        row.reached ? "#e7f5ff" : "#71899a",
        "left",
        row.reached ? 700 : 500,
      );
    });
  });
};

const getTooltipUnit = (engine: AutoChessEngine, target: HitTarget) => {
  if (!target) return null;
  if (target.kind === "shop" && target.unitId)
    return { id: target.unitId, star: 1 };
  if ((target.kind === "board" || target.kind === "bench") && target.unitId)
    return { id: target.unitId, star: target.star || 1 };
  if (target.kind === "enemyPreview")
    return { id: target.unitId, star: target.star };
  return null;
};

const renderGame = (
  ctx: CanvasRenderingContext2D,
  engine: AutoChessEngine,
  hover: HoverState,
  traitScrollX: number,
) => {
  const state = engine.state;
  drawBackdrop(ctx, state);
  drawHeader(ctx, engine);

  if (state.phase === "title") drawTitle(ctx, engine, hover);
  else if (state.phase === "preparation")
    drawPreparation(ctx, engine, hover, traitScrollX);
  else if (state.phase === "battle" || state.phase === "result") {
    drawBattle(ctx, engine, hover);
    if (state.phase === "result") drawResult(ctx, engine, hover);
  } else if (state.phase === "augment") drawAugments(ctx, engine, hover);
  else if (state.phase === "gameover") drawGameOver(ctx, state, hover);

  if (state.phase === "preparation") {
    if (hover.target?.kind === "trait") {
      drawTraitTooltip(ctx, engine, hover.target.traitId, hover.x, hover.y);
    } else {
      const tooltipUnit = getTooltipUnit(engine, hover.target);
      if (tooltipUnit)
        drawTooltip(ctx, tooltipUnit.id, tooltipUnit.star, hover.x, hover.y);
    }
  }

  if (state.toast) {
    const color =
      state.toast.tone === "good"
        ? "#68e3aa"
        : state.toast.tone === "bad"
          ? "#ff7890"
          : "#79d8ff";
    ctx.save();
    ctx.globalAlpha = Math.min(1, state.toast.time * 2);
    setTextFont(ctx, 12, 700);
    const toastLines = boundedTextLines(ctx, state.toast.text, 600, 2);
    const widestLine = Math.max(...toastLines.map((line) => ctx.measureText(line).width));
    const width = Math.min(650, Math.max(220, widestLine + 50));
    const height = toastLines.length === 2 ? 56 : 38;
    const toastRect = { x: WIDTH / 2 - width / 2, y: 91, w: width, h: height };
    fillRounded(ctx, toastRect, 19, "rgba(5, 13, 21, 0.94)");
    strokeRounded(ctx, toastRect, 19, color, 1);
    drawBoundedText(
      ctx,
      state.toast.text,
      WIDTH / 2,
      toastRect.y + toastRect.h / 2,
      12,
      color,
      "center",
      700,
      width - 50,
      2,
      16,
    );
    ctx.restore();
  }
};

const hitTest = (
  ctx: CanvasRenderingContext2D,
  engine: AutoChessEngine,
  x: number,
  y: number,
  traitScrollX: number,
): HitTarget => {
  const state = engine.state;
  if (state.phase === "title") {
    const index = state.starterChoices.findIndex((_, itemIndex) =>
      inRect(x, y, starterRect(itemIndex)),
    );
    const id = state.starterChoices[index];
    return id ? { kind: "starter", id } : null;
  }
  if (state.phase === "preparation") {
    const enemyIndex = engine.currentWave.units.slice(0, 8).findIndex((_, index) =>
      Math.hypot(735 - index * 35 - x, 153 - y) <= 22,
    );
    if (enemyIndex >= 0) {
      const enemy = engine.currentWave.units[enemyIndex];
      return {
        kind: "enemyPreview",
        unitId: enemy.id,
        star: enemy.star || 1,
      };
    }
    const traitTarget =
      inRect(x, y, TRAIT_STRIP) &&
      traitPillLayout(ctx, engine, traitScrollX).items.find(({ rect }) =>
        inRect(x, y, rect),
      );
    if (traitTarget) return { kind: "trait", traitId: traitTarget.id };
    for (let index = 0; index < state.board.length; index += 1) {
      if (inRect(x, y, boardRect(index))) {
        const unit = state.board[index];
        return {
          kind: "board",
          index,
          unitId: unit?.id || null,
          star: unit?.star,
        };
      }
    }
    for (let index = 0; index < state.bench.length; index += 1) {
      if (inRect(x, y, benchRect(index))) {
        const unit = state.bench[index];
        return {
          kind: "bench",
          index,
          unitId: unit?.id || null,
          star: unit?.star,
        };
      }
    }
    for (let index = 0; index < state.shop.length; index += 1) {
      if (inRect(x, y, shopRect(index)))
        return { kind: "shop", index, unitId: state.shop[index] };
    }
    if (inRect(x, y, buyXpRect)) return { kind: "buyXp" };
    if (inRect(x, y, lockRect)) return { kind: "lock" };
    if (inRect(x, y, rerollRect)) return { kind: "reroll" };
    if (inRect(x, y, battleRect)) return { kind: "battle" };
    if (inRect(x, y, sellRect)) return { kind: "sell" };
  }
  if (state.phase === "augment") {
    const index = state.augmentChoices.findIndex((_, itemIndex) =>
      inRect(x, y, augmentRect(itemIndex)),
    );
    return index >= 0 ? { kind: "augment", index } : null;
  }
  if (state.phase === "result" && state.battle) {
    if (inRect(x, y, resultContinueRect)) return { kind: "resultContinue" };
    const metric = resultMetricRects.find((item) => inRect(x, y, item.rect));
    if (metric) return { kind: "resultMetric", metric: metric.metric };
    const fighter = [...state.battle.player, ...state.battle.enemy].find(
      (item) => Math.hypot(item.x - x, item.y - y) <= fighterRadius(item) + 8,
    );
    if (fighter)
      return { kind: "fighter", fid: fighter.fid, unitId: fighter.unitId, star: fighter.star };
    return null;
  }
  if (state.phase === "battle" && state.battle) {
    if (inRect(x, y, rankingToggleRect)) return { kind: "rankingToggle" };
    if (state.battle.rankingOpen) {
      const metric = rankingMetricRects.find((item) => inRect(x, y, item.rect));
      if (metric) return { kind: "rankingMetric", metric: metric.metric };
      if (inRect(x, y, rankingPanelRect)) return { kind: "rankingPanel" };
    }
    const fighter = [...state.battle.player, ...state.battle.enemy].find(
      (item) =>
        item.alive &&
        Math.hypot(item.x - x, item.y - y) <= fighterRadius(item) + 8,
    );
    if (fighter)
      return { kind: "fighter", fid: fighter.fid, unitId: fighter.unitId, star: fighter.star };
  }
  if (state.phase === "gameover" && inRect(x, y, restartRect))
    return { kind: "restart" };
  return null;
};

export default function AutoChessGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<AutoChessEngine | null>(null);
  const hoverRef = useRef<HoverState>({ target: null, x: 0, y: 0 });
  const dragRef = useRef<DragState | null>(null);
  const traitDragRef = useRef<TraitDragState | null>(null);
  const traitScrollXRef = useRef(0);
  const suppressClickRef = useRef(false);
  const frameRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const testTimeScaleRef = useRef(1);
  const audioRef = useRef<AutoChessAudio | null>(null);
  const lastPhaseRef = useRef<GameState["phase"]>("title");
  const lastToastRef = useRef("");
  const codexOpenRef = useRef(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [codexOpen, setCodexOpen] = useState(false);
  const [audioPreferences, setAudioPreferences] = useState<AudioPreferences>(
    DEFAULT_AUDIO_PREFERENCES,
  );
  const [fullscreenSupported, setFullscreenSupported] = useState(true);
  const [fullscreenMessage, setFullscreenMessage] = useState("");

  if (!engineRef.current) {
    const query =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search)
        : null;
    const requestedSeed = Number(query?.get("seed"));
    const requestedTimeScale = Number(query?.get("testSpeed"));
    testTimeScaleRef.current = Number.isFinite(requestedTimeScale)
      ? Math.max(1, Math.min(20, Math.floor(requestedTimeScale)))
      : 1;
    engineRef.current = new AutoChessEngine(
      Number.isFinite(requestedSeed) && requestedSeed > 0
        ? requestedSeed
        : undefined,
    );
  }

  if (!audioRef.current && typeof window !== "undefined")
    audioRef.current = new AutoChessAudio(audioPreferences);

  const playSound = useCallback((event: GameAudioEvent) => {
    audioRef.current?.unlock();
    audioRef.current?.play(event);
  }, []);

  const updateAudioPreferences = useCallback(
    (patch: Partial<AudioPreferences>) => {
      setAudioPreferences((current) => {
        const next = { ...current, ...patch };
        audioRef.current?.setPreferences(next);
        if (!next.muted) audioRef.current?.unlock();
        return next;
      });
    },
    [],
  );

  const syncCanvasResolution = useCallback(
    (canvas: HTMLCanvasElement) => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const requestedScale = Math.min(window.devicePixelRatio || 1, 2);
      const cssPixels = rect.width * rect.height;
      const budgetScale = Math.sqrt(MAX_CANVAS_PIXELS / cssPixels);
      const scale = Math.max(1, Math.min(requestedScale, budgetScale));
      const pixelWidth = Math.max(1, Math.round(rect.width * scale));
      const pixelHeight = Math.max(1, Math.round(rect.height * scale));
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
    },
    [],
  );

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const engine = engineRef.current;
    if (!canvas || !engine) return;
    syncCanvasResolution(canvas);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(canvas.width / WIDTH, 0, 0, canvas.height / HEIGHT, 0, 0);
    const layout = traitPillLayout(ctx, engine, traitScrollXRef.current);
    traitScrollXRef.current = Math.min(
      traitScrollXRef.current,
      layout.maxScrollX,
    );
    renderGame(ctx, engine, hoverRef.current, traitScrollXRef.current);
  }, [syncCanvasResolution]);

  const getHitTarget = (engine: AutoChessEngine, x: number, y: number) => {
    const ctx = canvasRef.current?.getContext("2d");
    return ctx ? hitTest(ctx, engine, x, y, traitScrollXRef.current) : null;
  };

  const getTraitMaxScrollX = (engine: AutoChessEngine) => {
    const ctx = canvasRef.current?.getContext("2d");
    return ctx ? traitPillLayout(ctx, engine, traitScrollXRef.current).maxScrollX : 0;
  };

  useEffect(() => {
    codexOpenRef.current = codexOpen;
  }, [codexOpen]);

  const toggleFullscreen = useCallback(async () => {
    const container = containerRef.current;
    if (!container) return;
    setFullscreenMessage("");
    try {
      if (document.fullscreenElement === container) {
        await document.exitFullscreen();
      } else if (document.fullscreenElement) {
        setFullscreenMessage("其他内容正在全屏，请先退出后再试。");
      } else if (!document.fullscreenEnabled || !container.requestFullscreen) {
        setFullscreenSupported(false);
        setFullscreenMessage("当前浏览器不支持全屏。");
      } else {
        await container.requestFullscreen();
      }
    } catch {
      setFullscreenMessage("无法进入全屏，请检查浏览器权限后重试。");
    }
  }, []);

  useEffect(() => {
    const storedAudioPreferences = loadAudioPreferences();
    setAudioPreferences(storedAudioPreferences);
    audioRef.current?.setPreferences(storedAudioPreferences);
    const loop = (timestamp: number) => {
      const engine = engineRef.current;
      if (engine) {
        const previous = lastFrameRef.current ?? timestamp;
        if (!codexOpenRef.current) engine.update((timestamp - previous) / 1000);
        lastFrameRef.current = timestamp;
        const phase = engine.state.phase;
        if (phase !== lastPhaseRef.current) {
          if (phase === "battle") audioRef.current?.play("battle");
          if (phase === "augment") audioRef.current?.play("augment");
          if (phase === "result")
            audioRef.current?.play(engine.state.result?.won ? "win" : "loss");
          lastPhaseRef.current = phase;
        }
        if (
          engine.state.toast?.text &&
          engine.state.toast.text !== lastToastRef.current
        ) {
          if (engine.state.toast.text.includes("聚合完成"))
            audioRef.current?.play("merge");
          lastToastRef.current = engine.state.toast.text;
        }
        draw();
      }
      frameRef.current = window.requestAnimationFrame(loop);
    };
    frameRef.current = window.requestAnimationFrame(loop);

    window.render_game_to_text = () =>
      engineRef.current?.renderTextState() || "{}";
    window.advanceTime = (milliseconds: number) => {
      const engine = engineRef.current;
      if (!engine) return;
      const steps =
        Math.max(1, Math.ceil(milliseconds / (1000 / 60))) *
        testTimeScaleRef.current;
      for (let index = 0; index < steps; index += 1) engine.update(1 / 60);
      draw();
    };

    const handleFullscreen = () => {
      setFullscreen(document.fullscreenElement === containerRef.current);
      window.requestAnimationFrame(draw);
    };
    const handleFullscreenError = () =>
      setFullscreenMessage("全屏请求被浏览器拒绝。");
    setFullscreenSupported(
      Boolean(document.fullscreenEnabled && containerRef.current?.requestFullscreen),
    );
    document.addEventListener("fullscreenchange", handleFullscreen);
    document.addEventListener("fullscreenerror", handleFullscreenError);
    const canvas = canvasRef.current;
    if (canvas && typeof ResizeObserver !== "undefined") {
      resizeObserverRef.current = new ResizeObserver(() => draw());
      resizeObserverRef.current.observe(canvas);
    }
    const handleResize = () => draw();
    window.addEventListener("resize", handleResize);
    return () => {
      if (frameRef.current !== null)
        window.cancelAnimationFrame(frameRef.current);
      resizeObserverRef.current?.disconnect();
      document.removeEventListener("fullscreenchange", handleFullscreen);
      document.removeEventListener("fullscreenerror", handleFullscreenError);
      window.removeEventListener("resize", handleResize);
      delete window.render_game_to_text;
      delete window.advanceTime;
      audioRef.current?.destroy();
      audioRef.current = null;
    };
  }, [draw]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const engine = engineRef.current;
      if (!engine) return;
      if (event.key === "Escape" && codexOpen) {
        event.preventDefault();
        setCodexOpen(false);
        return;
      }
      if (codexOpen) return;
      const active = document.activeElement;
      if (
        active instanceof HTMLInputElement ||
        active instanceof HTMLButtonElement ||
        active instanceof HTMLSelectElement
      )
        return;
      if (event.key.toLowerCase() === "d" && engine.state.phase === "battle") {
        event.preventDefault();
        engine.toggleRanking();
      } else if (event.key.toLowerCase() === "f") {
        event.preventDefault();
        toggleFullscreen();
      } else if (event.key.toLowerCase() === "r") {
        event.preventDefault();
        engine.rerollShop();
      } else if (event.code === "Space") {
        event.preventDefault();
        engine.startBattle();
      } else if (event.key === "Escape") {
        if (engine.state.battle?.rankingOpen) engine.closeRanking();
        else if (document.fullscreenElement === containerRef.current) toggleFullscreen();
        else engine.state.selected = null;
      }
      draw();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [codexOpen, draw, toggleFullscreen]);

  const canvasPoint = (
    event: React.MouseEvent<HTMLCanvasElement> | React.PointerEvent<HTMLCanvasElement>,
  ) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * HEIGHT,
    };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const engine = engineRef.current;
    if (!engine) return;
    const point = canvasPoint(event);
    const traitDrag = traitDragRef.current;
    if (traitDrag) {
      const deltaX = point.x - traitDrag.startX;
      if (Math.abs(deltaX) > TRAIT_DRAG_THRESHOLD) traitDrag.moved = true;
      const maxScrollX = getTraitMaxScrollX(engine);
      traitScrollXRef.current = Math.max(
        0,
        Math.min(maxScrollX, traitDrag.startScrollX - deltaX),
      );
      hoverRef.current = { target: null, ...point };
      event.currentTarget.style.cursor = "grabbing";
      return;
    }
    if (
      dragRef.current &&
      Math.hypot(
        point.x - dragRef.current.startX,
        point.y - dragRef.current.startY,
      ) > TRAIT_DRAG_THRESHOLD
    ) {
      dragRef.current.moved = true;
    }
    const target = getHitTarget(engine, point.x, point.y);
    hoverRef.current = { target, ...point };
    const overTraitStrip = inRect(point.x, point.y, TRAIT_STRIP);
    event.currentTarget.style.cursor = dragRef.current?.moved
      ? "grabbing"
      : target
        ? "pointer"
        : overTraitStrip && getTraitMaxScrollX(engine) > 0
          ? "grab"
          : "default";
  };

  const onPointerLeave = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) return;
    hoverRef.current = { target: null, x: 0, y: 0 };
    draw();
  };

  const onWheel = (event: React.WheelEvent<HTMLCanvasElement>) => {
    const engine = engineRef.current;
    if (!engine || engine.state.phase !== "preparation") return;
    const point = canvasPoint(event);
    if (!inRect(point.x, point.y, TRAIT_STRIP)) return;
    const maxScrollX = getTraitMaxScrollX(engine);
    if (maxScrollX <= 0) return;
    event.preventDefault();
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY)
      ? event.deltaX
      : event.deltaY;
    traitScrollXRef.current = Math.max(
      0,
      Math.min(maxScrollX, traitScrollXRef.current + delta),
    );
    hoverRef.current = { target: getHitTarget(engine, point.x, point.y), ...point };
  };

  const onClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    const engine = engineRef.current;
    if (!engine) return;
    const point = canvasPoint(event);
    const target = getHitTarget(engine, point.x, point.y);
    if (!target) return;
    audioRef.current?.unlock();
    if (target.kind === "starter") {
      traitScrollXRef.current = 0;
      traitDragRef.current = null;
      engine.startRun(target.id);
      playSound("click");
    } else if (target.kind === "shop") {
      const before = engine.state.gold;
      engine.buyShopUnit(target.index);
      if (engine.state.gold < before) playSound("buy");
    } else if (target.kind === "board") engine.selectSlot("board", target.index);
    else if (target.kind === "bench") engine.selectSlot("bench", target.index);
    else if (target.kind === "buyXp") {
      const before = engine.state.playerLevel;
      engine.buyExperience();
      if (engine.state.playerLevel > before) playSound("upgrade");
    } else if (target.kind === "lock") {
      engine.toggleShopLock();
      playSound("lock");
    } else if (target.kind === "reroll") {
      const before = engine.state.gold;
      engine.rerollShop();
      if (engine.state.gold < before) playSound("reroll");
    } else if (target.kind === "battle") engine.startBattle();
    else if (target.kind === "rankingToggle") engine.toggleRanking();
    else if (target.kind === "rankingMetric" || target.kind === "resultMetric") engine.setRankingMetric(target.metric);
    else if (target.kind === "resultContinue") engine.continueAfterResult();
    else if (target.kind === "sell") engine.sellSelected();
    else if (target.kind === "augment") {
      engine.chooseAugment(target.index);
      playSound("augment");
    } else if (target.kind === "restart") {
      traitScrollXRef.current = 0;
      traitDragRef.current = null;
      engine.resetToTitle();
    }
    hoverRef.current = { target: getHitTarget(engine, point.x, point.y), ...point };
    draw();
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    audioRef.current?.unlock();
    if (event.button !== 0) return;
    const engine = engineRef.current;
    if (!engine || engine.state.phase !== "preparation") return;
    const point = canvasPoint(event);
    if (inRect(point.x, point.y, TRAIT_STRIP) && getTraitMaxScrollX(engine) > 0) {
      event.currentTarget.setPointerCapture(event.pointerId);
      traitDragRef.current = {
        startX: point.x,
        startScrollX: traitScrollXRef.current,
        moved: false,
      };
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    const target = getHitTarget(engine, point.x, point.y);
    if (
      (target?.kind === "board" || target?.kind === "bench") &&
      target.unitId
    ) {
      dragRef.current = {
        origin: { zone: target.kind, index: target.index },
        startX: point.x,
        startY: point.y,
        moved: false,
      };
    }
  };

  const onPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    const engine = engineRef.current;
    const point = canvasPoint(event);
    const traitDrag = traitDragRef.current;
    traitDragRef.current = null;
    if (traitDrag) {
      if (traitDrag.moved) suppressClickRef.current = true;
      const target = engine ? getHitTarget(engine, point.x, point.y) : null;
      hoverRef.current = { target, ...point };
      event.currentTarget.style.cursor = target
        ? "pointer"
        : engine && getTraitMaxScrollX(engine) > 0
          ? "grab"
          : "default";
      draw();
      return;
    }
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag?.moved || !engine || engine.state.phase !== "preparation") return;
    const target = getHitTarget(engine, point.x, point.y);
    if (target?.kind === "board" || target?.kind === "bench") {
      engine.state.selected = drag.origin;
      engine.selectSlot(target.kind, target.index);
    }
    suppressClickRef.current = true;
    event.currentTarget.style.cursor = target ? "pointer" : "default";
    draw();
  };

  const onContextMenu = (event: React.MouseEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const engine = engineRef.current;
    if (!engine || engine.state.phase !== "preparation") return;
    const point = canvasPoint(event);
    const target = getHitTarget(engine, point.x, point.y);
    if (target?.kind === "board" || target?.kind === "bench") {
      if (target.unitId) {
        engine.state.selected = { zone: target.kind, index: target.index };
        engine.sellSelected();
        draw();
      }
    }
  };

  return (
    <div
      ref={containerRef}
      style={{
        width: fullscreen
          ? "100vw"
          : `min(1120px, 100vw, calc((100dvh - ${TOOLBAR_HEIGHT}px) * ${WIDTH / HEIGHT}))`,
        height: fullscreen ? "100dvh" : "auto",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#050b12",
        margin: "0 auto",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <style>{`
        @media (max-width: 600px) {
          .rift-toolbar-status, .rift-audio-range, .rift-shortcut { display: none !important; }
          .rift-toolbar { justify-content: center !important; overflow: hidden !important; }
          .rift-toolbar button { min-width: 0 !important; padding-inline: 10px !important; }
        }
      `}</style>
      <div
        className="rift-toolbar"
        style={{
          width: "100%",
          minHeight: TOOLBAR_HEIGHT,
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: 8,
          padding: "4px 10px",
          boxSizing: "border-box",
          color: "#7892a5",
          overflowX: "auto",
          scrollbarWidth: "thin",
          background: "#08131e",
          borderBottom: "1px solid rgba(117, 205, 255, 0.16)",
          font: `600 12px ${FONT}`,
        }}
      >
        <span
          className="rift-toolbar-status"
          aria-live="polite"
          style={{
            flex: 1,
            minWidth: 140,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            color: fullscreenMessage ? "#ff9cac" : "#607d91",
          }}
        >
          {fullscreenMessage || engineRef.current?.state.toast?.text || "图鉴可查看棋子、羁绊与本局天赋"}
        </span>
        <button
          type="button"
          onClick={() => setCodexOpen(true)}
          style={{
            height: 28,
            padding: "0 12px",
            border: "1px solid #586d9b",
            borderRadius: 8,
            color: "#e3e9ff",
            background: "#273254",
            cursor: "pointer",
            font: `700 12px ${FONT}`,
          }}
        >
          图鉴 / 本局天赋
        </button>
        <button
          type="button"
          aria-pressed={audioPreferences.muted}
          onClick={() => updateAudioPreferences({
            muted: !audioPreferences.muted,
          })}
          style={{
            height: 28,
            minWidth: 64,
            border: "1px solid #3d6077",
            borderRadius: 8,
            color: "#d7e9f4",
            background: "#162b3a",
            cursor: "pointer",
            font: `700 12px ${FONT}`,
          }}
        >
          {audioPreferences.muted ? "静音" : "声音"}
        </button>
        <span className="rift-audio-range" style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span>乐</span>
          <input
            aria-label="音乐音量"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={audioPreferences.musicVolume}
            onChange={(event) => updateAudioPreferences({
              musicVolume: Number(event.target.value),
            })}
            style={{ width: 58 }}
          />
        </span>
        <span className="rift-audio-range" style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span>效</span>
          <input
            aria-label="音效音量"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={audioPreferences.effectsVolume}
            onChange={(event) => updateAudioPreferences({
              effectsVolume: Number(event.target.value),
            })}
            style={{ width: 58 }}
          />
        </span>
        <span className="rift-shortcut">快捷键 F</span>
        <button
          type="button"
          aria-pressed={fullscreen}
          disabled={!fullscreenSupported}
          onClick={() => toggleFullscreen()}
          style={{
            minWidth: 94,
            height: 28,
            padding: "0 14px",
            border: "1px solid rgba(123, 220, 255, 0.5)",
            borderRadius: 8,
            color: fullscreenSupported ? "#dff7ff" : "#526775",
            background: fullscreenSupported
              ? "rgba(34, 105, 142, 0.72)"
              : "rgba(35, 50, 60, 0.72)",
            cursor: fullscreenSupported ? "pointer" : "not-allowed",
            font: `700 12px ${FONT}`,
          }}
        >
          {fullscreen ? "退出全屏" : "全屏游玩"}
        </button>
      </div>
      <Codex
        open={codexOpen}
        augmentHistory={engineRef.current?.state.augmentHistory || []}
        starterHistory={engineRef.current?.state.starterHistory || []}
        onClose={() => setCodexOpen(false)}
      />
      <canvas
        ref={canvasRef}
        width={WIDTH}
        height={HEIGHT}
        tabIndex={0}
        aria-label="裂隙阵线自走棋游戏画布"
        data-game-canvas="rift-line"
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onClick={onClick}
        onContextMenu={onContextMenu}
        style={{
          display: "block",
          width: fullscreen
            ? `min(100vw, calc((100dvh - ${TOOLBAR_HEIGHT}px) * ${WIDTH / HEIGHT}))`
            : "100%",
          height: "auto",
          touchAction: "none",
          maxHeight: fullscreen
            ? `calc(100dvh - ${TOOLBAR_HEIGHT}px)`
            : "none",
          aspectRatio: `${WIDTH} / ${HEIGHT}`,
          outline: "2px solid transparent",
          outlineOffset: -2,
        }}
      />
    </div>
  );
}
