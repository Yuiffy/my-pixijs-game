// src/components/autoChessGame/objects/Unit.ts
import * as Phaser from 'phaser';

export default class Unit extends Phaser.Physics.Matter.Sprite {
  config: any;

  isEnemy: boolean;

  hp: number;

  maxHp: number;

  target: any;

  constructor(scene: Phaser.Scene, x: number, y: number, config: any, isEnemy = false) {
    // 先用空字符串创建，稍后设置纹理
    super(scene.matter.world, x, y, '');
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

    // 设置渲染深度，确保单位显示在前面
    this.setDepth(2);

    // 使用正确的纹理
    if (scene.textures.exists(config.textureKey)) {
      this.setTexture(config.textureKey);
    } else {
      // 兜底：如果纹理不存在，使用临时的圆圈
      const graphics = scene.add.graphics();
      graphics.fillStyle(isEnemy ? 0xff0000 : 0x00ff00);
      graphics.fillCircle(0, 0, 20);
      graphics.generateTexture(`temp_${config.textureKey}_${isEnemy ? 'enemy' : 'player'}`, 40, 40);
      graphics.destroy();
      this.setTexture(`temp_${config.textureKey}_${isEnemy ? 'enemy' : 'player'}`);
    }

    // 注意：Matter Sprite 构造函数已经将对象添加到场景中，不需要再次调用 add.existing
    console.log(`Unit created at ${x} ${y} texture: ${config.textureKey}, isEnemy: ${isEnemy}`);
    console.log(`Unit sprite visible: ${this.visible}, active: ${this.active}, depth: ${this.depth}`);
  }

  update(time: number, delta: number) {
    if (this.hp <= 0) return;

    // 简单的 AI
    this.findTarget();
    this.moveToTarget();

    // 战场边界约束 (让单位保持在战场内)
    this.constrainToBattlefield();
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
    const force = new Phaser.Math.Vector2(Math.cos(angle) * speed, Math.sin(angle) * speed);
    this.applyForce(force);

    // 限制最大速度
    // @ts-ignore
    if (this.body && this.body.speed > 5) {
      this.setVelocity(this.body.velocity.x * 0.9, this.body.velocity.y * 0.9);
    }
  }

  constrainToBattlefield() {
    // 战场边界 (避免撞到基地，留出边距)
    const minX = 50;
    const maxX = 950;
    const minY = 50;
    const maxY = 550;

    // 边界缓冲区大小
    const buffer = 20;

    let forceX = 0;
    let forceY = 0;

    // X轴边界约束
    if (this.x < minX + buffer) {
      forceX = (minX + buffer - this.x) * 0.01; // 向右推
    } else if (this.x > maxX - buffer) {
      forceX = (maxX - buffer - this.x) * 0.01; // 向左推
    }

    // Y轴边界约束
    if (this.y < minY + buffer) {
      forceY = (minY + buffer - this.y) * 0.01; // 向下推
    } else if (this.y > maxY - buffer) {
      forceY = (maxY - buffer - this.y) * 0.01; // 向上推
    }

    // 应用边界约束力
    if (forceX !== 0 || forceY !== 0) {
      this.applyForce(new Phaser.Math.Vector2(forceX, forceY));
    }

    // 如果完全超出边界，强制拉回来
    if (this.x < minX - 50 || this.x > maxX + 50 || this.y < minY - 50 || this.y > maxY + 50) {
      this.setPosition(
        Phaser.Math.Clamp(this.x, minX, maxX),
        Phaser.Math.Clamp(this.y, minY, maxY)
      );
      this.setVelocity(0, 0);
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
    if (scene.textures.exists(key)) {
      console.log(`Texture ${key} already exists`);
      return;
    }

    console.log(`Creating texture for ${key}`);
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      console.error(`Failed to get canvas context for ${key}`);
      return;
    }

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
    console.log(`✅ Texture created for ${key}`);
  }
}
