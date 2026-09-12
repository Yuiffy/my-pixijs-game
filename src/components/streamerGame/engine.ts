import { TOPICS, PERKS } from "./content";
import type {
  ActionId,
  FanKind,
  GameAction,
  ReplyStyle,
  StreamState,
} from "./types";

const FAN_KINDS: FanKind[] = ["support", "rational", "chaos", "casual"];
const ACTION_IDS: ActionId[] = ["sing", "game", "movie", "moderate"];
const ACTIVE_PHASES = ["topic", "reply", "continue"];
const ENDINGS = {
  collapse: {
    id: "collapse",
    title: "切片比直播更精彩",
    description:
      "争议失控，直播间暂时关闭。你留下的不是名场面，而是一场需要解释的风波。",
  },
  burnout: {
    id: "burnout",
    title: "主播先下播了",
    description:
      "你接住了太多话，却没给自己留力气。下一次，行动卡也可以用来照顾自己。",
  },
  "empty-room": {
    id: "empty-room",
    title: "大家去倒水了",
    description: "争议过去了，观众也走得差不多了。没有弹幕的安静，不等于平稳。",
  },
  "echo-chamber": {
    id: "echo-chamber",
    title: "全肯定王国",
    description:
      "留下的多数都是说「支持」的人。你掌握了直播间的节奏，也越来越难听见不同意见。",
  },
  tightrope: {
    id: "tightrope",
    title: "风口上的顶流",
    description:
      "热度拉满，险险落地。大家记住了你的直播，也记住了那些随时能被翻出来的发言。",
  },
  community: {
    id: "community",
    title: "有分歧，也有下次",
    description:
      "观众各有想法，仍愿意留下。你让一场充满分歧的直播，变成了大家还想再来的地方。",
  },
  steady: {
    id: "steady",
    title: "今晚平稳下播",
    description:
      "聊过、转过场，也接住了几次尴尬。没有完美的回应，但这是一场有始有终的直播。",
  },
};

const clamp = (value: number, max = 100) => Math.min(max, Math.max(0, Math.round(value)));
const hasPerk = (state: StreamState, id: string) => state.perks.includes(id);
const decisionTime = (state: StreamState) => (hasPerk(state, "slow-chat") ? 60000 : 45000);
const getTopic = (state: StreamState) => TOPICS.find((topic) => topic.id === state.activeTopic);
const echoPressure = (state: StreamState) => (state.control >= 65 && state.fans.rational < 100 ? 4 : 0);
const beatRisk = (state: StreamState, risk: number) => Math.max(0, risk - (hasPerk(state, "fact-check") ? 3 : 0)) + echoPressure(state);

export function getNextBeatRisk(state: StreamState): number {
  const next = getTopic(state)?.beats[state.beat + 1];
  return next ? beatRisk(state, next.risk) : 0;
}

export const getViewers = (state: StreamState) => FAN_KINDS.reduce((total, kind) => total + state.fans[kind], 0);
export function getSupportRate(state: StreamState): number {
  const probability = (value: number) => Math.min(1, Math.max(0, value));
  const weights: Record<FanKind, number> = {
    support: probability(0.92 + state.control * 0.0005 - state.risk * 0.001),
    rational: probability(0.2 + state.trust * 0.008 - state.risk * 0.006),
    chaos: probability(0.12 + state.heat * 0.003),
    casual: probability(0.25 + state.trust * 0.005 - state.risk * 0.004),
  };
  const approving = FAN_KINDS.reduce((total, kind) => total + state.fans[kind] * weights[kind], 0);
  return Math.round((approving / Math.max(1, getViewers(state))) * 100);
}

export function createInitialState(): StreamState {
  return {
    version: 1,
    phase: "lobby",
    seed: 1,
    rng: 1,
    act: 1,
    completedTopics: 0,
    topicOptions: [],
    usedTopics: [],
    activeTopic: null,
    beat: 0,
    fans: { support: 220, rational: 180, chaos: 80, casual: 320 },
    heat: 28,
    trust: 65,
    risk: 12,
    energy: 90,
    control: 22,
    peakViewers: 800,
    actions: { sing: 1, game: 1, movie: 1, moderate: 2 },
    perks: [],
    rewardOptions: [],
    remainingMs: 45000,
    timed: true,
    silenceCount: 0,
    resolvedBeats: 0,
    confrontations: 0,
    ignoredConcerns: 0,
    interruptions: 0,
    moderatedBeat: null,
    lastReply: "",
    lastEvent: "",
    log: [],
    ending: null,
    score: 0,
  };
}

