import { nightRoll } from "./household";

export type MiniKind = "dial" | "pick" | "pins" | "toss" | "eggs" | "recoil";
export type MiniInput =
  | "turn"
  | "set"
  | "press"
  | "release"
  | "tilt"
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
  tiltX: number;
  tiltZ: number;
  egg: { x: number; z: number; vx: number; vz: number };
  grains: { x: number; z: number; vx: number; vz: number; coat: number }[];
  faces: number[];
  face: number;
  rotation: [number, number, number, number];
  fromRotation: [number, number, number, number];
  turn: number;
  tossAt: number;
  flightSeconds: number;
  panHeight: number;
  panHeightTarget: number;
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
    tiltX: 0,
    tiltZ: 0,
    egg: { x: 0, z: 0, vx: 0, vz: 0 },
    grains: Array.from({ length: 6 }, (_, i) => ({
      x: Math.sin(i * (Math.PI / 3)) * 0.65,
      z: Math.cos(i * (Math.PI / 3)) * 0.65,
      vx: 0,
      vz: 0,
      coat: 0,
    })),
    faces: [0, 0, 0, 0, 0, 0],
    face: 3,
    rotation: [0, 0, 0, 1],
    fromRotation: [0, 0, 0, 1],
    turn: 0,
    tossAt: 0,
    flightSeconds: 1,
    panHeight: 0,
    panHeightTarget: 0,
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
export const DIAL_TOLERANCE = 18;
export const dialReady = (m: Mini) => m.travel >= 10 &&
  angleDistance(m.angle, m.targets[m.score] ?? 0) <= DIAL_TOLERANCE;
export const FACE_NAMES = ["右面", "左面", "顶面", "底面", "前面", "后面"];
export function turnedRotation(
  q: Mini["rotation"],
  turn: number,
  radians = Math.PI / 2,
): Mini["rotation"] {
  const sideways = Math.abs(turn) === 1;
  const sign = turn === 1 || turn === 2 ? -1 : 1;
  const v = Math.sin(radians * (sign / 2));
  const w = Math.cos(radians / 2);
  const x = sideways ? 0 : v;
  const z = sideways ? v : 0;
  return [
    w * q[0] + x * q[3] - z * q[1],
    w * q[1] + z * q[0] - x * q[2],
    w * q[2] + z * q[3] + x * q[1],
    w * q[3] - x * q[0] - z * q[2],
  ];
}
export function bottomFace(q: Mini["rotation"]) {
  const [x, y, z, w] = q;
  const ys = [
    2 * (x * y + w * z),
    -2 * (x * y + w * z),
    1 - 2 * (x * x + z * z),
    -1 + 2 * (x * x + z * z),
    2 * (y * z - w * x),
    -2 * (y * z - w * x),
  ];
  return ys.indexOf(Math.min(...ys));
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
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  if (input === "release") {
    m.held = false;
    return;
  }
  if (m.won) return;
  if (input === "tilt") {
    m.tiltX = clamp(x, -1, 1);
    m.tiltZ = clamp(y, -1, 1);
    return;
  }
  if (input === "pan") {
    m.panHeightTarget = clamp(y, -0.18, 0.25);
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
    m.turn = [-1, 0, 1, 2].includes(y) ? y : 0;
    m.fromRotation = [...m.rotation];
    m.rotation = turnedRotation(m.rotation, m.turn);
    m.tossAt = m.clock;
    m.flightSeconds = (2 * m.vy) / 165;
    m.vx = Math.abs(m.turn) === 1 ? m.turn * (12 + x * 5) : 0;
    m.spin = 0;
    m.feedback = "牛肉翻起来了！把锅移到影子下面接住。";
  }
  if (input !== "press" || m.cooldown > 0) return;
  if (m.kind === "dial") {
    if (dialReady(m)) {
      m.angle = m.targets[m.score];
      latch(m);
    } else mistake(
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
  m.panHeight += (m.panHeightTarget - m.panHeight) * (1 - Math.exp(-dt * 16));
  if (m.kind === "toss" && !m.flight && m.cooldown === 0) {
    const before = m.faces[m.face];
    m.faces[m.face] = Math.min(1, before + dt / 1.35);
    m.score = m.faces.filter((face) => face >= 1).length;
    m.won = m.score === 6;
    if (m.won) m.feedback = "六面都煎熟，骰子牛出锅！";
    else if (before < 1 && m.faces[m.face] === 1) m.feedback = "这一面金黄了！换个方向甩锅，把没熟的面翻下来。";
  }
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
    m.spin = Math.min(1, (m.clock - m.tossAt) / m.flightSeconds) * 450;
    if (m.y <= 0 && m.vy < 0) {
      m.flight = false;
      m.y = 0;
      if (Math.abs(m.x - m.pan) < 16) {
        m.face = bottomFace(m.rotation);
        m.feedback =
          m.faces[m.face] >= 1
            ? "接住了，不过这面已熟。左右斜甩或反向甩，换一面。"
            : "接住！先在锅里煎到金黄，再翻下一面。";
      } else {
        m.rotation = [...m.fromRotation];
        mistake(
          m,
          "牛肉滑到锅沿，铲回原位了。下一次跟着影子接，已煎熟的面保留。",
        );
      }
    }
  }
  if (m.kind === "eggs") {
    // Ingredients slide under gravity in a curved wok; the liquid responds faster than rice.
    const slide = (
      p: { x: number; z: number; vx: number; vz: number },
      fluid: boolean,
    ) => {
      const force = fluid ? 5 : 4.2;
      p.vx += (m.tiltX * force - p.x * 3.2 - p.vx * 3) * dt;
      p.vz += (m.tiltZ * force - p.z * 3.2 - p.vz * 3) * dt;
      p.x += p.vx * dt;
      p.z += p.vz * dt;
      const radius = Math.hypot(p.x, p.z);
      const rim = fluid ? 0.78 : 0.93;
      if (radius > rim) {
        const nx = p.x / radius;
        const nz = p.z / radius;
        p.x = nx * rim;
        p.z = nz * rim;
        const outward = Math.max(0, p.vx * nx + p.vz * nz);
        p.vx -= outward * nx * 1.4;
        p.vz -= outward * nz * 1.4;
      }
    };
    slide(m.egg, true);
    for (const grain of m.grains) {
      slide(grain, false);
      if (
        Math.hypot(m.tiltX, m.tiltZ) > 0.12 &&
        Math.hypot(grain.x - m.egg.x, grain.z - m.egg.z) < 0.62 &&
        Math.hypot(grain.vx, grain.vz) > 0.12
      ) grain.coat = Math.min(1, grain.coat + dt * 0.38);
    }
    for (let i = 0; i < m.grains.length; i++) for (let j = i + 1; j < m.grains.length; j++) {
        const a = m.grains[i];
          const b = m.grains[j];
        const dx = b.x - a.x;
          const dz = b.z - a.z;
          const distance = Math.hypot(dx, dz);
        if (distance < 0.25 && distance > 0.0001) {
          const push = (0.25 - distance) * 0.5;
          a.x -= (dx / distance) * push;
          a.z -= (dz / distance) * push;
          b.x += (dx / distance) * push;
          b.z += (dz / distance) * push;
        }
      }
    m.score = m.grains.filter((g) => g.coat >= 1).length;
    m.won = m.score === 6;
    m.feedback = m.won
      ? "粒粒裹上金黄蛋液，蛋炒饭出锅！"
      : "缓缓绕圈倾斜铁锅，让白米饭滑过蛋液，变成金黄色。";
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
