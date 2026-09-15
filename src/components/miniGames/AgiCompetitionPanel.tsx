'use client';

import { AiState, actAi, aiBlocked, aiCost, aiChallengeBlocked, aiCriticismPreview, respondAiChallenge, setAiCompetitionTarget } from './agiEngine';
import { AI_CHALLENGE_RESPONSES, AI_DIFFICULTIES, AiDifficulty } from './agiCompetition';
import { aiCompany, AiCompanyId } from './agiIndustry';
import { money } from './core';
import styles from './agiCompetition.module.css';

export function AgiDifficultyPicker({ value, change }: { value: AiDifficulty; change: (id: AiDifficulty) => void }) {
  const selected = AI_DIFFICULTIES.find(d => d.id === value)!;
  return (
<div className={styles.difficulty}>
    <label htmlFor="agi-difficulty">竞争难度<select id="agi-difficulty" value={value} onChange={e => change(e.target.value as AiDifficulty)}>{AI_DIFFICULTIES.map(d => <option key={d.id} value={d.id}>{d.name}{d.id === 'standard' ? '（默认）' : ''}</option>)}</select></label>
    <p>{selected.description}</p>
  </div>
);
}

export const pendingAiChallenges = (game: AiState) => game.competition.feed.filter(entry => entry.target === game.industry.company && entry.response === 'pending');

export function AgiCompetitionSummary({ game }: { game: AiState }) {
  const leader = [...game.rivals].sort((a, b) => b.capability - a.capability)[0];
  const difficulty = AI_DIFFICULTIES.find(d => d.id === game.difficulty)!;
  const direct = (entry: AiState['competition']['feed'][number]) => ['criticize', 'distill', 'protect', 'response'].includes(entry.kind) && (entry.actor === game.industry.company || entry.target === game.industry.company);
  const feed = [...game.competition.feed.filter(direct), ...game.competition.feed.filter(entry => !direct(entry))];
  return (
<section className={styles.summary} aria-label="竞争态势">
    <div className={styles.race} data-urgent={leader.capability >= 80}><span>{difficulty.name}难度</span><strong>领跑对手：{leader.name} · 能力 {leader.capability}</strong><small>算力 {leader.compute} · 可靠性 {leader.reliability} · 已发布 {leader.product}</small></div>
    {leader.capability >= 80 && !game.ending && <p className={styles.warning}>对手已进入冲线阶段。检查自己的发布、可靠性和安全投入。</p>}
    {feed.length > 0 && <details className={styles.feed} open><summary>竞争动态 · 优先显示与你有关的交锋</summary>{feed.slice(0, 3).map(entry => <article key={entry.id}><span>Q{entry.turn} · {aiCompany(entry.actor).name}</span><p>{entry.text}</p><small>{entry.effect}</small>{entry.response === 'pending' && <b>待回应 · 在经营页处理</b>}</article>)}{feed.length > 3 && <details><summary>查看其他动态（{feed.length - 3}）</summary>{feed.slice(3).map(entry => <article key={entry.id}><span>Q{entry.turn} · {aiCompany(entry.actor).name}</span><p>{entry.text}</p><small>{entry.effect}</small></article>)}</details>}</details>}
  </section>
);
}

export function AgiCompetitionControls({ game, change }: { game: AiState; change: (next: AiState) => void }) {
  const pending = pendingAiChallenges(game);
  const preview = aiCriticismPreview(game);
  const blocked = aiBlocked(game, 'criticize');
  return (
<section className={styles.controls} aria-label="同行交锋">
    {pending.map(entry => (
<article className={styles.challenge} key={entry.id} data-challenge={entry.id}>
      <strong>{aiCompany(entry.actor).name}公开质疑了你</strong><p>{entry.text}</p><small>{entry.basis}</small>
      <div>{AI_CHALLENGE_RESPONSES.map(response => {
        const reason = aiChallengeBlocked(game, entry.id, response.id);
        return <button key={response.id} data-challenge-response={response.id} disabled={!!reason} title={reason || response.detail} onClick={() => change(respondAiChallenge(game, entry.id, response.id))}><strong>{response.name}</strong><span>{reason || response.detail}</span></button>;
      })}</div>
    </article>
))}
    <details className={styles.criticism}>
      <summary>向同行发文质疑</summary>
      <label htmlFor="agi-competition-target">点名对象<select id="agi-competition-target" value={game.competition.target} onChange={e => change(setAiCompetitionTarget(game, e.target.value as AiCompanyId))}>{game.rivals.map(r => <option key={r.company} value={r.company}>{r.name} · 发布 {r.product} · 可靠性 {r.reliability}</option>)}</select></label>
      <p><b>{preview.supported ? '可引用的依据' : '当前缺少依据'}</b><br />{preview.basis}</p><small>{preview.effect}</small>
      <button data-action="criticize" disabled={!!blocked} onClick={() => change(actAi(game, 'criticize'))}>发布批判文章 · {blocked || money(aiCost(game, 'criticize'))}</button>
    </details>
  </section>
);
}
