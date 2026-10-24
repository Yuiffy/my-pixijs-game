import type { CitizenAction } from "./citizens";

export type Locomotion = {
  distance: number;
  phase: number;
  speed: number;
  grounded: boolean;
  velocityY: number;
  landedAt: number;
};
export const createLocomotion = (): Locomotion => ({ distance: 0, phase: 0, speed: 0, grounded: true, velocityY: 0, landedAt: -10 });

// Presentation reads travelled distance and real Rapier contacts, never key state.
// This state is transient: restoring a save starts a fresh, grounded pose.
export function advanceLocomotion(m: Locomotion, moved: number, dt: number, time: number, grounded = true, velocityY = 0) {
  m.speed = moved / dt;
  m.distance += moved;
  if (grounded) m.phase = (m.phase + (moved * Math.PI * 2) / (m.speed > 6 ? 2.8 : 1.8)) % (Math.PI * 2);
  if (grounded && !m.grounded && m.velocityY < -1.5) m.landedAt = time;
  m.grounded = grounded;
  m.velocityY = velocityY;
}

export const LEG = 0.34;
export const HIP = 0.78;
export const ARM = 0.28;
const clamp = (v: number, low: number, high: number) => Math.max(low, Math.min(high, v));

/** Two equal segments in the local Y/Z plane. Knees bend forwards, elbows back. */
export function solveLimb(drop: number, forward: number, length: number, elbow = false) {
  const d = clamp(Math.hypot(drop, forward), 0.01, length * 2 - 0.0001);
  const bend = Math.acos(d / (2 * length));
  const direction = -Math.atan2(forward, drop);
  return { upper: direction + (elbow ? bend : -bend), lower: (elbow ? -2 : 2) * bend };
}
export function limbEnd(upper: number, lower: number, length: number) {
  return {
    y: -length * (Math.cos(upper) + Math.cos(upper + lower)),
    z: -length * (Math.sin(upper) + Math.sin(upper + lower)),
  };
}
export const CRANK_Y = 0.65;
export const CRANK_Z = -0.12;
export const CRANK_RADIUS = 0.13;
export const RIDER_Y = 0.4;
export const RIDER_Z = -0.2;
export const pedalPhase = (distance: number) => distance * 2.4;
export function pedalPoint(phase: number) {
  return { y: CRANK_Y + Math.sin(phase) * CRANK_RADIUS, z: CRANK_Z + Math.cos(phase) * CRANK_RADIUS };
}

