import { RELATIONSHIP_RULES, canConfirmDating, canMarry, canHaveChild, readyForMarriage, readyForChild } from "./progression";
import { getHouseholdBudget, getPartnerProfile, isHousehold, willAgreeBudget } from "./household";
import { GROWTH_DEFAULTS, GROWTH_COSTS, applyGrowthAction, getAttractionBonus, hasMutualAttraction, isGrowthAction } from "./growth";
import {
  CANDIDATES,
  CHILD_ACTIONS,
  DIFFICULTIES,
  ECONOMY_EVENTS,
  PARENT_ACTIONS,
} from "./content";
import type {
  Candidate,
  CandidateId,
  ChildActionId,
  Difficulty,
  Ending,
  GameMode,
  MarriageGameAction,
  GameResolution,
  MarriageGameState,
  ParentActionId,
  MeetingTopic,
  ResolutionKind,
  ResolutionMetric,
  ResolutionStep,
  Scores,
} from "./types";

const STAGE_VALUE = {
  single: 0,
  chatting: 1,
  dating: 2,
  married: 3,
  parenthood: 4,
} as const;

export const ENDINGS: Record<string, Ending> = {
  modest: {
    id: "modest", title: "日子紧一点，彼此近一点", kicker: "旅行改期了，晚饭还是两个人一起做", description: "两个人一起缩减开支、分担工作，慢慢处理债务。生活没有一下子宽裕，但彼此仍然愿意同行。", color: "#55776b",
  },
  rebuilding: {
    id: "rebuilding", title: "还在修复的日常", kicker: "这几年走完了，生活还在继续", description: "有过冲突，也有过重新商量。关系与预算还需要时间，暂时没有完美答案，也不必急着替一生盖章。", color: "#68766c",
  },
  happy: {
    id: "happy",
    title: "平凡日子，一起走下去",
    kicker: "婚礼早就散场了，两个人仍然站在一起",
    description: "多年以后，催婚饭桌只剩一段旧事。两个人没有靠忍耐维持体面，而是把钱、照护、边界和每一次选择都认真过成了共同生活。",
    color: "#4f8a66",
  },
  depressed: {
    id: "depressed",
    title: "孩子需要被接住",
    kicker: "婚育交了卷，鸡娃又成了下一张任务表",
    description: "仓促进入育儿后，补习、排名和精英焦虑层层加码。大人都说是为了孩子，孩子却先被压得失去了生活感。",
    color: "#705b87",
  },
  burnout: {
    id: "burnout",
    title: "我先撑不住了",
    kicker: "这不是推进失败，是生活已经发出警报",
    description: "工作、经济和家庭催促一起压到上限。我先退出这张饭桌，让人生暂停，而不是继续替所有人的期待交卷。",
    color: "#586272",
  },
  exploited: {
    id: "exploited",
    title: "长期困顿，重新起步",
    kicker: "账单连续多年无解，生活需要重新安排",
    description: "多次缩减和周转仍没有补上缺口，债务持续挤压生活。接下来要搬家、重排工作与还款计划。婚姻是否继续，仍是另一件事。",
    color: "#9b643f",
  },
  ruin: {
    id: "ruin",
    title: "与原生家庭暂时断联",
    kicker: "谁都说为了这个家，最后家却不在了",
    description: "比较、威胁和拒绝沟通耗光最后的亲情。没有赢家，只剩互相拉黑后的安静。",
    color: "#993f43",
  },
  hollow: {
    id: "hollow",
    title: "婚姻熬成了任务",
    kicker: "证领了很多年，问题也跟了很多年",
    description: "两个人没有立刻散伙，却也没真正建立共同生活。债务、家务和催生轮番接班，婚姻从仓促决定慢慢熬成一张每天都要打卡的任务表。",
    color: "#8b734d",
  },
  runaway: {
    id: "runaway",
    title: "我们决定离婚",
    kicker: "钱的难处背后，是日子已经无法一起商量",
    description: "双方决定结束婚姻，重新安排住处、财务和各自的生活。有孩子就仍需共同承担照护。离婚结束的是这段关系，不是任何人的人生。",
    color: "#925642",
  },
  love: {
    id: "love",
    title: "认真恋爱，暂不交卷",
    kicker: "关系有进展，人生没有被催熟",
    description: "两个人愿意继续走下去，但拒绝把婚育当成下一张自动弹出的任务卡。",
    color: "#a35f73",
  },
  independent: {
    id: "independent",
    title: "清醒单身",
    kicker: "没有结婚，也没有输",
    description: "年轻人守住事业、现金流和选择权。家庭未必理解，但人生重新回到了本人手里。",
    color: "#497a83",
  },
  ceasefire: {
    id: "ceasefire",
    title: "代际停火",
    kicker: "意见仍不同，关系先保住了",
    description: "家长学会把支持放在催促前面，子女也愿意继续沟通。没有标准答案，但有下一次谈话。",
    color: "#59735e",
  },
  stalemate: {
    id: "stalemate",
    title: "明年再问",
    kicker: "问题被推迟，矛盾仍在饭桌底下",
    description: "谁都没有彻底让步，生活也没有彻底崩坏。春节结束了，家庭群还会继续弹出消息。",
    color: "#68707c",
  },
};

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, Math.round(value)));

export function getAgeAtTurn(
  state: Pick<MarriageGameState, "startAge" | "turn" | "monthsPerTurn">,
  turn = state.turn,
) {
  return state.startAge + Math.floor((Math.max(0, turn - 1) * state.monthsPerTurn) / 12);
}

export function getCandidate(id: CandidateId | null): Candidate | null {
  return CANDIDATES.find(candidate => candidate.id === id) || null;
}

function clone(state: MarriageGameState): MarriageGameState {
  return {
    ...state,
    candidateOptions: [...state.candidateOptions],
    rejectedCandidates: [...state.rejectedCandidates],
    log: [...state.log],
    scores: { ...state.scores },
  };
}

const RESOLUTION_METRICS: Array<[ResolutionMetric, string]> = [
  ["fitness", "体能"],
  ["grooming", "仪容"],
  ["interests", "生活内容"],
  ["relationshipBalance", "相处平衡"],
  ["understanding", "相互了解"],
  ["stress", "压力"],
  ["autonomy", "自主"],
  ["familyBond", "与父母的亲情"],
  ["savings", "存款"],
  ["career", "事业"],
  ["relation", "伴侣感情"],
  ["mutualIntent", "对方意愿"],
  ["pressure", "家庭催促"],
  ["parentFace", "家长面子"],
  ["support", "累计家里支援"],
  ["familyReserve", "家里可支援"],
  ["weddingDebt", "婚育债务"],
  ["nextGenStress", "下一代压力"],
];

function resolutionSnapshot(state: MarriageGameState) {
  return Object.fromEntries(
    RESOLUTION_METRICS.map(([key]) => [key, state[key]]),
  ) as Record<ResolutionMetric, number>;
}

function addResolutionStep(
  steps: ResolutionStep[] | undefined,
  kind: ResolutionKind,
  title: string,
  detail: string,
  before: Record<ResolutionMetric, number>,
  state: MarriageGameState,
) {
  if (!steps) return;
  const changes = RESOLUTION_METRICS
    .map(([key, label]) => ({
      key,
      label,
      before: before[key],
      after: state[key],
      delta: state[key] - before[key],
    }))
    .filter(change => change.delta !== 0);
  steps.push({ kind, title, detail, changes });
}

