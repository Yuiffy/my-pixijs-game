import type { EnemyKind, Landmark, Obstacle, Surface, Vec3, WorldAccess } from './types';

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
  // West loop: see the locked water gate below, cross the high bridge, then descend behind it.
  { id: 'bell-bridge', name: '悬钟桥', x1: -29, x2: -17, z1: -29, z2: -25, y: 6, color: '#8e8270' },
  { id: 'temple', name: '残钟雨寺', x1: -35, x2: -28, z1: -33, z2: -22, y: 6, color: '#ae9274' },
  { id: 'temple-stairs', name: '百灯石阶', x1: -35, x2: -29, z1: -22, z2: -12, y: 6, endY: 0, color: '#978976' },
  { id: 'temple-court', name: '寺前莲池', x1: -35, x2: -26, z1: -14, z2: 0, y: 0, color: '#6a7e77' },
  { id: 'water-bridge', name: '闭水门', x1: -26, x2: -18, z1: -4, z2: 0, y: 0, color: '#7c8173' },
  // A quiet pier reached from the far end of the canal; the boss remains across the water.
  { id: 'canal-refuge', name: '摆渡避雨庵', x1: 14, x2: 21, z1: -33, z2: -27, y: 0, color: '#8b7760' },
  // Tide district: a visible uphill spine with two optional loops and deliberate drops.
  { id: 'tide-bridge', name: '潮桥', x1: 21, x2: 32, z1: -32, z2: -28, y: 0, color: '#777f77' },
  { id: 'harbor', name: '潮汐港 · 灯市', x1: 30, x2: 46, z1: -38, z2: -22, y: 0, color: '#657c82' },
  { id: 'tide-stairs', name: '听潮长阶', x1: 40, x2: 46, z1: -54, z2: -38, y: 6, endY: 0, color: '#94a6a7' },
  { id: 'tide-arena', name: '七重潮门', x1: 30, x2: 50, z1: -68, z2: -54, y: 6, color: '#5d8197' },
  { id: 'bell-stairs', name: '晨钟台阶', x1: 31, x2: 36, z1: -77, z2: -68, y: 10, endY: 6, color: '#a7aa9d' },
  { id: 'dawn-bell', name: '黎明钟台', x1: 30, x2: 42, z1: -83, z2: -77, y: 10, color: '#a99a7a' },
  // South gallery loops clockwise and drops four metres onto the arrival square.
  { id: 'gallery-stairs', name: '晒网坡', x1: 42, x2: 46, z1: -22, z2: -10, y: 0, endY: 4, color: '#969082' },
  { id: 'net-gallery', name: '晒网高廊', x1: 30, x2: 46, z1: -10, z2: -6, y: 4, color: '#9b8969' },
  { id: 'net-roof', name: '风铃屋顶', x1: 30, x2: 34, z1: -26, z2: -10, y: 4, color: '#a37a60', openEdges: [2] },
  // East branch climbs to the frog stage; its low quay rejoins the harbor.
  { id: 'frog-stairs', name: '苔灯支阶', x1: 46, x2: 51, z1: -47, z2: -35, y: 3, endY: 0, color: '#808d73' },
  { id: 'frog-stage', name: '苔灯戏台', x1: 46, x2: 63, z1: -54, z2: -47, y: 3, color: '#74836b', openEdges: [3] },
  { id: 'frog-drop', name: '落雨檐', x1: 54, x2: 59, z1: -47, z2: -42, y: 3, color: '#92956d', openEdges: [3] },
  { id: 'low-quay', name: '回潮低埠', x1: 45, x2: 63, z1: -42, z2: -32, y: 0, color: '#577b75' },
  // Return bridge shortens retries to the sole courtyard lamp after the inside winch.
  { id: 'harbor-return', name: '归灯水巷', x1: 27, x2: 31, z1: -28, z2: -1, y: 0, color: '#668078' },
  { id: 'return-bridge', name: '归灯长桥', x1: 12, x2: 31, z1: -5, z2: -1, y: 0, color: '#849083' },
];

