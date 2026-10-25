import type { Surface } from './types';

/** These routes really span air; all other streets are backed by earth or masonry. */
export function isSpanningDeck(s: Surface): boolean {
  return /bridge|aqueduct|roof|gallery|balcony|cloister|room|drop|jetty|pier|wharf|quay|ferry|foyer/.test(s.id);
}
export const surfaceHeight = (s: Surface, z: number) => s.y + ((((s.endY ?? s.y) - s.y) * (z - s.z1)) / (s.z2 - s.z1));
export type FoundationCell = { x1: number; x2: number; z1: number; z2: number; bottom: number; endBottom: number };

/** Split at lower routes, leaving their headroom intact. The render and collider
 * consume these exact cells, including ramp undersides. No decorative solid earth. */
export function foundationCells(s: Surface, surfaces: Surface[]): FoundationCell[] {
  const min = Math.min(s.y, s.endY ?? s.y);
  if (min < -10 || isSpanningDeck(s)) return [{ x1: s.x1, x2: s.x2, z1: s.z1, z2: s.z2, bottom: s.y - 0.58, endBottom: (s.endY ?? s.y) - 0.58 }];
  const lower = surfaces.filter(q => q !== s && Math.min(q.y, q.endY ?? q.y) < Math.max(s.y, s.endY ?? s.y) - 0.8 && q.x2 > s.x1 && q.x1 < s.x2 && q.z2 > s.z1 && q.z1 < s.z2);
  const xs = Array.from(new Set([s.x1, s.x2, ...lower.flatMap(q => [Math.max(s.x1, q.x1), Math.min(s.x2, q.x2)])])).sort((a, b) => a - b);
  // Ramps can share their low landing with a street and cross over it at the
  // high end. Split where the underside changes from solid fill to headroom.
  const cuts = lower.flatMap(q => {
    const start = Math.max(s.z1, q.z1); const end = Math.min(s.z2, q.z2);
    const before = surfaceHeight(s, start) - surfaceHeight(q, start);
    const after = surfaceHeight(s, end) - surfaceHeight(q, end);
    return [start, end, ...[0.8, 3.98].flatMap(gap => {
      if (Math.abs(after - before) < 1e-8) return [];
      const z = start + ((gap - before) * (end - start)) / (after - before);
      return z > start && z < end ? [z] : [];
    })];
  });
  const zs = Array.from(new Set([s.z1, s.z2, ...cuts])).sort((a, b) => a - b);
  const cells: FoundationCell[] = [];
  for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < zs.length - 1; j++) {
    const x = (xs[i] + xs[i + 1]) / 2; const z = (zs[j] + zs[j + 1]) / 2;
    const under = lower.filter(q => x > q.x1 && x < q.x2 && z > q.z1 && z < q.z2 && surfaceHeight(q, z) < surfaceHeight(s, z) - 0.8);
    const bottom = (at: number) => Math.min(surfaceHeight(s, at) - 0.58, Math.max(-12, ...under.map(q => surfaceHeight(q, at) + 3.4)));
    cells.push({ x1: xs[i], x2: xs[i + 1], z1: zs[j], z2: zs[j + 1], bottom: bottom(zs[j]), endBottom: bottom(zs[j + 1]) });
  }
  return cells;
}

export function foundationBottom(s: Surface, x: number, z: number, cells: FoundationCell[]): number {
  if (s.y < -10 || isSpanningDeck(s)) return surfaceHeight(s, z) - 0.58;
  return Math.max(...cells.filter(c => x >= c.x1 && x <= c.x2 && z >= c.z1 && z <= c.z2).map(c => c.bottom + ((c.endBottom - c.bottom) * (z - c.z1)) / (c.z2 - c.z1)));
}

/** Broad landings and a sunken court give the first district an actual lower
 * route, with the original rooftop route overlooking it. Gates are untouched. */
export const EARTH_SURFACES: Surface[] = [
  { id: 'courtyard-bank', name: '雨庭石岸', x1: -13, x2: -9, z1: -4, z2: 4, y: 0, color: '#697369' },
  { id: 'market-terrace', name: '夜市西石庭', x1: -11, x2: -6, z1: -45, z2: -38, y: 0, color: '#827663' },
  // Offset, sloping banks break up the square behind the hotel without
  // crossing a locked route. Their tops and their earth below both collide.
  { id: 'courtyard-rain-bank', name: '中庭雨蚀石坡', x1: -4.5, x2: -1, z1: 10, z2: 13, y: 0, endY: -1.25, color: '#72786a' },
  { id: 'courtyard-stone-bank', name: '中庭苔石岸', x1: -1, x2: 5, z1: 10, z2: 12, y: 0, endY: -0.8, color: '#697469' },
  // The shop occupies x <= 7.2 here. Keep both body probes outside its wall.
  { id: 'sunken-descent', name: '落雨下庭阶', x1: 7.5, x2: 9.5, z1: -13, z2: -6, y: -3, endY: 0, color: '#827c68' },
  { id: 'sunken-court', name: '听雨沉庭', x1: -3.5, x2: 9, z1: -27, z2: -13, y: -3, color: '#687966' },
  // Its western side meets the original solid market stairs throughout. A
  // sampled rail here would protrude across their shared, walkable low landing.
  { id: 'sunken-ascent', name: '沉庭登市阶', x1: 5, x2: 9, z1: -37, z2: -27, y: 0, endY: -3, color: '#86806e', openEdges: [0] },
];
