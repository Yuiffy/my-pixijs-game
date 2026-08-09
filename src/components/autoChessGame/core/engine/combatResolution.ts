import {
  UNIT_DEFS,
  abilityStatForStar,
  type AugmentId,
} from "../gameData";
import type {
  BattleEffect,
  BattleState,
  Fighter,
  GameState,
  ProjectileVolleyShot,
} from "../gameTypes";
import type { RandomSource } from "./random";
import { STARTER_EFFECTS } from "./runRules";

const ZEYIN_REBIRTH_HP_RATIO = 20 / 11;
const ZEYIN_REBIRTH_ATTACK_MULTIPLIER = 1.36;
const ZEYIN_REBIRTH_ATTACK_INTERVAL_MULTIPLIER = 0.7;
const ZEYIN_REBIRTH_RANGE = 245;
const ZEYIN_REBIRTH_RECOIL_WINDOW = 4;
const NANA_PICKAXE_COUNTER_DAMAGE = 0.46;
const NANA_PICKAXE_COUNTER_STUN = 0.24;
const NANA_PICKAXE_COUNTER_SPEED = 320;
const SUN_GUARD_MANQU_DODGE = 0.2;
const GALE_ARCHER_SWITCH_STUN = 0.5;
const GALE_ARCHER_SWITCH_COLOR = "#b86cff";

export type DamageKind = "attack" | "ability";

interface CombatResolutionHost {
  state: () => GameState;
  rng: () => RandomSource;
  augmentStacks: (id: AugmentId) => number;
  addEffect: (effect: Omit<BattleEffect, "maxLife">) => void;
  markFightersEngaged: (source: Fighter, target: Fighter) => void;
  fireFixedProjectile: (
    source: Fighter,
    target: Fighter,
    shot: ProjectileVolleyShot,
  ) => void;
  prepareVanguardJump: (
    fighter: Fighter,
    source: Fighter,
    battle: BattleState,
  ) => void;
  transferTowerHack: (source: Fighter) => void;
  addGluttonyStack: (fighter: Fighter, label: string) => boolean;
}

export class CombatResolutionSystem {
  constructor(private readonly host: CombatResolutionHost) {}

  public absorbDamageWithShields(target: Fighter, amount: number, damageKind: DamageKind) {
    let remaining = amount;
    let absorbed = 0;
    if (damageKind === "ability" && target.abilityShield > 0) {
      const abilityAbsorbed = Math.min(target.abilityShield, remaining);
      target.abilityShield -= abilityAbsorbed;
      remaining -= abilityAbsorbed;
      absorbed += abilityAbsorbed;
      if (target.abilityShield <= 0) {
        target.abilityShield = 0;
        target.abilityShieldPeak = 0;
        target.abilityShieldTime = 0;
        this.host.addEffect({ kind: "text", x: target.x, y: target.y - 44, color: "#ddb6ff", text: "术盾破", life: 0.48, size: 10 });
      }
    }
    const hadShield = target.shield > 0;
    if (target.shield > 0 && remaining > 0) {
      const shieldAbsorbed = Math.min(target.shield, remaining);
      target.shield -= shieldAbsorbed;
      remaining -= shieldAbsorbed;
      absorbed += shieldAbsorbed;
    }
    const shieldBroken = hadShield && target.shield <= 0;
    if (shieldBroken) {
      target.shield = 0;
      target.shieldPeak = 0;
    }
    return { remaining, absorbed };
  }

