/* eslint-disable prefer-destructuring, implicit-arrow-linebreak, nonblock-statement-body-position, function-paren-newline */

import {
  AugmentId,
  STARTERS,
  STARTER_OFFER_SIZE,
  PLAYER_LEVELS,
  StarterId,
  SUI_BIRD_ELBOW_DISTANCE,
  TRAITS,
  TraitId,
  UNIT_DEFS,
  UnitId,
  type PlayerLevel,
  SUPPORT_HEAL_HP_RATIO,
  abilityStatForStar,
  traitLevelForCount,
} from "../gameData";
import {
  BATTLE_BOUNDS,
  GLUTTONY_RADIUS_PER_STACK,
  GLUTTONY_STACK_CAP,
} from "../battleGeometry";
import type {
  AbilityMotion,
  BattleLogEvent,
  BattleLogEventType,
  BattleCorpse,
  BattleEffect,
  BattleState,
  DamageTrace,
  Fighter,
  GameState,
  OwnedUnit,
  ProjectileVolleyShot,
  RankingMetric,
  Team,
  ToastState,
  UnitLocation,
} from "../gameTypes";
import {
  mumuWhipPullProgress,
  quadraticMotionPoint,
} from "../motionPaths";
import {
  createSeededRandom,
  freshSeed,
  type RandomSource,
} from "./random";
import { STARTER_EFFECTS } from "./runRules";
import {
  SHOP_SIZE,
  createInitialState,
  loadBestScore,
} from "./state";
import { ProgressionSystem } from "./progression";
import {
  CombatSetupSystem,
  DEFAULT_JUMP_ARC_HEIGHT,
} from "./combatSetup";
import { RosterSystem } from "./roster";
import { renderTextState } from "./textState";
import {
  AbilitySystem,
  BISCUIT_RESCUE_LANDING_RADIUS,
  CINDER_RAM_SONG_RANGE,
  MITSURI_TAUNT_DURATION,
  SHIORI_OTTER_RADIUS,
  SUI_BIRD_ELBOW_CHARGES,
  SUMI_STEALTH_DURATION,
} from "./abilities/AbilitySystem";
import {
  CombatResolutionSystem,
  type DamageKind,
} from "./combatResolution";
import {
  CombatProjectileSystem,
  PAKO_ANGEL_FISH_PULSE_INTERVAL,
} from "./projectiles";

export type {
  AbilityMotion,
  AugmentSelection,
  BattleEffect,
  BattleState,
  ChronosphereZone,
  Fighter,
  GamePhase,
  GameState,
  HealingZone,
  MechanicalRabbitPet,
  OwnedUnit,
  Projectile,
  RankingMetric,
  RoundResult,
  StarterSelection,
  Team,
  ToastState,
  UnitLocation,
} from "../gameTypes";
export { fighterVisualRadius, mechanicalRabbitMuzzle } from "../battleGeometry";

export const BATTLE_EVENT_LOG_LIMIT = 100_000;

export type AutoChessEngineOptions = {
  telemetry?: boolean;
  visualEffects?: boolean;
};

export type AutoChessEngineSnapshot = {
  state: GameState;
  randomState: number;
  shopRandomState: number;
  shopSequenceCounts: Record<PlayerLevel, number>;
  uid: number;
};

const CONTACT_ATTACK_BUFFER = 12;
const PLACEMENT_MARGIN = 8;
const TARGET_LOCK_DURATION = 0.45;
const TARGET_SWITCH_DISTANCE = 28;
const AVOID_LOOK_AHEAD = 78;
const YIELD_PATH_PADDING = 3;
const YIELD_MIN_FORWARD = 1;
const CONTACT_SKIN = 2;
const CONTACT_PRESSURE_SPEED = 70;
const CONTACT_PRESSURE_SPEED_FORCE = 160;
const MAX_CONTACT_SHIFT_PER_TICK = 4;
const MAX_CONTACT_SHIFT_PER_TICK_FORCE = 10;
const MAX_SEPARATION_PER_TICK = 3;
const MAX_FORCED_SEPARATION_PER_TICK = 9;
const FORCED_MOVEMENT_SIDE_SHIFT = 14;
const MANQU_ESCAPE_LOOKAHEAD = 96;
const MANQU_ESCAPE_DIRECTIONS = 16;
const YIELD_PROGRESS_WINDOW = 0.3;
const YIELD_MIN_TARGET_PROGRESS = 5;
const STUCK_RECOVERY_DELAY = 0.65;
const STUCK_RECOVERY_DURATION = 0.42;
/** 卡住一段时间后加大推挤，仍靠物理位移而非瞬移 */
const STUCK_PUSH_FORCE_DELAY = 0.28;
const SEPARATION_PASSES = 2;
const VANGUARD_JUMP_DURATION = 0.46;
const XUEHUI_ADVANTAGE_PENALTY = 0.2;
const XUEHUI_DISADVANTAGE_BONUS = 0.5;
const XUEHUI_TEAM_ATTACK_SPEED_BONUS = 0.25;
const VANGUARD_JUMP_COOLDOWN = 0.72;
/** 刺客/粤语帮等通用跳跃弧高 */
/** 偷袭只把敌方最深一列视作最后排。 */
const ASSASSIN_BACKLINE_DEPTH_TOLERANCE = 48;
/** 莉蔻近视射击 */
/** 小红帽攻击弹幕持续约 4 秒，能量从满降到空 */
/** 攻击力加成偏低，把体感重心放在攻速上 */
/** 泽音美乐蒂：二阶段普攻后撤。 */
const ZEYIN_REBIRTH_RECOIL_DISTANCE = 34;
const ZEYIN_REBIRTH_RECOIL_DURATION = 0.16;
const ZEYIN_REBIRTH_RECOIL_RANGE_MARGIN = 4;
/** 礼墨空气龙与社恐：能量驱动的隐身，耗尽时发射礼小龙，普攻后真实后退。 */
const SUMI_DRAGON_DAMAGE_MULTIPLIER = 1.35;
const SUMI_DRAGON_PROJECTILE_SPEED = 680;
const SUMI_DRAGON_PROJECTILE_SIZE = 21;
const SUMI_SOCIAL_RECOIL_DISTANCE = 28;
const SUMI_SOCIAL_RECOIL_DURATION = 0.16;
const SUMI_SOCIAL_RECOIL_RANGE_MARGIN = 4;
/** 流量：成员全能吸血，以及 4/6 人档的全队全能吸血 */
/** 贪吃岁：下一发强化普攻的收益 */
/** 椰子栞「海獭冲击」：三费突进控场。 */
const SHIORI_OTTER_DAMAGE = 1.08;
const SHIORI_OTTER_STUN = 0.5;
const SHIORI_OTTER_SHIELD_RATIO = 0.12;
/** 饼干岁「暖男回复」：高频救援与两段击退。 */
const BISCUIT_RESCUE_HEAL_HP_RATIO = 0.14;
const BISCUIT_RESCUE_HEAL_ATTACK_RATIO = 1;
const BISCUIT_RESCUE_SHIELD_RATIO = 0.1;
const BISCUIT_RESCUE_PATH_PUSH = 52;
const BISCUIT_RESCUE_LANDING_PUSH = 58;
/** 沐霂「领舞救场」：只在队友明确遇险时发动的单体撤离。 */
const MUMU_RESCUE_HP_RATIO = 0.35;
const MUMU_RESCUE_HEAL_HP_RATIO = 0.16;
const MUMU_RESCUE_HEAL_ATTACK_RATIO = 1.4;
const MUMU_RESCUE_SHIELD_RATIO = 0.12;
/** 小岁鸟「连续肘击」：三段短冲撞。 */
const SUI_BIRD_ELBOW_DAMAGE = 0.58;
const SUI_BIRD_ELBOW_STUN = 0.22;
const SUI_BIRD_ELBOW_PUSH = 46;
/** 七海大鲨鱼：中短时长的冲阵控场。 */
const NANA_PICKAXE_DURATION = 2.8;
const NANA_PICKAXE_ARMOR_BONUS = 42;
const NANA_PICKAXE_TAUNT_RADIUS = 155;
const NANA_PICKAXE_TAUNT_REFRESH = 0.3;
const GLUTTONY_MAX_HP_PER_STACK = 0.025;
const GLUTTONY_KILL_STACK_COOLDOWN = 3;
const GLUTTONY_FULL_SHIELD_RATIO = 0.1;
const REI_REVIVE_HP_RATIO = 0.25;
/** 蛙梓：持续歌唱期间的群体治疗与火焰弹。 */
const CINDER_RAM_SONG_HEAL_INTERVAL = 0.6;
const CINDER_RAM_SONG_HEAL_RATIO = 0.032;
const CINDER_RAM_FIREBALL_SPEED = 640;
const CINDER_RAM_FIREBALL_DAMAGE = 0.9;
const CINDER_RAM_FIREBALL_BURN = 0.9;
const CINDER_RAM_FIREBALL_SPLASH = 68;
/** 三理理：护盾和范围嘲讽 */
/** 山猪王「山猪冲阵」：持续耗能、低转向、高速反弹的控场冲锋。 */
const SEKI_CHARGE_DURATION = 4.8;
const SEKI_CHARGE_SPEED = 235;
const SEKI_CHARGE_TURN_RATE = 1.2;
const SEKI_CHARGE_COLLISION_PADDING = 8;
const SEKI_CHARGE_PUSH_DISTANCE = 78;
const SEKI_CHARGE_STUN_DURATION = 0.42;
/** 中单光一滑跪：撞到的敌人短暂失去行动。 */
const GUANGYI_SLIDE_STUN_DURATION = 0.45;
/** 帕可「天使摸鱼」：落地治疗并留下可供友军进出的持续治疗区。 */
const PAKO_ANGEL_FISH_PULSE_HEAL_ATTACK_RATIO = 0.7;
const PAKO_ANGEL_FISH_PULSE_HEAL_CASTER_HP_RATIO = 0.025;
/** 南町「烟头烫屁股」：三枚慢速烟头分段命中并灼烧。 */
/** 狍子偶像：双方均被锁定的持续施法。 */
const LOVELY_CHANNEL_DAMAGE_PER_SECOND = 0.8;
const LOVELY_CHANNEL_LIFESTEAL = 0.9;
const LOVELY_CHANNEL_PULSE_INTERVAL = 0.32;
/** 果冻风纪：满区逃生的一级默认值；高星参数由单位数据覆盖。 */
const SUN_GUARD_MANQU_HEAL_PER_SECOND = 0.2;
const SUN_GUARD_MANQU_MOVE_SPEED_BONUS = 105;
/** 好笑姐姐：偷袭进场，冷笑话命中后慌张撤步。 */
/** 雅吨辣福：打翻火锅灼烧范围 */
const RIFT_BRAWLER_PASSIVE_BURN = 0.55;
/** 跳舞冲刺 */
const DANCE_DASH_DURATION = 0.48;
const DANCE_DASH_SPEED_MULT = 3.4;
const DANCE_DASH_COOLDOWN = [0, 4.2, 3.4, 2.6];

interface MovementIntent {
  x: number;
  y: number;
  forced?: boolean;
}

const NORI_APPLE_PIE_INTERVAL = 0.14;
const NORI_APPLE_PIE_DAMAGE_MULTIPLIER = 0.32;
const NORI_PROJECTILE_SPEED = 700;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const NORI_PROJECTILE_RANGE = 560;
/** 露蒂丝「咕咕诊所」：全队治疗，并优先保护最虚弱的两名友军。 */

export class AutoChessEngine {
  public state: GameState;

  private rng: RandomSource;

  private shopRng: RandomSource;

  private shopSequenceCounts: Record<PlayerLevel, number> = {
    3: 0,
    4: 0,
    5: 0,
    6: 0,
    7: 0,
    8: 0,
    9: 0,
    10: 0,
  };

  private shopPreviewCache = new Map<string, UnitId[]>();

  private uid = 1;

  private chronosphereEnergyLocks = new Set<string>();

  private observedTargets = new Map<string, string | null>();

  /** Trait membership is fixed for the lifetime of a battle, including revives. */
  private battleTraitLevelCache = new WeakMap<BattleState, Map<string, number>>();

  private readonly roster: RosterSystem;

  private readonly progression: ProgressionSystem;

  private readonly combatSetup: CombatSetupSystem;

  private readonly combatResolution: CombatResolutionSystem;

  private readonly projectiles: CombatProjectileSystem;

  private readonly abilities: AbilitySystem;

  private readonly telemetryEnabled: boolean;

  private readonly visualEffectsEnabled: boolean;

  constructor(seed = freshSeed(), engineOptions: AutoChessEngineOptions = {}) {
    this.telemetryEnabled = engineOptions.telemetry !== false;
    this.visualEffectsEnabled = engineOptions.visualEffects !== false;
    this.rng = createSeededRandom(seed);
    this.shopRng = createSeededRandom(seed);
    this.state = createInitialState(seed, loadBestScore());
    this.roster = new RosterSystem({
      state: () => this.state,
      rng: () => this.shopRng,
      nextUid: () => this.uid++,
      setToast: (text, tone) => this.setToast(text, tone),
    });
    this.progression = new ProgressionSystem({
      state: () => this.state,
      rng: () => this.shopRng,
      getTraitLevel: (id) => this.getTraitStatus(id).level,
      living: (team) => this.living(team),
      isMaxPlayerLevel: () => this.isMaxPlayerLevel,
      generateShop: () => this.generateShop(),
      setToast: (text, tone) => this.setToast(text, tone),
    });
    this.projectiles = new CombatProjectileSystem({
      state: () => this.state,
      living: (team) => this.living(team),
      damage: (source, target, amount, inactive, damageKind, trace) =>
        this.damage(source, target, amount, inactive, damageKind, trace),
      addDamageText: (target, amount) => this.addDamageText(target, amount),
      applyBurn: (source, target, totalDamage, damageKind) =>
        this.applyBurn(source, target, totalDamage, damageKind),
      heal: (source, target, amount, showEffect) =>
        this.heal(source, target, amount, showEffect),
      addEnergy: (fighter, amount) => this.addEnergy(fighter, amount),
      nearestTarget: (source, targets) => this.nearestTarget(source, targets),
      faceTowardX: (fighter, targetX) => this.faceTowardX(fighter, targetX),
      retreatFrom: (source, target, distance, duration) =>
        this.retreatFrom(source, target, distance, duration),
      addEffect: (effect) => this.addEffect(effect),
    });
    this.abilities = new AbilitySystem({
      state: () => this.state,
      rng: () => this.rng,
      addDamageText: (target, amount) => this.addDamageText(target, amount),
      addEffect: (effect) => this.addEffect(effect),
      applyBurn: (source, target, totalDamage, damageKind) =>
        this.applyBurn(source, target, totalDamage, damageKind),
      damage: (source, target, amount, inactive, damageKind) =>
        this.damage(source, target, amount, inactive, damageKind),
      deliverRemoteAoe: (source, center) =>
        this.deliverRemoteAoe(source, center),
      densestTarget: (units, radius) => this.densestTarget(units, radius),
      faceTowardX: (fighter, targetX) => this.faceTowardX(fighter, targetX),
      fireFixedProjectile: (source, target, shot) =>
        this.fireFixedProjectile(source, target, shot),
      grantAbilityShield: (source, target, amount, duration, battle) =>
        this.grantAbilityShield(source, target, amount, duration, battle),
      grantShield: (source, target, amount, capRatio, battle) =>
        this.grantShield(source, target, amount, capRatio, battle),
      heal: (source, target, amount, showEffect) =>
        this.heal(source, target, amount, showEffect),
      living: (team) => this.living(team),
      markTeamEngaged: (team) => this.markTeamEngaged(team),
      mumuRescueDestination: (source, target, battle) =>
        this.mumuRescueDestination(source, target, battle),
      nearestTarget: (source, targets) => this.nearestTarget(source, targets),
      reiCorpsesWithinRange: (source) => this.reiCorpsesWithinRange(source),
      reiReviveCount: (source) => this.reiReviveCount(source),
      relocateFighter: (source, preferred) =>
        this.relocateFighter(source, preferred),
      resurrectWithRei: (source) => this.resurrectWithRei(source),
      selectMumuRescueTarget: (source, candidates, battle) =>
        this.selectMumuRescueTarget(source, candidates, battle),
      startAbilityMotion: (source, kind, preferred, options) =>
        this.startAbilityMotion(source, kind, preferred, options),
      startSuiBirdElbowDash: (source, targets) =>
        this.startSuiBirdElbowDash(source, targets),
      summonClockGunnerRabbits: (source) =>
        this.summonClockGunnerRabbits(source),
      targetsWithinAbilityRange: (source, targets) =>
        this.targetsWithinAbilityRange(source, targets),
    });
    this.combatResolution = new CombatResolutionSystem({
      state: () => this.state,
      rng: () => this.rng,
      augmentStacks: (id) => this.augmentStacks(id),
      addEffect: (effect) => this.addEffect(effect),
      markFightersEngaged: (source, target) =>
        this.markFightersEngaged(source, target),
      fireFixedProjectile: (source, target, shot) =>
        this.fireFixedProjectile(source, target, shot),
      prepareVanguardJump: (fighter, source, battle) =>
        this.prepareVanguardJump(fighter, source, battle),
      transferTowerHack: (source) => this.transferTowerHack(source),
      addGluttonyStack: (fighter, label) =>
        this.addGluttonyStack(fighter, label),
    });
    this.combatSetup = new CombatSetupSystem({
      state: () => this.state,
      rng: () => this.rng,
      currentWave: () => this.currentWave,
      augmentStacks: (id) => this.augmentStacks(id),
      grantShield: (source, target, amount, duration, battle) =>
        this.grantShield(source, target, amount, duration, battle),
    });
    this.state.starterChoices = this.rollStarterChoices();
  }

  public resetToTitle() {
    const seed = freshSeed();
    const best = Math.max(this.state.bestScore, loadBestScore());
    this.rng = createSeededRandom(seed);
    this.shopRng = createSeededRandom(seed);
    this.resetShopSequences();
    this.uid = 1;
    this.state = createInitialState(seed, best);
    this.state.starterChoices = this.rollStarterChoices();
    this.observedTargets.clear();
  }

  private isRanged(unitId: UnitId) {
    return UNIT_DEFS[unitId].attackType === "ranged";
  }

  private augmentStacks(id: AugmentId) {
    return this.state.augments.filter((augmentId) => augmentId === id).length;
  }

  private addEnergy(fighter: Fighter, amount: number) {
    // 持续技能期间能量只减不增，避免技能被普攻或受击回能延长。
    if (
      fighter.barrageActive ||
      fighter.sekiChargeActive ||
      (fighter.unitId === "sumi" && fighter.stealthTime > 0) ||
      this.chronosphereEnergyLocks.has(fighter.fid) ||
      this.hasChronosphereInFlightOrActive(fighter)
    ) return;
    fighter.energy = Math.max(0, Math.min(fighter.maxEnergy, fighter.energy + amount));
  }

  private hasChronosphereInFlightOrActive(
    fighter: Fighter,
    battle = this.state.battle,
  ) {
    if (!battle || fighter.unitId !== "spark_mage") return false;
    return battle.chronospheres.some((zone) => zone.sourceFid === fighter.fid) ||
      battle.projectiles.some(
        (projectile) =>
          projectile.sourceFid === fighter.fid &&
          projectile.impactAbilityId === "spark_mage",
      );
  }

  private isInsideChronosphere(fighter: Fighter, battle: BattleState) {
    return battle.chronospheres.some(
      (zone) => Math.hypot(fighter.x - zone.x, fighter.y - zone.y) <= zone.radius,
    );
  }

  private isFrozenByChronosphere(fighter: Fighter, battle: BattleState) {
    return this.isInsideChronosphere(fighter, battle) && fighter.abilityMotion?.kind !== "pull";
  }

