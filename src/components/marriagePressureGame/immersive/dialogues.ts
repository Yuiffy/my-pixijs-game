import { ACTIVITIES } from "../activities";
import { PARENT_ACTIONS } from "../content";
import { getAvailableChildActions, getAvailableParentActions, getCandidate } from "../engine";
import { MESSAGE_KINDS } from "../inbox";
import { nextUnknownLike } from "../interests";
import type { ChildActionId, InboxMessage, MarriageGameState, ParentActionId } from "../types";
import type { BubbleKind, ChatBubble, DialogueChoice, DialogueNode, DialogueScript } from "./dialogueTypes";
import { SENDER_CHAT } from "./dialogueTypes";
import { describeMessage, pickLine, senderProfile, type SenderProfile } from "./lines";
import type { ChatId } from "./sceneRouter";

const them = (id: string, text: string, kind: BubbleKind = "text", meta?: string): ChatBubble => ({ id, mine: false, kind, text, meta });
const me = (id: string, text: string): ChatBubble => ({ id, mine: true, kind: "text", text });

const child = (id: ChildActionId, extra: Partial<DialogueChoice> & { label: string }): DialogueChoice & { needs: ChildActionId } => ({
  id,
  needs: id,
  action: { type: "child-action", id },
  ...extra,
});
const parent = (id: ParentActionId, extra: Partial<DialogueChoice> & { label: string }): DialogueChoice & { needsParent: ParentActionId } => ({
  id,
  needsParent: id,
  action: { type: "parent-action", id },
  ...extra,
});

type Gated = DialogueChoice & { needs?: ChildActionId; needsParent?: ParentActionId };

// 只保留当前真正可用的选项；人生决定改成先确认
function gate(state: MarriageGameState, choices: Gated[]): DialogueChoice[] {
  const childIds = new Set<string>(state.activeActor === "child" ? getAvailableChildActions(state) : []);
  const parentIds = new Set<string>(state.activeActor === "parent" ? getAvailableParentActions(state) : []);
  return choices
    .filter(choice => (!choice.needs || childIds.has(choice.needs)) && (!choice.needsParent || parentIds.has(choice.needsParent)))
    .map(gated => {
      const choice: Gated = { ...gated };
      delete choice.needs;
      delete choice.needsParent;
      const { needs } = gated;
      if (needs && ["marry", "simple-wedding", "baby", "separate"].includes(needs)) return { ...choice, action: undefined, confirm: needs };
      return choice;
    });
}

const CLOSE: DialogueChoice = { id: "close", label: "先聊到这", close: true };

// 聊天窗口里已经有头像和名字，去掉预览文案里“妈妈：”“对方：”这类前缀和引号
export function stripSpeaker(text: string) {
  return text.replace(/^(妈妈|对方|伴侣|领导|孩子|房东|工作群)：/, "").replace(/^“(.*)”$/, "$1");
}

function bubbleFor(state: MarriageGameState, item: InboxMessage): ChatBubble {
  const text = stripSpeaker(describeMessage(state, item));
  const candidate = getCandidate(state.candidateId);
  switch (item.kind) {
    case "mom-meet":
      return them(item.id, text, "card", candidate ? `${candidate.name} · ${candidate.subtitle}` : "个人名片");
    case "mom-support":
      return them(item.id, "给你转了一笔钱，别省着。", "transfer", "转账 · 家里的心意");
    case "mom-marriage":
      return them(item.id, text, "call", "语音通话");
    case "mom-listen":
      return them(item.id, text, "voice", `${8 + (state.turn % 9)}″`);
    case "mom-compare":
    case "sisters-brag":
      return them(item.id, text, "moment", "转发自朋友圈");
    case "candidate-moments":
      return them(item.id, text, "moment", "朋友圈更新");
    case "candidate-share":
      return them(item.id, text, "image", "照片");
    default:
      return them(item.id, text);
  }
}

// 聊天记录：本周这个联系人发来的消息，以及我已经回过的话
export function buildThread(state: MarriageGameState, chat: ChatId): ChatBubble[] {
  const bubbles: ChatBubble[] = [];
  if (state.week.actor === state.activeActor) {
    for (const item of state.week.inbox) {
      if (SENDER_CHAT[item.from] !== chat) continue;
      bubbles.push(bubbleFor(state, item));
      const handled = state.week.handled[item.id];
      if (handled === "ignored") bubbles.push({ id: `${item.id}-ignored`, mine: false, kind: "system", text: MESSAGE_KINDS[item.kind]?.ignored?.note ?? "已读未回" });
      else if (handled) {
        const reply = MESSAGE_KINDS[item.kind]?.replies.find(option => option.id === handled);
        if (reply) {
          bubbles.push(me(`${item.id}-reply`, reply.label));
          bubbles.push({ id: `${item.id}-note`, mine: false, kind: "system", text: reply.note });
        }
      }
    }
  }
  return bubbles;
}

