'use client';

import dynamic from 'next/dynamic';

// 🚀 核心修复：告诉 Next.js "不要在服务器上加载这个组件"
// 只有加上 { ssr: false }，它才会等到浏览器环境（有 window）时才去加载 Phaser
const PhaserGame = dynamic(
  () => import('@/components/PhaserGame'),
  { ssr: false },
);

export default function JumpOnePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-900 p-10">
      <h1 className="text-3xl font-bold text-white mb-6">Sui 的无尽跳跃</h1>

      {/* 这里加载游戏 */}
      <div className="relative">
        <PhaserGame />

        {/* 一个简单的加载提示，在 Phaser 加载出来之前显示 */}
        <div className="text-gray-500 text-sm mt-2 text-center">
          如果没有画面，请尝试刷新页面
        </div>
      </div>

      <div className="mt-8 text-gray-400">
        <p>
          按
          <span className="kb-key">←</span>
          {' '}
          <span className="kb-key">→</span>
          {' '}
          移动，按
          {' '}
          <span className="kb-key">↑</span>
          {' '}
          跳跃
        </p>
      </div>
    </main>
  );
}
