import type { EnemyKind, Landmark, Obstacle, Surface, Vec3 } from './types';
import type { Solid } from './architecture';

export type DungeonId = 'crypt' | 'cave';
export const DUNGEONS = {
  crypt: { name: '弃灯墓地', upper: { x: -38, y: 6, z: -23.5 }, floor: -24, offset: { x: -133, y: -24, z: -45.5 }, foyer: { x1: -42, x2: -34.5, z1: -27, z2: -20 }, duration: 7 },
  cave: { name: '风息洞窟', upper: { x: -147, y: 2, z: -316 }, floor: -36, offset: { x: -247, y: -36, z: -412 }, foyer: { x1: -152, x2: -141, z1: -320, z2: -312 }, duration: 8 },
} satisfies Record<DungeonId, { name: string; upper: Vec3; floor: number; offset: Vec3; foyer: { x1: number; x2: number; z1: number; z2: number }; duration: number }>;
export function dungeonPoint<T extends Vec3>(id: DungeonId, point: T): T {
  const d = DUNGEONS[id].offset;
  return { ...point, x: point.x + d.x, y: point.y + d.y, z: point.z + d.z };
}
export function undergroundId(p: Vec3): DungeonId | null { return p.y < -10 ? p.z < -200 ? 'cave' : 'crypt' : null; }
export function dungeonFoyer(p: Vec3): DungeonId | null {
  return (Object.keys(DUNGEONS) as DungeonId[]).find(id => {
 const d = DUNGEONS[id]; const
b = d.foyer; return Math.abs(p.y - d.upper.y) < 0.8 && p.x < b.x2 - 0.8 && p.x > b.x1 && p.z > b.z1 && p.z < b.z2;
}) ?? null;
}
export function navigationLayer(p: Vec3) { return undergroundId(p) ?? 'surface'; }