function clone(state: StreamState): StreamState {
  return {
    ...state,
    fans: { ...state.fans },
    actions: { ...state.actions },
    perks: [...state.perks],
    topicOptions: [...state.topicOptions],
    usedTopics: [...state.usedTopics],
    rewardOptions: [...state.rewardOptions],
    log: [...state.log],
  };
}

function random(state: StreamState): number {
  state.rng = (state.rng * 1664525 + 1013904223) % 4294967296;
  return state.rng / 4294967296;
}

function sample(state: StreamState, ids: string[], count: number): string[] {
  const pool = [...ids];
  const result: string[] = [];
  while (result.length < count && pool.length) {
    result.push(pool.splice(Math.floor(random(state) * pool.length), 1)[0]);
  }
  return result;
}

function record(state: StreamState, text: string) {
  state.lastEvent = text;
  state.log = [...state.log, text].slice(-32);
}

function normalize(state: StreamState) {
  for (const key of ["heat", "trust", "risk", "energy", "control"] as const) state[key] = clamp(state[key]);
  for (const kind of FAN_KINDS) state.fans[kind] = clamp(state.fans[kind], 10000000);
  state.peakViewers = Math.max(state.peakViewers, getViewers(state));
}

export function getEnding(state: StreamState): {
  id: string;
  title: string;
  description: string;
} {
  if (state.ending && Object.prototype.hasOwnProperty.call(ENDINGS, state.ending)) return ENDINGS[state.ending as keyof typeof ENDINGS];
  if (state.risk >= 100) return ENDINGS.collapse;
  if (state.energy <= 0) return ENDINGS.burnout;
  if (getViewers(state) < 200) return ENDINGS["empty-room"];
  if (state.fans.support / Math.max(1, getViewers(state)) >= 0.6 && state.control >= 65) return ENDINGS["echo-chamber"];
  if (
    state.trust >= 75 &&
    state.risk <= 35 &&
    state.fans.rational / getViewers(state) >= 0.15
  ) return ENDINGS.community;
  if (state.heat >= 75 && getViewers(state) >= 1100) return ENDINGS.tightrope;
  return ENDINGS.steady;
}

function endRun(state: StreamState) {
  state.ending = getEnding(state).id;
  state.phase = "ended";
  state.topicOptions = [];
  state.rewardOptions = [];
  state.remainingMs = Math.min(
    decisionTime(state),
    Math.max(0, state.remainingMs),
  );
  state.score = Math.max(
    0,
    Math.round(
      (state.completedTopics >= 6 ? 300 : 0) +
        state.resolvedBeats * 45 +
        getViewers(state) * 0.4 +
        state.trust * 7 +
        state.control * 3 +
        state.heat * 4 +
        state.energy * 3 -
        state.risk * 8 -
        state.interruptions * 30 -
        state.silenceCount * 40,
    ),
  );
  record(state, `下播结算：${getEnding(state).title} · ${state.score} 分`);
}

function checkFailure(state: StreamState): boolean {
  normalize(state);
  if (state.risk >= 100 || state.energy <= 0 || getViewers(state) < 200) {
    endRun(state);
    return true;
  }
  return false;
}

function draftTopics(state: StreamState) {
  const available = TOPICS.filter(
    (topic) => !state.usedTopics.includes(topic.id),
  ).map((topic) => topic.id);
  const intro = state.completedTopics === 0 && available.includes("laptop");
  state.topicOptions = intro
    ? [
        "laptop",
        ...sample(
          state,
          available.filter((id) => id !== "laptop"),
          2,
        ),
      ]
    : sample(state, available, 3);
  state.phase = "topic";
  state.remainingMs = decisionTime(state);
}

function applyPerk(state: StreamState, id: string) {
  state.perks.push(id);
  if (id === "encore") state.actions.sing += 1;
  state.remainingMs = decisionTime(state);
}

