import type { GameState, Vec3, WorldAccess } from './types';
import { canOccupy, supportAt, interactionPoint, LANDMARKS } from './world';

export type CompanionSkin = 'biscuit' | 'otter';
export type Companion = {
  enabled: boolean; skin: CompanionSkin; voice: boolean;
  position: Vec3; targetId: string | null; suggestedId: string | null; path: Vec3[];
  status: 'following' | 'leading' | 'waiting' | 'danger' | 'arrived';
  subtitle: string; serial: number; until: number; nextHint: number;
  seen: Record<string, { nearest: number; stage: number; missed?: boolean }>;
  lastPlayer: Vec3; still: number; routeAt: number;
};
export const companionName = (skin: CompanionSkin) => (skin === 'otter' ? '獭獭栞' : '饼干岁');
export const createCompanion = (s: GameState): Companion => ({
  enabled: true,
skin: 'biscuit',
voice: false,
position: { x: s.player.x + 1.1, y: s.player.y, z: s.player.z },
  targetId: null,
suggestedId: null,
path: [],
status: 'following',
subtitle: '',
serial: 0,
  until: 0,
nextHint: 5,
seen: {},
lastPlayer: { ...s.player },
still: 0,
routeAt: -100,
});
const distance = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.z - b.z, a.y - b.y);
const labels: Record<string, string> = {
  'temple-lamp': '莲池旧灯',
'canal-lamp': '摆渡旧灯',
'temple-flask': '刻露瓶',
'temple-gate': '闭水门闩',
'temple-note': '残钟铭文',
'ferry-note': '摆渡遗签',
  'tide-note': '潮汐港入口',
'harbor-gate': '归灯长桥绞盘',
'net-cache': '风铃木匣',
'drop-note': '风铃残笺',
'frog-cache': '苔灯戏匣',
'tide-seal': '七重潮门',
'dawn-bell': '黎明钟',
  laptop: '旅馆的笔记本',
courtyard: '中庭雨灯',
'alley-cache': '晾衣巷的钱袋',
  'roof-charm': '屋脊金铃护符',
'rooftop-note': '屋脊上的便签',
  'cloister-cache': '回廊宝箱',
'lookout-cache': '望台宝箱',
shortcut: '侧门门闩',
food: '深夜食堂',
boss: '铁伞前的夜市入口',
};
export const targetLabel = (id: string | null) => (id ? labels[id] ?? id : '下一处发现');
export function guideTargets(s: GameState) {
  return LANDMARKS.filter(l => {
    if (l.id === 'tide-note') return true;
    if (l.id === 'harbor-gate') return !s.harborGate;
    if (l.id === 'dawn-bell') return s.defeatedGuests.includes('nana-tide') && !s.collected.includes(l.id);
    if (l.id === 'temple-gate') return !s.templeGate;
    if (l.id === 'shortcut') return !s.shortcut;
    if (l.id === 'food') return s.bossDefeated && !s.collected.includes('food');
    if (l.kind === 'rest') return true;
    return !s.collected.includes(l.id);
  });
}
export function mainTarget(s: GameState): string {
  if (!s.collected.includes('laptop') && s.checkpoint === 'room') return 'laptop';
  if (s.checkpoint === 'room') return 'courtyard';
  if (s.collected.includes('food') && !s.collected.includes('dawn-bell')) return !s.visited.includes('潮汐港 · 灯市') ? 'tide-note' : !s.defeatedGuests.includes('nana-tide') ? 'tide-seal' : 'dawn-bell';
  if (s.collected.includes('food')) return LANDMARKS.find(l => ['cache', 'charm', 'flask'].includes(l.kind) && !s.collected.includes(l.id))?.id ?? 'courtyard';
  if (s.bossDefeated) return 'food';
  if (!s.charm) return 'roof-charm';
  if (!s.shortcut) return 'shortcut';
  return 'boss';
}
export function speak(c: Companion, s: GameState, text: string, seconds = 7) {
  c.subtitle = text; c.serial += 1; c.until = s.time + seconds; c.nextHint = s.time + 15;
}

