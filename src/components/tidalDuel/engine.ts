import { FIGHTERS, getFighter } from "./roster";
import type { HitHeight, MoveDefinition } from "./roster";

export type Character = string;
export type Side = 0 | 1;
export type Mode = "solo" | "local" | "training";
export type Difficulty = "easy" | "normal" | "hard";
export type Phase = "menu" | "intro" | "fight" | "roundEnd" | "result";
export type Action =
  | "left"
  | "right"
  | "jump"
  | "crouch"
  | "punch"
  | "kick"
  | "guard"
  | "hold"
  | "throw"
  | "sidestep"
  | "special";
export type Input = Record<Action, boolean>;
export type FighterState =
  | "idle"
  | "walk"
  | "crouch"
  | "jump"
  | "guard"
  | "hold"
  | "attack"
  | "hit"
  | "critical"
  | "launch"
  | "down"
  | "wake"
  | "sidestep"
  | "victory"
  | "defeat";
export interface Options {
  mode: Mode;
  character: Character;
  opponent: Character;
  difficulty: Difficulty;
  dummy: "idle" | "guard" | "cpu";
  roundSeconds: number;
}
export const WIDTH = 1280;
export const HEIGHT = 720;
export const FLOOR = 610;
export const STEP = 1 / 120;
export const MAX_HP = 300;
export const MAX_METER = 100;
export const ACTIONS: readonly Action[] = [
  "left",
  "right",
  "jump",
  "crouch",
  "punch",
  "kick",
  "guard",
  "hold",
  "throw",
  "sidestep",
  "special",
];
export interface BufferedAction {
  action: Action;
  ttl: number;
  crouch: boolean;
  jump: boolean;
}
export interface Fighter {
  side: Side;
  character: Character;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  facing: -1 | 1;
  hp: number;
  maxHp: number;
  meter: number;
  state: FighterState;
  stateTime: number;
  stateDuration: number;
  move: string | null;
  moveTime: number;
  moveHit: boolean;
  combo: number;
  comboDamage: number;
  comboTime: number;
  stun: number;
  critical: number;
  juggle: number;
  invincible: number;
  holdHeight: HitHeight;
  holdCooldown: number;
  stepCooldown: number;
  buffer: BufferedAction[];
  previous: Input;
  aiTimer: number;
  aiPlan: Input;
  lastDamage: number;
}
export type EventType =
  | "hit"
  | "block"
  | "hold"
  | "throw"
  | "whiff"
  | "critical"
  | "launch"
  | "sidestep"
  | "super"
  | "round"
  | "ko";
export interface GameEvent {
  id: number;
  type: EventType;
  side: Side;
  target: Side;
  x: number;
  y: number;
  z: number;
  text: string;
  ttl: number;
  strength: number;
}
export type Effect = GameEvent;
export interface Game {
  options: Options;
  fighters: [Fighter, Fighter];
  phase: Phase;
  phaseTime: number;
  paused: boolean;
  time: number;
  round: number;
  roundTimer: number;
  wins: [number, number];
  winner: Side | null;
  freeze: number;
  event: string;
  events: GameEvent[];
  camera: { shake: number; zoom: number };
  super: { side: Side; timer: number; name: string } | null;
  training: {
    damage: number;
    hits: number;
    maxCombo: number;
    resetTimer: number;
  };
  seed: number;
  accumulator: number;
  eventId: number;
}
export const emptyInput = (): Input => ({
  left: false,
  right: false,
  jump: false,
  crouch: false,
  punch: false,
  kick: false,
  guard: false,
  hold: false,
  throw: false,
  sidestep: false,
  special: false,
});
export const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n));

