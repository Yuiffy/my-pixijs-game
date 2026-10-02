import type { EnemyKind, Landmark, Obstacle, Surface, Vec3 } from './types';
import type { House, Solid, Triple } from './architecture';

// The northern half of the first chapter. Geometry is shared by navigation,
// collision, the map and the renderer; every connection is a physical path.
export const CHAPTER_SURFACES: Surface[] = [
  { id: 'north-passage', name: '夜市北口', x1: -5, x2: 0, z1: -65, z2: -48, y: 0, color: '#827969' },
  { id: 'canal-street', name: '香料水街', x1: -54, x2: 0, z1: -69, z2: -61, y: 0, color: '#68776f' },
  { id: 'lower-square', name: '织坊下城', x1: -78, x2: -54, z1: -78, z2: -52, y: 0, color: '#998873' },
  { id: 'lower-refuge', name: '榕树雨灯', x1: -84, x2: -76, z1: -62, z2: -52, y: 0, color: '#a2977c' },
  { id: 'orchid-court', name: '兰花小院', x1: -75, x2: -60, z1: -52, z2: -42, y: 0, color: '#738e76' },
  { id: 'weaver-stairs', name: '织坊石阶', x1: -76, x2: -70, z1: -96, z2: -78, y: 6, endY: 0, color: '#aaa087' },
  { id: 'weaver-gallery', name: '染布长廊', x1: -77, x2: -44, z1: -104, z2: -96, y: 6, color: '#9b8873' },
  { id: 'gatehouse-stairs', name: '象门长阶', x1: -50, x2: -44, z1: -123, z2: -104, y: 12, endY: 6, color: '#9f9b8d' },
  { id: 'gatehouse', name: '双象门楼', x1: -69, x2: -41, z1: -135, z2: -123, y: 12, color: '#8c9a92' },
  { id: 'weaver-return-top', name: '象门侧廊', x1: -44, x2: -34, z1: -129, z2: -123, y: 12, color: '#858c7b' },
  { id: 'weaver-return-stairs', name: '织坊内阶', x1: -40, x2: -34, z1: -123, z2: -84, y: 12, endY: 0, color: '#848d80' },
  { id: 'weaver-return', name: '织坊归巷', x1: -60, x2: -34, z1: -84, z2: -78, y: 0, color: '#858c7b' },
  { id: 'wall-walk', name: '西城垛道', x1: -105, x2: -68, z1: -134, z2: -126, y: 12, color: '#89958a' },
  { id: 'wall-ascent', name: '烽灯高阶', x1: -104, x2: -97, z1: -157, z2: -134, y: 18, endY: 12, color: '#a4a695' },
  { id: 'high-wall', name: '金雨高墙', x1: -116, x2: -64, z1: -165, z2: -157, y: 18, color: '#a49b85' },
  { id: 'archive-descent', name: '经院回阶', x1: -72, x2: -64, z1: -184, z2: -165, y: 12, endY: 18, color: '#929b8c' },
  { id: 'archive', name: '雨声藏经院', x1: -91, x2: -61, z1: -200, z2: -184, y: 12, color: '#92846f' },
  { id: 'archive-refuge', name: '经院雨灯', x1: -61, x2: -50, z1: -197, z2: -185, y: 12, color: '#a4987f' },
  { id: 'archive-return', name: '抄经人回廊', x1: -60, x2: -55, z1: -185, z2: -135, y: 12, color: '#85978b' },
  { id: 'royal-bridge', name: '千灯朝圣桥', x1: -124, x2: -90, z1: -197, z2: -189, y: 12, color: '#aa9a7b' },
  { id: 'royal-landing', name: '天阶望台', x1: -131, x2: -123, z1: -197, z2: -189, y: 12, color: '#b4a48b' },
  { id: 'royal-ascent', name: '王寺天阶', x1: -131, x2: -123, z1: -219, z2: -197, y: 24, endY: 12, color: '#b4a48b' },
  { id: 'royal-porch', name: '王寺前庭', x1: -138, x2: -113, z1: -231, z2: -219, y: 24, color: '#b1a17f' },
  { id: 'royal-refuge', name: '王寺雨灯', x1: -115, x2: -105, z1: -228, z2: -219, y: 24, color: '#a99473' },
  { id: 'sanctum', name: '雨冠大殿', x1: -148, x2: -118, z1: -259, z2: -231, y: 24, color: '#877c72' },
  { id: 'royal-bell', name: '长夜尽处', x1: -141, x2: -125, z1: -270, z2: -259, y: 24, color: '#bda77c' },
  { id: 'royal-return-stairs', name: '王寺侧阶', x1: -119, x2: -113, z1: -219, z2: -205, y: 24, endY: 12, color: '#a19b86' },
  { id: 'pilgrim-walk', name: '香客归廊', x1: -119, x2: -90, z1: -205, z2: -199, y: 12, color: '#819482' },
  { id: 'cistern-mouth', name: '旧水道口', x1: -108, x2: -77, z1: -72, z2: -66, y: 0, color: '#547e7a' },
  { id: 'cistern', name: '莲根蓄水院', x1: -122, x2: -105, z1: -94, z2: -64, y: 0, color: '#60837c' },
  { id: 'cistern-stairs', name: '苔壁长阶', x1: -114, x2: -108, z1: -122, z2: -94, y: 6, endY: 0, color: '#7d937d' },
  { id: 'cistern-roof', name: '水院钟廊', x1: -122, x2: -108, z1: -128, z2: -122, y: 6, color: '#828f7c' },
  { id: 'cistern-upper-stairs', name: '水院登城阶', x1: -116, x2: -110, z1: -157, z2: -128, y: 18, endY: 6, color: '#86917f' },
  { id: 'wall-overlook', name: '风雨望楼', x1: -94, x2: -83, z1: -178, z2: -164, y: 18, color: '#9d977e' },
];

