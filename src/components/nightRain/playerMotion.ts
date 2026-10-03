import type { AttackId, GameState } from './types';
import { chargeCredit, chargeTime, weaponAttack, weaponMotion } from './weapons';

/** Authored in metres, in the facing frame. Feet stay below the waist, not the chest. */
export type PlayerPose = {
  waistX: number; waistY: number; waistZ: number;
  chestX: number; chestY: number; chestZ: number; headX: number; headY: number;
  handX: number; handY: number; handZ: number;
  weaponX: number; weaponY: number; weaponZ: number; support: number;
  leftX: number; leftY: number; leftZ: number;
  footLX: number; footLY: number; footLZ: number;
  footRX: number; footRY: number; footRZ: number;
};
export const PLAYER_NEUTRAL: PlayerPose = {
  waistX: 0,
waistY: 0,
waistZ: 0,
chestX: 0,
chestY: 0,
chestZ: 0,
headX: 0,
headY: 0,
  handX: 0.36,
handY: 0.92,
handZ: 0.16,
weaponX: 1.05,
weaponY: 0.12,
weaponZ: -0.1,
support: 0,
  leftX: -0.37,
leftY: 0.82,
leftZ: 0.08,
  footLX: -0.16,
footLY: 0.13,
footLZ: 0.04,
footRX: 0.16,
footRY: 0.13,
footRZ: -0.04,
};
const pose = (p: Partial<PlayerPose>): PlayerPose => ({ ...PLAYER_NEUTRAL, ...p });
const clamp = (t: number) => Math.max(0, Math.min(1, t));
const smooth = (t: number) => { const k = clamp(t); return k * k * (3 - 2 * k); };
export function blendPlayerPose(a: PlayerPose, b: PlayerPose, t: number): PlayerPose {
  const out = { ...a }; const k = smooth(t);
  for (const key of Object.keys(out) as (keyof PlayerPose)[]) out[key] += (b[key] - a[key]) * k;
  return out;
}
type Key = [number, PlayerPose];
function sample(keys: Key[], time: number) {
  if (time <= keys[0][0]) return { ...keys[0][1] };
  for (let i = 1; i < keys.length; i += 1) {
    if (time <= keys[i][0]) return blendPlayerPose(keys[i - 1][1], keys[i][1], (time - keys[i - 1][0]) / (keys[i][0] - keys[i - 1][0]));
  }
  return { ...keys[keys.length - 1][1] };
}
const sink = pose({ waistY: -0.07, waistZ: -0.04, chestX: 0.08, chestY: -0.12, handX: 0.21, handY: 1.05, handZ: 0.29, weaponX: 0.7, support: 0.7, footLZ: 0.12, footRZ: -0.12 });
const gather = pose({ waistY: -0.11, waistZ: -0.06, chestX: -0.1, chestY: -0.18, headX: 0.08, headY: 0.1, handX: 0.12, handY: 1.39, handZ: 0.12, weaponX: 0.08, weaponY: -0.1, support: 1, footLZ: 0.17, footRZ: -0.15 });
const raised = pose({ waistY: -0.1, waistZ: -0.035, chestX: -0.17, chestY: -0.14, headX: 0.12, headY: 0.09, handX: 0.1, handY: 1.55, handZ: -0.06, weaponX: -0.48, weaponY: -0.1, support: 1, footLZ: 0.17, footRZ: -0.15 });
const contact = pose({ waistY: -0.14, waistZ: 0.06, chestX: 0.24, chestY: 0.14, headX: -0.12, headY: -0.08, handX: 0.14, handY: 1.02, handZ: 0.39, weaponX: 1.69, weaponY: 0.05, support: 1, footLZ: 0.2, footRZ: -0.14 });
const follow = pose({ waistY: -0.16, waistZ: 0.08, chestX: 0.31, chestY: 0.19, headX: -0.16, headY: -0.1, handX: 0.15, handY: 0.93, handZ: 0.35, weaponX: 1.95, weaponY: 0.06, support: 1, footLZ: 0.2, footRZ: -0.14 });
const recover = pose({ waistY: -0.1, waistZ: 0.025, chestX: 0.17, chestY: 0.08, headX: -0.09, handX: 0.2, handY: 0.96, handZ: 0.3, weaponX: 1.61, support: 0.7, footLZ: 0.12, footRZ: -0.1 });
const brace = pose({ waistY: -0.055, chestY: -0.18, handX: 0.05, handY: 1.18, handZ: 0.38, weaponX: 0.95, weaponZ: -0.9, support: 1, footLZ: 0.13, footRZ: -0.12 });

