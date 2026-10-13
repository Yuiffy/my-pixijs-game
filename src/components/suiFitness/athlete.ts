import type { FitnessState } from "./engine";

type Ctx = CanvasRenderingContext2D;
const INK = "#59465f";
const SKIN = "#ffdfca";

function oval(c: Ctx, x: number, y: number, rx: number, ry: number, fill: string, outline = false) {
  c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  c.fillStyle = fill; c.fill();
  if (outline) { c.strokeStyle = INK; c.lineWidth = 1.8; c.stroke(); }
}
function stroke(c: Ctx, points: number[], color: string, width: number) {
  c.beginPath(); c.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) c.lineTo(points[i], points[i + 1]);
  c.strokeStyle = color; c.lineWidth = width; c.lineCap = "round"; c.lineJoin = "round"; c.stroke();
}
function box(c: Ctx, x: number, y: number, w: number, h: number, fill: string) {
  c.beginPath(); c.roundRect(x, y, w, h, 4); c.fillStyle = fill; c.fill();
  c.strokeStyle = INK; c.lineWidth = 1.7; c.stroke();
}

/** One coordinate rig: skin, sleeve and equipment share the same hand anchor. */
function hand(c: Ctx, x: number, y: number, angle: number, kind: "dumbbell" | "water" | "empty", accent: string, rank: number) {
  stroke(c, [x < 0 ? -12 : 12, -8, x * 0.7, y - 2, x, y], INK, 11);
  stroke(c, [x < 0 ? -12 : 12, -8, x * 0.7, y - 2, x, y], accent, 8);
  c.save(); c.translate(x, y); c.rotate(angle);
  if (kind === "dumbbell") {
    box(c, -17, -3, 34, 6, "#c8bfd7");
    for (const side of [-1, 1]) {
      box(c, side * 14 - 4, -11, 8, 22, "#8d75aa");
      box(c, side * 19 - 3, -8, 6, 16, rank >= 3 ? "#e4b768" : "#ad9cc5");
      stroke(c, [side * 14, -7, side * 14, 3], "#eee6f6", 2);
    }
  } else if (kind === "water") {
    box(c, -12, -9, 28, 16, "#80c8d6");
    box(c, 13, -5, 10, 8, "#e7faf3");
    oval(c, -5, -8, 9, 7, "#d9f4ee", true);
    stroke(c, [-6, 6, -9, 13], INK, 6);
    if (rank >= 3) stroke(c, [1, -8, 1, 4], "#f2d58f", 3);
  }
  oval(c, 0, 2, 4.5, 4.5, SKIN, true);
  c.restore();
}

