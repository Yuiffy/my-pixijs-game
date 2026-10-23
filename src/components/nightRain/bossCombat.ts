import { bossCharacter } from './bossRoster';
import type { BossSkill, Enemy } from './types';

export type EnemyAttack = {
  name: string; windup: number; range: number; arc: number; damage: number;
  recovery: number; parryable: boolean; lunge: number; projectile?: boolean;
  jumpable?: boolean; support?: boolean; skill?: BossSkill; style?: 'thrust' | 'overhead' | 'sweep' | 'draw' | 'shot';
};
const strike = (name: string, changes: Partial<EnemyAttack> = {}): EnemyAttack => ({ name, windup: 1.1, range: 3, arc: 0.65, damage: 28, recovery: 1.3, parryable: true, lunge: 0.5, ...changes });
const spell = (name: string, skill: BossSkill, changes: Partial<EnemyAttack> = {}) => strike(name, { skill, style: 'shot', lunge: 0, parryable: false, jumpable: false, windup: 1.25, recovery: 2, ...changes });

/** Encounter difficulty belongs to the location, identity determines the verbs.
 * Ground effects deliberately have their own post-cast warning window. */
export function bossAttack(e: Enemy): EnemyAttack | null {
  const index = e.attackIndex % 3; const second = e.phase === 2;
  if (e.kind === 'bellkeeper') return [
    strike('余响 · 悬槌迟钟', { damage: 46, range: 3.7, windup: 1.7, recovery: 2.1, style: 'overhead', lunge: 0.7 }),
    strike('危 · 断声低扫', { damage: 38, range: 4.4, windup: 1.45, recovery: 2, style: 'sweep', arc: 2, parryable: false, jumpable: true, lunge: 0 }),
    spell('危 · 长夜连钟', 'resonance', { damage: second ? 34 : 29, range: 8.4, windup: 1.25, recovery: 5.4, style: 'overhead', jumpable: true }),
  ][index];
  switch (bossCharacter(e.kind)) {
    case 'chu2u': return [
      spell('羽啾 · 宇宙观测', 'starfall', { range: 10, damage: second ? 37 : 31, windup: 1.2, recovery: 2.3 }),
      spell('羽啾 · 烂梗三连', 'starcards', { range: 10, damage: 22, windup: 1.25, recovery: 4.6 }),
      strike('羽啾 · 星杖归位', { damage: 35, range: 3.8, windup: 1.65, recovery: 2.1, style: 'sweep', arc: 1.2 }),
    ][index];
    case 'harei': return [
      strike('花礼 · 迎客短拍', { damage: 22, range: 2.6, recovery: 1.5, style: 'sweep' }),
      strike('花礼 · 75mm 大吧唧', { damage: 26, range: 7, windup: 1.3, recovery: 1.8, projectile: true, lunge: 0, style: 'shot' }),
      spell('花礼 · 迎客松', 'pine', { range: 6, windup: 1.2, recovery: 1.8, damage: second ? 14 : 10 }),
    ][index];
    case 'nagisa': return [
      strike('米汀 · 双象交刃', { damage: 30, range: 3.1, style: 'sweep', arc: 1.1 }),
      spell('米汀 · 脑控潮盾', 'shield', { windup: 1.05, recovery: 2.8, range: 4, damage: 0, style: 'overhead' }),
      strike('米汀 · 断潮贯刺', { damage: 34, range: 3.8, arc: 0.4, windup: 1.4, recovery: 1.7, lunge: 1.1 }),
    ][index];
    case 'mizuki': return [
      strike('弥月 · 机巧点射', { damage: 20, range: 7.5, windup: 1.05, projectile: true, lunge: 0, style: 'shot' }),
      strike('弥月 · 退步枪托', { damage: 23, windup: 1.35, recovery: 1.6, range: 2.7, style: 'overhead' }),
      spell('弥月 · 机械兔耳浮游炮', 'drones', { range: 7.5, damage: second ? 13 : 10, recovery: 3.7 }),
    ][index];
    case 'shiori': return [
      strike('栞栞 · 栞铃拔刀', { damage: 29, windup: 1.35, range: 3.1, style: 'draw', lunge: 1 }),
      spell('危 · 海獭跃袭', 'leap', { damage: 34, range: 5, recovery: 2.1, windup: 1.1, style: 'overhead' }),
      strike('栞栞 · 低身回切', { damage: 30, windup: 1.25, range: 3.4, arc: 1.8, parryable: false, jumpable: true, style: 'sweep', recovery: 1.65 }),
    ][index];
    case 'rhea': return [
      strike('瑞娅 · 霜钟点雨', { damage: 33, windup: 1.05, range: 6, projectile: true, lunge: 0, style: 'shot' }),
      spell('瑞娅 · 北欧时停', 'freeze', { range: 5, damage: 0, recovery: 3.4, windup: 1.5, style: 'overhead' }),
      strike('瑞娅 · 碎钟迟落', { damage: 43, windup: 1.8, range: 3.5, recovery: 1.9, style: 'overhead' }),
    ][index];
    case 'nana': return [
      strike('七海 · 凿凿冲击', { damage: 36, range: 4, windup: 1.2, lunge: 1.8, arc: 0.45 }),
      spell('七海 · 亮镐反击架势', 'counter', { range: 4.4, damage: 18, recovery: 3, windup: 1, style: 'draw' }),
      strike('七海 · 破岩重凿', { damage: 46, windup: 2, range: 3.8, arc: 0.6, recovery: 2, lunge: 0.6, style: 'overhead' }),
    ][index];
    case 'azi': return [
      strike('阿梓 · 切分光音', { damage: 30, range: 7, windup: 1.1, projectile: true, lunge: 0, style: 'shot' }),
      spell('阿梓 · 终场歌唱', 'song', { range: 7, damage: second ? 19 : 15, windup: 1.5, recovery: 4 }),
      strike('阿梓 · 休止迟拍', { damage: 36, windup: 1.75, range: 3.2, recovery: 1.85, style: 'overhead' }),
    ][index];
    case 'yua': return [
      strike('悠亚 · 星杖穿云', { damage: 38, range: 3.7, lunge: 1.2, windup: 1.05 }),
      spell('危 · 外星贯穿光线', 'beam', { damage: 46, range: 10, recovery: 2.4, windup: 1.2 }),
      spell('悠亚 · 双星交错', 'crossbeam', { damage: 37, range: 8, recovery: 2.6, windup: 1.3 }),
    ][index];
    case 'sumi': return [
      strike('礼墨 · 退笔点名', { damage: 32, range: 6, projectile: true, lunge: 0, style: 'shot' }),
      spell('礼墨 · 空气龙', 'dragon', { damage: 38, range: 7, recovery: 3.1, windup: 1.2 }),
      strike('礼墨 · 显形落笔', { damage: 42, range: 3.8, windup: 1.85, recovery: 1.8, lunge: 0.8, style: 'overhead' }),
    ][index];
    case 'rutice': if (index === 2) return spell('危 · 墓灯震波', 'quake', { damage: 32, range: 5.2, windup: 1.5, recovery: 2.4, style: 'overhead', jumpable: true }); break;
    default: if (e.kind === 'sentinel' && index === 2) return spell('沐石 · 风息岩阵', 'gust', { damage: 30, range: 8, windup: 1.6, recovery: 2.6, style: 'overhead' });
  }
  return null;
}
