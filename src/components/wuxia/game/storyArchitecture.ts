import type { WuxiaCombatResult } from "./wuxiaCombat";
import {
  WUXIA_FACTIONS,
  seedPick,
  wuxiaRosterForSeed,
  type WuxiaFactionId,
} from "./wuxiaRoster";

export type RelationshipKind = "陌路" | "试探" | "同盟" | "知己" | "情愫" | "决裂" | "宿敌";

export interface RelationshipState {
  trust: number;
  affection: number;
  debt: number;
  grievance: number;
  loyalty: number;
  label: RelationshipKind;
}

export interface StoryCharacter {
  id: string;
  rosterId: string;
  sourcePackId?: string;
  name: string;
  sourceName: string;
  title: string;
  factionId: string;
  circles: string[];
  role: string;
  desire: string;
  fear: string;
  secret: string;
  signatureMove: string;
  signatureDescription: string;
  secretRevealed: boolean;
  portrait: string;
  romanceable?: boolean;
  status: "未谋面" | "在局中" | "同行" | "离去" | "敌对";
  relationship: RelationshipState;
  firstSeenTurn?: number;
  lastSeenTurn?: number;
}

export interface FactionState {
  id: string;
  name: string;
  sourceLabel?: string;
  creed: string;
  publicFace: string;
  hiddenAgenda: string;
  agendaRevealed: boolean;
  favor: number;
  pressure: number;
  stance: "庇护" | "观望" | "提防" | "追杀" | "结盟";
}

export type TechniqueStatus = "已会" | "初悟" | "大成";

export interface MartialTechnique {
  id: string;
  name: string;
  description: string;
  status: TechniqueStatus;
  mastery: number;
  unlockedTurn?: number;
}

export interface MartialLineage {
  name: string;
  origin: string;
  philosophy: string;
  cost: string;
  mastery: number;
  signatureTechniqueId: string;
  techniques: MartialTechnique[];
}

export interface StoryThread {
  id: string;
  title: string;
  question: string;
  actorIds: string[];
  status: "埋下" | "推进" | "兑现";
  progress: number;
  introducedTurn: number;
  payoffTurn?: number;
}

export interface StoryBible {
  title: string;
  subtitle: string;
  centralMystery: string;
  hiddenTruth: string;
  antagonistName: string;
  thematicQuestion: string;
  recurringMotifs: string[];
  finalDilemma: string;
}

export interface SceneManuscript {
  id: string;
  turn: number;
  chapter: number;
  chapterTitle: string;
  title: string;
  subtitle: string;
  locationName: string;
  paragraphs: string[];
  choiceLabel: string;
  resultLabel: string;
  consequence: string;
  characterIds: StoryCharacter["id"][];
  factionIds: FactionState["id"][];
  techniqueIds: string[];
  combat?: WuxiaCombatResult;
}

export interface ChapterManuscript {
  number: number;
  title: string;
  epigraph: string;
  scenes: SceneManuscript[];
}

export interface NarrativeArchitecture {
  mode: "emergent_sandbox";
  bible: StoryBible;
  cast: StoryCharacter[];
  factions: FactionState[];
  martial: MartialLineage;
  threads: StoryThread[];
  chapters: ChapterManuscript[];
}

export interface ArchitectureInput {
  seed: number;
  heroName: string;
  origin: "sect_disciple" | "wanderer" | "escort_guard";
  ambition: "revenge" | "truth" | "protect" | "freedom";
  affiliationName: string;
  artName: string;
}

export const STORY_CHAPTERS = [
  { number: 1, title: "人行各路", epigraph: "故事没有预先埋好的答案，只有同时上路的人。" },
  { number: 2, title: "相逢成局", epigraph: "同到一处是偶然，旧识与新债会把偶然写成因果。" },
  { number: 3, title: "恩怨生枝", epigraph: "帮过谁、负过谁，都比门楣上的名字走得更远。" },
  { number: 4, title: "此刻江湖", epigraph: "最后一页不替众人收束，只记下世界被你改变成了什么样。" },
] as const;

