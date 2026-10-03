import { DIFFICULTIES, GameState, HEIGHT, nearestSpot, WIDTH } from "./engine";

type Ctx = CanvasRenderingContext2D;
const INK = "#214d48";

function ellipse(
  c: Ctx,
  x: number,
  y: number,
  rx: number,
  ry: number,
  color: string | CanvasGradient,
) {
  c.fillStyle = color;
  c.beginPath();
  c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  c.fill();
}
function line(c: Ctx, points: number[], color: string, width = 2) {
  c.beginPath();
  c.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) c.lineTo(points[i], points[i + 1]);
  c.strokeStyle = color;
  c.lineWidth = width;
  c.lineCap = "round";
  c.lineJoin = "round";
  c.stroke();
}
function round(
  c: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  color: string,
) {
  c.fillStyle = color;
  c.beginPath();
  c.roundRect(x, y, w, h, r);
  c.fill();
}
function label(
  c: Ctx,
  text: string,
  x: number,
  y: number,
  size = 13,
  color = INK,
  align: CanvasTextAlign = "left",
) {
  c.font = `${size >= 20 ? "600 " : ""}${size}px "Microsoft YaHei", sans-serif`;
  c.fillStyle = color;
  c.textAlign = align;
  c.fillText(text, x, y);
}

function eye(c: Ctx, x: number, s: GameState) {
  const y = 263;
  const squeezed = s.pain > 64 || Boolean(s.pulse);
  if (squeezed) {
    line(c, [x - 25, y - 4, x, y + 6, x + 23, y - 4], "#66536a", 4);
    if (s.pain > 75) ellipse(c, x + 27, y + 17, 4, 10, "#a8dedd");
    return;
  }
  c.beginPath();
  c.moveTo(x - 30, y);
  c.quadraticCurveTo(x, y - 29, x + 30, y);
  c.quadraticCurveTo(x, y + 29, x - 30, y);
  c.fillStyle = "#fffaf6";
  c.fill();
  c.save();
  c.clip();
  const dx = Math.max(-6, Math.min(6, (s.hand.x - 380) / 32));
  const grad = c.createLinearGradient(0, y - 18, 0, y + 20);
  grad.addColorStop(0, "#886735");
  grad.addColorStop(0.6, "#d9af52");
  grad.addColorStop(1, "#ffe29b");
  c.fillStyle = grad;
  c.beginPath();
  c.ellipse(x + dx, y, 17, 23, 0, 0, Math.PI * 2);
  c.fill();
  ellipse(c, x + dx, y, 6, 13, "#594844");
  ellipse(c, x + dx - 6, y - 9, 5, 6, "white");
  ellipse(c, x + dx + 8, y + 9, 2.5, 2.5, "#fff6d7");
  c.restore();
  c.beginPath();
  c.moveTo(x - 31, y);
  c.quadraticCurveTo(x, y - 30, x + 31, y);
  c.strokeStyle = "#68526a";
  c.lineWidth = 4;
  c.stroke();
  line(c, [x - 27, y - 4, x - 36, y - 13], "#68526a", 3);
  line(c, [x - 21, y - 9, x - 28, y - 18], "#68526a", 2);
}

