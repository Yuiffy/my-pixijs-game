import type { CharacterDef, InteriorDef, Region, WorldEntity } from './types';

export const TILE = 48;
export const WORLD_WIDTH = 56 * TILE;
export const WORLD_HEIGHT = 38 * TILE;
export const CAMPAIGN_VERSION = '0.2.0';

function character(id: string, name: string, role: string, color: number, hp: number, attack: number, defense: number, range: number, speed: number, skill: string, skillDescription: string): CharacterDef {
  return { id, name, role, color, hp, attack, defense, range, speed, skill, skillDescription, portrait: `/images/autochess/portraits/${id}.png` };
}

export const CHARACTERS: Record<string, CharacterDef> = {
  biscuit_sui: character('biscuit_sui', '饼干岁', '剑客', 0xe8bc70, 220, 25, 8, 46, 112, '应援剑光', '挥出扇形剑气，伤害附近敌人。手控时按空格施放。'),
  sui: character('sui', '岁己', '援护', 0xd7b1f2, 165, 22, 4, 200, 88, '晚安电波', '每七秒治疗全体队友，优先照顾气血最低的伙伴。'),
  shiori: character('shiori', '栞栞', '术士', 0xa9d9e3, 175, 29, 4, 215, 88, '书页风暴', '在目标身边卷起书页，对成群敌人造成伤害并打断攻击。'),
  pako: character('pako', '帕可', '游侠', 0xe4a3a3, 190, 28, 5, 230, 108, '追风连射', '连续两次命中当前目标，适合击破首领。'),
  seki_boar_king: character('seki_boar_king', '石狩', '守卫', 0xb3c3d5, 320, 21, 12, 48, 81, '猪王冲阵', '震退身边敌人并打断施法，恢复自身气血。'),
  mossback: character('mossback', '苔甲守卫', '守卫', 0x8dab7d, 260, 20, 9, 47, 66, '苔甲震荡', '震荡附近目标。'),
  'raccoon-archer': character('raccoon-archer', '纸面游弓', '游侠', 0xc7aa79, 125, 17, 2, 195, 87, '破空矢', '向最近目标发射强力箭矢。'),
  'rift-brawler-head': character('rift-brawler-head', '失真行者', '剑客', 0xbc91a0, 170, 19, 5, 42, 96, '乱码重击', '重击附近目标。'),
  'rift-stalker-head': character('rift-stalker-head', '噪声潜影', '刺客', 0xac96ca, 135, 23, 2, 40, 135, '瞬影', '扑向后排。'),
  'clock-gunner': character('clock-gunner', '无声钟使', '术士', 0xd2b578, 310, 28, 6, 210, 76, '停摆钟声', '钟波伤害多名目标并打断攻击。'),
  tower_god: character('tower_god', '残塔镇守', '守卫', 0x8cacc1, 490, 31, 12, 52, 65, '遗迹回响', '冲击附近目标。'),
  'rift-tyrant': character('rift-tyrant', '虚境主宰', '首领', 0xd88096, 1050, 39, 13, 72, 75, '断线风暴', '周期性攻击全队；气血低于一半后攻击加快。'),
};

const point = (tx: number, ty: number) => ({ x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 });

export const REGIONS: Region[] = [
  { id: 'town', name: '回音镇', subtitle: '从一声「晚上好」出发', color: 0xcac08b, ...point(10, 9) },
  { id: 'bamboo', name: '青笺林', subtitle: '被风吹散的书页', color: 0x86bd99, ...point(18, 17) },
  { id: 'grove', name: '晚风泽', subtitle: '长夜仍有歌声', color: 0xa6be81, ...point(12, 28) },
  { id: 'pass', name: '鸣钟岭', subtitle: '越过静止的钟声', color: 0xb9adb1, ...point(38, 9) },
  { id: 'ruins', name: '星陨旧城', subtitle: '记忆沉入残塔', color: 0x91b5c4, ...point(41, 28) },
  { id: 'rift', name: '断线之门', subtitle: '把故事带回现实', color: 0xc48ba9, ...point(48, 18) },
];

