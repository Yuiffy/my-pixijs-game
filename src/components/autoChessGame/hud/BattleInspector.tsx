import { useEffect, useState } from "react";
import { AimOutlined, CloseOutlined } from "@ant-design/icons";
import type { AutoChessEngine } from "../core/gameEngine";
import { UNIT_DEFS, abilityDescriptionForStar } from "../core/gameData";
import { STAR_LABEL, UnitPortrait } from "./shared";

export function BattleInspector({ engine, fid, onSelect }: {
  engine: AutoChessEngine;
  fid: string;
  onSelect: (fid: string | null) => void;
}) {
  const [, refresh] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => refresh(value => value + 1), 200);
    return () => window.clearInterval(timer);
  }, []);
  const { battle } = engine.state;
  if (!battle) return null;
  const fighters = [...battle.player, ...battle.enemy];
  const fighter = fighters.find(unit => unit.fid === fid);
  if (!fighter) return null;
  const definition = UNIT_DEFS[fighter.unitId];
  const target = fighters.find(unit => unit.fid === fighter.targetFid);
  const statuses = [
    fighter.stun > 0 ? `眩晕 ${fighter.stun.toFixed(1)}s` : "",
    fighter.fearTime > 0 ? `恐惧 ${fighter.fearTime.toFixed(1)}s` : "",
    fighter.tauntTime > 0 ? `嘲讽 ${fighter.tauntTime.toFixed(1)}s` : "",
    fighter.burnTime > 0 ? `灼烧 ${fighter.burnTime.toFixed(1)}s` : "",
    fighter.slowTime > 0 ? `减速 ${fighter.slowTime.toFixed(1)}s` : "",
    fighter.stealthTime > 0 ? `隐身 ${fighter.stealthTime.toFixed(1)}s` : "",
    fighter.shield > 0 ? `护盾 ${Math.round(fighter.shield)}` : "",
    fighter.abilityShield > 0 ? `技能盾 ${Math.round(fighter.abilityShield)}` : "",
    fighter.growthStacks > 0 ? `饱腹 ${fighter.growthStacks}` : "",
  ].filter(Boolean);
  return (
    <aside className="rift-battle-inspector" aria-label="角色战况" data-fighter-id={fid}>
      <header>
        <UnitPortrait unitId={fighter.unitId} size={38} />
        <div><strong>{definition.name} <small>{STAR_LABEL[fighter.star]}</small></strong><span>{fighter.team === "player" ? "我方" : "敌方"} · {fighter.alive ? "战斗中" : "已倒下"}</span></div>
        <button type="button" aria-label="关闭角色战况" title="关闭角色战况" onClick={() => onSelect(null)}><CloseOutlined /></button>
      </header>
      <div className="rift-fighter-vitals">
        <div>生命 <b>{Math.round(fighter.hp)} / {Math.round(fighter.maxHp)}</b><meter aria-label="生命" min={0} max={fighter.maxHp} value={fighter.hp} /></div>
        <div>能量 <b>{Math.floor(fighter.energy)} / {fighter.maxEnergy}</b><meter aria-label="能量" min={0} max={fighter.maxEnergy} value={fighter.energy} /></div>
      </div>
      <div className="rift-fighter-stats"><span>输出 <b>{Math.round(fighter.damageDealt)}</b></span><span>承伤 <b>{Math.round(fighter.damageTaken)}</b></span><span>治疗 / 护盾 <b>{Math.round(fighter.healingDone + fighter.shieldingDone)}</b></span></div>
      <p className="rift-fighter-status">{statuses.join(" · ") || (fighter.alive ? "无额外状态" : "战斗结束")}</p>
      {target && fighter.alive && <button type="button" className="rift-fighter-target" onClick={() => onSelect(target.fid)}><AimOutlined />当前目标：{UNIT_DEFS[target.unitId].name}</button>}
      <details><summary>{definition.abilityName}</summary><p>{abilityDescriptionForStar(definition, fighter.star)}</p></details>
    </aside>
  );
}
