export const GameConfig = {
  width: 1000,
  height: 600,
  gravity: { x: 0, y: 0.3 },

  // 经济配置
  initialGold: 10,
  baseGoldPerRound: 5, // 每回合基础金币
  interestRate: 0.1, // 利息率10%
  maxInterestGold: 50, // 最多计算50金币的利息

  // 血量配置
  playerInitialHp: 40, // 玩家初始血量
  enemyInitialHp: 999, // 敌方初始血量

  // 战斗配置
  battleDuration: 15000, // 战斗持续时间15秒（毫秒）
  resolutionDuration: 2000, // 结算阶段持续时间2秒

  barracksPositions: [
    { x: 150, y: 150 }, { x: 300, y: 150 }, { x: 450, y: 150 }, { x: 600, y: 150 },
    { x: 150, y: 350 }, { x: 300, y: 350 }, { x: 450, y: 350 }, { x: 600, y: 350 }
  ],

  // 波次配置（保留用于兼容性）
  waveDelay: 8000,

  baseStats: {
    player: { x: 50, y: 300, color: 0x00ff00, label: 'BASE_PLAYER' },
    enemy: { x: 950, y: 300, color: 0xff0000, label: 'BASE_ENEMY' }
  },

  sellZone: {
    x: 900,
    y: 150,
    width: 100,
    height: 100
  }
};
