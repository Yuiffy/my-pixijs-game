/* eslint-disable implicit-arrow-linebreak */

export const TRAIT_IDS = [
  "aegis",
  "ember",
  "wild",
  "rift",
  "clockwork",
  "vanguard",
  "ranger",
  "mystic",
  "brawler",
  "assassin",
  "chuanmei",
  "gluttony",
  "skeleton_soldier",
  "gen27",
  "yue_gang",
  "sui_shiori",
] as const;

export type TraitId = (typeof TRAIT_IDS)[number];

export const SHOP_UNIT_IDS = [
  // 每位角色暂时只保留一个低费代表；岁己保留多种形态。
  // 1 费
  "sun_guard",
  "ember_blade",
  "gale_archer",
  "rift_stalker",
  "cog_scribe",
  "mossback",
  "sui",
  // 2 费
  "rift_brawler",
  "sui_blue",
  "shiori",
  "spark_mage",
  "clock_gunner",
  "dawn_duelist",
  "grove_mender",
  "cinder_ram",
  // 3 费
  "sui_bird",
  "sui_flower",
  "yua",
  "mitsuri",
  // 4 费
  "sui_cat",
  "nagisa",
  // 5 费
  "biscuit_sui",
] as const;

export type ShopUnitId = (typeof SHOP_UNIT_IDS)[number];
export type UnitId = ShopUnitId | "rift_tyrant";

export type StarterId = "bastion" | "blaze" | "echo";

export type AugmentId =
  | "tempered"
  | "overclock"
  | "sharp_edge"
  | "momentum"
  | "triage"
  | "payday"
  | "execution"
  | "second_wind";

export interface UnitDefinition {
  id: UnitId;
  name: string;
  title: string;
  glyph: string;
  color: string;
  accent: string;
  tier: 1 | 2 | 3 | 4 | 5;
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
  portrait?: string;
  portraitFocus?: "top" | "center";
  portraitStyle?: "round" | "sprite";
  shop: boolean;
}

export interface TraitDefinition {
  id: TraitId;
  name: string;
  family: "阵营" | "职业" | "关系";
  color: string;
  thresholds: readonly number[];
  description: string;
  bonuses: readonly string[];
}

export interface StarterDefinition {
  id: StarterId;
  name: string;
  subtitle: string;
  description: string;
  unit: ShopUnitId;
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
  tag: "normal" | "elite" | "boss";
  description: string;
  modifier: number;
  units: WaveUnit[];
}

