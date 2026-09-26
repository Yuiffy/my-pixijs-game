export type Vec3 = { x: number; y: number; z: number };
export type AttackId = 'light1' | 'light2' | 'light3' | 'heavy' | 'charged' | 'sprintLight' | 'sprintHeavy' | 'airLight' | 'airHeavy';
export type Action = 'idle' | 'light' | 'heavy' | 'charge' | 'dodge' | 'parry' | 'guard' | 'guardRelease' | 'guardBreak' | 'hurt' | 'heal' | 'execute' | 'dead';
export type EnemyKind = 'prowler' | 'guard' | 'duelist' | 'boss';
export type EnemyAction = 'idle' | 'chase' | 'windup' | 'attack' | 'recover' | 'stagger' | 'dead';
export type Player = Vec3 & {
  facing: number; hp: number; stamina: number; action: Action; actionTime: number;
  hitDone: boolean; invulnerable: number; staminaDelay: number; flasks: number;
  dodgeX: number; dodgeZ: number;
  attack: AttackId | null; attackFacing: number; charge: number; combo: number; comboUntil: number;
  jumpHeight: number; jumpVelocity: number; airX: number; airZ: number; airAttackUsed: boolean; landing: number;
  sprintTime: number; dashDown: boolean; dashTime: number; dashUsed: boolean;
  guardImpact: number; parryFlash: number;
  buffer: { action: 'light' | 'heavy' | 'dodge' | 'parry' | 'jump'; until: number } | null;
};
export type Enemy = Vec3 & {
  id: string; kind: EnemyKind; name: string; spawn: Vec3; facing: number;
  hp: number; maxHp: number; posture: number; maxPosture: number;
  action: EnemyAction; timer: number; attackIndex: number; hitDone: boolean;
  phase: number; aggro: boolean; flash: number;
};
export type GameInput = {
  x: number; z: number; sprint?: boolean;
  light?: boolean; heavy?: boolean; dodge?: boolean; parry?: boolean;
  heal?: boolean; interact?: boolean; lock?: boolean; jump?: boolean;
  dashHeld?: boolean; heavyHeld?: boolean; guardHeld?: boolean; aim?: number;
};
export type Effect = Vec3 & { id: number; kind: 'hit' | 'parry' | 'block' | 'dodge' | 'heal' | 'death' | 'reward'; life: number; text?: string };
export type GameState = {
  version: 1; mode: 'title' | 'playing' | 'dead' | 'ending'; paused: boolean;
  player: Player; enemies: Enemy[]; effects: Effect[]; nextEffectId: number;
  time: number; deaths: number; kills: number; parries: number; executions: number;
  rice: number; bankedRice: number; level: number; charm: boolean; shortcut: boolean;
  worldVersion: 3; templeGate: boolean; flaskUpgrade: boolean; litLamps: string[];
  checkpoint: 'courtyard' | 'room'; bossDefeated: boolean; collected: string[];
  visited: string[]; lockedId: string | null; message: string; messageTime: number;
  prompt: string; nearbyId: string | null; region: string;
  bloodstain: (Vec3 & { rice: number }) | null; restCount: number;
  hitstop: number; messageSerial: number; messageKind: 'hint' | 'lore' | 'event'; interpretation: string;
};
export type Surface = {
  id: string; name: string; x1: number; x2: number; z1: number; z2: number;
  y: number; endY?: number; color: string;
};
export type WorldAccess = boolean | { shortcut: boolean; templeGate: boolean };
export type Obstacle = { gateId?: 'temple'; landmarkId?: string; x: number; z: number; w: number; d: number; y: number; h: number; kind: 'pillar' | 'crate' | 'planter' | 'gate' | 'chest' | 'shrine' };
export type Landmark = Vec3 & { id: string; label: string; kind: 'rest' | 'cache' | 'charm' | 'shortcut' | 'food' | 'note' | 'flask' };
export type CameraControl = { yaw: number; pitch: number; distance: number; reset: number };