function applyResolvedStep(
  state: MarriageGameState,
  steps: ResolutionStep[] | undefined,
  kind: ResolutionKind,
  title: string,
  apply: () => boolean,
) {
  const before = resolutionSnapshot(state);
  const logLength = state.log.length;
  if (!apply()) return false;
  const detail = state.log.length > logLength
    ? state.log[state.log.length - 1]
    : state.lastEvent;
  addResolutionStep(steps, kind, title, detail, before, state);
  return true;
}

function random(state: MarriageGameState) {
  state.rng = (state.rng * 1664525 + 1013904223) % 4294967296;
  return state.rng / 4294967296;
}

function sample<T>(state: MarriageGameState, values: T[], count: number): T[] {
  const pool = [...values];
  const result: T[] = [];
  while (pool.length && result.length < count) {
    result.push(pool.splice(Math.floor(random(state) * pool.length), 1)[0]);
  }
  return result;
}

function record(state: MarriageGameState, text: string) {
  state.lastEvent = text;
  state.log = [...state.log, text].slice(-18);
}

function normalize(state: MarriageGameState) {
  state.understanding = clamp(state.understanding);
  state.fitness = clamp(state.fitness);
  state.grooming = clamp(state.grooming);
  state.interests = clamp(state.interests);
  state.relationshipBalance = clamp(state.relationshipBalance);
  state.stress = clamp(state.stress);
  state.autonomy = clamp(state.autonomy);
  state.familyBond = clamp(state.familyBond);
  state.savings = clamp(state.savings, -100, 140);
  state.career = clamp(state.career);
  state.relation = clamp(state.relation);
  state.mutualIntent = clamp(state.mutualIntent);
  state.pressure = clamp(state.pressure);
  state.parentFace = clamp(state.parentFace);
  state.support = clamp(state.support, 0, 120);
  state.weddingDebt = clamp(state.weddingDebt, 0, 160);
  state.nextGenStress = clamp(state.nextGenStress);
  state.familyReserve = clamp(state.familyReserve, 0, 42);
}

export function getScores(state: MarriageGameState): Scores {
  const stage = STAGE_VALUE[state.stage];
  const child = Math.max(
    0,
    Math.round(
      state.autonomy * 1.7 +
        (100 - state.stress) * 1.5 +
        Math.max(0, state.savings) * 0.8 +
        state.career * 0.7 +
        state.relation * 0.6 -
        state.weddingDebt * 0.9 -
        state.nextGenStress * 0.75,
    ),
  );
  const parent = Math.max(
    0,
    Math.round(
      stage * 72 +
        state.parentFace * 1.1 +
        state.familyBond * 0.8 +
        state.support * 0.7 -
        state.stress * 1.15 -
        state.weddingDebt * 0.65 -
        state.nextGenStress * 0.85,
    ),
  );
  const family = Math.max(
    0,
    Math.round(
      state.familyBond * 1.4 +
      state.relation +
      (100 - state.stress) -
      state.pressure * 0.7 -
      state.weddingDebt * 0.5 -
      state.nextGenStress,
    ),
  );
  return { child, parent, family };
}

export function getEnding(state: MarriageGameState): Ending {
  if (state.ending && ENDINGS[state.ending]) return ENDINGS[state.ending];
  if (state.familyBond <= 5) return ENDINGS.ruin;
  if (state.nextGenStress >= 100) return ENDINGS.depressed;
  if (state.burnoutTurns >= 2) return ENDINGS.burnout;
  if (isHousehold(state) && state.conflictTurns >= 3) return ENDINGS.runaway;
  if (state.moneyStrainTurns >= 3 && state.weddingDebt >= 45) return ENDINGS.exploited;
  if (isHousehold(state)) {
    const connected = state.relation >= 65 && state.mutualIntent >= 55 && state.relationshipBalance >= 55;
    if (connected && state.stress < 80 && state.nextGenStress < 60) {
      if (state.lifestyle === "lean" && state.budgetAgreed && getHouseholdBudget(state).net >= 0) return ENDINGS.modest;
      if (state.savings >= 24 && state.weddingDebt <= 28 && getHouseholdBudget(state).net >= 0) return ENDINGS.happy;
    }
    if (state.relation < 50 || state.mutualIntent < 40 || state.stress >= 85 || state.relationshipBalance < 35) return ENDINGS.hollow;
    return ENDINGS.rebuilding;
  }
  if (state.stage === "dating" && state.relation >= 58 && state.mutualIntent >= 50 && state.relationshipBalance >= 40) return ENDINGS.love;
  if (state.autonomy >= 72 && state.stress <= 68 && state.stage !== "married") return ENDINGS.independent;
  if (state.familyBond >= 62 && state.pressure <= 42) return ENDINGS.ceasefire;
  return ENDINGS.stalemate;
}

export function getEndingReason(state: MarriageGameState) {
  if (state.monthsPerTurn === 12 && state.phase === "ended" && ["burnout", "exploited", "runaway"].includes(state.ending || "") && state.burnoutTurns + state.moneyStrainTurns + state.conflictTurns === 0) return "这是旧版保存的阶段记录，保留当时的结果；新局会先提供困难恢复窗口。";
  if (state.ending === "runaway") return state.lastChildAction === "separate"
    ? "双方主动选择结束婚姻；财务与照护仍需协商。"
    : `伴侣感情与对方意愿均低于 35，已经持续 ${state.conflictTurns} 个回合。`;
  if (state.ending === "burnout") return `回合结算时压力连续 ${state.burnoutTurns} 次达到 95 以上。不是因存款见底而结束。`;
  if (state.ending === "exploited") return `连续 ${state.moneyStrainTurns} 回合出现实际收支缺口，债务累积到 ${state.weddingDebt}。这不等于自动离婚。`;
  if (state.ending === "ruin") return `与父母的亲情降至 ${state.familyBond}，暂时停止家庭往来；不代表伴侣关系结束。`;
  if (state.ending === "depressed") return `下一代压力达到 ${state.nextGenStress}，需要停下过度安排。`;
  return `走完 ${state.turn} 个家庭回合：伴侣感情 ${state.relation}，对方意愿 ${state.mutualIntent}；存款 ${state.savings}，债务 ${state.weddingDebt}。记录当前生活，不预言一生。`;
}

function endGame(state: MarriageGameState) {
  const ending = getEnding(state);
  state.phase = "ended";
  state.ending = ending.id;
  state.scores = getScores(state);
  state.candidateOptions = [];
  record(state, `结局：${ending.title}`);
}

function checkTerminal(state: MarriageGameState) {
  normalize(state);
  // Money and adult stress are evaluated after a complete year, with a recovery window.
  if (state.familyBond <= 5 || state.nextGenStress >= 100) {
    endGame(state);
    return true;
  }
  return state.phase === "ended";
}

export function createInitialState(): MarriageGameState {
  return {
    version: 5,
    ...GROWTH_DEFAULTS,
    familyReserve: 42,
    monthsPerTurn: 3,
    understanding: 0,
    chemistry: 50,
    matchClosed: false,
    datingFeedback: "先聊一聊，看看对方是否也想认识你。",
    lifestyle: "usual",
    budgetAgreed: false,
    moneyStrainTurns: 0,
    burnoutTurns: 0,
    conflictTurns: 0,
    recoveryGranted: false,
    partnerNote: "还没有一起谈过生活预算。",
    phase: "lobby",
    mode: "child",
    difficulty: "realistic",
    seed: 1,
    rng: 1,
    turn: 0,
    maxTurns: 24,
    startAge: 26,
    marriedAtTurn: null,
    parenthoodAtTurn: null,
    activeActor: "child",
    selectionKind: "opening",
    candidateId: null,
    candidateOptions: [],
    rejectedCandidates: [],
    currentEventId: null,
    stage: "single",
    stress: 20,
    autonomy: 62,
    familyBond: 70,
    savings: 46,
    career: 58,
    relation: 0,
    mutualIntent: 0,
    pressure: 20,
    parentFace: 28,
    support: 0,
    weddingDebt: 0,
    nextGenStress: 0,
    meetings: 0,
    boundaries: 0,
    coerciveMoves: 0,
    supportiveMoves: 0,
    childPlan: "unknown",
    lastParentAction: null,
    lastChildAction: null,
    lastEvent: "年夜饭刚坐下，家庭群已经发来三张相亲简历。",
    log: [],
    ending: null,
    scores: { child: 0, parent: 0, family: 0 },
  };
}

