import type { EnemyKind, GameState, Landmark, Obstacle, Surface, Vec3 } from './types';
import type { House, Solid, Triple } from './architecture';

// Chapter two is in the same coordinate space as the city. The bell's east
// postern descends 22 metres to the village; both riverbanks meet upstream.
export const VALLEY_SURFACES: Surface[] = [
  { id: 'bell-postern', name: '王寺后山门', x1: -126, x2: -115, z1: -269, z2: -261, y: 24, color: '#acaa8e' },
  { id: 'bell-cliff', name: '钟后崖廊', x1: -121, x2: -115, z1: -297, z2: -261, y: 24, color: '#969a87' },
  { id: 'valley-overlook', name: '雾河望乡台', x1: -136, x2: -110, z1: -300, z2: -292, y: 24, color: '#9ca992' },
  { id: 'valley-descent', name: '归猿下山阶', x1: -124, x2: -116, z1: -332, z2: -300, y: 2, endY: 24, color: '#9ba68d' },
  { id: 'river-village', name: '雾河渡村', x1: -145, x2: -106, z1: -352, z2: -332, y: 2, color: '#9c8d72' },
  { id: 'village-refuge', name: '渡村雨灯', x1: -141, x2: -130, z1: -332, z2: -321, y: 2, color: '#b4a382' },
  { id: 'village-pier', name: '归城渡埠', x1: -136, x2: -124, z1: -365, z2: -352, y: 2, color: '#8c7960' },
  { id: 'river-walk', name: '萤火水栈', x1: -188, x2: -145, z1: -347, z2: -339, y: 2, color: '#8c907a' },
  { id: 'stilt-market', name: '水上盐市', x1: -210, x2: -186, z1: -363, z2: -330, y: 2, color: '#a69577' },
  { id: 'salt-bridge', name: '盐仓小桥', x1: -234, x2: -210, z1: -350, z2: -342, y: 2, color: '#8e987d' },
  { id: 'salt-store', name: '旧盐仓', x1: -246, x2: -233, z1: -358, z2: -336, y: 2, color: '#a19376' },
  { id: 'mill-bank', name: '水车沿岸', x1: -208, x2: -200, z1: -388, z2: -363, y: 2, color: '#819589' },
  { id: 'mill-court', name: '沉舟水车院', x1: -216, x2: -188, z1: -416, z2: -388, y: 2, color: '#889d93' },
  { id: 'mill-pier', name: '水车渡埠', x1: -188, x2: -180, z1: -405, z2: -393, y: 2, color: '#92846e' },
  { id: 'mill-ascent', name: '白沫石阶', x1: -206, x2: -198, z1: -440, z2: -416, y: 8, endY: 2, color: '#a0aa96' },
  { id: 'west-aqueduct', name: '西岸引水桥', x1: -206, x2: -150, z1: -448, z2: -440, y: 8, color: '#a3a993' },
  { id: 'lotus-pavilion', name: '听瀑莲亭', x1: -227, x2: -206, z1: -453, z2: -440, y: 8, color: '#b0a384' },
  { id: 'mountain-foot', name: '竹影山口', x1: -106, x2: -84, z1: -341, z2: -333, y: 2, color: '#87987f' },
  { id: 'bamboo-ascent', name: '青竹长阶', x1: -92, x2: -84, z1: -366, z2: -341, y: 10, endY: 2, color: '#9ca68a' },
  { id: 'bamboo-pass', name: '风铃竹关', x1: -99, x2: -74, z1: -380, z2: -366, y: 10, color: '#96a080' },
  { id: 'bamboo-garden', name: '灵露竹园', x1: -74, x2: -59, z1: -380, z2: -369, y: 10, color: '#809777' },
  { id: 'cliff-return-top', name: '采茶人栈桥', x1: -120, x2: -99, z1: -380, z2: -372, y: 10, color: '#9e9778' },
  { id: 'cliff-return-stairs', name: '渡村后阶', x1: -120, x2: -112, z1: -372, z2: -356, y: 10, endY: 2, color: '#9b9e83' },
  { id: 'cliff-return-foot', name: '采茶人归门', x1: -120, x2: -112, z1: -356, z2: -344, y: 2, color: '#9c987f' },
  { id: 'monastery-ascent', name: '无声寺百阶', x1: -82, x2: -74, z1: -405, z2: -380, y: 18, endY: 10, color: '#b1ac94' },
  { id: 'monastery', name: '无声山寺', x1: -107, x2: -74, z1: -426, z2: -405, y: 18, color: '#ae9c82' },
  { id: 'monastery-refuge', name: '竹寺雨灯', x1: -74, x2: -64, z1: -417, z2: -407, y: 18, color: '#bca888' },
  { id: 'monastery-descent', name: '流经下山阶', x1: -108, x2: -100, z1: -447, z2: -426, y: 8, endY: 18, color: '#a8ab92' },
  { id: 'east-aqueduct', name: '东岸引水桥', x1: -144, x2: -100, z1: -453, z2: -445, y: 8, color: '#9ba997' },
  { id: 'reed-return', name: '芦苇归径', x1: -151, x2: -143, z1: -405, z2: -348, y: 2, color: '#859885' },
  { id: 'reed-ascent', name: '河心回阶', x1: -151, x2: -143, z1: -440, z2: -405, y: 8, endY: 2, color: '#9aa993' },
  { id: 'river-confluence', name: '双流汇灯台', x1: -159, x2: -135, z1: -469, z2: -440, y: 8, color: '#a6ac91' },
  { id: 'river-causeway', name: '双闸锁桥', x1: -157, x2: -145, z1: -491, z2: -469, y: 8, color: '#a3a48a' },
  { id: 'serpent-court', name: '那伽沉殿', x1: -173, x2: -127, z1: -527, z2: -491, y: 8, color: '#869d94' },
  { id: 'river-source', name: '万灯归水', x1: -159, x2: -141, z1: -539, z2: -527, y: 8, color: '#b5aa85' },
];

