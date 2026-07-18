'use client';

import React from 'react';
import { Typography, Card, Button, Breadcrumb, ConfigProvider, theme, Tag, Divider } from 'antd';
import { HomeOutlined, ExperimentOutlined, ArrowLeftOutlined, ReadOutlined, CalendarOutlined, RocketOutlined } from '@ant-design/icons';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

const { Title, Paragraph, Text } = Typography;

interface DemoItem {
  title: string;
  href: string;
  description: string;
  image?: string;
  tag?: string;
  isExternal?: boolean;
}

// 核心项目：岁己周表与 Wiki
const priorityDemos: DemoItem[] = [
  {
    title: '岁己周表（伪）',
    href: '/html/sui_weekly_schedule.html',
    description: '岁己周动态概览模版，记录每一次闪耀时刻。',
    image: '/images/materials/weekly_sample.png',
    tag: '核心推荐',
  },
  {
    title: '岁己鬼灭IF Wiki',
    href: '/wiki/sui',
    description: '如果岁己是一名鬼杀队成员的世界线…',
    image: '/images/wiki/wiki_snapshot.jpg',
    tag: '资料库',
  },
];

// 主要作品：小游戏
const mainDemos: DemoItem[] = [
  {
    title: 'Knight：空洞搜打撤',
    href: '/knight',
    description: '深入空洞探索、搜集资源，并在危机中成功撤离。',
  },
  {
    title: '裂隙阵线',
    href: '/game/autochess',
    description: '招募队员、排兵布阵，在八战远征中自动作战。',
    image: '/images/materials/bird/岁己_小鸟跳静态图.png',
  },
  {
    title: '是小鸟就上一百层 Sui Bird jump',
    href: '/game/jumpone',
    description: 'Sui 的无尽跳跃小游戏，挑战高空极限。',
    image: '/images/sui-bird-jump.png',
  },
  {
    title: '武侠小说生成器',
    href: '/game/wuxia',
    description: '探索文字的魅力，开启一场充满变数的江湖之旅。',
    image: '/images/wiki/skill1.jpg',
  },
];