  private mumuRescuePriority(target: Fighter, battle: BattleState) {
    if (!target.alive || target.abilityMotion?.kind === "pull") return 0;
    if (this.isInsideChronosphere(target, battle)) return 4;
    const suppressed = [...battle.player, ...battle.enemy].some(
      (fighter) =>
        fighter.alive &&
        fighter.team !== target.team &&
        fighter.channelTime > 0 &&
        fighter.channelTargetFid === target.fid,
    );
    if (suppressed) return 3;
    if (target.stun > 0 || target.tauntTime > 0) return 2;
    if (target.hp / target.maxHp <= MUMU_RESCUE_HP_RATIO) return 1;
    return 0;
  }

  private selectMumuRescueTarget(source: Fighter, candidates: Fighter[], battle: BattleState) {
    return candidates
      .filter((target) => target.fid !== source.fid && target.team === source.team)
      .map((target) => ({ target, priority: this.mumuRescuePriority(target, battle) }))
      .filter(({ priority }) => priority > 0)
      .sort(
        (left, right) =>
          right.priority - left.priority ||
          left.target.hp / left.target.maxHp - right.target.hp / right.target.maxHp ||
          left.target.fid.localeCompare(right.target.fid),
      )[0]?.target || null;
  }

  private mumuRescueDestination(source: Fighter, target: Fighter, battle: BattleState) {
    const behind = source.team === "player" ? -1 : 1;
    let x = source.x + behind * (source.radius + target.radius + 18);
    let y = source.y;
    battle.chronospheres.forEach((zone) => {
      const distance = Math.hypot(x - zone.x, y - zone.y);
      if (distance > zone.radius + target.radius + 8) return;
      const fallbackX = source.x - zone.x;
      const fallbackY = source.y - zone.y;
      const fallbackDistance = Math.hypot(fallbackX, fallbackY);
      const directionX = fallbackDistance > 0.001 ? fallbackX / fallbackDistance : behind;
      const directionY = fallbackDistance > 0.001 ? fallbackY / fallbackDistance : 0;
      x = zone.x + directionX * (zone.radius + target.radius + 12);
      y = zone.y + directionY * (zone.radius + target.radius + 12);
    });
    return { x, y };
  }

  private resolveMumuRescue(target: Fighter, motion: AbilityMotion, battle: BattleState) {
    const source = [...battle.player, ...battle.enemy].find(
      (fighter) => fighter.fid === motion.sourceFid && fighter.alive,
    );
    if (!source || source.unitId !== "mumu" || source.team !== target.team) return;
    [...battle.player, ...battle.enemy].forEach((fighter) => {
      if (fighter.channelTargetFid !== target.fid) return;
      fighter.channelTargetFid = null;
      fighter.channelTime = 0;
      fighter.channelPulseTimer = 0;
      this.addEffect({ kind: "text", x: fighter.x, y: fighter.y - 40, color: UNIT_DEFS.mumu.accent, text: "压制打断", life: 0.55, size: 10 });
    });
    target.stun = 0;
    target.tauntedByFid = null;
    target.tauntTime = 0;
    target.slowTime = 0;
    target.slowMultiplier = 1;
    this.heal(
      source,
      target,
      target.maxHp * MUMU_RESCUE_HEAL_HP_RATIO + source.attack * MUMU_RESCUE_HEAL_ATTACK_RATIO,
    );
    this.grantShield(source, target, target.maxHp * MUMU_RESCUE_SHIELD_RATIO, 0.4);
    this.addEffect({ kind: "ring", x: target.x, y: target.y, color: UNIT_DEFS.mumu.accent, life: 0.7, size: 78 });
    this.addEffect({ kind: "text", x: target.x, y: target.y - 46, color: UNIT_DEFS.mumu.accent, text: "撤离 · 净化", life: 0.8, size: 12 });
  }

  private rollStarterChoices() {
    const pool = STARTERS.map((starter) => starter.id);
    const choices: StarterId[] = [];
    while (choices.length < STARTER_OFFER_SIZE && pool.length) {
      choices.push(pool.splice(Math.floor(this.rng.next() * pool.length), 1)[0]);
    }
    return choices;
  }

  public startRun(starterId: StarterId) {
    const starter = STARTERS.find((item) => item.id === starterId);
    if (!starter || !this.state.starterChoices.includes(starterId)) return;

    const seed = this.state.seed;
    const enemySeed = this.state.enemySeed;
    const best = this.state.bestScore;
    this.rng = createSeededRandom(seed);
    this.shopRng = createSeededRandom(seed);
    this.resetShopSequences();
    this.uid = 1;
    this.state = createInitialState(seed, best);
    this.state.enemySeed = enemySeed;
    this.state.phase = "preparation";
    this.state.starter = starterId;
    this.state.starterHistory.push({ id: starterId });
    this.state.starterChoices = [];
    const effects = STARTER_EFFECTS[starterId];
    this.state.hp = 20 + (effects.hpBonus || 0);
    this.state.maxHp = this.state.hp;
    this.state.gold = 8 + (effects.goldBonus || 0);
    // 远程开局：仅赠送 1 次免费刷新，而不是整回合无限免费
    this.state.freeRerollCharges = effects.freeFirstReroll ? 1 : 0;

    const starterUnit: OwnedUnit = {
      uid: this.uid++,
      id: starter.unit,
      star: 1,
    };
    // 6x4 部署网格：远程默认站在第二行最后方，近战默认站在第二行最前方。
    const preferredSlot = this.isRanged(starter.unit) ? 6 : 11;
    this.state.board[preferredSlot] = starterUnit;
    this.state.shop = this.generateShop();
    for (let sample = 0; sample < SHOP_SIZE * 2; sample += 1) this.shopRng.next();
    this.rng.restore(this.shopRng.snapshot());
    this.setToast(
      `${starter.name}已接入。购买单位，调整站位，然后开始迎战。`,
      "good",
    );
  }

  public get boardCap() {
    return this.roster.boardCap;
  }

  public get upgradeCost() {
    return this.roster.upgradeCost;
  }

  public get isMaxPlayerLevel() {
    return this.roster.isMaxPlayerLevel;
  }

  public get isStarForgeUnlocked() {
    return this.roster.isStarForgeUnlocked;
  }

  public get starForgeUnlockCost() {
    return this.roster.starForgeUnlockCost;
  }

  public get boardCount() {
    return this.roster.boardCount;
  }

  public getRandomState() {
    return this.rng.snapshot();
  }

  public restoreRandomState(randomState: number) {
    this.rng.restore(randomState);
  }

  /**
   * Snapshot the preparation state so CPU route search can branch without
   * consuming the live run's random streams or shop cursors.
   */
  public getSimulationSnapshot(): AutoChessEngineSnapshot {
    return {
      state: structuredClone(this.state),
      randomState: this.rng.snapshot(),
      shopRandomState: this.shopRng.snapshot(),
      shopSequenceCounts: { ...this.shopSequenceCounts },
      uid: this.uid,
    };
  }

  public restoreSimulationSnapshot(snapshot: AutoChessEngineSnapshot) {
    this.state = structuredClone(snapshot.state);
    this.rng.restore(snapshot.randomState);
    this.shopRng.restore(snapshot.shopRandomState);
    this.shopSequenceCounts = { ...snapshot.shopSequenceCounts };
    this.uid = snapshot.uid;
    this.shopPreviewCache.clear();
    this.chronosphereEnergyLocks.clear();
    this.observedTargets.clear();
    this.battleTraitLevelCache = new WeakMap<BattleState, Map<string, number>>();
  }

  public getShopRandomState() {
    return PLAYER_LEVELS.reduce(
      (signature, level) => (
        signature * 31 + this.shopSequenceCounts[level]
      ) % 2147483647,
      5381,
    );
  }

  public previewFutureShops(refreshes: number) {
    return this.previewFutureShopsAtLevels(Array.from(
      { length: Math.max(0, Math.floor(refreshes)) },
      () => this.state.playerLevel,
    ));
  }

  public previewFutureShopsAtLevels(levels: readonly PlayerLevel[]) {
    const previewCounts = { ...this.shopSequenceCounts };
    return levels.map((level) => {
      const sequenceIndex = previewCounts[level];
      previewCounts[level] += 1;
      return this.generateShopAt(level, sequenceIndex);
    });
  }

  private generateShop() {
    const level = this.state.playerLevel;
    const sequenceIndex = this.shopSequenceCounts[level];
    this.shopSequenceCounts[level] += 1;
    return this.generateShopAt(level, sequenceIndex);
  }

  private resetShopSequences() {
    PLAYER_LEVELS.forEach((level) => {
      this.shopSequenceCounts[level] = 0;
    });
    this.shopPreviewCache.clear();
  }

  private shopSequenceSeed(level: PlayerLevel, sequenceIndex: number) {
    const seed = Math.abs(Math.trunc(this.state.seed)) % 2147483647;
    const levelVariant = (seed * 48271 + (level + 17) * 69621) % 2147483647;
    return (
      levelVariant * 40699 + (sequenceIndex + 1) * 104729
    ) % 2147483647 || 1;
  }

  private generateShopAt(level: PlayerLevel, sequenceIndex: number) {
    const cacheKey = `${this.state.seed}/${level}/${sequenceIndex}`;
    const cached = this.shopPreviewCache.get(cacheKey);
    if (cached) return [...cached];
    const playerLevel = this.state.playerLevel;
    const random = this.shopRng;
    try {
      this.state.playerLevel = level;
      this.shopRng = createSeededRandom(this.shopSequenceSeed(level, sequenceIndex));
      const shop = this.roster.generateShop();
      this.shopPreviewCache.set(cacheKey, [...shop]);
      return shop;
    } finally {
      this.state.playerLevel = playerLevel;
      this.shopRng = random;
    }
  }

  public buyExperience() {
    this.roster.buyExperience();
  }

  public useStarForge(location?: UnitLocation) {
    return this.roster.useStarForge(location);
  }

  public toggleShopLock() {
    this.roster.toggleShopLock();
  }

  public rerollShop() {
    if (this.state.phase !== "preparation") return;
    const freeReroll = this.state.freeRerollCharges > 0;
    if (!freeReroll && this.state.gold < 1) {
      this.setToast("金币不足，无法刷新商店。", "bad");
      return;
    }
    if (freeReroll) this.state.freeRerollCharges -= 1;
    else this.state.gold -= 1;
    this.state.shop = this.generateShop();
    this.state.shopLocked = false;
    this.state.selected = null;
    this.setToast(
      freeReroll ? "免费刷新已使用，商店已自动解锁。" : "商店已刷新并自动解锁。",
      "info",
    );
  }

  public buyShopUnit(index: number) {
    this.roster.buyShopUnit(index);
  }

  public canStoreUnit(id: UnitId) {
    return this.roster.canStoreUnit(id);
  }

  public clearSelection() {
    this.roster.clearSelection();
  }

  public moveUnit(
    from: UnitLocation,
    zone: UnitLocation["zone"],
    index: number,
  ) {
    this.roster.moveUnit(from, zone, index);
  }

  public sellUnit(zone: UnitLocation["zone"], index: number) {
    this.roster.sellUnit(zone, index);
  }

  public selectSlot(zone: UnitLocation["zone"], index: number) {
    this.roster.selectSlot(zone, index);
  }

  public sellSelected() {
    this.roster.sellSelected();
  }

  public getUnitSellValue(unit: OwnedUnit) {
    return this.roster.getUnitSellValue(unit);
  }

  public getStarForgeUpgradeCost(unit: OwnedUnit) {
    return this.roster.getStarForgeUpgradeCost(unit);
  }

  private checkMerges() {
    return this.roster.checkMerges();
  }

  public get interestIncome() {
    return this.progression.interestIncome;
  }

  public get financeIncomeBonus() {
    return this.progression.financeIncomeBonus;
  }

  public get currentWave() {
    return this.progression.currentWave;
  }

  public get potentialBounty() {
    return this.progression.potentialBounty;
  }

  private finishBattle(won: boolean) {
    this.logBattleEvent("battle", won ? "战斗结束：我方获胜" : "战斗结束：我方失败");
    this.progression.finishBattle(won);
  }

  public continueAfterResult() {
    this.progression.continueAfterResult();
  }

  public chooseAugment(index: number) {
    this.progression.chooseAugment(index);
  }

  private prepareNextRound() {
    this.progression.prepareNextRound();
  }

  public setRankingMetric(metric: RankingMetric) {
    const battle = this.state.battle;
    if (!battle) return;
    battle.rankingMetric = metric;
    battle.rankingOpen = true;
  }

  public toggleRanking() {
    const battle = this.state.battle;
    if (!battle) return;
    battle.rankingOpen = !battle.rankingOpen;
  }

  public closeRanking() {
    if (this.state.battle) this.state.battle.rankingOpen = false;
  }

  public getBattleRanking(team: Team = "player") {
    const battle = this.state.battle;
    if (!battle) return [];
    const metric = battle.rankingMetric;
    const valueFor = (fighter: Fighter) => {
      if (metric === "damage") return fighter.damageDealt;
      if (metric === "support") return fighter.healingDone + fighter.shieldingDone;
      return fighter.damageTaken;
    };
    const fighters = team === "player" ? battle.player : battle.enemy;
    return [...fighters]
      .sort((left, right) =>
        valueFor(right) - valueFor(left) || left.fid.localeCompare(right.fid),
      )
      .map((fighter) => ({ fighter, value: valueFor(fighter) }));
  }

  public getBattleFighter(fid: string) {
    const battle = this.state.battle;
    return battle && [...battle.player, ...battle.enemy].find((fighter) => fighter.fid === fid);
  }

  private summarizeBattleFighter(fighter: Fighter, value?: number) {
    return {
      fid: fighter.fid,
      team: fighter.team,
      unitId: fighter.unitId,
      name: UNIT_DEFS[fighter.unitId].name,
      star: fighter.star,
      alive: fighter.alive,
      hp: Math.round(fighter.hp),
      maxHp: Math.round(fighter.maxHp),
      shield: Math.round(fighter.shield),
      shieldPeak: Math.round(fighter.shieldPeak),
      abilityShield: Math.round(fighter.abilityShield),
      abilityShieldPeak: Math.round(fighter.abilityShieldPeak),
      abilityShieldTime: Number(fighter.abilityShieldTime.toFixed(2)),
      attack: Math.round(fighter.attack),
      armor: Math.round(fighter.armor),
      range: Math.round(fighter.range),
      attackInterval: Number(fighter.attackInterval.toFixed(2)),
      moveSpeed: Math.round(fighter.moveSpeed),
      attackType: fighter.attackType,
      energy: Math.round(fighter.energy),
      maxEnergy: fighter.maxEnergy,
      energyPerSecond: fighter.energyPerSecond,
      energyOnAttack: fighter.energyOnAttack,
      energyOnHit: fighter.energyOnHit,
      energyStyle: fighter.energyStyle,
      reborn: fighter.reborn,
      rebirthRecoilTime: Number(fighter.rebirthRecoilTime.toFixed(2)),
      manquTime: Number(fighter.manquTime.toFixed(2)),
      manquEscapeDirection: fighter.manquTime > 0
        ? {
            x: Number(fighter.manquEscapeX.toFixed(2)),
            y: Number(fighter.manquEscapeY.toFixed(2)),
          }
        : null,
      raccoonSwitchTime: Number(fighter.raccoonSwitchTime.toFixed(2)),
      raccoonStunnedAttackers: fighter.raccoonStunnedAttackers.length,
      stealthTime: Number(fighter.stealthTime.toFixed(2)),
      sumiDragonReady: fighter.sumiDragonReady,
      towerHackArmed: fighter.towerHackArmed,
      towerHackBuffed: fighter.towerHackBuffed,
      towerHackAttackBonus: fighter.towerHackAttackBonus,
      towerHackArmorBonus: fighter.towerHackArmorBonus,
      towerHackAttackSpeed: fighter.towerHackAttackSpeed,
      towerHackMoveSpeed: fighter.towerHackMoveSpeed,
      gluttonyStacks: fighter.growthStacks,
      gluttonyStackCap: GLUTTONY_STACK_CAP,
      gluttonyKillCooldown: Number(fighter.gluttonyKillCooldown.toFixed(2)),
      stun: Number(fighter.stun.toFixed(2)),
      tauntTime: Number(fighter.tauntTime.toFixed(1)),
      burnTime: Number(Math.max(0, fighter.burnTime).toFixed(2)),
      slowTime: Number(fighter.slowTime.toFixed(2)),
      slowMultiplier: Number(fighter.slowMultiplier.toFixed(2)),
      weakenTime: Number(Math.max(0, fighter.weakenTime).toFixed(2)),
      syncAvDirection: fighter.syncAvDirection,
      syncAvStrength: Number(fighter.syncAvStrength.toFixed(2)),
      damageDealt: Math.round(fighter.damageDealt),
      healingDone: Math.round(fighter.healingDone),
      shieldingDone: Math.round(fighter.shieldingDone),
      damageTaken: Math.round(fighter.damageTaken),
      ...(value === undefined ? {} : { value: Math.round(value) }),
    };
  }

  public getTraitCounts(): Record<TraitId, number> {
    return this.combatSetup.getTraitCounts();
  }

  public getPlayerCombatStats(owned: Pick<OwnedUnit, "id" | "star">) {
    return this.combatSetup.getPlayerCombatStats(owned);
  }

  private traitCountsForUnitIds(unitIds: readonly UnitId[]) {
    return this.combatSetup.traitCountsForUnitIds(unitIds);
  }

  public getActiveTraits() {
    return (Object.keys(TRAITS) as TraitId[])
      .map((trait) => {
        const definition = TRAITS[trait];
        const status = this.getTraitStatus(trait);
        return {
          ...definition,
          count: status.count,
          level: status.level,
          description:
            status.level > 0
              ? definition.bonuses[status.level - 1]
              : status.active
                ? definition.description
                : `${definition.description}（缺少搭档）`,
        };
      })
      .filter((trait) => trait.level > 0);
  }

  private setToast(text: string, tone: ToastState["tone"] = "info") {
    this.state.toast = { text, tone, time: 2.8 };
  }

  private logActor(fighter: Fighter) {
    return {
      fid: fighter.fid,
      unitId: fighter.unitId,
      name: UNIT_DEFS[fighter.unitId].name,
      team: fighter.team,
      x: Number(fighter.x.toFixed(1)),
      y: Number(fighter.y.toFixed(1)),
    };
  }

  private logBattleEvent(
    type: BattleLogEventType,
    message: string,
    source?: Fighter | null,
    target?: Fighter | null,
    details: Partial<Pick<BattleLogEvent, "ability" | "projectile" | "amount" | "damageKind" | "direction" | "impact">> = {},
  ) {
    if (!this.telemetryEnabled) return null;
    const battle = this.state.battle;
    if (!battle) return null;
    const direction = details.direction || (source && target
      ? (() => {
          const deltaX = target.x - source.x;
          const deltaY = target.y - source.y;
          const distance = Math.hypot(deltaX, deltaY);
          return distance > 0.001
            ? { x: Number((deltaX / distance).toFixed(3)), y: Number((deltaY / distance).toFixed(3)) }
            : undefined;
        })()
      : undefined);
    const event: BattleLogEvent = {
      id: battle.nextEventId,
      time: Number(battle.elapsed.toFixed(3)),
      type,
      message,
      ...(source ? { source: this.logActor(source) } : {}),
      ...(target ? { target: this.logActor(target) } : {}),
      ...details,
      ...(direction ? { direction } : {}),
    };
    battle.nextEventId += 1;
    battle.eventLog.push(event);
    if (battle.eventLog.length > BATTLE_EVENT_LOG_LIMIT) {
      battle.eventLog.splice(0, battle.eventLog.length - BATTLE_EVENT_LOG_LIMIT);
    }
    return event;
  }

  public recordBattleControl(message: string) {
    return this.logBattleEvent("battle", message);
  }

