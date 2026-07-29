import { useEffect, useRef, useState } from "react";
import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import { TRAITS, type TraitId } from "../core/gameData";
import type { Team } from "../core/gameTypes";
import { STAR_LABEL } from "./shared";

export type BattleTraitInfo = (typeof TRAITS)[TraitId] & {
  count: number;
  level: number;
};

function useHorizontalTraitScroll(onDragStart: () => void) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startScrollLeft: number;
    moved: boolean;
  } | null>(null);
  const suppressClickRef = useRef(false);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onWheel = (event: WheelEvent) => {
      if (container.scrollWidth <= container.clientWidth) return;
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      if (!delta) return;
      container.scrollLeft += delta * 0.35;
      event.preventDefault();
    };
    container.addEventListener("wheel", onWheel, { passive: false });
    return () => container.removeEventListener("wheel", onWheel);
  }, []);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const container = event.currentTarget;
    if (event.pointerType === "touch" || event.button !== 0 || container.scrollWidth <= container.clientWidth) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startScrollLeft: container.scrollLeft,
      moved: false,
    };
    suppressClickRef.current = false;
    container.setPointerCapture(event.pointerId);
    onDragStart();
    event.preventDefault();
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const distance = event.clientX - drag.startX;
    if (Math.abs(distance) > 6) {
      if (!drag.moved) setDragging(true);
      drag.moved = true;
      suppressClickRef.current = true;
    }
    if (!drag.moved) return;
    event.currentTarget.scrollLeft = drag.startScrollLeft - distance;
    event.preventDefault();
  };

  const finishDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
    setDragging(false);
    if (drag.moved) window.setTimeout(() => { suppressClickRef.current = false; }, 0);
  };

  const onClickCapture = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!suppressClickRef.current) return;
    suppressClickRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  };

  return {
    containerRef,
    dragging,
    scrollHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: finishDrag,
      onPointerCancel: finishDrag,
      onClickCapture,
    },
  };
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
  const { containerRef, dragging, scrollHandlers } = useHorizontalTraitScroll(onDeactivate);

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
        <div
          ref={containerRef}
          className={`rift-battle-trait-tags ${dragging ? "is-dragging" : ""}`}
          data-scrollable-traits
          {...scrollHandlers}
        >
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

export function BattleTraitBar({
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
