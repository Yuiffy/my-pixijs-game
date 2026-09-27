import data from './geography-data.json';

export const GEOGRAPHY = data;
export const MAP_W = data.width;
export const MAP_H = data.height;
export type Point = [number, number];
export const xy = (id: number): Point => [id % MAP_W, Math.floor(id / MAP_W)];
export const tileId = (x: number, z: number) => z * MAP_W + x;
export const inside = (x: number, z: number) => x >= 0 && x < MAP_W && z >= 0 && z < MAP_H;
export const geoPoint = (lon: number, lat: number): Point => [((lon - data.bounds.west) / (data.bounds.east - data.bounds.west)) * (MAP_W - 1), ((data.bounds.north - lat) / (data.bounds.north - data.bounds.south)) * (MAP_H - 1)];
export const START = data.landmarks[0].grid as Point;
export const END = data.landmarks[data.landmarks.length - 1].grid as Point;
export const LOCKS = data.landmarks.filter(p => p.kind === 'lock').map((p, index) => ({ ...p, index, at: p.grid as Point }));
// Water steps are a gameplay abstraction of the documented 65 m total drop.
// They are NOT the surveyed operating levels of the three real ship locks.
export const WATER_STEPS = [13, 7, 3, 0];
export const basinAt = (id: number) => LOCKS.filter(l => xy(id)[1] >= l.at[1]).length;
export const waterLevel = (id: number) => WATER_STEPS[basinAt(id)];
export const bedLevel = (id: number) => waterLevel(id) - 3;
export const lockCells = (index: number) => {
  const [x, z] = LOCKS[index].at;
  return Array.from({ length: 15 }, (_, i) => tileId(x - 1 + (i % 3), z - 2 + Math.floor(i / 3)));
};
export const isPort = (id: number) => [START, END].some(([x, z]) => Math.hypot(xy(id)[0] - x, xy(id)[1] - z) <= 1.5);
export const riverNames = ['郁江', '沙坪河', '旧州江', '钦江'];
function segmentDistance(p: Point, a: Point, b: Point) {
  const dx = b[0] - a[0]; const dz = b[1] - a[1]; const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz);
}
const riverSegments = data.rivers.flatMap(r => r.points.slice(1).map((b, i) => ({ name: r.name, a: geoPoint(...r.points[i] as Point), b: geoPoint(...b as Point) })));
export const naturalRivers = Array.from({ length: MAP_W * MAP_H }, (_, id) => {
  const p = xy(id); let name = ''; let distance = Infinity;
  riverSegments.forEach(s => { const d = segmentDistance(p, s.a, s.b); if (d < distance) { distance = d; name = s.name; } });
  return { name, distance };
});
export const referenceLines = data.reference.map(r => r.points.map(p => geoPoint(...p as Point)));
export const regionName = (id: number) => {
  const z = xy(id)[1];
  if (z < 12) return '西津库区 / 沙坪河';
  if (z < LOCKS[0].at[1]) return '分水岭新挖段';
  if (z < LOCKS[1].at[1]) return '旧州江 / 企石';
  if (z < LOCKS[2].at[1]) return '陆屋 / 钦江整治段';
  if (z < 61) return '钦州城区河段';
  return '茅尾海 / 入海段';
};
