export type Character = keyof typeof CHARACTERS;
export type Side = 0 | 1;
export type Mode = "solo" | "local" | "practice";
export type Difficulty = "easy" | "normal" | "hard";
export type Phase = "menu" | "intro" | "serve" | "rally" | "point" | "result";
export type Action =
  | "left"
  | "right"
  | "jump"
  | "hit"
  | "dive"
  | "special"
  | "aimUp"
  | "aimDown";
export type ShotLift = "lob" | "drive" | "down";
export type ShotDepth = "near" | "middle" | "deep";
export interface ShotAim {
  lift: ShotLift;
  depth: ShotDepth;
}
export const SHOT_NAMES = { lob: "高吊", drive: "平抽", down: "下压" };
export const DEPTH_NAMES = { near: "近网", middle: "中场", deep: "底线" };
export type Input = Record<Action, boolean>;
export const WIDTH = 1280;
export const HEIGHT = 720;
export const FLOOR = 606;
export const NET_X = 640;
export const NET_TOP = 366;
export const BALL_RADIUS = 18;
export const STEP = 1 / 120;
const GRAVITY = 1270;
export const CHARACTERS = {
  sui: {
    name: "岁己",
    latin: "SUI",
    color: "#a898e6",
    special: "晴空流星",
    line: "这一球，飞到晴空去！",
    energyName: "晴空",
    ballSpeed: 980,
    gravityBefore: 1,
    gravityAfter: 1,
    victoryImage: "sui-victory-v2.webp",
  },
  shiori: {
    name: "栞栞",
    latin: "SHIORI",
    color: "#62c6c0",
    special: "潮汐回旋",
    line: "听见了吗？海浪的声音。",
    energyName: "潮汐",
    ballSpeed: 765,
    gravityBefore: 0.7,
    gravityAfter: 1.52,
    victoryImage: null,
  },
  nagisa: {
    name: "米汀",
    latin: "NAGISA",
    color: "#c4d4e7",
    special: "星屑折光",
    line: "找到破绽了。看这道星光！",
    energyName: "星屑",
    ballSpeed: 865,
    gravityBefore: 0.9,
    gravityAfter: 1.18,
    victoryImage: null,
  },
};
export const CHARACTER_IDS = Object.keys(CHARACTERS) as Character[];
export interface Options {
  mode: Mode;
  character: Character;
  opponent: Character;
  difficulty: Difficulty;
  target: number;
}
export interface Player {
  character: Character;
  x: number;
  y: number;
  vx: number;
  vy: number;
  energy: number;
  swing: number;
  dive: number;
  cooldown: number;
  special: number;
  pose: number;
  facing: number;
  lastInput: Input;
  aiTarget: number;
  aiTimer: number;
  aim: ShotAim;
  shotAim: ShotAim | null;
}
export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  spin: number;
  lastHit: Side | null;
  lock: number;
  power: Character | null;
  shot?: ShotAim;
}
export interface Effect {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}
export interface GameEvent {
  id: number;
  type:
    | "hit"
    | "spike"
    | "special"
    | "point"
    | "jump"
    | "net"
    | "serve"
    | "win";
  side: Side;
}
export interface Game {
  options: Options;
  phase: Phase;
  phaseTime: number;
  time: number;
  paused: boolean;
  players: [Player, Player];
  ball: Ball;
  score: [number, number];
  server: Side;
  pointWinner: Side | null;
  winner: Side | null;
  rally: number;
  bestRally: number;
  hits: [number, number];
  specials: [number, number];
  effects: Effect[];
  trail: { x: number; y: number }[];
  freeze: number;
  cutin: Side | null;
  message: string;
  event: GameEvent | null;
  eventId: number;
  seed: number;
}
export const emptyInput = (): Input => ({
  left: false,
  right: false,
  jump: false,
  hit: false,
  dive: false,
  special: false,
  aimUp: false,
  aimDown: false,
});
export function readAim(input: Input, side: Side): ShotAim {
  const forward = side === 0 ? input.right : input.left;
  const backward = side === 0 ? input.left : input.right;
  return {
    lift: input.aimDown ? "down" : input.aimUp || input.jump ? "lob" : "drive",
    depth: forward === backward ? "middle" : forward ? "deep" : "near",
  };
}
// Solve an arc to the chosen landing point, then give it enough airtime to clear the net.
// The same vector powers the real shot and its preview.
export function shotVector(
  ball: Pick<Ball, "x" | "y">,
  side: Side,
  aim: ShotAim,
  power: Character | null = null,
) {
  const dir = side === 0 ? 1 : -1;
  const target = NET_X + dir * { near: 140, middle: 325, deep: 545 }[aim.depth];
  const distance = Math.max(80, Math.abs(target - ball.x));
  const clearance = NET_TOP - BALL_RADIUS - 22;
  if (power) {
    const vx =
      dir *
      CHARACTERS[power].ballSpeed *
      { near: 0.76, middle: 1, deep: 1.1 }[aim.depth];
    const toNet = Math.max(90, Math.abs(NET_X - ball.x)) / Math.abs(vx);
    const needed =
      (clearance -
        ball.y -
        (GRAVITY * CHARACTERS[power].gravityBefore * toNet * toNet) / 2) /
      toNet;
    const vy = Math.max(
      -1100,
      Math.min(
        aim.lift === "lob" ? -680 : aim.lift === "down" ? 230 : -70,
        needed - (aim.lift === "lob" ? 160 : 30),
      ),
    );
    return { vx, vy, target, time: distance / Math.abs(vx) };
  }
  // Clear the entire net collision band, including the descending far edge.
  const minimum = Math.max(
    ...[-1, 1].map((edge) => {
      const fraction = clamp(
        ((NET_X + dir * edge * (BALL_RADIUS + 10) - ball.x) * dir) / distance,
        0.025,
        0.975,
      );
      return Math.sqrt(
        Math.max(
          0,
          (2 *
            (ball.y + (FLOOR - BALL_RADIUS - ball.y) * fraction - clearance)) /
            (GRAVITY * fraction * (1 - fraction)),
        ),
      );
    }),
  );
  const preferred = { lob: 1.5, drive: 0.94, down: 0.61 }[aim.lift];
  const time = Math.max(
    minimum + { lob: 0.4, drive: 0.16, down: 0.025 }[aim.lift],
    preferred,
  );
  return {
    vx: (dir * distance) / time,
    vy: (FLOOR - BALL_RADIUS - ball.y - (GRAVITY * time * time) / 2) / time,
    target,
    time,
  };
}
export const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const other = (side: Side): Side => (side === 0 ? 1 : 0);
const random = (g: Game) => {
  g.seed = (g.seed * 1664525 + 1013904223) % 4294967296;
  return g.seed / 4294967296;
};
function player(character: Character, side: Side): Player {
  return {
    character,
    x: side === 0 ? 295 : 985,
    y: FLOOR,
    vx: 0,
    vy: 0,
    energy: 36,
    swing: 0,
    dive: 0,
    cooldown: 0,
    special: 0,
    pose: 0,
    facing: side === 0 ? 1 : -1,
    lastInput: emptyInput(),
    aiTarget: side === 0 ? 295 : 985,
    aiTimer: 0,
    aim: { lift: "drive", depth: "middle" },
    shotAim: null,
  };
}
export function createGame(options: Partial<Options> = {}, seed = 74129): Game {
  const config: Options = {
    mode: "solo",
    character: "sui",
    opponent:
      options.character && options.character !== "sui" ? "sui" : "shiori",
    difficulty: "normal",
    target: 7,
    ...options,
  };
  return {
    options: config,
    phase: "menu",
    phaseTime: 0,
    time: 0,
    paused: false,
    players: [player(config.character, 0), player(config.opponent, 1)],
    ball: {
      x: 295,
      y: FLOOR - 230,
      vx: 0,
      vy: 0,
      spin: 0,
      lastHit: null,
      lock: 0,
      power: null,
    },
    score: [0, 0],
    server: 0,
    pointWinner: null,
    winner: null,
    rally: 0,
    bestRally: 0,
    hits: [0, 0],
    specials: [0, 0],
    effects: [],
    trail: [],
    freeze: 0,
    cutin: null,
    message: "把这个夏天，打成好球。",
    event: null,
    eventId: 0,
    seed,
  };
}
function emit(g: Game, type: GameEvent["type"], side: Side) {
  g.eventId += 1;
  g.event = { id: g.eventId, type, side };
}
export function startGame(g: Game) {
  g.phase = "intro";
  g.phaseTime = 0;
  g.paused = false;
}
export function prepareServe(g: Game) {
  g.phase = "serve";
  g.phaseTime = 0;
  g.trail = [];
  g.freeze = 0;
  g.cutin = null;
  g.rally = 0;
  g.players.forEach((p, i) => {
    p.x = i === 0 ? 295 : 985;
    p.y = FLOOR;
    p.vx = 0;
    p.vy = 0;
    p.dive = 0;
    p.swing = 0;
    p.special = 0;
    p.cooldown = 0;
    p.pose = 0;
    p.lastInput = emptyInput();
    p.aim = { lift: "drive", depth: "middle" };
    p.shotAim = null;
  });
  const p = g.players[g.server];
  g.ball = {
    x: p.x,
    y: FLOOR - 220,
    vx: 0,
    vy: 0,
    spin: 0,
    lastHit: null,
    lock: 0,
    power: null,
  };
  g.message = `${CHARACTERS[p.character].name}发球`;
}
export function skipTransition(g: Game) {
  if (g.phase === "intro") prepareServe(g);
  else if (g.phase === "point") finishPoint(g);
  else if (g.freeze > 0) {
    g.freeze = 0;
    g.cutin = null;
  }
}
function particles(
  g: Game,
  x: number,
  y: number,
  color: string,
  count: number,
  strength: number,
) {
  for (let i = 0; i < count; i++) {
    const angle = random(g) * Math.PI * 2;
    const speed = (0.3 + random(g) * 0.7) * strength;
    const life = 0.35 + random(g) * 0.45;
    g.effects.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life,
      maxLife: life,
      color,
      size: 2 + random(g) * 5,
    });
  }
  if (g.effects.length > 160) g.effects.splice(0, g.effects.length - 160);
}
function point(g: Game, side: Side) {
  g.phase = "point";
  g.phaseTime = 0;
  g.pointWinner = side;
  g.server = side;
  g.score[side] += 1;
  g.bestRally = Math.max(g.bestRally, g.rally);
  g.players.forEach((p) => {
    p.energy = Math.min(100, p.energy + 12);
    p.special = 0;
    p.vx = 0;
  });
  g.ball.vx = 0;
  g.ball.vy = 0;
  g.ball.y = FLOOR - BALL_RADIUS;
  g.message = `${CHARACTERS[g.players[side].character].name} · 好球！`;
  particles(g, g.ball.x, FLOOR, "#f4d29a", 26, 230);
  emit(g, "point", side);
}
function finishPoint(g: Game) {
  const side = g.pointWinner ?? 0;
  const goal = g.options.target;
  if (
    g.options.mode !== "practice" &&
    g.score[side] >= goal &&
    (g.score[side] - g.score[other(side)] >= 2 || g.score[side] >= goal + 4)
  ) {
    g.phase = "result";
    g.phaseTime = 0;
    g.winner = side;
    g.message = `${CHARACTERS[g.players[side].character].name}获胜`;
    emit(g, "win", side);
  } else prepareServe(g);
}
export function predictLanding(ball: Ball, atY = FLOOR - BALL_RADIUS): number {
  const t = Math.max(
    0,
    (-ball.vy +
      Math.sqrt(
        Math.max(0, ball.vy * ball.vy + 2 * GRAVITY * (atY - ball.y)),
      )) /
      GRAVITY,
  );
  const range = WIDTH - BALL_RADIUS * 2;
  const raw = ball.x + ball.vx * t - BALL_RADIUS;
  const wrapped = ((raw % (range * 2)) + range * 2) % (range * 2);
  return BALL_RADIUS + (wrapped > range ? range * 2 - wrapped : wrapped);
}
export function aiInput(g: Game, side: Side, dt: number): Input {
  const p = g.players[side];
  const b = g.ball;
  const input = emptyInput();
  const setting = g.options.difficulty;
  const error = setting === "easy" ? 78 : setting === "hard" ? 9 : 32;
  p.aiTimer -= dt;
  if (p.aiTimer <= 0) {
    p.aiTimer = setting === "easy" ? 0.28 : setting === "hard" ? 0.065 : 0.15;
    const own = side === 0 ? b.x < NET_X : b.x > NET_X;
    p.aiTarget =
      own || (side === 0 ? b.vx < -50 : b.vx > 50)
        ? predictLanding(b, FLOOR - (setting === "easy" ? 125 : 280)) +
          (random(g) - 0.5) * error * 2
        : side === 0
          ? 360
          : 920;
    p.aiTarget = clamp(
      p.aiTarget,
      side === 0 ? 65 : 699,
      side === 0 ? 581 : 1215,
    );
  }
  if (g.phase === "serve") {
    input.hit = g.server === side && g.phaseTime > 1.1;
    return input;
  }
  const difference = p.aiTarget - p.x;
  input.left = difference < -16;
  input.right = difference > 16;
  const close = Math.abs(b.x - p.x) < (setting === "easy" ? 110 : 165);
  const onOwn = side === 0 ? b.x < NET_X - 15 : b.x > NET_X + 15;
  input.jump =
    close &&
    onOwn &&
    b.y < FLOOR - (setting === "easy" ? 210 : 290) &&
    b.y > 160 &&
    b.vy > -170 &&
    p.y >= FLOOR - 1;
  input.hit = close && onOwn && b.y > p.y - 250 && b.y < p.y - 60;
  input.special = input.hit && p.energy >= 100 && setting !== "easy";
  input.aimDown = input.hit && b.y < NET_TOP - 30 && setting !== "easy";
  input.aimUp = input.hit && !input.aimDown && setting === "easy";
  if (input.hit && !p.lastInput.hit && setting !== "easy") {
    const deep = Math.abs(g.players[other(side)].x - NET_X) < 325;
    input.left = side === 0 ? !deep : deep;
    input.right = !input.left;
  }
  input.dive =
    onOwn &&
    b.y > FLOOR - 90 &&
    Math.abs(b.x - p.x) > 95 &&
    Math.abs(b.x - p.x) < 250;
  return input;
}
function movePlayer(g: Game, p: Player, side: Side, input: Input, dt: number) {
  p.swing = Math.max(0, p.swing - dt);
  p.dive = Math.max(0, p.dive - dt);
  p.cooldown = Math.max(0, p.cooldown - dt);
  p.special = Math.max(0, p.special - dt);
  p.aim = readAim(input, side);
  if (p.swing <= 0 && p.special <= 0) p.shotAim = null;
  const axis = Number(input.right) - Number(input.left);
  const speed =
    side === 1 && g.options.mode !== "local"
      ? { easy: 288, normal: 345, hard: 386 }[g.options.difficulty]
      : 368;
  if (p.dive <= 0) p.vx += (axis * speed - p.vx) * Math.min(1, dt * 24);
  if (axis !== 0) p.facing = axis;
  if (input.jump && !p.lastInput.jump && p.y >= FLOOR - 0.01 && p.dive <= 0) {
    p.vy = -760;
    particles(g, p.x, FLOOR, "#e9c28c", 9, 95);
    emit(g, "jump", side);
  }
  if (input.hit && !p.lastInput.hit && p.swing <= 0) {
    p.swing = 0.27;
    p.shotAim = { ...p.aim };
  }
  if (input.special && !p.lastInput.special && p.energy >= 100) {
    p.special = 1.0;
    p.swing = 0.4;
    p.shotAim = { ...p.aim };
  }
  if (input.dive && !p.lastInput.dive && p.cooldown <= 0 && p.y >= FLOOR - 10) {
    p.dive = 0.42;
    p.cooldown = 1.0;
    p.vx = (axis || (g.ball.x >= p.x ? 1 : -1)) * 760;
    particles(g, p.x, FLOOR, "#e9c28c", 15, 170);
  }
  p.x = clamp(
    p.x + p.vx * dt,
    side === 0 ? 55 : NET_X + 57,
    side === 0 ? NET_X - 57 : WIDTH - 55,
  );
  p.vy += GRAVITY * 1.18 * dt;
  p.y = Math.min(FLOOR, p.y + p.vy * dt);
  if (p.y >= FLOOR) p.vy = 0;
  p.pose =
    p.dive > 0
      ? 3
      : p.swing > 0 && p.y < FLOOR - 20
        ? 5
        : p.y < FLOOR - 8
          ? 4
          : p.swing > 0
            ? 3
            : Math.abs(p.vx) > 60
              ? 1 + (Math.floor(g.time * 10) % 2)
              : 0;
  p.lastInput = { ...input };
}
function hitBall(g: Game, p: Player, side: Side) {
  const b = g.ball;
  const dir = side === 0 ? 1 : -1;
  const charged = p.special > 0 && p.energy >= 100;
  const smash = p.swing > 0 && p.y < FLOOR - 32 && b.y < NET_TOP + 25;
  const distance = Math.max(120, Math.abs(NET_X - b.x));
  // Ballistic arc clears the net from anywhere on the player's half.
  b.vx =
    dir *
    (charged
      ? CHARACTERS[p.character].ballSpeed
      : smash
        ? 700
        : 450 + Math.abs(p.vx) * 0.13);
  const toNet = distance / Math.abs(b.vx);
  const needed = (NET_TOP - 45 - b.y - 0.5 * GRAVITY * toNet * toNet) / toNet;
  b.vy = charged
    ? Math.min(-70, needed - 70)
    : smash
      ? Math.min(160, needed - 25)
      : Math.min(-570, needed - 35);
  b.vy = Math.max(-940, b.vy);
  const aim = p.shotAim;
  if (aim) {
    const vector = shotVector(b, side, aim, charged ? p.character : null);
    b.vx = vector.vx;
    b.vy = vector.vy;
    b.shot = { ...aim };
  } else {
    b.shot = undefined;
  }
  b.lock = 0.2;
  b.lastHit = side;
  b.power = charged ? p.character : null;
  if (p.swing <= 0) p.swing = 0.13;
  p.pose = smash || charged ? 5 : 3;
  p.energy = charged ? 0 : Math.min(100, p.energy + (smash ? 21 : 14));
  g.rally += 1;
  g.hits[side] += 1;
  g.bestRally = Math.max(g.bestRally, g.rally);
  g.message = charged
    ? CHARACTERS[p.character].special
    : aim
      ? `${SHOT_NAMES[aim.lift]} · ${DEPTH_NAMES[aim.depth]}`
      : smash
        ? "漂亮扣杀！"
        : g.rally >= 5
          ? `${g.rally} 连续回合`
          : "接得漂亮";
  particles(
    g,
    b.x,
    b.y,
    charged ? CHARACTERS[p.character].color : "#ffffff",
    charged ? 32 : 12,
    charged ? 390 : 175,
  );
  if (charged) {
    g.freeze = 0.75;
    g.cutin = side;
    g.specials[side] += 1;
    p.special = 0;
    p.swing = 0.32;
    emit(g, "special", side);
  } else emit(g, smash ? "spike" : "hit", side);
}
function updateBall(g: Game, dt: number) {
  const b = g.ball;
  const oldX = b.x;
  const oldY = b.y;
  b.lock = Math.max(0, b.lock - dt);
  if (b.power && b.lastHit !== null) {
    const crossed = b.lastHit === 0 ? b.x > NET_X + 45 : b.x < NET_X - 45;
    b.vy +=
      GRAVITY *
      (crossed
        ? CHARACTERS[b.power].gravityAfter
        : CHARACTERS[b.power].gravityBefore) *
      dt;
  } else b.vy += GRAVITY * dt;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.spin += (b.vx * dt) / 65;
  if (b.x < BALL_RADIUS || b.x > WIDTH - BALL_RADIUS) {
    b.x = clamp(b.x, BALL_RADIUS, WIDTH - BALL_RADIUS);
    b.vx *= -0.83;
  }
  if (b.y < BALL_RADIUS + 12) {
    b.y = BALL_RADIUS + 12;
    b.vy = Math.abs(b.vy) * 0.7;
  }
  if (Math.abs(b.x - NET_X) < BALL_RADIUS + 7 && b.y > NET_TOP - BALL_RADIUS) {
    if (oldY <= NET_TOP - BALL_RADIUS && b.vy > 0) {
      b.y = NET_TOP - BALL_RADIUS;
      b.vy = -Math.max(220, Math.abs(b.vy) * 0.68);
      if (Math.abs(b.vx) < 80) b.vx = (b.x < NET_X ? -1 : 1) * 120;
    } else {
      b.x = NET_X + (oldX < NET_X ? -1 : 1) * (BALL_RADIUS + 8);
      b.vx *= -0.72;
    }
    b.power = null;
    particles(g, NET_X, Math.max(NET_TOP, b.y), "#fff8df", 6, 90);
    emit(g, "net", b.lastHit ?? 0);
  }
  g.players.forEach((p, i) => {
    const side = i as Side;
    if (b.lock > 0 || (side === 0 ? b.x > NET_X - 8 : b.x < NET_X + 8)) return;
    const centerY = p.y - (p.dive > 0 ? 48 : 118);
    const reachX = p.dive > 0 ? 104 : p.swing > 0 ? 79 : 66;
    const reachY = p.dive > 0 ? 50 : p.swing > 0 ? 103 : 85;
    const distance =
      ((b.x - p.x) / reachX) ** 2 + ((b.y - centerY) / reachY) ** 2;
    if (distance < 1 && (b.vy > -160 || p.swing > 0 || b.lastHit !== side)) hitBall(g, p, side);
  });
  if (b.y >= FLOOR - BALL_RADIUS) point(g, b.x < NET_X ? 1 : 0);
  if (Math.floor(g.time * 60) !== Math.floor((g.time - dt) * 60)) {
    g.trail.unshift({ x: b.x, y: b.y });
    if (g.trail.length > 15) g.trail.pop();
  }
}
export function stepGame(g: Game, inputs: [Input, Input], dt = STEP) {
  if (g.paused) return;
  g.time += dt;
  g.effects.forEach((p) => {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 320 * dt;
  });
  g.effects = g.effects.filter((p) => p.life > 0);
  if (g.freeze > 0) {
    g.freeze = Math.max(0, g.freeze - dt);
    if (!g.freeze) g.cutin = null;
    return;
  }
  g.phaseTime += dt;
  if (g.phase === "menu" || g.phase === "result") return;
  if (g.phase === "intro") {
    if (g.phaseTime > 3.2) prepareServe(g);
    return;
  }
  if (g.phase === "point") {
    g.players.forEach((p, i) => {
      p.pose = i === g.pointWinner ? 6 : 7;
      p.y += (FLOOR - p.y) * Math.min(1, dt * 10);
    });
    if (g.phaseTime > 2.3) finishPoint(g);
    return;
  }
  const activeInputs: [Input, Input] = [
    inputs[0],
    g.options.mode === "local" ? inputs[1] : aiInput(g, 1, dt),
  ];
  if (g.phase === "serve") {
    const p = g.players[g.server];
    p.aim = readAim(activeInputs[g.server], g.server);
    g.ball.x = p.x;
    g.ball.y = FLOOR - 223 + Math.sin(g.time * 3) * 5;
    if (
      activeInputs[g.server].hit ||
      activeInputs[g.server].jump ||
      g.phaseTime > 3.5
    ) {
      g.phase = "rally";
      g.phaseTime = 0;
      const shot = shotVector(g.ball, g.server, p.aim);
      g.ball.vx = shot.vx;
      g.ball.vy = shot.vy;
      g.ball.shot = { ...p.aim };
      g.ball.lastHit = g.server;
      g.ball.lock = 0.35;
      p.swing = 0.25;
      g.message = "好球，开始！";
      emit(g, "serve", g.server);
    }
    return;
  }
  g.players.forEach((p, i) => movePlayer(g, p, i as Side, activeInputs[i], dt));
  updateBall(g, dt);
}
export function describeGame(g: Game) {
  return {
    coordinateSystem:
      "1280x720, origin top-left, +x right, +y down; feet on sand y=606; net x=640 top=366",
    phase: g.phase,
    paused: g.paused,
    mode: g.options.mode,
    difficulty: g.options.difficulty,
    score: g.score,
    target: g.options.target,
    server: g.server,
    winner: g.winner,
    rally: g.rally,
    bestRally: g.bestRally,
    message: g.message,
    cutin: g.cutin,
    freeze: +g.freeze.toFixed(2),
    ball: { ...g.ball, x: +g.ball.x.toFixed(1), y: +g.ball.y.toFixed(1) },
    players: g.players.map((p) => ({
      character: p.character,
      x: +p.x.toFixed(1),
      y: +p.y.toFixed(1),
      energy: p.energy,
      pose: p.pose,
      diving: p.dive > 0,
      specialArmed: p.special > 0,
      aim: p.aim,
      armedAim: p.shotAim,
    })),
    hits: g.hits,
    specials: g.specials,
    event: g.event,
  };
}
