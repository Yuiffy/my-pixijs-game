/* eslint-disable prefer-destructuring, implicit-arrow-linebreak, nonblock-statement-body-position, function-paren-newline */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AutoChessEngine,
  Fighter,
  GameState,
  OwnedUnit,
} from "./core/gameEngine";
import {
  AUGMENTS,
  SHOP_UNITS,
  STARTERS,
  TRAITS,
  TraitId,
  UNIT_DEFS,
  UnitId,
  tierOddsForRound,
  traitLevelForCount,
} from "./core/gameData";

declare global {
  interface Window {
    render_game_to_text?: () => string;
    advanceTime?: (milliseconds: number) => void;
  }
}

const WIDTH = 1120;
const HEIGHT = 720;
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
  | { kind: "reroll" | "battle" | "sell" | "restart" }
  | { kind: "augment"; index: number }
  | { kind: "fighter"; unitId: UnitId; star: number }
  | { kind: "trait"; traitId: TraitId }
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
const rerollRect: Rect = { x: 810, y: 530, w: 126, h: 48 };
const battleRect: Rect = { x: 946, y: 530, w: 134, h: 48 };
const sellRect: Rect = { x: 636, y: 553, w: 112, h: 34 };
const restartRect: Rect = { x: 420, y: 548, w: 280, h: 62 };

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
  text(ctx, "RIFT LINE · 8 战短局", 30, 53, 10, "#6f92ab", "left", 700);

  if (state.phase !== "title") {
    const nodeStart = 300;
    for (let index = 0; index < state.maxRounds; index += 1) {
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
      if (index < state.maxRounds - 1) {
        ctx.fillStyle = complete ? "#3f9c78" : "#203647";
        ctx.fillRect(x + 11, 31, 25, 3);
      }
    }
    text(
      ctx,
      state.round === 8 ? "首领战" : `第 ${state.round} 战`,
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
  UNIT_DEFS[unitId].traits.forEach((trait, index) => {
    ctx.beginPath();
    ctx.arc(x + index * 12, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = TRAITS[trait].color;
    ctx.fill();
  });
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
  ctx.shadowBlur = 0;
  ctx.strokeStyle = team === "player" ? def.accent : "#ff688e";
  ctx.lineWidth = Math.max(2, radius * 0.08);
  ctx.stroke();
  text(
    ctx,
    def.glyph,
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

const traitPillRects = (engine: AutoChessEngine, y: number) => {
  const counts = engine.getTraitCounts();
  let x = 48;
  const visibleTraits = (Object.keys(TRAITS) as TraitId[]).filter(
    (id) => counts[id] > 0,
  );
  const gap = 6;
  const width = Math.min(
    72,
    (700 - gap * Math.max(0, visibleTraits.length - 1)) /
      Math.max(1, visibleTraits.length),
  );
  return visibleTraits.map((id) => {
    const entry = { id, rect: { x, y, w: width, h: 25 } };
    x += width + gap;
    return entry;
  });
};

const drawTraitPills = (
  ctx: CanvasRenderingContext2D,
  engine: AutoChessEngine,
  y: number,
) => {
  const counts = engine.getTraitCounts();
  traitPillRects(engine, y).forEach(({ id, rect }) => {
    const trait = TRAITS[id];
    const level = traitLevelForCount(trait, counts[id]);
    const active = level > 0;
    const nextThreshold =
      trait.thresholds[Math.min(level, trait.thresholds.length - 1)];
    fillRounded(
      ctx,
      rect,
      12,
      active ? `${trait.color}24` : "rgba(20, 37, 50, 0.85)",
    );
    strokeRounded(ctx, rect, 12, active ? trait.color : "#2e4658", 1);
    ctx.beginPath();
    ctx.arc(rect.x + 13, y + 12.5, 4, 0, Math.PI * 2);
    ctx.fillStyle = trait.color;
    ctx.fill();
    text(
      ctx,
      `${trait.name} ${counts[id]}/${nextThreshold}`,
      rect.x + 23,
      y + 13,
      rect.w < 66 ? 9 : 10,
      active ? "#ecf8ff" : "#6f8799",
      "left",
      700,
    );
  });
};

const drawTitle = (
  ctx: CanvasRenderingContext2D,
  engine: AutoChessEngine,
  hover: HoverState,
) => {
  const state = engine.state;
  text(
    ctx,
    "守住八次冲击。每一次购买，都该改变你的答案。",
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
    `${SHOP_UNITS.length} 兵种 · 10 羁绊 · 五档费用 · 一局约 8 分钟`,
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
    "操作：点击购买与移动 · 右键快速回收 · R 刷新 · Space 开战 · F 全屏",
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

  text(ctx, "敌情预览", 742, 120, 10, "#70899b", "right", 700);
  wave.units.slice(0, 7).forEach((enemy, index) => {
    const x = 735 - index * 38;
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

  drawTraitPills(ctx, engine, 194);
  text(ctx, "后方 · 远程与辅助", 48, 221, 9, "#5f798c", "left", 700);
  text(ctx, "6 × 4 自由部署区", 390, 221, 9, "#67869b", "center", 700);
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
  text(ctx, "战术商店", 812, 119, 17, "#edf7ff", "left", 800);
  text(ctx, `五张选一 · 刷新 1`, 1078, 120, 10, "#678195", "right", 500);
  const odds = tierOddsForRound(state.round);
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

  const hoveredReroll = hover.target?.kind === "reroll";
  fillRounded(ctx, rerollRect, 12, hoveredReroll ? "#d7a93d" : "#293e4d");
  text(
    ctx,
    "R  刷新 · 1",
    rerollRect.x + rerollRect.w / 2,
    rerollRect.y + 24,
    11,
    hoveredReroll ? "#101820" : "#d6e6f0",
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
    "开始战斗",
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
    `上阵 ${engine.boardCount}/${engine.boardCap}`,
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
    activeNames ? `已激活：${activeNames}` : "羁绊均在 2/4/6 名时升级",
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

const fighterRadius = (fighter: Fighter) => {
  if (fighter.unitId === "rift_tyrant") return 43;
  const largeUnit = [
    "brass_colossus",
    "rift_warden",
    "siege_walker",
    "solar_champion",
    "chrono_titan",
  ].includes(fighter.unitId);
  return (largeUnit ? 31 : 26) + (fighter.star - 1) * 3;
};

const drawFighter = (
  ctx: CanvasRenderingContext2D,
  fighter: Fighter,
  visualTime: number,
) => {
  if (!fighter.alive) return;
  const def = UNIT_DEFS[fighter.unitId];
  const radius = fighterRadius(fighter);
  ctx.save();
  ctx.globalAlpha = fighter.stun > 0 ? 0.72 : 1;
  ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
  ctx.beginPath();
  ctx.ellipse(
    fighter.x,
    fighter.y + radius * 0.8,
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
      fighter.x,
      fighter.y,
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
    fighter.x,
    fighter.y,
    radius,
    fighter.team,
  );
  drawStars(ctx, fighter.star, fighter.x, fighter.y - radius - 13);

  const barWidth = radius * 2.25;
  fillRounded(
    ctx,
    {
      x: fighter.x - barWidth / 2,
      y: fighter.y + radius + 9,
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
      x: fighter.x - barWidth / 2,
      y: fighter.y + radius + 9,
      w: barWidth * hpRatio,
      h: 7,
    },
    4,
    hpColor,
  );
  fillRounded(
    ctx,
    {
      x: fighter.x - barWidth / 2,
      y: fighter.y + radius + 19,
      w: barWidth,
      h: 4,
    },
    2,
    "#14222d",
  );
  fillRounded(
    ctx,
    {
      x: fighter.x - barWidth / 2,
      y: fighter.y + radius + 19,
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
      fighter.x,
      fighter.y - radius - 27,
      15,
      "#ffd95e",
      "center",
      800,
    );
  if (fighter.burnTime > 0) {
    ctx.beginPath();
    ctx.arc(
      fighter.x + radius * 0.7,
      fighter.y - radius * 0.55,
      5 + Math.sin(visualTime * 10) * 2,
      0,
      Math.PI * 2,
    );
    ctx.fillStyle = "#ff7a50";
    ctx.fill();
  }
  if (fighter.enraged) {
    ctx.beginPath();
    ctx.arc(fighter.x, fighter.y, radius + 12, 0, Math.PI * 2);
    ctx.strokeStyle = "#ff4f9a";
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  text(
    ctx,
    def.name,
    fighter.x,
    fighter.y + radius + 35,
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
  if (state.result.won) {
    text(
      ctx,
      `+ ${state.result.income} 金币`,
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
      `核心 -${state.result.damage}   ·   整备 +${state.result.income} 金币`,
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
    "选择一项永久强化。它将决定接下来三战的构筑方向。",
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
  text(
    ctx,
    `已持有：${state.augments.length ? state.augments.map((id) => AUGMENTS.find((item) => item.id === id)?.name).join(" · ") : "无"}`,
    WIDTH / 2,
    625,
    11,
    "#6c8799",
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
    "每局商店与契印组合都会变化",
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
  const h = 180;
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
  text(ctx, def.abilityName, x + 20, y + 112, 12, def.accent, "left", 800);
  ctx.font = `500 10px ${FONT}`;
  wrapText(ctx, def.abilityDescription, w - 40)
    .slice(0, 2)
    .forEach((line, index) => {
      text(ctx, line, x + 20, y + 133 + index * 17, 10, "#a6bac7", "left", 500);
    });
  const traitNames = def.traits.map((trait) => TRAITS[trait].name).join(" · ");
  text(ctx, traitNames, x + w - 20, y + h - 16, 10, "#718da0", "right", 700);
};

const drawTraitTooltip = (
  ctx: CanvasRenderingContext2D,
  engine: AutoChessEngine,
  traitId: TraitId,
  pointerX: number,
  pointerY: number,
) => {
  const trait = TRAITS[traitId];
  const count = engine.getTraitCounts()[traitId];
  const level = traitLevelForCount(trait, count);
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
    `${trait.family} · 当前 ${count}/6 · ${level ? `${level} 阶已激活` : "尚未激活"}`,
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
  if (target.kind === "fighter")
    return { id: target.unitId, star: target.star };
  return null;
};

const renderGame = (
  ctx: CanvasRenderingContext2D,
  engine: AutoChessEngine,
  hover: HoverState,
) => {
  const state = engine.state;
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  drawBackdrop(ctx, state);
  drawHeader(ctx, engine);

  if (state.phase === "title") drawTitle(ctx, engine, hover);
  else if (state.phase === "preparation") drawPreparation(ctx, engine, hover);
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

const hitTest = (engine: AutoChessEngine, x: number, y: number): HitTarget => {
  const state = engine.state;
  if (state.phase === "title") {
    const index = STARTERS.findIndex((_, itemIndex) =>
      inRect(x, y, starterRect(itemIndex)),
    );
    return index >= 0 ? { kind: "starter", index } : null;
  }
  if (state.phase === "preparation") {
    const traitTarget = traitPillRects(engine, 194).find(({ rect }) =>
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
  const suppressClickRef = useRef(false);
  const frameRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number | null>(null);
  const testTimeScaleRef = useRef(1);
  const [fullscreen, setFullscreen] = useState(false);

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

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const engine = engineRef.current;
    if (!canvas || !engine) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    renderGame(ctx, engine, hoverRef.current);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    if (!containerRef.current) return;
    if (document.fullscreenElement) await document.exitFullscreen();
    else await containerRef.current.requestFullscreen();
  }, []);

  useEffect(() => {
    const loop = (timestamp: number) => {
      const engine = engineRef.current;
      if (engine) {
        const previous = lastFrameRef.current ?? timestamp;
        engine.update((timestamp - previous) / 1000);
        lastFrameRef.current = timestamp;
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

    const handleFullscreen = () =>
      setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", handleFullscreen);
    return () => {
      if (frameRef.current !== null)
        window.cancelAnimationFrame(frameRef.current);
      document.removeEventListener("fullscreenchange", handleFullscreen);
      delete window.render_game_to_text;
      delete window.advanceTime;
    };
  }, [draw]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const engine = engineRef.current;
      if (!engine) return;
      if (event.key.toLowerCase() === "f") {
        event.preventDefault();
        toggleFullscreen().catch(() => {});
      } else if (event.key.toLowerCase() === "r") {
        event.preventDefault();
        engine.rerollShop();
      } else if (event.code === "Space") {
        event.preventDefault();
        engine.startBattle();
      } else if (event.key === "Escape") {
        if (document.fullscreenElement)
          document.exitFullscreen().catch(() => {});
        else engine.state.selected = null;
      }
      draw();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [draw, toggleFullscreen]);

  const canvasPoint = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * HEIGHT,
    };
  };

  const onMouseMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const engine = engineRef.current;
    if (!engine) return;
    const point = canvasPoint(event);
    if (
      dragRef.current &&
      Math.hypot(
        point.x - dragRef.current.startX,
        point.y - dragRef.current.startY,
      ) > 8
    ) {
      dragRef.current.moved = true;
    }
    const target = hitTest(engine, point.x, point.y);
    hoverRef.current = { target, ...point };
    event.currentTarget.style.cursor = dragRef.current?.moved
      ? "grabbing"
      : target
        ? "pointer"
        : "default";
    draw();
  };

  const onMouseLeave = () => {
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
    const target = hitTest(engine, point.x, point.y);
    if (!target) return;
    if (target.kind === "starter") engine.startRun(STARTERS[target.index].id);
    else if (target.kind === "shop") engine.buyShopUnit(target.index);
    else if (target.kind === "board") engine.selectSlot("board", target.index);
    else if (target.kind === "bench") engine.selectSlot("bench", target.index);
    else if (target.kind === "reroll") engine.rerollShop();
    else if (target.kind === "battle") engine.startBattle();
    else if (target.kind === "sell") engine.sellSelected();
    else if (target.kind === "augment") engine.chooseAugment(target.index);
    else if (target.kind === "restart") engine.resetToTitle();
    hoverRef.current = { target: hitTest(engine, point.x, point.y), ...point };
    draw();
  };

  const onMouseDown = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return;
    const engine = engineRef.current;
    if (!engine || engine.state.phase !== "preparation") return;
    const point = canvasPoint(event);
    const target = hitTest(engine, point.x, point.y);
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

  const onMouseUp = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    const engine = engineRef.current;
    dragRef.current = null;
    if (!drag?.moved || !engine || engine.state.phase !== "preparation") return;
    const point = canvasPoint(event);
    const target = hitTest(engine, point.x, point.y);
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
    const target = hitTest(engine, point.x, point.y);
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
        width: fullscreen ? "100vw" : "min(1120px, 100%)",
        height: fullscreen ? "100vh" : "auto",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#050b12",
        margin: "0 auto",
        overflow: "hidden",
      }}
    >
      <canvas
        ref={canvasRef}
        width={WIDTH}
        height={HEIGHT}
        tabIndex={0}
        aria-label="裂隙阵线自走棋游戏画布"
        data-game-canvas="rift-line"
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onClick={onClick}
        onContextMenu={onContextMenu}
        style={{
          display: "block",
          width: fullscreen ? "min(100vw, calc(100vh * 1.55556))" : "100%",
          height: "auto",
          aspectRatio: `${WIDTH} / ${HEIGHT}`,
          outline: "none",
          touchAction: "manipulation",
        }}
      />
    </div>
  );
}
