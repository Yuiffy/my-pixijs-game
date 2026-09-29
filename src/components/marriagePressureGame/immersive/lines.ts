import { CANDIDATES } from "../content";
import { MESSAGE_KINDS, hashKey } from "../inbox";
import type { InboxMessage, InboxSender, MarriageGameState } from "../types";

// 联系人头像风格：妈妈是荷花，爸爸是山水，其余用纯色字头像
export type AvatarStyle = "lotus" | "landscape" | "group" | "letter" | "portrait";

export interface SenderProfile {
  name: string;
  avatar: AvatarStyle;
  color: string;
  initial: string;
}

const SENDERS: Record<InboxSender, SenderProfile> = {
  mom: { name: "妈妈", avatar: "lotus", color: "#d9667a", initial: "妈" },
  dad: { name: "爸爸", avatar: "landscape", color: "#4f7f6a", initial: "爸" },
  "family-group": { name: "相亲相爱一家人", avatar: "group", color: "#c9913a", initial: "家" },
  matchmaker: { name: "介绍人王阿姨", avatar: "letter", color: "#a0586b", initial: "王" },
  boss: { name: "项目组工作群", avatar: "letter", color: "#3d6a9c", initial: "工" },
  candidate: { name: "对方", avatar: "portrait", color: "#7a6aa8", initial: "TA" },
  partner: { name: "伴侣", avatar: "portrait", color: "#7a6aa8", initial: "TA" },
  child: { name: "孩子", avatar: "letter", color: "#3f8a86", initial: "娃" },
  sisters: { name: "广场舞姐妹群", avatar: "group", color: "#cf7a3c", initial: "舞" },
  landlord: { name: "房东李先生", avatar: "letter", color: "#6f6b65", initial: "房" },
};

export function senderProfile(state: Pick<MarriageGameState, "candidateId">, from: InboxSender, childName = "孩子"): SenderProfile {
  const base = SENDERS[from];
  if (from === "candidate" || from === "partner") {
    const candidate = CANDIDATES.find(item => item.id === state.candidateId);
    return { ...base, name: candidate?.name ?? base.name, initial: candidate?.name.slice(0, 1) ?? base.initial };
  }
  if (from === "child") return { ...base, name: childName };
  return base;
}

export function senderName(state: Pick<MarriageGameState, "candidateId">, from: InboxSender, childName?: string) {
  return senderProfile(state, from, childName).name;
}

// 同一种消息的几种说法，按局面哈希挑选，不消耗引擎随机数
const VARIANTS: Record<string, string[]> = {
  "mom-meet": ["妈妈推来一张名片：“周六见一面？人家条件不错。”", "妈妈：“王阿姨介绍的，周末抽空见见吧。”", "妈妈发来一张名片，后面跟着三个“看看”。"],
  "mom-compare": ["家庭群：“你看隔壁王阿姨家的……”", "大姨在群里发了一张满月酒照片，@了你。", "家庭群转发了一篇《三十岁前必须想清楚的事》。"],
  "mom-encourage": ["妈妈：“多给人家发发消息，主动点！”", "妈妈：“女孩子/男孩子都喜欢主动的，你别端着。”"],
  "mom-marriage": ["妈妈打来语音电话……", "妈妈的语音电话响了第二遍……"],
  "mom-listen": ["妈妈：“最近累不累？吃饭了没？”", "妈妈：“天冷了，记得穿厚点。最近还好吗？”", "妈妈发来一段 12 秒的语音：“没事，就是想问问你。”"],
  "boss-ping": ["领导：“这个需求今天能加一下吗？”", "工作群：“@你 客户那边又改了，今天能出一版吗？”", "领导：“下午有空来会议室一下。”"],
  "candidate-share": ["对方发来一张午饭的照片。", "对方：“今天地铁上看到一只很胖的猫。”", "对方分享了一首歌：“这首最近单曲循环。”"],
  "candidate-home": ["对方：“下班了吗？到家说一声。”", "对方：“今天降温，路上小心。”"],
  "partner-dinner": ["伴侣：“今晚吃什么？谁做饭？”", "伴侣：“冰箱只剩两个鸡蛋了。”"],
};

export function describeMessage(state: Pick<MarriageGameState, "seed" | "turn">, item: InboxMessage) {
  const options = VARIANTS[item.kind];
  if (!options) return MESSAGE_KINDS[item.kind]?.preview ?? "";
  return options[hashKey(state.seed, state.turn, item.id) % options.length];
}

// 按局面哈希从台词池中挑一句
export function pickLine(pool: readonly string[], ...key: Array<string | number>) {
  return pool[hashKey(...key) % pool.length];
}

// 季节只用于表现：天气、服装色和台词
export type Season = "spring" | "summer" | "autumn" | "winter";

export function getSeason(state: Pick<MarriageGameState, "turn" | "monthsPerTurn">): Season {
  if (state.monthsPerTurn === 12) return "winter";
  // 第 1 季是春节前后，所以从冬天开始
  return (["winter", "spring", "summer", "autumn"] as const)[(Math.max(1, state.turn) - 1) % 4];
}

export const SEASON_LABELS: Record<Season, string> = { spring: "春", summer: "夏", autumn: "秋", winter: "冬" };

export function quarterLabel(state: Pick<MarriageGameState, "turn" | "monthsPerTurn" | "startAge">) {
  if (state.monthsPerTurn === 12) return `第 ${state.turn} 年`;
  const year = Math.floor((state.turn - 1) / 4) + 1;
  const quarter = ["春节前后", "春末", "盛夏", "入秋"][(state.turn - 1) % 4];
  return `第 ${year} 年 · ${quarter}`;
}