export const TRAITS: Record<TraitId, TraitDefinition> = {
  aegis: { id: "aegis", name: "VR学园", family: "阵营", color: "#66d7ff", thresholds: [2, 4, 6], description: "学园组负责把直播间秩序和队伍前排一起守住。", bonuses: ["学园成员 +12 护甲、+7% 最大生命", "学园成员 +25/+14%；全队开战获 8% 最大生命护盾", "学园成员 +42/+23%；全队开战获 16% 最大生命护盾"] },
  ember: { id: "ember", name: "深夜档", family: "阵营", color: "#ff7657", thresholds: [2, 4, 6], description: "深夜开播越久，弹幕火力越不会停。", bonuses: ["深夜档成员普攻灼烧 35% 攻击力", "深夜档 65%；所有远程友军普攻灼烧 25% 攻击力", "深夜档 105%；所有远程友军普攻灼烧 50% 攻击力"] },
  wild: { id: "wild", name: "毛茸茸", family: "阵营", color: "#70e1a0", thresholds: [2, 4, 6], description: "耳朵、尾巴与毛茸茸的气势会让队友越打越有精神。", bonuses: ["毛茸茸成员获得 8% 吸血", "毛茸茸 15%；所有近战友军获得 6% 吸血", "毛茸茸 24%；所有近战友军获得 12% 吸血"] },
  rift: { id: "rift", name: "特工频道", family: "阵营", color: "#c08bff", thresholds: [2, 4, 6], description: "特工组最擅长盯住残血目标，替直播间完成补刀。", bonuses: ["特工频道成员对半血目标 +15% 伤害", "特工频道 +32%；全体友军对半血目标 +10% 伤害", "特工频道 +55%；全体友军对半血目标 +20% 伤害"] },
  clockwork: { id: "clockwork", name: "设备组", family: "阵营", color: "#e5bf68", thresholds: [2, 4, 6], description: "调音、调画面、调设备；一切为了更快的直播节奏。", bonuses: ["设备组成员 +10% 攻速、每击 +4 能量", "设备组 +22%/+8；所有远程友军 +10% 攻速", "设备组 +38%/+14；所有远程友军 +22% 攻速、每击 +4 能量"] },
  vanguard: { id: "vanguard", name: "怕死", family: "职业", color: "#819eff", thresholds: [2, 4, 6], description: "怕死位最懂得保全自己，生命和护甲越高越能熬过直播事故。", bonuses: ["怕死单位 +12% 最大生命、+8 护甲", "怕死单位 +25% 最大生命、+18 护甲；所有近战友军 +8% 最大生命、+6 护甲", "怕死单位 +42% 最大生命、+32 护甲；所有近战友军 +16% 最大生命、+12 护甲"] },
  ranger: { id: "ranger", name: "射手", family: "职业", color: "#f2d15e", thresholds: [2, 4, 6], description: "射手擅长持续远程输出，高阶会带动全队后排火力。", bonuses: ["射手单位 +12% 攻速", "射手单位 +26% 攻速；所有远程友军 +15% 攻速", "射手单位 +45% 攻速；所有远程友军 +30% 攻速"] },
  mystic: { id: "mystic", name: "杂谈", family: "职业", color: "#de87ff", thresholds: [2, 4, 6], description: "杂谈位开麦快、话题多，总能把全队情绪带起来。", bonuses: ["杂谈单位开战 +20 能量", "杂谈开战 +45、施法返还 8；全体友军开战 +10 能量", "杂谈开战 +70、施法返还 15；全体友军开战 +22 能量"] },
  brawler: { id: "brawler", name: "整活", family: "职业", color: "#ffae57", thresholds: [2, 4, 6], description: "整活位靠气势正面开团，越多人围观越有劲。", bonuses: ["整活单位 +12% 攻击力", "整活 +26%；所有近战友军 +10% 攻击力", "整活 +45%；所有近战友军 +20% 攻击力"] },
  assassin: { id: "assassin", name: "潜伏", family: "职业", color: "#ff6fae", thresholds: [2, 4, 6], description: "潜伏位绕开前排，专门抓住后排的直播事故。", bonuses: ["潜伏单位跃向后排、获得 15% 暴击率", "潜伏 30% 暴击；所有远程友军 +12% 暴击率", "潜伏 50% 暴击；所有远程友军 +25% 暴击率"] },
  chuanmei: {
    id: "chuanmei",
    name: "川妹",
    family: "关系",
    color: "#ff6b4a",
    thresholds: [2, 3],
    description: "川妹开播，辣味弹幕会把敌人持续烫熟。",
    bonuses: ["川妹成员普攻附加辣味灼烧", "川妹成员灼烧增强；全体远程友军普攻附带较弱辣味灼烧"],
  },
  gluttony: {
    id: "gluttony",
    name: "贪吃",
    family: "关系",
    color: "#93d86b",
    thresholds: [2, 4],
    description: "吃饱才有力气整活；成长只影响外观，不改变碰撞体积。",
    bonuses: ["贪吃成员每 3 秒回复 3% 最大生命，并缓慢长大", "全体友军每 3 秒回复 1.5% 最大生命；贪吃成员回复提升至 4%"],
  },
  skeleton_soldier: {
    id: "skeleton_soldier",
    name: "骷髅兵搭档",
    family: "关系",
    color: "#d9e6f4",
    thresholds: [2],
    description: "岁己和栞栞的骷髅兵联动，走位总会差一格。",
    bonuses: ["骷髅兵成员获得 15% 闪避率"],
  },
  gen27: {
    id: "gen27",
    name: "27期",
    family: "关系",
    color: "#bd9bff",
    thresholds: [2, 4, 6],
    description: "27期成员靠近彼此时会进入联动状态。",
    bonuses: ["邻近另一名 27 期成员时 +12% 攻速、+12% 移速", "邻近加成提升至 20%，开战 +10 能量", "邻近加成提升至 30%，开战 +22 能量"],
  },
  yue_gang: {
    id: "yue_gang",
    name: "粤帮",
    family: "关系",
    color: "#59d6c2",
    thresholds: [2, 4],
    description: "粤帮看到同伴开打，会直接闪现过去帮一手。",
    bonuses: ["粤帮成员每 5 秒可闪现至同伴目标旁协战", "最多两名粤帮成员同时协战，闪现冷却缩短"],
  },
  sui_shiori: {
    id: "sui_shiori",
    name: "岁栞搭档",
    family: "关系",
    color: "#f0aee7",
    thresholds: [2, 4],
    description: "必须同时有带岁栞标签的岁己与栞栞在场；任一人施法都会呼叫另一人补一发弹幕。",
    bonuses: ["岁己与栞栞施法后触发 65% 攻击力协战弹幕，冷却 2.5 秒", "协战弹幕提升至 85%，共享冷却缩短至 1.8 秒"],
  },
};

