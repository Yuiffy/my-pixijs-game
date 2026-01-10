'use client';

import React from 'react';
import { Typography, Card, Button, Breadcrumb } from 'antd';
import { HomeOutlined, ExperimentOutlined } from '@ant-design/icons';
import Link from 'next/link';

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
  {
    title: '自走棋游戏 Auto Chess',
    href: '/game/autochess',
    description: '策略布局游戏 - 指挥你的部队作战！',
  },
  {
    title: '带鱼主页',
    href: 'https://www.daifish.top',
    description: '带鱼的个人主页入口。',
  },
];

export default function DemosPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-8 md:p-16">
      <div className="max-w-5xl mx-auto">
        <Breadcrumb
          items={[
            {
              title: <Link href="/"><HomeOutlined /> 首页</Link>,
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
          <Title level={1} className="text-purple-100 !mb-4">实验性功能与归档</Title>
          <Paragraph className="text-slate-400 text-lg">
            这里存放了站点开发过程中的各种技术实验、Demo 以及一些早期的功能板块。
          </Paragraph>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {demoData.map((demo) => (
            <Card
              key={demo.href}
              className="bg-slate-900/50 border-purple-900/30 hover:border-purple-500/50 transition-all group"
              title={<span className="text-purple-200 group-hover:text-purple-100 transition-colors">{demo.title}</span>}
            >
              <Paragraph className="text-slate-400 h-12 overflow-hidden mb-4">
                {demo.description}
              </Paragraph>
              <Button
                type="primary"
                ghost
                href={demo.href}
                className="border-purple-500 text-purple-400 hover:!bg-purple-500/10 hover:!border-purple-400 hover:!text-purple-300"
              >
                前往体验
              </Button>
            </Card>
          ))}
        </div>

        <div className="mt-16 text-center">
          <Button
            icon={<HomeOutlined />}
            size="large"
            href="/"
            className="bg-purple-600 border-none text-white hover:!bg-purple-500 shadow-lg shadow-purple-900/20"
          >
            返回首页
          </Button>
        </div>
      </div>
    </div>
  );
}
