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
  "finance",
  "mature",
  "dance",
  "aggression",
] as const;

export type TraitId = (typeof TRAIT_IDS)[number];

export const SHOP_UNIT_IDS = [
  // 每位角色暂时只保留一个低费代表；岁己保留多种形态。
  // 1 费
  "ember_blade",
  "gale_archer",
  "rift_stalker",
  "mossback",
  "sui",
  "nori",
  "meme",
  "zeyin",
  "pako",
  // 2 费
  "sun_guard",
  "rift_brawler",
  "sui_blue",
  "shiori",
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
  "seki_boar_king",
  "sumi",
  "spark_mage",
  "yukisyo",
  // 4 费
  "sui_cat",
  "nagisa",
  // "akirinco",
  "lovely",
  "mumu",
  "xuehui",
  "tower_god",
  "cog_scribe",
  // 5 费
  "biscuit_sui",
  "cinder_ram",
  "rei",
  "rutice",
  "lian",
] as const;

export type ShopUnitId = (typeof SHOP_UNIT_IDS)[number];
// 秋凛子暂时隐藏，但保留完整单位类型以兼容已有数据和战斗逻辑。
export type UnitId =
  | ShopUnitId
  | "akirinco"
  | "miki_guest"
  | "hatsuse_guest"
  | "rift_tyrant";

export type StarterId = "mature_start" | "blaze" | "traffic_start" | "bastion" | "dance_start" | "ranger_start";
export const STARTER_OFFER_SIZE = 3;

export type AugmentId =
  | "tempered"
  | "sharp_edge"
  | "momentum"
  | "payday"
  | "vitality"
  | "precision"
  | "overclock"
  | "triage"
  | "execution"
  | "second_wind"
  | "glass_cannon"
  | "united_front";

export type AugmentTier = "minor" | "major";

export const AUGMENT_TIER_LABELS: Record<AugmentTier, string> = {
  minor: "局中小天赋",
  major: "局中大天赋",
};

export type AttackType = "melee" | "ranged";
export type EnergyProfileId = "assault" | "bulwark" | "steady_guard" | "flow" | "tempo" | "alien" | "reservoir" | "automatic" | "feast" | "passive";

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
  steady_guard: { id: "steady_guard", name: "稳态回能", max: 100, start: 25, perSecond: 8, onAttack: 6, onHit: 3, castRefund: 0, color: "#72d8cf" },
  flow: { id: "flow", name: "流转回能", max: 100, start: 0, perSecond: 7, onAttack: 10, onHit: 4, castRefund: 0, color: "#65d8ca" },
  tempo: { id: "tempo", name: "疾奏回能", max: 80, start: 0, perSecond: 3, onAttack: 15, onHit: 4, castRefund: 0, color: "#ee8fc4" },
  alien: { id: "alien", name: "外星回能", max: 75, start: 10, perSecond: 5, onAttack: 18, onHit: 5, castRefund: 0, color: "#ffc28a" },
  reservoir: { id: "reservoir", name: "蓄势回能", max: 120, start: 0, perSecond: 3, onAttack: 16, onHit: 6, castRefund: 0, color: "#7e9bff" },
  automatic: { id: "automatic", name: "自动回能", max: 100, start: 20, perSecond: 20, onAttack: 0, onHit: 0, castRefund: 0, color: "#9bb8ff" },
  feast: { id: "feast", name: "吃货回能", max: 50, start: 10, perSecond: 8, onAttack: 18, onHit: 0, castRefund: 0, color: "#92c8ff" },
  passive: { id: "passive", name: "被动技能", max: 1, start: 0, perSecond: 0, onAttack: 0, onHit: 0, castRefund: 0, color: "#e2a9ff" },
};

export const WARM_SUPPORT_ENERGY_PROFILE: EnergyProfile = {
  id: "automatic",
  name: "暖意回能",
  max: 90,
  start: 36,
  perSecond: 18,
  onAttack: 4,
  onHit: 2,
  castRefund: 10,
  color: "#ffd28d",
};

export const REI_SLOW_ENERGY_PROFILE: EnergyProfile = {
  id: "automatic",
  name: "幽灵回能",
  max: 100,
  start: 25,
  perSecond: 5,
  onAttack: 0,
  onHit: 0,
  castRefund: 0,
  color: "#e8b5ff",
};

export const YUKISYO_EARLY_SHIELD_ENERGY_PROFILE: EnergyProfile = {
  id: "automatic",
  name: "镇式回能",
  max: 100,
  start: 78,
  perSecond: 9,
  onAttack: 4,
  onHit: 2,
  castRefund: 0,
  color: "#d8b7ff",
};

export const RIFT_STALKER_OFFENSE_ENERGY_PROFILE: EnergyProfile = {
  id: "automatic",
  name: "笑点回能",
  max: 100,
  start: 40,
  perSecond: 20,
  onAttack: 0,
  onHit: 0,
  castRefund: 0,
  color: "#c99cff",
};

export const describeEnergyRecovery = (profile: EnergyProfile) => {
  const sources = [
    profile.perSecond > 0 && `自动回能（${(profile.max / profile.perSecond).toFixed(1).replace(/\.0$/, "")} 秒回满，每秒 +${profile.perSecond}）`,
    profile.onAttack > 0 && `攻击回能（每下 +${profile.onAttack}）`,
    profile.onHit > 0 && `受击回能（每下 +${profile.onHit}）`,
  ].filter(Boolean);
  return `初始 ${profile.start}/${profile.max}；${sources.join("；") || "不回复"}`;
};

/**
 * 技能释放类别：同一类共用同一触发方式。
 * - selfOnHit：自保，能量满且受击时释放
 * - supportShield：支援护盾，能量满即放
 * - supportHeal：支援治疗，能量满且候选友军生命比例低于阈值时释放
 * - supportRescue：危险救援，能量满且存在被控制或低血友军时释放
 * - selfBuff：自保强化，能量满即放
 * - engage：突进，能量满即放
 * - offenseInRange：近距进攻，能量满且进入普攻距离时释放
 * - offenseReady：远程/战场进攻，能量满即放
 * - passive：由专属战斗事件触发，不消耗能量施放
 */
export type AbilityCastTiming =
  | "selfOnHit"
  | "supportShield"
  | "supportHeal"
  | "supportRescue"
  | "selfBuff"
  | "engage"
  | "offenseInRange"
  | "offenseReady"
  | "passive";

export const ABILITY_CAST_TIMING_LABELS: Record<AbilityCastTiming, string> = {
  selfOnHit: "自保 · 受击释放",
  supportShield: "支援护盾 · 满能量即放",
  supportHeal: "支援治疗 · 友军残血释放",
  supportRescue: "危险救援 · 友军遇险释放",
  selfBuff: "自保 · 满能量即放",
  engage: "突进 · 满能量即放",
  offenseInRange: "进攻 · 进入攻击范围释放",
  offenseReady: "进攻 · 满能量即放",
  passive: "被动 · 特殊事件触发",
};

/** 支援治疗：候选友军生命比例低至此值（含）才释放 */
export const SUPPORT_HEAL_HP_RATIO = 0.7;

export interface AbilityLevelDefinition {
  /** 用于商店和图鉴概览的简短星级差异 */
  summary: string;
  /** 当前星级下展示给玩家的完整技能说明 */
  description: string;
  /** 战斗逻辑读取的技能参数；键由对应技能定义 */
  stats: Readonly<Record<string, number>>;
}

export type AbilityLevels = readonly [
  AbilityLevelDefinition,
  AbilityLevelDefinition,
  AbilityLevelDefinition,
];

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
  /** 主动技能可选择目标或尸体的最大中心距离；0 表示纯自身技能。 */
  abilityRange: number;
  attackInterval: number;
  moveSpeed: number;
  attackType: AttackType;
  energyProfile: EnergyProfile;
  /** 技能释放类别，决定满能量后的触发时机 */
  abilityCastTiming: AbilityCastTiming;
  abilityName: string;
  abilityDescription: string;
  /** 可选的独立被动说明，供同时拥有主动与被动机制的单位展示。 */
  passiveName?: string;
  passiveDescription?: string;
  /** 可选的 1/2/3 星技能参数；未配置的技能继续使用固定技能逻辑 */
  abilityLevels?: AbilityLevels;
  portrait?: string;
  portraitFocus?: "top" | "center";
  portraitStyle?: "round" | "sprite";
  shop: boolean;
}

export const abilityLevelForStar = (
  definition: UnitDefinition,
  star: 1 | 2 | 3,
) => definition.abilityLevels?.[star - 1];

export const abilityStatForStar = (
  definition: UnitDefinition,
  star: 1 | 2 | 3,
  stat: string,
  fallback: number,
) => abilityLevelForStar(definition, star)?.stats[stat] ?? fallback;

export const abilityDescriptionForStar = (
  definition: UnitDefinition,
  star: 1 | 2 | 3,
) => abilityLevelForStar(definition, star)?.description ?? definition.abilityDescription;

export const describeAbilityStarGrowth = (definition: UnitDefinition) =>
  definition.abilityLevels
    ?.map((level, index) => `${index + 1}星 ${level.summary}`)
    .join(" · ") ?? null;

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
  icon: string;
  name: string;
  subtitle: string;
  description: string;
  unit: ShopUnitId;
  color: string;
}

