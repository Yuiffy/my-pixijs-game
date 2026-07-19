/* eslint-disable implicit-arrow-linebreak, object-property-newline */

export const TRAIT_IDS = [
  "ember",
  "wild",
  "vanguard",
  "ranger",
  "mystic",
  "assassin",
  "chuanmei",
  "gluttony",
  "skeleton_soldier",
  "gen27",
  "yue_gang",
  "host",
  "dwarf",
  "traffic",
  "mature",
  "dance",
  "aggression",
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
  "nori",
  "meme",
  "zeyin",
  // 2 费
  "rift_brawler",
  "sui_blue",
  "shiori",
  "spark_mage",
  "clock_gunner",
  "dawn_duelist",
  "grove_mender",
  "kioi",
  "nightin",
  "tiandou",
  // 3 费
  "sui_bird",
  "sui_flower",
  "yua",
  "mitsuri",
  "guangyi",
  "youyi",
  // 4 费
  "sui_cat",
  "nagisa",
  "akirinco",
  "lovely",
  "mumu",
  "xuehui",
  // 5 费
  "biscuit_sui",
  "cinder_ram",
  "rei",
  "rutice",
  "lian",
] as const;

export type ShopUnitId = (typeof SHOP_UNIT_IDS)[number];
export type UnitId = ShopUnitId | "rift_tyrant";

export type StarterId = "mature_start" | "blaze" | "traffic_start" | "bastion" | "dance_start" | "ranger_start";
export const STARTER_OFFER_SIZE = 3;

export type AugmentId =
  | "tempered"
  | "overclock"
  | "sharp_edge"
  | "momentum"
  | "triage"
  | "payday"
  | "execution"
  | "second_wind";

export type AttackType = "melee" | "ranged";
export type EnergyProfileId = "assault" | "bulwark" | "flow" | "tempo" | "reservoir" | "automatic";

export interface EnergyProfile {
  id: EnergyProfileId;
  name: string;
  max: number;
  start: number;
  perSecond: number;
  onAttack: number;
  onHit: number;
  castRefund: number;
  color: string;
}

export const ENERGY_PROFILES: Record<EnergyProfileId, EnergyProfile> = {
  assault: { id: "assault", name: "攻击回能", max: 100, start: 0, perSecond: 0, onAttack: 24, onHit: 5, castRefund: 0, color: "#b585ff" },
  bulwark: { id: "bulwark", name: "受击回能", max: 90, start: 15, perSecond: 0, onAttack: 6, onHit: 20, castRefund: 0, color: "#f2b45e" },
  flow: { id: "flow", name: "流转回能", max: 100, start: 0, perSecond: 7, onAttack: 10, onHit: 4, castRefund: 0, color: "#65d8ca" },
  tempo: { id: "tempo", name: "疾奏回能", max: 80, start: 0, perSecond: 3, onAttack: 18, onHit: 4, castRefund: 0, color: "#ee8fc4" },
  reservoir: { id: "reservoir", name: "蓄势回能", max: 120, start: 0, perSecond: 3, onAttack: 16, onHit: 6, castRefund: 0, color: "#7e9bff" },
  automatic: { id: "automatic", name: "自动回能", max: 100, start: 20, perSecond: 20, onAttack: 0, onHit: 0, castRefund: 0, color: "#9bb8ff" },
};

