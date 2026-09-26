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
  if (e.kind === 'nana') return e.attackIndex % 3 === 1 ? [
    key({ ax: -3, az: -0.4, lx: -2.6, lean: -0.2, crouch: -0.15, legL: -0.4, legR: 0.4 }),
    key({ ax: -0.7, weaponPitch: 2.5, lx: -0.8, lean: 0.4, crouch: -0.12, legL: -0.5, legR: 0.2 }),
  ] : e.attackIndex % 3 === 2 ? [
    key({ ax: -1.3, ay: -1.4, az: -0.9, twist: -0.8, crouch: -0.1, lx: -0.5 }),
    key({ ax: -1.1, ay: 1.5, az: -0.2, weaponPitch: 2.5, twist: 1.3, lean: 0.15, lx: 0.7, legL: -0.4 }),
  ] : [key({ ax: -0.8, ay: -0.3, az: -0.55, twist: -0.35, lean: -0.08, legR: -0.25 }), key({ ax: -1.6, weaponPitch: 3.05, twist: 0.3, lean: 0.22, legL: -0.4, lx: 0.5 })];
  if (e.kind === 'azi') return e.attackIndex % 3 === 1 ? [
    key({ ax: -2.8, az: -0.4, lx: -2.4, lean: -0.15, crouch: -0.2, legL: -0.4, legR: 0.4 }), key({ ax: -0.8, weaponPitch: 2.5, lean: 0.32, crouch: -0.12, lx: -0.9, legL: -0.5 }),
  ] : [key({ ax: -1.2, ay: -1.2, az: -1, twist: -0.6, lx: -0.9, crouch: -0.15 }), key({ ax: -1.15, ay: 1.1, az: -0.2, weaponPitch: 2.45, twist: 0.8, lean: 0.14, lx: 0.55, legL: -0.35 })];
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
  if (e.kind === 'nana') {
    if (index === 1) return { name: '沉镐 · 延迟落潮', windup: 1.65, range: 3.5, arc: 0.75, damage: 43, recovery: 1.4, parryable: true, lunge: 1.2 };
    if (index === 2) return { name: '危 · 七重返潮', windup: e.phase === 2 ? 0.92 : 1.25, range: 4.0, arc: Math.PI, damage: 34, recovery: 1.35, parryable: false, lunge: 0 };
    return { name: '破浪镐击', windup: e.phase === 2 ? 0.68 : 0.94, range: 3.1, arc: 0.6, damage: 31, recovery: e.phase === 2 ? 0.55 : 0.9, parryable: true, lunge: 1.7 };
  }
  if (e.kind === 'azi') {
    if (index === 1) return { name: '休止符 · 迟落拍', windup: e.phase === 2 ? 1.8 : 1.4, range: 2.9, arc: 0.8, damage: 34, recovery: 1.35, parryable: true, lunge: 0.8 };
    if (index === 2) return { name: '危 · 蛙鸣圆舞', windup: 1.12, range: 3.3, arc: Math.PI, damage: 27, recovery: 1.1, parryable: false, lunge: 0 };
    return { name: '青杖切分', windup: 0.75, range: 2.65, arc: 1.3, damage: 25, recovery: 0.7, parryable: true, lunge: 0.7 };
  }
  if (e.kind === 'boss') {
    if (index === 1) return { name: '拖伞重砸', windup: 1.38, range: 3.1, arc: 0.85, damage: 40, recovery: 1.16, parryable: true, lunge: 1.1 };
    if (index === 2 && e.phase === 2) return { name: '危 · 回旋扫街', windup: 1.1, range: 3.65, arc: Math.PI, damage: 36, recovery: 1.25, parryable: false, lunge: 0 };
    return { name: e.phase === 2 ? '疾伞突刺' : '铁伞突刺', windup: e.phase === 2 ? 0.67 : 0.88, range: 2.85, arc: 0.66, damage: 32, recovery: 0.95, parryable: true, lunge: 1.7 };
  }
  if (e.kind === 'duelist') return { name: index === 1 ? '居合蓄斩' : '快刀横斩', windup: index === 1 ? 1.15 : 0.65, range: 2.35, arc: 1.13, damage: 24, recovery: 0.85, parryable: true, lunge: 0.6 };
  if (e.kind === 'guard') return { name: '举棍重击', windup: 1.06, range: 2.3, arc: 0.9, damage: 25, recovery: 1.2, parryable: true, lunge: 0.25 };
  return { name: '短棍挥打', windup: 0.88, range: 1.95, arc: 1.15, damage: 19, recovery: 1.05, parryable: true, lunge: 0.3 };
}