// 归档项目：基础动画、实验性功能、外部链接
const archiveDemos: DemoItem[] = [
  {
    title: '小鸟基础动画',
    href: '/anime/bird-base',
    description: 'PixiJS 实现的基础动画研究。',
  },
  {
    title: '小鸟刚体动画',
    href: '/anime/bird-matter-js-demo',
    description: '结合 Matter.js 的物理实验。',
  },
  {
    title: '带鱼主页',
    href: 'https://www.daifish.top',
    description: '开发者个人站。',
    isExternal: true,
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
        {/* 背景光效 */}
        <div className="fixed inset-0 pointer-events-none">
           <div className="absolute top-1/4 left-1/4 w-[40vw] h-[40vw] bg-purple-600/5 blur-[120px] rounded-full" />
           <div className="absolute bottom-1/4 right-1/4 w-[40vw] h-[40vw] bg-blue-600/5 blur-[120px] rounded-full" />
        </div>

        {/* 返回按钮 */}
        <div className="fixed top-6 left-6 z-[110]">
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => router.back()}
            className="flex items-center justify-center w-12 h-12 rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 text-white hover:text-purple-300 hover:border-purple-500/50 hover:bg-white/10 transition-all shadow-2xl"
          />
        </div>

        <div className="max-w-6xl mx-auto relative z-10">
          <Breadcrumb
            items={[
              {
                title: <Link href="/" className="hover:!text-purple-300 transition-colors"><HomeOutlined /> 首页</Link>,
              },
              {
                title: (
                  <span className="flex items-center gap-1 text-purple-300">
                    <ExperimentOutlined /> 实验室与归档
                  </span>
                ),
              },
            ]}
            className="mb-8"
          />

          <div className="mb-16">
            <Title level={1} className="!text-purple-100 !mb-4 font-serif tracking-tight">实验室 & 早期归档</Title>
            <Paragraph className="text-slate-400 text-lg max-w-2xl">
              这里汇集了站点开发过程中的技术实验、互动 Demo 以及不断完善中的资料板块。
            </Paragraph>
          </div>

          {/* 重点板块 */}
          <section className="mb-16">
            <div className="flex items-center gap-2 mb-6 text-purple-300">
              <CalendarOutlined className="text-xl" />
              <Title level={3} className="!text-purple-200 !mb-0">核心推荐</Title>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {priorityDemos.map((demo) => (
                <Link key={demo.href} href={demo.href} target={demo.isExternal ? '_blank' : undefined} className="block group">
                  <Card
                    hoverable
                    className="overflow-hidden bg-white/5 border-purple-900/20 backdrop-blur-md rounded-3xl hover:border-purple-500/50 transition-all p-0"
                    styles={{ body: { padding: 0 } }}
                  >
                    <div className="relative h-64 w-full">
                      {demo.image && (
                        <Image
                          src={demo.image}
                          alt={demo.title}
                          fill
                          className="object-cover transition-transform duration-500 group-hover:scale-105 opacity-80 group-hover:opacity-100"
                        />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-[#0A0D14] via-[#0A0D14]/20 to-transparent" />
                      <div className="absolute bottom-6 left-6 right-6">
                        {demo.tag && <Tag color="purple" className="mb-3 border-none bg-purple-600/40 text-purple-100">{demo.tag}</Tag>}
                        <Title level={4} className="!text-white !mb-1">{demo.title}</Title>
                        <Text className="text-slate-300">{demo.description}</Text>
                      </div>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          </section>

          {/* 互动作品 */}
          <section className="mb-16">
            <div className="flex items-center gap-2 mb-6 text-blue-300">
              <RocketOutlined className="text-xl" />
              <Title level={3} className="!text-blue-200 !mb-0">互动实验室</Title>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {mainDemos.map((demo) => (
                <Link key={demo.href} href={demo.href} className="block group">
                  <Card
                    hoverable
                    className="bg-white/5 border-white/10 backdrop-blur-md rounded-2xl hover:border-blue-500/50 transition-all overflow-hidden"
                    styles={{ body: { display: 'flex', gap: '20px', padding: '20px' } }}
                  >
                    {demo.image && (
                      <div className="relative w-24 h-24 rounded-xl overflow-hidden flex-shrink-0">
                        <Image src={demo.image} alt={demo.title} fill className="object-cover group-hover:scale-110 transition-transform" />
                      </div>
                    )}
                    <div className="flex-1 flex flex-col justify-center">
                      <Title level={5} className="!text-blue-100 !mb-1 group-hover:text-blue-300 transition-colors">{demo.title}</Title>
                      <Paragraph className="text-slate-400 !mb-0 size-small opacity-80">{demo.description}</Paragraph>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          </section>

          {/* 归档区：更不显眼 */}
          <section className="mb-16 opacity-60 hover:opacity-100 transition-opacity">
            <Divider orientation="left" className="!border-white/10">
              <Text className="text-slate-500 text-sm tracking-widest uppercase">存档与外部链接</Text>
            </Divider>
            <div className="flex flex-wrap gap-4">
              {archiveDemos.map((demo) => (
                <Button
                  key={demo.href}
                  type="text"
                  href={demo.href}
                  target={demo.isExternal ? '_blank' : undefined}
                  className="h-auto py-3 px-6 bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/20 rounded-xl text-left"
                >
                  <div>
                    <div className="text-slate-300 font-bold mb-0.5">{demo.title}</div>
                    <div className="text-slate-500 text-xs">{demo.description}</div>
                  </div>
                </Button>
              ))}
            </div>
          </section>

          <footer className="mt-24 text-center border-t border-white/5 pt-12 pb-8">
            <Button
              icon={<HomeOutlined />}
              size="large"
              href="/"
              className="bg-gradient-to-r from-purple-600 to-indigo-600 border-none text-white hover:scale-105 transition-transform rounded-full px-12 h-12 font-bold shadow-xl shadow-purple-900/40"
            >
              返回首页
            </Button>
          </footer>
        </div>
      </div>

      <style jsx global>{`
        .ant-breadcrumb .ant-breadcrumb-link { color: #94a3b8 !important; }
        .ant-breadcrumb .ant-breadcrumb-separator { color: #475569 !important; }
        .size-small { font-size: 0.875rem; line-height: 1.25rem; }
      `}</style>
    </ConfigProvider>
  );
}
