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
  ThunderboltOutlined,
} from '@ant-design/icons';
import Image from 'next/image';
import Link from 'next/link';

import { AUTOCHESS_VERSION } from '@/components/autoChessGame/version';
import { CONTENT_VERSION as SPARRING_VERSION } from '@/components/oneMoreGame/content';
import { QUESTIONS as BUTTON_QUESTIONS } from '@/components/buttonGame/content';

import styles from './page.module.css';

interface ProjectItem {
  title: string;
  href: string;
  description: string;
  image?: string;
  meta: string;
  externalStats?: boolean;
}

const gameGroups: { id: string; title: string; games: ProjectItem[] }[] = [
  {
    id: 'action',
    title: '动作与探索',
    games: [
      {
        title: '岁己 · 雨夜寻味',
        href: '/game/night-rain',
        description:
          '穿过雨中的旧城，打开近路、挑战铁伞，和饼干岁一起找一顿热饭。',
        image: '/games/night-rain/preview.png',
        meta: '3D 动作探索 · 扮演岁己 · 箱庭冒险',
      },
      {
        title: '岁岁过招',
        href: '/game/one-more',
        description: '接飞铃、截突进，在三庭收钟的道场中挑战三位对手。',
        image: '/games/one-more/dojo.webp',
        meta: `动作对战 · 扮演挑战者 · 三位首章 Boss · v${SPARRING_VERSION}`,
      },
      {
        title: 'Knight：空洞搜打撤',
        href: '/knight',
        description: '深入空洞搜集资源、应对遭遇，在局势失控前带着战利品撤离。',
        meta: '搜打撤 · 扮演探索者 · 搜索、交战、撤离',
        externalStats: true,
      },
    ],
  },
  {
    id: 'virtual-streamer',
    title: '虚拟主播模拟',
    games: [
      {
        title: '嘘，TA还在播',
        href: '/game/hush-live',
        description: '递外卖、隔墙报点、偷一个吻，守住两个人的小秘密。',
        image: '/games/hush-live/preview.png',
        meta: '第一人称潜行 · 扮演主播的秘密恋人 · 五晚同居',
      },
      {
        title: '饼干岁，听我说',
        href: '/game/streamer',
        description: '打出话题、挑选弹幕、救场转场，亲手控住三幕直播。',
        image: '/images/materials/岁己SUI小猫帽短发小揪揪半身金瞳.png',
        meta: '直播策略肉鸽 · 扮演主播岁己 · 七种结局',
      },
      {
        title: '岁己：马上就播',
        href: '/game/pre-stream',
        description: '跑遍公寓准备直播，趁保温杯慢慢接水去喂猫、试音，处理突发状况后赶到 OBS 开播。',
        image: '/games/pre-stream/preview.png',
        meta: '3D 开播竞速 · 扮演主播岁己 · 三晚计时摘星',
      },
      {
        title: '主播，别嚼了！',
        href: '/game/snack',
        description: '一边聊天一边偷偷吃零食，别让麦克风和观众发现。',
        image: '/games/mini/snack.png',
        meta: '实时操作 · 扮演偷吃的主播 · 五关挑战',
      },
    ],
  },
  {
    id: 'strategy',
    title: '经营与策略',
    games: [
      {
        title: '智能纪元',
        href: '/game/agi',
        description: '训练、蒸馏、发布大模型，与三家实验室竞速 AGI。',
        image: '/games/mini/agi.png',
        meta: '策略经营 · 扮演 AI 公司 · 发展大模型',
      },
      {
        title: '晶圆周期',
        href: '/game/fab',
        description: '决定报价、库存和扩产时机，在六年产业周期中积累财富。',
        image: '/games/mini/fab.png',
        meta: '模拟经营 · 扮演内存颗粒厂商 · 把握行情',
      },
    ],
  },
  {
    id: 'story',
    title: '故事与抉择',
    games: [
      {
        title: '虚境归途',
        href: '/game/rpg',
        description: '醒来成了一块饼干，结识伙伴，在山河间寻找通往现实的路。',
        image: '/images/autochess/portraits/biscuit_sui.png',
        meta: '角色扮演 · 扮演饼干 · 组队探索',
      },
      {
        title: '年关牌局：这婚，你催吗？',
        href: '/game/family-pressure',
        description:
          '从相识到共同生活，在 24 个季度里决定靠近、分开或一起渡过难关。',
        image: '/reference_images/岁己小红帽立绘.png',
        meta: '人生模拟 · 扮演当事人或家长 · 支持本地双人',
      },
      {
        title: '武侠小说生成器',
        href: '/game/wuxia',
        description: '从一次选择开始，让随机事件和你的决定写成自己的江湖。',
        image: '/images/wiki/skill1.jpg',
        meta: '文字冒险 · 扮演江湖人物 · 自由抉择',
      },
      {
        title: '这个按钮，你按吗？',
        href: '/game/button',
        description: '面对心动的奖励与纠结的代价，为虚拟主播的平行人生做选择。',
        image: '/games/button/press.svg',
        meta: `互动选择 · 扮演决策者 · ${BUTTON_QUESTIONS.length} 道难题`,
      },
    ],
  },
  {
    id: 'quick',
    title: '轻松挑战',
    games: [
      {
        title: '维阿发掘局',
        href: '/game/brick-excavation',
        description: '敲落连成一片的彩色砖块，挖出藏在下面的维阿主播。',
        image: '/images/autochess/portraits/minimal/sui.png',
        meta: '连色解谜 · 三份人物档案 · 步数挑战',
      },
      {
        title: '维阿弹棋',
        href: '/game/flick-chess',
        description: '挑选棋子，拉开角度与力度，用连锁碰撞把对手弹出棋盘。',
        image: '/games/flick-chess/preview.png',
        meta: '3D 物理对战 · 扮演维阿角色 · 本地双人 / AI',
      },
      {
        title: '小鸟一百层',
        href: '/game/jumpone',
        description: '控制小鸟一路向上，在越来越刁钻的平台间刷新高度。',
        image: '/images/sui-bird-jump.png',
        meta: '垂直跳跃 · 扮演小鸟 · 挑战高度',
      },
    ],
  },
];

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
}: {
  count?: number;
  externalStats?: boolean;
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
  if (count === undefined) return null;
  return (
    <span className={styles.viewCount} title="页面累计浏览次数，包含重复访问">
      {count.toLocaleString('zh-CN')} 次浏览
    </span>
  );
}

