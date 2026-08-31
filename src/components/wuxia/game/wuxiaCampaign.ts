import type { WorldLocation } from "./worldSimulation";
import { formatWuxiaDate, wuxiaDateFromDay } from "./wuxiaLife";

export type CampaignPhase = "choose_agenda" | "planning" | "scene" | "outcome" | "chapter_break" | "year_break" | "ending";
export type AgendaTone = "steel" | "jade" | "gold" | "ink" | "ember";
export type PlayerIntent = "befriend" | "romance" | "revenge" | "learn" | "observe";
export type LeadStatus = "active" | "paused" | "resolved" | "expired";
export type OpportunityStatus = "announced" | "open" | "attended" | "resolved" | "missed";
export type OpportunityActivityStage = "prepare" | "attend";
export type ActivityKind = "train" | "bond" | "travel" | "pursue" | "opportunity" | "investigate" | "rest" | "invent" | "found_sect" | "free_event" | "rite" | "world_project";

export interface PlayerAgendaDefinition {
  id: string;
  originIds: Array<"sect_disciple" | "wanderer" | "escort_guard">;
  title: string;
  subtitle: string;
  description: string;
  primaryVerb: string;
  tone: AgendaTone;
  favoredActivityKinds: ActivityKind[];
  sourcePackId: string;
}

export interface PlayerAgenda {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  primaryVerb: string;
  tone: AgendaTone;
  favoredActivityKinds: ActivityKind[];
  startedTurn: number;
  progress: number;
  completedSteps: number;
  targetLeadId?: string;
  targetActorId?: string;
  intent?: PlayerIntent;
}

export interface CampaignLead {
  id: string;
  kind: "person" | "rumor" | "manual" | "opportunity" | "faction";
  title: string;
  summary: string;
  source: string;
  status: LeadStatus;
  progress: number;
  discoveredTurn: number;
  discoveredDay: number;
  targetActorId?: string;
  targetManualId?: string;
  targetLocationId?: string;
  opportunityId?: string;
  intent?: PlayerIntent;
  deadlineDay?: number;
}

export interface WorldOpportunityTemplate {
  id: string;
  title: string;
  shortTitle: string;
  type: "matchmaking_tournament" | "martial_assembly" | "secret_realm" | "faction_gathering";
  description: string;
  locationId: string;
  startDay: number;
  startDaySpread: number;
  durationDays: number;
  repeatEveryYears?: number;
  tournamentRounds?: number;
  organizer: string;
  rewardHint: string;
  risk: "低" | "中" | "高";
  sourcePackId: string;
}

export interface WorldOpportunity {
  id: string;
  templateId: string;
  title: string;
  shortTitle: string;
  type: WorldOpportunityTemplate["type"];
  description: string;
  locationId: string;
  startDay: number;
  endDay: number;
  organizer: string;
  rewardHint: string;
  risk: "低" | "中" | "高";
  status: OpportunityStatus;
  participantActorIds: string[];
  sourcePackId: string;
  year: number;
  cycle: number;
  roundsWon?: number;
  roundsRequired?: number;
  eliminated?: boolean;
  championActorId?: string;
}

export interface PlayerActivityDefinition {
  id: string;
  kind: ActivityKind;
  title: string;
  description: string;
  tone: AgendaTone;
  sourcePackId: string;
}

export interface PlayerActivity {
  id: string;
  definitionId: string;
  kind: ActivityKind;
  title: string;
  description: string;
  tone: AgendaTone;
  risk: "低" | "中" | "高";
  durationDays: number;
  targetLocationId: string;
  preview: string[];
  enabled: boolean;
  unavailableReason?: string;
  targetActorId?: string;
  targetManualId?: string;
  leadId?: string;
  opportunityId?: string;
  opportunityStage?: OpportunityActivityStage;
  riteKind?: "sworn_oath" | "marriage" | "concubinage" | "child";
  projectId?: string;
  sourcePackId: string;
}