function draftCandidates(state: MarriageGameState) {
  const blocked = new Set([
    ...state.rejectedCandidates,
    ...(state.candidateId ? [state.candidateId] : []),
  ]);
  let available = CANDIDATES.filter(candidate => !blocked.has(candidate.id));
  if (available.length === 0) {
    state.rejectedCandidates = [];
    available = CANDIDATES.filter(candidate => candidate.id !== state.candidateId);
  }
  state.candidateOptions = sample(
    state,
    available.map(candidate => candidate.id),
    3,
  );
  state.phase = "candidate";
  state.activeActor = "parent";
}

function chooseAiCandidate(state: MarriageGameState) {
  if (!state.candidateOptions.length) draftCandidates(state);
  const options = state.candidateOptions
    .map(getCandidate)
    .filter((candidate): candidate is Candidate => Boolean(candidate));
  options.sort(
    (a, b) => b.resume + b.initialIntent * 0.18 -
      (a.resume + a.initialIntent * 0.18),
  );
  return options[Math.floor(random(state) * Math.min(2, options.length))] || options[0];
}

function assignCandidate(state: MarriageGameState, id: CandidateId) {
  const candidate = getCandidate(id);
  if (!candidate) return false;
  state.candidateId = id;
  state.relationshipBalance = GROWTH_DEFAULTS.relationshipBalance;
  state.candidateOptions = [];
  state.stage = "single";
  state.relation = 4;
  state.meetings = 0;
  state.understanding = 0;
  state.matchClosed = false;
  state.chemistry = Math.floor(random(state) * 85) + 10;
  state.datingFeedback = candidate.initialIntent < 40 ? "这次主要是家里安排，对方暂时没有急着交往的打算。" : "愿意先认识一下，还没有决定是否交往。";
  state.budgetAgreed = false;
  state.conflictTurns = 0;
  state.partnerNote = getPartnerProfile(state).wish;
  state.mutualIntent = clamp(
    candidate.initialIntent + (random(state) - 0.5) * 14,
  );
  record(state, `家庭群推来 ${candidate.name}：${candidate.opening}`);
  return true;
}

function applyEconomyEvent(state: MarriageGameState) {
  const previous = ECONOMY_EVENTS.find(event => event.id === state.currentEventId);
  const recoveryThreshold = state.difficulty === "gentle"
    ? 62
    : state.difficulty === "realistic"
      ? 70
      : 84;
  const needsBreather = (previous?.stress ?? 0) > 0 || state.stress >= recoveryThreshold;
  const eligible = ECONOMY_EVENTS.filter(event => (
    event.id !== state.currentEventId && (!needsBreather || event.stress <= 0)
  ));
  const pool = eligible.length ? eligible : ECONOMY_EVENTS;
  const event = pool[Math.floor(random(state) * pool.length)];
  const scale = DIFFICULTIES[state.difficulty].economy;
  state.currentEventId = event.id;
  state.savings += event.savings < 0 ? event.savings * scale : event.savings;
  state.career += event.career < 0 ? event.career * scale : event.career;
  state.stress += event.stress > 0 ? event.stress * scale : event.stress;
  record(state, `${event.title}：${event.detail}`);
  normalize(state);
}

export function getAvailableChildActions(
  state: MarriageGameState,
): ChildActionId[] {
  if (state.phase !== "turn" || !state.candidateId) return [];
  const relief: ChildActionId[] = [];
  relief.push("rest", ...Object.entries(GROWTH_COSTS).filter(([, cost]) => state.savings >= cost).map(([id]) => id as ChildActionId));
  if (!state.matchClosed && (state.meetings > 0 || isHousehold(state))) {
    relief.push("relationship-boundary");
    if (state.savings >= 8) relief.push("overgive");
  }
  if (state.savings <= 20 && state.familyReserve > 0 && state.familyBond > 15) relief.push("ask-help");
  if (state.lifestyle !== "lean" || !state.budgetAgreed) relief.push("budget");
  if (isHousehold(state)) {
    const actions: ChildActionId[] = ["build-home", "boundary", "work", ...relief];
    if (state.stage === "parenthood") actions.unshift("protect-child");
    else if (state.childPlan !== "childfree") {
      actions.push("delay", "childfree");
      if (canHaveChild(state)) actions.push("baby");
    }
    if (state.relation < 45 || state.mutualIntent < 38 || state.conflictTurns > 0 || state.relationshipBalance < 40) actions.push("separate");
    return actions;
  }
  if (state.matchClosed) return ["next", "boundary", "work", ...relief];
  const actions: ChildActionId[] = ["chat-listen", "chat-share", "chat-checklist", "meet", "meet-aa", "next", "boundary", "work", "delay", ...relief];
  if (canMarry(state)) actions.push("marry", "simple-wedding");
  return actions;
}

export function getAvailableParentActions(
  state: MarriageGameState,
): ParentActionId[] {
  if (state.phase !== "turn" || !state.candidateId) return [];
  if (state.stage === "parenthood") return ["push-education", "compare", ...(state.familyReserve > 0 ? ["support" as const] : []), "listen"];
  if (state.stage === "married") return ["push-baby", "compare", ...(state.familyReserve > 0 ? ["support" as const] : []), "listen"];
  const actions: ParentActionId[] = [
    "push-meet",
    "compare",
    "next",
    ...(state.familyReserve > 0 ? ["support" as const] : []),
    "listen",
  ];
  if (state.stage === "chatting" || state.stage === "dating") actions.splice(2, 0, "encourage");
  if (state.stage === "dating") actions.push("push-marriage");
  return actions;
}

