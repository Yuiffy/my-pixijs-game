export type FanKind = "support" | "rational" | "chaos" | "casual";
export type ReplyStyle = "agree" | "explain" | "confront";
export type ActionId = "sing" | "game" | "movie" | "moderate";
export type Phase =
  | "lobby"
  | "topic"
  | "continue"
  | "reply"
  | "reward"
  | "ended";

export interface ChatComment {
  user: string;
  kind: FanKind;
  text: string;
}

export interface TopicBeat {
  label: string;
  text: string;
  risk: number;
  heat: number;
  comments: ChatComment[];
}

export interface Topic {
  id: string;
  title: string;
  category: string;
  icon: string;
  teaser: string;
  difficulty: "轻松" | "微妙" | "高能";
  beats: [TopicBeat, TopicBeat, TopicBeat];
}

export interface Perk {
  id: string;
  title: string;
  icon: string;
  description: string;
}

export interface ActionCard {
  id: ActionId;
  title: string;
  icon: string;
  quote: string;
  description: string;
}

export interface StreamState {
  version: 1;
  phase: Phase;
  seed: number;
  rng: number;
  act: number;
  completedTopics: number;
  topicOptions: string[];
  usedTopics: string[];
  activeTopic: string | null;
  beat: number;
  fans: Record<FanKind, number>;
  heat: number;
  trust: number;
  risk: number;
  energy: number;
  control: number;
  peakViewers: number;
  actions: Record<ActionId, number>;
  perks: string[];
  rewardOptions: string[];
  remainingMs: number;
  timed: boolean;
  silenceCount: number;
  resolvedBeats: number;
  confrontations: number;
  ignoredConcerns: number;
  interruptions: number;
  moderatedBeat: string | null;
  lastReply: string;
  lastEvent: string;
  log: string[];
  ending: string | null;
  score: number;
}

export type GameAction =
  | { type: "start"; seed: number; timed: boolean; perk?: string }
  | { type: "topic"; id: string }
  | { type: "continue" }
  | { type: "reply"; index: number; style: ReplyStyle }
  | { type: "action"; id: ActionId }
  | { type: "reward"; id: string }
  | { type: "tick"; ms: number };
