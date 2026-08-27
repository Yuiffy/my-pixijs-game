import {
  AUGMENTS,
  CAMPAIGN_ROUNDS,
  SHOP_TIER_COUNTS,
  SHOP_UNITS,
  STARTERS,
  TRAITS,
  UNIT_DEFS,
  type TraitId,
  type WaveDefinition,
  bookLevelForPlayerLevel,
  enemyBudgetForRound,
  enemyTraitActivations,
  progressionModeForRound,
  tierOddsForLevel,
  upgradeCostForLevel,
} from "../gameData";
import {
  enemyFormationPosition,
  playerFormationPosition,
} from "../battleGeometry";
import type {
  Fighter,
  GamePhase,
  GameState,
  OwnedUnit,
  Team,
} from "../gameTypes";
import { AUTOCHESS_VERSION } from "../../version";
import {
  STAR_FORGE_UNLOCK_COST,
  starForgeUpgradeCost,
} from "./roster";

interface ActiveTraitSummary {
  id: TraitId;
  name: string;
  family: string;
  count: number;
  level: number;
  description: string;
}

export interface TextStateContext {
  state: GameState;
  currentWave: WaveDefinition;
  potentialBounty: number;
  interestIncome: number;
  upgradeCost: number | null;
  isMaxPlayerLevel: boolean;
  boardCount: number;
  boardCap: number;
  getActiveTraits: () => ActiveTraitSummary[];
  augmentStacks: (id: (typeof AUGMENTS)[number]["id"]) => number;
  summarizeBattleFighter: (
    fighter: Fighter,
    value?: number,
  ) => Record<string, unknown>;
  getBattleRanking: (
    team: Team,
  ) => Array<{ fighter: Fighter; value: number }>;
}

