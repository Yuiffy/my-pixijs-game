'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useMemo, useRef, useState } from 'react';
import rawCatalog from '@/data/gifts/sui.json';
import { DEFAULT_FILTERS, PAGE_SIZE, TIERS, filterMonths, parseFilters, serializeFilters, visibleEntries } from './catalog';
import type { Filters, GiftImage, GiftMonth, Tier } from './catalog';
import styles from './GiftArchive.module.css';

const months = rawCatalog.months as GiftMonth[];
const years = Array.from(new Set(months.map(month => month.month.slice(0, 4))));
const populatedCount = months.filter(month => month.entries.length).length;
const imageCount = months.reduce((sum, month) => sum + month.images.length, 0);

function MonthRecord({ month, filters, onImage }: { month: GiftMonth; filters: Filters; onImage: (image: GiftImage, month: GiftMonth) => void }) {
  const entries = visibleEntries(month, filters);
  const [year, number] = month.month.split('-');
  const missingTiers = Object.entries(TIERS).filter(([tier]) => !month.entries.some(entry => entry.tier === tier));
  return (
    <article className={styles.record} id={`month-${month.month}`} data-month={month.month}>
      <div className={styles.date}>
        <span>{year}</span><strong>{number}<small>月</small></strong>
        <a href={`?q=${month.month}&missing=1`} aria-label={`查看 ${month.month} 的独立链接`}>月度链接 ↗</a>
      </div>
      <div className={styles.recordBody}>
        <div className={styles.recordHeading}>
          <h2>{month.title}</h2>
          <span className={styles.status}>{month.entries.length ? '部分资料' : '资料待补'}</span>
        </div>
        {month.note && <p className={styles.note}>{month.note}</p>}
        <div className={styles.recordContent}>
          <div className={styles.giftList}>
            {(Object.entries(TIERS) as [Tier, string][]).map(([tier, label]) => {
              const tierEntries = entries.filter(entry => entry.tier === tier);
              if (!tierEntries.length) return null;
              return (
                <section key={tier} className={styles.tier} aria-label={`${month.month} ${label}礼物`}>
                  <h3>{label}</h3>
                  <div>{tierEntries.map((entry, index) => (
                    <div className={entry.condition ? styles.conditional : styles.entry} key={`${tier}-${index}`}>
                      {entry.status === 'lead' && <span className={styles.lead}>待核实线索</span>}
                      {entry.condition && <strong className={styles.condition}>{entry.condition}</strong>}
                      <p>{entry.items.join(' · ')}</p>
                      <span className={styles.reference}>依据 {entry.sources.map(id => `[${month.sources.findIndex(source => source.id === id) + 1}]`).join(' ')}</span>
                    </div>
                  ))}</div>
                </section>
              );
            })}
            {missingTiers.length > 0 && filters.tier === 'all' && (
              <p className={styles.missing}>{missingTiers.map(([, label]) => label).join('、')}资料待补</p>
            )}
          </div>
          {month.images.length > 0 ? (
            <div className={styles.gallery}>
              {month.images.map(img => (
                <figure key={img.src}>
                  <button type="button" onClick={() => onImage(img, month)} aria-label={`放大：${img.caption}`}>
                    <Image src={img.src} alt={img.caption} width={img.width} height={img.height} sizes="(max-width: 650px) 85vw, 320px" />
                    <span className={styles.zoomHint}>查看大图 ↗</span>
                  </button>
                  <figcaption>{img.caption}</figcaption>
                </figure>
              ))}
            </div>
          ) : <p className={styles.noImage}>展示图待补</p>}
        </div>
        {month.sources.length > 0 && (
          <details className={styles.sources}>
            <summary>查看出处与字幕 · {month.sources.length} 份</summary>
            <p className={styles.sourceHint}>字幕为自动转写，保留原文错字；礼物名称作了归一。网络索引和观众弹幕只作为线索。</p>
            <ol>
              {month.sources.map((source, index) => (
                <li key={source.id}>
                  <div className={styles.sourceMeta}>
                    <strong>[{index + 1}] {source.kind === 'subtitle' ? '录播字幕' : source.kind === 'danmaku' ? '观众弹幕 · 待核实' : '网络索引 · 待核实'}</strong>
                    <span>{source.date}{source.start && ` · ${source.start}—${source.end}`}</span>
                  </div>
                  {source.file && <p className={styles.filename}>{source.file}</p>}
                  {source.url && <a href={source.url} target="_blank" rel="noreferrer">{source.title} ↗</a>}
                  {source.note && <p>{source.note}</p>}
                  <blockquote>{source.excerpt}</blockquote>
                </li>
              ))}
            </ol>
          </details>
        )}
      </div>
    </article>
  );
}

