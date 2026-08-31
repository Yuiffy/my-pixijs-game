export const DAYS_PER_MONTH = 30;
export const MONTHS_PER_YEAR = 12;
export const DAYS_PER_YEAR = DAYS_PER_MONTH * MONTHS_PER_YEAR;
export const DEFAULT_SCENES_PER_YEAR = 24;

export type LifeRiteKind = "sworn_oath" | "marriage" | "concubinage" | "child";
export type HouseholdPartnerKind = "spouse" | "concubine";
export type WorldProjectKind = "invasion" | "villain_hunt" | "grandmaster_challenge";
export type WorldProjectStatus = "announced" | "active" | "resolved" | "failed";
export type LifeStatus = "active" | "ending_preview";

export interface WuxiaDate {
  eraName: string;
  year: number;
  month: number;
  day: number;
  absoluteDay: number;
}

export interface HouseholdPartner {
  actorId: string;
  name: string;
  kind: HouseholdPartnerKind;
  sinceDay: number;
}

export interface WuxiaChild {
  actorId: string;
  name: string;
  parentActorIds: [string, string];
  birthDay: number;
  homeLocationId: string;
  adopted?: boolean;
}

export interface LifeRiteRecord {
  id: string;
  kind: LifeRiteKind;
  actorIds: string[];
  day: number;
  description: string;
}

export interface HouseholdState {
  swornSiblingActorIds: string[];
  partners: HouseholdPartner[];
  children: WuxiaChild[];
  rites: LifeRiteRecord[];
}

export interface AnnualMilestone {
  year: number;
  age: number;
  endedDay: number;
  scenes: number;
  title: string;
  summary: string;
  highlights: string[];
}

export interface WuxiaLifeState {
  version: 1;
  protagonistId: string;
  generation: number;
  age: number;
  startedDay: number;
  startedYear: number;
  scenesThisYear: number;
  maxScenesPerYear: number;
  status: LifeStatus;
  household: HouseholdState;
  annualMilestones: AnnualMilestone[];
  pendingYearMilestone?: AnnualMilestone;
  chosenEndingId?: string;
}

export interface WorldProjectContribution {
  protagonistId: string;
  actorName: string;
  day: number;
  amount: number;
  description: string;
  success?: boolean;
}

export interface WorldProject {
  id: string;
  kind: WorldProjectKind;
  title: string;
  shortTitle: string;
  description: string;
  locationId: string;
  targetActorId?: string;
  startYear: number;
  status: WorldProjectStatus;
  progress: number;
  goal: number;
  stage: "风声初起" | "群雄会盟" | "战局正急" | "最后一役" | "尘埃落定";
  contributions: WorldProjectContribution[];
  resolvedDay?: number;
  outcome?: string;
}

export interface TournamentRecord {
  opportunityId: string;
  protagonistId?: string;
  title: string;
  year: number;
  result: "旁观" | "止步初轮" | "跻身八强" | "名列三甲" | "夺魁";
  championActorId?: string;
  roundsWon: number;
}

export interface MartialRanking {
  title: string;
  holderActorId?: string;
  holderName?: string;
  sinceYear?: number;
  heroBest: TournamentRecord["result"];
}

export interface ProtagonistArchive {
  id: string;
  actorId: string;
  name: string;
  epithet: string;
  generation: number;
  startedDay: number;
  endedDay: number;
  age: number;
  endingId: string;
  endingTitle: string;
  endingSummary: string;
  foundedSectName?: string;
  partnerActorIds: string[];
  childActorIds: string[];
  importantHistory: Array<{
    turn: number;
    title: string;
    choice: string;
    success: boolean;
  }>;
  knownRelationIds: string[];
}

export interface WorldChronicleState {
  version: 1;
  worldId: string;
  label: string;
  eraName: string;
  projects: WorldProject[];
  tournaments: TournamentRecord[];
  ranking: MartialRanking;
  protagonists: ProtagonistArchive[];
}

export interface LifeEndingDefinition {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  tag: string;
  unlocked: boolean;
  reason: string;
}

const MONTH_NAMES = ["正月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "冬月", "腊月"];
const DAY_NAMES = [
  "初一", "初二", "初三", "初四", "初五", "初六", "初七", "初八", "初九", "初十",
  "十一", "十二", "十三", "十四", "十五", "十六", "十七", "十八", "十九", "二十",
  "廿一", "廿二", "廿三", "廿四", "廿五", "廿六", "廿七", "廿八", "廿九", "三十",
];

const hashText = (value: string) => {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33 + value.charCodeAt(index)) % 2147483647;
  }
  return Math.abs(hash);
};

