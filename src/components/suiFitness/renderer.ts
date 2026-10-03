import type { FitnessState } from "./engine";

type Ctx = CanvasRenderingContext2D;
type Zone = FitnessState["zones"][number];
type Food = FitnessState["foods"][number];
type Assets = { sui?: HTMLImageElement };

const WIDTH = 1100;
const HEIGHT = 700;
const TAU = Math.PI * 2;
const INK = "#654852";
const CORAL = "#e8797b";
const PAPER = "#fff6e9";
const FONT = '"Microsoft YaHei", "PingFang SC", sans-serif';
const scenery = new WeakMap<Ctx, { key: string; image: HTMLCanvasElement }>();
const movement = new WeakMap<Ctx, { x: number; y: number; seed: number }>();

function ellipse(
  c: Ctx,
  x: number,
  y: number,
  rx: number,
  ry: number,
  color: string,
) {
  c.beginPath();
  c.ellipse(x, y, rx, ry, 0, 0, TAU);
  c.fillStyle = color;
  c.fill();
}

function round(
  c: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  color: string,
  stroke?: string,
) {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
  c.fillStyle = color;
  c.fill();
  if (stroke) {
    c.strokeStyle = stroke;
    c.lineWidth = 2;
    c.stroke();
  }
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

function text(
  c: Ctx,
  value: string,
  x: number,
  y: number,
  size = 14,
  color = INK,
  weight = 600,
) {
  c.font = `${weight} ${size}px ${FONT}`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillStyle = color;
  c.fillText(value, x, y);
}

function ring(
  c: Ctx,
  x: number,
  y: number,
  r: number,
  color: string,
  width = 2,
) {
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
  c.lineWidth = width;
  c.strokeStyle = color;
  c.stroke();
}

function star(
  c: Ctx,
  x: number,
  y: number,
  radius: number,
  color: string,
  points = 4,
) {
  c.beginPath();
  for (let i = 0; i < points * 2; i += 1) {
    const a = -Math.PI / 2 + (i / (points * 2)) * TAU;
    const r = i % 2 ? radius * 0.36 : radius;
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    if (!i) c.moveTo(px, py);
    else c.lineTo(px, py);
  }
  c.closePath();
  c.fillStyle = color;
  c.fill();
}

function dumbbell(
  c: Ctx,
  x: number,
  y: number,
  angle: number,
  size = 1,
  color = INK,
) {
  c.save();
  c.translate(x, y);
  c.rotate(angle);
  c.scale(size, size);
  round(c, -13, -3, 26, 6, 3, color);
  round(c, -18, -10, 7, 20, 3, color);
  round(c, 11, -10, 7, 20, 3, color);
  line(c, [-14, -6, -14, 5], "#fff8ef", 2);
  line(c, [14, -6, 14, 5], "#fff8ef", 2);
  c.restore();
}

function leaf(
  c: Ctx,
  x: number,
  y: number,
  angle: number,
  size: number,
  color: string,
) {
  c.save();
  c.translate(x, y);
  c.rotate(angle);
  c.beginPath();
  c.moveTo(-size, 0);
  c.quadraticCurveTo(0, -size * 0.8, size, 0);
  c.quadraticCurveTo(0, size * 0.8, -size, 0);
  c.fillStyle = color;
  c.fill();
  c.restore();
}

function plant(c: Ctx, x: number, y: number, size: number) {
  ellipse(c, x + 6, y + 8, size * 0.92, size * 0.28, "#70564b12");
  ellipse(c, x, y, size, size * 0.7, "#acc4a0");
  ellipse(
    c,
    x - size * 0.35,
    y - size * 0.36,
    size * 0.7,
    size * 0.65,
    "#c0d3ae",
  );
  ellipse(
    c,
    x + size * 0.37,
    y - size * 0.4,
    size * 0.65,
    size * 0.62,
    "#bed0a5",
  );
  line(c, [x - 5, y - 5, x + 7, y - 9], "#8faf87", 2);
  ellipse(c, x + size * 0.57, y - size * 0.49, 3, 3, "#f2d0b6");
}

function bench(c: Ctx, x: number, y: number, angle: number) {
  c.save();
  c.translate(x, y);
  c.rotate(angle);
  round(c, -35, -6, 75, 26, 8, "#76545113");
  round(c, -37, -18, 74, 32, 6, "#dbb298", "#bd937f");
  line(c, [-34, -8, 34, -8], "#efccad", 3);
  line(c, [-34, 1, 34, 1], "#efccad", 3);
  line(c, [-24, 15, -24, 21], INK, 3);
  line(c, [24, 15, 24, 21], INK, 3);
  c.restore();
}

function zoneBase(c: Ctx, z: Zone) {
  const { x, y, radius: r } = z;
  const mint = z.kind === "gym";
  const blue = z.kind === "swim";
  const fill = blue ? "#e2eee5" : mint ? "#e6edcf" : "#f5e1d3";
  ellipse(c, x + 4, y + 9, r + 16, r * 0.84 + 12, "#6953480a");
  ellipse(c, x, y, r + 15, r * 0.84 + 10, fill);
  c.save();
  c.setLineDash([3, 7]);
  ring(c, x, y, r + 2, blue ? "#8fbabc" : mint ? "#a1b887" : "#d5aa94", 1.5);
  c.restore();
  if (blue) {
    round(
      c,
      x - r * 0.85,
      y - r * 0.59,
      r * 1.7,
      r * 1.18,
      24,
      "#cce4dd",
      "#a4c7bf",
    );
    round(c, x - r * 0.75, y - r * 0.48, r * 1.5, r * 0.96, 17, "#a7d7d9");
    for (let j = -1; j <= 1; j += 1) {
      line(c, [x - r * 0.7, y + j * 26, x + r * 0.7, y + j * 26], "#dff5ea", 2);
      for (let i = -2; i <= 2; i += 1) {
        c.beginPath();
        c.moveTo(x + i * 28 - 8, y + j * 26 + 9);
        c.quadraticCurveTo(
          x + i * 28,
          y + j * 26 + 15,
          x + i * 28 + 9,
          y + j * 26 + 9,
        );
        c.strokeStyle = "#74b9bf";
        c.lineWidth = 1.5;
        c.stroke();
      }
    }
    round(c, x + r * 0.55, y - 19, 15, 40, 4, "#fff9ed");
    line(c, [x + r * 0.61, y - 22, x + r * 0.61, y + 23], "#78989d", 3);
    line(c, [x + r * 0.76, y - 22, x + r * 0.76, y + 23], "#78989d", 3);
    ellipse(c, x - r * 0.7, y + r * 0.53, 14, 14, "#f7edd5");
    ellipse(c, x - r * 0.7, y + r * 0.53, 8, 8, "#a7d7d9");
    c.beginPath();
    c.arc(x - r * 0.7, y + r * 0.53, 11, -0.3, 0.55);
    c.strokeStyle = CORAL;
    c.lineWidth = 6;
    c.stroke();
  } else if (mint) {
    round(
      c,
      x - r * 0.79,
      y - r * 0.61,
      r * 1.58,
      r * 1.2,
      22,
      "#d8e0bb",
      "#abb893",
    );
    round(c, x - r * 0.68, y - r * 0.5, r * 1.36, r * 0.97, 17, "#f6f2dc");
    for (let i = -2; i <= 2; i += 1) line(
        c,
        [x + i * 24, y - r * 0.45, x + i * 24, y + r * 0.42],
        "#e6e2c9",
        1,
      );
    round(c, x - 24, y - 16, 48, 61, 9, "#b1c09b", "#8c9d7a");
    line(c, [x - 25, y - 29, x + 25, y - 29], "#667968", 6);
    round(c, x - 36, y - 41, 10, 25, 3, "#667968");
    round(c, x + 26, y - 41, 10, 25, 3, "#667968");
    line(c, [x - 15, y - 24, x - 15, y + 18], "#7b8d74", 3);
    line(c, [x + 15, y - 24, x + 15, y + 18], "#7b8d74", 3);
    dumbbell(c, x - r * 0.56, y + 21, -0.3, 0.67, "#a07c77");
    dumbbell(c, x + r * 0.55, y + 19, 0.3, 0.67, "#a07c77");
  } else {
    round(
      c,
      x - r * 0.8,
      y - r * 0.58,
      r * 1.6,
      r * 1.17,
      22,
      "#eed4c3",
      "#d0ad98",
    );
    round(c, x - r * 0.69, y - r * 0.47, r * 1.38, r * 0.96, 16, "#f9ebda");
    for (let j = -1; j <= 1; j += 1) line(
        c,
        [x - r * 0.64, y + j * 26, x + r * 0.64, y + j * 26],
        "#eedac4",
        1,
      );
    round(c, x - 31, y - 37, 62, 77, 9, "#cdabc9", "#ab88aa");
    line(c, [x - 23, y - 28, x + 23, y - 28], "#e8cce4", 3);
    line(c, [x - 23, y + 28, x + 23, y + 28], "#e8cce4", 3);
    dumbbell(c, x + r * 0.53, y + 20, -0.5, 0.65, "#b27c7e");
    round(c, x - r * 0.63, y + 5, 14, 31, 5, "#b4c9aa", "#8fab89");
    round(c, x - r * 0.6, y - 1, 8, 8, 2, "#8fab89");
    c.beginPath();
    c.arc(x - r * 0.56, y - 20, 10, 0.2, 5.2);
    c.strokeStyle = "#b9947a";
    c.lineWidth = 3;
    c.stroke();
  }
  const title = mint ? "健身房" : blue ? "游泳馆" : "居家健身";
  const subtitle = mint ? "STRENGTH" : blue ? "SWIM CLUB" : "HOME STUDIO";
  const titleY = y - r - 27;
  round(c, x - 66, titleY - 17, 132, 38, 13, PAPER, "#dfc7b3");
  text(c, title, x, titleY - 2, 17);
  text(c, subtitle, x, titleY + 13, 8, "#b59281", 700);
}

function terrain(c: Ctx, zones: FitnessState["zones"]) {
  c.fillStyle = "#f7eddc";
  c.fillRect(0, 0, WIDTH, HEIGHT);
  ellipse(c, 106, 81, 216, 190, "#e6e9cb");
  ellipse(c, 992, 28, 256, 242, "#e4e8ce");
  ellipse(c, 10, 715, 322, 259, "#e4e8ca");
  ellipse(c, 1127, 688, 302, 263, "#e6e9cf");
  line(c, [-50, 366, 1140, 366], "#ebd4bb", 104);
  line(c, [-50, 364, 1140, 364], "#f9ead4", 92);
  line(c, [551, -50, 551, 765], "#ebd4bb", 102);
  line(c, [549, -50, 549, 765], "#f9ead4", 90);
  line(c, [190, 177, 325, 262, 426, 363], "#ebd4bb", 68);
  line(c, [190, 177, 325, 262, 426, 363], "#f9ead4", 58);
  line(c, [901, 177, 785, 260, 676, 365], "#ebd4bb", 68);
  line(c, [901, 177, 785, 260, 676, 365], "#f9ead4", 58);
  for (let i = 0; i < 185; i += 1) {
    const x = ((i * 149 + 37) % 1096) + 2;
    const y = ((i * 83 + 47) % 696) + 2;
    ellipse(
      c,
      x,
      y,
      i % 3 === 0 ? 1.7 : 0.9,
      0.8,
      i % 3 === 0 ? "#c7ab881c" : "#ffffff60",
    );
  }
  c.save();
  c.setLineDash([6, 10]);
  ring(c, 550, 363, 124, "#dcc2a1", 1.5);
  c.restore();
  ring(c, 550, 363, 110, "#edd9bb", 2);
  text(c, "SUI MOVE CLUB", 550, 87, 12, "#c09b83", 700);
  star(c, 550, 55, 13, "#dfad96");
  for (let i = 0; i < 6; i += 1) {
    line(c, [452 + i * 38, 323, 465 + i * 38, 323], "#ecdbc4", 1.5);
    line(c, [452 + i * 38, 403, 465 + i * 38, 403], "#ecdbc4", 1.5);
  }
  plant(c, 38, 79, 29);
  plant(c, 57, 111, 20);
  plant(c, 385, 90, 33);
  plant(c, 727, 70, 28);
  plant(c, 1055, 114, 34);
  plant(c, 29, 246, 28);
  plant(c, 1062, 256, 29);
  plant(c, 51, 583, 31);
  plant(c, 87, 618, 26);
  plant(c, 329, 593, 28);
  plant(c, 767, 625, 31);
  plant(c, 1041, 544, 34);
  plant(c, 1073, 610, 25);
  bench(c, 296, 468, -0.11);
  bench(c, 829, 473, 0.11);
  bench(c, 395, 164, 0.38);
  bench(c, 713, 159, -0.38);
  for (const z of zones) zoneBase(c, z);
  round(c, 495, 655, 110, 20, 10, "#f8efdf");
  text(c, "今天，也要动一动", 550, 666, 11, "#b69280", 500);
}

function background(c: Ctx, zones: FitnessState["zones"]) {
  const key = zones.map((z) => `${z.kind}:${z.x}:${z.y}:${z.radius}`).join("|");
  let cached = scenery.get(c);
  if (!cached || cached.key !== key) {
    if (typeof document === "undefined") {
      terrain(c, zones);
      return;
    }
    const image = document.createElement("canvas");
    image.width = WIDTH;
    image.height = HEIGHT;
    const paint = image.getContext("2d");
    if (!paint) {
      terrain(c, zones);
      return;
    }
    terrain(paint, zones);
    cached = { key, image };
    scenery.set(c, cached);
  }
  c.drawImage(cached.image, 0, 0);
}

function food(c: Ctx, f: Food, time: number, reduced: boolean) {
  const wobble = reduced ? 0 : Math.sin(time * 4 + f.x * 0.07) * 1.6;
  const scale = f.radius / 20;
  ellipse(c, f.x + 3, f.y + 14 * scale, 21 * scale, 7 * scale, "#6e465323");
  if (f.telegraph && f.telegraph > 0) {
    const pulse = reduced ? 0 : Math.sin(time * 15) * 2;
    ring(c, f.x, f.y, f.radius + 10 + pulse, "#dc6761b3", 3);
    ring(c, f.x, f.y, f.radius + 16, "#dc676134", 3);
    star(c, f.x, f.y - f.radius - 22, 7, CORAL);
    const endX = f.x + f.vx * 0.65;
    const endY = f.y + f.vy * 0.65;
    line(c, [f.x, f.y, endX, endY], "#e67f7422", f.radius * 1.65);
    c.save();
    c.setLineDash([7, 10]);
    line(c, [f.x, f.y, endX, endY], "#d77b6e", 2);
    c.restore();
    const a = Math.atan2(f.vy, f.vx);
    line(
      c,
      [
        endX - Math.cos(a - 0.5) * 13,
        endY - Math.sin(a - 0.5) * 13,
        endX,
        endY,
        endX - Math.cos(a + 0.5) * 13,
        endY - Math.sin(a + 0.5) * 13,
      ],
      "#d77b6e",
      3,
    );
  } else if (f.rush > 0) {
    const a = Math.atan2(f.vy, f.vx);
    line(
      c,
      [
        f.x - Math.cos(a) * 44,
        f.y - Math.sin(a) * 44,
        f.x - Math.cos(a) * 19,
        f.y - Math.sin(a) * 19,
      ],
      "#e5a89499",
      4,
    );
  }
  c.save();
  c.translate(f.x, f.y + wobble);
  c.scale(scale, scale);
  c.rotate(reduced ? 0 : Math.sin(time * 2.7 + f.y * 0.08) * 0.045);
  if (f.kind === "dq") {
    line(c, [14, -7, 22, -31], "#86b3c7", 5);
    ellipse(c, 22, -33, 5, 8, "#9dc8d8");
    ellipse(c, -6, -15, 16, 11, "#fff9ed");
    ellipse(c, 8, -18, 12, 10, "#f8c9c9");
    ellipse(c, 0, -27, 12, 8, "#ffdfd8");
    c.beginPath();
    c.moveTo(-18, -13);
    c.lineTo(18, -13);
    c.lineTo(13, 20);
    c.quadraticCurveTo(0, 25, -13, 20);
    c.closePath();
    c.fillStyle = "#fff8ef";
    c.fill();
    c.strokeStyle = "#c87b83";
    c.lineWidth = 2;
    c.stroke();
    line(c, [-15, -7, 15, -7], "#f7c3bf", 4);
    ellipse(c, 0, 5, 14, 9, "#dd5f6b");
    text(c, "DQ", 0, 4.5, 13, "#fffaf4", 800);
    ellipse(c, -6, 16, 1.6, 2, INK);
    ellipse(c, 6, 16, 1.6, 2, INK);
  } else if (f.kind === "jerky") {
    c.beginPath();
    c.moveTo(-16, -23);
    c.lineTo(17, -23);
    c.lineTo(20, 20);
    c.quadraticCurveTo(0, 27, -20, 20);
    c.closePath();
    c.fillStyle = "#c77a55";
    c.fill();
    c.lineWidth = 2;
    c.strokeStyle = "#93614f";
    c.stroke();
    round(c, -17, -22, 34, 7, 2, "#f1bb82");
    line(c, [-13, -19, 13, -19], "#c88758", 1.5);
    round(c, -13, -10, 26, 24, 4, "#f8dfb3");
    text(c, "牛肉干", 0, -2, 8.5, "#98594b", 800);
    line(c, [-7, 7, -2, 3, 2, 8, 7, 3], "#a16950", 3);
    ellipse(c, -6, 18, 1.6, 2, INK);
    ellipse(c, 6, 18, 1.6, 2, INK);
  } else {
    line(c, [6, -7, 10, -33, 20, -37], "#91a575", 3.5);
    c.beginPath();
    c.moveTo(-17, -18);
    c.lineTo(17, -18);
    c.lineTo(12, 21);
    c.quadraticCurveTo(0, 25, -12, 21);
    c.closePath();
    c.fillStyle = "#eecb75";
    c.fill();
    c.strokeStyle = "#b99352";
    c.lineWidth = 2;
    c.stroke();
    c.save();
    c.clip();
    round(c, -20, 0, 40, 27, 0, "#e8ab66");
    round(c, -9, -12, 6, 9, 2, "#fff8ccaa");
    round(c, 3, -10, 7, 9, 2, "#fff8ccaa");
    ellipse(c, 7, 9, 9, 9, "#f5de82");
    ellipse(c, 7, 9, 6, 6, "#fff4bf");
    line(c, [7, 3, 7, 15], "#e7c467", 1);
    line(c, [1, 9, 13, 9], "#e7c467", 1);
    c.restore();
    round(c, -20, -21, 40, 7, 3, "#fff2d3", "#bfab7a");
    ellipse(c, -14, -16, 9, 9, "#f4d870");
    ellipse(c, -14, -16, 6, 6, "#fff3bc");
    leaf(c, -18, -25, -0.3, 8, "#a7b67a");
    ellipse(c, -5, 13, 1.6, 2, INK);
    ellipse(c, 3, 13, 1.6, 2, INK);
  }
  if (f.maxHp > 1 && f.hp < f.maxHp) {
    for (let i = 0; i < f.maxHp; i += 1) ellipse(
        c,
        (i - (f.maxHp - 1) / 2) * 7,
        31,
        2.3,
        2.3,
        i < f.hp ? CORAL : "#c9b3a266",
      );
  }
  c.restore();
}

function pickup(
  c: Ctx,
  p: FitnessState["pickups"][number],
  time: number,
  reduced: boolean,
) {
  const bob = reduced ? 0 : Math.sin(time * 3 + p.x) * 2;
  const color = p.kind === "protein" ? "#8aaf92" : CORAL;
  ellipse(c, p.x, p.y + 8, 9, 3, "#71545018");
  ring(c, p.x, p.y + bob, 14, `${color}35`, 2);
  if (p.kind === "protein") {
    round(c, p.x - 7, p.y - 9 + bob, 14, 20, 4, "#f9fbec", "#87a486");
    round(c, p.x - 5, p.y - 13 + bob, 10, 6, 2, "#8daf96");
    text(c, "P", p.x, p.y + 1 + bob, 10, "#6b9275", 800);
  } else {
    star(c, p.x, p.y + bob, 10, CORAL, 5);
    star(c, p.x - 3, p.y - 3 + bob, 3, "#ffdcd0");
  }
}

function fallbackHead(c: Ctx) {
  ellipse(c, -21, -22, 9, 21, "#d6ccd9");
  ellipse(c, 21, -22, 9, 21, "#d6ccd9");
  ellipse(c, -20, -28, 7, 18, "#f5f1ed");
  ellipse(c, 20, -28, 7, 18, "#f5f1ed");
  ellipse(c, 0, -29, 22, 21, "#fff0e8");
  ellipse(c, 0, -39, 24, 17, "#f4efed");
  c.beginPath();
  c.moveTo(-20, -42);
  c.lineTo(-6, -23);
  c.lineTo(-3, -34);
  c.lineTo(8, -22);
  c.lineTo(12, -37);
  c.lineTo(21, -28);
  c.lineTo(21, -43);
  c.closePath();
  c.fillStyle = "#f4efed";
  c.fill();
  ellipse(c, -8, -23, 4, 5, "#d4a253");
  ellipse(c, 8, -23, 4, 5, "#d4a253");
  ellipse(c, -9, -25, 1.4, 1.6, "#fffdf6");
  ellipse(c, 7, -25, 1.4, 1.6, "#fffdf6");
  ellipse(c, -16, -16, 4, 2, "#f2b4aa");
  ellipse(c, 16, -16, 4, 2, "#f2b4aa");
  line(c, [-3, -14, 0, -12, 3, -14], "#b88781", 1.5);
  c.beginPath();
  c.moveTo(-24, -41);
  c.lineTo(-24, -65);
  c.lineTo(-10, -52);
  c.quadraticCurveTo(0, -59, 13, -51);
  c.lineTo(25, -64);
  c.lineTo(24, -39);
  c.closePath();
  c.fillStyle = "#665c72";
  c.fill();
  line(c, [-21, -58, -20, -48, -14, -51], "#d2a7d7", 3);
  line(c, [20, -57, 19, -47, 14, -50], "#d2a7d7", 3);
  round(c, -25, -44, 48, 8, 4, "#574f64");
  text(c, "SUI", 7, -48, 6, "#a995bb", 700);
}

function player(
  c: Ctx,
  s: FitnessState,
  assets: Assets,
  reduced: boolean,
  moving: boolean,
) {
  const { x, y } = s.player;
  const step = reduced || !moving ? 0 : Math.sin(s.elapsed * 14) * 2;
  ellipse(c, x, y + 16, 21, 8, "#6e46532b");
  if (s.invincible > 0) ring(c, x, y - 7, 32, "#f4a78599", 3);
  c.save();
  c.translate(x, y + (reduced ? 0 : Math.sin(s.elapsed * 3) * 0.6));
  if (s.invincible > 0 && !reduced) c.globalAlpha = 0.72 + Math.sin(s.elapsed * 18) * 0.2;
  round(c, -13, 6 + step, 10, 18, 5, "#765a72");
  round(c, 3, 6 - step, 10, 18, 5, "#765a72");
  round(c, -15, 18 + step, 14, 8, 4, "#fff7eb", "#aa8c8e");
  round(c, 1, 18 - step, 15, 8, 4, "#fff7eb", "#aa8c8e");
  round(c, -16, -16, 32, 29, 12, "#e9979b", "#bd7d8b");
  round(c, -21, -10 + step, 10, 18, 5, "#e9979b");
  round(c, 11, -10 - step, 10, 18, 5, "#e9979b");
  ellipse(c, -18, 7 + step, 4, 4, "#ffe9da");
  ellipse(c, 18, 7 - step, 4, 4, "#ffe9da");
  line(c, [0, -11, 0, 7], "#f3c3bd", 2);
  star(c, 0, -2, 4, "#fff3df", 5);
  if (assets.sui?.complete && assets.sui.naturalWidth > 0) {
    const image = assets.sui;
    // Reuse Sui's transparent portrait: the cat cap, white hair and golden eyes.
    c.drawImage(
      image,
      image.naturalWidth * 0.245,
      image.naturalHeight * 0.053,
      image.naturalWidth * 0.485,
      image.naturalHeight * 0.216,
      -31,
      -65,
      62,
      59,
    );
  } else fallbackHead(c);
  c.restore();
  const angle = s.attackAngle;
  const orbit = reduced ? angle : s.elapsed * 1.6;
  for (let i = 0; i < 2; i += 1) {
    const a = orbit + Math.PI * i;
    dumbbell(
      c,
      x + Math.cos(a) * 35,
      y - 10 + Math.sin(a) * 23,
      a + 0.5,
      0.51,
      "#987e9b",
    );
  }
}

function feedback(c: Ctx, s: FitnessState) {
  if (s.attackFlash > 0) {
    c.save();
    c.translate(s.player.x, s.player.y);
    const alpha = Math.min(1, s.attackFlash * 6);
    c.globalAlpha = alpha;
    c.beginPath();
    c.moveTo(0, 0);
    c.arc(0, 0, s.attackRange, s.attackAngle - 0.65, s.attackAngle + 0.65);
    c.closePath();
    c.fillStyle = "#efafaa26";
    c.fill();
    c.beginPath();
    c.arc(0, 0, s.attackRange - 5, s.attackAngle - 0.55, s.attackAngle + 0.55);
    c.strokeStyle = "#fffdf2";
    c.lineWidth = 9;
    c.stroke();
    c.strokeStyle = "#eaa09a";
    c.lineWidth = 3;
    c.stroke();
    c.restore();
  }
  for (const e of s.effects) {
    const life = Math.max(0, Math.min(1, e.life * 2.5));
    c.save();
    c.globalAlpha = life;
    const radius = 8 + (1 - life) * 26;
    if (e.kind === "hit") {
      star(c, e.x, e.y, radius * 0.6, "#fff8d6", 5);
      ring(c, e.x, e.y, radius, "#e98d79", 2);
      for (let i = 0; i < 5; i += 1) {
        const a = i * 1.256;
        line(
          c,
          [
            e.x + Math.cos(a) * radius,
            e.y + Math.sin(a) * radius,
            e.x + Math.cos(a) * (radius + 5),
            e.y + Math.sin(a) * (radius + 5),
          ],
          "#d48880",
          2,
        );
      }
    } else if (e.kind === "dash") {
      ellipse(c, e.x, e.y, radius * 0.7, radius * 0.4, "#f2b7a333");
      ring(c, e.x, e.y, radius * 0.65, "#e49e96", 2);
    } else if (e.kind === "exercise") {
      ring(c, e.x, e.y, radius + 16, "#91b8a1", 3);
      star(c, e.x - 20, e.y - 28, 7, "#91b8a1");
      star(c, e.x + 20, e.y - 24, 5, "#efbe8c");
    } else {
      star(c, e.x - radius * 0.45, e.y - radius, 6, CORAL);
      star(c, e.x + radius * 0.45, e.y - radius * 0.6, 4, "#e6b67b");
    }
    c.restore();
  }
  if (s.exercise) {
    const { x, y } = s.player;
    ring(c, x, y - 6, 39, "#faf9e3cc", 6);
    c.beginPath();
    c.arc(
      x,
      y - 6,
      39,
      -Math.PI / 2,
      -Math.PI / 2 + Math.max(0, Math.min(1, s.exercise.progress)) * TAU,
    );
    c.strokeStyle = "#78a88c";
    c.lineWidth = 6;
    c.lineCap = "round";
    c.stroke();
  }
}

/** Paint the world only; menus, accessible controls and HUD belong to the DOM. */
export function drawFitness(
  c: Ctx,
  s: FitnessState,
  assets: Assets,
  options: { reducedMotion?: boolean } = {},
) {
  const reduced = Boolean(options.reducedMotion);
  let previous = movement.get(c);
  const moving =
    s.phase === "playing" &&
    previous?.seed === s.seed &&
    Math.hypot(s.player.x - previous.x, s.player.y - previous.y) > 0.03;
  if (!previous) {
    previous = { x: s.player.x, y: s.player.y, seed: s.seed };
    movement.set(c, previous);
  }
  previous.x = s.player.x;
  previous.y = s.player.y;
  previous.seed = s.seed;
  c.save();
  background(c, s.zones);
  for (const z of s.zones) {
    if (Math.hypot(s.player.x - z.x, s.player.y - z.y) <= z.radius) {
      ring(
        c,
        z.x,
        z.y,
        z.radius,
        s.exercise?.kind === z.kind ? "#7ba58c" : "#e2ac89",
        3,
      );
    }
  }
  for (const p of s.pickups) pickup(c, p, s.elapsed, reduced);
  for (const f of s.foods) food(c, f, s.elapsed, reduced);
  feedback(c, s);
  player(c, s, assets, reduced, moving);
  c.restore();
}
