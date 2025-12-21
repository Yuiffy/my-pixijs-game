// src/components/autoChessGame/scenes/MainScene.ts
import * as Phaser from 'phaser';
import { UNIT_TYPES } from '../config/UnitsData';
import Unit from '../objects/Unit';
import Barracks from '../objects/Barracks';

// 预设兵营位置
const BARRACKS_POSITIONS = [
  { x: 150, y: 150 }, { x: 300, y: 150 }, { x: 450, y: 150 }, { x: 600, y: 150 },
  { x: 150, y: 350 }, { x: 300, y: 350 }, { x: 450, y: 350 }, { x: 600, y: 350 }
];

export default class MainScene extends Phaser.Scene {
  playerCategory!: number;

  enemyCategory!: number;

  wallCategory!: number;

  playerUnits!: Phaser.GameObjects.Group;

  enemyUnits!: Phaser.GameObjects.Group;

  playerBarracks: any[] = [];

  playerBase!: Phaser.Physics.Matter.Sprite;

  enemyBase!: Phaser.Physics.Matter.Sprite;

  playerHp!: number;

  enemyHp!: number;

  playerGold!: number;

  playerBaseBarBg!: Phaser.GameObjects.Rectangle;

  playerBaseBarFg!: Phaser.GameObjects.Rectangle;

  enemyBaseBarBg!: Phaser.GameObjects.Rectangle;

  enemyBaseBarFg!: Phaser.GameObjects.Rectangle;

  waveText!: Phaser.GameObjects.Text;

  waveTimer!: Phaser.Time.TimerEvent;

  gameStarted!: boolean;

  currentWave!: number;

  notStartedText!: Phaser.GameObjects.Text;

  shopLevel!: number;

  currentShop!: string[];

  sellZone!: Phaser.GameObjects.Zone;

  sellZoneText!: Phaser.GameObjects.Text;

  sellZoneBg!: Phaser.GameObjects.Rectangle;

  constructor() {
    super('MainScene');
  }

  create() {
    console.log('=== MainScene v5.1 (Fix Crash) Loaded ===');

    // --- 1. 资源准备 ---
    // 💡 修复：删除了导致报错的 Barracks.createBarracksTexture 调用
    // 只确保 Unit 的纹理存在即可
    Object.values(UNIT_TYPES).forEach((unitData: any) => {
      if (!this.textures.exists(unitData.textureKey)) {
        Unit.createTexture(this, unitData);
      }
    });

    // --- 2. 物理世界 ---
    this.matter.world.setBounds(0, 0, 1000, 600);
    this.playerCategory = this.matter.world.nextCategory();
    this.enemyCategory = this.matter.world.nextCategory();
    this.wallCategory = this.matter.world.nextCategory();

    // --- 3. 组管理 ---
    this.playerUnits = this.add.group();
    this.enemyUnits = this.add.group();
    this.playerBarracks = [];

    // --- 4. 基地 ---
    this.createBase(50, 300, 'BASE_PLAYER', 0x00ff00, this.enemyCategory);
    this.createBase(950, 300, 'BASE_ENEMY', 0xff0000, this.playerCategory);
    this.createBaseHealthBars();

    this.playerHp = 100;
    this.enemyHp = 100;
    this.playerGold = 10; // 初始金币

    // --- 5. 事件监听 ---
    this.game.events.off('AUTO_BUY_UNIT');
    this.game.events.on('AUTO_BUY_UNIT', this.handleAutoBuyUnit, this);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/e0c29ed0-d46a-4623-8c34-0a2630dfe77f', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'MainScene.ts:create', message: 'AUTO_BUY_UNIT event listener registered', data: { eventName: 'AUTO_BUY_UNIT', handler: 'handleAutoBuyUnit' }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'extended-debug', hypothesisId: 'A9' }) }).catch(() => {});
    // #endregion

    this.game.events.off('GAME_START');
    this.game.events.on('GAME_START', this.startGame, this);
    console.log('MainScene: GAME_START event listener registered');

    this.game.events.off('REFRESH_SHOP');
    this.game.events.on('REFRESH_SHOP', this.handleRefreshShop, this);

    this.game.events.off('LEVEL_UP_SHOP');
    this.game.events.on('LEVEL_UP_SHOP', this.handleLevelUpShop, this);

    this.game.events.off('SPEND_GOLD');
    this.game.events.on('SPEND_GOLD', this.handleSpendGold, this);

    // 碰撞伤害逻辑
    this.matter.world.on('collisionstart', (event: any) => {
      event.pairs.forEach((pair: any) => {
        const { bodyA, bodyB } = pair;
        const gameObjA = bodyA.gameObject;
        const gameObjB = bodyB.gameObject;

        if (gameObjA instanceof Unit && gameObjB instanceof Unit && gameObjA.isEnemy !== gameObjB.isEnemy) {
          const damage = 5;
          gameObjA.takeDamage(damage);
          gameObjB.takeDamage(damage);
        }

        this.checkBaseCollision(bodyA, gameObjB);
        this.checkBaseCollision(bodyB, gameObjA);
      });
    });

    this.gameStarted = false;
    this.currentWave = 0;
    this.initializeShop();

    // 创建卖掉区域（右上角）
    this.createSellZone();

    // 添加游戏未开始的提示
    this.notStartedText = this.add.text(500, 300, '点击"开始战斗"开始游戏', {
      fontSize: '24px',
      color: '#ffffff',
      backgroundColor: '#000000',
      padding: { x: 10, y: 5 }
    }).setOrigin(0.5).setDepth(2000);

    // 游戏初始化完成，发出ready事件
    this.game.events.emit('ready');
  }