  private observeTargetChanges(battle: BattleState) {
    const fighters = [...battle.player, ...battle.enemy];
    const byId = new Map(fighters.map((fighter) => [fighter.fid, fighter]));
    fighters.forEach((fighter) => {
      const nextTarget = fighter.alive ? fighter.targetFid : null;
      const hadObservation = this.observedTargets.has(fighter.fid);
      const previousTarget = this.observedTargets.get(fighter.fid) ?? null;
      if (hadObservation && previousTarget === nextTarget) return;
      this.observedTargets.set(fighter.fid, nextTarget);
      if (!nextTarget) {
        if (hadObservation && previousTarget) {
          this.logBattleEvent("target", `${UNIT_DEFS[fighter.unitId].name} 失去目标`, fighter);
        }
        return;
      }
      const target = byId.get(nextTarget) || null;
      this.logBattleEvent(
        "target",
        `${UNIT_DEFS[fighter.unitId].name} ${hadObservation && previousTarget ? "更换" : "锁定"}目标${target ? `：${UNIT_DEFS[target.unitId].name}` : `：${nextTarget}`}`,
        fighter,
        target,
      );
    });
  }

  public getTraitStatus(trait: TraitId) {
    const count = this.getTraitCounts()[trait];
    const definition = TRAITS[trait];
    const level = traitLevelForCount(definition, count);
    const active = level > 0;
    return {
      count,
      level,
      active,
      maxThreshold: definition.thresholds[definition.thresholds.length - 1],
    };
  }

  public startBattle() {
    if (this.state.phase !== "preparation") return;
    if (this.boardCount === 0) {
      this.setToast("至少部署一个单位才能开始战斗。", "bad");
      return;
    }
    if (this.boardCount > this.boardCap) {
      this.setToast(
        `当前上阵 ${this.boardCount}/${this.boardCap}，请移回备战席、出售或升本。`,
        "bad",
      );
      return;
    }
    this.state.selected = null;
    this.state.battle = this.createBattle();
    this.observedTargets.clear();
    this.logBattleEvent(
      "battle",
      `第 ${this.state.round} 战开始：我方 ${this.state.battle.player.length} 人，对阵敌方 ${this.state.battle.enemy.length} 人`,
    );
    this.state.phase = "battle";
    this.state.toast = null;
  }

  private createBattle(): BattleState {
    return this.combatSetup.createBattle();
  }

  private markTeamEngaged(team: Team) {
    const battle = this.state.battle;
    if (battle) battle.engagedTeams[team] = true;
  }

  private markFightersEngaged(source: Fighter, target: Fighter) {
    this.markTeamEngaged(source.team);
    this.markTeamEngaged(target.team);
  }

  private faceTowardX(fighter: Fighter, targetX: number) {
    const deltaX = targetX - fighter.x;
    if (Math.abs(deltaX) > 0.5) fighter.facingX = deltaX < 0 ? -1 : 1;
  }

  private clampFighterPosition(fighter: Fighter, point: { x: number; y: number }) {
    return {
      x: Math.max(BATTLE_BOUNDS.left + fighter.radius, Math.min(BATTLE_BOUNDS.right - fighter.radius, point.x)),
      y: Math.max(BATTLE_BOUNDS.top + fighter.radius, Math.min(BATTLE_BOUNDS.bottom - fighter.radius, point.y)),
    };
  }

  private fixedDistanceEndpoint(
    fighter: Fighter,
    directionX: number,
    directionY: number,
    distance: number,
  ) {
    const minX = BATTLE_BOUNDS.left + fighter.radius;
    const maxX = BATTLE_BOUNDS.right - fighter.radius;
    const minY = BATTLE_BOUNDS.top + fighter.radius;
    const maxY = BATTLE_BOUNDS.bottom - fighter.radius;
    const preferredAngle = Math.atan2(directionY, directionX);
    const angleStep = Math.PI / 72;
    const insideBounds = (point: { x: number; y: number }) =>
      point.x >= minX &&
      point.x <= maxX &&
      point.y >= minY &&
      point.y <= maxY;

    for (let step = 0; step <= 72; step += 1) {
      const offsets = step === 0 ? [0] : [step * angleStep, -step * angleStep];
      for (const offset of offsets) {
        const angle = preferredAngle + offset;
        const point = {
          x: fighter.x + Math.cos(angle) * distance,
          y: fighter.y + Math.sin(angle) * distance,
        };
        if (insideBounds(point)) return point;
      }
    }

    const axisAlignedEndpoint = [
      { x: fighter.x + distance, y: fighter.y },
      { x: fighter.x - distance, y: fighter.y },
      { x: fighter.x, y: fighter.y + distance },
      { x: fighter.x, y: fighter.y - distance },
    ].find(insideBounds);
    if (axisAlignedEndpoint) return axisAlignedEndpoint;
    throw new Error(`战场空间不足以完成 ${distance} 距离的固定冲刺`);
  }

  private occupiedPosition(fighter: Fighter) {
    return fighter.abilityMotion
      ? { x: fighter.abilityMotion.toX, y: fighter.abilityMotion.toY }
      : fighter.jumpTime > 0
      ? { x: fighter.jumpToX, y: fighter.jumpToY }
      : { x: fighter.x, y: fighter.y };
  }

  private findYieldableAlly(
    mover: Fighter,
    from: { x: number; y: number },
    to: { x: number; y: number },
    fighters: Fighter[],
  ) {
    const pathX = to.x - from.x;
    const pathY = to.y - from.y;
    const pathLength = Math.hypot(pathX, pathY);
    if (pathLength < 0.01) return null;
    const unitX = pathX / pathLength;
    const unitY = pathY / pathLength;
    let best: Fighter | null = null;
    let bestForward = Number.POSITIVE_INFINITY;
    for (const other of fighters) {
      if (
        !other.alive
        || other === mover
        || other.team !== mover.team
        || other.abilityMotion
        || other.jumpPending
        || other.jumpTime > 0
      ) continue;
      const relativeX = other.x - from.x;
      const relativeY = other.y - from.y;
      const forward = relativeX * unitX + relativeY * unitY;
      const lateral = Math.abs(relativeX * -unitY + relativeY * unitX);
      if (
        forward <= YIELD_MIN_FORWARD
        || forward > pathLength + mover.radius + other.radius + YIELD_PATH_PADDING
        || lateral >= mover.radius + other.radius + YIELD_PATH_PADDING
      ) continue;
      if (
        forward < bestForward
        || (forward === bestForward && (!best || other.fid.localeCompare(best.fid) < 0))
      ) {
        best = other;
        bestForward = forward;
      }
    }
    return best;
  }

  private allyPushForceActive(mover: Fighter) {
    return mover.avoidTime > 0 || mover.stuckTime >= STUCK_PUSH_FORCE_DELAY;
  }

  /** 用碰撞把挡路友军推开；贴敌时沿敌人圆周滑动，不开闪现 */
  private applyAllyContactPressure(
    mover: Fighter,
    blocker: Fighter,
    motionX: number,
    motionY: number,
    dt: number,
    fighters: Fighter[],
  ) {
    const distance = Math.hypot(blocker.x - mover.x, blocker.y - mover.y);
    const minimum = mover.radius + blocker.radius + CONTACT_SKIN;
    const force = this.allyPushForceActive(mover);
    const reach = force ? minimum + 6 : minimum;
    if (distance >= reach) return false;
    const sideX = -motionY;
    const sideY = motionX;
    const required = Math.max(minimum - distance, force ? 2.5 : 0);
    const shift = Math.min(
      required,
      (force ? CONTACT_PRESSURE_SPEED_FORCE : CONTACT_PRESSURE_SPEED) * dt,
      force ? MAX_CONTACT_SHIFT_PER_TICK_FORCE : MAX_CONTACT_SHIFT_PER_TICK,
    );
    if (shift < 0.01) return false;
    const sides: Array<-1 | 1> = [mover.avoidSide, mover.avoidSide === 1 ? -1 : 1];
    const offsets: Array<{ x: number; y: number }> = [];
    for (const side of sides) {
      offsets.push({ x: sideX * shift * side, y: sideY * shift * side });
    }
    if (force) {
      const awayX = distance > 0.01 ? (blocker.x - mover.x) / distance : motionX;
      const awayY = distance > 0.01 ? (blocker.y - mover.y) / distance : motionY;
      for (const side of sides) {
        offsets.push({
          x: awayX * shift * 0.55 + sideX * shift * side * 0.85,
          y: awayY * shift * 0.55 + sideY * shift * side * 0.85,
        });
      }
    }
    // 友军已贴敌人时，纯横向会被挡住；改为沿敌人外缘滑动腾出通道
    for (const other of fighters) {
      if (!other.alive || other === blocker || other === mover || other.team === mover.team) continue;
      const relativeX = blocker.x - other.x;
      const relativeY = blocker.y - other.y;
      const relative = Math.hypot(relativeX, relativeY);
      const touchGap = relative - blocker.radius - other.radius;
      if (touchGap > 18) continue;
      const orbitRadius = Math.max(relative, other.radius + blocker.radius + CONTACT_SKIN);
      const baseAngle = Math.atan2(relativeY || 0.01, relativeX || 0.01);
      const tangentX = relative > 0.01 ? -relativeY / relative : -1;
      const tangentY = relative > 0.01 ? relativeX / relative : 0;
      for (const side of sides) {
        offsets.push({ x: tangentX * shift * side, y: tangentY * shift * side });
        const orbitAngle = baseAngle + side * (shift / Math.max(orbitRadius, 1));
        offsets.push({
          x: other.x + Math.cos(orbitAngle) * orbitRadius - blocker.x,
          y: other.y + Math.sin(orbitAngle) * orbitRadius - blocker.y,
        });
      }
    }
    let best: { x: number; y: number; clearance: number } | null = null;
    for (const offset of offsets) {
      const offsetLength = Math.hypot(offset.x, offset.y);
      if (offsetLength < shift * 0.35) continue;
      const candidate = this.clampFighterPosition(blocker, {
        x: blocker.x + offset.x,
        y: blocker.y + offset.y,
      });
      if (Math.hypot(candidate.x - blocker.x, candidate.y - blocker.y) < shift * 0.35) continue;
      let clearance = Infinity;
      let blocked = false;
      for (const other of fighters) {
        if (!other.alive || other === blocker || other === mover) continue;
        const position = this.occupiedPosition(other);
        const gap = Math.hypot(candidate.x - position.x, candidate.y - position.y) - blocker.radius - other.radius - CONTACT_SKIN;
        if (gap < 0) {
          blocked = true;
          break;
        }
        clearance = Math.min(clearance, gap);
      }
      if (!blocked && (!best || clearance > best.clearance)) best = { ...candidate, clearance };
    }
    if (!best) return false;
    blocker.x = best.x;
    blocker.y = best.y;
    return true;
  }

  /** 逃跑/后坐力只挤开接触路径上的单位；不递归推动整条队列。 */
  private applyForcedMovementPressure(
    mover: Fighter,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    fighters: Fighter[],
  ) {
    const pathX = toX - fromX;
    const pathY = toY - fromY;
    const pathLength = Math.hypot(pathX, pathY);
    if (pathLength < 0.01) return;
    const forwardX = pathX / pathLength;
    const forwardY = pathY / pathLength;
    const blockers = fighters
      .filter(
        (other) =>
          other.alive &&
          other !== mover &&
          !other.abilityMotion &&
          !other.jumpPending &&
          other.jumpTime <= 0,
      )
      .map((other) => ({
        other,
        forward: (other.x - fromX) * forwardX + (other.y - fromY) * forwardY,
      }))
      .filter(({ other, forward }) => {
        if (forward < -other.radius || forward > pathLength + other.radius) return false;
        const contactRadius = mover.radius + other.radius + CONTACT_SKIN + 4;
        return this.distanceToSegment(other.x, other.y, fromX, fromY, toX, toY) < contactRadius;
      })
      .sort((left, right) => left.forward - right.forward || left.other.fid.localeCompare(right.other.fid));

    blockers.forEach(({ other }) => {
      const relativeX = other.x - mover.x;
      const relativeY = other.y - mover.y;
      const cross = forwardX * relativeY - forwardY * relativeX;
      const preferredSide: -1 | 1 = Math.abs(cross) > 0.01
        ? cross < 0 ? -1 : 1
        : other.avoidSide;
      const contactRadius = mover.radius + other.radius + CONTACT_SKIN;
      const overlap = Math.max(0, contactRadius - Math.hypot(relativeX, relativeY));
      const sideShift = Math.min(
        FORCED_MOVEMENT_SIDE_SHIFT,
        Math.max(7, overlap + pathLength * 0.75),
      );
      const forwardShift = Math.min(6, pathLength * 0.35);
      let best: { x: number; y: number; clearance: number; moved: number } | null = null;
      const sides: Array<-1 | 1> = [preferredSide, preferredSide === 1 ? -1 : 1];
      for (const side of sides) {
        const point = this.clampFighterPosition(other, {
          x: other.x + forwardX * forwardShift - forwardY * sideShift * side,
          y: other.y + forwardY * forwardShift + forwardX * sideShift * side,
        });
        const moved = Math.hypot(point.x - other.x, point.y - other.y);
        const clearance = fighters.reduce((minimum, candidate) => {
          if (!candidate.alive || candidate === other || candidate === mover) return minimum;
          const occupied = this.occupiedPosition(candidate);
          return Math.min(
            minimum,
            Math.hypot(point.x - occupied.x, point.y - occupied.y) -
              other.radius -
              candidate.radius,
          );
        }, Infinity);
        if (
          !best ||
          clearance > best.clearance + 0.01 ||
          (Math.abs(clearance - best.clearance) <= 0.01 && moved > best.moved)
        ) {
          best = { ...point, clearance, moved };
        }
      }
      if (best && best.moved > 0.01) {
        other.x = best.x;
        other.y = best.y;
      }
    });
  }

  private findOpenPlacement(
    fighter: Fighter,
    preferred: { x: number; y: number },
    occupants: Fighter[],
    margin = PLACEMENT_MARGIN,
    preferredCandidates: Array<{ x: number; y: number }> = [],
    excluded: Fighter | null = null,
  ) {
    const side = fighter.avoidSide;
    const candidates = [preferred, ...preferredCandidates];
    [42, 78, 118].forEach((radius) => {
      [0, (side * Math.PI) / 2, (-side * Math.PI) / 2, Math.PI].forEach((angle) => {
        candidates.push({ x: preferred.x + Math.cos(angle) * radius, y: preferred.y + Math.sin(angle) * radius });
      });
    });
    let best = this.clampFighterPosition(fighter, candidates[0]);
    let bestClearance = -Infinity;
    for (const candidate of candidates) {
      const clamped = this.clampFighterPosition(fighter, candidate);
      let clearance = Infinity;
      for (const other of occupants) {
        if (!other.alive || other === fighter || other === excluded) continue;
        const positionX = other.abilityMotion
          ? other.abilityMotion.toX
          : other.jumpTime > 0
            ? other.jumpToX
            : other.x;
        const positionY = other.abilityMotion
          ? other.abilityMotion.toY
          : other.jumpTime > 0
            ? other.jumpToY
            : other.y;
        clearance = Math.min(
          clearance,
          Math.hypot(clamped.x - positionX, clamped.y - positionY)
            - fighter.radius
            - other.radius
            - margin,
        );
        if (clearance < 0) break;
      }
      if (clearance >= 0) return clamped;
      if (clearance > bestClearance) {
        best = clamped;
        bestClearance = clearance;
      }
    }
    return best;
  }

  /** 挡路时优先朝目标攻击环侧翼走，仍是逐步移动而非瞬移 */
  private combatApproachCandidates(fighter: Fighter, target: Fighter, preferredRange: number) {
    const baseAngle = Math.atan2(fighter.y - target.y, fighter.x - target.x);
    const side = fighter.avoidSide;
    const offsets = [0, side * 0.55, -side * 0.55, side * 1.15, -side * 1.15, side * 1.75, -side * 1.75, Math.PI];
    return offsets.map((offset) => ({
      x: target.x + Math.cos(baseAngle + offset) * preferredRange,
      y: target.y + Math.sin(baseAngle + offset) * preferredRange,
    }));
  }

  private findFrontAllyBlocker(mover: Fighter, towardX: number, towardY: number, fighters: Fighter[]) {
    const force = this.allyPushForceActive(mover);
    let best: Fighter | null = null;
    let bestForward = Number.POSITIVE_INFINITY;
    for (const other of fighters) {
      if (
        !other.alive
        || other === mover
        || other.team !== mover.team
        || other.abilityMotion
        || other.jumpPending
        || other.jumpTime > 0
      ) continue;
      const relativeX = other.x - mover.x;
      const relativeY = other.y - mover.y;
      const forward = relativeX * towardX + relativeY * towardY;
      const lateral = Math.abs(relativeX * -towardY + relativeY * towardX);
      const distance = Math.hypot(relativeX, relativeY);
      if (
        forward <= YIELD_MIN_FORWARD
        || forward >= AVOID_LOOK_AHEAD
        || lateral >= mover.radius + other.radius + 10
        || distance >= mover.radius + other.radius + (force ? 14 : 4)
      ) continue;
      if (
        forward < bestForward
        || (forward === bestForward && (!best || other.fid.localeCompare(best.fid) < 0))
      ) {
        best = other;
        bestForward = forward;
      }
    }
    return best;
  }

  private relocateFighter(source: Fighter, preferred: { x: number; y: number }) {
    const battle = this.state.battle;
    if (!battle) return;
    const occupants = [...battle.player, ...battle.enemy].filter((fighter) => fighter !== source);
    const landing = this.findOpenPlacement(source, preferred, occupants);
    source.x = landing.x;
    source.y = landing.y;
  }

  private startAbilityMotion(
    source: Fighter,
    kind: AbilityMotion["kind"],
    preferred: { x: number; y: number },
    options: {
      abilityId?: UnitId | null;
      sourceFid?: string | null;
      targetFid?: string | null;
      duration?: number;
      arcHeight?: number;
      controlX?: number;
      controlY?: number;
      avoidOccupied?: boolean;
    } = {},
  ) {
    const battle = this.state.battle;
    if (!battle || !source.alive) return null;
    const occupants = [...battle.player, ...battle.enemy].filter((fighter) => fighter !== source);
    const landing = options.avoidOccupied === false
      ? this.clampFighterPosition(source, preferred)
      : this.findOpenPlacement(source, preferred, occupants);
    const distance = Math.hypot(landing.x - source.x, landing.y - source.y);
    const duration = options.duration ?? Math.max(0.28, Math.min(0.72, distance / (kind === "jump" ? 760 : 900)));
    source.jumpPending = false;
    source.jumpTime = 0;
    source.vanguardJumpAdvancing = false;
    source.attackPulse = 0;
    source.abilityMotion = {
      kind,
      abilityId: options.abilityId === undefined ? source.unitId : options.abilityId,
      sourceFid: options.sourceFid || null,
      targetFid: options.targetFid || null,
      fromX: source.x,
      fromY: source.y,
      toX: landing.x,
      toY: landing.y,
      time: 0,
      duration,
      arcHeight: options.arcHeight ?? (kind === "jump" ? 88 : 0),
      controlX: options.controlX,
      controlY: options.controlY,
      hitFids: [],
    };
    this.faceTowardX(source, landing.x);
    return source.abilityMotion;
  }

  private retreatFrom(
    source: Fighter,
    target: Fighter,
    distance: number,
    duration: number,
  ) {
    return this.tryAttackRecoil(source, target, {
      active:
        source.unitId === "rift_stalker" &&
        source.hp / Math.max(1, source.maxHp) <= 0.65,
      distance,
      duration,
      rangeMargin: 5,
    });
  }

  private distanceToSegment(
    pointX: number,
    pointY: number,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
  ) {
    const segmentX = toX - fromX;
    const segmentY = toY - fromY;
    const lengthSquared = segmentX * segmentX + segmentY * segmentY;
    if (lengthSquared < 0.0001) return Math.hypot(pointX - fromX, pointY - fromY);
    const projection = Math.max(0, Math.min(1, ((pointX - fromX) * segmentX + (pointY - fromY) * segmentY) / lengthSquared));
    return Math.hypot(pointX - (fromX + segmentX * projection), pointY - (fromY + segmentY * projection));
  }

