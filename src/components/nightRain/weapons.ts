import { ATTACKS, type AttackSpec } from './combat';
import type { AttackId, GameState } from './types';

export const WEAPONS = {
  umbrella: { name: '折雨伞', tier: 0, cost: 0, lightDamage: 0, heavyDamage: 0, posture: 1, range: 0, stamina: 0, guard: 1, color: '#ecd2ac', description: '来时的伞。均衡的轻击、蓄力与防御。' },
  ironUmbrella: { name: '铁骨伞', tier: 1, cost: 80, lightDamage: 6, heavyDamage: 12, posture: 1.2, range: 0.1, stamina: 2, guard: 0.8, color: '#b6e0de', description: '加固伞骨。破架更强，防御少耗两成体力，攻击稍重。' },
  katana: { name: '雨切武士刀', tier: 2, cost: 160, lightDamage: 12, heavyDamage: 20, posture: 1.05, range: 0.4, stamina: -3, guard: 1.15, color: '#cfeaff', description: '收伞为鞘，拔骨成刃。斩击更远、更省力，硬接攻击更吃力。' },
} as const;

export function weaponAttack(s: GameState, id: AttackId): AttackSpec {
  const base = ATTACKS[id]; const w = WEAPONS[s.weapon];
  const heavy = ['heavy', 'charged', 'sprintHeavy', 'airHeavy'].includes(id);
  return { ...base, damage: base.damage + (heavy ? w.heavyDamage : w.lightDamage), posture: base.posture * w.posture, range: base.range + w.range, cost: Math.max(1, base.cost + w.stamina), color: w.color };
}