  createBase(x: number, y: number, label: string, color: number, collidesWith: number) {
    const rect = this.add.rectangle(x, y, 50, 500, color);
    const base = this.matter.add.gameObject(rect, { isStatic: true, label }) as Phaser.Physics.Matter.Sprite;
    base.setCollisionCategory(this.wallCategory);
    base.setCollidesWith([collidesWith]);
    if (label === 'BASE_PLAYER') this.playerBase = base; else this.enemyBase = base;
  }

  createSellZone() {
    // 卖掉区域位置：右上角（往下挪一点避免被UI遮挡）
    const sellZoneX = 900;
    const sellZoneY = 150;
    const sellZoneWidth = 100;
    const sellZoneHeight = 100;

    // 创建Zone用于检测
    this.sellZone = this.add.zone(sellZoneX, sellZoneY, sellZoneWidth, sellZoneHeight);
    this.sellZone.setDepth(1000);

    // 创建背景矩形
    this.sellZoneBg = this.add.rectangle(sellZoneX, sellZoneY, sellZoneWidth, sellZoneHeight, 0xff0000, 0.3);
    this.sellZoneBg.setStrokeStyle(3, 0xff0000);
    this.sellZoneBg.setDepth(999);

    // 创建文字提示
    this.sellZoneText = this.add.text(sellZoneX, sellZoneY, '卖掉\n兵营', {
      fontSize: '20px',
      color: '#ffffff',
      fontStyle: 'bold',
      align: 'center'
    }).setOrigin(0.5).setDepth(1001);

    // 初始隐藏（只在拖动时显示）
    this.sellZoneBg.setVisible(false);
    this.sellZoneText.setVisible(false);
  }

  isInSellZone(x: number, y: number): boolean {
    if (!this.sellZone) return false;
    const bounds = this.sellZone.getBounds();
    return x >= bounds.x - bounds.width / 2 && x <= bounds.x + bounds.width / 2 &&
           y >= bounds.y - bounds.height / 2 && y <= bounds.y + bounds.height / 2;
  }

  sellBarracks(barracks: Barracks) {
    // 获取兵营的单位数据以计算返还金币
    const { unitData } = barracks;
    const refundGold = unitData.cost || 1; // 返还购买时的金币

    // 从数组中移除
    const index = this.playerBarracks.indexOf(barracks);
    if (index > -1) {
      this.playerBarracks.splice(index, 1);
    }

    // 返还金币
    this.playerGold += refundGold;
    this.game.events.emit('GOLD_CHANGED', this.playerGold);
    console.log(`💰 Sold barracks, refunded ${refundGold} gold. Total: ${this.playerGold}`);

    // 销毁兵营
    barracks.destroy();

    // 重新计算羁绊
    this.calculateSynergies();

    // 更新兵营数量
    this.game.events.emit('BARRACKS_PLACED', this.playerBarracks.length);
  }

  checkBaseCollision(baseBody: any, unitObj: any) {
    if (unitObj instanceof Unit) {
      const { now } = this.time;

      // 检查单位是否可以攻击基地（避免连续攻击）
      if (!unitObj.lastBaseAttackTime) {
        unitObj.lastBaseAttackTime = 0;
      }

      if (now - unitObj.lastBaseAttackTime < 1000) { // 1秒冷却
        return;
      }

      if (baseBody.label === 'BASE_PLAYER' && unitObj.isEnemy) {
        this.playerHp -= 1; // 改为每次1点伤害
        unitObj.lastBaseAttackTime = now;
        this.updateBaseHealthBars();
        // 不让单位自爆，继续攻击
      } else if (baseBody.label === 'BASE_ENEMY' && !unitObj.isEnemy) {
        this.enemyHp -= 1; // 改为每次1点伤害
        unitObj.lastBaseAttackTime = now;
        this.updateBaseHealthBars();
        // 不让单位自爆，继续攻击
      }
    }
  }

