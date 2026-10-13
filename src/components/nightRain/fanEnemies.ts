import type { Enemy } from './types';
import type { EnemyAttack } from './bossCombat';

export type Fan = 'biscuit' | 'otter' | 'shark' | 'rabbit' | 'frog';
export const FAN_ENEMIES: Record<string, { fan: Fan; name: string; previous: string }> = {
  'courtyard-prowler': { fan: 'biscuit', name: '饼头人 · 雨巷巡夜', previous: '雨巷游荡者' },
  'alley-guard': { fan: 'biscuit', name: '饼干岁 · 护食盾卫', previous: '守巷棍客' },
  'harbor-prowler': { fan: 'rabbit', name: '机巧兔 · 工坊搬运', previous: '提灯收网人' },
  'net-duelist': { fan: 'rabbit', name: '机巧兔 · 试作护卫', previous: '晒网刀客' },
  'elephant-lancer': { fan: 'otter', name: '獭獭栞 · 门前冲锋', previous: '象门长枪卫' },
  'wall-guard': { fan: 'otter', name: '獭獭栞 · 护印卫', previous: '西垛守夜人' },
  'salt-guard': { fan: 'shark', name: '脆鲨 · 方块仓卫', previous: '盐市守仓人' },
  'mill-bank-reaver': { fan: 'shark', name: '脆鲨 · 建造巡逻', previous: '水车收网客' },
  'mill-lancer': { fan: 'shark', name: '脆鲨 · 镐庭门卫', previous: '沉舟守院人' },
  'monastery-monk': { fan: 'frog', name: '蛙蛙 · 歌庭听众', previous: '山寺迎客僧' },
  'monastery-lancer': { fan: 'frog', name: '蛙蛙 · 百阶引座', previous: '百阶执枪僧' },
};
export const fanOf = (e: Pick<Enemy, 'id'>) => FAN_ENEMIES[e.id]?.fan;
export const FAN_COLORS: Record<Fan, string> = { biscuit: '#d1a267', otter: '#99826e', shark: '#6fa8bf', rabbit: '#b4a3ce', frog: '#9cad65' };
export const FAN_TIPS: Record<Fan, string> = {
  biscuit: '饼头人把饼盾举过头时，会给附近同伴补给。用重击打崩架势，或趁它分饼时绕到侧后。',
  otter: '獭獭栞先压低身体，再沿直线滑冲。冲锋只覆盖窄道，向侧面让开后反击长收招。',
  shark: '脆鲨用施工镐守着七海的方块庭院。高举镐时稍等半拍，落地后有较长空档。',
  rabbit: '弥月工坊的机巧兔先抬起兔耳瞄准，随后射出可见弹体。侧移或借掩体接近。',
  frog: '歌庭听众用低位扫杆保护阿梓的唱段。扫杆可跳过；直刺需要侧移或弹反。',
};

export function fanAttack(e: Enemy): EnemyAttack | null {
  const fan = fanOf(e); const index = e.attackIndex % 3;
  const base: EnemyAttack = { name: '巡夜挥击', damage: 20, windup: 1.1, recovery: 1.25, range: 2.6, arc: 0.8, lunge: 0.4, parryable: true };
  if (fan === 'biscuit' && index === 1) return { ...base, name: '分饼 · 同伴补给', damage: 0, windup: 1.5, recovery: 1.6, range: 3.5, lunge: 0, support: true, style: 'overhead' };
  if (fan === 'otter' && index === 2) return { ...base, name: '獭獭滑冲', windup: 1.2, range: 4.3, arc: 0.35, lunge: 2.1, recovery: 1.9, style: 'thrust', damage: 25 };
  if (fan === 'shark' && index === 1) return { ...base, name: '脆鲨 · 方块重凿', windup: 1.85, recovery: 1.75, range: 3.2, damage: 30, style: 'overhead' };
  if (fan === 'rabbit' && index !== 2) return { ...base, name: '机巧兔 · 试作点射', range: 7, windup: 1.35, projectile: true, lunge: 0, style: 'shot', damage: 17 };
  if (fan === 'frog' && index === 2) return { ...base, name: '蛙蛙 · 低杆扫席', range: 3.2, arc: 2, parryable: false, jumpable: true, style: 'sweep' };
  return null;
}