export const describeEnergyRecovery = (profile: EnergyProfile) => {
  const sources = [
    profile.perSecond > 0 && `自动回能（${(profile.max / profile.perSecond).toFixed(1).replace(/\.0$/, "")} 秒回满，每秒 +${profile.perSecond}）`,
    profile.onAttack > 0 && `攻击回能（每下 +${profile.onAttack}）`,
    profile.onHit > 0 && `受击回能（每下 +${profile.onHit}）`,
  ].filter(Boolean);
  return `初始 ${profile.start}/${profile.max}；${sources.join("；") || "不回复"}`;
};

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
  attackType: AttackType;
  energyProfile: EnergyProfile;
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
  ember: { id: "ember", name: "深夜档", family: "阵营", color: "#ff7657", thresholds: [2, 4, 6], description: "熬得越久，状态越稳；战斗中攻击力会逐步叠加。", bonuses: ["深夜档成员每 3 秒 +5% 攻击力，最多 +25%", "深夜档成员每 3 秒 +8% 攻击力，最多 +40%；所有远程友军最多 +12% 攻击力", "深夜档成员每 3 秒 +12% 攻击力，最多 +60%；所有远程友军最多 +25% 攻击力"] },
  wild: { id: "wild", name: "毛茸茸", family: "阵营", color: "#70e1a0", thresholds: [2, 4, 6], description: "耳朵、尾巴与毛茸茸的气势会让前排更能扛住直播事故。", bonuses: ["毛茸茸成员 +12% 最大生命、+8 护甲", "毛茸茸成员 +25% 最大生命、+18 护甲；所有近战友军 +8% 最大生命、+6 护甲", "毛茸茸成员 +42% 最大生命、+32 护甲；所有近战友军 +16% 最大生命、+12 护甲"] },
  vanguard: { id: "vanguard", name: "怕死", family: "职业", color: "#819eff", thresholds: [2, 4, 6], description: "怕死位最懂得保全自己，生命和护甲越高越能熬过直播事故。", bonuses: ["怕死单位 +12% 最大生命、+8 护甲", "怕死单位 +25% 最大生命、+18 护甲；所有近战友军 +8% 最大生命、+6 护甲", "怕死单位 +42% 最大生命、+32 护甲；所有近战友军 +16% 最大生命、+12 护甲"] },
  ranger: { id: "ranger", name: "射手", family: "职业", color: "#f2d15e", thresholds: [2, 4, 6], description: "射手擅长持续远程输出，高阶会带动全队后排火力。", bonuses: ["射手单位 +12% 攻速", "射手单位 +26% 攻速；所有远程友军 +15% 攻速", "射手单位 +45% 攻速；所有远程友军 +30% 攻速"] },
  mystic: { id: "mystic", name: "杂谈", family: "职业", color: "#de87ff", thresholds: [2, 4, 6], description: "杂谈位开麦快、话题多，总能把全队情绪带起来。", bonuses: ["杂谈单位开战 +20 能量", "杂谈开战 +45、施法返还 8；全体友军开战 +10 能量", "杂谈开战 +70、施法返还 15；全体友军开战 +22 能量"] },
  assassin: { id: "assassin", name: "偷袭", family: "职业", color: "#ff6fae", thresholds: [2, 4, 6], description: "偷袭成员会悄悄贴近同事，在后排制造猝不及防的贴贴事故。", bonuses: ["偷袭成员跃向后排、获得 15% 暴击率", "偷袭成员 30% 暴击；所有远程友军 +12% 暴击率", "偷袭成员 50% 暴击；所有远程友军 +25% 暴击率"] },
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
    name: "骷髅兵",
    family: "关系",
    color: "#d9e6f4",
    thresholds: [2],
    description: "脆得一碰就散，但抡起骨头时可一点不客气。",
    bonuses: ["骷髅兵成员 +35% 攻击力、-12 护甲"],
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
  host: {
    id: "host",
    name: "主持",
    family: "关系",
    color: "#7de6dc",
    thresholds: [2, 4, 6],
    description: "主持人掌控联动节奏，让全队更快找到自己的位置。",
    bonuses: ["主持成员 +18 移速；全体友军 +10 移速", "主持成员 +32 移速；全体友军 +22 移速", "主持成员 +50 移速；全体友军 +36 移速"],
  },
  dwarf: {
    id: "dwarf",
    name: "矮人",
    family: "关系",
    color: "#dca85f",
    thresholds: [2, 3],
    description: "大黑鼠创建的矮人联盟：个头不占地方，存在感可一点不少。",
    bonuses: ["矮人成员 +12% 闪避率", "矮人成员 +22% 闪避率"],
  },
  traffic: { id: "traffic", name: "流量", family: "关系", color: "#ff7197", thresholds: [2, 4, 6], description: "被更多人看见，才有继续输出的底气。", bonuses: ["流量成员获得 8% 吸血", "流量成员获得 15% 吸血；所有远程友军获得 5% 吸血", "流量成员获得 24% 吸血；所有远程友军获得 10% 吸血"] },
  mature: { id: "mature", name: "成熟", family: "关系", color: "#b9a274", thresholds: [2, 4, 6], description: "老派作品开局稳健爆发，攻速每 4 秒降低 1 个百分点直至正常，移速最终降至正常移速的 70%。", bonuses: ["成熟成员开战获得 10% 最大生命护盾、+8% 攻速；攻速每 4 秒降低 1 个百分点，直至正常攻速；移速每 4 秒降低 5%，最终为正常移速的 70%", "成熟成员开战获得 18% 最大生命护盾、+16% 攻速；攻速每 4 秒降低 1 个百分点，直至正常攻速；移速每 4 秒降低 5%，最终为正常移速的 70%；全队获得 4% 最大生命护盾", "成熟成员开战获得 28% 最大生命护盾、+24% 攻速；攻速每 4 秒降低 1 个百分点，直至正常攻速；移速每 4 秒降低 5%，最终为正常移速的 70%；全队获得 8% 最大生命护盾"] },
  dance: { id: "dance", name: "跳舞", family: "关系", color: "#f39ade", thresholds: [2, 4, 6], description: "踩准节奏就能把舞台气氛带进战场。", bonuses: ["跳舞成员 +12% 攻速、+10 移速", "跳舞成员 +26% 攻速、+20 移速；所有远程友军 +8% 攻速、+6 移速", "跳舞成员 +45% 攻速、+32 移速；所有远程友军 +16% 攻速、+12 移速"] },
  aggression: { id: "aggression", name: "攻击性", family: "关系", color: "#ff596f", thresholds: [2, 4, 6], description: "发言要有攻击性：成员直接提高攻击力，也会带动全队火力。", bonuses: ["攻击性成员 +15% 攻击力；全体友军 +5% 攻击力", "攻击性成员 +30% 攻击力；全体友军 +10% 攻击力", "攻击性成员 +55% 攻击力；全体友军 +20% 攻击力"] },
};