function finishTopic(state: StreamState, interrupted: boolean) {
  state.completedTopics += 1;
  state.activeTopic = null;
  state.beat = 0;
  state.moderatedBeat = null;
  if (!interrupted) {
    state.energy += 7;
    state.risk -= 3;
    state.trust += 1;
    state.heat -= 12;
    const total = getViewers(state);
    if (
      hasPerk(state, "open-mic") &&
      FAN_KINDS.every((kind) => state.fans[kind] / total >= 0.1)
    ) {
      for (const kind of FAN_KINDS) state.fans[kind] += 15;
      record(state, "开放麦生效：四种声音都被留住，各有 15 位新观众加入。");
    }
  }
  if (checkFailure(state)) return;
  if (state.completedTopics >= 6) {
    endRun(state);
  } else if (state.completedTopics % 2 === 0) {
    state.phase = "reward";
    state.rewardOptions = sample(
      state,
      PERKS.filter((perk) => !hasPerk(state, perk.id)).map((perk) => perk.id),
      3,
    );
    state.remainingMs = decisionTime(state);
    record(state, `第 ${state.act} 场结束。挑一个能力，休息后继续。`);
  } else {
    draftTopics(state);
  }
}

function revealBeat(state: StreamState) {
  const beat = getTopic(state)?.beats[state.beat];
  if (!beat) return;
  state.phase = "reply";
  state.moderatedBeat = null;
  state.remainingMs = decisionTime(state);
  const echo = echoPressure(state);
  state.risk += beatRisk(state, beat.risk);
  state.heat += beat.heat + (hasPerk(state, "spotlight") ? 3 : 0);
  const arrivals =
    9 + Math.floor(state.heat / 7) + Math.floor(random(state) * 8);
  state.fans.casual += arrivals;
  state.fans.support += Math.round(
    arrivals * (state.control >= 50 ? 0.7 : 0.3),
  );
  state.fans.chaos += Math.round(arrivals * (state.risk >= 40 ? 0.7 : 0.15));
  record(
    state,
    `${getTopic(state)?.title} · ${beat.label}${echo ? "：异议退场，同温层让新争议更难消化。" : ""}`,
  );
  checkFailure(state);
}

interface ReplyEffect {
  risk: number;
  trust: number;
  energy: number;
  control: number;
  heat: number;
  fans: Partial<Record<FanKind, number>>;
  quote: string;
  event: string;
  ignores?: boolean;
}