export const wuxiaDateFromDay = (absoluteDay: number, eraName = "承平") : WuxiaDate => {
  const safeDay = Math.max(1, Math.floor(absoluteDay));
  const dayIndex = safeDay - 1;
  return {
    eraName,
    year: Math.floor(dayIndex / DAYS_PER_YEAR) + 1,
    month: Math.floor((dayIndex % DAYS_PER_YEAR) / DAYS_PER_MONTH) + 1,
    day: (dayIndex % DAYS_PER_MONTH) + 1,
    absoluteDay: safeDay,
  };
};

export const formatWuxiaDate = (date: WuxiaDate) => (
  `${date.eraName}${date.year}年 · ${MONTH_NAMES[date.month - 1]}${DAY_NAMES[date.day - 1]}`
);

export const remainingDaysInYear = (absoluteDay: number) => {
  const dayInYear = (Math.max(1, Math.floor(absoluteDay)) - 1) % DAYS_PER_YEAR;
  return DAYS_PER_YEAR - dayInYear;
};

export const createLifeState = (seed: number, worldDay = 1, generation = 1): WuxiaLifeState => {
  const date = wuxiaDateFromDay(worldDay);
  const startingAge = 18 + (Math.abs(seed) % 5);
  return {
    version: 1,
    protagonistId: `life_${generation}_${hashText(`${seed}:${worldDay}:${generation}`).toString(36)}`,
    generation,
    age: startingAge,
    startedDay: worldDay,
    startedYear: date.year,
    scenesThisYear: 0,
    maxScenesPerYear: DEFAULT_SCENES_PER_YEAR,
    status: "active",
    household: { swornSiblingActorIds: [], partners: [], children: [], rites: [] },
    annualMilestones: [],
  };
};

export const createWorldProjects = (seed: number, actorIds: string[]): WorldProject[] => {
  const targets = actorIds.length ? actorIds : [undefined];
  const target = (offset: number) => targets[(Math.abs(seed) + offset) % targets.length];
  return [
    {
      id: "project_northern_pass",
      kind: "invasion",
      title: "朔关烽火",
      shortTitle: "抵御北境来犯",
      description: "关外部族越过旧界碑，沿边村镇正迁人、运粮、修墙。各派是否驰援，会真的改变这场战事。",
      locationId: "wild_heifeng",
      startYear: 1,
      status: "active",
      progress: 0,
      goal: 100,
      stage: "风声初起",
      contributions: [],
    },
    {
      id: "project_blood_robed_lord",
      kind: "villain_hunt",
      title: "血衣魔踪",
      shortTitle: "追剿血衣楼主",
      description: "数处旧案都指向同一名凶人。只有把行踪、同党和退路一并查清，最后一战才不会只是再杀一个替身。",
      locationId: "wild_heifeng",
      targetActorId: target(3),
      startYear: 1,
      status: "active",
      progress: 0,
      goal: 100,
      stage: "风声初起",
      contributions: [],
    },
    {
      id: "project_hidden_grandmaster",
      kind: "grandmaster_challenge",
      title: "宗师问道",
      shortTitle: "访遍天下高手",
      description: "一位久不出手的宗师重开山门，只认经过实战磨成的招。要见到本人，先得让几位守门人认可你的来意。",
      locationId: "hall_changhe",
      targetActorId: target(6),
      startYear: 2,
      status: "announced",
      progress: 0,
      goal: 100,
      stage: "风声初起",
      contributions: [],
    },
  ];
};

export const createWorldChronicle = (seed: number, heroName: string, actorIds: string[]): WorldChronicleState => ({
  version: 1,
  worldId: `world_${hashText(`${seed}:${heroName}`).toString(36)}`,
  label: `${heroName}初入江湖之世`,
  eraName: "承平",
  projects: createWorldProjects(seed, actorIds),
  tournaments: [],
  ranking: { title: "天下第一", heroBest: "旁观" },
  protagonists: [],
});

export const projectStageFor = (progress: number, status: WorldProjectStatus): WorldProject["stage"] => {
  if (status === "resolved" || status === "failed") return "尘埃落定";
  if (progress >= 78) return "最后一役";
  if (progress >= 48) return "战局正急";
  if (progress >= 20) return "群雄会盟";
  return "风声初起";
};

