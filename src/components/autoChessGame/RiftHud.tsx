"use client";

import { useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { AutoChessEngine } from "./core/gameEngine";
import {
  CAMPAIGN_ROUNDS,
  FINANCE_INTEREST_CAP,
  NORMAL_ENDLESS_END_ROUND,
  STARTERS,
  TRAITS,
  UNIT_DEFS,
  augmentTierForRound,
  bookLevelForPlayerLevel,
  describeAbilityStarGrowth,
  describeEnergyRecovery,
  enemyBudgetForRound,
  enemyTraitActivations,
  progressionModeForRound,
  tierOddsForLevel,
} from "./core/gameData";
import type { TraitId } from "./core/gameData";
import type { OwnedUnit, RankingMetric, Team, UnitLocation } from "./core/gameTypes";
import type { GameAction } from "./phaser/EngineBridge";

const FONT = '"Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", "Noto Sans SC", sans-serif';
const STAR_LABEL = ["", "Ⅰ", "Ⅱ", "Ⅲ"];

type Props = {
  engine: AutoChessEngine | null;
  onAction: (action: GameAction) => void;
  onBattleViewAction: (action: BattleViewAction) => void;
};

export type BattleViewAction = "zoomOut" | "reset" | "zoomIn";
type SheetName = "shop" | "bench" | "traits" | null;
type Tone = "neutral" | "confirm" | "economic" | "danger" | "lock";
type OwnedStars = Record<1 | 2 | 3, number>;
type BattleTraitInfo = (typeof TRAITS)[TraitId] & { count: number; level: number };
const MOBILE_VIEW_QUERY = "(max-width: 700px), (pointer: coarse) and (max-width: 1200px)";

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
    // eslint-disable-next-line @next/next/no-img-element
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

function HudHeader({ state }: { state: NonNullable<AutoChessEngine["state"]> }) {
  const mode = progressionModeForRound(state.round);
  const progress =
    state.phase === "title"
      ? 0
      : mode === "campaign"
        ? Math.min(100, (state.round / CAMPAIGN_ROUNDS) * 100)
        : mode === "endless"
          ? Math.min(100, ((state.round - CAMPAIGN_ROUNDS) / (NORMAL_ENDLESS_END_ROUND - CAMPAIGN_ROUNDS)) * 100)
          : 100;
  const progressLabel = mode === "campaign" ? "远征进度" : mode === "endless" ? "普通无限" : "地狱无限";
  const progressValue =
    mode === "campaign"
      ? `${state.round}/${CAMPAIGN_ROUNDS} 战`
      : mode === "endless"
        ? `${state.round}/${NORMAL_ENDLESS_END_ROUND} 战`
        : `第 ${state.round} 战`;
  const progressHint =
    mode === "campaign"
      ? state.round === CAMPAIGN_ROUNDS
        ? "终局首领已抵达"
        : "每 4 战迎战精英"
      : mode === "endless"
        ? `距离地狱无限还有 ${NORMAL_ENDLESS_END_ROUND - state.round} 战`
        : "敌人会持续变强";
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
        <div className={`rift-run-progress mode-${mode}`} aria-label={`${progressLabel} ${progressValue}`}>
          <div className="rift-run-progress-label"><span>{progressLabel}</span><b>{progressValue}</b></div>
          <div className="rift-run-track"><i style={{ width: `${progress}%` }} /></div>
          <small>{progressHint}</small>
        </div>
      )}
      {state.phase === "title" ? (
        <div className="rift-header-best"><span>最高纪录</span><b>{state.bestScore.toLocaleString()}</b></div>
      ) : (
        <div className="rift-header-metrics">
          <div className="rift-header-metric rift-header-core"><span>核心</span><b>{state.hp}<small>/{state.maxHp}</small></b><i><em style={{ width: `${Math.max(0, (state.hp / state.maxHp) * 100)}%` }} /></i></div>
          <div className="rift-header-metric rift-header-score"><span>积分</span><b>{state.score.toLocaleString()}</b><small>{state.streak > 0 ? `连胜 ${state.streak}` : "等待首胜"}</small></div>
        </div>
      )}
    </header>
  );
}

