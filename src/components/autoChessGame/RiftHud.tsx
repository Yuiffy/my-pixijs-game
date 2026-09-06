"use client";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import {
  AppstoreOutlined,
  BarChartOutlined,
  CaretRightOutlined,
  FastForwardOutlined,
  HistoryOutlined,
  PauseOutlined,
  ReloadOutlined,
  RobotOutlined,
  SettingOutlined,
  TeamOutlined,
  UserOutlined,
} from "@ant-design/icons";
import type { AutoChessEngine } from "./core/gameEngine";
import type { RunSaveInfo, RunSaveIssue } from "./core/engine/runSave";
import {
  STARTERS,
  TRAITS,
  UNIT_DEFS,
  bookLevelForPlayerLevel,
  enemyBudgetForRound,
  enemyTraitActivations,
  tierOddsForLevel,
} from "./core/gameData";
import type { TraitId } from "./core/gameData";
import type { OwnedUnit, RunUnitStats } from "./core/gameTypes";
import type { GameAction } from "./phaser/EngineBridge";
import {
  ActionButton,
  FONT,
  HudHeader,
  STAR_LABEL,
  StarForgeAction,
  UnitPortrait,
  countOwnedStars,
} from "./hud/shared";
import { BattleTraitBar } from "./hud/BattleTraits";
import { BattleInspector } from "./hud/BattleInspector";
import { EnemyFormationOverlay } from "./hud/EnemyFormationOverlay";
import { InterestInfo, ShopCard, ShopSheet } from "./hud/Shop";
import {
  BenchSheet,
  MobileAugments,
  MobileResult,
  Pager,
  TraitSheet,
} from "./hud/MobileSheets";

type Props = {
  engine: AutoChessEngine | null;
  savedRun: RunSaveInfo | null;
  saveIssue: RunSaveIssue;
  inspectedFighterId: string | null;
  enemyFormationOpen: boolean;
  onAction: (action: GameAction) => void;
  onBattleViewAction: (action: BattleViewAction) => void;
  onEnemyFormationOpenChange: (open: boolean) => void;
  autoplayEnabled: boolean;
  onAutoplayChange: (enabled: boolean) => void;
  onAutoplayStart: () => void;
  onSettingsOpen: () => void;
  battlePaused: boolean;
  onBattlePauseChange: (paused: boolean) => void;
};

export type BattleViewAction = "zoomOut" | "reset" | "zoomIn";
type SheetName = "shop" | "bench" | "traits" | null;
const MOBILE_VIEW_QUERY = "(max-width: 700px), (max-aspect-ratio: 25/28) and (max-width: 1200px), (pointer: coarse) and (max-width: 1200px)";

const compactStat = (value: number) => {
  const rounded = Math.round(value);
  if (rounded < 10_000) return rounded.toLocaleString();
  return `${(rounded / 1000).toFixed(rounded < 100_000 ? 1 : 0)}k`;
};

const perBattle = (stats: RunUnitStats, value: number) => value / Math.max(1, stats.battles);

function FinalRanking({
  label,
  title,
  entries,
  metric,
}: {
  label: string;
  title: string;
  entries: RunUnitStats[];
  metric: "damage" | "support" | "taken";
}) {
  return (
    <section className={`rift-final-ranking is-${metric}`}>
      <header><span>{label}</span><strong>{title}</strong></header>
      <div>
        {entries.length ? entries.map((stats, index) => {
          const unit = UNIT_DEFS[stats.unitId];
          const damage = perBattle(stats, stats.damageDealt);
          const healing = perBattle(stats, stats.healingDone);
          const shielding = perBattle(stats, stats.shieldingDone);
          const support = healing + shielding;
          const taken = perBattle(stats, stats.damageTaken);
          return (
            <article key={stats.unitId}>
              <b>{index + 1}</b>
              <span
                className="rift-final-ranking-portrait"
                style={{ background: unit.color, borderColor: unit.accent }}
              >
                <UnitPortrait unitId={stats.unitId} size={30} />
              </span>
              <div>
                <strong>{unit.name}</strong>
                <small>
                  {metric === "damage" && `${stats.battles} 战 · 场均 ${compactStat(damage)}`}
                  {metric === "support" && `治 ${compactStat(healing)} · 盾 ${compactStat(shielding)}`}
                  {metric === "taken" && `${stats.battles} 战 · 场均 ${compactStat(taken)}`}
                </small>
              </div>
              <em>{compactStat(metric === "damage" ? damage : metric === "support" ? support : taken)}</em>
            </article>
          );
        }) : <span className="rift-final-ranking-empty">本局没有记录</span>}
      </div>
    </section>
  );
}