export const CHAPTER_GATES = [
  { id: 'weaver-gate', name: '织坊归巷', x: -53, z: -81, w: 0.7, d: 6.1, y: 0, side: 'east' },
  { id: 'cistern-gate', name: '旧水道闸', x: -104, z: -69, w: 0.7, d: 6.1, y: 0, side: 'west' },
  { id: 'archive-door', name: '藏经院铜门', x: -70.5, z: -187, w: 41.1, d: 0.7, y: 12, side: 'south' },
  { id: 'archive-gate', name: '抄经人回廊', x: -57.5, z: -139, w: 5.1, d: 0.7, y: 12, side: 'north' },
  { id: 'royal-gate', name: '香客归廊', x: -111, z: -202, w: 0.7, d: 6.1, y: 12, side: 'west' },
] as const;

export const CHAPTER_LANDMARKS: Landmark[] = [
  { id: 'castle-note', kind: 'note', label: '读夜市北口的路签', x: -2.5, y: 0, z: -59 },
  { id: 'lower-lamp', kind: 'rest', label: '榕树雨灯', x: -80, y: 0, z: -57 },
  { id: 'orchid-cache', kind: 'cache', label: '打开兰花院木匣', x: -69, y: 0, z: -45 },
  { id: 'spice-cache', kind: 'cache', label: '拾取香料商的钱袋', x: -35, y: 0, z: -67.4 },
  { id: 'weaver-note', kind: 'note', label: '读染布工的留言', x: -74, y: 6, z: -100 },
  { id: 'weaver-gate', kind: 'shortcut', label: '打开织坊归巷', x: -51.5, y: 0, z: -79.5 },
  { id: 'cistern-gate', kind: 'shortcut', label: '打开旧水道闸', x: -105.5, y: 0, z: -67 },
  { id: 'cistern-flask', kind: 'flask', label: '收下莲纹露瓶', x: -118, y: 0, z: -89 },
  { id: 'cistern-note', kind: 'note', label: '读水院壁刻', x: -117, y: 6, z: -125 },
  { id: 'wall-cache', kind: 'cache', label: '打开望楼军饷匣', x: -88, y: 18, z: -175 },
  { id: 'archive-door', kind: 'shortcut', label: '使用象纹铜印', x: -52, y: 12, z: -185.5 },
  { id: 'archive-lamp', kind: 'rest', label: '经院雨灯', x: -53, y: 12, z: -189 },
  { id: 'archive-gate', kind: 'shortcut', label: '打开抄经人回廊', x: -56, y: 12, z: -140.5 },
  { id: 'archive-cache', kind: 'cache', label: '拾取旧经匣里的铜钱', x: -85, y: 12, z: -197 },
  { id: 'archive-note', kind: 'note', label: '读守灯人的手记', x: -78, y: 12, z: -190 },
  { id: 'royal-gate', kind: 'shortcut', label: '打开香客归廊', x: -112.5, y: 12, z: -200.2 },
  { id: 'royal-lamp', kind: 'rest', label: '王寺雨灯', x: -109, y: 24, z: -223 },
  { id: 'royal-note', kind: 'note', label: '读雨冠碑文', x: -120, y: 24, z: -226 },
  { id: 'chapter-bell', kind: 'note', label: '敲响王寺归夜钟', x: -133, y: 24, z: -265 },
];