  private updateSekiBoarCharge(
    source: Fighter,
    dt: number,
    battle: BattleState,
    movementIntents: Map<string, MovementIntent>,
  ) {
    const targets = (source.team === "player" ? battle.enemy : battle.player)
      .filter((fighter) => fighter.alive && fighter.hp > 0);
    const target = this.nearestTarget(source, targets);
    let directionX = source.sekiChargeDirectionX;
    let directionY = source.sekiChargeDirectionY;
    if (target) {
      const desiredAngle = Math.atan2(target.y - source.y, target.x - source.x);
      const currentAngle = Math.atan2(directionY, directionX);
      const angleDelta = Math.atan2(
        Math.sin(desiredAngle - currentAngle),
        Math.cos(desiredAngle - currentAngle),
      );
      const turn = Math.max(
        -SEKI_CHARGE_TURN_RATE * dt,
        Math.min(SEKI_CHARGE_TURN_RATE * dt, angleDelta),
      );
      const nextAngle = currentAngle + turn;
      directionX = Math.cos(nextAngle);
      directionY = Math.sin(nextAngle);
    }

    const previousX = source.x;
    const previousY = source.y;
    const travel =
      SEKI_CHARGE_SPEED *
      (source.slowTime > 0 ? source.slowMultiplier : 1) *
      dt;
    let nextX = source.x + directionX * travel;
    let nextY = source.y + directionY * travel;
    const minX = BATTLE_BOUNDS.left + source.radius;
    const maxX = BATTLE_BOUNDS.right - source.radius;
    const minY = BATTLE_BOUNDS.top + source.radius;
    const maxY = BATTLE_BOUNDS.bottom - source.radius;
    let bounced = false;
    if (nextX < minX) {
      nextX = minX + (minX - nextX);
      directionX = Math.abs(directionX);
      bounced = true;
    } else if (nextX > maxX) {
      nextX = maxX - (nextX - maxX);
      directionX = -Math.abs(directionX);
      bounced = true;
    }
    if (nextY < minY) {
      nextY = minY + (minY - nextY);
      directionY = Math.abs(directionY);
      bounced = true;
    } else if (nextY > maxY) {
      nextY = maxY - (nextY - maxY);
      directionY = -Math.abs(directionY);
      bounced = true;
    }

    source.x = Math.max(minX, Math.min(maxX, nextX));
    source.y = Math.max(minY, Math.min(maxY, nextY));
    source.sekiChargeDirectionX = directionX;
    source.sekiChargeDirectionY = directionY;
    source.facingX = directionX < 0 ? -1 : 1;
    source.attackPulse = 0;
    movementIntents.set(source.fid, { x: directionX, y: directionY });

    if (bounced) {
      this.addEffect({
        kind: "burst",
        x: source.x,
        y: source.y,
        color: UNIT_DEFS.seki_boar_king.accent,
        life: 0.32,
        size: source.radius * 1.7,
      });
      this.addEffect({
        kind: "text",
        x: source.x,
        y: source.y - 42,
        color: UNIT_DEFS.seki_boar_king.accent,
        text: "反弹",
        life: 0.4,
        size: 10,
      });
    }

    const targetsByFid = new Map(targets.map((enemy) => [enemy.fid, enemy]));
    source.sekiChargeHitFids = source.sekiChargeHitFids.filter((fid) => {
      const enemy = targetsByFid.get(fid);
      return Boolean(
        enemy &&
        Math.hypot(enemy.x - source.x, enemy.y - source.y) <=
          source.radius + enemy.radius + SEKI_CHARGE_COLLISION_PADDING + 14,
      );
    });
    targets.forEach((enemy) => {
      if (!enemy.alive || source.sekiChargeHitFids.includes(enemy.fid)) return;
      const collisionDistance = source.radius + enemy.radius + SEKI_CHARGE_COLLISION_PADDING;
      if (
        this.distanceToSegment(
          enemy.x,
          enemy.y,
          previousX,
          previousY,
          source.x,
          source.y,
        ) > collisionDistance
      ) return;
      source.sekiChargeHitFids.push(enemy.fid);
      source.sekiChargeHitCount += 1;
      this.startAbilityMotion(
        enemy,
        "push",
        {
          x: enemy.x + directionX * SEKI_CHARGE_PUSH_DISTANCE,
          y: enemy.y + directionY * SEKI_CHARGE_PUSH_DISTANCE,
        },
        { abilityId: null, duration: 0.24, avoidOccupied: false },
      );
      enemy.stun = Math.max(enemy.stun, SEKI_CHARGE_STUN_DURATION);
      this.addEffect({
        kind: "burst",
        x: enemy.x,
        y: enemy.y,
        color: UNIT_DEFS.seki_boar_king.accent,
        life: 0.38,
        size: enemy.radius * 1.8,
      });
      this.addEffect({
        kind: "text",
        x: enemy.x,
        y: enemy.y - 42,
        color: UNIT_DEFS.seki_boar_king.accent,
        text: "撞飞",
        life: 0.52,
        size: 11,
      });
    });

    this.addEffect({
      kind: "line",
      x: previousX,
      y: previousY,
      x2: source.x,
      y2: source.y,
      color: UNIT_DEFS.seki_boar_king.accent,
      life: 0.16,
      size: 7,
    });
  }

  private dealAbilityDamage(source: Fighter, target: Fighter, multiplier: number, bonus = 0) {
    const dealt = this.damage(source, target, source.attack * multiplier + bonus, false, "ability");
    if (dealt > 0) this.addDamageText(target, dealt);
    return dealt;
  }

  private sweepGuangyiDash(source: Fighter, motion: AbilityMotion, fromX: number, fromY: number) {
    const battle = this.state.battle;
    if (!battle) return;
    const opponents = source.team === "player" ? battle.enemy : battle.player;
    const pathX = motion.toX - motion.fromX;
    const pathY = motion.toY - motion.fromY;
    const pathLength = Math.hypot(pathX, pathY) || 1;
    const forwardX = pathX / pathLength;
    const forwardY = pathY / pathLength;
    opponents.forEach((target) => {
      if (!target.alive || motion.hitFids.includes(target.fid)) return;
      const collisionDistance = source.radius + target.radius + 10;
      if (this.distanceToSegment(target.x, target.y, fromX, fromY, source.x, source.y) > collisionDistance) return;
      motion.hitFids.push(target.fid);
      const cross = forwardX * (target.y - source.y) - forwardY * (target.x - source.x);
      const side = Math.abs(cross) > 0.01 ? (cross < 0 ? -1 : 1) : target.avoidSide;
      this.startAbilityMotion(
        target,
        "push",
        {
          x: target.x + forwardX * 58 - forwardY * side * 34,
          y: target.y + forwardY * 58 + forwardX * side * 34,
        },
        { abilityId: null, duration: 0.26, avoidOccupied: false },
      );
      this.dealAbilityDamage(source, target, 1.1);
      if (target.alive) target.stun = Math.max(target.stun, GUANGYI_SLIDE_STUN_DURATION);
      this.addEffect({
        kind: "burst",
        x: target.x,
        y: target.y,
        color: UNIT_DEFS[source.unitId].accent,
        life: 0.38,
        size: target.radius * 1.7,
      });
    });
  }

  private pushFighterAwayFrom(
    target: Fighter,
    originX: number,
    originY: number,
    distance: number,
    duration = 0.24,
  ) {
    const deltaX = target.x - originX;
    const deltaY = target.y - originY;
    const length = Math.hypot(deltaX, deltaY);
    const fallbackX = target.team === "player" ? -1 : 1;
    const directionX = length > 0.001 ? deltaX / length : fallbackX;
    const directionY = length > 0.001 ? deltaY / length : 0;
    return this.startAbilityMotion(
      target,
      "push",
      {
        x: target.x + directionX * distance,
        y: target.y + directionY * distance,
      },
      { abilityId: null, duration, avoidOccupied: false },
    );
  }

  private sweepBiscuitRescueDash(source: Fighter, motion: AbilityMotion, fromX: number, fromY: number) {
    const battle = this.state.battle;
    if (!battle) return;
    const opponents = source.team === "player" ? battle.enemy : battle.player;
    const pathX = motion.toX - motion.fromX;
    const pathY = motion.toY - motion.fromY;
    const pathLength = Math.hypot(pathX, pathY) || 1;
    const forwardX = pathX / pathLength;
    const forwardY = pathY / pathLength;
    opponents.forEach((target) => {
      if (!target.alive || motion.hitFids.includes(target.fid)) return;
      const collisionDistance = source.radius + target.radius + 8;
      if (this.distanceToSegment(target.x, target.y, fromX, fromY, source.x, source.y) > collisionDistance) return;
      motion.hitFids.push(target.fid);
      this.startAbilityMotion(
        target,
        "push",
        {
          x: target.x + forwardX * BISCUIT_RESCUE_PATH_PUSH,
          y: target.y + forwardY * BISCUIT_RESCUE_PATH_PUSH,
        },
        { abilityId: null, duration: 0.24, avoidOccupied: false },
      );
      this.addEffect({
        kind: "burst",
        x: target.x,
        y: target.y,
        color: UNIT_DEFS.biscuit_sui.accent,
        life: 0.34,
        size: target.radius * 1.55,
      });
    });
  }

  private sweepSuiBirdElbowDash(source: Fighter, motion: AbilityMotion, fromX: number, fromY: number) {
    const battle = this.state.battle;
    if (!battle) return;
    const opponents = source.team === "player" ? battle.enemy : battle.player;
    const pathX = motion.toX - motion.fromX;
    const pathY = motion.toY - motion.fromY;
    const pathLength = Math.hypot(pathX, pathY) || 1;
    const forwardX = pathX / pathLength;
    const forwardY = pathY / pathLength;
    opponents.forEach((target) => {
      if (!target.alive || motion.hitFids.includes(target.fid)) return;
      const collisionDistance = source.radius + target.radius + 10;
      if (this.distanceToSegment(target.x, target.y, fromX, fromY, source.x, source.y) > collisionDistance) return;
      motion.hitFids.push(target.fid);
      this.dealAbilityDamage(source, target, SUI_BIRD_ELBOW_DAMAGE);
      if (target.alive) {
        target.stun = Math.max(target.stun, SUI_BIRD_ELBOW_STUN);
        this.startAbilityMotion(
          target,
          "push",
          {
            x: target.x + forwardX * SUI_BIRD_ELBOW_PUSH,
            y: target.y + forwardY * SUI_BIRD_ELBOW_PUSH,
          },
          { abilityId: null, duration: 0.22, avoidOccupied: false },
        );
      }
      this.addEffect({
        kind: "burst",
        x: target.x,
        y: target.y,
        color: UNIT_DEFS.sui_bird.accent,
        life: 0.3,
        size: target.radius * 1.6,
      });
    });
  }

  private startSuiBirdElbowDash(source: Fighter, targets: Fighter[]) {
    if (source.suiBirdChargesRemaining <= 0) return false;
    const target = this.nearestTarget(source, targets.filter((candidate) => candidate.alive));
    if (!target) {
      source.suiBirdChargesRemaining = 0;
      return false;
    }
    const deltaX = target.x - source.x;
    const deltaY = target.y - source.y;
    const distance = Math.hypot(deltaX, deltaY) || 1;
    const directionX = deltaX / distance;
    const directionY = deltaY / distance;
    const endpoint = this.fixedDistanceEndpoint(
      source,
      directionX,
      directionY,
      SUI_BIRD_ELBOW_DISTANCE,
    );
    source.suiBirdChargesRemaining -= 1;
    const motion = this.startAbilityMotion(
      source,
      "dash",
      endpoint,
      {
        targetFid: target.fid,
        duration: SUI_BIRD_ELBOW_DISTANCE / 900,
        avoidOccupied: false,
      },
    );
    if (!motion) {
      source.suiBirdChargesRemaining = 0;
      return false;
    }
    const strike = SUI_BIRD_ELBOW_CHARGES - source.suiBirdChargesRemaining;
    this.addEffect({
      kind: "text",
      x: source.x,
      y: source.y - 44,
      color: UNIT_DEFS.sui_bird.accent,
      text: `肘击 ${strike}/${SUI_BIRD_ELBOW_CHARGES}`,
      life: 0.42,
      size: 11,
    });
    return true;
  }

  private resolveAbilityMotion(source: Fighter, motion: AbilityMotion) {
    const battle = this.state.battle;
    if (!battle || !source.alive || !motion.abilityId) return;
    const allies = source.team === "player" ? battle.player : battle.enemy;
    const targets = source.team === "player" ? battle.enemy : battle.player;
    const livingTargets = targets.filter((target) => target.alive);
    const target = [...battle.player, ...battle.enemy].find((fighter) => fighter.fid === motion.targetFid && fighter.alive) || null;
    const accent = UNIT_DEFS[source.unitId].accent;

    switch (motion.abilityId) {
      case "shiori": {
        const stunDuration = abilityStatForStar(
          UNIT_DEFS.shiori,
          source.star,
          "stunDuration",
          SHIORI_OTTER_STUN,
        );
        livingTargets
          .filter((enemy) => Math.hypot(enemy.x - source.x, enemy.y - source.y) < SHIORI_OTTER_RADIUS)
          .forEach((enemy) => {
            this.dealAbilityDamage(source, enemy, SHIORI_OTTER_DAMAGE);
            if (enemy.alive) enemy.stun = Math.max(enemy.stun, stunDuration);
          });
        this.grantShield(source, source, source.maxHp * SHIORI_OTTER_SHIELD_RATIO, 0.45);
        this.addEffect({ kind: "text", x: source.x, y: source.y - 44, color: accent, text: "海獭冲击", life: 0.68, size: 12 });
        break;
      }
      case "sui_bird": {
        if (!this.startSuiBirdElbowDash(source, livingTargets)) {
          source.suiBirdChargesRemaining = 0;
          this.addEffect({ kind: "text", x: source.x, y: source.y - 44, color: accent, text: "三连完成", life: 0.5, size: 11 });
        }
        break;
      }
      case "biscuit_sui": {
        if (target && target.team === source.team) {
          this.heal(
            source,
            target,
            target.maxHp * BISCUIT_RESCUE_HEAL_HP_RATIO + source.attack * BISCUIT_RESCUE_HEAL_ATTACK_RATIO,
          );
          this.grantShield(source, target, target.maxHp * BISCUIT_RESCUE_SHIELD_RATIO, 0.36);
        }
        livingTargets
          .filter(
            (enemy) =>
              !motion.hitFids.includes(enemy.fid) &&
              Math.hypot(enemy.x - source.x, enemy.y - source.y) <=
                BISCUIT_RESCUE_LANDING_RADIUS + enemy.radius,
          )
          .forEach((enemy) => {
            motion.hitFids.push(enemy.fid);
            this.pushFighterAwayFrom(enemy, source.x, source.y, BISCUIT_RESCUE_LANDING_PUSH);
          });
        this.addEffect({ kind: "ring", x: source.x, y: source.y, color: accent, life: 0.65, size: BISCUIT_RESCUE_LANDING_RADIUS });
        this.addEffect({ kind: "text", x: source.x, y: source.y - 44, color: accent, text: "暖男回复", life: 0.68, size: 12 });
        break;
      }
      case "grove_mender": {
        const duration = abilityStatForStar(
          UNIT_DEFS.grove_mender,
          source.star,
          "duration",
          NANA_PICKAXE_DURATION,
        );
        source.energy = source.maxEnergy;
        source.barrageActive = true;
        source.barrageDrainPerSecond = source.maxEnergy / duration;
        source.abilityArmorBonus = NANA_PICKAXE_ARMOR_BONUS;
        source.armor += source.abilityArmorBonus;
        livingTargets
          .filter(
            (enemy) =>
              Math.hypot(enemy.x - source.x, enemy.y - source.y) <=
              NANA_PICKAXE_TAUNT_RADIUS + enemy.radius,
          )
          .forEach((enemy) => {
            enemy.tauntedByFid = source.fid;
            enemy.tauntTime = Math.max(enemy.tauntTime, NANA_PICKAXE_TAUNT_REFRESH);
          });
        this.addEffect({ kind: "ring", x: source.x, y: source.y, color: accent, life: 0.65, size: NANA_PICKAXE_TAUNT_RADIUS });
        this.addEffect({ kind: "text", x: source.x, y: source.y - 44, color: accent, text: "护甲提升 · 全员看我", life: 0.8, size: 11 });
        break;
      }
      case "youyi":
        if (target) {
          this.dealAbilityDamage(source, target, 0.78);
          if (target.alive) this.dealAbilityDamage(source, target, 0.78);
          if (target.alive) target.stun = Math.max(target.stun, 0.45);
        }
        break;
      case "akirinco":
        if (target) {
          let total = 0;
          for (let strike = 0; strike < 3 && target.alive; strike += 1) {
            total += Math.max(0, this.dealAbilityDamage(source, target, 0.82));
          }
          if (!target.alive) this.heal(source, source, total * 0.3);
        }
        break;
      case "lovely": {
        let hits = 0;
        livingTargets
          .filter((enemy) => Math.hypot(enemy.x - source.x, enemy.y - source.y) < 135)
          .forEach((enemy) => {
            this.dealAbilityDamage(source, enemy, 1.22);
            hits += 1;
          });
        source.attackInterval /= 1 + Math.min(0.3, hits * 0.06);
        source.baseAttackInterval = source.attackInterval;
        break;
      }
      case "mumu":
        livingTargets
          .filter((enemy) => Math.hypot(enemy.x - source.x, enemy.y - source.y) < 125)
          .forEach((enemy) => this.dealAbilityDamage(source, enemy, 1.15));
        allies
          .filter((ally) => ally.alive && Math.hypot(ally.x - source.x, ally.y - source.y) < 150)
          .forEach((ally) => this.grantShield(source, ally, ally.maxHp * 0.12, 0.38));
        break;
      case "sui_cat":
        if (target) {
          for (let strike = 0; strike < 3 && target.alive; strike += 1) {
            this.dealAbilityDamage(source, target, 0.95);
          }
          if (target.alive) target.stun = Math.max(target.stun, 0.95);
          this.addEffect({ kind: "text", x: target.x, y: target.y - 48, color: accent, text: "猫拳三连", life: 0.7, size: 12 });
        }
        break;
      default:
        break;
    }
    this.addEffect({
      kind: motion.kind === "jump" ? "burst" : "ring",
      x: source.x,
      y: source.y,
      color: accent,
      life: 0.58,
      size: Math.max(60, source.radius * 2),
    });
  }

  private updateAbilityMotion(fighter: Fighter, dt: number, battle: BattleState) {
    const motion = fighter.abilityMotion;
    if (!motion) return false;
    // 沐霂的舞带是外部拉援，目标即使仍在时停范围内也会继续被拖出。
    if (motion.kind !== "pull" && this.isInsideChronosphere(fighter, battle)) return true;
    const previousX = fighter.x;
    const previousY = fighter.y;
    motion.time = Math.min(motion.duration, motion.time + dt);
    const progress = motion.duration > 0 ? motion.time / motion.duration : 1;
    // 滑跪先冲后刹，末段速度降到零，避免像匀速传送一样穿过战场。
    if (
      motion.kind === "pull" &&
      motion.abilityId === "mumu" &&
      motion.controlX !== undefined &&
      motion.controlY !== undefined
    ) {
      const point = quadraticMotionPoint(
        { x: motion.fromX, y: motion.fromY },
        { x: motion.controlX, y: motion.controlY },
        { x: motion.toX, y: motion.toY },
        mumuWhipPullProgress(progress),
      );
      fighter.x = point.x;
      fighter.y = point.y;
    } else {
      const eased = motion.abilityId === "guangyi"
        ? 1 - (1 - progress) ** 3
        : motion.kind === "dash"
          ? progress
        : progress * progress * (3 - 2 * progress);
      fighter.x = motion.fromX + (motion.toX - motion.fromX) * eased;
      fighter.y = motion.fromY + (motion.toY - motion.fromY) * eased;
    }
    if (motion.forceThrough) {
      this.applyForcedMovementPressure(
        fighter,
        previousX,
        previousY,
        fighter.x,
        fighter.y,
        [...battle.player, ...battle.enemy],
      );
    }
    if (motion.abilityId === "guangyi") this.sweepGuangyiDash(fighter, motion, previousX, previousY);
    if (motion.abilityId === "biscuit_sui") this.sweepBiscuitRescueDash(fighter, motion, previousX, previousY);
    if (motion.abilityId === "sui_bird") this.sweepSuiBirdElbowDash(fighter, motion, previousX, previousY);
    if (progress >= 1) {
      fighter.x = motion.toX;
      fighter.y = motion.toY;
      fighter.abilityMotion = null;
      if (motion.kind === "pull" && motion.abilityId === "mumu") {
        this.resolveMumuRescue(fighter, motion, battle);
      } else {
        this.resolveAbilityMotion(fighter, motion);
      }
    }
    return true;
  }

