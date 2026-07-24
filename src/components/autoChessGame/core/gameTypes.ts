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
  kind: "line" | "ring" | "burst" | "text" | "heal" | "chronosphere" | "hotpot";
  x: number;
  y: number;
  x2?: number;
  y2?: number;
  color: string;
  text?: string;
  emoji?: boolean;
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
  /** 弹幕视觉样式：默认光点，或指定 emoji */
  style?: "default" | "shark" | "carrot" | "pine_needle" | "coin" | "lollipop" | "fireball";
  /** 命中后对附近敌人造成伤害与灼烧的半径。 */
  splashRadius?: number;
  /** 有值时以 emoji 绘制弹幕（优先于默认光点） */
  emoji?: string;
}

export interface ChronosphereZone {
  x: number;
  y: number;
  radius: number;
  life: number;
  maxLife: number;
  color: string;
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

/** 大黑鼠「迎客松」召唤的固定松树炮台 */
export interface PineTreeTurret {
  id: string;
  ownerFid: string;
  team: Team;
  x: number;
  y: number;
  radius: number;
  life: number;
  maxLife: number;
  range: number;
  fireTimer: number;
  attackPulse: number;
}

export interface AbilityMotion {
  kind: "dash" | "jump" | "push";
  abilityId: UnitId | null;
  targetFid: string | null;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  time: number;
  duration: number;
  arcHeight: number;
  hitFids: string[];
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
  /** 被嘲讽时只能以指定单位为攻击目标 */
  tauntedByFid: string | null;
  tauntTime: number;
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
  /** 同步视听根据战力差计算出的效果强度，供战斗表现使用。 */
  syncAvStrength: number;
  gen27Member: boolean;
  gen27Buffed: boolean;
  matureMember: boolean;
  matureMoveFloor: number;
  matureAttackSpeed: number;
  matureAttackSpeedCurrent: number;
  vanguardMember: boolean;
  vanguardKnockback: number;
  /** 怕死后跳抛物线弧高（视觉抬升像素） */
  vanguardJumpArc: number;
  vanguardJumpCooldown: number;
  danceMember: boolean;
  danceDashCooldown: number;
  danceDashTime: number;
  danceDashDodge: number;
  /** 小红帽攻击弹幕：能量锁定并缓慢消耗 */
  barrageActive: boolean;
  barrageDrainPerSecond: number;
  /** 蛙梓歌唱形态的全队治疗节拍。 */
  cinderSongPulseTimer: number;
  abilityAttackBonus: number;
  abilityAttackBonusTime: number;
  /** 变身等持续技能提供的临时吸血 */
  abilityLifesteal: number;
  abilityLifestealTime: number;
  /** 仅作用于下一次普攻的额外吸血 */
  nextAttackLifesteal: number;
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
  /** 泽音美乐蒂的涅槃重生是否已经触发 */
  reborn: boolean;
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
  /** 当前这次跳跃的抛物线弧高 */
  jumpArcHeight: number;
  jumpFromX: number;
  jumpFromY: number;
  jumpToX: number;
  jumpToY: number;
  abilityMotion: AbilityMotion | null;
  /** 狍子偶像「捏捏摸摸」的引导目标与剩余时间。 */
  channelTargetFid: string | null;
  channelTime: number;
  channelPulseTimer: number;
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
  /** 相对瞄准方向的固定角度偏移（弧度） */
  angleOffset?: number;
  emoji?: string;
  style?: Projectile["style"];
  splashRadius?: number;
}

export interface BattleState {
  elapsed: number;
  limit: number;
  engagedTeams: Record<Team, boolean>;
  player: Fighter[];
  enemy: Fighter[];
  effects: BattleEffect[];
  projectiles: Projectile[];
  projectileVolley: ProjectileVolleyShot[];
  chronospheres: ChronosphereZone[];
  pets: MechanicalRabbitPet[];
  petSerial: number;
  pineTrees: PineTreeTurret[];
  pineTreeSerial: number;
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
  bounty: number;
  defeatedEnemies: number;
  defeatedByStar: Record<1 | 2 | 3, number>;
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
  /** 剩余免费刷新次数（如远程开局的首次免费刷新） */
  freeRerollCharges: number;
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
