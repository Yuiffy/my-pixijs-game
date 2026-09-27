import type { Metadata } from 'next';
import TerrainGame from '@/components/pingluCanal/TerrainGame';

export const metadata: Metadata = {
  title: '平陆运河：造山移海',
  description: '基于真实高程与河网的平陆运河沙盘：跨分水岭，整治沙坪河、旧州江与钦江，建设三级船闸。逐格爆破、疏浚、运土复垦，仅最终采用工程得分。支持单人、同机多人和 AI。',
};

export default function PingluCanalPage() {
  return <TerrainGame />;
}