  private resolveCombatTarget(source: Fighter, targets: Fighter[], dt: number) {
    const battle = this.state.battle;
    const isAvailable = (target: Fighter) => (
      target.alive &&
      (Boolean(battle && this.isFrozenByChronosphere(target, battle)) ||
        (!target.abilityMotion && !target.jumpPending && target.jumpTime <= 0))
    );
    const tauntTarget = source.tauntTime > 0
      ? targets.find((target) => target.fid === source.tauntedByFid && isAvailable(target)) || null
      : null;
    if (tauntTarget) {
      source.targetFid = tauntTarget.fid;
      source.targetLock = MITSURI_TAUNT_DURATION;
      return tauntTarget;
    }
    if (source.tauntTime > 0) {
      source.tauntTime = 0;
      source.tauntedByFid = null;
    }
    const current = targets.find((target) => target.fid === source.targetFid && isAvailable(target)) || null;
    source.targetLock = Math.max(0, source.targetLock - dt);
    if (current && source.targetLock > 0 && current.stealthTime <= 0) return current;
    const nearest = this.nearestTarget(source, targets);
    const shouldSwitch = !current || !nearest || (current.stealthTime > 0 && nearest.stealthTime <= 0) || (source.targetLock <= 0 && (
      source.stuckTime >= STUCK_RECOVERY_DELAY ||
      Math.hypot(nearest.x - source.x, nearest.y - source.y) + TARGET_SWITCH_DISTANCE < Math.hypot(current.x - source.x, current.y - source.y)
    ));
    const target = shouldSwitch ? nearest : current;
    if (target && target.fid !== source.targetFid) {
      source.targetFid = target.fid;
      source.targetLock = TARGET_LOCK_DURATION;
      source.stuckTime = 0;
      source.progressAnchorDistance = Infinity;
      source.progressWindowTime = 0;
    }
    return target;
  }

  private combatAttackRange(attacker: Fighter, target: Fighter) {
    return Math.max(attacker.range, attacker.radius + target.radius + CONTACT_ATTACK_BUFFER);
  }

  private targetsWithinAbilityRange(source: Fighter, targets: Fighter[]) {
    const abilityRange = UNIT_DEFS[source.unitId].abilityRange;
    if (abilityRange <= 0) return [];
    const inRange: Fighter[] = [];
    for (const target of targets) {
      if (
        target.alive
        && Math.hypot(target.x - source.x, target.y - source.y) <= abilityRange + target.radius
      ) inRange.push(target);
    }
    return inRange;
  }

  private reiCorpsesWithinRange(source: Fighter) {
    const battle = this.state.battle;
    if (!battle) return [];
    const abilityRange = UNIT_DEFS.rei.abilityRange;
    return battle.corpses
      .filter(
        (corpse) =>
          !corpse.consumed &&
          Math.hypot(corpse.x - source.x, corpse.y - source.y) <= abilityRange,
      )
      .sort(
        (left, right) =>
          Math.hypot(left.x - source.x, left.y - source.y) -
            Math.hypot(right.x - source.x, right.y - source.y) ||
          left.id.localeCompare(right.id),
      );
  }

  private reiReviveCount(source: Fighter) {
    return abilityStatForStar(UNIT_DEFS.rei, source.star, "reviveCount", 2);
  }

  private refreshFighterAttack(fighter: Fighter) {
    fighter.attack = fighter.baseAttack
      * (1 + fighter.emberAttackPerStack * fighter.emberAttackStacks)
      * (1 + (fighter.barrageActive || fighter.abilityAttackBonusTime > 0 ? fighter.abilityAttackBonus : 0))
      * (1 + fighter.towerHackAttackBonus);
  }

  private transferTowerHack(source: Fighter) {
    if (!source.towerHackArmed || !this.state.battle) return null;
    source.towerHackArmed = false;
    const target = this.state.battle[source.team]
      .filter((fighter) => fighter !== source && fighter.alive && fighter.hp > 0)
      .sort(
        (left, right) =>
          Math.hypot(left.x - source.x, left.y - source.y) -
            Math.hypot(right.x - source.x, right.y - source.y) ||
          left.fid.localeCompare(right.fid),
      )[0];
    if (!target) return null;

    const def = UNIT_DEFS.tower_god;
    const attackBonus = abilityStatForStar(def, source.star, "attackBonus", 0.45);
    const armorBonus = abilityStatForStar(def, source.star, "armorBonus", 25);
    const attackSpeed = abilityStatForStar(def, source.star, "attackSpeed", 0.45);
    const moveSpeed = abilityStatForStar(def, source.star, "moveSpeed", 45);
    if (attackBonus > target.towerHackAttackBonus) {
      const previousArmor = target.towerHackArmorBonus;
      const previousAttackSpeed = target.towerHackAttackSpeed;
      const previousMoveSpeed = target.towerHackMoveSpeed;
      target.towerHackBuffed = true;
      target.towerHackAttackBonus = attackBonus;
      target.towerHackArmorBonus = armorBonus;
      target.towerHackAttackSpeed = attackSpeed;
      target.towerHackMoveSpeed = moveSpeed;
      target.armor += armorBonus - previousArmor;
      target.attackInterval *= (1 + previousAttackSpeed) / (1 + attackSpeed);
      target.moveSpeed += moveSpeed - previousMoveSpeed;
      this.refreshFighterAttack(target);
    }

    const battle = this.state.battle;
    battle.banner = "哈哈哈我开挂了 这游戏怎么这么简单啊！";
    battle.bannerTimer = 2.4;
    this.addEffect({
      kind: "line",
      x: source.x,
      y: source.y,
      x2: target.x,
      y2: target.y,
      color: def.accent,
      life: 0.75,
      size: 7,
    });
    this.addEffect({ kind: "ring", x: target.x, y: target.y, color: def.accent, life: 1.1, size: target.radius + 34 });
    this.addEffect({ kind: "burst", x: target.x, y: target.y, color: "#fff1bd", life: 0.72, size: 74 });
    this.addEffect({ kind: "text", x: target.x, y: target.y - 48, color: "#ffe58a", text: "哈哈哈我开挂了！", life: 1.15, size: 13 });
    return target;
  }

  private addGluttonyStack(fighter: Fighter, label: string) {
    const gainedFromKill = label === "击杀";
    if (
      !fighter.alive
      || !fighter.gluttonyHolder
      || fighter.growthStacks >= GLUTTONY_STACK_CAP
      || (gainedFromKill && fighter.gluttonyKillCooldown > 0)
    ) return false;
    const previousStacks = fighter.growthStacks;
    const previousMaxHp = fighter.maxHp;
    fighter.growthStacks += 1;
    fighter.maxHp *= (
      1 + fighter.growthStacks * GLUTTONY_MAX_HP_PER_STACK
    ) / (
      1 + previousStacks * GLUTTONY_MAX_HP_PER_STACK
    );
    fighter.hp = Math.min(
      fighter.maxHp,
      fighter.hp + fighter.maxHp - previousMaxHp,
    );
    fighter.radius = fighter.baseRadius * (1 + fighter.growthStacks * GLUTTONY_RADIUS_PER_STACK);
    if (gainedFromKill) fighter.gluttonyKillCooldown = GLUTTONY_KILL_STACK_COOLDOWN;
    const battle = this.state.battle;
    const reachedFullStack = fighter.growthStacks === GLUTTONY_STACK_CAP;
    let fullStackShield = false;
    if (
      reachedFullStack
      && battle
      && this.battleTraitLevel(battle, fighter.team, "gluttony") >= 2
    ) {
      fullStackShield = true;
      this.grantShield(
        null,
        fighter,
        fighter.maxHp * GLUTTONY_FULL_SHIELD_RATIO,
        0.55,
        battle,
      );
    }
    this.addEffect({
      kind: "text",
      x: fighter.x,
      y: fighter.y - 42,
      color: TRAITS.gluttony.color,
      text: `${label} ${fighter.growthStacks}/${GLUTTONY_STACK_CAP}${fullStackShield ? " · 饱餐护盾" : ""}`,
      life: 0.65,
      size: 10,
    });
    return true;
  }

  private moveTowardCombatTarget(fighter: Fighter, target: Fighter, fighters: Fighter[], dt: number, movementIntents: Map<string, MovementIntent>) {
    const targetDistance = Math.hypot(target.x - fighter.x, target.y - fighter.y);
    const preferredRange = this.combatAttackRange(fighter, target);
    if (targetDistance <= preferredRange) {
      fighter.stuckTime = 0;
      fighter.progressAnchorDistance = targetDistance;
      fighter.progressWindowTime = 0;
      return false;
    }

    fighter.avoidTime = Math.max(0, fighter.avoidTime - dt);
    const towardX = (target.x - fighter.x) / targetDistance;
    const towardY = (target.y - fighter.y) / targetDistance;
    const directPoint = {
      x: target.x - towardX * preferredRange,
      y: target.y - towardY * preferredRange,
    };
    const blockedAhead = fighters.some((other) => {
      if (!other.alive || other === fighter || other === target || other.abilityMotion || other.jumpTime > 0) return false;
      const relativeX = other.x - fighter.x;
      const relativeY = other.y - fighter.y;
      const forward = relativeX * towardX + relativeY * towardY;
      const lateral = Math.abs(relativeX * -towardY + relativeY * towardX);
      return forward > 0 && forward < AVOID_LOOK_AHEAD && lateral < fighter.radius + other.radius + 12;
    });
    const lateralOffset = fighter.avoidTime > 0 || blockedAhead ? fighter.avoidSide * 56 : 0;
    const ringCandidates = blockedAhead || fighter.avoidTime > 0
      ? this.combatApproachCandidates(fighter, target, preferredRange)
      : [];
    const desired = this.findOpenPlacement(
      fighter,
      { x: directPoint.x - towardY * lateralOffset, y: directPoint.y + towardX * lateralOffset },
      fighters,
      2,
      ringCandidates,
      target,
    );
    let moveX = desired.x - fighter.x;
    let moveY = desired.y - fighter.y;
    let moveDistance = Math.hypot(moveX, moveY);
    if (moveDistance < 0.01) {
      moveX = towardX;
      moveY = towardY;
      moveDistance = 1;
    }
    const dashMult = fighter.danceDashTime > 0 ? DANCE_DASH_SPEED_MULT : 1;
      const travel = Math.min(
        moveDistance,
        fighter.moveSpeed *
          dashMult *
          (fighter.slowTime > 0 ? fighter.slowMultiplier : 1) *
          dt,
      );
    const motionX = moveX / moveDistance;
    const motionY = moveY / moveDistance;
    movementIntents.set(fighter.fid, { x: motionX, y: motionY });
    const proposed = this.clampFighterPosition(fighter, {
      x: fighter.x + motionX * travel,
      y: fighter.y + motionY * travel,
    });
    const start = { x: fighter.x, y: fighter.y };
    fighter.x = proposed.x;
    fighter.y = proposed.y;
    const pathBlocker = this.findYieldableAlly(fighter, start, proposed, fighters);
    const frontBlocker = this.findFrontAllyBlocker(fighter, towardX, towardY, fighters);
    const blocker = pathBlocker || frontBlocker;
    if (blocker) this.applyAllyContactPressure(fighter, blocker, motionX, motionY, dt, fighters);
    this.faceTowardX(fighter, target.x);

    const newDistance = Math.hypot(target.x - fighter.x, target.y - fighter.y);
    if (!Number.isFinite(fighter.progressAnchorDistance)) fighter.progressAnchorDistance = targetDistance;
    fighter.progressWindowTime += dt;
    if (fighter.progressWindowTime >= YIELD_PROGRESS_WINDOW) {
      if (fighter.progressAnchorDistance - newDistance >= YIELD_MIN_TARGET_PROGRESS) fighter.stuckTime = 0;
      else fighter.stuckTime += fighter.progressWindowTime;
      fighter.progressAnchorDistance = newDistance;
      fighter.progressWindowTime = 0;
    }
    if (fighter.stuckTime >= STUCK_RECOVERY_DELAY) {
      // 只换绕行侧并加大推挤，不瞬移
      fighter.avoidSide = fighter.avoidSide === 1 ? -1 : 1;
      fighter.avoidTime = STUCK_RECOVERY_DURATION;
      fighter.stuckTime = STUCK_PUSH_FORCE_DELAY;
      fighter.progressAnchorDistance = newDistance;
      fighter.progressWindowTime = 0;
    }
    return true;
  }

  private updateManquEscape(
    fighter: Fighter,
    targets: Fighter[],
    dt: number,
    movementIntents: Map<string, MovementIntent>,
  ) {
    if (!targets.length) return;
    const travel =
      fighter.moveSpeed *
      (fighter.slowTime > 0 ? fighter.slowMultiplier : 1) *
      dt;
    if (travel < 0.001) return;

    const lockedLength = Math.hypot(fighter.manquEscapeX, fighter.manquEscapeY);
    const lockedPoint = lockedLength > 0.5
      ? this.clampFighterPosition(fighter, {
          x: fighter.x + (fighter.manquEscapeX / lockedLength) * travel,
          y: fighter.y + (fighter.manquEscapeY / lockedLength) * travel,
        })
      : null;
    const lockedTravel = lockedPoint
      ? Math.hypot(lockedPoint.x - fighter.x, lockedPoint.y - fighter.y)
      : 0;

    // 本次变身固定一个使全体敌人加权总距离变大的方向；只有顶住边界时才重选。
    if (!lockedPoint || lockedTravel < travel * 0.4) {
      const currentDistances = targets.map((target) =>
        Math.hypot(fighter.x - target.x, fighter.y - target.y));
      const candidates = Array.from({ length: MANQU_ESCAPE_DIRECTIONS }, (_, index) => {
        const baseAngle = fighter.team === "player" ? Math.PI : 0;
        const angle = baseAngle + (index * Math.PI * 2) / MANQU_ESCAPE_DIRECTIONS;
        const directionX = Math.cos(angle);
        const directionY = Math.sin(angle);
        const point = this.clampFighterPosition(fighter, {
          x: fighter.x + directionX * MANQU_ESCAPE_LOOKAHEAD,
          y: fighter.y + directionY * MANQU_ESCAPE_LOOKAHEAD,
        });
        const moved = Math.hypot(point.x - fighter.x, point.y - fighter.y);
        const distances = targets.map((target) =>
          Math.hypot(point.x - target.x, point.y - target.y));
        const minimumDistance = Math.min(...distances);
        const weightedTotal = distances.reduce(
          (sum, distance, targetIndex) =>
            sum + distance * Math.min(2.5, 180 / Math.max(72, currentDistances[targetIndex])),
          0,
        );
        return {
          directionX,
          directionY,
          score:
            minimumDistance * 4 +
            weightedTotal -
            (MANQU_ESCAPE_LOOKAHEAD - moved) * 12,
          moved,
        };
      }).sort((left, right) => right.score - left.score || right.moved - left.moved);
      const best = candidates[0];
      if (!best || best.moved < 0.001) return;
      fighter.manquEscapeX = best.directionX;
      fighter.manquEscapeY = best.directionY;
    }

    const directionLength = Math.hypot(fighter.manquEscapeX, fighter.manquEscapeY) || 1;
    const motionX = fighter.manquEscapeX / directionLength;
    const motionY = fighter.manquEscapeY / directionLength;
    const previousX = fighter.x;
    const previousY = fighter.y;
    const next = this.clampFighterPosition(fighter, {
      x: fighter.x + motionX * travel,
      y: fighter.y + motionY * travel,
    });
    fighter.x = next.x;
    fighter.y = next.y;
    this.applyForcedMovementPressure(
      fighter,
      previousX,
      previousY,
      fighter.x,
      fighter.y,
      [...(this.state.battle?.player || []), ...(this.state.battle?.enemy || [])],
    );
    movementIntents.set(fighter.fid, { x: motionX, y: motionY, forced: true });
    this.faceTowardX(fighter, fighter.x + motionX);
  }

  private prepareAssassinJump(fighter: Fighter, battle: BattleState) {
    const targetTeam: Team = fighter.team === "player" ? "enemy" : "player";
    const livingTargets = (targetTeam === "player" ? battle.player : battle.enemy)
      .filter((enemy) => enemy.alive);
    if (!livingTargets.length) return false;
    const deepestX = fighter.team === "player"
      ? Math.max(...livingTargets.map((target) => target.x))
      : Math.min(...livingTargets.map((target) => target.x));
    const backlineTargets = livingTargets.filter(
      (target) => Math.abs(target.x - deepestX) <= ASSASSIN_BACKLINE_DEPTH_TOLERANCE,
    );
    const target = [...backlineTargets].sort((a, b) =>
      a.hp / a.maxHp - b.hp / b.maxHp ||
      a.hp - b.hp ||
      a.fid.localeCompare(b.fid),
    )[0];
    if (!target) return false;

    const occupied = [...battle.player, ...battle.enemy]
      .filter((other) => other.alive && other !== fighter);
    const behindDirection = target.team === "enemy" ? 1 : -1;
    const baseDistance = target.radius + fighter.radius + 12;
    const candidates = [
      { x: target.x + behindDirection * baseDistance, y: target.y },
      { x: target.x + behindDirection * baseDistance, y: target.y - 62 },
      { x: target.x + behindDirection * baseDistance, y: target.y + 62 },
      { x: target.x, y: target.y - baseDistance },
      { x: target.x, y: target.y + baseDistance },
    ];
    const landing = this.findOpenPlacement(fighter, candidates[0], occupied, PLACEMENT_MARGIN, candidates.slice(1));

    fighter.jumpFromX = fighter.x;
    fighter.jumpFromY = fighter.y;
    fighter.jumpToX = landing.x;
    fighter.jumpToY = landing.y;
    this.faceTowardX(fighter, target.x);
    fighter.jumpPending = false;
    fighter.vanguardJumpAdvancing = false;
    fighter.jumpArcHeight = DEFAULT_JUMP_ARC_HEIGHT;
    fighter.jumpTime = fighter.jumpDuration;
    fighter.targetFid = target.fid;
    fighter.targetLock = fighter.jumpDuration + TARGET_LOCK_DURATION;
    return true;
  }