export interface ChatEntry {
  id: ChatId;
  profile: SenderProfile;
  preview: string;
  unread: number;
  urgent: boolean;
  pinned: boolean;
}

const CHAT_PROFILE_SENDER: Record<ChatId, Parameters<typeof senderProfile>[1]> = {
  mom: "mom", dad: "dad", family: "family-group", matchmaker: "matchmaker", work: "boss", candidate: "candidate", child: "child", sisters: "sisters", landlord: "landlord",
};

export function chatProfile(state: MarriageGameState, chat: ChatId, childName?: string) {
  const household = state.stage === "married" || state.stage === "parenthood";
  return senderProfile(state, household && chat === "candidate" ? "partner" : CHAT_PROFILE_SENDER[chat], childName);
}

// 会话列表：有未回消息的排前面；主要联系人即使没消息也常驻
export function listChats(state: MarriageGameState, childName?: string): ChatEntry[] {
  const parentView = state.activeActor === "parent";
  const base: ChatId[] = parentView ? ["child", "sisters", "matchmaker"] : ["candidate", "mom", "family", "work", "dad"];
  const ids = new Set<ChatId>(base);
  if (state.week.actor === state.activeActor) for (const item of state.week.inbox) ids.add(SENDER_CHAT[item.from]);
  if (!state.candidateId || (!parentView && state.stage === "single" && state.matchClosed)) ids.delete("candidate");
  const entries = Array.from(ids).map(id => {
    const messages = state.week.actor === state.activeActor ? state.week.inbox.filter(item => SENDER_CHAT[item.from] === id) : [];
    const pending = messages.filter(item => !state.week.handled[item.id]);
    const last = messages[messages.length - 1];
    return {
      id,
      profile: chatProfile(state, id, childName),
      preview: last ? describeMessage(state, last) : defaultPreview(state, id),
      unread: pending.length,
      urgent: pending.some(item => item.urgent),
      pinned: id === "candidate" || id === "child",
    };
  });
  return entries.sort((a, b) => Number(b.urgent) - Number(a.urgent) || b.unread - a.unread || Number(b.pinned) - Number(a.pinned));
}

function defaultPreview(state: MarriageGameState, chat: ChatId) {
  switch (chat) {
    case "candidate": return state.stage === "married" || state.stage === "parenthood" ? state.partnerNote : state.datingFeedback;
    case "mom": return "[语音] 记得按时吃饭";
    case "dad": return "[链接] 《中老年人养生十大误区》";
    case "family": return "三姑：[表情]";
    case "work": return "周五前交周报";
    case "child": return "嗯嗯，知道了";
    case "sisters": return "今晚七点老地方跳舞";
    default: return "";
  }
}

const CANDIDATE_OPENERS = {
  chatting: ["今天好累，终于下班了。", "刚看到一家新开的店，下次可以去试试。", "你周末一般做什么呀？", "今天被同事拉去喝奶茶了，好甜。"],
  dating: ["想你了。今天过得怎么样？", "下周要不要一起去逛逛？", "今天路过上次那家店，想起你了。", "到家啦？今天有没有好好吃饭。"],
  household: ["今晚早点回来吗？", "这个月的账我记好了，有空一起看看。", "孩子今天又问你了。", "我们好久没好好说说话了。"],
};

