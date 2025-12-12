// src/components/autoChessGame/systems/ShopSystem.ts

export class ShopSystem {
    game: any;
    shopLevel: number;
    currentShop: string[];

    constructor(game: any) {
        this.game = game;
        this.shopLevel = 1;
        this.currentShop = [];
    }

    // 根据等级和概率生成商店
    generateShop() {
        const { UNIT_TYPES, SHOP_PROBABILITIES } = require('../config/UnitsData');
        const probabilities = SHOP_PROBABILITIES[this.shopLevel] || SHOP_PROBABILITIES[1];

        // 根据概率选择稀有度
        const rarityRoll = Math.random() * 100;
        let targetRarity = 0;

        for (let i = 0; i < probabilities.length; i++) {
            if (rarityRoll < probabilities.slice(0, i + 1).reduce((a, b) => a + b, 0)) {
                targetRarity = i;
                break;
            }
        }

        // 筛选符合稀有度的单位（这里简化为根据cost判断）
        const availableUnits = Object.keys(UNIT_TYPES).filter(key => {
            const unit = UNIT_TYPES[key];
            // 简化的稀有度判断
            if (targetRarity === 0) return unit.cost === 1; // 白卡
            if (targetRarity === 1) return unit.cost === 2; // 绿卡
            if (targetRarity === 2) return unit.cost === 3 || unit.cost === 4; // 蓝卡
            if (targetRarity === 3) return unit.cost === 4 || unit.cost === 5; // 紫卡
            return unit.cost >= 4; // 金卡
        });

        // 随机选择5个单位
        const shop = [];
        const shuffled = [...availableUnits].sort(() => Math.random() - 0.5);

        for (let i = 0; i < Math.min(5, shuffled.length); i++) {
            shop.push(shuffled[i]);
        }

        this.currentShop = shop;
        return shop;
    }

    // 升级商店等级
    levelUp() {
        if (this.shopLevel < 5) {
            this.shopLevel++;
            return true;
        }
        return false;
    }

    // 检查单位是否在商店中
    hasUnit(unitKey) {
        return this.currentShop.includes(unitKey);
    }

    // 获取当前商店
    getCurrentShop() {
        return this.currentShop;
    }

    // 获取商店等级
    getShopLevel() {
        return this.shopLevel;
    }
}
