"use client";

import { useEffect, useMemo, useState } from "react";
import type { AutoChessEngine } from "./core/gameEngine";
import { AUGMENTS, STARTERS, TRAITS, UNIT_DEFS, bookLevelForPlayerLevel, tierOddsForLevel } from "./core/gameData";
import type { OwnedUnit, RankingMetric, UnitLocation } from "./core/gameTypes";
import type { GameAction } from "./phaser/EngineBridge";

const FONT = '"Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", "Noto Sans SC", sans-serif';

type Props = {
  engine: AutoChessEngine | null;
  onAction: (action: GameAction) => void;
};

type Sheet = "shop" | "bench" | null;

const actionButton = (tone: "neutral" | "confirm" | "economic" | "danger" = "neutral"): React.CSSProperties => ({
  border: tone === "confirm" ? "1px solid #a5f2d0" : tone === "economic" ? "1px solid #ffdf8b" : tone === "danger" ? "1px solid #ffa4b8" : "1px solid #6f9db7",
  borderRadius: 10,
  minHeight: 42,
  padding: "8px 12px",
  background: tone === "confirm" ? "#47bd8a" : tone === "economic" ? "#b9872d" : tone === "danger" ? "#983f55" : "#17384d",
  color: tone === "confirm" || tone === "economic" ? "#081c16" : "#eff9ff",
  font: `700 13px ${FONT}`,
  cursor: "pointer",
});

const metricLabels: Record<RankingMetric, string> = { damage: "输出", support: "治疗/护盾", taken: "承伤" };

function UnitPortrait({ unitId, size = 42 }: { unitId: keyof typeof UNIT_DEFS; size?: number }) {
  const definition = UNIT_DEFS[unitId];
  const [failed, setFailed] = useState(false);
  if (!definition.portrait || failed) return <span className="rift-dom-portrait-glyph">{definition.glyph}</span>;
  return <img src={definition.portrait} alt={definition.name} onError={() => setFailed(true)} style={definition.portraitStyle === "sprite"
    ? { width: size, height: size, objectFit: "contain", imageRendering: "pixelated" }
    : { width: size, height: size, objectFit: "cover", objectPosition: definition.portraitFocus === "top" ? "center 16%" : "center" }} />;
}

