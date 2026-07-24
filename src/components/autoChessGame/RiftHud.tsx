"use client";

import { useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { AutoChessEngine } from "./core/gameEngine";
import {
  STARTERS,
  TRAITS,
  UNIT_DEFS,
  bookLevelForPlayerLevel,
  describeAbilityStarGrowth,
  describeEnergyRecovery,
  tierOddsForLevel,
} from "./core/gameData";
import type { OwnedUnit, UnitLocation } from "./core/gameTypes";
import type { GameAction } from "./phaser/EngineBridge";

const FONT = '"Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", "Noto Sans SC", sans-serif';
const STAR_LABEL = ["", "Ⅰ", "Ⅱ", "Ⅲ"];

type Props = {
  engine: AutoChessEngine | null;
  onAction: (action: GameAction) => void;
};

type SheetName = "shop" | "bench" | "traits" | null;
type Tone = "neutral" | "confirm" | "economic" | "danger" | "lock";
type OwnedStars = Record<1 | 2 | 3, number>;

function countOwnedStars(units: readonly (OwnedUnit | null | undefined)[], unitId: string): OwnedStars {
  const stars: OwnedStars = { 1: 0, 2: 0, 3: 0 };
  units.forEach((unit) => {
    if (unit?.id === unitId) stars[unit.star] += 1;
  });
  return stars;
}

function ownedLabel(stars: OwnedStars) {
  const total = stars[1] + stars[2] + stars[3];
  if (!total) return "";
  const starEntries = ([3, 2, 1] as const).filter((star) => stars[star] > 0).map((star) => `${star}星×${stars[star]}`);
  return starEntries.length === 1 && stars[1] === total ? `已有 ×${total}` : `已有 ${starEntries.join(" ")}`;
}

function UnitPortrait({ unitId, size = 42 }: { unitId: keyof typeof UNIT_DEFS; size?: number }) {
  const definition = UNIT_DEFS[unitId];
  const [failed, setFailed] = useState(false);

  if (!definition.portrait || failed) {
    return <span className="rift-dom-portrait-glyph">{definition.glyph}</span>;
  }

  return (
    <img
      src={definition.portrait}
      alt={definition.name}
      onError={() => setFailed(true)}
      style={definition.portraitStyle === "sprite"
        ? { width: size, height: size, objectFit: "contain", imageRendering: "pixelated" }
        : { width: size, height: size, objectFit: "cover", objectPosition: definition.portraitFocus === "top" ? "center 16%" : "center" }}
    />
  );
}

function ActionButton({ tone = "neutral", className = "", children, ...props }: { tone?: Tone; className?: string; children: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={`rift-action rift-action-${tone} ${className}`} {...props}>{children}</button>;
}

function HudHeader({ state, interestIncome }: { state: NonNullable<AutoChessEngine["state"]>; interestIncome: number }) {
  const progress = state.phase === "title" ? 0 : Math.min(100, ((state.round - 1) / state.maxRounds) * 100);
  return (
    <header className="rift-dom-header" style={{ fontFamily: FONT }}>
      <div className="rift-brand">
        <span className="rift-brand-mark">RL</span>
        <div>
          <strong>裂隙阵线</strong>
          <small>RIFT LINE · TACTICAL RUN</small>
        </div>
      </div>
      {state.phase !== "title" && (
        <div className="rift-run-progress" aria-label={`远征进度 ${state.round}/${state.maxRounds}`}>
          <div className="rift-run-progress-label"><span>远征进度</span><b>{state.round}/{state.maxRounds} 战</b></div>
          <div className="rift-run-track"><i style={{ width: `${progress}%` }} /></div>
          <small>{state.round >= state.maxRounds ? "终局冲击已解锁" : `距离首领还有 ${Math.max(0, state.maxRounds - state.round)} 战`}</small>
        </div>
      )}
      {state.phase === "title" ? (
        <div className="rift-header-best"><span>最高纪录</span><b>{state.bestScore.toLocaleString()}</b></div>
      ) : (
        <div className="rift-header-metrics">
          <div className="rift-header-metric rift-header-core"><span>核心</span><b>{state.hp}<small>/{state.maxHp}</small></b><i><em style={{ width: `${Math.max(0, (state.hp / state.maxHp) * 100)}%` }} /></i></div>
          <div className="rift-header-metric rift-header-gold"><span>金币</span><b>{state.gold}</b><small>利息 {interestIncome}</small></div>
          <div className="rift-header-metric rift-header-score"><span>积分</span><b>{state.score.toLocaleString()}</b><small>{state.streak > 0 ? `连胜 ${state.streak}` : "等待首胜"}</small></div>
        </div>
      )}
    </header>
  );
}

export default function RiftHud({ engine, onAction }: Props) {
  const [sheet, setSheet] = useState<SheetName>(null);
  const [starterPage, setStarterPage] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const state = engine?.state;

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
  const ownedStars = (unitId: string) => countOwnedStars([...state.board, ...state.bench], unitId);
  const wave = engine.currentWave;
  const activeTraits = engine.getActiveTraits();
  const odds = tierOddsForLevel(state.playerLevel);
  const starterIndex = Math.min(starterPage, Math.max(0, state.starterChoices.length - 1));

  if (state.phase === "title") {
    return (
      <div className="rift-dom-layer rift-dom-title" style={{ fontFamily: FONT }}>
        <HudHeader state={state} interestIncome={engine.interestIncome} />
        <div className="rift-dom-title-body">
          <section className="rift-title-copy">
            <span className="rift-eyebrow">RIFT LINE // 08 WAVE EXPEDITION</span>
            <h1>裂隙<span>阵线</span></h1>
            <p>每一战都要重新回答同一个问题：<br />你愿意把资源押在谁身上？</p>
            <div className="rift-title-notes"><span>短局构筑</span><span>自动战斗</span><span>自由布阵</span></div>
            <small className="rift-title-seed">战术种子 · {String(state.seed % 100000).padStart(5, "0")}</small>
          </section>
          <section className="rift-title-choice-panel">
            <div className="rift-section-heading"><span>01 / 接入协议</span><strong>选择你的第一笔优势</strong><small>协议会带来一名初始单位，并改变整局经济或战斗节奏。</small></div>
            <div className="rift-dom-choice-grid">
              {state.starterChoices.map((id, index) => {
                const starter = STARTERS.find((item) => item.id === id);
                if (!starter) return null;
                return (
                  <button key={id} className={`rift-dom-choice ${isMobile && index === starterIndex ? "active" : ""}`} style={{ "--choice-accent": starter.color } as CSSProperties} onClick={() => dispatch({ type: "starter", id })}>
                    <span className="rift-choice-index">0{index + 1}</span>
                    <div className="rift-dom-choice-portrait"><UnitPortrait unitId={starter.unit} size={68} /></div>
                    <small>{starter.subtitle}</small>
                    <strong>{starter.name}</strong>
                    <span>{starter.description}</span>
                    <em>接入协议 <b>↗</b></em>
                  </button>
                );
              })}
            </div>
            {isMobile && <Pager index={starterIndex} total={state.starterChoices.length} onPrevious={() => setStarterPage(Math.max(0, starterIndex - 1))} onNext={() => setStarterPage(Math.min(state.starterChoices.length - 1, starterIndex + 1))} />}
          </section>
        </div>
      </div>
    );
  }

  if (state.phase === "gameover") {
    return (
      <div className="rift-dom-layer rift-dom-modal-phase" style={{ fontFamily: FONT }}>
        <HudHeader state={state} interestIncome={engine.interestIncome} />
        <section className={`rift-dom-phase-card ${state.finalWon ? "is-win" : "is-loss"}`}>
          <span className="rift-eyebrow">RUN COMPLETE // {state.finalWon ? "RIFT SEALED" : "LINE LOST"}</span>
          <h1>{state.finalWon ? "裂隙已封闭" : "战线已失守"}</h1>
          <p>{state.finalWon ? "你守住了八次冲击。无限裂隙已开启，继续挑战你的纪录。" : "这一局的答案到此为止。调整开局协议，再试一次。"}</p>
          <div className="rift-final-stats"><span>本局积分 <b>{state.score.toLocaleString()}</b></span><span>核心 <b>{state.hp}/{state.maxHp}</b></span><span>最高纪录 <b>{state.bestScore.toLocaleString()}</b></span></div>
          <ActionButton tone={state.finalWon ? "confirm" : "danger"} onClick={() => dispatch({ type: "restart" })}>重新接入 <b>↗</b></ActionButton>
        </section>
      </div>
    );
  }

  if (state.phase === "augment" || state.phase === "result") return null;

  const battleOverlay = state.phase === "battle" && state.battle && (
    <div className="rift-dom-world-frame">
      <div className="rift-dom-battle-tools" style={{ fontFamily: FONT }}>
        <ActionButton onClick={() => dispatch({ type: "rankingToggle" })}>{state.battle.rankingOpen ? "收起统计" : "查看统计"}<span>D</span></ActionButton>
      </div>
    </div>
  );

  return (
    <div className="rift-dom-layer" style={{ fontFamily: FONT }}>
      <HudHeader state={state} interestIncome={engine.interestIncome} />
      {state.phase === "preparation" && (
        <>
          <div className="rift-dom-stage">
            <aside className="rift-dom-shop-desktop">
              <div className="rift-shop-heading"><div><span className="rift-eyebrow">TACTICAL SHOP</span><strong>战术商店</strong></div><div className="rift-shop-level"><b>{bookLevelForPlayerLevel(state.playerLevel)} 本</b><small>{engine.isMaxPlayerLevel ? "MAX LEVEL" : `下本还需 ${engine.upgradeCost} 金`}</small></div></div>
              <div className="rift-shop-economy"><span>金币 <b>{state.gold}</b></span><span>本战赏金 <b>{engine.potentialBounty}</b></span><span>利息 <b>+{engine.interestIncome}</b></span><span>连胜 <b>{state.streak || "—"}</b></span></div>
              <div className="rift-tier-odds">{odds.map((chance, index) => <span key={index} className={`tier-${index + 1} ${chance ? "" : "is-muted"}`}><i>{index + 1}</i><b>{chance}%</b></span>)}</div>
              <div className="rift-shop-list">{state.shop.map((unitId, index) => <ShopCard key={`${unitId}-${index}`} unitId={unitId} engine={engine} owned={unitId ? ownedStars(unitId) : { 1: 0, 2: 0, 3: 0 }} onBuy={() => dispatch({ type: "shop", index })} />)}</div>
              <div className="rift-dom-shop-actions"><ActionButton onClick={() => dispatch({ type: "buyXp" })} disabled={engine.isMaxPlayerLevel || state.gold < (engine.upgradeCost ?? Number.POSITIVE_INFINITY)}><span>升本</span><b>{engine.isMaxPlayerLevel ? "MAX" : engine.upgradeCost}</b></ActionButton><ActionButton tone="lock" className={state.shopLocked ? "is-selected" : ""} onClick={() => dispatch({ type: "lock" })}><span>{state.shopLocked ? "已锁定" : "锁定商店"}</span><b>{state.shopLocked ? "ON" : ""}</b></ActionButton><ActionButton tone="economic" onClick={() => dispatch({ type: "reroll" })} disabled={!state.freeRerollCharges && state.gold < 1}><span>刷新</span><b>{state.freeRerollCharges ? `免费 ${state.freeRerollCharges}` : "1"}</b></ActionButton><ActionButton tone="confirm" className="rift-start-button" onClick={() => dispatch({ type: "battle" })} disabled={!engine.boardCount}><span>开始战斗</span><b>SPACE</b></ActionButton></div>
              <footer>{activeTraits.length ? <><span className="rift-status-dot" />已激活 {activeTraits.map((trait) => `${trait.name}${STAR_LABEL[trait.level]}`).join(" · ")}</> : "上阵两名同名羁绊单位，开始构筑你的第一套答案"}</footer>
            </aside>
          </div>
          <section className="rift-mobile-brief">
            <div><span className="rift-eyebrow">ROUND {String(state.round).padStart(2, "0")} / QUICK READ</span><strong>{wave.name}</strong></div>
            <p>{engine.boardCount < engine.boardCap ? `还可上阵 ${engine.boardCap - engine.boardCount} 名单位。全歼本战敌军可得 ${engine.potentialBounty} 金。` : `人口已满。全歼本战敌军可得 ${engine.potentialBounty} 金。`}</p>
            <button onClick={() => setSheet("traits")}>查看羁绊 <b>↗</b></button>
          </section>
          <nav className="rift-dom-mobile-actions" aria-label="移动端战术操作"><ActionButton onClick={() => setSheet("shop")}><span className="rift-mobile-action-icon">◈</span><span>商店</span><b>{state.shop.filter(Boolean).length}</b></ActionButton><ActionButton onClick={() => setSheet("bench")}><span className="rift-mobile-action-icon">▦</span><span>备战席</span><b>{state.bench.filter(Boolean).length}/{state.bench.length}</b></ActionButton><ActionButton tone="confirm" onClick={() => dispatch({ type: "battle" })} disabled={!engine.boardCount}><span>开始战斗</span><b>SPACE</b></ActionButton></nav>
        </>
      )}
      {battleOverlay}
      {sheet === "shop" && <ShopSheet engine={engine} onClose={() => setSheet(null)} onAction={dispatch} />}
      {sheet === "bench" && <BenchSheet engine={engine} selected={selected} onClose={() => setSheet(null)} onAction={dispatch} />}
      {sheet === "traits" && <TraitSheet engine={engine} onClose={() => setSheet(null)} />}
    </div>
  );
}

function ShopCard({ unitId, engine, owned, onBuy }: { unitId: string | null; engine: AutoChessEngine; owned: OwnedStars; onBuy: () => void }) {
  const [showDetail, setShowDetail] = useState(false);
  if (!unitId) return <div className="rift-dom-shop-card empty">已征募</div>;
  const def = UNIT_DEFS[unitId as keyof typeof UNIT_DEFS];
  const totalOwned = owned[1] + owned[2] + owned[3];
  const canStore = engine.boardCount < engine.boardCap || engine.state.bench.some((unit) => !unit);
  const affordable = engine.state.gold >= def.cost && canStore;
  const role = def.title.split(" · ").at(-1) || def.title;
  const abilityGrowth = describeAbilityStarGrowth(def);
  const traitTags = def.traits.map((id) => {
    const trait = TRAITS[id];
    const status = engine.getTraitStatus(id);
    const nextThreshold = trait.thresholds[status.level];
    const willActivate = Boolean(
      affordable
      && !status.active
      && nextThreshold
      && status.count + 1 >= nextThreshold
      && !engine.state.board.some((unit) => unit?.id === unitId),
    );
    return { id, trait, status, willActivate };
  });
  return (
    <div
      className={`rift-shop-card-wrap ${showDetail ? "is-detail-open" : ""}`}
      onMouseEnter={() => setShowDetail(true)}
      onMouseLeave={() => setShowDetail(false)}
    >
      <button
        className={`rift-dom-shop-card ${totalOwned > 0 ? "has-owned" : ""} ${affordable ? "" : "disabled"} tier-card-${def.tier}`}
        onClick={onBuy}
        onFocus={() => setShowDetail(true)}
        onBlur={() => setShowDetail(false)}
        disabled={!affordable}
        aria-label={`${def.name}，${def.abilityName}`}
      >
        <div className="rift-shop-card-accent" />
        <div className="rift-dom-portrait" style={{ borderColor: def.accent }}><UnitPortrait unitId={unitId as keyof typeof UNIT_DEFS} size={42} /></div>
        <div className="rift-dom-shop-copy"><strong>{def.name}</strong><span>{role} · {def.abilityName}</span><div>{traitTags.map(({ id, trait, status, willActivate }) => <i key={id} className={`rift-trait-tag ${status.active ? "is-active" : ""} ${willActivate ? "is-next" : ""}`} style={{ "--tag-color": trait.color } as CSSProperties} title={willActivate ? `再买 1 个单位将激活${trait.name}` : trait.description}>{trait.name}</i>)}</div></div>
        <div className="rift-shop-card-meta">{totalOwned > 0 && <small className="rift-shop-owned">{ownedLabel(owned)}</small>}<b className="rift-dom-cost">{def.cost}</b></div>
      </button>
      {showDetail && (
        <div className="rift-shop-card-detail" role="tooltip">
          <div className="rift-detail-head"><span className="rift-eyebrow">UNIT BRIEF / TIER {def.tier}</span><strong>{def.name}</strong><small>{def.title}</small></div>
          <div className="rift-detail-tags">{traitTags.map(({ id, trait, status, willActivate }) => <i key={id} className={`rift-trait-tag ${status.active ? "is-active" : ""} ${willActivate ? "is-next" : ""}`} style={{ "--tag-color": trait.color } as CSSProperties}>{trait.name}</i>)}</div>
          <div className="rift-detail-stats"><span>生命 <b>{def.hp}</b></span><span>攻击 <b>{def.attack}</b></span><span>护甲 <b>{def.armor}</b></span><span>射程 <b>{def.range}</b></span></div>
          <div className="rift-detail-skill"><span>技能 · {def.abilityName}</span><p>{def.abilityDescription}{abilityGrowth && <><br />星级成长：{abilityGrowth}</>}</p></div>
          <small className="rift-detail-energy">{def.energyProfile.name} · {describeEnergyRecovery(def.energyProfile)}</small>
        </div>
      )}
    </div>
  );
}

function ShopSheet({ engine, onClose, onAction }: { engine: AutoChessEngine; onClose: () => void; onAction: (action: GameAction) => void }) {
  const ownedStars = (unitId: string) => countOwnedStars([...engine.state.board, ...engine.state.bench], unitId);
  return (
    <Sheet title="战术商店" eyebrow="SHOP / 五张随机单位" onClose={onClose}>
      <div className="rift-sheet-summary"><span>金币 <b>{engine.state.gold}</b></span><span>概率 <b>{tierOddsForLevel(engine.state.playerLevel).filter(Boolean).map((chance, index) => `${index + 1}费 ${chance}%`).join(" · ")}</b></span></div>
      <div className="rift-sheet-shop-list">{engine.state.shop.map((unitId, index) => <ShopCard key={`${unitId}-${index}`} unitId={unitId} engine={engine} owned={unitId ? ownedStars(unitId) : { 1: 0, 2: 0, 3: 0 }} onBuy={() => onAction({ type: "shop", index })} />)}</div>
      <div className="rift-dom-sheet-grid"><ActionButton onClick={() => onAction({ type: "buyXp" })} disabled={engine.isMaxPlayerLevel || engine.state.gold < (engine.upgradeCost ?? Number.POSITIVE_INFINITY)}>升本 · {engine.isMaxPlayerLevel ? "MAX" : engine.upgradeCost}</ActionButton><ActionButton tone="lock" className={engine.state.shopLocked ? "is-selected" : ""} onClick={() => onAction({ type: "lock" })}>{engine.state.shopLocked ? "已锁定" : "锁定商店"}</ActionButton><ActionButton tone="economic" onClick={() => onAction({ type: "reroll" })} disabled={!engine.state.freeRerollCharges && engine.state.gold < 1}>刷新 · {engine.state.freeRerollCharges ? `免费 ${engine.state.freeRerollCharges}` : 1}</ActionButton></div>
    </Sheet>
  );
}

function BenchSheet({ engine, selected, onClose, onAction }: { engine: AutoChessEngine; selected: OwnedUnit | null; onClose: () => void; onAction: (action: GameAction) => void }) {
  return (
    <Sheet title="备战席" eyebrow="ROSTER / 点击棋子再点目标格换位" onClose={onClose}>
      <div className="rift-sheet-bench-grid">{engine.state.bench.map((unit, index) => {
        const location: UnitLocation = { zone: "bench", index };
        return <button key={index} className={engine.state.selected?.zone === "bench" && engine.state.selected.index === index ? "selected" : ""} onClick={() => onAction({ type: "slot", location })}>{unit ? <><span className="rift-dom-bench-portrait" style={{ borderColor: UNIT_DEFS[unit.id].accent }}><UnitPortrait unitId={unit.id} size={42} /></span><b>{UNIT_DEFS[unit.id].name}</b><span className="rift-bench-stars">{STAR_LABEL[unit.star]}</span></> : <><span className="rift-empty-slot">+</span><small>空位</small></>}</button>;
      })}</div>
      <div className="rift-sheet-selection">{selected ? <><span className="rift-status-dot" />已选择 <b>{UNIT_DEFS[selected.id].name}</b> · 点击棋盘目标格可换位</> : "点击一个棋子开始布阵；右键棋子可快速回收"}</div>
      <ActionButton tone="danger" disabled={!selected} onClick={() => onAction({ type: "sell" })}>出售选中棋子 <b>{selected ? `+${UNIT_DEFS[selected.id].cost}` : ""}</b></ActionButton>
    </Sheet>
  );
}

function TraitSheet({ engine, onClose }: { engine: AutoChessEngine; onClose: () => void }) {
  const traits = Object.entries(engine.getTraitCounts()).filter(([, count]) => count > 0).map(([id, count]) => ({ trait: TRAITS[id as keyof typeof TRAITS], count, status: engine.getTraitStatus(id as keyof typeof TRAITS) }));
  return <Sheet title="羁绊网络" eyebrow="SYNERGY / 悬浮棋子查看完整技能" onClose={onClose}><div className="rift-trait-sheet-list">{traits.length ? traits.map(({ trait, count, status }) => <div key={trait.id} className={status.active ? "is-active" : ""} style={{ "--trait-color": trait.color } as CSSProperties}><span className="rift-trait-orb">{status.active ? "✦" : "·"}</span><div><strong>{trait.name} <small>{trait.family}</small></strong><p>{count} 人 · {status.active ? trait.bonuses[status.level - 1] : `还差 ${Math.max(1, (trait.thresholds.find((threshold) => threshold > count) ?? count + 1) - count)} 人激活`}</p></div><b>{status.active ? STAR_LABEL[status.level] : "—"}</b></div>) : <p className="rift-sheet-empty">上阵单位后，羁绊会在这里展开。</p>}</div></Sheet>;
}

function Sheet({ title, eyebrow, children, onClose }: { title: string; eyebrow: string; children: ReactNode; onClose: () => void }) {
  return <div className="rift-dom-sheet-backdrop" role="dialog" aria-modal="true"><section className="rift-dom-sheet"><header><div><span className="rift-eyebrow">{eyebrow}</span><strong>{title}</strong></div><button onClick={onClose} aria-label="关闭面板">关闭 <b>×</b></button></header>{children}</section></div>;
}

function Pager({ index, total, onPrevious, onNext }: { index: number; total: number; onPrevious: () => void; onNext: () => void }) {
  return <div className="rift-dom-pager"><button onClick={onPrevious} disabled={index <= 0}>← 上一项</button><span>{total ? String(index + 1).padStart(2, "0") : "00"} / {String(total).padStart(2, "0")}</span><button onClick={onNext} disabled={index >= total - 1}>下一项 →</button></div>;
}
