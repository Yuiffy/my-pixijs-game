import type { EnemyKind, Landmark, Obstacle, Surface, Vec3 } from './types';

// Metres. +x east, +z south, +y up. Ramp endY is the height at z2.
// Solid parapets bound the walkable network; no hidden teleport links.
export const SURFACES: Surface[] = [
  { id: 'room', name: '旅馆 · 下播之后', x1: -4, x2: 12, z1: 12, z2: 18, y: 6, color: '#7c685b' },
  { id: 'arrival-stairs', name: '旅馆外梯', x1: 8, x2: 12, z1: 0, z2: 12, y: 0, endY: 6, color: '#7f8077' },
  { id: 'courtyard', name: '雨灯中庭', x1: -9, x2: 12, z1: -6, z2: 10, y: 0, color: '#536766' },
  { id: 'alley', name: '晾衣暗巷', x1: -18, x2: -8, z1: -7, z2: 4, y: 0, color: '#526764' },
  { id: 'west-stairs', name: '旧城高阶', x1: -18, x2: -13, z1: -20, z2: -6, y: 6, endY: 0, color: '#7b8176' },
  { id: 'roofs', name: '金塔屋脊', x1: -18, x2: 5, z1: -25, z2: -20, y: 6, color: '#9d6651' },
  { id: 'market-stairs', name: '夜市长阶', x1: 0, x2: 5, z1: -37, z2: -25, y: 0, endY: 6, color: '#827b68' },
  { id: 'market', name: '封街夜市', x1: -6, x2: 14, z1: -49, z2: -36, y: 0, color: '#665e59' },
  { id: 'return', name: '运河侧廊', x1: 10, x2: 14, z1: -37, z2: -6, y: 0, color: '#65726e' },
  { id: 'cloister-bridge', name: '雨檐岔路', x1: -15.5, x2: -7, z1: -14, z2: -12, y: 3, color: '#938c79' },
  { id: 'cloister', name: '铃兰回廊', x1: -9, x2: -4, z1: -16, z2: -10, y: 3, color: '#8b8876' },
  { id: 'cloister-stairs', name: '回廊近道', x1: -8, x2: -4, z1: -10, z2: -5, y: 3, endY: 0, color: '#8b8876' },
  { id: 'lookout', name: '金塔望台', x1: -17, x2: -10, z1: -30, z2: -25, y: 6, color: '#b58b67' },
];

export const OBSTACLES: Obstacle[] = [
  { x: 4, z: 3, w: 2.5, d: 2.5, y: 0, h: 1.3, kind: 'planter' },
  { x: -5, z: -2, w: 1.8, d: 1.6, y: 0, h: 1.6, kind: 'crate' },
  { x: -17, z: 2, w: 1.2, d: 2, y: 0, h: 1.5, kind: 'crate' },
  { x: -10, z: -24, w: 1.2, d: 1.2, y: 6, h: 2.4, kind: 'pillar' },
  { x: -3, z: -43, w: 1.6, d: 1.6, y: 0, h: 2.4, kind: 'pillar' },
  { x: 11, z: -44, w: 1.6, d: 1.6, y: 0, h: 2.4, kind: 'pillar' },
  { x: 12, z: -8, w: 4.1, d: 0.7, y: 0, h: 3.3, kind: 'gate' },
  { x: -6, z: -15.3, w: 0.95, d: 0.65, y: 3, h: 0.65, kind: 'chest' },
  { x: -14, z: -29.3, w: 0.95, d: 0.65, y: 6, h: 0.65, kind: 'chest' },
];