export interface FactionEncounterRecord {
  turn: number;
  opponentActorId: string;
  opponentName: string;
  context: "切磋" | "公开比试" | "敌对冲突";
  result: "胜" | "负";
  techniqueIds: string[];
  favorDelta: number;
  pressureDelta: number;
  consequence: string;
}

export interface FactionKnowledge {
  factionId: string;
  factionName: string;
  confidence: number;
  recognizedTechniqueIds: string[];
  evidence: string[];
  firstRecognizedTurn?: number;
  lastUpdatedTurn: number;
  encounters?: FactionEncounterRecord[];
}

export interface AuthoredTechnique {
  id: string;
  name: string;
  description: string;
  createdTurn: number;
  inspirationTechniqueIds: string[];
}

export interface FoundedSect {
  id: string;
  name: string;
  creed: string;
  foundedTurn: number;
  headquartersLocationId: string;
  founderTechniqueId: string;
}

export interface LegacyState {
  martialInsights: number;
  reputation: number;
  followers: number;
  followerActorIds: string[];
  authoredTechniques: AuthoredTechnique[];
  foundedSect?: FoundedSect;
}

export interface ChapterMilestone {
  chapter: number;
  title: string;
  epigraph: string;
  summary: string;
  achievements: string[];
  unresolvedLeadIds: string[];
  worldDay: number;
}

export interface WuxiaCampaignState {
  version: 1;
  phase: CampaignPhase;
  chapterLength: number;
  agenda?: PlayerAgenda;
  leads: CampaignLead[];
  opportunities: WorldOpportunity[];
  availableActivities: PlayerActivity[];
  factionKnowledge: Record<string, FactionKnowledge>;
  legacy: LegacyState;
  chapterMilestone?: ChapterMilestone;
  selectedActivityId?: string;
  installedPackIds: string[];
}

export interface CampaignCharacterDefinition {
  id: string;
  name: string;
  sourceName: string;
  title: string;
  role: string;
  desire: string;
  fear: string;
  signatureMove: string;
  signatureDescription: string;
  portrait: string;
  traits: string[];
  romanceable: boolean;
  factionId: string;
  homeLocationId: "hero_home" | string;
  routineLocationIds: string[];
  originIds?: Array<"sect_disciple" | "wanderer" | "escort_guard">;
  sourcePackId: string;
}

export interface CampaignRules {
  chapterLength: number;
  maxVisibleActivities: number;
  maxActiveLeads: number;
  inventTechnique: {
    martialMastery: number;
    martialInsights: number;
    fame: number;
  };
  foundSect: {
    fame: number;
    followers: number;
    authoredTechniques: number;
  };
}

export type CampaignRuleOverrides = Omit<Partial<CampaignRules>, "inventTechnique" | "foundSect"> & {
  inventTechnique?: Partial<CampaignRules["inventTechnique"]>;
  foundSect?: Partial<CampaignRules["foundSect"]>;
};

export interface WuxiaContentPack {
  id: string;
  version: string;
  label: string;
  agendas?: PlayerAgendaDefinition[];
  activities?: PlayerActivityDefinition[];
  opportunities?: WorldOpportunityTemplate[];
  characters?: CampaignCharacterDefinition[];
  locations?: WorldLocation[];
  rules?: CampaignRuleOverrides;
}

export interface WuxiaContentRegistry {
  packs: Array<Pick<WuxiaContentPack, "id" | "version" | "label">>;
  agendas: PlayerAgendaDefinition[];
  activities: PlayerActivityDefinition[];
  opportunities: WorldOpportunityTemplate[];
  characters: CampaignCharacterDefinition[];
  locations: WorldLocation[];
  rules: CampaignRules;
}

const CAMPAIGN_RULES: CampaignRules = {
  chapterLength: 3,
  maxVisibleActivities: 8,
  maxActiveLeads: 8,
  inventTechnique: { martialMastery: 52, martialInsights: 3, fame: 34 },
  foundSect: { fame: 52, followers: 2, authoredTechniques: 1 },
};