export function drawAthlete(c: Ctx, s: FitnessState, reduced: boolean, moving: boolean) {
  const t = s.elapsed;
  const stride = reduced || !moving ? 0 : Math.sin(t * 14);
  const training = !!s.exercise;
  const bounce = reduced ? 0 : training ? Math.sin(t * 7) * 2 : Math.abs(stride) * 2;
  const accent = s.talent === "swimmer" ? "#86c3d1" : s.talent === "rhythm" ? "#abbc88" : "#d99aad";
  oval(c, s.player.x, s.player.y + 21, 24, 7, "#65485229");
  c.save(); c.translate(s.player.x, s.player.y + bounce);
  if (s.invincible > 0) {
    oval(c, 0, 0, 29, 26, "#fff8d445");
    c.beginPath(); c.ellipse(0, 0, 29, 26, 0, 0, Math.PI * 2);
    c.strokeStyle = "#dba369"; c.lineWidth = 2; c.stroke();
  }
  // Silver twin tails sit behind the torso, with the same outline as the gear.
  for (const side of [-1, 1]) {
    c.save(); c.translate(side * 20, -30); c.rotate(side * 0.14 + stride * 0.045);
    oval(c, side * 2, 14, 9, 23, "#d2cadf", true);
    oval(c, 0, 9, 6, 20, "#f2edf4");
    stroke(c, [side * 3, 3, side * 5, 18, side, 29], "#b9aecb", 1.8);
    box(c, -6, -2, 12, 5, "#997eac"); c.restore();
    const foot = stride * side * 4;
    stroke(c, [side * 8, 5, side * 9, 17 + foot], INK, 10);
    box(c, side * 9 - 7, 17 + foot, 15, 8, "#fff6e7");
    stroke(c, [side * 9 - 4, 20 + foot, side * 9 + 3, 20 + foot], accent, 2);
  }
  box(c, -15, -18, 30, 30, "#87709d");
  c.beginPath(); c.moveTo(-13, -17); c.lineTo(0, -7); c.lineTo(13, -17);
  c.lineTo(11, 9); c.lineTo(-11, 9); c.closePath(); c.fillStyle = accent; c.fill();
  stroke(c, [0, -9, 0, 10], "#fff0df", 2);
  stroke(c, [-12, 9, 12, 9], INK, 3);
  oval(c, 7, -2, 2.5, 3, "#ffe4a4");
  if (s.weapons.aura > 0) {
    box(c, -24, -1, 9, 24, "#ba9ed0");
    oval(c, -19.5, 0, 4.5, 3, "#e8d5ee", true);
  }
  // Arms below the face. Idle equipment stays in the hands; attacks extend outward.
  const swing = s.attackFlash > 0 ? Math.sin((1 - s.attackFlash / 0.18) * Math.PI) : 0;
  const angle = s.attackFlash > 0 ? s.attackAngle : 0.35;
  if (s.weapons.dumbbell > 0) {
    const hx = s.attackFlash > 0 ? Math.cos(angle) * (29 + swing * 16) : 27;
    const hy = s.attackFlash > 0 ? Math.sin(angle) * (26 + swing * 10) : 5 - stride * 2;
    hand(c, hx, hy, angle + Math.PI / 2, "dumbbell", accent, s.weapons.dumbbell);
  } else if (!s.weapons.water) hand(c, 24, training ? -12 : 5 - stride * 3, -0.2, "empty", accent, 0);
  if (s.weapons.water) {
    const a = s.waterAngle;
    const recoil = reduced ? 0 : s.waterFlash * 22;
    hand(c, Math.cos(a) * (30 - recoil), -4 + Math.sin(a) * 30, a, "water", accent, s.weapons.water);
  } else hand(c, -24, training ? -15 : 5 + stride * 3, 0, "empty", accent, 0);
  if (s.weapons.rope) {
    stroke(c, [-24, 4, -29, 14, -18, 20, -10, 14], "#819666", 2);
    box(c, -27, 0, 6, 12, "#bbcd95");
  }
  // Complete head replaces the mismatched rectangular crop of a detailed portrait.
  oval(c, 0, -34, 22, 22, "#d4cadd", true);
  oval(c, 0, -30, 19, 18, SKIN, true);
  for (const side of [-1, 1]) {
    oval(c, side * 8, -29, 4.5, 6.2, "#75495a");
    oval(c, side * 8, -28, 3.2, 4.8, "#e5ac45");
    oval(c, side * 8, -29, 1.7, 3.7, "#62404b");
    oval(c, side * 8 - 1, -31, 1.6, 1.8, "#fffaf4");
    stroke(c, [side * 4, -34, side * 9, -35, side * 13, -33], INK, 2);
    oval(c, side * 14, -22, 3.5, 2, "#ed9da6");
  }
  stroke(c, [-3, -19, 0, -17, 3, -19], "#b46f7c", 1.5);
  c.beginPath(); c.moveTo(-21, -43); c.quadraticCurveTo(-5, -59, 20, -43);
  c.lineTo(19, -29); c.lineTo(10, -39); c.lineTo(6, -32); c.lineTo(1, -40);
  c.lineTo(-4, -30); c.lineTo(-11, -39); c.lineTo(-19, -28); c.closePath();
  c.fillStyle = "#f7f0f3"; c.fill(); c.strokeStyle = "#9f91ae"; c.lineWidth = 1.4; c.stroke();
  // Cat cap and embroidered crescent keep Sui recognizable at gameplay scale.
  c.beginPath(); c.moveTo(-23, -44); c.lineTo(-24, -65); c.lineTo(-11, -56);
  c.quadraticCurveTo(0, -60, 12, -55); c.lineTo(25, -64); c.lineTo(23, -42); c.closePath();
  c.fillStyle = "#695679"; c.fill(); c.strokeStyle = INK; c.lineWidth = 2; c.stroke();
  stroke(c, [-20, -58, -18, -49, -14, -53], "#c3a6d4", 2);
  stroke(c, [21, -58, 18, -49, 15, -52], "#c3a6d4", 2);
  box(c, -23, -46, 46, 7, "#847094");
  oval(c, 5, -51, 4, 4, "#edcc8c"); oval(c, 7, -53, 3.5, 3.5, "#695679");
  c.restore();
}
