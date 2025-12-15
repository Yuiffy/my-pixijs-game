// src/components/autoChessGame/objects/Unit.ts
import * as Phaser from 'phaser';

export default class Unit extends Phaser.Physics.Matter.Sprite {
  constructor(scene, x, y, config, isEnemy = false) {
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

    scene.add.existing(this);
  }

  static createTexture(scene, config) {
    console.log(`Creating texture for ${config.name}: ${config.textureKey}, emoji: ${config.emoji}, color: ${config.color}`);

    // 使用canvas创建纹理以正确显示emoji
    const canvas = document.createElement('canvas');
    canvas.width = 40;
    canvas.height = 40;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      console.error('Failed to get canvas context');
      return;
    }

    // 清空canvas
    ctx.clearRect(0, 0, 40, 40);

    // 背景圆
    ctx.fillStyle = config.color || '#ffffff';
    ctx.beginPath();
    ctx.arc(20, 20, 18, 0, Math.PI * 2);
    ctx.fill();

    // 描边
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 绘制emoji - 使用更好的字体设置
    ctx.font = '20px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Android Emoji", "EmojiSymbols", "EmojiOne Mozilla", "Twemoji Mozilla", "Segoe UI Symbol", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#000000';
    ctx.fillText(config.emoji || '⚪', 20, 20);

    // 添加到Phaser纹理
    scene.textures.addCanvas(config.textureKey, canvas);

    console.log(`Texture created: ${config.textureKey} with emoji: ${config.emoji}`);
  }

  createHealthBar() {
    // 创建血条背景
    this.healthBarBg = this.scene.add.rectangle(0, -30, 40, 4, 0x000000);
    this.healthBarBg.setStrokeStyle(1, 0xffffff);

    // 创建血条前景 - 根据敌我区分颜色
    const healthColor = this.isEnemy ? 0xff0000 : 0x00ff00; // 敌方红色，我方绿色
    this.healthBarFg = this.scene.add.rectangle(0, -30, 40, 4, healthColor);

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

    // 边界约束：防止单位离开地图
    this.constrainToBattlefield();

    // 边界检查：掉出地图死亡（作为最后手段）
    if (this.y > 500 || this.y < 50 || this.x < 50 || this.x > 950) {
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
    const attackRange = this.config.attackRange || 60; // 默认近战范围60

    if (dist < attackRange) {
      this.lastAttackTime = time;
      const actualDamage = this.damage * this.damageMultiplier;

      // 检查是否是远程攻击
      if (this.config.attackRange && this.config.attackRange > 60) {
        // 远程攻击：创建弹道
        this.createProjectile(this.target, actualDamage);
      } else {
        // 近战攻击：直接造成伤害
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
  }

  createProjectile(target, damage) {
    // 创建弹道效果
    const projectile = this.scene.add.circle(this.x, this.y, 3, this.isEnemy ? 0xff0000 : 0x00ff00);
    projectile.setDepth(15);

    // 计算飞行方向
    const angle = Phaser.Math.Angle.Between(this.x, this.y, target.x, target.y);
    const distance = Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y);
    const speed = 8; // 弹道飞行速度
    const duration = (distance / speed) * 1000; // 飞行时间（毫秒）

    // 弹道动画
    this.scene.tweens.add({
      targets: projectile,
      x: target.x,
      y: target.y,
      duration,
      ease: 'Linear',
      onComplete: () => {
        // 弹道命中
        if (target.takeDamage) {
          target.takeDamage(damage);

          // 创建命中特效
          const hitEffect = this.scene.add.circle(target.x, target.y, 10, 0xffffff, 0.5);
          hitEffect.setDepth(20);
          this.scene.tweens.add({
            targets: hitEffect,
            scale: 2,
            alpha: 0,
            duration: 200,
            onComplete: () => hitEffect.destroy()
          });
        }

        // 销毁弹道
        projectile.destroy();
      }
    });

    // 弹道轨迹效果（可选）
    if (this.config.skill === 'ranged_attack') {
      // 弓箭手：添加箭羽效果
      const arrow = this.scene.add.text(this.x, this.y, '🏹', { fontSize: '12px' });
      arrow.setDepth(15);
      this.scene.tweens.add({
        targets: arrow,
        x: target.x,
        y: target.y,
        duration,
        ease: 'Linear',
        onComplete: () => arrow.destroy()
      });
    } else if (this.config.skill === 'fire_breath') {
      // 火龙：添加火焰效果
      const fire = this.scene.add.text(this.x, this.y, '🔥', { fontSize: '16px' });
      fire.setDepth(15);
      this.scene.tweens.add({
        targets: fire,
        x: target.x,
        y: target.y,
        duration,
        ease: 'Linear',
        onComplete: () => fire.destroy()
      });
    } else if (this.config.skill === 'snipe') {
      // 狙击手：添加狙击线效果
      const laser = this.scene.add.rectangle(this.x, this.y, distance, 2, 0xff0000);
      laser.setRotation(angle);
      laser.setDepth(15);
      this.scene.tweens.add({
        targets: laser,
        alpha: 0,
        duration: 100,
        onComplete: () => laser.destroy()
      });
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

  constrainToBattlefield() {
    // 战场边界 (避免撞到基地，留出边距，也留出空间给商店)
    const minX = 60; // 左边界，留出空间
    const maxX = 940; // 右边界，留出空间
    const minY = 60; // 上边界，留出空间给UI
    const maxY = 420; // 下边界，留出空间给商店

    // 边界缓冲区大小
    const buffer = 25;

    let forceX = 0;
    let forceY = 0;

    // X轴边界约束
    if (this.x < minX + buffer) {
      forceX = (minX + buffer - this.x) * 0.005; // 向右推
    } else if (this.x > maxX - buffer) {
      forceX = (maxX - buffer - this.x) * 0.005; // 向左推
    }

    // Y轴边界约束
    if (this.y < minY + buffer) {
      forceY = (minY + buffer - this.y) * 0.005; // 向下推
    } else if (this.y > maxY - buffer) {
      forceY = (maxY - buffer - this.y) * 0.005; // 向上推
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

  die() {
    this.state = 'DEAD';

    // 销毁血条
    if (this.healthBarBg) this.healthBarBg.destroy();
    if (this.healthBarFg) this.healthBarFg.destroy();

    // 立即停止所有tween动画
    if (this.scene && this.scene.tweens) {
      this.scene.tweens.killTweensOf(this);
    }

    // 从group中移除并奖励金币
    const mainScene = this.scene as any;
    if (mainScene.playerUnits && mainScene.playerUnits.children) {
      mainScene.playerUnits.remove(this);
    }
    if (mainScene.enemyUnits && mainScene.enemyUnits.children) {
      mainScene.enemyUnits.remove(this);
    }

    // 如果是敌方单位死亡，给玩家奖励金币
    if (this.isEnemy && mainScene.playerGold !== undefined) {
      const goldReward = 1; // 每个敌方单位奖励1金币
      mainScene.playerGold += goldReward;
      mainScene.game.events.emit('GOLD_CHANGED', mainScene.playerGold);
      console.log(`Enemy defeated! +${goldReward} gold, total: ${mainScene.playerGold}`);
    }

    // 移除body
    if (this.body && this.world) {
      this.world.remove(this.body);
    }

    // 立即销毁，不使用动画
    this.setActive(false);
    this.setVisible(false);
    this.destroy();
  }
}
