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
    // 1. 预生成单位纹理 (Unit 还是需要纹理的，因为它用的是 Sprite)
    Object.values(UNIT_TYPES).forEach((unitData: any) => {
      if (!this.textures.exists(unitData.textureKey)) {
        Unit.createTexture(this, unitData);
      }
    });

    // 2. 物理世界
    this.matter.world.setBounds(0, 0, 1000, 600);
    this.playerCategory = this.matter.world.nextCategory();
    this.enemyCategory = this.matter.world.nextCategory();
    this.wallCategory = this.matter.world.nextCategory();

    // 3. 组
    this.playerUnits = this.add.group();
    this.enemyUnits = this.add.group();
    this.playerBarracks = [];

    // 4. 基地 (Base)
    const playerBaseRect = this.add.rectangle(50, 300, 50, 500, 0x00ff00);
    this.playerBase = this.matter.add.gameObject(playerBaseRect, {
      isStatic: true,
      label: 'BASE_PLAYER'
    }) as Phaser.Physics.Matter.Sprite;
    this.playerBase.setCollisionCategory(this.wallCategory);
    this.playerBase.setCollidesWith([this.enemyCategory]);

    const enemyBaseRect = this.add.rectangle(950, 300, 50, 500, 0xff0000);
    this.enemyBase = this.matter.add.gameObject(enemyBaseRect, {
      isStatic: true,
      label: 'BASE_ENEMY'
    }) as Phaser.Physics.Matter.Sprite;
    this.enemyBase.setCollisionCategory(this.wallCategory);
    this.enemyBase.setCollidesWith([this.playerCategory]);

    this.playerHp = 100;
    this.enemyHp = 100;
    this.createBaseHealthBars();

    // 5. 事件监听
    this.game.events.on('PLACE_UNIT', this.handlePlaceUnit, this);
    this.game.events.on('GAME_START', this.startGame, this);
    this.game.events.on('REFRESH_SHOP', this.handleRefreshShop, this);

    // 6. 碰撞处理
    this.matter.world.on('collisionstart', (event: any) => {
      event.pairs.forEach((pair: any) => {
        const { bodyA, bodyB } = pair;
        const gameObjA = bodyA.gameObject;
        const gameObjB = bodyB.gameObject;

        // 单位互殴
        if (gameObjA instanceof Unit && gameObjB instanceof Unit && gameObjA.isEnemy !== gameObjB.isEnemy) {
          const kineticEnergy = (bodyA.speed * bodyA.speed + bodyB.speed * bodyB.speed) * 0.5;
          const damage = Math.max(1, Math.floor(kineticEnergy * 2));
          gameObjA.takeDamage(damage * 0.5);
          gameObjB.takeDamage(damage * 0.5);
        }

        // 撞基地
        this.handleBaseCollision(bodyA, gameObjB);
        this.handleBaseCollision(bodyB, gameObjA);
      });
    });

    // 7. 定时刷怪
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

  // 辅助：处理撞基地逻辑
  handleBaseCollision(baseBody: any, unitObj: any) {
    if (unitObj instanceof Unit) {
      if (baseBody.label === 'BASE_PLAYER' && unitObj.isEnemy) {
        this.playerHp -= 5; // 伤害调高点，让玩家有感觉
        unitObj.takeDamage(9999);
        this.cameras.main.shake(100, 0.01); // 基地被打震动一下
        this.updateBaseHealthBars();
      } else if (baseBody.label === 'BASE_ENEMY' && !unitObj.isEnemy) {
        this.enemyHp -= 5;
        unitObj.takeDamage(9999);
        this.updateBaseHealthBars();
      }
    }
  }

  // 放置兵营 (关键逻辑)
  handlePlaceUnit({ unitKey, x, y }: { unitKey: string; x: number; y: number }) {
    console.log(`[MainScene] 收到放置请求: ${unitKey} at (${x}, ${y})`);

    // 双重检查上限
    if (this.playerBarracks.length >= 8) {
      console.log('[MainScene] 兵营已满，取消放置');
      return;
    }

    const data = (UNIT_TYPES as any)[unitKey];
    if (!data) return;

    // 创建兵营 (现在 Barracks 是 Container，必定可见)
    const barracks = new Barracks(this, x, y, unitKey, data);
    this.playerBarracks.push(barracks);

    this.calculateSynergies();

    // 反馈给UI
    this.game.events.emit('BARRACKS_PLACED', this.playerBarracks.length);
  }

  // ... (其他方法保持不变：createBaseHealthBars, updateBaseHealthBars, initializeShop, refreshShop, update, showWaveInfo, showDamageText, gameOver, startGame, spawnEnemyWave, calculateSynergies)

  createBaseHealthBars() {
    this.playerBaseBarBg = this.add.rectangle(25, 550, 40, 8, 0x000000).setStrokeStyle(1, 0xffffff);
    this.playerBaseBarFg = this.add.rectangle(25, 550, 40, 8, 0x00ff00);
    this.enemyBaseBarBg = this.add.rectangle(975, 550, 40, 8, 0x000000).setStrokeStyle(1, 0xffffff);
    this.enemyBaseBarFg = this.add.rectangle(975, 550, 40, 8, 0xff0000);
    this.updateBaseHealthBars();
  }

  updateBaseHealthBars() {
    const playerHealthPercent = Math.max(0, this.playerHp / 100);
    this.playerBaseBarFg.width = 40 * playerHealthPercent;
    this.playerBaseBarFg.x = 25 - (40 - this.playerBaseBarFg.width) / 2;

    const enemyHealthPercent = Math.max(0, this.enemyHp / 100);
    this.enemyBaseBarFg.width = 40 * enemyHealthPercent;
    this.enemyBaseBarFg.x = 975 - (40 - this.enemyBaseBarFg.width) / 2;

    if (this.playerHp <= 0) this.gameOver(false);
    if (this.enemyHp <= 0) this.gameOver(true);
  }

  initializeShop() {
    this.shopLevel = 1;
    this.refreshShop();
  }

  refreshShop() {
    const availableUnits = Object.keys(UNIT_TYPES).filter(key => (UNIT_TYPES as any)[key].tier <= this.shopLevel);
    const newShop = [];
    for (let i = 0; i < 3; i++) {
      newShop.push(availableUnits[Math.floor(Math.random() * availableUnits.length)]);
    }
    this.currentShop = newShop;
    this.game.events.emit('UPDATE_SHOP', newShop);
  }

  handleRefreshShop() { this.refreshShop(); }

  update(time: number, delta: number) {
    this.playerUnits.children.each((u: any) => u.update(time, delta));
    this.enemyUnits.children.each((u: any) => u.update(time, delta));
    this.playerBarracks.forEach(b => b.update());

    if (!this.waveText) {
      this.waveText = this.add.text(500, 20, '', { fontSize: '20px', color: '#ffffff' }).setOrigin(0.5);
    }
    if (this.waveTimer) {
      const timeLeft = Math.ceil((this.waveTimer.delay - this.waveTimer.elapsed) / 1000);
      this.waveText.setText(`Wave: ${this.currentWave} | Next: ${timeLeft}s`);
    }
  }

  spawnEnemyWave() {
    this.currentWave++;
    const waveInfo = getWaveInfo(this.currentWave);
    const enemies = waveInfo ? getWaveEnemies(this.currentWave) : [];

    if (enemies.length === 0) {
      // 无限模式逻辑
      const count = Math.min(this.currentWave + 2, 10);
      for (let i = 0; i < count; i++) {
        const types = Object.keys(UNIT_TYPES);
        const type = types[Math.floor(Math.random() * types.length)];
        const uData = (UNIT_TYPES as any)[type];
        const unit = new Unit(this, 900, 100 + Math.random() * 400, uData, true);
        this.enemyUnits.add(unit);
      }
    } else {
      enemies.forEach((data: any, i: number) => {
        const unit = new Unit(this, 900, 100 + (i * 60) % 400, data, true);
        this.enemyUnits.add(unit);
      });
      this.showWaveInfo(waveInfo);
    }

    if (this.currentWave % 3 === 0 && this.shopLevel < 5) {
      this.shopLevel++;
      this.game.events.emit('SHOP_LEVEL_UP', this.shopLevel);
    }
  }

  showWaveInfo(info: any) {
    const txt = this.add.text(500, 300, `Wave ${info.waveNumber}: ${info.description}`, { fontSize: '32px', color: '#ffaa00', stroke: '#000', strokeThickness: 4 }).setOrigin(0.5);
    this.tweens.add({ targets: txt, alpha: 0, duration: 2000, delay: 1000, onComplete: () => txt.destroy() });
  }

  showDamageText(x: number, y: number, damage: number) {
    const txt = this.add.text(x, y - 20, `-${damage}`, { fontSize: '14px', color: '#ff0000' }).setOrigin(0.5);
    this.tweens.add({ targets: txt, y: y - 50, alpha: 0, duration: 800, onComplete: () => txt.destroy() });
  }

  gameOver(won: boolean) {
    this.gameStarted = false;
    this.waveTimer.remove();
    this.game.events.emit('GAME_OVER', won);
  }

  startGame() { this.gameStarted = true; }

  calculateSynergies() {
    const counts: any = {};
    this.playerBarracks.forEach(b => {
      b.unitData.factions.forEach((f: string) => counts[f] = (counts[f] || 0) + 1);
    });
    // Apply logic...
    this.game.events.emit('UPDATE_SYNERGY', counts);
  }
}
