import { useState } from "react";
import type { CSSProperties } from "react";
import type { AutoChessEngine } from "../core/gameEngine";
import {
  FINANCE_INTEREST_CAP,
  TRAITS,
  UNIT_DEFS,
  describeAbilityStarGrowth,
  describeEnergyRecovery,
  tierOddsForLevel,
} from "../core/gameData";
import type { GameAction } from "../phaser/EngineBridge";
import {
  ActionButton,
  StarForgeAction,
  UnitPortrait,
  countOwnedStars,
  ownedLabel,
  type OwnedStars,
} from "./shared";
import { Sheet } from "./MobileSheets";

export function ShopCard({ unitId, engine, owned, onBuy }: { unitId: string | null; engine: AutoChessEngine; owned: OwnedStars; onBuy: () => void }) {
  const [showDetail, setShowDetail] = useState(false);
  if (!unitId) return <div className="rift-dom-shop-card empty">已征募</div>;
  const def = UNIT_DEFS[unitId as keyof typeof UNIT_DEFS];
  const totalOwned = owned[1] + owned[2] + owned[3];
  const canStore = engine.canStoreUnit(def.id);
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
        <div className={`rift-dom-portrait ${def.portraitStyle === "sprite" ? "is-sprite" : ""}`} style={{ borderColor: def.accent, backgroundColor: def.color }}><UnitPortrait unitId={unitId as keyof typeof UNIT_DEFS} size={def.portraitStyle === "sprite" ? 50 : 42} /></div>
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

export function ShopSheet({ engine, onClose, onAction }: { engine: AutoChessEngine; onClose: () => void; onAction: (action: GameAction) => void }) {
  const ownedStars = (unitId: string) => countOwnedStars([...engine.state.board, ...engine.state.bench], unitId);
  const selected = engine.state.selected
    ? (engine.state.selected.zone === "board"
        ? engine.state.board[engine.state.selected.index]
        : engine.state.bench[engine.state.selected.index])
    : null;
  return (
    <Sheet title="战术商店" eyebrow="SHOP / 五张随机单位" className="rift-dom-sheet-shop" onClose={onClose}>
      <div className="rift-sheet-summary"><span>金币 <b>{engine.state.gold}</b></span><InterestInfo engine={engine} compact />{engine.state.upgradeDiscountCarry > 0 && <span>减费结转 <b>{engine.state.upgradeDiscountCarry}</b></span>}<span>概率 <b>{tierOddsForLevel(engine.state.playerLevel).filter(Boolean).map((chance, index) => `${index + 1}费 ${chance}%`).join(" · ")}</b></span></div>
      <div className="rift-sheet-shop-list">{engine.state.shop.map((unitId, index) => <ShopCard key={`${unitId}-${index}`} unitId={unitId} engine={engine} owned={unitId ? ownedStars(unitId) : { 1: 0, 2: 0, 3: 0 }} onBuy={() => onAction({ type: "shop", index })} />)}</div>
      <div className="rift-dom-sheet-grid"><StarForgeAction engine={engine} selected={selected} onAction={onAction} /><ActionButton tone="lock" className={engine.state.shopLocked ? "is-selected" : ""} onClick={() => onAction({ type: "lock" })}>{engine.state.shopLocked ? "已锁定" : "锁定商店"}</ActionButton><ActionButton tone="economic" onClick={() => onAction({ type: "reroll" })} disabled={!engine.state.freeRerollCharges && engine.state.gold < 1}>刷新 · {engine.state.freeRerollCharges ? `免费 ${engine.state.freeRerollCharges}` : 1}</ActionButton></div>
    </Sheet>
  );
}

export function InterestInfo({ engine, compact = false }: { engine: AutoChessEngine; compact?: boolean }) {
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