export default function RiftHud({ engine, onAction }: Props) {
  const [sheet, setSheet] = useState<Sheet>(null);
  const [shopPage, setShopPage] = useState(0);
  const [starterPage, setStarterPage] = useState(0);
  const [augmentPage, setAugmentPage] = useState(0);
  const [resultTeam, setResultTeam] = useState<"player" | "enemy">("player");
  const state = engine?.state;

  const shopEntries = useMemo(() => state?.shop.map((unitId, index) => ({ unitId, index })).filter((entry) => entry.unitId) ?? [], [state?.shop]);
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 700px), (pointer: coarse) and (orientation: portrait)");
    const sync = () => setIsMobile(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  if (!engine || !state) return null;

  const dispatch = (action: GameAction) => onAction(action);
  const selected = state.selected
    ? (state.selected.zone === "board" ? state.board[state.selected.index] : state.bench[state.selected.index])
    : null;
  const header = (
    <header className="rift-dom-header" style={{ fontFamily: FONT }}>
      <strong>裂隙阵线 <small>RIFT LINE</small></strong>
      {state.phase !== "title" && <span>第 {state.round}/{state.maxRounds} 战</span>}
      <span>核心 <b>{state.hp}/{state.maxHp}</b></span>
      <span>金币 <b style={{ color: "#ffd166" }}>{state.gold}</b></span>
      <span className="rift-dom-header-score">积分 <b>{state.score.toLocaleString()}</b></span>
    </header>
  );

  const traitStrip = state.phase === "preparation" && (
    <div className="rift-dom-traits">
      {Object.entries(engine.getTraitCounts()).filter(([, count]) => count > 0).map(([id, count]) => {
        const trait = TRAITS[id as keyof typeof TRAITS];
        const status = engine.getTraitStatus(trait.id);
        const threshold = trait.thresholds.find((value) => value > count) ?? status.maxThreshold;
        return <span key={id} style={{ borderColor: trait.color, color: status.active ? "#f5fcff" : "#aabdc8" }}>{trait.name} {count}/{threshold}</span>;
      })}
    </div>
  );

  if (state.phase === "title") {
    const page = Math.min(starterPage, Math.max(0, state.starterChoices.length - 1));
    return <div className="rift-dom-layer rift-dom-title">{header}<div className="rift-dom-title-body"><p>守住八次冲击。每一次购买，都该改变你的答案。</p><h1>裂 隙 阵 线</h1><h2>选择一项开局协议</h2><div className="rift-dom-choice-grid">{state.starterChoices.map((id, index) => {
      const starter = STARTERS.find((item) => item.id === id);
      if (!starter) return null;
      return <button key={id} className={`rift-dom-choice ${isMobile && index === page ? "active" : ""}`} style={{ borderColor: starter.color }} onClick={() => dispatch({ type: "starter", id })}><div className="rift-dom-choice-portrait" style={{ borderColor: starter.color }}><UnitPortrait unitId={starter.unit} size={78} /></div><small style={{ color: starter.color }}>{starter.subtitle}</small><strong>{starter.name}</strong><span>{starter.description}</span><em>选择协议</em></button>;
    })}</div>{isMobile && <Pager index={page} total={state.starterChoices.length} onPrevious={() => setStarterPage(Math.max(0, page - 1))} onNext={() => setStarterPage(Math.min(state.starterChoices.length - 1, page + 1))} />}</div></div>;
  }

  if (state.phase === "augment") {
    const page = Math.min(augmentPage, Math.max(0, state.augmentChoices.length - 1));
    const augment = AUGMENTS.find((item) => item.id === state.augmentChoices[page]);
    const visibleChoices = isMobile ? state.augmentChoices.slice(page, page + 1) : state.augmentChoices;
    return <div className="rift-dom-layer rift-dom-modal-phase">{header}<section className="rift-dom-augment-grid">{visibleChoices.map((id) => { const index = state.augmentChoices.indexOf(id); const item = AUGMENTS.find((entry) => entry.id === id); if (!item) return null; return <button key={id} className={`rift-dom-augment-card ${index === page ? "active" : ""}`} style={{ borderColor: item.color }} onClick={() => setAugmentPage(index)}><span className="rift-dom-augment-emblem" style={{ color: item.color, borderColor: item.color }}>◇</span><small style={{ color: item.color }}>{item.kicker}</small><strong>{item.name}</strong><p>{item.description}</p><em>{index === page ? "已选择" : "查看"}</em></button>; })}</section><section className="rift-dom-phase-card rift-dom-augment-cta">{augment && <><p>{augment.name}</p><button style={actionButton("confirm")} onClick={() => dispatch({ type: "augment", index: page })}>装备契印</button></>}{isMobile && <Pager index={page} total={state.augmentChoices.length} onPrevious={() => setAugmentPage(Math.max(0, page - 1))} onNext={() => setAugmentPage(Math.min(state.augmentChoices.length - 1, page + 1))} />}</section></div>;
  }

  if (state.phase === "result" && state.result && state.battle) {
    const ranking = engine.getBattleRanking(resultTeam);
    return <div className="rift-dom-layer rift-dom-modal-phase">{header}<section className="rift-dom-result"><small style={{ color: state.result.won ? "#62e3a6" : "#ff718a" }}>战斗结算 · {state.result.won ? "胜利" : "失利"}</small><h1>{state.result.headline}</h1><p>{state.result.detail}</p><div className="rift-dom-tabs">{(["damage", "support", "taken"] as RankingMetric[]).map((metric) => <button key={metric} onClick={() => dispatch({ type: "metric", metric })} className={state.battle?.rankingMetric === metric ? "active" : ""}>{metricLabels[metric]}</button>)}</div><div className="rift-dom-tabs">{(["player", "enemy"] as const).map((team) => <button key={team} onClick={() => setResultTeam(team)} className={resultTeam === team ? "active" : ""}>{team === "player" ? "我方阵容" : "敌方阵容"}</button>)}</div><ol>{ranking.map(({ fighter, value }, index) => <li key={fighter.fid}><span>{index + 1}. {UNIT_DEFS[fighter.unitId].name}{"★".repeat(fighter.star)}</span><b>{Math.round(value)}</b></li>)}</ol><button style={actionButton(state.result.won ? "confirm" : "danger")} onClick={() => dispatch({ type: "resultContinue" })}>继续</button></section></div>;
  }

  if (state.phase === "gameover") {
    return <div className="rift-dom-layer rift-dom-modal-phase">{header}<section className="rift-dom-phase-card"><h1>{state.finalWon ? "裂隙已封闭" : "战线已失守"}</h1><p>本局积分 {state.score.toLocaleString()} · 核心 {state.hp}/{state.maxHp}</p><button style={actionButton(state.finalWon ? "confirm" : "danger")} onClick={() => dispatch({ type: "restart" })}>再开一局</button></section></div>;
  }

  const battleOverlay = state.phase === "battle" && state.battle && <div className="rift-dom-battle-tools"><b>⏱ {Math.max(0, state.battle.limit - state.battle.elapsed).toFixed(1)}s</b><button style={actionButton()} onClick={() => dispatch({ type: "rankingToggle" })}>战斗统计</button></div>;

  const wave = engine.currentWave;
  const activeTraits = engine.getActiveTraits();
  const odds = tierOddsForLevel(state.playerLevel).map((chance, index) => chance ? `${index + 1}费${chance}%` : "").filter(Boolean).join(" · ");
  return <div className="rift-dom-layer" style={{ fontFamily: FONT }}>{header}{state.phase === "preparation" && <>{isMobile && <><div className="rift-dom-stage"><section className="rift-dom-briefing"><div><b className={`rift-dom-wave ${wave.tag}`}>{wave.tag === "boss" ? "BOSS" : wave.tag === "elite" ? "ELITE" : `WAVE ${wave.round}`}</b><h2>{wave.name}</h2><p>{wave.description}</p></div><div className="rift-dom-enemies"><small>敌情预览 · 悬浮查看技能</small><div>{wave.units.slice(0, 7).map((unit, index) => <span key={`${unit.id}-${index}`}><UnitPortrait unitId={unit.id} size={30} /></span>)}</div></div></section><div className="rift-dom-traits rift-dom-stage-traits">{Object.entries(engine.getTraitCounts()).filter(([, count]) => count > 0).map(([id, count]) => { const trait = TRAITS[id as keyof typeof TRAITS]; const status = engine.getTraitStatus(trait.id); const threshold = trait.thresholds.find((value) => value > count) ?? status.maxThreshold; return <span key={id} style={{ borderColor: trait.color, color: status.active ? "#f5fcff" : "#aabdc8" }}>{trait.name} {count}/{threshold}</span>; })}</div><div className="rift-dom-deployment"><span>后方 · 远程与辅助</span><b>6 × 4 自由部署区 · 满级 8 人口</b><span>前线 · 优先接敌 →</span></div><aside className="rift-dom-shop-desktop"><header><strong>战术商店 · {bookLevelForPlayerLevel(state.playerLevel)} 本</strong><small>{engine.isMaxPlayerLevel ? "已满级" : `距 ${bookLevelForPlayerLevel(state.playerLevel) + 1} 本还需 ${engine.upgradeCost} 金币`}</small><em>{odds}</em></header>{state.shop.map((unitId, index) => <ShopCard key={`${unitId}-${index}`} unitId={unitId} index={index} engine={engine} onBuy={() => dispatch({ type: "shop", index })} />)}<div className="rift-dom-shop-actions"><button style={actionButton()} onClick={() => dispatch({ type: "buyXp" })}>升本 · {engine.isMaxPlayerLevel ? "已满级" : engine.upgradeCost}</button><button style={actionButton()} onClick={() => dispatch({ type: "lock" })}>{state.shopLocked ? "已锁定" : "锁定商店"}</button><button style={actionButton("economic")} onClick={() => dispatch({ type: "reroll" })}>刷新 · {state.freeRerollCharges ? "免费" : 1}</button><button style={actionButton("confirm")} onClick={() => dispatch({ type: "battle" })}>开始战斗</button></div><footer>{activeTraits.length ? `已激活：${activeTraits.map((trait) => `${trait.name}${["", "Ⅰ", "Ⅱ", "Ⅲ"][trait.level] ?? ""}`).join(" · ")}` : "常规羁绊按 2/4/6；关系羁绊按图标说明"}</footer></aside></div><nav className="rift-dom-mobile-actions"><button style={actionButton()} onClick={() => setSheet("shop")}>商店</button><button style={actionButton()} onClick={() => setSheet("bench")}>备战席</button><button style={actionButton("confirm")} onClick={() => dispatch({ type: "battle" })}>开始战斗</button></nav></>}</>}{battleOverlay}{sheet === "shop" && <ShopSheet entries={shopEntries} page={shopPage} setPage={setShopPage} engine={engine} onClose={() => setSheet(null)} onAction={dispatch} />}{sheet === "bench" && <BenchSheet engine={engine} selected={selected} onClose={() => setSheet(null)} onAction={dispatch} />}</div>;
}

