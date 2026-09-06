import { useId, useState } from "react";
import type { CSSProperties } from "react";
import { InfoCircleOutlined } from "@ant-design/icons";
import type { AutoChessEngine } from "../core/gameEngine";
import { resolveUnitPortrait, useCharacterStyle } from "../core/characterStyle";
import { previewTraitAddition } from "../core/rosterPlanning";
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

type ShopCardProps = {
  unitId: string | null;
  engine: AutoChessEngine;
  owned: OwnedStars;
  onBuy: () => void;
  detailDisclosure?: {
    expanded: boolean;
    onToggle: () => void;
  };
};

export function ShopCard({ unitId, engine, owned, onBuy, detailDisclosure }: ShopCardProps) {
  const [showDesktopDetail, setShowDesktopDetail] = useState(false);
  const detailId = useId();
  const characterStyle = useCharacterStyle();
  if (!unitId) return <div className="rift-dom-shop-card empty">已征募</div>;
  const def = UNIT_DEFS[unitId as keyof typeof UNIT_DEFS];
  const portrait = resolveUnitPortrait(def.id, characterStyle);
  const totalOwned = owned[1] + owned[2] + owned[3];
  const canStore = engine.canStoreUnit(def.id);
  const affordable = engine.state.gold >= def.cost && canStore;
  const role = def.title.split(" · ").at(-1) || def.title;
  const abilityGrowth = describeAbilityStarGrowth(def);
  const showDetail = detailDisclosure ? detailDisclosure.expanded : showDesktopDetail;
  const traitPreview = previewTraitAddition(engine.state.board, def.id, engine.boardCap);
  const traitTags = def.traits.map((id) => {
    const trait = TRAITS[id];
    const status = engine.getTraitStatus(id);
    const preview = traitPreview.find(entry => entry.id === id)!;
    const willActivate = Boolean(
      affordable
      && preview.advances,
    );
    return { id, trait, status, willActivate };
  });
  const orderedTraits = [...traitTags].sort((left, right) => Number(right.willActivate) - Number(left.willActivate)
    || Number(right.status.active) - Number(left.status.active));
  const extraTraits = orderedTraits.slice(2);
  return (
    <div
      className={`rift-shop-card-wrap ${detailDisclosure ? "is-inspectable" : ""} ${showDetail ? "is-detail-open" : ""}`}
      onMouseEnter={detailDisclosure ? undefined : () => setShowDesktopDetail(true)}
      onMouseLeave={detailDisclosure ? undefined : () => setShowDesktopDetail(false)}
    >
      <button
        type="button"
        className={`rift-dom-shop-card ${totalOwned > 0 ? "has-owned" : ""} ${affordable ? "" : "disabled"} tier-card-${def.tier}`}
        onClick={onBuy}
        onFocus={detailDisclosure ? undefined : () => setShowDesktopDetail(true)}
        onBlur={detailDisclosure ? undefined : () => setShowDesktopDetail(false)}
        disabled={!affordable}
        aria-label={`购买${def.name}，${def.cost}金币，${def.abilityName}`}
        aria-describedby={!detailDisclosure && showDetail ? detailId : undefined}
      >
        <div className="rift-shop-card-accent" />
        <div className={`rift-dom-portrait ${portrait.portraitStyle === "sprite" ? "is-sprite" : ""}`} style={{ borderColor: def.accent, backgroundColor: def.color }}><UnitPortrait unitId={unitId as keyof typeof UNIT_DEFS} size={portrait.portraitStyle === "sprite" ? 60 : 46} /></div>
        <div className="rift-dom-shop-copy"><strong>{def.name}</strong><span>{role} · {def.abilityName}</span><div>{orderedTraits.slice(0, 2).map(({ id, trait, status, willActivate }) => <i key={id} className={`rift-trait-tag ${status.active ? "is-active" : ""} ${willActivate ? "is-next" : ""}`} style={{ "--tag-color": trait.color } as CSSProperties} title={willActivate ? `上阵后可提升${trait.name}羁绊` : trait.description}>{trait.name}</i>)}{extraTraits.length > 0 && <em title={extraTraits.map(({ trait }) => trait.name).join("、")} aria-label={`其他羁绊：${extraTraits.map(({ trait }) => trait.name).join("、")}`}>+{extraTraits.length}</em>}</div></div>
        <div className="rift-shop-card-meta">{totalOwned > 0 && <small className="rift-shop-owned">{ownedLabel(owned)}</small>}<b className="rift-dom-cost">{def.cost}</b></div>
      </button>
      {detailDisclosure && (
        <button
          type="button"
          className="rift-shop-card-info"
          aria-label={`${showDetail ? "收起" : "查看"}${def.name}详情`}
          aria-controls={detailId}
          aria-expanded={showDetail}
          title={`${showDetail ? "收起" : "查看"}${def.name}详情`}
          onClick={detailDisclosure.onToggle}
        >
          <InfoCircleOutlined aria-hidden="true" />
        </button>
      )}
      {showDetail && (
        <div id={detailId} className="rift-shop-card-detail" role={detailDisclosure ? "region" : "tooltip"} aria-label={detailDisclosure ? `${def.name}详情` : undefined}>
          <div className="rift-detail-head"><span className="rift-eyebrow">UNIT BRIEF / TIER {def.tier}</span><strong>{def.name}</strong><small>{def.title}</small></div>
          <div className="rift-detail-tags">{traitTags.map(({ id, trait, status, willActivate }) => <i key={id} className={`rift-trait-tag ${status.active ? "is-active" : ""} ${willActivate ? "is-next" : ""}`} style={{ "--tag-color": trait.color } as CSSProperties}>{trait.name}</i>)}</div>
          {traitPreview.filter(entry => entry.advances).map(entry => <p className="rift-trait-preview" key={entry.id}>{entry.deploysImmediately ? "购买并上阵" : "待上阵，需调整人口或站位"}：{TRAITS[entry.id].name} {entry.count} → {entry.nextCount} 人 · {entry.level} → {entry.nextLevel} 档</p>)}
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
  const [detailIndex, setDetailIndex] = useState<number | null>(null);
  const ownedStars = (unitId: string) => countOwnedStars([...engine.state.board, ...engine.state.bench], unitId);
  const selected = engine.state.selected
    ? (engine.state.selected.zone === "board"
        ? engine.state.board[engine.state.selected.index]
        : engine.state.bench[engine.state.selected.index])
    : null;
  const dispatch = (action: GameAction) => {
    if (action.type === "shop" || action.type === "reroll") setDetailIndex(null);
    onAction(action);
  };
  return (
    <Sheet title="战术商店" eyebrow="SHOP / 五张随机单位" className="rift-dom-sheet-shop" onClose={onClose}>
      <div className="rift-sheet-summary"><span>金币 <b>{engine.state.gold}</b></span><InterestInfo engine={engine} compact />{engine.state.upgradeDiscountCarry > 0 && <span>减费结转 <b>{engine.state.upgradeDiscountCarry}</b></span>}<span>概率 <b>{tierOddsForLevel(engine.state.playerLevel).filter(Boolean).map((chance, index) => `${index + 1}费 ${chance}%`).join(" · ")}</b></span></div>
      <div className="rift-sheet-shop-list">{engine.state.shop.map((unitId, index) => <ShopCard key={`${unitId}-${index}`} unitId={unitId} engine={engine} owned={unitId ? ownedStars(unitId) : { 1: 0, 2: 0, 3: 0 }} onBuy={() => dispatch({ type: "shop", index })} detailDisclosure={{ expanded: detailIndex === index, onToggle: () => setDetailIndex((current) => (current === index ? null : index)) }} />)}</div>
      <div className="rift-dom-sheet-grid"><StarForgeAction engine={engine} selected={selected} onAction={dispatch} /><ActionButton tone="lock" className={engine.state.shopLocked ? "is-selected" : ""} onClick={() => dispatch({ type: "lock" })}>{engine.state.shopLocked ? "已锁定" : "锁定商店"}</ActionButton><ActionButton tone="economic" onClick={() => dispatch({ type: "reroll" })} disabled={!engine.state.freeRerollCharges && engine.state.gold < 1}>刷新 · {engine.state.freeRerollCharges ? `免费 ${engine.state.freeRerollCharges}` : 1}</ActionButton></div>
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
