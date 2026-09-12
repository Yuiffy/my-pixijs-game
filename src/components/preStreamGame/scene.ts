import { ActivityState, GameState, TaskId } from './types';

type Context = CanvasRenderingContext2D;
const C = {
  ink: '#4d3d5b',
paper: '#fff9ed',
cream: '#f4e5ca',
peach: '#f4b49a',
  purple: '#9c83c1',
lilac: '#d5c3e4',
pale: '#eae0f0',
dark: '#645077',
  mint: '#a4c9b6',
green: '#5d8c76',
blue: '#a8cde1',
yellow: '#edcb79',
red: '#bd647d',
};

export const STATIONS: Array<{ id: TaskId; x: number; y: number; label: string }> = [
  { id: 'water', x: 113, y: 221, label: '接水喝' },
  { id: 'toilet', x: 111, y: 383, label: '上厕所' },
  { id: 'food', x: 286, y: 223, label: '准备吃的' },
  { id: 'cat', x: 326, y: 453, label: '给猫加餐' },
  { id: 'audio', x: 561, y: 304, label: '调声卡' },
  { id: 'vts', x: 704, y: 192, label: '打开 VTS' },
  { id: 'obs', x: 846, y: 192, label: '准备 OBS' },
];

function rounded(ctx: Context, x: number, y: number, w: number, h: number, radius: number | number[], fill: string, stroke?: string, width = 2) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
}

function ellipse(ctx: Context, x: number, y: number, rx: number, ry: number, fill: string, stroke?: string, width = 2) {
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
}

function line(ctx: Context, points: number[][], color: string, width = 2) {
  ctx.beginPath(); points.forEach(([x, y], index) => { if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
}

function polygon(ctx: Context, points: number[][], fill: string, stroke?: string, width = 2) {
  ctx.beginPath(); points.forEach(([x, y], index) => { if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }); ctx.closePath();
  ctx.fillStyle = fill; ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.lineJoin = 'round'; ctx.stroke(); }
}

function words(ctx: Context, value: string, x: number, y: number, size = 16, color: string = C.ink, align: CanvasTextAlign = 'center', weight = 700) {
  ctx.fillStyle = color; ctx.font = `${weight} ${size}px "Microsoft YaHei", "PingFang SC", sans-serif`; ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillText(value, x, y);
}

function star(ctx: Context, x: number, y: number, size: number, color: string = C.yellow) {
  polygon(ctx, Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 ? size * 0.46 : size;
    return [x + (Math.cos(((i * Math.PI) / 5) - (Math.PI / 2)) * r), y + (Math.sin(((i * Math.PI) / 5) - (Math.PI / 2)) * r)];
  }), color);
}

/** Original vector character art: silver hair, violet cat-ear hat and ruby eyes. */
function sui(ctx: Context, x: number, y: number, scale: number, time: number, happy = false, bust = false) {
  const bob = Math.sin(time / 720) * 2;
  ctx.save(); ctx.translate(x, y + bob); ctx.scale(scale, scale);
  if (!bust) {
    ellipse(ctx, 0, 79, 51, 9, '#4d3d5b18');
    rounded(ctx, -31, 35, 24, 45, 11, '#f7dfd4', C.ink);
    rounded(ctx, 7, 35, 24, 45, 11, '#f7dfd4', C.ink);
    rounded(ctx, -38, 67, 34, 17, 8, C.dark, C.ink);
    rounded(ctx, 4, 67, 34, 17, 8, C.dark, C.ink);
    rounded(ctx, -29, 51, 20, 15, 2, C.paper);
    rounded(ctx, 9, 51, 20, 15, 2, C.paper);
  }
  // Two long, soft silver side locks frame the dark hoodie.
  ellipse(ctx, -39, -32, 22, 81, '#ece9f3', C.ink, 2.6);
  ellipse(ctx, 39, -32, 22, 81, '#ece9f3', C.ink, 2.6);
  polygon(ctx, [[-46, -1], [-60, 39], [-35, 24], [-33, -8]], '#d9d4e8');
  polygon(ctx, [[46, -1], [60, 39], [35, 24], [33, -8]], '#d9d4e8');
  rounded(ctx, -42, -15, 84, 72, 25, C.dark, C.ink, 2.5);
  polygon(ctx, [[-34, -8], [-23, -22], [0, -10], [22, -22], [36, -7], [14, 14], [-13, 14]], '#8a70a7', C.ink, 2);
  line(ctx, [[-13, 8], [-13, 27]], C.paper, 2); line(ctx, [[13, 8], [13, 27]], C.paper, 2);
  rounded(ctx, -20, 27, 40, 20, 9, '#756184', '#a28cb4', 1.5);
  rounded(ctx, -54, 0, 25, 51, 12, C.dark, C.ink, 2);
  rounded(ctx, 29, 0, 25, 51, 12, C.dark, C.ink, 2);
  ellipse(ctx, -42, 44, 10, 10, '#ffe5d9', C.ink, 1.8);
  ellipse(ctx, 42, 44, 10, 10, '#ffe5d9', C.ink, 1.8);
  ellipse(ctx, 0, -69, 52, 58, '#f9f7fc', C.ink, 2.5);
  ellipse(ctx, 0, -57, 42, 41, '#ffe8dd', C.ink, 2);
  // Hair fringe with characteristic outward tufts.
  polygon(ctx, [[-45, -94], [-31, -115], [4, -113], [37, -101], [48, -76], [34, -83], [38, -56], [18, -71], [9, -99], [2, -69], [-10, -77], [-16, -96], [-32, -65], [-37, -76], [-48, -66]], '#faf9ff', C.ink, 2);
  line(ctx, [[-23, -104], [-29, -85]], '#cbc5df', 2);
  line(ctx, [[25, -99], [31, -84]], '#cbc5df', 2);
  if (happy) {
    ctx.beginPath(); ctx.arc(-17, -54, 8, Math.PI * 1.14, Math.PI * 1.87); ctx.arc(17, -54, 8, Math.PI * 1.14, Math.PI * 1.87); ctx.strokeStyle = C.ink; ctx.lineWidth = 3; ctx.stroke();
  } else {
    ellipse(ctx, -17, -55, 8, 10, '#fffdf9'); ellipse(ctx, 17, -55, 8, 10, '#fffdf9');
    ellipse(ctx, -16, -54, 5.5, 8, '#bd526d'); ellipse(ctx, 18, -54, 5.5, 8, '#bd526d');
    ellipse(ctx, -15, -55, 2.5, 5.5, '#73334c'); ellipse(ctx, 19, -55, 2.5, 5.5, '#73334c');
    ellipse(ctx, -18, -58, 2.3, 2.7, C.paper); ellipse(ctx, 16, -58, 2.3, 2.7, C.paper);
    line(ctx, [[-25, -61], [-20, -65], [-13, -64]], C.ink, 2.5); line(ctx, [[10, -64], [18, -65], [25, -61]], C.ink, 2.5);
  }
  ellipse(ctx, -28, -40, 9, 4.2, '#efb3b5'); ellipse(ctx, 28, -40, 9, 4.2, '#efb3b5');
  ctx.beginPath(); ctx.arc(0, -40, 6, 0.13, Math.PI - 0.13); ctx.strokeStyle = '#b6667a'; ctx.lineWidth = 2; ctx.stroke();
  // Hat silhouette remains legible at room scale.
  polygon(ctx, [[-52, -101], [-56, -144], [-28, -131], [-7, -134], [23, -131], [51, -147], [52, -104]], '#8d73b0', C.ink, 2.5);
  polygon(ctx, [[-49, -136], [-44, -113], [-31, -126]], C.lilac);
  polygon(ctx, [[43, -137], [31, -126], [45, -114]], C.lilac);
  rounded(ctx, -56, -112, 112, 23, 10, '#ad91cb', C.ink, 2.5);
  line(ctx, [[-40, -107], [-40, -96]], '#cbb5df', 2); line(ctx, [[-30, -107], [-30, -96]], '#cbb5df', 2);
  star(ctx, 24, -102, 8, C.paper); ellipse(ctx, 40, -99, 3, 3, C.peach);
  ctx.restore();
}

