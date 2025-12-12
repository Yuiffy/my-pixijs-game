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

    // 1. 绘制兵营外观 (直接画矩形，不使用纹理)
    const bgColor = Phaser.Display.Color.HexStringToColor(unitData.color).color;
    const bgRect = scene.add.rectangle(0, 0, 40, 40, bgColor);
    bgRect.setStrokeStyle(2, 0xffffff); // 白色边框
    this.add(bgRect); // 添加到容器

    // 2. 添加一个小装饰，表示这是兵营
    const roof = scene.add.rectangle(0, -20, 50, 10, 0x555555);
    this.add(roof);

    // 3. 添加到场景
    this.setDepth(5); // 确保在单位上面
    scene.add.existing(this);

    console.log('✅ Barracks (Container) created at', x, y);

    // 4. 出兵逻辑
    this.spawnTimer = scene.time.addEvent({
      delay: unitData.spawnInterval,
      callback: this.spawnUnit,
      callbackScope: this,
      loop: true
    });

    // 5. 兵营图标
    this.createBarracksIndicator();

    // 立即生成一个单位
    this.spawnUnit();
  }

  createBarracksIndicator() {
    // 这里的文字坐标是相对于容器中心的 (0,0)
    this.indicator = this.scene.add.text(0, -35, this.unitData.emoji, {
      fontSize: '20px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2
    });
    this.indicator.setOrigin(0.5);
    this.add(this.indicator);
  }

  spawnUnit() {
    // 随机偏移，让兵不要全叠在一起
    const offsetX = (Math.random() - 0.5) * 40;
    const offsetY = 30; // 在兵营下方出生

    // 注意：Container 的 x,y 是世界坐标，所以这里直接用 this.x
    const spawnX = this.x + offsetX;
    const spawnY = this.y + offsetY;

    console.log('Barracks spawning unit at', spawnX, spawnY);

    // 生成单位
    const unit = new Unit(this.scene, spawnX, spawnY, this.unitData, false);

    // 只要 MainScene 里有这个组，就加进去
    const mainScene = this.scene as any;
    if (mainScene.playerUnits) {
      mainScene.playerUnits.add(unit);
    }

    // 播放一个简单的生成动画 (白色圆圈扩散)
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
    // Container 会自动处理子对象的移动，不需要在这里手动 update indicator
  }

  destroy(fromScene?: boolean) {
    if (this.spawnTimer) this.spawnTimer.remove();
    super.destroy(fromScene);
  }

  // 兼容旧代码的静态方法，防止报错，但不再实际做事
  static createBarracksTexture(scene: any, unitData: any) {
    // Pass
  }
}