export const VALLEY_GATES = [
  { id: 'valley-entry', name: '王寺后山门', x: -123, z: -265, w: 0.7, d: 8.1, y: 24, side: 'west' },
  { id: 'cliff-gate', name: '采茶人归门', x: -116, z: -354, w: 8.1, d: 0.7, y: 2, side: 'north' },
  { id: 'reed-gate', name: '芦苇归径', x: -147, z: -359, w: 8.1, d: 0.7, y: 2, side: 'north' },
  { id: 'river-door', name: '双闸锁桥', x: -151, z: -477, w: 12.1, d: 0.7, y: 8, side: 'south' },
] as const;

export const VALLEY_LANDMARKS: Landmark[] = [
  { id: 'valley-entry', kind: 'shortcut', label: '推开王寺后山门', x: -124.4, y: 24, z: -265 },
  { id: 'valley-note', kind: 'note', label: '读雾河路碑', x: -130, y: 24, z: -296 },
  { id: 'village-lamp', kind: 'rest', label: '渡村雨灯', x: -137, y: 2, z: -326 },
  { id: 'village-note', kind: 'note', label: '读摆渡人的留信', x: -126, y: 2, z: -342 },
  { id: 'salt-cache', kind: 'cache', label: '打开旧盐仓银匣', x: -242, y: 2, z: -351 },
  { id: 'mill-sluice', kind: 'note', label: '转动西岸水闸', x: -212, y: 2, z: -411 },
  { id: 'ferry-winch', kind: 'note', label: '修复渡船系缆', x: -184, y: 2, z: -401 },
  { id: 'valley-flask', kind: 'flask', label: '收下听瀑露瓶', x: -222, y: 8, z: -447 },
  { id: 'bamboo-dew', kind: 'cache', label: '收下灵竹露', x: -64, y: 10, z: -375 },
  { id: 'bamboo-note', kind: 'note', label: '读竹关风铃笺', x: -96, y: 10, z: -369 },
  { id: 'cliff-gate', kind: 'shortcut', label: '打开采茶人归门', x: -115, y: 2, z: -355.4 },
  { id: 'monastery-lamp', kind: 'rest', label: '竹寺雨灯', x: -68, y: 18, z: -411 },
  { id: 'monastery-sluice', kind: 'note', label: '转动东岸水闸', x: -91, y: 18, z: -423 },
  { id: 'monastery-cache', kind: 'cache', label: '打开无声寺经匣', x: -78, y: 18, z: -421 },
  { id: 'reed-gate', kind: 'shortcut', label: '打开芦苇归径', x: -146, y: 2, z: -360.4 },
  { id: 'confluence-lamp', kind: 'rest', label: '汇流雨灯', x: -138, y: 8, z: -461 },
  { id: 'river-note', kind: 'note', label: '读双流锁桥铭文', x: -153, y: 8, z: -465 },
  { id: 'river-door', kind: 'shortcut', label: '解除双闸锁桥', x: -147, y: 8, z: -475.6 },
  { id: 'river-heart', kind: 'note', label: '放出第一盏归水灯', x: -150, y: 8, z: -534 },
  { id: 'ferry-city', kind: 'ferry', label: '乘渡船前往雾河渡村', x: 17, y: 0, z: -31.5 },
  { id: 'ferry-village-city', kind: 'ferry', label: '乘渡船返回旧城摆渡庵', x: -133, y: 2, z: -360 },
  { id: 'ferry-village-mill', kind: 'ferry', label: '乘渡船前往沉舟水车院', x: -127, y: 2, z: -360 },
  { id: 'ferry-mill', kind: 'ferry', label: '乘渡船返回雾河渡村', x: -183, y: 2, z: -396 },
];

