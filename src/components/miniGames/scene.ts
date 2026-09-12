import { AiState } from "./agiEngine";
import { aiCompany } from './agiIndustry';
import { FabState } from "./fabEngine";
import { SnackState, snackCover, SNACKS } from "./snackEngine";
import { SnackSkin } from "./snackSkins";

export type GameState = AiState | FabState | SnackState;
type Ctx = CanvasRenderingContext2D;
function box(
  c: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  radius = 0,
) {
  c.fillStyle = color;
  c.beginPath();
  c.roundRect(x, y, w, h, radius);
  c.fill();
}
function ellipse(
  c: Ctx,
  x: number,
  y: number,
  rx: number,
  ry: number,
  color: string,
) {
  c.fillStyle = color;
  c.beginPath();
  c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  c.fill();
}
function line(c: Ctx, points: number[][], color: string, width = 2) {
  c.strokeStyle = color;
  c.lineWidth = width;
  c.beginPath();
  points.forEach(([x, y], i) => {
    if (!i) c.moveTo(x, y);
    else c.lineTo(x, y);
  });
  c.stroke();
}
function label(
  c: Ctx,
  text: string,
  x: number,
  y: number,
  size = 16,
  color = "#2a4945",
) {
  c.fillStyle = color;
  c.font = `600 ${size}px "Microsoft YaHei", sans-serif`;
  c.fillText(text, x, y);
}
function isoBox(
  c: Ctx,
  x: number,
  y: number,
  w: number,
  d: number,
  h: number,
  color: string,
) {
  c.fillStyle = color;
  c.beginPath();
  c.moveTo(x, y);
  c.lineTo(x + w, y + w * 0.45);
  c.lineTo(x + w - d, y + (w + d) * 0.45);
  c.lineTo(x - d, y + d * 0.45);
  c.closePath();
  c.fill();
  c.fillStyle = "#8bada6";
  c.beginPath();
  c.moveTo(x - d, y + d * 0.45);
  c.lineTo(x + w - d, y + (w + d) * 0.45);
  c.lineTo(x + w - d, y + (w + d) * 0.45 + h);
  c.lineTo(x - d, y + d * 0.45 + h);
  c.closePath();
  c.fill();
  c.fillStyle = "#567c74";
  c.beginPath();
  c.moveTo(x + w, y + w * 0.45);
  c.lineTo(x + w - d, y + (w + d) * 0.45);
  c.lineTo(x + w - d, y + (w + d) * 0.45 + h);
  c.lineTo(x + w, y + w * 0.45 + h);
  c.closePath();
  c.fill();
}
function person(c: Ctx, x: number, y: number, color: string, t: number) {
  ellipse(c, x, y + 25, 16, 6, "#34554b20");
  line(
    c,
    [
      [x - 5, y + 12],
      [x - 6 + Math.sin(t) * 3, y + 25],
    ],
    "#3a5350",
    5,
  );
  line(
    c,
    [
      [x + 5, y + 12],
      [x + 6 - Math.sin(t) * 3, y + 25],
    ],
    "#3a5350",
    5,
  );
  box(c, x - 10, y - 8, 20, 24, color, 8);
  ellipse(c, x, y - 15, 9, 10, "#f6d6b6");
  ellipse(c, x, y - 21, 10, 5, "#3e514d");
}
function business(c: Ctx, s: AiState | FabState, time: number) {
  const ai = s.kind === "agi";
  box(c, 0, 0, 960, 520, "#e5eee6");
  const bg = c.createLinearGradient(0, 0, 0, 520);
  bg.addColorStop(0, "#dde9e2");
  bg.addColorStop(1, "#f4efe0");
  c.fillStyle = bg;
  c.fillRect(0, 0, 960, 520);
  for (let i = 0; i < 6; i++) line(
      c,
      [
        [80 + i * 130, 100],
        [730 + i * 130, 400],
      ],
      "#557d6712",
    );
  for (let i = 0; i < 8; i++) line(
      c,
      [
        [130 + i * 115, 80],
        [-450 + i * 115, 380],
      ],
      "#557d6712",
    );
  ellipse(c, 495, 419, 360, 49, "#38595116");
  isoBox(c, 440, 142, 355, 290, 22, "#f7f8ed");
  if (ai) {
    const company = aiCompany(s.industry.company);
    box(c, 32, 28, 235, 59, '#f7f7ee', 8);
    box(c, 42, 38, 38, 38, company.color, 8);
    label(c, company.mark, 52, 64, 23, '#ffffff');
    label(c, company.name, 93, 54, 19);
    label(c, s.industry.service === 'research' ? '研究优先 · 网页仍开' : s.industry.service === 'consumer' ? 'TO C · 服务扩张' : '研究 / 服务均衡', 93, 74, 11);
    box(c, 373, 45, 250, 117, "#254d47", 12);
    label(c, "NEURAL / RESEARCH", 392, 70, 12, "#9bd8bf");
    const nodes = [
      [405, 105],
      [455, 91],
      [455, 132],
      [505, 80],
      [505, 112],
      [505, 144],
      [561, 91],
      [561, 132],
      [598, 110],
    ];
    nodes.forEach(([x, y], i) => nodes.forEach(([xx, yy], j) => {
        if (j > i && xx - x < 65 && xx !== x) line(
            c,
            [
              [x, y],
              [xx, yy],
            ],
            "#8bbc9960",
            1,
          );
      }),);
    nodes.forEach(([x, y], i) => ellipse(
        c,
        x,
        y,
        4 + Math.sin(time * 2 + i) * 1.5,
        4,
        s.recursive ? "#f1bc72" : "#bcf0c8",
      ),);
    for (let i = 0; i < s.compute; i++) {
      const x = 325 + (i % 4) * 76 - Math.floor(i / 4) * 82;
      const y = 155 + (i % 4) * 34 + Math.floor(i / 4) * 40;
      isoBox(c, x, y, 49, 35, 83, "#d3e4d9");
      for (let k = 0; k < 5; k++) {
        line(
          c,
          [
            [x - 28, y + 28 + k * 12],
            [x + 6, y + 43 + k * 12],
          ],
          "#325c55",
          6,
        );
        ellipse(
          c,
          x - 20,
          y + 31 + k * 12,
          2,
          2,
          Math.sin(time * 3 + i + k) > 0 ? "#c9f29e" : "#619780",
        );
      }
    }
    isoBox(c, 592, 262, 113, 63, 35, "#ddbd8e");
    box(c, 599, 238, 46, 34, "#264c44", 4);
    line(
      c,
      [
        [607, 260],
        [615, 250],
        [624, 255],
        [638, 244],
      ],
      "#abe1ba",
      2,
    );
    person(c, 604, 332, "#e7af7c", time);
    person(c, 693, 307, "#faf7e9", -time);
    person(c, 379 + Math.sin(time * 0.35) * 28, 369, "#527667", time * 3);
    label(
      c,
      `模型 ${s.product ? `v${Math.floor(s.product / 10)} · 已发布` : "尚未发布"}`,
      650,
      140,
      15,
    );
    label(
      c,
      s.recursive ? "递归研究运行中" : "训练集群在线",
      650,
      166,
      13,
      "#577669",
    );
  } else {
    const count = s.player.fabs;
    for (let i = 0; i < count; i++) {
      const x = 339 + (i % 3) * 116 - Math.floor(i / 3) * 120;
      const y = 167 + (i % 3) * 52 + Math.floor(i / 3) * 58;
      isoBox(c, x, y, 93, 72, 60, "#f3f3db");
      isoBox(c, x + 17, y - 19, 45, 35, 19, "#c8d9cf");
      for (let k = 0; k < 4; k++) line(
          c,
          [
            [x - 61 + k * 17, y + 47 + k * 8],
            [x - 61 + k * 17, y + 74 + k * 8],
          ],
          "#e5f5d5",
          8,
        );
      label(c, `FAB ${i + 1}`, x - 20, y + 20, 12, "#3f6258");
      if (s.production > 0) for (let k = 0; k < 3; k++) ellipse(
            c,
            x + 17,
            y - 27 - ((time * 10 + k * 13) % 42),
            6 + k * 2,
            4 + k,
            "#ffffff70",
          );
    }
    if (s.player.building) {
      line(
        c,
        [
          [640, 260],
          [640, 140],
          [733, 140],
          [733, 155],
        ],
        "#be9557",
        6,
      );
      line(
        c,
        [
          [643, 140],
          [688, 115],
          [728, 140],
        ],
        "#be9557",
        3,
      );
      line(
        c,
        [
          [716, 143],
          [716, 234],
        ],
        "#826a4c",
        2,
      );
      label(c, `建设中 · ${s.player.building} 季`, 679, 265, 13);
    }
    const stacks = Math.min(18, Math.ceil(s.player.inventory / 10));
    for (let i = 0; i < stacks; i++) isoBox(
        c,
        550 + (i % 6) * 27,
        370 - Math.floor(i / 6) * 18 + (i % 6) * 5,
        21,
        16,
        15,
        "#dcc8a0",
      );
    person(c, 233, 333, "#f7f8ec", time);
    person(c, 525, 337, "#f7f8ec", time + 2);
    box(c, 107, 106, 113, 82, "#eaf4e6", 8);
    ellipse(c, 162, 142, 25, 25, "#aac8b2");
    for (let i = 0; i < 5; i++) line(
        c,
        [
          [142 + i * 10, 124],
          [142 + i * 10, 160],
        ],
        "#eaf4e6",
        2,
      );
    label(c, "晶圆生产基地", 112, 206, 14);
  }
  // Trees anchor the sandbox and keep scale legible.
  for (const [x, y] of [
    [180, 265],
    [772, 356],
    [474, 437],
  ]) {
    ellipse(c, x, y + 28, 23, 8, "#2d554016");
    box(c, x - 3, y, 6, 30, "#927553");
    ellipse(c, x, y - 2, 22, 28, "#80a589");
    ellipse(c, x - 7, y - 6, 15, 20, "#a4bea0");
  }
  label(
    c,
    ai ? "01 / RESEARCH CAMPUS" : "02 / SILICON VALLEY",
    35,
    474,
    12,
    "#5c796a",
  );
  label(c, `Q${String(s.turn).padStart(2, "0")}`, 848, 475, 27, "#587261");
}
function heart(c: Ctx, x: number, y: number, size: number, color: string) {
  c.fillStyle = color;
  c.beginPath();
  c.moveTo(x, y + size * 0.75);
  c.bezierCurveTo(x - size * 1.3, y, x - size * 0.7, y - size, x, y - size * 0.35);
  c.bezierCurveTo(x + size * 0.7, y - size, x + size * 1.3, y, x, y + size * 0.75);
  c.fill();
}

