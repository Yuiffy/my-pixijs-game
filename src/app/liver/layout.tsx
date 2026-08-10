import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '鹿饼AI直播总结',
  description: '按分类查看主播直播总结。',
};

export default function LiverLayout({ children }: { children: React.ReactNode }) {
  return children;
}
