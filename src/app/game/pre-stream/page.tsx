import type { Metadata } from 'next';
import PreStream3D from '@/components/preStreamGame/PreStream3D';

export const metadata: Metadata = {
  title: '岁己：马上就播 | 3D 开播前冒险',
  description: '在 3D 公寓里跑遍厨房、洗手间和直播间。接水等待时完成其他准备，处理意外，争取早点正式上播。',
};

export default function PreStreamPage() {
  return <PreStream3D />;
}
