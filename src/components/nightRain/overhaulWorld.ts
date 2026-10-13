import type { Landmark, Surface, Vec3 } from './types';
import type { Solid } from './architecture';

// A visible optional construction route above Nana's main courtyard. Missing a
// jump lands on the same courtyard, rather than hiding an instant-death void.
export const BUILDING_SURFACES: Surface[] = [
  { id: 'nana-scaffold-stair', name: '镐庭施工阶', x1: -194, x2: -189, z1: -397, z2: -389, y: 5, endY: 2, color: '#e2c492', openEdges: [0, 1, 2, 3] },
  { id: 'nana-roof-a', name: '白桦方屋 · 前檐', x1: -194, x2: -189, z1: -402, z2: -397, y: 5, color: '#e4dbbc', openEdges: [0, 1, 2, 3] },
  { id: 'nana-roof-b', name: '金镐方屋 · 上檐', x1: -194, x2: -189, z1: -410, z2: -404, y: 5.8, color: '#eac975', openEdges: [0, 1, 2, 3] },
  { id: 'nana-drop-terrace', name: '矿灯落台', x1: -194, x2: -189, z1: -414, z2: -410, y: 4.2, color: '#96b7a8', openEdges: [0, 1, 2, 3] },
];
export const BUILDING_LANDMARKS: Landmark[] = [
  { id: 'nana-blueprint', kind: 'note', label: '读七海的施工图', x: -196, y: 2, z: -389 },
  { id: 'nana-pickaxe', kind: 'cache', label: '收下七海的试作矿镐', x: -191.5, y: 5.8, z: -407 },
  { id: 'mill-lamp', kind: 'rest', label: '镐庭雨灯', x: -182, y: 2, z: -403.2 },
];
export const BUILDING_REST_POINTS: Record<string, Vec3> = { 'mill-lamp': { x: -183.2, y: 2, z: -403.2 } };
const block = (id: string, position: [number, number, number], size: [number, number, number], color: string): Solid => ({ id, position, size, color });
export const BUILDING_SOLIDS: Solid[] = [
  block('nana-birch-house', [-191.5, 3.4, -399.5], [5, 2.8, 5], '#d9d4b9'),
  block('nana-gold-house', [-191.5, 3.8, -407], [5, 3.6, 6], '#d6b778'),
  block('nana-drop-foundation', [-191.5, 3, -412], [5, 2, 4], '#b6c3b5'),
  // Block-built facade sits behind the arena; the sluice and main route stay open.
  ...Array.from({ length: 6 }, (_, i) => block(`nana-palace-${i}`, [-214.7, 3.5 + i * 0.9, -400], [1.4, 1, 14 - i * 1.5], i % 2 ? '#cda85d' : '#ded5b7')),
];

// Pullies now sit on the arrival route. Physical doors keep their original
// collision and inside-only hand latch as an alternative interaction.
export const REMOTE_LEVERS: Record<string, Vec3> = {
  shortcut: { x: 6, y: 0, z: -36.5 },
  'harbor-gate': { x: 31.5, y: 0, z: -30 },
  'weaver-gate': { x: -47, y: 12, z: -127 },
  'archive-gate': { x: -56, y: 12, z: -190.5 },
  'royal-gate': { x: -112.5, y: 24, z: -223 },
  'cliff-gate': { x: -99, y: 10, z: -373 },
  'reed-gate': { x: -146, y: 8, z: -444 },
};
