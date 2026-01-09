// src/components/autoChessGame/PhaserGame.tsx

'use client';

import { useEffect, useRef, useState } from 'react';
import GameUI from './GameUI';

import { Game as PhaserGameType } from 'phaser';

let globalGameInstance: PhaserGameType | null = null;
let instanceCount = 0;

export default function PhaserGame() {
  const gameContainer = useRef<HTMLDivElement>(null);
  const [gameInstance, setGameInstance] = useState<PhaserGameType | null>(null);
  const [gameReady, setGameReady] = useState(false);
  const hasInitialized = useRef(false);
  instanceCount++;
  console.log(`PhaserGame component rendered, instance count: ${instanceCount}, has global instance: ${!!globalGameInstance}`);

  useEffect(() => {
    // 防止多次初始化
    if (hasInitialized.current) {
      console.log('Component already initialized, skipping');
      return () => {};
    }
    hasInitialized.current = true;
    // 如果已经有一个全局游戏实例，直接使用它
    if (globalGameInstance) {
      console.log('Using existing global Phaser game instance');
      setGameInstance(globalGameInstance);
      return () => {}; // 早期返回时的清理函数
    }

    let game: any = null;

    async function initGame() {
      if (typeof window === 'undefined') return;

      try {
        const Phaser = (await import('phaser')).default;
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
              debug: false, // 禁用debug模式，避免显示蓝色边框
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
        globalGameInstance = game; // 设置全局实例
        setGameInstance(game);

        // 监听MainScene准备完成事件
        game.events.on('ready', () => {
          console.log('Phaser game is ready!');
          setGameReady(true);
        });

        // 添加调试日志
        console.log('Phaser game initialized:', game);
        console.log('Game canvas:', game.canvas);
        console.log('Canvas style:', game.canvas?.style);
        console.log('Canvas visibility:', window.getComputedStyle(game.canvas).visibility);
        console.log('Canvas display:', window.getComputedStyle(game.canvas).display);
        console.log('Canvas opacity:', window.getComputedStyle(game.canvas).opacity);

        // 强制设置canvas可见性
        if (game.canvas) {
          game.canvas.style.visibility = 'visible';
          game.canvas.style.display = 'block';
          game.canvas.style.opacity = '1';
          console.log('Forced canvas visibility');
        }

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
        globalGameInstance = null; // 清理全局实例
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
      {/* 游戏画布容器 - Phaser游戏层 */}
      <div
        ref={gameContainer}
        style={{
          width: '100%',
          height: '100%',
          position: 'absolute',
          top: 0,
          left: 0,
          zIndex: 5,
          background: 'transparent' // 确保背景透明
        }}
      />

      {/* UI 覆盖层 - 只覆盖部分区域 */}
      <GameUI gameInstance={gameInstance} gameReady={gameReady} />

      {/* 加载提示 */}
      {!gameInstance && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          color: 'white',
          fontSize: '24px',
          textAlign: 'center',
          zIndex: 20
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