/** XYZ rotation shared by the rig and the trail; +Y is every weapon's shaft. */
export function rotateWeapon(x: number, y: number, z: number, p: PlayerPose): [number, number, number] {
  const cz = Math.cos(p.weaponZ); const sz = Math.sin(p.weaponZ);
  const cy = Math.cos(p.weaponY); const sy = Math.sin(p.weaponY);
  const cx = Math.cos(p.weaponX); const sx = Math.sin(p.weaponX);
  const xx = cz * x - sz * y; const yy = sz * x + cz * y;
  const xxx = cy * xx + sy * z; const zz = -sy * xx + cy * z;
  return [xxx, cx * yy - sx * zz, sx * yy + cx * zz];
}
export function supportingHand(p: PlayerPose): [number, number, number] {
  const axis = rotateWeapon(0, -0.16, 0, p);
  return [p.leftX + (p.handX + axis[0] - p.leftX) * p.support, p.leftY + (p.handY + axis[1] - p.leftY) * p.support, p.leftZ + (p.handZ + axis[2] - p.leftZ) * p.support];
}
export function weaponPoint(p: PlayerPose, length: number): [number, number, number] {
  const axis = rotateWeapon(0, length, 0, p);
  return [p.handX + axis[0], p.handY + axis[1], p.handZ + axis[2]];
}
export const WEAPON_LENGTHS: Record<GameState['weapon'], number> = { umbrella: 1.17, ironUmbrella: 1.17, katana: 1.26, graveSpear: 2.51, reedDaggers: 0.55, stoneMaul: 1.49 };

/** All release/contact/recovery keys use the equipped weapon's real combat clock. */
export function samplePlayerAttack(s: GameState, id: AttackId, time: number): PlayerPose {
  const spec = weaponAttack(s, id); const heavy = ['heavy', 'charged', 'sprintHeavy', 'airHeavy'].includes(id);
  const hit = spec.impact; const end = spec.duration; const activeEnd = hit + spec.active;
  if (s.weapon === 'graveSpear') {
    const prepared = id === 'charged' ? samplePlayerAttack(s, 'heavy', chargeCredit(s, chargeTime(s))) : PLAYER_NEUTRAL;
    const wind = pose({ waistY: -0.075, chestY: -0.14, handX: 0.16, handY: 1.08, handZ: 0.13, weaponX: 1.51, weaponY: 0, weaponZ: 0, support: 1, footLZ: 0.16, footRZ: -0.14 });
    const strike = pose({ ...wind, chestY: 0.12, waistZ: 0.07, handZ: 0.43 });
    return sample([[0, prepared], [hit * 0.65, wind], [hit, strike], [activeEnd, strike], [end, PLAYER_NEUTRAL]], time);
  }
  let out: PlayerPose;
  if (heavy) {
    const prepared = id === 'charged' ? samplePlayerAttack(s, 'heavy', chargeCredit(s, chargeTime(s))) : PLAYER_NEUTRAL;
    const fast = weaponMotion(s) === 'rainCut';
    out = sample([
      [0, prepared], [hit * 0.18, id === 'charged' ? prepared : sink],
      [hit * 0.36, id === 'charged' ? prepared : gather], [hit * 0.5, raised], [hit - Math.min(0.16, hit * 0.42), raised],
      [hit, contact], [activeEnd, follow], [activeEnd + (end - activeEnd) * 0.48, recover], [end, PLAYER_NEUTRAL],
    ], time);
    if (fast) { const weight = smooth(time / (hit * 0.4)) * (1 - smooth((time - activeEnd) / (end - activeEnd))); out.chestY += (id === 'sprintHeavy' ? Math.sin((time / hit) * 3.1) * 0.85 : -0.25) * weight; out.weaponY += (id === 'sprintHeavy' ? -0.95 + 1.8 * clamp(time / hit) : 0.22) * weight; }
  } else {
    const reverse = id === 'light2'; const lift = id === 'light3'; const thrust = id === 'sprintLight';
    const wind = pose({ waistY: -0.045, chestY: reverse ? 0.32 : -0.32, handX: reverse ? -0.02 : 0.44, handY: 1.1, handZ: 0.24, weaponX: lift ? 2.05 : 1.18, weaponY: reverse ? 1.05 : -1.05, support: 0.45, footLZ: 0.12, footRZ: -0.1 });
    const strike = pose({ waistY: -0.065, waistZ: 0.03, chestX: 0.09, chestY: reverse ? -0.12 : 0.12, handX: 0.15, handY: 1.08, handZ: 0.44, weaponX: lift ? 0.78 : 1.45, weaponY: 0, support: 0.35, footLZ: 0.16, footRZ: -0.12 });
    const through = pose({ waistY: -0.04, chestY: reverse ? -0.36 : 0.36, handX: reverse ? 0.45 : -0.04, handY: lift ? 1.4 : 1.07, handZ: 0.24, weaponX: lift ? 0.2 : 1.35, weaponY: reverse ? -1.1 : 1.1, support: 0, footLZ: 0.12, footRZ: -0.1 });
    if (thrust) { wind.weaponY = 0; through.weaponY = 0; wind.handZ = 0.1; through.handZ = 0.4; }
    out = sample([[0, PLAYER_NEUTRAL], [hit * 0.65, wind], [hit, strike], [activeEnd, through], [end, PLAYER_NEUTRAL]], time);
  }
  return out;
}

