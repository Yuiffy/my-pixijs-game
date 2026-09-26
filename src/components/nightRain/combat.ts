import type { AttackId, Player } from './types';

/** One timeline drives damage, steering, cancel windows and the visible pose. Seconds/metres. */
export type AttackSpec = {
  name: string; impact: number; active: number; duration: number; cancel: number;
  cost: number; damage: number; posture: number; range: number; arc: number;
  advance: number; turn: number; color: string;
};
export const ATTACKS: Record<AttackId, AttackSpec> = {
  light1: { name: '横斩', impact: 0.22, active: 0.09, duration: 0.5, cancel: 0.34, cost: 17, damage: 24, posture: 21, range: 2.25, arc: 1.05, advance: 0.16, turn: 1.05, color: '#bfe9ff' },
  light2: { name: '返斩', impact: 0.19, active: 0.1, duration: 0.46, cancel: 0.32, cost: 17, damage: 26, posture: 23, range: 2.3, arc: 1.15, advance: 0.22, turn: 1.05, color: '#bfe9ff' },
  light3: { name: '踏步挑斩', impact: 0.3, active: 0.12, duration: 0.66, cancel: 0.49, cost: 21, damage: 33, posture: 34, range: 2.5, arc: 0.95, advance: 0.4, turn: 0.9, color: '#dfcaff' },
  heavy: { name: '举伞重劈', impact: 0.49, active: 0.12, duration: 0.86, cancel: 0.65, cost: 31, damage: 41, posture: 45, range: 2.7, arc: 0.82, advance: 0.28, turn: 0.8, color: '#ffc981' },
  charged: { name: '蓄满 · 破雨', impact: 0.27, active: 0.15, duration: 0.88, cancel: 0.68, cost: 12, damage: 68, posture: 78, range: 2.95, arc: 1.2, advance: 0.55, turn: 0.55, color: '#ffe4a6' },
  sprintLight: { name: '疾行突刺', impact: 0.26, active: 0.1, duration: 0.62, cancel: 0.45, cost: 22, damage: 30, posture: 29, range: 2.65, arc: 0.55, advance: 1.15, turn: 0.6, color: '#9fe9ff' },
  sprintHeavy: { name: '疾行回旋', impact: 0.4, active: 0.15, duration: 0.86, cancel: 0.66, cost: 34, damage: 43, posture: 48, range: 2.7, arc: 1.5, advance: 0.9, turn: 0.7, color: '#ffd092' },
  airLight: { name: '腾空横斩', impact: 0.18, active: 0.14, duration: 0.55, cancel: 0.45, cost: 18, damage: 29, posture: 30, range: 2.4, arc: 1.2, advance: 0, turn: 0.8, color: '#b6eaff' },
  airHeavy: { name: '落雨重击', impact: 0.3, active: 0.15, duration: 0.8, cancel: 0.64, cost: 32, damage: 46, posture: 60, range: 2.7, arc: 1.1, advance: 0, turn: 0.65, color: '#ffe1ac' },
};
export const CHARGE_TIME = 0.75;
export const DASH_HOLD_TIME = 0.2;
export const BUFFER_TIME = 0.22;
export const PARRY_WINDOW = 0.25;
export function attackSpec(p: Player): AttackSpec | null { return p.attack ? ATTACKS[p.attack] : null; }

