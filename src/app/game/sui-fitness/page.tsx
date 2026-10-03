import type { Metadata } from 'next';
import SuiFitness from '@/components/suiFitness/SuiFitness';

export const metadata: Metadata = {
  title: '岁己：今天也要动 | 美食诱惑生存战',
  description: '从 48.00 kg 向 40.00 kg 前进，训练减脂、保住肌肉。三种开局天赋、四种攻击混搭，靠行动积累经验随时升级。',
};

export default function SuiFitnessPage() {
  return <SuiFitness />;
}