function replyEffect(
  state: StreamState,
  kind: FanKind,
  style: ReplyStyle,
): ReplyEffect {
  const effect: ReplyEffect = {
    risk: 0,
    trust: 0,
    energy: 0,
    control: 0,
    heat: 0,
    fans: {},
    quote: "",
    event: "",
  };
  if (style === "agree") {
    if (kind === "support") Object.assign(effect, {
        risk:
          state.ignoredConcerns >= 3
            ? 3 + Math.floor(state.ignoredConcerns / 4)
            : -3,
        trust: -2 - Math.floor(state.ignoredConcerns / 5),
        energy: -2,
        control: 6,
        heat: 2,
        fans: { support: 48, rational: -18, casual: -5 },
        ignores: true,
        quote: "你懂我！这个弹幕说到我心里了。",
        event:
          state.ignoredConcerns >= 3
            ? "又只回应支持声，未被回答的疑虑开始发酵。"
            : "支持者被看见了。一些有疑虑的人默默离开。",
      });
    if (kind === "rational") Object.assign(effect, {
        risk: state.control <= 10 ? -3 : -7,
        trust: state.control <= 10 ? 1 : 4,
        energy: -3,
        control: -4,
        heat: -7,
        fans: {
          support: state.control <= 10 ? -15 : -8,
          rational: 35,
          casual: state.control <= 10 ? -5 : 15,
        },
        quote: "嗯，你说的这点有道理，我先记下来。",
        event:
          state.control <= 10
            ? "连续让步失去节奏。「你说得对」变成空话，疑虑只缓解了一点。"
            : "承认合理意见，争议降温；一部分全肯定粉觉得你被带着走了。",
      });
    if (kind === "chaos") Object.assign(effect, {
        risk: 7,
        trust: -7,
        energy: -3,
        control: 4,
        heat: 7,
        fans: { support: 12, rational: -20, chaos: 30 },
        quote: "好好好，你这个说法也太有节目效果了。",
        event: "顺着拱火的弹幕玩梗，热闹起来了，边界也模糊了。",
      });
    if (kind === "casual") {
      const routine = state.fans.casual / Math.max(1, getViewers(state)) >= 0.55;
      Object.assign(effect, {
        risk: -5,
        trust: routine ? 0 : 1,
        energy: -3,
        control: 0,
        heat: routine ? -9 : -7,
        fans: { support: routine ? 0 : 3, casual: routine ? 3 : 12 },
        quote: "看见啦，大家轻松聊，先不用急着站队。",
        event: routine ? "轻松话听得多了，路人放松下来，也逐渐失去好奇。热度和新增关注的收益降低。" : "接住路人的轻松话，争议缓下来；没有展开的新内容，带来的关注也有限。",
      });
    }
  } else if (style === "explain") {
    if (kind === "rational") Object.assign(effect, {
        risk: -12,
        trust: 7,
        energy: -9,
        control: 1,
        heat: -4,
        fans: { support: -4, rational: 38, casual: 20 },
        quote: "这个担心我听到了。我把考虑过和没考虑过的都讲清楚。",
        event: "认真回应具体疑虑，恢复信任，但长篇解释很消耗精力。",
      });
    if (kind === "support") Object.assign(effect, {
        risk: -7,
        trust: 3,
        energy: -7,
        control: 1,
        heat: 0,
        fans: { support: 15, casual: 12 },
        quote: "谢谢你支持，不过我也想把不确定的地方说清楚。",
        event: "给支持补上理由，场面稳定，没被点到的疑虑仍在。",
      });
    if (kind === "chaos") Object.assign(effect, {
        risk: -2,
        trust: -1,
        energy: -10,
        control: -2,
        heat: 3,
        fans: { chaos: 18, rational: 5 },
        quote: "不是你说的那样，我从头跟你解释一下……",
        event: "花了很多力气自证，拱火弹幕获得了舞台。",
      });
    if (kind === "casual") Object.assign(effect, {
        risk: -8,
        trust: 4,
        energy: -7,
        control: 2,
        heat: -1,
        fans: { casual: 36, rational: 12 },
        quote: "刚来的朋友我补一下前情，事情是这样的。",
        event: "补充前情让路人跟上直播，也给情绪留了缓冲。",
      });
    if (hasPerk(state, "empathetic")) {
      effect.trust += 2;
      effect.risk -= 2;
    }
  } else {
    effect.energy = hasPerk(state, "thick-skin") ? -5 : -7;
    if (kind === "chaos") {
      const grounded = state.trust >= 55 && state.control < 80;
      Object.assign(effect, {
        risk: grounded ? -10 : 5,
        trust: grounded ? 3 : -4,
        control: 4,
        heat: grounded ? 12 : 16,
        fans: {
          support: 35,
          rational: grounded ? 8 : -10,
          chaos: -25,
          casual: -4,
        },
        quote: "梗我看到了，不过这段让我先说完。等会儿再接着玩。",
        event: grounded
          ? "有信任做底气，划清边界成功，观众替你撑腰。"
          : "缺少信任基础，这次划边界被理解成了破防。",
      });
    }
    if (kind === "rational") Object.assign(effect, {
        risk: 16 + state.act,
        trust: -12,
        control: 7,
        heat: 15,
        fans: { support: 48, rational: -45, casual: -24, chaos: 22 },
        quote: "我只是分享想法，怎么就一定要按你说的来？",
        event: "合理质疑被当成了攻击。铁粉叫好，其他人开始截取片段。",
      });
    if (kind === "support") Object.assign(effect, {
        risk: 9,
        trust: -10,
        control: -8,
        heat: 9,
        fans: { support: -48, chaos: 24, casual: -10 },
        quote: "你这个支持听着怎么这么怪？先别替我说话。",
        event: "误伤了给你撑腰的人，支持者也感到无所适从。",
      });
    if (kind === "casual") Object.assign(effect, {
        risk: 12,
        trust: -7,
        control: 2,
        heat: 10,
        fans: { support: 15, casual: -44, chaos: 20 },
        quote: "刚来不了解前情，就先不要下结论了吧。",
        event: "路人被顶了回去。老粉可能护航，新观众却不想留下。",
      });
  }
  return effect;
}