export interface AugmentDefinition {
  id: AugmentId;
  tier: AugmentTier;
  icon: string;
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
  ember: { id: "ember", name: "深夜档", family: "阵营", color: "#ff7657", thresholds: [2, 4], description: "熬得越久，状态越稳；战斗中攻击力会逐步叠加。", bonuses: ["深夜档成员每 3 秒 +5% 攻击力，最多 +25%", "深夜档成员每 3 秒 +8% 攻击力，最多 +40%；所有远程友军最多 +12% 攻击力"] },
  wild: { id: "wild", name: "毛茸茸", family: "阵营", color: "#70e1a0", thresholds: [2, 4, 6], description: "厚实的毛层只负责挡伤害，不额外堆血量。", bonuses: ["毛茸茸成员 +10 护甲", "毛茸茸成员 +22 护甲；所有近战友军 +8 护甲", "毛茸茸成员 +38 护甲；所有近战友军 +16 护甲"] },
  vanguard: { id: "vanguard", name: "怕死", family: "职业", color: "#819eff", thresholds: [2, 4, 6], description: "怕死所以不敢贴脸：攻击距离更远，受击后会真实跳开；跳跃期间仍保持接敌移动；若后撤会离开攻击距离，就改为侧跳。", bonuses: ["怕死单位攻击距离 +36；受击时小幅跳开，接敌移速不中断", "怕死单位攻击距离 +56；受击跳开增强，接敌移速不中断；全体友军 +10% 最大生命", "怕死单位攻击距离 +80；受击跳开更远，接敌移速不中断；全体友军 +18% 最大生命"] },
  ranger: { id: "ranger", name: "射手", family: "职业", color: "#f2d15e", thresholds: [2, 4, 6], description: "射手擅长持续远程输出，高阶会带动全队后排火力。", bonuses: ["射手单位 +12% 攻速", "射手单位 +26% 攻速；所有远程友军 +15% 攻速", "射手单位 +45% 攻速；所有远程友军 +30% 攻速"] },
  mystic: { id: "mystic", name: "杂谈", family: "职业", color: "#de87ff", thresholds: [2, 4, 6], description: "杂谈位开麦快、话题多，总能把全队情绪带起来。", bonuses: ["杂谈单位开战 +20 能量", "杂谈开战 +45、施法返还 8；全体友军开战 +10 能量", "杂谈开战 +70、施法返还 15；全体友军开战 +22 能量"] },
  assassin: { id: "assassin", name: "偷袭", family: "职业", color: "#ff6fae", thresholds: [2, 4], description: "偷袭成员会集中跃向敌方最后排中最虚弱的目标，快速形成集火。", bonuses: ["偷袭成员集火最后排、获得 15% 暴击率", "偷袭成员 30% 暴击；所有远程友军 +12% 暴击率"] },
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
    description: "吃饱才有力气整活；定时进食与亲手击杀都会长大，碰撞体积和攻击力随层数提高。",
    bonuses: ["贪吃成员每 3 秒回复 3% 最大生命并获得 1 层饱腹；每层增加体积与 6% 攻击力，击杀额外获得 1 层", "全体友军每 3 秒回复 1.5% 最大生命；贪吃成员回复提升至 4%，饱腹成长与击杀叠层不变"],
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
    thresholds: [2, 4],
    description: "27期成员靠近彼此时会进入联动状态。",
    bonuses: ["邻近另一名 27 期成员时 +12% 攻速、+12% 移速", "邻近加成提升至 20%，开战 +10 能量"],
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
  traffic: { id: "traffic", name: "流量", family: "关系", color: "#ff7197", thresholds: [2, 4, 6], description: "被更多人看见，才有继续输出的底气；全能吸血可由普攻和技能伤害触发，每回合还能获得免费刷新。", bonuses: ["流量成员获得 12% 全能吸血；每回合 1 次免费刷新", "流量成员获得 20% 全能吸血；全体友军获得 8% 全能吸血（可叠加）；每回合 2 次免费刷新", "流量成员获得 32% 全能吸血；全体友军获得 15% 全能吸血（可叠加）；每回合 3 次免费刷新"] },
  finance: { id: "finance", name: "理财", family: "关系", color: "#f1bd5e", thresholds: [2, 4], description: "会理财也会买股票：低档稳稳加钱，高档让每一笔存款都开始生息。", bonuses: ["每场结束额外获得 2 金币", "每场结束额外获得 2 金币；每 4 金币提供 1 利息，最多 20 利息"] },
  mature: { id: "mature", name: "成熟", family: "关系", color: "#b9a274", thresholds: [2, 4], description: "老派作品开局稳健爆发，攻速每 4 秒降低 1 个百分点直至正常，移速最终降至正常移速的 70%。", bonuses: ["成熟成员开战获得 10% 最大生命护盾、+8% 攻速；攻速每 4 秒降低 1 个百分点，直至正常攻速；移速每 4 秒降低 5%，最终为正常移速的 70%", "成熟成员开战获得 18% 最大生命护盾、+16% 攻速；攻速每 4 秒降低 1 个百分点，直至正常攻速；移速每 4 秒降低 5%，最终为正常移速的 70%；全队获得 4% 最大生命护盾"] },
  dance: { id: "dance", name: "跳舞", family: "关系", color: "#f39ade", thresholds: [2, 4, 6], description: "踩准节奏冲向舞台中央：成员攻速提升，并在最后接近阶段高移速冲刺，冲刺中更易闪避。", bonuses: ["跳舞成员 +12% 攻速；最后接近攻击范围时可冲刺（期间闪避提升）", "跳舞成员 +26% 攻速；冲刺强化；所有近战友军 +8% 攻速、+8 移速", "跳舞成员 +45% 攻速；冲刺强化；所有近战友军 +16% 攻速、+16 移速"] },
  aggression: { id: "aggression", name: "攻击性", family: "关系", color: "#ff596f", thresholds: [2, 4, 6], description: "发言要有攻击性：成员直接提高攻击力，也会带动全队火力。", bonuses: ["攻击性成员 +15% 攻击力；全体友军 +5% 攻击力", "攻击性成员 +30% 攻击力；全体友军 +10% 攻击力", "攻击性成员 +55% 攻击力；全体友军 +20% 攻击力"] },
};

export const traitLevelForCount = (trait: TraitDefinition, count: number) =>
  trait.thresholds.filter((threshold) => count >= threshold).length;

const COMBAT_PROFILES: Record<
  UnitId,
  Pick<UnitDefinition, "attackType" | "energyProfile" | "range" | "moveSpeed" | "abilityCastTiming">
> = {
  // selfOnHit：自保，受击时放
  sun_guard: { attackType: "melee", energyProfile: ENERGY_PROFILES.steady_guard, range: 48, moveSpeed: 44, abilityCastTiming: "selfOnHit" },
  // offenseReady：攻击型强化，满能量即放
  sui: { attackType: "melee", energyProfile: ENERGY_PROFILES.bulwark, range: 48, moveSpeed: 48, abilityCastTiming: "offenseReady" },
  // offenseInRange：近身范围攻击，进入攻击范围后放
  rift_brawler: { attackType: "melee", energyProfile: ENERGY_PROFILES.automatic, range: 52, moveSpeed: 58, abilityCastTiming: "offenseInRange" },
  meme: { attackType: "melee", energyProfile: ENERGY_PROFILES.bulwark, range: 60, moveSpeed: 42, abilityCastTiming: "offenseInRange" },
  // supportShield：支援护盾，满能量即放
  mossback: { attackType: "melee", energyProfile: ENERGY_PROFILES.steady_guard, range: 44, moveSpeed: 40, abilityCastTiming: "supportShield" },
  shiori: { attackType: "melee", energyProfile: ENERGY_PROFILES.automatic, range: 56, moveSpeed: 72, abilityCastTiming: "engage" },
  nagisa: { attackType: "melee", energyProfile: ENERGY_PROFILES.steady_guard, range: 46, moveSpeed: 38, abilityCastTiming: "supportShield" },
  rutice: { attackType: "melee", energyProfile: ENERGY_PROFILES.automatic, range: 48, moveSpeed: 42, abilityCastTiming: "supportShield" },
  // supportHeal：支援治疗，友军残血时放
  gale_archer: { attackType: "melee", energyProfile: ENERGY_PROFILES.steady_guard, range: 60, moveSpeed: 44, abilityCastTiming: "supportHeal" },
  cog_scribe: { attackType: "ranged", energyProfile: ENERGY_PROFILES.flow, range: 220, moveSpeed: 52, abilityCastTiming: "supportHeal" },
  cinder_ram: { attackType: "ranged", energyProfile: ENERGY_PROFILES.flow, range: 185, moveSpeed: 52, abilityCastTiming: "offenseReady" },
  sui_bird: { attackType: "melee", energyProfile: ENERGY_PROFILES.flow, range: 56, moveSpeed: 75, abilityCastTiming: "engage" },
  tiandou: { attackType: "ranged", energyProfile: ENERGY_PROFILES.flow, range: 175, moveSpeed: 52, abilityCastTiming: "supportHeal" },
  // offenseReady：偷袭进场后，从近距离发射冷笑话弹幕
  rift_stalker: { attackType: "melee", energyProfile: RIFT_STALKER_OFFENSE_ENERGY_PROFILE, range: 52, moveSpeed: 82, abilityCastTiming: "offenseReady" },
  guangyi: { attackType: "melee", energyProfile: ENERGY_PROFILES.automatic, range: 56, moveSpeed: 80, abilityCastTiming: "engage" },
  sui_cat: { attackType: "melee", energyProfile: ENERGY_PROFILES.automatic, range: 54, moveSpeed: 106, abilityCastTiming: "engage" },
  seki_boar_king: { attackType: "melee", energyProfile: ENERGY_PROFILES.steady_guard, range: 60, moveSpeed: 62, abilityCastTiming: "engage" },
  biscuit_sui: { attackType: "melee", energyProfile: WARM_SUPPORT_ENERGY_PROFILE, range: 58, moveSpeed: 64, abilityCastTiming: "supportHeal" },
  youyi: { attackType: "melee", energyProfile: ENERGY_PROFILES.automatic, range: 54, moveSpeed: 88, abilityCastTiming: "engage" },
  akirinco: { attackType: "melee", energyProfile: ENERGY_PROFILES.automatic, range: 52, moveSpeed: 96, abilityCastTiming: "engage" },
  lovely: { attackType: "melee", energyProfile: ENERGY_PROFILES.automatic, range: 58, moveSpeed: 68, abilityCastTiming: "offenseInRange" },
  mumu: { attackType: "ranged", energyProfile: ENERGY_PROFILES.steady_guard, range: 190, moveSpeed: 58, abilityCastTiming: "supportRescue" },
  yukisyo: { attackType: "ranged", energyProfile: YUKISYO_EARLY_SHIELD_ENERGY_PROFILE, range: 225, moveSpeed: 48, abilityCastTiming: "supportShield" },
  // offenseInRange：近距进攻，进入攻击范围放
  zeyin: { attackType: "melee", energyProfile: ENERGY_PROFILES.passive, range: 54, moveSpeed: 68, abilityCastTiming: "passive" },
  mitsuri: { attackType: "melee", energyProfile: ENERGY_PROFILES.flow, range: 54, moveSpeed: 50, abilityCastTiming: "offenseInRange" },
  // offenseReady：远程/战场进攻，满能量即放
  ember_blade: { attackType: "ranged", energyProfile: ENERGY_PROFILES.tempo, range: 230, moveSpeed: 58, abilityCastTiming: "offenseReady" },
  spark_mage: { attackType: "ranged", energyProfile: ENERGY_PROFILES.flow, range: 185, moveSpeed: 50, abilityCastTiming: "offenseReady" },
  clock_gunner: { attackType: "ranged", energyProfile: ENERGY_PROFILES.tempo, range: 280, moveSpeed: 48, abilityCastTiming: "offenseReady" },
  dawn_duelist: { attackType: "melee", energyProfile: ENERGY_PROFILES.automatic, range: 52, moveSpeed: 86, abilityCastTiming: "offenseReady" },
  grove_mender: { attackType: "melee", energyProfile: ENERGY_PROFILES.flow, range: 58, moveSpeed: 66, abilityCastTiming: "engage" },
  sui_blue: { attackType: "ranged", energyProfile: ENERGY_PROFILES.feast, range: 240, moveSpeed: 58, abilityCastTiming: "offenseReady" },
  sui_flower: { attackType: "ranged", energyProfile: ENERGY_PROFILES.flow, range: 180, moveSpeed: 50, abilityCastTiming: "offenseReady" },
  yua: { attackType: "ranged", energyProfile: ENERGY_PROFILES.alien, range: 295, moveSpeed: 54, abilityCastTiming: "offenseReady" },
  sumi: { attackType: "ranged", energyProfile: ENERGY_PROFILES.flow, range: 245, moveSpeed: 54, abilityCastTiming: "selfBuff" },
  nori: { attackType: "ranged", energyProfile: ENERGY_PROFILES.automatic, range: 220, moveSpeed: 60, abilityCastTiming: "offenseReady" },
  kioi: { attackType: "ranged", energyProfile: ENERGY_PROFILES.tempo, range: 235, moveSpeed: 56, abilityCastTiming: "offenseReady" },
  nightin: { attackType: "ranged", energyProfile: ENERGY_PROFILES.flow, range: 180, moveSpeed: 50, abilityCastTiming: "offenseReady" },
  xuehui: { attackType: "melee", energyProfile: ENERGY_PROFILES.tempo, range: 56, moveSpeed: 58, abilityCastTiming: "offenseInRange" },
  tower_god: { attackType: "ranged", energyProfile: ENERGY_PROFILES.reservoir, range: 225, moveSpeed: 48, abilityCastTiming: "offenseReady" },
  rei: { attackType: "ranged", energyProfile: REI_SLOW_ENERGY_PROFILE, range: 225, moveSpeed: 54, abilityCastTiming: "offenseReady" },
  lian: { attackType: "ranged", energyProfile: ENERGY_PROFILES.reservoir, range: 215, moveSpeed: 56, abilityCastTiming: "offenseReady" },
  pako: { attackType: "ranged", energyProfile: ENERGY_PROFILES.flow, range: 195, moveSpeed: 50, abilityCastTiming: "supportHeal" },
  miki_guest: { attackType: "ranged", energyProfile: ENERGY_PROFILES.reservoir, range: 230, moveSpeed: 56, abilityCastTiming: "offenseReady" },
  hatsuse_guest: { attackType: "ranged", energyProfile: ENERGY_PROFILES.tempo, range: 225, moveSpeed: 62, abilityCastTiming: "offenseReady" },
  rift_tyrant: { attackType: "melee", energyProfile: ENERGY_PROFILES.reservoir, range: 78, moveSpeed: 56, abilityCastTiming: "offenseReady" },
};

