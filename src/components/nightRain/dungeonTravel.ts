import { DUNGEONS, dungeonFoyer, dungeonPoint, undergroundId, type DungeonId } from './dungeons';
import type { GameState, Vec3 } from './types';

export type LiftRide = { dungeon: DungeonId; direction: 'down' | 'up'; elapsed: number };
export function liftPosition(ride: LiftRide): Vec3 {
  const d = DUNGEONS[ride.dungeon];
  const t = Math.max(0, Math.min(1, ride.elapsed / d.duration));
  const smooth = t * t * (3 - 2 * t);
  const progress = ride.direction === 'down' ? smooth : 1 - smooth;
  return { ...d.upper, y: d.upper.y + (d.floor - d.upper.y) * progress };
}
export function updateLift(s: GameState, dt: number) {
  if (!s.liftRide) return;
  s.liftRide.elapsed = Math.min(DUNGEONS[s.liftRide.dungeon].duration, s.liftRide.elapsed + dt);
  Object.assign(s.player, liftPosition(s.liftRide));
  if (s.liftRide.elapsed >= DUNGEONS[s.liftRide.dungeon].duration) {
    s.player.lastGround = { x: s.player.x, y: s.player.y, z: s.player.z };
    s.player.fallPeak = s.player.y; s.player.facing = s.liftRide.direction === 'down' ? 0 : Math.PI / 2;
    s.liftRide = null;
  }
}
export function validLift(s: GameState) {
  const r = s.liftRide;
  if (r === null) return true;
  if (!r || !Object.hasOwn(DUNGEONS, r.dungeon) || !['down', 'up'].includes(r.direction) || !Number.isFinite(r.elapsed) || r.elapsed < 0 || r.elapsed >= DUNGEONS[r.dungeon].duration || s.mode !== 'playing') return false;
  const p = liftPosition(r);
  return Math.hypot(s.player.x - p.x, s.player.y - p.y, s.player.z - p.z) < 0.01 && s.player.action === 'idle' && s.player.jumpHeight === 0 && s.player.jumpVelocity === 0;
}
export function discoverDungeon(s: GameState) {
  const id = dungeonFoyer(s.player) ?? undergroundId(s.player);
  if (id && !s.discoveredDungeons.includes(id)) s.discoveredDungeons.push(id);
}
/** v9 used two remote ground-level rooms; move only those saved coordinates once. */
export function migrateUnderground(s: GameState) {
  const migrate = (p: Vec3 | null | undefined) => {
    if (!p || p.x < 80 || p.x > 130 || p.z < 14 || p.z > 150) return;
    Object.assign(p, dungeonPoint(p.z > 88 ? 'cave' : 'crypt', p));
  };
  if (s.player?.x > 80) {
    const id = s.player.z > 88 ? 'cave' : 'crypt';
    s.player.fallPeak += DUNGEONS[id].floor;
  }
  migrate(s.player); migrate(s.player?.lastGround); migrate(s.bloodstain);
  for (const e of s.enemies ?? []) { migrate(e); migrate(e.spawn); }
  for (const fx of s.effects ?? []) migrate(fx);
  for (const shot of s.projectiles ?? []) migrate(shot);
  s.liftRide = null;
  s.discoveredDungeons = (Object.keys(DUNGEONS) as DungeonId[]).filter(id => s.litLamps?.includes(`${id}-lamp`) || s.visited?.some(region => region.startsWith(DUNGEONS[id].name)));
  discoverDungeon(s);
}