export const traitLevelForCount = (trait: TraitDefinition, count: number) =>
  trait.thresholds.filter((threshold) => count >= threshold).length;

const unit = (definition: UnitDefinition) => definition;

export const UNIT_DEFS: Record<UnitId, UnitDefinition> = {
  // 1 费：可靠的构筑零件，每个都能明确指向一条阵容路线。
  sun_guard: unit({
    id: "sun_guard",
    name: "果冻风纪",
    title: "灰泽满Hazel · 前排防守",
    glyph: "满",
    color: "#245f80",
    accent: "#7de2ff",
    tier: 1,
    cost: 1,
    traits: ["aegis", "vanguard", "gen27"],
    hp: 245,
    attack: 16,
    armor: 30,
    range: 48,
    attackInterval: 1.12,
    moveSpeed: 52,
    abilityName: "折光壁垒",
    abilityDescription: "获得护盾，震击并短暂眩晕当前目标。",
    shop: true,
  }),
  ember_blade: unit({
    id: "ember_blade",
    name: "炽焰萝卜",
    title: "炽焰前锋 · 近战灼烧",
    glyph: "萝",
    color: "#7b2f2b",
    accent: "#ff8a5c",
    tier: 1,
    cost: 1,
    traits: ["ember", "brawler", "gen27"],
    hp: 178,
    attack: 25,
    armor: 12,
    range: 50,
    attackInterval: 0.92,
    moveSpeed: 64,
    abilityName: "炽焰萝卜突击",
    abilityDescription: "挥舞炽焰萝卜短棍横扫目标周围的敌人，并施加灼烧。",
    portrait: "/images/autochess/portraits/ember-blade.png",
    portraitStyle: "sprite",
    shop: true,
  }),
  gale_archer: unit({
    id: "gale_archer",
    name: "浣熊射手",
    title: "风痕巡林者 · 远程输出",
    glyph: "浣",
    color: "#245e4e",
    accent: "#7ef0bb",
    tier: 1,
    cost: 1,
    traits: ["wild", "ranger", "gen27"],
    hp: 132,
    attack: 21,
    armor: 6,
    range: 225,
    attackInterval: 0.84,
    moveSpeed: 58,
    abilityName: "尾巴三连拍",
    abilityDescription: "用毛茸茸的大尾巴连续射出三道尾影，优先追击残血敌人。",
    portrait: "/images/autochess/portraits/raccoon-archer.png",
    portraitStyle: "sprite",
    shop: true,
  }),
  rift_stalker: unit({
    id: "rift_stalker",
    name: "未知夜袭",
    title: "未知夜Michiya · 潜伏收割",
    glyph: "夜",
    color: "#493464",
    accent: "#c99cff",
    tier: 1,
    cost: 1,
    traits: ["rift", "assassin", "yue_gang"],
    hp: 146,
    attack: 23,
    armor: 8,
    range: 48,
    attackInterval: 0.88,
    moveSpeed: 78,
    abilityName: "未知夜突袭",
    abilityDescription: "闪至最虚弱的敌人身旁补刀，并获得小额护盾。",
    portrait: "/images/livers/michiya.webp",
    portraitFocus: "top",
    shop: true,
  }),
  cog_scribe: unit({
    id: "cog_scribe",
    name: "轴伊·转轴术士",
    title: "轴伊Joi · 能量干扰",
    glyph: "轴",
    color: "#4d4936",
    accent: "#e8ca75",
    tier: 1,
    cost: 1,
    traits: ["clockwork", "mystic"],
    hp: 138,
    attack: 18,
    armor: 8,
    range: 190,
    attackInterval: 1.08,
    moveSpeed: 48,
    abilityName: "轴心电波",
    abilityDescription: "以转轴电波电击两个敌人并削减其能量。",
    portrait: "/images/livers/joi.png",
    portraitFocus: "top",
    shop: true,
  }),
  mossback: unit({
    id: "mossback",
    name: "犬绒·绒绒卫士",
    title: "犬绒Mofu · 前排续航",
    glyph: "绒",
    color: "#315b40",
    accent: "#80d792",
    tier: 1,
    cost: 1,
    traits: ["wild", "vanguard"],
    hp: 255,
    attack: 15,
    armor: 24,
    range: 48,
    attackInterval: 1.2,
    moveSpeed: 45,
    abilityName: "绒绒守护",
    abilityDescription: "毛茸茸地保护自己，并为最虚弱的友军提供护盾。",
    shop: true,
  }),
  sui: unit({
    id: "sui",
    name: "贪吃岁",
    title: "岁己SUI · 前排防守",
    glyph: "红",
    color: "#8f3f4e",
    accent: "#ffabb5",
    tier: 1,
    cost: 1,
    traits: ["vanguard", "gluttony"],
    hp: 244,
    attack: 17,
    armor: 24,
    range: 48,
    attackInterval: 1.12,
    moveSpeed: 52,
    abilityName: "开饭点名",
    abilityDescription: "呼喊大家在吗，获得护盾，震击并短暂眩晕当前目标。",
    portrait: "/images/materials/red/1d5ad005aff0b4b648a0f1ef6b8d0cd71954091502.png",
    portraitFocus: "top",
    shop: true,
  }),

  // 2 费：开始提供反后排、控制和续航等战术答案。
  rift_brawler: unit({
    id: "rift_brawler",
    name: "废柴神收割",
    title: "克罗雅Kloa · 残血收割",
    glyph: "雅",
    color: "#4c3c72",
    accent: "#c4a1ff",
    tier: 2,
    cost: 2,
    traits: ["rift", "brawler", "gen27", "yue_gang"],
    hp: 205,
    attack: 29,
    armor: 14,
    range: 52,
    attackInterval: 1.02,
    moveSpeed: 76,
    abilityName: "神造物摸鱼",
    abilityDescription: "懒洋洋跃向生命比例最低的敌人，重创残血目标。",
    portrait: "/images/livers/kloa.jpg",
    portraitFocus: "top",
    shop: true,
  }),
  spark_mage: unit({
    id: "spark_mage",
    name: "星火杂谈",
    title: "瑞娅Rhea · 范围法师",
    glyph: "娅",
    color: "#593270",
    accent: "#e7a3ff",
    tier: 2,
    cost: 2,
    traits: ["ember", "mystic", "gluttony"],
    hp: 142,
    attack: 21,
    armor: 6,
    range: 205,
    attackInterval: 1.18,
    moveSpeed: 50,
    abilityName: "瑞娅星火",
    abilityDescription: "向敌人最密集的区域投下星火，造成范围伤害与灼烧。",
    portrait: "/images/livers/rhea.png",
    portraitFocus: "top",
    shop: true,
  }),
  clock_gunner: unit({
    id: "clock_gunner",
    name: "弥月·月音枪手",
    title: "弥月Mizuki · 远程贯射",
    glyph: "月",
    color: "#36566f",
    accent: "#92d7ff",
    tier: 2,
    cost: 2,
    traits: ["clockwork", "ranger", "gen27"],
    hp: 158,
    attack: 22,
    armor: 12,
    range: 245,
    attackInterval: 0.72,
    moveSpeed: 48,
    abilityName: "弥月贯声",
    abilityDescription: "发射贯穿战场的月光音波，惩罚站成一线的敌人。",
    portrait: "/images/livers/mizuki.png",
    portraitFocus: "top",
    shop: true,
  }),
  dawn_duelist: unit({
    id: "dawn_duelist",
    name: "花礼突进",
    title: "花礼Harei · 后排控制",
    glyph: "礼",
    color: "#315b78",
    accent: "#9ee8ff",
    tier: 2,
    cost: 2,
    traits: ["aegis", "assassin"],
    hp: 176,
    attack: 27,
    armor: 16,
    range: 50,
    attackInterval: 0.82,
    moveSpeed: 82,
    abilityName: "花礼突进",
    abilityDescription: "带着花礼冲向最远敌人，重击并短暂眩晕。",
    portrait: "/images/livers/harei.png",
    portraitFocus: "top",
    shop: true,
  }),
  grove_mender: unit({
    id: "grove_mender",
    name: "七海·海盐医师",
    title: "七海Nana7mi · 后排治疗",
    glyph: "七",
    color: "#28644b",
    accent: "#79f2ad",
    tier: 2,
    cost: 2,
    traits: ["wild", "mystic", "gluttony"],
    hp: 158,
    attack: 16,
    armor: 9,
    range: 190,
    attackInterval: 1.22,
    moveSpeed: 46,
    abilityName: "七海回响",
    abilityDescription: "以海盐杂谈治疗生命比例最低的两名友军。",
    portrait: "/images/livers/nana7mi.png",
    portraitFocus: "top",
    shop: true,
  }),
  cinder_ram: unit({
    id: "cinder_ram",
    name: "可爱冲阵",
    title: "阿梓 · 前排控制",
    glyph: "梓",
    color: "#71382f",
    accent: "#ff9a64",
    tier: 2,
    cost: 2,
    traits: ["ember", "vanguard", "gluttony"],
    hp: 278,
    attack: 20,
    armor: 25,
    range: 50,
    attackInterval: 1.16,
    moveSpeed: 68,
    abilityName: "从小就很可爱",
    abilityDescription: "可爱地冲进敌群，震晕并灼烧落点附近的敌人。",
    portrait: "/images/livers/azi.webp",
    portraitFocus: "top",
    shop: true,
  }),
  sui_blue: unit({
    id: "sui_blue",
    name: "骷髅兵岁",
    title: "岁己SUI · 后排补刀",
    glyph: "蓝",
    color: "#3a5d94",
    accent: "#92c8ff",
    tier: 2,
    cost: 2,
    traits: ["ranger", "skeleton_soldier"],
    hp: 148,
    attack: 25,
    armor: 8,
    range: 235,
    attackInterval: 0.82,
    moveSpeed: 58,
    abilityName: "闪购闪购",
    abilityDescription: "连续射出三道闪购，优先追击残血敌人。",
    portrait: "/images/materials/blue/5a2bcc519c33a2213134bdc196799d041954091502.png",
    portraitFocus: "top",
    shop: true,
  }),
  shiori: unit({
    id: "shiori",
    name: "椰子鸡栞",
    title: "栞栞Shiori · 团队护盾",
    glyph: "栞",
    color: "#6c7599",
    accent: "#c3cfff",
    tier: 2,
    cost: 2,
    traits: ["aegis", "skeleton_soldier", "sui_shiori"],
    hp: 164,
    attack: 20,
    armor: 11,
    range: 205,
    attackInterval: 1.08,
    moveSpeed: 50,
    abilityName: "椰子鸡大嗓门",
    abilityDescription: "用超大嗓门招呼椰子鸡，为两名最低生命比例的友军提供书签护盾。",
    portrait: "/images/livers/shiori.png",
    portraitFocus: "top",
    shop: true,
  }),

  // 3 费：岁己保留不同形态；其他角色暂以低费代表参与构筑。
  sui_bird: unit({
    id: "sui_bird",
    name: "岁己·小鸟援护",
    title: "岁己SUI · 鸟本体援护",
    glyph: "鸟",
    color: "#4d7494",
    accent: "#f7d77c",
    tier: 3,
    cost: 3,
    traits: ["mystic", "sui_shiori"],
    hp: 188,
    attack: 27,
    armor: 11,
    range: 220,
    attackInterval: 1.02,
    moveSpeed: 68,
    abilityName: "小鸟归巢",
    abilityDescription: "飞向最虚弱的友军，为其治疗、护盾并以羽流伤害附近敌人。",
    portrait: "/images/materials/bird/岁己_小鸟跳静态图.png",
    shop: true,
  }),
  sui_flower: unit({
    id: "sui_flower",
    name: "川妹岁",
    title: "岁己SUI · 辣味控场",
    glyph: "花",
    color: "#a15282",
    accent: "#f6a8d4",
    tier: 3,
    cost: 3,
    traits: ["mystic", "chuanmei"],
    hp: 184,
    attack: 27,
    armor: 12,
    range: 205,
    attackInterval: 1.1,
    moveSpeed: 52,
    abilityName: "火烧云",
    abilityDescription: "向敌人最密集的区域降下火烧云，造成范围伤害与眩晕。",
    portrait: "/images/materials/flower/622764c8178eb3f6411da20a917cc0321954091502.png",
    portraitFocus: "top",
    shop: true,
  }),
  yua: unit({
    id: "yua",
    name: "炽光点射",
    title: "悠亚Yua · 残血点杀",
    glyph: "悠",
    color: "#9b6345",
    accent: "#ffc28a",
    tier: 3,
    cost: 3,
    traits: ["ember", "ranger"],
    hp: 172,
    attack: 32,
    armor: 10,
    range: 250,
    attackInterval: 0.78,
    moveSpeed: 56,
    abilityName: "悠亚三连点",
    abilityDescription: "向低生命敌人三连点射，并施加灼烧。",
    portrait: "/images/livers/yua.png",
    portraitFocus: "top",
    shop: true,
  }),

  mitsuri: unit({
    id: "mitsuri",
    name: "三理协战引导",
    title: "三理Mit3uri · 远程支援",
    glyph: "理",
    color: "#587d8e",
    accent: "#8be7df",
    tier: 3,
    cost: 3,
    traits: ["yue_gang", "mystic"],
    hp: 176,
    attack: 24,
    armor: 10,
    range: 225,
    attackInterval: 1.02,
    moveSpeed: 52,
    abilityName: "粤语协战",
    abilityDescription: "对当前目标发射协战音波，并为能量最低的友军补充能量。",
    shop: true,
  }),

  // 4 费：岁己保留高费形态，米汀是唯一其他高费代表。
  sui_cat: unit({
    id: "sui_cat",
    name: "小猫拳",
    title: "岁己SUI · 后排主C",
    glyph: "猫",
    color: "#625070",
    accent: "#e8a8f4",
    tier: 4,
    cost: 4,
    traits: ["assassin", "sui_shiori"],
    hp: 226,
    attack: 39,
    armor: 15,
    range: 50,
    attackInterval: 0.74,
    moveSpeed: 94,
    abilityName: "小猫拳",
    abilityDescription: "切入最远敌人，连续打出三记小猫拳并恢复造成伤害的生命。",
    portrait: "/images/materials/岁己SUI小猫帽带饼干岁紫色外套双马尾.png",
    portraitFocus: "top",
    shop: true,
  }),
  nagisa: unit({
    id: "nagisa",
    name: "米汀·潮汐卫",
    title: "米汀Nagisa · 团队护盾",
    glyph: "汀",
    color: "#487b81",
    accent: "#91e4dc",
    tier: 4,
    cost: 4,
    traits: ["clockwork", "vanguard", "chuanmei"],
    hp: 360,
    attack: 29,
    armor: 32,
    range: 55,
    attackInterval: 1.16,
    moveSpeed: 44,
    abilityName: "潮汐屏障",
    abilityDescription: "为全队提供护盾，并震晕身边的敌人。",
    portrait: "/images/livers/nagisa.png",
    portraitFocus: "top",
    shop: true,
  }),

  // 5 费：暂时仅保留岁己终局形态。
  biscuit_sui: unit({
    id: "biscuit_sui",
    name: "饼干岁",
    title: "岁己SUI · 前排终结者",
    glyph: "饼",
    color: "#9a6a4c",
    accent: "#ffd28d",
    tier: 5,
    cost: 5,
    traits: ["brawler", "chuanmei"],
    hp: 420,
    attack: 44,
    armor: 34,
    range: 58,
    attackInterval: 0.92,
    moveSpeed: 58,
    abilityName: "饼干拳法",
    abilityDescription: "冲进敌人最密集处施展饼干拳法，造成范围伤害、眩晕并获得护盾。",
    portrait: "/images/materials/biscuit/饼干岁2.png",
    portraitFocus: "top",
    shop: true,
  }),

  rift_tyrant: unit({
    id: "rift_tyrant",
    name: "弹幕暴走体",
    title: "失控弹幕 · 终局首领",
    glyph: "暴",
    color: "#501c45",
    accent: "#ff5dad",
    tier: 5,
    cost: 5,
    traits: [],
    hp: 1180,
    attack: 36,
    armor: 28,
    range: 75,
    attackInterval: 1.04,
    moveSpeed: 46,
    abilityName: "裂界冲击",
    abilityDescription: "冲击全场并眩晕所有敌人，半血后进入狂暴。",
    shop: false,
  }),
};