const BUILTIN_AGENDAS: PlayerAgendaDefinition[] = [
  {
    id: "sect_mastery",
    originIds: ["sect_disciple"],
    title: "守山修艺",
    subtitle: "先把本门功夫练成自己的东西",
    description: "留在山门打牢根基，向同门讨教，在实战中验证每一式；功夫成熟后可推演自己的招法。",
    primaryVerb: "修习本门招式",
    tone: "steel",
    favoredActivityKinds: ["train", "investigate", "invent"],
    sourcePackId: "core.campaign",
  },
  {
    id: "sect_bonds",
    originIds: ["sect_disciple"],
    title: "同门相知",
    subtitle: "把朝夕相处的人真正放进自己的江湖",
    description: "与师姐师妹同练、谈心、分担差事；关系可以成为知己、情愫，也可能因选择留下裂痕。",
    primaryVerb: "经营同门关系",
    tone: "jade",
    favoredActivityKinds: ["bond", "pursue", "investigate"],
    sourcePackId: "core.campaign",
  },
  {
    id: "sect_wander",
    originIds: ["sect_disciple"],
    title: "请剑下山",
    subtitle: "让山门所学经得起人间的路",
    description: "主动选择去处，追人物、赶大会、寻奇遇；师门仍是来处，却不替你决定下一站。",
    primaryVerb: "下山历练",
    tone: "gold",
    favoredActivityKinds: ["travel", "opportunity", "pursue"],
    sourcePackId: "core.campaign",
  },
  {
    id: "wander_hundred_arts",
    originIds: ["wanderer"],
    title: "百家问招",
    subtitle: "从每一次相逢里学会新的理解",
    description: "寻访使招之人、追查秘籍来路，再把旁学之招化成自己的武学。",
    primaryVerb: "访人问招",
    tone: "steel",
    favoredActivityKinds: ["pursue", "train", "invent"],
    sourcePackId: "core.campaign",
  },
  {
    id: "wander_people",
    originIds: ["wanderer"],
    title: "结伴人间",
    subtitle: "先认识人，再决定为谁停步",
    description: "追寻听说过的人，也允许爱慕、结交、讨教或结怨成为长期目标。",
    primaryVerb: "追寻人物关系",
    tone: "jade",
    favoredActivityKinds: ["bond", "pursue", "travel"],
    sourcePackId: "core.campaign",
  },
  {
    id: "wander_chance",
    originIds: ["wanderer"],
    title: "逐浪寻奇",
    subtitle: "哪里有热闹和传闻，哪里就是下一程",
    description: "追逐限时奇遇、武会与地方传闻；错过也会成为江湖事实，而不是游戏失败。",
    primaryVerb: "追寻江湖机会",
    tone: "gold",
    favoredActivityKinds: ["opportunity", "travel", "free_event"],
    sourcePackId: "core.campaign",
  },
  {
    id: "escort_oath",
    originIds: ["escort_guard"],
    title: "守诺行镖",
    subtitle: "把每一趟托付送到具体的人手里",
    description: "优先护送、查路与兑现承诺，在沿途建立可依靠的名声和关系。",
    primaryVerb: "守住托付",
    tone: "steel",
    favoredActivityKinds: ["travel", "investigate", "pursue"],
    sourcePackId: "core.campaign",
  },
  {
    id: "escort_bonds",
    originIds: ["escort_guard"],
    title: "广结同路",
    subtitle: "镖路不是一张图，是一群愿意开门的人",
    description: "拜访旧识、经营人情，也允许一段同行关系慢慢长成爱慕或恩怨。",
    primaryVerb: "经营沿路人情",
    tone: "jade",
    favoredActivityKinds: ["bond", "pursue", "travel"],
    sourcePackId: "core.campaign",
  },
  {
    id: "escort_freedom",
    originIds: ["escort_guard"],
    title: "卸旗远游",
    subtitle: "暂把镖旗留在门楼，走一条自己选的路",
    description: "主动参加武会、寻访秘境或追查人物，不再只沿别人交付的路线赶路。",
    primaryVerb: "自选下一程",
    tone: "gold",
    favoredActivityKinds: ["opportunity", "travel", "free_event"],
    sourcePackId: "core.campaign",
  },
];

