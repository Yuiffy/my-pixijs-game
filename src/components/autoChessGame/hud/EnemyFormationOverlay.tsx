import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import type { AutoChessEngine } from "../core/gameEngine";
import {
  BATTLE_BOUNDS,
  enemyFormationPosition,
  playerFormationPosition,
} from "../core/battleGeometry";
import {
  TRAITS,
  UNIT_DEFS,
  abilityDescriptionForStar,
  enemyBudgetForRound,
} from "../core/gameData";
import { UnitPortrait } from "./shared";

export function EnemyFormationOverlay({ engine, onClose }: { engine: AutoChessEngine; onClose: () => void }) {
  const wave = engine.currentWave;
  const playerUnits = engine.state.board.flatMap((owned, index) => (
    owned
      ? [{
          key: `player-${owned.uid}`,
          team: "player" as const,
          unitId: owned.id,
          star: owned.star,
          position: playerFormationPosition(index),
          owned,
        }]
      : []
  ));
  const enemyUnits = wave.units.map((waveUnit, index) => ({
    key: `enemy-${waveUnit.id}-${index}`,
    team: "enemy" as const,
    unitId: waveUnit.id,
    star: waveUnit.star ?? 1,
    position: enemyFormationPosition(index, wave.units.length),
    owned: null,
  }));
  const formationUnits = [...playerUnits, ...enemyUnits];
  const formationStateKey = `${wave.round}:${playerUnits.map(({ key, position }) => `${key}@${position.x},${position.y}`).join("|")}`;
  const initialFormationKey = formationUnits[0]?.key || "";
  const [activeKey, setActiveKey] = useState(initialFormationKey);
  const activeUnit = formationUnits.find(({ key }) => key === activeKey) || formationUnits[0];
  const activeDefinition = activeUnit ? UNIT_DEFS[activeUnit.unitId] : null;
  const activeCombatStats = activeUnit?.owned
    ? engine.getPlayerCombatStats(activeUnit.owned)
    : null;
  const xPercent = (x: number) => Math.min(94, Math.max(6, ((x - BATTLE_BOUNDS.left) / (BATTLE_BOUNDS.right - BATTLE_BOUNDS.left)) * 100));
  const yPercent = (y: number) => Math.min(90, Math.max(10, ((y - BATTLE_BOUNDS.top) / (BATTLE_BOUNDS.bottom - BATTLE_BOUNDS.top)) * 100));

  useEffect(() => {
    setActiveKey(initialFormationKey);
  }, [formationStateKey, initialFormationKey]);

  return (
    <div
      className="rift-enemy-formation-backdrop"
      role="presentation"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="rift-enemy-formation-dialog" role="dialog" aria-modal="true" aria-labelledby="enemy-formation-title">
        <header>
          <div>
            <span className="rift-eyebrow">BATTLE DEPLOYMENT / WAVE {String(wave.round).padStart(2, "0")}</span>
            <h2 id="enemy-formation-title">双方部署图</h2>
          </div>
          <div className="rift-enemy-formation-summary">
            <span>我方 <b>{playerUnits.length}</b></span>
            <span>敌军 <b>{wave.units.length}</b></span>
            <span>价值 <b>{enemyBudgetForRound(engine.state.round)}</b></span>
          </div>
          <button type="button" className="rift-enemy-formation-close" onClick={onClose} aria-label="关闭敌方部署图" title="关闭">
            <span aria-hidden="true">×</span>
          </button>
        </header>
        <div className="rift-enemy-formation-layout">
          <div className="rift-enemy-formation-field" aria-label="双方战场站位">
            <span className="rift-formation-side-label is-player">我方后排</span>
            <span className="rift-formation-direction">我方 → 交战中轴 ← 敌方</span>
            <span className="rift-formation-side-label is-enemy">敌方后排</span>
            <div className="rift-formation-frontline" aria-hidden="true" />
            {formationUnits.map((unit) => {
              const definition = UNIT_DEFS[unit.unitId];
              const teamLabel = unit.team === "player" ? "我方" : "敌方";
              return (
                <button
                  type="button"
                  key={unit.key}
                  className={`rift-enemy-formation-unit is-${unit.team} ${activeKey === unit.key ? "is-active" : ""}`}
                  style={{
                    "--formation-x": `${xPercent(unit.position.x)}%`,
                    "--formation-y": `${yPercent(unit.position.y)}%`,
                    "--unit-accent": unit.team === "player" ? "#67d9ff" : "#ff7898",
                  } as CSSProperties}
                  data-team={unit.team}
                  data-unit-id={unit.unitId}
                  aria-label={`${teamLabel}${definition.name}，${unit.star} 星，${definition.cost} 费`}
                  aria-pressed={activeKey === unit.key}
                  onPointerEnter={() => setActiveKey(unit.key)}
                  onFocus={() => setActiveKey(unit.key)}
                  onClick={() => setActiveKey(unit.key)}
                >
                  <span className="rift-formation-portrait">
                    <UnitPortrait unitId={unit.unitId} size={44} />
                  </span>
                  <b>{"★".repeat(unit.star)}</b>
                  <small>{definition.cost}</small>
                </button>
              );
            })}
          </div>
          {activeUnit && activeDefinition && (
            <aside className="rift-enemy-formation-detail" aria-live="polite">
              <div className="rift-enemy-detail-identity">
                <span className="rift-enemy-detail-portrait" style={{ borderColor: activeUnit.team === "player" ? "#67d9ff" : "#ff7898" }}>
                  <UnitPortrait unitId={activeUnit.unitId} size={58} />
                </span>
                <div>
                  <span>{activeUnit.team === "player" ? "我方" : "敌方"} · {activeDefinition.cost} 费 · {"★".repeat(activeUnit.star)}</span>
                  <strong>{activeDefinition.name}</strong>
                  <small>{activeDefinition.title}</small>
                </div>
              </div>
              <div className="rift-enemy-detail-stats">
                <span>生命 <b>{Math.round(activeCombatStats?.maxHp ?? activeDefinition.hp)}</b></span>
                <span>攻击 <b>{Math.round(activeCombatStats?.attack ?? activeDefinition.attack)}</b></span>
                <span>护甲 <b>{Math.round(activeCombatStats?.armor ?? activeDefinition.armor)}</b></span>
                <span>射程 <b>{Math.round(activeCombatStats?.range ?? activeDefinition.range)}</b></span>
              </div>
              <div className="rift-enemy-detail-traits">
                {activeDefinition.traits.map((traitId) => (
                  <span key={traitId} style={{ "--trait-color": TRAITS[traitId].color } as CSSProperties}>
                    {TRAITS[traitId].name}
                  </span>
                ))}
              </div>
              <div className="rift-enemy-detail-skill">
                <span>技能 · {activeDefinition.abilityName}</span>
                <p>{abilityDescriptionForStar(activeDefinition, activeUnit.star)}</p>
              </div>
            </aside>
          )}
        </div>
        <footer>
          <span><i className="is-player" />我方</span>
          <span><i className="is-enemy" />敌方</span>
          <span>双方前线靠近中轴</span>
          <b>{wave.name}</b>
        </footer>
      </section>
    </div>
  );
}