const LATER_CHAPTERS = [
  { title: "旧路新痕", epigraph: "走过的地方不会复原，重逢的人也不会回到初见。" },
  { title: "名动四方", epigraph: "名声先于本人抵达，赞誉与仇怨也会一同赶来。" },
  { title: "百川归招", epigraph: "学过的招式各有来处，真正属于你的那一式正在成形。" },
  { title: "自立门庭", epigraph: "门派不是一块匾，而是一群人愿意共同承担的规矩。" },
] as const;

export const storyChapterFor = (number: number, agendaTitle?: string): Omit<ChapterManuscript, "scenes"> => {
  const fixed = STORY_CHAPTERS[number - 1];
  if (fixed) return fixed;
  const later = LATER_CHAPTERS[(number - STORY_CHAPTERS.length - 1) % LATER_CHAPTERS.length];
  return {
    number,
    title: agendaTitle ? `${later.title} · ${agendaTitle}` : later.title,
    epigraph: later.epigraph,
  };
};

const clamp = (value: number) => Math.min(100, Math.max(0, value));

const relationshipLabel = (state: Omit<RelationshipState, "label">): RelationshipKind => {
  if (state.grievance >= 70 && state.trust < 28) return "宿敌";
  if (state.grievance >= 48 && state.trust < 42) return "决裂";
  if (state.affection >= 66 && state.trust >= 58) return "情愫";
  if (state.trust >= 72 && state.loyalty >= 54) return "知己";
  if (state.trust >= 50 || state.loyalty >= 48 || state.debt >= 58) return "同盟";
  if (state.trust >= 24 || state.affection >= 22 || state.grievance >= 22) return "试探";
  return "陌路";
};

const relationship = (input: Partial<Omit<RelationshipState, "label">> = {}): RelationshipState => {
  const state = {
    trust: input.trust ?? 8,
    affection: input.affection ?? 4,
    debt: input.debt ?? 0,
    grievance: input.grievance ?? 0,
    loyalty: input.loyalty ?? 4,
  };
  return { ...state, label: relationshipLabel(state) };
};

const themeFor = (ambition: ArchitectureInput["ambition"]) => ({
  revenge: "当仇人也有自己的旧友与所护之人，快意恩仇还是否快意？",
  truth: "没有一宗大案替你收束答案时，你愿意相信谁留下的亲历？",
  protect: "同行者各有立场，你能护住一个人而不替他决定余生吗？",
  freedom: "人在关系里越走越深时，逍遥究竟是不欠人，还是敢承担？",
}[ambition]);

const lineageFor = (input: ArchitectureInput): MartialLineage => {
  const techniques: MartialTechnique[] = input.artName.includes("剑")
    ? [
      { id: "hero_probe", name: "听风试锋", description: "剑尖不争胜，先听对手呼吸与步法。", status: "已会", mastery: 48 },
      { id: "hero_break", name: "雁回截脉", description: "借一次退步改换剑路，专断蓄势之招。", status: "初悟", mastery: 23 },
      { id: "hero_signature", name: "风止见青云", description: "收尽此前剑势，在一息静处决定出剑还是止剑。", status: "初悟", mastery: 8 },
    ]
    : input.artName.includes("步")
      ? [
        { id: "hero_probe", name: "听风辨路", description: "以脚下回音试出伏兵与虚实。", status: "已会", mastery: 50 },
        { id: "hero_break", name: "雁折回身", description: "在最像退路之处骤然换位。", status: "初悟", mastery: 24 },
        { id: "hero_signature", name: "千里不留尘", description: "借人群与地势连续换步，使围势自行撞散。", status: "初悟", mastery: 9 },
      ]
      : [
        { id: "hero_probe", name: "问路拳", description: "拳势留三分，只问来人的真实意图。", status: "已会", mastery: 46 },
        { id: "hero_break", name: "横山靠", description: "沉肩进身，以短劲破开强攻。", status: "初悟", mastery: 22 },
        { id: "hero_signature", name: "人间一息", description: "将一路见闻化入吐纳，守住一息便能再起。", status: "初悟", mastery: 8 },
      ];
  return {
    name: input.artName,
    origin: `${input.affiliationName}传下的本门武学`,
    philosophy: input.ambition === "revenge" ? "锋芒可以雪恨，但不可替心作答。" : input.ambition === "protect" ? "招式先护人，再问输赢。" : "先看清对面的人，再决定这一招落在哪里。",
    cost: "强行越阶会伤及经脉；只靠偷学而不懂心法，熟练越高反噬越重。",
    mastery: 30,
    signatureTechniqueId: "hero_signature",
    techniques,
  };
};

