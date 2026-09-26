import type { Metadata } from 'next';
import BrickExcavation from '@/components/brickExcavation/BrickExcavation';

export const metadata: Metadata = {
  title: '维阿发掘局 | 敲砖寻人',
  description: '敲落连成一片的彩色砖块，在一盘棋里挖出多位藏在砖层下的维阿主播。',
};

export default function BrickExcavationPage() {
  return <BrickExcavation />;
}
