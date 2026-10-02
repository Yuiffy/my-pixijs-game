import type { Metadata } from 'next';
import GiftArchive from '@/components/gifts/GiftArchive';

export const metadata: Metadata = {
  title: '岁己舰礼档案 · 每月舰长、提督与总督礼物 | 鹿饼',
  description: '按月份、身份和礼物名称查询岁己 SUI 的舰礼，查看录播展示图、字幕出处及追加条件。',
};

export default function GiftsPage() {
  return <GiftArchive />;
}
