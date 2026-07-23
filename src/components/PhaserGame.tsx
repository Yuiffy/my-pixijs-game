'use client';

import { useEffect, useRef } from 'react';
import * as Phaser from 'phaser';

class MainScene extends Phaser.Scene {
  player: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody | null = null;

  platforms: Phaser.Physics.Arcade.StaticGroup | null = null;

  // 键位控制
  cursors: Phaser.Types.Input.Keyboard.CursorKeys | null = null;

  wasd: {
    up: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
    dash: Phaser.Input.Keyboard.Key;
    dashAlt: Phaser.Input.Keyboard.Key;
    restart: Phaser.Input.Keyboard.Key;
  } | null = null;

  // UI 与 状态
  scoreText: Phaser.GameObjects.Text | null = null;

  dashText: Phaser.GameObjects.Text | null = null;

  score: number = 0;

  highestY: number = 0;

  minCameraY: number = 0;

  // 游戏逻辑变量
  canDash: boolean = true;

  isDashing: boolean = false;

  isGameOver: boolean = false;

  constructor() {
    super('MainScene');
  }

  preload() {
    this.load.image('sui', '/images/sui-bird-jump.png');

    const graphics = this.make.graphics({ x: 0, y: 0 });
    graphics.fillStyle(0x5e3f28, 1);
    graphics.fillRoundedRect(0, 0, 200, 32, 8);
    graphics.fillStyle(0x8b5a2b, 1);
    graphics.fillRoundedRect(4, 4, 192, 24, 6);
    graphics.generateTexture('platform_texture', 200, 32);
  }

  create() {
    // === 初始化变量 ===
    this.score = 0;
    this.highestY = 600;
    this.minCameraY = 0;
    this.canDash = true;
    this.isDashing = false;
    this.isGameOver = false;

    // 取消底部碰撞
    this.physics.world.setBoundsCollision(true, true, false, false);

    // === 创建平台 ===
    this.platforms = this.physics.add.staticGroup();
    for (let i = 0; i < 10; i += 1) {
      this.spawnPlatform(i === 0);
    }

    // === 创建主角 ===
    this.player = this.physics.add.sprite(400, 450, 'sui');
    this.player.setBounce(0.1);
    this.player.setCollideWorldBounds(true);
    this.player.setScale(0.4);
    // 确保主角渲染在闪电之下，或者之上，这里设高一点避免被普通平台遮挡
    this.player.setDepth(10);

    const bodyWidth = this.player.width * 0.5;
    const bodyHeight = this.player.height * 0.85;
    this.player.body.setSize(bodyWidth, bodyHeight);
    this.player.body.setOffset(
      (this.player.width - bodyWidth) / 2,
      (this.player.height - bodyHeight) / 2 + 10,
    );

    if (this.platforms) {
      this.physics.add.collider(this.player, this.platforms);
    }

    // === 摄像机 ===
    this.cameras.main.centerOn(400, 300);
    this.cameras.main.setBackgroundColor('#1a1a2e');

    // === 绑定按键 ===
    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys();
      this.wasd = this.input.keyboard.addKeys({
        up: Phaser.Input.Keyboard.KeyCodes.W,
        left: Phaser.Input.Keyboard.KeyCodes.A,
        down: Phaser.Input.Keyboard.KeyCodes.S,
        right: Phaser.Input.Keyboard.KeyCodes.D,
        dash: Phaser.Input.Keyboard.KeyCodes.SHIFT,
        dashAlt: Phaser.Input.Keyboard.KeyCodes.K,
        restart: Phaser.Input.Keyboard.KeyCodes.R,
      }) as any;
    }

    // === UI 显示 ===
    this.scoreText = this.add.text(16, 16, 'Score: 0', {
      fontSize: '32px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 4,
    }).setScrollFactor(0).setDepth(20);