function applyChildAction(state: MarriageGameState, id: ChildActionId, topic: MeetingTopic = "everyday") {
  if (!["everyday", "listen", "plans"].includes(topic)) return false;
  if (!getAvailableChildActions(state).includes(id)) return false;
  const candidate = getCandidate(state.candidateId);
  if (!candidate) return false;
  state.lastChildAction = id;
  const { compatibility } = candidate;
  if (isGrowthAction(id)) {
    applyGrowthAction(state, id);
    record(state, state.growthNote);
  } else if (id === "overgive") {
    state.savings -= 8;
    state.autonomy -= 10;
    state.relationshipBalance -= 16;
    state.stress -= 8;
    state.growthNote = "为了避免分歧，又取消了自己的安排、包下额外开销。事情暂时过去，但没有因此得到更多爱意。";
    state.datingFeedback = state.growthNote;
    state.partnerNote = state.growthNote;
    record(state, state.growthNote);
  } else if (id === "relationship-boundary") {
    const responsive = state.relation >= 40 && state.mutualIntent >= 40 && state.understanding >= 30;
    state.autonomy += 10;
    state.stress -= 9;
    state.understanding += 12;
    state.relationshipBalance += responsive ? 24 : 6;
    state.relation += responsive ? 4 : -2;
    state.mutualIntent += responsive ? 3 : -2;
    state.growthNote = responsive
      ? "你说明自己的预算、运动时间和感受。对方愿意轮流安排约会、共同分担，给彼此留出空间。接下来还要看是否做到。"
      : "你提出不能总由一方出钱、迁就时间，也不能用贬低代替沟通。对方还没有答应调整；你可以继续观察，也可以离开。";
    state.datingFeedback = state.growthNote;
    state.partnerNote = state.growthNote;
    record(state, state.growthNote);
  } else if (id === "chat-listen" || id === "chat-share" || id === "chat-checklist") {
    const checklist = id === "chat-checklist";
    const rushed = checklist && state.understanding < 35;
    state.understanding = clamp(state.understanding + (checklist ? 28 : id === "chat-share" ? 12 : 20));
    state.relation += rushed ? -3 : id === "chat-share" ? 8 + (state.interests >= 60 ? 3 : 0) : 5;
    state.mutualIntent += rushed ? -6 : hasMutualAttraction(state) ? 5 : 0;
    state.stress += rushed ? 4 : -3;
    if (state.stage === "single") state.stage = "chatting";
    state.datingFeedback = rushed
      ? "对方：可以谈计划，但我们刚认识，这样连着问有点像面试。"
      : !hasMutualAttraction(state) && state.understanding >= 35
        ? "回复很礼貌，但很少主动问起你。也许没有同样的兴趣，不必硬聊。"
        : id === "chat-share" ? "对方也分享了最近的生活，话题终于不是只剩条件。" : "对方把话说完了。愿意聊天是了解的开始，还不是交往承诺。";
    record(state, state.datingFeedback);
  } else if (id === "meet" || id === "meet-aa" || id === "invest") {
    const premature = topic === "plans" && state.understanding < 40;
    state.meetings += 1;
    state.understanding = clamp(state.understanding + (topic === "plans" ? 35 : topic === "listen" ? 30 : 22));
    const cost = id === "meet-aa" ? Math.ceil(candidate.cityCost / 2) : candidate.cityCost;
    state.savings -= cost;
    state.stress += 3 + state.pressure * 0.04;
    const welcomed = hasMutualAttraction(state);
    const established = state.stage === "dating";
    const impression = established ? 0 : getAttractionBonus(state);
    state.relation = Math.min(established ? 100 : 30 + state.chemistry + impression, state.relation + (welcomed ? 12 + compatibility * 0.08 + Math.floor(impression / 3) : 4));
    state.mutualIntent = Math.min(established ? 100 : 25 + state.chemistry + impression, state.mutualIntent + (welcomed ? 10 : -3));
    if (topic === "listen") { state.relation -= 3; state.stress -= 3; }
    if (topic === "plans") { state.relation -= premature ? 6 : 2; state.mutualIntent += premature ? -7 : 4; state.stress += premature ? 5 : 0; }
    if (state.stage === "single") state.stage = "chatting";
    if (canConfirmDating(state)) state.stage = "dating";
    if (state.meetings >= RELATIONSHIP_RULES.dating.meetings && !welcomed) {
      state.matchClosed = true;
      state.datingFeedback = "对方：见过几次，我觉得我们不太有恋爱的感觉，就到这里吧。";
    } else if (state.stage === "dating") state.datingFeedback = "双方明确愿意继续交往，这次终于不是替父母完成任务。";
    else state.datingFeedback = welcomed ? "见面聊得还不错，对方愿意再约一次，但还需要时间了解。" : "对方很客气，但没有表现出继续靠近的兴趣。";
    if (premature && !state.matchClosed) state.datingFeedback = `对方觉得婚育问题问得太急，想先认识你本人。${state.datingFeedback}`;
    record(state, `第 ${state.meetings} 次见面，${id === "meet-aa" ? "提前说好 AA" : "这次由我请客"}，花费 ${cost}。${topic === "listen" ? "先听对方讲最近的生活。" : topic === "plans" ? "谈了城市与婚育预期。" : "互相分享平时的生活。"}${state.datingFeedback}`);
  } else if (id === "next") {
    if (!state.rejectedCandidates.includes(candidate.id)) state.rejectedCandidates.push(candidate.id);
    state.autonomy += 10;
    state.stress -= 10;
    state.familyBond -= state.matchClosed ? 2 : 7 + state.pressure * 0.04;
    state.pressure += state.matchClosed ? 0 : 5;
    state.candidateId = null;
    state.stage = "single";
    state.relation = 0;
    state.mutualIntent = 0;
    record(state, state.matchClosed ? `与 ${candidate.name} 没有达成双向好感，双方结束了解，继续认识其他人。` : `子女拒绝继续消耗：${candidate.name} 不合适，换下一个。`);
    if (state.mode === "child") {
      draftCandidates(state);
      const next = chooseAiCandidate(state);
      if (next) assignCandidate(state, next.id);
      state.phase = "turn";
      state.activeActor = "child";
    } else {
      state.selectionKind = "replace";
      draftCandidates(state);
    }
  } else if (id === "boundary") {
    const backlash = state.pressure > 70;
    state.boundaries += 1;
    state.autonomy += 12;
    state.stress -= backlash ? 5 : 13;
    state.pressure -= 12;
    state.familyBond += backlash ? -7 : 4;
    record(
      state,
      backlash
        ? "子女说清边界，饭桌当场爆发争吵，但至少不再沉默。"
        : "子女把担忧说清楚：可以关心，但决定必须由本人做。",
    );
  } else if (id === "work") {
    state.savings += 10;
    state.career += 9;
    state.stress += 5;
    state.autonomy += 5;
    state.relation -= state.stage === "dating" ? 5 : 2;
    state.mutualIntent -= 2;
    record(state, "子女先把手上的班上完，为失业、搬家和生活保留现金缓冲。");
  } else if (id === "simple-wedding") {
    state.marriedAtTurn = state.turn;
    state.stage = "married";
    state.savings -= 6;
    state.stress += 3;
    state.parentFace -= 8;
    state.pressure += 5;
    state.childPlan = "delay";
    state.maxTurns = Math.max(state.maxTurns, state.turn + 4);
    record(state, "双方同意先领证、请亲近的人吃饭。现金支出 6，不借婚礼债；家里对排场仍有意见。");
  } else if (id === "marry") {
    if (state.marriedAtTurn === null) state.marriedAtTurn = state.turn;
    if (readyForMarriage(state)) {
      state.stage = "married";
      state.savings -= 26;
      state.weddingDebt += 12;
      state.stress += 7;
      state.parentFace += 25;
      state.familyBond += 8;
      state.childPlan = "delay";
      record(state, "双方把住房、分工和债务谈清后，自主决定登记结婚。");
    } else {
      state.stage = "married";
      state.savings -= 26;
      state.weddingDebt += 12;
      state.stress += 24;
      state.relation -= 13;
      state.mutualIntent -= 12;
      state.parentFace += 30;
      record(state, "准备明显不足，婚礼和登记仍被推进。没谈完的问题一起搬进了新家。");
    }
    state.maxTurns = Math.max(state.maxTurns, state.turn + 4);
  } else if (id === "delay") {
    state.childPlan = "delay";
    state.stress -= 9;
    state.autonomy += 7;
    state.pressure -= 5;
    state.parentFace -= 4;
    state.relation += state.stage === "dating" ? 3 : 0;
    record(state, "子女提出婚育晚点谈：先把工作、住房和彼此意愿稳定下来。");
  } else if (id === "baby") {
    state.childPlan = "ready";
    if (state.parenthoodAtTurn === null) state.parenthoodAtTurn = state.turn;
    if (readyForChild(state)) {
      state.stage = "parenthood";
      state.nextGenStress += 8;
      state.savings -= 32;
      state.stress += 12;
      state.parentFace += 32;
      state.familyBond += 8;
      state.relation += 5;
      record(state, "两个人在预算、照护和意愿都明确后，共同决定进入育儿阶段。");
    } else {
      state.stage = "parenthood";
      state.nextGenStress += 24;
      state.savings -= 28;
      state.weddingDebt += 30;
      state.stress += 28;
      state.career -= 12;
      state.relation -= 15;
      state.parentFace += 34;
      record(state, "照护与现金流没有准备好，生育计划仍被提前启动，代价开始落到日常。");
    }
    state.maxTurns = Math.max(state.maxTurns, state.turn + 3);
  } else if (id === "childfree") {
    state.childPlan = "childfree";
    state.autonomy += 18;
    state.stress -= 5;
    state.parentFace -= 18;
    state.pressure += 8;
    state.familyBond += state.supportiveMoves >= 2 ? 2 : -14;
    state.relation += 5;
    state.maxTurns = Math.max(state.maxTurns, state.turn + 2);
    record(state, "子女明确选择不生育，不再让“以后再说”替代真实立场。");
  } else if (id === "build-home") {
    state.relationshipBalance += state.relation >= 40 && state.mutualIntent >= 40 ? 12 : 3;
    state.understanding += 10;
    state.savings -= 6;
    state.relation += 12;
    state.mutualIntent += 8;
    state.stress -= 6;
    state.familyBond += 3;
    const paid = Math.min(5, state.weddingDebt, Math.max(0, state.savings));
    state.savings -= paid;
    state.weddingDebt -= paid;
    if (state.lifestyle === "lean" && willAgreeBudget(state)) state.budgetAgreed = true;
    record(state, "两个人关掉家庭群，重新把钱、家务、照护和边界一项项谈清，开始真正经营共同生活。");
  } else if (id === "budget") {
    state.lifestyle = "lean";
    state.budgetAgreed = !isHousehold(state) || willAgreeBudget(state);
    state.stress -= 5;
    state.relation += state.budgetAgreed ? 4 : -5;
    state.partnerNote = state.budgetAgreed
      ? "我们同意先过简单一点：旅行改期，非必要消费降到每回合 2。"
      : "这次先削减开支，但伴侣并未认同，仍需要谈清楚对生活的期待。";
    record(state, state.partnerNote);
  } else if (id === "ask-help") {
    const grant = Math.min(14, state.familyReserve);
    state.familyReserve -= grant;
    state.savings += grant;
    state.support += grant;
    state.stress -= 10;
    state.familyBond += 5;
    record(state, `子女说明具体缺口，家里支援 ${grant}。长辈的积蓄也有限，还能支援 ${state.familyReserve}。`);
  } else if (id === "rest") {
    state.stress -= 26;
    state.career -= 4;
    state.savings -= 2;
    record(state, "子女推掉额外任务，休整并寻求支持。工作放慢一点，先让自己睡好、吃好。");
  } else if (id === "separate") {
    state.ending = "runaway";
    record(state, "双方结束婚姻，开始协商住处、共同债务与照护安排。");
    endGame(state);
  } else if (id === "protect-child") {
    state.nextGenStress -= 24;
    state.stress -= 8;
    state.pressure -= 8;
    state.familyBond += 7;
    state.autonomy += 5;
    state.savings -= 4;
    state.career -= 3;
    record(state, "子女停掉层层加码的安排，先接住孩子的情绪，也承担起照护所需的时间。");
  }
  if (id === "marry" || id === "simple-wedding") {
    state.budgetAgreed = state.lifestyle === "lean" && willAgreeBudget(state);
  }
  normalize(state);
  return true;
}

