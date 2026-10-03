'use client';

import { useRef } from 'react';
import { AI_EVENTS, aiQuarterBudget } from './agiEngine';
import type { AiState } from './agiEngine';
import { money } from './core';
import styles from './agiBudget.module.css';

const COST_LABELS = {
  base: '基础运营',
  compute: '算力维护',
  service: '服务方针',
  routing: '上游调用',
  samples: '训练许可与样本',
  scrutiny: '审查成本',
  defense: '反蒸馏防线',
} as const;

export default function AgiBudget({ game }: { game: AiState }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const budget = aiQuarterBudget(game);
  const danger = budget.cashAfter < 0;
  return (
    <section className={styles.summary} aria-label="本季收支预估" data-shortfall={danger}>
      <div><span>剩余 {game.actions} 次行动</span><button type="button" onClick={() => dialog.current?.showModal()} aria-haspopup="dialog">查看本季收支 ↗</button></div>
      <p role="status">已知结算后 <strong data-budget-cash={budget.cashAfter}>{money(budget.cashAfter)}</strong>{danger && <span> · 资金可能不足</span>}</p>
      <dialog ref={dialog} className={styles.dialog} aria-labelledby="agi-budget-title">
        <header><div><small>第 {game.turn} 季 · 现在结束季度</small><h2 id="agi-budget-title">本季收支预估</h2></div><button type="button" aria-label="关闭收支预估" onClick={() => dialog.current?.close()}>关闭 ✕</button></header>
        <div className={styles.body} data-budget-scroll>
          {!game.industry.eventResolved && <p className={styles.note}>行业事件尚未处理；回应事件后预估会更新。</p>}
          <div className={styles.balance} data-shortfall={danger}><span>已知结算后资金</span><strong>{money(budget.cashAfter)}</strong><small>当前 {money(game.cash)} · 本季净额 {budget.net > 0 ? '+' : ''}{money(budget.net)}</small><small>不含对手可能支付的授权费</small></div>
          {danger && <p className={styles.warning} role="status">已知收支会使资金为负，可能导致现金流断裂。可先融资、调整尚未锁定的方针，或处理退款风险。</p>}
          <h3>结算收入</h3>
          <dl>
            <div><dt>收入基数</dt><dd>{money(budget.baseIncome)}</dd></div>
            <div><dt>{AI_EVENTS[game.event].title}</dt><dd>×{budget.marketMultiplier}</dd></div>
            <div><dt>{budget.safetyMultiplier < 1 ? '安全低于 40 · 监管折扣' : '监管收入系数'}</dt><dd>×{budget.safetyMultiplier}</dd></div>
            <div className={styles.total}><dt>本季收入</dt><dd data-budget-income={budget.income}>{money(budget.income)}</dd></div>
          </dl>
          <h3>已知支出</h3>
          <dl>
            {Object.entries(budget.costs).map(([key, value]) => <div key={key}><dt>{COST_LABELS[key as keyof typeof COST_LABELS]}</dt><dd>{money(value)}</dd></div>)}
            <div className={styles.total}><dt>运营合计</dt><dd data-budget-upkeep={budget.upkeep}>{money(budget.upkeep)}</dd></div>
            <div data-shortfall={!!budget.refund}><dt>宣传过度退款</dt><dd data-budget-refund={budget.refund}>{money(budget.refund)}</dd></div>
          </dl>
          <p className={styles.note}>市场预期 {game.industry.hype} · 可靠性 {game.industry.reliability}。预期超过可靠性 15 点时退款 8 M；后训练可降低这一风险。</p>
          <p className={styles.note}>按当前产品和设置计算，已支付的行动费用不再扣一次。不含对手可能支付的训练授权收入；后续行动与事件选择会更新预估。</p>
          {game.industry.route && <p className={styles.note}>合作费用按本季设置收取；上游限制可能在结算时停止合作或样本供应。</p>}
        </div>
      </dialog>
    </section>
  );
}