// Full-body, authored key poses: body pitch/twist/crouch, right arm xyz,
// supporting arm x/z, and asymmetric legs. Interpolation never changes hit timing.
export type Pose = { lean: number; twist: number; crouch: number; ax: number; ay: number; az: number; lx: number; lz: number; legL: number; legR: number };
const idle: Pose = { lean: 0, twist: 0, crouch: 0, ax: 0, ay: 0, az: -0.08, lx: 0, lz: 0, legL: 0, legR: 0 };
const pose = (values: Partial<Pose>): Pose => ({ ...idle, ...values });
const KEYS: Record<AttackId, [Pose, Pose, Pose]> = {
  light1: [pose({ twist: -0.6, ax: -0.85, ay: -1.1, az: -1.25, lx: -0.4, legL: -0.25 }), pose({ twist: 0.65, ax: -1.25, ay: 1.4, az: -0.35, lx: 0.4, legR: -0.3 }), pose({ twist: 0.3, ax: -0.7, ay: 0.8, az: -0.25 })],
  light2: [pose({ twist: 0.55, ax: -1.2, ay: 1.3, az: -0.3, legR: -0.25 }), pose({ twist: -0.7, ax: -0.7, ay: -1.4, az: -1.15, lx: -0.6, legL: -0.35 }), pose({ twist: -0.3, ax: -0.5, ay: -0.7, az: -0.55 })],
  light3: [pose({ lean: 0.25, crouch: -0.18, ax: 0.65, ay: -0.5, az: -0.5, legL: 0.4, legR: -0.5 }), pose({ lean: -0.15, twist: 0.4, ax: -2.6, az: -0.15, lx: -1.3, legL: -0.5, legR: 0.3 }), pose({ ax: -1.8, lean: -0.07, twist: 0.2 })],
  heavy: [pose({ lean: -0.16, crouch: -0.13, ax: -2.95, az: -0.22, lx: -2.6, lz: 0.65, legL: -0.3, legR: 0.3 }), pose({ lean: 0.4, crouch: -0.23, ax: -0.25, az: 0.08, lx: -0.6, lz: 0.65, legL: -0.65, legR: 0.4 }), pose({ lean: 0.22, crouch: -0.13, ax: -0.45, lx: -0.4, legL: -0.3 })],
  charged: [pose({ lean: -0.24, crouch: -0.22, twist: -0.35, ax: -3.1, az: -0.35, lx: -2.8, lz: 0.75, legL: -0.4, legR: 0.45 }), pose({ lean: 0.55, crouch: -0.32, twist: 0.4, ax: 0.2, az: 0.1, lx: -0.3, lz: 0.65, legL: -0.75, legR: 0.5 }), pose({ lean: 0.3, crouch: -0.16, ax: -0.3, lx: -0.4, legL: -0.4 })],
  sprintLight: [pose({ lean: 0.2, twist: -0.35, ax: -0.1, ay: -0.25, az: -0.5, lx: 0.6, legL: -0.65, legR: 0.7 }), pose({ lean: 0.35, twist: 0.25, ax: -1.55, az: 0.05, lx: 0.9, legL: -0.85, legR: 0.45 }), pose({ lean: 0.12, ax: -1.1, legL: -0.3 })],
  sprintHeavy: [pose({ lean: 0.15, twist: -1, ax: -0.9, ay: -1.2, az: -1.45, lx: -0.7, legL: -0.4 }), pose({ lean: 0.2, twist: 1.25, ax: -1.2, ay: 1.4, az: -0.3, lx: 0.7, legR: -0.6 }), pose({ twist: 0.6, ax: -0.8, ay: 0.65, legR: -0.25 })],
  airLight: [pose({ lean: -0.15, twist: -0.55, ax: -0.8, ay: -1, az: -1.2, lx: -0.8, legL: -1, legR: 0.55 }), pose({ twist: 0.7, ax: -1.1, ay: 1.4, az: -0.35, lx: 0.7, legL: -0.65, legR: 0.8 }), pose({ ax: -0.8, twist: 0.25, legL: -0.4, legR: 0.3 })],
  airHeavy: [pose({ lean: -0.22, ax: -3, az: -0.25, lx: -2.7, lz: 0.6, legL: -1, legR: -0.7 }), pose({ lean: 0.5, crouch: -0.28, ax: 0.05, lx: -0.5, lz: 0.7, legL: -0.65, legR: 0.6 }), pose({ lean: 0.25, crouch: -0.18, ax: -0.3, legL: -0.4, legR: 0.25 })],
};
function blend(a: Pose, b: Pose, t: number): Pose {
  const result = { ...a }; const k = Math.max(0, Math.min(1, t)); const smooth = k * k * (3 - 2 * k);
  for (const key of Object.keys(result) as (keyof Pose)[]) result[key] += (b[key] - a[key]) * smooth;
  return result;
}
const brace = pose({ lean: 0.12, twist: -0.2, crouch: -0.06, ax: -1.35, ay: -0.6, az: 0.65, lx: -1.25, lz: -0.5, legL: -0.25, legR: 0.22 });
const draw = pose({ lean: 0.16, twist: -0.38, crouch: -0.08, ax: -1.5, ay: -0.9, az: 0.4, lx: -0.8, lz: -0.35, legL: -0.3, legR: 0.2 });
const deflect = pose({ lean: -0.08, twist: 0.38, crouch: -0.03, ax: -1.15, ay: 0.65, az: -0.9, lx: -0.45, lz: 0.3, legL: -0.15, legR: 0.3 });
const recoil = pose({ lean: -0.2, twist: -0.32, crouch: -0.12, ax: -1.7, ay: -0.65, az: 0.55, lx: -1.6, lz: -0.4, legL: -0.4, legR: 0.3 });

/** A pelvis-centred somersault; the last third plants the feet and stands up. */
export function rollPose(time: number) {
  const smooth = (t: number) => { const k = Math.max(0, Math.min(1, t)); return k * k * (3 - 2 * k); };
  const tuck = smooth(time / 0.1) * (1 - smooth((time - 0.4) / 0.24));
  return { angle: Math.PI * 2 * smooth((time - 0.035) / 0.46), tuck, height: 0.97 - 0.22 * tuck };
}
export function combatPose(p: Player): Pose | null {
  if (p.action === 'parry') {
    const t = p.actionTime;
    const motion = t < 0.08 ? blend(idle, draw, t / 0.08) : t < 0.2 ? blend(draw, deflect, (t - 0.08) / 0.12) : t < PARRY_WINDOW ? blend(deflect, brace, (t - 0.2) / 0.05) : blend(brace, idle, (t - PARRY_WINDOW) / (0.52 - PARRY_WINDOW));
    return blend(motion, deflect, p.parryFlash / 0.3);
  }
  if (p.action === 'guard') return blend(brace, recoil, p.guardImpact / 0.24);
  if (p.action === 'guardRelease') return blend(brace, idle, p.actionTime / 0.16);
  if (p.action === 'guardBreak') return blend(pose({ lean: -0.38, twist: 0.25, crouch: -0.12, ax: -2.1, az: -1.2, lx: -0.9, lz: 0.8, legL: -0.5, legR: 0.4 }), idle, (p.actionTime - 0.25) / 0.65);
  if (p.action === 'charge') return blend(KEYS.heavy[0], KEYS.charged[0], p.charge / CHARGE_TIME);
  const spec = attackSpec(p); if (!spec || !p.attack) return null;
  const [wind, strike, settle] = KEYS[p.attack]; const t = p.actionTime;
  const start = p.attack === 'charged' ? KEYS.charged[0] : idle;
  if (t < spec.impact - 0.07) return blend(start, wind, t / Math.max(0.01, spec.impact - 0.07));
  if (t < spec.impact + spec.active) return blend(wind, strike, (t - spec.impact + 0.07) / (spec.active + 0.07));
  if (t < spec.cancel) return blend(strike, settle, (t - spec.impact - spec.active) / Math.max(0.01, spec.cancel - spec.impact - spec.active));
  return blend(settle, idle, (t - spec.cancel) / (spec.duration - spec.cancel));
}