export const SHOP_UNITS: ShopUnitId[] = [...SHOP_UNIT_IDS];

export const STARTERS: StarterDefinition[] = [
  {
    id: "bastion",
    name: "果冻风纪开局",
    subtitle: "灰泽满Hazel · 稳扎稳打",
    description: "携带果冻风纪开局；基地生命 +4，所有护盾效果 +30%。",
    unit: "sun_guard",
    color: "#69d8ff",
  },
  {
    id: "blaze",
    name: "炽焰萝卜开局",
    subtitle: "近战灼烧 · 压血抢攻",
    description: "携带炽焰萝卜开局；灼烧伤害 +40%，首次胜利额外获得 2 金币。",
    unit: "ember_blade",
    color: "#ff8058",
  },
  {
    id: "echo",
    name: "浣熊射手开局",
    subtitle: "十六萤Izayoi · 灵活续航",
    description: "携带十六萤·浣熊射手开局；毛茸茸吸血额外 +6%，初始金币 +1。",
    unit: "gale_archer",
    color: "#76e7ae",
  },
];

export const AUGMENTS: AugmentDefinition[] = [
  {
    id: "tempered",
    name: "果冻风纪",
    kicker: "Hazel · 生存",
    description: "所有友军获得 16 护甲。",
    color: "#76cfff",
  },
  {
    id: "overclock",
    name: "栞栞书签",
    kicker: "Shiori · 技能",
    description: "所有友军开战时额外获得 35 能量。",
    color: "#c58cff",
  },
  {
    id: "sharp_edge",
    name: "炽焰磨刃",
    kicker: "炽焰 · 输出",
    description: "所有友军攻击力提高 15%。",
    color: "#ff986b",
  },
  {
    id: "momentum",
    name: "弹幕加速",
    kicker: "全员 · 节奏",
    description: "所有友军攻击速度提高 18%。",
    color: "#f4d35e",
  },
  {
    id: "triage",
    name: "七海急救",
    kicker: "Nana7mi · 续航",
    description: "每 2.5 秒治疗全部友军 3% 最大生命。",
    color: "#72e7a5",
  },
  {
    id: "payday",
    name: "花呗生活",
    kicker: "经济 · 先花后还",
    description: "立即获得 10 金币；之后 4 个回合收入 -1。",
    color: "#ffd166",
  },
  {
    id: "execution",
    name: "收割",
    kicker: "输出 · 补刀",
    description: "对生命低于 40% 的敌人造成 28% 额外伤害。",
    color: "#ff6b8a",
  },
  {
    id: "second_wind",
    name: "德川家康",
    kicker: "生存 · 活得久",
    description: "所有友军 +12% 最大生命、+10 护甲；每名友军首次低于 30% 生命时恢复 18% 最大生命。",
    color: "#88a7ff",
  },
];

