import type { Metadata } from 'next';
import HomeClient from './HomeClient';

const title = '岁己SUI应援站';
const description = '岁己SUI的非官方粉丝应援站，收录直播回顾、歌单与歌切、历月舰礼、素材图及同人游戏。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    url: '/',
    locale: 'zh_CN',
    siteName: title,
    title,
    description,
  },
};

export default function HomePage() {
  return <HomeClient />;
}
