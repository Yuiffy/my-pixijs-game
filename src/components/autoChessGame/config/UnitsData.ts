// src/components/autoChessGame/config/UnitsData.ts

interface GameScene {
  playerUnits: Phaser.GameObjects.Group;
}

export const FACTIONS = {
  SICHUAN: '川妹',
  CYBER: '赛博',
  ANCIENT: '古风',
  MAGIC: '魔法',
  MECHA: '机甲'
};

export const FACTION_DESCRIPTIONS = {
  川妹: '四川妹子，川妹子，战斗力爆表！\n2个：川妹羁绊 - 爆炸伤害\n3个：川妹羁绊 - 额外护盾\n5个：川妹羁绊 - 群体治疗',
  赛博: '赛博朋克风格，科技与机械的完美融合\n2个：赛博羁绊 - 额外攻击力\n3个：赛博羁绊 - 攻击速度提升\n5个：赛博羁绊 - 召唤机器人',
  古风: '古典中国风，诗书礼仪与武艺并重\n2个：古风羁绊 - 防御提升\n3个：古风羁绊 - 法术伤害\n5个：古风羁绊 - 群体buff',
  魔法: '神秘魔法力量，元素与咒术的交织\n2个：魔法羁绊 - 魔法伤害\n3个：魔法羁绊 - 法术暴击\n5个：魔法羁绊 - 元素控制',
  机甲: '未来机甲科技，重型装甲与火力输出\n2个：机甲羁绊 - 生命值提升\n3个：机甲羁绊 - 护甲增强\n5个：机甲羁绊 - 终极火力'
};

export interface UnitData {
  name: string;
  cost: number;
  tier: number;
  factions: string[];
  hp: number;
  damage: number;
  emoji: string;
  color: string;
  mass: number;
  skill: string;
  textureKey: string;
  attackRange?: number;
}

export const UNIT_TYPES: Record<string, UnitData> = {
  // ID 必须唯一
  sui_warrior: {
    name: '岁己·战士',
    cost: 1, // 价格
    tier: 1, // 商店等级要求
    factions: [FACTIONS.SICHUAN],
    hp: 100,
    damage: 10,
    emoji: '🐤', // 临时素材
    color: '#ffcccc',
    mass: 50, // 物理质量
    skill: 'basic_bump',
    textureKey: 'sui_warrior'
  },
  chili_mage: {
    name: '悠亚Yua',
    cost: 1,
    tier: 1,
    factions: [FACTIONS.MAGIC],
    hp: 70,
    damage: 12,
    emoji: '🐧',
    color: '#ffb347',
    mass: 28,
    skill: 'basic_bump',
    textureKey: 'chili_mage'
  },
  cyber_gunner: {
    name: '赛博枪手',
    cost: 2,
    tier: 2,
    factions: [FACTIONS.CYBER],
    hp: 60,
    damage: 25,
    emoji: '🔫',
    color: '#ccffff',
    mass: 30,
    skill: 'shoot',
    textureKey: 'cyber_gunner'
  },
  ancient_sage: {
    name: '古风贤者',
    cost: 3,
    tier: 2,
    factions: [FACTIONS.ANCIENT],
    hp: 80,
    damage: 15,
    emoji: '🎋',
    color: '#ccffcc',
    mass: 40,
    skill: 'heal',
    textureKey: 'ancient_sage'
  },
  magic_wizard: {
    name: '魔法师',
    cost: 4,
    tier: 3,
    factions: [FACTIONS.MAGIC],
    hp: 50,
    damage: 40,
    emoji: '🔮',
    color: '#ccccff',
    mass: 25,
    skill: 'magic_bolt',
    textureKey: 'magic_wizard'
  },
  mecha_tank: {
    name: '机甲坦克',
    cost: 5,
    tier: 3,
    factions: [FACTIONS.MECHA],
    hp: 200,
    damage: 20,
    emoji: '🚁',
    color: '#ffccff',
    mass: 100,
    skill: 'charge',
    textureKey: 'mecha_tank'
  },

  // 新增兵种
  archer: {
    name: '精灵弓箭手',
    cost: 2,
    tier: 1,
    factions: [FACTIONS.ANCIENT],
    hp: 65,
    damage: 18,
    emoji: '🏹',
    color: '#90EE90',
    mass: 25,
    skill: 'ranged_attack',
    attackRange: 120, // 远程攻击范围
    textureKey: 'archer'
  },

  knight: {
    name: '圣骑士',
    cost: 3,
    tier: 2,
    factions: [FACTIONS.ANCIENT],
    hp: 150,
    damage: 35,
    emoji: '⚔️',
    color: '#FFD700',
    mass: 80,
    skill: 'shield_bash',
    textureKey: 'knight'
  },

  assassin: {
    name: '影刺客',
    cost: 3,
    tier: 2,
    factions: [FACTIONS.CYBER],
    hp: 70,
    damage: 50,
    emoji: '🗡️',
    color: '#8A2BE2',
    mass: 30,
    skill: 'backstab',
    textureKey: 'assassin'
  },

  dragon: {
    name: '小火龙',
    cost: 4,
    tier: 3,
    factions: [FACTIONS.MAGIC],
    hp: 120,
    damage: 45,
    emoji: '🐉',
    color: '#FF4500',
    mass: 60,
    skill: 'fire_breath',
    attackRange: 100, // 远程攻击
    textureKey: 'dragon'
  },

  golem: {
    name: '石头傀儡',
    cost: 4,
    tier: 3,
    factions: [FACTIONS.ANCIENT],
    hp: 300,
    damage: 25,
    emoji: '🪨',
    color: '#696969',
    mass: 150,
    skill: 'earthquake',
    textureKey: 'golem'
  },

  sniper: {
    name: '狙击手',
    cost: 5,
    tier: 4,
    factions: [FACTIONS.CYBER],
    hp: 80,
    damage: 80,
    emoji: '🎯',
    color: '#FF1493',
    mass: 35,
    skill: 'snipe',
    attackRange: 200, // 超远距离攻击
    textureKey: 'sniper'
  },

  paladin: {
    name: '大天使',
    cost: 5,
    tier: 4,
    factions: [FACTIONS.ANCIENT, FACTIONS.MAGIC],
    hp: 250,
    damage: 40,
    emoji: '👼',
    color: '#FFFF00',
    mass: 70,
    skill: 'divine_shield',
    textureKey: 'paladin'
  }
};

