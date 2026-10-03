import type { Metadata } from 'next';
import SuiFitness from '@/components/suiFitness/SuiFitness';

export const metadata: Metadata = {
  title: '岁己：今天也要动 | 美食诱惑生存战',
  description: '躲开 DQ、牛肉干和西西里柠檬柚，攒起动力去健身、游泳、居家训练。和岁己一起减脂，也把肌肉留下。',
};

export default function SuiFitnessPage() {
  return <SuiFitness />;
}