const unit = (
  definition: Omit<UnitDefinition, "attackType" | "energyProfile" | "range" | "moveSpeed" | "abilityCastTiming" | "abilityRange"> &
    Partial<Pick<UnitDefinition, "attackType" | "energyProfile" | "range" | "moveSpeed" | "abilityCastTiming" | "abilityRange">>,
): UnitDefinition => {
  const resolved = {
    ...definition,
    ...COMBAT_PROFILES[definition.id],
  };
  const defaultAbilityRange = (() => {
    switch (resolved.abilityCastTiming) {
      case "passive":
      case "selfBuff":
      case "selfOnHit":
        return 0;
      case "offenseInRange":
        return resolved.range;
      case "supportHeal":
      case "supportShield":
      case "supportRescue":
        return 420;
      case "engage":
        return 420;
      case "offenseReady":
        return Math.min(520, Math.max(360, resolved.range + 180));
      default: {
        const exhaustive: never = resolved.abilityCastTiming;
        return exhaustive;
      }
    }
  })();
  return {
    ...resolved,
    abilityRange: definition.abilityRange ?? defaultAbilityRange,
  };
};

export const UNIT_DEFS: Record<UnitId, UnitDefinition> = {
  // 2 费前排：果冻风纪（由 1 费上调）
  sun_guard: unit({
    id: "sun_guard",
    name: "果冻风纪",
    title: "灰泽满Hazel · 满区逃生",
    glyph: "满",
    color: "#245f80",
    accent: "#7de2ff",
    tier: 2,
    cost: 2,
    traits: ["vanguard", "gen27", "traffic"],
    hp: 305,
    attack: 18,
    armor: 28,
    range: 48,
    attackInterval: 1.18,
    moveSpeed: 44,
    abilityName: "满区逃生",
    abilityDescription: "持续自动充能，攻击与受击也会回复能量；能量满且受击时变成虫形“满区”，短暂停止攻击和回能，主动逃离最近敌人，并获得闪避和持续治疗。",
    abilityLevels: [
      {
        summary: "1.25 秒 · 55% 闪避 · 总回复 5%",
        description: "变成虫形“满区”1.25 秒；期间停止攻击和回能，增加 105 移速并主动逃离最近敌人，获得 55% 闪避，每秒回复 4% 最大生命。",
        stats: { duration: 1.25, dodge: 0.55, healPerSecond: 0.04, moveSpeedBonus: 105 },
      },
      {
        summary: "1.35 秒 · 60% 闪避 · 总回复 6.75%",
        description: "变成虫形“满区”1.35 秒；期间停止攻击和回能，增加 115 移速并主动逃离最近敌人，获得 60% 闪避，每秒回复 5% 最大生命。",
        stats: { duration: 1.35, dodge: 0.6, healPerSecond: 0.05, moveSpeedBonus: 115 },
      },
      {
        summary: "1.5 秒 · 65% 闪避 · 总回复 9%",
        description: "变成虫形“满区”1.5 秒；期间停止攻击和回能，增加 125 移速并主动逃离最近敌人，获得 65% 闪避，每秒回复 6% 最大生命。",
        stats: { duration: 1.5, dodge: 0.65, healPerSecond: 0.06, moveSpeedBonus: 125 },
      },
    ],
    portrait: "/images/livers/hazel.png",
    portraitFocus: "top",
    shop: true,
  }),
  // 1 费：可靠的构筑零件，每个都能明确指向一条阵容路线。
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
    abilityName: "近视射击",
    abilityDescription: "依次射出若干胡萝卜弹幕；瞄准不准，方向带有随机偏移。",
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
    abilityDescription: "持续自动充能，攻击与受击也会少量回复能量；为生命比例最低的一名友军回复生命。",
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
    attack: 26,
    armor: 8,
    range: 48,
    abilityRange: 240,
    attackInterval: 0.88,
    moveSpeed: 78,
    abilityName: "冷笑话",
    abilityDescription: "向施法距离内最远的敌人发射 😂 冷笑话弹幕，命中造成伤害并短暂眩晕目标。",
    abilityLevels: [
      {
        summary: "2.7 倍伤害 · 0.85 秒眩晕",
        description: "发射 😂 冷笑话弹幕，命中造成 2.7 倍攻击伤害并眩晕 0.85 秒。",
        stats: { damageMultiplier: 2.7, stunDuration: 0.85 },
      },
      {
        summary: "3.1 倍伤害 · 1.05 秒眩晕",
        description: "发射 😂 冷笑话弹幕，命中造成 3.1 倍攻击伤害并眩晕 1.05 秒。",
        stats: { damageMultiplier: 3.1, stunDuration: 1.05 },
      },
      {
        summary: "3.6 倍伤害 · 1.3 秒眩晕",
        description: "发射 😂 冷笑话弹幕，命中造成 3.6 倍攻击伤害并眩晕 1.3 秒。",
        stats: { damageMultiplier: 3.6, stunDuration: 1.3 },
      },
    ],
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
    tier: 4,
    cost: 4,
    traits: ["mystic", "host"],
    hp: 238,
    attack: 32,
    armor: 16,
    range: 220,
    attackInterval: 0.92,
    moveSpeed: 52,
    abilityName: "扔橘子",
    abilityDescription: "连续扔出 5 个橘子治疗最虚弱的队友；每次重新选择目标，治疗效果逐次减弱。",
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
    abilityDescription: "持续自动充能，攻击与受击也会少量回复能量；回复自身生命，并为生命比例最低的两名友军提供护盾。",
    portrait: "/images/livers/mofu.jpg",
    portraitFocus: "top",
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
    traits: ["dance", "aggression", "vanguard"],
    hp: 244,
    attack: 17,
    armor: 24,
    range: 48,
    attackInterval: 1.12,
    moveSpeed: 52,
    abilityName: "攻击弹幕",
    abilityDescription: "进入攻击弹幕状态：大幅提升攻速，并小幅提升攻击力与移速；期间能量从满缓慢降到空且无法回能，能量耗尽后结束。",
    portrait: "/images/materials/red/1d5ad005aff0b4b648a0f1ef6b8d0cd71954091502.png",
    portraitFocus: "top",
    shop: true,
  }),

  // 2 费：开始提供反后排、控制和续航等战术答案。
  rift_brawler: unit({
    id: "rift_brawler",
    name: "雅吨",
    title: "克罗雅Kloa · 辣福",
    glyph: "雅",
    color: "#4c3c72",
    accent: "#c4a1ff",
    tier: 2,
    cost: 2,
    traits: ["gen27", "yue_gang"],
    hp: 295,
    attack: 22,
    armor: 12,
    range: 52,
    attackInterval: 1.16,
    moveSpeed: 58,
    abilityName: "辣福",
    abilityDescription: "被动：自身灼烧时普攻附带灼烧。主动：打翻火锅，灼烧自己与周围小范围敌人。",
    portrait: "/images/livers/kloa.jpg",
    portraitFocus: "top",
    shop: true,
  }),
  // 3 费：以脆弱身板换取大范围持续硬控。
  spark_mage: unit({
    id: "spark_mage",
    name: "北欧魔法师",
    title: "瑞娅Rhea · 时停控场",
    glyph: "娅",
    color: "#593270",
    accent: "#e7a3ff",
    tier: 3,
    cost: 3,
    traits: ["ember", "mystic", "host"],
    hp: 165,
    attack: 25,
    armor: 8,
    range: 205,
    attackInterval: 1.18,
    moveSpeed: 50,
    abilityName: "北欧时停",
    abilityDescription: "在敌人最密集处展开时间停止球，球内敌我单位都无法行动；持续期间自身能量从满降至 0 且无法回复，能量耗尽时结束。范围和持续时间随星级提升。",
    abilityLevels: [
      {
        summary: "半径 108 / 1.8 秒",
        description: "在敌人最密集处展开半径 108 的时间停止球，球内敌我单位都无法行动；期间自身能量从满降至 0 且无法回复，能量耗尽时结束，最多持续 1.8 秒。",
        stats: { radius: 108, duration: 1.8 },
      },
      {
        summary: "半径 132 / 2.5 秒",
        description: "在敌人最密集处展开半径 132 的时间停止球，球内敌我单位都无法行动；期间自身能量从满降至 0 且无法回复，能量耗尽时结束，最多持续 2.5 秒。",
        stats: { radius: 132, duration: 2.5 },
      },
      {
        summary: "半径 162 / 3.4 秒",
        description: "在敌人最密集处展开半径 162 的时间停止球，球内敌我单位都无法行动；期间自身能量从满降至 0 且无法回复，能量耗尽时结束，最多持续 3.4 秒。",
        stats: { radius: 162, duration: 3.4 },
      },
    ],
    portrait: "/images/livers/rhea.png",
    portraitFocus: "top",
    shop: true,
  }),
  clock_gunner: unit({
    id: "clock_gunner",
    name: "老弥",
    title: "弥月Mizuki · 机械兔耳",
    glyph: "老",
    color: "#36566f",
    accent: "#92d7ff",
    tier: 2,
    cost: 2,
    traits: ["gen27", "yue_gang", "mature"],
    hp: 158,
    attack: 22,
    armor: 12,
    range: 245,
    attackInterval: 0.84,
    moveSpeed: 48,
    abilityName: "机械兔耳浮游炮",
    abilityDescription: "从头顶放出两只机械兔耳浮游炮；它们高速连射并快速转移，4 秒后回到弥月身上。",
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
    abilityName: "迎客松",
    abilityDescription: "在战场上长出一棵松树；松树固定不动，向附近敌人发射松针。",
    portrait: "/images/livers/harei.png",
    portraitFocus: "top",
    shop: true,
  }),
  grove_mender: unit({
    id: "grove_mender",
    name: "七海大鲨鱼",
    title: "七海Nana7mi · 凿击前排",
    glyph: "七",
    color: "#28644b",
    accent: "#79f2ad",
    tier: 5,
    cost: 5,
    traits: ["wild", "finance", "gluttony", "ember"],
    hp: 510,
    attack: 41,
    armor: 34,
    range: 58,
    abilityRange: 430,
    attackInterval: 0.9,
    moveSpeed: 66,
    abilityName: "凿凿冲击",
    abilityDescription: "冲到施法范围内最远的敌人身边，持续消耗能量并提升护甲、嘲讽周围敌人；期间每次受击都会发射 ⛏️ 反击，造成伤害与短暂眩晕。",
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
    traits: ["ember", "chuanmei", "mature", "aggression"],
    hp: 340,
    attack: 38,
    armor: 22,
    range: 195,
    attackInterval: 0.96,
    moveSpeed: 58,
    abilityName: "终场歌唱",
    abilityDescription: "基础攻击为单体激光。施放后持续耗尽能量，为施法距离内友军回复生命；期间改用远程火焰弹，命中后在小范围内造成伤害与灼烧。",
    portrait: "/images/livers/azi.webp",
    portraitFocus: "top",
    shop: true,
  }),
  sui_blue: unit({
    id: "sui_blue",
    name: "贪吃岁",
    title: "岁己SUI · 后排补刀",
    glyph: "蓝",
    color: "#3a5d94",
    accent: "#92c8ff",
    tier: 2,
    cost: 2,
    traits: ["skeleton_soldier", "gluttony", "finance", "traffic"],
    hp: 148,
    attack: 25,
    armor: 8,
    range: 235,
    attackInterval: 0.82,
    moveSpeed: 58,
    abilityName: "吃！",
    abilityDescription: "自动与攻击双重回能；强化下一次攻击至 2.25 倍攻击力，并按伤害吸血。",
    portrait: "/images/materials/blue/5a2bcc519c33a2213134bdc196799d041954091502.png",
    portraitFocus: "top",
    shop: true,
  }),
  shiori: unit({
    id: "shiori",
    name: "椰子栞",
    title: "栞栞Shiori · 海獭冲锋",
    glyph: "栞",
    color: "#6c7599",
    accent: "#c3cfff",
    tier: 3,
    cost: 3,
    traits: ["skeleton_soldier", "yue_gang", "dance", "finance"],
    hp: 240,
    attack: 29,
    armor: 18,
    range: 56,
    abilityRange: 300,
    attackInterval: 0.98,
    moveSpeed: 72,
    abilityName: "海獭冲击",
    abilityDescription: "冲向施法距离内最远的敌人，落地造成范围伤害与短暂眩晕，并为自己获得护盾。",
    portrait: "/images/livers/shiori.png",
    portraitFocus: "top",
    shop: true,
  }),

  // 3 费：岁己保留不同形态；其他角色暂以低费代表参与构筑。
  sui_bird: unit({
    id: "sui_bird",
    name: "小岁鸟",
    title: "岁己SUI · 连续肘击",
    glyph: "鸟",
    color: "#4d7494",
    accent: "#f7d77c",
    tier: 3,
    cost: 3,
    traits: ["mystic", "wild", "vanguard"],
    hp: 278,
    attack: 31,
    armor: 21,
    range: 56,
    abilityRange: 360,
    attackInterval: 0.92,
    moveSpeed: 75,
    abilityName: "连续肘击",
    abilityDescription: "连续发动 3 次冲撞，冲向敌人并击退沿途目标；每次命中造成伤害与短暂眩晕。",
    portrait: "/images/materials/bird/岁己_小鸟跳静态图.png",
    shop: true,
  }),
  sui_flower: unit({
    id: "sui_flower",
    name: "暴龙岁",
    title: "岁己SUI · 川渝暴龙",
    glyph: "花",
    color: "#a15282",
    accent: "#f6a8d4",
    tier: 3,
    cost: 3,
    traits: ["vanguard", "chuanmei", "mystic", "finance"],
    hp: 184,
    attack: 27,
    armor: 12,
    range: 205,
    attackInterval: 1.1,
    moveSpeed: 52,
    abilityName: "火锅云",
    abilityDescription: "向敌人最密集处降下红色火锅云，造成范围伤害、灼烧与眩晕。",
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
    traits: ["gluttony", "dance", "ranger"],
    hp: 182,
    attack: 34,
    armor: 11,
    range: 250,
    attackInterval: 0.76,
    moveSpeed: 56,
    abilityName: "外星贯穿光线",
    abilityDescription: "发射强化外星贯穿光线，穿透当前目标所在横排的所有敌人。",
    portrait: "/images/livers/yua.png",
    portraitFocus: "top",
    shop: true,
  }),
  seki_boar_king: unit({
    id: "seki_boar_king",
    name: "星汐Seki",
    title: "山猪王 · 星潮冲阵",
    glyph: "汐",
    color: "#275d62",
    accent: "#5ed9cf",
    tier: 3,
    cost: 3,
    traits: ["wild", "aggression", "skeleton_soldier"],
    hp: 332,
    attack: 31,
    armor: 26,
    range: 60,
    attackInterval: 1.02,
    moveSpeed: 62,
    abilityName: "山猪冲阵",
    abilityDescription: "进入持续耗能的山猪冲锋：大幅提高移速但无法普攻，缓慢转向；撞到敌人会将其击退并短暂眩晕，撞到战场边缘会反弹。",
    portrait: "/images/livers/seki.webp",
    portraitFocus: "top",
    shop: true,
  }),
  sumi: unit({
    id: "sumi",
    name: "礼墨Sumi",
    title: "礼墨Sumi · 墨符控场",
    glyph: "墨",
    color: "#384968",
    accent: "#91b9ff",
    tier: 3,
    cost: 3,
    traits: ["mystic", "ranger", "gluttony"],
    hp: 172,
    attack: 32,
    armor: 10,
    range: 245,
    attackInterval: 0.92,
    moveSpeed: 54,
    abilityName: "空气龙",
    abilityDescription: "进入约4.2秒隐身，能量持续消耗；敌人会把你放到最低攻击优先级，优先寻找其他目标。隐身期间仍可正常攻击并获得移速提升，能量耗尽解除隐身并发射礼小龙。",
    passiveName: "社恐",
    passiveDescription: "每次普攻后都会像泽音变身后一样产生攻击后坐力，把自己推离目标。",
    portrait: "/images/livers/sumi.jpg",
    portraitFocus: "top",
    shop: true,
  }),

  mitsuri: unit({
    id: "mitsuri",
    name: "三理理",
    title: "三理Mit3uri · 嘲讽护卫",
    glyph: "理",
    color: "#587d8e",
    accent: "#8be7df",
    tier: 3,
    cost: 3,
    traits: ["yue_gang", "mystic", "finance", "traffic"],
    hp: 188,
    attack: 27,
    armor: 11,
    range: 225,
    attackInterval: 0.96,
    moveSpeed: 52,
    abilityName: "站我后面",
    abilityDescription: "获得护盾并嘲讽周围敌人，使其优先攻击自己。",
    portrait: "/images/livers/mitsuri.jpg",
    portraitFocus: "top",
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
    abilityDescription: "向最远敌人滑跪突进，击退沿途敌人并使撞到的敌人短暂眩晕，同时为自己获得护盾。",
    portrait: "/images/livers/guangyi.jpg",
    portraitFocus: "top",
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
    traits: ["assassin", "aggression", "dance", "vanguard"],
    hp: 252,
    attack: 39,
    armor: 19,
    range: 50,
    attackInterval: 0.74,
    moveSpeed: 102,
    abilityName: "猫拳三连",
    abilityDescription: "闪现到最远敌人身后，与其一同推开一段距离，打出三记猫拳并击晕目标。",
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
    traits: ["chuanmei", "assassin", "mystic"],
    hp: 360,
    attack: 29,
    armor: 32,
    range: 55,
    attackInterval: 1.16,
    moveSpeed: 44,
    abilityName: "脑控",
    abilityDescription: "为施法距离内友军提供护盾，并震晕身边的敌人。",
    portrait: "/images/livers/nagisa.png",
    portraitFocus: "top",
    shop: true,
  }),
  tower_god: unit({
    id: "tower_god",
    name: "塔神",
    title: "笙歌 · 把别人当自己",
    glyph: "塔",
    color: "#313e6d",
    accent: "#f0c76b",
    tier: 4,
    cost: 4,
    traits: ["mystic", "traffic"],
    hp: 238,
    attack: 30,
    armor: 18,
    range: 225,
    attackInterval: 1.0,
    moveSpeed: 48,
    abilityName: "开挂",
    abilityDescription: "发动后进入“开挂”状态；塔神死亡时，让最近的存活队友继承持续到本场结束的攻击、护甲、攻速和移速增益。同名增益不叠加，只保留更强档位。",
    abilityLevels: [
      {
        summary: "攻击 +45% · 护甲 +25 · 攻速 +45% · 移速 +45",
        description: "发动后进入“开挂”状态；塔神死亡时，让最近的存活队友攻击 +45%、护甲 +25、攻速 +45%、移速 +45，持续到本场结束。同名增益不叠加，只保留更强档位。",
        stats: { attackBonus: 0.45, armorBonus: 25, attackSpeed: 0.45, moveSpeed: 45 },
      },
      {
        summary: "攻击 +65% · 护甲 +38 · 攻速 +65% · 移速 +65",
        description: "发动后进入“开挂”状态；塔神死亡时，让最近的存活队友攻击 +65%、护甲 +38、攻速 +65%、移速 +65，持续到本场结束。同名增益不叠加，只保留更强档位。",
        stats: { attackBonus: 0.65, armorBonus: 38, attackSpeed: 0.65, moveSpeed: 65 },
      },
      {
        summary: "攻击 +90% · 护甲 +55 · 攻速 +90% · 移速 +90",
        description: "发动后进入“开挂”状态；塔神死亡时，让最近的存活队友攻击 +90%、护甲 +55、攻速 +90%、移速 +90，持续到本场结束。同名增益不叠加，只保留更强档位。",
        stats: { attackBonus: 0.9, armorBonus: 55, attackSpeed: 0.9, moveSpeed: 90 },
      },
    ],
    portrait: "/images/livers/shengge.jpg",
    portraitFocus: "top",
    shop: true,
  }),

  // 饼干岁回落为 4 费前排。
  biscuit_sui: unit({
    id: "biscuit_sui",
    name: "饼干岁",
    title: "岁己SUI · 暖男救援",
    glyph: "饼",
    color: "#9a6a4c",
    accent: "#ffd28d",
    tier: 4,
    cost: 4,
    traits: ["wild", "gluttony", "finance"],
    hp: 350,
    attack: 32,
    armor: 29,
    range: 58,
    abilityRange: 360,
    attackInterval: 1,
    moveSpeed: 64,
    abilityName: "暖男回复",
    abilityDescription: "更快积攒能量；冲向施法距离内最虚弱的友军，为其治疗并添加护盾，同时击退沿途和落点附近的敌人。",
    portrait: "/images/materials/biscuit/饼干岁2.png",
    portraitFocus: "top",
    shop: true,
  }),

  // 公开成员的角色化战斗设计；无可核验梗时采用公开人设或名字意象。
  nori: unit({
    id: "nori", name: "能能弄你", title: "能能Nori · 弹幕射手", glyph: "能", color: "#526a9e", accent: "#9bb8ff", tier: 1, cost: 1,
    traits: ["ranger", "vanguard"], hp: 138, attack: 23, armor: 7, range: 225, attackInterval: 1.02, moveSpeed: 56,
    abilityName: "苹果派", abilityDescription: "发射 8 枚低伤害苹果派子弹。",
    portrait: "/images/livers/nori.jpg", portraitFocus: "top", shop: true,
  }),
  meme: unit({
    id: "meme", name: "毛神", title: "毛神 · 前排续航", glyph: "毛", color: "#54735b", accent: "#9be6aa", tier: 3, cost: 3,
    traits: ["wild", "skeleton_soldier", "aggression", "traffic"], hp: 290, attack: 23, armor: 28, range: 60, attackInterval: 1.06, moveSpeed: 48,
    abilityName: "夺回人生", abilityDescription: "震晕附近敌人并造成伤害，随后按造成伤害回复自身生命。",
    portrait: "/images/livers/meme.jpg", portraitFocus: "top", shop: true,
  }),
  zeyin: unit({
    id: "zeyin", name: "泽音美乐蒂", title: "泽音Melody · 涅槃斗士", glyph: "泽", color: "#6c4c86", accent: "#e2a9ff", tier: 4, cost: 4,
    traits: ["ranger", "mature", "dance", "traffic"], hp: 180, attack: 34, armor: 15, range: 54, attackInterval: 0.86, moveSpeed: 68,
    abilityName: "涅槃重生", abilityDescription: "初始以近战形态作战。首次倒下时伴随涅槃特效重生为低生命远程形态，攻击力与攻击速度大幅提高；重生后 4 秒内普攻会后退，但不会退出当前攻击距离。",
    portrait: "/images/livers/zeyin.jpg", portraitFocus: "top", shop: true,
  }),
  kioi: unit({
    id: "kioi", name: "美·鱿鱼", title: "美·鱿鱼 · 远程削弱", glyph: "鱿", color: "#7b6942", accent: "#f5d56f", tier: 2, cost: 2,
    traits: ["wild", "ranger"], hp: 162, attack: 27, armor: 9, range: 235, attackInterval: 0.84, moveSpeed: 60,
    abilityName: "讨厌你", abilityDescription: "点名一名敌人，造成伤害并降低其攻击力与护甲。",
    portrait: "/images/livers/kioi.jpg", portraitFocus: "top", shop: true,
  }),
  nightin: unit({
    id: "nightin", name: "南町", title: "绿色辣妹 · 深夜控场", glyph: "南", color: "#3b426f", accent: "#a9a7ff", tier: 2, cost: 2,
    traits: ["mystic", "dwarf"], hp: 150, attack: 22, armor: 8, range: 210, attackInterval: 1.05, moveSpeed: 55,
    abilityName: "烟头烫屁股", abilityDescription: "向敌人最密集处甩出烟头，造成范围伤害、灼烧并短暂眩晕。", portrait: "/images/livers/nightin.jpg", portraitFocus: "top", shop: true,
  }),
  tiandou: unit({
    id: "tiandou", name: "恬豆·甜点转圈", title: "四禧丸子 · 糖果支援", glyph: "豆", color: "#c87d95", accent: "#ffc2d7", tier: 2, cost: 2,
    traits: ["dance", "traffic"], hp: 172, attack: 23, armor: 11, range: 200, attackInterval: 0.98, moveSpeed: 56,
    abilityName: "棒棒糖刘海", abilityDescription: "向自身周围抛落数颗棒棒糖；糖果会留在地上，友军踩到会回复生命并加速，敌人踩到会受伤并减速。",
    portrait: "/images/livers/tiandou.jpg", portraitFocus: "top", shop: true,
  }),
  youyi: unit({
    id: "youyi", name: "又一·叛逆舞步", title: "四禧丸子 · 突进舞者", glyph: "又", color: "#84536f", accent: "#f0add2", tier: 3, cost: 3,
    traits: ["assassin", "dance", "vanguard"], hp: 212, attack: 31, armor: 14, range: 50, attackInterval: 0.86, moveSpeed: 82,
    abilityName: "叛逆转场", abilityDescription: "跃向最远敌人，连续踢击两次并短暂眩晕。",
    portrait: "/images/livers/youyi.jpg", portraitFocus: "top", shop: true,
  }),
  akirinco: unit({
    id: "akirinco", name: "秋凛子", title: "秋凛子Aki Rinco · 残血收割", glyph: "秋", color: "#65445f", accent: "#eca5d3", tier: 4, cost: 4,
    traits: ["assassin"], hp: 222, attack: 39, armor: 14, range: 50, attackInterval: 0.76, moveSpeed: 92,
    abilityName: "神社夜巡", abilityDescription: "跃至生命最低的敌人身边连续斩击；完成击杀后恢复生命。",
    portrait: "/images/livers/akirinco.jpg", portraitFocus: "top", shop: true,
  }),
  lovely: unit({
    id: "lovely", name: "狍子偶像", title: "狍子偶像 · 范围斗士", glyph: "狍", color: "#b36a72", accent: "#ffb0af", tier: 4, cost: 4,
    traits: ["assassin", "host", "dance"], hp: 270, attack: 37, armor: 18, range: 52, attackInterval: 0.84, moveSpeed: 72,
    abilityName: "捏捏摸摸", abilityDescription: "需要接近敌人才能发动；持续捏住最近的一名敌人，双方都无法行动，期间持续造成伤害，并将伤害的大部分转化为自身生命。",
    portrait: "/images/livers/lovely.webp", portraitFocus: "top", shop: true,
  }),
  mumu: unit({
    id: "mumu", name: "沐霂·领舞救场", title: "四禧丸子 · 后排救援", glyph: "沐", color: "#5b7992", accent: "#a9e5ff", tier: 4, cost: 4,
    traits: ["host", "dance"], hp: 270, attack: 31, armor: 20, range: 190, abilityRange: 420, attackInterval: 0.96, moveSpeed: 58,
    attackType: "ranged", abilityCastTiming: "supportRescue",
    abilityName: "领舞救场", abilityDescription: "施法距离内有友军陷入场地控制、持续压制、普通硬控或生命低于 35% 时，用舞带将最危险的一人拉到自己身后。落地后打断压制、净化普通控制，并治疗和添加护盾；时停只能通过被拉出范围解除。",
    portrait: "/images/livers/mumu.webp", portraitFocus: "top", shop: true,
  }),
  yukisyo: unit({
    id: "yukisyo", name: "雪烛Yukisyo", title: "雪烛Yukisyo · 赛博占卜师白虎神", glyph: "烛", color: "#5f5790", accent: "#ddb6ff", tier: 3, cost: 3,
    traits: ["mystic", "wild", "finance"], hp: 205, attack: 27, armor: 13, range: 225, abilityRange: 300, attackInterval: 1, moveSpeed: 48,
    abilityName: "八门镇式", abilityDescription: "初始能量较高。发动技能时，为施法距离内友军添加持续 4 秒、只吸收技能及其衍生伤害的技能护盾；护盾由固定值与目标最大生命值共同决定，重复获得时取较高值并刷新持续时间。",
    abilityLevels: [
      { summary: "70 + 26% 最大生命", description: "发动技能时，为施法距离内友军添加持续 4 秒的技能护盾，吸收 70 + 目标最大生命值 26% 的技能及其衍生伤害；普通攻击不会消耗该护盾。重复获得时取较高值并刷新持续时间。", stats: { shieldFlat: 70, shieldHpRatio: 0.26, duration: 4 } },
      { summary: "120 + 36% 最大生命", description: "发动技能时，为施法距离内友军添加持续 4 秒的技能护盾，吸收 120 + 目标最大生命值 36% 的技能及其衍生伤害；普通攻击不会消耗该护盾。重复获得时取较高值并刷新持续时间。", stats: { shieldFlat: 120, shieldHpRatio: 0.36, duration: 4 } },
      { summary: "200 + 50% 最大生命", description: "发动技能时，为施法距离内友军添加持续 4 秒的技能护盾，吸收 200 + 目标最大生命值 50% 的技能及其衍生伤害；普通攻击不会消耗该护盾。重复获得时取较高值并刷新持续时间。", stats: { shieldFlat: 200, shieldHpRatio: 0.5, duration: 4 } },
    ],
    portrait: "/images/livers/yukisyo.png", portraitFocus: "top", shop: true,
  }),
  xuehui: unit({
    id: "xuehui", name: "雪绘", title: "雪绘 · 同步视听", glyph: "绘", color: "#445a8e", accent: "#8dc8ff", tier: 4, cost: 4,
    traits: ["dwarf", "ember", "aggression", "traffic"], hp: 205, attack: 37, armor: 13, range: 56, attackInterval: 0.88, moveSpeed: 58,
    abilityName: "同步视听", abilityDescription: "近战挥斩周围敌人并附加灼烧。己方越优势，攻速与射程越低（骄兵必败）；越劣势则越高（哀兵必胜），移速始终不受影响。",
    portrait: "/images/livers/xuehui.jpg", portraitFocus: "top", shop: true,
  }),
  rei: unit({
    id: "rei", name: "病院坂灵", title: "病院坂灵Rei · 群体法师", glyph: "灵", color: "#735779", accent: "#e8b5ff", tier: 5, cost: 5,
    traits: ["mystic", "ranger"], hp: 270, attack: 43, armor: 18, range: 230, attackInterval: 0.82, moveSpeed: 66,
    abilityRange: 520,
    abilityName: "幽灵复活", abilityDescription: "开场拥有 25 点能量，之后仅随时间缓慢回复，攻击与受击均不回能。施法范围内出现当前星级所需的 2/3/5 具尚未被复活的尸体后，将他们以四分之一血幽灵形态复活并加入己方；每具尸体只能复活一次。",
    abilityLevels: [
      { summary: "2 具尸体 · 复活 2 名", description: "施法范围内出现 2 具尚未被复活的己方或敌方尸体后，将他们以四分之一血幽灵形态复活并加入己方；每具尸体只能复活一次。", stats: { reviveCount: 2 } },
      { summary: "3 具尸体 · 复活 3 名", description: "施法范围内出现 3 具尚未被复活的己方或敌方尸体后，将他们以四分之一血幽灵形态复活并加入己方；每具尸体只能复活一次。", stats: { reviveCount: 3 } },
      { summary: "5 具尸体 · 复活 5 名", description: "施法范围内出现 5 具尚未被复活的己方或敌方尸体后，将他们以四分之一血幽灵形态复活并加入己方；每具尸体只能复活一次。", stats: { reviveCount: 5 } },
    ],
    portrait: "/images/livers/rei.jpg", portraitFocus: "top", shop: true,
  }),
  rutice: unit({
    id: "rutice", name: "露蒂丝·诊所护航", title: "露蒂丝Rutice · 决战守卫", glyph: "医", color: "#4b7280", accent: "#90e7df", tier: 5, cost: 5,
    traits: ["vanguard", "mystic"], hp: 455, attack: 38, armor: 38, range: 55, attackInterval: 1.02, moveSpeed: 60,
    abilityName: "咕咕诊所", abilityDescription: "为施法距离内友军回复生命，并为其中生命比例最低的两名友军提供护盾。",
    portrait: "/images/livers/rutice.jpg", portraitFocus: "top", shop: true,
  }),
  lian: unit({
    id: "lian", name: "梨安·终场谢幕", title: "四禧丸子 · 终场舞者", glyph: "梨", color: "#8b5b9b", accent: "#e3b2ff", tier: 5, cost: 5,
    traits: ["mystic", "dance", "chuanmei", "finance"], hp: 252, attack: 43, armor: 18, range: 225, attackInterval: 0.8, moveSpeed: 70,
    abilityName: "终场谢幕", abilityDescription: "轰击施法距离内敌人最密集处，造成范围伤害并为施法距离内友军补充能量。",
    portrait: "/images/livers/lian.jpg", portraitFocus: "top", shop: true,
  }),
  pako: unit({
    id: "pako", name: "帕可Pako", title: "帕可Pako · 范围治疗", glyph: "帕", color: "#6f52a3", accent: "#d7b3ff", tier: 1, cost: 1,
    traits: ["host", "mystic"], hp: 142, attack: 18, armor: 7, range: 195, attackInterval: 1.08, moveSpeed: 50,
    abilityName: "天使摸鱼", abilityDescription: "向受伤友军最密集的区域扔出一条天使鱼；落地治疗范围内友军，并留下持续 3.2 秒的治疗区。治疗量随帕可自身属性成长。",
    portrait: "/images/livers/pako.jpg", portraitFocus: "top", shop: true,
  }),

  miki_guest: unit({
    id: "miki_guest",
    name: "弥希Miki",
    title: "弥希Miki · 双声道法控",
    glyph: "弥",
    color: "#554687",
    accent: "#c6b4ff",
    tier: 5,
    cost: 5,
    traits: ["mystic", "host", "mature", "traffic"],
    hp: 286,
    attack: 42,
    armor: 20,
    range: 230,
    attackInterval: 0.86,
    moveSpeed: 56,
    abilityName: "双声道返场",
    abilityDescription: "以左右双声道轰击敌人最密集处，造成两段范围伤害并短暂眩晕。",
    portrait: "/images/autochess/enemy-guests/miki.jpg",
    portraitFocus: "center",
    shop: false,
  }),
  hatsuse_guest: unit({
    id: "hatsuse_guest",
    name: "初濑Hatsuse",
    title: "初濑Hatsuse · 蝙蝠夜歌",
    glyph: "濑",
    color: "#5b466f",
    accent: "#ff9fce",
    tier: 5,
    cost: 5,
    traits: ["ember", "mystic", "yue_gang", "ranger"],
    hp: 268,
    attack: 40,
    armor: 18,
    range: 225,
    attackInterval: 0.78,
    moveSpeed: 62,
    abilityName: "蝙蝠夜歌",
    abilityDescription: "召来蝙蝠声浪穿过施法距离内数名敌人，造成伤害并将部分伤害转化为施法距离内友军治疗。",
    portrait: "/images/autochess/enemy-guests/hatsuse.jpg",
    portraitFocus: "center",
    shop: false,
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
    abilityDescription: "冲击施法距离内的所有敌人并造成眩晕，半血后进入狂暴。",
    portrait: "/images/autochess/portraits/rift-tyrant.png",
    portraitFocus: "center",
    shop: false,
  }),
};

