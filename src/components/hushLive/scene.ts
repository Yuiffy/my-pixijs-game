import { action, broadcast, ending, Game, SPOTS, Spot } from "./engine";

export function draw(
  ctx: CanvasRenderingContext2D,
  s: Game,
  partner: "她" | "他",
  player: "男友" | "女友",
) {
  const c = ctx;
  const box = (
    x: number,
    y: number,
    w: number,
    h: number,
    color: string,
    r = 12,
  ) => {
    c.fillStyle = color;
    c.beginPath();
    c.roundRect(x, y, w, h, r);
    c.fill();
  };
  const ellipse = (
    x: number,
    y: number,
    rx: number,
    ry: number,
    color: string,
  ) => {
    c.fillStyle = color;
    c.beginPath();
    c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    c.fill();
  };
  const text = (
    value: string,
    x: number,
    y: number,
    size = 14,
    color = "#625d50",
    align: CanvasTextAlign = "left",
  ) => {
    c.font = `600 ${size}px "Microsoft YaHei", sans-serif`;
    c.fillStyle = color;
    c.textAlign = align;
    c.fillText(value, x, y);
  };
  const line = (
    x: number,
    y: number,
    x2: number,
    y2: number,
    color: string,
    width = 2,
  ) => {
    c.strokeStyle = color;
    c.lineWidth = width;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x2, y2);
    c.stroke();
  };
  const plant = (x: number, y: number) => {
    box(x - 13, y, 26, 27, "#b87d62", 6);
    for (let i = 0; i < 5; i++) {
      const a = i * 1.4;
      ellipse(
        x + Math.cos(a) * 15,
        y - 14 + Math.sin(a) * 14,
        12,
        18,
        i % 2 ? "#667c59" : "#829772",
      );
    }
  };
  const heart = (x: number, y: number, scale: number) => {
    c.save();
    c.translate(x, y);
    c.scale(scale, scale);
    c.fillStyle = "#c66d68";
    c.beginPath();
    c.moveTo(0, 6);
    c.bezierCurveTo(-22, -6, -11, -19, 0, -9);
    c.bezierCurveTo(11, -19, 22, -6, 0, 6);
    c.fill();
    c.restore();
  };
  c.clearRect(0, 0, 960, 580);
  box(0, 0, 960, 580, "#e8e4d8", 0);
  box(30, 54, 900, 490, "#ccc7b8", 18);
  box(40, 44, 880, 487, "#f4dfbf", 14);
  box(535, 68, 365, 452, "#eed5c3", 0);
  for (let y = 110; y < 530; y += 45) {
    line(48, y, 508, y, "#e5caa7", 1);
    line(536, y, 912, y, "#dfc2ab", 1);
    for (let x = 80 + (y % 2) * 50; x < 900; x += 105) line(x, y, x, Math.min(530, y + 44), "#e5caa7", 1);
  }
  box(42, 44, 875, 52, "#e4e0d1", 0);
  box(42, 88, 875, 9, "#c6bcaa", 0);
  text("OUR LITTLE SECRET", 65, 77, 15, "#6b7464");
  text("21:30  /  在同一个屋檐下", 892, 77, 13, "#7c786c", "right");
  // Moonlit window and linen curtains.
  box(320, 107, 154, 94, "#b6c5bb", 5);
  box(329, 115, 136, 76, "#718f98", 3);
  ellipse(437, 134, 12, 12, "#fff0c4");
  box(389, 113, 5, 80, "#dedbc9", 0);
  box(327, 151, 141, 4, "#dedbc9", 0);
  box(310, 102, 29, 110, "#e5dbc4", 4);
  box(456, 102, 29, 110, "#e5dbc4", 4);
  // The player's gaming nook.
  box(105, 115, 187, 77, "#ae8e6b", 9);
  box(102, 109, 193, 70, "#ddbe95", 9);
  box(166, 119, 75, 43, "#3d5151", 5);
  box(172, 123, 63, 31, "#739a8e", 2);
  line(175, 148, 230, 129, "#c4d2b3", 3);
  text("DELTA", 203, 144, 10, "#eef0d7", "center");
  box(182, 167, 53, 6, "#766e61", 2);
  ellipse(263, 151, 9, 10, "#ece5d2");
  box(188, 190, 62, 45, "#7b9384", 16);
  text("你的游戏角", 116, 258, 13);
  // Living room rug and sofa.
  box(122, 295, 280, 160, "#c4b89a", 55);
  box(128, 301, 268, 148, "#e9dfc5", 50);
  for (let y = 315; y < 438; y += 10) line(165, y, 357, y, "#dbcfb0", 1);
  box(115, 285, 197, 84, "#7c9380", 17);
  box(121, 281, 185, 68, "#a8b39a", 14);
  box(132, 284, 74, 59, "#b4bea5", 12);
  box(215, 284, 74, 59, "#b4bea5", 12);
  box(105, 299, 27, 61, "#91a189", 9);
  box(296, 299, 27, 61, "#91a189", 9);
  box(144, 291, 43, 36, "#e8bd9f", 9);
  box(240, 290, 42, 38, "#ede4cc", 10);
  ellipse(356, 386, 40, 26, "#b89970");
  ellipse(356, 380, 41, 26, "#e4c49b");
  ellipse(349, 375, 10, 7, "#fff6e0");
  box(364, 373, 15, 17, "#acbd9b", 3);
  // Exterior door and food bag.
  box(45, 446, 10, 75, "#85775e", 0);
  box(71, 461, 68, 47, "#b99b78", 5);
  box(81, 454, 35, 35, "#deaf79", 3);
  text("饭", 98, 478, 17, "#805b40", "center");
  // Dividing wall: only the 375-448 gap is passable.
  box(506, 96, 28, 279, "#c0b6a3", 0);
  box(506, 448, 28, 83, "#c0b6a3", 0);
  box(508, 97, 10, 278, "#eee8d9", 0);
  box(508, 448, 10, 83, "#eee8d9", 0);
  if (s.doorClosed) {
    box(509, 375, 20, 73, "#9d8e73", 2);
    ellipse(523, 410, 3, 3, "#eddbb4");
  } else {
    line(519, 374, 580, 354, "#a69679", 8);
    c.strokeStyle = "#bcac8d";
    c.setLineDash([3, 5]);
    c.beginPath();
    c.arc(518, 374, 65, 0, Math.PI / 2);
    c.stroke();
    c.setLineDash([]);
  }
  text(s.doorClosed ? "门已关" : "门开着", 521, 481, 12, "#796b58", "center");
  // Warm live studio with acoustic panels, desk and virtual avatar monitor.
  box(571, 119, 312, 62, "#bcaaa0", 9);
  for (let x = 584; x < 875; x += 25) box(x, 129, 15, 43, "#a18e89", 3);
  box(621, 190, 254, 86, "#b88c76", 12);
  box(616, 182, 260, 80, "#e9c5a3", 12);
  box(665, 166, 104, 66, "#4c565a", 6);
  box(672, 172, 90, 52, "#b6b7ce", 3);
  ellipse(718, 204, 16, 17, "#fff0df");
  ellipse(718, 185, 20, 12, "#e8e4ef");
  text("LIVE", 679, 182, 8, "#9c555c");
  box(681, 241, 75, 9, "#f2ede2", 3);
  box(781, 197, 46, 28, "#74877d", 5);
  text("♫", 805, 218, 20, "#e8ebd5", "center");
  line(823, 254, 797, 223, "#5e625d", 5);
  ellipse(793, 224, 6, 13, s.muted > 0 ? "#8aac83" : "#b56560");
  box(706, 274, 76, 64, "#a38d9b", 23);
  box(713, 278, 62, 49, "#c4acb4", 18);
  box(696, 379, 186, 116, "#cbb6a7", 9);
  box(702, 373, 180, 111, "#f2e5d3", 9);
  box(709, 388, 45, 40, "#d5c6bf", 8);
  box(764, 410, 110, 65, "#b4bfa9", 7);
  box(801, 478, 66, 25, "#b99677", 5);
  line(829, 482, 836, 492, "#f4eee0", 3);
  plant(453, 294);
  plant(873, 344);
  plant(82, 246);
  text("客厅", 402, 509, 18, "#98886e");
  text("直播间", 595, 509, 18, "#98806e");
  const person = (x: number, y: number, isPartner: boolean) => {
    const bob = isPartner
      ? Math.sin(s.pulse * 0.5) * 1.2
      : s.path.length
        ? Math.sin(s.pulse) * 2.5
        : 0;
    ellipse(x, y + 23, 20, 7, "#0000001b");
    box(x - 12, y + 10, 9, 16, "#605c58", 4);
    box(x + 3, y + 10, 9, 16, "#605c58", 4);
    box(x - 19, y - 13 + bob, 38, 35, isPartner ? "#bb878c" : "#718d82", 13);
    if (isPartner && partner === "她") box(x - 24, y - 35 + bob, 48, 43, "#6a5152", 17);
    if (!isPartner && player === "女友") {
      ellipse(x - 20, y - 10 + bob, 9, 17, "#635747");
      ellipse(x + 20, y - 10 + bob, 9, 17, "#635747");
    }
    ellipse(x, y - 22 + bob, 21, 22, isPartner ? "#6a5152" : "#635747");
    ellipse(x, y - 15 + bob, 17, 17, "#f6d3b0");
    ellipse(x - 3, y - 35 + bob, 20, 10, isPartner ? "#6a5152" : "#635747");
    ellipse(x - 6, y - 17 + bob, 1.6, 2, "#4c4944");
    ellipse(x + 6, y - 17 + bob, 1.6, 2, "#4c4944");
    line(x - 3, y - 8 + bob, x + 3, y - 8 + bob, "#b57469", 1.5);
    ellipse(x - 12, y - 9 + bob, 4, 2, "#e4a293");
    ellipse(x + 12, y - 9 + bob, 4, 2, "#e4a293");
    if (isPartner) {
      c.strokeStyle = "#e6dacb";
      c.lineWidth = 4;
      c.beginPath();
      c.arc(x, y - 23 + bob, 23, Math.PI, Math.PI * 2);
      c.stroke();
      box(x - 26, y - 24 + bob, 7, 16, "#e6dacb", 3);
      box(x + 19, y - 24 + bob, 7, 16, "#e6dacb", 3);
    }
    if (!isPartner && s.carry) {
      box(x + 10, y + 2, 18, 20, s.carry === "food" ? "#d8a66d" : "#f7eddb", 3);
      text(
        s.carry === "food" ? "饭" : "↯",
        x + 19,
        y + 17,
        11,
        "#896549",
        "center",
      );
    }
  };
  const closeMoment = ['hug', 'kiss', 'bonus'].includes(s.actionKey) && s.actionProgress > 0;
  person(s.won ? 267 : 744, s.won ? 371 : 287, true);
  person(s.player.x, s.player.y - (closeMoment ? 18 : 0), false);
  if (closeMoment) {
    line(725, 301, 716, 291, '#f6d3b0', 7);
    line(762, 301, 772, 291, '#f6d3b0', 7);
    heart(780, 260, 0.7 + Math.sin(s.pulse) * 0.1);
  }
  if (s.noise > 2) for (let i = 0; i < 3; i++) {
      c.strokeStyle = `rgba(188,100,81,${0.3 - i * 0.07})`;
      c.lineWidth = 2;
      c.beginPath();
      c.arc(
        s.player.x,
        s.player.y,
        30 + ((s.pulse * 12 + i * 18) % 65),
        0,
        Math.PI * 2,
      );
      c.stroke();
    }
  if (s.affection > 0 || s.won) for (let i = 0; i < 3; i++) heart(
        (s.won ? 225 : 724) + i * 22,
        (s.won ? 306 : 232) - Math.sin(s.pulse + i) * 8,
        0.55,
      );
  if (s.actionProgress > 0) {
    box(s.player.x - 25, s.player.y + 36, 50, 5, "#b5ab96", 3);
    box(
      s.player.x - 25,
      s.player.y + 36,
      50 * s.actionProgress,
      5,
      "#b86d63",
      3,
    );
  }
  const b = broadcast(s);
  box(
    597,
    108,
    250,
    34,
    s.muted > 0 ? "#718a70" : b.music ? "#7b8975" : "#a66c67",
    17,
  );
  text(
    s.won
      ? "OFF AIR · 现在只属于你"
      : s.muted > 0
        ? `闭麦中 · ${s.muted.toFixed(1)}s`
        : b.music
          ? "♫ 正在唱歌 · 声音被掩护"
          : "● LIVE · 麦克风开着",
    722,
    130,
    14,
    "#fff9eb",
    "center",
  );
  if (s.target && s.path.length) {
    const target = SPOTS[s.target];
    c.strokeStyle = "#b76b62";
    c.lineWidth = 2;
    c.beginPath();
    c.ellipse(target.x, target.y + 16, 24, 9, 0, 0, Math.PI * 2);
    c.stroke();
  }
  if (s.phase === "ready") {
    heart(741, 352, 1);
    text("屏幕里的偶像，生活里的恋人。", 480, 565, 17, "#837767", "center");
  } else if (s.phase === "result") text(ending(s), 480, 565, 17, "#837767", "center");
  else {
    const a = action(s);
    text(
      a.key ? `按住 E · ${a.label}` : "点击房间地点移动 · 靠近后按住 E",
      480,
      565,
      16,
      "#716451",
      "center",
    );
  }
}

export function hitSpot(x: number, y: number): Spot | null {
  return (Object.keys(SPOTS) as Spot[]).sort(
    (a, b) => Math.hypot(SPOTS[a].x - x, SPOTS[a].y - y) -
      Math.hypot(SPOTS[b].x - x, SPOTS[b].y - y),
  )[0];
}
