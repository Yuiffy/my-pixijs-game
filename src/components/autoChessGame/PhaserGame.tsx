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
  | { kind: "starter"; index: number }
  | { kind: "shop"; index: number; unitId: UnitId | null }
  | { kind: "board"; index: number; unitId: UnitId | null; star?: number }
  | { kind: "bench"; index: number; unitId: UnitId | null; star?: number }
  | { kind: "reroll" | "buyXp" | "lock" | "battle" | "sell" | "restart" }
  | { kind: "enemyPreview"; unitId: UnitId; star: number }
  | { kind: "augment"; index: number }
  | { kind: "fighter"; unitId: UnitId; star: number }
  | { kind: "trait"; traitId: TraitId }
  | { kind: "rankingToggle" | "rankingPanel" }
  | { kind: "rankingMetric"; metric: "damage" | "support" | "taken" }
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
  h: 64,
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
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillText(value, x, y);
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
  ctx.beginPath();
  ctx.arc(x, y, radius - 2, 0, Math.PI * 2);
  ctx.clip();
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
) => {
  const def = UNIT_DEFS[unitId];
  ctx.save();
  ctx.globalAlpha = alpha;
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
  const portrait = def.portrait ? requestUnitImage(def.portrait) : null;
  if (portrait?.complete && portrait.naturalWidth > 0)
    drawImagePortrait(ctx, portrait, x, y, radius, def.portraitFocus);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = team === "player" ? def.accent : "#ff688e";
  ctx.lineWidth = Math.max(2, radius * 0.08);
  ctx.stroke();
  text(
    ctx,
    def.portrait && portrait?.complete ? "" : def.glyph,
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
  text(ctx, "选择一项开局协议", WIDTH / 2, 292, 12, "#7994a8", "center", 700);

  STARTERS.forEach((starter, index) => {
    const rect = starterRect(index);
    const hovered =
      hover.target?.kind === "starter" && hover.target.index === index;
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

    const lines = starter.description.split("；");
    lines.forEach((line, lineIndex) => {
      text(
        ctx,
        `${line}${lineIndex === 0 ? "；" : ""}`,
        lifted.x + lifted.w / 2,
        lifted.y + 181 + lineIndex * 23,
        12,
        "#9cb1c0",
        "center",
        500,
      );
    });
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
  text(ctx, wave.name, 48, 149, 21, "#f1f7ff", "left", 800);
  text(ctx, wave.description, 48, 174, 11, "#8ba4b6", "left", 500);
  const augmentHistory = state.augmentHistory
    .map(({ round, id }) => {
      const augment = AUGMENTS.find((item) => item.id === id);
      return augment ? `${round}战·${augment.name}` : null;
    })
    .filter(Boolean)
    .join("  ·  ");
  text(
    ctx,
    augmentHistory ? `已选天赋：${augmentHistory}` : "第 2 战后可选择首个天赋",
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
      rect.y + 32,
      20,
      "player",
      affordable ? 1 : 0.55,
    );
    text(
      ctx,
      def.name,
      rect.x + 64,
      rect.y + 17,
      13,
      affordable ? "#ecf7ff" : "#617888",
      "left",
      800,
    );
    text(ctx, def.title, rect.x + 64, rect.y + 37, 9, "#7490a4", "left", 500);
    drawTraitDots(ctx, unitId, rect.x + 68, rect.y + 54);
    text(
      ctx,
      `${def.cost}`,
      rect.x + rect.w - 23,
      rect.y + 25,
      19,
      affordable ? "#ffd166" : "#5e5260",
      "center",
      900,
    );
    text(
      ctx,
      `${def.tier}费`,
      rect.x + rect.w - 23,
      rect.y + 48,
      9,
      "#667f91",
      "center",
      800,
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
  text(
    ctx,
    activeNames ? `已激活：${activeNames}` : "常规羁绊按 2/4/6；关系羁绊按图标说明",
    807,
    647,
    10,
    activeNames ? "#7de2ff" : "#526d80",
    "left",
    700,
  );
  text(
    ctx,
    `连胜 ${state.streak} · 10 金币提供 1 利息（最多 2）`,
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
    text(
      ctx,
      `天赋记录（${state.augmentHistory.length}）：第 ${latest.round} 战 · ${augment?.name || ""}`,
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
  fillRounded(
    ctx,
    {
      x: drawX - barWidth / 2,
      y: drawY + radius + 19,
      w: barWidth * (fighter.energy / 100),
      h: 4,
    },
    2,
    "#b585ff",
  );

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

const drawEffects = (ctx: CanvasRenderingContext2D, state: GameState) => {
  const battle = state.battle;
  if (!battle) return;
  battle.effects.forEach((effect) => {
    const progress = 1 - effect.life / effect.maxLife;
    const alpha = Math.max(0, effect.life / effect.maxLife);
    ctx.save();
    ctx.globalAlpha = alpha;
    if (effect.kind === "line") {
      ctx.beginPath();
      ctx.moveTo(effect.x, effect.y);
      ctx.lineTo(effect.x2 || effect.x, effect.y2 || effect.y);
      ctx.strokeStyle = effect.color;
      ctx.lineWidth = effect.size || 3;
      ctx.shadowColor = effect.color;
      ctx.shadowBlur = 12;
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
    text(ctx, `${definition.name}${"★".repeat(fighter.star)}`, 859, y, 10, definition.accent, "left", 700);
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
  drawEffects(ctx, state);

  if (battle.bannerTimer > 0) {
    const alpha = Math.min(1, battle.bannerTimer * 1.4);
    ctx.save();
    ctx.globalAlpha = alpha;
    fillRounded(
      ctx,
      { x: 385, y: 154, w: 350, h: 48 },
      24,
      "rgba(5, 12, 20, 0.82)",
    );
    strokeRounded(ctx, { x: 385, y: 154, w: 350, h: 48 }, 24, "#6b85a8");
    text(ctx, battle.banner, 560, 178, 15, "#f0f7ff", "center", 800);
    ctx.restore();
  }

  const active = engine.getActiveTraits();
  if (active.length) {
    text(
      ctx,
      `羁绊：${active.map((trait) => `${trait.name}${["", "Ⅰ", "Ⅱ", "Ⅲ"][trait.level]}`).join(" · ")}`,
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
    text(ctx, `契印：${augmentNames}`, 1072, 665, 10, "#cba0ff", "right", 700);
  }

  drawBattleRanking(ctx, engine, hover);
  if (hover.target?.kind === "fighter")
    drawTooltip(ctx, hover.target.unitId, hover.target.star, hover.x, hover.y);
};

const drawResult = (ctx: CanvasRenderingContext2D, state: GameState) => {
  if (!state.result) return;
  ctx.fillStyle = "rgba(3, 8, 14, 0.64)";
  ctx.fillRect(0, 78, WIDTH, HEIGHT - 78);
  const rect: Rect = { x: 370, y: 235, w: 380, h: 250 };
  fillRounded(ctx, rect, 22, "rgba(9, 21, 32, 0.98)");
  strokeRounded(ctx, rect, 22, state.result.won ? "#5ee0a3" : "#ff6a85", 2);
  text(
    ctx,
    state.result.won ? "胜 利" : "失 利",
    560,
    274,
    11,
    state.result.won ? "#62e3a6" : "#ff718a",
    "center",
    900,
  );
  text(ctx, state.result.headline, 560, 318, 30, "#f2f8ff", "center", 900);
  text(ctx, state.result.detail, 560, 359, 11, "#91a9b9", "center", 500);
  const experienceText = state.result.upgradeDiscount
    ? ` · 升本费用 -${state.result.upgradeDiscount}`
    : "";
  if (state.result.won) {
    text(
      ctx,
      `+ ${state.result.income} 金币${experienceText}`,
      560,
      407,
      20,
      "#ffd166",
      "center",
      800,
    );
  } else {
    text(
      ctx,
      `核心 -${state.result.damage} · +${state.result.income} 金币${experienceText}`,
      560,
      407,
      17,
      "#ff9ba9",
      "center",
      800,
    );
  }
  text(ctx, "正在进入下一阶段…", 560, 455, 10, "#526f83", "center", 500);
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
    text(
      ctx,
      augment.description,
      lifted.x + lifted.w / 2,
      lifted.y + 202,
      13,
      "#9db2c1",
      "center",
      500,
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
  text(
    ctx,
    selectionHistory ? `历次选择：${selectionHistory}` : "已持有：无",
    WIDTH / 2,
    625,
    10,
    "#b8a6d8",
    "center",
    600,
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
  text(
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
  text(
    ctx,
    history ? `本局天赋记录：${history}` : "本局未获得天赋",
    WIDTH / 2,
    510,
    10,
    "#c8b3e2",
    "center",
    600,
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

const wrapText = (
  ctx: CanvasRenderingContext2D,
  value: string,
  maxWidth: number,
) => {
  const lines: string[] = [];
  let current = "";
  value.split("").forEach((character) => {
    const next = current + character;
    if (ctx.measureText(next).width > maxWidth && current) {
      lines.push(current);
      current = character;
    } else current = next;
  });
  if (current) lines.push(current);
  return lines;
};

const drawTooltip = (
  ctx: CanvasRenderingContext2D,
  unitId: UnitId,
  star: number,
  pointerX: number,
  pointerY: number,
) => {
  const def = UNIT_DEFS[unitId];
  const w = 310;
  const h = 212;
  const x = Math.max(12, Math.min(WIDTH - w - 12, pointerX + 18));
  const y = Math.max(88, Math.min(HEIGHT - h - 12, pointerY + 18));
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = 24;
  fillRounded(ctx, { x, y, w, h }, 15, "rgba(5, 14, 23, 0.98)");
  ctx.restore();
  strokeRounded(ctx, { x, y, w, h }, 15, def.accent, 1.5);
  drawUnitPortrait(ctx, unitId, x + 42, y + 43, 25);
  text(ctx, def.name, x + 78, y + 28, 16, "#f0f7ff", "left", 800);
  text(
    ctx,
    `${"★".repeat(star)} · ${def.cost} 费 · ${def.title}`,
    x + 78,
    y + 52,
    10,
    def.accent,
    "left",
    800,
  );
  text(
    ctx,
    `生命 ${Math.round(def.hp * (star === 1 ? 1 : star === 2 ? 1.68 : 2.82))}`,
    x + 20,
    y + 83,
    10,
    "#8da7b9",
    "left",
    600,
  );
  text(
    ctx,
    `攻击 ${Math.round(def.attack * (star === 1 ? 1 : star === 2 ? 1.68 : 2.82))}`,
    x + 115,
    y + 83,
    10,
    "#8da7b9",
    "left",
    600,
  );
  text(ctx, `护甲 ${def.armor}`, x + 205, y + 83, 10, "#8da7b9", "left", 600);
  text(
    ctx,
    `射程 ${def.range} · 攻击间隔 ${def.attackInterval.toFixed(2)}s · 移速 ${def.moveSpeed}`,
    x + 20,
    y + 101,
    9,
    "#68869a",
    "left",
    600,
  );
  text(ctx, def.abilityName, x + 20, y + 124, 12, def.accent, "left", 800);
  ctx.font = `500 10px ${FONT}`;
  wrapText(ctx, def.abilityDescription, w - 40)
    .slice(0, 2)
    .forEach((line, index) => {
      text(ctx, line, x + 20, y + 145 + index * 17, 10, "#a6bac7", "left", 500);
    });
  const traitNames = def.traits.map((trait) => TRAITS[trait].name).join(" · ");
  text(ctx, traitNames, x + w - 20, y + h - 34, 10, "#718da0", "right", 700);
  text(ctx, def.title, x + 20, y + h - 16, 10, "#d4e6f2", "left", 700);
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
  const h = 174;
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
    `${trait.family} · 当前 ${count}/${maxThreshold} · ${level ? `${level} 阶已激活` : status.active ? "尚未激活" : "缺少岁己或栞栞搭档"}`,
    x + 56,
    y + 46,
    10,
    trait.color,
    "left",
    700,
  );
  text(ctx, trait.description, x + 20, y + 72, 10, "#9bb2c2", "left", 500);
  trait.thresholds.forEach((threshold, index) => {
    const reached = count >= threshold;
    text(
      ctx,
      reached ? "◆" : "◇",
      x + 22,
      y + 98 + index * 22,
      11,
      reached ? trait.color : "#455d70",
      "left",
      800,
    );
    text(
      ctx,
      `${threshold} 名：${trait.bonuses[index]}`,
      x + 42,
      y + 98 + index * 22,
      10,
      reached ? "#e7f5ff" : "#71899a",
      "left",
      reached ? 700 : 500,
    );
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
  if (target.kind === "fighter")
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
    if (state.phase === "result") drawResult(ctx, state);
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
    ctx.font = `700 12px ${FONT}`;
    const width = Math.min(
      650,
      Math.max(220, ctx.measureText(state.toast.text).width + 50),
    );
    fillRounded(
      ctx,
      { x: WIDTH / 2 - width / 2, y: 91, w: width, h: 38 },
      19,
      "rgba(5, 13, 21, 0.94)",
    );
    strokeRounded(
      ctx,
      { x: WIDTH / 2 - width / 2, y: 91, w: width, h: 38 },
      19,
      color,
      1,
    );
    text(ctx, state.toast.text, WIDTH / 2, 110, 12, color, "center", 700);
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
    const index = STARTERS.findIndex((_, itemIndex) =>
      inRect(x, y, starterRect(itemIndex)),
    );
    return index >= 0 ? { kind: "starter", index } : null;
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
      return { kind: "fighter", unitId: fighter.unitId, star: fighter.star };
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
      draw();
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
    draw();
  };

  const onPointerLeave = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) return;
    hoverRef.current = { target: null, x: 0, y: 0 };
    draw();
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
      engine.startRun(STARTERS[target.index].id);
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
    else if (target.kind === "rankingMetric") engine.setRankingMetric(target.metric);
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
          {fullscreenMessage || engineRef.current?.state.toast?.text || "图鉴可查看全部棋子、羁绊与商店概率"}
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
          图鉴 / 帮助
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
      <Codex open={codexOpen} onClose={() => setCodexOpen(false)} />
      <canvas
        ref={canvasRef}
        width={WIDTH}
        height={HEIGHT}
        tabIndex={0}
        aria-label="裂隙阵线自走棋游戏画布"
        data-game-canvas="rift-line"
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
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
          maxHeight: fullscreen
            ? `calc(100dvh - ${TOOLBAR_HEIGHT}px)`
            : "none",
          aspectRatio: `${WIDTH} / ${HEIGHT}`,
          outline: "2px solid transparent",
          outlineOffset: -2,
          touchAction: "manipulation",
        }}
      />
    </div>
  );
}
