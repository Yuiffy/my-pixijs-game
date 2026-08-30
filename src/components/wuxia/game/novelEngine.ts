import { SECTS_DATA } from "../logic/constants";

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
  name: string;
  title: string;
  trait: string;
  affinity: number;
  portrait: string;
  joinedTurn: number;
}

export interface NovelLocation {
  id: string;
  name: string;
  type: "sect" | "city" | "wild" | "village" | "inn";
  descriptor: string;
  x: number;
  y: number;
}

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
  };
  lines: NovelLine[];
  changes: OutcomeChange[];
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
}

export interface NovelState {
  version: 1;
  setup: NovelSetup;
  seed: number;
  rngState: number;
  turn: number;
  maxTurns: number;
  chapter: number;
  chapterTitle: string;
  currentLocationId: string;
  locations: NovelLocation[];
  discoveredLocationIds: string[];
  hero: NovelHero;
  companions: NovelCompanion[];
  flags: Record<string, boolean>;
  log: StoryLogEntry[];
  history: NovelHistoryEntry[];
  currentEvent: NovelEvent | null;
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

const CHAPTERS = [
  { title: "入局", from: 0 },
  { title: "追线", from: 3 },
  { title: "风暴", from: 6 },
  { title: "终局", from: 9 },
] as const;

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
  revenge: { label: "雪恨", description: "追查一桩旧案，把欠你的名字刻回江湖。", stat: "martial" },
  truth: { label: "求真", description: "拨开密信与谣言，找出藏在局后的那只手。", stat: "insight" },
  protect: { label: "守义", description: "在风暴里护住无辜者，也护住自己不变的心。", stat: "chivalry" },
  freedom: { label: "逍遥", description: "不为名利所困，走一条只属于自己的路。", stat: "fortune" },
};

