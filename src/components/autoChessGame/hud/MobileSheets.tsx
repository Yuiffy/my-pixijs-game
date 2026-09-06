import { useId, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { AutoChessEngine } from "../core/gameEngine";
import {
  CAMPAIGN_ROUNDS,
  AUGMENTS,
  SHOP_UNITS,
  TRAITS,
  UNIT_DEFS,
  augmentTierForRound,
} from "../core/gameData";
import type {
  OwnedUnit,
  RankingMetric,
  Team,
  UnitLocation,
} from "../core/gameTypes";
import type { GameAction } from "../phaser/EngineBridge";
import {
  ActionButton,
  FONT,
  STAR_LABEL,
  StarForgeAction,
  UnitPortrait,
} from "./shared";

export function BenchSheet({ engine, selected, onClose, onAction }: { engine: AutoChessEngine; selected: OwnedUnit | null; onClose: () => void; onAction: (action: GameAction) => void }) {
  return (
    <Sheet title="备战席" eyebrow="ROSTER / 点击棋子再点目标格换位" onClose={onClose}>
      <div className="rift-sheet-bench-grid">{engine.state.bench.map((unit, index) => {
        const location: UnitLocation = { zone: "bench", index };
        const sellValue = unit ? engine.getUnitSellValue(unit) : 0;
        return <button key={index} className={engine.state.selected?.zone === "bench" && engine.state.selected.index === index ? "selected" : ""} onClick={() => onAction({ type: "slot", location })}>{unit ? <><span className="rift-dom-bench-portrait" style={{ borderColor: UNIT_DEFS[unit.id].accent, backgroundColor: UNIT_DEFS[unit.id].color }}><UnitPortrait unitId={unit.id} size={42} /></span><b>{UNIT_DEFS[unit.id].name}</b><span className="rift-bench-stars">{STAR_LABEL[unit.star]}</span><span className={`rift-bench-value ${sellValue > 5 ? "is-high" : ""}`} aria-label={`回收价值 ${sellValue} 金币`}><i aria-hidden="true" /><b>{sellValue}</b></span></> : <><span className="rift-empty-slot">+</span><small>空位</small></>}</button>;
      })}</div>
      <div className="rift-sheet-selection">{selected ? <><span className="rift-status-dot" />已选择 <b>{UNIT_DEFS[selected.id].name}</b> · 点击棋盘目标格可换位</> : "点击一个棋子开始布阵；右键棋子可快速回收"}</div>
      <div className="rift-sheet-bench-actions">
        {engine.isMaxPlayerLevel && <StarForgeAction engine={engine} selected={selected} onAction={onAction} />}
        <ActionButton tone="danger" disabled={!selected} onClick={() => onAction({ type: "sell" })}>出售选中棋子 <b>{selected ? `+${engine.getUnitSellValue(selected)}` : ""}</b></ActionButton>
      </div>
    </Sheet>
  );
}

export function TraitSheet({ engine, onClose }: { engine: AutoChessEngine; onClose: () => void }) {
  const [showAll, setShowAll] = useState(false);
  const filterId = useId();
  const traits = Object.values(TRAITS).map(trait => ({ trait, status: engine.getTraitStatus(trait.id) }))
    .filter(({ status }) => showAll || status.count > 0)
    .sort((left, right) => right.status.count - left.status.count);
  const deployed = new Set(engine.state.board.filter(Boolean).map(unit => unit!.id));
  const benched = new Set(engine.state.bench.filter(Boolean).map(unit => unit!.id));
  return (
    <Sheet title="羁绊网络" eyebrow="阵容规划" onClose={onClose}>
      <label className="rift-trait-filter" htmlFor={filterId}><input id={filterId} type="checkbox" checked={showAll} onChange={event => setShowAll(event.target.checked)} />全部羁绊</label>
      <div className="rift-trait-planner">
        {traits.map(({ trait, status }) => {
          const next = trait.thresholds.find(threshold => threshold > status.count);
          const members = SHOP_UNITS.filter(id => UNIT_DEFS[id].traits.includes(trait.id))
            .sort((left, right) => Number(deployed.has(right)) - Number(deployed.has(left))
              || Number(benched.has(right)) - Number(benched.has(left)) || UNIT_DEFS[left].cost - UNIT_DEFS[right].cost);
          return (
            <details key={trait.id} style={{ "--trait-color": trait.color } as CSSProperties}>
              <summary><strong>{trait.name}</strong><span>{status.count} / {next || status.maxThreshold} 人</span><b>{status.active ? STAR_LABEL[status.level] : "未激活"}</b></summary>
              <p>{status.active ? trait.bonuses[status.level - 1] : trait.description}</p>
              {next && <p className="rift-trait-next">再上阵 {next - status.count} 名不同成员：{trait.bonuses[status.level]}</p>}
              <ul>{members.map(id => <li key={id} className={deployed.has(id) ? "is-deployed" : benched.has(id) ? "is-benched" : "is-missing"}><UnitPortrait unitId={id} size={30} /><span>{UNIT_DEFS[id].name}</span><b>{UNIT_DEFS[id].cost} 费</b><small>{deployed.has(id) ? "已上场" : benched.has(id) ? "替补席" : "未持有"}</small></li>)}</ul>
            </details>
          );
        })}
      </div>
    </Sheet>
  );
}

export function MobileAugments({ engine, onAction }: { engine: AutoChessEngine; onAction: (action: GameAction) => void }) {
  const choices = engine.state.augmentChoices.map(id => AUGMENTS.find(augment => augment.id === id)!);
  return (
    <section className="rift-mobile-augments" aria-label="局中天赋" style={{ fontFamily: FONT }}>
      <header><span>第 {engine.state.round} 战</span><h2>局中{choices[0]?.tier === "major" ? "大" : "小"}天赋</h2></header>
      <div className="rift-mobile-augment-choices">
        {choices.map((augment, index) => (
          <button type="button" key={augment.id} className="rift-mobile-augment-option" style={{ "--augment-color": augment.color } as CSSProperties} aria-label={`选择${augment.name}`} onClick={() => onAction({ type: "augment", index })}>
            <span className="rift-augment-icon" aria-hidden="true">{augment.icon}</span>
            <div><small>{augment.kicker}</small><strong>{augment.name}</strong></div>
            <p>{augment.description}</p>
            <span className="rift-augment-confirm">选择天赋 <b aria-hidden="true">↗</b></span>
          </button>
        ))}
      </div>
    </section>
  );
}

export function MobileResult({ engine, onAction }: { engine: AutoChessEngine; onAction: (action: GameAction) => void }) {
  const [team, setTeam] = useState<Team>("player");
  const { state } = engine;
  const { result, battle } = state;
  if (!result || !battle) return null;
  const rows = engine.getBattleRanking(team);
  const metric = battle.rankingMetric;
  const metricValue = (value: number) => (value < 1000 ? Math.round(value).toString() : `${(value / 1000).toFixed(1)}k`);
  const metricText = (value: number, fighter: (typeof rows)[number]["fighter"]) => {
    if (metric === "support") return `治 ${metricValue(fighter.healingDone)} · 盾 ${metricValue(fighter.shieldingDone)}`;
    return `${metric === "damage" ? "输出" : "承伤"} ${metricValue(value)}`;
  };
  const reward = result.won
    ? `+${result.income} 金币${result.upgradeDiscount ? ` · 升本费用 -${result.upgradeDiscount}` : ""}`
    : `核心 -${result.damage} · +${result.income} 金币${result.upgradeDiscount ? ` · 升本费用 -${result.upgradeDiscount}` : ""}`;
  const debrief = engine.getBattleDebrief();
  const campaignVictory = result.won
    && state.round === CAMPAIGN_ROUNDS
    && !state.endlessUnlocked;
  return (
    <div className="rift-dom-layer rift-phase-result" style={{ fontFamily: FONT }}>
      <main className={`rift-mobile-result ${result.won ? "is-win" : "is-loss"}`}>
        <section className="rift-mobile-result-summary">
          <span className="rift-eyebrow">{result.won ? "战斗结算 · 胜利" : "战斗结算 · 失利"}</span>
          <h1>{result.headline}</h1>
          <p>{result.detail}</p>
          <strong>{reward}</strong>
          {debrief && (
            <aside className={`rift-mobile-result-debrief is-${debrief.tone}`} data-debrief-kind={debrief.kind}>
              <span>战术复盘</span>
              <strong>{debrief.title}</strong>
              <p>{debrief.detail}</p>
            </aside>
          )}
          <div className="rift-mobile-result-metrics" role="tablist" aria-label="统计指标">
            {(["damage", "support", "taken"] as RankingMetric[]).map((nextMetric) => (
              <button key={nextMetric} type="button" role="tab" aria-selected={metric === nextMetric} onClick={() => onAction({ type: "metric", metric: nextMetric })}>
                {nextMetric === "damage" ? "输出" : nextMetric === "support" ? "治疗/护盾" : "承伤"}
              </button>
            ))}
          </div>
        </section>
        <section className="rift-mobile-result-roster">
          <div className="rift-mobile-result-team-tabs" role="tablist" aria-label="阵容">
            <button type="button" role="tab" aria-selected={team === "player"} onClick={() => setTeam("player")}>我方阵容 <b>{battle.player.length}</b></button>
            <button type="button" role="tab" aria-selected={team === "enemy"} onClick={() => setTeam("enemy")}>敌方阵容 <b>{battle.enemy.length}</b></button>
          </div>
          <div className="rift-mobile-result-list">
            {rows.map(({ fighter, value }, index) => (
              <article key={fighter.fid} className={fighter.alive ? "" : "is-defeated"}>
                <span className="rift-mobile-result-rank">{index + 1}</span>
                <span className="rift-mobile-result-portrait" style={{ borderColor: UNIT_DEFS[fighter.unitId].accent, backgroundColor: UNIT_DEFS[fighter.unitId].color }}><UnitPortrait unitId={fighter.unitId} size={44} /></span>
                <div>
                  <strong>{UNIT_DEFS[fighter.unitId].name}<i>{"★".repeat(fighter.star)}</i></strong>
                  <small>血 {Math.round(fighter.hp)}/{Math.round(fighter.maxHp)} · 攻 {Math.round(fighter.attack)} · 甲 {Math.round(fighter.armor)}</small>
                </div>
                <span className="rift-mobile-result-value"><b>{metricText(value, fighter)}</b><small>{fighter.alive ? "存活" : "已击败"}</small></span>
              </article>
            ))}
          </div>
        </section>
        <div className={`rift-mobile-result-actions ${campaignVictory ? "is-campaign-clear" : ""}`}>
          {campaignVictory ? (
            <>
              <ActionButton tone="confirm" className="rift-mobile-result-finish" onClick={() => onAction({ type: "finishCampaign" })}>
                <span>完成远征</span><b>ENTER</b>
              </ActionButton>
              <ActionButton className="rift-mobile-result-endless" onClick={() => onAction({ type: "continueEndless" })}>
                <span>继续无限</span><b>第 17 战</b>
              </ActionButton>
            </>
          ) : (
            <ActionButton tone={result.won ? "confirm" : "danger"} className="rift-mobile-result-continue" onClick={() => onAction({ type: "resultContinue" })}>
              {engine.resultEndsRun ? "结束远征 · 查看总结" : augmentTierForRound(state.round) ? `继续 · 选择${augmentTierForRound(state.round) === "minor" ? "小" : "大"}天赋` : "继续 · 进入整备"}
            </ActionButton>
          )}
        </div>
      </main>
    </div>
  );
}

export function Sheet({ title, eyebrow, children, className = "", onClose }: { title: string; eyebrow: string; children: ReactNode; className?: string; onClose: () => void }) {
  return <div className="rift-dom-sheet-backdrop" role="dialog" aria-modal="true"><section className={`rift-dom-sheet ${className}`}><header><div><span className="rift-eyebrow">{eyebrow}</span><strong>{title}</strong></div><button onClick={onClose} aria-label="关闭面板">关闭 <b>×</b></button></header>{children}</section></div>;
}

export function Pager({ index, total, onPrevious, onNext }: { index: number; total: number; onPrevious: () => void; onNext: () => void }) {
  return <div className="rift-dom-pager"><button onClick={onPrevious} disabled={index <= 0}>← 上一项</button><span>{total ? String(index + 1).padStart(2, "0") : "00"} / {String(total).padStart(2, "0")}</span><button onClick={onNext} disabled={index >= total - 1}>下一项 →</button></div>;
}