export const OBSTACLES: Obstacle[] = [
  { x: -1, z: 7, w: 0.9, d: 0.9, y: 0, h: 2.8, kind: 'shrine', landmarkId: 'courtyard' },
  { x: -32, z: -9.5, w: 0.9, d: 0.9, y: 0, h: 0.95, kind: 'shrine', landmarkId: 'temple-lamp' },
  { x: 18, z: -30, w: 0.9, d: 0.9, y: 0, h: 0.95, kind: 'shrine', landmarkId: 'canal-lamp' },
  { x: 4, z: 3, w: 2.5, d: 2.5, y: 0, h: 1.3, kind: 'planter' },
  { x: -5, z: -2, w: 1.8, d: 1.6, y: 0, h: 1.6, kind: 'crate' },
  { x: -17, z: 2, w: 1.2, d: 2, y: 0, h: 1.5, kind: 'crate' },
  { x: -10, z: -24, w: 1.2, d: 1.2, y: 6, h: 2.4, kind: 'pillar' },
  { x: -3, z: -43, w: 1.6, d: 1.6, y: 0, h: 2.4, kind: 'pillar' },
  { x: 11, z: -44, w: 1.6, d: 1.6, y: 0, h: 2.4, kind: 'pillar' },
  { x: 12, z: -8, w: 4.1, d: 0.7, y: 0, h: 3.3, kind: 'gate' },
  { x: -6, z: -15.3, w: 0.95, d: 0.65, y: 3, h: 0.65, kind: 'chest' },
  { x: -14, z: -29.3, w: 0.95, d: 0.65, y: 6, h: 0.65, kind: 'chest' },
  { x: -30.5, z: -6, w: 9, d: 0.7, y: 0, h: 3.3, kind: 'gate', gateId: 'temple' },
  { x: -31.5, z: -31.7, w: 1.4, d: 0.8, y: 6, h: 1, kind: 'pillar' },
  { x: -34.4, z: -25, w: 0.7, d: 0.7, y: 6, h: 3.6, kind: 'pillar' },
  { x: 20.4, z: -31.8, w: 0.4, d: 0.4, y: 0, h: 3.2, kind: 'pillar' },
  { x: 29, z: -8, w: 4.1, d: 0.7, y: 0, h: 3.3, kind: 'gate', gateId: 'harbor' },
  { x: 36, z: -32, w: 2.2, d: 2.2, y: 0, h: 1.1, kind: 'planter' },
  { x: 33, z: -60, w: 1.2, d: 1.2, y: 6, h: 2.4, kind: 'pillar' },
  { x: 47, z: -64, w: 1.2, d: 1.2, y: 6, h: 2.4, kind: 'pillar' },
  { x: 31.8, z: -18, w: 0.95, d: 0.65, y: 4, h: 0.65, kind: 'chest' },
  { x: 61, z: -51, w: 0.95, d: 0.65, y: 3, h: 0.65, kind: 'chest' },
];

export const LANDMARKS: Landmark[] = [
  { id: 'laptop', kind: 'note', label: '合上新笔记本', x: 0, y: 6, z: 15 },
  { id: 'courtyard', kind: 'rest', label: '中庭雨灯', x: -1, y: 0, z: 7 },
  { id: 'alley-cache', kind: 'cache', label: '拾取遗落的夜市钱袋', x: -16, y: 0, z: 1 },
  { id: 'roof-charm', kind: 'charm', label: '收下金铃护符', x: -15, y: 6, z: -23 },
  { id: 'rooftop-note', kind: 'note', label: '查看夜市便签', x: -4, y: 6, z: -23 },
  { id: 'shortcut', kind: 'shortcut', label: '转动侧门绞盘', x: 13.3, y: 0, z: -9.5 },
  { id: 'food', kind: 'food', label: '来一份热腾腾的打抛饭', x: 4, y: 0, z: -47 },
  { id: 'cloister-cache', kind: 'cache', label: '打开铃兰回廊宝箱', x: -6, y: 3, z: -14.5 },
  { id: 'lookout-cache', kind: 'cache', label: '打开金塔望台宝箱', x: -14, y: 6, z: -28.5 },
  { id: 'temple-flask', kind: 'flask', label: '收下刻露瓶', x: -31.5, y: 6, z: -30.5 },
  { id: 'temple-note', kind: 'note', label: '读残钟铭文', x: -28.8, y: 6, z: -24 },
  { id: 'temple-lamp', kind: 'note', label: '端详莲池旧灯', x: -32, y: 0, z: -9.5 },
  { id: 'temple-gate', kind: 'shortcut', label: '转动水门绞盘', x: -26.7, y: 0, z: -7.3 },
  { id: 'canal-lamp', kind: 'note', label: '端详摆渡旧灯', x: 18, y: 0, z: -30 },
  { id: 'ferry-note', kind: 'note', label: '读摆渡人的遗签', x: 19.5, y: 0, z: -28.5 },
  { id: 'tide-note', kind: 'note', label: '读潮桥刻痕', x: 24, y: 0, z: -30 },
  { id: 'harbor-gate', kind: 'shortcut', label: '转动归灯绞盘', x: 30.3, y: 0, z: -9.5 },
  { id: 'net-cache', kind: 'cache', label: '打开风铃木匣', x: 31.8, y: 4, z: -17 },
  { id: 'drop-note', kind: 'note', label: '读风铃下的残笺', x: 31.8, y: 4, z: -24.5 },
  { id: 'frog-cache', kind: 'cache', label: '打开苔灯戏匣', x: 61, y: 3, z: -50 },
  { id: 'tide-seal', kind: 'note', label: '端详七重潮门', x: 40, y: 6, z: -66 },
  { id: 'dawn-bell', kind: 'note', label: '叩响黎明钟', x: 35, y: 10, z: -80 },
];

