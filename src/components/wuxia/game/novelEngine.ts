import { SECTS_DATA } from "../logic/constants";
import {
  createNarrativeArchitecture,
  storyChapterFor,
  updateFaction,
  updateRelationship,
  type FactionState,
  type MartialTechnique,
  type NarrativeArchitecture,
  type SceneManuscript,
  type StoryCharacter,
} from "./storyArchitecture";
import {
  actorAtLocation,
  advanceWorldToScene,
  applyWorldChoice,
  createWorldSimulation,
  findWorldPath,
  focusActorsForEvent,
  knownRelations,
  worldDistance,
  type MartialTechniqueDef,
  type WorldActor,
  type WorldLocation,
  type WorldMartialArt,
  type WorldRelation,
  type WuxiaWorldState,
} from "./worldSimulation";
import {
  isWuxiaCombatChoice,
  simulateWuxiaCombat,
  type WuxiaCombatResult,
} from "./wuxiaCombat";
import { WUXIA_FACTIONS, wuxiaRosterForSeed } from "./wuxiaRoster";
import {
  agendaDefinitionsForOrigin,
  createInitialCampaign,
  createWuxiaContentRegistry,
  ensureWorldOpportunities,
  intentLabel,
  playerAgendaFromDefinition,
  refreshOpportunityStatuses,
  type CampaignCharacterDefinition,
  type CampaignLead,
  type ChapterMilestone,
  type PlayerActivity,
  type PlayerIntent,
  type WorldOpportunity,
  type WuxiaCampaignState,
  type WuxiaContentPack,
  type WuxiaContentRegistry,
} from "./wuxiaCampaign";
import {
  DAYS_PER_YEAR,
  createLifeState,
  createWorldChronicle,
  formatWuxiaDate,
  lifeEndingDefinitions,
  projectStageFor,
  remainingDaysInYear,
  tournamentResultFor,
  wuxiaDateFromDay,
  type AnnualMilestone,
  type LifeEndingDefinition,
  type LifeRiteKind,
  type TournamentRecord,
  type WorldChronicleState,
  type WorldProject,
  type WuxiaLifeState,
} from "./wuxiaLife";

export type {
  ChapterManuscript,
  FactionState,
  MartialLineage,
  MartialTechnique,
  NarrativeArchitecture,
  SceneManuscript,
  StoryBible,
  StoryCharacter,
  StoryThread,
} from "./storyArchitecture";

export type OriginId = "sect_disciple" | "wanderer" | "escort_guard";
export type AmbitionId = "revenge" | "truth" | "protect" | "freedom";
export type StatKey = "martial" | "insight" | "chivalry" | "fame" | "fortune";
export type EventMood = "mist" | "market" | "storm" | "moon" | "ember";

export interface NovelSetup {
  heroName: string;
  origin: OriginId;
  ambition: AmbitionId;
  sectId: string;
  seed: string;
}

export interface NovelStats {
  martial: number;
  insight: number;
  chivalry: number;
  fame: number;
  fortune: number;
}

export interface NovelHero {
  name: string;
  origin: OriginId;
  ambition: AmbitionId;
  sectId: string;
  sectName: string;
  epithet: string;
  art: string;
  health: number;
  maxHealth: number;
  silver: number;
  clues: number;
  heat: number;
  level: number;
  stats: NovelStats;
  inventory: string[];
}

export interface NovelCompanion {
  id: string;
  characterId?: StoryCharacter["id"];
  name: string;
  title: string;
  trait: string;
  affinity: number;
  portrait: string;
  joinedTurn: number;
}

export type NovelLocation = WorldLocation;

export interface NovelLine {
  id: string;
  type: "narrative" | "dialogue" | "action" | "inner" | "system";
  text: string;
  speaker?: string;
}

export interface EffectPreview {
  label: string;
  value: string;
  tone: "good" | "bad" | "neutral";
}

export interface OutcomeChange {
  label: string;
  value: string;
  tone: EffectPreview["tone"];
}

export interface TurnOutcome {
  turn: number;
  eventId: string;
  eventTitle: string;
  choiceId: string;
  choiceLabel: string;
  success: boolean;
  check?: {
    label: string;
    odds: number;
    roll: number;
    method: "roll" | "combat";
  };
  lines: NovelLine[];
  changes: OutcomeChange[];
  revealTitle: string;
  revealLead: string;
  resultParagraphs: string[];
  consequence: string;
  discovery?: string;
  combat?: WuxiaCombatResult;
  scene: SceneManuscript;
}

export interface ChoiceOutcome {
  lines: NovelLine[];
  effects: EffectSpec;
}

export interface ChoiceCheck {
  stat: StatKey;
  label: string;
  difficulty: number;
  odds: number;
}

export interface NovelChoice {
  id: string;
  label: string;
  description: string;
  tone: "steel" | "jade" | "gold" | "ink" | "ember";
  risk: "低" | "中" | "高";
  preview: EffectPreview[];
  check?: ChoiceCheck;
  success: ChoiceOutcome;
  failure?: ChoiceOutcome;
}

export interface NovelEvent {
  id: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  locationId: string;
  locationName: string;
  mood: EventMood;
  lines: NovelLine[];
  choices: NovelChoice[];
}

export interface StoryLogEntry {
  id: string;
  turn: number;
  kind: "chapter" | "scene" | "choice" | "outcome";
  title?: string;
  text: string;
  tone?: "muted" | "warm" | "danger" | "bright";
}

export interface NovelHistoryEntry {
  turn: number;
  eventId: string;
  title: string;
  choiceId: string;
  choice: string;
  success: boolean;
}

export interface NovelEnding {
  title: string;
  subtitle: string;
  summary: string;
  rank: string;
  score: number;
  tags: string[];
  epilogue: string[];
}

export interface EventCandidateScore {
  eventId: string;
  targetLocationId: string;
  kind?: "character" | "relationship" | "location" | "fallout" | "manual" | "recovery";
  archetype?: string;
  score: number;
  travelDays: number;
  focusTravelDays: number;
  relationPressure: number;
  deadlinePressure: number;
  reasons: string[];
}

export interface EventDirectorDecision {
  turn: number;
  selectedEventId: string;
  selectedCandidateEventId?: string;
  targetLocationId: string;
  candidates: EventCandidateScore[];
}

export interface NovelState {
  version: 7;
  setup: NovelSetup;
  seed: number;
  rngState: number;
  turn: number;
  chapter: number;
  chapterTitle: string;
  currentLocationId: string;
  locations: NovelLocation[];
  discoveredLocationIds: string[];
  hero: NovelHero;
  companions: NovelCompanion[];
  flags: Record<string, boolean>;
  content: WuxiaContentRegistry;
  campaign: WuxiaCampaignState;
  life: WuxiaLifeState;
  chronicle: WorldChronicleState;
  world: WuxiaWorldState;
  narrative: NarrativeArchitecture;
  log: StoryLogEntry[];
  history: NovelHistoryEntry[];
  currentEvent: NovelEvent | null;
  eventDirector?: EventDirectorDecision;
  pendingOutcome?: TurnOutcome;
  ending?: NovelEnding;
}

interface EffectSpec {
  stats?: Partial<NovelStats>;
  health?: number;
  silver?: number;
  clues?: number;
  heat?: number;
  level?: number;
  item?: string;
  removeItem?: string;
  moveTo?: string;
  flag?: string;
  companion?: Omit<NovelCompanion, "joinedTurn">;
  affinity?: { id: string; delta: number };
}

interface Rng {
  state: number;
  next: () => number;
  pick: <T>(items: T[]) => T;
}

const STAT_LABELS: Record<StatKey, string> = {
  martial: "武艺",
  insight: "洞察",
  chivalry: "侠义",
  fame: "名望",
  fortune: "机缘",
};

const ORIGINS: Record<OriginId, {
  label: string;
  description: string;
  sectId: string;
  affiliationName: string;
  homeName?: string;
  homeDescriptor?: string;
  art: string;
  epithet: string;
  stats: NovelStats;
  health: number;
  silver: number;
  portrait: string;
}> = {
  sect_disciple: {
    label: "门派弟子",
    description: "在规矩与师命之间长大，手里有一门可依仗的正宗功夫。",
    sectId: "sect_qingyun",
    affiliationName: "青云门",
    art: "引雷剑诀",
    epithet: "青云门下",
    stats: { martial: 58, insight: 42, chivalry: 58, fame: 18, fortune: 34 },
    health: 92,
    silver: 18,
    portrait: "/images/autochess/portraits/sui.png",
  },
  wanderer: {
    label: "无门游侠",
    description: "没有师门替你撑腰，却也没有规矩拴住你的脚步。",
    sectId: "none",
    affiliationName: "无门无派",
    art: "太祖长拳",
    epithet: "江湖散人",
    stats: { martial: 46, insight: 58, chivalry: 48, fame: 9, fortune: 58 },
    health: 88,
    silver: 26,
    portrait: "/images/autochess/portraits/dawn_duelist.png",
  },
  escort_guard: {
    label: "镖局护卫",
    description: "走过最远的路是镖旗指向的路，知道人心比刀锋更难防。",
    sectId: "guild_yanhui",
    affiliationName: "雁回镖局",
    homeName: "雁回镖局",
    homeDescriptor: "镖旗斜挂在旧门楼上，院中车辙通向五湖四海。",
    art: "听风步",
    epithet: "镖局旧卒",
    stats: { martial: 50, insight: 62, chivalry: 52, fame: 24, fortune: 46 },
    health: 96,
    silver: 34,
    portrait: "/images/autochess/portraits/sun-guard.png",
  },
};

const AMBITIONS: Record<AmbitionId, { label: string; description: string; stat: StatKey }> = {
  revenge: { label: "雪恨", description: "沿人物恩怨追索该还的一招，不让一人独吞所有罪名。", stat: "martial" },
  truth: { label: "求真", description: "从人物言行、位置与关系中辨真伪，不等待唯一谜底。", stat: "insight" },
  protect: { label: "守义", description: "护住眼前具体的人，也承担援手改变关系的后果。", stat: "chivalry" },
  freedom: { label: "逍遥", description: "不接旁人写好的天命，只沿自己遇见的人与路继续走。", stat: "fortune" },
};

const LOCATION_DATA: NovelLocation[] = [
  { id: "sect_qingyun", name: "青云山", type: "sect", descriptor: "云海压着檐角，钟声在松涛里回荡。", region: "北麓", x: 12, y: 15, connections: ["hall_changhe", "city_luoyang"], danger: 18, tags: ["山门", "藏经", "师门"] },
  { id: "hall_changhe", name: "百艺会馆", type: "hall", descriptor: "各门各派都能借一张桌，茶钱由最后拔刀的人结。", region: "河洛", x: 31, y: 37, connections: ["sect_qingyun", "city_luoyang", "clinic_lantern"], danger: 30, tags: ["会馆", "公议", "联络"] },
  { id: "city_luoyang", name: "洛阳城", type: "city", descriptor: "朱雀街灯火未熄，人人都像藏着半句秘密。", region: "河洛", x: 49, y: 20, connections: ["sect_qingyun", "hall_changhe", "bridge_beidou", "house_old", "court_xingyou", "manor_sixi"], danger: 26, tags: ["市集", "茶馆", "消息"] },
  { id: "bridge_beidou", name: "北斗桥", type: "bridge", descriptor: "七座桥墩斜指北天，暴雨时最适合埋伏，也最难收尸。", region: "洛水", x: 67, y: 40, connections: ["city_luoyang", "inn_tingyu", "house_old", "wild_heifeng", "court_xingyou"], danger: 68, tags: ["桥", "伏击", "水路"] },
  { id: "inn_tingyu", name: "听雨渡", type: "inn", descriptor: "雨棚连着水面，舟灯像一串摇晃的星。", region: "洛水", x: 87, y: 18, connections: ["bridge_beidou", "tower_huanzhen", "court_xingyou"], danger: 38, tags: ["渡口", "客栈", "暗线"] },
  { id: "house_old", name: "沈家旧宅", type: "house", descriptor: "荒院里只剩半扇门，墙上三寸剑痕从未被雨洗去。", region: "洛南", x: 50, y: 57, connections: ["city_luoyang", "bridge_beidou", "wild_heifeng", "village_bailu", "clinic_lantern"], danger: 61, tags: ["旧宅", "密会", "伏击"] },
  { id: "clinic_lantern", name: "悬灯诊棚", type: "clinic", descriptor: "一盏纸灯昼夜不熄，灯下药味压着未干的血气。", region: "洛南", x: 24, y: 61, connections: ["hall_changhe", "house_old", "village_bailu", "manor_sixi"], danger: 34, tags: ["医馆", "伤者", "证人"] },
  { id: "village_bailu", name: "白露村", type: "village", descriptor: "村口的白露井映着月色，井底压着不肯腐烂的旧纸。", region: "洛南", x: 35, y: 82, connections: ["clinic_lantern", "house_old", "wild_heifeng", "manor_sixi"], danger: 32, tags: ["村落", "古井", "残卷"] },
  { id: "wild_heifeng", name: "黑风岭", type: "wild", descriptor: "山口终年有风，吹得旧旗猎猎作响。", region: "东岭", x: 73, y: 76, connections: ["bridge_beidou", "house_old", "village_bailu", "tower_huanzhen"], danger: 76, tags: ["荒岭", "决斗", "匪道"] },
  { id: "tower_huanzhen", name: "幻真楼", type: "pavilion", descriptor: "高楼每层都传来不同声色，门内分院众多，旧识也比规矩更多。", region: "东海", x: 92, y: 57, connections: ["inn_tingyu", "wild_heifeng"], danger: 62, tags: ["VirtuaReal武侠化", "大门派", "联动"] },
  { id: "court_xingyou", name: "星游别院", type: "house", descriptor: "院门不挂长老名牌，只在有同游者时点亮纸星灯。", region: "洛水", x: 78, y: 30, connections: ["city_luoyang", "bridge_beidou", "inn_tingyu"], danger: 35, tags: ["PSPLive武侠化", "结社", "夜游"] },
  { id: "manor_sixi", name: "四禧庄", type: "sect", descriptor: "四重练功台围着一方乐池，单人招式到了这里总会自然接成阵势。", region: "洛南", x: 21, y: 78, connections: ["city_luoyang", "village_bailu", "clinic_lantern"], danger: 28, tags: ["四禧丸子武侠化", "合舞", "同伴"] },
];

const NAME_PARTS = {
  family: ["沈", "顾", "陆", "谢", "萧", "楚", "林", "裴", "苏", "叶"],
  given: ["照野", "听澜", "惊鸿", "无咎", "长歌", "临川", "晚舟", "归尘", "知微", "问棠"],
};

const COMPANION_NAMES = ["顾小满", "陆青萝", "谢停云", "裴照月", "沈砚秋", "苏问渠"];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const hashSeed = (value: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash + value.charCodeAt(index)) % 4294967291;
    hash = (hash * 16777619) % 4294967291;
  }
  return hash || 1;
};

export const previewWuxiaWorld = (seedText: string) => {
  const cast = wuxiaRosterForSeed(hashSeed(seedText || "江湖"), 8);
  return {
    cast: cast.map((entry) => ({ name: entry.name, title: entry.title, sourceName: entry.sourceName })),
    factions: Array.from(new Set(cast.map((entry) => WUXIA_FACTIONS[entry.factionId].name))),
  };
};

const createRng = (initial: number): Rng => {
  let state = initial % 4294967296 || 1;
  const next = () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
  return {
    get state() {
      return state;
    },
    next,
    pick: <T>(items: T[]) => items[Math.floor(next() * items.length)],
  };
};

const line = (turn: number, index: number, type: NovelLine["type"], text: string, speaker?: string): NovelLine => ({
  id: `line-${turn}-${index}-${text.slice(0, 8)}`,
  type,
  text,
  ...(speaker ? { speaker } : {}),
});

const effectPreview = (label: string, value: string, tone: EffectPreview["tone"]): EffectPreview => ({ label, value, tone });

const getAffiliationName = (sectId: string, origin: OriginId) => (
  SECTS_DATA.find((sect) => sect.id === sectId)?.name
  || (ORIGINS[origin].sectId === sectId ? ORIGINS[origin].affiliationName : "无门无派")
);

const getChapter = (turn: number, chapterLength = 3, agendaTitle?: string) => (
  storyChapterFor(Math.floor((Math.max(1, turn) - 1) / chapterLength) + 1, agendaTitle)
);

const currentLocation = (state: NovelState, id = state.currentLocationId) => state.locations.find((location) => location.id === id) || state.locations[0];

const calendarLabel = (state: NovelState, absoluteDay: number) => (
  formatWuxiaDate(wuxiaDateFromDay(absoluteDay, state.chronicle.eraName))
);

const homeLocationId = (sectId: string) => (sectId === "none" ? "city_luoyang" : sectId);

const buildLocations = (sectId: string, origin: OriginId, extensions: WorldLocation[] = []): NovelLocation[] => {
  const sect = SECTS_DATA.find((entry) => entry.id === sectId);
  const originData = ORIGINS[origin];
  const homeId = homeLocationId(sectId);
  const replaceHome = homeId !== "city_luoyang";
  const coreLocations = LOCATION_DATA.map((location) => {
    const next = location.id === "sect_qingyun" && replaceHome
      ? {
        ...location,
        id: homeId,
        name: (originData.sectId === sectId && originData.homeName) || (sect ? `${sect.name}驻地` : originData.affiliationName),
        descriptor: (originData.sectId === sectId && originData.homeDescriptor) || sect?.description || location.descriptor,
      }
      : { ...location };
    return {
      ...next,
      connections: next.connections.map((connectionId) => (connectionId === "sect_qingyun" && replaceHome ? homeId : connectionId)),
      tags: [...next.tags],
    };
  });
  const locations = [
    ...coreLocations,
    ...extensions.map((location) => ({ ...location, connections: [...location.connections], tags: [...location.tags] })),
  ];
  const byId = new Map<string, NovelLocation>();
  locations.forEach((location) => {
    if (byId.has(location.id)) throw new Error(`武侠内容地点出现重复 id: ${location.id}`);
    byId.set(location.id, location);
  });
  locations.forEach((location) => {
    location.connections.forEach((connectionId) => {
      const target = byId.get(connectionId);
      if (!target) throw new Error(`武侠地点 ${location.id} 指向不存在的 ${connectionId}`);
      if (!target.connections.includes(location.id)) target.connections.push(location.id);
    });
  });
  const visited = new Set<string>();
  const queue = locations.length ? [locations[0].id] : [];
  while (queue.length) {
    const locationId = queue.shift()!;
    if (visited.has(locationId)) continue;
    visited.add(locationId);
    byId.get(locationId)?.connections.forEach((connectionId) => {
      if (!visited.has(connectionId)) queue.push(connectionId);
    });
  }
  if (visited.size !== locations.length) {
    const unreachable = locations.filter((location) => !visited.has(location.id)).map((location) => location.name).join("、");
    throw new Error(`武侠内容地点无法从江湖路网抵达: ${unreachable}`);
  }
  return locations;
};

const companionPortrait = (index: number) => [
  "/images/autochess/portraits/lian.png",
  "/images/autochess/portraits/xuehui.png",
  "/images/autochess/portraits/youyi.png",
][index % 3];

const makeCompanion = (state: NovelState, rng: Rng, id: string, title: string, trait: string): NovelCompanion => ({
  id,
  characterId: id === "companion-rain" ? "rain_witness" : "lantern_healer",
  name: state.narrative.cast.find((character) => character.id === (id === "companion-rain" ? "rain_witness" : "lantern_healer"))?.name
    || rng.pick(COMPANION_NAMES.filter((name) => !state.companions.some((companion) => companion.name === name)).length > 0
      ? COMPANION_NAMES.filter((name) => !state.companions.some((companion) => companion.name === name))
      : COMPANION_NAMES),
  title,
  trait,
  affinity: 46,
  portrait: state.narrative.cast.find((character) => character.id === (id === "companion-rain" ? "rain_witness" : "lantern_healer"))?.portrait
    || companionPortrait(state.companions.length),
  joinedTurn: state.turn,
});

const oddsFor = (state: NovelState, stat: StatKey, difficulty: number) => clamp(Math.round(50 + (state.hero.stats[stat] - difficulty) * 1.15 + state.hero.stats.fortune * 0.12), 18, 92);

const choice = (
  state: NovelState,
  spec: Omit<NovelChoice, "check" | "success" | "failure"> & {
    check?: Omit<ChoiceCheck, "odds">;
    success: ChoiceOutcome;
    failure?: ChoiceOutcome;
  },
): NovelChoice => {
  const { check, ...rest } = spec;
  return {
    ...rest,
    ...(check ? { check: { ...check, odds: oddsFor(state, check.stat, check.difficulty) } } : {}),
  };
};

const applyEffect = (state: NovelState, effect: EffectSpec): NovelState => {
  const hero = { ...state.hero, stats: { ...state.hero.stats }, inventory: [...state.hero.inventory] };
  if (effect.stats) {
    (Object.keys(effect.stats) as StatKey[]).forEach((key) => {
      hero.stats[key] = clamp(hero.stats[key] + (effect.stats?.[key] || 0), 0, 100);
    });
  }
  hero.health = clamp(hero.health + (effect.health || 0), 0, hero.maxHealth);
  hero.silver = Math.max(0, hero.silver + (effect.silver || 0));
  hero.clues = clamp(hero.clues + (effect.clues || 0), 0, 6);
  hero.heat = clamp(hero.heat + (effect.heat || 0), 0, 100);
  hero.level = clamp(hero.level + (effect.level || 0), 1, 9);
  if (effect.item && !hero.inventory.includes(effect.item)) hero.inventory.push(effect.item);
  if (effect.removeItem) hero.inventory = hero.inventory.filter((item) => item !== effect.removeItem);
  const nextFlags = { ...state.flags };
  if (effect.flag) nextFlags[effect.flag] = true;
  const nextCompanions = state.companions.map((companion) => (
    effect.affinity?.id === companion.id
      ? { ...companion, affinity: clamp(companion.affinity + effect.affinity.delta, 0, 100) }
      : companion
  ));
  if (effect.companion && !nextCompanions.some((companion) => companion.id === effect.companion?.id)) {
    nextCompanions.push({ ...effect.companion, joinedTurn: state.turn + 1 });
  }
  const nextLocation = effect.moveTo && state.locations.some((location) => location.id === effect.moveTo)
    ? effect.moveTo
    : state.currentLocationId;
  const discovered = state.discoveredLocationIds.includes(nextLocation)
    ? state.discoveredLocationIds
    : [...state.discoveredLocationIds, nextLocation];
  return {
    ...state,
    hero,
    flags: nextFlags,
    companions: nextCompanions,
    currentLocationId: nextLocation,
    discoveredLocationIds: discovered,
  };
};

const eventBase = (state: NovelState, data: Omit<NovelEvent, "locationName">): NovelEvent => ({
  ...data,
  locationName: currentLocation(state, data.locationId).name,
});

const buildOpening = (state: NovelState): NovelEvent => {
  const sect = state.hero.sectName;
  const ambition = AMBITIONS[state.hero.ambition];
  const location = currentLocation(state);
  const seal = sect === "无门无派" ? "一枚陌生的青铜印" : `${sect}旧日的门印`;
  return eventBase(state, {
    id: "opening-oath",
    eyebrow: "第一回 · 风起",
    title: "一封没有署名的信",
    subtitle: `${location.name} · 山雨将至`,
    locationId: location.id,
    mood: "mist",
    lines: [
      line(state.turn, 0, "narrative", `${state.hero.name}在${location.name}醒来时，窗纸上正落着一层薄雾。`),
      line(state.turn, 1, "action", `案上压着一封密信，火漆印是${seal}。`),
      line(state.turn, 2, "dialogue", `“若要知道沉星渡是谁放的火，带铜纹来见。”信末又添了一句：江湖从不催人，催人的只是人心。`, "无名落款"),
      line(state.turn, 3, "inner", `你想起自己的誓言：${ambition.description}`),
    ],
    choices: [
      choice(state, {
        id: "open-letter",
        label: "拆信，先看清局势",
        description: "把好奇心变成线索，可能也会让人知道你已经入局。",
        tone: "jade",
        risk: "中",
        preview: [effectPreview("线索", "+1", "good"), effectPreview("洞察", "+4", "good"), effectPreview("风声", "+5", "bad")],
        check: { stat: "insight", label: "洞察检定", difficulty: 44 },
        success: {
          lines: [line(state.turn, 4, "action", "你用灯油烘开火漆，信纸上浮出一行藏头诗。"), line(state.turn, 5, "system", "获得线索：北斗桥下，子时。")],
          effects: { stats: { insight: 4 }, clues: 1, heat: 5, item: "密信残页", flag: "read_letter" },
        },
        failure: {
          lines: [line(state.turn, 4, "action", "火漆裂开的一瞬，一缕辛香扑面而来。你只来得及记住半句。"), line(state.turn, 5, "system", "线索不完整，但有人知道你看过信。")],
          effects: { stats: { insight: 1 }, clues: 1, heat: 12, flag: "read_letter" },
        },
      }),
      choice(state, {
        id: "burn-letter",
        label: "烧信，沿着送信人追查",
        description: "不让证据落入旁人之手，先保住主动权。",
        tone: "ember",
        risk: "低",
        preview: [effectPreview("风声", "-4", "good"), effectPreview("机缘", "+3", "good")],
        success: { lines: [line(state.turn, 4, "action", "你将信投入烛火，灰烬里留下半枚铜扣。"), line(state.turn, 5, "narrative", "门外的脚步停了一瞬，随后向山下远去。")], effects: { stats: { fortune: 3 }, heat: -4, item: "半枚铜扣", flag: "burned_letter" } },
      }),
      choice(state, {
        id: "ask-master",
        label: "带信求见掌门",
        description: "把秘密交给最熟悉江湖规则的人，但你的决定会留下记录。",
        tone: "gold",
        risk: "中",
        preview: [effectPreview("侠义", "+5", "good"), effectPreview("名望", "+3", "good"), effectPreview("银两", "-6", "bad")],
        check: { stat: "chivalry", label: "立场检定", difficulty: 48 },
        success: { lines: [line(state.turn, 4, "dialogue", "掌门没有接信，只说：“既然你来问，便说明这件事已经选中了你。”", state.hero.sectName === "无门无派" ? "山门守客" : "掌门")], effects: { stats: { chivalry: 5, fame: 3 }, silver: -6, clues: 1, flag: "consulted_master" } },
        failure: { lines: [line(state.turn, 4, "narrative", "你在大殿外等到夜深，掌门只让人传来一句：此事与你无关。"), line(state.turn, 5, "inner", "可那句拒绝，反倒证实了信上的名字。")], effects: { stats: { insight: 3 }, silver: -6, clues: 1, heat: 4, flag: "consulted_master" } },
      }),
    ],
  });
};

const buildTeaWhisper = (state: NovelState): NovelEvent => {
  const location = currentLocation(state, "city_luoyang");
  const rival = state.narrative.cast.find((character) => character.id === "grey_rival");
  return eventBase(state, {
    id: "tea-whisper",
    eyebrow: "第二回 · 市声",
    title: "茶沫里的半句真话",
    subtitle: "洛阳城 · 朱雀街",
    locationId: location.id,
    mood: "market",
    lines: [
      line(state.turn, 0, "narrative", "说书人醒木一拍，满堂人的目光同时落向你腰间。"),
      line(state.turn, 1, "dialogue", "“北斗桥下的旧盟，今夜要见血。”邻桌有人压低声音。", "戴斗笠的人"),
      line(state.turn, 2, "action", `你发现那人的茶盏底压着同样的铜纹，盏沿另刻了三个小字：${rival?.name || "晏无归"}。`),
    ],
    choices: [
      choice(state, { id: "buy-rumor", label: "用银两买下消息", description: "让金钱替你敲门，消息通常也会掺水。", tone: "gold", risk: "低", preview: [effectPreview("银两", "-10", "bad"), effectPreview("线索", "+1", "good")], success: { lines: [line(state.turn, 3, "action", "你把十枚银钱推过去，换来一张画着桥影的旧地图。")], effects: { silver: -10, clues: 1, item: "北斗桥图" } } }),
      choice(state, { id: "follow-hat", label: "跟上斗笠客", description: "把脚步交给直觉，可能撞上真正的幕后人。", tone: "steel", risk: "高", preview: [effectPreview("洞察", "+5", "good"), effectPreview("风声", "+12", "bad"), effectPreview("前往", "听雨渡", "neutral")], check: { stat: "insight", label: "跟踪检定", difficulty: 56 }, success: { lines: [line(state.turn, 3, "action", "你借着人潮换了三次位置，终于看见他把铜纹交给了渡口的船娘。")], effects: { stats: { insight: 5 }, clues: 2, heat: 12, moveTo: "inn_tingyu" } }, failure: { lines: [line(state.turn, 3, "narrative", "你跟丢在胭脂铺后，回头时只看见一枚钉在墙上的飞镖。")], effects: { stats: { fortune: 2 }, heat: 16 } } }),
      choice(state, { id: "perform-righteous", label: "当众揭穿谣言", description: "把危险摊在阳光下，名望会涨，敌意也会涨。", tone: "jade", risk: "中", preview: [effectPreview("侠义", "+6", "good"), effectPreview("名望", "+8", "good"), effectPreview("风声", "+10", "bad")], check: { stat: "chivalry", label: "声望检定", difficulty: 50 }, success: { lines: [line(state.turn, 3, "dialogue", "你抬杯一笑：“若真有旧盟，何必借茶馆的嘴说话？”满堂哗然。", state.hero.name)], effects: { stats: { chivalry: 6, fame: 8 }, heat: 10, clues: 1 } }, failure: { lines: [line(state.turn, 3, "narrative", "你的话被说书人的醒木压回去，反倒成了众人眼中的可疑之人。")], effects: { stats: { fame: 2 }, heat: 15 } } }),
    ],
  });
};

const buildBridgeAmbush = (state: NovelState): NovelEvent => {
  const location = currentLocation(state, "bridge_beidou");
  const enemy = state.hero.heat > 35 ? "黑衣追骑" : "断桥上的刀客";
  return eventBase(state, {
    id: "bridge-ambush",
    eyebrow: "第三回 · 夜行",
    title: "桥断之前",
    subtitle: "北斗桥 · 子时",
    locationId: location.id,
    mood: "storm",
    lines: [
      line(state.turn, 0, "narrative", "山雨把旧桥浇得发白，桥那头站着三个人，像三笔未干的墨。"),
      line(state.turn, 1, "dialogue", `“把铜纹留下。”为首的${enemy}抬刀，刀背映着冷光。`, enemy),
      line(state.turn, 2, "action", "桥下水声忽然一停，你知道真正的杀招还在暗处。"),
    ],
    choices: [
      choice(state, { id: "fight-bridge", label: "拔刀迎上", description: "用武艺换出一条路，胜负会改变你的江湖分量。", tone: "steel", risk: "高", preview: [effectPreview("武艺", "+5", "good"), effectPreview("气血", "-18", "bad"), effectPreview("名望", "+7", "good")], check: { stat: "martial", label: "武艺检定", difficulty: 54 }, success: { lines: [line(state.turn, 3, "action", "你踏上桥心，第一刀借雨势下沉，第二刀已经抵住了对方的咽喉。"), line(state.turn, 4, "narrative", "刀客留下铜纹，翻身坠入雾里。")], effects: { stats: { martial: 5, fame: 7 }, health: -18, clues: 1, heat: 8, item: "染雨铜纹" } }, failure: { lines: [line(state.turn, 3, "narrative", "你挡住了第一刀，却没料到桥板下还藏着一根铁索。"), line(state.turn, 4, "action", "你带伤跃入水中，捡回一截染血的布条。")], effects: { stats: { martial: 2 }, health: -30, clues: 1, heat: 16, item: "染血布条" } } }),
      choice(state, { id: "break-bridge", label: "斩断桥索，借水遁走", description: "不与未知的敌人硬拼，先把战场变成你的掩护。", tone: "ink", risk: "中", preview: [effectPreview("气血", "+6", "good"), effectPreview("机缘", "+4", "good"), effectPreview("前往", "白露村", "neutral")], check: { stat: "fortune", label: "身法检定", difficulty: 49 }, success: { lines: [line(state.turn, 3, "action", "你割断桥索，借着塌桥的轰响跃入芦苇。"), line(state.turn, 4, "narrative", "敌人被雨幕隔开，你在白露村的井边换了口气。")], effects: { health: 6, stats: { fortune: 4 }, moveTo: "village_bailu", heat: -5 } }, failure: { lines: [line(state.turn, 3, "narrative", "桥索只断了一半，你摔进浅滩，狼狈地滚进芦苇。")], effects: { health: -12, heat: 8, moveTo: "village_bailu" } } }),
      choice(state, { id: "name-master", label: "报出师门名号", description: "借门派的影子压住刀锋，正邪立场会变得更清楚。", tone: "gold", risk: "中", preview: [effectPreview("名望", "+4", "good"), effectPreview("风声", "+8", "bad"), effectPreview("侠义", "+3", "good")], check: { stat: "fame", label: "威势检定", difficulty: 42 }, success: { lines: [line(state.turn, 3, "dialogue", `你报出${state.hero.sectName}名号，桥头的刀锋果然迟疑。`, state.hero.name)], effects: { stats: { fame: 4, chivalry: 3 }, heat: 8, clues: 1 } }, failure: { lines: [line(state.turn, 3, "dialogue", "“无名小卒也敢借名头吓人？”对方笑了，笑声比雨更冷。", enemy)], effects: { stats: { fame: 1 }, health: -16, heat: 12 } } }),
    ],
  });
};

const buildRainPavilion = (state: NovelState, rng: Rng): NovelEvent => {
  const location = currentLocation(state, "inn_tingyu");
  const companion = makeCompanion(state, rng, "companion-rain", "雨夜客", "擅长听声辨位");
  return eventBase(state, {
    id: "rain-pavilion",
    eyebrow: "第四回 · 同行",
    title: "檐下多了一把伞",
    subtitle: "听雨渡 · 雨幕",
    locationId: location.id,
    mood: "moon",
    lines: [
      line(state.turn, 0, "narrative", "渡口的雨落成帘，你在最靠里的桌边发现一把没有主人的青伞。"),
      line(state.turn, 1, "dialogue", `“伞可以借，秘密不能。”${companion.name}从帘后走出，袖口藏着一枚旧铜纹。`, companion.name),
      line(state.turn, 2, "action", `她说自己也在追查沉星渡旧案，只差一个愿意把后背交出来的人；提到阁主${state.narrative.bible.antagonistName}时，她的手指却在伞柄上停了一瞬。`),
    ],
    choices: [
      choice(state, { id: "invite-companion", label: "邀她同行", description: "队伍多一双眼睛，也多一份要守住的牵挂。", tone: "jade", risk: "中", preview: [effectPreview("同行", "雨夜客", "good"), effectPreview("洞察", "+5", "good"), effectPreview("侠义", "+3", "good")], success: { lines: [line(state.turn, 3, "dialogue", "“那就说好了，前路若有风，我替你看左边。”", companion.name), line(state.turn, 4, "narrative", `${companion.name}收起青伞，正式加入你的旅途。`)], effects: { stats: { insight: 5, chivalry: 3 }, companion, flag: "met_rain_companion" } } }),
      choice(state, { id: "trade-clue", label: "用线索换线索", description: "保持距离，先验证她知道多少。", tone: "gold", risk: "低", preview: [effectPreview("线索", "+1", "good"), effectPreview("洞察", "+3", "good"), effectPreview("关系", "保留余地", "neutral")], check: { stat: "insight", label: "试探检定", difficulty: 46 }, success: { lines: [line(state.turn, 3, "action", "你只亮出半张地图，她却说出了地图背面的三个字：归潮阁。")], effects: { stats: { insight: 3 }, clues: 1, flag: "met_rain_companion" } }, failure: { lines: [line(state.turn, 3, "narrative", "你们各说一半，最后只交换了一个礼貌的眼神。")], effects: { stats: { fortune: 2 }, flag: "met_rain_companion" } } }),
      choice(state, { id: "leave-rain", label: "谢过她，独自上船", description: "自由不必解释，但孤身一人会让每一次失误更贵。", tone: "ink", risk: "低", preview: [effectPreview("机缘", "+5", "good"), effectPreview("前往", "洛阳城", "neutral")], success: { lines: [line(state.turn, 3, "narrative", "你把青伞留在檐下，乘一叶小舟驶向灯火更密的地方。")], effects: { stats: { fortune: 5 }, moveTo: "city_luoyang" } } }),
    ],
  });
};

const buildBrokenManual = (state: NovelState): NovelEvent => {
  const location = currentLocation(state, "village_bailu");
  const middleTechnique = state.narrative.martial.techniques[1];
  const signatureTechnique = state.narrative.martial.techniques.find((technique) => technique.id === state.narrative.martial.signatureTechniqueId)
    || state.narrative.martial.techniques[2];
  return eventBase(state, {
    id: "broken-manual",
    eyebrow: "第五回 · 机缘",
    title: "井底的半卷心法",
    subtitle: "白露村 · 旧井",
    locationId: location.id,
    mood: "mist",
    lines: [
      line(state.turn, 0, "narrative", "村民说井里落过一位剑客，三年过去，井水仍在夜里泛光。"),
      line(state.turn, 1, "action", "你垂下绳索，摸到一只油布包。包里没有剑，只有半卷被水泡皱的心法。"),
      line(state.turn, 2, "inner", `残页恰好补上${state.narrative.martial.name}失传的换气法。页尾只写两句：先悟“${middleTechnique.name}”，方可问“${signatureTechnique.name}”。`),
    ],
    choices: [
      choice(state, { id: "learn-manual", label: "当场参悟残页", description: "把危险的缺页纳入自己的功夫，可能走得更快，也可能走偏。", tone: "steel", risk: "高", preview: [effectPreview("武艺", "+8", "good"), effectPreview("气血", "-12", "bad"), effectPreview("获得", "残页心法", "good")], check: { stat: "martial", label: "悟性检定", difficulty: 58 }, success: { lines: [line(state.turn, 3, "action", "你在井边拆解每一道缺口，直到雨停，残页上的剑意终于接上了你的呼吸。")], effects: { stats: { martial: 8 }, health: -12, level: 1, item: "残页心法", flag: "learned_broken_manual" } }, failure: { lines: [line(state.turn, 3, "narrative", "真气逆行，你咳出一口血，却也记住了那道最危险的剑意。")], effects: { stats: { martial: 3, insight: 4 }, health: -24, item: "残页心法", flag: "learned_broken_manual" } } }),
      choice(state, { id: "sell-manual", label: "拿去换一张地图", description: "不贪眼前的武功，把机缘换成更大的视野。", tone: "gold", risk: "低", preview: [effectPreview("银两", "+18", "good"), effectPreview("线索", "+1", "good")], success: { lines: [line(state.turn, 3, "action", "村中老先生用十八两和一张旧航图换走了残页。")], effects: { silver: 18, clues: 1, item: "归潮航图" } } }),
      choice(state, { id: "return-manual", label: "把残页留在井边", description: "有些力量不属于此刻的你，克制也会留下名声。", tone: "jade", risk: "中", preview: [effectPreview("侠义", "+8", "good"), effectPreview("名望", "+5", "good"), effectPreview("机缘", "+2", "good")], check: { stat: "chivalry", label: "守心检定", difficulty: 47 }, success: { lines: [line(state.turn, 3, "narrative", "你把残页封回油布包，村民们第一次把你当成真正的侠客。")], effects: { stats: { chivalry: 8, fame: 5, fortune: 2 }, flag: "returned_manual" } }, failure: { lines: [line(state.turn, 3, "inner", "你放下残页，却在转身后又回头看了一眼。那一眼，足以让心湖起皱。")], effects: { stats: { chivalry: 3, fortune: 3 }, heat: 3, flag: "returned_manual" } } }),
    ],
  });
};

const buildSectTrial = (state: NovelState): NovelEvent => {
  const isWanderer = state.hero.origin === "wanderer";
  const isEscort = state.hero.origin === "escort_guard";
  const location = currentLocation(state, homeLocationId(state.hero.sectId));
  const venueName = isWanderer ? "洛阳旧盟会馆" : state.hero.sectName;
  const questioner = isWanderer ? "旧盟执事" : isEscort ? "总镖头" : "执戒长老";
  return eventBase(state, {
    id: "sect-trial",
    eyebrow: "第六回 · 门规",
    title: isWanderer ? "会馆前的三问" : isEscort ? "镖厅前的三问" : "大殿前的三问",
    subtitle: `${venueName} · 夜议`,
    locationId: location.id,
    mood: "ember",
    lines: [
      line(state.turn, 0, "narrative", isWanderer ? "你踏进旧盟会馆时，满堂人的目光都停在你袖口的铜纹上。" : `你回到${venueName}时，所有人的目光都停在你袖口的铜纹上。`),
      line(state.turn, 1, "dialogue", `“你可以不说，但从今夜起，任何人都可能替你说。”${questioner}把茶盏推到你面前。`, questioner),
      line(state.turn, 2, "action", isWanderer ? "门外风声像翻页，独行与借势的边界只剩一线。" : `你认出案头卷宗正是沉星渡失踪的副本，只是${state.hero.sectName}的名字被新墨盖住了。`),
    ],
    choices: [
      choice(state, { id: "tell-truth", label: "据实相告", description: `让${venueName}知道你追查的每一步，换取公开的支援。`, tone: "jade", risk: "中", preview: [effectPreview("名望", "+7", "good"), effectPreview("侠义", "+5", "good"), effectPreview("风声", "+6", "bad")], check: { stat: "chivalry", label: "立誓检定", difficulty: 52 }, success: { lines: [line(state.turn, 3, "dialogue", `${questioner}听完没有责罚，只命人把门前的灯全点起来。`, questioner)], effects: { stats: { fame: 7, chivalry: 5 }, clues: 1, heat: 6, flag: "sect_support" } }, failure: { lines: [line(state.turn, 3, "narrative", "你说到铜纹来处时，席间有人先一步打断了你。")], effects: { stats: { insight: 4 }, heat: 10, flag: "sect_doubt" } } }),
      choice(state, { id: "hide-sect", label: "只交出无关线索", description: "把真正的底牌留给自己，在场人的态度会变得暧昧。", tone: "ink", risk: "低", preview: [effectPreview("洞察", "+5", "good"), effectPreview("风声", "-3", "good"), effectPreview("线索", "+1", "good")], success: { lines: [line(state.turn, 3, "action", "你把一张无关紧要的路线图摊开，所有人都以为你只是误入风波。")], effects: { stats: { insight: 5 }, clues: 1, heat: -3, flag: "sect_uncertain" } } }),
      choice(state, { id: "leave-sect", label: isWanderer ? "谢绝盘问，连夜出城" : isEscort ? "解下镖牌，连夜离局" : "卸下门牌，连夜下山", description: "从此不再借旧归属之名，孤身的选择会改变结局的颜色。", tone: "steel", risk: "高", preview: [effectPreview("机缘", "+6", "good"), effectPreview("名望", "-4", "bad"), effectPreview("前往", "黑风岭", "neutral")], check: { stat: "fortune", label: "决绝检定", difficulty: 50 }, success: { lines: [line(state.turn, 3, "narrative", isWanderer ? "你推门走入夜色，会馆的灯影从此只在身后。" : "你把旧牌放在石阶上，门前的灯影从此只在身后。")], effects: { stats: { fortune: 6, fame: -4 }, moveTo: "wild_heifeng", flag: "left_sect" } }, failure: { lines: [line(state.turn, 3, "narrative", "你走到门前，还是停住了脚。真正的离开，比想象中更难。")], effects: { stats: { fortune: 2 }, health: -8, flag: "left_sect" } } }),
    ],
  });
};

const buildTraitor = (state: NovelState): NovelEvent => {
  const location = currentLocation(state, "house_old");
  const rainWitness = state.narrative.cast.find((character) => character.id === "rain_witness");
  const name = state.companions[0]?.name || rainWitness?.name || "那名送信人";
  return eventBase(state, {
    id: "traitor",
    eyebrow: "第七回 · 反照",
    title: "影子先于人开口",
    subtitle: "洛阳城 · 旧宅",
    locationId: location.id,
    mood: "moon",
    lines: [
      line(state.turn, 0, "narrative", "旧宅的灯芯被人换过，火光稳定得不像一座荒屋。"),
      line(state.turn, 1, "action", `你在墙后听见${name}的声音，却看见另一道影子先一步映上窗纸。`),
      line(state.turn, 2, "dialogue", `“把最后一枚铜纹交出来，${state.narrative.bible.antagonistName}答应让你们活到天明。”`, "窗外的人"),
    ],
    choices: [
      choice(state, { id: "trust-companion", label: "把后背交给同伴", description: "关系越深，背叛的代价越高；但真正的默契也只在此刻生效。", tone: "jade", risk: "高", preview: [effectPreview("关系", "+16", "good"), effectPreview("线索", "+2", "good"), effectPreview("气血", "-14", "bad")], check: state.companions.length ? { stat: "insight", label: "默契检定", difficulty: 55 } : undefined, success: { lines: [line(state.turn, 3, "action", `${name}没有回头，袖中短刃却替你挡住了窗外的第一支箭。`), line(state.turn, 4, "narrative", "你们在桌下找到一张写着归潮阁的名单。")], effects: { affinity: state.companions[0] ? { id: state.companions[0].id, delta: 16 } : undefined, clues: 2, health: -14, heat: 9, item: "归潮阁名单" } }, failure: { lines: [line(state.turn, 3, "narrative", `${name}迟疑了一瞬，箭已穿过窗纸。你们只能带伤撤离。`)], effects: { affinity: state.companions[0] ? { id: state.companions[0].id, delta: -8 } : undefined, clues: 1, health: -25, heat: 18 } } }),
      choice(state, { id: "set-trap", label: "反过来设局", description: "用假铜纹和假消息逼出幕后的人。", tone: "gold", risk: "中", preview: [effectPreview("洞察", "+7", "good"), effectPreview("线索", "+1", "good"), effectPreview("银两", "-8", "bad")], check: { stat: "insight", label: "设局检定", difficulty: 57 }, success: { lines: [line(state.turn, 3, "action", "你故意让烛影露出破绽，窗外的人果然追着假消息踏入了陷阱。")], effects: { stats: { insight: 7 }, clues: 1, silver: -8, heat: -4, item: "黑檀令牌" } }, failure: { lines: [line(state.turn, 3, "narrative", "假消息刚传出去，旧宅的门便被人从外面锁死。")], effects: { stats: { insight: 2 }, health: -12, silver: -8, heat: 12 } } }),
      choice(state, { id: "burn-evidence", label: "烧掉名单，先救人", description: "把真相放在身后，守住眼前的人。", tone: "ink", risk: "低", preview: [effectPreview("侠义", "+9", "good"), effectPreview("气血", "+10", "good"), effectPreview("线索", "-1", "bad")], success: { lines: [line(state.turn, 3, "action", "火舌吞掉名单，你扶起受伤的人，沿着后巷走到天明。")], effects: { stats: { chivalry: 9 }, health: 10, clues: -1, heat: -6 } } }),
    ],
  });
};

const buildDuel = (state: NovelState): NovelEvent => {
  const location = currentLocation(state, "wild_heifeng");
  const rival = state.narrative.cast.find((character) => character.id === "grey_rival");
  const rivalName = rival?.name || "灰衣剑客";
  return eventBase(state, {
    id: "duel-at-dawn",
    eyebrow: "第八回 · 约战",
    title: "黎明前的第三招",
    subtitle: "黑风岭 · 悬崖边",
    locationId: location.id,
    mood: "storm",
    lines: [
      line(state.turn, 0, "narrative", "天还没亮，悬崖边已经有人等你。"),
      line(state.turn, 1, "dialogue", `“我叫${rivalName}。你追的不是归潮阁，是自己不肯放下的旧梦。”对方横剑而立。`, rivalName),
      line(state.turn, 2, "action", `他起手正是${state.hero.sectName}从不外传的一式，只出三招，像在替你丈量心里那道裂缝。`),
    ],
    choices: [
      choice(state, { id: "accept-duel", label: "接下三招", description: "以武问心，胜负会把你的名号传遍山下。", tone: "steel", risk: "高", preview: [effectPreview("武艺", "+9", "good"), effectPreview("名望", "+10", "good"), effectPreview("气血", "-28", "bad")], check: { stat: "martial", label: "决斗检定", difficulty: 63 }, success: { lines: [line(state.turn, 3, "action", `第三招落下，你以“${state.narrative.martial.techniques[1].name}”接住来势，剑锋停在了彼此之间。`), line(state.turn, 4, "dialogue", `“你终于知道自己要赢什么。”${rivalName}收剑，留下归潮阁的方位。`, rivalName)], effects: { stats: { martial: 9, fame: 10 }, health: -28, clues: 2, heat: 7 } }, failure: { lines: [line(state.turn, 3, "narrative", `你接住前两招，第三招却让旧伤尽数裂开。${rivalName}没有追击，只把一枚药丸弹到你脚边。`)], effects: { stats: { insight: 5 }, health: -38, clues: 1, item: "止血丸", heat: 3 } } }),
      choice(state, { id: "read-sword", label: "只看，不接招", description: "放下证明自己的冲动，用洞察换取对方真正的目的。", tone: "jade", risk: "中", preview: [effectPreview("洞察", "+9", "good"), effectPreview("风声", "-5", "good"), effectPreview("名望", "-2", "bad")], check: { stat: "insight", label: "观招检定", difficulty: 58 }, success: { lines: [line(state.turn, 3, "inner", "你看见第三招并不是杀招，而是一道指向山谷的引路剑。")], effects: { stats: { insight: 9, fame: -2 }, clues: 2, heat: -5 } }, failure: { lines: [line(state.turn, 3, "narrative", "你看懂了招式，却没看懂他何时离去。悬崖边只剩一缕灰布。")], effects: { stats: { insight: 3 }, clues: 1 } } }),
      choice(state, { id: "walk-away-duel", label: "转身下山", description: "不让别人替你规定何时拔剑，逍遥之道有时就是拒绝。", tone: "ink", risk: "低", preview: [effectPreview("机缘", "+8", "good"), effectPreview("侠义", "+2", "good"), effectPreview("前往", "白露村", "neutral")], success: { lines: [line(state.turn, 3, "narrative", "你把剑收回鞘中，山风替你回答了那句没有说完的话。")], effects: { stats: { fortune: 8, chivalry: 2 }, moveTo: "village_bailu" } } }),
    ],
  });
};

const buildAlliance = (state: NovelState): NovelEvent => {
  const location = currentLocation(state, "hall_changhe");
  const homeFaction = state.narrative.factions.find((faction) => faction.id === "home")?.name || state.hero.sectName;
  return eventBase(state, {
    id: "alliance-council",
    eyebrow: "第九回 · 合纵",
    title: "把名字写在同一张纸上",
    subtitle: "长河盟会馆 · 灯下公议",
    locationId: location.id,
    mood: "ember",
    lines: [
      line(state.turn, 0, "narrative", `会馆里坐着${homeFaction}、长河盟与水路帮会三方人马，桌上只有一盏未点的灯。`),
      line(state.turn, 1, "dialogue", "“谁先签名，谁就先把命押上。”有人把笔推到你面前。", "旧盟使者"),
      line(state.turn, 2, "action", "你手里的线索足够让三方互相猜忌，也足够让他们暂时站到一起。"),
    ],
    choices: [
      choice(state, { id: "forge-alliance", label: "促成临时同盟", description: "用名望和侠义把彼此的刀锋对准真正的敌人。", tone: "jade", risk: "高", preview: [effectPreview("侠义", "+8", "good"), effectPreview("名望", "+10", "good"), effectPreview("风声", "+14", "bad")], check: { stat: "chivalry", label: "盟约检定", difficulty: 61 }, success: { lines: [line(state.turn, 3, "action", "你让三方各退一步，第一盏灯终于亮起来。"), line(state.turn, 4, "narrative", "归潮阁的入口被写进盟约，明日子时，所有人一起走。")], effects: { stats: { chivalry: 8, fame: 10 }, clues: 2, heat: 14, flag: "formed_alliance" } }, failure: { lines: [line(state.turn, 3, "narrative", "笔尖刚落，屋顶便传来一声轻响。有人比你更早知道了盟约。")], effects: { stats: { insight: 5 }, clues: 1, health: -10, heat: 20 } } }),
      choice(state, { id: "sell-information", label: "把情报卖给最高价者", description: "名利会带你走得更快，但结局会记住这笔账。", tone: "gold", risk: "中", preview: [effectPreview("银两", "+32", "good"), effectPreview("名望", "-8", "bad"), effectPreview("风声", "+18", "bad")], check: { stat: "fortune", label: "谈价检定", difficulty: 52 }, success: { lines: [line(state.turn, 3, "action", "三方竞价后，银票压过了刀。你带着情报离开会馆。")], effects: { stats: { fame: -8 }, silver: 32, heat: 18, clues: 1, flag: "sold_information" } }, failure: { lines: [line(state.turn, 3, "narrative", "你开出的价太高，三方同时把手按在了兵刃上。")], effects: { stats: { fame: -4 }, silver: 12, health: -14, heat: 25 } } }),
      choice(state, { id: "leave-council", label: "熄灯离席", description: "不替任何人签名，把最后的决定留给自己。", tone: "ink", risk: "低", preview: [effectPreview("机缘", "+6", "good"), effectPreview("洞察", "+4", "good"), effectPreview("线索", "+1", "good")], success: { lines: [line(state.turn, 3, "narrative", "你吹灭那盏灯，黑暗里反而听清了每个人离开的方向。")], effects: { stats: { fortune: 6, insight: 4 }, clues: 1, heat: -6, flag: "refused_alliance" } } }),
    ],
  });
};

const buildLanternHealer = (state: NovelState, rng: Rng): NovelEvent => {
  const location = currentLocation(state, "clinic_lantern");
  const companion = makeCompanion(state, rng, "companion-lantern", "负灯医者", "善辨伤势与药毒");
  return eventBase(state, {
    id: "lantern-healer",
    eyebrow: `第${state.turn + 1}回 · 灯影`,
    title: "药炉旁还空着一张凳",
    subtitle: "悬灯诊棚 · 夜诊",
    locationId: location.id,
    mood: "moon",
    lines: [
      line(state.turn, 0, "narrative", "白露井边亮着一盏纸灯，药香压住了风里的血腥味。"),
      line(state.turn, 1, "dialogue", `“我替人治伤，也替旧案记账。”${companion.name}把一枚铜纹放在药炉旁。`, companion.name),
      line(state.turn, 2, "action", "村外传来急促马蹄，留给你们商量的时间只够一碗药变凉。"),
    ],
    choices: [
      choice(state, { id: "invite-healer", label: "请她一道上路", description: "让队伍多一盏灯，往后的伤与疑问都有人照看。", tone: "jade", risk: "低", preview: [effectPreview("同行", "负灯医者", "good"), effectPreview("气血", "+16", "good"), effectPreview("机缘", "+4", "good")], success: { lines: [line(state.turn, 3, "dialogue", "“药箱我背，难走的路你来选。”", companion.name), line(state.turn, 4, "narrative", `${companion.name}吹熄药炉，提灯加入了你的旅途。`)], effects: { health: 16, stats: { fortune: 4 }, companion, flag: "met_lantern_healer" } } }),
      choice(state, { id: "buy-medicine", label: "留下买一帖伤药", description: "各走各路之前，先把身上的伤处理干净。", tone: "gold", risk: "低", preview: [effectPreview("气血", "+28", "good"), effectPreview("银两", "-12", "bad"), effectPreview("洞察", "+3", "good")], success: { lines: [line(state.turn, 3, "action", "药汤苦得发涩，你却从药渣里认出了归潮阁惯用的迷香。")], effects: { health: 28, silver: -12, stats: { insight: 3 }, clues: 1, flag: "met_lantern_healer" } } }),
      choice(state, { id: "defend-clinic", label: "守住诊棚，等追兵来", description: "把村民留在身后，用这一战换一个不会被灭口的证人。", tone: "steel", risk: "高", preview: [effectPreview("侠义", "+8", "good"), effectPreview("名望", "+6", "good"), effectPreview("气血", "-14", "bad")], check: { stat: "martial", label: "护棚检定", difficulty: 57 }, success: { lines: [line(state.turn, 3, "action", "你把第一骑逼进井边泥地，余下的人终于不敢再向诊棚放箭。")], effects: { stats: { chivalry: 8, fame: 6 }, health: -14, clues: 1, heat: 8 } }, failure: { lines: [line(state.turn, 3, "narrative", "诊棚保住了，你肩头也多了一道深可见骨的伤。医者把最后一枚铜纹塞进你掌心。")], effects: { stats: { chivalry: 4 }, health: -24, clues: 1, heat: 12 } } }),
    ],
  });
};

const buildRecovery = (state: NovelState): NovelEvent => {
  const location = currentLocation(state);
  return eventBase(state, {
    id: "sandbox-recovery",
    eyebrow: "江湖间章",
    title: "把呼吸还给自己",
    subtitle: `${location.name} · 雨歇`,
    locationId: location.id,
    mood: "moon",
    lines: [
      line(state.turn, 0, "narrative", `${location.name}暂时安静下来，你终于有时间检查自己的伤口。`),
      line(state.turn, 1, "inner", "真正的江湖不是一直拔刀，而是知道何时把刀放在手边。"),
    ],
    choices: [
      choice(state, { id: "recover", label: "闭目调息", description: "恢复状态，错过一点风声，但不会错过下一站。", tone: "jade", risk: "低", preview: [effectPreview("气血", "+24", "good"), effectPreview("风声", "-8", "good")], success: { lines: [line(state.turn, 2, "action", "你听着檐下的水滴，把气息一点点调回胸口。")], effects: { health: 24, heat: -8, stats: { insight: 2 } } } }),
      choice(state, { id: "train", label: "磨一遍旧招", description: "用时间换修为，伤口不会立刻痊愈。", tone: "steel", risk: "中", preview: [effectPreview("武艺", "+6", "good"), effectPreview("气血", "-6", "bad")], check: { stat: "martial", label: "专注检定", difficulty: 45 }, success: { lines: [line(state.turn, 2, "action", "你把旧招拆成最小的一步，重新找回了身体里的节拍。")], effects: { stats: { martial: 6 }, health: -6, level: 1 } }, failure: { lines: [line(state.turn, 2, "narrative", "旧伤提醒你别急，但你仍从一次失衡里找到了新的发力角度。")], effects: { stats: { martial: 2, insight: 3 }, health: -10 } } }),
      choice(state, { id: "gather-news", label: "去附近听风", description: "让故事继续往前走，风声也可能把敌人带来。", tone: "gold", risk: "中", preview: [effectPreview("线索", "+1", "good"), effectPreview("名望", "+3", "good"), effectPreview("风声", "+8", "bad")], success: { lines: [line(state.turn, 2, "narrative", "你在街角听到几段人物近况与门派往来，立刻记下其中能互相印证的部分。")], effects: { clues: 1, stats: { fame: 3 }, heat: 8 } } }),
    ],
  });
};

const buildGeneric = (state: NovelState, rng: Rng): NovelEvent => {
  const location = currentLocation(state);
  const verbs = ["渡口的灯忽明忽暗", "山风卷来陌生的香气", "街角有人叫出你的名字", "一枚旧物落在脚边"];
  const focus = rng.pick(verbs);
  return eventBase(state, {
    id: `sandbox-wandering:${state.turn + 1}`,
    eyebrow: `第${state.turn + 1}回 · 在地行旅`,
    title: "路上总有未完的一句",
    subtitle: `${location.name} · ${location.descriptor}`,
    locationId: location.id,
    mood: location.type === "city" ? "market" : "mist",
    lines: [line(state.turn, 0, "narrative", `${focus}，你知道这一回不会白走。`), line(state.turn, 1, "action", "远处有人吹了一声短哨，像是在等一个迟到的人。")],
    choices: [
      choice(state, { id: "wander-observe", label: "停下观察", description: "多看一眼，往往比快走一步更接近真相。", tone: "jade", risk: "低", preview: [effectPreview("洞察", "+4", "good"), effectPreview("线索", "+1", "good")], success: { lines: [line(state.turn, 2, "action", "你没有急着回应，先记住了风向与脚印。")], effects: { stats: { insight: 4 }, clues: 1 } } }),
      choice(state, { id: "wander-help", label: "出手相助", description: "把陌生人的麻烦接到自己身上，江湖会记得这份快意。", tone: "steel", risk: "中", preview: [effectPreview("侠义", "+6", "good"), effectPreview("名望", "+4", "good"), effectPreview("气血", "-10", "bad")], check: { stat: "chivalry", label: "侠义检定", difficulty: 48 }, success: { lines: [line(state.turn, 2, "action", "你替那人挡下追来的鞭影，掌心留下了一道细痕。")], effects: { stats: { chivalry: 6, fame: 4 }, health: -10, heat: 4 } }, failure: { lines: [line(state.turn, 2, "narrative", "你赶到时只来得及捡起一枚掉落的令牌，至少没有让线索消失。")], effects: { stats: { insight: 2 }, clues: 1, health: -5 } } }),
      choice(state, { id: "wander-bargain", label: "顺势做一笔交易", description: "把眼前的混乱变成资源，走得更远需要一点现实。", tone: "gold", risk: "低", preview: [effectPreview("银两", "+14", "good"), effectPreview("机缘", "+4", "good")], success: { lines: [line(state.turn, 2, "action", "你用一张旧地图换来盘缠和一个不完整的方向。")], effects: { silver: 14, stats: { fortune: 4 } } } }),
    ],
  });
};

const characterForActor = (state: NovelState, actorId: string) => {
  const actor = state.world.actors.find((entry) => entry.id === actorId);
  return actor?.characterId
    ? state.narrative.cast.find((entry) => entry.id === actor.characterId)
    : undefined;
};

const companionFromCharacter = (character: StoryCharacter): Omit<NovelCompanion, "joinedTurn"> => ({
  id: `companion_${character.id}`,
  characterId: character.id,
  name: character.name,
  title: character.title,
  trait: `${character.role} · 独门招式“${character.signatureMove}”`,
  affinity: 46,
  portrait: character.portrait,
});

type CharacterEventArchetype = "track" | "protect" | "challenge" | "liaison" | "feud" | "debt" | "tutelage" | "kinship";

const strongestRelationBetween = (state: NovelState, actorId: string, secondActorId?: string) => (
  secondActorId
    ? state.world.relations
      .filter((entry) => entry.fromActorId === actorId && entry.toActorId === secondActorId)
      .sort((left, right) => right.strength - left.strength)[0]
    : undefined
);

const goalArchetypeFor = (kind: NovelState["world"]["actors"][number]["goals"][number]["kind"] | undefined): CharacterEventArchetype => {
  if (["追踪", "寻证", "寻人"].includes(kind || "")) return "track";
  if (["保护", "巡守", "行医"].includes(kind || "")) return "protect";
  if (kind === "挑战") return "challenge";
  return "liaison";
};

const relationArchetypeFor = (type: NovelState["world"]["relations"][number]["type"]): CharacterEventArchetype => {
  if (["enemy", "rival"].includes(type)) return "feud";
  if (["master", "disciple"].includes(type)) return "tutelage";
  if (["debtor", "creditor", "protector"].includes(type)) return "debt";
  return "kinship";
};

const buildSandboxCharacterEvent = (
  state: NovelState,
  actorId: string,
  secondActorId: string | undefined,
  targetLocationId: string,
  archetype: CharacterEventArchetype,
): NovelEvent => {
  const actor = state.world.actors.find((entry) => entry.id === actorId)!;
  const character = characterForActor(state, actorId)!;
  const secondActor = secondActorId ? state.world.actors.find((entry) => entry.id === secondActorId) : undefined;
  const relation = strongestRelationBetween(state, actor.id, secondActor?.id);
  const location = currentLocation(state, targetLocationId);
  const goal = actor.goals[0];
  const targetName = secondActor?.name || "那个尚未露面的经手人";
  const alreadyCompanion = state.companions.some((entry) => entry.characterId === character.id);
  const canJoin = state.companions.length < 2 && !alreadyCompanion;
  const eventId = `sandbox-${archetype}:${actor.id}${secondActor ? `:${secondActor.id}` : ""}:${state.turn + 1}`;
  const common = {
    id: eventId,
    eyebrow: `第${state.turn + 1}回 · 人在途中`,
    subtitle: `${location.name} · ${goal?.kind || "行旅"}`,
    locationId: location.id,
    mood: (location.type === "city" || location.type === "inn" ? "market" : location.danger >= 60 ? "storm" : "mist") as EventMood,
  };
  const relationHint = secondActor
    ? relation?.knownToHero
      ? relation.description
      : `${actor.name}与${secondActor.name}只对视一瞬，称呼却比初见之人少了一层客套。`
    : `${actor.name}循着自己的目标来到此处，显然已在路上追了很久。`;

  if (archetype === "track") {
    return eventBase(state, {
      ...common,
      title: `${actor.name}追的不是人，是一串被改过的脚印`,
      lines: [
        line(state.turn, 0, "narrative", `${location.descriptor}檐角、泥痕与一枚倒扣的旧印彼此矛盾，像有人故意把去路写反。`),
        line(state.turn, 1, "action", `${actor.name}蹲在痕迹边，没有寒暄，只把最可疑的一处指给你看。`),
        line(state.turn, 2, "dialogue", `“我要找的是${goal?.reason || character.desire}，可这条路上有人借我的名号做了别的事。”`, actor.name),
        ...(secondActor ? [line(state.turn, 3, "inner", relationHint)] : []),
      ],
      choices: [
        choice(state, {
          id: `sandbox-track:${actor.id}`,
          label: "循旧痕替他追下去",
          description: "把脚印、折枝和行人证词合成一条真实去路。",
          tone: "jade",
          risk: "中",
          preview: [effectPreview("洞察", "+6", "good"), effectPreview("线索", "+1", "good")],
          check: { stat: "insight", label: "寻踪", difficulty: 47 + Math.round(location.danger * 0.06) },
          success: { lines: [line(state.turn, 4, "action", "你从一处故意踩深的脚印里认出反向发力，真正的去路藏在浅痕那边。")], effects: { stats: { insight: 6 }, clues: 1 } },
          failure: { lines: [line(state.turn, 4, "narrative", "痕迹在水边断了，你虽没追上人，却记住了对方改路时留下的习惯。")], effects: { stats: { insight: 3 }, heat: 4 } },
        }),
        choice(state, {
          id: `sandbox-lure:${actor.id}`,
          label: "放出假消息，引冒名者回头",
          description: "让风声替你赶路；局面会更快，也更容易惊动旁人。",
          tone: "gold",
          risk: "高",
          preview: [effectPreview("机缘", "+6", "good"), effectPreview("名望", "+4", "good"), effectPreview("风声", "+8", "bad")],
          check: { stat: "fortune", label: "设饵", difficulty: 54 },
          success: { lines: [line(state.turn, 4, "action", "假消息刚过两座茶摊，便有人急着回头抹去一枚本不该存在的印记。")], effects: { stats: { fortune: 6, fame: 4 }, clues: 1, heat: 8 } },
          failure: { lines: [line(state.turn, 4, "narrative", "饵被太多人听见，冒名者没有现身，你和他却先成了街谈里的主角。")], effects: { stats: { fame: 2 }, heat: 12 } },
        }),
        choice(state, {
          id: `sandbox-warn:${actor.id}`,
          label: `先去提醒${targetName}`,
          description: "不抢这条线索，先阻止下一场误认或伏击。",
          tone: "steel",
          risk: "中",
          preview: [effectPreview("侠义", "+6", "good"), effectPreview("关系", "留情", "good")],
          check: { stat: "chivalry", label: "抢先一步", difficulty: 49 },
          success: { lines: [line(state.turn, 4, "action", `你赶在风声之前送出提醒，${actor.name}没有拦你，只把这份先后记在心里。`)], effects: { stats: { chivalry: 6 }, heat: -3 } },
          failure: { lines: [line(state.turn, 4, "narrative", "提醒晚到半步，所幸收信人留下了反向追查的暗号。")], effects: { stats: { chivalry: 3, insight: 2 }, health: -5 } },
        }),
      ],
    });
  }

  if (archetype === "protect") {
    return eventBase(state, {
      ...common,
      title: `${actor.name}护着一程不肯写进名册的路`,
      lines: [
        line(state.turn, 0, "narrative", `${location.descriptor}一辆蒙布小车停在背风处，车辙边既有药渍，也有刀尖试探过的白痕。`),
        line(state.turn, 1, "action", `${actor.name}守在车与来路之间，真正要护送的是伤者、药材，还是一封信，暂时无人说破。`),
        line(state.turn, 2, "dialogue", `“我只求${goal?.reason || character.desire}。前面那段路，不能再照常走。”`, actor.name),
        ...(secondActor ? [line(state.turn, 3, "inner", relationHint)] : []),
      ],
      choices: [
        choice(state, {
          id: `sandbox-guard:${actor.id}`,
          label: "接过最险的一程",
          description: "与他分守前后，把伏击真正拦在护送之物之外。",
          tone: "steel",
          risk: "高",
          preview: [effectPreview("侠义", "+7", "good"), effectPreview("关系", "+信任", "good"), effectPreview("气血", "-12", "bad")],
          check: { stat: "martial", label: "护送", difficulty: 50 + Math.round(location.danger * 0.08) },
          success: { lines: [line(state.turn, 4, "action", "第一支暗箭落地时，你已经换到车后；前后两道防线没有给伏者留下第二次试探。")], effects: { stats: { martial: 4, chivalry: 7, fame: 3 }, health: -12, ...(canJoin ? { companion: companionFromCharacter(character) } : {}) } },
          failure: { lines: [line(state.turn, 4, "narrative", "车保住了，你肩上却替蒙布里的人挨下一记；这份伤也替你换来了一句真话。")], effects: { stats: { chivalry: 5, insight: 3 }, health: -20 } },
        }),
        choice(state, {
          id: `sandbox-tend:${actor.id}`,
          label: "先辨药渍，再救车中人",
          description: "从伤势判断追兵的手法，也让护送不必只靠硬拼。",
          tone: "jade",
          risk: "低",
          preview: [effectPreview("洞察", "+5", "good"), effectPreview("气血", "+8", "good")],
          check: { stat: "insight", label: "辨伤", difficulty: 44 },
          success: { lines: [line(state.turn, 4, "action", "你认出伤口并非刀伤，而是细索勒出的痕迹；追兵惯用的兵器和人数由此都有了轮廓。")], effects: { stats: { insight: 5, chivalry: 3 }, health: 8, clues: 1 } },
        }),
        choice(state, {
          id: `sandbox-decoy:${actor.id}`,
          label: "带着空车引开盯梢者",
          description: "把真正要护的人留在暗处，自己去承受被追上的风险。",
          tone: "gold",
          risk: "高",
          preview: [effectPreview("机缘", "+5", "good"), effectPreview("风声", "+10", "bad")],
          check: { stat: "fortune", label: "调虎离山", difficulty: 56 },
          success: { lines: [line(state.turn, 4, "action", "空车在岔路扬起尘土，追兵果然全数跟来；等他们看清车帘，你早已从林后脱身。")], effects: { stats: { fortune: 5, fame: 4 }, heat: 10 } },
          failure: { lines: [line(state.turn, 4, "narrative", "盯梢者分出一人折返，你只能半途回援；护送仍成了，只是没人再敢低估代价。")], effects: { stats: { chivalry: 4 }, health: -15, heat: 8 } },
        }),
      ],
    });
  }

  if (archetype === "challenge") {
    return eventBase(state, {
      ...common,
      title: `${actor.name}在地上划了一道只容两人越过的线`,
      lines: [
        line(state.turn, 0, "narrative", `${location.descriptor}围观者没有围成圈，只远远让出一块足够出招的空地。`),
        line(state.turn, 1, "dialogue", `“我来此只为${goal?.reason || character.desire}。规矩可以商量，胜负不能代答。”`, actor.name),
        line(state.turn, 2, "action", `${actor.name}亮出“${character.signatureMove}”：${character.signatureDescription}`),
        ...(secondActor ? [line(state.turn, 3, "inner", `${secondActor.name}站在界线另一端。${relationHint}`)] : []),
      ],
      choices: [
        choice(state, {
          id: `sandbox-confront:${actor.id}`,
          label: "越线接下这场约战",
          description: "真正交手分出胜负；你会见到独门招式的起落与破绽。",
          tone: "steel",
          risk: "高",
          preview: [effectPreview("武艺", "+6", "good"), effectPreview("观摩", character.signatureMove, "good"), effectPreview("气血", "-14", "bad")],
          check: { stat: "martial", label: "应战", difficulty: 51 + Math.round(location.danger * 0.08) },
          success: { lines: [line(state.turn, 4, "dialogue", "“好。下一次见面，我会换一条你没见过的劲路。”", actor.name)], effects: { stats: { martial: 6, fame: 4 }, health: -14 } },
          failure: { lines: [line(state.turn, 4, "narrative", `你没压住“${character.signatureMove}”，却把它转折时最轻的一次换气记进了身体。`)], effects: { stats: { martial: 3, insight: 4 }, health: -22 } },
        }),
        choice(state, {
          id: `sandbox-terms:${actor.id}`,
          label: "先问清为何而战",
          description: "把伤亡、见证与收手的规矩定在出招之前。",
          tone: "jade",
          risk: "中",
          preview: [effectPreview("洞察", "+5", "good"), effectPreview("关系", "立约", "good")],
          check: { stat: "insight", label: "定约", difficulty: 48 },
          success: { lines: [line(state.turn, 4, "action", "你问出的第三句话让围观者安静下来：原来这一战要争的不是名次，而是谁替一次旧败背了黑锅。")], effects: { stats: { insight: 5, chivalry: 3 }, clues: 1, heat: -2 } },
          failure: { lines: [line(state.turn, 4, "narrative", "规矩定下了，真正的缘由仍没人肯说；至少这场约战不会以性命收尾。")], effects: { stats: { chivalry: 3 }, heat: 2 } },
        }),
        choice(state, {
          id: `sandbox-witness:${actor.id}`,
          label: "请在场旧识作证",
          description: "让约战成为一桩可追溯的江湖事实，而非又一段各说各话。",
          tone: "gold",
          risk: "中",
          preview: [effectPreview("名望", "+6", "good"), effectPreview("线索", "+1", "good")],
          check: { stat: "fame", label: "请证", difficulty: 50 },
          success: { lines: [line(state.turn, 4, "action", `${secondActor?.name || "一位路过旧识"}终于开口补全前因，地上的界线也从挑衅变成一纸公开约定。`)], effects: { stats: { fame: 6 }, clues: 1 } },
          failure: { lines: [line(state.turn, 4, "narrative", "无人肯替这场旧事署名，你却记住了人群里那个始终不敢抬头的人。")], effects: { stats: { insight: 3, fame: 2 } } },
        }),
      ],
    });
  }

  if (archetype === "liaison") {
    return eventBase(state, {
      ...common,
      title: `${actor.name}等来了一封比送信人更晚的信`,
      lines: [
        line(state.turn, 0, "narrative", `${location.descriptor}一封折角密信在几双手之间转过，火漆完整，纸边却沾着两处不同的泥。`),
        line(state.turn, 1, "action", `${actor.name}没有立刻拆信，只先问清每一位经手人从哪里来。`),
        line(state.turn, 2, "dialogue", `“此行本为${goal?.reason || character.desire}。若信是真的，有人失约；若信是假的，有人正等我误会。”`, actor.name),
        ...(secondActor ? [line(state.turn, 3, "inner", relationHint)] : []),
      ],
      choices: [
        choice(state, {
          id: `sandbox-deliver:${actor.id}`,
          label: "替他把回信送到",
          description: "沿真实道路完成联络，也可能在下一处见到收信之人。",
          tone: "jade",
          risk: "中",
          preview: [effectPreview("关系", "+信任", "good"), effectPreview("名望", "+4", "good"), ...(canJoin ? [effectPreview("可能", "同行", "neutral")] : [])],
          check: { stat: "chivalry", label: "践诺", difficulty: 46 },
          success: { lines: [line(state.turn, 4, "action", "你当面复述回信，没有添一句自己的解释；收信人沉默良久，终于把旧约的另一半交给你。")], effects: { stats: { chivalry: 5, fame: 4 }, clues: 1, ...(canJoin ? { companion: companionFromCharacter(character) } : {}) } },
          failure: { lines: [line(state.turn, 4, "narrative", "你赶到时约定之处已经空了，石缝里却留着只有原收信人才懂的改期暗号。")], effects: { stats: { insight: 3 }, heat: 3 } },
        }),
        choice(state, {
          id: `sandbox-mediate:${actor.id}`,
          label: secondActor ? `请${secondActor.name}当面把旧约说完` : "把两封信放在一起对读",
          description: "不替任何人传话，让被省去的半句重新回到原主面前。",
          tone: "gold",
          risk: "中",
          preview: [effectPreview("洞察", "+5", "good"), effectPreview("关系", "解结", "good")],
          check: { stat: "insight", label: "解结", difficulty: 51 },
          success: { lines: [line(state.turn, 4, "action", "两封信的折痕恰好相合，真正被人替换的不是正文，而是落款前最后一句。")], effects: { stats: { insight: 5, chivalry: 3 }, clues: 1, heat: -4 } },
          failure: { lines: [line(state.turn, 4, "narrative", "旧约没有解开，双方却至少承认信曾被第三个人碰过；误会从此有了可以追查的缝。")], effects: { stats: { insight: 3 }, heat: 2 } },
        }),
        choice(state, {
          id: `sandbox-shadow:${actor.id}`,
          label: "跟住那个过分干净的送信人",
          description: "暂不拆信，先看看谁急着知道它有没有送到。",
          tone: "ink",
          risk: "高",
          preview: [effectPreview("线索", "+1", "good"), effectPreview("机缘", "+5", "good"), effectPreview("风声", "+6", "bad")],
          check: { stat: "fortune", label: "尾随", difficulty: 55 },
          success: { lines: [line(state.turn, 4, "action", "送信人绕过两条无人的巷子，最终在一扇从未开过的侧门前敲了三下。")], effects: { stats: { fortune: 5, insight: 3 }, clues: 1, heat: 6 } },
          failure: { lines: [line(state.turn, 4, "dialogue", "“跟到这里便够了。再往前，你会替别人背上我的名字。”", actor.name)], effects: { stats: { insight: 2 }, heat: 9 } },
        }),
      ],
    });
  }

  const relationText = relation?.knownToHero
    ? relation.description
    : `${actor.name}与${secondActor?.name || "另一位旧识"}之间显然隔着一段从未写进公开名册的往事。`;

  if (archetype === "feud") {
    return eventBase(state, {
      ...common,
      title: `${actor.name}与${secondActor?.name || "旧敌"}把同一笔旧账说成了两种样子`,
      lines: [
        line(state.turn, 0, "narrative", `${location.descriptor}两边都没有拔刀，地上的碎盏却已把人群分成了界线。`),
        line(state.turn, 1, "action", relationText),
        line(state.turn, 2, "dialogue", "“今日若只问谁先动手，这笔账便永远算不清。”", actor.name),
      ],
      choices: [
        choice(state, {
          id: `sandbox-separate:${actor.id}`,
          label: "先把两边的人分开",
          description: "止住眼前冲突，再让证词有机会被听见。",
          tone: "jade",
risk: "中",
          preview: [effectPreview("侠义", "+6", "good"), effectPreview("关系", "止战", "good")],
          check: { stat: "chivalry", label: "止争", difficulty: 52 },
          success: { lines: [line(state.turn, 3, "action", "你用刀鞘压住桌沿，没有替任何一边下结论，只让第一句完整证词终于说完。")], effects: { stats: { chivalry: 6, insight: 2 }, heat: -5 } },
          failure: { lines: [line(state.turn, 3, "narrative", "人是分开了，怒气却各自带走；你只来得及记住两边都刻意避开的那个名字。")], effects: { stats: { insight: 3 }, health: -8, heat: 5 } },
        }),
        choice(state, {
          id: `sandbox-back:${actor.id}`,
          label: `站到${actor.name}这一边`,
          description: "明确承担立场，换来信任，也接下对面的敌意。",
          tone: "steel",
risk: "高",
          preview: [effectPreview("关系", "+信任", "good"), effectPreview("风声", "+9", "bad")],
          check: { stat: "martial", label: "压阵", difficulty: 54 },
          success: { lines: [line(state.turn, 3, "action", `你没有替${actor.name}辩白，只向前站了半步；对面的人由此知道，今日再动手便要多算一位。`)], effects: { stats: { martial: 4, fame: 4 }, health: -9, heat: 9 } },
          failure: { lines: [line(state.turn, 3, "narrative", "你接下了立场，却没接住突然飞来的暗器；旧仇从此也分了一角到你身上。")], effects: { stats: { chivalry: 3 }, health: -16, heat: 11 } },
        }),
        choice(state, {
          id: `sandbox-proof:${actor.id}`,
          label: "去找双方都不愿提的证物",
          description: "暂不评理，从碎盏、旧伤与旁证里追一条第三条路。",
          tone: "gold",
risk: "中",
          preview: [effectPreview("洞察", "+6", "good"), effectPreview("线索", "+1", "good")],
          check: { stat: "insight", label: "寻证", difficulty: 50 },
          success: { lines: [line(state.turn, 3, "action", "碎盏底部沾着另一家客栈的红泥，证明今日这场冲突早在两地之外便有人安排。")], effects: { stats: { insight: 6 }, clues: 1 } },
          failure: { lines: [line(state.turn, 3, "narrative", "证物被人抢先收走，只剩一段割断的细绳；至少第三只手已不再只是猜测。")], effects: { stats: { insight: 3 }, heat: 3 } },
        }),
      ],
    });
  }

  if (archetype === "debt") {
    return eventBase(state, {
      ...common,
      title: `${actor.name}带来的不是银票，是一笔没人敢代还的人情`,
      lines: [
        line(state.turn, 0, "narrative", `${location.descriptor}桌上只有一只空药瓶和一枚旧扣，偏比满箱银两更让人不敢先伸手。`),
        line(state.turn, 1, "action", relationText),
        line(state.turn, 2, "dialogue", `“欠的若只是钱，我早就还了。难的是${secondActor?.name || "那个人"}当年替我选了活路。”`, actor.name),
      ],
      choices: [
        choice(state, {
          id: `sandbox-repay:${actor.id}`,
          label: "替他走完当年没走的那段路",
          description: "用一次实际行动偿还旧情，不把人情折算成价码。",
          tone: "jade",
risk: "中",
          preview: [effectPreview("侠义", "+7", "good"), effectPreview("关系", "还情", "good")],
          check: { stat: "chivalry", label: "还情", difficulty: 49 },
          success: { lines: [line(state.turn, 3, "action", "你把旧扣送回该去的人手里，没有替任何人说谢；对方收下时，终于撤掉门后的暗弩。")], effects: { stats: { chivalry: 7, fame: 3 }, heat: -4 } },
          failure: { lines: [line(state.turn, 3, "narrative", "旧扣送到了，收下的人却只问了一句：他为何不亲自来？这笔人情因此更清楚，也更难。")], effects: { stats: { chivalry: 4, insight: 2 }, heat: 3 } },
        }),
        choice(state, {
          id: `sandbox-broker:${actor.id}`,
          label: "把旧债改成一桩新约",
          description: "让双方各自承诺一件能做到的事，结束无穷无尽的亏欠。",
          tone: "gold",
risk: "中",
          preview: [effectPreview("名望", "+5", "good"), effectPreview("关系", "新约", "good")],
          check: { stat: "fame", label: "作保", difficulty: 53 },
          success: { lines: [line(state.turn, 3, "action", "旧药瓶被收回，新约只写了两行；短得没人能再假装看不懂。")], effects: { stats: { fame: 5, chivalry: 3 }, heat: -3 } },
          failure: { lines: [line(state.turn, 3, "narrative", "没人肯在新约上先落名，你的作保却让双方第一次承认，旧债不能再拖给下一人。")], effects: { stats: { fame: 2, insight: 2 } } },
        }),
        choice(state, {
          id: `sandbox-reveal:${actor.id}`,
          label: "问清那次救命究竟发生了什么",
          description: "揭开被恩情遮住的事实，答案可能让双方都不舒服。",
          tone: "ink",
risk: "高",
          preview: [effectPreview("洞察", "+7", "good"), effectPreview("线索", "+1", "good")],
          check: { stat: "insight", label: "追问旧事", difficulty: 56 },
          success: { lines: [line(state.turn, 3, "action", "药瓶夹层里藏着另一味药的残香：当年那场救命并非偶遇，而是有人提前知道追杀会来。")], effects: { stats: { insight: 7 }, clues: 1, heat: 4 } },
          failure: { lines: [line(state.turn, 3, "dialogue", "“今日说到这里已经够多，再问下去，欠债的人就不只我们两个了。”", actor.name)], effects: { stats: { insight: 3 }, heat: 6 } },
        }),
      ],
    });
  }

  if (archetype === "tutelage") {
    return eventBase(state, {
      ...common,
      title: `${actor.name}只教了半招，${secondActor?.name || "旧徒"}却记了许多年`,
      lines: [
        line(state.turn, 0, "narrative", `${location.descriptor}两道足印在同一块青砖上起势，收势却一南一北。`),
        line(state.turn, 1, "action", relationText),
        line(state.turn, 2, "dialogue", "“师承不是谁像谁。真正难还的是，那半招之后各自走成了什么人。”", actor.name),
      ],
      choices: [
        choice(state, {
          id: `sandbox-ask-teach:${actor.id}`,
          label: "请他把缺的半招补完",
          description: "当面求教，不靠偷看；能学多少取决于你是否懂得这招为何被截断。",
          tone: "jade",
risk: "中",
          preview: [effectPreview("新悟", character.signatureMove, "good"), effectPreview("武艺", "+5", "good")],
          check: { stat: "insight", label: "问艺", difficulty: 54 },
          success: { lines: [line(state.turn, 3, "action", `${actor.name}没有重演招式，只改了你起手时肩头的一寸；那半招的门由此真正打开。`)], effects: { stats: { insight: 5, martial: 4 }, item: `亲授札记·${character.signatureMove}` } },
          failure: { lines: [line(state.turn, 3, "narrative", "你照形学会了起手，却在收势处明白：缺的并非动作，而是两人谁也不肯说的那句诀。")], effects: { stats: { martial: 2, insight: 3 } } },
        }),
        choice(state, {
          id: `sandbox-compare:${actor.id}`,
          label: "把两人的劲路并排拆开",
          description: "不争正统，只看同一师承为何长成两种完全不同的打法。",
          tone: "steel",
risk: "高",
          preview: [effectPreview("武艺", "+6", "good"), effectPreview("洞察", "+4", "good")],
          check: { stat: "martial", label: "拆招", difficulty: 57 },
          success: { lines: [line(state.turn, 3, "action", "你各接一式，终于看清一人把退路藏在攻势里，另一人却把攻势藏在退路里。")], effects: { stats: { martial: 6, insight: 4 }, health: -10 } },
          failure: { lines: [line(state.turn, 3, "narrative", "两股劲在你臂间撞散，疼痛却把差别记得比纸笔更牢。")], effects: { stats: { martial: 3, insight: 2 }, health: -18 } },
        }),
        choice(state, {
          id: `sandbox-keep-secret:${actor.id}`,
          label: "替这段秘密师承守口",
          description: "不取招式，只让一段未公开的关系暂时免于门派争夺。",
          tone: "ink",
risk: "低",
          preview: [effectPreview("侠义", "+5", "good"), effectPreview("关系", "+信任", "good")],
          success: { lines: [line(state.turn, 3, "action", "你抹去青砖上的多余足印，只把两人各自离开的方向记在心里。")], effects: { stats: { chivalry: 5 }, heat: -5 } },
        }),
      ],
    });
  }

  return eventBase(state, {
    ...common,
    title: `${actor.name}与${secondActor?.name || "旧识"}都带着同一句没说完的话`,
    lines: [
      line(state.turn, 0, "narrative", `${location.descriptor}两人隔着一张空桌落座，桌上没有兵刃，沉默却比兵刃更占地方。`),
      line(state.turn, 1, "action", relationText),
      line(state.turn, 2, "dialogue", "“江湖把我们叫成一种关系，可那不是事情的全部。”", actor.name),
    ],
    choices: [
      choice(state, {
        id: `sandbox-reconcile:${actor.id}`,
        label: "让他们各自说完一次",
        description: "不急着评断亲疏，把被打断多年的两段话放回同一张桌。",
        tone: "jade",
risk: "中",
        preview: [effectPreview("侠义", "+6", "good"), effectPreview("关系", "解结", "good")],
        check: { stat: "chivalry", label: "劝解", difficulty: 48 },
        success: { lines: [line(state.turn, 3, "action", "你只拦住一次插话，两段往事便终于在同一个结尾相遇。")], effects: { stats: { chivalry: 6, insight: 2 }, heat: -4 } },
        failure: { lines: [line(state.turn, 3, "narrative", "话都说完了，却没有立刻和好；至少下一次重逢不会再从误认开始。")], effects: { stats: { chivalry: 3, insight: 2 } } },
      }),
      choice(state, {
        id: `sandbox-carry-message:${actor.id}`,
        label: "替其中一人带走一句话",
        description: "不强求当场和解，让关系在真实行程里继续。",
        tone: "gold",
risk: "低",
        preview: [effectPreview("关系", "+信任", "good"), effectPreview("机缘", "+4", "good")],
        success: { lines: [line(state.turn, 3, "action", "你把那句话原样记下，没有替它润色；它将在下一次相逢时由原主自己承担。")], effects: { stats: { fortune: 4, chivalry: 3 } } },
      }),
      choice(state, {
        id: `sandbox-ask-truth:${actor.id}`,
        label: "追问两人都避开的旧事",
        description: "关系之下另有事实；揭开它，也可能伤到刚刚恢复的信任。",
        tone: "ink",
risk: "高",
        preview: [effectPreview("洞察", "+7", "good"), effectPreview("线索", "+1", "good")],
        check: { stat: "insight", label: "追问", difficulty: 55 },
        success: { lines: [line(state.turn, 3, "action", "你指出两段叙述里同一处空白，桌边的人终于承认，当年还有第三个人在场。")], effects: { stats: { insight: 7 }, clues: 1, heat: 3 } },
        failure: { lines: [line(state.turn, 3, "narrative", "问题落下后无人回答，但两人的目光同时偏向门外；沉默本身已经给了方向。")], effects: { stats: { insight: 3 }, heat: 5 } },
      }),
    ],
  });
};

const buildSandboxManual = (state: NovelState, manualId: string, targetLocationId: string): NovelEvent => {
  const manual = state.world.manuals.find((entry) => entry.id === manualId)!;
  const techniqueDefinition = state.world.techniques.find((entry) => entry.id === manual.techniqueIds[0]);
  const location = currentLocation(state, targetLocationId);
  return eventBase(state, {
    id: `sandbox-manual:${manual.id}:${state.turn + 1}`,
    eyebrow: `第${state.turn + 1}回 · 武学流转`,
    title: `${manual.name}出现在不该出现的地方`,
    subtitle: `${location.name} · 一册抄本，数重来路`,
    locationId: location.id,
    mood: "moon",
    lines: [
      line(state.turn, 0, "narrative", `${location.descriptor}一册没有署名的抄本被压在旧砖下。`),
      line(state.turn, 1, "action", manual.provenance),
      line(state.turn, 2, "inner", techniqueDefinition ? `图上所记正是“${techniqueDefinition.name}”：${techniqueDefinition.description}` : "招式图只剩半页，来源却还可追索。"),
    ],
    choices: [
      choice(state, {
        id: `sandbox-manual-learn:${manual.id}`,
        label: "依图修炼",
        description: "学习新招并记录来源；难度越高，走岔经脉的代价越大。",
        tone: "steel",
        risk: "高",
        preview: [effectPreview("新招", techniqueDefinition?.name || "残式", "good"), effectPreview("气血", "-12", "bad")],
        check: { stat: "martial", label: "修习检定", difficulty: techniqueDefinition?.difficulty || 56 },
        success: { lines: [line(state.turn, 3, "action", "你把图上每一段劲路都走了一遍，直到身体能分辨抄错的那一笔。")], effects: { stats: { martial: 6 }, health: -12, item: manual.name } },
        failure: { lines: [line(state.turn, 3, "narrative", "抄本有一笔倒行，你及时收势，仍被反震得气血翻涌。")], effects: { stats: { insight: 4, martial: 2 }, health: -22, item: manual.name } },
      }),
      choice(state, {
        id: `sandbox-manual-trace:${manual.id}`,
        label: "追查抄本来路",
        description: "不急着学招，先找出谁看过、谁抄错、谁故意放在这里。",
        tone: "jade",
        risk: "中",
        preview: [effectPreview("洞察", "+6", "good"), effectPreview("线索", "+1", "good")],
        success: { lines: [line(state.turn, 3, "action", "纸角、墨色和折痕分别指向三位经手人，秘籍从此有了一条可追的路。")], effects: { stats: { insight: 6 }, clues: 1, heat: 3 } },
      }),
      choice(state, {
        id: `sandbox-manual-leave:${manual.id}`,
        label: "留下抄本，只记破绽",
        description: "不带走秘籍，也不让这次机缘完全白过。",
        tone: "ink",
        risk: "低",
        preview: [effectPreview("侠义", "+4", "good"), effectPreview("洞察", "+3", "good")],
        success: { lines: [line(state.turn, 3, "narrative", "你把抄本封回原处，只抄走一行提醒后来者的批注。")], effects: { stats: { chivalry: 4, insight: 3 } } },
      }),
    ],
  });
};

type PlaceEventArchetype = "market" | "trail" | "mercy" | "sect";

const placeArchetypeFor = (location: NovelLocation): PlaceEventArchetype => {
  if (location.type === "sect") return "sect";
  if (["village", "clinic"].includes(location.type)) return "mercy";
  if (["bridge", "wild", "house"].includes(location.type)) return "trail";
  return "market";
};

const buildSandboxPlaceEvent = (
  state: NovelState,
  targetLocationId: string,
  archetype: PlaceEventArchetype,
): NovelEvent => {
  const location = currentLocation(state, targetLocationId);
  const common = {
    id: `sandbox-place-${archetype}:${location.id}:${state.turn + 1}`,
    eyebrow: `第${state.turn + 1}回 · 一地生事`,
    locationId: location.id,
    mood: (archetype === "market" ? "market" : archetype === "trail" ? "storm" : archetype === "mercy" ? "moon" : "mist") as EventMood,
  };

  if (archetype === "market") {
    return eventBase(state, {
      ...common,
      title: "一枚假令牌先于主人到了",
      subtitle: `${location.name} · 谣言有价，名字无主`,
      lines: [
        line(state.turn, 0, "narrative", `${location.descriptor}茶客们正在传看一枚门派令牌，人人都说见过它的主人，说出的相貌却没有两句相同。`),
        line(state.turn, 1, "action", "令牌边缘故意磨旧，系绳却是今晨才染的颜色；冒名者要的似乎不是钱，而是让某个名字先坏掉。"),
      ],
      choices: [
        choice(state, {
          id: `sandbox-place-verify:${location.id}`,
          label: "从旧印与系绳查起",
          description: "让物证先开口，找到真正制作这枚令牌的地方。",
          tone: "jade",
risk: "中",
          preview: [effectPreview("洞察", "+6", "good"), effectPreview("线索", "+1", "good")],
          check: { stat: "insight", label: "验物", difficulty: 49 },
          success: { lines: [line(state.turn, 2, "action", "你从染料里挑出一粒细砂，这种砂只会混进城南那口旧染缸。")], effects: { stats: { insight: 6 }, clues: 1 } },
          failure: { lines: [line(state.turn, 2, "narrative", "旧印做得太真，反倒说明制作者曾摸过原物；这条线索比辨出真假更危险。")], effects: { stats: { insight: 3 }, heat: 3 } },
        }),
        choice(state, {
          id: `sandbox-place-expose:${location.id}`,
          label: "当众拆穿这场冒名",
          description: "先保住被借用的名字，也让幕后人知道有人不肯旁观。",
          tone: "steel",
risk: "高",
          preview: [effectPreview("名望", "+6", "good"), effectPreview("侠义", "+5", "good"), effectPreview("风声", "+7", "bad")],
          check: { stat: "fame", label: "公断", difficulty: 53 },
          success: { lines: [line(state.turn, 2, "action", "你只问了三个能核对的问题，方才说得最响的人便悄悄放下令牌。")], effects: { stats: { fame: 6, chivalry: 5 }, heat: 7 } },
          failure: { lines: [line(state.turn, 2, "narrative", "人群不肯立刻相信，幕后人却因此急着补造第二个谎；新的破绽已经出现。")], effects: { stats: { fame: 2, insight: 3 }, heat: 10 } },
        }),
        choice(state, {
          id: `sandbox-place-trade:${location.id}`,
          label: "买下没人敢说完的后半句",
          description: "不争真假，先找出谁在花钱让这段传闻继续流动。",
          tone: "gold",
risk: "低",
          preview: [effectPreview("线索", "+1", "good"), effectPreview("银两", "-10", "bad")],
          success: { lines: [line(state.turn, 2, "action", "说书人收下银角，终于承认每次讲到同一处，窗外都会有人替他续茶。")], effects: { silver: -10, clues: 1, stats: { fortune: 4 } } },
        }),
      ],
    });
  }

  if (archetype === "trail") {
    return eventBase(state, {
      ...common,
      title: "血迹在路中央消失，行囊却留在岔口",
      subtitle: `${location.name} · 没有人在此等你`,
      lines: [
        line(state.turn, 0, "narrative", `${location.descriptor}半只行囊挂在枯枝上，包袱结是从里面割开的，血痕却在最显眼的路中央突然断掉。`),
        line(state.turn, 1, "inner", "这里或许有伤者、埋伏，也可能只有一场专门留给过路人的误导。"),
      ],
      choices: [
        choice(state, {
          id: `sandbox-place-follow:${location.id}`,
          label: "沿不带血的脚印追",
          description: "相信伤者仍能行走，去找那些刻意绕开官道的浅痕。",
          tone: "jade",
risk: "中",
          preview: [effectPreview("洞察", "+6", "good"), effectPreview("线索", "+1", "good")],
          check: { stat: "insight", label: "寻迹", difficulty: 51 + Math.round(location.danger * 0.05) },
          success: { lines: [line(state.turn, 2, "action", "浅痕绕过林石，最终停在一处能看见官道却不被官道看见的背坡。")], effects: { stats: { insight: 6 }, clues: 1 } },
          failure: { lines: [line(state.turn, 2, "narrative", "脚印被山风抹去，你只找到一片新折的衣角；失踪者至少还没有被拖着走。")], effects: { stats: { insight: 3 }, health: -5 } },
        }),
        choice(state, {
          id: `sandbox-place-ambush:${location.id}`,
          label: "把行囊放回去，等取物的人",
          description: "不追诱饵，在原地把主动权换回来。",
          tone: "steel",
risk: "高",
          preview: [effectPreview("武艺", "+5", "good"), effectPreview("名望", "+3", "good"), effectPreview("气血", "-10", "bad")],
          check: { stat: "martial", label: "反伏", difficulty: 55 },
          success: { lines: [line(state.turn, 2, "action", "暮色将合时，一只戴着旧茧的手从石后探向行囊，被你用刀鞘稳稳压住。")], effects: { stats: { martial: 5, fame: 3 }, health: -10, clues: 1 } },
          failure: { lines: [line(state.turn, 2, "narrative", "来人没有取行囊，只从远处放出一箭；你避开要害，也看清了箭尾的扎法。")], effects: { stats: { insight: 3 }, health: -18, heat: 4 } },
        }),
        choice(state, {
          id: `sandbox-place-return:${location.id}`,
          label: "把行囊送到最近的落脚处",
          description: "让失主多一个能循迹找回的地方，也听听附近谁认得包袱结。",
          tone: "gold",
risk: "低",
          preview: [effectPreview("侠义", "+5", "good"), effectPreview("机缘", "+4", "good")],
          success: { lines: [line(state.turn, 2, "action", "掌柜一眼认出包袱结来自另一处驿路，并说失主昨夜还在找一位同行者。")], effects: { stats: { chivalry: 5, fortune: 4 } } },
        }),
      ],
    });
  }

  if (archetype === "mercy") {
    return eventBase(state, {
      ...common,
      title: "药棚前排着人，最后一味药却没有回来",
      subtitle: `${location.name} · 伤者等不得江湖慢慢查`,
      lines: [
        line(state.turn, 0, "narrative", `${location.descriptor}几名伤者气息相似，像被同一种暗器所伤；药炉已经点起，采药人却迟迟没有归来。`),
        line(state.turn, 1, "action", "桌上留着半张药单，背面写着一句匆忙的提醒：别信送药的人。"),
      ],
      choices: [
        choice(state, {
          id: `sandbox-place-heal:${location.id}`,
          label: "先替伤者稳住气息",
          description: "不等药齐，从伤势里判断真正缺的是什么。",
          tone: "jade",
risk: "中",
          preview: [effectPreview("侠义", "+7", "good"), effectPreview("洞察", "+4", "good")],
          check: { stat: "insight", label: "急救", difficulty: 48 },
          success: { lines: [line(state.turn, 2, "action", "你封住几处逆行气穴，发现所谓毒伤其实混着极细的迷香；药单由此少了一味，也多出一个嫌疑人。")], effects: { stats: { chivalry: 7, insight: 4 }, health: 6, clues: 1 } },
          failure: { lines: [line(state.turn, 2, "narrative", "气息暂时稳住，你却被余毒带得胸口发闷；所幸伤者终于能说出遇袭地点。")], effects: { stats: { chivalry: 5 }, health: -8, clues: 1 } },
        }),
        choice(state, {
          id: `sandbox-place-herbs:${location.id}`,
          label: "沿药篓留下的叶屑寻人",
          description: "去找失约的采药人，也确认药材是否被人调换。",
          tone: "steel",
risk: "高",
          preview: [effectPreview("机缘", "+5", "good"), effectPreview("线索", "+1", "good"), effectPreview("气血", "-8", "bad")],
          check: { stat: "fortune", label: "寻药", difficulty: 54 },
          success: { lines: [line(state.turn, 2, "action", "叶屑在溪边转向，你找到被捆住的采药人，也找到一包专等人拿错的假药。")], effects: { stats: { fortune: 5, chivalry: 4 }, health: -8, clues: 1 } },
          failure: { lines: [line(state.turn, 2, "narrative", "你只追回半篓被水打湿的药材，数量不足，却足以先救最重的那一人。")], effects: { stats: { chivalry: 4 }, health: -12 } },
        }),
        choice(state, {
          id: `sandbox-place-question:${location.id}`,
          label: "扣下刚到的送药人",
          description: "顺着提醒先问身份；若错怪好人，药棚会失去最后的帮手。",
          tone: "gold",
risk: "中",
          preview: [effectPreview("洞察", "+5", "good"), effectPreview("风声", "+5", "bad")],
          check: { stat: "fame", label: "盘问", difficulty: 51 },
          success: { lines: [line(state.turn, 2, "action", "送药人答得出药性，却说错了采药时该走的山口；他背后的指使者由此露出半边影子。")], effects: { stats: { insight: 5, fame: 3 }, heat: 5, clues: 1 } },
          failure: { lines: [line(state.turn, 2, "narrative", "送药人确是好心，你当众道歉并亲自验药；这次误判没有酿成更坏的结果。")], effects: { stats: { chivalry: 3, insight: 2 }, heat: 3 } },
        }),
      ],
    });
  }

  return eventBase(state, {
    ...common,
    title: "山门里多出一张没有署名的传艺帖",
    subtitle: `${location.name} · 门规也是人写的`,
    lines: [
      line(state.turn, 0, "narrative", `${location.descriptor}告示墙上贴着一张传艺帖，写着要把某门招式传给外人；纸是真的，掌事印却只盖了一半。`),
      line(state.turn, 1, "inner", "有人要借门规压住这件事，也有人故意把争论放到所有人都看得见的地方。"),
    ],
    choices: [
      choice(state, {
        id: `sandbox-place-testify:${location.id}`,
        label: "请见过此招的人作证",
        description: "先确认传艺是否真实发生，再争论谁有资格。",
        tone: "jade",
risk: "中",
        preview: [effectPreview("洞察", "+6", "good"), effectPreview("名望", "+3", "good")],
        check: { stat: "insight", label: "辨证", difficulty: 50 },
        success: { lines: [line(state.turn, 2, "action", "三位见证人的说法在收势处完全不同，证明外传的只是招形，不是门中真正的诀。")], effects: { stats: { insight: 6, fame: 3 }, clues: 1 } },
        failure: { lines: [line(state.turn, 2, "narrative", "没人肯公开作证，却有一名年轻弟子悄悄把练错的起手演给你看。")], effects: { stats: { insight: 3, martial: 2 } } },
      }),
      choice(state, {
        id: `sandbox-place-rule:${location.id}`,
        label: "当众问门规为何而立",
        description: "不替传艺者开脱，只逼掌事者说清规矩保护的是谁。",
        tone: "steel",
risk: "高",
        preview: [effectPreview("侠义", "+6", "good"), effectPreview("名望", "+5", "good"), effectPreview("风声", "+6", "bad")],
        check: { stat: "chivalry", label: "问规", difficulty: 55 },
        success: { lines: [line(state.turn, 2, "action", "掌事者没有撤帖，却补上了一行此前从未公开的例外；争论第一次有了能落脚的地方。")], effects: { stats: { chivalry: 6, fame: 5 }, heat: 6 } },
        failure: { lines: [line(state.turn, 2, "narrative", "山门以沉默挡回问题，你的名字却从此与这场争论写在了一起。")], effects: { stats: { fame: 3, chivalry: 2 }, heat: 10 } },
      }),
      choice(state, {
        id: `sandbox-place-copy:${location.id}`,
        label: "只抄下争议招式的破绽",
        description: "不碰归属，把这场门内争论变成一次谨慎的观摩。",
        tone: "ink",
risk: "中",
        preview: [effectPreview("武艺", "+4", "good"), effectPreview("洞察", "+4", "good")],
        check: { stat: "martial", label: "观式", difficulty: 52 },
        success: { lines: [line(state.turn, 2, "action", "你没有照抄招形，只记下转腕时最容易泄力的一处；这页札记因此不属于任何门派。")], effects: { stats: { martial: 4, insight: 4 }, item: "传艺帖旁注" } },
        failure: { lines: [line(state.turn, 2, "narrative", "你看出招形缺了一截，却无法断定是藏私还是抄错；疑问被完整地留了下来。")], effects: { stats: { insight: 3 } } },
      }),
    ],
  });
};

const buildSandboxFallout = (state: NovelState): NovelEvent => {
  const location = currentLocation(state);
  const previous = state.history[state.history.length - 1];
  const rememberedChoice = previous?.choice || "上一回的选择";
  return eventBase(state, {
    id: `sandbox-fallout:${state.turn + 1}`,
    eyebrow: `第${state.turn + 1}回 · 风声回头`,
    title: "你留下的那一步，比你先到了下一站",
    subtitle: `${location.name} · 传闻从不照原话赶路`,
    locationId: location.id,
    mood: "market",
    lines: [
      line(state.turn, 0, "narrative", `${location.descriptor}街巷里已经有人讲起你“${rememberedChoice}”的事，只是开头、缘由和结果都被换了位置。`),
      line(state.turn, 1, "action", "说书人并不知道你就在檐下，旁听者却正根据这段传闻决定要不要改道。"),
    ],
    choices: [
      choice(state, {
        id: "sandbox-fallout-own",
        label: "站出来承认那一步是你所为",
        description: "承担真实选择，也把被夸大的部分当面纠正。",
        tone: "steel",
risk: "中",
        preview: [effectPreview("名望", "+6", "good"), effectPreview("风声", "+5", "bad")],
        check: { stat: "fame", label: "担名", difficulty: 49 },
        success: { lines: [line(state.turn, 2, "action", "你补完被省去的前因，人群未必都赞同，却没人再能把这一步安到另一个人头上。")], effects: { stats: { fame: 6, chivalry: 3 }, heat: 5 } },
        failure: { lines: [line(state.turn, 2, "narrative", "你的解释只被记住一半，但愿意核实的人已经开始追问另一半。")], effects: { stats: { fame: 3, insight: 2 }, heat: 7 } },
      }),
      choice(state, {
        id: "sandbox-fallout-correct",
        label: "追上最早传错的那个人",
        description: "不与整条街争辩，先找到传闻第一次变形的地方。",
        tone: "jade",
risk: "中",
        preview: [effectPreview("洞察", "+6", "good"), effectPreview("线索", "+1", "good")],
        check: { stat: "insight", label: "溯言", difficulty: 51 },
        success: { lines: [line(state.turn, 2, "action", "传闻一路倒退，最后停在一名从未见过现场、却收过茶钱的脚夫身上。")], effects: { stats: { insight: 6 }, clues: 1, heat: -2 } },
        failure: { lines: [line(state.turn, 2, "narrative", "源头没有找到，你却辨出哪一段是后来故意添上的；有人正借你的选择赶另一条路。")], effects: { stats: { insight: 3 }, clues: 1 } },
      }),
      choice(state, {
        id: "sandbox-fallout-use",
        label: "顺势把风声引向空路",
        description: "让盯着你的人追错方向，为真正相关的人争一段安静。",
        tone: "gold",
risk: "高",
        preview: [effectPreview("机缘", "+6", "good"), effectPreview("风声", "生变", "neutral")],
        check: { stat: "fortune", label: "借风", difficulty: 55 },
        success: { lines: [line(state.turn, 2, "action", "你只添了一个确有其地的假去处，尾随者便争先恐后替你把谎话送远。")], effects: { stats: { fortune: 6, insight: 2 }, heat: -7 } },
        failure: { lines: [line(state.turn, 2, "narrative", "空路骗走一批人，也引来一个比传闻更谨慎的观察者；风声没有散，只换了耳朵。")], effects: { stats: { fortune: 3 }, heat: 6 } },
      }),
    ],
  });
};

const uniqueChoices = (choices: NovelChoice[]) => choices.filter((entry, index, entries) => (
  entries.findIndex((candidate) => candidate.id === entry.id) === index
));

const buildCampaignTrainingEvent = (state: NovelState, activity: PlayerActivity): NovelEvent => {
  const location = currentLocation(state, activity.targetLocationId);
  const heroTechniques = state.world.actors.find((actor) => actor.id === "hero")?.techniques || [];
  const practiced = [...heroTechniques].sort((left, right) => left.mastery - right.mastery)[0];
  const technique = state.world.techniques.find((entry) => entry.id === practiced?.techniqueId)
    || state.world.techniques.find((entry) => entry.id === "hero_probe")!;
  const mentor = actorAtLocation(state.world, location.id)
    .find((actor) => actor.id !== "hero" && actor.factionId === "home")
    || state.world.actors.find((actor) => actor.id !== "hero" && actor.factionId === "home");
  const choices = [
    choice(state, {
      id: `campaign-train:${technique.id}:foundation`,
      label: `拆练“${technique.name}”的根基`,
      description: "按步法、吐纳和落点逐段练习，不靠一次顿悟跳过基本功。",
      tone: "steel",
      risk: "低",
      preview: [effectPreview("武艺", "+4", "good"), effectPreview("洞察", "+3", "good")],
      success: {
        lines: [line(state.turn, 3, "action", `你把“${technique.name}”拆成进步、换气与收势三段；练到日影越过木桩时，原先发飘的一处落点终于稳住。`)],
        effects: { stats: { martial: 4, insight: 3 }, health: -4 },
      },
    }),
    ...(mentor ? [choice(state, {
      id: `sandbox-ask-teach:${mentor.id}`,
      label: `请${mentor.title}${mentor.name}看一遍`,
      description: "让熟悉本门劲路的人指出具体破绽，也承担被当面纠正的尴尬。",
      tone: "jade",
      risk: "中",
      preview: [effectPreview("招式", "师授精进", "good"), effectPreview("关系", "同练", "good")],
      check: { stat: "insight", label: "领会", difficulty: 47 },
      success: {
        lines: [line(state.turn, 3, "dialogue", `“你不是出手慢，是前一口气收得太早。”${mentor.name}用剑鞘压住你的肘，等你照着新的吐纳再走一遍。`, mentor.name)],
        effects: { stats: { insight: 5, martial: 3 } },
      },
      failure: {
        lines: [line(state.turn, 3, "narrative", `${mentor.name}指出的问题你一时改不过来，却把错误发生在哪一步记得很清楚。`)],
        effects: { stats: { insight: 4, martial: 1 } },
      },
    })] : []),
    ...(mentor ? [choice(state, {
      id: `sandbox-duel:${mentor.id}:training`,
      label: `请${mentor.name}陪你拆十招`,
      description: "用十招实战验证练习成果；这是同门喂招，不以伤人为目的。",
      tone: "ember",
      risk: "高",
      preview: [effectPreview("实战", "逐招拆解", "good"), effectPreview("气血", "可能受伤", "bad")],
      check: { stat: "martial", label: "拆招", difficulty: 54 },
      success: {
        lines: [line(state.turn, 3, "action", `第十招收势时，${mentor.name}没有再替你补上空门，只把剑鞘往地上一点，算作认可。`)],
        effects: { stats: { martial: 6, fame: 2 }, health: -9 },
      },
      failure: {
        lines: [line(state.turn, 3, "narrative", `你在第七招被迫退开，却已经知道是哪一次换气让后面三招都慢了。`)],
        effects: { stats: { martial: 3, insight: 4 }, health: -14 },
      },
    })] : []),
  ];
  return eventBase(state, {
    id: `campaign-training:${mentor?.id || "solo"}:${state.turn + 1}`,
    eyebrow: `第${state.turn + 1}回 · 今日安排`,
    title: `你把今日留给了“${technique.name}”`,
    subtitle: `${location.name} · 本门修习`,
    locationId: location.id,
    mood: "mist",
    lines: [
      line(state.turn, 0, "narrative", `${location.descriptor}你在练功坪摆下三根木桩，分别记步法、发力与收势；今日要改的是哪一处，一开始便写得明白。`),
      line(state.turn, 1, "action", `“${technique.name}”眼下的火候来自${practiced?.source || "师授"}，你最不稳的是${technique.nature === "身" ? "换步后的呼吸" : "落招后的余劲"}。`),
      ...(mentor ? [line(state.turn, 2, "dialogue", `“我能替你看招，不能替你把这一遍练完。”`, mentor.name)] : []),
    ],
    choices: uniqueChoices(choices),
  });
};

const bondPrimaryChoice = (state: NovelState, actor: WorldActor, intent: PlayerIntent): NovelChoice => {
  const specs: Record<PlayerIntent, Parameters<typeof choice>[1]> = {
    befriend: {
      id: `campaign-bond:${actor.id}:befriend`,
      label: "替他分担今日手头的事",
      description: "从一起做一件具体小事开始，而不是凭一句投缘直接成为知己。",
      tone: "jade",
      risk: "低",
      preview: [effectPreview("关系", "信任渐长", "good"), effectPreview("侠义", "+3", "good")],
      success: { lines: [line(state.turn, 3, "action", `你没有追问${actor.name}为何迟疑，只把剩下的一半差事接过来；做完时，彼此已经有了下一次说话的由头。`)], effects: { stats: { chivalry: 3, insight: 2 } } },
    },
    romance: {
      id: `campaign-bond:${actor.id}:romance`,
      label: "邀他单独走一段山路",
      description: "表达亲近的心意，但不替对方预设回答；关系会按已有信任继续生长。",
      tone: "ember",
      risk: "中",
      preview: [effectPreview("关系", "情意可生", "good"), effectPreview("风声", "+2", "bad")],
      check: { stat: "chivalry", label: "坦诚", difficulty: 48 },
      success: { lines: [line(state.turn, 3, "narrative", `${actor.name}没有立刻给这段心意命名，只把原本要独自走的那段山路分给了你一半。`)], effects: { stats: { chivalry: 4, fortune: 3 }, heat: 2 } },
      failure: { lines: [line(state.turn, 3, "dialogue", `“让我先把自己的路想明白。我们仍可照常同练，不必把这句话装作没说过。”`, actor.name)], effects: { stats: { insight: 3 }, heat: 1 } },
    },
    revenge: {
      id: `sandbox-confront:${actor.id}`,
      label: "当面问清这笔仇",
      description: "若言语不足以交代，便以真实招式分出一场能被记住的胜负。",
      tone: "ember",
      risk: "高",
      preview: [effectPreview("实战", "逐招清算", "neutral"), effectPreview("关系", "可能决裂", "bad")],
      check: { stat: "martial", label: "清算", difficulty: 56 },
      success: { lines: [line(state.turn, 3, "action", `你把仇由何处起、要问哪一句写在出招之前；这一战至少不会再被旁人改成无缘无故的私斗。`)], effects: { stats: { martial: 5, fame: 3 }, health: -12, heat: 6 } },
      failure: { lines: [line(state.turn, 3, "narrative", `胜负没有替你回答旧事，却让你看清${actor.name}最不愿暴露的一条劲路。`)], effects: { stats: { martial: 2, insight: 4 }, health: -18, heat: 5 } },
    },
    learn: {
      id: `sandbox-ask-teach:${actor.id}`,
      label: `请教“${actor.techniques[0] ? state.world.techniques.find((entry) => entry.id === actor.techniques[0].techniqueId)?.name || "独门招式" : "独门招式"}”`,
      description: "先问招式为何这样使，再谈能否学；对方会记住这段师承。",
      tone: "steel",
      risk: "中",
      preview: [effectPreview("武学", "师授或留疑", "good"), effectPreview("关系", "请教", "good")],
      check: { stat: "insight", label: "求教", difficulty: 52 },
      success: { lines: [line(state.turn, 3, "dialogue", `“招形可以教，动机得由你自己找。”${actor.name}只演一遍，随后让你说出这一招本来要护住什么。`, actor.name)], effects: { stats: { insight: 5, martial: 3 } } },
      failure: { lines: [line(state.turn, 3, "narrative", `你记住了招形，却没能说服${actor.name}你已理解其中取舍；这门请教还没有结束。`)], effects: { stats: { insight: 3 } } },
    },
    observe: {
      id: `campaign-bond:${actor.id}:observe`,
      label: "先照常相处，不急着定下关系",
      description: "记住对方今日真正关心什么，把结交、爱慕或恩怨留到有依据时再选。",
      tone: "ink",
      risk: "低",
      preview: [effectPreview("洞察", "+4", "good"), effectPreview("关系", "保留余地", "neutral")],
      success: { lines: [line(state.turn, 3, "inner", `你没有把一次相处夸成命中注定，只记下${actor.name}在说到自己目标时停顿的那一息。`)], effects: { stats: { insight: 4 } } },
    },
  };
  return choice(state, specs[intent]);
};

const buildCampaignBondEvent = (state: NovelState, activity: PlayerActivity): NovelEvent => {
  const actor = state.world.actors.find((entry) => entry.id === activity.targetActorId)!;
  const character = characterForActor(state, actor.id);
  const location = currentLocation(state, actor.locationId);
  const lead = state.campaign.leads.find((entry) => entry.id === activity.leadId);
  const intent = lead?.intent || state.campaign.agenda?.intent || "befriend";
  const primary = bondPrimaryChoice(state, actor, intent);
  const alternatives = [
    choice(state, {
      id: `campaign-bond:${actor.id}:befriend`,
      label: "从一件具体小事重新相处",
      description: "不论原本心意为何，先用共同经历检验彼此是否值得信任。",
      tone: "jade",
      risk: "低",
      preview: [effectPreview("关系", "信任", "good")],
      success: { lines: [line(state.turn, 4, "action", `你与${actor.name}把手边的事做完，约好下次见面不必再从客套话开始。`)], effects: { stats: { chivalry: 3, insight: 2 } } },
    }),
    choice(state, {
      id: `campaign-defer:${actor.id}`,
      label: "把心意留到下一次",
      description: "暂停追寻不会抹掉关系；人物仍会按自己的目标移动。",
      tone: "ink",
      risk: "低",
      preview: [effectPreview("线索", "保留", "neutral"), effectPreview("时间", "世界继续", "neutral")],
      success: { lines: [line(state.turn, 4, "narrative", `你没有强留${actor.name}。对方按原定行程离开，这段关系被如实留在尚未决定的位置。`)], effects: { stats: { insight: 2 } } },
    }),
  ];
  return eventBase(state, {
    id: `campaign-bond-scene:${actor.id}:${state.turn + 1}`,
    eyebrow: `第${state.turn + 1}回 · 主动拜访`,
    title: `你来见${actor.name}，不是等一场偶遇`,
    subtitle: `${location.name} · ${intentLabel[intent]}`,
    locationId: location.id,
    mood: intent === "revenge" ? "storm" : intent === "romance" ? "moon" : "mist",
    lines: [
      line(state.turn, 0, "narrative", `${location.descriptor}${actor.name}正在${actor.activity === "赶路" ? "收拾行囊" : "处理今日手头的事"}，并不知道你已经循着行踪来到这里。`),
      line(state.turn, 1, "action", `你记得自己此行是为“${intentLabel[intent]}”而来，但这份心意只能决定你的做法，不能替${actor.name}决定回应。`),
      line(state.turn, 2, "dialogue", `“我眼下想做的是${character?.desire || actor.goals[0]?.reason || "把今日的路走完"}。你若愿意听，我们可以从这里说起。”`, actor.name),
    ],
    choices: uniqueChoices([primary, ...alternatives]),
  });
};

const buildCampaignTravelEvent = (state: NovelState, activity: PlayerActivity): NovelEvent => {
  const location = currentLocation(state, activity.targetLocationId);
  return eventBase(state, {
    id: `campaign-travel:${location.id}:${state.turn + 1}`,
    eyebrow: `第${state.turn + 1}回 · 自选行程`,
    title: `你主动把下一站定在${location.name}`,
    subtitle: `${location.region} · 沿路可达`,
    locationId: location.id,
    mood: location.type === "city" ? "market" : location.danger >= 60 ? "storm" : "mist",
    lines: [
      line(state.turn, 0, "narrative", `${location.descriptor}这不是被事件拖来的地点：你先在地图上定下去处，再沿相邻道路一步步赶到。`),
      line(state.turn, 1, "action", `抵达时，${actorAtLocation(state.world, location.id).filter((actor) => actor.id !== "hero").length ? "已有江湖人物在此停留" : "此地暂时没有熟人"}；地方本身仍有可做的事。`),
    ],
    choices: [
      choice(state, { id: `campaign-travel-observe:${location.id}`, label: "先认清街巷与退路", description: "把地形、出口和当地规矩记清，为后续追人或赴会做准备。", tone: "ink", risk: "低", preview: [effectPreview("洞察", "+4", "good"), effectPreview("地点", "熟悉", "good")], success: { lines: [line(state.turn, 2, "action", `你走完${location.name}最容易忽略的两条侧路，也记住哪里适合问话、哪里不宜久留。`)], effects: { stats: { insight: 4, fortune: 2 } } } }),
      choice(state, { id: `campaign-travel-news:${location.id}`, label: "找茶摊问今日消息", description: "只问有姓名、地点和时日的消息，不收神秘暗语。", tone: "jade", risk: "低", preview: [effectPreview("线索", "+1", "good"), effectPreview("风声", "+2", "bad")], success: { lines: [line(state.turn, 2, "narrative", `你问到两条能核实的消息：谁昨日从哪条路来，哪场活动会在何日收场。`)], effects: { clues: 1, stats: { insight: 3 }, heat: 2 } } }),
      choice(state, { id: `campaign-travel-help:${location.id}`, label: "接一件当地人眼前的难处", description: "让这一站留下具体人情，而不是只在地图上点亮一个名字。", tone: "steel", risk: location.danger >= 60 ? "高" : "中", preview: [effectPreview("侠义", "+5", "good"), effectPreview("名望", "+3", "good")], check: { stat: "chivalry", label: "处事", difficulty: 44 + Math.round(location.danger * 0.1) }, success: { lines: [line(state.turn, 2, "action", `你替当地人处理了一件今日就会恶化的难处；下次回来，至少有人知道你做过什么。`)], effects: { stats: { chivalry: 5, fame: 3 }, health: location.danger >= 60 ? -8 : -3 } }, failure: { lines: [line(state.turn, 2, "narrative", "事情没有一次解决，却留下了愿意继续说明情况的人。")], effects: { stats: { chivalry: 2, insight: 3 }, health: -5 } } }),
    ],
  });
};

const buildCampaignPursuitEvent = (state: NovelState, activity: PlayerActivity): NovelEvent => {
  const actor = state.world.actors.find((entry) => entry.id === activity.targetActorId)!;
  const character = characterForActor(state, actor.id);
  const location = currentLocation(state, actor.locationId);
  const lead = state.campaign.leads.find((entry) => entry.id === activity.leadId);
  const intent = lead?.intent || "observe";
  return eventBase(state, {
    id: `campaign-pursuit:${actor.id}:${state.turn + 1}`,
    eyebrow: `第${state.turn + 1}回 · 循迹寻人`,
    title: `你循着真实行踪追到了${actor.name}`,
    subtitle: `${location.name} · ${intentLabel[intent]}`,
    locationId: location.id,
    mood: intent === "revenge" ? "storm" : intent === "romance" ? "moon" : "market",
    lines: [
      line(state.turn, 0, "narrative", `${actor.name}前一日还在${state.locations.find((entry) => entry.id === actor.homeLocationId)?.name || "别处"}，今日停在${location.name}；你追的是世界里已经发生的移动，不是一封凭空出现的信。`),
      line(state.turn, 1, "action", `你沿途核对脚程、衣着与招式传闻，终于在${location.name}见到本人。`),
      line(state.turn, 2, "dialogue", `“你为${intentLabel[intent]}而来，我也有自己的事：${character?.desire || actor.goals[0]?.reason || "还要继续赶路"}。”`, actor.name),
    ],
    choices: uniqueChoices([
      bondPrimaryChoice(state, actor, intent),
      choice(state, { id: `sandbox-track:${actor.id}`, label: "先问清他为何来到这里", description: "把人物自己的目标纳入判断，再决定关系往哪一步走。", tone: "jade", risk: "中", preview: [effectPreview("线索", "+1", "good"), effectPreview("关系", "了解", "good")], check: { stat: "insight", label: "问路", difficulty: 48 }, success: { lines: [line(state.turn, 3, "narrative", `${actor.name}把今日路线与要见之人说到可以核实的程度，你也因此知道下一次该去哪里找。`)], effects: { clues: 1, stats: { insight: 5 } } }, failure: { lines: [line(state.turn, 3, "narrative", `${actor.name}没有说全，却纠正了你对其中一段行程的误会。`)], effects: { stats: { insight: 3 } } } }),
      choice(state, { id: `campaign-defer:${actor.id}`, label: "记下行踪，先去做别的事", description: "暂停这条追寻；目标人物会继续生活，线索也会保留。", tone: "ink", risk: "低", preview: [effectPreview("线索", "暂停", "neutral")], success: { lines: [line(state.turn, 3, "action", `你没有强求${actor.name}停下，只把下一站与今日所见记进线索簿。`)], effects: { stats: { insight: 2 } } } }),
    ]),
  });
};

const opportunityChoiceSet = (state: NovelState, opportunity: WorldOpportunity, actor?: WorldActor): NovelChoice[] => {
  if (opportunity.type === "secret_realm") {
    return [
      choice(state, { id: `campaign-opportunity-search:${actor?.id || "none"}:${opportunity.id}`, label: "按石壁水痕寻找旧物", description: "找得到什么取决于地点与时限，不会凭空塞给你一件天命秘宝。", tone: "gold", risk: "高", preview: [effectPreview("机缘", "+6", "good"), effectPreview("秘籍", "可能发现", "good")], check: { stat: "fortune", label: "探窟", difficulty: 56 }, success: { lines: [line(state.turn, 4, "action", "你从被水冲开的石槽里取出一页仍能辨认的运劲图，旁边还刻着前一位来者留下的门派记号。")], effects: { stats: { fortune: 6, insight: 4 }, clues: 1, item: "白露崖运劲残图" } }, failure: { lines: [line(state.turn, 4, "narrative", "塌石封住深处，你只来得及拓下门派记号和石门再次闭合的方向。")], effects: { stats: { insight: 4 }, clues: 1, health: -8 } } }),
      choice(state, { id: `campaign-opportunity-rescue:${actor?.id || "none"}:${opportunity.id}`, label: "先帮村民加固塌方处", description: "放弃最深处的先手，把这次奇遇变成一笔真实地方人情。", tone: "jade", risk: "中", preview: [effectPreview("侠义", "+7", "good"), effectPreview("追随者", "可能增加", "good")], check: { stat: "chivalry", label: "救险", difficulty: 50 }, success: { lines: [line(state.turn, 4, "action", "最后一根撑木立稳时，村民把原本不肯外传的石窟旧路完整画给了你。")], effects: { stats: { chivalry: 7, fame: 4 }, health: -6 } }, failure: { lines: [line(state.turn, 4, "narrative", "你没能保住最里侧的石室，却让被困的人赶在塌方前全部退了出来。")], effects: { stats: { chivalry: 5 }, health: -12 } } }),
      choice(state, { id: `campaign-opportunity-record:${actor?.id || "none"}:${opportunity.id}`, label: "记录石门开合与来客名录", description: "不争眼前所得，把一次性奇遇变成以后可核实的资料。", tone: "ink", risk: "低", preview: [effectPreview("洞察", "+6", "good"), effectPreview("线索", "+1", "good")], success: { lines: [line(state.turn, 4, "narrative", "你把时辰、水位和进出者逐一记下，下一次有人夸大石窟传闻时便有了对照。")], effects: { stats: { insight: 6 }, clues: 1 } } }),
    ];
  }
  return uniqueChoices([
    ...(actor ? [choice(state, { id: `sandbox-duel:${actor.id}:opportunity`, label: opportunity.type === "matchmaking_tournament" ? "报名登台，先问清擂台条件" : `与${actor.name}公开拆招`, description: "公开比试一场；胜负、招式来路与门派反应都会留下记录。", tone: "steel", risk: opportunity.risk, preview: [effectPreview("实战", "逐招交手", "good"), effectPreview("名望", "公开变化", "neutral")], check: { stat: "martial", label: "公开比试", difficulty: 55 }, success: { lines: [line(state.turn, 4, "action", `场边记招人把你和${actor.name}各自使过的路数写进名册，胜负之外，门派来处也有了证据。`)], effects: { stats: { martial: 6, fame: 7 }, health: -13, heat: 5 } }, failure: { lines: [line(state.turn, 4, "narrative", `你没拿下这场比试，却完整看见${actor.name}在压力下最依赖的那一式。`)], effects: { stats: { martial: 3, insight: 5, fame: 3 }, health: -19 } } })] : []),
    choice(state, { id: `campaign-opportunity-study:${actor?.id || "none"}:${opportunity.id}`, label: "留在场边辨认各派招路", description: "从衣着、起手和收势积累门派见识，不直接抄游戏数值。", tone: "jade", risk: "低", preview: [effectPreview("门派见识", "增加", "good"), effectPreview("武学灵感", "+1", "good")], check: { stat: "insight", label: "辨招", difficulty: 49 }, success: { lines: [line(state.turn, 4, "narrative", "你把三种相似起手分别追到不同吐纳与收势，终于知道它们为何来自不同门派。")], effects: { stats: { insight: 6, martial: 2 }, clues: 1 } }, failure: { lines: [line(state.turn, 4, "narrative", "你只辨出其中一门，却也记下其余两式不能混为一谈的理由。")], effects: { stats: { insight: 3 } } } }),
    choice(state, { id: `campaign-opportunity-social:${actor?.id || "none"}:${opportunity.id}`, label: "去见组织者和参会人物", description: "以真实来意结识人，让大会成为关系网而非领奖台。", tone: "gold", risk: "中", preview: [effectPreview("名望", "+5", "good"), effectPreview("人物线索", "新增", "good")], check: { stat: "fame", label: "会面", difficulty: 50 }, success: { lines: [line(state.turn, 4, "action", "你没有逐桌敬酒，只与三位确有共同话题的人交换了下一次可拜访的地点。")], effects: { stats: { fame: 5, chivalry: 3 }, heat: 2 } }, failure: { lines: [line(state.turn, 4, "narrative", "席间没有人立刻交心，但你至少辨清谁在替哪一方说话。")], effects: { stats: { insight: 4, fame: 2 } } } }),
  ]);
};

const buildCampaignOpportunityEvent = (state: NovelState, activity: PlayerActivity): NovelEvent => {
  const opportunity = state.campaign.opportunities.find((entry) => entry.id === activity.opportunityId)!;
  const location = currentLocation(state, opportunity.locationId);
  const participantIds = opportunity.participantActorIds.length
    ? opportunity.participantActorIds.map((_, index) => opportunity.participantActorIds[(index + (opportunity.roundsWon || 0)) % opportunity.participantActorIds.length])
    : [];
  const actor = participantIds
    .map((actorId) => state.world.actors.find((entry) => entry.id === actorId))
    .filter((entry): entry is WorldActor => Boolean(entry))
    .find((entry) => worldDistance(state.world, entry.locationId, opportunity.locationId) <= activity.durationDays);
  const character = actor ? characterForActor(state, actor.id) : undefined;
  return eventBase(state, {
    id: `campaign-opportunity:${opportunity.id}:${actor?.id || "none"}:${state.turn + 1}`,
    eyebrow: `第${state.turn + 1}回 · 限时江湖`,
    title: opportunity.roundsRequired
      ? `${opportunity.title} · 第${Math.min(opportunity.roundsRequired, (opportunity.roundsWon || 0) + 1)}轮`
      : opportunity.title,
    subtitle: `${location.name} · ${calendarLabel(state, opportunity.startDay)}至${calendarLabel(state, opportunity.endDay)}`,
    locationId: location.id,
    mood: opportunity.type === "secret_realm" ? "storm" : opportunity.type === "matchmaking_tournament" ? "ember" : "market",
    lines: [
      line(state.turn, 0, "narrative", `${location.descriptor}${opportunity.organizer}把开始、收场和规矩都贴在明处；你是在期限内主动赶来。`),
      line(state.turn, 1, "action", opportunity.description),
      ...(actor ? [line(state.turn, 2, "narrative", `${actor.name}也按自己的行程来到这里。${character ? `场边已经有人认出其“${character.signatureMove}”的名号。` : ""}`)] : []),
      line(state.turn, 3, "inner", opportunity.roundsRequired
        ? `此届须连过${opportunity.roundsRequired}轮方能夺魁；你已胜${opportunity.roundsWon || 0}轮，每一轮都要亲自作答。`
        : `此行可能带来${opportunity.rewardHint}，但你只能选择此刻真正要做的一件事。`),
    ],
    choices: opportunityChoiceSet(state, opportunity, actor),
  });
};

const buildCampaignOpportunityPreparationEvent = (state: NovelState, activity: PlayerActivity): NovelEvent => {
  const opportunity = state.campaign.opportunities.find((entry) => entry.id === activity.opportunityId)!;
  const location = currentLocation(state, opportunity.locationId);
  const actor = opportunity.participantActorIds
    .map((actorId) => state.world.actors.find((entry) => entry.id === actorId))
    .filter((entry): entry is WorldActor => Boolean(entry))
    .find((entry) => worldDistance(state.world, entry.locationId, opportunity.locationId) <= activity.durationDays);
  const arrivalDay = state.world.day + activity.durationDays;
  const waitingDays = Math.max(0, opportunity.startDay - arrivalDay);
  return eventBase(state, {
    id: `campaign-opportunity-prepare:${opportunity.id}:${actor?.id || "none"}:${state.turn + 1}`,
    eyebrow: `第${state.turn + 1}回 · 提前赴约`,
    title: waitingDays > 0 ? `你先赶到${location.name}，盛会尚未开场` : `${opportunity.shortTitle}开场前的最后一日`,
    subtitle: `${location.name} · ${calendarLabel(state, opportunity.startDay)}正式开场`,
    locationId: location.id,
    mood: opportunity.type === "secret_realm" ? "mist" : "market",
    lines: [
      line(state.turn, 0, "narrative", `${location.descriptor}你按真实脚程提前抵达；布告、擂台或石门都还在准备，不能把尚未发生的盛会提前领奖。`),
      line(state.turn, 1, "action", waitingDays > 0
        ? `离开场还有${waitingDays}日。你可以留在当地继续等，也可以先做别的事；期限不会因你抵达而暂停。`
        : "组织者正在核对最后一遍名册，早到的人已经开始彼此打量。"),
      ...(actor ? [line(state.turn, 2, "narrative", `${actor.name}也是提前到场的人之一，正替自己要做的事熟悉周边道路。`)] : []),
    ],
    choices: uniqueChoices([
      choice(state, {
        id: `campaign-opportunity-prepare-rules:${actor?.id || "none"}:${opportunity.id}`,
        label: "先把场地、规矩与退路看清",
        description: "提前抵达的价值是准备充分，而不是越过正式开场。",
        tone: "ink",
        risk: "低",
        preview: [effectPreview("洞察", "+5", "good"), effectPreview("赴会", "保留", "neutral")],
        success: { lines: [line(state.turn, 3, "action", "你把报名处、医棚、出口和几条容易混淆的规矩逐一记下，等开场时便不必临阵猜测。")], effects: { stats: { insight: 5, fortune: 2 } } },
      }),
      ...(actor ? [choice(state, {
        id: `campaign-opportunity-social:${actor.id}:${opportunity.id}:early`,
        label: `与早到的${actor.name}一起做准备`,
        description: "先共同完成一件眼前小事，让正式盛会开始前已有可追寻的人情。",
        tone: "jade",
        risk: "低",
        preview: [effectPreview("关系", "早到之谊", "good"), effectPreview("赴会", "保留", "neutral")],
        success: { lines: [line(state.turn, 3, "action", `你与${actor.name}一起校过一遍器械和名帖；事情不大，却足够让下次见面不必再从陌生人说起。`)], effects: { stats: { chivalry: 3, insight: 2 } } },
      })] : []),
      choice(state, {
        id: `campaign-opportunity-prepare-help:${actor?.id || "none"}:${opportunity.id}`,
        label: "替组织者补一处眼前缺口",
        description: "用早到的时间帮忙搭台、清路或核对来客，不把盛会当成只等领奖的布景。",
        tone: "gold",
        risk: "低",
        preview: [effectPreview("名望", "+3", "good"), effectPreview("地方人情", "留下", "good")],
        success: { lines: [line(state.turn, 3, "narrative", "收工时，组织者把你的名字补进了帮工名册；正式开场之前，这里已经有人知道你为何而来。")], effects: { stats: { fame: 3, chivalry: 2 } } },
      }),
    ]),
  });
};

const buildLifeRiteEvent = (state: NovelState, activity: PlayerActivity): NovelEvent => {
  const actor = state.world.actors.find((entry) => entry.id === activity.targetActorId)!;
  const character = characterForActor(state, actor.id);
  const location = currentLocation(state, activity.targetLocationId);
  const kind = activity.riteKind || "sworn_oath";
  const sharedOpening = [
    line(state.turn, 0, "narrative", `${location.descriptor}这不是关系走到某个数目后自行弹出的结果；你与${actor.name}都要在场，也都要亲口作答。`),
    line(state.turn, 1, "dialogue", `“我记得我们一起经历过的事，也记得自己还有要走的路：${character?.desire || actor.goals[0]?.reason || "江湖未定"}。”`, actor.name),
  ];
  if (kind === "sworn_oath") {
    return eventBase(state, {
      id: `life-rite:oath:${actor.id}:${state.turn + 1}`,
      eyebrow: `第${state.turn + 1}回 · 人生礼仪`,
      title: `你与${actor.name}把旧日情分摆上香案`,
      subtitle: `${location.name} · 结义`,
      locationId: location.id,
      mood: "ember",
      lines: [...sharedOpening, line(state.turn, 2, "inner", "结义不会抹掉彼此原有的门派、亲属和目标，只是在往后的选择里多一位真正的手足。")],
      choices: [
        choice(state, { id: `life-rite:oath:${actor.id}`, label: "同饮一盏酒，结为异姓手足", description: "从今日起以手足相称；这层关系会留在世界里，也会被后来者看见。", tone: "jade", risk: "低", preview: [effectPreview("家门", "结义", "good"), effectPreview("关系", "手足", "good")], success: { lines: [line(state.turn, 3, "action", `你与${actor.name}没有许下永不相负的空话，只约定有难相告、有错相劝。酒落在土里，称呼从此不同。`)], effects: { stats: { chivalry: 4, fame: 2 } } } }),
        choice(state, { id: `life-rite:defer:${actor.id}`, label: "把酒收起，等彼此都想清楚", description: "暂不举行仪式；已经建立的信任不会因此清零。", tone: "ink", risk: "低", preview: [effectPreview("关系", "保留", "neutral")], success: { lines: [line(state.turn, 3, "narrative", `${actor.name}把酒封好，说下一次仍可再问。你们没有因一次暂缓退回陌路。`)], effects: { stats: { insight: 2 } } } }),
      ],
    });
  }
  if (kind === "marriage" || kind === "concubinage") {
    const isMarriage = kind === "marriage";
    return eventBase(state, {
      id: `life-rite:${kind}:${actor.id}:${state.turn + 1}`,
      eyebrow: `第${state.turn + 1}回 · 家门之议`,
      title: isMarriage ? `你与${actor.name}商议结为夫妻` : `你与${actor.name}商议侧室名分`,
      subtitle: `${location.name} · ${isMarriage ? "婚约" : "纳侧"}`,
      locationId: location.id,
      mood: "moon",
      lines: [
        ...sharedOpening,
        line(state.turn, 2, "action", isMarriage
          ? "你们先谈往后住在哪里、谁仍要远行、两边师门如何称呼，而后才把红纸铺开。"
          : "已有家门之后再添名分，任何含混都会变成往后的旧怨；你把去留、称谓与各自仍能拒绝的事逐条说清。"),
      ],
      choices: [
        choice(state, { id: `life-rite:${kind}:${actor.id}`, label: isMarriage ? "合写婚书，结为夫妻" : "当面立约，迎为侧室", description: "双方都已在此前的相处中表明情意；这次选择确认共同生活的名分。", tone: "jade", risk: isMarriage ? "低" : "中", preview: [effectPreview("家门", isMarriage ? "夫妻" : "侧室", "good"), effectPreview("同行", "长期变化", "good")], success: { lines: [line(state.turn, 3, "action", isMarriage ? `婚书上没有江湖排名，只有你与${actor.name}的名字和各自仍要走的路。两枚指印落下，这一纸便成了世界里的事实。` : `${actor.name}亲自改过约书上一处含混的称谓，而后才按下指印。新名分不是把人收进物件栏，而是多了一段必须共同承担的生活。`)], effects: { stats: { chivalry: 3, fame: 4 } } } }),
        choice(state, { id: `life-rite:defer:${actor.id}`, label: "今日只说心意，不急着立名分", description: "关系继续保留；以后仍能重新商议。", tone: "ink", risk: "低", preview: [effectPreview("关系", "保留", "neutral")], success: { lines: [line(state.turn, 3, "narrative", `红纸被重新卷起。${actor.name}没有把暂缓当作拒绝，只说等下一次路更明白时再谈。`)], effects: { stats: { insight: 2 } } } }),
      ],
    });
  }
  return eventBase(state, {
    id: `life-rite:child:${actor.id}:${state.turn + 1}`,
    eyebrow: `第${state.turn + 1}回 · 家门新页`,
    title: `你与${actor.name}谈起家中是否添一个孩子`,
    subtitle: `${location.name} · 添丁`,
    locationId: location.id,
    mood: "moon",
    lines: [...sharedOpening, line(state.turn, 2, "inner", "孩子会有出生年月、父母与住处，会在这个世界里长大；这不是结局画面里凭空多出的一行字。")],
    choices: [
      choice(state, { id: `life-rite:child:${actor.id}:birth`, label: "相约添丁，给孩子留一处真正的家", description: "迎来一名亲生子女；往后的年月会改变其年龄与人生。", tone: "jade", risk: "中", preview: [effectPreview("家门", "添一名子女", "good"), effectPreview("岁月", "会真实成长", "neutral")], check: { stat: "fortune", label: "添丁", difficulty: 43 }, success: { lines: [line(state.turn, 3, "narrative", `数月之后，屋里多了一声啼哭。${actor.name}先把孩子的名字写在家门簿上，而后才让报喜的人出门。`)], effects: { stats: { fortune: 4, chivalry: 3 }, silver: -8 } }, failure: { lines: [line(state.turn, 3, "narrative", "这一年没有等来孩子。你们把备好的小衣收进箱底，却没有把彼此的失落变成责怪。")], effects: { stats: { chivalry: 2 } } } }),
      choice(state, { id: `life-rite:child:${actor.id}:adopt`, label: "收养一名无家可归的孩子", description: "让一名真实存在于乱世余波中的孩子成为你们的子女。", tone: "gold", risk: "低", preview: [effectPreview("家门", "收养子女", "good"), effectPreview("侠义", "+4", "good")], success: { lines: [line(state.turn, 3, "action", `你与${actor.name}没有改掉孩子原先记得的乳名，只在家门簿上添了父母两栏。从这日起，回家成了一件有具体去处的事。`)], effects: { stats: { chivalry: 4, fame: 2 }, silver: -6 } } }),
      choice(state, { id: `life-rite:defer:${actor.id}`, label: "今年先不添丁", description: "把决定留到以后，不降低现有关系。", tone: "ink", risk: "低", preview: [effectPreview("家门", "不变", "neutral")], success: { lines: [line(state.turn, 3, "narrative", "你们把这件事认真谈完，也认真决定暂缓。窗外风声仍在，屋内不必为了一个预设结局仓促作答。")], effects: { stats: { insight: 2 } } } }),
    ],
  });
};

const buildWorldProjectEvent = (state: NovelState, activity: PlayerActivity): NovelEvent => {
  const project = state.chronicle.projects.find((entry) => entry.id === activity.projectId)!;
  const location = currentLocation(state, project.locationId);
  const target = project.targetActorId ? state.world.actors.find((actor) => actor.id === project.targetActorId) : undefined;
  const commonChoices: NovelChoice[] = [
    choice(state, { id: `life-project:investigate:${project.id}`, label: "先把眼前传闻查到可以核实", description: "查行踪、粮道与证词，让下一步不必靠猜。", tone: "ink", risk: "中", preview: [effectPreview("天下大事", "推进", "good"), effectPreview("洞察", "+5", "good")], check: { stat: "insight", label: "查证", difficulty: project.stage === "最后一役" ? 58 : 48 }, success: { lines: [line(state.turn, 4, "narrative", "几条互相矛盾的说法被逐一排除，余下的路、人与时辰终于能在地图上连成一线。")], effects: { stats: { insight: 5 }, clues: 1 } }, failure: { lines: [line(state.turn, 4, "narrative", "假消息拖慢了脚步，但留下的破绽也让你认出是谁在有意误导众人。")], effects: { stats: { insight: 3 }, heat: 3 } } }),
    choice(state, { id: `life-project:rally:${project.id}`, label: "联络愿意真正出手的人", description: "名望只能让人听见，旧人情和共同目标才决定谁会留下。", tone: "gold", risk: "中", preview: [effectPreview("会盟", "推进", "good"), effectPreview("名望", "+4", "good")], check: { stat: "fame", label: "会盟", difficulty: 52 }, success: { lines: [line(state.turn, 4, "action", "来者没有齐声喊一句空洞口号，而是各自认领了守路、传信、疗伤与断后的具体差事。")], effects: { stats: { fame: 4, chivalry: 3 }, silver: -5 } }, failure: { lines: [line(state.turn, 4, "narrative", "多数人仍在观望，只有两位旧识留下。人少，却至少知道彼此为何而来。")], effects: { stats: { chivalry: 3 }, silver: -3 } } }),
  ];
  if (project.kind === "invasion") {
    commonChoices.unshift(choice(state, { id: `life-project:defend:${project.id}`, label: project.stage === "最后一役" ? "亲守关门，接下最后一役" : "护送粮药，守住一段关墙", description: "这不是一场擂台；守住伤者、粮道与退路同样会改变战局。", tone: "steel", risk: "高", preview: [effectPreview("边关", "显著推进", "good"), effectPreview("气血", "可能受伤", "bad")], check: { stat: "chivalry", label: "守关", difficulty: project.stage === "最后一役" ? 64 : 55 }, success: { lines: [line(state.turn, 4, "action", "关门最危急时没有人看见漂亮招式，只看见你一次次把倒下的人拖回墙后，又重新站上缺口。")], effects: { stats: { chivalry: 7, martial: 4, fame: 5 }, health: -14, heat: 4 } }, failure: { lines: [line(state.turn, 4, "narrative", "这段关墙终究失守，你却带着伤者退到第二道门内，没有让一次败退变成全线溃散。")], effects: { stats: { chivalry: 5, martial: 2 }, health: -22, heat: 7 } } }));
  } else if (target) {
    const combatPrefix = project.kind === "villain_hunt" ? "sandbox-confront" : "sandbox-duel";
    commonChoices.unshift(choice(state, { id: `${combatPrefix}:${target.id}:project:${project.id}`, label: project.stage === "最后一役" ? `与${target.name}了结最后一战` : `向${target.name}问一场真招`, description: "复用逐招战斗演算；距离、内息、招式来路与平日火候共同决定结果。", tone: "steel", risk: "高", preview: [effectPreview("实战", "逐招交手", "good"), effectPreview("大事", "显著推进", "good")], check: { stat: "martial", label: "决战", difficulty: project.stage === "最后一役" ? 66 : 56 }, success: { lines: [line(state.turn, 4, "action", `你与${target.name}之间再没有可供旁人代传的半招，胜负和双方使过的武学都被在场者记下。`)], effects: { stats: { martial: 6, fame: 5 }, health: -15 } }, failure: { lines: [line(state.turn, 4, "narrative", `你没能越过${target.name}这一关，却逼出一式此前无人见过的收手，也让下一次挑战有了真实依据。`)], effects: { stats: { martial: 3, insight: 4 }, health: -22 } } }));
  }
  return eventBase(state, {
    id: `life-project:${project.id}:${target?.id || "none"}:${state.turn + 1}`,
    eyebrow: `第${state.turn + 1}回 · 天下大事`,
    title: `${project.title} · ${project.stage}`,
    subtitle: `${location.name} · 此事不会因换章而消失`,
    locationId: location.id,
    mood: project.stage === "最后一役" ? "storm" : "ember",
    lines: [
      line(state.turn, 0, "narrative", `${location.descriptor}${project.description}`),
      line(state.turn, 1, "action", project.stage === "风声初起" ? "江湖还在互相打听真假，你此刻的选择会决定这件事往哪里长。" : "前人做过的事已经留下后果；你不是从一张空白任务单开始。"),
      ...(target ? [line(state.turn, 2, "narrative", `${target.name}也被卷进此事。此人仍有自己的地点、目标与武学，不是只在最后一战才凭空出现。`)] : []),
    ],
    choices: uniqueChoices(commonChoices),
  });
};

const buildCampaignInventEvent = (state: NovelState, activity: PlayerActivity): NovelEvent => {
  const location = currentLocation(state, activity.targetLocationId);
  const learned = state.world.actors.find((actor) => actor.id === "hero")?.techniques
    .map((known) => state.world.techniques.find((entry) => entry.id === known.techniqueId))
    .filter((entry): entry is MartialTechniqueDef => Boolean(entry)) || [];
  const names = learned.slice(0, 3).map((entry) => `“${entry.name}”`).join("、");
  return eventBase(state, {
    id: `campaign-invent:${state.turn + 1}`,
    eyebrow: `第${state.turn + 1}回 · 自成一式`,
    title: "你把一路所学摊开，准备留下自己的招",
    subtitle: `${location.name} · 武学推演`,
    locationId: location.id,
    mood: "moon",
    lines: [
      line(state.turn, 0, "narrative", `${location.descriptor}你把${names || "本门根基"}各自的来路写在纸边，没有抹去原主和门派。`),
      line(state.turn, 1, "action", "自创不是把三个招名拼在一起；你要先决定这一式究竟为攻、为守，还是为替同伴留路。"),
    ],
    choices: [
      choice(state, { id: "campaign-invent:break", label: "以破招为骨", description: "把见过的强攻与格挡都化成一次截断，但失手时更容易露出空门。", tone: "steel", risk: "高", preview: [effectPreview("自创", "破势新招", "good"), effectPreview("武艺", "+5", "good")], check: { stat: "martial", label: "推演", difficulty: 57 }, success: { lines: [line(state.turn, 2, "action", "你删去多余变化，只留下一次能在对手换气前截断来势的短招。")], effects: { stats: { martial: 5, insight: 3, fame: 4 }, health: -6 } }, failure: { lines: [line(state.turn, 2, "narrative", "新招尚不能连贯使出，你却已找出必须舍弃的那一段。")], effects: { stats: { insight: 5, martial: 2 }, health: -8 } } }),
      choice(state, { id: "campaign-invent:guard", label: "以护人为意", description: "让这一式优先替身侧之人挡开来锋，胜负排在第二。", tone: "jade", risk: "中", preview: [effectPreview("自创", "护持新招", "good"), effectPreview("侠义", "+5", "good")], check: { stat: "chivalry", label: "定意", difficulty: 53 }, success: { lines: [line(state.turn, 2, "action", "你把落点从对手要害移到来锋必经之处，这一改让整式终于有了属于你的理由。")], effects: { stats: { chivalry: 5, martial: 3, fame: 3 } } }, failure: { lines: [line(state.turn, 2, "narrative", "招式能挡一人，却还无法在围势中替同伴留出退路。")], effects: { stats: { chivalry: 3, insight: 3 } } } }),
      choice(state, { id: "campaign-invent:flow", label: "以行路为形", description: "把不同门派的身法化成连续换位，让这一式能随地点改变。", tone: "gold", risk: "中", preview: [effectPreview("自创", "行旅新招", "good"), effectPreview("机缘", "+5", "good")], check: { stat: "fortune", label: "融汇", difficulty: 54 }, success: { lines: [line(state.turn, 2, "action", "你不再强求固定三步，而把地形与人群本身纳入招式；这一式终于能带着一路见闻移动。")], effects: { stats: { fortune: 5, insight: 4, fame: 3 } } }, failure: { lines: [line(state.turn, 2, "narrative", "几段步法仍彼此相撞，但你已知道它们不能在同一口气里强接。")], effects: { stats: { fortune: 2, insight: 4 } } } }),
    ],
  });
};

const schoolFollowerCandidates = (
  state: NovelState,
  followerIds = new Set(state.campaign.legacy.followerActorIds),
) => state.world.actors
  .filter((actor) => {
    if (actor.id === "hero" || !actor.characterId || followerIds.has(actor.id)) return false;
    const character = state.narrative.cast.find((entry) => entry.id === actor.characterId);
    return character?.firstSeenTurn !== undefined || actor.factionId === "home";
  })
  .sort((left, right) => {
    const score = (actor: WorldActor) => {
      const character = state.narrative.cast.find((entry) => entry.id === actor.characterId);
      return (character?.relationship.trust || 0)
        + (character?.relationship.affection || 0)
        + (character?.relationship.loyalty || 0)
        + actor.memories.length * 3;
    };
    return score(right) - score(left) || left.id.localeCompare(right.id);
  });

const buildCampaignFoundSectEvent = (state: NovelState, activity: PlayerActivity): NovelEvent => {
  const location = currentLocation(state, activity.targetLocationId);
  const authored = state.campaign.legacy.authoredTechniques[0];
  const rules = state.content.rules.foundSect;
  const canFound = state.hero.stats.fame >= rules.fame
    && state.campaign.legacy.followers >= rules.followers
    && state.campaign.legacy.authoredTechniques.length >= rules.authoredTechniques;
  const student = schoolFollowerCandidates(state)[0];
  return eventBase(state, {
    id: `campaign-found-sect:${state.turn + 1}`,
    eyebrow: `第${state.turn + 1}回 · ${canFound ? "开宗立派" : "传艺试门"}`,
    title: canFound
      ? `有人愿意随你在${location.name}挂起一块新匾`
      : student
        ? `${student.name}来问，你自创的招式能否传给别人`
        : "你已有自己的招式，门庭仍缺愿意同行的人",
    subtitle: `${location.name} · ${canFound ? "门规由今日开始" : "先以一人一式验证传承"}`,
    locationId: location.id,
    mood: "ember",
    lines: [
      line(state.turn, 0, "narrative", `${location.descriptor}${canFound ? "愿意留下的人先问的不是门派叫什么，而是往后遇见强敌、旧仇与求学者时按什么规矩行事。" : "一门武学能否成为传承，不在匾额，而在另一人能否学会它，也理解它为何这样出手。"}`),
      line(state.turn, 1, "action", `你已有自创招式“${authored?.name || "未名一式"}”${state.campaign.legacy.followers ? `，也有${state.campaign.legacy.followers}人正式署名相随` : "，却还没有正式弟子"}；${canFound ? "如今可以决定是否让众人共同承担这套门规。" : "眼下先从一日传艺开始。"}`),
    ],
    choices: [
      choice(state, { id: "campaign-found-sect:open", label: "立下门规，正式开山", description: "选择此地为门庭，以自创招式为第一门传承；江湖关系会从个人延伸到新门派。", tone: "gold", risk: "高", preview: [effectPreview("门派", "正式建立", "good"), effectPreview("责任", "长期承担", "neutral")], success: { lines: [line(state.turn, 2, "action", "你没有写下百条戒律，只先立三条能在下一次冲突中真正执行的门规；众人依次署名。")], effects: { stats: { fame: 8, chivalry: 5 }, heat: 8 } } }),
      choice(state, { id: "campaign-found-sect:school", label: "先开一处传艺馆", description: "暂不称门派，只验证自己的招式和规矩能否教给别人。", tone: "jade", risk: "中", preview: [effectPreview("追随者", "+1", "good"), effectPreview("名望", "+4", "good")], success: { lines: [line(state.turn, 2, "narrative", "新匾暂时只写“传艺”二字；愿意留下的人先从如何教第一式开始。")], effects: { stats: { fame: 4, insight: 4 } } } }),
      choice(state, { id: "campaign-found-sect:delay", label: "暂缓开山，再走一章", description: "条件已具备也不必立刻创派；保留决定，继续观察人与地方。", tone: "ink", risk: "低", preview: [effectPreview("创派", "条件保留", "neutral")], success: { lines: [line(state.turn, 2, "inner", "你把匾额翻到背面收好。能开宗不等于此刻必须开宗，愿意同行的人也接受这个决定。")], effects: { stats: { insight: 3 } } } }),
    ].filter((entry) => (
      (entry.id !== "campaign-found-sect:open" || canFound)
      && (entry.id !== "campaign-found-sect:school" || Boolean(student))
    )),
  });
};

const directedCampaignEvent = (state: NovelState, activity: PlayerActivity, event: NovelEvent): DirectedEvent => ({
  event,
  decision: {
    turn: state.turn + 1,
    selectedEventId: event.id,
    selectedCandidateEventId: activity.id,
    targetLocationId: activity.targetLocationId,
    candidates: [{
      eventId: activity.id,
      targetLocationId: activity.targetLocationId,
      kind: activity.kind === "opportunity" ? "location" : activity.kind === "bond" || activity.kind === "pursue" ? "character" : "location",
      archetype: `activity-${activity.kind}`,
      score: 100,
      travelDays: worldDistance(state.world, state.currentLocationId, activity.targetLocationId),
      focusTravelDays: activity.targetActorId
        ? worldDistance(state.world, state.world.actors.find((actor) => actor.id === activity.targetActorId)?.locationId || activity.targetLocationId, activity.targetLocationId)
        : 0,
      relationPressure: 0,
      deadlinePressure: activity.opportunityId ? 40 : 0,
      reasons: ["玩家主动安排了这项活动", activity.description],
    }],
  },
});

type EventBuilder = (state: NovelState, rng: Rng) => NovelEvent;

interface StoryBeat {
  id: string;
  earliestTurn: number;
  idealTurn: number;
  deadlineTurn: number;
  targetLocationId: (state: NovelState) => string;
  prerequisites: string[];
  build: EventBuilder;
}

interface DirectedEvent {
  event: NovelEvent;
  decision: EventDirectorDecision;
}

const STORY_BEATS: StoryBeat[] = [
  { id: "tea-whisper", earliestTurn: 2, idealTurn: 2, deadlineTurn: 3, targetLocationId: () => "city_luoyang", prerequisites: ["opening-oath"], build: (state) => buildTeaWhisper(state) },
  { id: "bridge-ambush", earliestTurn: 3, idealTurn: 3, deadlineTurn: 4, targetLocationId: () => "bridge_beidou", prerequisites: ["tea-whisper"], build: (state) => buildBridgeAmbush(state) },
  { id: "rain-pavilion", earliestTurn: 4, idealTurn: 4, deadlineTurn: 5, targetLocationId: () => "inn_tingyu", prerequisites: ["bridge-ambush"], build: (state, rng) => buildRainPavilion(state, rng) },
  { id: "broken-manual", earliestTurn: 5, idealTurn: 5, deadlineTurn: 6, targetLocationId: () => "village_bailu", prerequisites: ["rain-pavilion"], build: (state) => buildBrokenManual(state) },
  { id: "sect-trial", earliestTurn: 6, idealTurn: 6, deadlineTurn: 7, targetLocationId: (state) => homeLocationId(state.hero.sectId), prerequisites: ["broken-manual"], build: (state) => buildSectTrial(state) },
  { id: "traitor", earliestTurn: 7, idealTurn: 7, deadlineTurn: 8, targetLocationId: () => "house_old", prerequisites: ["sect-trial"], build: (state) => buildTraitor(state) },
  { id: "duel-at-dawn", earliestTurn: 8, idealTurn: 8, deadlineTurn: 9, targetLocationId: () => "wild_heifeng", prerequisites: ["traitor"], build: (state) => buildDuel(state) },
  { id: "alliance-council", earliestTurn: 9, idealTurn: 9, deadlineTurn: 10, targetLocationId: () => "hall_changhe", prerequisites: ["duel-at-dawn"], build: (state) => buildAlliance(state) },
  { id: "lantern-healer", earliestTurn: 10, idealTurn: 10, deadlineTurn: 11, targetLocationId: () => "clinic_lantern", prerequisites: ["alliance-council"], build: (state, rng) => buildLanternHealer(state, rng) },
];

const companionActorIds = (state: NovelState) => state.companions
  .map((companion) => (companion.characterId
    ? state.world.actors.find((actor) => actor.characterId === companion.characterId)
    : undefined))
  .filter((actor): actor is WorldActor => actor !== undefined && !["死亡", "失踪"].includes(actor.activity))
  .map((actor) => actor.id);

const incidentLocation = (state: NovelState, rng: Rng) => {
  const current = state.world.locations.find((location) => location.id === state.currentLocationId) || state.world.locations[0];
  const options = [current.id, ...current.connections]
    .map((locationId) => state.world.locations.find((location) => location.id === locationId))
    .filter((location): location is WorldLocation => Boolean(location));
  return options
    .map((location) => {
      const actors = actorAtLocation(state.world, location.id).filter((actor) => actor.id !== "hero");
      const knownActorIds = new Set(knownRelations(state.world).flatMap((relation) => [relation.fromActorId, relation.toActorId]));
      const familiarFaces = actors.filter((actor) => knownActorIds.has(actor.id)).length;
      return { location, score: actors.length * 16 + familiarFaces * 20 + location.danger * 0.16 + rng.next() * 12 };
    })
    .sort((left, right) => right.score - left.score)[0]?.location.id || current.id;
};

const scoreStoryBeat = (state: NovelState, beat: StoryBeat, turn: number, rng: Rng): EventCandidateScore => {
  const targetLocationId = beat.targetLocationId(state);
  const travelPath = findWorldPath(state.world, state.currentLocationId, targetLocationId);
  const travelDays = state.currentLocationId === targetLocationId ? 0 : travelPath.length || 99;
  const focusIds = focusActorsForEvent(beat.id);
  const focusTravelDays = focusIds.reduce((longest, actorId) => {
    const actor = state.world.actors.find((entry) => entry.id === actorId);
    return actor ? Math.max(longest, worldDistance(state.world, actor.locationId, targetLocationId)) : longest;
  }, 0);
  const involvedRelations = state.world.relations.filter((relation) => (
    focusIds.includes(relation.fromActorId) || focusIds.includes(relation.toActorId)
  ));
  const relationPressure = clamp(Math.round(involvedRelations.reduce((total, relation) => (
    total + relation.strength * (relation.secret && !relation.knownToHero ? 0.16 : 0.08)
  ), 0)), 0, 80);
  const deadlinePressure = turn >= beat.deadlineTurn
    ? 180 + (turn - beat.deadlineTurn) * 35
    : Math.max(0, 42 - (beat.deadlineTurn - turn) * 18);
  const distanceFit = travelDays === 99 ? -300 : Math.max(-18, 26 - travelDays * 7 - Math.max(0, focusTravelDays - travelDays) * 3);
  const score = Math.round(120 + relationPressure + deadlinePressure + distanceFit + rng.next() * 10);
  const reasons = [
    `${travelDays || 1}日可抵达`,
    focusTravelDays <= Math.max(1, travelDays) ? "关键人物行程可交汇" : `需等关键人物${focusTravelDays}日`,
  ];
  if (relationPressure >= 18) reasons.push("未清关系提高戏剧权重");
  if (deadlinePressure >= 100) reasons.push("伏笔临近兑现期限");
  return { eventId: beat.id, targetLocationId, score, travelDays, focusTravelDays, relationPressure, deadlinePressure, reasons };
};

const buildAtLocation = (state: NovelState, targetLocationId: string, build: EventBuilder, rng: Rng) => (
  build({ ...state, currentLocationId: targetLocationId }, rng)
);

export const chooseLegacyEvent = (state: NovelState, rng: Rng): DirectedEvent => {
  const nextTurn = state.turn + 1;
  if (state.turn === 0) {
    const event = buildOpening(state);
    return {
      event,
      decision: { turn: nextTurn, selectedEventId: event.id, targetLocationId: event.locationId, candidates: [] },
    };
  }
  const seen = new Set(state.history.map((entry) => entry.eventId));
  const eligible = STORY_BEATS.filter((beat) => (
    !seen.has(beat.id)
    && nextTurn >= beat.earliestTurn
    && beat.prerequisites.every((eventId) => seen.has(eventId))
  ));
  const candidates = eligible.map((beat) => scoreStoryBeat(state, beat, nextTurn, rng));
  const ambientTarget = incidentLocation(state, rng);
  const ambientActors = actorAtLocation(state.world, ambientTarget).filter((actor) => actor.id !== "hero").length;
  candidates.push({
    eventId: `wandering-${state.turn}`,
    targetLocationId: ambientTarget,
    score: Math.round(36 + ambientActors * 12 + rng.next() * 10),
    travelDays: worldDistance(state.world, state.currentLocationId, ambientTarget),
    focusTravelDays: 0,
    relationPressure: ambientActors * 6,
    deadlinePressure: 0,
    reasons: [ambientActors ? "附近有人停留" : "沿传闻行路", "给主线留出呼吸"],
  });
  if (state.hero.health < 36 && !seen.has("sandbox-recovery")) {
    candidates.push({
      eventId: "sandbox-recovery",
      targetLocationId: state.currentLocationId,
      score: Math.round(142 + (36 - state.hero.health) * 2.4),
      travelDays: 0,
      focusTravelDays: 0,
      relationPressure: 0,
      deadlinePressure: 0,
      reasons: ["伤势已影响下一场交锋", "原地停留也会让他人继续移动"],
    });
  }
  candidates.sort((left, right) => right.score - left.score || left.eventId.localeCompare(right.eventId));
  const selected = candidates[0];
  const beat = STORY_BEATS.find((entry) => entry.id === selected.eventId);
  const build = beat?.build
    || (selected.eventId === "sandbox-recovery" ? ((next: NovelState) => buildRecovery(next)) : ((next: NovelState, nextRng: Rng) => buildGeneric(next, nextRng)));
  const event = buildAtLocation(state, selected.targetLocationId, build, rng);
  return {
    event,
    decision: {
      turn: nextTurn,
      selectedEventId: event.id,
      targetLocationId: selected.targetLocationId,
      candidates,
    },
  };
};

const sandboxArchetypeFromEventId = (eventId: string) => {
  if (eventId.startsWith("sandbox:")) return "encounter";
  return eventId.match(/^sandbox-([^:]+)/)?.[1] || "wandering";
};

const sandboxKindFromEventId = (eventId: string): NonNullable<EventCandidateScore["kind"]> => {
  const archetype = sandboxArchetypeFromEventId(eventId);
  if (archetype.startsWith("place-")) return "location";
  if (archetype === "fallout") return "fallout";
  if (archetype === "manual") return "manual";
  if (archetype === "recovery") return "recovery";
  if (["feud", "debt", "tutelage", "kinship"].includes(archetype)) return "relationship";
  return "character";
};

const chooseSandboxEvent = (state: NovelState, rng: Rng): DirectedEvent => {
  const nextTurn = state.turn + 1;
  const recentEvents = state.history.slice(-4).map((entry) => entry.eventId);
  const recentArchetypes = recentEvents.map(sandboxArchetypeFromEventId);
  const recentKinds = recentEvents.map(sandboxKindFromEventId);
  const lastTwoWereCharacterScenes = recentKinds.length >= 2
    && recentKinds.slice(-2).every((kind) => kind === "character" || kind === "relationship");
  const repeatPenalty = (archetype: string) => recentArchetypes.filter((entry) => entry === archetype).length * 58;
  const hasSeenManual = state.history.some((entry) => entry.eventId.startsWith("sandbox-manual:"));
  const hasSeenFallout = state.history.some((entry) => entry.eventId.startsWith("sandbox-fallout:"));
  const hasMartialHistory = state.history.some((entry) => (
    entry.choiceId.startsWith("sandbox-confront:") || entry.choiceId.startsWith("sandbox-duel:")
  ));
  const manualDiscoveryTurn = 2 + (state.seed % 4);
  const candidates: EventCandidateScore[] = state.world.actors
    .filter((actor) => (
      actor.id !== "hero"
      && !["死亡", "失踪"].includes(actor.activity)
      && !actor.traits.includes("年幼")
      && Boolean(characterForActor(state, actor.id))
    ))
    .map((actor) => {
      const targetLocationId = actor.locationId;
      const travelDays = worldDistance(state.world, state.currentLocationId, targetLocationId);
      const colocated = actorAtLocation(state.world, targetLocationId)
        .filter((entry) => entry.id !== "hero" && entry.id !== actor.id)
        .sort((left, right) => {
          const pressureFor = (candidateId: string) => state.world.relations
            .filter((relation) => relation.fromActorId === actor.id && relation.toActorId === candidateId)
            .reduce((total, relation) => total + relation.strength, 0);
          return pressureFor(right.id) - pressureFor(left.id);
        });
      const goalTargetId = actor.goals[0]?.targetActorId;
      const nearbyGoalTarget = goalTargetId
        ? state.world.actors.find((entry) => (
          entry.id === goalTargetId
          && entry.id !== actor.id
          && worldDistance(state.world, entry.locationId, targetLocationId) <= 1
        ))
        : undefined;
      const secondActor = colocated[0] || nearbyGoalTarget;
      const strongestRelation = strongestRelationBetween(state, actor.id, secondActor?.id);
      const awaitingFirstChallenge = actor.goals[0]?.kind === "挑战" && !hasMartialHistory && nextTurn >= 5;
      const relationshipScene = Boolean(
        secondActor
        && strongestRelation
        && (strongestRelation.strength >= 38 || strongestRelation.secret)
        && !awaitingFirstChallenge,
      );
      const archetype = relationshipScene
        ? relationArchetypeFor(strongestRelation!.type)
        : goalArchetypeFor(actor.goals[0]?.kind);
      const challengePressure = archetype === "challenge" && !hasMartialHistory
        ? Math.max(0, nextTurn - 3) * 26
        : 0;
      const relationPressure = state.world.relations
        .filter((relation) => relation.fromActorId === actor.id || relation.toActorId === actor.id)
        .reduce((total, relation) => total + relation.strength * (relation.secret && !relation.knownToHero ? 0.16 : 0.08), 0);
      const recentlySeen = recentEvents.filter((eventId) => eventId.includes(actor.id)).length;
      const goalPriority = actor.goals[0]?.priority || 40;
      const distanceFit = travelDays === 99 ? -300 : Math.max(-24, 28 - travelDays * 7);
      const score = Math.round(
        52
        + goalPriority * 0.55
        + relationPressure
        + (secondActor ? 18 : 0)
        + distanceFit
        + challengePressure
        - recentlySeen * 36
        - repeatPenalty(archetype)
        + rng.next() * 30,
      );
      return {
        eventId: `sandbox-${archetype}:${actor.id}${secondActor ? `:${secondActor.id}` : ""}:${nextTurn}`,
        targetLocationId,
        kind: relationshipScene ? "relationship" : "character",
        archetype,
        score,
        travelDays,
        focusTravelDays: secondActor ? worldDistance(state.world, secondActor.locationId, targetLocationId) : 0,
        relationPressure: Math.round(relationPressure),
        deadlinePressure: 0,
        reasons: [
          actor.goals[0]?.reason || "人物正沿自己的目标行动",
          relationshipScene
            ? `${actor.name}与${secondActor?.name || "旧识"}的既有关系正在改变此地局面`
            : `${actor.goals[0]?.kind || "行旅"}目标在此留下可追的事实`,
          recentlySeen ? "近日已经见过，导演会主动压低重复" : "此人近期尚未占据正文",
          ...(challengePressure ? ["卷中尚未出现正式约战，这条挑战线正在逼近"] : []),
        ],
      };
    });

  const current = currentLocation(state);
  const nearbyLocations = [current.id, ...current.connections]
    .map((locationId) => state.locations.find((location) => location.id === locationId))
    .filter((location): location is NovelLocation => Boolean(location));
  nearbyLocations.forEach((location, index) => {
    const placeArchetype = placeArchetypeFor(location);
    const archetype = `place-${placeArchetype}`;
    const openingBias = state.history.length === 0 && (state.seed + index) % 3 === 0 ? 78 : 0;
    const nonEncounterBias = lastTwoWereCharacterScenes ? 148 : 0;
    const localActors = actorAtLocation(state.world, location.id).filter((actor) => actor.id !== "hero");
    candidates.push({
      eventId: `sandbox-${archetype}:${location.id}:${nextTurn}`,
      targetLocationId: location.id,
      kind: "location",
      archetype,
      score: Math.round(72 + location.danger * 0.18 + localActors.length * 4 + openingBias + nonEncounterBias - repeatPenalty(archetype) + rng.next() * 34),
      travelDays: worldDistance(state.world, state.currentLocationId, location.id),
      focusTravelDays: 0,
      relationPressure: 0,
      deadlinePressure: nonEncounterBias,
      reasons: [
        `${location.name}自身的地貌与人流正在生成麻烦`,
        localActors.length ? "附近人物可能受其波及，但事件并不以偶遇某人为前提" : "即使无人停留，此地仍会留下物证与传闻",
        lastTwoWereCharacterScenes ? "连续人物相逢后，地点事件获得优先" : "地点异闻与人物目标共同参与导演选择",
      ],
    });
  });

  if (state.history.length > 0) {
    const archetype = "fallout";
    const falloutDroughtPressure = hasSeenFallout ? 0 : Math.max(0, nextTurn - 5) * 38;
    candidates.push({
      eventId: `sandbox-fallout:${nextTurn}`,
      targetLocationId: state.currentLocationId,
      kind: "fallout",
      archetype,
      score: Math.round(82 + (lastTwoWereCharacterScenes ? 112 : 0) + falloutDroughtPressure - repeatPenalty(archetype) + rng.next() * 30),
      travelDays: 0,
      focusTravelDays: 0,
      relationPressure: 0,
      deadlinePressure: (lastTwoWereCharacterScenes ? 80 : 0) + falloutDroughtPressure,
      reasons: [
        "上一回的选择已经进入传闻",
        "旧结果会反过来改变下一处的人和路",
        ...(!hasSeenFallout && falloutDroughtPressure ? ["这一卷尚未正面承受过选择的余波"] : []),
      ],
    });
  }

  state.world.manuals
    .filter((manual) => manual.state === "藏匿" && manual.locationId)
    .forEach((manual) => {
      const targetLocationId = manual.locationId!;
      const travelDays = worldDistance(state.world, state.currentLocationId, targetLocationId);
      const alreadySeen = state.history.some((entry) => entry.eventId.includes(manual.id));
      const discoveryPressure = hasSeenManual ? 0 : nextTurn >= manualDiscoveryTurn ? 240 : nextTurn * 8;
      candidates.push({
        eventId: `sandbox-manual:${manual.id}:${nextTurn}`,
        targetLocationId,
        kind: "manual",
        archetype: "manual",
        score: Math.round(66 + discoveryPressure + Math.max(-20, 18 - travelDays * 6) - (alreadySeen ? 110 : 0) - repeatPenalty("manual") + rng.next() * 28),
        travelDays,
        focusTravelDays: 0,
        relationPressure: 0,
        deadlinePressure: 0,
        reasons: [
          "抄本确实存放在这个地点",
          travelDays ? "需沿相邻道路追到它目前所在之处" : "抄本就在附近流转",
          alreadySeen ? "近期已经见过，重复权重降低" : "尚无人取得",
          ...(!hasSeenManual && nextTurn >= manualDiscoveryTurn ? ["这册抄本即将被下一位经手人带走"] : []),
        ],
      });
    });

  if (state.hero.health < 34) {
    candidates.push({
      eventId: "sandbox-recovery",
      targetLocationId: state.currentLocationId,
      kind: "recovery",
      archetype: "recovery",
      score: Math.round(136 + (34 - state.hero.health) * 2.2 - repeatPenalty("recovery")),
      travelDays: 0,
      focusTravelDays: 0,
      relationPressure: 0,
      deadlinePressure: 0,
      reasons: ["伤势已经影响下一次出手", "休息时其他人物仍会继续移动"],
    });
  }

  candidates.sort((left, right) => right.score - left.score || left.eventId.localeCompare(right.eventId));
  const selected = candidates[0];
  if (!selected) {
    const event = buildGeneric(state, rng);
    return {
      event,
      decision: { turn: nextTurn, selectedEventId: event.id, targetLocationId: event.locationId, candidates: [] },
    };
  }

  const decisionFor = (event: NovelEvent): DirectedEvent => ({
    event,
    decision: {
      turn: nextTurn,
      selectedEventId: event.id,
      selectedCandidateEventId: selected.eventId,
      targetLocationId: selected.targetLocationId,
      candidates,
    },
  });

  if (selected.eventId === "sandbox-recovery") {
    return decisionFor(buildAtLocation(state, selected.targetLocationId, (next) => buildRecovery(next), rng));
  }
  if (selected.eventId.startsWith("sandbox-manual:")) {
    const manualId = selected.eventId.split(":")[1];
    return decisionFor(buildSandboxManual({ ...state, currentLocationId: selected.targetLocationId }, manualId, selected.targetLocationId));
  }
  if (selected.kind === "location") {
    const placeArchetype = selected.archetype?.replace("place-", "") as PlaceEventArchetype;
    return decisionFor(buildSandboxPlaceEvent({ ...state, currentLocationId: selected.targetLocationId }, selected.targetLocationId, placeArchetype));
  }
  if (selected.kind === "fallout") {
    return decisionFor(buildSandboxFallout({ ...state, currentLocationId: selected.targetLocationId }));
  }

  const eventParts = selected.eventId.split(":");
  const actorId = eventParts[1];
  const secondActorId = eventParts.length >= 4 ? eventParts[2] : undefined;
  const archetype = selected.archetype as CharacterEventArchetype;
  return decisionFor(buildSandboxCharacterEvent(
    { ...state, currentLocationId: selected.targetLocationId },
    actorId,
    secondActorId,
    selected.targetLocationId,
    archetype,
  ));
};

const enterEvent = (state: NovelState, directed: DirectedEvent): NovelState => {
  const locationId = state.locations.some((location) => location.id === directed.decision.targetLocationId)
    ? directed.decision.targetLocationId
    : state.currentLocationId;
  const selectedActivity = state.campaign.availableActivities.find((activity) => activity.id === state.campaign.selectedActivityId);
  const world = advanceWorldToScene(state.world, {
    turn: state.turn + 1,
    eventId: directed.event.id,
    targetLocationId: locationId,
    companionActorIds: companionActorIds(state),
    focusActorIds: Array.from(new Set([
      ...focusActorsForEvent(directed.event.id),
      ...(selectedActivity?.targetActorId ? [selectedActivity.targetActorId] : []),
    ])),
    minimumElapsedDays: selectedActivity?.durationDays,
  });
  const heroLocationId = world.actors.find((actor) => actor.id === "hero")?.locationId || locationId;
  const traversed = world.lastTransition?.heroPath || [heroLocationId];
  const discoveredLocationIds = Array.from(new Set([...state.discoveredLocationIds, ...traversed]));
  const chapter = getChapter(state.turn + 1, state.campaign.chapterLength, state.campaign.agenda?.title);
  const travelLines = directed.event.id === "opening-oath" || !world.lastTransition
    ? []
    : [line(state.turn, -2, "narrative", world.lastTransition.travelProse)];
  const presentTitles = (world.lastTransition?.presentActorIds || [])
    .map((actorId) => world.actors.find((actor) => actor.id === actorId)?.title)
    .filter((title): title is string => Boolean(title))
    .slice(0, 4);
  if (directed.event.id !== "opening-oath" && presentTitles.length) {
    travelLines.push(line(state.turn, -1, "system", `此刻同在此地：${presentTitles.join("、")}。他们并非凭空出现，各自的行程都已走到这里。`));
  }
  return {
    ...state,
    world,
    chapter: chapter.number,
    chapterTitle: chapter.title,
    currentEvent: {
      ...directed.event,
      locationId: heroLocationId,
      locationName: currentLocation({ ...state, currentLocationId: heroLocationId }).name,
      lines: [...travelLines, ...directed.event.lines],
    },
    eventDirector: directed.decision,
    currentLocationId: heroLocationId,
    discoveredLocationIds,
  };
};

const introLines = (state: NovelState): StoryLogEntry[] => [
  { id: "intro-title", turn: 0, kind: "chapter", title: state.narrative.bible.title, text: state.narrative.bible.subtitle, tone: "warm" },
  { id: "intro-world", turn: 0, kind: "scene", text: `你以“${ORIGINS[state.hero.origin].label}”的身份踏入江湖，第一站是${currentLocation(state).name}。`, tone: "muted" },
  { id: "intro-rule", turn: 0, kind: "scene", text: "先选一条眼下最想走的路。每三幕合成一章，之后仍可换目标继续。", tone: "muted" },
];

const storyCharacterFromCampaign = (definition: CampaignCharacterDefinition, index: number): StoryCharacter => ({
  id: `character_${definition.id}`,
  rosterId: definition.id,
  sourcePackId: definition.sourcePackId,
  name: definition.name,
  sourceName: definition.sourceName,
  title: definition.title,
  factionId: definition.factionId,
  circles: [...definition.traits],
  role: definition.role,
  desire: definition.desire,
  fear: definition.fear,
  secret: definition.fear,
  signatureMove: definition.signatureMove,
  signatureDescription: definition.signatureDescription,
  secretRevealed: definition.factionId === "home",
  portrait: definition.portrait,
  romanceable: definition.romanceable,
  status: definition.factionId === "home" ? "在局中" : "未谋面",
  relationship: {
    trust: definition.factionId === "home" ? 38 + index * 4 : 8,
    affection: definition.factionId === "home" ? 18 + index * 3 : 4,
    debt: 0,
    grievance: 0,
    loyalty: definition.factionId === "home" ? 32 : 4,
    label: definition.factionId === "home" ? "试探" : "陌路",
  },
  ...(definition.factionId === "home" ? { firstSeenTurn: 0, lastSeenTurn: 0 } : {}),
});

const campaignTechniqueFor = (character: StoryCharacter, index: number): MartialTechniqueDef => ({
  id: `signature_${character.id}`,
  artId: `art_${character.id}`,
  name: character.signatureMove,
  nature: character.circles.some((trait) => /轻功|敏锐/.test(trait)) ? "身" : "攻",
  description: character.signatureDescription,
  power: 54 + index * 8,
  speed: 66 + index * 7,
  accuracy: 74 + index * 4,
  range: character.circles.some((trait) => /轻功/.test(trait)) ? "中" : "近",
  qiCost: 18 + index * 3,
  cooldown: 2,
  difficulty: 48 + index * 7,
  tags: [character.title, character.circles[0] || "独门"],
  counters: character.circles.some((trait) => /轻功/.test(trait)) ? ["封路"] : ["强攻"],
});

const extendWorldWithCampaignCharacters = (
  source: WuxiaWorldState,
  definitions: CampaignCharacterDefinition[],
  characters: StoryCharacter[],
  heroHomeId: string,
): WuxiaWorldState => {
  const techniques = characters.map(campaignTechniqueFor);
  const martialArts: WorldMartialArt[] = characters.map((character, index) => ({
    id: `art_${character.id}`,
    name: `${character.signatureMove}谱`,
    factionId: character.factionId,
    grade: index === 0 ? "上乘" : "中乘",
    category: character.circles.some((trait) => /轻功/.test(trait)) ? "轻功" : "外功",
    weapon: character.circles.some((trait) => /轻功/.test(trait)) ? "身法" : "剑",
    lineage: `${character.title}${character.name}平日拆解本门根基后整理出的个人路数。`,
    principle: character.desire,
    taboo: character.fear,
    techniqueIds: [techniques[index].id],
  }));
  const actors: WorldActor[] = characters.map((character, index) => {
    const definition = definitions[index];
    const homeId = definition.homeLocationId === "hero_home" ? heroHomeId : definition.homeLocationId;
    const routineLocationIds = definition.routineLocationIds
      .map((locationId) => (locationId === "hero_home" ? heroHomeId : locationId))
      .filter((locationId, locationIndex, entries) => source.locations.some((location) => location.id === locationId) && entries.indexOf(locationId) === locationIndex);
    return {
      id: `actor_${character.id}`,
      characterId: character.id,
      name: character.name,
      title: character.title,
      role: character.role,
      factionId: character.factionId,
      locationId: homeId,
      homeLocationId: homeId,
      route: [],
      activity: "停留",
      stayUntilDay: 3 + index,
      routineLocationIds,
      goals: [{
        kind: index === 0 ? "保护" : "赴约",
        ...(index === 0 ? { targetActorId: "hero" } : { targetLocationId: routineLocationIds[1] || homeId }),
        reason: character.desire,
        priority: 74 - index * 4,
      }],
      traits: [...character.circles],
      techniques: [{ techniqueId: techniques[index].id, mastery: 64 - index * 7, source: "师授", learnedDay: 0 }],
      memories: [],
    };
  });
  const relations: WorldRelation[] = actors.flatMap((actor, index) => {
    const known = actor.factionId === "home";
    const description = known
      ? `${actor.name}与你同在山门长大，熟悉彼此练功与当值的习惯；亲近与否仍要由往后的相处决定。`
      : `你只从传闻里听过${actor.name}的名号，尚未真正谋面。`;
    return [
      {
        id: `rel-hero-${actor.id}-sect_sibling`,
        fromActorId: "hero",
        toActorId: actor.id,
        type: "sect_sibling" as const,
        strength: known ? 42 + index * 4 : 12,
        knownToHero: known,
        secret: false,
        description,
        sinceDay: 0,
      },
      {
        id: `rel-${actor.id}-hero-sect_sibling`,
        fromActorId: actor.id,
        toActorId: "hero",
        type: "sect_sibling" as const,
        strength: known ? 40 + index * 3 : 10,
        knownToHero: known,
        secret: false,
        description,
        sinceDay: 0,
      },
    ];
  });
  return {
    ...source,
    actors: [...source.actors, ...actors],
    relations: [...source.relations, ...relations],
    techniques: [...source.techniques, ...techniques],
    martialArts: [...source.martialArts, ...martialArts],
  };
};

const initialCampaignLeads = (
  campaign: WuxiaCampaignState,
  characters: StoryCharacter[],
  world: WuxiaWorldState,
): WuxiaCampaignState => ({
  ...campaign,
  leads: [
    ...campaign.leads,
    ...characters
      .filter((character) => character.factionId === "home")
      .map((character): CampaignLead => {
      const actor = world.actors.find((entry) => entry.characterId === character.id)!;
      return {
        id: `lead_person_${actor.id}`,
        kind: "person",
        title: `与${character.name}的同门日常`,
        summary: `${character.title}正在${world.locations.find((location) => location.id === actor.locationId)?.name || "山门"}停留。可以结交、倾心、讨教，也可以暂缓。`,
        source: "朝夕相处的师门生活",
        status: "paused",
        progress: 8,
        discoveredTurn: 0,
        discoveredDay: 0,
        targetActorId: actor.id,
        targetLocationId: actor.locationId,
        intent: "observe",
      };
      }),
    ...world.manuals.map((manual): CampaignLead => {
      const locationName = world.locations.find((location) => location.id === manual.locationId)?.name || "某处旧地";
      return {
        id: `lead_manual_${manual.id}`,
        kind: "manual",
        title: `寻访${manual.name}`,
        summary: `${manual.provenance}眼下的消息指向${locationName}。`,
        source: "沿路抄书人与茶摊传出的零碎说法",
        status: "paused",
        progress: 0,
        discoveredTurn: 0,
        discoveredDay: 0,
        targetManualId: manual.id,
        targetLocationId: manual.locationId,
      };
    }),
  ],
});

export const ORIGIN_OPTIONS = Object.entries(ORIGINS).map(([id, value]) => ({ id: id as OriginId, ...value }));
export const AMBITION_OPTIONS = Object.entries(AMBITIONS).map(([id, value]) => ({ id: id as AmbitionId, ...value }));
export const LOCATION_OPTIONS = LOCATION_DATA;

export const createNovelState = (input: Partial<NovelSetup> = {}, extraPacks: WuxiaContentPack[] = []): NovelState => {
  const setup = sanitizeSetup(input);
  const {
    origin,
    ambition,
    heroName,
    seed: seedText,
    sectId,
  } = setup;
  const seed = hashSeed(seedText);
  const rng = createRng(seed);
  const content = createWuxiaContentRegistry(extraPacks);
  const originData = ORIGINS[origin];
  const sectName = getAffiliationName(sectId, origin);
  const locations = buildLocations(sectId, origin, content.locations);
  const knownLocationIds = new Set(locations.map((location) => location.id));
  content.opportunities.forEach((opportunity) => {
    if (!knownLocationIds.has(opportunity.locationId)) {
      throw new Error(`武侠盛事 ${opportunity.id} 指向不存在的地点 ${opportunity.locationId}`);
    }
  });
  const campaignDefinitions = content.characters.filter((definition) => !definition.originIds || definition.originIds.includes(origin));
  campaignDefinitions.forEach((definition) => {
    const referencedLocationIds = [definition.homeLocationId, ...definition.routineLocationIds]
      .filter((locationId) => locationId !== "hero_home");
    referencedLocationIds.forEach((referencedLocationId) => {
      if (!knownLocationIds.has(referencedLocationId)) {
        throw new Error(`武侠人物 ${definition.id} 指向不存在的地点 ${referencedLocationId}`);
      }
    });
  });
  const locationId = homeLocationId(sectId);
  const stats = { ...originData.stats, [AMBITIONS[ambition].stat]: originData.stats[AMBITIONS[ambition].stat] + 8 };
  let narrative = createNarrativeArchitecture({
    seed,
    heroName,
    origin,
    ambition,
    affiliationName: sectName,
    artName: originData.art,
  });
  let world = createWorldSimulation({
    seed,
    heroName,
    heroHomeId: locationId,
    affiliationName: sectName,
    locations,
    cast: narrative.cast,
    heroMartial: narrative.martial,
  });
  const campaignCharacters = campaignDefinitions.map(storyCharacterFromCampaign);
  if (campaignCharacters.length) {
    narrative = { ...narrative, cast: [...narrative.cast, ...campaignCharacters] };
    world = extendWorldWithCampaignCharacters(world, campaignDefinitions, campaignCharacters, locationId);
  }
  let campaign = createInitialCampaign({
    seed,
    origin,
    participantActorIds: world.actors.filter((actor) => actor.id !== "hero").map((actor) => actor.id),
    registry: content,
  });
  campaign = initialCampaignLeads(campaign, campaignCharacters, world);
  const state: NovelState = {
    version: 7,
    setup: { heroName, origin, ambition, sectId, seed: seedText },
    seed,
    rngState: rng.state,
    turn: 0,
    chapter: 1,
    chapterTitle: storyChapterFor(1).title,
    currentLocationId: locationId,
    locations,
    discoveredLocationIds: [locationId],
    hero: {
      name: heroName,
      origin,
      ambition,
      sectId,
      sectName,
      epithet: originData.epithet,
      art: originData.art,
      health: originData.health,
      maxHealth: originData.health,
      silver: originData.silver,
      clues: ambition === "truth" ? 1 : 0,
      heat: 0,
      level: 1,
      stats,
      inventory: [originData.art === "太祖长拳" ? "旧布包" : "门派腰牌"],
    },
    companions: [],
    flags: {},
    content,
    campaign,
    life: createLifeState(seed, Math.max(1, world.day), 1),
    chronicle: createWorldChronicle(seed, heroName, world.actors.filter((actor) => actor.id !== "hero").map((actor) => actor.id)),
    world,
    narrative,
    log: [],
    history: [],
    currentEvent: null,
  };
  const heroActor = state.world.actors.find((actor) => actor.id === "hero");
  if (heroActor) heroActor.birthDay = Math.max(1, state.world.day) - state.life.age * DAYS_PER_YEAR;
  state.log = introLines(state);
  return { ...state, rngState: rng.state };
};

const activityDefinitionFor = (state: NovelState, kind: PlayerActivity["kind"]) => (
  state.content.activities.find((definition) => definition.kind === kind) || state.content.activities[0]
);

const campaignActivity = (
  state: NovelState,
  kind: PlayerActivity["kind"],
  spec: Omit<PlayerActivity, "definitionId" | "kind" | "tone" | "sourcePackId"> & Partial<Pick<PlayerActivity, "tone">>,
): PlayerActivity => {
  const definition = activityDefinitionFor(state, kind);
  return {
    ...spec,
    definitionId: definition.id,
    kind,
    tone: spec.tone || definition.tone,
    sourcePackId: definition.sourcePackId,
  };
};

const activityPriority = (state: NovelState, activity: PlayerActivity) => {
  const favored = state.campaign.agenda?.favoredActivityKinds.includes(activity.kind) ? 80 : 0;
  const activeLead = activity.leadId && state.campaign.leads.find((lead) => lead.id === activity.leadId)?.status === "active" ? 54 : 0;
  const opportunityState = activity.opportunityId
    ? state.campaign.opportunities.find((entry) => entry.id === activity.opportunityId)
    : undefined;
  const opportunity = opportunityState
    ? Math.max(0, 38 - (opportunityState.endDay - state.world.day) * 3)
    : 0;
  const ongoingTournament = opportunityState?.roundsWon && opportunityState.status === "open" && !opportunityState.eliminated
    ? 240
    : 0;
  const available = activity.enabled ? 18 : -80;
  const essentials = activity.kind === "free_event"
    ? 7
    : activity.kind === "rest"
      ? 150
      : activity.kind === "rite"
        ? 132
        : activity.kind === "world_project"
          ? 92
          : 0;
  const unlockedMilestone = activity.enabled
    ? activity.kind === "found_sect" ? 140 : activity.kind === "invent" ? 105 : 0
    : 0;
  return favored + activeLead + opportunity + ongoingTournament + available + essentials + unlockedMilestone;
};

export const generatePlayerActivities = (state: NovelState): PlayerActivity[] => {
  if (!state.campaign.agenda) return [];
  const activities: PlayerActivity[] = [];
  const current = currentLocation(state);
  const homeId = homeLocationId(state.hero.sectId);
  const trainingLocationId = state.campaign.agenda.id === "sect_mastery" ? homeId : current.id;
  const trainingLocation = currentLocation(state, trainingLocationId);
  activities.push(campaignActivity(state, "train", {
    id: `activity-train:${trainingLocationId}:${state.turn + 1}`,
    title: trainingLocationId === current.id ? `在${current.name}温习本门招式` : `回${trainingLocation.name}专心练功`,
    description: trainingLocationId === current.id ? "从最生疏的一式开始拆练。" : `沿真实道路返回师门，再安排一日修习。`,
    risk: "低",
    durationDays: Math.max(8, worldDistance(state.world, current.id, trainingLocationId) * 4),
    targetLocationId: trainingLocationId,
    preview: ["招式熟练", "武学灵感"],
    enabled: true,
  }));

  const personLeads = state.campaign.leads
    .filter((lead) => lead.kind === "person" && lead.status !== "resolved" && lead.status !== "expired" && lead.targetActorId)
    .sort((left, right) => (left.status === "active" ? -1 : 1) - (right.status === "active" ? -1 : 1) || right.progress - left.progress)
    .slice(0, 3);
  personLeads.forEach((lead) => {
    const actor = state.world.actors.find((entry) => entry.id === lead.targetActorId);
    if (!actor) return;
    const distance = worldDistance(state.world, current.id, actor.locationId);
    activities.push(campaignActivity(state, distance === 0 ? "bond" : "pursue", {
      id: `activity-person:${lead.id}:${actor.locationId}:${state.turn + 1}`,
      title: distance === 0 ? `去见${actor.name}` : `循行踪去找${actor.name}`,
      description: `${intentLabel[lead.intent || "observe"]} · ${actor.name}此刻在${currentLocation(state, actor.locationId).name}${distance ? `，相隔${distance}站` : "，与你同地"}。`,
      risk: lead.intent === "revenge" ? "高" : lead.intent === "romance" ? "中" : "低",
      durationDays: Math.max(5, distance * 4),
      targetLocationId: actor.locationId,
      targetActorId: actor.id,
      leadId: lead.id,
      preview: [intentLabel[lead.intent || "observe"], "人物关系"],
      enabled: !["死亡", "失踪"].includes(actor.activity),
      ...(["死亡", "失踪"].includes(actor.activity) ? { unavailableReason: `${actor.name}目前无法追寻` } : {}),
    }));
  });

  state.campaign.leads
    .filter((lead) => lead.kind === "manual" && lead.status !== "resolved" && lead.status !== "expired")
    .sort((left, right) => (left.status === "active" ? -1 : 1) - (right.status === "active" ? -1 : 1) || right.progress - left.progress)
    .slice(0, 2)
    .forEach((lead) => {
      if (!lead.targetManualId || !lead.targetLocationId) return;
      const manual = state.world.manuals.find((entry) => entry.id === lead.targetManualId);
      if (!manual || manual.state !== "藏匿") return;
      const location = currentLocation(state, lead.targetLocationId);
      const distance = worldDistance(state.world, current.id, location.id);
      activities.push(campaignActivity(state, "investigate", {
        id: `activity-investigate:${lead.id}:${location.id}:${state.turn + 1}`,
        title: `循传闻追查${manual.name}`,
        description: `${lead.source} · 线索指向${location.name}${distance ? `，相隔${distance}站` : "，就在此地"}。`,
        risk: location.danger >= 62 ? "高" : location.danger >= 36 ? "中" : "低",
        durationDays: Math.max(6, distance * 4),
        targetLocationId: location.id,
        targetManualId: manual.id,
        leadId: lead.id,
        preview: ["秘籍来路", "地点查访"],
        enabled: true,
      }));
    });

  refreshOpportunityStatuses(state.campaign.opportunities, state.world.day)
    .filter((opportunity) => !["attended", "resolved", "missed"].includes(opportunity.status))
    .sort((left, right) => left.endDay - right.endDay)
    .slice(0, 3)
    .forEach((opportunity) => {
      const distance = worldDistance(state.world, current.id, opportunity.locationId);
      const durationDays = distance === 0 && opportunity.roundsRequired ? 2 : Math.max(4, distance * 4);
      const arrivalDay = state.world.day + durationDays;
      const arrivesBeforeOpening = arrivalDay < opportunity.startDay;
      const missesDeadline = arrivalDay > opportunity.endDay;
      const location = currentLocation(state, opportunity.locationId);
      activities.push(campaignActivity(state, "opportunity", {
        id: `activity-opportunity:${opportunity.id}:${state.turn + 1}`,
        title: arrivesBeforeOpening
          ? current.id === location.id ? `留在${location.name}等候${opportunity.shortTitle}` : `提前赶往${opportunity.shortTitle}`
          : `赶往${opportunity.shortTitle}`,
        description: arrivesBeforeOpening
          ? `${location.name} · 预计${calendarLabel(state, arrivalDay)}抵达，${calendarLabel(state, opportunity.startDay)}开场`
          : `${location.name} · ${calendarLabel(state, opportunity.startDay)}至${calendarLabel(state, opportunity.endDay)} · ${opportunity.organizer}`,
        risk: arrivesBeforeOpening ? "低" : opportunity.risk,
        durationDays,
        targetLocationId: opportunity.locationId,
        opportunityId: opportunity.id,
        opportunityStage: arrivesBeforeOpening ? "prepare" : "attend",
        leadId: `lead_${opportunity.id}`,
        preview: arrivesBeforeOpening
          ? ["提前抵达并准备", `${calendarLabel(state, opportunity.startDay)}开场`]
          : [opportunity.rewardHint, `还剩${Math.max(0, opportunity.endDay - state.world.day)}日`],
        enabled: !missesDeadline,
        ...(missesDeadline ? { unavailableReason: "按当前脚程已赶不上" } : {}),
      }));
    });

  const travelTargets = current.connections
    .map((locationId) => currentLocation(state, locationId))
    .filter((location, index, entries) => entries.findIndex((entry) => entry.id === location.id) === index)
    .sort((left, right) => {
      const leftKnown = state.discoveredLocationIds.includes(left.id) ? 1 : 0;
      const rightKnown = state.discoveredLocationIds.includes(right.id) ? 1 : 0;
      return leftKnown - rightKnown || right.danger - left.danger;
    })
    .slice(0, state.campaign.agenda.favoredActivityKinds.includes("travel") ? 3 : 2);
  travelTargets.forEach((location) => {
    activities.push(campaignActivity(state, "travel", {
      id: `activity-travel:${location.id}:${state.turn + 1}`,
      title: `动身去${location.name}`,
      description: `${location.region} · 相邻一站 · ${location.tags.slice(0, 2).join("、")}`,
      risk: location.danger >= 65 ? "高" : location.danger >= 38 ? "中" : "低",
      durationDays: 4,
      targetLocationId: location.id,
      preview: ["地点见闻", state.discoveredLocationIds.includes(location.id) ? "旧地新事" : "发现新地点"],
      enabled: true,
    }));
  });

  if (state.hero.health < state.hero.maxHealth) {
    activities.push(campaignActivity(state, "rest", {
      id: `activity-rest:${current.id}:${state.turn + 1}`,
      title: `在${current.name}停一日养伤`,
      description: "恢复气血；江湖人物、盛事期限和传闻仍会继续推进。",
      risk: "低",
      durationDays: 7,
      targetLocationId: current.id,
      preview: ["恢复气血", "世界继续"],
      enabled: true,
    }));
  }

  const inventRules = state.content.rules.inventTechnique;
  const canInvent = state.narrative.martial.mastery >= inventRules.martialMastery
    && state.campaign.legacy.martialInsights >= inventRules.martialInsights
    && state.hero.stats.fame >= inventRules.fame;
  if (state.campaign.legacy.martialInsights > 0 || state.turn >= state.campaign.chapterLength) {
    activities.push(campaignActivity(state, "invent", {
      id: `activity-invent:${state.turn + 1}`,
      title: "闭关推演一式自己的武学",
      description: canInvent
        ? "火候、见闻与名声都已足够，可以真正留下自创招式。"
        : `尚需本门火候、三次武学领悟与足以请人见证的名声。`,
      risk: "高",
      durationDays: 18,
      targetLocationId: current.id,
      preview: ["自创招式", "武学传承"],
      enabled: canInvent,
      ...(!canInvent ? { unavailableReason: "继续练功、实战或辨招以积累火候" } : {}),
    }));
  }

  if (state.campaign.legacy.authoredTechniques.length > 0) {
    const foundingRules = state.content.rules.foundSect;
    const canFound = state.hero.stats.fame >= foundingRules.fame
      && state.campaign.legacy.followers >= foundingRules.followers
      && state.campaign.legacy.authoredTechniques.length >= foundingRules.authoredTechniques
      && !state.campaign.legacy.foundedSect;
    const canTeach = !state.campaign.legacy.foundedSect && schoolFollowerCandidates(state).length > 0;
    const canPrepare = canFound || canTeach;
    activities.push(campaignActivity(state, "found_sect", {
      id: `activity-found-sect:${current.id}:${state.turn + 1}`,
      title: state.campaign.legacy.foundedSect
        ? `回望${state.campaign.legacy.foundedSect.name}`
        : canFound ? "择地开宗立派" : canTeach ? "先开一日传艺馆" : "寻找愿意学这门招式的人",
      description: state.campaign.legacy.foundedSect
        ? "新门派已经存在，后续人物与势力会按这层身份回应你。"
        : canFound
          ? "自创武学、名望与追随者已具备，可以决定门规与门庭。"
          : canTeach
            ? "先把自己的招式教给一位真实相识，看看这套武学能否成为传承。"
            : "已有自创招式，但还需要先认识愿意试学的人。",
      risk: canFound ? "高" : "中",
      durationDays: 14,
      targetLocationId: current.id,
      preview: canFound ? ["建立门派", "长期势力关系"] : ["真实人物试学", "积累追随者"],
      enabled: canPrepare,
      ...(state.campaign.legacy.foundedSect
        ? { unavailableReason: "你已经建立门派" }
        : !canPrepare ? { unavailableReason: "先结识人物，再邀请对方试学" } : {}),
    }));
  }

  const existingPartners = new Set(state.life.household.partners.map((partner) => partner.actorId));
  const swornSiblingIds = new Set(state.life.household.swornSiblingActorIds);
  const eligibleCharacters = state.narrative.cast
    .filter((character) => character.firstSeenTurn !== undefined && character.status !== "离去")
    .map((character) => ({
      character,
      actor: state.world.actors.find((actor) => actor.characterId === character.id),
    }))
    .filter((entry): entry is { character: StoryCharacter; actor: WorldActor } => (
      Boolean(entry.actor) && !["死亡", "失踪"].includes(entry.actor!.activity)
    ));

  eligibleCharacters.forEach(({ character, actor }) => {
    const distance = worldDistance(state.world, current.id, actor.locationId);
    const durationDays = Math.max(6, distance * 4);
    if (!swornSiblingIds.has(actor.id) && !existingPartners.has(actor.id) && character.relationship.trust >= 62 && character.relationship.loyalty >= 36) {
      activities.push(campaignActivity(state, "rite", {
        id: `activity-rite:oath:${actor.id}:${state.turn + 1}`,
        title: `与${actor.name}议一场结义`,
        description: `你们已经共同经历过足够多的事，可以当面决定是否把彼此写进家门。`,
        risk: "低",
        durationDays,
        targetLocationId: actor.locationId,
        targetActorId: actor.id,
        riteKind: "sworn_oath",
        preview: ["结义之礼", "关系不会自动替双方决定"],
        enabled: true,
      }));
    }
    const canMarry = !state.life.household.partners.some((partner) => partner.kind === "spouse")
      && !existingPartners.has(actor.id)
      && !swornSiblingIds.has(actor.id)
      && character.romanceable !== false
      && character.relationship.label === "情愫";
    if (canMarry) {
      activities.push(campaignActivity(state, "rite", {
        id: `activity-rite:marriage:${actor.id}:${state.turn + 1}`,
        title: `与${actor.name}商议婚事`,
        description: "情意已经说清，接下来仍要谈各自的去处、门派与愿不愿意结下名分。",
        risk: "中",
        durationDays,
        targetLocationId: actor.locationId,
        targetActorId: actor.id,
        riteKind: "marriage",
        preview: ["婚约", "家门与同行"],
        enabled: true,
      }));
    }
    const canBecomeConcubine = state.life.household.partners.some((partner) => partner.kind === "spouse")
      && !existingPartners.has(actor.id)
      && !swornSiblingIds.has(actor.id)
      && character.romanceable !== false
      && character.relationship.label === "情愫";
    if (canBecomeConcubine) {
      activities.push(campaignActivity(state, "rite", {
        id: `activity-rite:concubinage:${actor.id}:${state.turn + 1}`,
        title: `与${actor.name}议定侧室名分`,
        description: "已有家门之后再添一人，必须把名分、去留和各自承担的后果当面说清。",
        risk: "高",
        durationDays,
        targetLocationId: actor.locationId,
        targetActorId: actor.id,
        riteKind: "concubinage",
        preview: ["侧室名分", "家门关系会改变"],
        enabled: true,
      }));
    }
  });

  state.life.household.partners.forEach((partner) => {
    const actor = state.world.actors.find((entry) => entry.id === partner.actorId);
    if (!actor || ["死亡", "失踪"].includes(actor.activity) || state.world.day - partner.sinceDay < 30) return;
    const hasChildThisYear = state.life.household.children.some((child) => wuxiaDateFromDay(child.birthDay).year === wuxiaDateFromDay(state.world.day).year);
    if (hasChildThisYear) return;
    const distance = worldDistance(state.world, current.id, actor.locationId);
    activities.push(campaignActivity(state, "rite", {
      id: `activity-rite:child:${actor.id}:${state.turn + 1}`,
      title: `与${actor.name}商议添丁`,
      description: "成家不等于必然生子；你们可以选择添丁、收养，或把这件事留到以后。",
      risk: "中",
      durationDays: Math.max(12, distance * 4),
      targetLocationId: actor.locationId,
      targetActorId: actor.id,
      riteKind: "child",
      preview: ["子女会成为真实人物", "可在同一世界长大"],
      enabled: true,
    }));
  });

  const currentYear = wuxiaDateFromDay(state.world.day).year;
  state.chronicle.projects
    .filter((project) => !["resolved", "failed"].includes(project.status) && project.startYear <= currentYear)
    .slice(0, 3)
    .forEach((project) => {
      const distance = worldDistance(state.world, current.id, project.locationId);
      activities.push(campaignActivity(state, "world_project", {
        id: `activity-project:${project.id}:${state.turn + 1}`,
        title: project.shortTitle,
        description: `${project.stage} · ${project.description}`,
        risk: project.stage === "最后一役" ? "高" : project.kind === "invasion" ? "中" : "高",
        durationDays: Math.max(10, distance * 4),
        targetLocationId: project.locationId,
        targetActorId: project.targetActorId,
        projectId: project.id,
        preview: [project.stage, "此事会跨章节与主角保留"],
        enabled: true,
      }));
    });

  activities.push(campaignActivity(state, "free_event", {
    id: `activity-free:${current.id}:${state.turn + 1}`,
    title: "暂不追目标，看看此地今日发生什么",
    description: "让事件导演从人物位置、关系、余波和地方事实中挑一幕。",
    risk: "中",
    durationDays: 6,
    targetLocationId: current.id,
    preview: ["自由江湖", "可能出现新线索"],
    enabled: true,
  }));

  const sorted = activities.sort((left, right) => activityPriority(state, right) - activityPriority(state, left) || left.id.localeCompare(right.id));
  const limit = Math.max(5, state.content.rules.maxVisibleActivities);
  const guaranteed = [
    sorted.find((activity) => activity.kind === "opportunity" && activity.enabled),
    sorted.find((activity) => activity.kind === "world_project" && activity.enabled),
    sorted.find((activity) => activity.kind === "rite" && activity.enabled)
      || sorted.find((activity) => ["bond", "pursue"].includes(activity.kind) && activity.enabled),
    sorted.find((activity) => activity.kind === "train"),
    sorted.find((activity) => activity.kind === "free_event"),
  ].filter((activity): activity is PlayerActivity => Boolean(activity));
  const selectedIds = new Set(guaranteed.map((activity) => activity.id));
  const visible = [
    ...guaranteed,
    ...sorted.filter((activity) => !selectedIds.has(activity.id)),
  ].slice(0, limit);
  return visible.sort((left, right) => sorted.indexOf(left) - sorted.indexOf(right));
};

export const getPlayerAgendaOptions = (state: NovelState) => agendaDefinitionsForOrigin(state.content, state.hero.origin);

export const selectPlayerAgenda = (state: NovelState, agendaId: string): NovelState => {
  if (state.pendingOutcome || state.campaign.phase === "scene" || state.ending) return state;
  const definition = getPlayerAgendaOptions(state).find((agenda) => agenda.id === agendaId);
  if (!definition) return state;
  const agenda = playerAgendaFromDefinition(definition, state.turn);
  const preferredLead = definition.favoredActivityKinds.includes("bond")
    ? state.campaign.leads.find((lead) => lead.kind === "person")
    : definition.favoredActivityKinds.includes("opportunity")
      ? state.campaign.leads.find((lead) => lead.kind === "opportunity")
      : undefined;
  if (preferredLead) {
    agenda.targetLeadId = preferredLead.id;
    agenda.targetActorId = preferredLead.targetActorId;
    agenda.intent = preferredLead.intent;
  }
  const campaign: WuxiaCampaignState = {
    ...state.campaign,
    phase: "planning",
    agenda,
    chapterMilestone: undefined,
    selectedActivityId: undefined,
    leads: state.campaign.leads.map((lead) => (lead.id === preferredLead?.id ? { ...lead, status: "active" } : lead)),
    opportunities: refreshOpportunityStatuses(state.campaign.opportunities, state.world.day),
    availableActivities: [],
  };
  const next = { ...state, campaign, currentEvent: null };
  return { ...next, campaign: { ...campaign, availableActivities: generatePlayerActivities(next) } };
};

export const setPlayerLeadIntent = (state: NovelState, leadId: string, intent: PlayerIntent): NovelState => {
  if (!state.campaign.agenda || !["planning", "chapter_break"].includes(state.campaign.phase)) return state;
  const lead = state.campaign.leads.find((entry) => entry.id === leadId);
  if (!lead || lead.kind !== "person") return state;
  const campaign: WuxiaCampaignState = {
    ...state.campaign,
    agenda: {
      ...state.campaign.agenda,
      targetLeadId: lead.id,
      targetActorId: lead.targetActorId,
      intent,
    },
    leads: state.campaign.leads.map((entry) => (entry.id === leadId ? { ...entry, status: "active", intent } : entry)),
    availableActivities: [],
  };
  const next = { ...state, campaign };
  return { ...next, campaign: { ...campaign, availableActivities: generatePlayerActivities(next) } };
};

export const pausePlayerLead = (state: NovelState, leadId: string): NovelState => {
  if (!state.campaign.agenda || state.campaign.phase !== "planning") return state;
  const campaign: WuxiaCampaignState = {
    ...state.campaign,
    agenda: state.campaign.agenda.targetLeadId === leadId
      ? { ...state.campaign.agenda, targetLeadId: undefined, targetActorId: undefined, intent: undefined }
      : state.campaign.agenda,
    leads: state.campaign.leads.map((lead) => (lead.id === leadId ? { ...lead, status: "paused" } : lead)),
    availableActivities: [],
  };
  const next = { ...state, campaign };
  return { ...next, campaign: { ...campaign, availableActivities: generatePlayerActivities(next) } };
};

export const choosePlayerActivity = (state: NovelState, activityId: string): NovelState => {
  if (state.campaign.phase !== "planning" || state.pendingOutcome || state.currentEvent || state.ending) return state;
  const activity = state.campaign.availableActivities.find((entry) => entry.id === activityId);
  if (!activity?.enabled) return state;
  const prepared: NovelState = {
    ...state,
    campaign: { ...state.campaign, phase: "scene", selectedActivityId: activity.id },
  };
  if (activity.kind === "free_event") {
    const rng = createRng(prepared.rngState);
    const entered = enterEvent({ ...prepared, rngState: rng.state }, chooseSandboxEvent(prepared, rng));
    return { ...entered, rngState: rng.state, campaign: { ...entered.campaign, opportunities: refreshOpportunityStatuses(entered.campaign.opportunities, entered.world.day) } };
  }
  let event: NovelEvent;
  if (activity.kind === "train") event = buildCampaignTrainingEvent(prepared, activity);
  else if (activity.kind === "bond") event = buildCampaignBondEvent(prepared, activity);
  else if (activity.kind === "pursue") event = buildCampaignPursuitEvent(prepared, activity);
  else if (activity.kind === "opportunity") event = activity.opportunityStage === "prepare"
    ? buildCampaignOpportunityPreparationEvent(prepared, activity)
    : buildCampaignOpportunityEvent(prepared, activity);
  else if (activity.kind === "rest") event = buildRecovery({ ...prepared, currentLocationId: activity.targetLocationId });
  else if (activity.kind === "invent") event = buildCampaignInventEvent(prepared, activity);
  else if (activity.kind === "found_sect") event = buildCampaignFoundSectEvent(prepared, activity);
  else if (activity.kind === "rite") event = buildLifeRiteEvent(prepared, activity);
  else if (activity.kind === "world_project") event = buildWorldProjectEvent(prepared, activity);
  else if (activity.kind === "investigate" && activity.targetManualId) {
    event = buildSandboxManual({ ...prepared, currentLocationId: activity.targetLocationId }, activity.targetManualId, activity.targetLocationId);
  } else if (activity.kind === "investigate" && activity.targetActorId) event = buildCampaignPursuitEvent(prepared, activity);
  else event = buildCampaignTravelEvent(prepared, activity);
  const entered = enterEvent(prepared, directedCampaignEvent(prepared, activity, event));
  return {
    ...entered,
    campaign: {
      ...entered.campaign,
      opportunities: refreshOpportunityStatuses(entered.campaign.opportunities, entered.world.day),
    },
  };
};

const makeOutcomeLog = (state: NovelState, lines: NovelLine[], success: boolean): StoryLogEntry[] => lines.map((entry, index) => ({
  id: `outcome-${state.turn}-${index}-${entry.id}`,
  turn: state.turn,
  kind: "outcome",
  text: entry.speaker ? `${entry.speaker}：${entry.text}` : entry.text,
  tone: success ? "bright" : "danger",
}));

const signedValue = (value: number) => (value > 0 ? `+${value}` : `${value}`);

const makeOutcomeChanges = (before: NovelState, after: NovelState): OutcomeChange[] => {
  const changes: OutcomeChange[] = [];
  const addNumber = (label: string, value: number, positiveIsGood = true) => {
    if (value === 0) return;
    const isGood = positiveIsGood ? value > 0 : value < 0;
    changes.push({ label, value: signedValue(value), tone: isGood ? "good" : "bad" });
  };

  addNumber("气血", after.hero.health - before.hero.health);
  addNumber("银两", after.hero.silver - before.hero.silver);
  addNumber("线索", after.hero.clues - before.hero.clues);
  addNumber("风声", after.hero.heat - before.hero.heat, false);
  addNumber("境界", after.hero.level - before.hero.level);
  (Object.keys(STAT_LABELS) as StatKey[]).forEach((key) => {
    addNumber(STAT_LABELS[key], after.hero.stats[key] - before.hero.stats[key]);
  });

  after.hero.inventory
    .filter((item) => !before.hero.inventory.includes(item))
    .forEach((item) => changes.push({ label: "获得", value: item, tone: "good" }));
  before.hero.inventory
    .filter((item) => !after.hero.inventory.includes(item))
    .forEach((item) => changes.push({ label: "失去", value: item, tone: "bad" }));

  after.companions.forEach((companion) => {
    const previous = before.companions.find((entry) => entry.id === companion.id);
    if (!previous) {
      changes.push({ label: "同行", value: `${companion.name}加入`, tone: "good" });
      return;
    }
    addNumber(`${companion.name}情分`, companion.affinity - previous.affinity);
  });

  const beforeHeroActor = before.world.actors.find((actor) => actor.id === "hero");
  const afterHeroActor = after.world.actors.find((actor) => actor.id === "hero");
  afterHeroActor?.techniques.forEach((technique) => {
    const previous = beforeHeroActor?.techniques.find((entry) => entry.techniqueId === technique.techniqueId);
    const definition = after.world.techniques.find((entry) => entry.id === technique.techniqueId);
    if (!previous) {
      changes.push({ label: "新招", value: `${definition?.name || technique.techniqueId} · ${technique.source}`, tone: "good" });
      return;
    }
    if (technique.mastery !== previous.mastery) {
      changes.push({ label: "熟练", value: `${definition?.name || technique.techniqueId} +${technique.mastery - previous.mastery}`, tone: "good" });
    }
  });
  after.world.manuals.forEach((manual) => {
    const previous = before.world.manuals.find((entry) => entry.id === manual.id);
    if (previous && previous.state !== manual.state) {
      changes.push({ label: "秘籍", value: `${manual.name} · ${manual.state}`, tone: manual.state === "携带" ? "good" : "neutral" });
    }
  });
  const revealedRelations = after.world.relations.filter((relation) => (
    relation.knownToHero
    && !before.world.relations.find((entry) => entry.id === relation.id)?.knownToHero
  )).length;
  if (revealedRelations > 0) changes.push({ label: "关系", value: `揭开 ${revealedRelations} 条`, tone: "good" });

  after.narrative.factions.forEach((faction) => {
    const previous = before.narrative.factions.find((entry) => entry.id === faction.id);
    if (!previous) return;
    const favorDelta = faction.favor - previous.favor;
    const pressureDelta = faction.pressure - previous.pressure;
    if (favorDelta === 0 && pressureDelta === 0) return;
    const parts = [
      ...(favorDelta ? [`往来${favorDelta > 0 ? "+" : ""}${favorDelta}`] : []),
      ...(pressureDelta ? [`戒心${pressureDelta > 0 ? "+" : ""}${pressureDelta}`] : []),
    ];
    changes.push({
      label: faction.name,
      value: parts.join(" · "),
      tone: favorDelta > 0 && pressureDelta <= 0 ? "good" : pressureDelta > Math.max(0, favorDelta) ? "bad" : "neutral",
    });
  });

  const followerDelta = after.campaign.legacy.followers - before.campaign.legacy.followers;
  if (followerDelta > 0) changes.push({ label: "追随", value: `新增 ${followerDelta} 人`, tone: "good" });

  if (after.currentLocationId !== before.currentLocationId) {
    changes.push({ label: "前往", value: currentLocation(after).name, tone: "neutral" });
  }
  return changes;
};

const cloneNarrative = (narrative: NarrativeArchitecture): NarrativeArchitecture => ({
  ...narrative,
  bible: { ...narrative.bible, recurringMotifs: [...narrative.bible.recurringMotifs] },
  cast: narrative.cast.map((character) => ({
    ...character,
    relationship: { ...character.relationship },
  })),
  factions: narrative.factions.map((faction) => ({ ...faction })),
  martial: {
    ...narrative.martial,
    techniques: narrative.martial.techniques.map((technique) => ({ ...technique })),
  },
  threads: narrative.threads.map((thread) => ({ ...thread })),
  chapters: narrative.chapters.map((chapter) => ({
    ...chapter,
    scenes: chapter.scenes.map((scene) => ({
      ...scene,
      paragraphs: [...scene.paragraphs],
      characterIds: [...scene.characterIds],
      factionIds: [...scene.factionIds],
      techniqueIds: [...scene.techniqueIds],
      ...(scene.combat ? {
        combat: {
          ...scene.combat,
          hero: { ...scene.combat.hero, techniquesUsed: [...scene.combat.hero.techniquesUsed] },
          enemy: { ...scene.combat.enemy, techniquesUsed: [...scene.combat.enemy.techniquesUsed] },
          exchanges: scene.combat.exchanges.map((exchange) => ({ ...exchange })),
          techniqueIds: [...scene.combat.techniqueIds],
          novelParagraphs: [...scene.combat.novelParagraphs],
        },
      } : {}),
    })),
  })),
});

const threadProgressFor = (eventId: string): Partial<Record<NarrativeArchitecture["threads"][number]["id"], number>> => ({
  "opening-oath": { bronze_seal: 22 },
  "tea-whisper": { bronze_seal: 38 },
  "bridge-ambush": { bronze_seal: 52 },
  "rain-pavilion": { bronze_seal: 58, rain_secret: 28 },
  "broken-manual": { broken_form: 42 },
  "sect-trial": { sect_debt: 58, bronze_seal: 65 },
  traitor: { rain_secret: 78, bronze_seal: 76 },
  "duel-at-dawn": { sect_debt: 74, broken_form: 72 },
  "alliance-council": { sect_debt: 88, final_choice: 34 },
  "lantern-healer": { bronze_seal: 92, rain_secret: 88, final_choice: 56 },
  "final-confrontation": {
    bronze_seal: 100,
    rain_secret: 100,
    sect_debt: 100,
    broken_form: 100,
    final_choice: 100,
  },
}[eventId] || { final_choice: 68 });

const advanceNarrative = (
  before: NovelState,
  after: NovelState,
  event: NovelEvent,
  selected: NovelChoice,
  success: boolean,
  turn: number,
): { narrative: NarrativeArchitecture; discovery?: string } => {
  const narrative = cloneNarrative(before.narrative);
  let discovery: string | undefined;
  const findCharacter = (id: StoryCharacter["id"]) => narrative.cast.findIndex((character) => character.id === id);
  const changeCharacter = (
    id: StoryCharacter["id"],
    changes: Parameters<typeof updateRelationship>[1],
    status?: StoryCharacter["status"],
    reveal = false,
  ) => {
    const index = findCharacter(id);
    if (index < 0) return;
    narrative.cast[index] = {
      ...updateRelationship(narrative.cast[index], changes, turn, status),
      secretRevealed: narrative.cast[index].secretRevealed || reveal,
    };
    if (reveal && !before.narrative.cast[index].secretRevealed) {
      discovery = `${narrative.cast[index].name}的隐秘已经揭开`;
    }
  };
  const changeFaction = (id: FactionState["id"], changes: Parameters<typeof updateFaction>[1]) => {
    const index = narrative.factions.findIndex((faction) => faction.id === id);
    if (index < 0) return;
    const wasRevealed = narrative.factions[index].agendaRevealed;
    narrative.factions[index] = updateFaction(narrative.factions[index], changes);
    if (!wasRevealed && narrative.factions[index].agendaRevealed) {
      discovery = `${narrative.factions[index].name}的真实打算浮出水面`;
    }
  };

  if (event.id.startsWith("sandbox") || event.id.startsWith("campaign")) {
    const focusActorIds = focusActorsForEvent(event.id);
    const focusCharacterIds = focusActorIds
      .map((actorId) => before.world.actors.find((actor) => actor.id === actorId)?.characterId)
      .filter((characterId): characterId is string => Boolean(characterId));
    focusCharacterIds.forEach((characterId) => changeCharacter(
      characterId,
      {},
      after.companions.some((companion) => companion.characterId === characterId) ? "同行" : "在局中",
    ));

    const selectedActorId = selected.id.split(":")[1];
    const selectedActor = before.world.actors.find((actor) => actor.id === selectedActorId);
    const selectedCharacterId = selectedActor?.characterId;
    const selectedCharacter = selectedCharacterId ? narrative.cast.find((character) => character.id === selectedCharacterId) : undefined;
    if (selected.id.startsWith("sandbox-aid:") && selectedCharacter) {
      changeCharacter(selectedCharacter.id, {
        trust: success ? 24 : 5,
        affection: success ? 9 : 1,
        debt: success ? 16 : 4,
        loyalty: success ? 12 : 0,
        grievance: success ? -3 : 7,
      }, after.companions.some((companion) => companion.characterId === selectedCharacter.id) ? "同行" : "在局中");
      changeFaction(selectedCharacter.factionId, { favor: success ? 9 : 2, pressure: success ? -2 : 5 });
      discovery = success && after.companions.some((companion) => companion.characterId === selectedCharacter.id)
        ? `${selectedCharacter.name}的个人目标从此会随你们共同的行程继续变化`
        : discovery;
    }
    if (selected.id.startsWith("sandbox-duel:") && selectedCharacter) {
      changeCharacter(selectedCharacter.id, {
        trust: success ? 12 : 6,
        grievance: success ? 5 : 11,
        debt: success ? 2 : 7,
      }, "在局中", true);
      changeFaction(selectedCharacter.factionId, { favor: success ? 5 : -2, pressure: success ? 4 : 8 });
      discovery = `你已在实战中见过${selectedCharacter.name}的“${selectedCharacter.signatureMove}”`;
    }
    if (selected.id.startsWith("sandbox-observe:") && selectedCharacter) {
      changeCharacter(selectedCharacter.id, {
        trust: success ? 5 : -8,
        grievance: success ? 0 : 10,
      }, "在局中", success);
      changeFaction(selectedCharacter.factionId, { favor: success ? 3 : -3, pressure: success ? 2 : 7, revealed: success });
    }
    const supportiveChoice = /^sandbox-(guard|tend|decoy|warn|deliver|separate|back|repay|broker|keep-secret|reconcile|carry-message):/.test(selected.id);
    const investigativeChoice = /^sandbox-(track|lure|terms|witness|mediate|shadow|proof|reveal|ask-truth):/.test(selected.id);
    const martialChoice = /^sandbox-(confront|ask-teach|compare):/.test(selected.id);
    if (supportiveChoice && selectedCharacter) {
      changeCharacter(selectedCharacter.id, {
        trust: success ? 18 : 5,
        affection: success ? 7 : 1,
        debt: success ? 12 : 4,
        loyalty: success ? 8 : 0,
        grievance: success ? -3 : 5,
      }, after.companions.some((companion) => companion.characterId === selectedCharacter.id) ? "同行" : "在局中");
      changeFaction(selectedCharacter.factionId, { favor: success ? 7 : 2, pressure: success ? -2 : 4 });
      discovery = success && after.companions.some((companion) => companion.characterId === selectedCharacter.id)
        ? `${selectedCharacter.name}决定把自己的下一段行程与你放在一起`
        : discovery;
    }
    if (investigativeChoice && selectedCharacter) {
      changeCharacter(selectedCharacter.id, {
        trust: success ? 9 : -3,
        debt: success ? 4 : 0,
        grievance: success ? -1 : 7,
      }, "在局中", success);
      changeFaction(selectedCharacter.factionId, { favor: success ? 4 : -2, pressure: success ? 1 : 6, revealed: success });
      discovery = success ? `${selectedCharacter.name}所追之事终于露出一段真实来路` : discovery;
    }
    if (martialChoice && selectedCharacter) {
      const isHostileConfrontation = selected.id.startsWith("sandbox-confront:");
      changeCharacter(selectedCharacter.id, {
        trust: success ? 12 : 5,
        grievance: isHostileConfrontation ? (success ? 18 : 12) : 0,
        debt: selected.id.startsWith("sandbox-ask-teach:") ? (success ? 10 : 4) : 2,
      }, "在局中", true);
      changeFaction(selectedCharacter.factionId, isHostileConfrontation
        ? { favor: success ? -8 : -4, pressure: success ? 14 : 9 }
        : { favor: success ? 5 : -1, pressure: success ? 3 : 7 });
      discovery = `你已亲眼见过${selectedCharacter.name}如何运转“${selectedCharacter.signatureMove}”`;
    }
    if (selected.id.startsWith("campaign-bond:") && selectedCharacter) {
      const intent = selected.id.split(":")[2] as PlayerIntent;
      const changes = intent === "romance"
        ? { trust: success ? 8 : 2, affection: success ? 22 : 7, loyalty: success ? 6 : 1, grievance: success ? -2 : 2 }
        : intent === "befriend"
          ? { trust: success ? 16 : 6, affection: success ? 7 : 2, loyalty: success ? 8 : 2, grievance: success ? -2 : 1 }
          : { trust: success ? 5 : 1, affection: success ? 2 : 0, loyalty: 1, grievance: 0 };
      changeCharacter(selectedCharacter.id, changes, "在局中", success && intent === "observe");
      changeFaction(selectedCharacter.factionId, { favor: success ? 4 : 1, pressure: success ? -1 : 2 });
      discovery = intent === "romance"
        ? success ? `你与${selectedCharacter.name}的关系开始有了情意，但仍要由往后的相处回答` : `${selectedCharacter.name}没有接受更近一步，却保留了坦诚相处的余地`
        : `你与${selectedCharacter.name}的关系有了新的共同经历`;
    }
    if (selected.id.startsWith("campaign-opportunity-social:") && selectedCharacter) {
      changeCharacter(selectedCharacter.id, { trust: success ? 12 : 4, affection: success ? 4 : 1, loyalty: success ? 4 : 0 }, "在局中");
      changeFaction(selectedCharacter.factionId, { favor: success ? 6 : 2, pressure: success ? -1 : 2 });
      discovery = success ? `${selectedCharacter.name}已经成为可以主动拜访的人` : discovery;
    }
    if (selected.id.startsWith("campaign-opportunity-study:") && selectedCharacter) {
      changeCharacter(selectedCharacter.id, { trust: success ? 7 : 2, debt: success ? 3 : 0 }, "在局中", true);
      changeFaction(selectedCharacter.factionId, { favor: success ? 3 : 0, pressure: success ? 1 : 3, revealed: success });
      discovery = success ? `你从公开演武中辨出${selectedCharacter.name}的招式传承` : discovery;
    }
    if (selected.id.startsWith("campaign-defer:") && selectedCharacter) {
      changeCharacter(selectedCharacter.id, { trust: 1 }, "在局中");
    }

    narrative.threads = narrative.threads.map((thread) => {
      if (!thread.actorIds.some((actorId) => focusCharacterIds.includes(actorId))) return thread;
      const progress = clamp(thread.progress + (success ? 30 : 18), 0, 100);
      return {
        ...thread,
        progress,
        status: progress >= 100 ? "兑现" : progress >= 35 ? "推进" : "埋下",
        ...(progress >= 100 ? { payoffTurn: turn } : {}),
      };
    });
    const martialGain = selected.id.startsWith("sandbox-duel:") || martialChoice
      ? (success ? 9 : 5)
      : selected.id.startsWith("sandbox-manual-learn:")
        ? (success ? 11 : 5)
        : selected.id.startsWith("campaign-train:")
          ? (success ? 8 : 4)
          : selected.id.startsWith("campaign-opportunity-study:") || selected.id.startsWith("campaign-invent:")
            ? (success ? 5 : 3)
            : event.id.startsWith("sandbox") ? (success ? 3 : 2) : 0;
    if (martialGain > 0) {
      narrative.martial.mastery = clamp(narrative.martial.mastery + martialGain, 0, 100);
      const practicedId = selected.id.startsWith("sandbox-duel:") || martialChoice || selected.id.startsWith("sandbox-manual-learn:") || selected.id.startsWith("campaign-invent:")
        ? narrative.martial.techniques[1].id
        : narrative.martial.techniques[0].id;
      narrative.martial.techniques = narrative.martial.techniques.map((technique) => {
        if (technique.id !== practicedId) return technique;
        const mastery = clamp(technique.mastery + martialGain * 2, 0, 100);
        return { ...technique, mastery, status: mastery >= 75 ? "大成" : mastery >= 20 ? "初悟" : technique.status, unlockedTurn: technique.unlockedTurn ?? turn };
      });
    }
    after.companions = after.companions.map((companion) => {
      const character = narrative.cast.find((entry) => entry.id === companion.characterId);
      return character
        ? { ...companion, affinity: clamp(Math.round(character.relationship.trust * 0.5 + character.relationship.affection * 0.2 + character.relationship.loyalty * 0.3), 0, 100) }
        : companion;
    });
    return { narrative, ...(discovery ? { discovery } : {}) };
  }

  if (event.id === "tea-whisper" || event.id === "bridge-ambush") {
    changeCharacter("grey_rival", { trust: success ? 2 : 0 }, "在局中");
  }
  if (event.id === "rain-pavilion") changeCharacter("rain_witness", {}, "在局中");
  if (event.id === "duel-at-dawn") changeCharacter("grey_rival", {}, "在局中", true);
  if (event.id === "lantern-healer") changeCharacter("lantern_healer", {}, "在局中", true);
  if (event.id === "final-confrontation") changeCharacter("tide_master", {}, "敌对", true);

  switch (selected.id) {
    case "open-letter":
      changeFaction("guichao", { favor: 4, pressure: success ? 3 : 8 });
      break;
    case "burn-letter":
      changeFaction("guichao", { favor: 7, pressure: -4 });
      break;
    case "ask-master":
      changeFaction("home", { favor: success ? 9 : 2, pressure: success ? 2 : 8 });
      break;
    case "follow-hat":
      changeCharacter("grey_rival", { trust: success ? 7 : -2, grievance: success ? -2 : 4 }, "在局中");
      changeFaction("guichao", { favor: success ? 5 : -2, pressure: success ? 8 : 13 });
      break;
    case "fight-bridge":
      changeCharacter("grey_rival", { trust: success ? 8 : 2, grievance: success ? 2 : 7 }, "在局中");
      changeFaction("guichao", { favor: -6, pressure: success ? 16 : 10 });
      break;
    case "break-bridge":
      changeFaction("guichao", { pressure: success ? -5 : 7 });
      break;
    case "name-master":
      changeFaction("home", { favor: success ? 10 : -4, pressure: success ? 4 : 12 });
      break;
    case "invite-companion":
      changeCharacter("rain_witness", { trust: 28, affection: 12, loyalty: 24, debt: 4 }, "同行");
      break;
    case "trade-clue":
      changeCharacter("rain_witness", { trust: success ? 14 : 5, affection: 3, loyalty: success ? 7 : 1 }, "在局中");
      break;
    case "leave-rain":
      changeCharacter("rain_witness", { trust: -6, affection: -2, grievance: 10 }, "离去");
      break;
    case "learn-manual":
      changeFaction("guichao", { favor: success ? 5 : 2, pressure: 4 });
      break;
    case "return-manual":
      changeFaction("changhe", { favor: 9, pressure: -3 });
      break;
    case "tell-truth":
      changeFaction("home", { favor: success ? 18 : 4, pressure: success ? 8 : 16, revealed: true });
      break;
    case "hide-sect":
      changeFaction("home", { favor: -4, pressure: 9, revealed: true });
      break;
    case "leave-sect":
      changeFaction("home", { favor: -18, pressure: 17, revealed: true });
      break;
    case "trust-companion": {
      const companionCharacterId = before.companions[0]?.characterId || "rain_witness";
      changeCharacter(companionCharacterId, {
        trust: success ? 24 : -14,
        affection: success ? 13 : -4,
        loyalty: success ? 20 : -8,
        grievance: success ? -8 : 13,
      }, before.companions.length ? "同行" : "在局中", true);
      break;
    }
    case "set-trap":
      changeCharacter("grey_rival", { trust: success ? 10 : -4, grievance: success ? -5 : 5 }, "在局中", true);
      break;
    case "burn-evidence":
      changeCharacter(before.companions[0]?.characterId || "rain_witness", { trust: 18, affection: 12, debt: 18, loyalty: 14 }, before.companions.length ? "同行" : "在局中", true);
      break;
    case "accept-duel":
      changeCharacter("grey_rival", { trust: success ? 22 : 10, debt: success ? 4 : 14, grievance: success ? -16 : -7 }, "在局中", true);
      break;
    case "read-sword":
      changeCharacter("grey_rival", { trust: success ? 26 : 12, grievance: -10 }, "在局中", true);
      break;
    case "walk-away-duel":
      changeCharacter("grey_rival", { trust: 8, grievance: -4 }, "在局中", true);
      break;
    case "forge-alliance":
      changeFaction("changhe", { favor: success ? 24 : 7, pressure: success ? 8 : 19, revealed: true });
      changeFaction("home", { favor: success ? 12 : 2, pressure: 7, revealed: true });
      break;
    case "sell-information":
      changeFaction("changhe", { favor: success ? 7 : -8, pressure: 20, revealed: true });
      changeFaction("guichao", { favor: -8, pressure: 22 });
      break;
    case "leave-council":
      changeFaction("changhe", { favor: -6, pressure: -4, revealed: true });
      break;
    case "invite-healer":
      changeCharacter("lantern_healer", { trust: 28, affection: 8, debt: 10, loyalty: 22 }, "同行", true);
      break;
    case "buy-medicine":
      changeCharacter("lantern_healer", { trust: 12, debt: 7, loyalty: 4 }, "在局中", true);
      break;
    case "defend-clinic":
      changeCharacter("lantern_healer", { trust: success ? 24 : 18, affection: 7, debt: success ? 22 : 28, loyalty: 13 }, "在局中", true);
      break;
    case "final-sword":
      changeCharacter("tide_master", { trust: success ? 7 : 3, grievance: success ? 28 : 16 }, "敌对", true);
      changeFaction("guichao", { favor: -18, pressure: 30, revealed: true });
      break;
    case "final-truth":
      changeCharacter("tide_master", { trust: success ? 30 : 15, grievance: -18, debt: 10 }, "在局中", true);
      changeFaction("guichao", { favor: success ? 22 : 10, pressure: -18, revealed: true });
      changeFaction("changhe", { favor: -10, pressure: 24, revealed: true });
      break;
    case "final-spare":
      narrative.cast.forEach((character, index) => {
        narrative.cast[index] = updateRelationship(character, { trust: 12, affection: 8, debt: 10, loyalty: 10, grievance: -8 }, turn, character.status);
      });
      changeFaction("guichao", { favor: 14, pressure: -20, revealed: true });
      break;
    default:
      break;
  }

  const threadProgress = threadProgressFor(event.id);
  narrative.threads = narrative.threads.map((thread) => {
    const progress = Math.max(thread.progress, threadProgress[thread.id] || thread.progress);
    return {
      ...thread,
      progress,
      status: progress >= 100 ? "兑现" : progress >= 35 ? "推进" : "埋下",
      ...(progress >= 100 ? { payoffTurn: turn } : {}),
    };
  });

  let martialGain = success ? 3 : 2;
  let practicedTechniqueId = narrative.martial.techniques[0].id;
  if (["learn-manual", "train", "accept-duel", "read-sword"].includes(selected.id)) {
    martialGain += success ? 8 : 4;
    practicedTechniqueId = narrative.martial.techniques[1].id;
  }
  if (["final-sword", "final-truth", "final-spare"].includes(selected.id)) {
    martialGain += success ? 14 : 8;
    practicedTechniqueId = narrative.martial.signatureTechniqueId;
  }
  narrative.martial.mastery = clamp(narrative.martial.mastery + martialGain, 0, 100);
  narrative.martial.techniques = narrative.martial.techniques.map((technique) => {
    if (technique.id !== practicedTechniqueId) return technique;
    const mastery = clamp(technique.mastery + martialGain * 2, 0, 100);
    const status = mastery >= 75 ? "大成" : mastery >= 20 ? "初悟" : technique.status;
    if (status !== technique.status) discovery = `武学「${technique.name}」已至${status}`;
    return {
      ...technique,
      mastery,
      status,
      unlockedTurn: technique.unlockedTurn ?? turn,
    };
  });

  // Existing companion cards mirror the richer relationship record.
  after.companions = after.companions.map((companion) => {
    const character = narrative.cast.find((entry) => entry.id === companion.characterId);
    if (!character) return companion;
    return {
      ...companion,
      affinity: clamp(Math.round(character.relationship.trust * 0.5 + character.relationship.affection * 0.2 + character.relationship.loyalty * 0.3), 0, 100),
    };
  });
  return { narrative, ...(discovery ? { discovery } : {}) };
};

const CHOICE_NARRATION: Record<string, string> = {
  "open-letter": "你把信移到灯下，用指甲沿着火漆最薄处挑开。",
  "burn-letter": "你没有拆信，任火舌从落款一路烧到自己的指尖。",
  "ask-master": "你带着未拆的信穿过长廊，要让山门先回答这枚旧印。",
  "buy-rumor": "你把银钱一枚枚排在茶盏旁，买下那人不肯白说的后半句。",
  "follow-hat": "你等斗笠客走出三条街，才借着人潮悄然跟上。",
  "perform-righteous": "你端起茶盏站到堂中，索性让暗话变成人人都听得见的明话。",
  "fight-bridge": "你迎着雨拔出兵刃，先一步踏上摇晃的桥心。",
  "break-bridge": "你没有迎刀，只把锋刃落向脚边绷紧的桥索。",
  "name-master": "你按住兵刃，先在雨里报出了身后的师承与旧名。",
  "invite-companion": "你把青伞推回檐下，只问了一句：敢不敢一起走到潮声尽头？",
  "trade-clue": "你只亮出半张旧图，把另外半张答案留在袖中。",
  "leave-rain": "你谢过那把伞，独自登上了即将离岸的小舟。",
  "learn-manual": "你在井边坐下，把残页上的每一道水痕都当作招式的一部分。",
  "sell-manual": "你合起残页，用这场机缘换了一张能继续赶路的航图。",
  "return-manual": "你重新裹好油布，把足以成名的残卷放回井沿。",
  "tell-truth": "面对满堂追问，你从第一枚铜纹说起，一句也没有省略。",
  "hide-sect": "你摊开无关紧要的路线，把最锋利的真相仍留在心里。",
  "leave-sect": "你把旧牌放在门槛内，转身时没有再借山门的一点灯。",
  "trust-companion": "箭声将至，你却没有回头，只把看不见的那一面交给同行之人。",
  "set-trap": "你故意让假铜纹露出一角，等窗外的人替自己选错一步。",
  "burn-evidence": "你把名单送进火里，先伸手扶住了还活着的人。",
  "accept-duel": "你横剑应下三招，把一路疑问都压进第一声金铁交鸣。",
  "read-sword": "你垂下剑尖，只看那三招究竟想把你引向何处。",
  "walk-away-duel": "你收剑转身，不肯让旁人替自己规定拔剑的时辰。",
  "forge-alliance": "你接过那支笔，却先让桌边三方各自写下一件不肯牺牲的东西。",
  "sell-information": "你没有签盟约，只把情报推向出价最高的那只手。",
  "leave-council": "你吹熄桌上唯一的灯，让所有未说出口的算计一同陷入黑暗。",
  "invite-healer": "你等药汤凉到能入口，才问那位负灯医者愿不愿再多走一程。",
  "buy-medicine": "你留下十二两银，只买药，不问她还替谁记着旧账。",
  "defend-clinic": "你把诊棚的布帘掖到身后，迎着村外马蹄走进雨里。",
  "final-sword": "你不再追问，把一路压住的怒意尽数送进剑锋。",
  "final-truth": "你将铜纹逐一摆在潮湿的石案上，逼所有人把那一夜说完。",
  "final-spare": "你慢慢收剑入鞘，决定不让另一具尸骨替旧案作结。",
  recover: "你靠着檐柱闭目调息，先把散乱的呼吸一寸寸收回。",
  train: "你没有歇下，而是从最熟的一式重新练起。",
  "gather-news": "你带伤走进街巷，去听风里有没有新的名字。",
  "wander-observe": "你停在原地，让脚印、风向与灯影先替陌生人开口。",
  "wander-help": "鞭影落下之前，你已经横身站到了那个陌生人前面。",
  "wander-bargain": "你顺着眼前乱局谈成一笔交易，也买下半个方向。",
};

const lineAsParagraph = (entry: NovelLine) => {
  if (entry.type === "system") return `你把这句话记在心里：${entry.text.replace(/^获得线索：?/, "")}`;
  if (entry.speaker && !entry.text.includes(entry.speaker)) return `${entry.speaker}道：${entry.text}`;
  return entry.text;
};

const revealTitleFor = (eventId: string) => {
  if (eventId.startsWith("sandbox")) {
    const archetype = sandboxArchetypeFromEventId(eventId);
    if (archetype === "manual") return "抄本有了去向，新招也有了来历";
    if (archetype === "recovery") return "呼吸稳住以后，江湖仍在继续移动";
    if (archetype === "fallout") return "旧选择追上来，传闻从此换了走向";
    if (archetype.startsWith("place-")) return "这一地留下的痕迹，已经有了后来人";
    if (["feud", "debt", "tutelage", "kinship"].includes(archetype)) return "旧关系被重新看见，再不能退回传闻里";
    if (archetype === "track") return "断掉的行踪，终于接上了一处真迹";
    if (archetype === "protect") return "要护的人已经上路，人情也随之同行";
    if (archetype === "challenge") return "约战有了见证，胜负不再只是招名";
    if (archetype === "liaison") return "迟到的信有了去处，旧约也有了回声";
    return "这一念落下，江湖已有回声";
  }
  return ({
  "opening-oath": "火漆裂开，旧案重新有了声音",
  "tea-whisper": "茶盏见底，铜纹指向北斗桥",
  "bridge-ambush": "桥索在雨里断成两条路",
  "rain-pavilion": "青伞收起，有人与你同路",
  "broken-manual": "残卷翻过一页，招式从此不同",
  "sect-trial": "三问落定，山门记住了你的答复",
  traitor: "箭穿窗纸，信任先一步出手",
  "duel-at-dawn": "第三招之后，彼此都没有原样下山",
  "alliance-council": "灯火明灭，盟约已有代价",
  "lantern-healer": "药凉之前，同行与去留已定",
  "final-confrontation": "潮声退去，最后一页由你落笔",
  "quiet-recovery": "雨歇以后，旧伤教会你慢下来",
  }[eventId] || "这一念落下，江湖已有回声");
};

const consequenceFor = (state: NovelState, event: NovelEvent, selected: NovelChoice, success: boolean) => {
  if (event.id === "sandbox-recovery") {
    return selected.id === "recover"
      ? "你稳住伤势时，其他人物仍按各自目标换了位置"
      : selected.id === "train"
        ? "这次练习让旧招在身体里更稳，而附近人物的行程没有因你停步而暂停"
        : "你带伤听来的传闻会让旧识改道，也可能把一笔未清人情引到下一站";
  }
  if (event.id.startsWith("sandbox-wandering:")) {
    return "此地发生的插曲已成为人物记忆和江湖传闻；下一幕仍从现有位置、目标与关系中生成";
  }
  if (event.id.startsWith("sandbox-manual:")) {
    return success
      ? "这册抄本从此有了清楚的来路与持有人，所载招式也不再是无主之物"
      : "你没能完全吃透抄本，却让一门武学的流转多出了一位真实经手人";
  }
  if (event.id.startsWith("sandbox-place-")) {
    return success
      ? "此地留下的物证、伤者或争议已有了可追的来路，后来人会从你的处置继续往下走"
      : "你没能当场收住这桩异闻，它却不再是无头传说，下一处痕迹已经留了下来";
  }
  if (event.id.startsWith("sandbox-fallout:")) {
    return selected.id === "sandbox-fallout-own"
      ? "你亲自承担了上一回的选择，旁人再难把它改写成另一个人的罪名"
      : selected.id === "sandbox-fallout-correct"
        ? "传闻最早变形的地方已经露出端倪，旧结果也因此生出新的去向"
        : "追逐风声的人被引向别处，真正受这件事牵连的人得到了一段喘息";
  }
  if (event.id.startsWith("sandbox")) {
    const actorId = selected.id.split(":")[1];
    const actor = state.world.actors.find((entry) => entry.id === actorId);
    const character = actor?.characterId ? state.narrative.cast.find((entry) => entry.id === actor.characterId) : undefined;
    const relation = character?.relationship.label || "试探";
    if (selected.id.startsWith("sandbox-aid:")) return `${actor?.name || "对方"}与你的关系落在“${relation}”；这份人情会改变此后的目标、同行与重逢机会`;
    const supportiveChoice = /^sandbox-(guard|tend|decoy|warn|deliver|separate|back|repay|broker|keep-secret|reconcile|carry-message):/.test(selected.id);
    const investigativeChoice = /^sandbox-(track|lure|terms|witness|mediate|shadow|proof|reveal|ask-truth):/.test(selected.id);
    const martialChoice = selected.id.startsWith("sandbox-duel:") || /^sandbox-(confront|ask-teach|compare):/.test(selected.id);
    if (supportiveChoice) return `${actor?.name || "对方"}与你的关系落在“${relation}”；这份援手、立场或承诺会改变此后的同行与重逢`;
    if (martialChoice) return `“${character?.signatureMove || "这一招"}”已经成为你们之间真实发生过的一段武学往来，所见所悟都有原主可寻`;
    if (investigativeChoice) return `${actor?.name || "对方"}所追之事与关系网被你看见一角，下一次见面会从已经揭开的事实继续`;
    return `${actor?.name || "对方"}的行程、隐秘与关系网被你看见一角；下一次相逢将从这一刻继续，而非重新介绍`;
  }
  const rain = state.narrative.cast.find((character) => character.id === "rain_witness");
  const healer = state.narrative.cast.find((character) => character.id === "lantern_healer");
  const rival = state.narrative.cast.find((character) => character.id === "grey_rival");
  const home = state.narrative.factions.find((faction) => faction.id === "home");
  const activeTechnique = state.narrative.martial.techniques.find((technique) => technique.unlockedTurn === state.turn)
    || state.narrative.martial.techniques[0];
  if (event.id === "opening-oath") return "从这一刻起，半枚铜纹不再是陌生人的信物，而成了追着你身世不放的旧债";
  if (event.id === "tea-whisper") return "洛阳的闲话被收成一条清楚的路，路的尽头正是雨夜里的北斗桥";
  if (event.id === "bridge-ambush") return `桥上的人没有留下姓名，却让你第一次看见${rival?.name || "灰衣剑客"}藏在局后的影子`;
  if (event.id === "rain-pavilion") return `${rain?.name || "雨夜客"}与你的关系停在“${rain?.relationship.label || "试探"}”，那把青伞从此成了这段路上无法忽略的颜色`;
  if (event.id === "broken-manual") return `残页已经进入你的${state.narrative.martial.name}，${activeTechnique.name}也因此有了与从前不同的呼吸`;
  if (event.id === "sect-trial") return `${home?.name || state.hero.sectName}对你的态度转为“${home?.stance || "观望"}”，山门的旧债却比来时更清楚`;
  if (event.id === "traitor") return `${rain?.name || "同行之人"}没有从这场伏击里全身而退，你们之间的${rain?.relationship.label || "旧账"}也不再只是一个数目`;
  if (event.id === "duel-at-dawn") return `${rival?.name || "灰衣剑客"}收起第三招时，也把自己藏了多年的一半真话留在了崖边`;
  if (event.id === "alliance-council") return "三方势力都记住了你在灯下的立场，归潮阁也因此提前听见了风声";
  if (event.id === "lantern-healer") return `${healer?.name || "负灯医者"}带来的不只是药，她保存的药方让沉星渡的“天灾”第一次有了人为的痕迹`;
  if (event.id === "final-confrontation") return success ? "沉星渡的完整真相终于有人承担，代价也不再能推给下一代" : "你没能得到一个干净的胜负，却仍迫使所有人面对被藏了十七年的那一夜";
  return `这一次${selected.label}让你离潮声更近，也让下一次取舍少了一条退路`;
};

const transitionFor = (state: NovelState, eventId: string) => {
  if (eventId.startsWith("sandbox")) {
    const recent = state.world.movements.slice(-2).map((movement) => {
      const actor = state.world.actors.find((entry) => entry.id === movement.actorId);
      const location = state.world.locations.find((entry) => entry.id === movement.toLocationId);
      return `${actor?.name || "有人"}去了${location?.name || "下一站"}`;
    });
    return recent.length
      ? `你作出选择时，江湖并没有停住：${recent.join("，")}。下一回将从这些真实位置继续生长。`
      : "这一地暂时安静下来，人物各自的目标却还在推动下一段路。";
  }
  const rain = state.narrative.cast.find((character) => character.id === "rain_witness")?.name || "雨夜客";
  const healer = state.narrative.cast.find((character) => character.id === "lantern_healer")?.name || "负灯医者";
  const rival = state.narrative.cast.find((character) => character.id === "grey_rival")?.name || "灰衣剑客";
  const antagonist = state.narrative.bible.antagonistName;
  return ({
    "opening-oath": "天色尚未亮透，你已经知道下一步要去洛阳。那里的茶馆，正有人等着说完信上没有写完的话。",
    "tea-whisper": "当夜子时，北斗桥方向滚来沉雷。你把铜纹贴身收好，沿着最后一盏城灯走入雨里。",
    "bridge-ambush": `桥下的水把血色带向听雨渡。渡口檐下，${rain}已经撑着一把青伞等了很久。`,
    "rain-pavilion": "小舟离岸时，白露村方向忽有井光冲破雨幕。有人说，井底埋着能补全一门绝学的半卷心法。",
    "broken-manual": `残页尚未焐热，${state.hero.sectName}的急信已经追到村口：山门要你立刻回去，回答三个问题。`,
    "sect-trial": "你离开大殿时，窗纸上映出两道本不该同时出现的影子。旧宅里有人等你，也有人等着杀掉那个等你的人。",
    traitor: `伏击者留下的剑痕只有三寸，正是${rival}惯用的起手。天亮前，他会在黑风岭等你接第三招。`,
    "duel-at-dawn": "崖下洛阳灯火仍在。长河盟、山门与水路帮会将在同一张纸上谈归潮阁，而那支笔已经推到了你的座前。",
    "alliance-council": `会馆散席后，${healer}从白露村托人送来一张染药的纸。那味药，只在十七年前的沉星渡出现过。`,
    "lantern-healer": `潮汐将在明日天亮前退到最低。${antagonist}和最后一卷旧档，都在潮线之外等你。`,
    "final-confrontation": "天终于亮了。江湖不会因此变得干净，但这一卷从此有了可以被人读完的最后一页。",
  }[eventId] || "夜色继续向前，远处那阵潮声已经比上一回更近。") as string;
};

const composeScene = (
  before: NovelState,
  after: NovelState,
  event: NovelEvent,
  selected: NovelChoice,
  outcome: ChoiceOutcome,
  success: boolean,
  turn: number,
  chapter: { number: number; title: string },
  combat?: WuxiaCombatResult,
): { scene: SceneManuscript; resultParagraphs: string[]; consequence: string } => {
  const previousScenes = before.narrative.chapters.flatMap((entry) => entry.scenes);
  const previous = previousScenes[previousScenes.length - 1];
  const continuity = previous
    ? `从${previous.locationName}到${event.locationName}，上一回留下的结果始终没有落在身后：${previous.consequence}。`
    : `故事从${event.locationName}起笔。这里没有等你去解的固定大案，只有各自赶路的人和即将形成的关系。`;
  const choiceParagraph = selected.id.startsWith("sandbox-")
    ? `这一刻，你选择了${selected.label}。旁人会记住这一步，下一次相逢便不会从陌路重来。`
    : CHOICE_NARRATION[selected.id] || `片刻权衡之后，你选择了${selected.label}。`;
  const consequence = consequenceFor(after, event, selected, success);
  const outcomeParagraphs = outcome.lines
    .filter((entry) => !combat || entry.type !== "action")
    .map(lineAsParagraph);
  const resultParagraphs = [choiceParagraph, ...(combat?.novelParagraphs || []), ...outcomeParagraphs, `${consequence}。`, transitionFor(after, event.id)];
  const characterIds = after.narrative.cast
    .filter((character) => character.lastSeenTurn === turn)
    .map((character) => character.id);
  const factionIds = after.narrative.factions
    .filter((faction, index) => {
      const previousFaction = before.narrative.factions[index];
      return !previousFaction
        || faction.favor !== previousFaction.favor
        || faction.pressure !== previousFaction.pressure
        || faction.agendaRevealed !== previousFaction.agendaRevealed;
    })
    .map((faction) => faction.id);
  const narrativeTechniqueIds = after.narrative.martial.techniques
    .filter((technique, index) => (
      !before.narrative.martial.techniques[index]
      || technique.mastery !== before.narrative.martial.techniques[index].mastery
    ))
    .map((technique) => technique.id);
  const techniqueIds = Array.from(new Set([...narrativeTechniqueIds, ...(combat?.techniqueIds || [])]));
  return {
    consequence,
    resultParagraphs,
    scene: {
      id: `scene-${turn}-${event.id}`,
      turn,
      chapter: chapter.number,
      chapterTitle: chapter.title,
      title: event.title,
      subtitle: event.subtitle,
      locationName: event.locationName,
      paragraphs: [continuity, ...event.lines.map(lineAsParagraph), ...resultParagraphs],
      choiceLabel: selected.label,
      resultLabel: success ? "此念得偿" : "此念生变",
      consequence,
      characterIds,
      factionIds,
      techniqueIds,
      ...(combat ? { combat } : {}),
    },
  };
};

const appendScene = (narrative: NarrativeArchitecture, scene: SceneManuscript): NarrativeArchitecture => {
  const exists = narrative.chapters.some((chapter) => chapter.number === scene.chapter);
  const chapters = exists
    ? narrative.chapters.map((chapter) => (
      chapter.number === scene.chapter
        ? { ...chapter, scenes: [...chapter.scenes, scene] }
        : chapter
    ))
    : [...narrative.chapters, { ...storyChapterFor(scene.chapter), scenes: [scene] }];
  return { ...narrative, chapters };
};

const authoredTechniqueDetails = (state: NovelState, branch: string, turn: number) => {
  const details = branch === "guard"
    ? { name: "同路回锋", nature: "守" as const, description: "不追敌锋，只在来势越过身侧时回转半步，替同行之人留出退路。", tags: ["护持", "回锋"] }
    : branch === "flow"
      ? { name: "行云换影", nature: "身" as const, description: "不拘固定三步，把地形、人群与呼吸都化成下一次换位的落点。", tags: ["换位", "行旅"] }
      : { name: "截流一式", nature: "破" as const, description: "舍去繁复变化，只在对手换气未成时截断来势，使强招无从续接。", tags: ["破招", "截气"] };
  return {
    id: `authored_${state.life.protagonistId}_${branch}_${turn}`,
    ...details,
    createdTurn: turn,
    inspirationTechniqueIds: state.world.actors.find((actor) => actor.id === "hero")?.techniques.map((entry) => entry.techniqueId).slice(0, 3) || [],
  };
};

const authoredArtIdFor = (state: NovelState) => `art_authored_${state.life.protagonistId}`;

const applyAuthoredTechnique = (state: NovelState, branch: string, turn: number): NovelState => {
  const authored = authoredTechniqueDetails(state, branch, turn);
  const authoredArtId = authoredArtIdFor(state);
  if (state.campaign.legacy.authoredTechniques.some((entry) => entry.id === authored.id)) return state;
  const technique: MartialTechniqueDef = {
    id: authored.id,
    artId: authoredArtId,
    name: authored.name,
    nature: authored.nature,
    description: authored.description,
    power: authored.nature === "破" ? 76 : authored.nature === "守" ? 64 : 58,
    speed: authored.nature === "身" ? 82 : 68,
    accuracy: 78,
    range: authored.nature === "身" ? "中" : "近",
    qiCost: 28,
    cooldown: 3,
    difficulty: 72,
    tags: [...authored.tags, "自创"],
    counters: authored.nature === "破" ? ["蓄力", "格挡"] : authored.nature === "守" ? ["围攻"] : ["封路"],
  };
  const authoredArt = state.world.martialArts.find((art) => art.id === authoredArtId);
  const martialArts: WorldMartialArt[] = authoredArt
    ? state.world.martialArts.map((art) => (
      art.id === authoredArt.id ? { ...art, techniqueIds: [...art.techniqueIds, technique.id] } : art
    ))
    : [...state.world.martialArts, {
      id: authoredArtId,
      name: `${state.hero.name}行路武学`,
      factionId: "hero",
      grade: "上乘",
      category: technique.nature === "身" ? "轻功" : "外功",
      weapon: technique.nature === "身" ? "身法" : state.hero.art.includes("剑") ? "剑" : "拳掌",
      lineage: `由${state.hero.name}将本门根基、实战见闻与旁学招式逐段推演而成。`,
      principle: state.campaign.agenda?.description || "招式必须能说明自己为何出手。",
      taboo: "若只抄招形而忘记各门来路，这套武学便会失去根基。",
      techniqueIds: [technique.id],
    }];
  const world = {
    ...state.world,
    martialArts,
    techniques: [...state.world.techniques, technique],
    actors: state.world.actors.map((actor) => (
      actor.id === "hero"
        ? {
          ...actor,
          techniques: [...actor.techniques, {
            techniqueId: technique.id,
            mastery: 28,
            source: "自创" as const,
            learnedDay: state.world.day,
          }],
        }
        : actor
    )),
  };
  const narrativeTechnique: MartialTechnique = {
    id: technique.id,
    name: technique.name,
    description: technique.description,
    status: "初悟",
    mastery: 28,
    unlockedTurn: turn,
  };
  return {
    ...state,
    world,
    narrative: {
      ...state.narrative,
      martial: {
        ...state.narrative.martial,
        techniques: [...state.narrative.martial.techniques, narrativeTechnique],
      },
    },
    campaign: {
      ...state.campaign,
      legacy: {
        ...state.campaign.legacy,
        authoredTechniques: [...state.campaign.legacy.authoredTechniques, authored],
      },
    },
  };
};

const foundedSectName = (state: NovelState) => {
  const location = currentLocation(state);
  const place = location.name
    .replace(/门驻地$/, "")
    .replace(/驻地$/, "")
    .replace(/[城山岭庄馆楼院村渡门]$/, "") || state.hero.name;
  const principle = state.campaign.agenda?.id.includes("bond") ? "同心" : state.campaign.agenda?.id.includes("mastery") ? "问锋" : "行止";
  return `${place}${principle}门`;
};

const applySectFounding = (state: NovelState, turn: number): NovelState => {
  if (state.campaign.legacy.foundedSect) return state;
  const authored = state.campaign.legacy.authoredTechniques[0];
  if (!authored) return state;
  const name = foundedSectName(state);
  const founded = {
    id: `player_sect_${state.life.protagonistId}_${turn}`,
    name,
    creed: state.campaign.agenda?.description || "先问为何出手，再论一招胜负。",
    foundedTurn: turn,
    headquartersLocationId: state.currentLocationId,
    founderTechniqueId: authored.id,
  };
  const narrative = state.narrative.factions.some((faction) => faction.id === founded.id)
    ? state.narrative
    : {
      ...state.narrative,
      factions: [...state.narrative.factions, {
        id: founded.id,
        name,
        sourceLabel: "玩家创立",
        creed: founded.creed,
        publicFace: `${state.hero.name}以“${authored.name}”为第一门传承，在${currentLocation(state).name}开山。`,
        hiddenAgenda: "新门派尚无秘密议程，往后的取舍会逐步写出它真正维护什么。",
        agendaRevealed: true,
        favor: 72,
        pressure: 18,
        stance: "庇护" as const,
      }],
    };
  const world = {
    ...state.world,
    martialArts: state.world.martialArts.map((art) => (
      art.id === authoredArtIdFor(state) ? { ...art, factionId: founded.id } : art
    )),
  };
  return {
    ...state,
    hero: { ...state.hero, sectId: founded.id, sectName: name, epithet: `${name}开山人` },
    world,
    narrative,
    campaign: { ...state.campaign, legacy: { ...state.campaign.legacy, foundedSect: founded } },
  };
};

const factionKnowledgeAfterCombat = (
  before: NovelState,
  state: NovelState,
  combat: WuxiaCombatResult,
  turn: number,
  choiceId: string,
): { campaign: WuxiaCampaignState; discovery?: string } => {
  const techniqueIds = combat.enemy.techniquesUsed;
  const arts = techniqueIds
    .map((techniqueId) => state.world.techniques.find((technique) => technique.id === techniqueId)?.artId)
    .map((artId) => state.world.martialArts.find((art) => art.id === artId))
    .filter((art): art is WorldMartialArt => Boolean(art));
  const enemyActor = state.world.actors.find((actor) => actor.id === combat.enemy.actorId);
  const factionId = enemyActor?.factionId
    || arts.find((art) => !["hero", "home"].includes(art.factionId))?.factionId
    || arts[0]?.factionId;
  if (!factionId) return { campaign: state.campaign };
  const factionName = state.narrative.factions.find((faction) => faction.id === factionId)?.name
    || (factionId === "home" ? state.hero.sectName : WUXIA_FACTIONS[factionId as keyof typeof WUXIA_FACTIONS]?.name)
    || factionId;
  const names = techniqueIds
    .map((techniqueId) => state.world.techniques.find((technique) => technique.id === techniqueId)?.name)
    .filter((name): name is string => Boolean(name));
  const existing = state.campaign.factionKnowledge[factionId];
  const confidence = clamp((existing?.confidence || 0) + 28 + Math.round(state.hero.stats.insight * 0.18), 0, 100);
  const evidence = `${combat.enemy.name}在${currentLocation(state).name}使出${names.map((name) => `“${name}”`).join("、") || "一套成体系的招路"}；起手、吐纳和收势彼此印证。`;
  const previousFaction = before.narrative.factions.find((faction) => faction.id === factionId);
  const currentFaction = state.narrative.factions.find((faction) => faction.id === factionId);
  const favorDelta = (currentFaction?.favor || 0) - (previousFaction?.favor || 0);
  const pressureDelta = (currentFaction?.pressure || 0) - (previousFaction?.pressure || 0);
  const context = choiceId.startsWith("sandbox-confront:")
    ? "敌对冲突" as const
    : before.currentEvent?.id.startsWith("campaign-opportunity:")
      ? "公开比试" as const
      : "切磋" as const;
  const consequence = context === "敌对冲突"
    ? `${factionName}把这场冲突记成一笔尚未了结的公开旧怨。`
    : favorDelta > 0 && pressureDelta <= 4
      ? `${factionName}把这场交手视作一次守规矩的往来，日后仍有说话余地。`
      : pressureDelta >= 7
        ? `${factionName}记住了你的招路，也开始提防下一次相逢。`
        : `${factionName}把胜负与双方使过的招一并记入往来簿。`;
  const knowledge = {
    factionId,
    factionName,
    confidence,
    recognizedTechniqueIds: Array.from(new Set([...(existing?.recognizedTechniqueIds || []), ...techniqueIds])),
    evidence: [...(existing?.evidence || []), evidence].slice(-5),
    firstRecognizedTurn: existing?.firstRecognizedTurn ?? turn,
    lastUpdatedTurn: turn,
    encounters: [...(existing?.encounters || []), {
      turn,
      opponentActorId: combat.enemy.actorId,
      opponentName: combat.enemy.name,
      context,
      result: combat.success ? "胜" as const : "负" as const,
      techniqueIds: [...techniqueIds],
      favorDelta,
      pressureDelta,
      consequence,
    }].slice(-6),
  };
  return {
    campaign: {
      ...state.campaign,
      factionKnowledge: { ...state.campaign.factionKnowledge, [factionId]: knowledge },
    },
    discovery: `你从${combat.enemy.name}的起手与收势认出${factionName}的路数。${consequence}`,
  };
};

const lifeAfterRite = (
  source: NovelState,
  selected: NovelChoice,
  success: boolean,
  turn: number,
): { state: NovelState; discovery?: string } => {
  if (!selected.id.startsWith("life-rite:") || selected.id.startsWith("life-rite:defer:") || !success) return { state: source };
  const [, rawKind, actorId] = selected.id.split(":");
  const kind = (rawKind === "oath" ? "sworn_oath" : rawKind) as LifeRiteKind;
  const actor = source.world.actors.find((entry) => entry.id === actorId);
  if (!actor) return { state: source };
  const household = {
    ...source.life.household,
    swornSiblingActorIds: [...source.life.household.swornSiblingActorIds],
    partners: source.life.household.partners.map((partner) => ({ ...partner })),
    children: source.life.household.children.map((child) => ({ ...child, parentActorIds: [...child.parentActorIds] as [string, string] })),
    rites: source.life.household.rites.map((rite) => ({ ...rite, actorIds: [...rite.actorIds] })),
  };
  if (kind === "sworn_oath" && household.partners.some((partner) => partner.actorId === actor.id)) return { state: source };
  if (["marriage", "concubinage"].includes(kind) && household.swornSiblingActorIds.includes(actor.id)) return { state: source };
  let description = "";
  if (kind === "sworn_oath" && !household.swornSiblingActorIds.includes(actor.id)) {
    household.swornSiblingActorIds.push(actor.id);
    description = `${source.hero.name}与${actor.name}结为异姓手足。`;
  }
  if (["marriage", "concubinage"].includes(kind) && !household.partners.some((partner) => partner.actorId === actor.id)) {
    household.partners.push({
      actorId: actor.id,
      name: actor.name,
      kind: kind === "marriage" ? "spouse" : "concubine",
      sinceDay: source.world.day,
    });
    description = kind === "marriage"
      ? `${source.hero.name}与${actor.name}结为夫妻。`
      : `${actor.name}以双方议定的侧室名分进入家门。`;
  }
  if (kind === "child") {
    const child = [...source.world.actors].reverse().find((entry) => (
      entry.id.startsWith("child_")
      && entry.birthDay === source.world.day
      && !household.children.some((known) => known.actorId === entry.id)
    ));
    if (child) {
      const childCharacterId = `character_${child.id}`;
      household.children.push({
        actorId: child.id,
        name: child.name,
        parentActorIds: ["hero", actor.id],
        birthDay: child.birthDay || source.world.day,
        homeLocationId: child.homeLocationId,
        adopted: selected.id.endsWith(":adopt"),
      });
      description = `${child.name}进入${source.hero.name}与${actor.name}的家门。`;
      child.characterId = childCharacterId;
    }
  }
  if (!description) return { state: source };
  household.rites.push({
    id: `rite_${kind}_${turn}_${actor.id}`,
    kind,
    actorIds: kind === "child" ? ["hero", actor.id, household.children.at(-1)?.actorId || ""] : ["hero", actor.id],
    day: source.world.day,
    description,
  });
  const child = kind === "child" ? household.children.at(-1) : undefined;
  const childActor = child ? source.world.actors.find((entry) => entry.id === child.actorId) : undefined;
  const childCharacterId = childActor?.characterId;
  const hasChildCharacter = childCharacterId && source.narrative.cast.some((entry) => entry.id === childCharacterId);
  const childCharacter: StoryCharacter | undefined = childActor && childCharacterId && !hasChildCharacter ? {
    id: childCharacterId,
    rosterId: childCharacterId,
    sourcePackId: "open-jianghu-family",
    name: childActor.name,
    sourceName: `${source.hero.name}家门后辈`,
    title: childActor.title,
    factionId: childActor.factionId,
    circles: ["家门后辈"],
    role: "在家门中真实成长，成年后会有自己的行程、关系与选择",
    desire: "先长成自己，再决定要不要接过长辈的江湖路",
    fear: "一生只被当作某位侠客的后代",
    secret: child?.adopted ? "仍记得被收养前的一段乳名与故乡。" : "家中长辈没有替其预先决定门派与志向。",
    signatureMove: "家门初式",
    signatureDescription: "把长辈留下的呼吸法练成自己的第一套基本功，尚未定型。",
    secretRevealed: false,
    portrait: "/images/autochess/portraits/sui.png",
    romanceable: false,
    status: "未谋面",
    relationship: { trust: 10, affection: 0, debt: 0, grievance: 0, loyalty: 8, label: "陌路" },
  } : undefined;
  return {
    state: {
      ...source,
      life: { ...source.life, household },
      narrative: childCharacter
        ? { ...source.narrative, cast: [...source.narrative.cast, childCharacter] }
        : source.narrative,
    },
    discovery: description,
  };
};

const stateAfterWorldProject = (
  source: NovelState,
  selected: NovelChoice,
  success: boolean,
  activity: PlayerActivity | undefined,
): { state: NovelState; discovery?: string } => {
  if (activity?.kind !== "world_project" || !activity.projectId) return { state: source };
  const current = source.chronicle.projects.find((project) => project.id === activity.projectId);
  if (!current || ["resolved", "failed"].includes(current.status)) return { state: source };
  const decisive = selected.id.includes("project:defend:") || selected.id.startsWith("sandbox-confront:") || selected.id.startsWith("sandbox-duel:");
  const amount = success ? (decisive ? 34 : 24) : decisive ? 12 : 10;
  const rawProgress = clamp(current.progress + amount, 0, current.goal);
  const resolved = success && decisive && rawProgress >= current.goal;
  const progress = resolved ? current.goal : Math.min(rawProgress, Math.max(0, current.goal - 1));
  const outcome = resolved
    ? current.kind === "invasion"
      ? "朔关重新立起界碑，沿边百姓得以返乡；各派驰援与退缩的名字都留在关志里。"
      : current.kind === "villain_hunt"
        ? "血衣楼主及其余党被逐一查清，最后一战没有留下可供替身继续冒名的暗线。"
        : "守门人尽数认可这场问道，闭门宗师也把自己的败招与所得一并写进武学谱。"
    : undefined;
  const nextProject: WorldProject = {
    ...current,
    status: resolved ? "resolved" : "active",
    progress,
    stage: projectStageFor(progress, resolved ? "resolved" : "active"),
    contributions: [...current.contributions, {
      protagonistId: source.life.protagonistId,
      actorName: source.hero.name,
      day: source.world.day,
      amount,
      success,
      description: `${selected.label}：${success ? "此举真正改变了局势" : "虽未如愿，仍留下下一步可用的事实"}。`,
    }].slice(-24),
    ...(resolved ? { resolvedDay: source.world.day, outcome } : {}),
  };
  let { world } = source;
  if (resolved && current.kind === "villain_hunt" && current.targetActorId && success && selected.id.startsWith("sandbox-confront:")) {
    world = {
      ...source.world,
      actors: source.world.actors.map((actor) => (
        actor.id === current.targetActorId ? { ...actor, activity: "死亡", goals: [] } : actor
      )),
    };
  }
  return {
    state: {
      ...source,
      world,
      chronicle: {
        ...source.chronicle,
        projects: source.chronicle.projects.map((project) => (project.id === nextProject.id ? nextProject : project)),
      },
    },
    discovery: resolved ? `${current.title}已经有了结局：${outcome}` : `${current.title}已从“${current.stage}”推进到“${nextProject.stage}”`,
  };
};

const campaignAfterChoice = (
  before: NovelState,
  source: NovelState,
  selected: NovelChoice,
  success: boolean,
  turn: number,
  combat?: WuxiaCombatResult,
): { state: NovelState; discoveries: string[] } => {
  const activity = before.campaign.availableActivities.find((entry) => entry.id === before.campaign.selectedActivityId);
  const isOpportunityPreparation = activity?.opportunityStage === "prepare";
  const isOpportunityAttendance = Boolean(activity?.opportunityId) && !isOpportunityPreparation;
  const activeOpportunity = activity?.opportunityId
    ? source.campaign.opportunities.find((opportunity) => opportunity.id === activity.opportunityId)
    : undefined;
  const isTournamentRound = Boolean(
    isOpportunityAttendance
    && activeOpportunity?.roundsRequired
    && combat
    && selected.id.startsWith("sandbox-duel:"),
  );
  const tournamentRoundsWon = (activeOpportunity?.roundsWon || 0) + (isTournamentRound && success ? 1 : 0);
  const tournamentWon = Boolean(isTournamentRound && success && tournamentRoundsWon >= (activeOpportunity?.roundsRequired || 0));
  const tournamentEliminated = Boolean(isTournamentRound && !success);
  const opportunityCompleted = !isTournamentRound || tournamentWon || tournamentEliminated;
  const agendaGain = activity ? (activity.kind === "free_event" ? 6 : before.campaign.agenda?.favoredActivityKinds.includes(activity.kind) ? 22 : 12) : 8;
  const campaign: WuxiaCampaignState = {
    ...source.campaign,
    phase: "outcome",
    agenda: source.campaign.agenda ? {
      ...source.campaign.agenda,
      progress: clamp(source.campaign.agenda.progress + agendaGain + (success ? 4 : 0), 0, 100),
      completedSteps: source.campaign.agenda.completedSteps + 1,
    } : undefined,
    opportunities: refreshOpportunityStatuses(source.campaign.opportunities, source.world.day),
    leads: source.campaign.leads.map((lead) => {
      if (activity?.opportunityId && lead.opportunityId === activity.opportunityId) {
        if (isOpportunityAttendance && opportunityCompleted) return { ...lead, status: "resolved", progress: 100 };
        if (isTournamentRound) return { ...lead, status: "active", progress: clamp(24 + tournamentRoundsWon * 24, 0, 92) };
        return {
          ...lead,
          status: "active",
          progress: clamp(lead.progress + (success ? 18 : 10), 0, 92),
          targetLocationId: activity?.targetLocationId || lead.targetLocationId,
        };
      }
      if (lead.id === activity?.leadId) {
        const targetManual = activity.targetManualId
          ? source.world.manuals.find((manual) => manual.id === activity.targetManualId)
          : undefined;
        const manualResolved = Boolean(
          (targetManual && targetManual.state !== "藏匿")
          || (activity.targetManualId && selected.id === `sandbox-manual-learn:${activity.targetManualId}`),
        );
        if (manualResolved) return { ...lead, status: "resolved", progress: 100 };
        if (selected.id.startsWith("campaign-defer:")) return { ...lead, status: "paused", progress: clamp(lead.progress + 5, 0, 100) };
        return { ...lead, status: "active", progress: clamp(lead.progress + (success ? 28 : 16), 0, 100), targetLocationId: activity.targetLocationId };
      }
      return lead;
    }),
    legacy: {
      ...source.campaign.legacy,
      martialInsights: source.campaign.legacy.martialInsights + (
        combat || selected.id.startsWith("campaign-train:") || selected.id.startsWith("campaign-opportunity-study:") || selected.id.startsWith("sandbox-ask-teach:")
          ? 1 : 0
      ),
      reputation: source.campaign.legacy.reputation + Math.max(0, source.hero.stats.fame - before.hero.stats.fame),
    },
    availableActivities: [],
  };
  if (activity?.opportunityId && isOpportunityAttendance) {
    campaign.opportunities = campaign.opportunities.map((opportunity) => (
      opportunity.id === activity.opportunityId
        ? isTournamentRound
          ? {
            ...opportunity,
            roundsWon: tournamentRoundsWon,
            eliminated: tournamentEliminated,
            ...(tournamentWon ? { championActorId: "hero" } : {}),
            status: tournamentWon ? "resolved" : tournamentEliminated ? "attended" : "open",
          }
          : { ...opportunity, status: "attended" }
        : opportunity
    ));
  }

  const focusActorIds = Array.from(new Set([
    ...focusActorsForEvent(before.currentEvent?.id || ""),
    ...(activity?.targetActorId ? [activity.targetActorId] : []),
    ...(combat ? [combat.enemy.actorId] : []),
  ]));
  focusActorIds.forEach((actorId) => {
    const actor = source.world.actors.find((entry) => entry.id === actorId);
    if (!actor?.characterId || campaign.leads.some((lead) => lead.targetActorId === actor.id)) return;
    campaign.leads.push({
      id: `lead_person_${actor.id}`,
      kind: "person",
      title: `再寻${actor.name}`,
      summary: `你已在${currentLocation(source, actor.locationId).name}见过${actor.name}，可以结交、倾心、讨教、复仇，也可以先做别的事。`,
      source: before.currentEvent?.title || "一次真实相逢",
      status: "paused",
      progress: 10,
      discoveredTurn: turn,
      discoveredDay: source.world.day,
      targetActorId: actor.id,
      targetLocationId: actor.locationId,
      intent: "observe",
    });
  });

  const followerIds = new Set(campaign.legacy.followerActorIds);
  source.narrative.cast.forEach((character) => {
    const actor = source.world.actors.find((entry) => entry.characterId === character.id);
    if (!actor || followerIds.has(actor.id)) return;
    if (["知己", "情愫"].includes(character.relationship.label) || source.companions.some((companion) => companion.characterId === character.id)) followerIds.add(actor.id);
  });
  if (selected.id.startsWith("campaign-opportunity-rescue:") && success) {
    const actorId = selected.id.split(":")[1];
    if (source.world.actors.some((actor) => actor.id === actorId)) followerIds.add(actorId);
  }
  let schoolFollowerName: string | undefined;
  if (selected.id === "campaign-found-sect:school" && success) {
    const candidate = schoolFollowerCandidates(source, followerIds)[0];
    if (candidate) {
      followerIds.add(candidate.id);
      schoolFollowerName = candidate.name;
    }
  }
  campaign.legacy = { ...campaign.legacy, followerActorIds: Array.from(followerIds), followers: followerIds.size };

  let state = { ...source, campaign };
  const discoveries: string[] = [];
  if (isTournamentRound && activeOpportunity) {
    const record = {
      opportunityId: activeOpportunity.id,
      protagonistId: state.life.protagonistId,
      title: activeOpportunity.title,
      year: activeOpportunity.year,
      result: tournamentResultFor(tournamentRoundsWon, tournamentWon),
      ...(tournamentWon ? { championActorId: "hero" } : {}),
      roundsWon: tournamentRoundsWon,
    };
    const tournaments = state.chronicle.tournaments.some((entry) => entry.opportunityId === activeOpportunity.id)
      ? state.chronicle.tournaments.map((entry) => (entry.opportunityId === activeOpportunity.id ? record : entry))
      : [...state.chronicle.tournaments, record];
    const isWorldFirst = activeOpportunity.templateId === "world_first_championship";
    state = {
      ...state,
      chronicle: {
        ...state.chronicle,
        tournaments,
        ranking: tournamentWon && isWorldFirst
          ? { title: "天下第一", holderActorId: "hero", holderName: state.hero.name, sinceYear: activeOpportunity.year, heroBest: "夺魁" }
          : {
            ...state.chronicle.ranking,
            heroBest: tournamentResultFor(Math.max(
              tournamentRoundsWon,
              state.chronicle.tournaments
                .filter((entry) => entry.protagonistId === state.life.protagonistId)
                .reduce((best, entry) => Math.max(best, entry.roundsWon), 0),
            ), tournamentWon && isWorldFirst),
          },
      },
    };
    discoveries.push(tournamentWon
      ? `${state.hero.name}在${activeOpportunity.title}连过${tournamentRoundsWon}轮，正式夺魁`
      : tournamentEliminated
        ? `你在${activeOpportunity.title}止步于这一轮；下一届仍会按期举行`
        : `你在${activeOpportunity.title}再进一步，下一轮仍需亲自应战`);
  }
  if (selected.id.startsWith("campaign-invent:") && success) {
    state = applyAuthoredTechnique(state, selected.id.split(":")[1], turn);
    discoveries.push(`你自创“${state.campaign.legacy.authoredTechniques.at(-1)?.name}”，并把所借鉴的招式来路一并记入武学谱`);
  }
  if (selected.id === "campaign-found-sect:school" && success) {
    discoveries.push(schoolFollowerName
      ? `${schoolFollowerName}愿意在传艺馆留下学艺，名字也被正式写进追随者名册`
      : "你先开传艺馆验证门规，已有追随者愿意承担第一轮传艺");
  }
  if (selected.id === "campaign-found-sect:open" && success) {
    state = applySectFounding(state, turn);
    discoveries.push(`${state.campaign.legacy.foundedSect?.name}在${currentLocation(state).name}正式立下门规`);
  }
  if (combat) {
    const recognition = factionKnowledgeAfterCombat(before, state, combat, turn, selected.id);
    state = { ...state, campaign: recognition.campaign };
    if (recognition.discovery) discoveries.push(recognition.discovery);
  }
  const riteResult = lifeAfterRite(state, selected, success, turn);
  state = riteResult.state;
  if (riteResult.discovery) discoveries.push(riteResult.discovery);
  const projectResult = stateAfterWorldProject(state, selected, success, activity);
  state = projectResult.state;
  if (projectResult.discovery) discoveries.push(projectResult.discovery);
  return { state, discoveries };
};

const chapterMilestoneFor = (state: NovelState): ChapterMilestone => {
  const chapter = state.narrative.chapters.find((entry) => entry.number === state.chapter);
  const scenes = chapter?.scenes || [];
  const people = Array.from(new Set(scenes.flatMap((scene) => scene.characterIds)))
    .map((characterId) => state.narrative.cast.find((character) => character.id === characterId)?.name)
    .filter((name): name is string => Boolean(name));
  const attended = state.campaign.opportunities.filter((opportunity) => opportunity.status === "attended").map((opportunity) => opportunity.shortTitle);
  const authored = state.campaign.legacy.authoredTechniques.map((technique) => technique.name);
  const achievements = [
    ...(people.length ? [`与${people.slice(0, 3).join("、")}留下了可继续发展的关系`] : []),
    ...(attended.length ? [`亲自赶上${attended.slice(-2).join("、")}`] : []),
    ...(state.campaign.legacy.martialInsights ? [`积下${state.campaign.legacy.martialInsights}段可用于创招的武学领悟`] : []),
    ...(authored.length ? [`自创${authored.join("、")}`] : []),
    ...(state.campaign.legacy.foundedSect ? [`创立${state.campaign.legacy.foundedSect.name}`] : []),
  ];
  return {
    chapter: state.chapter,
    title: chapter?.title || state.chapterTitle,
    epigraph: chapter?.epigraph || storyChapterFor(state.chapter).epigraph,
    summary: `这一章收在${currentLocation(state).name}。你以“${state.campaign.agenda?.title || "未定之路"}”为眼下目标，亲自安排了${scenes.length}段行程；未完成的追寻和已经错过的机会都继续留在世界里。`,
    achievements: achievements.length ? achievements : ["你走完了自己选定的三段日程，而不是被随机事件推着赶路"],
    unresolvedLeadIds: state.campaign.leads.filter((lead) => ["active", "paused"].includes(lead.status)).map((lead) => lead.id),
    worldDay: state.world.day,
  };
};

const annualMilestoneFor = (state: NovelState, year: number, age: number, scenes: number): AnnualMilestone => {
  const people = state.life.household.partners.map((partner) => partner.name);
  const projects = state.chronicle.projects.filter((project) => project.contributions.some((entry) => (
    entry.protagonistId === state.life.protagonistId && wuxiaDateFromDay(entry.day).year === year
  )));
  const tournaments = state.chronicle.tournaments.filter((record) => (
    record.year === year && record.protagonistId === state.life.protagonistId
  ));
  const highlights = [
    ...(people.length ? [`与${people.join("、")}共同经营家门`] : []),
    ...(state.life.household.children.length ? [`家中已有${state.life.household.children.map((child) => child.name).join("、")}`] : []),
    ...projects.map((project) => `亲自介入${project.title}`),
    ...tournaments.map((record) => `${record.title}止于“${record.result}”`),
    ...(state.campaign.legacy.authoredTechniques.length ? [`留下${state.campaign.legacy.authoredTechniques.map((entry) => entry.name).join("、")}`] : []),
    ...(state.campaign.legacy.foundedSect ? [`主持${state.campaign.legacy.foundedSect.name}门中事务`] : []),
  ];
  return {
    year,
    age,
    endedDay: state.world.day,
    scenes,
    title: `${state.chronicle.eraName}${year}年 · 岁序收笔`,
    summary: `这一年写下${scenes}幕。你在${currentLocation(state).name}收住岁尾，但人物的行程、尚未了结的天下大事与下一届盛会仍会继续。`,
    highlights: highlights.length ? Array.from(new Set(highlights)).slice(0, 6) : ["这一年没有被某一条主线包办，你按自己的次序走完了每一程"],
  };
};

const opportunityLeadFor = (state: NovelState, opportunity: WorldOpportunity): CampaignLead => ({
  id: `lead_${opportunity.id}`,
  kind: "opportunity",
  title: opportunity.title,
  summary: `${opportunity.description}${currentLocation(state, opportunity.locationId).name}将在承平${opportunity.year}年迎来此事。`,
  source: `${opportunity.organizer}传出的新一届名帖`,
  status: "paused",
  progress: 0,
  discoveredTurn: state.turn,
  discoveredDay: state.world.day,
  targetLocationId: opportunity.locationId,
  opportunityId: opportunity.id,
  deadlineDay: opportunity.endDay,
});

const tournamentEligibleActors = (state: NovelState) => state.world.actors.filter((actor) => {
  if (actor.id === "hero" || ["死亡", "失踪"].includes(actor.activity) || actor.traits.includes("年幼")) return false;
  const age = actor.birthDay === undefined
    ? 18
    : Math.floor((state.world.day - actor.birthDay) / DAYS_PER_YEAR);
  return age >= 16 && actor.techniques.length > 0;
});

const tournamentScore = (state: NovelState, actor: WorldActor, opportunity: WorldOpportunity) => {
  const mastery = actor.techniques.reduce((total, known) => total + known.mastery, 0);
  const stableNoise = Array.from(`${state.seed}:${opportunity.id}:${actor.id}`)
    .reduce((total, character) => (total * 33 + character.charCodeAt(0)) % 23, 7);
  const defendingBonus = state.chronicle.ranking.holderActorId === actor.id ? 18 : 0;
  return mastery + actor.techniques.length * 12 + defendingBonus + stableNoise;
};

const settleExpiredTournaments = (state: NovelState, source: WorldOpportunity[]) => {
  let tournaments = state.chronicle.tournaments.map((record) => ({ ...record }));
  let ranking = { ...state.chronicle.ranking };
  const eligible = tournamentEligibleActors(state);
  const orderedEligible = (opportunity: WorldOpportunity) => [...eligible]
    .sort((left, right) => tournamentScore(state, right, opportunity) - tournamentScore(state, left, opportunity) || left.id.localeCompare(right.id));
  const opportunities = source.map((opportunity) => {
    if (!opportunity.roundsRequired) return opportunity;
    const contenders = orderedEligible(opportunity);
    const participantActorIds = contenders.slice(0, Math.max(3, opportunity.participantActorIds.length)).map((actor) => actor.id);
    const prepared = { ...opportunity, participantActorIds };
    if (state.world.day <= opportunity.endDay || (opportunity.status === "resolved" && opportunity.championActorId)) return prepared;
    const champion = contenders[0];
    if (!champion) return prepared;
    const existing = tournaments.find((record) => record.opportunityId === opportunity.id);
    const record: TournamentRecord = existing
      ? { ...existing, championActorId: champion.id }
      : {
        opportunityId: opportunity.id,
        protagonistId: "world",
        title: opportunity.title,
        year: opportunity.year,
        result: "旁观",
        championActorId: champion.id,
        roundsWon: 0,
      };
    tournaments = tournaments.some((entry) => entry.opportunityId === opportunity.id)
      ? tournaments.map((entry) => (entry.opportunityId === opportunity.id ? record : entry))
      : [...tournaments, record];
    if (opportunity.templateId === "world_first_championship") {
      ranking = {
        ...ranking,
        holderActorId: champion.id,
        holderName: champion.name,
        sinceYear: opportunity.year,
      };
    }
    return { ...prepared, status: "resolved" as const, championActorId: champion.id };
  });
  return { opportunities, tournaments, ranking };
};

const ensureCalendarContent = (state: NovelState): NovelState => {
  const currentYear = wuxiaDateFromDay(state.world.day).year;
  const participantActorIds = state.world.actors
    .filter((actor) => actor.id !== "hero" && !["死亡", "失踪"].includes(actor.activity))
    .map((actor) => actor.id);
  const ensuredOpportunities = ensureWorldOpportunities(
    state.content,
    state.seed,
    participantActorIds,
    state.campaign.opportunities,
    currentYear + 1,
  );
  const refreshedOpportunities = refreshOpportunityStatuses(ensuredOpportunities, state.world.day);
  const settled = settleExpiredTournaments(state, refreshedOpportunities);
  const { opportunities } = settled;
  const knownOpportunityIds = new Set(state.campaign.leads.map((lead) => lead.opportunityId).filter(Boolean));
  const newLeads = opportunities
    .filter((opportunity) => !knownOpportunityIds.has(opportunity.id))
    .map((opportunity) => opportunityLeadFor(state, opportunity));
  const projects = state.chronicle.projects.map((project) => (
    project.status === "announced" && project.startYear <= currentYear
      ? { ...project, status: "active" as const }
      : project
  ));
  return {
    ...state,
    campaign: {
      ...state.campaign,
      opportunities,
      leads: [...state.campaign.leads, ...newLeads],
    },
    chronicle: {
      ...state.chronicle,
      projects,
      tournaments: settled.tournaments,
      ranking: settled.ranking,
    },
  };
};

const syncLifeAfterScene = (before: NovelState, source: NovelState): NovelState => {
  const beforeYear = wuxiaDateFromDay(before.world.day).year;
  const afterYear = wuxiaDateFromDay(source.world.day).year;
  if (afterYear <= beforeYear) {
    return {
      ...source,
      life: { ...source.life, scenesThisYear: source.life.scenesThisYear + 1 },
    };
  }
  let annualState = source;
  for (let year = beforeYear; year < afterYear; year += 1) annualState = applyAnnualWorldTick(annualState, year);
  const milestone = annualMilestoneFor(annualState, beforeYear, source.life.age + (afterYear - beforeYear), source.life.scenesThisYear + 1);
  return ensureCalendarContent({
    ...annualState,
    life: {
      ...annualState.life,
      age: annualState.life.age + (afterYear - beforeYear),
      scenesThisYear: 0,
      annualMilestones: [...annualState.life.annualMilestones, milestone],
      pendingYearMilestone: milestone,
    },
  });
};

function applyAnnualWorldTick(state: NovelState, year: number): NovelState {
  const resolvedTargetActorIds: string[] = [];
  const projects = state.chronicle.projects.map((project, index) => {
    if (["resolved", "failed"].includes(project.status) || project.startYear > year + 1) return project;
    const amount = 7 + ((state.seed + year * 13 + index * 5) % 9);
    const progress = clamp(project.progress + amount, 0, project.goal);
    const resolved = progress >= project.goal;
    const status = resolved ? "resolved" as const : project.startYear <= year + 1 ? "active" as const : project.status;
    const outcome = resolved
      ? `${project.title}由江湖中仍在行动的门派与人物合力推到结局；你的缺席也被年鉴如实记下。`
      : project.outcome;
    if (resolved && project.kind === "villain_hunt" && project.targetActorId) resolvedTargetActorIds.push(project.targetActorId);
    return {
      ...project,
      status,
      progress,
      stage: projectStageFor(progress, status),
      contributions: [...project.contributions, {
        protagonistId: "world",
        actorName: "江湖诸派",
        day: state.world.day,
        amount,
        success: true,
        description: "岁序流转时，其他人物也在各自推进此事。",
      }].slice(-24),
      ...(resolved ? { resolvedDay: state.world.day, outcome } : {}),
    };
  });
  const world = resolvedTargetActorIds.length
    ? {
      ...state.world,
      actors: state.world.actors.map((actor) => (
        resolvedTargetActorIds.includes(actor.id) ? { ...actor, activity: "死亡" as const, goals: [] } : actor
      )),
    }
    : state.world;
  return { ...state, world, chronicle: { ...state.chronicle, projects } };
}

export const closeNovelYearAction = (state: NovelState): NovelState => {
  if (state.ending || state.pendingOutcome || state.currentEvent || !["planning", "chapter_break"].includes(state.campaign.phase)) return state;
  const closingDate = wuxiaDateFromDay(state.world.day);
  const elapsedDays = remainingDaysInYear(state.world.day);
  const world = advanceWorldToScene(state.world, {
    turn: state.turn,
    eventId: `year-end:${closingDate.year}`,
    targetLocationId: state.currentLocationId,
    companionActorIds: companionActorIds(state),
    minimumElapsedDays: elapsedDays,
    suppressEncounter: true,
  });
  let next = ensureCalendarContent(applyAnnualWorldTick({ ...state, world }, closingDate.year));
  const milestone = annualMilestoneFor(next, closingDate.year, state.life.age + 1, state.life.scenesThisYear);
  next = {
    ...next,
    life: {
      ...next.life,
      age: state.life.age + 1,
      scenesThisYear: 0,
      annualMilestones: [...state.life.annualMilestones, milestone],
      pendingYearMilestone: milestone,
    },
    campaign: {
      ...next.campaign,
      phase: "year_break",
      selectedActivityId: undefined,
      availableActivities: [],
    },
    log: [...next.log, {
      id: `year-end-${closingDate.year}`,
      turn: next.turn,
      kind: "chapter",
      title: milestone.title,
      text: milestone.summary,
      tone: "warm",
    }],
  };
  return next;
};

export const getLifeEndingOptions = (state: NovelState): LifeEndingDefinition[] => lifeEndingDefinitions({
  turn: state.turn,
  age: state.life.age,
  partnerCount: state.life.household.partners.length,
  childCount: state.life.household.children.length,
  foundedSectName: state.campaign.legacy.foundedSect?.name,
  rankingHolderActorId: state.chronicle.ranking.holderActorId,
  resolvedProjects: state.chronicle.projects.filter((project) => (
    project.status === "resolved"
    && project.contributions.some((entry) => entry.protagonistId === state.life.protagonistId && entry.success !== false)
  )),
});

const endingFor = (state: NovelState, endingId = "wandering_volume"): NovelEnding => {
  const { stats } = state.hero;
  const ambition = AMBITIONS[state.hero.ambition];
  const core = stats[ambition.stat];
  const score = clamp(Math.round(core * 1.1 + state.hero.clues * 7 + stats.fame * 0.45 + stats.chivalry * 0.35 - state.hero.heat * 0.2 + state.companions.length * 6), 0, 100);
  if (state.narrative.mode === "emergent_sandbox") {
    const met = state.narrative.cast.filter((character) => character.firstSeenTurn !== undefined);
    const ties = [...met].sort((left, right) => {
      const weight = (character: StoryCharacter) => character.relationship.trust + character.relationship.affection + character.relationship.debt + character.relationship.grievance;
      return weight(right) - weight(left);
    });
    const closest = ties[0];
    const opposed = [...met].sort((left, right) => right.relationship.grievance - left.relationship.grievance)[0];
    const heroTechniqueIds = state.world.actors.find((actor) => actor.id === "hero")?.techniques.map((entry) => entry.techniqueId) || [];
    const learnedTechniqueNames = state.world.techniques
      .filter((technique) => heroTechniqueIds.includes(technique.id))
      .map((technique) => technique.name);
    const rank = score >= 78 ? "上上签" : score >= 62 ? "上签" : score >= 45 ? "中签" : "未定签";
    const definition = getLifeEndingOptions(state).find((option) => option.id === endingId && option.unlocked)
      || getLifeEndingOptions(state).find((option) => option.id === "wandering_volume" && option.unlocked)
      || getLifeEndingOptions(state)[0];
    const title = `《${definition.title}》`;
    const relationLine = closest
      ? `${closest.name}与你最终成为“${closest.relationship.label}”。这段关系不是由门楣或传闻定下，而是在几次相逢、失约与援手之间一步步走出来的。`
      : "你没有与任何人走得足够近；这份疏离也被江湖如实留在卷中。";
    const oppositionLine = opposed && opposed.relationship.grievance >= 28
      ? `${opposed.name}仍未放下与你之间的旧怨。下一次同路或狭路相逢，这段关系自会生出新的冲突。`
      : "本卷无人被强推作最后的仇家；尚未化解的目标与人情会继续留在江湖里。";
    const householdLine = state.life.household.partners.length
      ? `${state.life.household.partners.map((partner) => partner.name).join("、")}的名字与你并列在家门簿上；${state.life.household.children.length ? `${state.life.household.children.map((child) => child.name).join("、")}仍会在同一片江湖里长大。` : "共同生活没有把任何一人的江湖路抹去。"}`
      : "你没有为了凑出一种结局而凭空成家；独行同样被如实写进这段人生。";
    const achievementLine: Record<string, string> = {
      together_retirement: `你与${state.life.household.partners.map((partner) => partner.name).join("、")}在仍能远行的年纪收起刀剑，不是谁被装进了谁的结局，而是共同选定另一种生活。`,
      family_legacy: `家门没有随着卷尾消失。${state.life.household.children.map((child) => child.name).join("、")}会按出生年月继续长大，也可能成为下一段人生的执卷人。`,
      sect_ancestor: `${state.campaign.legacy.foundedSect?.name || "新门派"}把你留下的招式、门规与旧交一并接了过去，后来者会知道这方门庭如何从第一日长成。`,
      world_number_one: `${state.hero.name}的名字被写在天下第一武道会榜首。这个名号不会永久锁死；下一届仍有人能够堂堂正正前来取走。`,
      guardian_of_realm: state.chronicle.projects.find((project) => project.kind === "invasion")?.outcome || "关外烽火终于退去。",
      villain_slayer: state.chronicle.projects.find((project) => project.kind === "villain_hunt")?.outcome || "魔踪终于查到尽头。",
      elder_retirement: `你在${state.life.age}岁时退居一方，仍保留地点、关系与所学武功；后来者可以拜访、讨教，也可能来挑战。`,
      wandering_volume: "你只替眼前这一卷收笔。若重新推开门，尚未完成的追寻、下一届大会和天下大事仍在原处继续。",
    };
    return {
      title,
      subtitle: definition.subtitle,
      summary: definition.description,
      rank,
      score,
      tags: [definition.tag, ambition.label, closest ? `与${closest.name}有约` : "独行未尽", learnedTechniqueNames.length > 1 ? "百家留痕" : "守住本门"],
      epilogue: [
        achievementLine[definition.id] || achievementLine.wandering_volume,
        relationLine,
        oppositionLine,
        householdLine,
        learnedTechniqueNames.length > 1
          ? `你的${state.narrative.martial.name}已与${learnedTechniqueNames.slice(1).join("、")}彼此映照；每一门旁学之招仍保留原主、来路与未解之意。`
          : `你仍以${state.narrative.martial.name}行走江湖，招式没有被一串高低评语代替，而是在每次出手与收手之间慢慢变得可靠。`,
      ],
    };
  }
  const rain = state.narrative.cast.find((character) => character.id === "rain_witness");
  const healer = state.narrative.cast.find((character) => character.id === "lantern_healer");
  const home = state.narrative.factions.find((faction) => faction.id === "home");
  const signature = state.narrative.martial.techniques.find((technique) => technique.id === state.narrative.martial.signatureTechniqueId)
    || state.narrative.martial.techniques[2];
  const relationshipEpilogue = (() => {
    if (!rain) return "那把青伞后来没有再出现，只有檐角的雨偶尔让你想起一个未曾问完的名字。";
    if (rain.relationship.label === "情愫") return `${rain.name}没有说过一个爱字。她只在离开归潮阁时把青伞偏向你这边，从此每场雨都替你们记得答案。`;
    if (["知己", "同盟"].includes(rain.relationship.label)) return `${rain.name}仍与你同路。你们不再追问谁欠谁一条命，只约好往后遇见半句真话，便一起把后半句找回来。`;
    if (["决裂", "宿敌"].includes(rain.relationship.label)) return `${rain.name}在潮退后独自离开。她没有原谅你，你也没有追；可你们都知道，下一次相见不会再有人躲在秘密后面。`;
    return `${rain.name}把青伞留在石阶上，人却走向另一条路。那段关系没有被写成知己或仇敌，只成了这一卷最难补完的留白。`;
  })();
  const epilogueFor = (resolution: string) => [
    resolution,
    relationshipEpilogue,
    `${healer?.name || "负灯医者"}把死者姓名重新抄成一册，送往各派山门。${home?.name || state.hero.sectName}以“${home?.stance || "观望"}”回应，而被掩住十七年的旧债，终于不再只由活下来的人承担。`,
    `你最后一次使出${state.narrative.martial.name}时，真正完成的是“${signature.name}”。它没有让江湖从此太平，却让人们记住：一门绝学之所以令人向往，不只因它能胜，更因它替执剑者守住了什么。`,
  ];
  const finish = (ending: Omit<NovelEnding, "epilogue">, resolution: string): NovelEnding => ({
    ...ending,
    epilogue: epilogueFor(resolution),
  });
  if (state.flags.ended_by_truth && state.hero.clues >= 5) {
    return finish({ title: "《照见潮声》", subtitle: "真相没有替你拔剑，却替你留下了名字。", summary: "你把散落在江湖各处的证词拼成完整旧案，让后来者终于知道谁在风里点燃了第一盏灯。", rank: score >= 78 ? "上上签" : "上签", score, tags: ["求真", "留证", "归潮阁"] }, `你没有替任何一方删去名字。${state.narrative.bible.antagonistName}在天亮前交出完整卷宗，长河盟与${home?.name || state.hero.sectName}被迫同时承认那道封江令。真相没有带来欢呼，只带来一场漫长而必要的沉默。`);
  }
  if (state.flags.ended_by_mercy && stats.chivalry >= 65) {
    return finish({ title: "《不负此身》", subtitle: "你没有赢得所有战斗，却护住了仍愿同行的人。", summary: "江湖后来称你为守灯人。你走过的地方不一定有碑，但总有人记得那一刻你把刀收回了鞘。", rank: score >= 72 ? "上签" : "中上签", score, tags: ["守义", "同行", "留灯"] }, `你带着仍愿活下去的人离开潮线，没有让${state.narrative.bible.antagonistName}成为又一具替众人顶罪的尸骨。旧卷被分成三份保存，任何一方想再改一个字，都必须先面对另外两方。`);
  }
  if (state.flags.ended_by_sword && stats.martial >= 66) {
    return finish({ title: "《一剑成名》", subtitle: "旧账已清，新的传说正从你的剑尖开始。", summary: "你以最直接的方式结束了风暴。有人敬你，有人惧你，而你终于有资格选择下一场风该吹向哪里。", rank: score >= 75 ? "上上签" : "上签", score, tags: ["雪恨", "武决", "名震"] }, `${state.narrative.bible.antagonistName}败在潮声最响的时候。面具落地，卷宗也被剑风割散；你赢得了江湖最快的一场公道，却要用余生分辨，那一剑究竟斩断了仇，还是斩断了最后一个能把真相说全的人。`);
  }
  if (score >= 70) return finish({ title: "《风过留痕》", subtitle: "你没有被江湖写完，江湖却记住了你的笔锋。", summary: "你在每一次取舍中留下了自己的章法。故事暂告一段落，下一卷仍有许多路可以走。", rank: "上签", score, tags: [ambition.label, "未完", "再会"] }, "归潮阁的门在潮退后仍然开着，旧卷却只剩可以互相印证的残页。你没能替所有人作结，但至少没有允许任何一方独占故事的写法。");
  if (score >= 48) return finish({ title: "《人间行脚》", subtitle: "江湖没有给你答案，但给了你继续走的理由。", summary: "你带着几处伤、几位故人和一张尚未展开的地图离开潮声。故事没有完，只是换了一个章节。", rank: "中签", score, tags: ["行旅", "余温", "未完"] }, "潮声掩去了最后一句证词。你带走半卷旧档，也留下半卷疑问；这不是最痛快的结局，却足够让下一段路不再从谎言开始。");
  return finish({ title: "《雨打旧檐》", subtitle: "这一卷合上了，风声还在窗外。", summary: "有些线索错过了，有些人没有等到，但你仍从废墟里捡起了自己的名字。下一次，你会走得更远。", rank: "下签", score, tags: ["遗憾", "重来", "江湖"] }, "你离开归潮阁时，完整卷宗仍埋在潮线之下。没有人获得想要的答案，但至少有几个名字被你带回了人间；只要名字还在，旧案就不算真正沉没。");
};

export const chooseNovelAction = (state: NovelState, choiceId: string): NovelState => {
  if (!state.currentEvent || state.pendingOutcome || state.ending || state.campaign.phase !== "scene") return state;
  const selected = state.currentEvent.choices.find((entry) => entry.id === choiceId);
  if (!selected) return state;
  const rng = createRng(state.rngState);
  const roll = Math.floor(rng.next() * 100) + 1;
  const completedTurn = state.turn + 1;
  const combat = isWuxiaCombatChoice(selected.id)
    ? simulateWuxiaCombat({
      world: state.world,
      turn: completedTurn,
      eventId: state.currentEvent.id,
      choiceId: selected.id,
      heroStats: state.hero.stats,
      heroLevel: state.hero.level,
      companionActorIds: companionActorIds(state),
    })
    : undefined;
  const success = combat?.success ?? (selected.check ? roll <= selected.check.odds : true);
  const outcome = success || !selected.failure ? selected.success : selected.failure;
  const chapter = getChapter(completedTurn, state.campaign.chapterLength, state.campaign.agenda?.title);
  let next = {
    ...applyEffect(state, outcome.effects),
    turn: completedTurn,
    chapter: chapter.number,
    chapterTitle: chapter.title,
  };
  const worldChoice = applyWorldChoice(next.world, {
    turn: completedTurn,
    eventId: state.currentEvent.id,
    choiceId: selected.id,
    success,
    companionActorIds: companionActorIds(next),
    ...(combat ? { combatSummary: combat.summary, combatTechniqueIds: combat.hero.techniquesUsed } : {}),
  });
  next = { ...next, world: worldChoice.world };
  const worldHeroLocationId = next.world.actors.find((actor) => actor.id === "hero")?.locationId || state.currentLocationId;
  if (next.currentLocationId !== worldHeroLocationId) {
    const movedWorld = advanceWorldToScene(next.world, {
      turn: completedTurn,
      eventId: `choice:${selected.id}`,
      targetLocationId: next.currentLocationId,
      companionActorIds: companionActorIds(next),
    });
    const movedHeroLocationId = movedWorld.actors.find((actor) => actor.id === "hero")?.locationId || next.currentLocationId;
    const traversed = movedWorld.lastTransition?.heroPath || [movedHeroLocationId];
    next = {
      ...next,
      world: movedWorld,
      currentLocationId: movedHeroLocationId,
      discoveredLocationIds: Array.from(new Set([...next.discoveredLocationIds, ...traversed])),
    };
  } else {
    next = { ...next, currentLocationId: worldHeroLocationId };
  }
  const advanced = advanceNarrative(state, next, state.currentEvent, selected, success, completedTurn);
  next = { ...next, narrative: advanced.narrative };
  const campaignResult = campaignAfterChoice(state, next, selected, success, completedTurn, combat);
  next = syncLifeAfterScene(state, campaignResult.state);
  const changes = makeOutcomeChanges(state, next);
  const manuscript = composeScene(state, next, state.currentEvent, selected, outcome, success, completedTurn, chapter, combat);
  next = { ...next, narrative: appendScene(next.narrative, manuscript.scene) };
  const history = [...state.history, { turn: completedTurn, eventId: state.currentEvent.id, title: state.currentEvent.title, choiceId: selected.id, choice: selected.label, success }];
  const log = [...state.log, { id: `choice-${completedTurn}`, turn: completedTurn, kind: "choice" as const, text: `第${completedTurn}回：${selected.label}`, tone: "warm" as const }, ...makeOutcomeLog({ ...next, turn: completedTurn }, outcome.lines, success)];
  const discovery = [advanced.discovery, ...worldChoice.discoveries, ...campaignResult.discoveries].filter(Boolean).join("；");
  const pendingOutcome: TurnOutcome = {
    turn: completedTurn,
    eventId: state.currentEvent.id,
    eventTitle: state.currentEvent.title,
    choiceId: selected.id,
    choiceLabel: selected.label,
    success,
    ...(selected.check ? { check: { label: selected.check.label, odds: selected.check.odds, roll, method: combat ? "combat" as const : "roll" as const } } : {}),
    lines: outcome.lines,
    changes,
    revealTitle: revealTitleFor(state.currentEvent.id),
    revealLead: combat
      ? "这一场交手已经落定。胜负来自距离、内息、招式相克与平日火候，而不是一句含混的“武功高低”。"
      : selected.check
        ? `${success ? "你所倚仗的本事在这一刻应了手" : "你所倚仗的本事未能照预想应手"}，新的后果已经由此发生。`
        : "这一刻没有旁人替你作答。你的选择本身，就是结果。",
    resultParagraphs: manuscript.resultParagraphs,
    consequence: manuscript.consequence,
    ...(discovery ? { discovery } : {}),
    ...(combat ? { combat } : {}),
    scene: manuscript.scene,
  };
  next = { ...next, history, log, rngState: rng.state, pendingOutcome };
  return next;
};

export const continueNovelAction = (state: NovelState): NovelState => {
  if (state.ending) return state;
  if (state.campaign.phase === "year_break" && state.life.pendingYearMilestone) {
    const shouldOpenNextChapter = Boolean(state.campaign.chapterMilestone)
      || (state.turn > 0 && state.turn % state.campaign.chapterLength === 0);
    const nextChapterNumber = shouldOpenNextChapter ? state.chapter + 1 : state.chapter;
    const chapter = storyChapterFor(nextChapterNumber, state.campaign.agenda?.title);
    const narrative = shouldOpenNextChapter && !state.narrative.chapters.some((entry) => entry.number === nextChapterNumber)
      ? { ...state.narrative, chapters: [...state.narrative.chapters, { ...chapter, scenes: [] }] }
      : state.narrative;
    const campaign: WuxiaCampaignState = {
      ...state.campaign,
      phase: "planning",
      chapterMilestone: undefined,
      selectedActivityId: undefined,
      opportunities: refreshOpportunityStatuses(state.campaign.opportunities, state.world.day),
      availableActivities: [],
    };
    const next: NovelState = {
      ...state,
      chapter: nextChapterNumber,
      chapterTitle: shouldOpenNextChapter ? chapter.title : state.chapterTitle,
      narrative,
      life: { ...state.life, pendingYearMilestone: undefined },
      campaign,
      currentEvent: null,
    };
    return { ...next, campaign: { ...campaign, availableActivities: generatePlayerActivities(next) } };
  }
  if (state.campaign.phase === "chapter_break" && state.campaign.chapterMilestone) {
    const nextChapterNumber = state.chapter + 1;
    const chapter = storyChapterFor(nextChapterNumber, state.campaign.agenda?.title);
    const narrative = state.narrative.chapters.some((entry) => entry.number === nextChapterNumber)
      ? state.narrative
      : { ...state.narrative, chapters: [...state.narrative.chapters, { ...chapter, scenes: [] }] };
    const campaign: WuxiaCampaignState = {
      ...state.campaign,
      phase: "planning",
      chapterMilestone: undefined,
      selectedActivityId: undefined,
      opportunities: refreshOpportunityStatuses(state.campaign.opportunities, state.world.day),
      availableActivities: [],
    };
    const next: NovelState = {
      ...state,
      chapter: nextChapterNumber,
      chapterTitle: chapter.title,
      narrative,
      campaign,
      currentEvent: null,
    };
    const withActivities = { ...next, campaign: { ...campaign, availableActivities: generatePlayerActivities(next) } };
    return {
      ...withActivities,
      log: [...withActivities.log, {
        id: `chapter-${nextChapterNumber}`,
        turn: withActivities.turn,
        kind: "chapter",
        title: `第${nextChapterNumber}章 · ${chapter.title}`,
        text: "旧线索仍在，新的日程由你亲自安排。",
        tone: "warm",
      }],
    };
  }
  if (!state.pendingOutcome || state.campaign.phase !== "outcome") return state;
  const cleared: NovelState = { ...state, pendingOutcome: undefined, currentEvent: null };
  if (cleared.life.pendingYearMilestone) {
    const milestone = cleared.turn > 0 && cleared.turn % cleared.campaign.chapterLength === 0
      ? chapterMilestoneFor(cleared)
      : undefined;
    return {
      ...cleared,
      campaign: {
        ...cleared.campaign,
        phase: "year_break",
        chapterMilestone: milestone,
        selectedActivityId: undefined,
        availableActivities: [],
      },
    };
  }
  if (cleared.life.scenesThisYear >= cleared.life.maxScenesPerYear) {
    const milestone = cleared.turn > 0 && cleared.turn % cleared.campaign.chapterLength === 0
      ? chapterMilestoneFor(cleared)
      : undefined;
    const ready: NovelState = {
      ...cleared,
      campaign: {
        ...cleared.campaign,
        phase: "planning",
        chapterMilestone: milestone,
        selectedActivityId: undefined,
        availableActivities: [],
      },
    };
    return closeNovelYearAction(ready);
  }
  if (state.turn > 0 && state.turn % state.campaign.chapterLength === 0) {
    const milestone = chapterMilestoneFor(cleared);
    return {
      ...cleared,
      campaign: {
        ...cleared.campaign,
        phase: "chapter_break",
        chapterMilestone: milestone,
        selectedActivityId: undefined,
        availableActivities: [],
      },
      log: [...cleared.log, {
        id: `chapter-end-${cleared.chapter}`,
        turn: cleared.turn,
        kind: "chapter",
        title: `第${cleared.chapter}章 · ${cleared.chapterTitle}`,
        text: milestone.summary,
        tone: "warm",
      }],
    };
  }
  const campaign: WuxiaCampaignState = {
    ...cleared.campaign,
    phase: "planning",
    selectedActivityId: undefined,
    opportunities: refreshOpportunityStatuses(cleared.campaign.opportunities, cleared.world.day),
    availableActivities: [],
  };
  const next = { ...cleared, campaign };
  return { ...next, campaign: { ...campaign, availableActivities: generatePlayerActivities(next) } };
};

export const concludeNovelAction = (state: NovelState, endingId = "wandering_volume"): NovelState => {
  if (state.pendingOutcome || state.currentEvent || state.campaign.phase === "scene" || state.ending) return state;
  const endingChoice = getLifeEndingOptions(state).find((option) => option.id === endingId && option.unlocked);
  if (!endingChoice) return state;
  return {
    ...state,
    currentEvent: null,
    ending: endingFor(state, endingChoice.id),
    life: { ...state.life, status: "ending_preview", chosenEndingId: endingChoice.id },
    campaign: { ...state.campaign, phase: "ending", availableActivities: [] },
  };
};

export const resumeNovelAfterEndingAction = (state: NovelState): NovelState => {
  if (!state.ending || state.life.status !== "ending_preview") return state;
  const campaign: WuxiaCampaignState = {
    ...state.campaign,
    phase: "planning",
    selectedActivityId: undefined,
    availableActivities: [],
  };
  const next: NovelState = {
    ...state,
    ending: undefined,
    life: { ...state.life, status: "active", chosenEndingId: undefined },
    campaign,
  };
  return { ...next, campaign: { ...campaign, availableActivities: generatePlayerActivities(next) } };
};

export const getLocation = (state: NovelState) => currentLocation(state);
export const getAmbitionLabel = (ambition: AmbitionId) => AMBITIONS[ambition].label;
export const getOriginLabel = (origin: OriginId) => ORIGINS[origin].label;
export const getSeedText = (state: NovelState) => state.setup.seed;

export const generateName = (seed = `${Date.now()}:${Math.random()}`, exclude = "") => {
  const rng = createRng(hashSeed(seed));
  const family = rng.pick(NAME_PARTS.family);
  const given = rng.pick(NAME_PARTS.given);
  const candidate = `${family}${given}`;
  if (candidate !== exclude) return candidate;
  const givenIndex = NAME_PARTS.given.indexOf(given);
  return `${family}${NAME_PARTS.given[(givenIndex + 1) % NAME_PARTS.given.length]}`;
};

export const sanitizeSetup = (input: Partial<NovelSetup>): NovelSetup => ({
  heroName: (input.heroName || generateName()).trim().slice(0, 8) || generateName(),
  origin: input.origin && ORIGINS[input.origin] ? input.origin : "sect_disciple",
  ambition: input.ambition && AMBITIONS[input.ambition] ? input.ambition : "truth",
  sectId: (() => {
    const origin = input.origin && ORIGINS[input.origin] ? input.origin : "sect_disciple";
    const candidate = input.sectId;
    if (origin === "wanderer") return "none";
    if (candidate === "none") return ORIGINS[origin].sectId;
    return candidate && (candidate === ORIGINS[origin].sectId || SECTS_DATA.some((sect) => sect.id === candidate))
      ? candidate
      : ORIGINS[origin].sectId;
  })(),
  seed: (input.seed || `${Date.now()}`).trim() || "江湖",
});
