/* eslint-disable implicit-arrow-linebreak, function-paren-newline */

import { UNIT_DEFS, abilityStatForStar, type UnitId } from "../gameData";
import { BATTLE_BOUNDS, mechanicalRabbitMuzzle } from "../battleGeometry";
import type {
  BattleEffect,
  BattleState,
  DamageTrace,
  Fighter,
  GameState,
  Projectile,
  ProjectileVolleyShot,
  Team,
} from "../gameTypes";
import {
  CHRONOSPHERE_RADIUS,
  REMOTE_AOE_PROJECTILE_SPEED,
} from "./abilities/AbilitySystem";
import type { DamageKind } from "./combatResolution";

const CLOCK_GUNNER_RABBIT_COUNT = 2;
const CLOCK_GUNNER_RABBIT_LIFETIME = 4;
const CLOCK_GUNNER_RABBIT_RADIUS = 14;
const CLOCK_GUNNER_RABBIT_DASH_SPEED = 560;
const CLOCK_GUNNER_RABBIT_RANGE = 235;
const CLOCK_GUNNER_RABBIT_FIRE_INTERVAL = 0.46;
const CLOCK_GUNNER_RABBIT_DAMAGE_MULTIPLIER = 0.46;
const CLOCK_GUNNER_RABBIT_PROJECTILE_SPEED = 620;
const CLOCK_GUNNER_RABBIT_PROJECTILE_RANGE = 560;
const CLOCK_GUNNER_RABBIT_PROJECTILE_RADIUS = 5;
const CLOCK_GUNNER_RABBIT_FLANK_ANGLE = Math.PI * 0.62;
const SUMI_DRAGON_PROJECTILE_RADIUS = 14;
const CHRONOSPHERE_DURATION = 2.8;
const TIANDOU_LOLLIPOP_GROUND_LIFETIME = 10;
const TIANDOU_LOLLIPOP_HEAL_RATIO = 0.14;
const TIANDOU_LOLLIPOP_MOVE_SPEED = 16;
const TIANDOU_LOLLIPOP_MOVE_DURATION = 3;
const TIANDOU_LOLLIPOP_SLOW_DURATION = 2.4;
const SUMI_SEAL_RADIUS = 128;
const SUMI_SEAL_ARMOR_PENALTY = 9;
const SUMI_SEAL_DURATION = 2.8;
const COG_ORANGE_HEAL_HP_RATIO = 0.11;
const COG_ORANGE_HEAL_ATTACK_RATIO = 0.75;
const PAKO_ANGEL_FISH_RADIUS = 145;
const PAKO_ANGEL_FISH_INITIAL_HEAL_ATTACK_RATIO = 1.6;
const PAKO_ANGEL_FISH_INITIAL_HEAL_CASTER_HP_RATIO = 0.08;
const PAKO_ANGEL_FISH_ZONE_DURATION = 3.2;
export const PAKO_ANGEL_FISH_PULSE_INTERVAL = 0.7;
const PAKO_ANGEL_FISH_FIELD_COLOR = "#6ff0b5";
const PAKO_ANGEL_FISH_HIGHLIGHT_COLOR = "#d9fff0";
const RUTICE_SYRINGE_SPEED = 660;
const MITSURI_FEAR_RADIUS = 118;
const MITSURI_FEAR_DURATION = 4.2;
const LIAN_FINALE_RADIUS = 140;
const LIAN_FINALE_STAGE_LIFETIME = 0.58;
const REMOTE_AOE_DELIVERIES: Partial<
  Record<
    UnitId,
    {
      kind: "beam" | "projectile";
      glyph?: string;
    }
  >
> = {
  spark_mage: { kind: "projectile", glyph: "⏳" },
  sui_flower: { kind: "projectile", glyph: "🌶️" },
  pako: { kind: "projectile", glyph: "🐟" },
  rei: { kind: "projectile", glyph: "👻" },
  lian: { kind: "projectile", glyph: "✦" },
  mitsuri: { kind: "projectile", glyph: "🧪" },
};
const REMOTE_AOE_PROJECTILE_MIN_DURATION = 0.28;
const REMOTE_AOE_PROJECTILE_MAX_DURATION = 0.58;

export interface CombatProjectileHost {
  state(): GameState;
  random(): number;
  living(team: Team): Fighter[];
  damage(
    source: Fighter,
    target: Fighter,
    amount: number,
    inactive?: boolean,
    damageKind?: DamageKind,
    trace?: DamageTrace,
  ): number;
  addDamageText(target: Fighter, amount: number): void;
  applyBurn(
    source: Fighter,
    target: Fighter,
    totalDamage: number,
    damageKind?: DamageKind,
  ): void;
  heal(
    source: Fighter,
    target: Fighter,
    amount: number,
    showEffect?: boolean,
  ): number;
  grantShield(
    source: Fighter,
    target: Fighter,
    amount: number,
    capRatio?: number,
    battle?: BattleState | null,
  ): number;
  addEnergy(fighter: Fighter, amount: number): void;
  nearestTarget(source: Fighter, targets: Fighter[]): Fighter | null;
  faceTowardX(fighter: Fighter, targetX: number): void;
  retreatFrom(
    source: Fighter,
    target: Fighter,
    distance: number,
    duration: number,
  ): boolean;
  pushFighterAwayFrom(
    target: Fighter,
    originX: number,
    originY: number,
    distance: number,
    duration: number,
  ): boolean;
  addEffect(effect: Omit<BattleEffect, "maxLife">): void;
}

