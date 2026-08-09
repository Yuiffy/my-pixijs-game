import { useState } from "react";
import type { ReactNode } from "react";
import type { AutoChessEngine } from "../core/gameEngine";
import {
  CAMPAIGN_ROUNDS,
  NORMAL_ENDLESS_END_ROUND,
  UNIT_DEFS,
  progressionModeForRound,
} from "../core/gameData";
import type { OwnedUnit } from "../core/gameTypes";
import type { GameAction } from "../phaser/EngineBridge";
import { AUTOCHESS_VERSION } from "../version";

export const FONT = '"Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", "Noto Sans SC", sans-serif';
export const STAR_LABEL = ["", "Ⅰ", "Ⅱ", "Ⅲ"];

type Tone = "neutral" | "confirm" | "economic" | "danger" | "lock" | "forge";
export type OwnedStars = Record<1 | 2 | 3, number>;

export function countOwnedStars(units: readonly (OwnedUnit | null | undefined)[], unitId: string): OwnedStars {
  const stars: OwnedStars = { 1: 0, 2: 0, 3: 0 };
  units.forEach((unit) => {
    if (unit?.id === unitId) stars[unit.star] += 1;
  });
  return stars;
}

export function ownedLabel(stars: OwnedStars) {
  const total = stars[1] + stars[2] + stars[3];
  if (!total) return "";
  const starEntries = ([3, 2, 1] as const).filter((star) => stars[star] > 0).map((star) => `${star}星×${stars[star]}`);
  return starEntries.length === 1 && stars[1] === total ? `已有 ×${total}` : `已有 ${starEntries.join(" ")}`;
}

export function UnitPortrait({ unitId, size = 42 }: { unitId: keyof typeof UNIT_DEFS; size?: number }) {
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

export function ActionButton({ tone = "neutral", className = "", children, ...props }: { tone?: Tone; className?: string; children: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={`rift-action rift-action-${tone} ${className}`} {...props}>{children}</button>;
}

export function StarForgeAction({
  engine,
  selected,
  onAction,
  className = "",
}: {
  engine: AutoChessEngine;
  selected: OwnedUnit | null;
  onAction: (action: GameAction) => void;
  className?: string;
}) {
  if (!engine.isMaxPlayerLevel) {
    const cost = engine.upgradeCost ?? Number.POSITIVE_INFINITY;
    return (
      <ActionButton
        className={className}
        onClick={() => onAction({ type: "buyXp" })}
        disabled={engine.state.gold < cost}
      >
        <span>升本</span><b>{engine.upgradeCost}</b>
      </ActionButton>
    );
  }

  const upgradeCost = selected
    ? engine.getStarForgeUpgradeCost(selected)
    : null;
  const locked = !engine.isStarForgeUnlocked;
  const disabled = locked
    ? engine.state.gold < engine.starForgeUnlockCost
    : upgradeCost !== null && engine.state.gold < upgradeCost;
  const label = locked
    ? "解锁工坊"
    : selected
      ? upgradeCost !== null
        ? `直升 ${selected.star + 1} 星`
        : "已经三星"
      : "拖棋升星";
  const detail = locked
    ? engine.starForgeUnlockCost
    : selected
      ? upgradeCost ?? "不可直升"
      : "选择棋子";

  return (
    <ActionButton
      tone="forge"
      className={`rift-star-forge ${engine.isStarForgeUnlocked ? "is-unlocked" : "is-locked"} ${className}`}
      data-star-forge-dropzone={engine.isStarForgeUnlocked ? "true" : undefined}
      onClick={() => onAction({ type: "starForge" })}
      disabled={disabled}
      title={locked
        ? `花 ${engine.starForgeUnlockCost} 金币解锁升星工坊`
        : "把一星或二星棋子拖到这里，或选中棋子后点击直升"}
    >
      <span>{label}</span><b>{detail}</b>
    </ActionButton>
  );
}

export function HudHeader({ state }: { state: NonNullable<AutoChessEngine["state"]> }) {
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
          <div className="rift-brand-title"><strong>裂隙阵线</strong><span>v{AUTOCHESS_VERSION}</span></div>
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
      {state.phase === "title" || state.phase === "gameover" ? (
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
