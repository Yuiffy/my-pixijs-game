import dynamic from 'next/dynamic';

const AutoChessGame = dynamic(() => import('@/components/autoChessGame/PhaserGame'), { ssr: false });

export default function AutoChessPage() {
  return (
    <main
      style={{
        width: '100vw',
        height: '100dvh',
        position: 'fixed',
        inset: 0,
        background: '#050b12',
        display: 'grid',
        placeItems: 'center',
        overflow: 'hidden',
      }}
    >
      <AutoChessGame />
    </main>
  );
}
