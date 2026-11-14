import { ENEMY_NEUTRAL, enemyMotion, enemyMotionIdentity, enemyTiming, enemyAttack, type EnemyMotionIdentity, type EnemyPose } from './enemyCombat';
import type { Enemy } from './types';

type Bearing = { stride: number; swing: number; bob: number; roll: number; breath: number; rest: Partial<EnemyPose> };
const BEARINGS: Record<EnemyMotionIdentity, Bearing> = {
  skirmisher: { stride: 1.75, swing: 0.42, bob: 0.024, roll: 0.028, breath: 1.7, rest: { lean: 0.055, ax: -0.22, lx: -0.12, elbow: -0.2, stance: 0.035 } },
  bulwark: { stride: 1.3, swing: 0.25, bob: 0.012, roll: 0.022, breath: 1.15, rest: { lean: 0.065, crouch: -0.035, ax: -0.28, lx: -0.75, leftElbow: -0.45, lz: 0.16, stance: 0.12 } },
  blade: { stride: 2.05, swing: 0.36, bob: 0.013, roll: 0.018, breath: 1.4, rest: { crouch: -0.025, twist: -0.1, ax: -0.18, ay: -0.12, lx: -0.26, elbow: -0.24, stance: 0.065 } },
  pike: { stride: 1.55, swing: 0.29, bob: 0.012, roll: 0.012, breath: 1.25, rest: { lean: 0.045, ax: -0.58, lx: -0.65, elbow: -0.35, leftElbow: -0.35, stance: 0.075 } },
  reaper: { stride: 1.9, swing: 0.37, bob: 0.022, roll: 0.035, breath: 1.15, rest: { lean: 0.09, twist: -0.09, ax: -0.18, lx: -0.14, elbow: -0.25, stance: 0.065 } },
  staff: { stride: 1.6, swing: 0.3, bob: 0.018, roll: 0.018, breath: 1.4, rest: { lean: 0.025, ax: -0.45, lx: -0.53, elbow: -0.28, leftElbow: -0.35, stance: 0.07 } },
  crossbow: { stride: 1.25, swing: 0.22, bob: 0.01, roll: 0.012, breath: 1.55, rest: { lean: 0.025, ax: -0.82, lx: -0.88, elbow: -0.4, leftElbow: -0.42, stance: 0.065 } },
  slinger: { stride: 1.45, swing: 0.3, bob: 0.016, roll: 0.025, breath: 1.6, rest: { lean: 0.035, ax: -0.2, lx: -0.48, leftElbow: -0.65, stance: 0.055 } },
  boss: { stride: 1.65, swing: 0.27, bob: 0.012, roll: 0.016, breath: 1.05, rest: { lean: 0.025, ax: -0.26, lx: -0.22, elbow: -0.3, stance: 0.09 } },
  harei: { stride: 1.65, swing: 0.3, bob: 0.018, roll: 0.035, breath: 1.45, rest: { twist: -0.06, ax: -0.2, lx: -0.48, lz: 0.18, elbow: -0.28, leftElbow: -0.55, stance: 0.075 } },
  shiori: { stride: 2.1, swing: 0.33, bob: 0.009, roll: 0.012, breath: 1.25, rest: { lean: 0.035, crouch: -0.055, twist: -0.12, ax: -0.2, ay: -0.15, lx: -0.38, elbow: -0.3, stance: 0.085 } },
  nana: { stride: 1.3, swing: 0.23, bob: 0.014, roll: 0.025, breath: 0.95, rest: { lean: 0.07, crouch: -0.055, ax: -0.48, lx: -0.6, elbow: -0.38, leftElbow: -0.44, stance: 0.15 } },
};
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const smooth = (n: number) => { const t = clamp(n); return t * t * (3 - 2 * t); };

export type EnemyGait = { x: number; y: number; z: number; time: number; phase: number; speed: number; forward: number; lateral: number };
export function createEnemyGait(e: Enemy, time: number): EnemyGait {
  return { x: e.x, y: e.y, z: e.z, time, phase: 0, speed: 0, forward: 1, lateral: 0 };
}

/** Observe actual movement, never chase intent or render delta. Blocked feet stop
 * advancing their cycle; pause/hitstop leave this observer exactly unchanged. */
export function updateEnemyGait(gait: EnemyGait, e: Enemy, time: number): void {
  const dt = time - gait.time;
  if (dt === 0) return;
  const dx = e.x - gait.x; const dz = e.z - gait.z; const distance = Math.hypot(dx, dz);
  if (dt < 0 || dt > 0.5 || distance > 3 || Math.abs(e.y - gait.y) > 2) {
    Object.assign(gait, createEnemyGait(e, time)); return;
  }
  const travel = e.action === 'chase' || e.action === 'idle' ? distance : 0;
  gait.phase = (gait.phase + ((travel * Math.PI * 2) / BEARINGS[enemyMotionIdentity(e)].stride)) % (Math.PI * 2);
  const response = 1 - Math.exp(-dt * 18);
  gait.speed += (Math.min(6, travel / dt) - gait.speed) * response;
  if (travel > 0.00001) {
    const forward = (dx * Math.sin(e.facing) + dz * Math.cos(e.facing)) / distance;
    const lateral = (dx * Math.cos(e.facing) - dz * Math.sin(e.facing)) / distance;
    gait.forward += (forward - gait.forward) * response; gait.lateral += (lateral - gait.lateral) * response;
  }
  gait.x = e.x; gait.y = e.y; gait.z = e.z; gait.time = time;
}