export function samplePlayerMotion(s: GameState, speed = 0, stride = 0, localX = 0, localZ = 1): PlayerPose {
  const p = s.player;
  if (p.action === 'charge') return samplePlayerAttack(s, 'heavy', chargeCredit(s, p.charge));
  if (p.attack && ['light', 'heavy'].includes(p.action)) return samplePlayerAttack(s, p.attack, p.actionTime);
  if (p.action === 'guard') return blendPlayerPose(brace, pose({ ...brace, waistY: -0.1, chestX: -0.16, handZ: 0.28 }), p.guardImpact / 0.24);
  if (p.action === 'guardRelease') return blendPlayerPose(brace, PLAYER_NEUTRAL, p.actionTime / 0.16);
  if (p.action === 'parry') return sample([[0, PLAYER_NEUTRAL], [0.08, brace], [0.2, pose({ ...brace, chestY: 0.26, handX: 0.37, weaponY: 0.75, weaponZ: -0.45 })], [0.3, brace], [0.52, PLAYER_NEUTRAL]], p.actionTime);
  if (p.action === 'heal') return sample([[0, PLAYER_NEUTRAL], [0.3, pose({ handX: 0.09, handY: 1.42, handZ: 0.32, chestX: -0.045, leftY: 1.08, leftZ: 0.28 })], [0.85, pose({ handX: 0.09, handY: 1.42, handZ: 0.32, chestX: -0.045 })], [1.12, PLAYER_NEUTRAL]], p.actionTime);
  if (p.action === 'hurt' || p.action === 'guardBreak') return blendPlayerPose(pose({ waistY: -0.12, chestX: -0.23, chestY: -0.18, handY: 1.12, weaponX: 0.55 }), PLAYER_NEUTRAL, (p.actionTime - 0.1) / (p.action === 'hurt' ? 0.38 : 0.8));
  if (p.action === 'execute') return samplePlayerAttack(s, 'heavy', (p.actionTime / 0.95) * weaponAttack(s, 'heavy').duration);
  const out = { ...PLAYER_NEUTRAL }; const amount = clamp(speed / 3.55);
  const wave = Math.sin(stride); const back = Math.sin(stride + Math.PI);
  out.waistY = -0.05 * amount - Math.abs(wave) * 0.02 * amount;
  out.chestX = amount * (p.sprintTime > 0.1 ? 0.11 : 0.045); out.chestY = wave * amount * 0.055; out.headY = -out.chestY * 0.65;
  const step = 0.24 * amount; const lift = 0.105 * amount;
  out.footLX += Math.cos(stride) * step * localX; out.footLZ += Math.cos(stride) * step * localZ; out.footLY += Math.max(0, wave) * lift;
  out.footRX -= Math.cos(stride) * step * localX; out.footRZ -= Math.cos(stride) * step * localZ; out.footRY += Math.max(0, back) * lift;
  out.leftZ += wave * 0.12 * amount; out.handZ -= wave * 0.065 * amount; out.weaponX += wave * amount * 0.06;
  if (p.jumpHeight > 0) { out.footLY += 0.19; out.footLZ += 0.17; out.footRY += 0.07; out.footRZ -= 0.1; out.chestX = -0.05; }
  out.waistY -= Math.sin((p.landing / 0.18) * Math.PI) * 0.09;
  return out;
}
export function playerMotionPhase(s: GameState) {
  const p = s.player; const spec = p.attack ? weaponAttack(s, p.attack) : null;
  return { module: weaponMotion(s), phase: spec ? p.actionTime < spec.impact - 0.08 ? 'prepare' : p.actionTime < spec.impact ? 'release' : p.actionTime < spec.impact + spec.active ? 'contact' : 'recover' : p.action, impact: spec?.impact, duration: spec?.duration, chargeLimit: chargeTime(s) };
}