const LOCATION_DATA: NovelLocation[] = [
  { id: "sect_qingyun", name: "青云山", type: "sect", descriptor: "云海压着檐角，钟声在松涛里回荡。", x: 18, y: 18 },
  { id: "city_luoyang", name: "洛阳城", type: "city", descriptor: "朱雀街灯火未熄，人人都像藏着半句秘密。", x: 58, y: 31 },
  { id: "wild_heifeng", name: "黑风岭", type: "wild", descriptor: "山口终年有风，吹得旧旗猎猎作响。", x: 77, y: 68 },
  { id: "village_bailu", name: "白露村", type: "village", descriptor: "村口的白露井映着月色，井边总有人等消息。", x: 32, y: 70 },
  { id: "inn_tingyu", name: "听雨渡", type: "inn", descriptor: "雨棚连着水面，舟灯像一串摇晃的星。", x: 83, y: 21 },
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

const getChapter = (turn: number) => {
  let chapter: (typeof CHAPTERS)[number] = CHAPTERS[0];
  CHAPTERS.forEach((candidate) => {
    if (turn >= candidate.from) chapter = candidate;
  });
  return { number: CHAPTERS.indexOf(chapter) + 1, title: chapter.title };
};

const currentLocation = (state: NovelState, id = state.currentLocationId) => state.locations.find((location) => location.id === id) || state.locations[0];

const homeLocationId = (sectId: string) => (sectId === "none" ? "city_luoyang" : sectId);

const buildLocations = (sectId: string, origin: OriginId): NovelLocation[] => {
  const sect = SECTS_DATA.find((entry) => entry.id === sectId);
  const originData = ORIGINS[origin];
  const homeId = homeLocationId(sectId);
  return LOCATION_DATA.map((location) => {
    if (location.id !== "sect_qingyun" || homeId === "city_luoyang") return { ...location };
    const isOriginHome = originData.sectId === sectId;
    return {
      ...location,
      id: homeId,
      name: (isOriginHome && originData.homeName) || (sect ? `${sect.name}驻地` : originData.affiliationName),
      descriptor: (isOriginHome && originData.homeDescriptor) || sect?.description || location.descriptor,
    };
  });
};

const companionPortrait = (index: number) => [
  "/images/autochess/portraits/lian.png",
  "/images/autochess/portraits/xuehui.png",
  "/images/autochess/portraits/youyi.png",
][index % 3];

const makeCompanion = (state: NovelState, rng: Rng, id: string, title: string, trait: string): NovelCompanion => ({
  id,
  name: rng.pick(COMPANION_NAMES.filter((name) => !state.companions.some((companion) => companion.name === name)).length > 0
    ? COMPANION_NAMES.filter((name) => !state.companions.some((companion) => companion.name === name))
    : COMPANION_NAMES),
  title,
  trait,
  affinity: 46,
  portrait: companionPortrait(state.companions.length),
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
      line(state.turn, 2, "dialogue", `“江湖从不催人，催人的只是人心。”信末只有这一句。`, "无名落款"),
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
      line(state.turn, 2, "action", "你发现那人的茶盏底，压着和密信相同的铜纹。"),
    ],
    choices: [
      choice(state, { id: "buy-rumor", label: "用银两买下消息", description: "让金钱替你敲门，消息通常也会掺水。", tone: "gold", risk: "低", preview: [effectPreview("银两", "-10", "bad"), effectPreview("线索", "+1", "good")], success: { lines: [line(state.turn, 3, "action", "你把十枚银钱推过去，换来一张画着桥影的旧地图。")], effects: { silver: -10, clues: 1, item: "北斗桥图" } } }),
      choice(state, { id: "follow-hat", label: "跟上斗笠客", description: "把脚步交给直觉，可能撞上真正的幕后人。", tone: "steel", risk: "高", preview: [effectPreview("洞察", "+5", "good"), effectPreview("风声", "+12", "bad"), effectPreview("前往", "听雨渡", "neutral")], check: { stat: "insight", label: "跟踪检定", difficulty: 56 }, success: { lines: [line(state.turn, 3, "action", "你借着人潮换了三次位置，终于看见他把铜纹交给了渡口的船娘。")], effects: { stats: { insight: 5 }, clues: 2, heat: 12, moveTo: "inn_tingyu" } }, failure: { lines: [line(state.turn, 3, "narrative", "你跟丢在胭脂铺后，回头时只看见一枚钉在墙上的飞镖。")], effects: { stats: { fortune: 2 }, heat: 16 } } }),
      choice(state, { id: "perform-righteous", label: "当众揭穿谣言", description: "把危险摊在阳光下，名望会涨，敌意也会涨。", tone: "jade", risk: "中", preview: [effectPreview("侠义", "+6", "good"), effectPreview("名望", "+8", "good"), effectPreview("风声", "+10", "bad")], check: { stat: "chivalry", label: "声望检定", difficulty: 50 }, success: { lines: [line(state.turn, 3, "dialogue", "你抬杯一笑：“若真有旧盟，何必借茶馆的嘴说话？”满堂哗然。", state.hero.name)], effects: { stats: { chivalry: 6, fame: 8 }, heat: 10, clues: 1 } }, failure: { lines: [line(state.turn, 3, "narrative", "你的话被说书人的醒木压回去，反倒成了众人眼中的可疑之人。")], effects: { stats: { fame: 2 }, heat: 15 } } }),
    ],
  });
};

