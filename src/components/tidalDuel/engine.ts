import { FIGHTERS, getFighter, getSkin } from "./roster";
import type { HitHeight, MoveDefinition } from "./roster";
import { modernCommand } from "./controls";
import type { AttackStrength } from "./controls";

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
  | "light"
  | "medium"
  | "heavy"
  | "ability"
  | "assist"
  | "punch"
  | "kick"
  | "guard"
  | "hold"
  | "throw"
  | "sidestep"
  | "special"
  | "skill"
  | "rise"
  | "burst";
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
  | "defeat"
  | "grabbed";
export interface Options {
  mode: Mode;
  character: Character;
  opponent: Character;
  difficulty: Difficulty;
  dummy: "idle" | "guard" | "cpu";
  roundSeconds: number;
  skin?: string;
  opponentSkin?: string;
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
  "light",
  "medium",
  "heavy",
  "ability",
  "assist",
  "punch",
  "kick",
  "guard",
  "hold",
  "throw",
  "sidestep",
  "special",
  "skill",
  "rise",
  "burst",
];
export interface BufferedAction {
  action: Action;
  ttl: number;
  crouch: boolean;
  jump: boolean;
  move?: string;
  assisted?: AttackStrength;
  modern?: boolean;
  chord?: boolean;
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
  moveSerial: number;
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
  skin: string;
  contact: "none" | "hit" | "block";
  guardGauge: number;
  guardDelay: number;
  burstReady: boolean;
  throwTech: number;
  directions: { value: number; time: number }[];
  history: { command: string; time: number }[];
  assisted: { strength: AttackStrength; index: number; serial: number } | null;
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
  | "ko"
  | "tech"
  | "burst"
  | "cancel"
  | "guardBreak"
  | "projectile";
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Projectile {
  id: number;
  side: Side;
  move: string;
  serial: number;
  x: number;
  y: number;
  velocity: number;
  radius: number;
  ttl: number;
}
interface Grab {
  side: Side;
  target: Side;
  remaining: number;
  punishedHold: boolean;
}
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
    lastContact?: {
      move: string;
      result: string;
      advantage: number;
      damage: number;
    };
    showBoxes?: boolean;
  };
  projectiles: Projectile[];
  grabs: Grab[];
  seed: number;
  accumulator: number;
  eventId: number;
}
export const emptyInput = (): Input => ({
  left: false,
  right: false,
  jump: false,
  crouch: false,
  light: false,
  medium: false,
  heavy: false,
  ability: false,
  assist: false,
  punch: false,
  kick: false,
  guard: false,
  hold: false,
  throw: false,
  sidestep: false,
  special: false,
  skill: false,
  rise: false,
  burst: false,
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
    moveSerial: 0,
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
    skin: "original",
    contact: "none",
    guardGauge: 100,
    guardDelay: 0,
    burstReady: true,
    throwTech: 0,
    directions: [],
    history: [],
    assisted: null,
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
    skin:
      getSkin(getFighter(options.character ?? "sui"), options.skin)?.id ??
      "original",
    opponentSkin:
      getSkin(getFighter(options.opponent ?? "shiori"), options.opponentSkin)
        ?.id ?? "original",
  };
}
export function createGame(options: Partial<Options> = {}, seed = 73179): Game {
  const resolved = normalizedOptions(options);
  const fighters: [Fighter, Fighter] = [
    fighter(resolved.character, 0),
    fighter(resolved.opponent, 1),
  ];
  fighters[0].skin = resolved.skin ?? "original";
  fighters[1].skin = resolved.opponentSkin ?? "original";
  return {
    options: resolved,
    fighters,
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
    projectiles: [],
    grabs: [],
  };
}
function setState(f: Fighter, state: FighterState, duration = 0) {
  f.state = state;
  f.stateTime = 0;
  f.stateDuration = duration;
  if (state !== "attack") f.assisted = null;
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
  game.fighters[0].skin = game.options.skin ?? "original";
  game.fighters[1].skin = game.options.opponentSkin ?? "original";
  game.projectiles = [];
  game.grabs = [];
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
  game.projectiles = [];
  game.grabs = [];
  game.fighters[0].skin = game.options.skin ?? "original";
  game.fighters[1].skin = game.options.opponentSkin ?? "original";
  game.events = [];
  game.event = "练习重置";
  game.training.resetTimer = 0;
  if (clearStats) game.training = {
      damage: 0,
      hits: 0,
      maxCombo: 0,
      resetTimer: 0,
      showBoxes: game.training.showBoxes,
    };
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
  game.projectiles = [];
  game.grabs = [];
}
function captureInput(game: Game, f: Fighter, input: Input) {
  const modern = modernCommand(input, f.previous);
  const horizontal = (Number(input.right) - Number(input.left)) * f.facing;
  const vertical = input.crouch ? -1 : input.jump ? 1 : 0;
  const direction =
    vertical < 0
      ? 2 + horizontal
      : vertical > 0
        ? 8 + horizontal
        : 5 + horizontal;
  f.directions = f.directions.filter((item) => game.time - item.time < 0.45);
  if (f.directions[f.directions.length - 1]?.value !== direction) f.directions.push({ value: direction, time: game.time });
  if ((input.throw && !f.previous.throw) || modern?.action === "throw") f.throwTech = 0.16;
  // Real keyboards deliver a direction and its hold button a few ticks apart.
  // Accept either order briefly, rather than requiring an impossible same-tick chord.
  if (
    f.state === "hold" &&
    f.stateTime <= 0.1 &&
    (input.hold || (input.light && input.heavy))
  ) {
    if (input.crouch && !f.previous.crouch) f.holdHeight = "low";
    else if (input.jump && !f.previous.jump) f.holdHeight = "high";
  }
  // Defensive chords are resolved before their constituent jump/crouch action.
  const order: Action[] = [
    "burst",
    "hold",
    "special",
    "throw",
    "sidestep",
    "skill",
    "rise",
    "punch",
    "kick",
    "jump",
  ];
  let queued = false;
  if (modern) {
    if (modern.chord) f.buffer = f.buffer.filter((item) => !item.modern);
    const motion =
      !modern.assisted &&
      (modern.action === "punch" || modern.action === "kick")
        ? recognizeMotion(f, modern.action)
        : undefined;
    f.buffer.push({
      ...modern,
      modern: true,
      ttl: 0.16,
      crouch: input.crouch,
      jump: input.jump,
      move: motion,
    });
    const names: Partial<Record<Action, string>> = {
      punch: "轻",
      kick: "中",
      heavy: "重",
      skill: "必杀",
      rise: "↓必杀",
      throw: "轻+中",
      special: "重+必杀",
      burst: "辅助+必杀",
      hold: "轻+重",
      sidestep: "中+重",
    };
    f.history.push({
      command: `${modern.assisted ? "辅助·" : ""}${names[modern.action] ?? modern.action}`,
      time: game.time,
    });
    if (f.history.length > 9) f.history.shift();
    if (motion) f.directions = [];
    queued = true;
  }
  order.forEach((action) => {
    if (
      !queued &&
      input[action] &&
      !f.previous[action] &&
      !(action === "jump" && input.hold)
    ) {
      f.buffer.push({
        action: action === "special" && input.guard ? "burst" : action,
        ttl: 0.16,
        crouch: input.crouch,
        jump: input.jump,
        move:
          action === "punch" || action === "kick"
            ? recognizeMotion(f, action)
            : undefined,
      });
      const motion = f.buffer[f.buffer.length - 1].move;
      const symbols: Partial<Record<Action, string>> = {
        punch: "P",
        kick: "K",
        throw: "T",
        hold: "H",
        sidestep: "D",
        skill: "S",
        rise: "R",
        special: "超",
        burst: "脱",
      };
      f.history.push({
        command:
          motion === "signature"
            ? "↓↘→P"
            : motion === "reversal"
              ? "→↓↘K"
              : `${input.crouch ? "↓" : input.jump ? "↑" : ""}${symbols[action] ?? "↑"}`,
        time: game.time,
      });
      if (f.history.length > 9) f.history.shift();
      if (motion) f.directions = [];
      queued = true;
    }
  });
  if (f.buffer.length > 6) f.buffer.splice(0, f.buffer.length - 6);
  f.previous = { ...input };
}
function recognizeMotion(f: Fighter, action: Action): string | undefined {
  const sequence = f.directions
    .filter((item) => item.value !== 5)
    .map((item) => item.value);
  const ending = sequence.slice(-3).join("");
  if (action === "kick" && ending === "623") return "reversal";
  if (action === "punch" && ending === "236") return "signature";
  return undefined;
}
function beginMove(game: Game, f: Fighter, id: string) {
  const move = getFighter(f.character).moves[id];
  if (!move || (move.meter && f.meter < move.meter)) return false;
  if (move.projectile && game.projectiles.some((p) => p.side === f.side)) return false;
  if (move.meter) f.meter -= move.meter;
  f.assisted = null;
  if (move.kind === "super") {
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
  f.moveSerial++;
  f.moveHit = false;
  f.contact = "none";
  if (move.invulnerability) f.invincible = Math.max(f.invincible, move.invulnerability);
  f.vx = 0;
  f.facing = game.fighters[other(f.side)].x >= f.x ? 1 : -1;
  return true;
}

const ASSISTED_ROUTES: Record<AttackStrength, readonly string[]> = {
  light: ["punch", "punch2", "punch3"],
  medium: ["kick", "kickPunch", "signature"],
  heavy: ["punch", "punch2", "launcher", "super"],
};
function beginAssisted(
  game: Game,
  f: Fighter,
  strength: AttackStrength,
  index: number,
) {
  const id = ASSISTED_ROUTES[strength][index];
  if (!id || !beginMove(game, f, id)) return false;
  f.assisted = { strength, index, serial: f.moveSerial };
  return true;
}

export function holdingBack(f: Fighter): boolean {
  return Number(f.previous.right) - Number(f.previous.left) === -f.facing;
}
function canBlock(f: Fighter, move: MoveDefinition): boolean {
  if (!grounded(f) || !neutral(f)) return false;
  if (
    !(f.previous.guard || holdingBack(f) || (f.state === "guard" && f.stun > 0))
  ) return false;
  return move.height === "low"
    ? f.previous.crouch
    : !move.overhead || !f.previous.crouch;
}

function consumeBuffer(game: Game, f: Fighter) {
  if (f.hp <= 0) return;
  const current = f.move ? getFighter(f.character).moves[f.move] : null;
  for (let n = 0; n < f.buffer.length; n++) {
    const item = f.buffer[n];
    let used = false;
    // A human chord can arrive a few ticks apart. Replace only an untouched
    // startup, refunding its cost before charging the intended command once.
    if (
      item.chord &&
      current &&
      f.state === "attack" &&
      f.contact === "none" &&
      !f.moveHit &&
      f.moveTime <= 0.07 &&
      ["throw", "special", "hold", "sidestep"].includes(item.action)
    ) {
      const refunded = current.meter ?? 0;
      if (item.action !== "special" || f.meter + refunded >= 100) {
        f.meter = Math.min(MAX_METER, f.meter + refunded);
        f.move = null;
        f.invincible = 0;
        setState(f, "idle");
      }
    }
    const earlyHighChord =
      item.jump &&
      !item.crouch &&
      f.state === "jump" &&
      f.stateTime <= 0.1 &&
      f.vy < 0 &&
      f.y >= FLOOR - 70;
    if (
      item.action === "burst" &&
      f.meter >= 50 &&
      f.burstReady &&
      (["hit", "critical", "launch"].includes(f.state) ||
        (f.state === "guard" && f.stun > 0))
    ) {
      f.meter -= 50;
      f.burstReady = false;
      f.stun = 0;
      f.critical = 0;
      f.juggle = 0;
      f.vy = 0;
      f.vx = 0;
      f.y = FLOOR;
      f.move = null;
      f.invincible = 0.35;
      const target = game.fighters[other(f.side)];
      target.x = clamp(
        target.x + (target.x >= f.x ? 160 : -160),
        88,
        WIDTH - 88,
      );
      target.move = null;
      target.stun = 0.2;
      target.vx = target.x >= f.x ? 140 : -140;
      setState(target, "hit");
      setState(f, "wake", 0.2);
      game.freeze = Math.max(game.freeze, 0.08);
      game.projectiles = game.projectiles.filter((p) => p.side === f.side);
      emit(game, "burst", f.side, "BREAK · 脱身", 1.6);
      used = true;
    } else if (item.assisted && grounded(f)) {
      if (neutral(f) && f.stun <= 0) {
        used = beginAssisted(game, f, item.assisted, 0);
      } else if (
        current &&
        f.state === "attack" &&
        f.contact === "hit" &&
        f.assisted?.strength === item.assisted &&
        f.assisted.serial === f.moveSerial &&
        f.moveTime >= current.startup + current.active &&
        f.moveTime < f.stateDuration - 0.033
      ) {
        used = beginAssisted(game, f, item.assisted, f.assisted.index + 1);
      }
    } else if (
      item.action === "sidestep" &&
      current &&
      f.state === "attack" &&
      f.contact === "hit" &&
      f.meter >= 50 &&
      current.kind !== "super"
    ) {
      f.meter -= 50;
      f.move = null;
      f.stun = 0;
      f.x = clamp(f.x + f.facing * 58, 88, WIDTH - 88);
      setState(f, "idle");
      emit(game, "cancel", f.side, "DRIVE CANCEL", 1.3);
      used = true;
    } else if (
      current?.kind === "strike" &&
      f.state === "attack" &&
      grounded(f) &&
      f.contact === "hit" &&
      f.moveTime >= current.startup &&
      f.moveTime < current.startup + current.active + current.recovery * 0.7 &&
      (item.action === "skill" || item.action === "rise" || item.move)
    ) {
      used = beginMove(
        game,
        f,
        item.move ?? (item.action === "rise" ? "reversal" : "signature"),
      );
    } else if (
      item.action === "hold" &&
      f.holdCooldown <= 0 &&
      ((grounded(f) &&
        ((neutral(f) && f.stun <= 0) || f.state === "critical")) ||
        earlyHighChord)
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
      (item.action === "punch" ||
        item.action === "kick" ||
        item.action === "skill") &&
      current &&
      f.state === "attack" &&
      current.followups?.[item.action] &&
      (current.kind !== "skill" || f.contact !== "none") &&
      f.moveTime >= current.startup + current.active &&
      f.moveTime < f.stateDuration - 0.033
    ) {
      used = beginMove(game, f, current.followups[item.action] as string);
    } else if (neutral(f) && f.stun <= 0) {
      if (
        item.action === "punch" ||
        item.action === "kick" ||
        item.action === "heavy"
      ) {
        const id =
          (grounded(f) ? item.move : undefined) ??
          (!grounded(f)
            ? item.action === "punch"
              ? "airPunch"
              : "airKick"
            : item.crouch
              ? item.action === "punch"
                ? "lowPunch"
                : "lowKick"
              : item.action === "heavy"
                ? "kick2"
                : item.action);
        used = beginMove(game, f, id);
      } else if (item.action === "throw" && grounded(f)) used = beginMove(game, f, "throw");
      else if (
        (item.action === "skill" || item.action === "rise") &&
        grounded(f)
      ) used = beginMove(
          game,
          f,
          item.action === "skill" ? "signature" : "reversal",
        );
      else if (item.action === "special" && grounded(f)) used = beginMove(game, f, "super");
      else if (item.action === "jump" && grounded(f)) {
        f.vy = -780;
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
  f.throwTech = Math.max(0, f.throwTech - dt);
  f.guardDelay = Math.max(0, f.guardDelay - dt);
  if (f.guardDelay <= 0 && f.state !== "guard") f.guardGauge = Math.min(100, f.guardGauge + dt * 18);
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
    if (move.projectile && !f.moveHit && f.moveTime >= move.startup) {
      f.moveHit = true;
      game.projectiles.push({
        id: ++game.eventId,
        side: f.side,
        move: move.id,
        serial: f.moveSerial,
        x: f.x + f.facing * 75,
        y: f.y - 100,
        velocity: f.facing * move.projectile.speed,
        radius: move.projectile.radius,
        ttl: move.projectile.lifetime,
      });
      emit(game, "projectile", f.side, move.name, 0.8);
    }
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
export const intersects = (a: Box, b: Box) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
export function fighterBoxes(f: Fighter): {
  hurt: Box[];
  attack: Box | null;
  push: Box;
} {
  const crouching = f.state === "crouch" || (f.previous.crouch && grounded(f));
  const height = crouching ? 160 : 310;
  const hurt: Box[] = [{ x: f.x - 35, y: f.y - height, w: 70, h: height - 12 }];
  const move =
    f.state === "attack" && f.move
      ? getFighter(f.character).moves[f.move]
      : null;
  let attack: Box | null = null;
  if (
    move &&
    !move.projectile &&
    f.moveTime >= move.startup &&
    f.moveTime < move.startup + move.active
  ) {
    const top =
      move.animation === "rise"
        ? -420
        : move.kind === "throw"
          ? -245
          : move.height === "high"
            ? -265
            : move.height === "low"
              ? -75
              : -220;
    const bottom =
      move.kind === "throw"
        ? -35
        : move.height === "high"
          ? -155
          : move.height === "low"
            ? -12
            : -75;
    attack = {
      x: f.facing > 0 ? f.x + 26 : f.x - move.reach,
      y: f.y + top,
      w: move.reach - 26,
      h: bottom - top,
    };
  }
  return { hurt, attack, push: { x: f.x - 49.5, y: f.y - 150, w: 99, h: 150 } };
}
function contactInfo(
  game: Game,
  f: Fighter,
  move: MoveDefinition,
  result: string,
  damage: number,
  stun: number,
  recovery?: number,
) {
  if (game.options.mode !== "training") return;
  game.training.lastContact = {
    move: move.name,
    result,
    damage,
    advantage: Math.round(
      (stun -
        (recovery ??
          Math.max(
            0,
            move.startup + move.active + move.recovery - f.moveTime,
          ))) *
        60,
    ),
  };
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
  if (
    Math.abs(targetAir - attackerAir) >
    (move.animation === "rise" ? 330 : move.height === "low" ? 74 : 190)
  ) return false;
  const crouching =
    target.state === "crouch" ||
    (target.previous.crouch &&
      grounded(target) &&
      (target.state === "guard" ||
        (target.state === "attack" &&
          target.move &&
          getFighter(target.character).moves[target.move].height === "low")));
  if (move.height === "high" && crouching) return false;
  const { attack } = fighterBoxes(attacker);
  if (
    attack &&
    !fighterBoxes(target).hurt.some((box) => intersects(attack, box))
  ) return false;
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
    if (target.throwTech > 0) {
      target.move = null;
      attacker.move = null;
      setState(target, "idle");
      setState(attacker, "idle");
      target.x = clamp(target.x + attacker.facing * 40, 88, WIDTH - 88);
      attacker.x = clamp(attacker.x - attacker.facing * 40, 88, WIDTH - 88);
      game.freeze = Math.max(game.freeze, 0.055);
      emit(game, "tech", attacker.side, "THROW TECH · 拆投", 1.2);
      contactInfo(game, attacker, move, "拆投", 0, 0);
      return;
    }
    // A committed strike beats a grab, including its startup. Grabs punish guards and failed holds.
    if (
      target.state === "attack" ||
      target.state === "launch" ||
      target.stun > 0
    ) {
      emit(game, "whiff", attacker.side, "摔技落空", 0.5);
      return;
    }
    game.grabs.push({
      side: attacker.side,
      target: target.side,
      remaining: 0.14,
      punishedHold: target.state === "hold",
    });
    target.move = null;
    target.buffer = [];
    target.vx = 0;
    setState(target, "grabbed", 0.14);
    return;
  }
  const holding = target.state === "hold" && target.stateTime <= 0.225;
  if (move.kind !== "super" && holding && target.holdHeight === move.height) {
    target.contact = "hit";
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
  const blocking = canBlock(target, move);
  if (blocking) {
    setState(target, "guard");
    attacker.contact = "block";
    const chip = move.kind === "super" ? 8 : 0;
    target.hp = Math.max(1, target.hp - chip);
    target.stun = move.blockStun ?? (move.kind === "super" ? 0.36 : 0.13);
    target.guardGauge = Math.max(
      0,
      target.guardGauge -
        (move.guardDamage ?? (move.kind === "super" ? 32 : move.damage * 0.48)),
    );
    target.guardDelay = 1.25;
    if (target.guardGauge <= 0) {
      target.stun = 0.75;
      target.guardGauge = 40;
      setState(target, "critical");
      emit(game, "guardBreak", attacker.side, "GUARD BREAK", 1.4);
    }
    contactInfo(
      game,
      attacker,
      move,
      target.state === "critical" ? "破防" : "被防御",
      chip,
      target.stun,
    );
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
  attacker.contact = "hit";
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
  contactInfo(
    game,
    attacker,
    move,
    move.knockdown
      ? "命中·倒地"
      : move.launcher || launched
        ? "命中·浮空"
        : counter
          ? "反制命中"
          : "命中",
    damage,
    target.stun,
  );
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
function resolveGrabs(game: Game) {
  game.grabs = game.grabs.filter((grab) => {
    const attacker = game.fighters[grab.side];
    const target = game.fighters[grab.target];
    const move = getFighter(attacker.character).moves.throw;
    if (
      attacker.state !== "attack" ||
      attacker.move !== "throw" ||
      target.state !== "grabbed"
    ) {
      if (target.state === "grabbed") setState(target, "idle");
      return false;
    }
    if (target.throwTech > 0) {
      target.stun = 0;
      target.move = null;
      attacker.move = null;
      target.buffer = [];
      attacker.buffer = [];
      target.throwTech = 0;
      attacker.throwTech = 0;
      setState(target, "idle");
      setState(attacker, "idle");
      target.x = clamp(target.x + attacker.facing * 55, 88, WIDTH - 88);
      attacker.x = clamp(attacker.x - attacker.facing * 30, 88, WIDTH - 88);
      game.freeze = Math.max(game.freeze, 0.055);
      emit(game, "tech", target.side, "THROW TECH · 拆投", 1.2);
      contactInfo(game, attacker, move, "拆投", 0, 0);
      return false;
    }
    grab.remaining -= STEP;
    if (grab.remaining > 0) return true;
    const damage = applyDamage(
      game,
      attacker,
      target,
      move.damage * (grab.punishedHold ? 1.5 : 1),
      move,
    );
    attacker.contact = "hit";
    target.x = clamp(target.x + attacker.facing * move.push, 88, WIDTH - 88);
    target.vx = attacker.facing * 90;
    knockdown(target, 0.82);
    game.freeze = Math.max(game.freeze, 0.105);
    game.camera.shake = 7;
    emit(
      game,
      "throw",
      attacker.side,
      `${grab.punishedHold ? "破反摔" : "摔技"} · ${damage}`,
      1.4,
    );
    contactInfo(game, attacker, move, "投技命中", damage, 0.82);
    return false;
  });
}
function resolveProjectiles(game: Game) {
  game.projectiles.forEach((p) => {
    p.x += p.velocity * STEP;
    p.ttl -= STEP;
  });
  for (const a of game.projectiles) for (const b of game.projectiles) {
      if (
        a.side !== b.side &&
        a.ttl > 0 &&
        b.ttl > 0 &&
        Math.abs(a.x - b.x) < a.radius + b.radius
      ) {
        a.ttl = 0;
        b.ttl = 0;
      }
    }
  for (const p of game.projectiles) {
    if (p.ttl <= 0) continue;
    const source = game.fighters[p.side];
    const target = game.fighters[other(p.side)];
    if (
      target.invincible > 0 ||
      ["down", "wake", "defeat", "grabbed"].includes(target.state) ||
      Math.abs(target.z) > 0.38
    ) continue;
    const box = {
      x: p.x - p.radius,
      y: p.y - p.radius,
      w: p.radius * 2,
      h: p.radius * 2,
    };
    if (!fighterBoxes(target).hurt.some((hurt) => intersects(box, hurt))) continue;
    const move = getFighter(source.character).moves[p.move];
    const sameMove =
      source.state === "attack" &&
      source.move === p.move &&
      source.moveSerial === p.serial;
    const remaining =
      source.state === "attack"
        ? Math.max(0, source.stateDuration - source.moveTime)
        : source.stun;
    if (
      target.state === "hold" &&
      target.holdHeight === move.height &&
      target.stateTime <= 0.225
    ) {
      target.meter = clamp(target.meter + 12, 0, MAX_METER);
      setState(target, "idle");
      emit(game, "hold", target.side, "潮波化解", 1.2);
      contactInfo(game, source, move, "潮波化解", 0, 0, remaining);
    } else if (canBlock(target, move)) {
      setState(target, "guard");
      if (sameMove) source.contact = "block";
      target.stun = move.blockStun ?? 0.22;
      target.guardGauge = Math.max(
        0,
        target.guardGauge - (move.guardDamage ?? 17),
      );
      target.guardDelay = 1.25;
      target.vx = Math.sign(p.velocity) * 80;
      const guardBroken = target.guardGauge <= 0;
      if (guardBroken) {
        target.guardGauge = 40;
        target.stun = 0.75;
        setState(target, "critical");
        emit(game, "guardBreak", p.side, "GUARD BREAK", 1.4);
      }
      emit(game, "block", p.side, "潮波防御", 0.8);
      contactInfo(
        game,
        source,
        move,
        guardBroken ? "破防" : "被防御",
        0,
        target.stun,
        remaining,
      );
      source.meter = clamp(source.meter + 3, 0, MAX_METER);
      target.meter = clamp(target.meter + 2, 0, MAX_METER);
      game.freeze = Math.max(game.freeze, 0.038);
    } else {
      const airborne = !grounded(target);
      const counter = target.state === "attack";
      const damage = applyDamage(
        game,
        source,
        target,
        move.damage,
        move,
        counter,
      );
      target.move = null;
      target.buffer = [];
      target.stun = move.stun + (counter ? 0.12 : 0);
      target.vx = Math.sign(p.velocity) * move.push * 5;
      if (airborne) {
        target.juggle++;
        if (target.juggle >= 3) knockdown(target);
        else {
          target.vy = Math.min(target.vy, -220 + target.juggle * 40);
          setState(target, "launch");
        }
      } else setState(target, "hit");
      if (sameMove) source.contact = "hit";
      game.freeze = Math.max(game.freeze, 0.065);
      game.camera.shake = 5;
      emit(game, "hit", p.side, `潮波 · ${damage}`, 1.1);
      contactInfo(
        game,
        source,
        move,
        airborne ? "命中·浮空" : counter ? "反制命中" : "命中",
        damage,
        target.stun,
        remaining,
      );
    }
    p.ttl = 0;
  }
  game.projectiles = game.projectiles.filter(
    (p) => p.ttl > 0 && p.x > -80 && p.x < WIDTH + 80,
  );
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
  const zoning = Boolean(getFighter(f.character).moves.signature.projectile);
  const reaction =
    level === "easy"
      ? 0.29
      : level === "normal"
        ? zoning
          ? 0.14
          : 0.16
        : 0.085;
  f.aiTimer = reaction + rng(game) * reaction * 0.5;
  const input = emptyInput();
  const choice = rng(game);
  const gap = Math.abs(target.x - f.x);
  const approach: Action = target.x > f.x ? "right" : "left";
  const retreat: Action = target.x > f.x ? "left" : "right";
  const info = getFighter(f.character);
  const current = f.move ? info.moves[f.move] : null;
  const read = target.move
    ? getFighter(target.character).moves[target.move]
    : null;
  const danger =
    read &&
    target.moveTime < read.startup + read.active &&
    gap < read.reach + 25;
  const wave = game.projectiles.find(
    (p) => p.side !== side &&
      (f.x - p.x) * p.velocity > 0 &&
      Math.abs(f.x - p.x) < 240,
  );
  const fire = (action: Action) => {
    input[action] = !f.previous[action];
  };
  if (f.state === "grabbed") {
    if (choice < (level === "hard" ? 0.75 : level === "normal" ? 0.45 : 0.16)) fire("throw");
  } else if (
    ["critical", "launch", "hit"].includes(f.state) &&
    f.burstReady &&
    f.meter >= 50 &&
    f.hp < 210 &&
    choice < (level === "hard" ? 0.65 : level === "normal" ? 0.35 : 0.12)
  ) fire("burst");
  else if (
    current &&
    f.state === "attack" &&
    f.contact !== "none" &&
    f.moveTime >= current.startup + current.active - 0.06 &&
    level !== "easy"
  ) {
    if (current.followups?.skill) fire("skill");
    else if (f.contact === "hit" && current.kind === "strike" && choice < 0.5) fire("skill");
    else if (current.followups?.punch || current.followups?.kick) fire(choice < 0.6 && current.followups.punch ? "punch" : "kick");
  } else if (wave && neutral(f)) {
    if (level !== "easy" && choice < 0.28) fire("sidestep");
    else if (level === "hard" && choice < 0.53) fire("jump");
    else if (level === "hard" && choice < 0.68) fire("hold");
    else input.guard = true;
  } else if (
    danger &&
    choice < (level === "easy" ? 0.2 : level === "normal" ? 0.57 : 0.78)
  ) {
    if (read.kind === "throw") fire("punch");
    else if (
      level !== "easy" &&
      read.kind !== "super" &&
      rng(game) < (level === "hard" ? 0.35 : 0.28) &&
      f.holdCooldown <= 0
    ) {
      fire("hold");
      input.crouch = read.height === "low";
      input.jump = read.height === "high";
    } else if (!read.tracking && level !== "easy" && rng(game) < 0.28) fire("sidestep");
    else {
      input.guard = true;
      input.crouch = read.height === "low";
    }
  } else if (
    target.y < FLOOR - 35 &&
    gap < 170 &&
    f.meter >= 25 &&
    level !== "easy"
  ) fire("rise");
  else if (
    info.moves.signature.projectile &&
    gap > 270 &&
    gap < 800 &&
    choice < 0.65
  ) fire("skill");
  else if (
    info.moves.signature.projectile &&
    gap > 175 &&
    gap <= info.moves.kick.reach &&
    choice < 0.5
  ) fire("kick");
  else if (gap > 205) {
    input[approach] = true;
    if (!info.moves.signature.projectile && gap < 295 && choice < 0.42) fire("skill");
    else if (gap < info.moves.kick.reach + 20 && choice < 0.25) fire("kick");
    else if (level === "hard" && gap < 400 && choice < 0.1) fire("jump");
  } else if (info.moves.signature.projectile && gap > 140 && choice < 0.3) input[retreat] = true;
  else if (f.meter >= 100 && gap < 218 && (target.stun > 0 || choice < 0.14)) fire("special");
  else if (
    (target.state === "guard" || target.state === "hold") &&
    gap < 116 &&
    choice < 0.78
  ) fire("throw");
  else if (choice < 0.32) fire(gap < info.moves.punch.reach ? "punch" : "kick");
  else if (choice < 0.59) fire("kick");
  else if (choice < 0.72 && !info.moves.signature.projectile) fire("skill");
  else if (choice < 0.84) {
    input.crouch = true;
    fire("kick");
  } else if (choice < 0.92) fire("sidestep");
  else input.guard = true;
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
  game.fighters.forEach((f, side) => captureInput(game, f, inputs[side]));
  if (game.freeze > 0) {
    game.freeze = Math.max(0, game.freeze - STEP);
    return;
  }
  game.phaseTime += STEP;
  if (game.options.mode !== "training") game.roundTimer = Math.max(0, game.roundTimer - STEP);
  game.fighters.forEach((f, side) => moveFighter(game, f, inputs[side], STEP));
  resolveGrabs(game);
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
  resolveProjectiles(game);
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
    captureInput(game, game.fighters[0], inputs[0]);
    if (game.options.mode === "local") captureInput(game, game.fighters[1], inputs[1]);
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
    title: "潮夜格斗 · 岁己 vs 栞栞",
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
      skin: f.skin,
      guardGauge: number(f.guardGauge),
      burstReady: f.burstReady,
      contact: f.contact,
      inputs: f.history.map((item) => item.command),
      boxes: game.training.showBoxes ? fighterBoxes(f) : undefined,
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
    projectiles: game.projectiles.map((p) => ({
      side: p.side,
      x: number(p.x),
      y: number(p.y),
      ttl: number(p.ttl),
    })),
    grabs: game.grabs.map((grab) => ({ ...grab })),
  };
}