export function getReplyPreview(
  state: StreamState,
  index: number,
  style: ReplyStyle,
): string {
  const comment = getTopic(state)?.beats[state.beat]?.comments[index];
  if (!comment || !["agree", "explain", "confront"].includes(style)) return "先选择一条弹幕";
  const effect = replyEffect(state, comment.kind, style);
  const signed = (value: number) => `${value >= 0 ? "+" : ""}${value}`;
  const fanChange = Object.values(effect.fans).reduce((total, amount) => total + (amount || 0), 0);
  return `热度${signed(effect.heat)} · 观众${signed(fanChange)} · 风险${signed(effect.risk)} · 信任${signed(effect.trust)} · 精力${signed(effect.energy)} · 脑控${signed(effect.control)}`;
}

function interrupt(state: StreamState, id: ActionId) {
  if (state.actions[id] <= 0) return;
  if (id === "moderate") {
    const key = `${state.activeTopic}:${state.beat}`;
    if (state.phase !== "reply" || state.moderatedBeat === key) return;
    state.actions.moderate -= 1;
    state.moderatedBeat = key;
    state.risk -= 10;
    state.heat -= 4;
    state.energy -= 3;
    state.fans.chaos -= 18;
    record(
      state,
      "房管缓解刷屏节奏：风险 −10、热度 −4、精力 −3。这个话题仍要由你回应。",
    );
    checkFailure(state);
    return;
  }
  state.actions[id] -= 1;
  state.interruptions += 1;
  const unanswered = state.phase === "reply";
  const concerns = unanswered ? 5 : 2;
  state.trust -= concerns;
  state.fans.rational -= unanswered ? 14 : 5;
  state.fans.casual -= 6;
  if (id === "sing") {
    state.risk -= 16;
    state.energy += 14;
    state.heat -= 8;
    state.lastReply = "好啦好啦，我们来唱歌吧。下一首送给你们。";
  } else if (id === "game") {
    state.risk -= 7;
    state.energy += 22;
    state.heat += 5;
    state.lastReply = "这个话题先放一放，我们开一把，边玩边聊。";
  } else {
    state.risk -= 11;
    state.energy += 10;
    state.trust += 5;
    state.heat -= 4;
    state.lastReply = "来，同步视听时间到。大家准备好，我们一起看。";
  }
  if (hasPerk(state, "soft-landing")) {
    state.risk -= 5;
    state.trust += 2;
  }
  record(
    state,
    `${state.lastReply}${unanswered ? " 部分疑虑没得到回答，观众记住了这次转场。" : " 趁情绪平稳结束了这个话题。"}`,
  );
  finishTopic(state, true);
}

