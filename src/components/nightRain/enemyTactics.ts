import { enemyRole, isBoss } from './encounters';
import type { Enemy, Vec3 } from './types';

export function enemySenses(e: Pick<Enemy, 'id' | 'kind'>) {
  const role = enemyRole(e);
  if (isBoss(e)) return { sight: 23, rear: 13, leash: e.kind === 'boss' ? 18 : 34, forget: 8, turn: e.kind === 'colossus' || e.kind === 'sentinel' ? 1.7 : 3.2 };
  if (role === 'crossbow' || role === 'slinger') return { sight: 23, rear: 9, leash: 15, forget: 6, turn: 2.6 };
  if (role === 'blade' || role === 'skirmisher') return { sight: 17, rear: 8, leash: 30, forget: 7, turn: 4.4 };
  return { sight: 19, rear: 9, leash: 27, forget: 7, turn: 2.8 };
}

export function turnEnemy(e: Enemy, target: Vec3, dt: number, speed = enemySenses(e).turn) {
  const angle = Math.atan2(target.x - e.x, target.z - e.z) - e.facing;
  e.facing += Math.max(-speed * dt, Math.min(speed * dt, Math.atan2(Math.sin(angle), Math.cos(angle))));
  e.facing = Math.atan2(Math.sin(e.facing), Math.cos(e.facing));
}

/** Lateral intent is tied to identity and simulation time, never frame randomness. */
export function enemyFootwork(e: Enemy, time: number, distance: number) {
  const role = enemyRole(e); const boss = isBoss(e);
  const active = e.aggro && e.action === 'chase' && distance > 2.5 && distance < (boss ? 7 : 5);
  if (!active || role === 'bulwark' || role === 'pike' || role === 'crossbow' || role === 'slinger') return 0;
  const side = (e.id.length % 2 ? 1 : -1) * Math.sin(time * 0.7 + e.spawn.x);
  // Ease both the reversal and the edges of the circling distance band.
  const envelope = Math.min(1, (distance - 2.5) / 0.8, ((boss ? 7 : 5) - distance) / 0.8);
  return side * envelope * (boss ? 0.6 : role === 'blade' ? 0.5 : 0.24);
}
