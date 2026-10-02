'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  CalendarOutlined,
  CodeOutlined,
  CompassOutlined,
  ExperimentOutlined,
  HomeOutlined,
  RocketOutlined,
  SearchOutlined,
  StarFilled,
  StarOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import Image from 'next/image';
import Link from 'next/link';

import {
  AUTOCHESS_VERSION,
  AUTOCHESS_RELEASE_DATE,
} from '@/components/autoChessGame/version';
import {
  gameGroups,
  GameItem,
  ProjectItem,
} from '@/components/gameLibrary/catalog';
import {
  readLibrary,
  recordGameOpen,
  saveLibrary,
  LIBRARY_EVENT,
  LIBRARY_KEY,
  LibraryData,
} from '@/components/gameLibrary/storage';
import {
  DEFAULT_FILTERS,
  readFilters,
  writeFilters,
  selectGames,
  LibraryFilters,
} from '@/components/gameLibrary/discovery';

import styles from './page.module.css';

const webTrials: ProjectItem[] = [
  {
    title: '岁己周表',
    href: '/html/sui_weekly_schedule.html',
    description: '把一周的直播安排整理成清晰、可分享的时间表。',
    image: '/images/materials/weekly_sample.png',
    meta: '排期页面',
  },
  {
    title: '岁己鬼灭 IF',
    href: '/wiki/sui',
    description: '如果岁己成为鬼杀队成员，一条完整世界线会怎样展开。',
    image: '/images/wiki/wiki_snapshot.jpg',
    meta: '主题 Wiki',
  },
];

const archiveItems = [
  { title: '小鸟基础动画', href: '/anime/bird-base' },
  { title: '小鸟刚体动画', href: '/anime/bird-matter-js-demo' },
  { title: '带鱼主页', href: 'https://www.daifish.top', external: true },
];

function ViewCount({
  count,
  externalStats = false,
  localOnly = false,
}: {
  count?: number | null;
  externalStats?: boolean;
  localOnly?: boolean;
}) {
  if (externalStats) {
    return (
      <span
        className={styles.viewUnavailable}
        title="游戏位于独立站点，本站无法统计其全部访问"
      >
        访问数暂不可用
      </span>
    );
  }
  if (count === undefined) {
    return <span className={styles.viewUnavailable}>浏览数加载中</span>;
  }
  if (count === null) {
    return (
      <span className={styles.viewUnavailable}>
        {localOnly ? '浏览数请看线上' : '浏览数暂不可用'}
      </span>
    );
  }
  return (
    <span className={styles.viewCount} title="页面累计浏览次数，包含重复访问">
      {count.toLocaleString('zh-CN')} 次浏览
    </span>
  );
}

function GameDateDetails({
  releaseDate,
  updateDate,
  external = false,
}: {
  releaseDate: string;
  updateDate?: string;
  external?: boolean;
}) {
  return (
    <span className={styles.dateDetails}>
      <span>
        {external ? '本站收录' : '推出'}{' '}
        <time dateTime={releaseDate}>{releaseDate.replaceAll('-', '.')}</time>
      </span>
      <span>
        更新{' '}
        {updateDate ? (
          <time dateTime={updateDate}>{updateDate.replaceAll('-', '.')}</time>
        ) : (
          '未记录'
        )}
      </span>
    </span>
  );
}

function GameRow({
  game,
  count,
  localOnly,
  favorite,
  onFavorite,
}: {
  game: GameItem;
  count?: number | null;
  localOnly: boolean;
  favorite: boolean;
  onFavorite: () => void;
}) {
  return (
    <article className={styles.gameEntry} data-game={game.href}>
      <Link
        href={game.href}
        className={styles.gameRow}
        aria-label={`打开 ${game.title}`}
        onClick={() => { if (game.externalStats) recordGameOpen(game.href); }}
        onAuxClick={event => { if (event.button === 1 && game.externalStats) recordGameOpen(game.href); }}
      >
        <div className={styles.gameThumb}>
          {game.image ? (
            <Image
              src={game.image}
              alt=""
              fill
              sizes="(max-width: 760px) 92px, 148px"
              className={styles.gameImage}
            />
          ) : (
            <CompassOutlined aria-hidden />
          )}
        </div>
        <div className={styles.gameCopy}>
          <span className={styles.gameMeta}>{game.meta}</span>
          <h3>{game.title}</h3>
          <p>{game.description}</p>
        </div>
        <div className={styles.gameEnd}>
          <ViewCount
            count={count}
            externalStats={game.externalStats}
            localOnly={localOnly}
          />
          <span className={styles.gameHistory}>
            <CalendarOutlined className={styles.dateIcon} aria-hidden />
            <GameDateDetails
              releaseDate={game.releaseDate}
              updateDate={game.updateDate}
              external={game.externalStats}
            />
          </span>
          <ArrowRightOutlined aria-hidden />
        </div>
      </Link>
      <button
        type="button"
        className={styles.favoriteButton}
        aria-label={`${favorite ? '取消收藏' : '收藏'} ${game.title}`}
        aria-pressed={favorite}
        title={favorite ? '取消收藏' : '收藏游戏'}
        onClick={onFavorite}
      >
        {favorite ? <StarFilled aria-hidden /> : <StarOutlined aria-hidden />}
      </button>
    </article>
  );
}