const BOOK_TITLES = ["《众行录》", "《洛川偶遇志》", "《人间招式簿》", "《今夜谁同路》", "《无主之卷》"] as const;
const FEARS = [
  "自己的招式被人记住，真正的心意却仍被误解",
  "旧友站到了另一边，而自己只能在众目之下作出选择",
  "欠下的人情越滚越大，最后再也分不清相助与利用",
  "江湖只记得一个梗和一招，却忘了使招的人也会改变",
] as const;

const factionAgenda = (name: string, seed: number) => seedPick([
  `${name}正在暗中争取一处新据点，门下谁主张结盟、谁主张独占尚无定论。`,
  `${name}最近丢了一册往来名簿，里面没有惊天秘密，却足以让许多旧识翻脸。`,
  `${name}内部正在争论是否公开传授一门招式；真正的分歧在于谁有资格定义“自己人”。`,
  `${name}欠下一笔跨门派的人情，掌事者想还，年轻门人却不愿承认。`,
], seed, `agenda:${name}`);

export const createNarrativeArchitecture = (input: ArchitectureInput): NarrativeArchitecture => {
  const roster = wuxiaRosterForSeed(input.seed, 8);
  const cast = roster.map((entry, index): StoryCharacter => ({
    id: `character_${entry.unitId}`,
    rosterId: entry.id,
    name: entry.name,
    sourceName: entry.sourceName,
    title: entry.title,
    factionId: entry.factionId,
    circles: entry.circles,
    role: `${WUXIA_FACTIONS[entry.factionId].name}${entry.circles.length ? ` · ${entry.circles.join(" / ")}` : ""}`,
    desire: seedPick(entry.desires, input.seed, `desire:${entry.id}`),
    fear: seedPick(FEARS, input.seed, `fear:${entry.id}`),
    secret: seedPick(entry.secrets, input.seed, `secret:${entry.id}`),
    signatureMove: entry.signatureMove,
    signatureDescription: entry.signatureDescription,
    secretRevealed: false,
    portrait: entry.portrait,
    status: "未谋面",
    relationship: relationship({ trust: 6 + ((input.seed + index * 13) % 12), affection: 3 + ((input.seed + index * 7) % 9) }),
  }));
  const activeFactionIds = Array.from(new Set(cast.map((entry) => entry.factionId))) as WuxiaFactionId[];
  const factions: FactionState[] = [
    {
      id: "home",
      name: input.affiliationName,
      sourceLabel: "玩家出身",
      creed: input.origin === "wanderer" ? "路见不平，各凭本心。" : input.origin === "escort_guard" ? "镖在人在，诺重千金。" : "剑正心正，先问无愧。",
      publicFace: `${input.heroName}在江湖中的来处，也是旁人判断你的第一层依据。`,
      hiddenAgenda: `${input.affiliationName}希望你在各方之间留下人情，却不愿替你承担由此结下的仇。`,
      agendaRevealed: true,
      favor: 46,
      pressure: 10,
      stance: "庇护",
    },
    ...activeFactionIds.map((factionId, index): FactionState => {
      const faction = WUXIA_FACTIONS[factionId];
      return {
        id: faction.id,
        name: faction.name,
        sourceLabel: faction.sourceLabel,
        creed: faction.creed,
        publicFace: faction.publicFace,
        hiddenAgenda: factionAgenda(faction.name, input.seed + index * 101),
        agendaRevealed: false,
        favor: 18 + ((input.seed + index * 19) % 24),
        pressure: 8 + ((input.seed + index * 23) % 22),
        stance: "观望",
      };
    }),
  ];
  const threads: StoryThread[] = cast.slice(0, 5).map((character, index) => ({
    id: `thread_${character.id}`,
    title: `${character.name}所求`,
    question: character.desire,
    actorIds: [character.id],
    status: "埋下",
    progress: 0,
    introducedTurn: Math.min(10, index + 1),
  }));
  const names = cast.slice(0, 3).map((entry) => entry.name).join("、");
  return {
    mode: "emergent_sandbox",
    bible: {
      title: seedPick(BOOK_TITLES, input.seed, "book"),
      subtitle: `${input.heroName}与${names}等人的未完江湖`,
      centralMystery: "本卷没有预设主案。人物依各自目标移动，相遇、旧识、误会和出手共同生成每一回。",
      hiddenTruth: "没有唯一幕后人；真相存在于人物记忆、已知关系与实际发生过的选择里。",
      antagonistName: cast[0].name,
      thematicQuestion: themeFor(input.ambition),
      recurringMotifs: ["同路而行的脚印", "被借过的一招", "没有送出的联名帖"],
      finalDilemma: "每次合上一章时，你可以换一条目标继续走，而不是替所有人关闭结局。",
    },
    cast,
    factions,
    martial: lineageFor(input),
    threads,
    chapters: [{ ...storyChapterFor(1), scenes: [] }],
  };
};

