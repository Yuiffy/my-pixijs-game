import dynamic from 'next/dynamic';

// 强制在客户端加载组件
const AutoChessGame = dynamic(() => import('@/components/AutoChessGame'), { ssr: false });

export default function Home() {
  return (
    <main style={{ minHeight: '100vh', backgroundColor: '#1a1a1a', color: 'white', padding: '20px' }}>
      <h1 style={{ textAlign: 'center' }}>卫戍协议：物理自走棋 Demo</h1>
      <p style={{ textAlign: 'center', opacity: 0.8 }}>
        川妹阵营 (左) VS 虚空势力 (右) 
        {' '}
        <br />
        <small>点击屏幕任意位置释放冲击波，观察物理碰撞与叠层</small>
      </p>

      {/* 游戏画布 */}
      <AutoChessGame />
    </main>
  );
}
