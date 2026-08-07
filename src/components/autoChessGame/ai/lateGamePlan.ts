import type { PlayerLevel, UnitId } from "../core/gameData";

export type LateGameTarget = {
  id: UnitId;
  priority: number;
  desiredStar: 2 | 3;
  role: "terminal" | "transition";
};

export const AUTOPILOT_LATE_GAME_TARGETS: readonly LateGameTarget[] = [
  { id: "grove_mender", priority: 100, desiredStar: 3, role: "terminal" },
  { id: "lian", priority: 96, desiredStar: 3, role: "terminal" },
  { id: "rei", priority: 92, desiredStar: 3, role: "terminal" },
  { id: "yua", priority: 88, desiredStar: 3, role: "terminal" },
  { id: "cinder_ram", priority: 84, desiredStar: 3, role: "terminal" },
  { id: "spark_mage", priority: 80, desiredStar: 3, role: "terminal" },
  { id: "sui_flower", priority: 76, desiredStar: 3, role: "terminal" },
  { id: "xuehui", priority: 72, desiredStar: 3, role: "terminal" },
  { id: "sui_bird", priority: 68, desiredStar: 3, role: "terminal" },
  { id: "yukisyo", priority: 64, desiredStar: 3, role: "terminal" },
] as const;

export const AUTOPILOT_TERMINAL_TARGETS = AUTOPILOT_LATE_GAME_TARGETS
  .filter(({ role }) => role === "terminal");

export const AUTOPILOT_TERMINAL_TARGET_IDS = AUTOPILOT_TERMINAL_TARGETS
  .map(({ id }) => id);

export const AUTOPILOT_LATE_GAME_TARGET_IDS = AUTOPILOT_LATE_GAME_TARGETS
  .map(({ id }) => id);

const LATE_GAME_TARGET_PRIORITY = new Map(
  AUTOPILOT_LATE_GAME_TARGETS.map(({ id, priority }) => [id, priority]),
);

const LATE_GAME_TARGET_DESIRED_STAR = new Map(
  AUTOPILOT_LATE_GAME_TARGETS.map(({ id, desiredStar }) => [id, desiredStar]),
);

export const lateGameTargetPriority = (id: UnitId) => (
  LATE_GAME_TARGET_PRIORITY.get(id) || 0
);

export const lateGameTargetDesiredStar = (id: UnitId) => (
  LATE_GAME_TARGET_DESIRED_STAR.get(id) || null
);

export const lateGameTargetDesiredCopies = (id: UnitId) => {
  const star = lateGameTargetDesiredStar(id);
  return star === 3 ? 9 : star === 2 ? 3 : 0;
};

export const isAutopilotTerminalTarget = (id: UnitId) => (
  AUTOPILOT_TERMINAL_TARGET_IDS.includes(id)
);

export const desiredLateGameLevelForRound = (round: number): PlayerLevel => {
  if (round >= 18) return 10;
  if (round >= 15) return 9;
  if (round >= 12) return 8;
  return 3;
};