export const ENEMY_SPAWNS: (Vec3 & { id: string; kind: EnemyKind; name: string; facing: number })[] = [
  { id: 'courtyard-prowler', kind: 'prowler', name: '雨巷游荡者', x: -4, y: 0, z: 2, facing: 0 },
  { id: 'alley-guard', kind: 'guard', name: '守巷棍客', x: -12, y: 0, z: -3, facing: 0.8 },
  { id: 'stair-prowler', kind: 'prowler', name: '高阶伏兵', x: -15.5, y: 3, z: -13, facing: 0 },
  { id: 'roof-duelist', kind: 'duelist', name: '屋脊刀客', x: -5, y: 6, z: -22.5, facing: -1.57 },
  { id: 'canal-guard', kind: 'guard', name: '侧廊看守', x: 12, y: 0, z: -22, facing: Math.PI },
  { id: 'market-boss', kind: 'boss', name: '封街人 · 铁伞', x: 4, y: 0, z: -41, facing: 0 },
  { id: 'temple-duelist', kind: 'duelist', name: '守钟客', x: -31.5, y: 6, z: -27, facing: Math.PI / 2 },
  { id: 'temple-prowler', kind: 'prowler', name: '石阶拾灯人', x: -32, y: 3.6, z: -18, facing: Math.PI },
  { id: 'harbor-prowler', kind: 'prowler', name: '提灯收网人', x: 38, y: 0, z: -29, facing: Math.PI / 2 },
  { id: 'tide-guard', kind: 'guard', name: '听潮守阶人', x: 43, y: 3, z: -46, facing: 0 },
  { id: 'net-duelist', kind: 'duelist', name: '晒网刀客', x: 38, y: 4, z: -8, facing: Math.PI / 2 },
  { id: 'nana-tide', kind: 'nana', name: '七海 · 七重潮声', x: 40, y: 6, z: -61, facing: 0 },
  { id: 'azi-stage', kind: 'azi', name: '阿梓 · 苔灯夜曲', x: 57, y: 3, z: -50, facing: 0 },
];

export const SPAWN: Vec3 = { x: 1.8, y: 6, z: 15.5 };
export const CHECKPOINT: Vec3 = { x: -1, y: 0, z: 8.2 };

export const REST_POINTS: Record<string, Vec3> = {
  room: SPAWN,
  courtyard: CHECKPOINT,
};
// A guide stops beside a solid shrine; interaction itself is allowed from any clear side.
export function interactionPoint(l: Landmark): Vec3 {
  if (l.id === 'temple-lamp') return { x: -32, y: 0, z: -10.8 };
  if (l.id === 'canal-lamp') return { x: 17, y: 0, z: -30 };
  return l.kind === 'rest' ? REST_POINTS[l.id] : l;
}

export function gateOpen(o: Obstacle, access: WorldAccess): boolean {
  return o.kind === 'gate' && (o.gateId === 'harbor' ? typeof access !== 'boolean' && !!access.harborGate : o.gateId === 'temple' ? typeof access !== 'boolean' && access.templeGate : typeof access === 'boolean' ? access : access.shortcut);
}

export function heightAt(x: number, z: number): number | null {
  let result: number | null = null;
  for (const s of SURFACES) {
    if (x < s.x1 || x > s.x2 || z < s.z1 || z > s.z2) continue;
    const y = s.y + (((s.endY ?? s.y) - s.y) * (z - s.z1)) / (s.z2 - s.z1);
    if (result === null || y > result) result = y;
  }
  return result;
}

export function canOccupy(x: number, z: number, fromY: number, shortcut: WorldAccess = false, radius = 0.32, ignoredLandmark?: string): boolean {
  const y = supportAt(x, z, fromY + 0.6);
  if (y === null || Math.abs(y - fromY) > 0.6 || deckBlocks(x, z, fromY)) return false;
  // Four probes keep feet inside the visible parapets without sealing connected stairs.
  if ([[radius, 0], [-radius, 0], [0, radius], [0, -radius]].some(([dx, dz]) => supportAt(x + dx, z + dz, fromY + 0.6) === null)) return false;
  return !OBSTACLES.some(o => !(ignoredLandmark && o.landmarkId === ignoredLandmark) && !gateOpen(o, shortcut)
    && Math.abs(y - o.y) < 2 && Math.abs(x - o.x) < o.w / 2 + radius && Math.abs(z - o.z) < o.d / 2 + radius);
}

