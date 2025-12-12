// src/components/autoChessGame/GameUI.tsx
import React, { useState, useEffect } from 'react';
import { UNIT_TYPES } from './config/UnitsData';

export default function GameUI({ gameInstance }: any) {
  const [gold, setGold] = useState(20); // 初始资金给多点方便测试
  const [shopUnits, setShopUnits] = useState<(string | null)[]>([]); // 允许 null (表示已售罄)
  const [synergies, setSynergies] = useState({});
  const [shopLevel, setShopLevel] = useState(1);
  const [barracksCount, setBarracksCount] = useState(0);
  const [gameStarted, setGameStarted] = useState(false);
  const [gameOver, setGameOver] = useState<boolean | null>(null);

  useEffect(() => {
    if (!gameInstance) return;

    // 监听事件
    const updateShop = (data: string[]) => setShopUnits(data); // 初始数据通常是满的
    const updateSynergy = (data: any) => setSynergies(data);
    const updateBarracksCount = (count: number) => setBarracksCount(count);
    const handleShopLevelUp = (level: number) => setShopLevel(level);
    const handleGameOver = (won: boolean) => setGameOver(won);

    gameInstance.events.on('UPDATE_SHOP', updateShop);
    gameInstance.events.on('UPDATE_SYNERGY', updateSynergy);
    gameInstance.events.on('BARRACKS_PLACED', updateBarracksCount);
    gameInstance.events.on('SHOP_LEVEL_UP', handleShopLevelUp);
    gameInstance.events.on('GAME_OVER', handleGameOver);

    // 初始化请求商店
    gameInstance.events.emit('REFRESH_SHOP');

    return () => {
      gameInstance.events.off('UPDATE_SHOP', updateShop);
      gameInstance.events.off('UPDATE_SYNERGY', updateSynergy);
      gameInstance.events.off('BARRACKS_PLACED', updateBarracksCount);
      gameInstance.events.off('SHOP_LEVEL_UP', handleShopLevelUp);
      gameInstance.events.off('GAME_OVER', handleGameOver);
    };
  }, [gameInstance]);

  // 刷新商店
  const refreshShop = () => {
    if (gold >= 2) {
      setGold(g => g - 2);
      gameInstance.events.emit('REFRESH_SHOP');
    }
  };

  // 购买逻辑 (修改后：自动放置，格子变空)
  const handleBuyClick = (index: number) => {
    const unitKey = shopUnits[index];
    if (!unitKey) return; // 已经买过了

    const unit = UNIT_TYPES[unitKey as keyof typeof UNIT_TYPES];
    if (!unit) return;

    // 1. 检查条件
    if (barracksCount >= 8) {
      alert("兵营位置已满 (8/8)！");
      return;
    }
    if (gold < unit.cost) {
      alert("金币不足！");
      return;
    }

    // 2. 执行购买
    setGold(g => g - unit.cost);

    // 3. 标记该格子为“已售罄” (null)
    const newShop = [...shopUnits];
    newShop[index] = null;
    setShopUnits(newShop);

    // 4. 通知游戏场景自动放置
    console.log(`UI: Buying ${unit.name}`);
    gameInstance.events.emit('AUTO_BUY_UNIT', { unitKey });
  };

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
      <div style={{ padding: 20, background: 'rgba(0,0,0,0.7)', pointerEvents: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ margin: 0, color: 'white' }}>卫戍协议 (Auto-Chess Mod)</h3>
          <div style={{ display: 'flex', gap: '5px', marginTop: '5px' }}>
            {Object.entries(synergies).map(([name, count]: [string, any]) => (
              <span key={name} style={{ background: '#444', color: '#fff', padding: '2px 8px', borderRadius: '4px', fontSize: '12px' }}>
                {name} 
                {' '}
                {count}
              </span>
            ))}
          </div>
        </div>
        <div style={{ textAlign: 'right', color: 'white' }}>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#ffd700' }}>
            💰
            {gold}
          </div>
          <div style={{ fontSize: '14px' }}>
            人口:
            {barracksCount}
            /8
          </div>
        </div>
        {!gameStarted && <button onClick={startGame} style={{ pointerEvents: 'auto', padding: '5px 15px', background: 'green', color: 'white', border: 'none' }}>开始战斗</button>}
      </div>

      {/* 商店区域 */}
      <div style={{ position: 'absolute', bottom: 20, width: '100%', display: 'flex', justifyContent: 'center', gap: 10, pointerEvents: 'auto' }}>
        <button onClick={refreshShop} disabled={gold < 2} style={{ padding: '0 20px', background: gold >= 2 ? '#ffc107' : '#555', color: '#000', fontWeight: 'bold', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>
          刷新 ($2)
        </button>

        {shopUnits.map((key, idx) => {
          // 如果是 null，显示“已售罄”
          if (!key) {
            return (
              <div key={idx} style={{ width: 100, height: 120, background: '#333', border: '2px dashed #555', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#777', borderRadius: '8px' }}>
                已售罄
              </div>
            );
          }

          const unit = UNIT_TYPES[key as keyof typeof UNIT_TYPES];
          const canAfford = gold >= unit.cost;

          return (
            <div
              key={idx}
              onClick={() => canAfford && handleBuyClick(idx)}
              style={{
                width: 100,
                height: 120,
                background: canAfford ? '#fff' : '#ccc',
                border: '3px solid #000',
                borderRadius: '8px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: '5px',
                cursor: canAfford ? 'pointer' : 'not-allowed',
                opacity: canAfford ? 1 : 0.7
              }}
            >
              <div style={{ fontSize: '30px' }}>{unit.emoji}</div>
              <div style={{ fontWeight: 'bold', fontSize: '12px', textAlign: 'center' }}>{unit.name}</div>
              <div style={{ color: canAfford ? 'green' : 'red', fontWeight: 'bold' }}>
                $
                {unit.cost}
              </div>
              <div style={{ fontSize: '10px', color: '#666' }}>{unit.factions[0]}</div>
            </div>
          )
        })}
      </div>
    </div>
  );
}
