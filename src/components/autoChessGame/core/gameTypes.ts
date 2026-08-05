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
  kind:
    | "line"
    | "ring"
    | "burst"
    | "emoji_burst"
    | "rebirth"
    | "text"
    | "heal"
    | "healing_field"
    | "healing_pulse"
    | "finale"
    | "energy_pulse"
    | "chronosphere"
    | "hotpot"
    | "switch_on"
    | "switch_shock"
    | "biscuit_share"
    | "harei_pine"
    | "harei_badge"
    | "mumu_whip";
  x: number;
  y: number;
  x2?: number;
  y2?: number;
  x3?: number;
  y3?: number;
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
  /** 普攻弹幕默认 attack；主动技能及其衍生弹幕使用 ability。 */
  damageKind?: "attack" | "ability";
  burnPower: number;
  color: string;
  size: number;
  /** 弹幕视觉样式：默认光点，或指定 emoji */
  style?: "default" | "shark" | "carrot" | "coin" | "lollipop" | "fireball" | "aoe_orb" | "finale_star" | "sumi_dragon" | "laugh" | "pickaxe" | "cigarette";
  /** 命中后对附近敌人造成伤害与灼烧的半径。 */
  splashRadius?: number;
  /** 有值时以 emoji 绘制弹幕（优先于默认光点） */
  emoji?: string;
  /** 命中存活目标后施加的眩晕时间。 */
  stunDuration?: number;
  /** 棒棒糖落地后停止移动，变为可被单位踩到的地面效果。 */
  grounded?: boolean;
  /** 远端 AOE 弹幕抵达固定落点后触发的技能。 */
  impactAbilityId?: UnitId;
  /** 支援弹幕锁定的友军；目标移动时仍在弹幕落地后获得效果。 */
  impactTargetFid?: string;
  /** 支援弹幕的逐段效果倍率。 */
  impactMultiplier?: number;
}

export interface ChronosphereZone {
  sourceFid: string;
  x: number;
  y: number;
  radius: number;
  life: number;
  maxLife: number;
  color: string;
}

export interface HealingZone {
  sourceFid: string;
  team: Team;
  x: number;
  y: number;
  radius: number;
  life: number;
  maxLife: number;
  pulseTimer: number;
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

export interface AbilityMotion {
  kind: "dash" | "jump" | "push" | "pull";
  abilityId: UnitId | null;
  /** 外部位移的实际施法者；普通位移为空并由运动单位自身结算。 */
  sourceFid: string | null;
  targetFid: string | null;
  /** 逃生后坐力可挤开路径上的单位，不受普通占位阻挡。 */
  forceThrough?: boolean;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  time: number;
  duration: number;
  arcHeight: number;
  controlX?: number;
  controlY?: number;
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
  baseRadius: number;
  hp: number;
  maxHp: number;
  shield: number;
  /** 当前护盾池的峰值，用于显示剩余护盾强度。 */
  shieldPeak: number;
  /** 只吸收主动技能及其衍生伤害的独立护盾池。 */
  abilityShield: number;
  abilityShieldPeak: number;
  abilityShieldTime: number;
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
  burnDamageKind: "attack" | "ability";
  /** 普攻和技能造成生命伤害时均会触发的全能吸血 */
  lifesteal: number;
  burnOnHitPower: number;
  spiceBurnOnHitPower: number;
  dodgeChance: number;
  dwarfMember: boolean;
  gluttonyHolder: boolean;
  growthStacks: number;
  gluttonyKillCooldown: number;
  /** Rei 复活的幽灵不会再次生成可复活尸体。 */
  reiRevival: boolean;
  emberMember: boolean;
  emberAttackPerStack: number;
  emberAttackStacks: number;
  emberAttackStackCap: number;
  syncAvMember: boolean;
  /** 当前同步视听状态；非雪绘友军在受到哀兵振奋时也会进入 -1。 */
  syncAvDirection: -1 | 0 | 1;
  /** 同步视听根据战力差计算出的效果强度，供动态属性与战斗表现使用。 */
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
  /** 小岁鸟连续肘击尚未发动的冲撞次数。 */
  suiBirdChargesRemaining: number;
  /** 星汐山猪冲阵：能量耗尽前持续冲锋，方向只能缓慢转动。 */
  sekiChargeActive: boolean;
  sekiChargeDirectionX: number;
  sekiChargeDirectionY: number;
  /** 当前仍与山猪冲锋接触的敌人；离开后可被再次撞击。 */
  sekiChargeHitFids: string[];
  sekiChargeHitCount: number;
  /** 塔神「开挂」已经发动，等待自身死亡时把增益转移给队友。 */
  towerHackArmed: boolean;
  /** 已继承塔神「开挂」；同名增益不叠加，只保留更强档位。 */
  towerHackBuffed: boolean;
  towerHackAttackBonus: number;
  towerHackArmorBonus: number;
  towerHackAttackSpeed: number;
  towerHackMoveSpeed: number;
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
  abilityArmorBonus: number;
  slowTime: number;
  slowMultiplier: number;
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
  /** 涅槃后普攻后坐力的剩余持续时间。 */
  rebirthRecoilTime: number;
  /** 果冻风纪变成满区后主动逃离、闪避并回血的剩余时间。 */
  manquTime: number;
  /** 满区本次变身锁定的逃跑方向，避免被两侧敌人反复拉扯转向。 */
  manquEscapeX: number;
  manquEscapeY: number;
  /** 浣熊店员打开开关后的剩余振动与反震时间。 */
  raccoonSwitchTime: number;
  /** 本次开关期间已经被反震过的攻击者。 */
  raccoonStunnedAttackers: string[];
  /** 礼墨空气龙隐身剩余时间；隐身会降低敌方选中优先级。 */
  stealthTime: number;
  /** 礼墨是否等待解除隐身时发射一次礼小龙弹幕。 */
  sumiDragonReady: boolean;
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
  /** 怕死受击后跳期间仍保持正常接敌移动。 */
  vanguardJumpAdvancing: boolean;
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
  damageKind?: "attack" | "ability";
  burnPower: number;
  speed: number;
  color: string;
  size: number;
  /** 相对瞄准方向的固定角度偏移（弧度） */
  angleOffset?: number;
  emoji?: string;
  style?: Projectile["style"];
  splashRadius?: number;
  stunDuration?: number;
  /** 有值时，这一段弹幕会改为治疗发射时生命比例最低的友军。 */
  supportHealMultiplier?: number;
}

export interface BattleCorpse {
  id: string;
  fighter: Fighter;
  x: number;
  y: number;
  consumed: boolean;
}

export type BattleLogEventType =
  | "battle"
  | "target"
  | "ability"
  | "damage"
  | "projectile"
  | "defeat";

export interface BattleLogActor {
  fid: string;
  unitId: UnitId;
  name: string;
  team: Team;
  x: number;
  y: number;
}

export interface BattleLogEvent {
  id: number;
  time: number;
  type: BattleLogEventType;
  message: string;
  source?: BattleLogActor;
  target?: BattleLogActor;
  ability?: string;
  projectile?: string;
  amount?: number;
  damageKind?: "attack" | "ability";
  direction?: { x: number; y: number };
  impact?: { x: number; y: number };
}

export interface DamageTrace {
  projectile?: string;
  impact?: { x: number; y: number };
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
  corpses: BattleCorpse[];
  resurrectionSerial: number;
  chronospheres: ChronosphereZone[];
  healingZones: HealingZone[];
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
  eventLog: BattleLogEvent[];
  nextEventId: number;
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
  upgradeDiscountCarry: number;
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