function GameRow({ game, count }: { game: ProjectItem; count?: number }) {
  return (
    <Link href={game.href} className={styles.gameRow}>
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
        <ViewCount count={count} externalStats={game.externalStats} />
        <ArrowRightOutlined aria-hidden />
      </div>
    </Link>
  );
}

export default function DemosPage() {
  const pageRef = useRef<HTMLElement>(null);
  const [viewCounts, setViewCounts] = useState<Record<string, number> | null>(
    null,
  );

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/demos/visits', { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (data?.counts) setViewCounts(data.counts);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const root = pageRef.current;
    if (!root) return undefined;
    const sections = Array.from(
      root.querySelectorAll<HTMLElement>('[data-reveal]'),
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
      { threshold: 0.01 },
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
            <span>单人策略</span>
            <span>可随时托管</span>
            <ViewCount
              count={
                viewCounts ? (viewCounts['/game/autochess'] ?? 0) : undefined
              }
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
          <nav className={styles.groupNav} aria-label="游戏类型">
            {gameGroups.map((group) => (
              <a key={group.id} href={`#${group.id}`}>
                {group.title}
              </a>
            ))}
          </nav>
          {gameGroups.map((group) => (
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
                      viewCounts ? (viewCounts[game.href] ?? 0) : undefined
                    }
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