export const VALLEY_REST_POINTS: Record<string, Vec3> = {
  'village-lamp': { x: -135.8, y: 2, z: -326 },
  'monastery-lamp': { x: -69.2, y: 18, z: -411 },
  'confluence-lamp': { x: -139.2, y: 8, z: -461 },
};
export const FERRY_DESTINATIONS: Record<string, { label: string; position: Vec3 }> = {
  'ferry-city': { label: '雾河渡村', position: { x: -133, y: 2, z: -358.5 } },
  'ferry-village-city': { label: '旧城摆渡庵', position: { x: 17, y: 0, z: -28.8 } },
  'ferry-village-mill': { label: '沉舟水车院', position: { x: -185, y: 2, z: -396 } },
  'ferry-mill': { label: '雾河渡村', position: { x: -128, y: 2, z: -358.5 } },
};
export const VALLEY_BOSSES = ['drowned-warden', 'silent-abbot', 'river-serpent'];
export const riverSeals = (s: Pick<GameState, 'collected'>) => ['mill-sluice', 'monastery-sluice'].filter(id => s.collected.includes(id)).length;

export const VALLEY_OBSTACLES: Obstacle[] = [
  ...VALLEY_GATES.map(g => ({ x: g.x, z: g.z, w: g.w, d: g.d, y: g.y, h: 4.6, kind: 'gate' as const, gateId: g.id })),
  ...VALLEY_LANDMARKS.filter(l => l.kind === 'rest').map(l => ({ x: l.x, z: l.z, y: l.y, w: 0.9, d: 0.9, h: 2.8, kind: 'shrine' as const, landmarkId: l.id })),
  { x: -194, z: -335, y: 2, w: 3, d: 2, h: 1.3, kind: 'crate' },
  { x: -207, z: -353, y: 2, w: 2, d: 2, h: 1.3, kind: 'crate' },
  { x: -93, z: -376, y: 10, w: 1.2, d: 1.2, h: 4, kind: 'pillar' },
  ...[-169, -131].flatMap(x => [-499, -519].map(z => ({ x, z, y: 8, w: 1.4, d: 1.4, h: 9, kind: 'pillar' as const }))),
];

export const VALLEY_ENEMIES: (Vec3 & { id: string; kind: EnemyKind; name: string; facing: number })[] = [
  { id: 'valley-reaver', kind: 'reaver', name: '崖廊蓑衣客', x: -118, y: 24, z: -285, facing: 0 },
  { id: 'river-reaver', kind: 'reaver', name: '萤栈钩镰客', x: -165, y: 2, z: -343, facing: 1.57 },
  { id: 'river-lancer', kind: 'lancer', name: '水栈渔矛卫', x: -181, y: 2, z: -343, facing: 1.57 },
  { id: 'salt-reaver', kind: 'reaver', name: '盐市收债客', x: -198, y: 2, z: -344, facing: 1.57 },
  { id: 'salt-guard', kind: 'guard', name: '盐市守仓人', x: -202, y: 2, z: -356, facing: 0 },
  { id: 'salt-monk', kind: 'monk', name: '旧仓行脚僧', x: -239, y: 2, z: -347, facing: 1.57 },
  { id: 'mill-bank-reaver', kind: 'reaver', name: '水车收网客', x: -204, y: 2, z: -377, facing: 0 },
  { id: 'mill-lancer', kind: 'lancer', name: '沉舟守院人', x: -211, y: 2, z: -391, facing: 0 },
  { id: 'drowned-warden', kind: 'warden', name: '花礼 · 沉舟花渡', x: -202, y: 2, z: -404, facing: 0 },
  { id: 'aqueduct-reaver', kind: 'reaver', name: '白沫钩镰客', x: -202, y: 8, z: -443, facing: 0 },
  { id: 'aqueduct-monk', kind: 'monk', name: '引水桥行僧', x: -176, y: 8, z: -444, facing: -1.57 },
  { id: 'mountain-monk', kind: 'monk', name: '竹影拦路僧', x: -96, y: 2, z: -337, facing: -1.57 },
  { id: 'bamboo-reaver', kind: 'reaver', name: '竹关蓑衣客', x: -87, y: 10, z: -370, facing: 0 },
  { id: 'garden-monk', kind: 'monk', name: '灵露守竹人', x: -67, y: 10, z: -375, facing: -1.57 },
  { id: 'monastery-lancer', kind: 'lancer', name: '百阶执枪僧', x: -78, y: 14.8, z: -395, facing: 0 },
  { id: 'monastery-monk', kind: 'monk', name: '山寺迎客僧', x: -79, y: 18, z: -408, facing: 0 },
  { id: 'silent-abbot', kind: 'abbot', name: '瑞娅 · 霜钟听澜', x: -96, y: 18, z: -417, facing: 1.57 },
  { id: 'east-monk', kind: 'monk', name: '流经行脚僧', x: -119, y: 8, z: -449, facing: 1.57 },
  { id: 'reed-reaver', kind: 'reaver', name: '芦苇藏钩客', x: -147, y: 2, z: -390, facing: Math.PI },
  { id: 'bridge-monk', kind: 'monk', name: '锁桥护灯僧', x: -151, y: 8, z: -487, facing: 0 },
  { id: 'river-serpent', kind: 'serpent', name: '悠亚 · 星河守愿', x: -150, y: 8, z: -511, facing: 0 },
];

