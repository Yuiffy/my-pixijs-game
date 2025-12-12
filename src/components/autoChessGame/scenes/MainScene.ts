// src/components/autoChessGame/scenes/MainScene.ts
import * as Phaser from 'phaser';
import { UNIT_TYPES, SYNERGIES } from '../config/UnitsData';
import { getWaveEnemies, getWaveInfo } from '../config/WavesData';
import Unit from '../objects/Unit';
import Barracks from '../objects/Barracks';

export default class MainScene extends Phaser.Scene {
  playerCategory!: number;

  enemyCategory!: number;

  wallCategory!: number;

  playerUnits!: Phaser.GameObjects.Group;

  enemyUnits!: Phaser.GameObjects.Group;

  playerBarracks!: any[];

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
    console.log('=== MainScene Created ===');

    // 1. 强制生成单位纹理 (防止 Unit 隐形)
    // 我们先删除旧的（如果有），再重新生成，确保当前 Scene 能用
    Object.values(UNIT_TYPES).forEach((unitData: any) => {
      if (this.textures.exists(unitData.textureKey)) {
        this.textures.remove(unitData.textureKey);
      }
      Unit.createTexture(this, unitData);
    });

    // 2. 物理世界
    this.matter.world.setBounds(0, 0, 1000, 600);
    this.playerCategory = this.matter.world.nextCategory();
    this.enemyCategory = this.matter.world.nextCategory();
    this.wallCategory = this.matter.world.nextCategory();

    // 3. 对象组
    this.playerUnits = this.add.group();
    this.enemyUnits = this.add.group();
    this.playerBarracks = [];

    // 4. 基地
    this.createBase(50, 300, 'BASE_PLAYER', 0x00ff00, this.enemyCategory);
    this.createBase(950, 300, 'BASE_ENEMY', 0xff0000, this.playerCategory);

    this.playerHp = 100;
    this.enemyHp = 100;
    this.createBaseHealthBars();

    // 5. 事件监听
    this.game.events.off('PLACE_UNIT'); // 防止重复绑定
    this.game.events.on('PLACE_UNIT', this.handlePlaceUnit, this);

    this.game.events.off('GAME_START');
    this.game.events.on('GAME_START', this.startGame, this);

    this.game.events.off('REFRESH_SHOP');
    this.game.events.on('REFRESH_SHOP', this.handleRefreshShop, this);

    // 6. 碰撞处理
    this.matter.world.on('collisionstart', (event: any) => {
      event.pairs.forEach((pair: any) => {
        const { bodyA, bodyB } = pair;
        const gameObjA = bodyA.gameObject;
        const gameObjB = bodyB.gameObject;

        if (gameObjA instanceof Unit && gameObjB instanceof Unit && gameObjA.isEnemy !== gameObjB.isEnemy) {
          const damage = 5; // 简化伤害计算，确保有伤害
          gameObjA.takeDamage(damage);
          gameObjB.takeDamage(damage);
        }

        // 基地碰撞逻辑
        this.checkBaseCollision(bodyA, gameObjB);
        this.checkBaseCollision(bodyB, gameObjA);
      });
    });

    // 7. 刷怪定时器
    this.waveTimer = this.time.addEvent({
      delay: 10000,
      callback: this.spawnEnemyWave,
      callbackScope: this,
      loop: true
    });

