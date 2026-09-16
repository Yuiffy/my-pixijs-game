export type Vec3 = { x: number; y: number; z: number };
export type Action = 'idle' | 'light' | 'heavy' | 'dodge' | 'parry' | 'hurt' | 'heal' | 'execute' | 'dead';
export type EnemyKind = 'prowler' | 'guard' | 'duelist' | 'boss';
export type EnemyAction = 'idle' | 'chase' | 'windup' | 'attack' | 'recover' | 'stagger' | 'dead';
export type Player = Vec3 & {
  facing: number; hp: number; stamina: number; action: Action; actionTime: number;
  hitDone: boolean; invulnerable: number; staminaDelay: number; flasks: number;
  dodgeX: number; dodgeZ: number;
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
  heal?: boolean; interact?: boolean; lock?: boolean;
};
export type Effect = Vec3 & { id: number; kind: 'hit' | 'parry' | 'dodge' | 'heal' | 'death' | 'reward'; life: number; text?: string };
export type GameState = {
  version: 1; mode: 'title' | 'playing' | 'dead' | 'ending'; paused: boolean;
  player: Player; enemies: Enemy[]; effects: Effect[]; nextEffectId: number;
  time: number; deaths: number; kills: number; parries: number; executions: number;
  rice: number; bankedRice: number; level: number; charm: boolean; shortcut: boolean;
  checkpoint: 'courtyard' | 'room'; bossDefeated: boolean; collected: string[];
  visited: string[]; lockedId: string | null; message: string; messageTime: number;
  prompt: string; nearbyId: string | null; region: string;
  bloodstain: (Vec3 & { rice: number }) | null; restCount: number;
};
export type Surface = {
  id: string; name: string; x1: number; x2: number; z1: number; z2: number;
  y: number; endY?: number; color: string;
};
export type Obstacle = { x: number; z: number; w: number; d: number; y: number; h: number; kind: 'pillar' | 'crate' | 'planter' | 'gate' };
export type Landmark = Vec3 & { id: string; label: string; kind: 'rest' | 'cache' | 'charm' | 'shortcut' | 'food' | 'note' };
export type CameraControl = { yaw: number; pitch: number; distance: number; reset: number };
