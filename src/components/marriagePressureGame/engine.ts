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
  happy: {
    id: "happy",
    title: "真的幸福终老",
    kicker: "婚礼早就散场了，两个人仍然站在一起",
    description: "多年以后，催婚饭桌只剩一段旧事。两个人没有靠忍耐维持体面，而是把钱、照护、边界和每一次选择都认真过成了共同生活。",
    color: "#4f8a66",
  },
  depressed: {
    id: "depressed",
    title: "下一代玉玉了",
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
    title: "被爆金币",
    kicker: "所有承诺最后都落到年轻人的账单",
    description: "婚礼、住房和照护成本层层叠加，口头支持没有兑现。家庭进度向前，现金流却彻底断裂。",
    color: "#9b643f",
  },
  ruin: {
    id: "ruin",
    title: "家破人亡",
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
    title: "彩礼卷走，人也走了",
    kicker: "催出来的婚礼，留不住没有共识的伴侣",
    description: "关系和意愿本来就没站稳，彩礼、婚礼与债务却先一步落地。一次争吵后，对方带走能带走的东西离开，只剩两家人在群里互相追账。",
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
  state: Pick<MarriageGameState, "startAge" | "turn">,
  turn = state.turn,
) {
  return state.startAge + Math.max(0, turn - 1);
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
  ["stress", "压力"],
  ["autonomy", "自主"],
  ["familyBond", "亲情"],
  ["savings", "存款"],
  ["career", "事业"],
  ["relation", "关系"],
  ["mutualIntent", "对方意愿"],
  ["pressure", "家庭催促"],
  ["parentFace", "家长面子"],
  ["support", "实际支持"],
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
  if (state.familyBond <= 5 || (state.stress >= 100 && state.familyBond <= 28)) return ENDINGS.ruin;
  if (state.nextGenStress >= 100) return ENDINGS.depressed;
  if (state.stress >= 100) return ENDINGS.burnout;
  if (
    state.savings <= 0 &&
    (state.weddingDebt >= 28 || state.stage === "parenthood")
  ) return ENDINGS.exploited;
  if (
    state.stage === "parenthood" &&
    state.relation >= 68 &&
    state.mutualIntent >= 62 &&
    state.stress <= 52 &&
    state.savings >= 28 &&
    state.familyBond >= 45 &&
    state.nextGenStress <= 45
  ) return ENDINGS.happy;
  if (
    state.stage === "married" &&
    state.childPlan === "childfree" &&
    state.relation >= 70 &&
    state.mutualIntent >= 62 &&
    state.stress <= 65 &&
    state.savings >= 28 &&
    state.familyBond >= 42 &&
    state.weddingDebt <= 28
  ) return ENDINGS.happy;
  if (
    state.stage === "married" &&
    (state.relation < 45 || state.mutualIntent < 38) &&
    (state.coerciveMoves >= 3 || state.weddingDebt >= 32)
  ) return ENDINGS.runaway;
  if (
    state.stage === "married" &&
    (state.relation < 58 || state.stress > 68 || state.weddingDebt > 38)
  ) return ENDINGS.hollow;
  if (state.stage === "dating" && state.relation >= 58 && state.mutualIntent >= 50) return ENDINGS.love;
  if (state.autonomy >= 72 && state.stress <= 68 && state.stage !== "married") return ENDINGS.independent;
  if (state.familyBond >= 62 && state.pressure <= 42) return ENDINGS.ceasefire;
  return ENDINGS.stalemate;
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
  if (
    state.stress >= 100 ||
    state.nextGenStress >= 100 ||
    state.familyBond <= 5 ||
    (state.savings <= 0 &&
      (state.weddingDebt >= 28 || state.stage === "parenthood"))
  ) {
    endGame(state);
    return true;
  }
  return false;
}

