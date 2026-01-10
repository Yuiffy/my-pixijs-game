'use client';

import React from 'react';
import { Typography, Row, Col, Image as AntImage, Tabs, Tooltip, Tag } from 'antd';
import { PictureOutlined, StarOutlined, CoffeeOutlined } from '@ant-design/icons';
import { artworkMaterials } from './SuiData';

const { Title, Text } = Typography;

const GalleryModule = () => {
  const categories = [
    { key: 'cat', label: '小猫帽', cover: '/images/materials/岁己SUI小猫帽带饼干岁紫色外套双马尾.png' },
    { key: 'red', label: '小红帽', cover: '/images/materials/red/1d5ad005aff0b4b648a0f1ef6b8d0cd71954091502.png' },
    { key: 'blue', label: '小蓝帽', cover: '/images/materials/blue/5a2bcc519c33a2213134bdc196799d041954091502.png' },
    { key: 'flower', label: '小花帽', cover: '/images/materials/flower/cee3461dc483b51ac9befd4663c1235e1954091502.png' },
    { key: 'extra', label: '饼干岁/嘉嘉', cover: '/images/materials/biscuit/饼干岁2.png' },
    { key: 'bird', label: '本体/表情', cover: '/images/materials/bird/岁己_小鸟跳静态图.png' },
  ];

  return (
    <div className="animate-fade-in-up">
      <div className="mb-10">
        <Title level={2} className="!text-white !mb-2 flex items-center gap-3">
          <PictureOutlined className="text-pink-400" /> 角色素材库
        </Title>
        <Text className="text-slate-400">来自岁己多形态的精选材料，供各位饼干岁二创使用 ✨</Text>
      </div>

      <Tabs
        defaultActiveKey="cat"
        className="custom-gallery-tabs mb-10"
        items={categories.map(cat => ({
          key: cat.key,
          label: (
            <div className="flex flex-col items-center gap-2 group/tab py-2">
              <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-white/10 group-hover/tab:border-pink-500/50 transition-all shadow-lg relative bg-slate-800">
                <AntImage src={cat.cover} preview={false} className="w-full h-full object-cover object-top" />
              </div>
              <span className="text-[10px] md:text-xs font-bold tracking-tight opacity-60 group-hover:opacity-100 transition-opacity whitespace-nowrap">{cat.label}</span>
            </div>
          ),
          children: (
            <AntImage.PreviewGroup>
              <Row gutter={[20, 20]}>
                {(artworkMaterials[cat.key as keyof typeof artworkMaterials] || []).map((item, index) => (
                  <Col xs={12} md={8} lg={6} key={index}>
                    <div className="group relative rounded-3xl overflow-hidden border border-white/10 bg-gradient-to-b from-white/[0.03] to-white/[0.08] aspect-[3/4] hover:border-pink-500/50 transition-all cursor-pointer shadow-2xl flex items-center justify-center p-4">
                      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(135,234,255,0.05)_0%,transparent_70%)] opacity-0 group-hover:opacity-100 transition-opacity" />
                      <AntImage
                        src={item.src}
                        alt={item.title}
                        className="!h-full !w-full object-contain drop-shadow-[0_10px_20px_rgba(0,0,0,0.5)] group-hover:scale-105 transition-transform duration-500"
                        wrapperClassName="w-full h-full flex items-center justify-center"
                      />
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent p-5 opacity-0 group-hover:opacity-100 transition-all translate-y-2 group-hover:translate-y-0 flex items-end justify-between">
                        <div className="flex flex-col gap-1.5">
                          {item.tag && <Tag color="pink" className="w-fit text-[10px] px-2 py-0 border-none bg-pink-500/40 text-white rounded-full backdrop-blur-md">{item.tag}</Tag>}
                          <Text className="text-[11px] text-white font-bold tracking-wide">{item.title}</Text>
                        </div>
                        <Tooltip title="预览原图"><StarOutlined className="text-yellow-400 text-lg drop-shadow-glow" /></Tooltip>
                      </div>
                    </div>
                  </Col>
                ))}
                {/* Placeholder for "Moar" */}
                <Col xs={12} md={8} lg={6}>
                   <div className="flex flex-col items-center justify-center border-2 border-dashed border-white/10 rounded-3xl aspect-[3/4] hover:border-cyan-500/50 transition-all cursor-pointer group bg-black/20">
                      <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center mb-4 group-hover:bg-cyan-500/20 transition-all group-hover:rotate-12">
                        <CoffeeOutlined className="text-3xl text-slate-500 group-hover:text-cyan-300" />
                      </div>
                      <Text className="text-slate-500 group-hover:text-cyan-300 text-[10px] font-bold tracking-widest uppercase">Coming Soon</Text>
                   </div>
                </Col>
              </Row>
            </AntImage.PreviewGroup>
          )
        }))}
      />

      <div className="mt-12 p-6 bg-blue-900/10 border border-blue-500/20 rounded-2xl flex items-center gap-4">
         <div className="text-3xl text-blue-400">💡</div>
         <Text className="text-slate-400 italic">“所有素材均来源于网络及粉丝投稿，二创时请遵守官方相应准则的说！”</Text>
      </div>
    </div>
  );
};

export default GalleryModule;
