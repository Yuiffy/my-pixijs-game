/* eslint-disable implicit-arrow-linebreak, function-paren-newline */

import { UNIT_DEFS, abilityStatForStar, type UnitId } from "../gameData";
import { BATTLE_BOUNDS, mechanicalRabbitMuzzle } from "../battleGeometry";
import type {
  BattleEffect,
  BattleState,
  Fighter,
  GameState,
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
const PINE_TREE_LIFETIME = 7.5;
const PINE_TREE_RADIUS = 18;
const PINE_TREE_RANGE = 175;
const PINE_TREE_FIRE_INTERVAL = 0.52;
const PINE_TREE_DAMAGE_MULTIPLIER = 0.58;
const PINE_TREE_NEEDLE_SPEED = 520;
const PINE_TREE_NEEDLE_RANGE = 420;
const PINE_TREE_NEEDLE_RADIUS = 5;
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
const LIAN_FINALE_RADIUS = 140;
const LIAN_FINALE_STAGE_LIFETIME = 0.58;
const LIAN_FINALE_ENERGY_LIFETIME = 0.46;
const LIAN_FINALE_LINK_LIFETIME = 0.36;
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
};
const REMOTE_AOE_PROJECTILE_MIN_DURATION = 0.28;
const REMOTE_AOE_PROJECTILE_MAX_DURATION = 0.58;

export interface CombatProjectileHost {
  state(): GameState;
  living(team: Team): Fighter[];
  damage(
    source: Fighter,
    target: Fighter,
    amount: number,
    inactive?: boolean,
    damageKind?: DamageKind,
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
  addEnergy(fighter: Fighter, amount: number): void;
  nearestTarget(source: Fighter, targets: Fighter[]): Fighter | null;
  faceTowardX(fighter: Fighter, targetX: number): void;
  retreatFrom(
    source: Fighter,
    target: Fighter,
    distance: number,
    duration: number,
  ): boolean;
}

export class CombatProjectileSystem {
  constructor(private readonly host: CombatProjectileHost) {}