export function gameReducer(
  state: StreamState,
  action: GameAction,
): StreamState {
  if (action.type === "start") {
    const next = createInitialState();
    next.seed = Number.isFinite(action.seed)
      ? Math.abs(Math.trunc(action.seed)) % 4294967295 || 1
      : 1;
    next.rng = next.seed;
    next.timed = action.timed === true;
    if (action.perk && PERKS.some((perk) => perk.id === action.perk)) applyPerk(next, action.perk);
    draftTopics(next);
    record(next, "直播开始了。先挑一个话题，留意弹幕背后不同的期待。");
    return next;
  }
  if (state.phase === "lobby" || state.phase === "ended") return state;
  if (action.type === "tick") {
    if (
      !state.timed ||
      !ACTIVE_PHASES.includes(state.phase) ||
      !Number.isFinite(action.ms) ||
      action.ms <= 0
    ) return state;
    const next = clone(state);
    next.remainingMs -= Math.min(600000, Math.round(action.ms));
    while (next.remainingMs <= 0 && next.phase !== "ended") {
      next.silenceCount += 1;
      next.energy -= 8;
      next.trust -= 4;
      next.heat -= 8;
      next.risk += 5;
      for (const kind of FAN_KINDS) next.fans[kind] = Math.floor(next.fans[kind] * 0.85);
      record(
        next,
        "冷场了：精力 −8、信任 −4、热度 −8、风险 +5，各类观众约 15% 离开了。",
      );
      next.remainingMs += decisionTime(next);
      checkFailure(next);
    }
    return next;
  }
  if (action.type === "topic") {
    if (
      state.phase !== "topic" ||
      !state.topicOptions.includes(action.id) ||
      !TOPICS.some((topic) => topic.id === action.id)
    ) return state;
    const next = clone(state);
    next.activeTopic = action.id;
    next.usedTopics.push(action.id);
    next.topicOptions = [];
    next.beat = 0;
    next.lastReply = "";
    revealBeat(next);
    return next;
  }
  if (action.type === "continue") {
    if (state.phase !== "continue" || state.beat >= 2) return state;
    const next = clone(state);
    next.beat += 1;
    revealBeat(next);
    return next;
  }
  if (action.type === "reply") {
    const comment = getTopic(state)?.beats[state.beat]?.comments[action.index];
    if (
      state.phase !== "reply" ||
      !Number.isInteger(action.index) ||
      !comment ||
      !["agree", "explain", "confront"].includes(action.style)
    ) return state;
    const next = clone(state);
    const effect = replyEffect(next, comment.kind, action.style);
    for (const key of ["risk", "trust", "energy", "control", "heat"] as const) next[key] += effect[key];
    for (const kind of FAN_KINDS) next.fans[kind] += effect.fans[kind] || 0;
    next.resolvedBeats += 1;
    if (action.style === "confront") next.confrontations += 1;
    if (effect.ignores) next.ignoredConcerns += 1;
    next.lastReply = effect.quote;
    next.remainingMs = decisionTime(next);
    record(next, effect.event);
    if (!checkFailure(next)) {
      if (next.beat === 2) finishTopic(next, false);
      else next.phase = "continue";
    }
    return next;
  }
  if (action.type === "action") {
    if (
      !["reply", "continue"].includes(state.phase) ||
      !ACTION_IDS.includes(action.id) ||
      state.actions[action.id] <= 0
    ) return state;
    if (
      action.id === "moderate" &&
      (state.phase !== "reply" ||
        state.moderatedBeat === `${state.activeTopic}:${state.beat}`)
    ) return state;
    const next = clone(state);
    interrupt(next, action.id);
    return next;
  }
  if (action.type === "reward") {
    if (
      state.phase !== "reward" ||
      !state.rewardOptions.includes(action.id) ||
      hasPerk(state, action.id)
    ) return state;
    const next = clone(state);
    applyPerk(next, action.id);
    next.rewardOptions = [];
    next.act += 1;
    next.energy += 25;
    next.risk -= 12;
    next.actions.sing += 1;
    next.actions.moderate += 1;
    normalize(next);
    draftTopics(next);
    record(
      next,
      `第 ${next.act} 场开播：精力 +25、风险 −12，补充一张唱歌卡和一张房管卡。`,
    );
    return next;
  }
  return state;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validInteger(
  value: unknown,
  min: number,
  max: number,
): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= min &&
    value <= max
  );
}

function validIds(
  value: unknown,
  allowed: string[],
  max: number,
): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= max &&
    new Set(value).size === value.length &&
    value.every((id) => typeof id === "string" && allowed.includes(id))
  );
}

