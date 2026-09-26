import { lockSignal, Mini } from "./minigames";

/** Canvas coordinates are fixed; CSS handles scaling without changing input or simulation. */
export function drawMini(c: CanvasRenderingContext2D, m: Mini) {
  const W = 700;
  const H = 400;
  c.clearRect(0, 0, W, H);
  c.fillStyle = m.kind === "recoil" ? "#263a35" : "#e9dfc8";
  c.fillRect(0, 0, W, H);
  const ellipse = (
    x: number,
    y: number,
    rx: number,
    ry: number,
    color: string,
  ) => {
    c.beginPath();
    c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    c.fillStyle = color;
    c.fill();
  };
  const line = (
    x: number,
    y: number,
    xx: number,
    yy: number,
    color: string,
    width = 3,
  ) => {
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(xx, yy);
    c.strokeStyle = color;
    c.lineWidth = width;
    c.stroke();
  };
  const text = (
    value: string,
    x: number,
    y: number,
    size = 18,
    color = "#384a3d",
  ) => {
    c.font = `${size}px sans-serif`;
    c.fillStyle = color;
    c.textAlign = "center";
    c.fillText(value, x, y);
  };
  if (m.kind === "dial") {
    ellipse(350, 192, 126, 126, "#bd9b62");
    ellipse(350, 190, 110, 110, "#f4e7c9");
    for (let i = 0; i < 36; i++) {
      const a = (i * Math.PI) / 18;
      line(
        350 + Math.sin(a) * 91,
        190 - Math.cos(a) * 91,
        350 + Math.sin(a) * (i % 3 ? 102 : 110),
        190 - Math.cos(a) * (i % 3 ? 102 : 110),
        "#857252",
        i % 3 ? 2 : 4,
      );
    }
    const a = (m.angle * Math.PI) / 180;
    line(
      350,
      190,
      350 + Math.sin(a) * 88,
      190 - Math.cos(a) * 88,
      "#495c47",
      8,
    );
    ellipse(350, 190, 38, 38, "#d3b57c");
    text(`${Math.round(m.angle)}°`, 350, 198, 20);
    text(
      m.direction === 1 ? "↻ 顺时针寻找下一格" : "↺ 逆时针寻找下一格",
      350,
      30,
      23,
    );
    const signal = lockSignal(m);
    for (let i = 0; i < 9; i++) {
      const h = 8 + signal * (16 + Math.sin(m.clock * 20 + i) * 10);
      line(
        280 + i * 18,
        371 - h / 2,
        280 + i * 18,
        371 + h / 2,
        signal > 0.86 ? "#547f58" : "#b5a688",
        5,
      );
    }
    text(
      signal > 0.86
        ? "咔哒 · 就在这里"
        : signal > 0.5
          ? "轻轻的摩擦声……"
          : "慢慢转，留意卡点",
      350,
      332,
      17,
    );
  } else if (m.kind === "pick") {
    ellipse(350, 205, 120, 120, "#b3935f");
    ellipse(350, 205, 91, 91, "#e1c98e");
    ellipse(350, 205, 34, 34, "#4b5043");
    c.save();
    c.translate(350, 205);
    c.rotate((m.angle * Math.PI) / 180);
    line(0, 12, 0, -135, m.stress > 0.4 ? "#bc6349" : "#b4c4bd", 10);
    c.restore();
    c.save();
    c.translate(350, 205);
    c.rotate((m.torque * Math.PI) / 2);
    line(0, 0, 0, 108, "#566b5b", 13);
    line(0, 108, 85, 108, "#566b5b", 13);
    c.restore();
    const signal = lockSignal(m);
    text(
      signal > 0.72 ? "铁丝松动了，试着轻转" : "调整铁丝角度，再轻转试探",
      350,
      32,
      21,
    );
    text(
      m.held
        ? m.stress > 0.2
          ? "阻力很大，松手换角度"
          : "锁芯正在松开……"
        : "松手可调整角度；按住扳手试转",
      350,
      366,
      19,
      m.stress > 0.2 ? "#ae4e37" : "#4c6549",
    );
    for (let i = 0; i < 3; i++) ellipse(295 + i * 55, 62, 8, 8, i < m.score ? "#678653" : "#c2b599");
  } else if (m.kind === "pins") {
    c.fillStyle = "#bba16e";
    c.fillRect(100, 78, 500, 240);
    c.fillStyle = "#414d44";
    c.fillRect(112, 89, 476, 218);
    for (let i = 0; i < 3; i++) {
      const x = 210 + i * 140;
      const lift = i < m.score ? m.targets[i] : i === m.score ? m.lift : 0;
      const notch = 245 + (m.targets[i] - lift) * 1.5;
      for (let j = 0; j < 7; j++) line(x - 18, 100 + j * 10, x + 18, 105 + j * 10, "#9baf9c", 2);
      c.fillStyle = i < m.score ? "#84a078" : "#d9b96f";
      c.fillRect(x - 25, 172 - lift * 1.5, 50, 135);
      line(x - 26, notch, x + 26, notch, "#fff6d7", 6);
      if (i === m.score) {
        line(x, 350, x, 315 - lift * 1.5, "#b8c5bc", 10);
        ellipse(x, 358, 24, 13, "#5d715f");
      }
    }
    line(90, 245, 610, 245, "#e9cb6f", 3);
    text("把当前弹子的白色缺口抬到金色剪切线", 350, 35, 21);
    text("对齐后锁住，再抬下一枚", 350, 390, 17);
  } else if (m.kind === "toss" || m.kind === "eggs") {
    const px = m.pan * 6 + 50;
    const hop = m.kind === "toss" && m.flight ? Math.max(0, 1 - m.spin / 110) * 24 : 0;
    for (let i = 0; i < 8; i++) line(i * 100, 0, i * 100, 400, "#d9ccb0", 1);
    ellipse(px, 340, 95, 24, "#b7a582");
    line(px + 72, 306 - hop, px + 140, 328 - hop, "#986c43", 18);
    ellipse(px, 308 - hop, 99, 31, "#35483c");
    ellipse(px, 302 - hop, 83, 23, "#53614b");
    for (let i = 0; i < 30; i++) ellipse(
        px + Math.sin(i * 2.4) * 65,
        300 - hop + Math.cos(i * 2.4) * 15,
        4,
        2,
        i % 3 ? "#e4c96c" : "#7e994b",
      );
    if (m.kind === "toss") {
      const x = m.flight ? 50 + m.x * 6 : px;
      const y = 274 - m.y * 2.6;
      ellipse(50 + m.x * 6, 333, 30, 6, "#91846a");
      c.save();
      c.translate(x, y);
      c.scale(1.2, 1.2);
      c.rotate(m.flight ? (m.spin * Math.PI) / 180 : 0);
      c.fillStyle = "#e3b953";
      c.fillRect(-27, -28, 54, 54);
      c.fillStyle = "#fae2a0";
      c.beginPath();
      c.moveTo(-27, -28);
      c.lineTo(-14, -41);
      c.lineTo(40, -41);
      c.lineTo(27, -28);
      c.fill();
      c.fillStyle = "#b98d36";
      c.beginPath();
      c.moveTo(27, -28);
      c.lineTo(40, -41);
      c.lineTo(40, 13);
      c.lineTo(27, 26);
      c.fill();
      [
        [-13, -14],
        [12, -14],
        [0, 0],
        [-13, 13],
        [12, 13],
      ].forEach(([a, b]) => ellipse(a, b, 5, 5, "#617946"));
      c.restore();
      text(
        m.flight
          ? "看影子！把锅移到饭团下面"
          : "向上甩锅，把方方的蛋炒饭颠起来",
        350,
        32,
        21,
      );
      text(`骰子饭团 · 已翻 ${m.score} / 3 面`, 350, 381, 20);
    } else {
      if (m.flight) {
        const x = 50 + m.x * 6;
        const y = 280 - m.y * 2.35;
        ellipse(x, y, 23, 18, "#fffbdf");
        ellipse(x + 2, y, 10, 10, "#eabb43");
      }
      text("饭要粒粒分开，还要粘着蛋", 350, 32, 23);
      text(`左右移动锅，接住鸡蛋 · ${m.score} / 6`, 350, 379, 20);
    }
  } else {
    for (let i = 0; i < 8; i++) {
      line(i * 100, 0, i * 100, 400, "#456056", 1);
      line(0, i * 60, 700, i * 60, "#456056", 1);
    }
    [90, 60, 30].forEach((r, i) => {
      ellipse(350, 200, r, r, ["#d6c8a4", "#668b78", "#df9d71"][i]);
    });
    m.marks.forEach((p) => ellipse(p.x * 7, p.y * 4, 4, 4, p.hit ? "#fff4bb" : "#c8614c"),);
    const x = m.aimX * 7;
    const y = m.aimY * 4;
    line(x - 17, y, x - 5, y, "#faf5d9", 2);
    line(x + 5, y, x + 17, y, "#faf5d9", 2);
    line(x, y - 17, x, y - 5, "#faf5d9", 2);
    line(x, y + 5, x, y + 17, "#faf5d9", 2);
    text(
      `训练靶场   ${m.shots} / 24 发 · 命中 ${m.score}`,
      350,
      32,
      22,
      "#f1e7cb",
    );
    text(
      m.won ? "这一梭打完了，看看弹着点" : "按住开火，往下拖动抵消枪口上抬",
      350,
      379,
      19,
      "#e7e0c3",
    );
  }
}