  private prepareVanguardJump(fighter: Fighter, source: Fighter, battle: BattleState) {
    if (!fighter.vanguardMember || fighter.vanguardKnockback <= 0 || fighter.abilityMotion || fighter.jumpTime > 0) return false;
    const deltaX = fighter.x - source.x;
    const deltaY = fighter.y - source.y;
    const distance = Math.hypot(deltaX, deltaY) || 1;
    const awayX = deltaX / distance;
    const awayY = deltaY / distance;
    const jumpDistance = fighter.vanguardKnockback;
    const attackDistance = Math.max(
      fighter.range,
      fighter.radius + source.radius + CONTACT_ATTACK_BUFFER,
    );
    const occupied = [...battle.player, ...battle.enemy]
      .filter((other) => other.alive && other !== fighter);
    const clamp = (point: { x: number; y: number }) => this.clampFighterPosition(fighter, point);
    const isOpen = (point: { x: number; y: number }) => occupied.every((other) =>
      Math.hypot(point.x - other.x, point.y - other.y) >= fighter.radius + other.radius + PLACEMENT_MARGIN,
    );
    const staysInAttackDistance = (point: { x: number; y: number }) =>
      Math.hypot(point.x - source.x, point.y - source.y) <= attackDistance + CONTACT_SKIN;
    const backward = clamp({
      x: fighter.x + awayX * jumpDistance,
      y: fighter.y + awayY * jumpDistance,
    });

    // Rotate around the attacker for the fallback. This makes a side jump preserve
    // roughly the current distance instead of repeatedly pushing a melee unit away.
    const sideAngle = Math.min(Math.PI * 0.42, jumpDistance / Math.max(distance, 1));
    const sideCandidates = [-1, 1].map((direction) => {
      const cos = Math.cos(sideAngle * direction);
      const sin = Math.sin(sideAngle * direction);
      return clamp({
        x: source.x + (deltaX * cos - deltaY * sin),
        y: source.y + (deltaX * sin + deltaY * cos),
      });
    });
    const candidates = staysInAttackDistance(backward)
      ? [backward, ...sideCandidates]
      : sideCandidates;
    const landing = candidates.find((candidate) => isOpen(candidate) && (
      staysInAttackDistance(candidate) || !staysInAttackDistance(backward)
    ));
    if (!landing) return false;

    fighter.jumpFromX = fighter.x;
    fighter.jumpFromY = fighter.y;
    fighter.jumpToX = landing.x;
    fighter.jumpToY = landing.y;
    fighter.jumpDuration = VANGUARD_JUMP_DURATION;
    fighter.jumpArcHeight = fighter.vanguardJumpArc;
    fighter.jumpTime = fighter.jumpDuration;
    fighter.vanguardJumpAdvancing = true;
    fighter.vanguardJumpCooldown = VANGUARD_JUMP_COOLDOWN;
    this.faceTowardX(fighter, source.x);
    this.addEffect({
      kind: "text",
      x: fighter.jumpFromX,
      y: fighter.jumpFromY - 36,
      color: TRAITS.vanguard.color,
      text: "躲开",
      life: 0.42,
      size: 10,
    });
    return true;
  }

  /** 怕死后跳仍保持原移速接近目标，前进位移会平移整条跳跃轨迹。 */
  private advanceDuringVanguardJump(
    fighter: Fighter,
    battle: BattleState,
    dt: number,
    movementIntents: Map<string, MovementIntent>,
  ) {
    const targets = this.living(fighter.team === "player" ? "enemy" : "player");
    const target = this.resolveCombatTarget(fighter, targets, dt);
    if (!target) return;
    const beforeX = fighter.x;
    const beforeY = fighter.y;
    if (Math.hypot(target.x - fighter.x, target.y - fighter.y) > this.combatAttackRange(fighter, target)) {
      this.moveTowardCombatTarget(fighter, target, [...battle.player, ...battle.enemy], dt, movementIntents);
    }
    const moveX = fighter.x - beforeX;
    const moveY = fighter.y - beforeY;
    if (Math.hypot(moveX, moveY) < 0.001) return;
    fighter.jumpFromX += moveX;
    fighter.jumpFromY += moveY;
    fighter.jumpToX += moveX;
    fighter.jumpToY += moveY;
  }

  private resolveFighterSeparation(fighters: Fighter[], movementIntents: Map<string, MovementIntent> = new Map()) {
    for (let pass = 0; pass < SEPARATION_PASSES; pass += 1) {
      let resolvedOverlap = false;
      for (let leftIndex = 0; leftIndex < fighters.length; leftIndex += 1) {
        const left = fighters[leftIndex];
        if (!left.alive || left.abilityMotion || left.jumpTime > 0) continue;
        for (let rightIndex = leftIndex + 1; rightIndex < fighters.length; rightIndex += 1) {
          const right = fighters[rightIndex];
          if (!right.alive || right.abilityMotion || right.jumpTime > 0) continue;
          let dx = right.x - left.x;
          let dy = right.y - left.y;
          let distance = Math.hypot(dx, dy);
          const minimum = left.radius + right.radius + CONTACT_SKIN;
          if (distance >= minimum) continue;
          resolvedOverlap = true;
          if (distance < 0.01) {
            dx = left.fid < right.fid ? 1 : -1;
            dy = 0;
            distance = 1;
          }
          const unitX = dx / distance;
          const unitY = dy / distance;
          const leftIntent = movementIntents.get(left.fid);
          const rightIntent = movementIntents.get(right.fid);
          const leftForced = leftIntent?.forced === true;
          const rightForced = rightIntent?.forced === true;
          const forcedPair = leftForced !== rightForced;
          const correction = forcedPair
            ? Math.min(minimum - distance, MAX_FORCED_SEPARATION_PER_TICK)
            : Math.min((minimum - distance) / 2, MAX_SEPARATION_PER_TICK);
          const leftForward = leftIntent && (leftIntent.x * unitX + leftIntent.y * unitY) > 0.2;
          const rightForward = rightIntent && (rightIntent.x * -unitX + rightIntent.y * -unitY) > 0.2;
          const leftScale = forcedPair
            ? leftForced ? 0 : 1
            : leftForward && !rightForward ? 0.15 : 1;
          const rightScale = forcedPair
            ? rightForced ? 0 : 1
            : rightForward && !leftForward ? 0.15 : 1;
          const leftPoint = this.clampFighterPosition(left, { x: left.x - unitX * correction * leftScale, y: left.y - unitY * correction * leftScale });
          const rightPoint = this.clampFighterPosition(right, { x: right.x + unitX * correction * rightScale, y: right.y + unitY * correction * rightScale });
          left.x = leftPoint.x;
          left.y = leftPoint.y;
          right.x = rightPoint.x;
          right.y = rightPoint.y;
        }
      }
      if (!resolvedOverlap) break;
    }
  }

  public update(deltaSeconds: number) {
    const dt = Math.min(Math.max(deltaSeconds, 0), 0.05);
    this.state.visualTime += dt;
    if (this.state.toast) {
      this.state.toast.time -= dt;
      if (this.state.toast.time <= 0) this.state.toast = null;
    }
    if (this.state.phase === "battle") {
      const battle = this.state.battle;
      this.updateBattle(dt);
      if (battle && this.telemetryEnabled) this.observeTargetChanges(battle);
    }
  }

  private living(team: Team) {
    const battle = this.state.battle;
    if (!battle) return [];
    const fighters = team === "player" ? battle.player : battle.enemy;
    const living: Fighter[] = [];
    for (const fighter of fighters) {
      if (fighter.alive && fighter.hp > 0) living.push(fighter);
    }
    return living;
  }