export const SHOP_UNITS: ShopUnitId[] = [...SHOP_UNIT_IDS];

export const STARTERS: StarterDefinition[] = [
  { id: "mature_start", icon: "🧱", name: "成熟稳重", subtitle: "老派开场", description: "携带浣熊店员开局；所有友军开战获得 8% 最大生命护盾，初始金币 +2。", unit: "gale_archer", color: "#b9a274" },
  { id: "blaze", icon: "🔥", name: "火热整活", subtitle: "辣福灼烧", description: "携带雅吨开局；灼烧伤害 +30%，首次胜利额外获得 1 金币。", unit: "rift_brawler", color: "#ff8058" },
  { id: "traffic_start", icon: "📈", name: "热点追踪", subtitle: "流量续航", description: "携带大黑鼠开局；流量成员吸血额外 +6%，初始金币 +1。", unit: "dawn_duelist", color: "#ff7197" },
  { id: "bastion", icon: "🏰", name: "持久抗压", subtitle: "稳扎稳打", description: "携带果冻风纪开局；基地生命 +3，所有护盾效果 +20%。", unit: "sun_guard", color: "#69d8ff" },
  { id: "dance_start", icon: "🎭", name: "舞台梦", subtitle: "红帽开场", description: "携带小红帽开局；初始金币 +1，所有友军开战 +10 能量，跳舞成员攻击速度 +8%。", unit: "sui", color: "#f39ade" },
  { id: "ranger_start", icon: "🏹", name: "稳定输出", subtitle: "远程热身", description: "携带兔子射手开局；所有远程友军攻击速度 +10%，首次刷新商店免费。", unit: "ember_blade", color: "#f2d15e" },
];

