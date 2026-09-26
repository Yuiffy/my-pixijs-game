import { nightRoll } from "./household";

export type MiniKind = "dial" | "pick" | "pins" | "toss" | "eggs" | "recoil";
export type MiniInput =
  | "turn"
  | "set"
  | "press"
  | "release"
  | "pan"
  | "toss"
  | "aim";
export type Mini = {
  kind: MiniKind;
  seed: number;
  clock: number;
  won: boolean;
  score: number;
  misses: number;
  feedback: string;
  angle: number;
  targets: number[];
  travel: number;
  direction: number;
  torque: number;
  stress: number;
  held: boolean;
  lift: number;
  pan: number;
  panTarget: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  flight: boolean;
  spin: number;
  cooldown: number;
  aimX: number;
  aimY: number;
  shots: number;
  marks: { x: number; y: number; hit: boolean }[];
};
const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n));
const angleDistance = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
export const lockKind = (seed: number): MiniKind => (["dial", "pick", "pins"] as const)[Math.floor(nightRoll(seed, 30) * 3)];
export const cookKind = (seed: number): MiniKind => (nightRoll(seed, 31) < 0.5 ? "toss" : "eggs");
export function createMini(kind: MiniKind, seed: number): Mini {
  return {
    kind,
    seed,
    clock: 0,
    won: false,
    score: 0,
    misses: 0,
    feedback: "",
    angle: 0,
    targets: [0, 1, 2].map((i) => (kind === "dial"
        ? 40 + Math.floor(nightRoll(seed, 40 + i) * 28) * 10
        : kind === "pick"
          ? -65 + Math.floor(nightRoll(seed, 40 + i) * 13) * 10
          : 25 + Math.floor(nightRoll(seed, 40 + i) * 11) * 5),),
    travel: 0,
    direction: 1,
    torque: 0,
    stress: 0,
    held: false,
    lift: 0,
    pan: 50,
    panTarget: 50,
    x: 50,
    y: 0,
    vx: 0,
    vy: 0,
    flight: false,
    spin: 0,
    cooldown: 0,
    aimX: 50,
    aimY: 50,
    shots: 0,
    marks: [],
  };
}
export function lockSignal(m: Mini) {
  const distance =
    m.kind === "dial"
      ? angleDistance(m.angle, m.targets[m.score] ?? 0)
      : Math.abs(
          (m.kind === "pins" ? m.lift : m.angle) - (m.targets[m.score] ?? 0),
        );
  return clamp(1 - distance / (m.kind === "dial" ? 60 : 35), 0, 1);
}
function mistake(m: Mini, text: string) {
  m.misses++;
  m.feedback = text;
  m.cooldown = 0.45;
}
function latch(m: Mini) {
  m.score++;
  m.travel = 0;
  m.torque = 0;
  m.stress = 0;
  m.lift = 0;
  m.held = false;
  m.direction *= -1;
  m.won = m.score === 3;
  m.feedback = m.won
    ? "锁芯转开了。扶住门把，轻轻进屋。"
    : m.kind === "dial"
      ? "咔哒，记住一格！换个方向转。"
      : "一枚锁舌松开了，继续下一枚。";
}
/** All movement comes from the main simulation clock; UI only supplies intent. */
export function miniInput(m: Mini, input: MiniInput, x = 0, y = 0) {
  if (m.won || !Number.isFinite(x) || !Number.isFinite(y)) return;
  if (input === "release") {
    m.held = false;
    return;
  }
  if (input === "pan") {
    m.panTarget = clamp(x, 8, 92);
    return;
  }
  if (input === "aim") {
    m.aimX = clamp(m.aimX + x, 0, 100);
    m.aimY = clamp(m.aimY + y, 0, 100);
    return;
  }
  if (input === "turn" && m.kind === "dial") {
    const delta = clamp(x, -90, 90);
    m.angle = (m.angle + delta + 360) % 360;
    m.travel =
      Math.sign(delta) === m.direction ? m.travel + Math.abs(delta) : 0;
  }
  if (input === "set") {
    if (m.kind === "pick" && !m.held) m.angle = clamp(x, -90, 90);
    if (m.kind === "pins") m.lift = clamp(x, 0, 100);
  }
  if (input === "toss" && m.kind === "toss" && !m.flight && m.cooldown === 0) {
    m.flight = true;
    m.x = m.pan;
    m.y = 0;
    m.vy = 85 + clamp(x, 0, 1) * 30;
    m.vx =
      (nightRoll(m.seed, 70 + m.score + m.misses * 5) < 0.5 ? -1 : 1) *
      (12 + m.score * 4);
    m.spin = 0;
    m.feedback = "饭团飞起来了！移动锅，接住它。";
  }
  if (input !== "press" || m.cooldown > 0) return;
  if (m.kind === "dial") {
    if (angleDistance(m.angle, m.targets[m.score]) <= 8 && m.travel >= 10) latch(m);
    else mistake(
        m,
        m.travel < 10
          ? "换到箭头方向，慢慢转，别直接按。"
          : "还没听见卡点，换个角度找找。已记住的格子保留。",
      );
  } else if (m.kind === "pins") {
    if (Math.abs(m.lift - m.targets[m.score]) <= 7) latch(m);
    else mistake(m, "缺口没对齐剪切线，再抬高或放低一点。前面的弹子不会掉。");
  } else if (m.kind === "pick" || m.kind === "recoil") m.held = true;
}
export function stepMini(m: Mini, dt: number) {
  if (m.won || !Number.isFinite(dt) || dt <= 0) return;
  if (dt > 0.025) {
    for (let left = dt; left > 0.00001; left -= 0.025) stepMini(m, Math.min(left, 0.025));
    return;
  }
  m.clock += dt;
  m.cooldown = Math.max(0, m.cooldown - dt);
  m.pan += (m.panTarget - m.pan) * (1 - Math.exp(-dt * 18));
  if (m.kind === "pick") {
    const aligned = Math.abs(m.angle - m.targets[m.score]) <= 9;
    if (m.held && m.cooldown === 0) {
      if (aligned) {
        m.torque += dt * 1.6;
        m.stress = Math.max(0, m.stress - dt * 2);
        if (m.torque >= 1) latch(m);
      } else {
        m.stress += dt * 2;
        m.torque = Math.min(0.14, m.torque + dt);
        if (m.stress >= 1) {
          mistake(m, "铁丝绷紧了！松手，换个角度再试。");
          m.held = false;
          m.stress = 0.6;
        }
      }
    } else {
      m.torque = Math.max(0, m.torque - dt);
      m.stress = Math.max(0, m.stress - dt * 1.5);
    }
  }
  if (m.kind === "toss" && m.flight) {
    m.vy -= dt * 165;
    m.x += m.vx * dt;
    m.y += m.vy * dt;
    m.spin += dt * 330;
    if (m.y <= 0 && m.vy < 0) {
      m.flight = false;
      m.y = 0;
      if (Math.abs(m.x - m.pan) < 16) {
        m.score++;
        m.feedback = "接住！饭团翻了一面，鸡蛋香出来了。";
        m.won = m.score >= 3;
      } else mistake(m, "饭团滚到锅沿，铲回来了。下次把锅移到影子下面。");
    }
  }
  if (m.kind === "eggs") {
    if (!m.flight && m.cooldown === 0) {
      m.flight = true;
      m.x = 15 + nightRoll(m.seed, 80 + m.score + m.misses * 7) * 70;
      m.y = 95;
      m.vx = (nightRoll(m.seed, 90 + m.score + m.misses * 7) - 0.5) * 16;
    }
    if (m.flight) {
      m.y -= dt * 40;
      m.x += m.vx * dt;
      if (m.x < 8 || m.x > 92) {
        m.x = clamp(m.x, 8, 92);
        m.vx *= -1;
      }
      if (m.y <= 0) {
        m.flight = false;
        m.cooldown = 0.3;
        if (Math.abs(m.x - m.pan) < 16) {
          m.score++;
          m.feedback = "这一勺米饭也裹上蛋啦。";
          m.won = m.score >= 6;
        } else mistake(m, "鸡蛋滑到锅沿了。换一颗，接到的都保留。");
      }
    }
  }
  if (m.kind === "recoil" && m.held && m.cooldown === 0) {
    const hit = Math.hypot(m.aimX - 50, m.aimY - 50) <= 15;
    m.marks.push({ x: m.aimX, y: m.aimY, hit });
    m.shots++;
    if (hit) m.score++;
    m.aimY = clamp(m.aimY - 4.3, 0, 100);
    m.aimX = clamp(m.aimX + Math.sin(m.shots * 2.4) * 2.1, 0, 100);
    m.cooldown = 0.16;
    if (m.shots >= 24) {
      m.won = true;
      m.held = false;
      m.feedback = `24发结束 · ${m.score}发命中。${m.score >= 18 ? "压得很稳！" : m.score >= 10 ? "不错，下次试着更稳一点。" : "枪口会往上抬，持续往下拖来抵消。"}`;
    }
  }
}
