import type { Metadata } from 'next';
import BrickExcavation from '@/components/brickExcavation/BrickExcavation';

export const metadata: Metadata = {
  title: '维阿发掘局 | 敲砖寻人',
  description: '敲落连成一片的彩色砖块，让埋在砖层下的维阿主播重见天日。',
};

export default function BrickExcavationPage() {
  return <BrickExcavation />;
}
