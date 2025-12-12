// src/components/autoChessGame/objects/Unit.ts
import * as Phaser from 'phaser';

export default class Unit extends Phaser.Physics.Matter.Sprite {
  // 属性声明
  config: any;

  isEnemy: boolean;

  hp: number;

  maxHp: number;

  damage: number;

  damageMultiplier: number;

  attackSpeedMultiplier: number;

  skillCooldownMultiplier: number;

  shield: number;

  hasExplosion: boolean;

  target: any;

  lastAttackTime: number;

  attackCooldown: number;

  healthBarBg: Phaser.GameObjects.Rectangle;

  healthBarFg: Phaser.GameObjects.Rectangle;

  constructor(scene, x, y, config, isEnemy = false) {
    console.log('Unit constructor: scene =', scene, 'config =', config);
    // 创建纹理（如果不存在）
    if (!scene.textures.exists(config.textureKey)) {
      Unit.createTexture(scene, config);
    }

    super(scene.matter.world, x, y, config.textureKey);

    this.scene = scene;
    this.config = config;
    this.isEnemy = isEnemy;

    // 物理属性
    this.setCircle(20);
    this.setFriction(0.05);
    this.setBounce(0.5);
    this.setMass(config.mass);

    // 游戏属性
    this.hp = config.hp;
    this.maxHp = config.hp;
    this.damage = config.damage;
    this.damageMultiplier = 1;
    this.attackSpeedMultiplier = 1;
    this.skillCooldownMultiplier = 1;
    this.shield = 0;
    this.hasExplosion = false;

    this.state = 'MOVE'; // MOVE, ATTACK, DEAD
    this.target = null; // 当前锁定的敌人
    this.lastAttackTime = 0;
    this.attackCooldown = 1000; // 基础攻击间隔1秒

    // 碰撞组：确保自己人尽量不卡自己人，但要撞敌人
    const collisionCategory = isEnemy ? scene.enemyCategory : scene.playerCategory;
    const collidesWith = isEnemy ? scene.playerCategory : scene.enemyCategory;
    this.setCollisionCategory(collisionCategory);
    this.setCollidesWith([collidesWith, scene.wallCategory]);

    // 创建血条
    this.createHealthBar();

    this.setDepth(2); // 设置深度确保在 Barracks 之上
    scene.add.existing(this);
    console.log('Unit created at', x, y, 'texture:', config.textureKey, 'visible:', this.visible, 'alpha:', this.alpha, 'scale:', this.scale);
  }

  static createTexture(scene, config) {
    console.log('Creating unit texture for', config.textureKey);
    // 创建一个简单的圆形纹理作为占位符
    const graphics = scene.add.graphics();
    graphics.fillStyle(Phaser.Display.Color.HexStringToColor(config.color).color);
    graphics.fillCircle(20, 20, 20);
    graphics.generateTexture(config.textureKey, 40, 40);
    graphics.destroy();
    console.log('Unit texture created:', config.textureKey, 'exists:', scene.textures.exists(config.textureKey));
  }

  createHealthBar() {
    // 创建血条背景
    this.healthBarBg = this.scene.add.rectangle(0, -30, 40, 4, 0x000000);
    this.healthBarBg.setStrokeStyle(1, 0xffffff);

    // 创建血条前景
    this.healthBarFg = this.scene.add.rectangle(0, -30, 40, 4, 0x00ff00);

    // 将血条添加到单位容器中
    this.healthBarBg.setOrigin(0.5);
    this.healthBarFg.setOrigin(0.5);

    // 设置血条深度
    this.healthBarBg.setDepth(10);
    this.healthBarFg.setDepth(11);
  }

  update(time, delta) {
    if (this.hp <= 0) return;

    // 更新血条位置
    this.healthBarBg.x = this.x;
    this.healthBarBg.y = this.y - 30;
    this.healthBarFg.x = this.x;
    this.healthBarFg.y = this.y - 30;

    // 更新血条长度
    const healthPercent = this.hp / this.maxHp;
    this.healthBarFg.width = 40 * healthPercent;

    // 改变血条颜色
    if (healthPercent > 0.6) {
      this.healthBarFg.fillColor = 0x00ff00; // 绿
    } else if (healthPercent > 0.3) {
      this.healthBarFg.fillColor = 0xffff00; // 黄
    } else {
      this.healthBarFg.fillColor = 0xff0000; // 红
    }

    // 简单的 AI 逻辑
    if (this.state === 'MOVE') {
      this.findTarget();
      this.moveToTarget();
      this.tryAttack(time);
    }

    // 边界检查：掉出地图死亡
    if (this.y > 800 || this.y < -100 || this.x < -100 || this.x > 1100) {
      this.takeDamage(9999);
    }
  }

