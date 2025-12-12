// src/components/autoChessGame/objects/Barracks.ts
import * as Phaser from 'phaser';
import Unit from './Unit';

// 🛑 终极修复：把兵营变成 Sprite (精灵)，这和单位是一样的
export default class Barracks extends Phaser.Physics.Matter.Sprite {
  unitKey: string;

  unitData: any;

  spawnTimer: Phaser.Time.TimerEvent;

  indicator: Phaser.GameObjects.Text;

  scene: Phaser.Scene;

  constructor(scene: Phaser.Scene, x: number, y: number, unitKey: string, unitData: any) {
    // 1. 使用 MainScene 里生成的 'box_texture'
    super(scene.matter.world, x, y, 'box_texture');
    this.scene = scene;
    this.unitKey = unitKey;
    this.unitData = unitData;

    // 2. 设置物理属性：静止的方块
    this.setStatic(true);
    this.setSensor(true); // 传感器模式：虽然有体积，但不会把兵弹飞 (让兵可以直接穿过兵营走出来)

    // 3. 染色：根据单位颜色变色，或者默认黄色
    const colorInt = parseInt(unitData.color.replace('#', '0x'), 16) || 0xFFFF00;
    this.setTint(colorInt);

    // 4. 设置大小
    this.setDisplaySize(60, 60);

    // 5. 添加到场景
    scene.add.existing(this);
    this.setDepth(10); // 在单位下面，但在地板上面

    console.log(`✅ [Barracks Sprite] Created at (${x}, ${y})`);

    // 6. 添加 Emoji 文字 (Text 对象通常是能看见的)
    this.indicator = scene.add.text(x, y, unitData.emoji, {
      fontSize: '32px',
      color: '#000000'
    }).setOrigin(0.5).setDepth(11);

    // 7. 出兵计时器
    this.spawnTimer = scene.time.addEvent({
      delay: unitData.spawnInterval,
      callback: this.spawnUnit,
      callbackScope: this,
      loop: true
    });

    // 立即出兵
    this.spawnUnit();
  }

  spawnUnit() {
    // 出生点在兵营正下方
    const spawnX = this.x;
    const spawnY = this.y + 40;

    console.log(`[Barracks] Spawning unit at (${spawnX}, ${spawnY})`);

    // 生成单位
    const unit = new Unit(this.scene, spawnX, spawnY, this.unitData, false);

    // 只要 MainScene 有这个组
    const mainScene = this.scene as any;
    if (mainScene.playerUnits) {
      mainScene.playerUnits.add(unit);
    }
  }

  destroy(fromScene?: boolean) {
    if (this.spawnTimer) this.spawnTimer.remove();
    if (this.indicator) this.indicator.destroy();
    super.destroy(fromScene);
  }
}
