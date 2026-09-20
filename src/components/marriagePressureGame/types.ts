export type GameMode = "child" | "parent" | "duel";
export type Difficulty = "gentle" | "realistic" | "holiday";
export type Actor = "child" | "parent";
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
  | "jiajia";

export type ChildActionId =
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

export interface MarriageGameState {
  version: 2;
  phase: GamePhase;
  mode: GameMode;
  difficulty: Difficulty;
  seed: number;
  rng: number;
  turn: number;
  maxTurns: number;
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
  | { type: "child-action"; id: ChildActionId }
  | { type: "restart" };