export default function RiftHud({
  engine,
  savedRun,
  saveIssue,
  inspectedFighterId,
  enemyFormationOpen,
  onAction,
  onBattleViewAction,
  onEnemyFormationOpenChange,
  autoplayEnabled,
  onAutoplayChange,
  onAutoplayStart,
  onSettingsOpen,
  battlePaused,
  onBattlePauseChange,
}: Props) {
  const [sheet, setSheet] = useState<SheetName>(null);
  const [starterPage, setStarterPage] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const [battleTraitsCollapsed, setBattleTraitsCollapsed] = useState(false);
  const [gameUrl, setGameUrl] = useState("");
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

  useEffect(() => {
    setGameUrl(`${window.location.origin}${window.location.pathname}`);
  }, []);

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
            {savedRun && (
              <div className="rift-resume-run">
                <div><strong>未完成的远征</strong><span>第 {savedRun.round} 战 · 核心 {savedRun.hp} · {({ preparation: "整备", result: "结算", augment: "天赋选择", battle: "待重新开战" })[savedRun.phase]}</span></div>
                <ActionButton tone="confirm" onClick={() => dispatch({ type: "resume" })}><HistoryOutlined aria-hidden="true" />继续远征</ActionButton>
              </div>
            )}
            {saveIssue && <p className="rift-save-issue" role="status">{saveIssue === "incompatible" ? "已有存档与当前版本不兼容" : saveIssue === "invalid" ? "已有存档未通过完整性校验" : "浏览器存储不可用，本局暂未保存"}</p>}
            <div className="rift-play-mode-block">
              <span>01 / 游玩方式</span>
              <div className="rift-play-mode" role="group" aria-label="游玩方式">
                <button type="button" aria-pressed={!autoplayEnabled} onClick={() => onAutoplayChange(false)}><UserOutlined aria-hidden="true" /><span><strong>亲自指挥</strong><small>单人游玩</small></span></button>
                <button type="button" aria-pressed={autoplayEnabled} onClick={() => onAutoplayChange(true)}><RobotOutlined aria-hidden="true" /><span><strong>AI 观战</strong><small>全程托管</small></span></button>
              </div>
            </div>
            <div className="rift-section-heading"><span>02 / {savedRun ? "另启远征" : "接入协议"}</span><strong>{autoplayEnabled ? "为 AI 指定开局优势" : "选择你的第一笔优势"}</strong><small>协议会带来一名初始单位，并改变整局经济或战斗节奏。</small></div>
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
    const finalLineup = state.board.filter((unit): unit is OwnedUnit => Boolean(unit));
    const finalStats = Object.values(state.runStats)
      .filter((stats): stats is RunUnitStats => Boolean(stats));
    const top = (
      valueFor: (stats: RunUnitStats) => number,
    ) => [...finalStats]
      .filter((stats) => valueFor(stats) > 0)
      .sort((left, right) => valueFor(right) - valueFor(left) || left.unitId.localeCompare(right.unitId))
      .slice(0, 3);
    const damageTop = top((stats) => perBattle(stats, stats.damageDealt));
    const supportTop = top((stats) => perBattle(stats, stats.healingDone + stats.shieldingDone));
    const takenTop = top((stats) => perBattle(stats, stats.damageTaken));
    return (
      <div className="rift-dom-layer rift-dom-modal-phase" style={{ fontFamily: FONT }}>
        <HudHeader state={state} />
        <section className={`rift-dom-phase-card rift-final-report ${state.finalWon ? "is-win" : "is-loss"}`}>
          <header className="rift-final-heading">
            <div>
              <span className="rift-eyebrow">RUN COMPLETE // {state.finalWon ? "RIFT SEALED" : "LINE LOST"}</span>
              <h1>{state.finalWon ? "裂隙已封闭" : "战线已失守"}</h1>
              <p>{state.finalWon ? "远征完成，下面是本次战术档案。" : "阵线倒下了，但这套阵容留下了完整战术档案。"}</p>
            </div>
            <div className="rift-final-stats">
              <span>到达战线 <b>第 {state.round} 战</b></span>
              <span>本局积分 <b>{state.score.toLocaleString()}</b></span>
              <span>本局战绩 <b>{state.victories} 胜 / {Math.max(0, state.round - state.victories)} 负</b></span>
            </div>
          </header>

          <div className="rift-final-build">
            <section className="rift-final-lineup">
              <header><span>FINAL LINEUP</span><strong>最终阵容 · {finalLineup.length} 人</strong></header>
              <div>
                {finalLineup.map((owned) => {
                  const unit = UNIT_DEFS[owned.id];
                  return (
                    <article key={owned.uid} style={{ "--unit-accent": unit.accent, "--unit-color": unit.color } as CSSProperties}>
                      <span><UnitPortrait unitId={owned.id} size={38} /></span>
                      <strong>{unit.name}</strong>
                      <small>{owned.star} 星</small>
                    </article>
                  );
                })}
              </div>
            </section>
            <section className="rift-final-traits">
              <header><span>ACTIVE SYNERGY</span><strong>最终羁绊 · {activeTraits.length} 组</strong></header>
              <div>
                {activeTraits.length
                  ? activeTraits.map((trait) => (
                    <span key={trait.id} style={{ "--trait-color": trait.color } as CSSProperties}>
                      <b>{trait.name}{STAR_LABEL[trait.level]}</b><small>{trait.count} 人</small>
                    </span>
                  ))
                  : <em>未激活羁绊</em>}
              </div>
            </section>
          </div>

          <div className="rift-final-leaderboards">
            <FinalRanking label="DAMAGE TOP 3" title="场均输出" entries={damageTop} metric="damage" />
            <FinalRanking label="SUPPORT TOP 3" title="场均治疗 / 护盾" entries={supportTop} metric="support" />
            <FinalRanking label="DAMAGE TAKEN TOP 3" title="场均承伤" entries={takenTop} metric="taken" />
          </div>

          <footer className="rift-final-footer">
            <div><span>维阿自走棋 · 裂隙阵线</span><a href={gameUrl || undefined} target="_blank" rel="noreferrer">{gameUrl || "正在读取当前网址..."}</a></div>
            <ActionButton tone={state.finalWon ? "confirm" : "danger"} onClick={() => dispatch({ type: "restart" })}><ReloadOutlined aria-hidden="true" />再来一局</ActionButton>
          </footer>
        </section>
      </div>
    );
  }

  if (state.phase === "augment") return isMobile ? <MobileAugments engine={engine} onAction={dispatch} /> : null;
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
        <button
          type="button"
          className={`rift-pause-battle-button ${battlePaused ? "is-paused" : ""}`}
          aria-label={battlePaused ? "继续战斗" : "暂停战斗"}
          aria-pressed={battlePaused}
          aria-keyshortcuts="P"
          title={battlePaused ? "继续战斗 (P)" : "暂停战斗 (P)"}
          onClick={() => onBattlePauseChange(!battlePaused)}
        >
          {battlePaused ? <CaretRightOutlined aria-hidden="true" /> : <PauseOutlined aria-hidden="true" />}
        </button>
        <ActionButton className="rift-skip-battle-button" aria-label="快速结算当前战斗" aria-keyshortcuts="S" onClick={() => dispatch({ type: "skipBattle" })} title="快速结算当前战斗 (S)"><FastForwardOutlined aria-hidden="true" /><span className="rift-battle-tool-copy">快速结算</span><kbd>S</kbd></ActionButton>
        <ActionButton className="rift-ranking-button" aria-label={state.battle.rankingOpen ? "收起统计" : "查看统计"} aria-expanded={state.battle.rankingOpen} aria-keyshortcuts="D" onClick={() => dispatch({ type: "rankingToggle" })} title={state.battle.rankingOpen ? "收起统计 (D)" : "查看统计 (D)"}><BarChartOutlined aria-hidden="true" /><span className="rift-battle-tool-copy">{state.battle.rankingOpen ? "收起统计" : "查看统计"}</span><kbd>D</kbd></ActionButton>
      </div>
      {battlePaused && !inspectedFighterId && (
        <div className="rift-battle-paused-status" role="status" aria-live="polite">
          <PauseOutlined aria-hidden="true" />
          <strong>战斗已暂停</strong>
        </div>
      )}
    </div>
  );

  return (
    <div className={`rift-dom-layer rift-phase-${state.phase}`} style={{ fontFamily: FONT }}>
      <HudHeader state={state} />
      {state.phase === "preparation" && (
        <>
          <div className="rift-dom-stage">
            <aside className="rift-dom-shop-desktop">
              <div className="rift-shop-heading"><div><span className="rift-eyebrow">TACTICAL SHOP</span><strong>战术商店</strong></div><button className="rift-trait-planner-trigger" type="button" aria-label="阵容羁绊" title="阵容羁绊" onClick={() => setSheet("traits")}><TeamOutlined /></button><div className="rift-shop-level"><b>{bookLevelForPlayerLevel(state.playerLevel)} 本</b><small>{engine.isMaxPlayerLevel ? engine.isStarForgeUnlocked ? "升星工坊已接入" : "满本 · 可解锁工坊" : `下本还需 ${engine.upgradeCost} 金${state.upgradeDiscountCarry ? ` · 结转 ${state.upgradeDiscountCarry}` : ""}`}</small></div></div>
              <div className="rift-shop-economy"><span>金币 <b>{state.gold}</b></span><span>结算金 <b>{engine.potentialBounty}</b></span><InterestInfo engine={engine} /><span>连胜 <b>{state.streak || "—"}</b></span></div>
              <div className="rift-tier-odds">{odds.map((chance, index) => <span key={index} className={`tier-${index + 1} ${chance ? "" : "is-muted"}`}><i>{index + 1}</i><b>{chance}%</b></span>)}</div>
              <div className="rift-shop-list">{state.shop.map((unitId, index) => <ShopCard key={`${unitId}-${index}`} unitId={unitId} engine={engine} owned={unitId ? ownedStars(unitId) : { 1: 0, 2: 0, 3: 0 }} onBuy={() => dispatch({ type: "shop", index })} />)}</div>
              <div className="rift-dom-shop-actions"><StarForgeAction engine={engine} selected={selected} onAction={dispatch} /><ActionButton tone="lock" className={state.shopLocked ? "is-selected" : ""} onClick={() => dispatch({ type: "lock" })}><span>{state.shopLocked ? "已锁定" : "锁定商店"}</span><b>{state.shopLocked ? "ON" : ""}</b></ActionButton><ActionButton tone="economic" onClick={() => dispatch({ type: "reroll" })} disabled={!state.freeRerollCharges && state.gold < 1}><span>刷新</span><b>{state.freeRerollCharges ? `免费 ${state.freeRerollCharges}` : "1"}</b></ActionButton><ActionButton className="rift-auto-arrange-button" aria-label="推荐站位" aria-keyshortcuts="A" title="推荐站位 (A)" onClick={() => dispatch({ type: "autoArrange" })} disabled={!engine.boardCount}><AppstoreOutlined aria-hidden="true" /><span>推荐站位</span><b>A</b></ActionButton><ActionButton tone="confirm" className="rift-start-button" onClick={() => dispatch({ type: "battle" })} disabled={!engine.boardCount}><span>开始战斗</span><b>SPACE</b></ActionButton></div>
              <footer>{activeTraits.length ? <><span className="rift-status-dot" />已激活 {activeTraits.map((trait) => `${trait.name}${STAR_LABEL[trait.level]}`).join(" · ")}</> : "上阵两名同名羁绊单位，开始构筑你的第一套答案"}</footer>
            </aside>
          </div>
          <section className={`rift-mobile-brief ${wave.tag === "normal" ? "" : `is-${wave.tag}`}`}>
            <div><span className="rift-eyebrow">{wave.tag === "boss" ? "BOSS WARNING" : wave.tag === "elite" ? "ELITE WARNING" : `ROUND ${String(state.round).padStart(2, "0")} / QUICK READ`}</span><strong>{wave.name}</strong></div>
            <p>{engine.boardCount < engine.boardCap ? `还可上阵 ${engine.boardCap - engine.boardCount} 名单位。敌军 ${wave.units.length} 人，价值约 ${enemyBudgetForRound(state.round)}，本战结算 ${engine.potentialBounty} 金。` : `人口已满。敌军 ${wave.units.length} 人，价值约 ${enemyBudgetForRound(state.round)}，本战结算 ${engine.potentialBounty} 金。`} 无论胜负都会发放结算金。敌方羁绊：{enemyTraits || "未成型"}。</p>
            <button onClick={() => setSheet("traits")}>查看羁绊 <b>↗</b></button>
          </section>
          <nav className="rift-dom-mobile-actions" aria-label="移动端战术操作"><ActionButton onClick={() => setSheet("shop")}><span className="rift-mobile-action-icon">◈</span><span>商店</span><b>{state.shop.filter(Boolean).length}</b></ActionButton><ActionButton onClick={() => setSheet("bench")}><span className="rift-mobile-action-icon">▦</span><span>备战席</span><b>{state.bench.filter(Boolean).length}/{state.bench.length}</b></ActionButton><ActionButton className="rift-auto-arrange-button" aria-label="推荐站位" aria-keyshortcuts="A" title="推荐站位 (A)" onClick={() => dispatch({ type: "autoArrange" })} disabled={!engine.boardCount}><AppstoreOutlined className="rift-mobile-action-icon" aria-hidden="true" /><span>推荐站位</span><b>A</b></ActionButton><ActionButton tone="danger" onClick={() => dispatch({ type: "sell" })} disabled={!selected}><span className="rift-mobile-action-icon">¥</span><span>出售</span><b>{selected ? `+${engine.getUnitSellValue(selected)}` : "—"}</b></ActionButton><ActionButton tone="confirm" onClick={() => dispatch({ type: "battle" })} disabled={!engine.boardCount}><span>开战</span><b>SPACE</b></ActionButton></nav>
        </>
      )}
      {battleOverlay}
      {state.phase === "battle" && inspectedFighterId && <BattleInspector engine={engine} fid={inspectedFighterId} onSelect={fid => dispatch({ type: "inspectFighter", fid })} />}
      <div className="rift-mobile-session-controls" aria-label="对局控制">
        <button type="button" aria-pressed={autoplayEnabled} onClick={() => onAutoplayChange(!autoplayEnabled)} title={autoplayEnabled ? "关闭托管并接管" : "开启 AI 托管"}><RobotOutlined aria-hidden="true" /><span>{autoplayEnabled ? "接管" : "托管"}</span></button>
        <button type="button" aria-label="游戏设置" onClick={onSettingsOpen} title="游戏设置"><SettingOutlined aria-hidden="true" /></button>
      </div>
      {saveIssue === "unavailable" && <div className="rift-save-warning" role="status">本局自动保存失败</div>}
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
