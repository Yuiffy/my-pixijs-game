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
    calculateSynergies(barracks) {
        const factionCounts = {};

        // 统计各个羁绊的数量
        barracks.forEach(barracks => {
            barracks.unitData.factions.forEach(faction => {
                factionCounts[faction] = (factionCounts[faction] || 0) + 1;
            });
        });

        // 应用羁绊效果
        Object.keys(factionCounts).forEach(faction => {
            const count = factionCounts[faction];
            const synergyLevels = SYNERGIES[faction];

            if (synergyLevels) {
                Object.keys(synergyLevels).forEach(levelStr => {
                    const level = parseInt(levelStr);
                    const synergy = synergyLevels[level];

                    if (count >= level) {
                        // 激活羁绊
                        if (!this.activeSynergies[faction] || this.activeSynergies[faction].level < level) {
                            this.activeSynergies[faction] = {
                                level: level,
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
    isSynergyActive(faction, level) {
        return this.activeSynergies[faction] && this.activeSynergies[faction].level >= level;
    }

    // 获取羁绊描述
    getSynergyDescription(faction, level) {
        const synergy = SYNERGIES[faction]?.[level];
        return synergy ? synergy.description : null;
    }

    // 重置羁绊（用于游戏重新开始）
    reset() {
        this.activeSynergies = {};
    }
}
