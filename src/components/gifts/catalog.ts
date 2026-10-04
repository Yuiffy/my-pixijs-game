export const TIERS = { captain: '舰长', admiral: '提督', governor: '总督' } as const;
export type Tier = keyof typeof TIERS;
export type GiftSource = {
  id: string;
  kind: string;
  date: string;
  excerpt: string;
  note: string;
  file?: string;
  start?: string;
  end?: string;
  title?: string;
  url?: string;
};
export type GiftEntry = {
  tier: Tier;
  items: string[];
  sources: string[];
  condition: string;
  status: 'official' | 'recorded' | 'lead';
};
export type GiftImage = {
  src: string;
  width: number;
  height: number;
  caption: string;
  source: string;
  time?: string;
  kind?: 'official';
  originalUrl?: string;
};
export type GiftMonth = {
  month: string;
  title: string;
  note: string;
  entries: GiftEntry[];
  sources: GiftSource[];
  images: GiftImage[];
};
export type Filters = {
  q: string;
  year: string;
  month: string;
  tier: 'all' | Tier;
  evidence: 'all' | 'official' | 'recorded' | 'lead';
  missing: boolean;
};
export const DEFAULT_FILTERS: Filters = { q: '', year: 'all', month: 'all', tier: 'all', evidence: 'all', missing: false };
export const PAGE_SIZE = 8;

export function parseFilters(params: URLSearchParams): Filters {
  const tier = params.get('tier') || '';
  const evidence = params.get('evidence') || '';
  const year = params.get('year') || '';
  const month = params.get('month') || '';
  return {
    q: (params.get('q') || '').slice(0, 120),
    year: /^202[2-6]$/.test(year) ? year : 'all',
    month: /^(0[1-9]|1[0-2])$/.test(month) ? month : 'all',
    tier: Object.hasOwn(TIERS, tier) ? tier as Tier : 'all',
    evidence: evidence === 'official' || evidence === 'recorded' || evidence === 'lead' ? evidence : 'all',
    missing: params.get('missing') === '1',
  };
}

export function serializeFilters(filters: Filters): string {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (key === 'missing') {
      if (value) params.set(key, '1');
    } else if (value && value !== 'all') params.set(key, String(value));
  });
  return params.toString();
}

export function visibleEntries(month: GiftMonth, filters: Filters): GiftEntry[] {
  return month.entries.filter(entry => (filters.tier === 'all' || filters.tier === entry.tier)
    && (filters.evidence === 'all' || filters.evidence === entry.status));
}

export function filterMonths(months: GiftMonth[], filters: Filters): GiftMonth[] {
  const tokens = filters.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return months.filter(month => {
    if (filters.year !== 'all' && !month.month.startsWith(filters.year)) return false;
    if (filters.month !== 'all' && month.month.slice(5) !== filters.month) return false;
    const entries = visibleEntries(month, filters);
    if (!entries.length && !(filters.missing && !month.entries.length && filters.tier === 'all' && filters.evidence === 'all')) return false;
    const [year, number] = month.month.split('-');
    const searchable = [month.month, `${year}年${Number(number)}月`, month.title,
      ...entries.flatMap(entry => [TIERS[entry.tier], ...entry.items, entry.condition])].join(' ').toLowerCase();
    return tokens.every(token => searchable.includes(token));
  });
}
