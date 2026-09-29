import { ACTIVITIES } from "../activities";
import { CHILD_ACTIONS } from "../content";
import type { MarriageGameAction } from "../types";
import type { DatePlan } from "./dialogueTypes";

export interface DayPlan {
  key: string;
  action?: Extract<MarriageGameAction, { type: "child-action" }>;
  date?: DatePlan;
  label: string;
}

// UI plans are separate from the core save: old saves and classic play retain
// their rules. Never restore a plan into a different season or actor's turn.
export function restoreDayPlan(raw: string | null, key: string): DayPlan | null {
  try {
    const value = JSON.parse(raw || "null");
    if (!value || value.key !== key || typeof value.label !== "string") return null;
    if (value.date && !value.action && Object.hasOwn(ACTIVITIES, value.date.activity) && ["meet", "meet-aa"].includes(value.date.payment)) {
      return { key, label: value.label, date: { activity: value.date.activity, payment: value.date.payment } };
    }
    const { action } = value;
    if (!action || value.date || action.type !== "child-action" || !CHILD_ACTIONS.some(item => item.id === action.id)) return null;
    if (action.activity !== undefined && !Object.hasOwn(ACTIVITIES, action.activity)) return null;
    if (action.topic !== undefined && !["everyday", "listen", "plans"].includes(action.topic)) return null;
    return { key, label: value.label, action: { type: "child-action", id: action.id, activity: action.activity, topic: action.topic } };
  } catch { return null; }
}
