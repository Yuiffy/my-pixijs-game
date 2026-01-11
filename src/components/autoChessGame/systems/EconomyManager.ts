import { Scene } from 'phaser';
import { UNIT_TYPES, SHOP_PROBABILITIES } from '../config/UnitsData';
import { GameConfig } from '../config/GameConfig';

export class EconomyManager {
  private scene: Scene;
  private gold: number;
  private shopLevel: number;
  private currentShop: string[];

  constructor(scene: Scene) {
    this.scene = scene;
    this.gold = GameConfig.initialGold;
    this.shopLevel = 1;
    this.currentShop = [];

    this.setupEventListeners();
  }

  private setupEventListeners() {
    this.scene.game.events.on('SPEND_GOLD', this.handleSpendGold, this);
    this.scene.game.events.on('REFRESH_SHOP', this.refreshShop, this);
    this.scene.game.events.on('LEVEL_UP_SHOP', this.handleLevelUpShop, this);

    // 初始同步
    this.scene.game.events.on('GAME_START', () => {
        this.emitGoldUpdate();
    });
  }

  public destroy() {
    this.scene.game.events.off('SPEND_GOLD', this.handleSpendGold, this);
    this.scene.game.events.off('REFRESH_SHOP', this.refreshShop, this);
    this.scene.game.events.off('LEVEL_UP_SHOP', this.handleLevelUpShop, this);
  }

  private handleSpendGold(amount: number) {
    this.gold -= amount;
    if (this.gold < 0) this.gold = 0;
    this.emitGoldUpdate();
  }

  // 增加金币 (例如卖出兵营)
  public addGold(amount: number) {
    this.gold += amount;
    this.emitGoldUpdate();
  }

  public getGold() {
    return this.gold;
  }

  private emitGoldUpdate() {
    this.scene.game.events.emit('GOLD_CHANGED', this.gold);
  }

  private refreshShop() {
    console.log(`🔄 EconomyManager: 收到刷新商店请求，当前金币: ${this.gold}`);

    // 检查金币是否足够
    if (this.gold < 1) {
      console.log(`❌ EconomyManager: 金币不足，无法刷新商店 (需要1金币，当前只有${this.gold})`);
      return; // 金币不足，不刷新商店
    }

    const probabilities = (SHOP_PROBABILITIES as any)[this.shopLevel] || SHOP_PROBABILITIES[1];

    // 随机选择3个单位 (这里简化逻辑，暂不完全照搬 ShopSystem 的复杂部分，或者直接拿来用)
    // 复用 ShopSystem 的逻辑：
    const availableUnits = Object.keys(UNIT_TYPES).filter(key => {
      const unit = UNIT_TYPES[key];
      // 简单筛选：只允许购买当前商店等级解锁的单位（或者用ShopSystem的概率逻辑）
      // 这里暂时使用简单的 Tier 逻辑
       return unit.tier <= this.shopLevel;
    });

    const shop = [];
    const shuffled = [...availableUnits].sort(() => Math.random() - 0.5);
    for (let i = 0; i < Math.min(3, shuffled.length); i++) {
        shop.push(shuffled[i]);
    }

    this.currentShop = shop;
    this.scene.game.events.emit('UPDATE_SHOP', shop);
    console.log(`✅ EconomyManager: 商店刷新成功，新商店: ${shop.join(', ')}`);
  }

  private handleLevelUpShop() {
    console.log(`⬆️ EconomyManager: 收到升级商店请求，当前金币: ${this.gold}, 商店等级: ${this.shopLevel}`);

    // 检查金币是否足够
    if (this.gold < 5) {
      console.log(`❌ EconomyManager: 金币不足，无法升级商店 (需要5金币，当前只有${this.gold})`);
      return; // 金币不足，不升级商店
    }

    if (this.shopLevel < 5) {
      this.shopLevel++;
      this.scene.game.events.emit('SHOP_LEVEL_UP', this.shopLevel);
      console.log(`✅ EconomyManager: 商店升级成功，新等级: ${this.shopLevel}`);
      this.refreshShop();
    } else {
      console.log(`ℹ️ EconomyManager: 商店已达到最高等级5`);
    }
  }

  // 获取当前商店等级
  public getShopLevel() {
      return this.shopLevel;
  }
}
