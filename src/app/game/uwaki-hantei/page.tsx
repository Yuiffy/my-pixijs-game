import type { Metadata } from 'next';
import BoundaryQuiz from '@/components/uwaki/BoundaryQuiz';

export const metadata: Metadata = {
  title: '这算越界吗？· 恋爱边界判定表',
  description: '40 个日常情境，画出你的恋爱边界。中文版互动问卷，支持保存进度、回顾答案和下载结果图。',
};

export default function Page() {
  return <BoundaryQuiz />;
}