export const AUGMENTS: AugmentDefinition[] = [
  {
    id: "tempered",
    tier: "minor",
    icon: "🛡️",
    name: "果冻风纪",
    kicker: "生存 · 小幅减伤",
    description: "所有友军获得 10 护甲。",
    color: "#76cfff",
  },
  {
    id: "sharp_edge",
    tier: "minor",
    icon: "⚔️",
    name: "炽焰磨刃",
    kicker: "输出 · 稳定增伤",
    description: "所有友军攻击力提高 12%。",
    color: "#ff986b",
  },
  {
    id: "momentum",
    tier: "minor",
    icon: "⚡",
    name: "弹幕加速",
    kicker: "节奏 · 稳定攻速",
    description: "所有友军攻击速度提高 14%。",
    color: "#f4d35e",
  },
  {
    id: "payday",
    tier: "minor",
    icon: "💳",
    name: "花呗生活",
    kicker: "经济 · 先花后还",
    description: "立即获得 8 金币；之后 4 个回合收入 -1。",
    color: "#ffd166",
  },
  {
    id: "vitality",
    tier: "minor",
    icon: "❤️",
    name: "体能储备",
    kicker: "生存 · 基础体魄",
    description: "所有友军最大生命提高 8%。",
    color: "#69d7a3",
  },
  {
    id: "precision",
    tier: "minor",
    icon: "🎯",
    name: "弹幕校准",
    kicker: "输出 · 暴击训练",
    description: "所有友军暴击率提高 15%。",
    color: "#f2bb62",
  },
  {
    id: "overclock",
    tier: "major",
    icon: "📡",
    name: "出道推流",
    kicker: "技能 · 抢先启动",
    description: "所有友军开战时额外获得 45 能量；每次施放技能后保留 10 能量。",
    color: "#c58cff",
  },
  {
    id: "triage",
    tier: "major",
    icon: "✚",
    name: "全员续航",
    kicker: "团队 · 持续回复",
    description: "每 2.5 秒治疗全部友军 5% 最大生命。",
    color: "#72e7a5",
  },
  {
    id: "execution",
    tier: "major",
    icon: "☠️",
    name: "收割",
    kicker: "输出 · 补刀",
    description: "对生命低于 45% 的敌人造成 50% 额外伤害。",
    color: "#ff6b8a",
  },
  {
    id: "second_wind",
    tier: "major",
    icon: "🏯",
    name: "德川家康",
    kicker: "生存 · 活得久",
    description: "所有友军 +12% 最大生命、+10 护甲；每名友军首次低于 30% 生命时恢复 18% 最大生命。",
    color: "#88a7ff",
  },
  {
    id: "glass_cannon",
    tier: "major",
    icon: "💥",
    name: "极限超频",
    kicker: "输出 · 风险换火力",
    description: "所有友军攻击力 +25%、攻击速度 +20%，但最大生命降低 15%。",
    color: "#ff7d71",
  },
  {
    id: "united_front",
    tier: "major",
    icon: "🤝",
    name: "全员护航",
    kicker: "生存 · 开战防线",
    description: "所有友军开战获得 25% 最大生命护盾和 15 能量。",
    color: "#66d9d1",
  },
];