function cat(ctx: Context, x: number, y: number, scale: number, time: number, happy = false) {
  ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
  ellipse(ctx, 0, 23, 42, 8, '#4d3d5b13');
  ctx.beginPath(); ctx.moveTo(23, 15); ctx.bezierCurveTo(56, 12, 49 + (Math.sin(time / 420) * 7), -31, 35, -22); ctx.strokeStyle = C.ink; ctx.lineWidth = 14; ctx.lineCap = 'round'; ctx.stroke();
  ctx.strokeStyle = '#d1b091'; ctx.lineWidth = 10; ctx.stroke();
  ellipse(ctx, 0, 3, 30, 24, '#d8b79a', C.ink, 2);
  ellipse(ctx, -9, -19, 28, 25, '#e2c4a8', C.ink, 2);
  polygon(ctx, [[-32, -30], [-31, -51], [-13, -39]], '#e2c4a8', C.ink, 2);
  polygon(ctx, [[3, -40], [20, -51], [17, -25]], '#e2c4a8', C.ink, 2);
  polygon(ctx, [[-28, -43], [-26, -32], [-18, -37]], '#dda1a4'); polygon(ctx, [[7, -37], [15, -44], [13, -32]], '#dda1a4');
  ellipse(ctx, -9, -10, 14, 10, '#fff1dc');
  if (happy) { words(ctx, '⌒ ⌒', -9, -23, 15); } else { ellipse(ctx, -21, -23, 2.3, 4, C.ink); ellipse(ctx, 3, -23, 2.3, 4, C.ink); }
  polygon(ctx, [[-12, -14], [-6, -14], [-9, -10]], '#b67275');
  line(ctx, [[-31, -13], [-43, -16]], C.ink, 1.5); line(ctx, [[-30, -9], [-43, -8]], C.ink, 1.5);
  line(ctx, [[12, -13], [25, -16]], C.ink, 1.5); line(ctx, [[12, -9], [25, -8]], C.ink, 1.5);
  rounded(ctx, -24, 15, 18, 10, 5, '#fff1dc', C.ink, 1.5); rounded(ctx, 5, 15, 18, 10, 5, '#fff1dc', C.ink, 1.5);
  ctx.restore();
}

function plant(ctx: Context, x: number, y: number, scale = 1) {
  ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
  line(ctx, [[0, 0], [0, -61]], C.green, 3);
  for (let i = 0; i < 5; i++) {
    ctx.save(); ctx.translate(0, -20 - (i * 10)); ctx.rotate(i % 2 ? 0.7 : -0.7); ellipse(ctx, i % 2 ? 9 : -9, -3, 14, 6, i % 2 ? '#94bca2' : '#719f83'); ctx.restore();
  }
  polygon(ctx, [[-17, -1], [17, -1], [12, 26], [-12, 26]], C.peach, C.ink, 1.5);
  rounded(ctx, -19, -4, 38, 8, 3, '#f1c2a7', C.ink, 1.5); ctx.restore();
}

function bowl(ctx: Context, x: number, y: number, scale: number, filled: boolean) {
  ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
  ellipse(ctx, 0, 17, 45, 7, '#4d3d5b13');
  polygon(ctx, [[-33, -3], [33, -3], [40, 17], [-40, 17]], C.peach, C.ink, 2);
  ellipse(ctx, 0, -2, 33, 10, '#fff4de', C.ink, 2);
  ellipse(ctx, 0, -1, 25, 6, filled ? '#a47c5c' : '#ddc9ac');
  if (filled) for (let i = 0; i < 11; i++) ellipse(ctx, ((i * 13) % 43) - 21, ((i * 7) % 8) - 5, 3.5, 2.5, i % 2 ? '#bf9067' : '#815d46');
  words(ctx, '♥', 0, 11, 13, '#fff5e8'); ctx.restore();
}

function monitor(ctx: Context, x: number, y: number, w: number, h: number, kind: 'vts' | 'obs', ready: boolean, time: number) {
  rounded(ctx, (x + (w / 2)) - 7, y + h, 14, 26, 3, '#ad96bc', C.ink);
  rounded(ctx, (x + (w / 2)) - 29, y + h + 21, 58, 7, 3, '#baa8c8', C.ink);
  rounded(ctx, x, y, w, h, 8, C.ink, C.ink);
  rounded(ctx, x + 5, y + 5, w - 10, h - 13, 4, kind === 'vts' ? '#ded4ec' : '#efe7d8');
  if (kind === 'vts') {
    ctx.save(); ctx.beginPath(); ctx.rect(x + 6, y + 6, w - 12, h - 15); ctx.clip();
    for (let i = 0; i < 4; i++) ellipse(ctx, x + 22 + (i * 32), y + 35, 22, 45, '#ffffff25');
    sui(ctx, x + (w / 2), (y + h) - 5, 0.44, time, ready, true); ctx.restore();
    rounded(ctx, x + 10, y + 10, 23, 10, 3, ready ? C.mint : '#b4a1c8');
    words(ctx, ready ? 'ON' : 'VTS', x + 21, y + 15, 7, C.ink);
  } else {
    rounded(ctx, x + 11, y + 11, w - 22, h - 45, 2, '#c4b4d4');
    rounded(ctx, x + 18, y + 18, w - 48, h - 61, 2, '#e9ddd0');
    ellipse(ctx, (x + w) - 28, (y + h) - 57, 11, 12, '#f4dfd5');
    rounded(ctx, x + 12, (y + h) - 30, 37, 13, 2, '#d0c4b4');
    for (let i = 0; i < 5; i++) rounded(ctx, x + 57 + (i * 8), (y + h) - 26 - ((i * 7) % 11), 5, 14 + ((i * 7) % 11), 1, ready ? '#88b695' : '#c7b9cf');
    ellipse(ctx, (x + w) - 16, y + 16, 3, 3, ready ? '#b95b73' : '#fff5eb');
  }
  ellipse(ctx, x + (w / 2), (y + h) - 4, 1.7, 1.7, ready ? C.mint : '#b5a8c4');
}

