// src/components/autoChessGame/config/WavesData.ts
import { UNIT_TYPES } from './UnitsData';

export const WAVES_DATA = [
  // 第1波
  {
    waveNumber: 1,
    time: 10, // 游戏开始后10秒
    units: [
      { type: 'sui_warrior', count: 3 }
    ],
    description: "基础敌人来袭"
  },

  // 第2波
  {
    waveNumber: 2,
    time: 20,
    units: [
      { type: 'sui_warrior', count: 4 },
      { type: 'cyber_gunner', count: 1 }
    ],
    description: "加入远程单位"
  },

  // 第3波
  {
    waveNumber: 3,
    time: 30,
    units: [
      { type: 'sui_warrior', count: 5 },
      { type: 'cyber_gunner', count: 2 }
    ],
    description: "敌人数量增加"
  },

  // 第4波
  {
    waveNumber: 4,
    time: 40,
    units: [
      { type: 'sui_warrior', count: 3 },
      { type: 'cyber_gunner', count: 3 },
      { type: 'ancient_sage', count: 1 }
    ],
    description: "引入新兵种"
  },

  // 第5波
  {
    waveNumber: 5,
    time: 50,
    units: [
      { type: 'sui_warrior', count: 4 },
      { type: 'cyber_gunner', count: 2 },
      { type: 'ancient_sage', count: 2 },
      { type: 'magic_wizard', count: 1 }
    ],
    description: "魔法师登场"
  },

  // 第6波 - 中场高潮
  {
    waveNumber: 6,
    time: 60,
    units: [
      { type: 'sui_warrior', count: 6 },
      { type: 'cyber_gunner', count: 3 },
      { type: 'ancient_sage', count: 2 },
      { type: 'magic_wizard', count: 2 }
    ],
    description: "大规模进攻"
  },

  // 第7波
  {
    waveNumber: 7,
    time: 70,
    units: [
      { type: 'cyber_gunner', count: 4 },
      { type: 'ancient_sage', count: 3 },
      { type: 'magic_wizard', count: 2 },
      { type: 'mecha_tank', count: 1 }
    ],
    description: "机甲坦克出现"
  },

  // 第8波
  {
    waveNumber: 8,
    time: 80,
    units: [
      { type: 'sui_warrior', count: 4 },
      { type: 'cyber_gunner', count: 4 },
      { type: 'ancient_sage', count: 2 },
      { type: 'magic_wizard', count: 3 },
      { type: 'mecha_tank', count: 1 }
    ],
    description: "全兵种混编"
  },

  // 第9波
  {
    waveNumber: 9,
    time: 90,
    units: [
      { type: 'sui_warrior', count: 5 },
      { type: 'cyber_gunner', count: 5 },
      { type: 'ancient_sage', count: 3 },
      { type: 'magic_wizard', count: 3 },
      { type: 'mecha_tank', count: 2 }
    ],
    description: "精英部队"
  },

  // 第10波 - 最终波
  {
    waveNumber: 10,
    time: 100,
    units: [
      { type: 'sui_warrior', count: 8 },
      { type: 'cyber_gunner', count: 6 },
      { type: 'ancient_sage', count: 4 },
      { type: 'magic_wizard', count: 4 },
      { type: 'mecha_tank', count: 3 }
    ],
    description: "最终决战"
  }
];

// 获取指定波次的敌人配置
export function getWaveEnemies(waveNumber: number) {
  const wave = WAVES_DATA.find(w => w.waveNumber === waveNumber);
  if (!wave) return [];

  const enemies: any[] = [];
  wave.units.forEach(unitConfig => {
    for (let i = 0; i < unitConfig.count; i++) {
      enemies.push({
        ...(UNIT_TYPES as any)[unitConfig.type],
        textureKey: unitConfig.type
      });
    }
  });

  return enemies;
}

// 获取波次总数
export function getTotalWaves() {
  return WAVES_DATA.length;
}

// 获取波次信息
export function getWaveInfo(waveNumber: number) {
  return WAVES_DATA.find(w => w.waveNumber === waveNumber);
}