    this.gameStarted = false;
    this.currentWave = 0;
    this.initializeShop();
  }

  createBase(x: number, y: number, label: string, color: number, collidesWith: number) {
    const rect = this.add.rectangle(x, y, 50, 500, color);
    const base = this.matter.add.gameObject(rect, {
      isStatic: true,
      label
    }) as Phaser.Physics.Matter.Sprite;

    if (label === 'BASE_PLAYER') this.playerBase = base;
    else this.enemyBase = base;

    base.setCollisionCategory(this.wallCategory);
    base.setCollidesWith([collidesWith]);
  }

  checkBaseCollision(baseBody: any, unitObj: any) {
    if (unitObj instanceof Unit) {
      if (baseBody.label === 'BASE_PLAYER' && unitObj.isEnemy) {
        this.playerHp -= 10;
        unitObj.takeDamage(9999);
        this.updateBaseHealthBars();
      } else if (baseBody.label === 'BASE_ENEMY' && !unitObj.isEnemy) {
        this.enemyHp -= 10;
        unitObj.takeDamage(9999);
        this.updateBaseHealthBars();
      }
    }
  }

  handlePlaceUnit({ unitKey, x, y }: { unitKey: string; x: number; y: number }) {
    console.log(`🎯 [MainScene] 放置请求: ${unitKey} @ (${x}, ${y})`);

    if (this.playerBarracks.length >= 8) {
      console.log('❌ 兵营已满，忽略请求');
      return;
    }

    const data = (UNIT_TYPES as any)[unitKey];
    // 使用新的 Container 类兵营
    const barracks = new Barracks(this, x, y, unitKey, data);
    this.playerBarracks.push(barracks);

    this.calculateSynergies();
    this.game.events.emit('BARRACKS_PLACED', this.playerBarracks.length);
  }

  // ... (其他标准方法: update, gameOver, refreshShop 等保持原有逻辑即可) ...
  // 为了确保文件完整性，这里补全剩余关键方法

  update(time: number, delta: number) {
    this.playerUnits?.children.each((u: any) => u.update(time, delta));
    this.enemyUnits?.children.each((u: any) => u.update(time, delta));
    this.playerBarracks.forEach(b => b.update());

    if (!this.waveText) {
      this.waveText = this.add.text(500, 20, '', { fontSize: '20px', color: '#fff' }).setOrigin(0.5);
    }
    if (this.waveTimer) {
      const next = Math.ceil((this.waveTimer.delay - this.waveTimer.elapsed) / 1000);
      this.waveText.setText(`Wave: ${this.currentWave} | Next: ${next}s`);
    }
  }

  calculateSynergies() {
    const counts: any = {};
    this.playerBarracks.forEach(b => {
      b.unitData.factions.forEach((f: string) => counts[f] = (counts[f] || 0) + 1);
    });
    this.game.events.emit('UPDATE_SYNERGY', counts);
  }

  initializeShop() { this.shopLevel = 1; this.refreshShop(); }

  refreshShop() {
    const units = Object.keys(UNIT_TYPES).filter(k => (UNIT_TYPES as any)[k].tier <= this.shopLevel);
    const shop = Array(3).fill(0).map(() => units[Math.floor(Math.random() * units.length)]);
    this.currentShop = shop;
    this.game.events.emit('UPDATE_SHOP', shop);
  }

  handleRefreshShop() { this.refreshShop(); }

  spawnEnemyWave() {
    this.currentWave++;
    // 简单的刷怪逻辑
    for (let i = 0; i < 3 + this.currentWave; i++) {
      const enemy = new Unit(this, 950, 100 + Math.random() * 400, (UNIT_TYPES as any).sui_warrior, true);
      this.enemyUnits.add(enemy);
    }
    if (this.currentWave % 3 === 0 && this.shopLevel < 5) {
      this.shopLevel++;
      this.game.events.emit('SHOP_LEVEL_UP', this.shopLevel);
    }
  }

  startGame() { this.gameStarted = true; }

  createBaseHealthBars() {
    this.playerBaseBarBg = this.add.rectangle(25, 550, 40, 8, 0x000000).setStrokeStyle(1, 0xffffff);
    this.playerBaseBarFg = this.add.rectangle(25, 550, 40, 8, 0x00ff00);
    this.enemyBaseBarBg = this.add.rectangle(975, 550, 40, 8, 0x000000).setStrokeStyle(1, 0xffffff);
    this.enemyBaseBarFg = this.add.rectangle(975, 550, 40, 8, 0xff0000);
    this.updateBaseHealthBars();
  }

  updateBaseHealthBars() {
    this.playerBaseBarFg.width = 40 * (Math.max(0, this.playerHp) / 100);
    this.enemyBaseBarFg.width = 40 * (Math.max(0, this.enemyHp) / 100);
    if (this.playerHp <= 0) this.gameOver(false);
  }

  gameOver(won: boolean) {
    this.gameStarted = false;
    this.waveTimer.remove();
    this.game.events.emit('GAME_OVER', won);
  }
}