function room(ctx: Context, state: GameState, time: number) {
  const done = (id: TaskId) => state.completed.some(item => item.id === id);
  ctx.fillStyle = C.paper; ctx.fillRect(0, 0, 960, 540);
  // The sunlit wall and wooden floor make a single coherent room.
  ctx.fillStyle = '#f7ecdb'; ctx.fillRect(0, 0, 960, 362);
  ctx.fillStyle = '#dfc9b3'; ctx.fillRect(0, 362, 960, 178);
  polygon(ctx, [[0, 362], [960, 362], [960, 540], [0, 540]], '#e8d4bc');
  for (let i = 0; i < 8; i++) line(ctx, [[(i * 145) - 80, 362], [(i * 185) - 220, 540]], '#d7bda54d', 2);
  line(ctx, [[0, 425], [960, 425]], '#d7bda575', 2); line(ctx, [[0, 499], [960, 499]], '#d7bda575', 2);
  rounded(ctx, 0, 353, 960, 13, 0, '#d0b49c'); line(ctx, [[0, 353], [960, 353]], '#ad8c7929', 2);
  // Sunlight through an arched window.
  rounded(ctx, 217, 28, 167, 153, [70, 70, 6, 6], '#e4cbb3', '#beaa99', 2);
  rounded(ctx, 226, 37, 149, 135, 61, '#bfd7dc');
  ctx.save(); ctx.beginPath(); ctx.roundRect(226, 37, 149, 135, 61); ctx.clip();
  ellipse(ctx, 348, 68, 23, 23, '#fff0ba');
  ellipse(ctx, 266, 116, 66, 17, '#ecf4e5'); ellipse(ctx, 355, 143, 62, 30, '#a9c9b3');
  line(ctx, [[301, 30], [301, 178]], '#fff5e5', 7); line(ctx, [[217, 108], [384, 108]], '#fff5e5', 6); ctx.restore();
  rounded(ctx, 208, 170, 185, 12, 4, '#ceac8e', C.ink, 1.5);
  polygon(ctx, [[221, 183], [382, 183], [500, 353], [336, 353]], '#ffeabd20');
  plant(ctx, 370, 153, 0.58);
  // A clock, print and hanging pendant bring life to the empty wall.
  ellipse(ctx, 471, 73, 33, 33, '#e9d6bb', C.ink, 2); ellipse(ctx, 471, 73, 28, 28, '#fff8e8');
  line(ctx, [[471, 56], [471, 73], [484, 78]], C.dark, 2.5); ellipse(ctx, 471, 73, 3, 3, C.dark);
  for (let i = 0; i < 12; i++) ellipse(ctx, 471 + (Math.sin((i * Math.PI) / 6) * 23), 73 - (Math.cos((i * Math.PI) / 6) * 23), 1.1, 1.1, '#baaa98');
  line(ctx, [[96, 0], [96, 47]], C.ink, 2);
  polygon(ctx, [[73, 44], [119, 44], [137, 75], [55, 75]], C.yellow, C.ink, 2);
  ellipse(ctx, 96, 76, 39, 7, '#ffe2a0', C.ink, 1.5);
  rounded(ctx, 568, 34, 76, 83, 3, '#e1c1a8', C.ink, 2); rounded(ctx, 575, 41, 62, 69, 1, '#fff8e9');
  star(ctx, 606, 68, 16, '#c2afd7'); words(ctx, 'TAKE IT', 606, 91, 8); words(ctx, 'SUI', 606, 102, 7, '#9b8384');
  line(ctx, [[720, 32], [879, 32]], '#ac9682', 2);
  for (let i = 0; i < 6; i++) { const yy = 35 + (Math.sin((i / 5) * Math.PI) * 14); line(ctx, [[731 + (i * 27), 32], [731 + (i * 27), yy + 8]], '#ac9682', 1); ellipse(ctx, 731 + (i * 27), yy + 9, 4, 6, i % 2 ? C.yellow : C.peach); }
  // Kitchen: low cabinetry, sink, kettle and a snack board.
  rounded(ctx, 28, 249, 339, 98, 6, '#abc0b1', C.ink, 2);
  rounded(ctx, 38, 263, 94, 72, 3, '#b7cab9', '#829f8c', 1.5); rounded(ctx, 143, 263, 94, 72, 3, '#b7cab9', '#829f8c', 1.5); rounded(ctx, 248, 263, 108, 72, 3, '#b7cab9', '#829f8c', 1.5);
  for (const xx of [106, 210, 328]) rounded(ctx, xx, 273, 13, 5, 2, '#557e69');
  rounded(ctx, 20, 238, 355, 18, 5, '#f3dab4', C.ink, 2); ellipse(ctx, 115, 240, 63, 9, '#94adb0', C.ink, 1.5); ellipse(ctx, 115, 239, 50, 5, '#c1d6d4');
  ctx.beginPath(); ctx.moveTo(80, 230); ctx.lineTo(80, 200); ctx.bezierCurveTo(80, 177, 111, 177, 111, 201); ctx.strokeStyle = '#b8bbad'; ctx.lineWidth = 9; ctx.stroke();
  line(ctx, [[79, 221], [63, 221]], C.ink, 2); rounded(ctx, 150, 195, 23, 42, 5, '#fff9eb', C.ink, 1.5);
  rounded(ctx, 153, 213, 17, 22, 2, done('water') ? '#a3cee0' : '#d1e3e0');
  ellipse(ctx, 163, 196, 11, 3, '#d8d3cf', C.ink, 1);
  rounded(ctx, 218, 227, 103, 10, 5, '#c4956d', C.ink, 1.5);
  ellipse(ctx, 260, 224, 20, 6, '#fff6df'); rounded(ctx, 240, 207, 39, 17, 5, '#e5b879', C.ink, 1.5); rounded(ctx, 245, 203, 29, 8, 4, '#9eb989');
  if (done('food')) { line(ctx, [[247, 207], [255, 219]], '#b68750', 1); line(ctx, [[259, 207], [267, 219]], '#b68750', 1); }
  plant(ctx, 341, 221, 0.62);
  // Bathroom door is separate from kitchen, with a tiny privacy sign.
  rounded(ctx, 26, 367, 144, 159, 4, '#b3a1bc', C.ink, 2);
  rounded(ctx, 36, 378, 124, 148, 3, '#d9cce2', '#9782ab', 2);
  rounded(ctx, 71, 413, 53, 29, 6, '#eee4ed', '#b4a0bf', 1.5); words(ctx, 'WC', 97, 428, 14, C.dark);
  ellipse(ctx, 143, 459, 5, 5, C.yellow, C.ink, 1.5);
  rounded(ctx, 53, 500, 88, 26, 3, '#ac97b9');
  // A desk with different, recognisable workstations.
  rounded(ctx, 523, 304, 413, 16, 5, '#bb9277', C.ink, 2);
  rounded(ctx, 523, 297, 413, 14, 5, '#e2bd94', C.ink, 2);
  polygon(ctx, [[540, 321], [557, 321], [549, 422], [532, 422]], '#a68169', C.ink, 2);
  polygon(ctx, [[909, 321], [926, 321], [936, 422], [919, 422]], '#a68169', C.ink, 2);
  rounded(ctx, 859, 327, 52, 83, 5, '#b7a8c6', C.ink, 2); rounded(ctx, 867, 337, 36, 24, 4, C.dark); ellipse(ctx, 885, 384, 13, 13, '#d7c8e2', C.ink, 1.5);
  for (let i = 0; i < 5; i++) line(ctx, [[874, 342 + (i * 3)], [897, 342 + (i * 3)]], '#9b88aa', 1);
  monitor(ctx, 645, 203, 125, 72, 'vts', done('vts'), time); monitor(ctx, 786, 203, 125, 72, 'obs', done('obs'), time);
  rounded(ctx, 675, 295, 134, 10, 3, '#c7b8d3', C.ink, 1.3);
  for (let i = 0; i < 13; i++) line(ctx, [[681 + (i * 9), 298], [681 + (i * 9), 302]], '#9d8dad', 1);
  ellipse(ctx, 827, 299, 10, 6, '#ddd0e8', C.ink, 1.3);
  rounded(ctx, 541, 279, 67, 22, 4, C.dark, C.ink, 1.5);
  for (let i = 0; i < 4; i++) { ellipse(ctx, 551 + (i * 14), 287, 3, 3, '#c9b9d8'); ellipse(ctx, 551 + (i * 14), 296, 1.8, 1.8, done('audio') ? C.mint : C.peach); }
  line(ctx, [[621, 295], [621, 241], [599, 224]], C.ink, 4); rounded(ctx, 587, 211, 16, 32, 8, '#b3a1c7', C.ink, 2); line(ctx, [[592, 216], [592, 230]], '#e6dceb', 2);
  // Soft ergonomic chair, rug, mascot and cat share the foreground.
  ellipse(ctx, 550, 467, 283, 46, '#d3bedf'); ellipse(ctx, 550, 467, 264, 37, '#e0cfe9');
  for (let i = 0; i < 11; i++) line(ctx, [[307 + (i * 48), 466 + (Math.sin(i) * 6)], [323 + (i * 48), 466 + (Math.sin(i) * 6)]], '#c1a8d199', 2);
  rounded(ctx, 682, 317, 101, 101, 29, '#a38abc', C.ink, 2.5);
  rounded(ctx, 693, 327, 79, 71, 23, '#b39dc9');
  rounded(ctx, 673, 405, 117, 20, 9, '#b8a3ce', C.ink, 2); line(ctx, [[729, 426], [729, 471], [687, 486]], C.ink, 5); line(ctx, [[729, 471], [773, 486]], C.ink, 5);
  ellipse(ctx, 687, 488, 8, 6, C.dark); ellipse(ctx, 773, 488, 8, 6, C.dark);
  sui(ctx, 465, 341, 1.04, time, state.phase === 'result');
  bowl(ctx, 327, 456, 0.95, done('cat')); cat(ctx, 250, 464, 1.06, time, done('cat'));
  plant(ctx, 910, 433, 1.1);
  rounded(ctx, 882, 472, 58, 32, 4, '#aabda4', C.ink, 1.5); words(ctx, 'SUI', 911, 488, 11, '#fff8e9');
  // Gentle animated dust and tiny personal belongings.
  for (let i = 0; i < 5; i++) { const xx = 407 + ((i * 67) % 126); const yy = 145 + (((i * 41) + (time / 150)) % 132); ellipse(ctx, xx, yy, 1.8, 1.8, '#ffffffb0'); }
  rounded(ctx, 548, 144, 57, 33, 1, '#f5d68d'); ctx.save(); ctx.translate(575, 160); ctx.rotate(-0.07); words(ctx, '马上就来', 0, 0, 10, '#927856'); ctx.restore();
  if (state.phase === 'result' || state.phase === 'countdown') {
    for (let i = 0; i < 9; i++) star(ctx, 340 + (i * 40), 155 + (Math.sin((time / 440) + i) * 13), 4 + (i % 3), i % 2 ? C.yellow : C.peach);
    rounded(ctx, 409, 138, 112, 31, 12, '#fff9ed', '#d5bbdf', 1.5); words(ctx, state.phase === 'result' ? '好，开播！' : '最后深呼吸…', 465, 154, 13, C.dark);
  }
}