/** Shared envelope for breathing, walking and secondary cloth around the attack.
 * Every boundary uses the existing attack clock; no visual prediction of contact. */
function locomotionWeight(e: Enemy): number {
  if (e.action === 'windup') return 1 - smooth((enemyAttack(e).windup - e.timer) / enemyTiming(e).raise);
  if (e.action === 'attack') return 0;
  if (e.action === 'recover') return smooth(1 - e.timer / Math.min(0.32, enemyAttack(e).recovery));
  return e.action === 'stagger' || e.action === 'dead' ? 0 : 1;
}

export type EnemyVisualPose = EnemyPose & { roll: number };

/** Lowest sole support for the authored rig: legs at (+/-0.14,0.8,0),
 * boots centred at (0,-0.65,0.05), with half extents (0.1,0.125,0.175).
 * Project the body and leg rotations onto world up; the box support function
 * gives the exact lowest corner without traversing meshes or allocating boxes.
 * Apply before a boss's jump height; dead bodies intentionally bypass this lift. */
export function enemyGroundLift(pose: EnemyVisualPose, size: number): number {
  const sx = Math.sin(pose.lean); const cx = Math.cos(pose.lean);
  const sz = Math.sin(pose.roll); const cz = Math.cos(pose.roll);
  // World-up row of the body's YXZ Euler rotation; yaw cannot change height.
  const bx = cx * sz; const by = cx * cz; const bz = -sx;
  let lowest = Infinity;
  for (let side = -1; side <= 1; side += 2) {
    const leg = side < 0 ? pose.legL : pose.legR;
    const sl = Math.sin(leg); const cl = Math.cos(leg);
    const ss = Math.sin(side * pose.stance); const cs = Math.cos(side * pose.stance);
    const qx = bx * cs + (by * cl + bz * sl) * ss;
    const qy = -bx * ss + (by * cl + bz * sl) * cs;
    const qz = -by * sl + bz * cl;
    const center = bx * side * 0.14 + by * 0.8 - qy * 0.65 + qz * 0.05;
    lowest = Math.min(lowest, pose.crouch + size * (center - Math.abs(qx) * 0.1 - Math.abs(qy) * 0.125 - Math.abs(qz) * 0.175));
  }
  return Math.max(0, -lowest);
}

export function sampleEnemyPose(e: Enemy, time: number, gait: EnemyGait): EnemyVisualPose {
  const identity = enemyMotionIdentity(e); const bearing = BEARINGS[identity]; const attack = enemyMotion(e);
  const weight = locomotionWeight(e); const amplitude = Math.min(1, gait.speed / 2.4) * weight;
  const wave = Math.sin(gait.phase); const breathing = Math.sin(time * bearing.breath + e.spawn.x * 0.31);
  const p: EnemyVisualPose = { ...(attack ?? ENEMY_NEUTRAL), roll: bearing.roll * wave * amplitude };
  // Idle bearing fades out during the raise and comes back after weapon retrieval.
  for (const name of Object.keys(bearing.rest) as (keyof EnemyPose)[]) p[name] += bearing.rest[name]! * weight;
  p.crouch += (Math.abs(wave) * bearing.bob * amplitude + breathing * 0.004 * weight);
  p.lean += gait.speed * 0.009 * gait.forward * weight;
  p.twist += -wave * 0.045 * amplitude;
  p.side += wave * bearing.roll * 0.45 * amplitude;
  p.legL += wave * bearing.swing * amplitude * gait.forward;
  p.legR -= wave * bearing.swing * amplitude * gait.forward;
  p.stance += Math.abs(wave * gait.lateral) * 0.045 * amplitude;
  const armSwing = ['bulwark', 'pike', 'crossbow', 'staff', 'nana'].includes(identity) ? 0.06 : 0.18;
  p.ax -= wave * armSwing * amplitude; p.lx += wave * armSwing * amplitude;
  return p;
}

/** Cloth trails the current pose instead of starting a separate attack sine. */
export function sampleEnemyCloth(e: Enemy, time: number): { pitch: number; roll: number } {
  const pose = enemyMotion(e); const bearing = BEARINGS[enemyMotionIdentity(e)]; const weight = locomotionWeight(e);
  return { pitch: -0.08 - (pose?.lean ?? 0) * 0.22 + Math.sin(time * bearing.breath + e.spawn.x) * 0.012 * weight,
    roll: -(pose?.twist ?? 0) * 0.045 + Math.sin(time * bearing.breath * 0.8 + e.spawn.z) * 0.012 * weight };
}
