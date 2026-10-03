import { useState } from 'react';
import { FabState, fabForecast, unitCost } from './fabEngine';
import { fabOperatingAccount, FabQuarterReport } from './fabFinance';
import styles from './fabFinance.module.css';

const amount = (value: number) => `${value.toLocaleString('zh-CN', { maximumFractionDigits: 2 })} M`;

function Entries({ report }: { report: ReturnType<typeof fabOperatingAccount> }) {
  return (
    <dl className={styles.entries}>
      <div><dt>销售收入</dt><dd>+{amount(report.revenue)}</dd></div>
      <div><dt>生产成本</dt><dd>−{amount(report.productionCost)}</dd></div>
      <div><dt>工厂维护</dt><dd>−{amount(report.maintenance)}</dd></div>
      <div><dt>期末仓储</dt><dd>−{amount(report.storage)}</dd></div>
      <div><dt>贷款利息</dt><dd>−{amount(report.interest)}</dd></div>
      {!!report.rounding && <div><dt>结算取整</dt><dd>{report.rounding > 0 ? '+' : '−'}{amount(Math.abs(report.rounding))}</dd></div>}
      <div className={styles.total}><dt>经营净额</dt><dd>{amount(report.net)}</dd></div>
    </dl>
  );
}

export function FabForecastPanel({ game }: { game: FabState }) {
  const forecast = fabForecast(game);
  const [quantity, setQuantity] = useState(0);
  const sold = Math.min(quantity, forecast.maxSold);
  const scenario = fabOperatingAccount(game.player, forecast.produced, unitCost(game.player), forecast.quote, sold);
  return (
    <section className={styles.forecast} aria-label="本季收支试算">
      <h3>先算这一季</h3>
      <p>生产 {forecast.produced} 批 · 挂单 {forecast.offered} 批 · 报价 {amount(forecast.quote)} / 批</p>
      <p className={styles.limit}>生产单价 {amount(unitCost(game.player))} / 批；仓储按结算后剩余库存收费。</p>
      <p className={styles.limit}>成交范围 0–{forecast.maxSold} 批。上限只按你的挂单和市场需求计算，实际订单还要与同行竞争。</p>
      <div className={styles.range}>
        <span>结算后现金范围</span>
        <strong data-testid="fab-cash-range">{amount(forecast.worst.cashAfter)} — {amount(forecast.best.cashAfter)}</strong>
      </div>
      <p data-testid="fab-break-even" className={styles.explanation}>
        {forecast.breakEven > forecast.maxSold
          ? `经营打平需卖 ${forecast.breakEven} 批，超过本季成交上限；即使卖满也会亏损。`
          : `卖出至少 ${forecast.breakEven} 批，才能覆盖本季生产、维护、仓储和利息。`}
      </p>
      {forecast.worst.cashAfter < 0 && <p className={styles.risk} role="status">{forecast.best.cashAfter < 0 ? '即使卖到上限，现金仍不足以结算；请减少开支或补充资金。' : '销量不足时可能现金断裂；请留足周转资金。'}</p>}
      <details className={styles.details}>
        <summary>试算不同销量</summary>
        <label className={styles.slider} htmlFor="fab-sales-scenario">假设卖出 <strong>{sold} 批</strong></label>
        <input id="fab-sales-scenario" type="range" min={0} max={forecast.maxSold} step={1} value={sold} disabled={!forecast.maxSold} onChange={event => setQuantity(Number(event.target.value))} />
        <Entries report={scenario} />
        <p data-testid="fab-scenario-result">剩余库存 {scenario.endingInventory} 批 · 结算后现金 {amount(scenario.cashAfter)}</p>
        <small>这是你设定的销量，不是订单预测。金额按本游戏规则结算。</small>
      </details>
    </section>
  );
}

export function FabQuarterPanel({ report }: { report: FabQuarterReport }) {
  return (
    <section className={styles.report} aria-label={`第 ${report.turn} 季结算账单`} data-testid="fab-quarter-report">
      <div className={styles.heading}><h2>第 {report.turn} 季 · 钱去了哪里</h2><strong data-tone={report.net < 0 ? 'loss' : 'gain'}>{amount(report.net)}</strong></div>
      <p>挂单 {report.offered} 批，实际成交 <strong>{report.sold} 批</strong>，每批 {amount(report.quote)}。</p>
      <p className={styles.limit}>全市场挂单 {report.totalOffered} 批 / 需求 {report.demand} 批，成交 {report.totalSold} 批。低报价更容易分到订单，剩余需求再流向仍有货的厂商。</p>
      <Entries report={report} />
      <div className={styles.balance}>
        <span>结算前现金 <strong>{amount(report.cashBefore)}</strong></span>
        <span>结算后现金 <strong>{amount(report.cashAfter)}</strong></span>
      </div>
      <p>期初库存 {report.startingInventory} + 生产 {report.produced} − 售出 {report.sold} = 期末 {report.endingInventory} 批</p>
      <small>新建工厂、制程升级、贷款和还款已计入结算前现金，不算经营净额。净额取整到 0.1 M；投产的新厂从下一季开始生产。</small>
    </section>
  );
}