function suiStreamer(c: Ctx, s: SnackState, time: number) {
  const eating = s.inputs.eat && s.phase === "playing";
  const talking = s.inputs.talk && !s.inputs.mute && !s.chewing;
  const blink = time % 5 > 4.8 || s.phase === "won" || s.phase === "ending";
  const bob = s.phase === "playing" ? Math.sin(time * 3) * 2 : 0;
  c.save();
  c.translate(0, bob);
  c.lineCap = "round";
  c.lineJoin = "round";
  ellipse(c, 488, 329, 137, 169, "#b7a3c3");
  ellipse(c, 484, 239, 116, 137, "#bbb6ce");

  // The loose, curled twin tails sway independently of the face and cap.
  for (const side of [-1, 1]) {
    c.save();
    c.translate(484 + side * 86, 203);
    c.scale(side, 1);
    c.rotate(Math.sin(time * 2 + side) * 0.014);
    c.fillStyle = "#dcd9eb";
    c.beginPath();
    c.moveTo(0, -23);
    c.bezierCurveTo(57, -25, 61, 48, 42, 81);
    c.bezierCurveTo(14, 113, 69, 124, 36, 158);
    c.bezierCurveTo(23, 174, 50, 180, 27, 190);
    c.bezierCurveTo(-6, 178, 12, 159, 8, 144);
    c.bezierCurveTo(-19, 119, 8, 80, -5, 51);
    c.bezierCurveTo(-19, 19, -13, -11, 0, -23);
    c.fill();
    c.strokeStyle = "#b0a9c7";
    c.lineWidth = 3;
    c.stroke();
    c.strokeStyle = "#fbf6ff";
    c.lineWidth = 7;
    c.beginPath();
    c.moveTo(11, -12);
    c.bezierCurveTo(38, 18, 32, 54, 21, 75);
    c.bezierCurveTo(4, 107, 43, 127, 25, 146);
    c.stroke();
    c.strokeStyle = "#aea5c8";
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(30, 2);
    c.bezierCurveTo(54, 64, 3, 70, 18, 106);
    c.bezierCurveTo(25, 122, 56, 136, 25, 153);
    c.bezierCurveTo(13, 161, 20, 174, 31, 177);
    c.stroke();
    line(c, [[2, -6], [21, -19], [18, 3], [35, 14]], "#494354", 10);
    line(c, [[14, 73], [25, 80], [32, 69]], "#b092d7", 4);
    line(c, [[21, 124], [34, 129], [39, 118]], "#b092d7", 4);
    c.restore();
  }

  // Lavender jacket, dark inset top, and Sui's heart jewellery.
  box(c, 381, 327, 208, 134, "#b499dc", 53);
  box(c, 428, 328, 112, 126, "#403b4d", 25);
  box(c, 462, 301, 44, 44, "#f6d7cd", 16);
  box(c, 459, 317, 50, 10, "#3d3947", 4);
  line(c, [[463, 333], [484, 352], [505, 333]], "#4c4356", 4);
  heart(c, 484, 351, 8, "#d6c3bd");
  heart(c, 484, 350, 5, "#f6e8de");
  c.fillStyle = "#e1c7f3";
  c.beginPath();
  c.moveTo(429, 329);
  c.lineTo(444, 355);
  c.lineTo(418, 375);
  c.lineTo(440, 396);
  c.lineTo(431, 448);
  c.lineTo(398, 361);
  c.closePath();
  c.fill();
  c.beginPath();
  c.moveTo(538, 329);
  c.lineTo(525, 355);
  c.lineTo(550, 375);
  c.lineTo(529, 396);
  c.lineTo(537, 448);
  c.lineTo(569, 361);
  c.closePath();
  c.fill();
  line(c, [[421, 378], [439, 426]], "#f3e6fa", 3);
  line(c, [[547, 378], [531, 426]], "#f3e6fa", 3);
  heart(c, 484, 380, 14, "#d7bdc7");
  for (let i = 0; i < 3; i++) {
    line(c, [[471, 400 + i * 9], [498, 409 + i * 9]], "#b5a3c0", 2);
    line(c, [[498, 400 + i * 9], [471, 409 + i * 9]], "#b5a3c0", 2);
  }

  ellipse(c, 391, 249, 15, 22, "#f6d7cd");
  ellipse(c, 577, 249, 15, 22, "#f6d7cd");
  ellipse(c, 484, 239, 100, 101, "#ffeadf");
  c.fillStyle = "#e1deec";
  c.beginPath();
  c.moveTo(382, 224);
  c.bezierCurveTo(366, 101, 594, 91, 586, 216);
  c.lineTo(560, 244);
  c.lineTo(561, 198);
  c.bezierCurveTo(547, 218, 527, 222, 512, 224);
  c.lineTo(508, 195);
  c.lineTo(499, 226);
  c.bezierCurveTo(478, 224, 454, 212, 447, 194);
  c.lineTo(442, 222);
  c.lineTo(423, 192);
  c.bezierCurveTo(415, 211, 399, 222, 382, 224);
  c.fill();
  for (const [x, endX, endY] of [[429, 408, 214], [461, 476, 214], [490, 493, 216], [538, 530, 216], [568, 565, 231]]) {
    c.strokeStyle = "#beb6cf";
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(x, 168);
    c.quadraticCurveTo(x - 6, 194, endX, endY);
    c.stroke();
  }
  for (const x of [443, 527]) {
    if (blink) {
      line(c, [[x - 16, 243], [x, 237], [x + 15, 243]], "#574454", 4);
    } else {
      ellipse(c, x, 245, 18, 21, "#fffdf8");
      ellipse(c, x + (eating ? 3 : 0), 247, 12, 17, "#d65d5c");
      ellipse(c, x + (eating ? 3 : 0), 252, 10, 10, "#f49269");
      ellipse(c, x + (eating ? 3 : 0), 245, 6, 12, "#713448");
      ellipse(c, x + 5, 239, 5, 5, "#fffaf5");
      ellipse(c, x - 5, 255, 2, 2, "#ffe8cb");
      line(c, [[x - 19, 230], [x - 11, 226], [x + 6, 226], [x + 18, 234]], "#574454", 4);
      line(c, [[x - 16, 230], [x - 21, 225]], "#574454", 3);
    }
    ellipse(c, x, 275, 21, 8, "#efb0b16b");
    for (let i = 0; i < 3; i++) line(c, [[x - 8 + i * 7, 272], [x - 10 + i * 7, 278]], "#eaa6ac80", 1);
  }
  line(c, [[482, 269], [479, 273], [483, 273]], "#e8bcb0", 1.5);
  if (eating || s.chewing > 0) {
    ellipse(c, 484, 287, 6, 4, "#bb7884");
    ellipse(c, 551, 278, 15 + Math.sin(time * 14) * 2, 13, "#f5cfc6");
  } else if (talking) {
    ellipse(c, 484, 288, 10, 6 + (Math.sin(time * 18) + 1) * 5, "#b66f7c");
    ellipse(c, 484, 292, 6, 3, "#eea4a4");
  } else line(c, [[475, 285], [484, 290], [494, 285]], "#b77d89", 2);
  for (const side of [-1, 1]) {
    c.strokeStyle = "#eee9f8";
    c.lineWidth = 5;
    c.beginPath();
    c.moveTo(484 + side * 90, 211);
    c.bezierCurveTo(484 + side * 85, 274, 484 + side * 91, 322, 484 + side * 69, 337);
    c.stroke();
  }
  line(c, [[579, 269], [579, 287]], "#a894c8", 2);
  heart(c, 579, 289, 5, "#ca9dcf");
  heart(c, 563, 222, 6, "#91c1cc");
  heart(c, 563, 221, 3, "#f6eaff");

  // Cat ears and the low, curved baseball-cap brim define the silhouette.
  c.fillStyle = "#514a61";
  c.beginPath();
  c.moveTo(385, 149);
  c.quadraticCurveTo(373, 118, 382, 85);
  c.quadraticCurveTo(406, 84, 435, 114);
  c.lineTo(533, 115);
  c.quadraticCurveTo(570, 86, 593, 99);
  c.quadraticCurveTo(590, 131, 577, 158);
  c.closePath();
  c.fill();
  c.fillStyle = "#c494eb";
  c.beginPath();
  c.moveTo(391, 128);
  c.lineTo(391, 98);
  c.lineTo(419, 121);
  c.moveTo(550, 128);
  c.lineTo(582, 109);
  c.lineTo(574, 141);
  c.fill();
  c.fillStyle = "#585064";
  c.beginPath();
  c.moveTo(379, 185);
  c.bezierCurveTo(379, 84, 568, 77, 586, 174);
  c.lineTo(580, 199);
  c.quadraticCurveTo(491, 182, 379, 199);
  c.closePath();
  c.fill();
  c.fillStyle = "#70667d";
  c.beginPath();
  c.moveTo(489, 106);
  c.quadraticCurveTo(545, 111, 572, 169);
  c.lineTo(509, 151);
  c.closePath();
  c.fill();
  line(c, [[491, 110], [484, 178]], "#443c53", 2);
  c.fillStyle = "#494254";
  c.beginPath();
  c.moveTo(383, 179);
  c.quadraticCurveTo(470, 169, 575, 190);
  c.lineTo(563, 211);
  c.quadraticCurveTo(521, 213, 487, 198);
  c.quadraticCurveTo(437, 190, 387, 197);
  c.quadraticCurveTo(378, 193, 383, 179);
  c.fill();
  line(c, [[395, 190], [449, 187], [487, 192]], "#7b6d89", 1.5);
  heart(c, 438, 152, 12, "#bfadcf");
  heart(c, 438, 150, 8, "#585064");
  line(c, [[413, 159], [460, 148], [455, 146]], "#a3c9dc", 2.5);
  label(c, "SUI", 533, 180, 14, "#b4a5c5");
  for (let i = 0; i < 3; i++) heart(c, 531 + i * 9, 201 + i * 2, 2.5, "#d6b7de");

  line(c, [[397, 380], [365, 435]], "#b499dc", 33);
  line(c, [[372, 418], [363, 434]], "#4e465e", 22);
  if (eating) {
    line(c, [[567, 391], [580, 345], [529, 307]], "#b499dc", 35);
    line(c, [[541, 316], [531, 308]], "#4e465e", 28);
    ellipse(c, 521, 303, 17, 14, "#ffeadf");
    if (s.selected === 0) box(c, 499, 280, 17, 19, "#fff4e5", 6);
    if (s.selected === 1) {
      ellipse(c, 508, 286, 13, 12, "#d1a066");
      for (const [dx, dy] of [[-4, -4], [4, 1], [-5, 5]]) ellipse(c, 508 + dx, 286 + dy, 2, 2, "#785142");
    }
    if (s.selected === 2) ellipse(c, 508, 287, 15, 7, "#edc16a");
    if (s.selected === 3) {
      ellipse(c, 508, 288, 13, 10, "#f5d5df");
      ellipse(c, 508, 282, 5, 3, "#c58da2");
    }
  } else {
    line(c, [[569, 380], [603, 435]], "#b499dc", 33);
    line(c, [[594, 418], [604, 434]], "#4e465e", 22);
  }
  c.restore();
}