export const ENTITIES: WorldEntity[] = [
  { id: 'sui', name: '岁己', kind: 'npc', characterId: 'sui', description: '「你怎么也变成饼干了？先结伴吧。你的世界和我的世界，一起找回去。」', ...point(11, 10) },
  { id: 'town_camp', name: '回音客栈', kind: 'camp', description: '热茶与安静的床铺。掌柜替每个迷路的人留着灯。', ...point(8, 11) },
  { id: 'town_cache', name: '穿越者的行囊', kind: 'chest', description: '里面放着路费和两瓶恢复药。便笺上写着：不要独自面对整片世界。', gold: 45, ...point(5, 12) },
  { id: 'shiori', name: '栞栞', kind: 'npc', characterId: 'shiori', requires: 'bamboo_echo', description: '「青笺林里的噪声抢走了我的书页。帮我取回来，我就和你走。」', ...point(18, 14) },
  { id: 'bamboo_echo', name: '散页的噪声', kind: 'encounter', description: '两团噪声绕着书页打转。这是找回栞栞记忆的第一步。建议二人同行。', enemies: ['rift-brawler-head', 'raccoon-archer'], power: 0.8, gold: 35, xp: 65, ...point(19, 18) },
  { id: 'forest_cache', name: '林中旧匣', kind: 'chest', description: '一个同样迷路的观众留下了补给，祝后来者好运。', gold: 35, ...point(22, 22) },
  { id: 'grove_camp', name: '晚风驿站', kind: 'camp', description: '芦苇在风中低语，可以在此休整、锻造或买药。', ...point(15, 25) },
  { id: 'pako', name: '帕可', kind: 'npc', characterId: 'pako', requires: 'reed_beast', description: '「河边那只怪物把驿道堵住啦。赶走它，我们一起追上晚风。」', ...point(12, 28) },
  { id: 'reed_beast', name: '芦湾拦路客', kind: 'encounter', description: '被失真感染的苔甲兽盘踞驿道，帕可正等着有人搭把手。', enemies: ['mossback', 'rift-stalker-head'], power: 0.9, gold: 50, xp: 80, ...point(16, 28) },
  { id: 'grove_warden', name: '暮泽守望者', kind: 'encounter', characterId: 'mossback', description: '第一枚归途碎片在它的苔甲中闪光。建议三至四人、队伍二级。', enemies: ['mossback', 'rift-brawler-head', 'raccoon-archer'], power: 1.25, gold: 90, xp: 135, shard: true, ...point(8, 30) },
  { id: 'bridge_patrol', name: '古桥巡影', kind: 'encounter', description: '潜影在桥头徘徊。道路仍可绕行，也可击败它们补充行囊。', enemies: ['rift-stalker-head', 'rift-stalker-head', 'raccoon-archer'], power: 1.05, gold: 55, xp: 90, ...point(24, 11) },
  { id: 'pass_guard', name: '山口失声者', kind: 'encounter', description: '石狩守着山口，正在寻找能与他并肩的人。击破失声者证明你的决心。', enemies: ['mossback', 'rift-brawler-head', 'rift-stalker-head'], power: 1.05, gold: 65, xp: 100, ...point(33, 10) },
  { id: 'seki_boar_king', name: '石狩', kind: 'npc', characterId: 'seki_boar_king', requires: 'pass_guard', description: '「你先把山口清了？好，这次换我替你挡在前面。」', ...point(36, 10) },
  { id: 'pass_camp', name: '听钟茶寮', kind: 'camp', description: '钟声抵达不了的背风处。这里的茶永远是热的。', ...point(35, 12) },
  { id: 'bell_keeper', name: '停摆司钟', kind: 'encounter', characterId: 'clock-gunner', description: '它想把每一次告别永远停住。第二枚归途碎片藏在钟心。建议队伍三级。', enemies: ['clock-gunner', 'mossback', 'rift-stalker-head'], power: 1.35, gold: 105, xp: 165, shard: true, ...point(41, 8) },
  { id: 'pass_cache', name: '山巅行囊', kind: 'chest', description: '旧旅人的地图上圈出了南方古桥和一座残塔。', gold: 60, ...point(46, 10) },
  { id: 'ruins_camp', name: '星屑营地', kind: 'camp', description: '伙伴们在残垣间升起篝火。离最后的路已经不远。', ...point(37, 27) },
  { id: 'ruins_patrol', name: '旧城追忆', kind: 'encounter', description: '旧城回响化成了游弓与潜影，击败它们能让残存的记忆安静下来。', enemies: ['clock-gunner', 'raccoon-archer', 'rift-stalker-head'], power: 1.2, gold: 65, xp: 105, ...point(34, 30) },
  { id: 'ruin_sentinel', name: '忘却镇守', kind: 'encounter', characterId: 'tower_god', description: '最后一枚归途碎片被锁在残塔里。建议队伍四级，带上治疗和守卫。', enemies: ['tower_god', 'raccoon-archer', 'rift-brawler-head'], power: 1.35, gold: 120, xp: 190, shard: true, ...point(43, 28) },
  { id: 'ruins_cache', name: '星屑宝匣', kind: 'chest', description: '匣底留着最后一张应援券：无论在哪个世界，都要好好生活。', gold: 75, ...point(48, 31) },
  { id: 'rift_tyrant', name: '虚境主宰', kind: 'encounter', characterId: 'rift-tyrant', requires: 'shards', description: '「留在这里吧，永远不必说再见。」用三枚碎片打开裂隙，与伙伴结束这场无尽的直播。建议四至五级、武器锻造二次。', enemies: ['rift-tyrant', 'rift-stalker-head', 'clock-gunner'], power: 1.2, gold: 150, xp: 240, ...point(48, 18) },
  { id: 'home', name: '回到现实', kind: 'portal', requires: 'rift_tyrant', description: '屏幕另一侧，你的房间正亮着一盏灯。伙伴的声音仍然清晰。', ...point(51, 18) },
  { id: 'inn_door', name: '回音客栈 · 入内', kind: 'door', destination: 'inn', description: '门内传来碗筷轻响。掌柜正在擦拭一盏没有灯芯的旧灯。', x: 312, y: 456 },
  { id: 'archive_door', name: '青笺书院 · 入内', kind: 'door', destination: 'archive', description: '许多无名者的故事被收藏在此。书架深处有一封未寄出的信。', x: 816, y: 696 },
  { id: 'forge_door', name: '听钟铁铺 · 入内', kind: 'door', destination: 'forge', description: '铁匠的炉火照着一幅老地图，图上画着通往书院的地下旧道。', x: 1704, y: 456 },
  { id: 'ruin_door', name: '旧城观星台 · 入内', kind: 'door', destination: 'ruin', description: '残塔底层还有可以通行的入口。里面似乎有人在反复念着一封信。', x: 1944, y: 1320 },
  { id: 'grove_lantern', name: '芦湾旧灯', kind: 'lore', storyId: 'sui_lantern', description: '灯芯熄灭很久，灯罩里却还有一点温度。石阶上刻着：为晚归的人留一盏灯。', ...point(11, 25) },
  { id: 'inn_exit', name: '返回回音镇', kind: 'exit', destination: 'world', area: 'inn', description: '推开木门，回音镇的风正从檐下经过。', x: 480, y: 600 },
  { id: 'inn_keeper', name: '客栈掌柜', kind: 'npc', storyId: 'sui_quest', area: 'inn', description: '掌柜擦着一盏没有灯芯的旧灯。', x: 288, y: 264 },
  { id: 'inn_guestbook', name: '客栈留言簿', kind: 'lore', storyId: 'inn_lore', area: 'inn', description: '「今天来了个总说晚上好的姑娘。她说灯不是为了赶走黑夜，是为了告诉人，这里有人等。」最后一行只有一句：先好好休息。', x: 744, y: 408 },
  { id: 'archive_exit', name: '返回青笺林', kind: 'exit', destination: 'world', area: 'archive', description: '书院之外，书页像树叶一样轻轻翻动。', x: 480, y: 600 },
  { id: 'archive_curator', name: '守书人', kind: 'npc', storyId: 'shiori_quest', area: 'archive', description: '守书人将一只空信封推到桌边。', x: 456, y: 264 },
  { id: 'archive_catalog', name: '失名目录', kind: 'lore', storyId: 'archive_lore', area: 'archive', description: '目录里都是没有署名的故事。有一页标着「观星台 · 寄给后来者」，旁边用铅笔写道：保存一段记忆，与让它抵达一个人，并不总是同一件事。', x: 216, y: 408 },
  { id: 'forge_exit', name: '返回鸣钟岭', kind: 'exit', destination: 'world', area: 'forge', description: '炉火暖意渐渐远去，山风把钟声送入耳畔。', x: 480, y: 600 },
  { id: 'forge_smith', name: '听钟铁匠', kind: 'npc', storyId: 'forge_lore', area: 'forge', description: '「武器不是越重越好。远行的人要把力气留给明天。」铁匠指向墙上地图：旧城观星台曾有一条通往青笺书院的秘道，镇守放下执念后，路才会重新出现。', x: 288, y: 264 },
  { id: 'forge_blueprint', name: '旧道拓片', kind: 'lore', storyId: 'passage_lore', area: 'forge', description: '拓片上刻着星陨旧城与青笺书院之间的地脉。旁注：门不认钥匙，只认被解开的记忆。锻造与补给仍由门外茶寮代办。', x: 744, y: 408 },
  { id: 'ruin_exit', name: '返回星陨旧城', kind: 'exit', destination: 'world', area: 'ruin', description: '沿着来时的石阶，返回星屑营地附近。', x: 480, y: 600 },
  { id: 'observatory_ledger', name: '观星台碑记', kind: 'lore', storyId: 'shiori_inscription', area: 'ruin', description: '碑上记着一个守望者的最后工作：把未写完的信交给后来者。但他把「守住」误认成了「永不交出」。', x: 216, y: 264 },
  { id: 'memory_warden', name: '执信守望者', kind: 'encounter', characterId: 'tower_god', area: 'ruin', requiresFlag: 'shiori_inscription_read', description: '它抱着信不肯放手。这是可选的强敌：完成栞栞的支线需要让它安息。建议三至四人、队伍三级并备好恢复药。', enemies: ['tower_god', 'rift-stalker-head', 'raccoon-archer'], power: 1.3, gold: 85, xp: 120, x: 696, y: 264 },
  { id: 'final_letter', name: '未写完的信', kind: 'lore', storyId: 'shiori_letter', area: 'ruin', requires: 'memory_warden', description: '「如果你读到这里，别替我把结尾写得漂亮。告诉下一个人，今天也可以从头开始。」落款处留着一行空白。', x: 696, y: 408 },
  { id: 'memory_passage', name: '记忆旧道', kind: 'lore', storyId: 'memory_passage', destination: 'archive', area: 'ruin', requires: 'memory_warden', description: '石墙后的星光连成了一条窄路，通往青笺书院。', x: 816, y: 504 },
];

