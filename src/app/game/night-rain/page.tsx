import type { Metadata } from 'next';
import NightRain from '@/components/nightRain/NightRain';

export const metadata: Metadata = {
  title: '岁己 · 旅居之魂',
  description: '从雨夜旧城到沉钟修道院的立体动作冒险。探索四段相连的旅程、开启回环近路，听清首领的起手与余响，陪岁己走向归灯。',
};
export default function NightRainPage() { return <NightRain />; }