function BattleTraitSide({
  team,
  label,
  traits,
  collapsed,
  activeKey,
  onActivate,
  onDeactivate,
}: {
  team: Team;
  label: string;
  traits: BattleTraitInfo[];
  collapsed: boolean;
  activeKey: string | null;
  onActivate: (key: string) => void;
  onDeactivate: () => void;
}) {
  return (
    <section className={`rift-battle-trait-side is-${team}`} data-team={team}>
      <header>
        <span>{label}</span>
        <b>{traits.length ? `${traits.length} 羁绊` : "未成型"}</b>
      </header>
      {collapsed ? (
        <div className="rift-battle-trait-summary" aria-hidden="true">
          {traits.slice(0, 5).map((trait) => (
            <i key={trait.id} style={{ "--trait-color": trait.color } as CSSProperties} />
          ))}
          {traits.length > 5 && <em>+{traits.length - 5}</em>}
        </div>
      ) : (
        <div className="rift-battle-trait-tags">
          {traits.length ? traits.map((trait) => {
            const key = `${team}:${trait.id}`;
            return (
              <button
                key={trait.id}
                type="button"
                className={activeKey === key ? "is-open" : ""}
                style={{ "--trait-color": trait.color } as CSSProperties}
                aria-expanded={activeKey === key}
                aria-label={`${label}${trait.name}${STAR_LABEL[trait.level]}，${trait.count}人`}
                onMouseEnter={() => onActivate(key)}
                onMouseLeave={onDeactivate}
                onFocus={() => onActivate(key)}
                onBlur={onDeactivate}
                onClick={() => onActivate(key)}
              >
                <i />
                <span>{trait.name}</span>
                <small>{trait.count}</small>
                <b>{STAR_LABEL[trait.level]}</b>
              </button>
            );
          }) : <span className="rift-battle-trait-empty">没有已激活羁绊</span>}
        </div>
      )}
    </section>
  );
}

function BattleTraitBar({
  playerTraits,
  enemyTraits,
  collapsed,
  onToggle,
}: {
  playerTraits: BattleTraitInfo[];
  enemyTraits: BattleTraitInfo[];
  collapsed: boolean;
  onToggle: () => void;
}) {
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const activeTrait = [...playerTraits.map((trait) => ({ team: "player" as const, trait })), ...enemyTraits.map((trait) => ({ team: "enemy" as const, trait }))]
    .find(({ team, trait }) => `${team}:${trait.id}` === activeKey);

  return (
    <div className={`rift-battle-traits ${collapsed ? "is-collapsed" : ""}`} aria-label="双方战斗羁绊">
      <BattleTraitSide
        team="player"
        label="我方"
        traits={playerTraits}
        collapsed={collapsed}
        activeKey={activeKey}
        onActivate={setActiveKey}
        onDeactivate={() => setActiveKey(null)}
      />
      <button
        type="button"
        className="rift-battle-traits-toggle"
        aria-label={collapsed ? "展开双方羁绊" : "收起双方羁绊"}
        aria-expanded={!collapsed}
        title={collapsed ? "展开双方羁绊" : "收起双方羁绊"}
        onClick={onToggle}
      >
        <span aria-hidden="true">{collapsed ? "⌄" : "⌃"}</span>
      </button>
      <BattleTraitSide
        team="enemy"
        label="敌方"
        traits={enemyTraits}
        collapsed={collapsed}
        activeKey={activeKey}
        onActivate={setActiveKey}
        onDeactivate={() => setActiveKey(null)}
      />
      {activeTrait && !collapsed && (
        <aside
          className={`rift-battle-trait-detail is-${activeTrait.team}`}
          style={{ "--trait-color": activeTrait.trait.color } as CSSProperties}
          role="tooltip"
        >
          <header>
            <div><span>{activeTrait.team === "player" ? "我方" : "敌方"} · {activeTrait.trait.family}</span><strong>{activeTrait.trait.name} {STAR_LABEL[activeTrait.trait.level]}</strong></div>
            <b>{activeTrait.trait.count} 人</b>
          </header>
          <p>{activeTrait.trait.description}</p>
          <em>当前效果：{activeTrait.trait.bonuses[activeTrait.trait.level - 1]}</em>
          <div>
            {activeTrait.trait.thresholds.map((threshold, index) => (
              <span key={threshold} className={index + 1 === activeTrait.trait.level ? "is-current" : ""}>
                <b>{threshold}人 {STAR_LABEL[index + 1]}</b>
                <small>{activeTrait.trait.bonuses[index]}</small>
              </span>
            ))}
          </div>
        </aside>
      )}
    </div>
  );
}