export default function GiftArchive() {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<{ image: GiftImage; month: GiftMonth } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const results = useRef<HTMLDivElement>(null);
  const filtered = useMemo(() => filterMonths(months, filters), [filters]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const shown = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => {
    const restore = () => { setFilters(parseFilters(new URLSearchParams(window.location.search))); setPage(1); };
    restore();
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, []);

  useEffect(() => {
    if (selected) dialog.current?.showModal();
    else dialog.current?.close();
  }, [selected]);

  const update = (patch: Partial<Filters>) => {
    const next = { ...filters, ...patch };
    setFilters(next);
    setPage(1);
    const query = serializeFilters(next);
    window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
  };
  const changePage = (next: number) => {
    setPage(next);
    results.current?.scrollIntoView({ behavior: 'auto', block: 'start' });
    results.current?.focus({ preventScroll: true });
  };

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <Link href="/liver/sui" className={styles.brand}>鹿饼 <span>／ 岁己 SUI</span></Link>
        <nav aria-label="相关页面"><Link href="/liver/sui">直播档案</Link><Link href="/liver/sui/songs">岁己歌单 ↗</Link></nav>
      </header>
      <div className={styles.shell}>
        <header className={styles.intro}>
          <div><p className={styles.eyebrow}>SUI / MONTHLY GIFTS</p><h1>岁己舰礼档案<span>。</span></h1>
            <p className={styles.description}>按月查询舰长、提督与总督礼物，查看录播出处和展示图。</p>
          </div>
          <div className={styles.archiveMeta}><strong>{populatedCount}<span>个月有资料</span></strong><span>{imageCount} 张录播展示图</span><time dateTime={rawCatalog.updatedAt}>整理于 {rawCatalog.updatedAt}</time></div>
        </header>
        <div className={styles.workspace}>
          <aside className={styles.sidebar}>
            <p>按年份浏览</p>
            <nav aria-label="礼物年份">
              {['all', ...years].map(year => (
                <button type="button" key={year} aria-pressed={filters.year === year} onClick={() => update({ year })}>
                  {year === 'all' ? '全部年份' : year}<span>{year === 'all' ? populatedCount : months.filter(month => month.month.startsWith(year) && month.entries.length).length}</span>
                </button>
              ))}
            </nav>
            <div className={styles.archiveNote}><span>档案说明</span><p>持续补档中。只列找到依据的内容；未列出不代表没有礼物。</p><p>各身份礼物独立记录，不自动推定包含低一档的全套礼物。</p></div>
          </aside>
          <div className={styles.mainColumn}>
            <form className={styles.filters} onSubmit={event => event.preventDefault()} aria-label="筛选舰礼">
              <label className={styles.search} htmlFor="gift-search">搜索礼物或月份
                <input id="gift-search" type="search" value={filters.q} maxLength={120} placeholder="例如：立牌、手写信、2026-09" onChange={event => update({ q: event.target.value })} />
              </label>
              <div className={styles.filterRow}>
                <label htmlFor="gift-month">月份<select id="gift-month" aria-label="月份" value={filters.month} onChange={event => update({ month: event.target.value })}><option value="all">全部月份</option>{Array.from({ length: 12 }, (_, i) => <option key={i} value={String(i + 1).padStart(2, '0')}>{i + 1} 月</option>)}</select></label>
                <label htmlFor="gift-tier">身份<select id="gift-tier" aria-label="身份" value={filters.tier} onChange={event => update({ tier: event.target.value as Filters['tier'] })}><option value="all">全部身份</option>{Object.entries(TIERS).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
                <label htmlFor="gift-evidence">依据<select id="gift-evidence" aria-label="依据" value={filters.evidence} onChange={event => update({ evidence: event.target.value as Filters['evidence'] })}><option value="all">全部资料</option><option value="recorded">有录播字幕依据</option><option value="lead">待核实线索</option></select></label>
                <button className={styles.reset} type="button" onClick={() => update(DEFAULT_FILTERS)}>重置筛选</button>
              </div>
              <label className={styles.checkbox} htmlFor="gift-missing"><input id="gift-missing" type="checkbox" checked={filters.missing} onChange={event => update({ missing: event.target.checked })} />也显示无资料月份</label>
            </form>
            <div className={styles.resultsHeader} ref={results} tabIndex={-1}>
              <p role="status" aria-live="polite">{filtered.length} 个月份{filters.year !== 'all' && ` · ${filters.year} 年`}</p>
              <span>按月份倒序 · 礼物所属月，非发货月</span>
            </div>
            <section aria-label="月度舰礼列表">
              {shown.map(month => <MonthRecord key={month.month} month={month} filters={filters} onImage={(img, record) => setSelected({ image: img, month: record })} />)}
              {shown.length === 0 && <div className={styles.empty}><span>∅</span><h2>没有匹配的舰礼记录</h2><p>试试其他名称，或重置年份、身份等筛选。</p><button type="button" onClick={() => update(DEFAULT_FILTERS)}>清除筛选</button></div>}
            </section>
            {filtered.length > PAGE_SIZE && <nav className={styles.pagination} aria-label="月份分页"><button type="button" disabled={currentPage === 1} onClick={() => changePage(currentPage - 1)}>← 上一页</button><span>{currentPage} / {pageCount}</span><button type="button" disabled={currentPage === pageCount} onClick={() => changePage(currentPage + 1)}>下一页 →</button></nav>}
          </div>
        </div>
        <footer className={styles.footer}>
          <p>整理自 {rawCatalog.coverage.srt.toLocaleString('zh-CN')} 份本地字幕、{rawCatalog.coverage.xml.toLocaleString('zh-CN')} 份弹幕文件及公开网页索引。早期资料、完整礼单与部分图片仍待补齐。</p>
          <p>本页为资料档案，领取资格与最终礼单以岁己官方公告为准。图片来自直播展示，可能为设计稿或示意图。</p>
          <a href="https://space.bilibili.com/1954091502" target="_blank" rel="noreferrer">岁己 SUI 的 B 站主页 ↗</a>
        </footer>
      </div>
      <dialog ref={dialog} className={styles.dialog} onCancel={() => setSelected(null)} onClose={() => setSelected(null)} aria-labelledby="gift-image-title">
        {selected && <><div className={styles.dialogHeader}><h2 id="gift-image-title">{selected.month.month} · {selected.image.caption}</h2><button type="button" onClick={() => setSelected(null)} aria-label="关闭大图">关闭 ×</button></div><div className={styles.largeImage}><Image src={selected.image.src} alt={selected.image.caption} width={selected.image.width} height={selected.image.height} sizes="90vw" /></div><p className={styles.imageSource}>录播画面 {selected.image.time} · {selected.month.sources.find(source => source.id === selected.image.source)?.file}</p><a href={selected.image.src} target="_blank" rel="noreferrer">打开原尺寸图片 ↗</a></>}
      </dialog>
    </main>
  );
}
