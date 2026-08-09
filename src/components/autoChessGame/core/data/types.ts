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
  "sumi",
  "spark_mage",
  "yukisyo",
  // 4 费
  "sui_cat",
  "nagisa",
  // "akirinco",
  "rei",
  "rutice",
  "mumu",
  "xuehui",
  "tower_god",
  "cog_scribe",
  // 5 费
  "biscuit_sui",
  "cinder_ram",
  "seki_boar_king",
  "lovely",
  "komichi",
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

export const ZEYIN_REBIRTH_ENERGY_PROFILE: EnergyProfile = {
  id: "automatic",
  name: "涅槃积蓄",
  max: 100,
  start: 0,
  perSecond: 20,
  onAttack: 0,
  onHit: 0,
  castRefund: 0,
  color: "#ff9d7a",
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

export const HAREI_TRICK_ENERGY_PROFILE: EnergyProfile = {
  id: "automatic",
  name: "怪话回能",
  max: 100,
  start: 45,
  perSecond: 20,
  onAttack: 0,
  onHit: 0,
  castRefund: 0,
  color: "#9ee8ff",
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

export const LIAN_FINALE_ENERGY_PROFILE: EnergyProfile = {
  id: "reservoir",
  name: "谢幕蓄势",
  max: 120,
  start: 0,
  perSecond: 6,
  onAttack: 8,
  onHit: 4,
  castRefund: 0,
  color: "#e3b2ff",
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