// 与对象/伴侣的聊天：前两步是对话，最后一步提交本季主投入
export function candidateScript(state: MarriageGameState): DialogueScript {
  const candidate = getCandidate(state.candidateId);
  const household = state.stage === "married" || state.stage === "parenthood";
  const key = (tag: string) => [state.seed, state.turn, tag];
  const nodes: Record<string, DialogueNode> = {};
  if (state.matchClosed && !household) {
    nodes.start = {
      id: "start",
      lines: [them("closed", "我想了想，我们可能还是更适合做朋友。谢谢你这段时间的认真。")],
      choices: gate(state, [child("next", { label: "好，也谢谢你", reply: "明白，也谢谢你。祝你一切顺利。" }), CLOSE]),
    };
    return { chat: "candidate", start: "start", nodes };
  }
  if (household) {
    nodes.start = {
      id: "start",
      lines: [them("open", pickLine(CANDIDATE_OPENERS.household, ...key("household")))],
      choices: gate(state, [
        child("build-home", { label: "今晚一起把钱、家务和分工摊开谈谈", reply: "今晚我们把账和家务都摊开聊聊吧，不吵架。" }),
        child("budget", { label: "商量这阵子先过简单一点", reply: "要不这阵子先过简单一点？旅行往后放放。" }),
        child("protect-child", { label: "孩子的课先停一停", reply: "孩子最近太累了，那些课我们先停一停吧。" }),
        child("relationship-boundary", { label: "说说我们各自需要的空间", reply: "我想跟你说说，我们各自需要一点自己的时间。" }),
        child("baby", { label: "认真聊聊要不要孩子", reply: "我们认真聊聊要不要孩子吧。" }),
        child("childfree", { label: "我想好了，我们不要孩子", reply: "我想清楚了，我们两个人也可以过得很好。" }),
        child("delay", { label: "孩子的事，过两年再说", reply: "孩子的事我们过两年再说，好吗？" }),
        child("overgive", { label: "算了，都听你的", reply: "算了，都听你的吧。" }),
        child("separate", { label: "我们……是不是该分开了", reply: "我想了很久，我们是不是该分开了。" }),
        CLOSE,
      ]),
    };
    return { chat: "candidate", start: "start", nodes };
  }
  const opener = state.meetings === 0 && state.understanding < 12 && candidate
    ? candidate.opening
    : pickLine(state.stage === "dating" ? CANDIDATE_OPENERS.dating : CANDIDATE_OPENERS.chatting, ...key("open"));
  const like = state.candidateId ? nextUnknownLike(state.candidateId, state.knownInterests) : null;
  const hobby = state.playerHobbies[state.playerHobbies.length - 1];
  nodes.start = {
    id: "start",
    lines: [them("open", opener)],
    choices: gate(state, [
      { id: "ask", needs: "chat-listen", label: "问问对方最近怎么样", reply: "最近忙吗？周末一般都做些什么？", next: "listen" },
      { id: "tell", needs: "chat-share", label: "说说我这周的事", reply: hobby ? `我最近在玩${ACTIVITIES[hobby].title}，挺上头的。` : "我这周……其实挺普通的，不过有件小事想跟你说。", next: "share" },
      { id: "plans", needs: "chat-checklist", label: "直接问城市、收入和婚育打算", reply: "我想先确认几件事：以后在哪个城市、收入规划、什么时候考虑孩子？", next: "checklist" },
      child("meet-aa", { label: "约个周末见面", hint: "打开地图选地方", openApp: "map", action: undefined }),
      child("relationship-boundary", { label: "聊聊各自的边界和分工", reply: "我想聊聊我们各自的时间、预算和分工。" }),
      child("delay", { label: "我还没准备好谈结婚", reply: "说实话，我还没准备好谈结婚，能不能慢一点？" }),
      child("marry", { label: "我们结婚吧", reply: "我认真想过了，我们结婚吧。" }),
      child("simple-wedding", { label: "简单领个证，小范围庆祝？", reply: "不用大办，我们简单领个证，请几个人吃顿饭？" }),
      child("overgive", { label: "算了，这次都依你", reply: "算了，这次都依你吧。" }),
      { id: "end", needs: "next", label: "我觉得我们不太合适", next: "end" },
      CLOSE,
    ]),
  };
  nodes.listen = {
    id: "listen",
    lines: [them("listen", like ? `最近在琢磨${ACTIVITIES[like].title}，不过还没找到人一起。` : "就是上班下班，偶尔追追剧。你呢？")],
    choices: gate(state, [child("chat-listen", { label: "认真接话，多问两句", reply: "听起来很有意思，你是怎么喜欢上的？" }), { id: "back", label: "换个话题", next: "start" }]),
  };
  nodes.share = {
    id: "share",
    lines: [them("share", hobby && state.candidateId && like === hobby ? "真的吗！我也一直想试试！" : "哈哈，听起来挺有意思的。")],
    choices: gate(state, [child("chat-share", { label: "多讲一点自己的生活", reply: "其实我平时……（你认真讲了十分钟自己的日常）" }), { id: "back", label: "换个话题", next: "start" }]),
  };
  nodes.checklist = {
    id: "checklist",
    lines: [them("checklist", state.understanding < 30 ? "……这么快就聊这个吗？" : "嗯，这些确实该说清楚。")],
    choices: gate(state, [child("chat-checklist", { label: "把问题一条条问完", reply: "我知道有点直接，但我想早点确认我们有没有交集。" }), { id: "back", label: "算了，先不问", next: "start" }]),
  };
  nodes.end = {
    id: "end",
    lines: [{ id: "end-hint", mine: false, kind: "system", text: "发出去之后，这段关系就结束了。" }],
    choices: gate(state, [child("next", { label: "发送：我觉得我们不太合适", reply: "这段时间谢谢你。我觉得我们不太合适，不想耽误你。" }), { id: "back", label: "再想想", next: "start" }]),
  };
  return { chat: "candidate", start: "start", nodes };
}