export const INTERIORS: Record<string, InteriorDef> = {
  inn: {
    id: 'inn',
    name: '回音客栈',
    subtitle: '给晚归的人留一盏灯',
    width: 960,
    height: 672,
    style: 'inn',
    spawn: { x: 480, y: 552 },
    props: [
      { x: 144, y: 96, w: 240, h: 96, kind: 'table' }, { x: 576, y: 96, w: 192, h: 96, kind: 'bed' },
      { x: 192, y: 336, w: 144, h: 96, kind: 'table' }, { x: 672, y: 336, w: 144, h: 48, kind: 'table' },
    ],
  },
  archive: {
    id: 'archive',
    name: '青笺书院',
    subtitle: '谁来替故事写下最后一句',
    width: 960,
    height: 672,
    style: 'archive',
    spawn: { x: 480, y: 552 },
    props: [
      { x: 96, y: 96, w: 96, h: 240, kind: 'shelf' }, { x: 768, y: 96, w: 96, h: 240, kind: 'shelf' },
      { x: 384, y: 144, w: 192, h: 48, kind: 'table' }, { x: 336, y: 384, w: 288, h: 48, kind: 'table' },
    ],
  },
  forge: {
    id: 'forge',
    name: '听钟铁铺',
    subtitle: '炉火记得每一个归来的人',
    width: 960,
    height: 672,
    style: 'forge',
    spawn: { x: 480, y: 552 },
    props: [
      { x: 144, y: 96, w: 240, h: 96, kind: 'forge' }, { x: 672, y: 96, w: 144, h: 192, kind: 'shelf' },
      { x: 192, y: 384, w: 192, h: 48, kind: 'table' }, { x: 672, y: 336, w: 144, h: 48, kind: 'table' },
    ],
  },
  ruin: {
    id: 'ruin',
    name: '旧城观星台',
    subtitle: '一封被守住太久的信',
    width: 960,
    height: 672,
    style: 'ruin',
    spawn: { x: 480, y: 552 },
    props: [
      { x: 96, y: 96, w: 192, h: 96, kind: 'shelf' }, { x: 624, y: 96, w: 144, h: 96, kind: 'crystal' },
      { x: 384, y: 192, w: 96, h: 192, kind: 'crystal' }, { x: 192, y: 384, w: 96, h: 96, kind: 'table' },
    ],
  },
};