export function validateSave(value: unknown): StreamState | null {
  if (!isRecord(value) || value.version !== 1) return null;
  const defaults = createInitialState();
  if (
    Object.keys(value).length !== Object.keys(defaults).length ||
    Object.keys(defaults).some((key) => !(key in value))
  ) return null;
  if (
    !["lobby", "topic", "continue", "reply", "reward", "ended"].includes(
      value.phase as string,
    )
  ) return null;
  if (
    !validInteger(value.seed, 1, 4294967295) ||
    !validInteger(value.rng, 0, 4294967295)
  ) return null;
  if (
    !validInteger(value.act, 1, 3) ||
    !validInteger(value.completedTopics, 0, 6) ||
    !validInteger(value.beat, 0, 2)
  ) return null;
  if (!isRecord(value.fans) || !isRecord(value.actions)) return null;
  const savedFans = value.fans;
  const savedActions = value.actions;
  if (
    Object.keys(savedFans).length !== 4 ||
    FAN_KINDS.some((kind) => !validInteger(savedFans[kind], 0, 10000000))
  ) return null;
  if (
    Object.keys(savedActions).length !== 4 ||
    ACTION_IDS.some((id) => !validInteger(savedActions[id], 0, 8))
  ) return null;
  if (
    ["heat", "trust", "risk", "energy", "control"].some(
      (key) => !validInteger(value[key], 0, 100),
    )
  ) return null;
  if (
    !validInteger(value.peakViewers, 0, 40000000) ||
    !validInteger(value.score, 0, 100000000)
  ) return null;
  if (
    !validInteger(value.remainingMs, 0, 60000) ||
    typeof value.timed !== "boolean"
  ) return null;
  if (
    !validInteger(value.silenceCount, 0, 1000) ||
    !validInteger(value.resolvedBeats, 0, 18)
  ) return null;
  if (
    !validInteger(value.confrontations, 0, 18) ||
    !validInteger(value.ignoredConcerns, 0, 18) ||
    !validInteger(value.interruptions, 0, 6)
  ) return null;
  const topicIds = TOPICS.map((topic) => topic.id);
  const perkIds = PERKS.map((perk) => perk.id);
  if (
    !validIds(value.topicOptions, topicIds, 3) ||
    !validIds(value.usedTopics, topicIds, 6)
  ) return null;
  if (
    !validIds(value.perks, perkIds, 3) ||
    !validIds(value.rewardOptions, perkIds, 3)
  ) return null;
  if (
    typeof value.lastReply !== "string" ||
    value.lastReply.length > 1000 ||
    typeof value.lastEvent !== "string" ||
    value.lastEvent.length > 1000
  ) return null;
  if (
    !Array.isArray(value.log) ||
    value.log.length > 32 ||
    value.log.some((line) => typeof line !== "string" || line.length > 1000)
  ) return null;
  if (
    value.activeTopic !== null &&
    (typeof value.activeTopic !== "string" ||
      !topicIds.includes(value.activeTopic))
  ) return null;
  if (
    value.ending !== null &&
    (typeof value.ending !== "string" || !Object.prototype.hasOwnProperty.call(ENDINGS, value.ending))
  ) return null;
  if (
    value.moderatedBeat !== null &&
    value.moderatedBeat !== `${value.activeTopic}:${value.beat}`
  ) return null;
  const state = clone(value as unknown as StreamState);
  if (
    state.peakViewers < getViewers(state) ||
    state.remainingMs > decisionTime(state)
  ) return null;
  if (
    state.topicOptions.some((id) => state.usedTopics.includes(id)) ||
    state.rewardOptions.some((id) => state.perks.includes(id))
  ) return null;
  if (
    state.confrontations > state.resolvedBeats ||
    state.ignoredConcerns > state.resolvedBeats ||
    state.interruptions > state.completedTopics
  ) return null;
  if (
    state.phase !== "ended" &&
    (state.ending !== null ||
      state.score !== 0 ||
      state.energy <= 0 ||
      state.risk >= 100 ||
      getViewers(state) < 200)
  ) return null;
  if (state.phase !== "reward" && state.rewardOptions.length > 0) return null;
  if (state.phase !== "topic" && state.topicOptions.length > 0) return null;
  if (state.phase === "lobby") return JSON.stringify(state) === JSON.stringify(defaults) ? state : null;
  if (["reply", "continue"].includes(state.phase)) {
    if (
      !state.activeTopic ||
      !state.usedTopics.includes(state.activeTopic) ||
      state.usedTopics.length !== state.completedTopics + 1
    ) return null;
    if (state.phase === "continue" && state.beat >= 2) return null;
  } else if (
    state.phase !== "ended" &&
    (state.activeTopic !== null ||
      state.beat !== 0 ||
      state.usedTopics.length !== state.completedTopics ||
      state.moderatedBeat !== null)
  ) return null;
  if (
    state.phase === "topic" &&
    (state.topicOptions.length !== 3 || state.completedTopics >= 6)
  ) return null;
  if (state.phase === "reward") {
    if (
      ![2, 4].includes(state.completedTopics) ||
      state.act !== state.completedTopics / 2 ||
      state.rewardOptions.length !== 3
    ) return null;
  } else if (
    state.phase !== "ended" &&
    state.act !== Math.min(3, Math.floor(state.completedTopics / 2) + 1)
  ) return null;
  if (state.phase === "ended") {
    if (
      !state.ending ||
      (state.completedTopics < 6 &&
        state.energy > 0 &&
        state.risk < 100 &&
        getViewers(state) >= 200)
    ) return null;
    if (state.activeTopic && !state.usedTopics.includes(state.activeTopic)) return null;
    if (
      state.usedTopics.length !==
      state.completedTopics + (state.activeTopic ? 1 : 0)
    ) return null;
  }
  return state;
}
