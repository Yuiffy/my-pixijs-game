import type { MoveDefinition } from "./roster";

export interface AirAttack {
  row: number;
  rank: number;
  box: readonly [number, number];
  landing: number;
  landingMiss: number;
  minHeight?: number;
  velocity?: number;
  descent?: number;
}

export const AIR_PHYSICS = {
  takeoff: 780,
  gravity: 1680,
  drift: 1.05,
  steering: 420,
  emptyLanding: 3 / 60,
  maxAttacks: 3,
} as const;

/** Jump normals share the existing attack buttons; assist also works in the air. */
export function airMoveForAction(action: string): string | null {
  if (action === "punch") return "airPunch";
  if (action === "kick") return "airKick";
  if (action === "heavy") return "airHeavy";
  if (action === "skill" || action === "rise") return "airSignature";
  return null;
}

export const AIR_MOVES: Readonly<Record<string, MoveDefinition>> = {
  airPunch: {
    id: "airPunch",
    name: "空中轻掌",
    kind: "strike",
    height: "mid",
    startup: 5 / 60,
    active: 7 / 60,
    recovery: 10 / 60,
    damage: 14,
    reach: 156,
    stun: 0.29,
    push: 10,
    overhead: true,
    blockStun: 0.19,
    air: {
      row: 0,
      rank: 1,
      box: [-300, -200],
      landing: 3 / 60,
      landingMiss: 6 / 60,
    },
  },
  airKick: {
    id: "airKick",
    name: "空中横踢",
    kind: "strike",
    height: "mid",
    startup: 8 / 60,
    active: 10 / 60,
    recovery: 13 / 60,
    damage: 21,
    reach: 198,
    stun: 0.34,
    push: 17,
    overhead: true,
    tracking: true,
    blockStun: 0.22,
    air: {
      row: 1,
      rank: 2,
      box: [-275, -160],
      landing: 4 / 60,
      landingMiss: 7 / 60,
    },
  },
  airHeavy: {
    id: "airHeavy",
    name: "空中下劈",
    kind: "strike",
    height: "mid",
    startup: 11 / 60,
    active: 12 / 60,
    recovery: 18 / 60,
    damage: 28,
    reach: 210,
    stun: 0.37,
    push: 34,
    overhead: true,
    tracking: true,
    blockStun: 0.24,
    guardDamage: 19,
    air: {
      row: 2,
      rank: 3,
      box: [-155, -15],
      landing: 5 / 60,
      landingMiss: 9 / 60,
    },
  },
  airSignature: {
    id: "airSignature",
    name: "猫袭落掌",
    kind: "skill",
    height: "mid",
    startup: 10 / 60,
    active: 14 / 60,
    recovery: 20 / 60,
    damage: 26,
    reach: 176,
    stun: 0.32,
    push: 34,
    overhead: true,
    blockStun: 0.2,
    guardDamage: 18,
    air: {
      row: 3,
      rank: 4,
      box: [-190, -35],
      landing: 12 / 60,
      landingMiss: 16 / 60,
      minHeight: 65,
      velocity: 400,
      descent: 430,
    },
  },
};
