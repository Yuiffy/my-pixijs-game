export type Triple = [number, number, number];
export type Solid = { id:string; position:Triple; size:Triple; color:string; yaw?:number; tilt?:number };
export type House = { id:string; position:Triple; width:number; depth:number; height:number; color:string; rotation?:number; sign?:string; terrace?:boolean };
const random = (n:number) => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
export const HOUSES:House[] = [
  ...[-14.5, -7.5, -0.5].map((x, i) => ({ id: `terrace-${i}`, position: [x, -0.05, -23] as Triple, width: i === 0 ? 7 : 6.8, depth: 4, height: 6.2, terrace: true, color: ['#648386', '#9a8975', '#657d71'][i], sign: ['旧城裁缝', '泰茶 · 茶', 'นวด · 古法'][i] })),
  { id: 'west-house', position: [-24, 0, 7], width: 9, depth: 6, height: 8.7, rotation: Math.PI / 2, color: '#9b8b75', sign: 'ฝน · 雨巷' },
  { id: 'high-house', position: [-22, 0, -14], width: 10, depth: 6, height: 10, rotation: Math.PI / 2, color: '#708f8c' },
  { id: 'merchant', position: [-5, 0, -18.4], width: 7, depth: 3, height: 5.2, color: '#849892', sign: '旧城商行' },
  { id: 'slow-house', position: [3.2, 0, -10.4], width: 8, depth: 6, height: 8.5, color: '#a69a7d', sign: '慢慢来 · SLOW SLOW' },
  { id: 'night-food', position: [-10, 0, -43], width: 9, depth: 6, height: 10, rotation: Math.PI / 2, color: '#967b77', sign: '夜食' },
  { id: 'market-house', position: [17.5, 0, -44], width: 9, depth: 5, height: 9, rotation: -Math.PI / 2, color: '#728b82', sign: 'ตลาด · MARKET' },
  { id: 'north-west', position: [-3, 0, -53], width: 7, depth: 6, height: 9, color: '#a3937b' },
  { id: 'north-east', position: [6, 0, -53], width: 10, depth: 6, height: 11, color: '#809089' },
  { id: 'south-west', position: [-17, 0, 11.5], width: 8, depth: 6, height: 8.7, color: '#74897e' },
  { id: 'south-east', position: [18.5, 0, 5], width: 8, depth: 7, height: 10, rotation: -Math.PI / 2, color: '#738b91' },
  ...Array.from({ length: 13 }, (_, i) => ({ id: `distant-${i}`, position: [-45 + i * 7, 0, -91 - random(i) * 7] as Triple, width: 6 + random(i + 1) * 2, depth: 5, height: 6 + random(i + 2) * 12, color: ['#506e78', '#6f8182', '#597980'][i % 3] })),
];
/** Local boxes used verbatim by both the visible house and its collision. */
export function houseParts(h:House):Solid[] {
  const { width: w, depth: d, height: y } = h;
  const parts:Solid[] = [
    { id: 'walls', position: [0, y / 2 - 0.8, 0], size: [w, y, d], color: h.color },
    { id: 'cornice', position: [0, y - 0.7, 0], size: [w + 0.2, 0.26, d + 0.3], color: '#a19b80' },
  ];
  if (!h.terrace) {
    for (const side of [-1, 1])parts.push({ id: `roof-${side}`, position: [side * w * 0.245, y - 0.25, 0], size: [w * 0.57, 0.22, d + 0.8], tilt: -side * 0.32, color: side === 1 ? '#8e5345' : '#a66b4e' });
    parts.push({ id: 'ridge', position: [0, y + 0.23, 0], size: [0.25, 0.2, d + 0.8], color: '#cea16c' });
  }
  return parts;
}
export const STRUCTURES:Solid[] = [
  { id: 'hotel-base', position: [4, 2.8, 15.6], size: [16, 5.6, 4.8], color: '#59706c' },
  { id: 'hotel-wall', position: [-3.75, 7.2, 15], size: [0.25, 2.4, 5.8], color: '#adab92' },
  { id: 'ferry-roof', position: [18, 4.8, -30], size: [6.7, 0.25, 5.7], color: '#665547' },
  // The eastern wall is now two real posts framing a 4.5m passage to the tide bridge.
  { id: 'ferry-post-n', position: [20.7, 2.35, -32.5], size: [0.3, 4.7, 0.3], color: '#8e7c63' },
  { id: 'ferry-post-s', position: [20.7, 2.35, -27.5], size: [0.3, 4.7, 0.3], color: '#8e7c63' },
  { id: 'temple-wall', position: [-31.5, 7.6, -32.8], size: [6.8, 3.2, 0.35], color: '#8b7462' },
  { id: 'temple-eave', position: [-31.5, 9.2, -33.3], size: [7.8, 0.22, 3.8], color: '#647977' },
  { id: 'tide-foundation', position: [40, -0.05, -61], size: [19, 11.5, 12], color: '#476773' },
  { id: 'bell-foundation', position: [36, 3.7, -80], size: [11, 11.5, 5], color: '#697979' },
  ...[30.5, 49.5].map(x => ({ id: `tide-column-${x}`, position: [x, 9, -67] as Triple, size: [1, 6, 1] as Triple, color: '#b4b6a0' })),
  { id: 'tide-lintel', position: [40, 11.5, -67], size: [20, 1.1, 1.2], color: '#8aa5ab' },
];
function worldPart(h:House, p:Solid):Solid {
 const yaw = h.rotation ?? 0; const c = Math.cos(yaw); const s = Math.sin(yaw); const [x, y, z] = p.position;
 return { ...p, id: `${h.id}/${p.id}`, position: [h.position[0] + c * x + s * z, h.position[1] + y, h.position[2] - s * x + c * z], yaw };
}
export const ARCHITECTURE = [...HOUSES.flatMap(h => houseParts(h).map(p => worldPart(h, p))), ...STRUCTURES];
// Precompute each rotated box basis and broad phase bounds. No render dependency.
const boxes = ARCHITECTURE.map(s => {
 const c = Math.cos(s.yaw ?? 0); const n = Math.sin(s.yaw ?? 0); const a = Math.cos(s.tilt ?? 0); const b = Math.sin(s.tilt ?? 0);
 const axes:Triple[] = [[c * a, b, -n * a], [-c * b, a, n * b], [n, 0, c]];
 const half = s.size.map(v => v / 2);
 return { solid: s, axes, half, rx: axes.reduce((v, q, i) => v + Math.abs(q[0]) * half[i], 0), rz: axes.reduce((v, q, i) => v + Math.abs(q[2]) * half[i], 0) };
});
// Static spatial buckets keep every movement substep local to nearby buildings.
const bucketSize = 8;
const buckets = new Map<string, typeof boxes>();
for (const box of boxes) {
  for (let x = Math.floor((box.solid.position[0] - box.rx) / bucketSize); x <= Math.floor((box.solid.position[0] + box.rx) / bucketSize); x++) {
    for (let z = Math.floor((box.solid.position[2] - box.rz) / bucketSize); z <= Math.floor((box.solid.position[2] + box.rz) / bucketSize); z++) {
      const key = `${x},${z}`; const items = buckets.get(key) ?? []; items.push(box); buckets.set(key, items);
    }
  }
}
/** Exact entry/exit heights of a vertical line through an oriented visible box. */
export function architectureIntervals(x:number, z:number) {
 const hits:{ bottom:number;top:number;id:string }[] = [];
 for (const b of buckets.get(`${Math.floor(x / bucketSize)},${Math.floor(z / bucketSize)}`) ?? []) {
  const [cx, cy, cz] = b.solid.position; const dx = x - cx; const dz = z - cz;
  if (Math.abs(dx) > b.rx + 0.0001 || Math.abs(dz) > b.rz + 0.0001) continue;
  let lo = -Infinity; let hi = Infinity;
  for (let i = 0; i < 3; i++) {
   const axis = b.axes[i]; const offset = axis[0] * dx + axis[2] * dz; const slope = axis[1]; const half = b.half[i];
   if (Math.abs(slope) < 1e-8) { if (Math.abs(offset) > half + 0.0001) { lo = Infinity; break; } } else { const a = (-half - offset) / slope; const c = (half - offset) / slope; lo = Math.max(lo, Math.min(a, c)); hi = Math.min(hi, Math.max(a, c)); }
  }
  if (lo <= hi)hits.push({ bottom: cy + lo, top: cy + hi, id: b.solid.id });
 }
 return hits;
}
export function architectureSupport(x:number, z:number, ceiling:number):number | null {
 let y:number | null = null;
 for (const hit of architectureIntervals(x, z)) if (hit.top <= ceiling + 0.001 && (y === null || hit.top > y))y = hit.top;
 return y;
}
export function architectureBlocked(x:number, z:number, feet:number, radius = 0.24, step = 0.6):boolean {
 return [[0, 0], [radius, 0], [-radius, 0], [0, radius], [0, -radius]].some(([dx, dz]) => architectureIntervals(x + dx, z + dz).some(h => h.top > feet + step + 0.001 && h.bottom < feet + 1.65 - 0.001));
}