function backdrop(ctx: Context, type: 'purple' | 'green' | 'peach' = 'purple') {
  const [wallColor, floorColor, highlightColor] = { purple: ['#f0e9f5', '#dcd0e7', '#e4d9ed'], green: ['#eef3e8', '#d2dfd0', '#dfe9d6'], peach: ['#fff0df', '#ecd3bb', '#f2e0cb'] }[type];
  ctx.fillStyle = wallColor; ctx.fillRect(0, 0, 960, 540);
  ellipse(ctx, 470, 296, 362, 205, highlightColor);
  ctx.fillStyle = floorColor; ctx.fillRect(0, 438, 960, 102); line(ctx, [[0, 438], [960, 438]], '#4d3d5b15', 2);
  for (let i = 0; i < 6; i++) star(ctx, 68 + (i * 163), 65 + ((i % 3) * 36), 5, '#ffffffb0');
}

function meter(ctx: Context, activity: ActivityState, level: number, x = 180, y = 466, w = 600, explicitRadius?: number) {
  const radii: Record<string, number> = { food: 11 - (level - 1), cat: 13 - ((level - 1) * 2), vts: 15 - ((level - 1) * 2), catwalk: 17 - ((level - 1) * 2), audio: 8 - (level - 1) };
  const radius = explicitRadius ?? radii[activity.id] ?? 12;
  rounded(ctx, x, y, w, 18, 9, '#fff9ed', '#b2a0ba', 1.7);
  const min = Math.max(0, activity.target - radius); const max = Math.min(100, activity.target + radius);
  rounded(ctx, x + ((min / 100) * w), y + 2, ((max - min) / 100) * w, 14, 6, '#97bea8');
  const cursorX = x + ((activity.cursor / 100) * w);
  rounded(ctx, cursorX - 4, y - 6, 8, 30, 4, C.dark, C.paper, 2);
  words(ctx, '0', x - 17, y + 10, 10, '#8c7697'); words(ctx, '100', x + w + 21, y + 10, 10, '#8c7697');
}

