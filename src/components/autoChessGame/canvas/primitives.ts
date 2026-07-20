import type { Rect } from "./types";

export const FONT = '"Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif';

export const roundedPath = (
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

export const fillRounded = (
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  radius: number,
  fill: string | CanvasGradient | CanvasPattern,
) => {
  roundedPath(ctx, rect, radius);
  ctx.fillStyle = fill;
  ctx.fill();
};

export const strokeRounded = (
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

export const setTextFont = (ctx: CanvasRenderingContext2D, size: number, weight = 500) => {
  ctx.font = `${weight} ${size}px ${FONT}`;
};

export const text = (
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

export const truncateText = (
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

export const wrapText = (
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

export const boundedTextLines = (
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

export const drawBoundedText = (
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
