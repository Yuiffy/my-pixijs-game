import {
  BATTLE_BOUNDS,
  pointDistanceFromForwardRay,
  rayEndpointAtBattleBounds,
} from "../../battleGeometry";
import {
  UNIT_DEFS,
  abilityStatForStar,
  type UnitId,
} from "../../gameData";
import type {
  AbilityMotion,
  BattleCorpse,
  BattleEffect,
  BattleState,
  Fighter,
  GameState,
  ProjectileVolleyShot,
  Team,
} from "../../gameTypes";
import {
  MUMU_WHIP_ARC_HEIGHT,
  mumuWhipControlPoint,
} from "../../motionPaths";
import type { RandomSource } from "../random";
import type { DamageKind } from "../combatResolution";

const ALIEN_BEAM_HALF_WIDTH = 80;
export const BISCUIT_RESCUE_LANDING_RADIUS = 112;
export const CHRONOSPHERE_RADIUS = 128;
const CINDER_RAM_SONG_DURATION = 5.5;
export const CINDER_RAM_SONG_RANGE = 235;
const COG_ORANGE_HEAL_MULTIPLIERS = [1, 0.82, 0.66, 0.54, 0.44] as const;
const COG_ORANGE_INTERVAL = 0.2;
const EMBER_BLADE_CARROT_DAMAGE = 0.58;
const EMBER_BLADE_CARROT_INTERVAL = 0.11;
const EMBER_BLADE_CARROT_JITTER = 0.42;
const EMBER_BLADE_CARROT_SHOTS = 5;
const EMBER_BLADE_CARROT_SPEED = 640;
const GALE_ARCHER_SWITCH_DURATION = 4;
const GALE_ARCHER_SWITCH_SHIELD_RATIO = 0.18;
const GALE_ARCHER_SWITCH_COLOR = "#b86cff";
const MITSURI_FEAR_RADIUS = 118;
const MUMU_RESCUE_DURATION = 0.62;
const NIGHTIN_CIGARETTE_BURN = 0.55;
const NIGHTIN_CIGARETTE_COUNT = 3;
const NIGHTIN_CIGARETTE_DAMAGE = 0.9;
const NIGHTIN_CIGARETTE_INTERVAL = 0.16;
const NIGHTIN_CIGARETTE_SPEED = 260;
const NORI_APPLE_PIE_SHOTS = 8;
export const REMOTE_AOE_PROJECTILE_SPEED = 620;
const RIFT_BRAWLER_AOE_BURN = 1.05;
const RIFT_BRAWLER_HOTPOT_RADIUS = 98;
const RIFT_BRAWLER_SELF_BURN = 0.85;
const RIFT_STALKER_LAUGH_SPEED = 1200;
const MOSSBACK_BISCUIT_HEAL_RATIO = 0.12;
const MOSSBACK_BISCUIT_SHIELD_RATIO = 0.15;
export const SHIORI_OTTER_RADIUS = 122;
const SUI_BARRAGE_ATTACK_BONUS = 0.15;
const SUI_BARRAGE_ATTACK_SPEED = 0.75;
const SUI_BARRAGE_DURATION = 4;
const SUI_BARRAGE_MOVE_SPEED = 28;
export const SUI_BIRD_ELBOW_CHARGES = 3;
const SUI_BLUE_FEAST_ATTACK_BONUS = 1.25;
const SUI_BLUE_FEAST_DURATION = 4;
const SUI_BLUE_FEAST_LIFESTEAL = 0.45;
export const SUMI_STEALTH_DURATION = 4.2;
const SUMI_STEALTH_MOVE_SPEED = 30;
const SUN_GUARD_MANQU_DURATION = 1.25;
const TIANDOU_LOLLIPOP_COUNT = 5;
const TIANDOU_LOLLIPOP_DAMAGE_MULTIPLIER = 0.9;
const TIANDOU_LOLLIPOP_LANDING_DISTANCES = [72, 90, 108, 90, 72];
const TIANDOU_LOLLIPOP_RADIUS = 11;
const TIANDOU_LOLLIPOP_SPREAD = Math.PI * 0.62;
const TIANDOU_LOLLIPOP_THROW_SPEED = 360;
const XUEHUI_CLEAVE_BURN_MULTIPLIER = 0.68;
const XUEHUI_CLEAVE_DAMAGE_MULTIPLIER = 1.12;
const XUEHUI_CLEAVE_RADIUS = 98;
const ZEYIN_FIREBALL_SPEED = 420;
const HAREI_PINE_RADIUS = 82;
const HAREI_PINE_DURATION = 5.2;
const HAREI_PINE_SLOW_MULTIPLIER = 0.82;
const HAREI_BADGE_DAMAGE_MULTIPLIER = 1.1;
const HAREI_BADGE_KNOCKBACK = 48;
const HAREI_BADGE_SPEED = 470;

