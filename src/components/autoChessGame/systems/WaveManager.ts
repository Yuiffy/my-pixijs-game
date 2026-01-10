import { Scene } from 'phaser';
import { GameConfig } from '../config/GameConfig';
import { UNIT_TYPES } from '../config/UnitsData';
import Unit from '../objects/Unit';
import Barracks from '../objects/Barracks';

export default class WaveManager {
  private scene: Scene;
  private currentWave: number = 0;
  private waveTimer: Phaser.Time.TimerEvent | null = null;
  private waveText: Phaser.GameObjects.Text | null = null;
  private gameScene: any; // 临时解决类型问题，避免循环依赖

  constructor(scene: Scene) {
    this.scene = scene;
    this.gameScene = scene as any;
  }

  public start() {
    this.currentWave = 0;
    // 立即开始第一波
    this.spawnEnemyWave();

    // 设置定时器
    this.waveTimer = this.scene.time.addEvent({
      delay: GameConfig.waveDelay,
      callback: this.spawnEnemyWave,
      callbackScope: this,
      loop: true
    });
  }

  // 开始单波战斗（用于新的阶段系统）
  public startBattle() {
    this.currentWave++;
    console.log(`⚔️ 战斗开始！波次 ${this.currentWave}`);

    // 生成一波敌人
    this.spawnEnemyWave();

    // 不设置定时器，战斗由MainScene的计时器控制
  }

  public stop() {
    if (this.waveTimer) {
      this.waveTimer.remove();
      this.waveTimer = null;
    }
    if (this.waveText) {
      this.waveText.destroy();
      this.waveText = null;
    }
  }

  private spawnEnemyWave() {
    console.log(`🌊 生成波次 ${this.currentWave} 的敌人`);

    // 1. 生成敌军
    const enemyCount = 3 + Math.floor(this.currentWave / 2);
    for (let i = 0; i < enemyCount; i++) {
        const y = 100 + Math.random() * 400;
        const keys = Object.keys(UNIT_TYPES);
        const randomKey = keys[Math.floor(Math.random() * keys.length)];
        const enemy = new Unit(this.scene, 900, y, UNIT_TYPES[randomKey], true);
        this.gameScene.enemyUnits.add(enemy);
    }

    // 2. 强制生成己方援军 (保证有架打)
    const friendCount = 3 + Math.floor(this.currentWave / 2);
    for (let i = 0; i < friendCount; i++) {
      const y = 100 + Math.random() * 400;
      const x = 150 + Math.random() * 100;
      const friend = new Unit(this.scene, x, y, UNIT_TYPES.sui_warrior, false);
      this.gameScene.playerUnits.add(friend);
    }

    // 3. 同步触发所有兵营出兵
    if (this.gameScene.playerBarracks) {
        this.gameScene.playerBarracks.forEach((barracks: Barracks) => {
            barracks.spawnUnit();
        });
    }

    // 更新 UI 文本
    if (!this.waveText) {
       this.waveText = this.scene.add.text(500, 50, `战斗波次 ${this.currentWave}`, { fontSize: '32px', color: '#fff' }).setOrigin(0.5);
    } else {
       this.waveText.setText(`战斗波次 ${this.currentWave}`);
    }

    // 发出波次开始事件，让MainScene和EconomyManager处理升级逻辑
    this.scene.game.events.emit('WAVE_START', this.currentWave);
  }
}
