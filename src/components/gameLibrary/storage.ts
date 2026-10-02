export const LIBRARY_KEY = 'sui-game-library-v1';
export const LIBRARY_EVENT = 'sui-game-library-change';
export interface LibraryData {
  favorites: string[];
  recent: { href: string; openedAt: number }[];
}

export function isGamePath(href: unknown): href is string {
  return (
    typeof href === 'string' &&
    (/^\/game\/[a-z0-9-]+$/.test(href) || href === '/knight')
  );
}

export function parseLibrary(raw: string | null): LibraryData {
  try {
    const data = JSON.parse(raw || '{}');
    const favorites = Array.isArray(data?.favorites)
      ? Array.from(new Set<string>(data.favorites.filter(isGamePath))).slice(
          0,
          100
        )
      : [];
    const recent: LibraryData['recent'] = [];
    if (Array.isArray(data?.recent)) {
      data.recent
        .filter(
          (entry: LibraryData['recent'][number]) => isGamePath(entry?.href) &&
            Number.isFinite(entry.openedAt) &&
            entry.openedAt > 0
        )
        .sort(
          (
            a: LibraryData['recent'][number],
            b: LibraryData['recent'][number]
          ) => b.openedAt - a.openedAt
        )
        .forEach((entry: LibraryData['recent'][number]) => {
          if (
            recent.length < 12 &&
            !recent.some((item) => item.href === entry.href)
          ) {
            recent.push({ href: entry.href, openedAt: entry.openedAt });
          }
        });
    }
    return { favorites, recent };
  } catch {
    return { favorites: [], recent: [] };
  }
}

export function readLibrary(): LibraryData {
  try {
    return parseLibrary(window.localStorage.getItem(LIBRARY_KEY));
  } catch {
    return parseLibrary(null);
  }
}

export function saveLibrary(data: LibraryData): boolean {
  try {
    window.localStorage.setItem(LIBRARY_KEY, JSON.stringify(data));
    window.dispatchEvent(new Event(LIBRARY_EVENT));
    return true;
  } catch {
    return false;
  }
}

export function recordGameOpen(href: string) {
  if (!isGamePath(href)) return;
  const data = readLibrary();
  data.recent = [
    { href, openedAt: Date.now() },
    ...data.recent.filter((item) => item.href !== href),
  ].slice(0, 12);
  saveLibrary(data);
}
