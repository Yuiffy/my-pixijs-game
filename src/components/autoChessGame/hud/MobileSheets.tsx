import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { AutoChessEngine } from "../core/gameEngine";
import {
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
  UnitPortrait,
} from "./shared";

export function BenchSheet({ engine, selected, onClose, onAction }: { engine: AutoChessEngine; selected: OwnedUnit | null; onClose: () => void; onAction: (action: GameAction) => void }) {
  return (
    <Sheet title="备战席" eyebrow="ROSTER / 点击棋子再点目标格换位" onClose={onClose}>
      <div className="rift-sheet-bench-grid">{engine.state.bench.map((unit, index) => {
        const location: UnitLocation = { zone: "bench", index };
        const sellValue = unit ? engine.getUnitSellValue(unit) : 0;
        return <button key={index} className={engine.state.selected?.zone === "bench" && engine.state.selected.index === index ? "selected" : ""} onClick={() => onAction({ type: "slot", location })}>{unit ? <><span className="rift-dom-bench-portrait" style={{ borderColor: UNIT_DEFS[unit.id].accent }}><UnitPortrait unitId={unit.id} size={42} /></span><b>{UNIT_DEFS[unit.id].name}</b><span className="rift-bench-stars">{STAR_LABEL[unit.star]}</span><span className={`rift-bench-value ${sellValue > 5 ? "is-high" : ""}`} aria-label={`回收价值 ${sellValue} 金币`}><i aria-hidden="true" /><b>{sellValue}</b></span></> : <><span className="rift-empty-slot">+</span><small>空位</small></>}</button>;
      })}</div>
      <div className="rift-sheet-selection">{selected ? <><span className="rift-status-dot" />已选择 <b>{UNIT_DEFS[selected.id].name}</b> · 点击棋盘目标格可换位</> : "点击一个棋子开始布阵；右键棋子可快速回收"}</div>
      <ActionButton tone="danger" disabled={!selected} onClick={() => onAction({ type: "sell" })}>出售选中棋子 <b>{selected ? `+${engine.getUnitSellValue(selected)}` : ""}</b></ActionButton>
    </Sheet>
  );
}

export function TraitSheet({ engine, onClose }: { engine: AutoChessEngine; onClose: () => void }) {
  const traits = Object.entries(engine.getTraitCounts()).filter(([, count]) => count > 0).map(([id, count]) => ({ trait: TRAITS[id as keyof typeof TRAITS], count, status: engine.getTraitStatus(id as keyof typeof TRAITS) }));
  return <Sheet title="羁绊网络" eyebrow="SYNERGY / 悬浮棋子查看完整技能" onClose={onClose}><div className="rift-trait-sheet-list">{traits.length ? traits.map(({ trait, count, status }) => <div key={trait.id} className={status.active ? "is-active" : ""} style={{ "--trait-color": trait.color } as CSSProperties}><span className="rift-trait-orb">{status.active ? "✦" : "·"}</span><div><strong>{trait.name} <small>{trait.family}</small></strong><p>{count} 人 · {status.active ? trait.bonuses[status.level - 1] : `还差 ${Math.max(1, (trait.thresholds.find((threshold) => threshold > count) ?? count + 1) - count)} 人激活`}</p></div><b>{status.active ? STAR_LABEL[status.level] : "—"}</b></div>) : <p className="rift-sheet-empty">上阵单位后，羁绊会在这里展开。</p>}</div></Sheet>;
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
  return (
    <div className="rift-dom-layer rift-phase-result" style={{ fontFamily: FONT }}>
      <main className={`rift-mobile-result ${result.won ? "is-win" : "is-loss"}`}>
        <section className="rift-mobile-result-summary">
          <span className="rift-eyebrow">{result.won ? "战斗结算 · 胜利" : "战斗结算 · 失利"}</span>
          <h1>{result.headline}</h1>
          <p>{result.detail}</p>
          <strong>{reward}</strong>
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
                <span className="rift-mobile-result-portrait" style={{ borderColor: UNIT_DEFS[fighter.unitId].accent }}><UnitPortrait unitId={fighter.unitId} size={44} /></span>
                <div>
                  <strong>{UNIT_DEFS[fighter.unitId].name}<i>{"★".repeat(fighter.star)}</i></strong>
                  <small>血 {Math.round(fighter.hp)}/{Math.round(fighter.maxHp)} · 攻 {Math.round(fighter.attack)} · 甲 {Math.round(fighter.armor)}</small>
                </div>
                <span className="rift-mobile-result-value"><b>{metricText(value, fighter)}</b><small>{fighter.alive ? "存活" : "已击败"}</small></span>
              </article>
            ))}
          </div>
        </section>
        <ActionButton tone={result.won ? "confirm" : "danger"} className="rift-mobile-result-continue" onClick={() => onAction({ type: "resultContinue" })}>
          {state.hp <= 0 ? "继续 · 查看结局" : augmentTierForRound(state.round) ? `继续 · 选择${augmentTierForRound(state.round) === "minor" ? "小" : "大"}天赋` : "继续 · 进入整备"}
        </ActionButton>
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
