import { hasMutualAttraction } from "./growth";
import { nextUnknownLike } from "./interests";
import type {
  Actor,
  InboxMessage,
  InboxSender,
  MarriageGameState,
  MicroMetric,
  ParentActionId,
  WeekSlot,
} from "./types";

export const CHILD_SLOTS: WeekSlot[] = ["work", "commute", "evening"];
export const PARENT_SLOTS: WeekSlot[] = ["morning", "afternoon"];
// 单条消息对任一数值最多 ±3；一季内小回应对同一数值累计最多 4
export const MICRO_MESSAGE_LIMIT = 3;
export const MICRO_TURN_LIMIT = 4;

export const SLOT_LABELS: Record<WeekSlot, string> = {
  work: "工作日 · 工位",
  commute: "下班路上",
  evening: "晚上 · 住处",
  morning: "上午 · 公园",
  afternoon: "下午 · 家里",
};

export type MicroEffects = Partial<Record<MicroMetric, number>>;

export interface ReplyOption {
  id: string;
  label: string;
  effects: MicroEffects;
  note: string;
  reveal?: "like";
}

export interface MessageKind {
  id: string;
  from: InboxSender;
  slot: WeekSlot;
  urgent: boolean;
  preview: string;
  replies: ReplyOption[];
  ignored?: { effects: MicroEffects; note: string };
}

