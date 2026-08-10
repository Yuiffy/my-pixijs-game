import type { AutoChessEngineSnapshot } from "../core/gameEngine";
import type { GameAction } from "../phaser/EngineBridge";
import type {
  AutopilotPreferenceStyle,
  AutopilotThinkingLevel,
} from "./autopilotPolicy";

export type AutopilotWorkerConfiguration = {
  style: AutopilotPreferenceStyle;
  level: AutopilotThinkingLevel;
};

export type AutopilotWorkerDecisionRequest = {
  type: "decide";
  id: number;
  now: number;
  enabled: boolean;
  startFromTitle: boolean;
  configuration: AutopilotWorkerConfiguration;
  snapshot: AutoChessEngineSnapshot;
};

export type AutopilotWorkerPrewarmRequest = {
  type: "prewarm";
  id: number;
  now: number;
  enabled: boolean;
  configuration: AutopilotWorkerConfiguration;
  prewarmKey: string;
  expandOracleOnTargetRound: boolean;
  /** Present only on the first chunk; continuations reuse the Worker session. */
  snapshot: AutoChessEngineSnapshot | null;
};

export type AutopilotWorkerRequest =
  | AutopilotWorkerDecisionRequest
  | AutopilotWorkerPrewarmRequest;

export type AutopilotWorkerDecisionResponse = {
  type: "decision";
  id: number;
  action: GameAction | null;
  elapsedMs: number;
  error?: string;
};

export type AutopilotWorkerPrewarmResponse = {
  type: "prewarmed";
  id: number;
  prewarmKey: string;
  targetRound: number;
  complete: boolean;
  simulatedActions: number;
  elapsedMs: number;
  error?: string;
};

export type AutopilotWorkerResponse =
  | AutopilotWorkerDecisionResponse
  | AutopilotWorkerPrewarmResponse;
