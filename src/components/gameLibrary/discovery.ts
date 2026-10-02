import type { GameItem } from './catalog';
import type { LibraryData } from './storage';

export interface LibraryFilters {
  query: string;
  group: string;
  shelf: 'all' | 'favorites' | 'recent';
  sort: 'default' | 'updated' | 'released';
}
export const DEFAULT_FILTERS: LibraryFilters = {
  query: '',
  group: 'all',
  shelf: 'all',
  sort: 'default',
};
type GameGroup = { id: string; title: string; games: GameItem[] };

export function readFilters(
  search: string,
  groups: GameGroup[]
): LibraryFilters {
  const params = new URLSearchParams(search);
  const shelf = params.get('shelf');
  const sort = params.get('sort');
  const group = params.get('category');
  return {
    query: (params.get('q') || '').slice(0, 100),
    group: groups.some((item) => item.id === group) ? group! : 'all',
    shelf: shelf === 'favorites' || shelf === 'recent' ? shelf : 'all',
    sort: sort === 'updated' || sort === 'released' ? sort : 'default',
  };
}

export function writeFilters(url: URL, filters: LibraryFilters) {
  const next = new URL(url);
  const values = {
    q: filters.query,
    category: filters.group,
    shelf: filters.shelf,
    sort: filters.sort,
  };
  const defaults = { q: '', category: 'all', shelf: 'all', sort: 'default' };
  Object.entries(values).forEach(([key, value]) => {
    if (value !== defaults[key as keyof typeof defaults]) next.searchParams.set(key, value);
    else next.searchParams.delete(key);
  });
  return next;
}

export function selectGames(
  groups: GameGroup[],
  filters: LibraryFilters,
  data: LibraryData
): GameGroup[] {
  const terms = filters.query
    .normalize('NFKC')
    .toLocaleLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const recent = new Map(
    data.recent.map((entry) => [entry.href, entry.openedAt])
  );
  const selected = groups
    .filter((group) => filters.group === 'all' || group.id === filters.group)
    .map((group) => ({
      ...group,
      games: group.games.filter((game) => {
        if (
          filters.shelf === 'favorites' &&
          !data.favorites.includes(game.href)
        ) return false;
        if (filters.shelf === 'recent' && !recent.has(game.href)) return false;
        const text =
          `${game.title} ${game.meta} ${game.description} ${group.title}`
            .normalize('NFKC')
            .toLocaleLowerCase();
        return terms.every((term) => text.includes(term));
      }),
    }))
    .filter((group) => group.games.length > 0);
  if (filters.sort === 'default' && filters.shelf !== 'recent') return selected;
  const games = selected.flatMap((group) => group.games);
  games.sort((a, b) => {
    if (filters.sort === 'default') return (recent.get(b.href) || 0) - (recent.get(a.href) || 0);
    const date = (game: GameItem) => (filters.sort === 'released'
        ? game.releaseDate
        : game.updateDate || game.releaseDate);
    return date(b).localeCompare(date(a));
  });
  return games.length
    ? [
        {
          id: 'results',
          title:
            filters.sort === 'default'
              ? '最近打开'
              : filters.sort === 'updated'
                ? '最近更新优先'
                : '最新推出优先',
          games,
        },
      ]
    : [];
}
