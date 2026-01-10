'use client';

import React from 'react';
import { Typography, Space, Card, Tag } from 'antd';
import { HeartOutlined, StarOutlined } from '@ant-design/icons';
import NextImage from 'next/image';
import { suiInfo } from './SuiData';

const { Title, Text, Paragraph } = Typography;

const HomeModule = () => (
  <div className="animate-fade-in-up">
    <div className="relative mb-10 flex flex-col items-center">
      <div className="w-64 h-64 md:w-80 md:h-80 relative mb-6 group">
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
          <div className="absolute -top-4 -right-8 bg-[#DA5D77] text-white px-3 py-1 rounded-full text-xs font-bold shadow-lg rotate-12">银喉长尾山雀 🐦</div>
          <div className="absolute bottom-10 -left-10 bg-[#87EAFF] text-slate-900 px-3 py-1 rounded-full text-xs font-bold shadow-lg -rotate-12">小鸟公主 👑</div>
      </div>

      <div className="text-center max-w-2xl px-4">
        <div className="mb-2">
          <Tag color="blue" className="bg-blue-500/20 border-blue-500/30 text-blue-300 font-bold px-4 py-0.5 rounded-full">{suiInfo.name}</Tag>
        </div>
        <Title className="!text-white !mb-4 !text-5xl md:!text-7xl font-serif tracking-tight">
          {suiInfo.heroName}
        </Title>
        <Space size="middle" wrap className="mb-6 justify-center">
          <Tag color="cyan" className="border-none">{suiInfo.group}</Tag>
          <Tag color="magenta" className="border-none">{suiInfo.race}</Tag>
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
          <Title level={4} className="!text-cyan-300 !mb-4 flex items-center gap-2"><StarOutlined /> 新饼须知</Title>
          <div className="flex flex-col h-full py-2">
             <ul className="space-y-2 text-slate-300 text-sm">
                <li className="flex items-center gap-2">📅 上五休一，每晚7:40，左右</li>
                <li className="flex items-center gap-2">🍜 每周三 22:00 人头麦煮面</li>
                <li className="flex items-center gap-2">🎮 一三五七下午加播</li>
                <li className="flex items-center gap-2">🎵 主杂谈，小唱。然后游戏/同步视听</li>
             </ul>
          </div>
       </Card>
    </div>
  </div>
);

export default HomeModule;
