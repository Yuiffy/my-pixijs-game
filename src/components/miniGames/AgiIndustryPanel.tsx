"use client";

import { useState } from 'react';
import {
  AI_COMPANIES,
  AI_STARTER_COMPANIES,
  AI_SOURCES,
  aiCompany,
  AiCompanyId,
} from "./agiIndustry";
import { AiState, aiValuation } from "./agiEngine";
import { money } from "./core";
import styles from "./agiIndustry.module.css";

export function Sources({ ids, inspiration }: { ids: string[]; inspiration?: string }) {
  return (
    <details className={styles.sources}>
      <summary>灵感来源与改编说明</summary>
      <p>
        游戏中的公司、模型和情节均为虚构创作，以下资料仅作灵感来源，不代表真实厂商的行为或能力。
      </p>
      {inspiration && <p>灵感参考：{inspiration}</p>}
      <ul>
        {ids.map((id) => (
          <li key={id}>
            <a href={AI_SOURCES[id].url} target="_blank" rel="noreferrer">
              {AI_SOURCES[id].title} ↗
            </a>
            <small>{AI_SOURCES[id].basis}</small>
          </li>
        ))}
      </ul>
    </details>
  );
}
export function AgiCompanyPicker({
  game,
  choose,
}: {
  game: AiState;
  choose: (id: AiCompanyId) => void;
}) {
  const company = aiCompany(game.industry.company);
  const [expanded, setExpanded] = useState(!AI_STARTER_COMPANIES.includes(company.id));
  const option = (id: AiCompanyId) => {
    const c = aiCompany(id);
    return (
<button key={c.id} data-company={c.id} aria-pressed={c.id === company.id} onClick={() => choose(c.id)}>
      <span style={{ background: c.color }} className={styles.mark}>{c.mark}</span>
      <span><strong>{c.name}</strong><small>{c.playstyle}</small></span>
    </button>
);
  };
  return (
    <div className={styles.picker}>
      <p className={styles.caption}>先从四种玩法挑一条，初次游玩推荐晴空智能。</p>
      <div className={styles.companyGrid}>
        {AI_STARTER_COMPANIES.map(option)}
      </div>
      <details className={styles.moreCompanies} open={expanded} onToggle={e => setExpanded(e.currentTarget.open)}>
        <summary>更多厂商（{AI_COMPANIES.length - AI_STARTER_COMPANIES.length}）</summary>
        <div className={styles.companyGrid}>{AI_COMPANIES.filter(c => !AI_STARTER_COMPANIES.includes(c.id)).map(c => option(c.id))}</div>
      </details>
      <div className={styles.profile} style={{ borderColor: company.color }}>
        <span>{company.name} · {company.models}</span>
        <h3>{company.slogan}</h3>
        <p>{company.trait}</p>
        <p>
          <b>专长：{company.specialty}</b>
          <br />
          {company.specialHint}
        </p>
      </div>
      <Sources ids={company.sourceIds} inspiration={company.prototype} />
    </div>
  );
}
export function AgiIndustryScene({ game }: { game: AiState }) {
  const company = aiCompany(game.industry.company);
  return (
<section className={styles.industry} aria-label="厂商经营概况">
    <div className={styles.companyTitle}>
      <span style={{ background: company.color }} className={styles.mark}>{company.mark}</span>
      <div><h2>{company.name}<small>{company.playstyle}</small></h2><p>{game.industry.statement}</p></div>
    </div>
    <div className={styles.stats}>{[
      ['可靠性', game.industry.reliability], ['视频能力', game.industry.video], ['开源生态', game.industry.ecosystem], ['市场预期', game.industry.hype],
    ].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}<small> / 100</small></strong><meter min={0} max={100} value={value} aria-label={String(label)} /></div>)}</div>
    <p className={styles.caption}>模拟估值 {money(aiValuation(game))}。AGI 需要自研能力 100、算力 5、可靠性 70。</p>
    <details className={styles.league}><summary>同行动态与排名 · 当前第 {1 + game.rivals.filter(r => r.capability > game.capability).length} / {game.rivals.length + 1} 名</summary>{[...game.rivals].sort((a, b) => b.capability - a.capability).map(r => <div className={styles.rival} key={r.company}><strong>{aiCompany(r.company).name}<small>{aiCompany(r.company).playstyle}</small></strong><p>{r.latest}</p><span>自研 {r.capability} · 发布 {r.product} · 视频 {r.video} · 防线 {r.defense}</span></div>)}</details>
    <Sources ids={company.sourceIds} inspiration={company.prototype} />
  </section>
);
}