export const WAVES: WaveDefinition[] = [
  {
    round: 1,
    name: "直播间暖场",
    tag: "normal",
    description: "果冻风纪与兔子射手在前排，适合熟悉站位。",
    modifier: Math.sqrt(2 / 3),
    units: [{ id: "sun_guard" }, { id: "ember_blade" }],
  },
  {
    round: 2,
    name: "毛茸茸夜班",
    tag: "normal",
    description: "绒绒的狗与浣熊店员撑住前排，好笑姐姐会从侧翼突入后排。",
    modifier: Math.sqrt(5 / 3),
    units: [{ id: "mossback" }, { id: "gale_archer" }, { id: "rift_stalker" }],
  },
  {
    round: 3,
    name: "深夜档突入",
    tag: "normal",
    description: "可爱冲阵会打乱前线，分散站位可降低损失。",
    modifier: Math.sqrt(9 / 12),
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
    description: "精英预警：果冻风纪控制前排，弥月火力锁定远端单位。",
    modifier: Math.sqrt(18 / 9),
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
    description: "饼干岁会冲向虚弱友军提供治疗与护盾，优先集火可压制这套毛茸茸续航。",
    modifier: Math.sqrt(16 / 9),
    units: [
      { id: "mossback" },
      { id: "mossback" },
      { id: "biscuit_sui" },
      { id: "rift_brawler" },
      { id: "ember_blade" },
    ],
  },
  {
    round: 6,
    name: "攻城序列",
    tag: "normal",
    description: "阿梓的前排冲阵惩罚抱团，浣熊射手持续压制后排。",
    modifier: Math.sqrt(17 / 12),
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
    tag: "normal",
    description: "前排、输出与辅助同时登场，检验阵容完整度。",
    modifier: Math.sqrt(21 / 16),
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
    name: "暴君投影",
    tag: "elite",
    description: "精英预警：暴君投影携带双辅卫队；这是终局首领前的机制演练。",
    modifier: Math.sqrt(32 / 10),
    units: [{ id: "rift_tyrant" }, { id: "shiori" }, { id: "rift_brawler" }],
  },
];