export const CHAPTER_REST_POINTS: Record<string, Vec3> = {
  'lower-lamp': { x: -78.8, y: 0, z: -57 },
  'archive-lamp': { x: -54.2, y: 12, z: -189 },
  'royal-lamp': { x: -110.2, y: 24, z: -223 },
};

export const CHAPTER_OBSTACLES: Obstacle[] = [
  ...CHAPTER_GATES.map(g => ({ x: g.x, z: g.z, w: g.w, d: g.d, y: g.y, h: 4.2, kind: 'gate' as const, gateId: g.id })),
  ...CHAPTER_LANDMARKS.filter(l => l.kind === 'rest').map(l => ({ x: l.x, z: l.z, y: l.y, w: 0.9, d: 0.9, h: 2.8, kind: 'shrine' as const, landmarkId: l.id })),
  { x: -65, z: -65, w: 3, d: 3, y: 0, h: 1.4, kind: 'planter' },
  { x: -21, z: -67.8, w: 3, d: 1.1, y: 0, h: 1.1, kind: 'crate' },
  { x: -47, z: -62.2, w: 2.3, d: 1.2, y: 0, h: 1.2, kind: 'crate' },
  { x: -62, z: -102.8, w: 2.5, d: 1, y: 6, h: 1.5, kind: 'crate' },
  ...[-84, -68].flatMap(x => [-195, -190].map(z => ({ x, z, w: 0.9, d: 0.9, y: 12, h: 7.5, kind: 'pillar' as const }))),
  { x: -116, z: -79, w: 3, d: 4, y: 0, h: 1.1, kind: 'planter' },
  ...[-144, -122].flatMap(x => [-238, -253].map(z => ({ x, z, w: 1.3, d: 1.3, y: 24, h: 6.6, kind: 'pillar' as const }))),
];

export const CHAPTER_ENEMIES: (Vec3 & { id: string; kind: EnemyKind; name: string; facing: number })[] = [
  { id: 'spice-prowler', kind: 'prowler', name: '雨披拾荒客', x: -17, y: 0, z: -64.5, facing: 1.57 },
  { id: 'spice-spearman', kind: 'lancer', name: '水街长枪客', x: -40, y: 0, z: -64, facing: 1.57 },
  { id: 'lower-guard', kind: 'guard', name: '织坊看守', x: -67, y: 0, z: -73, facing: 0 },
  { id: 'orchid-prowler', kind: 'prowler', name: '兰院伏客', x: -72, y: 0, z: -46, facing: Math.PI },
  { id: 'weaver-prowler', kind: 'prowler', name: '染布伏兵', x: -73, y: 3, z: -87, facing: 0 },
  { id: 'weaver-duelist', kind: 'duelist', name: '染布刀客', x: -61, y: 6, z: -99, facing: -1.57 },
  { id: 'elephant-lancer', kind: 'lancer', name: '象门长枪卫', x: -47, y: 9.157894736842106, z: -114, facing: 0 },
  { id: 'gate-captain', kind: 'captain', name: '双象卫长 · 铜印', x: -57, y: 12, z: -130, facing: 0 },
  { id: 'wall-guard', kind: 'guard', name: '西垛守夜人', x: -85, y: 12, z: -130, facing: 1.57 },
  { id: 'wall-lancer', kind: 'lancer', name: '烽灯枪卫', x: -100.5, y: 15.130434782608695, z: -146, facing: 0 },
  { id: 'wall-duelist', kind: 'duelist', name: '高墙巡刀', x: -80, y: 18, z: -161, facing: -1.57 },
  { id: 'overlook-guard', kind: 'guard', name: '望楼守饷人', x: -88, y: 18, z: -173, facing: 0 },
  { id: 'cistern-upper', kind: 'prowler', name: '苔壁拾灯人', x: -113, y: 13.03448275862069, z: -145, facing: Math.PI },
  { id: 'cistern-duelist', kind: 'duelist', name: '水院守瓶客', x: -118, y: 0, z: -85, facing: Math.PI },
  { id: 'cistern-guard', kind: 'guard', name: '水闸看守', x: -111, y: 0, z: -72, facing: 1.57 },
  { id: 'archive-lancer', kind: 'lancer', name: '经院铜枪卫', x: -77, y: 12, z: -194, facing: 0 },
  { id: 'archive-duelist', kind: 'duelist', name: '抄经执刀人', x: -86, y: 12, z: -192, facing: 1.57 },
  { id: 'bridge-guard', kind: 'guard', name: '千灯桥卫', x: -104, y: 12, z: -193, facing: 1.57 },
  { id: 'royal-lancer', kind: 'lancer', name: '王寺长枪卫', x: -127, y: 16.90909090909091, z: -206, facing: 0 },
  { id: 'royal-duelist', kind: 'duelist', name: '雨冠侍刀', x: -130, y: 24, z: -225, facing: 0 },
  { id: 'rain-regent', kind: 'regent', name: '长夜司灯 · 雨冠', x: -133, y: 24, z: -247, facing: 0 },
];