function ShopCard({ unitId, index, engine, onBuy }: { unitId: string | null; index: number; engine: AutoChessEngine; onBuy: () => void }) {
  if (!unitId) return <div className="rift-dom-shop-card empty">已征募</div>;
  const def = UNIT_DEFS[unitId as keyof typeof UNIT_DEFS];
  const affordable = engine.state.gold >= def.cost && (engine.boardCount < engine.boardCap || engine.state.bench.some((unit) => !unit));
  const role = def.title.split(" · ").at(-1) || def.title;
  return <button className={`rift-dom-shop-card ${affordable ? "" : "disabled"}`} onClick={onBuy} disabled={!affordable}><div className="rift-dom-portrait" style={{ borderColor: def.accent }}><UnitPortrait unitId={unitId as keyof typeof UNIT_DEFS} size={40} /></div><div className="rift-dom-shop-copy"><strong>{def.name}</strong><span>{role}</span><div>{def.traits.map((id) => <i key={id} style={{ borderColor: TRAITS[id].color }}>{TRAITS[id].name}</i>)}</div></div><b className="rift-dom-cost">{def.cost}</b></button>;
}

function ShopSheet({ entries, page, setPage, engine, onClose, onAction }: { entries: Array<{ unitId: string | null; index: number }>; page: number; setPage: (value: number) => void; engine: AutoChessEngine; onClose: () => void; onAction: (action: GameAction) => void }) {
  const current = entries[Math.min(page, Math.max(0, entries.length - 1))];
  return <Sheet title="战术商店" onClose={onClose}><div className="rift-dom-sheet-shop">{current && <ShopCard unitId={current.unitId} index={current.index} engine={engine} onBuy={() => onAction({ type: "shop", index: current.index })} />}<Pager index={page} total={entries.length} onPrevious={() => setPage(Math.max(0, page - 1))} onNext={() => setPage(Math.min(entries.length - 1, page + 1))} /><div className="rift-dom-sheet-grid"><button style={actionButton()} onClick={() => onAction({ type: "buyXp" })}>升本 · {engine.isMaxPlayerLevel ? "已满级" : engine.upgradeCost}</button><button style={actionButton()} onClick={() => onAction({ type: "lock" })}>{engine.state.shopLocked ? "已锁定" : "锁定商店"}</button><button style={actionButton("economic")} onClick={() => onAction({ type: "reroll" })}>刷新 · {engine.state.freeRerollCharges ? "免费" : 1}</button></div></div></Sheet>;
}

