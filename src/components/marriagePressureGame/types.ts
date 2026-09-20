export type GameMode = "child" | "parent" | "duel";
export type Difficulty = "gentle" | "realistic" | "holiday";
export type Actor = "child" | "parent";
export type MeetingTopic = "everyday" | "listen" | "plans";
export type GamePhase = "lobby" | "candidate" | "turn" | "ended";
export type RelationshipStage =
  | "single"
  | "chatting"
  | "dating"
  | "married"
  | "parenthood";

export type CandidateId =
  | "sui"
  | "shiori"
  | "kloa"
  | "liko"
  | "izayoi"
  | "xuehui"
  | "hazel"
  | "nana7mi"
  | "azi"
  | "lin"
  | "qiao"
  | "chen"
  | "zhou"
  | "xu"
  | "tang"
  | "rift_stalker"
  | "cog_scribe"
  | "mossback"
  | "spark_mage"
  | "clock_gunner"
  | "dawn_duelist"
  | "yua"
  | "seki_boar_king"
  | "sumi"
  | "mitsuri"
  | "guangyi"
  | "nagisa"
  | "tower_god"
  | "nori"
  | "meme"
  | "zeyin"
  | "kioi"
  | "nightin"
  | "tiandou"
  | "youyi"
  | "akirinco"
  | "lovely"
  | "komichi"
  | "mumu"
  | "yukisyo"
  | "rei"
  | "rutice"
  | "lian"
  | "pako"
  | "miki_guest"
  | "hatsuse_guest";

export type ChildActionId =
  | "chat-listen"
  | "chat-share"
  | "chat-checklist"
  | "meet-aa"
  | "meet"
  | "invest"
  | "next"
  | "boundary"
  | "work"
  | "marry"
  | "delay"
  | "baby"
  | "childfree"
  | "build-home"
  | "simple-wedding"
  | "budget"
  | "ask-help"
  | "rest"
  | "separate"
  | "protect-child";

export type ParentActionId =
  | "push-meet"
  | "compare"
  | "encourage"
  | "next"
  | "push-marriage"
  | "push-baby"
  | "push-education"
  | "support"
  | "listen";

export interface Candidate {
  id: CandidateId;
  name: string;
  subtitle: string;
  image: string;
  resume: number;
  compatibility: number;
  initialIntent: number;
  cityCost: number;
  tags: string[];
  boundary: string;
  opening: string;
}

export interface EconomyEvent {
  id: string;
  title: string;
  detail: string;
  savings: number;
  career: number;
  stress: number;
}

export interface ActionDefinition<T extends string> {
  id: T;
  title: string;
  detail: string;
  hint: string;
}

export interface Scores {
  child: number;
  parent: number;
  family: number;
}

export interface Ending {
  id: string;
  title: string;
  kicker: string;
  description: string;
  color: string;
}

export type ResolutionKind = "choice" | "reality" | "family" | "response" | "match" | "household";

export type ResolutionMetric =
  | "understanding"
  | "familyReserve"
  | "stress"
  | "autonomy"
  | "familyBond"
  | "savings"
  | "career"
  | "relation"
  | "mutualIntent"
  | "pressure"
  | "parentFace"
  | "support"
  | "weddingDebt"
  | "nextGenStress";

export interface ResolutionChange {
  key: ResolutionMetric;
  label: string;
  before: number;
  after: number;
  delta: number;
}

export interface ResolutionStep {
  kind: ResolutionKind;
  title: string;
  detail: string;
  changes: ResolutionChange[];
}

export interface GameResolution {
  state: MarriageGameState;
  steps: ResolutionStep[];
}

export interface MarriageGameState {
  version: 4;
  familyReserve: number;
  monthsPerTurn: 3 | 12;
  understanding: number;
  chemistry: number;
  matchClosed: boolean;
  datingFeedback: string;
  lifestyle: "usual" | "lean";
  budgetAgreed: boolean;
  moneyStrainTurns: number;
  burnoutTurns: number;
  conflictTurns: number;
  recoveryGranted: boolean;
  partnerNote: string;
  phase: GamePhase;
  mode: GameMode;
  difficulty: Difficulty;
  seed: number;
  rng: number;
  turn: number;
  maxTurns: number;
  startAge: number;
  marriedAtTurn: number | null;
  parenthoodAtTurn: number | null;
  activeActor: Actor;
  selectionKind: "opening" | "replace";
  candidateId: CandidateId | null;
  candidateOptions: CandidateId[];
  rejectedCandidates: CandidateId[];
  currentEventId: string | null;
  stage: RelationshipStage;
  stress: number;
  autonomy: number;
  familyBond: number;
  savings: number;
  career: number;
  relation: number;
  mutualIntent: number;
  pressure: number;
  parentFace: number;
  support: number;
  weddingDebt: number;
  nextGenStress: number;
  meetings: number;
  boundaries: number;
  coerciveMoves: number;
  supportiveMoves: number;
  childPlan: "unknown" | "delay" | "childfree" | "ready";
  lastParentAction: ParentActionId | null;
  lastChildAction: ChildActionId | null;
  lastEvent: string;
  log: string[];
  ending: string | null;
  scores: Scores;
}

export type MarriageGameAction =
  | {
      type: "start";
      mode: GameMode;
      difficulty: Difficulty;
      seed: number;
    }
  | { type: "candidate"; id: CandidateId }
  | { type: "parent-action"; id: ParentActionId }
  | { type: "child-action"; id: ChildActionId; topic?: MeetingTopic }
  | { type: "restart" };