export function createInitialState(): MarriageGameState {
  return {
    version: 3,
    phase: "lobby",
    mode: "child",
    difficulty: "realistic",
    seed: 1,
    rng: 1,
    turn: 0,
    maxTurns: 14,
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
  if (available.length < 3) {
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
  state.candidateOptions = [];
  state.stage = "single";
  state.relation = 4;
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

function readyForMarriage(state: MarriageGameState) {
  return (
    state.stage === "dating" &&
    state.relation >= 58 &&
    state.mutualIntent >= 52 &&
    state.savings + state.support >= 55 &&
    state.stress < 76
  );
}

function readyForChild(state: MarriageGameState) {
  return (
    state.stage === "married" &&
    state.childPlan !== "childfree" &&
    state.relation >= 66 &&
    state.mutualIntent >= 60 &&
    state.savings + state.support >= 72 &&
    state.stress < 66
  );
}

export function getAvailableChildActions(
  state: MarriageGameState,
): ChildActionId[] {
  if (state.phase !== "turn" || !state.candidateId) return [];
  if (state.stage === "parenthood") return ["protect-child", "build-home", "boundary", "work"];
  if (state.stage === "married") {
    const actions: ChildActionId[] = ["build-home", "boundary", "work"];
    if (state.childPlan !== "childfree") actions.push("delay", "baby", "childfree");
    return actions;
  }
  const actions: ChildActionId[] = ["meet", "next", "boundary", "work", "delay"];
  if (state.stage === "chatting" || state.stage === "dating") actions.splice(1, 0, "invest");
  if (state.stage === "dating") actions.push("marry");
  return actions;
}

export function getAvailableParentActions(
  state: MarriageGameState,
): ParentActionId[] {
  if (state.phase !== "turn" || !state.candidateId) return [];
  if (state.stage === "parenthood") return ["push-education", "compare", "support", "listen"];
  if (state.stage === "married") return ["push-baby", "compare", "support", "listen"];
  const actions: ParentActionId[] = [
    "push-meet",
    "compare",
    "next",
    "support",
    "listen",
  ];
  if (state.stage === "chatting" || state.stage === "dating") actions.splice(2, 0, "encourage");
  if (state.stage === "dating") actions.push("push-marriage");
  return actions;
}

function applyChildAction(state: MarriageGameState, id: ChildActionId) {
  if (!getAvailableChildActions(state).includes(id)) return false;
  const candidate = getCandidate(state.candidateId);
  if (!candidate) return false;
  state.lastChildAction = id;
  const { compatibility } = candidate;
  if (id === "meet") {
    state.meetings += 1;
    state.savings -= candidate.cityCost;
    state.stress += 3 + state.pressure * 0.08;
    state.relation += 8 + compatibility * 0.11;
    state.mutualIntent += 5 + candidate.initialIntent * 0.09;
    if (state.stage === "single") state.stage = "chatting";
    if (state.relation >= 42 && state.mutualIntent >= 42) state.stage = "dating";
    record(state, `子女去见了 ${candidate.name}。真人相处终于取代了家庭群里的简历。`);
  } else if (id === "invest") {
    const welcomed = state.mutualIntent >= 42;
    state.savings -= candidate.cityCost + 2;
    state.relation += welcomed ? 12 + compatibility * 0.08 : 4;
    state.mutualIntent += welcomed ? 9 : -5;
    state.stress += welcomed ? 2 : 13;
    if (state.relation >= 42 && state.mutualIntent >= 42) state.stage = "dating";
    record(
      state,
      welcomed
        ? `双方认真安排了一次约会，${candidate.name} 也给出了明确回应。`
        : `子女继续主动，但 ${candidate.name} 的回应依旧冷淡。`,
    );
  } else if (id === "next") {
    state.rejectedCandidates.push(candidate.id);
    state.autonomy += 10;
    state.stress -= 10;
    state.familyBond -= 7 + state.pressure * 0.04;
    state.pressure += 5;
    state.candidateId = null;
    state.stage = "single";
    state.relation = 0;
    state.mutualIntent = 0;
    record(state, `子女拒绝继续消耗：${candidate.name} 不合适，换下一个。`);
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
  } else if (id === "marry") {
    if (state.marriedAtTurn === null) state.marriedAtTurn = state.turn;
    if (readyForMarriage(state)) {
      state.stage = "married";
      state.savings -= Math.max(8, 26 - state.support * 0.25);
      state.weddingDebt += Math.max(0, 24 - state.support * 0.35);
      state.stress += 7;
      state.parentFace += 25;
      state.familyBond += 8;
      state.childPlan = "delay";
      record(state, "双方把住房、分工和债务谈清后，自主决定登记结婚。");
    } else {
      state.stage = "married";
      state.savings -= 28;
      state.weddingDebt += 42;
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
      state.savings -= Math.max(12, 32 - state.support * 0.28);
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
    state.savings -= 6;
    state.relation += 12;
    state.mutualIntent += 8;
    state.stress -= 6;
    state.familyBond += 3;
    state.weddingDebt -= 5;
    record(state, "两个人关掉家庭群，重新把钱、家务、照护和边界一项项谈清，开始真正经营共同生活。");
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
    state.relation += state.mutualIntent >= 48 ? 7 : 2;
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
    state.relation += welcomed ? 9 : -4;
    state.mutualIntent += welcomed ? 4 : -7;
    state.parentFace += welcomed ? 8 : 3;
    state.coerciveMoves += 1;
    record(
      state,
      welcomed
        ? `家长要求多主动，${candidate.name} 恰好也愿意继续了解。`
        : `对方意愿已经很低，家长仍要求继续发消息，尴尬变成了压力。`,
    );
  } else if (id === "next") {
    state.rejectedCandidates.push(candidate.id);
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
    state.savings += 14;
    state.support += 18;
    state.stress -= 10;
    state.pressure -= 6;
    state.familyBond += 8;
    state.parentFace -= 2;
    if (state.stage === "parenthood") state.nextGenStress -= 8;
    state.supportiveMoves += 1;
    record(state, "家长拿出真实预算，愿意承担住房、婚礼或照护的一部分。");
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
  if (state.stress >= 86) return state.relation < 34 ? "next" : "boundary";
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
    if (state.stage === "chatting" || state.stage === "dating") return "invest";
    if (state.stage === "married") return "build-home";
    return "meet";
  }
  if (state.mutualIntent < 28 && state.meetings > 0) return "next";
  if (state.stage === "single") return "meet";
  if (state.stage === "chatting" || state.stage === "dating") return candidate.compatibility >= 70 ? "invest" : "boundary";
  if (state.stage === "married") return state.childPlan === "childfree" ? "build-home" : "delay";
  return "boundary";
}

function applyParentAi(state: MarriageGameState, steps?: ResolutionStep[]) {
  const action = chooseParentAiAction(state);
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
  const action = chooseChildAiAction(state);
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

function finishRound(state: MarriageGameState, steps?: ResolutionStep[]) {
  if (checkTerminal(state)) return;
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
        () => applyChildAction(state, action.id),
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
) {
  const copy = clone(state);
  const before = {
    stress: copy.stress,
    autonomy: copy.autonomy,
    familyBond: copy.familyBond,
    savings: copy.savings,
    relation: copy.relation,
    pressure: copy.pressure,
    nextGenStress: copy.nextGenStress,
  };
  if (actor === "child") applyChildAction(copy, id as ChildActionId);
  else applyParentAction(copy, id as ParentActionId);
  const changes = [
    ["压力", copy.stress - before.stress],
    ["自主", copy.autonomy - before.autonomy],
    ["亲情", copy.familyBond - before.familyBond],
    ["存款", copy.savings - before.savings],
    ["关系", copy.relation - before.relation],
    ["催促", copy.pressure - before.pressure],
    ["下一代压力", copy.nextGenStress - before.nextGenStress],
  ] as const;
  return changes
    .filter(([, value]) => value !== 0)
    .map(([label, value]) => `${label}${value > 0 ? "+" : ""}${value}`)
    .join(" · ");
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
  const state = migrated as unknown as MarriageGameState;
  const templateKeys = Object.keys(createInitialState()).sort();
  if (Object.keys(state).sort().join("|") !== templateKeys.join("|")) return null;
  if (state.version !== 3) return null;
  if (state.phase !== "ended" && state.maxTurns === 10) state.maxTurns = 14;
  if (!(["lobby", "candidate", "turn", "ended"] as string[]).includes(state.phase)) return null;
  if (!(["child", "parent", "duel"] as string[]).includes(state.mode)) return null;
  if (!Object.prototype.hasOwnProperty.call(DIFFICULTIES, state.difficulty)) return null;
  if (!(["child", "parent"] as string[]).includes(state.activeActor)) return null;
  if (!(["opening", "replace"] as string[]).includes(state.selectionKind)) return null;
  if (!Object.prototype.hasOwnProperty.call(STAGE_VALUE, state.stage)) return null;
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