export const projectStageDescription = (project: WorldProject) => {
  if (project.status === "resolved") return project.outcome || "此事已经写入江湖年鉴。";
  if (project.status === "failed") return project.outcome || "此事留下了无人愿意轻提的败局。";
  if (project.stage === "最后一役") return "线索、人物与兵势都已逼近最后一役。";
  if (project.stage === "战局正急") return "局势已不能只靠传闻判断，真正的胜负正在发生。";
  if (project.stage === "群雄会盟") return "愿意出手的人开始聚到一处，各自的盘算也逐渐显露。";
  return project.status === "announced" ? "消息已经传开，尚未到必须动身的时候。" : "风声初起，仍来得及决定是否介入。";
};

export const tournamentResultFor = (roundsWon: number, wonTitle = false): TournamentRecord["result"] => {
  if (wonTitle) return "夺魁";
  if (roundsWon >= 2) return "名列三甲";
  if (roundsWon >= 1) return "跻身八强";
  return "止步初轮";
};

export const lifeEndingDefinitions = (input: {
  turn: number;
  age: number;
  partnerCount: number;
  childCount: number;
  foundedSectName?: string;
  rankingHolderActorId?: string;
  resolvedProjects: WorldProject[];
}): LifeEndingDefinition[] => {
  const invasion = input.resolvedProjects.find((project) => project.kind === "invasion");
  const villain = input.resolvedProjects.find((project) => project.kind === "villain_hunt");
  return [
    {
      id: "wandering_volume",
      title: "路仍在人间",
      subtitle: "只收住这一段行路，不替余生关门",
      description: "把已经发生的关系、招式与选择写成本卷结语。以后仍可回来继续游历。",
      tag: "行旅未尽",
      unlocked: input.turn >= 3,
      reason: input.turn >= 3 ? "已有足够经历可写成一卷" : "至少走过三幕，才有一段可收束的行路",
    },
    {
      id: "together_retirement",
      title: "携手归隐",
      subtitle: "从此有人与你共看山河",
      description: "与已有名分的伴侣一同离开纷争，把关系真正带进结局。",
      tag: "白首有约",
      unlocked: input.partnerCount > 0,
      reason: input.partnerCount > 0 ? "家门中已有愿意同行的人" : "尚未与任何人结下婚约",
    },
    {
      id: "family_legacy",
      title: "门庭相续",
      subtitle: "旧人的路，后来者可以接着走",
      description: "以儿女与家门为这一生落款；下一位主角仍能在同一江湖遇见你们。",
      tag: "薪火相传",
      unlocked: input.childCount > 0,
      reason: input.childCount > 0 ? "家中已有下一代" : "尚无子女可承接家门",
    },
    {
      id: "sect_ancestor",
      title: "开山祖师",
      subtitle: input.foundedSectName ? `${input.foundedSectName}从此有了第一代门人` : "让自己的武学成为别人的来处",
      description: "以自创武学和真实追随者开宗，把门派作为永久世界事实留下。",
      tag: "开宗立派",
      unlocked: Boolean(input.foundedSectName),
      reason: input.foundedSectName ? `已经创立${input.foundedSectName}` : "尚未完成开宗立派",
    },
    {
      id: "world_number_one",
      title: "天下第一",
      subtitle: "群雄见证之后，名字才配得上这四个字",
      description: "以正式大会的逐轮胜绩封卷；后来者仍可向这位旧主角挑战。",
      tag: "武极天下",
      unlocked: input.rankingHolderActorId === "hero",
      reason: input.rankingHolderActorId === "hero" ? "当前正是天下第一的持有人" : "尚未在天下第一武道会夺魁",
    },
    {
      id: "guardian_of_realm",
      title: "山河有守",
      subtitle: "烽火退去，守住的人仍留在世间",
      description: "以抵御外患的长期功业落款，参与者和受益之地都会留在年鉴里。",
      tag: "护国大侠",
      unlocked: Boolean(invasion),
      reason: invasion ? "朔关烽火已经平定" : "边关大事尚未有定局",
    },
    {
      id: "villain_slayer",
      title: "魔踪尽处",
      subtitle: "不是杀掉一个名字，而是斩断它留下的网",
      description: "完成追踪、会盟与最后一战，让这桩江湖大患真正有结论。",
      tag: "诛魔功成",
      unlocked: Boolean(villain),
      reason: villain ? "血衣魔踪已经查清并了结" : "魔头与其余党尚未伏诛",
    },
    {
      id: "elder_retirement",
      title: "一代名宿",
      subtitle: "刀剑未必钝，江湖却已学会听你一句话",
      description: "在漫长生涯后退居一方，作为可被后来者拜访的旧人物继续存在。",
      tag: "江湖名宿",
      unlocked: input.age >= 45,
      reason: input.age >= 45 ? "这一生已经走过足够长的岁月" : "年岁尚轻，名宿之称还在很远以后",
    },
  ];
};
