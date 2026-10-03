import { ATTACKS, type AttackSpec } from './combat';
import type { AttackId, GameState } from './types';

export const WEAPONS = {
  umbrella: { name: '折雨伞', tier: 0, cost: 0, lightDamage: 0, heavyDamage: 0, posture: 1, range: 0, stamina: 0, guard: 1, color: '#ecd2ac', description: '来时的伞。均衡的轻击、蓄力与防御。' },
  ironUmbrella: { name: '铁骨伞', tier: 1, cost: 80, lightDamage: 6, heavyDamage: 12, posture: 1.2, range: 0.1, stamina: 2, guard: 0.8, color: '#b6e0de', description: '加固伞骨。破架更强，防御少耗两成体力，攻击稍重。' },
  katana: { name: '雨切武士刀', tier: 2, cost: 160, lightDamage: 12, heavyDamage: 20, posture: 1.05, range: 0.4, stamina: -3, guard: 1.15, color: '#cfeaff', description: '收伞为鞘，拔骨成刃。斩击更远、更省力，硬接攻击更吃力。' },
  graveSpear: { name: '守灯长枪', item: 'grave-spear', tier: 0, cost: 0, lightDamage: 8, heavyDamage: 13, posture: 0.95, range: 1.15, stamina: 3, guard: 1.08, color: '#d0b3ff', description: '露缇的墓地遗物。长距离窄角直刺，起手稍慢；贴身容易打空。' },
  reedDaggers: { name: '双苇短刃', item: 'cave-daggers', tier: 0, cost: 0, lightDamage: -2, heavyDamage: 1, posture: 0.65, range: -0.6, stamina: -6, guard: 1.3, color: '#a4e7cf', description: '晶苇支路遗物。贴身快切、省体力，破架与防御偏弱。' },
  stoneMaul: { name: '听岩巨槌', item: 'stone-maul', tier: 0, cost: 0, lightDamage: 15, heavyDamage: 26, posture: 1.3, range: 0.55, stamina: 9, guard: 0.9, color: '#f1d48e', description: '沐石的岩窟遗物。慢而重，转向困难；适合收招窗口，不能无限压制首领。' },
} as const;

export function weaponAttack(s: GameState, id: AttackId): AttackSpec {
  const base = ATTACKS[id]; const w = WEAPONS[s.weapon];
  const heavy = ['heavy', 'charged', 'sprintHeavy', 'airHeavy'].includes(id);
  const speed = s.weapon === 'reedDaggers' ? 0.8 : s.weapon === 'stoneMaul' ? 1.3 : s.weapon === 'graveSpear' ? 1.1 : 1;
  return { ...base, impact: base.impact * speed, active: base.active * speed, duration: base.duration * speed, cancel: base.cancel * speed, arc: s.weapon === 'graveSpear' ? Math.min(base.arc, 0.48) : base.arc, turn: s.weapon === 'stoneMaul' ? base.turn * 0.65 : base.turn, damage: base.damage + (heavy ? w.heavyDamage : w.lightDamage), posture: base.posture * w.posture, range: base.range + w.range, cost: Math.max(1, base.cost + w.stamina), color: w.color };
}

export function weaponUnlocked(s: GameState, id: GameState['weapon']) { const w = WEAPONS[id]; return 'item' in w ? s.collected.includes(w.item) : w.tier <= s.weaponLevel; }