function progressDots(ctx: Context, hits: number, count: number, x: number, y: number) {
  for (let i = 0; i < count; i++) { ellipse(ctx, x + (i * 27), y, 8, 8, i < hits ? C.green : '#ffffffa0', i < hits ? C.green : '#bbaaaf', 1.5); if (i < hits) line(ctx, [[(x + (i * 27)) - 4, y], [(x + (i * 27)) - 1, y + 3], [x + (i * 27) + 4, y - 3]], C.paper, 1.5); }
}

function sequence(ctx: Context, a: ActivityState, x: number, y: number) {
  const symbol = { left: '←', right: '→', up: '↑', down: '↓', primary: '●' };
  const spacing = Math.min(66, 430 / a.sequence.length);
  a.sequence.forEach((key, i) => {
    const xx = x + ((i - ((a.sequence.length - 1) / 2)) * spacing);
    const done = i < a.stage; const current = i === a.stage;
    rounded(ctx, xx - 23, y - 23, 46, 46, 12, done ? '#b4d1bc' : current ? C.paper : '#ffffff50', current ? C.dark : done ? C.green : '#c9b7c9', current ? 3 : 1.5);
    words(ctx, done ? '✓' : symbol[key], xx, y - 1, 28, done ? C.green : current ? C.dark : '#ac98b2');
  });
}

function water(ctx: Context, a: ActivityState, time: number) {
  backdrop(ctx, 'green');
  rounded(ctx, 130, 387, 700, 32, 12, '#f3dab7', C.ink, 2);
  // The kettle and cup remain stable, so the fill line reads immediately.
  ctx.save(); ctx.translate(308, 210); ctx.rotate(a.stage === 0 && a.progress > 0 ? 0.12 : 0);
  rounded(ctx, -84, -89, 143, 182, 44, '#b9d1bb', C.ink, 3); rounded(ctx, -67, -63, 109, 119, 36, '#cbdcc7');
  rounded(ctx, -46, -105, 71, 22, 9, '#8eb498', C.ink, 2.5); ellipse(ctx, -11, -111, 13, 8, '#d0decb', C.ink, 2);
  ctx.beginPath(); ctx.ellipse(-83, -10, 39, 49, 0, 0, Math.PI * 2); ctx.strokeStyle = C.ink; ctx.lineWidth = 20; ctx.stroke(); ctx.strokeStyle = '#99b99e'; ctx.lineWidth = 14; ctx.stroke();
  polygon(ctx, [[52, -46], [99, -77], [97, -50], [60, -4]], '#b9d1bb', C.ink, 2.5); words(ctx, 'SUI', -12, -5, 19, '#6d9679'); ctx.restore();
  const amount = a.stage === 0 ? a.progress : 78 * (1 - (a.progress / 100));
  const glassX = 552; const glassY = 211; const glassW = 142; const glassH = 175;
  ctx.save(); ctx.beginPath(); ctx.roundRect(glassX, glassY, glassW, glassH, [7, 7, 22, 22]); ctx.clip();
  ctx.fillStyle = '#ffffff80'; ctx.fillRect(glassX, glassY, glassW, glassH);
  const fillY = (glassY + glassH) - ((amount / 100) * glassH);
  ctx.fillStyle = '#97c7d7'; ctx.fillRect(glassX, fillY, glassW, glassH);
  ctx.beginPath(); ctx.moveTo(glassX, fillY); for (let i = 0; i <= 20; i++) ctx.lineTo(glassX + ((i / 20) * glassW), fillY + (Math.sin((i * 0.8) + (time / 160)) * 3)); ctx.lineTo(glassX + glassW, fillY + 8); ctx.lineTo(glassX, fillY + 8); ctx.closePath(); ctx.fillStyle = '#bbdfe5'; ctx.fill();
  rounded(ctx, glassX + 13, glassY + 10, 8, 140, 4, '#ffffff55'); ctx.restore();
  rounded(ctx, glassX, glassY, glassW, glassH, [7, 7, 22, 22], '#ffffff00', C.ink, 3);
  ellipse(ctx, glassX + (glassW / 2), glassY, glassW / 2, 11, '#ffffff60', C.ink, 2.5);
  if (a.stage === 0) {
    const upper = glassY + (glassH * 0.15); const lower = glassY + (glassH * 0.35);
    line(ctx, [[glassX + glassW + 17, upper], [glassX + glassW + 26, upper], [glassX + glassW + 26, lower], [glassX + glassW + 17, lower]], C.green, 3);
    words(ctx, '刚刚好', 770, (upper + lower) / 2, 14, C.green);
    if (a.progress > 0 && a.progress < 100) {
      ctx.beginPath(); ctx.moveTo(404, 148); ctx.bezierCurveTo(485, 151, 616, 172, 622, fillY - 3); ctx.strokeStyle = '#9dcfdba0'; ctx.lineWidth = 7; ctx.stroke();
      ellipse(ctx, 621, fillY, 13, 4, '#d7eef0');
    }
    words(ctx, `${Math.round(a.progress)}%`, 623, 335, 23, '#477481');
  } else {
    sui(ctx, 752, 325, 0.62, time, true, true);
    words(ctx, '咕嘟，咕嘟。', 480, 112, 24, C.green); progressDots(ctx, Math.floor(a.progress / 20), 5, 426, 476);
  }
  if (a.stage === 0) words(ctx, '留一点空，才不会洒。', 480, 476, 16, '#7f9277');
}

