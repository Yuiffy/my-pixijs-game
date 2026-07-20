import type { StarterId, TraitId, UnitId } from "../core/gameData";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type HitTarget =
  | { kind: "starter"; id: StarterId }
  | { kind: "shop"; index: number; unitId: UnitId | null }
  | { kind: "board"; index: number; unitId: UnitId | null; star?: number }
  | { kind: "bench"; index: number; unitId: UnitId | null; star?: number }
  | { kind: "reroll" | "buyXp" | "lock" | "battle" | "sell" | "restart" }
  | { kind: "enemyPreview"; unitId: UnitId; star: number }
  | { kind: "augment"; index: number }
  | { kind: "fighter"; fid: string; unitId: UnitId; star: number }
  | { kind: "trait"; traitId: TraitId }
  | { kind: "rankingToggle" | "rankingPanel" | "resultContinue" }
  | { kind: "rankingMetric" | "resultMetric"; metric: "damage" | "support" | "taken" }
  | null;

export interface HoverState {
  target: HitTarget;
  x: number;
  y: number;
}

export interface DragState {
  origin: { zone: "board" | "bench"; index: number };
  startX: number;
  startY: number;
  moved: boolean;
}

export interface TraitDragState {
  startX: number;
  startScrollX: number;
  moved: boolean;
}

export interface TraitPillLayout {
  items: Array<{ id: TraitId; rect: Rect; label: string }>;
  maxScrollX: number;
}
