export interface SongSession { id: string; recordedAt: string; title: string; complete: boolean }
export interface SongPerformance {
  id: string; sessionId: string; name: string | null; start: number; end: number;
  performance: 'full' | 'fragment'; confirmed: boolean; boundariesConfirmed: boolean;
  clip: { bvid: string; part: number; url: string } | null;
}
export interface SongCatalog {
  version: number; generatedAt: string; sessions: SongSession[]; performances: SongPerformance[];
}
export function isSongCatalog(value: unknown): value is SongCatalog {
  if (!value || typeof value !== 'object') return false;
  const data = value as SongCatalog;
  if (data.version !== 1 || !Number.isFinite(Date.parse(data.generatedAt))
    || !Array.isArray(data.sessions) || !Array.isArray(data.performances)) return false;
  const ids = new Set(data.sessions.map(s => s?.id));
  return ids.size === data.sessions.length && data.sessions.every(s => s && typeof s.id === 'string' && typeof s.title === 'string'
    && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s.recordedAt)
    && Number.isFinite(Date.parse(`${s.recordedAt.replace(' ', 'T')}+08:00`)) && typeof s.complete === 'boolean')
    && data.performances.every(p => p && typeof p.id === 'string' && ids.has(p.sessionId)
      && (p.name === null || typeof p.name === 'string') && Number.isFinite(p.start) && p.start >= 0
      && Number.isFinite(p.end) && p.end > p.start && ['full', 'fragment'].includes(p.performance)
      && typeof p.confirmed === 'boolean' && typeof p.boundariesConfirmed === 'boolean'
      && (p.clip === null || (p.clip && /^BV[0-9A-Za-z]{10}$/.test(p.clip.bvid)
        && Number.isInteger(p.clip.part) && p.clip.part > 0
        && p.clip.url === `https://www.bilibili.com/video/${p.clip.bvid}/?p=${p.clip.part}`)));
}
export const normalizeSongName = (name: string) => name.normalize('NFKC').toLocaleLowerCase().replace(/[\s·・]+/g, '');
export function duration(seconds: number) {
  const value = Math.floor(seconds);
  return [Math.floor(value / 3600), Math.floor(value / 60) % 60, value % 60].map(n => String(n).padStart(2, '0')).join(':');
}
const beijingFormatter = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
export const formatBeijingTime = (timestamp: number) => beijingFormatter.format(new Date(timestamp));
export const performanceTimestamp = (recordedAt: string, offset: number) => Date.parse(`${recordedAt.replace(' ', 'T')}+08:00`) + offset * 1000;
export const performedAt = (recordedAt: string, offset: number) => formatBeijingTime(performanceTimestamp(recordedAt, offset));
