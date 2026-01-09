// src/components/autoChessGame/scenes/MainScene.ts
import * as Phaser from 'phaser';
import { UNIT_TYPES, UnitData } from '../config/UnitsData';
import { GameConfig } from '../config/GameConfig';
import Unit from '../objects/Unit';
import Barracks from '../objects/Barracks';
import WaveManager from '../systems/WaveManager';
import { EconomyManager } from '../systems/EconomyManager';
import { SynergySystem } from '../systems/SynergySystem';

export default class MainScene extends Phaser.Scene {
  playerCategory!: number;
  enemyCategory!: number;
  wallCategory!: number;
  playerUnits!: Phaser.GameObjects.Group;
  enemyUnits!: Phaser.GameObjects.Group;
  playerBarracks: Barracks[] = [];
  playerBase!: Phaser.Physics.Matter.Sprite;
  enemyBase!: Phaser.Physics.Matter.Sprite;

  // 游戏状态
  playerHp!: number;
  enemyHp!: number;
  gameStarted!: boolean;

  // UI 组件
  playerBaseBarFg!: Phaser.GameObjects.Rectangle;
  enemyBaseBarFg!: Phaser.GameObjects.Rectangle;
  notStartedText!: Phaser.GameObjects.Text;
  sellZone!: Phaser.GameObjects.Zone;
  sellZoneText!: Phaser.GameObjects.Text;
  sellZoneBg!: Phaser.GameObjects.Rectangle;

  // 系统管理器
  waveManager!: WaveManager;
  economyManager!: EconomyManager;
  synergySystem!: SynergySystem;

  constructor() {
    super('MainScene');
  }

  create() {
    console.log('=== MainScene Refactored Loaded ===');

    // --- 1. 资源准备 ---
    Object.values(UNIT_TYPES).forEach((unitData: UnitData) => {
      if (!this.textures.exists(unitData.textureKey)) {
        Unit.createTexture(this, unitData);
      }
    });

    // --- 2. 物理世界 ---
    this.matter.world.setBounds(0, 0, GameConfig.width, GameConfig.height);
    this.playerCategory = this.matter.world.nextCategory();
    this.enemyCategory = this.matter.world.nextCategory();
    this.wallCategory = this.matter.world.nextCategory();

    // --- 3. 组管理 ---
    this.playerUnits = this.add.group();
    this.enemyUnits = this.add.group();
    this.playerBarracks = [];

    // --- 4. 基地 ---
    const { player, enemy } = GameConfig.baseStats;
    this.createBase(player.x, player.y, player.label, player.color, this.enemyCategory);
    this.createBase(enemy.x, enemy.y, enemy.label, enemy.color, this.playerCategory);
    this.createBaseHealthBars();

    this.playerHp = GameConfig.initialHp;
    this.enemyHp = GameConfig.initialHp;

    // --- 5. 初始化管理器 ---
    this.waveManager = new WaveManager(this);
    this.economyManager = new EconomyManager(this);
    this.synergySystem = new SynergySystem(this);

    // --- 6. 事件监听 ---
    this.game.events.off('AUTO_BUY_UNIT');
    this.game.events.on('AUTO_BUY_UNIT', this.handleAutoBuyUnit, this);

    this.game.events.on('GAME_START', this.startGame, this);

    // 监听碰撞
    this.matter.world.on('collisionstart', this.handleCollision, this);

    this.gameStarted = false;

    // 创建卖掉区域
    this.createSellZone();

    // 未开始提示
    this.notStartedText = this.add.text(500, 300, '点击"开始战斗"开始游戏', {
      fontSize: '24px',
      color: '#ffffff',
      backgroundColor: '#000000',
      padding: { x: 10, y: 5 }
    }).setOrigin(0.5).setDepth(2000);

    // 发出 ready 事件
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
    const { x, y, width, height } = GameConfig.sellZone;
    this.sellZone = this.add.zone(x, y, width, height);
    this.sellZone.setDepth(1000);

    this.sellZoneBg = this.add.rectangle(x, y, width, height, 0xff0000, 0.3);
    this.sellZoneBg.setStrokeStyle(3, 0xff0000);
    this.sellZoneBg.setDepth(999);

    this.sellZoneText = this.add.text(x, y, '卖掉\n兵营', {
      fontSize: '20px',
      color: '#ffffff',
      fontStyle: 'bold',
      align: 'center'
    }).setOrigin(0.5).setDepth(1001);

    this.sellZoneBg.setVisible(false);
    this.sellZoneText.setVisible(false);
  }

