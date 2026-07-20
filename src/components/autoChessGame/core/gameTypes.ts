import type {
  AttackType,
  AugmentId,
  EnergyProfileId,
  PlayerLevel,
  StarterId,
  UnitId,
} from "./gameData";

export type GamePhase =
  | "title"
  | "preparation"
  | "battle"
  | "result"
  | "augment"
  | "gameover";

export type Team = "player" | "enemy";

export interface OwnedUnit {
  uid: number;
  id: UnitId;
  star: 1 | 2 | 3;
}

export interface UnitLocation {
  zone: "board" | "bench";
  index: number;
}

export interface BattleEffect {
  kind: "line" | "ring" | "burst" | "text" | "heal";
  x: number;
  y: number;
  x2?: number;
  y2?: number;
  color: string;
  text?: string;
  life: number;
  maxLife: number;
  size?: number;
}

export interface Projectile {
  sourceFid: string;
  team: Team;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  radius: number;
  remainingRange: number;
  damage: number;
  burnPower: number;
  color: string;
  size: number;
}

export interface MechanicalRabbitPet {
  id: string;
  ownerFid: string;
  team: Team;
  x: number;
  y: number;
  radius: number;
  life: number;
  maxLife: number;
  moveSpeed: number;
  range: number;
  fireTimer: number;
  targetFid: string | null;
  repositionX: number | null;
  repositionY: number | null;
  returning: boolean;
  aimX: number;
  aimY: number;
  attackPulse: number;
}

export interface Fighter {
  fid: string;
  unitId: UnitId;
  team: Team;
  star: 1 | 2 | 3;
  x: number;
  y: number;
  radius: number;
  hp: number;
  maxHp: number;
  shield: number;
  attack: number;
  armor: number;
  range: number;
  baseRange: number;
  attackInterval: number;
  moveSpeed: number;
  cooldown: number;
  energy: number;
  maxEnergy: number;
  energyPerSecond: number;
  energyOnAttack: number;
  energyOnHit: number;
  energyStyle: EnergyProfileId;
  attackType: AttackType;
  stun: number;
  burnTime: number;
  burnDps: number;
  burnSourceFid: string | null;
  lifesteal: number;
  burnOnHitPower: number;
  spiceBurnOnHitPower: number;
  dodgeChance: number;
  dwarfMember: boolean;
  gluttonyHolder: boolean;
  growthStacks: number;
  emberMember: boolean;
  emberAttackPerStack: number;
  emberAttackStacks: number;
  emberAttackStackCap: number;
  syncAvMember: boolean;
  syncAvDirection: -1 | 0 | 1;
  gen27Member: boolean;
  gen27Buffed: boolean;
  matureMember: boolean;
  matureMoveFloor: number;
  matureAttackSpeed: number;
  matureAttackSpeedCurrent: number;
  abilityAttackSpeed: number;
  abilityAttackSpeedTime: number;
  abilityMoveSpeed: number;
  abilityMoveSpeedTime: number;
  slowTime: number;
  weakenTime: number;
  weakenArmorPenalty: number;
  baseAttack: number;
  baseAttackInterval: number;
  baseMoveSpeed: number;
  yueGangMember: boolean;
  lowHealthBonus: number;
  critChance: number;
  critMultiplier: number;
  castRefund: number;
  secondWindUsed: boolean;
  enraged: boolean;
  attackPulse: number;
  facingX: -1 | 1;
  attackTargetX: number;
  attackTargetY: number;
  hitPulse: number;
  applePieShotsRemaining: number;
  applePieShotTimer: number;
  jumpPending: boolean;
  jumpDelay: number;
  jumpTime: number;
  jumpDuration: number;
  jumpFromX: number;
  jumpFromY: number;
  jumpToX: number;
  jumpToY: number;
  targetFid: string | null;
  targetLock: number;
  progressAnchorDistance: number;
  progressWindowTime: number;
  stuckTime: number;
  avoidSide: -1 | 1;
  avoidTime: number;
  damageDealt: number;
  healingDone: number;
  shieldingDone: number;
  damageTaken: number;
  alive: boolean;
}

export type RankingMetric = "damage" | "support" | "taken";

export interface ProjectileVolleyShot {
  sourceFid: string;
  targetFid: string;
  delay: number;
  damage: number;
  burnPower: number;
  speed: number;
  color: string;
  size: number;
}

export interface BattleState {
  elapsed: number;
  limit: number;
  player: Fighter[];
  enemy: Fighter[];
  effects: BattleEffect[];
  projectiles: Projectile[];
  projectileVolley: ProjectileVolleyShot[];
  pets: MechanicalRabbitPet[];
  petSerial: number;
  fieldMedicTimer: number;
  gluttonyTimer: number;
  emberTimer: number;
  yueGangTimer: number;
  matureTimer: number;
  banner: string;
  bannerTimer: number;
  rankingOpen: boolean;
  rankingMetric: RankingMetric;
}

export interface RoundResult {
  won: boolean;
  headline: string;
  detail: string;
  income: number;
  upgradeDiscount: number;
  damage: number;
}

export interface ToastState {
  text: string;
  tone: "info" | "good" | "bad";
  time: number;
}

export interface AugmentSelection {
  round: number;
  id: AugmentId;
}

export interface StarterSelection {
  id: StarterId;
}

export interface GameState {
  phase: GamePhase;
  seed: number;
  visualTime: number;
  round: number;
  maxRounds: number;
  endlessUnlocked: boolean;
  hp: number;
  maxHp: number;
  gold: number;
  playerLevel: PlayerLevel;
  upgradeRemaining: number;
  score: number;
  bestScore: number;
  streak: number;
  victories: number;
  starter: StarterId | null;
  starterChoices: StarterId[];
  starterHistory: StarterSelection[];
  board: Array<OwnedUnit | null>;
  bench: Array<OwnedUnit | null>;
  shop: Array<UnitId | null>;
  shopLocked: boolean;
  selected: UnitLocation | null;
  augments: AugmentId[];
  augmentHistory: AugmentSelection[];
  augmentChoices: AugmentId[];
  incomeBonus: number;
  paydayDebtRounds: number;
  battle: BattleState | null;
  result: RoundResult | null;
  finalWon: boolean;
  toast: ToastState | null;
}