function applyParentAction(state: MarriageGameState, id: ParentActionId) {
  if (!getAvailableParentActions(state).includes(id)) return false;
  const candidate = getCandidate(state.candidateId);
  if (!candidate) return false;
  const pressureScale = DIFFICULTIES[state.difficulty].pressure;
  state.lastParentAction = id;
  if (id === "push-meet") {
    state.pressure += 11 * pressureScale;
    state.stress += 10 * pressureScale;
    state.parentFace += 5;
    if (state.stage === "single") state.stage = "chatting";
    // A parent can arrange a meeting, but cannot create attraction.
    state.coerciveMoves += 1;
    record(state, `家长催着今晚见 ${candidate.name}：“见一面又不会少块肉。”`);
  } else if (id === "compare") {
    state.pressure += 16 * pressureScale;
    state.stress += 17 * pressureScale;
    state.familyBond -= 9;
    state.autonomy -= 5;
    state.parentFace += 12;
    state.coerciveMoves += 1;
    record(state, "家长搬出同龄人进度表：别人孩子都二胎了，你还在挑什么？");
  } else if (id === "encourage") {
    const welcomed = state.mutualIntent >= 50;
    state.pressure += 9 * pressureScale;
    state.stress += (welcomed ? 7 : 16) * pressureScale;
    state.relation += welcomed ? 0 : -4;
    state.mutualIntent += welcomed ? 0 : -7;
    state.parentFace += welcomed ? 8 : 3;
    state.coerciveMoves += 1;
    record(
      state,
      welcomed
        ? `家长要求多主动，${candidate.name} 恰好也愿意继续了解。`
        : `对方意愿已经很低，家长仍要求继续发消息，尴尬变成了压力。`,
    );
  } else if (id === "next") {
    if (!state.rejectedCandidates.includes(candidate.id)) state.rejectedCandidates.push(candidate.id);
    state.candidateId = null;
    state.stage = "single";
    state.relation = 0;
    state.mutualIntent = 0;
    state.pressure += 7 * pressureScale;
    state.stress += 8 * pressureScale;
    state.familyBond -= 4;
    state.coerciveMoves += 1;
    state.selectionKind = "replace";
    record(state, `家长对 ${candidate.name} 的条件不满意，简历被划掉，继续挑下一个。`);
    draftCandidates(state);
  } else if (id === "push-marriage") {
    state.pressure += 18 * pressureScale;
    state.stress += 15 * pressureScale;
    state.parentFace += 14;
    state.coerciveMoves += 1;
    record(state, "家长把恋爱变成倒计时：谈这么久还不结，是不是根本没诚意？");
  } else if (id === "push-baby") {
    state.pressure += 21 * pressureScale;
    state.stress += 18 * pressureScale;
    state.parentFace += 16;
    state.coerciveMoves += 1;
    record(state, "家长把话题推到生育：我们还能帮你带，再晚就来不及了。");
  } else if (id === "push-education") {
    state.nextGenStress += 30 * pressureScale;
    state.pressure += 12 * pressureScale;
    state.stress += 8 * pressureScale;
    state.savings -= 6;
    state.parentFace += 12;
    state.familyBond -= 8;
    state.coerciveMoves += 1;
    record(state, "家长给下一代排满补习和竞赛：大城市竞争激烈，不能输在起跑线上。");
  } else if (id === "support") {
    const grant = Math.min(14, state.familyReserve);
    state.familyReserve -= grant;
    state.savings += grant;
    state.support += grant;
    state.stress -= 10;
    state.pressure -= 6;
    state.familyBond += 8;
    state.parentFace -= 2;
    if (state.stage === "parenthood") state.nextGenStress -= 8;
    state.supportiveMoves += 1;
    record(state, `家长支援 ${grant}，用于住房、婚礼或照护。家里可支援的积蓄还剩 ${state.familyReserve}。`);
  } else if (id === "listen") {
    state.stress -= 14;
    state.pressure -= 17;
    state.familyBond += 11;
    state.autonomy += 4;
    state.parentFace -= 3;
    if (state.stage === "parenthood") state.nextGenStress -= 14;
    state.supportiveMoves += 1;
    record(state, "家长暂时放下任务表，第一次完整听完孩子对工作、风险和未来的担心。");
  }
  normalize(state);
  return true;
}

