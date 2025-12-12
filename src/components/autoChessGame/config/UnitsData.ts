// src/components/autoChessGame/config/UnitsData.js

export const FACTIONS = {
    SICHUAN: '川妹',
    CYBER: '赛博',
    ANCIENT: '古风',
    MAGIC: '魔法',
    MECHA: '机甲'
};

export const UNIT_TYPES = {
    // ID 必须唯一
    'sui_warrior': {
        name: '岁己·战士',
        cost: 1,      // 价格
        tier: 1,      // 商店等级要求
        factions: [FACTIONS.SICHUAN],
        hp: 100,
        damage: 10,
        spawnInterval: 4000, // 兵营每4秒出一个
        emoji: '🥘',  // 临时素材
        color: '#ffcccc',
        mass: 50,     // 物理质量
        skill: 'basic_bump'
    },
    'cyber_gunner': {
        name: '赛博枪手',
        cost: 2,
        tier: 2,
        factions: [FACTIONS.CYBER],
        hp: 60,
        damage: 25,
        spawnInterval: 5000,
        emoji: '🔫',
        color: '#ccffff',
        mass: 30,
        skill: 'shoot'
    },
    'ancient_sage': {
        name: '古风贤者',
        cost: 3,
        tier: 2,
        factions: [FACTIONS.ANCIENT],
        hp: 80,
        damage: 15,
        spawnInterval: 6000,
        emoji: '🎋',
        color: '#ccffcc',
        mass: 40,
        skill: 'heal'
    },
    'magic_wizard': {
        name: '魔法师',
        cost: 4,
        tier: 3,
        factions: [FACTIONS.MAGIC],
        hp: 50,
        damage: 40,
        spawnInterval: 7000,
        emoji: '🔮',
        color: '#ccccff',
        mass: 25,
        skill: 'magic_bolt'
    },
    'mecha_tank': {
        name: '机甲坦克',
        cost: 5,
        tier: 3,
        factions: [FACTIONS.MECHA],
        hp: 200,
        damage: 20,
        spawnInterval: 8000,
        emoji: '🚁',
        color: '#ffccff',
        mass: 100,
        skill: 'charge'
    }
    // ... 后续可以在这里加几十个角色
};

export const SYNERGIES = {
    [FACTIONS.SICHUAN]: {
        2: {
            description: "川妹单位攻击力 +10%",
            effect: (game) => {
                // 增加所有川妹单位的攻击力
                game.playerUnits.children.each(unit => {
                    if (unit.config.factions.includes(FACTIONS.SICHUAN)) {
                        unit.damageMultiplier = (unit.damageMultiplier || 1) * 1.1;
                    }
                });
            }
        },
        4: {
            description: "激活红油锅底，碰撞造成范围爆炸",
            effect: (game) => {
                // 为川妹单位添加爆炸效果
                game.playerUnits.children.each(unit => {
                    if (unit.config.factions.includes(FACTIONS.SICHUAN)) {
                        unit.hasExplosion = true;
                    }
                });
            }
        }
    },
    [FACTIONS.CYBER]: {
        2: {
            description: "赛博单位攻速 +20%",
            effect: (game) => {
                game.playerUnits.children.each(unit => {
                    if (unit.config.factions.includes(FACTIONS.CYBER)) {
                        unit.attackSpeedMultiplier = (unit.attackSpeedMultiplier || 1) * 1.2;
                    }
                });
            }
        },
        4: {
            description: "激活赛博矩阵，获得护盾",
            effect: (game) => {
                game.playerUnits.children.each(unit => {
                    if (unit.config.factions.includes(FACTIONS.CYBER)) {
                        unit.shield = 50;
                    }
                });
            }
        }
    },
    [FACTIONS.ANCIENT]: {
        2: {
            description: "古风单位生命值 +15%",
            effect: (game) => {
                game.playerUnits.children.each(unit => {
                    if (unit.config.factions.includes(FACTIONS.ANCIENT)) {
                        unit.hp *= 1.15;
                        unit.maxHp *= 1.15;
                    }
                });
            }
        }
    },
    [FACTIONS.MAGIC]: {
        3: {
            description: "魔法单位技能冷却 -25%",
            effect: (game) => {
                game.playerUnits.children.each(unit => {
                    if (unit.config.factions.includes(FACTIONS.MAGIC)) {
                        unit.skillCooldownMultiplier = 0.75;
                    }
                });
            }
        }
    },
    [FACTIONS.MECHA]: {
        2: {
            description: "机甲单位质量 +50%，更难被推开",
            effect: (game) => {
                game.playerUnits.children.each(unit => {
                    if (unit.config.factions.includes(FACTIONS.MECHA)) {
                        unit.setMass(unit.config.mass * 1.5);
                    }
                });
            }
        }
    }
};

export const SHOP_PROBABILITIES = {
    1: [100, 0, 0, 0, 0],   // 1本: 100% 白卡
    2: [70, 30, 0, 0, 0],   // 2本: 70% 白卡, 30% 绿卡
    3: [50, 35, 15, 0, 0],  // 3本: 50% 白, 35% 绿, 15% 蓝
    4: [30, 40, 25, 5, 0],  // 4本: 30% 白, 40% 绿, 25% 蓝, 5% 紫
    5: [15, 30, 35, 18, 2], // 5本: 15% 白, 30% 绿, 35% 蓝, 18% 紫, 2% 金
    // ...
};