export const traitLevelForCount = (trait: TraitDefinition, count: number) =>
  trait.thresholds.filter((threshold) => count >= threshold).length;

const COMBAT_PROFILES: Record<UnitId, Pick<UnitDefinition, "attackType" | "energyProfile" | "range" | "moveSpeed">> = {
  sun_guard: { attackType: "melee", energyProfile: ENERGY_PROFILES.bulwark, range: 46, moveSpeed: 46 },
  ember_blade: { attackType: "ranged", energyProfile: ENERGY_PROFILES.tempo, range: 230, moveSpeed: 58 },
  gale_archer: { attackType: "melee", energyProfile: ENERGY_PROFILES.bulwark, range: 60, moveSpeed: 44 },
  rift_stalker: { attackType: "melee", energyProfile: ENERGY_PROFILES.automatic, range: 52, moveSpeed: 82 },
  cog_scribe: { attackType: "ranged", energyProfile: ENERGY_PROFILES.flow, range: 175, moveSpeed: 46 },
  mossback: { attackType: "melee", energyProfile: ENERGY_PROFILES.bulwark, range: 44, moveSpeed: 40 },
  sui: { attackType: "melee", energyProfile: ENERGY_PROFILES.bulwark, range: 48, moveSpeed: 48 },
  rift_brawler: { attackType: "melee", energyProfile: ENERGY_PROFILES.automatic, range: 58, moveSpeed: 72 },
  spark_mage: { attackType: "ranged", energyProfile: ENERGY_PROFILES.flow, range: 185, moveSpeed: 50 },
  clock_gunner: { attackType: "ranged", energyProfile: ENERGY_PROFILES.tempo, range: 280, moveSpeed: 48 },
  dawn_duelist: { attackType: "melee", energyProfile: ENERGY_PROFILES.automatic, range: 52, moveSpeed: 86 },
  grove_mender: { attackType: "ranged", energyProfile: ENERGY_PROFILES.flow, range: 170, moveSpeed: 44 },
  cinder_ram: { attackType: "ranged", energyProfile: ENERGY_PROFILES.flow, range: 185, moveSpeed: 52 },
  sui_blue: { attackType: "ranged", energyProfile: ENERGY_PROFILES.tempo, range: 240, moveSpeed: 58 },
  shiori: { attackType: "ranged", energyProfile: ENERGY_PROFILES.flow, range: 175, moveSpeed: 48 },
  sui_bird: { attackType: "ranged", energyProfile: ENERGY_PROFILES.flow, range: 190, moveSpeed: 62 },
  sui_flower: { attackType: "ranged", energyProfile: ENERGY_PROFILES.flow, range: 180, moveSpeed: 50 },
  yua: { attackType: "ranged", energyProfile: ENERGY_PROFILES.tempo, range: 295, moveSpeed: 54 },
  mitsuri: { attackType: "ranged", energyProfile: ENERGY_PROFILES.flow, range: 200, moveSpeed: 50 },
  guangyi: { attackType: "melee", energyProfile: ENERGY_PROFILES.automatic, range: 56, moveSpeed: 80 },
  sui_cat: { attackType: "melee", energyProfile: ENERGY_PROFILES.automatic, range: 54, moveSpeed: 98 },
  nagisa: { attackType: "melee", energyProfile: ENERGY_PROFILES.bulwark, range: 46, moveSpeed: 38 },
  biscuit_sui: { attackType: "melee", energyProfile: ENERGY_PROFILES.automatic, range: 70, moveSpeed: 64 },
  nori: { attackType: "ranged", energyProfile: ENERGY_PROFILES.automatic, range: 220, moveSpeed: 60 },
  meme: { attackType: "melee", energyProfile: ENERGY_PROFILES.bulwark, range: 60, moveSpeed: 42 },
  zeyin: { attackType: "ranged", energyProfile: ENERGY_PROFILES.tempo, range: 210, moveSpeed: 60 },
  kioi: { attackType: "ranged", energyProfile: ENERGY_PROFILES.tempo, range: 235, moveSpeed: 56 },
  nightin: { attackType: "ranged", energyProfile: ENERGY_PROFILES.flow, range: 180, moveSpeed: 50 },
  tiandou: { attackType: "ranged", energyProfile: ENERGY_PROFILES.flow, range: 175, moveSpeed: 52 },
  youyi: { attackType: "melee", energyProfile: ENERGY_PROFILES.automatic, range: 54, moveSpeed: 88 },
  akirinco: { attackType: "melee", energyProfile: ENERGY_PROFILES.automatic, range: 52, moveSpeed: 96 },
  lovely: { attackType: "melee", energyProfile: ENERGY_PROFILES.automatic, range: 58, moveSpeed: 68 },
  mumu: { attackType: "melee", energyProfile: ENERGY_PROFILES.bulwark, range: 52, moveSpeed: 54 },
  xuehui: { attackType: "ranged", energyProfile: ENERGY_PROFILES.tempo, range: 270, moveSpeed: 58 },
  rei: { attackType: "ranged", energyProfile: ENERGY_PROFILES.reservoir, range: 225, moveSpeed: 54 },
  rutice: { attackType: "melee", energyProfile: ENERGY_PROFILES.bulwark, range: 48, moveSpeed: 42 },
  lian: { attackType: "ranged", energyProfile: ENERGY_PROFILES.reservoir, range: 215, moveSpeed: 56 },
  rift_tyrant: { attackType: "melee", energyProfile: ENERGY_PROFILES.reservoir, range: 78, moveSpeed: 56 },
};

