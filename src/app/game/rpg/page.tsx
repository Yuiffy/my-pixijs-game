import type { Metadata } from 'next';
import dynamic from 'next/dynamic';

export const metadata: Metadata = { title: '虚境归途 · 主播群侠传', description: '以饼干岁之身，踏过一整个虚拟江湖。结识伙伴，找回通往现实的路。' };
const OverworldRpg = dynamic(() => import('@/components/overworldRpg/OverworldRpg'), { ssr: false });
export default function RpgPage() { return <OverworldRpg />; }
