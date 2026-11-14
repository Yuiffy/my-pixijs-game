/** ECHO ZERO — level geometry, collision and authored spawn data (metres, Y-up). */

export interface Box { x: number; z: number; hw: number; hd: number; h: number; kind: string }

/** The chapter runs from the subway platform (z=+19) to the quarantine plaza (z=-45). */
export const LEVEL = {
  startX: 0,
  startZ: 19,
  stationFront: 8,
  streetEnd: -30,
  plazaEnd: -52,
  streetHalfWidth: 10.4,
  stationHalfWidth: 8.6,
  plazaHalfWidth: 13.2,
  backZ: 24,
  checkpoint: { x: 0, z: -22.5 },
  bossGate: -33,
  bossSpawn: { x: 0, z: -43 },
} as const;

/** Solid obstacles. Both the simulation and the renderer read this list. */
export const OBSTACLES: Box[] = [
  // Platform columns and benches.
  { x: -6.4, z: 15, hw: 0.42, hd: 0.42, h: 4.2, kind: 'pillar' },
  { x: 6.4, z: 15, hw: 0.42, hd: 0.42, h: 4.2, kind: 'pillar' },
  { x: -6.4, z: 9.6, hw: 0.42, hd: 0.42, h: 4.2, kind: 'pillar' },
  { x: 6.4, z: 9.6, hw: 0.42, hd: 0.42, h: 4.2, kind: 'pillar' },
  { x: -5.2, z: 12.7, hw: 1.7, hd: 0.36, h: 0.62, kind: 'bench' },
  { x: 5.2, z: 12.7, hw: 1.7, hd: 0.36, h: 0.62, kind: 'bench' },
  // Abandoned vehicles in the boulevard.
  { x: -4.1, z: 1.4, hw: 1.15, hd: 2.35, h: 1.5, kind: 'car' },
  { x: 4.6, z: -8.2, hw: 1.15, hd: 2.35, h: 1.5, kind: 'car' },
  { x: -4.8, z: -17.3, hw: 1.15, hd: 2.35, h: 1.5, kind: 'car' },
  { x: 5.1, z: -26.4, hw: 1.15, hd: 2.35, h: 1.5, kind: 'car' },
  // Barricades funnel the player through the street.
  { x: 1.6, z: -5.3, hw: 1.8, hd: 0.32, h: 1.05, kind: 'barricade' },
  { x: -3.2, z: -12.4, hw: 1.8, hd: 0.32, h: 1.05, kind: 'barricade' },
  { x: 2.4, z: -20.2, hw: 1.8, hd: 0.32, h: 1.05, kind: 'barricade' },
  // Signal tower plinth (checkpoint sits on top of it, but the base blocks walking).
  { x: 0, z: -22.5, hw: 0.72, hd: 0.72, h: 1.2, kind: 'tower' },
  // Plaza quarantine blocks.
  { x: -8.6, z: -36.5, hw: 1.5, hd: 0.7, h: 1.1, kind: 'barricade' },
  { x: 8.6, z: -36.5, hw: 1.5, hd: 0.7, h: 1.1, kind: 'barricade' },
  { x: -10.4, z: -45.6, hw: 1.5, hd: 0.7, h: 1.1, kind: 'barricade' },
  { x: 10.4, z: -45.6, hw: 1.5, hd: 0.7, h: 1.1, kind: 'barricade' },
];

export interface Spawn { id: number; kind: 'shambler' | 'runner' | 'boss'; x: number; z: number; trigger: number; label?: string }

/** Enemies appear as the player crosses authored trigger lines. */
export const SPAWNS: Spawn[] = [
  { id: 1, kind: 'shambler', x: 0.6, z: 3.4, trigger: 9.5, label: '游荡体' },
  { id: 2, kind: 'shambler', x: -1.8, z: -11.6, trigger: -5 },
  { id: 3, kind: 'runner', x: 3.1, z: -16.4, trigger: -5 },
  { id: 4, kind: 'shambler', x: -2.6, z: -27.8, trigger: -25 },
  { id: 9, kind: 'boss', x: LEVEL.bossSpawn.x, z: LEVEL.bossSpawn.z, trigger: LEVEL.bossGate, label: '零号 · 回声' },
];