export class CombatProjectileSystem {
  constructor(private readonly host: CombatProjectileHost) {}

  private projectileTrace(projectile: Projectile): DamageTrace {
    return {
      projectile: projectile.emoji || projectile.style || "投射物",
      impact: { x: Number(projectile.x.toFixed(1)), y: Number(projectile.y.toFixed(1)) },
    };
  }

  private addEffect(effect: Omit<BattleEffect, "maxLife">) {
    this.host.addEffect(effect);
  }

  public deliverRemoteAoe(source: Fighter, center: { x: number; y: number }) {
    const { battle } = this.host.state();
    if (!battle) return;
    const delivery = REMOTE_AOE_DELIVERIES[source.unitId];
    if (!delivery || delivery.kind === "beam") {
      this.addEffect({
        kind: "line",
        x: source.x,
        y: source.y,
        x2: center.x,
        y2: center.y,
        color: UNIT_DEFS[source.unitId].accent,
        life: 0.36,
        size: 7,
      });
      this.resolveRemoteAoeImpact(source, source.unitId, center);
      return;
    }

    const deltaX = center.x - source.x;
    const deltaY = center.y - source.y;
    const distance = Math.hypot(deltaX, deltaY);
    if (distance < 1) {
      this.resolveRemoteAoeImpact(source, source.unitId, center);
      return;
    }
    const duration = Math.max(
      REMOTE_AOE_PROJECTILE_MIN_DURATION,
      Math.min(
        REMOTE_AOE_PROJECTILE_MAX_DURATION,
        distance / REMOTE_AOE_PROJECTILE_SPEED,
      ),
    );
    battle.projectiles.push({
      sourceFid: source.fid,
      team: source.team,
      x: source.x,
      y: source.y,
      velocityX: deltaX / duration,
      velocityY: deltaY / duration,
      radius: source.unitId === "lian" ? 12 : source.unitId === "mitsuri" ? 10 : 8,
      remainingRange: distance,
      damage: 0,
      burnPower: 0,
      color: UNIT_DEFS[source.unitId].accent,
      size: source.unitId === "lian" ? 18 : source.unitId === "mitsuri" ? 26 : 9,
      style: source.unitId === "lian" ? "finale_star" : source.unitId === "mitsuri" ? "test_tube" : "aoe_orb",
      emoji: delivery.glyph,
      impactAbilityId: source.unitId,
    });
  }

  public fireRuticeSyringes(
    source: Fighter,
    targets: Fighter[],
    effectRatio: number,
  ) {
    const { battle } = this.host.state();
    if (!battle) return;
    source.attackPulse = 0.24;
    targets.forEach((target, index) => {
      const deltaX = target.x - source.x;
      const deltaY = target.y - source.y;
      const distance = Math.max(1, Math.hypot(deltaX, deltaY));
      const spread = (index - (targets.length - 1) / 2) * 5;
      battle.projectiles.push({
        sourceFid: source.fid,
        team: source.team,
        x: source.x,
        y: source.y + spread,
        velocityX: (deltaX / distance) * RUTICE_SYRINGE_SPEED,
        velocityY: (deltaY / distance) * RUTICE_SYRINGE_SPEED,
        radius: 8,
        remainingRange: distance,
        damage: 0,
        burnPower: 0,
        color: UNIT_DEFS.rutice.accent,
        size: 24,
        style: "syringe",
        emoji: "💉",
        impactAbilityId: "rutice",
        impactTargetFid: target.fid,
        impactMultiplier: effectRatio,
      });
    });
  }