const box = (id: string, position: Triple, size: Triple, color: string): Solid => ({ id, position, size, color });
export const CHAPTER_STRUCTURES: Solid[] = [
  // Foundations stop the elevated district looking like floating platforms.
  ...CHAPTER_SURFACES.filter(s => s.y > 0 && s.endY === undefined).map(s => box(`${s.id}-foundation`, [(s.x1 + s.x2) / 2, (s.y - 1) / 2 - 0.3, (s.z1 + s.z2) / 2], [s.x2 - s.x1 - 0.7, s.y + 0.1, s.z2 - s.z1 - 0.7], '#586e6b')),
  // A roofed room with real wall and ceiling collision; all doorways remain clear.
  box('archive-north-wall', [-76, 14.8, -199.8], [29, 5.6, 0.35], '#9c917c'),
  box('archive-roof', [-76, 19.6, -193.5], [31.5, 0.4, 14], '#714f44'),
  ...[-1, 1].map(side => ({ ...box(`archive-upper-roof-${side}`, [-76, 20.45, -193.5 + side * 3.3], [6.9, 0.35, 32], '#714f44'), yaw: Math.PI / 2, tilt: side * 0.22 })),
  box('archive-roof-ridge', [-76, 21.35, -193.5], [32, 0.4, 0.6], '#c9aa6b'),
  ...[-90.7, -86.3].flatMap(x => [-177, -174.8].map(z => box(`overlook-post-${x}-${z}`, [x, 20, z], [0.45, 4, 0.45], '#ab9d7e'))),
  ...[-41.8, -68.2].map(x => box(`elephant-tower-${x}`, [x, 17, -133], [2.3, 10, 3], '#929786')),
  box('elephant-lintel', [-55, 22.5, -133], [29, 1.5, 3], '#ad9d78'),
  box('sanctum-north-west', [-144, 28, -258.8], [7.5, 8, 0.4], '#9b9179'),
  box('sanctum-north-east', [-122, 28, -258.8], [7.5, 8, 0.4], '#9b9179'),
  box('sanctum-west-wall', [-147.8, 27, -245], [0.4, 6, 27], '#8e9788'),
  box('sanctum-east-wall', [-118.2, 27, -245], [0.4, 6, 27], '#8e9788'),
  ...[-147, -119].map(x => box(`sanctum-buttress-${x}`, [x, 33, -245], [3, 18, 3], '#ab9d7e')),
  box('royal-bell-tower', [-133, 16, -274], [11, 32, 7], '#93896f'),
  box('royal-bell-cornice', [-133, 31.8, -274], [12, 0.6, 8], '#c8b179'),
  ...[-136.5, -129.5].map(x => box(`bell-frame-${x}`, [x, 27.5, -265], [0.45, 7, 0.45], '#847354')),
  box('bell-frame-crossbar', [-133, 31, -265], [7.5, 0.6, 0.6], '#b7a172'),
];

