// src/components/autoChessGame/systems/SynergySystem.ts
import { SYNERGIES } from '../config/UnitsData';

export class SynergySystem {
  game: any;

  activeSynergies: { [key: string]: { level: number; description: string; effect: Function } };

  constructor(game: any) {
    this.game = game;
    this.activeSynergies = {};
  }

  // 计算当前羁绊
  calculateSynergies(barracks: any[]) {
    const factionCounts: { [key: string]: number } = {};

    // 统计各个羁绊的数量
    barracks.forEach(barrack => {
      barrack.unitData.factions.forEach((faction: string) => {
        factionCounts[faction] = (factionCounts[faction] || 0) + 1;
      });
    });

    // 应用羁绊效果
    Object.keys(factionCounts).forEach(faction => {
      const count = factionCounts[faction];
      const synergyLevels = SYNERGIES[faction];

      if (synergyLevels) {
        Object.keys(synergyLevels).forEach(levelStr => {
          const level = parseInt(levelStr, 10);
          const synergy = (synergyLevels as any)[level];

          if (count >= level) {
            // 激活羁绊
            if (!this.activeSynergies[faction] || this.activeSynergies[faction].level < level) {
              this.activeSynergies[faction] = {
                level,
                description: synergy.description,
                effect: synergy.effect
              };

              // 应用效果
              synergy.effect(this.game);
            }
          }
        });
      }
    });

    return factionCounts;
  }

  // 获取活跃的羁绊
  getActiveSynergies() {
    return this.activeSynergies;
  }

  // 检查特定羁绊是否激活
  isSynergyActive(faction: string, level: number) {
    return this.activeSynergies[faction] && this.activeSynergies[faction].level >= level;
  }

  // 获取羁绊描述
  getSynergyDescription(faction: string, level: number) {
    const synergy = (SYNERGIES as any)[faction]?.[level];
    return synergy ? synergy.description : null;
  }

  // 重置羁绊（用于游戏重新开始）
  reset() {
    this.activeSynergies = {};
  }
}