function toilet(ctx: Context, a: ActivityState, time: number) {
  backdrop(ctx, 'purple');
  for (let y = 74; y < 400; y += 70) for (let x = 185; x < 785; x += 70) rounded(ctx, x, y, 65, 65, 4, '#ffffff24');
  const inside = a.stage >= a.sequence.length;
  rounded(ctx, 325, 60, 279, 374, 12, '#ad98c1', C.ink, 3); rounded(ctx, 339, 74, 251, 360, 6, '#cbb8dc', C.ink, 2);
  rounded(ctx, 393, 102, 144, 116, 48, '#e6daeb', '#b9a2ca', 2);
  // A toilet pictogram communicates the task without depicting its use.
  rounded(ctx, 447, 126, 48, 34, 7, '#fff9ed', C.dark, 2); ellipse(ctx, 457, 172, 38, 15, '#fff9ed', C.dark, 2);
  polygon(ctx, [[426, 174], [483, 174], [475, 199], [444, 199]], '#fff9ed', C.dark, 2);
  ellipse(ctx, 487, 138, 3, 3, C.mint);
  ellipse(ctx, 561, 286, 10, 10, C.yellow, C.ink, 2);
  rounded(ctx, 397, 253, 135, 40, 8, inside ? '#a9c6ae' : '#fff2d4', C.ink, 2);
  words(ctx, inside ? '请稍等一下' : '进门后关好门', 465, 273, 15, inside ? '#496a55' : '#a48155');
  plant(ctx, 732, 365, 1.55);
  rounded(ctx, 639, 267, 75, 68, 5, '#f8f2e2', C.ink, 2); ellipse(ctx, 676, 268, 37, 10, '#fff9ed', C.ink, 2); ellipse(ctx, 676, 268, 10, 4, '#c6b8bd');
  if (inside) { words(ctx, '♪', 610 + (Math.sin(time / 600) * 7), 155, 29, C.purple); progressDots(ctx, Math.floor(a.progress / 20), 5, 411, 474); } else sequence(ctx, a, 466, 474);
}

function food(ctx: Context, a: ActivityState, state: GameState, time: number) {
  backdrop(ctx, 'peach');
  ellipse(ctx, 756, 286, 89, 75, '#ead0b6'); ellipse(ctx, 751, 275, 90, 72, '#fff8e6', C.ink, 2); ellipse(ctx, 751, 275, 65, 48, '#faebd5', '#dec4a4', 2);
  for (let i = 0; i < a.hits; i++) {
    polygon(ctx, [[706 + (i * 14), 256 + (i * 12)], [769 + (i * 4), 267 + (i * 9)], [721 + (i * 13), 295 + (i * 8)]], '#d2a16b', C.ink, 2);
    polygon(ctx, [[708 + (i * 14), 250 + (i * 12)], [770 + (i * 4), 261 + (i * 9)], [722 + (i * 13), 289 + (i * 8)]], '#f0ce8f', C.ink, 1.5);
  }
  rounded(ctx, 140, 174, 486, 231, 32, '#ba8c65', C.ink, 3); rounded(ctx, 153, 183, 459, 207, 25, '#d9ad7e');
  for (let i = 0; i < 6; i++) line(ctx, [[177, 205 + (i * 31)], [581, 205 + (i * 31)]], '#b68a5b36', 1.5);
  ellipse(ctx, 181, 218, 9, 9, '#a37452', C.ink, 1.5);
  rounded(ctx, 254, 243, 244, 88, 28, '#ac804e', C.ink, 2.5); rounded(ctx, 253, 220, 245, 94, 30, '#f0ce8f', C.ink, 2.5);
  rounded(ctx, 263, 238, 223, 65, 25, '#f8deb0');
  for (let i = 0; i < 7; i++) { ellipse(ctx, 282 + (i * 27), 252 + ((i % 2) * 15), 4, 3, '#d9b27d'); }
  for (let i = 0; i < a.hits; i++) line(ctx, [[318 + (i * 55), 226], [312 + (i * 55), 307]], '#a57751', 4);
  // Cursor drives the knife, with a soft movement instead of screen shake.
  const knifeX = 236 + ((a.cursor / 100) * 293);
  const knifeY = 181 + (Math.sin(time / 170) * 4);
  ctx.save(); ctx.translate(knifeX, knifeY); ctx.rotate(-0.18);
  polygon(ctx, [[-11, -64], [11, -64], [20, 57], [-16, 45]], '#d4dcda', C.ink, 2.5); line(ctx, [[13, -57], [19, 51]], '#fffdf5', 3);
  rounded(ctx, -13, -121, 26, 64, 9, C.dark, C.ink, 2); ellipse(ctx, 0, -103, 3, 3, '#e8dae9'); ellipse(ctx, 0, -79, 3, 3, '#e8dae9'); ctx.restore();
  plant(ctx, 795, 369, 0.8); progressDots(ctx, a.hits, 3, 724, 377); meter(ctx, a, state.level);
}

function feedCat(ctx: Context, a: ActivityState, state: GameState, time: number, catwalk = false) {
  backdrop(ctx, catwalk ? 'purple' : 'peach');
  const bagX = 243 + (a.cursor * 4.65); const targetX = 243 + (a.target * 4.65);
  if (catwalk) {
    rounded(ctx, 109, 322, 742, 39, 9, '#d1b091', C.ink, 3);
    rounded(ctx, 180, 359, 24, 79, 3, '#bd997d', C.ink, 2); rounded(ctx, 763, 359, 24, 79, 3, '#bd997d', C.ink, 2);
    rounded(ctx, 284, 307, 385, 21, 6, '#bbaaca', C.ink, 2);
    for (let i = 0; i < 16; i++) rounded(ctx, 294 + (i * 23), 312, 17, 7, 2, '#eee5f4');
    cat(ctx, targetX, 275, 1.5, time, a.progress > 85);
    // Moving a feathery lure pulls the cat's attention away from the keyboard.
    line(ctx, [[bagX + 37, 106], [bagX, 197]], '#b68a60', 5); line(ctx, [[bagX, 197], [bagX - 4, 234]], '#957c98', 1.5);
    ctx.save(); ctx.translate(bagX - 4, 244); ctx.rotate(Math.sin(time / 160) * 0.25); ellipse(ctx, -7, 0, 10, 23, C.peach, C.ink, 1.5); ellipse(ctx, 7, 2, 9, 22, C.purple, C.ink, 1.5); ctx.restore();
    words(ctx, '键盘不是猫窝呀。', 480, 64, 20, C.dark);
  } else {
    ellipse(ctx, 474, 411, 293, 26, '#e2c1a3');
    bowl(ctx, targetX, 370, 2.1, a.progress > 10);
    cat(ctx, 127, 375, 1.8, time, a.progress > 85);
    ctx.save(); ctx.translate(bagX, 201); ctx.rotate(0.12 + (Math.sin(time / 530) * 0.04));
    polygon(ctx, [[-47, -92], [47, -92], [55, 31], [18, 56], [-51, 38]], '#d2b4dd', C.ink, 3);
    line(ctx, [[-43, -83], [42, -83]], '#f6e9f8', 4); rounded(ctx, -37, -56, 73, 62, 9, '#fff1d9', C.ink, 1.5);
    words(ctx, '猫 猫', 0, -35, 19, C.dark); words(ctx, 'DINNER', 0, -14, 9, '#947a98'); ellipse(ctx, -13, 22, 5, 5, '#987152'); ellipse(ctx, 4, 24, 5, 5, '#987152'); ellipse(ctx, 20, 24, 5, 5, '#987152'); ctx.restore();
    if (Math.abs(a.cursor - a.target) < 15) for (let i = 0; i < 6; i++) {
      const yy = 260 + (((time / 3) + (i * 23)) % 99); ellipse(ctx, bagX + (Math.sin(i * 4) * 13), yy, 4, 3, i % 2 ? '#a57953' : '#bd946a');
    }
    words(ctx, '一碗刚刚好的幸福', 480, 66, 20, '#977557');
  }
  meter(ctx, a, state.level);
}

