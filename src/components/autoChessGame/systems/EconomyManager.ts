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
  }

  private handleLevelUpShop() {
    if (this.shopLevel < 5) {
      this.shopLevel++;
      this.scene.game.events.emit('SHOP_LEVEL_UP', this.shopLevel);
      this.refreshShop();
    }
  }

  // 获取当前商店等级
  public getShopLevel() {
      return this.shopLevel;
  }
}
