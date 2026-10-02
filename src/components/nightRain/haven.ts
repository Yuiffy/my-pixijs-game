import type { EnemyKind, GameState, Landmark, Obstacle, Surface, Vec3 } from './types';
import type { House, Solid } from './architecture';

export type HavenState = {
  recruits: ('scribe' | 'boatwright')[];
  gates: string[];
  echoes: number;
  savings: number;
  ending: 'remember' | 'release' | null;
  talking: string | null;
};
export const freshHaven = (): HavenState => ({ recruits: [], gates: [], echoes: 0, savings: 0, ending: null, talking: null });

export const HAVEN_SURFACES: Surface[] = [
  { id: 'haven-approach', name: '旅馆南桥', x1: -9, x2: -5, z1: 9, z2: 31, y: 0, endY: 4, color: '#9b977e' },
  { id: 'haven-court', name: '归灯庭', x1: -24, x2: 20, z1: 31, z2: 67, y: 4, color: '#b4a07b' },
  { id: 'haven-library', name: '听雨书廊', x1: -38, x2: -24, z1: 38, z2: 57, y: 4, color: '#ac9d82' },
  { id: 'haven-dock', name: '归灯小渡', x1: 20, x2: 32, z1: 41, z2: 67, y: 4, color: '#a08b6d' },
  { id: 'names-bridge', name: '弃铃小桥', x1: -49, x2: -35, z1: -29, z2: -25, y: 6, color: '#978879' },
  { id: 'names-study', name: '弃铃书房', x1: -68, x2: -49, z1: -37, z2: -17, y: 6, color: '#a5977c' },
  { id: 'names-stairs', name: '抄名人后阶', x1: -68, x2: -62, z1: -17, z2: 0, y: 6, endY: 0, color: '#9d9b83' },
  { id: 'names-return', name: '旧寺归巷', x1: -68, x2: -35, z1: -3, z2: 4, y: 0, color: '#8b927e' },
  { id: 'boatyard-bridge', name: '盐仓背桥', x1: -264, x2: -246, z1: -351, z2: -343, y: 2, color: '#899888' },
  { id: 'boatyard', name: '沉灯船坞', x1: -287, x2: -264, z1: -362, z2: -337, y: 2, color: '#9a8971' },
  { id: 'boatyard-stairs', name: '龙骨支架', x1: -286, x2: -279, z1: -383, z2: -362, y: 8, endY: 2, color: '#999b82' },
  { id: 'boatyard-loft', name: '补船人高棚', x1: -287, x2: -263, z1: -396, z2: -383, y: 8, color: '#aa987b' },
  { id: 'well-stairs', name: '灯下潮阶', x1: -13, x2: -5, z1: 67, z2: 90, y: 4, endY: 0, color: '#85988f' },
  { id: 'well-doorway', name: '三声封门', x1: -13, x2: -5, z1: 90, z2: 104, y: 0, color: '#8c9d94' },
  { id: 'well-archive', name: '无名灯库', x1: -24, x2: 6, z1: 104, z2: 122, y: 0, color: '#8a9d91' },
  { id: 'well-arena', name: '灯下无名', x1: -24, x2: 6, z1: 122, z2: 157, y: 0, color: '#8d9d93' },
  { id: 'well-return-bridge', name: '守灯人归廊', x1: 6, x2: 30, z1: 138, z2: 146, y: 0, color: '#9a9f8b' },
  { id: 'well-return-stairs', name: '归庭长阶', x1: 22, x2: 30, z1: 76, z2: 138, y: 4, endY: 0, color: '#9c9d83' },
  { id: 'well-return-foot', name: '归庭后门', x1: 22, x2: 30, z1: 64, z2: 76, y: 4, color: '#a59a7b' },
];
export const HAVEN_GATES = [
  { id: 'names-gate', name: '旧寺归巷', x: -41, z: 0.5, y: 0, w: 0.7, d: 7.1, side: 'west' },
  { id: 'well-door', name: '三声封门', x: -9, z: 99, y: 0, w: 8.1, d: 0.7, side: 'north' },
  { id: 'well-return', name: '归庭后门', x: 26, z: 72, y: 4, w: 8.1, d: 0.7, side: 'south' },
] as const;
export const HAVEN_LANDMARKS: Landmark[] = [
  { id: 'haven-sign', kind: 'note', label: '读归灯庭路牌', x: -7, y: 0, z: 8.5 },
  { id: 'haven-lamp', kind: 'rest', label: '归灯庭雨灯', x: -5, y: 4, z: 45 },
  { id: 'haven-keeper', kind: 'npc', label: '与留灯人阿莲交谈', x: -16, y: 4, z: 40 },
  { id: 'haven-scribe', kind: 'npc', label: '与弥音交谈', x: -30, y: 4, z: 48 },
  { id: 'haven-boatwright', kind: 'npc', label: '与温叔交谈', x: 24, y: 4, z: 48 },
  { id: 'haven-bell', kind: 'note', label: '轻叩旧钟', x: -17, y: 4, z: 60 },
  { id: 'haven-water', kind: 'note', label: '倾听水声', x: -5, y: 4, z: 60 },
  { id: 'haven-name', kind: 'note', label: '呼唤灯上的名字', x: 7, y: 4, z: 60 },
  { id: 'names-register', kind: 'note', label: '拾起被删去的名册', x: -65, y: 6, z: -33 },
  { id: 'scribe-field', kind: 'npc', label: '与抄名人弥音交谈', x: -54, y: 6, z: -33 },
  { id: 'names-gate', kind: 'shortcut', label: '推开旧寺归巷', x: -42.4, y: 0, z: 0.5 },
  { id: 'boatwright-field', kind: 'npc', label: '与补船人温叔交谈', x: -268, y: 2, z: -341 },
  { id: 'keel-rubbing', kind: 'note', label: '取下龙骨拓片', x: -269, y: 8, z: -391 },
  { id: 'haven-ferry', kind: 'ferry', label: '乘温叔的船前往沉灯船坞', x: 28, y: 4, z: 59 },
  { id: 'boatyard-ferry', kind: 'ferry', label: '乘温叔的船返回归灯庭', x: -268, y: 2, z: -357 },
  { id: 'well-door', kind: 'shortcut', label: '打开三声封门', x: -9, y: 0, z: 97.6 },
  { id: 'well-testimony', kind: 'note', label: '读最后一页守灯簿', x: -19, y: 0, z: 116 },
  { id: 'well-return', kind: 'shortcut', label: '推开归庭后门', x: 26, y: 4, z: 73.4 },
  { id: 'well-choice', kind: 'npc', label: '回应最后一盏无名灯', x: -9, y: 0, z: 153 },
];
export const HAVEN_REST_POINTS = { 'haven-lamp': { x: -3.8, y: 4, z: 45 } };
export const HAVEN_FERRIES: Record<string, { label: string; position: Vec3 }> = {
  'haven-ferry': { label: '沉灯船坞', position: { x: -268, y: 2, z: -355.5 } },
  'boatyard-ferry': { label: '归灯庭', position: { x: 28, y: 4, z: 57.5 } },
};
export const HAVEN_OBSTACLES: Obstacle[] = [
  ...HAVEN_GATES.map(g => ({ ...g, h: 4.6, kind: 'gate' as const, gateId: g.id })),
  { x: -5, z: 45, y: 4, w: 0.9, d: 0.9, h: 2.8, kind: 'shrine', landmarkId: 'haven-lamp' },
];
export const HAVEN_ENEMIES: (Vec3 & { id: string; kind: EnemyKind; name: string; facing: number })[] = [
  { id: 'names-watch', kind: 'duelist', name: '删名巡册人', x: -56, y: 6, z: -25, facing: Math.PI / 2 },
  { id: 'names-return-watch', kind: 'guard', name: '旧巷守灯客', x: -57, y: 0, z: 0.5, facing: Math.PI / 2 },
  { id: 'boatyard-watch', kind: 'reaver', name: '沉船钩镰客', x: -276, y: 2, z: -350, facing: Math.PI / 2 },
  { id: 'boatyard-loft-watch', kind: 'monk', name: '焚图行脚僧', x: -280, y: 8, z: -389, facing: Math.PI / 2 },
  { id: 'well-monk', kind: 'monk', name: '无名库守簿人', x: -9, y: 0, z: 115, facing: Math.PI },
  { id: 'last-lamplighter', kind: 'elegist', name: '末灯守簿 · 无名', x: -9, y: 0, z: 137, facing: Math.PI },
];
export const HAVEN_STRUCTURES: Solid[] = [
  ...HAVEN_SURFACES.filter(s => s.endY === undefined).map(s => ({ id: `${s.id}-base`, position: [(s.x1 + s.x2) / 2, (s.y - 1.2) / 2, (s.z1 + s.z2) / 2] as [number, number, number], size: [s.x2 - s.x1 - 0.7, s.y + 0.8, s.z2 - s.z1 - 0.7] as [number, number, number], color: '#637e75' })),
  { id: 'haven-west-roof', position: [-29, 11.4, 47.5], size: [18, 0.3, 21], color: '#926747' },
  { id: 'haven-east-roof', position: [25, 10, 49], size: [14, 0.3, 17], color: '#886443' },
  { id: 'haven-keeper-roof', position: [-16, 10, 39], size: [12, 0.3, 11], color: '#926747' },
  ...[-37, -24].flatMap(x => [39, 56].map(z => ({ id: `haven-pillar-${x}-${z}`, position: [x, 7.6, z] as [number, number, number], size: [0.45, 7.2, 0.45] as [number, number, number], color: '#b1a07c' }))),
  { id: 'names-roof', position: [-59, 12, -30], size: [19, 0.25, 14], color: '#786347' },
  { id: 'names-shelves', position: [-67.2, 7.5, -29], size: [0.5, 3, 10], color: '#806d4b' },
  { id: 'boatyard-loft-roof', position: [-275, 14, -389], size: [25, 0.3, 13], color: '#78614a' },
  { id: 'well-archive-roof', position: [-9, 8, 113], size: [31, 0.4, 19], color: '#59776f' },
  { id: 'well-wall-west', position: [-24, 4, 136], size: [0.4, 8, 27], color: '#789288' },
  { id: 'well-wall-east-north', position: [6, 4, 130], size: [0.4, 8, 15], color: '#789288' },
  { id: 'well-wall-east-south', position: [6, 4, 148], size: [0.4, 8, 3], color: '#789288' },
  { id: 'well-end-wall', position: [-9, 5, 157], size: [30, 10, 0.4], color: '#64857b' },
];
export const HAVEN_HOUSES: House[] = [
  { id: 'haven-kitchen', position: [-22, 4, 24], width: 18, depth: 9, height: 9, color: '#b5a58a', sign: '归灯庭 · บ้าน' },
];

