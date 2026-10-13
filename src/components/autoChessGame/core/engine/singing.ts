import { TRAITS, UNIT_DEFS } from "../gameData";
import type { BattleEffect, BattleState, Fighter } from "../gameTypes";

interface SingingHost {
  heal: (source: Fighter, target: Fighter, amount: number) => number;
  grantAbilityShield: (source: Fighter, target: Fighter, amount: number, duration: number, battle: BattleState) => number;
  addEffect: (effect: Omit<BattleEffect, "maxLife">) => void;
}

// Skill releases provide voices; ongoing pulses/projectiles never add extra ones.
export function contributeSinging(battle: BattleState, source: Fighter, host: SingingHost) {
  const song = battle.singing[source.team];
  if (!song.level || !source.alive || source.hp <= 0 || source.mindControlTime > 0
    || !UNIT_DEFS[source.unitId].traits.includes("singer") || battle.elapsed < song.readyAt) return;
  if (battle.elapsed >= song.expiresAt) song.voices = [];
  const living = battle[source.team].filter((fighter) => fighter.alive && fighter.hp > 0);
  const available = new Set(living.filter((fighter) => fighter.mindControlTime <= 0).map((fighter) => fighter.unitId));
  song.voices = song.voices.filter((id) => available.has(id));
  if (song.voices.includes(source.unitId)) return;
  if (!song.voices.length) song.expiresAt = battle.elapsed + 6;
  song.voices.push(source.unitId);
  const required = [0, 2, 3, 4][song.level];
  host.addEffect({ kind: "text", x: source.x, y: source.y - 48, color: TRAITS.singer.color, text: `♪ 轮唱 ${song.voices.length}/${required}`, life: 0.7, size: 11 });
  if (song.voices.length < required) return;
  song.voices = [];
  song.expiresAt = 0;
  song.readyAt = battle.elapsed + 4;
  song.choruses += 1;
  const patients = living.filter((fighter) => fighter.hp < fighter.maxHp && fighter.mindControlTime <= 0)
    .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp).slice(0, song.level === 3 ? 2 : 1);
  for (const target of patients) host.heal(source, target, target.maxHp * [0, 0.04, 0.06, 0.08][song.level]);
  if (song.level >= 2) for (const singer of living.filter((fighter) => UNIT_DEFS[fighter.unitId].traits.includes("singer") && fighter.mindControlTime <= 0)) {
    host.grantAbilityShield(source, singer, singer.maxHp * [0, 0, 0.04, 0.06][song.level], Math.max(3, singer.abilityShieldTime), battle);
  }
  host.addEffect({ kind: "energy_pulse", x: source.x, y: source.y, color: TRAITS.singer.color, life: 0.65, size: 100 });
  host.addEffect({ kind: "text", x: source.x, y: source.y - 62, color: TRAITS.singer.color, text: "♫ 和声", life: 0.9, size: 15 });
}
