import type { Metadata } from 'next';
import PreStreamGame from '@/components/preStreamGame/PreStreamGame';

export const metadata: Metadata = {
  title: '岁己：马上就播 | 开播前的动作小游戏',
  description: '接水、备餐、喂猫、调好声卡与直播软件。扮演岁己挑战开播前三晚，用你的操作刷新“马上就播”的纪录。',
};

export default function PreStreamPage() {
  return <PreStreamGame />;
}