export const BUILDINGS: { x: number; y: number; w: number; h: number; kind: 'house' | 'shrine' | 'gate' }[] = [
  { x: 5 * TILE, y: 7 * TILE, w: 3 * TILE, h: 2 * TILE, kind: 'house' },
  { x: 10 * TILE, y: 6 * TILE, w: 3 * TILE, h: 2 * TILE, kind: 'house' },
  { x: 13 * TILE, y: 11 * TILE, w: 3 * TILE, h: 2 * TILE, kind: 'house' },
  { x: 16 * TILE, y: 12 * TILE, w: 2 * TILE, h: 2 * TILE, kind: 'shrine' },
  { x: 13 * TILE, y: 23 * TILE, w: 3 * TILE, h: 2 * TILE, kind: 'house' },
  { x: 34 * TILE, y: 7 * TILE, w: 3 * TILE, h: 2 * TILE, kind: 'house' },
  { x: 40 * TILE, y: 5 * TILE, w: 3 * TILE, h: 2 * TILE, kind: 'shrine' },
  { x: 39 * TILE, y: 25 * TILE, w: 3 * TILE, h: 2 * TILE, kind: 'shrine' },
  { x: 45 * TILE, y: 28 * TILE, w: 2 * TILE, h: 2 * TILE, kind: 'house' },
];