export const CHAPTER_HOUSES: House[] = [
  ...[-13, -25, -37, -49].flatMap((x, i) => [
    { id: `spice-house-n-${i}`, position: [x, 0, -73.5] as Triple, width: 10, depth: 7, height: 7 + (i % 2) * 3, color: ['#8f9d84', '#a28c75', '#7c9a98', '#a38270'][i], sign: ['เครื่องเทศ', '旧城香料', '茶 · ชา', '王城北路'][i] },
    { id: `spice-house-s-${i}`, position: [x, 0, -56] as Triple, width: 10, depth: 7, height: 8 + (i % 3), color: ['#8c8375', '#78938c', '#a1927b', '#83877b'][i], sign: ['夜渡', '织坊', '雨季旅舍', 'ตลาด'][i] },
  ]),
  { id: 'lower-west-house', position: [-83, 0, -82], width: 8, depth: 7, height: 12, color: '#a8977d' },
  { id: 'weaver-workshop', position: [-64, 0, -92], width: 8, depth: 6, height: 5, color: '#927d71', sign: 'ย้อมผ้า · 染坊' },
  { id: 'orchid-house', position: [-79, 0, -46], width: 6, depth: 7, height: 7.5, color: '#a8967c' },
  { id: 'weaver-west-block', position: [-86, 0, -101], width: 12, depth: 12, height: 12, color: '#9a8977', sign: 'ผ้าไหม · 绸' },
  { id: 'elephant-inner-block', position: [-65, 0, -114], width: 14, depth: 12, height: 15, color: '#85988e', sign: '双象门' },
  { id: 'guard-barracks', position: [-83, 0, -118], width: 12, depth: 10, height: 9, color: '#83948b' },
  { id: 'wall-inner-block', position: [-87, 0, -145], width: 12, depth: 16, height: 22, color: '#9a9783' },
  { id: 'wall-east-block', position: [-45, 0, -157], width: 10, depth: 18, height: 18, color: '#798d8a' },
  { id: 'cistern-west-block', position: [-127.5, 0, -82], width: 8, depth: 24, height: 7, color: '#758e79' },
  { id: 'cistern-north-block', position: [-121, 0, -108], width: 10, depth: 16, height: 12, color: '#788b7e' },
  { id: 'west-wall-block', position: [-123, 0, -142], width: 10, depth: 18, height: 20, color: '#818e7c' },
  { id: 'archive-east-block', position: [-43, 0, -190], width: 10, depth: 20, height: 19, color: '#ac9b7f' },
  { id: 'palace-west-block', position: [-156, 0, -241], width: 12, depth: 26, height: 36, color: '#959a82' },
  { id: 'palace-east-block', position: [-98, 0, -243], width: 16, depth: 25, height: 34, color: '#a69a7e' },
];

export const CHAPTER_LORE: Record<string, [string, string]> = {
  'castle-note': ['铁伞收处，长街未尽。循香过水，双象守印。', '北口通往香料水街和织坊下城。榕树下有新的雨灯。门楼卫长携带打开藏经院的象纹铜印。'],
  'weaver-note': ['布染长夜，梯绕旧窗。归人从背后解闩。', '从长廊东头上象门长阶。门楼南面的内阶可以绕回下城，打开织坊归巷的门。'],
  'cistern-note': ['高墙饮雨，莲根藏露。水闸只迎归人。', '沿苔壁长阶到底是蓄水院，那里藏着第二个瓶数提升。打开水闸，就能直接返回织坊下城。'],
  'archive-note': ['一印开经，一灯送客。桥上千盏，皆望雨冠。', '西侧朝圣桥通往王寺。东侧抄经人回廊可以直接回到双象门楼。经院东厢的雨灯能补给和记录复活点。'],
  'royal-note': ['他为长夜掌灯，竟忘了天明。钟声须过雨冠。', '最后的守灯人就在大殿。枪刺可以弹反，红色横扫要闪避或跳过。击败后走到殿后的钟台，为这一晚敲钟。'],
};