  private resolveRemoteAoeImpact(
    source: Fighter,
    abilityId: UnitId,
    center: { x: number; y: number },
    support?: { targetFid?: string; multiplier?: number },
    trace?: DamageTrace,
  ) {
    const targets = this.host.living(
      source.team === "player" ? "enemy" : "player",
    );
    const allies = this.host.living(source.team);
    const def = UNIT_DEFS[abilityId];
    const deal = (target: Fighter, multiplier: number, bonus = 0) => {
      const dealt = this.host.damage(
        source,
        target,
        source.attack * multiplier + bonus,
        true,
        "ability",
        trace,
      );
      if (dealt > 0) this.host.addDamageText(target, dealt);
      return dealt;
    };

    switch (abilityId) {
      case "spark_mage": {
        const radius = abilityStatForStar(
          def,
          source.star,
          "radius",
          CHRONOSPHERE_RADIUS,
        );
        const duration = abilityStatForStar(
          def,
          source.star,
          "duration",
          CHRONOSPHERE_DURATION,
        );
        source.energy = source.maxEnergy;
        this.host.state().battle?.chronospheres.push({
          sourceFid: source.fid,
          x: center.x,
          y: center.y,
          radius,
          life: duration,
          maxLife: duration,
          color: def.accent,
        });
        this.addEffect({
          kind: "chronosphere",
          x: center.x,
          y: center.y,
          color: def.accent,
          life: 0.85,
          size: radius,
        });
        this.addEffect({
          kind: "text",
          x: center.x,
          y: center.y - 18,
          color: "#e7a3ff",
          text: "时停",
          life: 0.85,
          size: 14,
        });
        break;
      }
      case "sui_flower":
        targets
          .filter(
            (target) =>
              Math.hypot(target.x - center.x, target.y - center.y) < 125,
          )
          .forEach((target) => {
            deal(target, 1.45);
            this.host.applyBurn(source, target, source.attack * 0.7, "ability");
            target.stun = Math.max(target.stun, 0.7);
          });
        this.addEffect({
          kind: "hotpot",
          x: center.x,
          y: center.y,
          color: "#ff4d3a",
          life: 1.15,
          size: 138,
        });
        this.addEffect({
          kind: "ring",
          x: center.x,
          y: center.y,
          color: "#ff6b2d",
          life: 0.95,
          size: 132,
        });
        this.addEffect({
          kind: "burst",
          x: center.x,
          y: center.y,
          color: "#ff8a3d",
          life: 0.85,
          size: 110,
        });
        this.addEffect({
          kind: "text",
          x: center.x,
          y: center.y - 20,
          color: "#ffd0a8",
          text: "火锅",
          life: 0.8,
          size: 14,
        });
        for (let spark = 0; spark < 5; spark += 1) {
          const angle = (Math.PI * 2 * spark) / 5;
          this.addEffect({
            kind: "burst",
            x: center.x + Math.cos(angle) * 42,
            y: center.y + Math.sin(angle) * 42,
            color: spark % 2 === 0 ? "#ff5a2e" : "#ffb347",
            life: 0.55 + spark * 0.05,
            size: 28,
          });
        }
        break;
      case "sumi":
        targets
          .filter(
            (target) =>
              Math.hypot(target.x - center.x, target.y - center.y) <=
              SUMI_SEAL_RADIUS,
          )
          .forEach((target) => {
            deal(target, 1.32);
            if (!target.alive) return;
            target.stun = Math.max(target.stun, 0.62);
            target.weakenTime = Math.max(target.weakenTime, SUMI_SEAL_DURATION);
            if (target.weakenArmorPenalty === 0) {
              target.weakenArmorPenalty = SUMI_SEAL_ARMOR_PENALTY;
              target.armor -= target.weakenArmorPenalty;
            }
          });
        this.addEffect({
          kind: "ring",
          x: center.x,
          y: center.y,
          color: def.accent,
          life: 0.78,
          size: SUMI_SEAL_RADIUS + 12,
        });
        this.addEffect({
          kind: "burst",
          x: center.x,
          y: center.y,
          color: "#edf3ff",
          life: 0.45,
          size: 72,
        });
        break;
      case "cog_scribe": {
        const otherAllies = allies.filter((ally) => ally.fid !== source.fid);
        const target = support?.targetFid
          ? otherAllies.find((ally) => ally.fid === support.targetFid)
          : [...otherAllies].sort(
              (left, right) =>
                Math.hypot(left.x - center.x, left.y - center.y) -
                Math.hypot(right.x - center.x, right.y - center.y),
            )[0];
        if (!target) break;
        const multiplier = support?.multiplier ?? 1;
        this.host.heal(
          source,
          target,
          (target.maxHp * COG_ORANGE_HEAL_HP_RATIO +
            source.attack * COG_ORANGE_HEAL_ATTACK_RATIO) *
            multiplier,
        );
        const energyGranted = abilityStatForStar(
          def,
          source.star,
          "energyPerOrange",
          3,
        );
        this.host.addEnergy(target, energyGranted);
        this.addEffect({
          kind: "burst",
          x: target.x,
          y: target.y,
          color: def.accent,
          life: 0.32,
          size: 30,
        });
        this.addEffect({
          kind: "text",
          x: target.x,
          y: target.y - 42,
          color: def.accent,
          text: "🍊",
          emoji: true,
          life: 0.55,
          size: 16,
        });
        this.addEffect({
          kind: "energy_pulse",
          x: target.x,
          y: target.y,
          color: def.accent,
          text: `+${energyGranted} 能量`,
          life: 0.46,
          size: Math.max(42, target.radius * 2.5),
        });
        break;
      }
      case "rutice": {
        const target = support?.targetFid
          ? allies.find((ally) => ally.fid === support.targetFid)
          : undefined;
        if (!target) break;
        const effectRatio = support?.multiplier
          ?? abilityStatForStar(def, source.star, "effectRatio", 0.24);
        const knockbackMin = abilityStatForStar(def, source.star, "knockbackMin", 48);
        const knockbackMax = abilityStatForStar(def, source.star, "knockbackMax", 100);
        const powerChance = abilityStatForStar(def, source.star, "powerChance", 0.12);
        const powerMultiplier = abilityStatForStar(def, source.star, "powerMultiplier", 2.6);
        const heals = this.host.random() < 0.5;
        const baseKnockback = knockbackMin + this.host.random() * (knockbackMax - knockbackMin);
        const powerShot = this.host.random() < powerChance;
        const knockback = baseKnockback * (powerShot ? powerMultiplier : 1);
        if (heals) {
          this.host.heal(source, target, target.maxHp * effectRatio);
        } else {
          this.host.grantShield(source, target, target.maxHp * effectRatio, 0.55);
        }
        this.host.pushFighterAwayFrom(target, source.x, source.y, knockback, 0.3);
        this.addEffect({
          kind: heals ? "healing_pulse" : "ring",
          x: target.x,
          y: target.y,
          color: heals ? def.accent : "#b9a8ff",
          life: 0.48,
          size: Math.max(46, target.radius * 2.4),
        });
        this.addEffect({
          kind: "text",
          x: target.x,
          y: target.y - target.radius - 34,
          color: heals ? "#a9ffe2" : "#ded2ff",
          text: powerShot
            ? `${heals ? "治疗" : "护盾"} · 大力针！`
            : `${heals ? "治疗" : "护盾"}针`,
          life: 0.72,
          size: powerShot ? 13 : 11,
        });
        this.addEffect({
          kind: "emoji_burst",
          x: target.x,
          y: target.y - target.radius - 10,
          color: def.accent,
          text: "💉",
          emoji: true,
          life: 0.6,
          size: 24,
        });
        break;
      }
      case "mitsuri": {
        const radius = abilityStatForStar(
          def,
          source.star,
          "radius",
          MITSURI_FEAR_RADIUS,
        );
        const duration = abilityStatForStar(
          def,
          source.star,
          "duration",
          MITSURI_FEAR_DURATION,
        );
        this.host.state().battle?.controlZones.push({
          kind: "fear",
          sourceFid: source.fid,
          team: source.team,
          x: center.x,
          y: center.y,
          radius,
          life: duration,
          maxLife: duration,
          color: def.accent,
        });
        this.addEffect({
          kind: "fear_field",
          x: center.x,
          y: center.y,
          color: def.accent,
          text: "🧪",
          emoji: true,
          life: duration,
          size: radius,
        });
        this.addEffect({
          kind: "text",
          x: center.x,
          y: center.y - radius * 0.55,
          color: "#d7fff1",
          text: "脚臭实验",
          life: 0.72,
          size: 12,
        });
        break;
      }
      case "pako":
        allies
          .filter(
            (ally) =>
              Math.hypot(ally.x - center.x, ally.y - center.y) <=
              PAKO_ANGEL_FISH_RADIUS,
          )
          .forEach((ally) => {
            this.host.heal(
              source,
              ally,
              source.attack * PAKO_ANGEL_FISH_INITIAL_HEAL_ATTACK_RATIO +
                source.maxHp * PAKO_ANGEL_FISH_INITIAL_HEAL_CASTER_HP_RATIO,
            );
          });
        this.host.state().battle?.healingZones.push({
          sourceFid: source.fid,
          team: source.team,
          x: center.x,
          y: center.y,
          radius: PAKO_ANGEL_FISH_RADIUS,
          life: PAKO_ANGEL_FISH_ZONE_DURATION,
          maxLife: PAKO_ANGEL_FISH_ZONE_DURATION,
          pulseTimer: PAKO_ANGEL_FISH_PULSE_INTERVAL,
          color: PAKO_ANGEL_FISH_FIELD_COLOR,
        });
        this.addEffect({
          kind: "healing_field",
          x: center.x,
          y: center.y,
          color: PAKO_ANGEL_FISH_FIELD_COLOR,
          life: PAKO_ANGEL_FISH_ZONE_DURATION,
          size: PAKO_ANGEL_FISH_RADIUS,
        });
        this.addEffect({
          kind: "healing_pulse",
          x: center.x,
          y: center.y,
          color: PAKO_ANGEL_FISH_FIELD_COLOR,
          life: 0.46,
          size: 68,
        });
        this.addEffect({
          kind: "text",
          x: center.x,
          y: center.y - 42,
          color: PAKO_ANGEL_FISH_HIGHLIGHT_COLOR,
          text: "天使摸鱼",
          life: 0.75,
          size: 13,
        });
        break;
      case "lian": {
        targets
          .filter(
            (target) =>
              Math.hypot(target.x - center.x, target.y - center.y) <=
              LIAN_FINALE_RADIUS,
          )
          .forEach((target) => deal(target, 1.8));
        this.addEffect({
          kind: "finale",
          x: center.x,
          y: center.y,
          color: def.accent,
          life: LIAN_FINALE_STAGE_LIFETIME,
          size: 150,
        });
        this.addEffect({
          kind: "burst",
          x: center.x,
          y: center.y,
          color: "#f7ddff",
          life: 0.32,
          size: 96,
        });
        break;
      }
      default:
        break;
    }
  }

