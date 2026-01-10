// 游戏阶段类型定义
export enum GamePhase {
  PREPARATION = 'preparation', // 购买阶段：玩家可以购买、放置、调整单位
  BATTLE = 'battle', // 战斗阶段：自动战斗，单位互相攻击
  RESOLUTION = 'resolution', // 结算阶段：计算伤害，发工资，进入下一回合
  GAME_OVER = 'game_over' // 游戏结束
}

// 游戏阶段描述
export const GamePhaseDescriptions = {
  [GamePhase.PREPARATION]: '购买阶段',
  [GamePhase.BATTLE]: '战斗阶段',
  [GamePhase.RESOLUTION]: '结算阶段',
  [GamePhase.GAME_OVER]: '游戏结束'
} as const;
