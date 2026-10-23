import type { EnemyKind, GameState, Landmark, Obstacle, Surface, Vec3 } from './types';
import type { Solid } from './architecture';

// Fourth continuous chapter: descend below the destination, then return above it.
export const BELL_SURFACES: Surface[] = [
  { id: 'bell-descent', name: '垂星长阶', x1: -48, x2: -40, z1: -754, z2: -730, y: 28, endY: 40, color: '#b8aa95' },
  { id: 'bell-porch', name: '沉钟眺台', x1: -60, x2: -28, z1: -774, z2: -754, y: 28, color: '#9aa99e' },
  { id: 'bell-west-link', name: '守钟西廊', x1: -82, x2: -60, z1: -774, z2: -766, y: 28, color: '#87958c' },
  { id: 'bell-west-stair', name: '听雨螺阶', x1: -82, x2: -74, z1: -802, z2: -774, y: 16, endY: 28, color: '#849388' },
  { id: 'bell-store', name: '淹钟下库', x1: -90, x2: -46, z1: -824, z2: -802, y: 16, color: '#697e78' },
  { id: 'bell-rise', name: '提钟长阶', x1: -54, x2: -46, z1: -834, z2: -816, y: 34, endY: 16, color: '#a3a595' },
  { id: 'bell-upper-link', name: '悬钟横廊', x1: -54, x2: -16, z1: -842, z2: -834, y: 34, color: '#c0b498' },
  { id: 'bell-east-gallery', name: '归声高廊', x1: -24, x2: -16, z1: -834, z2: -788, y: 34, color: '#acaa91' },
  { id: 'bell-return-stair', name: '归声短阶', x1: -24, x2: -16, z1: -788, z2: -774, y: 34, endY: 28, color: '#aaa88f' },
  { id: 'bell-east-link', name: '眺台东檐', x1: -28, x2: -16, z1: -774, z2: -766, y: 28, color: '#9aa99e' },
  { id: 'bell-refuge', name: '钟庭归灯', x1: -16, x2: -6, z1: -824, z2: -812, y: 34, color: '#c4bca6' },
  { id: 'bell-archive-link', name: '藏声侧廊', x1: -104, x2: -90, z1: -817, z2: -809, y: 16, color: '#788c7e' },
  { id: 'bell-archive', name: '无声抄经室', x1: -119, x2: -104, z1: -824, z2: -802, y: 16, color: '#8e9582' },
  { id: 'bell-nave', name: '沉钟礼拜堂', x1: -62, x2: -26, z1: -880, z2: -842, y: 34, color: '#b1b4a3' },
  { id: 'bell-after', name: '晨雨放灯台', x1: -62, x2: -26, z1: -900, z2: -880, y: 34, color: '#ccc5aa' },
];
export const BELL_GATES = [
  { id: 'bell-entry', name: '垂星钟闸', x: -44, y: 38, z: -734, w: 8.1, d: 0.6, side: 'south' },
  { id: 'bell-return', name: '归声近门', x: -20, y: 34, z: -792, w: 8.1, d: 0.6, side: 'north' },
  { id: 'bell-door', name: '悬钟堂门', x: -44, y: 34, z: -842, w: 36.1, d: 0.6, side: 'south' },
] as const;
export const BELL_LANDMARKS: Landmark[] = [
  { id: 'bell-entry', kind: 'shortcut', label: '推开垂星钟闸', x: -44, y: 38.8, z: -732.4 },
  { id: 'bell-vista', kind: 'note', label: '读守钟人的路签', x: -49, y: 28, z: -760 },
  { id: 'bell-porch-lamp', kind: 'rest', label: '眺台雨灯', x: -55, y: 28, z: -761 },
  { id: 'bell-clapper', kind: 'note', label: '松开沉钟的止水闩', x: -85, y: 16, z: -819 },
  { id: 'bell-silence', kind: 'note', label: '取下抄经人的止鸣绳', x: -113, y: 16, z: -817 },
  { id: 'bell-cache', kind: 'cache', label: '打开旧钟匠的行囊', x: -116, y: 16, z: -806 },
  { id: 'bell-return', kind: 'shortcut', label: '落下归声门闩', x: -20, y: 34, z: -793.6 },
  { id: 'bell-court-lamp', kind: 'rest', label: '钟庭归灯', x: -11, y: 34, z: -818 },
  { id: 'bell-boss-note', kind: 'note', label: '读钟守的留白', x: -29, y: 34, z: -837 },
  { id: 'bell-door', kind: 'shortcut', label: '开启悬钟堂门', x: -44, y: 34, z: -840.4 },
  { id: 'bell-home-lamp', kind: 'rest', label: '晨雨归灯', x: -56, y: 34, z: -892 },
  { id: 'bell-heart', kind: 'note', label: '为无声的人敲响晨钟', x: -44, y: 34, z: -894 },
];
export const BELL_REST_POINTS: Record<string, Vec3> = Object.fromEntries(BELL_LANDMARKS.filter(l => l.kind === 'rest').map(l => [l.id, { x: l.x + 1.2, y: l.y, z: l.z }]));
export const BELL_OBSTACLES: Obstacle[] = [
  ...BELL_GATES.map(g => ({ ...g, kind: 'gate' as const, gateId: g.id, h: 5 })),
  ...BELL_LANDMARKS.filter(l => l.kind === 'rest').map(l => ({ ...l, w: 0.9, d: 0.9, h: 2.8, kind: 'shrine' as const, landmarkId: l.id })),
  ...[-58, -30].flatMap(x => [-851, -871].map(z => ({ x, z, y: 34, w: 1.4, d: 1.4, h: 11, kind: 'pillar' as const }))),
  ...[-77, -63].map(x => ({ x, y: 16, z: -813, w: 2.5, d: 2.5, h: 4, kind: 'pillar' as const })),
];
export const BELL_ENEMIES: (Vec3 & { id: string; kind: EnemyKind; name: string; facing: number })[] = [
  { id: 'bell-stair-pike', kind: 'lancer', name: '守阶钟卫', x: -78, y: 23.714286, z: -784, facing: 0 },
  { id: 'bell-store-guard', kind: 'guard', name: '下库持盾人', x: -79, y: 16, z: -806, facing: 0 },
  { id: 'bell-store-slinger', kind: 'monk', name: '藏钟投石客', x: -58, y: 16, z: -819, facing: 1.57 },
  { id: 'bell-archive-blade', kind: 'duelist', name: '无声抄经人', x: -107, y: 16, z: -813, facing: 1.57 },
  { id: 'bell-rise-reaper', kind: 'reaver', name: '提钟钩镰卫', x: -50, y: 29, z: -829, facing: 0 },
  { id: 'bell-gallery-bow', kind: 'lancer', name: '归声望哨', x: -20, y: 34, z: -809, facing: Math.PI },
  { id: 'bell-keeper', kind: 'bellkeeper', name: '无声钟守 · 余响', x: -44, y: 34, z: -862, facing: 0 },
];
export const BELL_STRUCTURES: Solid[] = [
  ...[-64, -24].map(x => ({ id: `bell-nave-wall-${x}`, position: [x, 40, -861] as [number, number, number], size: [2, 12, 42] as [number, number, number], color: '#72867e' })),
  { id: 'bell-store-east-wall', position: [-45, 19, -814], size: [1, 6, 20], color: '#607970' },
  { id: 'bell-store-west-north', position: [-91, 19, -821], size: [1, 6, 6], color: '#607970' },
  { id: 'bell-store-west-south', position: [-91, 19, -806], size: [1, 6, 4], color: '#607970' },
  { id: 'bell-archive-west-wall', position: [-120, 19, -813], size: [1, 6, 24], color: '#7b8170' },
];
export const BELL_LORE: Record<string, [string, string]> = {
  'bell-vista': ['从这里能看见礼拜堂，却听不到它的钟。钟舌被锁在脚下的水库里。', '循西侧暖灯下到淹钟下库，松开止水闩，再从提钟长阶上楼。东侧高廊的门闩能打开回眺台的近路。'],
  'bell-boss-note': ['钟守留下三道刻痕：举槌时不响，落槌后才响。第二次之后，仍要听。', '铜金震圈能跳过。钟守半血后连响三次；抄经室的止鸣绳可压住第三响。普通落槌可以弹反，低扫要跳开。'],
};
export function bellTarget(s: GameState): string {
  if (!s.bellGates.includes('bell-entry')) return 'bell-entry';
  if (!s.litLamps.includes('bell-porch-lamp')) return 'bell-porch-lamp';
  if (!s.collected.includes('bell-clapper')) return 'bell-clapper';
  if (!s.litLamps.includes('bell-court-lamp')) return 'bell-court-lamp';
  if (!s.bellGates.includes('bell-door')) return 'bell-door';
  return s.defeatedGuests.includes('bell-keeper') ? 'bell-heart' : 'bell-keeper';
}