export const WAVES: WaveDefinition[] = [
  {
    round: 1,
    name: "直播间暖场",
    tag: "normal",
    description: "果冻风纪与炽焰萝卜在前排，适合熟悉站位。",
    modifier: 0.64,
    units: [{ id: "sun_guard" }, { id: "ember_blade" }],
  },
  {
    round: 2,
    name: "毛茸茸联动",
    tag: "normal",
    description: "犬绒·绒绒卫士保护十六萤·浣熊射手，优先处理后排输出。",
    modifier: 0.75,
    units: [{ id: "mossback" }, { id: "gale_archer" }, { id: "cog_scribe" }],
  },
  {
    round: 3,
    name: "深夜档突入",
    tag: "normal",
    description: "可爱冲阵会打乱前线，分散站位可降低损失。",
    modifier: 0.88,
    units: [
      { id: "cinder_ram" },
      { id: "rift_brawler" },
      { id: "clock_gunner" },
      { id: "spark_mage" },
    ],
  },
  {
    round: 4,
    name: "果冻火力网",
    tag: "elite",
    description: "果冻风纪控制前排，弥月火力锁定远端单位。",
    modifier: 0.96,
    units: [
      { id: "sun_guard" },
      { id: "clock_gunner" },
      { id: "spark_mage" },
      { id: "dawn_duelist" },
    ],
  },
  {
    round: 5,
    name: "毛茸茸团建",
    tag: "normal",
    description: "七海·海盐医师与犬绒·绒绒卫士续航很强，需要集火或切后。",
    modifier: 1,
    units: [
      { id: "mossback" },
      { id: "mossback" },
      { id: "grove_mender" },
      { id: "rift_brawler" },
      { id: "ember_blade" },
    ],
  },
  {
    round: 6,
    name: "攻城序列",
    tag: "normal",
    description: "阿梓的前排冲阵惩罚抱团，浣熊射手持续压制后排。",
    modifier: 1.02,
    units: [
      { id: "cinder_ram" },
      { id: "rift_stalker" },
      { id: "shiori" },
      { id: "gale_archer" },
      { id: "clock_gunner" },
    ],
  },
  {
    round: 7,
    name: "五系禁卫",
    tag: "elite",
    description: "精英战：前排、输出与辅助同时登场，检验阵容完整度。",
    modifier: 1.04,
    units: [
      { id: "dawn_duelist" },
      { id: "cog_scribe" },
      { id: "grove_mender" },
      { id: "rift_brawler" },
      { id: "clock_gunner" },
      { id: "ember_blade" },
    ],
  },
  {
    round: 8,
    name: "暴君降临",
    tag: "boss",
    description: "暴君携带双辅卫队；优先拆掉护盾与诅咒源。",
    modifier: 1,
    units: [{ id: "rift_tyrant" }, { id: "shiori" }, { id: "rift_brawler" }],
  },
];

