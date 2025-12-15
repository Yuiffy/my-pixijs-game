// src/components/autoChessGame/scenes/BootScene.ts
import * as Phaser from 'phaser';

export default class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload() {
    // 创建加载进度条
    const progressBar = this.add.graphics();
    const progressBox = this.add.graphics();
    progressBox.fillStyle(0x222222, 0.8);
    progressBox.fillRect(240, 270, 320, 50);

    const loadingText = this.make.text({
      x: 400,
      y: 250,
      text: 'Loading...',
      style: {
        font: '20px monospace',
        color: '#ffffff'
      }
    });
    loadingText.setOrigin(0.5, 0.5);

    const percentText = this.make.text({
      x: 400,
      y: 295,
      text: '0%',
      style: {
        font: '18px monospace',
        color: '#ffffff'
      }
    });
    percentText.setOrigin(0.5, 0.5);

    // 加载进度回调
    this.load.on('progress', (value: number) => {
      progressBar.clear();
      progressBar.fillStyle(0xffffff, 1);
      progressBar.fillRect(250, 280, 300 * value, 30);
      percentText.setText(`${Math.round(value * 100)}%`);
    });

    this.load.on('complete', () => {
      progressBar.destroy();
      progressBox.destroy();
      loadingText.destroy();
      percentText.destroy();
    });

    // 这里可以预加载资源，比如图片、音频等
    // 目前使用程序生成的纹理，所以这里暂时不需要加载外部资源

    // 可以添加一些音频文件（如果有的话）
    // this.load.audio('backgroundMusic', 'assets/audio/bg.mp3');
  }

  create() {
    // 加载完成后进入主场景
    this.scene.start('MainScene');
  }
}