type Joint = { upper: number; lower: number; side: number };
export type ActorPose = {
  mode: "idle" | "walk" | "run" | "rise" | "fall" | "land" | "ride" | "fly" | CitizenAction | "watch";
  bob: number;
  lean: number;
  roll: number;
  twist: number;
  head: number;
  leftLeg: Joint;
  rightLeg: Joint;
  leftArm: Joint;
  rightArm: Joint;
};
type PoseInput = {
  time: number;
  phase: number;
  speed: number;
  grounded?: boolean;
  velocityY?: number;
  landedAt?: number;
  action?: CitizenAction;
  watching?: boolean;
  riding?: boolean;
  flying?: boolean;
};
const joint = (upper = 0, lower = 0, side = 0): Joint => ({ upper, lower, side });
export function actorPose(i: PoseInput): ActorPose {
  const moving = i.speed > 0.08;
  const run = i.speed > 6;
  const weight = clamp(i.speed / (run ? 7 : 2), 0, 1);
  const gait = Math.sin(i.phase);
  const landing = Math.max(0, 1 - (i.time - (i.landedAt ?? -10)) / 0.22);
  const p: ActorPose = {
    mode: moving ? run ? "run" : "walk" : "idle",
    bob: moving ? -(1 - Math.abs(gait)) * (run ? 0.08 : 0.035) * weight : Math.sin(i.time * 1.8) * 0.006,
    lean: run ? 0.13 : 0.025 * weight,
    roll: 0,
    twist: gait * 0.055 * weight,
    head: moving ? -gait * 0.025 * weight : Math.sin(i.time * 0.7) * 0.035,
    leftLeg: joint(),
    rightLeg: joint(),
    leftArm: joint(-gait * 0.65 * weight, -0.12 - (run ? 0.8 : 0.2) * weight, -0.035),
    rightArm: joint(gait * 0.65 * weight, -0.12 - (run ? 0.8 : 0.2) * weight, 0.035),
  };
  if (landing > 0 && i.grounded !== false) { p.mode = "land"; p.bob = -0.09 * landing; p.lean += landing * 0.08; }
  for (const [name, offset] of [["leftLeg", 0], ["rightLeg", Math.PI]] as const) {
    const phase = i.phase + offset;
    const footY = 0.1 + Math.max(0, Math.sin(phase)) * (run ? 0.25 : 0.13) * weight;
    const footZ = Math.cos(phase) * (run ? 0.31 : 0.2) * weight;
    p[name] = { ...solveLimb(HIP + p.bob - footY, footZ, LEG), side: 0 };
  }
  if (i.grounded === false) {
    const rising = (i.velocityY || 0) > 0;
    p.mode = rising ? "rise" : "fall";
    p.bob = 0;
    p.lean = rising ? 0.1 : -0.035;
    p.leftLeg = joint(-0.4, 0.9);
    p.rightLeg = joint(rising ? -0.65 : 0.12, rising ? 1.15 : 0.3);
    p.leftArm = joint(-0.45, -0.55, -0.32);
    p.rightArm = joint(-0.45, -0.55, 0.32);
  }
  if (i.flying) {
    p.mode = "fly"; p.bob = Math.sin(i.time * 2) * 0.025;
    p.lean = Math.min(1.1, i.speed / 95); p.twist = 0;
    p.leftLeg = joint(0.1, 0.16); p.rightLeg = joint(0.18, 0.2);
    p.leftArm = joint(0.14, -0.12, -0.18); p.rightArm = joint(0.14, -0.12, 0.18);
  }
  if (i.action === "photo") {
    p.mode = "photo";
    const arm = solveLimb(-0.19, 0.35, ARM, true);
    p.leftArm = { ...arm, side: 0.25 };
    p.rightArm = { ...arm, side: -0.25 };
  } else if (i.action === "stretch") {
    p.mode = "stretch";
    p.roll = Math.sin(i.time * 1.8) * 0.035;
    p.leftArm = joint(-0.12, -0.28, -1.45 - Math.sin(i.time * 1.8) * 0.12);
    p.rightArm = joint(-0.12, -0.28, 1.45 + Math.sin(i.time * 1.8) * 0.12);
  } else if (i.action === "shop") {
    p.mode = "shop";
    p.rightArm = joint(-0.45 + Math.sin(i.time * 2) * 0.08, -0.7);
  }
  if (i.watching) {
    p.mode = "watch";
    p.leftArm = joint(-0.6, -0.9, -0.12 + Math.sin(i.time * 3) * 0.06);
    p.rightArm = joint(-0.6, -0.9, 0.12 - Math.sin(i.time * 3) * 0.06);
  }
  if (i.riding) {
    p.mode = "ride";
    p.bob = 0; p.lean = 0.38; p.roll = 0; p.twist = 0; p.head = 0;
    for (const [name, offset] of [["leftLeg", 0], ["rightLeg", Math.PI]] as const) {
      const foot = pedalPoint(i.phase + offset);
      p[name] = { ...solveLimb(HIP - (foot.y - RIDER_Y + 0.1), foot.z - RIDER_Z, LEG), side: 0 };
    }
    // Hands reach the handlebar after the torso's forward lean is applied.
    const shoulderY = HIP + 0.5 * Math.cos(p.lean);
    const shoulderZ = 0.5 * Math.sin(p.lean);
    const dy = 1.4 - RIDER_Y - shoulderY;
    const dz = 0.46 - RIDER_Z - shoulderZ;
    const drop = -(dy * Math.cos(p.lean) + dz * Math.sin(p.lean));
    const forward = -dy * Math.sin(p.lean) + dz * Math.cos(p.lean);
    const arm = solveLimb(drop, forward, ARM, true);
    p.leftArm = { ...arm, side: 0 }; p.rightArm = { ...arm, side: 0 };
  }
  return p;
}
