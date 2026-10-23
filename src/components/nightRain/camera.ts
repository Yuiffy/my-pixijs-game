import { clipCameraBoom, type CameraPoint } from '../gameCamera/boom';
import { architectureIntervals } from './architecture';
import { gateOpen, OBSTACLES, SURFACES } from './world';
import type { WorldAccess } from './types';

export function nightCameraBlocked({ x, y, z }: CameraPoint, state: WorldAccess, surfaces = SURFACES, obstacles = OBSTACLES) {
  const deck = surfaces.some(s => {
    if (x < s.x1 || x > s.x2 || z < s.z1 || z > s.z2) return false;
    const top = s.y + (((s.endY ?? s.y) - s.y) * (z - s.z1)) / (s.z2 - s.z1);
    return y < top + 0.3 && y > top - 0.78;
  });
  return deck || obstacles.some(o => o.kind !== 'shrine' && !gateOpen(o, state)
    && Math.abs(x - o.x) < o.w / 2 + 0.2 && Math.abs(z - o.z) < o.d / 2 + 0.2
    && y > o.y && y < o.y + o.h + 0.3)
    || architectureIntervals(x, z).some(h => y > h.bottom - 0.2 && y < h.top + 0.2);
}

export function constrainNightCamera(target: CameraPoint, desired: CameraPoint, state: WorldAccess) {
  const minX = Math.min(target.x, desired.x) - 0.3;
  const maxX = Math.max(target.x, desired.x) + 0.3;
  const minZ = Math.min(target.z, desired.z) - 0.3;
  const maxZ = Math.max(target.z, desired.z) + 0.3;
  const surfaces = SURFACES.filter(s => s.x1 <= maxX && s.x2 >= minX && s.z1 <= maxZ && s.z2 >= minZ);
  const obstacles = OBSTACLES.filter(o => o.x - o.w / 2 <= maxX && o.x + o.w / 2 >= minX && o.z - o.d / 2 <= maxZ && o.z + o.d / 2 >= minZ);
  return clipCameraBoom(target, desired, p => nightCameraBlocked(p, state, surfaces, obstacles));
}
