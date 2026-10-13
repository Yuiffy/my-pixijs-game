import type { Enemy, Vec3, WorldAccess } from './types';
import { canOccupy, supportAt } from './world';
import { enemyAttack } from './enemyCombat';

// Stair treads sit up to 0.11m above the movement ramp. Keep depth testing on:
// the warning follows reachable ground, and must still be hidden by real walls.
export const WARNING_CLEARANCE = 0.22;
const SPACING = 0.32;
const TRIANGLE_PROBES = [[1 / 3, 1 / 3, 1 / 3], [0, 0.5, 0.5], [0.5, 0, 0.5], [0.5, 0.5, 0]];
function dimensions(range: number, arc: number) {
  return { radial: Math.ceil(range / SPACING), angular: Math.max(4, Math.ceil((2 * arc * range) / SPACING)) };
}

export function createAreaWarningBuffers(range: number, arc = Math.PI) {
  const { radial, angular } = dimensions(range, arc);
  return allocate((radial + 1) * (angular + 1), radial * angular * 6);
}
function allocate(points: number, vertices: number) {
  return { samples: new Float32Array(points * 3), valid: new Uint8Array(points), lifts: new Float32Array(points), indices: new Uint32Array(vertices), positions: new Float32Array(vertices * 3) };
}
export function createWarningBuffers(enemy: Enemy) {
  let points = 0; let vertices = 0;
  for (let phase = 1; phase <= 2; phase++) for (let attackIndex = 0; attackIndex < 3; attackIndex++) {
    const spec = enemyAttack({ ...enemy, phase, attackIndex });
    const { radial, angular } = dimensions(spec.range, spec.arc);
    points = Math.max(points, (radial + 1) * (angular + 1));
    vertices = Math.max(vertices, radial * angular * 6);
  }
  return allocate(points, vertices);
}

/** Walk each ray from the actor's floor, never project onto a roof overhead or
 * bridge a void. Local coordinates let this mesh share the actor's translation
 * without inheriting the body's scale, lean, or animated rotations. */
export function writeGroundWarning(buffers: ReturnType<typeof createWarningBuffers>, enemy: Enemy, access: WorldAccess): number {
  return writeAreaWarning(buffers, enemy, access, enemyAttack(enemy));
}
export function writeAreaWarning(buffers: ReturnType<typeof createAreaWarningBuffers>, enemy: Vec3 & { facing: number }, access: WorldAccess, { range, arc, projectile = false, innerRange = 0 }: { range: number; arc: number; projectile?: boolean; innerRange?: number }): number {
  const { radial, angular } = dimensions(range, arc);
  const stride = radial + 1;
  const { samples, valid, lifts, indices, positions } = buffers;
  lifts.fill(0);
  for (let a = 0; a <= angular; a++) {
    const angle = enemy.facing - arc + (2 * arc * a) / angular;
    let ground = enemy.y; let reachable = true;
    for (let r = 0; r <= radial; r++) {
      const index = a * stride + r;
      const distance = (range * r) / radial;
      const x = Math.sin(angle) * distance; const z = Math.cos(angle) * distance;
      const floor: number | null = reachable ? supportAt(enemy.x + x, enemy.z + z, ground + 0.6) : null;
      reachable = floor !== null && Math.abs(floor - ground) <= 0.6
        && canOccupy(enemy.x + x, enemy.z + z, ground, access, 0.02);
      valid[index] = distance >= innerRange && reachable && (projectile || Math.abs(floor! - enemy.y) < 1) ? 1 : 0;
      if (reachable) ground = floor!;
      samples[index * 3] = x; samples[index * 3 + 1] = ground - enemy.y + WARNING_CLEARANCE; samples[index * 3 + 2] = z;
    }
  }
  let count = 0;
  const triangle = (a: number, b: number, c: number) => {
    if (!valid[a] || !valid[b] || !valid[c]) return;
    // A small step at a bridge/ramp junction can cut through a triangle whose
    // three corners are individually above ground. Lift the complete triangle
    // enough to clear its interior too, without changing its attack footprint.
    // Share that lift between adjoining triangles so the surface has no cracks.
    let lift = 0;
    for (const weights of TRIANGLE_PROBES) {
      const x = samples[a * 3] * weights[0] + samples[b * 3] * weights[1] + samples[c * 3] * weights[2];
      const y = samples[a * 3 + 1] * weights[0] + samples[b * 3 + 1] * weights[1] + samples[c * 3 + 1] * weights[2];
      const z = samples[a * 3 + 2] * weights[0] + samples[b * 3 + 2] * weights[1] + samples[c * 3 + 2] * weights[2];
      const floor = supportAt(enemy.x + x, enemy.z + z, enemy.y + y - WARNING_CLEARANCE + 0.6);
      if (floor === null) return;
      lift = Math.max(lift, floor - enemy.y + WARNING_CLEARANCE - y);
    }
    for (const index of [a, b, c]) {
      lifts[index] = Math.max(lifts[index], lift);
      indices[count++] = index;
    }
  };
  for (let a = 0; a < angular; a++) for (let r = 0; r < radial; r++) {
    const i = a * stride + r; const next = i + stride;
    if (r > 0) triangle(i, next, i + 1);
    triangle(i + 1, next, next + 1);
  }
  for (let i = 0; i < count; i++) {
    const index = indices[i];
    positions[i * 3] = samples[index * 3]; positions[i * 3 + 1] = samples[index * 3 + 1] + lifts[index]; positions[i * 3 + 2] = samples[index * 3 + 2];
  }
  return count;
}