    this.dashText = this.add.text(16, 50, 'DASH: READY', {
      fontSize: '20px',
      color: '#ffff00', // 初始改为雷电黄
      stroke: '#000000',
      strokeThickness: 2,
    }).setScrollFactor(0).setDepth(20);
  }

  spawnPlatform(isStartPlatform = false) {
    if (!this.platforms) return;

    let x; let
      y;
    if (isStartPlatform) {
      x = 400; y = 580;
    } else {
      x = Phaser.Math.Between(50, 750);
      y = this.highestY - Phaser.Math.Between(90, 170);
    }

    const platform = this.platforms.create(x, y, 'platform_texture');
    const scale = isStartPlatform ? 2 : Phaser.Math.FloatBetween(0.5, 1.0);
    platform.setScale(scale, 1).refreshBody();

    if (y < this.highestY) this.highestY = y;

    platform.body.checkCollision.down = false;
    platform.body.checkCollision.left = false;
    platform.body.checkCollision.right = false;
  }

  performDash() {
    if (!this.canDash || !this.player || this.isGameOver) return;

    this.canDash = false;
    this.isDashing = true;

    const dashSpeed = 1500;
    const direction = this.player.flipX ? 1 : -1;

    this.player.setVelocityX(direction * dashSpeed);
    this.player.setVelocityY(-200);
    this.player.body.allowGravity = false;

    // ⚡ 视觉特效：雷之呼吸
    this.player.setTint(0xffff00); // 变身金黄色
    this.dashText?.setText('THUNDER FLASH!').setColor('#ffff00');

    // 生成多个闪电粒子
    for (let i = 0; i < 8; i += 1) {
      // 随机分布在玩家周围
      const offsetX = Phaser.Math.Between(-40, 40);
      const offsetY = Phaser.Math.Between(-40, 40);

      const lightning = this.add.text(this.player.x + offsetX, this.player.y + offsetY, '⚡', {
        fontSize: `${Phaser.Math.Between(20, 45)}px`,
      });

      lightning.setOrigin(0.5);
      lightning.setAlpha(0.8); // 半透明
      lightning.setDepth(15); // 在玩家上面

      // 粒子动画：向后飞散 + 消失
      this.tweens.add({
        targets: lightning,
        x: lightning.x - (direction * 100), // 向冲刺反方向拖尾
        y: lightning.y + Phaser.Math.Between(-20, 20),
        alpha: 0,
        scale: 0.5,
        duration: 350,
        ease: 'Power2',
        onComplete: () => lightning.destroy(),
      });
    }

    this.time.delayedCall(250, () => {
      this.isDashing = false;
      if (this.player?.body) {
        this.player.body.allowGravity = true;
        this.player.setVelocityX(this.player.body.velocity.x * 0.5);
        this.player.setTint(0x888888); // 冷却变灰
      }
      this.dashText?.setText('Charging...').setColor('#aaaaaa');
    });

    this.time.delayedCall(1000, () => {
      this.canDash = true;
      if (this.player?.active && !this.isGameOver) {
        this.player.clearTint();
      }
      this.dashText?.setText('DASH: READY').setColor('#ffff00'); // 冷却完毕变黄
    });
  }

  showGameOver() {
    if (this.isGameOver) return;
    this.isGameOver = true;

    this.physics.pause();
    if (this.player) this.player.setTint(0xff0000);

    const centerX = 400;
    const centerY = 300;

    const bg = this.add.rectangle(centerX, centerY, 800, 600, 0x000000, 0.7);
    bg.setScrollFactor(0).setDepth(30);

    this.add.text(centerX, centerY - 50, 'GAME OVER', {
      fontSize: '64px',
      color: '#ff4444',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 6,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(31);

    this.add.text(centerX, centerY + 30, `Final Score: ${this.score}`, {
      fontSize: '48px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(31);

    this.add.text(centerX, centerY + 100, 'Click or Press R to Restart', {
      fontSize: '24px',
      color: '#aaaaaa',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(31);

    this.input.once('pointerdown', () => this.scene.restart());
    if (this.input.keyboard) {
      this.input.keyboard.once('keydown-R', () => this.scene.restart());
    }
  }

  update() {
    if (!this.player || !this.cursors || !this.platforms || !this.wasd || this.isGameOver) return;

    if (this.isDashing) {
      this.checkGameStatus();
      return;
    }

    const left = this.cursors.left.isDown || this.wasd.left.isDown;
    const right = this.cursors.right.isDown || this.wasd.right.isDown;
    const up = this.cursors.up.isDown || this.wasd.up.isDown || this.cursors.space.isDown;
    const dash = Phaser.Input.Keyboard.JustDown(this.cursors.shift)
                 || Phaser.Input.Keyboard.JustDown(this.wasd.dash)
                 || Phaser.Input.Keyboard.JustDown(this.wasd.dashAlt);

    const speed = 300;
    if (left) {
      this.player.setVelocityX(-speed);
      this.player.setFlipX(false);
    } else if (right) {
      this.player.setVelocityX(speed);
      this.player.setFlipX(true);
    } else {
      this.player.setVelocityX(0);
    }

    const isTouchingGround = this.player.body.touching.down;
    if (up && isTouchingGround) {
      this.player.setVelocityY(-600);
    }

    if (dash) {
      this.performDash();
    }

    this.checkGameStatus();
  }

  checkGameStatus() {
    if (!this.player || !this.platforms) return;

    // --- 摄像机 ---
    const targetCamY = this.player.y - 200;
    if (this.minCameraY === 0) this.minCameraY = this.cameras.main.scrollY;
    if (targetCamY < this.minCameraY) {
      this.minCameraY = targetCamY;
      this.cameras.main.scrollY = this.minCameraY;
    }

    // --- 平台循环 ---
    const cameraBottom = this.cameras.main.scrollY + 600;
    this.platforms.getChildren().forEach((child) => {
      const platform = child as Phaser.Physics.Arcade.Sprite;
      if (platform.y > cameraBottom + 50) {
        platform.y = this.highestY - Phaser.Math.Between(100, 170);
        platform.x = Phaser.Math.Between(50, 750);
        this.highestY = platform.y;
        platform.setScale(Phaser.Math.FloatBetween(0.5, 1.0), 1).refreshBody();
      }
    });

    // --- 死亡判定 ---
    if (this.player.y > cameraBottom + 100) {
      this.showGameOver();
    }

    // --- 分数 ---
    const currentScore = Math.max(0, Math.floor((600 - this.player.y) / 10));
    if (currentScore > this.score) {
      this.score = currentScore;
      this.scoreText?.setText(`Score: ${this.score}`);
    }
  }
}

export default function PhaserGame() {
  const gameContainer = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!gameContainer.current) return;
    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      width: 800,
      height: 600,
      parent: gameContainer.current,
      physics: {
        default: 'arcade',
        arcade: {
          gravity: { x: 0, y: 1000 },
          debug: false,
        },
      },
      scene: [MainScene],
    };
    const newGame = new Phaser.Game(config);
    // eslint-disable-next-line consistent-return
    return () => {
      newGame.destroy(true);
    };
  }, []);

  return (
    <div className="flex flex-col items-center">
      <div ref={gameContainer} className="border-4 border-yellow-600 rounded-lg overflow-hidden shadow-2xl" />

      {/* 更新操作说明 */}
      <div className="mt-6 bg-gray-800 p-4 rounded-lg text-gray-300 text-sm max-w-2xl text-center shadow-lg border border-gray-700">
        <div className="grid grid-cols-2 gap-x-8 gap-y-2">
          <div className="text-right font-bold text-white">移动 / Move:</div>
          <div className="text-left">
            <span className="bg-gray-700 px-2 py-1 rounded text-white">WASD</span>
            {' '}
            或
            {' '}
            <span className="bg-gray-700 px-2 py-1 rounded text-white">← ↑ →</span>
          </div>

          <div className="text-right font-bold text-white">冲刺 / Dash:</div>
          <div className="text-left">
            <span className="bg-gray-700 px-2 py-1 rounded text-white">Shift</span>
            {' '}
            或
            {' '}
            <span className="bg-gray-700 px-2 py-1 rounded text-white">K</span>
          </div>

          <div className="text-right font-bold text-white">重开 / Restart:</div>
          <div className="text-left">
            <span className="bg-gray-700 px-2 py-1 rounded text-white">R</span>
            {' '}
            或
            {' '}
            <span className="bg-gray-700 px-2 py-1 rounded text-white">点击屏幕</span>
          </div>
        </div>
        <p className="mt-3 text-xs text-yellow-500">Tips: 冲刺 (Shift) 现在附带雷电特效！⚡</p>
      </div>
    </div>
  );
}