export default function RiftHud({ engine, onAction, onBattleViewAction }: Props) {
  const [sheet, setSheet] = useState<SheetName>(null);
  const [starterPage, setStarterPage] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const [battleTraitsCollapsed, setBattleTraitsCollapsed] = useState(false);
  const state = engine?.state;

  useEffect(() => {
    const query = window.matchMedia(MOBILE_VIEW_QUERY);
    const sync = () => setIsMobile(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (state?.phase === "battle") setBattleTraitsCollapsed(isMobile);
  }, [isMobile, state?.phase]);

  if (!engine || !state) return null;

  const dispatch = (action: GameAction) => onAction(action);
  const selected = state.selected
    ? (state.selected.zone === "board" ? state.board[state.selected.index] : state.bench[state.selected.index])
    : null;
  const ownedStars = (unitId: string) => countOwnedStars([...state.board, ...state.bench], unitId);
  const wave = engine.currentWave;
  const enemyTraits = enemyTraitActivations(wave.units)
    .map(({ id, level }) => `${TRAITS[id].name}${STAR_LABEL[level]}`)
    .join(" · ");
  const activeTraits = engine.getActiveTraits();
  const playerBattleTraits = (Object.keys(TRAITS) as TraitId[]).flatMap((id) => {
    const status = engine.getTraitStatus(id);
    return status.level ? [{ ...TRAITS[id], count: status.count, level: status.level }] : [];
  });
  const enemyBattleTraits = enemyTraitActivations(wave.units).map(({ id, count, level }) => ({
    ...TRAITS[id],
    count,
    level,
  }));
  const odds = tierOddsForLevel(state.playerLevel);
  const starterIndex = Math.min(starterPage, Math.max(0, state.starterChoices.length - 1));

  if (state.phase === "title") {
    return (
      <div className="rift-dom-layer rift-dom-title" style={{ fontFamily: FONT }}>
        <HudHeader state={state} />
        <div className="rift-dom-title-body">
          <section className="rift-title-copy">
            <span className="rift-eyebrow">RIFT LINE // 16 WAVE EXPEDITION</span>
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
        <HudHeader state={state} />
        <section className={`rift-dom-phase-card ${state.finalWon ? "is-win" : "is-loss"}`}>
          <span className="rift-eyebrow">RUN COMPLETE // {state.finalWon ? "RIFT SEALED" : "LINE LOST"}</span>
          <h1>{state.finalWon ? "裂隙已封闭" : "战线已失守"}</h1>
          <p>{state.finalWon ? "你守住了十六次冲击。普通无限与地狱无限已经开启。" : "这一局的答案到此为止。调整开局协议，再试一次。"}</p>
          <div className="rift-final-stats"><span>本局积分 <b>{state.score.toLocaleString()}</b></span><span>核心 <b>{state.hp}/{state.maxHp}</b></span><span>最高纪录 <b>{state.bestScore.toLocaleString()}</b></span></div>
          <ActionButton tone={state.finalWon ? "confirm" : "danger"} onClick={() => dispatch({ type: "restart" })}>重新接入 <b>↗</b></ActionButton>
        </section>
      </div>
    );
  }

  if (state.phase === "augment") return null;
  if (state.phase === "result") {
    return isMobile
      ? <MobileResult engine={engine} onAction={dispatch} />
      : null;
  }

  const battleOverlay = state.phase === "battle" && state.battle && (
    <div className="rift-dom-world-frame">
      <BattleTraitBar
        playerTraits={playerBattleTraits}
        enemyTraits={enemyBattleTraits}
        collapsed={battleTraitsCollapsed}
        onToggle={() => setBattleTraitsCollapsed((current) => !current)}
      />
      <div className="rift-dom-battle-tools" style={{ fontFamily: FONT }}>
        <div className="rift-battle-view-controls" aria-label="战场视图">
          <button type="button" onClick={() => onBattleViewAction("zoomOut")} aria-label="缩小战场" title="缩小战场">−</button>
          <button type="button" onClick={() => onBattleViewAction("reset")} aria-label="复位战场视图" title="复位战场视图">⌖</button>
          <button type="button" onClick={() => onBattleViewAction("zoomIn")} aria-label="放大战场" title="放大战场">+</button>
        </div>
        <ActionButton className="rift-ranking-button" onClick={() => dispatch({ type: "rankingToggle" })}>{state.battle.rankingOpen ? "收起统计" : "查看统计"}<span>D</span></ActionButton>
      </div>
    </div>
  );

  return (
    <div className={`rift-dom-layer rift-phase-${state.phase}`} style={{ fontFamily: FONT }}>
      <HudHeader state={state} />
      {state.phase === "preparation" && (
        <>
          <div className="rift-dom-stage">
            <aside className="rift-dom-shop-desktop">
              <div className="rift-shop-heading"><div><span className="rift-eyebrow">TACTICAL SHOP</span><strong>战术商店</strong></div><div className="rift-shop-level"><b>{bookLevelForPlayerLevel(state.playerLevel)} 本</b><small>{engine.isMaxPlayerLevel ? "MAX LEVEL" : `下本还需 ${engine.upgradeCost} 金${state.upgradeDiscountCarry ? ` · 结转 ${state.upgradeDiscountCarry}` : ""}`}</small></div></div>
              <div className="rift-shop-economy"><span>金币 <b>{state.gold}</b></span><span>结算金 <b>{engine.potentialBounty}</b></span><InterestInfo engine={engine} /><span>连胜 <b>{state.streak || "—"}</b></span></div>
              <div className="rift-tier-odds">{odds.map((chance, index) => <span key={index} className={`tier-${index + 1} ${chance ? "" : "is-muted"}`}><i>{index + 1}</i><b>{chance}%</b></span>)}</div>
              <div className="rift-shop-list">{state.shop.map((unitId, index) => <ShopCard key={`${unitId}-${index}`} unitId={unitId} engine={engine} owned={unitId ? ownedStars(unitId) : { 1: 0, 2: 0, 3: 0 }} onBuy={() => dispatch({ type: "shop", index })} />)}</div>
              <div className="rift-dom-shop-actions"><ActionButton onClick={() => dispatch({ type: "buyXp" })} disabled={engine.isMaxPlayerLevel || state.gold < (engine.upgradeCost ?? Number.POSITIVE_INFINITY)}><span>升本</span><b>{engine.isMaxPlayerLevel ? "MAX" : engine.upgradeCost}</b></ActionButton><ActionButton tone="lock" className={state.shopLocked ? "is-selected" : ""} onClick={() => dispatch({ type: "lock" })}><span>{state.shopLocked ? "已锁定" : "锁定商店"}</span><b>{state.shopLocked ? "ON" : ""}</b></ActionButton><ActionButton tone="economic" onClick={() => dispatch({ type: "reroll" })} disabled={!state.freeRerollCharges && state.gold < 1}><span>刷新</span><b>{state.freeRerollCharges ? `免费 ${state.freeRerollCharges}` : "1"}</b></ActionButton><ActionButton tone="confirm" className="rift-start-button" onClick={() => dispatch({ type: "battle" })} disabled={!engine.boardCount}><span>开始战斗</span><b>SPACE</b></ActionButton></div>
              <footer>{activeTraits.length ? <><span className="rift-status-dot" />已激活 {activeTraits.map((trait) => `${trait.name}${STAR_LABEL[trait.level]}`).join(" · ")}</> : "上阵两名同名羁绊单位，开始构筑你的第一套答案"}</footer>
            </aside>
          </div>
          <section className={`rift-mobile-brief ${wave.tag === "normal" ? "" : `is-${wave.tag}`}`}>
            <div><span className="rift-eyebrow">{wave.tag === "boss" ? "BOSS WARNING" : wave.tag === "elite" ? "ELITE WARNING" : `ROUND ${String(state.round).padStart(2, "0")} / QUICK READ`}</span><strong>{wave.name}</strong></div>
            <p>{engine.boardCount < engine.boardCap ? `还可上阵 ${engine.boardCap - engine.boardCount} 名单位。敌军 ${wave.units.length} 人，价值约 ${enemyBudgetForRound(state.round)}，本战结算 ${engine.potentialBounty} 金。` : `人口已满。敌军 ${wave.units.length} 人，价值约 ${enemyBudgetForRound(state.round)}，本战结算 ${engine.potentialBounty} 金。`} 无论胜负都会发放结算金。敌方羁绊：{enemyTraits || "未成型"}。</p>
            <button onClick={() => setSheet("traits")}>查看羁绊 <b>↗</b></button>
          </section>
          <nav className="rift-dom-mobile-actions" aria-label="移动端战术操作"><ActionButton onClick={() => setSheet("shop")}><span className="rift-mobile-action-icon">◈</span><span>商店</span><b>{state.shop.filter(Boolean).length}</b></ActionButton><ActionButton onClick={() => setSheet("bench")}><span className="rift-mobile-action-icon">▦</span><span>备战席</span><b>{state.bench.filter(Boolean).length}/{state.bench.length}</b></ActionButton><ActionButton tone="danger" onClick={() => dispatch({ type: "sell" })} disabled={!selected}><span className="rift-mobile-action-icon">¥</span><span>出售</span><b>{selected ? `+${engine.getUnitSellValue(selected)}` : "—"}</b></ActionButton><ActionButton tone="confirm" onClick={() => dispatch({ type: "battle" })} disabled={!engine.boardCount}><span>开战</span><b>SPACE</b></ActionButton></nav>
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
          {def.passiveName && def.passiveDescription && <div className="rift-detail-passive"><span>被动 · {def.passiveName}</span><p>{def.passiveDescription}</p></div>}
          <small className="rift-detail-energy">{def.energyProfile.name} · {describeEnergyRecovery(def.energyProfile)}</small>
        </div>
      )}
    </div>
  );
}

function ShopSheet({ engine, onClose, onAction }: { engine: AutoChessEngine; onClose: () => void; onAction: (action: GameAction) => void }) {
  const ownedStars = (unitId: string) => countOwnedStars([...engine.state.board, ...engine.state.bench], unitId);
  return (
    <Sheet title="战术商店" eyebrow="SHOP / 五张随机单位" className="rift-dom-sheet-shop" onClose={onClose}>
      <div className="rift-sheet-summary"><span>金币 <b>{engine.state.gold}</b></span><InterestInfo engine={engine} compact />{engine.state.upgradeDiscountCarry > 0 && <span>减费结转 <b>{engine.state.upgradeDiscountCarry}</b></span>}<span>概率 <b>{tierOddsForLevel(engine.state.playerLevel).filter(Boolean).map((chance, index) => `${index + 1}费 ${chance}%`).join(" · ")}</b></span></div>
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
        const sellValue = unit ? engine.getUnitSellValue(unit) : 0;
        return <button key={index} className={engine.state.selected?.zone === "bench" && engine.state.selected.index === index ? "selected" : ""} onClick={() => onAction({ type: "slot", location })}>{unit ? <><span className="rift-dom-bench-portrait" style={{ borderColor: UNIT_DEFS[unit.id].accent }}><UnitPortrait unitId={unit.id} size={42} /></span><b>{UNIT_DEFS[unit.id].name}</b><span className="rift-bench-stars">{STAR_LABEL[unit.star]}</span><span className={`rift-bench-value ${sellValue > 5 ? "is-high" : ""}`} aria-label={`回收价值 ${sellValue} 金币`}><i aria-hidden="true" /><b>{sellValue}</b></span></> : <><span className="rift-empty-slot">+</span><small>空位</small></>}</button>;
      })}</div>
      <div className="rift-sheet-selection">{selected ? <><span className="rift-status-dot" />已选择 <b>{UNIT_DEFS[selected.id].name}</b> · 点击棋盘目标格可换位</> : "点击一个棋子开始布阵；右键棋子可快速回收"}</div>
      <ActionButton tone="danger" disabled={!selected} onClick={() => onAction({ type: "sell" })}>出售选中棋子 <b>{selected ? `+${engine.getUnitSellValue(selected)}` : ""}</b></ActionButton>
    </Sheet>
  );
}