export const LANDMARKS: Landmark[] = [
  { id: 'laptop', kind: 'note', label: '合上新笔记本', x: 0, y: 6, z: 15 },
  { id: 'courtyard', kind: 'rest', label: '雨灯 · 休息 / 整备', x: -1, y: 0, z: 7 },
  { id: 'alley-cache', kind: 'cache', label: '拾取遗落的夜市钱袋', x: -16, y: 0, z: 1 },
  { id: 'roof-charm', kind: 'charm', label: '收下金铃护符', x: -15, y: 6, z: -23 },
  { id: 'rooftop-note', kind: 'note', label: '查看夜市便签', x: -4, y: 6, z: -23 },
  { id: 'shortcut', kind: 'shortcut', label: '拉开中庭侧门', x: 12, y: 0, z: -10 },
  { id: 'food', kind: 'food', label: '来一份热腾腾的打抛饭', x: 4, y: 0, z: -47 },
  { id: 'cloister-cache', kind: 'cache', label: '打开铃兰回廊宝箱', x: -6, y: 3, z: -14.5 },
  { id: 'lookout-cache', kind: 'cache', label: '打开金塔望台宝箱', x: -14, y: 6, z: -28.5 },
];

export const ENEMY_SPAWNS: (Vec3 & { id: string; kind: EnemyKind; name: string; facing: number })[] = [
  { id: 'courtyard-prowler', kind: 'prowler', name: '雨巷游荡者', x: -4, y: 0, z: 2, facing: 0 },
  { id: 'alley-guard', kind: 'guard', name: '守巷棍客', x: -12, y: 0, z: -3, facing: 0.8 },
  { id: 'stair-prowler', kind: 'prowler', name: '高阶伏兵', x: -15.5, y: 3, z: -13, facing: 0 },
  { id: 'roof-duelist', kind: 'duelist', name: '屋脊刀客', x: -5, y: 6, z: -22.5, facing: -1.57 },
  { id: 'canal-guard', kind: 'guard', name: '侧廊看守', x: 12, y: 0, z: -22, facing: Math.PI },
  { id: 'market-boss', kind: 'boss', name: '封街人 · 铁伞', x: 4, y: 0, z: -41, facing: 0 },
];

export const SPAWN: Vec3 = { x: 1.8, y: 6, z: 15.5 };
export const CHECKPOINT: Vec3 = { x: -1, y: 0, z: 8.2 };

export function heightAt(x: number, z: number): number | null {
  let result: number | null = null;
  for (const s of SURFACES) {
    if (x < s.x1 || x > s.x2 || z < s.z1 || z > s.z2) continue;
    const y = s.y + (((s.endY ?? s.y) - s.y) * (z - s.z1)) / (s.z2 - s.z1);
    if (result === null || y > result) result = y;
  }
  return result;
}

export function canOccupy(x: number, z: number, fromY: number, shortcut = false, radius = 0.32): boolean {
  const y = heightAt(x, z);
  if (y === null || Math.abs(y - fromY) > 0.6) return false;
  // Four probes keep feet inside the visible parapets without sealing connected stairs.
  if ([[radius, 0], [-radius, 0], [0, radius], [0, -radius]].some(([dx, dz]) => heightAt(x + dx, z + dz) === null)) return false;
  return !OBSTACLES.some(o => !(o.kind === 'gate' && shortcut)
    && Math.abs(y - o.y) < 2 && Math.abs(x - o.x) < o.w / 2 + radius && Math.abs(z - o.z) < o.d / 2 + radius);
}

export function regionAt(x: number, z: number): string {
  return [...SURFACES].reverse().find(s => x >= s.x1 && x <= s.x2 && z >= s.z1 && z <= s.z2)?.name ?? '旧街边缘';
}

export function lineClear(a: Vec3, b: Vec3, shortcut = false): boolean {
  const count = Math.max(1, Math.ceil(Math.hypot(a.x - b.x, a.z - b.z) / 0.35));
  let { y } = a;
  for (let i = 1; i <= count; i += 1) {
    const t = i / count; const x = a.x + (b.x - a.x) * t; const z = a.z + (b.z - a.z) * t;
    if (!canOccupy(x, z, y, shortcut, 0.05)) return false;
    y = heightAt(x, z) ?? y;
  }
  return Math.abs(y - b.y) < 0.8;
}