  public damage(
    source: Fighter,
    target: Fighter,
    rawAmount: number,
    allowInactiveSource = false,
    damageKind: DamageKind = "attack",
  ) {
    if ((!source.alive && !allowInactiveSource) || !target.alive) return 0;
    this.host.markFightersEngaged(source, target);
    const effectiveDodge =
      target.dodgeChance +
      (target.danceDashTime > 0 ? target.danceDashDodge : 0) +
      (target.manquTime > 0
        ? abilityStatForStar(
          UNIT_DEFS.sun_guard,
          target.star,
          "dodge",
          SUN_GUARD_MANQU_DODGE,
        )
        : 0);
    const dodged = effectiveDodge > 0 && this.host.rng().next() < effectiveDodge;
    if (dodged) {
      this.host.addEffect({ kind: "text", x: target.x, y: target.y - 38, color: "#d9e6f4", text: "闪避", life: 0.55, size: 12 });
      return -1;
    }
    let amount = rawAmount * (source.weakenTime > 0 ? 0.72 : 1);
    if (
      target.unitId === "komichi" &&
      target.komichiSignTime > 0 &&
      source.attackType === "ranged"
    ) {
      const reduction = abilityStatForStar(
        UNIT_DEFS.komichi,
        target.star,
        "rangedReduction",
        0.28,
      );
      amount *= 1 - reduction;
      this.host.addEffect({
        kind: "text",
        x: target.x,
        y: target.y - 42,
        color: UNIT_DEFS.komichi.accent,
        text: "路牌格挡",
        life: 0.42,
        size: 10,
      });
    }
    if (
      source.team === "player" &&
      source.lowHealthBonus > 0 &&
      target.hp / target.maxHp < 0.5
    ) {
      amount *= 1 + source.lowHealthBonus;
    }
    if (
      source.team === "player" &&
      this.host.augmentStacks("execution") > 0 &&
      target.hp / target.maxHp < 0.45
    ) amount *= 1 + this.host.augmentStacks("execution") * 0.5;
    if (
      source.team === "player" &&
      source.critChance > 0 &&
      this.host.rng().next() < source.critChance
    ) {
      amount *= source.critMultiplier;
      this.host.addEffect({
        kind: "text",
        x: target.x,
        y: target.y - 45,
        color: "#ffd86b",
        text: "暴击",
        life: 0.48,
        size: 11,
      });
    }
    amount *= 100 / (100 + Math.max(-50, target.armor));
    const { remaining, absorbed } = this.absorbDamageWithShields(target, amount, damageKind);
    const hpLoss = Math.min(target.hp, remaining);
    target.hp -= hpLoss;
    const effectiveApplied = absorbed + hpLoss;
    source.damageDealt += effectiveApplied;
    target.damageTaken += effectiveApplied;
    // 任意有效命中都记受击（含仅打盾），供自保技能「受击释放」判定
    if (effectiveApplied > 0) target.hitPulse = 0.2;
    if (
      effectiveApplied > 0 &&
      damageKind === "attack" &&
      target.unitId === "gale_archer" &&
      target.raccoonSwitchTime > 0 &&
      source.alive &&
      source.team !== target.team &&
      !target.raccoonStunnedAttackers.includes(source.fid)
    ) {
      target.raccoonStunnedAttackers.push(source.fid);
      source.stun = Math.max(source.stun, GALE_ARCHER_SWITCH_STUN);
      this.host.addEffect({
        kind: "switch_shock",
        x: target.x,
        y: target.y,
        x2: source.x,
        y2: source.y,
        color: GALE_ARCHER_SWITCH_COLOR,
        life: 0.42,
        size: 4,
      });
      this.host.addEffect({
        kind: "text",
        x: source.x,
        y: source.y - 42,
        color: "#ead3ff",
        text: "反震",
        life: 0.55,
        size: 11,
      });
    }
    if (
      effectiveApplied > 0 &&
      target.hp > 0 &&
      target.unitId === "grove_mender" &&
      target.barrageActive &&
      source.alive &&
      source.team !== target.team
    ) {
      this.host.fireFixedProjectile(target, source, {
        sourceFid: target.fid,
        targetFid: source.fid,
        delay: 0,
        damage: target.attack * NANA_PICKAXE_COUNTER_DAMAGE,
        damageKind: "ability",
        burnPower: 0,
        speed: NANA_PICKAXE_COUNTER_SPEED,
        color: UNIT_DEFS.grove_mender.accent,
        size: 18,
        emoji: "⛏️",
        style: "pickaxe",
        stunDuration: NANA_PICKAXE_COUNTER_STUN,
      });
    }

    if (
      target.vanguardMember &&
      target.vanguardKnockback > 0 &&
      target.vanguardJumpCooldown <= 0 &&
      !target.abilityMotion &&
      target.danceDashTime <= 0 &&
      target.jumpTime <= 0 &&
      target.alive &&
      effectiveApplied > 0
    ) {
      const { battle } = this.host.state();
      if (battle) this.host.prepareVanguardJump(target, source, battle);
    }
    const lifesteal = source.lifesteal + (source.abilityLifestealTime > 0 ? source.abilityLifesteal : 0);
    if (lifesteal > 0) this.heal(source, source, hpLoss * lifesteal, false);

    if (
      target.team === "player" &&
      this.host.augmentStacks("second_wind") > 0 &&
      !target.secondWindUsed &&
      target.hp > 0 &&
      target.hp / target.maxHp < 0.3
    ) {
      target.secondWindUsed = true;
      this.heal(
        target,
        target,
        target.maxHp * 0.18 * this.host.augmentStacks("second_wind"),
      );
    }

    if (target.hp <= 0) {
      const permanentlyKilled = this.killFighter(target, source);
      if (permanentlyKilled && source.team === "player") this.host.state().score += 12;
    }
    return effectiveApplied;
  }