// Navigation uses the same radii, ramp heights and closed gate as the player.
// The guide never cuts across a wall or takes an aerial shortcut over a courtyard.
export function walkSegment(a: Vec3, b: Vec3, shortcut: WorldAccess, maxStep = 0.25): boolean {
  const count = Math.max(1, Math.ceil(distance(a, b) / 0.15));
  let { y } = a;
  for (let i = 1; i <= count; i += 1) {
    const t = i / count; const x = a.x + (b.x - a.x) * t; const z = a.z + (b.z - a.z) * t;
    if (!canOccupy(x, z, y, shortcut, 0.36)) return false;
    const nextY = supportAt(x, z, y + 0.6) ?? y;
    // Navigation leaves clearance at stair edges; followers do not hit exact
    // mathematical waypoints and must not be sent over the step-height limit.
    if (Math.abs(nextY - y) > maxStep) return false;
    y = nextY;
  }
  return Math.abs(y - b.y) < 0.6;
}
export function findPath(start: Vec3, destination: Vec3, shortcut: WorldAccess): Vec3[] {
  const step = 0.5;
  const key = (x: number, z: number, y: number) => `${x},${z},${Math.round(y * 10)}`;
  const points = new Map<string, Vec3>(); const previous = new Map<string, string>();
  const costs = new Map<string, number>();
  const heap: { id: string; priority: number }[] = [];
  const push = (id: string, priority: number) => {
    heap.push({ id, priority }); let i = heap.length - 1;
    while (i > 0) { const p = Math.floor((i - 1) / 2); if (heap[p].priority <= priority) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; }
  };
  const pop = () => {
    const first = heap[0]; const last = heap.pop()!;
    if (heap.length) {
 heap[0] = last; let i = 0;
      for (;;) {
 const left = i * 2 + 1; const right = left + 1; let next = i;
        if (left < heap.length && heap[left].priority < heap[next].priority) next = left;
        if (right < heap.length && heap[right].priority < heap[next].priority) next = right;
        if (next === i) break; [heap[i], heap[next]] = [heap[next], heap[i]]; i = next;
      }
    }
    return first;
  };
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
    const x = Math.round(start.x / step) * step + dx * step;
    const z = Math.round(start.z / step) * step + dz * step; const y = supportAt(x, z, start.y + 0.6);
    if (y === null) continue;
    const p = { x, y, z }; if (!walkSegment(start, p, shortcut)) continue;
    const id = key(x, z, y); points.set(id, p); costs.set(id, distance(start, p)); push(id, distance(start, p) + distance(p, destination));
  }
  const closed = new Set<string>();
  while (heap.length && closed.size < 24000) {
    const { id } = pop(); if (closed.has(id)) continue; closed.add(id);
    const p = points.get(id)!;
    if (distance(p, destination) < 1 && walkSegment(p, destination, shortcut)) {
      const result = [{ ...destination }, p]; let cursor = id;
      while (previous.has(cursor)) { cursor = previous.get(cursor)!; result.push(points.get(cursor)!); }
      result.push({ ...start }); result.reverse();
      const simple = [result[0]];
      for (let i = 1; i < result.length; i++) {
        if (i === result.length - 1 || !walkSegment(simple[simple.length - 1], result[i + 1], shortcut)) simple.push(result[i]);
      }
      return simple;
    }
    for (const [dx, dz] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
      const x = p.x + dx; const z = p.z + dz; const y = supportAt(x, z, p.y + 0.6); if (y === null) continue; const next = key(x, z, y);
      if (closed.has(next)) continue;

      const q = { x, y, z }; if (!walkSegment(p, q, shortcut)) continue;
      const cost = costs.get(id)! + distance(p, q);
      if (cost >= (costs.get(next) ?? Infinity)) continue;
      points.set(next, q); costs.set(next, cost); previous.set(next, id); push(next, cost + distance(q, destination));
    }
  }
  return [];
}
function destinationFor(id: string): Vec3 | undefined {
  if (id === 'boss') return { x: 4, y: 0, z: -37 };
  const landmark = LANDMARKS.find(l => l.id === id);
  return landmark ? interactionPoint(landmark) : undefined;
}
export function recommendedTarget(c: Companion, s: GameState): string {
  return c.suggestedId && guideTargets(s).some(l => l.id === c.suggestedId) ? c.suggestedId : mainTarget(s);
}
export function leadTo(c: Companion, s: GameState, id = recommendedTarget(c, s)): boolean {
  if (!c.enabled) return false;
  const destination = destinationFor(id); if (!destination) return false;
  const path = findPath(s.player, destination, s);
  if (!path.length) { speak(c, s, '这条路现在走不通。我们先回到宽一点的地方，再一起找路。'); return false; }
  c.position = { x: s.player.x, y: s.player.y, z: s.player.z };
  c.path = path.slice(1); c.targetId = id; c.status = 'leading'; c.routeAt = s.time;
  speak(c, s, id === 'tide-note' ? '去潮汐港！先走夜市东侧的运河，再穿过摆渡庵向东过桥。我在前面等你，不用跳水。' : `好呀，去${targetLabel(id)}！我走前面，你慢慢跟上。`); return true;
}
export function stopLeading(c: Companion, s: GameState) {
  c.path = []; c.targetId = null; c.status = 'following'; speak(c, s, '好，我们自己逛。我一直在你身边。');
}
export function updateCompanion(c: Companion, s: GameState, dt: number) {
  if (!c.enabled || s.mode !== 'playing' || s.paused || dt <= 0) return;
  const p = s.player;
  const moved = distance(p, c.lastPlayer); c.still = moved < 0.025 ? c.still + dt : 0; c.lastPlayer = { ...p };
  const danger = s.enemies.find(e => e.hp > 0 && e.aggro && distance(e, p) < 8);
  const discoveries = guideTargets(s).filter(v => ['cache', 'charm', 'flask'].includes(v.kind)).sort((a, b) => distance(p, a) - distance(p, b));
  for (const l of discoveries) {
    const seen = c.seen[l.id] ?? { nearest: Infinity, stage: 0 };
    seen.nearest = Math.min(seen.nearest, distance(p, l)); c.seen[l.id] = seen;
  }
  if (c.targetId && s.collected.includes(c.targetId)) { c.targetId = null; c.path = []; c.status = 'following'; speak(c, s, '拿到了！每一段绕路，都藏着一点小惊喜。'); }
  if (c.targetId && c.status !== 'arrived') {
    if (danger) {
      if (c.status !== 'danger') speak(c, s, '先别急着跟我！前面有人，Q 锁定，等起手后再弹反或闪开。');
      c.status = 'danger';
    } else if (distance(c.position, p) > 4.3) {
      if (c.status !== 'waiting') speak(c, s, '我在这里等你。看到我头上的小光环了吗？');
      c.status = 'waiting';
      // If the player explores elsewhere, return and compute a fresh walkable route.
      if (distance(c.position, p) > 10 && s.time - c.routeAt > 10) leadTo(c, s, c.targetId);
    } else {
      c.status = 'leading'; const next = c.path[0];
      if (next) {
        const d = distance(c.position, next); const amount = Math.min(1, (dt * 2.8) / Math.max(0.001, d));
        const x = c.position.x + (next.x - c.position.x) * amount;
        const z = c.position.z + (next.z - c.position.z) * amount;
        const candidate = { x, y: supportAt(x, z, c.position.y + 0.6) ?? next.y, z };
        // Wait at bends until the player has rounded them too. A visible guide
        // across a railing is not a usable direction to follow.
        if (walkSegment(p, candidate, s, 0.6)) {
          c.position = candidate;
          if (d < 0.15) c.path.shift();
        } else if (!walkSegment(p, c.position, s, 0.6) && s.time - c.routeAt > 2) leadTo(c, s, c.targetId);
        else c.status = 'waiting';
      } else {
        c.status = 'arrived'; speak(c, s, c.targetId === 'tide-note' ? '这就是潮汐港的潮桥！沿桥向东走进灯市，暖灯长阶通往七海。' : c.targetId === 'boss' ? '前面就是铁伞。留一点体力，我陪你慢慢试。' : `到了，${targetLabel(c.targetId)}就在这里。靠近后按 E 试试。`, 9);
      }
    }
  } else if (!c.targetId) {
    const desired = { x: p.x + Math.cos(p.facing) * 1.1, y: p.y + p.jumpHeight, z: p.z - Math.sin(p.facing) * 1.1 };
    const amount = Math.min(1, dt * 5);
    c.position.x += (desired.x - c.position.x) * amount; c.position.y += (desired.y - c.position.y) * amount; c.position.z += (desired.z - c.position.z) * amount;
  }
  if (s.time < c.nextHint || c.targetId) return;
  if (danger) {
    speak(c, s, p.hp < 45 && p.flasks > 0 ? '先退开一点，R 喝椰子水。恢复的时候也会被打断哦。' : '不用一直按攻击。看他抬手，留一点体力给闪避。红色横扫不能弹反。'); return;
  }
  for (const l of discoveries) {
    const d = distance(p, l); const seen = c.seen[l.id] ?? { nearest: Infinity, stage: 0 };
    c.seen[l.id] = seen; const old = seen.nearest; seen.nearest = Math.min(old, d);
    if (d < 3 && seen.stage < 3) { seen.stage = 3; c.suggestedId = l.id; speak(c, s, `越来越近了！${targetLabel(l.id)}就在旁边，靠近后按 E。`); return; }
    if (!seen.missed && d > old + 2 && old < 10) { seen.stage = 2; seen.missed = true; c.suggestedId = l.id; speak(c, s, `等一下，好像错过了什么……刚才那条岔路还没看完。需要我带路的话，按 C 找我。`); return; }
    if (d < 10 && seen.stage === 0) { seen.stage = 1; c.suggestedId = l.id; speak(c, s, l.kind === 'charm' ? '听，附近有很轻的铃声。不着急赶路，好东西常常藏在转角。' : '那条岔路好像藏着什么。要不要一起看看？'); return; }
  }
  if (c.still > 18) { speak(c, s, '迷路也没关系。按 C 跟我说“直接带我去”，我就在前面给你带路。'); c.still = 0; }
}