export const updateRelationship = (
  character: StoryCharacter,
  changes: Partial<Omit<RelationshipState, "label">>,
  turn: number,
  status?: StoryCharacter["status"],
): StoryCharacter => {
  const axes = {
    trust: clamp(character.relationship.trust + (changes.trust ?? 0)),
    affection: clamp(character.relationship.affection + (changes.affection ?? 0)),
    debt: clamp(character.relationship.debt + (changes.debt ?? 0)),
    grievance: clamp(character.relationship.grievance + (changes.grievance ?? 0)),
    loyalty: clamp(character.relationship.loyalty + (changes.loyalty ?? 0)),
  };
  return {
    ...character,
    status: status ?? character.status,
    firstSeenTurn: character.firstSeenTurn ?? turn,
    lastSeenTurn: turn,
    relationship: { ...axes, label: relationshipLabel(axes) },
  };
};

export const updateFaction = (
  faction: FactionState,
  changes: { favor?: number; pressure?: number; revealed?: boolean },
): FactionState => {
  const favor = clamp(faction.favor + (changes.favor ?? 0));
  const pressure = clamp(faction.pressure + (changes.pressure ?? 0));
  let stance: FactionState["stance"] = "观望";
  if (favor >= 68) stance = "结盟";
  else if (favor >= 44 && pressure < 55) stance = "庇护";
  else if (pressure >= 72) stance = "追杀";
  else if (pressure >= 48) stance = "提防";
  return { ...faction, favor, pressure, stance, agendaRevealed: faction.agendaRevealed || Boolean(changes.revealed) };
};

export const manuscriptText = (architecture: NarrativeArchitecture, ending?: { title: string; summary: string }) => {
  const chapterText = architecture.chapters.map((chapter) => {
    const scenes = chapter.scenes.map((scene) => `第${scene.turn}回  ${scene.title}\n\n${scene.paragraphs.join("\n\n")}`).join("\n\n");
    return `第${chapter.number}章  ${chapter.title}\n${chapter.epigraph}\n\n${scenes}`;
  }).join("\n\n");
  const epilogue = ending ? `\n\n尾声  ${ending.title}\n\n${ending.summary}` : "";
  return `${architecture.bible.title}\n${architecture.bible.subtitle}\n\n${chapterText}${epilogue}`.trim();
};