  // 这里的类型 Barracks 需要确保被正确导入
  sellBarracks(barracks: Barracks) {
    const { unitData } = barracks;
    const refundGold = unitData.cost || 1;

    const index = this.playerBarracks.indexOf(barracks);
    if (index > -1) {
      this.playerBarracks.splice(index, 1);
    }

    // 通过管理器加钱
    this.economyManager.addGold(refundGold);
    console.log(`💰 Sold barracks, refunded ${refundGold} gold.`);

    barracks.destroy();

    // 更新羁绊
    this.updateSynergies();

    this.game.events.emit('BARRACKS_PLACED', this.playerBarracks.length);
  }

  private handleCollision(event: any) {
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
  }

  checkBaseCollision(baseBody: any, unitObj: any) {
    if (unitObj instanceof Unit) {
      const { now } = this.time;
      if (!unitObj.lastBaseAttackTime) unitObj.lastBaseAttackTime = 0;
      if (now - unitObj.lastBaseAttackTime < 1000) return;

      if (baseBody.label === 'BASE_PLAYER' && unitObj.isEnemy) {
        this.playerHp -= 1;
        unitObj.lastBaseAttackTime = now;
        this.updateBaseHealthBars();
      } else if (baseBody.label === 'BASE_ENEMY' && !unitObj.isEnemy) {
        this.enemyHp -= 1;
        unitObj.lastBaseAttackTime = now;
        this.updateBaseHealthBars();
      }
    }
  }

  handleAutoBuyUnit({ unitKey }: { unitKey: string }) {
    if (this.playerBarracks.length >= 8) return;

    const index = this.playerBarracks.length;
    const pos = GameConfig.barracksPositions[index];

    const data = UNIT_TYPES[unitKey];
    if (!data) return;

    const barracks = new Barracks(this, pos.x, pos.y, unitKey, data);
    this.playerBarracks.push(barracks);

    this.updateSynergies();
    this.game.events.emit('BARRACKS_PLACED', this.playerBarracks.length);
  }

  private updateSynergies() {
    const counts = this.synergySystem.calculateSynergies(this.playerBarracks);
    this.game.events.emit('UPDATE_SYNERGY', counts);
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

  update(time: number, delta: number) {
    this.playerUnits.children.each((u: any) => u.update(time, delta));
    this.enemyUnits.children.each((u: any) => u.update(time, delta));
    this.playerBarracks.forEach(b => b.update());
  }

  startGame() {
    this.gameStarted = true;
    if (this.notStartedText) this.notStartedText.destroy();

    this.playerBarracks.forEach(barracks => barracks.disableDragging());
    this.sellZoneBg.setVisible(false);
    this.sellZoneText.setVisible(false);

    // 强制同步一次金币
    this.economyManager.addGold(0);

    this.waveManager.start();
    console.log('Game started!');
  }

  gameOver(won: boolean) {
    this.gameStarted = false;
    this.waveManager.stop();
    this.game.events.emit('GAME_OVER', won);
  }

  // 辅助方法
  isInSellZone(x: number, y: number): boolean {
    if (!this.sellZone) return false;
    const bounds = this.sellZone.getBounds();
    return x >= bounds.x - bounds.width / 2 && x <= bounds.x + bounds.width / 2 &&
           y >= bounds.y - bounds.height / 2 && y <= bounds.y + bounds.height / 2;
  }
}