export const RADIO_LINES: { speaker: string; text: string; at: number; ttl: number; tone: 'radio' | 'system' | 'danger' | 'lore' }[] = [
  { speaker: '栞栞', text: '……听得到吗？第七区的信号只剩你这一格了。', at: 0.5, ttl: 3.8, tone: 'radio' },
  { speaker: '栞栞', text: '别回站台。它们循着声音走，雨声能替你挡一挡。', at: 3.9, ttl: 3.9, tone: 'radio' },
  { speaker: '栞栞', text: '沿霓虹往北。信号塔还亮着，我能在那儿把你的坐标钉住。', at: 7.3, ttl: 4.2, tone: 'radio' },
  { speaker: '系统', text: '封锁等级：零日 · 禁止通行', at: 9.9, ttl: 3.2, tone: 'system' },
];

export function halfWidthAt(z: number): number {
  if (z > LEVEL.stationFront) return LEVEL.stationHalfWidth;
  if (z > LEVEL.streetEnd) return LEVEL.streetHalfWidth;
  return LEVEL.plazaHalfWidth;
}

/** Steer a point out of every solid box, then clamp it to the walkable corridor. */
export function resolvePosition(x: number, z: number, radius = 0.42): { x: number; z: number } {
  let px = x;
  let pz = z;
  const margin = radius + 0.06;
  for (const b of OBSTACLES) {
    if (b.kind === 'bench') continue;
    const dx = px - b.x;
    const dz = pz - b.z;
    const ox = b.hw + margin - Math.abs(dx);
    const oz = b.hd + margin - Math.abs(dz);
    if (ox <= 0 || oz <= 0) continue;
    if (ox < oz) px = b.x + Math.sign(dx || 1) * (b.hw + margin);
    else pz = b.z + Math.sign(dz || 1) * (b.hd + margin);
  }
  const half = halfWidthAt(pz) - margin;
  px = Math.max(-half, Math.min(half, px));
  pz = Math.max(LEVEL.plazaEnd + margin, Math.min(LEVEL.backZ - margin, pz));
  return { x: px, z: pz };
}

export function areaName(z: number): string {
  if (z > LEVEL.stationFront) return '第七区 · 末班站台';
  if (z > LEVEL.streetEnd) return '第七区 · 霓虹长街';
  if (z > LEVEL.bossGate) return '第七区 · 信号塔前庭';
  return '第七区 · 检疫广场';
}

/** Deterministic pseudo-random generator so the authored city is identical in tests. */
export function rng(seed: number): () => number {
  // Park–Miller LCG: deterministic across browsers without 32-bit integer tricks.
  const modulus = 2147483647;
  let value = Math.abs(Math.floor(seed)) % modulus || 1;
  return () => {
    value = (value * 16807) % modulus;
    return (value - 1) / (modulus - 1);
  };
}

export interface Facade {
  x: number; z: number; w: number; d: number; h: number;
  seed: number; sign: string; signColor: string; lit: boolean;
}

const SIGNS = ['回声', 'ECHO', '第七区', '24H', 'NO SIGNAL', '检疫', 'SUI', '余烬', '闭店', '07'];
const NEON = ['#43e8ff', '#ff3d8b', '#ffc061', '#8f7bff', '#48ffc4'];

export function buildFacades(): Facade[] {
  const random = rng(20261113);
  const out: Facade[] = [];
  for (let i = 0; i < 9; i += 1) {
    const z = 4 - i * 4.6;
    for (const side of [-1, 1]) {
      const h = 9 + random() * 17;
      out.push({
        x: side * (13.4 + random() * 1.1),
        z: z + (random() - 0.5) * 1.4,
        w: 5.6 + random() * 2.2,
        d: 4.2,
        h,
        seed: Math.floor(random() * 10000),
        sign: SIGNS[Math.floor(random() * SIGNS.length)],
        signColor: NEON[Math.floor(random() * NEON.length)],
        lit: random() > 0.24,
      });
    }
  }
  for (let i = 0; i < 4; i += 1) {
    const z = -34 - i * 4.6;
    for (const side of [-1, 1]) {
      out.push({
        x: side * (16.5 + random() * 1.4),
        z,
        w: 6.4,
        d: 5,
        h: 14 + random() * 12,
        seed: Math.floor(random() * 10000),
        sign: SIGNS[Math.floor(random() * SIGNS.length)],
        signColor: NEON[Math.floor(random() * NEON.length)],
        lit: random() > 0.55,
      });
    }
  }
  return out;
}