  public applyBurn(
    source: Fighter,
    target: Fighter,
    totalDamage: number,
    damageKind: DamageKind = "attack",
  ) {
    if (!target.alive) return;
    const starterMultiplier =
      source.team === "player" ? STARTER_EFFECTS[this.host.state().starter || "bastion"].burnMultiplier || 1 : 1;
    const dps = (totalDamage * starterMultiplier) / 3;
    if (dps >= target.burnDps) {
      target.burnDps = dps;
      target.burnSourceFid = source.fid;
      target.burnDamageKind = damageKind;
    }
    target.burnTime = 3;
  }

  public grantShield(
    source: Fighter | null,
    target: Fighter,
    amount: number,
    capRatio = 0.55,
    battle = this.host.state().battle,
  ) {
    if (!target.alive || amount <= 0) return 0;
    const starterMultiplier =
      target.team === "player" ? STARTER_EFFECTS[this.host.state().starter || "bastion"].shieldMultiplier || 1 : 1;
    if (target.shield <= 0) target.shieldPeak = 0;
    const before = target.shield;
    target.shield = Math.min(
      target.maxHp * capRatio * starterMultiplier,
      target.shield + amount * starterMultiplier,
    );
    target.shieldPeak = Math.max(target.shieldPeak, target.shield);
    const granted = target.shield - before;
    if (source && battle) source.shieldingDone += granted;
    return granted;
  }

  public grantAbilityShield(
    source: Fighter | null,
    target: Fighter,
    amount: number,
    duration: number,
    battle = this.host.state().battle,
  ) {
    if (!target.alive || amount <= 0 || duration <= 0) return 0;
    const starterMultiplier =
      target.team === "player" ? STARTER_EFFECTS[this.host.state().starter || "bastion"].shieldMultiplier || 1 : 1;
    const adjusted = amount * starterMultiplier;
    const before = target.abilityShield;
    target.abilityShield = Math.max(target.abilityShield, adjusted);
    target.abilityShieldPeak = Math.max(target.abilityShieldPeak, target.abilityShield);
    target.abilityShieldTime = duration;
    const granted = target.abilityShield - before;
    if (source && battle) source.shieldingDone += granted;
    return granted;
  }

  public heal(
    source: Fighter | null,
    target: Fighter,
    amount: number,
    showEffect = true,
  ) {
    if (!target.alive || amount <= 0) return 0;
    const before = target.hp;
    target.hp = Math.min(target.maxHp, target.hp + amount);
    const healed = target.hp - before;
    if (source) source.healingDone += healed;
    if (showEffect && healed > 1) {
      this.host.addEffect({
        kind: "heal",
        x: target.x,
        y: target.y,
        color: "#74f0ac",
        text: `+${Math.round(healed)}`,
        life: 0.75,
        size: 15,
      });
    }
    return healed;
  }