export const renderTextState = (context: TextStateContext) => {
    const phaseLabels: Record<GamePhase, string> = {
      title: "选择开局协议",
      preparation: "购买与布阵",
      battle: "自动战斗",
      result: "回合结算",
      augment: "选择局中天赋",
      gameover: "本局结束",
    };
    const unitSummary = (unit: OwnedUnit | null, index: number, deployed = false) => unit && {
        index,
        grid: { column: index % 6, row: Math.floor(index / 6) },
        id: unit.id,
        name: UNIT_DEFS[unit.id].name,
        star: unit.star,
        formation: deployed ? playerFormationPosition(index) : undefined,
      };
    const { battle } = context.state;
    const { currentWave } = context;
    const selectedUnit = context.state.selected
      ? (context.state.selected.zone === "board"
          ? context.state.board[context.state.selected.index]
          : context.state.bench[context.state.selected.index])
      : null;
    return JSON.stringify({
      version: AUTOCHESS_VERSION,
      coordinateSystem: "画布 1120x720；原点在左上，x 向右、y 向下。",
      phase: context.state.phase,
      phaseLabel: phaseLabels[context.state.phase],
      round: context.state.round,
      maxRounds: context.state.maxRounds,
      campaignCleared: context.state.endlessUnlocked,
      endlessRound: Math.max(0, context.state.round - CAMPAIGN_ROUNDS),
      progressionMode: progressionModeForRound(context.state.round),
      wave: currentWave
        ? {
            name: currentWave.name,
            tag: currentWave.tag,
            description: currentWave.description,
            enemyBudget: enemyBudgetForRound(context.state.round),
            enemyCount: currentWave.units.length,
            formationTheme: currentWave.name.split(" · ")[0],
            potentialBounty: context.potentialBounty,
            units: currentWave.units.map(({ id, star = 1 }, index) => ({
              id,
              name: UNIT_DEFS[id].name,
              cost: UNIT_DEFS[id].cost,
              star,
              formation: enemyFormationPosition(index, currentWave.units.length),
            })),
            enemyTraits: enemyTraitActivations(currentWave.units).map(
              ({ id, count, level }) => ({
                id,
                name: TRAITS[id].name,
                count,
                level,
              }),
            ),
          }
        : null,
      player: {
        hp: context.state.hp,
        maxHp: context.state.maxHp,
        gold: context.state.gold,
        freeRerollCharges: context.state.freeRerollCharges,
        interestIncome: context.interestIncome,
        level: context.state.playerLevel,
        bookLevel: bookLevelForPlayerLevel(context.state.playerLevel),
        upgradeRemaining: context.upgradeCost,
        upgradeDiscountCarry: context.state.upgradeDiscountCarry,
        nextLevelInitialCost: context.isMaxPlayerLevel
          ? null
          : upgradeCostForLevel(context.state.playerLevel),
        maxLevel: context.isMaxPlayerLevel,
        starForge: {
          available: context.isMaxPlayerLevel,
          unlocked: context.state.starForgeUnlocked,
          unlockCost: STAR_FORGE_UNLOCK_COST,
          selectedUpgradeCost: selectedUnit
            ? starForgeUpgradeCost(selectedUnit)
            : null,
        },
        score: context.state.score,
        streak: context.state.streak,
        boardCount: context.boardCount,
        boardCap: context.boardCap,
      },
      roster: {
        purchasableUnits: SHOP_UNITS.length,
        tierCounts: SHOP_TIER_COUNTS,
        currentTierOdds: tierOddsForLevel(context.state.playerLevel),
      },
      board: context.state.board.map((unit, index) => unitSummary(unit, index, true)).filter(Boolean),
      bench: context.state.bench.map((unit, index) => unitSummary(unit, index)).filter(Boolean),
      shop: context.state.shop
        .map(
          (id, index) => id && {
              index,
              id,
              name: UNIT_DEFS[id].name,
              cost: UNIT_DEFS[id].cost,
            },
        )
        .filter(Boolean),
      shopLocked: context.state.shopLocked,
      activeTraits: context.getActiveTraits().map((trait) => ({
        name: trait.name,
        family: trait.family,
        count: trait.count,
        level: trait.level,
        description: trait.description,
      })),
      augments: context.state.augments.map(
        (id) => AUGMENTS.find((augment) => augment.id === id)?.name,
      ),
      augmentStacks: AUGMENTS.map((augment) => ({
        id: augment.id,
        name: augment.name,
        tier: augment.tier,
        stacks: context.augmentStacks(augment.id),
      })).filter((augment) => augment.stacks > 0),
      starterHistory: context.state.starterHistory.map(({ id }) => {
        const starter = STARTERS.find((item) => item.id === id);
        return { name: starter?.name, description: starter?.description };
      }),
      augmentHistory: context.state.augmentHistory.map(({ round, id }) => ({
        round,
        name: AUGMENTS.find((augment) => augment.id === id)?.name,
        tier: AUGMENTS.find((augment) => augment.id === id)?.tier,
        description: AUGMENTS.find((augment) => augment.id === id)?.description,
      })),
      runStats: Object.values(context.state.runStats)
        .filter((stats): stats is NonNullable<typeof stats> => Boolean(stats))
        .map((stats) => ({
          ...stats,
          name: UNIT_DEFS[stats.unitId].name,
          damageDealt: Math.round(stats.damageDealt),
          healingDone: Math.round(stats.healingDone),
          shieldingDone: Math.round(stats.shieldingDone),
          damageTaken: Math.round(stats.damageTaken),
          perBattle: {
            damageDealt: Math.round(stats.damageDealt / Math.max(1, stats.battles)),
            healingDone: Math.round(stats.healingDone / Math.max(1, stats.battles)),
            shieldingDone: Math.round(stats.shieldingDone / Math.max(1, stats.battles)),
            damageTaken: Math.round(stats.damageTaken / Math.max(1, stats.battles)),
          },
        })),
      starterChoices: context.state.starterChoices.map((id, index) => {
        const starter = STARTERS.find((item) => item.id === id);
        return { index, id, name: starter?.name, description: starter?.description };
      }),
      augmentChoices: context.state.augmentChoices.map((id, index) => ({
        index,
        id,
        name: AUGMENTS.find((augment) => augment.id === id)?.name,
        tier: AUGMENTS.find((augment) => augment.id === id)?.tier,
      })),
      selected: context.state.selected,
      battle: battle && {
        elapsed: Number(battle.elapsed.toFixed(1)),
        engagedTeams: { ...battle.engagedTeams },
        timeRemaining: Number(
          Math.max(0, battle.limit - battle.elapsed).toFixed(1),
        ),
        log: battle.eventLog.slice(-80),
        playerUnits: battle.player
          .filter((unit) => unit.alive)
          .map((unit) => ({
            ...context.summarizeBattleFighter(unit),
            energy: Math.round(unit.energy),
            x: Math.round(unit.x),
            y: Math.round(unit.y),
            radius: unit.radius,
            facingX: unit.facingX,
            attacking: unit.attackPulse > 0,
            hit: unit.hitPulse > 0,
            jumpPending: unit.jumpPending,
            jumping: unit.abilityMotion?.kind === "jump" || unit.jumpTime > 0,
            jumpProgress: unit.jumpTime > 0
              ? Number((1 - unit.jumpTime / Math.max(unit.jumpDuration, 0.001)).toFixed(2))
              : 0,
            jumpAdvancing: unit.vanguardJumpAdvancing,
            motion: unit.abilityMotion && {
              kind: unit.abilityMotion.kind,
              abilityId: unit.abilityMotion.abilityId,
              sourceFid: unit.abilityMotion.sourceFid,
              progress: Number((unit.abilityMotion.time / Math.max(unit.abilityMotion.duration, 0.001)).toFixed(2)),
              from: { x: Math.round(unit.abilityMotion.fromX), y: Math.round(unit.abilityMotion.fromY) },
              to: { x: Math.round(unit.abilityMotion.toX), y: Math.round(unit.abilityMotion.toY) },
            },
            boarCharge: unit.sekiChargeActive
              ? {
                direction: {
                  x: Number(unit.sekiChargeDirectionX.toFixed(2)),
                  y: Number(unit.sekiChargeDirectionY.toFixed(2)),
                },
                hitCount: unit.sekiChargeHitCount,
              }
              : undefined,
            elbowCharges: unit.suiBirdChargesRemaining || undefined,
            jumpFrom: { x: Math.round(unit.jumpFromX), y: Math.round(unit.jumpFromY) },
            jumpTo: { x: Math.round(unit.jumpToX), y: Math.round(unit.jumpToY) },
          })),
        ranking: {
          open: battle.rankingOpen,
          metric: battle.rankingMetric,
          playerRows: context.getBattleRanking("player").map(({ fighter, value }) => context.summarizeBattleFighter(fighter, value),),
          enemyRows: context.getBattleRanking("enemy").map(({ fighter, value }) => context.summarizeBattleFighter(fighter, value),),
        },
        visualEffects: {
          effects: battle.effects
            .filter((effect) => effect.kind !== "text" && effect.kind !== "heal")
            .map((effect) => ({
              kind: effect.kind,
              x: Math.round(effect.x),
              y: Math.round(effect.y),
              x2: effect.x2 === undefined ? undefined : Math.round(effect.x2),
              y2: effect.y2 === undefined ? undefined : Math.round(effect.y2),
              x3: effect.x3 === undefined ? undefined : Math.round(effect.x3),
              y3: effect.y3 === undefined ? undefined : Math.round(effect.y3),
              size: effect.size,
              variant: effect.kind === "komichi_sign" ? effect.text : undefined,
            })),
          projectiles: battle.projectiles.map((projectile) => ({
            x: Math.round(projectile.x),
            y: Math.round(projectile.y),
            style: projectile.style || "default",
            emoji: projectile.emoji,
            stunDuration: projectile.stunDuration,
            knockbackDistance: projectile.knockbackDistance,
            ability: projectile.impactAbilityId,
            grounded: Boolean(projectile.grounded),
            remaining: projectile.style === "lollipop" ? Number(projectile.remainingRange.toFixed(1)) : undefined,
          })),
          chronospheres: battle.chronospheres.map((zone) => ({
            x: Math.round(zone.x),
            y: Math.round(zone.y),
            radius: zone.radius,
            remaining: Number(zone.life.toFixed(2)),
            duration: zone.maxLife,
          })),
          healingZones: battle.healingZones.map((zone) => ({
            x: Math.round(zone.x),
            y: Math.round(zone.y),
            radius: zone.radius,
            remaining: Number(zone.life.toFixed(2)),
            duration: zone.maxLife,
            nextPulse: Number(zone.pulseTimer.toFixed(2)),
          })),
          controlZones: battle.controlZones.map((zone) => ({
            kind: zone.kind,
            team: zone.team,
            x: Math.round(zone.x),
            y: Math.round(zone.y),
            radius: zone.radius,
            slowMultiplier: zone.slowMultiplier,
            remaining: Number(zone.life.toFixed(2)),
            duration: zone.maxLife,
          })),
        },
        enemyUnits: battle.enemy
          .filter((unit) => unit.alive)
          .map((unit) => ({
            ...context.summarizeBattleFighter(unit),
            energy: Math.round(unit.energy),
            x: Math.round(unit.x),
            y: Math.round(unit.y),
            radius: unit.radius,
            facingX: unit.facingX,
            attacking: unit.attackPulse > 0,
            hit: unit.hitPulse > 0,
            jumpPending: unit.jumpPending,
            jumping: unit.abilityMotion?.kind === "jump" || unit.jumpTime > 0,
            jumpProgress: unit.jumpTime > 0
              ? Number((1 - unit.jumpTime / Math.max(unit.jumpDuration, 0.001)).toFixed(2))
              : 0,
            jumpAdvancing: unit.vanguardJumpAdvancing,
            motion: unit.abilityMotion && {
              kind: unit.abilityMotion.kind,
              abilityId: unit.abilityMotion.abilityId,
              sourceFid: unit.abilityMotion.sourceFid,
              progress: Number((unit.abilityMotion.time / Math.max(unit.abilityMotion.duration, 0.001)).toFixed(2)),
              from: { x: Math.round(unit.abilityMotion.fromX), y: Math.round(unit.abilityMotion.fromY) },
              to: { x: Math.round(unit.abilityMotion.toX), y: Math.round(unit.abilityMotion.toY) },
            },
            boarCharge: unit.sekiChargeActive
              ? {
                direction: {
                  x: Number(unit.sekiChargeDirectionX.toFixed(2)),
                  y: Number(unit.sekiChargeDirectionY.toFixed(2)),
                },
                hitCount: unit.sekiChargeHitCount,
              }
              : undefined,
            elbowCharges: unit.suiBirdChargesRemaining || undefined,
            jumpFrom: { x: Math.round(unit.jumpFromX), y: Math.round(unit.jumpFromY) },
            jumpTo: { x: Math.round(unit.jumpToX), y: Math.round(unit.jumpToY) },
          })),
        allPlayerUnits: battle.player.map((unit) => context.summarizeBattleFighter(unit)),
        allEnemyUnits: battle.enemy.map((unit) => context.summarizeBattleFighter(unit)),
      },
      result: context.state.result,
      availableActions:
        context.state.phase === "preparation"
          ? [
              "点击商店购买",
              context.isMaxPlayerLevel
                ? context.state.starForgeUnlocked
                  ? "把一星或二星棋子拖到升星工坊，或选中后点击工坊直升"
                  : `点击升星工坊：支付 ${STAR_FORGE_UNLOCK_COST} 金币在本局解锁功能`
                : `点击升本：一次支付 ${context.upgradeCost ?? 0} 金币升至下一本`,
              "点击锁定/解锁保留下回合商店",
              "点击单位再点击格子移动/交换",
              "点击回收出售选中单位",
              "R 刷新商店",
              "L 锁定/解锁商店",
              context.isMaxPlayerLevel ? "U 使用升星工坊" : "U 升本",
              "数字 1-5 购买对应商店棋子",
              "Space 开始战斗",
              "F 全屏",
            ]
          : context.state.phase === "augment"
            ? ["点击一个局中天赋或按数字 1-3"]
            : context.state.phase === "title"
              ? ["点击一个开局协议或按数字 1-3"]
              : context.state.phase === "gameover"
                ? ["点击再来一局或按 Enter"]
                : context.state.phase === "battle"
                  ? ["自动战斗中", "P 暂停/继续", "S 快速结算", "点击战斗统计或按 D 展开/收起", "F 全屏"]
                  : ["查看双方战斗统计", "点击继续或按 Enter 进入下一阶段", "F 全屏"],
      toast: context.state.toast?.text || null,
    });
  }