const roads = [
  [4, 10, 49, 10], [9, 10, 9, 30], [9, 15, 19, 15], [19, 15, 19, 22],
  [9, 27, 45, 27], [12, 27, 12, 30], [16, 25, 16, 28], [8, 30, 16, 30],
  [35, 10, 35, 27], [41, 8, 41, 10], [35, 18, 51, 18], [43, 27, 43, 31],
  [43, 31, 49, 31], [48, 10, 48, 18], [35, 30, 43, 30],
];

export type TileKind = 'grass' | 'path' | 'water' | 'bridge' | 'forest' | 'mountain' | 'town' | 'ruins';

export function tileAt(tx: number, ty: number): TileKind {
  if (tx < 1 || ty < 1 || tx > 54 || ty > 36) return 'mountain';
  if (tx >= 26 && tx <= 28) return ty === 10 || ty === 27 ? 'bridge' : 'water';
  if (roads.some(([x1, y1, x2, y2]) => tx >= x1 && tx <= x2 && ty >= y1 && ty <= y2)) return 'path';
  if (ENTITIES.some((e) => !e.area && Math.abs(e.x / TILE - 0.5 - tx) < 1.5 && Math.abs(e.y / TILE - 0.5 - ty) < 1.5)) {
    return tx > 36 && ty > 23 ? 'ruins' : tx < 16 && ty < 15 ? 'town' : 'grass';
  }
  if (tx >= 4 && tx <= 16 && ty >= 6 && ty <= 14) return 'town';
  if (tx >= 37 && ty >= 24 && ty <= 33) return 'ruins';
  if ((tx >= 30 && ty <= 5) || (tx >= 30 && tx <= 32 && ty >= 14 && ty <= 23) || (tx >= 40 && tx <= 45 && ty >= 13 && ty <= 15) || (tx <= 5 && ty >= 17 && ty <= 25)) return 'mountain';
  if ((tx >= 14 && tx <= 24 && ty >= 12 && ty <= 24) || (tx >= 3 && tx <= 20 && ty >= 25 && ty <= 34) || (tx >= 47 && ty <= 8)) return 'forest';
  return 'grass';
}

export function areaTileAt(area: string, tx: number, ty: number): TileKind | 'floor' | 'wall' | 'carpet' {
  if (area === 'world') return tileAt(tx, ty);
  const room = INTERIORS[area];
  if (!room || tx < 1 || ty < 1 || tx >= room.width / TILE - 1 || ty >= room.height / TILE - 1) return 'wall';
  return tx >= 8 && tx <= 11 && ty >= 8 && room.style !== 'ruin' ? 'carpet' : 'floor';
}

export function isWalkable(x: number, y: number, area = 'world'): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  const radius = 12;
  if (area !== 'world') {
    const room = INTERIORS[area];
    if (!room || x < TILE + radius || y < TILE + radius || x > room.width - TILE - radius || y > room.height - TILE - radius) return false;
    return !room.props.some((p) => x + radius > p.x && x - radius < p.x + p.w && y + radius > p.y && y - radius < p.y + p.h);
  }
  if (x < TILE + radius || y < TILE + radius || x > WORLD_WIDTH - TILE - radius || y > WORLD_HEIGHT - TILE - radius) return false;
  for (const [dx, dy] of [[-radius, -radius], [radius, -radius], [-radius, radius], [radius, radius]]) {
    const tile = tileAt(Math.floor((x + dx) / TILE), Math.floor((y + dy) / TILE));
    if (tile === 'water' || tile === 'mountain') return false;
  }
  return !BUILDINGS.some((b) => x + radius > b.x && x - radius < b.x + b.w && y + radius > b.y && y - radius < b.y + b.h);
}