  // 自动放置逻辑 (对应新版UI)
  handleAutoBuyUnit({ unitKey }: { unitKey: string }) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/e0c29ed0-d46a-4623-8c34-0a2630dfe77f', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'MainScene.ts:handleAutoBuyUnit', message: 'handleAutoBuyUnit called', data: { unitKey, currentBarracksCount: this.playerBarracks.length }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'initial-debug', hypothesisId: 'A2' }) }).catch(() => {});
    // #endregion

    if (this.playerBarracks.length >= 8) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/e0c29ed0-d46a-4623-8c34-0a2630dfe77f', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'MainScene.ts:handleAutoBuyUnit', message: 'Barracks limit reached', data: { currentBarracksCount: this.playerBarracks.length }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'initial-debug', hypothesisId: 'A2' }) }).catch(() => {});
      // #endregion
      return;
    }

    // 自动寻找下一个空位
    const index = this.playerBarracks.length;
    const pos = BARRACKS_POSITIONS[index];

    console.log(`🎯 自动放置: ${unitKey} at (${pos.x}, ${pos.y})`);

    const data = (UNIT_TYPES as any)[unitKey];
    if (!data) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/e0c29ed0-d46a-4623-8c34-0a2630dfe77f', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'MainScene.ts:handleAutoBuyUnit', message: 'Unit data not found in UNIT_TYPES', data: { unitKey }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'initial-debug', hypothesisId: 'A3' }) }).catch(() => {});
      // #endregion
      return;
    }

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/e0c29ed0-d46a-4623-8c34-0a2630dfe77f', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'MainScene.ts:handleAutoBuyUnit', message: 'Creating barracks', data: { unitKey, position: pos, index }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'initial-debug', hypothesisId: 'A4' }) }).catch(() => {});
    // #endregion

    const barracks = new Barracks(this, pos.x, pos.y, unitKey, data);
    this.playerBarracks.push(barracks);
    console.log(`✅ Barracks created for ${unitKey} at (${pos.x}, ${pos.y}). Total barracks: ${this.playerBarracks.length}`);
    console.log(`Barracks object:`, barracks);
    console.log(`Barracks position after creation: (${barracks.x}, ${barracks.y})`);

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/e0c29ed0-d46a-4623-8c34-0a2630dfe77f', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'MainScene.ts:handleAutoBuyUnit', message: 'Barracks added to scene', data: { unitKey, totalBarracks: this.playerBarracks.length, barracksVisible: barracks.visible, barracksExists: !!barracks }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'initial-debug', hypothesisId: 'A4' }) }).catch(() => {});
    // #endregion

    this.calculateSynergies();
    this.game.events.emit('BARRACKS_PLACED', this.playerBarracks.length);
  }

  spawnEnemyWave() {
    this.currentWave++;
    console.log(`🌊 Wave ${this.currentWave} starting!`);

    // 1. 生成敌军
    const enemyCount = 3 + Math.floor(this.currentWave / 2);
    for (let i = 0; i < enemyCount; i++) {
      const y = 100 + Math.random() * 400;
      const keys = Object.keys(UNIT_TYPES);
      const randomKey = keys[Math.floor(Math.random() * keys.length)];
      const enemy = new Unit(this, 900, y, (UNIT_TYPES as any)[randomKey], true);
      this.enemyUnits.add(enemy);
    }

    // 2. 强制生成己方援军 (保证有架打)
    const friendCount = 3 + Math.floor(this.currentWave / 2);
    for (let i = 0; i < friendCount; i++) {
      const y = 100 + Math.random() * 400;
      const x = 150 + Math.random() * 100;
      const friend = new Unit(this, x, y, (UNIT_TYPES as any).sui_warrior, false);
      this.playerUnits.add(friend);
    }

    // 3. 同步触发所有兵营出兵（和敌友一起出兵）
    this.playerBarracks.forEach(barracks => {
      barracks.spawnUnit();
    });

    if (!this.waveText) {
      this.waveText = this.add.text(500, 50, `Wave ${this.currentWave}`, { fontSize: '32px', color: '#fff' }).setOrigin(0.5);
    } else {
      this.waveText.setText(`Wave ${this.currentWave}`);
    }

    if (this.currentWave % 3 === 0 && this.shopLevel < 5) {
      this.shopLevel++;
      this.game.events.emit('SHOP_LEVEL_UP', this.shopLevel);
    }
  }

  createBaseHealthBars() {
    this.playerBaseBarFg = this.add.rectangle(25, 550, 40, 8, 0x00ff00);
    this.enemyBaseBarFg = this.add.rectangle(975, 550, 40, 8, 0xff0000);
    this.updateBaseHealthBars();
  }

  updateBaseHealthBars() {
    this.playerBaseBarFg.width = 40 * (Math.max(0, this.playerHp) / 100);
    this.enemyBaseBarFg.width = 40 * (Math.max(0, this.enemyHp) / 100);
    if (this.playerHp <= 0) this.gameOver(false);
    if (this.enemyHp <= 0) this.gameOver(true);
  }

  initializeShop() { this.shopLevel = 1; this.refreshShop(); }

  refreshShop() {
    // 根据商店等级限制可用单位
    const availableUnits = Object.keys(UNIT_TYPES).filter(key => {
      const unit = (UNIT_TYPES as any)[key];
      return unit.tier <= this.shopLevel; // 只能购买当前等级及以下的单位
    });

    // 随机选择3个单位
    const shop = [];
    const shuffled = [...availableUnits].sort(() => Math.random() - 0.5);

    for (let i = 0; i < Math.min(3, shuffled.length); i++) {
      shop.push(shuffled[i]);
    }

    this.currentShop = shop;
    this.game.events.emit('UPDATE_SHOP', shop);
  }

  handleRefreshShop() { this.refreshShop(); }

  handleLevelUpShop() {
    if (this.shopLevel < 5) {
      this.shopLevel++;
      this.game.events.emit('SHOP_LEVEL_UP', this.shopLevel);
      this.refreshShop(); // 升级后刷新商店
      console.log(`Shop level up to ${this.shopLevel}`);
    }
  }

  handleSpendGold(amount: number) {
    this.playerGold -= amount;
    if (this.playerGold < 0) this.playerGold = 0; // 防止负数
    this.game.events.emit('GOLD_CHANGED', this.playerGold);
    console.log(`Spent ${amount} gold, remaining: ${this.playerGold}`);
  }

  update(time: number, delta: number) {
    this.playerUnits.children.each((u: any) => u.update(time, delta));
    this.enemyUnits.children.each((u: any) => u.update(time, delta));

    // #region agent log
    if (this.playerBarracks.length > 0) {
      fetch('http://127.0.0.1:7242/ingest/e0c29ed0-d46a-4623-8c34-0a2630dfe77f', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'MainScene.ts:update', message: 'Calling update on barracks', data: { barracksCount: this.playerBarracks.length, time, delta }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'extended-debug', hypothesisId: 'A7' }) }).catch(() => {});
    }
    // #endregion

    this.playerBarracks.forEach(b => b.update()); // Barracks sprite update
  }

  calculateSynergies() {
    const counts: any = {};
    const countedUnits = new Set(); // 记录已计数的兵种类型

    this.playerBarracks.forEach(b => {
      // 只有在该兵种类型还未计数时才计数
      if (!countedUnits.has(b.unitKey)) {
        countedUnits.add(b.unitKey);
        b.unitData.factions.forEach((f: string) => {
          counts[f] = (counts[f] || 0) + 1;
        });
      }
    });

    this.game.events.emit('UPDATE_SYNERGY', counts);
  }

  startGame() {
    this.gameStarted = true;
    if (this.notStartedText) {
      this.notStartedText.destroy();
    }

    // 禁用所有兵营的拖动功能
    this.playerBarracks.forEach(barracks => {
      barracks.disableDragging();
    });

    // 隐藏卖掉区域
    if (this.sellZoneBg && this.sellZoneText) {
      this.sellZoneBg.setVisible(false);
      this.sellZoneText.setVisible(false);
    }

    // 同步当前金币到UI
    this.game.events.emit('GOLD_CHANGED', this.playerGold);

    // 启动敌军波次（兵营会在波次中同步出兵）
    this.spawnEnemyWave(); // 立即开始第一波
    this.waveTimer = this.time.addEvent({
      delay: 8000,
      callback: this.spawnEnemyWave,
      callbackScope: this,
      loop: true
    });

    console.log('Game started! UI communication working.');
  }

  showDamageText(x: number, y: number, damage: number) {
    const text = this.add.text(x, y - 20, `-${damage}`, {
      fontSize: '16px',
      color: '#ff0000',
      fontStyle: 'bold'
    });
    text.setOrigin(0.5);

    // 动画效果：向上飘动并淡出
    this.tweens.add({
      targets: text,
      y: y - 60,
      alpha: 0,
      duration: 1000,
      ease: 'Power2',
      onComplete: () => {
        text.destroy();
      }
    });
  }

  gameOver(won: boolean) {
    this.gameStarted = false;
    this.waveTimer.remove();
    this.game.events.emit('GAME_OVER', won);
  }
}