function patient(c: Ctx, s: GameState, reduced: boolean) {
  const breath = reduced ? 0 : Math.sin(s.time * 1.5) * 1.4;
  c.save();
  c.translate(0, breath);
  // Padded chair and a soft shadow keep the face anchored in the scene.
  ellipse(c, 382, 306, 220, 273, "#103f39");
  const cushion = c.createLinearGradient(170, 50, 550, 620);
  cushion.addColorStop(0, "#d7e2d7");
  cushion.addColorStop(1, "#a5bdb0");
  c.fillStyle = cushion;
  c.beginPath();
  c.roundRect(188, 67, 384, 507, 175);
  c.fill();
  ellipse(c, 380, 292, 177, 204, "#9caea1");
  // Hair silhouette, shoulder drape, neck.
  ellipse(c, 380, 270, 169, 199, "#8b818b");
  c.beginPath();
  c.moveTo(211, 175);
  c.bezierCurveTo(172, 280, 191, 443, 218, 475);
  c.quadraticCurveTo(251, 428, 265, 389);
  c.lineTo(274, 167);
  c.fillStyle = "#aba1b0";
  c.fill();
  c.beginPath();
  c.moveTo(550, 175);
  c.bezierCurveTo(587, 302, 568, 445, 540, 475);
  c.quadraticCurveTo(510, 429, 496, 392);
  c.lineTo(485, 168);
  c.fill();
  round(c, 337, 427, 87, 106, 32, "#edbbab");
  const drape = c.createLinearGradient(200, 500, 550, 660);
  drape.addColorStop(0, "#5f9d8e");
  drape.addColorStop(1, "#376b60");
  c.fillStyle = drape;
  c.beginPath();
  c.moveTo(210, 498);
  c.quadraticCurveTo(266, 465, 328, 477);
  c.quadraticCurveTo(380, 543, 435, 477);
  c.quadraticCurveTo(515, 475, 552, 513);
  c.lineTo(593, 660);
  c.lineTo(164, 660);
  c.closePath();
  c.fill();
  line(c, [326, 484, 380, 534, 435, 484], "#b4d2be", 3);
  line(c, [222, 521, 252, 655], "#4c8879", 3);
  line(c, [528, 517, 493, 655], "#326358", 3);
  label(c, "S U I", 380, 593, 19, "#d2dfc9", "center");
  label(c, "BE GENTLE, PLEASE", 380, 614, 9, "#bfcec0", "center");
  ellipse(c, 238, 297, 22, 36, "#efc4b4");
  ellipse(c, 522, 297, 22, 36, "#efc4b4");
  const skin = c.createRadialGradient(345, 235, 12, 388, 300, 210);
  skin.addColorStop(0, "#fff1dc");
  skin.addColorStop(0.6, "#ffdfc8");
  skin.addColorStop(1, "#eaa995");
  c.fillStyle = skin;
  c.beginPath();
  c.moveTo(258, 179);
  c.bezierCurveTo(289, 104, 471, 104, 502, 179);
  c.bezierCurveTo(556, 310, 491, 453, 380, 483);
  c.bezierCurveTo(272, 453, 211, 310, 258, 179);
  c.fill();
  [285, 477].forEach((x) => {
    const blush = c.createRadialGradient(x, 334, 0, x, 334, 47);
    blush.addColorStop(0, `rgba(224,118,113,${0.18 + s.pain / 350})`);
    blush.addColorStop(1, "rgba(231,139,122,0)");
    ellipse(c, x, 334, 47, 35, blush);
  });
  eye(c, 316, s);
  eye(c, 445, s);
  c.beginPath();
  c.moveTo(297, 228);
  c.quadraticCurveTo(316, 218 - s.pain * 0.07, 336, 225);
  c.strokeStyle = "#ac8d8e";
  c.lineWidth = 3;
  c.stroke();
  c.beginPath();
  c.moveTo(425, 225);
  c.quadraticCurveTo(445, 218 - s.pain * 0.07, 464, 228);
  c.stroke();
  c.beginPath();
  c.moveTo(380, 292);
  c.quadraticCurveTo(373, 320, 388, 319);
  c.strokeStyle = "#d7998b";
  c.lineWidth = 2;
  c.stroke();
  if (s.pain > 50 || s.pulse) {
    ellipse(c, 380, 361, 11 + s.pain / 10, 8 + s.pain / 9, "#8b5758");
    ellipse(c, 380, 368, 10, 5, "#d9908c");
  } else {
    c.beginPath();
    c.moveTo(362, 360);
    c.quadraticCurveTo(380, 374, 398, 360);
    c.strokeStyle = "#bd7c77";
    c.lineWidth = 2.5;
    c.stroke();
  }
  // Swept-back fringe leaves the treatment area readable.
  const hair = c.createLinearGradient(230, 100, 520, 240);
  hair.addColorStop(0, "#cdc4ce");
  hair.addColorStop(0.5, "#b9acbb");
  hair.addColorStop(1, "#9d8fa3");
  c.fillStyle = hair;
  c.beginPath();
  c.moveTo(218, 236);
  c.bezierCurveTo(206, 90, 334, 58, 394, 106);
  c.bezierCurveTo(475, 60, 565, 126, 545, 246);
  c.quadraticCurveTo(510, 223, 488, 162);
  c.quadraticCurveTo(422, 126, 382, 136);
  c.quadraticCurveTo(306, 114, 263, 172);
  c.quadraticCurveTo(250, 218, 218, 236);
  c.fill();
  line(c, [244, 160, 284, 119, 335, 103], "#e2d9dc", 3);
  line(c, [424, 110, 471, 120, 515, 167], "#ded2da", 3);
  // Gold feather clips, borrowed as a visual motif rather than a copied portrait.
  [244, 516].forEach((x, i) => {
    c.save();
    c.translate(x, 173);
    c.rotate(i === 0 ? -0.48 : 0.48);
    round(c, -5, -33, 10, 67, 5, "#b89242");
    line(c, [0, -27, 0, 28], "#f4db95", 2);
    [-15, 0, 15].forEach((y) => line(c, [-10, y - 7, 0, y, 10, y - 7], "#d5b462", 3),);
    c.restore();
  });
  c.restore();
}

