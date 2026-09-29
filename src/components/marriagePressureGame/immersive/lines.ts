import { CANDIDATES } from "../content";
import { INCOMING, previewOf, type MessageSpec } from "./chatScripts";
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

// 这条消息实际发来的气泡序列（按局面哈希挑一种写法）
export function messageSpecs(state: Pick<MarriageGameState, "seed" | "turn">, item: InboxMessage): MessageSpec[] {
  const options = INCOMING[item.kind];
  if (!options?.length) return [{ kind: "text", text: MESSAGE_KINDS[item.kind]?.preview ?? "" }];
  return options[hashKey(state.seed, state.turn, item.id) % options.length];
}

// 经典模式消息面板用的一行摘要，与手机里的内容一致
export function describeMessage(state: Pick<MarriageGameState, "seed" | "turn">, item: InboxMessage) {
  return messageSpecs(state, item).filter(spec => spec.kind !== "system").map(previewOf).join(" ")
    .replaceAll("{name}", "你")
.replaceAll("{partner}", "对方")
.replaceAll("{child}", "孩子");
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