const BUILTIN_ACTIVITIES: PlayerActivityDefinition[] = [
  { id: "core.train", kind: "train", title: "修习本门武学", description: "选一式反复拆练，让招式成长来自具体练习。", tone: "steel", sourcePackId: "core.campaign" },
  { id: "core.bond", kind: "bond", title: "拜访一位相识", description: "依当前心意结交、倾慕、讨教或清算旧怨。", tone: "jade", sourcePackId: "core.campaign" },
  { id: "core.travel", kind: "travel", title: "动身去一个地方", description: "沿真实道路赶路，沿途人物也会继续移动。", tone: "gold", sourcePackId: "core.campaign" },
  { id: "core.pursue", kind: "pursue", title: "循线追寻某人", description: "把听说过的人设为目标，不必等导演安排偶遇。", tone: "ember", sourcePackId: "core.campaign" },
  { id: "core.opportunity", kind: "opportunity", title: "赶赴江湖盛事", description: "在明确地点和期限内参加武会、招亲或秘境。", tone: "gold", sourcePackId: "core.campaign" },
  { id: "core.investigate", kind: "investigate", title: "查一条具体线索", description: "追查现有传闻、人物行踪或秘籍来路。", tone: "ink", sourcePackId: "core.campaign" },
  { id: "core.rest", kind: "rest", title: "停一日养伤", description: "恢复气血；世界不会因你休息而停住。", tone: "jade", sourcePackId: "core.campaign" },
  { id: "core.invent", kind: "invent", title: "推演自创招式", description: "把已掌握的不同劲路熔成一式，留下自己的武学。", tone: "ember", sourcePackId: "core.campaign" },
  { id: "core.found_sect", kind: "found_sect", title: "择地开宗立派", description: "以名望、追随者和自创武学建立新的门派。", tone: "gold", sourcePackId: "core.campaign" },
  { id: "core.rite", kind: "rite", title: "把关系写进家门", description: "结义、婚配与添丁都要由当事人亲自作答。", tone: "jade", sourcePackId: "core.campaign" },
  { id: "core.world_project", kind: "world_project", title: "介入天下大事", description: "追凶、守关与问鼎宗师都要经过数段真实行动。", tone: "ember", sourcePackId: "core.campaign" },
  { id: "core.free_event", kind: "free_event", title: "随处看看今日风声", description: "暂不追长期目标，让世界事实自己浮出一幕。", tone: "ink", sourcePackId: "core.campaign" },
];