export default function DemosPage() {
  const pageRef = useRef<HTMLElement>(null);
  const [viewCounts, setViewCounts] = useState<
    Record<string, number> | null | undefined
  >(undefined);
  const [localOnly, setLocalOnly] = useState(false);
  const [filters, setFilters] = useState<LibraryFilters>(DEFAULT_FILTERS);
  const [library, setLibrary] = useState<LibraryData>({
    favorites: [],
    recent: [],
  });
  const [storageNotice, setStorageNotice] = useState('');
  const allGames = gameGroups.flatMap((group) => group.games);
  const visibleGroups = selectGames(gameGroups, filters, library);
  const visibleCount = visibleGroups.reduce(
    (sum, group) => sum + group.games.length,
    0
  );
  const favoriteCount = allGames.filter((game) => library.favorites.includes(game.href)).length;
  const recentCount = allGames.filter((game) => library.recent.some((entry) => entry.href === game.href)).length;

  useEffect(() => {
    const syncLibrary = () => setLibrary(readLibrary());
    const syncFilters = () => setFilters(readFilters(window.location.search, gameGroups));
    const onStorage = (event: StorageEvent) => {
      if (event.key === LIBRARY_KEY || event.key === null) syncLibrary();
    };
    syncLibrary();
    syncFilters();
    window.addEventListener('storage', onStorage);
    window.addEventListener(LIBRARY_EVENT, syncLibrary);
    window.addEventListener('popstate', syncFilters);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(LIBRARY_EVENT, syncLibrary);
      window.removeEventListener('popstate', syncFilters);
    };
  }, []);

  function changeFilters(update: Partial<LibraryFilters>) {
    const next = { ...filters, ...update };
    setFilters(next);
    const url = writeFilters(new URL(window.location.href), next);
    window.history.replaceState(window.history.state, '', url);
  }

  function updateLibrary(next: LibraryData) {
    setLibrary(next);
    const saved = saveLibrary(next);
    setStorageNotice(saved ? '' : '浏览器未允许保存，收藏仅在本次页面中保留。');
  }

  function toggleFavorite(href: string) {
    // Read the latest persisted data so another tab's recent visits are preserved.
    const current = storageNotice ? library : readLibrary();
    const favorites = current.favorites.includes(href)
      ? current.favorites.filter((item) => item !== href)
      : [...current.favorites, href];
    updateLibrary({ ...current, favorites });
  }

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/demos/visits', { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        setLocalOnly(data?.localOnly === true);
        setViewCounts(data?.available && data.counts ? data.counts : null);
      })
      .catch((error) => {
        if (error.name !== 'AbortError') setViewCounts(null);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const root = pageRef.current;
    if (!root) return undefined;
    const sections = Array.from(
      root.querySelectorAll<HTMLElement>('[data-reveal]')
    );
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      sections.forEach((section) => {
        section.setAttribute('data-visible', 'true');
      });
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.setAttribute('data-visible', 'true');
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.01 }
    );
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  return (
    <main ref={pageRef} className={styles.page}>
      <header className={styles.topbar}>
        <Link
          href="/"
          className={styles.backLink}
          title="返回首页"
          aria-label="返回首页"
        >
          <ArrowLeftOutlined aria-hidden />
        </Link>
        <Link href="/demos" className={styles.labMark} aria-label="实验室首页">
          <ExperimentOutlined aria-hidden />
          <span>LAB / 实验室</span>
        </Link>
        <nav className={styles.nav} aria-label="实验室分类">
          <a href="#games">游戏列表</a>
          <a href="#web-trials">网页试手</a>
          <Link href="/" aria-label="首页" title="首页">
            <HomeOutlined aria-hidden />
          </Link>
        </nav>
      </header>

      <section className={styles.hero} aria-labelledby="rift-title">
        <Image
          src="/images/demos/rift-line-hero.png"
          alt="三名棋手在裂隙战场上列阵迎敌"
          fill
          priority
          quality={90}
          sizes="100vw"
          className={styles.heroImage}
        />
        <div className={styles.heroShade} />
        <div className={styles.heroInner}>
          <div className={styles.heroCopy}>
            <div className={styles.eyebrow}>
              <span className={styles.liveDot} />
              实验室精选 · 策略自走棋
            </div>
            <h1 id="rift-title">
              维阿自走棋<span>裂隙阵线</span>
            </h1>
            <p>
              购买 VR 和 PSP
              成员棋子，组建队伍、凑齐羁绊、安排站位，挑战一轮比一轮更强的敌人！
            </p>
            <div className={styles.heroHistory}>
              <CalendarOutlined aria-hidden />
              <GameDateDetails
                releaseDate="2026-01-10"
                updateDate={AUTOCHESS_RELEASE_DATE}
              />
            </div>
            <div className={styles.heroActions}>
              <Link href="/game/autochess" className={styles.primaryAction}>
                开始对局 <ArrowRightOutlined aria-hidden />
              </Link>
              <a href="#games" className={styles.secondaryAction}>
                浏览全部游戏
              </a>
            </div>
          </div>
          <div className={styles.heroFacts} aria-label="游戏信息">
            <span>v{AUTOCHESS_VERSION}</span>
            <span>单人 / 在线多人</span>
            <span>可随时托管</span>
            <ViewCount
              count={
                viewCounts ? (viewCounts['/game/autochess'] ?? 0) : viewCounts
              }
              localOnly={localOnly}
            />
          </div>
        </div>
      </section>

      <section id="games" className={styles.collectionSection} data-reveal>
        <div className={styles.sectionInner}>
          <div className={styles.collectionHeader}>
            <div>
              <span className={styles.sectionKicker}>
                <RocketOutlined aria-hidden /> 可玩作品
              </span>
              <h2>选择下一款游戏</h2>
            </div>
            {viewCounts && <p>浏览次数来自本站页面记录，包含重复访问。</p>}
          </div>
          <div className={styles.libraryTools}>
            <div className={styles.searchRow}>
              <label className={styles.searchBox} htmlFor="game-search">
                <SearchOutlined aria-hidden />
                <input
                  id="game-search"
                  type="search"
                  aria-label="搜索游戏"
                  placeholder="搜游戏、角色或玩法"
                  value={filters.query}
                  maxLength={100}
                  onChange={(event) => changeFilters({ query: event.target.value })}
                />
              </label>
              <label className={styles.sortControl} htmlFor="game-sort">
                排序
                <select
                  id="game-sort"
                  aria-label="排序"
                  value={filters.sort}
                  onChange={(event) => changeFilters({
                      sort: event.target.value as LibraryFilters['sort'],
                    })}
                >
                  <option value="default">
                    {filters.shelf === 'recent' ? '最近打开' : '按游戏类型'}
                  </option>
                  <option value="updated">最近更新</option>
                  <option value="released">最新推出</option>
                </select>
              </label>
            </div>
            <div
              className={styles.shelfNav}
              role="group"
              aria-label="我的游戏库"
            >
              <button
                type="button"
                aria-pressed={filters.shelf === 'all'}
                onClick={() => changeFilters({ shelf: 'all' })}
              >
                全部游戏 <span>{allGames.length}</span>
              </button>
              <button
                type="button"
                aria-pressed={filters.shelf === 'favorites'}
                onClick={() => changeFilters({ shelf: 'favorites' })}
              >
                我的收藏 <span>{favoriteCount}</span>
              </button>
              <button
                type="button"
                aria-pressed={filters.shelf === 'recent'}
                onClick={() => changeFilters({ shelf: 'recent' })}
              >
                最近打开 <span>{recentCount}</span>
              </button>
            </div>
          </div>
          <nav className={styles.groupNav} aria-label="游戏类型">
            <button
              type="button"
              aria-pressed={filters.group === 'all'}
              onClick={() => changeFilters({ group: 'all' })}
            >
              全部类型
            </button>
            {gameGroups.map((group) => (
              <button
                type="button"
                key={group.id}
                aria-pressed={filters.group === group.id}
                onClick={() => changeFilters({ group: group.id })}
              >
                {group.title}
              </button>
            ))}
          </nav>
          <div className={styles.resultSummary}>
            <span role="status" aria-live="polite">
              找到 {visibleCount} 款游戏
            </span>
            {(filters.query ||
              filters.group !== 'all' ||
              filters.shelf !== 'all' ||
              filters.sort !== 'default') && (
              <button
                type="button"
                onClick={() => changeFilters(DEFAULT_FILTERS)}
              >
                重置筛选
              </button>
            )}
            {filters.shelf === 'recent' && recentCount > 0 && (
              <button
                type="button"
                onClick={() => updateLibrary({
                    ...(storageNotice ? library : readLibrary()),
                    recent: [],
                  })}
              >
                清空打开记录
              </button>
            )}
          </div>
          {storageNotice && (
            <p className={styles.libraryNotice} role="status">
              {storageNotice}
            </p>
          )}
          {filters.shelf !== 'all' && (
            <p className={styles.libraryNotice}>
              收藏与打开记录仅保存在当前浏览器。打开记录不代表游戏存档。
            </p>
          )}
          {visibleCount === 0 && (
            <div className={styles.emptyLibrary}>
              <h3>
                {filters.query || filters.group !== 'all'
                  ? '没有找到匹配的游戏'
                  : filters.shelf === 'favorites'
                    ? '把喜欢的游戏留在这里'
                    : '下一次，更快找到它'}
              </h3>
              <p>
                {filters.query || filters.group !== 'all'
                  ? '试试更短的关键词，或切换游戏类型。'
                  : filters.shelf === 'favorites'
                    ? '点击游戏旁的星星，即可加入收藏。'
                    : '打开一款游戏后，它会出现在这里。'}
              </p>
              <button
                type="button"
                onClick={() => changeFilters(DEFAULT_FILTERS)}
              >
                浏览全部游戏
              </button>
            </div>
          )}
          {visibleGroups.map((group) => (
            <div id={group.id} className={styles.gameGroup} key={group.id}>
              <div className={styles.groupHeading}>
                <h3>{group.title}</h3>
                <span>{group.games.length} 款</span>
              </div>
              <div className={styles.gameList}>
                {group.games.map((game) => (
                  <GameRow
                    key={game.href}
                    game={game}
                    count={
                      viewCounts ? (viewCounts[game.href] ?? 0) : viewCounts
                    }
                    localOnly={localOnly}
                    favorite={library.favorites.includes(game.href)}
                    onFavorite={() => toggleFavorite(game.href)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section
        id="web-trials"
        className={styles.collectionSectionAlt}
        data-reveal
      >
        <div className={styles.sectionInner}>
          <div className={styles.collectionHeader}>
            <div>
              <span className={styles.sectionKicker}>
                <CodeOutlined aria-hidden /> 页面与叙事
              </span>
              <h2>网页试手</h2>
            </div>
            <p>围绕内容展示、排版和世界观做的小型网页。</p>
          </div>
          <div className={styles.trialList}>
            {webTrials.map((project, index) => (
              <Link
                key={project.href}
                href={project.href}
                className={styles.trialRow}
              >
                <span className={styles.trialNumber}>0{index + 1}</span>
                <div className={styles.trialThumb}>
                  <Image
                    src={project.image!}
                    alt=""
                    fill
                    sizes="(max-width: 760px) 96px, 160px"
                    className={styles.trialImage}
                  />
                </div>
                <div className={styles.trialCopy}>
                  <span>{project.meta}</span>
                  <h3>{project.title}</h3>
                  <p>{project.description}</p>
                </div>
                <ArrowRightOutlined className={styles.rowArrow} aria-hidden />
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.archive} data-reveal>
        <div className={styles.sectionInner}>
          <div className={styles.archiveHeader}>
            <ThunderboltOutlined aria-hidden />
            <span>更早的实验</span>
          </div>
          <div className={styles.archiveLinks}>
            {archiveItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                target={item.external ? '_blank' : undefined}
                rel={item.external ? 'noopener noreferrer' : undefined}
              >
                {item.title} <ArrowRightOutlined aria-hidden />
              </Link>
            ))}
          </div>
          <footer>
            <CalendarOutlined aria-hidden />
            <span>一些项目会继续生长，另一些留在这里记录当时的想法。</span>
          </footer>
        </div>
      </section>
    </main>
  );
}