const buildBridgeAmbush = (state: NovelState): NovelEvent => {
  const location = currentLocation(state, "wild_heifeng");
  const enemy = state.hero.heat > 35 ? "黑衣追骑" : "断桥上的刀客";
  return eventBase(state, {
    id: "bridge-ambush",
    eyebrow: "第三回 · 夜行",
    title: "桥断之前",
    subtitle: "黑风岭 · 子时",
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
      line(state.turn, 2, "action", "她说自己也在追查北斗桥的旧盟，只差一个愿意把后背交出来的人。"),
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
      line(state.turn, 2, "inner", "残页的最后一行写着：心有执，剑便有隙。"),
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
      line(state.turn, 2, "action", isWanderer ? "门外风声像翻页，独行与借势的边界只剩一线。" : "门外风声像翻页，旧规矩与个人选择的边界只剩一线。"),
    ],
    choices: [
      choice(state, { id: "tell-truth", label: "据实相告", description: `让${venueName}知道你追查的每一步，换取公开的支援。`, tone: "jade", risk: "中", preview: [effectPreview("名望", "+7", "good"), effectPreview("侠义", "+5", "good"), effectPreview("风声", "+6", "bad")], check: { stat: "chivalry", label: "立誓检定", difficulty: 52 }, success: { lines: [line(state.turn, 3, "dialogue", `${questioner}听完没有责罚，只命人把门前的灯全点起来。`, questioner)], effects: { stats: { fame: 7, chivalry: 5 }, clues: 1, heat: 6, flag: "sect_support" } }, failure: { lines: [line(state.turn, 3, "narrative", "你说到铜纹来处时，席间有人先一步打断了你。")], effects: { stats: { insight: 4 }, heat: 10, flag: "sect_doubt" } } }),
      choice(state, { id: "hide-sect", label: "只交出无关线索", description: "把真正的底牌留给自己，在场人的态度会变得暧昧。", tone: "ink", risk: "低", preview: [effectPreview("洞察", "+5", "good"), effectPreview("风声", "-3", "good"), effectPreview("线索", "+1", "good")], success: { lines: [line(state.turn, 3, "action", "你把一张无关紧要的路线图摊开，所有人都以为你只是误入风波。")], effects: { stats: { insight: 5 }, clues: 1, heat: -3, flag: "sect_uncertain" } } }),
      choice(state, { id: "leave-sect", label: isWanderer ? "谢绝盘问，连夜出城" : isEscort ? "解下镖牌，连夜离局" : "卸下门牌，连夜下山", description: "从此不再借旧归属之名，孤身的选择会改变结局的颜色。", tone: "steel", risk: "高", preview: [effectPreview("机缘", "+6", "good"), effectPreview("名望", "-4", "bad"), effectPreview("前往", "黑风岭", "neutral")], check: { stat: "fortune", label: "决绝检定", difficulty: 50 }, success: { lines: [line(state.turn, 3, "narrative", isWanderer ? "你推门走入夜色，会馆的灯影从此只在身后。" : "你把旧牌放在石阶上，门前的灯影从此只在身后。")], effects: { stats: { fortune: 6, fame: -4 }, moveTo: "wild_heifeng", flag: "left_sect" } }, failure: { lines: [line(state.turn, 3, "narrative", "你走到门前，还是停住了脚。真正的离开，比想象中更难。")], effects: { stats: { fortune: 2 }, health: -8, flag: "left_sect" } } }),
    ],
  });
};

const buildTraitor = (state: NovelState): NovelEvent => {
  const location = currentLocation(state, "city_luoyang");
  const name = state.companions[0]?.name || "那名送信人";
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
      line(state.turn, 2, "dialogue", "“把最后一枚铜纹交出来，今晚就没人需要死。”陌生人说道。", "窗外的人"),
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
  return eventBase(state, {
    id: "duel-at-dawn",
    eyebrow: "第八回 · 约战",
    title: "黎明前的第三招",
    subtitle: "黑风岭 · 悬崖边",
    locationId: location.id,
    mood: "storm",
    lines: [
      line(state.turn, 0, "narrative", "天还没亮，悬崖边已经有人等你。"),
      line(state.turn, 1, "dialogue", "“你追的不是归潮阁，是你自己不肯放下的旧梦。”对方横剑而立。", "灰衣剑客"),
      line(state.turn, 2, "action", "他只出三招，像在替你丈量心里那道裂缝。"),
    ],
    choices: [
      choice(state, { id: "accept-duel", label: "接下三招", description: "以武问心，胜负会把你的名号传遍山下。", tone: "steel", risk: "高", preview: [effectPreview("武艺", "+9", "good"), effectPreview("名望", "+10", "good"), effectPreview("气血", "-28", "bad")], check: { stat: "martial", label: "决斗检定", difficulty: 63 }, success: { lines: [line(state.turn, 3, "action", "第三招落下，你没有退，剑锋却停在了彼此之间。"), line(state.turn, 4, "dialogue", "“你终于知道自己要赢什么。”灰衣剑客收剑，留下归潮阁的方位。", "灰衣剑客")], effects: { stats: { martial: 9, fame: 10 }, health: -28, clues: 2, heat: 7 } }, failure: { lines: [line(state.turn, 3, "narrative", "你接住前两招，第三招却让旧伤尽数裂开。灰衣剑客没有追击，只把一枚药丸弹到你脚边。")], effects: { stats: { insight: 5 }, health: -38, clues: 1, item: "止血丸", heat: 3 } } }),
      choice(state, { id: "read-sword", label: "只看，不接招", description: "放下证明自己的冲动，用洞察换取对方真正的目的。", tone: "jade", risk: "中", preview: [effectPreview("洞察", "+9", "good"), effectPreview("风声", "-5", "good"), effectPreview("名望", "-2", "bad")], check: { stat: "insight", label: "观招检定", difficulty: 58 }, success: { lines: [line(state.turn, 3, "inner", "你看见第三招并不是杀招，而是一道指向山谷的引路剑。")], effects: { stats: { insight: 9, fame: -2 }, clues: 2, heat: -5 } }, failure: { lines: [line(state.turn, 3, "narrative", "你看懂了招式，却没看懂他何时离去。悬崖边只剩一缕灰布。")], effects: { stats: { insight: 3 }, clues: 1 } } }),
      choice(state, { id: "walk-away-duel", label: "转身下山", description: "不让别人替你规定何时拔剑，逍遥之道有时就是拒绝。", tone: "ink", risk: "低", preview: [effectPreview("机缘", "+8", "good"), effectPreview("侠义", "+2", "good"), effectPreview("前往", "白露村", "neutral")], success: { lines: [line(state.turn, 3, "narrative", "你把剑收回鞘中，山风替你回答了那句没有说完的话。")], effects: { stats: { fortune: 8, chivalry: 2 }, moveTo: "village_bailu" } } }),
    ],
  });
};