export const CAMPAIGN_ROUNDS = WAVES.length;

const ENDLESS_NAMES = [
  "回响突击群",
  "裂隙混编队",
  "失序远征军",
  "深层守望者",
] as const;

export const waveForRound = (round: number): WaveDefinition => {
  if (round <= WAVES.length) return WAVES[Math.max(0, round - 1)];

  const endlessRound = round - WAVES.length;
  const cycle = Math.floor((endlessRound - 1) / 5);
  const boss = endlessRound % 5 === 0;
  const elite = !boss && endlessRound % 3 === 0;
  const tag: WaveDefinition["tag"] = boss ? "boss" : elite ? "elite" : "normal";
  const unitCount = Math.min(8, 5 + Math.floor((endlessRound + 1) / 3));
  const minimumTier = Math.min(4, 2 + Math.floor(endlessRound / 5));
  const candidates = SHOP_UNITS.filter(
    (id) => UNIT_DEFS[id].tier >= minimumTier,
  );
  const units: WaveUnit[] = Array.from({ length: unitCount }, (_, index) => {
    const id = candidates[(round * 7 + index * 11 + cycle * 3) % candidates.length];
    const star: 1 | 2 | 3 =
      endlessRound >= 18 && index < 2
        ? 3
        : endlessRound >= 6 && index < 2 + Math.floor(endlessRound / 8)
          ? 2
          : 1;
    return { id, star };
  });
  if (boss) units[0] = { id: "rift_tyrant", star: cycle >= 3 ? 2 : 1 };

  return {
    round,
    name: boss
      ? `暴君回响 · ${cycle + 1}`
      : `${ENDLESS_NAMES[(endlessRound - 1) % ENDLESS_NAMES.length]} · ${endlessRound}`,
    tag,
    description: boss
      ? "无限首领战：暴君会随循环强化，保存阵型的同时准备爆发。"
      : elite
        ? "无限精英战：高费混编与升星单位同时出现。"
        : "无限挑战：敌军编成与强度将持续成长。",
    modifier: 1.06 + endlessRound * 0.035 + cycle * 0.035,
    units,
  };
};

