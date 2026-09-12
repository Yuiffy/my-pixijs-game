export const TASK_IDS = ['water', 'toilet', 'food', 'cat', 'audio', 'vts', 'obs'] as const;
export type TaskId = typeof TASK_IDS[number];
export type IncidentId = 'spill' | 'cable' | 'catwalk';
export type ActivityId = TaskId | IncidentId;
export type ControlKey = 'primary' | 'left' | 'right' | 'up' | 'down';
export type InputState = Record<ControlKey, boolean>;
export interface ActivityState {
  id: ActivityId;
  stage: number;
  progress: number;
  cursor: number;
  target: number;
  elapsedMs: number;
  holdMs: number;
  hits: number;
  misses: number;
  sequence: ControlKey[];
}
export interface TaskResult {
  id: TaskId;
  elapsedMs: number;
  stars: number;
  mistakes: number;
}
export interface GameState {
  version: 1;
  phase: 'title' | 'room' | 'activity' | 'countdown' | 'result';
  paused: boolean;
  level: number;
  seed: number;
  rng: number;
  elapsedMs: number;
  countdownMs: number;
  activity: ActivityState | null;
  completed: TaskResult[];
  incidents: IncidentId[];
  incidentQueue: IncidentId[];
  notice: string;
  noticeMs: number;
}
export interface LevelDefinition {
  id: number;
  title: string;
  subtitle: string;
  threeStarMs: number;
  twoStarMs: number;
  incidentCount: number;
}
export interface ActivityView {
  title: string;
  instruction: string;
  hint: string;
  actionLabel: string;
  mode: 'hold' | 'timing' | 'sequence' | 'track' | 'dial';
  progressLabel: string;
  progress: number;
  targetMin: number;
  targetMax: number;
}
export interface Records {
  version: 1;
  best: Record<string, { elapsedMs: number; stars: number }>;
  unlocked: number;
}
