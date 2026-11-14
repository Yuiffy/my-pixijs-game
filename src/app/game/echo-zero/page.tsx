import type { Metadata } from 'next';
import EchoZero from '@/components/echoZero/EchoZero';

export const metadata: Metadata = {
  title: '岁己 · 零日余烬 ECHO ZERO',
  description: '雨夜封锁区的 3D 动作冒险序章。扮演岁己，用弹反、架势与忍杀穿过第七区，听栞栞在无线电另一头指路。',
};

export default function EchoZeroPage() { return <EchoZero />; }