function audioPanel(ctx: Context, a: ActivityState, state: GameState, time: number) {
  backdrop(ctx, 'purple');
  line(ctx, [[343, 155], [343, 106], [211, 106], [211, 178]], C.ink, 7);
  rounded(ctx, 178, 164, 66, 141, 29, C.dark, C.ink, 3); rounded(ctx, 187, 174, 48, 94, 22, '#b6a1c9', C.ink, 2);
  for (let i = 0; i < 9; i++) line(ctx, [[193, 184 + (i * 8)], [229, 184 + (i * 8)]], '#89769d', 2);
  line(ctx, [[211, 306], [211, 371]], C.ink, 6); ellipse(ctx, 211, 378, 55, 10, C.dark, C.ink, 2);
  rounded(ctx, 309, 131, 488, 285, 24, C.ink, C.ink, 3); rounded(ctx, 318, 139, 470, 258, 19, '#7e6a90');
  words(ctx, 'SUI / AUDIO INTERFACE', 349, 168, 14, '#e7dbee', 'left');
  rounded(ctx, 349, 195, 207, 93, 10, '#40394b');
  const inTarget = Math.abs(a.cursor - a.target) <= 9 - state.level;
  for (let i = 0; i < 17; i++) {
    const h = 12 + (((Math.sin((time / 200) + (i * 0.83)) * 0.5) + 0.5) * (inTarget ? 48 : 68));
    rounded(ctx, 359 + (i * 11), 273 - h, 6, h, 2, i > 13 && !inTarget ? C.peach : inTarget ? '#b2d4b4' : '#d1bee0');
  }
  words(ctx, 'INPUT', 452, 307, 11, '#d6c6e0');
  ellipse(ctx, 667, 261, 78, 78, '#4d3d5b', '#b9a4cc', 2);
  for (let i = 0; i < 21; i++) {
    const angle = (Math.PI * 0.75) + ((i / 20) * Math.PI * 1.5);
    const inBand = Math.abs((i * 5) - a.target) <= 9 - state.level;
    line(ctx, [[667 + (Math.cos(angle) * 64), 261 + (Math.sin(angle) * 64)], [667 + (Math.cos(angle) * 72), 261 + (Math.sin(angle) * 72)]], inBand ? C.mint : '#ae97bf', inBand ? 4 : 2);
  }
  ellipse(ctx, 667, 261, 48, 48, '#b9a3cd', '#d9c9e6', 2);
  const angle = (Math.PI * 0.75) + ((a.cursor / 100) * Math.PI * 1.5);
  line(ctx, [[667 + (Math.cos(angle) * 28), 261 + (Math.sin(angle) * 28)], [667 + (Math.cos(angle) * 41), 261 + (Math.sin(angle) * 41)]], C.ink, 5);
  words(ctx, 'GAIN', 667, 339, 13, '#e7dbee');
  rounded(ctx, 351, 341, 191, 29, 8, inTarget ? '#b4d2b7' : '#baa2cb'); words(ctx, inTarget ? '声音正合适' : '调到绿色刻度', 446, 356, 14, inTarget ? '#406e52' : C.ink);
  meter(ctx, a, state.level);
}

function vts(ctx: Context, a: ActivityState, state: GameState, time: number) {
  backdrop(ctx, 'purple');
  rounded(ctx, 204, 79, 557, 343, 19, C.ink, C.ink, 3); rounded(ctx, 215, 91, 535, 316, 10, '#e2d5ec');
  ctx.save(); ctx.beginPath(); ctx.roundRect(218, 94, 529, 310, 10); ctx.clip();
  for (let i = 0; i < 7; i++) line(ctx, [[221 + (i * 88), 92], [221 + (i * 88), 406]], '#c8b7d766', 1);
  for (let i = 0; i < 5; i++) line(ctx, [[216, 97 + (i * 74)], [750, 97 + (i * 74)]], '#c8b7d766', 1);
  sui(ctx, 336 + (a.target * 2.9), 360, 1.45, time, a.progress > 88, true);
  ctx.restore();
  const targetX = 336 + (a.cursor * 2.9);
  const inTarget = Math.abs(a.cursor - a.target) <= 17 - (state.level * 2);
  const color = inTarget ? C.green : '#b491be';
  for (const [xx, yy, sx, sy] of [[targetX - 84, 142, 1, 1], [targetX + 84, 142, -1, 1], [targetX - 84, 323, 1, -1], [targetX + 84, 323, -1, -1]]) line(ctx, [[xx, yy + (sy * 25)], [xx, yy], [xx + (sx * 25), yy]], color, 4);
  rounded(ctx, 228, 105, 111, 24, 6, '#fff9eddd'); ellipse(ctx, 242, 117, 4, 4, inTarget ? C.green : C.red); words(ctx, 'VTube Studio', 258, 117, 10, C.dark, 'left');
  rounded(ctx, 580, 105, 156, 24, 6, '#fff9eddd'); words(ctx, inTarget ? '面捕信号稳定' : '把脸对准镜头', 658, 117, 11, color);
  ellipse(ctx, 483, 85, 4, 4, '#c5b1d3'); rounded(ctx, 436, 422, 94, 16, 4, '#9f89b3', C.ink, 2);
  meter(ctx, a, state.level);
}