  private nearestTarget(source: Fighter, targets: Fighter[]) {
    const battle = this.state.battle;
    let best: Fighter | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const target of targets) {
      const frozenInChronosphere = Boolean(
        battle && this.isFrozenByChronosphere(target, battle),
      );
      if (
        !frozenInChronosphere &&
        (target.abilityMotion || target.jumpPending || target.jumpTime > 0)
      ) continue;
      if (!best) {
        best = target;
        bestDistance = Math.hypot(target.x - source.x, target.y - source.y);
        continue;
      }
      const targetStealthed = target.stealthTime > 0;
      const bestStealthed = best.stealthTime > 0;
      if (targetStealthed !== bestStealthed) {
        if (!targetStealthed) {
          best = target;
          bestDistance = Math.hypot(target.x - source.x, target.y - source.y);
        }
        continue;
      }
      const distance = Math.hypot(target.x - source.x, target.y - source.y);
      if (distance < bestDistance) {
        best = target;
        bestDistance = distance;
      }
    }
    return best;
  }

  private densestTarget(units: Fighter[], radius: number): Fighter | null {
    let best: Fighter | null = null;
    let bestNearby = -1;
    let bestSpread = Number.POSITIVE_INFINITY;
    for (const candidate of units) {
      const nearby = units.filter(
        (other) => Math.hypot(candidate.x - other.x, candidate.y - other.y) <= radius,
      );
      const spread = nearby.reduce(
        (sum, other) => sum + Math.hypot(candidate.x - other.x, candidate.y - other.y),
        0,
      );
      if (
        nearby.length > bestNearby ||
        (nearby.length === bestNearby && spread < bestSpread) ||
        (
          nearby.length === bestNearby &&
          spread === bestSpread &&
          (!best || candidate.fid.localeCompare(best.fid) < 0)
        )
      ) {
        best = candidate;
        bestNearby = nearby.length;
        bestSpread = spread;
      }
    }
    return best;
  }

  private addEffect(effect: Omit<BattleEffect, "maxLife">) {
    if (!this.visualEffectsEnabled) return;
    this.state.battle?.effects.push({ ...effect, maxLife: effect.life });
  }

  private deliverRemoteAoe(source: Fighter, center: { x: number; y: number }) {
    this.projectiles.deliverRemoteAoe(source, center);
  }

  private fireFixedProjectile(
    source: Fighter,
    target: Fighter,
    shot: ProjectileVolleyShot,
  ) {
    this.projectiles.fireFixedProjectile(source, target, shot);
  }

  private summonClockGunnerRabbits(source: Fighter) {
    this.projectiles.summonClockGunnerRabbits(source);
  }

  private updateMechanicalRabbitPets(battle: BattleState, dt: number) {
    this.projectiles.updateMechanicalRabbitPets(battle, dt);
  }

  private updateProjectileVolley(battle: BattleState, dt: number) {
    this.projectiles.updateProjectileVolley(battle, dt);
  }

  private updateProjectiles(battle: BattleState, dt: number) {
    this.projectiles.updateProjectiles(battle, dt);
  }

  private updateNoriApplePie(source: Fighter, dt: number) {
    if (source.applePieShotsRemaining <= 0) return false;

    source.applePieShotTimer = Math.max(0, source.applePieShotTimer - dt);
    if (source.applePieShotTimer > 0) return true;

    const targetTeam: Team = source.team === "player" ? "enemy" : "player";
    const target = this.nearestTarget(source, this.living(targetTeam));
    if (!target) {
      source.applePieShotsRemaining = 0;
      source.applePieShotTimer = 0;
      return false;
    }

    const finalShot = source.applePieShotsRemaining === 1;
    const def = UNIT_DEFS[source.unitId];
    this.fireFixedProjectile(source, target, {
      sourceFid: source.fid,
      targetFid: target.fid,
      delay: 0,
      damage: source.attack * NORI_APPLE_PIE_DAMAGE_MULTIPLIER,
      damageKind: "ability",
      burnPower: 0,
      speed: NORI_PROJECTILE_SPEED,
      color: def.accent,
      size: finalShot ? 5 : 3,
    });
    source.applePieShotsRemaining -= 1;
    source.applePieShotTimer = NORI_APPLE_PIE_INTERVAL;
    return true;
  }

  private battleTraitLevel(
    battle: BattleState,
    team: Team,
    trait: TraitId,
  ) {
    const key = `${team}:${trait}`;
    let cache = this.battleTraitLevelCache.get(battle);
    if (!cache) {
      cache = new Map<string, number>();
      this.battleTraitLevelCache.set(battle, cache);
    }
    const cached = cache.get(key);
    if (cached !== undefined) return cached;
    const counts = this.traitCountsForUnitIds(
      battle[team].map((fighter) => fighter.unitId),
    );
    const level = traitLevelForCount(TRAITS[trait], counts[trait]);
    cache.set(key, level);
    return level;
  }

  private refreshDynamicCombatModifiers(battle: BattleState) {
    const healthRatio = (team: Team) => this.living(team).reduce((sum, fighter) => sum + fighter.hp / fighter.maxHp, 0);
    const syncStateFor = (team: Team) => {
      const source = this.living(team).find((fighter) => fighter.syncAvMember);
      if (!source) return { direction: 0 as const, source: null, strength: 0 };
      const opposingTeam: Team = team === "player" ? "enemy" : "player";
      const advantage = healthRatio(team) - healthRatio(opposingTeam);
      const strength = Math.min(1, Math.abs(advantage) / 0.5);
      const direction: -1 | 0 | 1 = advantage > 0.0001 ? 1 : advantage < -0.0001 ? -1 : 0;
      return { direction, source, strength };
    };
    const syncStates = {
      player: syncStateFor("player"),
      enemy: syncStateFor("enemy"),
    };
    (["player", "enemy"] as const).forEach((team) => {
      const gen27Level = this.battleTraitLevel(battle, team, "gen27");
      const gen27Multiplier = [1, 1.12, 1.2, 1.3][gen27Level];
      const syncState = syncStates[team];
      battle[team].forEach((fighter) => {
        if (!fighter.alive) return;
        const matureSteps = Math.min(6, Math.floor(battle.elapsed / 4));
        const matureMoveMultiplier = fighter.matureMember
          ? Math.max(fighter.matureMoveFloor, 1 - matureSteps * 0.05)
          : 1;
        const matureAttackSpeed = fighter.matureMember
          ? Math.max(0, fighter.matureAttackSpeed - matureSteps * 0.01)
          : 0;
        const hasNearbyPartner = fighter.gen27Member && battle[team].some(
          (other) => other !== fighter && other.alive && other.gen27Member &&
            Math.hypot(other.x - fighter.x, other.y - fighter.y) <= 165,
        );
        const nearbyMultiplier = hasNearbyPartner ? gen27Multiplier : 1;
        fighter.gen27Buffed = hasNearbyPartner;
        let syncAttackSpeedMultiplier = 1;
        let syncRangeMultiplier = 1;
        if (fighter.syncAvMember) {
          const personalMultiplier = syncState.direction > 0
            ? 1 - syncState.strength * XUEHUI_ADVANTAGE_PENALTY
            : 1 + syncState.strength * XUEHUI_DISADVANTAGE_BONUS;
          syncAttackSpeedMultiplier = personalMultiplier;
          syncRangeMultiplier = personalMultiplier;
          fighter.syncAvStrength = syncState.strength;
          if (fighter.syncAvDirection !== syncState.direction) {
            fighter.syncAvDirection = syncState.direction;
            const text = syncState.direction > 0
              ? "骄兵必败"
              : syncState.direction < 0
                ? "哀兵必胜 · 全队振奋"
                : "同步持平";
            const color = syncState.direction > 0 ? "#ff9a5c" : syncState.direction < 0 ? "#79dcff" : UNIT_DEFS[fighter.unitId].accent;
            this.addEffect({ kind: "text", x: fighter.x, y: fighter.y - 42, color, text, life: 0.7, size: 11 });
            if (syncState.direction < 0 && syncState.source?.fid === fighter.fid) {
              this.living(team)
                .filter((ally) => ally !== fighter)
                .forEach((ally) => {
                  this.addEffect({ kind: "ring", x: ally.x, y: ally.y, color, life: 0.42, size: ally.radius * 2.2 });
                });
            }
          }
        } else if (syncState.direction < 0) {
          syncAttackSpeedMultiplier += syncState.strength * XUEHUI_TEAM_ATTACK_SPEED_BONUS;
          fighter.syncAvDirection = -1;
          fighter.syncAvStrength = syncState.strength;
        } else {
          fighter.syncAvDirection = 0;
          fighter.syncAvStrength = 0;
        }
        this.refreshFighterAttack(fighter);
        const abilityAttackSpeed = fighter.barrageActive || fighter.abilityAttackSpeedTime > 0
          ? fighter.abilityAttackSpeed
          : 0;
        const abilityMoveSpeed = fighter.barrageActive || fighter.abilityMoveSpeedTime > 0
          ? fighter.abilityMoveSpeed
          : 0;
        const manquMoveSpeed = fighter.manquTime > 0
          ? abilityStatForStar(
            UNIT_DEFS.sun_guard,
            fighter.star,
            "moveSpeedBonus",
            SUN_GUARD_MANQU_MOVE_SPEED_BONUS,
          )
          : 0;
        fighter.attackInterval = (fighter.baseAttackInterval * (1 + fighter.matureAttackSpeed)) /
          (nearbyMultiplier * (1 + matureAttackSpeed) * (1 + abilityAttackSpeed) *
            (1 + fighter.towerHackAttackSpeed) * syncAttackSpeedMultiplier);
        fighter.moveSpeed = (fighter.baseMoveSpeed + abilityMoveSpeed + manquMoveSpeed + fighter.towerHackMoveSpeed) *
          matureMoveMultiplier * nearbyMultiplier;
        fighter.range = fighter.baseRange * syncRangeMultiplier;
        if (fighter.barrageActive && fighter.unitId === "cinder_ram") fighter.range = CINDER_RAM_SONG_RANGE;
        fighter.matureAttackSpeedCurrent = matureAttackSpeed;
      });
    });
  }

  private updateLovelyChannels(battle: BattleState, dt: number) {
    [...battle.player, ...battle.enemy].forEach((source) => {
      if (!source.alive || source.channelTime <= 0 || !source.channelTargetFid) return;
      const target = [...battle.player, ...battle.enemy].find(
        (fighter) => fighter.fid === source.channelTargetFid && fighter.alive,
      );
      if (!target) {
        source.channelTime = 0;
        source.channelTargetFid = null;
        source.channelPulseTimer = 0;
        return;
      }
      source.channelTime = Math.max(0, source.channelTime - dt);
      // 维持目标硬控到其本帧行动判定结束，两个单位都不会移动或普攻。
      target.stun = Math.max(target.stun, dt + 0.05);
      const dealt = this.damage(source, target, source.attack * LOVELY_CHANNEL_DAMAGE_PER_SECOND * dt, false, "ability");
      if (dealt > 0) this.heal(source, source, dealt * LOVELY_CHANNEL_LIFESTEAL, false);
      source.channelPulseTimer -= dt;
      if (source.channelPulseTimer <= 0) {
        source.channelPulseTimer += LOVELY_CHANNEL_PULSE_INTERVAL;
        this.addEffect({ kind: "line", x: source.x, y: source.y, x2: target.x, y2: target.y, color: UNIT_DEFS.lovely.accent, life: 0.28, size: 4 });
      }
      if (!target.alive || source.channelTime <= 0) {
        source.channelTime = 0;
        source.channelTargetFid = null;
        source.channelPulseTimer = 0;
        this.addEffect({ kind: "text", x: source.x, y: source.y - 40, color: UNIT_DEFS.lovely.accent, text: "松开", life: 0.45, size: 10 });
      }
    });
  }

  private updateHealingZones(battle: BattleState, dt: number) {
    battle.healingZones = battle.healingZones.filter((zone) => {
      const activeTime = Math.min(dt, zone.life);
      zone.life = Math.max(0, zone.life - dt);
      zone.pulseTimer -= activeTime;
      while (zone.pulseTimer <= 0) {
        zone.pulseTimer += PAKO_ANGEL_FISH_PULSE_INTERVAL;
        const source = [...battle.player, ...battle.enemy].find(
          (fighter) => fighter.fid === zone.sourceFid,
        ) || null;
        this.living(zone.team)
          .filter((ally) => Math.hypot(ally.x - zone.x, ally.y - zone.y) <= zone.radius)
          .forEach((ally) => {
            if (!source) return;
            this.heal(
              source,
              ally,
              source.attack * PAKO_ANGEL_FISH_PULSE_HEAL_ATTACK_RATIO +
                source.maxHp * PAKO_ANGEL_FISH_PULSE_HEAL_CASTER_HP_RATIO,
            );
        });
        this.addEffect({
          kind: "healing_pulse",
          x: zone.x,
          y: zone.y,
          color: zone.color,
          life: 0.42,
          size: 60,
        });
      }
      return zone.life > 0;
    });
  }

  private updateBattle(dt: number) {
    const battle = this.state.battle;
    if (!battle) return;
    const fighters = battle.player.concat(battle.enemy);
    this.chronosphereEnergyLocks.clear();
    battle.elapsed += dt;
    battle.yueGangTimer = Math.max(0, battle.yueGangTimer - dt);
    battle.matureTimer -= dt;
    if (battle.matureTimer <= 0) {
      battle.matureTimer += 4;
      fighters.filter((fighter) => fighter.alive && fighter.hp > 0 && fighter.matureMember).forEach((fighter) =>
        this.addEffect({ kind: "text", x: fighter.x, y: fighter.y - 42, color: "#b9a274", text: "慢一点", life: 0.65, size: 10 }),
      );
    }
    this.refreshDynamicCombatModifiers(battle);
    battle.bannerTimer = Math.max(0, battle.bannerTimer - dt);

    if (this.visualEffectsEnabled) {
      battle.effects.forEach((effect) => {
        effect.life -= dt;
      });
      battle.effects = battle.effects.filter((effect) => effect.life > 0);
    }
    battle.chronospheres.forEach((zone) => {
      const source = [...battle.player, ...battle.enemy].find(
        (fighter) => fighter.fid === zone.sourceFid,
      );
      if (!source?.alive) {
        if (source) source.energy = 0;
        zone.life = 0;
        return;
      }
      const drainPerSecond = source.maxEnergy / Math.max(zone.maxLife, 0.001);
      source.energy = Math.max(0, source.energy - drainPerSecond * dt);
      zone.life = Math.min(
        zone.life - dt,
        (source.energy / Math.max(source.maxEnergy, 0.001)) * zone.maxLife,
      );
      if (zone.life <= 1e-6 || source.energy <= 1e-6) {
        source.energy = 0;
        zone.life = 0;
        this.chronosphereEnergyLocks.add(source.fid);
      }
    });
    battle.chronospheres = battle.chronospheres.filter((zone) => zone.life > 0);
    this.updateHealingZones(battle, dt);
    this.updateMechanicalRabbitPets(battle, dt);
    this.updateProjectileVolley(battle, dt);
    this.updateProjectiles(battle, dt);
    this.updateLovelyChannels(battle, dt);

    const emberLevels = {
      player: this.battleTraitLevel(battle, "player", "ember"),
      enemy: this.battleTraitLevel(battle, "enemy", "ember"),
    };
    if (emberLevels.player || emberLevels.enemy) {
      battle.emberTimer -= dt;
      if (battle.emberTimer <= 0) {
        battle.emberTimer += 3;
        (["player", "enemy"] as const).forEach((team) => {
          const level = emberLevels[team];
          const rangedCapRatio = [0, 0, 0.12, 0.25][level];
          this.living(team).forEach((fighter) => {
            if (fighter.emberMember && fighter.emberAttackStacks < fighter.emberAttackStackCap) {
              fighter.emberAttackStacks += 1;
              this.refreshFighterAttack(fighter);
              this.addEffect({ kind: "text", x: fighter.x, y: fighter.y - 42, color: "#ff7657", text: `夜 ${fighter.emberAttackStacks}/5`, life: 0.65, size: 10 });
            } else if (!fighter.emberMember && fighter.attackType === "ranged" && rangedCapRatio > 0 && fighter.emberAttackStacks < 5) {
              fighter.emberAttackStacks += 1;
              fighter.emberAttackPerStack = rangedCapRatio / 5;
              this.refreshFighterAttack(fighter);
            }
          });
        });
      }
    }

    const gluttonyLevels = {
      player: this.battleTraitLevel(battle, "player", "gluttony"),
      enemy: this.battleTraitLevel(battle, "enemy", "gluttony"),
    };
    if (gluttonyLevels.player || gluttonyLevels.enemy) {
      battle.gluttonyTimer -= dt;
      if (battle.gluttonyTimer <= 0) {
        battle.gluttonyTimer += 3;
        (["player", "enemy"] as const).forEach((team) => {
          const level = gluttonyLevels[team];
          const allHealRatio = level >= 2 ? 0.01 : 0;
          this.living(team).forEach((fighter) => {
            const holderHealRatio = fighter.gluttonyHolder ? (level >= 2 ? 0.035 : 0.025) : allHealRatio;
            if (holderHealRatio > 0) this.heal(null, fighter, fighter.maxHp * holderHealRatio);
            this.addGluttonyStack(fighter, "饱");
          });
        });
      }
    }

    const triageStacks = this.augmentStacks("triage");
    if (triageStacks) {
      battle.fieldMedicTimer -= dt;
      if (battle.fieldMedicTimer <= 0) {
        battle.fieldMedicTimer += 2.5;
        this.living("player").forEach((fighter) =>
          this.heal(null, fighter, fighter.maxHp * 0.05 * triageStacks),
        );
      }
    }

    const movementIntents = new Map<string, MovementIntent>();
    const danceLevels = {
      player: this.battleTraitLevel(battle, "player", "dance"),
      enemy: this.battleTraitLevel(battle, "enemy", "dance"),
    };
    fighters.forEach((fighter) => {
      if (!fighter.alive) return;
      const wasSekiCharging = fighter.sekiChargeActive;
      fighter.cooldown -= dt;
      fighter.stun = Math.max(0, fighter.stun - dt);
      fighter.tauntTime = Math.max(0, fighter.tauntTime - dt);
      if (fighter.tauntTime <= 0) fighter.tauntedByFid = null;
      fighter.abilityShieldTime = Math.max(0, fighter.abilityShieldTime - dt);
      if (fighter.abilityShieldTime <= 0 && fighter.abilityShield > 0) {
        fighter.abilityShield = 0;
        fighter.abilityShieldPeak = 0;
      }
      fighter.abilityAttackSpeedTime = Math.max(0, fighter.abilityAttackSpeedTime - dt);
      fighter.abilityMoveSpeedTime = Math.max(0, fighter.abilityMoveSpeedTime - dt);
      fighter.vanguardJumpCooldown = Math.max(0, fighter.vanguardJumpCooldown - dt);
      fighter.gluttonyKillCooldown = Math.max(0, fighter.gluttonyKillCooldown - dt);
      fighter.rebirthRecoilTime = Math.max(0, fighter.rebirthRecoilTime - dt);
      const switchWasActive = fighter.raccoonSwitchTime > 0;
      fighter.raccoonSwitchTime = Math.max(0, fighter.raccoonSwitchTime - dt);
      if (switchWasActive && fighter.raccoonSwitchTime <= 0) {
        fighter.raccoonStunnedAttackers = [];
      }
      const manquActiveTime = Math.min(dt, fighter.manquTime);
      fighter.manquTime = Math.max(0, fighter.manquTime - dt);
      const wasStealthed = fighter.stealthTime > 0;
      if (fighter.unitId === "sumi" && fighter.sumiDragonReady && wasStealthed) {
        const drainPerSecond = fighter.maxEnergy / SUMI_STEALTH_DURATION;
        fighter.energy = Math.max(0, fighter.energy - drainPerSecond * dt);
        fighter.stealthTime = drainPerSecond > 0
          ? Math.min(fighter.stealthTime, fighter.energy / drainPerSecond)
          : 0;
        if (fighter.energy <= 0) this.releaseSumiStealth(fighter, battle);
      } else {
        fighter.stealthTime = Math.max(0, fighter.stealthTime - dt);
        if (wasStealthed && fighter.stealthTime === 0 && fighter.sumiDragonReady) {
          this.releaseSumiStealth(fighter, battle);
        }
      }
      fighter.abilityAttackBonusTime = Math.max(0, fighter.abilityAttackBonusTime - dt);
      fighter.abilityLifestealTime = Math.max(0, fighter.abilityLifestealTime - dt);
      fighter.danceDashCooldown = Math.max(0, fighter.danceDashCooldown - dt);
      fighter.danceDashTime = Math.max(0, fighter.danceDashTime - dt);
      fighter.slowTime = Math.max(0, fighter.slowTime - dt);
      if (fighter.slowTime <= 0) fighter.slowMultiplier = 1;
      if (fighter.sekiChargeActive) {
        fighter.energy = Math.max(
          0,
          fighter.energy - (fighter.maxEnergy / SEKI_CHARGE_DURATION) * dt,
        );
        if (fighter.energy <= 0) {
          fighter.sekiChargeActive = false;
          fighter.sekiChargeDirectionX = 0;
          fighter.sekiChargeDirectionY = 0;
          fighter.sekiChargeHitFids = [];
          fighter.sekiChargeHitCount = 0;
          this.addEffect({
            kind: "text",
            x: fighter.x,
            y: fighter.y - 42,
            color: UNIT_DEFS.seki_boar_king.accent,
            text: "冲锋结束",
            life: 0.55,
            size: 11,
          });
        }
      }
      // 攻击弹幕：能量缓慢清空，期间不回能
      if (fighter.barrageActive) {
        fighter.energy = Math.max(0, fighter.energy - fighter.barrageDrainPerSecond * dt);
        if (fighter.unitId === "grove_mender") {
          const targetTeam: Team = fighter.team === "player" ? "enemy" : "player";
          this.living(targetTeam)
            .filter(
              (enemy) =>
                Math.hypot(enemy.x - fighter.x, enemy.y - fighter.y) <=
                NANA_PICKAXE_TAUNT_RADIUS + enemy.radius,
            )
            .forEach((enemy) => {
              enemy.tauntedByFid = fighter.fid;
              enemy.tauntTime = Math.max(enemy.tauntTime, NANA_PICKAXE_TAUNT_REFRESH);
            });
        }
        if (fighter.unitId === "cinder_ram") {
          fighter.cinderSongPulseTimer -= dt;
          if (fighter.cinderSongPulseTimer <= 0) {
            fighter.cinderSongPulseTimer += CINDER_RAM_SONG_HEAL_INTERVAL;
            this.targetsWithinAbilityRange(fighter, this.living(fighter.team))
              .forEach((ally) => this.heal(fighter, ally, ally.maxHp * CINDER_RAM_SONG_HEAL_RATIO));
          }
        }
        if (fighter.energy <= 0) {
          fighter.energy = 0;
          fighter.barrageActive = false;
          fighter.barrageDrainPerSecond = 0;
          fighter.abilityAttackBonus = 0;
          fighter.abilityAttackBonusTime = 0;
          fighter.abilityLifesteal = 0;
          fighter.abilityLifestealTime = 0;
          fighter.abilityAttackSpeed = 0;
          fighter.abilityAttackSpeedTime = 0;
          fighter.abilityMoveSpeed = 0;
          fighter.abilityMoveSpeedTime = 0;
          if (fighter.abilityArmorBonus > 0) {
            fighter.armor -= fighter.abilityArmorBonus;
            fighter.abilityArmorBonus = 0;
          }
          fighter.cinderSongPulseTimer = 0;
          this.addEffect({
            kind: "text",
            x: fighter.x,
            y: fighter.y - 42,
            color: UNIT_DEFS[fighter.unitId].accent,
            text: fighter.unitId === "cinder_ram"
              ? "歌声停下"
              : fighter.unitId === "grove_mender"
                ? "凿击结束"
                : "弹幕结束",
            life: 0.55,
            size: 11,
          });
        }
      }
      const wasWeakened = fighter.weakenTime > 0;
      fighter.weakenTime = Math.max(0, fighter.weakenTime - dt);
      if (wasWeakened && fighter.weakenTime === 0 && fighter.weakenArmorPenalty > 0) {
        fighter.armor += fighter.weakenArmorPenalty;
        fighter.weakenArmorPenalty = 0;
      }
      fighter.attackPulse = Math.max(0, fighter.attackPulse - dt);
      fighter.hitPulse = Math.max(0, fighter.hitPulse - dt);
      if (fighter.channelTime > 0) return;
      if (this.updateAbilityMotion(fighter, dt, battle)) return;
      if (fighter.jumpPending) {
        if (this.isInsideChronosphere(fighter, battle)) return;
        fighter.jumpDelay = Math.max(0, fighter.jumpDelay - dt);
        if (!battle.engagedTeams[fighter.team] && fighter.jumpDelay > 0) return;
        if (this.prepareAssassinJump(fighter, battle)) return;
        fighter.jumpPending = false;
      }
      if (fighter.jumpTime > 0) {
        // 时停球也会冻结跳跃过程
        if (this.isInsideChronosphere(fighter, battle)) return;
        fighter.jumpTime = Math.max(0, fighter.jumpTime - dt);
        // 跳跃过程中真实位移，影子与碰撞位置随地面轨迹前进
        const progress = fighter.jumpDuration > 0
          ? 1 - fighter.jumpTime / fighter.jumpDuration
          : 1;
        const ease = 0.5 - Math.cos(Math.min(1, Math.max(0, progress)) * Math.PI) / 2;
        fighter.x = fighter.jumpFromX + (fighter.jumpToX - fighter.jumpFromX) * ease;
        fighter.y = fighter.jumpFromY + (fighter.jumpToY - fighter.jumpFromY) * ease;
        if (fighter.jumpTime <= 0) {
          fighter.x = fighter.jumpToX;
          fighter.y = fighter.jumpToY;
          fighter.vanguardJumpAdvancing = false;
          this.addEffect({
            kind: "burst",
            x: fighter.x,
            y: fighter.y,
            color: UNIT_DEFS[fighter.unitId].accent,
            life: 0.45,
            size: fighter.radius * 1.8,
          });
        }
        if (fighter.vanguardJumpAdvancing && fighter.jumpTime > 0) {
          this.advanceDuringVanguardJump(fighter, battle, dt, movementIntents);
        }
        return;
      }
      if (fighter.burnTime > 0) {
        fighter.burnTime -= dt;
        const burnAmount = fighter.burnDps * dt;
        const { remaining: burnAfterShields, absorbed } = this.absorbDamageWithShields(
          fighter,
          burnAmount,
          fighter.burnDamageKind,
        );
        const burnDamage = Math.min(fighter.hp, burnAfterShields);
        fighter.hp -= burnDamage;
        const source = [...battle.player, ...battle.enemy].find(
          (candidate) => candidate.fid === fighter.burnSourceFid,
        );
        if (source) {
          source.damageDealt += absorbed + burnDamage;
          fighter.damageTaken += absorbed + burnDamage;
        }
        if (this.rng.next() < dt * 3) {
          this.addEffect({
            kind: "text",
            x: fighter.x,
            y: fighter.y - 30,
            color: "#ff8a5c",
            text: "灼烧",
            life: 0.45,
            size: 12,
          });
        }
        if (fighter.hp <= 0) this.killFighter(fighter, source || undefined);
      }
      // 时停球内敌我单位都不能行动（灼烧等 DoT 仍结算）
      if (this.isInsideChronosphere(fighter, battle)) {
        if (this.rng.next() < dt * 2.2) {
          this.addEffect({
            kind: "text",
            x: fighter.x + (this.rng.next() - 0.5) * 18,
            y: fighter.y - 24,
            color: "#c9a0ff",
            text: "时停",
            life: 0.35,
            size: 10,
          });
        }
        return;
      }
      if (wasSekiCharging) {
        if (fighter.alive && fighter.stun <= 0 && fighter.sekiChargeActive) {
          this.updateSekiBoarCharge(fighter, dt, battle, movementIntents);
        }
        return;
      }
      if (!fighter.alive) return;
      if (manquActiveTime > 0) {
        const healPerSecond = abilityStatForStar(
          UNIT_DEFS.sun_guard,
          fighter.star,
          "healPerSecond",
          SUN_GUARD_MANQU_HEAL_PER_SECOND,
        );
        this.heal(fighter, fighter, fighter.maxHp * healPerSecond * manquActiveTime, false);
      }
      if (fighter.stun > 0) return;
      if (manquActiveTime > 0) {
        const targetTeam: Team = fighter.team === "player" ? "enemy" : "player";
        this.updateManquEscape(
          fighter,
          this.living(targetTeam),
          manquActiveTime,
          movementIntents,
        );
        return;
      }
      if (!fighter.barrageActive && fighter.energyPerSecond > 0 && !(fighter.unitId === "sumi" && wasStealthed)) {
        this.addEnergy(fighter, fighter.energyPerSecond * dt);
      }
      if (this.updateNoriApplePie(fighter, dt)) return;

      if (
        fighter.unitId === "rift_tyrant" &&
        fighter.hp < fighter.maxHp * 0.5 &&
        !fighter.enraged
      ) {
        fighter.enraged = true;
        fighter.attack *= 1.22;
        fighter.attackInterval /= 1.35;
        battle.banner = "暴君狂暴 · 攻速与伤害提升";
        battle.bannerTimer = 1.8;
      }

      const targetTeam: Team = fighter.team === "player" ? "enemy" : "player";
      const targets = this.living(targetTeam);
      if (!targets.length) return;

      const allies = this.living(fighter.team);
      const abilityTargets = this.targetsWithinAbilityRange(fighter, targets);
      const abilityAllies = this.targetsWithinAbilityRange(fighter, allies);
      const abilityTiming = UNIT_DEFS[fighter.unitId].abilityCastTiming;
      const energyReady =
        !fighter.barrageActive &&
        !(fighter.unitId === "gale_archer" && fighter.raccoonSwitchTime > 0) &&
        !this.hasChronosphereInFlightOrActive(fighter, battle) &&
        fighter.energy >= fighter.maxEnergy;

      if (energyReady && fighter.unitId === "zeyin") {
        if (!fighter.reborn) {
          this.killFighter(fighter);
          return;
        }
        if (abilityTargets.length > 0) {
          fighter.stuckTime = 0;
          this.castAbility(fighter, abilityTargets, true);
          return;
        }
      }

      // 不依赖普攻距离的技能：突进 / 远程进攻 / 支援护盾 / 自保受击 / 支援治疗
      if (energyReady) {
        let shouldCast = false;
        switch (abilityTiming) {
          case "engage":
          case "offenseReady":
            shouldCast = fighter.unitId === "rei"
              ? this.reiCorpsesWithinRange(fighter).length >= this.reiReviveCount(fighter)
              : fighter.unitId === "tower_god"
                ? !fighter.towerHackArmed && abilityTargets.length > 0
                : abilityTargets.length > 0;
            break;
          case "supportShield":
          case "selfBuff":
            shouldCast = true;
            break;
          case "selfOnHit":
            // 自保：能量满且刚受击才放
            shouldCast = fighter.hitPulse > 0;
            break;
          case "supportHeal": {
            // 支援治疗：能量满且最虚弱友军生命比例降到阈值
            const healCandidates = fighter.unitId === "cog_scribe"
              ? abilityAllies.filter((ally) => ally.fid !== fighter.fid)
              : [...abilityAllies, fighter];
            const weakestAlly = healCandidates
              .filter((ally, index, candidates) => candidates.indexOf(ally) === index)
              .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
            shouldCast = Boolean(weakestAlly && weakestAlly.hp / weakestAlly.maxHp <= SUPPORT_HEAL_HP_RATIO);
            break;
          }
          case "supportRescue":
            shouldCast = Boolean(this.selectMumuRescueTarget(fighter, abilityAllies, battle));
            break;
          case "offenseInRange":
          case "passive":
            break;
          default: {
            const exhaustive: never = abilityTiming;
            throw new Error(`未处理的技能时机: ${String(exhaustive)}`);
          }
        }
        if (shouldCast) {
          fighter.stuckTime = 0;
          this.castAbility(fighter, abilityTargets, true);
          return;
        }
      }

      const target = this.resolveCombatTarget(fighter, targets, dt);
      if (!target) return;
      const distance = Math.hypot(target.x - fighter.x, target.y - fighter.y);
      const preferredRange = this.combatAttackRange(fighter, target);

      // 近距进攻：能量满且进入普攻距离才放
      if (energyReady && abilityTiming === "offenseInRange" && distance <= preferredRange) {
        fighter.stuckTime = 0;
        this.castAbility(fighter, abilityTargets, true);
        return;
      }

      if (distance > preferredRange) {
        const danceLevel = danceLevels[fighter.team];
        // 跳舞成员：只在一段完整冲刺可进入自身攻击范围的最后接近阶段加速。
        const dashTravel =
          fighter.moveSpeed *
          DANCE_DASH_SPEED_MULT *
          (fighter.slowTime > 0 ? fighter.slowMultiplier : 1) *
          DANCE_DASH_DURATION;
        if (
          fighter.danceMember &&
          fighter.danceDashCooldown <= 0 &&
          fighter.danceDashTime <= 0 &&
          danceLevel > 0 &&
          distance - dashTravel <= preferredRange
        ) {
          fighter.danceDashTime = DANCE_DASH_DURATION;
          fighter.danceDashCooldown = DANCE_DASH_COOLDOWN[danceLevel];
          this.addEffect({
            kind: "text",
            x: fighter.x,
            y: fighter.y - 40,
            color: TRAITS.dance.color,
            text: "冲刺",
            life: 0.4,
            size: 11,
          });
          this.addEffect({
            kind: "line",
            x: fighter.x,
            y: fighter.y,
            x2: target.x,
            y2: target.y,
            color: TRAITS.dance.color,
            life: 0.28,
            size: 4,
          });
        }
        this.moveTowardCombatTarget(fighter, target, fighters, dt, movementIntents);
      } else if (fighter.cooldown <= 0) {
        fighter.stuckTime = 0;
        this.basicAttack(fighter, target);
      }
    });

    this.resolveFighterSeparation(fighters, movementIntents);

    const playersAlive = this.living("player");
    const enemiesAlive = this.living("enemy");
    if (!enemiesAlive.length) this.finishBattle(true);
    else if (!playersAlive.length) this.finishBattle(false);
    else if (battle.elapsed >= battle.limit) {
      const playerRatio = playersAlive.reduce(
        (sum, fighter) => sum + fighter.hp / fighter.maxHp,
        0,
      );
      const enemyRatio = enemiesAlive.reduce(
        (sum, fighter) => sum + fighter.hp / fighter.maxHp,
        0,
      );
      battle.banner = "时限到 · 按剩余战力判定";
      this.finishBattle(playerRatio >= enemyRatio);
    }
  }

  private triggerYueGangSupport(source: Fighter, target: Fighter) {
    const battle = this.state.battle;
    if (!battle) return;
    const level = this.battleTraitLevel(battle, source.team, "yue_gang");
    if (!level || battle.yueGangTimer > 0 || !source.yueGangMember) return;
    const targetTeam: Team = source.team === "player" ? "enemy" : "player";
    const liveTarget = target.alive ? target : this.nearestTarget(source, battle[targetTeam]);
    if (!liveTarget) return;
    const supporters = battle[source.team]
      .filter((fighter) => fighter !== source && fighter.alive && fighter.yueGangMember && !fighter.abilityMotion && fighter.jumpTime <= 0 && !fighter.jumpPending && fighter.stun <= 0)
      .filter((fighter) => Math.hypot(fighter.x - liveTarget.x, fighter.y - liveTarget.y) > fighter.range + liveTarget.radius + 12)
      .sort((left, right) => Math.hypot(left.x - liveTarget.x, left.y - liveTarget.y) - Math.hypot(right.x - liveTarget.x, right.y - liveTarget.y))
      .slice(0, level >= 2 ? 2 : 1);
    if (!supporters.length) return;
    battle.yueGangTimer = level >= 2 ? 3.5 : 5;
    supporters.forEach((fighter, index) => {
      const distance = Math.max(fighter.radius + liveTarget.radius + 14, fighter.range * 0.7) + index * 12;
      fighter.jumpFromX = fighter.x;
      fighter.jumpFromY = fighter.y;
      const landing = this.findOpenPlacement(
        fighter,
        {
          x: liveTarget.x + (source.team === "player" ? -distance : distance),
          y: liveTarget.y + (index ? 52 : -52),
        },
        [...battle.player, ...battle.enemy].filter((other) => other !== fighter),
      );
      fighter.jumpToX = landing.x;
      fighter.jumpToY = landing.y;
      this.faceTowardX(fighter, liveTarget.x);
      fighter.jumpDuration = 0.38;
      fighter.jumpArcHeight = DEFAULT_JUMP_ARC_HEIGHT;
      fighter.jumpTime = fighter.jumpDuration;
    });
  }

  private tryAttackRecoil(
    source: Fighter,
    target: Fighter,
    options: { active: boolean; distance: number; duration: number; rangeMargin: number },
  ) {
    const battle = this.state.battle;
    if (
      !battle ||
      !options.active ||
      !source.alive ||
      source.abilityMotion
    ) return false;

    const deltaX = source.x - target.x;
    const deltaY = source.y - target.y;
    const distance = Math.hypot(deltaX, deltaY);
    if (distance < 0.01) return false;
    const attackRange = this.combatAttackRange(source, target);
    const availableDistance = attackRange - options.rangeMargin - distance;
    const recoilDistance = Math.min(options.distance, availableDistance);
    if (recoilDistance < 4) return false;

    const awayX = deltaX / distance;
    const awayY = deltaY / distance;
    const landing = this.clampFighterPosition(source, {
      x: source.x + awayX * recoilDistance,
      y: source.y + awayY * recoilDistance,
    });
    const landingDistance = Math.hypot(landing.x - target.x, landing.y - target.y);
    const travelX = landing.x - source.x;
    const travelY = landing.y - source.y;
    const travelDistance = Math.hypot(travelX, travelY);
    const awayProgress = travelX * awayX + travelY * awayY;
    if (
      travelDistance < 4 ||
      awayProgress < 3 ||
      landingDistance > attackRange - options.rangeMargin + 0.01
    ) return false;

    source.abilityMotion = {
      kind: "push",
      abilityId: null,
      sourceFid: null,
      targetFid: target.fid,
      forceThrough: true,
      fromX: source.x,
      fromY: source.y,
      toX: landing.x,
      toY: landing.y,
      time: 0,
      duration: options.duration,
      arcHeight: 0,
      hitFids: [],
    };
    this.faceTowardX(source, target.x);
    return true;
  }

  private tryZeyinRebirthRecoil(source: Fighter, target: Fighter) {
    return this.tryAttackRecoil(source, target, {
      active: source.unitId === "zeyin" && source.reborn && source.rebirthRecoilTime > 0,
      distance: ZEYIN_REBIRTH_RECOIL_DISTANCE,
      duration: ZEYIN_REBIRTH_RECOIL_DURATION,
      rangeMargin: ZEYIN_REBIRTH_RECOIL_RANGE_MARGIN,
    });
  }

  private trySumiSocialRecoil(source: Fighter, target: Fighter) {
    return this.tryAttackRecoil(source, target, {
      active: source.unitId === "sumi",
      distance: SUMI_SOCIAL_RECOIL_DISTANCE,
      duration: SUMI_SOCIAL_RECOIL_DURATION,
      rangeMargin: SUMI_SOCIAL_RECOIL_RANGE_MARGIN,
    });
  }

  private releaseSumiStealth(source: Fighter, battle: BattleState) {
    if (!source.sumiDragonReady) return;
    source.stealthTime = 0;
    source.sumiDragonReady = false;
    source.energy = 0;
    source.abilityMoveSpeed = 0;
    source.abilityMoveSpeedTime = 0;
    const targetTeam: Team = source.team === "player" ? "enemy" : "player";
    const opponents = battle[targetTeam].filter((fighter) => fighter.alive && fighter.hp > 0);
    const target = this.nearestTarget(source, opponents) || opponents[0] || null;
    if (!target) {
      this.addEffect({ kind: "text", x: source.x, y: source.y - 42, color: UNIT_DEFS.sumi.accent, text: "现身", life: 0.55, size: 11 });
      return;
    }
    source.targetFid = target.fid;
    this.fireFixedProjectile(source, target, {
      sourceFid: source.fid,
      targetFid: target.fid,
      delay: 0,
      damage: source.attack * SUMI_DRAGON_DAMAGE_MULTIPLIER,
      damageKind: "ability",
      burnPower: 0,
      speed: SUMI_DRAGON_PROJECTILE_SPEED,
      color: UNIT_DEFS.sumi.accent,
      size: SUMI_DRAGON_PROJECTILE_SIZE,
      style: "sumi_dragon",
    });
    this.addEffect({ kind: "text", x: source.x, y: source.y - 46, color: UNIT_DEFS.sumi.accent, text: "破隐一击", life: 0.7, size: 12 });
  }

  private basicAttack(source: Fighter, target: Fighter) {
    if (Math.hypot(target.x - source.x, target.y - source.y) > this.combatAttackRange(source, target)) return;
    this.markFightersEngaged(source, target);
    this.faceTowardX(source, target.x);
    source.cooldown = source.attackInterval;
    if (source.unitId === "nori") {
      this.fireFixedProjectile(source, target, {
        sourceFid: source.fid,
        targetFid: target.fid,
        delay: 0,
        damage: source.attack,
        burnPower: 0,
        speed: NORI_PROJECTILE_SPEED,
        color: UNIT_DEFS.nori.accent,
        size: 3,
      });
      this.addEnergy(source, source.energyOnAttack);
      this.addEnergy(target, target.energyOnHit);
      return;
    }
    if (source.unitId === "cinder_ram" && source.barrageActive) {
      this.fireFixedProjectile(source, target, {
        sourceFid: source.fid,
        targetFid: target.fid,
        delay: 0,
        damage: source.attack * CINDER_RAM_FIREBALL_DAMAGE,
        damageKind: "ability",
        burnPower: source.attack * CINDER_RAM_FIREBALL_BURN,
        speed: CINDER_RAM_FIREBALL_SPEED,
        color: UNIT_DEFS.cinder_ram.accent,
        size: 18,
        style: "fireball",
        emoji: "🔥",
        splashRadius: CINDER_RAM_FIREBALL_SPLASH,
      });
      this.addEnergy(target, target.energyOnHit);
      return;
    }
    source.attackPulse = 0.22;
    source.attackTargetX = target.x;
    source.attackTargetY = target.y;
    const dealt = this.damage(source, target, source.attack);
    const nextAttackLifesteal = source.nextAttackLifesteal;
    if (nextAttackLifesteal > 0) {
      source.nextAttackLifesteal = 0;
      source.abilityAttackBonus = 0;
      source.abilityAttackBonusTime = 0;
      if (dealt > 0) {
        this.heal(source, source, dealt * nextAttackLifesteal);
        this.addEffect({ kind: "text", x: source.x, y: source.y - 44, color: UNIT_DEFS.sui_blue.accent, text: "吃饱", life: 0.55, size: 11 });
      }
    }
    if (dealt >= 0) {
      this.addEnergy(source, source.energyOnAttack);
      this.addEnergy(target, target.energyOnHit);
    }
    if (source.burnOnHitPower > 0 && target.alive) {
      this.applyBurn(source, target, source.attack * source.burnOnHitPower);
    }
    if (source.spiceBurnOnHitPower > 0 && target.alive) {
      this.applyBurn(source, target, source.attack * source.spiceBurnOnHitPower);
    }
    // 雅吨被动：自身灼烧时普攻附带灼烧
    if (source.unitId === "rift_brawler" && source.burnTime > 0 && target.alive) {
      this.applyBurn(source, target, source.attack * RIFT_BRAWLER_PASSIVE_BURN);
    }
    this.triggerYueGangSupport(source, target);
    const def = UNIT_DEFS[source.unitId];
    this.addEffect({
      kind: source.attackType === "ranged" ? "line" : "burst",
      x: source.x,
      y: source.y,
      x2: target.x,
      y2: target.y,
      color: def.accent,
      life: source.attackType === "ranged" ? 0.16 : 0.24,
      size: source.attackType === "ranged" ? 3 : 22,
    });
    this.tryZeyinRebirthRecoil(source, target);
    this.trySumiSocialRecoil(source, target);
    if (dealt > 0) this.addDamageText(target, dealt);
  }

  private castAbility(
    source: Fighter,
    availableTargets: Fighter[],
    enforceRange = false,
  ) {
    const target = availableTargets.find((candidate) => candidate.fid === source.targetFid)
      || availableTargets.find((candidate) => candidate.alive)
      || null;
    const definition = UNIT_DEFS[source.unitId];
    const targetText = target ? `，朝向 ${UNIT_DEFS[target.unitId].name}` : "";
    this.logBattleEvent(
      "ability",
      `${definition.name} 在 (${Math.round(source.x)}, ${Math.round(source.y)}) 释放 ${definition.abilityName}${targetText}`,
      source,
      target,
      { ability: definition.abilityName },
    );
    return this.abilities.castAbility(
      source,
      availableTargets,
      enforceRange,
    );
  }

  private reviveCorpseForRei(source: Fighter, corpse: BattleCorpse) {
    const battle = this.state.battle;
    if (!battle) return null;
    battle.resurrectionSerial += 1;
    const original = corpse.fighter;
    const angle = battle.resurrectionSerial * 2.4;
    const offset = 10 + (battle.resurrectionSerial % 3) * 5;
    const position = this.clampFighterPosition(original, {
      x: corpse.x + Math.cos(angle) * offset,
      y: corpse.y + Math.sin(angle) * offset,
    });
    const revived: Fighter = {
      ...original,
      fid: `${source.team === "player" ? "p" : "e"}-rei-${battle.resurrectionSerial}`,
      team: source.team,
      x: position.x,
      y: position.y,
      hp: original.maxHp * REI_REVIVE_HP_RATIO,
      shield: 0,
      shieldPeak: 0,
      abilityShield: 0,
      abilityShieldPeak: 0,
      abilityShieldTime: 0,
      cooldown: 0.35,
      energy: 0,
      stun: 0,
      tauntedByFid: null,
      tauntTime: 0,
      burnTime: 0,
      burnDps: 0,
      burnSourceFid: null,
      burnDamageKind: "attack",
      barrageActive: false,
      barrageDrainPerSecond: 0,
      suiBirdChargesRemaining: 0,
      sekiChargeActive: false,
      sekiChargeDirectionX: 0,
      sekiChargeDirectionY: 0,
      sekiChargeHitFids: [],
      sekiChargeHitCount: 0,
      cinderSongPulseTimer: 0,
      abilityAttackBonus: 0,
      abilityAttackBonusTime: 0,
      abilityLifesteal: 0,
      abilityLifestealTime: 0,
      nextAttackLifesteal: 0,
      abilityAttackSpeed: 0,
      abilityAttackSpeedTime: 0,
      abilityMoveSpeed: 0,
      abilityMoveSpeedTime: 0,
      manquTime: 0,
      manquEscapeX: 0,
      manquEscapeY: 0,
      raccoonSwitchTime: 0,
      raccoonStunnedAttackers: [],
      armor: original.armor - original.abilityArmorBonus,
      abilityArmorBonus: 0,
      slowTime: 0,
      slowMultiplier: 1,
      weakenTime: 0,
      weakenArmorPenalty: 0,
      attackPulse: 0,
      hitPulse: 0,
      applePieShotsRemaining: 0,
      applePieShotTimer: 0,
      jumpPending: false,
      jumpDelay: 0,
      jumpTime: 0,
      vanguardJumpAdvancing: false,
      abilityMotion: null,
      channelTargetFid: null,
      channelTime: 0,
      channelPulseTimer: 0,
      targetFid: null,
      targetLock: 0,
      progressAnchorDistance: Infinity,
      progressWindowTime: 0,
      stuckTime: 0,
      damageDealt: 0,
      healingDone: 0,
      shieldingDone: 0,
      damageTaken: 0,
      reiRevival: true,
      alive: true,
    };
    this.refreshFighterAttack(revived);
    battle[source.team].push(revived);
    this.addEffect({ kind: "rebirth", x: revived.x, y: revived.y, color: UNIT_DEFS.rei.accent, life: 1, size: revived.radius * 2.7 });
    this.addEffect({ kind: "text", x: revived.x, y: revived.y - 44, color: UNIT_DEFS.rei.accent, text: "👻 残血返场", emoji: true, life: 0.85, size: 12 });
    return revived;
  }

  private resurrectWithRei(source: Fighter) {
    const corpses = this.reiCorpsesWithinRange(source);
    const reviveCount = this.reiReviveCount(source);
    if (corpses.length < reviveCount) return 0;
    const selected = corpses.slice(0, reviveCount);
    selected.forEach((corpse) => { corpse.consumed = true; });
    selected.forEach((corpse) => this.reviveCorpseForRei(source, corpse));
    const battle = this.state.battle;
    if (battle) {
      battle.banner = `幽灵复活 · ${selected.length} 名幽灵加入${source.team === "player" ? "我方" : "敌方"}`;
      battle.bannerTimer = 1.8;
    }
    return selected.length;
  }

  private absorbDamageWithShields(
    target: Fighter,
    amount: number,
    damageKind: DamageKind,
  ) {
    return this.combatResolution.absorbDamageWithShields(
      target,
      amount,
      damageKind,
    );
  }

  private damage(
    source: Fighter,
    target: Fighter,
    rawAmount: number,
    allowInactiveSource = false,
    damageKind: DamageKind = "attack",
    trace?: DamageTrace,
  ) {
    const targetWasAlive = target.alive;
    const targetWasReborn = target.reborn;
    const dealt = this.combatResolution.damage(
      source,
      target,
      rawAmount,
      allowInactiveSource,
      damageKind,
    );
    if (dealt > 0) {
      const amount = Number(dealt.toFixed(2));
      const impact = trace?.impact || { x: Number(target.x.toFixed(1)), y: Number(target.y.toFixed(1)) };
      const damageLabel = damageKind === "ability" ? "技能伤害" : "攻击伤害";
      this.logBattleEvent(
        trace?.projectile ? "projectile" : "damage",
        trace?.projectile
          ? `${UNIT_DEFS[source.unitId].name} 的 ${trace.projectile} 在 (${Math.round(impact.x)}, ${Math.round(impact.y)}) 命中 ${UNIT_DEFS[target.unitId].name}，造成 ${amount} ${damageLabel}`
          : `${UNIT_DEFS[source.unitId].name} 对 ${UNIT_DEFS[target.unitId].name} 造成 ${amount} ${damageLabel}`,
        source,
        target,
        {
          amount,
          damageKind,
          ...(trace?.projectile ? { projectile: trace.projectile } : {}),
          impact,
        },
      );
    }
    if (targetWasAlive && !target.alive) {
      this.logBattleEvent(
        "defeat",
        `${UNIT_DEFS[target.unitId].name} 被击败，击败者为 ${UNIT_DEFS[source.unitId].name}`,
        source,
        target,
      );
    } else if (!targetWasReborn && target.reborn) {
      this.logBattleEvent("ability", `${UNIT_DEFS[target.unitId].name} 触发涅槃重生`, target, target, { ability: "涅槃重生" });
    }
    return dealt;
  }

  private applyBurn(
    source: Fighter,
    target: Fighter,
    totalDamage: number,
    damageKind: DamageKind = "attack",
  ) {
    return this.combatResolution.applyBurn(
      source,
      target,
      totalDamage,
      damageKind,
    );
  }

  private grantShield(
    source: Fighter | null,
    target: Fighter,
    amount: number,
    capRatio = 0.55,
    battle = this.state.battle,
  ) {
    return this.combatResolution.grantShield(
      source,
      target,
      amount,
      capRatio,
      battle,
    );
  }

  private grantAbilityShield(
    source: Fighter | null,
    target: Fighter,
    amount: number,
    duration: number,
    battle = this.state.battle,
  ) {
    return this.combatResolution.grantAbilityShield(
      source,
      target,
      amount,
      duration,
      battle,
    );
  }

  private heal(
    source: Fighter | null,
    target: Fighter,
    amount: number,
    showEffect = true,
  ) {
    return this.combatResolution.heal(source, target, amount, showEffect);
  }

  private addDamageText(target: Fighter, amount: number) {
    this.combatResolution.addDamageText(target, amount);
  }

  private killFighter(target: Fighter, source?: Fighter) {
    const wasReborn = target.reborn;
    const killed = this.combatResolution.killFighter(target, source);
    if (killed) {
      this.logBattleEvent(
        "defeat",
        `${UNIT_DEFS[target.unitId].name} 被击败${source ? `，击败者为 ${UNIT_DEFS[source.unitId].name}` : ""}`,
        source,
        target,
      );
    } else if (!wasReborn && target.reborn) {
      this.logBattleEvent("ability", `${UNIT_DEFS[target.unitId].name} 触发涅槃重生`, target, target, { ability: "涅槃重生" });
    }
    return killed;
  }

  public renderTextState() {
    return renderTextState({
      state: this.state,
      currentWave: this.currentWave,
      potentialBounty: this.potentialBounty,
      interestIncome: this.interestIncome,
      upgradeCost: this.upgradeCost,
      isMaxPlayerLevel: this.isMaxPlayerLevel,
      boardCount: this.boardCount,
      boardCap: this.boardCap,
      getActiveTraits: () => this.getActiveTraits(),
      augmentStacks: (id) => this.augmentStacks(id),
      summarizeBattleFighter: (fighter, value) =>
        this.summarizeBattleFighter(fighter, value),
      getBattleRanking: (team) => this.getBattleRanking(team),
    });
  }
}