const other = (side: Side): Side => (side === 0 ? 1 : 0);
const neutral = (f: Fighter) => ["idle", "walk", "crouch", "jump", "guard"].includes(f.state);
const grounded = (f: Fighter) => f.y >= FLOOR - 0.1;
const rng = (game: Game) => {
  game.seed =
    (((Math.imul(game.seed, 1664525) + 1013904223) % 4294967296) + 4294967296) %
    4294967296;
  return game.seed / 4294967296;
};
function fighter(character: Character, side: Side): Fighter {
  return {
    side,
    character: getFighter(character).id,
    x: side === 0 ? 440 : 840,
    y: FLOOR,
    z: 0,
    vx: 0,
    vy: 0,
    facing: side === 0 ? 1 : -1,
    hp: MAX_HP,
    maxHp: MAX_HP,
    meter: 0,
    state: "idle",
    stateTime: 0,
    stateDuration: 0,
    move: null,
    moveTime: 0,
    moveHit: false,
    combo: 0,
    comboDamage: 0,
    comboTime: 0,
    stun: 0,
    critical: 0,
    juggle: 0,
    invincible: 0,
    holdHeight: "mid",
    holdCooldown: 0,
    stepCooldown: 0,
    buffer: [],
    previous: emptyInput(),
    aiTimer: 0,
    aiPlan: emptyInput(),
    lastDamage: 0,
  };
}
function normalizedOptions(options: Partial<Options>): Options {
  return {
    mode: ["solo", "local", "training"].includes(options.mode ?? "")
      ? (options.mode as Mode)
      : "solo",
    character: getFighter(options.character ?? "sui").id,
    opponent: getFighter(options.opponent ?? "shiori").id,
    difficulty: ["easy", "normal", "hard"].includes(options.difficulty ?? "")
      ? (options.difficulty as Difficulty)
      : "normal",
    dummy: ["idle", "guard", "cpu"].includes(options.dummy ?? "")
      ? (options.dummy as Options["dummy"])
      : "idle",
    roundSeconds: Number.isFinite(options.roundSeconds)
      ? clamp(options.roundSeconds ?? 60, 10, 180)
      : 60,
  };
}
export function createGame(options: Partial<Options> = {}, seed = 73179): Game {
  const resolved = normalizedOptions(options);
  return {
    options: resolved,
    fighters: [fighter(resolved.character, 0), fighter(resolved.opponent, 1)],
    phase: "menu",
    phaseTime: 0,
    paused: false,
    time: 0,
    round: 1,
    roundTimer: resolved.roundSeconds,
    wins: [0, 0],
    winner: null,
    freeze: 0,
    event: "潮汐之间，一招定势。",
    events: [],
    camera: { shake: 0, zoom: 1 },
    super: null,
    training: { damage: 0, hits: 0, maxCombo: 0, resetTimer: 0 },
    seed: ((Math.floor(seed) % 4294967296) + 4294967296) % 4294967296,
    accumulator: 0,
    eventId: 0,
  };
}
function setState(f: Fighter, state: FighterState, duration = 0) {
  f.state = state;
  f.stateTime = 0;
  f.stateDuration = duration;
}
function emit(
  game: Game,
  type: EventType,
  side: Side,
  text: string,
  strength = 1,
) {
  const target = game.fighters[other(side)];
  const event: GameEvent = {
    id: ++game.eventId,
    type,
    side,
    target: target.side,
    x: target.x,
    y: target.y - 147,
    z: target.z,
    text,
    ttl: type === "round" || type === "ko" ? 2.4 : 0.82,
    strength,
  };
  game.events.push(event);
  if (game.events.length > 18) game.events.shift();
  game.event = text;
}
function resetRound(game: Game) {
  const old = game.fighters;
  game.fighters = [
    fighter(game.options.character, 0),
    fighter(game.options.opponent, 1),
  ];
  // Some meter survives between rounds, without granting a free super on round one.
  game.fighters[0].meter = Math.min(65, old[0].meter);
  game.fighters[1].meter = Math.min(65, old[1].meter);
  game.phase = "intro";
  game.phaseTime = 0;
  game.roundTimer = game.options.roundSeconds;
  game.winner = null;
  game.freeze = 0;
  game.super = null;
  game.events = [];
  game.camera = { shake: 0, zoom: 1 };
  emit(
    game,
    "round",
    0,
    game.options.mode === "training"
      ? "自由练习"
      : `ROUND ${String(game.round).padStart(2, "0")}`,
  );
}
export function startGame(game: Game) {
  game.options = normalizedOptions(game.options);
  game.wins = [0, 0];
  game.round = 1;
  game.paused = false;
  game.accumulator = 0;
  game.fighters = [
    fighter(game.options.character, 0),
    fighter(game.options.opponent, 1),
  ];
  game.training = { damage: 0, hits: 0, maxCombo: 0, resetTimer: 0 };
  resetRound(game);
}
export function resetTraining(game: Game, clearStats = true) {
  if (game.options.mode !== "training") return;
  game.fighters = [
    fighter(game.options.character, 0),
    fighter(game.options.opponent, 1),
  ];
  game.phase = "fight";
  game.phaseTime = 0;
  game.roundTimer = game.options.roundSeconds;
  game.freeze = 0;
  game.super = null;
  game.events = [];
  game.event = "练习重置";
  game.training.resetTimer = 0;
  if (clearStats) game.training = { damage: 0, hits: 0, maxCombo: 0, resetTimer: 0 };
  // Training starts with enough energy to practice either character's signature move.
  game.fighters.forEach((f) => {
    f.meter = MAX_METER;
  });
}
export function skipTransition(game: Game) {
  if (game.phase === "intro") {
    game.phase = "fight";
    game.phaseTime = 0;
    game.event = game.options.mode === "training" ? "练习开始" : "FIGHT";
    if (game.options.mode === "training") game.fighters.forEach((f) => {
        f.meter = MAX_METER;
      });
  } else if (game.phase === "roundEnd") {
    if (game.wins.some((wins) => wins >= 2)) {
      game.phase = "result";
      game.phaseTime = 0;
      game.winner = game.wins[0] >= 2 ? 0 : 1;
    } else {
      game.round++;
      resetRound(game);
    }
  }
}
function endRound(game: Game) {
  const [a, b] = game.fighters;
  game.winner = a.hp === b.hp ? null : a.hp > b.hp ? 0 : 1;
  game.phase = "roundEnd";
  game.phaseTime = 0;
  if (game.winner !== null) {
    game.wins[game.winner]++;
    setState(game.fighters[game.winner], "victory");
    setState(game.fighters[other(game.winner)], "defeat");
    emit(
      game,
      "ko",
      game.winner,
      a.hp <= 0 || b.hp <= 0 ? "K.O." : "TIME UP",
      1.5,
    );
  } else {
    setState(a, "idle");
    setState(b, "idle");
    emit(game, "ko", 0, "DRAW · 再战", 1);
  }
  a.move = null;
  b.move = null;
  a.vx = 0;
  b.vx = 0;
  a.vy = 0;
  b.vy = 0;
  a.y = FLOOR;
  b.y = FLOOR;
  a.z = 0;
  b.z = 0;
  game.freeze = 0;
}
function captureInput(f: Fighter, input: Input) {
  // Real keyboards deliver a direction and its hold button a few ticks apart.
  // Accept either order briefly, rather than requiring an impossible same-tick chord.
  if (f.state === "hold" && f.stateTime <= 0.1 && input.hold) {
    if (input.crouch && !f.previous.crouch) f.holdHeight = "low";
    else if (input.jump && !f.previous.jump) f.holdHeight = "high";
  }
  // Defensive chords are resolved before their constituent jump/crouch action.
  const order: Action[] = [
    "hold",
    "special",
    "throw",
    "sidestep",
    "punch",
    "kick",
    "jump",
  ];
  let queued = false;
  order.forEach((action) => {
    if (
      !queued &&
      input[action] &&
      !f.previous[action] &&
      !(action === "jump" && input.hold)
    ) {
      f.buffer.push({
        action,
        ttl: 0.16,
        crouch: input.crouch,
        jump: input.jump,
      });
      queued = true;
    }
  });
  if (f.buffer.length > 6) f.buffer.splice(0, f.buffer.length - 6);
  f.previous = { ...input };
}
function beginMove(game: Game, f: Fighter, id: string) {
  const move = getFighter(f.character).moves[id];
  if (!move || (move.meter && f.meter < move.meter)) return false;
  if (move.meter) {
    f.meter -= move.meter;
    game.super = {
      side: f.side,
      timer: 1.05,
      name: getFighter(f.character).superName,
    };
    game.freeze = Math.max(game.freeze, 0.27);
    emit(game, "super", f.side, move.name, 1.8);
  }
  setState(f, "attack", move.startup + move.active + move.recovery);
  f.move = id;
  f.moveTime = 0;
  f.moveHit = false;
  f.vx = 0;
  f.facing = game.fighters[other(f.side)].x >= f.x ? 1 : -1;
  return true;
}
function consumeBuffer(game: Game, f: Fighter) {
  if (f.hp <= 0) return;
  const current = f.move ? getFighter(f.character).moves[f.move] : null;
  for (let n = 0; n < f.buffer.length; n++) {
    const item = f.buffer[n];
    let used = false;
    const earlyHighChord = item.jump && !item.crouch && f.state === "jump" && f.stateTime <= 0.1 && f.vy < 0 && f.y >= FLOOR - 70;
    if (
      item.action === "hold" &&
      f.holdCooldown <= 0 &&
      ((grounded(f) && ((neutral(f) && f.stun <= 0) || f.state === "critical")) || earlyHighChord)
    ) {
      f.holdHeight = item.crouch ? "low" : item.jump ? "high" : "mid";
      f.holdCooldown = 0.6;
      f.stun = 0;
      f.critical = 0;
      f.move = null;
      f.vx = 0;
      f.vy = 0;
      f.y = FLOOR;
      setState(f, "hold", 0.5);
      used = true;
    } else if (
      (item.action === "punch" || item.action === "kick") &&
      current &&
      f.state === "attack" &&
      current.followups?.[item.action] &&
      f.moveTime >= current.startup + current.active &&
      f.moveTime < f.stateDuration - 0.033
    ) {
      used = beginMove(game, f, current.followups[item.action] as string);
    } else if (neutral(f) && f.stun <= 0) {
      if (item.action === "punch" || item.action === "kick") {
        const id = !grounded(f)
          ? item.action === "punch"
            ? "airPunch"
            : "airKick"
          : item.crouch
            ? item.action === "punch"
              ? "lowPunch"
              : "lowKick"
            : item.action;
        used = beginMove(game, f, id);
      } else if (item.action === "throw" && grounded(f)) used = beginMove(game, f, "throw");
      else if (item.action === "special" && grounded(f)) used = beginMove(game, f, "super");
      else if (item.action === "jump" && grounded(f)) {
        f.vy = -645;
        setState(f, "jump");
        used = true;
      } else if (
        item.action === "sidestep" &&
        grounded(f) &&
        f.stepCooldown <= 0
      ) {
        f.stepCooldown = 0.65;
        f.z = f.z <= 0 ? 0.86 : -0.86;
        f.vx = f.facing * 170;
        setState(f, "sidestep", 0.34);
        emit(game, "sidestep", f.side, "侧移", 0.6);
        used = true;
      }
    }
    if (used) {
      f.buffer.splice(n, 1);
      return;
    }
  }
}
function moveFighter(game: Game, f: Fighter, input: Input, dt: number) {
  f.stateTime += dt;
  f.holdCooldown = Math.max(0, f.holdCooldown - dt);
  f.stepCooldown = Math.max(0, f.stepCooldown - dt);
  f.invincible = Math.max(0, f.invincible - dt);
  f.stun = Math.max(0, f.stun - dt);
  f.critical = Math.max(0, f.critical - dt);
  f.comboTime = Math.max(0, f.comboTime - dt);
  if (f.comboTime <= 0) {
    f.combo = 0;
    f.comboDamage = 0;
  }
  f.buffer.forEach((item) => {
    item.ttl -= dt;
  });
  f.buffer = f.buffer.filter((item) => item.ttl > 0);

  if (f.state === "attack" && f.move) {
    const move = getFighter(f.character).moves[f.move];
    f.moveTime += dt;
    if (move.advance && f.moveTime < move.startup) f.x += (f.facing * move.advance * dt) / move.startup;
    if (f.moveTime >= f.stateDuration) {
      f.move = null;
      setState(f, grounded(f) ? "idle" : "jump");
    }
  } else if ((f.state === "hit" || f.state === "critical") && f.stun <= 0) {
    setState(f, grounded(f) ? "idle" : "jump");
  } else if (f.state === "hold" && f.stateTime >= f.stateDuration) setState(f, "idle");
  else if (f.state === "sidestep" && f.stateTime >= f.stateDuration) {
    setState(f, "idle");
    f.vx = 0;
  } else if (f.state === "down" && f.stateTime >= f.stateDuration) {
    f.invincible = 0.35;
    f.juggle = 0;
    f.critical = 0;
    setState(f, "wake", 0.3);
  } else if (f.state === "wake" && f.stateTime >= f.stateDuration) setState(f, "idle");

  consumeBuffer(game, f);
  if (neutral(f) && f.stun <= 0) {
    f.facing = game.fighters[other(f.side)].x >= f.x ? 1 : -1;
    const direction = Number(input.right) - Number(input.left);
    const { speed } = getFighter(f.character);
    f.vx =
      input.guard || input.crouch
        ? 0
        : direction * speed * (direction === -f.facing ? 0.78 : 1);
    if (grounded(f) && f.vy >= 0) {
      const next = input.guard
        ? "guard"
        : input.crouch
          ? "crouch"
          : direction
            ? "walk"
            : "idle";
      if (next !== f.state) setState(f, next);
    } else if (f.state !== "jump") {
      setState(f, "jump");
    }
  }
  f.x += f.vx * dt;
  if (!neutral(f) && f.state !== "sidestep") f.vx *= Math.exp(-dt * 10);
  if (f.state !== "sidestep") f.z *= Math.exp(-dt * 7);
  if (!grounded(f) || f.vy < 0) {
    f.vy += 1680 * dt;
    f.y += f.vy * dt;
    if (f.y >= FLOOR) {
      f.y = FLOOR;
      f.vy = 0;
      if (f.state === "launch") {
        setState(f, "down", 0.72);
        f.invincible = 0.73;
      } else if (f.state === "jump") setState(f, "idle");
    }
  }
  f.x = clamp(f.x, 88, WIDTH - 88);
}
function applyDamage(
  game: Game,
  attacker: Fighter,
  target: Fighter,
  baseDamage: number,
  move: MoveDefinition,
  counter = false,
) {
  const continuing =
    target.stun > 0 || target.state === "launch" || target.critical > 0;
  attacker.combo =
    continuing && attacker.comboTime > 0 ? attacker.combo + 1 : 1;
  if (attacker.combo === 1) attacker.comboDamage = 0;
  const scale = Math.max(0.45, 1 - (attacker.combo - 1) * 0.13);
  const damage = Math.round(
    baseDamage *
      getFighter(attacker.character).power *
      scale *
      (counter ? 1.2 : 1),
  );
  target.hp = Math.max(0, target.hp - damage);
  target.lastDamage = damage;
  attacker.comboDamage += damage;
  attacker.comboTime = 1.3;
  attacker.meter = clamp(
    attacker.meter + (move.kind === "super" ? 0 : 7 + damage * 0.21),
    0,
    MAX_METER,
  );
  target.meter = clamp(target.meter + damage * 0.32, 0, MAX_METER);
  if (game.options.mode === "training") {
    game.training.damage += damage;
    game.training.hits++;
    game.training.maxCombo = Math.max(game.training.maxCombo, attacker.combo);
  }
  return damage;
}
function knockdown(target: Fighter, duration = 0.7) {
  target.move = null;
  target.buffer = [];
  target.stun = 0;
  target.critical = 0;
  if (!grounded(target)) {
    target.vy = Math.max(target.vy, 80);
    setState(target, "launch");
  } else {
    target.y = FLOOR;
    setState(target, "down", duration);
    target.invincible = duration;
  }
}
function canReach(attacker: Fighter, target: Fighter, move: MoveDefinition) {
  if (
    target.invincible > 0 ||
    target.state === "down" ||
    target.state === "wake" ||
    target.hp <= 0
  ) return false;
  if ((target.x - attacker.x) * attacker.facing < -42) return false;
  if (Math.abs(target.x - attacker.x) > move.reach) return false;
  if (!move.tracking && Math.abs(target.z - attacker.z) > 0.38) return false;
  const targetAir = FLOOR - target.y;
  const attackerAir = FLOOR - attacker.y;
  if (move.kind === "throw" && (targetAir > 12 || attackerAir > 12)) return false;
  if (move.height === "low" && targetAir > 34) return false;
  if (Math.abs(targetAir - attackerAir) > (move.height === "low" ? 74 : 190)) return false;
  const crouching =
    target.state === "crouch" ||
    (target.previous.crouch &&
      grounded(target) &&
      (target.state === "guard" ||
        (target.state === "attack" &&
          target.move &&
          getFighter(target.character).moves[target.move].height === "low")));
  if (move.height === "high" && crouching) return false;
  return true;
}
function resolveMove(
  game: Game,
  attacker: Fighter,
  target: Fighter,
  move: MoveDefinition,
) {
  if (!canReach(attacker, target, move)) return;
  attacker.moveHit = true;
  if (move.kind === "throw") {
    // A committed strike beats a grab, including its startup. Grabs punish guards and failed holds.
    if (
      target.state === "attack" ||
      target.state === "launch" ||
      target.stun > 0
    ) {
      emit(game, "whiff", attacker.side, "摔技落空", 0.5);
      return;
    }
    const punishedHold = target.state === "hold";
    const damage = applyDamage(
      game,
      attacker,
      target,
      move.damage * (punishedHold ? 1.5 : 1),
      move,
    );
    target.x += attacker.facing * move.push;
    target.vx = attacker.facing * 90;
    knockdown(target, 0.82);
    game.freeze = Math.max(game.freeze, 0.105);
    game.camera.shake = 7;
    emit(
      game,
      "throw",
      attacker.side,
      punishedHold ? `破反摔 · ${damage}` : `摔技 · ${damage}`,
      1.4,
    );
    return;
  }
  const holding = target.state === "hold" && target.stateTime <= 0.225;
  if (move.kind !== "super" && holding && target.holdHeight === move.height) {
    const damage = applyDamage(game, target, attacker, 31, move);
    attacker.move = null;
    attacker.vx = -attacker.facing * 180;
    knockdown(attacker, 0.64);
    target.holdCooldown = 0.34;
    setState(target, "idle");
    game.freeze = Math.max(game.freeze, 0.115);
    game.camera.shake = 8;
    emit(game, "hold", target.side, `精准反击 · ${damage}`, 1.4);
    return;
  }
  const crouching = target.previous.crouch;
  const blocking =
    target.state === "guard" &&
    grounded(target) &&
    (move.height === "low" ? crouching : !crouching);
  if (blocking) {
    const chip = move.kind === "super" ? 8 : 0;
    target.hp = Math.max(1, target.hp - chip);
    target.stun = move.kind === "super" ? 0.36 : 0.13;
    target.vx = attacker.facing * (move.kind === "super" ? 95 : 36);
    attacker.meter = clamp(attacker.meter + 3, 0, MAX_METER);
    target.meter = clamp(target.meter + 2, 0, MAX_METER);
    game.freeze = Math.max(game.freeze, 0.038);
    emit(game, "block", attacker.side, "防御", 0.65);
    return;
  }
  const counter =
    target.state === "attack" || (target.state === "hold" && !holding);
  const launched = target.state === "launch";
  const wasCritical = target.critical > 0;
  const damage = applyDamage(
    game,
    attacker,
    target,
    move.damage,
    move,
    counter,
  );
  target.move = null;
  target.buffer = [];
  target.vx = attacker.facing * move.push * 5;
  target.stun = move.stun + (counter ? 0.12 : 0);
  if (launched) {
    target.juggle++;
    if (target.juggle >= 3) knockdown(target);
    else {
      target.vy = Math.min(target.vy, -265 + target.juggle * 45);
      setState(target, "launch");
    }
  } else if (move.launcher && grounded(target)) {
    target.y = FLOOR - 1;
    target.vy = -560;
    target.juggle = 0;
    setState(target, "launch");
    emit(game, "launch", attacker.side, "浮空", 1.25);
  } else if (move.knockdown) knockdown(target);
  else if (move.critical && (counter || wasCritical || attacker.combo > 1)) {
    target.critical = 0.66;
    target.stun = Math.max(target.stun, 0.4);
    setState(target, "critical");
    emit(game, "critical", attacker.side, "CRITICAL STUN", 1.15);
  } else setState(target, "hit");
  game.freeze = Math.max(game.freeze, move.kind === "super" ? 0.15 : 0.065);
  game.camera.shake =
    move.kind === "super" ? 14 : Math.min(8, 3 + damage * 0.11);
  emit(
    game,
    "hit",
    attacker.side,
    `${counter ? "COUNTER · " : ""}${damage}`,
    move.kind === "super" ? 1.8 : 1,
  );
}
function activeMove(f: Fighter) {
  if (f.state !== "attack" || !f.move || f.moveHit) return null;
  const move = getFighter(f.character).moves[f.move];
  return f.moveTime >= move.startup && f.moveTime < move.startup + move.active
    ? move
    : null;
}
function resolveAttacks(game: Game) {
  const moves = game.fighters.map(activeMove);
  // Resolve strikes before throws, independent of player slot. Equal strikes can trade.
  const attacks = game.fighters
    .map((f, n) => ({ fighter: f, move: moves[n] }))
    .filter((item) => item.move !== null);
  attacks.sort(
    (a, b) => Number(a.move?.kind === "throw") - Number(b.move?.kind === "throw"),
  );
  attacks.forEach(({ fighter: attacker, move }) => {
    if (!move || (move.kind === "throw" && attacker.state !== "attack")) return;
    resolveMove(game, attacker, game.fighters[other(attacker.side)], move);
  });
}
export function aiInput(game: Game, side: Side, dt = STEP): Input {
  const f = game.fighters[side];
  const target = game.fighters[other(side)];
  if (game.phase !== "fight" || game.paused) return emptyInput();
  f.aiTimer -= dt;
  if (f.aiTimer > 0) return { ...f.aiPlan };
  const level = game.options.difficulty;
  const reaction = level === "easy" ? 0.29 : level === "normal" ? 0.16 : 0.085;
  f.aiTimer = reaction + rng(game) * reaction * 0.5;
  const input = emptyInput();
  const gap = Math.abs(target.x - f.x);
  const approach: Action = target.x > f.x ? "right" : "left";
  const retreat: Action = target.x > f.x ? "left" : "right";
  const read = target.move
    ? getFighter(target.character).moves[target.move]
    : null;
  const danger =
    read &&
    target.moveTime < read.startup + read.active &&
    gap < read.reach + 25;
  if (
    danger &&
    rng(game) < (level === "easy" ? 0.2 : level === "normal" ? 0.57 : 0.78)
  ) {
    if (read.kind === "throw") input.punch = true;
    else if (
      level === "hard" &&
      read.kind !== "super" &&
      rng(game) < 0.46 &&
      f.holdCooldown <= 0
    ) {
      input.hold = true;
      input.crouch = read.height === "low";
      input.jump = read.height === "high";
    } else if (!read.tracking && level !== "easy" && rng(game) < 0.32) input.sidestep = true;
    else {
      input.guard = true;
      input.crouch = read.height === "low";
    }
  } else if (gap > 174) {
    input[approach] = true;
    if (gap < 235 && rng(game) < 0.24) input.kick = true;
  } else if (gap < 105 && target.state !== "guard" && rng(game) < 0.19) input[retreat] = true;
  else {
    const choice = rng(game);
    if (f.meter >= 100 && gap < 218 && (target.stun > 0 || choice < 0.18)) input.special = true;
    else if (
      (target.state === "guard" || target.state === "hold") &&
      gap < 116 &&
      choice < 0.78
    ) input.throw = true;
    else if (
      f.state === "attack" &&
      f.move &&
      getFighter(f.character).moves[f.move].followups &&
      level !== "easy"
    ) {
      const { previous } = f;
      input.punch = !previous.punch && choice < 0.6;
      input.kick = !previous.kick && !input.punch;
    } else if (choice < 0.37) input.punch = true;
    else if (choice < 0.7) input.kick = true;
    else if (choice < 0.8) {
      input.crouch = true;
      input.kick = true;
    } else if (choice < 0.88) input.sidestep = true;
    else input.guard = true;
  }
  f.aiPlan = input;
  return { ...input };
}
function tick(game: Game, supplied: [Input, Input]) {
  game.time += STEP;
  game.events.forEach((event) => {
    event.ttl -= STEP;
  });
  game.events = game.events.filter((event) => event.ttl > 0);
  game.camera.shake = Math.max(0, game.camera.shake - STEP * 35);
  if (game.super) {
    game.super.timer -= STEP;
    if (game.super.timer <= 0) game.super = null;
  }
  game.camera.zoom += ((game.super ? 1.055 : 1) - game.camera.zoom) * STEP * 8;
  if (game.phase !== "fight") {
    game.phaseTime += STEP;
    if (
      (game.phase === "intro" && game.phaseTime >= 1.45) ||
      (game.phase === "roundEnd" && game.phaseTime >= 2.3)
    ) skipTransition(game);
    return;
  }
  const inputs: [Input, Input] = [{ ...supplied[0] }, { ...supplied[1] }];
  if (
    game.options.mode === "solo" ||
    (game.options.mode === "training" && game.options.dummy === "cpu")
  ) inputs[1] = aiInput(game, 1, STEP);
  else if (game.options.mode === "training") {
    inputs[1] = emptyInput();
    if (game.options.dummy === "guard") {
      inputs[1].guard = true;
      const playerMove = game.fighters[0].move;
      inputs[1].crouch = Boolean(
        playerMove &&
        getFighter(game.fighters[0].character).moves[playerMove].height ===
          "low",
      );
    }
  }
  game.fighters.forEach((f, side) => captureInput(f, inputs[side]));
  if (game.freeze > 0) {
    game.freeze = Math.max(0, game.freeze - STEP);
    return;
  }
  game.phaseTime += STEP;
  if (game.options.mode !== "training") game.roundTimer = Math.max(0, game.roundTimer - STEP);
  game.fighters.forEach((f, side) => moveFighter(game, f, inputs[side], STEP));
  const [a, b] = game.fighters;
  const distance = Math.abs(b.x - a.x);
  if (
    distance < 99 &&
    Math.abs(a.z - b.z) < 0.38 &&
    Math.abs(a.y - b.y) < 175
  ) {
    const direction = b.x >= a.x ? 1 : -1;
    // Clamp the shared centre so pressure against an edge cannot collapse body spacing.
    const centre = clamp((a.x + b.x) / 2, 88 + 49.5, WIDTH - 88 - 49.5);
    a.x = centre - direction * 49.5;
    b.x = centre + direction * 49.5;
  }
  resolveAttacks(game);
  if (game.options.mode === "training") {
    if (a.hp <= 0 || b.hp <= 0) {
      game.training.resetTimer += STEP;
      if (game.training.resetTimer >= 1.2) resetTraining(game, false);
    }
  } else if (a.hp <= 0 || b.hp <= 0 || game.roundTimer <= 0) endRound(game);
}
export function stepGame(game: Game, inputs: [Input, Input], dt = STEP) {
  if (game.paused || !Number.isFinite(dt) || dt <= 0) return;
  // Preserve a short tap even if it arrives between two fixed physics ticks.
  if (game.phase === "fight") {
    captureInput(game.fighters[0], inputs[0]);
    if (game.options.mode === "local") captureInput(game.fighters[1], inputs[1]);
  }
  // Accumulation keeps movement and frame data identical across 30, 60 and 120 Hz displays.
  game.accumulator += Math.min(dt, 0.25);
  while (game.accumulator + 1e-10 >= STEP) {
    game.accumulator = Math.max(0, game.accumulator - STEP);
    tick(game, inputs);
  }
  if (game.accumulator < 1e-10) game.accumulator = 0;
}
export function describeGame(game: Game) {
  const number = (n: number) => Math.round(n * 100) / 100;
  return {
    title: "晴海对决 · 岁己 vs 栞栞",
    coordinates: "1280×720; x向右，y向下；脚底y=610为地面，z∈[-1,1]为侧移深度",
    phase: game.phase,
    paused: game.paused,
    mode: game.options.mode,
    difficulty: game.options.difficulty,
    round: game.round,
    timeRemaining: number(game.roundTimer),
    wins: [...game.wins],
    winner: game.winner,
    fighters: game.fighters.map((f) => ({
      side: f.side,
      character: f.character,
      name: getFighter(f.character).name,
      x: number(f.x),
      y: number(f.y),
      z: number(f.z),
      facing: f.facing,
      hp: f.hp,
      maxHp: f.maxHp,
      meter: number(f.meter),
      state: f.state,
      stateTime: number(f.stateTime),
      move: f.move,
      moveTime: number(f.moveTime),
      combo: f.combo,
      comboDamage: f.comboDamage,
      stun: number(f.stun),
      critical: number(f.critical),
      juggle: f.juggle,
      holdHeight: f.holdHeight,
    })),
    freeze: number(game.freeze),
    event: game.event,
    events: game.events.map((event) => ({
      type: event.type,
      side: event.side,
      text: event.text,
    })),
    training: { ...game.training },
    roster: FIGHTERS.map((f) => ({ id: f.id, name: f.name })),
  };
}