const LOCAL_SURFACES: Surface[] = [
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
const LOCAL_LANDMARKS: Landmark[] = [
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
export const DUNGEON_BOSSES = ['crypt-colossus', 'cave-sentinel'];
const LOCAL_ENEMIES: (Vec3 & { id: string; kind: EnemyKind; name: string; facing: number })[] = [
  { id: 'crypt-blade', kind: 'duelist', name: '墓门试刃客', x: 100, y: 0, z: 29, facing: Math.PI },
  { id: 'crypt-bow', kind: 'duelist', name: '骨廊守弩人', x: 96, y: 0, z: 49, facing: Math.PI },
  { id: 'crypt-shield', kind: 'guard', name: '藏骨持盾人', x: 104, y: 0, z: 50, facing: Math.PI },
  { id: 'crypt-colossus', kind: 'colossus', name: '露缇 · 藏骨巨像', x: 101, y: 0, z: 65, facing: Math.PI },
  { id: 'cave-pike', kind: 'lancer', name: '石隙执枪客', x: 100, y: 0, z: 113, facing: Math.PI },
  { id: 'cave-slinger', kind: 'monk', name: '晶苇投石人', x: 116, y: 0, z: 115, facing: -Math.PI / 2 },
  { id: 'cave-hulk', kind: 'guard', name: '岩苔巨躯', x: 91, y: 0, z: 125, facing: Math.PI },
  { id: 'cave-sentinel', kind: 'sentinel', name: '沐石 · 风息守望', x: 100, y: 0, z: 136, facing: Math.PI },
];
const LOCAL_OBSTACLES: Obstacle[] = [
  { x: 91, y: 0, z: 24, w: 0.9, d: 0.9, h: 2.5, kind: 'shrine', landmarkId: 'crypt-lamp' },
  { x: 95, y: 0, z: 98, w: 0.9, d: 0.9, h: 2.5, kind: 'shrine', landmarkId: 'cave-lamp' },
  ...[[94.7, 46], [99.7, 46], [89.5, 49], [106, 54]].map(([x, z]) => ({ x, z, y: 0, w: 1.1, d: 1.1, h: 3.7, kind: 'pillar' as const })),
  ...[[98, 108], [103.8, 117], [94, 131], [108, 127]].map(([x, z]) => ({ x, z, y: 0, w: 1.5, d: 1.7, h: 2.7, kind: 'pillar' as const })),
];
export const DUNGEON_SURFACES: Surface[] = LOCAL_SURFACES.map(s => {
  const d = DUNGEONS[s.id.startsWith('crypt') ? 'crypt' : 'cave'].offset;
  return { ...s, x1: s.x1 + d.x, x2: s.x2 + d.x, z1: s.z1 + d.z, z2: s.z2 + d.z, y: d.y };
});
export const DUNGEON_FOYERS: Surface[] = (Object.keys(DUNGEONS) as DungeonId[]).map(id => ({ id: `${id}-foyer`, name: `${DUNGEONS[id].name} · ${id === 'crypt' ? '停灯小堂' : '风口前室'}`, ...DUNGEONS[id].foyer, y: DUNGEONS[id].upper.y, color: id === 'crypt' ? '#7b7978' : '#677c74' }));
DUNGEON_FOYERS.push({ id: 'cave-approach', name: '渡村 · 风铃石径', x1: -142, x2: -135, z1: -318, z2: -314, y: 2, color: '#859285' }, { id: 'cave-approach-turn', name: '渡村 · 风铃石径', x1: -139, x2: -135, z1: -322, z2: -314, y: 2, color: '#859285' });
export const DUNGEON_LANDMARKS: Landmark[] = LOCAL_LANDMARKS.map(l => {
  const id = l.id.startsWith('crypt') || ['ossuary-mail', 'grave-spear', 'grave-seal'].includes(l.id) ? 'crypt' : 'cave';
  if (l.id.endsWith('entrance')) return { ...l, ...DUNGEONS[id].upper, label: '踩下升降台机关 · 下行' };
  if (l.id.endsWith('exit')) return { ...l, ...DUNGEONS[id].upper, y: DUNGEONS[id].floor, label: '踩下升降台机关 · 返回地面' };
  return dungeonPoint(id, l);
});
// Destinations remain available to save fixtures and guide tools; gameplay rides the shaft.
export const DUNGEON_PORTALS: Record<string, { destination: Vec3; chapter?: boolean }> = Object.fromEntries((Object.keys(DUNGEONS) as DungeonId[]).flatMap(id => [
  [`${id}-entrance`, { destination: { ...DUNGEONS[id].upper, y: DUNGEONS[id].floor }, chapter: id === 'cave' }],
  [`${id}-exit`, { destination: { ...DUNGEONS[id].upper } }],
]));
export const DUNGEON_ENEMIES = LOCAL_ENEMIES.map(e => dungeonPoint(e.id.startsWith('crypt') ? 'crypt' : 'cave', e));
export const DUNGEON_OBSTACLES = LOCAL_OBSTACLES.map(o => dungeonPoint(o.z < 90 ? 'crypt' : 'cave', o));
export const DUNGEON_REST_POINTS = { 'crypt-lamp': dungeonPoint('crypt', { x: 89.7, y: 0, z: 24 }), 'cave-lamp': dungeonPoint('cave', { x: 96.3, y: 0, z: 98 }) };

// These boxes drive both visible masonry and physical collision.
export const DUNGEON_SOLIDS: Solid[] = DUNGEON_SURFACES.flatMap(s => ['west', 'east', 'north', 'south'].flatMap(side => {
  const alongZ = side === 'west' || side === 'east'; const start = alongZ ? s.z1 : s.x1; const
end = alongZ ? s.z2 : s.x2;
  const fixed = side === 'west' ? s.x1 : side === 'east' ? s.x2 : side === 'north' ? s.z1 : s.z2;
  const outward = side === 'west' || side === 'north' ? -1 : 1;
  return Array.from({ length: Math.ceil((end - start) / 2) }, (_, i) => {
    const length = Math.min(2, end - start - i * 2); const
mid = start + i * 2 + length / 2;
    const x = alongZ ? fixed + outward * 0.1 : mid; const
z = alongZ ? mid : fixed + outward * 0.1;
    if (DUNGEON_SURFACES.some(other => other !== s && other.y === s.y && x > other.x1 && x < other.x2 && z > other.z1 && z < other.z2)) return [];
    return [{ id: `${s.id}-${side}-${i}`, position: [alongZ ? fixed + outward * 0.23 : mid, s.y + 4.5, alongZ ? mid : fixed + outward * 0.23] as [number, number, number], size: [alongZ ? 0.45 : length, 9, alongZ ? length : 0.45] as [number, number, number], color: s.id.startsWith('crypt') ? '#686273' : '#496f64' }];
  }).flat();
}));
for (const id of Object.keys(DUNGEONS) as DungeonId[]) {
  const d = DUNGEONS[id]; const b = d.foyer; const
color = id === 'crypt' ? '#776c65' : '#526f65';
  const box = (suffix: string, position: [number, number, number], size: [number, number, number]) => DUNGEON_SOLIDS.push({ id: `${id}-${suffix}`, position, size, color });
  box('foyer-west', [b.x1, d.upper.y + 2.3, (b.z1 + b.z2) / 2], [0.5, 4.6, b.z2 - b.z1]);
  for (const z of [b.z1, b.z2]) box(`foyer-end-${z}`, [(b.x1 + b.x2) / 2, d.upper.y + 2.3, z], [b.x2 - b.x1, 4.6, 0.5]);
  const doorZ = d.upper.z;
  for (const [z1, z2] of [[b.z1, doorZ - 1.2], [doorZ + 1.2, b.z2]]) box(`foyer-door-${z1}`, [b.x2, d.upper.y + 2.3, (z1 + z2) / 2], [0.5, 4.6, z2 - z1]);
  box('foyer-lintel', [b.x2, d.upper.y + 4, doorZ], [0.5, 1.2, 2.4]);
  box('foyer-roof', [(b.x1 + b.x2) / 2, d.upper.y + 4.7, (b.z1 + b.z2) / 2], [b.x2 - b.x1 + 0.5, 0.4, b.z2 - b.z1 + 0.5]);
  const shaftHeight = d.upper.y - d.floor;
  for (const x of [d.upper.x - 3, d.upper.x + 3]) box(`shaft-side-${x}`, [x, (d.upper.y + d.floor) / 2, d.upper.z], [0.35, shaftHeight, 6]);
  box('shaft-back', [d.upper.x, (d.upper.y + d.floor) / 2, d.upper.z - 3], [6, shaftHeight, 0.35]);
  box('shaft-front', [d.upper.x, (d.upper.y + d.floor + 6) / 2, d.upper.z + 3], [6, shaftHeight - 6, 0.35]);
  for (const s of DUNGEON_SURFACES.filter(surface => surface.id.startsWith(id))) {
    // The entry roof has an opening directly above the moving platform.
    if (s.id === `${id}-${id === 'crypt' ? 'entry' : 'mouth'}`) {
      for (const [x1, x2, z1, z2] of [[s.x1, d.upper.x - 3.2, s.z1, s.z2], [d.upper.x + 3.2, s.x2, s.z1, s.z2], [d.upper.x - 3.2, d.upper.x + 3.2, d.upper.z + 3.2, s.z2]]) {
        box(`roof-${s.id}-${x1}-${z1}`, [(x1 + x2) / 2, d.floor + 9.2, (z1 + z2) / 2], [x2 - x1, 0.4, z2 - z1]);
      }
    } else box(`roof-${s.id}`, [(s.x1 + s.x2) / 2, d.floor + 9.2, (s.z1 + s.z2) / 2], [s.x2 - s.x1, 0.4, s.z2 - s.z1]);
  }
}
export function giantScale(id: string) { return id === 'crypt-colossus' ? 2.5 : id === 'cave-sentinel' ? 3.25 : id === 'cave-hulk' ? 1.65 : 1; }
