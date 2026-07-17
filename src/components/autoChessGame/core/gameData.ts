export type TraitId = 'aegis' | 'ember' | 'wild' | 'vanguard' | 'ranger' | 'mystic' | 'brawler';

export type UnitId =
  | 'sun_guard'
  | 'ember_blade'
  | 'gale_archer'
  | 'rift_brawler'
  | 'spark_mage'
  | 'clock_gunner'
  | 'grove_mender'
  | 'brass_colossus'
  | 'sun_phoenix'
  | 'rift_tyrant';

export type StarterId = 'bastion' | 'blaze' | 'echo';

export type AugmentId =
  | 'tempered'
  | 'overclock'
  | 'sharp_edge'
  | 'momentum'
  | 'triage'
  | 'payday'
  | 'execution'
  | 'second_wind';

export interface UnitDefinition {
  id: UnitId;
  name: string;
  title: string;
  glyph: string;
  color: string;
  accent: string;
  tier: number;
  cost: number;
  traits: TraitId[];
  hp: number;
  attack: number;
  armor: number;
  range: number;
  attackInterval: number;
  moveSpeed: number;
  abilityName: string;
  abilityDescription: string;
  shop: boolean;
}

export interface TraitDefinition {
  id: TraitId;
  name: string;
  color: string;
  threshold: number;
  description: string;
}

export interface StarterDefinition {
  id: StarterId;
  name: string;
  subtitle: string;
  description: string;
  unit: UnitId;
  color: string;
}

export interface AugmentDefinition {
  id: AugmentId;
  name: string;
  kicker: string;
  description: string;
  color: string;
}

export interface WaveUnit {
  id: UnitId;
  star?: 1 | 2 | 3;
}

export interface WaveDefinition {
  round: number;
  name: string;
  tag: 'normal' | 'elite' | 'boss';
  description: string;
  modifier: number;
  units: WaveUnit[];
}

export const TRAITS: Record<TraitId, TraitDefinition> = {
  aegis: {
    id: 'aegis',
    name: '曜甲',
    color: '#66d7ff',
    threshold: 2,
    description: '曜甲单位获得 18 护甲与 12% 最大生命。',
  },
  ember: {
    id: 'ember',
    name: '余烬',
    color: '#ff7a55',
    threshold: 2,
    description: '余烬单位的普攻会附加持续灼烧。',
  },
  wild: {
    id: 'wild',
    name: '荒灵',
    color: '#73e3a3',
    threshold: 2,
    description: '荒灵单位获得 12% 吸血。',
  },
  vanguard: {
    id: 'vanguard',
    name: '先锋',
    color: '#8ea8ff',
    threshold: 2,
    description: '先锋单位获得 18% 最大生命。',
  },
  ranger: {
    id: 'ranger',
    name: '游击',
    color: '#f3cf5b',
    threshold: 2,
    description: '游击单位获得 22% 攻击速度。',
  },
  mystic: {
    id: 'mystic',
    name: '秘术',
    color: '#c98cff',
    threshold: 2,
    description: '秘术单位开战时获得 35 点能量。',
  },
  brawler: {
    id: 'brawler',
    name: '斗阵',
    color: '#ffae57',
    threshold: 2,
    description: '斗阵单位获得 18% 攻击力。',
  },
};

