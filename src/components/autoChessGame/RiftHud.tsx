"use client";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import {
  FastForwardOutlined,
  RobotOutlined,
  SettingOutlined,
  UserOutlined,
} from "@ant-design/icons";
import type { AutoChessEngine } from "./core/gameEngine";
import {
  STARTERS,
  TRAITS,
  bookLevelForPlayerLevel,
  enemyBudgetForRound,
  enemyTraitActivations,
  tierOddsForLevel,
} from "./core/gameData";
import type { TraitId } from "./core/gameData";
import type { GameAction } from "./phaser/EngineBridge";
import {
  ActionButton,
  FONT,
  HudHeader,
  STAR_LABEL,
  UnitPortrait,
  countOwnedStars,
} from "./hud/shared";
import { BattleTraitBar } from "./hud/BattleTraits";
import { EnemyFormationOverlay } from "./hud/EnemyFormationOverlay";
import { InterestInfo, ShopCard, ShopSheet } from "./hud/Shop";
import {
  BenchSheet,
  MobileResult,
  Pager,
  TraitSheet,
} from "./hud/MobileSheets";

type Props = {
  engine: AutoChessEngine | null;
  enemyFormationOpen: boolean;
  onAction: (action: GameAction) => void;
  onBattleViewAction: (action: BattleViewAction) => void;
  onEnemyFormationOpenChange: (open: boolean) => void;
  autoplayEnabled: boolean;
  onAutoplayChange: (enabled: boolean) => void;
  onAutoplayStart: () => void;
  onSettingsOpen: () => void;
};

export type BattleViewAction = "zoomOut" | "reset" | "zoomIn";
type SheetName = "shop" | "bench" | "traits" | null;
const MOBILE_VIEW_QUERY = "(max-width: 700px), (pointer: coarse) and (max-width: 1200px)";

export default function RiftHud({
  engine,
  enemyFormationOpen,
  onAction,
  onBattleViewAction,
  onEnemyFormationOpenChange,
  autoplayEnabled,
  onAutoplayChange,
  onAutoplayStart,
  onSettingsOpen,
}: Props) {
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

  useEffect(() => {
    if (enemyFormationOpen) setSheet(null);
  }, [enemyFormationOpen]);

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
            <div className="rift-play-mode-block">
              <span>01 / 游玩方式</span>
              <div className="rift-play-mode" role="group" aria-label="游玩方式">
                <button type="button" aria-pressed={!autoplayEnabled} onClick={() => onAutoplayChange(false)}><UserOutlined aria-hidden="true" /><span><strong>亲自指挥</strong><small>单人游玩</small></span></button>
                <button type="button" aria-pressed={autoplayEnabled} onClick={() => onAutoplayChange(true)}><RobotOutlined aria-hidden="true" /><span><strong>AI 观战</strong><small>全程托管</small></span></button>
              </div>
            </div>
            <div className="rift-section-heading"><span>02 / 接入协议</span><strong>{autoplayEnabled ? "为 AI 指定开局优势" : "选择你的第一笔优势"}</strong><small>协议会带来一名初始单位，并改变整局经济或战斗节奏。</small></div>
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
                    <em>{autoplayEnabled ? "选定并开始观战" : "接入协议"} <b>↗</b></em>
                  </button>
                );
              })}
            </div>
            {isMobile && <Pager index={starterIndex} total={state.starterChoices.length} onPrevious={() => setStarterPage(Math.max(0, starterIndex - 1))} onNext={() => setStarterPage(Math.min(state.starterChoices.length - 1, starterIndex + 1))} />}
            {autoplayEnabled && <ActionButton className="rift-ai-start" tone="confirm" onClick={onAutoplayStart}><RobotOutlined aria-hidden="true" />由 AI 自选协议并开局</ActionButton>}
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
        <ActionButton className="rift-skip-battle-button" onClick={() => dispatch({ type: "skipBattle" })} title="快速结算当前战斗"><FastForwardOutlined aria-hidden="true" />快速结算<span>S</span></ActionButton>
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
      <div className="rift-mobile-session-controls" aria-label="对局控制">
        <button type="button" aria-pressed={autoplayEnabled} onClick={() => onAutoplayChange(!autoplayEnabled)} title={autoplayEnabled ? "关闭托管并接管" : "开启 AI 托管"}><RobotOutlined aria-hidden="true" /><span>{autoplayEnabled ? "接管" : "托管"}</span></button>
        <button type="button" aria-label="游戏设置" onClick={onSettingsOpen} title="游戏设置"><SettingOutlined aria-hidden="true" /></button>
      </div>
      {enemyFormationOpen && state.phase === "preparation" && (
        <EnemyFormationOverlay
          engine={engine}
          onClose={() => onEnemyFormationOpenChange(false)}
        />
      )}
      {sheet === "shop" && <ShopSheet engine={engine} onClose={() => setSheet(null)} onAction={dispatch} />}
      {sheet === "bench" && <BenchSheet engine={engine} selected={selected} onClose={() => setSheet(null)} onAction={dispatch} />}
      {sheet === "traits" && <TraitSheet engine={engine} onClose={() => setSheet(null)} />}
    </div>
  );
}