function chooseParentAiAction(state: MarriageGameState): ParentActionId {
  const careThreshold = state.difficulty === "gentle"
    ? 62
    : state.difficulty === "realistic"
      ? 70
      : 84;
  if (state.savings <= 8 && state.familyReserve > 0) return "support";
  if (state.stress >= careThreshold) return random(state) < 0.62 ? "listen" : "support";
  if (
    state.lastChildAction === "boundary" &&
    state.difficulty !== "holiday" &&
    (state.stress >= 55 || random(state) < 0.45)
  ) return random(state) < 0.68 ? "listen" : "support";
  if (state.lastParentAction === "compare" && state.difficulty !== "holiday") return "listen";
  if (state.stage === "parenthood") {
    if (state.nextGenStress >= 78 && state.difficulty !== "holiday") return random(state) < 0.58 ? "listen" : "support";
    return random(state) < (state.difficulty === "holiday" ? 0.82 : 0.62) ? "push-education" : "support";
  }
  if (state.stage === "married" && state.childPlan === "childfree" && state.difficulty !== "holiday") return random(state) < 0.7 ? "listen" : "support";
  if (state.stage === "married") return state.support < 25 && random(state) < 0.42 ? "support" : "push-baby";
  if (state.stage === "dating") {
    if (state.relation >= 58 && random(state) < 0.68) return "push-marriage";
    return random(state) < 0.3 ? "support" : "encourage";
  }
  if (state.stage === "chatting") {
    if (state.mutualIntent < 32 && random(state) < 0.38) return "next";
    return random(state) < 0.58 ? "encourage" : "compare";
  }
  if (state.turn >= 3 && random(state) < 0.28) return "compare";
  return "push-meet";
}

function chooseChildAiAction(state: MarriageGameState): ChildActionId {
  const candidate = getCandidate(state.candidateId);
  if (!candidate) return "boundary";
  if (state.matchClosed) return "next";
  if (state.stress >= 85) return "rest";
  if (state.savings <= 12 && state.lifestyle !== "lean") return "budget";
  if (state.savings <= 12) return "work";
  if (state.lastParentAction === "push-baby") {
    if (state.childPlan === "childfree") return "boundary";
    if (readyForChild(state)) return "baby";
    return state.supportiveMoves >= 2 && state.relation >= 62
      ? "delay"
      : "childfree";
  }
  if (state.lastParentAction === "push-education" || state.stage === "parenthood") return "protect-child";
  if (state.lastParentAction === "push-marriage") return readyForMarriage(state) ? "marry" : "delay";
  if (state.lastParentAction === "compare") return state.autonomy >= 58 ? "boundary" : "work";
  if (state.lastParentAction === "support" || state.lastParentAction === "listen") {
    if (state.stage === "dating" && readyForMarriage(state)) return "marry";
    if (state.stage === "chatting" || state.stage === "dating") return "meet-aa";
    if (state.stage === "married") return "build-home";
    return "meet";
  }
  if (state.mutualIntent < 28 && state.meetings > 0) return "next";
  if (state.stage === "single") return "meet";
  if (state.stage === "chatting" || state.stage === "dating") return "meet-aa";
  if (state.stage === "married") return state.childPlan === "childfree" ? "build-home" : "delay";
  return "boundary";
}

function applyParentAi(state: MarriageGameState, steps?: ResolutionStep[]) {
  const preferred = chooseParentAiAction(state);
  const action = getAvailableParentActions(state).includes(preferred) ? preferred : "listen";
  const definition = PARENT_ACTIONS.find(item => item.id === action);
  applyResolvedStep(
    state,
    steps,
    "family",
    `家长回应：${definition?.title || "家庭群又发来消息"}`,
    () => applyParentAction(state, action),
  );
  if (state.phase === "candidate") {
    const before = resolutionSnapshot(state);
    const selected = chooseAiCandidate(state);
    if (selected) assignCandidate(state, selected.id);
    state.phase = "turn";
    state.activeActor = "child";
    if (selected) {
      addResolutionStep(
        steps,
        "match",
        `家长换成了 ${selected.name}`,
        state.lastEvent,
        before,
        state,
      );
    }
  }
}

function applyChildAi(state: MarriageGameState, steps?: ResolutionStep[]) {
  const preferred = chooseChildAiAction(state);
  const action = getAvailableChildActions(state).includes(preferred) ? preferred : "boundary";
  const definition = CHILD_ACTIONS.find(item => item.id === action);
  applyResolvedStep(
    state,
    steps,
    "response",
    `当事人回应：${definition?.title || "说出了自己的决定"}`,
    () => applyChildAction(state, action),
  );
  return state.phase === "candidate";
}

function beginRound(state: MarriageGameState, steps?: ResolutionStep[]) {
  if (state.turn > state.maxTurns) {
    endGame(state);
    return;
  }
  state.phase = "turn";
  const beforeEvent = resolutionSnapshot(state);
  applyEconomyEvent(state);
  const event = ECONOMY_EVENTS.find(item => item.id === state.currentEventId);
  addResolutionStep(
    steps,
    "reality",
    `现实事件：${event?.title || "生活突然插手"}`,
    event?.detail || state.lastEvent,
    beforeEvent,
    state,
  );
  if (checkTerminal(state)) return;
  if (state.mode === "child") {
    state.activeActor = "child";
    applyParentAi(state, steps);
    checkTerminal(state);
  } else {
    state.activeActor = "parent";
  }
}

function settleHousehold(state: MarriageGameState, steps?: ResolutionStep[]) {
  const personalBefore = resolutionSnapshot(state);
  const personalNotes: string[] = [];
  if (state.lastChildAction !== "groom" && state.grooming > 40) {
    state.grooming = Math.max(40, state.grooming - 6);
    personalNotes.push("额外的仪容打理状态回落 6，日常整洁仍保留。");
  }
  if (state.fitness >= 60) {
    state.stress -= 2;
    personalNotes.push("规律运动让这一季额外缓解压力 2。");
  }
  if (!state.matchClosed && (state.stage === "dating" || isHousehold(state))) {
    if (state.relationshipBalance < 35) {
      state.stress += 6;
      state.relation -= 6;
      state.mutualIntent -= 4;
      state.datingFeedback = "约会、开销和迁就长期落在一方身上，双方都开始积怨。需要谈清分工，或结束消耗。";
      personalNotes.push(state.datingFeedback);
    } else if (state.relationshipBalance >= 60 && state.mutualIntent >= 40 && isGrowthAction(state.lastChildAction as ChildActionId)) {
      state.relation += 2;
      personalNotes.push("对方尊重你留给自己的时间，也主动调整安排。各自成长并没有妨碍彼此靠近。");
    }
  }
  normalize(state);
  if (personalNotes.length) {
    const personalDetail = personalNotes.join("");
    record(state, personalDetail);
    addResolutionStep(steps, "response", "自己的生活与相处反馈", personalDetail, personalBefore, state);
  }
  const before = resolutionSnapshot(state);
  const budget = getHouseholdBudget(state);
  state.savings += budget.net;
  state.weddingDebt -= budget.repayment;
  const shortfall = Math.max(0, -state.savings);
  state.weddingDebt += shortfall;
  state.savings = Math.max(0, state.savings);
  state.moneyStrainTurns = shortfall > 0 ? state.moneyStrainTurns + 1 : 0;
  let response = "";
  if (isHousehold(state)) {
    if (state.lifestyle === "lean" && !state.budgetAgreed) {
      state.relation -= 6;
      state.mutualIntent -= 4;
      state.stress += 4;
      response = "伴侣：开支降了，但生活期待还没谈拢，分歧在累积。";
    } else if (shortfall > 0 || state.savings <= 8) {
      if (willAgreeBudget(state)) {
        state.relation += 3;
        state.stress -= 4;
        response = "伴侣：先别一个人扛，我们可以一起缩减开支。";
      } else {
        state.relation -= 7;
        state.mutualIntent -= 5;
        state.stress += 5;
        response = "伴侣：钱一直不够，我也不想再这样过。生活期待的落差还没有解决。";
      }
    } else response = "伴侣按约定承担了共同开支。";
    if (state.relationshipBalance < 35) response += " 但长期单方面承担仍未解决；可以谈边界、重新分工，也可以分开。";
    state.partnerNote = response;
  }
  normalize(state);
  const detail = `这一季：工作结余 +${budget.income}，伴侣投入 +${budget.partnerIncome}；基本生活 −${budget.essentials}，弹性消费 −${budget.extras}，偿还债务 −${budget.repayment}。${shortfall > 0 ? `缺口 ${shortfall} 转为待还账单。` : ""}${response}`;
  record(state, detail);
  addResolutionStep(steps, "household", "这一季的生活账本", detail, before, state);
  state.burnoutTurns = state.stress >= 95 ? state.burnoutTurns + 1 : 0;
  state.conflictTurns = isHousehold(state) && state.relation < 35 && state.mutualIntent < 35 ? state.conflictTurns + 1 : 0;
  if (!state.recoveryGranted && (state.moneyStrainTurns > 0 || state.burnoutTurns > 0 || state.conflictTurns > 0)) {
    state.recoveryGranted = true;
    state.maxTurns = Math.max(state.maxTurns, state.turn + 3);
  }
}