export const UNIT_DEFS: Record<UnitId, UnitDefinition> = {
  sun_guard: {
    id: 'sun_guard',
    name: '曜盾卫士',
    title: '坚守前线',
    glyph: '盾',
    color: '#245f80',
    accent: '#7de2ff',
    tier: 1,
    cost: 1,
    traits: ['aegis', 'vanguard'],
    hp: 245,
    attack: 16,
    armor: 30,
    range: 48,
    attackInterval: 1.12,
    moveSpeed: 52,
    abilityName: '折光壁垒',
    abilityDescription: '获得大量护盾，并震击当前目标。',
    shop: true,
  },
  ember_blade: {
    id: 'ember_blade',
    name: '熔火刃',
    title: '近战爆发',
    glyph: '焰',
    color: '#7b2f2b',
    accent: '#ff8a5c',
    tier: 1,
    cost: 1,
    traits: ['ember', 'brawler'],
    hp: 178,
    attack: 25,
    armor: 12,
    range: 50,
    attackInterval: 0.92,
    moveSpeed: 64,
    abilityName: '熔断横斩',
    abilityDescription: '横扫身前敌人，并施加灼烧。',
    shop: true,
  },
  gale_archer: {
    id: 'gale_archer',
    name: '岚羽',
    title: '高速点射',
    glyph: '岚',
    color: '#245e4e',
    accent: '#7ef0bb',
    tier: 1,
    cost: 1,
    traits: ['wild', 'ranger'],
    hp: 132,
    attack: 21,
    armor: 6,
    range: 225,
    attackInterval: 0.84,
    moveSpeed: 58,
    abilityName: '追风三矢',
    abilityDescription: '连续射出三支箭，优先追击残血敌人。',
    shop: true,
  },
  rift_brawler: {
    id: 'rift_brawler',
    name: '裂隙猎手',
    title: '残血收割',
    glyph: '猎',
    color: '#4c3c72',
    accent: '#c4a1ff',
    tier: 2,
    cost: 2,
    traits: ['wild', 'brawler'],
    hp: 194,
    attack: 28,
    armor: 14,
    range: 52,
    attackInterval: 1.02,
    moveSpeed: 76,
    abilityName: '相位猎杀',
    abilityDescription: '跃向生命比例最低的敌人，残血时造成额外伤害。',
    shop: true,
  },
  spark_mage: {
    id: 'spark_mage',
    name: '星火术士',
    title: '范围轰击',
    glyph: '星',
    color: '#593270',
    accent: '#e7a3ff',
    tier: 2,
    cost: 2,
    traits: ['ember', 'mystic'],
    hp: 126,
    attack: 19,
    armor: 5,
    range: 205,
    attackInterval: 1.18,
    moveSpeed: 50,
    abilityName: '坠星火',
    abilityDescription: '轰击敌人最密集的区域，造成范围伤害。',
    shop: true,
  },
  clock_gunner: {
    id: 'clock_gunner',
    name: '机巧枪手',
    title: '直线穿透',
    glyph: '铳',
    color: '#36566f',
    accent: '#92d7ff',
    tier: 2,
    cost: 2,
    traits: ['aegis', 'ranger'],
    hp: 148,
    attack: 20,
    armor: 12,
    range: 245,
    attackInterval: 0.72,
    moveSpeed: 48,
    abilityName: '超载贯射',
    abilityDescription: '发射贯穿战场的高能弹，对一线敌人造成伤害。',
    shop: true,
  },
  grove_mender: {
    id: 'grove_mender',
    name: '森灵祭司',
    title: '战地治疗',
    glyph: '愈',
    color: '#28644b',
    accent: '#79f2ad',
    tier: 3,
    cost: 3,
    traits: ['wild', 'mystic'],
    hp: 152,
    attack: 14,
    armor: 9,
    range: 190,
    attackInterval: 1.22,
    moveSpeed: 46,
    abilityName: '生息回响',
    abilityDescription: '治疗生命比例最低的友军，并给予短暂持续恢复。',
    shop: true,
  },
  brass_colossus: {
    id: 'brass_colossus',
    name: '铜墙巨像',
    title: '群体控制',
    glyph: '岳',
    color: '#5f5435',
    accent: '#f2d276',
    tier: 3,
    cost: 3,
    traits: ['aegis', 'vanguard'],
    hp: 330,
    attack: 21,
    armor: 38,
    range: 52,
    attackInterval: 1.32,
    moveSpeed: 38,
    abilityName: '山崩震荡',
    abilityDescription: '震晕周围敌人并获得护盾。',
    shop: true,
  },
  sun_phoenix: {
    id: 'sun_phoenix',
    name: '焚天鸟',
    title: '全场灼烧',
    glyph: '凰',
    color: '#7b3e2c',
    accent: '#ffd166',
    tier: 4,
    cost: 4,
    traits: ['ember', 'ranger'],
    hp: 166,
    attack: 28,
    armor: 10,
    range: 220,
    attackInterval: 0.8,
    moveSpeed: 62,
    abilityName: '燎原羽雨',
    abilityDescription: '灼烧全部敌人，并恢复自身生命。',
    shop: true,
  },
  rift_tyrant: {
    id: 'rift_tyrant',
    name: '裂隙暴君',
    title: '终局首领',
    glyph: '王',
    color: '#501c45',
    accent: '#ff5dad',
    tier: 5,
    cost: 5,
    traits: [],
    hp: 1120,
    attack: 34,
    armor: 26,
    range: 75,
    attackInterval: 1.04,
    moveSpeed: 46,
    abilityName: '裂界冲击',
    abilityDescription: '冲击全场并短暂震晕所有敌人，半血后进入狂暴。',
    shop: false,
  },
};

export const SHOP_UNITS = (Object.keys(UNIT_DEFS) as UnitId[]).filter((id) => UNIT_DEFS[id].shop);

