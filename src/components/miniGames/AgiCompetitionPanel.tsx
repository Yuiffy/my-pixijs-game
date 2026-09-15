'use client';

import { AiState, actAi, aiBlocked, aiCost, aiChallengeBlocked, aiCriticismPreview, respondAiChallenge, setAiCompetitionTarget } from './agiEngine';
import { AI_CHALLENGE_RESPONSES, AI_DIFFICULTIES, AiCompetitionEntry, AiDifficulty } from './agiCompetition';
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

const involvesPlayer = (entry: AiCompetitionEntry, game: AiState) => entry.actor === game.industry.company || entry.target === game.industry.company;
const isInteraction = (entry: AiCompetitionEntry) => ['criticize', 'distill', 'response'].includes(entry.kind);
const competitionPriority = (entry: AiCompetitionEntry, game: AiState) => {
  if (entry.response === 'pending' && entry.target === game.industry.company) return 4;
  if (isInteraction(entry) && involvesPlayer(entry, game)) return 3;
  return isInteraction(entry) ? 2 : 0;
};
const chronologicalFeed = (game: AiState) => [...game.competition.feed].sort((a, b) => b.turn - a.turn || competitionPriority(b, game) - competitionPriority(a, game));
const entryHeadline = (entry: AiCompetitionEntry, game: AiState) => {
  const actor = entry.actor === game.industry.company ? '你' : aiCompany(entry.actor).name;
  const target = entry.target === game.industry.company ? '你' : aiCompany(entry.target).name;
  if (entry.kind === 'distill') return `${actor}蒸馏了${target}的模型`;
  if (entry.kind === 'criticize') return `${actor}发文质疑${target}`;
  if (entry.kind === 'response') return `${actor}回应了${target}`;
  const verbs: Record<string, string> = { train: '推进预训练', posttrain: '完成后训练', release: '发布了新模型', optimize: '优化模型架构', compute: '扩建算力', safety: '投入安全研究', protect: '加强反蒸馏防线', agi: '启动了 AGI', video: '研发视频模型', fund: '完成融资' };
  return `${actor}${verbs[entry.kind] || '更新了经营进展'}`;
};
const entryOutcome = (entry: AiCompetitionEntry) => {
  const outcomes = entry.effect.match(/^\d+(?:\.\d+)? M|(?:投入|支付|花费|支出|融资)\s*[+−-]?\d+(?:\.\d+)? M|能力\s*[+−-]\d+(?:\.\d+)?(?:\s*→\s*\d+(?:\.\d+)?)?|(?:可靠性|信誉|社区|安全)\s*[+−-]\d+(?:\.\d+)?|发布能力\s*\d+(?:\.\d+)?/g);
  return outcomes?.length ? outcomes.slice(0, 3).join(' · ') : entry.effect;
};

function CompetitionEntry({ entry, game }: { entry: AiCompetitionEntry; game: AiState }) {
  return <article data-competition-entry={entry.id}><span>Q{entry.turn} · {entryHeadline(entry, game)}</span><p>{entry.effect || entry.text}</p>{entry.response === 'pending' && entry.target === game.industry.company && <b>待回应 · 本季内在经营页处理</b>}</article>;
}

export function AgiQuarterBrief({ game, showChallenges }: { game: AiState; showChallenges: () => void }) {
  const leader = [...game.rivals].sort((a, b) => b.capability - a.capability)[0];
  const recent = chronologicalFeed(game).filter(entry => entry.turn >= game.turn - 1 && entry.kind !== 'settlement');
  const interactions = recent.filter(isInteraction);
  const leadProgress = recent.filter(entry => entry.actor === leader.company && ['release', 'train', 'posttrain', 'optimize', 'compute', 'agi'].includes(entry.kind));
  const highlights = interactions.length ? interactions : leadProgress;
  const [headline] = highlights;
  const pending = pendingAiChallenges(game);
  const gap = Math.round((leader.capability - game.capability) * 10) / 10;
  const threat = gap > 0 ? `领先你 ${gap}` : gap < 0 ? `落后你 ${Math.abs(gap)}` : '与你持平';
  return (
<section className={styles.quarterBrief} aria-label="本季竞争速报" data-urgent={pending.length > 0 || leader.capability >= 80}>
    <div className={styles.briefHeading}><strong>{headline ? `${headline.turn < game.turn ? '上季' : '本季'}${interactions.length ? '交锋' : '同行动向'}` : '同行动向'}</strong><small>{leader.name} · 能力 {leader.capability} · {threat}</small></div>
    {headline ? <details className={styles.briefEntry} key={headline.id}><summary><span>{entryHeadline(headline, game)}</span><small>{entryOutcome(headline)}</small></summary><p>{headline.effect || headline.text}</p></details> : <p className={styles.briefQuiet}>{game.turn === 1 ? '对手会在季度结算时研发、发布与寻找蒸馏对象。' : '本季暂无新的直接交锋；留意对手的发布与研发进度。'}</p>}
    {pending.length > 0 && !game.ending && (game.industry.eventResolved ? <button className={styles.briefRespond} onClick={showChallenges}>回应 {pending.length} 条质疑 → 经营页</button> : <p className={styles.briefPending}>有 {pending.length} 条质疑待回应 · 处理本季事件后，在经营页回应。</p>)}
    {highlights.length > 1 && <details className={styles.briefMore}><summary>其他 {highlights.length - 1} 条{interactions.length ? '交锋' : '进展'}</summary>{highlights.slice(1).map(entry => <CompetitionEntry key={entry.id} entry={entry} game={game} />)}</details>}
    {game.difficulty === 'relaxed' && <details className={styles.briefDifficulty}><summary>当前：悠闲研究 · 对手每季 2 次行动</summary><p>想体验更激烈的竞争，可在新开局选择「行业竞速」或「巨头围猎」。</p></details>}
  </section>
);
}

export function AgiCompetitionSummary({ game }: { game: AiState }) {
  const leader = [...game.rivals].sort((a, b) => b.capability - a.capability)[0];
  const difficulty = AI_DIFFICULTIES.find(d => d.id === game.difficulty)!;
  const feed = chronologicalFeed(game);
  const latestTurn = feed[0]?.turn;
  const latest = feed.filter(entry => entry.turn === latestTurn && entry.kind !== 'settlement');
  const history = feed.filter(entry => entry.turn !== latestTurn || entry.kind === 'settlement');
  return (
<section className={styles.summary} aria-label="竞争态势">
    <div className={styles.race} data-urgent={leader.capability >= 80}><span>{difficulty.name}难度</span><strong>领跑对手：{leader.name} · 能力 {leader.capability}</strong><small>算力 {leader.compute} · 可靠性 {leader.reliability} · 已发布 {leader.product}</small></div>
    {leader.capability >= 80 && !game.ending && <p className={styles.warning}>对手已进入冲线阶段。检查自己的发布、可靠性和安全投入。</p>}
    {latest.length > 0 && <details className={styles.feed} open><summary>最新动态 · Q{latestTurn}</summary>{latest.slice(0, 2).map(entry => <CompetitionEntry key={entry.id} entry={entry} game={game} />)}{latest.length > 2 && <details><summary>本季其他动态（{latest.length - 2}）</summary>{latest.slice(2).map(entry => <CompetitionEntry key={entry.id} entry={entry} game={game} />)}</details>}</details>}
    {history.length > 0 && <details className={styles.feed}><summary>历史交锋与季度账目（{history.length}）</summary>{history.map(entry => <CompetitionEntry key={entry.id} entry={entry} game={game} />)}</details>}
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