export function regionAt(x: number, z: number, feet = Infinity): string {
  return [...SURFACES].reverse().find(s => x >= s.x1 && x <= s.x2 && z >= s.z1 && z <= s.z2 && s.y + (((s.endY ?? s.y) - s.y) * (z - s.z1)) / (s.z2 - s.z1) <= feet + 0.6)?.name ?? '旧街边缘';
}

export function lineClear(a: Vec3, b: Vec3, shortcut: WorldAccess = false, ignoredLandmark?: string): boolean {
  const count = Math.max(1, Math.ceil(Math.hypot(a.x - b.x, a.z - b.z) / 0.35));
  let { y } = a;
  for (let i = 1; i <= count; i += 1) {
    const t = i / count; const x = a.x + (b.x - a.x) * t; const z = a.z + (b.z - a.z) * t;
    if (!canOccupy(x, z, y, shortcut, 0.05, ignoredLandmark)) return false;
    y = supportAt(x, z, y + 0.6) ?? y;
  }
  return Math.abs(y - b.y) < 0.8;
}

// The same visible 72cm parapets are used by rendering and player collision.
// Edge order: west, east, north, south. Open edges are visibly unrailed drops.
export function surfaceRails(surface: Surface) {
  const { x1, x2, z1, z2, y, endY = y } = surface;
  const result: { x:number; z:number; y:number; w:number; d:number; slope:number }[] = [];
  for (let edge = 0; edge < 4; edge++) {
    if (surface.openEdges?.includes(edge)) continue;
    const vertical = edge < 2; const span = vertical ? z2 - z1 : x2 - x1; const
count = Math.ceil(span / 0.5);
    for (let i = 0; i < count; i++) {
      const x = vertical ? (edge === 0 ? x1 : x2) : x1 + ((i + 0.5) * span) / count;
      const z = vertical ? z1 + ((i + 0.5) * span) / count : (edge === 2 ? z1 : z2);
      const dx = vertical ? (edge === 0 ? -0.15 : 0.15) : 0; const
dz = vertical ? 0 : (edge === 2 ? -0.15 : 0.15);
      const current = y + ((endY - y) * (z - z1)) / (z2 - z1);
      const neighbor = heightAt(x + dx, z + dz); const
inside = heightAt(x - dx, z - dz);
      if ((inside !== null && inside > current + 0.4) || (neighbor !== null && Math.abs(neighbor - current) < 0.5)) continue;
      result.push({ x, z, y: current, w: vertical ? 0.2 : span / count + 0.02, d: vertical ? span / count + 0.02 : 0.2, slope: vertical ? (endY - y) / (z2 - z1) : 0 });
    }
  }
  return result;
}
export const PARAPETS = SURFACES.flatMap(surfaceRails);
export function supportAt(x:number, z:number, ceiling = Infinity):number | null {
  let best:number | null = null;
  for (const s of SURFACES) {
    if (x < s.x1 || x > s.x2 || z < s.z1 || z > s.z2) continue;
    const y = s.y + (((s.endY ?? s.y) - s.y) * (z - s.z1)) / (s.z2 - s.z1);
    if (y <= ceiling + 0.001 && (best === null || y > best))best = y;
  }
  return best;
}
export function playerBlocked(x:number, z:number, feet:number, access:WorldAccess, radius = 0.24):boolean {
  if (OBSTACLES.some(o => !gateOpen(o, access) && feet < o.y + o.h - 0.02 && feet + 1.65 > o.y && Math.abs(x - o.x) < o.w / 2 + radius && Math.abs(z - o.z) < o.d / 2 + radius)) return true;
  return PARAPETS.some(o => feet < o.y + o.slope * (z - o.z) + 0.73 && feet + 1.65 > o.y && Math.abs(x - o.x) < o.w / 2 + radius && Math.abs(z - o.z) < o.d / 2 + radius);
}

/** Deck sides share head clearance between navigation and physical movement. */
export function deckBlocks(x:number, z:number, feet:number):boolean {
  return SURFACES.some(s => {
    if (x < s.x1 || x > s.x2 || z < s.z1 || z > s.z2) return false;
    const top = s.y + (((s.endY ?? s.y) - s.y) * (z - s.z1)) / (s.z2 - s.z1);
    return top > feet + 0.6 && feet + 1.65 > top - 0.58;
  });
}