const unit = (definition: Omit<UnitDefinition, "attackType" | "energyProfile" | "range" | "moveSpeed"> & Partial<Pick<UnitDefinition, "attackType" | "energyProfile" | "range" | "moveSpeed">>): UnitDefinition => ({
  ...definition,
  ...COMBAT_PROFILES[definition.id],
});

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
    traits: ["vanguard", "gen27", "traffic"],
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
    name: "兔子射手",
    title: "莉蔻Liko · 远程连射",
    glyph: "蔻",
    color: "#7b2f2b",
    accent: "#ff8a5c",
    tier: 1,
    cost: 1,
    traits: ["dwarf", "gen27", "ranger"],
    hp: 150,
    attack: 23,
    armor: 7,
    range: 225,
    attackInterval: 0.86,
    moveSpeed: 58,
    abilityName: "胡萝卜射击",
    abilityDescription: "向当前目标连续射出三发胡萝卜箭，第三发小范围溅射。",
    portrait: "/images/autochess/portraits/ember-blade.png",
    portraitStyle: "sprite",
    shop: true,
  }),
  gale_archer: unit({
    id: "gale_archer",
    name: "浣熊店员",
    title: "浣熊店员 · 前排照料",
    glyph: "浣",
    color: "#245e4e",
    accent: "#7ef0bb",
    tier: 1,
    cost: 1,
    traits: ["wild", "mature", "gen27"],
    hp: 232,
    attack: 16,
    armor: 20,
    range: 60,
    attackInterval: 1.05,
    moveSpeed: 50,
    abilityName: "端茶倒水",
    abilityDescription: "为生命比例最低的一名友军回复生命。",
    portrait: "/images/autochess/portraits/raccoon-archer.png",
    portraitStyle: "sprite",
    shop: true,
  }),
  rift_stalker: unit({
    id: "rift_stalker",
    name: "好笑姐姐",
    title: "未知夜Michiya · 后排突入",
    glyph: "夜",
    color: "#493464",
    accent: "#c99cff",
    tier: 1,
    cost: 1,
    traits: ["assassin", "mystic"],
    hp: 146,
    attack: 23,
    armor: 8,
    range: 48,
    attackInterval: 0.88,
    moveSpeed: 78,
    abilityName: "冷笑话",
    abilityDescription: "闪到最远敌人身旁讲冷笑话，造成伤害并把自己逗出护盾。",
    portrait: "/images/livers/michiya.webp",
    portraitFocus: "top",
    shop: true,
  }),
  cog_scribe: unit({
    id: "cog_scribe",
    name: "轴轴的宝",
    title: "轴伊Joi · 后排治疗",
    glyph: "轴",
    color: "#4d4936",
    accent: "#e8ca75",
    tier: 1,
    cost: 1,
    traits: ["mystic", "host"],
    hp: 138,
    attack: 18,
    armor: 8,
    range: 190,
    attackInterval: 1.08,
    moveSpeed: 48,
    abilityName: "扔橘子",
    abilityDescription: "把橘子扔给最虚弱的两名队友，为她们回复生命。",
    portrait: "/images/autochess/portraits/cog-scribe.png",
    portraitStyle: "sprite",
    shop: true,
  }),
  mossback: unit({
    id: "mossback",
    name: "绒绒的狗",
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
    abilityName: "绒绒互助",
    abilityDescription: "回复自身生命，并为生命比例最低的两名友军提供护盾。",
    shop: true,
  }),
  sui: unit({
    id: "sui",
    name: "小红帽",
    title: "岁己SUI · 前排防守",
    glyph: "红",
    color: "#8f3f4e",
    accent: "#ffabb5",
    tier: 1,
    cost: 1,
    traits: ["vanguard", "dance", "aggression"],
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
    name: "雅吨",
    title: "克罗雅Kloa · 辣福灼烧",
    glyph: "雅",
    color: "#4c3c72",
    accent: "#c4a1ff",
    tier: 2,
    cost: 2,
    traits: ["gen27", "yue_gang"],
    hp: 205,
    attack: 29,
    armor: 14,
    range: 52,
    attackInterval: 1.02,
    moveSpeed: 76,
    abilityName: "辣福一口",
    abilityDescription: "扑向最近敌人咬一口，造成伤害并施加辣味灼烧。",
    portrait: "/images/livers/kloa.jpg",
    portraitFocus: "top",
    shop: true,
  }),
  spark_mage: unit({
    id: "spark_mage",
    name: "北欧魔法师",
    title: "瑞娅Rhea · 范围法师",
    glyph: "娅",
    color: "#593270",
    accent: "#e7a3ff",
    tier: 2,
    cost: 2,
    traits: ["ember", "mystic", "host"],
    hp: 142,
    attack: 21,
    armor: 6,
    range: 205,
    attackInterval: 1.18,
    moveSpeed: 50,
    abilityName: "北欧魔法",
    abilityDescription: "向敌人最密集的区域施放魔法，造成范围伤害并短暂定身。",
    portrait: "/images/livers/rhea.png",
    portraitFocus: "top",
    shop: true,
  }),
  clock_gunner: unit({
    id: "clock_gunner",
    name: "老弥",
    title: "弥月Mizuki · 远程贯射",
    glyph: "老",
    color: "#36566f",
    accent: "#92d7ff",
    tier: 2,
    cost: 2,
    traits: ["ranger", "gen27", "mature"],
    hp: 158,
    attack: 22,
    armor: 12,
    range: 245,
    attackInterval: 0.72,
    moveSpeed: 48,
    abilityName: "兔耳浮游炮",
    abilityDescription: "放出兔耳浮游炮，贯穿当前目标所在横排的所有敌人。",
    portrait: "/images/livers/mizuki.png",
    portraitFocus: "top",
    shop: true,
  }),
  dawn_duelist: unit({
    id: "dawn_duelist",
    name: "大黑鼠",
    title: "大黑鼠 · 后排控制",
    glyph: "鼠",
    color: "#315b78",
    accent: "#9ee8ff",
    tier: 2,
    cost: 2,
    traits: ["dwarf", "traffic"],
    hp: 176,
    attack: 27,
    armor: 16,
    range: 50,
    attackInterval: 0.82,
    moveSpeed: 82,
    abilityName: "热点突进",
    abilityDescription: "冲向最远敌人，重击并短暂眩晕。",
    portrait: "/images/livers/harei.png",
    portraitFocus: "top",
    shop: true,
  }),
  grove_mender: unit({
    id: "grove_mender",
    name: "七海大鲨鱼",
    title: "七海Nana7mi · 范围控场",
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
    abilityName: "鲨鱼出没",
    abilityDescription: "召来大鲨鱼扑向敌人最密集处，造成范围伤害并短暂眩晕。",
    portrait: "/images/livers/nana7mi.png",
    portraitFocus: "top",
    shop: true,
  }),
  cinder_ram: unit({
    id: "cinder_ram",
    name: "蛙梓",
    title: "蛙梓 · 终场歌者",
    glyph: "蛙",
    color: "#71382f",
    accent: "#ff9a64",
    tier: 5,
    cost: 5,
    traits: ["ember", "mystic", "mature", "aggression"],
    hp: 320,
    attack: 34,
    armor: 20,
    range: 195,
    attackInterval: 1.04,
    moveSpeed: 58,
    abilityName: "蛙梓歌唱",
    abilityDescription: "歌唱治疗全体友军，并让所有敌人短暂减速。",
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
    traits: ["ranger", "skeleton_soldier", "aggression"],
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
    traits: ["skeleton_soldier", "yue_gang", "dance"],
    hp: 164,
    attack: 20,
    armor: 11,
    range: 205,
    attackInterval: 1.08,
    moveSpeed: 50,
    abilityName: "椰子鸡大嗓门",
    abilityDescription: "用超大嗓门招呼椰子鸡，为两名最低生命比例的友军提供护盾。",
    portrait: "/images/livers/shiori.png",
    portraitFocus: "top",
    shop: true,
  }),

  // 3 费：岁己保留不同形态；其他角色暂以低费代表参与构筑。
  sui_bird: unit({
    id: "sui_bird",
    name: "小岁鸟",
    title: "岁己SUI · 鸟本体援护",
    glyph: "鸟",
    color: "#4d7494",
    accent: "#f7d77c",
    tier: 3,
    cost: 3,
    traits: ["mystic", "wild"],
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
    traits: ["mystic", "chuanmei", "aggression"],
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
    name: "邪恶外星人",
    title: "悠亚Yua · 外星射手",
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
    abilityName: "外星光线",
    abilityDescription: "向生命最低的敌人连续发射三道外星光线。",
    portrait: "/images/livers/yua.png",
    portraitFocus: "top",
    shop: true,
  }),

  mitsuri: unit({
    id: "mitsuri",
    name: "三理理",
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
    abilityName: "hello酷狗",
    abilityDescription: "向当前目标发射音波，并为能量最低的友军补充能量。",
    shop: true,
  }),

  // 4 费：岁己保留高费形态，米汀是唯一其他高费代表。
  guangyi: unit({
    id: "guangyi",
    name: "中单光一",
    title: "光一 · 前排突进",
    glyph: "光",
    color: "#52718c",
    accent: "#9edbff",
    tier: 3,
    cost: 3,
    traits: ["host", "gluttony", "mature"],
    hp: 244,
    attack: 31,
    armor: 17,
    range: 52,
    attackInterval: 0.9,
    moveSpeed: 72,
    abilityName: "滑跪",
    abilityDescription: "向最远敌人滑跪突进，击退沿途敌人并为自己获得护盾。",
    shop: true,
  }),
  sui_cat: unit({
    id: "sui_cat",
    name: "小猫拳",
    title: "岁己SUI · 后排主C",
    glyph: "猫",
    color: "#625070",
    accent: "#e8a8f4",
    tier: 4,
    cost: 4,
    traits: ["assassin", "gluttony"],
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
    name: "米米",
    title: "米汀Nagisa · 团队护盾",
    glyph: "汀",
    color: "#487b81",
    accent: "#91e4dc",
    tier: 4,
    cost: 4,
    traits: ["chuanmei", "assassin"],
    hp: 360,
    attack: 29,
    armor: 32,
    range: 55,
    attackInterval: 1.16,
    moveSpeed: 44,
    abilityName: "脑控",
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
    traits: ["wild", "gluttony"],
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

  // 公开成员的角色化战斗设计；无可核验梗时采用公开人设或名字意象。
  nori: unit({
    id: "nori", name: "能能弄你", title: "能能Nori · 高速射手", glyph: "能", color: "#526a9e", accent: "#9bb8ff", tier: 1, cost: 1,
    traits: ["ranger", "host"], hp: 138, attack: 23, armor: 7, range: 225, attackInterval: 0.9, moveSpeed: 56,
    abilityName: "苹果派", abilityDescription: "以较低单发伤害快速连射 12 次。", shop: true,
  }),
  meme: unit({
    id: "meme", name: "毛神", title: "毛神 · 前排续航", glyph: "毛", color: "#54735b", accent: "#9be6aa", tier: 3, cost: 3,
    traits: ["wild", "vanguard", "aggression"], hp: 260, attack: 16, armor: 25, range: 60, attackInterval: 1.18, moveSpeed: 48,
    abilityName: "夺回人生", abilityDescription: "震晕附近敌人并造成伤害，随后按造成伤害回复自身生命。", shop: true,
  }),
  zeyin: unit({
    id: "zeyin", name: "泽音美乐蒂", title: "泽音Melody · 舞台射手", glyph: "泽", color: "#6c4c86", accent: "#e2a9ff", tier: 4, cost: 4,
    traits: ["ranger", "mature", "dance"], hp: 142, attack: 21, armor: 7, range: 220, attackInterval: 0.9, moveSpeed: 60,
    abilityName: "虹光起舞", abilityDescription: "向当前目标连射两次，并为自己获得短暂攻速。", shop: true,
  }),
  kioi: unit({
    id: "kioi", name: "美·鱿鱼", title: "美·鱿鱼 · 远程削弱", glyph: "鱿", color: "#7b6942", accent: "#f5d56f", tier: 2, cost: 2,
    traits: ["wild", "ranger", "host"], hp: 162, attack: 27, armor: 9, range: 235, attackInterval: 0.84, moveSpeed: 60,
    abilityName: "讨厌你", abilityDescription: "点名一名敌人，造成伤害并降低其攻击力与护甲。", shop: true,
  }),
  nightin: unit({
    id: "nightin", name: "南町", title: "绿色辣妹 · 深夜控场", glyph: "南", color: "#3b426f", accent: "#a9a7ff", tier: 2, cost: 2,
    traits: ["mystic", "dwarf"], hp: 150, attack: 22, armor: 8, range: 210, attackInterval: 1.05, moveSpeed: 55,
    abilityName: "烟头烫屁股", abilityDescription: "向敌人最密集处甩出烟头，造成范围伤害、灼烧并短暂眩晕。", portrait: "/images/livers/nightin.jpg", portraitFocus: "top", shop: true,
  }),
  tiandou: unit({
    id: "tiandou", name: "恬豆·甜点转圈", title: "四禧丸子 · 舞台支援", glyph: "豆", color: "#c87d95", accent: "#ffc2d7", tier: 2, cost: 2,
    traits: ["mystic", "dance"], hp: 164, attack: 20, armor: 10, range: 200, attackInterval: 1.02, moveSpeed: 56,
    abilityName: "甜点转圈", abilityDescription: "为生命最低的两名友军回复生命，并提升她们短暂移速。", shop: true,
  }),
  youyi: unit({
    id: "youyi", name: "又一·叛逆舞步", title: "四禧丸子 · 突进舞者", glyph: "又", color: "#84536f", accent: "#f0add2", tier: 3, cost: 3,
    traits: ["assassin", "dance"], hp: 212, attack: 31, armor: 14, range: 50, attackInterval: 0.86, moveSpeed: 82,
    abilityName: "叛逆转场", abilityDescription: "跃向最远敌人，连续踢击两次并短暂眩晕。", shop: true,
  }),
  akirinco: unit({
    id: "akirinco", name: "秋凛子", title: "秋凛子Aki Rinco · 残血收割", glyph: "秋", color: "#65445f", accent: "#eca5d3", tier: 4, cost: 4,
    traits: ["assassin", "host"], hp: 222, attack: 39, armor: 14, range: 50, attackInterval: 0.76, moveSpeed: 92,
    abilityName: "神社夜巡", abilityDescription: "跃至生命最低的敌人身边连续斩击；完成击杀后恢复生命。", shop: true,
  }),
  lovely: unit({
    id: "lovely", name: "狍子偶像", title: "狍子偶像 · 范围斗士", glyph: "狍", color: "#b36a72", accent: "#ffb0af", tier: 4, cost: 4,
    traits: ["assassin", "host", "dance"], hp: 270, attack: 37, armor: 18, range: 52, attackInterval: 0.84, moveSpeed: 72,
    abilityName: "元气冲场", abilityDescription: "跃入敌人最密集处横扫；每命中一名敌人，都会提升自身攻击速度。", shop: true,
  }),
  mumu: unit({
    id: "mumu", name: "沐霂·领舞开场", title: "四禧丸子 · 领舞前排", glyph: "沐", color: "#5b7992", accent: "#a9e5ff", tier: 4, cost: 4,
    traits: ["vanguard", "dance"], hp: 330, attack: 34, armor: 29, range: 52, attackInterval: 0.96, moveSpeed: 68,
    abilityName: "领舞开场", abilityDescription: "冲至敌人最密集处，造成范围伤害并为附近友军提供护盾。", shop: true,
  }),
  xuehui: unit({
    id: "xuehui", name: "雪绘", title: "雪绘 · 同步视听", glyph: "绘", color: "#445a8e", accent: "#8dc8ff", tier: 4, cost: 4,
    traits: ["dwarf", "ember", "aggression"], hp: 205, attack: 37, armor: 13, range: 270, attackInterval: 0.88, moveSpeed: 58,
    abilityName: "同步视听", abilityDescription: "己方越优势，自身攻速移速越低、射程越近；越劣势则反之。快速向三个不同敌人方向射出子弹，命中造成伤害和灼烧。", shop: true,
  }),
  rei: unit({
    id: "rei", name: "病院坂灵", title: "病院坂灵Rei · 群体法师", glyph: "灵", color: "#735779", accent: "#e8b5ff", tier: 5, cost: 5,
    traits: ["mystic", "ranger"], hp: 270, attack: 43, armor: 18, range: 230, attackInterval: 0.82, moveSpeed: 66,
    abilityName: "幽灵终演", abilityDescription: "召唤幽灵轰击敌人最密集区域，造成高额范围伤害、灼烧与眩晕。", shop: true,
  }),
  rutice: unit({
    id: "rutice", name: "露蒂丝·诊所护航", title: "露蒂丝Rutice · 决战守卫", glyph: "医", color: "#4b7280", accent: "#90e7df", tier: 5, cost: 5,
    traits: ["vanguard", "host"], hp: 455, attack: 38, armor: 38, range: 55, attackInterval: 1.02, moveSpeed: 60,
    abilityName: "终幕护航", abilityDescription: "为全体友军提供厚重护盾，随后震晕周围敌人并回复自身生命。", shop: true,
  }),
  lian: unit({
    id: "lian", name: "梨安·终场谢幕", title: "四禧丸子 · 终场舞者", glyph: "梨", color: "#8b5b9b", accent: "#e3b2ff", tier: 5, cost: 5,
    traits: ["mystic", "dance"], hp: 252, attack: 43, armor: 18, range: 225, attackInterval: 0.8, moveSpeed: 70,
    abilityName: "终场谢幕", abilityDescription: "轰击敌人最密集处，造成范围伤害并为全体友军补充能量。", shop: true,
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
  { id: "mature_start", name: "成熟稳重", subtitle: "老派开场", description: "携带浣熊店员开局；成熟成员开战护盾 +6%，初始金币 +1。", unit: "gale_archer", color: "#b9a274" },
  { id: "blaze", name: "火热整活", subtitle: "辣福灼烧", description: "携带雅吨开局；灼烧伤害 +40%，首次胜利额外获得 2 金币。", unit: "rift_brawler", color: "#ff8058" },
  { id: "traffic_start", name: "蹭热点", subtitle: "流量续航", description: "携带大黑鼠开局；流量成员吸血额外 +6%，初始金币 +1。", unit: "dawn_duelist", color: "#ff7197" },
  { id: "bastion", name: "持久抗压", subtitle: "稳扎稳打", description: "携带果冻风纪开局；基地生命 +4，所有护盾效果 +30%。", unit: "sun_guard", color: "#69d8ff" },
  { id: "dance_start", name: "舞台梦", subtitle: "红帽开场", description: "携带小红帽开局；所有友军开战 +10 能量，跳舞成员攻击速度 +8%。", unit: "sui", color: "#f39ade" },
  { id: "ranger_start", name: "稳定输出", subtitle: "远程热身", description: "携带兔子射手开局；所有远程友军攻击速度 +10%，首次刷新商店免费。", unit: "ember_blade", color: "#f2d15e" },
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
    name: "出道推流",
    kicker: "技能 · 提前释放",
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
    name: "全员续航",
    kicker: "团队 · 续航",
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
    description: "果冻风纪与兔子射手在前排，适合熟悉站位。",
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
