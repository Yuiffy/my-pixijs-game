/** ECHO ZERO — shared state contract. Pure data, no three.js / DOM imports. */

export type Phase = 'title' | 'opening' | 'play' | 'paused' | 'dead' | 'ending';

export type Action =
  | 'idle' | 'run' | 'sprint' | 'getup'
  | 'light1' | 'light2' | 'light3' | 'heavy' | 'dashSlash'
  | 'dodge' | 'deflect' | 'guard' | 'hit' | 'deathblow' | 'heal' | 'dead';

export type EnemyKind = 'shambler' | 'runner' | 'boss';
export type EnemyState = 'dormant' | 'chase' | 'tell' | 'strike' | 'recover' | 'stagger' | 'deathblow' | 'dead';
export type AttackId = 'claw' | 'lunge' | 'sweep' | 'slam' | 'shockwave';

export type EffectKind =
  | 'slash' | 'heavySlash' | 'spark' | 'deflect' | 'deathblow' | 'damage'
  | 'heal' | 'checkpoint' | 'shockwave' | 'dust' | 'bossRoar' | 'guardBreak';

export interface Effect {
  id: number;
  kind: EffectKind;
  x: number;
  z: number;
  y: number;
  yaw: number;
  at: number;
  ttl: number;
  power: number;
}

export interface Notice {
  id: number;
  text: string;
  speaker?: string;
  at: number;
  ttl: number;
  tone: 'radio' | 'system' | 'danger' | 'lore';
}

export interface Player {
  x: number; z: number; yaw: number;
  vx: number; vz: number;
  hp: number; maxHp: number;
  stamina: number; maxStamina: number;
  posture: number; maxPosture: number;
  action: Action;
  actionTime: number;
  actionDuration: number;
  actionHit: boolean;
  combo: number;
  comboWindow: number;
  charge: number;
  invuln: number;
  staminaDelay: number;
  guardHeld: boolean;
  flasks: number;
  deaths: number;
  staggerTime: number;
  speed: number;
  hurtFlash: number;
}

export interface Enemy {
  id: number;
  kind: EnemyKind;
  x: number; z: number; yaw: number;
  homeX: number; homeZ: number;
  hp: number; maxHp: number;
  posture: number; maxPosture: number;
  state: EnemyState;
  timer: number;
  attack: AttackId;
  attackHit: boolean;
  aggro: number;
  staggerTime: number;
  flash: number;
  phase: number;
  spawnAt: number;
  dead: boolean;
  active: boolean;
}

export interface CameraState {
  yaw: number;
  pitch: number;
  distance: number;
  shake: number;
  fov: number;
  cinematic: number;
  cinematicBlend: number;
}

export interface Input {
  x: number;
  z: number;
  light: boolean;
  heavy: boolean;
  dodge: boolean;
  deflect: boolean;
  guard: boolean;
  heal: boolean;
  interact: boolean;
  lock: boolean;
  sprint: boolean;
  skip: boolean;
  camX: number;
  camY: number;
}

export interface GameState {
  phase: Phase;
  time: number;
  stage: number;
  objective: string;
  areaName: string;
  player: Player;
  enemies: Enemy[];
  lockId: number | null;
  camera: CameraState;
  checkpoint: { x: number; z: number; lit: boolean };
  effects: Effect[];
  notices: Notice[];
  bossActive: boolean;
  bossDefeated: boolean;
  hitStop: number;
  slowMo: number;
  fade: number;
  deadTimer: number;
  endingTimer: number;
  skipHeld: number;
  hints: { move: boolean; attack: boolean; deflect: boolean; lock: boolean; checkpoint: boolean };
  stats: { hits: number; deflects: number; deathblows: number; damageTaken: number; deaths: number };
  nextId: number;
  tutorialKills: number;
  introLine: number;
}

export const PLAYER_MAX_HP = 130;
export const PLAYER_MAX_STAMINA = 100;
export const PLAYER_MAX_POSTURE = 100;
export const FLASK_MAX = 3;

/** Authored attack timings in seconds: windup, active, recovery. */
export const MOVES: Record<string, { windup: number; active: number; recovery: number; damage: number; posture: number; stamina: number; reach: number; arc: number; lunge: number }> = {
  light1: { windup: 0.13, active: 0.11, recovery: 0.22, damage: 21, posture: 17, stamina: 12, reach: 2.35, arc: 1.25, lunge: 1.05 },
  light2: { windup: 0.12, active: 0.11, recovery: 0.24, damage: 24, posture: 19, stamina: 13, reach: 2.45, arc: 1.3, lunge: 1.15 },
  light3: { windup: 0.2, active: 0.15, recovery: 0.38, damage: 38, posture: 34, stamina: 20, reach: 2.75, arc: 1.6, lunge: 1.7 },
  heavy: { windup: 0.42, active: 0.15, recovery: 0.44, damage: 56, posture: 52, stamina: 27, reach: 3.0, arc: 1.5, lunge: 2.1 },
  dashSlash: { windup: 0.16, active: 0.14, recovery: 0.3, damage: 42, posture: 40, stamina: 24, reach: 3.0, arc: 1.1, lunge: 3.4 },
};

export const ENEMY_STATS: Record<EnemyKind, { hp: number; posture: number; speed: number; aggro: number; range: number; tell: number; strike: number; recover: number; damage: number; postureDamage: number }> = {
  shambler: { hp: 96, posture: 70, speed: 2.05, aggro: 12, range: 2.15, tell: 0.78, strike: 0.24, recover: 0.86, damage: 16, postureDamage: 24 },
  runner: { hp: 78, posture: 58, speed: 3.75, aggro: 15, range: 2.5, tell: 0.5, strike: 0.2, recover: 0.62, damage: 19, postureDamage: 28 },
  boss: { hp: 720, posture: 230, speed: 2.9, aggro: 30, range: 3.15, tell: 0.82, strike: 0.3, recover: 0.72, damage: 28, postureDamage: 42 },
};

export function emptyInput(): Input {
  return {
    x: 0,
z: 0,
light: false,
heavy: false,
dodge: false,
deflect: false,
    guard: false,
heal: false,
interact: false,
lock: false,
sprint: false,
    skip: false,
camX: 0,
camY: 0,
  };
}