  public fireFixedProjectile(
    source: Fighter,
    target: Fighter,
    shot: ProjectileVolleyShot,
  ) {
    const deltaX = target.x - source.x;
    const deltaY = target.y - source.y;
    const baseAngle = Math.atan2(deltaY, deltaX) + (shot.angleOffset || 0);
    source.attackPulse = 0.22;
    source.attackTargetX = target.x;
    source.attackTargetY = target.y;
    this.host.faceTowardX(source, target.x);
    this.host.state().battle?.projectiles.push({
      sourceFid: source.fid,
      team: source.team,
      x: source.x,
      y: source.y,
      velocityX: Math.cos(baseAngle) * shot.speed,
      velocityY: Math.sin(baseAngle) * shot.speed,
      radius:
        shot.style === "sumi_dragon"
          ? SUMI_DRAGON_PROJECTILE_RADIUS
            : shot.style === "laugh"
              ? 18
              : shot.style === "badge"
                ? 13
              : shot.emoji ||
                shot.style === "carrot" ||
                shot.style === "shark" ||
                shot.style === "coin"
              ? 9
              : 7,
      remainingRange: 880,
      damage: shot.damage,
      damageKind: shot.damageKind,
      burnPower: shot.burnPower,
      color: shot.color,
      size: shot.size,
      style: shot.style,
      emoji: shot.emoji,
      splashRadius: shot.splashRadius,
      stunDuration: shot.stunDuration,
      knockbackDistance: shot.knockbackDistance,
    });
  }

