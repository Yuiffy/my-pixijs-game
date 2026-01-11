// src/components/autoChessGame/scenes/MainScene.ts
import * as Phaser from 'phaser';
import { UNIT_TYPES, UnitData } from '../config/UnitsData';
import { GameConfig } from '../config/GameConfig';
import { GamePhase } from '../types/GamePhase';
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
  currentPhase!: GamePhase;
  currentRound!: number;
  battleTimer!: Phaser.Time.TimerEvent | null;

  // UI 组件
  playerHpText!: Phaser.GameObjects.Text;
  enemyHpText!: Phaser.GameObjects.Text;
  phaseText!: Phaser.GameObjects.Text;
  roundText!: Phaser.GameObjects.Text;
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
    console.warn('🚨 === MainScene Refactored Loaded ===');
    console.warn('🚨 🔧 调试：MainScene create() 被调用');
    console.log('=== MainScene Refactored Loaded ===');
    console.log('🔧 调试：MainScene create() 被调用');

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

    this.playerHp = GameConfig.playerInitialHp;
    this.enemyHp = GameConfig.enemyInitialHp;

    this.createBaseHealthBars();

    // --- 5. 初始化管理器 ---
    this.waveManager = new WaveManager(this);
    this.economyManager = new EconomyManager(this);
    this.synergySystem = new SynergySystem(this);

    // --- 6. 事件监听 ---
    this.game.events.off('AUTO_BUY_UNIT');
    this.game.events.on('AUTO_BUY_UNIT', this.handleAutoBuyUnit, this);

    this.game.events.on('START_BATTLE', this.switchToBattlePhase, this);

    // 监听碰撞
    this.matter.world.on('collisionstart', this.handleCollision, this);

    // 初始化阶段和回合
    this.currentPhase = GamePhase.PREPARATION;
    this.currentRound = 1;
    this.battleTimer = null;

    // 创建卖掉区域
    this.createSellZone();

    // 创建阶段和回合显示（注释掉，因为顶部已经有其他UI显示）
    // this.createPhaseUI();

    // 发出 ready 事件
    this.game.events.emit('ready');

    // 进入第一回合购买阶段
    this.switchToPreparationPhase();
  }

  createBase(x: number, y: number, label: string, color: number, collidesWith: number) {
    // 创建基地纹理 - 使用canvas绘制简单的emoji基地
    const baseTextureKey = `base_${label}`;
    if (!this.textures.exists(baseTextureKey)) {
      const canvas = document.createElement('canvas');
      canvas.width = 60; // 缩小宽度
      canvas.height = 60; // 缩小高度
      const ctx = canvas.getContext('2d');

      if (ctx) {
        // 清空canvas
        ctx.clearRect(0, 0, 60, 60);

        // 根据基地类型绘制不同的emoji外观
        if (label === 'BASE_PLAYER') {
          // 玩家基地 - 笑脸emoji
          // 黄色圆形背景
          ctx.fillStyle = '#FFD700'; // 金色
          ctx.beginPath();
          ctx.arc(30, 30, 25, 0, Math.PI * 2);
          ctx.fill();

          // 黑色边框
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 2;
          ctx.stroke();

          // 眼睛
          ctx.fillStyle = '#000000';
          ctx.beginPath();
          ctx.arc(20, 20, 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(40, 20, 3, 0, Math.PI * 2);
          ctx.fill();

          // 微笑嘴巴
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(30, 30, 12, 0.2 * Math.PI, 0.8 * Math.PI);
          ctx.stroke();

          // 添加"P"字母表示玩家
          ctx.fillStyle = '#228B22'; // 绿色
          ctx.font = 'bold 16px Arial';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('P', 30, 30);
        } else {
          // 敌人基地 - 愤怒脸emoji
          // 红色圆形背景
          ctx.fillStyle = '#FF4500'; // 橙红色
          ctx.beginPath();
          ctx.arc(30, 30, 25, 0, Math.PI * 2);
          ctx.fill();

          // 黑色边框
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 2;
          ctx.stroke();

          // 愤怒的眼睛
          ctx.fillStyle = '#000000';
          ctx.beginPath();
          ctx.arc(18, 18, 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(42, 18, 3, 0, Math.PI * 2);
          ctx.fill();

          // 愤怒的眉毛
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(12, 15);
          ctx.lineTo(24, 12);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(48, 12);
          ctx.lineTo(36, 15);
          ctx.stroke();

          // 愤怒的嘴巴
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(30, 40, 10, 0.1 * Math.PI, 0.9 * Math.PI);
          ctx.stroke();

          // 添加"E"字母表示敌人
          ctx.fillStyle = '#8B0000'; // 深红色
          ctx.font = 'bold 16px Arial';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('E', 30, 30);
        }

        this.textures.addCanvas(baseTextureKey, canvas);
      }
    }

    // 创建精灵
    const baseSprite = this.add.sprite(x, y, baseTextureKey);
    const base = this.matter.add.gameObject(baseSprite, { isStatic: true, label }) as Phaser.Physics.Matter.Sprite;
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

  handleAutoBuyUnit({ unitKey, cost }: { unitKey: string; cost?: number }) {
    // 检查人口限制
    if (this.playerBarracks.length >= 8) {
      console.log('⚠️ 兵营位置已满，无法购买');
      return;
    }

    const data = UNIT_TYPES[unitKey];
    if (!data) return;

    // 检查金币是否足够（使用传入的cost或单位数据中的cost）
    const unitCost = cost || data.cost;
    const currentGold = this.economyManager.getGold();

    if (currentGold < unitCost) {
      console.log(`⚠️ 金币不足：需要 ${unitCost}，当前只有 ${currentGold}`);
      // 可以发送事件通知UI恢复商店格子
      this.game.events.emit('BUY_FAILED', { unitKey });
      return;
    }

    // 扣钱
    this.economyManager.addGold(-unitCost);

    const index = this.playerBarracks.length;
    const pos = GameConfig.barracksPositions[index];

    const barracks = new Barracks(this, pos.x, pos.y, unitKey, data, 1);
    this.playerBarracks.push(barracks);

    this.updateSynergies();
    this.game.events.emit('BARRACKS_PLACED', this.playerBarracks.length);

    console.log(`✅ 购买成功：${data.name}，花费 ${unitCost} 金币`);

    // 检查是否可以合成
    this.checkAndCombineBarracks();
  }

  private updateSynergies() {
    const counts = this.synergySystem.calculateSynergies(this.playerBarracks);
    this.game.events.emit('UPDATE_SYNERGY', counts);
  }

  createBaseHealthBars() {
    // 玩家基地血量数字显示（在基地下方）
    const playerBaseX = 50; // 玩家基地X坐标
    const playerBaseY = 300; // 玩家基地Y坐标

    // 敌人基地血量数字显示（在基地下方）
    const enemyBaseX = 950; // 敌人基地X坐标
    const enemyBaseY = 300; // 敌人基地Y坐标

    this.updateBaseHealthBars();
  }

  updateBaseHealthBars() {
    // 玩家基地血量数字显示（在基地下方）
    const playerBaseX = 50; // 玩家基地X坐标
    const playerBaseY = 300; // 玩家基地Y坐标

    // 敌人基地血量数字显示（在基地下方）
    const enemyBaseX = 950; // 敌人基地X坐标
    const enemyBaseY = 300; // 敌人基地Y坐标

    // 更新玩家血量数值显示
    if (!this.playerHpText) {
      this.playerHpText = this.add.text(playerBaseX, playerBaseY + 70, `${this.playerHp}`, {
        fontSize: '24px',
        color: '#00ff00',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 3
      }).setOrigin(0.5);
    } else {
      this.playerHpText.setText(`${this.playerHp}`);
      this.playerHpText.setColor(this.playerHp > 20 ? '#00ff00' : (this.playerHp > 10 ? '#ffff00' : '#ff0000'));
    }

    // 更新敌人士气数值显示
    if (!this.enemyHpText) {
      this.enemyHpText = this.add.text(enemyBaseX, enemyBaseY + 70, `${this.enemyHp}`, {
        fontSize: '24px',
        color: '#ff0000',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 3
      }).setOrigin(0.5);
    } else {
      this.enemyHpText.setText(`${this.enemyHp}`);
      this.enemyHpText.setColor(this.enemyHp > 500 ? '#ff0000' : (this.enemyHp > 200 ? '#ff6600' : '#ff9999'));
    }

    if (this.playerHp <= 0) this.gameOver(false);
    if (this.enemyHp <= 0) this.gameOver(true);
  }

  update(time: number, delta: number) {
    this.playerUnits.children.each((u: any) => u.update(time, delta));
    this.enemyUnits.children.each((u: any) => u.update(time, delta));
    this.playerBarracks.forEach(b => b.update());

    // 在战斗阶段检查是否应该提前结束战斗
    if (this.currentPhase === GamePhase.BATTLE) {
      this.checkBattleEnd();
    }
  }

  // 创建阶段UI显示
  createPhaseUI() {
    // 阶段显示
    this.phaseText = this.add.text(500, 30, `阶段: 购买阶段`, {
      fontSize: '24px',
      color: '#ffffff',
      backgroundColor: '#000000',
      padding: { x: 10, y: 5 }
    }).setOrigin(0.5).setDepth(2000);

    // 回合显示
    this.roundText = this.add.text(500, 70, `回合: 1`, {
      fontSize: '20px',
      color: '#ffd700',
      backgroundColor: '#000000',
      padding: { x: 10, y: 5 }
    }).setOrigin(0.5).setDepth(2000);
  }

  // 更新阶段显示
  updatePhaseUI() {
    const phaseNames = {
      [GamePhase.PREPARATION]: '购买阶段',
      [GamePhase.BATTLE]: '战斗阶段',
      [GamePhase.RESOLUTION]: '结算阶段',
      [GamePhase.GAME_OVER]: '游戏结束'
    };

    // 确保phaseText对象存在
    if (!this.phaseText) {
      this.phaseText = this.add.text(500, 30, `阶段: ${phaseNames[this.currentPhase]}`, {
        fontSize: '24px',
        color: '#ffffff',
        backgroundColor: '#000000',
        padding: { x: 10, y: 5 }
      }).setOrigin(0.5).setDepth(2000);
    } else {
      this.phaseText.setText(`阶段: ${phaseNames[this.currentPhase]}`);
    }

    // 确保roundText对象存在并更新回合数
    if (!this.roundText) {
      this.roundText = this.add.text(500, 70, `回合: ${this.currentRound}`, {
        fontSize: '20px',
        color: '#ffd700',
        backgroundColor: '#000000',
        padding: { x: 10, y: 5 }
      }).setOrigin(0.5).setDepth(2000);
    } else {
      this.roundText.setText(`回合: ${this.currentRound}`);
    }
  }

  // 切换到购买阶段
  switchToPreparationPhase() {
    this.currentPhase = GamePhase.PREPARATION;

    // 允许拖动兵营 - 使用enableDragging方法重新绑定事件监听器
    this.playerBarracks.forEach(barrack => {
      barrack.enableDragging();
    });

    // 显示卖掉区域
    this.sellZoneBg.setVisible(true);
    this.sellZoneText.setVisible(true);

    // 更新UI
    console.warn(`🚨 switchToPreparationPhase: 调用updatePhaseUI前，当前回合 = ${this.currentRound}`);
    console.warn(`🚨 roundText对象存在吗？ ${!!this.roundText}`);
    console.warn(`🚨 phaseText对象存在吗？ ${!!this.phaseText}`);
    this.updatePhaseUI();

    // 发工资
    this.giveSalary();

    // 通知UI
    this.game.events.emit('PHASE_CHANGED', GamePhase.PREPARATION);
    console.warn(`🚨 进入购买阶段 (回合 ${this.currentRound})`);
  }

  // 切换到战斗阶段
  switchToBattlePhase() {
    this.currentPhase = GamePhase.BATTLE;

    // 禁止拖动兵营
    this.playerBarracks.forEach(barrack => barrack.disableDragging());

    // 隐藏卖掉区域
    this.sellZoneBg.setVisible(false);
    this.sellZoneText.setVisible(false);

    // 更新UI
    this.updatePhaseUI();

    // 开始战斗
    this.startBattle();

    // 通知UI
    this.game.events.emit('PHASE_CHANGED', GamePhase.BATTLE);
    console.log(`⚔️ 进入战斗阶段`);
  }

  // 切换到结算阶段
  switchToResolutionPhase() {
    console.warn(`🚨 switchToResolutionPhase被调用，当前回合: ${this.currentRound}`);
    this.currentPhase = GamePhase.RESOLUTION;

    // 更新UI
    console.warn(`🚨 调用updatePhaseUI前`);
    this.updatePhaseUI();

    // 计算战斗结果
    this.calculateBattleResult();

    // 清理所有存活的战斗单位（问题1修复）
    this.cleanupBattleUnits();

    // 通知UI
    this.game.events.emit('PHASE_CHANGED', GamePhase.RESOLUTION);
    console.warn(`🚨 进入结算阶段，清理存活单位，当前回合: ${this.currentRound}`);

    // 延迟后进入下一回合购买阶段
    this.time.delayedCall(GameConfig.resolutionDuration, () => {
      console.warn(`🚨 结算阶段结束，增加回合数: ${this.currentRound} -> ${this.currentRound + 1}`);
      this.currentRound++;
      console.warn(`🚨 增加回合数后，直接更新roundText对象`);
      // 直接更新roundText对象，确保它存在
      if (this.roundText && this.roundText.setText) {
        this.roundText.setText(`回合: ${this.currentRound}`);
        console.warn(`🚨 roundText已直接更新为: 回合: ${this.currentRound}`);
      } else {
        console.warn(`🚨 roundText对象不存在或没有setText方法，尝试重新创建`);
        // 如果roundText不存在，重新创建
        this.roundText = this.add.text(500, 70, `回合: ${this.currentRound}`, {
          fontSize: '20px',
          color: '#ffd700',
          backgroundColor: '#000000',
          padding: { x: 10, y: 5 }
        }).setOrigin(0.5).setDepth(2000);
      }
      console.warn(`🚨 调用switchToPreparationPhase，新回合: ${this.currentRound}`);
      this.switchToPreparationPhase();
    });
  }

  // 开始战斗（替换原来的startGame）
  startBattle() {
    // 清理之前的战斗单位
    this.cleanupBattleUnits();

    // 生成一波敌人
    this.waveManager.startBattle();

    // 设置战斗计时器
    this.battleTimer = this.time.delayedCall(GameConfig.battleDuration, () => {
      this.endBattle();
    });

    console.log('战斗开始！');
  }

  // 结束战斗
  endBattle() {
    if (this.battleTimer) {
      this.battleTimer.remove();
      this.battleTimer = null;
    }

    // 停止波次生成
    this.waveManager.stop();

    // 进入结算阶段
    this.switchToResolutionPhase();
  }

  // 清理战斗单位
  cleanupBattleUnits() {
    // 清理玩家单位（除了兵营生成的）
    this.playerUnits.children.each((unit: any) => {
      if (unit && unit.die) {
        unit.die(); // 调用die方法确保血条被销毁
      }
      return null; // 继续迭代
    });
    this.playerUnits.clear(true, true);

    // 清理敌人单位
    this.enemyUnits.children.each((unit: any) => {
      if (unit && unit.die) {
        unit.die(); // 调用die方法确保血条被销毁
      }
      return null; // 继续迭代
    });
    this.enemyUnits.clear(true, true);
  }

  // 计算战斗结果
  calculateBattleResult() {
    // 统计存活单位
    const playerSurvivors = this.countSurvivors(this.playerUnits, false);
    const enemySurvivors = this.countSurvivors(this.enemyUnits, true);

    console.log(`战斗结果: 玩家存活 ${playerSurvivors} 单位, 敌方存活 ${enemySurvivors} 单位`);

    // 判断胜负
    if (playerSurvivors > enemySurvivors) {
      // 玩家获胜，敌方受到伤害
      const damage = playerSurvivors;
      this.enemyHp -= damage;
      console.log(`🎉 玩家获胜！敌方受到 ${damage} 点伤害 (敌方血量 ${this.enemyHp})`);
    } else if (enemySurvivors > playerSurvivors) {
      // 敌方获胜，玩家受到伤害
      const damage = enemySurvivors;
      this.playerHp -= damage;
      console.log(`💀 敌方获胜！玩家受到 ${damage} 点伤害 (玩家血量 ${this.playerHp})`);
    } else {
      // 平局，双方都受到伤害
      const damage = playerSurvivors;
      this.playerHp -= damage;
      this.enemyHp -= damage;
      console.log(`🤝 平局！双方各受到 ${damage} 点伤害`);
    }

    // 更新血量显示
    this.updateBaseHealthBars();

    // 检查游戏结束
    if (this.playerHp <= 0 || this.enemyHp <= 0) {
      this.gameOver(this.playerHp > 0);
    }
  }

  // 统计存活单位
  countSurvivors(units: Phaser.GameObjects.Group, isEnemy: boolean): number {
    let count = 0;
    units.children.each((unit: any) => {
      if (unit.isEnemy === isEnemy && unit.active && unit.visible && unit.hp > 0) {
        count++;
      }
      return null; // 继续迭代
    });
    return count;
  }

  // 发工资
  giveSalary() {
    // 通过经济管理器发工资
    const currentGold = this.economyManager.getGold();
    const baseSalary = GameConfig.baseGoldPerRound;

    // 计算利息
    const interestGold = Math.min(currentGold, GameConfig.maxInterestGold);
    const interest = Math.floor(interestGold * GameConfig.interestRate);

    const totalSalary = baseSalary + interest;

    this.economyManager.addGold(totalSalary);
    console.log(`💰 发工资: 基础 ${baseSalary} + 利息 ${interest} = ${totalSalary} 金币`);
  }

  // 检查战斗是否应该提前结束
  checkBattleEnd() {
    // 检查是否还有敌人存活
    let hasEnemies = false;
    this.enemyUnits.children.each((unit: any) => {
      if (unit.active && unit.visible && unit.hp > 0) {
        hasEnemies = true;
        return false; // 停止迭代
      }
      return null;
    });

    // 如果所有敌人都死亡了，提前结束战斗
    if (!hasEnemies) {
      console.log('🎯 所有敌人都被消灭了，提前结束战斗！');
      this.endBattle();
      return;
    }

    // 检查是否还有玩家单位存活
    let hasPlayerUnits = false;
    this.playerUnits.children.each((unit: any) => {
      if (unit.active && unit.visible && unit.hp > 0) {
        hasPlayerUnits = true;
        return false; // 停止迭代
      }
      return null;
    });

    // 如果所有玩家单位都死亡了，提前结束战斗
    if (!hasPlayerUnits) {
      console.log('💀 所有玩家单位都死亡了，提前结束战斗！');
      this.endBattle();
    }
  }

  // 游戏结束（修改原来的gameOver）
  gameOver(won: boolean) {
    this.currentPhase = GamePhase.GAME_OVER;
    this.updatePhaseUI();

    if (this.battleTimer) {
      this.battleTimer.remove();
      this.battleTimer = null;
    }

    this.waveManager.stop();
    this.game.events.emit('GAME_OVER', won);
    console.log(won ? '🎉 游戏胜利！' : '💀 游戏失败！');
  }

  // 辅助方法
  isInSellZone(x: number, y: number): boolean {
    if (!this.sellZone) return false;
    const bounds = this.sellZone.getBounds();
    return x >= bounds.x - bounds.width / 2 && x <= bounds.x + bounds.width / 2 &&
           y >= bounds.y - bounds.height / 2 && y <= bounds.y + bounds.height / 2;
  }

  // 检查并合并三个相同的一星兵营
  private checkAndCombineBarracks(): void {
    // 按兵营类型分组
    const barracksByType: Record<string, Barracks[]> = {};

    // 只考虑一星兵营
    const oneStarBarracks = this.playerBarracks.filter(b => b.starLevel === 1);

    // 按单位类型分组
    oneStarBarracks.forEach(barracks => {
      if (!barracksByType[barracks.unitKey]) {
        barracksByType[barracks.unitKey] = [];
      }
      barracksByType[barracks.unitKey].push(barracks);
    });

    // 检查每个类型是否有3个或更多
    for (const unitKey in barracksByType) {
      if (Object.prototype.hasOwnProperty.call(barracksByType, unitKey)) {
        const barracksList = barracksByType[unitKey];
        if (barracksList.length >= 3) {
          console.log(`✨ 发现3个相同的${unitKey}兵营，可以合成二星！`);
          this.combineBarracks(unitKey, barracksList.slice(0, 3));
          return; // 一次只合成一组
        }
      }
    }
  }

  // 合并三个一星兵营为一个二星兵营
  private combineBarracks(unitKey: string, barracksList: Barracks[]): void {
    if (barracksList.length !== 3) return;

    // 获取第一个兵营的位置（作为新兵营的位置）
    const firstBarracks = barracksList[0];
    const pos = { x: firstBarracks.x, y: firstBarracks.y };
    const { unitData } = firstBarracks;

    // 销毁三个一星兵营
    barracksList.forEach(barracks => {
      const index = this.playerBarracks.indexOf(barracks);
      if (index > -1) {
        this.playerBarracks.splice(index, 1);
      }
      barracks.destroy();
    });

    // 创建二星兵营
    const upgradedBarracks = new Barracks(this, pos.x, pos.y, unitKey, unitData, 2);
    this.playerBarracks.push(upgradedBarracks);

    // 更新羁绊
    this.updateSynergies();

    // 通知UI
    this.game.events.emit('BARRACKS_PLACED', this.playerBarracks.length);

    console.log(`🌟 合成成功！${unitData.name} 升级为二星兵营！`);

    // 递归检查是否还能继续合成
    this.checkAndCombineBarracks();
  }
}
