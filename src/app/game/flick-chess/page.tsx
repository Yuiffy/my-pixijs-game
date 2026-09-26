import type { Metadata } from 'next';
import dynamic from 'next/dynamic';

export const metadata: Metadata = {
  title: '维阿弹棋',
  description: '在立体棋盘上瞄准、蓄力并弹出角色棋子，与朋友或 AI 对决。',
};

const FlickChess = dynamic(() => import('@/components/flickChess/FlickChess'), { ssr: false });

export default function FlickChessPage() {
  return <FlickChess />;
}
