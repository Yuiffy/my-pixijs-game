// src/components/autoChessGame/objects/Barracks.ts
import * as Phaser from 'phaser';
import Unit from './Unit';

export default class Barracks extends Phaser.GameObjects.Container {
  unitKey: string;

  unitData: any;

  spawnTimer: Phaser.Time.TimerEvent;

  indicator: Phaser.GameObjects.Text;

  scene: Phaser.Scene;

  constructor(scene: Phaser.Scene, x: number, y: number, unitKey: string, unitData: any) {
    super(scene, x, y);
    this.scene = scene;
    this.unitKey = unitKey;
    this.unitData = unitData;

    // --- 1. 直接画兵营 (100% 可见方案) ---
    // 不再依赖 textureKey，直接用 Graphics 画出来
    const bg = scene.add.rectangle(0, 0, 40, 40, 0x888888); // 灰色底座
    bg.setStrokeStyle(2, 0xffffff); // 白色边框
    this.add(bg);

    // 根据单位颜色画个顶盖，区分不同兵种
    const colorInt = parseInt(unitData.color.replace('#', '0x'), 16);
    const roof = scene.add.rectangle(0, -5, 30, 30, colorInt);
    this.add(roof);

    // --- 2. 设置层级 ---
    this.setDepth(5);
    scene.add.existing(this);

    console.log(`✅ [Barracks] 可视化兵营已创建于 (${x}, ${y}) - ${unitData.name}`);

    // --- 3. 标识文字 ---
    this.indicator = this.scene.add.text(0, -35, this.unitData.emoji, {
      fontSize: '20px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2
    });
    this.indicator.setOrigin(0.5);
    this.add(this.indicator);

    // --- 4. 出兵逻辑 ---
    this.spawnTimer = scene.time.addEvent({
      delay: unitData.spawnInterval,
      callback: this.spawnUnit,
      callbackScope: this,
      loop: true
    });

    // 立即生成一个单位
    this.spawnUnit();
  }

  spawnUnit() {
    // 随机偏移，防止完全重叠
    const spawnX = this.x + (Math.random() - 0.5) * 40;
    const spawnY = this.y + 30; // 在兵营下方出生

    console.log(`[Barracks] Spawning unit at (${spawnX}, ${spawnY})`);

    // 生成单位
    const unit = new Unit(this.scene, spawnX, spawnY, this.unitData, false);

    // 播放生成特效
    const effect = this.scene.add.circle(spawnX, spawnY, 5, 0xffffff);
    this.scene.tweens.add({
      targets: effect,
      scale: 3,
      alpha: 0,
      duration: 300,
      onComplete: () => effect.destroy()
    });
  }

  update() {
    // Container 不需要手动 update 子元素位置
  }

  destroy(fromScene?: boolean) {
    if (this.spawnTimer) this.spawnTimer.remove();
    super.destroy(fromScene);
  }

  // 这里的静态方法留空，防止 MainScene 调用报错
  static createBarracksTexture(scene: any, unitData: any) {
    // 不需要了
  }
}