interface AbilityHost {
  state: () => GameState;
  rng: () => RandomSource;
  addDamageText: (target: Fighter, amount: number) => void;
  addEffect: (effect: Omit<BattleEffect, "maxLife">) => void;
  applyBurn: (
    source: Fighter,
    target: Fighter,
    totalDamage: number,
    damageKind?: DamageKind,
  ) => void;
  damage: (
    source: Fighter,
    target: Fighter,
    rawAmount: number,
    allowInactiveSource?: boolean,
    damageKind?: DamageKind,
  ) => number;
  deliverRemoteAoe: (
    source: Fighter,
    center: { x: number; y: number },
  ) => void;
  densestTarget: (units: Fighter[], radius: number) => Fighter | null;
  faceTowardX: (fighter: Fighter, targetX: number) => void;
  fireFixedProjectile: (
    source: Fighter,
    target: Fighter,
    shot: ProjectileVolleyShot,
  ) => void;
  fireRuticeSyringes: (
    source: Fighter,
    targets: Fighter[],
    effectRatio: number,
  ) => void;
  grantAbilityShield: (
    source: Fighter | null,
    target: Fighter,
    amount: number,
    duration: number,
    battle?: BattleState | null,
  ) => number;
  grantShield: (
    source: Fighter | null,
    target: Fighter,
    amount: number,
    capRatio?: number,
    battle?: BattleState | null,
  ) => number;
  heal: (
    source: Fighter | null,
    target: Fighter,
    amount: number,
    showEffect?: boolean,
  ) => number;
  living: (team: Team) => Fighter[];
  markTeamEngaged: (team: Team) => void;
  mumuRescueDestination: (
    source: Fighter,
    target: Fighter,
    battle: BattleState,
  ) => { x: number; y: number };
  nearestTarget: (source: Fighter, targets: Fighter[]) => Fighter | null;
  reiCorpsesWithinRange: (source: Fighter) => BattleCorpse[];
  reiReviveCount: (source: Fighter) => number;
  relocateFighter: (
    source: Fighter,
    preferred: { x: number; y: number },
  ) => void;
  resurrectWithRei: (source: Fighter) => number;
  selectMumuRescueTarget: (
    source: Fighter,
    candidates: Fighter[],
    battle: BattleState,
  ) => Fighter | null;
  startAbilityMotion: (
    source: Fighter,
    kind: AbilityMotion["kind"],
    preferred: { x: number; y: number },
    options?: {
      abilityId?: UnitId | null;
      sourceFid?: string | null;
      targetFid?: string | null;
      duration?: number;
      arcHeight?: number;
      controlX?: number;
      controlY?: number;
      avoidOccupied?: boolean;
    },
  ) => AbilityMotion | null;
  startSuiBirdElbowDash: (source: Fighter, targets: Fighter[]) => boolean;
  summonClockGunnerRabbits: (source: Fighter) => void;
  targetsWithinAbilityRange: (
    source: Fighter,
    targets: Fighter[],
  ) => Fighter[];
}

export class AbilitySystem {
  constructor(private readonly host: AbilityHost) {}

  private get state() {
    return this.host.state();
  }