export const CAMPAIGN_ROUNDS = 16;
export const NORMAL_ENDLESS_END_ROUND = 31;
export const HELL_ENDLESS_START_ROUND = NORMAL_ENDLESS_END_ROUND + 1;
export const NORMAL_INTEREST_CAP = 4;
export const FINANCE_INTEREST_CAP = 20;
export const BOSS_WARNING_TEXT = "首领预警：敌人非常强大，请倾尽所有资源应对，否则可能会失败。";
export const ELITE_WARNING_TEXT = "精英预警：敌人强度明显提升，请升级阵容并调整站位。";
export const HELL_WARNING_TEXT = "地狱预警：敌人会持续变强，请不断强化阵容。";

export type ProgressionMode = "campaign" | "endless" | "hell";

export const progressionModeForRound = (round: number): ProgressionMode => {
  if (round <= CAMPAIGN_ROUNDS) return "campaign";
  if (round <= NORMAL_ENDLESS_END_ROUND) return "endless";
  return "hell";
};

export const augmentTierForRound = (round: number): AugmentTier | null => {
  const campaignTier: Partial<Record<number, AugmentTier>> = {
    2: "minor",
    4: "major",
    8: "minor",
    12: "major",
    16: "major",
  };
  if (round <= CAMPAIGN_ROUNDS) return campaignTier[round] ?? null;
  if ((round - CAMPAIGN_ROUNDS) % 6 !== 0) return null;
  return ((round - CAMPAIGN_ROUNDS) / 6) % 2 === 1 ? "minor" : "major";
};

const ENDLESS_NAMES = [
  "回响突击群",
  "裂隙混编队",
  "失序远征军",
  "深层守望者",
] as const;

const HELL_NAMES = [
  "猩红清算者",
  "地狱追猎群",
  "失控升星潮",
  "终焉守门人",
] as const;

const STAR_COPY_VALUE = [0, 1, 3, 9] as const;

export const ENEMY_GUEST_IDS = ["miki_guest", "hatsuse_guest"] as const;

const ENEMY_SQUADS: ReadonlyArray<{
  name: string;
  units: readonly UnitId[];
}> = [
  {
    name: "深夜声场",
    units: ["spark_mage", "nightin", "cinder_ram", "rei", "sui_flower", "lian", "shiori"],
  },
  {
    name: "舞台突袭",
    units: ["mumu", "youyi", "lian", "sui_cat", "lovely", "tiandou", "pako"],
  },
  {
    name: "同期联动",
    units: ["sun_guard", "ember_blade", "rift_brawler", "clock_gunner", "shiori", "mitsuri", "sumi"],
  },
  {
    name: "毛茸盛宴",
    units: ["mossback", "grove_mender", "sui_bird", "biscuit_sui", "meme", "kioi", "seki_boar_king"],
  },
];

const ENDLESS_BOSS_SQUADS: ReadonlyArray<{
  name: string;
  units: readonly UnitId[];
}> = [
  {
    name: "时停合唱团",
    units: ["spark_mage", "nightin", "shiori", "cinder_ram", "rei", "sui_flower"],
  },
  {
    name: "终场续航团",
    units: ["cinder_ram", "cinder_ram", "cinder_ram", "lian", "clock_gunner", "shiori"],
  },
  {
    name: "高费压制团",
    units: ["lian", "lian", "cinder_ram", "spark_mage", "seki_boar_king", "guangyi"],
  },
];

const enemySquadForRound = (round: number, seed = 0) => {
  const endlessDepth = round - CAMPAIGN_ROUNDS;
  if (endlessDepth > 0 && endlessDepth % 5 === 0) {
    const bossIndex = endlessDepth / 5 - 1;
    return ENDLESS_BOSS_SQUADS[bossIndex % ENDLESS_BOSS_SQUADS.length];
  }
  return ENEMY_SQUADS[Math.abs(round * 7 + seed * 11) % ENEMY_SQUADS.length];
};