  public summonClockGunnerRabbits(source: Fighter) {
    const { battle } = this.host.state();
    if (!battle) return;
    battle.pets = battle.pets.filter((pet) => pet.ownerFid !== source.fid);
    for (let slot = 0; slot < CLOCK_GUNNER_RABBIT_COUNT; slot += 1) {
      const verticalOffset = slot === 0 ? -26 : 26;
      const horizontalOffset = source.facingX * 24;
      battle.petSerial += 1;
      battle.pets.push({
        id: `${source.fid}-rabbit-${battle.petSerial}`,
        ownerFid: source.fid,
        team: source.team,
        x: Math.max(
          BATTLE_BOUNDS.left + CLOCK_GUNNER_RABBIT_RADIUS,
          Math.min(
            BATTLE_BOUNDS.right - CLOCK_GUNNER_RABBIT_RADIUS,
            source.x + horizontalOffset,
          ),
        ),
        y: Math.max(
          BATTLE_BOUNDS.top + CLOCK_GUNNER_RABBIT_RADIUS,
          Math.min(
            BATTLE_BOUNDS.bottom - CLOCK_GUNNER_RABBIT_RADIUS,
            source.y + verticalOffset,
          ),
        ),
        radius: CLOCK_GUNNER_RABBIT_RADIUS,
        life: CLOCK_GUNNER_RABBIT_LIFETIME,
        maxLife: CLOCK_GUNNER_RABBIT_LIFETIME,
        moveSpeed: CLOCK_GUNNER_RABBIT_DASH_SPEED,
        range: CLOCK_GUNNER_RABBIT_RANGE,
        fireTimer: slot * 0.16,
        targetFid: null,
        repositionX: null,
        repositionY: null,
        returning: false,
        aimX: source.facingX,
        aimY: 0,
        attackPulse: 0,
      });
    }
  }