  findTarget() {
    // 寻找最近的敌对单位
    const enemies = this.isEnemy ? this.scene.playerUnits : this.scene.enemyUnits;
    let closest = null;
    let minDist = 99999;

    enemies.children.each(e => {
      if (!e.active || e.hp <= 0) return;
      const dist = Phaser.Math.Distance.Between(this.x, this.y, e.x, e.y);
      if (dist < minDist) {
        minDist = dist;
        closest = e;
      }
    });

    // 如果没有兵，就冲向对方基地
    if (!closest) {
      this.target = this.isEnemy ? this.scene.playerBase : this.scene.enemyBase;
    } else {
      this.target = closest;
    }
  }

  moveToTarget() {
    if (!this.target) return;

    // 施加力向目标移动 (物理方式)
    const angle = Phaser.Math.Angle.Between(this.x, this.y, this.target.x, this.target.y);
    const speed = 0.002 * (this.config.mass / 10); // 质量越大推力越大

    this.applyForce(new Phaser.Math.Vector2(Math.cos(angle) * speed, Math.sin(angle) * speed));

    // 限制最大速度
    if (this.body.speed > 5) {
      this.setVelocity(this.body.velocity.x * 0.95, this.body.velocity.y * 0.95);
    }
  }

  tryAttack(time) {
    if (!this.target || time - this.lastAttackTime < this.attackCooldown / this.attackSpeedMultiplier) return;

    const dist = Phaser.Math.Distance.Between(this.x, this.y, this.target.x, this.target.y);
    if (dist < 60) { // 攻击范围
      this.lastAttackTime = time;
      const actualDamage = this.damage * this.damageMultiplier;

      // 对目标造成伤害
      if (this.target.takeDamage) {
        this.target.takeDamage(actualDamage);
      }

      // 如果有护盾，先扣护盾
      if (this.shield > 0) {
        const shieldDamage = Math.min(actualDamage, this.shield);
        this.shield -= shieldDamage;
      }

      // 爆炸效果（川妹羁绊）
      if (this.hasExplosion && dist < 40) {
        this.explodeNearbyEnemies(actualDamage * 0.5);
      }
    }
  }

  explodeNearbyEnemies(damage) {
    const enemies = this.isEnemy ? this.scene.playerUnits : this.scene.enemyUnits;
    enemies.children.each(e => {
      if (!e.active || e.hp <= 0) return;
      const dist = Phaser.Math.Distance.Between(this.x, this.y, e.x, e.y);
      if (dist < 80) { // 爆炸范围
        e.takeDamage(damage);
      }
    });
  }

  takeDamage(amount) {
    // 先扣护盾
    if (this.shield > 0) {
      const shieldDamage = Math.min(amount, this.shield);
      this.shield -= shieldDamage;
      amount -= shieldDamage;
    }

    if (amount <= 0) return;

    this.hp -= amount;

    // 飘字效果
    this.scene.showDamageText(this.x, this.y, Math.round(amount));

    // 受伤闪烁效果
    this.scene.tweens.add({
      targets: this,
      alpha: 0.5,
      duration: 100,
      yoyo: true,
      repeat: 2
    });

    if (this.hp <= 0) {
      this.die();
    }
  }

  die() {
    this.state = 'DEAD';

    // 销毁血条
    if (this.healthBarBg) this.healthBarBg.destroy();
    if (this.healthBarFg) this.healthBarFg.destroy();

    // 死亡动画
    this.scene.tweens.add({
      targets: this,
      scale: 0,
      alpha: 0,
      duration: 300,
      onComplete: () => {
        this.setActive(false);
        this.setVisible(false);
        if (this.world && this.body) {
          this.world.remove(this.body);
        }
        this.destroy();
      }
    });
  }
}