  public addDamageText(target: Fighter, amount: number) {
    this.host.addEffect({
      kind: "text",
      x: target.x,
      y: target.y - 28,
      color: "#ffffff",
      text: `${Math.max(1, Math.round(amount))}`,
      life: 0.55,
      size: 14,
    });
  }

  public killFighter(target: Fighter, source?: Fighter) {
    if (!target.alive) return false;
    if (target.unitId === "zeyin" && !target.reborn) {
      target.reborn = true;
      target.alive = true;
      target.maxHp = Math.max(1, Math.round(target.maxHp * ZEYIN_REBIRTH_HP_RATIO));
      target.hp = target.maxHp;
      target.shield = 0;
      target.shieldPeak = 0;
      target.burnTime = 0;
      target.burnDps = 0;
      target.burnSourceFid = null;
      target.burnDamageKind = "attack";
      target.stun = 0;
      target.tauntTime = 0;
      target.tauntedByFid = null;
      target.slowTime = 0;
      target.slowMultiplier = 1;
      target.weakenTime = 0;
      if (target.weakenArmorPenalty > 0) {
        target.armor += target.weakenArmorPenalty;
        target.weakenArmorPenalty = 0;
      }
      target.baseAttack *= ZEYIN_REBIRTH_ATTACK_MULTIPLIER;
      target.attack = target.baseAttack;
      target.baseAttackInterval *= ZEYIN_REBIRTH_ATTACK_INTERVAL_MULTIPLIER;
      target.attackInterval = target.baseAttackInterval;
      target.baseRange = ZEYIN_REBIRTH_RANGE;
      target.range = ZEYIN_REBIRTH_RANGE;
      target.attackType = "ranged";
      target.energy = 0;
      target.cooldown = 0.2;
      target.abilityMotion = null;
      target.targetFid = null;
      target.targetLock = 0;
      target.rebirthRecoilTime = ZEYIN_REBIRTH_RECOIL_WINDOW;
      this.host.addEffect({
        kind: "rebirth",
        x: target.x,
        y: target.y,
        color: UNIT_DEFS.zeyin.accent,
        life: 1.1,
        size: 78,
      });
      this.host.addEffect({ kind: "text", x: target.x, y: target.y - 46, color: UNIT_DEFS.zeyin.accent, text: "涅槃重生", life: 0.95, size: 14 });
      return false;
    }
    if (target.unitId === "tower_god") this.host.transferTowerHack(target);
    const { battle } = this.host.state();
    if (battle) {
      [...battle.player, ...battle.enemy].forEach((fighter) => {
        if (fighter.fid === target.fid || fighter.channelTargetFid === target.fid) {
          fighter.channelTargetFid = null;
          fighter.channelTime = 0;
          fighter.channelPulseTimer = 0;
        }
      });
      if (!target.reiRevival) {
        battle.corpses.push({
          id: `corpse-${target.fid}`,
          fighter: target,
          x: target.x,
          y: target.y,
          consumed: false,
        });
      }
    }
    if (source?.alive && source.team !== target.team) this.host.addGluttonyStack(source, "击杀");
    if (target.abilityArmorBonus > 0) {
      target.armor -= target.abilityArmorBonus;
      target.abilityArmorBonus = 0;
    }
    target.barrageActive = false;
    target.barrageDrainPerSecond = 0;
    target.alive = false;
    target.hp = 0;
    target.shield = 0;
    target.shieldPeak = 0;
    target.abilityShield = 0;
    target.abilityShieldPeak = 0;
    target.abilityShieldTime = 0;
    target.abilityMotion = null;
    this.host.addEffect({
      kind: "burst",
      x: target.x,
      y: target.y,
      color: UNIT_DEFS[target.unitId].accent,
      life: 0.7,
      size: 58,
    });
    return true;
  }

}
