// src/components/autoChessGame/scenes/TitleScene.ts
import * as Phaser from 'phaser';

export default class TitleScene extends Phaser.Scene {
  constructor() {
    super('TitleScene');
  }

  create() {
    // 背景
    this.cameras.main.setBackgroundColor('#2c3e50');

    // 标题
    const titleText = this.add.text(500, 200, '自走棋大战', {
      fontSize: '48px',
      color: '#ffffff'
    });
    titleText.setOrigin(0.5);

    // 副标题
    const subtitleText = this.add.text(500, 260, 'Auto Chess Battle', {
      fontSize: '24px',
      color: '#cccccc'
    });
    subtitleText.setOrigin(0.5);

    // 游戏说明
    const instructions = [
      '🎯 目标：放置兵营，击败敌军波次',
      '🏰 兵营：自动生产单位进行战斗',
      '⚔️ 羁绊：相同阵营单位数量越多，效果越强',
      '💰 金币：用于购买和刷新商店',
      '🎮 玩法：购买单位 → 点击地图放置 → 等待战斗'
    ];

    instructions.forEach((text, index) => {
      const instructionText = this.add.text(500, 320 + index * 30, text, {
        fontSize: '16px',
        color: '#ffffff'
      });
      instructionText.setOrigin(0.5);
    });

    // 开始游戏按钮
    const startButton = this.add.text(500, 500, '开始游戏', {
      fontSize: '32px',
      color: '#ffffff',
      backgroundColor: '#27ae60',
      padding: { x: 20, y: 10 }
    });
    startButton.setOrigin(0.5);
    startButton.setInteractive();

    startButton.on('pointerdown', () => {
      this.scene.start('MainScene');
    });

    startButton.on('pointerover', () => {
      startButton.setStyle({ backgroundColor: '#2ecc71' });
    });

    startButton.on('pointerout', () => {
      startButton.setStyle({ backgroundColor: '#27ae60' });
    });

    // 添加一些装饰元素
    this.createDecorations();
  }

  createDecorations() {
    // 创建一些随机的装饰单位图标
    const emojis = ['🥘', '🔫', '🎋', '🔮', '🚁'];
    const colors = ['#ffcccc', '#ccffff', '#ccffcc', '#ccccff', '#ffccff'];

    for (let i = 0; i < 20; i++) {
      const x = Math.random() * 1000;
      const y = Math.random() * 600;
      const emoji = emojis[Math.floor(Math.random() * emojis.length)];
      const color = colors[Math.floor(Math.random() * colors.length)];

      const decoration = this.add.text(x, y, emoji, {
        fontSize: '24px',
        color
      });

      // 添加浮动动画
      this.tweens.add({
        targets: decoration,
        y: y + Math.random() * 20 - 10,
        duration: 2000 + Math.random() * 1000,
        ease: 'Sine.easeInOut',
        yoyo: true,
        repeat: -1
      });
    }
  }
}