export const SYNERGIES = {
  [FACTIONS.SICHUAN]: {
    2: {
      description: "川妹单位攻击力 +10%",
      effect: (game: GameScene) => {
        // 增加所有川妹单位的攻击力
        game.playerUnits.children.each((unit: any) => {
          if (unit.config.factions.includes(FACTIONS.SICHUAN)) {
            unit.damageMultiplier = (unit.damageMultiplier || 1) * 1.1;
          }
          return null;
        });
      }
    },
    4: {
      description: "激活红油锅底，碰撞造成范围爆炸",
      effect: (game: GameScene) => {
        // 为川妹单位添加爆炸效果
        game.playerUnits.children.each((unit: any) => {
          if (unit.config.factions.includes(FACTIONS.SICHUAN)) {
            unit.hasExplosion = true;
          }
          return null;
        });
      }
    }
  },
  [FACTIONS.CYBER]: {
    2: {
      description: "赛博单位攻速 +20%",
      effect: (game: GameScene) => {
        game.playerUnits.children.each((unit: any) => {
          if (unit.config.factions.includes(FACTIONS.CYBER)) {
            unit.attackSpeedMultiplier = (unit.attackSpeedMultiplier || 1) * 1.2;
          }
          return null;
        });
      }
    },
    4: {
      description: "激活赛博矩阵，获得护盾",
      effect: (game: GameScene) => {
        game.playerUnits.children.each((unit: any) => {
          if (unit.config.factions.includes(FACTIONS.CYBER)) {
            unit.shield = 50;
          }
          return null;
        });
      }
    }
  },
  [FACTIONS.ANCIENT]: {
    2: {
      description: "古风单位生命值 +15%",
      effect: (game: GameScene) => {
        game.playerUnits.children.each((unit: any) => {
          if (unit.config.factions.includes(FACTIONS.ANCIENT)) {
            unit.hp *= 1.15;
            unit.maxHp *= 1.15;
          }
          return null;
        });
      }
    }
  },
  [FACTIONS.MAGIC]: {
    3: {
      description: "魔法单位技能冷却 -25%",
      effect: (game: GameScene) => {
        game.playerUnits.children.each((unit: any) => {
          if (unit.config.factions.includes(FACTIONS.MAGIC)) {
            unit.skillCooldownMultiplier = 0.75;
          }
          return null;
        });
      }
    }
  },
  [FACTIONS.MECHA]: {
    2: {
      description: "机甲单位质量 +50%，更难被推开",
      effect: (game: GameScene) => {
        game.playerUnits.children.each((unit: any) => {
          if (unit.config.factions.includes(FACTIONS.MECHA)) {
            unit.setMass(unit.config.mass * 1.5);
          }
          return null;
        });
      }
    }
  }
};

export const SHOP_PROBABILITIES = {
  1: [100, 0, 0, 0, 0], // 1本: 100% 白卡
  2: [70, 30, 0, 0, 0], // 2本: 70% 白卡, 30% 绿卡
  3: [50, 35, 15, 0, 0], // 3本: 50% 白, 35% 绿, 15% 蓝
  4: [30, 40, 25, 5, 0], // 4本: 30% 白, 40% 绿, 25% 蓝, 5% 紫
  5: [15, 30, 35, 18, 2], // 5本: 15% 白, 30% 绿, 35% 蓝, 18% 紫, 2% 金
  // ...
};
