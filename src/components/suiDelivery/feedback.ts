import type { DeliveryGame, Surface } from "./types";

export type FeedbackKind =
  | "jump" | "swing" | "dough" | "stomp" | "metal" | "reflect"
  | "land-stone" | "land-wood" | "land-metal" | "land-cloth"
  | "cloth-tight" | "spring" | "dash" | "steam" | "shot"
  | "cart-start" | "cart-stop" | "warning" | "sweep" | "mechanism"
  | "rope" | "water" | "bird" | "blocked"
  | "order" | "coin" | "star" | "checkpoint" | "kindness" | "clear" | "hurt";

export type DeliveryFeedback = {
  kind: FeedbackKind;
  x: number;
  y: number;
  strength: number;
  time: number;
  age: number;
};

/** Presentation only: no saved progress, physics, hit pause or camera displacement. */
export function feedback(
  s: DeliveryGame,
  kind: FeedbackKind,
  x = s.player.x + 13,
  y = s.player.y + 24,
  strength = 1,
) {
  const cue = { kind, x, y, strength: Math.max(0.2, Math.min(1, strength)), time: s.clock, age: 0 };
  s.events.push(cue);
  s.feedback.push(cue);
  // Manual replays can advance thousands of steps before the renderer consumes them.
  if (s.events.length > 48) s.events.splice(0, s.events.length - 48);
  if (s.feedback.length > 32) s.feedback.splice(0, s.feedback.length - 32);
}

export function landingKind(kind?: Surface["kind"]): FeedbackKind {
  if (kind === "pan" || kind === "belt" || kind === "oven-back" || kind === "cart") return "land-metal";
  if (kind === "awning") return "land-cloth";
  if (kind === "ladder" || kind === "wood") return "land-wood";
  return "land-stone";
}

export function feedbackLife(kind: FeedbackKind) {
  return kind === "warning" ? 0.65 : kind === "swing" || kind === "jump" ? 0.2 : 0.42;
}

export function advanceFeedback(s: DeliveryGame, dt: number) {
  for (const cue of Array.from(new Set([...s.feedback, ...s.events]))) cue.age += dt;
  s.feedback = s.feedback.filter(cue => cue.age < feedbackLife(cue.kind));
  s.events = s.events.filter(cue => cue.age < 0.18);
}
