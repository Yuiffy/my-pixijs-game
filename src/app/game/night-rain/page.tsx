import type { Metadata } from 'next';
import NightRain from '@/components/nightRain/NightRain';

export const metadata: Metadata = {
  title: '岁己 · 雨夜寻味',
  description: '一场下播后的雨夜冒险。探索立体旧城、打开近路、挑战铁伞，与随身精灵一起找到深夜食堂。',
};
export default function NightRainPage() { return <NightRain />; }