const enemyGuestForRound = (round: number, seed = 0): UnitId | null => {
  if (round <= WAVES.length) return null;
  const guestChance = round > CAMPAIGN_ROUNDS ? 2 : 1;
  if (Math.abs(round * 31 + seed * 17) % 7 > guestChance) return null;
  return ENEMY_GUEST_IDS[Math.abs(round + seed) % ENEMY_GUEST_IDS.length];
};

export const waveCompositionValue = (wave: Pick<WaveDefinition, "units">) =>
  wave.units.reduce(
    (total, waveUnit) =>
      total + UNIT_DEFS[waveUnit.id].cost * STAR_COPY_VALUE[waveUnit.star ?? 1],
    0,
  );

export const enemyTraitActivations = (
  units: readonly WaveUnit[],
) => {
  const uniqueIds = new Set(units.map((waveUnit) => waveUnit.id));
  return TRAIT_IDS.flatMap((id) => {
    let count = 0;
    uniqueIds.forEach((unitId) => {
      if (UNIT_DEFS[unitId].traits.includes(id)) count += 1;
    });
    const level = traitLevelForCount(TRAITS[id], count);
    return level ? [{ id, count, level }] : [];
  });
};

const tagForRound = (round: number): WaveDefinition["tag"] => {
  if (round <= CAMPAIGN_ROUNDS) {
    if (round === CAMPAIGN_ROUNDS) return "boss";
    return round % 4 === 0 ? "elite" : "normal";
  }
  const endlessRound = round - CAMPAIGN_ROUNDS;
  if (endlessRound % 5 === 0) return "boss";
  return endlessRound % 3 === 0 ? "elite" : "normal";
};

export const enemyBudgetForRound = (round: number) => {
  const safeRound = Math.max(1, Math.floor(round));
  if (safeRound <= WAVES.length) {
    const wave = WAVES[safeRound - 1];
    return Math.round(waveCompositionValue(wave) * wave.modifier * wave.modifier);
  }
  if (safeRound <= CAMPAIGN_ROUNDS) {
    const campaignDepth = safeRound - WAVES.length;
    const baseBudget =
      18 + campaignDepth * 4.5 + campaignDepth * campaignDepth * 0.42;
    const tag = tagForRound(safeRound);
    return Math.round(
      baseBudget * (tag === "boss" ? 1.55 : tag === "elite" ? 1.9 : 0.75),
    );
  }
  let budget = 135;
  for (let waveRound = CAMPAIGN_ROUNDS + 1; waveRound < safeRound; waveRound += 1) {
    const nextMode = progressionModeForRound(waveRound + 1);
    const bounty = projectedBountyForGeneratedRound(waveRound, budget);
    const interest = nextMode === "hell" ? FINANCE_INTEREST_CAP : 5;
    const finance = nextMode === "hell" ? 2 : 0;
    const streak = 2;
    budget += interest + finance + streak + bounty;
  }
  return budget;
};

const generatedUnitCount = (round: number) => {
  if (round <= CAMPAIGN_ROUNDS) {
    return Math.min(10, 5 + Math.floor((round - 9) / 3));
  }
  if (round <= 21) return 10;
  if (round <= 25) return 11;
  if (round <= 28) return 12;
  if (round <= NORMAL_ENDLESS_END_ROUND) return 13;
  return 14 + Math.floor((round - HELL_ENDLESS_START_ROUND) / 2);
};

const buildBudgetedUnits = (
  round: number,
  tag: WaveDefinition["tag"],
  budget: number,
  seed = 0,
) => {
  const count = generatedUnitCount(round);
  const squad = enemySquadForRound(round, seed);
  const units: WaveUnit[] = Array.from({ length: count }, (_, index) => {
    if (tag === "boss" && index === 0) return { id: "rift_tyrant", star: 1 };
    const squadIndex = tag === "boss" ? index - 1 : index;
    return {
      id: squad.units[squadIndex % squad.units.length],
      star: 1,
    };
  });
  const guest = enemyGuestForRound(round, seed);
  if (guest && units.length > 1) units[units.length - 1] = { id: guest, star: 1 };

  const maxStar: 1 | 2 | 3 = round < 15 ? 2 : 3;
  let remaining = Math.max(0, budget - waveCompositionValue({ units }));
  for (let guard = 0; guard < units.length * 2; guard += 1) {
    const options = units
      .map((candidateUnit, index) => {
        const star = candidateUnit.star ?? 1;
        const nextStar = Math.min(3, star + 1) as 1 | 2 | 3;
        return {
          index,
          nextStar,
          cost:
            UNIT_DEFS[candidateUnit.id].cost *
            (STAR_COPY_VALUE[nextStar] - STAR_COPY_VALUE[star]),
          priority: (index * 7 + round) % Math.max(1, units.length),
        };
      })
      .sort((left, right) => right.cost - left.cost || left.priority - right.priority);
    let [choice] = options;
    while (choice && (choice.nextStar > maxStar || choice.cost > remaining)) {
      options.shift();
      [choice] = options;
    }
    if (!choice) break;
    units[choice.index] = { ...units[choice.index], star: choice.nextStar };
    remaining -= choice.cost;
  }
  return units;
};

const bountyForUnits = (units: readonly WaveUnit[]) =>
  units.reduce((total, waveUnit) => total + (waveUnit.star ?? 1), 0);

const projectedBountyForGeneratedRound = (round: number, budget: number) =>
  bountyForUnits(buildBudgetedUnits(round, tagForRound(round), budget));

export const projectedIncomeAfterRound = (round: number) => {
  const safeRound = Math.max(CAMPAIGN_ROUNDS + 1, Math.floor(round));
  const nextMode = progressionModeForRound(safeRound + 1);
  const interest = nextMode === "hell" ? FINANCE_INTEREST_CAP : 5;
  const finance = nextMode === "hell" ? 2 : 0;
  const streak = 2;
  const bounty = projectedBountyForGeneratedRound(
    safeRound,
    enemyBudgetForRound(safeRound),
  );
  return {
    interest,
    streak,
    finance,
    bounty,
    total: interest + streak + finance + bounty,
  };
};

export const waveForRound = (round: number, seed = 0): WaveDefinition => {
  if (round <= WAVES.length) return WAVES[Math.max(0, round - 1)];

  const mode = progressionModeForRound(round);
  const tag = tagForRound(round);
  const budget = enemyBudgetForRound(round);
  const units = buildBudgetedUnits(round, tag, budget, seed);
  const compositionValue = Math.max(1, waveCompositionValue({ units }));
  const modifier = Math.sqrt(budget / compositionValue);
  const endlessRound = round - CAMPAIGN_ROUNDS;
  const nameIndex = Math.max(0, endlessRound - 1);
  const squad = enemySquadForRound(round, seed);

  return {
    round,
    name:
      tag === "boss"
        ? mode === "campaign"
          ? "暴君本体 · 远征终局"
          : `${squad.name} · ${round}`
        : mode === "campaign"
          ? tag === "elite"
            ? `${squad.name} · 精英 ${round}`
            : `${squad.name} · ${round}`
          : mode === "hell"
            ? `${HELL_NAMES[nameIndex % HELL_NAMES.length]} · ${round}`
            : `${ENDLESS_NAMES[nameIndex % ENDLESS_NAMES.length]} · ${round}`,
    tag,
    description:
      tag === "boss"
        ? BOSS_WARNING_TEXT
        : tag === "elite"
          ? ELITE_WARNING_TEXT
          : mode === "campaign"
            ? "敌人组成了完整羁绊，请根据敌方阵容调整站位。"
            : mode === "endless"
              ? "敌人会持续变强，请继续强化阵容。"
              : "地狱无限：敌人会越来越强，请不断强化阵容。",
    modifier,
    units,
  };
};

export const PLAYER_LEVELS = [3, 4, 5, 6, 7, 8, 9, 10] as const;
export type PlayerLevel = (typeof PLAYER_LEVELS)[number];
export type ShopTierOdds = readonly [number, number, number, number, number];

interface PlayerLevelConfig {
  boardCap: number;
  upgradeCost: number | null;
  tierOdds: ShopTierOdds;
}

export const STARTING_PLAYER_LEVEL: PlayerLevel = 3;
export const MAX_PLAYER_LEVEL: PlayerLevel = 10;
export const bookLevelForPlayerLevel = (level: PlayerLevel) => level;
export const PASSIVE_UPGRADE_DISCOUNT = 1;

export const PLAYER_LEVEL_CONFIG: Record<PlayerLevel, PlayerLevelConfig> = {
  3: { boardCap: 3, upgradeCost: 5, tierOdds: [75, 25, 0, 0, 0] },
  4: { boardCap: 4, upgradeCost: 9, tierOdds: [50, 38, 11, 1, 0] },
  5: { boardCap: 5, upgradeCost: 14, tierOdds: [35, 35, 24, 5, 1] },
  6: { boardCap: 6, upgradeCost: 20, tierOdds: [25, 30, 30, 13, 2] },
  7: { boardCap: 7, upgradeCost: 27, tierOdds: [15, 25, 32, 23, 5] },
  8: { boardCap: 8, upgradeCost: 36, tierOdds: [10, 20, 30, 30, 10] },
  9: { boardCap: 9, upgradeCost: 46, tierOdds: [7, 15, 25, 35, 18] },
  10: { boardCap: 10, upgradeCost: null, tierOdds: [5, 10, 20, 40, 25] },
};

export const tierOddsForLevel = (level: PlayerLevel) =>
  PLAYER_LEVEL_CONFIG[level].tierOdds;

export const upgradeCostForLevel = (level: PlayerLevel) =>
  PLAYER_LEVEL_CONFIG[level].upgradeCost;

export const SHOP_TIER_COUNTS = [1, 2, 3, 4, 5].map(
  (tier) => SHOP_UNITS.filter((id) => UNIT_DEFS[id].tier === tier).length,
);
