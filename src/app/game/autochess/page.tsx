import dynamic from 'next/dynamic';

// 强制在客户端加载组件
const AutoChessGame = dynamic(() => import('@/components/autoChessGame/PhaserGame'), { ssr: false });

export default function Home() {
  return (
    <main style={{ minHeight: '100vh', backgroundColor: '#1a1a1a', color: 'white', padding: '20px' }}>
      <h1 style={{ textAlign: 'center' }}>自走棋大战：Auto Chess Battle</h1>
      <p style={{ textAlign: 'center', opacity: 0.8 }}>
        策略布局，物理战斗
        {' '}
        <br />
        <small>购买单位 → 放置兵营 → 自动战斗 → 击败敌军波次</small>
      </p>

      {/* 游戏画布 */}
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: '20px' }}>
        <AutoChessGame />
      </div>
    </main>
  );
}
