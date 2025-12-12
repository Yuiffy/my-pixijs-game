// src/components/autoChessGame/scenes/MainScene.ts
import * as Phaser from 'phaser';
import { UNIT_TYPES, SYNERGIES } from '../config/UnitsData';
import { getWaveEnemies, getWaveInfo } from '../config/WavesData';
import Unit from '../objects/Unit';
import Barracks from '../objects/Barracks';

export default class MainScene extends Phaser.Scene {
  // 物理世界相关
  playerCategory!: number;

  enemyCategory!: number;

  wallCategory!: number;

  // 游戏对象组
  playerUnits!: Phaser.GameObjects.Group;

  enemyUnits!: Phaser.GameObjects.Group;

  playerBarracks!: any[];

  // 基地相关
  playerBase!: Phaser.Physics.Matter.Sprite;

  enemyBase!: Phaser.Physics.Matter.Sprite;

  playerHp!: number;

  enemyHp!: number;

  // UI元素
  playerBaseBarBg!: Phaser.GameObjects.Rectangle;

  playerBaseBarFg!: Phaser.GameObjects.Rectangle;

  enemyBaseBarBg!: Phaser.GameObjects.Rectangle;

  enemyBaseBarFg!: Phaser.GameObjects.Rectangle;

  waveText!: Phaser.GameObjects.Text;

  // 游戏状态
  waveTimer!: Phaser.Time.TimerEvent;

  gameStarted!: boolean;

  currentWave!: number;

  shopLevel!: number;

  currentShop!: string[];

  constructor() {
    super('MainScene');
  }

  create() {
    // 提前生成所有单位和兵营的纹理
    Object.values(UNIT_TYPES).forEach((unitData: any) => {
      // 生成单位纹理
      if (!this.textures.exists(unitData.textureKey)) {
        Unit.createTexture(this, unitData);
      }
      // 生成兵营纹理
      if (!this.textures.exists(`${unitData.textureKey}_barracks`)) {
        Barracks.createBarracksTexture(this, unitData);
      }
    });

    // --- 1. 物理世界设置 ---
    this.matter.world.setBounds(0, 0, 1000, 600);
    this.playerCategory = this.matter.world.nextCategory();
    this.enemyCategory = this.matter.world.nextCategory();
    this.wallCategory = this.matter.world.nextCategory();

    // --- 2. 组管理 ---
    this.playerUnits = this.add.group();
    this.enemyUnits = this.add.group();
    this.playerBarracks = []; // 存放已放置的兵营

    // --- 3. 基地设置 ---
    // 创建玩家基地 - 先创建游戏对象，再添加物理
    const playerBaseRect = this.add.rectangle(50, 300, 50, 500, 0x00ff00);
    this.playerBase = this.matter.add.gameObject(playerBaseRect, {
      isStatic: true,
      label: 'BASE_PLAYER'
    }) as Phaser.Physics.Matter.Sprite;
    this.playerBase.setCollisionCategory(this.wallCategory);
    this.playerBase.setCollidesWith([this.enemyCategory]);

    // 创建敌方基地
    const enemyBaseRect = this.add.rectangle(950, 300, 50, 500, 0xff0000);
    this.enemyBase = this.matter.add.gameObject(enemyBaseRect, {
      isStatic: true,
      label: 'BASE_ENEMY'
    }) as Phaser.Physics.Matter.Sprite;
    this.enemyBase.setCollisionCategory(this.wallCategory);
    this.enemyBase.setCollidesWith([this.playerCategory]);

    // 基地血条
    this.playerHp = 100;
    this.enemyHp = 100;

    // 创建基地血条
    this.createBaseHealthBars();

    // --- 4. 游戏循环逻辑 ---
    // 监听来自 React UI 的事件 (比如买兵、升级)
    this.game.events.on('PLACE_UNIT', this.handlePlaceUnit, this);
    this.game.events.on('GAME_START', this.startGame, this);
    this.game.events.on('REFRESH_SHOP', this.handleRefreshShop, this);

    // 碰撞伤害逻辑
    this.matter.world.on('collisionstart', (event) => {
      event.pairs.forEach(pair => {
        const { bodyA } = pair;
        const { bodyB } = pair;

        // 检查是否是单位之间的碰撞
        const gameObjA = bodyA.gameObject;
        const gameObjB = bodyB.gameObject;

        if (gameObjA instanceof Unit && gameObjB instanceof Unit && gameObjA.isEnemy !== gameObjB.isEnemy) {
          // 敌对单位碰撞，根据动能造成伤害
          const kineticEnergy = (bodyA.speed * bodyA.speed + bodyB.speed * bodyB.speed) * 0.5;
          const damage = Math.floor(kineticEnergy * 2);

          if (damage > 0) {
            gameObjA.takeDamage(damage * 0.5);
            gameObjB.takeDamage(damage * 0.5);
          }
        }

        // 检查是否撞到基地
        if (bodyA.label === 'BASE_PLAYER' && gameObjB instanceof Unit && gameObjB.isEnemy) {
          this.playerHp -= 1;
          gameObjB.takeDamage(9999); // 撞基地的敌人直接死亡
          this.updateBaseHealthBars();
        }
        if (bodyB.label === 'BASE_PLAYER' && gameObjA instanceof Unit && gameObjA.isEnemy) {
          this.playerHp -= 1;
          gameObjA.takeDamage(9999);
          this.updateBaseHealthBars();
        }

        if (bodyA.label === 'BASE_ENEMY' && gameObjB instanceof Unit && !gameObjB.isEnemy) {
          this.enemyHp -= 1;
          gameObjB.takeDamage(9999);
          this.updateBaseHealthBars();
        }
        if (bodyB.label === 'BASE_ENEMY' && gameObjA instanceof Unit && !gameObjA.isEnemy) {
          this.enemyHp -= 1;
          gameObjA.takeDamage(9999);
          this.updateBaseHealthBars();
        }
      });
    });

    // 启动敌军波次 (简单版：每10秒一大波)
    this.waveTimer = this.time.addEvent({
      delay: 10000,
      callback: this.spawnEnemyWave,
      callbackScope: this,
      loop: true
    });

    // 游戏状态
    this.gameStarted = false;
    this.currentWave = 0;

    // 初始化商店
    this.initializeShop();
  }

