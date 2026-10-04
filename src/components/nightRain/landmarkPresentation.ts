import type { GameState, Landmark } from './types';

export type DiscoveryModel = 'paper' | 'book' | 'rubbing' | 'sign' | 'stele' | 'seal' | 'bell' | 'wheel' | 'winch' | 'lantern' | 'basin' | 'name-lamp' | 'laptop' | 'spent-lamp';
export type DiscoveryRole = 'lore' | 'clue' | 'mechanism';
type Presentation = { model: DiscoveryModel; role: DiscoveryRole; height: number; offset: number };
const note = (model: DiscoveryModel, role: DiscoveryRole = 'lore', height = 2.1): Presentation => ({ model, role, height, offset: -0.85 });

// Keep the original progress IDs and note kind: existing saves remain readable.
export const NOTE_PRESENTATIONS: Record<string, Presentation> = {
  laptop: note('laptop'),
  'rooftop-note': note('paper'),
  'temple-note': note('stele'),
  'temple-lamp': note('spent-lamp', 'lore', 1.3),
  'canal-lamp': note('spent-lamp', 'lore', 1.3),
  'ferry-note': { ...note('paper'), offset: 1 },
  'tide-note': note('stele'),
  'drop-note': note('paper'),
  'tide-seal': note('seal'),
  'dawn-bell': note('bell', 'mechanism', 3.8),
  'castle-note': note('sign'),
  'weaver-note': note('paper'),
  'cistern-note': note('stele'),
  'archive-note': note('book'),
  'royal-note': note('stele'),
  'chapter-bell': note('bell', 'mechanism', 3.8),
  'valley-note': note('stele'),
  'village-note': note('paper'),
  'mill-sluice': note('wheel', 'mechanism', 3.1),
  'ferry-winch': note('winch', 'mechanism', 3.1),
  'bamboo-note': note('paper'),
  'monastery-sluice': note('wheel', 'mechanism', 3.1),
  'river-note': note('stele'),
  'river-heart': { ...note('lantern', 'mechanism', 4.2), offset: -1.05 },
  'haven-sign': note('sign'),
  'haven-bell': { ...note('bell', 'mechanism', 3.8), offset: 0 },
  'haven-water': { ...note('basin', 'mechanism', 3.1), offset: 0 },
  'haven-name': { ...note('name-lamp', 'mechanism', 3.1), offset: 0 },
  'names-register': note('book', 'clue', 2.8),
  'keel-rubbing': note('rubbing', 'clue', 2.8),
  'well-testimony': note('book', 'clue', 2.8),
  'crypt-note': note('stele'),
  'cave-note': note('sign'),
};

export function notePresentation(l: Landmark): Presentation | null {
  return l.kind === 'note' ? NOTE_PRESENTATIONS[l.id] ?? note('paper') : null;
}
export type DiscoveryPhase = 'sealed' | 'ready' | 'complete';
export function discoveryPhase(s: GameState, id: string): DiscoveryPhase {
  const echo = ['haven-bell', 'haven-water', 'haven-name'].indexOf(id);
  if (echo >= 0) {
    if (s.haven.echoes > echo) return 'complete';
    return s.haven.recruits.length === 2 && s.valleyComplete ? 'ready' : 'sealed';
  }
  if (s.collected.includes(id)) return 'complete';
  const guardian = id === 'mill-sluice' || id === 'ferry-winch' ? 'drowned-warden' : id === 'monastery-sluice' ? 'silent-abbot' : id === 'river-heart' ? 'river-serpent' : id === 'chapter-bell' ? 'rain-regent' : id === 'dawn-bell' ? 'nana-tide' : null;
  if (guardian && !s.defeatedGuests.includes(guardian)) return 'sealed';
  if (id === 'chapter-bell' && !s.collected.includes('food')) return 'sealed';
  return 'ready';
}
export function discoveryColor(role: DiscoveryRole, phase: DiscoveryPhase): string {
  return phase === 'complete' ? role === 'mechanism' ? '#86dcc3' : '#9baea9' : role === 'mechanism' ? phase === 'sealed' ? '#d8a16a' : '#ffda8b' : role === 'clue' ? '#c8a6ff' : '#e4eee0';
}
export function notePrompt(s: GameState, l: Landmark): string {
  if (notePresentation(l)?.role !== 'mechanism') {
    if (!s.collected.includes(l.id)) return l.label;
    return l.id === 'names-register' ? '重读被删去的名册' : l.id === 'keel-rubbing' ? '重看龙骨拓片' : ['laptop', 'temple-lamp', 'canal-lamp', 'tide-seal'].includes(l.id) ? l.label : `${l.label} · 再读`;
  }
  if (discoveryPhase(s, l.id) !== 'complete') return l.label;
  return l.id === 'river-heart' ? '端详归水灯台 · 愿灯已归水' : l.id === 'ferry-winch' ? '端详系缆绞盘 · 已修复' : l.id === 'mill-sluice' || l.id === 'monastery-sluice' ? '端详水闸轮 · 已开启' : l.id === 'chapter-bell' || l.id === 'dawn-bell' ? '轻叩旧钟 · 已响起' : `${l.label} · 已回应`;
}

export function nearbyDiscoveries(s: GameState, landmarks: Landmark[]) {
  return landmarks.filter(l => l.kind === 'note' && Math.abs(l.y - s.player.y) < 10 && Math.hypot(l.x - s.player.x, l.z - s.player.z) < 40).map(l => ({ id: l.id, ...notePresentation(l), phase: discoveryPhase(s, l.id) }));
}
