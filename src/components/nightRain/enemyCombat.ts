import type { Enemy } from './types';
import type { Pose } from './combat';

export const ENEMY_STRIKE_TIME = 0.24;
export const ENEMY_CONTACT_TIME = 0.08;

type EnemyPose = Pose & { weaponPitch: number };
const neutral: EnemyPose = { lean: 0, twist: 0, crouch: 0, ax: 0, ay: 0, az: -0.08, lx: 0, lz: 0, legL: 0, legR: 0, weaponPitch: Math.PI / 2 };
const key = (p: Partial<EnemyPose>): EnemyPose => ({ ...neutral, ...p });
function mix(a: EnemyPose, b: EnemyPose, amount: number): EnemyPose {
  const t = Math.max(0, Math.min(1, amount)); const eased = t * t * (3 - 2 * t);
  const p = { ...a };
  for (const name of Object.keys(p) as (keyof EnemyPose)[]) p[name] += (b[name] - a[name]) * eased;
  return p;
}

function keys(e: Enemy): [EnemyPose, EnemyPose] {
  if (e.kind === 'guard' || (e.kind === 'boss' && e.attackIndex % 3 === 1)) return [
    key({ ax: -2.9, az: -0.2, lx: -2.5, lz: 0.55, lean: -0.13, crouch: -0.08, legL: -0.25, legR: 0.3 }),
    key({ weaponPitch: 2.3, ax: -0.85, az: 0.05, lx: -0.85, lz: 0.5, lean: 0.27, crouch: -0.1, legL: -0.4, legR: 0.3 }),
  ];
  if (e.kind === 'boss' && !(e.phase === 2 && e.attackIndex % 3 === 2)) return [
    key({ ax: -0.65, ay: -0.4, az: -0.65, twist: -0.4, lean: -0.07, lx: -0.5, legL: 0.25, legR: -0.3 }),
    key({ weaponPitch: 3.0, ax: -1.55, ay: 0.08, az: -0.05, twist: 0.25, lean: 0.22, lx: 0.45, legL: -0.45, legR: 0.3 }),
  ];
  if (e.kind === 'duelist') return [
    key({ ax: -0.65, ay: -0.85, az: -0.9, twist: -0.65, crouch: -0.09, lx: -0.7, lz: -0.3, legL: 0.2, legR: -0.3 }),
    key({ weaponPitch: 2.5, ax: -1.25, ay: 1.05, az: -0.25, twist: 0.6, lean: 0.17, lx: 0.3, legL: -0.4, legR: 0.3 }),
  ];
  return [
    key({ ax: -1.15, ay: -1.1, az: -1.15, twist: -0.55, lean: -0.09, lx: -0.35, legL: 0.18, legR: -0.25 }),
    key({ weaponPitch: 2.4, ax: -1.1, ay: 1.2, az: -0.25, twist: e.kind === 'boss' ? 1.05 : 0.55, lean: 0.15, lx: 0.55, legL: -0.35, legR: 0.3 }),
  ];
}

/** Raise → gather weight → readable release → contact → follow-through → settle.
 * Uses the simulation countdown, so pauses, hitstop and damage share one clock. */
export function enemyMotion(e: Enemy): EnemyPose | null {
  const spec = enemyAttack(e); const [loaded, contact] = keys(e);
  const gathered = { ...loaded, twist: loaded.twist - 0.13, lean: loaded.lean - 0.055, ax: loaded.ax - 0.12 };
  const release = mix(gathered, contact, 0.26);
  const follow = { ...contact, ax: contact.ax + 0.5, twist: contact.twist + 0.2, lean: contact.lean + 0.06 };
  if (e.action === 'windup') {
    const t = spec.windup - e.timer; const cue = Math.min(0.24, spec.windup * 0.3);
    if (t < spec.windup * 0.42) return mix(neutral, loaded, t / (spec.windup * 0.42));
    if (e.timer > cue) return mix(loaded, gathered, (t - spec.windup * 0.42) / (spec.windup * 0.58 - cue));
    return mix(gathered, release, 1 - e.timer / cue);
  }
  if (e.action === 'attack') {
    const t = ENEMY_STRIKE_TIME - e.timer;
    return t < ENEMY_CONTACT_TIME ? mix(release, contact, t / ENEMY_CONTACT_TIME) : mix(contact, follow, (t - ENEMY_CONTACT_TIME) / (ENEMY_STRIKE_TIME - ENEMY_CONTACT_TIME));
  }
  if (e.action === 'recover') return mix(follow, neutral, 1 - e.timer / spec.recovery);
  return null;
}

export function enemyAttack(e: Enemy) {
  const index = e.attackIndex % 3;
  if (e.kind === 'boss') {
    if (index === 1) return { name: '拖伞重砸', windup: 1.38, range: 3.1, arc: 0.85, damage: 40, recovery: 1.16, parryable: true, lunge: 1.1 };
    if (index === 2 && e.phase === 2) return { name: '危 · 回旋扫街', windup: 1.1, range: 3.65, arc: Math.PI, damage: 36, recovery: 1.25, parryable: false, lunge: 0 };
    return { name: e.phase === 2 ? '疾伞突刺' : '铁伞突刺', windup: e.phase === 2 ? 0.67 : 0.88, range: 2.85, arc: 0.66, damage: 32, recovery: 0.95, parryable: true, lunge: 1.7 };
  }
  if (e.kind === 'duelist') return { name: index === 1 ? '居合蓄斩' : '快刀横斩', windup: index === 1 ? 1.15 : 0.65, range: 2.35, arc: 1.13, damage: 24, recovery: 0.85, parryable: true, lunge: 0.6 };
  if (e.kind === 'guard') return { name: '举棍重击', windup: 1.06, range: 2.3, arc: 0.9, damage: 25, recovery: 1.2, parryable: true, lunge: 0.25 };
  return { name: '短棍挥打', windup: 0.88, range: 1.95, arc: 1.15, damage: 19, recovery: 1.05, parryable: true, lunge: 0.3 };
}