  createBaseHealthBars() {
    // 玩家基地血条
    this.playerBaseBarBg = this.add.rectangle(25, 550, 40, 8, 0x000000);
    this.playerBaseBarBg.setStrokeStyle(1, 0xffffff);
    this.playerBaseBarFg = this.add.rectangle(25, 550, 40, 8, 0x00ff00);

    // 敌方基地血条
    this.enemyBaseBarBg = this.add.rectangle(975, 550, 40, 8, 0x000000);
    this.enemyBaseBarBg.setStrokeStyle(1, 0xffffff);
    this.enemyBaseBarFg = this.add.rectangle(975, 550, 40, 8, 0xff0000);

    this.updateBaseHealthBars();
  }

  updateBaseHealthBars() {
    // 更新玩家基地血条
    const playerHealthPercent = this.playerHp / 100;
    this.playerBaseBarFg.width = 40 * playerHealthPercent;
    this.playerBaseBarFg.x = 25 - (40 - this.playerBaseBarFg.width) / 2;

    // 更新敌方基地血条
    const enemyHealthPercent = this.enemyHp / 100;
    this.enemyBaseBarFg.width = 40 * enemyHealthPercent;
    this.enemyBaseBarFg.x = 975 - (40 - this.enemyBaseBarFg.width) / 2;

    // 检查游戏结束
    if (this.playerHp <= 0) {
      this.gameOver(false);
    }
    if (this.enemyHp <= 0) {
      this.gameOver(true);
    }
  }

  initializeShop() {
    // 初始化商店数据
    this.shopLevel = 1;
    this.refreshShop();
  }

  refreshShop() {
    // 简单随机逻辑：根据等级随机选单位
    const availableUnits = Object.keys(UNIT_TYPES).filter(key => {
      return UNIT_TYPES[key].tier <= this.shopLevel;
    });

    const newShop = [];
    for (let i = 0; i < 3; i++) {
      const randomIndex = Math.floor(Math.random() * availableUnits.length);
      newShop.push(availableUnits[randomIndex]);
    }

    this.currentShop = newShop;
    this.game.events.emit('UPDATE_SHOP', newShop);
  }

  handleRefreshShop() {
    this.refreshShop();
  }

  update(time, delta) {
    // 调用所有单位的 update
    this.playerUnits.children.each(u => u.update(time, delta));
    this.enemyUnits.children.each(u => u.update(time, delta));

    // 更新兵营
    this.playerBarracks.forEach(b => b.update());

    // 显示当前波数和时间
    if (!this.waveText) {
      this.waveText = this.add.text(500, 20, `Wave: ${this.currentWave}`, {
        fontSize: '20px',
        color: '#ffffff'
      });
      this.waveText.setOrigin(0.5);
    }

    if (this.waveTimer) {
      const timeLeft = Math.ceil((this.waveTimer.delay - this.waveTimer.elapsed) / 1000);
      this.waveText.setText(`Wave: ${this.currentWave} | Next: ${timeLeft}s`);
    }
  }