export const PLAYER_LEVELS = [3, 4, 5, 6, 7, 8] as const;
export type PlayerLevel = (typeof PLAYER_LEVELS)[number];
export type ShopTierOdds = readonly [number, number, number, number, number];

interface PlayerLevelConfig {
  boardCap: number;
  upgradeCost: number | null;
  tierOdds: ShopTierOdds;
}

export const STARTING_PLAYER_LEVEL: PlayerLevel = 3;
export const MAX_PLAYER_LEVEL: PlayerLevel = 8;
export const bookLevelForPlayerLevel = (level: PlayerLevel) => level - 2;
export const PASSIVE_UPGRADE_DISCOUNT = 1;

export const PLAYER_LEVEL_CONFIG: Record<PlayerLevel, PlayerLevelConfig> = {
  3: { boardCap: 3, upgradeCost: 5, tierOdds: [75, 25, 0, 0, 0] },
  4: { boardCap: 4, upgradeCost: 9, tierOdds: [48, 38, 13, 1, 0] },
  5: { boardCap: 5, upgradeCost: 14, tierOdds: [30, 33, 26, 10, 1] },
  6: { boardCap: 6, upgradeCost: 20, tierOdds: [10, 20, 30, 29, 11] },
  7: { boardCap: 7, upgradeCost: 27, tierOdds: [5, 15, 29, 34, 17] },
  8: { boardCap: 8, upgradeCost: null, tierOdds: [2, 10, 23, 36, 29] },
};

export const tierOddsForLevel = (level: PlayerLevel) =>
  PLAYER_LEVEL_CONFIG[level].tierOdds;

export const upgradeCostForLevel = (level: PlayerLevel) =>
  PLAYER_LEVEL_CONFIG[level].upgradeCost;

export const SHOP_TIER_COUNTS = [1, 2, 3, 4, 5].map(
  (tier) => SHOP_UNITS.filter((id) => UNIT_DEFS[id].tier === tier).length,
);
