"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { CANDIDATES } from "./content";
import { getCandidateProfile } from "./household";
import type { CandidateId } from "./types";
import styles from "./marriage.module.css";

export default function CandidateCatalog() {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<CandidateId | null>(null);
  const modalRef = useRef<HTMLElement>(null);
  const person = CANDIDATES.find(item => item.id === selectedId);
  const profile = person ? getCandidateProfile(1, person.id) : null;
  const index = CANDIDATES.findIndex(item => item.id === selectedId);
  const isOpen = Boolean(person);
  const results = CANDIDATES.filter(item => {
    const traits = getCandidateProfile(1, item.id);
    return [item.name, item.subtitle, ...item.tags, item.opening, item.boundary, traits.title, traits.wish].join(" ").toLowerCase().includes(query.trim().toLowerCase());
  });

  const move = useCallback((offset: number) => {
    setSelectedId(current => {
      const position = CANDIDATES.findIndex(item => item.id === current);
      return CANDIDATES[(position + offset + CANDIDATES.length) % CANDIDATES.length].id;
    });
    modalRef.current?.scrollTo({ top: 0 });
  }, []);

  useEffect(() => {
    if (!isOpen) return undefined;
    const previous = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    modalRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedId(null);
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        move(event.key === "ArrowLeft" ? -1 : 1);
      }
      if (event.key !== "Tab") return;
      const buttons = modalRef.current?.querySelectorAll<HTMLButtonElement>("button");
      if (!buttons?.length) return;
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true });
    };
  }, [isOpen, move]);

  return (
    <>
      <details className={styles.castList} data-testid="candidate-catalog">
        <summary>看看相亲名册 · {CANDIDATES.length} 位</summary>
        <p>点名字查看完整特质。人物生活观固定，每次相遇的好感不同。</p>
        <label className={styles.catalogSearch} htmlFor="candidate-catalog-search">
          <span>找人或特质</span>
          <input id="candidate-catalog-search" data-testid="catalog-search" value={query} onChange={event => setQuery(event.target.value)} placeholder="例如：四时小路、艰苦、旅行" />
        </label>
        <small className={styles.catalogCount}>显示 {results.length} / {CANDIDATES.length} 位</small>
        <div className={styles.catalogEntries}>
          {results.map(item => <button key={item.id} data-testid={`catalog-person-${item.id}`} onClick={() => setSelectedId(item.id)}><strong>{item.name}</strong><small>{getCandidateProfile(1, item.id).title}</small></button>)}
        </div>
        {results.length === 0 && <p role="status">没有找到匹配的人物，试试别的姓名或特质。</p>}
      </details>
      {person && profile && (
        <div className={styles.catalogOverlay}>
          <section ref={modalRef} className={styles.catalogDialog} role="dialog" aria-modal="true" aria-labelledby="catalog-person-name" data-testid="catalog-person-dialog">
            <header className={styles.catalogHeader}>
              <span>{person.name} · {index + 1} / {CANDIDATES.length}</span>
              <button data-testid="catalog-close" aria-label="关闭人物资料" onClick={() => setSelectedId(null)}>关闭 ×</button>
            </header>
            <div className={styles.catalogProfile}>
              <div className={styles.catalogPortrait}><Image src={person.image} alt={`${person.name}的游戏人物形象`} fill unoptimized sizes="(max-width: 760px) 110px, 200px" /></div>
              <div><small>人物资料</small><h2 id="catalog-person-name">{person.name}</h2><p>{person.subtitle}</p><div className={styles.tagRow}>{person.tags.map(tag => <i key={tag}>{tag}</i>)}</div><h3>{profile.title}</h3><p>{profile.wish}</p></div>
            </div>
            <div className={styles.catalogNarrative}>
              <div><h3>相亲时会怎么说</h3><p>{person.opening}</p></div>
              <div><h3>在意的边界</h3><p>{person.boundary}</p></div>
            </div>
            <h3 className={styles.catalogStatsTitle}>影响相处的特质</h3>
            <dl className={styles.catalogStats}>
              <div><dt>履历分</dt><dd>{person.resume}</dd><small>影响家长的选人倾向</small></div>
              <div><dt>生活契合</dt><dd>{person.compatibility}</dd><small>相互有意时，影响感情增长</small></div>
              <div><dt>初始继续意愿</dt><dd>{person.initialIntent}</dd><small>开局基准，实际会略有浮动</small></div>
              <div><dt>见面费用</dt><dd>请客 {person.cityCost} · AA {Math.ceil(person.cityCost / 2)}</dd><small>两种付款方式不额外增减好感</small></div>
              <div><dt>婚后弹性消费</dt><dd>{profile.spending} / 回合</dd><small>未缩减开支时的生活标准</small></div>
              <div><dt>婚后共同投入</dt><dd>{profile.income} / 回合</dd><small>伴侣为共同生活投入的预算</small></div>
              <div><dt>调整消费的意愿</dt><dd>{profile.flexibility} / 100</dd><small>越高越容易接受缩减开支，也会考虑当前感情与继续意愿</small></div>
            </dl>
            <p className={styles.catalogNote}>以上为游戏设定，费用使用游戏预算点。双向好感需在实际相处中了解；浏览名册不会选人、推进回合或改动存档。</p>
            <nav className={styles.catalogNavigation} aria-label="浏览人物">
              <button data-testid="catalog-previous" onClick={() => move(-1)}>← 上一位</button>
              <span>← → 切换人物 · Esc 关闭</span>
              <button data-testid="catalog-next" onClick={() => move(1)}>下一位 →</button>
            </nav>
          </section>
        </div>
      )}
    </>
  );
}
