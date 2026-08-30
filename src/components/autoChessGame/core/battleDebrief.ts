import { UNIT_DEFS, type UnitId } from "./gameData";

type DebriefCombatant = {
  unitId: UnitId;
  damageDealt: number;
  healingDone: number;
  shieldingDone: number;
  alive: boolean;
};

export type BattleDebriefKind =
  | "standout"
  | "population"
  | "timeout"
  | "synergy"
  | "pressure"
  | "backline"
  | "frontline";

export interface BattleDebrief {
  kind: BattleDebriefKind;
  tone: "positive" | "warning" | "danger";
  title: string;
  detail: string;
}

export interface BattleDebriefInput {
  won: boolean;
  elapsed: number;
  limit: number;
  boardCount: number;
  boardCap: number;
  activeTraitCount: number;
  player: readonly DebriefCombatant[];
  enemy: readonly DebriefCombatant[];
}

type UnitContribution = {
  unitId: UnitId;
  damage: number;
  support: number;
};

const unitContributions = (fighters: readonly DebriefCombatant[]) => {
  const rows = new Map<UnitId, UnitContribution>();
  fighters.forEach((fighter) => {
    const row = rows.get(fighter.unitId) ?? {
      unitId: fighter.unitId,
      damage: 0,
      support: 0,
    };
    row.damage += fighter.damageDealt;
    row.support += fighter.healingDone + fighter.shieldingDone;
    rows.set(fighter.unitId, row);
  });
  return Array.from(rows.values());
};

const topContribution = (
  rows: readonly UnitContribution[],
  metric: "damage" | "support",
) => {
  return [...rows].sort((left, right) => {
    return right[metric] - left[metric] || left.unitId.localeCompare(right.unitId);
  })[0] ?? null;
};

const contributionShare = (value: number, total: number) => (
  total > 0 ? Math.max(0, Math.min(100, Math.round((value / total) * 100))) : 0
);

export const createBattleDebrief = (input: BattleDebriefInput): BattleDebrief => {
  const playerRows = unitContributions(input.player);
  const enemyRows = unitContributions(input.enemy);
  const playerDamage = playerRows.reduce((total, row) => total + row.damage, 0);
  const playerSupport = playerRows.reduce((total, row) => total + row.support, 0);
  const enemyDamage = enemyRows.reduce((total, row) => total + row.damage, 0);
  const playerSurvivors = input.player.filter((fighter) => fighter.alive).length;
  const enemySurvivors = input.enemy.filter((fighter) => fighter.alive).length;

  if (input.won) {
    const damageLeader = topContribution(playerRows, "damage");
    const supportLeader = topContribution(playerRows, "support");
    const useSupport = Boolean(
      supportLeader
      && supportLeader.support > 0
      && supportLeader.support >= (damageLeader?.damage ?? 0) * 0.8,
    );
    const leader = useSupport ? supportLeader : damageLeader;
    const metric = useSupport ? "支援" : "输出";
    const value = useSupport ? leader?.support ?? 0 : leader?.damage ?? 0;
    const total = useSupport ? playerSupport : playerDamage;
    if (leader && value > 0) {
      return {
        kind: "standout",
        tone: "positive",
        title: `关键${metric} · ${UNIT_DEFS[leader.unitId].name}`,
        detail: `贡献我方 ${contributionShare(value, total)}% ${metric}，${playerSurvivors}/${input.player.length} 名友军存活。`,
      };
    }
    return {
      kind: "standout",
      tone: "positive",
      title: "阵线完整",
      detail: `${playerSurvivors}/${input.player.length} 名友军存活，继续围绕当前核心强化。`,
    };
  }

  if (input.boardCount < input.boardCap) {
    const gap = input.boardCap - input.boardCount;
    return {
      kind: "population",
      tone: "warning",
      title: `少上阵 ${gap} 人`,
      detail: `当前仅上阵 ${input.boardCount}/${input.boardCap}，下一战优先补齐人口再考虑刷新。`,
    };
  }

  if (input.elapsed >= input.limit - 0.05) {
    return {
      kind: "timeout",
      tone: "warning",
      title: "战斗拖入超时",
      detail: `打满 ${Math.round(input.limit)} 秒后敌方仍存活 ${enemySurvivors} 人，优先补充输出或集火能力。`,
    };
  }

  if (input.activeTraitCount === 0) {
    return {
      kind: "synergy",
      tone: "warning",
      title: "羁绊尚未成型",
      detail: "本战没有激活羁绊，优先围绕共享羁绊的单位完成第一档联动。",
    };
  }

  const threat = topContribution(enemyRows, "damage");
  const threatShare = contributionShare(threat?.damage ?? 0, enemyDamage);
  if (
    enemySurvivors >= Math.ceil(input.enemy.length * 0.6)
    && threatShare < 35
  ) {
    return {
      kind: "pressure",
      tone: "danger",
      title: "敌方形成全面压制",
      detail: `敌军仍存活 ${enemySurvivors}/${input.enemy.length}，下一战优先升星或完成更高阶羁绊。`,
    };
  }

  if (!threat || threat.damage <= 0) {
    return {
      kind: "pressure",
      tone: "danger",
      title: "战线被突破",
      detail: `敌军仍存活 ${enemySurvivors}/${input.enemy.length}，调整前后排间距后再强化阵容。`,
    };
  }

  const definition = UNIT_DEFS[threat.unitId];
  const isBackline = definition.attackType === "ranged";
  return {
    kind: isBackline ? "backline" : "frontline",
    tone: "danger",
    title: `${isBackline ? "后排" : "前线"}威胁 · ${definition.name}`,
    detail: isBackline
      ? `贡献敌方 ${threatShare}% 输出；尝试换边布阵或派偷袭单位更快接近。`
      : `贡献敌方 ${threatShare}% 输出；尝试错位接敌，让主力避开其行进路线。`,
  };
};
