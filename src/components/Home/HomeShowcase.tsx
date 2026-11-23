'use client';

import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import Link from 'next/link';
import ShowcaseVisual from './ShowcaseVisual';
import styles from './HomeShowcase.module.css';

const slides = [
  {
    kind: 'gallery',
    label: '素材库',
    title: '获取岁己素材',
    description: '找立绘、表情或二创素材？按形态挑选，点开就能查看原图。',
    href: '/?tab=gallery',
    action: '去素材库',
  },
  {
    kind: 'records',
    label: '直播文字总结',
    title: '看直播文字总结',
    description: '按日期找直播记录，读文字总结，快速了解聊了什么、玩了什么。',
    href: '/?tab=records',
    action: '查看直播总结',
  },
  {
    kind: 'games',
    label: '同人游戏',
    title: '玩岁己同人游戏',
    description: '在《维阿自走棋：裂隙阵线》组队上阵，或挑一款其他同人游戏试玩。',
    href: '/demos',
    action: '去游戏合集',
  },
] as const;

const carouselOptions: Parameters<typeof useEmblaCarousel>[0] = {
  align: 'start',
  loop: true,
  skipSnaps: false,
  duration: 28,
  breakpoints: { '(prefers-reduced-motion: reduce)': { duration: 0 } },
};

export default function HomeShowcase() {
  const [viewportRef, carousel] = useEmblaCarousel(carouselOptions);
  const [active, setActive] = useState(0);
  const [dragging, setDragging] = useState(false);
  const focusAfterKeyboard = useRef(false);
  const actions = useRef<Array<HTMLAnchorElement | null>>([]);

  useEffect(() => {
    if (!carousel) return;
    const update = () => setActive(carousel.selectedScrollSnap());
    const pointerDown = () => setDragging(true);
    const pointerUp = () => setDragging(false);
    update();
    carousel.on('select', update).on('reInit', update).on('pointerDown', pointerDown).on('pointerUp', pointerUp);
    return () => {
      carousel.off('select', update).off('reInit', update).off('pointerDown', pointerDown).off('pointerUp', pointerUp);
    };
  }, [carousel]);

  useEffect(() => {
    if (!focusAfterKeyboard.current) return;
    focusAfterKeyboard.current = false;
    actions.current[active]?.focus({ preventScroll: true });
  }, [active]);

  const handleKey = (event: KeyboardEvent<HTMLAnchorElement>) => {
    if (!carousel || event.altKey || event.ctrlKey || event.metaKey) return;
    const selected = carousel.selectedScrollSnap();
    const count = slides.length;
    let next;
    switch (event.key) {
      case 'ArrowLeft': next = (selected + count - 1) % count; break;
      case 'ArrowRight': next = (selected + 1) % count; break;
      case 'Home': next = 0; break;
      case 'End': next = count - 1; break;
      default: return;
    }
    event.preventDefault();
    if (next === selected) return;
    focusAfterKeyboard.current = true;
    carousel.scrollTo(next, window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  };

  return (
    <section className={styles.section} aria-label="站内内容" aria-roledescription="轮播" data-showcase-root data-dragging={dragging}>
      <div ref={viewportRef} className={styles.viewport} data-showcase-viewport>
        <div className={styles.track} data-showcase-track>
          {slides.map((slide, index) => (
            <article
              key={slide.kind}
              id={`home-showcase-${slide.kind}`}
              className={styles.panel}
              data-showcase-slide
              data-tone={slide.kind}
              data-active={active === index}
              aria-hidden={active !== index}
              aria-roledescription="幻灯片"
              aria-label={`${index + 1} / ${slides.length}：${slide.label}`}
            >
              <div className={styles.copy}>
                <h2>{slide.title}</h2>
                <p className={styles.description}>{slide.description}</p>
                <Link
                  ref={(link) => { actions.current[index] = link; }}
                  href={slide.href}
                  prefetch={false}
                  tabIndex={active === index ? undefined : -1}
                  aria-describedby="showcase-keyboard"
                  draggable={false}
                  className={styles.action}
                  onKeyDown={handleKey}
                >{slide.action}<span aria-hidden="true">↗</span></Link>
              </div>
              <div className={styles.visual} aria-hidden="true">
                <ShowcaseVisual kind={slide.kind} />
              </div>
            </article>
          ))}
        </div>
      </div>
      <p className={styles.announcement} id="showcase-keyboard">按左右方向键切换卡片。</p>
      <p className={styles.announcement} aria-live="polite" aria-atomic="true">
        {active + 1} / {slides.length}：{slides[active].label}
      </p>
    </section>
  );
}
