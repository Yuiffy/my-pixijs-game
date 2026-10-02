'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import snapshot from '@/data/songs/sui.json';
import shards from '../../../config/stream-shards.json';
import { duration, formatBeijingTime, isSongCatalog, normalizeSongName, performedAt, performanceTimestamp, SongCatalog, SongPerformance } from './catalog';
import styles from './songs.module.css';

const remote = `https://raw.githubusercontent.com/${shards.index.repo}/${shards.index.branch}/public/data/streams/sui/songs.json`;
const pageSize = 20;
type Filters = { q: string; kind: string; upload: string; certainty: string; from: string; to: string; sort: string };
const defaults: Filters = { q: '', kind: 'all', upload: 'all', certainty: 'all', from: '', to: '', sort: 'recent' };

export default function SongLibrary() {
  const [catalog, setCatalog] = useState<SongCatalog>(snapshot as SongCatalog);
  const [status, setStatus] = useState<'loading' | 'live' | 'cached'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [filters, setFilters] = useState(defaults);
  const [ready, setReady] = useState(false);
  const [page, setPage] = useState(1);
  useEffect(() => {
    const load = () => {
      const params = new URLSearchParams(window.location.search);
      const next = { ...defaults };
      (Object.keys(next) as (keyof Filters)[]).forEach(key => { next[key] = params.get(key) || defaults[key]; });
      if (!['all', 'full', 'fragment'].includes(next.kind)) next.kind = 'all';
      if (!['all', 'uploaded', 'missing'].includes(next.upload)) next.upload = 'all';
      if (!['all', 'confirmed', 'pending'].includes(next.certainty)) next.certainty = 'all';
      if (!['recent', 'count', 'name'].includes(next.sort)) next.sort = 'recent';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(next.from)) next.from = '';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(next.to)) next.to = '';
      setFilters(next); setPage(1); setReady(true);
    };
    load();
    window.addEventListener('popstate', load);
    return () => window.removeEventListener('popstate', load);
  }, []);
  useEffect(() => {
    if (!ready) return;
    const params = new URLSearchParams();
    (Object.keys(filters) as (keyof Filters)[]).forEach(key => { if (filters[key] !== defaults[key]) params.set(key, filters[key]); });
    const query = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
  }, [filters, ready]);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setStatus('loading');
    const timeout = window.setTimeout(() => controller.abort(), 10000);
    fetch(remote, { signal: controller.signal, cache: 'no-store' }).then(async res => {
      if (!res.ok) throw new Error('Catalog unavailable');
      const data: unknown = await res.json();
      if (!isSongCatalog(data)) throw new Error('Invalid catalog');
      if (active) { setCatalog(data); setStatus('live'); }
    }).catch(() => { if (active) setStatus('cached'); }).finally(() => window.clearTimeout(timeout));
    return () => { active = false; controller.abort(); window.clearTimeout(timeout); };
  }, [attempt]);

  const sessions = useMemo(() => new Map(catalog.sessions.map(s => [s.id, s])), [catalog]);
  const confirmed = catalog.performances.filter(p => p.confirmed);
  const named = new Set(confirmed.filter(p => p.name).map(p => normalizeSongName(p.name!))).size;
  const uploaded = catalog.performances.filter(p => p.clip).length;
  const invalidRange = Boolean(filters.from && filters.to && filters.from > filters.to);
  const groups = useMemo(() => {
    const result = new Map<string, { key: string; name: string; rows: SongPerformance[]; latest: string }>();
    const query = normalizeSongName(filters.q);
    for (const row of catalog.performances) {
      const session = sessions.get(row.sessionId)!;
      const date = performedAt(session.recordedAt, row.start).slice(0, 10).replaceAll('/', '-');
      if (invalidRange || (filters.from && date < filters.from) || (filters.to && date > filters.to)
        || (filters.kind !== 'all' && filters.kind !== row.performance)
        || (filters.upload === 'uploaded' && !row.clip) || (filters.upload === 'missing' && row.clip)
        || (filters.certainty === 'confirmed' && !row.confirmed) || (filters.certainty === 'pending' && row.confirmed)) continue;
      const name = row.name || '未识别歌名';
      if (query && !normalizeSongName(`${name} ${session.title} ${session.recordedAt} ${date} ${row.clip?.bvid || ''}`).includes(query)) continue;
      // Unknown performances are not a single song; each keeps its own identity.
      const key = row.name ? normalizeSongName(row.name) : row.id;
      const timestamp = new Date(performanceTimestamp(session.recordedAt, row.start)).toISOString();
      const group = result.get(key) || { key, name, rows: [], latest: timestamp };
      group.rows.push(row); if (timestamp > group.latest) group.latest = timestamp;
      result.set(key, group);
    }
    const list = Array.from(result.values());
    list.forEach(group => group.rows.sort((a, b) => performanceTimestamp(sessions.get(b.sessionId)!.recordedAt, b.start) - performanceTimestamp(sessions.get(a.sessionId)!.recordedAt, a.start)));
    return list.sort((a, b) => {
      if (filters.sort === 'count') return b.rows.length - a.rows.length || b.latest.localeCompare(a.latest);
      if (filters.sort === 'name') return a.name.localeCompare(b.name, 'zh-CN');
      return b.latest.localeCompare(a.latest);
    });
  }, [catalog, sessions, filters, invalidRange]);
  const pages = Math.max(1, Math.ceil(groups.length / pageSize));
  const currentPage = Math.min(page, pages);
  const update = (key: keyof Filters, value: string) => { setFilters(old => ({ ...old, [key]: value })); setPage(1); };
  const reset = () => { setFilters(defaults); setPage(1); };

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <Link href="/liver" className={styles.brand}>鹿饼<span>AI 直播总结</span></Link>
        <Link href="/liver/sui">岁己直播记录 ↗</Link>
      </header>
      <div className={styles.shell}>
        <header className={styles.intro}>
          <Image src="/images/livers/sui.png" width={88} height={88} alt="岁己SUI" priority />
          <div><p className={styles.eyebrow}>SUI / SONG ARCHIVE</p><h1>岁己歌单<span>唱歌统计与歌切</span></h1>
            <p>找到唱过的歌，回到每一次演唱。</p></div>
        </header>
        <div className={styles.stats} aria-label="全库统计">
          <div><strong>{named}</strong><span>已确认歌曲</span></div>
          <div><strong>{confirmed.length}</strong><span>已确认演唱</span></div>
          <div><strong>{uploaded}</strong><span>有歌切的记录</span></div>
          <div><strong>{catalog.sessions.filter(s => s.complete).length}<small> / {catalog.sessions.length}</small></strong><span>已完成检查的录播</span></div>
        </div>
        <section className={styles.workspace} aria-label="搜索和筛选">
          <label htmlFor="song-search" className={styles.search}>搜索歌曲
            <input id="song-search" type="search" placeholder="搜索歌名、直播标题、日期或 BV 号" value={filters.q} onChange={e => update('q', e.target.value)} />
          </label>
          <div className={styles.filters}>
            <label htmlFor="song-kind">演唱类型<select id="song-kind" value={filters.kind} onChange={e => update('kind', e.target.value)}><option value="all">全部类型</option><option value="full">完整演唱</option><option value="fragment">片段演唱</option></select></label>
            <label htmlFor="song-upload">歌切<select id="song-upload" value={filters.upload} onChange={e => update('upload', e.target.value)}><option value="all">全部记录</option><option value="uploaded">已有歌切</option><option value="missing">暂无歌切</option></select></label>
            <label htmlFor="song-certainty">核验状态<select id="song-certainty" value={filters.certainty} onChange={e => update('certainty', e.target.value)}><option value="all">全部状态</option><option value="confirmed">已确认</option><option value="pending">待核验</option></select></label>
            <label htmlFor="song-from">演唱日期 · 从<input id="song-from" type="date" value={filters.from} onChange={e => update('from', e.target.value)} /></label>
            <label htmlFor="song-to">到<input id="song-to" type="date" value={filters.to} onChange={e => update('to', e.target.value)} /></label>
            <button type="button" onClick={reset}>重置筛选</button>
          </div>
          {invalidRange && <p role="alert">开始日期不能晚于结束日期。</p>}
        </section>
        <div className={styles.results}>
          <p role="status">{groups.length} 个歌曲条目 · {groups.reduce((n, g) => n + g.rows.length, 0)} 条记录</p>
          <label htmlFor="song-sort">排序<select id="song-sort" value={filters.sort} onChange={e => update('sort', e.target.value)}><option value="recent">最近演唱</option><option value="count">记录最多</option><option value="name">歌曲名称</option></select></label>
        </div>
        <section aria-label="歌曲与演唱记录" className={styles.list}>
          {groups.slice((currentPage - 1) * pageSize, currentPage * pageSize).map(group => (
            <details key={group.key} className={styles.song} open={groups.length === 1 ? true : undefined}>
              <summary><span className={styles.note} aria-hidden="true">♪</span><span className={styles.songName}><strong>{group.name}</strong>
                <span>{group.rows.length} 条记录 · {group.rows.filter(p => p.confirmed).length} 次已确认{group.rows.some(p => p.clip) ? ' · 有歌切' : ''}</span></span>
                <span className={styles.latest}>最近 {performedAt(sessions.get(group.rows[0].sessionId)!.recordedAt, group.rows[0].start).slice(0, 10)}</span><span className={styles.chevron} aria-hidden="true">⌄</span></summary>
              <ol className={styles.timeline}>{group.rows.map(row => {
                const session = sessions.get(row.sessionId)!;
                return (
<li key={row.id}>
                  <div className={styles.recordMain}><time>{performedAt(session.recordedAt, row.start)}</time>
                    <div className={styles.badges}><span>{row.performance === 'full' ? '完整演唱' : '片段演唱'}</span><span className={!row.confirmed ? styles.pending : ''}>{row.confirmed ? '已确认' : '待核验'}</span></div>
                    <p>{session.title}</p>
                    <p className={styles.timing}>录播内 {duration(row.start)} – {duration(row.end)} · 时长 {duration(row.end - row.start)}</p>
                    {!row.boundariesConfirmed && <p className={styles.hint}>演唱边界待确认，时间为候选区间。</p>}
                    {!session.complete && <p className={styles.hint}>本场检查尚未完成，此记录暂不计入确认统计。</p>}
                  </div>
                  {row.clip ? <a className={styles.play} href={row.clip.url} target="_blank" rel="noopener noreferrer">播放歌切 ↗<span>B 站 · P{row.clip.part}</span></a> : <span className={styles.unavailable}>暂无已上传歌切</span>}
                </li>
);
              })}</ol>
            </details>
          ))}
          {!groups.length && <div className={styles.empty}><h2>{catalog.performances.length ? '没有匹配的演唱记录' : '暂时没有演唱记录'}</h2><p>{catalog.performances.length ? '换个关键词，或清除筛选后再试。' : '已检查但无演唱的录播也会计入检查场次。'}</p><button type="button" onClick={reset}>清除筛选</button></div>}
        </section>
        {pages > 1 && <nav className={styles.pagination} aria-label="歌曲分页"><button disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>上一页</button><span>{currentPage} / {pages}</span><button disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>下一页</button></nav>}
        <footer className={styles.footer}>
          <p>{status === 'loading' ? '正在检查最新数据…' : status === 'live' ? '已加载最新歌单' : '暂时无法获取最新歌单，正在显示已保存的数据。'} <button onClick={() => setAttempt(n => n + 1)} disabled={status === 'loading'}>刷新数据</button></p>
          <p>数据更新：{formatBeijingTime(Date.parse(catalog.generatedAt))}（北京时间）</p>
          <p>统计仅覆盖已收录检查的录播，并非全部历史。待核验记录与未识别歌名不会增加已确认歌曲数；未知歌名逐次展示，不合并为同一首歌。所有演唱日期按北京时间显示。</p>
          <details><summary>录播检查记录 · {catalog.sessions.length} 场</summary><ul>{catalog.sessions.map(session => <li key={session.id}>{session.recordedAt} · {session.title} · {session.complete ? '检查完成' : '检查未完成'} · {catalog.performances.filter(p => p.sessionId === session.id).length} 条演唱记录</li>)}</ul></details>
        </footer>
      </div>
    </main>
  );
}