const BUILTIN_OPPORTUNITIES: WorldOpportunityTemplate[] = [
  {
    id: "luoyang_matchmaking",
    title: "洛阳沈氏比武招亲",
    shortTitle: "比武招亲",
    type: "matchmaking_tournament",
    description: "沈氏在朱雀街搭起擂台。上台不是自动成亲，胜者只获得与主家当面谈条件的资格。",
    locationId: "city_luoyang",
    startDay: 2,
    startDaySpread: 2,
    durationDays: 6,
    repeatEveryYears: 1,
    organizer: "洛阳沈氏",
    rewardHint: "人物关系、名望、公开约战",
    risk: "高",
    sourcePackId: "core.campaign",
  },
  {
    id: "hundred_arts_assembly",
    title: "百艺天下论武会",
    shortTitle: "天下论武会",
    type: "martial_assembly",
    description: "各派在百艺会馆公开演武、辨招和定约。观众会记住你使过什么，也会追问招式来路。",
    locationId: "hall_changhe",
    startDay: 5,
    startDaySpread: 3,
    durationDays: 9,
    repeatEveryYears: 1,
    tournamentRounds: 3,
    organizer: "百艺会馆",
    rewardHint: "门派见识、名望、自创武学灵感",
    risk: "中",
    sourcePackId: "core.campaign",
  },
  {
    id: "bailu_secret_realm",
    title: "白露崖石窟开门",
    shortTitle: "白露崖奇遇",
    type: "secret_realm",
    description: "暴雨冲开白露村后的旧石门，村民只许来客在塌方前进出一次。石窟会关闭，但不会等玩家。",
    locationId: "village_bailu",
    startDay: 3,
    startDaySpread: 3,
    durationDays: 5,
    repeatEveryYears: 2,
    organizer: "白露村耆老",
    rewardHint: "秘籍线索、机缘、地方人情",
    risk: "高",
    sourcePackId: "core.campaign",
  },
  {
    id: "sixi_joint_practice",
    title: "四禧庄月下合练",
    shortTitle: "月下合练",
    type: "faction_gathering",
    description: "四禧庄开放外院一夜，让不同门派两两拆招。这里更适合结识人，也更容易看清招式所属。",
    locationId: "manor_sixi",
    startDay: 1,
    startDaySpread: 3,
    durationDays: 4,
    repeatEveryYears: 1,
    organizer: "四禧庄",
    rewardHint: "人物关系、门派见识、观摩招式",
    risk: "低",
    sourcePackId: "core.campaign",
  },
  {
    id: "huashan_sword_summit",
    title: "华山论剑",
    shortTitle: "华山论剑",
    type: "martial_assembly",
    description: "群雄在华山旧台逐轮问剑。三场皆胜方可题名石壁，上一届胜者也会作为真实守擂人留下。",
    locationId: "wild_heifeng",
    startDay: 108,
    startDaySpread: 8,
    durationDays: 32,
    repeatEveryYears: 3,
    tournamentRounds: 3,
    organizer: "华山论剑帖主",
    rewardHint: "逐轮名次、武学见识、江湖声望",
    risk: "高",
    sourcePackId: "core.campaign",
  },
  {
    id: "world_first_championship",
    title: "天下第一武道会",
    shortTitle: "天下第一武道会",
    type: "martial_assembly",
    description: "各派公开推举高手逐轮争胜。夺魁者持有“天下第一”之名，直到后来者在下一届堂堂正正取走。",
    locationId: "hall_changhe",
    startDay: 248,
    startDaySpread: 10,
    durationDays: 38,
    repeatEveryYears: 1,
    tournamentRounds: 3,
    organizer: "百派公议盟",
    rewardHint: "天下排名、守擂资格、各派见证",
    risk: "高",
    sourcePackId: "core.campaign",
  },
];

const BUILTIN_CHARACTERS: CampaignCharacterDefinition[] = [
  {
    id: "home_yan_qiwu",
    name: "燕栖梧",
    sourceName: "原创同门角色",
    title: "大师姐",
    role: "代师授课的首徒，守规矩却不替旁人决定去留",
    desire: "把师门最难的一式教会真正愿意承担其代价的人",
    fear: "有朝一日只剩门规，没有任何人记得为何守它",
    signatureMove: "松间回剑",
    signatureDescription: "先以半式引开来锋，再贴着松针落下的方向收剑；看似退让，实则把下一步留给同伴。",
    portrait: "/images/autochess/portraits/sui.png",
    traits: ["沉稳", "护短", "剑术"],
    romanceable: true,
    factionId: "home",
    homeLocationId: "hero_home",
    routineLocationIds: ["hero_home", "hall_changhe", "city_luoyang"],
    originIds: ["sect_disciple"],
    sourcePackId: "core.campaign",
  },
  {
    id: "home_jiang_xiaoman",
    name: "江小满",
    sourceName: "原创同门角色",
    title: "小师妹",
    role: "负责药圃与山门传信的年轻弟子，最熟悉每条下山小路",
    desire: "亲自走完山外十二处驿路，而不是永远替别人送到山门",
    fear: "所有人都把她当需要照顾的师妹，从未认真听她想去哪里",
    signatureMove: "点露穿林",
    signatureDescription: "脚尖借湿叶换向，指上剑诀连点三处空门；招不求重，只求让对方跟不上她选的路。",
    portrait: "/images/autochess/portraits/dawn_duelist.png",
    traits: ["敏锐", "好奇", "轻功"],
    romanceable: true,
    factionId: "home",
    homeLocationId: "hero_home",
    routineLocationIds: ["hero_home", "city_luoyang", "village_bailu"],
    originIds: ["sect_disciple"],
    sourcePackId: "core.campaign",
  },
];