  private addEffect(effect: Omit<BattleEffect, "maxLife">) {
    this.host.state().battle?.effects.push({ ...effect, maxLife: effect.life });
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
      radius: source.unitId === "lian" ? 12 : 8,
      remainingRange: distance,
      damage: 0,
      burnPower: 0,
      color: UNIT_DEFS[source.unitId].accent,
      size: source.unitId === "lian" ? 18 : 9,
      style: source.unitId === "lian" ? "finale_star" : "aoe_orb",
      emoji: delivery.glyph,
      impactAbilityId: source.unitId,
    });
  }

  private resolveRemoteAoeImpact(
    source: Fighter,
    abilityId: UnitId,
    center: { x: number; y: number },
    support?: { targetFid?: string; multiplier?: number },
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
        const target = support?.targetFid
          ? allies.find((ally) => ally.fid === support.targetFid)
          : [...allies].sort(
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
          .forEach((target) => deal(target, 1.55));
        allies
          .filter(
            (ally) =>
              Math.hypot(ally.x - center.x, ally.y - center.y) <=
              LIAN_FINALE_RADIUS,
          )
          .forEach((ally) => {
            this.host.addEnergy(ally, 15);
            this.addEffect({
              kind: "line",
              x: center.x,
              y: center.y,
              x2: ally.x,
              y2: ally.y,
              color: "#f2c9ff",
              life: LIAN_FINALE_LINK_LIFETIME,
              size: 3,
            });
            this.addEffect({
              kind: "energy_pulse",
              x: ally.x,
              y: ally.y,
              color: def.accent,
              text: "+15 能量",
              life: LIAN_FINALE_ENERGY_LIFETIME,
              size: Math.max(48, ally.radius * 2.8),
            });
          });
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

  public summonPineTree(source: Fighter, targets: Fighter[]) {
    const { battle } = this.host.state();
    if (!battle) return;
    const def = UNIT_DEFS[source.unitId];
    const densest = targets.reduce(
      (best, candidate) => {
        const nearby = targets.filter(
          (other) =>
            Math.hypot(candidate.x - other.x, candidate.y - other.y) < 125,
        ).length;
        return nearby > best.nearby ? { target: candidate, nearby } : best;
      },
      { target: targets[0] as Fighter | undefined, nearby: 0 },
    ).target;
    const anchor = densest || this.host.nearestTarget(source, targets);
    const forward = source.team === "player" ? 1 : -1;
    const spawnX = anchor
      ? (source.x + anchor.x) * 0.5 + forward * 18
      : source.x + forward * 72;
    const spawnY = anchor ? (source.y + anchor.y) * 0.5 : source.y;
    const clampedX = Math.max(
      BATTLE_BOUNDS.left + PINE_TREE_RADIUS,
      Math.min(BATTLE_BOUNDS.right - PINE_TREE_RADIUS, spawnX),
    );
    const clampedY = Math.max(
      BATTLE_BOUNDS.top + PINE_TREE_RADIUS,
      Math.min(BATTLE_BOUNDS.bottom - PINE_TREE_RADIUS, spawnY),
    );
    battle.pineTreeSerial += 1;
    battle.pineTrees.push({
      id: `${source.fid}-pine-${battle.pineTreeSerial}`,
      ownerFid: source.fid,
      team: source.team,
      x: clampedX,
      y: clampedY,
      radius: PINE_TREE_RADIUS,
      life: PINE_TREE_LIFETIME,
      maxLife: PINE_TREE_LIFETIME,
      range: PINE_TREE_RANGE,
      fireTimer: 0.2,
      attackPulse: 0,
    });
    this.addEffect({
      kind: "text",
      x: clampedX,
      y: clampedY - 36,
      color: def.accent,
      text: "迎客松",
      life: 0.7,
      size: 12,
    });
  }

  public updatePineTreeTurrets(battle: BattleState, dt: number) {
    const fighters = [...battle.player, ...battle.enemy];
    battle.pineTrees = battle.pineTrees.filter((tree) => {
      const owner = fighters.find((fighter) => fighter.fid === tree.ownerFid);
      tree.life -= dt;
      tree.attackPulse = Math.max(0, tree.attackPulse - dt);
      if (!owner?.alive || tree.life <= 0) return false;

      const targetTeam: Team = tree.team === "player" ? "enemy" : "player";
      const target = this.host
        .living(targetTeam)
        .reduce<Fighter | null>((best, candidate) => {
          const distance = Math.hypot(
            candidate.x - tree.x,
            candidate.y - tree.y,
          );
          if (distance > tree.range) return best;
          if (!best) return candidate;
          return distance < Math.hypot(best.x - tree.x, best.y - tree.y)
            ? candidate
            : best;
        }, null);
      if (!target) return true;

      tree.fireTimer -= dt;
      if (tree.fireTimer > 0) return true;
      const deltaX = target.x - tree.x;
      const deltaY = target.y - tree.y;
      const distance = Math.hypot(deltaX, deltaY) || 1;
      battle.projectiles.push({
        sourceFid: owner.fid,
        team: tree.team,
        x: tree.x,
        y: tree.y - tree.radius * 0.35,
        velocityX: (deltaX / distance) * PINE_TREE_NEEDLE_SPEED,
        velocityY: (deltaY / distance) * PINE_TREE_NEEDLE_SPEED,
        radius: PINE_TREE_NEEDLE_RADIUS,
        remainingRange: PINE_TREE_NEEDLE_RANGE,
        damage: owner.attack * PINE_TREE_DAMAGE_MULTIPLIER,
        damageKind: "ability",
        burnPower: 0,
        color: "#7ecf8a",
        size: 3,
        style: "pine_needle",
      });
      tree.attackPulse = 0.18;
      tree.fireTimer = PINE_TREE_FIRE_INTERVAL;
      return true;
    });
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
        const target = [...this.host.living(source.team)].sort(
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
            );
            if (dealt > 0) this.host.addDamageText(steppedOn, dealt);
            steppedOn.slowTime = Math.max(
              steppedOn.slowTime,
              TIANDOU_LOLLIPOP_SLOW_DURATION,
            );
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