  // 处理玩家从商店买了兵，拖放到地图上的逻辑
  handlePlaceUnit({ unitKey, x, y }: { unitKey: string; x: number; y: number }) {
    console.log('🎯 MainScene: handlePlaceUnit called with', { unitKey, x, y });

    if (this.playerBarracks.length >= 8) {
      console.log('❌ 人口已满！');
      return;
    }

    const data = UNIT_TYPES[unitKey];
    if (!data) {
      console.log('❌ Unit data not found for key:', unitKey);
      return;
    }

    console.log('✅ Creating barracks at', x, y, 'for unit', unitKey);
    const barracks = new Barracks(this, x, y, unitKey, data);
    this.playerBarracks.push(barracks);
    console.log('Barracks object created:', barracks, 'visible:', barracks.visible, 'alpha:', barracks.alpha);

    // 计算羁绊
    this.calculateSynergies();

    // 通知UI更新
    this.game.events.emit('BARRACKS_PLACED', this.playerBarracks.length);
    console.log('🎉 Barracks placed successfully! Total barracks:', this.playerBarracks.length);
  }

  calculateSynergies() {
    const counts = {};
    this.playerBarracks.forEach(b => {
      b.unitData.factions.forEach(f => {
        counts[f] = (counts[f] || 0) + 1;
      });
    });

    // 应用羁绊效果
    Object.keys(counts).forEach(faction => {
      const synergyLevels = SYNERGIES[faction];
      if (synergyLevels) {
        Object.keys(synergyLevels).forEach(levelStr => {
          const level = parseInt(levelStr);
          if (counts[faction] >= level) {
            synergyLevels[level].effect(this);
          }
        });
      }
    });

    // 将羁绊数据发送回 React UI 显示
    this.game.events.emit('UPDATE_SYNERGY', counts);
  }

  spawnEnemyWave() {
    this.currentWave++;

    // 使用预设波次数据
    const waveInfo = getWaveInfo(this.currentWave);
    if (waveInfo) {
      const enemies = getWaveEnemies(this.currentWave);

      enemies.forEach((enemyData, index) => {
        const unit = new Unit(this, 900, 100 + (index % 10) * 50, enemyData, true);
        this.enemyUnits.add(unit);
      });

      // 显示波次信息
      this.showWaveInfo(waveInfo);
    } else {
      // 如果没有预设数据，使用随机生成（无限模式）
      const enemyCount = Math.min(5 + this.currentWave, 15);
      const enemyTypes = Object.keys(UNIT_TYPES);

      for (let i = 0; i < enemyCount; i++) {
        const randomType = enemyTypes[Math.floor(Math.random() * enemyTypes.length)];
        const unitData = UNIT_TYPES[randomType];

        const unit = new Unit(this, 900, 100 + i * 40, unitData, true);
        this.enemyUnits.add(unit);
      }
    }

    // 每3波增加商店等级
    if (this.currentWave % 3 === 0 && this.shopLevel < 5) {
      this.shopLevel++;
      this.game.events.emit('SHOP_LEVEL_UP', this.shopLevel);
    }
  }

  showWaveInfo(waveInfo) {
    // 显示波次信息提示
    const waveText = this.add.text(500, 300, `第 ${waveInfo.waveNumber} 波`, {
      fontSize: '36px',
      color: '#ff0000'
    });
    waveText.setOrigin(0.5);

    const descText = this.add.text(500, 350, waveInfo.description, {
      fontSize: '18px',
      color: '#ffffff'
    });
    descText.setOrigin(0.5);

    // 3秒后淡出
    this.time.delayedCall(3000, () => {
      this.tweens.add({
        targets: [waveText, descText],
        alpha: 0,
        duration: 1000,
        onComplete: () => {
          waveText.destroy();
          descText.destroy();
        }
      });
    });
  }

  showDamageText(x, y, damage) {
    const text = this.add.text(x, y, `-${damage}`, {
      fontSize: '16px',
      color: '#ff0000'
    });
    text.setOrigin(0.5);

    this.tweens.add({
      targets: text,
      y: y - 40,
      alpha: 0,
      duration: 800,
      onComplete: () => text.destroy()
    });
  }

  gameOver(playerWon) {
    // 停止游戏
    this.waveTimer.remove();
    this.gameStarted = false;

    // 显示游戏结束信息
    const gameOverText = playerWon ? '胜利！' : '失败！';
    const resultText = this.add.text(500, 300, gameOverText, {
      fontSize: '48px',
      color: playerWon ? '#00ff00' : '#ff0000'
    });
    resultText.setOrigin(0.5);

    // 通知React UI
    this.game.events.emit('GAME_OVER', playerWon);
  }

  startGame() {
    this.gameStarted = true;
    // 可以在这里添加游戏开始的逻辑
  }
}
