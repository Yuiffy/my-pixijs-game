import type { Landmark } from './types';

export type LootTier = 'common' | 'rare' | 'legendary';
const RARE = new Set(['lookout-cache', 'net-cache', 'frog-cache', 'royal-cache', 'orchid-cache', 'boat-cache', 'ossuary-mail', 'reed-cape', 'cave-daggers']);
export function lootTier(l: Pick<Landmark, 'id' | 'kind'>): LootTier {
  if (l.kind === 'charm' || l.kind === 'flask' || ['bamboo-dew', 'grave-spear', 'stone-maul'].includes(l.id)) return 'legendary';
  return RARE.has(l.id) ? 'rare' : 'common';
}
export const LOOT_STYLE = {
  common: { color: '#e5f4ff', label: '白光 · 常见', height: 0.65, rings: 1 },
  rare: { color: '#c68aff', label: '紫光 · 稀有', height: 1.1, rings: 2 },
  legendary: { color: '#ffdc78', label: '金光 · 珍贵', height: 1.6, rings: 3 },
};
