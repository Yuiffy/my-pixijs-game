'use client';

import React, { useEffect, useRef } from 'react';
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

import styles from './page.module.css';

interface ProjectItem {
  title: string;
  href: string;
  description: string;
  image: string;
  meta: string;
}

const gameDemos: ProjectItem[] = [
  {
    title: '岁岁过招',
    href: '/game/one-more',
    description: '三庭收钟。接飞铃、截突进，挑战三位不同的对手。',
    image: '/games/one-more/dojo.webp',
    meta: `v${SPARRING_VERSION} · 单人动作 · 三 Boss 首章`,
  },
  {
    title: '小鸟一百层',
    href: '/game/jumpone',
    description: '一路向上，在越来越刁钻的平台间刷新高度。',
    image: '/images/sui-bird-jump.png',
    meta: '垂直跳跃',
  },
  {
    title: '武侠小说生成器',
    href: '/game/wuxia',
    description: '从一次选择开始，把随机事件写成自己的江湖。',
    image: '/images/wiki/skill1.jpg',
    meta: '文字冒险',
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

function ProjectCard({ project, index }: { project: ProjectItem; index: number }) {
  return (
    <Link href={project.href} className={styles.projectCard}>
      <div className={styles.projectImage}>
        <Image
          src={project.image}
          alt=""
          fill
          sizes="(max-width: 760px) 100vw, 50vw"
          className={styles.projectImageAsset}
        />
        <span className={styles.projectNumber}>0{index + 1}</span>
      </div>
      <div className={styles.projectCopy}>
        <span className={styles.projectMeta}>{project.meta}</span>
        <h3>{project.title}</h3>
        <p>{project.description}</p>
        <span className={styles.textLink}>
          打开项目 <ArrowRightOutlined aria-hidden />
        </span>
      </div>
    </Link>
  );
}

export default function DemosPage() {
  const pageRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const root = pageRef.current;
    if (!root) return undefined;

    const sections = Array.from(root.querySelectorAll<HTMLElement>('[data-reveal]'));
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      sections.forEach((section) => section.setAttribute('data-visible', 'true'));
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
      { threshold: 0.12 },
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  return (
    <main ref={pageRef} className={styles.page}>
      <header className={styles.topbar}>
        <Link href="/" className={styles.backLink} title="返回首页" aria-label="返回首页">
          <ArrowLeftOutlined aria-hidden />
        </Link>
        <Link href="/demos" className={styles.labMark} aria-label="实验室首页">
          <ExperimentOutlined aria-hidden />
          <span>LAB / 实验室</span>
        </Link>
        <nav className={styles.nav} aria-label="实验室分类">
          <a href="#games">小游戏</a>
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
              LAB 01 · 当前主项目
            </div>
            <h1 id="rift-title">
              维阿自走棋
              <span>裂隙阵线</span>
            </h1>
            <p>招募队员、自由布阵，在逐步失控的八战远征中守住最后一道战线。</p>
            <div className={styles.heroActions}>
              <Link href="/game/autochess" className={styles.primaryAction}>
                进入战线 <ArrowRightOutlined aria-hidden />
              </Link>
              <a href="#next-project" className={styles.secondaryAction}>查看其他项目</a>
            </div>
          </div>
          <div className={styles.heroFacts} aria-label="游戏信息">
            <span>v{AUTOCHESS_VERSION}</span>
            <span>单人策略</span>
            <span>可随时托管</span>
          </div>
        </div>
      </section>

      <section id="next-project" className={styles.knightBand} data-reveal>
        <div className={styles.sectionInner}>
          <div className={styles.sectionLead}>
            <span className={styles.sectionIndex}>02</span>
            <div>
              <span className={styles.sectionKicker}>下一项实验</span>
              <h2>Knight：空洞搜打撤</h2>
            </div>
          </div>
          <div className={styles.knightContent}>
            <div className={styles.knightMap} aria-hidden>
              <span className={styles.mapNodeOne} />
              <span className={styles.mapNodeTwo} />
              <span className={styles.mapNodeThree} />
              <span className={styles.mapRoute} />
              <CompassOutlined />
            </div>
            <div className={styles.knightCopy}>
              <p>深入空洞，搜集资源、处理遭遇，并在局势失控前带着战利品撤离。</p>
              <div className={styles.knightTags} aria-label="玩法标签">
                <span>探索</span>
                <span>交战</span>
                <span>撤离</span>
              </div>
              <Link href="/knight" className={styles.outlineAction}>
                进入空洞 <ArrowRightOutlined aria-hidden />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section id="games" className={styles.collectionSection} data-reveal>
        <div className={styles.sectionInner}>
          <div className={styles.collectionHeader}>
            <div>
              <span className={styles.sectionKicker}><RocketOutlined aria-hidden /> 可玩原型</span>
              <h2>小游戏 Demo</h2>
            </div>
            <p>规则简单，打开就能玩一局。</p>
          </div>
          <div className={styles.projectGrid}>
            {gameDemos.map((project, index) => (
              <ProjectCard key={project.href} project={project} index={index} />
            ))}
          </div>
        </div>
      </section>

      <section id="web-trials" className={styles.collectionSectionAlt} data-reveal>
        <div className={styles.sectionInner}>
          <div className={styles.collectionHeader}>
            <div>
              <span className={styles.sectionKicker}><CodeOutlined aria-hidden /> 页面与叙事</span>
              <h2>网页试手</h2>
            </div>
            <p>围绕内容展示、排版和世界观做的小型网页。</p>
          </div>
          <div className={styles.trialList}>
            {webTrials.map((project, index) => (
              <Link key={project.href} href={project.href} className={styles.trialRow}>
                <span className={styles.trialNumber}>0{index + 1}</span>
                <div className={styles.trialThumb}>
                  <Image
                    src={project.image}
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
