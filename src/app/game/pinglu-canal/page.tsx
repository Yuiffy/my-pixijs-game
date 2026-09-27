import type { Metadata } from 'next';
import ConstructionGame from '@/components/pingluCanal/ConstructionGame';

export const metadata: Metadata = {
  title: '平陆运河：合龙',
  description: '在立体工程沙盘上多处开工，转移土方、建造船闸与生态通道。与朋友或 AI 共同承建一条运河，争取承包优势。',
};

export default function PingluCanalPage() {
  return <ConstructionGame />;
}