  public updateMechanicalRabbitPets(battle: BattleState, dt: number) {
    const fighters = [...battle.player, ...battle.enemy];
    battle.pets = battle.pets.filter((pet) => {
      const owner = fighters.find((fighter) => fighter.fid === pet.ownerFid);
      pet.life -= dt;
      pet.attackPulse = Math.max(0, pet.attackPulse - dt);
      if (!owner?.alive) return false;
      if (pet.life <= 0) {
        pet.returning = true;
        pet.repositionX = owner.x;
        pet.repositionY = owner.y - owner.radius - pet.radius;
      }

      if (pet.repositionX !== null && pet.repositionY !== null) {
        const moveDeltaX = pet.repositionX - pet.x;
        const moveDeltaY = pet.repositionY - pet.y;
        const moveDistance = Math.hypot(moveDeltaX, moveDeltaY);
        const step = Math.min(moveDistance, pet.moveSpeed * dt);
        if (moveDistance > 0.001) {
          pet.x += (moveDeltaX / moveDistance) * step;
          pet.y += (moveDeltaY / moveDistance) * step;
        }
        if (moveDistance <= step + 0.001) {
          pet.x = pet.repositionX;
          pet.y = pet.repositionY;
          pet.repositionX = null;
          pet.repositionY = null;
          if (pet.returning) return false;
        }
        return true;
      }

      const targetTeam: Team = pet.team === "player" ? "enemy" : "player";
      const targets = this.host.living(targetTeam);
      let target =
        targets.find((fighter) => fighter.fid === pet.targetFid) || null;
      if (!target) {
        target = targets.reduce<Fighter | null>((best, candidate) => {
          if (!best) return candidate;
          return Math.hypot(candidate.x - pet.x, candidate.y - pet.y) <
            Math.hypot(best.x - pet.x, best.y - pet.y)
            ? candidate
            : best;
        }, null);
        pet.targetFid = target?.fid || null;
      }
      if (!target) return true;

      const deltaX = target.x - pet.x;
      const deltaY = target.y - pet.y;
      const rawDistance = Math.hypot(deltaX, deltaY);
      const distance = rawDistance || 1;
      if (rawDistance > 0.001) {
        pet.aimX = deltaX / rawDistance;
        pet.aimY = deltaY / rawDistance;
      }
      if (distance > pet.range) {
        pet.repositionX = Math.max(
          BATTLE_BOUNDS.left + pet.radius,
          Math.min(
            BATTLE_BOUNDS.right - pet.radius,
            target.x - pet.aimX * pet.range,
          ),
        );
        pet.repositionY = Math.max(
          BATTLE_BOUNDS.top + pet.radius,
          Math.min(
            BATTLE_BOUNDS.bottom - pet.radius,
            target.y - pet.aimY * pet.range,
          ),
        );
        return true;
      }

      pet.fireTimer -= dt;
      if (pet.fireTimer > 0) return true;
      const muzzle = mechanicalRabbitMuzzle(pet);
      const shotDeltaX = target.x - muzzle.x;
      const shotDeltaY = target.y - muzzle.y;
      const shotDistance = Math.hypot(shotDeltaX, shotDeltaY) || 1;
      battle.projectiles.push({
        sourceFid: owner.fid,
        team: pet.team,
        x: muzzle.x,
        y: muzzle.y,
        velocityX:
          (shotDeltaX / shotDistance) * CLOCK_GUNNER_RABBIT_PROJECTILE_SPEED,
        velocityY:
          (shotDeltaY / shotDistance) * CLOCK_GUNNER_RABBIT_PROJECTILE_SPEED,
        radius: CLOCK_GUNNER_RABBIT_PROJECTILE_RADIUS,
        remainingRange: CLOCK_GUNNER_RABBIT_PROJECTILE_RANGE,
        damage: owner.attack * CLOCK_GUNNER_RABBIT_DAMAGE_MULTIPLIER,
        damageKind: "ability",
        burnPower: 0,
        color: UNIT_DEFS.clock_gunner.accent,
        size: 3,
      });
      pet.attackPulse = 0.16;
      pet.fireTimer = CLOCK_GUNNER_RABBIT_FIRE_INTERVAL;
      const targetDirectionX = target.x - owner.x;
      const targetDirectionY = target.y - owner.y;
      const orbitDirection = Number(pet.id.split("-").at(-1)) % 2 ? 1 : -1;
      const flankAngle =
        Math.atan2(targetDirectionY, targetDirectionX) +
        orbitDirection * CLOCK_GUNNER_RABBIT_FLANK_ANGLE;
      pet.repositionX = Math.max(
        BATTLE_BOUNDS.left + pet.radius,
        Math.min(
          BATTLE_BOUNDS.right - pet.radius,
          target.x + Math.cos(flankAngle) * pet.range,
        ),
      );
      pet.repositionY = Math.max(
        BATTLE_BOUNDS.top + pet.radius,
        Math.min(
          BATTLE_BOUNDS.bottom - pet.radius,
          target.y + Math.sin(flankAngle) * pet.range,
        ),
      );
      return true;
    });
  }

  public updateProjectileVolley(battle: BattleState, dt: number) {
    battle.projectileVolley = battle.projectileVolley.filter((shot) => {
      shot.delay -= dt;
      if (shot.delay > 0) return true;
      const source = [...battle.player, ...battle.enemy].find(
        (fighter) => fighter.fid === shot.sourceFid,
      );
      if (!source?.alive) return false;
      if (shot.supportHealMultiplier !== undefined) {
        const target = this.host
          .living(source.team)
          .filter((ally) => ally.fid !== source.fid)
          .sort(
            (left, right) => left.hp / left.maxHp - right.hp / right.maxHp,
          )[0];
        if (target) {
          const deltaX = target.x - source.x;
          const deltaY = target.y - source.y;
          const distance = Math.hypot(deltaX, deltaY);
          const duration = Math.max(
            REMOTE_AOE_PROJECTILE_MIN_DURATION,
            Math.min(
              REMOTE_AOE_PROJECTILE_MAX_DURATION,
              distance / REMOTE_AOE_PROJECTILE_SPEED,
            ),
          );
          battle.projectiles.push({
            sourceFid: source.fid,
            team: source.team,
            x: source.x,
            y: source.y,
            velocityX: deltaX / duration,
            velocityY: deltaY / duration,
            radius: 7,
            remainingRange: distance,
            damage: 0,
            burnPower: 0,
            color: shot.color,
            size: shot.size,
            style: "aoe_orb",
            emoji: shot.emoji,
            impactAbilityId: "cog_scribe",
            impactTargetFid: target.fid,
            impactMultiplier: shot.supportHealMultiplier,
          });
        }
        return false;
      }
      const locked = [...battle.player, ...battle.enemy].find(
        (fighter) => fighter.fid === shot.targetFid,
      );
      const targetTeam: Team = source.team === "player" ? "enemy" : "player";
      // 带角度偏移的弹幕（近视射击）开火时重新找最近目标，体现瞄不准
      const target =
        shot.angleOffset !== undefined
          ? this.host.nearestTarget(source, this.host.living(targetTeam)) ||
            (locked?.alive ? locked : null)
          : locked?.alive
            ? locked
            : null;
      if (target) this.fireFixedProjectile(source, target, shot);
      return false;
    });
  }