const kinds: MessageKind[] = [
  {
    id: "mom-meet",
from: "mom",
slot: "work",
urgent: true,
preview: "妈妈推来一张名片：周六见一面？",
    replies: [
      { id: "ok", label: "好，我看看时间", effects: { familyBond: 2, pressure: -1, career: -1 }, note: "上班抽空回了妈妈，她放心了一点。" },
      { id: "emoji", label: "发个“收到”表情", effects: { pressure: 1 }, note: "一个表情包挡了过去，妈妈觉得你在敷衍。" },
      { id: "boundary", label: "我自己会安排", effects: { autonomy: 2, pressure: -2, familyBond: -1 }, note: "说清楚见不见由自己安排，妈妈有点不高兴。" },
    ],
    ignored: { effects: { familyBond: -1, pressure: 1 }, note: "妈妈的消息一直显示已读未回，晚上又追来三条。" },
  },
  {
    id: "mom-compare",
from: "family-group",
slot: "work",
urgent: true,
preview: "家庭群：“你看隔壁王阿姨家的……”",
    replies: [
      { id: "calm", label: "各家有各家的节奏", effects: { autonomy: 2, pressure: -1 }, note: "你在群里回了一句，没有吵起来。" },
      { id: "mute", label: "设成消息免打扰", effects: { stress: -2, familyBond: -1 }, note: "群消息安静了，心里也清净一点。" },
      { id: "sorry", label: "知道了知道了", effects: { stress: 1, familyBond: 1 }, note: "先认个怂，长辈满意了，自己憋着。" },
    ],
    ignored: { effects: { pressure: 1 }, note: "没人接话，长辈在群里又 @ 了你一次。" },
  },
  {
    id: "mom-encourage",
from: "mom",
slot: "commute",
urgent: false,
preview: "妈妈：“多给人家发发消息，主动点！”",
    replies: [
      { id: "ok", label: "嗯，我有分寸", effects: { familyBond: 1 }, note: "妈妈回了个大拇指。" },
      { id: "boundary", label: "节奏我们自己定", effects: { autonomy: 2, pressure: -1 }, note: "你请妈妈别替你们安排节奏。" },
    ],
  },
  {
    id: "mom-next",
from: "mom",
slot: "commute",
urgent: false,
preview: "妈妈：“那个不行，妈再给你找。”",
    replies: [
      { id: "ok", label: "行，先看看吧", effects: { familyBond: 1 }, note: "妈妈又开始翻相亲群了。" },
      { id: "boundary", label: "别急，我想自己认识", effects: { autonomy: 2, pressure: -1 }, note: "你提出想先自己认识人，妈妈半信半疑。" },
    ],
  },
  {
    id: "mom-marriage",
from: "mom",
slot: "commute",
urgent: true,
preview: "妈妈打来语音电话……",
    replies: [
      { id: "answer", label: "接起来，说我们有自己的节奏", effects: { familyBond: 2, stress: 1, pressure: -1 }, note: "在地铁上听完了一整段催婚，但把话说开了一点。" },
      { id: "text", label: "挂断，发文字“在地铁上，晚点说”", effects: { pressure: 1 }, note: "电话挂了，妈妈回了一串省略号。" },
    ],
    ignored: { effects: { pressure: 1, familyBond: -1 }, note: "未接来电两个，妈妈开始担心你是不是在躲。" },
  },
  {
    id: "mom-baby",
from: "mom",
slot: "commute",
urgent: true,
preview: "妈妈：“我和你爸还能帮你们带……”",
    replies: [
      { id: "answer", label: "谢谢，但这是我们两个人的决定", effects: { autonomy: 2, pressure: -1, familyBond: 1 }, note: "你认真说明生育要两个人商量。" },
      { id: "later", label: "再说吧", effects: { pressure: 1 }, note: "话题被推到了下次饭桌。" },
    ],
    ignored: { effects: { pressure: 1 }, note: "消息没回，妈妈转而去问伴侣了。" },
  },
  {
    id: "mom-education",
from: "mom",
slot: "work",
urgent: true,
preview: "妈妈转来一张奥数班的报名表。",
    replies: [
      { id: "decline", label: "先让孩子歇一歇", effects: { autonomy: 2, pressure: -1 }, note: "你把报名表退了回去。" },
      { id: "consider", label: "我问问孩子想不想", effects: { familyBond: 1, stress: 1 }, note: "你说会先问孩子的意思。" },
    ],
    ignored: { effects: { pressure: 1 }, note: "没回消息，妈妈直接帮忙交了定金的截图发了过来。" },
  },
  {
    id: "mom-support",
from: "mom",
slot: "commute",
urgent: true,
preview: "妈妈发来一笔转账。",
    replies: [
      { id: "accept", label: "收款，谢谢妈", effects: { familyBond: 2 }, note: "你收下转账，说会好好规划这笔钱。" },
      { id: "enough", label: "收下，也说以后不用再给了", effects: { autonomy: 2, familyBond: 1 }, note: "你收下心意，也说明自己能扛住日常开销。" },
    ],
    ignored: { effects: { familyBond: -1 }, note: "转账 24 小时没点收款，妈妈打电话来问是不是出事了。" },
  },
  {
    id: "mom-listen",
from: "mom",
slot: "commute",
urgent: false,
preview: "妈妈：“最近累不累？吃饭了没？”",
    replies: [
      { id: "open", label: "说说最近的压力", effects: { stress: -2, familyBond: 2 }, note: "你在路上跟妈妈聊了二十分钟，心里轻了一些。" },
      { id: "fine", label: "挺好的，别担心", effects: {}, note: "报喜不报忧，妈妈回了个抱抱。" },
    ],
  },
  {
    id: "boss-ping",
from: "boss",
slot: "work",
urgent: true,
preview: "领导：“这个需求今天能加一下吗？”",
    replies: [
      { id: "take", label: "接下，今晚加个班", effects: { career: 2, stress: 2 }, note: "需求接下了，领导回了个“辛苦”。" },
      { id: "decline", label: "今天有安排，明天上午给", effects: { stress: -1, career: -1 }, note: "你给了明确时间，领导没再追问。" },
    ],
    ignored: { effects: { career: -1 }, note: "领导的消息被你漏看了，站会上被点了名。" },
  },
  {
    id: "family-care",
from: "family-group",
slot: "work",
urgent: true,
preview: "家庭群：“你外婆住院了，今天复查。”",
    replies: [
      { id: "call", label: "请半小时假打电话问候", effects: { familyBond: 2, career: -1 }, note: "电话那头外婆说没事，你还是松了口气。" },
      { id: "text", label: "先发消息，下班再打", effects: { familyBond: 1 }, note: "你在群里问了情况，约好晚上视频。" },
    ],
    ignored: { effects: { familyBond: -2 }, note: "一整天没在群里说话，舅舅私信问你忙什么。" },
  },
  {
    id: "landlord",
from: "landlord",
slot: "commute",
urgent: false,
preview: "房东：“下季度租金要调整一下哈。”",
    replies: [
      { id: "accept", label: "好的，知道了", effects: {}, note: "你回了房东，默默打开了记账软件。" },
      { id: "negotiate", label: "商量一下能不能少涨点", effects: { stress: 1, savings: 1 }, note: "来回谈了几句，房东同意少涨一点。" },
    ],
  },
  {
    id: "candidate-share",
from: "candidate",
slot: "work",
urgent: false,
preview: "对方发来一张午饭的照片。",
    replies: [
      { id: "now", label: "摸鱼回一句，也拍自己的", effects: { understanding: 2, relation: 1, career: -1 }, note: "你们隔着工位互相吐槽了午饭。" },
      { id: "later", label: "下班再好好回", effects: { understanding: 1 }, note: "下班后你认真回了一段，对方回得也很长。" },
    ],
    ignored: { effects: { mutualIntent: -2 }, note: "对方的分享一直没有回音，聊天框停在了中午。" },
  },
  {
    id: "candidate-moments",
from: "candidate",
slot: "commute",
urgent: false,
preview: "对方更新了朋友圈。",
    replies: [
      { id: "look", label: "点开看看", effects: {}, note: "你翻了翻对方的朋友圈，大概知道对方周末喜欢做什么了。", reveal: "like" },
      { id: "like", label: "点个赞，再评论一句", effects: { understanding: 1 }, note: "你点了赞，对方回复了你的评论。", reveal: "like" },
    ],
  },
  {
    id: "candidate-home",
from: "candidate",
slot: "commute",
urgent: true,
preview: "对方：“下班了吗？到家说一声。”",
    replies: [
      { id: "reply", label: "刚出地铁，到家跟你说", effects: { relation: 1 }, note: "到家后你发了个“到啦”，对方回了晚安。" },
      { id: "call", label: "直接打个电话", effects: { relation: 1, understanding: 1 }, note: "路上打了十分钟电话，聊的都是今天的小事。" },
    ],
    ignored: { effects: { mutualIntent: -1 }, note: "那句“到家说一声”直到第二天才被你看到。" },
  },
  {
    id: "partner-dinner",
from: "partner",
slot: "commute",
urgent: false,
preview: "伴侣：“今晚吃什么？谁做饭？”",
    replies: [
      { id: "together", label: "一起买菜，一起做", effects: { relation: 1, stress: -1 }, note: "你们在菜市场碰头，一起做了顿简单的晚饭。" },
      { id: "takeout", label: "都累了，点个外卖吧", effects: { savings: -1, stress: -1 }, note: "外卖到了，两个人窝在沙发上吃完。" },
    ],
  },
  {
    id: "partner-kid",
from: "partner",
slot: "work",
urgent: true,
preview: "伴侣：“孩子学校打电话，说有点发烧。”",
    replies: [
      { id: "leave", label: "我请假去接", effects: { career: -2, relation: 1, stress: 1 }, note: "你请了假去接孩子，伴侣松了口气。" },
      { id: "split", label: "你先去，我下班去买药", effects: { relation: 1 }, note: "你们分好了工，晚上一起守着孩子。" },
    ],
    ignored: { effects: { relation: -2, stress: 1 }, note: "消息没回，伴侣一个人跑了医院。" },
  },
  {
    id: "sisters-brag",
from: "sisters",
slot: "morning",
urgent: false,
preview: "广场舞姐妹群：“我家孙子会叫奶奶了！”",
    replies: [
      { id: "forward", label: "转发给孩子看看", effects: { pressure: 2, familyBond: -1, parentFace: 1 }, note: "你把视频转给了孩子，对方只回了个“嗯”。" },
      { id: "smile", label: "笑笑，发个点赞", effects: {}, note: "你在群里点了赞，没有多说。" },
      { id: "own", label: "各家有各家的日子", effects: { pressure: -1 }, note: "你在群里说孩子有自己的安排，姐妹们换了话题。" },
    ],
  },
  {
    id: "matchmaker",
from: "matchmaker",
slot: "morning",
urgent: false,
preview: "介绍人阿姨：“对方家里问你家孩子情况。”",
    replies: [
      { id: "brag", label: "把孩子夸一遍", effects: { parentFace: 2 }, note: "你把孩子的工作和收入夸了一遍。" },
      { id: "honest", label: "实话实说，让孩子自己决定", effects: { pressure: -1, familyBond: 1 }, note: "你说成不成要看两个孩子自己的意思。" },
    ],
  },
  {
    id: "child-update",
from: "child",
slot: "afternoon",
urgent: false,
preview: "孩子：“这周有点忙，晚点回你。”",
    replies: [
      { id: "care", label: "早点休息，别太累", effects: { familyBond: 2, stress: -1 }, note: "孩子回了个“嗯嗯，你也是”。" },
      { id: "nag", label: "那周末见面的事呢？", effects: { pressure: 2, stress: 1 }, note: "孩子过了很久才回了一句“再说”。" },
    ],
  },
];

