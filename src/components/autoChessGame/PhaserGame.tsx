// src/components/autoChessGame/PhaserGame.tsx

'use client';

import { useEffect, useRef, useState } from 'react';
import GameUI from './GameUI';

export default function PhaserGame() {
  const gameContainer = useRef(null);
  const [gameInstance, setGameInstance] = useState(null);

  useEffect(() => {
    let game = null;

    async function initGame() {
      if (typeof window === 'undefined') return;

      try {
        const Phaser = (await import('phaser')).default;
        const BootScene = (await import('./scenes/BootScene')).default;
        const TitleScene = (await import('./scenes/TitleScene')).default;
        const MainScene = (await import('./scenes/MainScene')).default;

        // Phaser 游戏配置
        const config = {
          type: Phaser.AUTO,
          width: 1000,
          height: 600,
          parent: gameContainer.current,
          physics: {
            default: 'matter',
            matter: {
              gravity: { x: 0, y: 0.3 }, // 轻微重力
              debug: process.env.NODE_ENV === 'development', // 只在开发模式显示调试信息
              enableSleeping: false
            }
          },
          scene: [MainScene],
          backgroundColor: '#2c3e50',
          scale: {
            mode: Phaser.Scale.FIT,
            autoCenter: Phaser.Scale.CENTER_BOTH
          }
        };

        game = new Phaser.Game(config);
        setGameInstance(game);

        // 添加一些全局样式
        const style = document.createElement('style');
        style.textContent = `
                    canvas {
                        border-radius: 10px;
                        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
                    }

                    @keyframes pulse {
                        0% { transform: scale(1); }
                        50% { transform: scale(1.02); }
                        100% { transform: scale(1); }
                    }
                `;
        document.head.appendChild(style);

      } catch (error) {
        console.error('Failed to initialize Phaser game:', error);
      }
    }

    initGame();

    // 清理函数
    return () => {
      if (game) {
        game.destroy(true);
        setGameInstance(null);
      }
    };
  }, []);

  return (
    <div style={{
      position: 'relative',
      width: '100%',
      maxWidth: '1000px',
      height: '600px',
      margin: '0 auto',
      borderRadius: '10px',
      overflow: 'hidden'
    }}
    >
      {/* 游戏画布容器 */}
      <div
        ref={gameContainer}
        style={{
          width: '100%',
          height: '100%'
        }}
      />

      {/* UI 覆盖层 */}
      <GameUI gameInstance={gameInstance} />

      {/* 加载提示 */}
      {!gameInstance && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          color: 'white',
          fontSize: '24px',
          textAlign: 'center'
        }}
        >
          <div>正在加载自走棋游戏...</div>
          <div style={{ fontSize: '16px', marginTop: '10px', color: '#ccc' }}>
            准备开始您的战术布局！
          </div>
        </div>
      )}
    </div>
  );
}