function cookieCompanion(c: Ctx, time: number) {
  c.save();
  c.translate(788, 133 + Math.sin(time * 2) * 3);
  c.fillStyle = "#8d6caa";
  for (const side of [-1, 1]) {
    c.beginPath();
    c.moveTo(side * 17, 0);
    c.lineTo(side * 43, -14);
    c.lineTo(side * 38, 7);
    c.lineTo(side * 29, 2);
    c.lineTo(side * 25, 14);
    c.closePath();
    c.fill();
  }
  ellipse(c, 0, 0, 25, 28, "#eac387");
  ellipse(c, -8, -8, 3, 4, "#76514b");
  ellipse(c, 9, -8, 3, 4, "#76514b");
  line(c, [[-4, 2], [0, 5], [5, 2]], "#ae6d65", 2);
  ellipse(c, -14, 7, 5, 3, "#df9f8b");
  ellipse(c, 15, 7, 5, 3, "#df9f8b");
  for (const [x, y] of [[-15, -17], [11, 20], [-13, 18], [19, -1]]) ellipse(c, x, y, 4, 3, "#b28764");
  c.fillStyle = "#f4d399";
  c.beginPath();
  c.moveTo(-15, -23);
  c.lineTo(-18, -35);
  c.lineTo(-5, -30);
  c.lineTo(1, -39);
  c.lineTo(8, -30);
  c.lineTo(19, -33);
  c.lineTo(16, -21);
  c.fill();
  heart(c, -19, -23, 5, "#9f7cbc");
  c.restore();
}

