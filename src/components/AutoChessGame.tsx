'use client';

import { useEffect, useRef } from 'react';

// 动态导入 Phaser，防止服务端渲染报错
export default function AutoChessGame() {
  const gameContainer = useRef(null);
  const gameRef = useRef(null);

  useEffect(() => {
    let PhaserModule;

    // 异步加载 Phaser
    const initGame = async () => {
      if (typeof window !== 'undefined') {
        PhaserModule = (await import('phaser')).default;

        // --- 核心场景逻辑 ---
        class MainScene extends PhaserModule.Scene {
          constructor() {
            super('MainScene');
            this.suiStack = 0; // 川妹阵营层数
            this.stackText = null;
          }

          preload() {
            // MVP技巧：直接用 Emoji 生成纹理，不需要找图！
            this.createEmojiTexture('sui_avatar', '💃', '#ffcccc'); // 岁己
            this.createEmojiTexture('enemy_avatar', '👾', '#ccffcc'); // 敌人
          }

          createEmojiTexture(key, emoji, color) {
            const canvas = document.createElement('canvas');
            canvas.width = 64;
            canvas.height = 64;
            const ctx = canvas.getContext('2d');

            // 画个背景圆
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(32, 32, 30, 0, Math.PI * 2);
            ctx.fill();

            // 画 Emoji
            ctx.font = '40px serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#000';
            ctx.fillText(emoji, 32, 34);

            this.textures.addCanvas(key, canvas);
          }

          create() {
            // 1. 设置世界边界 (墙壁)，并在四周增加弹性
            this.matter.world.setBounds(0, 0, 800, 600, 32, true, true, true, true);

            // 2. UI 显示层数
            this.stackText = this.add.text(16, 16, '川妹层数: 0 (热辣度)', {
              fontSize: '24px',
              fill: '#ffffff',
              backgroundColor: '#ff0000',
              padding: { x: 10, y: 5 }
            });

            // 3. 碰撞监听 (核心玩法：撞击叠层)
            this.matter.world.on('collisionstart', (event) => {
              event.pairs.forEach((pair) => {
                const { bodyA } = pair;
                const { bodyB } = pair;

                // 简单的动能计算 (近似)
                const speedA = bodyA.speed || 0;
                const speedB = bodyB.speed || 0;
                const impact = speedA + speedB;

                // 如果撞得够狠，且其中一个是岁己
                if (impact > 10) {
                  // 简单的特效：撞击处产生一个震动
                  this.cameras.main.shake(50, 0.005);

                  // 检查是否触发叠层 (这里简单假设只要有力撞击就叠层)
                  // 实际逻辑中你会判断 gameObject.type === 'SUI'
                  this.suiStack += 1;
                  this.updateUI();
                }
              });
            });

            // 4. 定时出兵机制 ("战就战"模式)
            this.time.addEvent({
              delay: 2000, // 每2秒出一个兵
              callback: this.spawnSui,
              callbackScope: this,
              loop: true
            });

            this.time.addEvent({
              delay: 3000, // 敌人出兵慢一点
              callback: this.spawnEnemy,
              callbackScope: this,
              loop: true
            });

            // 提示
            this.add.text(400, 550, '点击屏幕发射“上帝之手”冲击波', { fontSize: '16px', fill: '#aaa' }).setOrigin(0.5);

            // 5. 鼠标交互：上帝技能 (像愤怒的小鸟一样施加力)
            this.input.on('pointerdown', (pointer) => {
              // 在点击位置产生爆炸力
              const bodies = this.matter.world.getAllBodies();
              bodies.forEach(body => {
                const { gameObject } = body;
                if (gameObject) {
                  const angle = PhaserModule.Math.Angle.Between(pointer.x, pointer.y, gameObject.x, gameObject.y);
                  // 距离越近力越大
                  const dist = PhaserModule.Math.Distance.Between(pointer.x, pointer.y, gameObject.x, gameObject.y);
                  if (dist < 200) {
                    const force = 0.05;
                    gameObject.applyForce({ x: Math.cos(angle) * force, y: Math.sin(angle) * force });
                  }
                }
              });
            });
          }

          spawnSui() {
            const x = PhaserModule.Math.Between(50, 100);
            const y = PhaserModule.Math.Between(100, 500);
            const sui = this.matter.add.sprite(x, y, 'sui_avatar');

            // 物理属性设置 (像皮球一样)
            sui.setCircle(30);
            sui.setBounce(0.8);
            sui.setFriction(0.005);
            sui.setMass(2); // 稍微重一点
            sui.setData('type', 'SUI'); // 标记身份

            // 出生特效：扭曲弹入 (MVP要求的扭曲效果)
            this.tweens.add({
              targets: sui,
              scaleX: { from: 0, to: 1 },
              scaleY: { from: 0, to: 1 },
              ease: 'Elastic',
              duration: 1000
            });

            // 简单的 AI：永远向右冲
            sui.setVelocityX(5);
          }

          spawnEnemy() {
            const x = PhaserModule.Math.Between(700, 750);
            const y = PhaserModule.Math.Between(100, 500);
            const enemy = this.matter.add.sprite(x, y, 'enemy_avatar');

            enemy.setCircle(30);
            enemy.setBounce(0.5);
            enemy.setMass(1);
            enemy.setData('type', 'ENEMY');

            // 简单的 AI：永远向左冲
            enemy.setVelocityX(-3);
          }

          updateUI() {
            let bonus = "";
            if (this.suiStack >= 10) bonus = " (已激活：红油锅底!)";
            this.stackText.setText(`川妹层数: ${this.suiStack}${bonus}`);

            // 视觉反馈：层数越高，文字越红
            if (this.suiStack % 5 === 0) {
              this.tweens.add({
                targets: this.stackText,
                scale: 1.2,
                duration: 100,
                yoyo: true
              });
            }
          }
        }

        // --- Phaser 配置 ---
        const config = {
          type: PhaserModule.AUTO,
          width: 800,
          height: 600,
          parent: gameContainer.current,
          backgroundColor: '#2d2d2d',
          physics: {
            default: 'matter', // 使用 Matter.js 物理引擎
            matter: {
              gravity: { y: 0 }, // 俯视视角，没有重力 (或者可以设为 1 做侧视图)
              debug: true // 开启调试模式，可以看到碰撞框
            }
          },
          scene: MainScene
        };

        gameRef.current = new PhaserModule.Game(config);
      }
    };

    initGame();

    return () => {
      if (gameRef.current) {
        gameRef.current.destroy(true);
      }
    };
  }, []);

  return (
    <div style={{ display: 'flex', justifyContent: 'center', marginTop: '20px' }}>
      <div ref={gameContainer} style={{ border: '4px solid #444', borderRadius: '8px' }} />
    </div>
  );
}
