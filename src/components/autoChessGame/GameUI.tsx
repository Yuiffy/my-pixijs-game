// src/components/autoChessGame/GameUI.tsx
import React, { useState, useEffect } from 'react';
import { UNIT_TYPES } from './config/UnitsData';

export default function GameUI({ gameInstance }: any) {
  const [gold, setGold] = useState(20); // 初始给20块方便测试
  const [shopUnits, setShopUnits] = useState<(string | null)[]>([]); // 允许 null 表示售罄
  const [synergies, setSynergies] = useState({});
  const [shopLevel, setShopLevel] = useState(1);
  const [barracksCount, setBarracksCount] = useState(0);
  const [gameStarted, setGameStarted] = useState(false);
  const [gameOver, setGameOver] = useState<boolean | null>(null);

  // 监听 Phaser 传来的数据
  useEffect(() => {
    if (!gameInstance) return;

    const updateShop = (data: string[]) => setShopUnits(data);
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

  const refreshShop = () => {
    if (gold >= 2) {
      setGold(g => g - 2);
      gameInstance.events.emit('REFRESH_SHOP');
    }
  };

  // ✅ 新的购买逻辑：自动放置 + 商店格置空
  const handleBuyClick = (index: number) => {
    //#region agent log
    fetch('http://127.0.0.1:7242/ingest/e0c29ed0-d46a-4623-8c34-0a2630dfe77f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'GameUI.tsx:handleBuyClick',message:'handleBuyClick called',data:{index, shopUnits, barracksCount, gold},timestamp:Date.now(),sessionId:'debug-session',runId:'initial-debug',hypothesisId:'A1'})}).catch(()=>{});
    //#endregion

    const unitKey = shopUnits[index];
    if (!unitKey) {
      //#region agent log
      fetch('http://127.0.0.1:7242/ingest/e0c29ed0-d46a-4623-8c34-0a2630dfe77f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'GameUI.tsx:handleBuyClick',message:'Unit already sold out',data:{index, unitKey},timestamp:Date.now(),sessionId:'debug-session',runId:'initial-debug',hypothesisId:'A1'})}).catch(()=>{});
      //#endregion
      return; // 已售罄
    }

    const unit = UNIT_TYPES[unitKey as keyof typeof UNIT_TYPES];
    if (!unit) {
      //#region agent log
      fetch('http://127.0.0.1:7242/ingest/e0c29ed0-d46a-4623-8c34-0a2630dfe77f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'GameUI.tsx:handleBuyClick',message:'Unit data not found',data:{unitKey},timestamp:Date.now(),sessionId:'debug-session',runId:'initial-debug',hypothesisId:'A1'})}).catch(()=>{});
      //#endregion
      return;
    }

    // 检查人口
    if (barracksCount >= 8) {
      //#region agent log
      fetch('http://127.0.0.1:7242/ingest/e0c29ed0-d46a-4623-8c34-0a2630dfe77f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'GameUI.tsx:handleBuyClick',message:'Barracks limit reached',data:{barracksCount},timestamp:Date.now(),sessionId:'debug-session',runId:'initial-debug',hypothesisId:'A1'})}).catch(()=>{});
      //#endregion
      alert("⚠️ 兵营位置已满 (8/8)！请先等待合卡或无需操作。");
      return;
    }
    // 检查金币
    if (gold < unit.cost) {
      //#region agent log
      fetch('http://127.0.0.1:7242/ingest/e0c29ed0-d46a-4623-8c34-0a2630dfe77f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'GameUI.tsx:handleBuyClick',message:'Not enough gold',data:{gold, cost: unit.cost},timestamp:Date.now(),sessionId:'debug-session',runId:'initial-debug',hypothesisId:'A1'})}).catch(()=>{});
      //#endregion
      alert("💰 金币不足！");
      return;
    }

    // 1. 扣钱
    setGold(g => g - unit.cost);

    // 2. 商店格子变黑 (Sold Out)
    const newShop = [...shopUnits];
    newShop[index] = null;
    setShopUnits(newShop);

    // 3. 通知 Phaser 自动放置
    console.log(`UI: Buying & Auto-placing ${unit.name}`);
    //#region agent log
    fetch('http://127.0.0.1:7242/ingest/e0c29ed0-d46a-4623-8c34-0a2630dfe77f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'GameUI.tsx:handleBuyClick',message:'Emitting AUTO_BUY_UNIT event',data:{unitKey, unitName: unit.name},timestamp:Date.now(),sessionId:'debug-session',runId:'initial-debug',hypothesisId:'A2'})}).catch(()=>{});
    //#endregion
    gameInstance.events.emit('AUTO_BUY_UNIT', { unitKey });
  };

  const startGame = () => {
    console.log('UI: Start game button clicked');
    console.log('UI: gameInstance exists:', !!gameInstance);
    if (gameInstance) {
      console.log('UI: Emitting GAME_START event');
      gameInstance.events.emit('GAME_START');
      setGameStarted(true);
    } else {
      console.error('UI: gameInstance is null!');
    }
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
    <>
      {/* 顶部面板 - 固定在顶部 */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: 20, background: 'rgba(0,0,0,0.7)', zIndex: 10, pointerEvents: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ color: 'white', flex: 1 }}>
            <h3 style={{ margin: '0 0 5px 0' }}>卫戍协议 (Auto Mode)</h3>
            <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
              {Object.entries(synergies).map(([name, count]: [string, any]) => (
                <span key={name} style={{ background: '#444', color: count >= 2 ? '#ffd700' : '#fff', padding: '2px 8px', borderRadius: '4px', fontSize: '12px', border: count >= 2 ? '1px solid gold' : 'none' }}>
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
              Lv.
              {shopLevel}
              {' '}
              | 人口:
              {barracksCount}
              /8
            </div>
          </div>

          <div style={{ marginLeft: 20 }}>
            {!gameStarted && <button onClick={startGame} style={{ pointerEvents: 'auto', padding: '10px 20px', background: '#28a745', color: 'white', border: 'none', borderRadius: '5px', fontWeight: 'bold' }}>开始战斗</button>}
          </div>
        </div>
      </div>

      {/* 底部面板：商店 - 固定在底部 */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 20, background: 'rgba(0,0,0,0.7)', zIndex: 10, pointerEvents: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 15 }}>
          <button onClick={refreshShop} disabled={gold < 2} style={{ padding: '15px 20px', background: gold >= 2 ? '#ffc107' : '#555', color: '#000', fontWeight: 'bold', border: 'none', borderRadius: '10px', cursor: 'pointer' }}>
            刷新 ($2)
          </button>

          {shopUnits.map((key, idx) => {
            // 处理已售罄
            if (!key) {
              return (
                <div key={idx} style={{ width: 120, height: 140, background: '#222', border: '2px dashed #444', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555', borderRadius: '10px' }}>
                  🚫 已售罄
                </div>
              );
            }

            const unit = UNIT_TYPES[key as keyof typeof UNIT_TYPES];
            if (!unit) return null;
            const canAfford = gold >= unit.cost;

            return (
              <div
                key={idx}
                onClick={() => canAfford && handleBuyClick(idx)}
                style={{
                  width: 120,
                  height: 140,
                  background: canAfford ? '#fff' : '#ccc',
                  border: `3px solid ${canAfford ? '#ffd700' : '#666'}`,
                  borderRadius: '10px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  padding: '10px',
                  cursor: canAfford ? 'pointer' : 'not-allowed',
                  opacity: canAfford ? 1 : 0.6,
                  transform: canAfford ? 'scale(1)' : 'scale(0.95)'
                }}
              >
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
    </>
  );
}
