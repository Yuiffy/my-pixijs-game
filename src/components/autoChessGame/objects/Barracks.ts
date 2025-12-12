// src/components/autoChessGame/objects/Barracks.ts
import * as Phaser from 'phaser';
import Unit from './Unit';

// 继承 Sprite 而不是 GameObjects.Sprite
export default class Barracks extends Phaser.Physics.Matter.Sprite {
  unitKey: string;

  unitData: any;

  spawnTimer: Phaser.Time.TimerEvent;

  indicator: Phaser.GameObjects.Text;

  scene: Phaser.Scene;

  constructor(scene: Phaser.Scene, x: number, y: number, unitKey: string, unitData: any) {
    // 直接使用 Unit 的纹理，不调用 createBarracksTexture
    super(scene.matter.world, x, y, unitData.textureKey);

    this.scene = scene;
    this.unitKey = unitKey;
    this.unitData = unitData;

    this.setStatic(true);
    this.setSensor(true);

    // 视觉调整：看起来像底座
    this.setDisplaySize(70, 70);
    this.setAlpha(0.6);
    this.setTint(0x888888);

    scene.add.existing(this);
    this.setDepth(1);

    // 标识
    this.indicator = scene.add.text(x, y + 40, '🏠', { fontSize: '20px' }).setOrigin(0.5);

    // 出兵
    this.spawnTimer = scene.time.addEvent({
      delay: unitData.spawnInterval || 4000,
      callback: this.spawnUnit,
      callbackScope: this,
      loop: true
    });
    this.spawnUnit();
  }

  spawnUnit() {
    console.log(`Barracks spawning ${this.unitData.name}`);
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
