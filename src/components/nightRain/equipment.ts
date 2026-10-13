import type { GameState } from './types';

export type Equipment = { armor: 'traveler' | 'ossuaryMail' | 'reedCape'; talisman: 'none' | 'goldBell' | 'graveSeal' | 'tideKnot' | 'pineBadge' | 'droneCore' | 'frostClock' | 'songScore' };
export const ARMORS = {
  traveler: { name: '旅人便衣', item: '', defense: 1, dodgeCost: 0, color: '#b4c5c4', description: '轻便的旅行行装。' },
  ossuaryMail: { name: '藏骨轻甲', item: 'ossuary-mail', defense: 0.84, dodgeCost: 4, color: '#9b9baa', description: '受伤减少 16%；闪避多耗 4 体力。墓地绕行侧廊的遗物。' },
  reedCape: { name: '风苇披风', item: 'reed-cape', defense: 0.96, dodgeCost: -3, color: '#679d88', description: '闪避少耗 3 体力；受伤减少 4%。洞窟晶苇支路的遗物。' },
} as const;
export const TALISMANS = {
  pineBadge: { name: '花礼 · 迎客松吧唧', item: 'food', description: '花礼把吧唧留在第一份夜宵旁。站定且不出招时，每秒额外恢复 14 体力；移动和防御时不生效。' },
  droneCore: { name: '弥月 · 兔耳回路', item: 'frog-cache', description: '工坊零件匣中的试作回路。成功弹反飞行弹体时，对发射者额外造成 8 伤害和 12 架势。' },
  frostClock: { name: '瑞娅 · 停针钟饰', item: 'chapter-bell', description: '归夜钟留下的一枚停针。成功弹反后，敌人的收招时间延长 0.4 秒。' },
  songScore: { name: '阿梓 · 终场曲谱', item: 'monastery-cache', description: '留给走完百阶的听众。成功处决后恢复 18 生命；不补充药瓶。' },
  none: { name: '不佩戴', item: '', description: '空出的护符位置。' },
  goldBell: { name: '金铃护符', item: 'roof-charm', description: '每瓶椰露恢复量 +20。' },
  graveSeal: { name: '刻名石印', item: 'grave-seal', description: '最大生命 +20。露缇守护着被遗忘的名字。' },
  tideKnot: { name: '潮息结', item: 'tide-knot', description: '最大体力 +18。沐石留下的渡客绳结。' },
} as const;
export function equipArmor(s: GameState, id: Equipment['armor']) {
  if (!Object.hasOwn(ARMORS, id) || (ARMORS[id].item && !s.collected.includes(ARMORS[id].item))) return false;
  s.gear.armor = id; return true;
}
export function equipTalisman(s: GameState, id: Equipment['talisman']) {
  if (!Object.hasOwn(TALISMANS, id) || (TALISMANS[id].item && !s.collected.includes(TALISMANS[id].item))) return false;
  s.gear.talisman = id; s.player.hp = Math.min(s.player.hp, 100 + s.level * 12 + (id === 'graveSeal' ? 20 : 0));
  s.player.stamina = Math.min(s.player.stamina, 100 + s.level * 5 + (id === 'tideKnot' ? 18 : 0) + (s.haven.ending === 'remember' ? 15 : 0)); return true;
}
export function validEquipment(s: GameState) {
  return !!s.gear && Object.hasOwn(ARMORS, s.gear.armor) && Object.hasOwn(TALISMANS, s.gear.talisman) && (!ARMORS[s.gear.armor].item || s.collected.includes(ARMORS[s.gear.armor].item)) && (!TALISMANS[s.gear.talisman].item || s.collected.includes(TALISMANS[s.gear.talisman].item));
}