function spots(c: Ctx, s: GameState) {
  if (s.phase === "welcome" || s.phase === "result") return;
  s.spots.forEach((p) => {
    let fill = 0;
    if (s.phase === "clean") fill = p.clean;
    if (s.phase === "numb") fill = p.cream;
    if (s.phase === "wipe") fill = p.wiped;
    if (s.phase === "needle") fill = p.treated ? 1 : 0;
    if (s.phase === "cool") fill = p.cooled;
    c.save();
    c.translate(p.x, p.y);
    if (s.keyboardSpot === p.id) {
      c.strokeStyle = "#fff7cf";
      c.lineWidth = 3;
      c.beginPath();
      c.arc(0, 0, 28, 0, Math.PI * 2);
      c.stroke();
      label(c, String(p.id + 1), 0, -36, 12, "#244c43", "center");
    }

    if (
      (s.phase === "numb" && p.cream > 0) ||
      (s.phase === "wipe" && p.wiped < 1)
    ) {
      ellipse(
        c,
        0,
        0,
        22,
        17,
        `rgba(255,253,239,${s.phase === "numb" ? p.cream * 0.85 : (1 - p.wiped) * 0.85})`,
      );
    }
    if (p.treated) {
      for (let x = -7; x <= 7; x += 7) for (let y = -7; y <= 7; y += 7) ellipse(
            c,
            x,
            y,
            1.3,
            1.3,
            `rgba(182,91,80,${0.55 - p.cooled * 0.25})`,
          );
    }
    c.strokeStyle = fill >= 1 ? "#548b78" : "#b99b53";
    c.lineWidth = fill >= 1 ? 1.4 : 1.8;
    c.setLineDash(fill >= 1 ? [] : [3, 4]);
    c.beginPath();
    c.arc(0, 0, 20, 0, Math.PI * 2);
    c.stroke();
    c.setLineDash([]);
    if (fill > 0 && fill < 1) {
      c.beginPath();
      c.arc(0, 0, 22, -Math.PI / 2, -Math.PI / 2 + fill * Math.PI * 2);
      c.strokeStyle = "#4e8d77";
      c.lineWidth = 3;
      c.stroke();
    }
    if (fill >= 1) line(c, [-6, 0, -1, 5, 7, -5], "#427b66", 2);
    else if (s.phase === "needle") {
      c.rotate((p.angle * Math.PI) / 180);
      line(c, [-8, -12, -12, -12, -12, -8], "#9a7836", 2);
      line(c, [8, 12, 12, 12, 12, 8], "#9a7836", 2);
      label(c, String(p.id + 1), 0, 4, 10, "#8e7040", "center");
    } else if (s.phase === "clean") {
      ellipse(c, 0, 0, 3, 3, "#b0a48c");
    }
    c.restore();
  });
}

