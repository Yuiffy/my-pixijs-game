// src/components/autoChessGame/objects/Barracks.ts
import * as Phaser from 'phaser';
import Unit from './Unit';

export default class Barracks extends Phaser.Physics.Matter.Sprite {
  unitKey: string;

  unitData: any;

  spawnTimer: Phaser.Time.TimerEvent;

  indicator: Phaser.GameObjects.Text;

  scene: Phaser.Scene;

  constructor(scene: Phaser.Scene, x: number, y: number, unitKey: string, unitData: any) {
    // 1. 使用单位的贴图 (Texture)，这样看起来就像“卡牌放在了场上”
    super(scene.matter.world, x, y, unitData.textureKey);

    this.scene = scene;
    this.unitKey = unitKey;
    this.unitData = unitData;

    // 2. 物理：静止，传感器 (不会挡路)
    this.setStatic(true);
    this.setSensor(true);

    // 3. 视觉：放大一点，半透明，像个幻影/建筑
    this.setDisplaySize(70, 70);
    this.setAlpha(0.8);
    this.setTint(0xcccccc); // 稍微变暗，表示是建筑

    // 4. 添加到场景
    scene.add.existing(this);
    this.setDepth(5); // 在地板上，单位下

    // 5. 文字提示
    this.indicator = scene.add.text(x, y + 40, '🏠', { fontSize: '24px' }).setOrigin(0.5);

    // 6. 出兵
    this.spawnTimer = scene.time.addEvent({
      delay: unitData.spawnInterval || 4000,
      callback: this.spawnUnit,
      callbackScope: this,
      loop: true
    });
    this.spawnUnit(); // 立即出一个
  }

  spawnUnit() {
    // 兵从兵营位置出来
    const unit = new Unit(this.scene, this.x, this.y, this.unitData, false);
    const mainScene = this.scene as any;
    if (mainScene.playerUnits) mainScene.playerUnits.add(unit);
  }

  destroy(fromScene?: boolean) {
    if (this.spawnTimer) this.spawnTimer.remove();
    if (this.indicator) this.indicator.destroy();
    super.destroy(fromScene);
  }
}