function snack(c: Ctx, s: SnackState, time: number, skin: SnackSkin) {
  const sui = skin === "sui";
  const eating = s.inputs.eat && s.phase === "playing";
  const talking = s.inputs.talk && !s.inputs.mute && !s.chewing;
  box(c, 0, 0, 960, 520, sui ? "#e9e0ed" : "#eee0d7");
  box(c, 35, 32, 255, 290, sui ? "#cec1dc" : "#d8c4c0", 120);
  box(c, 49, 46, 227, 263, sui ? "#6e718e" : "#657a83", 110);
  ellipse(c, 206, 104, 32, 32, "#fff2ce");
  ellipse(c, 218, 95, 31, 31, sui ? "#6e718e" : "#657a83");
  for (const [x, y] of [
    [90, 96],
    [132, 166],
    [221, 222],
    [75, 239],
    [171, 70],
  ]) {
    label(c, "✦", x, y, 13, "#f0d5bc");
  }
  box(c, 335, 38, 523, 8, "#cba99d", 4);
  for (let i = 0; i < 9; i++) {
    line(
      c,
      [
        [370 + i * 55, 42],
        [370 + i * 55, 62 + Math.sin(i) * 12],
      ],
      "#ac8b7d",
      1,
    );
    ellipse(c, 370 + i * 55, 66 + Math.sin(i) * 12, 4, 6, "#fff5be");
  }
  box(c, 737, 210, 168, 9, "#ba9a88", 4);
  for (let i = 0; i < 5; i++) box(
      c,
      753 + i * 23,
      149 - (i % 2) * 10,
      17,
      61 + (i % 2) * 10,
      ["#b99c96", "#9eaba0", "#d3b683"][i % 3],
      2,
    );
  if (sui) cookieCompanion(c, time);
  else {
    ellipse(c, 788, 129, 21, 22, "#e0c4a6");
    ellipse(c, 774, 110, 9, 10, "#e0c4a6");
    ellipse(c, 803, 110, 9, 10, "#e0c4a6");
  }
  if (sui) suiStreamer(c, s, time);
  else {
    // Original cocoa-haired streamer, rendered as native vector shapes with live mouth/eyes/arms.
    const bob = s.phase === "playing" ? Math.sin(time * 3) * 2 : 0;
    c.save();
    c.translate(0, bob);
    ellipse(c, 488, 329, 137, 169, "#c19392");
    ellipse(c, 484, 253, 130, 153, "#72544e");
    ellipse(c, 359, 318, 35, 115, "#72544e");
    ellipse(c, 606, 318, 35, 115, "#72544e");
    box(c, 379, 327, 211, 134, "#adc4b4", 55);
    c.fillStyle = "#f4e9d5";
    c.beginPath();
    c.moveTo(437, 328);
    c.lineTo(486, 390);
    c.lineTo(538, 328);
    c.fill();
    line(
      c,
      [
        [484, 393],
        [461, 413],
        [482, 424],
        [484, 393],
        [507, 413],
        [487, 424],
      ],
      "#b77d75",
      9,
    );
    box(c, 462, 298, 46, 48, "#f4ccb0", 18);
    ellipse(c, 484, 235, 103, 103, "#ffe1c2");
    ellipse(c, 390, 246, 17, 23, "#f4ccb0");
    ellipse(c, 578, 246, 17, 23, "#f4ccb0");
    c.fillStyle = "#795952";
    c.beginPath();
    c.moveTo(381, 221);
    c.bezierCurveTo(355, 90, 618, 71, 590, 229);
    c.lineTo(545, 169);
    c.lineTo(541, 211);
    c.lineTo(480, 156);
    c.lineTo(459, 200);
    c.lineTo(438, 179);
    c.closePath();
    c.fill();
    line(
      c,
      [
        [404, 158],
        [422, 139],
        [448, 131],
      ],
      "#a77e6b",
      5,
    );
    const blink = time % 5 > 4.8 || s.phase === "won" || s.phase === "ending";
    for (const x of [443, 527]) {
      if (blink) line(
          c,
          [
            [x - 16, 243],
            [x, 237],
            [x + 15, 243],
          ],
          "#634947",
          4,
        );
      else {
        ellipse(c, x, 243, 16, 21, "#fffaf1");
        ellipse(c, x + (eating ? 4 : 0), 247, 11, 16, "#846446");
        ellipse(c, x + 3, 249, 6, 10, "#423f39");
        ellipse(c, x + 5, 240, 4, 5, "#fffdfa");
        line(
          c,
          [
            [x - 16, 226],
            [x, 223],
            [x + 15, 229],
          ],
          "#634947",
          4,
        );
      }
      ellipse(c, x, 276, 22, 8, "#f0b39d70");
    }
    if (eating || s.chewing > 0) {
      ellipse(c, 484, 287, 6, 4, "#c38275");
      ellipse(c, 551, 278, 15 + Math.sin(time * 14) * 2, 13, "#f8c9a9");
    } else if (talking) ellipse(c, 484, 288, 10, 6 + (Math.sin(time * 18) + 1) * 5, "#b6746c");
    else line(
        c,
        [
          [475, 285],
          [484, 290],
          [494, 285],
        ],
        "#ac7467",
        2,
      );
    box(c, 375, 207, 22, 67, "#b8897d", 11);
    box(c, 572, 207, 22, 67, "#b8897d", 11);
    c.strokeStyle = "#b8897d";
    c.lineWidth = 13;
    c.beginPath();
    c.arc(484, 223, 107, Math.PI, 0);
    c.stroke();
    label(c, "✿", 568, 206, 38, "#f0d49e");
    if (eating) {
      line(
        c,
        [
          [569, 395],
          [582, 344],
          [525, 300],
        ],
        "#adc4b4",
        34,
      );
      ellipse(c, 525, 300, 18, 15, "#ffe1c2");
    } else {
      line(
        c,
        [
          [398, 386],
          [365, 435],
        ],
        "#adc4b4",
        32,
      );
      line(
        c,
        [
          [568, 386],
          [603, 435],
        ],
        "#adc4b4",
        32,
      );
    }
    c.restore();
  }
  box(c, 0, 424, 960, 96, "#c99f85");
  box(c, 0, 424, 960, 9, "#e2bfa3");
  box(c, 127, 378, 115, 75, sui ? "#a99abd" : "#a6b8b0", 7);
  box(c, 121, 449, 128, 8, sui ? "#7b6d94" : "#68877e", 4);
  label(c, "ON AIR", 157, 414, 14, "#f4f6e9");
  line(
    c,
    [
      [672, 449],
      [672, 331],
    ],
    "#5b6c64",
    7,
  );
  ellipse(c, 672, 448, 39, 8, "#5b6c64");
  box(c, 651, 290, 42, 82, s.inputs.mute ? "#b8887a" : sui ? "#827297" : "#637a71", 21);
  for (let i = 0; i < 5; i++) line(
      c,
      [
        [659, 309 + i * 10],
        [685, 309 + i * 10],
      ],
      "#a9b6a5",
      2,
    );
  for (let i = 0; i < 4; i++) {
    const x = 320 + i * 88;
    ellipse(c, x, 476, 38, 14, "#f5e6ca");
    if (s.remaining[i] > 0) {
      if (i === 0) {
        box(c, x - 21, 445, 23, 29, "#fff2df", 8);
        box(c, x + 1, 448, 24, 27, "#e9b8b2", 8);
      }
      if (i === 1) {
        ellipse(c, x, 461, 26, 18, "#bd8c58");
        for (const [dx, dy] of [
          [-12, -4],
          [5, 6],
          [13, -7],
        ]) ellipse(c, x + dx, 461 + dy, 3, 3, "#6c5142");
      }
      if (i === 2) {
        for (let k = 0; k < 4; k++) ellipse(c, x - 10 + k * 6, 458 - k * 4, 18, 10, "#e5b454");
      }
      if (i === 3) {
        ellipse(c, x, 459, 23, 17, "#f2d7cf");
        ellipse(c, x, 452, 8, 5, "#b87d78");
      }
    }
    label(c, `${s.remaining[i]}`, x - 4, 506, 15, "#614f45");
    if (s.selected === i) line(
        c,
        [
          [x - 30, 490],
          [x + 30, 490],
        ],
        "#755b4b",
        3,
      );
  }
  if (snackCover(s).active && s.phase === "playing") {
    label(c, "♪", 303, 191, 36, "#98715b");
    label(c, "♫", 660, 218, 30, "#98715b");
  }
  label(c, sui ? "03 / SUI · MIDNIGHT MUNCH" : "03 / MIDNIGHT MUNCH", 34, 490, 12, "#745b4c");
  if (eating) label(c, SNACKS[s.selected].name, 716, 391, 15, "#806252");
}
export function drawScene(
  canvas: HTMLCanvasElement,
  state: GameState,
  time: number,
  skin: SnackSkin = "original",
) {
  const c = canvas.getContext("2d");
  if (!c) return;
  canvas.width = 960;
  canvas.height = 520;
  if (state.kind === "snack") snack(c, state, time, skin);
  else business(c, state, time);
}
