import dynamic from 'next/dynamic';

const AutoChessGame = dynamic(() => import('@/components/autoChessGame/PhaserGame'), { ssr: false });

export default function AutoChessPage() {
  return (
    <main style={{ minHeight: '100vh', background: '#050b12', display: 'grid', placeItems: 'center' }}>
      <AutoChessGame />
    </main>
  );
}