export const BUILTIN_WUXIA_CONTENT_PACK: WuxiaContentPack = {
  id: "core.campaign",
  version: "1.0.0",
  label: "江湖志主动生涯核心包",
  agendas: BUILTIN_AGENDAS,
  activities: BUILTIN_ACTIVITIES,
  opportunities: BUILTIN_OPPORTUNITIES,
  characters: BUILTIN_CHARACTERS,
  locations: [],
  rules: CAMPAIGN_RULES,
};

const assertUniqueIds = (label: string, entries: Array<{ id: string }>) => {
  const ids = new Set<string>();
  entries.forEach((entry) => {
    if (ids.has(entry.id)) throw new Error(`武侠内容包 ${label} 出现重复 id: ${entry.id}`);
    ids.add(entry.id);
  });
};

export const createWuxiaContentRegistry = (extraPacks: WuxiaContentPack[] = []): WuxiaContentRegistry => {
  const packs = [BUILTIN_WUXIA_CONTENT_PACK, ...extraPacks];
  assertUniqueIds("pack", packs);
  const agendas = packs.flatMap((pack) => pack.agendas || []);
  const activities = packs.flatMap((pack) => pack.activities || []);
  const opportunities = packs.flatMap((pack) => pack.opportunities || []);
  const characters = packs.flatMap((pack) => pack.characters || []);
  const locations = packs.flatMap((pack) => pack.locations || []);
  assertUniqueIds("agenda", agendas);
  assertUniqueIds("activity", activities);
  assertUniqueIds("opportunity", opportunities);
  assertUniqueIds("character", characters);
  assertUniqueIds("location", locations);
  const rules = packs.reduce<CampaignRules>((current, pack) => ({
    ...current,
    ...pack.rules,
    inventTechnique: { ...current.inventTechnique, ...pack.rules?.inventTechnique },
    foundSect: { ...current.foundSect, ...pack.rules?.foundSect },
  }), CAMPAIGN_RULES);
  return {
    packs: packs.map(({ id, version, label }) => ({ id, version, label })),
    agendas,
    activities,
    opportunities,
    characters,
    locations,
    rules,
  };
};

const stableOffset = (seed: number, id: string, spread: number) => {
  if (spread <= 0) return 0;
  let hash = Math.abs(seed) % 4294967291;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash + id.charCodeAt(index) * 16777619 + index * 101) % 4294967291;
  }
  return hash % spread;
};

export const instantiateWorldOpportunities = (
  registry: WuxiaContentRegistry,
  seed: number,
  participantActorIds: string[],
  year = 1,
): WorldOpportunity[] => registry.opportunities
  .filter((template) => (year - 1) % Math.max(1, template.repeatEveryYears || 1) === 0)
  .map((template, index) => {
  const cycle = Math.floor((year - 1) / Math.max(1, template.repeatEveryYears || 1)) + 1;
  const startDay = (year - 1) * 360 + template.startDay + stableOffset(seed + year * 97, template.id, template.startDaySpread);
  const rotatedParticipants = participantActorIds.length
    ? participantActorIds.map((_, participantIndex) => participantActorIds[(participantIndex + index + year - 1) % participantActorIds.length]).slice(0, 3)
    : [];
  return {
    id: year === 1 ? `opportunity_${template.id}` : `opportunity_${template.id}_y${year}`,
    templateId: template.id,
    title: template.title,
    shortTitle: template.shortTitle,
    type: template.type,
    description: template.description,
    locationId: template.locationId,
    startDay,
    endDay: startDay + template.durationDays,
    organizer: template.organizer,
    rewardHint: template.rewardHint,
    risk: template.risk,
    status: startDay <= 1 ? "open" : "announced",
    participantActorIds: rotatedParticipants,
    sourcePackId: template.sourcePackId,
    year,
    cycle,
    ...(template.tournamentRounds ? { roundsWon: 0, roundsRequired: template.tournamentRounds } : {}),
  };
});