function finishRound(state: MarriageGameState, steps?: ResolutionStep[]) {
  if (checkTerminal(state)) return;
  settleHousehold(state, steps);
  if (state.burnoutTurns >= 2 || state.conflictTurns >= 3 || (state.moneyStrainTurns >= 3 && state.weddingDebt >= 45)) {
    endGame(state);
    return;
  }
  if (state.turn >= state.maxTurns) {
    endGame(state);
    return;
  }
  state.turn += 1;
  beginRound(state, steps);
}

function startGame(
  mode: GameMode,
  difficulty: Difficulty,
  inputSeed: number,
) {
  const state = createInitialState();
  state.mode = mode;
  state.difficulty = difficulty;
  state.seed = Number.isSafeInteger(inputSeed) && inputSeed > 0 ? inputSeed : 1;
  state.rng = state.seed;
  state.startAge = 25 + (state.seed % 5);
  state.turn = 1;
  state.log = [state.lastEvent];
  draftCandidates(state);
  if (mode === "child") {
    const selected = chooseAiCandidate(state);
    if (selected) assignCandidate(state, selected.id);
    beginRound(state);
  }
  return state;
}

export function gameReducer(
  previous: MarriageGameState,
  action: MarriageGameAction,
): MarriageGameState {
  return resolveGameAction(previous, action).state;
}

export function resolveGameAction(
  previous: MarriageGameState,
  action: MarriageGameAction,
): GameResolution {
  if (action.type === "start") return { state: startGame(action.mode, action.difficulty, action.seed), steps: [] };
  if (action.type === "restart") return { state: createInitialState(), steps: [] };
  if (previous.phase === "lobby" || previous.phase === "ended") return { state: previous, steps: [] };
  const state = clone(previous);
  const steps: ResolutionStep[] = [];
  if (action.type === "candidate") {
    if (
      state.phase !== "candidate" ||
      state.activeActor !== "parent" ||
      !state.candidateOptions.includes(action.id)
    ) return { state: previous, steps: [] };
    const replacing = state.selectionKind === "replace";
    const candidate = getCandidate(action.id);
    if (!candidate) return { state: previous, steps: [] };
    const beforeCandidate = resolutionSnapshot(state);
    if (!assignCandidate(state, action.id)) return { state: previous, steps: [] };
    addResolutionStep(
      steps,
      "match",
      `确定介绍 ${candidate.name}`,
      state.lastEvent,
      beforeCandidate,
      state,
    );
    state.phase = "turn";
    state.selectionKind = "opening";
    if (!replacing) {
      beginRound(state, steps);
      return { state, steps };
    }
    if (state.mode === "parent") {
      const replacingCandidate = applyChildAi(state, steps);
      if (!state.candidateId || replacingCandidate) return { state, steps };
      finishRound(state, steps);
    } else if (state.mode === "duel") {
      state.activeActor = "child";
    }
    return { state, steps };
  }
  if (action.type === "parent-action") {
    const definition = PARENT_ACTIONS.find(item => item.id === action.id);
    if (
      state.phase !== "turn" ||
      state.activeActor !== "parent" ||
      !applyResolvedStep(
        state,
        steps,
        "choice",
        `我的选择：${definition?.title || "家长出牌"}`,
        () => applyParentAction(state, action.id),
      )
    ) return { state: previous, steps: [] };
    if (checkTerminal(state)) return { state, steps };
    if (!state.candidateId) return { state, steps };
    if (state.mode === "parent") {
      const replacingCandidate = applyChildAi(state, steps);
      if (!state.candidateId || replacingCandidate) return { state, steps };
      finishRound(state, steps);
    } else if (state.mode === "duel") {
      state.activeActor = "child";
    }
    return { state, steps };
  }
  if (action.type === "child-action") {
    const definition = CHILD_ACTIONS.find(item => item.id === action.id);
    if (
      state.phase !== "turn" ||
      state.activeActor !== "child" ||
      !applyResolvedStep(
        state,
        steps,
        "choice",
        `我的选择：${definition?.title || "当事人回应"}`,
        () => applyChildAction(state, action.id, action.topic),
      )
    ) return { state: previous, steps: [] };
    if (!state.candidateId || checkTerminal(state)) return { state, steps };
    finishRound(state, steps);
    return { state, steps };
  }
  return { state: previous, steps: [] };
}

export function getActionPreview(
  state: MarriageGameState,
  actor: "child" | "parent",
  id: ChildActionId | ParentActionId,
  topic?: MeetingTopic,
) {
  const copy = clone(state);
  const before = resolutionSnapshot(copy);
  if (actor === "child") applyChildAction(copy, id as ChildActionId, topic);
  else applyParentAction(copy, id as ParentActionId);
  const meeting = ["meet", "meet-aa", "invest"].includes(id);
  const uncertainResponse = actor === "child" && !isHousehold(state) && (meeting || id.startsWith("chat-"));
  const preview = RESOLUTION_METRICS
    .map(([key, label]) => ({ label, delta: copy[key] - before[key] }))
    .filter(({ label }) => !(id === "next" && ["相互了解", "伴侣感情", "对方意愿"].includes(label)))
    .filter(({ label }) => !(uncertainResponse && ["伴侣感情", "对方意愿"].includes(label)))
    .filter(change => change.delta !== 0)
    .map(({ label, delta }) => `${label}${delta > 0 ? "+" : ""}${delta}`)
    .join(" · ");
  return [preview, uncertainResponse ? "感情与意愿看双方回应" : id === "next" ? "结束本次了解，再认识下一位" : ""].filter(Boolean).join(" · ");
}

