'use client';

// 这一行虽然不能完全阻止SSR报错，但必须加上

import { useEffect, useRef } from 'react';
import * as Phaser from 'phaser';

// === 您的游戏逻辑 ===
class MainScene extends Phaser.Scene {
  player: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody | null = null;

  cursors: Phaser.Types.Input.Keyboard.CursorKeys | null = null;

  constructor() {
    super('MainScene');
  }

  preload() {
    // 1. 加载主角
    this.load.image('sui', '/images/sui-bird-jump.png');

    // 2. 绘制圆角矩形地板纹理
    const graphics = this.make.graphics({ x: 0, y: 0 });
    graphics.fillStyle(0x5e3f28, 1); // 深棕色
    graphics.fillRoundedRect(0, 0, 200, 32, 8);
    graphics.fillStyle(0x8b5a2b, 1); // 浅棕色
    graphics.fillRoundedRect(4, 4, 192, 24, 6);
    graphics.generateTexture('platform_texture', 200, 32);
  }

  create() {
    const platforms = this.physics.add.staticGroup();

    // 底部地板
    platforms.create(200, 580, 'platform_texture').setScale(2, 1).refreshBody();
    platforms.create(600, 580, 'platform_texture').setScale(2, 1).refreshBody();

    // 空中平台
    platforms.create(600, 450, 'platform_texture');
    platforms.create(100, 350, 'platform_texture');
    platforms.create(700, 250, 'platform_texture');
    platforms.create(350, 200, 'platform_texture').setScale(0.5, 1).refreshBody(); // 窄平台
    platforms.create(550, 200, 'platform_texture').setScale(0.5, 1).refreshBody();

    // 主角
    this.player = this.physics.add.sprite(100, 500, 'sui');
    this.player.setBounce(0.1);
    this.player.setCollideWorldBounds(true);
    this.player.setScale(0.4);

    // 瘦身核心代码
    const bodyWidth = this.player.width * 0.5;
    const bodyHeight = this.player.height * 0.6;
    this.player.body.setSize(bodyWidth, bodyHeight);
    this.player.body.setOffset(
      (this.player.width - bodyWidth) / 2,
      (this.player.height - bodyHeight) / 2 + 10,
    );

    this.physics.add.collider(this.player, platforms);

    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys();
    }
  }

  update() {
    if (!this.player || !this.cursors) return;
    const speed = 300;

    if (this.cursors.left.isDown) {
      this.player.setVelocityX(-speed);
      this.player.setFlipX(false);
    } else if (this.cursors.right.isDown) {
      this.player.setVelocityX(speed);
      this.player.setFlipX(true);
    } else {
      this.player.setVelocityX(0);
    }

    const isTouchingGround = this.player.body.touching.down || this.player.body.blocked.down;
    if (this.cursors.up.isDown && isTouchingGround) {
      this.player.setVelocityY(-550);
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
        arcade: { gravity: { x: 0, y: 600 }, debug: false }, // debug: true 可以看绿色的碰撞框
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
    <div ref={gameContainer} className="border-4 border-yellow-600 rounded-lg overflow-hidden shadow-2xl" />
  );
}
