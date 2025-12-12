// src/components/autoChessGame/objects/Unit.ts
import * as Phaser from 'phaser';

export default class Unit extends Phaser.Physics.Matter.Sprite {
  config: any;

  isEnemy: boolean;

  hp: number;

  maxHp: number;

  target: any;

  constructor(scene: Phaser.Scene, x: number, y: number, config: any, isEnemy = false) {
    super(scene.matter.world, x, y, config.textureKey);
    this.scene = scene;
    this.config = config;
    this.isEnemy = isEnemy;

    // 1. 物理属性
    this.setCircle(20);
    this.setFriction(0.05);
    this.setBounce(0.5);
    this.setMass(config.mass || 20);

    // 2. 游戏属性
    this.hp = config.hp;
    this.maxHp = config.hp;
    this.target = null;

    // 3. 🛡️ 兜底显示：如果纹理挂了，至少画个圈
    // 我们给它附加一个 graphics，如果看不见 sprite 至少能看见这个圈
    // (注意：这里直接染红 Sprite，这是最简单的检测方法)
    if (isEnemy) {
      this.setTint(0xff0000); // 敌人变红
    } else {
      this.setTint(0x00ff00); // 自己人变绿 (确保可见)
    }

    // 4. 碰撞设置
    const mainScene = scene as any;
    const collisionCategory = isEnemy ? mainScene.enemyCategory : mainScene.playerCategory;
    const collidesWith = isEnemy ? mainScene.playerCategory : mainScene.enemyCategory;

    // 只有当 MainScene 初始化了这些 category 才能设置，否则忽略
    if (collisionCategory && mainScene.wallCategory) {
      this.setCollisionCategory(collisionCategory);
      this.setCollidesWith([collidesWith, mainScene.wallCategory]);
    }

    scene.add.existing(this);
    console.log(`Unit created at ${x} ${y} texture: ${config.textureKey}`);
  }

  update(time: number, delta: number) {
    if (this.hp <= 0) return;

    // 简单的 AI
    this.findTarget();
    this.moveToTarget();

    // 边界死亡
    if (this.y > 650 || this.y < -50 || this.x < -50 || this.x > 1050) {
      this.takeDamage(9999);
    }
  }

  findTarget() {
    const mainScene = this.scene as any;
    // 如果我是敌人，我的目标是玩家单位；反之亦然
    const enemies = this.isEnemy ? mainScene.playerUnits : mainScene.enemyUnits;

    let closest: any = null;
    let minDist = 99999;

    if (enemies) {
      enemies.children.each((e: any) => {
        if (!e.active || e.hp <= 0) return;
        const dist = Phaser.Math.Distance.Between(this.x, this.y, e.x, e.y);
        if (dist < minDist) {
          minDist = dist;
          closest = e;
        }
      });
    }

    // 如果没有兵，就冲基地
    if (!closest) {
      this.target = this.isEnemy ? mainScene.playerBase : mainScene.enemyBase;
    } else {
      this.target = closest;
    }
  }

  moveToTarget() {
    if (!this.target) return;
    const angle = Phaser.Math.Angle.Between(this.x, this.y, this.target.x, this.target.y);
    const speed = 0.002 * (this.config.mass / 10);
    this.applyForce({ x: Math.cos(angle) * speed, y: Math.sin(angle) * speed });

    // 限制最大速度
    // @ts-ignore
    if (this.body && this.body.speed > 5) {
      this.setVelocity(this.body.velocity.x * 0.9, this.body.velocity.y * 0.9);
    }
  }

  takeDamage(amount: number) {
    this.hp -= amount;
    // 简单的受击反馈
    this.setAlpha(0.5);
    this.scene.time.delayedCall(100, () => this.setAlpha(1));

    if (this.hp <= 0) {
      this.destroy();
    }
  }

  // 静态方法：生成纹理
  static createTexture(scene: Phaser.Scene, config: any) {
    const key = config.textureKey;
    if (scene.textures.exists(key)) return;

    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 画个背景圆
    ctx.fillStyle = config.color || '#ffffff';
    ctx.beginPath();
    ctx.arc(32, 32, 30, 0, Math.PI * 2);
    ctx.fill();

    // 描边
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 4;
    ctx.stroke();

    // 画 Emoji
    ctx.font = '40px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#000';
    ctx.fillText(config.emoji || '?', 32, 34);

    scene.textures.addCanvas(key, canvas);
  }
}
