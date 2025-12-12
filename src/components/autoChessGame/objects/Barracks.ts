// src/components/autoChessGame/objects/Barracks.ts
import * as Phaser from 'phaser';
import Unit from './Unit';

export default class Barracks extends Phaser.GameObjects.Sprite {
  unitKey: string;

  unitData: any;

  spawnTimer: Phaser.Time.TimerEvent;

  indicator: Phaser.GameObjects.Text;

  constructor(scene, x, y, unitKey, unitData) {
    // 创建纹理（如果不存在）
    if (!scene.textures.exists(`${unitData.textureKey}_barracks`)) {
      Barracks.createBarracksTexture(scene, unitData);
    }

    super(scene, x, y, `${unitData.textureKey}_barracks`);
    this.scene = scene;
    this.unitKey = unitKey;
    this.unitData = unitData;

    this.setTint(0x888888); // 稍微变暗一点表示是建筑
    this.setDepth(5); // 设置深度确保显示在前面
    scene.add.existing(this);

    console.log('Barracks created at', x, y, 'texture:', `${unitData.textureKey}_barracks`);

    // 出兵计时器
    this.spawnTimer = scene.time.addEvent({
      delay: unitData.spawnInterval,
      callback: this.spawnUnit,
      callbackScope: this,
      loop: true
    });

    // 创建一个小的兵营标识
    this.createBarracksIndicator();

    // 出生时立即生成一个
    this.spawnUnit();
  }

  static createBarracksTexture(scene, unitData) {
    console.log('Creating barracks texture for', unitData.textureKey);
    // 创建兵营纹理（建筑样式）
    const graphics = scene.add.graphics();
    graphics.fillStyle(Phaser.Display.Color.HexStringToColor(unitData.color).color);
    graphics.fillRect(0, 0, 40, 40);
    // 添加建筑风格的装饰
    graphics.lineStyle(2, 0xffffff);
    graphics.strokeRect(5, 5, 30, 30);
    graphics.fillStyle(0xffffff);
    graphics.fillRect(15, 15, 10, 10);
    const textureKey = `${unitData.textureKey}_barracks`;
    graphics.generateTexture(textureKey, 40, 40);
    graphics.destroy();
    console.log('Barracks texture created:', textureKey, 'exists:', scene.textures.exists(textureKey));
  }

  createBarracksIndicator() {
    // 创建一个小图标显示兵营在生产什么
    this.indicator = this.scene.add.text(this.x, this.y - 30, this.unitData.emoji, {
      fontSize: '16px',
      color: '#ffffff'
    });
    this.indicator.setOrigin(0.5);
  }

  spawnUnit() {
    console.log('Barracks spawning unit at', this.x, this.y);
    // 在兵营位置生成战斗单位
    const offsetX = (Math.random() - 0.5) * 40; // 随机偏移
    const offsetY = 30 + Math.random() * 20;

    const unit = new Unit(this.scene, this.x + offsetX, this.y + offsetY, this.unitData, false);
    this.scene.playerUnits.add(unit);
    console.log('Unit spawned:', unit, 'total units:', this.scene.playerUnits.children.length);

    // 生成特效
    this.createSpawnEffect(this.x + offsetX, this.y + offsetY);
  }

  createSpawnEffect(x, y) {
    // 创建生成特效
    const effect = this.scene.add.circle(x, y, 5, this.unitData.color.replace('#', '0x'));
    this.scene.tweens.add({
      targets: effect,
      scale: 2,
      alpha: 0,
      duration: 500,
      onComplete: () => effect.destroy()
    });
  }

  update() {
    // 更新指示器位置
    if (this.indicator) {
      this.indicator.x = this.x;
      this.indicator.y = this.y - 30;
    }
  }

  destroy() {
    if (this.spawnTimer) this.spawnTimer.remove();
    if (this.indicator) this.indicator.destroy();
    super.destroy();
  }
}
