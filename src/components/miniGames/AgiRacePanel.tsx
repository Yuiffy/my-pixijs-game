'use client';

import { useRef } from 'react';
import type { AiState } from './agiEngine';
import { aiCompany } from './agiIndustry';
import { getAiRaceReport } from './agiRace';
import styles from './agiRace.module.css';

export function AgiRaceHud({ game }: { game: AiState }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const report = getAiRaceReport(game);
  const urgent = !game.ending && report.threat?.stage !== 'building' && !!report.threat;
  const alert = game.ending ? '竞赛已结束 · 查看最终排名' : urgent
    ? `${report.threat!.name}${report.threat!.stage === 'ready' ? '已具备 AGI 条件' : '接近 AGI'}` : report.headline;
  return (
    <div className={styles.hud} data-urgent={urgent}>
      <span className={styles.position}>你的排名 <strong>{report.player.rank}<small> / {report.rows.length}</small></strong></span>
      <span className={styles.hudStatus} role="status">{alert}</span>
      <button type="button" className={styles.rankingButton} onClick={() => dialog.current?.showModal()} aria-haspopup="dialog">排行榜 ↗</button>
      <dialog ref={dialog} className={styles.rankingDialog} aria-labelledby="agi-ranking-title">
        <div className={styles.dialogHeading}><div><span>第 {game.turn} 季 · {game.ending ? '最终排名' : '实时排名'}</span><h2 id="agi-ranking-title">AGI 竞速榜</h2></div><button type="button" onClick={() => dialog.current?.close()} aria-label="关闭排行榜">关闭 ✕</button></div>
        <p className={styles.rankingNote}>按自研能力排名，同分并列。稳健启动 AGI 需要能力 100、算力 5、可靠性 70、安全 40。</p>
        {!game.ending && <p className={styles.rankingAlert}>{report.detail}</p>}
        <table className={styles.rankingTable}>
          <caption>全部 {report.rows.length} 家公司 · 你的排名第 {report.player.rank}</caption>
          <thead><tr><th scope="col">名次 / 公司</th><th scope="col">能力</th><th scope="col">算力</th><th scope="col">可靠</th><th scope="col">安全</th></tr></thead>
          <tbody>{report.rows.map(row => <tr key={row.company} data-player={row.player} data-company-rank={row.company}><th scope="row"><span className={styles.rankNumber}>{row.rank}</span><span>{row.name}{row.player && <b>你</b>}<small>{row.stage === 'ready' ? '已达稳健 AGI 门槛' : row.stage === 'near' ? '接近 AGI' : aiCompany(row.company).playstyle}</small></span></th><td>{row.capability}</td><td data-met={row.compute >= 5}>{row.compute}</td><td data-met={row.reliability >= 70}>{row.reliability}</td><td data-met={row.safety >= 40}>{row.safety}</td></tr>)}</tbody>
        </table>
      </dialog>
    </div>
  );
}

export function AgiRivalEpilogue({ game }: { game: AiState }) {
  const outcome = game.ending?.rivalOutcome;
  if (!outcome) return null;
  const company = aiCompany(outcome.winnerId);
  return (
    <section className={styles.epilogue} aria-label="对手选择的世界结局" data-rival-ending={outcome.endingId}>
      <div className={styles.winner}><span style={{ background: company.color }}>{company.mark}</span><div><strong>{company.name}的选择</strong><small>第 {outcome.turn} 季率先启动 AGI · 你未赢下竞赛</small></div></div>
      <p className={styles.decision}>{outcome.decision}</p>
      <p className={styles.reason}>{outcome.reason}</p>
      <ul>{outcome.consequences.map(consequence => <li key={consequence}>{consequence}</li>)}</ul>
      <p className={styles.tradeoff}><strong>代价与隐忧</strong>{outcome.tradeoff}</p>
      <details><summary>获胜时的状态</summary><p>能力 {outcome.metrics.capability} · 算力 {outcome.metrics.compute} · 可靠性 {outcome.metrics.reliability} · 安全 {outcome.metrics.safety}</p><p>{outcome.metrics.open ? '开放权重' : '闭源经营'} · 视频 {outcome.metrics.video} · 生态 {outcome.metrics.ecosystem}</p></details>
    </section>
  );
}