export const ensureWorldOpportunities = (
  registry: WuxiaContentRegistry,
  seed: number,
  participantActorIds: string[],
  opportunities: WorldOpportunity[],
  throughYear: number,
) => {
  const next = [...opportunities];
  for (let year = 1; year <= throughYear; year += 1) {
    instantiateWorldOpportunities(registry, seed, participantActorIds, year).forEach((opportunity) => {
      if (!next.some((entry) => entry.id === opportunity.id)) next.push(opportunity);
    });
  }
  return next.sort((left, right) => left.startDay - right.startDay || left.id.localeCompare(right.id));
};

export const refreshOpportunityStatuses = (opportunities: WorldOpportunity[], day: number) => opportunities.map((opportunity) => {
  if (["attended", "resolved"].includes(opportunity.status)) return opportunity;
  if (day > opportunity.endDay) return { ...opportunity, status: "missed" as const };
  if (day >= opportunity.startDay) return { ...opportunity, status: "open" as const };
  return { ...opportunity, status: "announced" as const };
});

export const createInitialCampaign = (input: {
  seed: number;
  origin: "sect_disciple" | "wanderer" | "escort_guard";
  participantActorIds: string[];
  registry: WuxiaContentRegistry;
}): WuxiaCampaignState => {
  const opportunities = instantiateWorldOpportunities(input.registry, input.seed, input.participantActorIds);
  return {
    version: 1,
    phase: "choose_agenda",
    chapterLength: input.registry.rules.chapterLength,
    leads: opportunities.map((opportunity): CampaignLead => ({
      id: `lead_${opportunity.id}`,
      kind: "opportunity",
      title: opportunity.title,
      summary: `${opportunity.description}${formatWuxiaDate(wuxiaDateFromDay(opportunity.startDay))}至${formatWuxiaDate(wuxiaDateFromDay(opportunity.endDay))}之间开放。`,
      source: `${opportunity.organizer}公开传出的消息`,
      status: "paused",
      progress: 0,
      discoveredTurn: 0,
      discoveredDay: 0,
      targetLocationId: opportunity.locationId,
      opportunityId: opportunity.id,
      deadlineDay: opportunity.endDay,
    })),
    opportunities,
    availableActivities: [],
    factionKnowledge: {
      home: {
        factionId: "home",
        factionName: "本门",
        confidence: 100,
        recognizedTechniqueIds: [],
      evidence: ["你自幼学习本门的吐纳、步法与出手规矩。"],
      lastUpdatedTurn: 0,
      encounters: [],
    },
    },
    legacy: { martialInsights: 0, reputation: 0, followers: 0, followerActorIds: [], authoredTechniques: [] },
    installedPackIds: input.registry.packs.map((pack) => pack.id),
  };
};

export const agendaDefinitionsForOrigin = (
  registry: WuxiaContentRegistry,
  origin: "sect_disciple" | "wanderer" | "escort_guard",
) => registry.agendas.filter((agenda) => agenda.originIds.includes(origin));

export const playerAgendaFromDefinition = (definition: PlayerAgendaDefinition, turn: number): PlayerAgenda => ({
  id: definition.id,
  title: definition.title,
  subtitle: definition.subtitle,
  description: definition.description,
  primaryVerb: definition.primaryVerb,
  tone: definition.tone,
  favoredActivityKinds: [...definition.favoredActivityKinds],
  startedTurn: turn,
  progress: 0,
  completedSteps: 0,
});

export const intentLabel: Record<PlayerIntent, string> = {
  befriend: "结交",
  romance: "倾心",
  revenge: "复仇",
  learn: "讨教",
  observe: "留意",
};