const box = (id: string, position: Triple, size: Triple, color: string): Solid => ({ id, position, size, color });
export const VALLEY_STRUCTURES: Solid[] = [
  ...VALLEY_SURFACES.filter(s => s.endY === undefined).map(s => box(`${s.id}-base`, [(s.x1 + s.x2) / 2, (s.y - 1.3) / 2, (s.z1 + s.z2) / 2], [s.x2 - s.x1 - 0.7, s.y + 0.7, s.z2 - s.z1 - 0.7], '#5d7772')),
  box('village-canopy', [-135.5, 7.5, -326], [11.5, 0.3, 10], '#796148'),
  ...[-140, -131].flatMap(x => [-330, -322].map(z => box(`village-post-${x}-${z}`, [x, 4.7, z], [0.35, 5.4, 0.35], '#897659'))),
  box('salt-store-roof', [-240, 9, -346], [13, 0.3, 20], '#805f47'),
  box('mill-west-wall', [-216, 5.5, -401], [0.5, 7, 27], '#789888'),
  box('monastery-rear-wall', [-88, 21, -426], [23, 6, 0.4], '#adab8e'),
  box('monastery-shelter', [-68, 23.5, -411], [10.5, 0.35, 10.5], '#9b714e'),
  box('source-altar-back', [-150, 12, -539], [17, 8, 0.5], '#99a78c'),
  ...[-173, -127].map(x => box(`naga-buttress-${x}`, [x, 14, -510], [1, 12, 33], '#789b8e')),
];
export const VALLEY_HOUSES: House[] = [
  { id: 'river-inn', position: [-111, 2, -325], width: 12, depth: 9, height: 8, color: '#b3a07e', sign: 'ท่าเรือ · 渡村' },
  { id: 'river-tea', position: [-146, 2, -327], width: 8, depth: 7, height: 7, color: '#8ca092', sign: '茶 · ชา' },
  { id: 'salt-north-house', position: [-196, 2, -325], width: 16, depth: 8, height: 8, color: '#a08f73', sign: 'เกลือ · 盐市' },
  { id: 'salt-east-house', position: [-181, 2, -357], width: 8, depth: 9, height: 9, color: '#90947d' },
  { id: 'watermill', position: [-224, 2, -402], width: 12, depth: 18, height: 12, color: '#85998b', sign: '沉舟水车' },
  { id: 'monastery-hall', position: [-88, 18, -435], width: 23, depth: 14, height: 10, color: '#b0a386', sign: 'วัด · 无声寺' },
];

export const VALLEY_LORE: Record<string, [string, string]> = {
  'valley-note': ['钟送归城人，水载未归灯。山河两岸，终汇一流。', '第二关「雾河回响」。沿下山阶到渡村；西边水路、东边山道均可先走。两岸各有一座水闸，开启后才能进入河心神殿。'],
  'village-note': ['渡船缆断在旧水车，归城的灯却还亮着。', '西行穿过盐市，击败花礼后修好系缆，渡船就能往返渡村、水车院与第一关的摆渡庵。东边竹关背后也有一扇回村近门。'],
  'bamboo-note': ['采茶人走后阶，行脚人循钟上山。', '西边的采茶栈桥下行能开回渡村的近路；向北登百阶是无声寺。东侧竹园藏着增强回血量的灵竹露。'],
  'river-note': ['双流归一，锁不认铜印，只认两岸的水声。', '西岸水车院与东岸无声寺的水闸都要亲手转动。汇灯台南边芦苇径可返回渡村，北面是悠亚守着的那伽沉殿。星杖直刺可以弹反，红色环流用跳跃或闪避。'],
};