export function validateSave(value: unknown): MarriageGameState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  let migrated: Record<string, unknown> = { ...(value as Record<string, unknown>) };
  if (migrated.version === 1) {
    migrated = {
      ...migrated,
      version: 2,
      nextGenStress: 0,
      ending: migrated.ending === "depressed" ? "burnout" : migrated.ending,
    };
  }
  if (migrated.version === 2) {
    const replaceCat = (id: unknown) => (id === "jiajia" ? "nana7mi" : id);
    migrated = {
      ...migrated,
      version: 3,
      startAge: 26,
      marriedAtTurn: null,
      parenthoodAtTurn: null,
      candidateId: replaceCat(migrated.candidateId),
      candidateOptions: Array.isArray(migrated.candidateOptions)
        ? migrated.candidateOptions.map(replaceCat)
        : migrated.candidateOptions,
      rejectedCandidates: Array.isArray(migrated.rejectedCandidates)
        ? migrated.rejectedCandidates.map(replaceCat)
        : migrated.rejectedCandidates,
    };
  }
  if (migrated.version === 3) {
    const defaults = createInitialState();
    migrated = {
      ...migrated,
version: 4,
      familyReserve: Math.max(0, 42 - Math.min(42, Number(migrated.support) || 0)),
      monthsPerTurn: 12,
understanding: 0,
chemistry: 65,
matchClosed: false,
datingFeedback: "沿用旧档的相处进度。",
      lifestyle: defaults.lifestyle,
budgetAgreed: false,
      moneyStrainTurns: 0,
burnoutTurns: 0,
conflictTurns: 0,
recoveryGranted: false,
      partnerNote: "旧档已接入生活预算，接下来可以一起商量。",
    };
  }
  if (migrated.version === 4) migrated = { ...migrated, ...GROWTH_DEFAULTS, version: 5 };
  if (migrated.version === 5) {
    const originalIds: Record<string, CandidateId> = { lin: "xuehui", qiao: "liko", chen: "shiori", zhou: "nana7mi", xu: "izayoi", tang: "sui" };
    const migrateId = (id: unknown) => (typeof id === "string" && Object.prototype.hasOwnProperty.call(originalIds, id) ? originalIds[id] : id);
    const migrateList = (ids: unknown) => (Array.isArray(ids) && ids.some(id => migrateId(id) !== id) ? Array.from(new Set(ids.map(migrateId))) : ids);
    const originalNames = [["林知夏", "雪绘"], ["乔安", "莉蔻"], ["陈雨宁", "栞栞"], ["周可", "七海"], ["许青", "十六萤"], ["唐悦", "岁己"]];
    const migrateText = (text: unknown) => (typeof text === "string" ? originalNames.reduce((line, [before, after]) => line.replaceAll(before, after), text) : text);
    migrated = {
      ...migrated,
      candidateId: migrateId(migrated.candidateId),
      candidateOptions: migrateList(migrated.candidateOptions),
      rejectedCandidates: migrateList(migrated.rejectedCandidates),
      lastEvent: migrateText(migrated.lastEvent),
      datingFeedback: migrateText(migrated.datingFeedback),
      partnerNote: migrateText(migrated.partnerNote),
      log: Array.isArray(migrated.log) ? migrated.log.map(migrateText) : migrated.log,
    };
  }
  const state = migrated as unknown as MarriageGameState;
  const templateKeys = Object.keys(createInitialState()).sort();
  if (Object.keys(state).sort().join("|") !== templateKeys.join("|")) return null;
  if (state.version !== 5) return null;
  if ([state.fitness, state.grooming, state.interests, state.relationshipBalance].some(n => !Number.isInteger(n) || n < 0 || n > 100) || typeof state.growthNote !== "string") return null;
  if (state.phase !== "ended" && state.maxTurns === 10) state.maxTurns = 14;
  if (!(["lobby", "candidate", "turn", "ended"] as string[]).includes(state.phase)) return null;
  if (!(["child", "parent", "duel"] as string[]).includes(state.mode)) return null;
  if (!Object.prototype.hasOwnProperty.call(DIFFICULTIES, state.difficulty)) return null;
  if (!(["child", "parent"] as string[]).includes(state.activeActor)) return null;
  if (!(["opening", "replace"] as string[]).includes(state.selectionKind)) return null;
  if (!Object.prototype.hasOwnProperty.call(STAGE_VALUE, state.stage)) return null;
  if (!state.scores || typeof state.scores !== "object") return null;
  if (![3, 12].includes(state.monthsPerTurn) || typeof state.matchClosed !== "boolean" || typeof state.datingFeedback !== "string" || !Number.isFinite(state.understanding) || state.understanding < 0 || state.understanding > 100 || !Number.isFinite(state.chemistry) || state.chemistry < 0 || state.chemistry > 100) return null;
  if (!["usual", "lean"].includes(state.lifestyle) || typeof state.budgetAgreed !== "boolean" || typeof state.recoveryGranted !== "boolean" || typeof state.partnerNote !== "string") return null;
  if (!["unknown", "delay", "childfree", "ready"].includes(state.childPlan)) return null;
  if ([state.moneyStrainTurns, state.burnoutTurns, state.conflictTurns].some(n => !Number.isInteger(n) || n < 0 || n > 100)) return null;
  if (!Number.isFinite(state.familyReserve) || state.familyReserve < 0 || state.familyReserve > 42) return null;
  const numeric = [
    state.seed,
    state.rng,
    state.turn,
    state.maxTurns,
    state.startAge,
    state.stress,
    state.autonomy,
    state.familyBond,
    state.savings,
    state.career,
    state.relation,
    state.mutualIntent,
    state.pressure,
    state.parentFace,
    state.support,
    state.weddingDebt,
    state.nextGenStress,
    state.meetings,
    state.boundaries,
    state.coerciveMoves,
    state.supportiveMoves,
    state.scores.child,
    state.scores.parent,
    state.scores.family,
  ];
  if (numeric.some(number => !Number.isFinite(number))) return null;
  if (!Number.isSafeInteger(state.seed) || state.seed < 1 || !Number.isInteger(state.turn) || state.turn < 0 || !Number.isInteger(state.maxTurns) || state.maxTurns < 1 || state.maxTurns > 100 || state.turn > state.maxTurns) return null;
  if (!Number.isInteger(state.startAge) || state.startAge < 18 || state.startAge > 60) return null;
  if (
    [state.marriedAtTurn, state.parenthoodAtTurn].some(
      turn => turn !== null && (!Number.isInteger(turn) || turn < 1),
    )
  ) return null;
  const candidateIds = new Set(CANDIDATES.map(candidate => candidate.id));
  if (state.candidateId !== null && !candidateIds.has(state.candidateId)) return null;
  if (
    !Array.isArray(state.candidateOptions) ||
    state.candidateOptions.some(id => !candidateIds.has(id)) ||
    new Set(state.candidateOptions).size !== state.candidateOptions.length
  ) return null;
  if (
    !Array.isArray(state.rejectedCandidates) ||
    state.rejectedCandidates.some(id => !candidateIds.has(id))
  ) return null;
  if (!Array.isArray(state.log) || state.log.some(line => typeof line !== "string")) return null;
  if (
    state.ending !== null &&
    !Object.prototype.hasOwnProperty.call(ENDINGS, state.ending)
  ) return null;
  if (
    state.currentEventId !== null &&
    !ECONOMY_EVENTS.some(event => event.id === state.currentEventId)
  ) return null;
  if (
    state.lastParentAction !== null &&
    !PARENT_ACTIONS.some(item => item.id === state.lastParentAction)
  ) return null;
  if (
    state.lastChildAction !== null &&
    !CHILD_ACTIONS.some(item => item.id === state.lastChildAction)
  ) return null;
  return clone(state);
}
