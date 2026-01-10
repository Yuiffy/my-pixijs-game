'use client';

import React, { useState, useEffect } from 'react';
import {
  Typography, Button, Space, Card, Tag,
  Row, Col, Image as AntImage, ConfigProvider,
  theme, Divider, Pagination, Calendar, Badge, Tabs, Tooltip
} from 'antd';
import {
  ExperimentOutlined,
  CloudDownloadOutlined,
  HistoryOutlined,
  PictureOutlined,
  CalendarOutlined,
  HomeOutlined,
  HeartOutlined,
  StarOutlined,
  CoffeeOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import NextImage from 'next/image';
import Link from 'next/link';

const { Title, Text, Paragraph } = Typography;

// --- Real Sui SUI Info ---

const suiInfo = {
  name: '岁己 (SUI)',
  group: 'VirtuaReal 第十七期生',
  race: '银喉长尾山雀 (Tit)',
  origin: '四川成都 (川渝暴龙)',
  birthday: '2月5日',
  tags: ['白发红瞳', '虎牙', '吃辣大户', '地雷系(外表)', 'Needy'],
  description: '原本是一只想要早起叫醒人类的小鸟，结果因为自己也起不来，索性变成了人类。性格坚定可爱，非常喜欢吃辣，三餐无辣不欢。',
  colorMain: '#87EAFF',
  colorSub: '#DA5D77',
};

const artworkMaterials = [
  { src: '/images/materials/岁己SUI小猫帽带饼干岁紫色外套双马尾.png', title: '小猫帽 · 紫色外套' },
  { src: '/images/materials/岁己SUI小猫帽口罩双马尾.png', title: '小猫帽 · 口罩版' },
  { src: '/images/materials/岁己SUI小猫帽戴兜帽wink红瞳.PNG', title: '小猫帽 · 兜帽Wink' },
  { src: '/images/materials/岁己SUI小猫帽无外套长发金瞳.PNG', title: '小猫帽 · 长发金瞳' },
  { src: '/images/materials/岁己SUI小猫帽短发小揪揪半身金瞳.png', title: '小猫帽 · 短发揪揪' },
  { src: '/images/materials/QQ20260107-003512.png', title: '岁己 SUI · 表情包' },
];

const streamSummaries = [
  {
    id: 1,
    title: '【初配信】大家好，我是 VirtuaReal 的岁己！',
    date: '2022-09-04',
    startTime: '19:00',
    endTime: '21:00',
    srtUrl: '#',
    description: '正式在 VirtuaReal 出道，向大家展示了成都辣妹的坚定意志（划掉）和小鸟的可爱一面。',
    imageUrl: '/images/wiki/to_be_zhu.png', // Temporary placeholder until real stream images are added
  },
  {
    id: 2,
    title: '【杂谈】川渝人的吃辣极限挑战',
    date: '2022-10-12',
    startTime: '20:00',
    endTime: '22:00',
    srtUrl: '#',
    description: '分享了成都市民岁某人的日常生活，以及对各种超辣火锅的测评。',
    imageUrl: '/images/wiki/sui_test_battle.jpg',
  },
];

// --- Components ---

const HomeModule = () => (
  <div className="animate-fade-in-up">
    <div className="relative mb-16 flex flex-col items-center">
      <div className="w-64 h-64 md:w-80 md:h-80 relative mb-8 group">
          <div className="absolute inset-0 bg-gradient-to-tr from-[#87EAFF]/30 to-[#DA5D77]/30 blur-3xl rounded-full group-hover:scale-110 transition-transform duration-1000" />
          <div className="relative w-full h-full rounded-2xl overflow-hidden border-4 border-white/20 shadow-2xl">
             <NextImage
                src="/images/materials/岁己SUI小猫帽带饼干岁紫色外套双马尾.png"
                alt="Sui"
                fill
                className="object-contain object-top group-hover:scale-110 transition-transform duration-700"
             />
          </div>
          {/* Cute Floating Tags */}
          <div className="absolute -top-4 -right-8 bg-[#DA5D77] text-white px-3 py-1 rounded-full text-xs font-bold shadow-lg rotate-12">川渝暴龙 🦖</div>
          <div className="absolute bottom-10 -left-10 bg-[#87EAFF] text-slate-900 px-3 py-1 rounded-full text-xs font-bold shadow-lg -rotate-12">银喉长尾山雀 🐦</div>
      </div>

      <div className="text-center max-w-2xl px-4">
        <Title className="!text-white !mb-4 !text-4xl md:!text-5xl font-serif">
          {suiInfo.name}
        </Title>
        <Space size="middle" wrap className="mb-6 justify-center">
          <Tag color="cyan" className="border-none">{suiInfo.group}</Tag>
          <Tag color="magenta" className="border-none">{suiInfo.race}</Tag>
          <Tag color="volcano" className="border-none">成都籍</Tag>
        </Space>
        <Paragraph className="text-slate-300 text-lg leading-relaxed">
          {suiInfo.description}
        </Paragraph>
      </div>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
       <Card className="bg-white/5 border-white/10 backdrop-blur-md rounded-2xl">
          <Title level={4} className="!text-pink-300 !mb-4 flex items-center gap-2"><HeartOutlined /> 趣味情报</Title>
          <ul className="space-y-3 text-slate-300">
             <li className="flex justify-between border-b border-white/5 pb-2"><span>生日</span><Text className="text-white">{suiInfo.birthday}</Text></li>
             <li className="flex justify-between border-b border-white/5 pb-2"><span>最爱食物</span><Text className="text-white">超辣火锅 / 辣椒</Text></li>
             <li className="flex justify-between border-b border-white/5 pb-2"><span>出道日</span><Text className="text-white">2022年9月4日</Text></li>
             <li className="flex justify-between"><span>粉丝名</span><Text className="text-white">饼干岁</Text></li>
          </ul>
       </Card>
       <Card className="bg-white/5 border-white/10 backdrop-blur-md rounded-2xl">
          <Title level={4} className="!text-cyan-300 !mb-4 flex items-center gap-2"><StarOutlined /> 近期目标</Title>
          <div className="flex flex-col items-center justify-center h-full py-4 text-center">
             <div className="w-16 h-16 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center text-2xl mb-4 shadow-lg">🏆</div>
             <Text className="text-white text-xl font-bold mb-2">10万粉丝达成！</Text>
             <Text className="text-slate-400">发行首张实体专辑计划筹备中...</Text>
          </div>
       </Card>
    </div>
  </div>
);

const GalleryModule = () => (
  <div className="animate-fade-in-up">
    <div className="mb-10">
      <Title level={2} className="!text-white !mb-2 flex items-center gap-3">
        <PictureOutlined className="text-pink-400" /> 角色素材库
      </Title>
      <Text className="text-slate-400">来自“小猫帽”系列的精选材料，供各位羽众二创使用 ✨</Text>
    </div>

    <AntImage.PreviewGroup>
      <Row gutter={[20, 20]}>
        {artworkMaterials.map((item, index) => (
          <Col xs={12} md={8} lg={6} key={index}>
            <div className="group relative rounded-2xl overflow-hidden border-2 border-white/5 bg-white/5 aspect-[3/4] hover:border-pink-500/50 transition-all cursor-pointer shadow-xl">
              <AntImage
                src={item.src}
                alt={item.title}
                className="object-contain w-full h-full p-2 group-hover:scale-110 transition-transform duration-500"
                wrapperClassName="w-full h-full"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-4 opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-between">
                <Text className="text-xs text-white font-medium">{item.title}</Text>
                <Tooltip title="预览原图"><StarOutlined className="text-yellow-400" /></Tooltip>
              </div>
            </div>
          </Col>
        ))}
        {/* Placeholder for "Moar" */}
        <Col xs={12} md={8} lg={6}>
           <div className="flex flex-col items-center justify-center border-2 border-dashed border-white/10 rounded-2xl aspect-[3/4] hover:border-cyan-500/50 transition-all cursor-pointer group">
              <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-4 group-hover:bg-cyan-500/20 transition-colors">
                <CoffeeOutlined className="text-2xl text-slate-500 group-hover:text-cyan-300" />
              </div>
              <Text className="text-slate-500 group-hover:text-cyan-300">更多素材录入中...</Text>
           </div>
        </Col>
      </Row>
    </AntImage.PreviewGroup>

    <div className="mt-12 p-6 bg-blue-900/10 border border-blue-500/20 rounded-2xl flex items-center gap-4">
       <div className="text-3xl text-blue-400">💡</div>
       <Text className="text-slate-400 italic">“所有素材均来源于网络及粉丝投稿，二创时请遵守官方相应准则的说！”</Text>
    </div>
  </div>
);

const RecordsModule = () => {
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');

  const dateCellRender = (value: any) => {
    const dateStr = value.format('YYYY-MM-DD');
    const streams = streamSummaries.filter(s => s.date === dateStr);
    return (
      <ul className="list-none p-0">
        {streams.map(item => (
          <li key={item.id}>
            <Badge status="processing" text={item.title} className="text-[10px] text-pink-300 transform scale-90" />
          </li>
        ))}
      </ul>
    );
  };

  return (
    <div className="animate-fade-in-up">
      <div className="flex flex-col md:flex-row items-center justify-between mb-10 gap-4">
        <div>
          <Title level={2} className="!text-white !mb-2 flex items-center gap-3">
            <HistoryOutlined className="text-cyan-400" /> 直播回顾
          </Title>
          <Text className="text-slate-400">记录每一场直播的珍贵瞬间 📅</Text>
        </div>
        <div className="bg-white/5 p-1 rounded-full border border-white/10">
          <Button
            icon={<HistoryOutlined />}
            onClick={() => setViewMode('list')}
            type={viewMode === 'list' ? 'primary' : 'text'}
            className={viewMode === 'list' ? 'bg-cyan-600 rounded-full' : 'text-slate-400 hover:!text-cyan-300'}
          >
            列表视图
          </Button>
          <Button
            icon={<CalendarOutlined />}
            onClick={() => setViewMode('calendar')}
            type={viewMode === 'calendar' ? 'primary' : 'text'}
            className={viewMode === 'calendar' ? 'bg-pink-600 rounded-full ml-1' : 'text-slate-400 hover:!text-pink-300 ml-1'}
          >
            日历视图
          </Button>
        </div>
      </div>

      {viewMode === 'list' ? (
        <div className="space-y-6">
          {streamSummaries.map((stream) => (
            <Card key={stream.id} className="bg-white/5 border-white/5 overflow-hidden hover:border-cyan-500/30 transition-all rounded-2xl group">
              <Row gutter={[24, 24]} align="middle">
                <Col xs={24} md={8}>
                  <div className="relative aspect-video rounded-xl overflow-hidden shadow-lg group-hover:scale-105 transition-transform duration-500">
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 z-10" />
                    <NextImage src={stream.imageUrl} alt={stream.title} fill className="object-cover" />
                    <Tag className="absolute top-2 left-2 z-20 bg-cyan-600 border-none font-bold">{stream.date}</Tag>
                  </div>
                </Col>
                <Col xs={24} md={16}>
                  <Title level={4} className="!text-white group-hover:text-cyan-300 transition-colors mb-2">{stream.title}</Title>
                  <Paragraph className="text-slate-400 mb-6">{stream.description}</Paragraph>
                  <Space size="middle">
                    <Button icon={<CloudDownloadOutlined />} className="bg-white/10 border-none text-cyan-300 hover:!bg-white/20">SRT 下載</Button>
                    <Button type="link" className="text-pink-400">详情回顾 →</Button>
                  </Space>
                </Col>
              </Row>
            </Card>
          ))}
          <div className="flex justify-center pt-8">
            <Pagination total={2} pageSize={10} className="custom-pagination" />
          </div>
        </div>
      ) : (
        <div className="bg-white/5 p-4 md:p-8 rounded-3xl border border-white/5 shadow-2xl overflow-x-auto">
          <div className="min-w-[800px]">
             <Calendar fullscreen={true} cellRender={dateCellRender} className="bg-transparent" />
          </div>
        </div>
      )}
    </div>
  );
};

export default function Home() {
  const [activeTab, setActiveTab] = useState('home');

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: '#87EAFF',
          borderRadius: 16,
          fontFamily: "'Inter', 'Noto Sans SC', sans-serif",
        },
      }}
    >
      <main className="min-h-screen bg-[#0A0D14] text-slate-200 overflow-x-hidden selection:bg-[#DA5D77]/50">
        {/* Cute Top Nav */}
        <nav className="fixed top-0 inset-x-0 z-[100] p-4 flex justify-center">
           <div className="bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-full px-2 py-1 flex items-center shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
              {[
                { key: 'home', label: '主页', icon: <HomeOutlined /> },
                { key: 'gallery', label: '素材图', icon: <PictureOutlined /> },
                { key: 'records', label: '总结', icon: <HistoryOutlined /> },
              ].map((item) => (
                <button
                  key={item.key}
                  onClick={() => setActiveTab(item.key)}
                  className={`px-6 py-2 rounded-full text-sm font-bold flex items-center gap-2 transition-all ${
                    activeTab === item.key
                    ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {item.icon} {item.label}
                </button>
              ))}
              <div className="w-[1px] h-6 bg-white/10 mx-2" />
              <Link href="/demos" className="px-4 py-2 hover:text-cyan-400 transition-colors text-slate-400 flex items-center gap-2 text-sm font-bold group">
                 <ExperimentOutlined className="group-hover:rotate-45 transition-transform" /> 实验室
              </Link>
           </div>
        </nav>

        {/* Hero Background Elements */}
        <div className="fixed inset-0 pointer-events-none">
           <div className="absolute top-1/4 left-1/4 w-[40vw] h-[40vw] bg-cyan-600/5 blur-[120px] rounded-full animate-pulse" />
           <div className="absolute bottom-1/4 right-1/4 w-[40vw] h-[40vw] bg-pink-600/5 blur-[120px] rounded-full" />
           {/* Floating Feathers / Bits */}
           <div className="absolute top-40 right-[15%] text-2xl opacity-10 animate-bounce">🪶</div>
           <div className="absolute bottom-40 left-[10%] text-xl opacity-5 animate-bounce delay-700">🐦</div>
           <div className="absolute top-1/2 left-[5%] text-xl opacity-10 animate-pulse">✨</div>
        </div>

        <div className="max-w-5xl mx-auto px-6 pt-32 pb-24 relative z-10 min-h-screen">

          {/* Module Content */}
          <div className="mt-8">
            {activeTab === 'home' && <HomeModule />}
            {activeTab === 'gallery' && <GalleryModule />}
            {activeTab === 'records' && <RecordsModule />}
          </div>

          <footer className="mt-32 pt-12 border-t border-white/5 text-center opacity-40 hover:opacity-100 transition-opacity">
            <Space className="mb-4">
               <ThunderboltOutlined className="text-yellow-500" />
               <Text className="text-slate-500">POWERED BY SUI FAN CLUB | 2026</Text>
            </Space>
            <Paragraph className="text-slate-600 text-xs italic">
               “就算是一两克重量的小鸟，也有着支配天空的梦想。”
            </Paragraph>
          </footer>
        </div>

        <style jsx global>{`
          .animate-fade-in-up {
            animation: fadeInUp 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
          }
          @keyframes fadeInUp {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .custom-pagination .ant-pagination-item-active {
            border-color: #87EAFF;
            background: rgba(135, 234, 255, 0.1);
          }
          .custom-pagination .ant-pagination-item-active a {
            color: #87EAFF;
          }
          /* Override Antd Calendar */
          .ant-picker-calendar {
            background: transparent !important;
          }
          .ant-picker-cell-inner {
            border-radius: 12px !important;
            border: 1px solid transparent !important;
            transition: all 0.3s !important;
          }
          .ant-picker-cell-inner:hover {
            background: rgba(255,255,255,0.05) !important;
            border-color: rgba(255,255,255,0.1) !important;
          }
          .ant-picker-cell-in-view.ant-picker-cell-today .ant-picker-cell-inner::before {
             border-color: #87EAFF !important;
          }
          .ant-picker-cell-selected .ant-picker-cell-inner {
            background: #87EAFF !important;
            color: #0A0D14 !important;
          }
          .ant-picker-calendar-date-content {
            height: 60px !important;
          }
        `}</style>
      </main>
    </ConfigProvider>
  );
}