function instrument(c: Ctx, s: GameState) {
  if (["welcome", "result"].includes(s.phase) || s.curtain > 0) return;
  const { x, y } = s.hand;
  if (s.tool === "probe") {
    c.beginPath();
    c.moveTo(x + 72, y + 151);
    c.bezierCurveTo(x + 155, y + 284, 617, 530, 771, 640);
    c.strokeStyle = "#173f39";
    c.lineWidth = 11;
    c.stroke();
    c.strokeStyle = "#537b70";
    c.lineWidth = 5;
    c.stroke();
  }
  c.save();
  c.translate(x, y);
  c.rotate((s.angle * Math.PI) / 180);
  c.shadowColor = "rgba(27,44,37,0.23)";
  c.shadowBlur = 16;
  c.shadowOffsetX = 6;
  c.shadowOffsetY = 10;
  if (s.tool === "probe") {
    round(c, -22, -22, 44, 44, 8, "#c19b50");
    const body = c.createLinearGradient(20, 20, 85, 80);
    body.addColorStop(0, "#f8f1dc");
    body.addColorStop(0.45, "#e5d3a6");
    body.addColorStop(1, "#a8884c");
    c.fillStyle = body;
    c.beginPath();
    c.moveTo(14, 4);
    c.lineTo(89, 106);
    c.quadraticCurveTo(109, 139, 81, 154);
    c.quadraticCurveTo(68, 159, 58, 143);
    c.lineTo(-8, 22);
    c.closePath();
    c.fill();
    c.shadowColor = "transparent";
    round(c, -18, -18, 36, 36, 5, s.pulse ? "#ecd188" : "#fdf5db");
    for (let nx = -10; nx <= 10; nx += 10) for (let ny = -10; ny <= 10; ny += 10) ellipse(c, nx, ny, 1.7, 1.7, "#b58d3b");
    line(c, [29, 48, 69, 112], "#fff8df", 4);
    ellipse(c, 44, 64, 4, 7, s.heat > 68 ? "#d87459" : "#80a98a");
  } else if (s.tool === "swab") {
    round(c, 13, 13, 25, 92, 10, "#cfc8b1");
    ellipse(c, 0, 0, 32, 26, "#fffdf1");
    ellipse(c, -4, -4, 23, 19, "#f2efdf");
    line(c, [-14, 1, 15, -6], "#dddccb", 1);
    line(c, [-12, 9, 12, 3], "#dddccb", 1);
  } else if (s.tool === "cream") {
    round(c, 9, 10, 27, 109, 9, "#d2b989");
    round(c, -22, -20, 49, 41, 10, "#efecdf");
    line(c, [-12, -11, -12, 10], "#d8d4c7", 2);
    line(c, [-3, -13, -3, 11], "#d8d4c7", 2);
    line(c, [7, -13, 7, 12], "#d8d4c7", 2);
  } else {
    round(c, -36, -30, 72, 64, 17, "#abd9d2");
    round(c, -29, -23, 58, 49, 12, "#c7e6dc");
    line(c, [-13, 0, 14, 0], "#6ca298", 3);
    line(c, [0, -14, 0, 14], "#6ca298", 3);
    line(c, [-10, -10, 10, 10], "#6ca298", 2);
    line(c, [-10, 10, 10, -10], "#6ca298", 2);
  }
  // A gloved hand: visible grip connects the pointer to the operator fantasy.
  c.shadowColor = "transparent";
  c.rotate(-0.1);
  round(c, 54, 75, 64, 83, 26, "#d4e3c9");
  round(c, 38, 78, 28, 58, 13, "#e1ead6");
  line(c, [72, 90, 72, 115], "#a6c0aa", 1.5);
  line(c, [86, 91, 86, 115], "#a6c0aa", 1.5);
  round(c, 57, 144, 65, 43, 6, "#91b6a4");
  c.restore();
  const target = nearestSpot(s);
  if (s.tool === "probe" && s.phase === "needle" && target && !target.treated) {
    const ready = Math.abs(s.angle - target.angle) <= 12;
    label(
      c,
      ready ? "已对准 · 按住" : `旋转至 ${target.angle}°`,
      x,
      y - 36,
      12,
      ready ? "#346d53" : "#985c37",
      "center",
    );
  }
  if (s.pulse) {
    const [low, high] = DIFFICULTIES[s.difficulty].window;
    const t = s.pulse.time;
    c.beginPath();
    c.arc(
      x,
      y,
      34,
      -Math.PI / 2,
      -Math.PI / 2 + Math.min(t / 1.5, 1) * Math.PI * 2,
    );
    c.strokeStyle =
      t >= low && t <= high ? "#e0b350" : t > high ? "#cf775e" : "#537d6a";
    c.lineWidth = 5;
    c.stroke();
    label(
      c,
      t >= low && t <= high ? "松手！" : t > high ? "太久了" : "稳住…",
      x,
      y - 54,
      18,
      "#815a20",
      "center",
    );
  }
}

