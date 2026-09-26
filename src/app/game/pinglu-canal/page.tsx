import type { Metadata } from 'next';
import PingluCanal from '@/components/pingluCanal/PingluCanal';

export const metadata: Metadata = {
  title: '平陆运河：通江达海',
  description: '与承包商或 AI 共建运河，争夺施工名额和货运订单；也可独自规划航道。',
};

export default function PingluCanalPage() {
  return <PingluCanal />;
}
