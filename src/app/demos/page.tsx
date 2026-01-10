'use client';

import React from 'react';
import { Typography, Card, Button, Breadcrumb, ConfigProvider, theme } from 'antd';
import { HomeOutlined, ExperimentOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const { Title, Paragraph } = Typography;

interface DemoItem {
  title: string;
  href: string;
  description: string;
}

const demoData: DemoItem[] = [
  {
    title: '小鸟基础动画',
    href: '/anime/bird-base',
    description: '使用 PixiJS 实现的基础小鸟动画研究。',
  },
  {
    title: '小鸟刚体动画',
    href: '/anime/bird-matter-js-demo',
    description: '结合 Matter.js 实现的物理刚体小鸟动画实验。',
  },
  {
    title: '是小鸟就上一百层 Sui Bird jump',
    href: '/game/jumpone',
    description: 'Sui 的无尽跳跃小游戏，挑战高空极限。',
  },
  {
    title: '武侠小说生成器',
    href: '/game/wuxia',
    description: '文字冒险游戏，虽然剧情暂与岁己无关，但正在积极开发中。',
  },
  // {
  //   title: '自走棋游戏 Auto Chess 没做好，不放入口',
  //   href: '/game/autochess',
  //   description: '策略布局游戏 - 指挥你的部队作战！',
  // },
  {
    title: '岁己周表（伪）',
    href: '/html/sui_weekly_schedule.html',
    description: '岁己周表模版，但内容不一定准确。',
  },
  {
    title: '带鱼主页',
    href: 'https://www.daifish.top',
    description: '带鱼的个人主页入口。',
  },
];

export default function DemosPage() {
  const router = useRouter();

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: '#a855f7',
          borderRadius: 16,
        },
      }}
    >
      <div className="min-h-screen bg-[#0A0D14] text-slate-200 p-8 md:p-16 relative overflow-x-hidden">
        {/* Hero Background Elements - Matching Home aesthetics */}
        <div className="fixed inset-0 pointer-events-none">
           <div className="absolute top-1/4 left-1/4 w-[40vw] h-[40vw] bg-purple-600/5 blur-[120px] rounded-full" />
           <div className="absolute bottom-1/4 right-1/4 w-[40vw] h-[40vw] bg-blue-600/5 blur-[120px] rounded-full" />
        </div>

        {/* Floating Back Button */}
        <div className="fixed top-6 left-6 z-[110]">
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => router.back()}
            className="flex items-center justify-center w-12 h-12 rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 text-white hover:text-purple-300 hover:border-purple-500/50 hover:bg-white/10 transition-all shadow-2xl group"
          />
        </div>

        <div className="max-w-5xl mx-auto relative z-10">
          <Breadcrumb
            items={[
              {
                title: <Link href="/" className="hover:!text-purple-300 transition-colors"><HomeOutlined /> 首页</Link>,
              },
              {
                title: (
                  <span className="flex items-center gap-1 text-purple-300">
                    <ExperimentOutlined /> 实验性功能与归档
                  </span>
                ),
              },
            ]}
            className="mb-8"
          />

          <div className="mb-12">
            <Title level={1} className="!text-purple-100 !mb-4 font-serif">实验性功能与归档</Title>
            <Paragraph className="text-slate-400 text-lg">
              这里存放了站点开发过程中的各种技术实验、Demo 以及一些早期的功能板块。
            </Paragraph>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {demoData.map((demo) => (
              <Card
                key={demo.href}
                className="bg-white/5 border-white/10 backdrop-blur-md rounded-2xl hover:border-purple-500/50 transition-all group"
                title={<span className="text-purple-200 group-hover:text-purple-100 transition-colors font-bold">{demo.title}</span>}
              >
                <Paragraph className="text-slate-400 h-12 overflow-hidden mb-4">
                  {demo.description}
                </Paragraph>
                <Button
                  type="primary"
                  ghost
                  href={demo.href}
                  className="border-purple-500/50 text-purple-300 hover:!bg-purple-500/20 hover:!border-purple-400 hover:!text-white rounded-xl"
                >
                  前往体验
                </Button>
              </Card>
            ))}
          </div>

          <div className="mt-24 text-center">
            <Button
              icon={<HomeOutlined />}
              size="large"
              href="/"
              className="bg-gradient-to-r from-purple-600 to-blue-600 border-none text-white hover:scale-105 transition-transform rounded-full px-12 h-12 font-bold shadow-xl shadow-purple-900/40"
            >
              返回首页
            </Button>
          </div>
        </div>
      </div>
    </ConfigProvider>
  );
}