export function paint(c: Ctx, s: GameState, reduced: boolean) {
  c.clearRect(0, 0, WIDTH, HEIGHT);
  const cloth = c.createLinearGradient(0, 0, WIDTH, HEIGHT);
  cloth.addColorStop(0, "#386e61");
  cloth.addColorStop(1, "#194d43");
  c.fillStyle = cloth;
  c.fillRect(0, 0, WIDTH, HEIGHT);
  c.globalAlpha = 0.13;
  for (let y = 0; y < HEIGHT; y += 6) line(c, [0, y, WIDTH, y + 26], "#abc3ae", 0.5);
  for (let x = 0; x < WIDTH; x += 72) line(c, [x, 0, x - 20, HEIGHT], "#112f2a", 1);
  c.globalAlpha = 1;
  c.beginPath();
  c.arc(380, 283, 280, Math.PI * 1.11, Math.PI * 1.9);
  c.strokeStyle = "#6e9277";
  c.lineWidth = 1;
  c.stroke();
  label(c, "SU I  /  STUDIO 01", 30, 40, 11, "#acc5ae");
  label(c, "操作区", 30, 62, 14, "#d6e2ca");
  label(c, "TAKE YOUR TIME", WIDTH - 27, 40, 10, "#acc5ae", "right");
  // The monitor line becomes jagged with discomfort.
  const monitor: number[] = [];
  for (let x = 26; x < 149; x += 3) monitor.push(
      x,
      530 +
        Math.sin(x * 0.12 + (reduced ? 0 : s.time * 2)) * (4 + s.pain * 0.14),
    );
  line(c, monitor, "#a7c5a1", 1.4);
  label(c, "勇气监测中", 30, 562, 10, "#b7cab1");
  label(c, "轻轻的。", 678, 533, 16, "#c7d8ba", "center");
  label(c, "稳稳的。", 678, 559, 16, "#c7d8ba", "center");
  patient(c, s, reduced);
  spots(c, s);
  if (s.flash > 0 && s.combo > 0 && s.phase === "needle") {
    const p = s.lastSpot === null ? undefined : s.spots[s.lastSpot];
    if (p) {
      c.globalAlpha = s.flash;
      c.beginPath();
      c.arc(p.x, p.y, 27 + (0.7 - s.flash) * 55, 0, Math.PI * 2);
      c.strokeStyle = "#f8d679";
      c.lineWidth = 2;
      c.stroke();
      c.globalAlpha = 1;
    }
  }
  instrument(c, s);
  if (s.curtain > 0) {
    round(c, 109, 80, 542, 530, 8, "#d8dfcd");
    for (let x = 120; x < 650; x += 28) {
      const fold = c.createLinearGradient(x, 0, x + 28, 0);
      fold.addColorStop(0, "#bfccb9");
      fold.addColorStop(0.5, "#e7ebd9");
      fold.addColorStop(1, "#bfccb9");
      c.fillStyle = fold;
      c.fillRect(x, 91, 28, 508);
    }
    line(c, [102, 79, 658, 79], "#b69b66", 7);
    round(c, 231, 257, 298, 116, 5, "#fcf6e7");
    label(c, "请 给 勇 气 一 点 隐 私", 380, 304, 18, INK, "center");
    label(c, "栓剂使用中 · 仅虚构道具演出", 380, 340, 12, "#6b7e6f", "center");
  }
}