  public castAbility(source: Fighter, availableTargets: Fighter[], enforceRange = false) {
    const def = UNIT_DEFS[source.unitId];
    const targets = enforceRange
      ? this.host.targetsWithinAbilityRange(source, availableTargets)
      : availableTargets.filter((target) => target.alive);
    if (
      source.unitId === "rei" &&
      this.host.reiCorpsesWithinRange(source).length < this.host.reiReviveCount(source)
    ) return;
    source.energy = Math.min(source.maxEnergy, source.castRefund);
    source.cooldown = Math.max(source.cooldown, 0.35);
    if (
      def.abilityCastTiming === "engage" ||
      def.abilityCastTiming === "offenseReady" ||
      def.abilityCastTiming === "offenseInRange"
    ) {
      this.host.markTeamEngaged(source.team);
    }
    const allies = enforceRange && def.abilityRange > 0
      ? this.host.targetsWithinAbilityRange(source, this.host.living(source.team))
      : this.host.living(source.team);
    const weakest = (units: Fighter[]) => [...units].sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
    const farthest = (units: Fighter[]) => [...units].sort(
        (a, b) => Math.hypot(b.x - source.x, b.y - source.y) -
          Math.hypot(a.x - source.x, a.y - source.y),
      )[0];
    const densest = (units: Fighter[]) => this.host.densestTarget(units, 125);
    const deal = (target: Fighter, multiplier: number, bonus = 0) => {
      const dealt = this.host.damage(
        source,
        target,
        source.attack * multiplier + bonus,
        false,
        "ability",
      );
      if (dealt > 0) this.host.addDamageText(target, dealt);
      return dealt;
    };
    const addShield = (target: Fighter, amount: number, capRatio = 0.55) => this.host.grantShield(source, target, amount, capRatio);

    switch (source.unitId) {
      case "sumi": {
        source.energy = source.maxEnergy;
        source.stealthTime = SUMI_STEALTH_DURATION;
        source.sumiDragonReady = true;
        source.abilityMoveSpeed = SUMI_STEALTH_MOVE_SPEED;
        source.abilityMoveSpeedTime = SUMI_STEALTH_DURATION + 0.05;
        source.targetFid = null;
        source.targetLock = 0;
        const opponents = source.team === "player" ? this.state.battle?.enemy : this.state.battle?.player;
        opponents?.forEach((opponent) => {
          if (opponent.targetFid === source.fid) {
            opponent.targetFid = null;
            opponent.targetLock = 0;
          }
        });
        this.host.addEffect({ kind: "ring", x: source.x, y: source.y, color: def.accent, life: 0.72, size: source.radius * 2.5 });
        this.host.addEffect({ kind: "text", x: source.x, y: source.y - 44, color: def.accent, text: "空气龙 · 隐身", life: 0.78, size: 12 });
        break;
      }
      case "zeyin": {
        const target = this.host.nearestTarget(source, targets);
        if (!source.reborn || !target) {
          source.energy = source.maxEnergy;
          return;
        }
        this.host.faceTowardX(source, target.x);
        this.host.fireFixedProjectile(source, target, {
          sourceFid: source.fid,
          targetFid: target.fid,
          delay: 0,
          damage: source.attack * abilityStatForStar(def, source.star, "damageMultiplier", 1.6),
          damageKind: "ability",
          burnPower: source.attack * abilityStatForStar(def, source.star, "burnMultiplier", 0.8),
          speed: ZEYIN_FIREBALL_SPEED,
          color: "#ff795e",
          size: 18,
          style: "fireball",
          emoji: "🔥",
        });
        this.host.addEffect({
          kind: "text",
          x: source.x,
          y: source.y - 46,
          color: "#ff9d7a",
          text: "涅槃火球",
          life: 0.7,
          size: 12,
        });
        break;
      }
      case "sui": {
        // 攻击弹幕：能量保持满并缓慢清空，期间加攻速/攻击/移速且不回能
        source.energy = source.maxEnergy;
        source.barrageActive = true;
        source.barrageDrainPerSecond = source.maxEnergy / SUI_BARRAGE_DURATION;
        source.abilityAttackBonus = SUI_BARRAGE_ATTACK_BONUS;
        source.abilityAttackBonusTime = SUI_BARRAGE_DURATION + 0.05;
        source.abilityAttackSpeed = SUI_BARRAGE_ATTACK_SPEED;
        source.abilityAttackSpeedTime = SUI_BARRAGE_DURATION + 0.05;
        source.abilityMoveSpeed = SUI_BARRAGE_MOVE_SPEED;
        source.abilityMoveSpeedTime = SUI_BARRAGE_DURATION + 0.05;
        this.host.addEffect({
          kind: "text",
          x: source.x,
          y: source.y - 46,
          color: def.accent,
          text: "攻击弹幕",
          life: 0.7,
          size: 12,
        });
        break;
      }
      case "sun_guard": {
        source.manquTime = abilityStatForStar(
          def,
          source.star,
          "duration",
          SUN_GUARD_MANQU_DURATION,
        );
        source.manquEscapeX = 0;
        source.manquEscapeY = 0;
        source.targetFid = null;
        source.targetLock = 0;
        this.host.addEffect({
          kind: "burst",
          x: source.x,
          y: source.y,
          color: def.accent,
          life: 0.5,
          size: 54,
        });
        break;
      }
      case "ember_blade": {
        const target = this.host.nearestTarget(source, targets);
        if (!target) break;
        for (let shot = 0; shot < EMBER_BLADE_CARROT_SHOTS; shot += 1) {
          this.state.battle?.projectileVolley.push({
            sourceFid: source.fid,
            targetFid: target.fid,
            delay: shot * EMBER_BLADE_CARROT_INTERVAL,
            damage: source.attack * EMBER_BLADE_CARROT_DAMAGE,
            damageKind: "ability",
            burnPower: 0,
            speed: EMBER_BLADE_CARROT_SPEED,
            color: def.accent,
            size: 14,
            angleOffset: (this.host.rng().next() - 0.5) * 2 * EMBER_BLADE_CARROT_JITTER,
            style: "carrot",
            emoji: "🥕",
          });
        }
        break;
      }
      case "gale_archer": {
        addShield(source, source.maxHp * GALE_ARCHER_SWITCH_SHIELD_RATIO, 0.45);
        source.raccoonSwitchTime = GALE_ARCHER_SWITCH_DURATION;
        source.raccoonStunnedAttackers = [];
        this.host.addEffect({
          kind: "switch_on",
          x: source.x,
          y: source.y,
          color: GALE_ARCHER_SWITCH_COLOR,
          life: 1,
          size: 42,
          text: "ON",
        });
        break;
      }
      case "rift_stalker": {
        const target = farthest(targets);
        if (!target) break;
        this.host.fireFixedProjectile(source, target, {
          sourceFid: source.fid,
          targetFid: target.fid,
          delay: 0,
          damage: source.attack * abilityStatForStar(def, source.star, "damageMultiplier", 2.7),
          damageKind: "ability",
          burnPower: 0,
          speed: RIFT_STALKER_LAUGH_SPEED,
          color: def.accent,
          size: 24,
          style: "laugh",
          emoji: "😂",
          stunDuration: abilityStatForStar(def, source.star, "stunDuration", 0.85),
        });
        this.host.addEffect({ kind: "text", x: source.x, y: source.y - 42, color: def.accent, text: "冷笑话", life: 0.48, size: 11 });
        break;
      }
      case "cog_scribe": {
        COG_ORANGE_HEAL_MULTIPLIERS.forEach((multiplier, index) => {
          this.state.battle?.projectileVolley.push({
            sourceFid: source.fid,
            targetFid: source.fid,
            delay: index * COG_ORANGE_INTERVAL,
            damage: 0,
            burnPower: 0,
            speed: REMOTE_AOE_PROJECTILE_SPEED,
            color: def.accent,
            size: 10,
            style: "aoe_orb",
            emoji: "🍊",
            supportHealMultiplier: multiplier,
          });
        });
        this.host.addEffect({ kind: "burst", x: source.x, y: source.y, color: def.accent, life: 0.3, size: 30 });
        break;
      }
      case "mossback": {
        [...allies]
          .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)
          .slice(0, 2)
          .forEach((target) => {
            const hasShield = target.shield > 0;
            if (hasShield) {
              this.host.heal(
                source,
                target,
                target.maxHp * MOSSBACK_BISCUIT_HEAL_RATIO,
              );
            } else {
              addShield(
                target,
                target.maxHp * MOSSBACK_BISCUIT_SHIELD_RATIO,
                0.4,
              );
            }
            this.host.addEffect({
              kind: "biscuit_share",
              x: source.x,
              y: source.y,
              x2: target.x,
              y2: target.y,
              color: def.accent,
              text: hasShield ? "choco" : "soda",
              life: 0.72,
              size: 18,
            });
          });
        break;
      }
      case "sui_blue": {
        source.abilityAttackBonus = SUI_BLUE_FEAST_ATTACK_BONUS;
        source.abilityAttackBonusTime = SUI_BLUE_FEAST_DURATION;
        source.nextAttackLifesteal = SUI_BLUE_FEAST_LIFESTEAL;
        break;
      }
      case "shiori": {
        const target = farthest(targets);
        if (!target) break;
        this.host.startAbilityMotion(
          source,
          "dash",
          { x: target.x + (source.team === "player" ? -42 : 42), y: target.y },
          { targetFid: target.fid },
        );
        this.host.addEffect({ kind: "ring", x: target.x, y: target.y, color: def.accent, life: 0.85, size: SHIORI_OTTER_RADIUS + 16 });
        break;
      }
      case "rift_brawler": {
        // 主动：打翻火锅，灼烧自己与周围小范围敌人
        this.host.applyBurn(source, source, source.attack * RIFT_BRAWLER_SELF_BURN, "ability");
        targets
          .filter(
            (target) => Math.hypot(target.x - source.x, target.y - source.y) <= RIFT_BRAWLER_HOTPOT_RADIUS,
          )
          .forEach((target) => {
            this.host.applyBurn(source, target, source.attack * RIFT_BRAWLER_AOE_BURN, "ability");
            const dealt = this.host.damage(source, target, source.attack * 0.45, false, "ability");
            if (dealt > 0) this.host.addDamageText(target, dealt);
          });
        this.host.addEffect({
          kind: "hotpot",
          x: source.x,
          y: source.y,
          color: "#ff4d3a",
          life: 1.05,
          size: RIFT_BRAWLER_HOTPOT_RADIUS + 28,
        });
        this.host.addEffect({
          kind: "ring",
          x: source.x,
          y: source.y,
          color: "#ff6b2d",
          life: 0.85,
          size: RIFT_BRAWLER_HOTPOT_RADIUS + 18,
        });
        this.host.addEffect({
          kind: "burst",
          x: source.x,
          y: source.y,
          color: "#ff8a3d",
          life: 0.7,
          size: 88,
        });
        this.host.addEffect({
          kind: "text",
          x: source.x,
          y: source.y - 22,
          color: "#ffd0a8",
          text: "辣福",
          life: 0.75,
          size: 14,
        });
        for (let spark = 0; spark < 5; spark += 1) {
          const angle = (Math.PI * 2 * spark) / 5 + this.host.rng().next() * 0.35;
          this.host.addEffect({
            kind: "burst",
            x: source.x + Math.cos(angle) * 36,
            y: source.y + Math.sin(angle) * 36,
            color: spark % 2 === 0 ? "#ff5a2e" : "#ffb347",
            life: 0.5 + spark * 0.04,
            size: 24,
          });
        }
        break;
      }
      case "spark_mage": {
        const radius = abilityStatForStar(def, source.star, "radius", CHRONOSPHERE_RADIUS);
        const center = this.host.densestTarget(targets, radius);
        if (!center) break;
        source.energy = source.maxEnergy;
        this.host.deliverRemoteAoe(source, center);
        break;
      }
      case "clock_gunner": {
        this.host.summonClockGunnerRabbits(source);
        break;
      }
      case "dawn_duelist": {
        const target = this.host.nearestTarget(source, targets);
        if (!target) break;
        const castsPine = this.host.rng().next() < 0.5;
        if (castsPine) {
          const deltaX = target.x - source.x;
          const deltaY = target.y - source.y;
          const distance = Math.hypot(deltaX, deltaY) || 1;
          const plantDistance = Math.min(110, distance * 0.55);
          const center = {
            x: source.x + (deltaX / distance) * plantDistance,
            y: source.y + (deltaY / distance) * plantDistance,
          };
          this.state.battle?.controlZones.push({
            kind: "slow",
            sourceFid: source.fid,
            team: source.team,
            x: center.x,
            y: center.y,
            radius: HAREI_PINE_RADIUS,
            life: HAREI_PINE_DURATION,
            maxLife: HAREI_PINE_DURATION,
            color: "#58c878",
            slowMultiplier: HAREI_PINE_SLOW_MULTIPLIER,
          });
          this.host.addEffect({
            kind: "harei_pine",
            x: center.x,
            y: center.y,
            x2: target.x,
            color: "#58c878",
            text: "欢迎光临",
            life: HAREI_PINE_DURATION,
            size: HAREI_PINE_RADIUS,
          });
        } else {
          this.host.fireFixedProjectile(source, target, {
            sourceFid: source.fid,
            targetFid: target.fid,
            delay: 0,
            damage: source.attack * HAREI_BADGE_DAMAGE_MULTIPLIER,
            damageKind: "ability",
            burnPower: 0,
            speed: HAREI_BADGE_SPEED,
            color: "#ff8fb8",
            size: 24,
            style: "badge",
            emoji: "🔘",
            knockbackDistance: HAREI_BADGE_KNOCKBACK,
          });
          this.host.addEffect({ kind: "text", x: source.x, y: source.y - 42, color: "#ffb5d0", text: "75mm 大吧唧", life: 0.62, size: 11 });
        }
        break;
      }
      case "grove_mender": {
        const target = farthest(targets);
        if (!target) break;
        this.host.startAbilityMotion(
          source,
          "dash",
          {
            x: target.x + (source.team === "player" ? -source.radius - target.radius - 8 : source.radius + target.radius + 8),
            y: target.y,
          },
          { targetFid: target.fid },
        );
        this.host.addEffect({ kind: "text", x: target.x, y: target.y - 44, color: def.accent, text: "凿凿冲击", life: 0.75, size: 12 });
        break;
      }
      case "cinder_ram": {
        source.energy = source.maxEnergy;
        source.barrageActive = true;
        source.barrageDrainPerSecond = source.maxEnergy / CINDER_RAM_SONG_DURATION;
        source.cinderSongPulseTimer = 0;
        source.range = CINDER_RAM_SONG_RANGE;
        this.host.addEffect({ kind: "text", x: source.x, y: source.y - 44, color: def.accent, text: "终场歌唱", life: 0.75, size: 12 });
        break;
      }
      case "sui_bird": {
        source.suiBirdChargesRemaining = SUI_BIRD_ELBOW_CHARGES;
        this.host.startSuiBirdElbowDash(source, targets);
        break;
      }
      case "sui_flower": {
        const center = densest(targets);
        if (!center) break;
        this.host.deliverRemoteAoe(source, center);
        break;
      }
      case "yua": {
        const target = this.host.nearestTarget(source, targets);
        if (!target) break;
        const beamEndpoint = rayEndpointAtBattleBounds(source, target);
        targets
          .filter(
            (candidate) => pointDistanceFromForwardRay(source, target, candidate) < ALIEN_BEAM_HALF_WIDTH,
          )
          .forEach((candidate) => {
            const dealt = this.host.damage(source, candidate, source.attack * 1.35, false, "ability");
            this.host.addDamageText(candidate, dealt);
          });
        this.host.addEffect({
          kind: "line",
          x: source.x,
          y: source.y,
          x2: beamEndpoint.x,
          y2: beamEndpoint.y,
          color: def.accent,
          life: 0.48,
          size: 8,
        });
        break;
      }
      case "seki_boar_king": {
        const center = densest(targets);
        if (!center) break;
        const deltaX = center.x - source.x;
        const deltaY = center.y - source.y;
        const distance = Math.hypot(deltaX, deltaY) || 1;
        source.energy = source.maxEnergy;
        source.sekiChargeActive = true;
        source.sekiChargeDirectionX = deltaX / distance;
        source.sekiChargeDirectionY = deltaY / distance;
        source.sekiChargeHitFids = [];
        source.sekiChargeHitCount = 0;
        source.attackPulse = 0;
        this.host.faceTowardX(source, center.x);
        this.host.addEffect({ kind: "ring", x: source.x, y: source.y, color: def.accent, life: 0.7, size: source.radius * 2.4 });
        break;
      }
      case "mitsuri": {
        const center = this.host.densestTarget(targets, MITSURI_FEAR_RADIUS);
        if (!center) break;
        this.host.deliverRemoteAoe(source, center);
        break;
      }
      case "guangyi": {
        const target = farthest(targets);
        if (!target) break;
        const startX = source.x;
        const startY = source.y;
        const motion = this.host.startAbilityMotion(
          source,
          "dash",
          { x: target.x + (source.team === "player" ? -46 : 46), y: target.y },
          { targetFid: target.fid, avoidOccupied: false },
        );
        addShield(source, source.maxHp * 0.2, 0.45);
        if (motion) {
          this.host.addEffect({ kind: "line", x: startX, y: startY, x2: motion.toX, y2: motion.toY, color: def.accent, life: motion.duration, size: 8 });
        }
        break;
      }
      case "sui_cat": {
        const target = farthest(targets);
        if (!target) break;
        const startX = source.x;
        const startY = source.y;
        // 身后：继续深入敌方半场；推进方向则把敌人往己方半场推
        const behindSign = source.team === "player" ? 1 : -1;
        const pushDir = -behindSign;
        const pushDistance = 112;
        const contactGap = source.radius + target.radius + 6;

        // 闪现出发特效
        this.host.addEffect({ kind: "burst", x: startX, y: startY, color: def.accent, life: 0.32, size: 42 });
        this.host.addEffect({ kind: "text", x: startX, y: startY - 36, color: def.accent, text: "闪", life: 0.38, size: 12 });

        this.host.relocateFighter(source, { x: target.x + behindSign * contactGap, y: target.y });
        this.host.faceTowardX(source, target.x);

        // 闪现落点特效
        this.host.addEffect({ kind: "burst", x: source.x, y: source.y, color: def.accent, life: 0.42, size: 56 });
        this.host.addEffect({
          kind: "line",
          x: startX,
          y: startY,
          x2: source.x,
          y2: source.y,
          color: def.accent,
          life: 0.36,
          size: 5,
        });

        const targetMotion = this.host.startAbilityMotion(target, "push", {
          x: target.x + pushDir * pushDistance,
          y: target.y,
        }, { abilityId: null, duration: 0.34, avoidOccupied: false });
        const sourceMotion = this.host.startAbilityMotion(source, "push", {
          x: (targetMotion?.toX ?? target.x) + behindSign * contactGap,
          y: targetMotion?.toY ?? target.y,
        }, { targetFid: target.fid, duration: 0.34, avoidOccupied: false });
        this.host.faceTowardX(source, target.x);

        if (targetMotion && sourceMotion) {
          this.host.addEffect({
            kind: "line",
            x: targetMotion.fromX,
            y: targetMotion.fromY,
            x2: targetMotion.toX,
            y2: targetMotion.toY,
            color: def.accent,
            life: sourceMotion.duration,
            size: 10,
          });
        }
        break;
      }
      case "nagisa": {
        allies.forEach((target) => {
          addShield(target, target.maxHp * 0.1, 0.42);
          if (target.fid !== source.fid) {
            this.host.addEffect({
              kind: "neural_link",
              x: source.x,
              y: source.y,
              x2: target.x,
              y2: target.y,
              color: def.accent,
              life: 0.92,
              size: 4,
            });
          }
          this.host.addEffect({
            kind: "mind_control",
            x: target.x,
            y: target.y,
            color: def.accent,
            text: target.fid === source.fid ? "🧠" : "同步",
            emoji: target.fid === source.fid,
            life: 0.92,
            size: target.fid === source.fid ? 165 : target.radius + 22,
          });
        });
        targets
          .filter((target) => Math.hypot(target.x - source.x, target.y - source.y) < 150)
          .forEach((target) => {
            deal(target, 0.8);
            target.stun = Math.max(target.stun, 0.85);
            this.host.addEffect({
              kind: "mind_control",
              x: target.x,
              y: target.y,
              color: "#d6a4ff",
              text: "失控",
              life: 0.92,
              size: target.radius + 28,
            });
          });
        break;
      }
      case "tower_god": {
        source.towerHackArmed = true;
        if (this.state.battle) {
          this.state.battle.banner = "塔神已开挂 · 死亡后转移给最近队友";
          this.state.battle.bannerTimer = 1.8;
        }
        this.host.addEffect({ kind: "ring", x: source.x, y: source.y, color: def.accent, life: 0.9, size: source.radius + 28 });
        this.host.addEffect({ kind: "burst", x: source.x, y: source.y, color: "#fff1bd", life: 0.55, size: 62 });
        break;
      }
      case "pako": {
        const injuredAllies = allies.filter((ally) => ally.hp < ally.maxHp);
        const center = densest(injuredAllies.length ? injuredAllies : allies);
        if (!center) break;
        this.host.deliverRemoteAoe(source, center);
        break;
      }
      case "biscuit_sui": {
        const target = weakest(allies);
        if (!target) break;
        const deltaX = target.x - source.x;
        const deltaY = target.y - source.y;
        const distance = Math.hypot(deltaX, deltaY);
        const directionX = distance > 0.001 ? deltaX / distance : (source.team === "player" ? 1 : -1);
        const directionY = distance > 0.001 ? deltaY / distance : 0;
        const allyGap = target === source ? 0 : source.radius + target.radius + 8;
        this.host.startAbilityMotion(
          source,
          "dash",
          {
            x: target.x - directionX * allyGap,
            y: target.y - directionY * allyGap,
          },
          { targetFid: target.fid, duration: Math.max(0.2, Math.min(0.58, distance / 880)), avoidOccupied: false },
        );
        this.host.addEffect({ kind: "ring", x: target.x, y: target.y, color: def.accent, life: 0.75, size: BISCUIT_RESCUE_LANDING_RADIUS + 12 });
        break;
      }
      case "nori": {
        source.applePieShotsRemaining = NORI_APPLE_PIE_SHOTS;
        source.applePieShotTimer = 0;
        this.host.addEffect({ kind: "burst", x: source.x, y: source.y, color: def.accent, life: 0.22, size: 30 });
        break;
      }
      case "meme": {
        let total = 0;
        targets.filter((target) => Math.hypot(target.x - source.x, target.y - source.y) < 130).forEach((target) => {
          target.stun = Math.max(target.stun, 0.7);
          total += deal(target, 1.15);
        });
        this.host.heal(source, source, total * 0.5);
        this.host.addEffect({ kind: "ring", x: source.x, y: source.y, color: def.accent, life: 0.65, size: 118 });
        break;
      }
      case "kioi": {
        const target = this.host.nearestTarget(source, targets);
        if (!target) break;
        deal(target, 1.25);
        target.weakenTime = Math.max(target.weakenTime, 3);
        if (target.weakenArmorPenalty === 0) {
          target.weakenArmorPenalty = 10;
          target.armor -= target.weakenArmorPenalty;
        }
        this.host.addEffect({ kind: "text", x: target.x, y: target.y - 54, color: def.accent, text: "🦑", emoji: true, life: 1.05, size: 18 });
        this.host.addEffect({ kind: "text", x: target.x, y: target.y - 38, color: def.accent, text: "讨厌你", life: 0.65, size: 12 });
        this.host.addEffect({ kind: "line", x: source.x, y: source.y, x2: target.x, y2: target.y, color: def.accent, life: 0.5, size: 5 });
        break;
      }
      case "nightin": {
        const center = densest(targets);
        if (!center) break;
        const clusteredTargets = [...targets].sort(
          (left, right) => Math.hypot(left.x - center.x, left.y - center.y) -
              Math.hypot(right.x - center.x, right.y - center.y) ||
            left.fid.localeCompare(right.fid),
        );
        for (let index = 0; index < NIGHTIN_CIGARETTE_COUNT; index += 1) {
          const target = clusteredTargets[index % clusteredTargets.length];
          this.state.battle?.projectileVolley.push({
            sourceFid: source.fid,
            targetFid: target.fid,
            delay: index * NIGHTIN_CIGARETTE_INTERVAL,
            damage: source.attack * NIGHTIN_CIGARETTE_DAMAGE,
            damageKind: "ability",
            burnPower: source.attack * NIGHTIN_CIGARETTE_BURN,
            speed: NIGHTIN_CIGARETTE_SPEED,
            color: "#d7d1ee",
            size: 18,
            style: "cigarette",
            emoji: "🚬",
          });
        }
        break;
      }
      case "tiandou": {
        const center = densest(targets);
        if (!center) break;
        const baseAngle = Math.atan2(center.y - source.y, center.x - source.x);
        for (let index = 0; index < TIANDOU_LOLLIPOP_COUNT; index += 1) {
          const t = index / (TIANDOU_LOLLIPOP_COUNT - 1);
          const angle = baseAngle - TIANDOU_LOLLIPOP_SPREAD / 2 + t * TIANDOU_LOLLIPOP_SPREAD;
          const landingDistance = TIANDOU_LOLLIPOP_LANDING_DISTANCES[index];
          const landingX = Math.max(
            BATTLE_BOUNDS.left + TIANDOU_LOLLIPOP_RADIUS,
            Math.min(BATTLE_BOUNDS.right - TIANDOU_LOLLIPOP_RADIUS, source.x + Math.cos(angle) * landingDistance),
          );
          const landingY = Math.max(
            BATTLE_BOUNDS.top + TIANDOU_LOLLIPOP_RADIUS,
            Math.min(BATTLE_BOUNDS.bottom - TIANDOU_LOLLIPOP_RADIUS, source.y + Math.sin(angle) * landingDistance),
          );
          const launchDistance = Math.hypot(landingX - source.x, landingY - source.y) || 1;
          this.state.battle?.projectiles.push({
            sourceFid: source.fid,
            team: source.team,
            x: source.x,
            y: source.y,
            velocityX: ((landingX - source.x) / launchDistance) * TIANDOU_LOLLIPOP_THROW_SPEED,
            velocityY: ((landingY - source.y) / launchDistance) * TIANDOU_LOLLIPOP_THROW_SPEED,
            radius: TIANDOU_LOLLIPOP_RADIUS,
            remainingRange: launchDistance,
            damage: source.attack * TIANDOU_LOLLIPOP_DAMAGE_MULTIPLIER,
            damageKind: "ability",
            burnPower: 0,
            color: def.accent,
            size: 18,
            style: "lollipop",
            emoji: "🍭",
            grounded: false,
          });
        }
        break;
      }
      case "youyi": {
        const target = farthest(targets);
        if (!target) break;
        this.host.startAbilityMotion(
          source,
          "jump",
          { x: target.x + (source.team === "player" ? -36 : 36), y: target.y },
          { targetFid: target.fid, duration: 0.52, arcHeight: 94 },
        );
        this.host.addEffect({ kind: "burst", x: target.x, y: target.y, color: def.accent, life: 0.55, size: 56 });
        break;
      }
      case "akirinco": {
        const target = weakest(targets);
        if (!target) break;
        this.host.startAbilityMotion(
          source,
          "jump",
          { x: target.x + (source.team === "player" ? -34 : 34), y: target.y },
          { targetFid: target.fid, duration: 0.5, arcHeight: 90 },
        );
        this.host.addEffect({ kind: "burst", x: target.x, y: target.y, color: def.accent, life: 0.68, size: 68 });
        break;
      }
      case "lovely": {
        const target = this.host.nearestTarget(source, targets);
        if (!target) break;
        const duration = abilityStatForStar(def, source.star, "duration", 5);
        const shieldRatio = abilityStatForStar(def, source.star, "shieldRatio", 0.25);
        source.lovelyControlTime = duration;
        addShield(source, source.maxHp * shieldRatio, 0.75);
        this.host.faceTowardX(source, target.x);
        this.host.addEffect({ kind: "ring", x: source.x, y: source.y, color: def.accent, life: 0.7, size: source.radius * 2.6 });
        this.host.addEffect({ kind: "text", x: source.x, y: source.y - 40, color: def.accent, text: "偶像控场", life: 0.7, size: 12 });
        break;
      }
      case "komichi": {
        const duration = abilityStatForStar(def, source.star, "duration", 5.5);
        source.komichiSignTime = duration;
        this.host.addEffect({
          kind: "komichi_sign",
          x: source.x,
          y: source.y,
          color: def.accent,
          life: 0.68,
          size: 118,
        });
        break;
      }
      case "mumu": {
        const { battle } = this.state;
        if (!battle) break;
        const target = this.host.selectMumuRescueTarget(source, allies, battle);
        if (!target) {
          source.energy = source.maxEnergy;
          break;
        }
        const destination = this.host.mumuRescueDestination(source, target, battle);
        const control = mumuWhipControlPoint(target, destination, source);
        const motion = this.host.startAbilityMotion(target, "pull", destination, {
          abilityId: "mumu",
          sourceFid: source.fid,
          targetFid: target.fid,
          duration: MUMU_RESCUE_DURATION,
          arcHeight: MUMU_WHIP_ARC_HEIGHT,
          controlX: control.x,
          controlY: control.y,
          avoidOccupied: false,
        });
        if (!motion) {
          source.energy = source.maxEnergy;
          break;
        }
        this.host.addEffect({
          kind: "mumu_whip",
          x: source.x,
          y: source.y,
          x2: motion.fromX,
          y2: motion.fromY,
          x3: motion.toX,
          y3: motion.toY,
          color: def.accent,
          life: motion.duration,
          size: motion.arcHeight,
        });
        this.host.addEffect({ kind: "burst", x: source.x, y: source.y, color: "#f7ddff", life: 0.38, size: 50 });
        this.host.addEffect({ kind: "text", x: target.x, y: target.y - 44, color: def.accent, text: "舞带救场", life: 0.65, size: 12 });
        break;
      }
      case "yukisyo": {
        const shieldFlat = abilityStatForStar(def, source.star, "shieldFlat", 50);
        const shieldHpRatio = abilityStatForStar(def, source.star, "shieldHpRatio", 0.2);
        const duration = abilityStatForStar(def, source.star, "duration", 4);
        allies.forEach((target) => {
          this.host.grantAbilityShield(
            source,
            target,
            shieldFlat + target.maxHp * shieldHpRatio,
            duration,
          );
          this.host.addEffect({ kind: "ring", x: target.x, y: target.y, color: def.accent, life: 0.58, size: target.radius * 2.5 });
        });
        break;
      }
      case "xuehui": {
        targets
          .filter((target) => Math.hypot(target.x - source.x, target.y - source.y) <= XUEHUI_CLEAVE_RADIUS)
          .forEach((target) => {
            deal(target, XUEHUI_CLEAVE_DAMAGE_MULTIPLIER);
            this.host.applyBurn(source, target, source.attack * XUEHUI_CLEAVE_BURN_MULTIPLIER, "ability");
          });
        this.host.addEffect({ kind: "ring", x: source.x, y: source.y, color: def.accent, life: 0.5, size: XUEHUI_CLEAVE_RADIUS * 1.35 });
        this.host.addEffect({ kind: "burst", x: source.x + source.facingX * 22, y: source.y, color: def.accent, life: 0.32, size: 48 });
        break;
      }
      case "rei": {
        this.host.resurrectWithRei(source);
        break;
      }
      case "lian": {
        const center = densest(targets);
        if (!center) break;
        this.host.addEffect({ kind: "burst", x: source.x, y: source.y, color: "#f7ddff", life: 0.52, size: 62 });
        this.host.addEffect({ kind: "ring", x: source.x, y: source.y, color: def.accent, life: 0.68, size: 58 });
        this.host.deliverRemoteAoe(source, center);
        break;
      }
      case "miki_guest": {
        const center = densest(targets);
        if (!center) break;
        targets
          .filter((target) => Math.hypot(target.x - center.x, target.y - center.y) <= 138)
          .forEach((target) => {
            deal(target, 0.82);
            if (target.alive) {
              deal(target, 0.58);
              target.stun = Math.max(target.stun, 0.62);
            }
          });
        this.host.addEffect({ kind: "line", x: source.x, y: source.y - 8, x2: center.x, y2: center.y - 18, color: "#b9a8ff", life: 0.52, size: 5 });
        this.host.addEffect({ kind: "line", x: source.x, y: source.y + 8, x2: center.x, y2: center.y + 18, color: "#ffabd8", life: 0.52, size: 5 });
        this.host.addEffect({ kind: "ring", x: center.x, y: center.y, color: def.accent, life: 0.78, size: 148 });
        break;
      }
      case "hatsuse_guest": {
        let totalDamage = 0;
        [...targets]
          .sort(
            (left, right) => Math.hypot(left.x - source.x, left.y - source.y) -
              Math.hypot(right.x - source.x, right.y - source.y),
          )
          .slice(0, 3)
          .forEach((target, index) => {
            totalDamage += deal(target, 1.08 - index * 0.14);
            this.host.addEffect({ kind: "line", x: source.x, y: source.y, x2: target.x, y2: target.y, color: def.accent, life: 0.42, size: 5 });
            this.host.addEffect({ kind: "text", x: target.x, y: target.y - 42, color: def.accent, text: "蝙蝠", life: 0.55, size: 10 });
          });
        if (totalDamage > 0 && allies.length) {
          const healPerAlly = (totalDamage * 0.3) / allies.length;
          allies.forEach((ally) => this.host.heal(source, ally, healPerAlly));
        }
        break;
      }
      case "rutice": {
        const targetCount = abilityStatForStar(def, source.star, "targetCount", 3);
        const effectRatio = abilityStatForStar(def, source.star, "effectRatio", 0.24);
        const syringeTargets = [...allies]
          .filter((target) => target.fid !== source.fid && target.hp < target.maxHp)
          .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)
          .slice(0, targetCount);
        this.host.fireRuticeSyringes(source, syringeTargets, effectRatio);
        this.host.addEffect({
          kind: "burst",
          x: source.x,
          y: source.y,
          color: def.accent,
          life: 0.42,
          size: 62,
        });
        this.host.addEffect({
          kind: "emoji_burst",
          x: source.x,
          y: source.y - 28,
          color: def.accent,
          text: "💉",
          emoji: true,
          life: 0.58,
          size: 28,
        });
        break;
      }
      case "rift_tyrant": {
        targets.forEach((target) => {
          const dealt = this.host.damage(source, target, source.attack * 1.05, false, "ability");
          target.stun = Math.max(target.stun, 0.55);
          if (dealt > 0) this.host.addDamageText(target, dealt);
        });
        this.host.addEffect({
          kind: "ring",
          x: source.x,
          y: source.y,
          color: def.accent,
          life: 1,
          size: 430,
        });
        break;
      }
      default: {
        const exhaustiveUnit: never = source.unitId;
        return exhaustiveUnit;
      }
    }

    if (source.unitId !== "tower_god") {
      this.host.addEffect({
        kind: "text",
        x: source.x,
        y: source.y - 48,
        color: def.accent,
        text: def.abilityName,
        life: 0.85,
        size: 14,
      });
    }
  }

}
