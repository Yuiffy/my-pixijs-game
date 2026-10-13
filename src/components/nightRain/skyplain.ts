import type { EnemyKind, GameState, Landmark, Obstacle, Surface, Vec3 } from './types';
import type { Solid } from './architecture';

// A single continuous aqueduct connects the river source to the real distant ring.
// +z is south; ramp y belongs to z1, endY belongs to z2.
export const SKY_SURFACES: Surface[] = [
  { id: 'sky-channel', name: '归水旧渠', x1: -141, x2: -104, z1: -536, z2: -530, y: 8, color: '#a5af9e' },
  { id: 'sky-pass', name: '苇光隘口', x1: -112, x2: -104, z1: -568, z2: -536, y: 18, endY: 8, color: '#aeb6a1' },
  { id: 'sky-salt', name: '落霞盐阶', x1: -112, x2: -62, z1: -594, z2: -568, y: 18, color: '#c5a29c' },
  { id: 'sky-refuge', name: '盐风归灯', x1: -122, x2: -112, z1: -580, z2: -568, y: 18, color: '#cdb7a4' },
  { id: 'sky-bridge', name: '折光桥', x1: -70, x2: -62, z1: -630, z2: -592, y: 32, endY: 18, color: '#e0c5ae' },
  { id: 'sky-court', name: '镜湖外庭', x1: -72, x2: -14, z1: -657, z2: -630, y: 32, color: '#c4cdd0' },
  { id: 'sky-arena', name: '环星观测院', x1: -58, x2: -22, z1: -700, z2: -657, y: 32, color: '#b8c6d0' },
  { id: 'sky-final-stair', name: '拾星长阶', x1: -48, x2: -40, z1: -715, z2: -700, y: 40, endY: 32, color: '#d6c4a1' },
  { id: 'sky-final', name: '天镜归航台', x1: -58, x2: -30, z1: -730, z2: -715, y: 40, color: '#d1c7b1' },
  // Optional salt-pan loop descends into rose water then climbs to an old sighting tower.
  { id: 'sky-pool-stair', name: '盐池侧阶', x1: -136, x2: -128, z1: -590, z2: -574, y: 12, endY: 18, color: '#c4a49b' },
  { id: 'sky-pool-link', name: '晒盐短堤', x1: -136, x2: -112, z1: -574, z2: -568, y: 18, color: '#cbb6a0' },
  { id: 'sky-pool', name: '玫瑰盐池', x1: -151, x2: -124, z1: -600, z2: -582, y: 12, color: '#b98596' },
  { id: 'sky-tower-stair', name: '废台螺旋外阶', x1: -150, x2: -142, z1: -624, z2: -600, y: 26, endY: 12, color: '#cbb8ac' },
  { id: 'sky-tower', name: '旧测星台', x1: -154, x2: -128, z1: -637, z2: -624, y: 26, color: '#c3b8b0' },
  { id: 'sky-return-bridge', name: '测星悬廊', x1: -128, x2: -90, z1: -637, z2: -629, y: 26, color: '#cebaa8' },
  { id: 'sky-return-stair', name: '盐风归阶', x1: -98, x2: -90, z1: -629, z2: -594, y: 26, endY: 18, color: '#c4aa99' },
];
export const SKY_GATES = [
  { id: 'sky-entry', name: '归水渠闸', x: -137, z: -533, w: 0.7, d: 6.1, y: 8, side: 'west' },
  { id: 'sky-return', name: '盐风归门', x: -94, z: -598, w: 8.1, d: 0.7, y: 18.914, side: 'north' },
  { id: 'sky-door', name: '双镜院门', x: -40, z: -657, w: 36.1, d: 0.7, y: 32, side: 'south' },
] as const;
export const SKY_LANDMARKS: Landmark[] = [
  { id: 'sky-entry', kind: 'shortcut', label: '推开归水渠闸', x: -138.5, y: 8, z: -533 },
  { id: 'sky-note', kind: 'note', label: '读引水人的星图', x: -106, y: 18, z: -570 },
  { id: 'sky-lamp', kind: 'rest', label: '盐风归灯', x: -117, y: 18, z: -574 },
  { id: 'sky-prism-rose', kind: 'note', label: '转动霞色折光镜', x: -76, y: 18, z: -588 },
  { id: 'sky-cache', kind: 'cache', label: '打开晒盐人的行囊', x: -147, y: 12, z: -589 },
  { id: 'sky-dew', kind: 'cache', label: '收下星盐结晶', x: -144, y: 26, z: -632 },
  { id: 'sky-return', kind: 'shortcut', label: '打开盐风归门', x: -94, y: 19.417, z: -600.2 },
  { id: 'sky-court-lamp', kind: 'rest', label: '镜湖归灯', x: -20, y: 32, z: -635 },
  { id: 'sky-prism-moon', kind: 'note', label: '转动月色折光镜', x: -22, y: 32, z: -646 },
  { id: 'sky-door', kind: 'shortcut', label: '开启双镜院门', x: -40, y: 32, z: -655.5 },
  { id: 'sky-boss-note', kind: 'note', label: '读观星守望的留言', x: -55, y: 32, z: -650 },
  { id: 'sky-home-lamp', kind: 'rest', label: '归航星灯', x: -53, y: 40, z: -723 },
  { id: 'sky-heart', kind: 'note', label: '将归水灯送入星环', x: -43, y: 40, z: -724 },
];
export const SKY_REST_POINTS: Record<string, Vec3> = Object.fromEntries(SKY_LANDMARKS.filter(l => l.kind === 'rest').map(l => [l.id, { x: l.x + 1.2, y: l.y, z: l.z }]));
export const SKY_OBSTACLES: Obstacle[] = [
  ...SKY_GATES.map(g => ({ ...g, kind: 'gate' as const, gateId: g.id, h: 5 })),
  ...SKY_LANDMARKS.filter(l => l.kind === 'rest').map(l => ({ ...l, w: 0.9, d: 0.9, h: 2.8, kind: 'shrine' as const, landmarkId: l.id })),
  ...[-54, -26].flatMap(x => [-666, -692].map(z => ({ x, y: 32, z, w: 1.6, d: 1.6, h: 12, kind: 'pillar' as const }))),
];
export const SKY_ENEMIES: (Vec3 & { id: string; kind: EnemyKind; name: string; facing: number })[] = [
  { id: 'sky-pass-guard', kind: 'lancer', name: '引渠执灯卫', x: -108, y: 12.0625, z: -549, facing: 0 },
  { id: 'sky-salt-blade', kind: 'duelist', name: '盐阶巡夜人', x: -93, y: 18, z: -579, facing: -1.57 },
  { id: 'sky-prism-guard', kind: 'guard', name: '折镜护卫', x: -76, y: 18, z: -584, facing: 0 },
  { id: 'sky-pool-slinger', kind: 'monk', name: '晒盐投石客', x: -135, y: 12, z: -593, facing: 0 },
  { id: 'sky-tower-guard', kind: 'reaver', name: '废台守星人', x: -138, y: 26, z: -631, facing: 1.57 },
  { id: 'sky-bridge-bow', kind: 'lancer', name: '折光望哨', x: -66, y: 26.47, z: -615, facing: 0 },
  { id: 'sky-court-blade', kind: 'monk', name: '镜湖巡礼者', x: -48, y: 32, z: -641, facing: 1.57 },
  { id: 'sky-astronomer', kind: 'astronomer', name: '羽啾 · 观星守望', x: -40, y: 32, z: -679, facing: 0 },
];
export const SKY_STRUCTURES: Solid[] = [
  // Narrow reeds/rock corridor interrupts the vista before the salt plateau reveal.
  ...[-117, -99].map((x, i) => ({ id: `sky-pass-rock-${i}`, position: [x, 24, -550] as [number, number, number], size: [8, 28, 21] as [number, number, number], color: i ? '#787e83' : '#6c7c79' })),
  ...[-60, -20].map(x => ({ id: `sky-observatory-wall-${x}`, position: [x, 37, -679] as [number, number, number], size: [2, 10, 43] as [number, number, number], color: '#899aa9' })),
  ...[-56, -24].map(x => ({ id: `sky-ring-pier-${x}`, position: [x, 49, -697] as [number, number, number], size: [3, 34, 3] as [number, number, number], color: '#d1bf9b' })),
];
export const SKY_LORE: Record<string, [string, string]> = {
  'sky-note': ['那道悬在雨上的金环不是星。水从它脚下经过，才流进你来时的雾河。', '沿暖灯穿过落霞盐阶、折光桥，转动霞色和月色两面镜子，再进观测院。西侧盐池通往废测星台；上面的结晶会永久增加体力。'],
  'sky-boss-note': ['羽啾在星图背面写着：我记住的只是你刚刚站过的地方。第三声以后，抬头看我。', '星落会锁定旧落点，走出金圈；三枚星弹逐次瞄准，连续横移或弹反。第三发后的长收招可以近身反击。'],
};
export const skyPrisms = (s: Pick<GameState, 'collected'>) => ['sky-prism-rose', 'sky-prism-moon'].filter(id => s.collected.includes(id)).length;
export function skyTarget(s: GameState): string {
  if (!s.skyGates.includes('sky-entry')) return 'sky-entry';
  if (!s.litLamps.includes('sky-lamp')) return 'sky-lamp';
  if (!s.collected.includes('sky-prism-rose')) return 'sky-prism-rose';
  if (!s.litLamps.includes('sky-court-lamp')) return 'sky-court-lamp';
  if (!s.collected.includes('sky-prism-moon')) return 'sky-prism-moon';
  if (!s.skyGates.includes('sky-door')) return 'sky-door';
  return s.defeatedGuests.includes('sky-astronomer') ? 'sky-heart' : 'sky-astronomer';
}