function InterestInfo({ engine, compact = false }: { engine: AutoChessEngine; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const financeLevel = engine.getTraitStatus("finance").level;
  const enhanced = financeLevel >= 2;
  const rule = enhanced ? `理财Ⅱ：每 4 金币提供 1 利息，最多 ${FINANCE_INTEREST_CAP} 利息（80 金币封顶）。` : "每 5 金币提供 1 利息，最多计算 20 金币（最高 4 利息）。";
  return (
    <div className={`rift-interest-info ${compact ? "is-compact" : ""} ${open ? "is-open" : ""}`} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} onFocus={() => setOpen(true)}><span>利息</span><b>+{engine.interestIncome}</b><i aria-hidden="true">i</i></button>
      <div role="tooltip"><strong>{enhanced ? "理财Ⅱ利息" : "利息规则"}</strong><span>{rule}</span><small>当前 {engine.state.gold} 金币，本回合可得 {engine.interestIncome} 利息。</small></div>
    </div>
  );
}

function TraitSheet({ engine, onClose }: { engine: AutoChessEngine; onClose: () => void }) {
  const traits = Object.entries(engine.getTraitCounts()).filter(([, count]) => count > 0).map(([id, count]) => ({ trait: TRAITS[id as keyof typeof TRAITS], count, status: engine.getTraitStatus(id as keyof typeof TRAITS) }));
  return <Sheet title="羁绊网络" eyebrow="SYNERGY / 悬浮棋子查看完整技能" onClose={onClose}><div className="rift-trait-sheet-list">{traits.length ? traits.map(({ trait, count, status }) => <div key={trait.id} className={status.active ? "is-active" : ""} style={{ "--trait-color": trait.color } as CSSProperties}><span className="rift-trait-orb">{status.active ? "✦" : "·"}</span><div><strong>{trait.name} <small>{trait.family}</small></strong><p>{count} 人 · {status.active ? trait.bonuses[status.level - 1] : `还差 ${Math.max(1, (trait.thresholds.find((threshold) => threshold > count) ?? count + 1) - count)} 人激活`}</p></div><b>{status.active ? STAR_LABEL[status.level] : "—"}</b></div>) : <p className="rift-sheet-empty">上阵单位后，羁绊会在这里展开。</p>}</div></Sheet>;
}

function MobileResult({ engine, onAction }: { engine: AutoChessEngine; onAction: (action: GameAction) => void }) {
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

function Sheet({ title, eyebrow, children, className = "", onClose }: { title: string; eyebrow: string; children: ReactNode; className?: string; onClose: () => void }) {
  return <div className="rift-dom-sheet-backdrop" role="dialog" aria-modal="true"><section className={`rift-dom-sheet ${className}`}><header><div><span className="rift-eyebrow">{eyebrow}</span><strong>{title}</strong></div><button onClick={onClose} aria-label="关闭面板">关闭 <b>×</b></button></header>{children}</section></div>;
}

function Pager({ index, total, onPrevious, onNext }: { index: number; total: number; onPrevious: () => void; onNext: () => void }) {
  return <div className="rift-dom-pager"><button onClick={onPrevious} disabled={index <= 0}>← 上一项</button><span>{total ? String(index + 1).padStart(2, "0") : "00"} / {String(total).padStart(2, "0")}</span><button onClick={onNext} disabled={index >= total - 1}>下一项 →</button></div>;
}