function BenchSheet({ engine, selected, onClose, onAction }: { engine: AutoChessEngine; selected: OwnedUnit | null; onClose: () => void; onAction: (action: GameAction) => void }) {
  return <Sheet title="备战席" onClose={onClose}><div className="rift-dom-bench-grid">{engine.state.bench.map((unit, index) => { const location: UnitLocation = { zone: "bench", index }; return <button key={index} className={engine.state.selected?.zone === "bench" && engine.state.selected.index === index ? "selected" : ""} onClick={() => onAction({ type: "slot", location })}>{unit ? <><span className="rift-dom-bench-portrait"><UnitPortrait unitId={unit.id} size={36} /></span><b>{UNIT_DEFS[unit.id].name}</b><span>{"★".repeat(unit.star)}</span></> : "空"}</button>; })}</div><p>{selected ? `已选择：${UNIT_DEFS[selected.id].name}` : "选择一个棋子后，可点棋盘目标格换位。"}</p><button style={actionButton("danger")} disabled={!selected} onClick={() => onAction({ type: "sell" })}>出售选中棋子</button></Sheet>;
}

function Sheet({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return <div className="rift-dom-sheet-backdrop" role="dialog" aria-modal="true"><section className="rift-dom-sheet"><header><strong>{title}</strong><button onClick={onClose}>关闭</button></header>{children}</section></div>;
}

function Pager({ index, total, onPrevious, onNext }: { index: number; total: number; onPrevious: () => void; onNext: () => void }) {
  return <div className="rift-dom-pager"><button onClick={onPrevious} disabled={index <= 0}>上一项</button><span>{total ? index + 1 : 0} / {total}</span><button onClick={onNext} disabled={index >= total - 1}>下一项</button></div>;
}
