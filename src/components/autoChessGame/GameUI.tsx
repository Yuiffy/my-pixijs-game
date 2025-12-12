// src/components/autoChessGame/GameUI.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { UNIT_TYPES } from './config/UnitsData';

export default function GameUI({ gameInstance }: any) {
  const [gold, setGold] = useState(10);
  const [shopUnits, setShopUnits] = useState<string[]>([]);
  const [synergies, setSynergies] = useState({});
  const [shopLevel, setShopLevel] = useState(1);
  const [barracksCount, setBarracksCount] = useState(0);
  const [gameStarted, setGameStarted] = useState(false);
  const [gameOver, setGameOver] = useState<boolean | null>(null);
  const [placingUnit, setPlacingUnit] = useState<string | null>(null);

  // 监听事件
  useEffect(() => {
    if (!gameInstance) return;

    const updateShop = (data: any) => setShopUnits(data);
    const updateSynergy = (data: any) => setSynergies(data);
    const updateBarracksCount = (count: number) => setBarracksCount(count);
    const handleShopLevelUp = (level: number) => setShopLevel(level);
    const handleGameOver = (won: boolean) => setGameOver(won);

    gameInstance.events.on('UPDATE_SHOP', updateShop);
    gameInstance.events.on('UPDATE_SYNERGY', updateSynergy);
    gameInstance.events.on('BARRACKS_PLACED', updateBarracksCount);
    gameInstance.events.on('SHOP_LEVEL_UP', handleShopLevelUp);
    gameInstance.events.on('GAME_OVER', handleGameOver);

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

    // 1. 严格检查上限
    if (barracksCount >= 8) {
      alert("兵营已满 (8/8)！无法购买。");
      return;
    }

    if (gold >= unit.cost) {
      setPlacingUnit(unitKey);
    }
  };

  const handlePlace = useCallback((x: number, y: number) => {
    if (!placingUnit || !gameInstance) return;

    // 2. 放置时再次检查上限，防止并发问题
    if (barracksCount >= 8) {
      setPlacingUnit(null);
      return;
    }

    const unit = UNIT_TYPES[placingUnit as keyof typeof UNIT_TYPES];
    if (unit) {
      console.log(`UI: Placing unit ${unit.name} at ${x}, ${y}`);
      gameInstance.events.emit('PLACE_UNIT', { unitKey: placingUnit, x, y });
      setGold(g => g - unit.cost);
      setPlacingUnit(null);
    }
  }, [placingUnit, gameInstance, barracksCount]);

  const handleCanvasClick = useCallback((event: any) => {
    if (!placingUnit || !gameInstance) return;
    const canvas = gameInstance.canvas || gameInstance.renderer?.canvas;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;

    if (x > 100 && x < 900 && y > 50 && y < 550) {
      handlePlace(x, y);
    }
  }, [placingUnit, gameInstance, handlePlace]);

  // 绿色区域点击
  const handleGreenAreaClick = useCallback(() => {
    const x = 150 + Math.random() * 600;
    const y = 150 + Math.random() * 300;
    handlePlace(x, y);
  }, [handlePlace]);

  useEffect(() => {
    if (!gameInstance) return;
    const canvas = gameInstance.canvas || gameInstance.renderer?.canvas;
    if (!canvas) return;
    canvas.addEventListener('click', handleCanvasClick);
    return () => {
      canvas.removeEventListener('click', handleCanvasClick);
    };
  }, [gameInstance, handleCanvasClick]);

  const startGame = () => {
    setGameStarted(true);
    gameInstance.events.emit('GAME_START');
  };

  const restartGame = () => {
    window.location.reload();
  };

  if (gameOver !== null) {
    return (
      <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.8)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'white', zIndex: 1000 }}>
        <h1 style={{ fontSize: '48px', color: gameOver ? '#00ff00' : '#ff0000' }}>{gameOver ? '🎉 胜利！' : '💀 失败！'}</h1>
        <button onClick={restartGame} style={{ padding: '20px 40px', fontSize: '24px', background: '#007bff', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', marginTop: '20px' }}>再来一局</button>
      </div>
    );
  }

  return (
    <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 10 }}>
      {/* 顶部面板 */}
      <div style={{ padding: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.7)', pointerEvents: 'auto', backdropFilter: 'blur(5px)' }}>
        <div style={{ color: 'white', flex: 1 }}>
          <h3 style={{ margin: '0 0 10px 0' }}>羁绊 (v2.1 Visible Fix)</h3>
          <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
            {Object.entries(synergies).map(([name, count]: [string, any]) => (
              <div key={name} style={{ background: count >= 4 ? '#ff6b6b' : count >= 2 ? '#ffd93d' : '#6bcf7f', padding: '5px 10px', borderRadius: '15px', fontSize: '14px' }}>
                {name}
                :
                {count}
              </div>
            ))}
          </div>
        </div>
        <div style={{ textAlign: 'center', color: 'white' }}>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#ffd700' }}>
            💰
            {gold}
          </div>
          <div style={{ fontSize: '14px' }}>
            Level:
            {shopLevel}
          </div>
          <div style={{ fontSize: '14px', color: barracksCount >= 8 ? '#ff4444' : 'white' }}>
            兵营:
            {barracksCount}
            /8
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          {!gameStarted && <button onClick={startGame} style={{ padding: '10px 20px', background: '#28a745', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '16px' }}>开始游戏</button>}
        </div>
      </div>

      {/* 放置区域提示 */}
      {placingUnit && (
        <div
          style={{ position: 'absolute', top: 100, left: 150, width: 700, height: 400, background: 'rgba(0, 255, 0, 0.2)', border: '4px dashed #00ff00', pointerEvents: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '24px', fontWeight: 'bold', zIndex: 15, cursor: 'pointer', borderRadius: '10px' }}
          onClick={handleGreenAreaClick}
        >
          <div>👇 点击此处放置</div>
        </div>
      )}

      {/* 商店 */}
      <div style={{ position: 'absolute', bottom: 20, width: '100%', display: 'flex', justifyContent: 'center', gap: 15, pointerEvents: 'auto' }}>
        <button onClick={refreshShop} disabled={gold < 2} style={{ padding: '15px 20px', background: gold >= 2 ? '#ffc107' : '#6c757d', color: 'black', border: 'none', borderRadius: '10px', cursor: gold >= 2 ? 'pointer' : 'not-allowed', fontSize: '16px', fontWeight: 'bold' }}>🔄 ($2)</button>
        {shopUnits.map((key, idx) => {
          const unit = UNIT_TYPES[key as keyof typeof UNIT_TYPES];
          if (!unit) return null;
          const canAfford = gold >= unit.cost;
          const isPlacing = placingUnit === key;
          return (
            <div key={idx} onClick={() => canAfford && handleBuyClick(key)} style={{ width: 120, height: 140, background: isPlacing ? '#ff6b6b' : canAfford ? 'white' : '#6c757d', border: `3px solid ${isPlacing ? '#ff0000' : '#333'}`, display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: canAfford ? 'pointer' : 'not-allowed', borderRadius: '10px', padding: '10px', transition: 'all 0.2s', opacity: canAfford ? 1 : 0.6 }}>
              <div style={{ fontSize: 32, marginBottom: 5 }}>{unit.emoji}</div>
              <div style={{ fontSize: 12, fontWeight: 'bold', textAlign: 'center', marginBottom: 5 }}>{unit.name}</div>
              <div style={{ fontSize: 14, color: canAfford ? '#28a745' : '#dc3545', fontWeight: 'bold' }}>
                $
                {unit.cost}
              </div>
              <div style={{ fontSize: 10, color: '#666', textAlign: 'center', marginTop: 5 }}>{unit.factions.join('/')}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
