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

  playerBaseBarBg!: Phaser.GameObjects.Rectangle;

  playerBaseBarFg!: Phaser.GameObjects.Rectangle;

  enemyBaseBarBg!: Phaser.GameObjects.Rectangle;

  enemyBaseBarFg!: Phaser.GameObjects.Rectangle;

  waveText!: Phaser.GameObjects.Text;

  waveTimer!: Phaser.Time.TimerEvent;

  gameStarted!: boolean;

  currentWave!: number;

  shopLevel!: number;

  currentShop!: string[];

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

    // --- 5. 事件监听 ---
    this.game.events.off('AUTO_BUY_UNIT');
    this.game.events.on('AUTO_BUY_UNIT', this.handleAutoBuyUnit, this);

    this.game.events.off('GAME_START');
    this.game.events.on('GAME_START', this.startGame, this);

    this.game.events.off('REFRESH_SHOP');
    this.game.events.on('REFRESH_SHOP', this.handleRefreshShop, this);

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

    // 启动敌军波次
    this.waveTimer = this.time.addEvent({
      delay: 8000,
      callback: this.spawnEnemyWave,
      callbackScope: this,
      loop: true
    });

    this.gameStarted = false;
    this.currentWave = 0;
    this.initializeShop();

    // 立即开始第一波
    this.spawnEnemyWave();
  }

  createBase(x: number, y: number, label: string, color: number, collidesWith: number) {
    const rect = this.add.rectangle(x, y, 50, 500, color);
    const base = this.matter.add.gameObject(rect, { isStatic: true, label }) as Phaser.Physics.Matter.Sprite;
    base.setCollisionCategory(this.wallCategory);
    base.setCollidesWith([collidesWith]);
    if (label === 'BASE_PLAYER') this.playerBase = base; else this.enemyBase = base;
  }

  checkBaseCollision(baseBody: any, unitObj: any) {
    if (unitObj instanceof Unit) {
      if (baseBody.label === 'BASE_PLAYER' && unitObj.isEnemy) {
        this.playerHp -= 2;
        unitObj.takeDamage(9999);
        this.updateBaseHealthBars();
      } else if (baseBody.label === 'BASE_ENEMY' && !unitObj.isEnemy) {
        this.enemyHp -= 2;
        unitObj.takeDamage(9999);
        this.updateBaseHealthBars();
      }
    }
  }

  // 自动放置逻辑 (对应新版UI)
  handleAutoBuyUnit({ unitKey }: { unitKey: string }) {
    if (this.playerBarracks.length >= 8) return;

    // 自动寻找下一个空位
    const index = this.playerBarracks.length;
    const pos = BARRACKS_POSITIONS[index];

    console.log(`🎯 自动放置: ${unitKey} at (${pos.x}, ${pos.y})`);

    const data = (UNIT_TYPES as any)[unitKey];
    const barracks = new Barracks(this, pos.x, pos.y, unitKey, data);
    this.playerBarracks.push(barracks);

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
    const keys = Object.keys(UNIT_TYPES);
    const shop = [
      keys[Math.floor(Math.random() * keys.length)],
      keys[Math.floor(Math.random() * keys.length)],
      keys[Math.floor(Math.random() * keys.length)]
    ];
    this.currentShop = shop;
    this.game.events.emit('UPDATE_SHOP', shop);
  }

  handleRefreshShop() { this.refreshShop(); }

  update(time: number, delta: number) {
    this.playerUnits.children.each((u: any) => u.update(time, delta));
    this.enemyUnits.children.each((u: any) => u.update(time, delta));
    this.playerBarracks.forEach(b => b.update()); // Barracks sprite update
  }

  calculateSynergies() {
    const counts: any = {};
    this.playerBarracks.forEach(b => b.unitData.factions.forEach((f: string) => counts[f] = (counts[f] || 0) + 1));
    this.game.events.emit('UPDATE_SYNERGY', counts);
  }

  startGame() { this.gameStarted = true; }

  gameOver(won: boolean) {
    this.gameStarted = false;
    this.waveTimer.remove();
    this.game.events.emit('GAME_OVER', won);
  }
}
