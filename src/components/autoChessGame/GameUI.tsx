// src/components/autoChessGame/GameUI.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { UNIT_TYPES } from './config/UnitsData';

export default function GameUI({ gameInstance }) {
  const [gold, setGold] = useState(10);
  const [shopUnits, setShopUnits] = useState([]);
  const [synergies, setSynergies] = useState({});
  const [shopLevel, setShopLevel] = useState(1);
  const [barracksCount, setBarracksCount] = useState(0);
  const [gameStarted, setGameStarted] = useState(false);
  const [gameOver, setGameOver] = useState(null); // null, true (win), false (lose)
  const [placingUnit, setPlacingUnit] = useState(null); // 当前正在放置的单位

  // 监听 Phaser 传来的数据
  useEffect(() => {
    if (!gameInstance) return;

    const updateShop = (data) => {
      setShopUnits(data);
    };
    const updateSynergy = (data) => setSynergies(data);
    const updateBarracksCount = (count) => setBarracksCount(count);
    const handleShopLevelUp = (level) => setShopLevel(level);
    const handleGameOver = (won) => setGameOver(won);

    gameInstance.events.on('UPDATE_SHOP', updateShop);
    gameInstance.events.on('UPDATE_SYNERGY', updateSynergy);
    gameInstance.events.on('BARRACKS_PLACED', updateBarracksCount);
    gameInstance.events.on('SHOP_LEVEL_UP', handleShopLevelUp);
    gameInstance.events.on('GAME_OVER', handleGameOver);

    // 初始化
    gameInstance.events.emit('REFRESH_SHOP');

    return () => {
      gameInstance.events.off('UPDATE_SHOP', updateShop);
      gameInstance.events.off('UPDATE_SYNERGY', updateSynergy);
      gameInstance.events.off('BARRACKS_PLACED', updateBarracksCount);
      gameInstance.events.off('SHOP_LEVEL_UP', handleShopLevelUp);
      gameInstance.events.off('GAME_OVER', handleGameOver);
    };
  }, [gameInstance]);

  const refreshShop = () => {
    if (gold >= 2) {
      setGold(g => g - 2);
      gameInstance.events.emit('REFRESH_SHOP');
    }
  };

  const handleBuyClick = (unitKey: string) => {
    const unit = UNIT_TYPES[unitKey as keyof typeof UNIT_TYPES];
    if (!unit) return;
    const { cost } = unit;
    if (gold >= cost) {
      setPlacingUnit(unitKey);
      // 这里可以添加视觉反馈，比如高亮单位或显示放置提示
    }
  };

  // 处理地图点击放置单位
  const handleCanvasClick = useCallback((event) => {
    if (!placingUnit || !gameInstance) return;

    // 获取点击位置（相对于canvas）
    const canvas = gameInstance.canvas || gameInstance.renderer?.canvas;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    console.log('Canvas clicked at:', x, y, 'placingUnit:', placingUnit);

    // 确保在有效区域内放置（避免基地区域）
    // 基地在 x=50 和 x=950，所以在中间区域放置
    if (x > 150 && x < 850 && y > 100 && y < 500) {
      console.log('Valid placement area');
      const unit = UNIT_TYPES[placingUnit];
      if (unit) {
        console.log('Emitting PLACE_UNIT event');
        gameInstance.events.emit('PLACE_UNIT', {
          unitKey: placingUnit,
          x,
          y
        });
        setGold(g => g - unit.cost);
        setPlacingUnit(null);
        console.log('Unit placement completed');
      } else {
        console.log('Unit not found in UNIT_TYPES');
      }
    } else {
      console.log('Invalid placement area');
    }
  }, [placingUnit, gameInstance]);

  // 添加canvas点击监听器
  useEffect(() => {
    if (!gameInstance) return;

    // 获取 canvas 元素
    const canvas = gameInstance.canvas || gameInstance.renderer?.canvas;
    if (!canvas) {
      console.log('Canvas not found');
      return;
    }

    console.log('Adding canvas click listener to canvas element');
    canvas.addEventListener('click', handleCanvasClick);

    return () => {
      console.log('Removing canvas click listener');
      canvas.removeEventListener('click', handleCanvasClick);
    };
  }, [gameInstance, handleCanvasClick]);

  const startGame = () => {
    setGameStarted(true);
    gameInstance.events.emit('GAME_START');
  };

  const restartGame = () => {
    window.location.reload(); // 简单重启
  };

  if (gameOver !== null) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        background: 'rgba(0,0,0,0.8)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white',
        zIndex: 1000
      }}
      >
        <h1 style={{ fontSize: '48px', color: gameOver ? '#00ff00' : '#ff0000' }}>
          {gameOver ? '🎉 胜利！' : '💀 失败！'}
        </h1>
        <p>
          最终波数:
          {gameInstance?.scene?.scenes?.[0]?.currentWave || 0}
        </p>
        <button
          onClick={restartGame}
          style={{
            padding: '20px 40px',
            fontSize: '24px',
            background: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '10px',
            cursor: 'pointer',
            marginTop: '20px'
          }}
        >
          再来一局
        </button>
      </div>
    );
  }

  // 处理绿色区域点击
  const handleGreenAreaClick = useCallback((event) => {
    if (!placingUnit || !gameInstance) return;

    // 在绿色区域内随机选择一个位置
    const x = 150 + Math.random() * 700;
    const y = 100 + Math.random() * 400;

    console.log('Green area clicked, placing at random position:', x, y);

    const unit = UNIT_TYPES[placingUnit];
    if (unit) {
      gameInstance.events.emit('PLACE_UNIT', {
        unitKey: placingUnit,
        x,
        y
      });
      setGold(g => g - unit.cost);
      setPlacingUnit(null);
      console.log('Unit placed via green area click');
    }
  }, [placingUnit, gameInstance]);

  return (
    <div style={{
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      zIndex: 10
    }}
    >
      {/* 顶部面板：羁绊 & 金币 & 信息 */}
      <div style={{
        padding: 20,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: 'rgba(0,0,0,0.7)',
        pointerEvents: 'auto',
        backdropFilter: 'blur(5px)'
      }}
      >
        <div style={{ color: 'white', flex: 1 }}>
          <h3 style={{ margin: '0 0 10px 0' }}>羁绊状态</h3>
          <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
            {Object.entries(synergies).map(([name, count]: [string, number]) => (
              <div
                key={name}
                style={{
                  background: count >= 4 ? '#ff6b6b' : count >= 2 ? '#ffd93d' : '#6bcf7f',
                  padding: '5px 10px',
                  borderRadius: '15px',
                  fontSize: '14px'
                }}
              >
                {name}
                :
                {count}
                {' '}
                层
              </div>
            ))}
          </div>
        </div>

        <div style={{ textAlign: 'center', color: 'white' }}>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#ffd700' }}>
            💰
            {' '}
            {gold}
          </div>
          <div style={{ fontSize: '14px' }}>
            商店等级:
            {' '}
            {shopLevel}
          </div>
          <div style={{ fontSize: '14px' }}>
            兵营:
            {' '}
            {barracksCount}
            /8
          </div>
        </div>

        <div style={{ textAlign: 'right' }}>
          {!gameStarted && (
            <button
              onClick={startGame}
              style={{
                padding: '10px 20px',
                background: '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '5px',
                cursor: 'pointer',
                fontSize: '16px'
              }}
            >
              开始游戏
            </button>
          )}
        </div>
      </div>

      {/* 可放置区域提示 */}
      {placingUnit && (
        <div
          style={{
            position: 'absolute',
            top: 100,
            left: 150,
            width: 700,
            height: 400,
            background: 'rgba(0, 255, 0, 0.3)',
            border: '4px solid #00ff00',
            pointerEvents: 'auto',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontSize: '28px',
            fontWeight: 'bold',
            textShadow: '3px 3px 6px rgba(0,0,0,0.8)',
            zIndex: 15,
            cursor: 'pointer',
            borderRadius: '10px',
            animation: 'pulse 1s infinite',
            boxShadow: '0 0 20px rgba(0, 255, 0, 0.5)'
          }}
          onClick={handleGreenAreaClick}
        >
          <div style={{ fontSize: '40px', marginBottom: '10px' }}>🎯</div>
          <div>
            🖱️ 点击放置
            {UNIT_TYPES[placingUnit]?.name || '单位'}
          </div>
          <div style={{ fontSize: '16px', marginTop: '10px', opacity: 0.9, background: 'rgba(0,0,0,0.5)', padding: '5px', borderRadius: '5px' }}>
            💡 或直接点击地图任意位置
          </div>
          <div style={{ fontSize: '14px', marginTop: '5px', opacity: 0.7 }}>
            绿色区域 = 可放置区域
          </div>
          🖱️ 点击这里放置
          {' '}
          {UNIT_TYPES[placingUnit]?.name || '单位'}
        </div>
      )}

      {/* 放置提示 */}
      {placingUnit && (
        <div style={{
          position: 'absolute',
          top: 20,
          right: 20,
          background: 'rgba(0,0,0,0.8)',
          color: 'white',
          padding: '15px',
          borderRadius: '10px',
          textAlign: 'center',
          pointerEvents: 'auto',
          maxWidth: '200px'
        }}
        >
          <h3>放置单位</h3>
          <div style={{ fontSize: '36px', margin: '10px 0' }}>
            {UNIT_TYPES[placingUnit]?.emoji || '❓'}
          </div>
          <p style={{ fontSize: '14px', margin: '10px 0' }}>
            点击绿色区域放置单位
          </p>
          <button
            onClick={() => setPlacingUnit(null)}
            style={{
              padding: '8px 16px',
              background: '#dc3545',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            取消
          </button>
        </div>
      )}

      {/* 底部面板：商店 */}
      <div style={{
        position: 'absolute',
        bottom: 20,
        width: '100%',
        display: 'flex',
        justifyContent: 'center',
        gap: 15,
        pointerEvents: 'auto'
      }}
      >
        <button
          onClick={refreshShop}
          disabled={gold < 2}
          style={{
            padding: '15px 20px',
            background: gold >= 2 ? '#ffc107' : '#6c757d',
            color: 'black',
            border: 'none',
            borderRadius: '10px',
            cursor: gold >= 2 ? 'pointer' : 'not-allowed',
            fontSize: '16px',
            fontWeight: 'bold'
          }}
        >
          🔄 刷新 ($2)
        </button>

        {shopUnits.map((key, idx) => {
          const unit = UNIT_TYPES[key];
          if (!unit) return null;
          const canAfford = gold >= unit.cost;
          const isPlacing = placingUnit === key;

          return (
            <div
              key={idx}
              onClick={() => canAfford && handleBuyClick(key)}
              style={{
                width: 120,
                height: 140,
                background: isPlacing ? '#ff6b6b' : canAfford ? 'white' : '#6c757d',
                border: `3px solid ${isPlacing ? '#ff0000' : '#333'}`,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                cursor: canAfford ? 'pointer' : 'not-allowed',
                borderRadius: '10px',
                padding: '10px',
                transition: 'all 0.2s',
                opacity: canAfford ? 1 : 0.6
              }}
            >
              <div style={{ fontSize: 32, marginBottom: 5 }}>{unit.emoji}</div>
              <div style={{ fontSize: 12, fontWeight: 'bold', textAlign: 'center', marginBottom: 5 }}>
                {unit.name}
              </div>
              <div style={{
                fontSize: 14,
                color: canAfford ? '#28a745' : '#dc3545',
                fontWeight: 'bold'
              }}
              >
                $
                {unit.cost}
              </div>
              <div style={{
                fontSize: 10,
                color: '#666',
                textAlign: 'center',
                marginTop: 5
              }}
              >
                {unit.factions.join('/')}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