// 与妈妈的聊天：边界、求助、推迟
function momScript(state: MarriageGameState): DialogueScript {
  const last = state.lastParentAction ? PARENT_ACTIONS.find(item => item.id === state.lastParentAction) : null;
  return {
    chat: "mom",
    start: "start",
    nodes: {
      start: {
        id: "start",
        lines: [them("mom-open", last ? last.detail.replace(/^“|”$/g, "") : "最近怎么样？有空回家吃饭。", last?.id === "push-marriage" ? "voice" : "text", last?.id === "push-marriage" ? "32″" : undefined)],
        choices: gate(state, [
          child("boundary", { label: "妈，我的事我自己会安排", reply: "妈，你的建议我会听，但我的人生得我自己决定。" }),
          child("ask-help", { label: "把账单摊开，请家里帮一次", reply: "妈，这个月确实有点紧，我把账单发你看看……" }),
          child("delay", { label: "结婚的事，我想晚点再谈", reply: "结婚的事我现在还没准备好，想晚点再说。" }),
          child("childfree", { label: "告诉爸妈：我决定不生", reply: "妈，我们商量好了，不打算要孩子。" }),
          CLOSE,
        ]),
      },
    },
  };
}

function workScript(state: MarriageGameState): DialogueScript {
  return {
    chat: "work",
    start: "start",
    nodes: {
      start: {
        id: "start",
        lines: [them("work-open", pickLine(["@全体 本周五前交周报。", "客户说下周要看新版本。", "下午三点评审会，别迟到。"], state.seed, state.turn, "work"))],
        choices: gate(state, [
          child("work", { label: "这周先把班上好", reply: "收到，这周我把手上的都收尾。" }),
          child("study", { label: "报名公司的技能内训", reply: "我想报名这期内训，名额还有吗？" }),
          child("rest", { label: "申请两天调休", reply: "领导，我这阵子状态不太好，想申请两天调休。" }),
          CLOSE,
        ]),
      },
    },
  };
}

// 家长视角：给孩子发消息，每种催法都是一张牌
function childScript(state: MarriageGameState): DialogueScript {
  return {
    chat: "child",
    start: "start",
    nodes: {
      start: {
        id: "start",
        lines: [them("child-open", state.stage === "married" || state.stage === "parenthood" ? "最近家里都挺好的，别担心。" : state.stage === "single" ? "妈，我这周有点忙。" : "嗯，还在聊着呢。")],
        choices: gate(state, [
          parent("listen", { label: "先听孩子说说最近", reply: "最近累不累？妈不催你，就想听你说说。" }),
          parent("push-meet", { label: "催一催：周末见一面", reply: "见一面又不会少块肉，周末把时间空出来。" }),
          parent("encourage", { label: "让孩子多主动点", reply: "你多给人家发发消息，主动一点！" }),
          parent("push-marriage", { label: "催结婚", reply: "谈这么久了还不结，是不是没诚意？" }),
          parent("push-baby", { label: "催生孩子", reply: "我们还能帮你们带，再晚就来不及了。" }),
          parent("push-education", { label: "给孙辈报个班", reply: "我给孩子报了个奥数班，别输在起跑线上。" }),
          parent("support", { label: "转一笔钱过去", reply: "[转账] 别省着，该花就花。" }),
          parent("compare", { label: "发一条别人家孩子的朋友圈", reply: "[链接] 你看王阿姨家孙子都会叫奶奶了。" }),
          parent("next", { label: "这个不行，妈再给你找", reply: "那个不行，妈再给你找找。" }),
          CLOSE,
        ]),
      },
    },
  };
}

function sistersScript(state: MarriageGameState): DialogueScript {
  return {
    chat: "sisters",
    start: "start",
    nodes: {
      start: {
        id: "start",
        lines: [them("sisters-open", "李姐：我家闺女下个月办酒，大家都来啊！", "moment", "广场舞姐妹群")],
        choices: gate(state, [parent("compare", { label: "转给孩子：“你看看人家”", reply: "[转发] 你看看人家。" }), CLOSE]),
      },
    },
  };
}

// 按会话取对话脚本；没有主投入选项的会话只显示消息与小回应
export function buildScript(state: MarriageGameState, chat: ChatId): DialogueScript | null {
  if (state.phase !== "turn") return null;
  if (state.activeActor === "parent") {
    if (chat === "child") return childScript(state);
    if (chat === "sisters") return sistersScript(state);
    return null;
  }
  if (chat === "candidate" && state.candidateId) return candidateScript(state);
  if (chat === "mom") return momScript(state);
  if (chat === "work") return workScript(state);
  return null;
}
