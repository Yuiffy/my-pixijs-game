'use client';

import React, { useState } from 'react';
import { Typography, Row, Col, Image as AntImage, Tabs, Tag } from 'antd';
import { PictureOutlined, CoffeeOutlined } from '@ant-design/icons';
import Image from 'next/image';
import { artworkMaterials } from './SuiData';

const { Title, Text } = Typography;

const galleryImageSizes =
  '(max-width: 767px) calc(50vw - 51px), (max-width: 991px) calc(33vw - 47px), 200px';

type ArtworkItem = { src: string; title: string; tag?: string };

function ArtworkCard({ item, onPreview }: { item: ArtworkItem; onPreview: () => void }) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const ready = status === 'ready';
  const failed = status === 'error';

  return (
    <div className="relative aspect-[3/4] rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.03] to-white/[0.08] shadow-2xl">
      {!ready && (
        <div
          className={`absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-3xl bg-[radial-gradient(ellipse_at_center,rgba(135,234,255,0.09),transparent_75%)] p-3 text-center ${failed ? 'z-10' : 'pointer-events-none'}`}
          aria-hidden={failed ? undefined : true}
          role={failed ? 'status' : undefined}
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-lg text-slate-400">
            <PictureOutlined aria-hidden="true" />
          </span>
          <span className="text-xs font-medium text-slate-300">{item.title}</span>
          <span className="text-[10px] text-slate-400">{failed ? '暂时无法显示缩略图' : '素材加载中'}</span>
          {failed && (
            <button
              type="button"
              className="rounded-lg px-2 py-1 text-xs text-sky-300 underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              onClick={onPreview}
              aria-label={`打开原图：${item.title}`}
            >
              打开原图
            </button>
          )}
        </div>
      )}
      <button
        type="button"
        className="group absolute inset-0 overflow-hidden rounded-3xl border border-transparent transition-colors enabled:cursor-zoom-in enabled:hover:border-pink-500/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink-400"
        onClick={onPreview}
        disabled={!ready}
        aria-hidden={!ready}
        aria-label={`预览原图：${item.title}`}
      >
        {!failed && (
          <div className="absolute inset-4">
            <Image
              src={item.src}
              alt=""
              fill
              sizes={galleryImageSizes}
              className={`object-contain drop-shadow-[0_10px_20px_rgba(0,0,0,0.5)] transition-[opacity,transform] duration-300 motion-reduce:transition-none motion-safe:group-hover:scale-105 ${ready ? 'opacity-100' : 'opacity-0'}`}
              onLoad={() => setStatus('ready')}
              onError={() => setStatus('error')}
            />
          </div>
        )}
        {ready && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex translate-y-2 items-end justify-between bg-gradient-to-t from-black/90 via-black/40 to-transparent p-5 opacity-0 transition-all group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100 motion-reduce:transition-none">
            <div className="flex flex-col items-start gap-1.5">
              {item.tag && <Tag color="pink" className="w-fit text-[10px] px-2 py-0 border-none bg-pink-500/40 text-white rounded-full backdrop-blur-md">{item.tag}</Tag>}
              <Text className="text-[11px] text-white font-bold tracking-wide">{item.title}</Text>
            </div>
          </div>
        )}
      </button>
    </div>
  );
}

function ArtworkAlbum({ items }: { items: ArtworkItem[] }) {
  const [visible, setVisible] = useState(false);
  const [current, setCurrent] = useState(0);

  return (
    <>
      {/* Thumbnails use the Next image optimizer; the viewer alone loads original artwork. */}
      <AntImage.PreviewGroup
        items={items.map(({ src, title }) => ({ src, alt: title }))}
        preview={{ visible, current, onVisibleChange: setVisible, onChange: setCurrent }}
      />
      <Row gutter={[20, 20]}>
        {items.map((item, index) => (
          <Col xs={12} md={8} lg={6} key={item.src}>
            <ArtworkCard
              item={item}
              onPreview={() => {
                setCurrent(index);
                setVisible(true);
              }}
            />
          </Col>
        ))}
        <Col xs={12} md={8} lg={6}>
          <div className="flex flex-col items-center justify-center border-2 border-dashed border-white/10 rounded-3xl aspect-[3/4] hover:border-cyan-500/50 transition-all cursor-pointer group bg-black/20">
            <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center mb-4 group-hover:bg-cyan-500/20 transition-all group-hover:rotate-12">
              <CoffeeOutlined className="text-3xl text-slate-500 group-hover:text-cyan-300" />
            </div>
            <Text className="text-slate-500 group-hover:text-cyan-300 text-[10px] font-bold tracking-widest uppercase">Coming Soon</Text>
          </div>
        </Col>
      </Row>
    </>
  );
}

const GalleryModule = () => {
  const categories = [
    { key: 'cat', label: '小猫帽', cover: '/images/materials/岁己SUI小猫帽带饼干岁紫色外套双马尾.png', objectPosition: 'top center' },
    { key: 'red', label: '小红帽', cover: '/images/materials/red/1d5ad005aff0b4b648a0f1ef6b8d0cd71954091502.png', objectPosition: 'top center' },
    { key: 'blue', label: '小蓝帽', cover: '/images/materials/blue/5a2bcc519c33a2213134bdc196799d041954091502.png', objectPosition: 'center 35%' },
    { key: 'flower', label: '小花帽', cover: '/images/materials/flower/6c6e83dad538cf0ba8434a417f6f343b1954091502.png', objectPosition: 'center center' },
    { key: 'extra', label: '饼干岁/嘉嘉', cover: '/images/materials/biscuit/饼干岁2.png', objectPosition: 'top center' },
    { key: 'bird', label: '本体/表情', cover: '/images/materials/bird/岁己_小鸟跳静态图.png', objectPosition: 'center center' },
  ];

  return (
    <div className="animate-fade-in-up">
      <div className="mb-6">
        <Title level={2} className="!text-white !mb-1 flex items-center gap-3">
          <PictureOutlined className="text-pink-400" /> 角色素材库
        </Title>
        <Text className="text-slate-400">来自岁己多形态的精选材料，供各位饼干岁二创使用 ✨</Text>
      </div>

      <Tabs
        defaultActiveKey="cat"
        className="custom-gallery-tabs mb-6"
        items={categories.map(cat => ({
          key: cat.key,
          label: (
            <div className="flex flex-col items-center gap-2 group/tab py-2">
              <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-white/10 group-hover/tab:border-pink-500/50 transition-all shadow-lg relative bg-slate-800">
                <Image
                  fill
                  sizes="96px"
                  src={cat.cover}
                  alt={cat.label}
                  className="object-cover"
                  style={{ objectPosition: cat.objectPosition || 'top center' }}
                />
              </div>
              <span className="text-[10px] md:text-xs font-bold tracking-tight opacity-60 group-hover:opacity-100 transition-opacity whitespace-nowrap">{cat.label}</span>
            </div>
          ),
          children: (
            <ArtworkAlbum items={artworkMaterials[cat.key as keyof typeof artworkMaterials]} />
          )
        }))}
      />

      <div className="mt-8 p-6 bg-blue-900/10 border border-blue-500/20 rounded-2xl flex items-center gap-4">
         <div className="text-3xl text-blue-400">💡</div>
         <Text className="text-slate-400 italic">“所有素材均来源于网络及粉丝投稿，二创时请遵守官方相应准则的说！”</Text>
      </div>
    </div>
  );
};

export default GalleryModule;
