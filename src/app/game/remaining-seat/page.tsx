import type { Metadata } from 'next';
import RemainingSeatGame from '@/components/remainingSeat/RemainingSeatGame';

export const metadata: Metadata = {
  title: '余席 | 一场没有散席的家宴',
  description: '深夜回到旧宅，一桌饭永远多留一个位置。穿过三次家宴，在物件、旧信与雨声中找回自己的呼吸。原创第一人称 3D 心理恐怖短篇。',
};

export default function RemainingSeatPage() {
  return <RemainingSeatGame />;
}