export const MESSAGE_KINDS: Record<string, MessageKind> = Object.fromEntries(kinds.map(kind => [kind.id, kind]));

const PARENT_MESSAGE: Record<ParentActionId, string> = {
  "push-meet": "mom-meet",
  compare: "mom-compare",
  encourage: "mom-encourage",
  next: "mom-next",
  "push-marriage": "mom-marriage",
  "push-baby": "mom-baby",
  "push-education": "mom-education",
  support: "mom-support",
  listen: "mom-listen",
};

// 表现层与收件箱共用的确定性哈希，不消耗引擎随机数
/* eslint-disable no-bitwise -- FNV-1a 需要显式的 32 位整数运算，保证各端结果一致 */
export function hashKey(...parts: Array<string | number>) {
  let hash = 2166136261;
  for (const char of parts.join("|")) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
/* eslint-enable no-bitwise */

export function getSlots(actor: Actor) {
  return actor === "parent" ? PARENT_SLOTS : CHILD_SLOTS;
}

export function firstSlot(actor: Actor): WeekSlot {
  return actor === "parent" ? "morning" : "work";
}

export function nextSlot(week: { actor: Actor; slot: WeekSlot }) {
  const slots = getSlots(week.actor);
  const index = slots.indexOf(week.slot);
  return index >= 0 && index < slots.length - 1 ? slots[index + 1] : null;
}

function message(state: MarriageGameState, actor: Actor, kind: string, urgent?: boolean): InboxMessage {
  const definition = MESSAGE_KINDS[kind];
  return {
    id: `${state.turn}-${actor}-${kind}`,
    kind,
    from: definition.from,
    slot: definition.slot,
    urgent: urgent ?? definition.urgent,
  };
}

// 按本回合家长行动、现实事件与关系阶段生成 2–4 条消息
export function buildInbox(state: MarriageGameState, actor: Actor): InboxMessage[] {
  if (state.phase !== "turn" || !state.candidateId) return [];
  const roll = (key: string) => hashKey(state.seed, state.turn, actor, key) % 100;
  if (actor === "parent") {
    const list: InboxMessage[] = [];
    const matching = state.stage === "single" || state.stage === "chatting";
    list.push(message(state, actor, matching && roll("matchmaker") < 55 ? "matchmaker" : "sisters-brag"));
    if (state.turn > 1 || state.lastChildAction) list.push(message(state, actor, "child-update"));
    return list;
  }
  const list: InboxMessage[] = [];
  const household = state.stage === "married" || state.stage === "parenthood";
  if (state.lastParentAction) list.push(message(state, actor, PARENT_MESSAGE[state.lastParentAction]));
  if (state.currentEventId === "hospital") list.push(message(state, actor, "family-care"));
  if (state.currentEventId === "overtime" || state.currentEventId === "layoff-rumor" || roll("boss") < 35) list.push(message(state, actor, "boss-ping"));
  if (state.currentEventId === "rent") list.push(message(state, actor, "landlord"));
  if (household) {
    list.push(message(state, actor, state.stage === "parenthood" && roll("kid") < 50 ? "partner-kid" : "partner-dinner"));
  } else if (!state.matchClosed && state.stage !== "single") {
    list.push(message(state, actor, "candidate-share", state.stage === "dating"));
    if (nextUnknownLike(state.candidateId, state.knownInterests)) list.push(message(state, actor, "candidate-moments"));
    if (state.stage === "dating") list.push(message(state, actor, "candidate-home"));
  } else if (!state.matchClosed && nextUnknownLike(state.candidateId, state.knownInterests) && roll("moments") < 60) {
    list.push(message(state, actor, "candidate-moments"));
  }
  const unique = list.filter((item, index) => list.findIndex(other => other.id === item.id) === index);
  return unique.slice(0, 4);
}

export function getReplyOption(kind: string, choice: string) {
  return MESSAGE_KINDS[kind]?.replies.find(reply => reply.id === choice) ?? null;
}

// 应用小回应，受单季累计上限约束；消息不能凭空制造吸引
export function applyMicroEffects(state: MarriageGameState, effects: MicroEffects) {
  const applied: MicroEffects = {};
  for (const [key, raw] of Object.entries(effects) as Array<[MicroMetric, number]>) {
    let delta = Math.max(-MICRO_MESSAGE_LIMIT, Math.min(MICRO_MESSAGE_LIMIT, raw));
    if ((key === "relation" || key === "mutualIntent") && delta > 0 && !hasMutualAttraction(state)) delta = 0;
    const used = state.week.micro[key] ?? 0;
    const room = Math.max(0, MICRO_TURN_LIMIT - used);
    const allowed = Math.sign(delta) * Math.min(Math.abs(delta), room);
    if (!allowed) continue;
    state[key] += allowed;
    state.week.micro[key] = used + Math.abs(allowed);
    applied[key] = allowed;
  }
  return applied;
}