export function havenAvailable(s: GameState, id: string): boolean {
  if (id === 'scribe-field') return !s.haven.recruits.includes('scribe');
  if (id === 'boatwright-field') return !s.haven.recruits.includes('boatwright');
  if (id === 'haven-scribe') return s.haven.recruits.includes('scribe');
  if (id === 'haven-boatwright') return s.haven.recruits.includes('boatwright');
  if (Object.hasOwn(HAVEN_FERRIES, id)) return s.haven.recruits.includes('boatwright') && s.litLamps.includes('haven-lamp');
  return true;
}
export function havenTarget(s: GameState): string {
  if (!s.litLamps.includes('haven-lamp')) return 'haven-lamp';
  if (!s.haven.recruits.includes('scribe')) return s.collected.includes('names-register') ? 'scribe-field' : 'names-register';
  if (!s.haven.recruits.includes('boatwright')) return s.collected.includes('keel-rubbing') ? 'boatwright-field' : 'keel-rubbing';
  if (s.haven.echoes < 3) return ['haven-bell', 'haven-water', 'haven-name'][s.haven.echoes];
  if (!s.haven.gates.includes('well-door')) return 'well-door';
  return s.haven.ending ? 'haven-keeper' : 'well-choice';
}
export const HAVEN_LORE: Record<string, [string, string]> = {
  'haven-sign': ['雨再大，也留一张空椅。旅馆南桥尽头，是归灯庭。', '沿窄桥往南，可休息、整备、存钱。归灯庭可以随时回访。'],
  'names-register': ['名册被刮去的不是罪人，是没有回城的人。末页写着：先叩归钟，再听流水，最后呼名。', '旧寺西侧书房里的弥音正在找这份名册。把它带给她，也记住钟、水、名字的顺序。'],
  'keel-rubbing': ['每根龙骨下都刻着名字。渡船不只运灯，还运回那些没能返乡的人。', '船坞的温叔认得这份拓片。修复雾河渡船系缆后，可以邀请他去归灯庭。'],
  'well-testimony': ['雨冠替城守灯，千流替河收愿。我替他们删去名字，好让留下的人以为一切已归。如今我也忘了自己。', '两关的守灯人守着同一次失约。库底最后一盏灯，等待你决定怎样记住未归之人。'],
};