function obs(ctx: Context, a: ActivityState, time: number) {
  backdrop(ctx, 'purple');
  rounded(ctx, 180, 73, 600, 360, 19, C.ink, C.ink, 3); rounded(ctx, 191, 85, 578, 334, 9, '#e8e0ef');
  rounded(ctx, 203, 97, 553, 27, 5, '#c6b4d6'); words(ctx, 'OBS  ·  岁己的直播间', 217, 111, 13, C.dark, 'left');
  ellipse(ctx, 738, 110, 4, 4, a.stage >= a.sequence.length ? C.green : '#eee0ef');
  rounded(ctx, 206, 136, 361, 197, 5, '#f2e7d3', '#b4a3c4', 1.5);
  rounded(ctx, 218, 147, 185, 14, 3, '#d8cbe2'); words(ctx, '岁岁平安 · 马上见面', 229, 154, 9, C.dark, 'left');
  rounded(ctx, 218, 171, 186, 147, 5, '#dfd2e8');
  for (let i = 0; i < 4; i++) { rounded(ctx, 230, 184 + (i * 30), 114 + ((i % 2) * 34), 7, 3, '#bba6cf'); rounded(ctx, 230, 195 + (i * 30), 86 + ((i % 2) * 25), 5, 2, '#cdbbdd'); }
  ctx.save(); ctx.beginPath(); ctx.rect(407, 163, 154, 169); ctx.clip(); sui(ctx, 488, 300, 0.78, time, false, true); ctx.restore();
  words(ctx, '预 览', 555, 147, 8, '#8f789d', 'right');
  const labels = ['游戏 / 画面', '麦克风 / 声音', '模型 / 面捕'];
  for (let i = 0; i < 3; i++) {
    const ready = a.stage >= Math.ceil((a.sequence.length * (i + 1)) / 3);
    rounded(ctx, 584, 142 + (i * 56), 163, 44, 6, ready ? '#c5ddcc' : '#ddd0e6'); ellipse(ctx, 600, 164 + (i * 56), 4, 4, ready ? C.green : '#ac96bb');
    words(ctx, labels[i], 616, 164 + (i * 56), 12, ready ? '#52795e' : '#8d789e', 'left');
  }
  rounded(ctx, 206, 346, 359, 55, 6, '#d4c6e0');
  words(ctx, '混音器', 221, 359, 9, C.dark, 'left');
  for (let row = 0; row < 2; row++) for (let i = 0; i < 28; i++) rounded(ctx, 221 + (i * 11.7), 372 + (row * 13), 8, 7, 1, i < 17 + (Math.sin((time / 230) + row) * 5) ? '#91b79b' : '#bca9cb');
  const ready = a.stage >= a.sequence.length;
  rounded(ctx, 584, 318, 163, 83, 9, ready ? C.green : '#b6a1c8', ready ? '#496e55' : '#a18bb4', 2); words(ctx, ready ? '可以开播啦' : '依次连接信号', 665, 359, 16, ready ? C.paper : '#ede2f1');
  if (ready) { progressDots(ctx, 3, 3, 453, 477); } else sequence(ctx, a, 480, 477);
}

function incident(ctx: Context, a: ActivityState, time: number) {
  backdrop(ctx, a.id === 'spill' ? 'green' : 'peach');
  if (a.id === 'spill') {
    rounded(ctx, 154, 164, 661, 224, 18, '#dfbd94', C.ink, 2.5);
    for (let i = 0; i < 4; i++) line(ctx, [[173, 205 + (i * 47)], [796, 205 + (i * 47)]], '#bd92652b', 2);
    const remaining = Math.max(0.12, 1 - (a.progress / 100));
    ellipse(ctx, 482, 288, 175 * remaining, 58 * remaining, '#9fc6cc'); ellipse(ctx, 457, 298, 100 * remaining, 34 * remaining, '#badad8');
    for (let i = 0; i < 4; i++) ellipse(ctx, 350 + (i * 92), 247 + ((i % 2) * 102), 8 * remaining, 4 * remaining, '#9fc6cc');
    ctx.save(); ctx.translate(686, 218); ctx.rotate(0.91); rounded(ctx, -37, -43, 74, 109, 10, '#ffffff70', C.ink, 2.5); ellipse(ctx, 0, -42, 36, 8, '#ffffff90', C.ink, 2); ctx.restore();
    ctx.save(); ctx.translate(330 + (Math.sin(time / 450) * 10) + (a.stage * 20), 277); ctx.rotate(-0.2); rounded(ctx, -48, -33, 105, 69, 9, '#eddb93', C.ink, 2); for (let i = 0; i < 4; i++) line(ctx, [[-35, -17 + (i * 12)], [44, -17 + (i * 12)]], '#ceb970', 2); ctx.restore();
    words(ctx, '水洒了！先救一下桌面。', 480, 92, 24, '#6f8d73');
  } else {
    words(ctx, '是谁把线拔掉了？', 480, 90, 24, '#9b795c');
    rounded(ctx, 578, 175, 191, 176, 18, '#b69dc9', C.ink, 3); rounded(ctx, 594, 190, 159, 144, 11, '#d6c3e3');
    rounded(ctx, 615, 231, 69, 50, 9, C.ink); rounded(ctx, 622, 238, 55, 36, 5, '#2f2a36');
    words(ctx, 'AUDIO IN', 649, 305, 12, C.dark);
    ellipse(ctx, 728, 216, 5, 5, a.progress > 80 ? C.mint : C.peach);
    const plugX = 391 + (a.progress * 1.4);
    ctx.beginPath(); ctx.moveTo(110, 382); ctx.bezierCurveTo(93, 228, 277, 440, plugX - 53, 260); ctx.strokeStyle = C.ink; ctx.lineWidth = 17; ctx.lineCap = 'round'; ctx.stroke(); ctx.strokeStyle = '#9e88b2'; ctx.lineWidth = 11; ctx.stroke();
    rounded(ctx, plugX - 47, 231, 66, 51, 10, C.dark, C.ink, 3); rounded(ctx, plugX + 19, 240, 41, 32, 3, '#d5d9d0', C.ink, 2); rounded(ctx, plugX + 44, 245, 7, 22, 1, '#696479');
    for (let i = 0; i < 4; i++) line(ctx, [[(plugX - 34) + (i * 11), 237], [(plugX - 34) + (i * 11), 276]], '#ab95ba', 2);
    cat(ctx, 837, 388, 1.03, time);
  }
  sequence(ctx, a, 480, 477);
}

/** Draw at the game's logical 960 × 540 resolution; the host handles DPR scaling. */
export function drawScene(ctx: Context, state: GameState, time: number): void {
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (state.phase !== 'activity' || !state.activity) room(ctx, state, time);
  else {
    const a = state.activity;
    switch (a.id) {
      case 'water': water(ctx, a, time); break;
      case 'toilet': toilet(ctx, a, time); break;
      case 'food': food(ctx, a, state, time); break;
      case 'cat': feedCat(ctx, a, state, time); break;
      case 'audio': audioPanel(ctx, a, state, time); break;
      case 'vts': vts(ctx, a, state, time); break;
      case 'obs': obs(ctx, a, time); break;
      case 'catwalk': feedCat(ctx, a, state, time, true); break;
      case 'spill': case 'cable': incident(ctx, a, time); break;
      default: room(ctx, state, time); break;
    }
  }
  ctx.restore();
}