export const STARTERS: StarterDefinition[] = [
  {
    id: 'bastion',
    name: '壁垒协议',
    subtitle: '稳扎稳打',
    description: '携带曜盾卫士开局；基地生命 +4，所有护盾效果 +30%。',
    unit: 'sun_guard',
    color: '#69d8ff',
  },
  {
    id: 'blaze',
    name: '余烬协议',
    subtitle: '压血抢攻',
    description: '携带熔火刃开局；灼烧伤害 +40%，首次胜利额外获得 2 金币。',
    unit: 'ember_blade',
    color: '#ff8058',
  },
  {
    id: 'echo',
    name: '回响协议',
    subtitle: '灵活续航',
    description: '携带岚羽开局；荒灵吸血额外 +6%，初始金币 +1。',
    unit: 'gale_archer',
    color: '#76e7ae',
  },
];

export const AUGMENTS: AugmentDefinition[] = [
  { id: 'tempered', name: '回火装甲', kicker: '生存', description: '所有友军获得 16 护甲。', color: '#76cfff' },
  { id: 'overclock', name: '预充能', kicker: '技能', description: '所有友军开战时额外获得 35 能量。', color: '#c58cff' },
  { id: 'sharp_edge', name: '锐锋校准', kicker: '输出', description: '所有友军攻击力提高 15%。', color: '#ff986b' },
  { id: 'momentum', name: '战斗惯性', kicker: '节奏', description: '所有友军攻击速度提高 18%。', color: '#f4d35e' },
  { id: 'triage', name: '战地分诊', kicker: '续航', description: '每 2.5 秒治疗全部友军 3% 最大生命。', color: '#72e7a5' },
  { id: 'payday', name: '风险投资', kicker: '经济', description: '立即获得 6 金币，之后每回合收入 +1。', color: '#ffd166' },
  { id: 'execution', name: '弱点协议', kicker: '收割', description: '对生命低于 40% 的敌人造成 28% 额外伤害。', color: '#ff6b8a' },
  { id: 'second_wind', name: '不屈回路', kicker: '容错', description: '每名友军首次低于 30% 生命时恢复 24% 最大生命。', color: '#88a7ff' },
];

export const WAVES: WaveDefinition[] = [
  {
    round: 1,
    name: '边缘侦察队',
    tag: 'normal',
    description: '前排薄弱，适合熟悉站位。',
    modifier: 0.64,
    units: [{ id: 'sun_guard' }, { id: 'ember_blade' }],
  },
  {
    round: 2,
    name: '穿林小队',
    tag: 'normal',
    description: '岚羽会从后排持续输出。',
    modifier: 0.76,
    units: [{ id: 'sun_guard' }, { id: 'gale_archer' }, { id: 'ember_blade' }],
  },
  {
    round: 3,
    name: '星火突击',
    tag: 'normal',
    description: '小心术士的范围轰击。',
    modifier: 0.92,
    units: [{ id: 'sun_guard' }, { id: 'rift_brawler' }, { id: 'spark_mage' }],
  },
  {
    round: 4,
    name: '黄铜壁垒',
    tag: 'elite',
    description: '精英战：巨像控制前排，双岚羽压制后排。',
    modifier: 1.02,
    units: [{ id: 'brass_colossus' }, { id: 'gale_archer' }, { id: 'gale_archer' }, { id: 'spark_mage' }],
  },
  {
    round: 5,
    name: '荒灵猎团',
    tag: 'normal',
    description: '祭司会持续挽救残血友军。',
    modifier: 1.05,
    units: [{ id: 'sun_guard' }, { id: 'rift_brawler' }, { id: 'grove_mender' }, { id: 'spark_mage' }, { id: 'gale_archer' }],
  },
  {
    round: 6,
    name: '过载军列',
    tag: 'normal',
    description: '贯射会惩罚站成一线的阵容。',
    modifier: 1.1,
    units: [{ id: 'brass_colossus' }, { id: 'ember_blade' }, { id: 'clock_gunner' }, { id: 'grove_mender' }, { id: 'spark_mage' }],
  },
  {
    round: 7,
    name: '裂隙禁卫',
    tag: 'elite',
    description: '精英战：完整编队，没有明显短板。',
    modifier: 1.14,
    units: [{ id: 'sun_guard' }, { id: 'brass_colossus' }, { id: 'rift_brawler' }, { id: 'gale_archer' }, { id: 'spark_mage' }, { id: 'grove_mender' }],
  },
  {
    round: 8,
    name: '暴君降临',
    tag: 'boss',
    description: '终局首领：半血狂暴，务必准备续航或爆发。',
    modifier: 1,
    units: [{ id: 'rift_tyrant' }, { id: 'spark_mage' }, { id: 'grove_mender' }],
  },
];

export const BOARD_CAP_BY_ROUND = [3, 3, 4, 4, 5, 5, 6, 6];

export const tierOddsForRound = (round: number): number[] => {
  if (round <= 1) return [82, 18, 0, 0];
  if (round === 2) return [68, 32, 0, 0];
  if (round <= 4) return [48, 40, 12, 0];
  if (round <= 6) return [32, 42, 23, 3];
  return [22, 36, 34, 8];
};