const buildAlliance = (state: NovelState): NovelEvent => {
  const location = currentLocation(state, "city_luoyang");
  return eventBase(state, {
    id: "alliance-council",
    eyebrow: "第九回 · 合纵",
    title: "把名字写在同一张纸上",
    subtitle: "洛阳城 · 旧盟会馆",
    locationId: location.id,
    mood: "ember",
    lines: [
      line(state.turn, 0, "narrative", "会馆里坐着三方人马，桌上只有一盏未点的灯。"),
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
  const location = currentLocation(state, "village_bailu");
  const companion = makeCompanion(state, rng, "companion-lantern", "负灯医者", "善辨伤势与药毒");
  return eventBase(state, {
    id: "lantern-healer",
    eyebrow: `第${state.turn + 1}回 · 灯影`,
    title: "药炉旁还空着一张凳",
    subtitle: "白露村 · 夜诊",
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

const buildFinal = (state: NovelState): NovelEvent => {
  const location = currentLocation(state, "wild_heifeng");
  return eventBase(state, {
    id: "final-confrontation",
    eyebrow: `第${state.turn + 1}回 · 终局`,
    title: "潮声尽头见真章",
    subtitle: "归潮阁 · 天将明",
    locationId: location.id,
    mood: "ember",
    lines: [
      line(state.turn, 0, "narrative", "归潮阁建在潮线之外，海风把所有人的脚印吹成一条路。"),
      line(state.turn, 1, "dialogue", "“你追了这么久，究竟想要一个答案，还是一个可以恨的人？”阁主立在潮声里。", "归潮阁主"),
      line(state.turn, 2, "action", "你手中的铜纹终于合成完整的图案，旧案与今日的风暴在此重叠。"),
    ],
    choices: [
      choice(state, { id: "final-sword", label: "以剑结束旧账", description: "把所有迟疑斩断，成为传说，也可能成为传说里的反派。", tone: "steel", risk: "高", preview: [effectPreview("武艺", "+12", "good"), effectPreview("名望", "+14", "good"), effectPreview("气血", "-34", "bad")], check: { stat: "martial", label: "终局武决", difficulty: 66 }, success: { lines: [line(state.turn, 3, "action", "你没有回答，剑光先替你落下。潮声停了一瞬，阁主的面具碎成两半。"), line(state.turn, 4, "narrative", "旧案有了终点，而你的名字从此有了重量。")], effects: { stats: { martial: 12, fame: 14 }, health: -34, clues: 2, heat: 10, flag: "ended_by_sword" } }, failure: { lines: [line(state.turn, 3, "narrative", "你的剑穿过了幻影，真正的阁主从潮雾后出手。你倒下前，听见他说：答案从来不在剑上。")], effects: { stats: { insight: 8 }, health: -45, clues: 1, heat: 15, flag: "ended_wounded" } } }),
      choice(state, { id: "final-truth", label: "逼他把真相说完", description: "让证据、关系与洞察一起开口，结局未必痛快，却更完整。", tone: "jade", risk: "中", preview: [effectPreview("洞察", "+12", "good"), effectPreview("线索", "+3", "good"), effectPreview("名望", "+6", "good")], check: { stat: "insight", label: "真相检定", difficulty: 62 }, success: { lines: [line(state.turn, 3, "dialogue", "你把六枚铜纹依次摆开，阁主终于说出了当年真正的叛徒。", state.hero.name), line(state.turn, 4, "narrative", "真相没有让任何人轻松，却让活着的人知道该往哪里走。")], effects: { stats: { insight: 12, fame: 6 }, clues: 3, heat: -8, flag: "ended_by_truth" } }, failure: { lines: [line(state.turn, 3, "narrative", "你离真相只差一句，却被海风卷走了最后的证词。至少，铜纹证明了你没有走错。")], effects: { stats: { insight: 5 }, clues: 2, heat: -2, flag: "ended_by_truth" } } }),
      choice(state, { id: "final-spare", label: "放下刀，带人离开", description: "不让仇恨替你写最后一页，把未来留给仍愿同行的人。", tone: "gold", risk: "中", preview: [effectPreview("侠义", "+14", "good"), effectPreview("机缘", "+8", "good"), effectPreview("名望", "+5", "good")], check: { stat: "chivalry", label: "守义终局", difficulty: 58 }, success: { lines: [line(state.turn, 3, "action", "你收剑入鞘，海风越过肩头，像替这段旧账盖上了印。"), line(state.turn, 4, "narrative", "有人问你今后要去哪里，你说：先把身边的人带回家。")], effects: { stats: { chivalry: 14, fortune: 8, fame: 5 }, heat: -12, flag: "ended_by_mercy" } }, failure: { lines: [line(state.turn, 3, "narrative", "你放下刀，却没能阻止身后的箭。同行者替你挡住一箭，所有人终于明白温柔也需要力量。")], effects: { stats: { chivalry: 7 }, health: -20, heat: -5, flag: "ended_by_mercy" } } }),
    ],
  });
};

const buildRecovery = (state: NovelState): NovelEvent => {
  const location = currentLocation(state);
  return eventBase(state, {
    id: "quiet-recovery",
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
      choice(state, { id: "gather-news", label: "去附近听风", description: "让故事继续往前走，风声也可能把敌人带来。", tone: "gold", risk: "中", preview: [effectPreview("线索", "+1", "good"), effectPreview("名望", "+3", "good"), effectPreview("风声", "+8", "bad")], success: { lines: [line(state.turn, 2, "narrative", "你在街角听到一个熟悉的铜纹故事，立刻记在心里。")], effects: { clues: 1, stats: { fame: 3 }, heat: 8 } } }),
    ],
  });
};

const buildGeneric = (state: NovelState, rng: Rng): NovelEvent => {
  const location = currentLocation(state);
  const verbs = ["渡口的灯忽明忽暗", "山风卷来陌生的香气", "街角有人叫出你的名字", "一枚旧物落在脚边"];
  const focus = rng.pick(verbs);
  return eventBase(state, {
    id: `wandering-${state.turn}`,
    eyebrow: `第${state.turn + 1}回 · 行旅`,
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

const chooseEvent = (state: NovelState, rng: Rng): NovelEvent => {
  if (state.turn === 0) return buildOpening(state);
  if (state.turn >= state.maxTurns - 1) return buildFinal(state);
  const seen = new Set(state.history.map((entry) => entry.eventId));
  if (state.chapter === 1) {
    if (!seen.has("tea-whisper")) return buildTeaWhisper(state);
    if (!seen.has("bridge-ambush")) return buildBridgeAmbush(state);
  }
  if (state.chapter === 2) {
    if (!seen.has("rain-pavilion") && state.companions.length < 2) return buildRainPavilion(state, rng);
    if (!seen.has("broken-manual")) return buildBrokenManual(state);
    if (!seen.has("sect-trial")) return buildSectTrial(state);
  }
  if (state.chapter === 3) {
    if (!seen.has("traitor")) return buildTraitor(state);
    if (!seen.has("duel-at-dawn")) return buildDuel(state);
    if (!seen.has("alliance-council")) return buildAlliance(state);
  }
  if (state.chapter === 4 && !seen.has("lantern-healer") && state.companions.length < 2) {
    return buildLanternHealer(state, rng);
  }
  if (state.hero.health < 30) return buildRecovery(state);
  return buildGeneric(state, rng);
};

const enterEvent = (state: NovelState, event: NovelEvent): NovelState => {
  const locationId = state.locations.some((location) => location.id === event.locationId)
    ? event.locationId
    : state.currentLocationId;
  const discoveredLocationIds = state.discoveredLocationIds.includes(locationId)
    ? state.discoveredLocationIds
    : [...state.discoveredLocationIds, locationId];
  return { ...state, currentEvent: event, currentLocationId: locationId, discoveredLocationIds };
};

const introLines = (state: NovelState): StoryLogEntry[] => [
  { id: "intro-title", turn: 0, kind: "chapter", title: `《${state.hero.name}·${AMBITIONS[state.hero.ambition].label}录》`, text: "一卷由你亲手写下的江湖志", tone: "warm" },
  { id: "intro-world", turn: 0, kind: "scene", text: `你以“${ORIGINS[state.hero.origin].label}”的身份踏入江湖，第一站是${currentLocation(state).name}。`, tone: "muted" },
  { id: "intro-rule", turn: 0, kind: "scene", text: "每一回合只做一个决定。资源、关系与风声都会留下痕迹，直到最后一页。", tone: "muted" },
];

export const ORIGIN_OPTIONS = Object.entries(ORIGINS).map(([id, value]) => ({ id: id as OriginId, ...value }));
export const AMBITION_OPTIONS = Object.entries(AMBITIONS).map(([id, value]) => ({ id: id as AmbitionId, ...value }));
export const LOCATION_OPTIONS = LOCATION_DATA;

export const createNovelState = (input: Partial<NovelSetup> = {}): NovelState => {
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
  const originData = ORIGINS[origin];
  const sectName = getAffiliationName(sectId, origin);
  const locations = buildLocations(sectId, origin);
  const locationId = homeLocationId(sectId);
  const stats = { ...originData.stats, [AMBITIONS[ambition].stat]: originData.stats[AMBITIONS[ambition].stat] + 8 };
  const state: NovelState = {
    version: 1,
    setup: { heroName, origin, ambition, sectId, seed: seedText },
    seed,
    rngState: rng.state,
    turn: 0,
    maxTurns: 12,
    chapter: 1,
    chapterTitle: CHAPTERS[0].title,
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
    log: [],
    history: [],
    currentEvent: null,
  };
  state.log = introLines(state);
  const opening = chooseEvent(state, rng);
  return enterEvent({ ...state, rngState: rng.state }, opening);
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

  if (after.currentLocationId !== before.currentLocationId) {
    changes.push({ label: "前往", value: currentLocation(after).name, tone: "neutral" });
  }
  return changes;
};

const endingFor = (state: NovelState): NovelEnding => {
  const { stats } = state.hero;
  const ambition = AMBITIONS[state.hero.ambition];
  const core = stats[ambition.stat];
  const score = clamp(Math.round(core * 1.1 + state.hero.clues * 7 + stats.fame * 0.45 + stats.chivalry * 0.35 - state.hero.heat * 0.2 + state.companions.length * 6), 0, 100);
  if (state.flags.ended_by_truth && state.hero.clues >= 5) {
    return { title: "《照见潮声》", subtitle: "真相没有替你拔剑，却替你留下了名字。", summary: "你把散落在江湖各处的证词拼成完整的旧案，让后来者终于知道谁在风里点燃了第一盏灯。", rank: score >= 78 ? "上上签" : "上签", score, tags: ["求真", "留证", "归潮阁"] };
  }
  if (state.flags.ended_by_mercy && stats.chivalry >= 65) {
    return { title: "《不负此身》", subtitle: "你没有赢得所有战斗，却护住了仍愿同行的人。", summary: "江湖后来称你为守灯人。你走过的地方不一定有碑，但总有人记得那一刻你把刀收回了鞘。", rank: score >= 72 ? "上签" : "中上签", score, tags: ["守义", "同行", "留灯"] };
  }
  if (state.flags.ended_by_sword && stats.martial >= 66) {
    return { title: "《一剑成名》", subtitle: "旧账已清，新的传说正从你的剑尖开始。", summary: "你以最直接的方式结束了风暴。有人敬你，有人惧你，而你终于有资格选择下一场风该吹向哪里。", rank: score >= 75 ? "上上签" : "上签", score, tags: ["雪恨", "武决", "名震"] };
  }
  if (score >= 70) return { title: "《风过留痕》", subtitle: "你没有被江湖写完，江湖却记住了你的笔锋。", summary: "你在每一次取舍中留下了自己的章法。故事暂告一段落，下一卷仍有许多路可以走。", rank: "上签", score, tags: [ambition.label, "未完", "再会"] };
  if (score >= 48) return { title: "《人间行脚》", subtitle: "江湖没有给你答案，但给了你继续走的理由。", summary: "你带着几处伤、几位故人和一张尚未展开的地图离开潮声。故事没有完，只是换了一个章节。", rank: "中签", score, tags: ["行旅", "余温", "未完"] };
  return { title: "《雨打旧檐》", subtitle: "这一卷合上了，风声还在窗外。", summary: "有些线索错过了，有些人没有等到，但你仍从废墟里捡起了自己的名字。下一次，你会走得更远。", rank: "下签", score, tags: ["遗憾", "重来", "江湖"] };
};

export const chooseNovelAction = (state: NovelState, choiceId: string): NovelState => {
  if (!state.currentEvent || state.pendingOutcome || state.ending) return state;
  const selected = state.currentEvent.choices.find((entry) => entry.id === choiceId);
  if (!selected) return state;
  const rng = createRng(state.rngState);
  const roll = Math.floor(rng.next() * 100) + 1;
  const success = selected.check ? roll <= selected.check.odds : true;
  const outcome = success || !selected.failure ? selected.success : selected.failure;
  let next = applyEffect(state, outcome.effects);
  const completedTurn = state.turn + 1;
  const chapter = getChapter(completedTurn);
  const history = [...state.history, { turn: completedTurn, eventId: state.currentEvent.id, title: state.currentEvent.title, choice: selected.label, success }];
  const log = [...state.log, { id: `choice-${completedTurn}`, turn: completedTurn, kind: "choice" as const, text: `第${completedTurn}回：${selected.label}`, tone: "warm" as const }, ...makeOutcomeLog({ ...next, turn: completedTurn }, outcome.lines, success)];
  const pendingOutcome: TurnOutcome = {
    turn: completedTurn,
    eventId: state.currentEvent.id,
    eventTitle: state.currentEvent.title,
    choiceId: selected.id,
    choiceLabel: selected.label,
    success,
    ...(selected.check ? { check: { label: selected.check.label, odds: selected.check.odds, roll } } : {}),
    lines: outcome.lines,
    changes: makeOutcomeChanges(state, next),
  };
  next = { ...next, turn: completedTurn, chapter: chapter.number, chapterTitle: chapter.title, history, log, rngState: rng.state, pendingOutcome };
  if (chapter.number !== state.chapter) {
    next.log = [...next.log, { id: `chapter-${chapter.number}`, turn: completedTurn, kind: "chapter", title: `第${chapter.number}章 · ${chapter.title}`, text: "风向变了，旧线索开始互相指向。", tone: "warm" }];
  }
  return next;
};

export const continueNovelAction = (state: NovelState): NovelState => {
  if (!state.pendingOutcome || state.ending) return state;
  const next = { ...state, pendingOutcome: undefined };
  if (state.turn >= state.maxTurns) {
    return { ...next, currentEvent: null, ending: endingFor(next) };
  }
  const rng = createRng(state.rngState);
  const nextEvent = chooseEvent(next, rng);
  return enterEvent({ ...next, rngState: rng.state }, nextEvent);
};

export const getLocation = (state: NovelState) => currentLocation(state);
export const getAmbitionLabel = (ambition: AmbitionId) => AMBITIONS[ambition].label;
export const getOriginLabel = (origin: OriginId) => ORIGINS[origin].label;
export const getSeedText = (state: NovelState) => state.setup.seed;

export const generateName = (seed = `${Date.now()}`) => {
  const rng = createRng(hashSeed(seed));
  return `${rng.pick(NAME_PARTS.family)}${rng.pick(NAME_PARTS.given)}`;
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
