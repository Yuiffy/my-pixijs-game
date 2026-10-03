import type { EnemyKind, Landmark, Obstacle, Surface, Vec3 } from './types';

export const DUNGEON_SURFACES: Surface[] = [
  { id: 'crypt-entry', name: '弃灯墓地 · 门厅', x1: 88, x2: 103, z1: 18, z2: 31, y: 0, color: '#6b7277' },
  { id: 'crypt-hall', name: '弃灯墓地 · 箭廊', x1: 94, x2: 99, z1: 30, z2: 44, y: 0, color: '#74767b' },
  { id: 'crypt-vault', name: '弃灯墓地 · 藏骨厅', x1: 83, x2: 110, z1: 43, z2: 57, y: 0, color: '#6a6e7c' },
  { id: 'crypt-loop', name: '弃灯墓地 · 绕行侧廊', x1: 83, x2: 88, z1: 28, z2: 44, y: 0, color: '#71717a' },
  { id: 'crypt-loop-back', name: '弃灯墓地 · 绕行侧廊', x1: 84, x2: 95, z1: 27, z2: 31, y: 0, color: '#71717a' },
  { id: 'crypt-last', name: '弃灯墓地 · 露缇守灯', x1: 92, x2: 111, z1: 56, z2: 76, y: 0, color: '#7c7178' },
  { id: 'cave-mouth', name: '风息洞窟 · 水边', x1: 91, x2: 108, z1: 92, z2: 105, y: 0, color: '#597976' },
  { id: 'cave-neck', name: '风息洞窟 · 石隙', x1: 97, x2: 104, z1: 104, z2: 120, y: 0, color: '#587e7a' },
  { id: 'cave-garden', name: '风息洞窟 · 晶苇支路', x1: 103, x2: 125, z1: 110, z2: 122, y: 0, color: '#62827b' },
  { id: 'cave-heart', name: '风息洞窟 · 沐石守望', x1: 87, x2: 113, z1: 119, z2: 148, y: 0, color: '#6b8982' },
];
export const DUNGEON_LANDMARKS: Landmark[] = [
  { id: 'crypt-entrance', kind: 'ferry', label: '进入弃灯墓地 · 旧寺地下', x: -33, y: 6, z: -23.5 },
  { id: 'crypt-exit', kind: 'ferry', label: '返回残钟雨寺', x: 95, y: 0, z: 20 },
  { id: 'crypt-lamp', kind: 'rest', label: '墓门雨灯', x: 91, y: 0, z: 24 },
  { id: 'crypt-note', kind: 'note', label: '读墓门刻文', x: 100, y: 0, z: 28 },
  { id: 'ossuary-mail', kind: 'cache', label: '收下藏骨轻甲', x: 85.5, y: 0, z: 38 },
  { id: 'grave-spear', kind: 'cache', label: '取下守灯长枪', x: 106, y: 0, z: 73 },
  { id: 'grave-seal', kind: 'charm', label: '收下刻名石印', x: 102, y: 0, z: 73 },
  { id: 'cave-entrance', kind: 'ferry', label: '进入风息洞窟 · 渡村石隙', x: -133, y: 2, z: -323 },
  { id: 'cave-exit', kind: 'ferry', label: '返回雾河渡村', x: 100, y: 0, z: 94 },
  { id: 'cave-lamp', kind: 'rest', label: '风息雨灯', x: 95, y: 0, z: 98 },
  { id: 'cave-note', kind: 'note', label: '读岩壁渡客信', x: 104, y: 0, z: 102 },
  { id: 'reed-cape', kind: 'cache', label: '拾起风苇披风', x: 122, y: 0, z: 116 },
  { id: 'cave-daggers', kind: 'cache', label: '收下双苇短刃', x: 120, y: 0, z: 120 },
  { id: 'stone-maul', kind: 'cache', label: '取下听岩巨槌', x: 104, y: 0, z: 145 },
  { id: 'tide-knot', kind: 'charm', label: '收下潮息结', x: 97, y: 0, z: 145 },
];
export const DUNGEON_PORTALS: Record<string, { destination: Vec3; chapter?: boolean }> = {
  'crypt-entrance': { destination: { x: 95, y: 0, z: 22 } },
  'crypt-exit': { destination: { x: -33, y: 6, z: -24.7 } },
  'cave-entrance': { destination: { x: 100, y: 0, z: 96 }, chapter: true },
  'cave-exit': { destination: { x: -133, y: 2, z: -324.5 } },
};
export const DUNGEON_BOSSES = ['crypt-colossus', 'cave-sentinel'];
export const DUNGEON_ENEMIES: (Vec3 & { id: string; kind: EnemyKind; name: string; facing: number })[] = [
  { id: 'crypt-blade', kind: 'duelist', name: '墓门试刃客', x: 100, y: 0, z: 29, facing: Math.PI },
  { id: 'crypt-bow', kind: 'duelist', name: '骨廊守弩人', x: 96, y: 0, z: 49, facing: Math.PI },
  { id: 'crypt-shield', kind: 'guard', name: '藏骨持盾人', x: 104, y: 0, z: 50, facing: Math.PI },
  { id: 'crypt-colossus', kind: 'colossus', name: '露缇 · 藏骨巨像', x: 101, y: 0, z: 65, facing: Math.PI },
  { id: 'cave-pike', kind: 'lancer', name: '石隙执枪客', x: 100, y: 0, z: 113, facing: Math.PI },
  { id: 'cave-slinger', kind: 'monk', name: '晶苇投石人', x: 116, y: 0, z: 115, facing: -Math.PI / 2 },
  { id: 'cave-hulk', kind: 'guard', name: '岩苔巨躯', x: 91, y: 0, z: 125, facing: Math.PI },
  { id: 'cave-sentinel', kind: 'sentinel', name: '沐石 · 风息守望', x: 100, y: 0, z: 136, facing: Math.PI },
];
export const DUNGEON_OBSTACLES: Obstacle[] = [
  { x: 91, y: 0, z: 24, w: 0.9, d: 0.9, h: 2.5, kind: 'shrine', landmarkId: 'crypt-lamp' },
  { x: 95, y: 0, z: 98, w: 0.9, d: 0.9, h: 2.5, kind: 'shrine', landmarkId: 'cave-lamp' },
  ...[[94.7, 46], [99.7, 46], [89.5, 49], [106, 54]].map(([x, z]) => ({ x, z, y: 0, w: 1.1, d: 1.1, h: 3.7, kind: 'pillar' as const })),
  ...[[98, 108], [103.8, 117], [94, 131], [108, 127]].map(([x, z]) => ({ x, z, y: 0, w: 1.5, d: 1.7, h: 2.7, kind: 'pillar' as const })),
];
export const DUNGEON_REST_POINTS = { 'crypt-lamp': { x: 92.3, y: 0, z: 24 }, 'cave-lamp': { x: 96.3, y: 0, z: 98 } };
export function giantScale(id: string) { return id === 'crypt-colossus' ? 2.5 : id === 'cave-sentinel' ? 3.25 : id === 'cave-hulk' ? 1.65 : 1; }
