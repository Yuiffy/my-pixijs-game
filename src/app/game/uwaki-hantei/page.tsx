import type { Metadata } from 'next';
import QuestionnaireHub from '@/components/uwaki/QuestionnaireHub';

export const metadata: Metadata = {
  title: '恋爱判断问卷集',
  description: '出轨边界、爱的分量、依存与爱情、理想恋人创建表。选择中文版问卷，独立保存进度、回顾答案和下载结果图。',
};

export default function Page() {
  return <QuestionnaireHub />;
}