  public updateProjectiles(battle: BattleState, dt: number) {
    battle.projectiles = battle.projectiles.filter((projectile) => {
      const source = [...battle.player, ...battle.enemy].find(
        (fighter) => fighter.fid === projectile.sourceFid,
      );
      if (projectile.impactAbilityId) {
        if (!source) return false;
        if (projectile.style === "syringe" && projectile.impactTargetFid) {
          const target = this.host
            .living(source.team)
            .find((ally) => ally.fid === projectile.impactTargetFid);
          if (!target) return false;
          const deltaX = target.x - projectile.x;
          const deltaY = target.y - projectile.y;
          const distance = Math.hypot(deltaX, deltaY);
          const travel = RUTICE_SYRINGE_SPEED * dt;
          if (distance <= travel) {
            projectile.x = target.x;
            projectile.y = target.y;
            this.resolveRemoteAoeImpact(
              source,
              projectile.impactAbilityId,
              projectile,
              {
                targetFid: projectile.impactTargetFid,
                multiplier: projectile.impactMultiplier,
              },
              this.projectileTrace(projectile),
            );
            return false;
          }
          projectile.velocityX = (deltaX / Math.max(distance, 0.001)) * RUTICE_SYRINGE_SPEED;
          projectile.velocityY = (deltaY / Math.max(distance, 0.001)) * RUTICE_SYRINGE_SPEED;
          projectile.x += projectile.velocityX * dt;
          projectile.y += projectile.velocityY * dt;
          projectile.remainingRange = Math.max(0, distance - travel);
          return true;
        }
        const startX = projectile.x;
        const startY = projectile.y;
        const stepX = projectile.velocityX * dt;
        const stepY = projectile.velocityY * dt;
        const traveled = Math.hypot(stepX, stepY);
        if (projectile.remainingRange <= traveled) {
          const impactProgress =
            projectile.remainingRange / Math.max(traveled, 0.001);
          projectile.x = startX + stepX * impactProgress;
          projectile.y = startY + stepY * impactProgress;
          this.resolveRemoteAoeImpact(
            source,
            projectile.impactAbilityId,
            projectile,
            {
              targetFid: projectile.impactTargetFid,
              multiplier: projectile.impactMultiplier,
            },
            this.projectileTrace(projectile),
          );
          return false;
        }
        projectile.x += stepX;
        projectile.y += stepY;
        projectile.remainingRange -= traveled;
        return true;
      }
      const targetTeam: Team =
        projectile.team === "player" ? "enemy" : "player";
      const targets = (
        projectile.style === "lollipop"
          ? projectile.grounded
            ? [...this.host.living("player"), ...this.host.living("enemy")]
            : []
          : this.host.living(targetTeam)
      ).sort((left, right) => left.fid.localeCompare(right.fid));
      if (projectile.style === "lollipop" && projectile.grounded) {
        const steppedOn = targets.find(
          (target) =>
            Math.hypot(target.x - projectile.x, target.y - projectile.y) <=
            target.radius + projectile.radius,
        );
        projectile.remainingRange -= dt;
        if (!steppedOn) return projectile.remainingRange > 0;
        if (source) {
          if (steppedOn.team === projectile.team) {
            this.host.heal(
              source,
              steppedOn,
              steppedOn.maxHp * TIANDOU_LOLLIPOP_HEAL_RATIO,
            );
            steppedOn.abilityMoveSpeed = Math.max(
              steppedOn.abilityMoveSpeed,
              TIANDOU_LOLLIPOP_MOVE_SPEED,
            );
            steppedOn.abilityMoveSpeedTime = Math.max(
              steppedOn.abilityMoveSpeedTime,
              TIANDOU_LOLLIPOP_MOVE_DURATION,
            );
            this.addEffect({
              kind: "heal",
              x: steppedOn.x,
              y: steppedOn.y,
              color: projectile.color,
              text: "🍭",
              emoji: true,
              life: 0.7,
              size: 16,
            });
          } else {
            const dealt = this.host.damage(
              source,
              steppedOn,
              projectile.damage,
              true,
              projectile.damageKind || "attack",
              this.projectileTrace(projectile),
            );
            if (dealt > 0) this.host.addDamageText(steppedOn, dealt);
            steppedOn.slowTime = Math.max(
              steppedOn.slowTime,
              TIANDOU_LOLLIPOP_SLOW_DURATION,
            );
            steppedOn.slowMultiplier = 0.55;
            this.addEffect({
              kind: "text",
              x: steppedOn.x,
              y: steppedOn.y - 38,
              color: projectile.color,
              text: "🍭减速",
              emoji: true,
              life: 0.7,
              size: 12,
            });
          }
        }
        this.addEffect({
          kind: "burst",
          x: projectile.x,
          y: projectile.y,
          color: projectile.color,
          life: 0.3,
          size: projectile.size * 5,
        });
        return false;
      }
      const startX = projectile.x;
      const startY = projectile.y;
      const endX = startX + projectile.velocityX * dt;
      const endY = startY + projectile.velocityY * dt;
      const stepX = endX - startX;
      const stepY = endY - startY;
      const stepLengthSquared = stepX * stepX + stepY * stepY || 1;
      const hit = targets.reduce<{ target: Fighter; progress: number } | null>(
        (best, target) => {
          const projection = Math.max(
            0,
            Math.min(
              1,
              ((target.x - startX) * stepX + (target.y - startY) * stepY) /
                stepLengthSquared,
            ),
          );
          const closestX = startX + stepX * projection;
          const closestY = startY + stepY * projection;
          const intersects =
            Math.hypot(target.x - closestX, target.y - closestY) <=
            target.radius + projectile.radius;
          return intersects && (!best || projection < best.progress)
            ? { target, progress: projection }
            : best;
        },
        null,
      );
      if (hit && source) {
        projectile.x = startX + stepX * hit.progress;
        projectile.y = startY + stepY * hit.progress;
        const { splashRadius } = projectile;
        const affected = splashRadius
          ? targets.filter(
              (target) =>
                Math.hypot(target.x - projectile.x, target.y - projectile.y) <=
                splashRadius + target.radius,
            )
          : [hit.target];
        affected.forEach((target) => {
          const damage =
            target === hit.target ? projectile.damage : projectile.damage * 0.7;
          const dealt = this.host.damage(
            source,
            target,
            damage,
            true,
            projectile.damageKind || "attack",
            this.projectileTrace(projectile),
          );
          if (dealt > 0) this.host.addDamageText(target, dealt);
          if (target.alive && projectile.burnPower > 0) {
            this.host.applyBurn(
              source,
              target,
              projectile.burnPower,
              projectile.damageKind || "attack",
            );
          }
          if (target.alive && projectile.stunDuration) {
            target.stun = Math.max(target.stun, projectile.stunDuration);
          }
          if (
            target === hit.target &&
            target.alive &&
            projectile.knockbackDistance
          ) {
            this.host.pushFighterAwayFrom(
              target,
              target.x - projectile.velocityX,
              target.y - projectile.velocityY,
              projectile.knockbackDistance,
              0.22,
            );
          }
        });
        this.addEffect({
          kind: "burst",
          x: projectile.x,
          y: projectile.y,
          color: projectile.color,
          life: 0.3,
          size: projectile.size * 5,
        });
        if (projectile.style === "laugh") {
          this.addEffect({
            kind: "emoji_burst",
            x: projectile.x,
            y: projectile.y,
            color: projectile.color,
            text: "😂",
            emoji: true,
            life: 0.62,
            size: 32,
          });
          if (this.host.retreatFrom(source, hit.target, 36, 0.2)) {
            this.addEffect({
              kind: "text",
              x: source.x,
              y: source.y - source.radius - 42,
              color: "#f4c7ff",
              text: "泥给路哒哟",
              life: 0.72,
              size: 12,
            });
          }
        }
        if (projectile.style === "badge") {
          this.addEffect({
            kind: "harei_badge",
            x: hit.target.x,
            y: hit.target.y,
            color: projectile.color,
            text: "75mm\n大吧唧",
            life: 0.68,
            size: 62,
          });
        }
        if (projectile.style === "pickaxe") {
          const impactY = hit.target.y - hit.target.radius * 0.72;
          this.addEffect({
            kind: "burst",
            x: hit.target.x,
            y: impactY,
            color: "#ffe08a",
            life: 0.38,
            size: 48,
          });
          this.addEffect({
            kind: "emoji_burst",
            x: hit.target.x,
            y: impactY,
            color: projectile.color,
            text: "⛏️",
            emoji: true,
            life: 0.72,
            size: 26,
          });
        }
        if (projectile.style === "cigarette") {
          this.addEffect({
            kind: "text",
            x: hit.target.x,
            y: hit.target.y - hit.target.radius - 20,
            color: "#ffc38a",
            text: "灼烧",
            life: 0.68,
            size: 11,
          });
        }
        return false;
      }
      projectile.x = endX;
      projectile.y = endY;
      const traveled = Math.hypot(stepX, stepY);
      if (
        projectile.style === "lollipop" &&
        projectile.remainingRange <= traveled
      ) {
        const landingProgress =
          projectile.remainingRange / Math.max(traveled, 0.001);
        projectile.x = startX + stepX * landingProgress;
        projectile.y = startY + stepY * landingProgress;
        projectile.velocityX = 0;
        projectile.velocityY = 0;
        projectile.grounded = true;
        projectile.remainingRange = TIANDOU_LOLLIPOP_GROUND_LIFETIME;
        return true;
      }
      projectile.remainingRange -= traveled;
      return (
        projectile.remainingRange > 0 &&
        projectile.x >= BATTLE_BOUNDS.left - 36 &&
        projectile.x <= BATTLE_BOUNDS.right + 36 &&
        projectile.y >= BATTLE_BOUNDS.top - 36 &&
        projectile.y <= BATTLE_BOUNDS.bottom + 36
      );
    });
  }
}
