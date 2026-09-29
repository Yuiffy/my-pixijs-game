import type { ActivityId, ChildActionId, InboxSender, MarriageGameAction } from "../types";
import type { ChatId, PhoneApp } from "./sceneRouter";

// 聊天气泡：文字、语音、转账、名片、朋友圈转发、图片、通话记录、系统提示
export type BubbleKind = "text" | "voice" | "transfer" | "card" | "moment" | "image" | "call" | "system";

export interface ChatBubble {
  id: string;
  mine: boolean;
  kind: BubbleKind;
  text: string;
  meta?: string;
}

export interface DialogueChoice {
  id: string;
  label: string;
  hint?: string;
  // 选中后我发出去的那句话
  reply?: string;
  next?: string;
  action?: MarriageGameAction;
  // 结婚、生育、离婚等人生决定先确认
  confirm?: ChildActionId;
  openApp?: PhoneApp;
  close?: boolean;
}

export interface DialogueNode {
  id: string;
  lines: ChatBubble[];
  choices: DialogueChoice[];
}

export interface DialogueScript {
  chat: ChatId;
  start: string;
  nodes: Record<string, DialogueNode>;
}

export const SENDER_CHAT: Record<InboxSender, ChatId> = {
  mom: "mom",
  dad: "dad",
  "family-group": "family",
  matchmaker: "matchmaker",
  boss: "work",
  candidate: "candidate",
  partner: "candidate",
  child: "child",
  sisters: "sisters",
  landlord: "landlord",
};

export interface DatePlan {
  activity: ActivityId;
  payment: "meet" | "meet-aa";
}
